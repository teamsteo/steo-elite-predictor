/**
 * Base de données Head-to-Head (H2H) - Confrontations directes
 * 
 * Certains joueurs ont un style qui pose problème à d'autres:
 * - Nadal domine presque tout le monde sur terre battue
 * - Djokovic "possède" Nadal sur dur
 * - Certains gauchers posent problème aux droits
 */

export interface H2HRecord {
  player1: string;
  player2: string;
  player1Wins: number;
  player2Wins: number;
  totalMatches: number;
  surfaceBreakdown?: {
    clay?: { p1: number; p2: number };
    hard?: { p1: number; p2: number };
    grass?: { p1: number; p2: number };
  };
  lastMeeting?: {
    date: string;
    tournament: string;
    winner: string;
    score: string;
  };
}

// Base de données H2H des principaux joueurs
// Format: 'player1-player2' -> record
const H2H_DATABASE: Record<string, H2HRecord> = {
  // Djokovic vs Nadal - L'une des plus grandes rivalités
  'djokovic-nadal': {
    player1: 'Novak Djokovic',
    player2: 'Rafael Nadal',
    player1Wins: 31,
    player2Wins: 29,
    totalMatches: 60,
    surfaceBreakdown: {
      clay: { p1: 8, p2: 20 },
      hard: { p1: 20, p2: 7 },
      grass: { p1: 3, p2: 2 }
    }
  },
  
  // Djokovic vs Alcaraz
  'djokovic-alcaraz': {
    player1: 'Novak Djokovic',
    player2: 'Carlos Alcaraz',
    player1Wins: 5,
    player2Wins: 5,
    totalMatches: 10,
    surfaceBreakdown: {
      clay: { p1: 1, p2: 2 },
      hard: { p1: 3, p2: 2 },
      grass: { p1: 1, p2: 1 }
    }
  },
  
  // Alcaraz vs Sinner
  'alcaraz-sinner': {
    player1: 'Carlos Alcaraz',
    player2: 'Jannik Sinner',
    player1Wins: 6,
    player2Wins: 4,
    totalMatches: 10,
    surfaceBreakdown: {
      clay: { p1: 2, p2: 1 },
      hard: { p1: 3, p2: 2 },
      grass: { p1: 1, p2: 1 }
    }
  },
  
  // Sinner vs Medvedev
  'sinner-medvedev': {
    player1: 'Jannik Sinner',
    player2: 'Daniil Medvedev',
    player1Wins: 7,
    player2Wins: 6,
    totalMatches: 13,
    surfaceBreakdown: {
      hard: { p1: 6, p2: 5 },
      clay: { p1: 1, p2: 1 }
    }
  },
  
  // Alcaraz vs Medvedev
  'alcaraz-medvedev': {
    player1: 'Carlos Alcaraz',
    player2: 'Daniil Medvedev',
    player1Wins: 5,
    player2Wins: 3,
    totalMatches: 8,
    surfaceBreakdown: {
      hard: { p1: 3, p2: 2 },
      clay: { p1: 2, p2: 1 }
    }
  },
  
  // Zverev vs Alcaraz
  'zverev-alcaraz': {
    player1: 'Alexander Zverev',
    player2: 'Carlos Alcaraz',
    player1Wins: 5,
    player2Wins: 6,
    totalMatches: 11,
    surfaceBreakdown: {
      clay: { p1: 2, p2: 3 },
      hard: { p1: 3, p2: 3 }
    }
  },
  
  // Sinner vs Zverev
  'sinner-zverev': {
    player1: 'Jannik Sinner',
    player2: 'Alexander Zverev',
    player1Wins: 4,
    player2Wins: 4,
    totalMatches: 8
  },
  
  // Tsitsipas vs Alcaraz
  'tsitsipas-alcaraz': {
    player1: 'Stefanos Tsitsipas',
    player2: 'Carlos Alcaraz',
    player1Wins: 2,
    player2Wins: 6,
    totalMatches: 8,
    surfaceBreakdown: {
      clay: { p1: 1, p2: 3 },
      hard: { p1: 1, p2: 3 }
    }
  },
  
  // Ruud vs Djokovic
  'ruud-djokovic': {
    player1: 'Casper Ruud',
    player2: 'Novak Djokovic',
    player1Wins: 0,
    player2Wins: 5,
    totalMatches: 5
  },
  
  // Rublev vs Sinner
  'rublev-sinner': {
    player1: 'Andrey Rublev',
    player2: 'Jannik Sinner',
    player1Wins: 2,
    player2Wins: 7,
    totalMatches: 9
  },
  
  // WTA - Swiatek vs Sabalenka
  'swiatek-sabalenka': {
    player1: 'Iga Swiatek',
    player2: 'Aryna Sabalenka',
    player1Wins: 9,
    player2Wins: 8,
    totalMatches: 17,
    surfaceBreakdown: {
      clay: { p1: 5, p2: 1 },
      hard: { p1: 4, p2: 7 }
    }
  },
  
  // WTA - Swiatek vs Rybakina
  'swiatek-rybakina': {
    player1: 'Iga Swiatek',
    player2: 'Elena Rybakina',
    player1Wins: 4,
    player2Wins: 4,
    totalMatches: 8,
    surfaceBreakdown: {
      clay: { p1: 2, p2: 0 },
      hard: { p1: 2, p2: 4 }
    }
  },
  
  // WTA - Sabalenka vs Rybakina
  'sabalenka-rybakina': {
    player1: 'Aryna Sabalenka',
    player2: 'Elena Rybakina',
    player1Wins: 7,
    player2Wins: 6,
    totalMatches: 13,
    surfaceBreakdown: {
      hard: { p1: 5, p2: 4 },
      grass: { p1: 1, p2: 2 }
    }
  },
  
  // WTA - Gauff vs Sabalenka
  'gauff-sabalenka': {
    player1: 'Coco Gauff',
    player2: 'Aryna Sabalenka',
    player1Wins: 5,
    player2Wins: 8,
    totalMatches: 13
  },
  
  // WTA - Gauff vs Swiatek
  'gauff-swiatek': {
    player1: 'Coco Gauff',
    player2: 'Iga Swiatek',
    player1Wins: 1,
    player2Wins: 11,
    totalMatches: 12,
    surfaceBreakdown: {
      clay: { p1: 0, p2: 5 },
      hard: { p1: 1, p2: 6 }
    }
  },
  
  // WTA - Zheng vs Sabalenka
  'zheng-sabalenka': {
    player1: 'Qinwen Zheng',
    player2: 'Aryna Sabalenka',
    player1Wins: 1,
    player2Wins: 6,
    totalMatches: 7
  },
  
  // WTA - Pegula vs Swiatek
  'pegula-swiatek': {
    player1: 'Jessica Pegula',
    player2: 'Iga Swiatek',
    player1Wins: 4,
    player2Wins: 7,
    totalMatches: 11
  }
};

