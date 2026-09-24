/**
 * Tests Tennis V3 — moteur 8 étapes (0 appel réseau sauf fixture xlsx locale)
 * Run: npx tsx scripts/test_tennis_v3.ts
 */
import {
  kFactor, marginMult, expected, applyMatch, newEloStore, snapshotRatings, surfaceRating, ELO_BASE,
} from '../src/lib/tennis-v3/elo-engine';
import {
  computeRawPrediction, calibrate, tierMultiplierOf, decide, computeValue, computeVeto, WEIGHTS, THRESHOLDS,
} from '../src/lib/tennis-v3/prediction-engine-v3';
import { parseCanonical, resolvePlayer, buildSurnameIndex } from '../src/lib/tennis-v3/name-utils';
import { parseXlsx } from '../src/lib/tennis-v3/xlsx-parser';
import { buildProfile, finalizeProfile } from '../src/lib/tennis-v3/profile-builder';
import { V3Match, V3PlayerProfile } from '../src/lib/tennis-v3/types';
import fs from 'fs';

let pass = 0, fail = 0;
function assert(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}
const approx = (a: number, b: number, eps = 0.02) => Math.abs(a - b) < eps;

// ============ 1. ELO MATH ============
console.log('\n📐 ELO');
assert('K décroissant avec games', kFactor(0) > kFactor(50) && kFactor(50) > kFactor(300));
assert('margin Bo3 2-0=1.0, 2-1=0.85', marginMult(2, 0, false) === 1.0 && marginMult(2, 1, false) === 0.85);
assert('margin Bo5 3-0=1.10, 3-2=0.9', marginMult(3, 0, true) === 1.1 && marginMult(3, 2, true) === 0.9);
assert('expected 50/50 à égalité', approx(expected(1500, 1500), 0.5));
assert('expected 200 Elo d\'écart ≈ 0.76', approx(expected(1700, 1500), 0.76, 0.01));

// symétrie + convergence : le fort gagne → ratings s'écartent
const st = newEloStore();
const strong = 'fort-a', weak = 'faible-b';
for (let i = 0; i < 20; i++) {
  applyMatch(st, { date: '2026-01-01', w: strong, l: weak, surface: 'Hard', court: 'Outdoor', series: 'ATP250', tourney: 'T', round: 'R', bo5: false, wsets: 2, lsets: 0, walkover: false, wrank: 10, lrank: 100, wpts: 0, lpts: 0 });
}
const snap = snapshotRatings(st);
assert('fort > 1500 après 20 victoires', snap[strong].overall > 1700, `got ${snap[strong].overall}`);
assert('faible < 1500 (zéro-sum)', snap[weak].overall < 1300, `got ${snap[weak].overall}`);
assert('zero-sum strict', approx(snap[strong].overall + snap[weak].overall, 2 * ELO_BASE, 0.5));
assert('piste surface séparée', snap[strong].hard > snap[strong].clay); // clay non joué → reste ~base

// ============ 2. NOMS ============
console.log('\n🔤 NOMS');
const c1 = parseCanonical('Alcaraz C.');
assert('tennis-data "Alcaraz C." → alcaraz-c', c1.key === 'alcaraz-c', c1.key);
const c2 = parseCanonical('Carlos Alcaraz');
assert('BetExplorer "Carlos Alcaraz" → alcaraz-c', c2.key === 'alcaraz-c', c2.key);
const c3 = parseCanonical('Zverev A.');
assert('accents/ponctuation nettoyés', c3.key === 'zverev-a', c3.key);
const idx = buildSurnameIndex(['alcaraz-c', 'zverev-a', 'sinner-j', 'muller-a', 'muller-l']);
assert('résolution "Carlos Alcaraz"', resolvePlayer('Carlos Alcaraz', idx) === 'alcaraz-c');
assert('résolution "Alcaraz C."', resolvePlayer('Alcaraz C.', idx) === 'alcaraz-c');
assert('ambiguïté Muller → null (pas de devinette)', resolvePlayer('Muller A.', idx) === 'muller-a' && resolvePlayer('Muller', idx) === null);
assert('inconnu → null', resolvePlayer('Doe J.', idx) === null);

