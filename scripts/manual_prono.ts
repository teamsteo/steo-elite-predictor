/**
 * manual_prono.ts — Pronostic live à partir de captures d'écran (SofaScore/FlashScore/beds)
 *
 * Usage : npx tsx scripts/manual_prono.ts <input.json>
 *
 * Le JSON est rempli manuellement à partir des captures d'écran :
 *   - stats 1re mi-temps (xG, tirs, cadrés, grosses occasions, possession, corners, cartons)
 *   - cotes pre-match (1X2 + O/U 2.5) → modèle pré-match estimé par de-vig + Poisson
 *   - cotes live (1X2, O/U, BTTS) → détection de value bets
 *
 * Pipeline : de-vig odds → estimatePreMatch → synthèse tirs → noiseFilter →
 *   gameStateBias → Bayesian Dixon-Coles → fair odds → confidence → value bets
 */

import { calibrate } from '../src/lib/liveCalibration/calibrate';
import { computeGameStateBias } from '../src/lib/liveCalibration/gameStateBias';
import {
  finalOutcomeProbabilities, overUnderProbabilities, bttsProbabilities,
} from '../src/lib/liveCalibration/bayesianDixonColes';
import type {
  LiveCalibrationInput, FirstHalfSummary, ShotEvent,
  PreMatchModel, LiveCalibrationOutput, MomentumWindow,
} from '../src/lib/liveCalibration/types';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// TYPES D'ENTRÉE MANUELLE (depuis captures)
// ============================================

interface Pair { home?: number; away?: number; }

interface ManualInput {
  match: {
    home_team: string;
    away_team: string;
    league?: string;
    kickoff_utc?: string;
    minute?: number;              // minute de la capture (défaut 45 = mi-temps)
    score: { home: number; away: number };
    // Capture de référence si pre_match.odds vient d'une capture LIVE (pas pre-match) :
    // seuls les buts marqués DEPUIS l'ancre sont observés par le modèle (anti double-comptage)
    anchor_minute?: number;
    anchor_score?: { home: number; away: number };
    match_id?: string;
  };
  stats?: {                    // absent → mode « score seul » (captures cotes sans stats)
    xg?: Pair;                    // si absent, estimé depuis les tirs
    shots: Pair;
    shots_on_target?: Pair;
    big_chances?: Pair;
    penalties?: Pair;             // penalties tirés (marqués ou non)
    possession_pct?: Pair;
    field_tilt_pct?: Pair;
    corners?: Pair;
    cards?: {
      home_yellow?: number; away_yellow?: number;
      home_red?: number; away_red?: number;
    };
    momentum?: MomentumWindow[];  // optionnel : timeline xG par tranches de 15'
  };
  pre_match?: {
    model?: {                     // si connu (lambda 90 min attendus)
      lambda_home?: number; lambda_away?: number;
    };
    odds?: {                      // sinon estimé depuis les cotes
      home: number; draw: number; away: number;
      over_2_5?: number; under_2_5?: number;
    };
  };
  live_odds?: {                   // cotes au moment de la capture
    home_win?: number; draw?: number; away_win?: number;
    over_2_5?: number; under_2_5?: number;
    btts_yes?: number; btts_no?: number;
  };
}

// ============================================
// HELPERS POISSON / DIXON-COLES
// ============================================

function poissonPmf(k: number, lambda: number): number {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return Math.exp(-lambda) * Math.pow(lambda, k) / f;
}

/** 1X2 full-match via grille Poisson bivariée + correction DC (rho=-0.06) */
export function fullMatchProbs(lh: number, la: number): { home: number; draw: number; away: number } {
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
      grid[i][j] = p;
      sum += p;
    }
  }
  let h = 0, d = 0, a = 0;
  for (let i = 0; i <= MAX; i++) {
    for (let j = 0; j <= MAX; j++) {
      const p = grid[i][j] / sum;
      if (i > j) h += p; else if (i === j) d += p; else a += p;
    }
  }
  return { home: h, draw: d, away: a };
}

