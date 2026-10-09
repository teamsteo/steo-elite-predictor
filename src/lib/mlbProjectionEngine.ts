/**
 * MLB Projection Engine — V4-lite (Task 41, BADJAN V3 Phases 1+2)
 *
 * Engine statistique INDÉPENDANTE du marché (V3 règle d'or: "LE MATCH D'ABORD,
 * LA PROBABILITÉ ENSUITE, LA COTE EN DERNIER").
 *
 * Chaîne (BADJAN V3 en version lite, baseball):
 *   ESPN standings (runs marqués/concédés par match, gratuit, officiel)
 *   + MLB Stats API officielle (lanceurs partants probables RÉELS + ERA saison)
 *   → Régression vers la moyenne (shrinkage bayésien)
 *   → Forces attaque/défense ajustées adversaire + ajustement LANCEUR ADVERSE
 *     (impact amorti: le partant lance ~5-6 manches sur 9, le reste = staff)
 *   → λ runs attendus par équipe (modèle Poisson avec surdispersion)
 *   → P(victoire) via CDF normale de la marge (σ empirique MLB)
 *   → P(Over/Under ligne totale), P(run line ±1.5)
 *   → Intervalle d'incertitude 70% + shrinkage → fiabilité données (V3 étape 3)
 *
 * Garanties (identiques à l'engine NBA Task 34):
 *   - 100% SANS FRAIS: ESPN + MLB Stats API publics, déjà utilisés par le projet
 *   - SANS RISQUE DE BAN: aucune nouvelle source, caches longs (6h standings)
 *   - FAIL-CLOSED: toute donnée manquante/aberrante → null → comportement historique
 *   - KILL-SWITCH: env MLB_V4_LITE=false désactive l'engine sans redéploiement
 */

import { fetchMLBSchedule, fetchPitcherStats } from './mlbPitcherService';

// ============================================
// CONSTANTES EMPIRIQUES MLB (recalibrables via backtest Phase 4)
// ============================================

/** Avantage domicile MLB en runs attendus (multiplicatif ±3% ≈ ±0.13 run) */
export const HOME_FIELD_RUN_PCT = 0.03;
/** Force du prior ligue pour le shrinkage (alpha = gp/(gp+k)) */
export const SHRINK_PRIOR_GAMES = 10;
/** Surdispersion empirique: σ_total observé ≈ 1.35 × √(λ_total) (runs MLB) */
export const OVERDISP_TOTAL = 1.35;
/** Surdispersion marge: σ_marge ≈ 1.15 × √(λ_total) */
export const OVERDISP_MARGIN = 1.15;
/** Amortissement de l'impact du partant (il ne lance pas tout le match) */
export const STARTER_DAMPING = 0.55;
/** Cache des standings ESPN */
const STANDINGS_CACHE_TTL = 6 * 60 * 60 * 1000; // 6h

/** Bornes de sanité (rejet de valeurs aberrantes ESPN) */
const RUNS_MIN = 2.5, RUNS_MAX = 7.5; // runs pour/contre par match plausibles
const LAMBDA_MIN = 1.8, LAMBDA_MAX = 9.0; // λ de projection plausibles

// ============================================
// TYPES
// ============================================

export interface MLBEngineTeamStats {
  teamName: string;
  gamesPlayed: number;
  rsPerGame: number;      // runs marqués / match (réel ESPN)
  raPerGame: number;      // runs concédés / match (réel ESPN)
  wins: number;
  losses: number;
  // valeurs SHRINKÉES vers la moyenne ligue (utilisées pour la projection)
  attackAdj: number;
  defenseAdj: number;
  shrinkFactor: number;
}

export interface MLBLeagueAverages {
  runsPerGame: number;    // moyenne runs/équipe/match (= environnement ligue)
  teamsCounted: number;
}

export interface MLBEngineStarter {
  name: string;
  era: number;
  inningsPitched: number;
}

export interface MLBProjection {
  homeTeam: string;
  awayTeam: string;
  homeExpectedRuns: number;   // λ domicile
  awayExpectedRuns: number;   // λ extérieur
  expectedTotal: number;
  expectedMargin: number;     // λ_home − λ_away
  homeWinProb: number;
  awayWinProb: number;
  intervalTotal70: [number, number];
  intervalMargin70: [number, number];
  rsPerGameHome: number;
  raPerGameHome: number;
  rsPerGameAway: number;
  raPerGameAway: number;
  leagueAvgRuns: number;
  homeStarter: string | null; // lanceur partant RÉEL (info + facteur)
  awayStarter: string | null;
  starterFactorHome: number;  // multiplicateur appliqué à λ_home (1 = neutre)
  starterFactorAway: number;
  shrinkFactor: number;       // min des deux alphas + pénalité lanceurs manquants
  dataBasis: string;
}