/**
 * Normalise un nom de joueur pour la recherche
 */
function normalizePlayerName(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z ]/g, '')
    .trim()
    .split(' ')
    .sort((a, b) => b.length - a.length)[0]; // Prendre le nom le plus long
}

/**
 * Génère la clé H2H pour deux joueurs
 */
function getH2HKey(p1: string, p2: string): string {
  const n1 = normalizePlayerName(p1);
  const n2 = normalizePlayerName(p2);
  return [n1, n2].sort().join('-');
}

/**
 * Récupère le record H2H entre deux joueurs
 */
export function getH2HRecord(player1: string, player2: string): H2HRecord | null {
  const key = getH2HKey(player1, player2);
  const record = H2H_DATABASE[key];
  
  if (!record) return null;
  
  // Vérifier l'ordre des joueurs
  const n1 = normalizePlayerName(player1);
  const n2 = normalizePlayerName(player2);
  const dbP1 = normalizePlayerName(record.player1);
  
  if (n1 !== dbP1) {
    // Inverser le record
    return {
      ...record,
      player1: record.player2,
      player2: record.player1,
      player1Wins: record.player2Wins,
      player2Wins: record.player1Wins,
      surfaceBreakdown: record.surfaceBreakdown ? {
        clay: record.surfaceBreakdown.clay ? { 
          p1: record.surfaceBreakdown.clay.p2, 
          p2: record.surfaceBreakdown.clay.p1 
        } : undefined,
        hard: record.surfaceBreakdown.hard ? { 
          p1: record.surfaceBreakdown.hard.p2, 
          p2: record.surfaceBreakdown.hard.p1 
        } : undefined,
        grass: record.surfaceBreakdown.grass ? { 
          p1: record.surfaceBreakdown.grass.p2, 
          p2: record.surfaceBreakdown.grass.p1 
        } : undefined,
      } as any : undefined
    };
  }
  
  return record;
}

