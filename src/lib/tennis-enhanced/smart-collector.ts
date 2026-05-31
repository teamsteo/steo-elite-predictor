/**
 * Tennis Smart Collector - SYSTÈME HYBRIDE INTELLIGENT
 * 
 * 🎯 STRATÉGIE:
 * 1. BetExplorer (PRIORITÉ) - Gratuit, données riches, avec anti-ban amélioré
 * 2. The Odds API (BACKUP) - API officielle, bascule automatique si ban
 * 3. Données statiques (FALLBACK) - Si tout échoue
 * 
 * 🛡️ PROTECTION ANTI-BAN:
 * - Rotation User-Agents
 * - Délais aléatoires entre requêtes
 * - Circuit breaker (blocage auto si trop d'erreurs)
 * - Détection automatique de ban
 * - Rebond automatique sur Odds API
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
  source: 'betexplorer' | 'oddsapi' | 'demo';
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

const ANTI_BAN_CONFIG = {
  // Délais entre requêtes (en ms)
  minDelay: 10000,        // 10 secondes minimum
  maxDelay: 25000,        // 25 secondes maximum
  
  // Circuit Breaker
  maxErrors: 3,           // Max 3 erreurs avant blocage
  blockDuration: 30 * 60 * 1000, // 30 minutes de blocage
  
  // Quota journalier
  maxDailyRequests: 10,   // Max 10 requêtes/jour vers BetExplorer
  
  // User-Agents à rotation
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};

// ============================================
// THE ODDS API - CONFIGURATION (BACKUP)
// ============================================

const ODDS_API_KEY = process.env.THE_ODDS_API_KEY || process.env.ODDS_API_KEY || '';
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

// Quota backup (conservateur)
const ODDS_API_DAILY_BUDGET = 3; // Max 3 requêtes/jour en mode backup

// ============================================
// ÉTAT GLOBAL
// ============================================

// Cache
const CACHE_TTL = {
  matches: 30 * 60 * 1000,      // 30 minutes
  odds: 5 * 60 * 1000,          // 5 minutes
  rankings: 24 * 60 * 60 * 1000, // 24 heures
};

let cachedMatches: TennisMatch[] = [];
let lastFetchTime = 0;

// Anti-ban state
interface AntiBanState {
  errorCount: number;
  blockedUntil: number;
  dailyRequests: number;
  lastRequestDate: string;
  lastRequestTime: number;
  isBanned: boolean;
  banReason: string;
}

let antiBanState: AntiBanState = {
  errorCount: 0,
  blockedUntil: 0,
  dailyRequests: 0,
  lastRequestDate: '',
  lastRequestTime: 0,
  isBanned: false,
  banReason: '',
};

// Odds API state
let oddsApiDailyRequests = 0;
let lastOddsApiDate = '';

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

function generatePlayerId(name: string): string {
  return `player_${name.toLowerCase().replace(/[^a-z]/g, '')}`;
}

function getRandomDelay(): number {
  return Math.floor(Math.random() * (ANTI_BAN_CONFIG.maxDelay - ANTI_BAN_CONFIG.minDelay) + ANTI_BAN_CONFIG.minDelay);
}

function getRandomUserAgent(): string {
  return ANTI_BAN_CONFIG.userAgents[Math.floor(Math.random() * ANTI_BAN_CONFIG.userAgents.length)];
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Vérifie si on peut faire une requête vers BetExplorer
 */
function canRequestBetExplorer(): { allowed: boolean; reason: string } {
  const now = Date.now();
  const today = getToday();
  
  // Reset quotidien
  if (antiBanState.lastRequestDate !== today) {
    antiBanState.dailyRequests = 0;
    antiBanState.lastRequestDate = today;
    antiBanState.errorCount = 0;
  }
  
  // Vérifier si bloqué (circuit breaker)
  if (antiBanState.blockedUntil > now) {
    const remaining = Math.ceil((antiBanState.blockedUntil - now) / 60000);
    return { allowed: false, reason: `Bloqué encore ${remaining} min (${antiBanState.banReason})` };
  }
  
  // Vérifier si banni
  if (antiBanState.isBanned) {
    return { allowed: false, reason: `Banni: ${antiBanState.banReason}` };
  }
  
  // Vérifier quota journalier
  if (antiBanState.dailyRequests >= ANTI_BAN_CONFIG.maxDailyRequests) {
    return { allowed: false, reason: `Quota journalier atteint (${antiBanState.dailyRequests}/${ANTI_BAN_CONFIG.maxDailyRequests})` };
  }
  
  // Vérifier délai depuis dernière requête
  const timeSinceLastRequest = now - antiBanState.lastRequestTime;
  const minDelay = getRandomDelay();
  if (timeSinceLastRequest < minDelay) {
    const waitSec = Math.ceil((minDelay - timeSinceLastRequest) / 1000);
    return { allowed: false, reason: `Attendre ${waitSec}s (anti-ban)` };
  }
  
  return { allowed: true, reason: 'OK' };
}

