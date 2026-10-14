/**
 * Expert Advisor Service - Conseiller Pronostics Intelligent V3
 * 
 * ARCHITECTURE UNIFIÉE:
 * =====================
 * Ce service utilise MatchContextService qui centralise:
 * - FBref: Forme, xG, discipline, H2H (Football)
 * - Transfermarkt: Blessures Football
 * - NBA Official: Blessures NBA
 * - Web Search: News récentes
 * 
 * INTÉGRATION UNIFIED PREDICTION SERVICE (V3):
 * - ESPN/DraftKings odds avec cascade de fallback
 * - Dixon-Coles statistical model pour le football
 * - Seuils ML adaptatifs dynamiques
 * - Combinaison multi-sources pour prédictions améliorées
 * 
 * PHILOSOPHIE:
 * - "Les bookmakers ne se trompent pas souvent, mais quand ils le font, c'est un value bet"
 * - Analyse froide basée sur les données, pas les émotions
 * - Transparence totale sur le raisonnement et les sources
 * - Prudence avant tout - identifier les pièges avant de conseiller
 * 
 * ALGORITHME:
 * 1. Récupérer contexte unifié (toutes sources)
 * 2. Calculer probabilités ajustées (cotes + contexte + Dixon-Coles + ML)
 * 3. Détecter value bets (edge > seuil ML adaptatif)
 * 4. Calculer mise Kelly optimale avec poids adaptatifs
 * 5. Générer avertissements et raisonnement
 */

import ZAI from 'z-ai-web-dev-sdk';
import {
  getUnifiedMatchContext,
  calculateContextAdjustment,
  UnifiedMatchContext,
} from './matchContextService';
import {
  recordPrediction,
  PredictionRecord,
} from './predictionTracker';
import {
  getAdaptiveThresholds,
  MLThresholds,
} from './adaptiveThresholdsML';
import {
  getUnifiedPrediction as getUnifiedPredictionFromService,
  UnifiedPrediction,
  UnifiedPredictionInput,
} from './unifiedPredictionService';
import { formatOdds, formatNumber, formatPercent } from './formatUtils';

// ============================================
// TYPES
// ============================================

export interface ExpertAdvice {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  
  // Contexte unifié (NOUVEAU)
  unifiedContext: {
    sourcesUsed: string[];
    dataQuality: number;
    overallAdvantage: 'home' | 'away' | 'neutral';
    keyFactors: string[];
  };
  
  // Météo (NOUVEAU - Football uniquement)
  weather?: {
    temperature: number;
    condition: string;
    windSpeed: number;
    impact: 'ideal' | 'minor' | 'moderate' | 'significant' | 'extreme';
    factors: string[];
  };
  
  // ML Adaptatif (NOUVEAU)
  mlInfo?: {
    edgeThreshold: number;
    modelAccuracy: number;
    adaptiveWeights: { form: number; xg: number; injuries: number };
  };
  
  // Détails par source
  contextDetails: {
    // Blessures
    injuries: {
      home: number;
      away: number;
      homeImpact: number;
      awayImpact: number;
      summary: string;
      keyAbsentees: { home: string[]; away: string[] };
      source: string;
    };
    // FBref (Football uniquement)
    fbref?: {
      homeForm: string | null;
      awayForm: string | null;
      homeXG: number | null;
      awayXG: number | null;
      h2hTrend: string | null;
      disciplineRisk: 'low' | 'medium' | 'high';
    };
    // News
    news: string[];
  };
  
  // Analyse des cotes
  oddsAnalysis: {
    favorite: string;
    favoriteOdds: number;
    favoriteType: 'home' | 'away';
    impliedProbability: number;
    estimatedProbability: number;
    edge: number;
    isValueBet: boolean;
    publicPercentage: number;
    isPublicFade: boolean;
    publicFadeExplanation: string;
  };
  
  // Recommandation
  recommendation: {
    bet: 'home' | 'draw' | 'away' | 'avoid';
    confidence: 'very_high' | 'high' | 'medium' | 'low';
    reasoning: string[];
    kellyStake: number;
    maxStake: number;
    expectedValue: number;
  };
  
  // Avertissements
  warnings: string[];
  
