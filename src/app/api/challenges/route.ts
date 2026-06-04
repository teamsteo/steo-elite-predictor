import { NextResponse } from 'next/server';
import { getMatchesWithRealOdds } from '@/lib/combinedDataService';
import { getUnifiedPrediction, UnifiedPrediction } from '@/lib/unifiedPredictionService';

// ============================================
// INTERFACES
// ============================================

export interface Challenge {
  id: string;
  sport: 'football' | 'basketball' | 'hockey' | 'tennis';
  league: string;
  
  // Match info
  homeTeam: string;
  awayTeam: string;
  date: string;
  displayDate?: string;
  
  // Odds
  oddsHome: number;
  oddsAway: number;
  oddsDraw: number | null;
  bookmaker: string;
  hasRealOdds: boolean;
  
  // Analysis
  recommendation: 'home' | 'away' | 'draw' | 'avoid';
  recommendedTeam: string;
  winProbability: number;
  edge: number;
  
  // Value bet detection
  isValueBet: boolean;
  valueBetType: 'home' | 'away' | 'draw' | null;
  expectedValue: number;
  kellyStake: number;
  
  // Confidence & Risk
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  riskLevel: 'low' | 'medium' | 'high';
  riskPercentage: number;
  
  // Score
  valueScore: number;
  
  // Reasoning
  reasoning: string[];
  factors: {
    formAdvantage: 'home' | 'away' | 'neutral';
    oddsValue: 'high' | 'medium' | 'low';
    dataQuality: number;
  };
  
  // Status
  status: 'take' | 'consider' | 'rejected';
}

interface ChallengesSummary {
  totalScanned: number;
  valueBetsFound: number;
  highConfidenceCount: number;
  averageEdge: number;
  realOddsCount: number;
  bySport: {
    football: number;
    basketball: number;
    hockey: number;
    tennis: number;
  };
  byConfidence: {
    very_high: number;
    high: number;
    medium: number;
    low: number;
  };
}

// ============================================
// VALUE BET ANALYSIS
// ============================================

/**
 * Analyse un match et détecte les value bets en utilisant le système ML unifié
 */