export interface MLBMarketInput {
  total?: number | null;      // ligne Over/Under du marché (ex: 8.5)
}

export interface MLBMarketEdge {
  market: 'OVER' | 'UNDER' | 'RUN_HOME' | 'RUN_AWAY';
  line: number;
  probModel: number;
  edgePp: number;
  requiredEdgePp: number;
  decision: 'BET' | 'LEAN' | 'NO BET';
}

// ============================================
// FONCTIONS PURES (testées unitairement)
// ============================================

/** Régression vers la moyenne (V3): alpha = n/(n+k) */
export function shrinkRating(value: number, leagueAvg: number, gamesPlayed: number, k = SHRINK_PRIOR_GAMES): number {
  const alpha = gamesPlayed / (gamesPlayed + k);
  return alpha * value + (1 - alpha) * leagueAvg;
}

/** CDF normale standard — approximation Abramowitz & Stegun 7.1.26 */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-x * x / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/**
 * Facteur d'impact du lanceur partant adverse sur notre attaque.
 * ERA bon (bas) → facteur < 1 (on marque moins). ERA élevé → facteur > 1.
 * Amorti (STARTER_DAMPING) car le partant ne couvre pas tout le match,
 * puis fiabilisé par les manches lancées (peu d'IP → facteur → 1).
 */
export function starterImpactFactor(
  starterEra: number | null,
  starterIp: number,
  leagueAvgRuns: number
): number {
  if (starterEra == null || !Number.isFinite(starterEra) || starterEra <= 0) return 1;
  const raw = starterEra / Math.max(1, leagueAvgRuns);
  const clamped = Math.max(0.65, Math.min(1.40, raw));
  const damped = 1 + (clamped - 1) * STARTER_DAMPING;
  const reliability = Math.min(1, Math.max(0, starterIp) / 60); // 60 IP → pleine confiance
  return 1 + (damped - 1) * reliability;
}

/**
 * Projection centrale (pure — AUCUNE cote en entrée, V3 étapes 2-3):
 * λ = attaque propre × défense adverse / moyenne ligue × lanceur adverse × domicile.
 */
export function computeMLBProjection(
  home: MLBEngineTeamStats,
  away: MLBEngineTeamStats,
  league: MLBLeagueAverages,
  starters: { home: MLBEngineStarter | null; away: MLBEngineStarter | null } = { home: null, away: null }
): MLBProjection {
  const lg = Math.max(1, league.runsPerGame);

  // Base: attaque × défense adverse (déjà shrinkées)
  const baseHome = (home.attackAdj * away.defenseAdj) / lg;
  const baseAway = (away.attackAdj * home.defenseAdj) / lg;

  // Lanceur partant ADVERSE module notre attaque (dampé + fiabilisé par IP)
  const starterFactorHome = starterImpactFactor(starters.away?.era ?? null, starters.away?.inningsPitched ?? 0, lg);
  const starterFactorAway = starterImpactFactor(starters.home?.era ?? null, starters.home?.inningsPitched ?? 0, lg);

  // Avantage domicile multiplicatif (±3%)
  const lambdaHome = clamp(baseHome * starterFactorHome * (1 + HOME_FIELD_RUN_PCT), LAMBDA_MIN, LAMBDA_MAX);
  const lambdaAway = clamp(baseAway * starterFactorAway * (1 - HOME_FIELD_RUN_PCT), LAMBDA_MIN, LAMBDA_MAX);

  const expectedTotal = lambdaHome + lambdaAway;
  const expectedMargin = lambdaHome - lambdaAway;

  // Fiabilité: shrinkage équipes + pénalité si lanceurs manquants
  let shrinkFactor = Math.min(home.shrinkFactor, away.shrinkFactor);
  if (!starters.home || !starters.away) shrinkFactor *= 0.8;

  const sigmaTotal = sigmaTotalFor(expectedTotal, shrinkFactor);
  const sigmaMargin = sigmaMarginFor(expectedTotal, shrinkFactor);
  const q70 = 1.036; // Φ⁻¹(0.85)

  const homeWinProb = clamp(normalCdf(expectedMargin / Math.max(0.5, sigmaMargin)), 0.02, 0.98);

  return {
    homeTeam: home.teamName,
    awayTeam: away.teamName,
    homeExpectedRuns: round2(lambdaHome),
    awayExpectedRuns: round2(lambdaAway),
    expectedTotal: round2(expectedTotal),
    expectedMargin: round2(expectedMargin),
    homeWinProb: round3(homeWinProb),
    awayWinProb: round3(1 - homeWinProb),
    intervalTotal70: [
      Math.round(expectedTotal - q70 * sigmaTotal),
      Math.round(expectedTotal + q70 * sigmaTotal),
    ],
    intervalMargin70: [
      Math.round((expectedMargin - q70 * sigmaMargin) * 10) / 10,
      Math.round((expectedMargin + q70 * sigmaMargin) * 10) / 10,
    ],
    rsPerGameHome: round2(home.rsPerGame),
    raPerGameHome: round2(home.raPerGame),
    rsPerGameAway: round2(away.rsPerGame),
    raPerGameAway: round2(away.raPerGame),
    leagueAvgRuns: round2(lg),
    homeStarter: starters.home?.name ?? null,
    awayStarter: starters.away?.name ?? null,
    starterFactorHome: round3(starterFactorHome),
    starterFactorAway: round3(starterFactorAway),
    shrinkFactor: round3(shrinkFactor),
    dataBasis: '',
  };
}