/**
 * Enregistre une erreur (pour circuit breaker)
 */
function recordError(error: string): void {
  antiBanState.errorCount++;
  console.log(`[TennisCollector] ⚠️ Erreur ${antiBanState.errorCount}/${ANTI_BAN_CONFIG.maxErrors}: ${error}`);
  
  if (antiBanState.errorCount >= ANTI_BAN_CONFIG.maxErrors) {
    antiBanState.blockedUntil = Date.now() + ANTI_BAN_CONFIG.blockDuration;
    antiBanState.banReason = `Circuit breaker: ${antiBanState.errorCount} erreurs`;
    console.log(`[TennisCollector] 🔒 Circuit breaker activé pour 30 min`);
  }
}

/**
 * Détecte un ban de BetExplorer
 */
function detectBan(response: Response, html: string): boolean {
  // Codes HTTP suspects
  if (response.status === 403) return true;
  if (response.status === 429) return true;
  
  // Contenu suspect
  const banIndicators = [
    'access denied',
    'blocked',
    'captcha',
    'cloudflare',
    'rate limit',
    'too many requests',
    'security check',
    'please wait',
    'enable javascript',
  ];
  
  const lowerHtml = html.toLowerCase();
  return banIndicators.some(indicator => lowerHtml.includes(indicator));
}

/**
 * Marque comme banni et active le backup
 */
function markAsBanned(reason: string): void {
  antiBanState.isBanned = true;
  antiBanState.banReason = reason;
  antiBanState.blockedUntil = Date.now() + ANTI_BAN_CONFIG.blockDuration;
  console.log(`[TennisCollector] 🚫 BANNI de BetExplorer: ${reason}`);
  console.log(`[TennisCollector] 🔄 Activation du backup Odds API...`);
}

// ============================================
// BETEXPLORER SCRAPER (PRIORITÉ)
// ============================================

/**
 * Récupère les matchs depuis BetExplorer avec protection anti-ban
 */
async function fetchFromBetExplorer(): Promise<TennisMatch[]> {
  // Vérifier si on peut faire la requête
  const { allowed, reason } = canRequestBetExplorer();
  if (!allowed) {
    console.log(`[TennisCollector] ⏳ BetExplorer non disponible: ${reason}`);
    return [];
  }
  
  console.log(`[TennisCollector] 🎯 Tentative BetExplorer... (${antiBanState.dailyRequests + 1}/${ANTI_BAN_CONFIG.maxDailyRequests})`);
  
  try {
    // URL tennis BetExplorer
    const url = 'https://www.betexplorer.com/next/tennis/';
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
    });
    
    // Mettre à jour le state
    antiBanState.lastRequestTime = Date.now();
    antiBanState.dailyRequests++;
    
    if (!response.ok) {
      recordError(`HTTP ${response.status}`);
      return [];
    }
    
    const html = await response.text();
    
    // Détecter un ban
    if (detectBan(response, html)) {
      markAsBanned(`Détection automatique (HTTP ${response.status})`);
      return [];
    }
    
    // Parser le HTML
    const matches = parseBetExplorerHTML(html);
    
    // Reset error count si succès
    if (matches.length > 0) {
      antiBanState.errorCount = 0;
      console.log(`[TennisCollector] ✅ BetExplorer: ${matches.length} matchs récupérés`);
    }
    
    return matches;
    
  } catch (error) {
    recordError(String(error));
    return [];
  }
}

/**
 * Parse le HTML de BetExplorer
 */
