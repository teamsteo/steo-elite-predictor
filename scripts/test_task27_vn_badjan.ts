/**
 * Test Task 27 — Politique VN (nul=gagné) + enrichissement BADJAN (ratio domicile + H2H)
 * Exécution: npx tsx scripts/test_task27_vn_badjan.ts
 */
import { evaluateBadjanRatios, fetchBadjanHomeRecord, fetchBadjanH2H } from '../src/lib/badjanService';
import { vnResultMatch } from '../src/lib/resultPolicy';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`✅ ${name}`); }
  else { failed++; console.log(`❌ ${name}`); }
}

// ═══ 1. POLITIQUE VN (nul = victoire pour home/away) ═══
console.log('═══ 1. Politique VN ═══');
check('home prédit, home réel → GAGNÉ', vnResultMatch('home', 'home') === true);
check('home prédit, NUL réel → GAGNÉ (VN)', vnResultMatch('home', 'draw') === true);
check('home prédit, away réel → PERDU', vnResultMatch('home', 'away') === false);
check('away prédit, away réel → GAGNÉ', vnResultMatch('away', 'away') === true);
check('away prédit, NUL réel → GAGNÉ (VN)', vnResultMatch('away', 'draw') === true);
check('away prédit, home réel → PERDU', vnResultMatch('away', 'home') === false);
check('draw prédit, nul réel → GAGNÉ', vnResultMatch('draw', 'draw') === true);
check('draw prédit, home réel → PERDU', vnResultMatch('draw', 'home') === false);
check('draw prédit, away réel → PERDU', vnResultMatch('draw', 'away') === false);

// ═══ 2. Évaluation des ratios BADJAN (pur) ═══
console.log('═══ 2. Ratios BADJAN ═══');
// Cas nominal: 60% domicile, 60% H2H
const r1 = evaluateBadjanRatios(
  { played: 5, wins: 3, draws: 1, losses: 1 },
  { total: 5, wins: 3, draws: 1, losses: 1 }
);
check('ratios 60%/60% → PASS', r1.pass === true && r1.stats !== undefined);

// Ratio domicile trop faible
const r2 = evaluateBadjanRatios(
  { played: 4, wins: 1, draws: 2, losses: 1 },
  { total: 5, wins: 4, draws: 1, losses: 0 }
);
check('domicile 25% → REJET (ratio)', !r2.pass && (r2.reason || '').includes('domicile'));

// Échantillon domicile insuffisant
const r3 = evaluateBadjanRatios(
  { played: 1, wins: 1, draws: 0, losses: 0 },
  { total: 5, wins: 3, draws: 0, losses: 2 }
);
check('1 seul match domicile → REJET (échantillon)', !r3.pass && (r3.reason || '').includes('échantillon domicile'));

// H2H trop faible
const r4 = evaluateBadjanRatios(
  { played: 6, wins: 4, draws: 1, losses: 1 },
  { total: 4, wins: 1, draws: 1, losses: 2 }
);
check('H2H 25% → REJET (ratio H2H)', !r4.pass && (r4.reason || '').includes('H2H'));

// H2H insuffisant (0 confrontation — équipes jamais rencontrées)
const r5 = evaluateBadjanRatios(
  { played: 6, wins: 4, draws: 1, losses: 1 },
  { total: 0, wins: 0, draws: 0, losses: 0 }
);
check('H2H vide → REJET (échantillon H2H)', !r5.pass && (r5.reason || '').includes('H2H'));

// Stats indisponibles (fail-closed)
const r6 = evaluateBadjanRatios(null, null);
check('stats indisponibles → REJET (fail-closed)', !r6.pass);

// Seuil exact = 50% → passe
const r7 = evaluateBadjanRatios(
  { played: 2, wins: 1, draws: 0, losses: 1 },
  { total: 2, wins: 1, draws: 0, losses: 1 }
);
check('50%/50% (seuil inclus) → PASS', r7.pass === true);

// ═══ 3. Validation LIVE ESPN (données réelles, tolérante réseau) ═══
console.log('═══ 3. ESPN live ═══');

async function liveTests(): Promise<void> {
  try {
  // Bournemouth (id 349) — Premier League soccer/eng.1 — event 401879276 (BOU-LIV)
  const home = await fetchBadjanHomeRecord('soccer/eng.1', '349');
  check('fetchBadjanHomeRecord → données reçues', home !== null);
  if (home) {
    check('domicile: played ≥ wins+draws+losses cohérent',
      home.wins + home.draws + home.losses === home.played);
    console.log(`   🏠 Bournemouth domicile: ${home.wins}V-${home.draws}N-${home.losses}D (${home.played} joués)`);
  }
  const h2h = await fetchBadjanH2H('soccer/eng.1', '401879276', '349');
  check('fetchBadjanH2H → données reçues', h2h !== null);
  if (h2h) {
    check('H2H: wins+draws+losses === total', h2h.wins + h2h.draws + h2h.losses === h2h.total);
    console.log(`   ⚔️ BOU vs LIV H2H: ${h2h.wins}V-${h2h.draws}N-${h2h.losses}D (${h2h.total} confrontations)`);
  }
  // Cache: second appel = hit (pas d'échec)
  const home2 = await fetchBadjanHomeRecord('soccer/eng.1', '349');
  check('cache home record opérationnel', JSON.stringify(home) === JSON.stringify(home2));
} catch (e: any) {
  console.log(`⚠️ ESPN live indisponible (non bloquant): ${e?.message}`);
}

console.log('════════════════════════════════');
console.log(`Résultat: ${passed} passés, ${failed} échoués`);
if (failed > 0) process.exit(1);
}

liveTests().then(() => {
  console.log('════════════════════════════════');
  console.log(`Résultat final: ${passed} passés, ${failed} échoués`);
  if (failed > 0) process.exit(1);
});
