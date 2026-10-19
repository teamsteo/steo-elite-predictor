/**
 * Task 47 — Calibration des probabilités modèle pour football risqué
 *
 * Étapes:
 *  1. Télécharge /api/history?days=365 (prod, Supabase)
 *  2. Filtre football + avec actualResult + avec 3 cotes 1X2
 *  3. Calcule pour chaque pick:
 *       - p_side_modèle = 1 - risk/100  (proba du côté recommandé, brute modèle)
 *       - p_nul_dévig = (1/O_draw) / (1/O_h + 1/O_d + 1/O_a)  (proba nul marché)
 *       - p_VN_modèle = p_side + p_nul_dévig  (proba VN modèle-hybride)
 *       - VN outcome = (actual==predicted) OR (actual=='draw')
 *  4. Ajuste une calibration Platt (logistic):
 *       p_cal = σ(a * logit(p_VN_modèle) + b)
 *     via Newton-Raphson sur la log-vraisemblance.
 *  5. Imprime les coefficients + le Brier score avant/après + un tableau
 *     bucket-by-bucket (10 buckets) WR observé vs p_modèle vs p_calibrée.
 *  6. Émet un JSON dans download/calibration_football.json consommé par
 *     src/lib/calibration.ts au runtime.
 *
 * Run:
 *   npx tsx scripts/fit_calibration_football.ts
 */
import fs from 'node:fs';
import https from 'node:https';

const PROD = 'https://my-project-zeta-five-85.vercel.app';
const OUT_JSON = '/home/z/my-project/download/calibration_football.json';

interface PredictionRow {
  sport: string;
  predictedResult: string;
  actualResult: string;
  riskPercentage: number;
  oddsHome: number | null;
  oddsDraw: number | null;
  oddsAway: number | null;
}

async function fetchJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
      res.on('error', reject);
    });
  });
}

function logit(p: number): number {
  const clamped = Math.min(0.999, Math.max(0.001, p));
  return Math.log(clamped / (1 - clamped));
}
function sigmoid(x: number): number { return 1 / (1 + Math.exp(-x)); }

/** Newton-Raphson 2-param pour Platt scaling: p = σ(a*logit(p0)+b). */
function fitPlatt(p0: number[], y: number[]): { a: number; b: number } {
  // init: identity (a=1, b=0)
  let a = 1, b = 0;
  const n = p0.length;
  const lr = 0.5;
  for (let iter = 0; iter < 500; iter++) {
    // gradient + hessian (IRLS)
    let ga = 0, gb = 0, haa = 0, hab = 0, hbb = 0;
    for (let i = 0; i < n; i++) {
      const x = a * logit(p0[i]) + b;
      const p = sigmoid(x);
      const yi = y[i];
      const g = p - yi;             // dL/dp signe (on minimise NLL)
      const w = p * (1 - p);          // Hessien weight
      const li = logit(p0[i]);
      ga += g * li;
      gb += g;
      haa += w * li * li;
      hab += w * li;
      hbb += w;
    }
    // Newton update: θ -= H⁻¹ g
    const det = haa * hbb - hab * hab;
    if (Math.abs(det) < 1e-12) break;
    const da = (hbb * ga - hab * gb) / det;
    const db = (haa * gb - hab * ga) / det;
    a -= lr * da;
    b -= lr * db;
    if (Math.abs(da) + Math.abs(db) < 1e-9) break;
  }
  return { a, b };
}

function brier(preds: number[], ys: number[]): number {
  let s = 0;
  for (let i = 0; i < preds.length; i++) s += (preds[i] - ys[i]) ** 2;
  return s / preds.length;
}

function logloss(preds: number[], ys: number[]): number {
  let s = 0;
  for (let i = 0; i < preds.length; i++) {
    const p = Math.min(0.999999, Math.max(1e-6, preds[i]));
    s -= ys[i] * Math.log(p) + (1 - ys[i]) * Math.log(1 - p);
  }
  return s / preds.length;
}