async function analyzeMatchForChallenge(match: any): Promise<Challenge | null> {
  // Ne traiter que les matchs à venir
  if (match.status === 'finished' || match.isFinished) return null;
  
  // Vérifier les cotes minimales
  if (!match.oddsHome || !match.oddsAway || match.oddsHome <= 1 || match.oddsAway <= 1) {
    return null;
  }
  
  try {
    // Utiliser le service de prédiction unifié
    const prediction = await getUnifiedPrediction({
      id: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      sport: match.sport === 'Basket' || match.sport === 'NBA' ? 'NBA' : 
             match.sport === 'NHL' || match.sport === 'Hockey' ? 'NHL' : 'Foot',
      league: match.league || 'Unknown',
      oddsHome: match.oddsHome,
      oddsDraw: match.oddsDraw,
      oddsAway: match.oddsAway,
    });
    
    // Ne garder que les value bets avec une edge positive
    if (prediction.mlPrediction.edge < 3) return null;
    
    // Ne garder que les recommandations non-avoid
    if (prediction.recommendation.bet === 'avoid') return null;
    
    // Calculer le value score
    const valueScore = calculateValueScore(prediction);
    
    // Déterminer l'équipe recommandée
    const recommendedTeam = prediction.recommendation.bet === 'home' ? match.homeTeam :
                           prediction.recommendation.bet === 'away' ? match.awayTeam :
                           'Match Nul';
    
    // Construire les facteurs
    const factors: { formAdvantage: 'home' | 'away' | 'neutral'; oddsValue: 'high' | 'medium' | 'low'; dataQuality: number } = {
      formAdvantage: prediction.factors.form.home > prediction.factors.form.away + 10 ? 'home' :
                     prediction.factors.form.away > prediction.factors.form.home + 10 ? 'away' : 'neutral',
      oddsValue: prediction.mlPrediction.edge > 8 ? 'high' :
                 prediction.mlPrediction.edge > 5 ? 'medium' : 'low',
      dataQuality: prediction.dataQuality.score,
    };
    
    // Déterminer le niveau de risque
    const riskLevel = prediction.recommendation.riskLevel;
    const riskPercentage = 100 - Math.round(prediction.mlPrediction[prediction.recommendation.bet === 'home' ? 'homeProb' : 
                                            prediction.recommendation.bet === 'away' ? 'awayProb' : 'drawProb'] as number);
    
    return {
      id: `challenge_${match.id}`,
      sport: match.sport?.toLowerCase().includes('basket') || match.sport?.toLowerCase().includes('nba') ? 'basketball' :
             match.sport?.toLowerCase().includes('nhl') || match.sport?.toLowerCase().includes('hockey') ? 'hockey' : 'football',
      league: match.league || 'Unknown',
      
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      date: match.date,
      displayDate: match.displayDate,
      
      oddsHome: match.oddsHome,
      oddsAway: match.oddsAway,
      oddsDraw: match.oddsDraw,
      bookmaker: match.bookmaker || 'ESPN',
      hasRealOdds: match.hasRealOdds || false,
      
      recommendation: prediction.recommendation.bet,
      recommendedTeam,
      winProbability: Math.round(prediction.mlPrediction[prediction.recommendation.bet === 'home' ? 'homeProb' : 
                                 prediction.recommendation.bet === 'away' ? 'awayProb' : 'drawProb'] as number),
      edge: prediction.mlPrediction.edge,
      
      isValueBet: prediction.mlPrediction.valueBet,
      valueBetType: prediction.mlPrediction.valueBetType,
      expectedValue: prediction.recommendation.expectedValue,
      kellyStake: prediction.recommendation.kellyStake,
      
      confidence: prediction.mlPrediction.confidence,
      riskLevel,
      riskPercentage,
      
      valueScore,
      
      reasoning: prediction.recommendation.reasoning,
      factors,
      
      status: prediction.recommendation.status,
    };
    
  } catch (error) {
    console.error(`Erreur analyse match ${match.homeTeam} vs ${match.awayTeam}:`, error);
    return null;
  }
}

/**
 * Calcule un score de value bet (0-100)
 */
function calculateValueScore(prediction: UnifiedPrediction): number {
  let score = 0;
  
  // Edge (40 points max)
  score += Math.min(40, prediction.mlPrediction.edge * 4);
  
  // Confiance (30 points max)
  const confidencePoints = {
    very_high: 30,
    high: 25,
    medium: 15,
    low: 5,
  };
  score += confidencePoints[prediction.mlPrediction.confidence];
  
  // Qualité des données (20 points max)
  score += Math.min(20, prediction.dataQuality.score * 0.2);
  
  // Value bet détecté (10 points)
  if (prediction.mlPrediction.valueBet) {
    score += 10;
  }
  
  return Math.min(100, Math.round(score));
}

/**
 * Convertit une prédiction tennis en Challenge
 */
