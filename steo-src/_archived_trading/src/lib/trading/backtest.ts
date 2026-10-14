// Backtesting Engine for Pattern Analysis
import { Candle, Timeframe, TIMEFRAME_CONFIG } from './types';
import { detectAllPatterns, DetectedPattern } from './patterns';

export interface BacktestTrade {
  id: string;
  entryDate: number;
  exitDate: number;
  pattern: string;
  patternType: 'bullish' | 'bearish' | 'neutral';
  direction: 'long' | 'short';
  entry: number;
  exit: number;
  stopLoss: number;
  takeProfit: number;
  pnl: number; // in pips
  pnlPercent: number;
  outcome: 'win' | 'loss' | 'breakeven';
  holdTime: number; // number of candles
  riskRewardRatio: number;
}

export interface PatternBacktestStats {
  patternName: string;
  totalOccurrences: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRate: number;
  avgWin: number; // pips
  avgLoss: number; // pips
  totalPips: number;
  profitFactor: number;
  expectancy: number; // expected pips per trade
  avgHoldTime: number;
  bestTrade: number; // pips
  worstTrade: number; // pips
  recommended: boolean; // if win rate > 55% and expectancy > 0
}

export interface BacktestResult {
  symbol: string;
  timeframe: Timeframe;
  startDate: number;
  endDate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPips: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  sharpeRatio: number;
  patternStats: PatternBacktestStats[];
  trades: BacktestTrade[];
}

// Pip value calculator for forex
function getPipValue(symbol: string, price: number): number {
  // JPY pairs have 2 decimal places, others have 4
  if (symbol.includes('JPY')) {
    return 0.01; // 1 pip = 0.01 for JPY pairs
  }
  return 0.0001; // 1 pip = 0.0001 for other pairs
}

function pipsToPrice(symbol: string, pips: number): number {
  return pips * getPipValue(symbol, 0);
}

function priceToPips(symbol: string, priceDiff: number): number {
  return priceDiff / getPipValue(symbol, 0);
}

/**
 * Run backtest on historical data
 */
export function runBacktest(
  candles: Candle[],
  symbol: string,
  timeframe: Timeframe,
  stopLossPips: number = 30,
  takeProfitPips: number = 60,
  maxHoldTime: number = 20
): BacktestResult {
  const trades: BacktestTrade[] = [];
  const patternTradeMap: Map<string, BacktestTrade[]> = new Map();
  
  // Minimum candles needed
  if (candles.length < 50) {
    return createEmptyBacktestResult(symbol, timeframe, candles);
  }
  
  let consecutiveWins = 0;
  let consecutiveLosses = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let runningPnl = 0;
  let peakPnl = 0;
  let maxDrawdown = 0;
  const pnlHistory: number[] = [];
  
  // Iterate through candles, detecting patterns
  for (let i = 30; i < candles.length - maxHoldTime; i++) {
    const currentCandles = candles.slice(0, i + 1);
    const patterns = detectAllPatterns(currentCandles);
    
    // Only trade on strong patterns (strength >= 3)
    const strongPatterns = patterns.filter(p => p.strength >= 3 && p.type !== 'neutral');
    
    for (const pattern of strongPatterns) {
      const currentCandle = candles[i];
      const entryPrice = currentCandle.close;
      
      // Determine trade direction
      const direction: 'long' | 'short' = pattern.type === 'bullish' ? 'long' : 'short';
      
      // Calculate SL and TP
      let stopLoss: number;
      let takeProfit: number;
      
      if (direction === 'long') {
        stopLoss = entryPrice - pipsToPrice(symbol, stopLossPips);
        takeProfit = entryPrice + pipsToPrice(symbol, takeProfitPips);
      } else {
        stopLoss = entryPrice + pipsToPrice(symbol, stopLossPips);
        takeProfit = entryPrice - pipsToPrice(symbol, takeProfitPips);
      }
      
      // Simulate trade outcome
      const maxLookAhead = Math.min(maxHoldTime, candles.length - i - 1);
      let outcome: 'win' | 'loss' | 'breakeven' = 'breakeven';
      let exitPrice = entryPrice;
      let exitIndex = i + maxLookAhead;
      
      for (let j = 1; j <= maxLookAhead; j++) {
        const futureCandle = candles[i + j];
        
        if (direction === 'long') {
          // Check if stop loss hit
          if (futureCandle.low <= stopLoss) {
            outcome = 'loss';
            exitPrice = stopLoss;
            exitIndex = i + j;
            break;
          }
          // Check if take profit hit
          if (futureCandle.high >= takeProfit) {
            outcome = 'win';
            exitPrice = takeProfit;
            exitIndex = i + j;
            break;
          }
        } else {
          // Short position
          if (futureCandle.high >= stopLoss) {
            outcome = 'loss';
            exitPrice = stopLoss;
            exitIndex = i + j;
            break;
          }
          if (futureCandle.low <= takeProfit) {
            outcome = 'win';
            exitPrice = takeProfit;
            exitIndex = i + j;
            break;
          }
        }
      }
      
      // Calculate P&L in pips
      const pnlPips = direction === 'long'
        ? priceToPips(symbol, exitPrice - entryPrice)
        : priceToPips(symbol, entryPrice - exitPrice);
      
      const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100 * (direction === 'long' ? 1 : -1);
      
      const trade: BacktestTrade = {
        id: `${symbol}-${timeframe}-${i}`,
        entryDate: candles[i].timestamp,
        exitDate: candles[exitIndex].timestamp,
        pattern: pattern.name,
        patternType: pattern.type,
        direction,
        entry: entryPrice,
        exit: exitPrice,
        stopLoss,
        takeProfit,
        pnl: pnlPips,
        pnlPercent,
        outcome,
        holdTime: exitIndex - i,
        riskRewardRatio: takeProfitPips / stopLossPips
      };
      
      trades.push(trade);
      
      // Track pattern-specific trades
      if (!patternTradeMap.has(pattern.name)) {
        patternTradeMap.set(pattern.name, []);
      }
      patternTradeMap.get(pattern.name)!.push(trade);
      
      // Update consecutive wins/losses
      if (outcome === 'win') {
        consecutiveWins++;
        consecutiveLosses = 0;
        maxConsecutiveWins = Math.max(maxConsecutiveWins, consecutiveWins);
      } else if (outcome === 'loss') {
        consecutiveLosses++;
        consecutiveWins = 0;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
      }
      
      // Track drawdown
      runningPnl += pnlPips;
      peakPnl = Math.max(peakPnl, runningPnl);
      const drawdown = peakPnl - runningPnl;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
      pnlHistory.push(runningPnl);
      
      // Only take one trade per candle to avoid over-trading
      break;
    }
  }
  
  // Calculate pattern-specific stats
  const patternStats = calculatePatternStats(patternTradeMap);
  
  // Calculate overall stats
  const winningTrades = trades.filter(t => t.outcome === 'win');
  const losingTrades = trades.filter(t => t.outcome === 'loss');
  const totalPips = trades.reduce((sum, t) => sum + t.pnl, 0);
  const avgWin = winningTrades.length > 0 
    ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length 
    : 0;
  const avgLoss = losingTrades.length > 0
    ? Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length)
    : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * winningTrades.length) / (avgLoss * losingTrades.length) : 0;
  
  // Calculate Sharpe Ratio (simplified)
  const sharpeRatio = calculateSharpeRatio(trades.map(t => t.pnl));
  
  return {
    symbol,
    timeframe,
    startDate: candles[0]?.timestamp || 0,
    endDate: candles[candles.length - 1]?.timestamp || 0,
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
    totalPips,
    avgWin,
    avgLoss,
    profitFactor,
    maxDrawdown,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    sharpeRatio,
    patternStats,
    trades
  };
}

