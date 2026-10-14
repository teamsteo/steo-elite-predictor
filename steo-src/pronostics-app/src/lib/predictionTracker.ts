/**
 * Prediction Tracker - Système de Suivi des Prédictions
 * 
 * FONCTIONS:
 * - Enregistrer chaque prédiction avec métadonnées complètes
 * - Tracker les résultats après les matchs
 * - Calculer les métriques de performance
 * - Fournir des données pour l'apprentissage ML
 * 
 * PERSISTANCE: 
 * - GitHub JSON (fonctionne sur Vercel)
 * - Fallback mémoire si GitHub indisponible
 */

// ============================================
// TYPES
// ============================================

export interface PredictionRecord {
  // Identifiant unique
  id: string;
  
  // Match
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  sport: 'football' | 'basketball';
  league: string;
  matchDate: string;
  
  // Prédiction
  prediction: {
    bet: 'home' | 'draw' | 'away' | 'avoid';
    confidence: 'very_high' | 'high' | 'medium' | 'low';
    kellyStake: number;
    expectedValue: number;
    edge: number;
    reasoning: string[];
  };
  
  // Cotes au moment de la prédiction
  odds: {
    home: number;
    draw: number | null;
    away: number;
  };
  
  // Contexte au moment de la prédiction
  context: {
    dataQuality: number;
    sourcesUsed: string[];
    homeInjuries: number;
    awayInjuries: number;
    homeFormScore?: number;
    awayFormScore?: number;
    homeXG?: number;
    awayXG?: number;
    homeNetRating?: number;
    awayNetRating?: number;
  };
  
  // Seuils utilisés (pour ML)
  thresholds: {
    edgeThreshold: number;
    confidenceWeights: Record<string, number>;
    injuryImpactFactor: number;
    formWeight: number;
  };
  
  // Métadonnées
  generatedAt: string;
  modelVersion: string;
  
  // Résultat (rempli après le match)
  result?: {
    homeScore: number;
    awayScore: number;
    outcome: 'home' | 'draw' | 'away';
    isCorrect: boolean;
    profit: number; // + ou - en unités
    resolvedAt: string;
  };
}

export interface PredictionStats {
  total: number;
  resolved: number;
  pending: number;
  
  // Performance globale
  correctPredictions: number;
  incorrectPredictions: number;
  accuracy: number; // %
  
  // ROI
  totalStake: number;
  totalReturn: number;
  roi: number; // %
  
  // Par confiance
  byConfidence: {
    very_high: { total: number; correct: number; accuracy: number; roi: number };
    high: { total: number; correct: number; accuracy: number; roi: number };
    medium: { total: number; correct: number; accuracy: number; roi: number };
    low: { total: number; correct: number; accuracy: number; roi: number };
  };
  
  // Par sport
  bySport: {
    football: { total: number; correct: number; accuracy: number; roi: number };
    basketball: { total: number; correct: number; accuracy: number; roi: number };
  };
  
  // Par type de pari
  byBetType: {
    home: { total: number; correct: number; accuracy: number };
    draw: { total: number; correct: number; accuracy: number };
    away: { total: number; correct: number; accuracy: number };
  };
  
  // Value bets uniquement
  valueBets: {
    total: number;
    correct: number;
    accuracy: number;
    roi: number;
  };
  
  // Tendance récente (30 derniers jours)
  recentTrend: {
    last30Days: number;
    correctLast30: number;
    accuracyLast30: number;
    roiLast30: number;
  };
  
  // Pour ML
  featureImportance: Record<string, number>;
  optimalThresholds: {
    edgeThreshold: number;
    injuryImpactFactor: number;
    formWeight: number;
  };
}

export interface PredictionData {
  predictions: PredictionRecord[];
  stats: PredictionStats | null;
  lastUpdated: string | null;
}

// ============================================
// CONFIGURATION
// ============================================

const GITHUB_REPO = 'steohidy/my-project';
const GITHUB_BRANCH = 'master';
const PREDICTIONS_FILE_PATH = 'data/predictions.json';

const MODEL_VERSION = '3.0.0-ml';