function bucketize(probs: number[], ys: number[]): { lo: number; hi: number; n: number; wr: number; meanPred: number }[] {
  const buckets: { lo: number; hi: number; n: number; wr: number; meanPred: number }[] = [];
  for (let b = 0; b < 10; b++) {
    const lo = b * 0.1, hi = (b + 1) * 0.1;
    const idx: number[] = [];
    for (let i = 0; i < probs.length; i++) {
      if (probs[i] >= lo && (probs[i] < hi || (b === 9 && probs[i] <= hi))) idx.push(i);
    }
    if (idx.length === 0) continue;
    const wr = idx.reduce((s, i) => s + ys[i], 0) / idx.length;
    const meanPred = idx.reduce((s, i) => s + probs[i], 0) / idx.length;
    buckets.push({ lo, hi, n: idx.length, wr, meanPred });
  }
  return buckets;
}

async function main() {
  console.log('→ Fetch /api/history?days=365 ...');
  const d = await fetchJSON(`${PROD}/api/history?days=365`);
  const preds: PredictionRow[] = d.predictions || [];
  console.log(`  ${preds.length} prédictions téléchargées`);

  // Filtrer football + actualResult + 3 cotes 1X2 + reco home/away
  const foot = preds.filter(p =>
    p.sport === 'football'
    && ['home', 'away'].includes(p.predictedResult)
    && ['home', 'away', 'draw'].includes(p.actualResult)
    && p.oddsHome && p.oddsDraw && p.oddsAway
    && p.oddsHome > 1 && p.oddsDraw > 1 && p.oddsAway > 1
    && typeof p.riskPercentage === 'number'
  );
  console.log(`  ${foot.length} football rows avec 3 cotes + résultat`);

  // Séparer risque (>50) et fiable (≤50) selon la définition Task 44
  const risque = foot.filter(p => p.riskPercentage > 50);
  const fiable = foot.filter(p => p.riskPercentage <= 50);
  console.log(`  risqué: ${risque.length} | fiable: ${fiable.length}`);

  function buildDataset(rows: PredictionRow[]) {
    const p0: number[] = [];
    const y: number[] = [];
    for (const p of rows) {
      const pSide = 1 - p.riskPercentage / 100;       // modèle brute
      // Proba nul marché dévigorisée
      const iH = 1 / p.oddsHome!, iD = 1 / p.oddsDraw!, iA = 1 / p.oddsAway!;
      const s = iH + iD + iA;
      const pDrawMkt = iD / s;
      // p_VN_modèle = p_side_modèle + p_nul_marché (hybride réaliste —
      // le modèle ne publie qu'une proba de côté, on prend le nul marché)
      const pVN = Math.min(0.999, Math.max(0.001, pSide + pDrawMkt));
      const won = p.actualResult === p.predictedResult || p.actualResult === 'draw';
      p0.push(pVN);
      y.push(won ? 1 : 0);
    }
    return { p0, y };
  }

  // === Calibration RISQUÉ ===
  const dsR = buildDataset(risque);
  const { a: aR, b: bR } = fitPlatt(dsR.p0, dsR.y);
  const pCalR = dsR.p0.map(p => sigmoid(aR * logit(p) + bR));
  console.log('\n=== RISQUÉ calibration ===');
  console.log(`  n=${dsR.p0.length}  a=${aR.toFixed(4)}  b=${bR.toFixed(4)}`);
  console.log(`  Brier avant=${brier(dsR.p0, dsR.y).toFixed(4)}  après=${brier(pCalR, dsR.y).toFixed(4)}`);
  console.log(`  LogLoss avant=${logloss(dsR.p0, dsR.y).toFixed(4)}  après=${logloss(pCalR, dsR.y).toFixed(4)}`);
  console.log('  Buckets (avant → après):');
  for (const bk of bucketize(dsR.p0, dsR.y)) {
    const idx = dsR.p0.map((p, i) => (p >= bk.lo && p < bk.hi) ? i : -1).filter(i => i >= 0);
    const calMean = idx.length ? idx.reduce((s, i) => s + pCalR[i], 0) / idx.length : 0;
    console.log(`    [${(bk.lo*100).toFixed(0)}-${(bk.hi*100).toFixed(0)}%] n=${bk.n} WR=${(bk.wr*100).toFixed(1)}% pred=${(bk.meanPred*100).toFixed(1)}% cal=${(calMean*100).toFixed(1)}%`);
  }

  // === Calibration FIABLE ===
  const dsF = buildDataset(fiable);
  const { a: aF, b: bF } = fitPlatt(dsF.p0, dsF.y);
  const pCalF = dsF.p0.map(p => sigmoid(aF * logit(p) + bF));
  console.log('\n=== FIABLE calibration ===');
  console.log(`  n=${dsF.p0.length}  a=${aF.toFixed(4)}  b=${bF.toFixed(4)}`);
  console.log(`  Brier avant=${brier(dsF.p0, dsF.y).toFixed(4)}  après=${brier(pCalF, dsF.y).toFixed(4)}`);
  console.log(`  LogLoss avant=${logloss(dsF.p0, dsF.y).toFixed(4)}  après=${logloss(pCalF, dsF.y).toFixed(4)}`);
  console.log('  Buckets (avant → après):');
  for (const bk of bucketize(dsF.p0, dsF.y)) {
    const idx = dsF.p0.map((p, i) => (p >= bk.lo && p < bk.hi) ? i : -1).filter(i => i >= 0);
    const calMean = idx.length ? idx.reduce((s, i) => s + pCalF[i], 0) / idx.length : 0;
    console.log(`    [${(bk.lo*100).toFixed(0)}-${(bk.hi*100).toFixed(0)}%] n=${bk.n} WR=${(bk.wr*100).toFixed(1)}% pred=${(bk.meanPred*100).toFixed(1)}% cal=${(calMean*100).toFixed(1)}%`);
  }

  // === ALL (risque + fiable) ===
  const all = [...dsR.p0, ...dsF.p0];
  const yAll = [...dsR.y, ...dsF.y];
  const { a: aA, b: bA } = fitPlatt(all, yAll);
  const pCalA = all.map(p => sigmoid(aA * logit(p) + bA));
  console.log('\n=== ALL football ===');
  console.log(`  n=${all.length}  a=${aA.toFixed(4)}  b=${bA.toFixed(4)}`);
  console.log(`  Brier avant=${brier(all, yAll).toFixed(4)}  après=${brier(pCalA, yAll).toFixed(4)}`);
  console.log(`  LogLoss avant=${logloss(all, yAll).toFixed(4)}  après=${logloss(pCalA, yAll).toFixed(4)}`);

  // === Écriture du JSON consommé au runtime ===
  const out = {
    fitted_at: new Date().toISOString(),
    n_total: all.length,
    n_risque: dsR.p0.length,
    n_fiable: dsF.p0.length,
    brier_avant: brier(all, yAll),
    brier_apres: brier(pCalA, yAll),
    logloss_avant: logloss(all, yAll),
    logloss_apres: logloss(pCalA, yAll),
    calibration: {
      all:    { a: Number(aA.toFixed(6)), b: Number(bA.toFixed(6)) },
      risque: { a: Number(aR.toFixed(6)), b: Number(bR.toFixed(6)) },
      fiable: { a: Number(aF.toFixed(6)), b: Number(bF.toFixed(6)) },
    },
    buckets_risque_avant:  bucketize(dsR.p0, dsR.y).map(b => ({ lo: b.lo, hi: b.hi, n: b.n, wr: b.wr, mean_pred: b.meanPred })),
    buckets_risque_apres:  bucketize(pCalR, dsR.y).map(b => ({ lo: b.lo, hi: b.hi, n: b.n, wr: b.wr, mean_pred: b.meanPred })),
    buckets_fiable_avant:  bucketize(dsF.p0, dsF.y).map(b => ({ lo: b.lo, hi: b.hi, n: b.n, wr: b.wr, mean_pred: b.meanPred })),
    buckets_fiable_apres:  bucketize(pCalF, dsF.y).map(b => ({ lo: b.lo, hi: b.hi, n: b.n, wr: b.wr, mean_pred: b.meanPred })),
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
  console.log(`\n→ Écrit ${OUT_JSON}`);
}

main().catch(e => { console.error(e); process.exit(1); });
