/**
 * Trap History Store - Historique des pièges détectés
 * 
 * Objectif: Apprendre des pièges passés pour améliorer la détection
 * - Sauvegarde les pièges détectés avec leur issue
 * - Calcule les taux de réussite par type de piège
 * - Fournit des insights pour affiner les conseils
 */

import fs from 'fs';
import path from 'path';

// Types
export interface TrapRecord {
  id: string;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  date: string;
  
  // Cotes au moment de la détection
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  
  // Piège détecté
  trapType: 'overvalued_favorite' | 'tight_match' | 'injury_risk' | 'form_mismatch';
  trapSeverity: 'low' | 'medium' | 'high';
  trapWarning: string;
  
  // Prédiction faite
  predictedOutcome: 'home_win' | 'draw' | 'away_win' | 'avoid';
  predictedFavorite: string;
  
  // Résultat réel
  actualOutcome: 'home_win' | 'draw' | 'away_win' | null; // null si match pas encore joué
  homeScore: number | null;
  awayScore: number | null;
  
  // Analyse post-match
  wasTrapCorrect: boolean | null; // Le piège a-t-il été validé ?
  betResult: 'won' | 'lost' | 'avoided' | null; // Si on avait suivi le conseil
  trapAccuracy: number | null; // Score de précision du piège
  
  // Métadonnées
  detectedAt: string;
  resolvedAt: string | null;
}

export interface TrapStats {
  total: number;
  resolved: number;
  correctPredictions: number;
  accuracy: number;
  
  byType: Record<string, {
    total: number;
    correct: number;
    accuracy: number;
    avgEdge: number;
  }>;
  
  bySeverity: Record<string, {
    total: number;
    correct: number;
    accuracy: number;
  }>;
  
  bySport: Record<string, {
    total: number;
    correct: number;
    accuracy: number;
  }>;
  
  lessons: string[];
}

// Chemin du stockage
const DATA_DIR = path.join(process.cwd(), 'data');
const TRAPS_FILE = path.join(DATA_DIR, 'trap-history.json');

// Stockage en mémoire
let trapHistory: TrapRecord[] = [];

/**
 * Initialise le store
 */
function initStore(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  if (fs.existsSync(TRAPS_FILE)) {
    try {
      const data = fs.readFileSync(TRAPS_FILE, 'utf-8');
      trapHistory = JSON.parse(data);
    } catch (error) {
      console.error('Erreur chargement historique pièges:', error);
      trapHistory = [];
    }
  }
}

/**
 * Sauvegarde sur disque
 */
function saveToDisk(): void {
  try {
    fs.writeFileSync(TRAPS_FILE, JSON.stringify(trapHistory, null, 2));
  } catch (error) {
    console.error('Erreur sauvegarde historique pièges:', error);
  }
}

/**
 * Ajoute un piège détecté à l'historique
 */
