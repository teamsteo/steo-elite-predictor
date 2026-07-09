/**
 * Tennis Live Data Service - DONNÉES GRATUITES ET À JOUR
 * 
 * Sources:
 * 1. Jeff Sackmann GitHub (GRATUIT)
 *    - Classements ATP/WTA mis à jour chaque semaine
 *    - Historique des matchs avec statistiques
 *    - Infos joueurs (taille, main, pays)
 * 
 * 2. Central Odds Manager (gestionnaire de quota unique)
 *    - Matchs à venir avec cotes
 *    - Couvre ATP, WTA, Challenger
 */

// ============================================
// TYPES & INTERFACES
// ============================================

export interface LiveRanking {
  rank: number;
  playerId: string;
  playerName: string;
  country: string;
  points: number;
  movement: number; // Changement de position
}

export interface LivePlayerData {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  country: string;
  hand: 'R' | 'L' | 'U';
  height: number | null;
  birthDate: string | null;
  ranking: number;
  rankingPoints: number;
  
  // Forme récente calculée
  recentMatches: RecentMatch[];
  recentWinRate: number;
  surfaceWinRates: {
    hard: number;
    clay: number;
    grass: number;
    indoor: number;
  };
  
  lastUpdated: Date;
}

export interface RecentMatch {
  date: string;
  opponent: string;
  won: boolean;
  score: string;
  surface: string;
  tournament: string;
  ranking?: number;
}

export interface UpcomingMatch {
  id: string;
  player1: string;
  player2: string;
  player1Id: string;
  player2Id: string;
  tournament: string;
  tournamentTier: 'grand_slam' | 'masters_1000' | 'atp_500' | 'atp_250' | 'wta_1000' | 'wta_500' | 'wta_250' | 'challenger_175' | 'challenger_125' | 'challenger_100' | 'challenger_75' | 'challenger_50' | 'itf' | 'unknown';
  surface: 'hard' | 'clay' | 'grass' | 'indoor';
  date: Date;
  odds1: number | null;
  odds2: number | null;
  round: string;
  status: 'scheduled' | 'live' | 'finished';
  source: 'oddsapi' | 'betexplorer';
}

// ============================================
// CONFIGURATION
// ============================================

const JEFF_SACKMANN_BASE = 'https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master';
const JEFF_SACKMANN_WTA_BASE = 'https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master';
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

// Cache - AUGMENTÉ pour économiser les crédits API
const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 heures (était 6h)
const MATCHES_CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 heures pour les matchs à venir
let rankingsCache: { atp: LiveRanking[]; wta: LiveRanking[]; timestamp: number } | null = null;
let playersCache: Map<string, LivePlayerData> = new Map();
let upcomingMatchesCache: { matches: UpcomingMatch[]; timestamp: number } | null = null;

// ============================================
// 1. CLASSEMENTS ATP/WTA (JEFF SACKMANN)
// ============================================

/**
 * Récupère les classements ATP actuels
 */
export async function fetchATPRankings(): Promise<LiveRanking[]> {
  try {
    // Vérifier le cache
    if (rankingsCache && Date.now() - rankingsCache.timestamp < CACHE_DURATION) {
      return rankingsCache.atp;
    }
    
    console.log('[TennisLiveData] 📊 Récupération classements ATP...');
    
    // Récupérer les classements
    const rankingsResponse = await fetch(`${JEFF_SACKMANN_BASE}/atp_rankings_current.csv`);
    if (!rankingsResponse.ok) throw new Error('Erreur récupération classements');
    
    const rankingsText = await rankingsResponse.text();
    const rankingsLines = rankingsText.trim().split('\n');
    
    // Récupérer les joueurs pour avoir les noms
    const playersMap = await fetchPlayersMap('atp');
    
    const rankings: LiveRanking[] = [];
    
    for (let i = 1; i < rankingsLines.length && i <= 100; i++) {
      const parts = rankingsLines[i].split(',');
      if (parts.length >= 4) {
        const playerId = parts[2].trim();
        const playerName = playersMap.get(playerId) || `Player ${playerId}`;
        
        rankings.push({
          rank: parseInt(parts[1]),
          playerId,
          playerName,
          country: playersMap.get(`${playerId}_country`) || 'UNK',
          points: parseInt(parts[3]),
          movement: 0, // Calculé plus tard si données disponibles
        });
      }
    }
    
    console.log(`[TennisLiveData] ✅ ${rankings.length} classements ATP récupérés`);
    
    // Mettre en cache
    if (!rankingsCache) rankingsCache = { atp: [], wta: [], timestamp: 0 };
    rankingsCache.atp = rankings;
    rankingsCache.timestamp = Date.now();
    
    return rankings;
    
  } catch (error) {
    console.error('[TennisLiveData] Erreur classements ATP:', error);
    return [];
  }
}

