/**
 * Tennis Backtesting System - Calibration des seuils
 * 
 * 🎯 OBJECTIF:
 * Tester les prédictions sur données historiques pour:
 * 1. Calibrer les seuils de confiance
 * 2. Ajuster les poids des facteurs
 * 3. Mesurer la performance réelle du modèle
 * 
 * 📊 MÉTRIQUES:
 * - Win rate global
 * - Win rate par niveau de confiance
 * - ROI simulé
 * - Calibration (prédit 80% = réalise 80%)
 */

// ============================================
// INTERFACES
// ============================================

export interface BacktestResult {
  totalMatches: number;
  correctPredictions: number;
  overallWinRate: number;
  roi: number;
  
  byConfidence: {
    very_high: ConfidenceStats;
    high: ConfidenceStats;
    medium: ConfidenceStats;
    low: ConfidenceStats;
  };
  
  byTier: Record<string, ConfidenceStats>;
  bySurface: Record<string, ConfidenceStats>;
  
  calibration: {
    predicted80: number;  // Matchs prédits à 80%+
    actual80: number;     // Taux réel de victoires
    predicted70: number;
    actual70: number;
    predicted60: number;
    actual60: number;
  };
  
  recommendations: string[];
}

export interface ConfidenceStats {
  total: number;
  correct: number;
  winRate: number;
  roi: number;
  avgOdds: number;
}

export interface HistoricalMatch {
  date: string;
  player1: string;
  player2: string;
  tournament: string;
  tier: string;
  surface: string;
  odds1: number;
  odds2: number;
  winner: 'player1' | 'player2';
  p1Ranking?: number;
  p2Ranking?: number;
}

// ============================================
// BACKTESTING ENGINE
// ============================================

/**
 * Lance un backtest sur les données historiques
 */
