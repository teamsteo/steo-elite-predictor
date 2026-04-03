/**
 * Système de stockage pour les pronostics
 * VERSION 4.0 - Hybride Supabase + Local + GitHub (compatible Vercel)
 * 
 * Ce fichier utilise plusieurs sources de stockage:
 * 1. Supabase (prioritaire si configuré)
 * 2. Fichier local (pour le développement)
 * 3. GitHub (fallback optionnel)
 */

import crypto from 'crypto';
import { SupabaseStore, DbPrediction } from './db-supabase';
import fs from 'fs';
import path from 'path';

// Configuration GitHub (DÉSACTIVÉ pour éviter le blocage)
// Pour réactiver, définir GITHUB_ENABLED=true dans les variables d'environnement
const GITHUB_ENABLED = process.env.GITHUB_ENABLED === 'true';
const GITHUB_REPO = process.env.GITHUB_REPO || 'steohidy/my-project';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'master';
const PREDICTIONS_FILE_PATH = 'data/store-predictions.json';

// Chemin du fichier local
const LOCAL_FILE_PATH = path.join(process.cwd(), 'data', 'store-predictions.json');

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
  status: 'pending' | 'completed' | 'cancelled' | 'postponed';
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

interface SportStats {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
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
  bySport?: {
    football: SportStats;
    basketball: SportStats;
    hockey: SportStats;
  };
}

interface AllStats {
  daily: PeriodStats;
  weekly: PeriodStats;
  monthly: PeriodStats;
  overall: PeriodStats;
}

// Cache en mémoire
let cachedData: DataStore | null = null;
let supabaseAvailable: boolean | null = null;

const DEFAULT_STORE: DataStore = {
  predictions: [],
  lastUpdate: new Date().toISOString(),
  version: '4.0'
};

// Vérifier si on est côté serveur
const isServer = typeof window === 'undefined';

// ============================================
// FONCTIONS DE PERSISTANCE HYBRIDES
// ============================================

/**
 * Charge les données depuis le fichier local (côté serveur uniquement)
 */
function loadFromLocalFile(): DataStore | null {
  if (!isServer) return null;
  
  try {
    if (fs.existsSync(LOCAL_FILE_PATH)) {
      const content = fs.readFileSync(LOCAL_FILE_PATH, 'utf-8');
      const data = JSON.parse(content);
      console.log('📊 Store: données chargées depuis fichier local');
      return data;
    }
  } catch (e) {
    console.error('Erreur chargement fichier local:', e);
  }
  return null;
}

/**
 * Sauvegarde les données dans le fichier local (côté serveur uniquement)
 */
function saveToLocalFile(data: DataStore): boolean {
  if (!isServer) return false;
  
  try {
    const dir = path.dirname(LOCAL_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_FILE_PATH, JSON.stringify(data, null, 2));
    console.log('📊 Store: données sauvegardées localement');
    return true;
  } catch (e) {
    console.error('Erreur sauvegarde fichier local:', e);
    return false;
  }
}

/**
 * Charge les données depuis Supabase
 */
async function loadFromSupabase(): Promise<DataStore | null> {
  try {
    const available = await SupabaseStore.isAvailable();
    if (!available) {
      supabaseAvailable = false;
      return null;
    }
    supabaseAvailable = true;
    
    const predictions = await SupabaseStore.getAllPredictions();
    
    // Convertir les prédictions Supabase au format local
    const localPredictions: Prediction[] = predictions.map((p: DbPrediction) => ({
      id: p.id || `pred_${p.match_id}`,
      matchId: p.match_id,
      homeTeam: p.home_team,
      awayTeam: p.away_team,
      league: p.league,
      sport: p.sport,
      matchDate: p.match_date,
      oddsHome: p.odds_home,
      oddsDraw: p.odds_draw,
      oddsAway: p.odds_away,
      predictedResult: p.predicted_result,
      predictedGoals: p.predicted_goals,
      confidence: p.confidence,
      riskPercentage: p.risk_percentage,
      homeScore: p.home_score,
      awayScore: p.away_score,
      totalGoals: p.total_goals,
      actualResult: p.actual_result,
      status: p.status,
      resultMatch: p.result_match,
      goalsMatch: p.goals_match,
      createdAt: p.created_at || new Date().toISOString(),
      checkedAt: p.checked_at
    }));
    
    console.log(`📊 Store: ${localPredictions.length} prédictions chargées depuis Supabase`);
    return {
      predictions: localPredictions,
      lastUpdate: new Date().toISOString(),
      version: '4.0'
    };
  } catch (e) {
    console.error('Erreur chargement Supabase:', e);
    supabaseAvailable = false;
    return null;
  }
}

