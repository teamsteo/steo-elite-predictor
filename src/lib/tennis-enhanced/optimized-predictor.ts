/**
 * Tennis Optimized Predictor - PRÉDICTIONS FIABLES ET ÉCONOMES
 * 
 * 🎯 OPTIMISATIONS:
 * 1. Cache intelligent pour The Odds API (économie de crédits)
 * 2. Classements ATP/WTA en temps réel (Jeff Sackmann - GRATUIT)
 * 3. Seuils de confiance conservateurs (réduit les faux positifs)
 * 
 * 📊 PROBLÈME IDENTIFIÉ:
 * - Avant: 1 victoire sur 3 pour des matchs "90% fiables"
 * - Cause: Données codées en dur, seuils trop optimistes
 * - Solution: Données live + seuils conservateurs
 */

import {
  TennisMatch,
  TournamentTier,
  Surface,
  Category,
  getTournamentImportanceFactor,
  detectTournamentTier,
} from './smart-collector';
import {
  fetchATPRankings,
  fetchWTARankings,
  getLivePlayerData,
  LiveRanking,
  LivePlayerData,
} from './live-data-service';
import {
  findPlayerProfile,
  getSurfaceAdvantage,
  PlayerProfile,
} from './player-database';
import {
  calculateH2HScore,
  detectMatchupProblem,
} from './h2h-database';
import {
  compareForm,
  getFormAnalysis,
  detectFormWarnings,
} from './form-analyzer';
import {
  comparePressure,
  getPressureInsight,
} from './ranking-pressure';

