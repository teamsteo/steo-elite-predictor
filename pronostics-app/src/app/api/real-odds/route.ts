import { NextResponse } from 'next/server';

// Configuration
const ODDS_API_KEY = process.env.THE_ODDS_API_KEY || 'fcf0d3cbc8958a44007b0520751f8431';
const BASE_URL = 'https://api.the-odds-api.com/v4';

// Cache en mémoire global
declare global {
  var oddsDataCache: {
    matches: any[];
    lastUpdate: string;
    quotaUsed: number;
    quotaRemaining: number;
    month: string;
    dailyRequests: number;
    lastRequestDate: string;
  } | undefined;
}

const CACHE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 heures
const DAILY_BUDGET = 15;

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}

function getCache() {
  if (!global.oddsDataCache) {
    global.oddsDataCache = {
      matches: [],
      lastUpdate: '',
      quotaUsed: 0,
      quotaRemaining: 500,
      month: getCurrentMonth(),
      dailyRequests: 0,
      lastRequestDate: '',
    };
  }
  return global.oddsDataCache;
}

function isCacheValid(): boolean {
  const cache = getCache();
  if (!cache.lastUpdate) return false;
  const lastUpdate = new Date(cache.lastUpdate).getTime();
  return (Date.now() - lastUpdate) < CACHE_DURATION_MS;
}

/**
 * GET - Récupérer les cotes avec gestion intelligente du quota
 */
