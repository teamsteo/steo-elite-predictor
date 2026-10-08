/**
 * NBA Projection Engine — V4-lite (Task 34)
 *
 * Engine statistique INDÉPENDANTE du marché (V4 Principe 1: "Prévoir avant de comparer").
 *
 * Chaîne (V4 §7-§14 en version lite):
 *   ESPN standings + box stats (gratuites, officielles, déjà utilisées)
 *   → Pace RÉEL par équipe (formule Dean Oliver: FGA − ORB + TOV + 0.44×FTA)
 *   → ORtg / DRtg réels (points par 100 possessions)
 *   → Régression vers la moyenne (shrinkage bayésien, V4 §5)
 *   → Projection: possessions attendues × efficacité attendue (ajustement adversaire additif)
 *   → Distribution normale (σ empirique NBA, élargie si échantillon faible, V4 §12)
 *   → P(victoire), P(Over/Under ligne), P(cover spread) (V4 §14 en CDF analytique)
 *   → Edge vs lignes marché ESPN + décision BET/LEAN/NO BET avec seuil adaptatif (V4 §19/§22)
 *
 * Garanties:
 *   - 100% SANS FRAIS: uniquement des endpoints ESPN publics déjà utilisés par le projet
 *   - SANS RISQUE DE BAN: aucune nouvelle source externe, aucun scraping; caches longs (6h)
 *   - FAIL-CLOSED: toute donnée manquante → null → comportement historique inchangé
 *   - KILL-SWITCH: env NBA_V4_LITE=false désactive l'engine sans redéploiement
 */

import { fetchAllTeamStats, TEAM_NAME_TO_ID, type NBATeamStats } from './nbaStatsService';

// ============================================
// CONSTANTES EMPIRIQUES NBA (recalibrables en Phase 2 via backtest)
// ============================================

/** Écart-type empirique du total de points d'un match NBA (saison régulière) */
export const SIGMA_TOTAL_BASE = 11.5;
/** Écart-type empirique de la marge d'un match NBA */
export const SIGMA_MARGIN_BASE = 11.5;
/** Avantage domicile NBA en points (total, réparti ±1.25) */
export const HOME_ADVANTAGE_PTS = 2.5;
/** Force du prior ligue pour le shrinkage (style empirical Bayes: alpha = n/(n+k)) */
export const SHRINK_PRIOR_GAMES = 10;
/** Cache des box stats ESPN (les stats équipe évoluent lentement) */
const BOX_CACHE_TTL = 6 * 60 * 60 * 1000; // 6h

/** Bornes de sanité (rejet de valeurs aberrantes ESPN) */
const PACE_MIN = 88, PACE_MAX = 108;
const RTG_MIN = 98, RTG_MAX = 130;

// ============================================
// TYPES
// ============================================

export interface NBATeamAdvancedStats {
  teamId: number;
  teamName: string;
  gamesPlayed: number;
  ppg: number;
  oppPpg: number;
  pace: number; // possessions / match (Dean Oliver)
  ortg: number; // points marqués / 100 possessions
  drtg: number; // points concédés / 100 possessions
  // valeurs SHRINKÉES vers la moyenne ligue (utilisées pour la projection)
  paceAdj: number;
  ortgAdj: number;
  drtgAdj: number;
  shrinkFactor: number; // alpha = n/(n+k): 1 = échantillon riche, →0 = peu de données
}

export interface NBALeagueAverages {
  pace: number;
  ortg: number;
  drtg: number;
  teamsCounted: number;
}

export interface NBAProjection {
  homeTeam: string;
  awayTeam: string;
  homeExpectedPts: number;
  awayExpectedPts: number;
  expectedTotal: number;
  expectedMargin: number; // home − away
  sigmaTotal: number;     // σ élargi selon incertitude d'échantillon
  sigmaMargin: number;
  homeWinProb: number;    // via CDF normale de la marge
  awayWinProb: number;
  intervalTotal70: [number, number];
  intervalMargin70: [number, number];
  paceHome: number;
  paceAway: number;
  ortgHome: number;
  ortgAway: number;
  drtgHome: number;
  drtgAway: number;
  shrinkFactor: number;   // min des deux alphas (pire cas)
  dataBasis: string;
}

export interface NBAMarketInput {
  total?: number | null;      // ligne Over/Under du marché (ex: 220.5)
  homeSpread?: number | null; // handicap domicile (négatif si favori, ex: -5.5)
  awaySpread?: number | null;
}

