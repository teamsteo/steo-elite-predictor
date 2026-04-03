-- ============================================
-- SCRIPT COMPLET POUR NOUVELLE BASE SUPABASE
-- Steo Élite Predictor - Sécurisé après faille
-- ============================================
-- Instructions:
-- 1. Créez un nouveau projet Supabase
-- 2. Allez dans SQL Editor
-- 3. Collez et exécutez ce script entier
-- ============================================

-- Activer l'extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE sport_type AS ENUM ('football', 'basketball', 'hockey', 'tennis', 'other');
CREATE TYPE prediction_type AS ENUM ('home', 'draw', 'away', 'over', 'under', 'btts_yes', 'btts_no', 'avoid');
CREATE TYPE confidence_level AS ENUM ('very_high', 'high', 'medium', 'low');
CREATE TYPE prediction_status AS ENUM ('pending', 'completed', 'cancelled', 'postponed');

-- ============================================
-- TABLE 1: predictions
-- ============================================

CREATE TABLE IF NOT EXISTS predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id VARCHAR(255) UNIQUE NOT NULL,
    home_team VARCHAR(255) NOT NULL,
    away_team VARCHAR(255) NOT NULL,
    league VARCHAR(255),
    sport sport_type NOT NULL DEFAULT 'football',
    match_date TIMESTAMPTZ NOT NULL,

    -- Cotes
    odds_home FLOAT,
    odds_draw FLOAT,
    odds_away FLOAT,

    -- Prédictions
    predicted_result prediction_type,
    predicted_goals VARCHAR(50),
    predicted_cards VARCHAR(50),
    confidence confidence_level DEFAULT 'medium',
    risk_percentage FLOAT DEFAULT 50,

    -- Résultats
    home_score INTEGER,
    away_score INTEGER,
    total_goals INTEGER,
    actual_result prediction_type,

    -- Validation
    status prediction_status DEFAULT 'pending',
    result_match BOOLEAN,
    goals_match BOOLEAN,
    cards_match BOOLEAN,

    -- Sources
    source VARCHAR(100),
    ml_model_version VARCHAR(50),

    -- ML Features
    features JSONB,
    model_confidence FLOAT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    checked_at TIMESTAMPTZ,
    signature VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_predictions_sport_date ON predictions(sport, match_date);
CREATE INDEX IF NOT EXISTS idx_predictions_status_date ON predictions(status, match_date);
CREATE INDEX IF NOT EXISTS idx_predictions_league ON predictions(league);
CREATE INDEX IF NOT EXISTS idx_predictions_match_id ON predictions(match_id);

-- ============================================
-- TABLE 2: ml_learning
-- ============================================

CREATE TABLE IF NOT EXISTS ml_learning (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prediction_id UUID UNIQUE REFERENCES predictions(id) ON DELETE CASCADE,

    -- Features d'entrée
    home_form FLOAT,
    away_form FLOAT,
    h2h_home_wins INTEGER,
    h2h_away_wins INTEGER,
    h2h_draws INTEGER,
    home_goals_avg FLOAT,
    away_goals_avg FLOAT,
    home_conceded_avg FLOAT,
    away_conceded_avg FLOAT,
    league_position INTEGER,
    days_since_match INTEGER,
    rest_days INTEGER,

    -- Streaks
    home_win_streak INTEGER DEFAULT 0,
    away_win_streak INTEGER DEFAULT 0,
    home_loss_streak INTEGER DEFAULT 0,
    away_loss_streak INTEGER DEFAULT 0,
    odds_implied_prob FLOAT,

    -- Prédiction du modèle
    model_prediction prediction_type,
    model_confidence FLOAT,
    model_prob_home FLOAT,
    model_prob_draw FLOAT,
    model_prob_away FLOAT,

    -- Résultat
    correct BOOLEAN,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ml_learning_correct ON ml_learning(correct);
CREATE INDEX IF NOT EXISTS idx_ml_learning_confidence ON ml_learning(model_confidence);

-- ============================================
-- TABLE 3: daily_stats
-- ============================================

CREATE TABLE IF NOT EXISTS daily_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE UNIQUE NOT NULL,

    -- Stats globales
    total_predictions INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    win_rate FLOAT DEFAULT 0,

    -- Stats par sport
    football_total INTEGER DEFAULT 0,
    football_wins INTEGER DEFAULT 0,
    football_win_rate FLOAT DEFAULT 0,

    basketball_total INTEGER DEFAULT 0,
    basketball_wins INTEGER DEFAULT 0,
    basketball_win_rate FLOAT DEFAULT 0,

    hockey_total INTEGER DEFAULT 0,
    hockey_wins INTEGER DEFAULT 0,
    hockey_win_rate FLOAT DEFAULT 0,

    -- Stats par type de pari
    resultats_total INTEGER DEFAULT 0,
    resultats_wins INTEGER DEFAULT 0,
    resultats_win_rate FLOAT DEFAULT 0,

    goals_total INTEGER DEFAULT 0,
    goals_wins INTEGER DEFAULT 0,
    goals_win_rate FLOAT DEFAULT 0,

    btts_total INTEGER DEFAULT 0,
    btts_wins INTEGER DEFAULT 0,
    btts_win_rate FLOAT DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date);