export function devig(odds: number[]): number[] {
  const raw = odds.map(o => 1 / o);
  const s = raw.reduce((x, y) => x + y, 0);
  return raw.map(r => r / s);
}

/**
 * Estime le modèle pré-match (lambdas 90 min) depuis les cotes :
 *   - lambda_total : inversé depuis Over/Under 2.5 (si dispo)
 *   - supremacy    : recherche binaire pour matcher le skew 1X2 dé-vigorisé
 */
export function estimatePreMatchFromOdds(
  o: { home: number; draw: number; away: number; over_2_5?: number; under_2_5?: number },
): PreMatchModel {
  const [pH, pD, pA] = devig([o.home, o.draw, o.away]);

  // 1. lambda_total depuis O/U 2.5 (total de buts ~ Poisson(lambda_total))
  // P(N > 2) croît avec λ → si P(λ_mid) > cible, λ trop grand → hi = mid
  let lambdaTotal = 2.6;
  if (o.over_2_5 && o.under_2_5) {
    const [pOv] = devig([o.over_2_5, o.under_2_5]);
    let lo = 0.5, hi = 6;
    for (let it = 0; it < 60; it++) {
      const mid = (lo + hi) / 2;
      const pLe2 = Math.exp(-mid) * (1 + mid + mid * mid / 2);
      if ((1 - pLe2) > pOv) hi = mid; else lo = mid;
    }
    lambdaTotal = (lo + hi) / 2;
  }

  // 2. supremacy depuis le skew 1X2
  const targetSkew = (pH - pA) / (pH + pA + 1e-9);
  let lo = -2.5, hi = 2.5;
  for (let it = 0; it < 60; it++) {
    const mid = (lo + hi) / 2;
    const lh = Math.max(0.05, (lambdaTotal + mid) / 2);
    const la = Math.max(0.05, (lambdaTotal - mid) / 2);
    const r = fullMatchProbs(lh, la);
    const skew = (r.home - r.away) / (r.home + r.away + 1e-9);
    if (skew < targetSkew) lo = mid; else hi = mid;
  }
  const s = (lo + hi) / 2;
  const lambdaHome = Math.min(4.5, Math.max(0.15, (lambdaTotal + s) / 2));
  const lambdaAway = Math.min(4.5, Math.max(0.15, (lambdaTotal - s) / 2));

  const probs = fullMatchProbs(lambdaHome, lambdaAway);
  return {
    home_attack_rating: lambdaHome,
    home_defense_rating: Math.max(0.3, 1.5 - lambdaAway),
    away_attack_rating: lambdaAway,
    away_defense_rating: Math.max(0.3, 1.5 - lambdaHome),
    lambda_home: lambdaHome,
    lambda_away: lambdaAway,
    predicted_outcome_probs: probs,
  };
}

// ============================================
// SYNTHÈSE DES TIRS (depuis stats agrégées)
// ============================================

/** xG estimé si la capture n'affiche pas le xG : heuristique tirs/cadrés/occasions */
function estimateXgFallback(stats: ManualInput['stats'], side: 'home' | 'away'): number {
  const shots = stats.shots[side] ?? 0;
  const sot = stats.shots_on_target?.[side] ?? Math.round(shots / 3);
  const bigs = stats.big_chances?.[side] ?? 0;
  const base = sot * 0.095 + Math.max(0, shots - sot) * 0.026;
  return Math.round((base + bigs * 0.11) * 100) / 100;
}