  // Métadonnées
  generatedAt: string;
  dataQuality: 'high' | 'medium' | 'low';
  processingTimeMs: number;
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Calcule le Critère de Kelly pour la mise optimale
 * 
 * Formule: f* = (bp - q) / b
 * où:
 *   f* = fraction du bankroll à parier
 *   b  = cote décimale - 1 (gain net pour 1 unité)
 *   p  = probabilité estimée de gagner
 *   q  = 1 - p (probabilité de perdre)
 * 
 * Utilise les seuils ML adaptatifs pour les poids de confiance
 */
export function calculateKellyCriterion(
  odds: number,
  estimatedProbability: number,
  confidence: 'very_high' | 'high' | 'medium' | 'low',
  mlThresholds?: MLThresholds
): { kellyFraction: number; adjustedFraction: number; maxStake: number } {
  const b = odds - 1;
  const p = estimatedProbability;
  const q = 1 - p;
  
  let kellyFraction = (b * p - q) / b;
  kellyFraction = Math.max(0, kellyFraction);
  
  // Utiliser les poids ML adaptatifs ou les valeurs par défaut
  const confidenceMultiplier = mlThresholds?.confidenceWeights || {
    very_high: 0.5,
    high: 0.4,
    medium: 0.25,
    low: 0.1,
  };
  
  const adjustedFraction = kellyFraction * confidenceMultiplier[confidence];
  const maxStake = Math.min(adjustedFraction, 0.05);
  
  return {
    kellyFraction: Math.round(kellyFraction * 1000) / 1000,
    adjustedFraction: Math.round(adjustedFraction * 1000) / 1000,
    maxStake: Math.round(maxStake * 1000) / 1000,
  };
}

/**
 * Estime le pourcentage de paris publics
 * Le public a tendance à surestimer les favoris
 */
export function estimatePublicPercentage(
  oddsHome: number,
  oddsAway: number,
  oddsDraw: number | null
): { home: number; draw: number; away: number } {
  const totalImplied = (1 / oddsHome) + (1 / oddsAway) + (oddsDraw ? 1 / oddsDraw : 0);
  
  const impliedHome = (1 / oddsHome) / totalImplied;
  const impliedAway = (1 / oddsAway) / totalImplied;
  const impliedDraw = oddsDraw ? (1 / oddsDraw) / totalImplied : 0;
  
  const publicBiasFactor = 1.15;
  
  let publicHome = impliedHome;
  let publicAway = impliedAway;
  let publicDraw = impliedDraw;
  
  if (oddsHome < oddsAway) {
    publicHome *= publicBiasFactor;
    publicAway *= 0.9;
  } else if (oddsAway < oddsHome) {
    publicAway *= publicBiasFactor;
    publicHome *= 0.9;
  }
  
  const total = publicHome + publicAway + publicDraw;
  
  return {
    home: Math.round((publicHome / total) * 100),
    draw: Math.round((publicDraw / total) * 100),
    away: Math.round((publicAway / total) * 100),
  };
}

/**
 * Détecte un "Public Fade" (parier contre le public)
 */
function detectPublicFade(
  publicPercentage: number,
  edge: number,
  betType: 'home' | 'draw' | 'away'
): { isPublicFade: boolean; explanation: string } {
  if (publicPercentage < 35 && edge > 0.03) {
    return {
      isPublicFade: true,
      explanation: `Opportunité: le public sous-estime ce résultat (${publicPercentage}% vs edge +${Math.round(edge * 100)}%)`,
    };
  }
  
  if (publicPercentage > 65) {
    return {
      isPublicFade: false,
      explanation: `Attention: le public surestime ce résultat (${publicPercentage}% des paris). Risque de piège.`,
    };
  }
  
  return {
    isPublicFade: false,
    explanation: `Répartition publique équilibrée (${publicPercentage}%)`,
  };
}

// ============================================
// FONCTION PRINCIPALE
// ============================================

/**
 * Génère un conseil expert complet pour un match
 * Utilise le contexte unifié de toutes les sources
 * 
 * @param match Les informations du match
 * @param options Options supplémentaires
 * @param options.trackPrediction Enregistrer la prédiction pour le ML (défaut: true)
 */
export async function generateExpertAdvice(match: {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  matchDate?: string;
}, options?: {
  trackPrediction?: boolean;
}): Promise<ExpertAdvice> {
  const startTime = Date.now();
  const trackPrediction = options?.trackPrediction !== false;
  console.log(`🎯 Expert Advisor V2: ${match.homeTeam} vs ${match.awayTeam}`);
  
  // 1. Récupérer le contexte unifié (FBref + Blessures + News)
  const sportType = match.sport.toLowerCase().includes('basket') || 
                    match.sport.toLowerCase().includes('nba') 
                    ? 'basketball' : 'football';
  
  // Récupérer les seuils ML adaptatifs
  const mlThresholds = getAdaptiveThresholds(sportType);
  console.log(`🧠 Seuils ML: edge=${(mlThresholds.edgeThreshold * 100).toFixed(1)}%, confidence modèle=${(mlThresholds.accuracy || 0).toFixed(1)}%`);
  
  const context = await getUnifiedMatchContext({
    matchId: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    sport: sportType,
    league: match.league,
  });
  
  // 2. Calculer les ajustements de probabilité
  const adjustments = calculateContextAdjustment(context);
  
  // 3. Analyser les cotes
  const favorite = match.oddsHome < match.oddsAway ? match.homeTeam : match.awayTeam;
  const favoriteOdds = Math.min(match.oddsHome, match.oddsAway);
  const favoriteType = match.oddsHome < match.oddsAway ? 'home' : 'away';
  
  // Probabilités implicites
  const totalImplied = (1 / match.oddsHome) + (1 / match.oddsAway) + (match.oddsDraw ? 1 / match.oddsDraw : 0);
  const impliedHome = (1 / match.oddsHome) / totalImplied;
  const impliedAway = (1 / match.oddsAway) / totalImplied;
  const impliedDraw = match.oddsDraw ? (1 / match.oddsDraw) / totalImplied : 0;
  
  // Probabilités ajustées avec le contexte
  let estimatedHome = impliedHome + adjustments.homeAdjustment;
  let estimatedAway = impliedAway + adjustments.awayAdjustment;
  
  // Normaliser
  const totalEstimated = estimatedHome + estimatedAway + impliedDraw;
  estimatedHome /= totalEstimated;
  estimatedAway /= totalEstimated;
  
  // Edge calculé
  const homeEdge = estimatedHome - impliedHome;
  const awayEdge = estimatedAway - impliedAway;
  
  // Déterminer le meilleur pari
  let bestBet: 'home' | 'draw' | 'away' = 'home';
  let bestEdge = homeEdge;
  let bestOdds = match.oddsHome;
  let bestProb = estimatedHome;
  
  if (awayEdge > homeEdge) {
    bestBet = 'away';
    bestEdge = awayEdge;
    bestOdds = match.oddsAway;
    bestProb = estimatedAway;
  }
  
  // Value bet si edge > seuil ML (défaut 3%)
  const edgeThreshold = mlThresholds.edgeThreshold || 0.03;
  const isValueBet = bestEdge > edgeThreshold;
  
  // 4. Calculer les pourcentages publics
  const publicPct = estimatePublicPercentage(match.oddsHome, match.oddsAway, match.oddsDraw);
  const publicFade = detectPublicFade(
    bestBet === 'home' ? publicPct.home : publicPct.away,
    bestEdge,
    bestBet
  );
  
  // 5. Déterminer la confiance
  let confidence: 'very_high' | 'high' | 'medium' | 'low' = 'low';
  if (isValueBet && adjustments.confidence >= 0.6) {
    confidence = bestEdge > 0.08 ? 'very_high' : bestEdge > 0.05 ? 'high' : 'medium';
  } else if (isValueBet) {
    confidence = 'medium';
  }
  
  // 6. Calculer le Kelly avec les seuils ML adaptatifs
  const kelly = calculateKellyCriterion(bestOdds, bestProb, confidence, mlThresholds);
  
  // 7. Construire le raisonnement
  const reasoning: string[] = [];
  
  // Value bet
  if (isValueBet) {
    reasoning.push(`📊 VALUE BET: ${bestBet === 'home' ? match.homeTeam : match.awayTeam} sous-évalué de +${Math.round(bestEdge * 100)}%`);
    reasoning.push(`🎯 Cote ${bestOdds.toFixed(2)} vs probabilité estimée ${Math.round(bestProb * 100)}%`);
  } else {
    reasoning.push(`📉 Pas de value bet significatif (edge < 3%)`);
  }
  
  // Avantage global
  if (context.unifiedAnalysis.overallAdvantage !== 'neutral') {
    const advTeam = context.unifiedAnalysis.overallAdvantage === 'home' ? match.homeTeam : match.awayTeam;
    reasoning.push(`⚖️ Avantage contextuel: ${advTeam}`);
  }
  
  // Blessures
  if (context.injuries.home.length > 0 || context.injuries.away.length > 0) {
    reasoning.push(`🏥 Blessures (${context.injuries.source}): ${context.injuries.summary}`);
    
    if (context.injuries.keyAbsentees) {
      if (context.injuries.keyAbsentees.home.length > 0) {
        reasoning.push(`🚨 Absents ${match.homeTeam}: ${context.injuries.keyAbsentees.home.slice(0, 2).join(', ')}`);
      }
      if (context.injuries.keyAbsentees.away.length > 0) {
        reasoning.push(`🚨 Absents ${match.awayTeam}: ${context.injuries.keyAbsentees.away.slice(0, 2).join(', ')}`);
      }
    }
  }
  
  // FBref (Football uniquement)
  if (context.fbref) {
    if (context.fbref.homeForm) {
      reasoning.push(`📈 Forme ${match.homeTeam}: ${context.fbref.homeForm.form} (${context.fbref.homeForm.formPoints}/15 pts)`);
    }
    if (context.fbref.awayForm) {
      reasoning.push(`📈 Forme ${match.awayTeam}: ${context.fbref.awayForm.form} (${context.fbref.awayForm.formPoints}/15 pts)`);
    }
    if (context.fbref.homeXG && context.fbref.awayXG) {
      const xgDiff = context.fbref.homeXG.xGDPer90 - context.fbref.awayXG.xGDPer90;
      if (Math.abs(xgDiff) > 0.2) {
        reasoning.push(`📊 xG Difference: ${xgDiff > 0 ? match.homeTeam : match.awayTeam} +${Math.abs(xgDiff).toFixed(2)}/90`);
      }
    }
    if (context.fbref.analysis.h2hTrend) {
      reasoning.push(`⚔️ H2H: ${context.fbref.analysis.h2hTrend}`);
    }
  }
  
  // Météo (NOUVEAU - Football uniquement)
  if (context.weather && context.weather.impact.overall !== 'ideal') {
    reasoning.push(`🌤️ Météo: ${context.weather.current.temperature}°C, ${context.weather.current.condition}`);
    if (context.weather.impact.overall === 'significant' || context.weather.impact.overall === 'extreme') {
      reasoning.push(`⚠️ Impact météo: ${context.weather.impact.factors.slice(0, 2).join(', ')}`);
    }
    if (context.weather.impact.goalsAdjustment !== 0) {
      reasoning.push(`⚽ Ajustement buts: ${context.weather.impact.goalsAdjustment > 0 ? '+' : ''}${context.weather.impact.goalsAdjustment}`);
    }
  }
  
  // Team News - Coach, finances, conflits (NOUVEAU)
  if (context.teamNews) {
    const { homeTeam: homeNews, awayTeam: awayNews, comparativeImpact } = context.teamNews;
    
    // Afficher les actualités significatives
    if (homeNews.newsItems.length > 0) {
      const criticalNews = homeNews.newsItems.filter(n => n.severity === 'critical' || n.severity === 'high');
      if (criticalNews.length > 0) {
        reasoning.push(`📰 ${match.homeTeam}: ${criticalNews[0].explanation}`);
      }
    }
    
    if (awayNews.newsItems.length > 0) {
      const criticalNews = awayNews.newsItems.filter(n => n.severity === 'critical' || n.severity === 'high');
      if (criticalNews.length > 0) {
        reasoning.push(`📰 ${match.awayTeam}: ${criticalNews[0].explanation}`);
      }
    }
    
    // Afficher l'impact comparatif
    if (Math.abs(comparativeImpact.impactDifference) > 5) {
      reasoning.push(`📊 Impact actualité: ${comparativeImpact.explanation}`);
    }
  }
  
  // News
  if (context.news.formInsights.home) {
    reasoning.push(`📰 ${match.homeTeam}: ${context.news.formInsights.home}`);
  }
  if (context.news.formInsights.away) {
    reasoning.push(`📰 ${match.awayTeam}: ${context.news.formInsights.away}`);
  }
  
  // Public
  reasoning.push(`👥 Public: ${publicPct.home}% ${match.homeTeam}, ${publicPct.away}% ${match.awayTeam}`);
  if (publicFade.isPublicFade) {
    reasoning.push(`💡 ${publicFade.explanation}`);
  }
  
  // 8. Avertissements
  const warnings: string[] = [...context.unifiedAnalysis.warnings];
  
  if (favoriteOdds < 1.3) {
    warnings.push(`⚠️ Favori très lourd (${favoriteOdds.toFixed(2)}). Attention aux surprises.`);
  }
  if (Math.abs(match.oddsHome - match.oddsAway) < 0.3) {
    warnings.push(`⚠️ Match très équilibré. Difficile à prédire.`);
  }
  if (context.unifiedAnalysis.riskLevel === 'high') {
    warnings.push(`⚠️ Risque élevé détecté. Mise minimale recommandée.`);
  }
  if (!isValueBet && confidence === 'low') {
    warnings.push(`⚠️ Confiance faible. Éviter ce pari.`);
  }
  
  // 9. Espérance de gain
  const expectedValue = (bestProb * (bestOdds - 1) - (1 - bestProb)) * 100;
  
  // 10. Qualité des données
  let dataQuality: 'high' | 'medium' | 'low' = 'low';
  if (context.unifiedAnalysis.dataQuality >= 60) {
    dataQuality = 'high';
  } else if (context.unifiedAnalysis.dataQuality >= 30) {
    dataQuality = 'medium';
  }
  
  const processingTime = Date.now() - startTime;
  console.log(`✅ Conseil généré en ${processingTime}ms (${context.sourcesUsed.length} sources)`);
  
  // Construire le résultat
  const advice: ExpertAdvice = {
    matchId: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    sport: match.sport,
    league: match.league,
    
    unifiedContext: {
      sourcesUsed: context.sourcesUsed,
      dataQuality: context.unifiedAnalysis.dataQuality,
      overallAdvantage: context.unifiedAnalysis.overallAdvantage,
      keyFactors: context.unifiedAnalysis.keyFactors,
    },
    
    // Météo (NOUVEAU - Football uniquement)
    weather: context.weather ? {
      temperature: context.weather.current.temperature,
      condition: context.weather.current.condition,
      windSpeed: context.weather.current.windSpeed,
      impact: context.weather.impact.overall,
      factors: context.weather.impact.factors,
    } : undefined,
    
    // ML Adaptatif (NOUVEAU)
    mlInfo: {
      edgeThreshold: mlThresholds.edgeThreshold,
      modelAccuracy: mlThresholds.accuracy || 0,
      adaptiveWeights: {
        form: mlThresholds.formWeight || 0.05,
        xg: mlThresholds.xgWeight || 0.03,
        injuries: mlThresholds.injuryImpactFactor || 1.0,
      },
    },
    
    contextDetails: {
      injuries: {
        home: context.injuries.home.length,
        away: context.injuries.away.length,
        homeImpact: context.injuries.homeImpact,
        awayImpact: context.injuries.awayImpact,
        summary: context.injuries.summary,
        keyAbsentees: context.injuries.keyAbsentees || { home: [], away: [] },
        source: context.injuries.source,
      },
      fbref: context.fbref ? {
        homeForm: context.fbref.homeForm?.form || null,
        awayForm: context.fbref.awayForm?.form || null,
        homeXG: context.fbref.homeXG?.xGDPer90 || null,
        awayXG: context.fbref.awayXG?.xGDPer90 || null,
        h2hTrend: context.fbref.analysis.h2hTrend || null,
        disciplineRisk: context.fbref.analysis.disciplineRisk,
      } : undefined,
      news: context.news.items.slice(0, 3).map(n => n.title),
    },
    
    oddsAnalysis: {
      favorite,
      favoriteOdds,
      favoriteType,
      impliedProbability: Math.round((bestBet === 'home' ? impliedHome : impliedAway) * 100),
      estimatedProbability: Math.round(bestProb * 100),
      edge: Math.round(bestEdge * 100),
      isValueBet,
      publicPercentage: bestBet === 'home' ? publicPct.home : publicPct.away,
      isPublicFade: publicFade.isPublicFade,
      publicFadeExplanation: publicFade.explanation,
    },
    
    recommendation: {
      bet: isValueBet ? bestBet : 'avoid',
      confidence,
      reasoning,
      kellyStake: Math.round(kelly.adjustedFraction * 100),
      maxStake: Math.round(kelly.maxStake * 100),
      expectedValue: Math.round(expectedValue * 10) / 10,
    },
    
    warnings,
    
    generatedAt: new Date().toISOString(),
    dataQuality,
    processingTimeMs: processingTime,
  };
  
  // Enregistrer la prédiction pour le ML (async - fire and forget)
  if (trackPrediction) {
    // Ne pas attendre - éviter de bloquer la réponse
    recordPrediction({
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      sport: sportType,
      league: match.league,
      matchDate: match.matchDate || new Date().toISOString(),
      prediction: {
        bet: advice.recommendation.bet,
        confidence: advice.recommendation.confidence,
        kellyStake: advice.recommendation.kellyStake,
        expectedValue: advice.recommendation.expectedValue,
        edge: advice.oddsAnalysis.edge,
        reasoning: advice.recommendation.reasoning,
      },
      odds: {
        home: match.oddsHome,
        draw: match.oddsDraw,
        away: match.oddsAway,
      },
      context: {
        dataQuality: context.unifiedAnalysis.dataQuality,
        sourcesUsed: context.sourcesUsed,
        homeInjuries: context.injuries.home.length,
        awayInjuries: context.injuries.away.length,
        homeFormScore: context.fbref?.homeForm?.formPoints,
        awayFormScore: context.fbref?.awayForm?.formPoints,
        homeXG: context.fbref?.homeXG?.xGDPer90,
        awayXG: context.fbref?.awayXG?.xGDPer90,
        homeNetRating: context.nba?.homeStats?.netRating,
        awayNetRating: context.nba?.awayStats?.netRating,
      },
      thresholds: {
        edgeThreshold: mlThresholds.edgeThreshold,
        confidenceWeights: mlThresholds.confidenceWeights,
        injuryImpactFactor: mlThresholds.injuryImpactFactor,
        formWeight: mlThresholds.formWeight,
      },
    }).then(predictionId => {
      console.log(`📝 Prédiction enregistrée: ${predictionId}`);
    }).catch(error => {
      console.error('⚠️ Erreur enregistrement prédiction:', error);
    });
  }
  
  return advice;
}

// ============================================
// UNIFIED PREDICTION INTEGRATION (V3)
// ============================================

/**
 * Génère un conseil expert en utilisant le Unified Prediction Service
 * Cette fonction utilise toutes les intégrations: ESPN, Dixon-Coles, ML, Context
 * 
 * @param match Les informations du match
 * @returns Conseil expert enrichi avec prédictions unifiées
 */
export async function generateUnifiedExpertAdvice(match: {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  matchDate?: string;
}): Promise<ExpertAdvice & { unifiedPrediction?: UnifiedPrediction }> {
  console.log(`🎯 Expert Advisor V3 (Unified): ${match.homeTeam} vs ${match.awayTeam}`);
  const startTime = Date.now();
  
  // Normaliser le sport
  const normalizedSport: 'Foot' | 'NBA' | 'NHL' | 'NFL' = 
    match.sport.toLowerCase().includes('basket') || match.sport.toLowerCase().includes('nba') ? 'NBA' :
    match.sport.toLowerCase().includes('hockey') || match.sport.toLowerCase().includes('nhl') ? 'NHL' :
    match.sport.toLowerCase().includes('football us') || match.sport.toLowerCase().includes('nfl') ? 'NFL' :
    'Foot';
  
  // 1. Obtenir la prédiction unifiée (ESPN + Dixon-Coles + ML + Context)
  const unifiedPrediction = await getUnifiedPredictionFromService({
    id: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    sport: normalizedSport,
    league: match.league,
    oddsHome: match.oddsHome,
    oddsDraw: match.oddsDraw,
    oddsAway: match.oddsAway,
  });
  
  // 2. Obtenir aussi le conseil standard pour compatibilité
  const baseAdvice = await generateExpertAdvice(match, { trackPrediction: false });
  
  // 3. Enrichir avec les données unifiées
  const enhancedReasoning = [...baseAdvice.recommendation.reasoning];
  
  // Ajouter les infos Dixon-Coles si disponibles
  if (unifiedPrediction.dixonColes) {
    const dc = unifiedPrediction.dixonColes;
    enhancedReasoning.unshift(
      `⚽ Dixon-Coles: ${match.homeTeam} ${formatNumber(dc.homeProb, 1)}% - Draw ${formatNumber(dc.drawProb, 1)}% - ${match.awayTeam} ${formatNumber(dc.awayProb, 1)}%`
    );
    enhancedReasoning.splice(2, 0, 
      `📊 Buts attendus: ${formatNumber(dc.expectedGoals.total, 1)} (Over 2.5: ${formatPercent(dc.over25)})`
    );
  }
  
  // Ajouter l'info sur la source des cotes
  enhancedReasoning.push(
    `📡 Cotes: ${unifiedPrediction.odds.bookmaker} (${unifiedPrediction.odds.source})`
  );
  
  // 4. Construire le conseil enrichi
  const processingTime = Date.now() - startTime;
  
  // Determine estimated probability based on bet type
  let estimatedProb = baseAdvice.oddsAnalysis.estimatedProbability;
  if (baseAdvice.recommendation.bet === 'home') {
    estimatedProb = unifiedPrediction.mlPrediction.homeProb;
  } else if (baseAdvice.recommendation.bet === 'away') {
    estimatedProb = unifiedPrediction.mlPrediction.awayProb;
  } else if (baseAdvice.recommendation.bet === 'draw') {
    estimatedProb = unifiedPrediction.mlPrediction.drawProb;
  }
  
  return {
    ...baseAdvice,
    
    // Override avec les données unifiées
    recommendation: {
      ...baseAdvice.recommendation,
      reasoning: enhancedReasoning,
      expectedValue: unifiedPrediction.recommendation.expectedValue,
      kellyStake: unifiedPrediction.recommendation.kellyStake,
    },
    
    oddsAnalysis: {
      ...baseAdvice.oddsAnalysis,
      estimatedProbability: estimatedProb,
      edge: unifiedPrediction.mlPrediction.edge,
      isValueBet: unifiedPrediction.mlPrediction.valueBet,
    },
    
    // Ajouter les nouvelles infos ML
    mlInfo: {
      edgeThreshold: unifiedPrediction.dataQuality.score > 50 ? 0.03 : 0.05,
      modelAccuracy: unifiedPrediction.dataQuality.score,
      adaptiveWeights: {
        form: unifiedPrediction.factors.form.home / 100,
        xg: (unifiedPrediction.factors.xg.home || 0) / 100,
        injuries: unifiedPrediction.factors.injuries.homeImpact,
      },
    },
    
    // Ajouter la prédiction unifiée complète
    unifiedPrediction,
    
    processingTimeMs: processingTime,
  };
}

/**
 * Obtient les meilleurs value bets du jour en utilisant le service unifié
 */
export async function getDailyValueBets(matches: UnifiedPredictionInput[]): Promise<
  Array<{
    match: { homeTeam: string; awayTeam: string; league: string };
    prediction: UnifiedPrediction;
    advice: ExpertAdvice;
  }>
> {
  console.log(`🎯 Calcul des value bets du jour pour ${matches.length} matchs...`);
  
  const results = await Promise.all(
    matches.map(async (match) => {
      const prediction = await getUnifiedPredictionFromService(match);
      
      // Seulement les value bets
      if (!prediction.mlPrediction.valueBet) return null;
      
      const advice = await generateExpertAdvice({
        id: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        sport: match.sport,
        league: match.league,
        oddsHome: match.oddsHome,
        oddsDraw: match.oddsDraw,
        oddsAway: match.oddsAway,
      }, { trackPrediction: false });
      
      return {
        match: {
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          league: match.league,
        },
        prediction,
        advice,
      };
    })
  );
  
  const valueBets = results.filter((r): r is NonNullable<typeof r> => r !== null);
  
  // Trier par edge décroissant
  valueBets.sort((a, b) => b.prediction.mlPrediction.edge - a.prediction.mlPrediction.edge);
  
  console.log(`✅ ${valueBets.length} value bets trouvés`);
  return valueBets;
}

// ============================================
// EXPORTS
// ============================================

const ExpertAdvisorService = {
  generateExpertAdvice,
  generateUnifiedExpertAdvice,
  getDailyValueBets,
  calculateKellyCriterion,
  estimatePublicPercentage,
};

export default ExpertAdvisorService;
