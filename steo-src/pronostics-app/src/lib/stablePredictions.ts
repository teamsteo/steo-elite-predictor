/**
 * Service de Prédictions Stables
 * 
 * Ce service génère et stocke les prédictions une fois par jour.
 * Les prédictions ne changent pas au rafraîchissement.
 * 
 * Processus:
 * 1. Génération quotidienne à 6h GMT via cron
 * 2. Stockage dans data/daily-predictions.json
 * 3. API lit les données pré-calculées (rapide!)
 */

import * as fs from 'fs';
import * as path from 'path';

// Chemin du fichier de prédictions
const PREDICTIONS_FILE = 'data/daily-predictions.json';

// Interfaces
export interface StablePrediction {
  // Identification
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: 'football' | 'basketball' | 'nfl';
  league: string;
  matchDate: string;
  
  // Cotes
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  
  // Prédictions Dixon-Coles (Football)
  dixonColes?: {
    homeWinProb: number;
    drawProb: number;
    awayWinProb: number;
    expectedHomeGoals: number;
    expectedAwayGoals: number;
    mostLikelyScore: { home: number; away: number; prob: number };
    over25: number;
    under25: number;
    btts: { yes: number; no: number };
    correctScores: { home: number; away: number; prob: number }[];
  };
  
  // Prédictions NBA
  nbaPrediction?: {
    predictedWinner: 'home' | 'away';
    winnerProb: number;
    spread: number;
    totalPoints: number;
    overProb: number;
    confidence: number;
  };
  
  // Prédictions NFL
  nflPrediction?: {
    homeWinProb: number;
    awayWinProb: number;
    spread: number;
    totalPoints: number;
    dvoaDiff: number;
    confidence: number;
  };
  
  // Value Bet
  valueBet: {
    detected: boolean;
    type: 'home' | 'draw' | 'away' | null;
    edge: number;
    kellyStake: number;
  };
  
  // Confiance globale
  confidence: 'high' | 'medium' | 'low';
  
  // Métadonnées
  generatedAt: string;
  dataQuality: 'real' | 'estimated';
}

export interface DailyPredictionsData {
  generatedAt: string;
  validUntil: string;
  version: string;
  stats: {
    football: number;
    basketball: number;
    nfl: number;
    totalValueBets: number;
    highConfidence: number;
  };
  predictions: {
    football: StablePrediction[];
    basketball: StablePrediction[];
    nfl: StablePrediction[];
  };
}

// Cache en mémoire
let cachedData: DailyPredictionsData | null = null;
let cacheTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Charge les prédictions depuis le fichier
 */
export function loadPredictions(): DailyPredictionsData | null {
  // Vérifier le cache mémoire
  if (cachedData && (Date.now() - cacheTime) < CACHE_TTL) {
    return cachedData;
  }
  
  try {
    const filePath = path.join(process.cwd(), PREDICTIONS_FILE);
    
    if (!fs.existsSync(filePath)) {
      console.log('⚠️ Fichier prédictions non trouvé');
      return null;
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    cachedData = data;
    cacheTime = Date.now();
    
    return data;
  } catch (error) {
    console.error('Erreur chargement prédictions:', error);
    return null;
  }
}

/**
 * Sauvegarde les prédictions
 */
export function savePredictions(data: DailyPredictionsData): boolean {
  try {
    const filePath = path.join(process.cwd(), PREDICTIONS_FILE);
    const dir = path.dirname(filePath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    cachedData = data;
    cacheTime = Date.now();
    
    console.log('✅ Prédictions sauvegardées');
    return true;
  } catch (error) {
    console.error('Erreur sauvegarde prédictions:', error);
    return false;
  }
}

/**
 * Vérifie si les données sont fraîches (du jour)
 */
export function isDataFresh(data: DailyPredictionsData): boolean {
  if (!data?.generatedAt) return false;
  
  const generatedDate = new Date(data.generatedAt).toDateString();
  const today = new Date().toDateString();
  
  return generatedDate === today;
}

/**
 * Obtient les prédictions par sport
 */
export function getPredictionsBySport(sport: 'football' | 'basketball' | 'nfl'): StablePrediction[] {
  const data = loadPredictions();
  
  if (!data || !isDataFresh(data)) {
    return [];
  }
  
  return data.predictions[sport] || [];
}

/**
 * Obtient tous les value bets
 */
export function getValueBets(): StablePrediction[] {
  const data = loadPredictions();
  
  if (!data || !isDataFresh(data)) {
    return [];
  }
  
  const allPredictions = [
    ...data.predictions.football,
    ...data.predictions.basketball,
    ...data.predictions.nfl,
  ];
  
  return allPredictions.filter(p => p.valueBet.detected);
}

/**
 * Obtient les prédictions haute confiance
 */
export function getHighConfidencePredictions(): StablePrediction[] {
  const data = loadPredictions();
  
  if (!data || !isDataFresh(data)) {
    return [];
  }
  
  const allPredictions = [
    ...data.predictions.football,
    ...data.predictions.basketball,
    ...data.predictions.nfl,
  ];
  
  return allPredictions.filter(p => p.confidence === 'high');
}

/**
 * Crée une structure de données vide
 */
export function createEmptyData(): DailyPredictionsData {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(6, 0, 0, 0);
  
  return {
    generatedAt: now.toISOString(),
    validUntil: tomorrow.toISOString(),
    version: '1.0',
    stats: {
      football: 0,
      basketball: 0,
      nfl: 0,
      totalValueBets: 0,
      highConfidence: 0,
    },
    predictions: {
      football: [],
      basketball: [],
      nfl: [],
    },
  };
}

/**
 * Invalide le cache
 */
export function invalidateCache(): void {
  cachedData = null;
  cacheTime = 0;
}

export default {
  loadPredictions,
  savePredictions,
  isDataFresh,
  getPredictionsBySport,
  getValueBets,
  getHighConfidencePredictions,
  createEmptyData,
  invalidateCache,
};
