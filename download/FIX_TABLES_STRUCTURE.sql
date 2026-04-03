-- ============================================
-- CRÉER TABLES AVEC MÊME STRUCTURE QUE ANCIENNE BASE
-- ============================================

-- Supprimer les tables existantes
DROP TABLE IF EXISTS ml_patterns CASCADE;
DROP TABLE IF EXISTS football_matches CASCADE;
DROP TABLE IF EXISTS basketball_matches CASCADE;
DROP TABLE IF EXISTS nhl_matches CASCADE;
DROP TABLE IF EXISTS mlb_matches CASCADE;

-- ============================================
-- ML_PATTERNS (même structure que l'ancienne)
-- ============================================
CREATE TABLE ml_patterns (
    id TEXT PRIMARY KEY,
    sport TEXT NOT NULL,
    pattern_type TEXT NOT NULL,
    condition TEXT,
    outcome TEXT,
    sample_size INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 0,
    confidence REAL DEFAULT 0,
    description TEXT,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ml_patterns_sport ON ml_patterns(sport);
CREATE INDEX idx_ml_patterns_type ON ml_patterns(pattern_type);

-- ============================================
-- FOOTBALL_MATCHES (même structure que l'ancienne)
-- ============================================
CREATE TABLE football_matches (
    id TEXT PRIMARY KEY,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    league_name TEXT,
    season TEXT,
    match_date TIMESTAMPTZ,
    
    home_score INTEGER,
    away_score INTEGER,
    result TEXT,
    
    home_possession REAL,
    away_possession REAL,
    home_shots INTEGER,
    away_shots INTEGER,
    home_shots_on_target INTEGER,
    away_shots_on_target INTEGER,
    home_corners INTEGER,
    away_corners INTEGER,
    home_fouls INTEGER,
    away_fouls INTEGER,
    home_xg REAL,
    away_xg REAL,
    
    odds_home REAL,
    odds_draw REAL,
    odds_away REAL,
    
    data_source TEXT DEFAULT 'api-football',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_football_date ON football_matches(match_date);
CREATE INDEX idx_football_league ON football_matches(league_name);

-- ============================================
-- BASKETBALL_MATCHES (même structure que l'ancienne)
-- ============================================
CREATE TABLE basketball_matches (
    id TEXT PRIMARY KEY,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    league_name TEXT,
    season TEXT,
    match_date TIMESTAMPTZ,
    
    home_score INTEGER,
    away_score INTEGER,
    result TEXT,
    
    home_fg_pct REAL,
    away_fg_pct REAL,
    home_3p_pct REAL,
    away_3p_pct REAL,
    home_rebounds INTEGER,
    away_rebounds INTEGER,
    home_assists INTEGER,
    away_assists INTEGER,
    home_turnovers INTEGER,
    away_turnovers INTEGER,
    
    odds_home REAL,
    odds_away REAL,
    spread REAL,
    total_line REAL,
    
    data_source TEXT DEFAULT 'api-basketball',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_basketball_date ON basketball_matches(match_date);

-- ============================================
-- NHL_MATCHES (même structure que l'ancienne)
-- ============================================
CREATE TABLE nhl_matches (
    id TEXT PRIMARY KEY,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    league_name TEXT,
    season TEXT,
    match_date TIMESTAMPTZ,
    
    home_score INTEGER,
    away_score INTEGER,
    result TEXT,
    
    home_shots INTEGER,
    away_shots INTEGER,
    home_pim INTEGER,
    away_pim INTEGER,
    home_ppg INTEGER,
    away_ppg INTEGER,
    home_sog INTEGER,
    away_sog INTEGER,
    
    odds_home REAL,
    odds_away REAL,
    total_line REAL,
    
    data_source TEXT DEFAULT 'espn-nhl',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_nhl_date ON nhl_matches(match_date);

-- ============================================
-- MLB_MATCHES (même structure que l'ancienne)
-- ============================================
CREATE TABLE mlb_matches (
    id TEXT PRIMARY KEY,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    league_name TEXT,
    season TEXT,
    match_date TIMESTAMPTZ,
    
    home_score INTEGER,
    away_score INTEGER,
    result TEXT,
    
    home_hits INTEGER,
    away_hits INTEGER,
    home_errors INTEGER,
    away_errors INTEGER,
    home_homeruns INTEGER,
    away_homeruns INTEGER,
    innings INTEGER,
    
    home_pitcher_era REAL,
    away_pitcher_era REAL,
    
    odds_home REAL,
    odds_away REAL,
    total_line REAL,
    
    data_source TEXT DEFAULT 'espn-mlb',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mlb_date ON mlb_matches(match_date);

-- ============================================
-- RLS (sécurité)
-- ============================================
ALTER TABLE ml_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE football_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE basketball_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE nhl_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE mlb_matches ENABLE ROW LEVEL SECURITY;

-- Politique lecture publique
CREATE POLICY "Allow read" ON ml_patterns FOR SELECT USING (true);
CREATE POLICY "Allow read" ON football_matches FOR SELECT USING (true);
CREATE POLICY "Allow read" ON basketball_matches FOR SELECT USING (true);
CREATE POLICY "Allow read" ON nhl_matches FOR SELECT USING (true);
CREATE POLICY "Allow read" ON mlb_matches FOR SELECT USING (true);

-- Politique service role
CREATE POLICY "Allow service role" ON ml_patterns FOR ALL USING (true);
CREATE POLICY "Allow service role" ON football_matches FOR ALL USING (true);
CREATE POLICY "Allow service role" ON basketball_matches FOR ALL USING (true);
CREATE POLICY "Allow service role" ON nhl_matches FOR ALL USING (true);
CREATE POLICY "Allow service role" ON mlb_matches FOR ALL USING (true);

SELECT '✅ Tables créées avec succès!' as status;