// ============================================
// CACHE INTELLIGENT - ÉCONOMIE DE CRÉDITS API
// ============================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class IntelligentCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  
  // TTL adaptatifs selon le type de données
  public static TTL = {
    rankings: 24 * 60 * 60 * 1000,     // 24h - les classements changent peu
    playerData: 12 * 60 * 60 * 1000,   // 12h - données joueurs
    odds: 2 * 60 * 60 * 1000,          // 2h - les cotes changent modérément
    predictions: 30 * 60 * 1000,       // 30min - prédictions
  };
  
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data as T;
  }
  
  set<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }
  
  // Récupérer ou calculer avec cache
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      console.log(`[Cache] HIT: ${key}`);
      return cached;
    }
    
    console.log(`[Cache] MISS: ${key}`);
    const data = await fetcher();
    this.set(key, data, ttl);
    return data;
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  getStats(): { entries: number; keys: string[] } {
    return {
      entries: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

const cache = new IntelligentCache();

// ============================================
// CLASSEMENTS ATP/WTA EN TEMPS RÉEL
// ============================================

let liveRankingsCache: {
  atp: Map<string, number>;
  wta: Map<string, number>;
  timestamp: number;
} | null = null;

/**
 * Récupère les classements ATP/WTA actuels depuis Jeff Sackmann (GRATUIT)
 * Cache de 24h car les classements changent peu
 */
async function getLiveRankings(category: 'atp' | 'wta'): Promise<Map<string, number>> {
  const cacheKey = `rankings_${category}`;
  const cached = cache.get<{ rankings: Map<string, number>; timestamp: number }>(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < IntelligentCache.TTL.rankings) {
    return cached.rankings;
  }
  
  console.log(`[TennisOptimized] 📊 Récupération classements ${category.toUpperCase()}...`);
  
  try {
    const rankings = category === 'atp' ? await fetchATPRankings() : await fetchWTARankings();
    
    const rankingMap = new Map<string, number>();
    for (const r of rankings) {
      // Stocker avec différentes variantes du nom
      const normalizedName = r.playerName.toLowerCase().replace(/[^a-z ]/g, '').trim();
      rankingMap.set(normalizedName, r.rank);
      
      // Aussi stocker avec juste le nom de famille
      const lastName = normalizedName.split(' ').pop();
      if (lastName) {
        rankingMap.set(lastName, r.rank);
      }
    }
    
    cache.set(cacheKey, { rankings: rankingMap, timestamp: Date.now() }, IntelligentCache.TTL.rankings);
    
    console.log(`[TennisOptimized] ✅ ${rankings.length} classements ${category.toUpperCase()} mis en cache`);
    return rankingMap;
    
  } catch (error) {
    console.error(`[TennisOptimized] Erreur classements ${category}:`, error);
    return new Map(); // Retourner vide en cas d'erreur
  }
}

/**
 * Récupère le classement d'un joueur depuis les données live
 */
async function getLivePlayerRanking(playerName: string, category: Category): Promise<number> {
  const cat = category === 'wta' ? 'wta' : 'atp';
  const rankings = await getLiveRankings(cat);
  
  const normalized = playerName.toLowerCase().replace(/[^a-z ]/g, '').trim();
  
  // Recherche exacte
  if (rankings.has(normalized)) {
    return rankings.get(normalized)!;
  }
  
  // Recherche par nom de famille
  const lastName = normalized.split(' ').pop();
  if (lastName && rankings.has(lastName)) {
    return rankings.get(lastName)!;
  }
  
  // Recherche partielle
  for (const [key, rank] of rankings) {
    if (key.includes(normalized) || normalized.includes(key)) {
      return rank;
    }
  }
  
  return 500; // Non classé
}

// ============================================
// SEUILS DE CONFIANCE CONSERVATEURS
// ============================================

/**
 * Seuils de confiance STRICTS pour éviter les faux positifs
 * 
 * PROBLÈME: Avant, "90% fiable" échouait 2 fois sur 3
 * SOLUTION: Seuils beaucoup plus élevés
 * 
 * Règle: Pour être "very_high", il faut vraiment être sûr
 */
const STRICT_CONFIDENCE_THRESHOLDS = {
  // Pour avoir "very_high", il faut AU MOINS cette probabilité
  very_high: 80,  // Avant: 70% - trop bas!
  high: 70,       // Avant: 60%
  medium: 60,     // Avant: 50%
};

// Multiplicateurs par type de tournoi
const TIER_CONFIDENCE_MULTIPLIER: Record<TournamentTier, number> = {
  'grand_slam': 1.0,      // Plus prévisible
  'masters_1000': 0.95,
  'wta_1000': 0.95,
  'atp_500': 0.90,
  'wta_500': 0.90,
  'atp_250': 0.85,
  'wta_250': 0.85,
  'challenger_175': 0.75,
  'challenger_125': 0.70,
  'challenger_100': 0.70,
  'challenger_75': 0.65,
  'challenger_50': 0.65,
  'itf': 0.55,            // Très imprévisible
  'unknown': 0.70,
};

/**
 * Calcule le niveau de confiance avec seuils STRICTS
 */
function calculateStrictConfidence(
  winProbability: number,
  tier: TournamentTier,
  crossValidationStatus: 'confirmed' | 'neutral' | 'divergence' | 'excluded'
): {
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  riskPercentage: number;
} {
  // Ajuster la probabilité selon le tier
  const multiplier = TIER_CONFIDENCE_MULTIPLIER[tier] || 0.7;
  const adjustedProb = winProbability * multiplier;
  
  // Si divergence avec bookmakers, confiance réduite
  if (crossValidationStatus === 'excluded') {
    return { confidence: 'low', riskPercentage: 75 };
  }
  
  if (crossValidationStatus === 'divergence') {
    return { confidence: 'medium', riskPercentage: 50 };
  }
  
  // Appliquer les seuils STRICTS
  if (adjustedProb >= STRICT_CONFIDENCE_THRESHOLDS.very_high / 100 && crossValidationStatus === 'confirmed') {
    return { confidence: 'very_high', riskPercentage: Math.round(100 - adjustedProb * 100) };
  }
  
  if (adjustedProb >= STRICT_CONFIDENCE_THRESHOLDS.high / 100) {
    return { confidence: 'high', riskPercentage: Math.round(100 - adjustedProb * 100) };
  }
  
  if (adjustedProb >= STRICT_CONFIDENCE_THRESHOLDS.medium / 100) {
    return { confidence: 'medium', riskPercentage: Math.round(100 - adjustedProb * 100) };
  }
  
  return { confidence: 'low', riskPercentage: Math.round(100 - adjustedProb * 100) };
}

// ============================================
// POIDS DU MODÈLE OPTIMISÉ
// ============================================

// Poids ajustés après analyse des échecs
const OPTIMIZED_WEIGHTS = {
  ranking: 0.22,      // Classement réel (AUGMENTÉ)
  surface: 0.12,      // Spécialiste surface
  form: 0.15,         // Forme récente
  h2h: 0.08,          // Historique tête-à-tête
  odds: 0.15,         // Cotes bookmakers (RÉDUIT - pas assez fiable seul)
  tournament: 0.08,   // Importance du tournoi
  fatigue: 0.08,      // Fatigue du joueur
  motivation: 0.06,   // Motivation/contexte
  pressure: 0.06,     // Points à défendre
};

// ============================================
// INTERFACES
// ============================================

export interface OptimizedPrediction {
  matchId: string;
  player1: string;
  player2: string;
  tournament: string;
  tournamentTier: TournamentTier;
  surface: Surface;
  
  // Prédiction
  predictedWinner: 'player1' | 'player2';
  winProbability: number;
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  riskPercentage: number;
  
  // Facteurs analysés
  factors: {
    ranking: { score: number; description: string; live: boolean };
    surface: { score: number; description: string };
    form: { score: number; description: string };
    h2h: { score: number; description: string };
    odds: { score: number; description: string };
    tournament: { score: number; description: string };
    fatigue: { score: number; description: string };
    motivation: { score: number; description: string };
    pressure: { score: number; description: string };
  };
  
  // Paris
  betting: {
    recommendedBet: boolean;
    kellyStake: number;
    winnerOdds: number;
    expectedValue: number;
    valueRating: 'excellent' | 'good' | 'fair' | 'poor';
  };
  
  // Validation croisée
  crossValidation: {
    status: 'confirmed' | 'neutral' | 'divergence' | 'excluded';
    bookmakerFavorite: 'player1' | 'player2';
    ourFavorite: 'player1' | 'player2';
    probabilityGap: number;
  };
  
  // Analyse
  analysis: string;
  keyInsights: string[];
  warnings: string[];
  
  // Métadonnées
  modelVersion: string;
  generatedAt: Date;
  dataSource: 'live' | 'cached' | 'fallback';
}

// ============================================
// PRÉDICTION PRINCIPALE OPTIMISÉE
// ============================================

/**
 * Génère une prédiction avec données LIVE et seuils STRICTS
 */
export async function predictMatchOptimized(
  match: TennisMatch
): Promise<OptimizedPrediction> {
  const tierFactor = getTournamentImportanceFactor(match.tournamentTier);
  
  // 1. CLASSEMENT LIVE (Jeff Sackmann)
  const [p1LiveRanking, p2LiveRanking] = await Promise.all([
    getLivePlayerRanking(match.player1, match.category),
    getLivePlayerRanking(match.player2, match.category),
  ]);
  
  const hasLiveRankings = p1LiveRanking < 500 || p2LiveRanking < 500;
  const rankingDiff = p2LiveRanking - p1LiveRanking;
  const rankingScore = Math.tanh(rankingDiff / 50) * 100;
  
  // 2. Surface
  const p1Profile = findPlayerProfile(match.player1, match.category === 'wta' ? 'wta' : 'atp');
  const p2Profile = findPlayerProfile(match.player2, match.category === 'wta' ? 'wta' : 'atp');
  
  const p1SurfaceAdv = p1Profile ? getSurfaceAdvantage(p1Profile, match.surface) : 0;
  const p2SurfaceAdv = p2Profile ? getSurfaceAdvantage(p2Profile, match.surface) : 0;
  const surfaceScore = p1SurfaceAdv - p2SurfaceAdv;
  
  // 3. Forme récente
  const formComparison = compareForm(match.player1, match.player2);
  const formScore = formComparison.score;
  
  // 4. H2H
  const h2hResult = calculateH2HScore(match.player1, match.player2, match.surface);
  const h2hScore = h2hResult.score;
  const matchupProblem = detectMatchupProblem(match.player1, match.player2);
  
  // 5. Pression classement
  const pressureComparison = comparePressure(
    match.player1,
    match.player2,
    match.tournament,
    match.category === 'wta'
  );
  const pressureScore = pressureComparison.score;
  
  // 6. Cotes
  const impliedP1 = (1 / match.odds1) * 100;
  const impliedP2 = (1 / match.odds2) * 100;
  const oddsScore = impliedP1 - impliedP2;
  
  // 7. Tournoi
  let tournamentScore = 0;
  if (rankingDiff > 30) {
    tournamentScore = (tierFactor - 1) * 50;
  }
  
  // 8. Fatigue (basique)
  let fatigueScore = 0;
  if (p1Profile?.returningFromInjury) fatigueScore -= 15;
  if (p2Profile?.returningFromInjury) fatigueScore += 15;
  
  // 9. Motivation (basique)
  let motivationScore = 0;
  if (p1Profile && ['grand_slam', 'masters_1000', 'wta_1000'].includes(match.tournamentTier)) {
    motivationScore += 5;
  }
  if (p2Profile && ['grand_slam', 'masters_1000', 'wta_1000'].includes(match.tournamentTier)) {
    motivationScore -= 5;
  }
  
  // ============================================
  // VALIDATION CROISÉE: NOS ANALYSES vs BOOKMAKERS
  // ============================================
  
  const oddsFavorite: 'player1' | 'player2' = match.odds1 < match.odds2 ? 'player1' : 'player2';
  const oddsFavoriteImplied = match.odds1 < match.odds2
    ? (1 / match.odds1) * 100
    : (1 / match.odds2) * 100;
  
  // Notre analyse SANS les cotes
  const ourAnalysisScore =
    rankingScore * OPTIMIZED_WEIGHTS.ranking +
    surfaceScore * OPTIMIZED_WEIGHTS.surface +
    formScore * OPTIMIZED_WEIGHTS.form +
    h2hScore * OPTIMIZED_WEIGHTS.h2h +
    tournamentScore * OPTIMIZED_WEIGHTS.tournament +
    fatigueScore * OPTIMIZED_WEIGHTS.fatigue +
    motivationScore * OPTIMIZED_WEIGHTS.motivation +
    pressureScore * OPTIMIZED_WEIGHTS.pressure;
  
  const ourFavorite: 'player1' | 'player2' = ourAnalysisScore >= 0 ? 'player1' : 'player2';
  const hasDivergence = oddsFavorite !== ourFavorite;
  
  // Calcul de l'écart
  const ourFavoriteProbability = ourAnalysisScore >= 0
    ? 1 / (1 + Math.exp(-ourAnalysisScore / 30))
    : 1 - 1 / (1 + Math.exp(-ourAnalysisScore / 30));
  const probabilityGap = Math.abs(ourFavoriteProbability * 100 - oddsFavoriteImplied);
  
  // Statut de validation croisée
  let crossValidationStatus: 'confirmed' | 'neutral' | 'divergence' | 'excluded';
  
  if (hasDivergence) {
    crossValidationStatus = 'excluded';
  } else if (probabilityGap < 8) {
    crossValidationStatus = 'confirmed';
  } else if (probabilityGap < 15) {
    crossValidationStatus = 'neutral';
  } else {
    crossValidationStatus = 'divergence';
  }
  
  // ============================================
  // SCORE FINAL
  // ============================================
  
  const totalScore =
    rankingScore * OPTIMIZED_WEIGHTS.ranking +
    surfaceScore * OPTIMIZED_WEIGHTS.surface +
    formScore * OPTIMIZED_WEIGHTS.form +
    h2hScore * OPTIMIZED_WEIGHTS.h2h +
    oddsScore * OPTIMIZED_WEIGHTS.odds +
    tournamentScore * OPTIMIZED_WEIGHTS.tournament +
    fatigueScore * OPTIMIZED_WEIGHTS.fatigue +
    motivationScore * OPTIMIZED_WEIGHTS.motivation +
    pressureScore * OPTIMIZED_WEIGHTS.pressure;
  
  const rawProbability = 1 / (1 + Math.exp(-totalScore / 30));
  const winProbability = Math.min(0.95, Math.max(0.05, rawProbability));
  
  const predictedWinner: 'player1' | 'player2' = winProbability >= 0.5 ? 'player1' : 'player2';
  const displayProbability = winProbability >= 0.5 ? winProbability : 1 - winProbability;
  
  // ============================================
  // CONFIANCE STRICT
  // ============================================
  
  const { confidence, riskPercentage } = calculateStrictConfidence(
    displayProbability,
    match.tournamentTier,
    crossValidationStatus
  );
  
  // ============================================
  // RECOMMANDATION DE PARI (TRÈS STRICTE)
  // ============================================
  
  const winnerOdds = predictedWinner === 'player1' ? match.odds1 : match.odds2;
  const expectedValue = (displayProbability * winnerOdds) - 1;
  const kellyStake = calculateKellyStake(displayProbability, winnerOdds, confidence);
  
  // CRITÈRES TRÈS STRICTS pour recommander un pari
  const recommendedBet =
    crossValidationStatus === 'confirmed' &&           // Validé par bookmakers
    confidence === 'very_high' &&                       // Confiance maximale uniquement
    displayProbability >= 0.75 &&                       // Au moins 75% de chances
    kellyStake >= 2.0 &&                                // Kelly suffisant
    expectedValue > 0.10 &&                             // Value positive significative
    match.tournamentTier !== 'itf' &&                   // Pas ITF (trop imprévisible)
    !match.tournamentTier.includes('challenger');       // Pas Challenger
  
  let valueRating: 'excellent' | 'good' | 'fair' | 'poor';
  if (expectedValue > 0.20) valueRating = 'excellent';
  else if (expectedValue > 0.10) valueRating = 'good';
  else if (expectedValue > 0) valueRating = 'fair';
  else valueRating = 'poor';
  
  // ============================================
  // INSIGHTS ET WARNINGS
  // ============================================
  
  const keyInsights: string[] = [];
  const warnings: string[] = [];
  
  // Validation croisée
  if (crossValidationStatus === 'confirmed') {
    keyInsights.push(`✅ Analyse confirmée par les bookmakers`);
  } else if (crossValidationStatus === 'excluded') {
    warnings.push(`❌ DIVERGENCE: Bookmakers favorisent ${oddsFavorite === 'player1' ? match.player1 : match.player2}`);
    warnings.push(`Pari EXCLU - incohérence détectée`);
  }
  
  // Classement live
  if (hasLiveRankings) {
    keyInsights.push(`📊 Classements LIVE: #${p1LiveRanking} vs #${p2LiveRanking}`);
  } else {
    warnings.push(`⚠️ Classements non disponibles - utilisation données de fallback`);
  }
  
  // Écart de classement
  if (Math.abs(rankingDiff) > 50) {
    keyInsights.push(`Écart classement: ${Math.abs(rankingDiff)} places`);
  }
  
  // Surface
  if (Math.abs(surfaceScore) > 10) {
    const advantaged = surfaceScore > 0 ? match.player1 : match.player2;
    keyInsights.push(`Avantage surface pour ${advantaged}`);
  }
  
  // H2H
  if (h2hResult.record && h2hResult.record.totalMatches >= 3) {
    if (Math.abs(h2hScore) > 30) {
      const dominant = h2hScore > 0 ? match.player1 : match.player2;
      keyInsights.push(`H2H: ${dominant} domine (${h2hResult.record.player1Wins}-${h2hResult.record.player2Wins})`);
    }
  }
  
  // Match-up problem
  if (matchupProblem.exists && matchupProblem.dominantPlayer) {
    keyInsights.push(`⚔️ Match-up favorable détecté`);
  }
  
  // Tournoi
  if (match.tournamentTier === 'grand_slam') {
    keyInsights.push(`🏆 Grand Chelem - fiabilité accrue`);
  } else if (match.tournamentTier === 'itf' || match.tournamentTier.includes('challenger')) {
    warnings.push(`⚠️ Tournoi mineur - prédictions moins fiables`);
  }
  
  // Warnings de forme
  if (formComparison.p1Form) {
    const formWarnings = detectFormWarnings(formComparison.p1Form);
    formWarnings.forEach(w => warnings.push(`${match.player1}: ${w}`));
  }
  if (formComparison.p2Form) {
    const formWarnings = detectFormWarnings(formComparison.p2Form);
    formWarnings.forEach(w => warnings.push(`${match.player2}: ${w}`));
  }
  
  // ============================================
  // ANALYSE TEXTUELLE
  // ============================================
  
  const winnerName = predictedWinner === 'player1' ? match.player1 : match.player2;
  let analysis = `${winnerName} favori avec ${Math.round(displayProbability * 100)}% de chances. `;
  
  if (Math.abs(rankingDiff) > 30) {
    analysis += `Avantage au classement (${Math.abs(rankingDiff)} places). `;
  }
  
  if (crossValidationStatus === 'confirmed') {
    analysis += `Prédiction validée par les bookmakers.`;
  } else if (crossValidationStatus === 'excluded') {
    analysis += `ATTENTION: Divergence avec les bookmakers - pari non recommandé.`;
  }
  
  // ============================================
  // RÉSULTAT
  // ============================================
  
  const dataSource: 'live' | 'cached' | 'fallback' = hasLiveRankings ? 'live' : 'fallback';
  
  return {
    matchId: match.id,
    player1: match.player1,
    player2: match.player2,
    tournament: match.tournament,
    tournamentTier: match.tournamentTier,
    surface: match.surface,
    predictedWinner,
    winProbability: Math.round(displayProbability * 100),
    confidence,
    riskPercentage,
    factors: {
      ranking: {
        score: rankingScore,
        description: hasLiveRankings 
          ? `Classements LIVE: #${p1LiveRanking} vs #${p2LiveRanking}`
          : `Classements estimés: #${p1LiveRanking} vs #${p2LiveRanking}`,
        live: hasLiveRankings,
      },
      surface: {
        score: surfaceScore,
        description: getSurfaceDescription(match.player1, match.player2, match.surface, p1SurfaceAdv, p2SurfaceAdv),
      },
      form: {
        score: formScore,
        description: formComparison.description,
      },
      h2h: {
        score: h2hScore,
        description: h2hResult.description,
      },
      odds: {
        score: oddsScore,
        description: `Cotes: ${match.odds1.toFixed(2)} vs ${match.odds2.toFixed(2)}`,
      },
      tournament: {
        score: tournamentScore,
        description: getTournamentDescription(match.tournamentTier),
      },
      fatigue: {
        score: fatigueScore,
        description: 'Données fatigue limitées',
      },
      motivation: {
        score: motivationScore,
        description: 'Analyse motivation basique',
      },
      pressure: {
        score: pressureScore,
        description: pressureComparison.description,
      },
    },
    betting: {
      recommendedBet,
      kellyStake: Math.round(kellyStake * 10) / 10,
      winnerOdds,
      expectedValue: Math.round(expectedValue * 100),
      valueRating,
    },
    crossValidation: {
      status: crossValidationStatus,
      bookmakerFavorite: oddsFavorite,
      ourFavorite,
      probabilityGap: Math.round(probabilityGap),
    },
    analysis,
    keyInsights,
    warnings,
    modelVersion: 'tennis-optimized-v1.0',
    generatedAt: new Date(),
    dataSource,
  };
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

function getSurfaceDescription(p1: string, p2: string, surface: Surface, s1: number, s2: number): string {
  if (s1 > 0 && s2 <= 0) return `${p1} performe mieux sur ${surface}`;
  if (s2 > 0 && s1 <= 0) return `${p2} performe mieux sur ${surface}`;
  if (s1 < 0 && s2 >= 0) return `${p1} moins à l'aise sur ${surface}`;
  if (s2 < 0 && s1 >= 0) return `${p2} moins à l'aise sur ${surface}`;
  return `Performance équilibrée sur ${surface}`;
}

function getTournamentDescription(tier: TournamentTier): string {
  const descriptions: Record<TournamentTier, string> = {
    'grand_slam': 'Grand Chelem - enjeu maximal',
    'masters_1000': 'Masters 1000 - haut niveau',
    'wta_1000': 'WTA 1000 - haut niveau',
    'atp_500': 'ATP 500 - niveau intermédiaire',
    'wta_500': 'WTA 500 - niveau intermédiaire',
    'atp_250': 'ATP 250 - niveau standard',
    'wta_250': 'WTA 250 - niveau standard',
    'challenger_175': 'Challenger 175',
    'challenger_125': 'Challenger 125',
    'challenger_100': 'Challenger 100',
    'challenger_75': 'Challenger 75',
    'challenger_50': 'Challenger 50',
    'itf': 'ITF - niveau régional',
    'unknown': 'Tournoi non catégorisé',
  };
  return descriptions[tier];
}

function calculateKellyStake(probability: number, odds: number, confidence: string): number {
  const b = odds - 1;
  const p = probability;
  const q = 1 - p;
  
  let kelly = (b * p - q) / b;
  
  const fractions: Record<string, number> = {
    very_high: 0.25,
    high: 0.20,
    medium: 0.10,
    low: 0,
  };
  
  kelly *= fractions[confidence] || 0.10;
  
  return Math.max(0, Math.min(kelly * 100, 5));
}

// ============================================
// EXPORTS
// ============================================

export { cache, IntelligentCache, getLiveRankings, getLivePlayerRanking };
export default predictMatchOptimized;
