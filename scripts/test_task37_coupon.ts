/**
 * Test Task 37 — Coupons visuels (style bookmaker) depuis les combinés réels
 *
 * Exécution: npx tsx scripts/test_task37_coupon.ts
 *
 * Couverture:
 *  1. Rendu PNG des 3 variantes (en jeu / gagné / perdu) → download/
 *  2. resolveTicket: won / lost / void (annulé) / stalled (>36h) / unresolved
 *  3. computeStake: paliers 25k / 50k / 75k
 *  4. formatFcfa / formatOdds / relativeTimeLabel
 *  5. Cohérence gains = mise × cote effective (legs void → cote réduite)
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { renderCouponPNG } from '../src/lib/couponRenderer';
import {
  resolveTicket, computeStake, formatFcfa, formatOdds, relativeTimeLabel,
  type CouponView,
} from '../src/lib/couponTicket';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`✅ ${name}`); }
  else { failed++; console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function section(t: string) { console.log(`\n${'='.repeat(60)}\n${t}\n${'='.repeat(60)}`); }

const now = new Date('2026-10-09T08:15:00Z');

// ─── Fabriques de legs DB ───────────────────────────────────────────────────
const leg = (o: Partial<any>): any => ({
  match_id: 'm1', home_team: 'Dallas Cowboys', away_team: 'Tampa Bay Buccaneers',
  league: 'NFL', sport: 'basketball', match_date: '2026-10-08T18:00:00Z',
  odds_home: 1.70, odds_draw: null, odds_away: 2.10,
  predicted_result: 'home', confidence: 'high', risk_percentage: 20,
  status: 'completed', result_match: true,
  home_score: 28, away_score: 19,
  combo_id: 'combo-20261008-abc', is_combo: true,
  created_at: '2026-10-08T07:32:00Z',
  ...o,
});

// ─── 1. resolveTicket ───────────────────────────────────────────────────────
section('1. resolveTicket');

const rWon = resolveTicket([leg({}), leg({ predicted_result: 'away', odds_away: 1.46, odds_home: null, home_team: 'X', away_team: 'Y', result_match: true, home_score: 3, away_score: 6 })], now);
check('tout gagné → won', rWon.status === 'won', JSON.stringify(rWon));
check('cote effective 1.70×1.46=2.48', Math.abs(rWon.effectiveOdds - 2.48) < 0.01, String(rWon.effectiveOdds));

const rLost = resolveTicket([leg({}), leg({ predicted_result: 'away', odds_away: 1.46, odds_home: null, result_match: false })], now);
check('une leg fausse → lost', rLost.status === 'lost');

const rStalled = resolveTicket([leg({}), leg({ status: 'pending', match_date: '2026-10-07T12:00:00Z' })], now);
check('leg pending >36h → lost (stalled)', rLost.status === 'lost' && rStalled.status === 'lost');

const rVoid = resolveTicket([leg({}), leg({ status: 'cancelled' })], now);
check('leg annulée → void, ticket won à cote 1.70', rVoid.status === 'won' && Math.abs(rVoid.effectiveOdds - 1.70) < 0.01, JSON.stringify(rVoid));

const rUnresolved = resolveTicket([leg({}), leg({ status: 'pending', match_date: '2026-10-09T20:00:00Z' })], now);
check('leg pending vivante → unresolved', rUnresolved.status === 'unresolved');

// ─── 2. computeStake ────────────────────────────────────────────────────────
section('2. Paliers de mise');

check('prob 0.85 → 75 000 F', computeStake(0.85) === 75000);
check('prob 0.75 → 50 000 F', computeStake(0.75) === 50000);
check('prob 0.65 → 25 000 F (min)', computeStake(0.65) === 25000);
check('prob 0.90 → 75 000 F', computeStake(0.90) === 75000);

// ─── 3. Formatage ───────────────────────────────────────────────────────────
section('3. Formatage FR');

check('formatFcfa 187450 → "187 450 F"', formatFcfa(187450) === '187 450 F', formatFcfa(187450));
check('formatFcfa 25000 → "25 000 F"', formatFcfa(25000) === '25 000 F');
check('formatOdds 2.48 → "2,48"', formatOdds(2.48) === '2,48');
check('relativeTimeLabel hier', relativeTimeLabel('2026-10-08T07:02:00Z', now) === 'Hier 07:02', relativeTimeLabel('2026-10-08T07:02:00Z', now));
check('relativeTimeLabel aujourd\'hui', relativeTimeLabel('2026-10-09T06:45:00Z', now) === "Aujourd'hui 06:45", relativeTimeLabel('2026-10-09T06:45:00Z', now));

// ─── 4. Rendu PNG des 3 variantes ───────────────────────────────────────────
section('4. Rendu PNG');

const outDir = '/home/z/my-project/download';
mkdirSync(outDir, { recursive: true });

const viewPending: CouponView = {
  status: 'pending',
  comboId: 'combo-test',
  dateISO: '2026-10-09',
  totalOdds: 2.48,
  stake: 50000,
  gains: 124000,
  combinedProb: 0.74,
  unresolvedLegs: 2,
  legs: [
    { sport: 'basketball', pickLabel: 'Dallas Cowboys', marketLabel: 'Vainqueur du match', odds: 1.70, legStatus: 'pending', timeLabel: "Ce soir 02:15", teams: [{ name: 'Dallas Cowboys', score: null, dimmed: false }, { name: 'Tampa Bay Buccaneers', score: null, dimmed: false }] },
    { sport: 'football', pickLabel: 'Olympique Lyonnais', marketLabel: 'Vainqueur du match', odds: 1.46, legStatus: 'pending', timeLabel: "Ce soir 21:00", teams: [{ name: 'Lyon', score: null, dimmed: false }, { name: 'Lille', score: null, dimmed: false }] },
  ],
};

const viewWon: CouponView = {
  status: 'won',
  comboId: 'combo-test',
  dateISO: '2026-10-08',
  totalOdds: 2.48,
  stake: 50000,
  gains: 124000,
  combinedProb: 0.74,
  unresolvedLegs: 0,
  legs: [
    { sport: 'basketball', pickLabel: 'Adolfo Daniel Vallejo', marketLabel: 'Vainqueur du match', odds: 1.70, legStatus: 'won', timeLabel: "Aujourd'hui 06:45", teams: [{ name: 'Adolfo Daniel Vallejo', score: 2, dimmed: false }, { name: 'Valentin Royer', score: 0, dimmed: true }] },
    { sport: 'tennis', pickLabel: 'Juan Manuel Cerundolo', marketLabel: 'Vainqueur du match', odds: 1.46, legStatus: 'won', timeLabel: "Aujourd'hui 08:00", teams: [{ name: 'Juan Manuel Cerundolo', score: 2, dimmed: false }, { name: 'Nicolas Mejia', score: 0, dimmed: true }] },
  ],
};

const viewLost: CouponView = {
  status: 'lost',
  comboId: 'combo-test',
  dateISO: '2026-10-08',
  totalOdds: 1.74,
  stake: 75000,
  gains: 0,
  combinedProb: 0.81,
  unresolvedLegs: 0,
  legs: [
    { sport: 'tennis', pickLabel: 'Coco Gauff', marketLabel: 'Vainqueur du match', odds: 1.25, legStatus: 'lost', timeLabel: 'Hier 07:02', teams: [{ name: 'Coco Gauff', score: 0, dimmed: true }, { name: 'Elise Mertens', score: 2, dimmed: false }] },
    { sport: 'tennis', pickLabel: 'Oui', marketLabel: 'Qinwen Zheng gagne au moins 1 set', odds: 1.09, legStatus: 'won', timeLabel: 'Hier 11:10', teams: [{ name: 'Alina Charaeva', score: 1, dimmed: true }, { name: 'Qinwen Zheng', score: 2, dimmed: false }] },
    { sport: 'tennis', pickLabel: 'Elina Svitolina', marketLabel: 'Vainqueur du match', odds: 1.28, legStatus: 'won', timeLabel: 'Hier 13:38', teams: [{ name: 'Ann Li', score: 0, dimmed: true }, { name: 'Elina Svitolina', score: 2, dimmed: false }] },
  ],
};

async function renderAll() {
  for (const [name, v] of [['coupon_en_jeu', viewPending], ['coupon_gagne', viewWon], ['coupon_perdu', viewLost]] as const) {
    try {
      const png = await renderCouponPNG(v);
      const p = join(outDir, `${name}.png`);
      writeFileSync(p, png);
      check(`rendu ${name}.png (${(png.length / 1024).toFixed(0)} Ko)`, png.length > 20000);
    } catch (e: any) {
      check(`rendu ${name}.png`, false, e?.message ?? String(e));
    }
  }
}

// ─── Rapport ────────────────────────────────────────────────────────────────
(async () => {
  await renderAll();
  console.log(`\n${'='.repeat(60)}\nRÉSULTAT: ${passed} passés, ${failed} échoués\n${'='.repeat(60)}`);
  process.exit(failed > 0 ? 1 : 0);
})();
