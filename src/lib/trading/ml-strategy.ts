// Machine Learning Strategy for Forex Trading
import { Candle, Timeframe, IndicatorValues } from './types';
import { DetectedPattern, detectAllPatterns } from './patterns';
import { BacktestResult, PatternBacktestStats, runBacktest } from './backtest';
import { calculateAllIndicators } from './indicators';

export interface MLContext {
  trend: {
    short: 'up' | 'down' | 'sideways';
    medium: 'up' | 'down' | 'sideways';
    long: 'up' | 'down' | 'sideways';
  };
  volatility: 'low' | 'normal' | 'high';
  momentum: 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish';
  rsiCondition: 'overbought' | 'oversold' | 'neutral';
  macdCondition: 'bullish' | 'bearish' | 'neutral';
}

export interface MLSignal {
  direction: 'BUY' | 'SELL' | 'WAIT';
  confidence: number;
  mlScore: number;
  expectancy: number; // Expected pips
  detectedPatterns: {
    pattern: DetectedPattern;
    historicalWinRate: number;
    historicalExpectancy: number;
    weight: number;
  }[];
  context: MLContext;
  indicatorAlignment: number; // How well indicators align
  trendAlignment: number; // How well signal aligns with trend
  reasoning: string[];
}

export interface PatternMemory {
  patternName: string;
  symbol: string;
  timeframe: Timeframe;
  stats: PatternBacktestStats;
  lastUpdated: number;
}

// In-memory storage for learned patterns
const patternMemoryCache = new Map<string, PatternMemory>();

/**
 * Learn from historical data and store pattern statistics
 */
export function learnFromHistory(
  candles: Candle[],
  symbol: string,
  timeframe: Timeframe
): PatternBacktestStats[] {
  const backtestResult = runBacktest(candles, symbol, timeframe);
  
  // Store in memory
  for (const stats of backtestResult.patternStats) {
    const key = `${symbol}-${timeframe}-${stats.patternName}`;
    patternMemoryCache.set(key, {
      patternName: stats.patternName,
      symbol,
      timeframe,
      stats,
      lastUpdated: Date.now()
    });
  }
  
  return backtestResult.patternStats;
}

/**
 * Get learned pattern statistics
 */
export function getPatternStats(
  patternName: string,
  symbol: string,
  timeframe: Timeframe
): PatternBacktestStats | null {
  const key = `${symbol}-${timeframe}-${patternName}`;
  const memory = patternMemoryCache.get(key);
  return memory?.stats || null;
}

/**
 * Analyze market context from candles and indicators
 */
export function analyzeContext(candles: Candle[], indicators: IndicatorValues): MLContext {
  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];
  
  // Short-term trend (last 10 candles)
  const shortMA = closes.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const shortTrend = currentPrice > shortMA * 1.001 ? 'up' : currentPrice < shortMA * 0.999 ? 'down' : 'sideways';
  
  // Medium-term trend (last 50 candles)
  const mediumMA = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
  const mediumTrend = currentPrice > mediumMA * 1.005 ? 'up' : currentPrice < mediumMA * 0.995 ? 'down' : 'sideways';
  
  // Long-term trend (last 200 candles or available)
  const longCloses = closes.slice(-200);
  const longMA = longCloses.reduce((a, b) => a + b, 0) / longCloses.length;
  const longTrend = currentPrice > longMA * 1.01 ? 'up' : currentPrice < longMA * 0.99 ? 'down' : 'sideways';
  
  // Volatility based on ATR
  const atrPercent = indicators.atrPercent;
  let volatility: 'low' | 'normal' | 'high';
  if (atrPercent < 0.5) volatility = 'low';
  else if (atrPercent > 1.5) volatility = 'high';
  else volatility = 'normal';
  
  // Momentum based on RSI and MACD
  let momentum: MLContext['momentum'];
  if (indicators.rsi > 70 && indicators.macd.histogram > 0) {
    momentum = 'strong_bullish';
  } else if (indicators.rsi > 55 && indicators.macd.histogram > 0) {
    momentum = 'bullish';
  } else if (indicators.rsi < 30 && indicators.macd.histogram < 0) {
    momentum = 'strong_bearish';
  } else if (indicators.rsi < 45 && indicators.macd.histogram < 0) {
    momentum = 'bearish';
  } else {
    momentum = 'neutral';
  }
  
  // RSI condition
  let rsiCondition: MLContext['rsiCondition'];
  if (indicators.rsi > 70) rsiCondition = 'overbought';
  else if (indicators.rsi < 30) rsiCondition = 'oversold';
  else rsiCondition = 'neutral';
  
  // MACD condition
  let macdCondition: MLContext['macdCondition'];
  if (indicators.macd.histogram > 0 && indicators.macd.macd > indicators.macd.signal) {
    macdCondition = 'bullish';
  } else if (indicators.macd.histogram < 0 && indicators.macd.macd < indicators.macd.signal) {
    macdCondition = 'bearish';
  } else {
    macdCondition = 'neutral';
  }
  
  return {
    trend: {
      short: shortTrend,
      medium: mediumTrend,
      long: longTrend
    },
    volatility,
    momentum,
    rsiCondition,
    macdCondition
  };
}

