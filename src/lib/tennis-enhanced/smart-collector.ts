/**
 * Tennis Smart Collector - Collecte via API OFFICIELLE (comme ESPN pour le foot)
 * 
 * ✅ STRATÉGIE SÉCURISÉE:
 * 1. The Odds API - API OFFICIELLE GRATUITE (500 req/mois) - AUCUN RISQUE
 * 2. Fallback: données statiques avec classements ATP/WTA
 * 3. Cache intelligent pour économiser les requêtes
 * 
 * ⚠️ PAS DE SCRAPING - Utilise uniquement des APIs officielles
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
// THE ODDS API - CONFIGURATION
// ============================================

// API officielle - 500 requêtes/mois gratuites
// Obtenir une clé: https://the-odds-api.com
const ODDS_API_KEY = process.env.ODDS_API_KEY || '';
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

// Sports tennis disponibles
const TENNIS_SPORTS = [
  'tennis_atp',      // ATP Tour
  'tennis_wta',      // WTA Tour
  'tennis_challenger', // Challenger
];

// Cache
const CACHE_TTL = {
  matches: 30 * 60 * 1000,      // 30 minutes
  odds: 5 * 60 * 1000,          // 5 minutes
  rankings: 24 * 60 * 60 * 1000, // 24 heures
};

let cachedMatches: TennisMatch[] = [];
let lastFetchTime = 0;

// ============================================
// THE ODDS API - FONCTIONS
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
 * Récupère les matchs depuis The Odds API (API OFFICIELLE)
 */
async function fetchFromOddsAPI(): Promise<TennisMatch[]> {
  if (!ODDS_API_KEY) {
    console.log('[TennisCollector] ⚠️ ODDS_API_KEY non configurée');
    return [];
  }

  const matches: TennisMatch[] = [];

  try {
    // Récupérer matchs ATP
    const atpResponse = await fetch(
      `${ODDS_API_BASE}/sports/tennis_atp/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`,
      { next: { revalidate: 300 } } // Cache 5 min
    );

    if (atpResponse.ok) {
      const data = await atpResponse.json();
      const events: OddsAPIEvent[] = data || [];
      
      for (const event of events) {
        const match = parseOddsAPIEvent(event, 'atp');
        if (match) matches.push(match);
      }
      
      console.log(`[TennisCollector] ✅ The Odds API ATP: ${events.length} matchs`);
    } else {
      console.log(`[TennisCollector] ⚠️ The Odds API ATP error: ${atpResponse.status}`);
    }

    // Récupérer matchs WTA
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
      
      console.log(`[TennisCollector] ✅ The Odds API WTA: ${events.length} matchs`);
    }

  } catch (error) {
    console.error('[TennisCollector] ❌ Erreur The Odds API:', error);
  }

  return matches;
}

/**
 * Parse un événement The Odds API en TennisMatch
 */
function parseOddsAPIEvent(event: OddsAPIEvent, category: Category): TennisMatch | null {
  try {
    // Extraire les cotes
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

    // Détecter le tournoi
    const tournamentName = event.sport_title || 'Tennis Tournament';
    const tournamentSlug = tournamentName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    // Détecter le tier du tournoi
    const tier = detectTournamentTier(tournamentSlug, category);
    const surface = detectSurfaceImproved(tournamentSlug);

    return {
      id: `oddsapi_${event.id}`,
      player1: event.home_team,
      player2: event.away_team,
      player1Id: generatePlayerId(event.home_team),
      player2Id: generatePlayerId(event.away_team),
      tournament: tournamentName,
      tournamentId: tournamentSlug,
      tournamentTier: tier,
      surface,
      round: 'Match',
      date: new Date(event.commence_time),
      odds1,
      odds2,
      bookmaker,
      category,
      status: 'scheduled',
    };
  } catch (error) {
    console.error('[TennisCollector] Erreur parsing event:', error);
    return null;
  }
}

// ============================================
// DONNÉES STATIQUES (FALLBACK)
// ============================================

const CURRENT_TOURNAMENTS = [
  // Roland Garros - fin mai/début juin
  { name: 'Roland Garros', slug: 'roland-garros', tier: 'grand_slam' as TournamentTier, surface: 'clay' as Surface, category: 'atp' as Category, month: [4, 5] },
  // Wimbledon - fin juin/début juillet
  { name: 'Wimbledon', slug: 'wimbledon', tier: 'grand_slam' as TournamentTier, surface: 'grass' as Surface, category: 'atp' as Category, month: [5, 6] },
  // US Open - fin août/début septembre
  { name: 'US Open', slug: 'us-open', tier: 'grand_slam' as TournamentTier, surface: 'hard' as Surface, category: 'atp' as Category, month: [7, 8] },
  // Australian Open - janvier
  { name: 'Australian Open', slug: 'australian-open', tier: 'grand_slam' as TournamentTier, surface: 'hard' as Surface, category: 'atp' as Category, month: [0] },
];

function generateSampleMatches(): TennisMatch[] {
  const now = new Date();
  const month = now.getMonth();
  
  // Trouver le tournoi actuel
  const currentTournament = CURRENT_TOURNAMENTS.find(t => t.month.includes(month));
  
  if (!currentTournament) {
    console.log('[TennisCollector] 📅 Pas de tournoi majeur en cours');
    return [];
  }

  // Générer des matchs de démonstration basés sur les classements
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
  
  // Générer quelques matchs
  for (let i = 0; i < Math.min(4, topATP.length - 1); i += 2) {
    const p1 = topATP[i];
    const p2 = topATP[i + 1];
    
    // Cotes basées sur le classement
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
    });
  }

  console.log(`[TennisCollector] 📦 Matchs générés pour ${currentTournament.name}: ${matches.length}`);
  return matches;
}

// ============================================
// DÉTECTION TOURNOI
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
// COLLECTE PRINCIPALE
// ============================================

export async function collectMatches(): Promise<TennisMatch[]> {
  console.log('[TennisCollector] 🎾 Début collecte - Mode API officielle');
  
  // Vérifier le cache
  const now = Date.now();
  if (cachedMatches.length > 0 && (now - lastFetchTime) < CACHE_TTL.matches) {
    console.log(`[TennisCollector] 📦 Cache HIT: ${cachedMatches.length} matchs`);
    return cachedMatches;
  }
  
  let matches: TennisMatch[] = [];
  
  // 1. Essayer The Odds API (API OFFICIELLE - AUCUN RISQUE)
  console.log('[TennisCollector] 📡 Appel The Odds API...');
  const oddsApiMatches = await fetchFromOddsAPI();
  matches.push(...oddsApiMatches);
  
  // 2. Si pas de matchs, utiliser les données de démonstration
  if (matches.length === 0) {
    console.log('[TennisCollector] 📦 Utilisation données de démonstration');
    matches = generateSampleMatches();
  }
  
  // Mettre en cache
  if (matches.length > 0) {
    cachedMatches = matches;
    lastFetchTime = now;
    console.log(`[TennisCollector] ✅ ${matches.length} matchs collectés et mis en cache`);
  }
  
  return matches;
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

function generatePlayerId(name: string): string {
  return `player_${name.toLowerCase().replace(/[^a-z]/g, '')}`;
}

// ============================================
// EXPORTS
// ============================================

export {
  CACHE_TTL,
};
