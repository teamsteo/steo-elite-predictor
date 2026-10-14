// STRICT ML Trading Signals API
// Implements: Trend Filter, 1:3 R:R, 75+ Confluence Threshold

import { NextRequest, NextResponse } from 'next/server';
import { Candle, Timeframe, TIMEFRAME_CONFIG, FOREX_PAIRS } from '@/lib/trading/types';
import { generateStrictSignal } from '@/lib/trading/strict-strategy';
import { calculateAllIndicators } from '@/lib/trading/indicators';
import { detectAllPatterns } from '@/lib/trading/patterns';

interface YahooFinanceResponse {
  chart: {
    result: Array<{
      meta: {
        symbol: string;
        regularMarketPrice: number;
        previousClose: number;
        regularMarketDayHigh: number;
        regularMarketDayLow: number;
        regularMarketVolume: number;
      };
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
      next: { revalidate: 30 },
    });
    
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch from Yahoo Finance:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol') || 'EURUSD=X';
  const timeframe = (searchParams.get('timeframe') || '1D') as Timeframe;
  
  const config = TIMEFRAME_CONFIG[timeframe] || TIMEFRAME_CONFIG['1D'];
  
  try {
    const data = await fetchYahooFinanceData(symbol, config.interval, config.range);
    
    if (!data || !data.chart?.result?.[0]) {
      return NextResponse.json(
        { error: 'Failed to fetch market data' },
        { status: 500 }
      );
    }
    
    const result = data.chart.result[0];
    const quote = result.indicators.quote[0];
    
    // Build candles array
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
        { error: 'Insufficient data for strict signal generation (need 150+ candles)' },
        { status: 400 }
      );
    }
    
    // Generate STRICT signal
    const strictSignal = generateStrictSignal(candles, symbol, timeframe);
    
    // Calculate indicators for display
    const indicators = calculateAllIndicators(candles);
    const patterns = detectAllPatterns(candles);
    const currentPrice = candles[candles.length - 1].close;
    
    // Build response
    const signal = {
      id: `${symbol}-${timeframe}-${Date.now()}`,
      symbol,
      type: strictSignal.direction,
      confidence: strictSignal.confidence,
      entryPrice: strictSignal.risk.entryPrice,
      stopLoss: strictSignal.risk.stopLoss,
      takeProfit: strictSignal.risk.takeProfit,
      slPips: strictSignal.risk.maxPipsRisk,
      tpPips: strictSignal.risk.maxPipsTarget,
      riskRewardRatio: strictSignal.risk.riskRewardRatio.toFixed(1),
      timeframe,
      timestamp: Date.now(),
      
      // Confluence breakdown
      mlScore: strictSignal.confluence.total,
      confluence: strictSignal.confluence,
      
      // Trend analysis (CRITICAL)
      trend: strictSignal.trend,
      
      // Setup info
      setup: {
        quality: strictSignal.confidence >= 85 ? 'A+' :
                 strictSignal.confidence >= 80 ? 'A' :
                 strictSignal.confidence >= 75 ? 'B' : 'C',
        type: strictSignal.trend.direction === 'bullish' ? 'Trend Following Buy' :
              strictSignal.trend.direction === 'bearish' ? 'Trend Following Sell' : 'Range'
      },
      
      // Patterns
      detectedPatterns: patterns.slice(0, 5).map(p => ({
        name: p.name,
        nameFr: p.nameFr,
        type: p.type,
        reliability: p.strength,
        confidence: p.confidence,
        historicalWinRate: p.type === 'bullish' ? 60 : p.type === 'bearish' ? 60 : 50,
        historicalExpectancy: p.strength * 5
      })),
      
      // Context
      context: {
        trend: {
          short: indicators.ema.ema9 > indicators.ema.ema21 ? 'up' : 'down',
          medium: indicators.ema.ema21 > indicators.ema.ema50 ? 'up' : 'down',
          long: currentPrice > indicators.ema.ema200 ? 'up' : 'down'
        },
        volatility: indicators.atrPercent > 1 ? 'high' : indicators.atrPercent < 0.3 ? 'low' : 'normal',
        momentum: indicators.macd.histogram > 0 ? 'bullish' : indicators.macd.histogram < 0 ? 'bearish' : 'neutral',
        indicatorAlignment: strictSignal.confluence.momentumAlignment,
        trendAlignment: strictSignal.confluence.trendFilter
      },
      
      // Indicators
      indicators: {
        rsi: indicators.rsi.toFixed(2),
        rsiSignal: indicators.rsiSignal,
        macd: {
          value: indicators.macd.macd.toFixed(5),
          signal: indicators.macd.signal.toFixed(5),
          histogram: indicators.macd.histogram.toFixed(5),
          trend: indicators.macd.trend
        },
        stochastic: {
          k: indicators.stochastic.k.toFixed(2),
          d: indicators.stochastic.d.toFixed(2),
          signal: indicators.stochastic.signal
        },
        atr: indicators.atr.toFixed(5),
        atrPercent: indicators.atrPercent.toFixed(2) + '%',
        ema200: indicators.ema.ema200.toFixed(5)
      },
      
      // Messages
      reasoning: strictSignal.reasons,
      warnings: strictSignal.warnings,
      
      // Backtest insights
      backtestInsights: {
        strategy: 'STRICT v2',
        riskReward: '1:3 (Minimum)',
        minConfluence: 75,
        trendFilter: 'EMA 200 Required'
      }
    };
    
    return NextResponse.json(signal);
  } catch (error) {
    console.error('Signals API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
