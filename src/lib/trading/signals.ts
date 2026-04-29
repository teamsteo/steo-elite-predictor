// Enhanced Signal Generation System for TradeSignal Pro
import { Candle, Signal, SignalType, Timeframe, IndicatorValues, FOREX_PAIRS } from './types';
import { calculateAllIndicators } from './indicators';
import { detectAllPatterns } from './patterns';

// Enhanced Signal interface
interface EnhancedSignal extends Signal {
  patterns: any[];
  mlConfidence: number;
  mlWeights: any;
  backtestMetrics: {
    historicalWinRate: number;
    similarSetupWinRate: number;
    averagePips: number;
  };
  probabilityScore: {
    bullish: number;
    bearish: number;
    neutral: number;
  };
  signalStrength: 'strong' | 'moderate' | 'weak';
  recommendedAction: string;
}

// ML Strategy interface
interface MLStrategy {
  weights: {
    rsi: number;
    macd: number;
    ema: number;
    bollingerBands: number;
    stochastic: number;
    vwap: number;
  };
  winRate: number;
  accuracy: number;
  profitFactor: number;
}

interface SignalScore {
  bullish: number;
  bearish: number;
  total: number;
}

interface WeightedIndicator {
  name: string;
  weight: number;
  bullishScore: number;
  bearishScore: number;
  signal: 'bullish' | 'bearish' | 'neutral';
}

/**
 * Analyze RSI for trading signals
 */
function analyzeRSI(rsi: number, rsiSignal: string, weight: number = 15): WeightedIndicator {
  let bullishScore = 0;
  let bearishScore = 0;
  let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  
  if (rsi < 30) {
    bullishScore = 100;
    signal = 'bullish';
  } else if (rsi > 70) {
    bearishScore = 100;
    signal = 'bearish';
  } else if (rsi < 35) {
    bullishScore = 60;
    signal = 'bullish';
  } else if (rsi > 65) {
    bearishScore = 60;
    signal = 'bearish';
  } else {
    bullishScore = 50 - Math.abs(50 - rsi);
    bearishScore = 50 - Math.abs(50 - rsi);
  }
  
  return {
    name: 'RSI',
    weight,
    bullishScore,
    bearishScore,
    signal
  };
}

/**
 * Analyze MACD for trading signals
 */
function analyzeMACD(
  macdValue: number, 
  signalValue: number, 
  histogram: number, 
  trend: string,
  weight: number = 20
): WeightedIndicator {
  let bullishScore = 0;
  let bearishScore = 0;
  let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  
  if (histogram > 0 && trend === 'bullish') {
    bullishScore = 80;
    signal = 'bullish';
  } else if (histogram < 0 && trend === 'bearish') {
    bearishScore = 80;
    signal = 'bearish';
  }
  
  if (histogram > 0) {
    bullishScore += Math.min(histogram * 100, 20);
  } else {
    bearishScore += Math.min(Math.abs(histogram) * 100, 20);
  }
  
  const distance = Math.abs(macdValue - signalValue);
  if (macdValue > signalValue) {
    bullishScore += Math.min(distance * 50, 20);
  } else {
    bearishScore += Math.min(distance * 50, 20);
  }
  
  return {
    name: 'MACD',
    weight,
    bullishScore: Math.min(bullishScore, 100),
    bearishScore: Math.min(bearishScore, 100),
    signal
  };
}

/**
 * Analyze Moving Averages for trading signals
 */
function analyzeMovingAverages(
  currentPrice: number,
  ema9: number,
  ema21: number,
  ema50: number,
  ema200: number,
  weight: number = 25
): WeightedIndicator {
  let bullishScore = 0;
  let bearishScore = 0;
  let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  
  if (currentPrice > ema9) bullishScore += 15;
  else bearishScore += 15;
  
  if (currentPrice > ema21) bullishScore += 15;
  else bearishScore += 15;
  
  if (currentPrice > ema50) bullishScore += 20;
  else bearishScore += 20;
  
  if (currentPrice > ema200) bullishScore += 25;
  else bearishScore += 25;
  
  if (ema9 > ema21) bullishScore += 15;
  else bearishScore += 15;
  
  if (ema21 > ema50) bullishScore += 10;
  else bearishScore += 10;
  
  if (bullishScore > 70) signal = 'bullish';
  else if (bearishScore > 70) signal = 'bearish';
  
  return {
    name: 'Moving Averages',
    weight,
    bullishScore: Math.min(bullishScore, 100),
    bearishScore: Math.min(bearishScore, 100),
    signal
  };
}

