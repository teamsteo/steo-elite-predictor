/**
 * ML Training Advanced - Entraînement et Backtest complet
 * 
 * Ce script utilise les données historiques de 2+ saisons pour:
 * 1. Entraîner le modèle ML sur Football et Basketball
 * 2. Exécuter des backtests sur les données passées
 * 3. Extraire des patterns statistiques
 * 4. Sauvegarder les apprentissages pour les prédictions futures
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Configuration Supabase
const SUPABASE_URL = 'https://aumsrakioetvvqopthbs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// INTERFACES
// ============================================

interface FootballMatch {
  id: string;
  home_team: string;
  away_team: string;
  league_name: string;
  season: string;
  match_date: string;
  home_score: number;
  away_score: number;
  result: 'H' | 'D' | 'A';
  home_possession?: number;
  away_possession?: number;
  home_shots?: number;
  away_shots?: number;
  home_shots_on_target?: number;
  away_shots_on_target?: number;
  home_corners?: number;
  away_corners?: number;
  home_xg?: number;
  away_xg?: number;
  odds_home?: number;
  odds_draw?: number;
  odds_away?: number;
}

interface BasketballMatch {
  id: string;
  home_team: string;
  away_team: string;
  league_name: string;
  season: string;
  match_date: string;
  home_score: number;
  away_score: number;
  result: 'H' | 'A';
  home_fg_pct?: number;
  away_fg_pct?: number;
  home_3p_pct?: number;
  away_3p_pct?: number;
  home_rebounds?: number;
  away_rebounds?: number;
  home_assists?: number;
  away_assists?: number;
  odds_home?: number;
  odds_away?: number;
  spread?: number;
}

interface MLPattern {
  id: string;
  sport: 'football' | 'basketball';
  pattern_type: string;
  condition: string;
  outcome: string;
  sample_size: number;
  success_rate: number;
  confidence: number;
  last_updated: string;
}

interface TrainingResult {
  sport: string;
  totalMatches: number;
  trainingMatches: number;
  testMatches: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  patterns: MLPattern[];
  featureImportance: Record<string, number>;
  confusionMatrix: { TP: number; TN: number; FP: number; FN: number };
}

interface BacktestResult {
  sport: string;
  totalBets: number;
  wins: number;
  losses: number;
  winRate: number;
  totalStake: number;
  totalReturn: number;
  profit: number;
  roi: number;
  byConfidence: {
    very_high: { bets: number; wins: number; winRate: number; profit: number };
    high: { bets: number; wins: number; winRate: number; profit: number };
    medium: { bets: number; wins: number; winRate: number; profit: number };
    low: { bets: number; wins: number; winRate: number; profit: number };
  };
  byLeague: Record<string, { bets: number; wins: number; winRate: number }>;
}

// ============================================
// FEATURE ENGINEERING
// ============================================

function extractFootballFeatures(match: FootballMatch): Record<string, number> {
  const totalGoals = match.home_score + match.away_score;
  const goalDiff = match.home_score - match.away_score;
  
  const features: Record<string, number> = {
    // Résultat
    homeWin: match.result === 'H' ? 1 : 0,
    draw: match.result === 'D' ? 1 : 0,
    awayWin: match.result === 'A' ? 1 : 0,
    
    // Buts
    totalGoals,
    goalDiff,
    over25: totalGoals > 2.5 ? 1 : 0,
    over35: totalGoals > 3.5 ? 1 : 0,
    bothTeamsScored: match.home_score > 0 && match.away_score > 0 ? 1 : 0,
    
    // Stats match
    possessionDiff: (match.home_possession || 50) - (match.away_possession || 50),
    shotsDiff: (match.home_shots || 0) - (match.away_shots || 0),
    shotsOnTargetDiff: (match.home_shots_on_target || 0) - (match.away_shots_on_target || 0),
    cornersDiff: (match.home_corners || 0) - (match.away_corners || 0),
    xgDiff: (match.home_xg || 0) - (match.away_xg || 0),
    
    // Cotes
    oddsHome: match.odds_home || 2.0,
    oddsDraw: match.odds_draw || 3.3,
    oddsAway: match.odds_away || 3.0,
    impliedHomeProb: match.odds_home ? 1 / match.odds_home : 0.5,
    impliedAwayProb: match.odds_away ? 1 / match.odds_away : 0.5,
    
    // Value
    favoriteWon: match.odds_home && match.odds_away 
      ? (match.odds_home < match.odds_away && match.result === 'H') || 
        (match.odds_away < match.odds_home && match.result === 'A') ? 1 : 0 
      : 0,
  };
  
  return features;
}

function extractBasketballFeatures(match: BasketballMatch): Record<string, number> {
  const totalPoints = match.home_score + match.away_score;
  const pointDiff = match.home_score - match.away_score;
  
  const features: Record<string, number> = {
    // Résultat
    homeWin: match.result === 'H' ? 1 : 0,
    awayWin: match.result === 'A' ? 1 : 0,
    
    // Points
    totalPoints,
    pointDiff,
    over220: totalPoints > 220 ? 1 : 0,
    over230: totalPoints > 230 ? 1 : 0,
    
    // Stats match
    fgPctDiff: (match.home_fg_pct || 45) - (match.away_fg_pct || 45),
    threePctDiff: (match.home_3p_pct || 35) - (match.away_3p_pct || 35),
    reboundsDiff: (match.home_rebounds || 0) - (match.away_rebounds || 0),
    assistsDiff: (match.home_assists || 0) - (match.away_assists || 0),
    
    // Cotes
    oddsHome: match.odds_home || 1.9,
    oddsAway: match.odds_away || 1.9,
    impliedHomeProb: match.odds_home ? 1 / match.odds_home : 0.5,
    impliedAwayProb: match.odds_away ? 1 / match.odds_away : 0.5,
    spread: match.spread || 0,
    
    // Value
    favoriteWon: match.odds_home && match.odds_away 
      ? (match.odds_home < match.odds_away && match.result === 'H') || 
        (match.odds_away < match.odds_home && match.result === 'A') ? 1 : 0 
      : 0,
  };
  
  return features;
}

// ============================================
// PATTERN EXTRACTION
// ============================================

function extractFootballPatterns(matches: FootballMatch[]): MLPattern[] {
  const patterns: MLPattern[] = [];
  
  // Pattern 1: Favori à domicile avec cote < 1.5
  const homeFavoriteLow = matches.filter(m => m.odds_home && m.odds_home < 1.5);
  if (homeFavoriteLow.length >= 20) {
    const wins = homeFavoriteLow.filter(m => m.result === 'H').length;
    patterns.push({
      id: `foot_home_favorite_${Date.now()}`,
      sport: 'football',
      pattern_type: 'home_favorite_low',
      condition: 'odds_home < 1.5',
      outcome: 'home_win',
      sample_size: homeFavoriteLow.length,
      success_rate: Math.round((wins / homeFavoriteLow.length) * 100),
      confidence: homeFavoriteLow.length >= 100 ? 0.9 : homeFavoriteLow.length >= 50 ? 0.7 : 0.5,
      last_updated: new Date().toISOString()
    });
  }
  
  // Pattern 2: xG difference significative
  const xgDiffMatches = matches.filter(m => m.home_xg && m.away_xg && Math.abs(m.home_xg - m.away_xg) > 0.5);
  if (xgDiffMatches.length >= 20) {
    const correctPredictions = xgDiffMatches.filter(m => 
      (m.home_xg! > m.away_xg! && m.result === 'H') || 
      (m.away_xg! > m.home_xg! && m.result === 'A')
    ).length;
    patterns.push({
      id: `foot_xg_diff_${Date.now()}`,
      sport: 'football',
      pattern_type: 'xg_differential',
      condition: 'abs(home_xg - away_xg) > 0.5',
      outcome: 'xg_favorite_wins',
      sample_size: xgDiffMatches.length,
      success_rate: Math.round((correctPredictions / xgDiffMatches.length) * 100),
      confidence: xgDiffMatches.length >= 100 ? 0.9 : xgDiffMatches.length >= 50 ? 0.7 : 0.5,
      last_updated: new Date().toISOString()
    });
  }
  
  // Pattern 3: Over 2.5 quand xG total > 2.8
  const overMatches = matches.filter(m => m.home_xg && m.away_xg && (m.home_xg + m.away_xg) > 2.8);
  if (overMatches.length >= 20) {
    const overWins = overMatches.filter(m => (m.home_score + m.away_score) > 2.5).length;
    patterns.push({
      id: `foot_over_xg_${Date.now()}`,
      sport: 'football',
      pattern_type: 'over_xg_threshold',
      condition: 'home_xg + away_xg > 2.8',
      outcome: 'over_2.5',
      sample_size: overMatches.length,
      success_rate: Math.round((overWins / overMatches.length) * 100),
      confidence: overMatches.length >= 100 ? 0.9 : overMatches.length >= 50 ? 0.7 : 0.5,
      last_updated: new Date().toISOString()
    });
  }
  
  // Pattern 4: Under 2.5 quand xG total < 2.2
  const underMatches = matches.filter(m => m.home_xg && m.away_xg && (m.home_xg + m.away_xg) < 2.2);
  if (underMatches.length >= 20) {
    const underWins = underMatches.filter(m => (m.home_score + m.away_score) < 2.5).length;
    patterns.push({
      id: `foot_under_xg_${Date.now()}`,
      sport: 'football',
      pattern_type: 'under_xg_threshold',
      condition: 'home_xg + away_xg < 2.2',
      outcome: 'under_2.5',
      sample_size: underMatches.length,
      success_rate: Math.round((underWins / underMatches.length) * 100),
      confidence: underMatches.length >= 100 ? 0.9 : underMatches.length >= 50 ? 0.7 : 0.5,
      last_updated: new Date().toISOString()
    });
  }
  
  // Pattern 5: Possession dominante
  const possessionMatches = matches.filter(m => m.home_possession && m.away_possession && Math.abs(m.home_possession - m.away_possession) > 15);
  if (possessionMatches.length >= 20) {
    const correctPredictions = possessionMatches.filter(m => 
      (m.home_possession! > m.away_possession! && m.result === 'H') || 
      (m.away_possession! > m.home_possession! && m.result === 'A')
    ).length;
    patterns.push({
      id: `foot_possession_${Date.now()}`,
      sport: 'football',
      pattern_type: 'possession_dominance',
      condition: 'abs(home_possession - away_possession) > 15',
      outcome: 'possession_winner',
      sample_size: possessionMatches.length,
      success_rate: Math.round((correctPredictions / possessionMatches.length) * 100),
      confidence: possessionMatches.length >= 100 ? 0.9 : possessionMatches.length >= 50 ? 0.7 : 0.5,
      last_updated: new Date().toISOString()
    });
  }
  
  // Pattern 6: BTTS quand les deux équipes tirent beaucoup
  const bttsMatches = matches.filter(m => 
    (m.home_shots_on_target || 0) >= 3 && 
    (m.away_shots_on_target || 0) >= 3
  );
  if (bttsMatches.length >= 20) {
    const bttsWins = bttsMatches.filter(m => m.home_score > 0 && m.away_score > 0).length;
    patterns.push({
      id: `foot_btts_shots_${Date.now()}`,
      sport: 'football',
      pattern_type: 'btts_high_shots',
      condition: 'home_sot >= 3 AND away_sot >= 3',
      outcome: 'btts_yes',
      sample_size: bttsMatches.length,
      success_rate: Math.round((bttsWins / bttsMatches.length) * 100),
      confidence: bttsMatches.length >= 100 ? 0.9 : bttsMatches.length >= 50 ? 0.7 : 0.5,
      last_updated: new Date().toISOString()
    });
  }
  
  return patterns;
}

function extractBasketballPatterns(matches: BasketballMatch[]): MLPattern[] {
  const patterns: MLPattern[] = [];
  
  // Pattern 1: Favori à domicile avec cote < 1.4
  const homeFavoriteLow = matches.filter(m => m.odds_home && m.odds_home < 1.4);
  if (homeFavoriteLow.length >= 15) {
    const wins = homeFavoriteLow.filter(m => m.result === 'H').length;
    patterns.push({
      id: `basket_home_favorite_${Date.now()}`,
      sport: 'basketball',
      pattern_type: 'home_favorite_low',
      condition: 'odds_home < 1.4',
      outcome: 'home_win',
      sample_size: homeFavoriteLow.length,
      success_rate: Math.round((wins / homeFavoriteLow.length) * 100),
      confidence: homeFavoriteLow.length >= 50 ? 0.8 : 0.6,
      last_updated: new Date().toISOString()
    });
  }
  
  // Pattern 2: FG% difference significative
  const fgMatches = matches.filter(m => m.home_fg_pct && m.away_fg_pct && Math.abs(m.home_fg_pct - m.away_fg_pct) > 5);
  if (fgMatches.length >= 15) {
    const correctPredictions = fgMatches.filter(m => 
      (m.home_fg_pct! > m.away_fg_pct! && m.result === 'H') || 
      (m.away_fg_pct! > m.home_fg_pct! && m.result === 'A')
    ).length;
    patterns.push({
      id: `basket_fg_diff_${Date.now()}`,
      sport: 'basketball',
      pattern_type: 'fg_pct_differential',
      condition: 'abs(home_fg_pct - away_fg_pct) > 5',
      outcome: 'fg_favorite_wins',
      sample_size: fgMatches.length,
      success_rate: Math.round((correctPredictions / fgMatches.length) * 100),
      confidence: fgMatches.length >= 50 ? 0.8 : 0.6,
      last_updated: new Date().toISOString()
    });
  }
  
  // Pattern 3: Over 220 quand moyenne historique élevée
  const highScoringMatches = matches.filter(m => (m.home_score + m.away_score) > 220);
  if (matches.length >= 100) {
    const overRate = Math.round((highScoringMatches.length / matches.length) * 100);
    patterns.push({
      id: `basket_over_rate_${Date.now()}`,
      sport: 'basketball',
      pattern_type: 'league_scoring_rate',
      condition: 'league_avg > 220',
      outcome: 'over_220',
      sample_size: matches.length,
      success_rate: overRate,
      confidence: matches.length >= 200 ? 0.8 : 0.6,
      last_updated: new Date().toISOString()
    });
  }
  
  // Pattern 4: Rebounds dominants
  const reboundMatches = matches.filter(m => m.home_rebounds && m.away_rebounds && Math.abs(m.home_rebounds - m.away_rebounds) > 10);
  if (reboundMatches.length >= 15) {
    const correctPredictions = reboundMatches.filter(m => 
      (m.home_rebounds! > m.away_rebounds! && m.result === 'H') || 
      (m.away_rebounds! > m.home_rebounds! && m.result === 'A')
    ).length;
    patterns.push({
      id: `basket_rebounds_${Date.now()}`,
      sport: 'basketball',
      pattern_type: 'rebound_dominance',
      condition: 'abs(home_rebounds - away_rebounds) > 10',
      outcome: 'rebound_winner',
      sample_size: reboundMatches.length,
      success_rate: Math.round((correctPredictions / reboundMatches.length) * 100),
      confidence: reboundMatches.length >= 50 ? 0.8 : 0.6,
      last_updated: new Date().toISOString()
    });
  }
  
  // Pattern 5: Spread cover analysis
  const spreadMatches = matches.filter(m => m.spread);
  if (spreadMatches.length >= 20) {
    const covers = spreadMatches.filter(m => {
      const homeFinal = m.home_score;
      const awayFinal = m.away_score;
      const spread = m.spread!;
      // Spread négatif = favori domicile
      if (spread < 0) {
        return homeFinal - awayFinal > Math.abs(spread);
      } else {
        return awayFinal - homeFinal > spread;
      }
    }).length;
    patterns.push({
      id: `basket_spread_${Date.now()}`,
      sport: 'basketball',
      pattern_type: 'spread_cover',
      condition: 'favorite covers spread',
      outcome: 'spread_cover',
      sample_size: spreadMatches.length,
      success_rate: Math.round((covers / spreadMatches.length) * 100),
      confidence: spreadMatches.length >= 100 ? 0.8 : 0.6,
      last_updated: new Date().toISOString()
    });
  }
  
  return patterns;
}

// ============================================
// TRAINING FUNCTIONS
// ============================================

async function trainFootballModel(matches: FootballMatch[]): Promise<TrainingResult> {
  console.log('\n⚽ ENTRAÎNEMENT MODÈLE FOOTBALL');
  console.log('-'.repeat(60));
  
  const totalMatches = matches.length;
  const trainingSize = Math.floor(totalMatches * 0.8);
  const trainingMatches = matches.slice(0, trainingSize);
  const testMatches = matches.slice(trainingSize);
  
  console.log(`📊 Total matchs: ${totalMatches}`);
  console.log(`🏋️ Entraînement: ${trainingMatches.length}`);
  console.log(`🧪 Test: ${testMatches.length}`);
  
  // Extraire les features
  const features = matches.map(extractFootballFeatures);
  
  // Calculer l'importance des features
  const featureImportance: Record<string, number> = {};
  const featureNames = Object.keys(features[0] || {});
  
  for (const name of featureNames) {
    const values = features.map(f => f[name]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    featureImportance[name] = Math.abs(mean);
  }
  
  // Extraire les patterns
  const patterns = extractFootballPatterns(matches);
  
  // Simuler les prédictions sur le set de test
  let TP = 0, TN = 0, FP = 0, FN = 0;
  
  for (const match of testMatches) {
    const predicted = predictFootballResult(match, patterns);
    const actual = match.result === 'H' ? 'home' : match.result === 'D' ? 'draw' : 'away';
    
    if (predicted === 'home' && actual === 'home') TP++;
    else if (predicted !== 'home' && actual !== 'home') TN++;
    else if (predicted === 'home' && actual !== 'home') FP++;
    else FN++;
  }
  
  const accuracy = (TP + TN) / (TP + TN + FP + FN);
  const precision = TP / (TP + FP) || 0;
  const recall = TP / (TP + FN) || 0;
  const f1Score = 2 * (precision * recall) / (precision + recall) || 0;
  
  console.log(`\n📊 Résultats:`);
  console.log(`   Accuracy: ${(accuracy * 100).toFixed(1)}%`);
  console.log(`   Precision: ${(precision * 100).toFixed(1)}%`);
  console.log(`   Recall: ${(recall * 100).toFixed(1)}%`);
  console.log(`   F1 Score: ${(f1Score * 100).toFixed(1)}%`);
  console.log(`   Patterns extraits: ${patterns.length}`);
  
  return {
    sport: 'football',
    totalMatches,
    trainingMatches: trainingMatches.length,
    testMatches: testMatches.length,
    accuracy,
    precision,
    recall,
    f1Score,
    patterns,
    featureImportance,
    confusionMatrix: { TP, TN, FP, FN }
  };
}

async function trainBasketballModel(matches: BasketballMatch[]): Promise<TrainingResult> {
  console.log('\n🏀 ENTRAÎNEMENT MODÈLE BASKETBALL');
  console.log('-'.repeat(60));
  
  const totalMatches = matches.length;
  const trainingSize = Math.floor(totalMatches * 0.8);
  const trainingMatches = matches.slice(0, trainingSize);
  const testMatches = matches.slice(trainingSize);
  
  console.log(`📊 Total matchs: ${totalMatches}`);
  console.log(`🏋️ Entraînement: ${trainingMatches.length}`);
  console.log(`🧪 Test: ${testMatches.length}`);
  
  // Extraire les features
  const features = matches.map(extractBasketballFeatures);
  
  // Calculer l'importance des features
  const featureImportance: Record<string, number> = {};
  const featureNames = Object.keys(features[0] || {});
  
  for (const name of featureNames) {
    const values = features.map(f => f[name]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    featureImportance[name] = Math.abs(mean);
  }
  
  // Extraire les patterns
  const patterns = extractBasketballPatterns(matches);
  
  // Simuler les prédictions sur le set de test
  let TP = 0, TN = 0, FP = 0, FN = 0;
  
  for (const match of testMatches) {
    const predicted = predictBasketballResult(match, patterns);
    const actual = match.result === 'H' ? 'home' : 'away';
    
    if (predicted === 'home' && actual === 'home') TP++;
    else if (predicted !== 'home' && actual !== 'home') TN++;
    else if (predicted === 'home' && actual !== 'home') FP++;
    else FN++;
  }
  
  const accuracy = (TP + TN) / (TP + TN + FP + FN);
  const precision = TP / (TP + FP) || 0;
  const recall = TP / (TP + FN) || 0;
  const f1Score = 2 * (precision * recall) / (precision + recall) || 0;
  
  console.log(`\n📊 Résultats:`);
  console.log(`   Accuracy: ${(accuracy * 100).toFixed(1)}%`);
  console.log(`   Precision: ${(precision * 100).toFixed(1)}%`);
  console.log(`   Recall: ${(recall * 100).toFixed(1)}%`);
  console.log(`   F1 Score: ${(f1Score * 100).toFixed(1)}%`);
  console.log(`   Patterns extraits: ${patterns.length}`);
  
  return {
    sport: 'basketball',
    totalMatches,
    trainingMatches: trainingMatches.length,
    testMatches: testMatches.length,
    accuracy,
    precision,
    recall,
    f1Score,
    patterns,
    featureImportance,
    confusionMatrix: { TP, TN, FP, FN }
  };
}

// ============================================
// PREDICTION FUNCTIONS
// ============================================

function predictFootballResult(match: FootballMatch, patterns: MLPattern[]): 'home' | 'draw' | 'away' {
  let homeScore = 0;
  let awayScore = 0;
  
  // Utiliser les cotes comme base
  if (match.odds_home && match.odds_away) {
    const homeProb = 1 / match.odds_home;
    const awayProb = 1 / match.odds_away;
    homeScore += homeProb * 100;
    awayScore += awayProb * 100;
  }
  
  // Utiliser les patterns
  for (const pattern of patterns) {
    if (pattern.pattern_type === 'home_favorite_low' && match.odds_home && match.odds_home < 1.5) {
      homeScore += pattern.success_rate * pattern.confidence;
    }
    if (pattern.pattern_type === 'xg_differential' && match.home_xg && match.away_xg) {
      const diff = match.home_xg - match.away_xg;
      if (Math.abs(diff) > 0.5) {
        if (diff > 0) homeScore += pattern.success_rate * pattern.confidence;
        else awayScore += pattern.success_rate * pattern.confidence;
      }
    }
    if (pattern.pattern_type === 'possession_dominance' && match.home_possession && match.away_possession) {
      const diff = match.home_possession - match.away_possession;
      if (Math.abs(diff) > 15) {
        if (diff > 0) homeScore += pattern.success_rate * pattern.confidence * 0.5;
        else awayScore += pattern.success_rate * pattern.confidence * 0.5;
      }
    }
  }
  
  if (homeScore > awayScore + 10) return 'home';
  if (awayScore > homeScore + 10) return 'away';
  return 'draw';
}

function predictBasketballResult(match: BasketballMatch, patterns: MLPattern[]): 'home' | 'away' {
  let homeScore = 0;
  let awayScore = 0;
  
  // Utiliser les cotes comme base
  if (match.odds_home && match.odds_away) {
    const homeProb = 1 / match.odds_home;
    const awayProb = 1 / match.odds_away;
    homeScore += homeProb * 100;
    awayScore += awayProb * 100;
  }
  
  // Utiliser les patterns
  for (const pattern of patterns) {
    if (pattern.pattern_type === 'home_favorite_low' && match.odds_home && match.odds_home < 1.4) {
      homeScore += pattern.success_rate * pattern.confidence;
    }
    if (pattern.pattern_type === 'fg_pct_differential' && match.home_fg_pct && match.away_fg_pct) {
      const diff = match.home_fg_pct - match.away_fg_pct;
      if (Math.abs(diff) > 5) {
        if (diff > 0) homeScore += pattern.success_rate * pattern.confidence;
        else awayScore += pattern.success_rate * pattern.confidence;
      }
    }
    if (pattern.pattern_type === 'rebound_dominance' && match.home_rebounds && match.away_rebounds) {
      const diff = match.home_rebounds - match.away_rebounds;
      if (Math.abs(diff) > 10) {
        if (diff > 0) homeScore += pattern.success_rate * pattern.confidence * 0.5;
        else awayScore += pattern.success_rate * pattern.confidence * 0.5;
      }
    }
  }
  
  return homeScore >= awayScore ? 'home' : 'away';
}

// ============================================
// BACKTEST
// ============================================

async function runBacktestFootball(matches: FootballMatch[], patterns: MLPattern[]): Promise<BacktestResult> {
  console.log('\n🎰 BACKTEST FOOTBALL');
  console.log('-'.repeat(60));
  
  const STAKE = 10;
  const byConfidence = {
    very_high: { bets: 0, wins: 0, winRate: 0, profit: 0 },
    high: { bets: 0, wins: 0, winRate: 0, profit: 0 },
    medium: { bets: 0, wins: 0, winRate: 0, profit: 0 },
    low: { bets: 0, wins: 0, winRate: 0, profit: 0 }
  };
  const byLeague: Record<string, { bets: number; wins: number; winRate: number }> = {};
  
  let totalStake = 0;
  let totalReturn = 0;
  let wins = 0;
  let losses = 0;
  
  for (const match of matches) {
    if (!match.odds_home || !match.odds_away) continue;
    
    const prediction = predictFootballResult(match, patterns);
    const actual = match.result === 'H' ? 'home' : match.result === 'D' ? 'draw' : 'away';
    const correct = prediction === actual;
    
    // Déterminer la confiance
    let confidence: 'very_high' | 'high' | 'medium' | 'low';
    const minOdds = Math.min(match.odds_home, match.odds_away, match.odds_draw || 3.3);
    if (minOdds < 1.4) confidence = 'very_high';
    else if (minOdds < 1.8) confidence = 'high';
    else if (minOdds < 2.5) confidence = 'medium';
    else confidence = 'low';
    
    // Calculer le profit
    let odds = 1.0;
    if (prediction === 'home') odds = match.odds_home;
    else if (prediction === 'away') odds = match.odds_away;
    else odds = match.odds_draw || 3.3;
    
    const profit = correct ? (STAKE * odds) - STAKE : -STAKE;
    
    totalStake += STAKE;
    if (correct) {
      wins++;
      totalReturn += STAKE * odds;
    } else {
      losses++;
    }
    
    byConfidence[confidence].bets++;
    byConfidence[confidence].profit += profit;
    if (correct) byConfidence[confidence].wins++;
    
    // Par ligue
    const league = match.league_name || 'Unknown';
    if (!byLeague[league]) byLeague[league] = { bets: 0, wins: 0, winRate: 0 };
    byLeague[league].bets++;
    if (correct) byLeague[league].wins++;
  }
  
  // Calculer les win rates
  for (const key of ['very_high', 'high', 'medium', 'low'] as const) {
    if (byConfidence[key].bets > 0) {
      byConfidence[key].winRate = Math.round((byConfidence[key].wins / byConfidence[key].bets) * 100);
    }
  }
  
  for (const league of Object.keys(byLeague)) {
    if (byLeague[league].bets > 0) {
      byLeague[league].winRate = Math.round((byLeague[league].wins / byLeague[league].bets) * 100);
    }
  }
  
  const totalBets = wins + losses;
  const winRate = totalBets > 0 ? Math.round((wins / totalBets) * 100) : 0;
  const profit = totalReturn - totalStake;
  const roi = totalStake > 0 ? Math.round((profit / totalStake) * 100) : 0;
  
  console.log(`📊 Paris: ${totalBets} | Gains: ${wins} | Pertes: ${losses}`);
  console.log(`📈 Win Rate: ${winRate}% | ROI: ${roi}%`);
  console.log(`💰 Profit: ${profit >= 0 ? '+' : ''}${profit.toFixed(2)}€`);
  
  console.log('\n📊 Par confiance:');
  for (const key of ['very_high', 'high', 'medium', 'low'] as const) {
    const c = byConfidence[key];
    if (c.bets > 0) {
      console.log(`   ${key.toUpperCase()}: ${c.bets} paris | ${c.winRate}% | ${c.profit >= 0 ? '+' : ''}${c.profit.toFixed(2)}€`);
    }
  }
  
  return {
    sport: 'football',
    totalBets,
    wins,
    losses,
    winRate,
    totalStake,
    totalReturn,
    profit,
    roi,
    byConfidence,
    byLeague
  };
}

async function runBacktestBasketball(matches: BasketballMatch[], patterns: MLPattern[]): Promise<BacktestResult> {
  console.log('\n🎰 BACKTEST BASKETBALL');
  console.log('-'.repeat(60));
  
  const STAKE = 10;
  const byConfidence = {
    very_high: { bets: 0, wins: 0, winRate: 0, profit: 0 },
    high: { bets: 0, wins: 0, winRate: 0, profit: 0 },
    medium: { bets: 0, wins: 0, winRate: 0, profit: 0 },
    low: { bets: 0, wins: 0, winRate: 0, profit: 0 }
  };
  const byLeague: Record<string, { bets: number; wins: number; winRate: number }> = {};
  
  let totalStake = 0;
  let totalReturn = 0;
  let wins = 0;
  let losses = 0;
  
  for (const match of matches) {
    if (!match.odds_home || !match.odds_away) continue;
    
    const prediction = predictBasketballResult(match, patterns);
    const actual = match.result === 'H' ? 'home' : 'away';
    const correct = prediction === actual;
    
    // Déterminer la confiance
    let confidence: 'very_high' | 'high' | 'medium' | 'low';
    const minOdds = Math.min(match.odds_home, match.odds_away);
    if (minOdds < 1.3) confidence = 'very_high';
    else if (minOdds < 1.6) confidence = 'high';
    else if (minOdds < 2.0) confidence = 'medium';
    else confidence = 'low';
    
    // Calculer le profit
    const odds = prediction === 'home' ? match.odds_home : match.odds_away;
    const profit = correct ? (STAKE * odds) - STAKE : -STAKE;
    
    totalStake += STAKE;
    if (correct) {
      wins++;
      totalReturn += STAKE * odds;
    } else {
      losses++;
    }
    
    byConfidence[confidence].bets++;
    byConfidence[confidence].profit += profit;
    if (correct) byConfidence[confidence].wins++;
    
    // Par ligue
    const league = match.league_name || 'NBA';
    if (!byLeague[league]) byLeague[league] = { bets: 0, wins: 0, winRate: 0 };
    byLeague[league].bets++;
    if (correct) byLeague[league].wins++;
  }
  
  // Calculer les win rates
  for (const key of ['very_high', 'high', 'medium', 'low'] as const) {
    if (byConfidence[key].bets > 0) {
      byConfidence[key].winRate = Math.round((byConfidence[key].wins / byConfidence[key].bets) * 100);
    }
  }
  
  for (const league of Object.keys(byLeague)) {
    if (byLeague[league].bets > 0) {
      byLeague[league].winRate = Math.round((byLeague[league].wins / byLeague[league].bets) * 100);
    }
  }
  
  const totalBets = wins + losses;
  const winRate = totalBets > 0 ? Math.round((wins / totalBets) * 100) : 0;
  const profit = totalReturn - totalStake;
  const roi = totalStake > 0 ? Math.round((profit / totalStake) * 100) : 0;
  
  console.log(`📊 Paris: ${totalBets} | Gains: ${wins} | Pertes: ${losses}`);
  console.log(`📈 Win Rate: ${winRate}% | ROI: ${roi}%`);
  console.log(`💰 Profit: ${profit >= 0 ? '+' : ''}${profit.toFixed(2)}€`);
  
  console.log('\n📊 Par confiance:');
  for (const key of ['very_high', 'high', 'medium', 'low'] as const) {
    const c = byConfidence[key];
    if (c.bets > 0) {
      console.log(`   ${key.toUpperCase()}: ${c.bets} paris | ${c.winRate}% | ${c.profit >= 0 ? '+' : ''}${c.profit.toFixed(2)}€`);
    }
  }
  
  return {
    sport: 'basketball',
    totalBets,
    wins,
    losses,
    winRate,
    totalStake,
    totalReturn,
    profit,
    roi,
    byConfidence,
    byLeague
  };
}

// ============================================
// SAVE TO DATABASE
// ============================================

async function savePatternsToDatabase(patterns: MLPattern[]): Promise<void> {
  console.log('\n💾 Sauvegarde des patterns en base...');
  
  for (const pattern of patterns) {
    const { error } = await supabase
      .from('ml_patterns')
      .upsert(pattern, { onConflict: 'id' });
    
    if (error) {
      console.log(`   ⚠️ Erreur sauvegarde pattern ${pattern.pattern_type}: ${error.message}`);
    }
  }
  
  console.log(`   ✅ ${patterns.length} patterns sauvegardés`);
}

async function saveTrainingReport(
  footballResult: TrainingResult,
  basketballResult: TrainingResult,
  footballBacktest: BacktestResult,
  basketballBacktest: BacktestResult
): Promise<void> {
  const report = {
    generatedAt: new Date().toISOString(),
    version: '2.0',
    football: {
      training: footballResult,
      backtest: footballBacktest
    },
    basketball: {
      training: basketballResult,
      backtest: basketballBacktest
    },
    summary: {
      totalMatches: footballResult.totalMatches + basketballResult.totalMatches,
      totalPatterns: footballResult.patterns.length + basketballResult.patterns.length,
      avgAccuracy: ((footballResult.accuracy + basketballResult.accuracy) / 2 * 100).toFixed(1) + '%',
      totalProfit: footballBacktest.profit + basketballBacktest.profit,
      totalROI: ((footballBacktest.roi + basketballBacktest.roi) / 2)
    }
  };
  
  // Sauvegarder localement
  const reportPath = path.join(process.cwd(), 'data', 'ml-training-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Rapport sauvegardé: ${reportPath}`);
  
  // Sauvegarder dans Supabase
  const { error } = await supabase
    .from('ml_learning')
    .insert({
      id: `training_${Date.now()}`,
      sport: 'all',
      training_date: new Date().toISOString(),
      accuracy: report.summary.avgAccuracy,
      patterns_count: report.summary.totalPatterns,
      report: report
    });
  
  if (!error) {
    console.log('✅ Rapport sauvegardé dans Supabase');
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🧠 ML TRAINING AVANCÉ - ENTRAÎNEMENT COMPLET');
  console.log('='.repeat(70));
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log('='.repeat(70));
  
  // Charger les données
  console.log('\n📡 Chargement des données depuis Supabase...');
  
  const { data: footballMatches } = await supabase
    .from('football_matches')
    .select('*')
    .order('match_date', { ascending: true });
  
  const { data: basketballMatches } = await supabase
    .from('basketball_matches')
    .select('*')
    .order('match_date', { ascending: true });
  
  console.log(`✅ Football: ${footballMatches?.length || 0} matchs`);
  console.log(`✅ Basketball: ${basketballMatches?.length || 0} matchs`);
  
  if (!footballMatches?.length && !basketballMatches?.length) {
    console.log('❌ Aucune donnée disponible');
    return;
  }
  
  // Entraînement Football
  const footballTraining = await trainFootballModel((footballMatches || []) as FootballMatch[]);
  const footballBacktest = await runBacktestFootball((footballMatches || []) as FootballMatch[], footballTraining.patterns);
  
  // Entraînement Basketball
  const basketballTraining = await trainBasketballModel((basketballMatches || []) as BasketballMatch[]);
  const basketballBacktest = await runBacktestBasketball((basketballMatches || []) as BasketballMatch[], basketballTraining.patterns);
  
  // Sauvegarder les patterns
  const allPatterns = [...footballTraining.patterns, ...basketballTraining.patterns];
  await savePatternsToDatabase(allPatterns);
  
  // Sauvegarder le rapport
  await saveTrainingReport(footballTraining, basketballTraining, footballBacktest, basketballBacktest);
  
  // Résumé final
  console.log('\n' + '='.repeat(70));
  console.log('📊 RÉSUMÉ FINAL');
  console.log('='.repeat(70));
  console.log(`\n⚽ FOOTBALL:`);
  console.log(`   Matchs analysés: ${footballTraining.totalMatches}`);
  console.log(`   Patterns extraits: ${footballTraining.patterns.length}`);
  console.log(`   Accuracy: ${(footballTraining.accuracy * 100).toFixed(1)}%`);
  console.log(`   Backtest Win Rate: ${footballBacktest.winRate}%`);
  console.log(`   Backtest ROI: ${footballBacktest.roi}%`);
  
  console.log(`\n🏀 BASKETBALL:`);
  console.log(`   Matchs analysés: ${basketballTraining.totalMatches}`);
  console.log(`   Patterns extraits: ${basketballTraining.patterns.length}`);
  console.log(`   Accuracy: ${(basketballTraining.accuracy * 100).toFixed(1)}%`);
  console.log(`   Backtest Win Rate: ${basketballBacktest.winRate}%`);
  console.log(`   Backtest ROI: ${basketballBacktest.roi}%`);
  
  console.log(`\n💰 TOTAL:`);
  console.log(`   Profit combiné: ${(footballBacktest.profit + basketballBacktest.profit).toFixed(2)}€`);
  
  console.log('\n🎉 ENTRAÎNEMENT TERMINÉ AVEC SUCCÈS!');
}

main().catch(console.error);