function parseBetExplorerHTML(html: string): TennisMatch[] {
  const matches: TennisMatch[] = [];
  
  try {
    // Regex pour extraire les matchs
    const matchRegex = /<tr[^>]*class="[^"]*match[^"]*"[^>]*>[\s\S]*?<td[^>]*class="[^"]*player[^"]*"[^>]*>([^<]+)<\/td>[\s\S]*?<td[^>]*class="[^"]*player[^"]*"[^>]*>([^<]+)<\/td>[\s\S]*?<td[^>]*class="[^"]*odds[^"]*"[^>]*>([\d.]+)<\/td>[\s\S]*?<td[^>]*class="[^"]*odds[^"]*"[^>]*>([\d.]+)<\/td>/gi;
    
    // Regex alternative plus flexible
    const altMatchRegex = /data-event-name="([^"]+)"[\s\S]*?data-odd="([\d.]+)"[\s\S]*?data-odd="([\d.]+)"/gi;
    
    let match;
    let matchIndex = 0;
    
    // Essayer d'abord avec data attributes
    while ((match = altMatchRegex.exec(html)) !== null && matchIndex < 20) {
      const eventName = match[1];
      const odds1 = parseFloat(match[2]);
      const odds2 = parseFloat(match[3]);
      
      // Séparer les joueurs
      const players = eventName.split(' - ');
      if (players.length === 2) {
        const player1 = players[0].trim();
        const player2 = players[1].trim();
        
        matches.push({
          id: `betexplorer_${Date.now()}_${matchIndex}`,
          player1,
          player2,
          player1Id: generatePlayerId(player1),
          player2Id: generatePlayerId(player2),
          tournament: 'Tennis Match',
          tournamentId: 'tennis',
          tournamentTier: 'unknown',
          surface: 'hard',
          round: 'Match',
          date: new Date(),
          odds1,
          odds2,
          bookmaker: 'BetExplorer',
          category: 'atp',
          status: 'scheduled',
          source: 'betexplorer',
        });
        matchIndex++;
      }
    }
    
    // Si pas de matchs avec data attributes, essayer l'autre méthode
    if (matches.length === 0) {
      // Chercher tous les éléments de match potentiels
      const simpleMatchRegex = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*-\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
      
      while ((match = simpleMatchRegex.exec(html)) !== null && matches.length < 20) {
        const player1 = match[1].trim();
        const player2 = match[2].trim();
        
        // Éviter les faux positifs
        if (player1.length < 3 || player2.length < 3) continue;
        if (player1.includes('Match') || player2.includes('Match')) continue;
        
        matches.push({
          id: `betexplorer_${Date.now()}_${matches.length}`,
          player1,
          player2,
          player1Id: generatePlayerId(player1),
          player2Id: generatePlayerId(player2),
          tournament: 'Tennis Match',
          tournamentId: 'tennis',
          tournamentTier: 'unknown',
          surface: 'hard',
          round: 'Match',
          date: new Date(),
          odds1: 1.85,
          odds2: 1.85,
          bookmaker: 'BetExplorer',
          category: 'atp',
          status: 'scheduled',
          source: 'betexplorer',
        });
      }
    }
    
  } catch (error) {
    console.error('[TennisCollector] Erreur parsing HTML:', error);
  }
  
  return matches;
}

// ============================================
// THE ODDS API (BACKUP)
// ============================================

interface OddsAPIEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: Array<{
    key: string;
    title: string;
    markets: Array<{
      key: string;
      outcomes: Array<{
        name: string;
        price: number;
        point?: number;
      }>;
    }>;
  }>;
}

/**
 * Récupère les matchs depuis The Odds API (BACKUP)
 */
