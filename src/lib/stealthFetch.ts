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
// PROFILS NAVIGATEUR — UA + Client Hints COHÉRENTS
// ============================================
// Règle d'or anti-fingerprinting : les Sec-CH-UA ne sont envoyés QUE
// par les navigateurs Chromium (Chrome/Edge). Un Firefox ou un Safari
// qui enverrait Sec-CH-UA serait une contradiction immédiatement
// détectable par les WAF (Cloudflare, DataDome...). Chaque profil
// regroupe donc un UA et SES client hints à lui (ou aucun).

interface BrowserProfile {
  /** User-Agent complet */
  ua: string;
  /** Sec-CH-UA — UNIQUEMENT pour les navigateurs Chromium. Absent = ne pas envoyer. */
  secChUa?: string;
  /** Sec-CH-UA-Platform (représentation stringifiée: '"Windows"', '"macOS"') */
  secChUaPlatform?: string;
}

const BROWSER_PROFILES: BrowserProfile[] = [
  // Chrome Desktop Windows
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    secChUa: '"Chromium";v="126", "Google Chrome";v="126", "Not.A/Brand";v="99"',
    secChUaPlatform: '"Windows"',
  },
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    secChUa: '"Chromium";v="125", "Google Chrome";v="125", "Not.A/Brand";v="24"',
    secChUaPlatform: '"Windows"',
  },
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    secChUa: '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    secChUaPlatform: '"Windows"',
  },
  // Chrome Desktop Mac
  {
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    secChUa: '"Chromium";v="126", "Google Chrome";v="126", "Not.A/Brand";v="99"',
    secChUaPlatform: '"macOS"',
  },
  {
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    secChUa: '"Chromium";v="125", "Google Chrome";v="125", "Not.A/Brand";v="24"',
    secChUaPlatform: '"macOS"',
  },
  // Edge Windows (Chromium — client hints à la marque Edge)
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
    secChUa: '"Microsoft Edge";v="126", "Chromium";v="126", "Not.A/Brand";v="99"',
    secChUaPlatform: '"Windows"',
  },
  // Firefox Windows/Mac — N'envoie AUCUN client hint (navigator.userAgentData inexistant)
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0' },
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0' },
  // Safari Mac — N'envoie AUCUN client hint
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15' },
];

// Accept-Language rotatifs
const ACCEPT_LANGUAGES = [
  'en-US,en;q=0.9',
  'en-GB,en;q=0.9,en-US;q=0.8',
  'fr-FR,fr;q=0.9,en-US;q=0.8',
  'de-DE,de;q=0.9,en-US;q=0.8',
  'es-ES,es;q=0.9,en-US;q=0.8',
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
};

const DEFAULT_RATE_LIMIT = 500; // 500ms par défaut entre requêtes

const MAX_ERRORS_BEFORE_BLOCK = 5;
// Cooldown avec jitter (8-14 min) pour ne pas dessiner un pattern d'attente fixe
const BLOCK_DURATION_MIN_MS = 8 * 60 * 1000;
const BLOCK_DURATION_MAX_MS = 14 * 60 * 1000;

/**
 * Statuts = signal de blocage WAF/anti-bot (Cloudflare & co).
 * 403 : challenge/refus, 406 : not acceptable (fingerprint rejeté),
 * 412 : precondition failed (challenge Cloudflare), 418 : teapot (blocage ironique).
 * On n'insiste JAMAIS sur ces statuts : réessayer durcit le profil de bannissement.
 */
const WAF_STATUSES = new Set([403, 406, 412, 418]);
/** Poids des statuts WAF dans le disjoncteur (2×) — 3 challenges suffisent à l'ouvrir */
const WAF_ERROR_WEIGHT = 2;

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

/**
 * Circuit breaker — vérification SYSTÉMATIQUE (indépendante du rate limit).
 * OUVERT → échec IMMÉDIAT. (On ne "dort" plus le cooldown : un sleep de
 * plusieurs minutes est impossible dans une function serverless et mettrait
 * en file des requêtes qui durciraient le ban à la réouverture.)
 * L'appelant applique son fallback : cache, estimation, source secondaire.
 */
function checkCircuitBreaker(domain: string): void {
  const state = domainStates.get(domain);
  if (state && state.blockedUntil > Date.now()) {
    const remainingSec = Math.ceil((state.blockedUntil - Date.now()) / 1000);
    throw new Error(
      `stealthFetch: circuit breaker OUVERT pour ${domain} (cooldown ${remainingSec}s restant)`
    );
  }
}

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
}

