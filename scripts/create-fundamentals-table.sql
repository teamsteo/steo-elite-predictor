-- Table pour les données fondamentales des équipes
CREATE TABLE IF NOT EXISTS team_fundamentals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id VARCHAR(100) UNIQUE NOT NULL,
  team_name VARCHAR(200) NOT NULL,
  sport VARCHAR(50) NOT NULL,
  league VARCHAR(100),
  
  -- Forme
  form VARCHAR(10),
  form_win_rate INTEGER DEFAULT 0,
  last5_goals_scored INTEGER DEFAULT 0,
  last5_goals_conceded INTEGER DEFAULT 0,
  
  -- Classement
  standing_position INTEGER DEFAULT 0,
  standing_points INTEGER DEFAULT 0,
  standing_played INTEGER DEFAULT 0,
  
  -- Stats
  home_win_rate INTEGER DEFAULT 0,
  away_win_rate INTEGER DEFAULT 0,
  
  -- Blessures
  injury_count INTEGER DEFAULT 0,
  injury_key_players TEXT,
  
  -- News
  recent_news TEXT,
  coach_status VARCHAR(50) DEFAULT 'stable',
  
  -- Signaux
  signals TEXT,
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_team_fundamentals_sport ON team_fundamentals(sport);
CREATE INDEX IF NOT EXISTS idx_team_fundamentals_league ON team_fundamentals(league);
CREATE INDEX IF NOT EXISTS idx_team_fundamentals_team ON team_fundamentals(team_name);

-- Activer RLS
ALTER TABLE team_fundamentals ENABLE ROW LEVEL SECURITY;

-- Politique pour lecture publique
CREATE POLICY "Public read" ON team_fundamentals FOR SELECT USING (true);

-- Politique pour service role
CREATE POLICY "Service role all" ON team_fundamentals FOR ALL USING (auth.role() = 'service_role');