// ============ 3. PROFILS SYNTHÉTIQUES ============
console.log('\n👤 PROFILS');
function fakeProfile(over: Partial<V3PlayerProfile>): V3PlayerProfile {
  return {
    key: 'x-x', display: 'X X', rating: { overall: 1500, hard: 1500, clay: 1500, grass: 1500, games: 100 },
    lastSeen: '2026-09-20', daysAbsent: 4, dominance: 0.5, dominanceSample: 20, formScore: 0.5, formSample: 10,
    surfaceWinRate: 0.5, surfaceMatches: 30, overallWinRate: 0.5, rankPoints: 1000, bo5Experience: 10,
    h2h: { wins: 0, losses: 0, surfaceWins: 0, surfaceLosses: 0, last: null }, indoorWinRate: null,
    matchesLast7d: 1, matchesLast21d: 3, lastMatchWalkover: false, ...over,
  };
}
const p1 = fakeProfile({ key: 'a-a', rating: { overall: 1900, hard: 1950, clay: 1850, grass: 1900, games: 200 } });
const p2 = fakeProfile({ key: 'b-b', rating: { overall: 1600, hard: 1600, clay: 1600, grass: 1600, games: 200 } });
const raw = computeRawPrediction(p1, p2, { surface: 'Hard', court: 'Outdoor', bo5: false });
assert('7 facteurs présents', raw.factors.length === 7);
const wSum = raw.factors.reduce((s, f) => s + f.weight, 0);
assert('somme poids = 1.0', approx(wSum, 1.0, 0.001), String(wSum));
assert('fort Elo → proba > 0.5', raw.rawProbPlayer1 > 0.6, String(raw.rawProbPlayer1));
assert('consensus élevé pour écart fort', raw.consensus >= 5, String(raw.consensus));
const raw2 = computeRawPrediction(p2, p1, { surface: 'Hard', court: 'Outdoor', bo5: false });
assert('symétrie proba (1-p)', approx(raw2.rawProbPlayer1, 1 - raw.rawProbPlayer1, 0.05), `${raw2.rawProbPlayer1} vs ${1 - raw.rawProbPlayer1}`);

// dominance asymétrique
const p1d = fakeProfile({ key: 'a-a', dominance: 0.8, dominanceSample: 15 });
const p2d = fakeProfile({ key: 'b-b', dominance: 0.4, dominanceSample: 15 });
const rawD = computeRawPrediction(p1d, p2d, { surface: 'Hard', court: 'Outdoor', bo5: false });
const fDom = rawD.factors.find((f) => f.key === 'dominance')!;
assert('facteur dominance > 0.5 si supériorité', fDom.score > 0.6, String(fDom.score));

// sample insuffisant → neutre
const p1s = fakeProfile({ key: 'a-a', dominance: 0.9, dominanceSample: 2 });
const p2s = fakeProfile({ key: 'b-b', dominance: 0.1, dominanceSample: 2 });
const rawS = computeRawPrediction(p1s, p2s, { surface: 'Hard', court: 'Outdoor', bo5: false });
const fS = rawS.factors.find((f) => f.key === 'dominance')!;
assert('sample <6 → dominance neutre', approx(fS.score, 0.5, 0.01), String(fS.score));

// ============ 4. CALIBRATION + TIERS ============
console.log('\n🎚️ CALIBRATION');
const calGS = calibrate(0.75, tierMultiplierOf('grand_slam'));
const calATP = calibrate(0.75, tierMultiplierOf('atp_500'));
assert('GS tire vers 0.5 (0.9)', calGS < calATP && calGS > 0.5, `${calGS} vs ${calATP}`);
assert('Challenger tire fort (0.78)', calibrate(0.75, tierMultiplierOf('challenger_100')) < calGS);
assert('calibration garde la direction', calibrate(0.75, 1.0) > 0.5 && calibrate(0.4, 1.0) < 0.5);

