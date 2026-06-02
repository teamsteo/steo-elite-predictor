/**
 * Tennis Backtesting System - Test des prédictions sur données historiques
 * 
 * FONCTIONNALITÉS:
 * 1. Simulation de prédictions sur matchs passés
 * 2. Calcul de la précision réelle du modèle
 * 3. Analyse par facteur, surface, catégorie
 * 4. Simulation de bankroll
 * 5. Optimisation des seuils de confiance
 */

import * as fs from 'fs';
import * as path from 'path';
import { JEFF_SACKMANN_URLS } from './tennis-sources-2026';
import { getLearnedWeights } from './tennis-auto-learning';

// ============================================
// INTERFACES
// ============================================

interface HistoricalMatch {
  date: string;
  tournament: string;
  surface: 'hard' | 'clay' | 'grass' | 'carpet';
  level: string;
  round: string;
  winner: string;
  winnerId: string;
  winnerRank: number;
  winnerPoints: number;
  loser: string;
  loserId: string;
  loserRank: number;
  loserPoints: number;
  score: string;
  odds1?: number;
  odds2?: number;
  duration?: number;
}

interface SimulatedPrediction {
  matchId: string;
  date: string;
  tournament: string;
  surface: string;
  
  // Joueurs
  player1: string;
  player2: string;
  p1Rank: number;
  p2Rank: number;
  
  // Prédiction
  predictedWinner: string;
  predictedProbability: number;
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  
  // Cotes simulées
  odds: number;
  
  // Résultat
  actualWinner: string;
  isCorrect: boolean;
  
  // Betting simulation
  stake: number;
  return_: number;
  profit: number;
}

interface BacktestResults {
  // Métriques globales
  totalMatches: number;
  correctPredictions: number;
  accuracy: number;
  
  // Par confiance
  byConfidence: {
    very_high: { total: number; correct: number; accuracy: number; roi: number };
    high: { total: number; correct: number; accuracy: number; roi: number };
    medium: { total: number; correct: number; accuracy: number; roi: number };
    low: { total: number; correct: number; accuracy: number; roi: number };
  };
  
  // Par surface
  bySurface: Record<string, { total: number; correct: number; accuracy: number }>;
  
  // Par niveau de tournoi
  byLevel: Record<string, { total: number; correct: number; accuracy: number }>;
  
  // Simulation bankroll
  bankrollSimulation: {
    startingBankroll: number;
    finalBankroll: number;
    totalStaked: number;
    totalReturn: number;
    roi: number;
    maxDrawdown: number;
    winningBets: number;
    losingBets: number;
  };
  
  // Analyse des facteurs
  factorAnalysis: {
    rankingAccuracy: number;
    surfaceAccuracy: number;
    formAccuracy: number;
    h2hAccuracy: number;
  };
  
  // Recommandations
  recommendations: string[];
}

// ============================================
// CONFIGURATION
// ============================================

const DATA_DIR = path.join(process.cwd(), 'data');
const BACKTEST_RESULTS_FILE = path.join(DATA_DIR, 'tennis-backtest-results.json');

const HEADERS = {
  'User-Agent': 'PronosticsApp/2026.1 (Tennis Backtesting)',
  'Accept': 'text/plain, text/csv',
};

// ============================================
// CSV PARSER
// ============================================

function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const rows: Record<string, string>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    if (values.length >= headers.length * 0.8) {
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });
      rows.push(row);
    }
  }
  
  return rows;
}

// ============================================
// FETCH HISTORICAL DATA
// ============================================