/**
 * Analyze Bollinger Bands for trading signals
 */
function analyzeBollingerBands(
  currentPrice: number,
  upper: number,
  middle: number,
  lower: number,
  position: string,
  weight: number = 15
): WeightedIndicator {
  let bullishScore = 0;
  let bearishScore = 0;
  let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  
  if (position === 'lower') {
    const distanceToLower = (currentPrice - lower) / (upper - lower);
    if (distanceToLower < 0.1) {
      bullishScore = 90;
      signal = 'bullish';
    } else if (distanceToLower < 0.2) {
      bullishScore = 70;
      signal = 'bullish';
    } else {
      bullishScore = 50;
    }
  } else if (position === 'upper') {
    const distanceToUpper = (upper - currentPrice) / (upper - lower);
    if (distanceToUpper < 0.1) {
      bearishScore = 90;
      signal = 'bearish';
    } else if (distanceToUpper < 0.2) {
      bearishScore = 70;
      signal = 'bearish';
    } else {
      bearishScore = 50;
    }
  } else {
    bullishScore = 50;
    bearishScore = 50;
  }
  
  return {
    name: 'Bollinger Bands',
    weight,
    bullishScore,
    bearishScore,
    signal
  };
}

/**
 * Analyze Stochastic Oscillator for trading signals
 */
function analyzeStochastic(
  k: number, 
  d: number, 
  stochSignal: string,
  weight: number = 15
): WeightedIndicator {
  let bullishScore = 0;
  let bearishScore = 0;
  let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  
  if (k < 20) {
    bullishScore = 90;
    signal = 'bullish';
  } else if (k > 80) {
    bearishScore = 90;
    signal = 'bearish';
  } else if (k < 30) {
    bullishScore = 60;
    signal = 'bullish';
  } else if (k > 70) {
    bearishScore = 60;
    signal = 'bearish';
  } else {
    bullishScore = 50 - (k - 50);
    bearishScore = k - 50;
  }
  
  if (k > d && stochSignal !== 'overbought') {
    bullishScore += 10;
  } else if (k < d && stochSignal !== 'oversold') {
    bearishScore += 10;
  }
  
  return {
    name: 'Stochastic',
    weight,
    bullishScore: Math.min(bullishScore, 100),
    bearishScore: Math.min(bearishScore, 100),
    signal
  };
}

/**
 * Analyze VWAP for trading signals
 */
function analyzeVWAP(
  currentPrice: number, 
  vwap: number,
  weight: number = 10
): WeightedIndicator {
  let bullishScore = 0;
  let bearishScore = 0;
  let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  
  const distance = ((currentPrice - vwap) / vwap) * 100;
  
  if (currentPrice > vwap) {
    bullishScore = Math.min(50 + distance * 10, 90);
    signal = 'bullish';
  } else {
    bearishScore = Math.min(50 + Math.abs(distance) * 10, 90);
    signal = 'bearish';
  }
  
  return {
    name: 'VWAP',
    weight,
    bullishScore,
    bearishScore,
    signal
  };
}

/**
 * Get pip value for a forex pair
 */
function getPipValue(symbol: string): number {
  const pair = FOREX_PAIRS.find(p => p.symbol === symbol);
  return pair?.pipValue || 0.0001;
}

/**
 * Get spread for a forex pair
 */
function getSpread(_symbol: string): number {
  return 2.0;
}

/**
 * Generate basic trading signal (without ML)
 */