export async function runBacktest(
  matches: HistoricalMatch[],
  options?: {
    verbose?: boolean;
    skipCalibration?: boolean;
  }
): Promise<BacktestResult> {
  console.log(`[Backtest] 🧪 Démarrage sur ${matches.length} matchs...`);
  
  const verbose = options?.verbose ?? false;
  
  // Stats globales
  let totalMatches = 0;
  let correctPredictions = 0;
  let totalStake = 0;
  let totalReturn = 0;
  
  // Stats par confiance
  const byConfidence: Record<string, ConfidenceStats> = {
    very_high: { total: 0, correct: 0, winRate: 0, roi: 0, avgOdds: 0 },
    high: { total: 0, correct: 0, winRate: 0, roi: 0, avgOdds: 0 },
    medium: { total: 0, correct: 0, winRate: 0, roi: 0, avgOdds: 0 },
    low: { total: 0, correct: 0, winRate: 0, roi: 0, avgOdds: 0 },
  };
  
  // Stats par tier
  const byTier: Record<string, ConfidenceStats> = {};
  
  // Stats par surface
  const bySurface: Record<string, ConfidenceStats> = {};
  
  // Calibration
  const calibrationBuckets = {
    p80: { predicted: 0, actual: 0 },
    p70: { predicted: 0, actual: 0 },
    p60: { predicted: 0, actual: 0 },
  };
  
  // Simuler les prédictions
  for (const match of matches) {
    try {
      // Générer la prédiction (version simplifiée pour backtest)
      const prediction = simulatePrediction(match);
      
      if (!prediction) continue;
      
      totalMatches++;
      
      // Vérifier si correct
      const correct = prediction.predictedWinner === match.winner;
      if (correct) correctPredictions++;
      
      // Calculer le ROI (mise fixe de 1 unité)
      const stake = 1;
      totalStake += stake;
      
      if (correct) {
        const odds = prediction.predictedWinner === 'player1' ? match.odds1 : match.odds2;
        totalReturn += stake * odds;
      }
      
      // Stats par confiance
      const conf = prediction.confidence;
      byConfidence[conf].total++;
      byConfidence[conf].avgOdds = 
        (byConfidence[conf].avgOdds * (byConfidence[conf].total - 1) + 
         (prediction.predictedWinner === 'player1' ? match.odds1 : match.odds2)) /
        byConfidence[conf].total;
      if (correct) {
        byConfidence[conf].correct++;
      }
      
      // Stats par tier
      if (!byTier[match.tier]) {
        byTier[match.tier] = { total: 0, correct: 0, winRate: 0, roi: 0, avgOdds: 0 };
      }
      byTier[match.tier].total++;
      if (correct) byTier[match.tier].correct++;
      
      // Stats par surface
      if (!bySurface[match.surface]) {
        bySurface[match.surface] = { total: 0, correct: 0, winRate: 0, roi: 0, avgOdds: 0 };
      }
      bySurface[match.surface].total++;
      if (correct) bySurface[match.surface].correct++;
      
      // Calibration
      if (prediction.winProbability >= 80) {
        calibrationBuckets.p80.predicted++;
        if (correct) calibrationBuckets.p80.actual++;
      }
      if (prediction.winProbability >= 70) {
        calibrationBuckets.p70.predicted++;
        if (correct) calibrationBuckets.p70.actual++;
      }
      if (prediction.winProbability >= 60) {
        calibrationBuckets.p60.predicted++;
        if (correct) calibrationBuckets.p60.actual++;
      }
      
      if (verbose && totalMatches % 100 === 0) {
        console.log(`[Backtest] Traité ${totalMatches}/${matches.length} matchs...`);
      }
      
    } catch (error) {
      console.error(`[Backtest] Erreur match:`, error);
    }
  }
  
  // Calculer les stats finales
  const overallWinRate = totalMatches > 0 ? correctPredictions / totalMatches : 0;
  const roi = totalStake > 0 ? (totalReturn - totalStake) / totalStake : 0;
  
  // Calculer les win rates par confiance
  for (const conf of ['very_high', 'high', 'medium', 'low'] as const) {
    const stats = byConfidence[conf];
    stats.winRate = stats.total > 0 ? stats.correct / stats.total : 0;
    stats.roi = stats.total > 0 
      ? (stats.correct * stats.avgOdds - stats.total) / stats.total 
      : 0;
  }
  
  // Calculer les win rates par tier
  for (const tier of Object.keys(byTier)) {
    const stats = byTier[tier];
    stats.winRate = stats.total > 0 ? stats.correct / stats.total : 0;
  }
  
  // Calculer les win rates par surface
  for (const surface of Object.keys(bySurface)) {
    const stats = bySurface[surface];
    stats.winRate = stats.total > 0 ? stats.correct / stats.total : 0;
  }
  
  // Générer les recommandations
  const recommendations = generateRecommendations(
    overallWinRate,
    roi,
    byConfidence,
    calibrationBuckets
  );
  
  console.log(`[Backtest] ✅ Terminé: ${totalMatches} matchs, ${Math.round(overallWinRate * 100)}% win rate`);
  
  return {
    totalMatches,
    correctPredictions,
    overallWinRate,
    roi,
    byConfidence: byConfidence as BacktestResult['byConfidence'],
    byTier,
    bySurface,
    calibration: {
      predicted80: calibrationBuckets.p80.predicted,
      actual80: calibrationBuckets.p80.predicted > 0 
        ? calibrationBuckets.p80.actual / calibrationBuckets.p80.predicted 
        : 0,
      predicted70: calibrationBuckets.p70.predicted,
      actual70: calibrationBuckets.p70.predicted > 0 
        ? calibrationBuckets.p70.actual / calibrationBuckets.p70.predicted 
        : 0,
      predicted60: calibrationBuckets.p60.predicted,
      actual60: calibrationBuckets.p60.predicted > 0 
        ? calibrationBuckets.p60.actual / calibrationBuckets.p60.predicted 
        : 0,
    },
    recommendations,
  };
}

// ============================================
// PRÉDICTION SIMPLIFIÉE POUR BACKTEST
// ============================================