export function addTrap(trap: Omit<TrapRecord, 'id' | 'detectedAt' | 'resolvedAt' | 'actualOutcome' | 'homeScore' | 'awayScore' | 'wasTrapCorrect' | 'betResult' | 'trapAccuracy'>): TrapRecord {
  initStore();
  
  const record: TrapRecord = {
    ...trap,
    id: `trap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    detectedAt: new Date().toISOString(),
    resolvedAt: null,
    actualOutcome: null,
    homeScore: null,
    awayScore: null,
    wasTrapCorrect: null,
    betResult: null,
    trapAccuracy: null,
  };
  
  trapHistory.push(record);
  saveToDisk();
  
  console.log(`📌 Piège ajouté: ${trap.trapType} pour ${trap.homeTeam} vs ${trap.awayTeam}`);
  
  return record;
}

/**
 * Met à jour un piège avec le résultat du match
 */
export function resolveTrap(
  matchId: string,
  homeScore: number,
  awayScore: number
): TrapRecord | null {
  initStore();
  
  const trap = trapHistory.find(t => t.matchId === matchId && !t.resolvedAt);
  
  if (!trap) {
    return null;
  }
  
  // Déterminer le résultat réel
  let actualOutcome: 'home_win' | 'draw' | 'away_win';
  if (homeScore > awayScore) {
    actualOutcome = 'home_win';
  } else if (awayScore > homeScore) {
    actualOutcome = 'away_win';
  } else {
    actualOutcome = 'draw';
  }
  
  // Calculer si le piège était correct
  let wasTrapCorrect = false;
  
  switch (trap.trapType) {
    case 'overvalued_favorite':
      // Le piège est correct si le favori ne gagne pas
      const favoriteWon = (trap.predictedOutcome === 'home_win' && actualOutcome === 'home_win') ||
                          (trap.predictedOutcome === 'away_win' && actualOutcome === 'away_win');
      wasTrapCorrect = !favoriteWon;
      break;
      
    case 'tight_match':
      // Le piège est correct si match nul ou résultat serré (1 but d'écart)
      const goalDiff = Math.abs(homeScore - awayScore);
      wasTrapCorrect = actualOutcome === 'draw' || goalDiff <= 1;
      break;
      
    case 'injury_risk':
      // Le piège est correct si l'équipe avec blessures perd ou fait nul
      // (logique simplifiée)
      wasTrapCorrect = trap.predictedOutcome !== actualOutcome;
      break;
      
    case 'form_mismatch':
      // Le piège est correct si la forme a eu raison des cotes
      wasTrapCorrect = trap.predictedOutcome !== actualOutcome;
      break;
  }
  
  // Calculer le résultat du pari si on avait suivi le conseil
  let betResult: 'won' | 'lost' | 'avoided';
  if (trap.predictedOutcome === 'avoid') {
    betResult = 'avoided';
  } else if (trap.predictedOutcome === actualOutcome) {
    betResult = 'won';
  } else {
    betResult = 'lost';
  }
  
  // Score de précision
  const trapAccuracy = wasTrapCorrect ? 100 : (trap.trapSeverity === 'high' ? 0 : 50);
  
  // Mettre à jour le record
  trap.actualOutcome = actualOutcome;
  trap.homeScore = homeScore;
  trap.awayScore = awayScore;
  trap.wasTrapCorrect = wasTrapCorrect;
  trap.betResult = betResult;
  trap.trapAccuracy = trapAccuracy;
  trap.resolvedAt = new Date().toISOString();
  
  saveToDisk();
  
  console.log(`✅ Piège résolu: ${trap.trapType} → ${wasTrapCorrect ? 'CORRECT' : 'INCORRECT'}`);
  
  return trap;
}

/**
 * Récupère les pièges non résolus
 */
export function getPendingTraps(): TrapRecord[] {
  initStore();
  return trapHistory.filter(t => !t.resolvedAt);
}

/**
 * Récupère les pièges récents
 */
export function getRecentTraps(days: number = 30): TrapRecord[] {
  initStore();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  
  return trapHistory.filter(t => new Date(t.detectedAt) >= cutoff);
}

/**
 * Calcule les statistiques des pièges
 */
export function getTrapStats(): TrapStats {
  initStore();
  
  const resolved = trapHistory.filter(t => t.resolvedAt);
  const correct = resolved.filter(t => t.wasTrapCorrect);
  
  // Par type
  const byType: Record<string, { total: number; correct: number; accuracy: number; avgEdge: number }> = {};
  
  for (const trap of resolved) {
    if (!byType[trap.trapType]) {
      byType[trap.trapType] = { total: 0, correct: 0, accuracy: 0, avgEdge: 0 };
    }
    byType[trap.trapType].total++;
    if (trap.wasTrapCorrect) byType[trap.trapType].correct++;
  }
  
  for (const type of Object.keys(byType)) {
    byType[type].accuracy = byType[type].total > 0 
      ? Math.round((byType[type].correct / byType[type].total) * 100) 
      : 0;
  }
  
  // Par sévérité
  const bySeverity: Record<string, { total: number; correct: number; accuracy: number }> = {};
  
  for (const trap of resolved) {
    if (!bySeverity[trap.trapSeverity]) {
      bySeverity[trap.trapSeverity] = { total: 0, correct: 0, accuracy: 0 };
    }
    bySeverity[trap.trapSeverity].total++;
    if (trap.wasTrapCorrect) bySeverity[trap.trapSeverity].correct++;
  }
  
  for (const sev of Object.keys(bySeverity)) {
    bySeverity[sev].accuracy = bySeverity[sev].total > 0
      ? Math.round((bySeverity[sev].correct / bySeverity[sev].total) * 100)
      : 0;
  }
  
  // Par sport
  const bySport: Record<string, { total: number; correct: number; accuracy: number }> = {};
  
  for (const trap of resolved) {
    if (!bySport[trap.sport]) {
      bySport[trap.sport] = { total: 0, correct: 0, accuracy: 0 };
    }
    bySport[trap.sport].total++;
    if (trap.wasTrapCorrect) bySport[trap.sport].correct++;
  }
  
  for (const sport of Object.keys(bySport)) {
    bySport[sport].accuracy = bySport[sport].total > 0
      ? Math.round((bySport[sport].correct / bySport[sport].total) * 100)
      : 0;
  }
  
  // Leçons apprises
  const lessons: string[] = [];
  
  // Analyser les tendances
  if (byType.overvalued_favorite && byType.overvalued_favorite.accuracy > 60) {
    lessons.push(`💡 Les favoris surévalués sont des pièges fiables (${byType.overvalued_favorite.accuracy}% de réussite)`);
  }
  
  if (byType.tight_match && byType.tight_match.accuracy > 55) {
    lessons.push(`💡 Les matchs serrés sont difficiles à prédire - prudence recommandée`);
  }
  
  if (bySeverity.high && bySeverity.high.accuracy > 70) {
    lessons.push(`⚠️ Les pièges de haute sévérité doivent être évités dans ${bySeverity.high.accuracy}% des cas`);
  }
  
  if (bySport.Foot && bySport.Basket) {
    if (bySport.Foot.accuracy > bySport.Basket.accuracy + 10) {
      lessons.push(`⚽ Les pièges Football sont plus prévisibles que NBA`);
    } else if (bySport.Basket.accuracy > bySport.Foot.accuracy + 10) {
      lessons.push(`🏀 Les pièges NBA sont plus prévisibles que Football`);
    }
  }
  
  return {
    total: trapHistory.length,
    resolved: resolved.length,
    correctPredictions: correct.length,
    accuracy: resolved.length > 0 ? Math.round((correct.length / resolved.length) * 100) : 0,
    byType,
    bySeverity,
    bySport,
    lessons,
  };
}

/**
 * Génère des recommandations basées sur l'historique
 */
export function getRecommendationsFromHistory(): string[] {
  const stats = getTrapStats();
  const recommendations: string[] = [];
  
  if (stats.lessons.length > 0) {
    recommendations.push(...stats.lessons);
  }
  
  // Recommandations basées sur les données
  if (stats.accuracy > 60) {
    recommendations.push(`✅ Système de détection fiable (${stats.accuracy}% de précision)`);
  } else if (stats.accuracy < 40 && stats.resolved > 10) {
    recommendations.push(`⚠️ Système de détection à améliorer (${stats.accuracy}% de précision)`);
  }
  
  // Recommandations par type
  if (stats.byType.overvalued_favorite?.accuracy && stats.byType.overvalued_favorite.accuracy > 65) {
    recommendations.push(`🎯 Priorité aux détections de favoris surévalués`);
  }
  
  if (stats.byType.tight_match?.accuracy && stats.byType.tight_match.accuracy < 45) {
    recommendations.push(`❓ Matchs serrés: considérer éviter plutôt que prédire`);
  }
  
  return recommendations;
}

/**
 * Nettoie les vieux pièges (plus de 90 jours)
 */
export function cleanupOldTraps(): number {
  initStore();
  
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  
  const initialLength = trapHistory.length;
  trapHistory = trapHistory.filter(t => new Date(t.detectedAt) >= cutoff);
  
  const removed = initialLength - trapHistory.length;
  
  if (removed > 0) {
    saveToDisk();
    console.log(`🗑️ ${removed} vieux pièges supprimés`);
  }
  
  return removed;
}

// Export par défaut
const TrapHistoryStore = {
  addTrap,
  resolveTrap,
  getPendingTraps,
  getRecentTraps,
  getTrapStats,
  getRecommendationsFromHistory,
  cleanupOldTraps,
};

export default TrapHistoryStore;