export function generateSignal(
  candles: Candle[],
  symbol: string,
  timeframe: Timeframe
): Signal {
  const indicators = calculateAllIndicators(candles);
  const currentPrice = candles[candles.length - 1].close;
  
  const rsiAnalysis = analyzeRSI(indicators.rsi, indicators.rsiSignal);
  const macdAnalysis = analyzeMACD(
    indicators.macd.macd,
    indicators.macd.signal,
    indicators.macd.histogram,
    indicators.macd.trend
  );
  const maAnalysis = analyzeMovingAverages(
    currentPrice,
    indicators.ema.ema9,
    indicators.ema.ema21,
    indicators.ema.ema50,
    indicators.ema.ema200
  );
  const bbAnalysis = analyzeBollingerBands(
    currentPrice,
    indicators.bollingerBands.upper,
    indicators.bollingerBands.middle,
    indicators.bollingerBands.lower,
    indicators.bollingerBands.position
  );
  const stochAnalysis = analyzeStochastic(
    indicators.stochastic.k,
    indicators.stochastic.d,
    indicators.stochastic.signal
  );
  const vwapAnalysis = analyzeVWAP(currentPrice, indicators.vwap);
  
  const analyses = [rsiAnalysis, macdAnalysis, maAnalysis, bbAnalysis, stochAnalysis, vwapAnalysis];
  
  let totalWeight = 0;
  let weightedBullish = 0;
  let weightedBearish = 0;
  const reasoning: string[] = [];
  
  for (const analysis of analyses) {
    weightedBullish += analysis.bullishScore * analysis.weight;
    weightedBearish += analysis.bearishScore * analysis.weight;
    totalWeight += analysis.weight;
    
    if (analysis.signal !== 'neutral') {
      reasoning.push(`${analysis.name}: ${analysis.signal.toUpperCase()} (${analysis.signal === 'bullish' ? analysis.bullishScore.toFixed(0) : analysis.bearishScore.toFixed(0)}%)`);
    }
  }
  
  const avgBullish = weightedBullish / totalWeight;
  const avgBearish = weightedBearish / totalWeight;
  
  let signalType: SignalType;
  let confidence: number;
  
  const scoreDiff = avgBullish - avgBearish;
  
  if (scoreDiff > 15) {
    signalType = 'BUY';
    confidence = Math.min(avgBullish, 95);
  } else if (scoreDiff < -15) {
    signalType = 'SELL';
    confidence = Math.min(avgBearish, 95);
  } else {
    signalType = 'HOLD';
    confidence = 100 - Math.abs(scoreDiff);
  }
  
  const atr = indicators.atr;
  let stopLoss: number;
  let takeProfit: number;
  let riskRewardRatio: number;
  
  if (signalType === 'BUY') {
    stopLoss = currentPrice - (atr * 2);
    takeProfit = currentPrice + (atr * 3);
    riskRewardRatio = 1.5;
  } else if (signalType === 'SELL') {
    stopLoss = currentPrice + (atr * 2);
    takeProfit = currentPrice - (atr * 3);
    riskRewardRatio = 1.5;
  } else {
    stopLoss = currentPrice - (atr * 1.5);
    takeProfit = currentPrice + (atr * 1.5);
    riskRewardRatio = 1;
  }
  
  const id = `${symbol}-${timeframe}-${Date.now()}`;
  
  return {
    id,
    symbol,
    type: signalType,
    confidence: Math.round(confidence),
    entryPrice: currentPrice,
    stopLoss: Math.round(stopLoss * 100000) / 100000,
    takeProfit: Math.round(takeProfit * 100000) / 100000,
    riskRewardRatio,
    timeframe,
    timestamp: Date.now(),
    indicators,
    reasoning
  };
}

/**
 * Generate enhanced trading signal with ML and patterns
 */
