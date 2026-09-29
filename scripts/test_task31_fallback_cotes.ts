/**
 * Test Task 31 — Fallback cotes normalisées (BADJAN)
 * Scénario : stats ESPN indisponibles (équipes nationales, coupes, début saison).
 * Le système doit accepter le pick si probHome ≥ 55% (cotes 1X2 normalisées).
 *
 * Exécution: npx tsx scripts/test_task31_fallback_cotes.ts
 */
import {
  evaluateBadjanRatios,
  BADJAN_FALLBACK_MIN_PROB_HOME,
  BADJAN_MIN_HOME_WIN_RATIO,
  BADJAN_MIN_H2H_WIN_RATIO,
} from '../src/lib/badjanService';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`✅ ${name}`); }
  else { failed++; console.log(`❌ ${name}`); }
}

console.log('═══ Task 31 — Fallback cotes normalisées ═══');
console.log(`   Constantes: BADJAN_FALLBACK_MIN_PROB_HOME=${BADJAN_FALLBACK_MIN_PROB_HOME}, MIN_HOME_WIN_RATIO=${BADJAN_MIN_HOME_WIN_RATIO}, MIN_H2H_WIN_RATIO=${BADJAN_MIN_H2H_WIN_RATIO}\n`);

// ═══ 1. Stats ESPN indisponibles (null/null) ═══
console.log('═══ 1. Stats ESPN indisponibles (null/null) ═══');

// Cas nominal du jour : Spain vs Croatia (équipes nationales, ESPN vide)
// Cotes typiques 1X2 : 1.80 / 3.50 / 4.20 → probHome = (1/1.80) / (1/1.80 + 1/3.50 + 1/4.20)
//                                       = 0.5556 / (0.5556 + 0.2857 + 0.2381) = 0.5556 / 1.0794 = 0.5147 → < 0.55, REJET
// Modifions : 1.65 / 3.50 / 4.50 → probHome = 0.606 / (0.606 + 0.286 + 0.222) = 0.606 / 1.114 = 0.544 → borderline
// Prenons 1.55 / 3.60 / 5.00 → probHome = 0.645 / (0.645 + 0.278 + 0.200) = 0.645 / 1.123 = 0.574 → ≥ 0.55, ACCEPT
const invH = 1 / 1.55, invD = 1 / 3.60, invA = 1 / 5.00;
const probHomeStrong = invH / (invH + invD + invA);
console.log(`   probHomeStrong = ${(probHomeStrong * 100).toFixed(1)}% (1.55/3.60/5.00)`);

const r1 = evaluateBadjanRatios(null, null, probHomeStrong);
check('Stats ESPN null + probHome >= 55% -> PASS (fallback)', r1.pass === true);
check('Stats ESPN null + probHome >= 55% -> badge fallback=cotes', r1.stats?.fallback === 'cotes');
check('Stats ESPN null + probHome >= 55% -> homeWinRatio = probHome (car 0 joue)', r1.stats?.homeWinRatio === probHomeStrong);
check('Stats ESPN null + probHome >= 55% -> probHomeMarket = probHomeStrong', r1.stats?.probHomeMarket === probHomeStrong);

// Cas probHome faible : 3.00 / 3.20 / 2.20 → probHome = 0.333 / (0.333+0.3125+0.4545) = 0.333/1.10 = 0.303 → REJET
const invH2 = 1 / 3.00, invD2 = 1 / 3.20, invA2 = 1 / 2.20;
const probHomeWeak = invH2 / (invH2 + invD2 + invA2);
console.log(`   probHomeWeak = ${(probHomeWeak * 100).toFixed(1)}% (3.00/3.20/2.20)`);

const r2 = evaluateBadjanRatios(null, null, probHomeWeak);
check('Stats ESPN null + probHome < 55% → REJET', r2.pass === false);
check('Stats ESPN null + probHome < 55% → reason contient fallback cotes', (r2.reason || '').includes('fallback cotes'));

// Cas limite : probHome exactement 55% → ACCEPT
const r3 = evaluateBadjanRatios(null, null, 0.55);
check('probHome = 55% (seuil inclus) → PASS', r3.pass === true && r3.stats?.fallback === 'cotes');

// Cas sans probHomeFallback (legacy) → REJET (fail-closed strict)
const r4 = evaluateBadjanRatios(null, null);
check('Stats ESPN null + pas de probHomeFallback → REJET (fail-closed)', r4.pass === false);

