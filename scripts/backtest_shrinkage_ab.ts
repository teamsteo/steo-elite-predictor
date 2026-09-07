/**
 * backtest_shrinkage_ab.ts — Backtest A/B du fix shrinkage (commit ed34f47)
 *
 * Objectif : quantifier l'impact du bug de bayesianShrinkage (dénominateur
 * (α+β)*minutes au lieu de (α+β)) sur la qualité des calibrations mi-temps.
 *
 * Méthode :
 *   1. Données RÉELLES Understat (big-5, saison 2025-26 complète) :
 *      tirs minutés avec xG par tir (getMatchData), scores finaux, xG match.
 *   2. Prior pré-match HONNÊTE (walk-forward) : forces attaque/défense
 *      calculées uniquement sur les matchs ANTÉRIEURS de la saison (xG cumulés).
 *   3. Pour chaque match : construction de l'input pipeline (tirs 1re MT,
 *      score MT, prior) → calibrate() en version FIXÉE et version BUGGÉE
 *      (copie sandbox, 1 ligne différente : noiseFilter.ts).
 *   4. Métriques : Brier 1X2 + log loss vs score final, en comparant
 *      buggy vs fixé vs baseline pré-match (Poisson-DC sur le prior).
 *
 * Usage : npx tsx scripts/backtest_shrinkage_ab.ts [--per-league 50] [--delay 1100]
 */

import * as fs from 'fs';
import * as path from 'path';
import { calibrate as calibrateFixed } from './backtest_env/lib_fixed/calibrate';
import { calibrate as calibrateBuggy } from './backtest_env/lib_buggy/calibrate';
import type {
  LiveCalibrationInput, ShotEvent, FirstHalfSummary, PreMatchModel,
} from './backtest_env/lib_fixed/types';

// ============================================
// CONFIG
// ============================================

const LEAGUES = [
  { code: 'EPL', name: 'Premier League' },
  { code: 'La_liga', name: 'La Liga' },
  { code: 'Serie_A', name: 'Serie A' },
  { code: 'Bundesliga', name: 'Bundesliga' },
  { code: 'Ligue_1', name: 'Ligue 1' },
];
const SEASON = '2025'; // saison 2025-26 (terminée)
const PER_LEAGUE = parseInt(arg('--per-league', '50'), 10);
const DELAY_MS = parseInt(arg('--delay', '1100'), 10);
const MIN_GAMES_PRIOR = 4;   // matchs minimum par équipe avant de scorer le prior
const OUT_DIR = path.join(__dirname, 'backtest_env');
const JSONL_PATH = path.join(OUT_DIR, 'results_shrinkage_ab.jsonl');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ============================================
// FETCH UNDERSTAT (endpoints AJAX 2026)
// ============================================

interface LeagueDate {
  id: string; isResult: boolean; datetime: string;
  h: { id: string; title: string }; a: { id: string; title: string };
  goals: { h: string; a: string }; xG: { h: string; a: string };
  forecast?: { w: string; d: string; l: string };
}

async function fetchJson(url: string, referer: string, retries = 2): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest', Referer: referer },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e: any) {
      if (attempt === retries) throw e;
      await sleep(4000);
    }
  }
}

async function fetchLeagueDates(league: string): Promise<LeagueDate[]> {
  const data = await fetchJson(
    `https://understat.com/getLeagueData/${league}/${SEASON}`,
    `https://understat.com/league/${league}/${SEASON}`,
  );
  const dates: LeagueDate[] = data.dates ?? [];
  return dates.filter(d => d.isResult && typeof d?.goals?.h !== 'undefined');
}

async function fetchMatchShots(matchId: string): Promise<{ h: any[]; a: any[] }> {
  const data = await fetchJson(
    `https://understat.com/getMatchData/${matchId}`,
    `https://understat.com/match/${matchId}`,
  );
  return { h: data.shots?.h ?? [], a: data.shots?.a ?? [] };
}

// ============================================
// PRIOR PRÉ-MATCH WALK-FORWARD (xG passés uniquement)
// ============================================

interface TeamAcc { games: number; xgFor: number; xgAgainst: number; }

function buildAccumulators(): Map<string, TeamAcc> {
  return new Map();
}

function accAdd(acc: Map<string, TeamAcc>, teamId: string, xgFor: number, xgAgainst: number) {
  const t = acc.get(teamId) ?? { games: 0, xgFor: 0, xgAgainst: 0 };
  t.games++; t.xgFor += xgFor; t.xgAgainst += xgAgainst;
  acc.set(teamId, t);
}