async function fetchHistoricalMatches(year: number): Promise<HistoricalMatch[]> {
  console.log(`📊 Fetching ATP matches from ${year}...`);
  
  try {
    const url = year === 2026 
      ? JEFF_SACKMANN_URLS.atpMatches2026
      : `https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_matches_${year}.csv`;
    
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      console.log(`⚠️ Could not fetch ${year} matches: ${res.status}`);
      return [];
    }
    
    const csv = await res.text();
    const rows = parseCSV(csv);
    
    const matches: HistoricalMatch[] = rows.map(row => ({
      date: row['tourney_date'] || '',
      tournament: row['tourney_name'] || '',
      surface: (row['surface']?.toLowerCase() || 'hard') as 'hard' | 'clay' | 'grass' | 'carpet',
      level: row['tourney_level'] || 'A',
      round: row['round'] || '',
      winner: row['winner_name'] || '',
      winnerId: row['winner_id'] || '',
      winnerRank: parseInt(row['winner_rank']) || 999,
      winnerPoints: parseInt(row['winner_rank_points']) || 0,
      loser: row['loser_name'] || '',
      loserId: row['loser_id'] || '',
      loserRank: parseInt(row['loser_rank']) || 999,
      loserPoints: parseInt(row['loser_rank_points']) || 0,
      score: row['score'] || '',
      duration: parseInt(row['minutes']) || 0,
    }));
    
    console.log(`✅ ${matches.length} matches loaded from ${year}`);
    return matches;
    
  } catch (error) {
    console.error(`Error fetching ${year}:`, error);
    return [];
  }
}

// ============================================
// PREDICTION SIMULATION
// ============================================

function simulatePrediction(
  match: HistoricalMatch,
  weights: { ranking: number; surface: number; form: number; h2h: number; odds: number }
): SimulatedPrediction {
  // Calculer le score pour le favori (basé sur le classement)
  const rankingDiff = match.loserRank - match.winnerRank;
  
  // Score de base basé sur le classement
  let score = rankingDiff * weights.ranking * 0.5;
  
  // Avantage surface (simulé - dans un vrai système on utiliserait les stats réelles)
  const surfaceBonus = (Math.random() - 0.5) * 10 * weights.surface;
  score += surfaceBonus;
  
  // Convertir en probabilité
  const rawProb = 1 / (1 + Math.exp(-score / 50));
  
  // Déterminer le favori selon notre modèle
  const ourFavorite = match.winnerRank < match.loserRank ? match.winner : match.loser;
  const ourProbability = Math.min(0.85, Math.max(0.15, rawProb * 100 + 50));
  
  // Niveau de confiance
  let confidence: 'very_high' | 'high' | 'medium' | 'low';
  if (ourProbability >= 75) confidence = 'very_high';
  else if (ourProbability >= 65) confidence = 'high';
  else if (ourProbability >= 55) confidence = 'medium';
  else confidence = 'low';
  
  // Simuler des cotes basées sur le classement
  const favoriteOdds = 1 / (ourProbability / 100);
  const underdogOdds = 1 / (1 - ourProbability / 100);
  const odds = ourFavorite === match.winner ? favoriteOdds : underdogOdds;
  
  // Résultat
  const isCorrect = ourFavorite === match.winner;
  
  // Kelly stake (fractionné)
  const kellyFraction = {
    very_high: 0.25,
    high: 0.20,
    medium: 0.10,
    low: 0.05,
  };
  
  const stake = kellyFraction[confidence] * 100;
  const return_ = isCorrect ? stake * odds : 0;
  const profit = return_ - stake;
  
  return {
    matchId: `${match.date}_${match.winnerId}_${match.loserId}`,
    date: match.date,
    tournament: match.tournament,
    surface: match.surface,
    player1: match.winner,
    player2: match.loser,
    p1Rank: match.winnerRank,
    p2Rank: match.loserRank,
    predictedWinner: ourFavorite,
    predictedProbability: Math.round(ourProbability),
    confidence,
    odds: Math.round(odds * 100) / 100,
    actualWinner: match.winner,
    isCorrect,
    stake: Math.round(stake * 10) / 10,
    return_: Math.round(return_ * 10) / 10,
    profit: Math.round(profit * 10) / 10,
  };
}

// ============================================
// RUN BACKTEST
// ============================================

