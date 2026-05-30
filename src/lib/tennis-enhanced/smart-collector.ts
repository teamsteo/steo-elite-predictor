/**
 * Tennis Smart Collector - Collecte intelligente avec protection anti-ban
 * 
 * Stratégies anti-ban:
 * 1. Rotation des User-Agents
 * 2. Délais aléatoires entre requêtes
 * 3. Rate limiting adaptatif
 * 4. Cache intelligent avec TTL
 * 5. Fallback multi-sources
 * 6. Circuit breaker
 */

// ============================================
// TYPES & INTERFACES
// ============================================

export interface TennisMatch {
  id: string;
  player1: string;
  player2: string;
  player1Id: string;
  player2Id: string;
  tournament: string;
  tournamentId: string;
  tournamentTier: TournamentTier;
  surface: Surface;
  round: string;
  date: Date;
  odds1: number;
  odds2: number;
  bookmaker: string;
  category: Category;
  status: MatchStatus;
}

export interface PlayerData {
  id: string;
  name: string;
  country: string;
  ranking: number;
  rankingPoints: number;
  surfaceStats: SurfaceStats;
  recentForm: RecentForm;
  tournamentHistory: Map<string, TournamentPerformance>;
}

export interface SurfaceStats {
  hard: PerformanceRecord;
  clay: PerformanceRecord;
  grass: PerformanceRecord;
  indoor: PerformanceRecord;
}

export interface PerformanceRecord {
  wins: number;
  losses: number;
  winRate: number;
  recentWins: number;
  recentLosses: number;
}

export interface RecentForm {
  wins: number;
  losses: number;
  winStreak: number;
  last10: ('W' | 'L')[];
  lastMatchDate: Date | null;
}

export interface TournamentPerformance {
  tournamentId: string;
  bestResult: string;
  appearances: number;
  winLoss: { wins: number; losses: number };
}

export type TournamentTier = 
  | 'grand_slam'
  | 'masters_1000'
  | 'atp_500'
  | 'atp_250'
  | 'wta_1000'
  | 'wta_500'
  | 'wta_250'
  | 'challenger_175'
  | 'challenger_125'
  | 'challenger_100'
  | 'challenger_75'
  | 'challenger_50'
  | 'itf'
  | 'unknown';

export type Surface = 'hard' | 'clay' | 'grass' | 'indoor';
export type Category = 'atp' | 'wta' | 'challenger' | 'itf';
export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';

// ============================================
// CONFIGURATION ANTI-BAN
// ============================================

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
];

const RATE_LIMITS = {
  betexplorer: { requestsPerMinute: 10, minDelayMs: 2000, maxDelayMs: 5000 },
  oddsportal: { requestsPerMinute: 8, minDelayMs: 3000, maxDelayMs: 7000 },
  flashscore: { requestsPerMinute: 15, minDelayMs: 1500, maxDelayMs: 4000 },
  atptour: { requestsPerMinute: 20, minDelayMs: 1000, maxDelayMs: 3000 },
  wtatennis: { requestsPerMinute: 20, minDelayMs: 1000, maxDelayMs: 3000 },
};

// Cache avec TTL variable selon le type de données
const CACHE_TTL = {
  rankings: 6 * 60 * 60 * 1000,      // 6 heures
  matches: 30 * 60 * 1000,           // 30 minutes
  odds: 2 * 60 * 1000,               // 2 minutes
  playerStats: 24 * 60 * 60 * 1000, // 24 heures
  tournamentInfo: 7 * 24 * 60 * 60 * 1000, // 7 jours
};

// ============================================
// CIRCUIT BREAKER
// ============================================

interface CircuitState {
  status: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailure: Date | null;
  nextRetry: Date | null;
}

const circuitBreakers = new Map<string, CircuitState>();

function getCircuitBreaker(source: string): CircuitState {
  if (!circuitBreakers.has(source)) {
    circuitBreakers.set(source, {
      status: 'closed',
      failures: 0,
      lastFailure: null,
      nextRetry: null,
    });
  }
  return circuitBreakers.get(source)!;
}

function recordSuccess(source: string): void {
  const cb = getCircuitBreaker(source);
  cb.failures = 0;
  cb.status = 'closed';
}

