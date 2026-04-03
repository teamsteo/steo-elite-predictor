-- =============================================================================
-- 1. ACTIVER RLS (Row Level Security)
-- =============================================================================
-- Ce script active la sécurité au niveau des lignes sur toutes les tables
-- Exécuter en PREMIER dans le SQL Editor de la nouvelle base Supabase
-- =============================================================================

-- Activer RLS sur bankroll_stats et users (tables qui manquaient)
ALTER TABLE public.bankroll_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Politiques pour bankroll_stats
CREATE POLICY "Service role full access" ON public.bankroll_stats
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public read access" ON public.bankroll_stats
  FOR SELECT
  USING (true);

-- Politiques pour users
CREATE POLICY "Service role full access" ON public.users
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users read own data" ON public.users
  FOR SELECT
  USING (auth.uid() = id);

-- Vérifier que RLS est activé sur toutes les tables
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Résultat attendu: Toutes les tables doivent avoir rls_enabled = true
-- =============================================================================
