/**
 * Endpoint temporaire de diagnostic DB — prédictions autour du 30 août
 * Appel: GET /api/debug-db-aug30
 * SUPPRIMER après diagnostic
 */
import { NextResponse } from 'next/server';
import SupabaseStore from '@/lib/db-supabase';

export async function GET() {
  const results: Record<string, any> = {};

  // 1. Par created_at
  for (const d of ['2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31']) {
    const preds = await SupabaseStore.getPredictionsByCreatedAt(d);
    results[`created_${d}`] = preds.map(p => ({
      mid: p.match_id?.slice(0, 70),
      home: p.home_team,
      away: p.away_team,
      league: p.league,
      sport: p.sport,
      match_date: (p.match_date || '').split('T')[0],
      status: p.status,
      pred: p.predicted_result,
      ca: (p.created_at || '').substring(0, 16),
    }));
  }

  // 2. Par match_date
  for (const d of ['2026-08-29', '2026-08-30', '2026-08-31']) {
    const preds = await SupabaseStore.getPredictionsByDate(d);
    results[`matchdate_${d}`] = preds.map(p => ({
      mid: p.match_id?.slice(0, 70),
      home: p.home_team,
      away: p.away_team,
      league: p.league,
      sport: p.sport,
      match_date: (p.match_date || '').split('T')[0],
      status: p.status,
      pred: p.predicted_result,
      ca: (p.created_at || '').substring(0, 16),
    }));
  }

  // 3. Comptes globaux
  const total = await SupabaseStore.isAvailable();
  results.db_available = total;

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'no-store' }
  });
}