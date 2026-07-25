-- ============================================================
-- Migration Supabase — Enrichissement Pipeline ML v2
-- ============================================================
-- Ajoute la colonne kelly_league_performance à la table ml_model
-- pour la persistance des performances par ligue (Pilier 5).
--
-- À exécuter une seule fois dans le SQL Editor Supabase.
-- ============================================================

-- 1. Ajouter la colonne pour persister les performances Kelly par ligue
ALTER TABLE ml_model 
ADD COLUMN IF NOT EXISTS kelly_league_performance JSONB;

-- 2. Commentaire de documentation
COMMENT ON COLUMN ml_model.kelly_league_performance IS 
'JSON: performances par ligue pour le Kelly Criterion. Persisté par kellyCriterionService.ts via persistLeaguePerformance(). Contient: totalBets, wins, losses, profit, roi, kellyMultiplier, recentResults, lastBetDate';

-- 3. Vérification
SELECT id, 
       (xgboost_params IS NOT NULL) AS has_xgboost_params,
       (kelly_league_performance IS NOT NULL) AS has_kelly_perf
FROM ml_model;
