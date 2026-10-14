// Candlestick Pattern Recognition System for ForexML Pro
import { Candle } from './types';

export type PatternType = 'bullish' | 'bearish' | 'neutral';
export type PatternStrength = 1 | 2 | 3 | 4 | 5;

export interface CandlePattern {
  name: string;
  nameFr: string;
  type: PatternType;
  strength: PatternStrength; // 1-5 stars reliability
  description: string;
  expectedDirection: 'up' | 'down' | 'neutral';
  suggestedAction: 'buy' | 'sell' | 'wait';
}

export interface DetectedPattern extends CandlePattern {
  startIndex: number;
  endIndex: number;
  confidence: number;
}

// Helper functions for candle analysis
function getBodySize(candle: Candle): number {
  return Math.abs(candle.close - candle.open);
}

function getUpperWick(candle: Candle): number {
  return candle.high - Math.max(candle.open, candle.close);
}

function getLowerWick(candle: Candle): number {
  return Math.min(candle.open, candle.close) - candle.low;
}

function getTotalRange(candle: Candle): number {
  return candle.high - candle.low;
}

function isBullish(candle: Candle): boolean {
  return candle.close > candle.open;
}

function isBearish(candle: Candle): boolean {
  return candle.close < candle.open;
}

function isDoji(candle: Candle, threshold: number = 0.1): boolean {
  const bodySize = getBodySize(candle);
  const totalRange = getTotalRange(candle);
  return totalRange > 0 && bodySize / totalRange < threshold;
}

function getAverageBodySize(candles: Candle[], period: number = 10): number {
  const recent = candles.slice(-period);
  return recent.reduce((sum, c) => sum + getBodySize(c), 0) / period;
}

function getAverageRange(candles: Candle[], period: number = 10): number {
  const recent = candles.slice(-period);
  return recent.reduce((sum, c) => sum + getTotalRange(c), 0) / period;
}

// ==================== SINGLE CANDLE PATTERNS ====================

function detectHammer(candles: Candle[]): DetectedPattern | null {
  if (candles.length < 2) return null;
  
  const candle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  
  const bodySize = getBodySize(candle);
  const lowerWick = getLowerWick(candle);
  const upperWick = getUpperWick(candle);
  const totalRange = getTotalRange(candle);
  
  // Hammer criteria:
  // - Small body at the top
  // - Long lower wick (at least 2x body)
  // - Little to no upper wick
  // - Appears in downtrend
  
  const isDowntrend = prevCandle.close < candles[Math.max(0, candles.length - 10)]?.close;
  
  if (
    totalRange > 0 &&
    lowerWick >= bodySize * 2 &&
    upperWick < bodySize * 0.5 &&
    lowerWick / totalRange > 0.6 &&
    isDowntrend
  ) {
    return {
      name: 'Hammer',
      nameFr: 'Marteau',
      type: 'bullish',
      strength: 3,
      description: 'Bullish reversal pattern found at bottom of downtrend',
      expectedDirection: 'up',
      suggestedAction: 'buy',
      startIndex: candles.length - 1,
      endIndex: candles.length - 1,
      confidence: 70
    };
  }
  
  return null;
}

function detectInvertedHammer(candles: Candle[]): DetectedPattern | null {
  if (candles.length < 2) return null;
  
  const candle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  
  const bodySize = getBodySize(candle);
  const lowerWick = getLowerWick(candle);
  const upperWick = getUpperWick(candle);
  const totalRange = getTotalRange(candle);
  
  const isDowntrend = prevCandle.close < candles[Math.max(0, candles.length - 10)]?.close;
  
  if (
    totalRange > 0 &&
    upperWick >= bodySize * 2 &&
    lowerWick < bodySize * 0.5 &&
    upperWick / totalRange > 0.6 &&
    isDowntrend
  ) {
    return {
      name: 'Inverted Hammer',
      nameFr: 'Marteau Inversé',
      type: 'bullish',
      strength: 3,
      description: 'Bullish reversal pattern, potential trend change',
      expectedDirection: 'up',
      suggestedAction: 'buy',
      startIndex: candles.length - 1,
      endIndex: candles.length - 1,
      confidence: 65
    };
  }
  
  return null;
}

