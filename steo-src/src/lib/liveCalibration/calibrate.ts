/**
 * Calibrate — Orchestrateur principal du module Live Calibration
 *
 * Pipeline complet :
 *   1. Noise filter (Hampel + shrinkage bayésien + split composantes)
 *   2. Game state bias (correction du taux d'attaque selon score)
 *   3. Bayesian Dixon-Coles update (mise à jour λ_home / λ_away)
 *   4. Poisson bivariée → fair odds (1X2, O/U 2.5, BTTS)
 *   5. Feature engineering (live features pour UI/backtest)
 *   6. Confidence index (4 composants, 0-100)
 *   7. Value bet detection (comparison vs bookmaker odds HT)
 */

import { LiveCalibrationInput, LiveCalibrationOutput, FairOdds, ValueBet } from './types';
import { filterNoise } from './noiseFilter';
import { computeGameStateBias } from './gameStateBias';
import { updateLambdas, finalOutcomeProbabilities, overUnderProbabilities, bttsProbabilities } from './bayesianDixonColes';
import { computeLiveFeatures } from './featureEngineering';
import { computeConfidence } from './confidenceIndex';

const VIG_MARGIN = 0.04; // 4% de marge bookmaker typique

export function calibrate(input: LiveCalibrationInput): LiveCalibrationOutput {
  // 1. Noise filter
  const filteredXG = filterNoise(
    input.first_half.shots,
    input.pre_match_model,
    input.first_half.duration_minutes,
  );

  // 2. Game state bias
  const gameState = computeGameStateBias(
    input.score_ht.home,
    input.score_ht.away,
    true, // home venue
  );

  // 3. Bayesian Dixon-Coles update
  // Temps restant = 90 - minutes observées (45 à la mi-temps ; s'adapte si
  // l'analyse est déclenchée à une autre minute, ex. capture manuelle à 30' ou 60')
  const remainingMinutes = Math.max(1, 90 - input.first_half.duration_minutes);
  const lambdaUpdate = updateLambdas(
    input.pre_match_model,
    filteredXG,
    gameState,
    input.first_half.duration_minutes,
    remainingMinutes,
  );

  // 4. Fair odds via Poisson bivariée + correction DC
  const fairOdds = computeFairOdds(
    input.score_ht.home,
    input.score_ht.away,
    lambdaUpdate.lambda_home_remaining,
    lambdaUpdate.lambda_away_remaining,
  );

  // 5. Live features
  const liveFeatures = computeLiveFeatures(input, filteredXG);

  // 6. Confidence index
  const { breakdown, components } = computeConfidence(input, filteredXG);

  // 7. Value bets
  const valueBets = detectValueBets(fairOdds, input.bookmaker_odds_ht, breakdown.total);

  return {
    match_id: input.match_id,
    calibration_timestamp: new Date().toISOString(),
    halftime_fair_odds: fairOdds,
    lambda_remaining: {
      lambda_home_2nd_half: lambdaUpdate.lambda_home_remaining,
      lambda_away_2nd_half: lambdaUpdate.lambda_away_remaining,
    },
    confidence_index: breakdown.total,
    confidence_level: breakdown.level,
    value_bets_detected: valueBets,
    calibration_components: components,
    filtered_xg: filteredXG,
    game_state_bias: gameState,
    lambda_update: lambdaUpdate,
    live_features: liveFeatures,
  };
}

// ============================================
// FAIR ODDS COMPUTATION
// ============================================

function computeFairOdds(
  scoreHtHome: number,
  scoreHtAway: number,
  lambdaHome2ndHalf: number,
  lambdaAway2ndHalf: number,
): FairOdds {
  const outcomes = finalOutcomeProbabilities(
    scoreHtHome, scoreHtAway,
    lambdaHome2ndHalf, lambdaAway2ndHalf,
  );

  const ou = overUnderProbabilities(
    scoreHtHome, scoreHtAway,
    lambdaHome2ndHalf, lambdaAway2ndHalf,
    2.5,
  );

  const btts = bttsProbabilities(
    scoreHtHome, scoreHtAway,
    lambdaHome2ndHalf, lambdaAway2ndHalf,
  );

  // Fair odds = 1 / proba (sans marge bookmaker)
  return {
    home_win: safeInverse(outcomes.home),
    draw: safeInverse(outcomes.draw),
    away_win: safeInverse(outcomes.away),
    over_2_5: safeInverse(ou.over),
    under_2_5: safeInverse(ou.under),
    btts_yes: safeInverse(btts.yes),
    btts_no: safeInverse(btts.no),
  };
}

