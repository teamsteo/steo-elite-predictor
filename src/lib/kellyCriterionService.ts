/**
 * Kelly Criterion Service - Gestion Optimal du Bankroll
 * 
 * Le critère de Kelly détermine la mise optimale pour maximiser
 * la croissance du capital à long terme tout en minimisant le risque.
 * 
 * Formule: f* = (bp - q) / b
 * - f* = fraction du bankroll à miser
 * - b = cote décimale - 1
 * - p = probabilité estimée de gagner
 * - q = 1 - p (probabilité de perdre)
 * 
 * AJUSTEMENTS:
 * - Fractional Kelly (1/2, 1/4) pour réduire la volatilité
 * - Plafonds max pour protection
 * - Ajustement selon confiance du modèle
 * - Ajustement par ligue (performance historique)
 * - Ajustement CLV (Closing Line Value)
 * - Suivi de bankroll réel avec historique
 */

import { createClient } from '@supabase/supabase-js';

// ============================================
// TYPES
// ============================================

export interface KellyInput {
  odds: number; // Cote décimale (ex: 2.10)
  probability: number; // Probabilité estimée (0-100)
  confidence?: 'very_high' | 'high' | 'medium' | 'low'; // Confiance du modèle
  bankroll: number; // Bankroll actuel
}

export interface KellyResult {
  fraction: number; // Fraction du bankroll à miser (0-1)
  amount: number; // Montant en €
  edge: number; // Avantage (en %)
  expectedValue: number; // Valeur attendue
  riskLevel: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  recommendation: 'strong_bet' | 'bet' | 'small_bet' | 'skip' | 'avoid';
  explanation: string;
  kellyType: 'full' | 'half' | 'quarter';
}

export interface BankrollStats {
  currentBankroll: number;
  startingBankroll: number;
  totalBets: number;
  winRate: number;
  roi: number; // Return on Investment
  profitLoss: number;
  averageStake: number;
  biggestWin: number;
  biggestLoss: number;
  currentStreak: number;
  maxStreak: number;
}

// ============================================
// NEW TYPES: Bankroll History & Manager
// ============================================

export interface BankrollHistoryEntry {
  date: string;
  betId: string;
  league: string;
  sport: string;
  odds: number;
  stake: number;
  won: boolean;
  profit: number;
  bankrollAfter: number;
  kellyFraction: number;
}

export interface BankrollManager {
  currentBankroll: number;
  startingBankroll: number;
  totalBets: number;
  winRate: number;
  roi: number;
  profitLoss: number;
  maxDrawdown: number;
  currentStreak: number;
  history: BankrollHistoryEntry[];

  placeBet(bet: {
    betId: string;
    league: string;
    sport: string;
    odds: number;
    probability: number;
    confidence?: string;
    won: boolean;
  }): BankrollStats;

  getStats(): BankrollStats;
  reset(newBankroll: number): void;
}

// CLV-aware Kelly input extension
export interface CLVAwareKellyInput extends KellyInput {
  clv?: number;   // Closing Line Value (-1 to 1). Positive = market moved in our direction.
  slippage?: number; // Expected slippage (0-0.05). Deducted from effective odds.
}

export interface CLVAwareKellyResult extends KellyResult {
  clvAdjustment: {
    adjustedEdge: number;
    slippageDeduction: number;
  };
}

// ============================================
// CONSTANTES
// ============================================

// Limites de protection
const MAX_KELLY_FRACTION = 0.10; // Max 10% du bankroll par bet
const MIN_BANKROLL = 10; // Minimum pour calculer
const DEFAULT_BANKROLL = 1000; // Bankroll par défaut

// Ajustements selon confiance
const CONFIDENCE_MULTIPLIERS: Record<string, number> = {
  'very_high': 1.0, // Kelly complet
  'high': 0.75, // 3/4 Kelly
  'medium': 0.5, // 1/2 Kelly
  'low': 0.25, // 1/4 Kelly
};

// Seuils de recommandation
const RECOMMENDATION_THRESHOLDS = {
  strong_bet: { minEdge: 10, minFraction: 0.03 },
  bet: { minEdge: 5, minFraction: 0.01 },
  small_bet: { minEdge: 2, minFraction: 0.005 },
  skip: { minEdge: 0 },
  avoid: { minEdge: -100 },
};

// ============================================
// FONCTIONS PRINCIPALES
// ============================================

/**
 * Calcule la mise optimale selon le critère de Kelly
 */