function detectHangingMan(candles: Candle[]): DetectedPattern | null {
  if (candles.length < 2) return null;
  
  const candle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  
  const bodySize = getBodySize(candle);
  const lowerWick = getLowerWick(candle);
  const upperWick = getUpperWick(candle);
  const totalRange = getTotalRange(candle);
  
  const isUptrend = prevCandle.close > candles[Math.max(0, candles.length - 10)]?.close;
  
  if (
    totalRange > 0 &&
    lowerWick >= bodySize * 2 &&
    upperWick < bodySize * 0.5 &&
    lowerWick / totalRange > 0.6 &&
    isUptrend
  ) {
    return {
      name: 'Hanging Man',
      nameFr: 'Pendu',
      type: 'bearish',
      strength: 3,
      description: 'Bearish reversal pattern found at top of uptrend',
      expectedDirection: 'down',
      suggestedAction: 'sell',
      startIndex: candles.length - 1,
      endIndex: candles.length - 1,
      confidence: 70
    };
  }
  
  return null;
}

function detectShootingStar(candles: Candle[]): DetectedPattern | null {
  if (candles.length < 2) return null;
  
  const candle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  
  const bodySize = getBodySize(candle);
  const lowerWick = getLowerWick(candle);
  const upperWick = getUpperWick(candle);
  const totalRange = getTotalRange(candle);
  
  const isUptrend = prevCandle.close > candles[Math.max(0, candles.length - 10)]?.close;
  
  if (
    totalRange > 0 &&
    upperWick >= bodySize * 2 &&
    lowerWick < bodySize * 0.5 &&
    upperWick / totalRange > 0.6 &&
    isUptrend
  ) {
    return {
      name: 'Shooting Star',
      nameFr: 'Étoile Filante',
      type: 'bearish',
      strength: 4,
      description: 'Strong bearish reversal signal after uptrend',
      expectedDirection: 'down',
      suggestedAction: 'sell',
      startIndex: candles.length - 1,
      endIndex: candles.length - 1,
      confidence: 75
    };
  }
  
  return null;
}

function detectDojiPattern(candles: Candle[]): DetectedPattern | null {
  if (candles.length < 1) return null;
  
  const candle = candles[candles.length - 1];
  const bodySize = getBodySize(candle);
  const totalRange = getTotalRange(candle);
  const upperWick = getUpperWick(candle);
  const lowerWick = getLowerWick(candle);
  
  if (!isDoji(candle, 0.05)) return null;
  
  // Dragonfly Doji
  if (lowerWick > totalRange * 0.6 && upperWick < totalRange * 0.1) {
    return {
      name: 'Dragonfly Doji',
      nameFr: 'Doji Libellule',
      type: 'bullish',
      strength: 3,
      description: 'Bullish signal, buyers stepped in after selling pressure',
      expectedDirection: 'up',
      suggestedAction: 'buy',
      startIndex: candles.length - 1,
      endIndex: candles.length - 1,
      confidence: 65
    };
  }
  
  // Gravestone Doji
  if (upperWick > totalRange * 0.6 && lowerWick < totalRange * 0.1) {
    return {
      name: 'Gravestone Doji',
      nameFr: 'Doji Pierre Tombale',
      type: 'bearish',
      strength: 3,
      description: 'Bearish signal, sellers rejected higher prices',
      expectedDirection: 'down',
      suggestedAction: 'sell',
      startIndex: candles.length - 1,
      endIndex: candles.length - 1,
      confidence: 65
    };
  }
  
  // Long-legged Doji
  if (upperWick > totalRange * 0.3 && lowerWick > totalRange * 0.3) {
    return {
      name: 'Long-legged Doji',
      nameFr: 'Doji Longues Jambes',
      type: 'neutral',
      strength: 2,
      description: 'Indecision in the market, high volatility',
      expectedDirection: 'neutral',
      suggestedAction: 'wait',
      startIndex: candles.length - 1,
      endIndex: candles.length - 1,
      confidence: 50
    };
  }
  
  // Standard Doji
  return {
    name: 'Doji',
    nameFr: 'Doji',
    type: 'neutral',
    strength: 2,
    description: 'Indecision candle, potential reversal signal',
    expectedDirection: 'neutral',
    suggestedAction: 'wait',
    startIndex: candles.length - 1,
    endIndex: candles.length - 1,
    confidence: 55
  };
}

