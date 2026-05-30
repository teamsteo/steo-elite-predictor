/**
 * Tennis Smart Collector - Collecte sécurisée avec protection anti-ban RENFORCÉE
 * 
 * ⚠️ STRATÉGIE SÉCURISÉE:
 * 1. Utiliser les APIs officielles en PRIORITÉ (ATP, WTA)
 * 2. Scraping UNIQUEMENT si APIs indisponibles
 * 3. Cache TRÈS long pour minimiser les requêtes
 * 4. Délais plus importants entre requêtes
 * 5. Circuit breaker plus strict
 * 6. Mode "safe" sans scraping possible
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
// CONFIGURATION ANTI-BAN RENFORCÉE
// ============================================

// User-Agents rotatifs (6 différents)
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
];

// Rate limits TRÈS conservateurs
const RATE_LIMITS = {
  // APIs officielles - plus permissif
  atptour: { requestsPerMinute: 15, minDelayMs: 3000, maxDelayMs: 6000 },
  wtatennis: { requestsPerMinute: 15, minDelayMs: 3000, maxDelayMs: 6000 },
  
  // Sources de scraping - TRÈS restrictif
  betexplorer: { requestsPerMinute: 3, minDelayMs: 15000, maxDelayMs: 30000 }, // 3 req/min, 15-30s délai
  oddsportal: { requestsPerMinute: 2, minDelayMs: 20000, maxDelayMs: 40000 },
  flashscore: { requestsPerMinute: 3, minDelayMs: 15000, maxDelayMs: 30000 },
  
  // Autres
  tennisexplorer: { requestsPerMinute: 5, minDelayMs: 10000, maxDelayMs: 20000 },
};

// Cache TRÈS long pour éviter les requêtes
const CACHE_TTL = {
  rankings: 24 * 60 * 60 * 1000,      // 24 heures (au lieu de 6h)
  matches: 60 * 60 * 1000,           // 1 heure (au lieu de 30min)
  odds: 15 * 60 * 1000,              // 15 minutes (au lieu de 2min)
  playerStats: 48 * 60 * 60 * 1000,  // 48 heures (au lieu de 24h)
  tournamentInfo: 7 * 24 * 60 * 60 * 1000, // 7 jours
};

// Configuration du mode de collecte
const COLLECT_MODE = {
  useOfficialApis: true,      // Toujours utiliser les APIs officielles
  allowScraping: false,       // DÉSACTIVER le scraping par défaut (trop risqué)
  fallbackToStatic: true,     // Utiliser des données statiques si nécessaire
};

// ============================================
// CIRCUIT BREAKER STRICT
// ============================================

interface CircuitState {
  status: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailure: Date | null;
  nextRetry: Date | null;
  blockedUntil: Date | null;  // Nouveau: blocage prolongé
}

const circuitBreakers = new Map<string, CircuitState>();

function getCircuitBreaker(source: string): CircuitState {
  if (!circuitBreakers.has(source)) {
    circuitBreakers.set(source, {
      status: 'closed',
      failures: 0,
      lastFailure: null,
      nextRetry: null,
      blockedUntil: null,
    });
  }
  return circuitBreakers.get(source)!;
}

function recordSuccess(source: string): void {
  const cb = getCircuitBreaker(source);
  cb.failures = 0;
  cb.status = 'closed';
  cb.blockedUntil = null;
}

function recordFailure(source: string): void {
  const cb = getCircuitBreaker(source);
  cb.failures++;
  cb.lastFailure = new Date();
  
  // 2 échecs = blocage (plus strict)
  if (cb.failures >= 2) {
    cb.status = 'open';
    // Blocage plus long: 30 minutes au lieu de 5
    cb.nextRetry = new Date(Date.now() + 30 * 60 * 1000);
    cb.blockedUntil = new Date(Date.now() + 60 * 60 * 1000); // 1h de blocage total
    console.warn(`[SmartCollector] ⚠️ Circuit breaker OPEN pour ${source} - Blocage 30min`);
  }
}

function canMakeRequest(source: string): boolean {
  const cb = getCircuitBreaker(source);
  
  // Vérifier le blocage prolongé
  if (cb.blockedUntil && new Date() < cb.blockedUntil) {
    return false;
  }
  
  if (cb.status === 'closed') return true;
  if (cb.status === 'open') {
    if (cb.nextRetry && new Date() >= cb.nextRetry) {
      cb.status = 'half-open';
      return true;
    }
    return false;
  }
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
// RATE LIMITER STRICT
// ============================================

const requestHistory = new Map<string, number[]>();
let globalRequestCount = 0;
let lastGlobalReset = Date.now();

async function waitForRateLimit(source: string): Promise<void> {
  const config = RATE_LIMITS[source as keyof typeof RATE_LIMITS];
  if (!config) return;
  
  const now = Date.now();
  const history = requestHistory.get(source) || [];
  
  // Vérifier limite globale (max 50 req/min toutes sources confondues)
  if (now - lastGlobalReset > 60000) {
    globalRequestCount = 0;
    lastGlobalReset = now;
  }
  
  if (globalRequestCount >= 50) {
    const waitTime = 60000 - (now - lastGlobalReset) + 1000;
    console.log(`[SmartCollector] ⏳ Limite globale atteinte, attente ${Math.round(waitTime/1000)}s`);
    await sleep(waitTime);
  }
  
  // Nettoyer les anciennes requêtes
  const recentRequests = history.filter(t => now - t < 60000);
  
  if (recentRequests.length >= config.requestsPerMinute) {
    const oldestRequest = Math.min(...recentRequests);
    const waitTime = 60000 - (now - oldestRequest) + 5000; // +5s marge
    console.log(`[SmartCollector] ⏳ Rate limit ${source}, attente ${Math.round(waitTime/1000)}s`);
    await sleep(waitTime);
  }
  
  // Délai aléatoire PLUS LONG
  const randomDelay = config.minDelayMs + 
    Math.random() * (config.maxDelayMs - config.minDelayMs);
  
  console.log(`[SmartCollector] ⏱️ Délai ${source}: ${Math.round(randomDelay/1000)}s`);
  await sleep(randomDelay);
  
  // Enregistrer cette requête
  recentRequests.push(Date.now());
  requestHistory.set(source, recentRequests);
  globalRequestCount++;
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
    console.log(`[SmartCollector] 🚫 Circuit breaker OPEN pour ${source}`);
    return null;
  }
  
  // Vérifier si scraping autorisé
  const isScrapingSource = ['betexplorer', 'oddsportal', 'flashscore', 'tennisexplorer'].includes(source);
  if (isScrapingSource && !COLLECT_MODE.allowScraping) {
    console.log(`[SmartCollector] 🚫 Scraping désactivé pour ${source}`);
    return null;
  }
  
  // Attendre le rate limit
  await waitForRateLimit(source);
  
  try {
    console.log(`[SmartCollector] 🌐 Fetch ${source}: ${url.substring(0, 60)}...`);
    
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
      return response;
    } else if (response.status === 429) {
      console.log(`[SmartCollector] 🚫 Rate limited par ${source} (429)`);
      recordFailure(source);
      return null;
    } else if (response.status === 403) {
      console.log(`[SmartCollector] 🚫 Bloqué par ${source} (403) - IP probablement bannie`);
      recordFailure(source);
      // Bloquer cette source plus longtemps
      const cb = getCircuitBreaker(source);
      cb.blockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
      return null;
    }
    
    return response;
  } catch (error) {
    console.error(`[SmartCollector] ❌ Erreur fetch ${source}:`, error);
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
  
  if (GRAND_SLAMS.some(gs => slug.includes(gs))) {
    return 'grand_slam';
  }
  
  if (category === 'atp') {
    if (MASTERS_1000.some(m => slug.includes(m))) return 'masters_1000';
    if (ATP_500.some(m => slug.includes(m))) return 'atp_500';
    return 'atp_250';
  }
  
  if (category === 'wta') {
    if (WTA_1000.some(m => slug.includes(m))) return 'wta_1000';
    if (slug.includes('500') || ATP_500.some(m => slug.includes(m))) return 'wta_500';
    return 'wta_250';
  }
  
  if (category === 'challenger') {
    if (slug.includes('175')) return 'challenger_175';
    if (slug.includes('125')) return 'challenger_125';
    if (slug.includes('100')) return 'challenger_100';
    if (slug.includes('75')) return 'challenger_75';
    if (slug.includes('50')) return 'challenger_50';
    return 'challenger_100';
  }
  
  return 'itf';
}

export function getTournamentImportanceFactor(tier: TournamentTier): number {
  const factors: Record<TournamentTier, number> = {
    'grand_slam': 1.5,
    'masters_1000': 1.35,
    'wta_1000': 1.35,
    'atp_500': 1.20,
    'wta_500': 1.20,
    'atp_250': 1.00,
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
// DÉTECTION SURFACE
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
  
  if (slug.includes('grass') || slug.includes('gazon')) return 'grass';
  if (slug.includes('clay') || slug.includes('terre')) return 'clay';
  if (slug.includes('indoor') || slug.includes('hard-indoor')) return 'indoor';
  
  return 'hard';
}

// ============================================
// COLLECTE PRINCIPALE - MODE SÉCURISÉ
// ============================================

export async function collectMatches(): Promise<TennisMatch[]> {
  console.log('[SmartCollector] 🎾 Début collecte - Mode sécurisé');
  
  // Vérifier le cache d'abord
  const cacheKey = 'tennis_matches_today';
  const cached = getCached<TennisMatch[]>(cacheKey);
  if (cached && cached.length > 0) {
    console.log(`[SmartCollector] ✅ Cache HIT: ${cached.length} matchs`);
    return cached;
  }
  
  const matches: TennisMatch[] = [];
  
  // 1. Essayer les APIs officielles (ATP, WTA)
  if (COLLECT_MODE.useOfficialApis) {
    console.log('[SmartCollector] 📡 Tentative APIs officielles...');
    
    // Les APIs officielles ne nécessitent pas de scraping agressif
    // On utilise des endpoints publics si disponibles
    try {
      const officialMatches = await collectFromOfficialSources();
      matches.push(...officialMatches);
    } catch (error) {
      console.log('[SmartCollector] ⚠️ APIs officielles non disponibles');
    }
  }
  
  // 2. Si pas assez de matchs et scraping autorisé
  if (matches.length < 3 && COLLECT_MODE.allowScraping) {
    console.log('[SmartCollector] 📡 Fallback vers scraping...');
    const scrapedMatches = await collectFromBetExplorer();
    matches.push(...scrapedMatches);
  }
  
  // 3. Si toujours rien, utiliser les données statiques
  if (matches.length === 0 && COLLECT_MODE.fallbackToStatic) {
    console.log('[SmartCollector] 📦 Utilisation données statiques');
    return getStaticMatches();
  }
  
  // Mettre en cache
  if (matches.length > 0) {
    setCache(cacheKey, matches, CACHE_TTL.matches, 'collector');
    console.log(`[SmartCollector] ✅ ${matches.length} matchs collectés et mis en cache`);
  }
  
  return matches;
}

// ============================================
// COLLECTE APIs OFFICIELLES
// ============================================

async function collectFromOfficialSources(): Promise<TennisMatch[]> {
  // Les APIs officielles ATP/WTA nécessitent généralement une clé API
  // Pour l'instant, on retourne les données statiques des classements
  // qui peuvent aider à générer des prédictions de qualité
  
  console.log('[SmartCollector] 📊 Chargement classements officiels...');
  
  // Retourner des matchs basés sur les tournois en cours connus
  return getKnownTournamentMatches();
}

// ============================================
// DONNÉES STATIQUES / TOURNOIS CONNUS
// ============================================

function getKnownTournamentMatches(): TennisMatch[] {
  // Tournois actuels ou à venir basés sur le calendrier
  const now = new Date();
  const month = now.getMonth();
  
  // Exemple: French Open fin mai/début juin
  if (month >= 4 && month <= 5) {
    return generateRolandGarrosMatches();
  }
  
  // Wimbledon fin juin/début juillet
  if (month >= 5 && month <= 6) {
    return generateWimbledonMatches();
  }
  
  // US Open fin août/début septembre
  if (month >= 7 && month <= 8) {
    return generateUSOpenMatches();
  }
  
  // Autres périodes: utiliser des données génériques
  return [];
}

function generateRolandGarrosMatches(): TennisMatch[] {
  // Données fictives pour démonstration
  // En production, ces données viendraient des APIs officielles
  return [];
}

function generateWimbledonMatches(): TennisMatch[] {
  return [];
}

function generateUSOpenMatches(): TennisMatch[] {
  return [];
}

function getStaticMatches(): TennisMatch[] {
  // Données statiques de secours
  // Ces matchs sont des exemples génériques
  console.log('[SmartCollector] 📦 Retour données statiques de secours');
  return [];
}

// ============================================
// COLLECTE BETEXPLORER (SI AUTORISÉ)
// ============================================

async function collectFromBetExplorer(): Promise<TennisMatch[]> {
  const matches: TennisMatch[] = [];
  
  // Vérifier si le scraping est autorisé
  if (!COLLECT_MODE.allowScraping) {
    console.log('[SmartCollector] 🚫 Scraping BetExplorer désactivé');
    return matches;
  }
  
  try {
    const response = await safeFetch(
      'https://www.betexplorer.com/tennis/',
      'betexplorer'
    );
    
    if (!response) {
      console.log('[SmartCollector] ⚠️ BetExplorer non disponible');
      return matches;
    }
    
    const html = await response.text();
    
    // Parser le HTML
    const matchPattern = /href="\/tennis\/([a-z-]+)\/([a-z-]+)\/([a-z-]+)\/([a-zA-Z0-9]+)\/"/g;
    const oddsPattern = /data-odd="(\d+\.?\d*)"/g;
    
    const odds: number[] = [];
    let oddsMatch;
    while ((oddsMatch = oddsPattern.exec(html)) !== null) {
      odds.push(parseFloat(oddsMatch[1]));
    }
    
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
    
    console.log(`[SmartCollector] ✅ BetExplorer: ${matches.length} matchs`);
    
  } catch (error) {
    console.error('[SmartCollector] ❌ Erreur BetExplorer:', error);
  }
  
  return matches;
}

async function collectFromFlashScore(): Promise<TennisMatch[]> {
  console.log('[SmartCollector] FlashScore: non implémenté');
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
  COLLECT_MODE,
};
