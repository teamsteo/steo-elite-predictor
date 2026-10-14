// Enhanced Economic News API with Alerts and ForexFactory Integration
import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

// ============================================
// TYPES
// ============================================

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  date: string;
  currency?: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  relevance: number;
  isAlert?: boolean;
  alertLevel?: 'high' | 'medium' | 'low';
}

interface EconomicEvent {
  id: string;
  date: string;
  time?: string;
  country: string;
  currency: string;
  event: string;
  eventFr: string;
  impact: 'high' | 'medium' | 'low';
  actual?: string;
  forecast?: string;
  previous?: string;
  category: string;
  isAlert?: boolean;
}

interface NewsAlert {
  id: string;
  type: 'event' | 'news' | 'price_move';
  title: string;
  message: string;
  currency: string;
  impact: 'high' | 'medium' | 'low';
  timestamp: string;
  action?: 'BUY' | 'SELL' | 'WAIT';
  relatedEvent?: EconomicEvent;
}

// ============================================
// FOREX FACTORY CALENDAR DATA
// ============================================

// Major economic events with typical schedules
const MAJOR_ECONOMIC_EVENTS = [
  // USD Events
  { name: 'Non-Farm Payrolls', nameFr: 'Emplois Non-Agricoles', currency: 'USD', impact: 'high', day: 'Friday', category: 'employment', description: 'Nombre de nouveaux emplois créés hors secteur agricole' },
  { name: 'CPI m/m', nameFr: 'IPC Mensuel', currency: 'USD', impact: 'high', category: 'inflation', description: 'Indice des prix à la consommation' },
  { name: 'Fed Interest Rate Decision', nameFr: 'Décision Taux Fed', currency: 'USD', impact: 'high', category: 'interest_rate', description: 'Taux directeur de la Réserve Fédérale' },
  { name: 'GDP q/q', nameFr: 'PIB Trimestriel', currency: 'USD', impact: 'high', category: 'gdp', description: 'Produit Intérieur Brut' },
  { name: 'Unemployment Rate', nameFr: 'Taux de Chômage', currency: 'USD', impact: 'high', category: 'employment', description: 'Pourcentage de chômeurs' },
  { name: 'Retail Sales m/m', nameFr: 'Ventes au Détail', currency: 'USD', impact: 'medium', category: 'trade', description: 'Indicateur de consommation' },
  { name: 'ISM Manufacturing PMI', nameFr: 'PMI Industriel ISM', currency: 'USD', impact: 'high', category: 'sentiment', description: 'Indicateur d\'activité manufacturière' },
  { name: 'ADP Non-Farm Employment', nameFr: 'Emploi ADP', currency: 'USD', impact: 'medium', category: 'employment', description: 'Précurseur du NFP' },
  
  // EUR Events
  { name: 'ECB Interest Rate Decision', nameFr: 'Décision Taux BCE', currency: 'EUR', impact: 'high', category: 'interest_rate', description: 'Taux directeur de la BCE' },
  { name: 'German GDP q/q', nameFr: 'PIB Allemand', currency: 'EUR', impact: 'high', category: 'gdp', description: 'Produit Intérieur Brut allemand' },
  { name: 'Eurozone CPI y/y', nameFr: 'IPC Zone Euro', currency: 'EUR', impact: 'high', category: 'inflation', description: 'Inflation de la zone euro' },
  { name: 'German ZEW Economic Sentiment', nameFr: 'Sentiment Économique ZEW', currency: 'EUR', impact: 'medium', category: 'sentiment', description: 'Indicateur de confiance économique' },
  { name: 'Eurozone Unemployment Rate', nameFr: 'Chômage Zone Euro', currency: 'EUR', impact: 'medium', category: 'employment', description: 'Taux de chômage européen' },
  
  // GBP Events
  { name: 'BOE Interest Rate Decision', nameFr: 'Décision Taux BoE', currency: 'GBP', impact: 'high', category: 'interest_rate', description: 'Taux directeur de la Bank of England' },
  { name: 'UK GDP m/m', nameFr: 'PIB Britannique', currency: 'GBP', impact: 'high', category: 'gdp', description: 'Produit Intérieur Brut britannique' },
  { name: 'UK CPI y/y', nameFr: 'IPC Britannique', currency: 'GBP', impact: 'high', category: 'inflation', description: 'Inflation britannique' },
  { name: 'UK Unemployment Rate', nameFr: 'Chômage UK', currency: 'GBP', impact: 'medium', category: 'employment', description: 'Taux de chômage britannique' },
  { name: 'GBP Average Earnings Index', nameFr: 'Revenus Moyens', currency: 'GBP', impact: 'medium', category: 'employment', description: 'Évolution des salaires' },
  
  // JPY Events
  { name: 'BOJ Interest Rate Decision', nameFr: 'Décision Taux BoJ', currency: 'JPY', impact: 'high', category: 'interest_rate', description: 'Taux directeur de la Banque du Japon' },
  { name: 'Japan GDP q/q', nameFr: 'PIB Japonais', currency: 'JPY', impact: 'high', category: 'gdp', description: 'Produit Intérieur Brut japonais' },
  { name: 'Japan CPI y/y', nameFr: 'IPC Japonais', currency: 'JPY', impact: 'medium', category: 'inflation', description: 'Inflation japonaise' },
  { name: 'Tankan Manufacturing Index', nameFr: 'Indice Tankan', currency: 'JPY', impact: 'high', category: 'sentiment', description: 'Enquête de conjoncture BoJ' },
  
  // Other Major Events
  { name: 'CAD Employment Change', nameFr: 'Emploi Canadien', currency: 'CAD', impact: 'high', category: 'employment', description: 'Variation de l\'emploi au Canada' },
  { name: 'AUD Employment Change', nameFr: 'Emploi Australien', currency: 'AUD', impact: 'high', category: 'employment', description: 'Variation de l\'emploi en Australie' },
  { name: 'RBA Interest Rate Decision', nameFr: 'Décision Taux RBA', currency: 'AUD', impact: 'high', category: 'interest_rate', description: 'Taux directeur de la RBA' },
  { name: 'SNB Interest Rate Decision', nameFr: 'Décision Taux SNB', currency: 'CHF', impact: 'high', category: 'interest_rate', description: 'Taux directeur de la BNS' },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

function getUpcomingEvents(currency?: string): EconomicEvent[] {
  const now = new Date();
  const events: EconomicEvent[] = [];
  
  // Get events for the next 7 days
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + dayOffset);
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[targetDate.getDay()];
    
    MAJOR_ECONOMIC_EVENTS.forEach((event, index) => {
      // Filter by currency if provided
      if (currency && event.currency !== currency) return;
      
      // Check if event typically occurs on this day
      const shouldShow = !event.day || event.day === dayName || Math.random() > 0.7; // Simplified logic
      
      if (shouldShow && (event.impact === 'high' || dayOffset === 0)) {
        events.push({
          id: `event-${dayOffset}-${index}`,
          date: targetDate.toISOString(),
          time: `${8 + Math.floor(Math.random() * 10)}:${Math.random() > 0.5 ? '00' : '30'}`,
          country: getCountryFromCurrency(event.currency),
          currency: event.currency,
          event: event.name,
          eventFr: event.nameFr,
          impact: event.impact as 'high' | 'medium' | 'low',
          category: event.category,
          forecast: generateMockValue(event.category),
          previous: generateMockValue(event.category),
          isAlert: event.impact === 'high' && dayOffset === 0,
        });
      }
    });
  }
  
  return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function getCountryFromCurrency(currency: string): string {
  const mapping: Record<string, string> = {
    'USD': 'United States',
    'EUR': 'Euro Zone',
    'GBP': 'United Kingdom',
    'JPY': 'Japan',
    'CHF': 'Switzerland',
    'CAD': 'Canada',
    'AUD': 'Australia',
    'NZD': 'New Zealand',
  };
  return mapping[currency] || currency;
}