// ============ 5. VALUE ============
console.log('\n💰 VALUE');
const v1 = computeValue(0.6, 2.0);
assert('edge = 0.6-0.5 = 0.1', approx(v1!.edge, 0.1), String(v1?.edge));
assert('EV = 0.6*2-1 = 0.2', approx(v1!.ev, 0.2), String(v1?.ev));
assert('kelly plafonné à 5%', computeValue(0.9, 2.0)!.kelly <= THRESHOLDS.kellyCap + 1e-9);
assert('cote invalide → null', computeValue(0.6, 0) === null);
assert('pas de value si p<implicite', computeValue(0.4, 1.5)!.edge < 0);

// ============ 6. DECIDE (tiers, vetos, gates) ============
console.log('\n🎯 DECIDE');
// green : 75% calibré + consensus 6 + value forte
const rawG = computeRawPrediction(fakeProfile({ key: 'a-a', rating: { overall: 2050, hard: 2050, clay: 2050, grass: 2050, games: 250 }, dominance: 0.75, formScore: 0.7, surfaceWinRate: 0.75, rankPoints: 5000 }),
  fakeProfile({ key: 'b-b', rating: { overall: 1550, hard: 1550, clay: 1550, grass: 1550, games: 250 }, dominance: 0.45, formScore: 0.45, surfaceWinRate: 0.45, rankPoints: 400 }),
  { surface: 'Hard', court: 'Outdoor', bo5: false });
const calG = calibrate(rawG.rawProbPlayer1, 0.95);
const decG = decide(rawG, calG, 'atp_500', 1.4, 3.2, null);
assert('scénario fort → green', decG.tier === 'green', `${decG.label} p=${calG}`);
assert('bet recommandé si value OK', decG.betRecommended === true, JSON.stringify(decG.value));

// yellow : ~61% calibré (250 Elo d'écart, autres facteurs neutres)
const rawY = computeRawPrediction(fakeProfile({ key: 'a-a', rating: { overall: 1750, hard: 1750, clay: 1750, grass: 1750, games: 200 } }),
  fakeProfile({ key: 'b-b', rating: { overall: 1500, hard: 1500, clay: 1500, grass: 1500, games: 200 } }),
  { surface: 'Hard', court: 'Outdoor', bo5: false });
const calY = calibrate(rawY.rawProbPlayer1, 0.95);
const decY = decide(rawY, calY, 'atp_250', 1.5, 2.6, null);
assert('écart modéré → yellow (pas de bet)', decY.tier === 'yellow' && !decY.betRecommended, `${decY.tier}`);

// red : faible écart
const rawR = computeRawPrediction(fakeProfile({ key: 'a-a', rating: { overall: 1560, hard: 1560, clay: 1560, grass: 1560, games: 200 } }),
  fakeProfile({ key: 'b-b', rating: { overall: 1590, hard: 1590, clay: 1590, grass: 1590, games: 200 } }),
  { surface: 'Hard', court: 'Outdoor', bo5: false });
const decR = decide(rawR, calibrate(rawR.rawProbPlayer1, 0.95), 'atp_250', 1.9, 1.95, null);
assert('écart faible → red NO BET', decR.tier === 'red' && !decR.betRecommended);

// veto prioritaire
const decV = decide(rawG, 0.9, 'atp_500', 1.4, 3.2, 'absence_longue');
assert('veto → NO BET même à 90%', decV.tier === 'red' && decV.veto === 'absence_longue' && !decV.betRecommended);

// value gate : edge insuffisant
const decLowEdge = decide(rawG, calG, 'atp_500', 1.05, 12, null); // cote trop basse → edge quasi nul
assert('edge insuffisant → pas de bet', !decLowEdge.betRecommended, JSON.stringify(decLowEdge.reasons));

// divergence marché : edge requis 8%
const decDiv = decide(rawG, calG, 'atp_500', 1.32, 4.5, null);
assert('cote sous-divergence gérée sans crash', typeof decDiv.betRecommended === 'boolean');

