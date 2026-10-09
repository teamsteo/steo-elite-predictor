-- ═══════════════════════════════════════════════════════════════
-- Table odds_history — tracking cotes + CLV (Task 43)
-- À exécuter dans le Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Durée : ~30 secondes. Idempotent (IF NOT EXISTS).
-- Une fois créée, le cron track-odds (6h30/12h30/18h30 UTC) alimente
-- automatiquement les snapshots et la CLV apparaît dans le rapport
-- hebdo sport-metrics (dimanche 19h UTC, Telegram).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS odds_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id text NOT NULL,
  sport text,
  home_team text,
  away_team text,
  odds_home numeric(5,2),
  odds_draw numeric(5,2),
  odds_away numeric(5,2),
  snapshot_source text DEFAULT 'espn',
  recorded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Index de recherche par match (le service interroge match_id + date)
CREATE INDEX IF NOT EXISTS idx_odds_history_match_id
  ON odds_history (match_id, recorded_at DESC);

-- RLS: le service utilise la service_role key (bypass RLS) mais on verrouille
-- quand même les accès anon/public par défaut.
ALTER TABLE odds_history ENABLE ROW LEVEL SECURITY;

-- Politique service-role uniquement (la service_role key bypass RLS, donc
-- aucune politique publique n'est nécessaire).