function recordFailure(source: string): void {
  const cb = getCircuitBreaker(source);
  cb.failures++;
  cb.lastFailure = new Date();
  
  if (cb.failures >= 3) {
    cb.status = 'open';
    cb.nextRetry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
  }
}

function canMakeRequest(source: string): boolean {
  const cb = getCircuitBreaker(source);
  
  if (cb.status === 'closed') return true;
  if (cb.status === 'open') {
    if (cb.nextRetry && new Date() >= cb.nextRetry) {
      cb.status = 'half-open';
      return true;
    }
    return false;
  }
  // half-open: autoriser une requête de test
  return true;
}

// ============================================
// CACHE INTELLIGENT
// ============================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  source: string;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  
  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key);
    return null;
  }
  
  return entry.data as T;
}

function setCache<T>(key: string, data: T, ttl: number, source: string): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl,
    source,
  });
}

// ============================================
// RATE LIMITER ADAPTATIF
// ============================================

const requestHistory = new Map<string, number[]>();

async function waitForRateLimit(source: string): Promise<void> {
  const config = RATE_LIMITS[source as keyof typeof RATE_LIMITS];
  if (!config) return;
  
  const now = Date.now();
  const history = requestHistory.get(source) || [];
  
  // Nettoyer les anciennes requêtes
  const recentRequests = history.filter(t => now - t < 60000);
  
  if (recentRequests.length >= config.requestsPerMinute) {
    const oldestRequest = Math.min(...recentRequests);
    const waitTime = 60000 - (now - oldestRequest) + 100;
    await sleep(waitTime);
  }
  
  // Délai aléatoire entre requêtes
  const randomDelay = config.minDelayMs + 
    Math.random() * (config.maxDelayMs - config.minDelayMs);
  await sleep(randomDelay);
  
  // Enregistrer cette requête
  recentRequests.push(Date.now());
  requestHistory.set(source, recentRequests);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// FETCH PROTÉGÉ
// ============================================

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function safeFetch(
  url: string,
  source: string,
  options: RequestInit = {}
): Promise<Response | null> {
  // Vérifier circuit breaker
  if (!canMakeRequest(source)) {
    console.log(`[SmartCollector] Circuit breaker OPEN pour ${source}`);
    return null;
  }
  
  // Vérifier le cache
  const cacheKey = `${source}_${url}`;
  const cached = getCached<Response>(cacheKey);
  if (cached) {
    console.log(`[SmartCollector] Cache HIT pour ${source}`);
    return cached;
  }
  
  // Attendre le rate limit
  await waitForRateLimit(source);
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
        ...options.headers,
      },
    });
    
    if (response.ok) {
      recordSuccess(source);
      // Ne pas mettre en cache les réponses HTML complètes (trop volumineuses)
      // setCache(cacheKey, response.clone(), CACHE_TTL.matches, source);
      return response;
    } else if (response.status === 429) {
      console.log(`[SmartCollector] Rate limited par ${source} (429)`);
      recordFailure(source);
      return null;
    } else if (response.status === 403) {
      console.log(`[SmartCollector] Bloqué par ${source} (403)`);
      recordFailure(source);
      return null;
    }
    
    return response;
  } catch (error) {
    console.error(`[SmartCollector] Erreur fetch ${source}:`, error);
    recordFailure(source);
    return null;
  }
}

// ============================================
// DÉTECTION IMPORTANCE TOURNOI
// ============================================

const GRAND_SLAMS = [
  'australian-open', 'roland-garros', 'french-open', 'wimbledon', 
  'us-open', 'australia', 'paris', 'london', 'new-york'
];

const MASTERS_1000 = [
  'indian-wells', 'miami', 'monte-carlo', 'madrid', 'rome',
  'canada', 'cincinnati', 'shanghai', 'paris-masters', 'turin'
];

const ATP_500 = [
  'rotterdam', 'rio', 'acapulco', 'dubai', 'barcelona',
  'hamburg', 'washington', 'beijing', 'tokyo', 'vienna', 'basel'
];

const WTA_1000 = [
  'indian-wells', 'miami', 'madrid', 'beijing', 'doha', 'rome',
  'canada', 'cincinnati', 'wuhan'
];

