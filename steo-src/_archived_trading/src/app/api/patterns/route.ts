// Pattern Detection API
import { NextRequest, NextResponse } from 'next/server';
import { Candle, TIMEFRAME_CONFIG } from '@/lib/trading/types';
import { detectAllPatterns } from '@/lib/trading/patterns';

interface YahooFinanceResponse {
  chart: {
    result: Array<{
      meta: {
        symbol: string;
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
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch from Yahoo Finance:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol') || 'EURUSD=X';
  const timeframe = searchParams.get('timeframe') || '1D';
  
  const config = TIMEFRAME_CONFIG[timeframe as keyof typeof TIMEFRAME_CONFIG] || TIMEFRAME_CONFIG['1D'];
  
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
    
    if (candles.length < 30) {
      return NextResponse.json(
        { error: 'Insufficient data for pattern detection' },
        { status: 400 }
      );
    }
    
    // Detect patterns
    const patterns = detectAllPatterns(candles);
    
    // Format response
    const response = {
      symbol,
      timeframe,
      timestamp: Date.now(),
      totalPatterns: patterns.length,
      bullishPatterns: patterns.filter(p => p.type === 'bullish').length,
      bearishPatterns: patterns.filter(p => p.type === 'bearish').length,
      neutralPatterns: patterns.filter(p => p.type === 'neutral').length,
      patterns: patterns.map(p => ({
        name: p.name,
        nameFr: p.nameFr,
        type: p.type,
        strength: p.strength,
        description: p.description,
        expectedDirection: p.expectedDirection,
        suggestedAction: p.suggestedAction,
        confidence: p.confidence
      })),
      mostSignificant: patterns.length > 0 ? {
        name: patterns[0].name,
        nameFr: patterns[0].nameFr,
        type: patterns[0].type,
        strength: patterns[0].strength,
        confidence: patterns[0].confidence
      } : null
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Patterns API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
