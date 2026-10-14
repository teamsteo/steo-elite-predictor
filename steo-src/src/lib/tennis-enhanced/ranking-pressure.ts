/**
 * Système de points ATP/WTA à défendre
 * 
 * Les joueurs doivent défendre les points gagnés l'année précédente
 * au même tournoi. Cela crée de la pression:
 * - Beaucoup de points à défendre = plus de pression
 * - Peu de points = joueur plus libre psychologiquement
 */

export interface PointsToDefend {
  player: string;
  tournament: string;
  pointsToDefend: number;
  currentPoints: number;
  pressureLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  pressureScore: number; // -20 à +20 (positif = avantage)
}

// Points ATP par résultat de tournoi
const ATP_POINTS: Record<string, Record<string, number>> = {
  'grand_slam': {
    'winner': 2000,
    'finalist': 1200,
    'semifinal': 720,
    'quarterfinal': 360,
    'r16': 180,
    'r32': 90,
    'r64': 45,
    'r128': 10
  },
  'masters_1000': {
    'winner': 1000,
    'finalist': 600,
    'semifinal': 360,
    'quarterfinal': 180,
    'r16': 90,
    'r32': 45,
    'r64': 10
  },
  'atp_500': {
    'winner': 500,
    'finalist': 300,
    'semifinal': 180,
    'quarterfinal': 90,
    'r16': 45,
    'r32': 20
  },
  'atp_250': {
    'winner': 250,
    'finalist': 150,
    'semifinal': 90,
    'quarterfinal': 45,
    'r16': 20,
    'r32': 10
  }
};

// Points WTA par résultat
const WTA_POINTS: Record<string, Record<string, number>> = {
  'grand_slam': {
    'winner': 2000,
    'finalist': 1300,
    'semifinal': 780,
    'quarterfinal': 430,
    'r16': 240,
    'r32': 130,
    'r64': 70,
    'r128': 10
  },
  'wta_1000': {
    'winner': 1000,
    'finalist': 650,
    'semifinal': 390,
    'quarterfinal': 215,
    'r16': 120,
    'r32': 65,
    'r64': 10
  },
  'wta_500': {
    'winner': 500,
    'finalist': 325,
    'semifinal': 195,
    'quarterfinal': 108,
    'r16': 60,
    'r32': 30
  },
  'wta_250': {
    'winner': 250,
    'finalist': 163,
    'semifinal': 98,
    'quarterfinal': 54,
    'r16': 30,
    'r32': 15
  }
};