async function fetchFromOddsAPI(): Promise<TennisMatch[]> {
  if (!ODDS_API_KEY) {
    console.log('[TennisCollector] ⚠️ THE_ODDS_API_KEY non configurée');
    return [];
  }
  
  const today = getToday();
  if (lastOddsApiDate !== today) {
    oddsApiDailyRequests = 0;
    lastOddsApiDate = today;
  }
  
  if (oddsApiDailyRequests >= ODDS_API_DAILY_BUDGET) {
    console.log(`[TennisCollector] ⚠️ Budget Odds API atteint (${oddsApiDailyRequests}/${ODDS_API_DAILY_BUDGET})`);
    return [];
  }
  
  console.log(`[TennisCollector] 🔄 Utilisation Odds API (backup)...`);
  
  const matches: TennisMatch[] = [];
  
  try {
    // ATP
    oddsApiDailyRequests++;
    const atpResponse = await fetch(
      `${ODDS_API_BASE}/sports/tennis_atp/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`,
      { next: { revalidate: 300 } }
    );
    
    if (atpResponse.ok) {
      const data = await atpResponse.json();
      const events: OddsAPIEvent[] = data || [];
      
      for (const event of events) {
        const match = parseOddsAPIEvent(event, 'atp');
        if (match) matches.push(match);
      }
      
      console.log(`[TennisCollector] ✅ Odds API ATP: ${events.length} matchs`);
    }
    
    // WTA si budget le permet
    if (oddsApiDailyRequests < ODDS_API_DAILY_BUDGET) {
      oddsApiDailyRequests++;
      const wtaResponse = await fetch(
        `${ODDS_API_BASE}/sports/tennis_wta/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`,
        { next: { revalidate: 300 } }
      );
      
      if (wtaResponse.ok) {
        const data = await wtaResponse.json();
        const events: OddsAPIEvent[] = data || [];
        
        for (const event of events) {
          const match = parseOddsAPIEvent(event, 'wta');
          if (match) matches.push(match);
        }
        
        console.log(`[TennisCollector] ✅ Odds API WTA: ${events.length} matchs`);
      }
    }
    
    console.log(`[TennisCollector] 📊 Odds API aujourd'hui: ${oddsApiDailyRequests}/${ODDS_API_DAILY_BUDGET}`);
    
  } catch (error) {
    console.error('[TennisCollector] ❌ Erreur Odds API:', error);
  }
  
  return matches;
}

/**
 * Parse un événement Odds API
 */
function parseOddsAPIEvent(event: OddsAPIEvent, category: Category): TennisMatch | null {
  try {
    let odds1 = 1.85;
    let odds2 = 1.85;
    let bookmaker = 'Average';
    
    if (event.bookmakers && event.bookmakers.length > 0) {
      const firstBookmaker = event.bookmakers[0];
      bookmaker = firstBookmaker.title;
      
      const h2hMarket = firstBookmaker.markets.find(m => m.key === 'h2h');
      if (h2hMarket) {
        const homeOutcome = h2hMarket.outcomes.find(o => o.name === event.home_team);
        const awayOutcome = h2hMarket.outcomes.find(o => o.name === event.away_team);
        
        if (homeOutcome) odds1 = homeOutcome.price;
        if (awayOutcome) odds2 = awayOutcome.price;
      }
    }
    
    const tournamentName = event.sport_title || 'Tennis Tournament';
    const tournamentSlug = tournamentName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    return {
      id: `oddsapi_${event.id}`,
      player1: event.home_team,
      player2: event.away_team,
      player1Id: generatePlayerId(event.home_team),
      player2Id: generatePlayerId(event.away_team),
      tournament: tournamentName,
      tournamentId: tournamentSlug,
      tournamentTier: detectTournamentTier(tournamentSlug, category),
      surface: detectSurfaceImproved(tournamentSlug),
      round: 'Match',
      date: new Date(event.commence_time),
      odds1,
      odds2,
      bookmaker,
      category,
      status: 'scheduled',
      source: 'oddsapi',
    };
  } catch (error) {
    return null;
  }
}

// ============================================
// DONNÉES STATIQUES (FALLBACK)
// ============================================

const CURRENT_TOURNAMENTS = [
  { name: 'Roland Garros', slug: 'roland-garros', tier: 'grand_slam' as TournamentTier, surface: 'clay' as Surface, category: 'atp' as Category, month: [4, 5] },
  { name: 'Wimbledon', slug: 'wimbledon', tier: 'grand_slam' as TournamentTier, surface: 'grass' as Surface, category: 'atp' as Category, month: [5, 6] },
  { name: 'US Open', slug: 'us-open', tier: 'grand_slam' as TournamentTier, surface: 'hard' as Surface, category: 'atp' as Category, month: [7, 8] },
  { name: 'Australian Open', slug: 'australian-open', tier: 'grand_slam' as TournamentTier, surface: 'hard' as Surface, category: 'atp' as Category, month: [0] },
];