/**
 * Récupère les classements WTA actuels
 */
export async function fetchWTARankings(): Promise<LiveRanking[]> {
  try {
    if (rankingsCache && Date.now() - rankingsCache.timestamp < CACHE_DURATION) {
      return rankingsCache.wta;
    }
    
    console.log('[TennisLiveData] 📊 Récupération classements WTA...');
    
    const rankingsResponse = await fetch(`${JEFF_SACKMANN_WTA_BASE}/wta_rankings_current.csv`);
    if (!rankingsResponse.ok) throw new Error('Erreur récupération classements WTA');
    
    const rankingsText = await rankingsResponse.text();
    const rankingsLines = rankingsText.trim().split('\n');
    
    const playersMap = await fetchPlayersMap('wta');
    
    const rankings: LiveRanking[] = [];
    
    for (let i = 1; i < rankingsLines.length && i <= 100; i++) {
      const parts = rankingsLines[i].split(',');
      if (parts.length >= 4) {
        const playerId = parts[2].trim();
        const playerName = playersMap.get(playerId) || `Player ${playerId}`;
        
        rankings.push({
          rank: parseInt(parts[1]),
          playerId,
          playerName,
          country: playersMap.get(`${playerId}_country`) || 'UNK',
          points: parseInt(parts[3]),
          movement: 0,
        });
      }
    }
    
    console.log(`[TennisLiveData] ✅ ${rankings.length} classements WTA récupérés`);
    
    if (!rankingsCache) rankingsCache = { atp: [], wta: [], timestamp: 0 };
    rankingsCache.wta = rankings;
    rankingsCache.timestamp = Date.now();
    
    return rankings;
    
  } catch (error) {
    console.error('[TennisLiveData] Erreur classements WTA:', error);
    return [];
  }
}

/**
 * Récupère la map des joueurs (id -> nom)
 */