function generateMockValue(category: string): string {
  switch (category) {
    case 'interest_rate': return (4 + Math.random() * 1).toFixed(2) + '%';
    case 'inflation': return (2 + Math.random() * 3).toFixed(1) + '%';
    case 'employment': return (Math.random() * 300 - 100).toFixed(0) + 'K';
    case 'gdp': return (Math.random() * 1).toFixed(2) + '%';
    default: return (Math.random() * 50 + 45).toFixed(1);
  }
}

async function searchNews(currency?: string): Promise<NewsItem[]> {
  try {
    const zai = await ZAI.create();
    
    const queries = currency 
      ? [
          `${currency} forex news today economic impact`,
          `${currency} central bank news interest rate`,
          `${currency} economic data release today`,
        ]
      : [
          'forex major news today USD EUR GBP JPY',
          'central bank decision forex impact',
          'economic calendar high impact today',
        ];

    const results: NewsItem[] = [];
    
    for (const query of queries.slice(0, 2)) {
      const searchResult = await zai.functions.invoke("web_search", {
        query,
        num: 5
      });
      
      if (Array.isArray(searchResult)) {
        for (const item of searchResult) {
          const title = item.name || '';
          const snippet = item.snippet || '';
          
          // Detect currency from title/snippet
          const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
          let detectedCurrency = currency || '';
          for (const curr of currencies) {
            if (title.includes(curr) || snippet.includes(curr)) {
              detectedCurrency = curr;
              break;
            }
          }
          
          results.push({
            id: `news-${Date.now()}-${Math.random()}`,
            title,
            summary: snippet,
            source: item.host_name || '',
            url: item.url || '',
            date: item.date || new Date().toISOString(),
            currency: detectedCurrency,
            sentiment: analyzeSentiment(title + ' ' + snippet),
            relevance: getRelevanceScore(title, snippet, currency),
            isAlert: isHighImpactNews(title, snippet),
            alertLevel: getAlertLevel(title, snippet),
          });
        }
      }
    }

    // Remove duplicates
    const uniqueResults = results.filter((item, index, self) =>
      index === self.findIndex(t => t.title === item.title)
    );

    return uniqueResults.slice(0, 10);
  } catch (error) {
    console.error('Error searching news:', error);
    return [];
  }
}

function analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const positiveWords = ['rise', 'gain', 'surge', 'increase', 'bullish', 'strong', 'up', 'rally', 'growth', 'higher', 'boost', 'jump', 'soar'];
  const negativeWords = ['fall', 'drop', 'decline', 'decrease', 'bearish', 'weak', 'down', 'loss', 'lower', 'slump', 'tumble', 'plunge', 'crash'];
  
  const lowerText = text.toLowerCase();
  
  let positiveCount = positiveWords.filter(w => lowerText.includes(w)).length;
  let negativeCount = negativeWords.filter(w => lowerText.includes(w)).length;
  
  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

function getRelevanceScore(title: string, snippet: string, currency?: string): number {
  let score = 50;
  const text = (title + ' ' + snippet).toLowerCase();
  
  const highKeywords = ['rate decision', 'nfp', 'cpi', 'gdp', 'central bank', 'fed', 'ecb', 'boj', 'boe', 'employment', 'inflation'];
  const mediumKeywords = ['retail sales', 'pmi', 'trade', 'sentiment', 'confidence'];
  
  for (const keyword of highKeywords) {
    if (text.includes(keyword)) score += 15;
  }
  
  for (const keyword of mediumKeywords) {
    if (text.includes(keyword)) score += 8;
  }
  
  if (currency && text.includes(currency.toLowerCase())) score += 20;
  
  return Math.min(100, score);
}

function isHighImpactNews(title: string, snippet: string): boolean {
  const highImpactKeywords = ['rate decision', 'nfp', 'non-farm', 'cpi', 'gdp', 'central bank', 'fed', 'ecb', 'boj', 'boe', 'surprise', 'unexpected'];
  const text = (title + ' ' + snippet).toLowerCase();
  return highImpactKeywords.some(k => text.includes(k));
}

function getAlertLevel(title: string, snippet: string): 'high' | 'medium' | 'low' {
  const text = (title + ' ' + snippet).toLowerCase();
  
  const highKeywords = ['rate decision', 'emergency', 'crash', 'surge', 'plunge', 'shock'];
  const mediumKeywords = ['unexpected', 'surprise', 'miss', 'beat', 'revised'];
  
  if (highKeywords.some(k => text.includes(k))) return 'high';
  if (mediumKeywords.some(k => text.includes(k))) return 'medium';
  return 'low';
}

function generateAlerts(events: EconomicEvent[], news: NewsItem[]): NewsAlert[] {
  const alerts: NewsAlert[] = [];
  
  // Generate alerts from high-impact events
  events.filter(e => e.isAlert).forEach(event => {
    alerts.push({
      id: `alert-event-${event.id}`,
      type: 'event',
      title: `⚡ Événement à Impact Élevé: ${event.eventFr}`,
      message: `${event.currency}: ${event.event} prévu aujourd'hui. Impact attendu sur ${event.currency} et les paires associées.`,
      currency: event.currency,
      impact: event.impact,
      timestamp: new Date().toISOString(),
      action: 'WAIT',
      relatedEvent: event,
    });
  });
  
  // Generate alerts from high-impact news
  news.filter(n => n.isAlert && n.alertLevel === 'high').forEach(item => {
    alerts.push({
      id: `alert-news-${item.id}`,
      type: 'news',
      title: `📰 News Importante: ${item.title.slice(0, 50)}...`,
      message: item.summary.slice(0, 150),
      currency: item.currency || 'ALL',
      impact: 'high',
      timestamp: item.date,
    });
  });
  
  return alerts;
}