/** Construit une liste de ShotEvent cohérente avec les stats agrégées de la capture */
function synthesizeShots(stats: ManualInput['stats'], side: 'home' | 'away', duration: number): ShotEvent[] {
  const totalShots = Math.max(0, stats.shots[side] ?? 0);
  const pens = Math.min(stats.penalties?.[side] ?? 0, totalShots);
  const bigsRaw = Math.max(0, (stats.big_chances?.[side] ?? 0) - pens);
  const bigs = Math.min(bigsRaw, Math.max(0, totalShots - pens));
  const routineCount = Math.max(0, totalShots - pens - bigs);
  const rawXg = stats.xg?.[side] ?? estimateXgFallback(stats, side);
  const team = side as 'home' | 'away';

  let remaining = Math.max(0, rawXg - pens * 0.76);
  const events: ShotEvent[] = [];

  // Penalties (xG fixe 0.76)
  for (let i = 0; i < pens; i++) {
    events.push({
      minute: Math.max(1, Math.round(duration * (i + 0.5) / (pens + 1))),
      team, xg: 0.76, outcome: 'saved',
      is_penalty: true, is_big_chance: true, location: 'penalty_area',
    });
  }

  // Grosses occasions (~0.28-0.45 chacune, 55% du xG restant max)
  if (bigs > 0 && remaining > 0) {
    const each = Math.min(0.45, Math.max(0.22, (remaining * 0.6) / bigs));
    for (let i = 0; i < bigs; i++) {
      events.push({
        minute: Math.max(1, Math.round(duration * (i + 0.7) / (bigs + 1))),
        team, xg: Math.round(each * 100) / 100, outcome: 'saved',
        is_big_chance: true, location: 'penalty_area',
      });
    }
    remaining -= each * bigs;
  }

  // Tirs routine : le reste, réparti uniformément
  const routineXg = Math.max(0, remaining);
  if (routineCount === 0 && routineXg > 0.01) {
    events.push({
      minute: Math.max(1, Math.round(duration / 2)), team,
      xg: Math.round(routineXg * 100) / 100, outcome: 'blocked', location: 'outside_box',
    });
  } else if (routineCount > 0) {
    const each = Math.min(0.18, Math.max(0.015, routineXg / routineCount));
    for (let i = 0; i < routineCount; i++) {
      events.push({
        minute: Math.max(1, Math.round((duration * (i + 1)) / (routineCount + 1))),
        team, xg: Math.round(each * 100) / 100, outcome: 'off_target', location: 'outside_box',
      });
    }
  }

  return events;
}

// ============================================
// CONSTRUCTION DE L'INPUT PIPELINE
// ============================================

function pad(v: number | undefined, def: number): number { return v ?? def; }

function buildFirstHalfSummary(m: ManualInput, duration: number): FirstHalfSummary {
  const s = m.stats;
  const shots = [
    ...synthesizeShots(s, 'home', duration),
    ...synthesizeShots(s, 'away', duration),
  ];
  // Momentum : fourni optionnellement, sinon répartition plate (pente = 0)
  const momentum: MomentumWindow[] = s.momentum && s.momentum.length >= 2 ? s.momentum : [
    { window_start: 0, window_end: 15, xg_home: (s.xg?.home ?? 0) / 3, xg_away: (s.xg?.away ?? 0) / 3 },
    { window_start: 15, window_end: 30, xg_home: (s.xg?.home ?? 0) / 3, xg_away: (s.xg?.away ?? 0) / 3 },
    { window_start: 30, window_end: 45, xg_home: (s.xg?.home ?? 0) / 3, xg_away: (s.xg?.away ?? 0) / 3 },
  ];
  const xgHome = Math.round(shots.filter(x => x.team === 'home').reduce((a, b) => a + b.xg, 0) * 100) / 100;
  const xgAway = Math.round(shots.filter(x => x.team === 'away').reduce((a, b) => a + b.xg, 0) * 100) / 100;
  const posH = pad(s.possession_pct?.home, 50);
  const posA = 100 - posH;
  const ftH = pad(s.field_tilt_pct?.home, Math.round(posH));
  const ftA = 100 - ftH;

  return {
    duration_minutes: duration,
    shots,
    summary: {
      xg_total: { home: xgHome, away: xgAway },
      xg_big_chance: { home: 0, away: 0 },   // recalculé par le noise filter
      xg_penalty: { home: 0, away: 0 },
      xg_routine: { home: 0, away: 0 },
      shots_total: { home: pad(s.shots.home, 0), away: pad(s.shots.away, 0) },
      shots_on_target: {
        home: pad(s.shots_on_target?.home, Math.round(pad(s.shots.home, 0) / 3)),
        away: pad(s.shots_on_target?.away, Math.round(pad(s.shots.away, 0) / 3)),
      },
      possession_pct: { home: posH, away: posA },
      field_tilt_pct: { home: ftH, away: ftA },
      passes_final_third: { home: 0, away: 0 },
      pressures_high: { home: 0, away: 0 },
      corners: { home: pad(s.corners?.home, 0), away: pad(s.corners?.away, 0) },
      cards: {
        home_yellow: pad(s.cards?.home_yellow, 0),
        away_yellow: pad(s.cards?.away_yellow, 0),
        home_red: pad(s.cards?.home_red, 0),
        away_red: pad(s.cards?.away_red, 0),
      },
    },
    momentum_10min_windows: momentum,
  };
}

