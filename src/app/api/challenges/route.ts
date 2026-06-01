import { NextResponse } from 'next/server';
import { 
  getUpcomingWorldCupFriendlies, 
  getValueBetsFromFriendlies,
} from '@/lib/world-cup-friendly-analyzer';
import {
  getUpcomingMatches,
  getValueBetsFromFootball,
  LEAGUE_NAMES,
  analyzeFootballMatch,
} from '@/lib/football-analyzer';

// ============================================
// INTERFACES
// ============================================

interface ValueBet {
  id: string;
  sport: 'football' | 'tennis' | 'basketball' | 'hockey' | 'baseball';
  match: string;
  league: string;
  leagueId?: string;
  date: string;
  betType: string;
  odds: number;
  ourProbability: number;
  bookmakerProbability: number;
  valueGap: number;
  valueScore: number;
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  analysis: string;
  factors: {
    name: string;
    impact: 'positive' | 'neutral' | 'negative';
  }[];
  isWorldCupFriendly?: boolean;
  isWorldCup?: boolean;
  isEuropeanLeague?: boolean;
  predictedScore?: { home: number; away: number };
}

// ============================================
// DONNÉES DE DÉMONSTRATION - TENNIS
// ============================================

function getTennisValueBets(): ValueBet[] {
  const today = new Date();
  
  return [
    {
      id: 'tennis-vb-001',
      sport: 'tennis',
      match: 'J. Sinner vs C. Alcaraz',
      league: 'ATP Masters 1000',
      date: new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString(),
      betType: 'Victoire Sinner',
      odds: 2.40,
      ourProbability: 0.48,
      bookmakerProbability: 0.417,
      valueGap: 0.063,
      valueScore: 72,
      confidence: 'high',
      analysis: 'Sinner revient de blessure mais sa forme récente en entraînement est excellente. Alcaraz moins convaincant sur cette surface.',
      factors: [
        { name: 'Forme récente', impact: 'positive' },
        { name: 'Avantage surface', impact: 'positive' },
        { name: 'Historique H2H équilibré', impact: 'neutral' },
      ],
    },
    {
      id: 'tennis-vb-002',
      sport: 'tennis',
      match: 'I. Swiatek vs A. Sabalenka',
      league: 'WTA 1000',
      date: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      betType: 'Victoire Swiatek',
      odds: 1.85,
      ourProbability: 0.62,
      bookmakerProbability: 0.54,
      valueGap: 0.08,
      valueScore: 78,
      confidence: 'very_high',
      analysis: 'Swiatek excellente sur terre battue, surface de prédilection. Sabalenka moins à laise sur cette surface.',
      factors: [
        { name: 'Expert surface', impact: 'positive' },
        { name: 'Forme récente', impact: 'positive' },
        { name: 'Motivation haute', impact: 'positive' },
      ],
    },
    {
      id: 'tennis-vb-003',
      sport: 'tennis',
      match: 'A. Zverev vs D. Medvedev',
      league: 'ATP 500',
      date: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      betType: 'Over 22.5 jeux',
      odds: 1.90,
      ourProbability: 0.58,
      bookmakerProbability: 0.526,
      valueGap: 0.054,
      valueScore: 65,
      confidence: 'medium',
      analysis: 'Match serré entre deux joueurs au style similaire. Probabilité élevée de 3 sets.',
      factors: [
        { name: 'H2H équilibré', impact: 'positive' },
        { name: 'Style de jeu similaire', impact: 'positive' },
        { name: 'Enjeu important', impact: 'neutral' },
      ],
    },
  ];
}

// ============================================
// MATCHS DE FOOTBALL - CHAMPIONNATS EUROPÉENS
// ============================================

function getEuropeanLeagueMatches(): ValueBet[] {
  const matches = getUpcomingMatches();
  
  // Filtrer pour ne garder que les championnats européens
  const europeanLeagues = ['ligue_1', 'premier_league', 'la_liga', 'serie_a', 'bundesliga', 'champions_league', 'europa_league'];
  
  const europeanMatches = matches.filter(m => europeanLeagues.includes(m.league));
  
  return europeanMatches.map(match => {
    const analysis = analyzeFootballMatch(match);
    
    return {
      id: match.id,
      sport: 'football' as const,
      match: `${match.homeTeam} vs ${match.awayTeam}`,
      league: LEAGUE_NAMES[match.league] || match.league,
      leagueId: match.league,
      date: match.date,
      betType: analysis.valueBet.recommendedBet,
      odds: analysis.valueBet.odds,
      ourProbability: analysis.valueBet.ourProbability,
      bookmakerProbability: analysis.valueBet.impliedProbability,
      valueGap: analysis.valueBet.valueGap,
      valueScore: analysis.valueBet.valueScore,
      confidence: analysis.confidence,
      analysis: analysis.insights.join(' '),
      factors: Object.entries(analysis.factors).map(([key, factor]) => ({
        name: factor.description,
        impact: factor.score > 5 ? 'positive' as const : factor.score < -5 ? 'negative' as const : 'neutral' as const,
      })),
      isEuropeanLeague: true,
      predictedScore: analysis.predictedScore,
    };
  });
}