/** σ total (runs) élargi selon incertitude (V3 §12: début de saison → plus large) */
export function sigmaTotalFor(expectedTotal: number, shrinkFactor: number): number {
  const base = Math.sqrt(Math.max(0.5, expectedTotal)) * OVERDISP_TOTAL;
  const uncertainty = Math.max(0, Math.min(1, 1 - shrinkFactor));
  return base * (1 + uncertainty * 0.15);
}

/** σ marge (runs) élargi selon incertitude */
export function sigmaMarginFor(expectedTotal: number, shrinkFactor: number): number {
  const base = Math.sqrt(Math.max(0.5, expectedTotal)) * OVERDISP_MARGIN;
  const uncertainty = Math.max(0, Math.min(1, 1 - shrinkFactor));
  return base * (1 + uncertainty * 0.15);
}

/** Seuil d'edge adaptatif en points de probabilité (V3: incertitude → seuil plus haut) */
export function requiredEdgePp(shrinkFactor: number): number {
  const uncertainty = Math.max(0, Math.min(1, 1 - shrinkFactor));
  return 3.5 + uncertainty * 4.0; // [3.5 .. 7.5] pp
}

/**
 * Évaluation des marchés MLB (V3 étapes 5-7 côté marchés secondaires):
 * P(engine) vs base 50%, edge adaptatif selon incertitude, décision BET/LEAN/NO BET.
 */
export function evaluateMLBMarketEdges(proj: MLBProjection, market: MLBMarketInput): MLBMarketEdge[] {
  const edges: MLBMarketEdge[] = [];
  const req = requiredEdgePp(proj.shrinkFactor);

  const expectedTotal = proj.homeExpectedRuns + proj.awayExpectedRuns;
  const expectedMargin = proj.homeExpectedRuns - proj.awayExpectedRuns;
  const sigmaTotal = sigmaTotalFor(expectedTotal, proj.shrinkFactor);
  const sigmaMargin = sigmaMarginFor(expectedTotal, proj.shrinkFactor);

  // ── Over/Under total ──
  if (market.total != null && Number.isFinite(market.total)) {
    const line = market.total;
    const pOver = 1 - normalCdf((line - expectedTotal) / Math.max(0.3, sigmaTotal));
    const pUnder = 1 - pOver;
    const bestOver = pOver >= pUnder;
    const p = bestOver ? pOver : pUnder;
    const edgePp = (p - 0.5) * 100;
    edges.push({
      market: bestOver ? 'OVER' : 'UNDER',
      line,
      probModel: round3(p),
      edgePp: Math.round(edgePp * 10) / 10,
      requiredEdgePp: req,
      decision: edgePp >= req ? 'BET' : edgePp >= req * 0.6 ? 'LEAN' : 'NO BET',
    });
  }

  // ── Run line ±1.5 ──
  const pHomeCover = 1 - normalCdf((1.5 - expectedMargin) / Math.max(0.3, sigmaMargin));
  const pAwayCover = 1 - pHomeCover;
  const homeBest = pHomeCover >= pAwayCover;
  const pRun = homeBest ? pHomeCover : pAwayCover;
  const edgeRun = (pRun - 0.5) * 100;
  edges.push({
    market: homeBest ? 'RUN_HOME' : 'RUN_AWAY',
    line: 1.5,
    probModel: round3(pRun),
    edgePp: Math.round(edgeRun * 10) / 10,
    requiredEdgePp: req + 1.5, // run line = variance élevée → seuil renforcé
    decision: edgeRun >= req + 1.5 ? 'BET' : edgeRun >= (req + 1.5) * 0.6 ? 'LEAN' : 'NO BET',
  });

  return edges;
}

