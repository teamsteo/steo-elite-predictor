import { NextResponse } from 'next/server';
import {
  getMatchesWithRealOdds,
  getDataStats
} from '@/lib/combinedDataService';
import { getModelStatus } from '@/lib/adaptiveThresholdsML';
import {
  loadCache,
  saveCache,
  getCachedAnalysis,
  cacheAnalysis,
  getCreditStats,
  shouldUseApiCredits,
  generateBettingRecommendations,
  type MatchAnalysis
} from '@/lib/mlAnalysisCache';
import { predictMatch } from '@/lib/dixonColesModel';

// In-memory cache for quick access
let cachedData: any = null;
let lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Calculate implied probabilities from odds
 */
function calculateImpliedProbabilities(oddsHome: number, oddsDraw: number | null, oddsAway: number) {
  if (!oddsHome || !oddsAway || oddsHome <= 1 || oddsAway <= 1) {
    return { home: 33, draw: 34, away: 33 };
  }

  const homeProb = 1 / oddsHome;
  const awayProb = 1 / oddsAway;
  const drawProb = oddsDraw && oddsDraw > 1 ? 1 / oddsDraw : 0.28;

  const total = homeProb + awayProb + drawProb;

  return {
    home: Math.round((homeProb / total) * 100),
    draw: Math.round((drawProb / total) * 100),
    away: Math.round((awayProb / total) * 100),
  };
}

/**
 * Generate default team stats from odds (fallback when no real stats available)
 */
function generateDefaultStatsFromOdds(
  teamName: string,
  isFavorite: boolean,
  odds: number
) {
  // Estimer les stats basées sur les cotes
  const impliedProb = 1 / odds;
  const strength = isFavorite ? 1.3 + (impliedProb - 0.33) : 0.8 + (impliedProb - 0.33);
  
  return {
    name: teamName,
    goalsScored: Math.round(50 * strength),
    goalsConceded: Math.round(40 / strength),
    matches: 30,
    homeGoalsScored: Math.round(25 * strength * 1.15),
    homeGoalsConceded: Math.round(20 / strength),
    homeMatches: 15,
    awayGoalsScored: Math.round(25 * strength),
    awayGoalsConceded: Math.round(20 / strength * 1.1),
    awayMatches: 15,
    form: isFavorite ? [1, 1, 0.5, 1, 0.5] : [0.5, 0, 0.5, 1, 0] // W=1, D=0.5, L=0
  };
}

/**
 * Calculate Dixon-Coles prediction if possible
 */
function calculateDixonColesPrediction(
  homeTeam: string,
  awayTeam: string,
  league: string,
  oddsHome: number,
  oddsDraw: number,
  oddsAway: number
): { homeProb: number; drawProb: number; awayProb: number; expectedGoals: number; over25: number } | null {
  try {
    // Déterminer le favori
    const isHomeFavorite = oddsHome < oddsAway;
    
    // Générer des stats par défaut basées sur les cotes
    const homeStats = generateDefaultStatsFromOdds(homeTeam, isHomeFavorite, oddsHome);
    const awayStats = generateDefaultStatsFromOdds(awayTeam, !isHomeFavorite, oddsAway);
    
    // Utiliser le modèle Dixon-Coles
    const prediction = predictMatch(
      homeStats,
      awayStats,
      league,
      oddsHome,
      oddsDraw || 3.3,
      oddsAway
    );
    
    return {
      homeProb: prediction.homeWinProb,
      drawProb: prediction.drawProb,
      awayProb: prediction.awayWinProb,
      expectedGoals: prediction.expectedHomeGoals + prediction.expectedAwayGoals,
      over25: prediction.over25
    };
  } catch (error) {
    console.log('Erreur Dixon-Coles:', error);
    return null;
  }
}

/**
 * Analyze a match and generate predictions
 */