/**
 * Calculate indicator alignment score (0-100)
 */
function calculateIndicatorAlignment(indicators: IndicatorValues, direction: 'BUY' | 'SELL'): number {
  let score = 0;
  let factors = 0;
  
  // RSI
  if (direction === 'BUY') {
    if (indicators.rsi < 30) score += 100;
    else if (indicators.rsi < 40) score += 75;
    else if (indicators.rsi < 50) score += 50;
    else if (indicators.rsi < 60) score += 25;
    else score += 0;
  } else {
    if (indicators.rsi > 70) score += 100;
    else if (indicators.rsi > 60) score += 75;
    else if (indicators.rsi > 50) score += 50;
    else if (indicators.rsi > 40) score += 25;
    else score += 0;
  }
  factors++;
  
  // MACD
  if (direction === 'BUY' && indicators.macd.histogram > 0) score += 100;
  else if (direction === 'BUY' && indicators.macd.histogram > -0.001) score += 50;
  else if (direction === 'SELL' && indicators.macd.histogram < 0) score += 100;
  else if (direction === 'SELL' && indicators.macd.histogram < 0.001) score += 50;
  factors++;
  
  // EMA alignment
  const emaBullish = indicators.ema.ema9 > indicators.ema.ema21 && indicators.ema.ema21 > indicators.ema.ema50;
  const emaBearish = indicators.ema.ema9 < indicators.ema.ema21 && indicators.ema.ema21 < indicators.ema.ema50;
  
  if (direction === 'BUY' && emaBullish) score += 100;
  else if (direction === 'SELL' && emaBearish) score += 100;
  else if (direction === 'BUY' && indicators.ema.ema9 > indicators.ema.ema21) score += 50;
  else if (direction === 'SELL' && indicators.ema.ema9 < indicators.ema.ema21) score += 50;
  factors++;
  
  // Bollinger position
  const currentPrice = indicators.ema.ema9; // Approximate current price
  const bbPosition = (currentPrice - indicators.bollingerBands.lower) / 
    (indicators.bollingerBands.upper - indicators.bollingerBands.lower);
  
  if (direction === 'BUY' && bbPosition < 0.3) score += 100;
  else if (direction === 'SELL' && bbPosition > 0.7) score += 100;
  else if (direction === 'BUY' && bbPosition < 0.5) score += 50;
  else if (direction === 'SELL' && bbPosition > 0.5) score += 50;
  factors++;
  
  // Stochastic
  if (direction === 'BUY' && indicators.stochastic.k < 20) score += 100;
  else if (direction === 'SELL' && indicators.stochastic.k > 80) score += 100;
  else if (direction === 'BUY' && indicators.stochastic.k < 40) score += 50;
  else if (direction === 'SELL' && indicators.stochastic.k > 60) score += 50;
  factors++;
  
  return score / factors;
}

