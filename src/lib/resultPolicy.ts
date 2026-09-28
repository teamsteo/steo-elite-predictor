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
