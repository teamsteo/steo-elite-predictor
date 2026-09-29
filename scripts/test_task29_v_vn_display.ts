/**
 * Test Task 29 — Duo V/VN affiché sur chaque pick BADJAN (pourcentages normalisés)
 * Exécution: npx tsx scripts/test_task29_v_vn_display.ts
 */
import { formatBadjanMessage, BADJAN_MIN_HOME_WIN_RATIO, BADJAN_MIN_H2H_WIN_RATIO } from '../src/lib/badjanService';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`✅ ${name}`); }
  else { failed++; console.log(`❌ ${name}`); }
}

// ── Normalisation 1X2 (marge retirée) — mêmes formules que combinedDataService ──
function normalized(oddsHome: number, oddsDraw: number | null | undefined, oddsAway: number) {
  const invH = oddsHome > 0 ? 1 / oddsHome : 0;
  const invA = oddsAway > 0 ? 1 / oddsAway : 0;
  const invD = oddsDraw && oddsDraw > 0 ? 1 / oddsDraw : 0;
  const invSum = invH + invD + invA;
  const probHome = invSum > 0 ? invH / invSum : 0.5;
  const probAway = invSum > 0 ? invA / invSum : 0.5;
  const probDraw = invSum > 0 ? invD / invSum : Math.max(0, 1 - probHome - probAway);
  return { probHome, probDraw, probAway };
}

// ═══ 1. Math des probabilités normalisées ═══
console.log('═══ 1. Probabilités 1X2 normalisées ═══');
// Cotes 2.0 / 3.5 / 3.8 → somme inverse = 1.0489
const n1 = normalized(2.0, 3.5, 3.8);
check('pH normalisé ≈ 47.7% (cote 2.0)', Math.abs(n1.probHome - 0.4767) < 0.005);
check('pD normalisé ≈ 27.2% (cote 3.5)', Math.abs(n1.probDraw - 0.2724) < 0.005);
check('pA normalisé ≈ 25.1% (cote 3.8)', Math.abs(n1.probAway - 0.2509) < 0.005);
check('somme = 100%', Math.abs(n1.probHome + n1.probDraw + n1.probAway - 1) < 1e-9);

// VN = V + N : favori domicile → V 48% / VN 75%
const v1 = n1.probHome;
const vn1 = Math.min(1, n1.probHome + n1.probDraw);
check('VN > V toujours', vn1 > v1);
check('V ≈ 48%', Math.round(v1 * 100) === 48);
check('VN ≈ 75%', Math.round(vn1 * 100) === 75);

// Cas favori fort: 1.4 / 4.5 / 8.0
const n2 = normalized(1.4, 4.5, 8.0);
const v2 = Math.round(n2.probHome * 100);
const vn2 = Math.round(Math.min(1, n2.probHome + n2.probDraw) * 100);
check(`favori fort → V ${v2}% < VN ${vn2}%`, vn2 > v2 && v2 >= 65);

// ═══ 2. Affichage dans le message BADJAN ═══
console.log('═══ 2. Message BADJAN (duo V/VN) ═══');
const pick = {
  homeTeam: 'PSG',
  awayTeam: 'Lens',
  league: 'Ligue 1',
  date: '2026-09-29T19:00:00Z',
  predictedResult: 'home' as const,
  recommendation: 'PSG',
  oddsHome: 2.0,
  oddsDraw: 3.5,
  oddsAway: 3.8,
  riskPercentage: 52,
  winProbability: 48,
  // Task 29: probabilités normalisées du pipeline
  vProbability: n1.probHome,
  vnProbability: vn1,
  probHome: n1.probHome,
  probDraw: n1.probDraw,
  probAway: n1.probAway,
  badjanStats: {
    home: { played: 4, wins: 3, draws: 1, losses: 0 },
    h2h: { total: 4, wins: 2, draws: 1, losses: 1 },
    homeWinRatio: 0.75,
    h2hWinRatio: 0.5,
  },
};
const msg = formatBadjanMessage([pick]);
check('message contient "V (risqué): 48%"', msg.includes('V (risqué): 48%'));
check('message contient "VN (fiable): 75%"', msg.includes('VN (fiable): 75%'));
check('message contient le risque', msg.includes('Risque'));
check("l'ancienne ligne seule « 💥 Chance » a disparu quand V/VN dispo", !msg.includes('💥 Chance'));
check('ratios domicile/H2H toujours affichés', msg.includes('🏠 Domicile (saison)') && msg.includes('⚔️ H2H'));

// ═══ 3. Fallbacks ═══
console.log('═══ 3. Fallbacks (zéro régression) ═══');
// Pick sans vProbability (ancien pipeline) → ancienne ligne Chance conservée
const legacyPick = { ...pick, vProbability: undefined, vnProbability: undefined };
const msgLegacy = formatBadjanMessage([legacyPick]);
check('fallback: ligne « 💥 Chance: <b>48%</b> » conservée', msgLegacy.includes('💥 Chance: <b>48%</b>'));

// Sport US sans nul: VN = V (pas de probDraw)
const usPick = {
  homeTeam: 'Lakers',
  awayTeam: 'Celtics',
  league: 'NBA',
  predictedResult: 'home' as const,
  oddsHome: 1.9,
  oddsAway: 1.95,
  riskPercentage: 47,
  winProbability: 53,
  vProbability: 0.53,
  vnProbability: 0.53,
};
const msgUs = formatBadjanMessage([usPick]);
check('US (pas de nul): V = VN = 53%', msgUs.includes('V (risqué): 53%') && msgUs.includes('VN (fiable): 53%'));

// ═══ 4. Constantes BADJAN inchangées ═══
check('seuils domicile/H2H toujours 50%', BADJAN_MIN_HOME_WIN_RATIO === 0.5 && BADJAN_MIN_H2H_WIN_RATIO === 0.5);

console.log('\n══════════════════════════════════════');
console.log(`RÉSULTAT: ${passed} passés, ${failed} échoués`);
process.exit(failed > 0 ? 1 : 0);