function analyzeMatch(match: any): MatchAnalysis {
  // Calculer les probabilités implicites du marché
  const marketProbs = calculateImpliedProbabilities(match.oddsHome, match.oddsDraw, match.oddsAway);
  
  // Calculer les probabilités Dixon-Coles si possible
  const dcPrediction = calculateDixonColesPrediction(
    match.homeTeam,
    match.awayTeam,
    match.league || 'default',
    match.oddsHome,
    match.oddsDraw || 3.3,
    match.oddsAway
  );
  
  // Combiner les probabilités (moyenne pondérée si Dixon-Coles disponible)
  let probs: { home: number; draw: number; away: number };
  let usedDixonColes = false;
  
  if (dcPrediction) {
    // Moyenne pondérée: 55% Dixon-Coles, 45% marché
    probs = {
      home: Math.round(dcPrediction.homeProb * 0.55 + marketProbs.home * 0.45),
      draw: Math.round(dcPrediction.drawProb * 0.55 + marketProbs.draw * 0.45),
      away: Math.round(dcPrediction.awayProb * 0.55 + marketProbs.away * 0.45)
    };
    // Normaliser
    const total = probs.home + probs.draw + probs.away;
    probs = {
      home: Math.round((probs.home / total) * 100),
      draw: Math.round((probs.draw / total) * 100),
      away: 100 - probs.home - probs.draw
    };
    usedDixonColes = true;
  } else {
    probs = marketProbs;
  }
  
  // Calculate risk based on probability distribution
  const maxProb = Math.max(probs.home, probs.away, probs.draw);
  const riskPercentage = 100 - maxProb;
  
  // Determine confidence based on risk and data quality
  let confidence: 'very_high' | 'high' | 'medium' | 'low';
  const hasRealOdds = match.hasRealOdds;
  
  // Améliorer la confiance si Dixon-Coles a été utilisé
  const confidenceBonus = usedDixonColes ? 5 : 0;
  const adjustedRisk = riskPercentage - confidenceBonus;
  
  if (adjustedRisk <= 30 && hasRealOdds) {
    confidence = 'very_high';
  } else if (adjustedRisk <= 40 && hasRealOdds) {
    confidence = 'high';
  } else if (adjustedRisk <= 55) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  
  // Generate betting recommendations
  const recommendations = generateBettingRecommendations(
    probs,
    { home: match.oddsHome, draw: match.oddsDraw, away: match.oddsAway },
    confidence
  );
  
  // Extract value bets
  const valueBets = recommendations
    .filter(r => r.recommendation === 'strong' || r.recommendation === 'moderate')
    .map(r => ({
      type: r.label,
      edge: Math.round(r.value * 10) / 10,
      confidence: r.recommendation,
    }));
  
  return {
    matchId: match.id || `${match.homeTeam}-${match.awayTeam}-${match.date}`,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    league: match.league || 'Unknown',
    date: match.date,
    oddsHome: match.oddsHome,
    oddsDraw: match.oddsDraw,
    oddsAway: match.oddsAway,
    probabilities: probs,
    riskPercentage,
    confidence,
    recommendations,
    valueBets,
    analyzedAt: new Date().toISOString(),
    dataQuality: hasRealOdds ? 'real' : 'estimated',
    apiCreditsUsed: hasRealOdds ? 1 : 0,
  };
}

