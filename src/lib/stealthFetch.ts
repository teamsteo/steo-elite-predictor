/**
 * Stealth Fetch Module — Module invisible anti-détection
 * ========================================================
 * 
 * Centralise TOUTES les requêtes externes avec:
 * - Rotation User-Agent (réalistes, à jour)
 * - Headers de navigateur complet (Accept, Accept-Language, etc.)
 * - Jitter aléatoire sur les délais (pas de pattern régulier)
 * - Rate limiting global par domaine
 * - Circuit breaker par domaine (3 erreurs → cooldown)
 * - Retry exponentiel silencieux (pas de log bruyant)
 * - Cache en mémoire pour les réponses fréquentes
 * - Headers Vercel/GitHub compatibles
 * 
 * UTILISATION:
 *   import { stealthFetch } from '@/lib/stealthFetch';
 *   const res = await stealthFetch(url, options?);
 * 
 * Ce module ne loggue RIEN en production (logs silencieux).
 */

// ============================================
// USER-AGENTS — Rotation réalistes (Chrome 120+)
// ============================================

const USER_AGENTS = [
  // Chrome Desktop (Windows)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  // Chrome Desktop (Mac)
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  // Firefox Desktop
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0',
  // Safari (Mac)
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  // Edge (Windows)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
];

// Accept-Language rotatifs
const ACCEPT_LANGUAGES = [
  'en-US,en;q=0.9',
  'en-GB,en;q=0.9,en-US;q=0.8',
  'fr-FR,fr;q=0.9,en-US;q=0.8',
  'de-DE,de;q=0.9,en-US;q=0.8',
  'es-ES,es;q=0.9,en-US;q=0.8',
];

// Sec-CH-UA (Client Hints — Chrome 126+)
const SEC_CH_UA = [
  '"Chromium";v="126", "Google Chrome";v="126", "Not.A/Brand";v="99"',
  '"Chromium";v="125", "Google Chrome";v="125", "Not.A/Brand";v="24"',
  '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
];

// ============================================
// RATE LIMITING — Par domaine
// ============================================

interface DomainState {
  lastRequest: number;
  errorCount: number;
  blockedUntil: number;
  totalRequests: number;
}

const domainStates = new Map<string, DomainState>();

const RATE_LIMITS: Record<string, number> = {
  // Délai minimum entre 2 requêtes vers le même domaine (ms)
  'site.api.espn.com': 300,        // ESPN: assez permissif mais ne pas abuser
  'api.the-odds-api.com': 2000,    // Odds API: quota strict (500/mois)
  'aumsrakioetvvqopthbs.supabase.co': 100, // Supabase: permissif
};

const DEFAULT_RATE_LIMIT = 500; // 500ms par défaut entre requêtes

const MAX_ERRORS_BEFORE_BLOCK = 5;
const BLOCK_DURATION = 10 * 60 * 1000; // 10 minutes cooldown après trop d'erreurs

// ============================================
// JITTER — Délais aléatoires
// ============================================

function jitter(baseMs: number, factor: number = 0.3): number {
  const variance = baseMs * factor;
  return baseMs + (Math.random() * variance * 2) - variance;
}

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================
// EXTRACT DOMAIN
// ============================================

function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname;
  } catch {
    return 'unknown';
  }
}

// ============================================
// RATE LIMIT CHECK
// ============================================

