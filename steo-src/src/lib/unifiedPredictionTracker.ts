/**
 * Unified Prediction Tracker - Système unifié de suivi des prédictions
 * 
 * VERSION 2.0 - GitHub désactivé par défaut
 * 
 * Ce module utilise Supabase comme source principale.
 * Les données ML sont stockées dans Supabase.
 */

import { PredictionStore } from './store';
import { isGitHubEnabled, GITHUB_CONFIG } from './github-config';

// Types
export interface UnifiedPrediction {
  id: string;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  sport: 'football' | 'basketball' | 'hockey' | 'tennis' | 'other';
  league: string;
  matchDate: string;
  
  // Prédiction
  prediction: {
    bet: 'home' | 'draw' | 'away' | 'avoid';
    confidence: 'very_high' | 'high' | 'medium' | 'low';
    odds: number;
  };
  
  // Résultat
  result?: {
    homeScore: number;
    awayScore: number;
    actualResult: 'home' | 'draw' | 'away';
    isCorrect: boolean;
    resolvedAt: string;
  };
  
  status: 'pending' | 'completed' | 'cancelled' | 'postponed' | 'won' | 'lost';
  createdAt: string;
}

export interface MLPick {
  id: string;
  matchId: string;
  sport: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  bet: string;
  betLabel: string;
  odds: number;
  winProbability: number;
  confidence: string;
  type: string;
  result: 'pending' | 'won' | 'lost';
  actualWinner?: string;
}

export interface MLResults {
  picks: MLPick[];
  dailyStats: any[];
  weeklyRatio: number;
  last7Days: {
    total: number;
    won: number;
    ratio: number;
  };
  lastUpdated: string;
  expertMLVisible: boolean;
}

// Cache
let mlResultsCache: MLResults | null = null;

/**
 * Normaliser le sport
 */
function normalizeSport(sport: string): 'football' | 'basketball' | 'hockey' | 'tennis' | 'other' {
  const s = sport.toLowerCase();
  if (s.includes('foot') || s.includes('soccer')) return 'football';
  if (s.includes('basket') || s.includes('nba')) return 'basketball';
  if (s.includes('hockey') || s.includes('nhl')) return 'hockey';
  if (s.includes('tennis')) return 'tennis';
  return 'other';
}

/**
 * Convertir un pronostic du Store au format unifié
 */
function convertToUnified(p: any): UnifiedPrediction {
  const sport = normalizeSport(p.sport || 'foot');
  
  return {
    id: p.id || p.matchId,
    matchId: p.matchId,
    homeTeam: p.homeTeam,
    awayTeam: p.awayTeam,
    sport,
    league: p.league || 'Unknown',
    matchDate: p.matchDate || p.createdAt,
    prediction: {
      bet: p.predictedResult === 'home' ? 'home' : p.predictedResult === 'away' ? 'away' : 'draw',
      confidence: p.confidence === 'very_high' ? 'very_high' 
        : p.confidence === 'high' ? 'high' 
        : p.confidence === 'medium' ? 'medium' : 'low',
      odds: p.oddsHome || 1.0,
    },
    result: p.status === 'completed' || p.status === 'won' || p.status === 'lost' ? {
      homeScore: p.homeScore || 0,
      awayScore: p.awayScore || 0,
      actualResult: p.actualResult || 'home',
      isCorrect: p.resultMatch === true || p.status === 'won',
      resolvedAt: p.checkedAt || new Date().toISOString(),
    } : undefined,
    status: p.status || 'pending',
    createdAt: p.createdAt,
  };
}

/**
 * Charger les résultats ML depuis GitHub (désactivé par défaut)
 */
async function loadMLResults(): Promise<MLResults | null> {
  if (mlResultsCache) return mlResultsCache;

  // GitHub désactivé par défaut pour éviter le blocage
  if (!isGitHubEnabled()) {
    console.log('📊 ML Results: GitHub désactivé, utilisation du cache local');
    return mlResultsCache;
  }

  const token = GITHUB_CONFIG.token;

  // Essayer d'abord avec l'API GitHub (pour les repos privés)
  if (token) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_CONFIG.repo}/contents/data/ml-results-tracking.json?ref=${GITHUB_CONFIG.branch}`,
        { 
          headers: { 
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.raw'
          },
          next: { revalidate: 30 }
        }
      );
      if (res.ok) {
        mlResultsCache = await res.json();
        return mlResultsCache;
      }
    } catch (e) {
      console.error('Erreur chargement ML results API GitHub:', e);
    }
  }

  // Fallback: essayer raw.githubusercontent.com
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/data/ml-results-tracking.json`,
      { next: { revalidate: 30 } }
    );
    if (res.ok) {
      mlResultsCache = await res.json();
      return mlResultsCache;
    }
  } catch (e) {
    console.error('Erreur chargement ML results:', e);
  }
  return null;
}

