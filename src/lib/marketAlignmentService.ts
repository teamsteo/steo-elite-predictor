/**
 * Market Alignment Service — CLV-Weighted Probability Adjustment
 * 
 * This service integrates Closing Line Value (CLV) data from oddsTrackingService
 * into the prediction pipeline. It adjusts model probabilities based on
 * market movements, using the principle that market consensus is a strong signal.
 * 
 * Pipeline position:
 *   Calibrated probability P → CLV adjustment → Market-aligned probability P'
 * 
 * Core principle:
 *   If the market moves in the direction of our prediction, it CONFIRMS our edge.
 *   If the market moves AGAINST our prediction, it SUGGESTS we may be wrong.
 * 
 * Adjustment formula:
 *   P' = P + (CLV_alignment × market_weight × confidence_scale)
 *   
 *   where:
 *   - CLV_alignment = sign agreement between model prediction and CLV direction
 *   - market_weight = base weight for CLV adjustment (default: 0.03 = 3%)
 *   - confidence_scale = scale factor based on CLV magnitude and number of snapshots
 * 
 * CLV Thresholds:
 *   - |CLV| < 0.05: Market stable — ignore (noise)
 *   - 0.05 ≤ |CLV| < 0.15: Moderate move — small adjustment
 *   - 0.15 ≤ |CLV| < 0.30: Significant move — medium adjustment
 *   - |CLV| ≥ 0.30: Steam move — large adjustment (but also a warning signal)
 */

import { calculateLiveCLV, CLVResult, type SteamMove } from './oddsTrackingService';

// ============================================
// TYPES
// ============================================

export interface MarketAlignmentResult {
  aligned: boolean;           // Did we apply an alignment?
  clvData: CLVResult | null; // Raw CLV data from oddsTrackingService
  homeAdjustment: number;     // Probability adjustment for home (-0.05 to +0.05)
  awayAdjustment: number;     // Probability adjustment for away (-0.05 to +0.05)
  steamDetected: boolean;     // Was a steam move detected?
  steamMove: SteamMove | null; // Steam move details if detected
  marketSignal: 'confirming' | 'contradicting' | 'neutral' | 'no_data';
  reasoning: string[];         // Human-readable reasoning for the adjustment
  adjustmentStrength: 'none' | 'subtle' | 'moderate' | 'strong';
}

export interface MarketAlignmentConfig {
  enabled: boolean;
  baseWeight: number;          // Max probability adjustment (default: 0.03 = 3%)
  minCLVMagnitude: number;     // Minimum CLV to consider (default: 0.05)
  steamThreshold: number;     // CLV magnitude that triggers steam warning (default: 0.25)
  requireMinSnapshots: number; // Minimum snapshots for CLV to be trustworthy (default: 2)
}

// ============================================
// DEFAULT CONFIGURATION
// ============================================

const DEFAULT_CONFIG: MarketAlignmentConfig = {
  enabled: true,
  baseWeight: 0.03,            // 3% max adjustment
  minCLVMagnitude: 0.05,       // Ignore CLV < 5 points
  steamThreshold: 0.25,        // Steam warning at 25+ points
  requireMinSnapshots: 2,      // At least 2 snapshots needed
};

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Calculate CLV-based market alignment for a match prediction.
 * Fetches CLV data from oddsTrackingService and applies probability adjustments.
 * 
 * @param matchId - The match identifier to look up CLV for
 * @param modelHomeProb - Model's predicted home win probability (0-1)
 * @param modelAwayProb - Model's predicted away win probability (0-1)
 * @param modelDrawProb - Model's predicted draw probability (0-1)
 * @param predictedBet - Which side the model favors: 'home', 'away', or 'draw'
 * @param config - Optional override for market alignment configuration
 * @returns MarketAlignmentResult with adjustments and reasoning
 */
