// Improved ML Trading Strategy - Focus on Quality over Quantity
import { Candle, Timeframe, IndicatorValues } from './types';
import { DetectedPattern, detectAllPatterns } from './patterns';
import { calculateAllIndicators } from './indicators';

// ============================================
// IMPROVED SIGNAL GENERATION
// ============================================

export interface ImprovedSignal {
  direction: 'BUY' | 'SELL' | 'WAIT';
  confidence: number;
  confluence: {
    total: number;
    trendAlignment: number;
    momentumAlignment: number;
    patternScore: number;
    rsiCondition: number;
    sessionScore: number;
  };
  setup: {
    type: string;
    quality: 'A+' | 'A' | 'B' | 'C' | 'D';
  };
  risk: {
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    riskRewardRatio: number;
    maxPipsRisk: number;
  };
  reasons: string[];
  warnings: string[];
}

/**
 * Calculate confluence score (0-100)
 * Higher score = better trade setup
 */
function calculateConfluence(
  indicators: IndicatorValues,
  patterns: DetectedPattern[],
  candles: Candle[],
  direction: 'BUY' | 'SELL'
): { total: number; breakdown: {
  trendAlignment: number;
  momentumAlignment: number;
  patternScore: number;
  rsiCondition: number;
  sessionScore: number;
} } {
  let total = 0;
  const breakdown = {
    trendAlignment: 0,
    momentumAlignment: 0,
    patternScore: 0,
    rsiCondition: 0,
    sessionScore: 0
  };
  
  const currentPrice = candles[candles.length - 1].close;
  
  // 1. TREND ALIGNMENT (max 25 points)
  const trendDir = direction === 'BUY' ? 'up' : 'down';
  const ema9 = indicators.ema.ema9;
  const ema21 = indicators.ema.ema21;
  const ema50 = indicators.ema.ema50;
  const ema200 = indicators.ema.ema200;
  
  let trendScore = 0;
  if (direction === 'BUY') {
    if (currentPrice > ema9) trendScore += 5;
    if (ema9 > ema21) trendScore += 5;
    if (ema21 > ema50) trendScore += 5;
    if (currentPrice > ema200) trendScore += 10; // Long-term trend most important
  } else {
    if (currentPrice < ema9) trendScore += 5;
    if (ema9 < ema21) trendScore += 5;
    if (ema21 < ema50) trendScore += 5;
    if (currentPrice < ema200) trendScore += 10;
  }
  breakdown.trendAlignment = trendScore;
  total += trendScore;
  
  // 2. MOMENTUM ALIGNMENT (max 20 points)
  let momentumScore = 0;
  if (direction === 'BUY') {
    if (indicators.macd.histogram > 0) momentumScore += 10;
    if (indicators.macd.macd > indicators.macd.signal) momentumScore += 5;
    if (indicators.stochastic.k < 80) momentumScore += 5;
  } else {
    if (indicators.macd.histogram < 0) momentumScore += 10;
    if (indicators.macd.macd < indicators.macd.signal) momentumScore += 5;
    if (indicators.stochastic.k > 20) momentumScore += 5;
  }
  breakdown.momentumAlignment = momentumScore;
  total += momentumScore;
  
  // 3. RSI CONDITION (max 15 points)
  let rsiScore = 0;
  if (direction === 'BUY') {
    if (indicators.rsi < 35) rsiScore = 15; // Oversold
    else if (indicators.rsi < 45) rsiScore = 10;
    else if (indicators.rsi < 55) rsiScore = 5;
    else if (indicators.rsi > 70) rsiScore = -10; // Overbought (bad for buy)
  } else {
    if (indicators.rsi > 65) rsiScore = 15; // Overbought
    else if (indicators.rsi > 55) rsiScore = 10;
    else if (indicators.rsi > 45) rsiScore = 5;
    else if (indicators.rsi < 30) rsiScore = -10; // Oversold (bad for sell)
  }
  breakdown.rsiCondition = Math.max(0, rsiScore);
  total += Math.max(0, rsiScore);
  
  // 4. PATTERN SCORE (max 25 points)
  let patternScore = 0;
  if (patterns.length > 0) {
    const strongPatterns = patterns.filter(p => 
      p.strength >= 3 && 
      ((direction === 'BUY' && p.type === 'bullish') || 
       (direction === 'SELL' && p.type === 'bearish'))
    );
    
    if (strongPatterns.length > 0) {
      patternScore = Math.min(25, strongPatterns[0].strength * 5);
    }
  }
  breakdown.patternScore = patternScore;
  total += patternScore;
  
  // 5. SESSION SCORE (max 15 points)
  const now = new Date();
  const utcHour = now.getUTCHours();
  let sessionScore = 0;
  
  // London/NY overlap (13-17 UTC)
  if (utcHour >= 13 && utcHour < 17) {
    sessionScore = 15;
  }
  // London session (8-17 UTC)
  else if (utcHour >= 8 && utcHour < 17) {
    sessionScore = 12;
  }
  // NY session (13-22 UTC)
  else if (utcHour >= 13 && utcHour < 22) {
    sessionScore = 10;
  }
  // Tokyo session (0-9 UTC)
  else if (utcHour >= 0 && utcHour < 9) {
    sessionScore = 8;
  }
  // Low liquidity
  else {
    sessionScore = 3;
  }
  breakdown.sessionScore = sessionScore;
  total += sessionScore;
  
  return { total, breakdown };
}