export async function runBacktest(
  years: number[] = [2025, 2026],
  startingBankroll: number = 1000
): Promise<BacktestResults> {
  console.log('\n🎾 TENNIS BACKTESTING SYSTEM');
  console.log('='.repeat(50));
  console.log(`Years: ${years.join(', ')}`);
  console.log(`Starting Bankroll: $${startingBankroll}`);
  console.log('');
  
  // Charger les données
  const allMatches: HistoricalMatch[] = [];
  for (const year of years) {
    const matches = await fetchHistoricalMatches(year);
    allMatches.push(...matches);
  }
  
  if (allMatches.length === 0) {
    throw new Error('No historical matches found');
  }
  
  console.log(`\n📊 Total matches: ${allMatches.length}`);
  
  // Obtenir les poids du modèle
  const weights = getLearnedWeights();
  console.log('Model weights:', weights);
  
  // Simuler les prédictions
  const predictions: SimulatedPrediction[] = [];
  let bankroll = startingBankroll;
  let maxBankroll = startingBankroll;
  let maxDrawdown = 0;
  let totalStaked = 0;
  let totalReturn = 0;
  let winningBets = 0;
  let losingBets = 0;
  
  // Initialiser les compteurs
  const byConfidence = {
    very_high: { total: 0, correct: 0, accuracy: 0, roi: 0, profit: 0, staked: 0 },
    high: { total: 0, correct: 0, accuracy: 0, roi: 0, profit: 0, staked: 0 },
    medium: { total: 0, correct: 0, accuracy: 0, roi: 0, profit: 0, staked: 0 },
    low: { total: 0, correct: 0, accuracy: 0, roi: 0, profit: 0, staked: 0 },
  };
  
  const bySurface: Record<string, { total: number; correct: number }> = {};
  const byLevel: Record<string, { total: number; correct: number }> = {};
  
  console.log('\n🎯 Simulating predictions...');
  
  // Simuler chaque match
  for (const match of allMatches) {
    // Ignorer les matchs sans classement valide
    if (match.winnerRank > 500 || match.loserRank > 500) continue;
    
    const pred = simulatePrediction(match, weights);
    predictions.push(pred);
    
    // Compteurs par confiance
    byConfidence[pred.confidence].total++;
    byConfidence[pred.confidence].staked += pred.stake;
    if (pred.isCorrect) {
      byConfidence[pred.confidence].correct++;
      byConfidence[pred.confidence].profit += pred.profit;
    } else {
      byConfidence[pred.confidence].profit -= pred.stake;
    }
    
    // Par surface
    if (!bySurface[pred.surface]) bySurface[pred.surface] = { total: 0, correct: 0 };
    bySurface[pred.surface].total++;
    if (pred.isCorrect) bySurface[pred.surface].correct++;
    
    // Par niveau
    const level = match.level;
    if (!byLevel[level]) byLevel[level] = { total: 0, correct: 0 };
    byLevel[level].total++;
    if (pred.isCorrect) byLevel[level].correct++;
    
    // Simulation bankroll
    if (pred.confidence === 'very_high' || pred.confidence === 'high') {
      bankroll -= pred.stake;
      totalStaked += pred.stake;
      
      if (pred.isCorrect) {
        bankroll += pred.return_;
        totalReturn += pred.return_;
        winningBets++;
      } else {
        losingBets++;
      }
      
      // Tracker drawdown
      if (bankroll > maxBankroll) maxBankroll = bankroll;
      const drawdown = (maxBankroll - bankroll) / maxBankroll * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
  }
  
  // Calculer les métriques finales
  const totalMatches = predictions.length;
  const correctPredictions = predictions.filter(p => p.isCorrect).length;
  const accuracy = (correctPredictions / totalMatches) * 100;
  
  // Calculer les ROI par confiance
  for (const conf of Object.keys(byConfidence) as Array<keyof typeof byConfidence>) {
    const data = byConfidence[conf];
    data.accuracy = data.total > 0 ? (data.correct / data.total) * 100 : 0;
    data.roi = data.staked > 0 ? (data.profit / data.staked) * 100 : 0;
  }
  
  // Calculer les précisions par surface
  const bySurfaceResult: Record<string, { total: number; correct: number; accuracy: number }> = {};
  for (const [surface, data] of Object.entries(bySurface)) {
    bySurfaceResult[surface] = {
      ...data,
      accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
    };
  }
  
  // Calculer les précisions par niveau
  const byLevelResult: Record<string, { total: number; correct: number; accuracy: number }> = {};
  for (const [level, data] of Object.entries(byLevel)) {
    byLevelResult[level] = {
      ...data,
      accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
    };
  }
  
  // Générer les recommandations
  const recommendations: string[] = [];
  
  if (byConfidence.very_high.accuracy < 60) {
    recommendations.push('⚠️ Very High confidence underperforming - increase threshold');
  }
  
  if (byConfidence.low.accuracy > 55) {
    recommendations.push('💡 Low confidence performing well - consider lowering threshold');
  }
  
  const bestSurface = Object.entries(bySurfaceResult)
    .filter(([_, d]) => d.total >= 50)
    .sort((a, b) => b[1].accuracy - a[1].accuracy)[0];
  
  if (bestSurface) {
    recommendations.push(`📊 Best surface: ${bestSurface[0]} (${bestSurface[1].accuracy.toFixed(1)}%)`);
  }
  
  const finalROI = totalStaked > 0 ? ((totalReturn - totalStaked) / totalStaked) * 100 : 0;
  
  if (finalROI < 0) {
    recommendations.push(`⚠️ Negative ROI (${finalROI.toFixed(1)}%) - review model weights`);
  } else {
    recommendations.push(`✅ Positive ROI (${finalROI.toFixed(1)}%) - model working`);
  }
  
  const results: BacktestResults = {
    totalMatches,
    correctPredictions,
    accuracy,
    byConfidence: {
      very_high: { 
        total: byConfidence.very_high.total,
        correct: byConfidence.very_high.correct,
        accuracy: byConfidence.very_high.accuracy,
        roi: byConfidence.very_high.roi,
      },
      high: {
        total: byConfidence.high.total,
        correct: byConfidence.high.correct,
        accuracy: byConfidence.high.accuracy,
        roi: byConfidence.high.roi,
      },
      medium: {
        total: byConfidence.medium.total,
        correct: byConfidence.medium.correct,
        accuracy: byConfidence.medium.accuracy,
        roi: byConfidence.medium.roi,
      },
      low: {
        total: byConfidence.low.total,
        correct: byConfidence.low.correct,
        accuracy: byConfidence.low.accuracy,
        roi: byConfidence.low.roi,
      },
    },
    bySurface: bySurfaceResult,
    byLevel: byLevelResult,
    bankrollSimulation: {
      startingBankroll,
      finalBankroll: Math.round(bankroll * 100) / 100,
      totalStaked: Math.round(totalStaked * 100) / 100,
      totalReturn: Math.round(totalReturn * 100) / 100,
      roi: Math.round(finalROI * 10) / 10,
      maxDrawdown: Math.round(maxDrawdown * 10) / 10,
      winningBets,
      losingBets,
    },
    factorAnalysis: {
      rankingAccuracy: accuracy,
      surfaceAccuracy: Object.values(bySurfaceResult).reduce((a, b) => a + b.accuracy, 0) / Object.keys(bySurfaceResult).length,
      formAccuracy: 0, // Nécessite plus de données
      h2hAccuracy: 0,  // Nécessite plus de données
    },
    recommendations,
  };
  
  // Sauvegarder les résultats
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(BACKTEST_RESULTS_FILE, JSON.stringify(results, null, 2));
  
  // Afficher les résultats
  console.log('\n' + '='.repeat(50));
  console.log('📊 BACKTEST RESULTS');
  console.log('='.repeat(50));
  console.log(`Total Matches: ${totalMatches}`);
  console.log(`Accuracy: ${accuracy.toFixed(1)}%`);
  console.log(`\n📈 By Confidence:`);
  for (const [conf, data] of Object.entries(byConfidence)) {
    console.log(`  ${conf}: ${data.accuracy.toFixed(1)}% (${data.correct}/${data.total}) ROI: ${data.roi.toFixed(1)}%`);
  }
  console.log(`\n💰 Bankroll Simulation:`);
  console.log(`  Starting: $${startingBankroll}`);
  console.log(`  Final: $${results.bankrollSimulation.finalBankroll}`);
  console.log(`  ROI: ${results.bankrollSimulation.roi}%`);
  console.log(`  Max Drawdown: ${results.bankrollSimulation.maxDrawdown}%`);
  console.log(`\n📋 Recommendations:`);
  for (const rec of recommendations) {
    console.log(`  ${rec}`);
  }
  
  return results;
}

// ============================================
// CLI
// ============================================

// Si exécuté directement
if (require.main === module) {
  runBacktest([2025, 2026], 1000)
    .then(() => console.log('\n✅ Backtest complete!'))
    .catch(err => console.error('❌ Backtest error:', err));
}

export { HistoricalMatch, SimulatedPrediction };
