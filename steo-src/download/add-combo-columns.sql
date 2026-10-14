-- ============================================
-- Migration: Ajout des colonnes Combo (Parlay)
-- Date: 2026-07-31
-- ============================================
-- Ces colonnes permettent de tracker les pronostics
-- générés par le module LLM Combo (parlay intelligent).
-- 
-- Usage:
--   combo_id    : Identifiant unique du combo (ex: combo-20260731-A1B2)
--   combo_name  : Nom du combo donné par l'LLM (ex: "Double Attaque Sûre")
--   is_combo    : true si ce pronostic fait partie d'un combo
-- ============================================

-- Ajouter les 3 colonnes combo à la table predictions
ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS combo_id TEXT,
  ADD COLUMN IF NOT EXISTS combo_name TEXT,
  ADD COLUMN IF NOT EXISTS is_combo BOOLEAN DEFAULT FALSE;

-- Index pour rechercher rapidement tous les legs d'un combo
CREATE INDEX IF NOT EXISTS idx_predictions_combo_id ON predictions (combo_id)
  WHERE combo_id IS NOT NULL;

-- Index pour filtrer les combos vs les pronostics normaux
CREATE INDEX IF NOT EXISTS idx_predictions_is_combo ON predictions (is_combo)
  WHERE is_combo = TRUE;

-- Commentaires descriptifs
COMMENT ON COLUMN predictions.combo_id IS 'Identifiant unique du combo (parlay) auquel appartient ce pronostic';
COMMENT ON COLUMN predictions.combo_name IS 'Nom du combo donné par le LLM';
COMMENT ON COLUMN predictions.is_combo IS 'True si ce pronostic fait partie d un combo genere par IA';