export interface NBAMarketEdge {
  market: 'OVER' | 'UNDER' | 'HOME_SPREAD' | 'AWAY_SPREAD';
  line: number;
  probModel: number;        // probabilité engine de l'issue retenue
  edgePp: number;           // edge en points de probabilité vs base 50%
  requiredEdgePp: number;   // seuil adaptatif (V4 §19)
  distancePts: number;      // |projection − ligne| en points
  decision: 'BET' | 'LEAN' | 'NO BET';
}

// ============================================
// FONCTIONS PURES (testées unitairement)
// ============================================

/**
 * Pace réel (possessions par match) — formule Dean Oliver.
 * Boston 2025-26: 90.2 − 12.5 + 11.5 + 0.44×18.7 = 97.4 ✓
 */
export function deanOliverPace(fga: number, orb: number, tov: number, fta: number): number {
  return fga - orb + tov + 0.44 * fta;
}

/**
 * CDF normale standard — approximation Abramowitz & Stegun 7.1.26 (|err| < 1.5e-7).
 * Remplace le Monte-Carlo (V4 §14): même résultat, calcul analytique en 0 ms.
 */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-x * x / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/** P(total > ligne) — V4 §14 probabilité Over */
export function probOverTotal(expectedTotal: number, sigma: number, line: number): number {
  return normalCdf((expectedTotal - line) / sigma);
}

/**
 * P(équipe domicile couvre le spread).
 * Convention: homeSpread = handicap appliqué au score domicile (négatif si favori).
 * Home couvre si marge > −homeSpread → P = Φ((marge + homeSpread)/σ)
 */
export function probCoverMargin(expectedMargin: number, sigma: number, spread: number): number {
  return normalCdf((expectedMargin + spread) / sigma);
}

/**
 * Régression vers la moyenne (V4 §5): alpha = n/(n+k).
 * 0 match → moyenne ligue pure; beaucoup de matchs → valeur observée.
 */
export function shrinkRating(value: number, leagueAvg: number, gamesPlayed: number, k = SHRINK_PRIOR_GAMES): number {
  const alpha = gamesPlayed / (gamesPlayed + k);
  return alpha * value + (1 - alpha) * leagueAvg;
}

/**
 * σ élargi selon l'incertitude d'échantillon (V4 §12 + §19):
 * début de saison → distribution plus large → edges naturellement plus rares.
 */
export function widenedSigma(base: number, shrinkFactor: number): number {
  const uncertainty = Math.max(0, Math.min(1, 1 - shrinkFactor));
  return base * (1 + uncertainty * 0.20);
}

/** Seuil d'edge adaptatif en points de probabilité (V4 §19) */
export function requiredEdgePp(shrinkFactor: number): number {
  const uncertainty = Math.max(0, Math.min(1, 1 - shrinkFactor));
  return 3.5 + uncertainty * 3.5; // [3.5 .. 7.0] pp
}

/**
 * Projection centrale (pure): possessions attendues × efficacité attendue.
 * Ajustement adversaire additif: effExpected = ORtg soi + (DRtg adv − DRtg ligue).
 * L'avantage domicile est réparti ±HOME_ADVANTAGE_PTS/2.
 */
export function computeProjection(
  home: NBATeamAdvancedStats,
  away: NBATeamAdvancedStats,
  league: NBALeagueAverages
): NBAProjection {
  const possessionsExpected = (home.paceAdj + away.paceAdj) / 2;

  // V4 §8: efficacité attendue = attaque propre + (défense adverse vs moyenne ligue)
  const effHome = home.ortgAdj + (away.drtgAdj - league.drtg);
  const effAway = away.ortgAdj + (home.drtgAdj - league.drtg);

  const hca = HOME_ADVANTAGE_PTS / 2;
  const homeExpectedPts = possessionsExpected * effHome / 100 + hca;
  const awayExpectedPts = possessionsExpected * effAway / 100 - hca;

  const expectedTotal = homeExpectedPts + awayExpectedPts;
  const expectedMargin = homeExpectedPts - awayExpectedPts;

  const shrinkFactor = Math.min(home.shrinkFactor, away.shrinkFactor);
  const sigmaTotal = widenedSigma(SIGMA_TOTAL_BASE, shrinkFactor);
  const sigmaMargin = widenedSigma(SIGMA_MARGIN_BASE, shrinkFactor);

  const homeWinProb = Math.max(0.02, Math.min(0.98, normalCdf(expectedMargin / sigmaMargin)));

  const q70 = 1.036; // quantile 70% de la normale (Φ⁻¹(0.85))
  return {
    homeTeam: home.teamName,
    awayTeam: away.teamName,
    homeExpectedPts: round1(homeExpectedPts),
    awayExpectedPts: round1(awayExpectedPts),
    expectedTotal: round1(expectedTotal),
    expectedMargin: round1(expectedMargin),
    sigmaTotal: round1(sigmaTotal),
    sigmaMargin: round1(sigmaMargin),
    homeWinProb: Math.round(homeWinProb * 1000) / 1000,
    awayWinProb: Math.round((1 - homeWinProb) * 1000) / 1000,
    intervalTotal70: [Math.round(expectedTotal - q70 * sigmaTotal), Math.round(expectedTotal + q70 * sigmaTotal)],
    intervalMargin70: [Math.round(expectedMargin - q70 * sigmaMargin), Math.round(expectedMargin + q70 * sigmaMargin)],
    paceHome: round1(home.paceAdj),
    paceAway: round1(away.paceAdj),
    ortgHome: round1(home.ortgAdj),
    ortgAway: round1(away.ortgAdj),
    drtgHome: round1(home.drtgAdj),
    drtgAway: round1(away.drtgAdj),
    shrinkFactor: Math.round(shrinkFactor * 1000) / 1000,
    dataBasis: '',
  };
}

