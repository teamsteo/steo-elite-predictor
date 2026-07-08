/**
 * Endpoint dédié pour corriger et publier le bilan d'une date spécifique.
 * Utilisé pour les matchs zombies (completed sans scores).
 */
import { NextRequest, NextResponse } from 'next/server';
import SupabaseStore, { type DbPrediction } from '@/lib/db-supabase';

const CRON_SECRET = process.env.CRON_SECRET || 'steo-elite-cron-2026';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const providedSecret = url.searchParams.get('secret') || url.headers.get('authorization')?.replace('Bearer ', '');
  
  if (providedSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const targetDate = url.searchParams.get('date');
  if (!targetDate) {
    return NextResponse.json({ error: 'Paramètre date requis (YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    const startTime = Date.now();

    // Utiliser getPredictionsByDate pour cibler précisément
    const dayPreds = await SupabaseStore.getPredictionsByDate(targetDate);
    
    // Debug: montrer les données brutes de Supabase
    const debugData = dayPreds.map(p => ({
      match_id: p.match_id,
      status: p.status,
      result_match: p.result_match,
      result_type: typeof p.result_match,
      home_score: p.home_score,
      away_score: p.away_score,
      sport: p.sport,
      home_team: p.home_team,
      away_team: p.away_team,
      match_date: p.match_date,
    }));

    // Trouver les zombies: completed sans résultat clair
    const zombies = dayPreds.filter(p =>
      p.status === 'completed' &&
      p.result_match !== true &&
      p.result_match !== false
    );

    // Reset les zombies
    let resetCount = 0;
    for (const p of zombies) {
      const success = await SupabaseStore.completePrediction(p.match_id, {
        homeScore: 0,
        awayScore: 0,
        actualResult: 'home',
        resultMatch: false,
        status: 'pending',
      });
      if (success) resetCount++;
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      date: targetDate,
      totalForDate: dayPreds.length,
      zombiesFound: zombies.length,
      resetCount,
      debug: debugData,
      duration: `${duration}ms`
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}