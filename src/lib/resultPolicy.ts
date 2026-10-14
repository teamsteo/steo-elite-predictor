/**
 * ═══════════════════════════════════════════════════════════════════
 * POLITIQUE DE RÉSULTATS FOOTBALL — V / VN (décision utilisateur)
 * ═══════════════════════════════════════════════════════════════════
 * On propose 2 pronostics par match :
 *   • V  (risqué)  = victoire pure de l'équipe prédite (1X2)
 *   • VN (fiable)  = Victoire ou Nul — double chance (1X / X2)
 * L'objectif est d'être positif : le bilan suit le VN.
 *   → un NUL = GAGNÉ pour un pronostic home/away.
 *   → on ne perd que si l'équipe prédite S'INCLINE.
 * Un pronostic 'draw' reste gagné uniquement sur nul.
 * Les sports US (NBA/NHL/MLB) n'ont pas de nul : non concernés.
 */

export function vnResultMatch(predicted: string, actual: string): boolean {
  if (actual === predicted) return true;
  return actual === 'draw' && (predicted === 'home' || predicted === 'away');
}

// ═══════════════════════════════════════════════════════════════════════════
// COMBINÉ (coupon) — UNE SEULE option par match, avec LA COTE qui correspond
// ═══════════════════════════════════════════════════════════════════════════
// Règle bookmaker (décision utilisateur, Task 46):
//  - Hors combiné (pronostics du jour): plusieurs options affichées par match
//    (Victoire pure V + Victoire ou Nul VN) — OK, inchangé.
//  - Dans le COMBINÉ: chaque match porte UNE sélection — V ou VN — et la cote
//    affichée doit être CELLE de l'option choisie.
//  - Nos legs football combiné sont vérifiées en mode VN (nul = gagné,
//    vnResultMatch ci-dessus) → ce SONT des paris "Victoire ou Nul" (Double
//    Chance) → elles doivent être LIBELLÉES et TARIFÉES comme tels.
//    Afficher "Victoire X" @cote_1X2 puis compter le nul gagné = erreur corrigée ici.
//  - Sports US (basket/base/hockey): pas de nul → paris V purs, inchangés.

/**
 * Une leg de combiné football home/away est un pari VN (Double Chance),
 * car c'est ainsi qu'elle est vérifiée (nul = gagné).
 */
export function comboLegIsVn(sport: string, predicted: string): boolean {
  const s = (sport || '').toLowerCase();
  return s.includes('foot') && (predicted === 'home' || predicted === 'away');
}

/**
 * Cote Double Chance "Victoire ou Nul" au tarif bookmaker:
 *   O_VN = 1 / (1/O_side + 1/O_draw)
 * (c'est exactement ainsi que les bookmakers tarifent la double chance:
 *  somme des probabilités implicites, marge conservée).
 * Ex: O_side=2.30, O_draw=3.00 → 1/(0.4348+0.3333) = 1.30.
 * Retourne null si les cotes sont invalides/absentes (pas de prix inventé).
 */
export function doubleChanceOdds(
  sideOdds: number | null | undefined,
  drawOdds: number | null | undefined,
): number | null {
  if (!sideOdds || !isFinite(sideOdds) || sideOdds <= 1) return null;
  if (!drawOdds || !isFinite(drawOdds) || drawOdds <= 1) return null;
  const odds = 1 / (1 / sideOdds + 1 / drawOdds);
  if (!isFinite(odds) || odds <= 1) return null;
  return Math.round(odds * 100) / 100;
}

/**
 * Probabilité VN DÉVIGORISÉE (formule Task 44):
 *   p_VN = (1/O_side + 1/O_draw) / (1/O_home + 1/O_draw + 1/O_away)
 * Retourne null si les 3 cotes ne permettent pas le calcul.
 */
export function deviggedDoubleChanceProb(
  sideOdds: number | null | undefined,
  drawOdds: number | null | undefined,
  otherSideOdds: number | null | undefined,
): number | null {
  if (!sideOdds || !drawOdds || !otherSideOdds) return null;
  if ([sideOdds, drawOdds, otherSideOdds].some(o => !isFinite(o) || o <= 1)) return null;
  const invSide = 1 / sideOdds, invDraw = 1 / drawOdds, invOther = 1 / otherSideOdds;
  const p = (invSide + invDraw) / (invSide + invDraw + invOther);
  if (!isFinite(p) || p <= 0 || p >= 1) return null;
  return p;
}

/**
 * Probabilité du NUL dévigorisée (complément utile pour p_VN modèle
 * quand le modèle ne publie qu'une proba de côté).
 */
export function deviggedDrawProb(
  oddsHome: number | null | undefined,
  oddsDraw: number | null | undefined,
  oddsAway: number | null | undefined,
): number | null {
  if (!oddsHome || !oddsDraw || !oddsAway) return null;
  if ([oddsHome, oddsDraw, oddsAway].some(o => !isFinite(o) || o <= 1)) return null;
  const invH = 1 / oddsHome, invD = 1 / oddsDraw, invA = 1 / oddsAway;
  const p = invD / (invH + invD + invA);
  return isFinite(p) && p > 0 && p < 1 ? p : null;
}

/** Libellé bookmaker de la sélection VN: "PSG ou Nul" (1X) / "Nul ou Marseille" (X2) */
export function vnPickLabel(
  predicted: string,
  homeTeam: string,
  awayTeam: string,
): string {
  return predicted === 'home'
    ? `${homeTeam} ou Nul`
    : `Nul ou ${awayTeam}`;
}