function detectMarubozu(candles: Candle[]): DetectedPattern | null {
  if (candles.length < 1) return null;
  
  const candle = candles[candles.length - 1];
  const bodySize = getBodySize(candle);
  const totalRange = getTotalRange(candle);
  const upperWick = getUpperWick(candle);
  const lowerWick = getLowerWick(candle);
  
  // Marubozu has no or very small wicks
  const hasSmallWicks = upperWick < totalRange * 0.05 && lowerWick < totalRange * 0.05;
  
  if (!hasSmallWicks || bodySize < totalRange * 0.9) return null;
  
  if (isBullish(candle)) {
    return {
      name: 'Bullish Marubozu',
      nameFr: 'Marubozu Haussier',
      type: 'bullish',
      strength: 4,
      description: 'Strong bullish candle, buyers in full control',
      expectedDirection: 'up',
      suggestedAction: 'buy',
      startIndex: candles.length - 1,
      endIndex: candles.length - 1,
      confidence: 80
    };
  } else {
    return {
      name: 'Bearish Marubozu',
      nameFr: 'Marubozu Baissier',
      type: 'bearish',
      strength: 4,
      description: 'Strong bearish candle, sellers in full control',
      expectedDirection: 'down',
      suggestedAction: 'sell',
      startIndex: candles.length - 1,
      endIndex: candles.length - 1,
      confidence: 80
    };
  }
}

function detectSpinningTop(candles: Candle[]): DetectedPattern | null {
  if (candles.length < 1) return null;
  
  const candle = candles[candles.length - 1];
  const bodySize = getBodySize(candle);
  const totalRange = getTotalRange(candle);
  const upperWick = getUpperWick(candle);
  const lowerWick = getLowerWick(candle);
  
  // Spinning top: small body, similar upper and lower wicks
  const hasSmallBody = bodySize < totalRange * 0.3;
  const hasSimilarWicks = Math.abs(upperWick - lowerWick) < totalRange * 0.15;
  const hasReasonableWicks = upperWick > bodySize && lowerWick > bodySize;
  
  if (hasSmallBody && hasSimilarWicks && hasReasonableWicks) {
    return {
      name: 'Spinning Top',
      nameFr: 'Toupie',
      type: 'neutral',
      strength: 2,
      description: 'Indecision pattern, market uncertainty',
      expectedDirection: 'neutral',
      suggestedAction: 'wait',
      startIndex: candles.length - 1,
      endIndex: candles.length - 1,
      confidence: 50
    };
  }
  
  return null;
}

// ==================== DOUBLE CANDLE PATTERNS ====================

function detectBullishEngulfing(candles: Candle[]): DetectedPattern | null {
  if (candles.length < 2) return null;
  
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  // Previous candle is bearish, current is bullish
  // Current body completely engulfs previous body
  const isEngulfing =
    isBearish(prev) &&
    isBullish(current) &&
    current.open < prev.close &&
    current.close > prev.open;
  
  // Better if in downtrend
  const isDowntrend = candles.length > 5 && 
    candles[candles.length - 3].close < candles[Math.max(0, candles.length - 10)]?.close;
  
  if (isEngulfing) {
    return {
      name: 'Bullish Engulfing',
      nameFr: 'Engouffrement Haussier',
      type: 'bullish',
      strength: isDowntrend ? 4 : 3,
      description: 'Strong bullish reversal signal, buyers take control',
      expectedDirection: 'up',
      suggestedAction: 'buy',
      startIndex: candles.length - 2,
      endIndex: candles.length - 1,
      confidence: isDowntrend ? 80 : 70
    };
  }
  
  return null;
}

function detectBearishEngulfing(candles: Candle[]): DetectedPattern | null {
  if (candles.length < 2) return null;
  
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  const isEngulfing =
    isBullish(prev) &&
    isBearish(current) &&
    current.open > prev.close &&
    current.close < prev.open;
  
  const isUptrend = candles.length > 5 &&
    candles[candles.length - 3].close > candles[Math.max(0, candles.length - 10)]?.close;
  
  if (isEngulfing) {
    return {
      name: 'Bearish Engulfing',
      nameFr: 'Engouffrement Baissier',
      type: 'bearish',
      strength: isUptrend ? 4 : 3,
      description: 'Strong bearish reversal signal, sellers take control',
      expectedDirection: 'down',
      suggestedAction: 'sell',
      startIndex: candles.length - 2,
      endIndex: candles.length - 1,
      confidence: isUptrend ? 80 : 70
    };
  }
  
  return null;
}

