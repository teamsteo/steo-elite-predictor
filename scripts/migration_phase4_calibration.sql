-- ============================================
-- MIGRATION: Phase 4 — Calibration & Market Alignment
-- Pipeline: XGBoost → Isotonic/Platt → CLV Alignment → Brier Score
-- ============================================

-- ============================================
-- TABLE: prediction_outcomes
-- Stores prediction vs actual outcomes for live Brier score computation
-- ============================================
CREATE TABLE IF NOT EXISTS prediction_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id VARCHAR(255) NOT NULL,
    sport VARCHAR(50),
    predicted_prob FLOAT NOT NULL,           -- Raw model probability (0-1)
    calibrated_prob FLOAT,                   -- After isotonic/Platt calibration (0-1)
    actual_outcome SMALLINT NOT NULL,        -- 1 = correct, 0 = incorrect
    confidence VARCHAR(20),                   -- very_high, high, medium, low
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_outcome CHECK (actual_outcome IN (0, 1)),
    CONSTRAINT valid_predicted CHECK (predicted_prob >= 0 AND predicted_prob <= 1),
    CONSTRAINT valid_calibrated CHECK (calibrated_prob IS NULL OR (calibrated_prob >= 0 AND calibrated_prob <= 1))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_sport ON prediction_outcomes(sport);
CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_recorded ON prediction_outcomes(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_match ON prediction_outcomes(match_id);

-- V-MED-6 FIX: Partial unique index to prevent duplicate outcomes per match
CREATE UNIQUE INDEX IF NOT EXISTS idx_prediction_outcomes_match_unique
    ON prediction_outcomes(match_id, sport)
    WHERE actual_outcome IS NOT NULL;

-- ============================================
-- TABLE: odds_history
-- ============================================
CREATE TABLE IF NOT EXISTS odds_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX IF NOT EXISTS idx_odds_history_sport ON odds_history(sport);

-- ============================================
-- ROW LEVEL SECURITY — prediction_outcomes
-- V-CRIT-4 + V-HIGH-2 FIX: Strict RLS policies
-- ============================================
ALTER TABLE prediction_outcomes ENABLE ROW LEVEL SECURITY;

-- Service role: full access (backend writes calibration data)
DO $$ BEGIN
    CREATE POLICY "Service role full access prediction_outcomes"
        ON prediction_outcomes FOR ALL TO SERVICE_ROLE USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Anon: NO read access — prediction data is internal only
-- (V-HIGH-2 FIX: removed overly permissive anon SELECT policy)

-- ============================================
-- ROW LEVEL SECURITY — odds_history
-- V-CRIT-4 FIX: Enable RLS on odds_history too
-- ============================================
ALTER TABLE odds_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Service role full access odds_history"
        ON odds_history FOR ALL TO SERVICE_ROLE USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Anon: read-only for odds display on frontend
DO $$ BEGIN
    CREATE POLICY "Anon read odds_history"
        ON odds_history FOR SELECT TO ANON USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Anon: NO insert/update/delete on odds_history