/** Score final le plus probable via grille Poisson sur la 2e période */
function mostLikelyScoreline(ht: { home: number; away: number }, lh: number, la: number) {
  const lines: { score: string; p: number }[] = [];
  let pH = 0, pD = 0, pA = 0;
  for (let i = 0; i <= 7; i++) {
    for (let j = 0; j <= 7; j++) {
      const p = poissonPmf(i, lh) * poissonPmf(j, la);
      const fh = ht.home + i, fa = ht.away + j;
      lines.push({ score: `${fh}-${fa}`, p });
      if (fh > fa) pH += p; else if (fh === fa) pD += p; else pA += p;
    }
  }
  lines.sort((a, b) => b.p - a.p);
  const total = lines.reduce((a, b) => a + b.p, 0);
  return {
    top3: lines.slice(0, 3).map(l => ({ score: l.score, p: l.p / total })),
    probs: { home: pH / total, draw: pD / total, away: pA / total },
  };
}

// ============================================
// RAPPORT PRONOSTIC
// ============================================

const MARKET_LABELS: Record<string, string> = {
  home_win: 'Victoire domicile (1)',
  draw: 'Match nul (X)',
  away_win: 'Victoire extérieur (2)',
  match_winner_home: 'Victoire domicile (1)',
  match_winner_draw: 'Match nul (X)',
  match_winner_away: 'Victoire extérieur (2)',
  over_2_5: 'Plus de 2,5 buts',
  under_2_5: 'Moins de 2,5 buts',
  btts_yes: 'BTTS — Oui',
  btts_no: 'BTTS — Non',
};

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const o2 = (v: number) => v.toFixed(2);
const line = (c: string, n: number) => c.repeat(n);

