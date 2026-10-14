/**
 * Enhanced Prediction Service
 * 
 * Combine tous les facteurs d'analyse pour des prédictions optimisées:
 * - Modèle Dixon-Coles (probabilités de base)
 * - Météo (impact sur les buts)
 * - Motivation/Contexte (ajustement probas)
 * - Kelly Criterion (mise optimale)
 * 
 * Output: Prédiction enrichie avec tous les facteurs
 */

import { calculateKellyBet, type KellyResult } from './kellyCriterionService';
import { 
  analyzeMatchMotivation,
  adjustProbabilitiesByMotivation,
  createTeamContext,
  type TeamMotivationData
} from './matchContextService';
import { getMatchWeather, type WeatherData } from './weatherService';

// ============================================
// TYPES
// ============================================

export interface EnhancedPrediction {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  
  // Probabilités
  baseProbabilities: {
    home: number;
    draw: number;
    away: number;
  };
  adjustedProbabilities: {
    home: number;
    draw: number;
    away: number;
  };
  
  // Ajustements
  adjustments: {
    weather: { applied: boolean; impact: number; condition: string };
    motivation: { applied: boolean; home: number; away: number; impact: number };
  };
  
  // Value Bet
  valueBet: {
    detected: boolean;
    type: 'home' | 'draw' | 'away' | null;
    edge: number;
    odds: number;
    kelly?: KellyResult;
  };
  
  // Score attendu
  expectedScore: { home: number; away: number; total: number };
  
  // Over/Under
  overUnder25: { over: number; under: number; recommendation: 'over' | 'under' | 'skip' };
  
  // BTTS
  btts: { yes: number; no: number; recommendation: 'yes' | 'no' | 'skip' };
  
  // Confiance
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  confidenceScore: number;
  riskLevel: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  
  // Explication
  explanation: string[];
  
  // Métadonnées
  analyzedAt: string;
  factorsUsed: string[];
}

export interface PredictionInput {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  
  oddsHome: number;
  oddsDraw: number;
  oddsAway: number;
  
  baseHomeWin: number;
  baseDraw: number;
  baseAwayWin: number;
  
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  
  homeContext?: TeamMotivationData;
  awayContext?: TeamMotivationData;
  
  bankroll?: number;
}

// ============================================
// CONSTANTS
// ============================================

const VALUE_BET_EDGE_MIN = 3;

// ============================================
// MAIN FUNCTION
// ============================================

export async function generateEnhancedPrediction(input: PredictionInput): Promise<EnhancedPrediction> {
  const factorsUsed: string[] = ['dixon_coles'];
  const explanations: string[] = [];
  
  // Initialiser
  let adjustedHome = input.baseHomeWin;
  let adjustedDraw = input.baseDraw;
  let adjustedAway = input.baseAwayWin;
  
  let weatherApplied = false;
  let weatherImpact = 0;
  let weatherCondition = 'unknown';
  let motivationApplied = false;
  let homeMotivation = 50;
  let awayMotivation = 50;
  let motivationImpact = 0;
  
  // 1. Analyser la motivation si données disponibles
  if (input.homeContext && input.awayContext) {
    factorsUsed.push('motivation');
    
    const motivation = analyzeMatchMotivation(
      input.homeTeam,
      input.awayTeam,
      input.homeContext,
      input.awayContext
    );
    
    homeMotivation = motivation.homeMotivation;
    awayMotivation = motivation.awayMotivation;
    motivationApplied = true;
    motivationImpact = motivation.difference * 0.2;
    
    // Ajuster les probabilités
    const adjusted = adjustProbabilitiesByMotivation(
      adjustedHome,
      adjustedDraw,
      adjustedAway,
      motivation
    );
    
    adjustedHome = adjusted.home;
    adjustedDraw = adjusted.draw;
    adjustedAway = adjusted.away;
    
    if (Math.abs(motivation.difference) > 10) {
      explanations.push(`Motivation: ${motivation.explanation}`);
    }
  }
  
  // 2. Analyser la météo
  let weatherData: WeatherData | undefined;
  try {
    const wd = await getMatchWeather(input.homeTeam);
    if (wd) {
      weatherData = wd;
      factorsUsed.push('weather');
      weatherApplied = true;
      weatherImpact = wd.impact.goalsAdjustment;
      weatherCondition = wd.current.condition;
      
      if (wd.impact.overall !== 'ideal') {
        explanations.push(`Météo: ${wd.impact.factors[0]}`);
      }
    }
  } catch (e) {
    // Météo non disponible
  }
  
  // 3. Normaliser
  const total = adjustedHome + adjustedDraw + adjustedAway;
  adjustedHome = (adjustedHome / total) * 100;
  adjustedDraw = (adjustedDraw / total) * 100;
  adjustedAway = (adjustedAway / total) * 100;
  
  // 4. Détecter value bets
  const valueBet = detectValueBet(
    { home: adjustedHome, draw: adjustedDraw, away: adjustedAway },
    { home: input.oddsHome, draw: input.oddsDraw, away: input.oddsAway },
    input.bankroll || 1000
  );
  
  if (valueBet.detected) {
    explanations.push(`Value Bet: ${valueBet.type} @ ${valueBet.odds} (edge: ${valueBet.edge.toFixed(1)}%)`);
  }
  
  // 5. Calculer confiance
  const confidenceScore = calculateConfidenceScore(
    Math.max(adjustedHome, adjustedAway),
    valueBet.edge,
    weatherApplied
  );
  const confidence = mapConfidence(confidenceScore);
  const riskLevel = mapRiskLevel(confidenceScore, weatherImpact);
  
  // 6. Over/Under
  const expectedTotal = input.expectedHomeGoals + input.expectedAwayGoals + weatherImpact;
  const overProb = calculateOverProb(expectedTotal);
  
  // 7. BTTS
  const bttsProb = calculateBTTS(input.expectedHomeGoals, input.expectedAwayGoals);
  
  return {
    matchId: input.matchId,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    league: input.league,
    
    baseProbabilities: {
      home: input.baseHomeWin,
      draw: input.baseDraw,
      away: input.baseAwayWin,
    },
    
    adjustedProbabilities: {
      home: Math.round(adjustedHome * 10) / 10,
      draw: Math.round(adjustedDraw * 10) / 10,
      away: Math.round(adjustedAway * 10) / 10,
    },
    
    adjustments: {
      weather: { applied: weatherApplied, impact: weatherImpact, condition: weatherCondition },
      motivation: { applied: motivationApplied, home: homeMotivation, away: awayMotivation, impact: motivationImpact },
    },
    
    valueBet,
    
    expectedScore: {
      home: Math.round((input.expectedHomeGoals + weatherImpact / 2) * 100) / 100,
      away: Math.round((input.expectedAwayGoals + weatherImpact / 2) * 100) / 100,
      total: Math.round(expectedTotal * 100) / 100,
    },
    
    overUnder25: {
      over: Math.round(overProb * 10) / 10,
      under: Math.round((100 - overProb) * 10) / 10,
      recommendation: overProb > 55 ? 'over' : overProb < 45 ? 'under' : 'skip',
    },
    
    btts: {
      yes: Math.round(bttsProb * 10) / 10,
      no: Math.round((100 - bttsProb) * 10) / 10,
      recommendation: bttsProb > 55 ? 'yes' : bttsProb < 45 ? 'no' : 'skip',
    },
    
    confidence,
    confidenceScore,
    riskLevel,
    explanation: explanations,
    analyzedAt: new Date().toISOString(),
    factorsUsed,
  };
}