/**
 * Évaluation des marchés (V4 §17-19 + §22): P(engine) vs base 50%, edge adaptatif,
 * décision BET / LEAN / NO BET. La sortie NO BET est normale et souhaitable.
 */
export function evaluateMarketEdges(proj: NBAProjection, market: NBAMarketInput): NBAMarketEdge[] {
  const edges: NBAMarketEdge[] = [];
  const req = requiredEdgePp(proj.shrinkFactor);
  const sigmaT = proj.sigmaTotal;
  const sigmaM = proj.sigmaMargin;

  // ── Marché Over/Under (V4 priorité 1) ──
  if (market.total != null && Number.isFinite(market.total)) {
    const line = market.total;
    const pOver = probOverTotal(proj.expectedTotal, sigmaT, line);
    const pUnder = 1 - pOver;
    const distOver = Math.abs(proj.expectedTotal - line);
    const dist = Math.round(distOver * 10) / 10;
    const farFromLine = distOver >= 1.5; // V4 §22: ligne trop proche de la projection → NO BET

    const overEdge = (pOver - 0.5) * 100;
    const underEdge = (pUnder - 0.5) * 100;
    const overBetter = pOver >= pUnder;

    edges.push({
      market: 'OVER',
      line,
      probModel: Math.round(pOver * 1000) / 1000,
      edgePp: Math.round(overEdge * 10) / 10,
      requiredEdgePp: Math.round(req * 10) / 10,
      distancePts: dist,
      decision: decide(overEdge, req, farFromLine),
    });
    edges.push({
      market: 'UNDER',
      line,
      probModel: Math.round(pUnder * 1000) / 1000,
      edgePp: Math.round(underEdge * 10) / 10,
      requiredEdgePp: Math.round(req * 10) / 10,
      distancePts: dist,
      decision: decide(underEdge, req, farFromLine),
    });
    void overBetter;
  }

  // ── Marché Handicap / Spread (V4 priorité 2) ──
  if (market.homeSpread != null && Number.isFinite(market.homeSpread)) {
    const hs = market.homeSpread;
    const pHomeCover = probCoverMargin(proj.expectedMargin, sigmaM, hs);
    const distHome = Math.abs(proj.expectedMargin + hs);
    const dist = Math.round(distHome * 10) / 10;
    const farFromLine = distHome >= 1.5;

    edges.push({
      market: 'HOME_SPREAD',
      line: hs,
      probModel: Math.round(pHomeCover * 1000) / 1000,
      edgePp: Math.round((pHomeCover - 0.5) * 1000) / 10,
      requiredEdgePp: Math.round(req * 10) / 10,
      distancePts: dist,
      decision: decide((pHomeCover - 0.5) * 100, req, farFromLine),
    });
  }
  if (market.awaySpread != null && Number.isFinite(market.awaySpread)) {
    const asp = market.awaySpread;
    const pAwayCover = probCoverMargin(-proj.expectedMargin, sigmaM, asp);
    const distAway = Math.abs(-proj.expectedMargin + asp);
    const dist = Math.round(distAway * 10) / 10;
    const farFromLine = distAway >= 1.5;

    edges.push({
      market: 'AWAY_SPREAD',
      line: asp,
      probModel: Math.round(pAwayCover * 1000) / 1000,
      edgePp: Math.round((pAwayCover - 0.5) * 1000) / 10,
      requiredEdgePp: Math.round(req * 10) / 10,
      distancePts: dist,
      decision: decide((pAwayCover - 0.5) * 100, req, farFromLine),
    });
  }

  return edges;
}