// Seuils par défaut (seront ajustés par ML)
const DEFAULT_THRESHOLDS = {
  edgeThreshold: 0.03, // 3%
  confidenceWeights: {
    very_high: 0.5,
    high: 0.4,
    medium: 0.25,
    low: 0.1,
  },
  injuryImpactFactor: 1.0,
  formWeight: 0.05,
};

// Cache en mémoire
let cachedData: PredictionData | null = null;

const DEFAULT_PREDICTION_DATA: PredictionData = {
  predictions: [],
  stats: null,
  lastUpdated: null
};

// ============================================
// FONCTIONS DE PERSISTANCE GITHUB
// ============================================

async function loadFromGitHub(): Promise<PredictionData> {
  if (cachedData) return cachedData;

  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${PREDICTIONS_FILE_PATH}`,
      { next: { revalidate: 30 } }
    );
    if (res.ok) {
      cachedData = await res.json();
      console.log('📊 Prédictions chargées depuis GitHub');
      return cachedData!;
    }
  } catch (e) {
    console.error('Erreur chargement prédictions:', e);
  }
  return DEFAULT_PREDICTION_DATA;
}

async function saveToGitHub(data: PredictionData): Promise<boolean> {
  cachedData = data;
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    console.warn('⚠️ GITHUB_TOKEN non configuré - prédictions en mémoire uniquement');
    return true; // Succès en mémoire, pas d'erreur
  }

  try {
    // Récupérer le SHA du fichier existant
    const getRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${PREDICTIONS_FILE_PATH}`,
      { 
        headers: { 
          Authorization: `token ${token}`, 
          Accept: 'application/vnd.github.v3+json' 
        } 
      }
    );
    
    let sha = '';
    if (getRes.ok) {
      const fileInfo = await getRes.json();
      sha = fileInfo.sha;
    }

    // Sauvegarder
    const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    const saveRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${PREDICTIONS_FILE_PATH}`,
      {
        method: 'PUT',
        headers: { 
          Authorization: `token ${token}`, 
          Accept: 'application/vnd.github.v3+json', 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          message: `📊 MAJ prédictions ${new Date().toLocaleString('fr-FR')}`,
          content,
          sha: sha || undefined,
          branch: GITHUB_BRANCH
        })
      }
    );
    
    if (saveRes.ok) {
      console.log('📊 Prédictions sauvegardées sur GitHub');
      return true;
    } else {
      console.error('Erreur sauvegarde GitHub:', await saveRes.text());
      return false;
    }
  } catch (e) {
    console.error('Erreur sauvegarde prédictions:', e);
    return false;
  }
}

// ============================================
// FONCTIONS PRINCIPALES (ASYNC)
// ============================================

/**
 * Enregistre une nouvelle prédiction (async pour GitHub)
 */
export async function recordPrediction(params: {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  sport: 'football' | 'basketball';
  league: string;
  matchDate: string;
  prediction: PredictionRecord['prediction'];
  odds: PredictionRecord['odds'];
  context: PredictionRecord['context'];
  thresholds?: Partial<PredictionRecord['thresholds']>;
}): Promise<string> {
  const data = await loadFromGitHub();
  
  const id = `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const record: PredictionRecord = {
    id,
    matchId: params.matchId,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    sport: params.sport,
    league: params.league,
    matchDate: params.matchDate,
    prediction: params.prediction,
    odds: params.odds,
    context: params.context,
    thresholds: {
      ...DEFAULT_THRESHOLDS,
      ...params.thresholds,
    },
    generatedAt: new Date().toISOString(),
    modelVersion: MODEL_VERSION,
  };
  
  data.predictions.push(record);
  data.lastUpdated = new Date().toISOString();
  
  // Garder seulement les 500 dernières prédictions
  if (data.predictions.length > 500) {
    data.predictions = data.predictions.slice(-500);
  }
  
  await saveToGitHub(data);
  
  console.log(`📝 Prédiction enregistrée: ${params.homeTeam} vs ${params.awayTeam} (${id})`);
  
  return id;
}

/**
 * Met à jour une prédiction avec le résultat
 */