function simulatePrediction(match: HistoricalMatch): {
  predictedWinner: 'player1' | 'player2';
  winProbability: number;
  confidence: 'very_high' | 'high' | 'medium' | 'low';
} | null {
  // Vérifier les données minimales
  if (!match.odds1 || !match.odds2 || match.odds1 <= 1 || match.odds2 <= 1) {
    return null;
  }
  
  // Facteur 1: Cotes implicites
  const implied1 = 1 / match.odds1;
  const implied2 = 1 / match.odds2;
  
  // Facteur 2: Classement (si disponible)
  let rankingScore = 0;
  if (match.p1Ranking && match.p2Ranking) {
    const diff = match.p2Ranking - match.p1Ranking;
    rankingScore = Math.tanh(diff / 50) * 0.3;
  }
  
  // Facteur 3: Surface (simplifié)
  // Pour un vrai backtest, il faudrait les stats par surface
  
  // Score combiné
  const oddsScore = implied1 - implied2;
  const totalScore = oddsScore * 0.7 + rankingScore;
  
  // Probabilité
  const rawProb = 1 / (1 + Math.exp(-totalScore * 5));
  const winProbability = Math.round(rawProb * 100);
  
  // Déterminer le gagnant
  const predictedWinner: 'player1' | 'player2' = rawProb >= 0.5 ? 'player1' : 'player2';
  const displayProb = rawProb >= 0.5 ? rawProb : 1 - rawProb;
  
  // Niveau de confiance
  let confidence: 'very_high' | 'high' | 'medium' | 'low';
  if (displayProb >= 0.80) confidence = 'very_high';
  else if (displayProb >= 0.70) confidence = 'high';
  else if (displayProb >= 0.60) confidence = 'medium';
  else confidence = 'low';
  
  return {
    predictedWinner,
    winProbability: Math.round(displayProb * 100),
    confidence,
  };
}

// ============================================
// RECOMMANDATIONS
// ============================================

function generateRecommendations(
  overallWinRate: number,
  roi: number,
  byConfidence: Record<string, ConfidenceStats>,
  calibration: { p80: { predicted: number; actual: number }; p70: { predicted: number; actual: number }; p60: { predicted: number; actual: number } }
): string[] {
  const recommendations: string[] = [];
  
  // Calibration
  if (calibration.p80.predicted > 10) {
    const actual80 = calibration.p80.actual / calibration.p80.predicted;
    if (actual80 < 0.70) {
      recommendations.push(`⚠️ Les prédictions "80%+" ont un taux réel de ${Math.round(actual80 * 100)}% - Augmenter le seuil à 85%`);
    } else if (actual80 > 0.90) {
      recommendations.push(`✅ Les prédictions "80%+" sont bien calibrées (${Math.round(actual80 * 100)}%)`);
    }
  }
  
  // ROI par confiance
  if (byConfidence.very_high.total > 10 && byConfidence.very_high.roi < 0) {
    recommendations.push(`❌ ROI négatif sur very_high (${Math.round(byConfidence.very_high.roi * 100)}%) - Revoir les critères`);
  }
  
  if (byConfidence.high.roi > byConfidence.very_high.roi && byConfidence.high.total > 20) {
    recommendations.push(`💡 high conf. a un meilleur ROI que very_high - Considérer élargir les critères`);
  }
  
  // Win rate global
  if (overallWinRate < 0.55) {
    recommendations.push(`📉 Win rate faible (${Math.round(overallWinRate * 100)}%) - Modèle à améliorer`);
  } else if (overallWinRate > 0.65) {
    recommendations.push(`📈 Excellent win rate (${Math.round(overallWinRate * 100)}%) - Modèle performant`);
  }
  
  // ROI global
  if (roi < -0.10) {
    recommendations.push(`❌ ROI très négatif (${Math.round(roi * 100)}%) - Ne pas suivre les prédictions`);
  } else if (roi > 0.05) {
    recommendations.push(`💰 ROI positif (${Math.round(roi * 100)}%) - Modèle rentable`);
  }
  
  return recommendations;
}