// Base de données des résultats de l'année précédente
// En production, ceci serait dynamique
const PREVIOUS_YEAR_RESULTS: Record<string, Record<string, { round: string; points: number }>> = {
  // Roland Garros 2024
  'roland garros': {
    'alcaraz': { round: 'winner', points: 2000 },
    'zverev': { round: 'semifinal', points: 720 },
    'sinner': { round: 'semifinal', points: 720 },
    'ruud': { round: 'semifinal', points: 720 },
    'djokovic': { round: 'quarterfinal', points: 360 },
    'tsitsipas': { round: 'quarterfinal', points: 360 },
    'medvedev': { round: 'r16', points: 180 },
    'rublev': { round: 'r32', points: 90 },
  },
  
  // Wimbledon 2024
  'wimbledon': {
    'alcaraz': { round: 'winner', points: 2000 },
    'djokovic': { round: 'finalist', points: 1200 },
    'sinner': { round: 'quarterfinal', points: 360 },
    'medvedev': { round: 'semifinal', points: 720 },
    'zverev': { round: 'r16', points: 180 },
    'ruud': { round: 'r32', points: 90 },
  },
  
  // US Open 2024
  'us open': {
    'sinner': { round: 'winner', points: 2000 },
    'fritz': { round: 'finalist', points: 1200 },
    'tiafoe': { round: 'semifinal', points: 720 },
    'draper': { round: 'semifinal', points: 720 },
    'zverev': { round: 'quarterfinal', points: 360 },
    'medvedev': { round: 'quarterfinal', points: 360 },
    'djokovic': { round: 'r32', points: 90 },
  },
  
  // Australian Open 2024
  'australian open': {
    'sinner': { round: 'winner', points: 2000 },
    'medvedev': { round: 'finalist', points: 1200 },
    'zverev': { round: 'semifinal', points: 720 },
    'djokovic': { round: 'semifinal', points: 720 },
    'alcaraz': { round: 'quarterfinal', points: 360 },
    'rublev': { round: 'quarterfinal', points: 360 },
  },
  
  // WTA - Roland Garros 2024
  'roland garros wta': {
    'swiatek': { round: 'winner', points: 2000 },
    'paolini': { round: 'finalist', points: 1300 },
    'gauff': { round: 'semifinal', points: 780 },
    'rybakina': { round: 'quarterfinal', points: 430 },
    'sabalenka': { round: 'quarterfinal', points: 430 },
    'zheng': { round: 'r32', points: 130 },
  },
  
  // WTA - Wimbledon 2024
  'wimbledon wta': {
    'krejcikova': { round: 'winner', points: 2000 },
    'paolini': { round: 'finalist', points: 1300 },
    'vondrousova': { round: 'quarterfinal', points: 430 },
    'rybakina': { round: 'semifinal', points: 780 },
    'ostapenko': { round: 'quarterfinal', points: 430 },
  },
  
  // WTA - US Open 2024
  'us open wta': {
    'sabalenka': { round: 'finalist', points: 1300 },
    'gauff': { round: 'semifinal', points: 780 },
    'pegula': { round: 'finalist', points: 1300 },
    'swiatek': { round: 'quarterfinal', points: 430 },
    'zheng': { round: 'quarterfinal', points: 430 },
  },
  
  // WTA - Australian Open 2024
  'australian open wta': {
    'sabalenka': { round: 'winner', points: 2000 },
    'zheng': { round: 'finalist', points: 1300 },
    'gauff': { round: 'semifinal', points: 780 },
    'swiatek': { round: 'r32', points: 130 },
  }
};

// Points actuels estimés des top joueurs
const CURRENT_POINTS: Record<string, number> = {
  // ATP
  'sinner': 11830,
  'alcaraz': 8850,
  'zverev': 7165,
  'medvedev': 5820,
  'friedl': 4780,
  'ruud': 4225,
  'djokovic': 3950,
  'rublev': 3830,
  'de minaur': 3690,
  'humbert': 2865,
  'tsitsipas': 2745,
  'rune': 2680,
  'fritz': 3470,
  'shelton': 2580,
  
  // WTA
  'sabalenka': 9416,
  'swiatek': 8370,
  'gauff': 6238,
  'pegula': 5855,
  'rybakina': 5471,
  'paolini': 5288,
  'zheng': 4480,
};

/**
 * Normalise un nom de joueur
 */
function normalizePlayerName(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z ]/g, '')
    .trim();
}

/**
 * Trouve le tournoi correspondant dans la base
 */
function findTournamentKey(tournament: string, isWTA: boolean): string | null {
  const tournamentLower = tournament.toLowerCase();
  
  // Mapping des noms de tournois
  const mappings: Record<string, string[]> = {
    'roland garros': ['roland garros', 'french open', 'paris'],
    'wimbledon': ['wimbledon', 'london'],
    'us open': ['us open', 'new york', 'flushing'],
    'australian open': ['australian open', 'melbourne'],
  };
  
  for (const [key, aliases] of Object.entries(mappings)) {
    for (const alias of aliases) {
      if (tournamentLower.includes(alias)) {
        return isWTA ? `${key} wta` : key;
      }
    }
  }
  
  return null;
}

/**
 * Récupère les points à défendre pour un joueur dans un tournoi
 */
