/**
 * The Odds API Manager - Gestionnaire intelligent de quota
 * VERSION SERVERLESS COMPATIBLE (Vercel)
 * 
 * OBJECTIF: Ne jamais dépasser 500 requêtes/mois
 * STRATÉGIE: 
 *   - Charger les données avec cache intelligent
 *   - Stocker en mémoire (pour serverless)
 *   - Maximum ~15 requêtes/mois pour les cotes
 * 
 * COÛT ESTIMÉ: ~2-3 requêtes/jour = ~90 requêtes/mois (bien sous 500)
 */

// Configuration
const ODDS_API_KEY = process.env.THE_ODDS_API_KEY || 'fcf0d3cbc8958a44007b0520751f8431';
const BASE_URL = 'https://api.the-odds-api.com/v4';

// Quota mensuel
const MONTHLY_QUOTA = 500;
const DAILY_BUDGET = 5; // Max 5 requêtes par jour (très conservateur)
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 heures de cache (était 2h)

// Cache global en mémoire (persiste entre les requêtes sur la même instance)
declare global {
  var oddsCache: CacheData | undefined;
}

// Structure des données de cache
interface CacheData {
  matches: CachedMatch[];
  lastUpdate: string;
  quotaUsed: number;
  quotaRemaining: number;
  month: string;
  dailyRequests: number;
  lastRequestDate: string;
}

export interface CachedMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  commenceTime: string;
  odds: {
    home: number;
    draw: number | null;
    away: number;
  };
  bookmaker: string;
  cachedAt: string;
}

/**
 * Initialise ou récupère le cache global
 */
function getCache(): CacheData {
  if (!global.oddsCache) {
    global.oddsCache = {
      matches: [],
      lastUpdate: '',
      quotaUsed: 0,
      quotaRemaining: MONTHLY_QUOTA,
      month: getCurrentMonth(),
      dailyRequests: 0,
      lastRequestDate: '',
    };
  }
  return global.oddsCache;
}

/**
 * Met à jour le cache global
 */
function updateCache(updates: Partial<CacheData>): void {
  const cache = getCache();
  global.oddsCache = { ...cache, ...updates };
}

/**
 * Retourne le mois actuel
 */
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Retourne la date actuelle
 */
function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Vérifie si on peut faire une requête API
 */
function canMakeRequest(cache: CacheData): { allowed: boolean; reason: string } {
  const currentMonth = getCurrentMonth();
  const currentDate = getCurrentDate();
  
  // Nouveau mois = reset du quota
  if (cache.month !== currentMonth) {
    return { allowed: true, reason: 'Nouveau mois - quota réinitialisé' };
  }
  
  // Vérifier le quota mensuel
  if (cache.quotaRemaining <= 10) {
    return { allowed: false, reason: `Quota mensuel presque épuisé (${cache.quotaRemaining} restantes)` };
  }
  
  // Vérifier le budget journalier
  if (cache.lastRequestDate === currentDate && cache.dailyRequests >= DAILY_BUDGET) {
    return { allowed: false, reason: `Budget journalier atteint (${cache.dailyRequests}/${DAILY_BUDGET})` };
  }
  
  return { allowed: true, reason: 'OK' };
}

/**
 * Vérifie si le cache est encore valide
 */
function isCacheValid(cache: CacheData): boolean {
  if (!cache.lastUpdate) return false;
  
  const lastUpdate = new Date(cache.lastUpdate).getTime();
  const now = Date.now();
  
  return (now - lastUpdate) < CACHE_DURATION_MS;
}

/**
 * Fait une requête API avec gestion du quota
 */
async function makeApiRequest(endpoint: string): Promise<{ 
  data: any; 
  quotaUsed: number; 
  quotaRemaining: number 
} | null> {
  const url = `${BASE_URL}${endpoint}&apiKey=${ODDS_API_KEY}`;
  
  try {
    console.log(`📡 Appel API: ${endpoint.split('?')[0]}...`);
    const response = await fetch(url, {
      next: { revalidate: 0 }, // Pas de cache Next.js
    });
    
    if (!response.ok) {
      console.error(`❌ API Error: ${response.status}`);
      return null;
    }
    
    // Récupérer les infos de quota depuis les headers
    const quotaUsed = parseInt(response.headers.get('x-requests-used') || '0');
    const quotaRemaining = parseInt(response.headers.get('x-requests-remaining') || '0');
    
    console.log(`📊 Quota: ${quotaUsed} utilisées, ${quotaRemaining} restantes`);
    
    const data = await response.json();
    return { data, quotaUsed, quotaRemaining };
  } catch (error) {
    console.error('❌ Erreur requête API:', error);
    return null;
  }
}

/**
 * Charge les données de cotes depuis l'API
 */
