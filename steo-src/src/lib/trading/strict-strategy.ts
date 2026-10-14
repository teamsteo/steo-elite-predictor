// IMPROVED Trading Strategy - V2 with Strict Filters
// Key improvements:
// 1. Contextual Filter: Only trade WITH the trend (EMA 200)
// 2. Risk/Reward: Minimum 1:3 ratio
// 3. Confluence Threshold: Minimum 75/100
// 4. Volume confirmation required

import { Candle, Timeframe, IndicatorValues } from './types';
import { DetectedPattern, detectAllPatterns } from './patterns';
import { calculateAllIndicators } from './indicators';

// ============================================
// STRICT STRATEGY PARAMETERS
// ============================================

const CONFIG = {
  // Minimum confluence score to trade (was 55, now 75)
  MIN_CONFLUENCE: 75,
  
  // Risk:Reward ratio (was 2:1, now 3:1)
  RISK_REWARD: 3,
  
  // ATR multiplier for stop loss
  SL_ATR_MULTIPLIER: 1.5,
  
  // Minimum volume relative to average
  MIN_VOLUME_RATIO: 0.8,
};

// ============================================
// IMPROVED SIGNAL
// ============================================

export interface StrictSignal {
  direction: 'BUY' | 'SELL' | 'WAIT';
  confidence: number;
  confluence: {
    total: number;
    trendFilter: number;      // Must be > 0 to trade
    momentumAlignment: number;
    patternScore: number;
    rsiCondition: number;
    volumeConfirm: number;    // NEW: Volume check
    sessionScore: number;
  };
  risk: {
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    riskRewardRatio: number;
    maxPipsRisk: number;
    maxPipsTarget: number;
  };
  trend: {
    direction: 'bullish' | 'bearish' | 'ranging';
    priceVsEma200: 'above' | 'below' | 'neutral';
    emaAlignment: boolean;
  };
  warnings: string[];
  reasons: string[];
}

// ============================================
// CONTEXTUAL TREND FILTER (CRITICAL)
// ============================================

function analyzeTrend(indicators: IndicatorValues, currentPrice: number): {
  direction: 'bullish' | 'bearish' | 'ranging';
  priceVsEma200: 'above' | 'below' | 'neutral';
  emaAlignment: boolean;
  score: number;
} {
  const ema9 = indicators.ema.ema9;
  const ema21 = indicators.ema.ema21;
  const ema50 = indicators.ema.ema50;
  const ema200 = indicators.ema.ema200;
  
  // Determine price position vs EMA 200
  const priceVsEma200 = currentPrice > ema200 ? 'above' : 
                        currentPrice < ema200 ? 'below' : 'neutral';
  
  // Check EMA alignment (perfect trend)
  const emaAlignment = (ema9 > ema21 && ema21 > ema50) || 
                       (ema9 < ema21 && ema21 < ema50);
  
  // Determine trend direction
  let direction: 'bullish' | 'bearish' | 'ranging';
  let score = 0;
  
  if (priceVsEma200 === 'above' && ema9 > ema21) {
    direction = 'bullish';
    score = 25; // Full score for bullish trend
    if (emaAlignment) score += 5;
  } else if (priceVsEma200 === 'below' && ema9 < ema21) {
    direction = 'bearish';
    score = 25; // Full score for bearish trend
    if (emaAlignment) score += 5;
  } else {
    direction = 'ranging';
    score = 5; // Low score for ranging market
  }
  
  return { direction, priceVsEma200, emaAlignment, score };
}

// ============================================
// VOLUME CONFIRMATION (NEW)
// ============================================

function checkVolumeConfirmation(candles: Candle[]): { confirmed: boolean; ratio: number; score: number } {
  if (candles.length < 20) {
    return { confirmed: false, ratio: 0, score: 0 };
  }
  
  const currentVolume = candles[candles.length - 1].volume;
  const avgVolume = candles.slice(-20, -1).reduce((sum, c) => sum + c.volume, 0) / 19;
  
  const ratio = currentVolume / avgVolume;
  const confirmed = ratio >= CONFIG.MIN_VOLUME_RATIO;
  
  // Score based on volume strength
  let score = 0;
  if (ratio >= 1.5) score = 15; // Strong volume
  else if (ratio >= 1.2) score = 12;
  else if (ratio >= 1.0) score = 8;
  else if (ratio >= 0.8) score = 5;
  else score = 0; // Low volume = no trade
  
  return { confirmed, ratio, score };
}

