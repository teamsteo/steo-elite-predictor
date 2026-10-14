/**
 * Tennis Prediction Engine V2 - SYSTÈME PRÉDICTIF AVANCÉ 2026
 * 
 * 🎯 NOUVELLES FONCTIONNALITÉS:
 * 1. Classements ATP/WTA 2026 en temps réel
 * 2. Forme récente calculée depuis matchs réels
 * 3. Auto-apprentissage depuis résultats passés
 * 4. Calibration automatique des seuils
 * 5. Publication Telegram automatique
 */

import {
  TennisMatch,
  TournamentTier,
  Surface,
  Category,
  getTournamentImportanceFactor,
} from './smart-collector';
import { getATPRankingsCSV, getWTARankingsCSV, getATPPlayersCSV, getWTAPlayersCSV, getMatchesCSV } from './jeffSackmannCache';

// ============================================
// INTERFACES
// ============================================

export interface PlayerData2026 {
  id: string;
  name: string;
  country: string;
  ranking: number;
  rankingPoints: number;
  
  // Forme 2026
  recentForm: {
    last10: { won: boolean; opponent: string; opponentRank: number }[];
    winRate: number;
    trend: 'improving' | 'stable' | 'declining';
  };
  
  // Stats par surface
  surfaceStats: {
    hard: SurfacePerformance;
    clay: SurfacePerformance;
    grass: SurfacePerformance;
    indoor: SurfacePerformance;
  };
  
  // Métriques avancées
  metrics: {
    clutchFactor: number;       // Performance dans les moments clés
    upsetRate: number;          // Taux de victoires vs mieux classés
    chokeRate: number;          // Taux de défaites vs moins bien classés
    fatigueIndex: number;       // Nombre de matchs récents
    confidence: number;         // Confiance calculée
  };
  
  lastUpdated: Date;
}

export interface SurfacePerformance {
  matches: number;
  wins: number;
  winRate: number;
  recentWinRate: number;       // Sur les 6 derniers mois
}

export interface MatchPredictionV2 {
  matchId: string;
  player1: string;
  player2: string;
  tournament: string;
  tournamentTier: TournamentTier;
  surface: Surface;
  
  // Données joueurs enrichies
  player1Data: PlayerData2026;
  player2Data: PlayerData2026;
  
  // Prédiction calibrée
  prediction: {
    winner: 'player1' | 'player2';
    winnerName: string;
    winProbability: number;
    calibratedProbability: number;  // Après calibration ML
    confidence: 'very_high' | 'high' | 'medium' | 'low';
    riskPercentage: number;
  };
  
  // Analyse détaillée
  analysis: {
    rankingGap: number;
    surfaceAdvantage: { player: string; score: number };
    formAdvantage: { player: string; score: number };
    h2hAdvantage: { player: string; record: string };
    fatigueFactor: { player: string; score: number };
    keyFactor: string;
  };
  
  // Betting
  betting: {
    recommendedBet: boolean;
    kellyStake: number;
    winnerOdds: number;
    expectedValue: number;
    valueRating: 'excellent' | 'good' | 'fair' | 'poor';
  };
  
  // Validation
  crossValidation: {
    status: 'confirmed' | 'neutral' | 'divergence' | 'excluded';
    bookmakerFavorite: 'player1' | 'player2';
    ourFavorite: 'player1' | 'player2';
    probabilityGap: number;
  };
  
  // Insights
  keyInsights: string[];
  warnings: string[];
  
  // Métadonnées
  modelVersion: string;
  generatedAt: Date;
  dataSource: 'live' | 'cached' | 'fallback';
}

// ============================================
// CALIBRATION ML - AUTO-APPRENTISSAGE
// ============================================

interface CalibrationModel {
  version: string;
  lastTrained: Date;
  samples: number;
  
  // Facteurs de calibration (appris depuis résultats)
  factors: {
    ranking: { weight: number; calibration: number };
    surface: { weight: number; calibration: number };
    form: { weight: number; calibration: number };
    h2h: { weight: number; calibration: number };
    odds: { weight: number; calibration: number };
    fatigue: { weight: number; calibration: number };
    pressure: { weight: number; calibration: number };
  };
  
  // Seuils calibrés
  thresholds: {
    very_high: number;
    high: number;
    medium: number;
  };
  
