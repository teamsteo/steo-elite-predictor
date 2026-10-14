/**
 * Understat Fetcher — Récupère les données xG minutées depuis Understat
 *
 * Understat fournit les xG détaillés par tir pour les 5 grands championnats.
 * Pas d'API officielle : on scrape le JSON injecté dans le HTML de la page match.
 *
 * Rate limiting strict : 1 req / 30s max, cache 30s par match_id.
 * Aucune authentification requise.
 *
 * Scraping respectueux : User-Agent explicite, pas de polling intensif.
 */

import { ShotEvent, LiveCalibrationInput, MomentumWindow } from './types';

const UNDERSTAT_BASE = 'https://understat.com';
const CACHE_TTL_MS = 30 * 1000; // 30s
const REQUEST_INTERVAL_MS = 30 * 1000; // 30s entre chaque requête

interface CacheEntry {
  data: any;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
let lastRequestAt = 0;

const LEAGUE_MAP: Record<string, string> = {
  'Premier League': 'EPL',
  'La Liga': 'La_liga',
  'Serie A': 'Serie_A',
  'Bundesliga': 'Bundesliga',
  'Ligue 1': 'Ligue_1',
  'Ligue 1 Uber Eats': 'Ligue_1',
};

const USER_AGENT =
  'Mozilla/5.0 (compatible; SteoElitePredictor/1.0; +https://my-project-zeta-five-85.vercel.app)';

/**
 * Tente de récupérer les stats xG Understat pour un match donné.
 * Retourne null si non trouvé (dégrade gracieusement vers estimation ESPN).
 */
export async function fetchUnderstatMatch(
  homeTeam: string,
  awayTeam: string,
  league: string,
  matchDate: string,
): Promise<{ shots: ShotEvent[]; halftime_summary: any } | null> {
  const cacheKey = `${homeTeam}|${awayTeam}|${matchDate}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Rate limiting strict
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < REQUEST_INTERVAL_MS) {
    await sleep(REQUEST_INTERVAL_MS - elapsed);
  }
  lastRequestAt = Date.now();

  const leagueCode = LEAGUE_MAP[league];
  if (!leagueCode) return null;

  try {
    const matchId = await findMatchId(homeTeam, awayTeam, leagueCode, matchDate);
    if (!matchId) return null;

    const matchData = await fetchMatchDetails(matchId);
    if (!matchData) return null;

    const result = parseUnderstatShots(matchData);
    cache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (e) {
    console.warn(`⚠️ Understat fetch failed for ${homeTeam} vs ${awayTeam}:`, e);
    return null;
  }
}

async function findMatchId(
  homeTeam: string,
  awayTeam: string,
  leagueCode: string,
  matchDate: string,
): Promise<string | null> {
  // Understat URL: /league/2025/ ou /match/MATCHID
  // Pour la saison en cours, on tente une recherche par date
  const year = new Date(matchDate).getFullYear();
  const seasonCode = year >= 8 ? `${year - 1}` : `${year}`; // saison commence en août

  const url = `${UNDERSTAT_BASE}/league/${leagueCode}/${seasonCode}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) return null;

  const html = await response.text();
  // Sous-stat embarque les datesData JSON-encode + JavaScript-escape
  // Format: var datesData = JSON.parse("...");
  const match = html.match(/var datesData\s*=\s*JSON\.parse\('([^']+)'\)/);
  if (!match) return null;

  // Decode escaped JSON
  const escaped = match[1]
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  let datesData: any[];
  try {
    datesData = JSON.parse(escaped);
  } catch {
    return null;
  }

  // Cherche le match par équipes + date approximative
  const targetDate = matchDate.split('T')[0];
  for (const m of datesData) {
    const matchHome = normalize(m[1]);
    const matchAway = normalize(m[2]);
    const matchDateStr = m[6]?.split(' ')[0] || '';

    if (
      (matchHome.includes(normalize(homeTeam)) || normalize(homeTeam).includes(matchHome)) &&
      (matchAway.includes(normalize(awayTeam)) || normalize(awayTeam).includes(matchAway))
    ) {
      return m[0]; // matchId
    }
    if (matchDateStr === targetDate && matchHome.includes(normalize(homeTeam).split(' ')[0])) {
      return m[0];
    }
  }

