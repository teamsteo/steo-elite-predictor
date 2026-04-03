/**
 * ESPN Odds Service - Service unifié pour les cotes avec fallback en cascade
 * 
 * SOURCE PRIMAIRE: ESPN API (GRATUIT ET ILLIMITÉ)
 * - Fournit les cotes DraftKings
 * - Couvre NBA, NFL, NHL, Football (toutes ligues)
 * - Pas de quota, pas de limite
 * 
 * FALLBACK AUTOMATIQUE EN CASCADE:
 * 1. ESPN (DraftKings) - GRATUIT ILLIMITÉ
 * 2. The Odds API - Si DraftKings indisponible (limité mais fiable)
 * 3. Estimations - Si les deux indisponibles
 */

// Types exportés
export interface ESPNOddMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: 'Foot' | 'NBA' | 'NHL' | 'NFL';
  league: string;
  date: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  bookmaker: string;
  hasRealOdds: boolean;
  oddsSource: 'espn-draftkings' | 'the-odds-api' | 'estimation';
  status: 'upcoming' | 'live' | 'finished';
  isLive?: boolean;
  homeScore?: number;
  awayScore?: number;
  clock?: string;
  period?: number;
  reliabilityScore: number; // 0-100
}

export interface ESPNStatus {
  available: boolean;
  lastCheck: string;
  matchesWithOdds: number;
  matchesWithoutOdds: number;
  primarySource: 'espn-draftkings' | 'the-odds-api' | 'estimation';
  error?: string;
}

