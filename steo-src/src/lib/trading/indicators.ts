// Technical Indicators Library for TradeSignal Pro
import { Candle, IndicatorValues } from './types';

/**
 * Calculate Simple Moving Average (SMA)
 */
export function calculateSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j];
    }
    result.push(sum / period);
  }
  
  return result;
}

/**
 * Calculate Exponential Moving Average (EMA)
 */
export function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // First EMA is SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
    result.push(NaN);
  }
  result[period - 1] = sum / period;
  
  // Calculate EMA for rest of data
  for (let i = period; i < data.length; i++) {
    const ema = (data[i] - result[i - 1]) * multiplier + result[i - 1];
    result.push(ema);
  }
  
  return result;
}

/**
 * Calculate Relative Strength Index (RSI)
 */
export function calculateRSI(data: number[], period: number = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  // Calculate price changes
  for (let i = 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  // First RSI value
  result.push(NaN);
  for (let i = 0; i < period - 1; i++) {
    result.push(NaN);
  }
  
  if (gains.length < period) {
    return result;
  }
  
  // Calculate initial average gain and loss
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  // Calculate RSI
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    
    if (avgLoss === 0) {
      result.push(100);
    } else {
      const rs = avgGain / avgLoss;
      result.push(100 - (100 / (1 + rs)));
    }
  }
  
  return result;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
export function calculateMACD(
  data: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number[]; signal: number[]; histogram: number[] } {
  const emaFast = calculateEMA(data, fastPeriod);
  const emaSlow = calculateEMA(data, slowPeriod);
  
  const macdLine: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (isNaN(emaFast[i]) || isNaN(emaSlow[i])) {
      macdLine.push(NaN);
    } else {
      macdLine.push(emaFast[i] - emaSlow[i]);
    }
  }
  
  const signalLine = calculateEMA(macdLine.filter(v => !isNaN(v)), signalPeriod);
  
  // Align signal line with macd line
  const alignedSignal: number[] = [];
  let signalIndex = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (isNaN(macdLine[i])) {
      alignedSignal.push(NaN);
    } else {
      alignedSignal.push(signalLine[signalIndex] ?? NaN);
      signalIndex++;
    }
  }
  
  const histogram: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (isNaN(macdLine[i]) || isNaN(alignedSignal[i])) {
      histogram.push(NaN);
    } else {
      histogram.push(macdLine[i] - alignedSignal[i]);
    }
  }
  
  return {
    macd: macdLine,
    signal: alignedSignal,
    histogram
  };
}

/**
 * Calculate Bollinger Bands
 */
export function calculateBollingerBands(
  data: number[],
  period: number = 20,
  stdDev: number = 2
): { upper: number[]; middle: number[]; lower: number[]; bandwidth: number[] } {
  const middle = calculateSMA(data, period);
  const upper: number[] = [];
  const lower: number[] = [];
  const bandwidth: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
      bandwidth.push(NaN);
      continue;
    }
    
    // Calculate standard deviation
    let sumSquares = 0;
    for (let j = 0; j < period; j++) {
      sumSquares += Math.pow(data[i - j] - middle[i], 2);
    }
    const std = Math.sqrt(sumSquares / period);
    
    upper.push(middle[i] + stdDev * std);
    lower.push(middle[i] - stdDev * std);
    
    // Calculate bandwidth
    if (middle[i] !== 0) {
      bandwidth.push((upper[i] - lower[i]) / middle[i] * 100);
    } else {
      bandwidth.push(0);
    }
  }
  
  return { upper, middle, lower, bandwidth };
}

/**
 * Calculate Stochastic Oscillator
 */
export function calculateStochastic(
  high: number[],
  low: number[],
  close: number[],
  kPeriod: number = 14,
  dPeriod: number = 3,
  smooth: number = 3
): { k: number[]; d: number[] } {
  const rawK: number[] = [];
  
  for (let i = 0; i < close.length; i++) {
    if (i < kPeriod - 1) {
      rawK.push(NaN);
      continue;
    }
    
    let highestHigh = high[i];
    let lowestLow = low[i];
    
    for (let j = 0; j < kPeriod; j++) {
      highestHigh = Math.max(highestHigh, high[i - j]);
      lowestLow = Math.min(lowestLow, low[i - j]);
    }
    
    const range = highestHigh - lowestLow;
    if (range === 0) {
      rawK.push(50);
    } else {
      rawK.push(((close[i] - lowestLow) / range) * 100);
    }
  }
  
  // Smooth %K
  const smoothedK = calculateSMA(rawK.filter(v => !isNaN(v)), smooth);
  
  // Align smoothed K
  const k: number[] = [];
  let kIndex = 0;
  for (let i = 0; i < rawK.length; i++) {
    if (isNaN(rawK[i])) {
      k.push(NaN);
    } else {
      k.push(smoothedK[kIndex] ?? NaN);
      kIndex++;
    }
  }
  
  // Calculate %D (SMA of %K)
  const d = calculateSMA(k, dPeriod);
  
  return { k, d };
}

/**
 * Calculate Average True Range (ATR)
 */
export function calculateATR(
  high: number[],
  low: number[],
  close: number[],
  period: number = 14
): number[] {
  const trueRanges: number[] = [];
  
  for (let i = 0; i < high.length; i++) {
    if (i === 0) {
      trueRanges.push(high[i] - low[i]);
      continue;
    }
    
    const tr1 = high[i] - low[i];
    const tr2 = Math.abs(high[i] - close[i - 1]);
    const tr3 = Math.abs(low[i] - close[i - 1]);
    
    trueRanges.push(Math.max(tr1, tr2, tr3));
  }
  
  return calculateEMA(trueRanges, period);
}

/**
 * Calculate Volume Weighted Average Price (VWAP)
 */
