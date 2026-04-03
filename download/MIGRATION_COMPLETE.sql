-- =============================================================================
-- MIGRATION COMPLÈTE - Recréer les tables comme dans l'ANCIENNE base
-- Exécuter ce script dans la NOUVELLE base Supabase
-- =============================================================================

-- Supprimer les tables existantes
DROP TABLE IF EXISTS ml_patterns CASCADE;

-- =============================================================================
-- CRÉER ml_patterns AVEC LA STRUCTURE DE L'ANCIENNE BASE
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

CREATE INDEX idx_ml_patterns_sport ON ml_patterns(sport);
CREATE INDEX idx_ml_patterns_type ON ml_patterns(pattern_type);
CREATE INDEX idx_ml_patterns_success ON ml_patterns(success_rate);

-- Activer RLS
ALTER TABLE ml_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON ml_patterns FOR SELECT USING (true);
CREATE POLICY "Allow service role all" ON ml_patterns FOR ALL
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

SELECT '✅ ml_patterns créée avec ' || COUNT(*) || ' patterns' as status FROM ml_patterns;
SELECT id, sport, pattern_type, success_rate, sample_size FROM ml_patterns ORDER BY success_rate DESC;

-- =============================================================================
-- NOTE: Les tables de matches (football, basketball, nhl, mlb) doivent être
-- importées via CSV car le SQL est trop volumineux pour l'éditeur.
-- Voir les fichiers CSV dans /home/z/my-project/download/migration-csv/
-- =============================================================================
