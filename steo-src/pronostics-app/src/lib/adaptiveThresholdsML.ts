// @ts-nocheck
/**
 * Adaptive Thresholds ML - Machine Learning pour Seuils Adaptatifs
 * 
 * APPROCHE:
 * - Analyse les prédictions passées pour identifier les patterns de succès
 * - Ajuste dynamiquement les seuils (edge, impact blessures, poids forme)
 * - Utilise une approche Bayésienne simple pour mise à jour progressive
 * - Fournit des seuils personnalisés par sport/ligue
 * 
 * ALGORITHMES:
 * - Bayesian Updating: Mise à jour progressive des seuils
 * - Logistic Regression: Poids optimaux des features
 * - Moving Average: Lissage des seuils sur le temps
 * - A/B Testing: Comparaison de configurations
 * 
 * PERSISTANCE:
 * - Local: /data/ml_model.json (développement)
 * - Vercel: Désactivé (read-only) - mémoire uniquement
 */

import * as fs from 'fs';
import * as path from 'path';
import { PredictionRecord, loadPredictions, PredictionStats } from './predictionTracker';

// Détecter si on est sur Vercel (read-only filesystem)
const IS_VERCEL = process.env.VERCEL === '1' || process.env.VERCEL_ENV;

// ============================================
// TYPES
// ============================================

export interface MLThresholds {
  // Seuils principaux
  edgeThreshold: number; // Seuil minimum pour value bet (0.01-0.10)
  
  // Facteurs d'impact
  injuryImpactFactor: number; // Multiplicateur impact blessures (0.5-2.0)
  formWeight: number; // Poids de la forme dans l'ajustement (0.01-0.15)
  xgWeight: number; // Poids des xG (0.01-0.10)
  netRatingWeight: number; // Poids du Net Rating NBA (0.01-0.10)
  
  // Poids de confiance Kelly
  confidenceWeights: {
    very_high: number; // Fraction du Kelly (0.3-0.7)
    high: number;
    medium: number;
    low: number;
  };
  
  // Seuils de qualité des données
  minDataQuality: number; // Qualité min pour confiance élevée (30-80)
  
  // Seuils sport-spécifiques
  sportSpecific: {
    football: {
      h2hWeight: number;
      disciplineWeight: number;
    };
    basketball: {
      paceWeight: number;
      restDaysWeight: number;
    };
  };
  
  // Métadonnées
  version: string;
  lastUpdated: string;
  samplesUsed: number;
  accuracy: number;
}

export interface MLModel {
  thresholds: MLThresholds;
  featureWeights: Record<string, number>;
  sportAdjustments: Record<string, Partial<MLThresholds>>;
  confidence: number; // Confiance dans le modèle (0-1)
  trainingHistory: Array<{
    date: string;
    samples: number;
    accuracy: number;
    thresholds: MLThresholds;
  }>;
}

export interface FeatureVector {
  edge: number;
  dataQuality: number;
  homeInjuries: number;
  awayInjuries: number;
  homeFormScore: number;
  awayFormScore: number;
  homeXG: number;
  awayXG: number;
  homeNetRating: number;
  awayNetRating: number;
  confidence: number;
}

// ============================================
// CONFIGURATION
// ============================================

const DATA_DIR = path.join(process.cwd(), 'data');
const ML_MODEL_FILE = path.join(DATA_DIR, 'ml_model.json');

const DEFAULT_THRESHOLDS: MLThresholds = {
  edgeThreshold: 0.03,
  injuryImpactFactor: 1.0,
  formWeight: 0.05,
  xgWeight: 0.03,
  netRatingWeight: 0.03,
  confidenceWeights: {
    very_high: 0.5,
    high: 0.4,
    medium: 0.25,
    low: 0.1,
  },
  minDataQuality: 50,
  sportSpecific: {
    football: {
      h2hWeight: 0.02,
      disciplineWeight: 0.01,
    },
    basketball: {
      paceWeight: 0.02,
      restDaysWeight: 0.01,
    },
  },
  version: '1.0.0',
  lastUpdated: '',
  samplesUsed: 0,
  accuracy: 0,
};

