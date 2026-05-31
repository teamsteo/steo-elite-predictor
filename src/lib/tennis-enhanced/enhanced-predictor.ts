/**
 * Tennis Enhanced Predictor - Prédictions ML améliorées
 * 
 * Améliorations:
 * 1. Facteur d'importance du tournoi (Grand Chelem > Masters > ATP 250)
 * 2. Classements réels ATP/WTA intégrés
 * 3. Features enrichies (fatigue, motivation, enjeu)
 * 4. Calibration des probabilités
 * 5. Système de validation et backtesting
 */

import {
  TennisMatch,
  PlayerData,
  TournamentTier,
  Surface,
  Category,
  getTournamentImportanceFactor,
  detectTournamentTier,
} from './smart-collector';
import {
  findPlayerProfile,
  getSurfaceAdvantage,
  getGrandSlamPerformance,
  calculateFormBoost,
  PlayerProfile,
} from './player-database';

// ============================================
// INTERFACES
// ============================================

export interface EnhancedPrediction {
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
    ranking: { score: number; description: string };
    surface: { score: number; description: string };
    form: { score: number; description: string };
    h2h: { score: number; description: string };
    odds: { score: number; description: string };
    tournament: { score: number; description: string };
    fatigue: { score: number; description: string };
    motivation: { score: number; description: string };
  };
  
  // Paris
  betting: {
    recommendedBet: boolean;
    kellyStake: number;
    winnerOdds: number;
    expectedValue: number;
    valueRating: 'excellent' | 'good' | 'fair' | 'poor';
  };
  
  // Analyse détaillée
  analysis: string;
  keyInsights: string[];
  warnings: string[];
  
  // Métadonnées
  modelVersion: string;
  generatedAt: Date;
}

export interface ModelWeights {
  ranking: number;
  surface: number;
  form: number;
  h2h: number;
  odds: number;
  tournament: number;
  fatigue: number;
  motivation: number;
}

export interface ValidationResult {
  predictionId: string;
  predicted: 'player1' | 'player2';
  actual: 'player1' | 'player2' | null;
  wasCorrect: boolean | null;
  probability: number;
  confidence: string;
  odds: number;
}

// ============================================
// CONFIGURATION DU MODÈLE
// ============================================

// Poids ajustables (seront calibrés par entraînement)
const DEFAULT_WEIGHTS: ModelWeights = {
  ranking: 0.22,      // Réduit car moins fiable que les cotes
  surface: 0.15,      // Important mais pas dominant
  form: 0.12,         // Forme récente
  h2h: 0.10,          // Historique tête-à-tête
  odds: 0.20,         // Les cotes contiennent beaucoup d'information
  tournament: 0.08,   // Importance du tournoi
  fatigue: 0.07,      // Fatigue du joueur
  motivation: 0.06,   // Motivation/contexte
};

// Facteurs d'ajustement par importance de tournoi
const TIER_MULTIPLIERS: Record<TournamentTier, number> = {
  'grand_slam': 1.25,     // Plus prévisible (meilleurs joueurs motivés)
  'masters_1000': 1.15,
  'wta_1000': 1.12,
  'atp_500': 1.05,
  'wta_500': 1.05,
  'atp_250': 1.00,
  'wta_250': 1.00,
  'challenger_175': 0.90,
  'challenger_125': 0.85,
  'challenger_100': 0.80,
  'challenger_75': 0.75,
  'challenger_50': 0.70,
  'itf': 0.60,            // Moins prévisible (joueurs inconnus)
  'unknown': 0.75,
};

// Seuils de confiance ajustés par tier
function getConfidenceThresholds(tier: TournamentTier): {
  very_high: number;
  high: number;
  medium: number;
} {
  const base = TIER_MULTIPLIERS[tier] || 1.0;
  
  // Plus le tournoi est important, plus on peut être confiant
  return {
    very_high: 70 / base,  // Ex: Grand Slam = 56%, Challenger = 87%
    high: 62 / base,
    medium: 55 / base,
  };
}

// ============================================
// DONNÉES DE RÉFÉRENCE - CLASSEMENTS ATP/WTA
// ============================================