export function calculateVWAP(
  high: number[],
  low: number[],
  close: number[],
  volume: number[]
): number[] {
  const result: number[] = [];
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  for (let i = 0; i < close.length; i++) {
    const typicalPrice = (high[i] + low[i] + close[i]) / 3;
    cumulativeTPV += typicalPrice * volume[i];
    cumulativeVolume += volume[i];
    
    if (cumulativeVolume === 0) {
      result.push(close[i]);
    } else {
      result.push(cumulativeTPV / cumulativeVolume);
    }
  }
  
  return result;
}

/**
 * Calculate all indicators for a given candle dataset
 */
export function calculateAllIndicators(candles: Candle[]): IndicatorValues {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  
  const lastIndex = candles.length - 1;
  
  // RSI
  const rsiValues = calculateRSI(closes, 14);
  const rsi = rsiValues[lastIndex] ?? 50;
  const rsiSignal = rsi > 70 ? 'overbought' : rsi < 30 ? 'oversold' : 'neutral';
  
  // MACD
  const macdValues = calculateMACD(closes, 12, 26, 9);
  const macdValue = macdValues.macd[lastIndex] ?? 0;
  const signalValue = macdValues.signal[lastIndex] ?? 0;
  const histogramValue = macdValues.histogram[lastIndex] ?? 0;
  const macdTrend = histogramValue > 0 ? 'bullish' : histogramValue < 0 ? 'bearish' : 'neutral';
  
  // EMAs
  const ema9Values = calculateEMA(closes, 9);
  const ema21Values = calculateEMA(closes, 21);
  const ema50Values = calculateEMA(closes, 50);
  const ema200Values = calculateEMA(closes, 200);
  
  // SMAs
  const sma20Values = calculateSMA(closes, 20);
  const sma50Values = calculateSMA(closes, 50);
  const sma200Values = calculateSMA(closes, 200);
  
  // Bollinger Bands
  const bbValues = calculateBollingerBands(closes, 20, 2);
  const bbUpper = bbValues.upper[lastIndex] ?? closes[lastIndex];
  const bbMiddle = bbValues.middle[lastIndex] ?? closes[lastIndex];
  const bbLower = bbValues.lower[lastIndex] ?? closes[lastIndex];
  const bbBandwidth = bbValues.bandwidth[lastIndex] ?? 0;
  
  const currentPrice = closes[lastIndex];
  const bbPosition = currentPrice > bbMiddle ? 'upper' : currentPrice < bbMiddle ? 'lower' : 'middle';
  
  // Stochastic
  const stochValues = calculateStochastic(highs, lows, closes, 14, 3, 3);
  const stochK = stochValues.k[lastIndex] ?? 50;
  const stochD = stochValues.d[lastIndex] ?? 50;
  const stochSignal = stochK > 80 ? 'overbought' : stochK < 20 ? 'oversold' : 'neutral';
  
  // ATR
  const atrValues = calculateATR(highs, lows, closes, 14);
  const atr = atrValues[lastIndex] ?? 0;
  const atrPercent = (atr / currentPrice) * 100;
  
  // VWAP
  const vwapValues = calculateVWAP(highs, lows, closes, volumes);
  const vwap = vwapValues[lastIndex] ?? closes[lastIndex];
  
  return {
    rsi,
    rsiSignal,
    macd: {
      macd: macdValue,
      signal: signalValue,
      histogram: histogramValue,
      trend: macdTrend
    },
    ema: {
      ema9: ema9Values[lastIndex] ?? currentPrice,
      ema21: ema21Values[lastIndex] ?? currentPrice,
      ema50: ema50Values[lastIndex] ?? currentPrice,
      ema200: ema200Values[lastIndex] ?? currentPrice
    },
    sma: {
      sma20: sma20Values[lastIndex] ?? currentPrice,
      sma50: sma50Values[lastIndex] ?? currentPrice,
      sma200: sma200Values[lastIndex] ?? currentPrice
    },
    bollingerBands: {
      upper: bbUpper,
      middle: bbMiddle,
      lower: bbLower,
      bandwidth: bbBandwidth,
      position: bbPosition
    },
    stochastic: {
      k: stochK,
      d: stochD,
      signal: stochSignal
    },
    atr,
    atrPercent,
    vwap
  };
}

/**
 * Get indicator values for charting (historical data)
 */
export function getIndicatorSeries(candles: Candle[]): {
  rsi: number[];
  macd: { macd: number[]; signal: number[]; histogram: number[] };
  ema9: number[];
  ema21: number[];
  ema50: number[];
  ema200: number[];
  sma20: number[];
  sma50: number[];
  sma200: number[];
  bbUpper: number[];
  bbMiddle: number[];
  bbLower: number[];
  stochK: number[];
  stochD: number[];
  atr: number[];
  vwap: number[];
} {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  
  const macdValues = calculateMACD(closes, 12, 26, 9);
  const bbValues = calculateBollingerBands(closes, 20, 2);
  const stochValues = calculateStochastic(highs, lows, closes, 14, 3, 3);
  
  return {
    rsi: calculateRSI(closes, 14),
    macd: macdValues,
    ema9: calculateEMA(closes, 9),
    ema21: calculateEMA(closes, 21),
    ema50: calculateEMA(closes, 50),
    ema200: calculateEMA(closes, 200),
    sma20: calculateSMA(closes, 20),
    sma50: calculateSMA(closes, 50),
    sma200: calculateSMA(closes, 200),
    bbUpper: bbValues.upper,
    bbMiddle: bbValues.middle,
    bbLower: bbValues.lower,
    stochK: stochValues.k,
    stochD: stochValues.d,
    atr: calculateATR(highs, lows, closes, 14),
    vwap: calculateVWAP(highs, lows, closes, volumes)
  };
}
