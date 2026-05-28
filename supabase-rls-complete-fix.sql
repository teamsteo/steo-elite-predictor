-- ============================================
-- CORRECTION COMPLETE RLS - TOUT SUPPRIMER ET RECÉER
-- ============================================
-- Exécutez ce script dans Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. SUPPRIMER TOUTES LES POLITIQUES EXISTANTES
-- ============================================

-- predictions
DROP POLICY IF EXISTS "Allow read access" ON predictions;
DROP POLICY IF EXISTS "Allow service role all" ON predictions;
DROP POLICY IF EXISTS "predictions_public_read" ON predictions;
DROP POLICY IF EXISTS "predictions_service_write" ON predictions;

-- ml_model
DROP POLICY IF EXISTS "ml_model_public_read" ON ml_model;
DROP POLICY IF EXISTS "ml_model_service_write" ON ml_model;

-- ml_patterns
DROP POLICY IF EXISTS "ml_patterns_public_read" ON ml_patterns;
DROP POLICY IF EXISTS "ml_patterns_service_write" ON ml_patterns;

-- ml_picks
DROP POLICY IF EXISTS "ml_picks_public_read" ON ml_picks;
DROP POLICY IF EXISTS "ml_picks_service_write" ON ml_picks;

-- stats_history
DROP POLICY IF EXISTS "stats_history_public_read" ON stats_history;
DROP POLICY IF EXISTS "stats_history_service_write" ON stats_history;

-- ml_learning (si existe)
DROP POLICY IF EXISTS "Allow read access" ON ml_learning;
DROP POLICY IF EXISTS "Allow service role all" ON ml_learning;

-- daily_stats (si existe)
DROP POLICY IF EXISTS "Allow read access" ON daily_stats;
DROP POLICY IF EXISTS "Allow service role all" ON daily_stats;

-- ml_models (si existe)
DROP POLICY IF EXISTS "Allow read access" ON ml_models;
DROP POLICY IF EXISTS "Allow service role all" ON ml_models;

-- ============================================
-- 2. ACTIVER RLS
-- ============================================

ALTER TABLE ml_model ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stats_history ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. CRÉER LES POLITIQUES OPTIMISÉES
-- ============================================

-- predictions
CREATE POLICY "predictions_public_read" ON predictions
  FOR SELECT USING (true);

CREATE POLICY "predictions_service_write" ON predictions
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ml_model
CREATE POLICY "ml_model_public_read" ON ml_model
  FOR SELECT USING (true);

CREATE POLICY "ml_model_service_write" ON ml_model
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ml_patterns
CREATE POLICY "ml_patterns_public_read" ON ml_patterns
  FOR SELECT USING (true);

CREATE POLICY "ml_patterns_service_write" ON ml_patterns
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ml_picks
CREATE POLICY "ml_picks_public_read" ON ml_picks
  FOR SELECT USING (true);

CREATE POLICY "ml_picks_service_write" ON ml_picks
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- stats_history
CREATE POLICY "stats_history_public_read" ON stats_history
  FOR SELECT USING (true);

CREATE POLICY "stats_history_service_write" ON stats_history
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ============================================
-- 4. VÉRIFICATION
-- ============================================

SELECT 
  schemaname,
  tablename,
  policyname,
  cmd as operation
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
