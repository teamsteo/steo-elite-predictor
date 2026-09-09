/**
 * Test fonctionnel P3 — moteur comboGrouped (0 réseau, fonctions pures)
 * Équivalent du test P1 test_stealth_breaker.ts.
 * Run: npx tsx scripts/test_combo_grouped.ts
 */
import {
  ComboCandidate,
  EXTENDED_RISK_CAP,
  SPORT_RISK_CAP,
  buildGroupedCombo,
  formatComboMessage,
  impliedCandidate,
  isEligible,
  matchKey,
} from '../src/lib/comboGrouped';

let pass = 0;
let fail = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function cand(overrides: Partial<ComboCandidate> & { homeTeam: string; awayTeam: string; riskPercentage: number; selectedOdds: number; sport: ComboCandidate['sport'] }): ComboCandidate {
  return {
    awayTeam: 'Away',
    league: 'Test League',
    date: '2026-09-09T18:00:00Z',
    predictedResult: 'home',
    oddsHome: overrides.selectedOdds,
    oddsDraw: null,
    oddsAway: 3.0,
    winProbability: 100 - overrides.riskPercentage,
    confidence: 'medium',
    valueBetDetected: false,
    edge: 0,
    reasoning: [],
    kellyStake: 0,
    source: 'ml',
    ...overrides,
  } as ComboCandidate;
}

console.log('\n════════ P3 — Test moteur COMBO GROUPÉ ════════\n');

// ── 1. Contradiction mathématique corrigée ──────────────────────────────────
console.log('1. Fix contradiction mathématique (l\'ancien système ne pouvait JAMAIS publier)');

// 7 favoris à risque 25% (cote ~1.33) → cote combinée ~7.5 < 10 mais combo publié quand même
const sevenFavorites = Array.from({ length: 7 }, (_, i) =>
  cand({
    homeTeam: `Fav${i}FC`,
    awayTeam: `Opp${i}FC`,
    riskPercentage: 25,
    selectedOdds: 1.33,
    sport: 'football',
  }),
);
const built1 = buildGroupedCombo(sevenFavorites);
assert('7 favoris risk 25% → combo construit (ancien: null)', built1 !== null);
assert('combo a 7 legs (cote 7.43)', built1?.combo.length === 7, `${built1?.combo.length}`);
assert('reachedTarget=false (cote < 10) → COMBO DU JOUR', built1?.reachedTarget === false);

// 7 legs à 1.42 → cote ~11.6 ≥ 10 → objectif atteint
const sevenSharp = Array.from({ length: 7 }, (_, i) =>
  cand({
    homeTeam: `Sharp${i}FC`,
    awayTeam: `Weak${i}FC`,
    riskPercentage: 29.6, // 1/1.42 ≈ 70.4% → risk 29.6% (ML path peut donner ça sur favoris)
    selectedOdds: 1.42,
    sport: 'football',
    confidence: 'high',
  }),
);
const built2 = buildGroupedCombo(sevenSharp.filter((c) => isEligible(c, 30)));
assert('cote ≥ 10 atteinte avec 7 legs @1.42 (cap étendu 30)', built2?.reachedTarget === true && built2?.combo.length === 7);

// ── 2. Diversification multi-sport ──────────────────────────────────────────
console.log('\n2. Diversification combo groupé (foot + MLB)');

const mixed = [
  cand({ homeTeam: 'PSG', awayTeam: 'Lyon', riskPercentage: 22, selectedOdds: 1.28, sport: 'football' }),
  cand({ homeTeam: 'Yankees', awayTeam: 'Red Sox', riskPercentage: 28, selectedOdds: 1.39, sport: 'baseball' }), // MLB eligible cap 30
  cand({ homeTeam: 'Marseille', awayTeam: 'Nice', riskPercentage: 24, selectedOdds: 1.32, sport: 'football' }),
  cand({ homeTeam: 'Dodgers', awayTeam: 'Giants', riskPercentage: 26, selectedOdds: 1.35, sport: 'baseball' }),
];
const built3 = buildGroupedCombo(mixed.filter((c) => isEligible(c)));
assert('combo construit depuis foot+MLB', built3 !== null);
assert('multi-sport détecté', built3?.isMultiSport === true);
const firstTwoSports = built3 ? new Set(built3.combo.slice(0, 2).map((c) => c.sport)) : new Set();
assert('les 2 premiers legs couvrent les 2 sports (phase diversification)', firstTwoSports.size === 2);

// ── 3. Caps de risque par sport ─────────────────────────────────────────────
console.log('\n3. Caps de risque par sport');

const footAt26 = cand({ homeTeam: 'Foot26', awayTeam: 'X26', riskPercentage: 26, selectedOdds: 1.39, sport: 'football' });
const mlbAt28 = cand({ homeTeam: 'MLB28', awayTeam: 'Y28', riskPercentage: 28, selectedOdds: 1.39, sport: 'baseball' });
assert('football risk 26% → refusé (cap 25)', !isEligible(footAt26));
assert('baseball risk 28% → accepté (cap 30)', isEligible(mlbAt28));
assert('football risk 26% → accepté en tier étendu (35)', isEligible(footAt26, EXTENDED_RISK_CAP));
assert('caps constants: foot 25 / MLB 30 (alignés palier)', SPORT_RISK_CAP.football === 25 && SPORT_RISK_CAP.baseball === 30);

