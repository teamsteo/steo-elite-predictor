/**
 * Jeff Sackmann Data Service - Récupération des données tennis depuis GitHub
 * 
 * DONNÉES GRATUITES ET FIABLES:
 * - Classements ATP/WTA à jour
 * - Infos joueurs (nom, pays, taille, âge)
 * - Matchs historiques avec statistiques détaillées
 * - Performance par surface
 * 
 * Source: https://github.com/JeffSackmann/tennis_atp et tennis_wta
 * Année: 2026
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  JEFF_SACKMANN_URLS,
  CACHE_CONFIG,
  JeffSackmannRanking,
  JeffSackmannPlayer,
  JeffSackmannMatch,
} from './tennis-sources-2026';

// ============================================
// INTERFACES
// ============================================

interface CachedData<T> {
  data: T;
  timestamp: number;
  source: string;
}

interface PlayerWithRanking {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  country: string;
  ranking: number;
  points: number;
  movement: number;
  hand: 'R' | 'L' | 'U';
  height: number;
  age: number;
  birthDate: string;
}

interface ProcessedMatch {
  id: string;
  date: string;
  tournament: string;
  surface: 'hard' | 'clay' | 'grass' | 'carpet';
  level: string;
  round: string;
  winner: string;
  winnerId: string;
  winnerRank: number;
  loser: string;
  loserId: string;
  loserRank: number;
  score: string;
  oddsWinner?: number;
  oddsLoser?: number;
  duration: number;
  stats?: {
    winnerAces: number;
    winnerDoubleFaults: number;
    winnerFirstServePct: number;
    winnerBreakPointsSaved: number;
    loserAces: number;
    loserDoubleFaults: number;
  };
}

// ============================================
// CONFIGURATION
// ============================================

const DATA_DIR = path.join(process.cwd(), 'data');
const CACHE_DIR = path.join(DATA_DIR, 'cache');

const HEADERS = {
  'User-Agent': 'PronosticsApp/2026.1 (Tennis Predictions System)',
  'Accept': 'text/plain, text/csv, application/json',
};

// ============================================
// CACHE MANAGEMENT
// ============================================

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCached<T>(key: string, ttlHours: number): T | null {
  ensureCacheDir();
  const cacheFile = path.join(CACHE_DIR, `${key}.json`);
  
  try {
    if (fs.existsSync(cacheFile)) {
      const cached: CachedData<T> = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      const age = Date.now() - cached.timestamp;
      const ttlMs = ttlHours * 60 * 60 * 1000;
      
      if (age < ttlMs) {
        console.log(`✅ Cache hit: ${key} (${Math.round(age / 60000)}min old)`);
        return cached.data;
      }
    }
  } catch (error) {
    console.log(`⚠️ Cache read error for ${key}:`, error);
  }
  
  return null;
}

function setCache<T>(key: string, data: T): void {
  ensureCacheDir();
  const cacheFile = path.join(CACHE_DIR, `${key}.json`);
  
  const cached: CachedData<T> = {
    data,
    timestamp: Date.now(),
    source: 'jeff_sackmann_2026',
  };
  
  fs.writeFileSync(cacheFile, JSON.stringify(cached, null, 2));
  console.log(`💾 Cached: ${key}`);
}

// ============================================
// CSV PARSER
// ============================================

function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const rows: Record<string, string>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    if (values.length >= headers.length) {
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });
      rows.push(row);
    }
  }
  
  return rows;
}

// ============================================
// FETCH ATP RANKINGS 2026
// ============================================

export async function fetchATPRankings(): Promise<PlayerWithRanking[]> {
  // Vérifier le cache
  const cached = getCached<PlayerWithRanking[]>('atp_rankings_2026', CACHE_CONFIG.rankings.ttlHours);
  if (cached) return cached;
  
  console.log('📊 Fetching ATP Rankings 2026 from Jeff Sackmann...');
  
  try {
    // 1. Récupérer les classements
    const rankingsRes = await fetch(JEFF_SACKMANN_URLS.atpSingles, { headers: HEADERS });
    if (!rankingsRes.ok) {
      throw new Error(`Rankings fetch failed: ${rankingsRes.status}`);
    }
    
    const rankingsCSV = await rankingsRes.text();
    const rankingsData = parseCSV(rankingsCSV);
    
    // 2. Récupérer les infos joueurs
    const playersRes = await fetch(JEFF_SACKMANN_URLS.atpPlayers, { headers: HEADERS });
    if (!playersRes.ok) {
      throw new Error(`Players fetch failed: ${playersRes.status}`);
    }
    
    const playersCSV = await playersRes.text();
    const playersData = parseCSV(playersCSV);
    
    // 3. Créer une map des joueurs
    const playersMap = new Map<string, JeffSackmannPlayer>();
    for (const row of playersData) {
      playersMap.set(row['player_id'], {
        player_id: row['player_id'],
        name_first: row['name_first'] || '',
        name_last: row['name_last'] || '',
        hand: row['hand'] || 'U',
        ioc: row['ioc'] || '',
        birth_date: row['birth_date'] || '',
        height: parseInt(row['height']) || 0,
      });
    }
    
    // 4. Combiner les données
    const players: PlayerWithRanking[] = [];
    
    for (const row of rankingsData.slice(0, 500)) { // Top 500
      const playerId = row['player_id'];
      const playerInfo = playersMap.get(playerId);
      
      if (playerInfo) {
        const ranking: JeffSackmannRanking = {
          ranking_date: row['ranking_date'] || '',
          rank: parseInt(row['rank']) || 999,
          player_id: playerId,
          points: parseInt(row['points']) || 0,
          odd: parseInt(row['odd']) || 0,
          movement: (parseInt(row['odd']) || 0) - (parseInt(row['rank']) || 0),
        };
        
        // Calculer l'âge
        let age = 0;
        if (playerInfo.birth_date && playerInfo.birth_date.length === 8) {
          const birthYear = parseInt(playerInfo.birth_date.substring(0, 4));
          age = 2026 - birthYear;
        }
        
        players.push({
          id: playerId,
          name: `${playerInfo.name_first} ${playerInfo.name_last}`.trim(),
          firstName: playerInfo.name_first,
          lastName: playerInfo.name_last,
          country: playerInfo.ioc,
          ranking: ranking.rank,
          points: ranking.points,
          movement: ranking.movement,
          hand: playerInfo.hand as 'R' | 'L' | 'U',
          height: playerInfo.height,
          age,
          birthDate: playerInfo.birth_date,
        });
      }
    }
    
    console.log(`✅ ATP Rankings: ${players.length} joueurs`);
    
    // Sauvegarder dans le cache
    setCache('atp_rankings_2026', players);
    
    return players;
    
  } catch (error) {
    console.error('❌ Erreur fetch ATP rankings:', error);
    return getFallbackATPRankings();
  }
}

// ============================================
// FETCH WTA RANKINGS 2026
// ============================================

export async function fetchWTARankings(): Promise<PlayerWithRanking[]> {
  // Vérifier le cache
  const cached = getCached<PlayerWithRanking[]>('wta_rankings_2026', CACHE_CONFIG.rankings.ttlHours);
  if (cached) return cached;
  
  console.log('📊 Fetching WTA Rankings 2026 from Jeff Sackmann...');
  
  try {
    const rankingsRes = await fetch(JEFF_SACKMANN_URLS.wtaSingles, { headers: HEADERS });
    if (!rankingsRes.ok) throw new Error(`Status: ${rankingsRes.status}`);
    
    const rankingsCSV = await rankingsRes.text();
    const rankingsData = parseCSV(rankingsCSV);
    
    const playersRes = await fetch(JEFF_SACKMANN_URLS.wtaPlayers, { headers: HEADERS });
    if (!playersRes.ok) throw new Error(`Status: ${playersRes.status}`);
    
    const playersCSV = await playersRes.text();
    const playersData = parseCSV(playersCSV);
    
    const playersMap = new Map<string, JeffSackmannPlayer>();
    for (const row of playersData) {
      playersMap.set(row['player_id'], {
        player_id: row['player_id'],
        name_first: row['name_first'] || '',
        name_last: row['name_last'] || '',
        hand: row['hand'] || 'U',
        ioc: row['ioc'] || '',
        birth_date: row['birth_date'] || '',
        height: parseInt(row['height']) || 0,
      });
    }
    
    const players: PlayerWithRanking[] = [];
    
    for (const row of rankingsData.slice(0, 500)) {
      const playerId = row['player_id'];
      const playerInfo = playersMap.get(playerId);
      
      if (playerInfo) {
        let age = 0;
        if (playerInfo.birth_date && playerInfo.birth_date.length === 8) {
          const birthYear = parseInt(playerInfo.birth_date.substring(0, 4));
          age = 2026 - birthYear;
        }
        
        players.push({
          id: playerId,
          name: `${playerInfo.name_first} ${playerInfo.name_last}`.trim(),
          firstName: playerInfo.name_first,
          lastName: playerInfo.name_last,
          country: playerInfo.ioc,
          ranking: parseInt(row['rank']) || 999,
          points: parseInt(row['points']) || 0,
          movement: (parseInt(row['odd']) || 0) - (parseInt(row['rank']) || 0),
          hand: playerInfo.hand as 'R' | 'L' | 'U',
          height: playerInfo.height,
          age,
          birthDate: playerInfo.birth_date,
        });
      }
    }
    
    console.log(`✅ WTA Rankings: ${players.length} joueuses`);
    setCache('wta_rankings_2026', players);
    
    return players;
    
  } catch (error) {
    console.error('❌ Erreur fetch WTA rankings:', error);
    return getFallbackWTARankings();
  }
}

// ============================================
// FETCH HISTORICAL MATCHES 2026
// ============================================

export async function fetchATPMatches2026(): Promise<ProcessedMatch[]> {
  const cached = getCached<ProcessedMatch[]>('atp_matches_2026', 24);
  if (cached) return cached;
  
  console.log('📊 Fetching ATP Matches 2026...');
  
  try {
    const res = await fetch(JEFF_SACKMANN_URLS.atpMatches2026, { headers: HEADERS });
    if (!resRes.ok) throw new Error(`Status: ${res.status}`);
    
    const csv = await res.text();
    const rows = parseCSV(csv);
    
    const matches: ProcessedMatch[] = rows.map(row => ({
      id: `${row['tourney_id']}_${row['match_num']}`,
      date: row['tourney_date'] || '',
      tournament: row['tourney_name'] || '',
      surface: (row['surface']?.toLowerCase() || 'hard') as 'hard' | 'clay' | 'grass' | 'carpet',
      level: row['tourney_level'] || 'A',
      round: row['round'] || '',
      winner: row['winner_name'] || '',
      winnerId: row['winner_id'] || '',
      winnerRank: parseInt(row['winner_rank']) || 999,
      loser: row['loser_name'] || '',
      loserId: row['loser_id'] || '',
      loserRank: parseInt(row['loser_rank']) || 999,
      score: row['score'] || '',
      duration: parseInt(row['minutes']) || 0,
      stats: {
        winnerAces: parseInt(row['w_ace']) || 0,
        winnerDoubleFaults: parseInt(row['w_df']) || 0,
        winnerFirstServePct: row['w_1stIn'] && row['w_svPt'] 
          ? Math.round((parseInt(row['w_1stIn']) / parseInt(row['w_svPt'])) * 100)
          : 0,
        winnerBreakPointsSaved: parseInt(row['w_bpSaved']) || 0,
        loserAces: parseInt(row['l_ace']) || 0,
        loserDoubleFaults: parseInt(row['l_df']) || 0,
      },
    }));
    
    console.log(`✅ ATP Matches 2026: ${matches.length} matchs`);
    setCache('atp_matches_2026', matches);
    
    return matches;
    
  } catch (error) {
    console.error('❌ Erreur fetch ATP matches:', error);
    return [];
  }
}

// ============================================
// CALCULER FORME RÉCENTE
// ============================================

export async function calculateRecentForm(
  playerId: string,
  matches: ProcessedMatch[]
): Promise<{
  wins: number;
  losses: number;
  last10: ('W' | 'L')[];
  winStreak: number;
  surfaceWins: Record<string, number>;
  surfaceLosses: Record<string, number>;
}> {
  const playerMatches = matches
    .filter(m => m.winnerId === playerId || m.loserId === playerId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20);
  
  let wins = 0;
  let losses = 0;
  const last10: ('W' | 'L')[] = [];
  let winStreak = 0;
  const surfaceWins: Record<string, number> = { hard: 0, clay: 0, grass: 0, carpet: 0 };
  const surfaceLosses: Record<string, number> = { hard: 0, clay: 0, grass: 0, carpet: 0 };
  
  for (const match of playerMatches) {
    const isWinner = match.winnerId === playerId;
    
    if (isWinner) {
      wins++;
      if (last10.length < 10) last10.push('W');
      surfaceWins[match.surface]++;
    } else {
      losses++;
      if (last10.length < 10) last10.push('L');
      surfaceLosses[match.surface]++;
    }
  }
  
  // Calculer série de victoires
  for (const result of last10) {
    if (result === 'W') winStreak++;
    else break;
  }
  
  return { wins, losses, last10, winStreak, surfaceWins, surfaceLosses };
}

// ============================================
// FALLBACK DATA
// ============================================

function getFallbackATPRankings(): PlayerWithRanking[] {
  return [
    { id: 'sinner', name: 'Jannik Sinner', firstName: 'Jannik', lastName: 'Sinner', country: 'ITA', ranking: 1, points: 11830, movement: 0, hand: 'R', height: 188, age: 24, birthDate: '20010816' },
    { id: 'zverev', name: 'Alexander Zverev', firstName: 'Alexander', lastName: 'Zverev', country: 'GER', ranking: 2, points: 8185, movement: 0, hand: 'R', height: 198, age: 29, birthDate: '19970420' },
    { id: 'alcaraz', name: 'Carlos Alcaraz', firstName: 'Carlos', lastName: 'Alcaraz', country: 'ESP', ranking: 3, points: 7585, movement: 0, hand: 'R', height: 183, age: 23, birthDate: '20030505' },
    { id: 'fritz', name: 'Taylor Fritz', firstName: 'Taylor', lastName: 'Fritz', country: 'USA', ranking: 4, points: 5100, movement: 0, hand: 'R', height: 193, age: 28, birthDate: '19971028' },
    { id: 'ruud', name: 'Casper Ruud', firstName: 'Casper', lastName: 'Ruud', country: 'NOR', ranking: 5, points: 4155, movement: 0, hand: 'R', height: 183, age: 27, birthDate: '19981222' },
    { id: 'medvedev', name: 'Daniil Medvedev', firstName: 'Daniil', lastName: 'Medvedev', country: 'RUS', ranking: 6, points: 3950, movement: 0, hand: 'R', height: 198, age: 30, birthDate: '19960211' },
    { id: 'djokovic', name: 'Novak Djokovic', firstName: 'Novak', lastName: 'Djokovic', country: 'SRB', ranking: 7, points: 3750, movement: 0, hand: 'R', height: 188, age: 39, birthDate: '19870522' },
    { id: 'deminaur', name: 'Alex de Minaur', firstName: 'Alex', lastName: 'de Minaur', country: 'AUS', ranking: 8, points: 3530, movement: 0, hand: 'R', height: 183, age: 27, birthDate: '19990217' },
    { id: 'rublev', name: 'Andrey Rublev', firstName: 'Andrey', lastName: 'Rublev', country: 'RUS', ranking: 9, points: 3400, movement: 0, hand: 'R', height: 188, age: 28, birthDate: '19971020' },
    { id: 'tsitsipas', name: 'Stefanos Tsitsipas', firstName: 'Stefanos', lastName: 'Tsitsipas', country: 'GRE', ranking: 10, points: 3200, movement: 0, hand: 'R', height: 193, age: 27, birthDate: '19980812' },
  ];
}

function getFallbackWTARankings(): PlayerWithRanking[] {
  return [
    { id: 'sabalenka', name: 'Aryna Sabalenka', firstName: 'Aryna', lastName: 'Sabalenka', country: 'BLR', ranking: 1, points: 9056, movement: 0, hand: 'R', height: 182, age: 28, birthDate: '19980505' },
    { id: 'swiatek', name: 'Iga Swiatek', firstName: 'Iga', lastName: 'Swiatek', country: 'POL', ranking: 2, points: 7870, movement: 0, hand: 'R', height: 176, age: 25, birthDate: '20010531' },
    { id: 'gauff', name: 'Coco Gauff', firstName: 'Coco', lastName: 'Gauff', country: 'USA', ranking: 3, points: 6213, movement: 0, hand: 'R', height: 175, age: 22, birthDate: '20040313' },
    { id: 'pegula', name: 'Jessica Pegula', firstName: 'Jessica', lastName: 'Pegula', country: 'USA', ranking: 4, points: 5891, movement: 0, hand: 'R', height: 170, age: 32, birthDate: '19940224' },
    { id: 'keys', name: 'Madison Keys', firstName: 'Madison', lastName: 'Keys', country: 'USA', ranking: 5, points: 5488, movement: 0, hand: 'R', height: 178, age: 31, birthDate: '19950217' },
    { id: 'rybakina', name: 'Elena Rybakina', firstName: 'Elena', lastName: 'Rybakina', country: 'KAZ', ranking: 6, points: 5228, movement: 0, hand: 'R', height: 184, age: 26, birthDate: '19990617' },
    { id: 'paolini', name: 'Jasmine Paolini', firstName: 'Jasmine', lastName: 'Paolini', country: 'ITA', ranking: 7, points: 5098, movement: 0, hand: 'R', height: 163, age: 30, birthDate: '19960104' },
    { id: 'zheng', name: 'Qinwen Zheng', firstName: 'Qinwen', lastName: 'Zheng', country: 'CHN', ranking: 8, points: 4780, movement: 0, hand: 'R', height: 178, age: 23, birthDate: '20021008' },
  ];
}

// ============================================
// EXPORT PRINCIPAL
// ============================================

export async function getAllTennisData(): Promise<{
  atpRankings: PlayerWithRanking[];
  wtaRankings: PlayerWithRanking[];
  atpMatches: ProcessedMatch[];
}> {
  console.log('🎾 Loading all tennis data for 2026...');
  
  const [atpRankings, wtaRankings, atpMatches] = await Promise.all([
    fetchATPRankings(),
    fetchWTARankings(),
    fetchATPMatches2026(),
  ]);
  
  console.log(`✅ Data loaded: ATP ${atpRankings.length}, WTA ${wtaRankings.length}, Matches ${atpMatches.length}`);
  
  return { atpRankings, wtaRankings, atpMatches };
}