function printReport(out: LiveCalibrationOutput, input: LiveCalibrationInput, source: string, minute: number) {
  const fo = out.halftime_fair_odds;
  const live = input.bookmaker_odds_ht ?? {};
  const score = input.score_ht;
  const W = 64;
  const nameH = input.home_team.toUpperCase();
  const nameA = input.away_team.toUpperCase();

  console.log(line('═', W));
  console.log(`  PRONOSTIC LIVE — ${nameH} ${score.home}-${score.away} ${nameA}  (${minute}')`);
  console.log(`  ${input.league ?? ''} | Modèle pré-match : ${source}`);
  console.log(line('═', W));

  // 1. xG filtrés
  console.log('\n📊 XG 1RE PÉRIODE (d après captures, après filtrage du bruit)');
  for (const [side, label] of [['home', nameH], ['away', nameA]] as const) {
    const fx = out.filtered_xg[side];
    console.log(`   ${label.padEnd(18)} brut ${o2(fx.raw)}  |  shrinké ${o2(fx.shrinked)}  |  grosses occ. ${o2(fx.big_chance)}  |  qualité signal ${pct(fx.signal_quality)}`);
  }

  // 2. Lambdas 2e période
  console.log('\n🎯 LAMBDAS 2E PÉRIODE (Bayesian Dixon-Coles)');
  const lr = out.lambda_remaining;
  const lu = out.lambda_update;
  const wTotal = lu.prior_weight_used + lu.observed_weight_used;
  console.log(`   ${nameH} ${o2(lr.lambda_home_2nd_half)} — ${o2(lr.lambda_away_2nd_half)} ${nameA}`);
  console.log(`   Poids prior pré-match : ${pct(lu.prior_weight_used / wTotal)} | observation live : ${pct(lu.observed_weight_used / wTotal)}`);

  // 3. Probabilités recalées
  const sl = mostLikelyScoreline(score, lr.lambda_home_2nd_half, lr.lambda_away_2nd_half);
  console.log('\n📈 PROBABILITÉS FINALES RECALÉES (fair, sans marge)');
  const markets: [string, number, number | undefined][] = [
    ['1 (Victoire ' + nameH + ')', 1 / fo.home_win, live.home_win],
    ['X (Match nul)', 1 / fo.draw, live.draw],
    ['2 (Victoire ' + nameA + ')', 1 / fo.away_win, live.away_win],
    ['Over 2,5 buts', 1 / fo.over_2_5, live.over_2_5],
    ['Under 2,5 buts', 1 / fo.under_2_5, live.under_2_5],
    ['BTTS Oui', 1 / fo.btts_yes, live.btts_yes],
    ['BTTS Non', 1 / fo.btts_no, live.btts_no],
  ];
  const hasLive = Object.values(live).some(v => v !== undefined);
  if (hasLive) {
    console.log(`   ${'MARCHÉ'.padEnd(24)} ${'MODÈLE'.padEnd(9)} ${'FAIR'.padEnd(7)} ${'COTE'.padEnd(7)} EDGE`);
    console.log(`   ${line('─', 56)}`);
    for (const [label, prob, book] of markets) {
      if (!book) { continue; }
      const edge = (prob * book - 1) * 100;
      const flag = edge >= 5 ? '✅' : edge >= 2 ? '≈' : '—';
      console.log(`   ${label.padEnd(24)} ${pct(prob).padEnd(9)} ${o2(1 / prob).padEnd(7)} ${o2(book).padEnd(7)} ${(edge >= 0 ? '+' : '') + edge.toFixed(1)}% ${flag}`);
    }
  } else {
    console.log(`   ${'MARCHÉ'.padEnd(24)} ${'PROBA'.padEnd(9)} FAIR ODDS`);
    console.log(`   ${line('─', 45)}`);
    for (const [label, prob] of markets) {
      console.log(`   ${label.padEnd(24)} ${pct(prob).padEnd(9)} ${o2(1 / prob)}`);
    }
    console.log('\n   ⚠️  Pas de cotes live fournies → détection de value indisponible.');
  }

  // 4. Scores les plus probables
  console.log('\n🔤 SCORES FINAUX LES PLUS PROBABLES');
  for (const t of sl.top3) console.log(`   ${t.score.padEnd(6)} ${pct(t.p)}`);

  // 5. Confidence
  console.log('\n🔒 CONFIANCE : ' + `${out.confidence_index.toFixed(1)}/100 (${out.confidence_level})`);
  const cb = out.calibration_components;
  const r1 = (v: number) => v.toFixed(1);
  console.log(`   Échantillon ${r1(cb.sample_size_score)}/25 | Qualité signal ${r1(cb.signal_quality_score)}/25 | Stabilité game state ${r1(cb.game_state_stability)}/25 | Accord pré-match ${r1(cb.pre_model_agreement)}/25`);

  // 6. Value bets
  if (out.value_bets_detected.length > 0) {
    console.log('\n💰 VALUE BETS DÉTECTÉS (edge ≥ 5% & confiance ≥ 50)');
    for (const vb of out.value_bets_detected) {
      console.log(`   ▶ ${MARKET_LABELS[vb.market] ?? vb.market} @ ${o2(vb.bookmaker_odds)} (fair ${o2(vb.fair_odds)}) | edge +${vb.edge_pct.toFixed(1)}% | ${vb.recommendation}`);
      console.log(`     ${vb.reasoning}`);
    }
  } else {
    console.log('\n💰 VALUE BETS : aucun ne passe les seuils (edge ≥ 5%, confiance ≥ 50)');
  }

  // 7. Prono final
  const best = Object.entries(sl.probs).sort((a, b) => (b[1] as number) - (a[1] as number))[0] as [string, number];
  const bestLabel = best[0] === 'home' ? `1 — Victoire ${nameH}` : best[0] === 'draw' ? 'X — Match nul' : `2 — Victoire ${nameA}`;
  const bestFair = best[0] === 'home' ? fo.home_win : best[0] === 'draw' ? fo.draw : fo.away_win;
  const bestBook = best[0] === 'home' ? live.home_win : best[0] === 'draw' ? live.draw : live.away_win;
  console.log('\n' + line('═', W));
  console.log('✅ PRONO : ' + bestLabel + `  (${pct(best[1])}, fair ${o2(bestFair)}${bestBook ? `, cote dispo ${o2(bestBook)}` : ''})`);
  console.log(`   Score le plus probable : ${sl.top3[0].score} | 2e période attendue ≈ ${(lr.lambda_home_2nd_half + lr.lambda_away_2nd_half).toFixed(2)} but(s)`);
  if (minute < 42) {
    console.log('   ⚠️  Capture avant la 42e minute : signal encore bruité, prono à reconfirmer à la mi-temps.');
  } else if (minute > 55) {
    console.log(`   ⚠️  Capture à la ${minute}e : fenêtre de value réduite, les cotes bougent vite.`);
  }
  console.log(line('═', W));
}