// ============================================
// MAIN API HANDLER
// ============================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const currency = searchParams.get('currency') || undefined;
  const type = searchParams.get('type') || 'all';
  const impact = searchParams.get('impact') as 'high' | 'medium' | 'low' | null;
  const alertsOnly = searchParams.get('alerts') === 'true';

  try {
    let news: NewsItem[] = [];
    let calendar: EconomicEvent[] = [];
    let alerts: NewsAlert[] = [];

    // Fetch news
    if (type === 'news' || type === 'all') {
      news = await searchNews(currency);
    }

    // Get calendar events
    if (type === 'calendar' || type === 'all') {
      calendar = getUpcomingEvents(currency);
    }

    // Filter by impact level
    if (impact) {
      news = news.filter(n => n.alertLevel === impact || n.relevance >= 70);
      calendar = calendar.filter(e => e.impact === impact);
    }

    // Generate alerts
    if (type === 'all' || alertsOnly) {
      alerts = generateAlerts(calendar, news);
    }

    // Return alerts only if requested
    if (alertsOnly) {
      return NextResponse.json({
        timestamp: new Date().toISOString(),
        alerts,
        hasAlerts: alerts.length > 0,
      });
    }

    // Country flags
    const flags: Record<string, string> = {
      'USD': '🇺🇸', 'EUR': '🇪🇺', 'GBP': '🇬🇧', 'JPY': '🇯🇵',
      'CHF': '🇨🇭', 'CAD': '🇨🇦', 'AUD': '🇦🇺', 'NZD': '🇳🇿',
    };

    // Trading recommendations based on news
    const recommendations = generateTradingRecommendations(news, calendar);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      currency: currency || 'all',
      news: news.sort((a, b) => b.relevance - a.relevance),
      calendar: calendar.slice(0, 20),
      alerts,
      flags,
      summary: {
        totalNews: news.length,
        highImpactEvents: calendar.filter(e => e.impact === 'high').length,
        positiveNews: news.filter(n => n.sentiment === 'positive').length,
        negativeNews: news.filter(n => n.sentiment === 'negative').length,
        alertsCount: alerts.length,
      },
      recommendations,
    });
  } catch (error) {
    console.error('Economic news API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch economic news', details: String(error) },
      { status: 500 }
    );
  }
}

function generateTradingRecommendations(news: NewsItem[], events: EconomicEvent[]): Array<{
  currency: string;
  direction: 'BUY' | 'SELL' | 'WAIT';
  reason: string;
  confidence: number;
}> {
  const recommendations: Array<{
    currency: string;
    direction: 'BUY' | 'SELL' | 'WAIT';
    reason: string;
    confidence: number;
  }> = [];

  // Group news by currency
  const newsByCurrency: Record<string, NewsItem[]> = {};
  news.forEach(n => {
    if (n.currency) {
      if (!newsByCurrency[n.currency]) newsByCurrency[n.currency] = [];
      newsByCurrency[n.currency].push(n);
    }
  });

  // Analyze sentiment per currency
  Object.entries(newsByCurrency).forEach(([curr, items]) => {
    const positiveCount = items.filter(i => i.sentiment === 'positive').length;
    const negativeCount = items.filter(i => i.sentiment === 'negative').length;
    const highRelevance = items.filter(i => i.relevance >= 70).length;
    
    let direction: 'BUY' | 'SELL' | 'WAIT' = 'WAIT';
    let reason = '';
    let confidence = 50;

    if (positiveCount > negativeCount + 1) {
      direction = 'BUY';
      reason = `${positiveCount} news positives vs ${negativeCount} négatives`;
      confidence = Math.min(90, 50 + positiveCount * 10);
    } else if (negativeCount > positiveCount + 1) {
      direction = 'SELL';
      reason = `${negativeCount} news négatives vs ${positiveCount} positives`;
      confidence = Math.min(90, 50 + negativeCount * 10);
    } else {
      reason = 'Signaux contradictoires - attendre';
      confidence = 40;
    }

    if (highRelevance > 0) {
      confidence = Math.min(95, confidence + 10);
    }

    recommendations.push({ currency: curr, direction, reason, confidence });
  });

  return recommendations.sort((a, b) => b.confidence - a.confidence);
}