// ============================================
// MATCHS DE COUPE DU MONDE
// ============================================

function getWorldCupMatches(): ValueBet[] {
  const matches = getUpcomingMatches('world_cup');
  
  return matches.map(match => {
    const analysis = analyzeFootballMatch(match);
    
    return {
      id: match.id,
      sport: 'football' as const,
      match: `${match.homeTeam} vs ${match.awayTeam}`,
      league: 'Coupe du Monde FIFA',
      leagueId: 'world_cup',
      date: match.date,
      betType: analysis.valueBet.recommendedBet,
      odds: analysis.valueBet.odds,
      ourProbability: analysis.valueBet.ourProbability,
      bookmakerProbability: analysis.valueBet.impliedProbability,
      valueGap: analysis.valueBet.valueGap,
      valueScore: analysis.valueBet.valueScore,
      confidence: analysis.confidence,
      analysis: analysis.insights.join(' '),
      factors: Object.entries(analysis.factors).map(([key, factor]) => ({
        name: factor.description,
        impact: factor.score > 5 ? 'positive' as const : factor.score < -5 ? 'negative' as const : 'neutral' as const,
      })),
      isWorldCup: true,
      predictedScore: analysis.predictedScore,
    };
  });
}

// ============================================
// CHALLENGES À GROSSES COTES
// ============================================

