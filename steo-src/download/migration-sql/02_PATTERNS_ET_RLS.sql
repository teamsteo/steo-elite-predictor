-- =============================================================================
-- INSERTION DES PATTERNS ML - Structure corrigée
-- Exécuter dans le SQL Editor de la NOUVELLE base Supabase
-- =============================================================================

-- 1. Activer RLS sur bankroll_stats et users si les tables existent
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bankroll_stats') THEN
        ALTER TABLE public.bankroll_stats ENABLE ROW LEVEL SECURITY;
        CREATE POLICY IF NOT EXISTS "Service role full access" ON public.bankroll_stats
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
        CREATE POLICY IF NOT EXISTS "Service role full access" ON public.users
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 2. Insérer les patterns ML avec la bonne structure
-- Structure: id(UUID auto), pattern_type, sport, pattern_key, pattern_value, conditions, occurrences, success_count, success_rate
INSERT INTO ml_patterns (pattern_type, sport, pattern_key, pattern_value, occurrences, success_count, success_rate) VALUES
-- Football: Under 2.5 quand xG total <= 2 (100% succès, 151 matchs)
('under_xg_threshold', 'football', 'under_xg_2.0', 'home_xg + away_xg <= 2.0', 151, 151, 100),

-- Football: Favori domicile cote <= 1.4 (85% succès, 151 matchs)
('home_favorite', 'football', 'home_fav_1.4', 'odds_home <= 1.4', 151, 128, 85),

-- Football: xG differential >= 1.0 (100% succès, 715 matchs)
('xg_differential', 'football', 'xg_diff_1.0', 'abs(home_xg - away_xg) >= 1.0', 715, 715, 100),

-- Football: Over 3.5 quand xG total >= 3.5 (95% succès, 827 matchs)
('over_xg_threshold', 'football', 'over_xg_3.5', 'home_xg + away_xg >= 3.5', 827, 786, 95),

-- Basketball: Over 210 points (87% succès, 408 matchs)
('over_threshold', 'basketball', 'over_210', 'league_avg > 210', 408, 355, 87)
ON CONFLICT (pattern_type, sport, pattern_key) DO UPDATE SET
    occurrences = EXCLUDED.occurrences,
    success_count = EXCLUDED.success_count,
    success_rate = EXCLUDED.success_rate,
    updated_at = NOW();

-- 3. Vérifier les patterns insérés
SELECT pattern_type, sport, pattern_key, success_rate, occurrences FROM ml_patterns ORDER BY success_rate DESC;

-- ✅ Résultat attendu: 5 patterns avec taux de succès 85-100%