// ═══ 2. Échantillon ESPN insuffisant (1 match) — fallback marché ═══
console.log('\n═══ 2. Échantillon ESPN insuffisant (1 match) — fallback marché ═══');

const r5 = evaluateBadjanRatios(
  { played: 1, wins: 1, draws: 0, losses: 0 }, // 1 match domicile = insuffisant
  { total: 1, wins: 1, draws: 0, losses: 0 },   // 1 confrontation = insuffisant
  0.60  // probHome = 60% ≥ 55%
);
check('Échantillon insuffisant + probHome 60% → PASS (fallback)', r5.pass === true);
check('Échantillon insuffisant + probHome 60% → fallback=cotes', r5.stats?.fallback === 'cotes');
check('Échantillon insuffisant + probHome 60% → homeWinRatio = 1.0 (1V/1 joué)', r5.stats?.homeWinRatio === 1.0);

const r6 = evaluateBadjanRatios(
  { played: 1, wins: 1, draws: 0, losses: 0 },
  { total: 1, wins: 1, draws: 0, losses: 0 },
  0.40  // probHome = 40% < 55%
);
check('Échantillon insuffisant + probHome 40% → REJET', r6.pass === false);

// ═══ 3. ESPN OK ratios faibles — fallback marché sauve si probHome solide ═══
console.log('\n═══ 3. ESPN OK ratios faibles — fallback marché sauve si probHome solide ═══');

// Domicile 25% mais probHome 70% (équipe favorite selon marché malgré stats saison médiocres)
const r7 = evaluateBadjanRatios(
  { played: 4, wins: 1, draws: 2, losses: 1 },  // 25% domicile
  { total: 5, wins: 4, draws: 1, losses: 0 },   // 80% H2H OK
  0.70
);
check('Domicile 25% + H2H 80% OK + probHome 70% → PASS (fallback sauve)', r7.pass === true);
check('Domicile 25% + H2H 80% OK + probHome 70% → fallback=cotes', r7.stats?.fallback === 'cotes');
check('Domicile 25% + H2H 80% OK + probHome 70% → homeWinRatio = 0.25 (réel)', r7.stats?.homeWinRatio === 0.25);

// Sans probHomeFallback, doit rester rejeté (comportement legacy Task 27)
const r8 = evaluateBadjanRatios(
  { played: 4, wins: 1, draws: 2, losses: 1 },
  { total: 5, wins: 4, draws: 1, losses: 0 }
);
check('Domicile 25% + pas de fallback → REJET (legacy Task 27)', r8.pass === false);

// Domicile 25% ET H2H 25% ET probHome 60% → fallback sauve
const r9 = evaluateBadjanRatios(
  { played: 4, wins: 1, draws: 2, losses: 1 },
  { total: 4, wins: 1, draws: 1, losses: 2 },
  0.60
);
check('Domicile 25% + H2H 25% + probHome 60% → PASS (fallback)', r9.pass === true);
check('Domicile 25% + H2H 25% + probHome 60% → fallback=cotes', r9.stats?.fallback === 'cotes');

// Domicile 25% ET H2H 25% ET probHome 50% → REJET (fallback insuffisant)
const r10 = evaluateBadjanRatios(
  { played: 4, wins: 1, draws: 2, losses: 1 },
  { total: 4, wins: 1, draws: 1, losses: 2 },
  0.50
);
check('Domicile 25% + H2H 25% + probHome 50% → REJET (fallback trop faible)', r10.pass === false);

// ═══ 4. ESPN OK ratios valides — chemin strict (pas de fallback) ═══
console.log('\n═══ 4. ESPN OK ratios valides — chemin strict (pas de fallback) ═══');

const r11 = evaluateBadjanRatios(
  { played: 5, wins: 3, draws: 1, losses: 1 },  // 60% domicile OK
  { total: 5, wins: 3, draws: 1, losses: 1 },   // 60% H2H OK
  0.40  // probHome 40% (n'importe quelle valeur — ne doit pas être utilisée)
);
check('Ratios 60%/60% OK → PASS (chemin strict)', r11.pass === true);
check('Ratios 60%/60% OK → pas de badge fallback', r11.stats?.fallback === undefined);
check('Ratios 60%/60% OK → homeWinRatio = 0.6', r11.stats?.homeWinRatio === 0.6);

