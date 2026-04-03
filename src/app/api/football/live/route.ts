/**
 * API Route - Football Live Matches
 * 
 * Retourne les matchs de football en cours avec données pour simulation 2D
 * Source: ESPN API (gratuit et légal)
 */

import { NextResponse } from 'next/server';
import { fetchLiveFootballMatches, fetchUpcomingMatches } from '@/lib/footballLiveService';

export const dynamic = 'force-dynamic';
export const revalidate = 30; // 30 secondes

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'live'; // 'live' ou 'upcoming'

    console.log(`⚽ Football Live API: Récupération matchs ${type}...`);

    if (type === 'upcoming') {
      const matches = await fetchUpcomingMatches();
      return NextResponse.json({
        success: true,
        matches,
        count: matches.length,
        source: 'ESPN API',
        lastUpdate: new Date().toISOString(),
      });
    }

    // Matchs live
    const matches = await fetchLiveFootballMatches();

    // Stats
    const stats = {
      total: matches.length,
      highPriority: matches.filter(m => m.priority >= 80).length,
      byLeague: matches.reduce((acc, m) => {
        const league = m.league.name;
        acc[league] = (acc[league] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      totalGoals: matches.reduce((sum, m) => sum + m.score.home + m.score.away, 0),
    };

    console.log(`✅ Football Live: ${matches.length} matchs (${stats.highPriority} haute priorité)`);

    return NextResponse.json({
      success: true,
      matches,
      stats,
      source: 'ESPN API (Gratuit)',
      lastUpdate: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Erreur API Football Live:', error);
    return NextResponse.json({
      success: false,
      error: 'Erreur lors de la récupération des matchs',
      matches: [],
    }, { status: 500 });
  }
}
