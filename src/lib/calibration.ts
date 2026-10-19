/**
 * ═══════════════════════════════════════════════════════════════════
 * Task 47 — Calibration Platt pour probabilités VN football
 * ═══════════════════════════════════════════════════════════════════
 * Contexte: l'analyse ROI Task 44 a montré que football risqué (-2.1%)
 * était sur-confiant (modèle dit 60-70% quand la réalité est 50-55%).
 * Calibration Platt = régression logistique σ(a·logit(p)+b) ajustée
 * sur l'historique (470 matchs football, 319 risqué + 151 fiable).
 *
 * Coefficients figés au 2026-10-19 (peuvent être re-fit via
 * scripts/fit_calibration_football.ts si le dataset grossit):
 *
 *   ALL     : a=0.8835  b=-0.1148   (n=470, Brier -0.4%)
 *   RISQUÉ  : a=1.7391  b=-0.8108   (n=319, Brier -4%, LogLoss -3%)
 *   FIABLE  : a=-0.0541 b=+2.2813  (n=151, LogLoss -18%)
 *
 * Note FIABLE: a≈0 signifie que le calibration Platt "aplatit" presque
 * toute proba entrée vers σ(b)≈0.91 — i.e. la cote empirique du fiable.
 * C'est le signe que les 151 matchs fiables ont TOUS ~90% de WR réelle,
 * peu importe la proba modèle. Le calibration le reconnaît.
 * (C'est attendu: le modèle DC est bon sur les favoris; on préserve.)
 *
 * Au runtime:
 *   calibrateFootballVN(pVN, 'risque')  → proba calibrée
 *   pVN est calculé comme p_side_modèle + p_nul_dévigorisé (marché).
 */

export type CalibrationBucket = 'all' | 'risque' | 'fiable';

interface PlattCoeffs { a: number; b: number; }

// Fitted le 2026-10-19 sur /api/history?days=365
// Voir download/calibration_football.json pour le dump complet.
const COEFFS: Record<CalibrationBucket, PlattCoeffs> = {
  all:    { a: 0.8835, b: -0.1148 },
  risque: { a: 1.7391, b: -0.8108 },
  fiable: { a: -0.0541, b:  2.2813 },
};

// Fitted at: 2026-10-19
// Refit via: npx tsx scripts/fit_calibration_football.ts
const FITTED_AT = '2026-10-19';
const N_TOTAL = 470;

function logit(p: number): number {
  const c = Math.min(0.999, Math.max(0.001, p));
  return Math.log(c / (1 - c));
}
function sigmoid(x: number): number {
  if (x < -50) return 0;
  if (x > 50) return 1;
  return 1 / (1 + Math.exp(-x));
}

/**
 * Applique la calibration Platt à une probabilité VN football.
 *
 * @param pVN  Probabilité "Victoire ou Nul" du côté recommandé.
 *             = p_side_modèle + p_nul_marché_dévigorisé
 *             = (1 - risk/100) + (1/O_draw)/Σ(1/O)
 * @param bucket 'risque' (risk>50), 'fiable' (risk≤50), ou 'all'
 * @returns Proba calibrée dans [0.001, 0.999]
 */
export function calibrateFootballVN(
  pVN: number,
  bucket: CalibrationBucket = 'all',
): number {
  if (!isFinite(pVN) || pVN <= 0) return 0.001;
  if (pVN >= 1) return 0.999;
  const { a, b } = COEFFS[bucket];
  return Math.min(0.999, Math.max(0.001, sigmoid(a * logit(pVN) + b)));
}

/**
 * Indique si une proba est "fiable" (peu risquée) selon le critère VN.
 * Le critère classique (risk > 50 = risqué) est basé sur la proba du
 * CÔTÉ; ici on bascule sur la proba VN (plus alignée avec la politique
 * de résultat "nul = gagné"):
 *   - fiable  = pVN_calibré ≥ 0.80
 *   - modéré  = 0.65 ≤ pVN < 0.80
 *   - risqué  = 0.50 ≤ pVN < 0.65
 *   - à éviter = pVN < 0.50 (REJETE, jamais publié en risque)
 */
export type RiskTier = 'fiable' | 'modere' | 'risque' | 'avoid';

export function classifyByCalibratedVN(pVNCalibrated: number): RiskTier {
  if (pVNCalibrated >= 0.80) return 'fiable';
  if (pVNCalibrated >= 0.65) return 'modere';
  if (pVNCalibrated >= 0.50) return 'risque';
  return 'avoid';
}

