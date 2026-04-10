-- =====================================================
-- SETUP COMPLET SUPABASE - Steo Elite Predictor
-- Exécuter dans Supabase SQL Editor
-- =====================================================

-- 1. TABLE ml_picks (Tracking des pronostics ML)
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
  result VARCHAR(20) DEFAULT 'pending',
  actual_winner VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. TABLE matches (Données de matchs)
CREATE TABLE IF NOT EXISTS matches (
  id VARCHAR(255) PRIMARY KEY,
  sport VARCHAR(50) NOT NULL,
  home_team VARCHAR(255) NOT NULL,
  away_team VARCHAR(255) NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(50) DEFAULT 'scheduled',
  league VARCHAR(255),
  home_xg DECIMAL(5,2),
  away_xg DECIMAL(5,2),
  odds_home DECIMAL(10,2),
  odds_away DECIMAL(10,2),
  odds_draw DECIMAL(10,2),
  winner VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. TABLE predictions (Pronostics)
CREATE TABLE IF NOT EXISTS predictions (
  id VARCHAR(255) PRIMARY KEY,
  match_id VARCHAR(255),
  sport VARCHAR(50),
  home_team VARCHAR(255),
  away_team VARCHAR(255),
  league VARCHAR(255),
  date TIMESTAMP WITH TIME ZONE,
  predicted_result VARCHAR(50),
  predicted_goals VARCHAR(50),
  odds_home DECIMAL(10,2),
  odds_away DECIMAL(10,2),
  odds_draw DECIMAL(10,2),
  confidence VARCHAR(20),
  status VARCHAR(20) DEFAULT 'pending',
  result_match BOOLEAN,
  goals_match BOOLEAN,
  home_score INTEGER,
  away_score INTEGER,
  actual_result VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. TABLE stats_history (Historique des statistiques)
CREATE TABLE IF NOT EXISTS stats_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  total_predictions INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
  won INTEGER DEFAULT 0,
  lost INTEGER DEFAULT 0,
  win_rate DECIMAL(5,2) DEFAULT 0,
  sport VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. TABLE ml_patterns (Patterns ML appris)
CREATE TABLE IF NOT EXISTS ml_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport VARCHAR(50) NOT NULL,
  pattern_type VARCHAR(100) NOT NULL,
  condition VARCHAR(255),
  outcome VARCHAR(100),
  sample_size INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 0,
  confidence DECIMAL(5,4) DEFAULT 0,
  description TEXT,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- INDEX pour performances
CREATE INDEX IF NOT EXISTS idx_ml_picks_result ON ml_picks(result);
CREATE INDEX IF NOT EXISTS idx_ml_picks_date ON ml_picks(date);
CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(date);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_predictions_status ON predictions(status);
CREATE INDEX IF NOT EXISTS idx_predictions_date ON predictions(date);
CREATE INDEX IF NOT EXISTS idx_stats_history_date ON stats_history(date);

-- Désactiver RLS pour simplifier (à sécuriser plus tard)
ALTER TABLE ml_picks DISABLE ROW LEVEL SECURITY;
ALTER TABLE matches DISABLE ROW LEVEL SECURITY;
ALTER TABLE predictions DISABLE ROW LEVEL SECURITY;
ALTER TABLE stats_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE ml_patterns DISABLE ROW LEVEL SECURITY;

-- Confirmer la création
SELECT 'Tables créées avec succès!' as message;
