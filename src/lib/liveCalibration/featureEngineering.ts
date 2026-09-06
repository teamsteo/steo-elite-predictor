/**
 * Feature Engineering Live — Calcule les features à partir du payload mi-temps
 *
 * Features utilisées par le module de calibration et l'UI :
 *   - xg_diff_normalized      : domination offensive normalisée
 *   - xg_shrinked_home/away  : xG shrinké (post-Hampel + shrinkage bayésien)
 *   - game_state_home        : différence de score (perspective home)
 *   - xg_goals_gap_home/away : underperformance (xG - buts réels)
 *   - field_tilt_dominance   : pression territoriale [-1, 1]
 *   - momentum_trend         : pente du xG par fenêtre 10 min
 *   - attack_efficiency      : qualité des occasions (big_chance_xg / total_xg)
 *   - shot_volume_surplus    : différentiel volume de tirs
 *   - cards_impact           : pénalité numérique (rouge = 0.35, jaune = 0.05)
 *   - pre_model_residual     : écart entre observation et prédiction pré-match
 */

import { LiveCalibrationInput, LiveFeatures, FilteredXG } from './types';

export function computeLiveFeatures(
  input: LiveCalibrationInput,
  filteredXG: FilteredXG,
): LiveFeatures {
  const { first_half, pre_match_model, score_ht } = input;
  const sum = first_half.summary;

  // xG diff normalized (divisé par 2.5, valeur typique d'une mi-temps)
  const xgDiff = filteredXG.home.shrinked - filteredXG.away.shrinked;
  const xg_diff_normalized = xgDiff / 2.5;

  // Game state (perspective home)
  const game_state_home = score_ht.home - score_ht.away;

  // xG - Goals gap (underperformance si positif)
  const xg_goals_gap_home = filteredXG.home.raw - score_ht.home;
  const xg_goals_gap_away = filteredXG.away.raw - score_ht.away;

  // Field tilt dominance [-1, 1]
  const field_tilt_dominance = (sum.field_tilt_pct.home - 50) / 50;

  // Momentum trend : pente linéaire du xG par fenêtre 10 min
  // Valeur positive → momentum croissant, négative → décroissant
  const windows = first_half.momentum_10min_windows;
  let momentum_trend = 0;
  if (windows.length >= 2) {
    const xs = windows.map(w => (w.window_start + w.window_end) / 2);
    const ys = windows.map(w => w.xg_home - w.xg_away);
    momentum_trend = linearRegressionSlope(xs, ys);
  }

  // Attack efficiency (big_chance / total)
  const total_xg_home = filteredXG.home.raw > 0 ? filteredXG.home.raw : 1;
  const total_xg_away = filteredXG.away.raw > 0 ? filteredXG.away.raw : 1;
  const attack_efficiency_home = filteredXG.home.big_chance / total_xg_home;
  const attack_efficiency_away = filteredXG.away.big_chance / total_xg_away;

  // Shot volume surplus (différentiel normalisé par 10)
  const shot_volume_surplus = (sum.shots_total.home - sum.shots_total.away) / 10;

  // Cards impact (rouge = 0.35 buts équivalent, jaune = 0.05)
  const cards_impact_home = sum.cards.home_red * 0.35 + sum.cards.home_yellow * 0.05;
  const cards_impact_away = sum.cards.away_red * 0.35 + sum.cards.away_yellow * 0.05;

  // Pre-model residual (écart observation vs prédiction pré-match pour 45 min)
  // Prior attendu : lambda * 0.5 (45 min sur 90 min)
  const expected_xg_home_1st_half = pre_match_model.lambda_home * 0.5;
  const expected_xg_away_1st_half = pre_match_model.lambda_away * 0.5;
  const pre_model_residual_home = filteredXG.home.shrinked - expected_xg_home_1st_half;
  const pre_model_residual_away = filteredXG.away.shrinked - expected_xg_away_1st_half;

  return {
    xg_diff_normalized,
    xg_shrinked_home: filteredXG.home.shrinked,
    xg_shrinked_away: filteredXG.away.shrinked,
    game_state_home,
    xg_goals_gap_home,
    xg_goals_gap_away,
    field_tilt_dominance,
    momentum_trend,
    attack_efficiency_home,
    attack_efficiency_away,
    shot_volume_surplus,
    cards_impact_home,
    cards_impact_away,
    pre_model_residual_home,
    pre_model_residual_away,
  };
}

function linearRegressionSlope(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}
