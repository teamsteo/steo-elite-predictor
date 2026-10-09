/**
 * NHL Projection Engine — V4-lite (Task 41, BADJAN V3 Phases 1+2)
 *
 * Engine statistique INDÉPENDANTE du marché (V3 règle d'or: "LE MATCH D'ABORD,
 * LA PROBABILITÉ ENSUITE, LA COTE EN DERNIER").
 *
 * Chaîne (BADJAN V3 en version lite, hockey):
 *   ESPN standings (gratuit, officiel, domaine déjà utilisé partout = 0 ban)
 *   → Buts pour/contre par match RÉELS (pointsFor/pointsAgainst = buts, vérifié)
 *   → Régression vers la moyenne (shrinkage bayésien, V3 §historique)
 *   → Forces attaque/défense ajustées adversaire (modèle de base Poisson)
 *   → Distribution exacte du score: convolution Poisson (Skellam implicite)
 *   → P(victoire domicile/extérieur) avec prolongation/TAB répartie 52/48 (HCA OT)
 *   → P(Over/Under ligne totale) par convolution exacte
 *   → P(puck line ±1.5) via grille de scores
 *   → Intervalle d'incertitude 70% + shrinkage → fiabilité données (V3 étape 3)
 *
 * Garanties (identiques à l'engine NBA Task 34):
 *   - 100% SANS FRAIS: uniquement des endpoints ESPN publics déjà utilisés
 *   - SANS RISQUE DE BAN: aucune nouvelle source externe, aucun scraping; cache 6h
 *   - FAIL-CLOSED: toute donnée manquante/aberrante → null → comportement historique
 *   - KILL-SWITCH: env NHL_V4_LITE=false désactive l'engine sans redéploiement
 */

// ============================================
// CONSTANTES EMPIRIQUES NHL (recalibrables via backtest Phase 4)
// ============================================

/** Avantage domicile NHL en buts attendus (multiplicatif ±3.5% ≈ ±0.11 but) */
export const HOME_ICE_GOAL_PCT = 0.035;
/** Force du prior ligue pour le shrinkage (alpha = gp/(gp+k)) */
export const SHRINK_PRIOR_GAMES = 10;
/** P(victoire domicile | égalité après 60 min) — HCA en prolongation/TAB */
export const HOME_OT_TIE_SPLIT = 0.52;
/** Cache des standings ESPN (les stats équipe évoluent lentement) */
const STANDINGS_CACHE_TTL = 6 * 60 * 60 * 1000; // 6h

/** Bornes de sanité (rejet de valeurs aberrantes ESPN) */
const GOALS_MIN = 1.8, GOALS_MAX = 4.8; // buts pour/contre par match plausibles
const LAMBDA_MIN = 1.3, LAMBDA_MAX = 6.5; // λ de projection plausibles
const GOALS_GRID = 14; // grille de convolution: 0..14 buts par équipe

// ============================================
// TYPES
// ============================================

export interface NHLEngineTeamStats {
  teamName: string;
  gamesPlayed: number;
  gfPerGame: number;      // buts pour / match (réel ESPN)
  gaPerGame: number;      // buts contre / match (réel ESPN)
  wins: number;
  losses: number;
  otLosses: number;
  last10Wins: number;     // forme récente (information)
  // valeurs SHRINKÉES vers la moyenne ligue (utilisées pour la projection)
  attackAdj: number;      // buts/match ajustés
  defenseAdj: number;     // buts/match ajustés
  shrinkFactor: number;   // alpha = gp/(gp+k)
}

export interface NHLLeagueAverages {
  goalsPerGame: number;   // moyenne buts/équipe/match
  teamsCounted: number;
}

export interface NHLProjection {
  homeTeam: string;
  awayTeam: string;
  homeExpectedGoals: number;  // λ domicile
  awayExpectedGoals: number;  // λ extérieur
  expectedTotal: number;
  expectedMargin: number;     // λ_home − λ_away
  homeWinProb: number;        // inclut OT/TAB (moneyline)
  awayWinProb: number;
  regTieProb: number;         // P(égalité après 60 min)
  intervalTotal70: [number, number];
  intervalMargin70: [number, number];
  gfPerGameHome: number;
  gaPerGameHome: number;
  gfPerGameAway: number;
  gaPerGameAway: number;
  leagueAvgGoals: number;
  shrinkFactor: number;       // min des deux alphas (pire cas)
  dataBasis: string;
}

