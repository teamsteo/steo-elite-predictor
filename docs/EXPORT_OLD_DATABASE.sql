-- =============================================================================
-- SCRIPT D'EXPORT - À exécuter dans l'ANCIENNE base Supabase (aumsrakioetvvqopthbs)
-- Copie les résultats de chaque section et exécute-les dans la NOUVELLE base
-- =============================================================================

-- 1. COMPTER LES ENREGISTREMENTS
SELECT 'football_matches' as table_name, COUNT(*) as count FROM football_matches
UNION ALL
SELECT 'basketball_matches', COUNT(*) FROM basketball_matches
UNION ALL
SELECT 'nhl_matches', COUNT(*) FROM nhl_matches
UNION ALL
SELECT 'mlb_matches', COUNT(*) FROM mlb_matches
UNION ALL
SELECT 'ml_patterns', COUNT(*) FROM ml_patterns
UNION ALL
SELECT 'predictions', COUNT(*) FROM predictions
UNION ALL
SELECT 'bankroll_stats', COUNT(*) FROM bankroll_stats
UNION ALL
SELECT 'users', COUNT(*) FROM users;

-- 2. EXPORTER ML_PATTERNS (petite table, copie directe)
SELECT 'INSERT INTO ml_patterns (id, sport, pattern_name, conditions, success_rate, sample_size, created_at, updated_at) VALUES'
UNION ALL
SELECT '(' || 
  COALESCE(id::text, 'NULL') || ', ' ||
  '''' || COALESCE(sport, '') || '''', ', ' ||
  '''' || REPLACE(COALESCE(pattern_name, ''), '''', '''''') || '''', ', ' ||
  '''' || REPLACE(COALESCE(conditions::text, '{}'), '''', '''''') || '''', ', ' ||
  COALESCE(success_rate::text, 'NULL') || ', ' ||
  COALESCE(sample_size::text, 'NULL') || ', ' ||
  CASE WHEN created_at IS NULL THEN 'NULL' ELSE '''' || created_at::text || '''' END || ', ' ||
  CASE WHEN updated_at IS NULL THEN 'NULL' ELSE '''' || updated_at::text || '''' END ||
');'
FROM ml_patterns;

-- 3. EXPORTER BANKROLL_STATS
SELECT 'INSERT INTO bankroll_stats (id, user_id, date, starting_bankroll, current_bankroll, total_bets, winning_bets, profit_loss, roi, created_at) VALUES'
UNION ALL
SELECT '(' ||
  COALESCE(id::text, 'NULL') || ', ' ||
  CASE WHEN user_id IS NULL THEN 'NULL' ELSE '''' || user_id || '''' END || ', ' ||
  CASE WHEN date IS NULL THEN 'NULL' ELSE '''' || date::text || '''' END || ', ' ||
  COALESCE(starting_bankroll::text, 'NULL') || ', ' ||
  COALESCE(current_bankroll::text, 'NULL') || ', ' ||
  COALESCE(total_bets::text, 'NULL') || ', ' ||
  COALESCE(winning_bets::text, 'NULL') || ', ' ||
  COALESCE(profit_loss::text, 'NULL') || ', ' ||
  COALESCE(roi::text, 'NULL') || ', ' ||
  CASE WHEN created_at IS NULL THEN 'NULL' ELSE '''' || created_at::text || '''' END ||
');'
FROM bankroll_stats;

-- 4. EXPORTER USERS
SELECT 'INSERT INTO users (id, email, name, role, created_at, updated_at) VALUES'
UNION ALL
SELECT '(' ||
  CASE WHEN id IS NULL THEN 'NULL' ELSE '''' || id || '''' END || ', ' ||
  CASE WHEN email IS NULL THEN 'NULL' ELSE '''' || REPLACE(email, '''', '''''') || '''' END || ', ' ||
  CASE WHEN name IS NULL THEN 'NULL' ELSE '''' || REPLACE(name, '''', '''''') || '''' END || ', ' ||
  CASE WHEN role IS NULL THEN 'NULL' ELSE '''' || role || '''' END || ', ' ||
  CASE WHEN created_at IS NULL THEN 'NULL' ELSE '''' || created_at::text || '''' END || ', ' ||
  CASE WHEN updated_at IS NULL THEN 'NULL' ELSE '''' || updated_at::text || '''' END ||
');'
FROM users;

-- =============================================================================
-- POUR LES GRANDES TABLES (football, basketball, nhl, mlb, predictions)
-- Utiliser l'export CSV via le dashboard Supabase :
-- 1. Aller dans Table Editor
-- 2. Sélectionner la table
-- 3. Cliquer sur "Export" > "Download as CSV"
-- 4. Puis importer dans la nouvelle base via Table Editor > Import
-- =============================================================================