/**
 * Lambdas pré-match (90 min) depuis les xG des matchs ANTÉRIEURS seulement.
 * att/def relatifs à la moyenne ligue, shrinkés vers 1 (n/(n+5)).
 */
function priorLambdas(
  dates: LeagueDate[], idx: number,
  acc: Map<string, TeamAcc>, leagueXg: { games: number; homeXg: number; awayXg: number },
): { lambda_home: number; lambda_away: number } {
  const FALLBACK_AVG = 1.35, FALLBACK_HOME = 1.45, FALLBACK_AWAY = 1.10;
  const avgPerTeam = leagueXg.games > 0
    ? (leagueXg.homeXg + leagueXg.awayXg) / 2 / leagueXg.games
    : FALLBACK_AVG;
  const baseHome = leagueXg.games > 0 ? leagueXg.homeXg / leagueXg.games : FALLBACK_HOME;
  const baseAway = leagueXg.games > 0 ? leagueXg.awayXg / leagueXg.games : FALLBACK_AWAY;

  const m = dates[idx];
  const strength = (teamId: string, forSide: boolean): number => {
    const t = acc.get(teamId);
    if (!t || t.games < MIN_GAMES_PRIOR || avgPerTeam <= 0) return 1;
    const raw = (forSide ? t.xgFor : t.xgAgainst) / t.games / avgPerTeam;
    const s = t.games / (t.games + 5);
    return 1 + (raw - 1) * s;
  };
  const clamp = (v: number) => Math.min(3.2, Math.max(0.25, v));
  return {
    lambda_home: clamp(baseHome * strength(m.h.id, true) * strength(m.a.id, false)),
    lambda_away: clamp(baseAway * strength(m.a.id, true) * strength(m.h.id, false)),
  };
}

// ============================================
// POISSON-DC (baseline pré-match) & BRIER
// ============================================

function poissonPmf(k: number, lambda: number): number {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return Math.exp(-lambda) * Math.pow(lambda, k) / f;
}

function fullMatchProbs(lh: number, la: number): { home: number; draw: number; away: number } {
  const RHO = -0.06, MAX = 10;
  const grid: number[][] = [];
  let sum = 0;
  for (let i = 0; i <= MAX; i++) {
    grid[i] = [];
    for (let j = 0; j <= MAX; j++) {
      let p = poissonPmf(i, lh) * poissonPmf(j, la);
      if (i === 0 && j === 0) p *= 1 - lh * la * RHO;
      else if (i === 0 && j === 1) p *= 1 + lh * RHO;
      else if (i === 1 && j === 0) p *= 1 + la * RHO;
      else if (i === 1 && j === 1) p *= 1 - RHO;
      p = Math.max(p, 0);
      grid[i][j] = p; sum += p;
    }
  }
  let h = 0, d = 0, a = 0;
  for (let i = 0; i <= MAX; i++) for (let j = 0; j <= MAX; j++) {
    const p = grid[i][j] / sum;
    if (i > j) h += p; else if (i === j) d += p; else a += p;
  }
  return { home: h, draw: d, away: a };
}

/** Probas 1X2 normalisées depuis les fair odds (même méthode que store.ts) */
function probsFromFairOdds(fo: { home_win: number; draw: number; away_win: number }) {
  const invSum = 1 / fo.home_win + 1 / fo.draw + 1 / fo.away_win;
  return {
    home: 1 / fo.home_win / invSum,
    draw: 1 / fo.draw / invSum,
    away: 1 / fo.away_win / invSum,
  };
}

function brier(probs: { home: number; draw: number; away: number }, fh: number, fa: number): number {
  const o = fh > fa ? { home: 1, draw: 0, away: 0 }
    : fa > fh ? { home: 0, draw: 0, away: 1 }
    : { home: 0, draw: 1, away: 0 };
  return (probs.home - o.home) ** 2 + (probs.draw - o.draw) ** 2 + (probs.away - o.away) ** 2;
}

function logLoss(probs: { home: number; draw: number; away: number }, fh: number, fa: number): number {
  const p = fh > fa ? probs.home : fa > fh ? probs.away : probs.draw;
  return -Math.log(Math.max(1e-9, p));
}

// ============================================
// TIRS UNDERSTAT → SHOTEVENTS + RÉSUMÉ 1RE MT
// ============================================

function mapOutcome(r: string): ShotEvent['outcome'] {
  switch (r) {
    case 'Goal': return 'goal';
    case 'SavedShot': return 'saved';
    case 'ShotOnPost': return 'post';
    case 'BlockedShot': return 'blocked';
    default: return 'off_target';
  }
}