function generateSampleMatches(): TennisMatch[] {
  const now = new Date();
  const month = now.getMonth();
  
  const currentTournament = CURRENT_TOURNAMENTS.find(t => t.month.includes(month));
  
  if (!currentTournament) {
    console.log('[TennisCollector] 📅 Pas de tournoi majeur en cours');
    return [];
  }
  
  const topATP = [
    { name: 'Jannik Sinner', rank: 1 },
    { name: 'Carlos Alcaraz', rank: 2 },
    { name: 'Alexander Zverev', rank: 3 },
    { name: 'Daniil Medvedev', rank: 4 },
    { name: 'Taylor Fritz', rank: 5 },
    { name: 'Casper Ruud', rank: 6 },
    { name: 'Novak Djokovic', rank: 7 },
    { name: 'Alex de Minaur', rank: 8 },
  ];
  
  const matches: TennisMatch[] = [];
  
  for (let i = 0; i < Math.min(4, topATP.length - 1); i += 2) {
    const p1 = topATP[i];
    const p2 = topATP[i + 1];
    
    const rankDiff = p2.rank - p1.rank;
    const odds1 = Math.max(1.1, 1.5 + (rankDiff * 0.05));
    const odds2 = Math.max(1.5, 2.5 - (rankDiff * 0.03));
    
    matches.push({
      id: `demo_${currentTournament.slug}_${i}`,
      player1: p1.name,
      player2: p2.name,
      player1Id: generatePlayerId(p1.name),
      player2Id: generatePlayerId(p2.name),
      tournament: currentTournament.name,
      tournamentId: currentTournament.slug,
      tournamentTier: currentTournament.tier,
      surface: currentTournament.surface,
      round: i < 2 ? 'Quarts de finale' : 'Demi-finale',
      date: new Date(now.getTime() + (i + 1) * 24 * 60 * 60 * 1000),
      odds1: Math.round(odds1 * 100) / 100,
      odds2: Math.round(odds2 * 100) / 100,
      bookmaker: 'Average',
      category: currentTournament.category,
      status: 'scheduled',
      source: 'demo',
    });
  }
  
  console.log(`[TennisCollector] 📦 Matchs générés pour ${currentTournament.name}: ${matches.length}`);
  return matches;
}

// ============================================
// DÉTECTION TOURNOI & SURFACE
// ============================================

const GRAND_SLAMS = ['australian-open', 'roland-garros', 'french-open', 'wimbledon', 'us-open'];
const MASTERS_1000 = ['indian-wells', 'miami', 'monte-carlo', 'madrid', 'rome', 'canada', 'cincinnati', 'shanghai', 'paris-masters'];
const ATP_500 = ['rotterdam', 'rio', 'acapulco', 'dubai', 'barcelona', 'hamburg', 'washington', 'beijing', 'tokyo', 'vienna', 'basel'];
const WTA_1000 = ['indian-wells', 'miami', 'madrid', 'beijing', 'doha', 'rome', 'canada', 'cincinnati', 'wuhan'];

export function detectTournamentTier(tournamentSlug: string, category: Category): TournamentTier {
  const slug = tournamentSlug.toLowerCase();
  
  if (GRAND_SLAMS.some(gs => slug.includes(gs))) return 'grand_slam';
  
  if (category === 'atp') {
    if (MASTERS_1000.some(m => slug.includes(m))) return 'masters_1000';
    if (ATP_500.some(m => slug.includes(m))) return 'atp_500';
    return 'atp_250';
  }
  
  if (category === 'wta') {
    if (WTA_1000.some(m => slug.includes(m))) return 'wta_1000';
    return 'wta_250';
  }
  
  return 'itf';
}

export function getTournamentImportanceFactor(tier: TournamentTier): number {
  const factors: Record<TournamentTier, number> = {
    'grand_slam': 1.5, 'masters_1000': 1.35, 'wta_1000': 1.35,
    'atp_500': 1.20, 'wta_500': 1.20, 'atp_250': 1.00, 'wta_250': 1.00,
    'challenger_175': 0.85, 'challenger_125': 0.75, 'challenger_100': 0.70,
    'challenger_75': 0.65, 'challenger_50': 0.60, 'itf': 0.50, 'unknown': 0.70,
  };
  return factors[tier] || 1.0;
}

const GRASS_TOURNAMENTS = ['wimbledon', 'halle', 'queens', 'eastbourne', 's-hertogenbosch', 'stuttgart-grass', 'mallorca', 'newport'];
const CLAY_TOURNAMENTS = ['roland-garros', 'french-open', 'monte-carlo', 'barcelona', 'rome', 'madrid', 'hamburg', 'rio', 'buenos-aires'];
const INDOOR_TOURNAMENTS = ['rotterdam', 'marseille', 'montpellier', 'metz', 'vienna', 'basel', 'stockholm', 'antwerp', 'paris-masters'];

export function detectSurfaceImproved(tournamentSlug: string): Surface {
  const slug = tournamentSlug.toLowerCase();
  if (GRASS_TOURNAMENTS.some(t => slug.includes(t))) return 'grass';
  if (CLAY_TOURNAMENTS.some(t => slug.includes(t))) return 'clay';
  if (INDOOR_TOURNAMENTS.some(t => slug.includes(t))) return 'indoor';
  return 'hard';
}