export async function resolvePrediction(
  predictionId: string,
  homeScore: number,
  awayScore: number
): Promise<boolean> {
  const data = await loadFromGitHub();
  const index = data.predictions.findIndex(p => p.id === predictionId);
  
  if (index === -1) {
    console.log(`⚠️ Prédiction non trouvée: ${predictionId}`);
    return false;
  }
  
  const pred = data.predictions[index];
  
  // Déterminer le résultat
  let outcome: 'home' | 'draw' | 'away';
  if (homeScore > awayScore) outcome = 'home';
  else if (awayScore > homeScore) outcome = 'away';
  else outcome = 'draw';
  
  // Vérifier si la prédiction était correcte
  const isCorrect = pred.prediction.bet === outcome;
  
  // Calculer le profit
  let profit = 0;
  if (pred.prediction.bet !== 'avoid') {
    const stake = pred.prediction.kellyStake / 100; // Ex: 2% = 0.02
    if (isCorrect) {
      const odds = pred.prediction.bet === 'home' 
        ? pred.odds.home 
        : pred.odds.away;
      profit = stake * (odds - 1); // Profit net
    } else {
      profit = -stake; // Perte de la mise
    }
  }
  
  // Mettre à jour
  data.predictions[index].result = {
    homeScore,
    awayScore,
    outcome,
    isCorrect,
    profit: Math.round(profit * 1000) / 1000,
    resolvedAt: new Date().toISOString(),
  };
  
  data.lastUpdated = new Date().toISOString();
  await saveToGitHub(data);
  
  // Recalculer les stats
  await calculateStats();
  
  console.log(`✅ Prédiction résolue: ${pred.homeTeam} ${homeScore}-${awayScore} ${pred.awayTeam} (${isCorrect ? '✓ CORRECT' : '✗ INCORRECT'})`);
  
  return true;
}

/**
 * Calcule les statistiques de performance
 */
export async function calculateStats(): Promise<PredictionStats> {
  const data = await loadFromGitHub();
  const predictions = data.predictions;
  const resolved = predictions.filter(p => p.result);
  
  // Stats de base
  const correctPredictions = resolved.filter(p => p.result!.isCorrect).length;
  const incorrectPredictions = resolved.length - correctPredictions;
  
  // ROI
  const totalStake = resolved.reduce((sum, p) => sum + p.prediction.kellyStake / 100, 0);
  const totalReturn = resolved.reduce((sum, p) => {
    if (p.result!.isCorrect) {
      const odds = p.prediction.bet === 'home' ? p.odds.home : p.odds.away;
      return sum + (p.prediction.kellyStake / 100) * odds;
    }
    return sum;
  }, 0);
  
  // Par confiance
  const byConfidence = {
    very_high: calculateGroupStats(resolved, 'confidence', 'very_high'),
    high: calculateGroupStats(resolved, 'confidence', 'high'),
    medium: calculateGroupStats(resolved, 'confidence', 'medium'),
    low: calculateGroupStats(resolved, 'confidence', 'low'),
  };
  
  // Par sport
  const bySport = {
    football: calculateGroupStats(resolved, 'sport', 'football'),
    basketball: calculateGroupStats(resolved, 'sport', 'basketball'),
  };
  
  // Par type de pari
  const byBetType = {
    home: calculateGroupStats(resolved, 'bet', 'home'),
    draw: calculateGroupStats(resolved, 'bet', 'draw'),
    away: calculateGroupStats(resolved, 'bet', 'away'),
  };
  
  // Value bets (edge > 3%)
  const valueBetsArr = resolved.filter(p => p.prediction.edge > 3);
  const valueBetsStats = {
    total: valueBetsArr.length,
    correct: valueBetsArr.filter(p => p.result!.isCorrect).length,
    accuracy: 0,
    roi: 0,
  };
  if (valueBetsStats.total > 0) {
    valueBetsStats.accuracy = Math.round((valueBetsStats.correct / valueBetsStats.total) * 100);
  }
  
  // Tendance récente
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = resolved.filter(p => new Date(p.generatedAt).getTime() > thirtyDaysAgo);
  const recentTrend = {
    last30Days: recent.length,
    correctLast30: recent.filter(p => p.result!.isCorrect).length,
    accuracyLast30: 0,
    roiLast30: 0,
  };
  if (recentTrend.last30Days > 0) {
    recentTrend.accuracyLast30 = Math.round((recentTrend.correctLast30 / recentTrend.last30Days) * 100);
  }
  
  // Feature importance (placeholder pour ML)
  const featureImportance = calculateFeatureImportance(resolved);
  
  // Seuils optimaux (placeholder pour ML)
  const optimalThresholds = calculateOptimalThresholds(resolved);
  
  const stats: PredictionStats = {
    total: predictions.length,
    resolved: resolved.length,
    pending: predictions.length - resolved.length,
    correctPredictions,
    incorrectPredictions,
    accuracy: resolved.length > 0 ? Math.round((correctPredictions / resolved.length) * 100) : 0,
    totalStake: Math.round(totalStake * 100) / 100,
    totalReturn: Math.round(totalReturn * 100) / 100,
    roi: totalStake > 0 ? Math.round(((totalReturn - totalStake) / totalStake) * 100) : 0,
    byConfidence,
    bySport,
    byBetType,
    valueBets: valueBetsStats,
    recentTrend,
    featureImportance,
    optimalThresholds,
  };
  
  data.stats = stats;
  await saveToGitHub(data);
  
  return stats;
}