function updateDomainState(domain: string, isError: boolean, weight: number = 1): void {
  let state = domainStates.get(domain);
  if (!state) {
    state = { lastRequest: 0, errorCount: 0, blockedUntil: 0, totalRequests: 0 };
    domainStates.set(domain, state);
  }

  state.lastRequest = Date.now();
  state.totalRequests++;

  if (isError) {
    state.errorCount += weight;
    if (state.errorCount >= MAX_ERRORS_BEFORE_BLOCK) {
      state.blockedUntil =
        Date.now() +
        BLOCK_DURATION_MIN_MS +
        Math.floor(Math.random() * (BLOCK_DURATION_MAX_MS - BLOCK_DURATION_MIN_MS));
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

function buildStealthHeaders(domain: string, profile: BrowserProfile): Record<string, string> {
  const isApi = domain.startsWith('api.') || domain.includes('supabase');

  if (isApi) {
    // Pour les API : headers minimal mais crédible (pas de headers de navigateur)
    return {
      'User-Agent': profile.ua,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'X-Request-Id': crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
  }

  // Pour les sites web / endpoints publics : headers navigateur complets,
  // TOUS issus du MÊME profil (UA ↔ client hints cohérents).
  const headers: Record<string, string> = {
    'User-Agent': profile.ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': getRandomItem(ACCEPT_LANGUAGES),
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };

  // Client hints UNIQUEMENT si le profil en a (Chromium).
  // Firefox/Safari n'en envoient pas : en injecter serait un signal de bot immédiat.
  if (profile.secChUa) {
    headers['Sec-Ch-Ua'] = profile.secChUa;
    headers['Sec-Ch-Ua-Mobile'] = '?0';
    headers['Sec-Ch-Ua-Platform'] = profile.secChUaPlatform || '"Windows"';
  }

  return headers;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// SILENT RETRY — Retry exponentiel sans logs
// ============================================

/**
 * Erreur levée quand un statut retryable (429/5xx) persiste après tous les retries.
 * Le statut est déjà compté dans le disjoncteur — ne pas re-compter au rattrapage.
 */
export class StealthStatusError extends Error {
  constructor(public readonly status: number, url: string) {
    super(`stealthFetch: HTTP ${status} après épuisement des retries (${url.slice(0, 100)})`);
    this.name = 'StealthStatusError';
  }
}

async function silentRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 2,
  domain: string = ''
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      const status = response.status;

      if (status === 429) {
        // Rate limited — backoff exponentiel + erreur disjoncteur
        updateDomainState(domain, true);
        if (attempt < maxRetries) {
          const backoff = jitter(Math.pow(2, attempt) * 2000); // 2s, 4s, 8s
          await sleep(backoff);
          continue;
        }
        throw new StealthStatusError(status, url);
      }

      if (WAF_STATUSES.has(status)) {
        // Challenge WAF (403/406/412/418) — erreur pondérée, AUCUN retry.
        // Insister sur un challenge durcit le profil de bannissement de l'IP.
        // On retourne la réponse : l'appelant applique son fallback.
        updateDomainState(domain, true, WAF_ERROR_WEIGHT);
        return response;
      }

      if (status >= 500) {
        // Server error — retry avec backoff + erreur disjoncteur
        // (un 503 peut être un challenge Cloudflare : il DOIT compter)
        updateDomainState(domain, true);
        if (attempt < maxRetries) {
          const backoff = jitter(Math.pow(2, attempt) * 1000); // 1s, 2s, 4s
          await sleep(backoff);
          continue;
        }
        throw new StealthStatusError(status, url);
      }

      updateDomainState(domain, false);
      return response;
    } catch (err) {
      if (err instanceof StealthStatusError) throw err; // déjà compté ci-dessus
      // Erreur réseau (DNS, timeout, connexion) — erreur disjoncteur
      updateDomainState(domain, true);
      if (attempt < maxRetries) {
        const backoff = jitter(Math.pow(2, attempt) * 1500);
        await sleep(backoff);
      } else {
        throw err;
      }
    }
  }

  // Inatteignable en théorie (le dernier attempt throw dans le catch)
  throw new Error(`stealthFetch: échec après ${maxRetries + 1} tentatives (${url.slice(0, 100)})`);
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
 * - Profils navigateur cohérents (UA ↔ Sec-CH-UA ↔ Platform, jamais mélangés)
 * - Headers réalistes selon le type de cible (API vs site web)
 * - Rate limiting par domaine avec jitter
 * - Circuit breaker : 403/406/412/418 (WAF, poids 2×), 429, 5xx, erreurs réseau
 *   → cooldown 8-14 min par domaine, échec IMMÉDIAT pendant le cooldown (fast-fail,
 *   jamais de sleep de plusieurs minutes en serverless)
 * - Retry exponentiel silencieux (JAMAIS de retry sur un challenge WAF)
 * - Aucun log visible en production
 * 
 * @param url - URL cible
 * @param options - Options fetch standard + options stealth
 * @returns Response (peut lever : StealthStatusError, erreur réseau, circuit breaker ouvert)
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

  // Circuit breaker — TOUJOURS vérifié, même avec bypassRateLimit (le bypass
  // ne concerne que le délai de politesse, jamais la protection du domaine)
  checkCircuitBreaker(domain);

  // Rate limiting — délai de politesse (peut être bypassé à la demande)
  if (!bypassRateLimit) {
    await waitForRateLimit(domain);
  }

  // Construire les headers stealth + custom — UN SEUL profil cohérent par requête
  // (UA, client hints et platform du même navigateur, jamais mélangés)
  const profile = getRandomItem(BROWSER_PROFILES);
  const stealthHeaders = buildStealthHeaders(domain, profile);
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