// ============================================
// STRICT CONFLUENCE CALCULATION
// ============================================

function calculateStrictConfluence(
  indicators: IndicatorValues,
  patterns: DetectedPattern[],
  candles: Candle[],
  trend: ReturnType<typeof analyzeTrend>,
  volume: ReturnType<typeof checkVolumeConfirmation>,
  direction: 'BUY' | 'SELL'
): { total: number; breakdown: {
  trendFilter: number;
  momentumAlignment: number;
  patternScore: number;
  rsiCondition: number;
  volumeConfirm: number;
  sessionScore: number;
} } {
  
  const breakdown = {
    trendFilter: 0,
    momentumAlignment: 0,
    patternScore: 0,
    rsiCondition: 0,
    volumeConfirm: 0,
    sessionScore: 0,
  };
  
  // ============================================
  // 1. TREND FILTER (CRITICAL - 30 points max)
  // ZERO points if trading against trend!
  // ============================================
  
  if (direction === 'BUY') {
    // For BUY: Must be above EMA 200
    if (trend.priceVsEma200 === 'above') {
      breakdown.trendFilter = trend.score;
    } else {
      breakdown.trendFilter = 0; // DISQUALIFIED
    }
  } else {
    // For SELL: Must be below EMA 200
    if (trend.priceVsEma200 === 'below') {
      breakdown.trendFilter = trend.score;
    } else {
      breakdown.trendFilter = 0; // DISQUALIFIED
    }
  }
  
  // ============================================
  // 2. MOMENTUM ALIGNMENT (20 points max)
  // ============================================
  
  if (direction === 'BUY') {
    if (indicators.macd.histogram > 0) breakdown.momentumAlignment += 10;
    if (indicators.macd.macd > indicators.macd.signal) breakdown.momentumAlignment += 5;
    if (indicators.stochastic.k < 80 && indicators.stochastic.k > 20) breakdown.momentumAlignment += 5;
  } else {
    if (indicators.macd.histogram < 0) breakdown.momentumAlignment += 10;
    if (indicators.macd.macd < indicators.macd.signal) breakdown.momentumAlignment += 5;
    if (indicators.stochastic.k < 80 && indicators.stochastic.k > 20) breakdown.momentumAlignment += 5;
  }
  
  // ============================================
  // 3. PATTERN SCORE (20 points max)
  // ============================================
  
  const relevantPatterns = patterns.filter(p => 
    ((direction === 'BUY' && p.type === 'bullish') ||
     (direction === 'SELL' && p.type === 'bearish')) &&
    p.strength >= 3
  );
  
  if (relevantPatterns.length > 0) {
    const bestPattern = relevantPatterns[0];
    breakdown.patternScore = Math.min(20, bestPattern.strength * 4);
  }
  
  // ============================================
  // 4. RSI CONDITION (15 points max)
  // ============================================
  
  if (direction === 'BUY') {
    if (indicators.rsi < 30) breakdown.rsiCondition = 15;      // Oversold
    else if (indicators.rsi < 40) breakdown.rsiCondition = 12;
    else if (indicators.rsi < 50) breakdown.rsiCondition = 8;
    else if (indicators.rsi > 70) breakdown.rsiCondition = -10; // BAD for buy
    else breakdown.rsiCondition = 3;
  } else {
    if (indicators.rsi > 70) breakdown.rsiCondition = 15;      // Overbought
    else if (indicators.rsi > 60) breakdown.rsiCondition = 12;
    else if (indicators.rsi > 50) breakdown.rsiCondition = 8;
    else if (indicators.rsi < 30) breakdown.rsiCondition = -10; // BAD for sell
    else breakdown.rsiCondition = 3;
  }
  
  breakdown.rsiCondition = Math.max(0, breakdown.rsiCondition);
  
  // ============================================
  // 5. VOLUME CONFIRMATION (10 points max)
  // ============================================
  
  breakdown.volumeConfirm = volume.score;
  
  // ============================================
  // 6. SESSION SCORE (5 points max)
  // ============================================
  
  const now = new Date();
  const utcHour = now.getUTCHours();
  
  if (utcHour >= 13 && utcHour < 17) {
    breakdown.sessionScore = 5; // London/NY overlap
  } else if (utcHour >= 8 && utcHour < 22) {
    breakdown.sessionScore = 4; // Main sessions
  } else if (utcHour >= 0 && utcHour < 9) {
    breakdown.sessionScore = 3; // Tokyo
  } else {
    breakdown.sessionScore = 1; // Low liquidity
  }
  
  // ============================================
  // TOTAL
  // ============================================
  
  const total = Object.values(breakdown).reduce((sum, val) => sum + Math.max(0, val), 0);
  
  return { total, breakdown };
}

