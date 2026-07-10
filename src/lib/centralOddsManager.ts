/**
 * Central Odds API Quota Manager v2
 * 
 * 🎯 PROBLÈME v1: loadMonthlyQuota() estimait les appels via "prédictions × 1.5"
 *    en lisant la table Supabase. Avec 614 prédictions, ça donnait 921 > 500 → BLOQUAGE.
 *    Cette estimation était complètement fausse (1 prédiction ≠ 1 appel API).
 * 
 * 💡 SOLUTION v2: Utiliser les headers HTTP réels de l'API:
 *    - x-requests-remaining: crédits restants ce mois
 *    - x-requests-used: crédits utilisés ce mois
 *    Plus besoin de Supabase pour le quota. Track en mémoire + cache 15 min.
 * 
 * 📊 CONSOMMATION RÉELLE (juillet 2026):
 *    - combinedDataService: 1 appel/jour (basket Summer League)
 *    - tennis live-data-service: 0-3 appels (NON croné, manuel uniquement)
 *    - Total réel: ~1-2/jour → ~30-60/mois (très loin des 500)
 * 
 * UTILISATION:
 *   import { fetchOdds } from '@/lib/centralOddsManager';
 *   const data = await fetchOdds('basketball_nba_summer_league');
 */

// ============================================
// CONFIGURATION
// ============================================

const ODDS_API_KEY = process.env.THE_ODDS_API_KEY || process.env.ODDS_API_KEY;

const MONTHLY_QUOTA = 500;
const DAILY_BUDGET = 5; // Conservateur: on utilise ~1-2/jour réellement

// Cache mémoire (évite appels répétés dans la même invocation serverless)
let memoryCache: Record<string, { data: any[]; timestamp: number }> = {};
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// État réel du quota (mis à jour depuis les headers HTTP)
let quotaState: {
  remaining: number;
  used: number;
  lastCheck: number;
  dayCalls: number;
  todayDate: string;
} = {
  remaining: MONTHLY_QUOTA, // Pessimiste par défaut
  used: 0,
  lastCheck: 0,
  dayCalls: 0,
  todayDate: '',
};

// ============================================
// FONCTIONS INTERNES
// ============================================

/** Reset quotidien */
function checkDailyReset(): void {
  const today = new Date().toISOString().split('T')[0];
  if (quotaState.todayDate !== today) {
    quotaState.dayCalls = 0;
    quotaState.todayDate = today;
  }
}

/** Met à jour le quota depuis les headers de réponse HTTP */
function updateQuotaFromHeaders(headers: Headers): void {
  const remaining = headers.get('x-requests-remaining');
  const used = headers.get('x-requests-used');
  
  if (remaining !== null) {
    quotaState.remaining = parseInt(remaining, 10) || 0;
  }
  if (used !== null) {
    quotaState.used = parseInt(used, 10) || 0;
  }
  quotaState.lastCheck = Date.now();
  
  console.log(`[CentralOdds] 📊 Quota réel: ${quotaState.used} utilisés, ${quotaState.remaining} restants/${MONTHLY_QUOTA}`);
}

/** Vérifier si on peut faire un appel */
function canMakeCall(): { allowed: boolean; reason: string } {
  checkDailyReset();
  
  // Quota mensuel basé sur le header réel
  if (quotaState.remaining <= 0 && quotaState.lastCheck > 0) {
    return { allowed: false, reason: `Quota mensuel épuisé (0 restant)` };
  }
  
  // Budget quotidien (sécurité)
  if (quotaState.dayCalls >= DAILY_BUDGET) {
    return { allowed: false, reason: `Budget quotidien atteint (${quotaState.dayCalls}/${DAILY_BUDGET})` };
  }
  
  // Marge de sécurité mensuelle (bloquer à < 20 restants)
  if (quotaState.remaining < 20 && quotaState.lastCheck > 0) {
    return { allowed: false, reason: `Quota mensuel faible (${quotaState.remaining} restants)` };
  }
  
  return { allowed: true, reason: 'OK' };
}

// ============================================
// API PUBLIQUE
// ============================================

/**
 * Récupère les cotes depuis The Odds API avec gestion de quota
 * @param sportKey - ex: 'basketball_nba_summer_league', 'tennis_atp_wimbledon'
 * @returns Tableau d'événements avec cotes, ou tableau vide si quota épuisé
 */
export async function fetchOdds(sportKey: string): Promise<any[]> {
  // 1. Pas de clé API → rien
  if (!ODDS_API_KEY) {
    console.log('[CentralOdds] ⚠️ Pas de clé THE_ODDS_API_KEY');
    return [];
  }
  
  // 2. Vérifier le quota
  const { allowed, reason } = canMakeCall();
  if (!allowed) {
    console.log(`[CentralOdds] ⏳ ${reason}`);
    return [];
  }
  
  // 3. Vérifier le cache mémoire
  const cached = memoryCache[sportKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[CentralOdds] 📦 Cache HIT pour ${sportKey} (${Math.round((Date.now() - cached.timestamp) / 1000)}s)`);
    return cached.data;
  }
  
  // 4. Appeler l'API
  console.log(`[CentralOdds] 🌐 Appel API pour ${sportKey} (jour=${quotaState.dayCalls + 1}/${DAILY_BUDGET})`);
  
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });
    
    // 📊 Mettre à jour le quota depuis les headers (MÊME si erreur)
    updateQuotaFromHeaders(response.headers);
    
    if (!response.ok) {
      console.log(`[CentralOdds] ❌ Erreur: HTTP ${response.status}`);
      if (response.status === 429) {
        quotaState.remaining = 0;
      }
      return [];
    }
    
    const data = await response.json();
    quotaState.dayCalls++;
    
    // 5. Mettre en cache
    memoryCache[sportKey] = { data, timestamp: Date.now() };
    
    console.log(`[CentralOdds] ✅ ${Array.isArray(data) ? data.length : 0} événements pour ${sportKey}`);
    return Array.isArray(data) ? data : [];
    
  } catch (error: any) {
    console.error(`[CentralOdds] ❌ Erreur: ${error.message}`);
    return [];
  }
}

/**
 * Récupère les cotes pour plusieurs sports en un minimum d'appels
 * @param sportKeys - liste de clés sport
 * @param maxCalls - max d'appels API (défaut 3)
 */
export async function fetchMultipleOdds(sportKeys: string[], maxCalls: number = 3): Promise<Record<string, any[]>> {
  const results: Record<string, any[]> = {};
  
  for (const sportKey of sportKeys.slice(0, maxCalls)) {
    const { allowed, reason } = canMakeCall();
    if (!allowed) {
      console.log(`[CentralOdds] ⏳ Stop: ${reason}`);
      break;
    }
    
    results[sportKey] = await fetchOdds(sportKey);
  }
  
  return results;
}

/**
 * Statut du quota (basé sur les headers HTTP réels)
 */
export function getQuotaStatus() {
  checkDailyReset();
  return {
    // Quota réel depuis headers
    monthlyUsed: quotaState.used,
    monthlyRemaining: quotaState.remaining,
    monthlyQuota: MONTHLY_QUOTA,
    lastQuotaCheck: quotaState.lastCheck ? new Date(quotaState.lastCheck).toISOString() : 'never',
    // Quota journalier (estimé en mémoire)
    dailyUsed: quotaState.dayCalls,
    dailyBudget: DAILY_BUDGET,
    today: quotaState.todayDate,
  };
}

/**
 * Invalide le cache (pour forcer un refresh)
 */
export function invalidateOddsCache(): void {
  memoryCache = {};
  console.log('[CentralOdds] 🔄 Cache invalidé');
}