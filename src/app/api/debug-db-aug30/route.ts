/**
 * Endpoint temporaire de diagnostic DB
 * GET  = diagnostic (comme avant)
 * POST = test sauvegarde d'une prédiction et vérification immédiate
 * SUPPRIMER après diagnostic
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET() {
  const results: Record<string, any> = {};
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' });

  // 1. Total count + status
  const { count: totalCount } = await supabase.from('predictions').select('*', { count: 'exact', head: true });
  results.total_predictions = totalCount;
  for (const st of ['pending', 'completed']) {
    const { count } = await supabase.from('predictions').select('*', { count: 'exact', head: true }).eq('status', st);
    results[`status_${st}`] = count;
  }

  // 2. 10 dernières prédictions
  const { data: recent } = await supabase
    .from('predictions')
    .select('match_id, home_team, away_team, league, sport, match_date, created_at, status, predicted_result')
    .order('created_at', { ascending: false })
    .limit(10);
  results.last_10 = (recent || []).map((p: any) => ({
    mid: (p.match_id || '').slice(0, 60),
    home: p.home_team, away: p.away_team, league: p.league, sport: p.sport,
    match_date: (p.match_date || '').split('T')[0], status: p.status, pred: p.predicted_result,
    ca: (p.created_at || '').substring(0, 16),
  }));

  // 3. Test: tenter un upsert réel et vérifier
  const testMatchId = `test-diagnostics-${Date.now()}`;
  const nowISO = new Date().toISOString();
  const testPrediction = {
    match_id: testMatchId,
    home_team: 'Test Home',
    away_team: 'Test Away',
    league: 'Test League',
    sport: 'football',
    match_date: nowISO,
    season: null,
    odds_home: 1.5,
    odds_draw: null,
    odds_away: 2.5,
    predicted_result: 'home',
    confidence: 'medium',
    risk_percentage: 35,
    is_value_bet: false,
    edge_value: 0,
    is_combo: false,
    combo_id: null,
    combo_name: null,
    source: null,
    status: 'pending',
  };

  // Test upsert
  const { data: upsertData, error: upsertError } = await supabase
    .from('predictions')
    .upsert(testPrediction, { onConflict: 'match_id' })
    .select();

  results.test_upsert = {
    match_id: testMatchId,
    error: upsertError ? upsertError.message : null,
    returned_rows: upsertData?.length || 0,
    returned_data: upsertData?.map((p: any) => ({
      id: p.id, match_id: p.match_id, created_at: p.created_at, status: p.status, pred: p.predicted_result,
    })),
  };

  // Vérifier que la ligne existe après upsert
  const { data: verifyData, error: verifyError } = await supabase
    .from('predictions')
    .select('id, match_id, created_at, status, predicted_result')
    .eq('match_id', testMatchId);

  results.test_verify = {
    found: verifyData?.length || 0,
    error: verifyError ? verifyError.message : null,
    data: verifyData,
  };

  // Nettoyer le test
  if (verifyData && verifyData.length > 0) {
    await supabase.from('predictions').delete().eq('match_id', testMatchId);
    results.test_cleanup = 'deleted';
  }

  // 4. Check created_at column: est-ce que DEFAULT now() fonctionne ?
  const { data: noCreated } = await supabase
    .from('predictions')
    .select('match_id, created_at')
    .is('created_at', null)
    .limit(5);
  results.null_created_at = { count: (noCreated || []).length, items: noCreated };

  // 5. Vérifier les contraintes de la table
  try {
    const { data: colInfo, error: colErr } = await supabase
      .rpc('get_column_info', { table_name: 'predictions' })
      .select('*')
      .limit(1);
    // La RPC n'existe probablement pas, ignorer
  } catch {}

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'no-store' }
  });
}