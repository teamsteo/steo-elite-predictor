/**
 * Unified Prediction Service - Comprehensive Match Prediction System
 * 
 * This service integrates multiple data sources and models:
 * 1. ESPN/DraftKings odds (primary source with fallback cascade)
 * 2. Dixon-Coles statistical model for football
 * 3. Adaptive ML thresholds for dynamic adjustments
 * 4. Team context (form, H2H, xG, injuries) from FBref and other sources
 * 
 * The result is a unified prediction with:
 * - Real odds from ESPN/DraftKings
 * - Statistical probabilities from Dixon-Coles (football)
 * - ML-enhanced confidence and edge detection
 * - Contextual factors and recommendations
 */

import { fetchAllESPNOdds, ESPNOddMatch, findESPNOddsForMatch } from './espnOddsService';
import { predictMatch } from './dixonColesModel';
import { getAdaptiveThresholds, calculateMLAdjustment, MLThresholds, FeatureVector } from './adaptiveThresholdsML';
import { getUnifiedMatchContext, calculateContextAdjustment, UnifiedMatchContext } from './matchContextService';
import { formatOdds, formatNumber, formatPercent } from './formatUtils';

// ============================================
// TYPES
// ============================================

export interface UnifiedPredictionInput {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: 'Foot' | 'NBA' | 'NHL' | 'NFL';
  league: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
}

export interface UnifiedPrediction {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  sport: 'Foot' | 'NBA' | 'NHL' | 'NFL';
  league: string;
  
  // ESPN/DraftKings odds
  odds: {
    home: number;
    draw: number | null;
    away: number;
    source: 'espn-draftkings' | 'the-odds-api' | 'estimation';
    bookmaker: string;
    hasRealOdds: boolean;
  };
  
  // Dixon-Coles probabilities (football only)
  dixonColes?: {
    homeProb: number;
    drawProb: number;
    awayProb: number;
    expectedGoals: {
      home: number;
      away: number;
      total: number;
    };
    over25: number;
    under25: number;
    btts: number;
    mostLikelyScore: {
      home: number;
      away: number;
      prob: number;
    };
  };
  
  // ML-adjusted prediction
  mlPrediction: {
    homeProb: number;
    drawProb: number;
    awayProb: number;
    confidence: 'very_high' | 'high' | 'medium' | 'low';
    edge: number;
    valueBet: boolean;
    valueBetType: 'home' | 'draw' | 'away' | null;
  };
  
  // Context factors
  factors: {
    form: { home: number; away: number };
    h2h: { homeWins: number; draws: number; awayWins: number };
    injuries: { home: number; away: number; homeImpact: number; awayImpact: number };
    xg: { home: number | null; away: number | null };
    weather?: {
      condition: string;
      temperature: number;
      impact: string;
    };
  };
  
  // Final recommendation
  recommendation: {
    bet: 'home' | 'draw' | 'away' | 'avoid';
    kellyStake: number;
    reasoning: string[];
    expectedValue: number;
    riskLevel: 'low' | 'medium' | 'high';
    status: 'take' | 'consider' | 'rejected';
    statusReason: string;
  };
  
  // Data quality
  dataQuality: {
    score: number;
    sources: string[];
    hasRealOdds: boolean;
    hasAdvancedStats: boolean;
  };
  
  // Metadata
  generatedAt: string;
  processingTimeMs: number;
}

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Get unified prediction for a match
 * Integrates ESPN odds, Dixon-Coles model, ML thresholds, and context data
 */