// Cache global
declare global {
  var espnOddsCache: {
    matches: ESPNOddMatch[];
    lastUpdate: string;
    status: ESPNStatus;
  } | undefined;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Configuration The Odds API (fallback)
const ODDS_API_KEY = process.env.THE_ODDS_API_KEY || 'fcf0d3cbc8958a44007b0520751f8431';
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

// Équipes favorites pour estimation des cotes
const FAVORITE_TEAMS: Record<string, string[]> = {
  Foot: [
    'Real Madrid', 'Manchester City', 'Bayern Munich', 'Paris Saint-Germain', 'Barcelona',
    'Liverpool', 'Chelsea', 'Arsenal', 'Inter Milan', 'AC Milan', 'Borussia Dortmund',
    'Atletico Madrid', 'Juventus', 'Napoli', 'Roma', 'Lazio', 'Bayer Leverkusen', 'Atalanta',
    'Manchester United', 'Tottenham', 'Newcastle', 'Brighton', 'Aston Villa',
    'PSG', 'Monaco', 'Marseille', 'Lyon', 'Benfica', 'Porto', 'Ajax', 'Feyenoord',
    'Salzburg', 'Copenhagen', 'Galatasaray', 'Fenerbahce', 'Rangers', 'Celtic',
  ],
  NBA: [
    'Boston Celtics', 'Denver Nuggets', 'Milwaukee Bucks', 'Phoenix Suns', 'LA Lakers',
    'Golden State Warriors', 'Miami Heat', 'Philadelphia 76ers', 'Cleveland Cavaliers',
    'LA Clippers', 'Dallas Mavericks', 'Memphis Grizzlies', 'Sacramento Kings',
    'New York Knicks', 'Minnesota Timberwolves', 'Oklahoma City Thunder',
  ],
  NHL: [
    'Boston Bruins', 'Colorado Avalanche', 'Toronto Maple Leafs', 'Edmonton Oilers',
    'Vegas Golden Knights', 'Carolina Hurricanes', 'New York Rangers', 'Dallas Stars',
    'Florida Panthers', 'Tampa Bay Lightning',
  ],
};

// Ligues ESPN disponibles
const ESPN_LEAGUES = {
  Foot: [
    { key: 'eng.1', name: 'Premier League' },
    { key: 'esp.1', name: 'La Liga' },
    { key: 'ger.1', name: 'Bundesliga' },
    { key: 'ita.1', name: 'Serie A' },
    { key: 'fra.1', name: 'Ligue 1' },
    { key: 'uefa.champions', name: 'Champions League' },
    { key: 'uefa.europa', name: 'Europa League' },
    { key: 'uefa.europa.conf', name: 'Conference League' },
  ],
  NBA: [{ key: 'nba', name: 'NBA' }],
  NHL: [{ key: 'nhl', name: 'NHL' }],
  NFL: [{ key: 'nfl', name: 'NFL' }],
};

/**
 * Convertit les cotes américaines en décimales
 */
function americanToDecimal(americanOdds: string | number | undefined): number {
  if (!americanOdds) return 0;
  
  const odds = typeof americanOdds === 'string' 
    ? parseFloat(americanOdds.replace('+', '')) 
    : americanOdds;
  
  if (isNaN(odds) || odds === 0) return 0;
  
  if (odds > 0) {
    return Math.round((1 + odds / 100) * 100) / 100;
  } else {
    return Math.round((1 + 100 / Math.abs(odds)) * 100) / 100;
  }
}

/**
 * Estime les cotes basées sur la force des équipes
 */
function estimateOdds(
  homeTeam: string, 
  awayTeam: string, 
  sport: 'Foot' | 'NBA' | 'NHL' | 'NFL'
): { home: number; draw: number | null; away: number } {
  const favorites = FAVORITE_TEAMS[sport] || [];
  
  const homeIsFavorite = favorites.some(t => 
    homeTeam.toLowerCase().includes(t.toLowerCase()) || 
    t.toLowerCase().includes(homeTeam.toLowerCase().split(' ')[0])
  );
  const awayIsFavorite = favorites.some(t => 
    awayTeam.toLowerCase().includes(t.toLowerCase()) ||
    t.toLowerCase().includes(awayTeam.toLowerCase().split(' ')[0])
  );
  
  const hasDraw = sport === 'Foot';
  
  if (homeIsFavorite && !awayIsFavorite) {
    return hasDraw 
      ? { home: 1.65, draw: 3.60, away: 5.00 }
      : { home: 1.45, draw: null, away: 2.80 };
  } else if (!homeIsFavorite && awayIsFavorite) {
    return hasDraw 
      ? { home: 4.50, draw: 3.60, away: 1.75 }
      : { home: 2.60, draw: null, away: 1.50 };
  } else if (homeIsFavorite && awayIsFavorite) {
    return hasDraw 
      ? { home: 2.30, draw: 3.30, away: 3.00 }
      : { home: 1.90, draw: null, away: 1.90 };
  }
  
  return hasDraw 
    ? { home: 2.50, draw: 3.30, away: 2.80 }
    : { home: 1.95, draw: null, away: 1.85 };
}

/**
 * SOURCE 2: Récupère les cotes depuis The Odds API (fallback)
 */
async function fetchOddsApiFallback(): Promise<Map<string, { home: number; draw: number | null; away: number }>> {
  const oddsMap = new Map<string, { home: number; draw: number | null; away: number }>();
  
  try {
    console.log('📡 Fallback: Récupération The Odds API...');
    
    const response = await fetch(
      `${ODDS_API_BASE}/sports/upcoming/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`,
      { next: { revalidate: 300 } }
    );
    
    if (!response.ok) {
      console.log(`⚠️ The Odds API non disponible: ${response.status}`);
      return oddsMap;
    }
    
    const data = await response.json();
    
    for (const match of data) {
      const bookmaker = match.bookmakers?.[0];
      const h2hMarket = bookmaker?.markets?.find((m: any) => m.key === 'h2h');
      const outcomes = h2hMarket?.outcomes || [];
      
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
        // Normaliser les noms pour le matching
        const key = `${match.home_team?.toLowerCase()}_${match.away_team?.toLowerCase()}`;
        oddsMap.set(key, { home: oddsHome, draw: oddsDraw, away: oddsAway });
      }
    }
    
    console.log(`✅ The Odds API: ${oddsMap.size} matchs avec cotes`);
    
  } catch (error) {
    console.log('⚠️ Erreur The Odds API:', error);
  }
  
  return oddsMap;
}

