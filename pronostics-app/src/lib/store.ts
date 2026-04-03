/**
 * Système de stockage pour les pronostics
 * VERSION 3.0 - GitHub JSON Storage (compatible Vercel)
 * 
 * Ce fichier a été réécrit pour utiliser GitHub comme stockage
 * car Vercel a un système de fichiers en lecture seule (EROFS).
 */

import crypto from 'crypto';

// Configuration GitHub
const GITHUB_REPO = 'steohidy/my-project';
const GITHUB_BRANCH = 'master';
const PREDICTIONS_FILE_PATH = 'data/store-predictions.json';

// Secret pour la validation des données (sécurité)
const DATA_SECRET = process.env.DATA_SECRET || 'steo-elite-secret-2026';

// Structure des données
interface Prediction {
  id: string;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport: string;
  matchDate: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  predictedResult: string;
  predictedGoals?: string;
  predictedCards?: string;
  confidence: string;
  riskPercentage: number;
  homeScore?: number;
  awayScore?: number;
  totalGoals?: number;
  actualResult?: string;
  status: 'pending' | 'completed';
  resultMatch?: boolean;
  goalsMatch?: boolean;
  cardsMatch?: boolean;
  createdAt: string;
  checkedAt?: string;
  signature?: string;
}

interface DataStore {
  predictions: Prediction[];
  lastUpdate: string;
  version: string;
  checksum?: string;
}

// Statistiques détaillées
interface DetailedStats {
  total: number;
  correct: number;
  rate: number;
}

interface PeriodStats {
  totalPredictions: number;
  results: DetailedStats;
  goals: DetailedStats;
  cards: DetailedStats;
  overall: number;
  pending: number;
  completed: number;
  wins: number;
  losses: number;
  winRate: number;
}

interface AllStats {
  daily: PeriodStats;
  weekly: PeriodStats;
  monthly: PeriodStats;
  overall: PeriodStats;
}

// Cache en mémoire
let cachedData: DataStore | null = null;

const DEFAULT_STORE: DataStore = {
  predictions: [],
  lastUpdate: new Date().toISOString(),
  version: '3.0'
};

// ============================================
// FONCTIONS DE PERSISTANCE GITHUB
// ============================================