export interface NHLMarketInput {
  total?: number | null;      // ligne Over/Under du marché (ex: 6.5)
}

export interface NHLMarketEdge {
  market: 'OVER' | 'UNDER' | 'PUCK_HOME' | 'PUCK_AWAY';
  line: number;
  probModel: number;          // probabilité engine de l'issue retenue
  edgePp: number;             // edge en points de probabilité vs base
  requiredEdgePp: number;     // seuil adaptatif selon incertitude
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

/** PMF Poisson P(X = k | λ) — stable (log-exp) */
export function poissonPmf(lambda: number, k: number): number {
  if (k < 0) return 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

/**
 * Probabilité de victoire domicile via convolution Poisson exacte.
 * P(win) = P(H > A) + P(H = A) × split_OT, split = fraction de l'égalité gagnée
 * par le domicile (moneyline inclut prolongation/TAB).
 */
export function homeWinProbability(
  lambdaHome: number,
  lambdaAway: number,
  tieSplit = HOME_OT_TIE_SPLIT
): { homeWinProb: number; awayWinProb: number; tieProb: number; pHomeCover15: number; pAwayCover15: number } {
  const pH = new Array<number>(GOALS_GRID + 1).fill(0);
  const pA = new Array<number>(GOALS_GRID + 1).fill(0);
  let sumH = 0, sumA = 0;
  for (let i = 0; i <= GOALS_GRID; i++) {
    pH[i] = poissonPmf(lambdaHome, i);
    pA[i] = poissonPmf(lambdaAway, i);
    sumH += pH[i];
    sumA += pA[i];
  }
  // Normalisation (la grille tronque à ~1e-6 près)
  for (let i = 0; i <= GOALS_GRID; i++) { pH[i] /= sumH; pA[i] /= sumA; }

  let pHomeReg = 0, pTie = 0, pHomeCover = 0;
  for (let h = 0; h <= GOALS_GRID; h++) {
    for (let a = 0; a <= GOALS_GRID; a++) {
      const p = pH[h] * pA[a];
      if (h > a) {
        pHomeReg += p;
        if (h - a >= 2) pHomeCover += p;
      } else if (h === a) {
        pTie += p;
      }
    }
  }
  const homeWin = pHomeReg + pTie * tieSplit;
  const awayWin = (1 - pHomeReg - pTie) + pTie * (1 - tieSplit);
  return {
    homeWinProb: homeWin,
    awayWinProb: awayWin,
    tieProb: pTie,
    pHomeCover15: pHomeCover,
    pAwayCover15: 1 - pHomeCover - pTie,
  };
}

/**
 * P(total buts > ligne) via convolution exacte du total.
 * La ligne .5 du marché rend l'égalité impossible (total ≠ ligne).
 */
export function probOverTotal(lambdaHome: number, lambdaAway: number, line: number): number {
  const pH = new Array<number>(GOALS_GRID + 1).fill(0);
  const pA = new Array<number>(GOALS_GRID + 1).fill(0);
  let sumH = 0, sumA = 0;
  for (let i = 0; i <= GOALS_GRID; i++) {
    pH[i] = poissonPmf(lambdaHome, i);
    pA[i] = poissonPmf(lambdaAway, i);
    sumH += pH[i];
    sumA += pA[i];
  }
  for (let i = 0; i <= GOALS_GRID; i++) { pH[i] /= sumH; pA[i] /= sumA; }

  let pOver = 0;
  for (let h = 0; h <= GOALS_GRID; h++) {
    for (let a = 0; a <= GOALS_GRID; a++) {
      if (h + a > line) pOver += pH[h] * pA[a];
    }
  }
  return pOver;
}

/** Seuil d'edge adaptatif en points de probabilité (V3: plus d'incertitude → seuil plus haut) */
export function requiredEdgePp(shrinkFactor: number): number {
  const uncertainty = Math.max(0, Math.min(1, 1 - shrinkFactor));
  return 3.5 + uncertainty * 4.0; // [3.5 .. 7.5] pp
}

/** Intervalle 70%: total ~ Normal(total, σ_poisson élargi) */
export function widenedSigmaTotal(expectedTotal: number, shrinkFactor: number): number {
  const sigmaPoisson = Math.sqrt(Math.max(0.5, expectedTotal));
  const uncertainty = Math.max(0, Math.min(1, 1 - shrinkFactor));
  return sigmaPoisson * 1.05 * (1 + uncertainty * 0.20);
}

/**
 * Projection centrale (pure — AUCUNE cote en entrée, V3 étapes 2-3):
 * λ_attendu = attaque propre × défense adverse / moyenne ligue, ajustée domicile.
 */
export function computeNHLProjection(
  home: NHLEngineTeamStats,
  away: NHLEngineTeamStats,
  league: NHLLeagueAverages
): NHLProjection {
  // Ajustement adversaire multiplicatif vs moyenne ligue
  const baseHome = (home.attackAdj * away.defenseAdj) / Math.max(0.5, league.goalsPerGame);
  const baseAway = (away.attackAdj * home.defenseAdj) / Math.max(0.5, league.goalsPerGame);

  // Avantage domicile multiplicative (±3.5%)
  const lambdaHome = baseHome * (1 + HOME_ICE_GOAL_PCT);
  const lambdaAway = baseAway * (1 - HOME_ICE_GOAL_PCT);

  const expectedTotal = lambdaHome + lambdaAway;
  const expectedMargin = lambdaHome - lambdaAway;

  const shrinkFactor = Math.min(home.shrinkFactor, away.shrinkFactor);
  const dist = homeWinProbability(lambdaHome, lambdaAway);

  const sigmaTotal = widenedSigmaTotal(expectedTotal, shrinkFactor);
  const q70 = 1.036; // Φ⁻¹(0.85)

  return {
    homeTeam: home.teamName,
    awayTeam: away.teamName,
    homeExpectedGoals: round2(lambdaHome),
    awayExpectedGoals: round2(lambdaAway),
    expectedTotal: round2(expectedTotal),
    expectedMargin: round2(expectedMargin),
    homeWinProb: round3(clamp(dist.homeWinProb, 0.02, 0.98)),
    awayWinProb: round3(clamp(dist.awayWinProb, 0.02, 0.98)),
    regTieProb: round3(dist.tieProb),
    intervalTotal70: [
      Math.round(expectedTotal - q70 * sigmaTotal),
      Math.round(expectedTotal + q70 * sigmaTotal),
    ],
    intervalMargin70: [
      Math.round((expectedMargin - q70 * sigmaTotal) * 10) / 10,
      Math.round((expectedMargin + q70 * sigmaTotal) * 10) / 10,
    ],
    gfPerGameHome: round2(home.gfPerGame),
    gaPerGameHome: round2(home.gaPerGame),
    gfPerGameAway: round2(away.gfPerGame),
    gaPerGameAway: round2(away.gaPerGame),
    leagueAvgGoals: round2(league.goalsPerGame),
    shrinkFactor: round3(shrinkFactor),
    dataBasis: '',
  };
}

/**
 * Évaluation des marchés NHL (V3 étapes 5-7 côté marchés secondaires):
 * P(engine) vs base 50%, edge adaptatif selon incertitude, décision BET/LEAN/NO BET.
 */
export function evaluateNHLMarketEdges(proj: NHLProjection, market: NHLMarketInput): NHLMarketEdge[] {
  const edges: NHLMarketEdge[] = [];
  const req = requiredEdgePp(proj.shrinkFactor);
  const lambdaH = proj.homeExpectedGoals;
  const lambdaA = proj.awayExpectedGoals;

  // ── Over/Under total ──
  if (market.total != null && Number.isFinite(market.total)) {
    const line = market.total;
    const pOver = probOverTotal(lambdaH, lambdaA, line);
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

  // ── Puck line ±1.5 ──
  const dist = homeWinProbability(lambdaH, lambdaA);
  const pHomeCover = dist.pHomeCover15;
  const pAwayCover = dist.pAwayCover15;
  const homeBest = pHomeCover >= pAwayCover;
  const pPuck = homeBest ? pHomeCover : pAwayCover;
  const edgePuck = (pPuck - 0.5) * 100;
  edges.push({
    market: homeBest ? 'PUCK_HOME' : 'PUCK_AWAY',
    line: 1.5,
    probModel: round3(pPuck),
    edgePp: Math.round(edgePuck * 10) / 10,
    requiredEdgePp: req + 1.5, // puck line = variance élevée → seuil renforcé
    decision: edgePuck >= req + 1.5 ? 'BET' : edgePuck >= (req + 1.5) * 0.6 ? 'LEAN' : 'NO BET',
  });

  return edges;
}

// ============================================
// CHARGEMENT DES DONNÉES ESPN (cache 6h, 0 frais)
// ============================================

interface RawEntry {
  teamName: string;
  gamesPlayed: number;
  gf: number;
  ga: number;
  wins: number;
  losses: number;
  otLosses: number;
  last10Wins: number;
}

let standingsCache: { teams: Map<string, NHLEngineTeamStats>; league: NHLLeagueAverages; timestamp: number } | null = null;

/** Points for/against en standings NHL ESPN = BUTS pour/contre (différentiel vérifié) */
export async function loadNHLEngineStats(): Promise<{ teams: Map<string, NHLEngineTeamStats>; league: NHLLeagueAverages } | null> {
  if (standingsCache && Date.now() - standingsCache.timestamp < STANDINGS_CACHE_TTL) {
    return { teams: standingsCache.teams, league: standingsCache.league };
  }

  try {
    const res = await fetch('https://site.api.espn.com/apis/v2/sports/hockey/nhl/standings', {
      next: { revalidate: 21600 },
    });
    if (!res.ok) {
      console.log(`⚠️ [NHL Engine] ESPN standings HTTP ${res.status}`);
      return standingsCache ? { teams: standingsCache.teams, league: standingsCache.league } : null;
    }
    const data = await res.json();

    const raws: RawEntry[] = [];
    for (const child of data.children || []) {
      for (const entry of child?.standings?.entries || []) {
        const teamName = entry?.team?.displayName;
        if (!teamName) continue;
        const stats: Record<string, any> = {};
        for (const s of entry.stats || []) stats[s.name] = s.value ?? s.displayValue;

        const gp = Number(stats['gamesPlayed']) || 0;
        const gf = Number(stats['pointsFor']) || 0;      // buts pour
        const ga = Number(stats['pointsAgainst']) || 0;  // buts contre
        if (gp < 1 || gf <= 0 || ga <= 0) continue;

        const last10 = String(stats['Last Ten Games'] || '');
        const last10Wins = /^\s*(\d+)/.exec(last10) ? Number(/^\s*(\d+)/.exec(last10)![1]) : 0;

        raws.push({
          teamName,
          gamesPlayed: gp,
          gf,
          ga,
          wins: Number(stats['wins']) || 0,
          losses: Number(stats['losses']) || 0,
          otLosses: Number(stats['otLosses']) || Number(stats['overtimeLosses']) || 0,
          last10Wins,
        });
      }
    }

    if (raws.length < 20) {
      // ligue incomplete → données non fiables (fail-closed)
      console.log(`⚠️ [NHL Engine] standings incomplets: ${raws.length} équipes (<20)`);
      return standingsCache ? { teams: standingsCache.teams, league: standingsCache.league } : null;
    }

    const teams = new Map<string, NHLEngineTeamStats>();
    const gfRates: number[] = [];
    for (const r of raws) {
      const gfPg = r.gf / r.gamesPlayed;
      const gaPg = r.ga / r.gamesPlayed;
      // Sanité: rejet des valeurs aberrantes
      if (!Number.isFinite(gfPg) || !Number.isFinite(gaPg)) continue;
      if (gfPg < GOALS_MIN || gfPg > GOALS_MAX || gaPg < GOALS_MIN || gaPg > GOALS_MAX) continue;
      gfRates.push(gfPg);
    }
    const leagueAvg = gfRates.reduce((s, v) => s + v, 0) / Math.max(1, gfRates.length);

    for (const r of raws) {
      const gfPg = r.gf / r.gamesPlayed;
      const gaPg = r.ga / r.gamesPlayed;
      if (gfPg < GOALS_MIN || gfPg > GOALS_MAX || gaPg < GOALS_MIN || gaPg > GOALS_MAX) continue;
      const alpha = r.gamesPlayed / (r.gamesPlayed + SHRINK_PRIOR_GAMES);
      teams.set(r.teamName, {
        teamName: r.teamName,
        gamesPlayed: r.gamesPlayed,
        gfPerGame: gfPg,
        gaPerGame: gaPg,
        wins: r.wins,
        losses: r.losses,
        otLosses: r.otLosses,
        last10Wins: r.last10Wins,
        attackAdj: shrinkRating(gfPg, leagueAvg, r.gamesPlayed),
        defenseAdj: shrinkRating(gaPg, leagueAvg, r.gamesPlayed),
        shrinkFactor: alpha,
      });
    }

    const league = { goalsPerGame: leagueAvg, teamsCounted: teams.size };
    standingsCache = { teams, league, timestamp: Date.now() };
    console.log(`✅ [NHL Engine] standings chargés: ${teams.size} équipes, moyenne ${leagueAvg.toFixed(2)} buts/équipe/match`);
    return { teams, league };
  } catch (e) {
    console.log('⚠️ [NHL Engine] erreur chargement standings (fail-closed):', e);
    return standingsCache ? { teams: standingsCache.teams, league: standingsCache.league } : null;
  }
}

// ============================================
// POINT D'ENTRÉE PRINCIPAL
// ============================================

/**
 * Projection V4-lite pour un match NHL.
 * Retourne null si l'engine est désactivée ou si les données sont insuffisantes
 * (fail-closed: le pipeline garde alors son comportement historique).
 */
export async function getNHLProjection(homeTeam: string, awayTeam: string): Promise<NHLProjection | null> {
  if (process.env.NHL_V4_LITE === 'false') return null;
  if (!homeTeam || !awayTeam) return null;

  try {
    const loaded = await loadNHLEngineStats();
    if (!loaded) return null;

    const home = resolveTeam(homeTeam, loaded.teams);
    const away = resolveTeam(awayTeam, loaded.teams);
    if (!home || !away || home.teamName === away.teamName) return null;

    const proj = computeNHLProjection(home, away, loaded.league);
    proj.dataBasis = `ESPN standings NHL, ${home.gamesPlayed}M/${away.gamesPlayed}M, ${loaded.league.teamsCounted} équipes, moy. ${loaded.league.goalsPerGame.toFixed(2)} buts`;
    return proj;
  } catch {
    return null; // fail-closed absolu
  }
}

/** Évaluation des marchés NHL si une ligne totale est disponible */
export function getNHLMarketEdges(proj: NHLProjection, market: NHLMarketInput): NHLMarketEdge[] {
  return evaluateNHLMarketEdges(proj, market);
}

// ============================================
// UTILS
// ============================================

/** Résolution tolérante d'un nom d'équipe vers les stats engine */
function resolveTeam(name: string, data: Map<string, NHLEngineTeamStats>): NHLEngineTeamStats | null {
  const direct = data.get(name);
  if (direct) return direct;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const target = norm(name || '');
  if (!target) return null;
  for (const t of data.values()) {
    if (norm(t.teamName) === target) return t;
  }
  // correspondance partielle (ex: "Toronto" ⊂ "Toronto Maple Leafs")
  for (const t of data.values()) {
    const nt = norm(t.teamName);
    if (nt.includes(target) || target.includes(nt)) return t;
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
