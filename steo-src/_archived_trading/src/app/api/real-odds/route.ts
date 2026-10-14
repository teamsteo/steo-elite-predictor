import { NextResponse } from 'next/server';
import { fetchAllESPNOdds, getESPNOddsStats, ESPNOddMatch } from '@/lib/espnOddsService';

/**
 * API pour récupérer les cotes en temps réel
 * 
 * CASCADE DE SOURCES:
 * 1. ESPN (DraftKings) - GRATUIT ET ILLIMITÉ
 * 2. The Odds API - Fallback si ESPN sans cotes
 * 3. Estimations - Dernier recours
 */

interface FormattedMatch {
  id: string;
  teams: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  date: string;
  odds: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  bookmaker: string;
  hasRealOdds: boolean;
  oddsSource: 'espn-draftkings' | 'the-odds-api' | 'estimation';
  reliabilityScore: number;
}

/**
 * GET - Récupérer les cotes avec fallback automatique
 */
export async function GET() {
  try {
    console.log('📡 API Real-Odds: Récupération (ESPN → Odds API → Estimations)...');
    
    // Récupérer les cotes avec fallback
    const matches = await fetchAllESPNOdds();
    const stats = getESPNOddsStats();
    
    // Formater les matchs
    const formattedMatches: FormattedMatch[] = matches.map(match => ({
      id: match.id,
      teams: `${match.homeTeam} vs ${match.awayTeam}`,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      sport: match.sport,
      league: match.league,
      date: match.date,
      odds: match.oddsDraw && typeof match.oddsDraw === 'number'
        ? `${match.oddsHome.toFixed(2)} | ${match.oddsDraw.toFixed(2)} | ${match.oddsAway.toFixed(2)}`
        : `${match.oddsHome.toFixed(2)} | ${match.oddsAway.toFixed(2)}`,
      oddsHome: match.oddsHome,
      oddsDraw: match.oddsDraw,
      oddsAway: match.oddsAway,
      bookmaker: match.bookmaker,
      hasRealOdds: match.hasRealOdds,
      oddsSource: match.oddsSource,
      reliabilityScore: match.reliabilityScore,
    }));
    
    // Stats par source
    const espnCount = matches.filter(m => m.oddsSource === 'espn-draftkings').length;
    const oddsApiCount = matches.filter(m => m.oddsSource === 'the-odds-api').length;
    const estimatedCount = matches.filter(m => m.oddsSource === 'estimation').length;
    
    // Stats par sport
    const bySport: Record<string, number> = {};
    for (const m of matches) {
      bySport[m.sport] = (bySport[m.sport] || 0) + 1;
    }
    
    // Stats par bookmaker
    const byBookmaker: Record<string, number> = {};
    for (const m of matches) {
      byBookmaker[m.bookmaker] = (byBookmaker[m.bookmaker] || 0) + 1;
    }
    
    const liveCount = matches.filter(m => m.isLive).length;
    
    console.log(`✅ API Real-Odds: ${matches.length} matchs (ESPN: ${espnCount}, Odds API: ${oddsApiCount}, Estimés: ${estimatedCount})`);
    
    return NextResponse.json({
      success: true,
      message: `${matches.length} matchs synchronisés`,
      
      // Sources avec cascade
      apiStatus: [
        { 
          provider: 'ESPN (DraftKings)', 
          enabled: true, 
          type: 'primary',
          cost: 'GRATUIT',
          quota: 'ILLIMITÉ',
          matchesCount: espnCount,
          reliability: 95,
        },
        { 
          provider: 'The Odds API', 
          enabled: true,
          type: 'fallback',
          cost: '500/mois gratuit',
          quota: 'LIMITÉ',
          matchesCount: oddsApiCount,
          reliability: 90,
          note: 'Utilisé si ESPN indisponible',
        },
        { 
          provider: 'Estimation', 
          enabled: true,
          type: 'last-resort',
          cost: 'GRATUIT',
          quota: 'ILLIMITÉ',
          matchesCount: estimatedCount,
          reliability: 60,
          note: 'Utilisé si les deux indisponibles',
        },
      ],
      
      // Quota info (ESPN est illimité)
      quotaInfo: {
        monthlyQuota: Infinity,
        used: 0,
        remaining: Infinity,
        dailyUsed: 0,
        dailyBudget: Infinity,
        note: 'ESPN est gratuit et illimité! The Odds API utilisé uniquement en fallback.',
      },
      
      // Stats détaillées
      stats: {
        total: matches.length,
        synced: matches.length,
        active: matches.length,
        live: liveCount,
        bySource: {
          espnDraftKings: espnCount,
          theOddsApi: oddsApiCount,
          estimated: estimatedCount,
        },
        bySport,
        byBookmaker,
        avgReliability: matches.length > 0 
          ? Math.round(matches.reduce((sum, m) => sum + m.reliabilityScore, 0) / matches.length)
          : 0,
      },
      
      matches: formattedMatches,
      lastUpdate: stats.lastUpdate || new Date().toISOString(),
      source: 'ESPN → Odds API → Estimations',
      
      // Explication de la cascade
      cascadeExplanation: {
        title: 'Système de fallback automatique',
        steps: [
          { step: 1, source: 'ESPN (DraftKings)', condition: 'Gratuit et illimité - Toujours essayé en premier' },
          { step: 2, source: 'The Odds API', condition: 'Si ESPN ne fournit pas de cotes pour ce match' },
          { step: 3, source: 'Estimation', condition: 'Si aucune API ne fournit de cotes' },
        ],
      },
    });
    
  } catch (error) {
    console.error('❌ Erreur API Real-Odds:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Erreur lors de la récupération des cotes',
      apiStatus: [
        { provider: 'ESPN (DraftKings)', enabled: false, error: String(error) },
        { provider: 'The Odds API', enabled: false, error: 'Non testé' },
      ],
      matches: [],
      source: 'error',
    }, { status: 500 });
  }
}

/**
 * POST - Forcer le rafraîchissement
 */
export async function POST() {
  const { forceRefreshESPN } = await import('@/lib/espnOddsService');
  await forceRefreshESPN();
  return GET();
}
