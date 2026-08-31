/**
 * Endpoint temporaire de diagnostic DB
 * Test upsert avec les MÊMES colonnes que addPredictions (sans season)
 * SUPPRIMER après diagnostic
 */
import { NextResponse } from 'next/server';
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

  const testMatchId = `test-fix-${Date.now()}`;
  const nowISO = new Date().toISOString();

  // Test 1: upsert SANS season (le fix)
  const testWithoutSeason = {
    match_id: testMatchId,
    home_team: 'Test Home',
    away_team: 'Test Away',
    league: 'Test League',
    sport: 'football',
    match_date: nowISO,
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

  const { data: d1, error: e1 } = await supabase
    .from('predictions')
    .upsert(testWithoutSeason, { onConflict: 'match_id' })
    .select();

  results.test_without_season = {
    error: e1 ? e1.message : null,
    rows: d1?.length || 0,
  };

  // Nettoyer
  if (d1 && d1.length > 0) {
    await supabase.from('predictions').delete().eq('match_id', testMatchId);
  }

  // Test 2: upsert AVEC season (pour confirmer le bug)
  const testMatchId2 = `test-with-season-${Date.now()}`;
  const testWithSeason = { ...testWithoutSeason, match_id: testMatchId2, season: null };

  const { data: d2, error: e2 } = await supabase
    .from('predictions')
    .upsert(testWithSeason, { onConflict: 'match_id' })
    .select();

  results.test_with_season = {
    error: e2 ? e2.message : null,
    rows: d2?.length || 0,
  };

  // Nettoyer
  await supabase.from('predictions').delete().eq('match_id', testMatchId2);

  // Test 3: upsert minimal (just les colonnes obligatoires)
  const testMatchId3 = `test-minimal-${Date.now()}`;
  const { data: d3, error: e3 } = await supabase
    .from('predictions')
    .upsert({
      match_id: testMatchId3,
      home_team: 'Min',
      away_team: 'Mal',
      league: 'L',
      sport: 'football',
      match_date: nowISO,
      odds_home: 1.5,
      odds_draw: null,
      odds_away: 2.5,
      predicted_result: 'home',
      confidence: 'medium',
      risk_percentage: 50,
      status: 'pending',
    }, { onConflict: 'match_id' })
    .select();

  results.test_minimal = {
    error: e3 ? e3.message : null,
    rows: d3?.length || 0,
  };

  await supabase.from('predictions').delete().eq('match_id', testMatchId3);

  // 4. Vérifier quelles colonnes existent réellement
  // On insère une ligne puis on la relit avec select('*')
  const testMatchId4 = `test-cols-${Date.now()}`;
  await supabase.from('predictions').upsert({
    match_id: testMatchId4, home_team: 'C', away_team: 'C',
    league: 'L', sport: 'football', match_date: nowISO,
    odds_home: 1.5, odds_draw: null, odds_away: 2.5,
    predicted_result: 'home', confidence: 'medium', risk_percentage: 50, status: 'pending',
  }, { onConflict: 'match_id' });

  const { data: colRow } = await supabase.from('predictions').select('*').eq('match_id', testMatchId4).single();
  results.actual_columns = colRow ? Object.keys(colRow).sort() : [];
  await supabase.from('predictions').delete().eq('match_id', testMatchId4);

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'no-store' }
  });
}