/**
 * Extrait les cotes depuis ESPN (DraftKings)
 */
function extractEspnOdds(competition: any): { 
  home: number; 
  draw: number | null; 
  away: number; 
  provider: string;
  hasRealOdds: boolean;
} {
  const odds = competition?.odds?.[0];
  
  if (!odds) {
    return { home: 0, draw: null, away: 0, provider: 'None', hasRealOdds: false };
  }
  
  const provider = odds.provider?.name || 'DraftKings';
  
  let homeOdds = odds.homeTeamOdds?.moneyLine || odds.moneyline?.home?.close?.odds || 0;
  let awayOdds = odds.awayTeamOdds?.moneyLine || odds.moneyline?.away?.close?.odds || 0;
  let drawOdds = odds.drawOdds?.moneyLine || odds.moneyline?.draw?.close?.odds || null;
  
  homeOdds = americanToDecimal(homeOdds);
  awayOdds = americanToDecimal(awayOdds);
  drawOdds = drawOdds ? americanToDecimal(drawOdds) : null;
  
  const hasRealOdds = homeOdds > 0 && awayOdds > 0;
  
  return { home: homeOdds, draw: drawOdds, away: awayOdds, provider, hasRealOdds };
}

/**
 * Trouve les cotes Odds API pour un match
 */
function findOddsApiMatch(
  homeTeam: string, 
  awayTeam: string, 
  oddsApiMap: Map<string, { home: number; draw: number | null; away: number }>
): { home: number; draw: number | null; away: number } | null {
  // Essayer plusieurs variantes de clés
  const keys = [
    `${homeTeam.toLowerCase()}_${awayTeam.toLowerCase()}`,
    `${awayTeam.toLowerCase()}_${homeTeam.toLowerCase()}`,
  ];
  
  // Ajouter variantes sans accents, sans "FC", etc.
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '').replace(/^fc/, '');
  keys.push(`${normalize(homeTeam)}_${normalize(awayTeam)}`);
  keys.push(`${normalize(awayTeam)}_${normalize(homeTeam)}`);
  
  for (const key of keys) {
    const odds = oddsApiMap.get(key);
    if (odds) return odds;
  }
  
  return null;
}

/**
 * Récupère les matchs de football depuis ESPN avec fallback
 */
