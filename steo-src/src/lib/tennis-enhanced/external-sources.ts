/**
 * Tennis External Data Sources - Sources de données officielles
 * 
 * Utilise des données statiques pour les classements ATP/WTA
 * Pas de scraping - Aucun risque de bannissement
 */

// ============================================
// INTERFACES
// ============================================

export interface OfficialRanking {
  rank: number;
  name: string;
  country: string;
  points: number;
  movement: number;
  tournaments: number;
}

export interface PlayerStats {
  id: string;
  name: string;
  ranking: number;
  rankingPoints: number;
  country: string;
  age: number;
  turnedPro: number;
  height: number;
  weight: number;
  prizeMoney: number;
  careerTitles: number;
  careerWins: number;
  careerLosses: number;
  careerWinRate: number;
  surfaceStats: {
    hard: SurfaceStatDetail;
    clay: SurfaceStatDetail;
    grass: SurfaceStatDetail;
    indoor: SurfaceStatDetail;
  };
  lastUpdated: string;
}

export interface SurfaceStatDetail {
  wins: number;
  losses: number;
  winRate: number;
  titles: number;
}

// ============================================
// CLASSEMENTS ATP (DONNÉES STATIQUES)
// ============================================

export async function fetchATPRankings(limit: number = 100): Promise<OfficialRanking[]> {
  // Retourner les classements statiques (mis à jour manuellement)
  return getLocalATPRankings().slice(0, limit);
}

function getLocalATPRankings(): OfficialRanking[] {
  return [
    { rank: 1, name: 'Jannik Sinner', country: 'ITA', points: 11020, movement: 0, tournaments: 20 },
    { rank: 2, name: 'Carlos Alcaraz', country: 'ESP', points: 8850, movement: 0, tournaments: 19 },
    { rank: 3, name: 'Alexander Zverev', country: 'GER', points: 7165, movement: 0, tournaments: 22 },
    { rank: 4, name: 'Daniil Medvedev', country: 'RUS', points: 6415, movement: 0, tournaments: 20 },
    { rank: 5, name: 'Taylor Fritz', country: 'USA', points: 4845, movement: 0, tournaments: 22 },
    { rank: 6, name: 'Casper Ruud', country: 'NOR', points: 4765, movement: 0, tournaments: 22 },
    { rank: 7, name: 'Novak Djokovic', country: 'SRB', points: 4610, movement: 0, tournaments: 14 },
    { rank: 8, name: 'Alex de Minaur', country: 'AUS', points: 3785, movement: 0, tournaments: 22 },
    { rank: 9, name: 'Andrey Rublev', country: 'RUS', points: 3665, movement: 0, tournaments: 23 },
    { rank: 10, name: 'Stefanos Tsitsipas', country: 'GRE', points: 3350, movement: 0, tournaments: 21 },
    { rank: 11, name: 'Holger Rune', country: 'DEN', points: 3325, movement: 0, tournaments: 22 },
    { rank: 12, name: 'Ben Shelton', country: 'USA', points: 3135, movement: 0, tournaments: 22 },
    { rank: 13, name: 'Tommy Paul', country: 'USA', points: 3090, movement: 0, tournaments: 24 },
    { rank: 14, name: 'Ugo Humbert', country: 'FRA', points: 3055, movement: 0, tournaments: 22 },
    { rank: 15, name: 'Grigor Dimitrov', country: 'BUL', points: 2975, movement: 0, tournaments: 19 },
    { rank: 16, name: 'Hubert Hurkacz', country: 'POL', points: 2875, movement: 0, tournaments: 22 },
    { rank: 17, name: 'Karen Khachanov', country: 'RUS', points: 2765, movement: 0, tournaments: 23 },
    { rank: 18, name: 'Arthur Fils', country: 'FRA', points: 2650, movement: 0, tournaments: 24 },
    { rank: 19, name: 'Jack Draper', country: 'GBR', points: 2600, movement: 0, tournaments: 20 },
    { rank: 20, name: 'Felix Auger-Aliassime', country: 'CAN', points: 2535, movement: 0, tournaments: 23 },
  ];
}

// ============================================
// CLASSEMENTS WTA (DONNÉES STATIQUES)
// ============================================

