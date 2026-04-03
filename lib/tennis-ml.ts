/**
 * Tennis ML Model - Prédictions avancées pour matchs de tennis
 * 
 * Features utilisées:
 * - Classement estimé
 * - Performance sur surface
 * - Forme récente (derniers 10 matchs)
 * - H2H (tête-à-tête)
 * - Cotes des bookmakers
 * - Avantage terrain/ranking
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// INTERFACES
// ============================================

interface TennisPlayer {
  id: string;
  name: string;
  ranking: number;
  rankingPoints: number;
  surfaceStats: {
    hard: { wins: number; losses: number; winRate: number };
    clay: { wins: number; losses: number; winRate: number };
    grass: { wins: number; losses: number; winRate: number };
    carpet: { wins: number; losses: number; winRate: number };
  };
  recentForm: {
    wins: number;
    losses: number;
    winStreak: number;
    last10: ('W' | 'L')[];
  };
}

interface H2HRecord {
  player1Id: string;
  player2Id: string;
  player1Wins: number;
  player2Wins: number;
  totalMatches: number;
  surfaceBreakdown: {
    hard: { p1: number; p2: number };
    clay: { p1: number; p2: number };
    grass: { p1: number; p2: number };
  };
}

interface MatchFeatures {
  // Différences (p1 - p2)
  rankingDiff: number;
  surfaceWinRateDiff: number;
  recentFormDiff: number;
  winStreakDiff: number;
  h2hDiff: number;
  surfaceH2HDiff: number;
  
  // Ratios
  oddsRatio: number;
  impliedProbDiff: number;
  
  // Absolus
  favoriteRanking: number;
  surface: 'hard' | 'clay' | 'grass' | 'carpet';
  totalH2H: number;
}

interface PredictionResult {
  matchId: string;
  player1: string;
  player2: string;
  predictedWinner: 'player1' | 'player2';
  winProbability: number;
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  riskPercentage: number;
  recommendedBet: boolean;
  kellyStake: number;
  analysis: {
    rankingAdvantage: string;
    surfaceAdvantage: string;
    formAdvantage: string;
    h2hAdvantage: string;
    oddsValue: string;
  };
  keyFactors: string[];
  warnings: string[];
}

interface ModelMetrics {
  accuracy: number;
  totalPredictions: number;
  correctPredictions: number;
  byConfidence: {
    very_high: { total: number; correct: number };
    high: { total: number; correct: number };
    medium: { total: number; correct: number };
    low: { total: number; correct: number };
  };
  lastUpdated: string;
}

// ============================================
// CONFIGURATION
// ============================================

const DATA_DIR = path.join(process.cwd(), 'data');
const PLAYERS_FILE = path.join(DATA_DIR, 'tennis-players.json');
const MODEL_FILE = path.join(DATA_DIR, 'tennis-ml-model.json');

// Poids du modèle (initialisés, puis ajustés par l'entraînement)
let MODEL_WEIGHTS = {
  ranking: 0.25,        // Impact du classement
  surface: 0.20,        // Performance sur surface
  form: 0.20,           // Forme récente
  h2h: 0.15,            // Historique tête-à-tête
  odds: 0.20            // Cotes des bookmakers
};

// ============================================
// CHARGEMENT DONNÉES
// ============================================

function loadPlayerDatabase(): { players: Map<string, TennisPlayer>; h2h: Map<string, H2HRecord> } {
  const players = new Map<string, TennisPlayer>();
  const h2h = new Map<string, H2HRecord>();
  
  try {
    if (fs.existsSync(PLAYERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf-8'));
      
      for (const [id, player] of Object.entries(data.players || {})) {
        players.set(id, player as TennisPlayer);
      }
      
      for (const [key, record] of Object.entries(data.h2h || {})) {
        h2h.set(key, record as H2HRecord);
      }
      
      console.log(`📊 ${players.size} joueurs et ${h2h.size} H2H chargés`);
    }
  } catch (error) {
    console.error('Erreur chargement base joueurs:', error);
  }
  
  return { players, h2h };
}

function loadModelMetrics(): ModelMetrics {
  try {
    if (fs.existsSync(MODEL_FILE)) {
      return JSON.parse(fs.readFileSync(MODEL_FILE, 'utf-8'));
    }
  } catch (error) {
    console.log('Nouveau modèle tennis');
  }
  
  return {
    accuracy: 0,
    totalPredictions: 0,
    correctPredictions: 0,
    byConfidence: {
      very_high: { total: 0, correct: 0 },
      high: { total: 0, correct: 0 },
      medium: { total: 0, correct: 0 },
      low: { total: 0, correct: 0 }
    },
    lastUpdated: new Date().toISOString()
  };
}

// ============================================
// EXTRACTION FEATURES
// ============================================

function extractFeatures(
  p1: TennisPlayer,
  p2: TennisPlayer,
  h2h: H2HRecord | undefined,
  odds1: number,
  odds2: number,
  surface: 'hard' | 'clay' | 'grass' | 'carpet'
): MatchFeatures {
  
  // Différence de classement (négatif = p1 mieux classé)
  const rankingDiff = p1.ranking - p2.ranking;
  
  // Performance sur la surface du match
  const p1SurfaceWinRate = p1.surfaceStats[surface]?.winRate || 50;
  const p2SurfaceWinRate = p2.surfaceStats[surface]?.winRate || 50;
  const surfaceWinRateDiff = p1SurfaceWinRate - p2SurfaceWinRate;
  
  // Forme récente (derniers 10 matchs)
  const p1FormRate = p1.recentForm.last10.filter(r => r === 'W').length / 10;
  const p2FormRate = p2.recentForm.last10.filter(r => r === 'W').length / 10;
  const recentFormDiff = (p1FormRate - p2FormRate) * 100;
  
  // Série de victoires
  const winStreakDiff = p1.recentForm.winStreak - p2.recentForm.winStreak;
  
  // H2H global
  let h2hDiff = 0;
  let surfaceH2HDiff = 0;
  let totalH2H = 0;
  
  if (h2h) {
    // Normaliser selon qui est player1 dans le record
    const isP1First = h2h.player1Id === p1.id;
    if (isP1First) {
      h2hDiff = h2h.player1Wins - h2h.player2Wins;
      totalH2H = h2h.totalMatches;
      if (surface in h2h.surfaceBreakdown) {
        surfaceH2HDiff = h2h.surfaceBreakdown[surface as keyof typeof h2h.surfaceBreakdown].p1 - 
                         h2h.surfaceBreakdown[surface as keyof typeof h2h.surfaceBreakdown].p2;
      }
    } else {
      h2hDiff = h2h.player2Wins - h2h.player1Wins;
      totalH2H = h2h.totalMatches;
      if (surface in h2h.surfaceBreakdown) {
        surfaceH2HDiff = h2h.surfaceBreakdown[surface as keyof typeof h2h.surfaceBreakdown].p2 - 
                         h2h.surfaceBreakdown[surface as keyof typeof h2h.surfaceBreakdown].p1;
      }
    }
  }
  
  // Cotes
  const oddsRatio = odds2 / odds1; // > 1 si p1 favori
  const p1Implied = 1 / odds1;
  const p2Implied = 1 / odds2;
  const impliedProbDiff = (p1Implied - p2Implied) * 100;
  
  // Rang du favori
  const favoriteRanking = Math.min(p1.ranking, p2.ranking);
  
  return {
    rankingDiff,
    surfaceWinRateDiff,
    recentFormDiff,
    winStreakDiff,
    h2hDiff,
    surfaceH2HDiff,
    oddsRatio,
    impliedProbDiff,
    favoriteRanking,
    surface,
    totalH2H
  };
}

// ============================================
// PRÉDICTION
// ============================================

function predict(
  features: MatchFeatures,
  odds1: number,
  odds2: number
): { 
  winner: 'player1' | 'player2'; 
  probability: number;
  rawScore: number;
} {
  
  // Score de base pour player1
  let score = 0;
  
  // 1. Avantage classement (normalisé)
  // Ranking diff négatif = p1 mieux classé = avantage
  const rankingScore = -features.rankingDiff / 100; // Normalisé autour de 0
  score += rankingScore * MODEL_WEIGHTS.ranking * 100;
  
  // 2. Avantage surface
  score += features.surfaceWinRateDiff * MODEL_WEIGHTS.surface;
  
  // 3. Avantage forme
  score += features.recentFormDiff * MODEL_WEIGHTS.form;
  
  // 4. Avantage H2H
  if (features.totalH2H > 0) {
    // Pondérer par le nombre de matchs H2H (plus de matchs = plus fiable)
    const h2hWeight = Math.min(features.totalH2H / 5, 1); // Max à 5 matchs
    score += (features.h2hDiff + features.surfaceH2HDiff) * h2hWeight * MODEL_WEIGHTS.h2h * 10;
  }
  
  // 5. Cotes des bookmakers
  score += features.impliedProbDiff * MODEL_WEIGHTS.odds;
  
  // Convertir en probabilité avec sigmoïde
  const rawProbability = 1 / (1 + Math.exp(-score / 50));
  
  // Ajuster avec les cotes implicites
  const oddsImpliedP1 = 1 / odds1;
  const oddsImpliedP2 = 1 / odds2;
  
  // Moyenne pondérée: 70% notre modèle, 30% cotes
  const finalProbability = rawProbability * 0.7 + oddsImpliedP1 * 0.3;
  
  return {
    winner: finalProbability >= 0.5 ? 'player1' : 'player2',
    probability: finalProbability >= 0.5 ? finalProbability : 1 - finalProbability,
    rawScore: score
  };
}

// ============================================
// CALCUL CONFIANCE
// ============================================

function calculateConfidence(
  probability: number,
  features: MatchFeatures,
  hasH2H: boolean
): { confidence: 'very_high' | 'high' | 'medium' | 'low'; risk: number } {
  
  let confidenceScore = 0;
  
  // 1. Force de la prédiction (écart de probabilité)
  const probStrength = Math.abs(probability - 0.5) * 2; // 0 à 1
  confidenceScore += probStrength * 40;
  
  // 2. Qualité des données
  if (features.totalH2H >= 3) confidenceScore += 10;
  if (features.favoriteRanking < 20) confidenceScore += 10;
  
  // 3. Convergence des signaux
  const signals = [
    features.rankingDiff < -20,  // P1 mieux classé
    features.surfaceWinRateDiff > 10,
    features.recentFormDiff > 20,
    features.impliedProbDiff > 10
  ];
  const convergingSignals = signals.filter(Boolean).length;
  confidenceScore += convergingSignals * 10;
  
  // Déterminer niveau
  if (confidenceScore >= 70) {
    return { confidence: 'very_high', risk: 15 };
  } else if (confidenceScore >= 50) {
    return { confidence: 'high', risk: 25 };
  } else if (confidenceScore >= 30) {
    return { confidence: 'medium', risk: 40 };
  } else {
    return { confidence: 'low', risk: 50 };
  }
}

// ============================================
// CALCUL KELLY
// ============================================

function calculateKellyStake(
  winProbability: number,
  odds: number,
  confidence: string
): number {
  // Critère de Kelly: f = (bp - q) / b
  // b = odds - 1, p = prob, q = 1 - p
  const b = odds - 1;
  const p = winProbability;
  const q = 1 - p;
  
  let kelly = (b * p - q) / b;
  
  // Kelly fractionné selon confiance
  const fractions: Record<string, number> = {
    very_high: 0.25,
    high: 0.20,
    medium: 0.10,
    low: 0.05
  };
  
  kelly *= fractions[confidence] || 0.10;
  
  // Limiter à 5% max
  return Math.max(0, Math.min(kelly * 100, 5));
}

// ============================================
// ANALYSE COMPLÈTE
// ============================================

function generateAnalysis(
  p1: TennisPlayer,
  p2: TennisPlayer,
  features: MatchFeatures,
  prediction: { winner: string; probability: number },
  h2h: H2HRecord | undefined,
  odds1: number,
  odds2: number
): PredictionResult['analysis'] {
  
  const formatPlayer = (p: TennisPlayer) => `${p.name} (#${p.ranking})`;
  
  // Avantage classement
  let rankingAdvantage = 'Équilibré';
  if (Math.abs(features.rankingDiff) > 50) {
    rankingAdvantage = features.rankingDiff < 0 
      ? `${p1.name} largement mieux classé`
      : `${p2.name} largement mieux classé`;
  } else if (Math.abs(features.rankingDiff) > 20) {
    rankingAdvantage = features.rankingDiff < 0 
      ? `${p1.name} mieux classé`
      : `${p2.name} mieux classé`;
  }
  
  // Avantage surface
  let surfaceAdvantage = 'Équilibré';
  const surfaceRate = features.surfaceWinRateDiff;
  if (Math.abs(surfaceRate) > 15) {
    surfaceAdvantage = surfaceRate > 0 
      ? `${p1.name} plus performant sur ${features.surface}`
      : `${p2.name} plus performant sur ${features.surface}`;
  }
  
  // Avantage forme
  let formAdvantage = 'Équilibré';
  if (Math.abs(features.recentFormDiff) > 30) {
    formAdvantage = features.recentFormDiff > 0 
      ? `${p1.name} en meilleure forme`
      : `${p2.name} en meilleure forme`;
  }
  
  // Avantage H2H
  let h2hAdvantage = 'Pas d\'historique';
  if (h2h && h2h.totalMatches > 0) {
    const p1Wins = h2h.player1Id === p1.id ? h2h.player1Wins : h2h.player2Wins;
    const p2Wins = h2h.player1Id === p1.id ? h2h.player2Wins : h2h.player1Wins;
    if (p1Wins > p2Wins) {
      h2hAdvantage = `${p1.name} mène ${p1Wins}-${p2Wins}`;
    } else if (p2Wins > p1Wins) {
      h2hAdvantage = `${p2.name} mène ${p2Wins}-${p1Wins}`;
    } else {
      h2hAdvantage = `Égalité ${p1Wins}-${p2Wins}`;
    }
  }
  
  // Valeur des cotes
  const impliedP1 = (1 / odds1) * 100;
  const ourProbP1 = prediction.winner === 'player1' ? prediction.probability : 1 - prediction.probability;
  const value = ourProbP1 - impliedP1;
  
  let oddsValue = 'Cotes justes';
  if (value > 5) {
    oddsValue = `Value bet sur ${p1.name} (+${value.toFixed(1)}%)`;
  } else if (value < -5) {
    oddsValue = `Value bet sur ${p2.name} (+${Math.abs(value).toFixed(1)}%)`;
  }
  
  return {
    rankingAdvantage,
    surfaceAdvantage,
    formAdvantage,
    h2hAdvantage,
    oddsValue
  };
}

// ============================================
// API PRINCIPALE
// ============================================

export async function predictTennisMatch(
  player1Name: string,
  player2Name: string,
  odds1: number,
  odds2: number,
  surface: 'hard' | 'clay' | 'grass' | 'carpet',
  tournament: string
): Promise<PredictionResult> {
  
  const { players, h2h: h2hMap } = loadPlayerDatabase();
  
  // Trouver les joueurs (fuzzy match)
  const p1Id = findPlayerId(player1Name, players);
  const p2Id = findPlayerId(player2Name, players);
  
  const p1 = players.get(p1Id) || createDefaultPlayer(player1Name);
  const p2 = players.get(p2Id) || createDefaultPlayer(player2Name);
  
  // Trouver H2H
  const h2hKey1 = `${p1.id}_vs_${p2.id}`;
  const h2hKey2 = `${p2.id}_vs_${p1.id}`;
  const h2h = h2hMap.get(h2hKey1) || h2hMap.get(h2hKey2);
  
  // Extraire features
  const features = extractFeatures(p1, p2, h2h, odds1, odds2, surface);
  
  // Prédiction
  const prediction = predict(features, odds1, odds2);
  
  // Confiance
  const { confidence, risk } = calculateConfidence(prediction.probability, features, !!h2h);
  
  // Kelly
  const winnerOdds = prediction.winner === 'player1' ? odds1 : odds2;
  const kellyStake = calculateKellyStake(prediction.probability, winnerOdds, confidence);
  
  // Analyse
  const analysis = generateAnalysis(p1, p2, features, prediction, h2h, odds1, odds2);
  
  // Facteurs clés
  const keyFactors: string[] = [];
  if (features.rankingDiff < -30) keyFactors.push(`Différence classement: ${Math.abs(features.rankingDiff)} places`);
  if (Math.abs(features.surfaceWinRateDiff) > 15) keyFactors.push(`Écart performance surface: ${Math.abs(features.surfaceWinRateDiff).toFixed(0)}%`);
  if (features.winStreakDiff > 2) keyFactors.push(`Série de victoires en cours`);
  if (features.totalH2H >= 3) keyFactors.push(`H2H: ${features.totalH2H} rencontres`);
  
  // Avertissements
  const warnings: string[] = [];
  if (!players.has(p1Id)) warnings.push(`${player1Name}: pas de données historiques`);
  if (!players.has(p2Id)) warnings.push(`${player2Name}: pas de données historiques`);
  if (!h2h) warnings.push('Pas de H2H disponible');
  if (features.favoriteRanking > 50) warnings.push('Aucun joueur bien classé');
  
  return {
    matchId: `tennis_${Date.now()}`,
    player1: player1Name,
    player2: player2Name,
    predictedWinner: prediction.winner,
    winProbability: prediction.probability,
    confidence,
    riskPercentage: risk,
    recommendedBet: kellyStake >= 0.5 && confidence !== 'low',
    kellyStake,
    analysis,
    keyFactors,
    warnings
  };
}

function findPlayerId(name: string, players: Map<string, TennisPlayer>): string {
  const normalized = name.toLowerCase().replace(/[^a-z]/g, '');
  
  for (const [id, player] of players) {
    const playerNormalized = player.name.toLowerCase().replace(/[^a-z]/g, '');
    if (playerNormalized.includes(normalized) || normalized.includes(playerNormalized)) {
      return id;
    }
  }
  
  return `player_${normalized}`;
}

function createDefaultPlayer(name: string): TennisPlayer {
  return {
    id: `player_${name.toLowerCase().replace(/[^a-z]/g, '')}`,
    name,
    ranking: 500,
    rankingPoints: 0,
    surfaceStats: {
      hard: { wins: 0, losses: 0, winRate: 50 },
      clay: { wins: 0, losses: 0, winRate: 50 },
      grass: { wins: 0, losses: 0, winRate: 50 },
      carpet: { wins: 0, losses: 0, winRate: 50 }
    },
    recentForm: {
      wins: 0,
      losses: 0,
      winStreak: 0,
      last10: []
    }
  };
}

// ============================================
// ENTRAÎNEMENT
// ============================================

export async function trainTennisModel(): Promise<ModelMetrics> {
  const metrics = loadModelMetrics();
  
  // TODO: Implémenter l'entraînement avec les résultats vérifiés
  // Pour l'instant, on utilise les poids par défaut
  
  metrics.lastUpdated = new Date().toISOString();
  
  fs.writeFileSync(MODEL_FILE, JSON.stringify(metrics, null, 2));
  
  return metrics;
}

// Export pour utilisation dans les scripts
export { loadPlayerDatabase, extractFeatures, predict, calculateConfidence };
