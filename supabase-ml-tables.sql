-- ============================================
-- TABLES ML UNIFIÉES POUR SUPABASE
-- ============================================
-- Exécuter ce script dans l'éditeur SQL de Supabase
-- URL: https://supabase.com/dashboard/project/YOUR_PROJECT/sql

-- ============================================
-- 1. TABLE DU MODÈLE ML (ml_model)
-- Stocke le modèle ML persistant
-- ============================================

CREATE TABLE IF NOT EXISTS ml_model (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'default_model',
  version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  edge_threshold DECIMAL(4,3) DEFAULT 0.030,
  injury_impact_factor DECIMAL(3,2) DEFAULT 1.00,
  form_weight DECIMAL(4,3) DEFAULT 0.050,
  xg_weight DECIMAL(4,3) DEFAULT 0.030,
  net_rating_weight DECIMAL(4,3) DEFAULT 0.030,
  min_data_quality INTEGER DEFAULT 50,
  confidence_weights JSONB DEFAULT '{"very_high": 0.5, "high": 0.4, "medium": 0.25, "low": 0.1}',
  samples_used INTEGER DEFAULT 0,
  accuracy INTEGER DEFAULT 0,
  last_trained TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insérer le modèle par défaut si n'existe pas
INSERT INTO ml_model (id, version, last_trained)
VALUES ('default_model', '1.0.0', NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2. TABLE DES PATTERNS ML (ml_patterns)
-- Stocke les patterns découverts par le ML
-- ============================================

CREATE TABLE IF NOT EXISTS ml_patterns (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sport VARCHAR(20) NOT NULL CHECK (sport IN ('football', 'basketball', 'hockey', 'baseball')),
  pattern_type VARCHAR(50) NOT NULL,
  condition TEXT NOT NULL,
  outcome VARCHAR(50) NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  success_rate INTEGER NOT NULL DEFAULT 0 CHECK (success_rate >= 0 AND success_rate <= 100),
  confidence DECIMAL(4,3) DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  description TEXT,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(sport, pattern_type)
);

-- Index pour performances
CREATE INDEX IF NOT EXISTS idx_ml_patterns_sport ON ml_patterns(sport);
CREATE INDEX IF NOT EXISTS idx_ml_patterns_success_rate ON ml_patterns(success_rate DESC);
CREATE INDEX IF NOT EXISTS idx_ml_patterns_type ON ml_patterns(pattern_type);

-- ============================================
-- 3. TABLE DES PRONOSTICS ML (ml_picks)
-- Stocke les pronostics générés par le ML
-- ============================================

CREATE TABLE IF NOT EXISTS ml_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id VARCHAR(255),
  sport VARCHAR(50) NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  home_team VARCHAR(255) NOT NULL,
  away_team VARCHAR(255) NOT NULL,
  bet VARCHAR(50) NOT NULL,
  bet_label VARCHAR(255),
  odds DECIMAL(10,2),
  win_probability DECIMAL(5,2),
  confidence VARCHAR(20),
  type VARCHAR(50),
  result VARCHAR(20) DEFAULT 'pending' CHECK (result IN ('pending', 'won', 'lost')),
  actual_winner VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ml_picks_result ON ml_picks(result);
CREATE INDEX IF NOT EXISTS idx_ml_picks_date ON ml_picks(date);
CREATE INDEX IF NOT EXISTS idx_ml_picks_sport ON ml_picks(sport);

-- ============================================
-- 4. TABLE DES PRÉDICTIONS (predictions)
-- Table principale pour les pronostics
-- ============================================

CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id VARCHAR(255) UNIQUE NOT NULL,
  home_team VARCHAR(255) NOT NULL,
  away_team VARCHAR(255) NOT NULL,
  league VARCHAR(100),
  sport VARCHAR(20) DEFAULT 'football',
  match_date TIMESTAMP WITH TIME ZONE,
  season VARCHAR(20),
  
  -- Cotes
  odds_home DECIMAL(10,2),
  odds_draw DECIMAL(10,2),
  odds_away DECIMAL(10,2),
  
  -- Prédiction
  predicted_result VARCHAR(20),
  predicted_goals VARCHAR(20),
  confidence VARCHAR(20),
  risk_percentage INTEGER DEFAULT 50,
  
  -- Résultat
  home_score INTEGER,
  away_score INTEGER,
  total_goals INTEGER,
  actual_result VARCHAR(20),
  
  -- Statut
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'postponed')),
  result_match BOOLEAN,
  goals_match BOOLEAN,
  
  -- Métadonnées
  source VARCHAR(50),
  ml_model_version VARCHAR(20),
  features JSONB,
  model_confidence DECIMAL(5,2),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  checked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_predictions_status ON predictions(status);
CREATE INDEX IF NOT EXISTS idx_predictions_match_date ON predictions(match_date);
CREATE INDEX IF NOT EXISTS idx_predictions_sport ON predictions(sport);
CREATE INDEX IF NOT EXISTS idx_predictions_result_match ON predictions(result_match);

