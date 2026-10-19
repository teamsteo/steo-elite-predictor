-- ═══════════════════════════════════════════════════════════════
-- Task 47 — Ajout colonnes VN (Double Chance) à la table predictions
-- À exécuter dans le Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Durée : ~10 secondes. Idempotent (IF NOT EXISTS).
--
-- RATIONNELLE (Task 44 recommandation):
-- Le bilan football était vérifié en VN (nul = gagné) MAIS la cote stockée
-- était 1X2 pure → ROI fictif (+65% affiché vs +6.4% réel recalculé).
-- Désormais on stocke à la publication:
--   vn_odds            : cote Double Chance réelle (1 / (1/O_side + 1/O_draw))
--   vn_prob_calibrated : proba VN calibrée (Platt, voir src/lib/calibration.ts)
--   vn_edge            : p_calibrée - p_marché_dévig (en points de %)
--   vn_tier            : 'fiable' | 'modere' | 'risque' | 'avoid' (classification calibrée)
--
-- Les anciennes prédictions (sans ces champs) restent lisibles:
-- le code recalculera à la volée via les cotes 1X2 quand vn_odds IS NULL.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS vn_odds numeric(5,2);

ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS vn_prob_calibrated numeric(4,3);

ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS vn_edge numeric(5,2);

ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS vn_tier text DEFAULT NULL;

-- Index pour requêtes par tier (rapports hebdo)
CREATE INDEX IF NOT EXISTS idx_predictions_vn_tier
  ON predictions (vn_tier) WHERE vn_tier IS NOT NULL;

-- RLS déjà active; la service_role bypass RLS donc pas de politique publique.
-- Vérification d'intégrité (optionnelle, informative):
SELECT
  COUNT(*) AS total_predictions,
  COUNT(vn_odds) AS with_vn_odds,
  COUNT(vn_prob_calibrated) AS with_vn_prob,
  COUNT(vn_edge) AS with_vn_edge
FROM predictions;