export function getPointsToDefend(
  player: string,
  tournament: string,
  isWTA: boolean = false
): PointsToDefend {
  const normalizedPlayer = normalizePlayerName(player);
  const tournamentKey = findTournamentKey(tournament, isWTA);
  
  let pointsToDefend = 0;
  
  if (tournamentKey && PREVIOUS_YEAR_RESULTS[tournamentKey]) {
    const result = PREVIOUS_YEAR_RESULTS[tournamentKey][normalizedPlayer];
    if (result) {
      pointsToDefend = result.points;
    }
  }
  
  const currentPoints = CURRENT_POINTS[normalizedPlayer] || 2000;
  
  // Calcul du niveau de pression
  let pressureLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  let pressureScore = 0;
  
  const pressureRatio = pointsToDefend / currentPoints;
  
  if (pointsToDefend === 0) {
    pressureLevel = 'none';
    pressureScore = 10; // Avantage: joueur libre psychologiquement
  } else if (pointsToDefend < 100) {
    pressureLevel = 'low';
    pressureScore = 5;
  } else if (pressureRatio < 0.1) {
    pressureLevel = 'low';
    pressureScore = 3;
  } else if (pressureRatio < 0.2) {
    pressureLevel = 'medium';
    pressureScore = 0;
  } else if (pressureRatio < 0.35) {
    pressureLevel = 'high';
    pressureScore = -10;
  } else {
    pressureLevel = 'critical';
    pressureScore = -20; // Désavantage: beaucoup de pression
  }
  
  // Spécial: Tenants du titre ont plus de pression
  if (pointsToDefend >= 1000) {
    pressureScore -= 5; // Bonus négatif pour tenant du titre
  }
  
  return {
    player,
    tournament,
    pointsToDefend,
    currentPoints,
    pressureLevel,
    pressureScore
  };
}

/**
 * Compare la pression entre deux joueurs
 */
export function comparePressure(
  player1: string,
  player2: string,
  tournament: string,
  isWTA: boolean = false
): { 
  score: number; 
  description: string; 
  p1Pressure: PointsToDefend; 
  p2Pressure: PointsToDefend 
} {
  
  const p1Pressure = getPointsToDefend(player1, tournament, isWTA);
  const p2Pressure = getPointsToDefend(player2, tournament, isWTA);
  
  // Score: positif = avantage player1 (moins de pression)
  const score = p1Pressure.pressureScore - p2Pressure.pressureScore;
  
  // Description
  let description = '';
  
  if (Math.abs(score) <= 3) {
    description = 'Pression équivalente des deux côtés';
  } else if (score > 10) {
    description = `${player2} sous forte pression (${p2Pressure.pointsToDefend} pts à défendre)`;
  } else if (score > 5) {
    description = `${player2} sous plus de pression (${p2Pressure.pointsToDefend} pts à défendre)`;
  } else if (score < -10) {
    description = `${player1} sous forte pression (${p1Pressure.pointsToDefend} pts à défendre)`;
  } else if (score < -5) {
    description = `${player1} sous plus de pression (${p1Pressure.pointsToDefend} pts à défendre)`;
  }
  
  // Ajouter info tenant du titre
  if (p1Pressure.pointsToDefend >= 1500) {
    description += ` - ${player1} tenant du titre`;
  } else if (p2Pressure.pointsToDefend >= 1500) {
    description += ` - ${player2} tenant du titre`;
  }
  
  return {
    score,
    description: description || 'Pas de différence de pression significative',
    p1Pressure,
    p2Pressure
  };
}

/**
 * Détecte si un joueur est dans une "semaine dorée" (rien à perdre)
 */
export function isGoldenWeek(pressure: PointsToDefend): boolean {
  return pressure.pointsToDefend === 0 && pressure.currentPoints < 5000;
}

/**
 * Génère un insight sur la pression
 */
export function getPressureInsight(pressure: PointsToDefend): string | null {
  if (pressure.pressureLevel === 'critical') {
    return `⚠️ ${pressure.player} joue sa place au classement - pression maximale`;
  }
  
  if (pressure.pressureLevel === 'none' && pressure.currentPoints < 3000) {
    return `✨ ${pressure.player} n'a rien à perdre - peut jouer libéré`;
  }
  
  if (pressure.pointsToDefend >= 1500) {
    return `👑 ${pressure.player} défend son titre - pression additionnelle`;
  }
  
  return null;
}
