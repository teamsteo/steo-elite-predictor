/**
 * Endpoint temporaire de diagnostic DB — prédictions autour du 30 août
 * Appel: GET /api/debug-db-aug30
 * SUPPRIMER après diagnostic
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const results: Record<string, any> = {};

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase env vars missing', url: !!supabaseUrl, key: !!supabaseKey });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // 1. Total count
  const { count: totalCount } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true });
  results.total_predictions = totalCount;

  // 2. Status breakdown
  for (const st of ['pending', 'completed', 'cancelled', 'postponed']) {
    const { count } = await supabase
      .from('predictions')
      .select('*', { count: 'exact', head: true })
      .eq('status', st);
    results[`status_${st}`] = count;
  }

  // 3. NULL predicted_result
  const { count: nullPred } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true })
    .is('predicted_result', null);
  results.null_predicted_result = nullPred;

  // 4. Par created_at pour les 5 derniers jours
  for (const d of ['2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31']) {
    const { data } = await supabase
      .from('predictions')
      .select('match_id, home_team, away_team, league, sport, match_date, created_at, status, predicted_result')
      .gte('created_at', `${d}T00:00:00Z`)
      .lte('created_at', `${d}T23:59:59Z`)
      .order('created_at', { ascending: true });
    results[`created_${d}`] = {
      count: (data || []).length,
      items: (data || []).slice(0, 5).map((p: any) => ({
        mid: (p.match_id || '').slice(0, 60),
        home: p.home_team,
        away: p.away_team,
        league: p.league,
        sport: p.sport,
        match_date: (p.match_date || '').split('T')[0],
        status: p.status,
        pred: p.predicted_result,
        ca: (p.created_at || '').substring(0, 16),
      }))
    };
  }

  // 5. 10 dernières prédictions (created_at DESC)
  const { data: recent } = await supabase
    .from('predictions')
    .select('match_id, home_team, away_team, league, sport, match_date, created_at, status, predicted_result')
    .order('created_at', { ascending: false })
    .limit(10);
  results.last_10 = (recent || []).map((p: any) => ({
    mid: (p.match_id || '').slice(0, 60),
    home: p.home_team,
    away: p.away_team,
    league: p.league,
    sport: p.sport,
    match_date: (p.match_date || '').split('T')[0],
    status: p.status,
    pred: p.predicted_result,
    ca: (p.created_at || '').substring(0, 16),
  }));

  // 6. Dates de created_at distinctes (dernière semaine)
  const weekAgo = '2026-08-24T00:00:00Z';
  const { data: weekData } = await supabase
    .from('predictions')
    .select('created_at')
    .gte('created_at', weekAgo)
    .order('created_at', { ascending: false });
  const distinctDates = [...new Set((weekData || []).map((p: any) => (p.created_at || '').split('T')[0]))];
  results.distinct_created_dates_last_week = distinctDates;

  // 7. Dates de match_date distinctes (dernière semaine)
  const { data: weekMatchData } = await supabase
    .from('predictions')
    .select('match_date')
    .gte('created_at', weekAgo)
    .order('match_date', { ascending: false });
  const distinctMatchDates = [...new Set((weekMatchData || []).map((p: any) => (p.match_date || '').split('T')[0]))];
  results.distinct_match_dates_last_week = distinctMatchDates;

  // 8. Check if UPSAFEGUARD is blocking
  // Récupérer les 5 dernières prédictions avec status=completed et regarder leur created_at
  const { data: completedRecent } = await supabase
    .from('predictions')
    .select('match_id, created_at, status')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(5);
  results.recent_completed = completedRecent;

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'no-store' }
  });
}