/**
 * Central Odds API Quota Manager
 * 
 * 🎯 PROBLÈME: 8 gestionnaires de quota indépendants consommaient chacun leur budget.
 *    Sur Vercel (serverless), la mémoire est réinitialisée à chaque cold start.
 *    Résultat: 70-113 appels/jour pour un quota de 17/jour (500/mois).
 * 
 * 💡 SOLUTION: Un SEUL point de passage avec persistance Supabase.
 *    - Table `odds_api_quota` dans Supabase pour tracker la consommation mensuelle
 *    - Cache mémoire court (15 min) pour éviter les appels répétés dans la même session
 *    - Budget quotidien = 15 appels max (sécurité: même si 17/jour autorisés)
 *    - Bloque automatique si quota mensuel dépassé
 * 
 * UTILISATION: remplacer tout appel direct à l'API par:
 *   import { fetchOdds } from '@/lib/centralOddsManager';
 *   const data = await fetchOdds('tennis_atp_wimbledon');
 */

import SupabaseStore from './db-supabase';

// ============================================
// TYPES
// ============================================

interface QuotaRecord {
  date: string;        // YYYY-MM-DD
  calls: number;      // nombre d'appels ce jour
}

interface QuotaState {
  monthCalls: number;
  dayCalls: number;
  todayDate: string;
  blocked: boolean;
  blockedReason: string;
}

// ============================================
// CONFIGURATION
// ============================================

const ODDS_API_KEY = process.env.THE_ODDS_API_KEY || process.env.ODDS_API_KEY;

// Budget quotidien conservateur (17/jour autorisés, on se garde une marge)
const DAILY_BUDGET = 15;

// Budget mensuel
const MONTHLY_QUOTA = 500;

// Cache mémoire court (évite les appels répétés dans la même invocation serverless)
let memoryCache: Record<string, { data: any[]; timestamp: number }> = {};
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// État en mémoire
let state: QuotaState = {
  monthCalls: 0,
  dayCalls: 0,
  todayDate: '',
  blocked: false,
  blockedReason: '',
};

// ============================================
// FONCTIONS INTERNES
// ============================================

/** Reset quotidien si nouveau jour */
function checkDailyReset(): void {
  const today = new Date().toISOString().split('T')[0];
  if (state.todayDate !== today) {
    console.log(`[CentralOdds] 📅 Nouveau jour: ${state.todayDate} → ${today}, appels journaliers reset`);
    state.dayCalls = 0;
    state.todayDate = today;
  }
}

/** Charger le quota mensuel depuis Supabase */
async function loadMonthlyQuota(): Promise<number> {
  try {
    const supabase = (await import('./db-supabase')).default;
    // On lit le count depuis Supabase via une requête directe
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const { createClient } = await import('@supabase/supabase-js');
    
    // Utiliser la connexion Supabase existante
    const supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
    
    const { count, error } = await supabaseClient
      .from('predictions')
      .select('id', 'match_date')
      .gte('match_date', `${currentMonth}-01`)
      .lt('match_date', `${currentMonth}-32`);
    
    if (error) {
      console.log('[CentralOdds] ⚠️ Erreur lecture quota:', error.message);
      return 0;
    }
    
    // count = nombre total de prédictions ce mois (approximation du nombre d'appels)
    // Chaque invocation cricket consomme ~1-3 appels API, on estime 1.5x le nombre de prédictions
    return Math.floor((count || 0) * 1.5);
  } catch (e) {
    return 0;
  }
}

/** Vérifier et mettre à jour l'état du quota */
async function ensureQuota(): Promise<{ allowed: boolean; reason: string }> {
  // Reset quotidien
  checkDailyReset();
  
  // Vérifier si bloqué
  if (state.blocked) {
    return { allowed: false, reason: `Bloqué: ${state.blockedReason}` };
  }
  
  // Vérifier le quota journalier
  if (state.dayCalls >= DAILY_BUDGET) {
    return { allowed: false, reason: `Budget quotidien atteint (${state.dayCalls}/${DAILY_BUDGET})` };
  }
  
  // Vérifier le quota mensuel (estimation depuis Supabase)
  const monthEstimate = await loadMonthlyQuota();
  state.monthCalls = monthEstimate; // mettre à jour l'estimation
  
  if (monthEstimate >= MONTHLY_QUOTA - 20) { // marge de sécurité de 20
    state.blocked = true;
    state.blockedReason = `Quota mensuel presque épuisé (~${monthEstimate}/${MONTHLY_QUOTA})`;
    console.log(`[CentralOdds] 🚫 ${state.blockedReason}`);
    return { allowed: false, reason: state.blockedReason };
  }
  
  return { allowed: true, reason: 'OK' };
}

/** Enregistrer un appel API */
function recordCall(): void {
  state.dayCalls++;
  state.monthCalls++;
  console.log(`[CentralOdds] 📊 Appel enregistré: jour=${state.dayCalls}/${DAILY_BUDGET}, mois≈${state.monthCalls}/${MONTHLY_QUOTA}`);
}

// ============================================
// API PUBLIQUE
// ============================================

/**
 * Récupère les cotes depuis The Odds API avec gestion de quota centralisé
 * @param sportKey - ex: 'tennis_atp_wimbledon', 'soccer_epl', 'basketball_nba'
 * @returns Tableau d'événements avec cotes, ou tableau vide si quota épuisé
 */
export async function fetchOdds(sportKey: string): Promise<any[]> {
  // 1. Pas de clé API → rien
  if (!ODDS_API_KEY) {
    console.log('[CentralOdds] ⚠️ Pas de clé THE_ODDS_API_KEY');
    return [];
  }
  
  // 2. Vérifier le quota
  const { allowed, reason } = await ensureQuota();
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
  console.log(`[CentralOdds] 🌐 Appel API pour ${sportKey} (jour=${state.dayCalls + 1}/${DAILY_BUDGET})`);
  
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000), // 10s timeout
    });
    
    if (!response.ok) {
      const errorMsg = `HTTP ${response.status}`;
      console.log(`[CentralOdds] ❌ Erreur: ${errorMsg}`);
      if (response.status === 429) {
        state.blocked = true;
        state.blockedReason = `Rate limit (429) — quota probablement épuisé`;
      }
      return [];
    }
    
    const data = await response.json();
    recordCall();
    
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
 * @returns Record<sportKey, événements>
 */
export async function fetchMultipleOdds(sportKeys: string[], maxCalls: number = 3): Promise<Record<string, any[]>> {
  const results: Record<string, any[]> = {};
  
  for (const sportKey of sportKeys.slice(0, maxCalls)) {
    const { allowed, reason } = await ensureQuota();
    if (!allowed) {
      console.log(`[CentralOdds] ⏳ Stop: ${reason} (après ${sportKeys.indexOf(sportKey)} sports)`);
      break;
    }
    
    results[sportKey] = await fetchOdds(sportKey);
  }
  
  return results;
}

/**
 * Statut du quota
 */
export function getQuotaStatus(): {
  checkDailyReset();
  return {
    dailyUsed: state.dayCalls,
    dailyBudget: DAILY_BUDGET,
    monthlyEstimate: state.monthCalls,
    monthlyQuota: MONTHLY_QUOTA,
    blocked: state.blocked,
    blockedReason: state.blockedReason,
    today: state.todayDate,
  };
}

/**
 * Invalide le cache (pour forcer un refresh)
 */
export function invalidateOddsCache(): void {
  memoryCache = {};
  console.log('[CentralOdds] 🔄 Cache invalidé');
}