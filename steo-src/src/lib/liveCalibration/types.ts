/**
 * Live Calibration Module — Types & Interfaces
 *
 * Pipeline: HT payload → noise filter → game state bias → bayesian update
 *           → fair odds → confidence index → value bet detection
 */

// ============================================
// INPUT PAYLOAD (mi-temps)
// ============================================

export interface ShotEvent {
  minute: number;
  team: 'home' | 'away';
  xg: number;
  outcome: 'goal' | 'blocked' | 'saved' | 'off_target' | 'post';
  is_big_chance?: boolean;
  is_penalty?: boolean;
  location?: 'six_yard_box' | 'penalty_area' | 'outside_box' | 'long_range';
}

export interface MomentumWindow {
  window_start: number;
  window_end: number;
  xg_home: number;
  xg_away: number;
}

export interface FirstHalfSummary {
  duration_minutes: number;
  shots: ShotEvent[];
  summary: {
    xg_total: { home: number; away: number };
    xg_big_chance: { home: number; away: number };
    xg_penalty: { home: number; away: number };
    xg_routine: { home: number; away: number };
    shots_total: { home: number; away: number };
    shots_on_target: { home: number; away: number };
    possession_pct: { home: number; away: number };
    field_tilt_pct: { home: number; away: number };
    passes_final_third: { home: number; away: number };
    pressures_high: { home: number; away: number };
    corners: { home: number; away: number };
    cards: {
      home_yellow: number; away_yellow: number;
      home_red: number; away_red: number;
    };
  };
  momentum_10min_windows: MomentumWindow[];
}

export interface PreMatchModel {
  home_attack_rating: number;
  home_defense_rating: number;
  away_attack_rating: number;
  away_defense_rating: number;
  lambda_home: number;       // espérance de buts domicile (90 min)
  lambda_away: number;
  predicted_outcome_probs: {
    home: number; draw: number; away: number;
  };
}

export interface LiveCalibrationInput {
  match_id: string;
  home_team: string;
  away_team: string;
  league: string;
  kickoff_utc: string;
  halftime_utc: string;
  score_ht: { home: number; away: number };
  first_half: FirstHalfSummary;
  pre_match_model: PreMatchModel;
  // Optional: bookmaker odds at HT for value bet detection
  bookmaker_odds_ht?: {
    home_win?: number;
    draw?: number;
    away_win?: number;
    over_2_5?: number;
    under_2_5?: number;
    btts_yes?: number;
    btts_no?: number;
  };
}

// ============================================
// INTERMEDIATE TYPES (pipeline stages)
// ============================================

export interface FilteredXG {
  home: {
    raw: number;
    shrinked: number;        // bayesian shrinkage vs prior
    big_chance: number;       // isolated big chance xG
    penalty: number;          // isolated penalty xG (removed from signal)
    routine: number;          // routine xG (post-Hampel filter)
    signal_quality: number;   // big_chance / total ratio [0-1]
  };
  away: {
    raw: number;
    shrinked: number;
    big_chance: number;
    penalty: number;
    routine: number;
    signal_quality: number;
  };
}

export interface GameStateBias {
  home_state: number;         // score diff from home perspective
  away_state: number;
  home_attack_multiplier: number;
  home_defense_multiplier: number;
  away_attack_multiplier: number;
  away_defense_multiplier: number;
  is_home_leading: boolean;
  is_away_leading: boolean;
}

export interface LambdaUpdate {
  // Updated lambda for remaining time (45 min in HT case)
  lambda_home_remaining: number;
  lambda_away_remaining: number;
  // Equivalent 90-min lambdas (for fair odds derivation)
  lambda_home_90min: number;
  lambda_away_90min: number;
  // Components for transparency
  prior_weight_used: number;
  observed_weight_used: number;
  observed_home_attack_rate: number;   // per 90 min, normalized to neutral state
  observed_away_attack_rate: number;
}

// ============================================
// OUTPUT (calibration result)
// ============================================

export interface FairOdds {
  home_win: number;
  draw: number;
  away_win: number;
  over_2_5: number;
  under_2_5: number;
  btts_yes: number;
  btts_no: number;
}

export interface ConfidenceBreakdown {
  sample_size_score: number;       // /25
  signal_quality_score: number;   // /25
  game_state_stability_score: number; // /25
  pre_model_agreement_score: number; // /25
  total: number;                  // /100
  level: 'LOW' | 'MEDIUM' | 'MEDIUM-HIGH' | 'HIGH';
}

export interface ValueBet {
  market: string;
  model_prob: number;
  implied_prob_bookmaker: number;
  fair_odds: number;
  bookmaker_odds: number;
  edge_pct: number;
  recommendation: 'WATCH_ONLY' | 'LOW_STAKE' | 'HIGH_CONFIDENCE' | 'SKIP';
  reasoning: string;
}

export interface CalibrationComponents {
  signal_quality_score: number;
  sample_size_score: number;
  game_state_stability: number;
  pre_model_agreement: number;
}

export interface LiveCalibrationOutput {
  match_id: string;
  calibration_timestamp: string;
  halftime_fair_odds: FairOdds;
  lambda_remaining: {
    lambda_home_2nd_half: number;
    lambda_away_2nd_half: number;
  };
  confidence_index: number;       // 0-100
  confidence_level: string;
  value_bets_detected: ValueBet[];
  calibration_components: CalibrationComponents;
  filtered_xg: FilteredXG;
  game_state_bias: GameStateBias;
  lambda_update: LambdaUpdate;
  // Diagnostic for backtest / UI inspection
  live_features: LiveFeatures;
}

// ============================================
// FEATURE ENGINEERING TYPES
// ============================================

export interface LiveFeatures {
  xg_diff_normalized: number;
  xg_shrinked_home: number;
  xg_shrinked_away: number;
  game_state_home: number;
  xg_goals_gap_home: number;       // xG_home - goals_home (underperformance)
  xg_goals_gap_away: number;
  field_tilt_dominance: number;    // [-1, 1]
  momentum_trend: number;          // slope of xG per 10-min window
  attack_efficiency_home: number;  // big_chance_xg / total_xg
  attack_efficiency_away: number;
  shot_volume_surplus: number;
  cards_impact_home: number;
  cards_impact_away: number;
  pre_model_residual_home: number;
  pre_model_residual_away: number;
}