// ============ 7. VETO CONDITIONS ============
console.log('\n🚫 VETO');
assert('walkover récent → veto', computeVeto(fakeProfile({ lastMatchWalkover: true })) === 'walkover_recent');
assert('absence >60j → veto', computeVeto(fakeProfile({ daysAbsent: 75 })) === 'absence_longue');
assert('≥4 matchs/7j → veto', computeVeto(fakeProfile({ matchesLast7d: 4 })) === 'surcharge_matchs');
assert('joueur frais → pas de veto', computeVeto(fakeProfile({})) === null);

// ============ 8. XLSX RÉEL (fixture téléchargée) ============
async function testXlsx() {
  console.log('\n📄 XLSX RÉEL');
  const xlsxPath = '/home/z/my-project/scripts/tennisdata_atp_2026.xlsx';
  if (fs.existsSync(xlsxPath)) {
    const rows = await parseXlsx(fs.readFileSync(xlsxPath));
    assert('xlsx ATP 2026 parsé (>2000 lignes)', rows.length > 2000, String(rows.length));
    const first = rows.find((r) => r['Winner'] && r['Date']);
    assert('colonnes attendues', Boolean(first && first['Winner'] && first['Surface'] && first['PSW'] !== undefined), JSON.stringify(Object.keys(first || {})).slice(0, 120));
    assert('types numériques', typeof first?.['WRank'] === 'number' || typeof first?.['PSW'] === 'number');
  } else {
    console.log('⚠️ fixture xlsx absente, test ignoré');
  }
}

// ============ 9. END-TO-END SEED + PROFIL RÉEL ============
async function testSeedE2E() {
  console.log('\n🌐 END-TO-END SEED');
  const seedPath = '/home/z/my-project/src/lib/tennis-v3/seed/tennis-seed.json.gz';
  if (fs.existsSync(seedPath)) {
    const zlib = require('zlib');
    const seed = JSON.parse(zlib.gunzipSync(fs.readFileSync(seedPath)).toString());
    assert('seed >25k matchs', seed.counts.total > 25000, String(seed.counts.total));
    assert('playerStats présents', Object.keys(seed.playerStats || {}).length > 500);
    const topEntry = Object.entries(seed.ratings as any).sort((a: any, b: any) => b[1].overall - a[1].overall)[0];
    const topName = topEntry[0] as string;
    assert('top Elo > 2000', (seed.ratings as any)[topName].overall > 2000, `${topName} ${(seed.ratings as any)[topName].overall}`);
    assert('matchs récents présents', (seed.recentMatches as any[]).length > 500);

    // profil réel via runtime (le data-service charge le même seed, clés normalisées)
    const { ensureFreshData, getRuntimeMatches } = await import('../src/lib/tennis-v3/data-service');
    const { parseCanonical } = await import('../src/lib/tennis-v3/name-utils');
    await ensureFreshData();
    const runtime = getRuntimeMatches();
    assert('runtime matchs chargés', runtime.length > 500, String(runtime.length));
    const prof = buildProfile(parseCanonical(topName).key, runtime);
    assert('profil top joueur construit', Boolean(prof) && prof!.rating.overall > 2000);
    if (prof && runtime.length > 0) {
      const lastM = runtime[runtime.length - 1];
      const opp = lastM.w === topName ? lastM.l : lastM.w;
      const profOpp = buildProfile(opp, runtime) || fakeProfile({ key: opp });
      finalizeProfile(prof, 'Hard', opp, runtime);
      const e2e = computeRawPrediction(prof, profOpp, { surface: 'Hard', court: 'Outdoor', bo5: false });
      assert('prédiction end-to-end en (0,1)', e2e.rawProbPlayer1 > 0 && e2e.rawProbPlayer1 < 1);
    }
  } else {
    console.log('⚠️ seed absent, test ignoré');
  }
}

(async () => {
  await testXlsx();
  await testSeedE2E();
  console.log(`\n========== RÉSULTAT: ${pass} passés / ${fail} échoués ==========`);
  process.exit(fail > 0 ? 1 : 0);
})();