-- ============================================
-- TABLE 4: ml_patterns
-- ============================================

CREATE TABLE IF NOT EXISTS ml_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pattern_type VARCHAR(100) NOT NULL,
    sport sport_type NOT NULL,

    -- Pattern data
    pattern_key VARCHAR(255) NOT NULL,
    pattern_value TEXT,
    conditions JSONB,

    -- Stats
    occurrences INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    success_rate FLOAT DEFAULT 0,

    -- Métadonnées
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    last_success TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(pattern_type, sport, pattern_key)
);

CREATE INDEX IF NOT EXISTS idx_ml_patterns_type_sport ON ml_patterns(pattern_type, sport);
CREATE INDEX IF NOT EXISTS idx_ml_patterns_success ON ml_patterns(success_rate);

-- ============================================
-- TABLE 5: ml_models
-- ============================================

CREATE TABLE IF NOT EXISTS ml_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version VARCHAR(50) UNIQUE NOT NULL,
    sport sport_type NOT NULL,

    -- Métriques
    accuracy FLOAT DEFAULT 0,
    precision FLOAT DEFAULT 0,
    recall FLOAT DEFAULT 0,
    f1_score FLOAT DEFAULT 0,

    -- Configuration
    config JSONB,

    -- Stats
    training_samples INTEGER DEFAULT 0,
    test_samples INTEGER DEFAULT 0,

    -- Timestamps
    trained_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ml_models_sport_version ON ml_models(sport, version);

-- ============================================
-- TABLE 6: football_matches (historique)
-- ============================================