const lowConf = cand({ homeTeam: 'LowC', awayTeam: 'X', riskPercentage: 10, selectedOdds: 1.20, sport: 'football', confidence: 'low' });
assert('confidence low → refusé', !isEligible(lowConf));

const lowOdds = cand({ homeTeam: 'LowOdds', awayTeam: 'X', riskPercentage: 5, selectedOdds: 1.10, sport: 'football', confidence: 'high' });
assert('cote 1.10 < 1.15 → refusé (ultra-favori inutile en combo)', !isEligible(lowOdds));

// ── 4. impliedCandidate : margin removal + pas de draw MLB ──────────────────
console.log('\n4. Fallback cotes implicites (margin removal)');

const imp = impliedCandidate(
  { homeTeam: 'A', awayTeam: 'B', league: 'L1', date: '2026-09-10T20:00:00Z', oddsHome: 1.85, oddsDraw: 3.5, oddsAway: 4.2 },
  'football',
);
// margin = 1/1.85 + 1/3.5 + 1/4.2 - 1 = 0.5405 + 0.2857 + 0.2381 - 1 = 0.0643
// probHome = 0.5405 / 1.0643 ≈ 50.8%
assert('margin retirée (probHome ≈ 51%, pas 54%)', imp.winProbability >= 49 && imp.winProbability <= 52, `${imp.winProbability}%`);
assert('risk ≈ 49% (l\'ancien fallback filtrait tout à ≤25%)', imp.riskPercentage === 100 - imp.winProbability);
assert('source=implied', imp.source === 'implied');

const impMlb = impliedCandidate(
  { homeTeam: 'C', awayTeam: 'D', oddsHome: 2.6, oddsDraw: null, oddsAway: 1.55, date: '2026-09-10T00:10:00Z' },
  'baseball',
);
assert('MLB : jamais predictedResult=draw', impMlb.predictedResult !== 'draw');
assert('MLB : favori away sélectionné (1.55)', impMlb.predictedResult === 'away');

// ── 5. Déduplication ────────────────────────────────────────────────────────
console.log('\n5. Clé de déduplication');

assert('même match, dates égales → même clé',
  matchKey('Paris Saint-Germain', 'Olympique Lyon', '2026-09-10T20:00:00Z')
    === matchKey('paris saint germain', 'OLYMPIQUE LYON', '2026-09-10T23:59:59Z'));
assert('dates différentes → clés différentes',
  matchKey('A', 'B', '2026-09-10T20:00:00Z') !== matchKey('A', 'B', '2026-09-11T20:00:00Z'));

// ── 6. Formatage message ────────────────────────────────────────────────────
console.log('\n6. Formatage message Telegram');

if (built3) {
  const msg = formatComboMessage(built3);
  assert('titre COMBO GROUPÉ ⚽+⚾', msg.includes('COMBO GROUPÉ ⚽+⚾'));
  assert('legs avec emoji sport', msg.includes('⚾') && msg.includes('⚽'));
  assert('cote combinée affichée', msg.includes('Cote totale'));
  assert('caps par sport mentionnés', msg.includes('foot 25%') && msg.includes('MLB 30%'));
  assert('pas de caractères <br> ou JSON brut', !msg.includes('[object Object]'));

  const msgExt = formatComboMessage(built1!, true);
  assert('tier étendu étiqueté RISQUE ÉTENDU', msgExt.includes('RISQUE ÉTENDU'));
}

// ── 7. Cas limites ──────────────────────────────────────────────────────────
console.log('\n7. Cas limites');

assert('0 candidat → null', buildGroupedCombo([]) === null);
assert('1 candidat → null (MIN_LEGS=2)', buildGroupedCombo([mixed[0]]) === null);

// Un seul sport dispo → combo mono-sport
const onlyFoot = [
  cand({ homeTeam: 'F1', awayTeam: 'F2', riskPercentage: 20, selectedOdds: 1.25, sport: 'football' }),
  cand({ homeTeam: 'F3', awayTeam: 'F4', riskPercentage: 21, selectedOdds: 1.26, sport: 'football' }),
];
const built4 = buildGroupedCombo(onlyFoot);
assert('1 seul sport → combo mono-sport publié (dispo = seul critère)', built4 !== null && !built4.isMultiSport);

// Cap cote 25 : n'ajoute pas un leg qui dépasse
const longOdds = [
  cand({ homeTeam: 'H1', awayTeam: 'A1', riskPercentage: 20, selectedOdds: 20, sport: 'football' }),
  cand({ homeTeam: 'H2', awayTeam: 'A2', riskPercentage: 21, selectedOdds: 1.3, sport: 'football' }),
];
const built5 = buildGroupedCombo(longOdds);
assert('cap cote 25 respecté (20 × 1.3 = 26 > 25 → 1 seul leg → null)', built5 === null || built5.combinedOdds <= 25,
  built5 ? `cote ${built5.combinedOdds}` : 'null');

console.log(`\n════════ Résultat : ${pass}/${pass + fail} passent ════════\n`);
process.exit(fail > 0 ? 1 : 0);
