/**
 * Analysis Store - Persistence des analyses par utilisateur
 * Stocke le nombre d'analyses par jour par utilisateur (max 3/jour)
 */

import fs from 'fs';
import path from 'path';

const MAX_ANALYSES_PER_DAY = 3;
const DATA_DIR = path.join(process.cwd(), 'data');
const ANALYSIS_FILE = path.join(DATA_DIR, 'analyses.json');

// Interface pour le stockage
interface UserAnalysisData {
  username: string;
  date: string; // YYYY-MM-DD
  count: number;
  lastAnalysis: string; // ISO timestamp
}

interface AnalysisStore {
  users: Record<string, UserAnalysisData>;
  lastUpdated: string;
}

/**
 * S'assurer que le dossier data existe
 */
function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Charger les données d'analyse
 */
function loadStore(): AnalysisStore {
  try {
    ensureDataDir();
    if (fs.existsSync(ANALYSIS_FILE)) {
      const data = fs.readFileSync(ANALYSIS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Erreur chargement analyses:', error);
  }
  
  return {
    users: {},
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Sauvegarder les données d'analyse
 */
function saveStore(store: AnalysisStore): void {
  try {
    ensureDataDir();
    store.lastUpdated = new Date().toISOString();
    fs.writeFileSync(ANALYSIS_FILE, JSON.stringify(store, null, 2));
  } catch (error) {
    console.error('Erreur sauvegarde analyses:', error);
  }
}

/**
 * Obtenir la date du jour au format YYYY-MM-DD
 */
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Obtenir le nombre d'analyses restantes pour un utilisateur
 */
export function getRemainingAnalyses(username: string): number {
  const store = loadStore();
  const today = getTodayDate();
  const userData = store.users[username];
  
  // Si pas de données ou date différente, réinitialiser
  if (!userData || userData.date !== today) {
    return MAX_ANALYSES_PER_DAY;
  }
  
  return Math.max(0, MAX_ANALYSES_PER_DAY - userData.count);
}

/**
 * Obtenir les infos d'analyse pour un utilisateur
 */
export function getAnalysisInfo(username: string): {
  remaining: number;
  used: number;
  max: number;
  date: string;
  resetTime: string;
} {
  const store = loadStore();
  const today = getTodayDate();
  const userData = store.users[username];
  
  let used = 0;
  if (userData && userData.date === today) {
    used = userData.count;
  }
  
  // Calculer l'heure de réinitialisation (minuit prochain)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const resetTime = tomorrow.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  
  return {
    remaining: MAX_ANALYSES_PER_DAY - used,
    used,
    max: MAX_ANALYSES_PER_DAY,
    date: today,
    resetTime
  };
}

/**
 * Enregistrer une analyse pour un utilisateur
 * Retourne true si succès, false si limite atteinte
 */
export function recordAnalysis(username: string): {
  success: boolean;
  remaining: number;
  error?: string;
} {
  const store = loadStore();
  const today = getTodayDate();
  
  // Initialiser ou réinitialiser si nouveau jour
  if (!store.users[username] || store.users[username].date !== today) {
    store.users[username] = {
      username,
      date: today,
      count: 0,
      lastAnalysis: new Date().toISOString()
    };
  }
  
  const userData = store.users[username];
  
  // Vérifier la limite
  if (userData.count >= MAX_ANALYSES_PER_DAY) {
    return {
      success: false,
      remaining: 0,
      error: `Limite quotidienne atteinte (${MAX_ANALYSES_PER_DAY} analyses/jour)`
    };
  }
  
  // Incrémenter
  userData.count++;
  userData.lastAnalysis = new Date().toISOString();
  
  // Sauvegarder
  saveStore(store);
  
  console.log(`📊 Analyse enregistrée pour ${username}: ${userData.count}/${MAX_ANALYSES_PER_DAY}`);
  
  return {
    success: true,
    remaining: MAX_ANALYSES_PER_DAY - userData.count
  };
}

/**
 * Réinitialiser les analyses pour un utilisateur (admin)
 */
export function resetAnalyses(username: string): boolean {
  const store = loadStore();
  const today = getTodayDate();
  
  store.users[username] = {
    username,
    date: today,
    count: 0,
    lastAnalysis: new Date().toISOString()
  };
  
  saveStore(store);
  return true;
}

/**
 * Obtenir tous les utilisateurs et leurs analyses (admin)
 */
export function getAllUsersAnalyses(): UserAnalysisData[] {
  const store = loadStore();
  return Object.values(store.users);
}

export { MAX_ANALYSES_PER_DAY };