function safeInverse(p: number): number {
  if (p <= 0.01) return 100; // cap à 100 pour éviter divisions par zéro
  return 1 / p;
}

// ============================================
// VALUE BET DETECTION
// ============================================

function detectValueBets(
  fairOdds: FairOdds,
  bookmakerOdds?: LiveCalibrationInput['bookmaker_odds_ht'],
  confidence: number = 0,
): ValueBet[] {
  if (!bookmakerOdds) return [];

  const bets: ValueBet[] = [];

  const markets: Array<{
    market: string;
    fair_odds: number;
    bookmaker_odds?: number;
  }> = [
    { market: 'match_winner_home', fair_odds: fairOdds.home_win, bookmaker_odds: bookmakerOdds.home_win },
    { market: 'match_winner_draw', fair_odds: fairOdds.draw, bookmaker_odds: bookmakerOdds.draw },
    { market: 'match_winner_away', fair_odds: fairOdds.away_win, bookmaker_odds: bookmakerOdds.away_win },
    { market: 'over_2_5', fair_odds: fairOdds.over_2_5, bookmaker_odds: bookmakerOdds.over_2_5 },
    { market: 'under_2_5', fair_odds: fairOdds.under_2_5, bookmaker_odds: bookmakerOdds.under_2_5 },
    { market: 'btts_yes', fair_odds: fairOdds.btts_yes, bookmaker_odds: bookmakerOdds.btts_yes },
    { market: 'btts_no', fair_odds: fairOdds.btts_no, bookmaker_odds: bookmakerOdds.btts_no },
  ];

  for (const bet of markets) {
    if (!bet.bookmaker_odds) continue;

    const model_prob = 1 / bet.fair_odds;
    const implied_prob_bookmaker = 1 / bet.bookmaker_odds;
    // Ajuste la proba bookmaker pour retirer la marge (vig-adjusted)
    const vig_adjusted_implied = implied_prob_bookmaker / (1 + VIG_MARGIN);
    const edge_pct = ((model_prob - vig_adjusted_implied) / vig_adjusted_implied) * 100;

    // Edge minimum 5% pour considérer comme value bet
    if (edge_pct < 5) continue;

    const recommendation = deriveRecommendation(confidence, edge_pct);
    if (recommendation === 'SKIP') continue;

    bets.push({
      market: bet.market,
      model_prob,
      implied_prob_bookmaker: vig_adjusted_implied,
      fair_odds: bet.fair_odds,
      bookmaker_odds: bet.bookmaker_odds,
      edge_pct,
      recommendation,
      reasoning: buildReasoning(bet.market, edge_pct, confidence),
    });
  }

  // Tri par edge décroissant
  return bets.sort((a, b) => b.edge_pct - a.edge_pct);
}

function deriveRecommendation(
  confidence: number,
  edge_pct: number,
): ValueBet['recommendation'] {
  if (confidence < 50) return 'SKIP';           // observation mode
  if (confidence < 70 && edge_pct < 10) return 'WATCH_ONLY';
  if (confidence < 70) return 'LOW_STAKE';
  if (confidence < 85 && edge_pct < 8) return 'WATCH_ONLY';
  if (confidence < 85) return 'LOW_STAKE';
  if (edge_pct < 5) return 'WATCH_ONLY';
  return 'HIGH_CONFIDENCE';
}

function buildReasoning(market: string, edge_pct: number, confidence: number): string {
  const parts: string[] = [];
  if (edge_pct >= 20) parts.push('Edge significatif');
  else if (edge_pct >= 10) parts.push('Edge modéré');
  else parts.push('Edge léger');

  if (confidence >= 85) parts.push('confiance haute');
  else if (confidence >= 70) parts.push('confiance moyenne-haute');
  else parts.push('confiance moyenne');

  // Interprétation market
  if (market.includes('home')) parts.push('modèle favorise domicile');
  else if (market.includes('away')) parts.push('modèle favorise extérieur');
  else if (market.includes('draw')) parts.push('modèle anticipe nul');
  else if (market === 'over_2_5') parts.push('anticipation de buts 2e mi-temps');
  else if (market === 'under_2_5') parts.push('anticipation match fermé');
  else if (market === 'btts_yes') parts.push('les deux équipes marquent probable');
  else if (market === 'btts_no') parts.push('au moins une équipe ne marque pas');

  return parts.join(', ');
}
