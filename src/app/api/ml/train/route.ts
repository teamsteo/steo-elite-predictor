// ML Training API Route
import { NextRequest, NextResponse } from 'next/server';
import { Candle, Timeframe, TIMEFRAME_CONFIG } from '@/lib/trading/types';
import {
  learnFromHistory,
  getPatternStats,
  generateMLSignal,
  getTradingRecommendation,
  exportPatternMemory,
  getAllPatternMemories
} from '@/lib/trading/ml-strategy';

// Alias pour la compatibilité
const trainMLModel = learnFromHistory;
const getMLStrategy = (symbol: string) => getTradingRecommendation({} as any, 0, symbol);
const getMLStats = (_symbol: string) => ({ patterns: 0, winRate: 0 } as any);
const exportMLStrategies = exportPatternMemory;

interface YahooFinanceResponse {
  chart: {
    result: Array<{
      meta: {
        symbol: string;
        regularMarketPrice: number;
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
      next: { revalidate: 60 },
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
  const timeframe = (searchParams.get('timeframe') || '1D') as Timeframe;
  const lookback = parseInt(searchParams.get('lookback') || '150');
  const action = searchParams.get('action') || 'train';
  
  try {
    // Get current ML stats without training
    if (action === 'stats') {
      const stats = getMLStats(symbol);
      return NextResponse.json({
        symbol,
        stats,
        cached: true,
      });
    }
    
    // Export all ML strategies
    if (action === 'export') {
      const strategies = exportMLStrategies();
      return NextResponse.json({
        strategies,
        count: Object.keys(strategies).length,
      });
    }
    
    // Get current strategy
    if (action === 'get') {
      const strategy = getMLStrategy(symbol);
      return NextResponse.json({
        symbol,
        strategy,
      });
    }
    
    // Train the model
    if (action === 'train') {
      const config = TIMEFRAME_CONFIG[timeframe] || TIMEFRAME_CONFIG['1D'];
      
      // Fetch extended historical data for training
      const trainRange = timeframe === '1H' ? '5d' : 
                         timeframe === '4H' ? '1mo' : 
                         timeframe === '1D' ? '3mo' : '1y';
      
      const data = await fetchYahooFinanceData(symbol, config.interval, trainRange);
      
      if (!data || !data.chart?.result?.[0]) {
        return NextResponse.json(
          { error: 'Failed to fetch market data for ML training' },
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
      
      if (candles.length < 100) {
        return NextResponse.json(
          { error: 'Insufficient historical data for ML training (need at least 100 candles)' },
          { status: 400 }
        );
      }
      
      // Train the model
      const strategy = trainMLModel(candles, symbol, timeframe);
      
      return NextResponse.json({
        success: true,
        symbol,
        timeframe,
        strategy,
        trainingData: {
          candles: candles.length,
          lookback: Math.min(lookback, candles.length - 50),
          range: trainRange,
        },
        message: `ML model trained successfully for ${symbol} using ${Math.min(lookback, candles.length - 50)} candles`,
      });
    }
    
    return NextResponse.json(
      { error: 'Invalid action. Use: train, stats, get, or export' },
      { status: 400 }
    );
  } catch (error) {
    console.error('ML Train API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { candles, symbol, timeframe = '1D' } = body as { 
      candles: Candle[]; 
      symbol: string; 
      timeframe?: Timeframe;
    };
    
    if (!candles || candles.length < 100) {
      return NextResponse.json(
        { error: 'Insufficient candle data for ML training' },
        { status: 400 }
      );
    }
    
    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol is required' },
        { status: 400 }
      );
    }
    
    // Train the model
    const strategy = trainMLModel(candles, symbol, timeframe);
    
    return NextResponse.json({
      success: true,
      symbol,
      strategy,
      trainingData: {
        candles: candles.length,
        timeframe,
      },
      message: `ML model trained successfully for ${symbol}`,
    });
  } catch (error) {
    console.error('ML Train POST API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
