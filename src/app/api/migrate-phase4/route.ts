/**
 * API Route: Phase 4 — Calibration & Market Alignment
 * 
 * POST /api/migrate-phase4?secret=XXX
 * 
 * Vérifie et prépare l'environnement Phase 4:
 * - Vérifie que les tables prediction_outcomes et odds_history existent
 * - Si tables manquantes → retourne le SQL à exécuter dans le dashboard
 * - Si tables existantes → vérifie les indexes
 * - Option: insert une prédiction test pour valider
 * 
 * NOTE: Le DDL (CREATE TABLE) ne peut pas s'exécuter via Supabase REST API.
 * Exécutez le SQL dans le Supabase Dashboard → SQL Editor.
 * Ce fichier sert de vérification et de setup complémentaire.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CRON_SECRET = process.env.CRON_SECRET || 'steo-elite-cron-2026';

const MIGRATION_SQL = `-- ============================================
-- MIGRATION: Phase 4 — Calibration & Market Alignment
-- Exécuter dans: Supabase Dashboard → SQL Editor → New Query
-- ============================================

CREATE TABLE IF NOT EXISTS prediction_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id VARCHAR(255) NOT NULL,
    sport VARCHAR(50),
    predicted_prob FLOAT NOT NULL,
    calibrated_prob FLOAT,
    actual_outcome SMALLINT NOT NULL,
    confidence VARCHAR(20),
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_outcome CHECK (actual_outcome IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_sport ON prediction_outcomes(sport);
CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_recorded ON prediction_outcomes(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_match ON prediction_outcomes(match_id);

CREATE TABLE IF NOT EXISTS odds_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id TEXT NOT NULL,
    sport TEXT,
    home_team TEXT,
    away_team TEXT,
    odds_home NUMERIC(5,2),
    odds_draw NUMERIC(5,2),
    odds_away NUMERIC(5,2),
    snapshot_source TEXT DEFAULT 'espn',
    recorded_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_odds_history_match ON odds_history(match_id);
CREATE INDEX IF NOT EXISTS idx_odds_history_recorded ON odds_history(recorded_at DESC);

ALTER TABLE prediction_outcomes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Service role can manage prediction_outcomes"
        ON prediction_outcomes FOR ALL TO SERVICE_ROLE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "Anon can read prediction_outcomes"
        ON prediction_outcomes FOR SELECT TO ANON USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;`;

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');

  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Variables Supabase manquantes', required: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] },
      { status: 500 }
    );
  }

  const sb = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const checks: { table: string; exists: boolean; error?: string }[] = [];

  // Check prediction_outcomes
  try {
    const { error } = await sb.from('prediction_outcomes').select('id').limit(1);
    checks.push({ table: 'prediction_outcomes', exists: !error, error: error?.message });
  } catch (e: any) {
    checks.push({ table: 'prediction_outcomes', exists: false, error: e.message });
  }

  // Check odds_history
  try {
    const { error } = await sb.from('odds_history').select('id').limit(1);
    checks.push({ table: 'odds_history', exists: !error, error: error?.message });
  } catch (e: any) {
    checks.push({ table: 'odds_history', exists: false, error: e.message });
  }

  // Check ml_model (for calibration storage)
  try {
    const { error } = await sb.from('ml_model').select('id').limit(1);
    checks.push({ table: 'ml_model', exists: !error, error: error?.message });
  } catch (e: any) {
    checks.push({ table: 'ml_model', exists: false, error: e.message });
  }

  const missingTables = checks.filter(c => !c.exists).map(c => c.table);
  const allExist = missingTables.length === 0;

  // Insert test record if all tables exist
  let testInserted = false;
  if (allExist) {
    try {
      const { error } = await sb.from('prediction_outcomes').insert({
        match_id: '__phase4_test__',
        sport: 'football',
        predicted_prob: 0.65,
        calibrated_prob: 0.63,
        actual_outcome: 1,
        confidence: 'high',
        recorded_at: new Date().toISOString(),
      });
      if (!error) {
        testInserted = true;
        // Clean up test record
        await sb.from('prediction_outcomes').delete().eq('match_id', '__phase4_test__');
      }
    } catch {
      // ignore
    }
  }

  return NextResponse.json({
    phase: 4,
    title: 'Calibration & Market Alignment',
    status: allExist ? 'ready' : 'migration_required',
    checks,
    testInsert: testInserted,
    ...(allExist
      ? {
          message: '✅ Toutes les tables Phase 4 sont prêtes. Lancez le training Python pour générer les coefficients Platt.',
          trainingCommand: 'cd ml && python3 train_xgboost.py',
        }
      : {
          message: '⚠️ Tables manquantes. Exécutez le SQL ci-dessous dans le Supabase Dashboard → SQL Editor.',
          sqlToExecute: MIGRATION_SQL,
          instructions: [
            '1. Ouvrez https://supabase.com/dashboard → votre projet → SQL Editor',
            '2. Cliquez "New Query"',
            '3. Collez le SQL ci-dessus (champ "sqlToExecute")',
            '4. Cliquez "Run"',
            '5. Re-exécutez cette API pour vérifier',
            '6. Lancez le training: cd ml && python3 train_xgboost.py',
          ],
        }),
  });
}
