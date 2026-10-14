-- ============================================
-- SCHEMA SUPABASE POUR STEO ÉLITE
-- Exécuter ce script dans l'éditeur SQL de Supabase
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
-- TABLE: predictions
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

    -- ML Features (JSON)
    features JSONB,
    model_confidence FLOAT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    checked_at TIMESTAMPTZ,
    signature VARCHAR(100)
);

-- Index pour performances
CREATE INDEX IF NOT EXISTS idx_predictions_sport_date ON predictions(sport, match_date);
CREATE INDEX IF NOT EXISTS idx_predictions_status_date ON predictions(status, match_date);
CREATE INDEX IF NOT EXISTS idx_predictions_league ON predictions(league);
CREATE INDEX IF NOT EXISTS idx_predictions_match_id ON predictions(match_id);

-- ============================================
-- TABLE: ml_learning
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
-- TABLE: daily_stats
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
-- TABLE: ml_patterns
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
-- TABLE: ml_models
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
-- FONCTIONS ET TRIGGERS
-- ============================================

-- Fonction pour mettre à jour updated_at automatiquement
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
-- RLS (Row Level Security)
-- ============================================

-- Activer RLS
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_learning ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_models ENABLE ROW LEVEL SECURITY;

-- Politique: Tout le monde peut lire
CREATE POLICY "Allow read access" ON predictions FOR SELECT USING (true);
CREATE POLICY "Allow read access" ON ml_learning FOR SELECT USING (true);
CREATE POLICY "Allow read access" ON daily_stats FOR SELECT USING (true);
CREATE POLICY "Allow read access" ON ml_patterns FOR SELECT USING (true);
CREATE POLICY "Allow read access" ON ml_models FOR SELECT USING (true);

-- Politique: Service role peut tout faire
CREATE POLICY "Allow service role all" ON predictions FOR ALL
    USING (auth.role() = 'service_role' OR auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Allow service role all" ON ml_learning FOR ALL
    USING (auth.role() = 'service_role' OR auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Allow service role all" ON daily_stats FOR ALL
    USING (auth.role() = 'service_role' OR auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Allow service role all" ON ml_patterns FOR ALL
    USING (auth.role() = 'service_role' OR auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Allow service role all" ON ml_models FOR ALL
    USING (auth.role() = 'service_role' OR auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- DONNÉES INITIALES
-- ============================================

-- Créer la première version du modèle
INSERT INTO ml_models (version, sport, accuracy, training_samples)
VALUES
    ('v1.0', 'football', 0, 0),
    ('v1.0', 'basketball', 0, 0),
    ('v1.0', 'hockey', 0, 0)
ON CONFLICT (version) DO NOTHING;

-- ============================================
-- FIN DU SCHEMA
-- ============================================
