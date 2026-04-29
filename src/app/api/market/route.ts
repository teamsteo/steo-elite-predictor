// Market Data API - Forex Focused
import { NextRequest, NextResponse } from 'next/server';
import { Candle, MarketData, TIMEFRAME_CONFIG, FOREX_PAIRS, getCurrentSessions } from '@/lib/trading/types';

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
        currency: string;
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
      console.error(`Yahoo Finance API error: ${response.status}`);
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
        { error: 'Failed to fetch market data', details: 'No data returned from Yahoo Finance' },
        { status: 500 }
      );
    }
    
    const result = data.chart.result[0];
    const quote = result.indicators.quote[0];
    const meta = result.meta;
    
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
    
    // Calculate price changes
    const currentPrice = meta.regularMarketPrice || candles[candles.length - 1]?.close || 0;
    const previousClose = meta.previousClose || candles[candles.length - 2]?.close || currentPrice;
    const priceChange = currentPrice - previousClose;
    const priceChangePercent = previousClose !== 0 ? (priceChange / previousClose) * 100 : 0;
    
    // Get pair info
    const pairInfo = FOREX_PAIRS.find(p => p.symbol === symbol);
    
    // Calculate spread (approximate)
    const lastCandle = candles[candles.length - 1];
    const spread = lastCandle ? (lastCandle.high - lastCandle.low) * 0.1 : 0; // Approximate spread
    
    const marketData: MarketData = {
      symbol,
      candles,
      currentPrice,
      priceChange,
      priceChangePercent,
      high24h: meta.regularMarketDayHigh || Math.max(...candles.slice(-24).map(c => c.high)),
      low24h: meta.regularMarketDayLow || Math.min(...candles.slice(-24).map(c => c.low)),
      volume24h: meta.regularMarketVolume || candles.slice(-24).reduce((sum, c) => sum + c.volume, 0),
      spread
    };
    
    // Add forex-specific data
    const response = {
      ...marketData,
      pairInfo: pairInfo ? {
        name: pairInfo.name,
        base: pairInfo.base,
        quote: pairInfo.quote,
        type: pairInfo.type,
        pipValue: pairInfo.pipValue
      } : null,
      sessions: getCurrentSessions(),
      formattedPrice: pairInfo 
        ? (symbol.includes('JPY') ? currentPrice.toFixed(3) : currentPrice.toFixed(5))
        : currentPrice.toFixed(5)
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Market data API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