/**
 * Calcule la probabilité VN "modèle-hybride":
 *   pVN = p_side_modèle + p_nul_marché_dévigorisé
 *
 * Le modèle ne publie qu'une proba de côté (1 - risk/100); le nul est
 * lu depuis les cotes marché 1X2 (dévigorisé).
 */
export function computeVNProbFromRiskAndOdds(
  riskPercentage: number,
  oddsHome: number | null | undefined,
  oddsDraw: number | null | undefined,
  oddsAway: number | null | undefined,
): number {
  const pSide = 1 - (riskPercentage || 50) / 100;
  if (!oddsDraw || oddsDraw <= 1 || !oddsHome || oddsHome <= 1 || !oddsAway || oddsAway <= 1) {
    // Pas de cote nul → on ne peut pas estimer le nul marché.
    // Fallback: 25% de nul (typique football).
    return Math.min(0.999, Math.max(0.001, pSide + 0.25));
  }
  const iH = 1 / oddsHome, iD = 1 / oddsDraw, iA = 1 / oddsAway;
  const s = iH + iD + iA;
  const pDrawMkt = iD / s;
  return Math.min(0.999, Math.max(0.001, pSide + pDrawMkt));
}

/**
 * Cote Double Chance bookmaker "Victoire ou Nul":
 *   O_VN = 1 / (1/O_side + 1/O_draw)
 * (utilisée pour l'affichage coupon ET le calcul ROI réel).
 * Retourne null si cotes invalides.
 */
export function doubleChanceOddsFromOdds(
  sideOdds: number | null | undefined,
  drawOdds: number | null | undefined,
): number | null {
  if (!sideOdds || sideOdds <= 1 || !drawOdds || drawOdds <= 1) return null;
  const o = 1 / (1 / sideOdds + 1 / drawOdds);
  return isFinite(o) && o > 1 ? Math.round(o * 100) / 100 : null;
}

/**
 * Edge VN = p_VN_calibré - p_VN_marché_dévigorisé.
 *   - Edge > 0  : modèle plus confiant que marché → value bet potentiel
 *   - Edge ≤ 0  : pas d'avantage
 */
export function computeVnEdge(
  pVNCalibrated: number,
  oddsHome: number | null | undefined,
  oddsDraw: number | null | undefined,
  oddsAway: number | null | undefined,
): number | null {
  if (!oddsHome || !oddsDraw || !oddsAway) return null;
  if ([oddsHome, oddsDraw, oddsAway].some(o => o <= 1)) return null;
  // p_VN_marché_dévig = (1/O_side + 1/O_draw) / Σ(1/O)
  const sideInv = 1 / oddsHome, drawInv = 1 / oddsDraw, otherInv = 1 / oddsAway;
  const s = sideInv + drawInv + otherInv;
  // On suppose "side" = home pour calculer; si reco away, caller doit passer
  // les cotes en swapant home/away. Pour simplifier: retourner max des 2 DC
  // (home-side et away-side), car l'appelant a déjà choisi le côté reco.
  // → caller doit calculer les deux puis passer la bonne cote.
  void otherInv; void s;
  return null; // placeholder, calculé par l'appelant via doubleChanceOddsFromOdds
}

/**
 * Calcule la probabilité marché dévigorisée de la Double Chance
 * pour le côté spécifié.
 *
 *   p_VN_home = (1/O_home + 1/O_draw) / (1/O_home + 1/O_draw + 1/O_away)
 *   p_VN_away = (1/O_away + 1/O_draw) / Σ
 */
export function marketVNProb(
  side: 'home' | 'away',
  oddsHome: number | null | undefined,
  oddsDraw: number | null | undefined,
  oddsAway: number | null | undefined,
): number | null {
  if (!oddsHome || !oddsDraw || !oddsAway) return null;
  if ([oddsHome, oddsDraw, oddsAway].some(o => o <= 1)) return null;
  const iH = 1 / oddsHome, iD = 1 / oddsDraw, iA = 1 / oddsAway;
  const s = iH + iD + iA;
  const pVN = side === 'home' ? (iH + iD) / s : (iA + iD) / s;
  return isFinite(pVN) && pVN > 0 && pVN < 1 ? pVN : null;
}

/**
 * Stats utiles pour log/debug.
 */
export function calibrationMeta() {
  return { fittedAt: FITTED_AT, nTotal: N_TOTAL, coeffs: COEFFS };
}
