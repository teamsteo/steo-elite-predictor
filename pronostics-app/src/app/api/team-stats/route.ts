import { NextResponse } from 'next/server';
import { 
  getMatchTeamStats, 
  getTeamStatsByName, 
  fetchLeagueTable,
  preloadLeagueTables,
  LEAGUE_IDS 
} from '@/lib/teamStatsService';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const homeTeam = searchParams.get('homeTeam');
  const awayTeam = searchParams.get('awayTeam');
  const teamName = searchParams.get('team');
  const leagueId = searchParams.get('league');
  
  try {
    // Précharger les classements
    if (action === 'preload') {
      await preloadLeagueTables();
      return NextResponse.json({ 
        success: true, 
        message: 'Classements préchargés',
        leagues: Object.keys(LEAGUE_IDS)
      });
    }
    
    // Récupérer un classement complet
    if (leagueId) {
      const table = await fetchLeagueTable(leagueId);
      return NextResponse.json({ 
        success: true, 
        league: leagueId,
        table 
      });
    }
    
    // Récupérer les stats d'une équipe
    if (teamName) {
      const stats = await getTeamStatsByName(teamName);
      return NextResponse.json({ 
        success: true, 
        team: stats 
      });
    }
    
    // Récupérer les stats pour un match
    if (homeTeam && awayTeam) {
      const matchStats = await getMatchTeamStats(homeTeam, awayTeam);
      return NextResponse.json({ 
        success: true, 
        ...matchStats 
      });
    }
    
    // Par défaut, retourner la liste des ligues
    return NextResponse.json({ 
      success: true,
      message: 'Team Stats API',
      availableLeagues: LEAGUE_IDS,
      usage: {
        'GET ?league=4328': 'Récupérer le classement Premier League',
        'GET ?team=Arsenal': 'Récupérer les stats d\'Arsenal',
        'GET ?homeTeam=Arsenal&awayTeam=Chelsea': 'Comparer deux équipes',
        'GET ?action=preload': 'Précharger tous les classements'
      }
    });
    
  } catch (error) {
    console.error('Erreur API team-stats:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur lors de la récupération des stats' },
      { status: 500 }
    );
  }
}