async function fetchESPNFootball(oddsApiMap: Map<string, { home: number; draw: number | null; away: number }>): Promise<ESPNOddMatch[]> {
  const matches: ESPNOddMatch[] = [];
  
  for (const league of ESPN_LEAGUES.Foot) {
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.key}/scoreboard`,
        { next: { revalidate: 300 } }
      );
      
      if (!response.ok) continue;
      
      const data = await response.json();
      const events = data.events || [];
      
      for (const event of events) {
        const competition = event.competitions?.[0];
        const homeCompetitor = competition?.competitors?.find((c: any) => c.homeAway === 'home');
        const awayCompetitor = competition?.competitors?.find((c: any) => c.homeAway === 'away');
        
        if (!homeCompetitor || !awayCompetitor) continue;
        
        const homeTeam = homeCompetitor.team?.displayName || 'Unknown';
        const awayTeam = awayCompetitor.team?.displayName || 'Unknown';
        
        // 1. Essayer ESPN (DraftKings)
        const espnOdds = extractEspnOdds(competition);
        
        let oddsHome = espnOdds.home;
        let oddsAway = espnOdds.away;
        let oddsDraw = espnOdds.draw;
        let hasRealOdds = espnOdds.hasRealOdds;
        let bookmaker = espnOdds.provider;
        let oddsSource: 'espn-draftkings' | 'the-odds-api' | 'estimation' = 'espn-draftkings';
        let reliabilityScore = 95;
        
        // 2. FALLBACK: The Odds API si ESPN pas de cotes
        if (!hasRealOdds) {
          const oddsApiOdds = findOddsApiMatch(homeTeam, awayTeam, oddsApiMap);
          if (oddsApiOdds) {
            oddsHome = oddsApiOdds.home;
            oddsAway = oddsApiOdds.away;
            oddsDraw = oddsApiOdds.draw;
            hasRealOdds = true;
            bookmaker = 'The Odds API';
            oddsSource = 'the-odds-api';
            reliabilityScore = 90;
          }
        }
        
        // 3. FALLBACK: Estimation si toujours pas de cotes
        if (!hasRealOdds) {
          const estimated = estimateOdds(homeTeam, awayTeam, 'Foot');
          oddsHome = estimated.home;
          oddsDraw = estimated.draw;
          oddsAway = estimated.away;
          bookmaker = 'Estimation';
          oddsSource = 'estimation';
          reliabilityScore = 60;
        }
        
        const isLive = event.status?.type?.state === 'in';
        const isFinished = event.status?.type?.completed;
        
        matches.push({
          id: `espn_foot_${league.key}_${event.id}`,
          homeTeam,
          awayTeam,
          sport: 'Foot',
          league: league.name,
          date: event.date,
          oddsHome,
          oddsDraw,
          oddsAway,
          bookmaker,
          hasRealOdds,
          oddsSource,
          status: isLive ? 'live' : isFinished ? 'finished' : 'upcoming',
          isLive,
          homeScore: homeCompetitor.score ? parseInt(homeCompetitor.score) : undefined,
          awayScore: awayCompetitor.score ? parseInt(awayCompetitor.score) : undefined,
          reliabilityScore,
        });
      }
    } catch (e) {
      console.log(`⚠️ ESPN Football ${league.name}: erreur`);
    }
  }
  
  return matches;
}

/**
 * Récupère les matchs NBA depuis ESPN avec fallback
 */
async function fetchESPNNBA(oddsApiMap: Map<string, { home: number; draw: number | null; away: number }>): Promise<ESPNOddMatch[]> {
  const matches: ESPNOddMatch[] = [];
  
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0].replace(/-/g, '');
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0].replace(/-/g, '');
    
    const response = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${todayStr}-${tomorrowStr}`,
      { next: { revalidate: 60 } }
    );
    
    if (!response.ok) return [];
    
    const data = await response.json();
    const events = data.events || [];
    
    for (const event of events) {
      const competition = event.competitions?.[0];
      const homeCompetitor = competition?.competitors?.find((c: any) => c.homeAway === 'home');
      const awayCompetitor = competition?.competitors?.find((c: any) => c.homeAway === 'away');
      
      if (!homeCompetitor || !awayCompetitor) continue;
      
      const homeTeam = homeCompetitor.team?.displayName || 'Unknown';
      const awayTeam = awayCompetitor.team?.displayName || 'Unknown';
      
      // 1. ESPN (DraftKings)
      const espnOdds = extractEspnOdds(competition);
      
      let oddsHome = espnOdds.home;
      let oddsAway = espnOdds.away;
      let hasRealOdds = espnOdds.hasRealOdds;
      let bookmaker = espnOdds.provider;
      let oddsSource: 'espn-draftkings' | 'the-odds-api' | 'estimation' = 'espn-draftkings';
      let reliabilityScore = 95;
      
      // 2. FALLBACK: The Odds API
      if (!hasRealOdds) {
        const oddsApiOdds = findOddsApiMatch(homeTeam, awayTeam, oddsApiMap);
        if (oddsApiOdds) {
          oddsHome = oddsApiOdds.home;
          oddsAway = oddsApiOdds.away;
          hasRealOdds = true;
          bookmaker = 'The Odds API';
          oddsSource = 'the-odds-api';
          reliabilityScore = 90;
        }
      }
      
      // 3. FALLBACK: Estimation
      if (!hasRealOdds) {
        const estimated = estimateOdds(homeTeam, awayTeam, 'NBA');
        oddsHome = estimated.home;
        oddsAway = estimated.away;
        bookmaker = 'Estimation';
        oddsSource = 'estimation';
        reliabilityScore = 60;
      }
      
      const isLive = event.status?.type?.state === 'in';
      const isFinished = event.status?.type?.completed;
      
      matches.push({
        id: `espn_nba_${event.id}`,
        homeTeam,
        awayTeam,
        sport: 'NBA',
        league: 'NBA',
        date: event.date,
        oddsHome,
        oddsDraw: null,
        oddsAway,
        bookmaker,
        hasRealOdds,
        oddsSource,
        status: isLive ? 'live' : isFinished ? 'finished' : 'upcoming',
        isLive,
        homeScore: homeCompetitor.score ? parseInt(homeCompetitor.score) : undefined,
        awayScore: awayCompetitor.score ? parseInt(awayCompetitor.score) : undefined,
        clock: isLive ? event.status?.displayClock : undefined,
        period: isLive ? event.status?.period : undefined,
        reliabilityScore,
      });
    }
  } catch (e) {
    console.log('⚠️ ESPN NBA: erreur', e);
  }
  
  return matches;
}

