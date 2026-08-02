-- ============================================
-- MIGRATION: Phase 4 — Calibration & Market Alignment
-- Pipeline: XGBoost → Isotonic/Platt → CLV Alignment → Brier Score
-- ============================================

-- ============================================
-- TABLE: prediction_outcomes
-- Stores prediction vs actual outcomes for live Brier score computation
-- ============================================
CREATE TABLE IF NOT EXISTS prediction_outcomes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id VARCHAR(255) NOT NULL,
    sport VARCHAR(50),
    predicted_prob FLOAT NOT NULL,           -- Raw model probability (0-1)
    calibrated_prob FLOAT,                   -- After isotonic/Platt calibration (0-1)
    actual_outcome SMALLINT NOT NULL,        -- 1 = correct, 0 = incorrect
    confidence VARCHAR(20),                   -- very_high, high, medium, low
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexing for fast queries
    CONSTRAINT valid_outcome CHECK (actual_outcome IN (0, 1))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_sport ON prediction_outcomes(sport);
CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_recorded ON prediction_outcomes(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_match ON prediction_outcomes(match_id);

-- ============================================
-- TABLE: odds_history (if not exists)
-- Already defined in oddsTrackingService.ts but ensure it's in the schema
-- ============================================
CREATE TABLE IF NOT EXISTS odds_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id TEXT NOT NULL,
    sport TEXT,
    home_team TEXT,
    away_team TEXT,
    odds_home NUMERIC(5,2),
    odds_draw NUMERIC(5,2),
    odds_away NUMERIC(5,2),
    snapshot_source TEXT DEFAULT 'espn',
    recorded_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_odds_history_match ON odds_history(match_id);
CREATE INDEX IF NOT EXISTS idx_odds_history_recorded ON odds_history(recorded_at DESC);

-- ============================================
-- GRANT PERMISSIONS (for anonymous/service role)
-- ============================================
ALTER TABLE prediction_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage prediction_outcomes"
    ON prediction_outcomes
    FOR ALL
    TO SERVICE_ROLE
    USING (true);

CREATE POLICY "Anon can read prediction_outcomes"
    ON prediction_outcomes
    FOR SELECT
    TO ANON
    USING (true);