// Classements ATP top 100 (simplifié - en production, charger depuis API)
const ATP_RANKINGS: Record<string, number> = {
  'sinner': 1, 'alcaraz': 2, 'zverev': 3, 'medvedev': 4, 'friedl': 5,
  'ruud': 6, 'djokovic': 7, 'rublev': 8, 'de minaur': 9, 'humbert': 10,
  'tsitsipas': 11, 'rune': 12, 'fritz': 13, 'shelton': 14, 'cerundolo': 15,
  'bublik': 16, 'khachanov': 17, 'mannarino': 18, 'etcheverry': 19, 'auger-aliassime': 20,
  'taylor fritz': 13, 'ben shelton': 14, 'casper ruud': 6, 'novak djokovic': 7,
  'jannik sinner': 1, 'carlos alcaraz': 2, 'alexander zverev': 3, 'daniil medvedev': 4,
  'andrey rublev': 8, 'holger rune': 12, 'stefanos tsitsipas': 11, 'ugo humbert': 10,
  'arthur fils': 21, 'grigor dimitrov': 22, 'tomas machac': 23, 'sebastian baez': 24,
  'jiri lehecka': 25, 'giovanni mpetsi perdicard': 26, 'gabriel diallo': 27,
  'alex de minaur': 9, 'felix auger aliassime': 20, 'karen khachanov': 17,
  'lorenzo musetti': 28, 'nicolas jarry': 29, 'francisco cerundolo': 15,
  'hubert hurkacz': 30, 'tommy paul': 31, 'borna coric': 32, 'tallon griekspoor': 33,
  'sebastian korda': 34, 'janik sinner': 1, 'alex zverev': 3,
};

// Classements WTA top 50 (simplifié)
const WTA_RANKINGS: Record<string, number> = {
  'sabalenka': 1, 'iga swiatek': 2, 'coco gauff': 3, 'jessica pegula': 4, 'elena rybakina': 5,
  'ons jabeur': 6, 'marketa vondrousova': 7, 'qinwen zheng': 8, 'maria sakkari': 9, 'daria kasatkina': 10,
  'jelena ostapenko': 11, 'barbora krejcikova': 12, 'beatriz haddad maia': 13, 'danielle collins': 14,
  'lyudmila samsonova': 15, 'ekaterina alexandrova': 16, 'madison keys': 17, 'veronika kudermetova': 18,
  'petra kvitova': 19, 'viktoria azarenka': 20, 'aryna sabalenka': 1, 'swiatek': 2, 'gauff': 3,
  'pegula': 4, 'rybakina': 5, 'jabeur': 6, 'vondrousova': 7, 'zheng': 8, 'sakkari': 9, 'kasatkina': 10,
};

// Les données de surface sont maintenant dans player-database.ts

// ============================================
// FONCTIONS DE CALCUL
// ============================================

function getPlayerRanking(name: string, category: Category): number {
  const normalized = name.toLowerCase().replace(/[^a-z ]/g, '').trim();
  
  // Challenger et ITF utilisent les classements ATP par défaut
  const rankingCategory = (category === 'atp' || category === 'challenger' || category === 'itf') ? 'atp' : 'wta';
  const rankings = rankingCategory === 'atp' ? ATP_RANKINGS : WTA_RANKINGS;
  
  // Recherche exacte
  if (rankings[normalized]) return rankings[normalized];
  
  // Recherche partielle
  for (const [key, rank] of Object.entries(rankings)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return rank;
    }
  }
  
  // Joueur non classé
  return 500;
}

function getEnhancedSurfaceAdvantage(
  player: string,
  surface: Surface,
  category: Category
): { score: number; profile: PlayerProfile | null } {
  const profile = findPlayerProfile(player, category === 'wta' ? 'wta' : 'atp');
  
  if (profile) {
    const score = getSurfaceAdvantage(profile, surface);
    return { score, profile };
  }
  
  return { score: 0, profile: null };
}

function calculateFatigueScore(
  player: string,
  _recentMatches: number
): number {
  // Score de fatigue basé sur les matchs récents
  // Plus le score est bas, plus le joueur est fatigué
  // En production, utiliser les données réelles de calendrier
  
  // Pour l'instant, estimation neutre
  return 0;
}

