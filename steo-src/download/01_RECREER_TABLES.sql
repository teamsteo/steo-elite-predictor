-- =============================================================================
-- SCRIPT COMPLET - Recréer toutes les tables comme dans l'ANCIENNE base
-- Exécuter dans le SQL Editor de la NOUVELLE base Supabase
-- =============================================================================

-- Supprimer les tables existantes
DROP TABLE IF EXISTS ml_learning CASCADE;
DROP TABLE IF EXISTS predictions CASCADE;
DROP TABLE IF EXISTS daily_stats CASCADE;
DROP TABLE IF EXISTS ml_patterns CASCADE;
DROP TABLE IF EXISTS ml_models CASCADE;
DROP TABLE IF EXISTS football_matches CASCADE;
DROP TABLE IF EXISTS basketball_matches CASCADE;
DROP TABLE IF EXISTS nhl_matches CASCADE;
DROP TABLE IF EXISTS mlb_matches CASCADE;

-- Activer l'extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- TABLE ml_patterns (STRUCTURE DE L'ANCIENNE BASE)
-- =============================================================================

CREATE TABLE ml_patterns (
    id VARCHAR(255) PRIMARY KEY,
    sport VARCHAR(50) NOT NULL,
    pattern_type VARCHAR(100) NOT NULL,
    condition TEXT,
    outcome VARCHAR(100),
    sample_size INTEGER DEFAULT 0,
    success_rate FLOAT DEFAULT 0,
    confidence FLOAT DEFAULT 0,
    description TEXT,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TABLE football_matches (STRUCTURE DE L'ANCIENNE BASE)
-- =============================================================================

CREATE TABLE football_matches (
    id VARCHAR(255) PRIMARY KEY,
    home_team VARCHAR(255) NOT NULL,
    away_team VARCHAR(255) NOT NULL,
    league_id VARCHAR(50),
    league_name VARCHAR(255),
    season VARCHAR(20),
    match_date TIMESTAMPTZ NOT NULL,
    match_id_api VARCHAR(255),
    home_score INTEGER,
    away_score INTEGER,
    result VARCHAR(1),
    home_possession FLOAT,
    away_possession FLOAT,
    home_shots INTEGER,
    away_shots INTEGER,
    home_shots_on_target INTEGER,
    away_shots_on_target INTEGER,
    home_corners INTEGER,
    away_corners INTEGER,
    home_fouls INTEGER,
    away_fouls INTEGER,
    home_yellow_cards INTEGER,
    away_yellow_cards INTEGER,
    home_red_cards INTEGER,
    away_red_cards INTEGER,
    home_xg FLOAT,
    away_xg FLOAT,
    odds_home FLOAT,
    odds_draw FLOAT,
    odds_away FLOAT,
    data_source VARCHAR(100) DEFAULT 'api-football',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TABLE basketball_matches (STRUCTURE DE L'ANCIENNE BASE)
-- =============================================================================

CREATE TABLE basketball_matches (
    id VARCHAR(255) PRIMARY KEY,
    home_team VARCHAR(255) NOT NULL,
    away_team VARCHAR(255) NOT NULL,
    league_name VARCHAR(255),
    season VARCHAR(20),
    match_date TIMESTAMPTZ NOT NULL,
    match_id_api VARCHAR(255),
    home_score INTEGER,
    away_score INTEGER,
    result VARCHAR(1),
    home_q1 INTEGER,
    away_q1 INTEGER,
    home_q2 INTEGER,
    away_q2 INTEGER,
    home_q3 INTEGER,
    away_q3 INTEGER,
    home_q4 INTEGER,
    away_q4 INTEGER,
    home_ot INTEGER,
    away_ot INTEGER,
    home_fg_pct FLOAT,
    away_fg_pct FLOAT,
    home_3p_pct FLOAT,
    away_3p_pct FLOAT,
    home_ft_pct FLOAT,
    away_ft_pct FLOAT,
    home_rebounds INTEGER,
    away_rebounds INTEGER,
    home_assists INTEGER,
    away_assists INTEGER,
    odds_home FLOAT,
    odds_away FLOAT,
    spread FLOAT,
    data_source VARCHAR(100) DEFAULT 'api-basketball',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TABLE nhl_matches (STRUCTURE DE L'ANCIENNE BASE)
-- =============================================================================

CREATE TABLE nhl_matches (
    id VARCHAR(255) PRIMARY KEY,
    home_team VARCHAR(255) NOT NULL,
    away_team VARCHAR(255) NOT NULL,
    home_score INTEGER,
    away_score INTEGER,
    result VARCHAR(2),
    season VARCHAR(20),
    match_date TIMESTAMPTZ NOT NULL,
    league_name VARCHAR(255),
    home_shots INTEGER,
    away_shots INTEGER,
    home_sog INTEGER,
    away_sog INTEGER,
    home_ppg INTEGER,
    away_ppg INTEGER,
    home_pim INTEGER,
    away_pim INTEGER,
    odds_home FLOAT,
    odds_away FLOAT,
    total_line FLOAT,
    data_source VARCHAR(100) DEFAULT 'espn-nhl',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TABLE mlb_matches (STRUCTURE DE L'ANCIENNE BASE)
-- =============================================================================

CREATE TABLE mlb_matches (
    id VARCHAR(255) PRIMARY KEY,
    home_team VARCHAR(255) NOT NULL,
    away_team VARCHAR(255) NOT NULL,
    home_score INTEGER,
    away_score INTEGER,
    result VARCHAR(1),
    season VARCHAR(20),
    match_date TIMESTAMPTZ NOT NULL,
    league_name VARCHAR(255),
    home_hits INTEGER,
    away_hits INTEGER,
    home_errors INTEGER,
    away_errors INTEGER,
    home_homeruns INTEGER,
    away_homeruns INTEGER,
    innings INTEGER,
    odds_home FLOAT,
    odds_away FLOAT,
    total_line FLOAT,
    home_pitcher_era FLOAT,
    away_pitcher_era FLOAT,
    data_source VARCHAR(100) DEFAULT 'espn-mlb',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEX
-- =============================================================================

CREATE INDEX idx_football_date ON football_matches(match_date);
CREATE INDEX idx_football_league ON football_matches(league_name);
CREATE INDEX idx_football_teams ON football_matches(home_team, away_team);

CREATE INDEX idx_basketball_date ON basketball_matches(match_date);
CREATE INDEX idx_basketball_teams ON basketball_matches(home_team, away_team);

CREATE INDEX idx_nhl_date ON nhl_matches(match_date);
CREATE INDEX idx_nhl_teams ON nhl_matches(home_team, away_team);

CREATE INDEX idx_mlb_date ON mlb_matches(match_date);
CREATE INDEX idx_mlb_teams ON mlb_matches(home_team, away_team);

-- =============================================================================
-- RLS (Row Level Security)
-- =============================================================================

ALTER TABLE ml_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE football_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE basketball_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE nhl_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE mlb_matches ENABLE ROW LEVEL SECURITY;

-- Politiques de lecture publique
CREATE POLICY "Allow public read" ON ml_patterns FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON football_matches FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON basketball_matches FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON nhl_matches FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON mlb_matches FOR SELECT USING (true);

-- Politiques service role
CREATE POLICY "Allow service role all" ON ml_patterns FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Allow service role all" ON football_matches FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Allow service role all" ON basketball_matches FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Allow service role all" ON nhl_matches FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Allow service role all" ON mlb_matches FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- INSÉRER LES 5 PATTERNS ML
-- =============================================================================

INSERT INTO ml_patterns (id, sport, pattern_type, condition, outcome, sample_size, success_rate, confidence, description, last_updated) VALUES
('foot_under_2', 'football', 'under_xg_threshold', 'home_xg + away_xg <= 2', 'under_2.5', 151, 100, 0.65, 'xG total ≤ 2: Under 2.5 à 100%', '2026-03-27T02:36:30.603+00:00'),
('foot_home_fav_1.4', 'football', 'home_favorite', 'odds_home <= 1.4', 'home_win', 151, 85, 0.65, 'Favori domicile cote ≤ 1.4: gagne 85%', '2026-03-27T02:36:30.603+00:00'),
('basket_over_210', 'basketball', 'over_threshold', 'league_avg > 210', 'over', 408, 87, 0.75, 'NBA: Over 210 points à 87%', '2026-03-27T02:36:30.603+00:00'),
('foot_xg_diff_1', 'football', 'xg_differential', 'abs(home_xg - away_xg) >= 1.0', 'xg_favorite_wins', 715, 100, 0.95, 'xG écart ≥ 1.0: équipe favorite gagne 100%', '2026-03-27T02:36:30.603+00:00'),
('foot_over_3.5', 'football', 'over_xg_threshold', 'home_xg + away_xg >= 3.5', 'over_2.5', 827, 95, 0.95, 'xG total ≥ 3.5: Over 2.5 à 95%', '2026-03-27T02:36:30.603+00:00');

-- =============================================================================
-- VÉRIFICATION
-- =============================================================================

SELECT '✅ Tables créées avec succès!' as status;
SELECT 'ml_patterns: ' || COUNT(*) || ' patterns' as count FROM ml_patterns;