function decide(edgePp: number, requiredPp: number, farFromLine: boolean): 'BET' | 'LEAN' | 'NO BET' {
  if (!farFromLine) return 'NO BET';
  if (edgePp >= requiredPp) return 'BET';
  if (edgePp >= requiredPp * 0.6) return 'LEAN';
  return 'NO BET';
}

// ============================================
// RÉCUPÉRATION DES DONNÉES ESPN (gratuites, déjà utilisées par le projet)
// ============================================

declare global {
  // eslint-disable-next-line no-var
  var nbaBoxStatsCache: {
    data: Map<number, NBATeamAdvancedStats>;
    league: NBALeagueAverages;
    timestamp: number;
  } | undefined;
  // Déduplication du chargement en vol: getBatchPredictions appelle l'engine en
  // parallèle pour ~30 matchs → SANS dedup, un cache froid déclencherait ~900
  // fetch ESPN concurrents (agressif, inutile). Un seul chargement partagé.
  // eslint-disable-next-line no-var
  var nbaBoxStatsLoading: Promise<{ data: Map<number, NBATeamAdvancedStats>; league: NBALeagueAverages } | null> | undefined;
}

/**
 * Parse les box stats d'une équipe depuis l'endpoint ESPN team statistics.
 * DRtg approximé par oppPPG/pace×100 (les possessions subies ≈ possessions créées par match).
 */
export function parseTeamBoxStats(
  espnPayload: any,
  standingsEntry: NBATeamStats
): NBATeamAdvancedStats | null {
  try {
    const cats = espnPayload?.results?.stats?.categories;
    if (!Array.isArray(cats)) return null;

    let fga: number | null = null, fta: number | null = null, orb: number | null = null,
        tov: number | null = null, ppgBox: number | null = null, gp: number | null = null;

    for (const c of cats) {
      const stats = c?.stats || [];
      for (const s of stats) {
        const v = s?.value;
        if (v == null || !Number.isFinite(Number(v))) continue;
        switch (s.name) {
          case 'avgFieldGoalsAttempted': fga = Number(v); break;
          case 'avgFreeThrowsAttempted': fta = Number(v); break;
          case 'avgOffensiveRebounds': orb = Number(v); break;
          case 'avgTurnovers': tov = Number(v); break;
          case 'avgPoints': ppgBox = Number(v); break;
        }
      }
      if (c.name === 'general') {
        for (const s of stats) {
          if (s?.name === 'gamesPlayed' && s?.value != null && Number.isFinite(Number(s.value))) {
            gp = Number(s.value);
          }
        }
      }
    }

    if (fga == null || fta == null || orb == null || tov == null) return null;

    const gamesPlayed = gp ?? standingsEntry.gamesPlayed ?? 0;
    const ppg = ppgBox ?? standingsEntry.ptsPerGame;
    const oppPpg = standingsEntry.oppPtsPerGame;

    const rawPace = deanOliverPace(fga, orb, tov, fta);
    if (!Number.isFinite(rawPace) || rawPace < PACE_MIN || rawPace > PACE_MAX) return null;

    const ortg = ppg / rawPace * 100;
    const drtg = oppPpg / rawPace * 100;
    if (!Number.isFinite(ortg) || ortg < RTG_MIN || ortg > RTG_MAX) return null;
    if (!Number.isFinite(drtg) || drtg < RTG_MIN || drtg > RTG_MAX) return null;

    return {
      teamId: standingsEntry.id,
      teamName: standingsEntry.name,
      gamesPlayed,
      ppg, oppPpg,
      pace: round1(rawPace),
      ortg: round1(ortg),
      drtg: round1(drtg),
      paceAdj: rawPace,        // shrinkage appliqué plus tard (après calcul moyennes ligue)
      ortgAdj: ortg,
      drtgAdj: drtg,
      shrinkFactor: 1,         // recalculé plus tard
    };
  } catch {
    return null;
  }
}