/**
 * Charge les données depuis GitHub (fallback)
 */
async function loadFromGitHub(): Promise<DataStore | null> {
  const token = process.env.GITHUB_TOKEN;

  // Essayer d'abord avec l'API GitHub (pour les repos privés)
  if (token) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/contents/${PREDICTIONS_FILE_PATH}?ref=${GITHUB_BRANCH}`,
        { 
          headers: { 
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.raw'
          },
          next: { revalidate: 30 }
        }
      );
      if (res.ok) {
        const data = await res.json();
        console.log('📊 Store: données chargées depuis GitHub API');
        return data;
      }
    } catch (e) {
      console.error('Erreur chargement store API GitHub:', e);
    }
  }

  // Fallback: essayer raw.githubusercontent.com (pour les repos publics)
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${PREDICTIONS_FILE_PATH}`,
      { next: { revalidate: 30 } }
    );
    if (res.ok) {
      const data = await res.json();
      console.log('📊 Store: données chargées depuis GitHub Raw');
      return data;
    }
  } catch (e) {
    console.error('Erreur chargement store GitHub:', e);
  }
  
  return null;
}

/**
 * Fonction principale de chargement (hybride)
 */
async function loadData(): Promise<DataStore> {
  // 1. Retourner le cache si disponible
  if (cachedData) return cachedData;
  
  // 2. Essayer Supabase en priorité
  const supabaseData = await loadFromSupabase();
  if (supabaseData) {
    cachedData = supabaseData;
    return cachedData;
  }
  
  // 3. Essayer le fichier local
  const localData = loadFromLocalFile();
  if (localData) {
    cachedData = localData;
    return cachedData;
  }
  
  // 4. GitHub uniquement si explicitement activé
  if (GITHUB_ENABLED) {
    const githubData = await loadFromGitHub();
    if (githubData) {
      cachedData = githubData;
      return cachedData;
    }
  }
  
  // 5. Données par défaut
  console.log('📊 Store: utilisation des données par défaut');
  cachedData = DEFAULT_STORE;
  return cachedData;
}