-- ============================================
-- 5. TABLE D'HISTORIQUE DES STATS (stats_history)
-- Historique quotidien des performances
-- ============================================

CREATE TABLE IF NOT EXISTS stats_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE UNIQUE NOT NULL,
  
  total_predictions INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  win_rate INTEGER DEFAULT 0,
  
  football_total INTEGER DEFAULT 0,
  football_wins INTEGER DEFAULT 0,
  football_win_rate INTEGER DEFAULT 0,
  
  basketball_total INTEGER DEFAULT 0,
  basketball_wins INTEGER DEFAULT 0,
  basketball_win_rate INTEGER DEFAULT 0,
  
  hockey_total INTEGER DEFAULT 0,
  hockey_wins INTEGER DEFAULT 0,
  hockey_win_rate INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stats_history_date ON stats_history(date);

-- ============================================
-- 6. VUE DE STATISTIQUES ML
-- ============================================

CREATE OR REPLACE VIEW ml_overview AS
SELECT 
  (SELECT version FROM ml_model WHERE id = 'default_model') as model_version,
  (SELECT accuracy FROM ml_model WHERE id = 'default_model') as model_accuracy,
  (SELECT samples_used FROM ml_model WHERE id = 'default_model') as samples_used,
  (SELECT last_trained FROM ml_model WHERE id = 'default_model') as last_trained,
  (SELECT COUNT(*) FROM ml_patterns) as total_patterns,
  (SELECT COUNT(*) FROM ml_patterns WHERE sport = 'football') as football_patterns,
  (SELECT COUNT(*) FROM ml_patterns WHERE sport = 'basketball') as basketball_patterns,
  (SELECT COUNT(*) FROM ml_patterns WHERE sport = 'hockey') as hockey_patterns,
  (SELECT ROUND(AVG(success_rate)) FROM ml_patterns) as avg_success_rate,
  (SELECT COUNT(*) FROM predictions WHERE status = 'completed') as total_predictions,
  (SELECT COUNT(*) FROM predictions WHERE status = 'completed' AND result_match = true) as correct_predictions;

-- ============================================
-- 7. FONCTION POUR METTRE À JOUR LES STATS
-- ============================================

CREATE OR REPLACE FUNCTION update_daily_stats()
RETURNS void AS $$
DECLARE
  today_date DATE := CURRENT_DATE;
BEGIN
  INSERT INTO stats_history (
    date, total_predictions, completed, wins, losses, win_rate,
    football_total, football_wins, football_win_rate,
    basketball_total, basketball_wins, basketball_win_rate,
    hockey_total, hockey_wins, hockey_win_rate
  )
  SELECT 
    today_date,
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE result_match = true),
    COUNT(*) FILTER (WHERE result_match = false),
    COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE result_match = true) / NULLIF(COUNT(*) FILTER (WHERE status = 'completed'), 0)), 0),
    COUNT(*) FILTER (WHERE sport = 'football' AND status = 'completed'),
    COUNT(*) FILTER (WHERE sport = 'football' AND result_match = true),
    COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE sport = 'football' AND result_match = true) / NULLIF(COUNT(*) FILTER (WHERE sport = 'football' AND status = 'completed'), 0)), 0),
    COUNT(*) FILTER (WHERE sport = 'basketball' AND status = 'completed'),
    COUNT(*) FILTER (WHERE sport = 'basketball' AND result_match = true),
    COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE sport = 'basketball' AND result_match = true) / NULLIF(COUNT(*) FILTER (WHERE sport = 'basketball' AND status = 'completed'), 0)), 0),
    COUNT(*) FILTER (WHERE sport = 'hockey' AND status = 'completed'),
    COUNT(*) FILTER (WHERE sport = 'hockey' AND result_match = true),
    COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE sport = 'hockey' AND result_match = true) / NULLIF(COUNT(*) FILTER (WHERE sport = 'hockey' AND status = 'completed'), 0)), 0)
  FROM predictions
  WHERE DATE(match_date) = today_date
  ON CONFLICT (date) DO UPDATE SET
    total_predictions = EXCLUDED.total_predictions,
    completed = EXCLUDED.completed,
    wins = EXCLUDED.wins,
    losses = EXCLUDED.losses,
    win_rate = EXCLUDED.win_rate,
    football_total = EXCLUDED.football_total,
    football_wins = EXCLUDED.football_wins,
    football_win_rate = EXCLUDED.football_win_rate,
    basketball_total = EXCLUDED.basketball_total,
    basketball_wins = EXCLUDED.basketball_wins,
    basketball_win_rate = EXCLUDED.basketball_win_rate,
    hockey_total = EXCLUDED.hockey_total,
    hockey_wins = EXCLUDED.hockey_wins,
    hockey_win_rate = EXCLUDED.hockey_win_rate;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VÉRIFICATION
-- ============================================

-- Afficher les tables créées
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('ml_model', 'ml_patterns', 'ml_picks', 'predictions', 'stats_history');

-- Afficher le statut
SELECT * FROM ml_overview;
