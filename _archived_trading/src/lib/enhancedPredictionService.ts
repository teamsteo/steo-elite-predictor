/**
 * Enhanced Prediction Service - Service de Prédiction Amélioré
 * 
 * Combine plusieurs sources pour des prédictions optimisées:
 * 1. Probabilités implicites du marché (cotes des bookmakers)
 * 2. Modèle Dixon-Coles (si stats d'équipe disponibles)
 * 3. Détection de value bets (comparaison modèle vs marché)
 * 4. Facteurs contextuels (forme, blessures, domicile/extérieur)
 */

import { predictMatch } from './dixonColesModel';
import { getTeamStatsByName, type TeamStats } from './teamStatsService';

// Interface pour les prédictions enrichies
export interface EnhancedPrediction {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  
  // Cotes
  odds: {
    home: number;
    draw: number | null;
    away: number;
    source: string;
  };
  
  // Probabilités du marché (implicites)
  marketProbabilities: {
    home: number;
    draw: number;
    away: number;
    margin: number; // Marge du bookmaker
  };
  
  // Probabilités du modèle Dixon-Coles (si disponible)
  modelProbabilities: {
    home: number;
    draw: number;
    away: number;
    expectedHomeGoals: number;
    expectedAwayGoals: number;
    over25: number;
    btts: number;
  } | null;
  
  // Probabilités finales (combinaison)
  finalProbabilities: {
    home: number;
    draw: number;
    away: number;
    method: 'market_only' | 'model_only' | 'weighted_average';
  };
  
  // Value Bets détectés
  valueBets: {
    type: 'home' | 'draw' | 'away' | 'over_2.5' | 'under_2.5' | 'btts_yes' | 'btts_no';
    label: string;
    modelProb: number;
    marketProb: number;
    edge: number; // Différence en %
    odds: number;
    kellyStake: number;
    confidence: 'strong' | 'moderate' | 'weak';
    explanation: string;
  }[];
  
  // Stats d'équipe (si disponibles)
  teamStats: {
    home: TeamStats | null;
    away: TeamStats | null;
    formAdvantage: 'home' | 'away' | 'neutral';
    rankAdvantage: 'home' | 'away' | 'neutral';
  };
  
  // Facteurs contextuels
  factors: {
    homeAdvantage: number; // 0-10
    formDifferential: number; // -10 à +10
    motivationLevel: 'high' | 'normal' | 'low';
    isDerby: boolean;
  };
  
  // Niveau de confiance global
  confidence: {
    level: 'very_high' | 'high' | 'medium' | 'low';
    score: number; // 0-100
    reasons: string[];
  };
  
  // Recommandation principale
  recommendation: {
    bet: string;
    odds: number;
    probability: number;
    value: number; // Edge %
    stake: number; // Kelly %
    risk: 'low' | 'medium' | 'high';
  };
}

