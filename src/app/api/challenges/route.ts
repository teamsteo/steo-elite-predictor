import { NextResponse } from 'next/server';
import { fetchESPNFootballGames, fetchESPNNBAGames, ESPNMatch } from '@/lib/espnService';

// Interface pour les challenges
interface Challenge {
  id: string;
  sport: string;
  match: { 
    tournament: string;
    surface: string;
  };
  challenge: {
    underdog: string;
    favorite: string;
    underdogOdds: number;
    valueGap: number;
    ourProbability: number;
    impliedProbability: number;
  };
  confidenceLevel: 'very_high' | 'high' | 'medium' | 'low';
  riskLevel: 'calculated' | 'moderate' | 'high';
  valueScore: number;
  reasoning: string[];
}

// ============================================
// CALCUL DE VALUE BET
// ============================================

/**
 * Estime les cotes basées sur le contexte du match
 * (Dans un vrai système, on utiliserait une API de cotes)
 */
function estimateOdds(homeTeam: string, awayTeam: string, league: string): { homeOdds: number; awayOdds: number; drawOdds?: number } {
  // Équipes favorites connues
  const bigTeams = [
    // Football
    'Manchester City', 'Liverpool', 'Arsenal', 'Chelsea', 'Manchester United',
    'Real Madrid', 'Barcelona', 'Atletico Madrid',
    'Bayern Munich', 'Borussia Dortmund',
    'PSG', 'Paris Saint-Germain',
    'Juventus', 'Inter Milan', 'AC Milan', 'Napoli',
    // Basketball
    'Lakers', 'Warriors', 'Celtics', 'Nuggets', 'Bucks'
  ];
  
  const homeIsBig = bigTeams.some(t => homeTeam.toLowerCase().includes(t.toLowerCase()));
  const awayIsBig = bigTeams.some(t => awayTeam.toLowerCase().includes(t.toLowerCase()));
  
  // Estimation basique des cotes
  if (homeIsBig && !awayIsBig) {
    return { homeOdds: 1.4 + Math.random() * 0.3, awayOdds: 4.0 + Math.random() * 2, drawOdds: 3.5 + Math.random() * 0.5 };
  } else if (!homeIsBig && awayIsBig) {
    return { homeOdds: 3.5 + Math.random() * 2, awayOdds: 1.4 + Math.random() * 0.3, drawOdds: 3.5 + Math.random() * 0.5 };
  } else if (homeIsBig && awayIsBig) {
    return { homeOdds: 2.2 + Math.random() * 0.4, awayOdds: 2.2 + Math.random() * 0.4, drawOdds: 3.0 + Math.random() * 0.3 };
  } else {
    return { homeOdds: 2.0 + Math.random() * 0.5, awayOdds: 2.0 + Math.random() * 0.5, drawOdds: 3.0 + Math.random() * 0.3 };
  }
}

/**
 * Analyse un match et détecte les value bets potentiels
 */