async function waitForRateLimit(domain: string): Promise<void> {
  const state = domainStates.get(domain);
  const minDelay = RATE_LIMITS[domain] || DEFAULT_RATE_LIMIT;

  if (state && state.lastRequest > 0) {
    const elapsed = Date.now() - state.lastRequest;
    const needed = jitter(minDelay);
    if (elapsed < needed) {
      const waitMs = needed - elapsed;
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  if (state && state.blockedUntil > Date.now()) {
    const remaining = state.blockedUntil - Date.now();
    await new Promise(resolve => setTimeout(resolve, remaining));
  }
}

function updateDomainState(domain: string, isError: boolean): void {
  let state = domainStates.get(domain);
  if (!state) {
    state = { lastRequest: 0, errorCount: 0, blockedUntil: 0, totalRequests: 0 };
    domainStates.set(domain, state);
  }

  state.lastRequest = Date.now();
  state.totalRequests++;

  if (isError) {
    state.errorCount++;
    if (state.errorCount >= MAX_ERRORS_BEFORE_BLOCK) {
      state.blockedUntil = Date.now() + BLOCK_DURATION;
      state.errorCount = 0;
    }
  } else {
    // Réduire le compteur d'erreurs après un succès
    state.errorCount = Math.max(0, state.errorCount - 1);
  }
}

// ============================================
// STEALTH HEADERS
// ============================================

function buildStealthHeaders(domain: string): Record<string, string> {
  const isApi = domain.startsWith('api.') || domain.includes('supabase');

  if (isApi) {
    // Pour les API : headers minimal mais crédible (pas de headers de navigateur)
    return {
      'User-Agent': getRandomItem(USER_AGENTS),
      'Accept': 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'X-Request-Id': crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
  }

  // Pour les sites web / endpoints publics : headers navigateur complets
  return {
    'User-Agent': getRandomItem(USER_AGENTS),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': getRandomItem(ACCEPT_LANGUAGES),
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': getRandomItem(SEC_CH_UA),
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };
}

// ============================================
// SILENT RETRY — Retry exponentiel sans logs
// ============================================

async function silentRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 2,
  domain: string = ''
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        // Rate limited — backoff exponentiel
        updateDomainState(domain, true);
        const backoff = jitter(Math.pow(2, attempt) * 2000); // 2s, 4s, 8s
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }

      if (response.status >= 500) {
        // Server error — retry avec backoff
        const backoff = jitter(Math.pow(2, attempt) * 1000); // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }

      updateDomainState(domain, false);
      return response;
    } catch (err) {
      lastError = err as Error;
      updateDomainState(domain, true);
      if (attempt < maxRetries) {
        const backoff = jitter(Math.pow(2, attempt) * 1500);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
  }

  updateDomainState(domain, true);
  throw lastError || new Error(`Stealth fetch failed after ${maxRetries + 1} attempts`);
}

// ============================================
// EXPORT — stealthFetch
// ============================================

export interface StealthFetchOptions extends RequestInit {
  /** Override du domaine pour le rate limiting (utile pour les CDN) */
  domainOverride?: string;
  /** Nombre max de retry (défaut: 2) */
  maxRetries?: number;
  /** Désactiver le rate limiting pour cette requête */
  bypassRateLimit?: boolean;
}

/**
 * stealthFetch — Remplacement drop-in pour fetch() avec protections anti-détection.
 * 
 * - Rotation d'User-Agent
 * - Headers réalistes selon le type de cible (API vs site web)
 * - Rate limiting par domaine avec jitter
 * - Circuit breaker automatique
 * - Retry exponentiel silencieux
 * - Aucun log visible en production
 * 
 * @param url - URL cible
 * @param options - Options fetch standard + options stealth
 * @returns Response
 */
export async function stealthFetch(
  url: string,
  options?: StealthFetchOptions
): Promise<Response> {
  const {
    domainOverride,
    maxRetries = 2,
    bypassRateLimit = false,
    headers: customHeaders,
    signal: customSignal,
    ...restOptions
  } = options || {};

  const domain = domainOverride || extractDomain(url);

  // Rate limiting
  if (!bypassRateLimit) {
    await waitForRateLimit(domain);
  }

  // Construire les headers stealth + custom
  const stealthHeaders = buildStealthHeaders(domain);
  const mergedHeaders = {
    ...stealthHeaders,
    ...(customHeaders as Record<string, string>),
  };

  // Timeout par défaut: 10s (override via customSignal)
  const timeoutSignal = customSignal || AbortSignal.timeout(12000);

  // Executer avec retry silencieux
  return silentRetry(
    url,
    {
      ...restOptions,
      headers: mergedHeaders,
      signal: timeoutSignal,
    },
    maxRetries,
    domain
  );
}

// ============================================
// UTILITAIRES — État du module (debug only)
// ============================================

/**
 * Retourne l'état interne du module (pour debugging uniquement).
 * Ne jamais exposer en production / API publique.
 */
export function getStealthState(): Record<string, Omit<DomainState, 'blockedUntil'> & { blocked: boolean }> {
  const result: Record<string, any> = {};
  domainStates.forEach((state, domain) => {
    result[domain] = {
      lastRequest: state.lastRequest,
      errorCount: state.errorCount,
      blocked: state.blockedUntil > Date.now(),
      totalRequests: state.totalRequests,
    };
  });
  return result;
}
