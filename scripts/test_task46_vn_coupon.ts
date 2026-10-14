/**
 * Test Task 46 — Sémantique V/VN dans le COMBINÉ (règle bookmaker)
 *
 * Plainte utilisateur: "tu choisis victoire d'une équipe et en cas de match nul
 * tu inscris comme gagné" + "en combiné, tu ne peux que choisir UNE option entre
 * v ou vn avec la cote qui correspond".
 *
 * Correction vérifiée ici:
 *  1. resultPolicy: doubleChanceOnds / comboLegIsVn / vnPickLabel / devig
 *  2. comboService: libellé + cote PUBLIÉE = l'option jouée (VN football, V US)
 *  3. couponTicket: cote/label/marché de la capture = l'option jouée
 *  4. End-to-end bookmaker: "PSG ou Nul" @DC → nul = GAGNÉ; défaite = PERDU
 *  5. Rendu PNG des captures (VN gagné sur nul + V US)
 *
 * Exécution: npx tsx scripts/test_task46_vn_coupon.ts
 */

import { writeFileSync, mkdirSync } from 'fs';
import {
  vnResultMatch,
  comboLegIsVn,
  doubleChanceOdds,
  deviggedDoubleChanceProb,
  deviggedDrawProb,
  vnPickLabel,
} from '../src/lib/resultPolicy';
import {
  betLabelForResult, publishedOddsForResult, publishedProbForResult,
  type ComboMatch,
} from '../src/lib/comboService';
import {
  legOdds, marketLabel, pickLabelOf, resolveTicket, couponCaption,
  type CouponView,
} from '../src/lib/couponTicket';
import { renderCouponPNG } from '../src/lib/couponRenderer';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`✅ ${name}`); }
  else { failed++; console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function section(t: string) { console.log(`\n${'='.repeat(60)}\n${t}\n${'='.repeat(60)}`); }

// ─── 1. resultPolicy ────────────────────────────────────────────────────────
section('1. resultPolicy — prix Double Chance & identification VN');

check('DC(2.30, 3.00) = 1.30', doubleChanceOdds(2.30, 3.00) === 1.30, String(doubleChanceOdds(2.30, 3.00)));
check('DC(1.75, 3.60) = 1.18', doubleChanceOdds(1.75, 3.60) === 1.18, String(doubleChanceOdds(1.75, 3.60)));
check('DC(1.50, 4.00) = 1.09', doubleChanceOdds(1.50, 4.00) === 1.09, String(doubleChanceOdds(1.50, 4.00)));
check('DC sans cote nul → null (pas de prix inventé)', doubleChanceOdds(1.85, null) === null);
check('DC cote side invalide → null', doubleChanceOdds(1.0, 3.00) === null);
check('comboLegIsVn football home/away → true',
  comboLegIsVn('football', 'home') && comboLegIsVn('football', 'away'));
check('comboLegIsVn football draw → false (nul pur, pas VN)',
  comboLegIsVn('football', 'draw') === false);
check('comboLegIsVn basket home/away → false (pas de nul US)',
  !comboLegIsVn('basketball', 'home') && !comboLegIsVn('basketball', 'away'));
check('vnPickLabel home → "PSG ou Nul"', vnPickLabel('home', 'PSG', 'Marseille') === 'PSG ou Nul');
check('vnPickLabel away → "Nul ou Marseille"', vnPickLabel('away', 'PSG', 'Marseille') === 'Nul ou Marseille');
check('devig VN(2.30,3.00,3.20) ≈ 0.7108',
  Math.abs((deviggedDoubleChanceProb(2.30, 3.00, 3.20) ?? 0) - 0.71081) < 0.0005,
  String(deviggedDoubleChanceProb(2.30, 3.00, 3.20)));
check('devig Nul(2.30,3.00,3.20) ≈ 0.3084',
  Math.abs((deviggedDrawProb(2.30, 3.00, 3.20) ?? 0) - 0.30843) < 0.0005,
  String(deviggedDrawProb(2.30, 3.00, 3.20)));
check('vnResultMatch: nul gagné pour home/away (politique inchangée)',
  vnResultMatch('home', 'draw') === true && vnResultMatch('away', 'draw') === true);
check('vnResultMatch: défaite reste perdue',
  vnResultMatch('home', 'away') === false);

// ─── 2. comboService ────────────────────────────────────────────────────────
section('2. comboService — UNE option publiée, LA cote correspondante');

const footHome: ComboMatch = {
  homeTeam: 'PSG', awayTeam: 'Marseille', sport: 'football', league: 'Ligue 1',
  predictedResult: 'home', winProbability: 55, oddsHome: 2.30, oddsAway: 3.20,
  oddsDraw: 3.00, riskPercentage: 45, valueBetDetected: true, valueBetType: 'home',
  confidence: 'medium', date: '2026-10-16T19:00:00Z',
};
const footAway: ComboMatch = { ...footHome, predictedResult: 'away' };
const basketHome: ComboMatch = {
  ...footHome, sport: 'basketball', homeTeam: 'Lakers', awayTeam: 'Celtics',
  league: 'NBA', oddsHome: 1.70, oddsAway: 2.10, oddsDraw: null,
};

check('label football home = "PSG ou Nul" (plus "Victoire PSG")',
  betLabelForResult(footHome, 'home') === 'PSG ou Nul', betLabelForResult(footHome, 'home'));
check('label football away = "Nul ou Marseille"',
  betLabelForResult(footAway, 'away') === 'Nul ou Marseille', betLabelForResult(footAway, 'away'));
check('label basket = "Victoire Lakers" (V pure, pas de nul)',
  betLabelForResult(basketHome, 'home') === 'Victoire Lakers', betLabelForResult(basketHome, 'home'));
check('cote publiée football = DC 1.30 (JAMAIS 1X2 2.30)',
  publishedOddsForResult(footHome, 'home') === 1.30, String(publishedOddsForResult(footHome, 'home')));
check('cote publiée basket = 1X2 1.70 (inchangée)',
  publishedOddsForResult(basketHome, 'home') === 1.70);
check('football sans cote nul → fallback cote side (pas de prix inventé)',
  publishedOddsForResult({ ...footHome, oddsDraw: null }, 'home') === 2.30);
check('proba publiée VN = p_side(0.55) + p_nul dévig(0.308) ≈ 0.858',
  Math.abs(publishedProbForResult(footHome, 'home') - 0.8584) < 0.001,
  String(publishedProbForResult(footHome, 'home')));
check('proba publiée basket = p_side pure 0.55',
  Math.abs(publishedProbForResult(basketHome, 'home') - 0.55) < 0.001);

// ─── 3. couponTicket (captures) ─────────────────────────────────────────────
section('3. couponTicket — capture = option jouée + cote correspondante');

const dbLeg = (o: Partial<any>): any => ({
  match_id: 'm1', home_team: 'PSG', away_team: 'Marseille',
  league: 'Ligue 1', sport: 'football', match_date: '2026-10-16T19:00:00Z',
  odds_home: 2.30, odds_draw: 3.00, odds_away: 3.20,
  predicted_result: 'home', confidence: 'medium', risk_percentage: 45,
  status: 'pending', combo_id: 'combo-x', is_combo: true,
  ...o,
});

check('cote leg football = DC 1.30', legOdds(dbLeg({})) === 1.30, String(legOdds(dbLeg({}))));
check('cote leg football away = DC(3.20,3.00)=1.55',
  legOdds(dbLeg({ predicted_result: 'away' })) === 1.55,
  String(legOdds(dbLeg({ predicted_result: 'away' }))));
check('cote leg basket = 1X2 side inchangée',
  legOdds(dbLeg({ sport: 'basketball', odds_home: 1.70, odds_away: 2.10, odds_draw: null })) === 1.70);
check('cote leg football sans draw → fallback side',
  legOdds(dbLeg({ odds_draw: null })) === 2.30);
check('pickLabel football = "PSG ou Nul"', pickLabelOf(dbLeg({})) === 'PSG ou Nul');
check('pickLabel basket = nom équipe', pickLabelOf(dbLeg({ sport: 'basketball', home_team: 'Lakers', away_team: 'Celtics', odds_draw: null })) === 'Lakers');
check('marketLabel football = "Double Chance — Victoire ou Nul"',
  marketLabel('football', 'home') === 'Double Chance — Victoire ou Nul');
check('marketLabel basket = "Vainqueur du match"',
  marketLabel('basketball', 'home') === 'Vainqueur du match');

// ─── 4. End-to-end bookmaker ────────────────────────────────────────────────
section('4. Règle bookmaker de bout en bout');

// Match nul 1-1, leg VN → GAGNÉ à la cote DC (le libellé correspond enfin)
const drawLeg = dbLeg({
  status: 'completed', result_match: true, actual_result: 'draw',
  home_score: 1, away_score: 1,
});
const rDraw = resolveTicket([drawLeg], new Date('2026-10-17T08:00:00Z'));
check('NUL 1-1 + "PSG ou Nul" @1.30 → ticket GAGNÉ cote 1.30',
  rDraw.status === 'won' && Math.abs(rDraw.effectiveOdds - 1.30) < 0.01, JSON.stringify(rDraw));

// Défaite 0-2, leg VN → PERDU (comme chez Betclic)
const lostLeg = dbLeg({
  status: 'completed', result_match: false, actual_result: 'away',
  home_score: 0, away_score: 2,
});
const rLost = resolveTicket([lostLeg], new Date('2026-10-17T08:00:00Z'));
check('DÉFAITE 0-2 + "PSG ou Nul" → ticket PERDU', rLost.status === 'lost');

// Victoire 2-0, leg VN → GAGNÉ
const wonLeg = dbLeg({
  status: 'completed', result_match: true, actual_result: 'home',
  home_score: 2, away_score: 0,
});
const rWon = resolveTicket([wonLeg], new Date('2026-10-17T08:00:00Z'));
check('VICTOIRE 2-0 + "PSG ou Nul" → GAGNÉ', rWon.status === 'won');

// Combiné 2 legs: VN foot (1.30) × V basket (1.70) = 2.21
const rCombo = resolveTicket([
  wonLeg,
  dbLeg({ sport: 'basketball', home_team: 'Lakers', away_team: 'Celtics', league: 'NBA',
          odds_home: 1.70, odds_draw: null, odds_away: 2.10, predicted_result: 'home',
          status: 'completed', result_match: true, home_score: 110, away_score: 98 }),
], new Date('2026-10-17T08:00:00Z'));
check('combiné VN×V gagné → cote effective 1.30×1.70=2.21',
  Math.abs(rCombo.effectiveOdds - 2.21) < 0.01, String(rCombo.effectiveOdds));

// ── Legs LEGACY sans cote nul: "Victoire" pure @1X2 → NUL = PERDU (règle Betclic) ──
const legacyLeg = (o: Partial<any>): any => dbLeg({
  odds_home: 2.9, odds_draw: null, odds_away: 2.40,
  predicted_result: 'away', home_team: 'Chicago Fire FC', away_team: 'Philadelphia Union',
  ...o,
});
check('legacy sans cote nul: label = "Philadelphia Union" (Victoire pure, pas "ou Nul")',
  pickLabelOf(legacyLeg({})) === 'Philadelphia Union', pickLabelOf(legacyLeg({})));
check('legacy: cote affichée = 1X2 2.40 (telle que publiée)', legOdds(legacyLeg({})) === 2.40);
check('marketLabel: football VN → Double Chance / basket → Vainqueur du match',
  marketLabel('football', 'home') === 'Double Chance — Victoire ou Nul'
  && marketLabel('basketball', 'home') === 'Vainqueur du match');

const legacyDrawLost = legacyLeg({
  status: 'completed', result_match: true, actual_result: 'draw', // AUTO-FIX-VN l'avait basculé gagné
  home_score: 1, away_score: 1,
});
const rLegacyDraw = resolveTicket([legacyDrawLost], new Date('2026-10-17T08:00:00Z'));
check('legacy "Victoire" + NUL 1-1 → leg PERDUE malgré AUTO-FIX-VN (result_match=true ignoré)',
  rLegacyDraw.status === 'lost', JSON.stringify(rLegacyDraw));

const legacyWinWon = legacyLeg({
  status: 'completed', result_match: true, actual_result: 'away',
  home_score: 0, away_score: 2,
});
const rLegacyWin = resolveTicket([legacyWinWon], new Date('2026-10-17T08:00:00Z'));
check('legacy "Victoire" + victoire réelle 0-2 → GAGNÉ @2.40',
  rLegacyWin.status === 'won' && Math.abs(rLegacyWin.effectiveOdds - 2.40) < 0.01,
  JSON.stringify(rLegacyWin));

// La caption du ticket gagné affiche bien l'option VN
const viewWon: CouponView = {
  status: 'won', comboId: 'combo-x', dateISO: '2026-10-16',
  totalOdds: 2.21, stake: 25000, gains: 55250, combinedProb: 0.7, unresolvedLegs: 0,
  legs: [
    { sport: 'football', pickLabel: 'PSG ou Nul', marketLabel: 'Double Chance — Victoire ou Nul', odds: 1.30, legStatus: 'won', timeLabel: 'Hier 21:00',
      teams: [{ name: 'PSG', score: 1, dimmed: false }, { name: 'Marseille', score: 1, dimmed: false }] },
    { sport: 'basketball', pickLabel: 'Lakers', marketLabel: 'Vainqueur du match', odds: 1.70, legStatus: 'won', timeLabel: 'Hier 02:30',
      teams: [{ name: 'Lakers', score: 110, dimmed: false }, { name: 'Celtics', score: 98, dimmed: false }] },
  ],
};
const captionWon = couponCaption(viewWon);
check('caption ticket gagné: "PSG ou Nul @1,30" (option VN affichée)',
  captionWon.includes('PSG ou Nul @1,30'), captionWon.split('\n')[1]);

// ─── 5. Rendu PNG (captures réelles) ────────────────────────────────────────
section('5. Rendu PNG — captures corrigées');

async function renderPngs() {
  mkdirSync('/home/z/my-project/download', { recursive: true });
  const pngWon = await renderCouponPNG(viewWon);
  writeFileSync('/home/z/my-project/download/coupon_task46_vn_gagne.png', pngWon);
  check('PNG ticket gagné (VN nul=gagné) rendu', pngWon.length > 20000, `${pngWon.length} octets`);

  const viewLost: CouponView = {
    ...viewWon, status: 'lost', totalOdds: 2.21, gains: 0,
    legs: [
      { ...viewWon.legs[0], legStatus: 'lost',
        teams: [{ name: 'PSG', score: 0, dimmed: true }, { name: 'Marseille', score: 2, dimmed: false }] },
      { ...viewWon.legs[1], legStatus: 'won',
        teams: [{ name: 'Lakers', score: 110, dimmed: false }, { name: 'Celtics', score: 98, dimmed: true }] },
    ],
  };
  const pngLost = await renderCouponPNG(viewLost);
  writeFileSync('/home/z/my-project/download/coupon_task46_vn_perdu.png', pngLost);
  check('PNG ticket perdu (défaite VN) rendu', pngLost.length > 20000, `${pngLost.length} octets`);
}

renderPngs().catch((e: any) => check('rendu PNG', false, e.message)).then(() => {
  console.log(`\n${'='.repeat(60)}\nRÉSULTAT: ${passed} réussis, ${failed} échoués\n${'='.repeat(60)}`);
  process.exit(failed > 0 ? 1 : 0);
});