function calculateMotivationScore(
  player: string,
  tournamentTier: TournamentTier,
  ranking: number
): number {
  // Les joueurs mieux classés sont plus motivés pour les grands tournois
  if (ranking <= 10) {
    if (tournamentTier === 'grand_slam') return 10;
    if (tournamentTier === 'masters_1000' || tournamentTier === 'wta_1000') return 8;
  }
  
  // Joueurs en dehors du top 50 plus motivés pour Challenger/ITF
  if (ranking > 50) {
    if (tournamentTier.includes('challenger')) return 8;
    if (tournamentTier === 'itf') return 6;
  }
  
  return 5; // Motivation moyenne
}

// ============================================
// PRÉDICTION PRINCIPALE
// ============================================

export function predictMatch(
  match: TennisMatch,
  player1Data?: PlayerData,
  player2Data?: PlayerData
): EnhancedPrediction {
  const weights = DEFAULT_WEIGHTS;
  const tierFactor = getTournamentImportanceFactor(match.tournamentTier);
  
  // Récupérer les profils enrichis
  const p1Profile = findPlayerProfile(match.player1, match.category === 'wta' ? 'wta' : 'atp');
  const p2Profile = findPlayerProfile(match.player2, match.category === 'wta' ? 'wta' : 'atp');
  
  // 1. Classement (utiliser le profil si disponible)
  const p1Ranking = p1Profile?.ranking ?? player1Data?.ranking ?? getPlayerRanking(match.player1, match.category);
  const p2Ranking = p2Profile?.ranking ?? player2Data?.ranking ?? getPlayerRanking(match.player2, match.category);
  
  const rankingDiff = p2Ranking - p1Ranking; // Positif si P1 mieux classé
  const rankingScore = Math.tanh(rankingDiff / 50) * 100; // -100 à +100
  
  // 2. Surface (avec données enrichies)
  const p1SurfaceResult = getEnhancedSurfaceAdvantage(match.player1, match.surface, match.category);
  const p2SurfaceResult = getEnhancedSurfaceAdvantage(match.player2, match.surface, match.category);
  const p1SurfaceAdv = p1SurfaceResult.score;
  const p2SurfaceAdv = p2SurfaceResult.score;
  const surfaceScore = (p1SurfaceAdv - p2SurfaceAdv);
  
  // 3. Forme récente (avec données enrichies)
  let formScore = 0;
  if (p1Profile && p2Profile) {
    const p1FormBoost = calculateFormBoost(p1Profile);
    const p2FormBoost = calculateFormBoost(p2Profile);
    formScore = (p1FormBoost - p2FormBoost) * 5; // Scale 0-50
  } else if (player1Data?.recentForm && player2Data?.recentForm) {
    const p1FormRate = player1Data.recentForm.last10.filter(r => r === 'W').length / 10;
    const p2FormRate = player2Data.recentForm.last10.filter(r => r === 'W').length / 10;
    formScore = (p1FormRate - p2FormRate) * 100;
  }
  
  // 4. H2H
  let h2hScore = 0;
  // En production, récupérer depuis la base H2H
  
  // 5. Cotes
  const impliedP1 = (1 / match.odds1) * 100;
  const impliedP2 = (1 / match.odds2) * 100;
  const oddsScore = impliedP1 - impliedP2;
  
  // 6. Importance tournoi (bonus pour favoris dans grands tournois)
  let tournamentScore = 0;
  if (rankingDiff > 30) {
    // Favori clair
    tournamentScore = (tierFactor - 1) * 50; // Bonus si tournoi important
  }
  
  // 7. Fatigue (amélioré avec profil)
  let fatigueScore = 0;
  if (p1Profile && p2Profile) {
    // Malus si retour de blessure
    if (p1Profile.returningFromInjury) fatigueScore -= 15;
    if (p2Profile.returningFromInjury) fatigueScore += 15;
  } else {
    fatigueScore = calculateFatigueScore(match.player1, 0) - 
                   calculateFatigueScore(match.player2, 0);
  }
  
  // 8. Motivation (amélioré avec historique tournoi)
  let motivationScore = calculateMotivationScore(match.player1, match.tournamentTier, p1Ranking) -
                       calculateMotivationScore(match.player2, match.tournamentTier, p2Ranking);
  
  // Bonus si le joueur performe bien dans ce tournoi
  if (p1Profile && ['grand_slam', 'masters_1000', 'wta_1000'].includes(match.tournamentTier)) {
    const p1GSPerf = getGrandSlamPerformance(p1Profile, match.tournament);
    motivationScore += (p1GSPerf - 70) / 5; // Normaliser autour de 70%
  }
  if (p2Profile && ['grand_slam', 'masters_1000', 'wta_1000'].includes(match.tournamentTier)) {
    const p2GSPerf = getGrandSlamPerformance(p2Profile, match.tournament);
    motivationScore -= (p2GSPerf - 70) / 5;
  }
  
  // ============================================
  // VALIDATION CROISÉE: NOS ANALYSES vs BOOKMAKERS
  // ============================================
  
  // 1. Favori selon les cotes (cote basse = favori)
  const oddsFavorite: 'player1' | 'player2' = match.odds1 < match.odds2 ? 'player1' : 'player2';
  const oddsFavoriteImplied = match.odds1 < match.odds2 
    ? (1 / match.odds1) * 100 
    : (1 / match.odds2) * 100;
  
  // 2. Favori selon notre analyse SANS les cotes (classement + surface + forme + motivation)
  const ourAnalysisScore = 
    rankingScore * weights.ranking +
    surfaceScore * weights.surface +
    formScore * weights.form +
    h2hScore * weights.h2h +
    tournamentScore * weights.tournament +
    fatigueScore * weights.fatigue +
    motivationScore * weights.motivation;
  
  const ourFavorite: 'player1' | 'player2' = ourAnalysisScore >= 0 ? 'player1' : 'player2';
  
  // 3. Comparaison: y a-t-il divergence?
  const hasDivergence = oddsFavorite !== ourFavorite;
  
  // 4. Calcul de l'écart de confiance
  // Si bookmaker dit 70% et nous 80% sur le même joueur → petit écart (OK)
  // Si bookmaker dit joueur A favori et nous joueur B → GRAND écart (ALERTE)
  const ourFavoriteProbability = ourAnalysisScore >= 0 
    ? 1 / (1 + Math.exp(-ourAnalysisScore / 30))
    : 1 - 1 / (1 + Math.exp(-ourAnalysisScore / 30));
  
  const probabilityGap = Math.abs(ourFavoriteProbability * 100 - oddsFavoriteImplied);
  
  // ============================================
  // CALCUL SCORE FINAL (avec validation croisée)
  // ============================================
  
  const totalScore = 
    rankingScore * weights.ranking +
    surfaceScore * weights.surface +
    formScore * weights.form +
    h2hScore * weights.h2h +
    oddsScore * weights.odds +
    tournamentScore * weights.tournament +
    fatigueScore * weights.fatigue +
    motivationScore * weights.motivation;

  // Conversion en probabilité avec fonction sigmoïde calibrée
  const rawProbability = 1 / (1 + Math.exp(-totalScore / 30));

  // Calibration selon importance du tournoi
  const calibratedProbability = rawProbability * TIER_MULTIPLIERS[match.tournamentTier];
  const finalProbability = Math.min(0.95, Math.max(0.05, calibratedProbability));

  // Déterminer le gagnant
  const predictedWinner: 'player1' | 'player2' = finalProbability >= 0.5 ? 'player1' : 'player2';
  const winProbability = finalProbability >= 0.5 ? finalProbability : 1 - finalProbability;
  
  // ============================================
  // CONFIANCE AJUSTÉE SELON VALIDATION CROISÉE
  // ============================================
  
  const thresholds = getConfidenceThresholds(match.tournamentTier);
  let confidence: 'very_high' | 'high' | 'medium' | 'low';
  let riskPercentage: number;
  let crossValidationStatus: 'confirmed' | 'neutral' | 'divergence' | 'excluded';
  
  if (hasDivergence) {
    // DIVERGENCE: Notre analyse et les bookmakers ne sont pas d'accord
    // → On exclut ce pari (trop risqué)
    confidence = 'low';
    riskPercentage = 75; // Risque élevé
    crossValidationStatus = 'excluded';
  } else if (probabilityGap < 10) {
    // COHÉRENCE FORTE: Même favori ET probabilité proche
    // → Confiance augmentée
    confidence = winProbability * 100 >= thresholds.very_high ? 'very_high' : 'high';
    riskPercentage = Math.max(10, 15 + (1 - winProbability) * 25);
    crossValidationStatus = 'confirmed';
  } else if (probabilityGap < 20) {
    // COHÉRENCE MOYENNE: Même favori mais écart de probabilité
    // → Confiance normale
    confidence = winProbability * 100 >= thresholds.high ? 'high' : 
                 winProbability * 100 >= thresholds.medium ? 'medium' : 'low';
    riskPercentage = 25 + (probabilityGap / 2);
    crossValidationStatus = 'neutral';
  } else {
    // COHÉRENCE FAIBLE: Même favori mais gros écart de probabilité
    // → Signaler le doute
    confidence = 'medium';
    riskPercentage = 45;
    crossValidationStatus = 'divergence';
  }
  
  // ============================================
  // ANALYSE ET INSIGHTS
  // ============================================
  
  const factors = {
    ranking: {
      score: rankingScore,
      description: getRankingDescription(match.player1, match.player2, p1Ranking, p2Ranking),
    },
    surface: {
      score: surfaceScore,
      description: getSurfaceDescription(match.player1, match.player2, match.surface, p1SurfaceAdv, p2SurfaceAdv),
    },
    form: {
      score: formScore,
      description: formScore > 20 ? `${match.player1} en meilleure forme` :
                   formScore < -20 ? `${match.player2} en meilleure forme` : 'Forme équilibrée',
    },
    h2h: {
      score: h2hScore,
      description: 'Pas de données H2H disponibles',
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
      description: 'Données de fatigue non disponibles',
    },
    motivation: {
      score: motivationScore,
      description: 'Analyse motivation basique',
    },
  };
  
  const keyInsights: string[] = [];
  const warnings: string[] = [];
  
  // ============================================
  // INSIGHTS: VALIDATION CROISÉE
  // ============================================
  
  if (crossValidationStatus === 'confirmed') {
    keyInsights.push(`✅ Analyse confirmée par les cotes (écart ${probabilityGap.toFixed(0)}%)`);
  } else if (crossValidationStatus === 'excluded') {
    warnings.push(`⚠️ DIVERGENCE: Bookmakers favorisent ${oddsFavorite === 'player1' ? match.player1 : match.player2}, notre analyse favorise ${ourFavorite === 'player1' ? match.player1 : match.player2}`);
    warnings.push('❌ Pari EXCLU - incohérence entre analyse et cotes');
  } else if (crossValidationStatus === 'divergence') {
    warnings.push(`⚠️ Écart important avec les bookmakers (${probabilityGap.toFixed(0)}%) - prudence`);
  }
  
  // Insights (enrichis avec profils)
  if (Math.abs(rankingDiff) > 50) {
    keyInsights.push(`Écart de classement important: ${Math.abs(rankingDiff)} places`);
  }
  if (match.tournamentTier === 'grand_slam') {
    keyInsights.push('Grand Chelem - motivation maximale attendue');
  }
  if (Math.abs(surfaceScore) > 10) {
    const advantaged = surfaceScore > 0 ? match.player1 : match.player2;
    keyInsights.push(`Avantage surface significatif pour ${advantaged}`);
  }
  
  // Insights basés sur les profils
  if (p1Profile?.strengths.length && p1Profile.strengths.length > 0) {
    keyInsights.push(`${match.player1}: ${p1Profile.strengths[0]}`);
  }
  if (p2Profile?.strengths.length && p2Profile.strengths.length > 0) {
    keyInsights.push(`${match.player2}: ${p2Profile.strengths[0]}`);
  }
  
  if (p1Profile?.returningFromInjury) {
    warnings.push(`${match.player1} revient de blessure`);
  }
  if (p2Profile?.returningFromInjury) {
    warnings.push(`${match.player2} revient de blessure`);
  }
  
  // Warnings
  if (p1Ranking > 100 || p2Ranking > 100) {
    warnings.push('Joueur(s) non classé(s) dans le top 100');
  }
  if (winProbability > 0.5 && winProbability < 0.60) {
    warnings.push('Match serré - prédiction incertaine');
  }
  if (match.tournamentTier.includes('challenger') || match.tournamentTier === 'itf') {
    warnings.push('Tournoi mineur - fiabilité réduite');
  }
  
  // ============================================
  // BETTING RECOMMENDATION (avec validation croisée)
  // ============================================
  
  const winnerOdds = predictedWinner === 'player1' ? match.odds1 : match.odds2;
  const expectedValue = (winProbability * winnerOdds) - 1;
  
  // Kelly criterion
  const kellyStake = calculateKellyStake(winProbability, winnerOdds, confidence);
  
  // Value rating
  let valueRating: 'excellent' | 'good' | 'fair' | 'poor';
  if (expectedValue > 0.15) valueRating = 'excellent';
  else if (expectedValue > 0.08) valueRating = 'good';
  else if (expectedValue > 0) valueRating = 'fair';
  else valueRating = 'poor';
  
  // Recommandation: EXCLURE si divergence avec bookmakers
  const recommendedBet = 
    crossValidationStatus !== 'excluded' &&  // Pas de divergence
    kellyStake >= 0.5 && 
    confidence !== 'low' && 
    expectedValue > 0.02;
  
  // ============================================
  // ANALYSE TEXTUELLE
  // ============================================
  
  const analysis = generateAnalysis(
    match.player1,
    match.player2,
    predictedWinner,
    winProbability,
    factors,
    match.tournament,
    match.tournamentTier
  );
  
  return {
    matchId: match.id,
    player1: match.player1,
    player2: match.player2,
    tournament: match.tournament,
    tournamentTier: match.tournamentTier,
    surface: match.surface,
    predictedWinner,
    winProbability: Math.round(winProbability * 100),
    confidence,
    riskPercentage: Math.round(riskPercentage),
    factors,
    betting: {
      recommendedBet,
      kellyStake: Math.round(kellyStake * 10) / 10,
      winnerOdds,
      expectedValue: Math.round(expectedValue * 100),
      valueRating,
    },
    analysis,
    keyInsights,
    warnings,
    modelVersion: 'tennis-enhanced-v2.0',
    generatedAt: new Date(),
  };
}