export function calculateKellyBet(input: KellyInput): KellyResult {
  const {
    odds,
    probability,
    confidence = 'medium',
    bankroll = DEFAULT_BANKROLL
  } = input;

  // Validation
  if (odds <= 1 || probability < 0 || probability > 100 || bankroll < MIN_BANKROLL) {
    return createInvalidResult(bankroll);
  }

  // Conversion probabilité
  const p = probability / 100;
  const q = 1 - p;
  
  // Cote en format b = decimal - 1
  const b = odds - 1;
  
  // Kelly formule: f* = (bp - q) / b
  let kellyFraction = (b * p - q) / b;
  
  // Edge (avantage)
  const edge = kellyFraction * 100;
  
  // Expected Value
  const expectedValue = (p * b - q) * 100;
  
  // Si Kelly négatif, pas de value
  if (kellyFraction <= 0) {
    return {
      fraction: 0,
      amount: 0,
      edge: edge,
      expectedValue: expectedValue,
      riskLevel: 'very_low',
      recommendation: 'avoid',
      explanation: `Pas de value bet. Cote implicite: ${(1/odds*100).toFixed(1)}%, notre proba: ${probability.toFixed(1)}%`,
      kellyType: 'full',
    };
  }
  
  // Appliquer l'ajustement selon confiance
  const confidenceMultiplier = CONFIDENCE_MULTIPLIERS[confidence] || 0.5;
  let adjustedFraction = kellyFraction * confidenceMultiplier;
  
  // Déterminer le type de Kelly
  let kellyType: 'full' | 'half' | 'quarter' = 'full';
  if (confidenceMultiplier <= 0.25) kellyType = 'quarter';
  else if (confidenceMultiplier <= 0.5) kellyType = 'half';
  
  // Plafonner à MAX_KELLY_FRACTION
  adjustedFraction = Math.min(adjustedFraction, MAX_KELLY_FRACTION);
  
  // Calculer le montant
  const amount = Math.round(adjustedFraction * bankroll * 100) / 100;
  
  // Déterminer le niveau de risque
  const riskLevel = determineRiskLevel(adjustedFraction, edge);
  
  // Déterminer la recommandation
  const recommendation = determineRecommendation(edge, adjustedFraction);
  
  // Explication
  const explanation = generateExplanation(edge, odds, probability, adjustedFraction, confidence);
  
  return {
    fraction: adjustedFraction,
    amount,
    edge: Math.round(edge * 10) / 10,
    expectedValue: Math.round(expectedValue * 10) / 10,
    riskLevel,
    recommendation,
    explanation,
    kellyType,
  };
}

/**
 * Calcule l'edge pour une cote donnée
 */
export function calculateEdge(odds: number, probability: number): number {
  const impliedProbability = (1 / odds) * 100;
  return probability - impliedProbability;
}

/**
 * Vérifie si un bet est une value bet
 */
export function isValueBet(odds: number, probability: number, minEdge: number = 2): boolean {
  const edge = calculateEdge(odds, probability);
  return edge >= minEdge;
}

/**
 * Calcule la mise optimale pour plusieurs bets (diversification)
 */
export function calculateOptimalPortfolio(
  bets: Array<{ odds: number; probability: number; confidence?: 'very_high' | 'high' | 'medium' | 'low' }>,
  bankroll: number
): Array<{ amount: number; fraction: number; kellyResult: KellyResult }> {
  const totalKellyFraction = bets.reduce((sum, bet) => {
    const result = calculateKellyBet({ ...bet, bankroll });
    return sum + result.fraction;
  }, 0);
  
  // Si le total dépasse 25% du bankroll, réduire proportionnellement
  const maxTotalFraction = 0.25;
  const scaleFactor = totalKellyFraction > maxTotalFraction 
    ? maxTotalFraction / totalKellyFraction 
    : 1;
  
  return bets.map(bet => {
    const result = calculateKellyBet({ ...bet, bankroll });
    const scaledFraction = result.fraction * scaleFactor;
    return {
      fraction: scaledFraction,
      amount: Math.round(scaledFraction * bankroll * 100) / 100,
      kellyResult: result,
    };
  });
}

/**
 * Simule l'évolution du bankroll
 */