// ============================================
// HELPERS
// ============================================

function detectValueBet(
  probs: { home: number; draw: number; away: number },
  odds: { home: number; draw: number; away: number },
  bankroll: number
): EnhancedPrediction['valueBet'] {
  const edges = {
    home: probs.home - (1 / odds.home * 100),
    draw: probs.draw - (1 / odds.draw * 100),
    away: probs.away - (1 / odds.away * 100),
  };
  
  let bestType: 'home' | 'draw' | 'away' | null = null;
  let bestEdge = 0;
  
  for (const [type, edge] of Object.entries(edges)) {
    if (edge > bestEdge && edge > VALUE_BET_EDGE_MIN) {
      bestType = type as 'home' | 'draw' | 'away';
      bestEdge = edge;
    }
  }
  
  if (!bestType) {
    return { detected: false, type: null, edge: 0, odds: 0 };
  }
  
  const kelly = calculateKellyBet({
    odds: odds[bestType] as number,
    probability: probs[bestType] as number,
    bankroll: bankroll as number,
  });
  
  return {
    detected: true,
    type: bestType,
    edge: bestEdge,
    odds: odds[bestType],
    kelly,
  };
}

function calculateOverProb(expectedTotal: number): number {
  if (expectedTotal <= 0) return 30;
  if (expectedTotal >= 4) return 70;
  return 35 + (expectedTotal - 1.5) * 15;
}

function calculateBTTS(homeGoals: number, awayGoals: number): number {
  const homeScores = 1 - Math.exp(-homeGoals);
  const awayScores = 1 - Math.exp(-awayGoals);
  return homeScores * awayScores * 100;
}

function calculateConfidenceScore(
  maxProb: number,
  edge: number,
  hasWeather: boolean
): number {
  let score = 50;
  
  if (maxProb >= 60) score += 15;
  else if (maxProb >= 50) score += 10;
  
  if (edge >= 8) score += 15;
  else if (edge >= 5) score += 10;
  else if (edge >= 3) score += 5;
  
  if (hasWeather) score += 5;
  
  return Math.min(100, Math.max(0, score));
}

function mapConfidence(score: number): 'very_high' | 'high' | 'medium' | 'low' {
  if (score >= 75) return 'very_high';
  if (score >= 60) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

function mapRiskLevel(
  confidence: number,
  weatherImpact: number
): 'very_low' | 'low' | 'medium' | 'high' | 'very_high' {
  let risk = 50 - confidence * 0.4;
  if (Math.abs(weatherImpact) > 0.15) risk += 10;
  if (risk >= 70) return 'very_high';
  if (risk >= 55) return 'high';
  if (risk >= 40) return 'medium';
  if (risk >= 25) return 'low';
  return 'very_low';
}

// ============================================
// EXPORT
// ============================================

const EnhancedPredictionService = {
  generateEnhancedPrediction,
};

export default EnhancedPredictionService;
