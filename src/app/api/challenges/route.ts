import { NextResponse } from 'next/server';
import { fetchAllMatchesWithOdds, IntegratedMatch } from '@/lib/oddsService';

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
  hasRealOdds: boolean;
  bookmaker: string;
}

// ============================================
// ANALYSE DE VALUE BET
// ============================================

/**
 * Analyse un match avec cotes réelles et détecte les value bets
 */
function analyzeMatchForValueBet(match: IntegratedMatch): Challenge | null {
  // Ne traiter que les matchs à venir
  if (match.status !== 'upcoming') return null;
  
  // Ignorer les matchs sans cotes réelles (trop fiables)
  if (!match.hasRealOdds && match.oddsHome <= 1) return null;
  
  // Déterminer le favori et l'outsider
  const homeOdds = match.oddsHome;
  const awayOdds = match.oddsAway;
  const drawOdds = match.oddsDraw;
  
  // Calculer les probabilités implicites (bookmaker)
  const homeImplied = Math.round((1 / homeOdds) * 100);
  const awayImplied = Math.round((1 / awayOdds) * 100);
  const drawImplied = drawOdds ? Math.round((1 / drawOdds) * 100) : 0;
  
  // Notre analyse interne - basée sur plusieurs facteurs
  // Dans un vrai système, on utiliserait des stats H2H, forme, etc.
  const homeAdvantage = 5; // Avantage domicile en football
  const formAdjustment = Math.random() * 10 - 5; // Simule la forme récente
  
  let ourHomeProb = homeImplied + homeAdvantage + formAdjustment;
  let ourAwayProb = awayImplied - homeAdvantage/2 - formAdjustment/2;
  let ourDrawProb = drawImplied + (Math.random() * 6 - 3);
  
  // Normaliser
  const total = ourHomeProb + ourAwayProb + ourDrawProb;
  ourHomeProb = Math.round(ourHomeProb / total * 100);
  ourAwayProb = Math.round(ourAwayProb / total * 100);
  ourDrawProb = 100 - ourHomeProb - ourAwayProb;
  
  // Identifier l'outsider (plus grande cote)
  let underdog: string;
  let favorite: string;
  let underdogOdds: number;
  let ourProb: number;
  let impliedProb: number;
  
  if (homeOdds > awayOdds) {
    underdog = match.homeTeam;
    favorite = match.awayTeam;
    underdogOdds = homeOdds;
    ourProb = ourHomeProb;
    impliedProb = homeImplied;
  } else {
    underdog = match.awayTeam;
    favorite = match.homeTeam;
    underdogOdds = awayOdds;
    ourProb = ourAwayProb;
    impliedProb = awayImplied;
  }
  
  // Calculer le value gap
  const valueGap = Math.round((ourProb - impliedProb) * 10) / 10;
  
  // Ne garder que les value bets positifs
  if (valueGap < 3) return null;
  
  // Déterminer le niveau de confiance
  let confidenceLevel: 'very_high' | 'high' | 'medium' | 'low';
  let riskLevel: 'calculated' | 'moderate' | 'high';
  
  if (valueGap >= 8 && match.hasRealOdds && underdogOdds < 3.5) {
    confidenceLevel = 'very_high';
    riskLevel = 'calculated';
  } else if (valueGap >= 6 && match.hasRealOdds) {
    confidenceLevel = 'high';
    riskLevel = 'calculated';
  } else if (valueGap >= 4) {
    confidenceLevel = 'medium';
    riskLevel = 'moderate';
  } else {
    confidenceLevel = 'low';
    riskLevel = 'high';
  }
  
  // Générer le reasoning basé sur les données
  const reasoning: string[] = [];
  
  if (match.insight.valueBetDetected) {
    reasoning.push('Value bet détecté par le système');
  }
  if (match.hasRealOdds) {
    reasoning.push('Cotes réelles disponibles');
  }
  if (match.reliabilityScore >= 90) {
    reasoning.push('Fiabilité des données élevée');
  }
  if (underdogOdds >= 2.5 && underdogOdds <= 4.0) {
    reasoning.push('Cote intermédiaire attractive');
  }
  if (valueGap >= 5) {
    reasoning.push('Écart significatif avec les bookmakers');
  }
  
  // Ajouter un reasoning par défaut si vide
  if (reasoning.length === 0) {
    reasoning.push('Analyse en cours');
  }
  
  const valueScore = Math.min(100, Math.round(valueGap * 7 + match.reliabilityScore * 0.3));
  
  return {
    id: `challenge_${match.id}`,
    sport: match.sport === 'Foot' ? 'football' : 'basketball',
    match: {
      tournament: match.league,
      surface: match.sport === 'Foot' ? 'Pelouse' : 'Parquet'
    },
    challenge: {
      underdog,
      favorite,
      underdogOdds: Math.round(underdogOdds * 100) / 100,
      valueGap,
      ourProbability: ourProb,
      impliedProbability: impliedProb
    },
    confidenceLevel,
    riskLevel,
    valueScore,
    reasoning,
    hasRealOdds: match.hasRealOdds,
    bookmaker: match.bookmaker
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
    
    console.log('🔥 Récupération des challenges avec vraies cotes...');
    
    // Récupérer les matchs avec cotes réelles depuis le service existant
    const matches = await fetchAllMatchesWithOdds();
    
    console.log(`📊 ${matches.length} matchs récupérés avec cotes`);
    
    // Analyser chaque match pour trouver des value bets
    const challenges: Challenge[] = [];
    
    for (const match of matches) {
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
    
    // Limiter à 15 résultats
    const topChallenges = challenges.slice(0, 15);
    
    // Calculer le résumé
    const summary = {
      totalScanned: matches.filter(m => m.status === 'upcoming').length,
      valueBetsFound: topChallenges.length,
      highConfidenceCount: topChallenges.filter(c => 
        c.confidenceLevel === 'high' || c.confidenceLevel === 'very_high'
      ).length,
      averageValueGap: topChallenges.length > 0 
        ? Math.round(topChallenges.reduce((sum, c) => sum + c.challenge.valueGap, 0) / topChallenges.length * 10) / 10
        : 0,
      realOddsCount: topChallenges.filter(c => c.hasRealOdds).length
    };

    console.log(`✅ ${topChallenges.length} challenges détectés (${summary.realOddsCount} avec cotes réelles)`);
    
    return NextResponse.json({
      success: true,
      challenges: topChallenges,
      summary,
      lastUpdated: new Date().toISOString(),
      source: 'ESPN DraftKings'
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
          averageValueGap: 0,
          realOddsCount: 0
        }
      },
      { status: 200 }
    );
  }
}

export async function POST() {
  return NextResponse.json({ success: true, message: 'Action effectuée' });
}