// ============================================
// MODE SCORE SEUL (captures Betclic : score + cotes, sans stats)
// ============================================

/**
 * Mise à jour bayésienne Poisson-Gamma sur le taux de buts :
 *   prior Gamma(a0, b0), a0 = lambda_90, b0 = 90 min équivalentes
 *   observation : G buts en M minutes → posterior (a0+G_neutral)/(b0+M)
 * Les buts sont « neutralisés » du game state (même philosophie que le
 * pipeline xG : on dé-biaise l'observation avant de projeter).
 */
export function scoreOnlyFairOdds(
  score: { home: number; away: number },
  minute: number,
  preMatch: PreMatchModel,
  anchor?: { minute: number; score: { home: number; away: number } },
) {
  const M = Math.min(90, Math.max(1, minute));
  const rem = Math.max(1, 90 - M);
  const gs = computeGameStateBias(score.home, score.away, true);
  // Buts à expliquer : depuis l'ancre si fournie (sinon score complet)
  const rawGoalsH = anchor ? score.home - anchor.score.home : score.home;
  const rawGoalsA = anchor ? score.away - anchor.score.away : score.away;
  const Mobs = anchor ? Math.max(1, M - anchor.minute) : M;
  const ghNeutral = gs.home_attack_multiplier > 0.1 ? rawGoalsH / gs.home_attack_multiplier : rawGoalsH;
  const gaNeutral = gs.away_attack_multiplier > 0.1 ? rawGoalsA / gs.away_attack_multiplier : rawGoalsA;
  const B0 = 90; // minutes équivalentes du prior
  const rateH = (preMatch.lambda_home + ghNeutral) / (B0 + Mobs);
  const rateA = (preMatch.lambda_away + gaNeutral) / (B0 + Mobs);
  const lh = rateH * rem;
  const la = rateA * rem;

  const outcomes = finalOutcomeProbabilities(score.home, score.away, lh, la);
  const ou = overUnderProbabilities(score.home, score.away, lh, la, 2.5);
  const btts = bttsProbabilities(score.home, score.away, lh, la);
  const inv = (p: number) => (p > 1e-6 ? 1 / p : 999);
  return {
    lambdas: { home: lh, away: la },
    fair: {
      home_win: inv(outcomes.home), draw: inv(outcomes.draw), away_win: inv(outcomes.away),
      over_2_5: inv(ou.over), under_2_5: inv(ou.under),
      btts_yes: inv(btts.yes), btts_no: inv(btts.no),
    },
  };
}