export function simulateBankrollEvolution(
  startingBankroll: number,
  bets: Array<{ odds: number; probability: number; won: boolean }>,
  kellyFraction: number = 0.05
): { finalBankroll: number; history: number[]; maxDrawdown: number } {
  let bankroll = startingBankroll;
  const history = [bankroll];
  let maxBankroll = bankroll;
  let maxDrawdown = 0;
  
  for (const bet of bets) {
    const stake = bankroll * kellyFraction;
    
    if (bet.won) {
      const profit = stake * (bet.odds - 1);
      bankroll += profit;
    } else {
      bankroll -= stake;
    }
    
    history.push(bankroll);
    
    // Calculer drawdown
    if (bankroll > maxBankroll) maxBankroll = bankroll;
    const drawdown = (maxBankroll - bankroll) / maxBankroll;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  return {
    finalBankroll: bankroll,
    history,
    maxDrawdown: Math.round(maxDrawdown * 100),
  };
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

function createInvalidResult(bankroll: number): KellyResult {
  return {
    fraction: 0,
    amount: 0,
    edge: 0,
    expectedValue: 0,
    riskLevel: 'very_low',
    recommendation: 'skip',
    explanation: 'Paramètres invalides',
    kellyType: 'full',
  };
}

function determineRiskLevel(fraction: number, edge: number): KellyResult['riskLevel'] {
  if (fraction < 0.01 || edge < 2) return 'very_low';
  if (fraction < 0.03 || edge < 5) return 'low';
  if (fraction < 0.05 || edge < 8) return 'medium';
  if (fraction < 0.08 || edge < 12) return 'high';
  return 'very_high';
}

function determineRecommendation(edge: number, fraction: number): KellyResult['recommendation'] {
  if (edge >= 10 && fraction >= 0.03) return 'strong_bet';
  if (edge >= 5 && fraction >= 0.01) return 'bet';
  if (edge >= 2 && fraction >= 0.005) return 'small_bet';
  if (edge >= 0) return 'skip';
  return 'avoid';
}

function generateExplanation(
  edge: number,
  odds: number,
  probability: number,
  fraction: number,
  confidence: string
): string {
  const impliedProb = (1 / odds * 100).toFixed(1);
  const confidenceLabel = confidence === 'very_high' ? 'très haute' 
    : confidence === 'high' ? 'haute' 
    : confidence === 'medium' ? 'moyenne' 
    : 'faible';
  
  if (edge < 0) {
    return `❌ Pas de value. Cote implicite ${impliedProb}% > notre proba ${probability.toFixed(1)}%`;
  }
  
  if (edge < 2) {
    return `⚠️ Edge faible (${edge.toFixed(1)}%). Pas rentable après vig.`;
  }
  
  return `✅ Edge ${edge.toFixed(1)}% | Cote ${odds} vs proba ${probability.toFixed(1)}% | Confiance ${confidenceLabel} | Mise ${(fraction * 100).toFixed(1)}%`;
}

// ============================================
// PILIER 5: SUIVI PERFORMANCE PAR LIGUE
// ============================================

export interface LeaguePerformance {
  league: string;
  totalBets: number;
  wins: number;
  losses: number;
  profit: number;
  roi: number;
  avgEdge: number;
  // Recommandation d'allocation Kelly
  kellyMultiplier: number; // 1.0 = normal, 0.5 = réduire, 0 = couper
  recommendation: 'strong' | 'normal' | 'reduce' | 'cut';
  lastUpdated: string;
  // ENHANCED: track individual bet results for recency/streak/variance
  recentResults?: boolean[];       // true = win, false = loss (most recent last)
  totalStakes?: number[];          // stake amounts for variance calculation
  lastBetDate?: string;            // ISO date of most recent bet
}

// Store en mémoire (persist via Supabase/ml_model export en production)
let leaguePerformanceStore: Record<string, LeaguePerformance> = {};

// Seuils pour l'allocation par ligue
const LEAGUE_ALLOCATION_THRESHOLDS = {
  strong: { minRoi: 5, minBets: 10, minWinRate: 0.45, kellyMultiplier: 1.0 },
  normal: { minRoi: 0, minBets: 5, minWinRate: 0.35, kellyMultiplier: 0.75 },
  reduce: { minRoi: -10, minBets: 5, minWinRate: 0.25, kellyMultiplier: 0.25 },
  cut: { minRoi: -Infinity, minBets: 0, minWinRate: 0, kellyMultiplier: 0 },
};

// Maximum number of recent results to keep per league (for recency/streak)
const MAX_RECENT_RESULTS = 50;

/**
 * Met à jour la performance d'une ligue après un résultat
 */
export function updateLeaguePerformance(
  league: string,
  edge: number,
  odds: number,
  won: boolean,
  stake: number
): void {
  if (!leaguePerformanceStore[league]) {
    leaguePerformanceStore[league] = {
      league,
      totalBets: 0,
      wins: 0,
      losses: 0,
      profit: 0,
      roi: 0,
      avgEdge: 0,
      kellyMultiplier: 1.0,
      recommendation: 'normal',
      lastUpdated: new Date().toISOString(),
      recentResults: [],
      totalStakes: [],
      lastBetDate: undefined,
    };
  }

  const lp = leaguePerformanceStore[league];
  lp.totalBets += 1;
  lp.wins += won ? 1 : 0;
  lp.losses += won ? 0 : 1;
  lp.profit += won ? stake * (odds - 1) : -stake;
  lp.roi = lp.totalBets > 0 ? (lp.profit / (lp.totalBets * stake)) * 100 : 0;
  lp.avgEdge = ((lp.avgEdge * (lp.totalBets - 1)) + edge) / lp.totalBets;

  // Track recent results for recency/streak/variance analysis
  if (!lp.recentResults) lp.recentResults = [];
  if (!lp.totalStakes) lp.totalStakes = [];
  lp.recentResults.push(won);
  lp.totalStakes.push(stake);
  lp.lastBetDate = new Date().toISOString();

  // Trim to keep bounded
  if (lp.recentResults.length > MAX_RECENT_RESULTS) {
    lp.recentResults = lp.recentResults.slice(-MAX_RECENT_RESULTS);
    lp.totalStakes = lp.totalStakes.slice(-MAX_RECENT_RESULTS);
  }

  // Recalculer la recommandation
  const thresholds = LEAGUE_ALLOCATION_THRESHOLDS;
  if (lp.roi >= thresholds.strong.minRoi && lp.totalBets >= thresholds.strong.minBets) {
    lp.recommendation = 'strong';
    lp.kellyMultiplier = thresholds.strong.kellyMultiplier;
  } else if (lp.roi >= thresholds.normal.minRoi && lp.totalBets >= thresholds.normal.minBets) {
    lp.recommendation = 'normal';
    lp.kellyMultiplier = thresholds.normal.kellyMultiplier;
  } else if (lp.roi >= thresholds.reduce.minRoi && lp.totalBets >= thresholds.reduce.minBets) {
    lp.recommendation = 'reduce';
    lp.kellyMultiplier = thresholds.reduce.kellyMultiplier;
  } else {
    lp.recommendation = 'cut';
    lp.kellyMultiplier = thresholds.cut.kellyMultiplier;
  }

  lp.lastUpdated = new Date().toISOString();
}

/**
 * Calcule la mise Kelly ajustée pour une ligue spécifique
 * Applique le multiplicateur d'allocation basé sur la performance historique
 * 
 * ENHANCED: also factors in recency bias, variance adjustment, and streak adjustment
 */
export function calculateLeagueAdjustedKellyBet(
  input: KellyInput & { league: string }
): KellyResult & {
  leagueAdjustment: {
    multiplier: number;
    recommendation: string;
    recencyFactor: number;
    varianceFactor: number;
    streakFactor: number;
    breakdown: string;
  };
} {
  const baseResult = calculateKellyBet(input);

  const lp = leaguePerformanceStore[input.league];
  let baseMultiplier = lp ? lp.kellyMultiplier : 1.0;
  const recommendation = lp ? lp.recommendation : 'normal';

  // --- ENHANCED: Recency Bias ---
  // Leagues with more recent activity (within 7 days) get a slight boost;
  // leagues inactive for 30+ days get a penalty.
  let recencyFactor = 1.0;
  if (lp?.lastBetDate) {
    const daysSinceLastBet = (Date.now() - new Date(lp.lastBetDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastBet <= 7) {
      recencyFactor = 1.0; // Fully active - no penalty
    } else if (daysSinceLastBet <= 14) {
      recencyFactor = 0.95; // Slightly stale
    } else if (daysSinceLastBet <= 30) {
      recencyFactor = 0.85; // Stale data
    } else {
      recencyFactor = 0.70; // Very stale, reduce trust
    }
  }

  // --- ENHANCED: Variance Adjustment ---
  // If a league has high variance in ROI across recent bets, reduce allocation.
  // We compute the coefficient of variation of per-bet returns.
  let varianceFactor = 1.0;
  if (lp?.recentResults && lp?.totalStakes && lp.recentResults.length >= 5) {
    const results = lp.recentResults;
    const stakes = lp.totalStakes;
    // Calculate per-bet ROI percentage for recent bets
    const betRois: number[] = [];
    for (let i = 0; i < results.length; i++) {
      const stake = stakes[i] || 1; // avoid division by zero
      if (results[i]) {
        // Estimate profit from avgEdge as we don't store per-bet odds
        const estimatedProfit = (lp.avgEdge / 100) * stake;
        betRois.push((estimatedProfit / stake) * 100);
      } else {
        betRois.push(-100); // full loss
      }
    }
    if (betRois.length > 1) {
      const mean = betRois.reduce((s, v) => s + v, 0) / betRois.length;
      const variance = betRois.reduce((s, v) => s + (v - mean) ** 2, 0) / betRois.length;
      const stdDev = Math.sqrt(variance);
      // Coefficient of variation: stdDev / |mean|
      const absMean = Math.abs(mean) || 1;
      const cv = stdDev / absMean;
      // High CV means unstable performance: penalize
      if (cv > 3) {
        varianceFactor = 0.6;
      } else if (cv > 2) {
        varianceFactor = 0.75;
      } else if (cv > 1.5) {
        varianceFactor = 0.9;
      }
      // else varianceFactor stays 1.0
    }
  }

  // --- ENHANCED: Streak Adjustment ---
  // If a league is on a cold streak (3+ consecutive losses), reduce by 50%.
  // Hot streaks (3+ consecutive wins) give a small bonus.
  let streakFactor = 1.0;
  if (lp?.recentResults && lp.recentResults.length >= 3) {
    // Count consecutive losses from the most recent bet backwards
    let consecutiveLosses = 0;
    for (let i = lp.recentResults.length - 1; i >= 0; i--) {
      if (!lp.recentResults[i]) {
        consecutiveLosses++;
      } else {
        break;
      }
    }
    if (consecutiveLosses >= 3) {
      streakFactor = 0.5; // Cold streak: 50% reduction
    } else if (consecutiveLosses === 2) {
      streakFactor = 0.8; // Two losses: mild caution
    }
    // Hot streak bonus (3+ consecutive wins)
    let consecutiveWins = 0;
    for (let i = lp.recentResults.length - 1; i >= 0; i--) {
      if (lp.recentResults[i]) {
        consecutiveWins++;
      } else {
        break;
      }
    }
    if (consecutiveWins >= 5) {
      streakFactor = Math.max(streakFactor, 1.1); // Cap at 10% bonus
    } else if (consecutiveWins >= 3) {
      streakFactor = Math.max(streakFactor, 1.05); // Small 5% bonus
    }
  }

  // Combine all factors
  const combinedMultiplier = baseMultiplier * recencyFactor * varianceFactor * streakFactor;

  // Build breakdown string
  const parts: string[] = [];
  parts.push(`base:${baseMultiplier.toFixed(2)}`);
  if (recencyFactor !== 1.0) parts.push(`recency:${recencyFactor.toFixed(2)}`);
  if (varianceFactor !== 1.0) parts.push(`variance:${varianceFactor.toFixed(2)}`);
  if (streakFactor !== 1.0) parts.push(`streak:${streakFactor.toFixed(2)}`);
  const breakdown = parts.join(' × ') + ` = ${combinedMultiplier.toFixed(3)}`;

  // Appliquer le multiplicateur combiné
  const adjustedAmount = baseResult.amount * combinedMultiplier;
  const adjustedFraction = baseResult.fraction * combinedMultiplier;

  return {
    ...baseResult,
    amount: Math.round(adjustedAmount * 100) / 100,
    fraction: adjustedFraction,
    leagueAdjustment: {
      multiplier: Math.round(combinedMultiplier * 1000) / 1000,
      recommendation,
      recencyFactor: Math.round(recencyFactor * 1000) / 1000,
      varianceFactor: Math.round(varianceFactor * 1000) / 1000,
      streakFactor: Math.round(streakFactor * 1000) / 1000,
      breakdown,
    },
  };
}

/**
 * Charge les performances par ligue depuis les résultats ML (export Supabase)
 */
export function loadLeaguePerformanceFromML(mlResults: Record<string, {
  league_performance?: Record<string, {
    samples: number;
    accuracy: number;
    roi_simulated: number;
    recommendation: string;
  }>;
}>): void {
  for (const [sport, result] of Object.entries(mlResults)) {
    const lp = result.league_performance;
    if (!lp) continue;

    for (const [league, data] of Object.entries(lp)) {
      const key = league;
      if (!leaguePerformanceStore[key]) {
        leaguePerformanceStore[key] = {
          league: key,
          totalBets: data.samples || 0,
          wins: Math.round(data.accuracy * data.samples),
          losses: data.samples - Math.round(data.accuracy * data.samples),
          profit: data.roi_simulated * data.samples / 100,
          roi: data.roi_simulated,
          avgEdge: 0,
          kellyMultiplier: 1.0,
          recommendation: 'normal',
          lastUpdated: new Date().toISOString(),
          recentResults: [],
          totalStakes: [],
          lastBetDate: undefined,
        };
      } else {
        // Mettre à jour avec les données ML si plus récentes
        const existing = leaguePerformanceStore[key];
        if (data.samples > existing.totalBets) {
          existing.totalBets = data.samples;
          existing.roi = data.roi_simulated;
          existing.recommendation = data.recommendation as 'strong' | 'normal' | 'reduce' | 'cut';
          existing.kellyMultiplier =
            data.recommendation === 'strong' ? 1.0 :
            data.recommendation === 'normal' ? 0.75 :
            data.recommendation === 'reduce' ? 0.25 : 0;
        }
      }
    }
  }
}

/**
 * Retourne le résumé des performances par ligue
 */
export function getLeaguePerformanceSummary(): {
  total: number;
  strong: string[];
  normal: string[];
  reduce: string[];
  cut: string[];
  topLeagues: LeaguePerformance[];
} {
  const entries = Object.values(leaguePerformanceStore);
  return {
    total: entries.length,
    strong: entries.filter(e => e.recommendation === 'strong').map(e => e.league),
    normal: entries.filter(e => e.recommendation === 'normal').map(e => e.league),
    reduce: entries.filter(e => e.recommendation === 'reduce').map(e => e.league),
    cut: entries.filter(e => e.recommendation === 'cut').map(e => e.league),
    topLeagues: entries.sort((a, b) => b.roi - a.roi).slice(0, 10),
  };
}

// ============================================
// SUPABASE PERSISTENCE FOR LEAGUE PERFORMANCE
// ============================================

/**
 * Persist league performance to Supabase ml_model table
 * Stores in a dedicated field `kelly_league_performance`
 * alongside the existing xgboost_params
 */
export async function persistLeaguePerformance(
  supabaseUrl: string,
  supabaseKey: string
): Promise<boolean> {
  try {
    const client = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const serialized = JSON.parse(JSON.stringify(leaguePerformanceStore));

    const { error } = await client
      .from('ml_model')
      .update({ kelly_league_performance: serialized } as any)
      .eq('id', 'default_model');

    if (error) {
      console.warn('⚠️ Kelly: persistLeaguePerformance update failed:', error.message);
      console.info('ℹ️ Ensure the ml_model table has a kelly_league_performance JSONB column.');
      console.info('   Run: ALTER TABLE ml_model ADD COLUMN IF NOT EXISTS kelly_league_performance JSONB;');
      return false;
    }

    console.log(`✅ Kelly: League performance persisted (${Object.keys(leaguePerformanceStore).length} leagues)`);
    return true;
  } catch (e: any) {
    console.error('❌ Kelly: Exception persisting league performance:', e.message);
    return false;
  }
}

/**
 * Load league performance from Supabase on startup/cold start
 * Called once when the service initializes. Populates leaguePerformanceStore.
 */
export async function loadLeaguePerformanceFromSupabase(
  supabaseUrl: string,
  supabaseKey: string
): Promise<void> {
  try {
    const client = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await client
      .from('ml_model')
      .select('kelly_league_performance')
      .eq('id', 'default_model')
      .single();

    if (error) {
      console.warn('⚠️ Kelly: loadLeaguePerformanceFromSupabase query failed:', error.message);
      return;
    }

    const raw = data?.kelly_league_performance;
    if (!raw || typeof raw !== 'object') {
      console.log('ℹ️ Kelly: No persisted league performance found, starting fresh.');
      return;
    }

    // Parse if stored as string (JSONB may come back parsed already)
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;

    // Validate and load into the store
    const entries = parsed as Record<string, LeaguePerformance>;
    let loaded = 0;
    for (const [key, value] of Object.entries(entries)) {
      if (value && typeof value === 'object' && 'league' in value) {
        leaguePerformanceStore[key] = {
          ...value,
          // Ensure new fields exist (backwards compat)
          recentResults: value.recentResults || [],
          totalStakes: value.totalStakes || [],
          lastBetDate: value.lastBetDate || undefined,
        };
        loaded++;
      }
    }

    console.log(`✅ Kelly: Loaded league performance for ${loaded} leagues from Supabase.`);
  } catch (e: any) {
    console.error('❌ Kelly: Exception loading league performance:', e.message);
  }
}

// ============================================
// REAL BANKROLL TRACKING (BankrollManager)
// ============================================

/**
 * Creates a BankrollManager instance that tracks actual bankroll over time.
 * Includes full history, drawdown tracking, streak computation, and stats.
 */
function createBankrollManager(initialBankroll: number = DEFAULT_BANKROLL): BankrollManager {
  let currentBankroll = initialBankroll;
  const startingBankroll = initialBankroll;
  let totalBets = 0;
  let totalWins = 0;
  let totalStaked = 0;
  let totalProfit = 0;
  let biggestWin = 0;
  let biggestLoss = 0;
  let maxBankroll = initialBankroll;
  let maxDrawdown = 0;
  let currentStreak = 0; // positive = wins, negative = losses
  let maxStreak = 0;
  const history: BankrollHistoryEntry[] = [];

  function getStats(): BankrollStats {
    const winRate = totalBets > 0 ? (totalWins / totalBets) * 100 : 0;
    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
    const averageStake = totalBets > 0 ? totalStaked / totalBets : 0;
    return {
      currentBankroll: Math.round(currentBankroll * 100) / 100,
      startingBankroll: Math.round(startingBankroll * 100) / 100,
      totalBets,
      winRate: Math.round(winRate * 10) / 10,
      roi: Math.round(roi * 100) / 100,
      profitLoss: Math.round(totalProfit * 100) / 100,
      averageStake: Math.round(averageStake * 100) / 100,
      biggestWin: Math.round(biggestWin * 100) / 100,
      biggestLoss: Math.round(biggestLoss * 100) / 100,
      currentStreak,
      maxStreak,
    };
  }

  function placeBet(bet: {
    betId: string;
    league: string;
    sport: string;
    odds: number;
    probability: number;
    confidence?: string;
    won: boolean;
  }): BankrollStats {
    // Calculate Kelly stake based on current bankroll
    const kellyResult = calculateKellyBet({
      odds: bet.odds,
      probability: bet.probability,
      confidence: (bet.confidence as KellyInput['confidence']) || 'medium',
      bankroll: currentBankroll,
    });

    const stake = kellyResult.amount;
    const kellyFraction = kellyResult.fraction;

    // Calculate profit/loss
    let profit: number;
    if (bet.won) {
      profit = stake * (bet.odds - 1);
    } else {
      profit = -stake;
    }

    // Update bankroll
    currentBankroll += profit;
    if (currentBankroll < 0) currentBankroll = 0;

    // Update tracking
    totalBets++;
    totalStaked += stake;
    totalProfit += profit;
    if (bet.won) totalWins++;
    if (profit > biggestWin) biggestWin = profit;
    if (profit < biggestLoss) biggestLoss = profit;

    // Drawdown tracking
    if (currentBankroll > maxBankroll) maxBankroll = currentBankroll;
    const drawdown = maxBankroll > 0 ? (maxBankroll - currentBankroll) / maxBankroll : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    // Streak tracking
    if (bet.won) {
      currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
    } else {
      currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
    }
    const absStreak = Math.abs(currentStreak);
    if (absStreak > maxStreak) maxStreak = absStreak;

    // Record history
    const entry: BankrollHistoryEntry = {
      date: new Date().toISOString(),
      betId: bet.betId,
      league: bet.league,
      sport: bet.sport,
      odds: bet.odds,
      stake: Math.round(stake * 100) / 100,
      won: bet.won,
      profit: Math.round(profit * 100) / 100,
      bankrollAfter: Math.round(currentBankroll * 100) / 100,
      kellyFraction: Math.round(kellyFraction * 10000) / 10000,
    };
    history.push(entry);

    // Keep history bounded (last 500 bets)
    if (history.length > 500) {
      history.splice(0, history.length - 500);
    }

    return getStats();
  }

  function reset(newBankroll: number): void {
    currentBankroll = newBankroll;
    totalBets = 0;
    totalWins = 0;
    totalStaked = 0;
    totalProfit = 0;
    biggestWin = 0;
    biggestLoss = 0;
    maxBankroll = newBankroll;
    maxDrawdown = 0;
    currentStreak = 0;
    maxStreak = 0;
    history.length = 0;
  }

  return {
    get currentBankroll() { return Math.round(currentBankroll * 100) / 100; },
    get startingBankroll() { return Math.round(startingBankroll * 100) / 100; },
    get totalBets() { return totalBets; },
    get winRate() { return getStats().winRate; },
    get roi() { return getStats().roi; },
    get profitLoss() { return getStats().profitLoss; },
    get maxDrawdown() { return Math.round(maxDrawdown * 10000) / 100; },
    get currentStreak() { return currentStreak; },
    get history() { return history; },
    placeBet,
    getStats,
    reset,
  };
}

/**
 * Singleton BankrollManager instance.
 * Use getBankrollManager() to access it.
 */
let _bankrollManager: BankrollManager | null = null;

/**
 * Returns the singleton BankrollManager.
 * Optionally initializes with a specific bankroll (only on first call).
 */
export function getBankrollManager(initialBankroll?: number): BankrollManager {
  if (!_bankrollManager) {
    _bankrollManager = createBankrollManager(initialBankroll ?? DEFAULT_BANKROLL);
  }
  return _bankrollManager;
}

// ============================================
// CLV-AWARE KELLY
// ============================================

/**
 * Calculate CLV-aware Kelly bet.
 * 
 * CLV (Closing Line Value) measures whether the market moved in our direction.
 * - Positive CLV (+0.02 to +0.10): market moved toward our pick → increase confidence
 * - Negative CLV: market moved against us → decrease confidence
 * 
 * Slippage represents the expected difference between quoted odds and actual fill.
 * - Typical slippage: 0.01 to 0.03 (1-3%)
 * - Reduces effective odds, thereby reducing Kelly stake
 */
export function calculateCLVAwareKellyBet(input: CLVAwareKellyInput): CLVAwareKellyResult {
  const { clv, slippage, odds, probability, confidence, bankroll } = input;

  // Start with base Kelly result
  const baseResult = calculateKellyBet({ odds, probability, confidence, bankroll });

  // --- CLV Adjustment ---
  // CLV is in range -1 to +1 typically, but in practice -0.10 to +0.10
  // Positive CLV means the closing line moved in our favor (good signal)
  const clvValue = clv || 0;
  // Map CLV to an edge adjustment: each 0.01 of CLV adds ~0.5% to the effective edge
  const clvEdgeBonus = clvValue * 50; // e.g. CLV=0.04 → +2% edge bonus

  // --- Slippage Deduction ---
  // Slippage reduces the effective odds: effective_odds = odds * (1 - slippage)
  const slippageValue = slippage || 0;
  const effectiveOdds = odds * (1 - slippageValue);
  const slippageDeduction = odds - effectiveOdds; // absolute odds lost to slippage

  // Recalculate Kelly with CLV-adjusted probability and slippage-reduced odds
  const adjustedProbability = Math.min(100, Math.max(0, probability + clvEdgeBonus));
  const clvAdjustedResult = calculateKellyBet({
    odds: effectiveOdds,
    probability: adjustedProbability,
    confidence,
    bankroll,
  });

  // If base result was already a skip/avoid, respect that
  if (baseResult.recommendation === 'avoid') {
    return {
      ...baseResult,
      clvAdjustment: {
        adjustedEdge: Math.round((baseResult.edge + clvEdgeBonus - (slippageValue * 100)) * 10) / 10,
        slippageDeduction: Math.round(slippageDeduction * 1000) / 1000,
      },
    };
  }

  // Use the CLV-adjusted result but enhance the explanation
  const adjustedEdge = clvAdjustedResult.edge;
  const explanation = baseResult.explanation
    + (clvValue > 0 ? ` | CLV +${(clvValue * 100).toFixed(1)}% ↑` : clvValue < 0 ? ` | CLV ${(clvValue * 100).toFixed(1)}% ↓` : '')
    + (slippageValue > 0 ? ` | Slippage -${(slippageValue * 100).toFixed(1)}%` : '');

  return {
    ...clvAdjustedResult,
    explanation,
    clvAdjustment: {
      adjustedEdge: Math.round(adjustedEdge * 10) / 10,
      slippageDeduction: Math.round(slippageDeduction * 1000) / 1000,
    },
  };
}

// ============================================
// EXPORT
// ============================================

const KellyCriterionService = {
  calculateKellyBet,
  calculateEdge,
  isValueBet,
  calculateOptimalPortfolio,
  simulateBankrollEvolution,
  // Pilier 5
  updateLeaguePerformance,
  calculateLeagueAdjustedKellyBet,
  loadLeaguePerformanceFromML,
  getLeaguePerformanceSummary,
  // Supabase persistence
  persistLeaguePerformance,
  loadLeaguePerformanceFromSupabase,
  // Bankroll Manager
  getBankrollManager,
  // CLV-aware
  calculateCLVAwareKellyBet,
};

export default KellyCriterionService;
