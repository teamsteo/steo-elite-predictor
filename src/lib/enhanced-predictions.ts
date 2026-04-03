/**
 * Service de prédictions enrichies avec analyse fondamentale
 * Combine les patterns ML + données fondamentales pour des prédictions plus précises
 */

import { getBettingRecommendations, getTagColor, getTagIcon, type BettingRecommendation, type MatchDataForRecommendation } from './bettingRecommendations';
import { getFundamentalData, calculateFundamentalBoost, type FundamentalData } from './fundamental-analysis';

export interface EnhancedPrediction {
  // Prédiction de base (ML patterns)
  basePrediction: BettingRecommendation | null;
  
  // Boost fondamental
  fundamentalBoost: number;
  fundamentalSignals: string[];
  
  // Prédiction finale ajustée
  finalConfidence: number;
  recommendation: string;
  
  // Données fondamentales complètes
  homeTeamData: FundamentalData | null;
  awayTeamData: FundamentalData | null;
  
  // Score global
  predictionScore: number; // -100 à +100
}

/**
 * Génère une prédiction enrichie avec données fondamentales
 */
export async function getEnhancedPrediction(
  match: MatchDataForRecommendation
): Promise<EnhancedPrediction> {
  
  // 1. Récupérer les recommandations ML de base
  const baseRecs = getBettingRecommendations(match);
  const basePrediction = baseRecs.length > 0 ? baseRecs[0] : null;
  
  // 2. Récupérer les données fondamentales (en parallèle)
  let homeTeamData: FundamentalData | null = null;
  let awayTeamData: FundamentalData | null = null;
  
  try {
    [homeTeamData, awayTeamData] = await Promise.all([
      getFundamentalData(match.homeTeam, match.sport),
      getFundamentalData(match.awayTeam, match.sport)
    ]);
  } catch (e) {
    console.error('Fundamental data fetch error:', e);
  }
  
  // 3. Calculer les boosts fondamentaux
  const homeBoost = homeTeamData ? calculateFundamentalBoost(homeTeamData, true) : 0;
  const awayBoost = awayTeamData ? calculateFundamentalBoost(awayTeamData, false) : 0;
  
  // 4. Collecter les signaux
  const fundamentalSignals: string[] = [];
  
  if (homeTeamData?.signals) {
    homeTeamData.signals.forEach(s => fundamentalSignals.push(`🏠 ${s.description}`));
  }
  if (awayTeamData?.signals) {
    awayTeamData.signals.forEach(s => fundamentalSignals.push(`✈️ ${s.description}`));
  }
  
  // 5. Calculer la confiance finale
  const baseConfidence = basePrediction?.confidence || 50;
  const fundamentalBoost = homeBoost - awayBoost;
  const finalConfidence = Math.max(10, Math.min(99, baseConfidence + Math.round(fundamentalBoost * 0.5)));
  
  // 6. Score de prédiction global
  const predictionScore = (finalConfidence - 50) * 2 + fundamentalBoost;
  
  // 7. Recommandation finale
  let recommendation = basePrediction?.label || 'Analyse en cours...';
  
  if (fundamentalBoost > 5 && basePrediction) {
    recommendation = `✅ ${recommendation} (Confirmé par analyse fondamentale)`;
  } else if (fundamentalBoost < -5 && basePrediction) {
    recommendation = `⚠️ ${recommendation} (Attention: signaux négatifs)`;
  } else if (!basePrediction && Math.abs(fundamentalBoost) > 3) {
    if (fundamentalBoost > 0) {
      recommendation = `📈 Avantage ${match.homeTeam} (analyse fondamentale)`;
    } else {
      recommendation = `📈 Avantage ${match.awayTeam} (analyse fondamentale)`;
    }
  }
  
  return {
    basePrediction,
    fundamentalBoost,
    fundamentalSignals,
    finalConfidence,
    recommendation,
    homeTeamData,
    awayTeamData,
    predictionScore
  };
}

/**
 * Analyse rapide pour affichage sur carte
 */
export async function getQuickAnalysis(
  match: MatchDataForRecommendation
): Promise<{
  tag: string;
  confidence: number;
  signals: string[];
  color: { bg: string; text: string; border: string };
}> {
  const prediction = await getEnhancedPrediction(match);
  
  let tag = prediction.recommendation;
  let confidence = prediction.finalConfidence;
  
  // Si pas de prédiction ML mais signaux forts
  if (!prediction.basePrediction && prediction.fundamentalSignals.length > 0) {
    if (prediction.fundamentalBoost > 5) {
      tag = `📊 ${match.homeTeam} favori`;
      confidence = 50 + Math.abs(prediction.fundamentalBoost);
    } else if (prediction.fundamentalBoost < -5) {
      tag = `📊 ${match.awayTeam} favori`;
      confidence = 50 + Math.abs(prediction.fundamentalBoost);
    }
  }
  
  const type = prediction.basePrediction?.type || 'home_win';
  const color = getTagColor(type);
  
  return {
    tag,
    confidence,
    signals: prediction.fundamentalSignals.slice(0, 3),
    color
  };
}

/**
 * Résumé textuel pour l'utilisateur
 */
export function getAnalysisSummary(prediction: EnhancedPrediction): string {
  const parts: string[] = [];
  
  if (prediction.basePrediction) {
    parts.push(`🎯 Pattern ML: ${prediction.basePrediction.label} (${prediction.basePrediction.confidence}%)`);
  }
  
  if (prediction.fundamentalSignals.length > 0) {
    parts.push(`📊 Signaux: ${prediction.fundamentalSignals.slice(0, 3).join(', ')}`);
  }
  
  parts.push(`⚡ Confiance finale: ${prediction.finalConfidence}%`);
  
  return parts.join('\n');
}

export default {
  getEnhancedPrediction,
  getQuickAnalysis,
  getAnalysisSummary
};
