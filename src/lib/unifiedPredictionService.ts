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
import { enrichMatch, type MatchEnrichment } from './matchEnrichmentService';
import { calibrateIsotonic, loadCalibrationMap, type CalibrationMap } from './calibrationService';
import { alignWithMarket, type MarketAlignmentResult } from './marketAlignmentService';
import { analyzeMatchImportance } from './matchImportanceService';
import { getMatchTeamStats } from './teamStatsService';

// ============================================
// TYPES
// ============================================

export interface UnifiedPredictionInput {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
}

export interface UnifiedPrediction {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
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
    xgboostUsed?: boolean;
    xgboostScore?: number;
    calibrated?: boolean;
    calibrationMethod?: string;
  };
  
  // CLV Market alignment
  marketAlignment?: {
    aligned: boolean;
    marketSignal: 'confirming' | 'contradicting' | 'neutral' | 'no_data';
    clvHome: number;
    clvAway: number;
    homeAdjustment: number;
    awayAdjustment: number;
    steamDetected: boolean;
    adjustmentStrength: 'none' | 'subtle' | 'moderate' | 'strong';
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
    matchImportance?: {
      stakeLevel: string;
      stakeScore: number;
      stakeLabel: string;
      seasonPhase: string;
      seasonPhaseLabel: string;
      competitionTypeLabel: string;
      formReliable: boolean;
      formReliability: string;
      formReliabilityReason: string;
      warnings: string[];
      insights: string[];
      contextSummary: string;
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
  // FIX C3: Mapping sport correct — NHL→hockey, NFL→football, MLB→baseball
  const sportType = match.sport === 'Foot' ? 'football' : 
                    match.sport === 'NBA' ? 'basketball' : 
                    match.sport === 'NHL' ? 'hockey' : 
                    match.sport === 'MLB' ? 'baseball' : 'football';
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
  
  // 3b. Fallback: calculer l'enjeu du match si le contexte n'a pas pu le faire
  // analyzeMatchImportance est synchrone et rapide (<1ms), zéro API externe
  let matchImportanceFallback: any = null;
  if (!context?.matchImportance) {
    try {
      const sportTypeForImportance = match.sport === 'Foot' ? 'football' : 
        match.sport === 'NBA' ? 'basketball' : 
        match.sport === 'NHL' ? 'hockey' : 
        match.sport === 'MLB' ? 'baseball' : 
        match.sport === 'NFL' ? 'football' : 'football';
      matchImportanceFallback = analyzeMatchImportance(
        match.league,
        sportTypeForImportance,
        new Date()
      );
      // Injecter dans le contexte si disponible
      if (context) {
        context.matchImportance = matchImportanceFallback;
      }
      sources.push('MatchImportance-Fallback');
      console.log(`🏆 MatchImportance calculé en fallback: ${matchImportanceFallback.stakeLabel} · ${matchImportanceFallback.competitionTypeLabel} · ${matchImportanceFallback.seasonPhaseLabel}`);
    } catch (e) {
      console.log('⚠️ MatchImportance fallback failed:', e);
    }
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
      // P0 FIX: Generate team stats — TheSportsDB real stats first, xG fallback
      // Fetch les 2 équipes en un seul appel (cache 1h TTL)
      let homeStats: any, awayStats: any;
      try {
        const realStats = await getMatchTeamStats(match.homeTeam, match.awayTeam, match.league);
        if (realStats.homeTeam && realStats.homeTeam.played >= 5) {
          const hForm = (realStats.homeTeam.form || '').split('').map((c: string) => c === 'W' ? 1 : c === 'D' ? 0.5 : 0);
          homeStats = {
            name: match.homeTeam,
            goalsScored: realStats.homeTeam.goalsFor,
            goalsConceded: realStats.homeTeam.goalsAgainst,
            matches: realStats.homeTeam.played,
            homeMatches: Math.ceil(realStats.homeTeam.played / 2),
            awayMatches: 0,
            form: hForm,
          };
          console.log(`✅ DC: stats RÉELLES ${match.homeTeam} (${realStats.homeTeam.played}M, ${realStats.homeTeam.goalsFor}GF/${realStats.homeTeam.goalsAgainst}GA)`);
        }
        if (realStats.awayTeam && realStats.awayTeam.played >= 5) {
          const aForm = (realStats.awayTeam.form || '').split('').map((c: string) => c === 'W' ? 1 : c === 'D' ? 0.5 : 0);
          awayStats = {
            name: match.awayTeam,
            goalsScored: realStats.awayTeam.goalsFor,
            goalsConceded: realStats.awayTeam.goalsAgainst,
            matches: realStats.awayTeam.played,
            homeMatches: 0,
            awayMatches: Math.ceil(realStats.awayTeam.played / 2),
            form: aForm,
          };
          console.log(`✅ DC: stats RÉELLES ${match.awayTeam} (${realStats.awayTeam.played}M, ${realStats.awayTeam.goalsFor}GF/${realStats.awayTeam.goalsAgainst}GA)`);
        }
      } catch { /* TheSportsDB indisponible */ }
      
      // Fallback: stats xG si TheSportsDB n'a rien retourné
      // On passe les cotes implicites pour différencier les équipes
      if (!homeStats) {
        homeStats = await generateTeamStatsFromContext(context, match.homeTeam, 'home', match.league, impliedHome, impliedAway);
      }
      if (!awayStats) {
        awayStats = await generateTeamStatsFromContext(context, match.awayTeam, 'away', match.league, impliedHome, impliedAway);
      }
      
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
  
  // 6.5. Phase 3: Data enrichment (weather, fatigue, records) — non-blocking
  let enrichment: MatchEnrichment = {};
  try {
    enrichment = await enrichMatch({
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      date: match.oddsHome ? new Date().toISOString() : '',
      sport: match.sport === 'Foot' ? 'football' : match.sport.toLowerCase(),
      league: match.league,
      venueCity: (match as any).venueCity,
      venueCountry: (match as any).venueCountry,
      homeRecord: (match as any).homeRecord,
      awayRecord: (match as any).awayRecord,
    });
    if (enrichment.weather) sources.push('Weather');
    if (enrichment.fatigue) sources.push('Fatigue');
    if (enrichment.recordStrength) sources.push('Records');
  } catch {
    // Non-blocking: enrichment failure doesn't affect prediction
  }
  
  // 7. Build feature vector for ML
  // FIX #1: Calculer un edge préliminaire AVANT calculateMLAdjustment
  let preliminaryEdge = 0;
  let preliminaryHomeProb = impliedHome;
  let preliminaryAwayProb = impliedAway;
  let preliminaryDrawProb = impliedDraw;
  
  if (match.sport === 'Foot' && dixonColesResult) {
    preliminaryHomeProb = dcHomeProb;
    preliminaryAwayProb = dcAwayProb;
    preliminaryDrawProb = dcDrawProb;
    preliminaryEdge = Math.max(
      Math.abs(dcHomeProb - impliedHome),
      Math.abs(dcAwayProb - impliedAway),
      Math.abs(dcDrawProb - impliedDraw)
    );
  } else {
    preliminaryHomeProb = impliedHome + contextAdjustment.homeAdjustment;
    preliminaryAwayProb = impliedAway + contextAdjustment.awayAdjustment;
    preliminaryEdge = Math.max(
      Math.abs(contextAdjustment.homeAdjustment),
      Math.abs(contextAdjustment.awayAdjustment)
    );
  }
  
  // dataQuality est un NOMBRE (0-100) calculé par matchContextService
  // Bug corrigé: l'ancien code le traitait comme une chaîne ('complete'/'partial'/'limited')
  // → dataQualityMap[55] = undefined → fallback à 30 → tout rejeté en LOW
  // FIX: Si Dixon-Coles a fonctionné (football), on accorde un minimum de 35
  // car le modèle statistique本身就是 une source de données significative
  const rawDataQuality = context?.unifiedAnalysis.dataQuality;
  const dcBonus = (match.sport === 'Foot' && dixonColesResult) ? 35 : 0;
  const dataQualityNum = typeof rawDataQuality === 'number'
    ? Math.max(rawDataQuality, dcBonus)
    : Math.max(30, dcBonus);
  
  const featureVector: FeatureVector = {
    edge: Math.max(0, preliminaryEdge),
    dataQuality: dataQualityNum,
    homeInjuries: context?.injuries.home.length || 0,
    awayInjuries: context?.injuries.away.length || 0,
    homeFormScore: context?.fbref?.homeForm?.formPoints || 50,
    awayFormScore: context?.fbref?.awayForm?.formPoints || 50,
    homeXG: context?.fbref?.homeXG?.xGDPer90 || 0,
    awayXG: context?.fbref?.awayXG?.xGDPer90 || 0,
    homeNetRating: context?.nba?.homeStats?.netRating || 0,
    awayNetRating: context?.nba?.awayStats?.netRating || 0,
    confidence: 0.5,
    homeWinProbability: preliminaryHomeProb,
    awayWinProbability: preliminaryAwayProb,
    drawProbability: preliminaryDrawProb,
    // Phase 3: Enrichment features
    weatherImpact: enrichment.weather?.impact,
    weatherRiskLevel: enrichment.weather?.riskLevel === 'high' ? 1 : enrichment.weather?.riskLevel === 'medium' ? 0.5 : 0,
    fatigueDifferential: enrichment.fatigue?.fatigueDifferential,
    homeFatigueScore: enrichment.fatigue?.homeFatigueScore,
    awayFatigueScore: enrichment.fatigue?.awayFatigueScore,
    homeWinPct: enrichment.recordStrength?.homeWinPct,
    awayWinPct: enrichment.recordStrength?.awayWinPct,
    recordStrengthDiff: enrichment.recordStrength?.homeWinPctDiff,
  };
  
  // 8. Calculate ML adjustment (async - includes XGBoost if trained)
  // ⚠️ P0 FIX: XGBoost désactivé pour basketball/hockey/baseball
  // Le modèle basketball a 46.6% CV accuracy (pire que hasard),
  // hockey 47.3% et baseball 49.5% (Brier ~0.25 = pile ou face).
  // Seul football (76.9%) bénéficie réellement du ML.
  const mlEnabled = sportType === 'football';
  const mlAdjustment = mlEnabled
    ? await calculateMLAdjustment(featureVector, sportType)
    : { probabilityAdjustment: 0, confidenceAdjustment: 0, recommendedBet: 'neutral' as const, xgboostUsed: false, xgboostScore: undefined };
  
  // 8.5. ISOTONIC REGRESSION CALIBRATION
  // Calibrate the raw XGBoost score into a true probability
  let calibrationMap: CalibrationMap | null = null;
  let calibratedHomeProb = impliedHome;
  let calibratedAwayProb = impliedAway;
  let calibratedDrawProb = impliedDraw;
  
  if (mlAdjustment.xgboostUsed && mlAdjustment.xgboostScore !== undefined) {
    try {
      calibrationMap = await loadCalibrationMap(sportType);
      if (calibrationMap.method !== 'none') {
        calibratedHomeProb = calibrateIsotonic(mlAdjustment.xgboostScore, calibrationMap);
        // Calibrate away as 1 - home (for binary), or use the complement
        calibratedAwayProb = 1 - calibratedHomeProb;
        // P0 FIX: Utiliser la vraie proba nul de Dixon-Coles au lieu de la formule ad-hoc
        // Ancien code: Math.max(0, 0.05 - |home-away| * 0.1) — beaucoup trop bas
        // Dixon-Coles donne une vraie proba de nul basée sur les forces offensives/défensives
        if (match.sport === 'Foot' && dixonColesResult) {
          calibratedDrawProb = dcDrawProb * 0.6; // 60% weight from Dixon-Coles draw
        } else if (match.sport === 'Foot') {
          calibratedDrawProb = Math.max(0, 0.05 - Math.abs(calibratedHomeProb - calibratedAwayProb) * 0.1);
        } else {
          calibratedDrawProb = 0; // No draw in basketball/hockey
        }
        // Renormalize (V-HIGH-3 FIX: guard division by zero)
        const calTotal = calibratedHomeProb + calibratedDrawProb + calibratedAwayProb;
        const calEps = 1e-8;
        calibratedHomeProb /= Math.max(calEps, calTotal);
        calibratedDrawProb /= Math.max(calEps, calTotal);
        calibratedAwayProb /= Math.max(calEps, calTotal);
        console.log(`📐 Calibration: raw=${mlAdjustment.xgboostScore.toFixed(3)} → cal=${calibratedHomeProb.toFixed(3)} [${calibrationMap.method}]`);
        sources.push('Calibration');
      }
    } catch {
      // Calibration failed — use uncalibrated probabilities
      console.debug('Calibration non disponible, utilisation probabilités brutes');
    }
  }
  
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
    // Non-football: Market + Context (NO ML — models are noise for basketball/hockey/baseball)
    finalHomeProb = impliedHome * 0.65 + 
                    (impliedHome + contextAdjustment.homeAdjustment) * 0.35;
    finalAwayProb = impliedAway * 0.65 + 
                    (impliedAway + contextAdjustment.awayAdjustment) * 0.35;
    finalDrawProb = oddsDraw ? impliedDraw : 0;
  }
  
  // Normalize (V-HIGH-3 FIX: guard against division by zero)
  const EPS = 1e-8;
  const totalProb = finalHomeProb + finalDrawProb + finalAwayProb;
  finalHomeProb /= Math.max(EPS, totalProb);
  finalDrawProb /= Math.max(EPS, totalProb);
  finalAwayProb /= Math.max(EPS, totalProb);
  
  // 10. Calculate edge (FIX C2: model prob vs market implied prob — can be positive)
  const homeEdge = finalHomeProb - impliedHome;
  const drawEdge = finalDrawProb - impliedDraw;
  const awayEdge = finalAwayProb - impliedAway;

  // Update feature vector with final probabilities for XGBoost scoring
  featureVector.edge = Math.max(homeEdge, awayEdge, drawEdge);
  featureVector.homeWinProbability = finalHomeProb;
  featureVector.awayWinProbability = finalAwayProb;
  featureVector.drawProbability = finalDrawProb;
  
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
  
  // Determine confidence
  // FIX: Pour le football, on utilise l'edge BRUT de Dixon-Coles (pre-blend)
  // L'edge blendé (65% marché + 35% DC) dilue le signal à 0.7-2.8%
  // ce qui est mathématiquement en dessous des anciens seuils de 4%.
  // L'edge brut DC est typiquement 2-12%, bien plus représentatif.
  const rawDCEdge = match.sport === 'Foot' && dixonColesResult
    ? preliminaryEdge  // Max |DC_prob - implied_prob| calculé lignes 377-381
    : bestEdge;         // Pour les autres sports, edge blendé
  
  let confidence: 'very_high' | 'high' | 'medium' | 'low' = 'low';
  const edgeThreshold = mlThresholds.edgeThreshold || 0.05;
  const isValueBetRaw = bestEdge > edgeThreshold;
  const dataQualityScore = dataQualityNum;
  
  console.log(`🎯 Confidence check: rawEdge=${(rawDCEdge * 100).toFixed(1)}%, blendedEdge=${(bestEdge * 100).toFixed(1)}%, dataQuality=${dataQualityScore}, sport=${match.sport}`);
  
  if (match.sport === 'Foot') {
    // Seuils FOOTBALL basés sur l'edge brut Dixon-Coles (réaliste: 2-12%)
    if (rawDCEdge > 0.08 && dataQualityScore >= 55) {
      confidence = 'very_high';
    } else if (rawDCEdge > 0.05 && dataQualityScore >= 40) {
      confidence = 'high';
    } else if (rawDCEdge > 0.025 && dataQualityScore >= 25) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }
  } else {
    // Seuils OTHER SPORTS (inchangés)
    if (bestEdge > 0.10 && dataQualityScore >= 70) {
      confidence = 'very_high';
    } else if (bestEdge > 0.07 && dataQualityScore >= 55) {
      confidence = 'high';
    } else if (bestEdge > 0.04 && dataQualityScore >= 40) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }
  }
  
  // 11.5. CLV MARKET ALIGNMENT
  // Adjust final probabilities based on market movements (CLV)
  // Applied AFTER bestBet is determined so we know which side to check
  let marketAlignment: MarketAlignmentResult | null = null;
  try {
    marketAlignment = await alignWithMarket(
      match.id,
      finalHomeProb,
      finalAwayProb,
      finalDrawProb,
      bestBet
    );
    if (marketAlignment.aligned) {
      finalHomeProb += marketAlignment.homeAdjustment;
      finalAwayProb += marketAlignment.awayAdjustment;
      // Renormalize after CLV adjustment (V-HIGH-4 FIX: guard division by zero)
      const clvTotal = finalHomeProb + finalDrawProb + finalAwayProb;
      finalHomeProb /= Math.max(EPS, clvTotal);
      finalDrawProb /= Math.max(EPS, clvTotal);
      finalAwayProb /= Math.max(EPS, clvTotal);
      marketAlignment.reasoning.forEach(r => reasoning.push(r));
      sources.push('CLV-Market');
    }
  } catch {
    // Market alignment failed — continue without adjustment
    console.debug('CLV market alignment non disponible');
  }
  
  // 12. Calculate Kelly stake
  const kellyFraction = calculateKellyFraction(bestOdds, bestProb);
  const confidenceMultiplier = mlThresholds.confidenceWeights[confidence];
  const kellyStake = Math.min(kellyFraction * confidenceMultiplier, 0.05); // Max 5%
  
  // 13. Build recommendation
  const reasoning: string[] = [];
  
  // ⚠️ P0 FIX: Value bets interdits sur cotes estimées
  const isValueBet = isValueBetRaw && hasRealOdds;
  
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
    
    // Enjeu du match
    if (context.matchImportance) {
      const imp = context.matchImportance;
      if (imp.stakeLevel === 'high' || imp.stakeLevel === 'critical') {
        reasoning.push(`🏆 ENJEU ${imp.stakeLevel === 'critical' ? 'CRITIQUE' : 'ÉLEVÉ'}: ${imp.stakeLabel}`);
      }
      if (!imp.formReliable) {
        reasoning.push(`⚠️ Forme ${imp.formReliability === 'unreliable' ? 'NON fiable' : 'incertaine'}: ${imp.formReliabilityReason}`);
      }
    }
  }
  
  // Add XGBoost reasoning if used (football only)
  if (mlAdjustment.xgboostUsed) {
    reasoning.push(`🧠 XGBoost ${mlAdjustment.xgboostScore !== undefined ? `score ${Math.round(mlAdjustment.xgboostScore * 100)}/100` : 'actif'} — football uniquement, coefficients entraînés appliqués`);
  }
  if (!mlEnabled) {
    reasoning.push(`📊 Mode cotes+contexte (ML désactivé — ${sportType} sans modèle fiable)`);
  }
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
    matchImportance: (context?.matchImportance || matchImportanceFallback) ? {
      stakeLevel: (context?.matchImportance || matchImportanceFallback).stakeLevel,
      stakeScore: (context?.matchImportance || matchImportanceFallback).stakeScore,
      stakeLabel: (context?.matchImportance || matchImportanceFallback).stakeLabel,
      seasonPhase: (context?.matchImportance || matchImportanceFallback).seasonPhase,
      seasonPhaseLabel: (context?.matchImportance || matchImportanceFallback).seasonPhaseLabel,
      competitionTypeLabel: (context?.matchImportance || matchImportanceFallback).competitionTypeLabel,
      formReliable: (context?.matchImportance || matchImportanceFallback).formReliable,
      formReliability: (context?.matchImportance || matchImportanceFallback).formReliability,
      formReliabilityReason: (context?.matchImportance || matchImportanceFallback).formReliabilityReason,
      warnings: (context?.matchImportance || matchImportanceFallback).warnings,
      insights: (context?.matchImportance || matchImportanceFallback).insights,
      contextSummary: (context?.matchImportance || matchImportanceFallback).contextSummary,
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
      xgboostUsed: mlAdjustment.xgboostUsed,
      xgboostScore: mlAdjustment.xgboostScore,
      calibrated: calibrationMap !== null && calibrationMap.method !== 'none',
      calibrationMethod: calibrationMap?.method,
    },
    
    marketAlignment: marketAlignment ? {
      aligned: marketAlignment.aligned,
      marketSignal: marketAlignment.marketSignal,
      clvHome: marketAlignment.clvData?.clvHome ?? 0,
      clvAway: marketAlignment.clvData?.clvAway ?? 0,
      homeAdjustment: marketAlignment.homeAdjustment,
      awayAdjustment: marketAlignment.awayAdjustment,
      steamDetected: marketAlignment.steamDetected,
      adjustmentStrength: marketAlignment.adjustmentStrength,
    } : undefined,
    
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
 * Generate team stats for Dixon-Coles model.
 * P0 FIX: Priorité TheSportsDB (vraies stats GF/GA) → fallback xG context.
 * Les stats fabriquées (xG×20, matches=20) ne sont plus le chemin principal.
 */
