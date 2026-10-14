// Trading State Store using Zustand - Forex Focused
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Define types locally to avoid import issues
export type Timeframe = '1H' | '4H' | '1D' | '1W';

export interface ForexPair {
  symbol: string;
  name: string;
  base: string;
  quote: string;
  type: 'major' | 'minor' | 'exotic';
  pipValue: number;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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

export interface Signal {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL' | 'HOLD' | 'WAIT';
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  timeframe: Timeframe;
  timestamp: number;
  reasoning: string[];
  mlScore?: number;
  expectancy?: number;
  detectedPatterns?: {
    name: string;
    type: 'bullish' | 'bearish' | 'neutral';
    reliability: number;
    historicalWinRate: number;
  }[];
}

// Default Forex Pairs
export const FOREX_PAIRS: ForexPair[] = [
  { symbol: 'EURUSD=X', name: 'EUR/USD', base: 'EUR', quote: 'USD', type: 'major', pipValue: 0.0001 },
  { symbol: 'GBPUSD=X', name: 'GBP/USD', base: 'GBP', quote: 'USD', type: 'major', pipValue: 0.0001 },
  { symbol: 'USDJPY=X', name: 'USD/JPY', base: 'USD', quote: 'JPY', type: 'major', pipValue: 0.01 },
  { symbol: 'USDCHF=X', name: 'USD/CHF', base: 'USD', quote: 'CHF', type: 'major', pipValue: 0.0001 },
  { symbol: 'AUDUSD=X', name: 'AUD/USD', base: 'AUD', quote: 'USD', type: 'major', pipValue: 0.0001 },
  { symbol: 'USDCAD=X', name: 'USD/CAD', base: 'USD', quote: 'CAD', type: 'major', pipValue: 0.0001 },
  { symbol: 'NZDUSD=X', name: 'NZD/USD', base: 'NZD', quote: 'USD', type: 'major', pipValue: 0.0001 },
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

// Forex Trading Sessions (UTC times)
export const FOREX_SESSIONS = {
  sydney: { start: 21, end: 6, name: 'Sydney' },
  tokyo: { start: 0, end: 9, name: 'Tokyo' },
  london: { start: 8, end: 17, name: 'London' },
  newyork: { start: 13, end: 22, name: 'New York' },
};

// Get current active forex session(s)
export function getCurrentSessions(): string[] {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const activeSessions: string[] = [];
  
  for (const [session, times] of Object.entries(FOREX_SESSIONS)) {
    if (times.start > times.end) {
      if (utcHour >= times.start || utcHour < times.end) {
        activeSessions.push(session);
      }
    } else {
      if (utcHour >= times.start && utcHour < times.end) {
        activeSessions.push(session);
      }
    }
  }
  
  return activeSessions.length > 0 ? activeSessions : ['closed'];
}

interface TradingStore {
  // State
  selectedPair: ForexPair | null;
  selectedTimeframe: Timeframe;
  marketData: MarketData | null;
  signal: Signal | null;
  signalHistory: Signal[];
  isLoading: boolean;
  error: string | null;
  lastUpdate: number | null;
  autoRefreshInterval: number;
  
  // Actions
  setSelectedPair: (pair: ForexPair | null) => void;
  setSelectedTimeframe: (timeframe: Timeframe) => void;
  setMarketData: (data: MarketData | null) => void;
  setSignal: (signal: Signal | null) => void;
  addSignalToHistory: (signal: Signal) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setLastUpdate: (timestamp: number | null) => void;
  setAutoRefreshInterval: (interval: number) => void;
  clearSignalHistory: () => void;
}

export const useTradingStore = create<TradingStore>()(
  persist(
    (set, get) => ({
      // Initial State
      selectedPair: FOREX_PAIRS[0],
      selectedTimeframe: '1D',
      marketData: null,
      signal: null,
      signalHistory: [],
      isLoading: false,
      error: null,
      lastUpdate: null,
      autoRefreshInterval: 30000,
      
      // Actions
      setSelectedPair: (pair) => set({ selectedPair: pair }),
      setSelectedTimeframe: (timeframe) => set({ selectedTimeframe: timeframe }),
      setMarketData: (data) => set({ marketData: data }),
      setSignal: (signal) => {
        const currentSignal = get().signal;
        if (currentSignal && signal && currentSignal.type !== signal.type) {
          get().addSignalToHistory(currentSignal);
        }
        set({ signal });
      },
      addSignalToHistory: (signal) => {
        const history = get().signalHistory;
        const newHistory = [signal, ...history].slice(0, 50);
        set({ signalHistory: newHistory });
      },
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),
      setLastUpdate: (timestamp) => set({ lastUpdate: timestamp }),
      setAutoRefreshInterval: (interval) => set({ autoRefreshInterval: interval }),
      clearSignalHistory: () => set({ signalHistory: [] }),
    }),
    {
      name: 'forex-ml-storage',
      partialize: (state) => ({
        selectedPair: state.selectedPair,
        selectedTimeframe: state.selectedTimeframe,
        signalHistory: state.signalHistory,
        autoRefreshInterval: state.autoRefreshInterval,
      }),
    }
  )
);

// Selector hooks
export const useSelectedPair = () => useTradingStore((state) => state.selectedPair);
export const useSelectedTimeframe = () => useTradingStore((state) => state.selectedTimeframe);
export const useMarketData = () => useTradingStore((state) => state.marketData);
export const useSignal = () => useTradingStore((state) => state.signal);
export const useSignalHistory = () => useTradingStore((state) => state.signalHistory);
export const useIsLoading = () => useTradingStore((state) => state.isLoading);
export const useError = () => useTradingStore((state) => state.error);
export const useLastUpdate = () => useTradingStore((state) => state.lastUpdate);