export async function GET() {
  const cache = getCache();
  const currentMonth = getCurrentMonth();
  const currentDate = getCurrentDate();
  
  // Reset mensuel
  if (cache.month !== currentMonth) {
    cache.month = currentMonth;
    cache.quotaUsed = 0;
    cache.quotaRemaining = 500;
    cache.dailyRequests = 0;
  }
  
  // Reset journalier
  if (cache.lastRequestDate !== currentDate) {
    cache.dailyRequests = 0;
  }
  
  // Si cache valide, retourner sans appel API
  if (isCacheValid() && cache.matches.length > 0) {
    console.log(`✅ Cache valide: ${cache.matches.length} matchs, ${cache.quotaRemaining} requêtes restantes`);
    return NextResponse.json({
      success: true,
      message: `${cache.matches.length} matchs (cache)`,
      apiStatus: [{ provider: 'the-odds-api', enabled: true }],
      quotaInfo: {
        monthlyQuota: 500,
        used: cache.quotaUsed,
        remaining: cache.quotaRemaining,
        dailyUsed: cache.dailyRequests,
        dailyBudget: DAILY_BUDGET,
      },
      stats: {
        synced: cache.matches.length,
        active: cache.matches.length,
      },
      matches: cache.matches,
      lastUpdate: cache.lastUpdate,
      source: 'cache',
    });
  }
  
  // Vérifier si on peut faire une requête
  if (cache.quotaRemaining <= 10) {
    console.log(`⚠️ Quota mensuel bas: ${cache.quotaRemaining} restantes`);
    return NextResponse.json({
      success: false,
      message: `Quota mensuel presque épuisé (${cache.quotaRemaining} restantes)`,
      apiStatus: [{ provider: 'the-odds-api', enabled: true }],
      quotaInfo: {
        monthlyQuota: 500,
        used: cache.quotaUsed,
        remaining: cache.quotaRemaining,
        dailyUsed: cache.dailyRequests,
        dailyBudget: DAILY_BUDGET,
      },
      matches: cache.matches,
      source: 'cache_limited',
    });
  }
  
  if (cache.dailyRequests >= DAILY_BUDGET) {
    console.log(`⚠️ Budget journalier atteint: ${cache.dailyRequests}/${DAILY_BUDGET}`);
    return NextResponse.json({
      success: true,
      message: `Budget journalier atteint - cache utilisé`,
      apiStatus: [{ provider: 'the-odds-api', enabled: true }],
      quotaInfo: {
        monthlyQuota: 500,
        used: cache.quotaUsed,
        remaining: cache.quotaRemaining,
        dailyUsed: cache.dailyRequests,
        dailyBudget: DAILY_BUDGET,
      },
      matches: cache.matches,
      source: 'cache_daily_limit',
    });
  }
  
  // Faire l'appel API
  console.log('🔄 Appel API The Odds API...');
  
  try {
    const response = await fetch(
      `${BASE_URL}/sports/upcoming/odds/?regions=eu&markets=h2h&oddsFormat=decimal&apiKey=${ODDS_API_KEY}`,
      { next: { revalidate: 0 } }
    );
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    
    // Lire les headers de quota
    const quotaUsed = parseInt(response.headers.get('x-requests-used') || '0');
    const quotaRemaining = parseInt(response.headers.get('x-requests-remaining') || '0');
    
    console.log(`📊 Quota: ${quotaUsed} utilisées, ${quotaRemaining} restantes`);
    
    const data = await response.json();
    
    // Parser les matchs
    const matches = data.map((match: any) => {
      const bookmaker = match.bookmakers?.[0];
      const h2hMarket = bookmaker?.markets?.find((m: any) => m.key === 'h2h');
      const outcomes = h2hMarket?.outcomes || [];
      
      let oddsHome = 0;
      let oddsDraw: number | null = null;
      let oddsAway = 0;
      
      for (const outcome of outcomes) {
        const name = outcome.name?.toLowerCase() || '';
        if (name === 'draw' || name === 'x' || name === 'nul') {
          oddsDraw = outcome.price;
        } else if (oddsHome === 0) {
          oddsHome = outcome.price;
        } else {
          oddsAway = outcome.price;
        }
      }
      
      return {
        id: match.id,
        teams: `${match.home_team} vs ${match.away_team}`,
        homeTeam: match.home_team,
        awayTeam: match.away_team,
        sport: match.sport_key,
        league: match.sport_title || '',
        date: match.commence_time,
        odds: oddsDraw 
          ? `${oddsHome.toFixed(2)} | ${oddsDraw.toFixed(2)} | ${oddsAway.toFixed(2)}`
          : `${oddsHome.toFixed(2)} | ${oddsAway.toFixed(2)}`,
        oddsHome,
        oddsDraw,
        oddsAway,
        bookmaker: bookmaker?.title || 'Unknown',
      };
    }).filter((m: any) => m.oddsHome > 0 && m.oddsAway > 0);
    
    // Mettre à jour le cache
    cache.matches = matches;
    cache.lastUpdate = new Date().toISOString();
    cache.quotaUsed = quotaUsed;
    cache.quotaRemaining = quotaRemaining;
    cache.dailyRequests++;
    cache.lastRequestDate = currentDate;
    
    global.oddsDataCache = cache;
    
    console.log(`✅ ${matches.length} matchs chargés, ${quotaRemaining} requêtes restantes`);
    
    return NextResponse.json({
      success: true,
      message: `${matches.length} matchs synchronisés`,
      apiStatus: [{ provider: 'the-odds-api', enabled: true }],
      quotaInfo: {
        monthlyQuota: 500,
        used: quotaUsed,
        remaining: quotaRemaining,
        dailyUsed: cache.dailyRequests,
        dailyBudget: DAILY_BUDGET,
      },
      stats: {
        synced: matches.length,
        active: matches.length,
        maxPerDay: DAILY_BUDGET,
        apiCallsUsed: quotaUsed,
      },
      matches,
      lastUpdate: cache.lastUpdate,
      source: 'api',
    });
    
  } catch (error) {
    console.error('❌ Erreur API:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Erreur de connexion à l\'API',
      apiStatus: [{ provider: 'the-odds-api', enabled: true }],
      quotaInfo: {
        monthlyQuota: 500,
        used: cache.quotaUsed,
        remaining: cache.quotaRemaining,
        dailyUsed: cache.dailyRequests,
        dailyBudget: DAILY_BUDGET,
      },
      matches: cache.matches,
      source: 'cache_error',
    });
  }
}

/**
 * POST - Forcer le rafraîchissement
 */
export async function POST() {
  const cache = getCache();
  
  // Vider le cache pour forcer le rechargement
  cache.lastUpdate = '';
  global.oddsDataCache = cache;
  
  return GET();
}