async function fetchPlayersMap(category: 'atp' | 'wta'): Promise<Map<string, string>> {
  const playersMap = new Map<string, string>();
  
  try {
    const baseUrl = category === 'atp' ? JEFF_SACKMANN_BASE : JEFF_SACKMANN_WTA_BASE;
    const response = await fetch(`${baseUrl}/${category}_players.csv`);
    
    if (!response.ok) return playersMap;
    
    const text = await response.text();
    const lines = text.trim().split('\n');
    
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length >= 4) {
        const playerId = parts[0].trim();
        const firstName = parts[1].trim().replace(/"/g, '');
        const lastName = parts[2].trim().replace(/"/g, '');
        const country = parts[4]?.trim().replace(/"/g, '') || 'UNK';
        
        playersMap.set(playerId, `${firstName} ${lastName}`);
        playersMap.set(`${playerId}_country`, country);
        playersMap.set(`${playerId}_firstname`, firstName);
        playersMap.set(`${playerId}_lastname`, lastName);
      }
    }
    
  } catch (error) {
    console.error('[TennisLiveData] Erreur récupération joueurs:', error);
  }
  
  return playersMap;
}

// ============================================
// 2. FORME RÉCENTE (HISTORIQUE MATCHS)
// ============================================

/**
 * Calcule la forme récente d'un joueur depuis l'historique
 */
export async function calculateRecentForm(
  playerId: string,
  category: 'atp' | 'wta' = 'atp'
): Promise<{ matches: RecentMatch[]; winRate: number; surfaceStats: Record<string, number> }> {
  try {
    const baseUrl = category === 'atp' ? JEFF_SACKMANN_BASE : JEFF_SACKMANN_WTA_BASE;
    const currentYear = new Date().getFullYear();
    
    // Récupérer les matchs de l'année en cours
    const matchesResponse = await fetch(`${baseUrl}/${category}_matches_${currentYear}.csv`);
    
    if (!matchesResponse.ok) {
      // Essayer l'année précédente si pas de données
      const prevYearResponse = await fetch(`${baseUrl}/${category}_matches_${currentYear - 1}.csv`);
      if (!prevYearResponse.ok) {
        return { matches: [], winRate: 0.5, surfaceStats: { hard: 0.5, clay: 0.5, grass: 0.5, indoor: 0.5 } };
      }
    }
    
    const text = await matchesResponse.text();
    const lines = text.trim().split('\n');
    
    const recentMatches: RecentMatch[] = [];
    const surfaceWins: Record<string, number> = { hard: 0, clay: 0, grass: 0, indoor: 0 };
    const surfaceTotal: Record<string, number> = { hard: 0, clay: 0, grass: 0, indoor: 0 };
    
    // Parser l'en-tête pour trouver les indices
    const headers = lines[0].split(',');
    const winnerIdIdx = headers.indexOf('winner_id');
    const loserIdIdx = headers.indexOf('loser_id');
    const winnerNameIdx = headers.indexOf('winner_name');
    const loserNameIdx = headers.indexOf('loser_name');
    const scoreIdx = headers.indexOf('score');
    const surfaceIdx = headers.indexOf('surface');
    const tourneyIdx = headers.indexOf('tourney_name');
    const dateIdx = headers.indexOf('tourney_date');
    const winnerRankIdx = headers.indexOf('winner_rank');
    const loserRankIdx = headers.indexOf('loser_rank');
    
    // Chercher les matchs du joueur
    for (let i = 1; i < lines.length && recentMatches.length < 20; i++) {
      const parts = lines[i].split(',');
      
      const winnerId = parts[winnerIdIdx]?.trim();
      const loserId = parts[loserIdIdx]?.trim();
      
      if (winnerId === playerId || loserId === playerId) {
        const won = winnerId === playerId;
        const opponentName = won ? parts[loserNameIdx]?.trim() : parts[winnerNameIdx]?.trim();
        const surface = parts[surfaceIdx]?.trim().toLowerCase() || 'hard';
        const normalizedSurface = normalizeSurface(surface);
        
        recentMatches.push({
          date: parts[dateIdx]?.trim() || '',
          opponent: opponentName || 'Unknown',
          won,
          score: parts[scoreIdx]?.trim() || '',
          surface: normalizedSurface,
          tournament: parts[tourneyIdx]?.trim() || '',
          ranking: won ? parseInt(parts[loserRankIdx]) : parseInt(parts[winnerRankIdx]),
        });
        
        // Stats par surface
        surfaceTotal[normalizedSurface]++;
        if (won) surfaceWins[normalizedSurface]++;
      }
    }
    
    // Calculer les win rates
    const wins = recentMatches.filter(m => m.won).length;
    const winRate = recentMatches.length > 0 ? wins / recentMatches.length : 0.5;
    
    const surfaceStats: Record<string, number> = {};
    for (const surface of ['hard', 'clay', 'grass', 'indoor']) {
      surfaceStats[surface] = surfaceTotal[surface] > 0 
        ? surfaceWins[surface] / surfaceTotal[surface] 
        : 0.5;
    }
    
    return { matches: recentMatches, winRate, surfaceStats };
    
  } catch (error) {
    console.error('[TennisLiveData] Erreur calcul forme:', error);
    return { matches: [], winRate: 0.5, surfaceStats: { hard: 0.5, clay: 0.5, grass: 0.5, indoor: 0.5 } };
  }
}

function normalizeSurface(surface: string): 'hard' | 'clay' | 'grass' | 'indoor' {
  const s = surface.toLowerCase();
  if (s.includes('clay') || s.includes('terre')) return 'clay';
  if (s.includes('grass') || s.includes('herbe')) return 'grass';
  if (s.includes('indoor') || s.includes('carpet')) return 'indoor';
  return 'hard';
}

// ============================================
// 3. MATCHS À VENIR (VIA QUOTA MANAGER)
// ============================================

/**
 * Récupère les matchs à venir
 * 🎾 V2: Appel DIRECT à l'API + cache mémoire court (pas de quota manager)
 * Le quota manager ne fonctionne pas sur Vercel (serverless = pas de persistence)
 */
export async function fetchUpcomingMatches(): Promise<UpcomingMatch[]> {
  // Vérifier le cache local d'abord - 2h
  if (upcomingMatchesCache && Date.now() - upcomingMatchesCache.timestamp < MATCHES_CACHE_DURATION) {
    console.log('[TennisLiveData] 📦 Cache local HIT (2h)');
    return upcomingMatchesCache.matches;
  }
  
  const apiKey = process.env.THE_ODDS_API_KEY || process.env.ODDS_API_KEY || 'fcf0d3cbc8958a44007b0520751f8431';
  
  if (!apiKey) {
    console.log('[TennisLiveData] ⚠️ THE_ODDS_API_KEY non configurée');
    return [];
  }
  
  console.log('[TennisLiveData] 🎾 Récupération matchs via API DIRECTE (pas de quota manager)...');
  
  try {
    const allMatches: any[] = [];
    
    // 🎾 Trouver les matchs en appelant les sport_keys les plus probables
    // Stratégie: on appelle d'abord les grands tournois spécifiques, puis le générique
    // On ne fait que 2-3 appels max pour économiser le quota mensuel
    const today = new Date();
    const month = today.getMonth(); // 0-11
    
    // Déterminer quels sport_keys appeler selon la période de l'année
    const sportKeysToTry: string[] = [];
    
    // Grand Chelems - vérifier les dates approximatives
    // Australian Open: janvier
    if (month === 0) {
      sportKeysToTry.push('tennis_atp_australian_open', 'tennis_wta_australian_open');
    }
    // Roland-Garros: fin mai - début juin
    if (month === 4 || month === 5) {
      sportKeysToTry.push('tennis_atp_french_open', 'tennis_wta_french_open');
    }
    // Wimbledon: fin juin - mi juillet
    if (month === 6) {
      sportKeysToTry.push('tennis_atp_wimbledon', 'tennis_wta_wimbledon');
    }
    // US Open: fin août - mi septembre
    if (month === 8) {
      sportKeysToTry.push('tennis_atp_us_open', 'tennis_wta_us_open');
    }
    
    // Toujours ajouter le générique en fallback
    sportKeysToTry.push('tennis_atp', 'tennis_wta');
    
    // Limiter à 3 appels max pour économiser le quota
    const keysToFetch = sportKeysToTry.slice(0, 3);
    
    for (const sportKey of keysToFetch) {
      try {
        const response = await fetch(
          `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=eu&markets=h2h&oddsFormat=decimal`
        );
        
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            console.log(`[TennisLiveData] ✅ ${sportKey}: ${data.length} matchs`);
            for (const event of data) {
              allMatches.push({ ...event, _sport_key: sportKey });
            }
          }
        } else {
          console.log(`[TennisLiveData] ⚠️ ${sportKey}: HTTP ${response.status}`);
        }
      } catch (e) {
        console.log(`[TennisLiveData] ⚠️ Erreur ${sportKey}: ${e}`);
      }
    }
    
    // Convertir au format UpcomingMatch
    const matches: UpcomingMatch[] = [];
    const seen = new Set<string>();
    
    for (const event of allMatches) {
      // Dédupliquer par noms de joueurs
      const key = `${event.home_team}_${event.away_team}`;
      if (seen.has(key)) continue;
      seen.add(key);
      
      const sportKey = event._sport_key || event.sport_key || '';
      const category = sportKey.includes('wta') ? 'wta' : 'atp';
      const match = parseOddsAPIEvent(event, category);
      if (match) matches.push(match);
    }
    
    // Mettre en cache local
    upcomingMatchesCache = { matches, timestamp: Date.now() };
    
    console.log(`[TennisLiveData] ✅ ${matches.length} matchs uniques récupérés`);
    
    return matches;
    
  } catch (error) {
    console.error('[TennisLiveData] Erreur matchs à venir:', error);
    return [];
  }
}

