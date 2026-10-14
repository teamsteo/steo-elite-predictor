/**
 * Game State Bias — Correction des taux d'attaque selon le score
 *
 * Une équipe qui mène 1-0 recule volontairement (defensive shell),
 * ce qui gonfle artificiellement le xG concédé sans refléter une
 * dégradation réelle de sa force. Inverse pour une équipe menée.
 *
 * Table dérivée de l'analyse StatsBomb/OptaPro sur 5 saisons de Top 5 ligues.
 */

import { GameStateBias } from './types';

const ATTACK_MULTIPLIERS: Record<number, number> = {
  '-3': 0.78,
  '-2': 0.83,
  '-1': 0.91,
  '0': 1.00,
  '1': 1.10,
  '2': 1.18,
  '3': 1.22,
};

const DEFENSE_MULTIPLIERS: Record<number, number> = {
  '-3': 1.22,
  '-2': 1.18,
  '-1': 1.09,
  '0': 1.00,
  '1': 0.92,
  '2': 0.85,
  '3': 0.80,
};

function clampState(diff: number): number {
  if (diff < -3) return -3;
  if (diff > 3) return 3;
  return diff;
}

/**
 * Calcule le game state bias à partir du score à la mi-temps.
 * Inclut l'asymétrie home/away (équipes à l'extérieur défendent plus leurs leads).
 */
export function computeGameStateBias(
  scoreHome: number,
  scoreAway: number,
  isHomeVenue: boolean = true,
): GameStateBias {
  const diffHome = clampState(scoreHome - scoreAway);
  const diffAway = -diffHome;

  let homeAttackMult = ATTACK_MULTIPLIERS[diffHome.toString()] ?? 1.0;
  let homeDefenseMult = DEFENSE_MULTIPLIERS[diffHome.toString()] ?? 1.0;
  let awayAttackMult = ATTACK_MULTIPLIERS[diffAway.toString()] ?? 1.0;
  let awayDefenseMult = DEFENSE_MULTIPLIERS[diffAway.toString()] ?? 1.0;

  // Asymétrie : équipe à l'extérieur défend plus ses leads (recule plus)
  // Home qui mène : attaque moins bien que neutre (-5%)
  // Away qui mène : recule encore plus, défense meilleure mais attaque moindre
  if (diffHome > 0 && isHomeVenue) {
    // Home mène : pression public pour continuer à attaquer
    homeAttackMult *= 1.05;
    homeDefenseMult *= 1.03; // un peu plus vulnérable
  } else if (diffAway > 0 && isHomeVenue) {
    // Away mène à domicile adverse : recule fortement
    awayAttackMult *= 0.95;
    awayDefenseMult *= 0.92; // défense renforcée
  }

  return {
    home_state: diffHome,
    away_state: diffAway,
    home_attack_multiplier: homeAttackMult,
    home_defense_multiplier: homeDefenseMult,
    away_attack_multiplier: awayAttackMult,
    away_defense_multiplier: awayDefenseMult,
    is_home_leading: diffHome > 0,
    is_away_leading: diffAway > 0,
  };
}

/**
 * Normalise un xG observé en équivalent "état neutre" pour comparaison avec prior.
 */
export function normalizeXGToNeutral(
  observedXG: number,
  attackMultiplier: number,
): number {
  return observedXG * attackMultiplier;
}

/**
 * Calcule un score de stabilité du game state (0-1).
 * Si le score HT correspond au score attendu par le prior → stable (1.0).
 * Si l'équipe favorite perd à la mi-temps → instable (proche 0).
 */
export function gameStateStability(
  diffHome: number,
  expectedDiff: number,
): number {
  const delta = Math.abs(diffHome - expectedDiff);
  // 0 diff → 1.0, 1 diff → 0.7, 2 diff → 0.4, 3+ diff → 0.1
  if (delta === 0) return 1.0;
  if (delta === 1) return 0.7;
  if (delta === 2) return 0.4;
  return 0.1;
}