CREATE TABLE IF NOT EXISTS football_matches (
    id VARCHAR(255) PRIMARY KEY,
    home_team VARCHAR(255) NOT NULL,
    away_team VARCHAR(255) NOT NULL,
    league_name VARCHAR(255),
    season VARCHAR(20),
    match_date TIMESTAMPTZ NOT NULL,
    
    -- Scores
    home_score INTEGER,
    away_score INTEGER,
    result VARCHAR(1), -- 'H', 'D', 'A'
    
    -- Stats match
    home_possession FLOAT,
    away_possession FLOAT,
    home_shots INTEGER,
    away_shots INTEGER,
    home_shots_on_target INTEGER,
    away_shots_on_target INTEGER,
    home_corners INTEGER,
    away_corners INTEGER,
    home_xg FLOAT,
    away_xg FLOAT,
    
    -- Cotes
    odds_home FLOAT,
    odds_draw FLOAT,
    odds_away FLOAT,
    
    -- Métadonnées
    data_source VARCHAR(100) DEFAULT 'api-football',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_football_date ON football_matches(match_date);
CREATE INDEX IF NOT EXISTS idx_football_league ON football_matches(league_name);
CREATE INDEX IF NOT EXISTS idx_football_season ON football_matches(season);
CREATE INDEX IF NOT EXISTS idx_football_teams ON football_matches(home_team, away_team);

-- ============================================
-- TABLE 7: basketball_matches (historique)
-- ============================================

CREATE TABLE IF NOT EXISTS basketball_matches (
    id VARCHAR(255) PRIMARY KEY,
    home_team VARCHAR(255) NOT NULL,
    away_team VARCHAR(255) NOT NULL,
    league_name VARCHAR(255),
    season VARCHAR(20),
    match_date TIMESTAMPTZ NOT NULL,
    
    -- Scores
    home_score INTEGER,
    away_score INTEGER,
    result VARCHAR(1), -- 'H', 'A'
    
    -- Stats match
    home_fg_pct FLOAT,
    away_fg_pct FLOAT,
    home_3p_pct FLOAT,
    away_3p_pct FLOAT,
    home_rebounds INTEGER,
    away_rebounds INTEGER,
    home_assists INTEGER,
    away_assists INTEGER,
    
    -- Cotes
    odds_home FLOAT,
    odds_away FLOAT,
    spread FLOAT,
    
    -- Métadonnées
    data_source VARCHAR(100) DEFAULT 'api-basketball',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_basketball_date ON basketball_matches(match_date);
CREATE INDEX IF NOT EXISTS idx_basketball_league ON basketball_matches(league_name);
CREATE INDEX IF NOT EXISTS idx_basketball_season ON basketball_matches(season);
CREATE INDEX IF NOT EXISTS idx_basketball_teams ON basketball_matches(home_team, away_team);

-- ============================================
-- TABLE 8: nhl_matches (historique hockey)
-- ============================================

CREATE TABLE IF NOT EXISTS nhl_matches (
    id VARCHAR(255) PRIMARY KEY,
    home_team VARCHAR(255) NOT NULL,
    away_team VARCHAR(255) NOT NULL,
    league_name VARCHAR(255),
    season VARCHAR(20),
    match_date TIMESTAMPTZ NOT NULL,
    
    -- Scores
    home_score INTEGER,
    away_score INTEGER,
    result VARCHAR(2), -- 'H', 'A', 'OT'
    
    -- Stats match
    home_shots INTEGER,
    away_shots INTEGER,
    home_pim INTEGER,
    away_pim INTEGER,
    home_ppg INTEGER,
    away_ppg INTEGER,
    home_sog INTEGER,
    away_sog INTEGER,
    
    -- Cotes
    odds_home FLOAT,
    odds_away FLOAT,
    total_line FLOAT,
    
    -- Métadonnées
    data_source VARCHAR(100) DEFAULT 'espn-nhl',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nhl_date ON nhl_matches(match_date);
CREATE INDEX IF NOT EXISTS idx_nhl_season ON nhl_matches(season);
CREATE INDEX IF NOT EXISTS idx_nhl_teams ON nhl_matches(home_team, away_team);

-- ============================================
-- TABLE 9: mlb_matches (historique baseball)
-- ============================================

CREATE TABLE IF NOT EXISTS mlb_matches (
    id VARCHAR(255) PRIMARY KEY,
    home_team VARCHAR(255) NOT NULL,
    away_team VARCHAR(255) NOT NULL,
    league_name VARCHAR(255),
    season VARCHAR(20),
    match_date TIMESTAMPTZ NOT NULL,
    
    -- Scores
    home_score INTEGER,
    away_score INTEGER,
    result VARCHAR(1), -- 'H', 'A'
    
    -- Stats match
    home_hits INTEGER,
    away_hits INTEGER,
    home_errors INTEGER,
    away_errors INTEGER,
    home_homeruns INTEGER,
    away_homeruns INTEGER,
    innings INTEGER,
    
    -- Pitchers
    home_pitcher_era FLOAT,
    away_pitcher_era FLOAT,
    
    -- Cotes
    odds_home FLOAT,
    odds_away FLOAT,
    total_line FLOAT,
    
    -- Métadonnées
    data_source VARCHAR(100) DEFAULT 'espn-mlb',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mlb_date ON mlb_matches(match_date);
CREATE INDEX IF NOT EXISTS idx_mlb_season ON mlb_matches(season);
CREATE INDEX IF NOT EXISTS idx_mlb_teams ON mlb_matches(home_team, away_team);

-- ============================================
-- FONCTIONS ET TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers pour updated_at
DROP TRIGGER IF EXISTS update_ml_learning_updated_at ON ml_learning;
CREATE TRIGGER update_ml_learning_updated_at
    BEFORE UPDATE ON ml_learning
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_daily_stats_updated_at ON daily_stats;
CREATE TRIGGER update_daily_stats_updated_at
    BEFORE UPDATE ON daily_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ml_patterns_updated_at ON ml_patterns;
CREATE TRIGGER update_ml_patterns_updated_at
    BEFORE UPDATE ON ml_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS (Row Level Security) - SÉCURISÉ
-- ============================================

-- Activer RLS sur toutes les tables
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_learning ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE football_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE basketball_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE nhl_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE mlb_matches ENABLE ROW LEVEL SECURITY;

-- Politique: Lecture publique pour toutes les tables
CREATE POLICY "Allow public read" ON predictions FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON ml_learning FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON daily_stats FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON ml_patterns FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON ml_models FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON football_matches FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON basketball_matches FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON nhl_matches FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON mlb_matches FOR SELECT USING (true);

-- Politique: Service role peut tout faire (pour l'API backend)
CREATE POLICY "Allow service role all" ON predictions FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Allow service role all" ON ml_learning FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Allow service role all" ON daily_stats FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Allow service role all" ON ml_patterns FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Allow service role all" ON ml_models FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Allow service role all" ON football_matches FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Allow service role all" ON basketball_matches FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Allow service role all" ON nhl_matches FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Allow service role all" ON mlb_matches FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- DONNÉES INITIALES
-- ============================================

-- Créer les premières versions des modèles ML
INSERT INTO ml_models (version, sport, accuracy, training_samples)
VALUES
    ('v1.0', 'football', 0, 0),
    ('v1.0', 'basketball', 0, 0),
    ('v1.0', 'hockey', 0, 0),
    ('v1.0', 'other', 0, 0)
ON CONFLICT (version) DO NOTHING;

-- ============================================
-- VÉRIFICATION
-- ============================================

SELECT '✅ Base de données créée avec succès!' as status;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