export function detectTournamentTier(
  tournamentSlug: string,
  category: Category
): TournamentTier {
  const slug = tournamentSlug.toLowerCase();
  
  // Grand Chelems
  if (GRAND_SLAMS.some(gs => slug.includes(gs))) {
    return 'grand_slam';
  }
  
  // ATP
  if (category === 'atp') {
    if (MASTERS_1000.some(m => slug.includes(m))) return 'masters_1000';
    if (ATP_500.some(m => slug.includes(m))) return 'atp_500';
    return 'atp_250';
  }
  
  // WTA
  if (category === 'wta') {
    if (WTA_1000.some(m => slug.includes(m))) return 'wta_1000';
    if (slug.includes('500') || ATP_500.some(m => slug.includes(m))) return 'wta_500';
    return 'wta_250';
  }
  
  // Challenger
  if (category === 'challenger') {
    if (slug.includes('175')) return 'challenger_175';
    if (slug.includes('125')) return 'challenger_125';
    if (slug.includes('100')) return 'challenger_100';
    if (slug.includes('75')) return 'challenger_75';
    if (slug.includes('50')) return 'challenger_50';
    return 'challenger_100'; // Défaut
  }
  
  return 'itf';
}

// Facteur d'importance pour le modèle ML
export function getTournamentImportanceFactor(tier: TournamentTier): number {
  const factors: Record<TournamentTier, number> = {
    'grand_slam': 1.5,      // Plus haute importance
    'masters_1000': 1.35,
    'wta_1000': 1.35,
    'atp_500': 1.20,
    'wta_500': 1.20,
    'atp_250': 1.00,        // Référence
    'wta_250': 1.00,
    'challenger_175': 0.85,
    'challenger_125': 0.75,
    'challenger_100': 0.70,
    'challenger_75': 0.65,
    'challenger_50': 0.60,
    'itf': 0.50,
    'unknown': 0.70,
  };
  return factors[tier] || 1.0;
}

// ============================================
// DÉTECTION SURFACE AMÉLIORÉE
// ============================================

const GRASS_TOURNAMENTS = [
  'wimbledon', 'halle', 'queens', 'queen', 'eastbourne', 
  's-hertogenbosch', 'stuttgart-grass', 'mallorca', 'newport'
];

const CLAY_TOURNAMENTS = [
  'roland-garros', 'french-open', 'monte-carlo', 'barcelona', 
  'rome', 'madrid', 'hamburg', 'rio', 'buenos-aires', 'santiago',
  'estoril', 'geneva', 'lyon', 'gstaad', 'kitzbuhel', 'umag',
  'bastad', 'casablanca', 'houston', 'cap-cana', 'marbella'
];

const INDOOR_TOURNAMENTS = [
  'rotterdam', 'marseille', 'montpellier', 'metz', 'vienna',
  'basel', 'stockholm', 'antwerp', 'paris-masters', 'atp-finals',
  'finals', 'davis-cup', 'cherbourg', 'quimper', 'potchefstroom'
];

export function detectSurfaceImproved(tournamentSlug: string): Surface {
  const slug = tournamentSlug.toLowerCase();
  
  if (GRASS_TOURNAMENTS.some(t => slug.includes(t))) return 'grass';
  if (CLAY_TOURNAMENTS.some(t => slug.includes(t))) return 'clay';
  if (INDOOR_TOURNAMENTS.some(t => slug.includes(t))) return 'indoor';
  
  // Détection par mots-clés
  if (slug.includes('grass') || slug.includes('gazon')) return 'grass';
  if (slug.includes('clay') || slug.includes('terre')) return 'clay';
  if (slug.includes('indoor') || slug.includes('hard-indoor')) return 'indoor';
  
  // Défaut: hard outdoor
  return 'hard';
}

// ============================================
// COLLECTE MULTI-SOURCES
// ============================================

export async function collectMatches(): Promise<TennisMatch[]> {
  const matches: TennisMatch[] = [];
  
  // Source 1: BetExplorer (principal)
  const betExplorerMatches = await collectFromBetExplorer();
  matches.push(...betExplorerMatches);
  
  // Source 2: FlashScore (fallback/complément)
  if (matches.length < 5) {
    const flashScoreMatches = await collectFromFlashScore();
    // Fusionner sans doublons
    for (const match of flashScoreMatches) {
      if (!matches.some(m => isSameMatch(m, match))) {
        matches.push(match);
      }
    }
  }
  
  return matches;
}