function printScoreOnlyReport(
  m: ManualInput, preMatch: PreMatchModel, source: string, anchorWarning: boolean,
) {
  const minute = Math.min(90, Math.max(1, m.match.minute ?? 45));
  const anchor = m.match.anchor_minute != null && m.match.anchor_score
    ? { minute: m.match.anchor_minute, score: m.match.anchor_score }
    : undefined;
  const { fair, lambdas } = scoreOnlyFairOdds(m.match.score, minute, preMatch, anchor);
  const live = m.live_odds ?? {};
  const W = 64;
  const nameH = m.match.home_team.toUpperCase();
  const nameA = m.match.away_team.toUpperCase();

  console.log(line('═', W));
  console.log(`  PRONOSTIC LIVE (SCORE SEUL) — ${nameH} ${m.match.score.home}-${m.match.score.away} ${nameA}  (${minute}')`);
  console.log(`  ${m.match.league ?? ''} | Prior : ${source}`);
  console.log(line('═', W));
  console.log('\n🎯 LAMBDAS RESTANTS (Poisson-Gamma, buts neutralisés game state)');
  console.log(`   ${nameH} ${o2(lambdas.home)} — ${o2(lambdas.away)} ${nameA}  (≈ ${(lambdas.home + lambdas.away).toFixed(2)} buts à venir)`);

  const markets: [string, number, number | undefined][] = [
    [`1 (Victoire ${nameH})`, 1 / fair.home_win, live.home_win],
    ['X (Match nul)', 1 / fair.draw, live.draw],
    [`2 (Victoire ${nameA})`, 1 / fair.away_win, live.away_win],
    ['Over 2,5 buts', 1 / fair.over_2_5, live.over_2_5],
    ['Under 2,5 buts', 1 / fair.under_2_5, live.under_2_5],
    ['BTTS Oui', 1 / fair.btts_yes, live.btts_yes],
    ['BTTS Non', 1 / fair.btts_no, live.btts_no],
  ];
  console.log('\n📈 PROBABILITÉS RECALÉES (fair vs cotes de la capture)');
  const hasLive = Object.values(live).some(v => v !== undefined);
  if (hasLive) {
    console.log(`   ${'MARCHÉ'.padEnd(24)} ${'MODÈLE'.padEnd(9)} ${'FAIR'.padEnd(7)} ${'COTE'.padEnd(7)} EDGE`);
    console.log(`   ${line('─', 56)}`);
    for (const [label, prob, book] of markets) {
      if (!book) continue;
      const edge = (prob * book - 1) * 100;
      const flag = edge >= 5 ? '✅' : edge >= 2 ? '≈' : '—';
      console.log(`   ${label.padEnd(24)} ${pct(prob).padEnd(9)} ${o2(1 / prob).padEnd(7)} ${o2(book).padEnd(7)} ${(edge >= 0 ? '+' : '') + edge.toFixed(1)}% ${flag}`);
    }
  } else {
    console.log(`   ${'MARCHÉ'.padEnd(24)} ${'PROBA'.padEnd(9)} FAIR ODDS`);
    console.log(`   ${line('─', 45)}`);
    for (const [label, prob] of markets) {
      console.log(`   ${label.padEnd(24)} ${pct(prob).padEnd(9)} ${o2(1 / prob)}`);
    }
  }

  const best = markets.slice(0, 3).sort((a, b) => b[1] - a[1])[0];
  console.log('\n' + line('═', W));
  console.log(`✅ PRONO : ${best[0]}  (${pct(best[1])}, fair ${o2(1 / best[1])}${best[2] ? `, cote capture ${o2(best[2])}` : ''})`);
  console.log('   ⚠️  Mode score seul : précision réduite (pas de xG/tirs).');
  if (anchorWarning) console.log('   ⚠️  Prior ancré sur cotes LIVE (pas pre-match) → edges indicatifs seulement.');
  console.log('   Pour un prono complet : ajoute une capture SofaScore/FotMob (xG, tirs, possession).');
  console.log(line('═', W));
}