// ============================================
// FONCTIONS AUXILIAIRES
// ============================================

function getRankingDescription(p1: string, p2: string, r1: number, r2: number): string {
  const diff = Math.abs(r1 - r2);
  
  if (diff < 10) return `Classements proches: #${r1} vs #${r2}`;
  if (diff < 30) return r1 < r2 ? `${p1} légèrement mieux classé (#${r1} vs #${r2})` :
                               `${p2} légèrement mieux classé (#${r2} vs #${r1})`;
  if (diff < 100) return r1 < r2 ? `${p1} mieux classé (#${r1} vs #${r2})` :
                                   `${p2} mieux classé (#${r2} vs #${r1})`;
  return r1 < r2 ? `${p1} largement mieux classé (#${r1} vs #${r2})` :
                   `${p2} largement mieux classé (#${r2} vs #${r1})`;
}

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
  // Critère de Kelly: f = (bp - q) / b
  const b = odds - 1;
  const p = probability;
  const q = 1 - p;
  
  let kelly = (b * p - q) / b;
  
  // Kelly fractionné selon confiance
  const fractions: Record<string, number> = {
    very_high: 0.25,
    high: 0.20,
    medium: 0.10,
    low: 0,
  };
  
  kelly *= fractions[confidence] || 0.10;
  
  // Limiter à 5% max
  return Math.max(0, Math.min(kelly * 100, 5));
}