/**
 * Calcule le score H2H (de -100 à +100, positif = avantage player1)
 */
export function calculateH2HScore(
  player1: string, 
  player2: string, 
  surface?: string
): { score: number; description: string; record: H2HRecord | null } {
  
  const record = getH2HRecord(player1, player2);
  
  if (!record) {
    return { 
      score: 0, 
      description: 'Pas de données H2H disponibles', 
      record: null 
    };
  }
  
  let p1Wins = record.player1Wins;
  let p2Wins = record.player2Wins;
  
  // Filtrer par surface si disponible
  if (surface && record.surfaceBreakdown) {
    const surfaceLower = surface.toLowerCase();
    if (surfaceLower.includes('clay') && record.surfaceBreakdown.clay) {
      p1Wins = record.surfaceBreakdown.clay.p1;
      p2Wins = record.surfaceBreakdown.clay.p2;
    } else if (surfaceLower.includes('hard') && record.surfaceBreakdown.hard) {
      p1Wins = record.surfaceBreakdown.hard.p1;
      p2Wins = record.surfaceBreakdown.hard.p2;
    } else if (surfaceLower.includes('grass') && record.surfaceBreakdown.grass) {
      p1Wins = record.surfaceBreakdown.grass.p1;
      p2Wins = record.surfaceBreakdown.grass.p2;
    }
  }
  
  const totalMatches = p1Wins + p2Wins;
  
  if (totalMatches === 0) {
    return { 
      score: 0, 
      description: 'Pas de confrontations sur cette surface', 
      record 
    };
  }
  
  const winRate = p1Wins / totalMatches;
  const score = (winRate - 0.5) * 200; // -100 à +100
  
  // Description contextuelle
  let description = '';
  if (score > 50) {
    description = `${player1} domine les confrontations (${p1Wins}-${p2Wins})`;
  } else if (score > 20) {
    description = `${player1} mène légèrement (${p1Wins}-${p2Wins})`;
  } else if (score < -50) {
    description = `${player2} domine les confrontations (${p2Wins}-${p1Wins})`;
  } else if (score < -20) {
    description = `${player2} mène légèrement (${p2Wins}-${p1Wins})`;
  } else {
    description = `H2H équilibré (${p1Wins}-${p2Wins})`;
  }
  
  // Ajouter le facteur surface si filtré
  if (surface && record.surfaceBreakdown) {
    description += ` sur ${surface}`;
  }
  
  return { score, description, record };
}

/**
 * Détecte un "match-up problem" - quand un joueur pose systématiquement problème à un autre
 */
export function detectMatchupProblem(
  player1: string,
  player2: string
): { exists: boolean; dominantPlayer: string | null; confidence: number } {
  
  const record = getH2HRecord(player1, player2);
  
  if (!record || record.totalMatches < 3) {
    return { exists: false, dominantPlayer: null, confidence: 0 };
  }
  
  const p1WinRate = record.player1Wins / record.totalMatches;
  
  // Seuil: 70%+ de victoires = match-up problem
  if (p1WinRate >= 0.70) {
    return { 
      exists: true, 
      dominantPlayer: record.player1, 
      confidence: Math.min(100, (p1WinRate - 0.5) * 200) 
    };
  } else if (p1WinRate <= 0.30) {
    return { 
      exists: true, 
      dominantPlayer: record.player2, 
      confidence: Math.min(100, (0.5 - p1WinRate) * 200) 
    };
  }
  
  return { exists: false, dominantPlayer: null, confidence: 0 };
}

/**
 * Joueur qui "possède" un autre joueur (style incompatible)
 */
export const PLAYER_OWNERSHIP: Record<string, string[]> = {
  // Nadal est dominé par Djokovic sur dur
  'nadal': ['djokovic (hard)'],
  // Swiatek domine Gauff
  'gauff': ['swiatek'],
  // Rublev a du mal contre Sinner
  'rublev': ['sinner'],
  // Tsitsipas a du mal contre Alcaraz
  'tsitsipas': ['alcaraz'],
  // Ruud n'a jamais battu Djokovic
  'ruud': ['djokovic'],
};
