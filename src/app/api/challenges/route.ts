import { NextResponse } from 'next/server';

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
// DONNÉES DE DÉMONSTRATION
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

function getEuropeanLeagueMatches(): ValueBet[] {
  const today = new Date();
  
  return [
    // Ligue 1
    {
      id: 'ligue1-001',
      sport: 'football',
      match: 'PSG vs Marseille',
      league: 'Ligue 1',
      leagueId: 'ligue_1',
      date: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      betType: 'Victoire PSG',
      odds: 1.45,
      ourProbability: 0.65,
      bookmakerProbability: 0.69,
      valueGap: -0.04,
      valueScore: 45,
      confidence: 'high',
      analysis: 'PSG dominate à domicile contre son rival. Marseille en difficulté cette saison.',
      factors: [
        { name: 'Avantage domicile', impact: 'positive' },
        { name: 'Forme PSG excellente', impact: 'positive' },
        { name: 'Rivalité intense', impact: 'neutral' },
      ],
      isEuropeanLeague: true,
      predictedScore: { home: 2, away: 1 },
    },
    {
      id: 'ligue1-002',
      sport: 'football',
      match: 'Lyon vs Monaco',
      league: 'Ligue 1',
      leagueId: 'ligue_1',
      date: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      betType: 'Les deux marquent',
      odds: 1.75,
      ourProbability: 0.62,
      bookmakerProbability: 0.57,
      valueGap: 0.05,
      valueScore: 58,
      confidence: 'medium',
      analysis: 'Deux équipes offensives avec des défenses perméables. BTTS probable.',
      factors: [
        { name: 'Attaques performantes', impact: 'positive' },
        { name: 'Défenses fragiles', impact: 'positive' },
      ],
      isEuropeanLeague: true,
      predictedScore: { home: 2, away: 2 },
    },
    
    // Premier League
    {
      id: 'pl-001',
      sport: 'football',
      match: 'Manchester City vs Liverpool',
      league: 'Premier League',
      leagueId: 'premier_league',
      date: new Date(today.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString(),
      betType: 'Over 2.5 buts',
      odds: 1.65,
      ourProbability: 0.68,
      bookmakerProbability: 0.61,
      valueGap: 0.07,
      valueScore: 62,
      confidence: 'high',
      analysis: 'Match au sommet entre deux attaques prolifiques. Beaucoup de buts attendus.',
      factors: [
        { name: 'Attaques redoutables', impact: 'positive' },
        { name: 'Historique high-scoring', impact: 'positive' },
        { name: 'Enjeu majeur', impact: 'positive' },
      ],
      isEuropeanLeague: true,
      predictedScore: { home: 3, away: 2 },
    },
    {
      id: 'pl-002',
      sport: 'football',
      match: 'Arsenal vs Chelsea',
      league: 'Premier League',
      leagueId: 'premier_league',
      date: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      betType: 'Victoire Arsenal',
      odds: 1.75,
      ourProbability: 0.60,
      bookmakerProbability: 0.57,
      valueGap: 0.03,
      valueScore: 52,
      confidence: 'medium',
      analysis: 'Arsenal en grande forme à domicile. Chelsea en reconstruction.',
      factors: [
        { name: 'Forme Arsenal', impact: 'positive' },
        { name: 'Avantage domicile', impact: 'positive' },
      ],
      isEuropeanLeague: true,
      predictedScore: { home: 2, away: 1 },
    },
    
    // La Liga
    {
      id: 'laliga-001',
      sport: 'football',
      match: 'Real Madrid vs Barcelona',
      league: 'La Liga',
      leagueId: 'la_liga',
      date: new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString(),
      betType: 'Les deux marquent',
      odds: 1.55,
      ourProbability: 0.70,
      bookmakerProbability: 0.65,
      valueGap: 0.05,
      valueScore: 55,
      confidence: 'high',
      analysis: 'El Clásico - les deux équipes marquent presque systématiquement.',
      factors: [
        { name: 'Historique BTTS', impact: 'positive' },
        { name: 'Attaques de classe mondiale', impact: 'positive' },
      ],
      isEuropeanLeague: true,
      predictedScore: { home: 2, away: 2 },
    },
    
    // Serie A
    {
      id: 'seriea-001',
      sport: 'football',
      match: 'Inter Milan vs AC Milan',
      league: 'Serie A',
      leagueId: 'serie_a',
      date: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      betType: 'Victoire Inter',
      odds: 1.90,
      ourProbability: 0.58,
      bookmakerProbability: 0.53,
      valueGap: 0.05,
      valueScore: 56,
      confidence: 'medium',
      analysis: 'Derby della Madonnina. Inter solide cette saison.',
      factors: [
        { name: 'Forme Inter supérieure', impact: 'positive' },
        { name: 'Joue à domicile', impact: 'positive' },
      ],
      isEuropeanLeague: true,
      predictedScore: { home: 2, away: 1 },
    },
    
    // Bundesliga
    {
      id: 'bundesliga-001',
      sport: 'football',
      match: 'Bayern Munich vs Borussia Dortmund',
      league: 'Bundesliga',
      leagueId: 'bundesliga',
      date: new Date(today.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString(),
      betType: 'Victoire Bayern',
      odds: 1.55,
      ourProbability: 0.68,
      bookmakerProbability: 0.65,
      valueGap: 0.03,
      valueScore: 50,
      confidence: 'high',
      analysis: 'Der Klassiker. Bayern dominate historiquement à domicile.',
      factors: [
        { name: 'Historique favorable Bayern', impact: 'positive' },
        { name: 'Avantage Allianz Arena', impact: 'positive' },
      ],
      isEuropeanLeague: true,
      predictedScore: { home: 3, away: 1 },
    },
    
    // Champions League
    {
      id: 'cl-001',
      sport: 'football',
      match: 'Real Madrid vs Manchester City',
      league: 'Champions League',
      leagueId: 'champions_league',
      date: new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      betType: 'Over 2.5 buts',
      odds: 1.70,
      ourProbability: 0.65,
      bookmakerProbability: 0.59,
      valueGap: 0.06,
      valueScore: 60,
      confidence: 'high',
      analysis: 'Affiche européenne au sommet. Les deux équipes pratiquent un football offensif.',
      factors: [
        { name: 'Attaques redoutables', impact: 'positive' },
        { name: 'Enjeu éliminatoire', impact: 'positive' },
      ],
      isEuropeanLeague: true,
      predictedScore: { home: 2, away: 2 },
    },
  ];
}

function getWorldCupFriendlies(): ValueBet[] {
  const today = new Date();
  
  return [
    {
      id: 'wc-friendly-001',
      sport: 'football',
      match: 'France vs Germany',
      league: 'Match Amical - Préparation CM 2026',
      date: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      betType: 'Les deux marquent',
      odds: 1.85,
      ourProbability: 0.60,
      bookmakerProbability: 0.54,
      valueGap: 0.06,
      valueScore: 58,
      confidence: 'medium',
      analysis: 'Match de préparation entre deux favoris. Les deux équipes testent leurs systèmes offensifs.',
      factors: [
        { name: 'Équipes offensives', impact: 'positive' },
        { name: 'Enjeu faible (amical)', impact: 'neutral' },
      ],
      isWorldCupFriendly: true,
      predictedScore: { home: 2, away: 1 },
    },
    {
      id: 'wc-friendly-002',
      sport: 'football',
      match: 'Brazil vs Argentina',
      league: 'Match Amical - Préparation CM 2026',
      date: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      betType: 'Over 2.5 buts',
      odds: 2.00,
      ourProbability: 0.55,
      bookmakerProbability: 0.50,
      valueGap: 0.05,
      valueScore: 55,
      confidence: 'medium',
      analysis: 'Superclásico sudaméricain. Match toujours intense même en amical.',
      factors: [
        { name: 'Rivalité historique', impact: 'positive' },
        { name: 'Joueurs offensifs', impact: 'positive' },
      ],
      isWorldCupFriendly: true,
      predictedScore: { home: 2, away: 2 },
    },
    {
      id: 'wc-friendly-003',
      sport: 'football',
      match: 'England vs Netherlands',
      league: 'Match Amical - Préparation CM 2026',
      date: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      betType: 'Victoire Angleterre',
      odds: 2.20,
      ourProbability: 0.50,
      bookmakerProbability: 0.45,
      valueGap: 0.05,
      valueScore: 52,
      confidence: 'medium',
      analysis: 'Angleterre à domicile avec une équipe très talentueuse.',
      factors: [
        { name: 'Avantage domicile', impact: 'positive' },
        { name: 'Effectif renforcé', impact: 'positive' },
      ],
      isWorldCupFriendly: true,
      predictedScore: { home: 2, away: 1 },
    },
  ];
}

function getWorldCupMatches(): ValueBet[] {
  const today = new Date();
  
  return [
    {
      id: 'wc-001',
      sport: 'football',
      match: 'France vs Brazil',
      league: 'Coupe du Monde FIFA',
      leagueId: 'world_cup',
      date: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      betType: 'Match nul',
      odds: 3.20,
      ourProbability: 0.35,
      bookmakerProbability: 0.31,
      valueGap: 0.04,
      valueScore: 48,
      confidence: 'low',
      analysis: 'Match équilibré entre deux favoris. Possible prolongations.',
      factors: [
        { name: 'Niveau équivalent', impact: 'positive' },
        { name: 'Enjeu éliminatoire', impact: 'neutral' },
      ],
      isWorldCup: true,
      predictedScore: { home: 1, away: 1 },
    },
  ];
}

function getHighOddsChallenges(): ValueBet[] {
  const today = new Date();
  
  return [
    {
      id: 'high-odds-001',
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
      id: 'high-odds-002',
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
      analysis: 'Le favori revient de blessure et peut manquer de rythme.',
      factors: [
        { name: 'Favori blessé', impact: 'positive' },
        { name: 'Outsider en forme', impact: 'positive' },
        { name: 'Risque inhérent', impact: 'negative' },
      ],
    },
  ];
}

// ============================================
// HANDLER PRINCIPAL
// ============================================

export async function GET() {
  try {
    // Récupérer toutes les données
    const tennisValueBets = getTennisValueBets();
    const europeanMatches = getEuropeanLeagueMatches();
    const worldCupFriendlies = getWorldCupFriendlies();
    const worldCupMatches = getWorldCupMatches();
    const highOddsChallenges = getHighOddsChallenges();

    // Tous les value bets
    const allValueBets = [
      ...tennisValueBets,
      ...europeanMatches.filter(m => m.valueScore >= 50),
      ...worldCupFriendlies,
      ...worldCupMatches,
    ];

    // Calculer les statistiques
    const totalValueBets = allValueBets.length;
    const highConfidence = allValueBets.filter(b => b.confidence === 'high' || b.confidence === 'very_high').length;
    const averageOdds = totalValueBets > 0 
      ? (allValueBets.reduce((acc, b) => acc + b.odds, 0) / totalValueBets).toFixed(2)
      : '0.00';

    // Réponse
    const response = {
      valueBets: allValueBets,
      europeanLeagues: europeanMatches,
      worldCupFriendlies,
      worldCupMatches,
      highOddsChallenges,
      lastUpdated: new Date().toISOString(),
      summary: {
        totalValueBets,
        europeanLeagues: europeanMatches.length,
        worldCupFriendlies: worldCupFriendlies.length,
        worldCupMatches: worldCupMatches.length,
        highConfidence,
        averageOdds,
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
      { error: 'Erreur lors de la récupération des données', details: String(error) },
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