function parseOddsAPIEvent(event: any, category: 'atp' | 'wta'): UpcomingMatch | null {
  try {
    let odds1: number | null = null;
    let odds2: number | null = null;
    
    if (event.bookmakers && event.bookmakers.length > 0) {
      const h2h = event.bookmakers[0].markets?.find((m: any) => m.key === 'h2h');
      if (h2h) {
        for (const outcome of h2h.outcomes) {
          if (outcome.name === event.home_team) odds1 = outcome.price;
          else if (outcome.name === event.away_team) odds2 = outcome.price;
        }
      }
    }
    
    const tournamentName = event.sport_title || 'Tennis Tournament';
    
    return {
      id: event.id,
      player1: event.home_team,
      player2: event.away_team,
      player1Id: `player_${event.home_team.toLowerCase().replace(/[^a-z]/g, '')}`,
      player2Id: `player_${event.away_team.toLowerCase().replace(/[^a-z]/g, '')}`,
      tournament: tournamentName,
      tournamentTier: detectTournamentTier(tournamentName, category),
      surface: detectSurface(tournamentName),
      date: new Date(event.commence_time),
      odds1,
      odds2,
      round: 'Match',
      status: 'scheduled',
      source: 'oddsapi',
    };
  } catch (error) {
    return null;
  }
}

