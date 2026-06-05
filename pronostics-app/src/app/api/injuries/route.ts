import { NextResponse } from 'next/server';
import { 
  scrapeNBAInjuries, 
  scrapeFootballInjuries, 
  getTeamInjuries, 
  calculateInjuryImpact 
} from '@/lib/injuryScraper';

/**
 * GET - Récupérer les blessures
 * 
 * Query params:
 * - sport: 'Foot' | 'Basket' | 'all' (défaut: all)
 * - team: nom de l'équipe spécifique
 * - homeTeam + awayTeam: calculer l'impact sur un match
 * 
 * AMÉLIORÉ: Retourne maintenant les erreurs explicites et la qualité des données
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sport = searchParams.get('sport') || 'all';
    const team = searchParams.get('team');
    const homeTeam = searchParams.get('homeTeam');
    const awayTeam = searchParams.get('awayTeam');
    
    // Si on demande l'impact sur un match spécifique
    if (homeTeam && awayTeam) {
      const matchSport = (searchParams.get('matchSport') || 'Foot') as 'Foot' | 'Basket';
      const impact = await calculateInjuryImpact(homeTeam, awayTeam, matchSport);
      
      return NextResponse.json({
        homeTeam,
        awayTeam,
        sport: matchSport,
        homeInjuries: impact.homeInjuries,
        awayInjuries: impact.awayInjuries,
        impactLevel: impact.impactLevel,
        homeOut: impact.homeOut,
        awayOut: impact.awayOut,
        errors: impact.errors.map(e => ({
          source: e.source,
          message: e.userMessage,
          solution: e.solution,
          severity: e.severity,
        })),
        dataQuality: impact.dataQuality,
        scrapedAt: new Date().toISOString(),
      });
    }
    
    // Si on demande une équipe spécifique
    if (team) {
      const teamSport = (sport === 'Basket' ? 'Basket' : 'Foot') as 'Foot' | 'Basket';
      const result = await getTeamInjuries(team, teamSport);
      
      return NextResponse.json({
        team,
        sport: teamSport,
        injuries: result.data || { team, sport: teamSport, injuries: [], lastUpdated: null },
        error: result.error ? {
          source: result.error.source,
          message: result.error.userMessage,
          solution: result.error.solution,
          severity: result.error.severity,
        } : null,
        dataSource: result.dataSource,
        scrapedAt: new Date().toISOString(),
      });
    }
    
    // Récupérer toutes les blessures
    if (sport === 'Basket') {
      const { injuries, errors } = await scrapeNBAInjuries();
      const injuriesArray = Array.from(injuries.values());
      
      return NextResponse.json({
        sport: 'Basket',
        source: 'NBA Official Injury Report',
        teams: injuriesArray,
        totalInjuries: injuriesArray.reduce((sum: number, t) => sum + t.injuries.length, 0),
        errors: errors.map(e => ({
          source: e.source,
          message: e.userMessage,
          solution: e.solution,
          severity: e.severity,
        })),
        dataQuality: injuries.size > 0 ? 'real' : 'none',
        scrapedAt: new Date().toISOString(),
      });
    }
    
    if (sport === 'Foot') {
      const { injuries, errors } = await scrapeFootballInjuries();
      const injuriesArray = Array.from(injuries.values());
      
      return NextResponse.json({
        sport: 'Foot',
        source: 'Transfermarkt',
        teams: injuriesArray,
        totalInjuries: injuriesArray.reduce((sum: number, t) => sum + t.injuries.length, 0),
        errors: errors.map(e => ({
          source: e.source,
          message: e.userMessage,
          solution: e.solution,
          severity: e.severity,
        })),
        dataQuality: injuries.size > 0 ? 'real' : 'none',
        scrapedAt: new Date().toISOString(),
      });
    }
    
    // Tous les sports
    const [footballResult, nbaResult] = await Promise.all([
      scrapeFootballInjuries(),
      scrapeNBAInjuries(),
    ]);
    
    const footballArray = Array.from(footballResult.injuries.values());
    const nbaArray = Array.from(nbaResult.injuries.values());
    const allErrors = [...footballResult.errors, ...nbaResult.errors];
    
    return NextResponse.json({
      football: {
        source: 'Transfermarkt',
        teams: footballArray,
        totalInjuries: footballArray.reduce((sum: number, t) => sum + t.injuries.length, 0),
        dataQuality: footballResult.injuries.size > 0 ? 'real' : 'none',
      },
      nba: {
        source: 'NBA Official Injury Report',
        teams: nbaArray,
        totalInjuries: nbaArray.reduce((sum: number, t) => sum + t.injuries.length, 0),
        dataQuality: nbaResult.injuries.size > 0 ? 'real' : 'none',
      },
      errors: allErrors.map(e => ({
        source: e.source,
        message: e.userMessage,
        solution: e.solution,
        severity: e.severity,
      })),
      summary: {
        totalTeams: footballArray.length + nbaArray.length,
        totalInjuries: footballArray.reduce((sum: number, t) => sum + t.injuries.length, 0) +
                       nbaArray.reduce((sum: number, t) => sum + t.injuries.length, 0),
        hasErrors: allErrors.length > 0,
        dataQuality: footballResult.injuries.size > 0 || nbaResult.injuries.size > 0 ? 'partial' : 'none',
      },
      scrapedAt: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('Erreur API injuries:', error);
    return NextResponse.json({ 
      error: 'Erreur lors de la récupération des blessures',
      details: error instanceof Error ? error.message : 'Unknown error',
      solution: 'Réessayez ultérieurement ou utilisez les données estimées',
    }, { status: 500 });
  }
}
