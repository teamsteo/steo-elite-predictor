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

// V-CRIT-2 FIX: No hardcoded fallback — CRON_SECRET is required
const CRON_SECRET = process.env.CRON_SECRET;

// V-CRIT-3 FIX: Timing-safe comparison for secrets
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function authenticateRequest(request: NextRequest): boolean {
  if (!CRON_SECRET) {
    console.error('CRON_SECRET environment variable is not set');
    return false;
  }
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') || '';
  return timingSafeEqual(secret, CRON_SECRET);
}

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
    CONSTRAINT valid_outcome CHECK (actual_outcome IN (0, 1)),
    CONSTRAINT valid_predicted CHECK (predicted_prob >= 0 AND predicted_prob <= 1),
    CONSTRAINT valid_calibrated CHECK (calibrated_prob IS NULL OR (calibrated_prob >= 0 AND calibrated_prob <= 1))
);

CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_sport ON prediction_outcomes(sport);
CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_recorded ON prediction_outcomes(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_match ON prediction_outcomes(match_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prediction_outcomes_match_unique ON prediction_outcomes(match_id, sport) WHERE actual_outcome IS NOT NULL;

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
    CREATE POLICY "Service role full access prediction_outcomes"
        ON prediction_outcomes FOR ALL TO SERVICE_ROLE USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE odds_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Service role full access odds_history"
        ON odds_history FOR ALL TO SERVICE_ROLE USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;`;

export async function POST(request: NextRequest) {
  if (!authenticateRequest(request)) {
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

/**
 * GET /api/migrate-phase4?secret=XXX&action=import-calibration
 * 
 * Imports calibration data from ml/calibration_export.json into Supabase.
 * Reads the file from the repo and upserts into ml_model table.
 * 
 * This can be triggered from Vercel after deployment since it has
 * the correct Supabase env vars and network access.
 */
export async function GET(request: NextRequest) {
  if (!authenticateRequest(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  // V-MED-5 FIX: Whitelist allowed actions
  const ALLOWED_ACTIONS = ['import-calibration', 'status'] as const;
  if (action && !ALLOWED_ACTIONS.includes(action as any)) {
    return NextResponse.json({ error: 'Action non reconnue', allowed: ALLOWED_ACTIONS }, { status: 400 });
  }

  if (action === 'import-calibration') {
    return importCalibration();
  }

  // Default: same as POST check
  return POST(request);
}

async function importCalibration() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Variables Supabase manquantes' },
      { status: 500 }
    );
  }

  try {
    // V-MED-4 FIX: Import calibration data safely with fallback
    let calibrationExport: any = null;
    try {
      const mod = await import('./calibration-data');
      calibrationExport = mod.calibrationExport;
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Fichier calibration-data.ts non trouvé. Lancez le training Python d\'abord.',
        hint: 'cd ml && python3 train_xgboost.py'
      });
    }
    
    if (!calibrationExport?.xgboost_params) {
      return NextResponse.json({
        success: false,
        error: 'calibrationExport.xgboost_params manquant'
      });
    }

    const sb = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Upsert into ml_model
    const { error } = await sb.from('ml_model').upsert(
      {
        id: 'default_model',
        xgboost_params: calibrationExport.xgboost_params,
        version: `xgb-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
        samples_used: calibrationExport.total_samples,
        accuracy: Math.round((calibrationExport.global_cv_accuracy || 0) * 100),
        last_trained: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (error) {
      return NextResponse.json({ success: false, error: error.message });
    }

    return NextResponse.json({
      success: true,
      message: 'Calibration data imported into ml_model',
      sports: Object.keys(calibrationExport.xgboost_params?.sports || {}),
    });
  } catch (e: any) {
    // V-MED-2 FIX: Don't expose raw error messages
    return NextResponse.json({ success: false, error: 'Import échoué', code: 'IMPORT_ERROR' });
  }
}
