/**
 * Bayesian Dixon-Coles — Mise à jour des λ à la mi-temps
 *
 * Dixon-Coles modélise le nombre de buts via une Poisson bivariée
 * avec correction de bas scores (Low-Scoring Correction).
 *
 * Pré-match : λ_home, λ_away dérivés des attack/defense ratings.
 * À la mi-temps : on met à jour ces ratings via une moyenne bayésienne
 * entre le prior pré-match et le taux d'attaque observé (normalisé game state).
 *
 * Paramètres clés :
 *   - prior_strength = 300 min équivalentes (≈ 3.3 matchs pré-match)
 *   - halftime_strength = 45 * 0.6 = 27 min équivalentes (bruit réduit)
 *   - total = 327 min équivalentes
 *
 * Output : λ pour les 45 minutes restantes (2ème mi-temps).
 */

import { FilteredXG, GameStateBias, LambdaUpdate, PreMatchModel } from './types';
import { normalizeXGToNeutral } from './gameStateBias';

const PRIOR_STRENGTH_MIN = 300;     // minutes équivalentes pré-match
const HALFTIME_OBSERVED_WEIGHT = 0.6; // 45 min observées = 27 min équivalentes

/**
 * Met à jour les attack ratings via moyenne bayésienne pondérée.
 *
 *   updated_attack = (prior_strength * prior_attack + halftime_strength * observed_attack_normalized) / total
 *
 * observed_attack_normalized = (xG_routine_shrinked / 45min) * 90 * game_state_attack_multiplier
 */
function updateAttackRating(
  priorAttack: number,
  observedXGShrinked: number,
  observedMinutes: number,
  attackMultiplier: number,
): number {
  const observedRate = observedXGShrinked / observedMinutes; // xG/min
  const observedNormalized = normalizeXGToNeutral(observedRate * 90, attackMultiplier);

  const halftimeStrength = observedMinutes * HALFTIME_OBSERVED_WEIGHT;
  const totalStrength = PRIOR_STRENGTH_MIN + halftimeStrength;

  return (
    PRIOR_STRENGTH_MIN * priorAttack +
    halftimeStrength * observedNormalized
  ) / totalStrength;
}

/**
 * Met à jour les defense ratings (idem mais avec xG concédé par l'adversaire).
 */
function updateDefenseRating(
  priorDefense: number,
  observedXGConceded: number,
  observedMinutes: number,
  defenseMultiplier: number,
): number {
  const observedRate = observedXGConceded / observedMinutes;
  const observedNormalized = normalizeXGToNeutral(observedRate * 90, defenseMultiplier);

  const halftimeStrength = observedMinutes * HALFTIME_OBSERVED_WEIGHT;
  const totalStrength = PRIOR_STRENGTH_MIN + halftimeStrength;

  return (
    PRIOR_STRENGTH_MIN * priorDefense +
    halftimeStrength * observedNormalized
  ) / totalStrength;
}

/**
 * Calcule λ_home et λ_away pour la 2ème mi-temps (45 min restantes).
 *
 * Dans Dixon-Coles, λ_home = home_attack * away_defense * home_advantage * rho_correction
 * Pour simplifier (sans recalibrer l'avantage domicile), on calcule le ratio
 * entre les nouveaux ratings et les anciens, et on l'applique au λ pré-match.
 */