// ============================================
// DONNÉES HISTORIQUES (EXEMPLE)
// ============================================

/**
 * Charge les données historiques depuis Jeff Sackmann
 */
export async function loadHistoricalMatches(
  year: number = 2025,
  category: 'atp' | 'wta' = 'atp'
): Promise<HistoricalMatch[]> {
  console.log(`[Backtest] 📂 Chargement matchs ${category.toUpperCase()} ${year}...`);
  
  const baseUrl = category === 'atp' 
    ? 'https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master'
    : 'https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master';
  
  try {
    const response = await fetch(`${baseUrl}/${category}_matches_${year}.csv`);
    
    if (!response.ok) {
      console.error(`[Backtest] Erreur chargement: ${response.status}`);
      return [];
    }
    
    const text = await response.text();
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',');
    
    // Indices des colonnes
    const indices = {
      winnerName: headers.indexOf('winner_name'),
      loserName: headers.indexOf('loser_name'),
      tourneyName: headers.indexOf('tourney_name'),
      tourneyDate: headers.indexOf('tourney_date'),
      surface: headers.indexOf('surface'),
      winnerRank: headers.indexOf('winner_rank'),
      loserRank: headers.indexOf('loser_rank'),
    };
    
    // Récupérer les cotes depuis un autre fichier si disponible
    // Pour l'instant, on estime les cotes basées sur le classement
    
    const matches: HistoricalMatch[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      
      if (parts.length < 10) continue;
      
      const winnerName = parts[indices.winnerName]?.trim();
      const loserName = parts[indices.loserName]?.trim();
      const tourneyName = parts[indices.tourneyName]?.trim();
      const surface = parts[indices.surface]?.trim().toLowerCase() || 'hard';
      const winnerRank = parseInt(parts[indices.winnerRank]) || 500;
      const loserRank = parseInt(parts[indices.loserRank]) || 500;
      
      if (!winnerName || !loserName) continue;
      
      // Estimer les cotes basées sur le classement
      const rankDiff = loserRank - winnerRank;
      const winProb = 1 / (1 + Math.exp(-rankDiff / 50));
      const loserWinProb = 1 - winProb;
      
      // Cotes estimées (avec marge bookmaker de 5%)
      const margin = 1.05;
      const odds1 = margin / winProb;
      const odds2 = margin / loserWinProb;
      
      matches.push({
        date: parts[indices.tourneyDate]?.trim() || '',
        player1: winnerName,
        player2: loserName,
        tournament: tourneyName || 'Unknown',
        tier: detectTier(tourneyName),
        surface: normalizeSurface(surface),
        odds1: Math.min(10, Math.max(1.1, odds1)),
        odds2: Math.min(10, Math.max(1.1, odds2)),
        winner: 'player1', // Le winner est toujours player1 dans les données
        p1Ranking: winnerRank,
        p2Ranking: loserRank,
      });
    }
    
    console.log(`[Backtest] ✅ ${matches.length} matchs chargés`);
    return matches;
    
  } catch (error) {
    console.error('[Backtest] Erreur chargement:', error);
    return [];
  }
}

function detectTier(tournament: string): string {
  const t = tournament.toLowerCase();
  
  if (t.includes('roland') || t.includes('french') || t.includes('wimbledon') || 
      t.includes('australian') || t.includes('us open')) {
    return 'grand_slam';
  }
  if (t.includes('masters') || t.includes('1000') || t.includes('indian wells') || 
      t.includes('miami') || t.includes('madrid') || t.includes('rome')) {
    return 'masters_1000';
  }
  if (t.includes('500')) return 'atp_500';
  if (t.includes('challenger')) return 'challenger';
  
  return 'atp_250';
}

function normalizeSurface(surface: string): string {
  if (surface.includes('clay')) return 'clay';
  if (surface.includes('grass')) return 'grass';
  if (surface.includes('indoor') || surface.includes('carpet')) return 'indoor';
  return 'hard';
}

// ============================================
// EXPORTS
// ============================================

export default {
  runBacktest,
  loadHistoricalMatches,
};
