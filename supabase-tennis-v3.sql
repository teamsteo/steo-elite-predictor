-- ============================================================
-- Tennis V3 — Tables (stratégie 8 étapes, 2026)
-- À exécuter dans Supabase SQL Editor (une seule fois)
-- ============================================================

-- 1. Suivi des picks V3 (settlement + performance réelle)
CREATE TABLE IF NOT EXISTS tennis_v3_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id TEXT NOT NULL,
  player1 TEXT NOT NULL,
  player2 TEXT NOT NULL,
  tournament TEXT,
  surface TEXT,
  round TEXT,
  match_date TEXT,
  pick TEXT NOT NULL,              -- 'player1' | 'player2'
  pick_name TEXT,
  probability NUMERIC,             -- proba modèle calibrée
  odds NUMERIC,
  edge NUMERIC,                    -- p_model - p_implicite
  kelly NUMERIC,
  tier TEXT,                       -- green | yellow | red
  model_version TEXT,
  result TEXT,                     -- NULL = non réglé | 'win' | 'loss' | 'void'
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (match_id, pick)
);

CREATE INDEX IF NOT EXISTS idx_tennis_v3_bets_unsettled ON tennis_v3_bets (result) WHERE result IS NULL;
CREATE INDEX IF NOT EXISTS idx_tennis_v3_bets_date ON tennis_v3_bets (match_date DESC);

-- 2. Calibration persistante (Platt scaling a/b par catégorie, survit aux cold starts)
CREATE TABLE IF NOT EXISTS tennis_v3_calibration (
  category TEXT PRIMARY KEY,       -- 'atp' | 'wta' | tier...
  a NUMERIC NOT NULL DEFAULT 1.0,  -- pente logit
  b NUMERIC NOT NULL DEFAULT 0.0,  -- biais
  sample INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Flags vetos manuels (blessure, suspension, fatigue connue)
CREATE TABLE IF NOT EXISTS tennis_v3_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player TEXT NOT NULL,            -- clé canonique ("alcaraz-c") ou nom libre
  reason TEXT NOT NULL,
  until DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tennis_v3_flags_active ON tennis_v3_flags (until DESC);

-- 4. RLS : service_role uniquement (lecture/écriture backend), pas d'exposition publique
ALTER TABLE tennis_v3_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tennis_v3_calibration ENABLE ROW LEVEL SECURITY;
ALTER TABLE tennis_v3_flags ENABLE ROW LEVEL SECURITY;

-- pas de policy publiée : avec RLS activé et aucune policy, seuls
-- SUPABASE_SERVICE_ROLE_KEY (bypass) et le dashboard accèdent aux tables.