function detectTournamentTier(tournament: string, category: 'atp' | 'wta'): UpcomingMatch['tournamentTier'] {
  const t = tournament.toLowerCase();
  
  if (t.includes('roland') || t.includes('french') || t.includes('wimbledon') || 
      t.includes('australian') || t.includes('us open') || t.includes('grand slam')) {
    return 'grand_slam';
  }
  
  if (t.includes('masters') || t.includes('1000') || t.includes('indian wells') || 
      t.includes('miami') || t.includes('madrid') || t.includes('rome')) {
    return category === 'atp' ? 'masters_1000' : 'wta_1000';
  }
  
  if (t.includes('500')) return category === 'atp' ? 'atp_500' : 'wta_500';
  if (t.includes('challenger')) return 'challenger_100'; // Valeur par défaut pour challenger
  
  return category === 'atp' ? 'atp_250' : 'wta_250';
}

function detectSurface(tournament: string): 'hard' | 'clay' | 'grass' | 'indoor' {
  const t = tournament.toLowerCase();
  
  if (t.includes('clay') || t.includes('roland') || t.includes('french') || 
      t.includes('monte carlo') || t.includes('rome') || t.includes('barcelona')) {
    return 'clay';
  }
  
  if (t.includes('grass') || t.includes('wimbledon') || t.includes('halle') || 
      t.includes('queen') || t.includes('eastbourne')) {
    return 'grass';
  }
  
  if (t.includes('indoor') || t.includes('rotterdam') || t.includes('paris masters') ||
      t.includes('vienna') || t.includes('basel')) {
    return 'indoor';
  }
  
  return 'hard';
}

// ============================================
// 4. API PUBLIQUE EXPOSÉE
// ============================================

/**
 * Récupère les données complètes d'un joueur
 */
