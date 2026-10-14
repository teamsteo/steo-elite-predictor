-- =====================================================
-- Table ml_picks pour le tracking des pronostics ML
-- À exécuter dans Supabase SQL Editor
-- =====================================================

-- Création de la table ml_picks
CREATE TABLE IF NOT EXISTS ml_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id VARCHAR(255),
  sport VARCHAR(50) NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  home_team VARCHAR(255) NOT NULL,
  away_team VARCHAR(255) NOT NULL,
  bet VARCHAR(50) NOT NULL,
  bet_label VARCHAR(255),
  odds DECIMAL(10,2),
  win_probability DECIMAL(5,2),
  confidence VARCHAR(20),
  type VARCHAR(50),
  result VARCHAR(20) DEFAULT 'pending',
  actual_winner VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_ml_picks_result ON ml_picks(result);
CREATE INDEX IF NOT EXISTS idx_ml_picks_date ON ml_picks(date);
CREATE INDEX IF NOT EXISTS idx_ml_picks_sport ON ml_picks(sport);

-- Activer Row Level Security (optionnel, recommandé pour la production)
ALTER TABLE ml_picks ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre l'accès public en lecture (ajuster selon vos besoins)
CREATE POLICY "Permettre lecture publique ml_picks" ON ml_picks
  FOR SELECT USING (true);

-- Politique pour permettre l'écriture avec la clé service_role
CREATE POLICY "Permettre écriture service_role ml_picks" ON ml_picks
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- Statistiques ML (vue pour le dashboard)
-- =====================================================
CREATE OR REPLACE VIEW ml_picks_stats AS
SELECT 
  COUNT(*) as total_picks,
  COUNT(*) FILTER (WHERE result = 'won') as won,
  COUNT(*) FILTER (WHERE result = 'lost') as lost,
  COUNT(*) FILTER (WHERE result = 'pending') as pending,
  CASE 
    WHEN COUNT(*) FILTER (WHERE result IN ('won', 'lost')) > 0 
    THEN ROUND((COUNT(*) FILTER (WHERE result = 'won')::DECIMAL / 
         COUNT(*) FILTER (WHERE result IN ('won', 'lost'))) * 100, 1)
    ELSE 0 
  END as win_rate,
  sport,
  DATE_TRUNC('week', date) as week
FROM ml_picks
GROUP BY sport, DATE_TRUNC('week', date)
ORDER BY week DESC, sport;

-- =====================================================
-- Statistiques des 7 derniers jours
-- =====================================================
CREATE OR REPLACE VIEW ml_picks_last_7_days AS
SELECT 
  COUNT(*) FILTER (WHERE result IN ('won', 'lost')) as total_settled,
  COUNT(*) FILTER (WHERE result = 'won') as won,
  COUNT(*) FILTER (WHERE result = 'lost') as lost,
  CASE 
    WHEN COUNT(*) FILTER (WHERE result IN ('won', 'lost')) > 0 
    THEN ROUND((COUNT(*) FILTER (WHERE result = 'won')::DECIMAL / 
         COUNT(*) FILTER (WHERE result IN ('won', 'lost'))) * 100, 1)
    ELSE 0 
  END as win_rate
FROM ml_picks
WHERE date >= NOW() - INTERVAL '7 days'
AND result != 'pending';