// ============================================
// COLLECTE PRINCIPALE - SYSTÈME HYBRIDE
// ============================================

export interface CollectorStatus {
  source: 'betexplorer' | 'oddsapi' | 'demo' | 'cache';
  betexplorer: {
    available: boolean;
    reason: string;
    dailyRequests: number;
    maxDailyRequests: number;
    isBanned: boolean;
  };
  oddsApi: {
    available: boolean;
    dailyRequests: number;
    maxDailyRequests: number;
  };
  cache: {
    valid: boolean;
    age: number;
  };
}

export function getCollectorStatus(): CollectorStatus {
  const now = Date.now();
  const cacheAge = cachedMatches.length > 0 ? now - lastFetchTime : 0;
  
  return {
    source: cachedMatches.length > 0 && cacheAge < CACHE_TTL.matches ? 'cache' : 
            antiBanState.isBanned ? 'oddsapi' : 'betexplorer',
    betexplorer: {
      available: !antiBanState.isBanned && antiBanState.blockedUntil < now,
      reason: antiBanState.isBanned ? antiBanState.banReason : 
              antiBanState.blockedUntil > now ? `Bloqué ${Math.ceil((antiBanState.blockedUntil - now) / 60000)} min` : 'OK',
      dailyRequests: antiBanState.dailyRequests,
      maxDailyRequests: ANTI_BAN_CONFIG.maxDailyRequests,
      isBanned: antiBanState.isBanned,
    },
    oddsApi: {
      available: !!ODDS_API_KEY,
      dailyRequests: oddsApiDailyRequests,
      maxDailyRequests: ODDS_API_DAILY_BUDGET,
    },
    cache: {
      valid: cacheAge < CACHE_TTL.matches && cachedMatches.length > 0,
      age: Math.floor(cacheAge / 1000),
    },
  };
}

/**
 * Collecte principale avec système hybride intelligent
 * ⚠️ FALLBACK DÉSACTIVÉ - Seuls les vrais matchs sont retournés
 */
export async function collectMatches(): Promise<TennisMatch[]> {
  console.log('[TennisCollector] 🎾 Début collecte - SYSTÈME HYBRIDE (FALLBACK DÉSACTIVÉ)');
  
  // Vérifier le cache
  const now = Date.now();
  if (cachedMatches.length > 0 && (now - lastFetchTime) < CACHE_TTL.matches) {
    console.log(`[TennisCollector] 📦 Cache HIT: ${cachedMatches.length} matchs`);
    return cachedMatches;
  }
  
  let matches: TennisMatch[] = [];
  let source: 'betexplorer' | 'oddsapi' | 'none' = 'none';
  
  // 1. PRIORITÉ: BetExplorer (avec anti-ban)
  if (!antiBanState.isBanned) {
    const betExplorerMatches = await fetchFromBetExplorer();
    if (betExplorerMatches.length > 0) {
      matches = betExplorerMatches;
      source = 'betexplorer';
    }
  } else {
    console.log(`[TennisCollector] ⚠️ BetExplorer banni - utilisation backup`);
  }
  
  // 2. BACKUP: The Odds API (si BetExplorer échoue ou banni)
  if (matches.length === 0) {
    const oddsApiMatches = await fetchFromOddsAPI();
    if (oddsApiMatches.length > 0) {
      matches = oddsApiMatches;
      source = 'oddsapi';
    }
  }
  
  // 3. PLUS DE FALLBACK - On retourne vide si aucune source n'a de matchs
  if (matches.length === 0) {
    console.log('[TennisCollector] ⚠️ AUCUN MATCH RÉEL DISPONIBLE');
    console.log('[TennisCollector] ℹ️ Sources tentées: BetExplorer, Odds API');
    console.log('[TennisCollector] ℹ️ Vérifiez THE_ODDS_API_KEY dans les variables d\'environnement');
    return [];
  }
  
  // Mettre en cache
  cachedMatches = matches;
  lastFetchTime = now;
  console.log(`[TennisCollector] ✅ ${matches.length} matchs RÉELS collectés via ${source.toUpperCase()}`);
  
  return matches;
}

// ============================================
// EXPORTS
// ============================================

export { CACHE_TTL, ANTI_BAN_CONFIG };