// ============================================
// MAIN
// ============================================

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage : npx tsx scripts/manual_prono.ts <input.json>');
    console.error('Exemple de format : scripts/prono_input_example.json');
    process.exit(1);
  }
  const abs = path.resolve(__dirname, '..', file.startsWith('/') ? file.slice(1) : file);
  const m: ManualInput = JSON.parse(fs.readFileSync(abs, 'utf-8'));

  // --- Modèle pré-match ---
  let preMatch: PreMatchModel;
  let source: string;
  let anchorWarning = false;
  if (m.pre_match?.model?.lambda_home && m.pre_match?.model?.lambda_away) {
    const lH = m.pre_match.model.lambda_home, lA = m.pre_match.model.lambda_away;
    preMatch = {
      home_attack_rating: lH, home_defense_rating: Math.max(0.3, 1.5 - lA),
      away_attack_rating: lA, away_defense_rating: Math.max(0.3, 1.5 - lH),
      lambda_home: lH, lambda_away: lA,
      predicted_outcome_probs: fullMatchProbs(lH, lA),
    };
    source = `lambdas fournis (λ ${lH.toFixed(2)}-${lA.toFixed(2)})`;
  } else if (m.pre_match?.odds) {
    preMatch = estimatePreMatchFromOdds(m.pre_match.odds);
    source = 'estimé depuis cotes pre-match (de-vig + Poisson)';
  } else if (m.live_odds?.home_win && m.live_odds?.draw && m.live_odds?.away_win) {
    // Pas de cotes pre-match dans les captures → ancre sur les cotes live
    preMatch = estimatePreMatchFromOdds({
      home: m.live_odds.home_win, draw: m.live_odds.draw, away: m.live_odds.away_win,
      over_2_5: m.live_odds.over_2_5, under_2_5: m.live_odds.under_2_5,
    });
    source = 'ancré sur cotes LIVE de la capture (pre-match indisponible)';
    anchorWarning = true;
  } else {
    console.error('❌ Il faut soit pre_match.odds, soit live_odds (1X2) comme ancre.');
    process.exit(1);
  }

  // --- Mode score seul (pas de stats dans les captures) ---
  if (!m.stats) {
    printScoreOnlyReport(m, preMatch, source, anchorWarning);
    return;
  }

  // --- Construction input pipeline ---
  const minute = Math.min(90, Math.max(1, m.match.minute ?? 45));
  const duration = Math.min(minute, 45);
  const kickoff = m.match.kickoff_utc ?? new Date(Date.now() - minute * 60000).toISOString();
  const input: LiveCalibrationInput = {
    match_id: m.match.match_id ?? `manual-${Date.now()}`,
    home_team: m.match.home_team,
    away_team: m.match.away_team,
    league: m.match.league ?? 'Manual',
    kickoff_utc: kickoff,
    halftime_utc: new Date().toISOString(),
    score_ht: { home: m.match.score.home, away: m.match.score.away },
    first_half: buildFirstHalfSummary(m, duration),
    pre_match_model: preMatch,
    bookmaker_odds_ht: m.live_odds,
  };

  const out = calibrate(input);
  printReport(out, input, source, minute);
}

if (require.main === module) main();