/**
 * Calculate trend alignment score (0-100)
 */
function calculateTrendAlignment(context: MLContext, direction: 'BUY' | 'SELL'): number {
  const trendDir = direction === 'BUY' ? 'up' : 'down';
  let score = 0;
  
  // Short-term trend (least weight)
  if (context.trend.short === trendDir) score += 15;
  else if (context.trend.short === 'sideways') score += 10;
  
  // Medium-term trend (medium weight)
  if (context.trend.medium === trendDir) score += 30;
  else if (context.trend.medium === 'sideways') score += 15;
  
  // Long-term trend (highest weight)
  if (context.trend.long === trendDir) score += 55;
  else if (context.trend.long === 'sideways') score += 25;
  
  return score;
}

/**
 * Generate ML-enhanced trading signal
 */
export function generateMLSignal(
  candles: Candle[],
  symbol: string,
  timeframe: Timeframe,
  patternStats: PatternBacktestStats[] = []
): MLSignal {
  // Calculate indicators
  const indicators = calculateAllIndicators(candles);
  const context = analyzeContext(candles, indicators);
  
  // Detect patterns
  const patterns = detectAllPatterns(candles);
  
  // Filter to strong patterns only
  const strongPatterns = patterns.filter(p => p.strength >= 3);
  
  // Get historical stats for each pattern
  const patternsWithStats: MLSignal['detectedPatterns'] = strongPatterns.map(pattern => {
    const stats = getPatternStats(pattern.name, symbol, timeframe) || 
      patternStats.find(s => s.patternName === pattern.name);
    
    return {
      pattern,
      historicalWinRate: stats?.winRate || 50, // Default 50% if no data
      historicalExpectancy: stats?.expectancy || 0,
      weight: pattern.strength / 5 // Normalize to 0-1
    };
  });
  
  // Calculate weighted scores for BUY and SELL
  let buyScore = 0;
  let sellScore = 0;
  let totalWeight = 0;
  let expectancy = 0;
  
  for (const ps of patternsWithStats) {
    const weight = ps.weight * (ps.historicalWinRate / 100); // Weight by reliability
    
    if (ps.pattern.type === 'bullish') {
      buyScore += ps.pattern.confidence * weight;
      expectancy += ps.historicalExpectancy * weight;
    } else if (ps.pattern.type === 'bearish') {
      sellScore += ps.pattern.confidence * weight;
      expectancy -= ps.historicalExpectancy * weight;
    }
    
    totalWeight += weight;
  }
  
  // Normalize scores
  if (totalWeight > 0) {
    buyScore /= totalWeight;
    sellScore /= totalWeight;
    expectancy /= totalWeight;
  }
  
  // Determine direction
  let direction: 'BUY' | 'SELL' | 'WAIT';
  let confidence: number;
  
  const scoreDiff = buyScore - sellScore;
  
  if (scoreDiff > 15 && buyScore > 50) {
    direction = 'BUY';
    confidence = Math.min(buyScore, 95);
  } else if (scoreDiff < -15 && sellScore > 50) {
    direction = 'SELL';
    confidence = Math.min(sellScore, 95);
  } else {
    direction = 'WAIT';
    confidence = 100 - Math.abs(scoreDiff);
  }
  
  // Calculate alignment scores
  const indicatorAlignment = calculateIndicatorAlignment(indicators, direction === 'WAIT' ? 'BUY' : direction);
  const trendAlignment = calculateTrendAlignment(context, direction === 'WAIT' ? 'BUY' : direction);
  
  // Adjust confidence based on alignments
  const alignmentBonus = (indicatorAlignment * 0.4 + trendAlignment * 0.6) / 100;
  confidence = confidence * (0.7 + alignmentBonus * 0.3);
  
  // Calculate ML score (composite score)
  const mlScore = (buyScore - sellScore + 50) * alignmentBonus;
  
  // Generate reasoning
  const reasoning: string[] = [];
  
  if (patternsWithStats.length > 0) {
    reasoning.push(`${patternsWithStats.length} pattern(s) detected`);
    for (const ps of patternsWithStats.slice(0, 3)) {
      reasoning.push(`${ps.pattern.name}: ${ps.historicalWinRate.toFixed(0)}% win rate`);
    }
  }
  
  if (context.trend.medium === 'up') reasoning.push('Medium-term uptrend');
  else if (context.trend.medium === 'down') reasoning.push('Medium-term downtrend');
  
  if (context.rsiCondition === 'oversold') reasoning.push('RSI oversold');
  else if (context.rsiCondition === 'overbought') reasoning.push('RSI overbought');
  
  if (context.momentum !== 'neutral') reasoning.push(`${context.momentum} momentum`);
  
  return {
    direction,
    confidence: Math.round(confidence),
    mlScore: Math.round(mlScore),
    expectancy: Math.round(expectancy * 10) / 10,
    detectedPatterns: patternsWithStats,
    context,
    indicatorAlignment: Math.round(indicatorAlignment),
    trendAlignment: Math.round(trendAlignment),
    reasoning
  };
}