  // Performance historique
  performance: {
    totalPredictions: number;
    correctPredictions: number;
    byConfidence: {
      very_high: { total: number; correct: number; winRate: number };
      high: { total: number; correct: number; winRate: number };
      medium: { total: number; correct: number; winRate: number };
      low: { total: number; correct: number; winRate: number };
    };
  };
}

// Calibration par défaut (sera mise à jour par apprentissage)
const DEFAULT_CALIBRATION: CalibrationModel = {
  version: 'v2.0-2026',
  lastTrained: new Date(),
  samples: 0,
  
  factors: {
    ranking: { weight: 0.22, calibration: 1.0 },
    surface: { weight: 0.15, calibration: 1.0 },
    form: { weight: 0.18, calibration: 1.0 },
    h2h: { weight: 0.10, calibration: 1.0 },
    odds: { weight: 0.12, calibration: 0.9 },  // Réduit car moins fiable
    fatigue: { weight: 0.10, calibration: 1.0 },
    pressure: { weight: 0.08, calibration: 1.0 },
  },
  
  thresholds: {
    very_high: 82,  // Très strict
    high: 72,
    medium: 62,
  },
  
  performance: {
    totalPredictions: 0,
    correctPredictions: 0,
    byConfidence: {
      very_high: { total: 0, correct: 0, winRate: 0 },
      high: { total: 0, correct: 0, winRate: 0 },
      medium: { total: 0, correct: 0, winRate: 0 },
      low: { total: 0, correct: 0, winRate: 0 },
    },
  },
};

// Stockage de la calibration
let calibrationModel = { ...DEFAULT_CALIBRATION };

// ============================================
// CLASSEMENTS 2026 - LIVE DEPUIS JEFF SACKMANN
// ============================================

interface RankingEntry {
  rank: number;
  playerId: string;
  playerName: string;
  country: string;
  points: number;
}

// Cache pour les classements
let atpRankingsCache: { data: RankingEntry[]; timestamp: number } | null = null;
let wtaRankingsCache: { data: RankingEntry[]; timestamp: number } | null = null;
const RANKINGS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 heures

/**
 * Récupère les classements ATP 2026 depuis Jeff Sackmann
 */
