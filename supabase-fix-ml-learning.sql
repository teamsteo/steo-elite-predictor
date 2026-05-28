-- ============================================
-- CORRECTION RLS POUR ml_learning
-- ============================================

-- Supprimer l'ancienne politique
DROP POLICY IF EXISTS "Allow service role all" ON ml_learning;
DROP POLICY IF EXISTS "Allow read access" ON ml_learning;
DROP POLICY IF EXISTS "ml_learning_public_read" ON ml_learning;
DROP POLICY IF EXISTS "ml_learning_service_write" ON ml_learning;

-- Créer les nouvelles politiques optimisées
CREATE POLICY "ml_learning_public_read" ON ml_learning
  FOR SELECT USING (true);

CREATE POLICY "ml_learning_service_write" ON ml_learning
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- Vérifier
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies 
WHERE tablename = 'ml_learning';