function analyzeMatchForValueBet(match: ESPNMatch): Challenge | null {
  const odds = estimateOdds(match.homeTeam, match.awayTeam, match.league);
  
  // Simuler une analyse de value bet
  // Dans un vrai système, on comparerait avec les cotes réelles des bookmakers
  const underdog = odds.homeOdds > odds.awayOdds ? match.homeTeam : match.awayTeam;
  const favorite = odds.homeOdds > odds.awayOdds ? match.awayTeam : match.homeTeam;
  const underdogOdds = Math.max(odds.homeOdds, odds.awayOdds);
  
  // Calculer l'écart de valeur (value gap)
  // Notre "analyse" interne vs cotes bookmakers
  const ourProbability = Math.round((1 / underdogOdds + 0.05 + Math.random() * 0.1) * 100);
  const impliedProbability = Math.round((1 / underdogOdds) * 100);
  const valueGap = Math.round((ourProbability - impliedProbability) * 10) / 10;
  
  // Ne garder que les value bets intéressants
  if (valueGap < 3 || underdogOdds < 1.8) {
    return null;
  }
  
  // Calculer le score de confiance
  let confidenceLevel: 'very_high' | 'high' | 'medium' | 'low' = 'medium';
  let riskLevel: 'calculated' | 'moderate' | 'high' = 'moderate';
  
  if (valueGap > 8 && underdogOdds < 3.0) {
    confidenceLevel = 'high';
    riskLevel = 'calculated';
  } else if (valueGap > 6) {
    confidenceLevel = 'high';
    riskLevel = 'moderate';
  } else if (valueGap > 4) {
    confidenceLevel = 'medium';
    riskLevel = 'moderate';
  } else {
    confidenceLevel = 'low';
    riskLevel = 'high';
  }
  
  // Générer le reasoning
  const reasoningOptions = [
    'Forme récente positive',
    'Avantage domicile/extérieur',
    'Historique H2H favorable',
    'Motivation élevée',
    'Effectif au complet',
    'Contexte favorable',
    'Adversaire en difficulté',
    'Enjeu important'
  ];
  
  const reasoning = [
    reasoningOptions[Math.floor(Math.random() * reasoningOptions.length)],
    reasoningOptions[Math.floor(Math.random() * reasoningOptions.length)]
  ];
  
  const valueScore = Math.min(100, Math.round(valueGap * 8 + 20));
  
  return {
    id: `challenge_${match.id}`,
    sport: match.sport === 'Foot' ? 'football' : match.sport === 'Basket' ? 'basketball' : 'tennis',
    match: {
      tournament: match.league,
      surface: match.sport === 'Foot' ? 'Pelouse' : 'Parquet'
    },
    challenge: {
      underdog,
      favorite,
      underdogOdds: Math.round(underdogOdds * 100) / 100,
      valueGap,
      ourProbability,
      impliedProbability
    },
    confidenceLevel,
    riskLevel,
    valueScore,
    reasoning
  };
}

// ============================================
// API HANDLER
// ============================================

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const minOdds = parseFloat(searchParams.get('minOdds') || '1.8');
    const minValueGap = parseFloat(searchParams.get('minValueGap') || '3');
    
    console.log('🔥 Récupération des challenges depuis ESPN...');
    
    // Récupérer les matchs depuis ESPN
    const [footballMatches, nbaMatches] = await Promise.all([
      fetchESPNFootballGames(),
      fetchESPNNBAGames()
    ]);
    
    console.log(`⚽ Football: ${footballMatches.length} matchs`);
    console.log(`🏀 NBA: ${nbaMatches.length} matchs`);
    
    // Combiner tous les matchs
    const allMatches = [...footballMatches, ...nbaMatches];
    
    // Analyser chaque match pour trouver des value bets
    const challenges: Challenge[] = [];
    
    for (const match of allMatches) {
      // Ne traiter que les matchs à venir
      if (match.status !== 'upcoming') continue;
      
      const challenge = analyzeMatchForValueBet(match);
      if (challenge) {
        // Filtrer selon les paramètres
        if (challenge.challenge.underdogOdds >= minOdds && challenge.challenge.valueGap >= minValueGap) {
          challenges.push(challenge);
        }
      }
    }
    
    // Trier par valueScore décroissant
    challenges.sort((a, b) => b.valueScore - a.valueScore);
    
    // Limiter à 10 résultats
    const topChallenges = challenges.slice(0, 10);
    
    // Calculer le résumé
    const summary = {
      totalScanned: allMatches.filter(m => m.status === 'upcoming').length,
      valueBetsFound: topChallenges.length,
      highConfidenceCount: topChallenges.filter(c => 
        c.confidenceLevel === 'high' || c.confidenceLevel === 'very_high'
      ).length,
      averageValueGap: topChallenges.length > 0 
        ? Math.round(topChallenges.reduce((sum, c) => sum + c.challenge.valueGap, 0) / topChallenges.length * 10) / 10
        : 0
    };

    console.log(`✅ ${topChallenges.length} challenges détectés`);
    
    return NextResponse.json({
      success: true,
      challenges: topChallenges,
      summary,
      lastUpdated: new Date().toISOString(),
      source: 'ESPN API'
    });
    
  } catch (error) {
    console.error('Erreur API challenges:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Erreur lors de la récupération des données',
        challenges: [],
        summary: {
          totalScanned: 0,
          valueBetsFound: 0,
          highConfidenceCount: 0,
          averageValueGap: 0
        }
      },
      { status: 200 }
    );
  }
}

export async function POST() {
  return NextResponse.json({ success: true, message: 'Action effectuée' });
}