export function updateLambdas(
  preMatch: PreMatchModel,
  filteredXG: FilteredXG,
  gameState: GameStateBias,
  observedMinutes: number = 45,
  remainingMinutes: number = 45,
): LambdaUpdate {
  // Update attack ratings
  const updatedHomeAttack = updateAttackRating(
    preMatch.home_attack_rating,
    filteredXG.home.shrinked,
    observedMinutes,
    gameState.home_attack_multiplier,
  );
  const updatedAwayAttack = updateAttackRating(
    preMatch.away_attack_rating,
    filteredXG.away.shrinked,
    observedMinutes,
    gameState.away_attack_multiplier,
  );

  // Update defense ratings (xG concédé = xG produit par l'adversaire)
  const updatedHomeDefense = updateDefenseRating(
    preMatch.home_defense_rating,
    filteredXG.away.shrinked,
    observedMinutes,
    gameState.home_defense_multiplier,
  );
  const updatedAwayDefense = updateDefenseRating(
    preMatch.away_defense_rating,
    filteredXG.home.shrinked,
    observedMinutes,
    gameState.away_defense_multiplier,
  );

  // Compute ratio vs prior (cap à ±50% pour éviter dérive extrême sur 1 mi-temps)
  const homeRatio = clamp(
    (updatedHomeAttack * updatedAwayDefense) / (preMatch.home_attack_rating * preMatch.away_defense_rating),
    0.5,
    1.5,
  );
  const awayRatio = clamp(
    (updatedAwayAttack * updatedHomeDefense) / (preMatch.away_attack_rating * preMatch.home_defense_rating),
    0.5,
    1.5,
  );

  // Lambda 90 min (équivalent) = pre_match_lambda * ratio
  const lambdaHome90 = preMatch.lambda_home * homeRatio;
  const lambdaAway90 = preMatch.lambda_away * awayRatio;

  // Lambda pour la 2ème mi-temps (45 min) = lambda_90 * (45/90)
  const lambdaHomeRemaining = lambdaHome90 * (remainingMinutes / 90);
  const lambdaAwayRemaining = lambdaAway90 * (remainingMinutes / 90);

  // Observed attack rates per 90 min (normalized to neutral state)
  const observedHomeAttackRate = normalizeXGToNeutral(
    (filteredXG.home.shrinked / observedMinutes) * 90,
    gameState.home_attack_multiplier,
  );
  const observedAwayAttackRate = normalizeXGToNeutral(
    (filteredXG.away.shrinked / observedMinutes) * 90,
    gameState.away_attack_multiplier,
  );

  return {
    lambda_home_remaining: lambdaHomeRemaining,
    lambda_away_remaining: lambdaAwayRemaining,
    lambda_home_90min: lambdaHome90,
    lambda_away_90min: lambdaAway90,
    prior_weight_used: PRIOR_STRENGTH_MIN,
    observed_weight_used: observedMinutes * HALFTIME_OBSERVED_WEIGHT,
    observed_home_attack_rate: observedHomeAttackRate,
    observed_away_attack_rate: observedAwayAttackRate,
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

// ============================================
// POISSON BIVARIÉ + DIXON-COLES (LOW-SCORE CORRECTION)
// ============================================

const DC_TAU = 0.05;  // correction des scores 0-0, 1-0, 0-1, 1-1
const DC_RHO = -0.08; // anti-corrélation bas scores

/**
 * Calcule la matrice de probabilités P(home=i, away=j) pour la 2ème mi-temps.
 * Applique la correction Dixon-Coles pour les bas scores.
 */
export function poissonBivariateDC(
  lambdaHome: number,
  lambdaAway: number,
  maxGoals: number = 8,
): number[][] {
  const prob: number[][] = [];

  let total = 0;
  for (let i = 0; i <= maxGoals; i++) {
    prob[i] = [];
    for (let j = 0; j <= maxGoals; j++) {
      let p = poissonPMF(i, lambdaHome) * poissonPMF(j, lambdaAway);
      // Dixon-Coles low-score correction
      if (i === 0 && j === 0) {
        p *= 1 - lambdaHome * lambdaAway * DC_TAU;
      } else if (i === 1 && j === 0) {
        p *= 1 + lambdaAway * DC_TAU;
      } else if (i === 0 && j === 1) {
        p *= 1 + lambdaHome * DC_TAU;
      } else if (i === 1 && j === 1) {
        p *= 1 - DC_TAU;
      }
      prob[i][j] = p;
      total += p;
    }
  }

  // Normalize (correction fait que la somme peut dépasser 1 légèrement)
  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      prob[i][j] /= total;
    }
  }

  return prob;
}

function poissonPMF(k: number, lambda: number): number {
  if (k < 0 || lambda <= 0) return 0;
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
}

function factorial(k: number): number {
  let r = 1;
  for (let i = 2; i <= k; i++) r *= i;
  return r;
}

/**
 * Détermine les probabilités de résultat final du match (en tenant compte du score HT).
 *
 * final_home_goals = score_ht_home + goals_2nd_half_home
 * final_away_goals = score_ht_away + goals_2nd_half_away
 */
export function finalOutcomeProbabilities(
  scoreHtHome: number,
  scoreHtAway: number,
  lambdaHome2ndHalf: number,
  lambdaAway2ndHalf: number,
  maxGoals: number = 8,
): { home: number; draw: number; away: number } {
  const prob2ndHalf = poissonBivariateDC(lambdaHome2ndHalf, lambdaAway2ndHalf, maxGoals);

  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;

  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const finalHome = scoreHtHome + i;
      const finalAway = scoreHtAway + j;
      if (finalHome > finalAway) pHome += prob2ndHalf[i][j];
      else if (finalHome === finalAway) pDraw += prob2ndHalf[i][j];
      else pAway += prob2ndHalf[i][j];
    }
  }

  return { home: pHome, draw: pDraw, away: pAway };
}

/**
 * Probabilité Over/Under 2.5 buts (total final).
 */
export function overUnderProbabilities(
  scoreHtHome: number,
  scoreHtAway: number,
  lambdaHome2ndHalf: number,
  lambdaAway2ndHalf: number,
  line: number = 2.5,
  maxGoals: number = 8,
): { over: number; under: number } {
  const prob2ndHalf = poissonBivariateDC(lambdaHome2ndHalf, lambdaAway2ndHalf, maxGoals);

  let pOver = 0;
  let pUnder = 0;

  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const total = scoreHtHome + scoreHtAway + i + j;
      if (total > line) pOver += prob2ndHalf[i][j];
      else pUnder += prob2ndHalf[i][j];
    }
  }

  return { over: pOver, under: pUnder };
}

/**
 * Probabilité Both Teams To Score (BTTS) sur le match complet.
 */
export function bttsProbabilities(
  scoreHtHome: number,
  scoreHtAway: number,
  lambdaHome2ndHalf: number,
  lambdaAway2ndHalf: number,
  maxGoals: number = 8,
): { yes: number; no: number } {
  const prob2ndHalf = poissonBivariateDC(lambdaHome2ndHalf, lambdaAway2ndHalf, maxGoals);

  let pYes = 0;
  let pNo = 0;

  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const homeScoredOverall = scoreHtHome > 0 || i > 0;
      const awayScoredOverall = scoreHtAway > 0 || j > 0;
      if (homeScoredOverall && awayScoredOverall) pYes += prob2ndHalf[i][j];
      else pNo += prob2ndHalf[i][j];
    }
  }

  return { yes: pYes, no: pNo };
}
