import { NextResponse } from 'next/server';
import { 
  getUpcomingWorldCupFriendlies, 
  getValueBetsFromFriendlies,
  FriendlyMatch 
} from '@/lib/world-cup-friendly-analyzer';

// ============================================
// INTERFACES
// ============================================

interface ValueBet {
  id: string;
  sport: 'football' | 'tennis' | 'basketball' | 'hockey' | 'baseball';
  match: string;
  league: string;
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
}

// ============================================
// DONNÉES DE DÉMONSTRATION
// ============================================

// En production, ces données viendraient d'APIs externes ou de la base de données
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

function getHighOddsChallenges(): ValueBet[] {
  const today = new Date();
  
  return [
    {
      id: 'high-odds-001',
      sport: 'football',
      match: 'Équipe A vs Équipe B',
      league: 'Champions League',
      date: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      betType: 'Les deux marquent - Oui',
      odds: 3.20,
      ourProbability: 0.38,
      bookmakerProbability: 0.312,
      valueGap: 0.068,
      valueScore: 68,
      confidence: 'medium',
      analysis: 'Les deux équipes ont des attaques prolifiques mais des défenses perméables. Historique de matchs avec beaucoup de buts.',
      factors: [
        { name: 'Attaques fortes', impact: 'positive' },
        { name: 'Défenses faibles', impact: 'positive' },
        { name: 'Historique BTTS', impact: 'positive' },
      ],
    },
    {
      id: 'high-odds-002',
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
      id: 'high-odds-003',
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
}

// ============================================
// HANDLERS
// ============================================

export async function GET() {
  try {
    // 1. Récupérer les matchs amicaux de préparation Coupe du Monde
    const worldCupFriendliesMatches = getUpcomingWorldCupFriendlies();
    const worldCupFriendliesValueBets = getValueBetsFromFriendlies(worldCupFriendliesMatches, 40);
    
    // Transformer en format ValueBet
    const worldCupFriendlies: ValueBet[] = worldCupFriendliesValueBets.map((match) => ({
      id: match.id,
      sport: 'football' as const,
      match: `${match.homeTeam} vs ${match.awayTeam}`,
      league: 'Match Amical International',
      date: match.date,
      betType: match.valueBet.recommendedBet,
      odds: match.valueBet.odds,
      ourProbability: match.valueBet.ourProbability,
      bookmakerProbability: match.valueBet.impliedProbability,
      valueGap: match.valueBet.valueGap,
      valueScore: match.valueBet.valueScore,
      confidence: match.confidence,
      analysis: match.insights.join(' '),
      factors: Object.entries(match.factors).map(([key, factor]) => ({
        name: factor.description,
        impact: factor.score > 10 ? 'positive' as const : factor.score < -10 ? 'negative' as const : 'neutral' as const,
      })),
      isWorldCupFriendly: true,
    }));

    // 2. Récupérer les value bets tennis classiques
    const tennisValueBets = getTennisValueBets();

    // 3. Récupérer les challenges à grosses cotes
    const highOddsChallenges = getHighOddsChallenges();

    // 4. Construire la réponse
    const response = {
      valueBets: tennisValueBets,
      worldCupFriendlies,
      highOddsChallenges,
      lastUpdated: new Date().toISOString(),
      summary: {
        totalValueBets: tennisValueBets.length + worldCupFriendlies.length + highOddsChallenges.length,
        highConfidence: [...tennisValueBets, ...worldCupFriendlies, ...highOddsChallenges]
          .filter(b => b.confidence === 'high' || b.confidence === 'very_high').length,
        averageOdds: (
          [...tennisValueBets, ...worldCupFriendlies, ...highOddsChallenges]
            .reduce((acc, b) => acc + b.odds, 0) / 
          (tennisValueBets.length + worldCupFriendlies.length + highOddsChallenges.length || 1)
        ).toFixed(2),
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
      // Publier un challenge sur Telegram
      // En production, cela appellerait le service Telegram
      console.log(`Publishing challenge ${matchId} to Telegram...`);
      
      return NextResponse.json({
        success: true,
        message: `Challenge ${matchId} publié avec succès`,
      });
    }

    if (action === 'refresh') {
      // Forcer le rafraîchissement des données
      // En production, cela invaliderait le cache
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