function detectBullishHarami(candles: Candle[]): DetectedPattern | null {
  if (candles.length < 2) return null;
  
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  const isHarami =
    isBearish(prev) &&
    isBullish(current) &&
    current.open > prev.close &&
    current.close < prev.open;
  
  const isDowntrend = candles.length > 5 &&
    candles[candles.length - 3].close < candles[Math.max(0, candles.length - 10)]?.close;
  
  if (isHarami) {
    return {
      name: 'Bullish Harami',
      nameFr: 'Harami Haussier',
      type: 'bullish',
      strength: isDowntrend ? 3 : 2,
      description: 'Potential bullish reversal, but requires confirmation',
      expectedDirection: 'up',
      suggestedAction: 'buy',
      startIndex: candles.length - 2,
      endIndex: candles.length - 1,
      confidence: isDowntrend ? 65 : 55
    };
  }
  
  return null;
}

function detectBearishHarami(candles: Candle[]): DetectedPattern | null {
  if (candles.length < 2) return null;
  
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  const isHarami =
    isBullish(prev) &&
    isBearish(current) &&
    current.open < prev.close &&
    current.close > prev.open;
  
  const isUptrend = candles.length > 5 &&
    candles[candles.length - 3].close > candles[Math.max(0, candles.length - 10)]?.close;
  
  if (isHarami) {
    return {
      name: 'Bearish Harami',
      nameFr: 'Harami Baissier',
      type: 'bearish',
      strength: isUptrend ? 3 : 2,
      description: 'Potential bearish reversal, but requires confirmation',
      expectedDirection: 'down',
      suggestedAction: 'sell',
      startIndex: candles.length - 2,
      endIndex: candles.length - 1,
      confidence: isUptrend ? 65 : 55
    };
  }
  
  return null;
}

function detectPiercingLine(candles: Candle[]): DetectedPattern | null {
  if (candles.length < 2) return null;
  
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  const prevMidpoint = (prev.open + prev.close) / 2;
  
  const isPiercing =
    isBearish(prev) &&
    isBullish(current) &&
    current.open < prev.low &&
    current.close > prevMidpoint &&
    current.close < prev.open;
  
  if (isPiercing) {
    return {
      name: 'Piercing Line',
      nameFr: 'Ligne Percutante',
      type: 'bullish',
      strength: 3,
      description: 'Bullish reversal, price pierces above midpoint of previous bearish candle',
      expectedDirection: 'up',
      suggestedAction: 'buy',
      startIndex: candles.length - 2,
      endIndex: candles.length - 1,
      confidence: 70
    };
  }
  
  return null;
}

function detectDarkCloudCover(candles: Candle[]): DetectedPattern | null {
  if (candles.length < 2) return null;
  
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  const prevMidpoint = (prev.open + prev.close) / 2;
  
  const isDarkCloud =
    isBullish(prev) &&
    isBearish(current) &&
    current.open > prev.high &&
    current.close < prevMidpoint &&
    current.close > prev.open;
  
  if (isDarkCloud) {
    return {
      name: 'Dark Cloud Cover',
      nameFr: 'Nuage Noir',
      type: 'bearish',
      strength: 3,
      description: 'Bearish reversal, price closes below midpoint of previous bullish candle',
      expectedDirection: 'down',
      suggestedAction: 'sell',
      startIndex: candles.length - 2,
      endIndex: candles.length - 1,
      confidence: 70
    };
  }
  
  return null;
}

function detectTweezerTop(candles: Candle[]): DetectedPattern | null {
  if (candles.length < 2) return null;
  
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  // Similar highs
  const highSimilarity = Math.abs(current.high - prev.high) / current.high < 0.001;
  
  const isUptrend = candles.length > 5 &&
    candles[candles.length - 3].close > candles[Math.max(0, candles.length - 10)]?.close;
  
  if (highSimilarity && isUptrend) {
    return {
      name: 'Tweezer Top',
      nameFr: 'Pinceau Sommet',
      type: 'bearish',
      strength: 3,
      description: 'Double rejection at resistance level',
      expectedDirection: 'down',
      suggestedAction: 'sell',
      startIndex: candles.length - 2,
      endIndex: candles.length - 1,
      confidence: 70
    };
  }
  
  return null;
}