/**
 * Get setup quality based on confluence score
 */
function getSetupQuality(score: number): 'A+' | 'A' | 'B' | 'C' | 'D' {
  if (score >= 80) return 'A+';
  if (score >= 70) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

/**
 * Generate improved trading signal
 */
export function generateImprovedSignal(
  candles: Candle[],
  symbol: string,
  _timeframe: Timeframe
): ImprovedSignal {
  const indicators = calculateAllIndicators(candles);
  const patterns = detectAllPatterns(candles);
  const currentPrice = candles[candles.length - 1].close;
  
  // Calculate confluence for both directions
  const buyConfluence = calculateConfluence(indicators, patterns, candles, 'BUY');
  const sellConfluence = calculateConfluence(indicators, patterns, candles, 'SELL');
  
  // Determine direction
  let direction: 'BUY' | 'SELL' | 'WAIT';
  let confluence: typeof buyConfluence;
  
  const minConfluence = 55; // Minimum required to trade
  
  if (buyConfluence.total > sellConfluence.total && buyConfluence.total >= minConfluence) {
    direction = 'BUY';
    confluence = buyConfluence;
  } else if (sellConfluence.total > buyConfluence.total && sellConfluence.total >= minConfluence) {
    direction = 'SELL';
    confluence = sellConfluence;
  } else {
    direction = 'WAIT';
    confluence = buyConfluence.total > sellConfluence.total ? buyConfluence : sellConfluence;
  }
  
  // Calculate risk parameters
  const atr = indicators.atr;
  const atrMultiplier = 1.5; // For SL
  const pipValue = symbol.includes('JPY') ? 0.01 : 0.0001;
  
  let stopLoss: number;
  let takeProfit: number;
  
  if (direction === 'BUY') {
    stopLoss = currentPrice - (atr * atrMultiplier);
    takeProfit = currentPrice + (atr * atrMultiplier * 2); // 2:1 R:R
  } else if (direction === 'SELL') {
    stopLoss = currentPrice + (atr * atrMultiplier);
    takeProfit = currentPrice - (atr * atrMultiplier * 2);
  } else {
    stopLoss = currentPrice - (atr * atrMultiplier);
    takeProfit = currentPrice + (atr * atrMultiplier * 2);
  }
  
  const maxPipsRisk = Math.abs(currentPrice - stopLoss) / pipValue;
  
  // Generate reasons
  const reasons: string[] = [];
  const warnings: string[] = [];
  
  if (confluence.breakdown.trendAlignment >= 15) {
    reasons.push(`Tendance alignée (${confluence.breakdown.trendAlignment}/25)`);
  }
  if (confluence.breakdown.momentumAlignment >= 10) {
    reasons.push(`Momentum favorable (${confluence.breakdown.momentumAlignment}/20)`);
  }
  if (confluence.breakdown.patternScore >= 15) {
    const pattern = patterns.find(p => p.strength >= 3);
    if (pattern) reasons.push(`Pattern ${pattern.nameFr}`);
  }
  
  if (direction === 'WAIT') {
    warnings.push('Confluence insuffisante pour entrer');
  }
  if (indicators.atrPercent > 1.5) {
    warnings.push('Volatilité élevée');
  }
  
  return {
    direction,
    confidence: Math.min(95, confluence.total),
    confluence: {
      total: confluence.total,
      ...confluence.breakdown
    },
    setup: {
      type: direction === 'WAIT' ? 'no_setup' : 'trend_follow',
      quality: getSetupQuality(confluence.total)
    },
    risk: {
      entryPrice: currentPrice,
      stopLoss,
      takeProfit,
      riskRewardRatio: 2,
      maxPipsRisk: Math.round(maxPipsRisk)
    },
    reasons,
    warnings
  };
}

// ============================================
// IMPROVED BACKTEST
// ============================================

export function runImprovedBacktest(
  candles: Candle[],
  symbol: string,
  timeframe: Timeframe,
  minConfluence: number = 55
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
  }> = [];
  
  // Scan for trades
  for (let i = 100; i < candles.length - 20; i++) {
    const historicalCandles = candles.slice(0, i + 1);
    const signal = generateImprovedSignal(historicalCandles, symbol, timeframe);
    
    // Skip if not a valid trade
    if (signal.direction === 'WAIT' || signal.confluence.total < minConfluence) {
      continue;
    }
    
    const entryPrice = candles[i].close;
    const sl = signal.risk.stopLoss;
    const tp = signal.risk.takeProfit;
    
    // Simulate trade
    const maxBars = 20;
    let outcome: 'win' | 'loss' = 'loss';
    let exitPrice = sl; // Default to SL
    
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
      confluence: signal.confluence.total
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
      expectancy: Math.round(expectancy * 10) / 10
    }
  };
}