// ============================================
// CHARGEMENT DES DONNÉES (ESPN standings cache 6h + lanceurs réels)
// ============================================

let standingsCache: { teams: Map<string, MLBEngineTeamStats>; league: MLBLeagueAverages; timestamp: number } | null = null;

/** avgPointsFor/avgPointsAgainst en standings MLB ESPN = runs par match (vérifié: NYY 4.6/3.7) */
export async function loadMLBEngineStats(): Promise<{ teams: Map<string, MLBEngineTeamStats>; league: MLBLeagueAverages } | null> {
  if (standingsCache && Date.now() - standingsCache.timestamp < STANDINGS_CACHE_TTL) {
    return { teams: standingsCache.teams, league: standingsCache.league };
  }

  try {
    const res = await fetch('https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings', {
      next: { revalidate: 21600 },
    });
    if (!res.ok) {
      console.log(`⚠️ [MLB Engine] ESPN standings HTTP ${res.status}`);
      return standingsCache ? { teams: standingsCache.teams, league: standingsCache.league } : null;
    }
    const data = await res.json();

    const teams = new Map<string, MLBEngineTeamStats>();
    const rsRates: number[] = [];

    // Passe 1: collecter les taux valides pour la moyenne ligue
    interface Parsed { name: string; gp: number; rsPg: number; raPg: number; wins: number; losses: number }
    const parsed: Parsed[] = [];

    for (const child of data.children || []) {
      for (const entry of child?.standings?.entries || []) {
        const teamName = entry?.team?.displayName;
        if (!teamName) continue;
        const stats: Record<string, any> = {};
        for (const s of entry.stats || []) stats[s.name] = s.value ?? s.displayValue;

        const gp = Number(stats['gamesPlayed']) || 0;
        const rsPg = Number(stats['avgPointsFor']) || 0;     // runs marqués / match
        const raPg = Number(stats['avgPointsAgainst']) || 0; // runs concédés / match
        if (gp < 1 || rsPg <= 0 || raPg <= 0) continue;
        if (!Number.isFinite(rsPg) || !Number.isFinite(raPg)) continue;
        if (rsPg < RUNS_MIN || rsPg > RUNS_MAX || raPg < RUNS_MIN || raPg > RUNS_MAX) continue;

        parsed.push({
          name: teamName,
          gp,
          rsPg,
          raPg,
          wins: Number(stats['wins']) || 0,
          losses: Number(stats['losses']) || 0,
        });
        rsRates.push(rsPg);
      }
    }

    if (parsed.length < 20) {
      console.log(`⚠️ [MLB Engine] standings incomplets: ${parsed.length} équipes (<20)`);
      return standingsCache ? { teams: standingsCache.teams, league: standingsCache.league } : null;
    }

    const leagueAvg = rsRates.reduce((s, v) => s + v, 0) / Math.max(1, rsRates.length);

    for (const p of parsed) {
      const alpha = p.gp / (p.gp + SHRINK_PRIOR_GAMES);
      teams.set(p.name, {
        teamName: p.name,
        gamesPlayed: p.gp,
        rsPerGame: p.rsPg,
        raPerGame: p.raPg,
        wins: p.wins,
        losses: p.losses,
        attackAdj: shrinkRating(p.rsPg, leagueAvg, p.gp),
        defenseAdj: shrinkRating(p.raPg, leagueAvg, p.gp),
        shrinkFactor: alpha,
      });
    }

    const league = { runsPerGame: leagueAvg, teamsCounted: teams.size };
    standingsCache = { teams, league, timestamp: Date.now() };
    console.log(`✅ [MLB Engine] standings chargés: ${teams.size} équipes, moyenne ${leagueAvg.toFixed(2)} runs/équipe/match`);
    return { teams, league };
  } catch (e) {
    console.log('⚠️ [MLB Engine] erreur chargement standings (fail-closed):', e);
    return standingsCache ? { teams: standingsCache.teams, league: standingsCache.league } : null;
  }
}

/**
 * Lanceurs partants probables RÉELS (MLB Stats API) pour un matchup.
 * Retourne des nulls tolérants — l'engine reste utilisable sans lanceurs
 * (facteur neutre, σ élargi, fiabilité réduite).
 */