// ═══ 5. Normalisation cotes 1X2 — vérification mathématique ═══
console.log('\n═══ 5. Normalisation cotes 1X2 (marge bookmaker retirée) ═══');

// Spain vs Croatia aujourd'hui (échantillon ESPN domicile = 0)
// Cotes hipotéticas: 1.85 / 3.30 / 4.00
//   invH = 0.5405, invD = 0.3030, invA = 0.2500
//   invSum = 1.0936 (marge bookmaker ≈ 9.36%)
//   probHome = 0.5405 / 1.0936 = 0.4943 → 49.43% < 55% → REJET
const spainInvH = 1 / 1.85, spainInvD = 1 / 3.30, spainInvA = 1 / 4.00;
const spainProbHome = spainInvH / (spainInvH + spainInvD + spainInvA);
console.log(`   Spain vs Croatia (1.85/3.30/4.00) → probHome = ${(spainProbHome * 100).toFixed(1)}%`);
check('Spain 1.85/3.30/4.00 → probHome < 55% (rejet fallback)', spainProbHome < BADJAN_FALLBACK_MIN_PROB_HOME);

const r12 = evaluateBadjanRatios(null, null, spainProbHome);
check('Spain ESPN null + probHome 49% → REJET', r12.pass === false);

// Slovenia vs North Macedonia — ESPN domicile = 1 match (insuffisant)
// Cotes hipotéticas: 2.20 / 3.10 / 3.00
//   invH = 0.4545, invD = 0.3226, invA = 0.3333
//   invSum = 1.1104 → probHome = 0.4545 / 1.1104 = 0.4093 → 40.93% < 55% → REJET
const sloveniaInvH = 1 / 2.20, sloveniaInvD = 1 / 3.10, sloveniaInvA = 1 / 3.00;
const sloveniaProbHome = sloveniaInvH / (sloveniaInvH + sloveniaInvD + sloveniaInvA);
console.log(`   Slovenia (2.20/3.10/3.00) → probHome = ${(sloveniaProbHome * 100).toFixed(1)}%`);
check('Slovenia 2.20/3.10/3.00 → probHome < 55% (rejet fallback)', sloveniaProbHome < BADJAN_FALLBACK_MIN_PROB_HOME);

const r13 = evaluateBadjanRatios({ played: 1, wins: 1, draws: 0, losses: 0 }, null, sloveniaProbHome);
check('Slovenia 1 match domicile + probHome 41% → REJET', r13.pass === false);

// Bulgaria vs Estonia — ESPN domicile = 1 match (insuffisant)
// Cotes hipotéticas: 1.95 / 3.20 / 3.80
//   invH = 0.5128, invD = 0.3125, invA = 0.2632
//   invSum = 1.0885 → probHome = 0.5128 / 1.0885 = 0.4711 → 47.11% < 55% → REJET
const bulgariaInvH = 1 / 1.95, bulgariaInvD = 1 / 3.20, bulgariaInvA = 1 / 3.80;
const bulgariaProbHome = bulgariaInvH / (bulgariaInvH + bulgariaInvD + bulgariaInvA);
console.log(`   Bulgaria (1.95/3.20/3.80) → probHome = ${(bulgariaProbHome * 100).toFixed(1)}%`);
check('Bulgaria 1.95/3.20/3.80 → probHome < 55% (rejet fallback)', bulgariaProbHome < BADJAN_FALLBACK_MIN_PROB_HOME);

const r14 = evaluateBadjanRatios({ played: 1, wins: 1, draws: 0, losses: 0 }, null, bulgariaProbHome);
check('Bulgaria 1 match domicile + probHome 47% → REJET', r14.pass === false);

console.log('\n⚠️ Note: les 3 matchs d\'aujourd\'hui (Spain/Slovenia/Bulgaria) seraient TOUS rejetés même avec le fallback car leurs cotes 1X2 ne font pas d\'eux des favoris clairs (probHome < 55%). C\'est le comportement correct — BADJAN reste sélectif.');
console.log('   Le fallback active le pick UNIQUEMENT pour des favoris marché nets (probHome ≥ 55%).');

console.log('\n════════════════════════════════');
console.log(`Résultat: ${passed} passés, ${failed} échoués`);
if (failed > 0) process.exit(1);