  return null;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

async function fetchMatchDetails(matchId: string): Promise<any | null> {
  const url = `${UNDERSTAT_BASE}/match/${matchId}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) return null;

  const html = await response.text();
  // Extraire shotsData
  const match = html.match(/var shotsData\s*=\s*JSON\.parse\('([^']+)'\)/);
  if (!match) return null;

  const escaped = match[1]
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  try {
    return { shots: JSON.parse(escaped), matchId };
  } catch {
    return null;
  }
}

function parseUnderstatShots(
  matchData: { shots: any[]; matchId: string },
): { shots: ShotEvent[]; halftime_summary: any } {
  const shots: ShotEvent[] = [];

  for (const shot of matchData.shots) {
    // Format Understat : [id, minute, result, X, Y, xG, player, home, away, player_id, situation, season]
    const minute = parseInt(shot[1], 10);
    const result = shot[2];      // 'Goal', 'BlockedShot', 'ShotOnPost', etc.
    const xg = parseFloat(shot[5]) || 0;
    const isHome = shot[7] === 'h';
    const situation = shot[10] || '';  // 'OpenPlay', 'Penalty', 'DirectFreekick', etc.
    const isBigChance = false; // Understat ne l'indique pas directement, on déduit via xG >= 0.30

    if (minute > 50) continue; // On garde uniquement la 1ère mi-temps (+2-3 min de prolongation)

    shots.push({
      minute,
      team: isHome ? 'home' : 'away',
      xg,
      outcome: mapOutcome(result),
      is_big_chance: xg >= 0.30,
      is_penalty: situation === 'Penalty',
      location: mapLocation(shot[3], shot[4]),
    });
  }

  // Construire le halftime_summary
  const halftime_summary = buildHalftimeSummary(shots);

  return { shots, halftime_summary };
}

function mapOutcome(understatResult: string): ShotEvent['outcome'] {
  switch (understatResult) {
    case 'Goal': return 'goal';
    case 'SavedShot': return 'saved';
    case 'ShotOnPost': return 'post';
    case 'BlockedShot': return 'blocked';
    case 'OffTarget': return 'off_target';
    default: return 'off_target';
  }
}

function mapLocation(x: string, y: string): ShotEvent['location'] {
  const fx = parseFloat(x) || 0;
  const fy = parseFloat(y) || 0;
  // Understat coords : X ∈ [0, 100], Y ∈ [0, 100] (origine top-left du terrain)
  // 100 = but adverse. Si X >= 85 et Y ∈ [37, 63] → surface de réparation
  if (fx >= 85 && fy >= 30 && fy <= 70) return 'penalty_area';
  if (fx >= 90 && fy >= 40 && fy <= 60) return 'six_yard_box';
  if (fx < 70) return 'long_range';
  return 'outside_box';
}

function buildHalftimeSummary(shots: ShotEvent[]): any {
  const homeShots = shots.filter(s => s.team === 'home');
  const awayShots = shots.filter(s => s.team === 'away');

  const sumXG = (arr: ShotEvent[]) => arr.reduce((acc, s) => acc + s.xg, 0);
  const sumBigChance = (arr: ShotEvent[]) => arr.reduce((acc, s) => acc + (s.is_big_chance ? s.xg : 0), 0);
  const sumPenalty = (arr: ShotEvent[]) => arr.reduce((acc, s) => acc + (s.is_penalty ? s.xg : 0), 0);
  const countOnTarget = (arr: ShotEvent[]) => arr.filter(s => s.outcome === 'goal' || s.outcome === 'saved' || s.outcome === 'post').length;

  const xgHome = sumXG(homeShots);
  const xgAway = sumXG(awayShots);
  const bigChanceHome = sumBigChance(homeShots);
  const bigChanceAway = sumBigChance(awayShots);

  // Momentum windows 10 min
  const windows: MomentumWindow[] = [];
  for (let start = 0; start < 50; start += 10) {
    const end = Math.min(start + 10, 50);
    const inWindow = shots.filter(s => s.minute >= start && s.minute < end);
    windows.push({
      window_start: start,
      window_end: end,
      xg_home: sumXG(inWindow.filter(s => s.team === 'home')),
      xg_away: sumXG(inWindow.filter(s => s.team === 'away')),
    });
  }

  return {
    duration_minutes: 47, // approximation incluant temps additionnel
    shots,
    summary: {
      xg_total: { home: xgHome, away: xgAway },
      xg_big_chance: { home: bigChanceHome, away: bigChanceAway },
      xg_penalty: { home: sumPenalty(homeShots), away: sumPenalty(awayShots) },
      xg_routine: {
        home: xgHome - bigChanceHome - sumPenalty(homeShots),
        away: xgAway - bigChanceAway - sumPenalty(awayShots),
      },
      shots_total: { home: homeShots.length, away: awayShots.length },
      shots_on_target: { home: countOnTarget(homeShots), away: countOnTarget(awayShots) },
      possession_pct: { home: 50, away: 50 }, // pas dispo dans Understat
      field_tilt_pct: { home: 50, away: 50 }, // pas dispo directement
      passes_final_third: { home: 0, away: 0 },
      pressures_high: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
      cards: { home_yellow: 0, away_yellow: 0, home_red: 0, away_red: 0 },
    },
    momentum_10min_windows: windows,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Construit un input LiveCalibrationInput à partir de données ESPN + Understat.
 * Utilisé par le cron /api/live-calibration/scan.
 */
export function buildCalibrationInput(
  espnMatch: any,
  understatData: { shots: ShotEvent[]; halftime_summary: any } | null,
  preMatchModel: any,
): LiveCalibrationInput | null {
  if (!espnMatch || !espnMatch.homeTeam || !espnMatch.awayTeam) return null;

  // Si Understat a des données → on les utilise
  // Sinon → fallback sur estimation ESPN (xG non disponible, on simule depuis les cotes)
  const first_half = understatData
    ? understatData.halftime_summary
    : estimateFirstHalfFromESPN(espnMatch);

  return {
    match_id: espnMatch.id || `match_${Date.now()}`,
    home_team: espnMatch.homeTeam,
    away_team: espnMatch.awayTeam,
    league: espnMatch.league || 'Unknown',
    kickoff_utc: espnMatch.date || new Date().toISOString(),
    halftime_utc: new Date().toISOString(),
    score_ht: {
      home: espnMatch.homeScore || 0,
      away: espnMatch.awayScore || 0,
    },
    first_half,
    pre_match_model: preMatchModel,
    bookmaker_odds_ht: {
      home_win: espnMatch.oddsHome,
      draw: espnMatch.oddsDraw || undefined,
      away_win: espnMatch.oddsAway,
    },
  };
}

/**
 * Fallback quand Understat n'est pas disponible :
 * estime un xG pré-match basé sur les cotes (1/cote ≈ probabilité implicite).
 * Pas idéal mais permet au pipeline de tourner.
 */
function estimateFirstHalfFromESPN(espnMatch: any): any {
  const oddsH = espnMatch.oddsHome || 2.0;
  const oddsD = espnMatch.oddsDraw || 3.3;
  const oddsA = espnMatch.oddsAway || 3.5;

  // Vig-adjusted implied probabilities
  const ih = 1 / oddsH;
  const id = 1 / oddsD;
  const ia = 1 / oddsA;
  const total = ih + id + ia;
  const pH = ih / total;
  const pD = id / total;
  const pA = ia / total;

  // Estimate lambda via Poisson inverse (simplification)
  // Approx: lambda_home ≈ 1.5 * pH / (pH + pA), lambda_away ≈ 1.5 * pA / (pH + pA)
  const totalGoalsExp = 2.5;
  const lambdaHome = (totalGoalsExp * pH) / (pH + pA + 0.001);
  const lambdaAway = (totalGoalsExp * pA) / (pH + pA + 0.001);

  // Halftime xG ≈ 40% du total (1ère mi-temps plus fermée généralement)
  const xgHomeHT = lambdaHome * 0.45 * 0.4;
  const xgAwayHT = lambdaAway * 0.45 * 0.4;

  // Simule 2-3 tirs factices pour avoir un sample minimum
  const fakeShots: ShotEvent[] = [];
  if (xgHomeHT > 0.05) {
    fakeShots.push({ minute: 20, team: 'home', xg: xgHomeHT, outcome: 'off_target', is_big_chance: xgHomeHT > 0.3 });
  }
  if (xgAwayHT > 0.05) {
    fakeShots.push({ minute: 30, team: 'away', xg: xgAwayHT, outcome: 'off_target', is_big_chance: xgAwayHT > 0.3 });
  }

  return {
    duration_minutes: 45,
    shots: fakeShots,
    summary: {
      xg_total: { home: xgHomeHT, away: xgAwayHT },
      xg_big_chance: { home: 0, away: 0 },
      xg_penalty: { home: 0, away: 0 },
      xg_routine: { home: xgHomeHT, away: xgAwayHT },
      shots_total: { home: fakeShots.filter(s => s.team === 'home').length, away: fakeShots.filter(s => s.team === 'away').length },
      shots_on_target: { home: 0, away: 0 },
      possession_pct: { home: 50, away: 50 },
      field_tilt_pct: { home: 50, away: 50 },
      passes_final_third: { home: 0, away: 0 },
      pressures_high: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
      cards: { home_yellow: 0, away_yellow: 0, home_red: 0, away_red: 0 },
    },
    momentum_10min_windows: [
      { window_start: 0, window_end: 10, xg_home: xgHomeHT * 0.2, xg_away: xgAwayHT * 0.2 },
      { window_start: 10, window_end: 20, xg_home: xgHomeHT * 0.25, xg_away: xgAwayHT * 0.25 },
      { window_start: 20, window_end: 30, xg_home: xgHomeHT * 0.25, xg_away: xgAwayHT * 0.25 },
      { window_start: 30, window_end: 40, xg_home: xgHomeHT * 0.2, xg_away: xgAwayHT * 0.2 },
      { window_start: 40, window_end: 45, xg_home: xgHomeHT * 0.1, xg_away: xgAwayHT * 0.1 },
    ],
  };
}