// ============================================
// MAIN SIGNAL GENERATION
// ============================================

export function generateStrictSignal(
  candles: Candle[],
  symbol: string,
  _timeframe: Timeframe
): StrictSignal {
  const indicators = calculateAllIndicators(candles);
  const patterns = detectAllPatterns(candles);
  const currentPrice = candles[candles.length - 1].close;
  
  // Analyze trend
  const trend = analyzeTrend(indicators, currentPrice);
  
  // Check volume
  const volume = checkVolumeConfirmation(candles);
  
  // Calculate confluence for both directions
  const buyConfluence = calculateStrictConfluence(
    indicators, patterns, candles, trend, volume, 'BUY'
  );
  const sellConfluence = calculateStrictConfluence(
    indicators, patterns, candles, trend, volume, 'SELL'
  );
  
  // Determine direction with STRICT rules
  let direction: 'BUY' | 'SELL' | 'WAIT';
  let confluence: typeof buyConfluence;
  const warnings: string[] = [];
  const reasons: string[] = [];
  
  // CRITICAL: Trend filter check
  const canBuy = trend.priceVsEma200 === 'above';
  const canSell = trend.priceVsEma200 === 'below';
  
  if (canBuy && buyConfluence.total >= CONFIG.MIN_CONFLUENCE) {
    direction = 'BUY';
    confluence = buyConfluence;
    reasons.push('Tendance haussière confirmée (prix > EMA200)');
  } else if (canSell && sellConfluence.total >= CONFIG.MIN_CONFLUENCE) {
    direction = 'SELL';
    confluence = sellConfluence;
    reasons.push('Tendance baissière confirmée (prix < EMA200)');
  } else {
    direction = 'WAIT';
    confluence = buyConfluence.total > sellConfluence.total ? buyConfluence : sellConfluence;
    
    // Add specific warnings
    if (!canBuy && !canSell) {
      warnings.push('Prix proche de EMA200 - tendance incertaine');
    }
    if (Math.max(buyConfluence.total, sellConfluence.total) < CONFIG.MIN_CONFLUENCE) {
      warnings.push(`Score de confluence insuffisant (${Math.max(buyConfluence.total, sellConfluence.total)}/${CONFIG.MIN_CONFLUENCE} requis)`);
    }
  }
  
  // Add warnings for low volume
  if (!volume.confirmed) {
    warnings.push(`Volume faible (${(volume.ratio * 100).toFixed(0)}% de la moyenne)`);
  }
  
  // Calculate risk parameters with 1:3 R:R
  const atr = indicators.atr;
  const pipValue = symbol.includes('JPY') ? 0.01 : 0.0001;
  
  const slDistance = atr * CONFIG.SL_ATR_MULTIPLIER;
  const tpDistance = slDistance * CONFIG.RISK_REWARD; // 3x for 1:3 R:R
  
  let stopLoss: number;
  let takeProfit: number;
  
  if (direction === 'BUY') {
    stopLoss = currentPrice - slDistance;
    takeProfit = currentPrice + tpDistance;
  } else if (direction === 'SELL') {
    stopLoss = currentPrice + slDistance;
    takeProfit = currentPrice - tpDistance;
  } else {
    stopLoss = currentPrice - slDistance;
    takeProfit = currentPrice + tpDistance;
  }
  
  const maxPipsRisk = Math.round(slDistance / pipValue);
  const maxPipsTarget = Math.round(tpDistance / pipValue);
  
  // Add reasons
  if (confluence.breakdown.momentumAlignment >= 15) {
    reasons.push('Momentum aligné');
  }
  if (confluence.breakdown.rsiCondition >= 10) {
    reasons.push(`RSI favorable (${indicators.rsi.toFixed(0)})`);
  }
  if (confluence.breakdown.patternScore >= 15) {
    const pattern = patterns.find(p => p.strength >= 3);
    if (pattern) reasons.push(`Pattern ${pattern.nameFr}`);
  }
  if (volume.ratio >= 1.2) {
    reasons.push('Volume confirmé');
  }
  
  return {
    direction,
    confidence: Math.min(100, confluence.total),
    confluence: {
      total: confluence.total,
      ...confluence.breakdown
    },
    risk: {
      entryPrice: currentPrice,
      stopLoss,
      takeProfit,
      riskRewardRatio: CONFIG.RISK_REWARD,
      maxPipsRisk,
      maxPipsTarget: maxPipsTarget
    },
    trend: {
      direction: trend.direction,
      priceVsEma200: trend.priceVsEma200,
      emaAlignment: trend.emaAlignment
    },
    warnings,
    reasons
  };
}