function detectTweezerBottom(candles: Candle[]): DetectedPattern | null {
  if (candles.length < 2) return null;
  
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  const lowSimilarity = Math.abs(current.low - prev.low) / current.low < 0.001;
  
  const isDowntrend = candles.length > 5 &&
    candles[candles.length - 3].close < candles[Math.max(0, candles.length - 10)]?.close;
  
  if (lowSimilarity && isDowntrend) {
    return {
      name: 'Tweezer Bottom',
      nameFr: 'Pinceau Creux',
      type: 'bullish',
      strength: 3,
      description: 'Double rejection at support level',
      expectedDirection: 'up',
      suggestedAction: 'buy',
      startIndex: candles.length - 2,
      endIndex: candles.length - 1,
      confidence: 70
    };
  }
  
  return null;
}

// ==================== TRIPLE CANDLE PATTERNS ====================

function detectMorningStar(candles: Candle[]): DetectedPattern | null {
  if (candles.length < 3) return null;
  
  const third = candles[candles.length - 1];
  const second = candles[candles.length - 2];
  const first = candles[candles.length - 3];
  
  const isDowntrend = candles.length > 5 &&
    candles[candles.length - 4].close < candles[Math.max(0, candles.length - 10)]?.close;
  
  const isMorningStar =
    isBearish(first) &&
    isDoji(second, 0.15) &&
    isBullish(third) &&
    second.open < first.close &&
    third.close > (first.open + first.close) / 2;
  
  if (isMorningStar && isDowntrend) {
    return {
      name: 'Morning Star',
      nameFr: 'Étoile du Matin',
      type: 'bullish',
      strength: 5,
      description: 'Strong bullish reversal pattern after downtrend',
      expectedDirection: 'up',
      suggestedAction: 'buy',
      startIndex: candles.length - 3,
      endIndex: candles.length - 1,
      confidence: 85
    };
  }
  
  return null;
}

function detectEveningStar(candles: Candle[]): DetectedPattern | null {
  if (candles.length < 3) return null;
  
  const third = candles[candles.length - 1];
  const second = candles[candles.length - 2];
  const first = candles[candles.length - 3];
  
  const isUptrend = candles.length > 5 &&
    candles[candles.length - 4].close > candles[Math.max(0, candles.length - 10)]?.close;
  
  const isEveningStar =
    isBullish(first) &&
    isDoji(second, 0.15) &&
    isBearish(third) &&
    second.open > first.close &&
    third.close < (first.open + first.close) / 2;
  
  if (isEveningStar && isUptrend) {
    return {
      name: 'Evening Star',
      nameFr: 'Étoile du Soir',
      type: 'bearish',
      strength: 5,
      description: 'Strong bearish reversal pattern after uptrend',
      expectedDirection: 'down',
      suggestedAction: 'sell',
      startIndex: candles.length - 3,
      endIndex: candles.length - 1,
      confidence: 85
    };
  }
  
  return null;
}

function detectThreeWhiteSoldiers(candles: Candle[]): DetectedPattern | null {
  if (candles.length < 3) return null;
  
  const third = candles[candles.length - 1];
  const second = candles[candles.length - 2];
  const first = candles[candles.length - 3];
  
  const avgBody = getAverageBodySize(candles, 10);
  
  const isThreeWhite =
    isBullish(first) &&
    isBullish(second) &&
    isBullish(third) &&
    first.close < second.open &&
    second.close < third.open &&
    getBodySize(first) > avgBody * 0.7 &&
    getBodySize(second) > avgBody * 0.7 &&
    getBodySize(third) > avgBody * 0.7 &&
    getUpperWick(first) < getBodySize(first) * 0.3 &&
    getUpperWick(second) < getBodySize(second) * 0.3 &&
    getUpperWick(third) < getBodySize(third) * 0.3;
  
  if (isThreeWhite) {
    return {
      name: 'Three White Soldiers',
      nameFr: 'Trois Soldats Blancs',
      type: 'bullish',
      strength: 5,
      description: 'Very strong bullish continuation pattern',
      expectedDirection: 'up',
      suggestedAction: 'buy',
      startIndex: candles.length - 3,
      endIndex: candles.length - 1,
      confidence: 90
    };
  }
  
  return null;
}

