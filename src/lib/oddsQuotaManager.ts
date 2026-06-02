/**
 * Odds Quota Manager - GESTION CENTRALISÉE DU QUOTA
 * 
 * PROBLÈME: 500 requêtes/mois gratuit = ~17/jour
 * SOLUTION: Un SEUL appel par jour avec cache partagé
 * 
 * STRATÉGIE:
 * 1. Le cron du matin (05:30 UTC) fait les appels API
 * 2. Les données sont mises en cache pour 24h
 * 3. Tous les services utilisent le CACHE, jamais l'API directe
 * 4. API appelée SEULEMENT si cache vide/expiré
 */

// ============================================
// TYPES
// ============================================

export interface CachedOddsData {
  timestamp: number;
  expiresAt: number;
  sports: Record<string, any[]>;
  requestsUsed: number;
}

export interface QuotaStatus {
  used: number;
  limit: number;
  remaining: number;
  lastReset: string;
  cacheValid: boolean;
  cacheAge: number; // en minutes
}

// ============================================
// CONFIGURATION
// ============================================

const ODDS_API_KEY = process.env.THE_ODDS_API_KEY || process.env.ODDS_API_KEY || 'fcf0d3cbc8958a44007b0520751f8431';
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

// Cache valide 12 heures (les cotes ne changent pas beaucoup)
const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 heures en ms (était 6h)

// Quota mensuel (gratuit = 500)
const MONTHLY_QUOTA = 500;

// Quota journalier alloué - RÉDUIT pour économiser
const DAILY_BUDGET = 5; // 5 requêtes/jour max = 150/mois (marge de 350 pour pics)

// Variables globales pour le cache en mémoire
let memoryCache: CachedOddsData | null = null;
let dailyRequestCount = 0;
let lastResetDate = '';

// ============================================
// GESTION DU CACHE
// ============================================

/**
 * Charge les données depuis le cache
 */
function loadFromCache(): CachedOddsData | null {
  // D'abord vérifier le cache mémoire
  if (memoryCache && Date.now() < memoryCache.expiresAt) {
    return memoryCache;
  }
  
  // Ensuite vérifier le fichier cache (pour Vercel/serverless)
  try {
    const fs = require('fs');
    const path = require('path');
    const cachePath = path.join(process.cwd(), 'data', 'odds-cache.json');
    
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      
      if (Date.now() < data.expiresAt) {
        memoryCache = data;
        return data;
      }
    }
  } catch (error) {
    // Ignorer les erreurs de fichier
  }
  
  return null;
}

/**
 * Sauvegarde les données dans le cache
 */
function saveToCache(data: CachedOddsData): void {
  memoryCache = data;
  
  try {
    const fs = require('fs');
    const path = require('path');
    const cacheDir = path.join(process.cwd(), 'data');
    const cachePath = path.join(cacheDir, 'odds-cache.json');
    
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
  } catch (error) {
    // Ignorer les erreurs de fichier
  }
}

/**
 * Vérifie si on peut faire une requête API
 */
function canMakeRequest(): { allowed: boolean; reason: string } {
  const today = new Date().toISOString().split('T')[0];
  
  // Reset le compteur quotidien
  if (lastResetDate !== today) {
    dailyRequestCount = 0;
    lastResetDate = today;
  }
  
  // Vérifier le budget quotidien
  if (dailyRequestCount >= DAILY_BUDGET) {
    return { 
      allowed: false, 
      reason: `Budget quotidien atteint (${dailyRequestCount}/${DAILY_BUDGET})` 
    };
  }
  
  return { allowed: true, reason: 'OK' };
}

// ============================================
// API PUBLIQUE
// ============================================

/**
 * Récupère les cotes pour UN sport depuis le cache ou l'API
 * C'est la SEULE fonction qui devrait être appelée
 */