// Cache pour les prédictions
const predictionCache = new Map<string, { data: EnhancedPrediction; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Calcule les probabilités implicites depuis les cotes
 */
function calculateMarketProbabilities(
  oddsHome: number,
  oddsDraw: number | null,
  oddsAway: number
): { home: number; draw: number; away: number; margin: number } {
  if (!oddsHome || !oddsAway || oddsHome <= 1 || oddsAway <= 1) {
    return { home: 33, draw: 34, away: 33, margin: 0 };
  }
  
  const homeProb = 1 / oddsHome;
  const awayProb = 1 / oddsAway;
  const drawProb = oddsDraw && oddsDraw > 1 ? 1 / oddsDraw : 0.28;
  
  const total = homeProb + awayProb + drawProb;
  const margin = (total - 1) * 100; // Marge du bookmaker en %
  
  return {
    home: Math.round((homeProb / total) * 100),
    draw: Math.round((drawProb / total) * 100),
    away: Math.round((awayProb / total) * 100),
    margin: Math.round(margin * 10) / 10
  };
}

/**
 * Génère une prédiction enrichie pour un match
 */
export async function generateEnhancedPrediction(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  league: string,
  oddsHome: number,
  oddsDraw: number | null,
  oddsAway: number,
  oddsSource: string
): Promise<EnhancedPrediction> {
  
  // Vérifier le cache
  const cacheKey = matchId;
  const cached = predictionCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }
  
  // 1. Calculer les probabilités du marché
  const marketProbs = calculateMarketProbabilities(oddsHome, oddsDraw, oddsAway);
  
  // 2. Récupérer les stats d'équipe
  let homeStats: TeamStats | null = null;
  let awayStats: TeamStats | null = null;
  
  try {
    const statsResult = await Promise.all([
      getTeamStatsByName(homeTeam),
      getTeamStatsByName(awayTeam)
    ]);
    homeStats = statsResult[0];
    awayStats = statsResult[1];
  } catch (e) {
    console.log(`Stats non disponibles pour ${homeTeam} vs ${awayTeam}`);
  }
  
  // 3. Calculer les probabilités du modèle Dixon-Coles si stats disponibles
  let modelProbs: EnhancedPrediction['modelProbabilities'] = null;
  
  if (homeStats && awayStats) {
    try {
      const modelResult = predictMatch(
        {
          name: homeTeam,
          goalsScored: homeStats.goalsFor,
          goalsConceded: homeStats.goalsAgainst,
          matches: homeStats.played,
          form: convertFormToNumbers(homeStats.form)
        },
        {
          name: awayTeam,
          goalsScored: awayStats.goalsFor,
          goalsConceded: awayStats.goalsAgainst,
          matches: awayStats.played,
          form: convertFormToNumbers(awayStats.form)
        },
        league,
        oddsHome,
        oddsDraw || 3.3,
        oddsAway
      );
      
      modelProbs = {
        home: modelResult.homeWinProb,
        draw: modelResult.drawProb,
        away: modelResult.awayWinProb,
        expectedHomeGoals: modelResult.expectedHomeGoals,
        expectedAwayGoals: modelResult.expectedAwayGoals,
        over25: modelResult.over25,
        btts: modelResult.btts.yes
      };
    } catch (e) {
      console.log(`Erreur modèle Dixon-Coles:`, e);
    }
  }
  
  // 4. Calculer les probabilités finales (combinaison)
  let finalProbs: EnhancedPrediction['finalProbabilities'];
  
  if (modelProbs) {
    // Moyenne pondérée: 60% modèle, 40% marché
    const modelWeight = 0.6;
    const marketWeight = 0.4;
    
    finalProbs = {
      home: Math.round(modelProbs.home * modelWeight + marketProbs.home * marketWeight),
      draw: Math.round(modelProbs.draw * modelWeight + marketProbs.draw * marketWeight),
      away: Math.round(modelProbs.away * modelWeight + marketProbs.away * marketWeight),
      method: 'weighted_average'
    };
  } else {
    finalProbs = {
      home: marketProbs.home,
      draw: marketProbs.draw,
      away: marketProbs.away,
      method: 'market_only'
    };
  }
  
  // Normaliser les probabilités finales
  const totalFinal = finalProbs.home + finalProbs.draw + finalProbs.away;
  if (totalFinal !== 100) {
    const factor = 100 / totalFinal;
    finalProbs.home = Math.round(finalProbs.home * factor);
    finalProbs.draw = Math.round(finalProbs.draw * factor);
    finalProbs.away = Math.round(finalProbs.away * factor);
  }
  
  // 5. Détecter les value bets
  const valueBets: EnhancedPrediction['valueBets'] = [];
  
  // Value bet sur 1
  if (modelProbs && finalProbs.home > marketProbs.home + 3) {
    const edge = finalProbs.home - marketProbs.home;
    const kelly = calculateKellyStake(finalProbs.home / 100, oddsHome);
    
    valueBets.push({
      type: 'home',
      label: `1 - ${homeTeam}`,
      modelProb: finalProbs.home,
      marketProb: marketProbs.home,
      edge,
      odds: oddsHome,
      kellyStake: kelly,
      confidence: edge > 8 ? 'strong' : edge > 5 ? 'moderate' : 'weak',
      explanation: `Modèle estime ${finalProbs.home}% vs marché ${marketProbs.home}% (+${edge}% edge)`
    });
  }
  
  // Value bet sur X
  if (oddsDraw && modelProbs && finalProbs.draw > marketProbs.draw + 3) {
    const edge = finalProbs.draw - marketProbs.draw;
    const kelly = calculateKellyStake(finalProbs.draw / 100, oddsDraw);
    
    valueBets.push({
      type: 'draw',
      label: 'X - Match nul',
      modelProb: finalProbs.draw,
      marketProb: marketProbs.draw,
      edge,
      odds: oddsDraw,
      kellyStake: kelly,
      confidence: edge > 6 ? 'strong' : edge > 4 ? 'moderate' : 'weak',
      explanation: `Modèle estime ${finalProbs.draw}% vs marché ${marketProbs.draw}% (+${edge}% edge)`
    });
  }
  
  // Value bet sur 2
  if (modelProbs && finalProbs.away > marketProbs.away + 3) {
    const edge = finalProbs.away - marketProbs.away;
    const kelly = calculateKellyStake(finalProbs.away / 100, oddsAway);
    
    valueBets.push({
      type: 'away',
      label: `2 - ${awayTeam}`,
      modelProb: finalProbs.away,
      marketProb: marketProbs.away,
      edge,
      odds: oddsAway,
      kellyStake: kelly,
      confidence: edge > 8 ? 'strong' : edge > 5 ? 'moderate' : 'weak',
      explanation: `Modèle estime ${finalProbs.away}% vs marché ${marketProbs.away}% (+${edge}% edge)`
    });
  }
  
  // Over/Under 2.5
  if (modelProbs) {
    const over25Market = 52; // Approximation standard
    if (modelProbs.over25 > over25Market + 5) {
      valueBets.push({
        type: 'over_2.5',
        label: '+2.5 buts',
        modelProb: modelProbs.over25,
        marketProb: over25Market,
        edge: modelProbs.over25 - over25Market,
        odds: 1.90,
        kellyStake: calculateKellyStake(modelProbs.over25 / 100, 1.90),
        confidence: modelProbs.over25 > 60 ? 'strong' : 'moderate',
        explanation: `Modèle prévoit ${modelProbs.expectedHomeGoals + modelProbs.expectedAwayGoals} buts attendus`
      });
    }
    
    if (modelProbs.over25 < over25Market - 5) {
      valueBets.push({
        type: 'under_2.5',
        label: '-2.5 buts',
        modelProb: 100 - modelProbs.over25,
        marketProb: 100 - over25Market,
        edge: (100 - modelProbs.over25) - (100 - over25Market),
        odds: 1.90,
        kellyStake: calculateKellyStake((100 - modelProbs.over25) / 100, 1.90),
        confidence: modelProbs.over25 < 45 ? 'strong' : 'moderate',
        explanation: `Modèle prévoit ${modelProbs.expectedHomeGoals + modelProbs.expectedAwayGoals} buts attendus`
      });
    }
  }
  
  // 6. Calculer les facteurs contextuels
  const formAdvantage = homeStats && awayStats 
    ? (homeStats.formAnalysis.formPoints > awayStats.formAnalysis.formPoints ? 'home' 
       : awayStats.formAnalysis.formPoints > homeStats.formAnalysis.formPoints ? 'away' : 'neutral')
    : 'neutral';
  
  const rankAdvantage = homeStats && awayStats
    ? (homeStats.rank < awayStats.rank ? 'home'
       : awayStats.rank < homeStats.rank ? 'away' : 'neutral')
    : 'neutral';
  
  const formDiff = homeStats && awayStats
    ? (homeStats.formAnalysis.formPoints - awayStats.formAnalysis.formPoints) * 2
    : 0;
  
  // 7. Déterminer le niveau de confiance
  const confidenceReasons: string[] = [];
  let confidenceScore = 50;
  
  if (homeStats && awayStats) {
    confidenceScore += 20;
    confidenceReasons.push('Stats équipe disponibles');
  }
  
  if (modelProbs) {
    confidenceScore += 15;
    confidenceReasons.push('Modèle Dixon-Coles appliqué');
  }
  
  const maxProb = Math.max(finalProbs.home, finalProbs.away);
  if (maxProb > 55) {
    confidenceScore += 15;
    confidenceReasons.push('Favori clair identifié');
  } else if (maxProb < 40) {
    confidenceScore -= 10;
    confidenceReasons.push('Match équilibré');
  }
  
  if (formAdvantage !== 'neutral' && formAdvantage === rankAdvantage) {
    confidenceScore += 10;
    confidenceReasons.push('Forme et classement alignés');
  }
  
  if (oddsSource.includes('ESPN') || oddsSource.includes('The Odds API')) {
    confidenceScore += 10;
    confidenceReasons.push('Cotes réelles bookmakers');
  }
  
  const confidenceLevel: 'very_high' | 'high' | 'medium' | 'low' = 
    confidenceScore >= 80 ? 'very_high' 
    : confidenceScore >= 65 ? 'high'
    : confidenceScore >= 45 ? 'medium' : 'low';
  
  // 8. Générer la recommandation principale
  const bestValueBet = valueBets.sort((a, b) => b.edge - a.edge)[0];
  
  let recommendation: EnhancedPrediction['recommendation'];
  
  if (bestValueBet && bestValueBet.confidence !== 'weak') {
    recommendation = {
      bet: bestValueBet.label,
      odds: bestValueBet.odds,
      probability: bestValueBet.modelProb,
      value: bestValueBet.edge,
      stake: bestValueBet.kellyStake,
      risk: bestValueBet.confidence === 'strong' ? 'low' : 'medium'
    };
  } else {
    // Recommandation par défaut basée sur les probabilités
    const maxProbType = finalProbs.home >= finalProbs.away 
      ? (finalProbs.home >= finalProbs.draw ? 'home' : 'draw')
      : (finalProbs.away >= finalProbs.draw ? 'away' : 'draw');
    
    recommendation = {
      bet: maxProbType === 'home' ? `1 - ${homeTeam}` : maxProbType === 'away' ? `2 - ${awayTeam}` : 'X - Match nul',
      odds: maxProbType === 'home' ? oddsHome : maxProbType === 'away' ? oddsAway : (oddsDraw || 3.3),
      probability: maxProbType === 'home' ? finalProbs.home : maxProbType === 'away' ? finalProbs.away : finalProbs.draw,
      value: 0,
      stake: 0,
      risk: 'high'
    };
  }
  
  // Construire la prédiction enrichie
  const prediction: EnhancedPrediction = {
    matchId,
    homeTeam,
    awayTeam,
    league,
    odds: { home: oddsHome, draw: oddsDraw, away: oddsAway, source: oddsSource },
    marketProbabilities: marketProbs,
    modelProbabilities: modelProbs,
    finalProbabilities: finalProbs,
    valueBets,
    teamStats: {
      home: homeStats,
      away: awayStats,
      formAdvantage,
      rankAdvantage
    },
    factors: {
      homeAdvantage: 5, // Basique pour l'instant
      formDifferential: formDiff,
      motivationLevel: 'normal',
      isDerby: false
    },
    confidence: {
      level: confidenceLevel,
      score: Math.min(100, Math.max(0, confidenceScore)),
      reasons: confidenceReasons
    },
    recommendation
  };
  
  // Mettre en cache
  predictionCache.set(cacheKey, { data: prediction, timestamp: Date.now() });
  
  return prediction;
}

/**
 * Convertit une chaîne de forme (ex: "WWLWD") en nombres
 */
function convertFormToNumbers(form: string): number[] {
  if (!form) return [];
  
  return form.toUpperCase().split('').map(result => {
    if (result === 'W') return 1;
    if (result === 'D') return 0.5;
    return 0;
  });
}

/**
 * Calcule le Kelly Criterion
 */
function calculateKellyStake(probability: number, odds: number): number {
  const edge = probability * odds - 1;
  if (edge <= 0) return 0;
  
  const kelly = edge / (odds - 1);
  // Cap à 10% pour la sécurité
  return Math.min(Math.round(kelly * 100 * 10) / 10, 10);
}

/**
 * Récupère les prédictions en cache
 */
export function getCachedPredictions(): EnhancedPrediction[] {
  const predictions: EnhancedPrediction[] = [];
  for (const [, value] of predictionCache) {
    predictions.push(value.data);
  }
  return predictions;
}

export default {
  generateEnhancedPrediction,
  getCachedPredictions
};