function calculateGroupStats(
  predictions: PredictionRecord[],
  groupBy: string,
  value: string
): { total: number; correct: number; accuracy: number; roi: number } {
  let filtered: PredictionRecord[];
  
  if (groupBy === 'confidence') {
    filtered = predictions.filter(p => p.prediction.confidence === value);
  } else if (groupBy === 'sport') {
    filtered = predictions.filter(p => p.sport === value);
  } else if (groupBy === 'bet') {
    filtered = predictions.filter(p => p.prediction.bet === value);
  } else {
    filtered = [];
  }
  
  const total = filtered.length;
  const correct = filtered.filter(p => p.result!.isCorrect).length;
  
  let totalStake = 0;
  let totalReturn = 0;
  
  for (const p of filtered) {
    const stake = p.prediction.kellyStake / 100;
    totalStake += stake;
    
    if (p.result!.isCorrect) {
      const odds = p.prediction.bet === 'home' ? p.odds.home : p.odds.away;
      totalReturn += stake * odds;
    }
  }
  
  return {
    total,
    correct,
    accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
    roi: totalStake > 0 ? Math.round(((totalReturn - totalStake) / totalStake) * 100) : 0,
  };
}

/**
 * Calcule l'importance des features (pour ML)
 */
function calculateFeatureImportance(predictions: PredictionRecord[]): Record<string, number> {
  if (predictions.length < 10) {
    return {
      edge: 0.25,
      dataQuality: 0.20,
      injuries: 0.15,
      form: 0.15,
      xG: 0.10,
      netRating: 0.10,
      confidence: 0.05,
    };
  }
  
  // Analyse simple de corrélation
  const features = ['edge', 'dataQuality', 'injuries', 'form', 'xG', 'netRating', 'confidence'];
  const importance: Record<string, number> = {};
  
  for (const feature of features) {
    let correctSum = 0;
    let incorrectSum = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    
    for (const p of predictions) {
      const value = getFeatureValue(p, feature);
      if (value === null) continue;
      
      if (p.result!.isCorrect) {
        correctSum += value;
        correctCount++;
      } else {
        incorrectSum += value;
        incorrectCount++;
      }
    }
    
    const correctAvg = correctCount > 0 ? correctSum / correctCount : 0;
    const incorrectAvg = incorrectCount > 0 ? incorrectSum / incorrectCount : 0;
    
    // Plus la différence est grande, plus la feature est importante
    importance[feature] = Math.abs(correctAvg - incorrectAvg);
  }
  
  // Normaliser
  const total = Object.values(importance).reduce((a, b) => a + b, 0);
  for (const key of Object.keys(importance)) {
    importance[key] = Math.round((importance[key] / total) * 100) / 100;
  }
  
  return importance;
}

function getFeatureValue(p: PredictionRecord, feature: string): number | null {
  switch (feature) {
    case 'edge': return p.prediction.edge;
    case 'dataQuality': return p.context.dataQuality;
    case 'injuries': return p.context.homeInjuries + p.context.awayInjuries;
    case 'form': return (p.context.homeFormScore || 0) - (p.context.awayFormScore || 0);
    case 'xG': return (p.context.homeXG || 0) - (p.context.awayXG || 0);
    case 'netRating': return (p.context.homeNetRating || 0) - (p.context.awayNetRating || 0);
    case 'confidence': 
      const weights = { very_high: 4, high: 3, medium: 2, low: 1 };
      return weights[p.prediction.confidence] || 0;
    default: return null;
  }
}