function getHighOddsChallenges(): ValueBet[] {
  const today = new Date();
  
  // Récupérer les value bets football avec grosses cotes
  const footballValueBets = getValueBetsFromFootball(40);
  
  const footballHighOdds = footballValueBets
    .filter(fb => fb.valueBet.odds >= 2.5)
    .map(fb => ({
      id: fb.id,
      sport: 'football' as const,
      match: `${fb.homeTeam} vs ${fb.awayTeam}`,
      league: LEAGUE_NAMES[fb.league] || fb.league,
      date: fb.date,
      betType: fb.valueBet.recommendedBet,
      odds: fb.valueBet.odds,
      ourProbability: fb.valueBet.ourProbability,
      bookmakerProbability: fb.valueBet.impliedProbability,
      valueGap: fb.valueBet.valueGap,
      valueScore: fb.valueBet.valueScore,
      confidence: fb.confidence,
      analysis: fb.insights.join(' '),
      factors: Object.entries(fb.factors).map(([key, factor]) => ({
        name: factor.description,
        impact: factor.score > 5 ? 'positive' as const : factor.score < -5 ? 'negative' as const : 'neutral' as const,
      })),
      isEuropeanLeague: true,
      predictedScore: fb.predictedScore,
    }));
  
  // Ajouter d'autres sports
  const otherHighOdds: ValueBet[] = [
    {
      id: 'high-odds-nba-001',
      sport: 'basketball',
      match: 'Lakers vs Warriors',
      league: 'NBA',
      date: new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString(),
      betType: 'Total > 235.5 points',
      odds: 2.80,
      ourProbability: 0.40,
      bookmakerProbability: 0.357,
      valueGap: 0.043,
      valueScore: 58,
      confidence: 'medium',
      analysis: 'Les Warriors jouent vite, les Lakers ont des failles défensives. Potentiel de score élevé.',
      factors: [
        { name: 'Rythme élevé Warriors', impact: 'positive' },
        { name: 'Défense Lakers perméable', impact: 'positive' },
        { name: 'Historique high-scoring', impact: 'neutral' },
      ],
    },
    {
      id: 'high-odds-tennis-001',
      sport: 'tennis',
      match: 'Outsider vs Favori',
      league: 'ATP 250',
      date: new Date(today.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString(),
      betType: 'Victoire Outsider',
      odds: 4.50,
      ourProbability: 0.28,
      bookmakerProbability: 0.222,
      valueGap: 0.058,
      valueScore: 62,
      confidence: 'low',
      analysis: 'Le favori revient de blessure et peut manquer de rythme. L\'outsider est en confiance après de bons résultats récents.',
      factors: [
        { name: 'Favori blessé', impact: 'positive' },
        { name: 'Outsider en forme', impact: 'positive' },
        { name: 'Risque inhérent', impact: 'negative' },
      ],
    },
  ];
  
  return [...footballHighOdds, ...otherHighOdds];
}

// ============================================
// HANDLERS
// ============================================

export async function GET() {
  try {
    // 1. Matchs amicaux de préparation Coupe du Monde
    const worldCupFriendliesMatches = getUpcomingWorldCupFriendlies();
    const worldCupFriendliesValueBets = getValueBetsFromFriendlies(worldCupFriendliesMatches, 40);
    
    const worldCupFriendlies: ValueBet[] = worldCupFriendliesValueBets.map((match) => ({
      id: match.id,
      sport: 'football' as const,
      match: `${match.homeTeam} vs ${match.awayTeam}`,
      league: 'Match Amical - Préparation CM 2026',
      date: match.date,
      betType: match.valueBet.recommendedBet,
      odds: match.valueBet.odds,
      ourProbability: match.valueBet.ourProbability,
      bookmakerProbability: match.valueBet.impliedProbability,
      valueGap: match.valueBet.valueGap,
      valueScore: match.valueBet.valueScore,
      confidence: match.confidence,
      analysis: match.insights.join(' '),
      factors: Object.entries(match.factors).map(([, factor]) => ({
        name: factor.description,
        impact: factor.score > 10 ? 'positive' as const : factor.score < -10 ? 'negative' as const : 'neutral' as const,
      })),
      isWorldCupFriendly: true,
    }));

    // 2. Matchs de la Coupe du Monde (phase finale)
    const worldCupMatches = getWorldCupMatches();

    // 3. Championnats européens
    const europeanMatches = getEuropeanLeagueMatches();

    // 4. Value bets tennis
    const tennisValueBets = getTennisValueBets();

    // 5. Challenges à grosses cotes
    const highOddsChallenges = getHighOddsChallenges();

    // Tous les value bets
    const allValueBets = [
      ...tennisValueBets,
      ...europeanMatches.filter(m => m.valueScore >= 50),
      ...worldCupMatches,
    ];

    // Réponse
    const response = {
      valueBets: allValueBets,
      europeanLeagues: europeanMatches,
      worldCupFriendlies,
      worldCupMatches,
      highOddsChallenges,
      lastUpdated: new Date().toISOString(),
      summary: {
        totalValueBets: allValueBets.length,
        europeanLeagues: europeanMatches.length,
        worldCupFriendlies: worldCupFriendlies.length,
        worldCupMatches: worldCupMatches.length,
        highConfidence: allValueBets.filter(b => b.confidence === 'high' || b.confidence === 'very_high').length,
        averageOdds: allValueBets.length > 0 
          ? (allValueBets.reduce((acc, b) => acc + b.odds, 0) / allValueBets.length).toFixed(2)
          : '0.00',
        byLeague: {
          ligue1: europeanMatches.filter(m => m.leagueId === 'ligue_1').length,
          premierLeague: europeanMatches.filter(m => m.leagueId === 'premier_league').length,
          laLiga: europeanMatches.filter(m => m.leagueId === 'la_liga').length,
          serieA: europeanMatches.filter(m => m.leagueId === 'serie_a').length,
          bundesliga: europeanMatches.filter(m => m.leagueId === 'bundesliga').length,
          championsLeague: europeanMatches.filter(m => m.leagueId === 'champions_league').length,
          worldCup: worldCupMatches.length,
          worldCupFriendlies: worldCupFriendlies.length,
        },
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Erreur lors de la récupération des challenges:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des données' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, matchId } = body;

    if (action === 'publish') {
      console.log(`Publishing challenge ${matchId} to Telegram...`);
      
      return NextResponse.json({
        success: true,
        message: `Challenge ${matchId} publié avec succès`,
      });
    }

    if (action === 'refresh') {
      return NextResponse.json({
        success: true,
        message: 'Données rafraîchies',
      });
    }

    return NextResponse.json(
      { error: 'Action non reconnue' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Erreur lors du traitement de la requête:', error);
    return NextResponse.json(
      { error: 'Erreur lors du traitement de la requête' },
      { status: 500 }
    );
  }
}