async function collectFromBetExplorer(): Promise<TennisMatch[]> {
  const matches: TennisMatch[] = [];
  
  try {
    const response = await safeFetch(
      'https://www.betexplorer.com/tennis/',
      'betexplorer'
    );
    
    if (!response) {
      console.log('[SmartCollector] BetExplorer non disponible');
      return matches;
    }
    
    const html = await response.text();
    
    // Parser le HTML pour extraire les matchs
    // (Parsing simplifié - en production, utiliser cheerio)
    const matchPattern = /href="\/tennis\/([a-z-]+)\/([a-z-]+)\/([a-z-]+)\/([a-zA-Z0-9]+)\/"/g;
    const oddsPattern = /data-odd="(\d+\.?\d*)"/g;
    
    // Extraire les cotes
    const odds: number[] = [];
    let oddsMatch;
    while ((oddsMatch = oddsPattern.exec(html)) !== null) {
      odds.push(parseFloat(oddsMatch[1]));
    }
    
    // Extraire les matchs
    const seenMatches = new Set<string>();
    let matchMatch;
    let oddsIndex = 0;
    
    while ((matchMatch = matchPattern.exec(html)) !== null) {
      const categoryPath = matchMatch[1];
      const tournamentSlug = matchMatch[2];
      const playersSlug = matchMatch[3];
      const matchId = matchMatch[4];
      
      const key = `${categoryPath}_${tournamentSlug}_${matchId}`;
      if (seenMatches.has(key)) continue;
      seenMatches.add(key);
      
      const category = detectCategory(categoryPath);
      const tier = detectTournamentTier(tournamentSlug, category);
      const surface = detectSurfaceImproved(tournamentSlug);
      const { player1, player2 } = parsePlayers(playersSlug);
      
      const odds1 = odds[oddsIndex] || 1.85;
      const odds2 = odds[oddsIndex + 1] || 1.85;
      oddsIndex += 2;
      
      matches.push({
        id: `betexp_${matchId}`,
        player1,
        player2,
        player1Id: generatePlayerId(player1),
        player2Id: generatePlayerId(player2),
        tournament: formatTournamentName(tournamentSlug),
        tournamentId: tournamentSlug,
        tournamentTier: tier,
        surface,
        round: 'Match',
        date: new Date(),
        odds1,
        odds2,
        bookmaker: 'BetExplorer',
        category,
        status: 'scheduled',
      });
    }
    
    console.log(`[SmartCollector] BetExplorer: ${matches.length} matchs collectés`);
    
  } catch (error) {
    console.error('[SmartCollector] Erreur BetExplorer:', error);
  }
  
  return matches;
}

async function collectFromFlashScore(): Promise<TennisMatch[]> {
  // Implémentation similaire avec FlashScore comme source alternative
  // Pour l'instant, retourner un tableau vide
  console.log('[SmartCollector] FlashScore: source non implémentée');
  return [];
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

function detectCategory(path: string): Category {
  if (path.includes('atp')) return 'atp';
  if (path.includes('wta')) return 'wta';
  if (path.includes('challenger')) return 'challenger';
  return 'itf';
}

function parsePlayers(slug: string): { player1: string; player2: string } {
  const parts = slug.split('-');
  const half = Math.floor(parts.length / 2);
  
  const formatName = (nameParts: string[]) => {
    return nameParts
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
  };
  
  return {
    player1: formatName(parts.slice(0, half)),
    player2: formatName(parts.slice(half)),
  };
}

function generatePlayerId(name: string): string {
  return `player_${name.toLowerCase().replace(/[^a-z]/g, '')}`;
}

function formatTournamentName(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function isSameMatch(m1: TennisMatch, m2: TennisMatch): boolean {
  // Comparaison par noms de joueurs et tournoi
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  return (
    normalize(m1.player1) === normalize(m2.player1) &&
    normalize(m1.player2) === normalize(m2.player2) &&
    normalize(m1.tournament) === normalize(m2.tournament)
  );
}

// ============================================
// EXPORTS
// ============================================

export {
  safeFetch,
  getCached,
  setCache,
  canMakeRequest,
  waitForRateLimit,
  CACHE_TTL,
};