function mapLocation(x: string, y: string): ShotEvent['location'] {
  const fx = parseFloat(x) || 0, fy = parseFloat(y) || 0;
  if (fx >= 85 && fy >= 30 && fy <= 70) return 'penalty_area';
  if (fx >= 90 && fy >= 40 && fy <= 60) return 'six_yard_box';
  if (fx < 70) return 'long_range';
  return 'outside_box';
}

function parseFirstHalfShots(shots: { h: any[]; a: any[] }): ShotEvent[] {
  const events: ShotEvent[] = [];
  for (const side of ['h', 'a'] as const) {
    for (const s of shots[side]) {
      const minute = parseInt(String(s.minute), 10);
      if (isNaN(minute) || minute > 45) continue; // 1re MT uniquement (+arrêt. → marqué 45)
      const xg = parseFloat(s.xG) || 0;
      events.push({
        minute: Math.max(1, minute),
        team: side === 'h' ? 'home' : 'away',
        xg,
        outcome: mapOutcome(s.result),
        is_big_chance: xg >= 0.30,        // même règle que understatFetcher production
        is_penalty: s.situation === 'Penalty',
        location: mapLocation(s.X, s.Y),
      });
    }
  }
  return events.sort((x, y) => x.minute - y.minute);
}

function buildFirstHalfSummary(shots1H: ShotEvent[]): FirstHalfSummary {
  const sum = (arr: ShotEvent[], f: (s: ShotEvent) => number) => arr.reduce((a, s) => a + f(s), 0);
  const home = shots1H.filter(s => s.team === 'home');
  const away = shots1H.filter(s => s.team === 'away');
  const xgH = sum(home, s => s.xg), xgA = sum(away, s => s.xg);
  const bigH = sum(home, s => (s.is_big_chance && !s.is_penalty ? s.xg : 0));
  const bigA = sum(away, s => (s.is_big_chance && !s.is_penalty ? s.xg : 0));
  const penH = sum(home, s => (s.is_penalty ? s.xg : 0));
  const penA = sum(away, s => (s.is_penalty ? s.xg : 0));
  const onTarget = (arr: ShotEvent[]) =>
    arr.filter(s => s.outcome === 'goal' || s.outcome === 'saved' || s.outcome === 'post').length;

  const windows = [0, 15, 30].map(start => {
    const inW = shots1H.filter(s => s.minute > start && s.minute <= start + 15);
    return {
      window_start: start, window_end: start + 15,
      xg_home: sum(inW.filter(s => s.team === 'home'), s => s.xg),
      xg_away: sum(inW.filter(s => s.team === 'away'), s => s.xg),
    };
  });

  return {
    duration_minutes: 45,
    shots: shots1H,
    summary: {
      xg_total: { home: Math.round(xgH * 100) / 100, away: Math.round(xgA * 100) / 100 },
      xg_big_chance: { home: Math.round(bigH * 100) / 100, away: Math.round(bigA * 100) / 100 },
      xg_penalty: { home: Math.round(penH * 100) / 100, away: Math.round(penA * 100) / 100 },
      xg_routine: {
        home: Math.round((xgH - bigH - penH) * 100) / 100,
        away: Math.round((xgA - bigA - penA) * 100) / 100,
      },
      shots_total: { home: home.length, away: away.length },
      shots_on_target: { home: onTarget(home), away: onTarget(away) },
      possession_pct: { home: 50, away: 50 },
      field_tilt_pct: { home: 50, away: 50 },
      passes_final_third: { home: 0, away: 0 },
      pressures_high: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
      cards: { home_yellow: 0, away_yellow: 0, home_red: 0, away_red: 0 },
    },
    momentum_10min_windows: windows,
  };
}

// ============================================
// MAIN
// ============================================

interface MatchResult {
  league: string; match_id: string; home: string; away: string;
  kickoff: string; score_ht: { home: number; away: number }; score_ft: { home: number; away: number };
  prior_lambda_home: number; prior_lambda_away: number;
  xg1h_home: number; xg1h_away: number; shots1h: number;
  shrinked_home_fixed: number; shrinked_away_fixed: number;
  shrinked_home_buggy: number; shrinked_away_buggy: number;
  lambda2h_home_fixed: number; lambda2h_away_fixed: number;
  lambda2h_home_buggy: number; lambda2h_away_buggy: number;
  probs_pre: { home: number; draw: number; away: number };
  probs_fixed: { home: number; draw: number; away: number };
  probs_buggy: { home: number; draw: number; away: number };
  brier_pre: number; brier_fixed: number; brier_buggy: number;
  logloss_pre: number; logloss_fixed: number; logloss_buggy: number;
}