/**
 * Sauvegarder les résultats ML sur GitHub (désactivé par défaut)
 */
async function saveMLResults(data: MLResults): Promise<boolean> {
  mlResultsCache = data;

  // GitHub désactivé par défaut
  if (!isGitHubEnabled()) {
    console.log('📊 ML Results: GitHub désactivé, données en cache local uniquement');
    return true;
  }

  const token = GITHUB_CONFIG.token;

  if (!token) {
    console.warn('⚠️ GITHUB_TOKEN non configuré - ML results en mémoire uniquement');
    return true;
  }

  try {
    // Récupérer le SHA
    const getRes = await fetch(
      `https://api.github.com/repos/${GITHUB_CONFIG.repo}/contents/data/ml-results-tracking.json`,
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
      `https://api.github.com/repos/${GITHUB_CONFIG.repo}/contents/data/ml-results-tracking.json`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `🧠 MAJ ML results ${new Date().toLocaleString('fr-FR')}`,
          content,
          sha: sha || undefined,
          branch: GITHUB_CONFIG.branch
        })
      }
    );

    if (saveRes.ok) {
      console.log('✅ ML results sauvegardés sur GitHub');
      return true;
    }
  } catch (e) {
    console.error('Erreur sauvegarde ML results:', e);
  }
  return false;
}

/**
 * Obtenir toutes les prédictions unifiées depuis PredictionStore
 */
export async function getUnifiedPredictions(): Promise<UnifiedPrediction[]> {
  const predictions = await PredictionStore.getAllAsync();
  return predictions.map(convertToUnified);
}

/**
 * Obtenir les prédictions résolues (pour ML training)
 */
export async function getResolvedPredictions(): Promise<UnifiedPrediction[]> {
  const predictions = await getUnifiedPredictions();
  return predictions.filter(p => p.status === 'completed' || p.status === 'won' || p.status === 'lost');
}

/**
 * Enregistrer un pick ML
 */
