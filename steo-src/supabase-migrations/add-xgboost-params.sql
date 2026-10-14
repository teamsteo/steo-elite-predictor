-- Migration: Ajout colonne xgboost_params à ml_model
-- Cette colonne stocke les paramètres XGBoost entraînés par le script Python
-- Date: 2026-07-24

-- Ajout de la colonne JSONB
ALTER TABLE ml_model ADD COLUMN IF NOT EXISTS xgboost_params JSONB;