async function generateTeamStatsFromContext(
  context: UnifiedMatchContext | null,
  teamName: string,
  side: 'home' | 'away',
  league: string,
  impliedHomeProb?: number,
  impliedAwayProb?: number
): Promise<any> {
  // PRIORITÉ 1: Vraies stats TheSportsDB (GF/GA réels, forme réelle)
  try {
    // Note: getMatchTeamStats fetch les DEUX équipes d'un coup, mais on l'appelle
    // ici par équipe. Le cache interne (1h TTL) évite les appels redondants.
    const realStats = await getMatchTeamStats(
      side === 'home' ? teamName : '__unused__',
      side === 'away' ? teamName : '__unused__',
      league
    );
    const teamData = side === 'home' ? realStats.homeTeam : realStats.awayTeam;
    
    if (teamData && teamData.played >= 5) {
      // Stats réelles disponibles — convertir au format Dixon-Coles
      const played = teamData.played || 20;
      const formArray = (teamData.form || '').split('').map(c => c === 'W' ? 1 : c === 'D' ? 0.5 : 0);
      
      console.log(`✅ Dixon-Coles: stats RÉELLES TheSportsDB pour ${teamName} (${played} matchs, ${teamData.goalsFor} GF, ${teamData.goalsAgainst} GA)`);
      
      return {
        name: teamName,
        goalsScored: teamData.goalsFor,
        goalsConceded: teamData.goalsAgainst,
        matches: played,
        homeMatches: side === 'home' ? Math.ceil(played / 2) : 0,
        awayMatches: side === 'away' ? Math.ceil(played / 2) : 0,
        form: formArray,
        // Conserver les données enrichies si disponibles
        rank: teamData.rank,
        points: teamData.points,
      };
    }
  } catch (e) {
    // TheSportsDB indisponible → fallback xG
    console.debug(`⚠️ TheSportsDB indisponible pour ${teamName}, fallback xG`);
  }

  // PRIORITÉ 2: Fallback xG depuis FBref (context)
  const form = side === 'home' ? context?.fbref?.homeForm : context?.fbref?.awayForm;
  const xg = side === 'home' ? context?.fbref?.homeXG : context?.fbref?.awayXG;
  
  let xGFor90: number;
  let xGAgainst90: number;
  
  if (xg && xg.matches > 0) {
    // Données FBref disponibles → utiliser les vrais xG
    xGFor90 = xg.xG / xg.matches;
    xGAgainst90 = xg.xGA / xg.matches;
  } else if (impliedHomeProb !== undefined && impliedAwayProb !== undefined) {
    // PAS de données réelles → dériver la force depuis les COTES
    // L'équipe favorite (cote basse) marque plus et encaisse moins
    const avgImplied = (impliedHomeProb + impliedAwayProb) / 2;
    const myImplied = side === 'home' ? impliedHomeProb : impliedAwayProb;
    const oppImplied = side === 'home' ? impliedAwayProb : impliedHomeProb;
    
    // Scale l'attaque: favori > 1.35, outsider < 1.35
    // Scale la défense: favori < 1.10, outsider > 1.10
    const attackScale = myImplied / avgImplied;
    const defenseScale = avgImplied / myImplied;
    
    xGFor90 = 1.35 * Math.max(0.5, Math.min(2.0, attackScale));
    xGAgainst90 = 1.10 * Math.max(0.5, Math.min(2.0, defenseScale));
    
    console.log(`⚠️ Fallback ODDS pour ${teamName}: implied=${(myImplied * 100).toFixed(0)}%, xG=${xGFor90.toFixed(2)}, xGA=${xGAgainst90.toFixed(2)} (scale att=${attackScale.toFixed(2)}, déf=${defenseScale.toFixed(2)})`);
  } else {
    // Ultime fallback (sans cotes)
    xGFor90 = 1.35;
    xGAgainst90 = 1.10;
  }
  
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
  // FIX H4: Protection division par zéro quand odds ≤ 1.0
  const b = odds - 1;
  if (b <= 0) return 0; // Pas de value si odds ≤ 1.0
  const p = probability;
  const q = 1 - p;
  
  const kellyFraction = (b * p - q) / b;
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
