// Correlation Analysis API - News vs Price Movement
import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

interface CorrelationResult {
  currency: string;
  event: string;
  priceImpact: {
    before: number;
    after: number;
    change: number;
    changePercent: number;
    direction: 'bullish' | 'bearish' | 'neutral';
  };
  timeToImpact: string;
  significance: 'high' | 'medium' | 'low';
  recommendation: string;
}

interface YahooFinanceResponse {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: number[];
          high?: number[];
          low?: number[];
        }>;
      };
    }>;
  };
}

async function getHistoricalPrices(symbol: string): Promise<{ prices: number[]; timestamps: number[]; current: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1h&range=5d`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const data: YahooFinanceResponse = await response.json();
    
    if (!data.chart?.result?.[0]) return null;
    
    const result = data.chart.result[0];
    const quote = result.indicators?.quote?.[0];
    
    if (!quote?.close) return null;
    
    const prices = quote.close.filter((p): p is number => p !== null && p !== undefined);
    const timestamps = result.timestamp || [];
    const current = data.chart.result[0].meta?.regularMarketPrice || prices[prices.length - 1];
    
    return { prices, timestamps, current };
  } catch (error) {
    console.error('Error fetching prices:', error);
    return null;
  }
}

async function searchEventImpact(event: string, currency: string): Promise<{
  found: boolean;
  impact: string;
  sentiment: string;
  summary: string;
}> {
  try {
    const zai = await ZAI.create();
    
    const searchResult = await zai.functions.invoke("web_search", {
      query: `${event} ${currency} forex market impact reaction`,
      num: 5
    });
    
    if (!Array.isArray(searchResult) || searchResult.length === 0) {
      return { found: false, impact: 'unknown', sentiment: 'neutral', summary: '' };
    }
    
    // Analyze sentiment from search results
    const allText = searchResult.map((r: { snippet?: string; name?: string }) => 
      (r.snippet || '') + ' ' + (r.name || '')
    ).join(' ').toLowerCase();
    
    let sentiment = 'neutral';
    if (allText.includes('surge') || allText.includes('rally') || allText.includes('jump') || allText.includes('gain')) {
      sentiment = 'bullish';
    } else if (allText.includes('fall') || allText.includes('drop') || allText.includes('decline') || allText.includes('slump')) {
      sentiment = 'bearish';
    }
    
    const summary = searchResult[0]?.snippet || '';
    
    return {
      found: true,
      impact: sentiment === 'neutral' ? 'mixed' : sentiment,
      sentiment,
      summary: summary.slice(0, 300)
    };
  } catch (error) {
    return { found: false, impact: 'unknown', sentiment: 'neutral', summary: '' };
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const currency = searchParams.get('currency') || 'EUR';
  const symbol = searchParams.get('symbol') || `EURUSD=X`;
  const event = searchParams.get('event') || '';
  
  try {
    // Get price data
    const priceData = await getHistoricalPrices(symbol);
    
    if (!priceData) {
      return NextResponse.json({
        error: 'Failed to fetch price data',
        currency
      }, { status: 500 });
    }
    
    const { prices, current } = priceData;
    
    // Calculate recent price changes
    const price24hAgo = prices[prices.length - 24] || prices[0];
    const price1hAgo = prices[prices.length - 2] || prices[0];
    const price4hAgo = prices[prices.length - 5] || prices[0];
    
    const change24h = ((current - price24hAgo) / price24hAgo) * 100;
    const change1h = ((current - price1hAgo) / price1hAgo) * 100;
    const change4h = ((current - price4hAgo) / price4hAgo) * 100;
    
    // Search for recent news impact
    const zai = await ZAI.create();
    const newsSearch = await zai.functions.invoke("web_search", {
      query: `${currency} forex news today ${event || 'economic'}`,
      num: 10
    });
    
    // Analyze news correlation
    const correlations: CorrelationResult[] = [];
    
    if (Array.isArray(newsSearch)) {
      for (const item of newsSearch.slice(0, 5)) {
        const title = item.name || '';
        const snippet = item.snippet || '';
        const text = (title + ' ' + snippet).toLowerCase();
        
        // Determine event type
        let eventType = 'general';
        if (text.includes('rate') || text.includes('fed') || text.includes('ecb')) {
          eventType = 'Interest Rate';
        } else if (text.includes('nfp') || text.includes('employment') || text.includes('jobs')) {
          eventType = 'Employment';
        } else if (text.includes('cpi') || text.includes('inflation')) {
          eventType = 'Inflation';
        } else if (text.includes('gdp')) {
          eventType = 'GDP';
        }
        
        // Determine direction
        let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
        const bullishWords = ['rise', 'gain', 'surge', 'rally', 'jump', 'climb', 'increase'];
        const bearishWords = ['fall', 'drop', 'decline', 'slump', 'plunge', 'decrease', 'slide'];
        
        const bullishCount = bullishWords.filter(w => text.includes(w)).length;
        const bearishCount = bearishWords.filter(w => text.includes(w)).length;
        
        if (bullishCount > bearishCount) direction = 'bullish';
        else if (bearishCount > bullishCount) direction = 'bearish';
        
        // Calculate significance
        let significance: 'high' | 'medium' | 'low' = 'low';
        if (eventType === 'Interest Rate' || eventType === 'Employment' || eventType === 'Inflation') {
          significance = 'high';
        } else if (eventType === 'GDP') {
          significance = 'medium';
        }
        
        correlations.push({
          currency,
          event: title.slice(0, 80),
          priceImpact: {
            before: price1hAgo,
            after: current,
            change: current - price1hAgo,
            changePercent: change1h,
            direction
          },
          timeToImpact: '< 1h',
          significance,
          recommendation: direction === 'bullish' 
            ? 'Impact positif détecté - surveiller les opportunités LONG'
            : direction === 'bearish'
            ? 'Impact négatif détecté - surveiller les opportunités SHORT'
            : 'Impact neutre - attendre plus de confirmation'
        });
      }
    }
    
    // Calculate overall sentiment
    const bullishCount = correlations.filter(c => c.priceImpact.direction === 'bullish').length;
    const bearishCount = correlations.filter(c => c.priceImpact.direction === 'bearish').length;
    
    let overallSentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (bullishCount > bearishCount + 1) overallSentiment = 'bullish';
    else if (bearishCount > bullishCount + 1) overallSentiment = 'bearish';
    
    // Get major events for this currency
    const eventsSearch = await zai.functions.invoke("web_search", {
      query: `${currency} economic calendar today high impact events`,
      num: 5
    });
    
    const upcomingEvents: Array<{ event: string; time: string; impact: string }> = [];
    
    if (Array.isArray(eventsSearch)) {
      for (const item of eventsSearch) {
        upcomingEvents.push({
          event: item.name?.slice(0, 60) || '',
          time: 'Today',
          impact: (item.snippet?.toLowerCase().includes('high') || 
                   item.name?.toLowerCase().includes('rate')) ? 'high' : 'medium'
        });
      }
    }
    
    return NextResponse.json({
      currency,
      symbol,
      timestamp: new Date().toISOString(),
      priceAnalysis: {
        current,
        change24h: change24h.toFixed(3),
        change4h: change4h.toFixed(3),
        change1h: change1h.toFixed(3),
        trend: change24h > 0.1 ? 'uptrend' : change24h < -0.1 ? 'downtrend' : 'sideways'
      },
      newsCorrelation: {
        overallSentiment,
        bullishSignals: bullishCount,
        bearishSignals: bearishCount,
        neutralSignals: correlations.filter(c => c.priceImpact.direction === 'neutral').length
      },
      correlations,
      upcomingEvents: upcomingEvents.slice(0, 5),
      tradingRecommendation: {
        direction: overallSentiment === 'bullish' ? 'BUY' : overallSentiment === 'bearish' ? 'SELL' : 'WAIT',
        confidence: Math.abs(bullishCount - bearishCount) * 20 + 40,
        reasoning: overallSentiment === 'bullish' 
          ? 'Les actualités récentes montrent un sentiment positif pour cette devise'
          : overallSentiment === 'bearish'
          ? 'Les actualités récentes montrent un sentiment négatif pour cette devise'
          : 'Les signaux sont mixtes - attendre une tendance plus claire'
      }
    });
  } catch (error) {
    console.error('Correlation API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