export async function recordMLPick(pick: Omit<MLPick, 'id' | 'result'>): Promise<string> {
  const mlResults = await loadMLResults() || {
    picks: [],
    dailyStats: [],
    weeklyRatio: 0,
    last7Days: { total: 0, won: 0, ratio: 0 },
    lastUpdated: new Date().toISOString(),
    expertMLVisible: false
  };

  const id = `ml_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  mlResults.picks.push({
    ...pick,
    id,
    result: 'pending'
  });

  // Garder les 200 derniers picks
  if (mlResults.picks.length > 200) {
    mlResults.picks = mlResults.picks.slice(-200);
  }

  mlResults.lastUpdated = new Date().toISOString();
  await saveMLResults(mlResults);

  console.log(`📝 ML Pick enregistré: ${pick.homeTeam} vs ${pick.awayTeam}`);
  return id;
}

/**
 * Mettre à jour un pick ML avec le résultat
 */
export async function updateMLPick(pickId: string, result: 'won' | 'lost', actualWinner?: string): Promise<boolean> {
  const mlResults = await loadMLResults();
  if (!mlResults) return false;

  const pickIndex = mlResults.picks.findIndex(p => p.id === pickId);
  if (pickIndex === -1) return false;

  mlResults.picks[pickIndex].result = result;
  mlResults.picks[pickIndex].actualWinner = actualWinner;

  // Recalculer les stats
  const stats = calculateMLStats(mlResults.picks);
  mlResults.last7Days = stats.last7Days;
  mlResults.weeklyRatio = stats.weeklyRatio;
  mlResults.expertMLVisible = stats.expertMLVisible;
  mlResults.lastUpdated = new Date().toISOString();

  await saveMLResults(mlResults);
  return true;
}

/**
 * Calculer les stats ML
 */
function calculateMLStats(picks: MLPick[]): {
  last7Days: { total: number; won: number; ratio: number };
  weeklyRatio: number;
  expertMLVisible: boolean;
} {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const last7DaysPicks = picks.filter(p => new Date(p.date) >= sevenDaysAgo && p.result !== 'pending');
  const total = last7DaysPicks.length;
  const won = last7DaysPicks.filter(p => p.result === 'won').length;
  const ratio = total > 0 ? Math.round((won / total) * 100) : 0;

  // L'Expert ML devient visible si 70%+ de réussite avec au moins 10 pronostics
  const expertMLVisible = ratio >= 70 && total >= 10;

  return {
    last7Days: { total, won, ratio },
    weeklyRatio: ratio,
    expertMLVisible
  };
}

/**
 * Obtenir les stats ML
 */
export async function getMLStats(): Promise<{
  last7Days: { total: number; won: number; ratio: number };
  weeklyRatio: number;
  expertMLVisible: boolean;
  totalPicks: number;
  pendingPicks: number;
}> {
  const mlResults = await loadMLResults();
  
  if (!mlResults) {
    return {
      last7Days: { total: 0, won: 0, ratio: 0 },
      weeklyRatio: 0,
      expertMLVisible: false,
      totalPicks: 0,
      pendingPicks: 0
    };
  }

  return {
    last7Days: mlResults.last7Days,
    weeklyRatio: mlResults.weeklyRatio,
    expertMLVisible: mlResults.expertMLVisible,
    totalPicks: mlResults.picks.length,
    pendingPicks: mlResults.picks.filter(p => p.result === 'pending').length
  };
}

/**
 * Synchroniser PredictionStore avec ML tracking
 * À appeler après chaque vérification de résultats
 */
export async function syncPredictionsToML(): Promise<{
  synced: number;
  mlStats: any;
}> {
  console.log('🔄 Synchronisation PredictionStore -> ML Tracking...');
  
  const predictions = await getUnifiedPredictions();
  const resolved = predictions.filter(p => p.status === 'completed' || p.status === 'won' || p.status === 'lost');
  
  let synced = 0;
  const mlResults = await loadMLResults() || {
    picks: [],
    dailyStats: [],
    weeklyRatio: 0,
    last7Days: { total: 0, won: 0, ratio: 0 },
    lastUpdated: new Date().toISOString(),
    expertMLVisible: false
  };

  // Pour chaque prédiction résolue, créer/mettre à jour le pick ML
  for (const pred of resolved) {
    const existingPick = mlResults.picks.find(p => p.matchId === pred.matchId);
    
    if (!existingPick) {
      // Créer un nouveau pick
      mlResults.picks.push({
        id: `sync_${pred.matchId}`,
        matchId: pred.matchId,
        sport: pred.sport,
        date: pred.matchDate,
        homeTeam: pred.homeTeam,
        awayTeam: pred.awayTeam,
        bet: pred.prediction.bet,
        betLabel: `${pred.prediction.bet === 'home' ? pred.homeTeam : pred.prediction.bet === 'away' ? pred.awayTeam : 'Nul'}`,
        odds: pred.prediction.odds,
        winProbability: 50, // Défaut
        confidence: pred.prediction.confidence,
        type: 'safe',
        result: pred.result!.isCorrect ? 'won' : 'lost',
        actualWinner: pred.result!.actualResult
      });
      synced++;
    } else if (existingPick.result === 'pending') {
      // Mettre à jour le résultat
      existingPick.result = pred.result!.isCorrect ? 'won' : 'lost';
      existingPick.actualWinner = pred.result!.actualResult;
      synced++;
    }
  }

  // Recalculer les stats
  const stats = calculateMLStats(mlResults.picks);
  mlResults.last7Days = stats.last7Days;
  mlResults.weeklyRatio = stats.weeklyRatio;
  mlResults.expertMLVisible = stats.expertMLVisible;
  mlResults.lastUpdated = new Date().toISOString();

  await saveMLResults(mlResults);
  
  console.log(`✅ Sync terminé: ${synced} prédictions synchronisées`);
  console.log(`📊 Stats ML: ${stats.last7Days.won}/${stats.last7Days.total} = ${stats.last7Days.ratio}%`);
  
  return {
    synced,
    mlStats: stats
  };
}

// Export par défaut
const UnifiedPredictionTracker = {
  getUnifiedPredictions,
  getResolvedPredictions,
  recordMLPick,
  updateMLPick,
  getMLStats,
  syncPredictionsToML,
};

export default UnifiedPredictionTracker;