function calculatePatternStats(patternTradeMap: Map<string, BacktestTrade[]>): PatternBacktestStats[] {
  const stats: PatternBacktestStats[] = [];
  
  patternTradeMap.forEach((trades, patternName) => {
    const winningTrades = trades.filter(t => t.outcome === 'win');
    const losingTrades = trades.filter(t => t.outcome === 'loss');
    const totalPips = trades.reduce((sum, t) => sum + t.pnl, 0);
    const avgWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length
      : 0;
    const avgLoss = losingTrades.length > 0
      ? Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length)
      : 0;
    
    const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
    const expectancy = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);
    
    stats.push({
      patternName,
      totalOccurrences: trades.length,
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      breakevenTrades: trades.filter(t => t.outcome === 'breakeven').length,
      winRate,
      avgWin,
      avgLoss,
      totalPips,
      profitFactor: avgLoss > 0 ? (avgWin * winningTrades.length) / (avgLoss * losingTrades.length) : 0,
      expectancy,
      avgHoldTime: trades.reduce((sum, t) => sum + t.holdTime, 0) / trades.length,
      bestTrade: Math.max(...trades.map(t => t.pnl)),
      worstTrade: Math.min(...trades.map(t => t.pnl)),
      recommended: winRate > 55 && expectancy > 0
    });
  });
  
  // Sort by expectancy (best first)
  return stats.sort((a, b) => b.expectancy - a.expectancy);
}

function calculateSharpeRatio(returns: number[]): number {
  if (returns.length < 2) return 0;
  
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return 0;
  
  // Annualized Sharpe (assuming daily returns)
  return (mean / stdDev) * Math.sqrt(252);
}

function createEmptyBacktestResult(symbol: string, timeframe: Timeframe, candles: Candle[]): BacktestResult {
  return {
    symbol,
    timeframe,
    startDate: candles[0]?.timestamp || 0,
    endDate: candles[candles.length - 1]?.timestamp || 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    totalPips: 0,
    avgWin: 0,
    avgLoss: 0,
    profitFactor: 0,
    maxDrawdown: 0,
    maxConsecutiveWins: 0,
    maxConsecutiveLosses: 0,
    sharpeRatio: 0,
    patternStats: [],
    trades: []
  };
}

/**
 * Get recommended patterns based on backtest results
 */
export function getRecommendedPatterns(backtestResult: BacktestResult): PatternBacktestStats[] {
  return backtestResult.patternStats
    .filter(p => p.recommended)
    .sort((a, b) => b.expectancy - a.expectancy);
}

/**
 * Calculate position size based on risk management
 */
export function calculatePositionSize(
  accountBalance: number,
  riskPercent: number,
  stopLossPips: number,
  pipValue: number = 10 // Default $10 per pip for standard lot
): {
  lots: number;
  riskAmount: number;
} {
  const riskAmount = accountBalance * (riskPercent / 100);
  const lots = riskAmount / (stopLossPips * pipValue);
  
  return {
    lots: Math.round(lots * 100) / 100, // Round to 2 decimal places
    riskAmount
  };
}

/**
 * Format pips for display
 */
export function formatPips(pips: number): string {
  const sign = pips >= 0 ? '+' : '';
  return `${sign}${pips.toFixed(1)} pips`;
}
