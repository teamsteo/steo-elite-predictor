-- ============================================
-- ACTIVATION RLS ET POLITIQUES DE SÉCURITÉ OPTIMISÉES
-- ============================================
-- Exécuter ce script dans l'éditeur SQL de Supabase
-- 
-- CORRECTIONS:
-- 1. Active RLS sur toutes les tables ML
-- 2. Utilise (SELECT auth.role()) pour optimiser les performances
-- ============================================

-- ============================================
-- 1. ACTIVER RLS SUR TOUTES LES TABLES ML
-- ============================================

ALTER TABLE ml_model ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stats_history ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. SUPPRIMER LES ANCIENNES POLITIQUES
-- ============================================

DROP POLICY IF EXISTS "ml_model_public_read" ON ml_model;
DROP POLICY IF EXISTS "ml_model_service_write" ON ml_model;
DROP POLICY IF EXISTS "ml_patterns_public_read" ON ml_patterns;
DROP POLICY IF EXISTS "ml_patterns_service_write" ON ml_patterns;
DROP POLICY IF EXISTS "ml_picks_public_read" ON ml_picks;
DROP POLICY IF EXISTS "ml_picks_service_write" ON ml_picks;
DROP POLICY IF EXISTS "predictions_public_read" ON predictions;
DROP POLICY IF EXISTS "predictions_service_write" ON predictions;
DROP POLICY IF EXISTS "stats_history_public_read" ON stats_history;
DROP POLICY IF EXISTS "stats_history_service_write" ON stats_history;
DROP POLICY IF EXISTS "Allow read access" ON predictions;
DROP POLICY IF EXISTS "Allow read access" ON ml_learning;
DROP POLICY IF EXISTS "Allow read access" ON daily_stats;
DROP POLICY IF EXISTS "Allow read access" ON ml_patterns;
DROP POLICY IF EXISTS "Allow read access" ON ml_models;
DROP POLICY IF EXISTS "Allow service role all" ON predictions;
DROP POLICY IF EXISTS "Allow service role all" ON ml_learning;
DROP POLICY IF EXISTS "Allow service role all" ON daily_stats;
DROP POLICY IF EXISTS "Allow service role all" ON ml_patterns;
DROP POLICY IF EXISTS "Allow service role all" ON ml_models;

-- ============================================
-- 3. POLITIQUES POUR ml_model
-- ============================================

-- Lecture publique
CREATE POLICY "ml_model_public_read" ON ml_model
  FOR SELECT
  USING (true);

-- Écriture service_role (optimisé avec SELECT)
CREATE POLICY "ml_model_service_write" ON ml_model
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ============================================
-- 4. POLITIQUES POUR ml_patterns
-- ============================================

CREATE POLICY "ml_patterns_public_read" ON ml_patterns
  FOR SELECT
  USING (true);

CREATE POLICY "ml_patterns_service_write" ON ml_patterns
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ============================================
-- 5. POLITIQUES POUR ml_picks
-- ============================================

CREATE POLICY "ml_picks_public_read" ON ml_picks
  FOR SELECT
  USING (true);

CREATE POLICY "ml_picks_service_write" ON ml_picks
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ============================================
-- 6. POLITIQUES POUR predictions
-- ============================================

CREATE POLICY "predictions_public_read" ON predictions
  FOR SELECT
  USING (true);

CREATE POLICY "predictions_service_write" ON predictions
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ============================================
-- 7. POLITIQUES POUR stats_history
-- ============================================

CREATE POLICY "stats_history_public_read" ON stats_history
  FOR SELECT
  USING (true);

CREATE POLICY "stats_history_service_write" ON stats_history
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ============================================
-- 8. POLITIQUES POUR AUTRES TABLES (si existantes)
-- ============================================

-- ml_learning (si existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ml_learning') THEN
    DROP POLICY IF EXISTS "Allow read access" ON ml_learning;
    DROP POLICY IF EXISTS "Allow service role all" ON ml_learning;
    
    CREATE POLICY "ml_learning_public_read" ON ml_learning
      FOR SELECT USING (true);
    
    CREATE POLICY "ml_learning_service_write" ON ml_learning
      FOR ALL
      USING ((SELECT auth.role()) = 'service_role')
      WITH CHECK ((SELECT auth.role()) = 'service_role');
  END IF;
END $$;

-- daily_stats (si existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'daily_stats') THEN
    DROP POLICY IF EXISTS "Allow read access" ON daily_stats;
    DROP POLICY IF EXISTS "Allow service role all" ON daily_stats;
    
    CREATE POLICY "daily_stats_public_read" ON daily_stats
      FOR SELECT USING (true);
    
    CREATE POLICY "daily_stats_service_write" ON daily_stats
      FOR ALL
      USING ((SELECT auth.role()) = 'service_role')
      WITH CHECK ((SELECT auth.role()) = 'service_role');
  END IF;
END $$;

-- ml_models (si existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ml_models') THEN
    DROP POLICY IF EXISTS "Allow read access" ON ml_models;
    DROP POLICY IF EXISTS "Allow service role all" ON ml_models;
    
    CREATE POLICY "ml_models_public_read" ON ml_models
      FOR SELECT USING (true);
    
    CREATE POLICY "ml_models_service_write" ON ml_models
      FOR ALL
      USING ((SELECT auth.role()) = 'service_role')
      WITH CHECK ((SELECT auth.role()) = 'service_role');
  END IF;
END $$;

-- ============================================
-- 9. VÉRIFICATION
-- ============================================

-- Vérifier que RLS est activé
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('ml_model', 'ml_patterns', 'ml_picks', 'predictions', 'stats_history')
ORDER BY tablename;

-- Vérifier les politiques
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd as operation,
  qual as using_expression,
  with_check
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