async function fetchTeamBoxStats(teamId: number): Promise<any | null> {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/statistics`,
      { next: { revalidate: BOX_CACHE_TTL / 1000 } }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Construit (avec cache 6h) les stats avancées des 30 équipes + moyennes ligue.
 * Déduplique les appels concurrents: un seul chargement réseau partagé.
 */
async function loadAdvancedStats(): Promise<{ data: Map<number, NBATeamAdvancedStats>; league: NBALeagueAverages } | null> {
  const cached = globalThis.nbaBoxStatsCache;
  if (cached && Date.now() - cached.timestamp < BOX_CACHE_TTL && cached.data.size >= 20) {
    return { data: cached.data, league: cached.league };
  }

  if (globalThis.nbaBoxStatsLoading) {
    return globalThis.nbaBoxStatsLoading;
  }

  const load = doLoadAdvancedStats();
  globalThis.nbaBoxStatsLoading = load.finally(() => {
    globalThis.nbaBoxStatsLoading = undefined;
  });
  return load;
}

async function doLoadAdvancedStats(): Promise<{ data: Map<number, NBATeamAdvancedStats>; league: NBALeagueAverages } | null> {
  const standings = await fetchAllTeamStats();
  if (!standings || standings.length < 10) return null;

  // Résolution tolérante nom → id (les ids ESPN de la map officielle)
  const resolved: { entry: NBATeamStats; id: number }[] = [];
  for (const entry of standings) {
    let id = TEAM_NAME_TO_ID[entry.name] || entry.id;
    if (!id) {
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
      const match = standings.find((s) => norm(s.name) === norm(entry.name));
      id = match?.id || 0;
    }
    if (id > 0) resolved.push({ entry, id });
  }
  if (resolved.length < 10) return null;

  // Fetch parallèle par lots de 10 (une fois par 6h max par instance)
  const data = new Map<number, NBATeamAdvancedStats>();
  for (let i = 0; i < resolved.length; i += 10) {
    const batch = resolved.slice(i, i + 10);
    const payloads = await Promise.all(batch.map((r) => fetchTeamBoxStats(r.id)));
    batch.forEach((r, j) => {
      const parsed = payloads[j] ? parseTeamBoxStats(payloads[j], r.entry) : null;
      if (parsed) data.set(r.id, parsed);
    });
  }
  if (data.size < 10) return null; // saison morte / ESPN indispo → fail-closed

  // Moyennes ligue (sur valeurs brutes)
  const arr = [...data.values()];
  const league: NBALeagueAverages = {
    pace: avg(arr.map((t) => t.pace)),
    ortg: avg(arr.map((t) => t.ortg)),
    drtg: avg(arr.map((t) => t.drtg)),
    teamsCounted: arr.length,
  };

  // Shrinkage vers la moyenne ligue (V4 §5) + recalcul alpha
  for (const t of arr) {
    const n = Math.max(0, Math.min(200, t.gamesPlayed));
    t.shrinkFactor = Math.round((n / (n + SHRINK_PRIOR_GAMES)) * 1000) / 1000;
    t.paceAdj = round1(shrinkRating(t.pace, league.pace, n));
    t.ortgAdj = round1(shrinkRating(t.ortg, league.ortg, n));
    t.drtgAdj = round1(shrinkRating(t.drtg, league.drtg, n));
  }

  globalThis.nbaBoxStatsCache = { data, league, timestamp: Date.now() };
  return { data, league };
}

/** Résolution tolérante d'un nom d'équipe vers les stats avancées */
function resolveTeam(name: string, data: Map<number, NBATeamAdvancedStats>): NBATeamAdvancedStats | null {
  const direct = [...data.values()].find((t) => t.teamName === name);
  if (direct) return direct;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const target = norm(name || '');
  if (!target) return null;
  return [...data.values()].find((t) => norm(t.teamName) === target) || null;
}

// ============================================
// POINT D'ENTRÉE PRINCIPAL
// ============================================

/**
 * Projection V4-lite pour un match NBA.
 * Retourne null si l'engine est désactivée ou si les données sont insuffisantes
 * (fail-closed: le pipeline garde alors son comportement historique).
 */
export async function getNBAProjection(homeTeam: string, awayTeam: string): Promise<NBAProjection | null> {
  if (process.env.NBA_V4_LITE === 'false') return null;
  if (!homeTeam || !awayTeam) return null;

  try {
    const loaded = await loadAdvancedStats();
    if (!loaded) return null;

    const home = resolveTeam(homeTeam, loaded.data);
    const away = resolveTeam(awayTeam, loaded.data);
    if (!home || !away || home.teamId === away.teamId) return null;

    const proj = computeProjection(home, away, loaded.league);
    proj.dataBasis = `ESPN box stats, ${home.gamesPlayed}M/${away.gamesPlayed}M, ${loaded.league.teamsCounted} équipes`;
    return proj;
  } catch {
    return null; // fail-closed absolu
  }
}

/**
 * Calcule les edges marché si les lignes ESPN sont disponibles.
 * (Saison régulière uniquement — les lignes O/U + spread n'existent pas en preseason.)
 */
export function getNBAMarketEdges(proj: NBAProjection, market: NBAMarketInput): NBAMarketEdge[] {
  return evaluateMarketEdges(proj, market);
}

// ============================================
// UTILS
// ============================================

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function avg(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length);
}