function convertTennisToChallenge(match: any): Challenge | null {
  if (!match.predictedResult || !match.winProbability) return null;
  
  const confidence = match.confidence || 'medium';
  const riskPercentage = match.riskPercentage || 50;
  
  // Calculer le value score pour le tennis
  let valueScore = 0;
  valueScore += Math.min(40, (match.edge || 0) * 4);
  const confidencePoints: Record<string, number> = { very_high: 30, high: 25, medium: 15, low: 5 };
  valueScore += confidencePoints[confidence] || 15;
  if (match.valueBet) valueScore += 10;
  valueScore = Math.min(100, Math.round(valueScore));
  
  // Déterminer le niveau de risque
  const riskLevel = riskPercentage <= 30 ? 'low' : riskPercentage <= 50 ? 'medium' : 'high';
  
  return {
    id: `challenge_${match.id}`,
    sport: 'tennis',
    league: match.league || 'Tennis',
    
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    date: match.date,
    
    oddsHome: match.oddsHome || 1,
    oddsAway: match.oddsAway || 1,
    oddsDraw: null,
    bookmaker: 'Tennis API',
    hasRealOdds: match.hasRealOdds || false,
    
    recommendation: match.predictedResult,
    recommendedTeam: match.recommendation || match.homeTeam,
    winProbability: match.winProbability,
    edge: match.edge || 0,
    
    isValueBet: match.valueBet || false,
    valueBetType: match.valueBet ? match.predictedResult : null,
    expectedValue: match.edge || 0,
    kellyStake: 0,
    
    confidence,
    riskLevel,
    riskPercentage,
    
    valueScore,
    
    reasoning: [`Tennis prediction with ${match.winProbability}% win probability`],
    factors: {
      formAdvantage: 'neutral',
      oddsValue: match.edge > 8 ? 'high' : match.edge > 5 ? 'medium' : 'low',
      dataQuality: 80,
    },
    
    status: match.valueBet ? 'take' : 'consider',
  };
}