export async function getOddsForSport(sport: string): Promise<any[]> {
  // 1. Vérifier le cache
  const cached = loadFromCache();
  
  if (cached && cached.sports[sport]) {
    console.log(`[OddsQuota] 📦 Cache HIT pour ${sport}`);
    return cached.sports[sport];
  }
  
  // 2. Vérifier le quota
  const { allowed, reason } = canMakeRequest();
  
  if (!allowed) {
    console.log(`[OddsQuota] ⚠️ ${reason} - retour cache partiel ou vide`);
    return cached?.sports[sport] || [];
  }
  
  // 3. Appeler l'API
  if (!ODDS_API_KEY) {
    console.log(`[OddsQuota] ⚠️ Pas de clé API`);
    return [];
  }
  
  console.log(`[OddsQuota] 🌐 Appel API pour ${sport} (${dailyRequestCount + 1}/${DAILY_BUDGET})`);
  
  try {
    const response = await fetch(
      `${ODDS_API_BASE}/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`,
      { next: { revalidate: CACHE_DURATION / 1000 } }
    );
    
    if (!response.ok) {
      console.error(`[OddsQuota] ❌ Erreur API: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    // Incrémenter le compteur
    dailyRequestCount++;
    
    // Mettre à jour le cache
    const currentCache = cached || {
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_DURATION,
      sports: {},
      requestsUsed: 0,
    };
    
    currentCache.sports[sport] = data;
    currentCache.requestsUsed++;
    
    saveToCache(currentCache);
    
    console.log(`[OddsQuota] ✅ ${data.length} matchs récupérés pour ${sport}`);
    
    return data;
    
  } catch (error) {
    console.error(`[OddsQuota] ❌ Erreur:`, error);
    return [];
  }
}

/**
 * Récupère les cotes pour plusieurs sports en UN SEUL appel si possible
 */
export async function getOddsForSports(sports: string[]): Promise<Record<string, any[]>> {
  const results: Record<string, any[]> = {};
  const cached = loadFromCache();
  const sportsToFetch: string[] = [];
  
  // Vérifier quels sports sont déjà en cache
  for (const sport of sports) {
    if (cached?.sports[sport] && cached.sports[sport].length > 0) {
      results[sport] = cached.sports[sport];
    } else {
      sportsToFetch.push(sport);
    }
  }
  
  // Si tout est en cache, retourner
  if (sportsToFetch.length === 0) {
    console.log(`[OddsQuota] 📦 Cache HIT pour tous les sports`);
    return results;
  }
  
  // Vérifier le quota
  const { allowed, reason } = canMakeRequest();
  
  if (!allowed) {
    console.log(`[OddsQuota] ⚠️ ${reason}`);
    // Retourner ce qu'on a en cache
    for (const sport of sportsToFetch) {
      results[sport] = cached?.sports[sport] || [];
    }
    return results;
  }
  
  // Limiter le nombre de sports à récupérer
  const sportsToFetchLimited = sportsToFetch.slice(0, Math.min(3, DAILY_BUDGET - dailyRequestCount));
  
  console.log(`[OddsQuota] 🌐 Récupération de ${sportsToFetchLimited.length} sports`);
  
  // Récupérer chaque sport
  for (const sport of sportsToFetchLimited) {
    const data = await getOddsForSport(sport);
    results[sport] = data;
  }
  
  return results;
}

// Tournois tennis les plus courants - LISTE STATIQUE pour économiser les appels API
// Pas besoin d'appeler l'API pour découvrir les tournois disponibles
const TENNIS_SPORTS_STATIC = [
  'tennis_atp',           // ATP générique
  'tennis_wta',           // WTA générique
  'tennis_atp_australian_open',
  'tennis_wta_australian_open',
  'tennis_atp_french_open',
  'tennis_wta_french_open',
  'tennis_atp_wimbledon',
  'tennis_wta_wimbledon',
  'tennis_atp_us_open',
  'tennis_wta_us_open',
  'tennis_atp_masters',   // Masters 1000
  'tennis_wta_1000',      // WTA 1000
];

// Cache pour les sports tennis disponibles
let tennisSportsCache: string[] | null = null;

/**
 * Récupère les clés des tournois tennis - UTILISE LISTE STATIQUE
 * Plus aucun appel API pour découvrir les tournois
 */
async function getAvailableTennisSports(): Promise<string[]> {
  // Utiliser le cache si disponible
  if (tennisSportsCache && tennisSportsCache.length > 0) {
    return tennisSportsCache;
  }
  
  // Utiliser la liste statique (pas d'appel API)
  tennisSportsCache = TENNIS_SPORTS_STATIC;
  
  console.log(`[OddsQuota] 🎾 ${TENNIS_SPORTS_STATIC.length} tournois tennis (liste statique)`);
  
  return TENNIS_SPORTS_STATIC;
}

/**
 * Récupère tous les matchs de tennis (détection automatique des tournois)
 */
export async function getTennisOdds(): Promise<any[]> {
  // Récupérer les tournois tennis disponibles
  const tennisSports = await getAvailableTennisSports();
  
  if (tennisSports.length === 0) {
    console.log('[OddsQuota] ⚠️ Aucun tournoi tennis disponible');
    return [];
  }
  
  // Récupérer les matchs pour tous les tournois
  const odds = await getOddsForSports(tennisSports);
  
  // Combiner tous les matchs
  const allMatches: any[] = [];
  for (const sport of tennisSports) {
    if (odds[sport] && odds[sport].length > 0) {
      allMatches.push(...odds[sport].map((m: any) => ({ ...m, sport_key: sport })));
    }
  }
  
  console.log(`[OddsQuota] 🎾 Total: ${allMatches.length} matchs tennis récupérés`);
  
  return allMatches;
}

/**
 * Récupère les cotes football
 */
export async function getFootballOdds(): Promise<any[]> {
  // Football a souvent des données ESPN gratuites, donc pas besoin d'Odds API
  // Mais si on veut l'utiliser:
  // return getOddsForSport('soccer_epl');
  return [];
}

/**
 * Statut du quota
 */
export function getQuotaStatus(): QuotaStatus {
  const cached = loadFromCache();
  const today = new Date().toISOString().split('T')[0];
  
  // Reset si nouveau jour
  if (lastResetDate !== today) {
    dailyRequestCount = 0;
    lastResetDate = today;
  }
  
  const cacheAge = cached ? Math.floor((Date.now() - cached.timestamp) / 60000) : 0;
  
  return {
    used: dailyRequestCount,
    limit: DAILY_BUDGET,
    remaining: DAILY_BUDGET - dailyRequestCount,
    lastReset: lastResetDate,
    cacheValid: cached !== null && Date.now() < cached.expiresAt,
    cacheAge,
  };
}

/**
 * Force le rafraîchissement du cache (pour le cron du matin)
 */
export async function refreshCache(sports: string[] = ['tennis_atp', 'tennis_wta']): Promise<void> {
  console.log(`[OddsQuota] 🔄 Rafraîchissement du cache...`);
  
  // Vider le cache
  memoryCache = null;
  
  // Récupérer les données
  await getOddsForSports(sports);
  
  console.log(`[OddsQuota] ✅ Cache rafraîchi`);
}

// ============================================
// EXPORT DEFAULT
// ============================================

export default {
  getOddsForSport,
  getOddsForSports,
  getTennisOdds,
  getFootballOdds,
  getQuotaStatus,
  refreshCache,
};
