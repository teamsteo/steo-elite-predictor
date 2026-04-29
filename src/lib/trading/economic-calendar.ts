// Economic News and Calendar Types
// For Forex correlation analysis

export interface EconomicEvent {
  id: string;
  date: Date;
  country: string;
  currency: string;
  event: string;
  eventFr: string;
  impact: 'high' | 'medium' | 'low';
  actual?: string;
  forecast?: string;
  previous?: string;
  category: 'inflation' | 'employment' | 'gdp' | 'interest_rate' | 'trade' | 'sentiment' | 'other';
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  date: Date;
  currency?: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  relevance: number; // 0-100
}

export interface CorrelationAnalysis {
  event: EconomicEvent;
  priceImpact: {
    direction: 'bullish' | 'bearish' | 'neutral';
    magnitude: number; // pips
    timeframe: string;
  };
  currency: string;
  explanation: string;
}

// Country to currency mapping
export const COUNTRY_CURRENCY: Record<string, string> = {
  'USA': 'USD',
  'United States': 'USD',
  'Etats-Unis': 'USD',
  'Euro Zone': 'EUR',
  'Zone Euro': 'EUR',
  'Germany': 'EUR',
  'Allemagne': 'EUR',
  'France': 'EUR',
  'Italy': 'EUR',
  'Italie': 'EUR',
  'Spain': 'EUR',
  'Espagne': 'EUR',
  'UK': 'GBP',
  'United Kingdom': 'GBP',
  'Royaume-Uni': 'GBP',
  'Japan': 'JPY',
  'Japon': 'JPY',
  'Switzerland': 'CHF',
  'Suisse': 'CHF',
  'Canada': 'CAD',
  'Australie': 'AUD',
  'Australia': 'AUD',
  'New Zealand': 'NZD',
  'Nouvelle-Zélande': 'NZD',
  'China': 'CNY',
  'Chine': 'CNY',
};

// Major economic events with their typical impact
export const MAJOR_EVENTS = {
  high: [
    'Non-Farm Payrolls',
    'Fed Interest Rate Decision',
    'CPI',
    'GDP',
    'NFP',
    'Unemployment Rate',
    'ECB Interest Rate Decision',
    'BOJ Interest Rate Decision',
    'BOE Interest Rate Decision',
    'Retail Sales',
    'PMI',
  ],
  medium: [
    'Industrial Production',
    'Trade Balance',
    'Consumer Confidence',
    'Business Confidence',
    'Housing Data',
    'Manufacturing PMI',
    'Services PMI',
  ],
};

// French translations for events
export const EVENT_TRANSLATIONS: Record<string, string> = {
  'Non-Farm Payrolls': 'Emplois Non-Agricoles (NFP)',
  'Fed Interest Rate Decision': 'Décision Taux Fed',
  'CPI': 'IPC (Inflation)',
  'GDP': 'PIB',
  'Unemployment Rate': 'Taux de Chômage',
  'ECB Interest Rate Decision': 'Décision Taux BCE',
  'BOJ Interest Rate Decision': 'Décision Taux BoJ',
  'BOE Interest Rate Decision': 'Décision Taux BoE',
  'Retail Sales': 'Ventes au Détail',
  'PMI': 'PMI (Indicateur Activité)',
  'Industrial Production': 'Production Industrielle',
  'Trade Balance': 'Balance Commerciale',
  'Consumer Confidence': 'Confiance Consommateurs',
  'Business Confidence': 'Confiance Entreprises',
  'Housing Data': 'Données Immobilier',
  'Manufacturing PMI': 'PMI Manufacturier',
  'Services PMI': 'PMI Services',
};

// Flag emojis for countries
export const COUNTRY_FLAGS: Record<string, string> = {
  'USD': '🇺🇸',
  'EUR': '🇪🇺',
  'GBP': '🇬🇧',
  'JPY': '🇯🇵',
  'CHF': '🇨🇭',
  'CAD': '🇨🇦',
  'AUD': '🇦🇺',
  'NZD': '🇳🇿',
  'CNY': '🇨🇳',
};

// Impact colors
export const IMPACT_COLORS: Record<string, string> = {
  'high': 'bg-red-500',
  'medium': 'bg-yellow-500',
  'low': 'bg-green-500',
};

// Category icons
export const CATEGORY_ICONS: Record<string, string> = {
  'inflation': '📈',
  'employment': '👷',
  'gdp': '🏭',
  'interest_rate': '🏦',
  'trade': '🌍',
  'sentiment': '📊',
  'other': '📅',
};
