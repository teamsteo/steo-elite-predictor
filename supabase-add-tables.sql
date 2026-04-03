-- ============================================
-- SCRIPT À EXÉCUTER DANS LA BASE HISTORIQUE ML
-- Ajoute les tables nécessaires pour les opérations quotidiennes
-- ============================================

-- Activer l'extension UUID si pas déjà fait
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE: predictions (pronostics quotidiens)
-- ============================================

CREATE TABLE IF NOT EXISTS predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id VARCHAR(255) UNIQUE NOT NULL,
    home_team VARCHAR(255) NOT NULL,
    away_team VARCHAR(255) NOT NULL,
    league VARCHAR(255),
    sport VARCHAR(50) NOT NULL DEFAULT 'football',
    match_date TIMESTAMPTZ NOT NULL,
    season VARCHAR(20),

    -- Cotes
    odds_home FLOAT,
    odds_draw FLOAT,
    odds_away FLOAT,

    -- Prédictions
    predicted_result VARCHAR(20),
    predicted_goals VARCHAR(50),
    confidence VARCHAR(20) DEFAULT 'medium',
    risk_percentage FLOAT DEFAULT 50,

    -- Résultats
    home_score INTEGER,
    away_score INTEGER,
    total_goals INTEGER,
    actual_result VARCHAR(20),

    -- Validation
    status VARCHAR(20) DEFAULT 'pending',
    result_match BOOLEAN,
    goals_match BOOLEAN,

    -- Sources et ML
    source VARCHAR(100),
    ml_model_version VARCHAR(50),
    features JSONB,
    model_confidence FLOAT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    checked_at TIMESTAMPTZ
);

-- Index pour performances
CREATE INDEX IF NOT EXISTS idx_predictions_sport_date ON predictions(sport, match_date);
CREATE INDEX IF NOT EXISTS idx_predictions_status ON predictions(status);
CREATE INDEX IF NOT EXISTS idx_predictions_match_id ON predictions(match_id);

-- ============================================
-- TABLE: daily_stats (statistiques journalières)
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

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date);

-- ============================================
-- TABLE: ml_learning (apprentissage ML)
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
    model_prediction VARCHAR(20),
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
-- RLS (Row Level Security) - Politiques d'accès
-- ============================================

-- Activer RLS sur les tables
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_learning ENABLE ROW LEVEL SECURITY;

-- Politique: Lecture publique
CREATE POLICY "Allow public read" ON predictions FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON daily_stats FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON ml_learning FOR SELECT USING (true);

-- Politique: Service role peut tout faire (pour l'API)
CREATE POLICY "Allow service role all" ON predictions FOR ALL
    USING (true);
CREATE POLICY "Allow service role all" ON daily_stats FOR ALL
    USING (true);
CREATE POLICY "Allow service role all" ON ml_learning FOR ALL
    USING (true);

-- ============================================
-- FIN DU SCRIPT
-- ============================================

-- Vérification
SELECT 'Tables créées avec succès!' as status;
SELECT COUNT(*) as predictions_count FROM predictions;
