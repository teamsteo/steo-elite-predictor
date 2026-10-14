/**
 * backtest_minute_split.ts — Découpage <30′ vs ≥30′ (question "zone stats")
 *
 * Contexte : la discussion zone stats a conclu que le SEUL créneau à valeur
 * potentielle est le live 0-30 min (signal xG quasi nul, shrinkage ramène au
 * prior). Pour trancher, on quantifie ce que le pipeline ACTUEL (fixé ed34f47)
 * sait déjà faire dans la fenêtre précoce vs à la mi-temps :
 *
 *   1. On réutilise l'échantillon + les priors walk-forward du backtest
 *      shrinkage A/B (results_shrinkage_ab.jsonl, 250 matchs big-5 2025-26)
 *      → mêmes matchs, même prior pré-match pour les 2 fenêtres (apparié).
 *   2. Pour chaque match, fetch des tirs minutés Understat (getMatchData).
 *   3. DEUX calibrations du même match :
 *        - @30′ : tirs minute ≤ 30, score à 30′, duration_minutes = 30
 *          (temps restant 60′ — exactement le comportement prod d'une
 *           analyse déclenchée à la 30e, cf. commentaire calibrate.ts)
 *        - @45′ : tirs 1re MT complets, score MT, duration_minutes = 45
 *   4. Métriques vs score FINAL : Brier 1X2 + log loss, comparés entre eux
 *      et à la baseline pré-match (probs_pre du run A/B).
 *
 * Lecture attendue (verdict zone stats) :
 *   - Si dans le bucket "xG30 quasi nul" le Brier @30′ ≈ Brier pré-match
 *     (Δ non significatif), alors la fenêtre 0-30′ est un créneau où le
 *     pipeline actuel = prior pur → les zone stats seraient la SEULE source
 *     d'edge additionnel → intégration à tester en prior-booster.
 *   - Si le Brier @30′ < pré-match même à signal nul, le score + shrinkage
 *     captent déjà l'essentiel → zone stats à impact marginal.
 *
 * Usage :
 *   npx tsx scripts/backtest_minute_split.ts [--delay 1000] [--limit 0]
 *   (--limit N = N matchs/ligue pour un smoke test ; resume automatique :
 *    les match_ids déjà présents dans minute_split_results.jsonl sont skippés)
 */

import * as fs from 'fs';
import * as path from 'path';
import { calibrate } from '../src/lib/liveCalibration/calibrate';
import type {
  LiveCalibrationInput, ShotEvent, FirstHalfSummary, PreMatchModel, MomentumWindow,
} from '../src/lib/liveCalibration/types';

// ============================================
// CONFIG
// ============================================

const DELAY_MS = parseInt(arg('--delay', '1000'), 10);
const LIMIT_PER_LEAGUE = parseInt(arg('--limit', '0'), 10);
const OUT_DIR = path.join(__dirname, 'backtest_env');
const BASE_JSONL = path.join(OUT_DIR, 'results_shrinkage_ab.jsonl');
const OUT_JSONL = path.join(OUT_DIR, 'minute_split_results.jsonl');
const XG30_SPLIT = 0.40; // seuil "signal quasi nul" vs "signal présent" sur xG total ≤30′

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ============================================
// TYPES (entrées du run A/B + sortie split)
// ============================================

interface BaseEntry {
  league: string; match_id: string; home: string; away: string; kickoff: string;
  score_ht: { home: number; away: number };
  score_ft: { home: number; away: number };
  prior_lambda_home: number; prior_lambda_away: number;
  probs_pre: { home: number; draw: number; away: number };
  brier_pre: number; logloss_pre: number; brier_fixed: number;
}

interface SplitResult {
  league: string; match_id: string; home: string; away: string;
  score30: { home: number; away: number };
  score_ht: { home: number; away: number };
  score_ft: { home: number; away: number };
  shots30: number; shots45: number;
  xg30_raw_total: number; xg45_raw_total: number;
  probs30: Probs; probs45: Probs;
  brier30: number; brier45: number;
  ll30: number; ll45: number;
  l1_move30: number; l1_move45: number;
  conf30: number; conf45: number;
  brier_pre: number; ll_pre: number;
}

type Probs = { home: number; draw: number; away: number };