function detectThreeBlackCrows(candles: Candle[]): DetectedPattern | null {
  if (candles.length < 3) return null;
  
  const third = candles[candles.length - 1];
  const second = candles[candles.length - 2];
  const first = candles[candles.length - 3];
  
  const avgBody = getAverageBodySize(candles, 10);
  
  const isThreeBlack =
    isBearish(first) &&
    isBearish(second) &&
    isBearish(third) &&
    first.close > second.open &&
    second.close > third.open &&
    getBodySize(first) > avgBody * 0.7 &&
    getBodySize(second) > avgBody * 0.7 &&
    getBodySize(third) > avgBody * 0.7 &&
    getLowerWick(first) < getBodySize(first) * 0.3 &&
    getLowerWick(second) < getBodySize(second) * 0.3 &&
    getLowerWick(third) < getBodySize(third) * 0.3;
  
  if (isThreeBlack) {
    return {
      name: 'Three Black Crows',
      nameFr: 'Trois Corbeaux Noirs',
      type: 'bearish',
      strength: 5,
      description: 'Very strong bearish continuation pattern',
      expectedDirection: 'down',
      suggestedAction: 'sell',
      startIndex: candles.length - 3,
      endIndex: candles.length - 1,
      confidence: 90
    };
  }
  
  return null;
}

// ==================== MAIN DETECTION FUNCTION ====================

/**
 * Detect all candlestick patterns in the given candles
 */