/**
 * Get trading recommendation based on ML analysis
 */
export function getTradingRecommendation(
  mlSignal: MLSignal,
  currentPrice: number,
  symbol: string
): {
  action: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  positionSize: number;
  reasoning: string;
} {
  const pipValue = symbol.includes('JPY') ? 0.01 : 0.0001;
  
  // Default pip values for SL/TP
  const stopLossPips = 30;
  const takeProfitPips = 45;
  
  let action: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  let stopLoss: number;
  let takeProfit: number;
  
  if (mlSignal.direction === 'BUY') {
    if (mlSignal.confidence > 80 && mlSignal.trendAlignment > 70) {
      action = 'STRONG_BUY';
    } else {
      action = 'BUY';
    }
    stopLoss = currentPrice - (stopLossPips * pipValue);
    takeProfit = currentPrice + (takeProfitPips * pipValue);
  } else if (mlSignal.direction === 'SELL') {
    if (mlSignal.confidence > 80 && mlSignal.trendAlignment > 70) {
      action = 'STRONG_SELL';
    } else {
      action = 'SELL';
    }
    stopLoss = currentPrice + (stopLossPips * pipValue);
    takeProfit = currentPrice - (takeProfitPips * pipValue);
  } else {
    action = 'HOLD';
    stopLoss = currentPrice - (stopLossPips * pipValue);
    takeProfit = currentPrice + (takeProfitPips * pipValue);
  }
  
  // Adjust position size based on confidence
  const baseRisk = 2; // 2% risk per trade
  const adjustedRisk = action === 'HOLD' ? 0 : baseRisk * (mlSignal.confidence / 100);
  
  return {
    action,
    entry: currentPrice,
    stopLoss,
    takeProfit,
    riskRewardRatio: takeProfitPips / stopLossPips,
    positionSize: adjustedRisk,
    reasoning: mlSignal.reasoning.join('. ')
  };
}

/**
 * Clear pattern memory cache
 */
export function clearPatternMemory(): void {
  patternMemoryCache.clear();
}

/**
 * Get all stored pattern memories
 */
export function getAllPatternMemories(): PatternMemory[] {
  return Array.from(patternMemoryCache.values());
}

/**
 * Export pattern memory for persistence
 */
export function exportPatternMemory(): string {
  return JSON.stringify(Array.from(patternMemoryCache.entries()));
}

/**
 * Import pattern memory from persistence
 */
export function importPatternMemory(data: string): void {
  try {
    const entries = JSON.parse(data);
    for (const [key, value] of entries) {
      patternMemoryCache.set(key, value);
    }
  } catch (e) {
    console.error('Failed to import pattern memory:', e);
  }
}
