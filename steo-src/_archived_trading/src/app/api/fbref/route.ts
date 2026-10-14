import { NextResponse } from 'next/server';
import { 
  scrapeFormGuide, 
  scrapeH2HHistory, 
  scrapeTeamXG,
  scrapeDisciplineStats,
  getAdvancedMatchStats
} from '@/lib/fbrefScraper';

/**
 * GET - Récupérer les données avancées FBref
 * 
 * Query params:
 * - action: 'form' | 'h2h' | 'xg' | 'discipline' | 'match' (défaut: match)
 * - team: nom de l'équipe
 * - homeTeam + awayTeam: pour H2H ou analyse match
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'match';
    const team = searchParams.get('team');
    const homeTeam = searchParams.get('homeTeam');
    const awayTeam = searchParams.get('awayTeam');
    
    // Action: Form Guide
    if (action === 'form' && team) {
      const form = await scrapeFormGuide(team);
      return NextResponse.json({
        team,
        form,
        scrapedAt: new Date().toISOString(),
      });
    }
    
    // Action: H2H
    if (action === 'h2h' && homeTeam && awayTeam) {
      const h2h = await scrapeH2HHistory(homeTeam, awayTeam);
      return NextResponse.json({
        homeTeam,
        awayTeam,
        h2h,
        scrapedAt: new Date().toISOString(),
      });
    }
    
    // Action: xG
    if (action === 'xg' && team) {
      const xg = await scrapeTeamXG(team);
      return NextResponse.json({
        team,
        xg,
        scrapedAt: new Date().toISOString(),
      });
    }
    
    // Action: Discipline
    if (action === 'discipline' && team) {
      const discipline = await scrapeDisciplineStats(team);
      return NextResponse.json({
        team,
        discipline,
        scrapedAt: new Date().toISOString(),
      });
    }
    
    // Action: Analyse complète d'un match (défaut)
    if (homeTeam && awayTeam) {
      const stats = await getAdvancedMatchStats(homeTeam, awayTeam);
      return NextResponse.json({
        homeTeam,
        awayTeam,
        ...stats,
        scrapedAt: new Date().toISOString(),
      });
    }
    
    return NextResponse.json({ 
      error: 'Paramètres requis: team OU homeTeam+awayTeam',
      usage: {
        form: '?action=form&team=Liverpool',
        h2h: '?action=h2h&homeTeam=Liverpool&awayTeam=Arsenal',
        xg: '?action=xg&team=Liverpool',
        discipline: '?action=discipline&team=Liverpool',
        match: '?homeTeam=Liverpool&awayTeam=Arsenal',
      }
    }, { status: 400 });
    
  } catch (error) {
    console.error('Erreur API FBref:', error);
    return NextResponse.json({ 
      error: 'Erreur lors de la récupération des données FBref',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
