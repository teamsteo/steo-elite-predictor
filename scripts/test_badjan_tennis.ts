/**
 * Tests BADJAN TENNIS — formats + math bilan (Task 18)
 * Run: npx tsx scripts/test_badjan_tennis.ts
 * Zéro réseau, zéro DB — module pur uniquement.
 */
import {
  formatBadjanTennisMessage,
  formatBilanMessage,
  computeDayPnl,
  BADJAN_TENNIS_MIN_PROB,
  BADJAN_TENNIS_MIN_CONSENSUS,
  BADJAN_TENNIS_MIN_EDGE,
  BadjanTennisPick,
} from '../src/lib/tennis-v3/badjan-tennis';
import type { TrackedBet } from '../src/lib/tennis-v3/persistence';

let pass = 0, fail = 0;
function assert(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

const pick = (over: Partial<BadjanTennisPick> = {}): BadjanTennisPick => ({
  player1: 'Alcaraz C.',
  player2: 'Sinner J.',
  tournament: 'ATP Cincinnati',
  surface: 'Hard',
  round: 'Quart de finale',
  date: '2026-09-24T14:30:00.000Z',
  pickName: 'Alcaraz C.',
  odds: 1.45,
  probability: 0.74,
  edge: 0.062,
  kelly: 0.021,
  odds1: 1.45,
  odds2: 2.75,
  ...over,
});

const bet = (over: Partial<TrackedBet> = {}): TrackedBet => ({
  match_id: 'm1',
  player1: 'Alcaraz C.',
  player2: 'Sinner J.',
  tournament: 'ATP Cincinnati',
  surface: 'Hard',
  round: 'QF',
  match_date: '2026-09-23',
  pick: 'player1',
  pick_name: 'Alcaraz C.',
  probability: 0.74,
  odds: 1.45,
  edge: 0.062,
  kelly: 0.021,
  tier: 'green',
  model_version: 'tennis-v3.0.0',
  result: null,
  ...over,
});

// ============ 1. CONSTANTES ============
console.log('\n📐 CONSTANTES BADJAN TENNIS');
assert('seuils alignés V3 (0.70/5/0.03)',
  BADJAN_TENNIS_MIN_PROB === 0.70 && BADJAN_TENNIS_MIN_CONSENSUS === 5 && BADJAN_TENNIS_MIN_EDGE === 0.03);

// ============ 2. FORMAT PICKS ============
console.log('\n🎾 FORMAT BADJAN TENNIS');
assert('0 pick → chaîne vide (silence)', formatBadjanTennisMessage([]) === '');
assert('0 pick (null) → chaîne vide', formatBadjanTennisMessage(null as any) === '');

const msg1 = formatBadjanTennisMessage([pick()]);
assert('header BADJAN TENNIS présent', msg1.includes('BADJAN TENNIS') && msg1.includes('╔'));
assert('pick name + cote @1.45', msg1.includes('Alcaraz C.') && msg1.includes('@ 1.45'));
assert('cotes des deux joueurs', msg1.includes('1:<b>1.45</b>') && msg1.includes('2:<b>2.75</b>'));
assert('modèle 74% / risque 26%', msg1.includes('74%') && msg1.includes('26%'));
assert('edge +6.2% / kelly 2.1%', msg1.includes('+6.2%') && msg1.includes('2.1%'));
assert('date/heure UTC affichée', msg1.includes('14:30 UTC'));
assert('footer pariez responsable', msg1.includes('Pariez responsable') && msg1.includes('Bilan automatique demain'));
assert('longueur ≤ 4096', msg1.length <= 4096);

const msgEsc = formatBadjanTennisMessage([pick({ player1: 'A&B <Test>' })]);
assert('échappement HTML (& < >)', msgEsc.includes('A&amp;B &lt;Test&gt;') && !msgEsc.includes('A&B <'));

const msgNoVal = formatBadjanTennisMessage([pick({ edge: null, kelly: null })]);
assert('edge/kelly null → tiret', msgNoVal.includes('Edge: <b>—</b>'));

const msgMidnight = formatBadjanTennisMessage([pick({ date: '2026-09-24T00:00:00.000Z' })]);
assert('date sans heure → pas de time affiché', !msgMidnight.includes('UTC'));

const msg3 = formatBadjanTennisMessage([pick(), pick({ player1: 'X', player2: 'Y' }), pick()]);
assert('3 picks → numérotation 1/2/3', msg3.includes('1. Alcaraz') && msg3.includes('2. X') && msg3.includes('3. Alcaraz'));

// ============ 3. P&L DU JOUR ============
console.log('\n💰 MATH P&L');
const day1 = computeDayPnl([
  bet({ result: 'win', odds: 1.45 }),
  bet({ result: 'loss', odds: 2.1 }),
  bet({ result: 'pending' }),
  bet({ result: 'void' }),
]);
assert('day1: 1✅ 1❌ 1⏳ 1➖', day1.wins === 1 && day1.losses === 1 && day1.pending === 1 && day1.voids === 1);
assert('day1: profit = +0.45 - 1 = -0.55u', Math.abs(day1.profit - -0.55) < 1e-9);

const day2 = computeDayPnl([
  bet({ result: 'win', odds: 2.5 }),
  bet({ result: 'win', odds: 1.8 }),
]);
assert('day2: 2 wins → +1.5+0.8 = +2.3u', Math.abs(day2.profit - 2.3) < 1e-9);

assert('journee vide → 0u', computeDayPnl([]).profit === 0 && computeDayPnl([]).wins === 0);
assert('odds manquante/corrompue → win sans profit', computeDayPnl([bet({ result: 'win', odds: 0 })]).profit === 0);

// ============ 4. FORMAT BILAN ============
console.log('\n📊 FORMAT BILAN J+1');
assert('0 pari → chaîne vide (silence)', formatBilanMessage([], { wins: 0, losses: 0, profitUnits: 0, roi: 0, settled: 0 }) === '');

const bilan1 = formatBilanMessage(
  [
    bet({ result: 'win', odds: 1.45 }),
    bet({ result: 'loss', odds: 2.1, player1: 'Fritz T.', player2: 'Zverev A.', pick_name: 'Fritz T.' }),
    bet({ result: null, player1: 'Musetti L.', player2: 'Rune H.', pick_name: 'Musetti L.', odds: 1.85, match_id: 'm3' }),
  ],
  { wins: 12, losses: 4, profitUnits: 1.49, roi: 0.0931, settled: 16 }
);
assert('header BILAN', bilan1.includes('BADJAN TENNIS — BILAN'));
assert('date cible = match_date du pari', bilan1.includes('mardi 23 septembre') || bilan1.includes('23 septembre'));
assert('win → GAGNÉ (+0.45u)', bilan1.includes('GAGNÉ (+0.45u)'));
assert('loss → PERDU (-1u)', bilan1.includes('PERDU (-1u)'));
assert('pending → en attente', bilan1.includes('en attente'));
assert('P&L journée -0.55u', bilan1.includes('-0.55u'));
assert('ROI journée -27.5%', bilan1.includes('-27.5%'));
assert('cumul 12✅ 4❌ (75.0%)', bilan1.includes('12✅ 4❌') && bilan1.includes('75.0%'));
assert('ROI cumul +9.3%', bilan1.includes('+9.3%'));
assert('16 paris réglés', bilan1.includes('16 paris réglés'));
assert('longueur ≤ 4096', bilan1.length <= 4096);

const bilan2 = formatBilanMessage([bet({ result: 'win' })], { wins: 0, losses: 0, profitUnits: 0, roi: 0, settled: 0 });
assert('cumul vide → message de collecte', bilan2.includes('premiers résultats en cours de collecte'));

const bilanPositive = formatBilanMessage(
  [bet({ result: 'win', odds: 2.5 })],
  { wins: 3, losses: 1, profitUnits: 2.6, roi: 0.65, settled: 4 }
);
assert('P&L positif → signe + explicite', bilanPositive.includes('+1.50u') && bilanPositive.includes('+65.0%'));

// ============ RÉSULTAT ============
console.log(`\n${'═'.repeat(50)}`);
console.log(`RÉSULTAT: ${pass} passés, ${fail} échoués`);
process.exit(fail > 0 ? 1 : 0);
