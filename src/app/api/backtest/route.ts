// STRICT Backtesting API
// Uses Trend Filter + 1:3 R:R + 75+ Confluence Threshold

import { NextRequest, NextResponse } from 'next/server';
import { Candle, Timeframe, TIMEFRAME_CONFIG } from '@/lib/trading/types';
import { runStrictBacktest } from '@/lib/trading/strict-strategy';

interface YahooFinanceResponse {
  chart: {
    result: Array<{
      meta: { symbol: string };
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: number[];
          high: number[];
          low: number[];
          close: number[];
          volume: number[];
        }>;
      };
    }>;
    error: null | { code: string; description: string };
  };
}

async function fetchYahooFinanceData(
  symbol: string,
  interval: string,
  range: string
): Promise<YahooFinanceResponse | null> {
  const baseUrl = 'https://query1.finance.yahoo.com/v8/finance/chart';
  const url = `${baseUrl}/${symbol}?interval=${interval}&range=${range}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      next: { revalidate: 300 },
    });
    
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch from Yahoo Finance:', error);
    return null;
  }
}

// Cache for backtest results
const backtestCache = new Map<string, { result: unknown; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol') || 'EURUSD=X';
  const timeframe = (searchParams.get('timeframe') || '1D') as Timeframe;
  const minConfluence = parseInt(searchParams.get('minConfluence') || '75');
  const forceRefresh = searchParams.get('refresh') === 'true';
  
  // Check cache
  const cacheKey = `${symbol}-${timeframe}-${minConfluence}`;
  const cached = backtestCache.get(cacheKey);
  
  if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.result);
  }
  
  // Get data
  const config = TIMEFRAME_CONFIG[timeframe];
  const backtestRange = timeframe === '1H' ? '1mo' : timeframe === '4H' ? '3mo' : '6mo';
  
  try {
    const data = await fetchYahooFinanceData(symbol, config.interval, backtestRange);
    
    if (!data || !data.chart?.result?.[0]) {
      return NextResponse.json(
        { error: 'Failed to fetch historical data for backtesting' },
        { status: 500 }
      );
    }
    
    const result = data.chart.result[0];
    const quote = result.indicators.quote[0];
    
    // Build candles
    const candles: Candle[] = [];
    const timestamps = result.timestamp || [];
    
    for (let i = 0; i < timestamps.length; i++) {
      if (
        quote.open[i] !== null &&
        quote.high[i] !== null &&
        quote.low[i] !== null &&
        quote.close[i] !== null &&
        quote.volume[i] !== null
      ) {
        candles.push({
          timestamp: timestamps[i],
          open: quote.open[i],
          high: quote.high[i],
          low: quote.low[i],
          close: quote.close[i],
          volume: quote.volume[i],
        });
      }
    }
    
    if (candles.length < 150) {
      return NextResponse.json(
        { error: 'Insufficient historical data (need at least 150 candles for strict strategy)' },
        { status: 400 }
      );
    }
    
    // Run STRICT backtest
    const backtestResult = runStrictBacktest(candles, symbol, timeframe, minConfluence);
    
    // Cache result
    backtestCache.set(cacheKey, {
      result: backtestResult,
      timestamp: Date.now()
    });
    
    // Calculate additional metrics
    const winRate = backtestResult.stats.winRate;
    const avgWin = backtestResult.stats.avgWin;
    const avgLoss = backtestResult.stats.avgLoss;
    const expectancy = backtestResult.stats.expectancy;
    
    // Profitability analysis
    const breakEvenWinRate = 100 / (1 + (avgWin / avgLoss || 3)); // With 1:3 R:R, need ~25% win rate
    
    // Calculate max drawdown
    let maxDrawdown = 0;
    let runningPnl = 0;
    let peakPnl = 0;
    
    for (const trade of backtestResult.trades) {
      runningPnl += trade.pnl;
      if (runningPnl > peakPnl) {
        peakPnl = runningPnl;
      }
      const drawdown = peakPnl - runningPnl;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    // Calculate Sharpe Ratio (simplified)
    const returns = backtestResult.trades.map(t => t.pnl);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdDev = returns.length > 1 ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1)) : 0;
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized
    
    // Pattern stats from trades
    const patternMap = new Map<string, { trades: number; wins: number; totalPips: number; expectancy: number }>();
    
    // Group by confluence level
    for (const trade of backtestResult.trades) {
      const level = trade.confluence >= 85 ? 'High Confluence (85+)' : 
                    trade.confluence >= 75 ? 'Good Confluence (75-84)' : 
                    'Moderate Confluence (70-74)';
      
      const current = patternMap.get(level) || { trades: 0, wins: 0, totalPips: 0, expectancy: 0 };
      current.trades++;
      if (trade.outcome === 'win') current.wins++;
      current.totalPips += trade.pnl;
      patternMap.set(level, current);
    }
    
    const patternStats = Array.from(patternMap.entries()).map(([pattern, stats]) => ({
      pattern,
      trades: stats.trades,
      winRate: ((stats.wins / stats.trades) * 100).toFixed(1) + '%',
      expectancy: (stats.totalPips / stats.trades).toFixed(1) + ' pips',
      totalPips: stats.totalPips.toFixed(1),
      recommended: (stats.wins / stats.trades) >= 0.55 && stats.totalPips > 0
    }));
    
    const recommendedPatterns = patternStats.filter(p => p.recommended).map(p => p.pattern);
    
    // Return summary
    const summary = {
      symbol,
      timeframe,
      period: {
        start: new Date(candles[0].timestamp * 1000).toISOString(),
        end: new Date(candles[candles.length - 1].timestamp * 1000).toISOString(),
        candlesAnalyzed: candles.length
      },
      
      // Strategy info
      strategy: {
        name: 'STRICT v2',
        rules: [
          'Trend Filter: Only trade WITH EMA 200 direction',
          'Risk/Reward: Minimum 1:3 (30 pips target for 10 pips risk)',
          'Confluence: Minimum ' + minConfluence + '/100 required',
          'Volume: Must be above 80% of 20-period average'
        ],
        minConfluenceRequired: minConfluence,
        riskRewardRatio: '1:3'
      },
      
      // Results - matching BacktestResult interface
      summary: {
        totalTrades: backtestResult.stats.totalTrades,
        winningTrades: backtestResult.stats.winningTrades,
        losingTrades: backtestResult.stats.losingTrades,
        winRate: winRate.toFixed(2) + '%',
        totalPips: backtestResult.stats.totalPips.toFixed(1),
        avgWin: avgWin.toFixed(1) + ' pips',
        avgLoss: avgLoss.toFixed(1) + ' pips',
        profitFactor: backtestResult.stats.profitFactor.toFixed(2),
        expectancy: expectancy.toFixed(1) + ' pips/trade',
        maxDrawdown: maxDrawdown.toFixed(1) + ' pips',
        sharpeRatio: sharpeRatio.toFixed(2),
      },
      
      // Pattern stats
      patternStats,
      recommendedPatterns,
      
      // Profitability analysis
      profitability: {
        isProfitable: expectancy > 0,
        breakEvenWinRate: breakEvenWinRate.toFixed(1) + '%',
        currentWinRateVsBreakEven: winRate > breakEvenWinRate ? 
          `+${(winRate - breakEvenWinRate).toFixed(1)}% above break-even` :
          `${(winRate - breakEvenWinRate).toFixed(1)}% below break-even`,
        edge: expectancy > 0 ? 'POSITIVE EDGE' : 'NEGATIVE EDGE - DO NOT TRADE'
      },
      
      // Trade distribution
      tradeAnalysis: {
        longTrades: backtestResult.trades.filter(t => t.direction === 'long').length,
        shortTrades: backtestResult.trades.filter(t => t.direction === 'short').length,
        avgConfluence: backtestResult.trades.length > 0 ?
          (backtestResult.trades.reduce((s, t) => s + t.confluence, 0) / backtestResult.trades.length).toFixed(0) : 0
      },
      
      // Recent trades
      recentTrades: backtestResult.trades.slice(-20).map(t => ({
        date: new Date(t.date * 1000).toLocaleDateString('fr-FR'),
        direction: t.direction.toUpperCase(),
        trend: t.trendFilter === 'above' ? '↑ Bull' : '↓ Bear',
        confluence: t.confluence,
        outcome: t.outcome === 'win' ? '✓ WIN' : '✗ LOSS',
        pnl: (t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(1) + ' pips'
      }))
    };
    
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Backtest API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