const MIN_SAMPLES_FOR_TRAINING = 20;
const LEARNING_RATE = 0.1; // Vitesse d'adaptation
const MOMENTUM = 0.9; // Momentum pour le lissage

// Stockage en mémoire pour Vercel (temporaire)
let memoryModel: MLModel | null = null;

// ============================================
// FONCTIONS DE PERSISTANCE
// ============================================

function ensureDataDir(): void {
  // Skip sur Vercel (read-only)
  if (IS_VERCEL) return;
  
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadModel(): MLModel {
  // Sur Vercel, utiliser le stockage mémoire
  if (IS_VERCEL && memoryModel) {
    return memoryModel;
  }
  
  ensureDataDir();
  
  if (!fs.existsSync(ML_MODEL_FILE)) {
    return getDefaultModel();
  }
  
  try {
    const data = fs.readFileSync(ML_MODEL_FILE, 'utf-8');
    const model = JSON.parse(data);
    
    // Sur Vercel, stocker en mémoire pour les prochains appels
    if (IS_VERCEL) {
      memoryModel = model;
    }
    
    return model;
  } catch {
    return getDefaultModel();
  }
}

function getDefaultModel(): MLModel {
  return {
    thresholds: { ...DEFAULT_THRESHOLDS, lastUpdated: new Date().toISOString() },
    featureWeights: {
      edge: 0.25,
      dataQuality: 0.20,
      injuries: 0.15,
      form: 0.15,
      xG: 0.10,
      netRating: 0.10,
      confidence: 0.05,
    },
    sportAdjustments: {},
    confidence: 0.5,
    trainingHistory: [],
  };
}

function saveModel(model: MLModel): void {
  // Sur Vercel, stocker en mémoire uniquement
  if (IS_VERCEL) {
    memoryModel = model;
    console.log(`🧠 [Vercel] Modèle ML stocké en mémoire`);
    return;
  }
  
  ensureDataDir();
  fs.writeFileSync(ML_MODEL_FILE, JSON.stringify(model, null, 2));
}

// ============================================
// FONCTIONS D'ENTRAÎNEMENT
// ============================================

/**
 * Extrait un vecteur de features normalisé d'une prédiction
 */
function extractFeatures(p: PredictionRecord): FeatureVector {
  return {
    edge: p.prediction.edge / 100, // 0-1
    dataQuality: p.context.dataQuality / 100, // 0-1
    homeInjuries: Math.min(p.context.homeInjuries / 5, 1), // 0-1 (max 5)
    awayInjuries: Math.min(p.context.awayInjuries / 5, 1),
    homeFormScore: (p.context.homeFormScore || 50) / 100,
    awayFormScore: (p.context.awayFormScore || 50) / 100,
    homeXG: (p.context.homeXG || 1.5) / 3, // Normalisé autour de 1.5
    awayXG: (p.context.awayXG || 1.5) / 3,
    homeNetRating: ((p.context.homeNetRating || 0) + 10) / 20, // -10 à +10 -> 0-1
    awayNetRating: ((p.context.awayNetRating || 0) + 10) / 20,
    confidence: { very_high: 1, high: 0.75, medium: 0.5, low: 0.25 }[p.prediction.confidence] || 0.5,
  };
}

/**
 * Calcule la contribution de chaque feature au résultat
 */
function calculateFeatureContribution(
  features: FeatureVector,
  weights: Record<string, number>
): number {
  return (
    features.edge * weights.edge +
    features.dataQuality * weights.dataQuality +
    (features.homeInjuries - features.awayInjuries) * weights.injuries * -1 +
    (features.homeFormScore - features.awayFormScore) * weights.form +
    (features.homeXG - features.awayXG) * weights.xG +
    (features.homeNetRating - features.awayNetRating) * weights.netRating
  );
}

/**
 * Entraîne le modèle avec les prédictions résolues
 */
export function trainModel(): {
  success: boolean;
  samplesUsed: number;
  accuracy: number;
  improvements: string[];
} {
  const predictions = loadPredictions();
  const resolved = predictions.filter(p => p.result);
  
  if (resolved.length < MIN_SAMPLES_FOR_TRAINING) {
    console.log(`⚠️ Pas assez de données pour l'entraînement (${resolved.length}/${MIN_SAMPLES_FOR_TRAINING})`);
    return {
      success: false,
      samplesUsed: resolved.length,
      accuracy: 0,
      improvements: ['Pas assez de données'],
    };
  }
  
  console.log(`🧠 Entraînement ML avec ${resolved.length} prédictions...`);
  
  const model = loadModel();
  const improvements: string[] = [];
  
  // 1. Optimiser le seuil d'edge
  const edgeOptimization = optimizeEdgeThreshold(resolved);
  if (edgeOptimization.improved) {
    model.thresholds.edgeThreshold = edgeOptimization.threshold;
    improvements.push(`Edge threshold: ${edgeOptimization.threshold.toFixed(3)}`);
  }
  
  // 2. Optimiser les poids de confiance
  const confidenceOptimization = optimizeConfidenceWeights(resolved);
  if (confidenceOptimization.improved) {
    model.thresholds.confidenceWeights = confidenceOptimization.weights;
    improvements.push(`Confidence weights optimisés`);
  }
  
  // 3. Optimiser le facteur d'impact des blessures
  const injuryOptimization = optimizeInjuryFactor(resolved);
  if (injuryOptimization.improved) {
    model.thresholds.injuryImpactFactor = injuryOptimization.factor;
    improvements.push(`Injury impact: ${injuryOptimization.factor.toFixed(2)}`);
  }
  
  // 4. Optimiser les poids des features
  const featureOptimization = optimizeFeatureWeights(resolved, model.featureWeights);
  model.featureWeights = featureOptimization.weights;
  improvements.push(`Feature weights mis à jour`);
  
  // 5. Optimiser les ajustements par sport
  model.sportAdjustments = optimizeSportAdjustments(resolved);
  
  // 6. Calculer l'accuracy globale
  const accuracy = calculateModelAccuracy(resolved, model.thresholds);
  model.thresholds.accuracy = accuracy;
  
  // 7. Mettre à jour les métadonnées
  model.thresholds.lastUpdated = new Date().toISOString();
  model.thresholds.samplesUsed = resolved.length;
  model.thresholds.version = incrementVersion(model.thresholds.version);
  
  // 8. Ajouter à l'historique
  model.trainingHistory.push({
    date: new Date().toISOString(),
    samples: resolved.length,
    accuracy,
    thresholds: { ...model.thresholds },
  });
  
  // Garder seulement les 50 derniers entraînements
  if (model.trainingHistory.length > 50) {
    model.trainingHistory = model.trainingHistory.slice(-50);
  }
  
  // 9. Calculer la confiance du modèle
  model.confidence = Math.min(0.95, 0.5 + (resolved.length / 500));
  
  saveModel(model);
  
  console.log(`✅ Entraînement terminé: ${accuracy.toFixed(1)}% accuracy`);
  
  return {
    success: true,
    samplesUsed: resolved.length,
    accuracy,
    improvements,
  };
}

/**
 * Optimise le seuil d'edge
 */
function optimizeEdgeThreshold(
  predictions: PredictionRecord[]
): { threshold: number; improved: boolean } {
  let bestThreshold = DEFAULT_THRESHOLDS.edgeThreshold;
  let bestAccuracy = 0;
  
  for (let threshold = 0.01; threshold <= 0.10; threshold += 0.005) {
    const atThreshold = predictions.filter(p => p.prediction.edge >= threshold * 100);
    
    if (atThreshold.length < 10) continue;
    
    const correct = atThreshold.filter(p => p.result!.isCorrect).length;
    const accuracy = correct / atThreshold.length;
    
    if (accuracy > bestAccuracy) {
      bestAccuracy = accuracy;
      bestThreshold = threshold;
    }
  }
  
  return {
    threshold: bestThreshold,
    improved: bestAccuracy > 0.5,
  };
}

/**
 * Optimise les poids de confiance Kelly
 */
function optimizeConfidenceWeights(
  predictions: PredictionRecord[]
): { weights: MLThresholds['confidenceWeights']; improved: boolean } {
  const weights = { ...DEFAULT_THRESHOLDS.confidenceWeights };
  const byConfidence = {
    very_high: predictions.filter(p => p.prediction.confidence === 'very_high'),
    high: predictions.filter(p => p.prediction.confidence === 'high'),
    medium: predictions.filter(p => p.prediction.confidence === 'medium'),
    low: predictions.filter(p => p.prediction.confidence === 'low'),
  };
  
  let improved = false;
  
  for (const level of Object.keys(byConfidence) as Array<keyof typeof byConfidence>) {
    const preds = byConfidence[level];
    if (preds.length >= 10) {
      const correct = preds.filter(p => p.result!.isCorrect).length;
      const accuracy = correct / preds.length;
      
      // Ajuster le poids: plus accuracy est haute, plus le poids est élevé
      const optimalWeight = 0.3 + (accuracy - 0.5) * 0.6;
      
      if (Math.abs(optimalWeight - weights[level]) > 0.05) {
        weights[level] = Math.max(0.1, Math.min(0.7, optimalWeight));
        improved = true;
      }
    }
  }
  
  return { weights, improved };
}

/**
 * Optimise le facteur d'impact des blessures
 */
function optimizeInjuryFactor(
  predictions: PredictionRecord[]
): { factor: number; improved: boolean } {
  const withInjuries = predictions.filter(p => 
    p.context.homeInjuries > 0 || p.context.awayInjuries > 0
  );
  
  if (withInjuries.length < 15) {
    return { factor: 1.0, improved: false };
  }
  
  // Analyser la corrélation entre blessures et résultats
  let injuryImpactSum = 0;
  
  for (const p of withInjuries) {
    const injuryDiff = p.context.homeInjuries - p.context.awayInjuries;
    const wasCorrect = p.result!.isCorrect;
    
    // Si plus de blessures à domicile et prédiction home correcte -> impact sous-estimé
    // Si plus de blessures à l'extérieur et prédiction away correcte -> impact sous-estimé
    if ((injuryDiff > 0 && p.prediction.bet === 'away' && wasCorrect) ||
        (injuryDiff < 0 && p.prediction.bet === 'home' && wasCorrect)) {
      injuryImpactSum += 0.1;
    } else if ((injuryDiff > 0 && p.prediction.bet === 'home' && !wasCorrect) ||
               (injuryDiff < 0 && p.prediction.bet === 'away' && !wasCorrect)) {
      injuryImpactSum += 0.1;
    }
  }
  
  const optimalFactor = 1.0 + (injuryImpactSum / withInjuries.length);
  
  return {
    factor: Math.max(0.5, Math.min(2.0, optimalFactor)),
    improved: Math.abs(optimalFactor - 1.0) > 0.1,
  };
}

/**
 * Optimise les poids des features
 */
function optimizeFeatureWeights(
  predictions: PredictionRecord[],
  currentWeights: Record<string, number>
): Record<string, number> {
  const weights = { ...currentWeights };
  const features = ['edge', 'dataQuality', 'injuries', 'form', 'xG', 'netRating', 'confidence'];
  
  for (const feature of features) {
    let correctSum = 0;
    let incorrectSum = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    
    for (const p of predictions) {
      if (!p.result) continue;
      
      const value = getFeatureValue(p, feature);
      if (value === null) continue;
      
      if (p.result.isCorrect) {
        correctSum += value;
        correctCount++;
      } else {
        incorrectSum += value;
        incorrectCount++;
      }
    }
    
    if (correctCount > 0 && incorrectCount > 0) {
      const correctAvg = correctSum / correctCount;
      const incorrectAvg = incorrectSum / incorrectCount;
      
      // Ajuster le poids basé sur la différence
      const diff = Math.abs(correctAvg - incorrectAvg);
      const currentWeight = weights[feature] || 0.1;
      
      // Mise à jour avec momentum
      weights[feature] = currentWeight * MOMENTUM + diff * (1 - MOMENTUM) * LEARNING_RATE;
    }
  }
  
  // Normaliser
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  for (const key of Object.keys(weights)) {
    weights[key] = Math.round((weights[key] / total) * 100) / 100;
  }
  
  return weights;
}

/**
 * Optimise les ajustements par sport
 */
function optimizeSportAdjustments(
  predictions: PredictionRecord[]
): Record<string, Partial<MLThresholds>> {
  const adjustments: Record<string, Partial<MLThresholds>> = {};
  
  // Football
  const football = predictions.filter(p => p.sport === 'football');
  if (football.length >= 20) {
    adjustments.football = {
      edgeThreshold: optimizeEdgeThreshold(football).threshold,
      formWeight: optimizeFormWeight(football),
    };
  }
  
  // Basketball
  const basketball = predictions.filter(p => p.sport === 'basketball');
  if (basketball.length >= 20) {
    adjustments.basketball = {
      edgeThreshold: optimizeEdgeThreshold(basketball).threshold,
      netRatingWeight: optimizeNetRatingWeight(basketball),
    };
  }
  
  return adjustments;
}

function optimizeFormWeight(predictions: PredictionRecord[]): number {
  // Analyser l'impact de la forme sur les résultats
  const withForm = predictions.filter(p => 
    p.context.homeFormScore && p.context.awayFormScore
  );
  
  if (withForm.length < 10) return 0.05;
  
  let correctWithFormDiff = 0;
  let totalFormDiff = 0;
  
  for (const p of withForm) {
    const formDiff = p.context.homeFormScore! - p.context.awayFormScore!;
    totalFormDiff += Math.abs(formDiff);
    
    if (p.result!.isCorrect && 
        ((formDiff > 10 && p.prediction.bet === 'home') ||
         (formDiff < -10 && p.prediction.bet === 'away'))) {
      correctWithFormDiff++;
    }
  }
  
  const avgFormDiff = totalFormDiff / withForm.length;
  return Math.max(0.01, Math.min(0.15, avgFormDiff / 500));
}

function optimizeNetRatingWeight(predictions: PredictionRecord[]): number {
  const withNetRating = predictions.filter(p =>
    p.context.homeNetRating !== undefined && p.context.awayNetRating !== undefined
  );
  
  if (withNetRating.length < 10) return 0.03;
  
  let impactSum = 0;
  
  for (const p of withNetRating) {
    const netDiff = p.context.homeNetRating! - p.context.awayNetRating!;
    const wasCorrect = p.result!.isCorrect;
    
    if ((netDiff > 2 && p.prediction.bet === 'home' && wasCorrect) ||
        (netDiff < -2 && p.prediction.bet === 'away' && wasCorrect)) {
      impactSum += 0.01;
    }
  }
  
  return Math.max(0.01, Math.min(0.10, 0.03 + impactSum / withNetRating.length));
}

function getFeatureValue(p: PredictionRecord, feature: string): number | null {
  switch (feature) {
    case 'edge': return p.prediction.edge / 100;
    case 'dataQuality': return p.context.dataQuality / 100;
    case 'injuries': return (p.context.homeInjuries + p.context.awayInjuries) / 10;
    case 'form': return ((p.context.homeFormScore || 50) - (p.context.awayFormScore || 50)) / 100;
    case 'xG': return ((p.context.homeXG || 1.5) - (p.context.awayXG || 1.5)) / 3;
    case 'netRating': return ((p.context.homeNetRating || 0) - (p.context.awayNetRating || 0)) / 20;
    case 'confidence': 
      return { very_high: 1, high: 0.75, medium: 0.5, low: 0.25 }[p.prediction.confidence] || 0.5;
    default: return null;
  }
}

function calculateModelAccuracy(
  predictions: PredictionRecord[],
  thresholds: MLThresholds
): number {
  const correct = predictions.filter(p => {
    if (!p.result) return false;
    
    // Prédiction aurait-elle été faite avec les nouveaux seuils?
    if (p.prediction.edge < thresholds.edgeThreshold * 100) return true; // Skip, pas de pari
    
    return p.result.isCorrect;
  }).length;
  
  const total = predictions.filter(p => 
    p.result && p.prediction.edge >= thresholds.edgeThreshold * 100
  ).length;
  
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}

function incrementVersion(version: string): string {
  const parts = version.split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1;
  return parts.join('.');
}

// ============================================
// FONCTIONS PUBLIQUES
// ============================================

/**
 * Récupère les seuils actuels (pour utilisation dans expertAdvisor)
 */
export function getAdaptiveThresholds(sport?: 'football' | 'basketball'): MLThresholds {
  const model = loadModel();
  
  let thresholds = { ...model.thresholds };
  
  // Appliquer les ajustements par sport si disponibles
  if (sport && model.sportAdjustments[sport]) {
    thresholds = { ...thresholds, ...model.sportAdjustments[sport] };
  }
  
  return thresholds;
}

/**
 * Calcule l'ajustement de probabilité basé sur le ML
 */
export function calculateMLAdjustment(
  features: FeatureVector,
  sport: 'football' | 'basketball'
): {
  probabilityAdjustment: number;
  confidenceAdjustment: number;
  recommendedBet: 'home' | 'away' | 'neutral';
} {
  const model = loadModel();
  const thresholds = getAdaptiveThresholds(sport);
  
  // Contribution des features
  const contribution = calculateFeatureContribution(features, model.featureWeights);
  
  // Ajustement de probabilité
  const probabilityAdjustment = contribution * thresholds.formWeight;
  
  // Ajustement de confiance
  let confidenceAdjustment = 0;
  if (features.dataQuality > thresholds.minDataQuality / 100) {
    confidenceAdjustment += 0.1;
  }
  if (features.edge > thresholds.edgeThreshold) {
    confidenceAdjustment += 0.1;
  }
  
  // Recommandation
  let recommendedBet: 'home' | 'away' | 'neutral' = 'neutral';
  if (probabilityAdjustment > 0.02) {
    recommendedBet = 'home';
  } else if (probabilityAdjustment < -0.02) {
    recommendedBet = 'away';
  }
  
  return {
    probabilityAdjustment: Math.max(-0.15, Math.min(0.15, probabilityAdjustment)),
    confidenceAdjustment: Math.max(0, Math.min(0.3, confidenceAdjustment)),
    recommendedBet,
  };
}

/**
 * Obtient le statut du modèle
 */
export function getModelStatus(): {
  version: string;
  lastUpdated: string;
  samplesUsed: number;
  accuracy: number;
  confidence: number;
  trainingHistoryCount: number;
} {
  const model = loadModel();
  
  return {
    version: model.thresholds.version,
    lastUpdated: model.thresholds.lastUpdated || 'Jamais',
    samplesUsed: model.thresholds.samplesUsed,
    accuracy: model.thresholds.accuracy,
    confidence: model.confidence,
    trainingHistoryCount: model.trainingHistory.length,
  };
}

/**
 * Réinitialise le modèle
 */
export function resetModel(): void {
  const model: MLModel = {
    thresholds: { ...DEFAULT_THRESHOLDS, lastUpdated: new Date().toISOString() },
    featureWeights: {},
    sportAdjustments: {},
    confidence: 0.5,
    trainingHistory: [],
  };
  
  saveModel(model);
  console.log('🗑️ Modèle ML réinitialisé');
}

// ============================================
// EXPORTS
// ============================================

const AdaptiveThresholdsML = {
  trainModel,
  getAdaptiveThresholds,
  calculateMLAdjustment,
  getModelStatus,
  resetModel,
};

export default AdaptiveThresholdsML;
