/**
 * Confidence Index — Score de fiabilité du réajustement (0-100)
 *
 * Composite de 4 sous-scores (25 points chacun) :
 *   1. Sample Size          : nombre de tirs (>= 15 tirs = score max)
 *   2. Signal Quality       : ratio big_chance / total_xg (>= 0.6 = signal fort)
 *   3. Game State Stability : score HT vs score attendu par prior
 *   4. Pre-Model Agreement  : corrélation xG shrinked vs lambda_prior * 0.5
 *
 * Seuils d'action :
 *   < 50   → NE RIEN ÉMETTRE (mode observation)
 *   50-69  → WATCH_ONLY
 *   70-84  → LOW_STAKE
 *   85+    → HIGH_CONFIDENCE
 */

import {
  LiveCalibrationInput,
  FilteredXG,
  ConfidenceBreakdown,
  CalibrationComponents,
} from './types';
import { gameStateStability } from './gameStateBias';

export function computeConfidence(
  input: LiveCalibrationInput,
  filteredXG: FilteredXG,
): { breakdown: ConfidenceBreakdown; components: CalibrationComponents } {
  const sample_score = computeSampleSizeScore(input);
  const signal_score = computeSignalQualityScore(filteredXG);
  const game_state_score = computeGameStateStabilityScore(input);
  const agreement_score = computePreModelAgreementScore(input, filteredXG);

  const total = sample_score + signal_score + game_state_score + agreement_score;
  const level: ConfidenceBreakdown['level'] =
    total >= 85 ? 'HIGH' :
    total >= 70 ? 'MEDIUM-HIGH' :
    total >= 50 ? 'MEDIUM' :
    'LOW';

  return {
    breakdown: {
      sample_size_score: sample_score,
      signal_quality_score: signal_score,
      game_state_stability_score: game_state_score,
      pre_model_agreement_score: agreement_score,
      total,
      level,
    },
    components: {
      signal_quality_score: signal_score,
      sample_size_score: sample_score,
      game_state_stability: game_state_score,
      pre_model_agreement: agreement_score,
    },
  };
}

// ============================================
// 1. SAMPLE SIZE (25 pts)
// ============================================

function computeSampleSizeScore(input: LiveCalibrationInput): number {
  const total_shots =
    input.first_half.summary.shots_total.home +
    input.first_half.summary.shots_total.away;
  // Idéalement 15+ tirs sur une mi-temps. En-dessous de 3 → inexploitable.
  return Math.min(25, (total_shots / 15) * 25);
}

// ============================================
// 2. SIGNAL QUALITY (25 pts)
// ============================================

function computeSignalQualityScore(filteredXG: FilteredXG): number {
  // Moyenne des ratios big_chance/total des deux équipes
  const ratio = (filteredXG.home.signal_quality + filteredXG.away.signal_quality) / 2;
  // > 0.6 → signal fort (25 pts), < 0.3 → bruit dominant (5 pts max)
  if (ratio >= 0.6) return 25;
  if (ratio >= 0.3) return 10 + (ratio - 0.3) / 0.3 * 15; // 10-25
  return ratio / 0.3 * 10; // 0-10
}

// ============================================
// 3. GAME STATE STABILITY (25 pts)
// ============================================

function computeGameStateStabilityScore(input: LiveCalibrationInput): number {
  // Score attendu : round(lambda_home) - round(lambda_away)
  const expectedHomeGoals = Math.round(input.pre_match_model.lambda_home);
  const expectedAwayGoals = Math.round(input.pre_match_model.lambda_away);
  const expectedDiff = expectedHomeGoals - expectedAwayGoals;
  const actualDiff = input.score_ht.home - input.score_ht.away;

  const stability = gameStateStability(actualDiff, expectedDiff);
  return stability * 25;
}

// ============================================
// 4. PRE-MODEL AGREEMENT (25 pts)
// ============================================

function computePreModelAgreementScore(
  input: LiveCalibrationInput,
  filteredXG: FilteredXG,
): number {
  // Comparaison entre xG shrinked (observé) et prior attendu pour 45 min
  // Prior attendu : lambda * 0.5
  const expectedHome = input.pre_match_model.lambda_home * 0.5;
  const expectedAway = input.pre_match_model.lambda_away * 0.5;

  // Ratio observé / attendu (1.0 = accord parfait)
  const ratioHome = expectedHome > 0 ? filteredXG.home.shrinked / expectedHome : 1;
  const ratioAway = expectedAway > 0 ? filteredXG.away.shrinked / expectedAway : 1;

  // Accord parfait si ratio ∈ [0.7, 1.3]
  // Divergence majeure si ratio < 0.5 ou > 2.0
  const agreementHome = ratioToAgreement(ratioHome);
  const agreementAway = ratioToAgreement(ratioAway);
  return (agreementHome + agreementAway) / 2 * 25;
}

function ratioToAgreement(ratio: number): number {
  // 1.0 → 1.0, 0.7-1.3 → 1.0 (acceptable), en dehors décline
  if (ratio >= 0.7 && ratio <= 1.3) return 1.0;
  if (ratio >= 0.5 && ratio < 0.7) return 0.5 + (ratio - 0.5) / 0.2 * 0.5;
  if (ratio > 1.3 && ratio <= 2.0) return 1.0 - (ratio - 1.3) / 0.7 * 0.5;
  return 0.2; // divergence majeure
}
