/**
 * API ML Analyze - Analyse un match avec l'apprentissage ML
 *
 * GET /api/ml/analyze?sport=football&homeTeam=Arsenal&awayTeam=Chelsea&homeXg=1.8&awayXg=1.2&oddsHome=1.65&oddsAway=5.00
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeMatchWithML, loadMLPatterns, getMLStats, refreshMLMemory } from '@/lib/ml-memory-service';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'analyze';

  try {
    switch (action) {
      case 'analyze': {
        // Paramètres du match
        const sport = (url.searchParams.get('sport') || 'football') as 'football' | 'basketball';
        const homeTeam = url.searchParams.get('homeTeam') || 'Home';
        const awayTeam = url.searchParams.get('awayTeam') || 'Away';
        const league = url.searchParams.get('league') || undefined;

        // Football params
        const homeXg = url.searchParams.get('homeXg') ? parseFloat(url.searchParams.get('homeXg')!) : undefined;
        const awayXg = url.searchParams.get('awayXg') ? parseFloat(url.searchParams.get('awayXg')!) : undefined;
        const homePossession = url.searchParams.get('homePossession') ? parseFloat(url.searchParams.get('homePossession')!) : undefined;
        const awayPossession = url.searchParams.get('awayPossession') ? parseFloat(url.searchParams.get('awayPossession')!) : undefined;
        const homeShots = url.searchParams.get('homeShots') ? parseInt(url.searchParams.get('homeShots')!) : undefined;
        const awayShots = url.searchParams.get('awayShots') ? parseInt(url.searchParams.get('awayShots')!) : undefined;
        const oddsHome = url.searchParams.get('oddsHome') ? parseFloat(url.searchParams.get('oddsHome')!) : undefined;
        const oddsDraw = url.searchParams.get('oddsDraw') ? parseFloat(url.searchParams.get('oddsDraw')!) : undefined;
        const oddsAway = url.searchParams.get('oddsAway') ? parseFloat(url.searchParams.get('oddsAway')!) : undefined;

        // Basketball params
        const homeFgPct = url.searchParams.get('homeFgPct') ? parseFloat(url.searchParams.get('homeFgPct')!) : undefined;
        const awayFgPct = url.searchParams.get('awayFgPct') ? parseFloat(url.searchParams.get('awayFgPct')!) : undefined;
        const homeRebounds = url.searchParams.get('homeRebounds') ? parseInt(url.searchParams.get('homeRebounds')!) : undefined;
        const awayRebounds = url.searchParams.get('awayRebounds') ? parseInt(url.searchParams.get('awayRebounds')!) : undefined;

        const analysis = await analyzeMatchWithML({
          homeTeam,
          awayTeam,
          league,
          sport,
          homeXg,
          awayXg,
          homePossession,
          awayPossession,
          homeShots,
          awayShots,
          oddsHome,
          oddsDraw,
          oddsAway,
          homeFgPct,
          awayFgPct,
          homeRebounds,
          awayRebounds
        });

        return NextResponse.json({
          success: true,
          match: { homeTeam, awayTeam, league, sport },
          analysis,
          timestamp: new Date().toISOString()
        });
      }

      case 'patterns': {
        // Lister tous les patterns
        const patterns = await loadMLPatterns();
        return NextResponse.json({
          success: true,
          patterns,
          count: patterns.length,
          timestamp: new Date().toISOString()
        });
      }

      case 'stats': {
        // Statistiques ML
        const stats = await getMLStats();
        return NextResponse.json({
          success: true,
          stats,
          timestamp: new Date().toISOString()
        });
      }

      case 'refresh': {
        // Rafraîchir la mémoire
        await refreshMLMemory();
        const stats = await getMLStats();
        return NextResponse.json({
          success: true,
          message: 'Mémoire ML rafraîchie',
          stats,
          timestamp: new Date().toISOString()
        });
      }

      default:
        return NextResponse.json({
          error: 'Action non reconnue',
          validActions: ['analyze', 'patterns', 'stats', 'refresh']
        }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