export async function getMLBStarters(
  homeTeam: string,
  awayTeam: string,
  date?: string
): Promise<{ home: MLBEngineStarter | null; away: MLBEngineStarter | null }> {
  const out = { home: null as MLBEngineStarter | null, away: null as MLBEngineStarter | null };
  try {
    const games = await fetchMLBSchedule(date);
    const game = findGame(games, homeTeam, awayTeam);
    if (!game) return out;

    const [homeStats, awayStats] = await Promise.all([
      game.teams.home.probablePitcher ? fetchPitcherStats(game.teams.home.probablePitcher.id) : Promise.resolve(null),
      game.teams.away.probablePitcher ? fetchPitcherStats(game.teams.away.probablePitcher.id) : Promise.resolve(null),
    ]);

    if (game.teams.home.probablePitcher) {
      out.home = {
        name: game.teams.home.probablePitcher.fullName,
        era: homeStats?.era ?? 0,
        inningsPitched: homeStats?.inningsPitched ?? 0,
      };
    }
    if (game.teams.away.probablePitcher) {
      out.away = {
        name: game.teams.away.probablePitcher.fullName,
        era: awayStats?.era ?? 0,
        inningsPitched: awayStats?.inningsPitched ?? 0,
      };
    }
  } catch {
    // fail-soft: lanceurs indisponibles → facteurs neutres
  }
  return out;
}

// ============================================
// POINT D'ENTRÉE PRINCIPAL
// ============================================

/**
 * Projection V4-lite pour un match MLB.
 * Retourne null si l'engine est désactivée ou si les données sont insuffisantes
 * (fail-closed: le pipeline garde alors son comportement historique).
 */
export async function getMLBProjection(homeTeam: string, awayTeam: string, date?: string): Promise<MLBProjection | null> {
  if (process.env.MLB_V4_LITE === 'false') return null;
  if (!homeTeam || !awayTeam) return null;

  try {
    const loaded = await loadMLBEngineStats();
    if (!loaded) return null;

    const home = resolveTeam(homeTeam, loaded.teams);
    const away = resolveTeam(awayTeam, loaded.teams);
    if (!home || !away || home.teamName === away.teamName) return null;

    const starters = await getMLBStarters(homeTeam, awayTeam, date);
    const proj = computeMLBProjection(home, away, loaded.league, starters);
    const starterInfo = starters.home && starters.away
      ? `partants ${starters.away.name} (${starters.away.era.toFixed(2)}) @ ${starters.home.name} (${starters.home.era.toFixed(2)})`
      : 'partants n/d';
    proj.dataBasis = `ESPN standings MLB, ${home.gamesPlayed}M/${away.gamesPlayed}M, ${loaded.league.teamsCounted} équipes, moy. ${loaded.league.runsPerGame.toFixed(2)} runs, ${starterInfo}`;
    return proj;
  } catch {
    return null; // fail-closed absolu
  }
}

/** Évaluation des marchés MLB si une ligne totale est disponible */
export function getMLBMarketEdges(proj: MLBProjection, market: MLBMarketInput): MLBMarketEdge[] {
  return evaluateMLBMarketEdges(proj, market);
}

// ============================================
// UTILS
// ============================================

/** Résolution tolérante d'un nom d'équipe vers les stats engine */
function resolveTeam(name: string, data: Map<string, MLBEngineTeamStats>): MLBEngineTeamStats | null {
  const direct = data.get(name);
  if (direct) return direct;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const target = norm(name || '');
  if (!target) return null;
  for (const t of data.values()) {
    if (norm(t.teamName) === target) return t;
  }
  for (const t of data.values()) {
    const nt = norm(t.teamName);
    if (nt.includes(target) || target.includes(nt)) return t;
  }
  return null;
}

/** Recherche du match dans le schedule MLB Stats API (matching tolérant) */
function findGame(games: Array<any>, homeTeam: string, awayTeam: string): any | null {
  const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z]/g, '');
  const targetH = norm(homeTeam);
  const targetA = norm(awayTeam);
  for (const g of games || []) {
    const gh = norm(g?.teams?.home?.team?.name);
    const ga = norm(g?.teams?.away?.team?.name);
    const matchH = gh === targetH || (gh.length > 4 && (gh.includes(targetH) || targetH.includes(gh)));
    const matchA = ga === targetA || (ga.length > 4 && (ga.includes(targetA) || targetA.includes(ga)));
    if (matchH && matchA) return g;
  }
  return null;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