/**
 * Calcule les seuils optimaux (pour ML)
 */
function calculateOptimalThresholds(predictions: PredictionRecord[]): PredictionStats['optimalThresholds'] {
  if (predictions.length < 20) {
    return {
      edgeThreshold: 0.03,
      injuryImpactFactor: 1.0,
      formWeight: 0.05,
    };
  }
  
  // Trouver le seuil d'edge optimal
  let bestEdgeThreshold = 0.03;
  let bestEdgeAccuracy = 0;
  
  for (let threshold = 0.01; threshold <= 0.10; threshold += 0.01) {
    const atThreshold = predictions.filter(p => p.prediction.edge >= threshold * 100);
    if (atThreshold.length >= 5) {
      const accuracy = atThreshold.filter(p => p.result!.isCorrect).length / atThreshold.length;
      if (accuracy > bestEdgeAccuracy) {
        bestEdgeAccuracy = accuracy;
        bestEdgeThreshold = threshold;
      }
    }
  }
  
  // Facteur d'impact des blessures
  const withInjuries = predictions.filter(p => p.context.homeInjuries > 0 || p.context.awayInjuries > 0);
  let injuryImpactFactor = 1.0;
  
  if (withInjuries.length >= 10) {
    const injuryCorrect = withInjuries.filter(p => p.result!.isCorrect).length;
    const noInjury = predictions.filter(p => p.context.homeInjuries === 0 && p.context.awayInjuries === 0);
    const noInjuryCorrect = noInjury.filter(p => p.result!.isCorrect).length;
    
    if (noInjury.length > 0 && withInjuries.length > 0) {
      const ratio = (injuryCorrect / withInjuries.length) / (noInjuryCorrect / noInjury.length);
      injuryImpactFactor = Math.round(ratio * 10) / 10;
    }
  }
  
  return {
    edgeThreshold: Math.round(bestEdgeThreshold * 100) / 100,
    injuryImpactFactor,
    formWeight: 0.05,
  };
}

/**
 * Récupère les statistiques actuelles
 */
export async function getStats(): Promise<PredictionStats | null> {
  const data = await loadFromGitHub();
  return data.stats;
}

/**
 * Récupère les prédictions récentes
 */
export async function getRecentPredictions(limit: number = 20): Promise<PredictionRecord[]> {
  const data = await loadFromGitHub();
  return data.predictions.slice(-limit);
}

/**
 * Récupère les seuils actuels (pour utilisation dans expertAdvisor)
 */
export async function getCurrentThresholds(): Promise<PredictionRecord['thresholds']> {
  const data = await loadFromGitHub();
  
  if (data.stats && data.stats.optimalThresholds) {
    return {
      edgeThreshold: data.stats.optimalThresholds.edgeThreshold,
      confidenceWeights: DEFAULT_THRESHOLDS.confidenceWeights,
      injuryImpactFactor: data.stats.optimalThresholds.injuryImpactFactor,
      formWeight: data.stats.optimalThresholds.formWeight,
    };
  }
  
  return DEFAULT_THRESHOLDS;
}

/**
 * Exporte les données pour analyse externe
 */
export async function exportForML(): Promise<{ 
  predictions: PredictionRecord[]; 
  stats: PredictionStats | null;
}> {
  const data = await loadFromGitHub();
  return {
    predictions: data.predictions,
    stats: data.stats,
  };
}

/**
 * Charge les prédictions (pour compatibilité)
 */
export function loadPredictions(): PredictionRecord[] {
  // Synchrone - retourne le cache ou vide
  return cachedData?.predictions || [];
}

// ============================================
// EXPORTS
// ============================================

const PredictionTracker = {
  recordPrediction,
  resolvePrediction,
  calculateStats,
  getStats,
  getRecentPredictions,
  getCurrentThresholds,
  exportForML,
  loadPredictions,
};

export default PredictionTracker;