async function loadFromGitHub(): Promise<DataStore> {
  if (cachedData) return cachedData;

  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${PREDICTIONS_FILE_PATH}`,
      { next: { revalidate: 30 } }
    );
    if (res.ok) {
      cachedData = await res.json();
      console.log('📊 Store: données chargées depuis GitHub');
      return cachedData!;
    }
  } catch (e) {
    console.error('Erreur chargement store:', e);
  }
  return DEFAULT_STORE;
}

async function saveToGitHub(data: DataStore): Promise<boolean> {
  cachedData = data;
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    console.warn('⚠️ GITHUB_TOKEN non configuré - store en mémoire uniquement');
    return true; // Succès en mémoire
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
          message: `📊 MAJ store ${new Date().toLocaleString('fr-FR')}`,
          content,
          sha: sha || undefined,
          branch: GITHUB_BRANCH
        })
      }
    );
    
    if (saveRes.ok) {
      console.log('📊 Store: données sauvegardées sur GitHub');
      return true;
    } else {
      console.error('Erreur sauvegarde GitHub store:', await saveRes.text());
      return false;
    }
  } catch (e) {
    console.error('Erreur sauvegarde store:', e);
    return false;
  }
}

// Version synchrone pour les méthodes qui ne peuvent pas être async
function loadFromCache(): DataStore {
  return cachedData || DEFAULT_STORE;
}

// Générer une signature pour l'intégrité des données
function generateSignature(data: Prediction): string {
  const payload = `${data.matchId}|${data.homeTeam}|${data.awayTeam}|${data.predictedResult}|${DATA_SECRET}`;
  return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 16);
}

// Vérifier la signature d'un pronostic
function verifySignature(data: Prediction): boolean {
  if (!data.signature) return true;
  const expected = generateSignature(data);
  return data.signature === expected;
}

// Générer un ID unique
function generateId(): string {
  return `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Obtenir le début de la journée (minuit)
function getStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Obtenir le début de la semaine (lundi)
function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Obtenir le début du mois
function getStartOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Calculer les stats pour une période
function calculatePeriodStats(predictions: Prediction[]): PeriodStats {
  const completed = predictions.filter(p => p.status === 'completed');
  const pending = predictions.filter(p => p.status === 'pending');
  
  const resultsPredicted = completed.filter(p => p.resultMatch !== undefined);
  const resultsCorrect = completed.filter(p => p.resultMatch === true);
  
  const goalsPredicted = completed.filter(p => p.goalsMatch !== undefined);
  const goalsCorrect = completed.filter(p => p.goalsMatch === true);
  
  const cardsPredicted = completed.filter(p => p.predictedCards && p.cardsMatch !== undefined);
  const cardsCorrect = completed.filter(p => p.cardsMatch === true);
  
  const totalChecks = resultsPredicted.length + goalsPredicted.length + cardsPredicted.length;
  const totalCorrect = resultsCorrect.length + goalsCorrect.length + cardsCorrect.length;
  
  const wins = resultsCorrect.length;
  const losses = resultsPredicted.length - resultsCorrect.length;
  
  return {
    totalPredictions: predictions.length,
    results: {
      total: resultsPredicted.length,
      correct: resultsCorrect.length,
      rate: resultsPredicted.length > 0 
        ? Math.round((resultsCorrect.length / resultsPredicted.length) * 100) 
        : 0
    },
    goals: {
      total: goalsPredicted.length,
      correct: goalsCorrect.length,
      rate: goalsPredicted.length > 0 
        ? Math.round((goalsCorrect.length / goalsPredicted.length) * 100) 
        : 0
    },
    cards: {
      total: cardsPredicted.length,
      correct: cardsCorrect.length,
      rate: cardsPredicted.length > 0 
        ? Math.round((cardsCorrect.length / cardsPredicted.length) * 100) 
        : 0
    },
    overall: totalChecks > 0 
      ? Math.round((totalCorrect / totalChecks) * 100) 
      : 0,
    pending: pending.length,
    completed: completed.length,
    wins,
    losses,
    winRate: resultsPredicted.length > 0 
      ? Math.round((wins / resultsPredicted.length) * 100) 
      : 0
  };
}

// ============================================
// API PUBLIQUE (MIXTE SYNC/ASYNC)
// ============================================

export const PredictionStore = {
  // Méthodes asynchrones (pour GitHub)
  
  async loadAsync(): Promise<DataStore> {
    return loadFromGitHub();
  },

  async getAllAsync(): Promise<Prediction[]> {
    const data = await loadFromGitHub();
    return data.predictions;
  },

  async getPendingAsync(): Promise<Prediction[]> {
    const data = await loadFromGitHub();
    return data.predictions.filter(p => p.status === 'pending');
  },

  async getCompletedAsync(): Promise<Prediction[]> {
    const data = await loadFromGitHub();
    return data.predictions.filter(p => p.status === 'completed');
  },

  async addAsync(data: Omit<Prediction, 'id' | 'createdAt' | 'status' | 'signature'>): Promise<Prediction> {
    const store = await loadFromGitHub();
    
    const exists = store.predictions.find(p => p.matchId === data.matchId);
    if (exists) return exists;
    
    const prediction: Prediction = {
      ...data,
      id: generateId(),
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    prediction.signature = generateSignature(prediction);
    
    store.predictions.push(prediction);
    await saveToGitHub(store);
    
    return prediction;
  },

  async addManyAsync(predictions: Omit<Prediction, 'id' | 'createdAt' | 'status' | 'signature'>[]): Promise<number> {
    const store = await loadFromGitHub();
    let added = 0;
    
    for (const data of predictions) {
      const exists = store.predictions.find(p => p.matchId === data.matchId);
      if (!exists) {
        const prediction: Prediction = {
          ...data,
          id: generateId(),
          status: 'pending',
          createdAt: new Date().toISOString()
        };
        prediction.signature = generateSignature(prediction);
        store.predictions.push(prediction);
        added++;
      }
    }
    
    if (added > 0) {
      await saveToGitHub(store);
    }
    return added;
  },

  async updateAsync(matchId: string, data: Partial<Prediction>): Promise<boolean> {
    const store = await loadFromGitHub();
    const index = store.predictions.findIndex(p => p.matchId === matchId);
    
    if (index === -1) return false;
    
    store.predictions[index] = {
      ...store.predictions[index],
      ...data
    };
    
    if (data.status === 'completed') {
      store.predictions[index].signature = generateSignature(store.predictions[index]);
    }
    
    await saveToGitHub(store);
    return true;
  },

  async completeAsync(matchId: string, result: {
    homeScore: number;
    awayScore: number;
    actualResult: string;
    resultMatch: boolean;
    goalsMatch?: boolean;
    cardsMatch?: boolean;
  }): Promise<boolean> {
    return this.updateAsync(matchId, {
      ...result,
      totalGoals: result.homeScore + result.awayScore,
      status: 'completed',
      checkedAt: new Date().toISOString()
    });
  },

  async getDetailedStatsAsync(): Promise<AllStats> {
    const store = await loadFromGitHub();
    const now = new Date();
    
    const startOfDay = getStartOfDay(now);
    const startOfWeek = getStartOfWeek(now);
    const startOfMonth = getStartOfMonth(now);
    
    const dailyPredictions = store.predictions.filter(p => 
      new Date(p.matchDate) >= startOfDay
    );
    
    const weeklyPredictions = store.predictions.filter(p => 
      new Date(p.matchDate) >= startOfWeek
    );
    
    const monthlyPredictions = store.predictions.filter(p => 
      new Date(p.matchDate) >= startOfMonth
    );
    
    return {
      daily: calculatePeriodStats(dailyPredictions),
      weekly: calculatePeriodStats(weeklyPredictions),
      monthly: calculatePeriodStats(monthlyPredictions),
      overall: calculatePeriodStats(store.predictions)
    };
  },

  async cleanupAsync(): Promise<number> {
    const store = await loadFromGitHub();
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    
    const initialCount = store.predictions.length;
    store.predictions = store.predictions.filter(p => 
      new Date(p.matchDate) >= twoMonthsAgo
    );
    
    const removed = initialCount - store.predictions.length;
    if (removed > 0) {
      await saveToGitHub(store);
    }
    return removed;
  },

  async clearAllAsync(): Promise<boolean> {
    const store: DataStore = {
      predictions: [],
      lastUpdate: new Date().toISOString(),
      version: '3.0'
    };
    return saveToGitHub(store);
  },

  async getInfoAsync() {
    const store = await loadFromGitHub();
    const detailed = await this.getDetailedStatsAsync();
    
    return {
      total: store.predictions.length,
      pending: store.predictions.filter(p => p.status === 'pending').length,
      completed: store.predictions.filter(p => p.status === 'completed').length,
      lastUpdate: store.lastUpdate,
      version: store.version,
      checksum: store.checksum,
      dailyStats: detailed.daily,
      weeklyStats: detailed.weekly,
      monthlyStats: detailed.monthly
    };
  },

  async verifyIntegrityAsync(): Promise<{ valid: boolean; invalidCount: number; total: number }> {
    const store = await loadFromGitHub();
    let invalidCount = 0;
    
    for (const p of store.predictions) {
      if (p.status === 'completed' && !verifySignature(p)) {
        invalidCount++;
      }
    }
    
    return {
      valid: invalidCount === 0,
      invalidCount,
      total: store.predictions.length
    };
  },

  // ============================================
  // Méthodes synchrones (pour compatibilité - utilisent le cache)
  // ============================================

  getAll(): Prediction[] {
    return loadFromCache().predictions;
  },

  getPending(): Prediction[] {
    return loadFromCache().predictions.filter(p => p.status === 'pending');
  },

  getCompleted(): Prediction[] {
    return loadFromCache().predictions.filter(p => p.status === 'completed');
  },

  // add et addMany lancent l'opération async mais retournent immédiatement
  // L'opération se fait en arrière-plan
  add(data: Omit<Prediction, 'id' | 'createdAt' | 'status' | 'signature'>): Prediction {
    // Créer la prédiction localement d'abord
    const prediction: Prediction = {
      ...data,
      id: generateId(),
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    prediction.signature = generateSignature(prediction);
    
    // Ajouter au cache immédiatement
    if (cachedData) {
      const exists = cachedData.predictions.find(p => p.matchId === data.matchId);
      if (!exists) {
        cachedData.predictions.push(prediction);
      }
    }
    
    // Sauvegarder en arrière-plan (fire and forget)
    this.addAsync(data).catch(e => console.error('Erreur add async:', e));
    
    return prediction;
  },

  addMany(predictions: Omit<Prediction, 'id' | 'createdAt' | 'status' | 'signature'>[]): number {
    // Ajouter au cache immédiatement
    let added = 0;
    if (cachedData) {
      for (const data of predictions) {
        const exists = cachedData.predictions.find(p => p.matchId === data.matchId);
        if (!exists) {
          const prediction: Prediction = {
            ...data,
            id: generateId(),
            status: 'pending',
            createdAt: new Date().toISOString()
          };
          prediction.signature = generateSignature(prediction);
          cachedData.predictions.push(prediction);
          added++;
        }
      }
    }
    
    // Sauvegarder en arrière-plan (fire and forget)
    this.addManyAsync(predictions).catch(e => console.error('Erreur addMany async:', e));
    
    return added;
  },

  update(matchId: string, data: Partial<Prediction>): boolean {
    // Mettre à jour le cache immédiatement
    if (cachedData) {
      const index = cachedData.predictions.findIndex(p => p.matchId === matchId);
      if (index !== -1) {
        cachedData.predictions[index] = {
          ...cachedData.predictions[index],
          ...data
        };
        if (data.status === 'completed') {
          cachedData.predictions[index].signature = generateSignature(cachedData.predictions[index]);
        }
      }
    }
    
    // Sauvegarder en arrière-plan
    this.updateAsync(matchId, data).catch(e => console.error('Erreur update async:', e));
    
    return true;
  },

  complete(matchId: string, result: {
    homeScore: number;
    awayScore: number;
    actualResult: string;
    resultMatch: boolean;
    goalsMatch?: boolean;
    cardsMatch?: boolean;
  }): boolean {
    return this.update(matchId, {
      ...result,
      totalGoals: result.homeScore + result.awayScore,
      status: 'completed',
      checkedAt: new Date().toISOString()
    });
  },

  getDetailedStats(): AllStats {
    const store = loadFromCache();
    const now = new Date();
    
    const startOfDay = getStartOfDay(now);
    const startOfWeek = getStartOfWeek(now);
    const startOfMonth = getStartOfMonth(now);
    
    const dailyPredictions = store.predictions.filter(p => 
      new Date(p.matchDate) >= startOfDay
    );
    
    const weeklyPredictions = store.predictions.filter(p => 
      new Date(p.matchDate) >= startOfWeek
    );
    
    const monthlyPredictions = store.predictions.filter(p => 
      new Date(p.matchDate) >= startOfMonth
    );
    
    return {
      daily: calculatePeriodStats(dailyPredictions),
      weekly: calculatePeriodStats(weeklyPredictions),
      monthly: calculatePeriodStats(monthlyPredictions),
      overall: calculatePeriodStats(store.predictions)
    };
  },

  getStats() {
    const detailed = this.getDetailedStats();
    return detailed.overall;
  },

  cleanup(): number {
    this.cleanupAsync().catch(e => console.error('Erreur cleanup async:', e));
    return 0;
  },

  clearAll(): boolean {
    cachedData = DEFAULT_STORE;
    this.clearAllAsync().catch(e => console.error('Erreur clearAll async:', e));
    return true;
  },

  getInfo() {
    const store = loadFromCache();
    const detailed = this.getDetailedStats();
    
    return {
      total: store.predictions.length,
      pending: store.predictions.filter(p => p.status === 'pending').length,
      completed: store.predictions.filter(p => p.status === 'completed').length,
      lastUpdate: store.lastUpdate,
      version: store.version,
      checksum: store.checksum,
      dailyStats: detailed.daily,
      weeklyStats: detailed.weekly,
      monthlyStats: detailed.monthly
    };
  },
  
  verifyIntegrity(): { valid: boolean; invalidCount: number; total: number } {
    const store = loadFromCache();
    let invalidCount = 0;
    
    for (const p of store.predictions) {
      if (p.status === 'completed' && !verifySignature(p)) {
        invalidCount++;
      }
    }
    
    return {
      valid: invalidCount === 0,
      invalidCount,
      total: store.predictions.length
    };
  }
};

export default PredictionStore;
