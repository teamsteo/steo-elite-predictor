// Trading Types for ForexML Pro - Forex Focused

export type SignalType = 'BUY' | 'SELL' | 'HOLD' | 'WAIT';

export type Timeframe = '1H' | '4H' | '1D' | '1W';

export type ForexSession = 'sydney' | 'tokyo' | 'london' | 'newyork' | 'closed';

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ForexPair {
  symbol: string;
  name: string;
  base: string;
  quote: string;
  type: 'major' | 'minor' | 'exotic';
  pipValue: number;
}

export interface IndicatorValues {
  rsi: number;
  rsiSignal: 'overbought' | 'oversold' | 'neutral';
  macd: {
    macd: number;
    signal: number;
    histogram: number;
    trend: 'bullish' | 'bearish' | 'neutral';
  };
  ema: {
    ema9: number;
    ema21: number;
    ema50: number;
    ema200: number;
  };
  sma: {
    sma20: number;
    sma50: number;
    sma200: number;
  };
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
    bandwidth: number;
    position: 'upper' | 'middle' | 'lower';
  };
  stochastic: {
    k: number;
    d: number;
    signal: 'overbought' | 'oversold' | 'neutral';
  };
  atr: number;
  atrPercent: number;
  vwap: number;
}

export interface Signal {
  id: string;
  symbol: string;
  type: SignalType;
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  timeframe: Timeframe;
  timestamp: number;
  indicators: IndicatorValues;
  reasoning: string[];
  // ML Enhanced
  mlScore?: number;
  expectancy?: number;
  detectedPatterns?: {
    name: string;
    type: 'bullish' | 'bearish' | 'neutral';
    reliability: number;
    historicalWinRate: number;
  }[];
}

export interface SignalHistory {
  signals: Signal[];
  winRate: number;
  totalSignals: number;
  winningSignals: number;
  losingSignals: number;
}

export interface MarketData {
  symbol: string;
  candles: Candle[];
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  spread?: number;
}

export interface TradingState {
  selectedPair: ForexPair | null;
  selectedTimeframe: Timeframe;
  marketData: MarketData | null;
  signal: Signal | null;
  signalHistory: Signal[];
  isLoading: boolean;
  error: string | null;
  lastUpdate: number | null;
  autoRefreshInterval: number;
  currentSession: ForexSession;
}

// FOREX PAIRS - Major and Minor only
export const FOREX_PAIRS: ForexPair[] = [
  // Major Pairs (most liquid)
  { symbol: 'EURUSD=X', name: 'EUR/USD', base: 'EUR', quote: 'USD', type: 'major', pipValue: 0.0001 },
  { symbol: 'GBPUSD=X', name: 'GBP/USD', base: 'GBP', quote: 'USD', type: 'major', pipValue: 0.0001 },
  { symbol: 'USDJPY=X', name: 'USD/JPY', base: 'USD', quote: 'JPY', type: 'major', pipValue: 0.01 },
  { symbol: 'USDCHF=X', name: 'USD/CHF', base: 'USD', quote: 'CHF', type: 'major', pipValue: 0.0001 },
  { symbol: 'AUDUSD=X', name: 'AUD/USD', base: 'AUD', quote: 'USD', type: 'major', pipValue: 0.0001 },
  { symbol: 'USDCAD=X', name: 'USD/CAD', base: 'USD', quote: 'CAD', type: 'major', pipValue: 0.0001 },
  { symbol: 'NZDUSD=X', name: 'NZD/USD', base: 'NZD', quote: 'USD', type: 'major', pipValue: 0.0001 },
  
  // Minor/Cross Pairs
  { symbol: 'EURGBP=X', name: 'EUR/GBP', base: 'EUR', quote: 'GBP', type: 'minor', pipValue: 0.0001 },
  { symbol: 'EURJPY=X', name: 'EUR/JPY', base: 'EUR', quote: 'JPY', type: 'minor', pipValue: 0.01 },
  { symbol: 'GBPJPY=X', name: 'GBP/JPY', base: 'GBP', quote: 'JPY', type: 'minor', pipValue: 0.01 },
  { symbol: 'EURCHF=X', name: 'EUR/CHF', base: 'EUR', quote: 'CHF', type: 'minor', pipValue: 0.0001 },
  { symbol: 'AUDJPY=X', name: 'AUD/JPY', base: 'AUD', quote: 'JPY', type: 'minor', pipValue: 0.01 },
  { symbol: 'GBPCHF=X', name: 'GBP/CHF', base: 'GBP', quote: 'CHF', type: 'minor', pipValue: 0.0001 },
  { symbol: 'EURAUD=X', name: 'EUR/AUD', base: 'EUR', quote: 'AUD', type: 'minor', pipValue: 0.0001 },
  { symbol: 'EURNZD=X', name: 'EUR/NZD', base: 'EUR', quote: 'NZD', type: 'minor', pipValue: 0.0001 },
  { symbol: 'GBPAUD=X', name: 'GBP/AUD', base: 'GBP', quote: 'AUD', type: 'minor', pipValue: 0.0001 },
  { symbol: 'GBPCAD=X', name: 'GBP/CAD', base: 'GBP', quote: 'CAD', type: 'minor', pipValue: 0.0001 },
];

export const TIMEFRAME_CONFIG: Record<Timeframe, { interval: string; range: string; label: string }> = {
  '1H': { interval: '1h', range: '1d', label: '1 Hour' },
  '4H': { interval: '1h', range: '5d', label: '4 Hours' },
  '1D': { interval: '1d', range: '1mo', label: '1 Day' },
  '1W': { interval: '1wk', range: '3mo', label: '1 Week' },
};

// Forex Trading Sessions (UTC times)
export const FOREX_SESSIONS = {
  sydney: { start: 21, end: 6, name: 'Sydney' },
  tokyo: { start: 0, end: 9, name: 'Tokyo' },
  london: { start: 8, end: 17, name: 'London' },
  newyork: { start: 13, end: 22, name: 'New York' },
};

/**
 * Get current active forex session(s)
 */
export function getCurrentSessions(): ForexSession[] {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const activeSessions: ForexSession[] = [];
  
  for (const [session, times] of Object.entries(FOREX_SESSIONS)) {
    if (times.start > times.end) {
      // Session crosses midnight
      if (utcHour >= times.start || utcHour < times.end) {
        activeSessions.push(session as ForexSession);
      }
    } else {
      if (utcHour >= times.start && utcHour < times.end) {
        activeSessions.push(session as ForexSession);
      }
    }
  }
  
  return activeSessions.length > 0 ? activeSessions : ['closed'];
}

/**
 * Get pip value for a symbol
 */
export function getPipValue(symbol: string): number {
  const pair = FOREX_PAIRS.find(p => p.symbol === symbol);
  return pair?.pipValue || (symbol.includes('JPY') ? 0.01 : 0.0001);
}

/**
 * Calculate pips from price difference
 */
export function priceToPips(symbol: string, priceDiff: number): number {
  return priceDiff / getPipValue(symbol);
}

/**
 * Format price for display
 */
export function formatForexPrice(symbol: string, price: number): string {
  const isJPY = symbol.includes('JPY');
  return price.toFixed(isJPY ? 3 : 5);
}