// ============================================
// STRICT BACKTEST
// ============================================

export function runStrictBacktest(
  candles: Candle[],
  symbol: string,
  timeframe: Timeframe,
  minConfluence: number = CONFIG.MIN_CONFLUENCE
) {
  const pipValue = symbol.includes('JPY') ? 0.01 : 0.0001;
  
  const trades: Array<{
    date: number;
    direction: 'long' | 'short';
    entry: number;
    exit: number;
    pnl: number;
    outcome: 'win' | 'loss';
    confluence: number;
    trendFilter: string;
  }> = [];
  
  // Scan for trades
  for (let i = 150; i < candles.length - 30; i++) {
    const historicalCandles = candles.slice(0, i + 1);
    const signal = generateStrictSignal(historicalCandles, symbol, timeframe);
    
    // Skip if not a valid trade
    if (signal.direction === 'WAIT') continue;
    if (signal.confluence.total < minConfluence) continue;
    
    const entryPrice = candles[i].close;
    const sl = signal.risk.stopLoss;
    const tp = signal.risk.takeProfit;
    
    // Simulate trade with 30 bar max hold
    const maxBars = 30;
    let outcome: 'win' | 'loss' = 'loss';
    let exitPrice = sl;
    
    for (let j = 1; j <= maxBars && i + j < candles.length; j++) {
      const bar = candles[i + j];
      
      if (signal.direction === 'BUY') {
        if (bar.low <= sl) {
          outcome = 'loss';
          exitPrice = sl;
          break;
        }
        if (bar.high >= tp) {
          outcome = 'win';
          exitPrice = tp;
          break;
        }
      } else {
        if (bar.high >= sl) {
          outcome = 'loss';
          exitPrice = sl;
          break;
        }
        if (bar.low <= tp) {
          outcome = 'win';
          exitPrice = tp;
          break;
        }
      }
    }
    
    const pnl = signal.direction === 'BUY'
      ? (exitPrice - entryPrice) / pipValue
      : (entryPrice - exitPrice) / pipValue;
    
    trades.push({
      date: candles[i].timestamp,
      direction: signal.direction === 'BUY' ? 'long' : 'short',
      entry: entryPrice,
      exit: exitPrice,
      pnl,
      outcome,
      confluence: signal.confluence.total,
      trendFilter: signal.trend.priceVsEma200
    });
    
    // Skip ahead to avoid overtrading
    i += 5;
  }
  
  // Calculate stats
  const wins = trades.filter(t => t.outcome === 'win');
  const losses = trades.filter(t => t.outcome === 'loss');
  const totalPips = trades.reduce((sum, t) => sum + t.pnl, 0);
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : 0;
  const expectancy = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);
  
  return {
    trades,
    stats: {
      totalTrades: trades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: Math.round(winRate * 10) / 10,
      totalPips: Math.round(totalPips * 10) / 10,
      avgWin: Math.round(avgWin * 10) / 10,
      avgLoss: Math.round(avgLoss * 10) / 10,
      profitFactor: Math.round(profitFactor * 100) / 100,
      expectancy: Math.round(expectancy * 10) / 10,
      riskRewardUsed: `1:${CONFIG.RISK_REWARD}`,
      minConfluenceUsed: minConfluence
    }
  };
}