// ============================================
// FETCH UNDERSTAT
// ============================================

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
  throw new Error('unreachable');
}

async function fetchMatchShots(matchId: string): Promise<{ h: any[]; a: any[] }> {
  const data = await fetchJson(
    `https://understat.com/getMatchData/${matchId}`,
    `https://understat.com/match/${matchId}`,
  );
  return { h: data.shots?.h ?? [], a: data.shots?.a ?? [] };
}

// ============================================
// TIRS UNDERSTAT → SHOTEVENTS + RÉSUMÉS FENÊTRE
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

/** Tirs 1re MT jusqu'à maxMinute inclus (45 = MT complète, 30 = fenêtre précoce). */
function parseShotsUpTo(shots: { h: any[]; a: any[] }, maxMinute: number): ShotEvent[] {
  const events: ShotEvent[] = [];
  for (const side of ['h', 'a'] as const) {
    for (const s of shots[side]) {
      const minute = parseInt(String(s.minute), 10); // "45+2" → 45 (arrêts de jeu 1re MT)
      if (isNaN(minute) || minute > maxMinute) continue;
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

/** Résumé de fenêtre parameterisé (windows 15 min jusqu'à duration). */
function buildWindowSummary(shots: ShotEvent[], duration: number): FirstHalfSummary {
  const sum = (arr: ShotEvent[], f: (s: ShotEvent) => number) => arr.reduce((a, s) => a + f(s), 0);
  const home = shots.filter(s => s.team === 'home');
  const away = shots.filter(s => s.team === 'away');
  const xgH = sum(home, s => s.xg), xgA = sum(away, s => s.xg);
  const bigH = sum(home, s => (s.is_big_chance && !s.is_penalty ? s.xg : 0));
  const bigA = sum(away, s => (s.is_big_chance && !s.is_penalty ? s.xg : 0));
  const penH = sum(home, s => (s.is_penalty ? s.xg : 0));
  const penA = sum(away, s => (s.is_penalty ? s.xg : 0));
  const onTarget = (arr: ShotEvent[]) =>
    arr.filter(s => s.outcome === 'goal' || s.outcome === 'saved' || s.outcome === 'post').length;

  const windows: MomentumWindow[] = [];
  for (let start = 0; start + 15 <= duration; start += 15) {
    const inW = shots.filter(s => s.minute > start && s.minute <= start + 15);
    windows.push({
      window_start: start, window_end: start + 15,
      xg_home: sum(inW.filter(s => s.team === 'home'), s => s.xg),
      xg_away: sum(inW.filter(s => s.team === 'away'), s => s.xg),
    });
  }

  return {
    duration_minutes: duration,
    shots,
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

function scoreFromShots(shots: ShotEvent[]): { home: number; away: number } {
  return {
    home: shots.filter(s => s.team === 'home' && s.outcome === 'goal').length,
    away: shots.filter(s => s.team === 'away' && s.outcome === 'goal').length,
  };
}

// ============================================
// MÉTRIQUES
// ============================================

function probsFromFairOdds(fo: { home_win: number; draw: number; away_win: number }): Probs {
  const invSum = 1 / fo.home_win + 1 / fo.draw + 1 / fo.away_win;
  return {
    home: 1 / fo.home_win / invSum,
    draw: 1 / fo.draw / invSum,
    away: 1 / fo.away_win / invSum,
  };
}

function brier(p: Probs, fh: number, fa: number): number {
  const o = fh > fa ? { home: 1, draw: 0, away: 0 }
    : fa > fh ? { home: 0, draw: 0, away: 1 }
    : { home: 0, draw: 1, away: 0 };
  return (p.home - o.home) ** 2 + (p.draw - o.draw) ** 2 + (p.away - o.away) ** 2;
}

function logLoss(p: Probs, fh: number, fa: number): number {
  const q = Math.min(Math.max(fh > fa ? p.home : fa > fh ? p.away : p.draw, 1e-9), 1 - 1e-9);
  return -Math.log(q);
}

function l1(a: Probs, b: Probs): number {
  return Math.abs(a.home - b.home) + Math.abs(a.draw - b.draw) + Math.abs(a.away - b.away);
}

function pick(p: Probs): 'H' | 'D' | 'A' {
  return p.home >= p.draw && p.home >= p.away ? 'H' : p.away >= p.draw ? 'A' : 'D';
}
function pickOfScore(s: { home: number; away: number }): 'H' | 'D' | 'A' {
  return s.home > s.away ? 'H' : s.away > s.home ? 'A' : 'D';
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log(`╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║  BACKTEST SPLIT <30′ vs ≥30′ — question zone stats           ║`);
  console.log(`║  Pipeline FIXÉ (ed34f47), priors walk-forward du run A/B     ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1. Charger l'échantillon de base (250 matchs A/B)
  const base: BaseEntry[] = fs.readFileSync(BASE_JSONL, 'utf-8')
    .split('\n').filter(l => l.trim())
    .map(l => JSON.parse(l));
  console.log(`Base A/B chargée : ${base.length} matchs\n`);

  // 2. Resume : skip les matchs déjà traités
  const done = new Map<string, SplitResult>();
  if (fs.existsSync(OUT_JSONL)) {
    for (const l of fs.readFileSync(OUT_JSONL, 'utf-8').split('\n').filter(l => l.trim())) {
      const r = JSON.parse(l) as SplitResult;
      done.set(r.match_id, r);
    }
    console.log(`Resume : ${done.size} matchs déjà traités (skippés)\n`);
  }

  const pending = base.filter(b => !done.has(b.match_id));
  if (LIMIT_PER_LEAGUE > 0) {
    const kept = new Set<string>();
    const counts = new Map<string, number>();
    for (const b of pending) {
      const n = counts.get(b.league) ?? 0;
      if (n < LIMIT_PER_LEAGUE) { counts.set(b.league, n + 1); kept.add(b.match_id); }
    }
    pending.length = 0;
    pending.push(...base.filter(b => kept.has(b.match_id) && !done.has(b.match_id)));
  }
  console.log(`À traiter : ${pending.length} matchs | délai ${DELAY_MS}ms\n`);

  // 3. Traitement séquentiel
  let processed = 0, failed = 0, htMismatch = 0;
  for (const b of pending) {
    await sleep(DELAY_MS + Math.random() * 300);
    try {
      const shots = await fetchMatchShots(b.match_id);
      const shots45 = parseShotsUpTo(shots, 45);
      const shots30 = parseShotsUpTo(shots, 30);
      if (shots45.length === 0) throw new Error('0 tir 1re MT (data Understat vide ?)');

      const scoreHtCheck = scoreFromShots(shots45);
      const sameHt = scoreHtCheck.home === b.score_ht.home && scoreHtCheck.away === b.score_ht.away;
      if (!sameHt) htMismatch++;
      // On utilise le score recomputé (source de vérité des tirs), l'écart
      // avec le JSONL A/B est tracé en sanity.
      const score30 = scoreFromShots(shots30);

      // Même prior pré-match pour les 2 fenêtres (walk-forward du run A/B)
      const preMatch: PreMatchModel = {
        home_attack_rating: b.prior_lambda_home,
        home_defense_rating: Math.max(0.3, 1.5 - b.prior_lambda_away),
        away_attack_rating: b.prior_lambda_away,
        away_defense_rating: Math.max(0.3, 1.5 - b.prior_lambda_home),
        lambda_home: b.prior_lambda_home,
        lambda_away: b.prior_lambda_away,
        predicted_outcome_probs: b.probs_pre,
      };

      const mkInput = (shotsList: ShotEvent[], duration: number, score: { home: number; away: number }): LiveCalibrationInput => ({
        match_id: `us_${b.match_id}@${duration}`,
        home_team: b.home, away_team: b.away, league: b.league,
        kickoff_utc: new Date(b.kickoff.replace(' ', 'T') + 'Z').toISOString(),
        halftime_utc: new Date(b.kickoff.replace(' ', 'T') + 'Z').toISOString(),
        score_ht: score,
        first_half: buildWindowSummary(shotsList, duration),
        pre_match_model: preMatch,
      });

      const out30 = calibrate(mkInput(shots30, 30, score30));
      const out45 = calibrate(mkInput(shots45, 45, scoreHtCheck));

      const probs30 = probsFromFairOdds(out30.halftime_fair_odds);
      const probs45 = probsFromFairOdds(out45.halftime_fair_odds);

      const rec: SplitResult = {
        league: b.league, match_id: b.match_id, home: b.home, away: b.away,
        score30, score_ht: scoreHtCheck, score_ft: b.score_ft,
        shots30: shots30.length, shots45: shots45.length,
        xg30_raw_total: Math.round((out30.filtered_xg.home.raw + out30.filtered_xg.away.raw) * 100) / 100,
        xg45_raw_total: Math.round((out45.filtered_xg.home.raw + out45.filtered_xg.away.raw) * 100) / 100,
        probs30, probs45,
        brier30: brier(probs30, b.score_ft.home, b.score_ft.away),
        brier45: brier(probs45, b.score_ft.home, b.score_ft.away),
        ll30: logLoss(probs30, b.score_ft.home, b.score_ft.away),
        ll45: logLoss(probs45, b.score_ft.home, b.score_ft.away),
        l1_move30: Math.round(l1(probs30, b.probs_pre) * 10000) / 10000,
        l1_move45: Math.round(l1(probs45, b.probs_pre) * 10000) / 10000,
        conf30: out30.confidence_index, conf45: out45.confidence_index,
        brier_pre: b.brier_pre, ll_pre: b.logloss_pre,
      };

      done.set(b.match_id, rec);
      fs.appendFileSync(OUT_JSONL, JSON.stringify(rec) + '\n');
      processed++;
      if (processed % 20 === 0) console.log(`  … ${processed}/${pending.length} traités`);
    } catch (e: any) {
      failed++;
      console.warn(`  ⚠️ match ${b.match_id} (${b.home}-${b.away}) échoué : ${e.message}`);
    }
  }
  console.log(`\n✓ ${processed} traités, ${failed} échoués, ${htMismatch} écarts score MT vs JSONL A/B`);

  // 4. Rapport sur TOUT l'échantillon (anciens + nouveaux)
  printReport([...done.values()], htMismatch);
}

// ============================================
// RAPPORT
// ============================================

function mean(a: number[]): number { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

function pairedReport(results: SplitResult[], label: string, getA: (r: SplitResult) => number, getB: (r: SplitResult) => number) {
  const n = results.length;
  if (n === 0) { console.log(`   ${label.padEnd(38)} échantillon vide`); return null; }
  const a = mean(results.map(getA)), b = mean(results.map(getB));
  const deltas = results.map(r => getA(r) - getB(r));
  const sd = Math.sqrt(mean(deltas.map(d => d * d)) - mean(deltas) ** 2) || 0;
  const se = sd / Math.sqrt(n);
  const wins = deltas.filter(d => d < -1e-9).length;
  const losses = deltas.filter(d => d > 1e-9).length;
  const sig = Math.abs(a - b) > 2 * se ? ' *' : '';
  console.log(`   ${label.padEnd(38)} ${a.toFixed(4)} vs ${b.toFixed(4)}  Δ ${(a - b >= 0 ? '+' : '') + (a - b).toFixed(4)} (±${se.toFixed(4)}) | A<gagné ${wins}/${n} (${(100 * wins / n).toFixed(0)}%)${sig}`);
  return { a, b, delta: a - b, se, n };
}

function printReport(results: SplitResult[], htMismatch: number) {
  const W = 76;
  console.log('\n' + '═'.repeat(W));
  console.log('📊 SPLIT <30′ vs ≥30′ — QUE VAUT LA FENÊTRE PRÉCOCE (question zone stats) ?');
  console.log('═'.repeat(W));
  if (results.length === 0) { console.log('Aucun résultat.'); return; }

  console.log(`\n   Échantillon : ${results.length} matchs big-5 2025-26 (mêmes priors walk-forward A/B)`);
  console.log(`   Sanity : xG brut moyen ≤30′ ${mean(results.map(r => r.xg30_raw_total)).toFixed(2)} vs ≤45′ ${mean(results.map(r => r.xg45_raw_total)).toFixed(2)} | tirs ≤30′ ${mean(results.map(r => r.shots30)).toFixed(1)} vs ≤45′ ${mean(results.map(r => r.shots45)).toFixed(1)} | écarts score MT vs A/B : ${htMismatch}`);

  console.log('\n   📉 BRIER 1X2 global vs score final (apparié, plus bas = meilleur) :');
  pairedReport(results, 'calibration @30′ vs pré-match', r => r.brier30, r => r.brier_pre);
  pairedReport(results, 'calibration @45′ vs pré-match', r => r.brier45, r => r.brier_pre);
  pairedReport(results, 'calibration @30′ vs @45′', r => r.brier30, r => r.brier45);

  console.log('\n   📉 LOG LOSS 1X2 global :');
  pairedReport(results, '@30′ vs pré-match', r => r.ll30, r => r.ll_pre);
  pairedReport(results, '@45′ vs pré-match', r => r.ll45, r => r.ll_pre);
  pairedReport(results, '@30′ vs @45′', r => r.ll30, r => r.ll45);

  console.log(`\n   🎚️  CUT DÉCISIF — par volume de xG ≤30′ (seuil ${XG30_SPLIT}) :`);
  const lowSig = results.filter(r => r.xg30_raw_total < XG30_SPLIT);
  const highSig = results.filter(r => r.xg30_raw_total >= XG30_SPLIT);
  console.log(`   • xG30 < ${XG30_SPLIT} (signal quasi nul, n=${lowSig.length}) :`);
  pairedReport(lowSig, '  @30′ vs pré-match', r => r.brier30, r => r.brier_pre);
  pairedReport(lowSig, '  @30′ vs @45′', r => r.brier30, r => r.brier45);
  console.log(`   • xG30 ≥ ${XG30_SPLIT} (signal présent, n=${highSig.length}) :`);
  pairedReport(highSig, '  @30′ vs pré-match', r => r.brier30, r => r.brier_pre);
  pairedReport(highSig, '  @30′ vs @45′', r => r.brier30, r => r.brier45);

  console.log('\n   🎚️  CUT — état du score à 30′ :');
  const nil30 = results.filter(r => r.score30.home === 0 && r.score30.away === 0);
  const scored30 = results.filter(r => r.score30.home + r.score30.away > 0);
  console.log(`   • 0-0 à 30′ (n=${nil30.length}) :`);
  pairedReport(nil30, '  @30′ vs pré-match', r => r.brier30, r => r.brier_pre);
  pairedReport(nil30, '  @30′ vs @45′', r => r.brier30, r => r.brier45);
  console.log(`   • ≥1 but à 30′ (n=${scored30.length}) :`);
  pairedReport(scored30, '  @30′ vs pré-match', r => r.brier30, r => r.brier_pre);
  pairedReport(scored30, '  @30′ vs @45′', r => r.brier30, r => r.brier45);

  console.log('\n   🎯 PICKS (direction 1X2, hit rate vs score final) :');
  const hit = (g: (r: SplitResult) => Probs) => results.filter(r => pick(g(r)) === pickOfScore(r.score_ft)).length;
  const hitPre = results.filter(r => pick(r.probs_pre ?? { home: 0, draw: 0, away: 0 }) === pickOfScore(r.score_ft)).length;
  console.log(`      pré-match ${hitPre}/${results.length} (${(100 * hitPre / results.length).toFixed(1)}%) | @30′ ${hit(r => r.probs30)}/${results.length} (${(100 * hit(r => r.probs30) / results.length).toFixed(1)}%) | @45′ ${hit(r => r.probs45)}/${results.length} (${(100 * hit(r => r.probs45) / results.length).toFixed(1)}%)`);

  console.log('\n   📊 MOUVEMENT vs PRIOR (L1 moyen) & CONFIANCE :');
  console.log(`      L1(probs, prior) : @30′ ${mean(results.map(r => r.l1_move30)).toFixed(3)} | @45′ ${mean(results.map(r => r.l1_move45)).toFixed(3)} → la fenêtre 30-45′ ajoute ${((mean(results.map(r => r.l1_move45)) / Math.max(1e-9, mean(results.map(r => r.l1_move30))) - 1) * 100).toFixed(0)}% de mouvement en plus`);
  console.log(`      confidence_index : @30′ ${mean(results.map(r => r.conf30)).toFixed(1)} | @45′ ${mean(results.map(r => r.conf45)).toFixed(1)}`);

  console.log('\n' + '═'.repeat(W));
  console.log(`📁 Détails par match : ${OUT_JSONL}`);
}

main().catch(e => { console.error('❌ ERREUR FATALE', e); process.exit(1); });
