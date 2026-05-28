-- ============================================
-- ACTIVATION RLS ET POLITIQUES DE SÉCURITÉ
-- ============================================
-- Exécuter ce script dans l'éditeur SQL de Supabase
-- Résout l'alerte: "RLS n'est pas activée sur les tables publiques"
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
-- 2. POLITIQUES POUR ml_model
-- ============================================

-- Permettre la lecture publique (le modèle est public)
CREATE POLICY "ml_model_public_read" ON ml_model
  FOR SELECT
  USING (true);

-- Seul le service backend peut modifier
CREATE POLICY "ml_model_service_write" ON ml_model
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- 3. POLITIQUES POUR ml_patterns
-- ============================================

-- Permettre la lecture publique (les patterns sont publics)
CREATE POLICY "ml_patterns_public_read" ON ml_patterns
  FOR SELECT
  USING (true);

-- Seul le service backend peut modifier
CREATE POLICY "ml_patterns_service_write" ON ml_patterns
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- 4. POLITIQUES POUR ml_picks
-- ============================================

-- Permettre la lecture publique (les pronostics sont publics)
CREATE POLICY "ml_picks_public_read" ON ml_picks
  FOR SELECT
  USING (true);

-- Seul le service backend peut modifier
CREATE POLICY "ml_picks_service_write" ON ml_picks
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- 5. POLITIQUES POUR predictions
-- ============================================

-- Permettre la lecture publique (les prédictions sont publiques)
CREATE POLICY "predictions_public_read" ON predictions
  FOR SELECT
  USING (true);

-- Seul le service backend peut modifier
CREATE POLICY "predictions_service_write" ON predictions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- 6. POLITIQUES POUR stats_history
-- ============================================

-- Permettre la lecture publique (les stats sont publiques)
CREATE POLICY "stats_history_public_read" ON stats_history
  FOR SELECT
  USING (true);

-- Seul le service backend peut modifier
CREATE POLICY "stats_history_service_write" ON stats_history
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- 7. VÉRIFICATION
-- ============================================

-- Vérifier que RLS est activé sur toutes les tables
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('ml_model', 'ml_patterns', 'ml_picks', 'predictions', 'stats_history');

-- Vérifier les politiques créées
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'public'
  AND tablename IN ('ml_model', 'ml_patterns', 'ml_picks', 'predictions', 'stats_history')
ORDER BY tablename, policyname;

-- ============================================
-- NOTES IMPORTANTES
-- ============================================
-- 
-- 1. Les politiques "public_read" permettent à tous de LIRE les données
--    (les pronostics et patterns sont publics par design)
--
-- 2. Les politiques "service_write" restreignent l'ÉCRITURE au backend
--    (utilise la clé SUPABASE_SERVICE_ROLE_KEY côté serveur)
--
-- 3. L'application utilise SUPABASE_SERVICE_ROLE_KEY dans les API routes
--    pour avoir les droits d'écriture complets
--
-- 4. Les utilisateurs anonymes ne peuvent PAS écrire directement
--    - Ils doivent passer par les API routes de l'application
--    - Ce qui protège l'intégrité des données ML
-- ============================================