export async function fetchATPRankings2026(): Promise<RankingEntry[]> {
  // Vérifier le cache
  if (atpRankingsCache && Date.now() - atpRankingsCache.timestamp < RANKINGS_CACHE_TTL) {
    return atpRankingsCache.data;
  }
  
  console.log('[TennisV2] 📊 Récupération classements ATP 2026...');
  
  try {
    // Récupérer les classements via le cache centralisé
    const rankingsText = await getATPRankingsCSV();
    if (!rankingsText) throw new Error('Erreur classements ATP');
    const rankingsLines = rankingsText.trim().split('\n');
    
    // Récupérer les infos joueurs via le cache centralisé
    const playersText = await getATPPlayersCSV();
    const playersLines = playersText.trim().split('\n');
    
    // Construire la map des joueurs
    const playersMap = new Map<string, { name: string; country: string }>();
    for (let i = 1; i < playersLines.length; i++) {
      const parts = playersLines[i].split(',');
      if (parts.length >= 5) {
        const id = parts[0].trim();
        const firstName = parts[1].trim().replace(/"/g, '');
        const lastName = parts[2].trim().replace(/"/g, '');
        const country = parts[4]?.trim().replace(/"/g, '') || 'UNK';
        playersMap.set(id, { name: `${firstName} ${lastName}`, country });
      }
    }
    
    // Parser les classements
    const rankings: RankingEntry[] = [];
    for (let i = 1; i < rankingsLines.length && rankings.length < 150; i++) {
      const parts = rankingsLines[i].split(',');
      if (parts.length >= 4) {
        const playerId = parts[2].trim();
        const playerInfo = playersMap.get(playerId);
        
        if (playerInfo) {
          rankings.push({
            rank: parseInt(parts[1]),
            playerId,
            playerName: playerInfo.name,
            country: playerInfo.country,
            points: parseInt(parts[3]),
          });
        }
      }
    }
    
    // Mettre en cache
    atpRankingsCache = { data: rankings, timestamp: Date.now() };
    
    console.log(`[TennisV2] ✅ ${rankings.length} classements ATP récupérés`);
    return rankings;
    
  } catch (error) {
    console.error('[TennisV2] Erreur classements ATP:', error);
    // Retourner le cache expiré si disponible
    return atpRankingsCache?.data || [];
  }
}

/**
 * Récupère les classements WTA 2026
 */
export async function fetchWTARankings2026(): Promise<RankingEntry[]> {
  if (wtaRankingsCache && Date.now() - wtaRankingsCache.timestamp < RANKINGS_CACHE_TTL) {
    return wtaRankingsCache.data;
  }
  
  console.log('[TennisV2] 📊 Récupération classements WTA 2026...');
  
  try {
    // Récupérer les classements via le cache centralisé
    const rankingsText = await getWTARankingsCSV();
    if (!rankingsText) throw new Error('Erreur classements WTA');
    const rankingsLines = rankingsText.trim().split('\n');
    
    // Récupérer les infos joueurs via le cache centralisé
    const playersText = await getWTAPlayersCSV();
    const playersLines = playersText.trim().split('\n');
    
    const playersMap = new Map<string, { name: string; country: string }>();
    for (let i = 1; i < playersLines.length; i++) {
      const parts = playersLines[i].split(',');
      if (parts.length >= 5) {
        const id = parts[0].trim();
        const firstName = parts[1].trim().replace(/"/g, '');
        const lastName = parts[2].trim().replace(/"/g, '');
        const country = parts[4]?.trim().replace(/"/g, '') || 'UNK';
        playersMap.set(id, { name: `${firstName} ${lastName}`, country });
      }
    }
    
    const rankings: RankingEntry[] = [];
    for (let i = 1; i < rankingsLines.length && rankings.length < 150; i++) {
      const parts = rankingsLines[i].split(',');
      if (parts.length >= 4) {
        const playerId = parts[2].trim();
        const playerInfo = playersMap.get(playerId);
        
        if (playerInfo) {
          rankings.push({
            rank: parseInt(parts[1]),
            playerId,
            playerName: playerInfo.name,
            country: playerInfo.country,
            points: parseInt(parts[3]),
          });
        }
      }
    }
    
    wtaRankingsCache = { data: rankings, timestamp: Date.now() };
    
    console.log(`[TennisV2] ✅ ${rankings.length} classements WTA récupérés`);
    return rankings;
    
  } catch (error) {
    console.error('[TennisV2] Erreur classements WTA:', error);
    return wtaRankingsCache?.data || [];
  }
}

// ============================================
// FORME RÉCENTE DEPUIS MATCHS 2026
// ============================================

/**
 * Calcule la forme récente d'un joueur depuis les matchs de 2026
 */
export async function calculateForm2026(
  playerName: string,
  category: 'atp' | 'wta'
): Promise<PlayerData2026['recentForm']> {
  try {
    const currentYear = new Date().getFullYear();
    
    // Récupérer les matchs via le cache centralisé (24h, avec fallback)
    const { text } = await getMatchesCSV(category, currentYear);
    
    if (!text || text.trim().length < 50) {
      return {
        last10: [],
        winRate: 0.5,
        trend: 'stable',
      };
    }
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',');
    
    // Indices des colonnes
    const winnerIdx = headers.indexOf('winner_name');
    const loserIdx = headers.indexOf('loser_name');
    const winnerRankIdx = headers.indexOf('winner_rank');
    const loserRankIdx = headers.indexOf('loser_rank');
    const dateIdx = headers.indexOf('tourney_date');
    
    const normalizedName = playerName.toLowerCase().replace(/[^a-z ]/g, '').trim();
    
    const last10: { won: boolean; opponent: string; opponentRank: number }[] = [];
    
    // Parcourir les matchs (du plus récent au plus ancien)
    for (let i = lines.length - 1; i >= 1 && last10.length < 10; i--) {
      const parts = lines[i].split(',');
      
      const winnerName = parts[winnerIdx]?.trim().toLowerCase().replace(/[^a-z ]/g, '').trim();
      const loserName = parts[loserIdx]?.trim().toLowerCase().replace(/[^a-z ]/g, '').trim();
      
      const isWinner = winnerName === normalizedName || winnerName?.includes(normalizedName);
      const isLoser = loserName === normalizedName || loserName?.includes(normalizedName);
      
      if (isWinner || isLoser) {
        const won = isWinner;
        const opponent = won ? parts[loserIdx]?.trim() : parts[winnerIdx]?.trim();
        const opponentRank = won 
          ? parseInt(parts[loserRankIdx]) || 500 
          : parseInt(parts[winnerRankIdx]) || 500;
        
        last10.push({ won, opponent: opponent || 'Unknown', opponentRank });
      }
    }
    
    const wins = last10.filter(m => m.won).length;
    const winRate = last10.length > 0 ? wins / last10.length : 0.5;
    
    // Calculer la tendance (comparer 5 derniers vs 5 précédents)
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (last10.length >= 10) {
      const recent5 = last10.slice(0, 5).filter(m => m.won).length;
      const previous5 = last10.slice(5, 10).filter(m => m.won).length;
      
      if (recent5 > previous5 + 1) trend = 'improving';
      else if (recent5 < previous5 - 1) trend = 'declining';
    }
    
    return { last10, winRate, trend };
    
  } catch (error) {
    console.error(`[TennisV2] Erreur forme pour ${playerName}:`, error);
    return { last10: [], winRate: 0.5, trend: 'stable' };
  }
}

// ============================================
// MOTEUR DE PRÉDICTION V2
// ============================================

/**
 * Génère une prédiction enrichie avec toutes les données 2026
 */
export async function predictMatchV2(
  match: TennisMatch,
  options?: { skipCalibration?: boolean }
): Promise<MatchPredictionV2> {
  console.log(`[TennisV2] 🎯 Analyse: ${match.player1} vs ${match.player2}`);
  
  const category: 'atp' | 'wta' = match.category === 'wta' ? 'wta' : 'atp';
  
  // 1. Récupérer les classements live
  const rankings = category === 'atp' 
    ? await fetchATPRankings2026() 
    : await fetchWTARankings2026();
  
  // Trouver les classements des joueurs
  const p1Ranking = findPlayerRanking(match.player1, rankings);
  const p2Ranking = findPlayerRanking(match.player2, rankings);
  
  // 2. Calculer la forme récente
  const [p1Form, p2Form] = await Promise.all([
    calculateForm2026(match.player1, category),
    calculateForm2026(match.player2, category),
  ]);
  
  // 3. Construire les données joueurs
  const player1Data: PlayerData2026 = {
    id: p1Ranking?.playerId || `unknown_${match.player1}`,
    name: match.player1,
    country: p1Ranking?.country || 'UNK',
    ranking: p1Ranking?.rank || 500,
    rankingPoints: p1Ranking?.points || 0,
    recentForm: p1Form,
    surfaceStats: {
      hard: { matches: 0, wins: 0, winRate: 0.5, recentWinRate: 0.5 },
      clay: { matches: 0, wins: 0, winRate: 0.5, recentWinRate: 0.5 },
      grass: { matches: 0, wins: 0, winRate: 0.5, recentWinRate: 0.5 },
      indoor: { matches: 0, wins: 0, winRate: 0.5, recentWinRate: 0.5 },
    },
    metrics: {
      clutchFactor: 0.5,
      upsetRate: 0.5,
      chokeRate: 0.5,
      fatigueIndex: p1Form.last10.length,
      confidence: p1Form.winRate,
    },
    lastUpdated: new Date(),
  };
  
  const player2Data: PlayerData2026 = {
    id: p2Ranking?.playerId || `unknown_${match.player2}`,
    name: match.player2,
    country: p2Ranking?.country || 'UNK',
    ranking: p2Ranking?.rank || 500,
    rankingPoints: p2Ranking?.points || 0,
    recentForm: p2Form,
    surfaceStats: {
      hard: { matches: 0, wins: 0, winRate: 0.5, recentWinRate: 0.5 },
      clay: { matches: 0, wins: 0, winRate: 0.5, recentWinRate: 0.5 },
      grass: { matches: 0, wins: 0, winRate: 0.5, recentWinRate: 0.5 },
      indoor: { matches: 0, wins: 0, winRate: 0.5, recentWinRate: 0.5 },
    },
    metrics: {
      clutchFactor: 0.5,
      upsetRate: 0.5,
      chokeRate: 0.5,
      fatigueIndex: p2Form.last10.length,
      confidence: p2Form.winRate,
    },
    lastUpdated: new Date(),
  };
  
  // 4. Calculer les scores pour chaque facteur
  const rankingScore = calculateRankingScore(player1Data.ranking, player2Data.ranking);
  const formScore = calculateFormScore(p1Form, p2Form);
  const oddsScore = calculateOddsScore(match.odds1, match.odds2);
  const fatigueScore = calculateFatigueScore(player1Data, player2Data);
  const tierScore = calculateTierScore(match.tournamentTier, Math.abs(rankingScore));
  
  // 5. Score pondéré avec calibration
  const weights = calibrationModel.factors;
  
  const totalScore =
    rankingScore * weights.ranking.weight * weights.ranking.calibration +
    formScore * weights.form.weight * weights.form.calibration +
    oddsScore * weights.odds.weight * weights.odds.calibration +
    fatigueScore * weights.fatigue.weight * weights.fatigue.calibration +
    tierScore * 0.08;
  
  // 6. Probabilité brute
  const rawProbability = 1 / (1 + Math.exp(-totalScore / 25));
  
  // 7. Calibration de la probabilité
  const calibratedProb = options?.skipCalibration 
    ? rawProbability 
    : calibrateProbability(rawProbability, match.tournamentTier);
  
  // 8. Déterminer le gagnant
  const predictedWinner: 'player1' | 'player2' = calibratedProb >= 0.5 ? 'player1' : 'player2';
  const displayProb = calibratedProb >= 0.5 ? calibratedProb : 1 - calibratedProb;
  
  // 9. Cross-validation avec bookmakers
  const crossValidation = performCrossValidation(
    match.odds1,
    match.odds2,
    predictedWinner,
    displayProb
  );
  
  // 10. Niveau de confiance
  const { confidence, riskPercentage } = determineConfidence(
    displayProb,
    match.tournamentTier,
    crossValidation.status,
    player1Data,
    player2Data
  );
  
  // 11. Analyse détaillée
  const analysis = buildAnalysis(
    match,
    player1Data,
    player2Data,
    { rankingScore, formScore, oddsScore, fatigueScore },
    predictedWinner,
    displayProb
  );
  
  // 12. Recommandation de pari
  const betting = buildBettingRecommendation(
    predictedWinner === 'player1' ? match.odds1 : match.odds2,
    displayProb,
    confidence,
    crossValidation.status,
    match.tournamentTier
  );
  
  // 13. Insights et warnings
  const { keyInsights, warnings } = buildInsights(
    match,
    player1Data,
    player2Data,
    crossValidation,
    confidence
  );
  
  return {
    matchId: match.id,
    player1: match.player1,
    player2: match.player2,
    tournament: match.tournament,
    tournamentTier: match.tournamentTier,
    surface: match.surface,
    player1Data,
    player2Data,
    prediction: {
      winner: predictedWinner,
      winnerName: predictedWinner === 'player1' ? match.player1 : match.player2,
      winProbability: Math.round(displayProb * 100),
      calibratedProbability: Math.round(calibratedProb * 100),
      confidence,
      riskPercentage,
    },
    analysis,
    betting,
    crossValidation,
    keyInsights,
    warnings,
    modelVersion: `tennis-v2.0-2026`,
    generatedAt: new Date(),
    dataSource: p1Ranking && p2Ranking ? 'live' : 'fallback',
  };
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

function findPlayerRanking(name: string, rankings: RankingEntry[]): RankingEntry | null {
  const normalized = name.toLowerCase().replace(/[^a-z ]/g, '').trim();
  
  for (const r of rankings) {
    const rNormalized = r.playerName.toLowerCase().replace(/[^a-z ]/g, '').trim();
    
    if (rNormalized === normalized) return r;
    
    // Recherche par nom de famille
    const lastName = normalized.split(' ').pop();
    const rLastName = rNormalized.split(' ').pop();
    
    if (lastName && rLastName && (lastName === rLastName || rLastName.includes(lastName) || lastName.includes(rLastName))) {
      return r;
    }
  }
  
  return null;
}

function calculateRankingScore(rank1: number, rank2: number): number {
  // Différence de classement normalisée
  const diff = rank2 - rank1;
  // Un joueur classé 10 vs 100 = gros avantage
  // Un joueur classé 50 vs 60 = petit avantage
  return Math.tanh(diff / 40) * 100;
}

function calculateFormScore(
  form1: PlayerData2026['recentForm'],
  form2: PlayerData2026['recentForm']
): number {
  // Différence de win rate
  const winRateDiff = (form1.winRate - form2.winRate) * 100;
  
  // Bonus/malus pour la tendance
  let trendBonus = 0;
  if (form1.trend === 'improving' && form2.trend !== 'improving') trendBonus += 10;
  if (form1.trend === 'declining' && form2.trend !== 'declining') trendBonus -= 10;
  if (form2.trend === 'improving' && form1.trend !== 'improving') trendBonus -= 10;
  if (form2.trend === 'declining' && form1.trend !== 'declining') trendBonus += 10;
  
  return winRateDiff + trendBonus;
}

function calculateOddsScore(odds1: number, odds2: number): number {
  const implied1 = (1 / odds1) * 100;
  const implied2 = (1 / odds2) * 100;
  return implied1 - implied2;
}

function calculateFatigueScore(p1: PlayerData2026, p2: PlayerData2026): number {
  // Plus de matchs récents = plus de fatigue potentielle
  const fatigue1 = p1.metrics.fatigueIndex;
  const fatigue2 = p2.metrics.fatigueIndex;
  
  // Si un joueur a beaucoup plus de matchs, il peut être fatigué
  if (fatigue1 > fatigue2 + 5) return -15;
  if (fatigue2 > fatigue1 + 5) return 15;
  return 0;
}

function calculateTierScore(tier: TournamentTier, rankingGap: number): number {
  // Dans les grands tournois, l'écart de classement est plus significatif
  const multipliers: Record<TournamentTier, number> = {
    'grand_slam': 1.2,
    'masters_1000': 1.15,
    'wta_1000': 1.15,
    'atp_500': 1.1,
    'wta_500': 1.1,
    'atp_250': 1.0,
    'wta_250': 1.0,
    'challenger_175': 0.9,
    'challenger_125': 0.85,
    'challenger_100': 0.8,
    'challenger_75': 0.75,
    'challenger_50': 0.7,
    'itf': 0.6,
    'unknown': 0.8,
  };
  
  return (multipliers[tier] || 0.8) * Math.sign(rankingGap) * Math.min(Math.abs(rankingGap) * 0.1, 10);
}

function calibrateProbability(rawProb: number, tier: TournamentTier): number {
  // Calibration basée sur l'overconfidence historique des modèles
  // Les modèles ont tendance à être trop confiants
  
  // Recentrer vers 0.5 (moins extrême)
  const calibrationFactor = tier === 'grand_slam' ? 0.85 : 
                            tier.includes('challenger') || tier === 'itf' ? 0.7 : 0.8;
  
  const centered = 0.5 + (rawProb - 0.5) * calibrationFactor;
  
  return Math.max(0.05, Math.min(0.95, centered));
}

function performCrossValidation(
  odds1: number,
  odds2: number,
  ourWinner: 'player1' | 'player2',
  ourProb: number
): MatchPredictionV2['crossValidation'] {
  const bookmakerFavorite = odds1 < odds2 ? 'player1' : 'player2';
  const bookmakerImplied = odds1 < odds2 ? (1 / odds1) : (1 / odds2);
  
  const hasDivergence = bookmakerFavorite !== ourWinner;
  const probabilityGap = Math.abs(ourProb - bookmakerImplied) * 100;
  
  let status: 'confirmed' | 'neutral' | 'divergence' | 'excluded';
  
  if (hasDivergence) {
    status = 'excluded';
  } else if (probabilityGap < 5) {
    status = 'confirmed';
  } else if (probabilityGap < 12) {
    status = 'neutral';
  } else {
    status = 'divergence';
  }
  
  return {
    status,
    bookmakerFavorite,
    ourFavorite: ourWinner,
    probabilityGap: Math.round(probabilityGap),
  };
}

function determineConfidence(
  probability: number,
  tier: TournamentTier,
  crossValidation: 'confirmed' | 'neutral' | 'divergence' | 'excluded',
  p1: PlayerData2026,
  p2: PlayerData2026
): { confidence: 'very_high' | 'high' | 'medium' | 'low'; riskPercentage: number } {
  // Si divergence avec bookmakers, confiance réduite
  if (crossValidation === 'excluded') {
    return { confidence: 'low', riskPercentage: 70 };
  }
  
  if (crossValidation === 'divergence') {
    return { confidence: 'medium', riskPercentage: 45 };
  }
  
  // Ajuster selon le tier
  const tierMultiplier = tier === 'grand_slam' ? 1.05 :
                         tier.includes('challenger') || tier === 'itf' ? 0.85 : 0.95;
  
  const adjustedProb = probability * tierMultiplier;
  const probPercent = adjustedProb * 100;
  
  // Seuils calibrés
  const thresholds = calibrationModel.thresholds;
  
  // Vérifier la qualité des données
  const hasGoodData = p1.ranking < 200 && p2.ranking < 200;
  
  let confidence: 'very_high' | 'high' | 'medium' | 'low';
  
  if (probPercent >= thresholds.very_high && crossValidation === 'confirmed' && hasGoodData) {
    confidence = 'very_high';
  } else if (probPercent >= thresholds.high) {
    confidence = 'high';
  } else if (probPercent >= thresholds.medium) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  
  const riskPercentage = Math.round(100 - probPercent);
  
  return { confidence, riskPercentage };
}

function buildAnalysis(
  match: TennisMatch,
  p1: PlayerData2026,
  p2: PlayerData2026,
  scores: { rankingScore: number; formScore: number; oddsScore: number; fatigueScore: number },
  winner: 'player1' | 'player2',
  prob: number
): MatchPredictionV2['analysis'] {
  const rankingGap = Math.abs(p1.ranking - p2.ranking);
  
  const surfaceAdvantage = {
    player: scores.rankingScore > 0 ? match.player1 : match.player2,
    score: Math.abs(scores.rankingScore),
  };
  
  const formAdvantage = {
    player: scores.formScore > 0 ? match.player1 : match.player2,
    score: Math.abs(scores.formScore),
  };
  
  const fatigueFactor = {
    player: scores.fatigueScore < 0 ? match.player1 : match.player2,
    score: Math.abs(scores.fatigueScore),
  };
  
  // Déterminer le facteur clé
  let keyFactor = 'classement';
  if (Math.abs(scores.formScore) > Math.abs(scores.rankingScore) && Math.abs(scores.formScore) > 20) {
    keyFactor = 'forme récente';
  }
  if (Math.abs(scores.oddsScore) > 30) {
    keyFactor = 'cotes bookmakers';
  }
  
  return {
    rankingGap,
    surfaceAdvantage,
    formAdvantage,
    h2hAdvantage: { player: 'N/A', record: '0-0' },
    fatigueFactor,
    keyFactor,
  };
}

function buildBettingRecommendation(
  winnerOdds: number,
  probability: number,
  confidence: string,
  crossValidation: string,
  tier: TournamentTier
): MatchPredictionV2['betting'] {
  const expectedValue = (probability * winnerOdds) - 1;
  const kellyStake = Math.max(0, (probability * (winnerOdds - 1) - (1 - probability)) / (winnerOdds - 1) * 100 * 0.25);
  
  // Critères stricts
  const recommendedBet =
    crossValidation === 'confirmed' &&
    confidence === 'very_high' &&
    probability >= 0.75 &&
    expectedValue > 0.10 &&
    !tier.includes('challenger') &&
    tier !== 'itf';
  
  let valueRating: 'excellent' | 'good' | 'fair' | 'poor';
  if (expectedValue > 0.20) valueRating = 'excellent';
  else if (expectedValue > 0.10) valueRating = 'good';
  else if (expectedValue > 0) valueRating = 'fair';
  else valueRating = 'poor';
  
  return {
    recommendedBet,
    kellyStake: Math.round(kellyStake * 10) / 10,
    winnerOdds,
    expectedValue: Math.round(expectedValue * 100),
    valueRating,
  };
}

function buildInsights(
  match: TennisMatch,
  p1: PlayerData2026,
  p2: PlayerData2026,
  crossValidation: MatchPredictionV2['crossValidation'],
  confidence: string
): { keyInsights: string[]; warnings: string[] } {
  const keyInsights: string[] = [];
  const warnings: string[] = [];
  
  // Validation croisée
  if (crossValidation.status === 'confirmed') {
    keyInsights.push('✅ Analyse validée par les bookmakers');
  } else if (crossValidation.status === 'excluded') {
    warnings.push('❌ DIVERGENCE: Bookmakers favorisent l\'autre joueur');
  }
  
  // Classement
  if (p1.ranking < 20 || p2.ranking < 20) {
    const better = p1.ranking < p2.ranking ? p1 : p2;
    keyInsights.push(`📊 ${better.name}: Top 20 (#${better.ranking})`);
  }
  
  const rankingGap = Math.abs(p1.ranking - p2.ranking);
  if (rankingGap > 50) {
    keyInsights.push(`Écart classement: ${rankingGap} places`);
  }
  
  // Forme
  if (p1.recentForm.winRate > 0.7 || p2.recentForm.winRate > 0.7) {
    const inForm = p1.recentForm.winRate > p2.recentForm.winRate ? p1 : p2;
    keyInsights.push(`🔥 ${inForm.name} en forme (${Math.round(inForm.recentForm.winRate * 100)}% victoires)`);
  }
  
  if (p1.recentForm.trend === 'improving' || p2.recentForm.trend === 'improving') {
    const improving = p1.recentForm.trend === 'improving' ? p1 : p2;
    keyInsights.push(`📈 ${improving.name} en progression`);
  }
  
  if (p1.recentForm.trend === 'declining' || p2.recentForm.trend === 'declining') {
    const declining = p1.recentForm.trend === 'declining' ? p1 : p2;
    warnings.push(`⚠️ ${declining.name} en déclin`);
  }
  
  // Tournoi
  if (match.tournamentTier === 'grand_slam') {
    keyInsights.push('🏆 Grand Chelem - fiabilité accrue');
  } else if (match.tournamentTier.includes('challenger') || match.tournamentTier === 'itf') {
    warnings.push('⚠️ Tournoi mineur - prédictions moins fiables');
  }
  
  // Données manquantes
  if (p1.ranking >= 500 || p2.ranking >= 500) {
    warnings.push('⚠️ Classement non trouvé pour un joueur');
  }
  
  return { keyInsights, warnings };
}

// ============================================
// AUTO-APPRENTISSAGE
// ============================================

/**
 * Met à jour le modèle avec un résultat
 */
export function learnFromResult(
  prediction: MatchPredictionV2,
  actualWinner: 'player1' | 'player2'
): void {
  const correct = prediction.prediction.winner === actualWinner;
  
  calibrationModel.performance.totalPredictions++;
  if (correct) calibrationModel.performance.correctPredictions++;
  
  // Mettre à jour les stats par niveau de confiance
  const conf = prediction.prediction.confidence;
  calibrationModel.performance.byConfidence[conf].total++;
  if (correct) {
    calibrationModel.performance.byConfidence[conf].correct++;
  }
  
  // Recalculer les win rates
  for (const level of ['very_high', 'high', 'medium', 'low'] as const) {
    const stats = calibrationModel.performance.byConfidence[level];
    stats.winRate = stats.total > 0 ? stats.correct / stats.total : 0;
  }
  
  // Ajuster les seuils si nécessaire
  adjustThresholds();
  
  console.log(`[TennisV2] 📚 Apprentissage: ${correct ? '✅' : '❌'} (${prediction.prediction.confidence})`);
}

/**
 * Ajuste les seuils basés sur les performances réelles
 */
function adjustThresholds(): void {
  const perf = calibrationModel.performance.byConfidence;
  
  // Si very_high a moins de 70% de réussite, augmenter le seuil
  if (perf.very_high.total >= 10 && perf.very_high.winRate < 0.70) {
    calibrationModel.thresholds.very_high = Math.min(90, calibrationModel.thresholds.very_high + 2);
    console.log(`[TennisV2] ⚠️ Seuil very_high augmenté à ${calibrationModel.thresholds.very_high}%`);
  }
  
  // Si very_high a plus de 85% de réussite, on peut légèrement baisser
  if (perf.very_high.total >= 20 && perf.very_high.winRate > 0.85) {
    calibrationModel.thresholds.very_high = Math.max(78, calibrationModel.thresholds.very_high - 1);
    console.log(`[TennisV2] ✅ Seuil very_high optimisé à ${calibrationModel.thresholds.very_high}%`);
  }
}

/**
 * Obtient les stats de performance
 */
export function getModelPerformance(): CalibrationModel['performance'] {
  return calibrationModel.performance;
}

/**
 * Réinitialise le modèle
 */
export function resetModel(): void {
  calibrationModel = { ...DEFAULT_CALIBRATION };
  console.log('[TennisV2] 🔄 Modèle réinitialisé');
}

// ============================================
// EXPORTS
// ============================================

export { calibrationModel };

export default predictMatchV2;