async function main() {
  console.log(`╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║  BACKTEST A/B — FIX SHRINKAGE (ed34f47) | Understat ${SEASON}-${parseInt(SEASON) + 1}      ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);
  console.log(`Échantillon cible : ${PER_LEAGUE}/ligue × ${LEAGUES.length} | délai ${DELAY_MS}ms\n`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(JSONL_PATH, '');

  const results: MatchResult[] = [];
  let fetchCount = 0;

  for (const league of LEAGUES) {
    console.log(`\n────── ${league.name} (${league.code}) ──────`);
    let dates: LeagueDate[];
    try {
      dates = await fetchLeagueDates(league.code);
    } catch (e: any) {
      console.error(`  ❌ getLeagueData échoué (${e.message}) — ligue ignorée`);
      continue;
    }
    fetchCount++;
    dates.sort((a, b) => a.datetime.localeCompare(b.datetime));
    console.log(`  ${dates.length} matchs joués récupérés`);

    // Marche avant : accumulateurs + sélection équirépartie des matchs éligibles
    const acc = buildAccumulators();
    const lg = { games: 0, homeXg: 0, awayXg: 0 };
    const eligible: number[] = [];
    const priorAt: Map<number, { lambda_home: number; lambda_away: number }> = new Map();

    for (let i = 0; i < dates.length; i++) {
      const m = dates[i];
      const hAcc = acc.get(m.h.id), aAcc = acc.get(m.a.id);
      if (hAcc && hAcc.games >= MIN_GAMES_PRIOR && aAcc && aAcc.games >= MIN_GAMES_PRIOR) {
        eligible.push(i);
        priorAt.set(i, priorLambdas(dates, i, acc, lg));
      }
      // IMPORTANT : update APRÈS avoir figé le prior de ce match (walk-forward)
      const xh = parseFloat(m.xG?.h ?? '') || 0, xa = parseFloat(m.xG?.a ?? '') || 0;
      accAdd(acc, m.h.id, xh, xa);
      accAdd(acc, m.a.id, xa, xh);
      lg.games++; lg.homeXg += xh; lg.awayXg += xa;
    }
    console.log(`  ${eligible.length} matchs éligibles (2 équipes ≥ ${MIN_GAMES_PRIOR} matchs)`);

    const n = Math.min(PER_LEAGUE, eligible.length);
    const picked: number[] = [];
    for (let j = 0; j < n; j++) {
      picked.push(eligible[Math.round((j * (eligible.length - 1)) / Math.max(1, n - 1))]);
    }

    let done = 0, failed = 0;
    for (const idx of picked) {
      const m = dates[idx];
      const prior = priorAt.get(idx)!;
      await sleep(DELAY_MS + Math.random() * 300);
      try {
        const shots = await fetchMatchShots(m.id);
        fetchCount++;
        const shots1H = parseFirstHalfShots(shots);
        const score_ht = {
          home: shots1H.filter(s => s.team === 'home' && s.outcome === 'goal').length,
          away: shots1H.filter(s => s.team === 'away' && s.outcome === 'goal').length,
        };
        const score_ft = { home: parseInt(m.goals.h, 10), away: parseInt(m.goals.a, 10) };

        const preMatch: PreMatchModel = {
          home_attack_rating: prior.lambda_home,
          home_defense_rating: Math.max(0.3, 1.5 - prior.lambda_away),
          away_attack_rating: prior.lambda_away,
          away_defense_rating: Math.max(0.3, 1.5 - prior.lambda_home),
          lambda_home: prior.lambda_home,
          lambda_away: prior.lambda_away,
          predicted_outcome_probs: fullMatchProbs(prior.lambda_home, prior.lambda_away),
        };

        const input: LiveCalibrationInput = {
          match_id: `us_${m.id}`,
          home_team: m.h.title, away_team: m.a.title,
          league: league.name,
          kickoff_utc: new Date(m.datetime.replace(' ', 'T') + 'Z').toISOString(),
          halftime_utc: new Date(m.datetime.replace(' ', 'T') + 'Z').toISOString(),
          score_ht, first_half: buildFirstHalfSummary(shots1H),
          pre_match_model: preMatch,
          // pas de cotes HT → pas de value bets (on compare les probas fair)
        };

        const outFixed = calibrateFixed(input);
        const outBuggy = calibrateBuggy(input);

        const probsPre = preMatch.predicted_outcome_probs;
        const probsFixed = probsFromFairOdds(outFixed.halftime_fair_odds);
        const probsBuggy = probsFromFairOdds(outBuggy.halftime_fair_odds);

        results.push({
          league: league.code, match_id: m.id, home: m.h.title, away: m.a.title,
          kickoff: m.datetime, score_ht, score_ft,
          prior_lambda_home: prior.lambda_home, prior_lambda_away: prior.lambda_away,
          xg1h_home: outFixed.filtered_xg.home.raw, xg1h_away: outFixed.filtered_xg.away.raw,
          shots1h: shots1H.length,
          shrinked_home_fixed: outFixed.filtered_xg.home.shrinked,
          shrinked_away_fixed: outFixed.filtered_xg.away.shrinked,
          shrinked_home_buggy: outBuggy.filtered_xg.home.shrinked,
          shrinked_away_buggy: outBuggy.filtered_xg.away.shrinked,
          lambda2h_home_fixed: outFixed.lambda_remaining.lambda_home_2nd_half,
          lambda2h_away_fixed: outFixed.lambda_remaining.lambda_away_2nd_half,
          lambda2h_home_buggy: outBuggy.lambda_remaining.lambda_home_2nd_half,
          lambda2h_away_buggy: outBuggy.lambda_remaining.lambda_away_2nd_half,
          probs_pre: probsPre, probs_fixed: probsFixed, probs_buggy: probsBuggy,
          brier_pre: brier(probsPre, score_ft.home, score_ft.away),
          brier_fixed: brier(probsFixed, score_ft.home, score_ft.away),
          brier_buggy: brier(probsBuggy, score_ft.home, score_ft.away),
          logloss_pre: logLoss(probsPre, score_ft.home, score_ft.away),
          logloss_fixed: logLoss(probsFixed, score_ft.home, score_ft.away),
          logloss_buggy: logLoss(probsBuggy, score_ft.home, score_ft.away),
        });
        done++;
        if (done % 10 === 0) console.log(`  … ${done}/${n} matchs traités`);
      } catch (e: any) {
        failed++;
        console.warn(`  ⚠️ match ${m.id} (${m.h.title}-${m.a.title}) échoué : ${e.message}`);
      }
    }
    console.log(`  ✓ ${done} traités, ${failed} échoués`);

    // Écriture incrémentale (résilience si interruption)
    const leagueResults = results.filter(r => r.league === league.code);
    if (leagueResults.length > 0) {
      fs.appendFileSync(JSONL_PATH, leagueResults.map(r => JSON.stringify(r)).join('\n') + '\n');
    }
  }

  // ============================================
  // RAPPORT
  // ============================================
  printReport(results);
}

function mean(a: number[]): number { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

function pairedReport(results: MatchResult[], label: string, getA: (r: MatchResult) => number, getB: (r: MatchResult) => number) {
  const n = results.length;
  const a = mean(results.map(getA)), b = mean(results.map(getB));
  const deltas = results.map(r => getA(r) - getB(r));
  const sd = Math.sqrt(mean(deltas.map(d => d * d)) - mean(deltas) ** 2) || 0;
  const se = sd / Math.sqrt(n);
  const wins = deltas.filter(d => d < -1e-9).length;   // A < B → A meilleur (Brier bas)
  const losses = deltas.filter(d => d > 1e-9).length;
  const ties = n - wins - losses;
  console.log(`   ${label.padEnd(28)} ${a.toFixed(4)} vs ${b.toFixed(4)}  Δ ${a - b >= 0 ? '+' : ''}${(a - b).toFixed(4)} (±${se.toFixed(4)}) | A meilleur sur ${wins}/${n} (${(100 * wins / n).toFixed(1)}%), défaites ${losses}, ties ${ties}`);
  return { a, b, delta: a - b, se, wins, losses, ties };
}

function printReport(results: MatchResult[]) {
  const W = 74;
  console.log('\n' + '═'.repeat(W));
  console.log('📊 RÉSULTATS BACKTEST A/B — IMPACT DU FIX SHRINKAGE');
  console.log('═'.repeat(W));
  if (results.length === 0) { console.log('Aucun résultat.'); return; }

  console.log(`\n   Échantillon : ${results.length} matchs réels (big-5, saison ${SEASON}-${parseInt(SEASON) + 1})`);
  console.log(`   xG 1re MT moyen : ${mean(results.map(r => r.xg1h_home + r.xg1h_away)).toFixed(2)} | buts MT moyens : ${mean(results.map(r => r.score_ht.home + r.score_ht.away)).toFixed(2)}`);

  // Sanity check du mécanisme
  const avgShrFixed = mean(results.map(r => r.shrinked_home_fixed + r.shrinked_away_fixed));
  const avgShrBuggy = mean(results.map(r => r.shrinked_home_buggy + r.shrinked_away_buggy));
  const avgRaw = mean(results.map(r => r.xg1h_home + r.xg1h_away));
  console.log(`\n   🔬 SANITY — xG shrinké moyen (2 équipes) : brut ${avgRaw.toFixed(3)} | fixé ${avgShrFixed.toFixed(3)} | buggé ${avgShrBuggy.toFixed(3)}`);
  console.log(`      → le bug écrasait le signal d'un facteur ≈ ${(avgShrFixed / Math.max(1e-9, avgShrBuggy)).toFixed(1)}×`);

  console.log('\n   📉 BRIER 1X2 (plus bas = meilleur) — comparaisons appariées :');
  pairedReport(results, 'fixé vs buggé', r => r.brier_fixed, r => r.brier_buggy);
  pairedReport(results, 'fixé vs pré-match', r => r.brier_fixed, r => r.brier_pre);
  pairedReport(results, 'buggé vs pré-match', r => r.brier_buggy, r => r.brier_pre);

  console.log('\n   📉 LOG LOSS 1X2 :');
  pairedReport(results, 'fixé vs buggé', r => r.logloss_fixed, r => r.logloss_buggy);
  pairedReport(results, 'fixé vs pré-match', r => r.logloss_fixed, r => r.logloss_pre);
  pairedReport(results, 'buggé vs pré-match', r => r.logloss_buggy, r => r.logloss_pre);

  // Buckets par volume de xG 1re MT
  console.log('\n   🎚️  PAR VOLUME DE xG 1re MT (Brier fixé vs buggé) :');
  const buckets: [string, (r: MatchResult) => boolean][] = [
    ['xG total < 0.8 (fermé)', r => r.xg1h_home + r.xg1h_away < 0.8],
    ['0.8 ≤ xG total < 1.8', r => r.xg1h_home + r.xg1h_away >= 0.8 && r.xg1h_home + r.xg1h_away < 1.8],
    ['xG total ≥ 1.8 (ouvert)', r => r.xg1h_home + r.xg1h_away >= 1.8],
  ];
  for (const [label, cond] of buckets) {
    const sub = results.filter(cond);
    if (sub.length === 0) continue;
    pairedReport(sub, label, r => r.brier_fixed, r => r.brier_buggy);
  }

  // Par ligue
  console.log('\n   🏆 PAR LIGUE (Brier fixé vs buggé) :');
  for (const lg of LEAGUES) {
    const sub = results.filter(r => r.league === lg.code);
    if (sub.length === 0) continue;
    pairedReport(sub, lg.name, r => r.brier_fixed, r => r.brier_buggy);
  }

  // Divergence de pick
  const pick = (p: { home: number; draw: number; away: number }) =>
    p.home >= p.draw && p.home >= p.away ? 'H' : p.away >= p.draw ? 'A' : 'D';
  const pickDiff = results.filter(r => pick(r.probs_fixed) !== pick(r.probs_buggy)).length;
  const pickHitsFixed = results.filter(r => pick(r.probs_fixed) === pickOfScore(r.score_ft)).length;
  const pickHitsBuggy = results.filter(r => pick(r.probs_buggy) === pickOfScore(r.score_ft)).length;
  console.log(`\n   🎯 PICKS : divergences fixé/buggé ${pickDiff} (${(100 * pickDiff / results.length).toFixed(1)}%)`);
  console.log(`      picks gagnants : fixé ${pickHitsFixed}/${results.length} (${(100 * pickHitsFixed / results.length).toFixed(1)}%) vs buggé ${pickHitsBuggy}/${results.length} (${(100 * pickHitsBuggy / results.length).toFixed(1)}%)`);

  console.log('\n' + '═'.repeat(W));
  console.log(`📁 Détails par match : ${JSONL_PATH}`);
}

function pickOfScore(s: { home: number; away: number }): 'H' | 'D' | 'A' {
  return s.home > s.away ? 'H' : s.away > s.home ? 'A' : 'D';
}

main().catch(e => { console.error('❌ ERREUR FATALE', e); process.exit(1); });
