import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import SupabaseStore from '@/lib/db-supabase';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'recent';
  const days = parseInt(searchParams.get('days') || '7');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase non configuré' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  
  try {
    if (mode === 'cleanup') {
      // Nettoyer les enregistrements parasites (predicted_result=NULL)
      const cleanup = await SupabaseStore.deleteScraperPollution();
      // Puis corriger les autres corrompues
      const fixResult = await SupabaseStore.fixCorruptedPredictions();
      return NextResponse.json({
        mode: 'cleanup',
        pollutionDeleted: cleanup.deleted,
        corruptedFixed: fixResult.fixed,
        corruptedDeleted: fixResult.deleted,
        details: fixResult.details.slice(0, 10),
      });
    }

    if (mode === 'recent') {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startISO = startDate.toISOString().split('T')[0] + 'T00:00:00Z';
      
      const { data, error } = await supabase
        .from('predictions')
        .select('match_id, home_team, away_team, sport, predicted_result, status, result_match, created_at, match_date, confidence, risk_percentage, is_value_bet, source, actual_result')
        .gte('created_at', startISO)
        .order('created_at', { ascending: false });
      
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      
      const byDay: Record<string, any> = {};
      for (const p of (data || [])) {
        const day = (p.created_at || '').split('T')[0];
        if (!byDay[day]) byDay[day] = { total: 0, pending: 0, completed: 0, corrupted: 0, null_predicted: 0, bySource: {}, bySport: {} };
        byDay[day].total++;
        if (p.status === 'completed') byDay[day].completed++;
        else byDay[day].pending++;
        const validResults = ['home', 'away', 'draw', 'over', 'under', 'btts_yes', 'btts_no'];
        if (!p.predicted_result) byDay[day].null_predicted++;
        else if (!validResults.includes(p.predicted_result)) byDay[day].corrupted++;
        const src = p.source || 'default';
        byDay[day].bySource[src] = (byDay[day].bySource[src] || 0) + 1;
        const sp = p.sport || 'unknown';
        byDay[day].bySport[sp] = (byDay[day].bySport[sp] || 0) + 1;
      }
      
      return NextResponse.json({ mode: 'recent', days, summary: byDay, total: data?.length || 0, sample: (data || []).slice(0, 10) });
    }
    
    if (mode === 'match-date-check') {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startISO = startDate.toISOString().split('T')[0] + 'T00:00:00Z';
      
      const { data, error } = await supabase
        .from('predictions')
        .select('match_id, home_team, away_team, created_at, match_date')
        .gte('created_at', startISO)
        .order('created_at', { ascending: false });
      
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      
      const mismatches: any[] = [];
      for (const p of (data || [])) {
        const createdDay = (p.created_at || '').split('T')[0];
        const matchDay = (p.match_date || '').split('T')[0];
        if (createdDay !== matchDay) {
          mismatches.push({ match_id: p.match_id, home_team: p.home_team, created_at: p.created_at, match_date: p.match_date, createdDay, matchDay, diffDays: Math.round((new Date(matchDay).getTime() - new Date(createdDay).getTime()) / 86400000) });
        }
      }
      
      return NextResponse.json({ mode: 'match-date-check', total: data?.length || 0, mismatches: mismatches.length, details: mismatches.slice(0, 20) });
    }
    
    if (mode === 'today-check') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayISO = yesterday.toISOString().split('T')[0];
      const todayISO = new Date().toISOString().split('T')[0];
      
      const { data: byCreated, error: err1 } = await supabase
        .from('predictions')
        .select('*')
        .gte('created_at', `${yesterdayISO}T00:00:00Z`)
        .lte('created_at', `${yesterdayISO}T23:59:59Z`);
      
      const { data: byMatchDate, error: err2 } = await supabase
        .from('predictions')
        .select('*')
        .gte('match_date', `${yesterdayISO}T00:00:00Z`)
        .lte('match_date', `${yesterdayISO}T23:59:59Z`);
      
      return NextResponse.json({
        mode: 'today-check',
        yesterdayISO, todayISO,
        byCreatedAt: { count: byCreated?.length || 0, error: err1?.message },
        byMatchDate: { count: byMatchDate?.length || 0, error: err2?.message },
        sample_created: (byCreated || []).slice(0, 5).map((p: any) => ({ id: p.match_id, home: p.home_team, away: p.away_team, predicted: p.predicted_result, status: p.status, created: p.created_at, match_date: p.match_date })),
        sample_matchdate: (byMatchDate || []).slice(0, 5).map((p: any) => ({ id: p.match_id, home: p.home_team, away: p.away_team, predicted: p.predicted_result, status: p.status, created: p.created_at, match_date: p.match_date }))
      });
    }
    
    return NextResponse.json({ error: 'Mode inconnu. Utilisez: recent, match-date-check, today-check, cleanup' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.split('\n').slice(0, 5) }, { status: 500 });
  }
}