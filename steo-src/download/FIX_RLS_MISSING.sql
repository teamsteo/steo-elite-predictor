-- ============================================
-- ACTIVER RLS SUR LES TABLES MANQUANTES
-- ============================================

-- Activer RLS sur bankroll_stats
ALTER TABLE public.bankroll_stats ENABLE ROW LEVEL SECURITY;

-- Politique lecture publique pour bankroll_stats
CREATE POLICY "Allow read bankroll_stats" ON public.bankroll_stats
    FOR SELECT USING (true);

-- Politique service role pour bankroll_stats
CREATE POLICY "Allow service role bankroll_stats" ON public.bankroll_stats
    FOR ALL USING (true);

-- Activer RLS sur users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Politique lecture publique pour users
CREATE POLICY "Allow read users" ON public.users
    FOR SELECT USING (true);

-- Politique service role pour users
CREATE POLICY "Allow service role users" ON public.users
    FOR ALL USING (true);

SELECT '✅ RLS activé sur bankroll_stats et users!' as status;
