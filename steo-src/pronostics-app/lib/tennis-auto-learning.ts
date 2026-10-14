/**
 * Tennis Auto-Learning System - Apprentissage automatique des résultats
 * 
 * FONCTIONNALITÉS:
 * 1. Enregistrement des prédictions avec timestamp
 * 2. Vérification automatique des résultats
 * 3. Ajustement des poids du modèle selon les performances
 * 4. Détection des patterns gagnants/perdants
 * 5. Métriques par facteur (classement, surface, forme, H2H)
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// INTERFACES
// ============================================

interface PredictionRecord {
  id: string;
  timestamp: string;
  player1: string;
  player2: string;
  tournament: string;
  surface: string;
  category: 'atp' | 'wta' | 'challenger' | 'itf';
  
  // Prédiction
  predictedWinner: 'player1' | 'player2';
  winProbability: number;
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  recommendedBet: boolean;
  kellyStake: number;
  
  // Cotes au moment de la prédiction
  odds1: number;
  odds2: number;
  
  // Facteurs utilisés
  factors: {
    rankingDiff: number;
    surfaceAdvantage: string;
    formAdvantage: string;
    h2hExists: boolean;
    oddsImpliedProb: number;
  };
  
  // Résultat (rempli après vérification)
  result?: {
    actualWinner: 'player1' | 'player2';
    score?: string;
    verifiedAt: string;
    isCorrect: boolean;
  };
}

interface LearningMetrics {
  // Métriques globales
  totalPredictions: number;
  verifiedPredictions: number;
  correctPredictions: number;
  overallAccuracy: number;
  
  // Par niveau de confiance
  byConfidence: {
    very_high: { total: number; correct: number; accuracy: number };
    high: { total: number; correct: number; accuracy: number };
    medium: { total: number; correct: number; accuracy: number };
    low: { total: number; correct: number; accuracy: number };
  };
  
  // Par surface
  bySurface: Record<string, { total: number; correct: number; accuracy: number }>;
  
  // Par catégorie
  byCategory: Record<string, { total: number; correct: number; accuracy: number }>;
  
  // Performance des facteurs
  factorPerformance: {
    ranking: { used: number; correct: number; impact: number };
    surface: { used: number; correct: number; impact: number };
    form: { used: number; correct: number; impact: number };
    h2h: { used: number; correct: number; impact: number };
    odds: { used: number; correct: number; impact: number };
  };
  
  // Poids ajustés du modèle
  modelWeights: {
    ranking: number;
    surface: number;
    form: number;
    h2h: number;
    odds: number;
  };
  
  // ROI tracking
  bettingROI: {
    totalStaked: number;
    totalReturn: number;
    roi: number;
    winningBets: number;
    losingBets: number;
  };
  
  lastUpdated: string;
}

interface LearningConfig {
  minPredictionsForAdjustment: number;
  learningRate: number;
  weightDecay: number;
  minWeight: number;
  maxWeight: number;
}

// ============================================
// CONFIGURATION
// ============================================

const DATA_DIR = path.join(process.cwd(), 'data');
const PREDICTIONS_LOG = path.join(DATA_DIR, 'tennis-predictions-log.json');
const METRICS_FILE = path.join(DATA_DIR, 'tennis-learning-metrics.json');

const DEFAULT_WEIGHTS = {
  ranking: 0.25,
  surface: 0.20,
  form: 0.20,
  h2h: 0.15,
  odds: 0.20,
};

const CONFIG: LearningConfig = {
  minPredictionsForAdjustment: 50,
  learningRate: 0.05,
  weightDecay: 0.01,
  minWeight: 0.10,
  maxWeight: 0.40,
};

// ============================================
// STORAGE
// ============================================

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadPredictionsLog(): PredictionRecord[] {
  ensureDataDir();
  try {
    if (fs.existsSync(PREDICTIONS_LOG)) {
      return JSON.parse(fs.readFileSync(PREDICTIONS_LOG, 'utf-8'));
    }
  } catch (error) {
    console.error('Error loading predictions log:', error);
  }
  return [];
}

function savePredictionsLog(predictions: PredictionRecord[]): void {
  ensureDataDir();
  fs.writeFileSync(PREDICTIONS_LOG, JSON.stringify(predictions, null, 2));
}

function loadMetrics(): LearningMetrics {
  ensureDataDir();
  try {
    if (fs.existsSync(METRICS_FILE)) {
      return JSON.parse(fs.readFileSync(METRICS_FILE, 'utf-8'));
    }
  } catch (error) {
    console.log('Creating new metrics file');
  }
  
  return {
    totalPredictions: 0,
    verifiedPredictions: 0,
    correctPredictions: 0,
    overallAccuracy: 0,
    byConfidence: {
      very_high: { total: 0, correct: 0, accuracy: 0 },
      high: { total: 0, correct: 0, accuracy: 0 },
      medium: { total: 0, correct: 0, accuracy: 0 },
      low: { total: 0, correct: 0, accuracy: 0 },
    },
    bySurface: {},
    byCategory: {},
    factorPerformance: {
      ranking: { used: 0, correct: 0, impact: 0 },
      surface: { used: 0, correct: 0, impact: 0 },
      form: { used: 0, correct: 0, impact: 0 },
      h2h: { used: 0, correct: 0, impact: 0 },
      odds: { used: 0, correct: 0, impact: 0 },
    },
    modelWeights: { ...DEFAULT_WEIGHTS },
    bettingROI: {
      totalStaked: 0,
      totalReturn: 0,
      roi: 0,
      winningBets: 0,
      losingBets: 0,
    },
    lastUpdated: new Date().toISOString(),
  };
}

function saveMetrics(metrics: LearningMetrics): void {
  ensureDataDir();
  metrics.lastUpdated = new Date().toISOString();
  fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
}

// ============================================
// RECORD PREDICTION
// ============================================

export function recordPrediction(
  prediction: Omit<PredictionRecord, 'id' | 'timestamp'>
): string {
  const predictions = loadPredictionsLog();
  const metrics = loadMetrics();
  
  const id = `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const record: PredictionRecord = {
    ...prediction,
    id,
    timestamp: new Date().toISOString(),
  };
  
  predictions.push(record);
  
  // Limiter l'historique à 10000 prédictions
  if (predictions.length > 10000) {
    predictions.splice(0, predictions.length - 10000);
  }
  
  savePredictionsLog(predictions);
  
  // Mettre à jour le compteur total
  metrics.totalPredictions++;
  saveMetrics(metrics);
  
  console.log(`📝 Prediction recorded: ${id}`);
  
  return id;
}

// ============================================
// VERIFY RESULT
// ============================================

export function verifyResult(
  predictionId: string,
  actualWinner: 'player1' | 'player2',
  score?: string
): boolean {
  const predictions = loadPredictionsLog();
  const metrics = loadMetrics();
  
  const prediction = predictions.find(p => p.id === predictionId);
  if (!prediction) {
    console.log(`⚠️ Prediction ${predictionId} not found`);
    return false;
  }
  
  if (prediction.result) {
    console.log(`⚠️ Prediction ${predictionId} already verified`);
    return false;
  }
  
  const isCorrect = prediction.predictedWinner === actualWinner;
  
  // Enregistrer le résultat
  prediction.result = {
    actualWinner,
    score,
    verifiedAt: new Date().toISOString(),
    isCorrect,
  };
  
  savePredictionsLog(predictions);
  
  // Mettre à jour les métriques
  updateMetrics(metrics, prediction, isCorrect);
  
  console.log(`✅ Result verified: ${predictionId} - ${isCorrect ? 'CORRECT' : 'INCORRECT'}`);
  
  return isCorrect;
}

// ============================================
// UPDATE METRICS
// ============================================

function updateMetrics(
  metrics: LearningMetrics,
  prediction: PredictionRecord,
  isCorrect: boolean
): void {
  metrics.verifiedPredictions++;
  if (isCorrect) metrics.correctPredictions++;
  metrics.overallAccuracy = (metrics.correctPredictions / metrics.verifiedPredictions) * 100;
  
  // Par confiance
  const conf = prediction.confidence;
  metrics.byConfidence[conf].total++;
  if (isCorrect) metrics.byConfidence[conf].correct++;
  metrics.byConfidence[conf].accuracy = 
    (metrics.byConfidence[conf].correct / metrics.byConfidence[conf].total) * 100;
  
  // Par surface
  if (!metrics.bySurface[prediction.surface]) {
    metrics.bySurface[prediction.surface] = { total: 0, correct: 0, accuracy: 0 };
  }
  metrics.bySurface[prediction.surface].total++;
  if (isCorrect) metrics.bySurface[prediction.surface].correct++;
  metrics.bySurface[prediction.surface].accuracy = 
    (metrics.bySurface[prediction.surface].correct / metrics.bySurface[prediction.surface].total) * 100;
  
  // Par catégorie
  if (!metrics.byCategory[prediction.category]) {
    metrics.byCategory[prediction.category] = { total: 0, correct: 0, accuracy: 0 };
  }
  metrics.byCategory[prediction.category].total++;
  if (isCorrect) metrics.byCategory[prediction.category].correct++;
  metrics.byCategory[prediction.category].accuracy = 
    (metrics.byCategory[prediction.category].correct / metrics.byCategory[prediction.category].total) * 100;
  
  // ROI betting
  if (prediction.recommendedBet) {
    const stake = prediction.kellyStake;
    metrics.bettingROI.totalStaked += stake;
    
    if (isCorrect) {
      const odds = prediction.predictedWinner === 'player1' ? prediction.odds1 : prediction.odds2;
      const return_ = stake * odds;
      metrics.bettingROI.totalReturn += return_;
      metrics.bettingROI.winningBets++;
    } else {
      metrics.bettingROI.losingBets++;
    }
    
    metrics.bettingROI.roi = 
      ((metrics.bettingROI.totalReturn - metrics.bettingROI.totalStaked) / metrics.bettingROI.totalStaked) * 100;
  }
  
  saveMetrics(metrics);
  
  // Ajuster les poids si on a assez de données
  if (metrics.verifiedPredictions % 50 === 0) {
    adjustWeights(metrics);
  }
}

// ============================================
// ADJUST WEIGHTS
// ============================================

function adjustWeights(metrics: LearningMetrics): void {
  if (metrics.verifiedPredictions < CONFIG.minPredictionsForAdjustment) {
    return;
  }
  
  console.log('\n🔧 Adjusting model weights based on performance...');
  
  // Calculer l'impact de chaque facteur
  const predictions = loadPredictionsLog().filter(p => p.result);
  
  // Analyser chaque facteur
  const factorSuccess: Record<string, { used: number; correct: number }> = {
    ranking: { used: 0, correct: 0 },
    surface: { used: 0, correct: 0 },
    form: { used: 0, correct: 0 },
    h2h: { used: 0, correct: 0 },
    odds: { used: 0, correct: 0 },
  };
  
  for (const pred of predictions) {
    const isCorrect = pred.result!.isCorrect;
    
    // Ranking: si différence > 20 places
    if (Math.abs(pred.factors.rankingDiff) > 20) {
      factorSuccess.ranking.used++;
      if (isCorrect) factorSuccess.ranking.correct++;
    }
    
    // Surface: si avantage marqué
    if (pred.factors.surfaceAdvantage !== 'Équilibré') {
      factorSuccess.surface.used++;
      if (isCorrect) factorSuccess.surface.correct++;
    }
    
    // Forme: si avantage marqué
    if (pred.factors.formAdvantage !== 'Équilibré') {
      factorSuccess.form.used++;
      if (isCorrect) factorSuccess.form.correct++;
    }
    
    // H2H
    if (pred.factors.h2hExists) {
      factorSuccess.h2h.used++;
      if (isCorrect) factorSuccess.h2h.correct++;
    }
    
    // Odds: toujours utilisé
    factorSuccess.odds.used++;
    if (isCorrect) factorSuccess.odds.correct++;
  }
  
  // Calculer les nouveaux poids
  const weights = { ...metrics.modelWeights };
  
  for (const [factor, data] of Object.entries(factorSuccess)) {
    if (data.used >= 30) {
      const successRate = data.correct / data.used;
      const baseline = metrics.overallAccuracy / 100;
      
      // Si le facteur performe mieux que la moyenne, augmenter son poids
      const performance = successRate - baseline;
      const adjustment = performance * CONFIG.learningRate;
      
      weights[factor as keyof typeof weights] = Math.max(
        CONFIG.minWeight,
        Math.min(CONFIG.maxWeight, weights[factor as keyof typeof weights] + adjustment)
      );
      
      console.log(`  ${factor}: ${data.correct}/${data.used} (${(successRate * 100).toFixed(1)}%) -> weight: ${weights[factor as keyof typeof weights].toFixed(3)}`);
    }
  }
  
  // Normaliser les poids pour qu'ils somment à 1
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  for (const key of Object.keys(weights) as (keyof typeof weights)[]) {
    weights[key] = weights[key] / totalWeight;
  }
  
  metrics.modelWeights = weights;
  metrics.factorPerformance = {
    ranking: { ...factorSuccess.ranking, impact: factorSuccess.ranking.correct / (factorSuccess.ranking.used || 1) },
    surface: { ...factorSuccess.surface, impact: factorSuccess.surface.correct / (factorSuccess.surface.used || 1) },
    form: { ...factorSuccess.form, impact: factorSuccess.form.correct / (factorSuccess.form.used || 1) },
    h2h: { ...factorSuccess.h2h, impact: factorSuccess.h2h.correct / (factorSuccess.h2h.used || 1) },
    odds: { ...factorSuccess.odds, impact: factorSuccess.odds.correct / (factorSuccess.odds.used || 1) },
  };
  
  saveMetrics(metrics);
  
  console.log('\n📊 Updated model weights:');
  for (const [factor, weight] of Object.entries(weights)) {
    console.log(`  ${factor}: ${(weight * 100).toFixed(1)}%`);
  }
}

// ============================================
// GET LEARNED WEIGHTS
// ============================================

export function getLearnedWeights(): {
  ranking: number;
  surface: number;
  form: number;
  h2h: number;
  odds: number;
} {
  const metrics = loadMetrics();
  
  if (metrics.verifiedPredictions >= CONFIG.minPredictionsForAdjustment) {
    return metrics.modelWeights;
  }
  
  return DEFAULT_WEIGHTS;
}

// ============================================
// GET PERFORMANCE REPORT
// ============================================

export function getPerformanceReport(): {
  summary: string;
  metrics: LearningMetrics;
  recommendations: string[];
} {
  const metrics = loadMetrics();
  const recommendations: string[] = [];
  
  // Analyser et générer des recommandations
  if (metrics.verifiedPredictions > 0) {
    // Confiance
    const bestConfidence = Object.entries(metrics.byConfidence)
      .filter(([_, v]) => v.total >= 10)
      .sort((a, b) => b[1].accuracy - a[1].accuracy)[0];
    
    if (bestConfidence) {
      recommendations.push(
        `Meilleure confiance: ${bestConfidence[0]} (${bestConfidence[1].accuracy.toFixed(1)}% sur ${bestConfidence[1].total} prédictions)`
      );
    }
    
    // Surface
    const bestSurface = Object.entries(metrics.bySurface)
      .filter(([_, v]) => v.total >= 10)
      .sort((a, b) => b[1].accuracy - a[1].accuracy)[0];
    
    if (bestSurface) {
      recommendations.push(
        `Meilleure surface: ${bestSurface[0]} (${bestSurface[1].accuracy.toFixed(1)}%)`
      );
    }
    
    // ROI
    if (metrics.bettingROI.totalStaked > 0) {
      const roiStatus = metrics.bettingROI.roi > 0 ? 'profitable' : 'en perte';
      recommendations.push(
        `ROI paris: ${metrics.bettingROI.roi.toFixed(1)}% (${roiStatus})`
      );
    }
    
    // Alertes
    if (metrics.byConfidence.very_high.total > 20 && metrics.byConfidence.very_high.accuracy < 60) {
      recommendations.push(
        `⚠️ Les prédictions "very_high" sous-performent (${metrics.byConfidence.very_high.accuracy.toFixed(1)}%) - revoir les seuils`
      );
    }
  }
  
  const summary = metrics.verifiedPredictions > 0
    ? `${metrics.correctPredictions}/${metrics.verifiedPredictions} correctes (${metrics.overallAccuracy.toFixed(1)}%) sur ${metrics.totalPredictions} prédictions`
    : `Aucune prédiction vérifiée sur ${metrics.totalPredictions} enregistrées`;
  
  return {
    summary,
    metrics,
    recommendations,
  };
}

// ============================================
// EXPORT
// ============================================

export type {
  PredictionRecord,
  LearningMetrics,
};

export {
  DEFAULT_WEIGHTS,
};