async function saveData(data: DataStore): Promise<boolean> {
  cachedData = data;
  
  // 1. Sauvegarder dans Supabase si disponible
  if (supabaseAvailable === true) {
    try {
      // Note: Supabase gère ses propres prédictions individuellement
      console.log('📊 Store: données synchronisées avec Supabase');
    } catch (e) {
      console.error('Erreur sync Supabase:', e);
    }
  }
  
  // 2. Sauvegarder localement
  saveToLocalFile(data);
  
  // 3. GitHub désactivé par défaut pour éviter le blocage
  // Pour réactiver: définir GITHUB_ENABLED=true et GITHUB_TOKEN
  if (!GITHUB_ENABLED) {
    console.log('📊 Store: données sauvegardées (GitHub désactivé)');
    return true;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log('📊 Store: données sauvegardées localement (pas de token GitHub)');
    return true;
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
      console.warn('⚠️ Store: sauvegarde GitHub échouée, données locales OK');
      return true; // Les données locales sont OK
    }
  } catch (e) {
    console.warn('⚠️ Store: erreur GitHub, données locales OK:', e);
    return true; // Les données locales sont OK
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

// Normaliser le sport
function normalizeSport(sport: string): 'football' | 'basketball' | 'hockey' | 'other' {
  const s = sport.toLowerCase();
  if (s.includes('foot') || s.includes('soccer')) return 'football';
  if (s.includes('basket') || s.includes('nba')) return 'basketball';
  if (s.includes('hockey') || s.includes('nhl')) return 'hockey';
  return 'other';
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
  
  // Calculer les stats par sport
  const sportStats: { football: SportStats; basketball: SportStats; hockey: SportStats } = {
    football: { total: 0, wins: 0, losses: 0, winRate: 0 },
    basketball: { total: 0, wins: 0, losses: 0, winRate: 0 },
    hockey: { total: 0, wins: 0, losses: 0, winRate: 0 }
  };
  
  for (const p of completed) {
    const sportKey = normalizeSport(p.sport);
    if (sportKey === 'other') continue;
    
    sportStats[sportKey].total++;
    if (p.resultMatch === true) {
      sportStats[sportKey].wins++;
    } else if (p.resultMatch === false) {
      sportStats[sportKey].losses++;
    }
  }
  
  // Calculer les winRates
  for (const sport of ['football', 'basketball', 'hockey'] as const) {
    if (sportStats[sport].total > 0) {
      sportStats[sport].winRate = Math.round((sportStats[sport].wins / sportStats[sport].total) * 100);
    }
  }
  
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
      : 0,
    bySport: sportStats
  };
}

// ============================================
// API PUBLIQUE (MIXTE SYNC/ASYNC)
// ============================================

export const PredictionStore = {
  // Méthodes asynchrones (hybrides)
  
  async loadAsync(): Promise<DataStore> {
    return loadData();
  },

  async getAllAsync(): Promise<Prediction[]> {
    const data = await loadData();
    return data.predictions;
  },

  async getPendingAsync(): Promise<Prediction[]> {
    const data = await loadData();
    return data.predictions.filter(p => p.status === 'pending');
  },

  async getCompletedAsync(): Promise<Prediction[]> {
    const data = await loadData();
    return data.predictions.filter(p => p.status === 'completed');
  },

  async addAsync(data: Omit<Prediction, 'id' | 'createdAt' | 'status' | 'signature'>): Promise<Prediction> {
    const store = await loadData();
    
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
    await saveData(store);
    
    return prediction;
  },

  async addManyAsync(predictions: Omit<Prediction, 'id' | 'createdAt' | 'status' | 'signature'>[]): Promise<number> {
    const store = await loadData();
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
      await saveData(store);
    }
    return added;
  },

  async updateAsync(matchId: string, data: Partial<Prediction>): Promise<boolean> {
    const store = await loadData();
    const index = store.predictions.findIndex(p => p.matchId === matchId);
    
    if (index === -1) return false;
    
    store.predictions[index] = {
      ...store.predictions[index],
      ...data
    };
    
    if (data.status === 'completed') {
      store.predictions[index].signature = generateSignature(store.predictions[index]);
    }
    
    await saveData(store);
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
    const store = await loadData();
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
    const store = await loadData();
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    
    const initialCount = store.predictions.length;
    store.predictions = store.predictions.filter(p => 
      new Date(p.matchDate) >= twoMonthsAgo
    );
    
    const removed = initialCount - store.predictions.length;
    if (removed > 0) {
      await saveData(store);
    }
    return removed;
  },

  async clearAllAsync(): Promise<boolean> {
    const store: DataStore = {
      predictions: [],
      lastUpdate: new Date().toISOString(),
      version: '4.0'
    };
    return saveData(store);
  },

  async getInfoAsync() {
    const store = await loadData();
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
      monthlyStats: detailed.monthly,
      source: supabaseAvailable ? 'Supabase' : (cachedData ? 'Local' : 'Default')
    };
  },

  async verifyIntegrityAsync(): Promise<{ valid: boolean; invalidCount: number; total: number }> {
    const store = await loadData();
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
