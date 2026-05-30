/**
 * Tennis Validation System - Mesure et amélioration du ratio de réussite
 * 
 * Fonctionnalités:
 * 1. Backtesting sur données historiques
 * 2. Tracking des prédictions en temps réel
 * 3. Calibration du modèle
 * 4. Rapports de performance par catégorie
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// INTERFACES
// ============================================

export interface PredictionRecord {
  id: string;
  matchId: string;
  player1: string;
  player2: string;
  tournament: string;
  tournamentTier: string;
  predictedWinner: 'player1' | 'player2';
  actualWinner: 'player1' | 'player2' | null;
  winProbability: number;
  confidence: string;
  riskPercentage: number;
  odds1: number;
  odds2: number;
  recommendedBet: boolean;
  generatedAt: string;
  resultVerifiedAt: string | null;
  isCorrect: boolean | null;
}

export interface PerformanceMetrics {
  totalPredictions: number;
  verifiedPredictions: number;
  correctPredictions: number;
  accuracy: number;
  
  byConfidence: {
    very_high: { total: number; correct: number; accuracy: number };
    high: { total: number; correct: number; accuracy: number };
    medium: { total: number; correct: number; accuracy: number };
    low: { total: number; correct: number; accuracy: number };
  };
  
  byTier: Record<string, { total: number; correct: number; accuracy: number }>;
  
  byCategory: {
    atp: { total: number; correct: number; accuracy: number };
    wta: { total: number; correct: number; accuracy: number };
    challenger: { total: number; correct: number; accuracy: number };
    itf: { total: number; correct: number; accuracy: number };
  };
  
  bettingROI: number;
  averageOdds: number;
  profitLoss: number;
  
  calibration: {
    predictedRange: string;
    actualWinRate: number;
    count: number;
  }[];
  
  lastUpdated: string;
}

// ============================================
// STOCKAGE
// ============================================

const DATA_DIR = path.join(process.cwd(), 'data');
const PREDICTIONS_FILE = path.join(DATA_DIR, 'tennis-predictions-history.json');
const METRICS_FILE = path.join(DATA_DIR, 'tennis-performance-metrics.json');

// ============================================
// FONCTIONS DE GESTION
// ============================================

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function savePrediction(prediction: Omit<PredictionRecord, 'id' | 'actualWinner' | 'resultVerifiedAt' | 'isCorrect'>): string {
  ensureDataDir();
  
  const records: PredictionRecord[] = fs.existsSync(PREDICTIONS_FILE) 
    ? JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf-8'))
    : [];
  
  const id = `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  records.push({
    ...prediction,
    id,
    actualWinner: null,
    resultVerifiedAt: null,
    isCorrect: null,
  });
  
  fs.writeFileSync(PREDICTIONS_FILE, JSON.stringify(records, null, 2));
  
  return id;
}

export function updatePredictionResult(
  predictionId: string,
  actualWinner: 'player1' | 'player2'
): boolean {
  ensureDataDir();
  
  if (!fs.existsSync(PREDICTIONS_FILE)) return false;
  
  const records: PredictionRecord[] = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf-8'));
  const record = records.find(r => r.id === predictionId);
  
  if (!record) return false;
  
  record.actualWinner = actualWinner;
  record.isCorrect = record.predictedWinner === actualWinner;
  record.resultVerifiedAt = new Date().toISOString();
  
  fs.writeFileSync(PREDICTIONS_FILE, JSON.stringify(records, null, 2));
  
  // Recalculer les métriques
  calculateAndSaveMetrics();
  
  return true;
}

// ============================================
// CALCUL DES MÉTRIQUES
// ============================================

export function calculateAndSaveMetrics(): PerformanceMetrics {
  ensureDataDir();
  
  const records: PredictionRecord[] = fs.existsSync(PREDICTIONS_FILE)
    ? JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf-8'))
    : [];
  
  const verified = records.filter(r => r.isCorrect !== null);
  const correct = verified.filter(r => r.isCorrect);
  
  // Par confiance
  const byConfidence = {
    very_high: calculateGroupMetrics(verified, 'very_high'),
    high: calculateGroupMetrics(verified, 'high'),
    medium: calculateGroupMetrics(verified, 'medium'),
    low: calculateGroupMetrics(verified, 'low'),
  };
  
  // Par tier
  const byTier: Record<string, { total: number; correct: number; accuracy: number }> = {};
  for (const record of verified) {
    const tier = record.tournamentTier || 'unknown';
    if (!byTier[tier]) {
      byTier[tier] = { total: 0, correct: 0, accuracy: 0 };
    }
    byTier[tier].total++;
    if (record.isCorrect) byTier[tier].correct++;
  }
  for (const tier of Object.keys(byTier)) {
    byTier[tier].accuracy = byTier[tier].total > 0 
      ? (byTier[tier].correct / byTier[tier].total) * 100 
      : 0;
  }
  
  // Par catégorie
  const byCategory = {
    atp: calculateCategoryMetrics(verified, 'atp'),
    wta: calculateCategoryMetrics(verified, 'wta'),
    challenger: calculateCategoryMetrics(verified, 'challenger'),
    itf: calculateCategoryMetrics(verified, 'itf'),
  };
  
  // ROI betting
  let totalStake = 0;
  let totalReturn = 0;
  for (const record of verified.filter(r => r.recommendedBet)) {
    const stake = 10; // Mise fictive de 10€
    totalStake += stake;
    if (record.isCorrect) {
      const odds = record.predictedWinner === 'player1' ? record.odds1 : record.odds2;
      totalReturn += stake * odds;
    }
  }
  
  const bettingROI = totalStake > 0 ? ((totalReturn - totalStake) / totalStake) * 100 : 0;
  const averageOdds = verified.length > 0
    ? verified.reduce((sum, r) => sum + (r.predictedWinner === 'player1' ? r.odds1 : r.odds2), 0) / verified.length
    : 0;
  
  // Calibration
  const calibration = calculateCalibration(verified);
  
  const metrics: PerformanceMetrics = {
    totalPredictions: records.length,
    verifiedPredictions: verified.length,
    correctPredictions: correct.length,
    accuracy: verified.length > 0 ? (correct.length / verified.length) * 100 : 0,
    byConfidence,
    byTier,
    byCategory,
    bettingROI,
    averageOdds,
    profitLoss: totalReturn - totalStake,
    calibration,
    lastUpdated: new Date().toISOString(),
  };
  
  fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
  
  return metrics;
}

function calculateGroupMetrics(
  records: PredictionRecord[],
  confidence: string
): { total: number; correct: number; accuracy: number } {
  const filtered = records.filter(r => r.confidence === confidence);
  const correct = filtered.filter(r => r.isCorrect);
  
  return {
    total: filtered.length,
    correct: correct.length,
    accuracy: filtered.length > 0 ? (correct.length / filtered.length) * 100 : 0,
  };
}

function calculateCategoryMetrics(
  records: PredictionRecord[],
  category: string
): { total: number; correct: number; accuracy: number } {
  // Extraire la catégorie du matchId (format: source_category_matchId)
  const filtered = records.filter(r => r.matchId.includes(category) || r.matchId.includes(category.charAt(0).toUpperCase()));
  const correct = filtered.filter(r => r.isCorrect);
  
  return {
    total: filtered.length,
    correct: correct.length,
    accuracy: filtered.length > 0 ? (correct.length / filtered.length) * 100 : 0,
  };
}

function calculateCalibration(records: PredictionRecord[]): PerformanceMetrics['calibration'] {
  const ranges = [
    { min: 50, max: 55, label: '50-55%' },
    { min: 55, max: 60, label: '55-60%' },
    { min: 60, max: 65, label: '60-65%' },
    { min: 65, max: 70, label: '65-70%' },
    { min: 70, max: 75, label: '70-75%' },
    { min: 75, max: 80, label: '75-80%' },
    { min: 80, max: 100, label: '80%+' },
  ];
  
  return ranges.map(range => {
    const filtered = records.filter(r => 
      r.winProbability >= range.min && r.winProbability < range.max
    );
    const correct = filtered.filter(r => r.isCorrect);
    
    return {
      predictedRange: range.label,
      actualWinRate: filtered.length > 0 ? (correct.length / filtered.length) * 100 : 0,
      count: filtered.length,
    };
  });
}

// ============================================
// CHARGEMENT MÉTRIQUES
// ============================================

export function loadMetrics(): PerformanceMetrics | null {
  ensureDataDir();
  
  if (!fs.existsSync(METRICS_FILE)) return null;
  
  return JSON.parse(fs.readFileSync(METRICS_FILE, 'utf-8'));
}

export function loadPredictions(limit: number = 100): PredictionRecord[] {
  ensureDataDir();
  
  if (!fs.existsSync(PREDICTIONS_FILE)) return [];
  
  const records: PredictionRecord[] = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf-8'));
  return records.slice(-limit);
}

// ============================================
// BACKTESTING
// ============================================

export interface BacktestResult {
  accuracy: number;
  totalMatches: number;
  roi: number;
  byConfidence: Record<string, number>;
  insights: string[];
}

export function backtestHistoricalMatches(
  historicalMatches: Array<{
    player1: string;
    player2: string;
    winner: string;
    odds1: number;
    odds2: number;
    tournament: string;
    surface: string;
  }>
): BacktestResult {
  // Simulation de backtesting
  // En production, utiliser les vraies prédictions
  
  const results: BacktestResult = {
    accuracy: 0,
    totalMatches: historicalMatches.length,
    roi: 0,
    byConfidence: { very_high: 0, high: 0, medium: 0, low: 0 },
    insights: [],
  };
  
  let correct = 0;
  let totalStake = 0;
  let totalReturn = 0;
  
  for (const match of historicalMatches) {
    // Prédiction simple basée sur les cotes (à remplacer par le vrai modèle)
    const impliedP1 = 1 / match.odds1;
    const predictedWinner = impliedP1 > 0.5 ? 'player1' : 'player2';
    
    const isCorrect = predictedWinner === match.winner;
    if (isCorrect) correct++;
    
    // Simuler un pari si cote favorable
    const odds = predictedWinner === 'player1' ? match.odds1 : match.odds2;
    if (odds > 1.5 && odds < 3.0) {
      totalStake += 10;
      if (isCorrect) totalReturn += 10 * odds;
    }
  }
  
  results.accuracy = (correct / historicalMatches.length) * 100;
  results.roi = totalStake > 0 ? ((totalReturn - totalStake) / totalStake) * 100 : 0;
  
  // Insights
  if (results.accuracy > 65) {
    results.insights.push('✅ Bon taux de réussite global');
  } else {
    results.insights.push('⚠️ Taux de réussite à améliorer');
  }
  
  if (results.roi > 10) {
    results.insights.push('✅ ROI positif sur les paris simulés');
  } else if (results.roi < 0) {
    results.insights.push('❌ ROI négatif - revoir la stratégie de paris');
  }
  
  return results;
}