export async function alignWithMarket(
  matchId: string,
  modelHomeProb: number,
  modelAwayProb: number,
  modelDrawProb: number,
  predictedBet: 'home' | 'away' | 'draw',
  config?: Partial<MarketAlignmentConfig>
): Promise<MarketAlignmentResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  const noAlignment: MarketAlignmentResult = {
    aligned: false,
    clvData: null,
    homeAdjustment: 0,
    awayAdjustment: 0,
    steamDetected: false,
    steamMove: null,
    marketSignal: 'no_data',
    reasoning: ['📊 Pas de données CLV disponibles pour ce match'],
    adjustmentStrength: 'none',
  };

  // Feature flag: allow disabling
  if (!cfg.enabled) {
    return { ...noAlignment, reasoning: ['📊 Alignement marché désactivé'] };
  }

  try {
    // Fetch CLV data for this match
    const clvResults = await calculateLiveCLV([matchId]);
    
    if (!clvResults || clvResults.length === 0) {
      return noAlignment;
    }

    const clv = clvResults[0];
    const reasoning: string[] = [];

    // Calculate CLV magnitude for our predicted side
    let ourCLV: number;
    let opponentCLV: number;

    if (predictedBet === 'home') {
      ourCLV = clv.clvHome;    // Positive = market moved toward home (confirming)
      opponentCLV = clv.clvAway;
    } else if (predictedBet === 'away') {
      ourCLV = clv.clvAway;    // Positive = market moved toward away (confirming)
      opponentCLV = clv.clvHome;
    } else {
      // Draw bets: use the side that moved less toward favorite
      ourCLV = -(Math.abs(clv.clvHome) + Math.abs(clv.clvAway)) * 0.3;
      opponentCLV = 0;
    }

    const clvMagnitude = Math.abs(ourCLV);
    const isConfirming = ourCLV > cfg.minCLVMagnitude;
    const isContradicting = opponentCLV > cfg.minCLVMagnitude && ourCLV < cfg.minCLVMagnitude;

    // Determine market signal
    let marketSignal: MarketAlignmentResult['marketSignal'];
    if (clvMagnitude < cfg.minCLVMagnitude) {
      marketSignal = 'neutral';
      reasoning.push(`📊 Marché stable (CLV=${ourCLV > 0 ? '+' : ''}${ourCLV.toFixed(2)}) — pas d'ajustement`);
    } else if (isConfirming) {
      marketSignal = 'confirming';
      reasoning.push(`📈 CLV CONFIRME ${predictedBet === 'home' ? 'home' : 'away'} (CLV=${ourCLV > 0 ? '+' : ''}${ourCLV.toFixed(2)}) — ajustement positif`);
    } else if (isContradicting) {
      marketSignal = 'contradicting';
      reasoning.push(`⚠️ CLV CONTREDIT ${predictedBet === 'home' ? 'home' : 'away'} (CLV adverse=${opponentCLV > 0 ? '+' : ''}${opponentCLV.toFixed(2)}) — ajustement négatif`);
    } else {
      marketSignal = 'neutral';
      reasoning.push(`📊 CLV modéré (${ourCLV > 0 ? '+' : ''}${ourCLV.toFixed(2)}) — ajustement minimal`);
    }

    // Check for steam move
    let steamDetected = clvMagnitude >= cfg.steamThreshold;
    let steamMove: SteamMove | null = null;
    
    if (steamDetected) {
      steamMove = {
        matchId,
        direction: ourCLV > 0 ? (predictedBet === 'home' ? 'home' : 'away') : 'away',
        changePercent: clvMagnitude * 100,
        severity: clvMagnitude >= 0.35 ? 'steam' : clvMagnitude >= 0.25 ? 'significant' : 'moderate',
        timeSpanHours: 0,
        oldOdds: predictedBet === 'home' ? clv.openingOddsHome : clv.openingOddsAway,
        newOdds: predictedBet === 'home' ? clv.currentOddsHome : clv.currentOddsAway,
      };
      reasoning.push(`🔥 STEAM MOVE détecté (${clvMagnitude > 0 ? '+' : ''}${(clvMagnitude * 100).toFixed(1)}% vers ${steamMove.direction}) — attention requise`);
    }

    // Calculate adjustment strength
    let adjustmentStrength: MarketAlignmentResult['adjustmentStrength'];
    let adjustmentScale: number;

    if (clvMagnitude < cfg.minCLVMagnitude) {
      adjustmentStrength = 'none';
      adjustmentScale = 0;
    } else if (clvMagnitude < 0.15) {
      adjustmentStrength = 'subtle';
      adjustmentScale = 0.3; // 30% of base weight
    } else if (clvMagnitude < 0.25) {
      adjustmentStrength = 'moderate';
      adjustmentScale = 0.6; // 60% of base weight
    } else {
      adjustmentStrength = 'strong';
      adjustmentScale = 1.0; // 100% of base weight
    }

    // Calculate probability adjustments
    let homeAdjustment = 0;
    let awayAdjustment = 0;
    const maxAdj = cfg.baseWeight * adjustmentScale;

    if (predictedBet === 'home') {
      if (isConfirming) {
        homeAdjustment = Math.min(maxAdj, ourCLV * 0.15);  // Positive: confirm home
      } else if (isContradicting) {
        homeAdjustment = -Math.min(maxAdj, opponentCLV * 0.15); // Negative: contradict home
        awayAdjustment = Math.min(maxAdj * 0.5, opponentCLV * 0.08);
      }
    } else if (predictedBet === 'away') {
      if (isConfirming) {
        awayAdjustment = Math.min(maxAdj, ourCLV * 0.15);
      } else if (isContradicting) {
        awayAdjustment = -Math.min(maxAdj, opponentCLV * 0.15);
        homeAdjustment = Math.min(maxAdj * 0.5, opponentCLV * 0.08);
      }
    } else {
      // Draw: minimal adjustment
      homeAdjustment = ourCLV * 0.03;
      awayAdjustment = -ourCLV * 0.03;
    }

    // Clamp adjustments to safe range
    homeAdjustment = Math.max(-cfg.baseWeight, Math.min(cfg.baseWeight, homeAdjustment));
    awayAdjustment = Math.max(-cfg.baseWeight, Math.min(cfg.baseWeight, awayAdjustment));

    return {
      aligned: adjustmentStrength !== 'none',
      clvData: clv,
      homeAdjustment,
      awayAdjustment,
      steamDetected,
      steamMove,
      marketSignal,
      reasoning,
      adjustmentStrength,
    };
  } catch (e) {
    console.debug('Market alignment failed:', e);
    return noAlignment;
  }
}

/**
 * Batch market alignment for multiple matches.
 * Fetches CLV for all matches at once for efficiency.
 */
export async function batchAlignWithMarket(
  matchIds: string[],
  predictions: Array<{
    matchId: string;
    homeProb: number;
    awayProb: number;
    drawProb: number;
    predictedBet: 'home' | 'away' | 'draw';
  }>,
  config?: Partial<MarketAlignmentConfig>
): Promise<Map<string, MarketAlignmentResult>> {
  const results = new Map<string, MarketAlignmentResult>();
  
  // Process in parallel (each calls calculateLiveCLV which uses its own cache)
  const promises = predictions.map(async (pred) => {
    const result = await alignWithMarket(
      pred.matchId,
      pred.homeProb,
      pred.awayProb,
      pred.drawProb,
      pred.predictedBet,
      config
    );
    results.set(pred.matchId, result);
  });
  
  await Promise.allSettled(promises);
  return results;
}
