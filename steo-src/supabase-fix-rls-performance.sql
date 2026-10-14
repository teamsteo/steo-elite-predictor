-- ============================================
-- CORRECTION PERFORMANCE RLS
-- ============================================
-- Problème: Les politiques RLS réévaluent auth.role() pour chaque ligne
-- Solution: Utiliser (SELECT auth.role()) au lieu de auth.role()
-- ============================================

-- ============================================
-- 1. SUPPRIMER LES ANCIENNES POLITIQUES
-- ============================================

DROP POLICY IF EXISTS "Allow service role all" ON predictions;
DROP POLICY IF EXISTS "Allow service role all" ON ml_learning;
DROP POLICY IF EXISTS "Allow service role all" ON daily_stats;
DROP POLICY IF EXISTS "Allow service role all" ON ml_patterns;
DROP POLICY IF EXISTS "Allow service role all" ON ml_models;
DROP POLICY IF EXISTS "Allow service role all" ON ml_model;
DROP POLICY IF EXISTS "Allow service role all" ON ml_picks;
DROP POLICY IF EXISTS "Allow service role all" ON stats_history;

-- ============================================
-- 2. CRÉER LES NOUVELLES POLITIQUES OPTIMISÉES
-- ============================================
-- Utiliser (SELECT auth.role()) au lieu de auth.role() pour éviter
-- la réévaluation pour chaque ligne

-- predictions
CREATE POLICY "Allow service role all" ON predictions
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ml_learning
CREATE POLICY "Allow service role all" ON ml_learning
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- daily_stats
CREATE POLICY "Allow service role all" ON daily_stats
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ml_patterns
CREATE POLICY "Allow service role all" ON ml_patterns
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ml_models
CREATE POLICY "Allow service role all" ON ml_models
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ml_model
CREATE POLICY "Allow service role all" ON ml_model
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ml_picks
CREATE POLICY "Allow service role all" ON ml_picks
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- stats_history
CREATE POLICY "Allow service role all" ON stats_history
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ============================================
-- 3. VÉRIFICATION
-- ============================================

SELECT 
    schemaname,
    tablename,
    policyname,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public'
  AND policyname LIKE '%service role%'
ORDER BY tablename;