export async function getUnifiedPrediction(match: UnifiedPredictionInput): Promise<UnifiedPrediction> {
  const startTime = Date.now();
  console.log(`🎯 Unified Prediction: ${match.homeTeam} vs ${match.awayTeam}`);
  
  const sources: string[] = [];
  let hasRealOdds = match.oddsHome > 0 && match.oddsAway > 0;
  let hasAdvancedStats = false;
  
  // 1. Get ML thresholds
  const sportType = match.sport === 'Foot' ? 'football' : 
                    match.sport === 'NBA' ? 'basketball' : 'football';
  const mlThresholds = getAdaptiveThresholds(sportType);
  sources.push('ML-Thresholds');
  
  // 2. Try to get better odds from ESPN if available
  let oddsHome = match.oddsHome;
  let oddsDraw = match.oddsDraw;
  let oddsAway = match.oddsAway;
  let oddsSource: 'espn-draftkings' | 'the-odds-api' | 'estimation' = 'estimation';
  let bookmaker = 'Unknown';
  
  try {
    const espnMatch = findESPNOddsForMatch(match.homeTeam, match.awayTeam, match.sport);
    if (espnMatch && espnMatch.hasRealOdds) {
      oddsHome = espnMatch.oddsHome;
      oddsDraw = espnMatch.oddsDraw;
      oddsAway = espnMatch.oddsAway;
      oddsSource = espnMatch.oddsSource;
      bookmaker = espnMatch.bookmaker;
      hasRealOdds = true;
      sources.push('ESPN-Odds');
    }
  } catch (e) {
    console.log('⚠️ ESPN odds not available, using provided odds');
  }
  
  // 3. Get match context (form, injuries, H2H, xG, etc.)
  let context: UnifiedMatchContext | null = null;
  try {
    context = await getUnifiedMatchContext({
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      sport: sportType as 'football' | 'basketball',
      league: match.league,
    });
    
    if (context.sourcesUsed.length > 0) {
      sources.push(...context.sourcesUsed);
      hasAdvancedStats = context.fbref !== undefined || context.nba !== undefined;
    }
  } catch (e) {
    console.log('⚠️ Context not available:', e);
  }
  
  // 4. Calculate implied probabilities from odds
  const totalImplied = (1 / oddsHome) + (1 / oddsAway) + (oddsDraw ? 1 / oddsDraw : 0);
  const impliedHome = (1 / oddsHome) / totalImplied;
  const impliedAway = (1 / oddsAway) / totalImplied;
  const impliedDraw = oddsDraw ? (1 / oddsDraw) / totalImplied : 0;
  
  // 5. Dixon-Coles prediction (football only)
  let dixonColesResult: UnifiedPrediction['dixonColes'] | undefined;
  let dcHomeProb = impliedHome;
  let dcDrawProb = impliedDraw;
  let dcAwayProb = impliedAway;
  
  if (match.sport === 'Foot') {
    try {
      // Generate team stats from context or use defaults
      const homeStats = generateTeamStatsFromContext(context, match.homeTeam, 'home');
      const awayStats = generateTeamStatsFromContext(context, match.awayTeam, 'away');
      
      const dcResult = predictMatch(
        homeStats,
        awayStats,
        match.league,
        oddsHome,
        oddsDraw || 3.3,
        oddsAway
      );
      
      dixonColesResult = {
        homeProb: dcResult.homeWinProb,
        drawProb: dcResult.drawProb,
        awayProb: dcResult.awayWinProb,
        expectedGoals: {
          home: dcResult.expectedHomeGoals,
          away: dcResult.expectedAwayGoals,
          total: dcResult.expectedHomeGoals + dcResult.expectedAwayGoals,
        },
        over25: dcResult.over25,
        under25: dcResult.under25,
        btts: dcResult.btts.yes,
        mostLikelyScore: dcResult.mostLikelyScore,
      };
      
      dcHomeProb = dcResult.homeWinProb / 100;
      dcDrawProb = dcResult.drawProb / 100;
      dcAwayProb = dcResult.awayWinProb / 100;
      
      sources.push('Dixon-Coles');
    } catch (e) {
      console.log('⚠️ Dixon-Coles calculation failed:', e);
    }
  }
  
  // 6. Calculate context adjustments
  let contextAdjustment = { homeAdjustment: 0, awayAdjustment: 0, confidence: 0.5 };
  if (context) {
    contextAdjustment = calculateContextAdjustment(context);
  }
  
  // 7. Build feature vector for ML
  const featureVector: FeatureVector = {
    edge: Math.max(impliedHome - (1/oddsHome), impliedAway - (1/oddsAway)),
    dataQuality: context?.unifiedAnalysis.dataQuality || 30,
    homeInjuries: context?.injuries.home.length || 0,
    awayInjuries: context?.injuries.away.length || 0,
    homeFormScore: context?.fbref?.homeForm?.formPoints || 50,
    awayFormScore: context?.fbref?.awayForm?.formPoints || 50,
    homeXG: context?.fbref?.homeXG?.xGDPer90 || 0,
    awayXG: context?.fbref?.awayXG?.xGDPer90 || 0,
    homeNetRating: context?.nba?.homeStats?.netRating || 0,
    awayNetRating: context?.nba?.awayStats?.netRating || 0,
    confidence: 0.5,
  };
  
  // 8. Calculate ML adjustment
  const mlAdjustment = calculateMLAdjustment(featureVector, sportType as 'football' | 'basketball');
  
  // 9. Combine probabilities: Market + Dixon-Coles + Context + ML
  let finalHomeProb: number;
  let finalDrawProb: number;
  let finalAwayProb: number;
  
  if (match.sport === 'Foot' && dixonColesResult) {
    // Weighted combination: 35% market, 35% Dixon-Coles, 15% context, 15% ML
    finalHomeProb = (
      impliedHome * 0.35 +
      dcHomeProb * 0.35 +
      (impliedHome + contextAdjustment.homeAdjustment) * 0.15 +
      (impliedHome + mlAdjustment.probabilityAdjustment) * 0.15
    );
    finalAwayProb = (
      impliedAway * 0.35 +
      dcAwayProb * 0.35 +
      (impliedAway + contextAdjustment.awayAdjustment) * 0.15 +
      (impliedAway - mlAdjustment.probabilityAdjustment) * 0.15
    );
    finalDrawProb = 1 - finalHomeProb - finalAwayProb;
  } else {
    // Non-football: Market + Context + ML
    finalHomeProb = impliedHome * 0.5 + 
                    (impliedHome + contextAdjustment.homeAdjustment) * 0.3 +
                    (impliedHome + mlAdjustment.probabilityAdjustment) * 0.2;
    finalAwayProb = impliedAway * 0.5 + 
                    (impliedAway + contextAdjustment.awayAdjustment) * 0.3 +
                    (impliedAway - mlAdjustment.probabilityAdjustment) * 0.2;
    finalDrawProb = oddsDraw ? impliedDraw : 0;
  }
  
  // Normalize
  const totalProb = finalHomeProb + finalDrawProb + finalAwayProb;
  finalHomeProb /= totalProb;
  finalDrawProb /= totalProb;
  finalAwayProb /= totalProb;
  
  // 10. Calculate edge
  const homeEdge = finalHomeProb - impliedHome;
  const drawEdge = finalDrawProb - impliedDraw;
  const awayEdge = finalAwayProb - impliedAway;
  
  // 11. Determine best bet and confidence
  let bestBet: 'home' | 'draw' | 'away' = 'home';
  let bestEdge = homeEdge;
  let bestOdds = oddsHome;
  let bestProb = finalHomeProb;
  
  if (awayEdge > homeEdge && awayEdge > drawEdge) {
    bestBet = 'away';
    bestEdge = awayEdge;
    bestOdds = oddsAway;
    bestProb = finalAwayProb;
  } else if (drawEdge > homeEdge && drawEdge > awayEdge && oddsDraw) {
    bestBet = 'draw';
    bestEdge = drawEdge;
    bestOdds = oddsDraw;
    bestProb = finalDrawProb;
  }
  
  // Determine confidence - STRICTER THRESHOLDS based on backtest results
  // LOW confidence bets have 0% win rate, so we make it harder to get LOW
  let confidence: 'very_high' | 'high' | 'medium' | 'low' = 'low';
  const edgeThreshold = mlThresholds.edgeThreshold || 0.05; // Raised from 0.03
  const isValueBet = bestEdge > edgeThreshold;
  const dataQualityScore = context?.unifiedAnalysis.dataQuality || 30;
  
  // Much stricter confidence requirements
  if (bestEdge > 0.10 && dataQualityScore >= 70) {
    confidence = 'very_high';
  } else if (bestEdge > 0.07 && dataQualityScore >= 55) {
    confidence = 'high';
  } else if (bestEdge > 0.04 && dataQualityScore >= 40) {
    confidence = 'medium';
  } else {
    // LOW confidence - automatically marked as avoid
    confidence = 'low';
  }
  
  // 12. Calculate Kelly stake
  const kellyFraction = calculateKellyFraction(bestOdds, bestProb);
  const confidenceMultiplier = mlThresholds.confidenceWeights[confidence];
  const kellyStake = Math.min(kellyFraction * confidenceMultiplier, 0.05); // Max 5%
  
  // 13. Build recommendation
  const reasoning: string[] = [];
  
  if (isValueBet) {
    reasoning.push(`📊 VALUE BET: ${bestBet === 'home' ? match.homeTeam : bestBet === 'away' ? match.awayTeam : 'Draw'} sous-évalué de +${Math.round(bestEdge * 100)}%`);
    reasoning.push(`🎯 Cote ${formatOdds(bestOdds)} vs probabilité ${formatPercent(bestProb)}`);
  } else {
    reasoning.push(`📉 Pas de value bet significatif (edge < ${Math.round(edgeThreshold * 100)}%)`);
  }
  
  if (dixonColesResult) {
    reasoning.push(`⚽ Buts attendus: ${formatNumber(dixonColesResult.expectedGoals.total, 1)} (${formatPercent(dixonColesResult.over25)} Over 2.5)`);
  }
  
  if (context) {
    if (context.unifiedAnalysis.overallAdvantage !== 'neutral') {
      const team = context.unifiedAnalysis.overallAdvantage === 'home' ? match.homeTeam : match.awayTeam;
      reasoning.push(`⚖️ Avantage contextuel: ${team}`);
    }
    
    if (context.injuries.homeImpact < -2 || context.injuries.awayImpact < -2) {
      reasoning.push(`🏥 Impact blessures: ${context.injuries.summary}`);
    }
    
    if (context.fbref) {
      if (context.fbref.homeForm && context.fbref.awayForm) {
        reasoning.push(`📈 Forme: ${match.homeTeam} ${context.fbref.homeForm.form} vs ${match.awayTeam} ${context.fbref.awayForm.form}`);
      }
    }
    
    if (context.weather && context.weather.impact.overall !== 'ideal') {
      reasoning.push(`🌤️ Météo: ${context.weather.current.condition}, impact ${context.weather.impact.overall}`);
    }
  }
  
  // Risk level
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (context?.unifiedAnalysis.riskLevel === 'high' || (context?.injuries.homeImpact || 0) + (context?.injuries.awayImpact || 0) < -10) {
    riskLevel = 'high';
  } else if (context?.unifiedAnalysis.riskLevel === 'medium' || !hasRealOdds) {
    riskLevel = 'medium';
  }
  
  // Expected value
  const expectedValue = (bestProb * (bestOdds - 1) - (1 - bestProb)) * 100;
  
  // 14. Build factors object
  const factors: UnifiedPrediction['factors'] = {
    form: {
      home: context?.fbref?.homeForm?.formPoints || 50,
      away: context?.fbref?.awayForm?.formPoints || 50,
    },
    h2h: {
      homeWins: context?.fbref?.h2h?.team1Wins || 0,
      draws: context?.fbref?.h2h?.draws || 0,
      awayWins: context?.fbref?.h2h?.team2Wins || 0,
    },
    injuries: {
      home: context?.injuries.home.length || 0,
      away: context?.injuries.away.length || 0,
      homeImpact: context?.injuries.homeImpact || 0,
      awayImpact: context?.injuries.awayImpact || 0,
    },
    xg: {
      home: context?.fbref?.homeXG?.xGDPer90 || null,
      away: context?.fbref?.awayXG?.xGDPer90 || null,
    },
    weather: context?.weather ? {
      condition: context.weather.current.condition,
      temperature: context.weather.current.temperature,
      impact: context.weather.impact.overall,
    } : undefined,
  };
  
  // Processing time
  const processingTime = Date.now() - startTime;
  console.log(`✅ Unified prediction completed in ${processingTime}ms`);
  
  // Deduplicate sources
  const uniqueSources = [...new Set(sources)];
  
  return {
    matchId: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    sport: match.sport,
    league: match.league,
    
    odds: {
      home: oddsHome,
      draw: oddsDraw,
      away: oddsAway,
      source: oddsSource,
      bookmaker,
      hasRealOdds,
    },
    
    dixonColes: dixonColesResult,
    
    mlPrediction: {
      homeProb: Math.round(finalHomeProb * 1000) / 10,
      drawProb: Math.round(finalDrawProb * 1000) / 10,
      awayProb: Math.round(finalAwayProb * 1000) / 10,
      confidence,
      edge: Math.round(bestEdge * 1000) / 10,
      valueBet: isValueBet,
      valueBetType: isValueBet ? bestBet : null,
    },
    
    factors,
    
    recommendation: {
      // IMPORTANT: LOW confidence bets are automatically avoided (0% win rate in backtest)
      // Status automatique basé sur le backtest (HIGH/MEDIUM = profitable, LOW = 0% win rate)
      bet: (isValueBet && confidence !== 'low') ? bestBet : 'avoid',
      kellyStake: confidence === 'low' ? 0 : Math.round(kellyStake * 1000) / 10,
      reasoning: confidence === 'low' 
        ? [...reasoning, '🚫 REJETÉ AUTO - Confiance LOW (0% win rate)'] 
        : confidence === 'medium'
          ? [...reasoning, '⚠️ À considérer - MEDIUM (profitable en backtest)']
          : [...reasoning, '✅ À prendre - HIGH (top performance backtest)'],
      expectedValue: Math.round(expectedValue * 10) / 10,
      riskLevel: confidence === 'low' ? 'high' : riskLevel,
      status: confidence === 'low' ? 'rejected' : confidence === 'medium' ? 'consider' : 'take',
      statusReason: confidence === 'low' 
        ? '0% win rate historique'
        : confidence === 'medium'
        ? 'Profitable en backtest'
        : 'Top performance backtest',
    },
    
    dataQuality: {
      score: dataQualityScore,
      sources: uniqueSources,
      hasRealOdds,
      hasAdvancedStats,
    },
    
    generatedAt: new Date().toISOString(),
    processingTimeMs: processingTime,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate team stats from context for Dixon-Coles model
 */
function generateTeamStatsFromContext(
  context: UnifiedMatchContext | null,
  teamName: string,
  side: 'home' | 'away'
): any {
  const form = side === 'home' ? context?.fbref?.homeForm : context?.fbref?.awayForm;
  const xg = side === 'home' ? context?.fbref?.homeXG : context?.fbref?.awayXG;
  
  // Calculate per-90 values from totals
  const xGFor90 = xg && xg.matches > 0 ? xg.xG / xg.matches : 1.35;
  const xGAgainst90 = xg && xg.matches > 0 ? xg.xGA / xg.matches : 1.10;
  
  return {
    name: teamName,
    goalsScored: xGFor90 * 20,
    goalsConceded: xGAgainst90 * 20,
    matches: 20,
    homeMatches: side === 'home' ? 10 : 0,
    awayMatches: side === 'away' ? 10 : 0,
    form: form?.form || [],
  };
}

/**
 * Calculate Kelly fraction
 */
function calculateKellyFraction(odds: number, probability: number): number {
  const b = odds - 1;
  const p = probability;
  const q = 1 - p;
  
  let kellyFraction = (b * p - q) / b;
  return Math.max(0, kellyFraction);
}

/**
 * Batch predictions for multiple matches
 */
export async function getBatchPredictions(
  matches: UnifiedPredictionInput[]
): Promise<UnifiedPrediction[]> {
  console.log(`🎯 Batch predictions for ${matches.length} matches`);
  
  const predictions = await Promise.all(
    matches.map(match => getUnifiedPrediction(match))
  );
  
  // Sort by edge (highest first)
  predictions.sort((a, b) => b.mlPrediction.edge - a.mlPrediction.edge);
  
  return predictions;
}

/**
 * Get predictions only for value bets with HIGH or MEDIUM confidence
 * LOW confidence bets are excluded (0% win rate in backtest)
 */
export async function getValueBets(
  matches: UnifiedPredictionInput[]
): Promise<UnifiedPrediction[]> {
  const predictions = await getBatchPredictions(matches);
  return predictions.filter(p => 
    p.mlPrediction.valueBet && 
    p.mlPrediction.confidence !== 'low' &&
    p.recommendation.bet !== 'avoid'
  );
}

/**
 * Get predictions with HIGH confidence only (best performers)
 */
export async function getHighConfidenceBets(
  matches: UnifiedPredictionInput[]
): Promise<UnifiedPrediction[]> {
  const predictions = await getBatchPredictions(matches);
  return predictions.filter(p => 
    (p.mlPrediction.confidence === 'high' || p.mlPrediction.confidence === 'very_high') &&
    p.recommendation.bet !== 'avoid'
  );
}

// Export default
const unifiedPredictionService = {
  getUnifiedPrediction,
  getBatchPredictions,
  getValueBets,
};

export default unifiedPredictionService;
