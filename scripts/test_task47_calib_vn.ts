/**
 * Task 47 — Tests unitaires calibration VN football
 *
 * Vérifie:
 *  1. Calibration Platt bornes [0.001, 0.999]
 *  2. Coefficients connus (sanity check)
 *  3. Classification par VN calibré
 *  4. Cote DC bookmaker correcte
 *  5. Proba VN marché dévigorisée
 *  6. Construction du pVN hybride (p_side + p_nul_marché)
 *  7. Edge = p_calibrée - p_marché (signe attendu)
 *  8. Pipeline football produit les champs VN (DailyPrediction)
 *  9. SQL migration présent (idempotent)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  calibrateFootballVN,
  classifyByCalibratedVN,
  computeVNProbFromRiskAndOdds,
  doubleChanceOddsFromOdds,
  marketVNProb,
  calibrationMeta,
} from '../src/lib/calibration';

interface TestResult { name: string; passed: boolean; details?: string; }
const results: TestResult[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (e: any) {
    results.push({ name, passed: false, details: e.message });
  }
}
async function testAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
  } catch (e: any) {
    results.push({ name, passed: false, details: e.message });
  }
}
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}
function approxEq(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) < eps;
}

// ─── Tests ──────────────────────────────────────────────────────────

test('calibration: coefficients Platt connus et stables', () => {
  const m = calibrationMeta();
  assert(m.fittedAt === '2026-10-19', `fittedAt incorrect: ${m.fittedAt}`);
  assert(m.nTotal === 470, `nTotal incorrect: ${m.nTotal}`);
  assert(approxEq(m.coeffs.risque.a, 1.7391, 0.001), `a risque: ${m.coeffs.risque.a}`);
  assert(approxEq(m.coeffs.risque.b, -0.8108, 0.001), `b risque: ${m.coeffs.risque.b}`);
  assert(approxEq(m.coeffs.fiable.a, -0.0541, 0.001), `a fiable: ${m.coeffs.fiable.a}`);
  assert(approxEq(m.coeffs.fiable.b, 2.2813, 0.001), `b fiable: ${m.coeffs.fiable.b}`);
});

test('calibration: bornes [0.001, 0.999] respectées', () => {
  assert(calibrateFootballVN(0, 'risque') === 0.001, 'p=0 → 0.001');
  assert(calibrateFootballVN(1, 'risque') === 0.999, 'p=1 → 0.999');
  assert(calibrateFootballVN(0.5, 'risque') > 0 && calibrateFootballVN(0.5, 'risque') < 1, 'p=0.5 dans (0,1)');
  assert(calibrateFootballVN(0.001, 'fiable') > 0, 'p=0.001 fiable > 0');
  assert(calibrateFootballVN(0.999, 'fiable') < 1, 'p=0.999 fiable < 1');
});

test('calibration: p=0.5 risqué → moins de 0.5 (sous-confiance modèle reconnue)', () => {
  // Sur risque: le modèle est sur-confiant; calibration devrait réduire la proba
  // pour p=0.5 (qui correspond à risk=50%, juste au-dessus du seuil fiable)
  const pCalRisq = calibrateFootballVN(0.5, 'risque');
  assert(pCalRisq < 0.5, `p=0.5 risque calibré devrait être <0.5, got ${pCalRisq}`);
  // Sur fiable: a≈0, b≈2.28 → sigm(2.28) ≈ 0.907
  const pCalFiable = calibrateFootballVN(0.5, 'fiable');
  assert(pCalFiable > 0.85 && pCalFiable < 0.95, `p=0.5 fiable ≈ 0.91, got ${pCalFiable}`);
});

test('calibration: p=0.7 risque → ~0.7 (well-calibrated region)', () => {
  const p = calibrateFootballVN(0.7, 'risque');
  // Buckets obs: p_pred 70-80% → WR 74.7%, calibré 72.8% → p=0.7 → ~0.7
  assert(p > 0.65 && p < 0.80, `p=0.7 risque attendu ~0.7, got ${p}`);
});

test('classification par VN calibré', () => {
  assert(classifyByCalibratedVN(0.95) === 'fiable', '0.95 → fiable');
  assert(classifyByCalibratedVN(0.85) === 'fiable', '0.85 → fiable');
  assert(classifyByCalibratedVN(0.75) === 'modere', '0.75 → modere');
  assert(classifyByCalibratedVN(0.65) === 'modere', '0.65 → modere');
  assert(classifyByCalibratedVN(0.55) === 'risque', '0.55 → risque');
  assert(classifyByCalibratedVN(0.45) === 'avoid', '0.45 → avoid');
  assert(classifyByCalibratedVN(0.30) === 'avoid', '0.30 → avoid');
});

test('cote DC bookmaker = 1 / (1/O_side + 1/O_draw)', () => {
  // Exemple Task 46: O_side=2.30, O_draw=3.00 → 1/(0.4348+0.3333) = 1.30
  const dc = doubleChanceOddsFromOdds(2.30, 3.00);
  assert(dc !== null, 'DC null inattendu');
  assert(approxEq(dc!, 1.30, 0.01), `DC 2.30/3.00 attendu 1.30, got ${dc}`);
  // Sans cote draw → null
  assert(doubleChanceOddsFromOdds(2.30, null) === null, 'DC sans draw → null');
  assert(doubleChanceOddsFromOdds(null, 3.00) === null, 'DC sans side → null');
  assert(doubleChanceOddsFromOdds(1.0, 3.00) === null, 'DC side=1 → null');
});

test('proba VN marché dévigorisée', () => {
  // Cotes 1X2 équilibrées 2.50/3.30/2.50: p_VN_home = (1/2.5+1/3.3)/Σ = 0.4+0.303/0.803 ≈ 0.873
  // mais (0.4+0.303)/(0.4+0.303+0.4) = 0.703/1.103 = 0.637
  const p = marketVNProb('home', 2.50, 3.30, 2.50);
  assert(p !== null, 'market VN null inattendu');
  assert(approxEq(p!, 0.637, 0.01), `marketVN home 2.50/3.30/2.50 = 0.637, got ${p}`);
  // Cote extrême: favori @1.20, nul @6, outsider @15 → p_VN_home = (0.833+0.167)/(0.833+0.167+0.067) = 0.931
  const p2 = marketVNProb('home', 1.20, 6.00, 15.00);
  assert(p2 !== null && approxEq(p2!, 0.931, 0.01), `marketVN 1.20/6/15 = 0.931, got ${p2}`);
  // Away side symétrique: p_VN_away = (0.067+0.167)/(0.833+0.167+0.067) = 0.215
  const p3 = marketVNProb('away', 1.20, 6.00, 15.00);
  assert(p3 !== null && approxEq(p3!, 0.215, 0.01), `marketVN away = 0.215, got ${p3}`);
});

test('computeVNProbFromRiskAndOdds: p_side + p_nul_dévig', () => {
  // risk=50 → p_side=0.50; cotes 2.50/3.30/2.50 → p_nul_mkt = 0.303
  // → pVN = 0.803 (avant clamp)
  const p = computeVNProbFromRiskAndOdds(50, 2.50, 3.30, 2.50);
  assert(p > 0.75 && p < 0.85, `pVN risk=50 = ~0.80, got ${p}`);
  // Sans cote draw → fallback p_side + 0.25
  const p2 = computeVNProbFromRiskAndOdds(50, 2.50, null, 2.50);
  assert(approxEq(p2, 0.75, 0.001), `pVN fallback risk=50 = 0.75, got ${p2}`);
});

test('edge = p_calibrée - p_marché_dévig (signe cohérent)', () => {
  // Cas 1: risque risk=60, p_side=0.40, pVN hybride = 0.40 + p_nul_dévig
  // cotes 2.50/3.30/2.50: iH=0.4, iD=0.303, iA=0.4, sum=1.103
  // p_nul_mkt = 0.303/1.103 = 0.275 → pVN_raw = 0.675
  // Platt risque: σ(1.7391 × logit(0.675) − 0.8108) = σ(1.7391×0.731−0.811) = σ(0.460) ≈ 0.613
  // p_market_home = (0.4+0.303)/1.103 = 0.637
  // edge = 0.613 − 0.637 = −2.4pp → pas de value bet (modèle calibré < marché)
  const riskPct = 60;
  const oddsH = 2.50, oddsD = 3.30, oddsA = 2.50;
  const pVNRaw = computeVNProbFromRiskAndOdds(riskPct, oddsH, oddsD, oddsA);
  const pCal = calibrateFootballVN(pVNRaw, 'risque');
  const pMkt = marketVNProb('home', oddsH, oddsD, oddsA);
  const edge = Math.round((pCal - pMkt!) * 1000) / 10;
  assert(edge > -5 && edge < 0, `edge risk=60 attendu ~-2.5pp, got ${edge}`);

  // Cas 2: risque avec cotes déséquilibrées (modèle devrait avoir edge positif)
  // risk=55 (p_side=0.45), cotes 1.80/3.50/4.20 (favori home mais reco home aussi)
  // p_nul_mkt = (1/3.5)/Σ = 0.286/(0.556+0.286+0.238) = 0.286/1.080 = 0.265
  // pVN_raw = 0.45 + 0.265 = 0.715
  // Platt risque: σ(1.7391 × logit(0.715) − 0.8108) = σ(1.7391×0.924−0.811) = σ(0.795) ≈ 0.689
  // p_market_home = (0.556+0.286)/1.080 = 0.780
  // edge = 0.689 − 0.780 = -9.1pp → modèle moins confiant que marché (no value)
  const risk2 = 55, oH2 = 1.80, oD2 = 3.50, oA2 = 4.20;
  const p2 = calibrateFootballVN(computeVNProbFromRiskAndOdds(risk2, oH2, oD2, oA2), 'risque');
  const pM2 = marketVNProb('home', oH2, oD2, oA2);
  const edge2 = Math.round((p2 - pM2!) * 1000) / 10;
  assert(edge2 < 0, `edge cas 2 attendu <0 (modèle prudent), got ${edge2}`);
});

test('SQL migration odds_history présent et idempotent', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'download', 'create_odds_history.sql'),
    'utf-8',
  );
  assert(sql.includes('CREATE TABLE IF NOT EXISTS odds_history'), 'CREATE TABLE IF NOT EXISTS manquant');
  assert(sql.includes('CREATE INDEX IF NOT EXISTS'), 'CREATE INDEX IF NOT EXISTS manquant');
  assert(sql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS manquante');
});

test('SQL migration Task 47 (colonnes VN) présent', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'download', 'task47_add_vn_columns.sql'),
    'utf-8',
  );
  assert(sql.includes('ALTER TABLE predictions'), 'ALTER TABLE manquant');
  assert(sql.includes('vn_odds'), 'vn_odds manquant');
  assert(sql.includes('vn_prob_calibrated'), 'vn_prob_calibrated manquant');
  assert(sql.includes('vn_edge'), 'vn_edge manquant');
  assert(sql.includes('vn_tier'), 'vn_tier manquant');
  assert(sql.includes('IF NOT EXISTS'), 'idempotence IF NOT EXISTS manquante');
});

test('calibration JSON consommé par runtime existe', () => {
  const json = fs.readFileSync(
    path.join(__dirname, '..', 'download', 'calibration_football.json'),
    'utf-8',
  );
  const obj = JSON.parse(json);
  assert(obj.calibration && obj.calibration.all && obj.calibration.risque && obj.calibration.fiable, 'coeffs manquants');
  assert(typeof obj.calibration.risque.a === 'number', 'coeff a non nombre');
  assert(typeof obj.brier_avant === 'number' && typeof obj.brier_apres === 'number', 'brier manquant');
  assert(obj.brier_apres < obj.brier_avant, `calibration devrait réduire Brier: avant=${obj.brier_avant} après=${obj.brier_apres}`);
});

testAsync('dailyPredictionService interface DailyPrediction inclut champs VN', async () => {
  // Lecture statique du fichier interface
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'lib', 'dailyPredictionService.ts'),
    'utf-8',
  );
  assert(src.includes('vnOdds?: number | null'), 'vnOdds manquant dans interface');
  assert(src.includes('vnProbCalibrated?: number | null'), 'vnProbCalibrated manquant');
  assert(src.includes('vnEdge?: number | null'), 'vnEdge manquant');
  assert(src.includes('vnTier?:'), 'vnTier manquant');
  assert(src.includes('calibrateFootballVN'), 'calibrateFootballVN non importé');
  assert(src.includes('doubleChanceOddsFromOdds'), 'doubleChanceOddsFromOdds non importé');
  assert(src.includes('marketVNProb'), 'marketVNProb non importé');
});

testAsync('history route expose les champs VN', async () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'app', 'api', 'history', 'route.ts'),
    'utf-8',
  );
  assert(src.includes('vnOdds'), 'vnOdds manquant dans history route');
  assert(src.includes('vnProbCalibrated'), 'vnProbCalibrated manquant');
  assert(src.includes('vnEdge'), 'vnEdge manquant');
  assert(src.includes('vnTier'), 'vnTier manquant');
});

testAsync('cron route propage VN champs à addPredictions', async () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'app', 'api', 'cron', 'route.ts'),
    'utf-8',
  );
  assert(src.includes("p.vnOdds ?? null"), 'vnOdds propagation manquante');
  assert(src.includes("p.vnProbCalibrated ?? null"), 'vnProbCalibrated propagation manquante');
  assert(src.includes("p.vnEdge ?? null"), 'vnEdge propagation manquante');
  assert(src.includes("p.vnTier ?? null"), 'vnTier propagation manquante');
});

testAsync('db-supabase: DbPrediction interface inclut VN champs + mapping', async () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'lib', 'db-supabase.ts'),
    'utf-8',
  );
  assert(src.includes('vn_odds?: number | null'), 'vn_odds interface manquante');
  assert(src.includes('vn_prob_calibrated?: number | null'), 'vn_prob_calibrated interface manquante');
  assert(src.includes('vn_edge?: number | null'), 'vn_edge interface manquante');
  assert(src.includes("vn_tier?: 'fiable' | 'modere' | 'risque' | 'avoid' | null"), 'vn_tier interface manquante');
  // Mapping addPredictions
  assert(src.includes('vn_odds: p.vn_odds ?? null'), 'mapping vn_odds manquant');
  assert(src.includes('vn_prob_calibrated: p.vn_prob_calibrated ?? null'), 'mapping vn_prob_calibrated manquant');
});

// ─── Résumé ──────────────────────────────────────────────────────────

async function main() {
  for (const t of results) {
    console.log(`  ${t.passed ? '✅' : '❌'} ${t.name}${t.details ? ` — ${t.details}` : ''}`);
  }
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`\n${passed}/${total} tests passés`);
  if (passed !== total) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