export async function fetchAndCacheOdds(): Promise<CacheData> {
  const cache = getCache();
  
  // Vérifier si le cache est valide
  if (isCacheValid(cache) && cache.matches.length > 0) {
    console.log(`✅ Cache valide (${cache.matches.length} matchs, ${cache.quotaRemaining} requêtes restantes)`);
    return cache;
  }
  
  // Vérifier si on peut faire une requête
  const { allowed, reason } = canMakeRequest(cache);
  if (!allowed) {
    console.log(`⚠️ Requête bloquée: ${reason}`);
    console.log(`📦 Utilisation du cache existant (${cache.matches.length} matchs)`);
    return cache;
  }
  
  console.log(`🔄 Chargement des cotes... (${reason})`);
  
  const currentDate = getCurrentDate();
  const currentMonth = getCurrentMonth();
  
  // Reset compteur journalier si nouveau jour
  if (cache.lastRequestDate !== currentDate) {
    cache.dailyRequests = 0;
  }
  
  // Reset quota si nouveau mois
  if (cache.month !== currentMonth) {
    cache.quotaUsed = 0;
    cache.quotaRemaining = MONTHLY_QUOTA;
    cache.month = currentMonth;
  }
  
  const allMatches: CachedMatch[] = [];
  
  // Faire UNE SEULE requête pour "upcoming" (tous sports)
  try {
    const result = await makeApiRequest('/sports/upcoming/odds/?regions=eu&markets=h2h&oddsFormat=decimal');
    
    if (result) {
      let quotaUsed = result.quotaUsed;
      let quotaRemaining = result.quotaRemaining;
      
      cache.dailyRequests++;
      
      for (const match of result.data) {
        // Prendre le premier bookmaker disponible
        const bookmaker = match.bookmakers?.[0];
        const h2hMarket = bookmaker?.markets?.find((m: any) => m.key === 'h2h');
        const outcomes = h2hMarket?.outcomes || [];
        
        if (outcomes.length < 2) continue;
        
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
        
        if (oddsHome > 0 && oddsAway > 0) {
          allMatches.push({
            id: match.id,
            homeTeam: match.home_team,
            awayTeam: match.away_team,
            sport: match.sport_key,
            league: match.sport_title || '',
            commenceTime: match.commence_time,
            odds: {
              home: oddsHome,
              draw: oddsDraw,
              away: oddsAway,
            },
            bookmaker: bookmaker?.title || 'Unknown',
            cachedAt: new Date().toISOString(),
          });
        }
      }
      
      // Mettre à jour le cache global
      updateCache({
        matches: allMatches,
        lastUpdate: new Date().toISOString(),
        quotaUsed,
        quotaRemaining,
        dailyRequests: cache.dailyRequests,
        lastRequestDate: currentDate,
        month: currentMonth,
      });
    }
  } catch (error) {
    console.error('❌ Erreur lors du chargement:', error);
  }
  
  const updatedCache = getCache();
  console.log(`✅ ${allMatches.length} matchs chargés, ${updatedCache.quotaRemaining} requêtes restantes ce mois`);
  
  return updatedCache;
}

/**
 * Récupère les matchs depuis le cache (pas d'appel API)
 */
export function getMatchesFromCache(): CachedMatch[] {
  return getCache().matches;
}

/**
 * Récupère les infos de quota
 */
export function getQuotaInfo(): {
  used: number;
  remaining: number;
  dailyUsed: number;
  dailyBudget: number;
  lastUpdate: string;
  cacheValid: boolean;
} {
  const cache = getCache();
  
  return {
    used: cache.quotaUsed,
    remaining: cache.quotaRemaining,
    dailyUsed: cache.dailyRequests,
    dailyBudget: DAILY_BUDGET,
    lastUpdate: cache.lastUpdate,
    cacheValid: isCacheValid(cache),
  };
}

/**
 * Force le rafraîchissement du cache
 */
export async function forceRefresh(): Promise<{ 
  success: boolean; 
  message: string; 
  matches: number 
}> {
  const cache = getCache();
  const { allowed, reason } = canMakeRequest(cache);
  
  if (!allowed) {
    return { success: false, message: reason, matches: cache.matches.length };
  }
  
  // Vider le cache pour forcer le rechargement
  updateCache({ lastUpdate: '' });
  
  const newCache = await fetchAndCacheOdds();
  
  return { 
    success: true, 
    message: `${newCache.matches.length} matchs chargés`, 
    matches: newCache.matches.length 
  };
}

/**
 * Trouve les cotes pour un match spécifique
 */
export function findOddsForMatch(homeTeam: string, awayTeam: string): CachedMatch | null {
  const cache = getCache();
  
  const normalizeName = (name: string) => 
    name.toLowerCase().replace(/[^a-z]/g, '').substring(0, 6);
  
  const homeNorm = normalizeName(homeTeam);
  const awayNorm = normalizeName(awayTeam);
  
  return cache.matches.find(m => {
    const mHomeNorm = normalizeName(m.homeTeam);
    const mAwaNorm = normalizeName(m.awayTeam);
    return (mHomeNorm === homeNorm && mAwaNorm === awayNorm) ||
           (mHomeNorm === awayNorm && mAwaNorm === homeNorm);
  }) || null;
}

/**
 * Stats publiques pour affichage
 */
export function getPublicStats(): {
  matchCount: number;
  lastUpdate: string;
  quotaRemaining: number;
  cacheStatus: 'valid' | 'expired' | 'empty';
} {
  const cache = getCache();
  
  return {
    matchCount: cache.matches.length,
    lastUpdate: cache.lastUpdate,
    quotaRemaining: cache.quotaRemaining,
    cacheStatus: cache.matches.length === 0 ? 'empty' : isCacheValid(cache) ? 'valid' : 'expired',
  };
}

// Export par défaut
const oddsApiManager = {
  fetchAndCacheOdds,
  getMatchesFromCache,
  getQuotaInfo,
  forceRefresh,
  findOddsForMatch,
  getPublicStats,
};

export default oddsApiManager;