export async function fetchWTARankings(limit: number = 100): Promise<OfficialRanking[]> {
  return getLocalWTARankings().slice(0, limit);
}

function getLocalWTARankings(): OfficialRanking[] {
  return [
    { rank: 1, name: 'Aryna Sabalenka', country: 'BLR', points: 9166, movement: 0, tournaments: 19 },
    { rank: 2, name: 'Iga Swiatek', country: 'POL', points: 7770, movement: 0, tournaments: 18 },
    { rank: 3, name: 'Coco Gauff', country: 'USA', points: 5953, movement: 0, tournaments: 19 },
    { rank: 4, name: 'Jessica Pegula', country: 'USA', points: 5755, movement: 0, tournaments: 19 },
    { rank: 5, name: 'Elena Rybakina', country: 'KAZ', points: 5471, movement: 0, tournaments: 17 },
    { rank: 6, name: 'Qinwen Zheng', country: 'CHN', points: 4480, movement: 0, tournaments: 20 },
    { rank: 7, name: 'Jasmine Paolini', country: 'ITA', points: 4438, movement: 0, tournaments: 20 },
    { rank: 8, name: 'Emma Navarro', country: 'USA', points: 3576, movement: 0, tournaments: 23 },
    { rank: 9, name: 'Daria Kasatkina', country: 'RUS', points: 3418, movement: 0, tournaments: 23 },
    { rank: 10, name: 'Paula Badosa', country: 'ESP', points: 3389, movement: 0, tournaments: 20 },
    { rank: 11, name: 'Danielle Collins', country: 'USA', points: 3256, movement: 0, tournaments: 18 },
    { rank: 12, name: 'Diana Shnaider', country: 'RUS', points: 3028, movement: 0, tournaments: 24 },
    { rank: 13, name: 'Madison Keys', country: 'USA', points: 2896, movement: 0, tournaments: 17 },
    { rank: 14, name: 'Anna Kalinskaya', country: 'RUS', points: 2803, movement: 0, tournaments: 21 },
    { rank: 15, name: 'Beatriz Haddad Maia', country: 'BRA', points: 2727, movement: 0, tournaments: 23 },
    { rank: 16, name: 'Donna Vekic', country: 'CRO', points: 2670, movement: 0, tournaments: 20 },
    { rank: 17, name: 'Liudmila Samsonova', country: 'RUS', points: 2655, movement: 0, tournaments: 21 },
    { rank: 18, name: 'Marta Kostyuk', country: 'UKR', points: 2580, movement: 0, tournaments: 22 },
    { rank: 19, name: 'Karolina Muchova', country: 'CZE', points: 2500, movement: 0, tournaments: 14 },
    { rank: 20, name: 'Victoria Azarenka', country: 'BLR', points: 2418, movement: 0, tournaments: 19 },
  ];
}

// ============================================
// SYNCHRONISATION
// ============================================

export async function syncAllRankings(): Promise<{
  atp: OfficialRanking[];
  wta: OfficialRanking[];
  timestamp: string;
}> {
  console.log('🔄 Synchronisation des classements...');
  
  const [atp, wta] = await Promise.all([
    fetchATPRankings(100),
    fetchWTARankings(100),
  ]);
  
  console.log(`✅ ATP: ${atp.length} joueurs`);
  console.log(`✅ WTA: ${wta.length} joueuses`);
  
  return {
    atp,
    wta,
    timestamp: new Date().toISOString(),
  };
}

export async function getPlayerRanking(
  playerName: string,
  tour: 'atp' | 'wta'
): Promise<number> {
  const rankings = tour === 'atp' 
    ? await fetchATPRankings(200)
    : await fetchWTARankings(200);
  
  const normalized = playerName.toLowerCase().replace(/[^a-z ]/g, '').trim();
  
  for (const player of rankings) {
    const playerNormalized = player.name.toLowerCase().replace(/[^a-z ]/g, '').trim();
    
    if (playerNormalized === normalized || 
        playerNormalized.includes(normalized) || 
        normalized.includes(playerNormalized)) {
      return player.rank;
    }
  }
  
  return 500;
}

// ============================================
// EXPORTS
// ============================================

export {
  getLocalATPRankings,
  getLocalWTARankings,
};