export async function getLivePlayerData(
  playerName: string,
  category: 'atp' | 'wta' = 'atp'
): Promise<LivePlayerData | null> {
  try {
    // Chercher dans le cache
    const cacheKey = `${category}_${playerName.toLowerCase()}`;
    const cached = playersCache.get(cacheKey);
    if (cached && Date.now() - cached.lastUpdated.getTime() < CACHE_DURATION) {
      return cached;
    }
    
    // Récupérer les classements
    const rankings = category === 'atp' ? await fetchATPRankings() : await fetchWTARankings();
    
    // Trouver le joueur par nom
    const ranking = rankings.find(r => 
      r.playerName.toLowerCase().includes(playerName.toLowerCase()) ||
      playerName.toLowerCase().includes(r.playerName.toLowerCase())
    );
    
    if (!ranking) {
      console.log(`[TennisLiveData] Joueur non trouvé: ${playerName}`);
      return null;
    }
    
    // Récupérer les infos détaillées
    const playersMap = await fetchPlayersMap(category);
    
    const playerData: LivePlayerData = {
      id: ranking.playerId,
      name: ranking.playerName,
      firstName: playersMap.get(`${ranking.playerId}_firstname`) || '',
      lastName: playersMap.get(`${ranking.playerId}_lastname`) || '',
      country: ranking.country,
      hand: 'R',
      height: null,
      birthDate: null,
      ranking: ranking.rank,
      rankingPoints: ranking.points,
      recentMatches: [],
      recentWinRate: 0.5,
      surfaceWinRates: { hard: 0.5, clay: 0.5, grass: 0.5, indoor: 0.5 },
      lastUpdated: new Date(),
    };
    
    // Calculer la forme récente
    const form = await calculateRecentForm(ranking.playerId, category);
    playerData.recentMatches = form.matches;
    playerData.recentWinRate = form.winRate;
    // Convertir Record<string, number> en type surface explicite
    playerData.surfaceWinRates = {
      hard: form.surfaceStats['hard'] ?? 0.5,
      clay: form.surfaceStats['clay'] ?? 0.5,
      grass: form.surfaceStats['grass'] ?? 0.5,
      indoor: form.surfaceStats['indoor'] ?? 0.5,
    };
    
    // Mettre en cache
    playersCache.set(cacheKey, playerData);
    
    return playerData;
    
  } catch (error) {
    console.error('[TennisLiveData] Erreur getLivePlayerData:', error);
    return null;
  }
}

/**
 * Récupère tous les matchs à venir avec données enrichies
 */
export async function getEnrichedUpcomingMatches(): Promise<(UpcomingMatch & {
  player1Data?: LivePlayerData;
  player2Data?: LivePlayerData;
})[]> {
  const matches = await fetchUpcomingMatches();
  
  type EnrichedMatch = UpcomingMatch & {
    player1Data?: LivePlayerData;
    player2Data?: LivePlayerData;
  };
  
  const enriched: EnrichedMatch[] = [];
  
  for (const match of matches) {
    const category = match.tournament.includes('WTA') ? 'wta' : 'atp';
    
    const [player1Data, player2Data] = await Promise.all([
      getLivePlayerData(match.player1, category),
      getLivePlayerData(match.player2, category),
    ]);
    
    enriched.push({
      ...match,
      player1Data: player1Data || undefined,
      player2Data: player2Data || undefined,
    });
  }
  
  return enriched;
}

/**
 * Statut du service
 */
export function getLiveDataStatus(): {
  rankingsCached: boolean;
  matchesCached: boolean;
  playersCached: number;
  hasOddsApiKey: boolean;
} {
  return {
    rankingsCached: rankingsCache !== null,
    matchesCached: upcomingMatchesCache !== null,
    playersCached: playersCache.size,
    hasOddsApiKey: !!(process.env.THE_ODDS_API_KEY || process.env.ODDS_API_KEY),
  };
}

// ============================================
// EXPORTS
// ============================================

export default {
  fetchATPRankings,
  fetchWTARankings,
  fetchUpcomingMatches,
  getLivePlayerData,
  getEnrichedUpcomingMatches,
  calculateRecentForm,
  getLiveDataStatus,
};
