-- ============================================
-- CORRECTION FONCTION UPDATE_UPDATED_AT_COLUMN
-- ============================================
-- Résout l'erreur: "Chemin de recherche de fonction mutable"
-- La fonction doit avoir un SEARCH_PATH sécurisé
-- ============================================

-- Supprimer l'ancienne fonction si elle existe
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Recréer la fonction avec SEARCH_PATH sécurisé
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ============================================
-- RECÉER LES TRIGGERS
-- ============================================

-- Trigger pour ml_learning
DROP TRIGGER IF EXISTS update_ml_learning_updated_at ON ml_learning;
CREATE TRIGGER update_ml_learning_updated_at
    BEFORE UPDATE ON ml_learning
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger pour daily_stats
DROP TRIGGER IF EXISTS update_daily_stats_updated_at ON daily_stats;
CREATE TRIGGER update_daily_stats_updated_at
    BEFORE UPDATE ON daily_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger pour ml_patterns
DROP TRIGGER IF EXISTS update_ml_patterns_updated_at ON ml_patterns;
CREATE TRIGGER update_ml_patterns_updated_at
    BEFORE UPDATE ON ml_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger pour ml_picks (si la table existe)
DROP TRIGGER IF EXISTS update_ml_picks_updated_at ON ml_picks;
CREATE TRIGGER update_ml_picks_updated_at
    BEFORE UPDATE ON ml_picks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VÉRIFICATION
-- ============================================

-- Vérifier que la fonction est créée correctement
SELECT 
    p.proname as function_name,
    pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'update_updated_at_column';

-- Vérifier les triggers
SELECT 
    trigger_name,
    event_object_table as table_name,
    action_timing as when_fires,
    event_manipulation as event
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table;