function generateAnalysis(
  p1: string,
  p2: string,
  winner: 'player1' | 'player2',
  prob: number,
  factors: EnhancedPrediction['factors'],
  tournament: string,
  tier: TournamentTier
): string {
  const winnerName = winner === 'player1' ? p1 : p2;
  const loserName = winner === 'player1' ? p2 : p1;
  
  let analysis = `${winnerName} est favori avec ${Math.round(prob * 100)}% de chances de victoire. `;
  
  // Ajouter contexte
  if (factors.ranking.score > 30) {
    analysis += `L'avantage au classement est significatif. `;
  }
  
  if (Math.abs(factors.surface.score) > 10) {
    const surfaceAdv = factors.surface.score > 0 ? winnerName : loserName;
    analysis += `${surfaceAdv} a un avantage sur cette surface. `;
  }
  
  if (tier === 'grand_slam' || tier === 'masters_1000') {
    analysis += `Ce match a lieu lors d'un tournoi majeur (${tournament}), ce qui augmente la fiabilité de la prédiction.`;
  } else if (tier.includes('challenger') || tier === 'itf') {
    analysis += `Attention: tournoi mineur, les prédictions sont moins fiables.`;
  }
  
  return analysis;
}

// ============================================
// EXPORTS
// ============================================

export { DEFAULT_WEIGHTS, TIER_MULTIPLIERS };