/**
 * Récupère les matchs NHL depuis ESPN avec fallback
 */
async function fetchESPNNHL(oddsApiMap: Map<string, { home: number; draw: number | null; away: number }>): Promise<ESPNOddMatch[]> {
  const matches: ESPNOddMatch[] = [];
  
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0].replace(/-/g, '');
    
    const response = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${todayStr}`,
      { next: { revalidate: 60 } }
    );
    
    if (!response.ok) return [];
    
    const data = await response.json();
    const events = data.events || [];
    
    for (const event of events) {
      const competition = event.competitions?.[0];
      const homeCompetitor = competition?.competitors?.find((c: any) => c.homeAway === 'home');
      const awayCompetitor = competition?.competitors?.find((c: any) => c.homeAway === 'away');
      
      if (!homeCompetitor || !awayCompetitor) continue;
      
      const homeTeam = homeCompetitor.team?.displayName || 'Unknown';
      const awayTeam = awayCompetitor.team?.displayName || 'Unknown';
      
      // 1. ESPN (DraftKings)
      const espnOdds = extractEspnOdds(competition);
      
      let oddsHome = espnOdds.home;
      let oddsAway = espnOdds.away;
      let hasRealOdds = espnOdds.hasRealOdds;
      let bookmaker = espnOdds.provider;
      let oddsSource: 'espn-draftkings' | 'the-odds-api' | 'estimation' = 'espn-draftkings';
      let reliabilityScore = 95;
      
      // 2. FALLBACK: The Odds API
      if (!hasRealOdds) {
        const oddsApiOdds = findOddsApiMatch(homeTeam, awayTeam, oddsApiMap);
        if (oddsApiOdds) {
          oddsHome = oddsApiOdds.home;
          oddsAway = oddsApiOdds.away;
          hasRealOdds = true;
          bookmaker = 'The Odds API';
          oddsSource = 'the-odds-api';
          reliabilityScore = 90;
        }
      }
      
      // 3. FALLBACK: Estimation
      if (!hasRealOdds) {
        const estimated = estimateOdds(homeTeam, awayTeam, 'NHL');
        oddsHome = estimated.home;
        oddsAway = estimated.away;
        bookmaker = 'Estimation';
        oddsSource = 'estimation';
        reliabilityScore = 60;
      }
      
      const isLive = event.status?.type?.state === 'in';
      const isFinished = event.status?.type?.completed;
      
      matches.push({
        id: `espn_nhl_${event.id}`,
        homeTeam,
        awayTeam,
        sport: 'NHL',
        league: 'NHL',
        date: event.date,
        oddsHome,
        oddsDraw: null,
        oddsAway,
        bookmaker,
        hasRealOdds,
        oddsSource,
        status: isLive ? 'live' : isFinished ? 'finished' : 'upcoming',
        isLive,
        homeScore: homeCompetitor.score ? parseInt(homeCompetitor.score) : undefined,
        awayScore: awayCompetitor.score ? parseInt(awayCompetitor.score) : undefined,
        reliabilityScore,
      });
    }
  } catch (e) {
    console.log('⚠️ ESPN NHL: erreur', e);
  }
  
  return matches;
}

/**
 * Fonction principale: Récupère tous les matchs avec fallback en cascade
 * 
 * CASCADE:
 * 1. ESPN (DraftKings) - GRATUIT ILLIMITÉ
 * 2. The Odds API - Fallback si ESPN sans cotes
 * 3. Estimations - Dernier recours
 */
export async function fetchAllESPNOdds(): Promise<ESPNOddMatch[]> {
  console.log('📡 Récupération des cotes (ESPN → Odds API → Estimations)...');
  
  // Vérifier le cache
  const now = Date.now();
  if (global.espnOddsCache?.matches?.length && 
      (now - new Date(global.espnOddsCache.lastUpdate).getTime()) < CACHE_TTL) {
    console.log(`📦 Cache valide: ${global.espnOddsCache.matches.length} matchs`);
    return global.espnOddsCache.matches;
  }
  
  // Étape 1: Préparer le fallback The Odds API (en parallèle)
  const oddsApiMapPromise = fetchOddsApiFallback();
  
  // Étape 2: Récupérer les données ESPN (en parallèle avec Odds API)
  const [oddsApiMap, football, nba, nhl] = await Promise.all([
    oddsApiMapPromise,
    fetchESPNFootball(new Map()),
    fetchESPNNBA(new Map()),
    fetchESPNNHL(new Map()),
  ]);
  
  // Étape 3: Appliquer le fallback Odds API aux matchs sans cotes ESPN
  const allMatches: ESPNOddMatch[] = [];
  
  for (const match of [...football, ...nba, ...nhl]) {
    if (!match.hasRealOdds && match.oddsSource === 'estimation') {
      const oddsApiOdds = findOddsApiMatch(match.homeTeam, match.awayTeam, oddsApiMap);
      if (oddsApiOdds) {
        match.oddsHome = oddsApiOdds.home;
        match.oddsAway = oddsApiOdds.away;
        match.oddsDraw = oddsApiOdds.draw;
        match.hasRealOdds = true;
        match.bookmaker = 'The Odds API';
        match.oddsSource = 'the-odds-api';
        match.reliabilityScore = 90;
      }
    }
    allMatches.push(match);
  }
  
  // Calculer les stats
  const espnCount = allMatches.filter(m => m.oddsSource === 'espn-draftkings').length;
  const oddsApiCount = allMatches.filter(m => m.oddsSource === 'the-odds-api').length;
  const estimatedCount = allMatches.filter(m => m.oddsSource === 'estimation').length;
  
  // Déterminer la source primaire utilisée
  let primarySource: 'espn-draftkings' | 'the-odds-api' | 'estimation' = 'estimation';
  if (espnCount > 0) primarySource = 'espn-draftkings';
  else if (oddsApiCount > 0) primarySource = 'the-odds-api';
  
  // Mettre à jour le cache
  global.espnOddsCache = {
    matches: allMatches,
    lastUpdate: new Date().toISOString(),
    status: {
      available: true,
      lastCheck: new Date().toISOString(),
      matchesWithOdds: espnCount + oddsApiCount,
      matchesWithoutOdds: estimatedCount,
      primarySource,
    },
  };
  
  console.log(`✅ Total: ${allMatches.length} matchs (ESPN: ${espnCount}, Odds API: ${oddsApiCount}, Estimés: ${estimatedCount})`);
  
  return allMatches;
}

/**
 * Récupère uniquement les matchs de football
 */
export async function fetchESPNFootballOdds(): Promise<ESPNOddMatch[]> {
  const all = await fetchAllESPNOdds();
  return all.filter(m => m.sport === 'Foot');
}

/**
 * Récupère uniquement les matchs NBA
 */
export async function fetchESPNNBAOdds(): Promise<ESPNOddMatch[]> {
  const all = await fetchAllESPNOdds();
  return all.filter(m => m.sport === 'NBA');
}

/**
 * Récupère uniquement les matchs NHL
 */
export async function fetchESPNNHLOdds(): Promise<ESPNOddMatch[]> {
  const all = await fetchAllESPNOdds();
  return all.filter(m => m.sport === 'NHL');
}

/**
 * Récupère les matchs en direct
 */
export async function fetchESPNLiveOdds(): Promise<ESPNOddMatch[]> {
  const all = await fetchAllESPNOdds();
  return all.filter(m => m.isLive);
}

/**
 * Trouve les cotes pour un match spécifique
 */
export function findESPNOddsForMatch(
  homeTeam: string, 
  awayTeam: string, 
  sport?: 'Foot' | 'NBA' | 'NHL' | 'NFL'
): ESPNOddMatch | null {
  if (!global.espnOddsCache?.matches) return null;
  
  const normalizeName = (name: string) => 
    name.toLowerCase().replace(/[^a-z]/g, '').substring(0, 6);
  
  const homeNorm = normalizeName(homeTeam);
  const awayNorm = normalizeName(awayTeam);
  
  return global.espnOddsCache.matches.find(m => {
    if (sport && m.sport !== sport) return false;
    
    const mHomeNorm = normalizeName(m.homeTeam);
    const mAwaNorm = normalizeName(m.awayTeam);
    
    return (mHomeNorm === homeNorm && mAwaNorm === awayNorm) ||
           (mHomeNorm === awayNorm && mAwaNorm === homeNorm);
  }) || null;
}

/**
 * Retourne le statut du service
 */
export function getESPNStatus(): ESPNStatus {
  if (!global.espnOddsCache?.status) {
    return {
      available: false,
      lastCheck: '',
      matchesWithOdds: 0,
      matchesWithoutOdds: 0,
      primarySource: 'estimation',
      error: 'Cache non initialisé',
    };
  }
  
  return global.espnOddsCache.status;
}

/**
 * Force le rafraîchissement du cache
 */
export async function forceRefreshESPN(): Promise<ESPNOddMatch[]> {
  global.espnOddsCache = undefined;
  return fetchAllESPNOdds();
}

/**
 * Retourne les statistiques du cache
 */
export function getESPNOddsStats() {
  const cache = global.espnOddsCache;
  
  if (!cache) {
    return {
      hasCache: false,
      cacheAge: 0,
      matchesCount: 0,
      matchesWithOdds: 0,
      source: 'ESPN → Odds API → Estimations',
      quotaCost: 0,
      lastUpdate: undefined,
    };
  }
  
  const cacheAgeMs = Date.now() - new Date(cache.lastUpdate).getTime();
  const espnCount = cache.matches.filter(m => m.oddsSource === 'espn-draftkings').length;
  const oddsApiCount = cache.matches.filter(m => m.oddsSource === 'the-odds-api').length;
  const estimatedCount = cache.matches.filter(m => m.oddsSource === 'estimation').length;
  
  return {
    hasCache: true,
    cacheAge: Math.round(cacheAgeMs / 1000 / 60),
    cacheAgeMs,
    matchesCount: cache.matches.length,
    matchesWithOdds: espnCount + oddsApiCount,
    matchesWithoutOdds: estimatedCount,
    source: 'ESPN → Odds API → Estimations',
    breakdown: {
      espnDraftKings: espnCount,
      theOddsApi: oddsApiCount,
      estimated: estimatedCount,
    },
    quotaCost: 0,
    lastUpdate: cache.lastUpdate,
    reliability: espnCount > 0 ? 'Haute (ESPN DraftKings)' : 
                 oddsApiCount > 0 ? 'Haute (The Odds API)' : 'Moyenne (Estimations)',
  };
}

// Export par défaut
const espnOddsService = {
  fetchAllESPNOdds,
  fetchESPNFootballOdds,
  fetchESPNNBAOdds,
  fetchESPNNHLOdds,
  fetchESPNLiveOdds,
  findESPNOddsForMatch,
  getESPNStatus,
  getESPNOddsStats,
  forceRefreshESPN,
};

export default espnOddsService;
