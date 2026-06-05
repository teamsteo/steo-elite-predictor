import { NextResponse } from 'next/server';
import { getCrossValidatedMatches } from '@/lib/crossValidation';
import { detectTraps, TrapDetection } from '@/lib/valueBetDetector';
import { getMatchInjuries, evaluateInjuryImpact } from '@/lib/transfermarktScraper';
import { getNBAMatchInjuries, evaluateNBAInjuryImpact } from '@/lib/nbaInjuryScraper';

interface MatchWithTrap {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  date: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  trap: TrapDetection;
  favorite: string;
  favoriteOdds: number;
  // NOUVEAU: Données de blessures réelles
  injuryData?: {
    homeInjuries: number;
    awayInjuries: number;
    homeImpact: number;
    awayImpact: number;
    summary: string;
    keyAbsentees?: { home: string[]; away: string[] };
    source: string;
  };
}

/**
 * GET - Récupérer tous les pièges détectés
 * 
 * Query params:
 * - severity: 'low' | 'medium' | 'high' (filtre par sévérité)
 * - sport: 'Foot' | 'Basket' (filtre par sport)
 * - limit: nombre max de résultats (défaut: 20)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const severity = searchParams.get('severity');
    const sport = searchParams.get('sport');
    const limit = parseInt(searchParams.get('limit') || '20');
    
    // Récupérer les matchs du jour
    const { matches } = await getCrossValidatedMatches();
    
    // Détecter les pièges pour chaque match
    const traps: MatchWithTrap[] = [];
    
    for (const match of matches) {
      // NOUVEAU: Récupérer les données de blessures réelles
      let injuryInfo: MatchWithTrap['injuryData'] | undefined;
      let homeInjuries = 0;
      let awayInjuries = 0;
      
      try {
        if (match.sport.toLowerCase().includes('basket') || match.sport.toLowerCase().includes('nba')) {
          // NBA
          const { home, away } = await getNBAMatchInjuries(match.homeTeam, match.awayTeam);
          const impact = evaluateNBAInjuryImpact(home, away);
          
          homeInjuries = home.length;
          awayInjuries = away.length;
          injuryInfo = {
            homeInjuries: home.length,
            awayInjuries: away.length,
            homeImpact: impact.homeImpact,
            awayImpact: impact.awayImpact,
            summary: impact.summary,
            keyAbsentees: impact.keyAbsentees,
            source: 'NBA Official',
          };
        } else {
          // Football
          const { home, away } = await getMatchInjuries(match.homeTeam, match.awayTeam);
          const impact = evaluateInjuryImpact(home, away);
          
          homeInjuries = home.length;
          awayInjuries = away.length;
          injuryInfo = {
            homeInjuries: home.length,
            awayInjuries: away.length,
            homeImpact: impact.homeImpact,
            awayImpact: impact.awayImpact,
            summary: impact.summary,
            source: 'Transfermarkt',
          };
        }
      } catch (e) {
        console.log(`⚠️ Impossible de récupérer les blessures pour ${match.homeTeam} vs ${match.awayTeam}`);
      }
      
      const trap = detectTraps({
        id: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        sport: match.sport,
        date: match.date,
        oddsHome: match.oddsHome,
        oddsDraw: match.oddsDraw,
        oddsAway: match.oddsAway,
        // NOUVEAU: Passer les compteurs de blessures
        homeInjuries,
        awayInjuries,
      });
      
      if (trap.isTrap) {
        const favorite = match.oddsHome < match.oddsAway ? match.homeTeam : match.awayTeam;
        const favoriteOdds = Math.min(match.oddsHome, match.oddsAway);
        
        traps.push({
          id: match.id,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          sport: match.sport,
          league: match.league,
          date: match.date,
          oddsHome: match.oddsHome,
          oddsDraw: match.oddsDraw,
          oddsAway: match.oddsAway,
          trap,
          favorite,
          favoriteOdds,
          // NOUVEAU: Inclure les données de blessures
          injuryData: injuryInfo,
        });
      }
    }
    
    // Filtrer par sévérité
    let filtered = traps;
    if (severity && ['low', 'medium', 'high'].includes(severity)) {
      filtered = filtered.filter(t => t.trap.severity === severity);
    }
    
    // Filtrer par sport
    if (sport) {
      filtered = filtered.filter(t => t.sport === sport);
    }
    
    // Trier par sévérité (high > medium > low)
    const severityOrder = { high: 0, medium: 1, low: 2 };
    filtered.sort((a, b) => severityOrder[a.trap.severity] - severityOrder[b.trap.severity]);
    
    // Limiter les résultats
    const result = filtered.slice(0, limit);
    
    // Statistiques
    const stats = {
      total: traps.length,
      bySeverity: {
        high: traps.filter(t => t.trap.severity === 'high').length,
        medium: traps.filter(t => t.trap.severity === 'medium').length,
        low: traps.filter(t => t.trap.severity === 'low').length,
      },
      byType: {
        overvalued_favorite: traps.filter(t => t.trap.trapType === 'overvalued_favorite').length,
        tight_match: traps.filter(t => t.trap.trapType === 'tight_match').length,
        injury_risk: traps.filter(t => t.trap.trapType === 'injury_risk').length,
        form_mismatch: traps.filter(t => t.trap.trapType === 'form_mismatch').length,
      },
    };
    
    return NextResponse.json({
      traps: result,
      stats,
      generatedAt: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('Erreur API traps:', error);
    return NextResponse.json({ error: 'Server error', traps: [] }, { status: 500 });
  }
}