export function generateEnhancedSignal(
  candles: Candle[],
  symbol: string,
  timeframe: Timeframe,
  _mlStrategy?: MLStrategy | null
): EnhancedSignal {
  // Default weights (no ML available)
  const weights = {
    rsi: 15,
    macd: 20,
    ema: 25,
    bollingerBands: 15,
    stochastic: 15,
    vwap: 10
  };
  
  // Calculate indicators
  const indicators = calculateAllIndicators(candles);
  const currentPrice = candles[candles.length - 1].close;
  
  // Detect patterns
  const patterns = detectAllPatterns(candles);
  
  // Analyze indicators with weights
  const rsiAnalysis = analyzeRSI(indicators.rsi, indicators.rsiSignal, weights.rsi);
  const macdAnalysis = analyzeMACD(
    indicators.macd.macd,
    indicators.macd.signal,
    indicators.macd.histogram,
    indicators.macd.trend,
    weights.macd
  );
  const maAnalysis = analyzeMovingAverages(
    currentPrice,
    indicators.ema.ema9,
    indicators.ema.ema21,
    indicators.ema.ema50,
    indicators.ema.ema200,
    weights.ema
  );
  const bbAnalysis = analyzeBollingerBands(
    currentPrice,
    indicators.bollingerBands.upper,
    indicators.bollingerBands.middle,
    indicators.bollingerBands.lower,
    indicators.bollingerBands.position,
    weights.bollingerBands
  );
  const stochAnalysis = analyzeStochastic(
    indicators.stochastic.k,
    indicators.stochastic.d,
    indicators.stochastic.signal,
    weights.stochastic
  );
  const vwapAnalysis = analyzeVWAP(currentPrice, indicators.vwap, weights.vwap);
  
  const analyses = [rsiAnalysis, macdAnalysis, maAnalysis, bbAnalysis, stochAnalysis, vwapAnalysis];
  
  // Calculate weighted scores
  let totalWeight = 0;
  let weightedBullish = 0;
  let weightedBearish = 0;
  const reasoning: string[] = [];
  
  for (const analysis of analyses) {
    weightedBullish += analysis.bullishScore * analysis.weight;
    weightedBearish += analysis.bearishScore * analysis.weight;
    totalWeight += analysis.weight;
    
    if (analysis.signal !== 'neutral') {
      reasoning.push(`${analysis.name}: ${analysis.signal.toUpperCase()} (${analysis.signal === 'bullish' ? analysis.bullishScore.toFixed(0) : analysis.bearishScore.toFixed(0)}%)`);
    }
  }
  
  // Add pattern analysis to reasoning
  if (patterns.length > 0) {
    const topPattern = patterns[0];
    reasoning.push(`Pattern: ${topPattern.name} (${topPattern.type.toUpperCase()})`);
  }
  
  const avgBullish = weightedBullish / totalWeight;
  const avgBearish = weightedBearish / totalWeight;
  
  // Technical signals only (no ML)
  const combinedDiff = avgBullish - avgBearish;
  
  let signalType: SignalType;
  let confidence: number;
  
  if (combinedDiff > 15) {
    signalType = 'BUY';
    confidence = Math.min(95, avgBullish);
  } else if (combinedDiff < -15) {
    signalType = 'SELL';
    confidence = Math.min(95, avgBearish);
  } else {
    signalType = 'HOLD';
    confidence = 100 - Math.abs(combinedDiff);
  }
  
  // Calculate probability scores
  const probabilityScore = {
    bullish: Math.round(avgBullish),
    bearish: Math.round(avgBearish),
    neutral: Math.round(100 - (avgBullish + avgBearish) / 2),
  };
  
  // Determine signal strength
  let signalStrength: 'strong' | 'moderate' | 'weak';
  if (confidence >= 75 && Math.abs(combinedDiff) > 25) {
    signalStrength = 'strong';
  } else if (confidence >= 60 && Math.abs(combinedDiff) > 15) {
    signalStrength = 'moderate';
  } else {
    signalStrength = 'weak';
  }
  
  // Calculate Stop Loss and Take Profit with forex spread
  const atr = indicators.atr;
  const pipValue = getPipValue(symbol);
  const spread = getSpread(symbol);
  const spreadPrice = spread * pipValue;
  
  let stopLoss: number;
  let takeProfit: number;
  let riskRewardRatio: number;
  
  if (signalType === 'BUY') {
    const entryWithSpread = currentPrice + spreadPrice / 2;
    stopLoss = entryWithSpread - (atr * 2);
    takeProfit = entryWithSpread + (atr * 3);
    riskRewardRatio = 1.5;
  } else if (signalType === 'SELL') {
    const entryWithSpread = currentPrice - spreadPrice / 2;
    stopLoss = entryWithSpread + (atr * 2);
    takeProfit = entryWithSpread - (atr * 3);
    riskRewardRatio = 1.5;
  } else {
    stopLoss = currentPrice - (atr * 1.5);
    takeProfit = currentPrice + (atr * 1.5);
    riskRewardRatio = 1;
  }
  
  // Generate recommended action description
  const bullishCount = patterns.filter(p => p.type === 'bullish').length;
  const bearishCount = patterns.filter(p => p.type === 'bearish').length;
  
  let recommendedAction = '';
  if (signalType === 'BUY') {
    recommendedAction = `Strong buy signal with ${confidence}% confidence. `;
    if (bullishCount > bearishCount) {
      recommendedAction += `${bullishCount} bullish patterns detected. `;
    }
    recommendedAction += `Entry near ${currentPrice.toFixed(5)}, SL: ${stopLoss.toFixed(5)}, TP: ${takeProfit.toFixed(5)}`;
  } else if (signalType === 'SELL') {
    recommendedAction = `Strong sell signal with ${confidence}% confidence. `;
    if (bearishCount > bullishCount) {
      recommendedAction += `${bearishCount} bearish patterns detected. `;
    }
    recommendedAction += `Entry near ${currentPrice.toFixed(5)}, SL: ${stopLoss.toFixed(5)}, TP: ${takeProfit.toFixed(5)}`;
  } else {
    recommendedAction = `Market in consolidation. Wait for clearer signals. Current confidence: ${confidence}%`;
  }
  
  // Generate unique ID
  const id = `${symbol}-${timeframe}-${Date.now()}`;
  
  return {
    id,
    symbol,
    type: signalType,
    confidence: Math.round(confidence),
    entryPrice: currentPrice,
    stopLoss: Math.round(stopLoss * 100000) / 100000,
    takeProfit: Math.round(takeProfit * 100000) / 100000,
    riskRewardRatio,
    timeframe,
    timestamp: Date.now(),
    indicators,
    reasoning,
    // Enhanced fields
    patterns: patterns.slice(0, 10), // Top 10 patterns
    mlConfidence: confidence,
    mlWeights: weights,
    backtestMetrics: {
      historicalWinRate: 0,
      similarSetupWinRate: 0,
      averagePips: 0,
    },
    probabilityScore,
    signalStrength,
    recommendedAction,
  };
}

/**
 * Calculate signal performance
 */
export function calculateSignalPerformance(
  signals: Signal[],
  currentPrices: Record<string, number>
): {
  totalSignals: number;
  winningSignals: number;
  losingSignals: number;
  winRate: number;
} {
  let winningSignals = 0;
  let losingSignals = 0;
  
  for (const signal of signals) {
    const currentPrice = currentPrices[signal.symbol];
    if (!currentPrice) continue;
    
    if (signal.type === 'BUY') {
      if (currentPrice >= signal.takeProfit) {
        winningSignals++;
      } else if (currentPrice <= signal.stopLoss) {
        losingSignals++;
      }
    } else if (signal.type === 'SELL') {
      if (currentPrice <= signal.takeProfit) {
        winningSignals++;
      } else if (currentPrice >= signal.stopLoss) {
        losingSignals++;
      }
    }
  }
  
  const totalSignals = winningSignals + losingSignals;
  const winRate = totalSignals > 0 ? (winningSignals / totalSignals) * 100 : 0;
  
  return {
    totalSignals,
    winningSignals,
    losingSignals,
    winRate
  };
}

export { calculateAllIndicators };