/**
 * GET - Fetch matches with cached ML predictions
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === 'true';

  try {
    const now = Date.now();

    // Check memory cache first
    if (!forceRefresh && cachedData && (now - lastFetchTime) < CACHE_TTL) {
      console.log('📦 Using memory cache');
      return NextResponse.json(cachedData);
    }

    console.log('🔄 Fetching matches...');
    
    // Get matches from data source
    const matches = await getMatchesWithRealOdds();
    
    // Get cached analyses from file
    const persistentCache = loadCache();
    
    // Enrich each match with ML analysis
    const enrichedMatches = matches.map((match: any) => {
      const matchId = match.id || `${match.homeTeam}-${match.awayTeam}-${match.date}`;
      
      // Check if we have a cached analysis
      let analysis = getCachedAnalysis(matchId);
      
      // If no cache or expired, analyze (but don't use API credits if not needed)
      if (!analysis) {
        console.log(`🧠 Analyzing match: ${match.homeTeam} vs ${match.awayTeam}`);
        analysis = analyzeMatch(match);
        
        // Cache the result
        cacheAnalysis(analysis);
      }
      
      // Build the match object with all required fields
      // Generate goals prediction from probabilities
      const goalIntensity = (analysis.probabilities.home + analysis.probabilities.away) / 100;
      const over25Prob = Math.min(70, Math.max(35, goalIntensity * 60 + 15));
      const expectedGoals = Math.max(1.5, 2.5 * goalIntensity);
      const bttsProb = Math.min(65, Math.max(35, goalIntensity * 50 + 10));
      
      return {
        ...match,
        id: matchId,
        // Probabilities
        probabilities: analysis.probabilities,
        riskPercentage: analysis.riskPercentage,
        confidence: analysis.confidence,
        
        // Insight object for frontend
        insight: {
          riskPercentage: analysis.riskPercentage,
          confidence: analysis.confidence,
          valueBetDetected: analysis.valueBets.length > 0,
          valueBetType: analysis.valueBets[0]?.type || null,
        },
        
        // Betting recommendations
        recommendations: analysis.recommendations,
        valueBets: analysis.valueBets,
        
        // Goals prediction (Over/Under 2.5, BTTS)
        goalsPrediction: {
          total: Math.round(expectedGoals * 10) / 10,
          over25: Math.round(over25Prob),
          under25: Math.round(100 - over25Prob),
          over15: Math.min(85, Math.round(over25Prob + 15)),
          over35: Math.max(25, Math.round(over25Prob - 25)),
          over45: Math.max(15, Math.round(over25Prob - 35)),
          bothTeamsScore: Math.round(bttsProb),
          prediction: over25Prob >= 55 ? 'Over 2.5' : 'Under 2.5',
        },
        
        // Cards & Corners predictions REMOVED - No real data source available
        // These predictions were pure estimation without actual statistics
        // To re-enable: integrate API-Football or similar service with cards/corners data
        
        // ML analysis details
        mlAnalysis: {
          probabilities: analysis.probabilities,
          confidence: analysis.confidence,
          factors: [],
          valueBetDetected: analysis.valueBets.length > 0,
          recommendation: analysis.recommendations[0]?.label || '',
        },
        
        // Data quality
        dataQuality: {
          overall: analysis.dataQuality,
          overallScore: analysis.dataQuality === 'real' ? 85 : 40,
          sources: analysis.dataQuality === 'real' ? ['ESPN (DraftKings)'] : ['ESPN'],
          hasRealData: analysis.dataQuality === 'real',
        },
      };
    });

    // Calculate stats
    const dataStats = {
      total: enrichedMatches.length,
      withRealOdds: enrichedMatches.filter((m: any) => m.dataQuality?.hasRealData).length,
      highConfidence: enrichedMatches.filter((m: any) => m.confidence === 'high' || m.confidence === 'very_high').length,
      valueBets: enrichedMatches.filter((m: any) => m.valueBets?.length > 0).length,
    };

    const creditStats = getCreditStats();

    console.log(`✅ ${enrichedMatches.length} matches loaded (${dataStats.withRealOdds} with real odds, ${dataStats.valueBets} value bets)`);

    const result = {
      matches: enrichedMatches,
      timing: {
        currentHour: new Date().getUTCHours(),
        canRefresh: shouldUseApiCredits(),
        nextRefreshTime: '5 min',
        message: `${enrichedMatches.length} matchs analysés`,
      },
      dataStats,
      creditStats,
      mlStatus: getModelStatus(),
      lastUpdate: new Date().toISOString(),
    };

    // Update memory cache
    cachedData = result;
    lastFetchTime = now;

    return NextResponse.json(result);
  } catch (error) {
    console.error('API matches error:', error);
    return NextResponse.json({
      error: 'Connection error',
      matches: [],
      timing: {
        currentHour: new Date().getUTCHours(),
        canRefresh: false,
        nextRefreshTime: '5 min',
        message: 'Erreur de chargement',
      },
      dataStats: { total: 0, withRealOdds: 0, highConfidence: 0, valueBets: 0 },
      mlStatus: null,
    });
  }
}

/**
 * POST - Clear cache and force refresh
 */
export async function POST(request: Request) {
  try {
    console.log('🔄 Cache clear requested');

    // Clear memory cache
    cachedData = null;
    lastFetchTime = 0;

    return NextResponse.json({
      success: true,
      message: 'Cache cleared',
      creditStats: getCreditStats(),
    });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({
      success: false,
      error: 'Clear failed',
    });
  }
}