export function detectAllPatterns(candles: Candle[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  
  // Single candle patterns
  const singlePatterns = [
    detectHammer,
    detectInvertedHammer,
    detectHangingMan,
    detectShootingStar,
    detectDojiPattern,
    detectMarubozu,
    detectSpinningTop,
  ];
  
  // Double candle patterns
  const doublePatterns = [
    detectBullishEngulfing,
    detectBearishEngulfing,
    detectBullishHarami,
    detectBearishHarami,
    detectPiercingLine,
    detectDarkCloudCover,
    detectTweezerTop,
    detectTweezerBottom,
  ];
  
  // Triple candle patterns
  const triplePatterns = [
    detectMorningStar,
    detectEveningStar,
    detectThreeWhiteSoldiers,
    detectThreeBlackCrows,
  ];
  
  // Run all detection functions
  for (const detect of [...singlePatterns, ...doublePatterns, ...triplePatterns]) {
    const pattern = detect(candles);
    if (pattern) {
      patterns.push(pattern);
    }
  }
  
  // Sort by strength (highest first)
  return patterns.sort((a, b) => b.strength - a.strength);
}

/**
 * Get the most significant pattern (highest strength)
 */
export function getMostSignificantPattern(candles: Candle[]): DetectedPattern | null {
  const patterns = detectAllPatterns(candles);
  return patterns.length > 0 ? patterns[0] : null;
}

/**
 * Get patterns by type
 */
export function getPatternsByType(candles: Candle[], type: PatternType): DetectedPattern[] {
  return detectAllPatterns(candles).filter(p => p.type === type);
}

/**
 * Calculate pattern reliability based on historical data
 */
export function calculatePatternReliability(
  patternName: string,
  historicalWins: number,
  historicalTotal: number
): number {
  if (historicalTotal === 0) return 50; // Default 50% if no data
  return (historicalWins / historicalTotal) * 100;
}

// Export all pattern definitions for reference
export const PATTERN_DEFINITIONS: CandlePattern[] = [
  // Bullish
  { name: 'Hammer', nameFr: 'Marteau', type: 'bullish', strength: 3, description: 'Bullish reversal at bottom', expectedDirection: 'up', suggestedAction: 'buy' },
  { name: 'Inverted Hammer', nameFr: 'Marteau Inversé', type: 'bullish', strength: 3, description: 'Bullish reversal signal', expectedDirection: 'up', suggestedAction: 'buy' },
  { name: 'Bullish Engulfing', nameFr: 'Engouffrement Haussier', type: 'bullish', strength: 4, description: 'Strong bullish reversal', expectedDirection: 'up', suggestedAction: 'buy' },
  { name: 'Piercing Line', nameFr: 'Ligne Percutante', type: 'bullish', strength: 3, description: 'Bullish reversal pattern', expectedDirection: 'up', suggestedAction: 'buy' },
  { name: 'Morning Star', nameFr: 'Étoile du Matin', type: 'bullish', strength: 5, description: 'Strong bullish reversal', expectedDirection: 'up', suggestedAction: 'buy' },
  { name: 'Three White Soldiers', nameFr: 'Trois Soldats Blancs', type: 'bullish', strength: 5, description: 'Very strong bullish signal', expectedDirection: 'up', suggestedAction: 'buy' },
  { name: 'Bullish Harami', nameFr: 'Harami Haussier', type: 'bullish', strength: 3, description: 'Potential bullish reversal', expectedDirection: 'up', suggestedAction: 'buy' },
  { name: 'Tweezer Bottom', nameFr: 'Pinceau Creux', type: 'bullish', strength: 3, description: 'Double rejection at support', expectedDirection: 'up', suggestedAction: 'buy' },
  { name: 'Dragonfly Doji', nameFr: 'Doji Libellule', type: 'bullish', strength: 3, description: 'Bullish signal', expectedDirection: 'up', suggestedAction: 'buy' },
  { name: 'Bullish Marubozu', nameFr: 'Marubozu Haussier', type: 'bullish', strength: 4, description: 'Strong bullish candle', expectedDirection: 'up', suggestedAction: 'buy' },
  
  // Bearish
  { name: 'Hanging Man', nameFr: 'Pendu', type: 'bearish', strength: 3, description: 'Bearish reversal at top', expectedDirection: 'down', suggestedAction: 'sell' },
  { name: 'Shooting Star', nameFr: 'Étoile Filante', type: 'bearish', strength: 4, description: 'Strong bearish reversal', expectedDirection: 'down', suggestedAction: 'sell' },
  { name: 'Bearish Engulfing', nameFr: 'Engouffrement Baissier', type: 'bearish', strength: 4, description: 'Strong bearish reversal', expectedDirection: 'down', suggestedAction: 'sell' },
  { name: 'Dark Cloud Cover', nameFr: 'Nuage Noir', type: 'bearish', strength: 3, description: 'Bearish reversal pattern', expectedDirection: 'down', suggestedAction: 'sell' },
  { name: 'Evening Star', nameFr: 'Étoile du Soir', type: 'bearish', strength: 5, description: 'Strong bearish reversal', expectedDirection: 'down', suggestedAction: 'sell' },
  { name: 'Three Black Crows', nameFr: 'Trois Corbeaux Noirs', type: 'bearish', strength: 5, description: 'Very strong bearish signal', expectedDirection: 'down', suggestedAction: 'sell' },
  { name: 'Bearish Harami', nameFr: 'Harami Baissier', type: 'bearish', strength: 3, description: 'Potential bearish reversal', expectedDirection: 'down', suggestedAction: 'sell' },
  { name: 'Tweezer Top', nameFr: 'Pinceau Sommet', type: 'bearish', strength: 3, description: 'Double rejection at resistance', expectedDirection: 'down', suggestedAction: 'sell' },
  { name: 'Gravestone Doji', nameFr: 'Doji Pierre Tombale', type: 'bearish', strength: 3, description: 'Bearish signal', expectedDirection: 'down', suggestedAction: 'sell' },
  { name: 'Bearish Marubozu', nameFr: 'Marubozu Baissier', type: 'bearish', strength: 4, description: 'Strong bearish candle', expectedDirection: 'down', suggestedAction: 'sell' },
  
  // Neutral
  { name: 'Doji', nameFr: 'Doji', type: 'neutral', strength: 2, description: 'Market indecision', expectedDirection: 'neutral', suggestedAction: 'wait' },
  { name: 'Spinning Top', nameFr: 'Toupie', type: 'neutral', strength: 2, description: 'Market uncertainty', expectedDirection: 'neutral', suggestedAction: 'wait' },
  { name: 'Long-legged Doji', nameFr: 'Doji Longues Jambes', type: 'neutral', strength: 2, description: 'High volatility indecision', expectedDirection: 'neutral', suggestedAction: 'wait' },
];