// ============================================
// API HANDLERS
// ============================================

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const minEdge = parseFloat(searchParams.get('minEdge') || '3');
    const minOdds = parseFloat(searchParams.get('minOdds') || '1.5');
    const maxOdds = parseFloat(searchParams.get('maxOdds') || '10');
    const sport = searchParams.get('sport') || 'all';
    const confidence = searchParams.get('confidence') || 'all';
    
    console.log('🎯 Récupération des challenges...');
    
    // Récupérer les matchs avec cotes réelles (football, basket, hockey)
    const matches = await getMatchesWithRealOdds();
    console.log(`📊 ${matches.length} matchs récupérés (foot/basket/hockey)`);
    
    // 🎾 Récupérer aussi les prédictions tennis
    let tennisMatches: any[] = [];
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'http://localhost:3000';
      const tennisResponse = await fetch(`${baseUrl}/api/tennis`, { cache: 'no-store' });
      if (tennisResponse.ok) {
        const tennisData = await tennisResponse.json();
        tennisMatches = (tennisData.predictions || []).map((p: any) => ({
          id: p.matchId,
          homeTeam: p.player1,
          awayTeam: p.player2,
          sport: 'Tennis',
          league: p.tournament,
          date: p.date,
          oddsHome: p.odds1,
          oddsAway: p.odds2,
          oddsDraw: null,
          hasRealOdds: p.odds1 > 1 && p.odds2 > 1,
          status: 'scheduled',
          // Map tennis prediction data
          predictedResult: p.prediction?.winner === 'player1' ? 'home' : 'away',
          winProbability: p.prediction?.winProbability,
          riskPercentage: p.prediction?.riskPercentage,
          confidence: p.prediction?.confidence,
          recommendation: p.prediction?.winnerName,
          edge: p.betting?.expectedValue || 0,
          valueBet: p.betting?.recommendedBet,
        }));
        console.log(`🎾 ${tennisMatches.length} matchs tennis récupérés`);
      }
    } catch (e) {
      console.log('⚠️ Erreur récupération tennis:', e);
    }
    
    // Combiner tous les matchs
    const allMatches = [...matches, ...tennisMatches];
    
    // Filtrer par sport si spécifié
    let filteredMatches = allMatches;
    if (sport !== 'all') {
      filteredMatches = allMatches.filter((m: any) => 
        m.sport?.toLowerCase().includes(sport.toLowerCase())
      );
    }
    
    // Analyser chaque match
    const challenges: Challenge[] = [];
    
    for (const match of filteredMatches) {
      // Pour le tennis, on a déjà les prédictions, pas besoin d'analyser
      if (match.sport === 'Tennis' && match.predictedResult) {
        const challenge = convertTennisToChallenge(match);
        if (challenge) {
          const odds = challenge.recommendation === 'home' ? challenge.oddsHome :
                      challenge.recommendation === 'away' ? challenge.oddsAway : 0;
          
          if (odds >= minOdds && odds <= maxOdds && challenge.edge >= minEdge) {
            if (confidence === 'high' && challenge.confidence === 'low') continue;
            if (confidence === 'very_high' && !['very_high', 'high'].includes(challenge.confidence)) continue;
            challenges.push(challenge);
          }
        }
      } else {
        // Pour les autres sports, utiliser l'analyse ML
        const challenge = await analyzeMatchForChallenge(match);
        if (challenge) {
          // Appliquer les filtres
          const odds = challenge.recommendation === 'home' ? challenge.oddsHome :
                      challenge.recommendation === 'away' ? challenge.oddsAway :
                      challenge.oddsDraw || 0;
          
          if (odds < minOdds || odds > maxOdds) continue;
          if (challenge.edge < minEdge) continue;
          
          // Filtrer par confiance
          if (confidence === 'high' && challenge.confidence === 'low') continue;
          if (confidence === 'very_high' && !['very_high', 'high'].includes(challenge.confidence)) continue;
          
          challenges.push(challenge);
        }
      }
    }
    
    // Trier par valueScore décroissant
    challenges.sort((a, b) => b.valueScore - a.valueScore);
    
    // Limiter à 20 résultats
    const topChallenges = challenges.slice(0, 20);
    
    // Calculer le résumé
    const summary: ChallengesSummary = {
      totalScanned: filteredMatches.filter((m: any) => m.status !== 'finished').length,
      valueBetsFound: topChallenges.length,
      highConfidenceCount: topChallenges.filter(c => 
        c.confidence === 'high' || c.confidence === 'very_high'
      ).length,
      averageEdge: topChallenges.length > 0 
        ? Math.round(topChallenges.reduce((sum, c) => sum + c.edge, 0) / topChallenges.length * 10) / 10
        : 0,
      realOddsCount: topChallenges.filter(c => c.hasRealOdds).length,
      bySport: {
        football: topChallenges.filter(c => c.sport === 'football').length,
        basketball: topChallenges.filter(c => c.sport === 'basketball').length,
        hockey: topChallenges.filter(c => c.sport === 'hockey').length,
        tennis: topChallenges.filter(c => c.sport === 'tennis').length,
      },
      byConfidence: {
        very_high: topChallenges.filter(c => c.confidence === 'very_high').length,
        high: topChallenges.filter(c => c.confidence === 'high').length,
        medium: topChallenges.filter(c => c.confidence === 'medium').length,
        low: topChallenges.filter(c => c.confidence === 'low').length,
      },
    };
    
    console.log(`✅ ${topChallenges.length} challenges détectés (${summary.highConfidenceCount} haute confiance)`);
    
    return NextResponse.json({
      success: true,
      challenges: topChallenges,
      summary,
      lastUpdated: new Date().toISOString(),
      filters: {
        minEdge,
        minOdds,
        maxOdds,
        sport,
        confidence,
      },
    });
    
  } catch (error) {
    console.error('Erreur API challenges:', error);
    return NextResponse.json({
      success: false,
      error: String(error),
      challenges: [],
      summary: {
        totalScanned: 0,
        valueBetsFound: 0,
        highConfidenceCount: 0,
        averageEdge: 0,
        realOddsCount: 0,
        bySport: { football: 0, basketball: 0, hockey: 0, tennis: 0 },
        byConfidence: { very_high: 0, high: 0, medium: 0, low: 0 },
      },
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { matchId, action } = body;
    
    if (action === 'analyze') {
      // Analyser un match spécifique
      const matches = await getMatchesWithRealOdds();
      const match = matches.find((m: any) => m.id === matchId);
      
      if (!match) {
        return NextResponse.json({ success: false, error: 'Match non trouvé' }, { status: 404 });
      }
      
      const challenge = await analyzeMatchForChallenge(match);
      
      return NextResponse.json({
        success: true,
        challenge,
      });
    }
    
    return NextResponse.json({ success: false, error: 'Action non reconnue' }, { status: 400 });
    
  } catch (error) {
    console.error('Erreur POST challenges:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
