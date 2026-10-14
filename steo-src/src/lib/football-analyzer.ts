/**
 * Football Analyzer - Analyse des matchs de football
 * 
 * Couvre:
 * - Championnats européens (Ligue 1, Premier League, La Liga, Serie A, Bundesliga)
 * - Coupe du Monde FIFA (phase finale)
 * - Compétitions européennes (Champions League, Europa League, Conference League)
 * - Matchs internationaux et amicaux
 * 
 * Facteurs d'analyse:
 * - Forme récente (5 derniers matchs)
 * - Classement championnat / FIFA
 * - Historique confrontations (H2H)
 * - Avantage domicile
 * - Blessures et suspensions
 * - Enjeu du match
 * - Calendrier chargé
 */

// ============================================
// INTERFACES
// ============================================

export interface FootballMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: string;
  awayTeamId: string;
  league: League;
  leagueRound: string;
  date: string;
  venue: string;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  isNeutralVenue: boolean;
  matchImportance: 'high' | 'medium' | 'low';
}

export interface TeamStats {
  id: string;
  name: string;
  country: string;
  league: League;
  
  // Classement
  position: number;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  
  // Forme récente
  form: ('W' | 'D' | 'L')[];
  last5Matches: {
    opponent: string;
    result: 'W' | 'D' | 'L';
    score: string;
    home: boolean;
  }[];
  
  // Domicile / Extérieur
  homeRecord: { won: number; drawn: number; lost: number };
  awayRecord: { won: number; drawn: number; lost: number };
  
  // Statistiques avancées
  avgGoalsScored: number;
  avgGoalsConceded: number;
  cleanSheets: number;
  failedToScore: number;
  
  // Joueurs clés
  keyPlayersAvailable: number;
  keyPlayersInjured: string[];
  keyPlayersSuspended: string[];
  
  // Spécifique
  fifaRanking?: number; // Pour équipes nationales
  europeanCompetition?: 'champions_league' | 'europa_league' | 'conference_league' | null;
}

export interface FootballAnalysis {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: League;
  
  // Prédiction
  predictedOutcome: 'home' | 'draw' | 'away';
  predictedScore: { home: number; away: number };
  winProbability: { home: number; draw: number; away: number };
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  
  // Facteurs analysés
  factors: {
    form: { score: number; description: string };
    standings: { score: number; description: string };
    homeAdvantage: { score: number; description: string };
    h2h: { score: number; description: string };
    motivation: { score: number; description: string };
    squad: { score: number; description: string };
    schedule: { score: number; description: string };
  };
  
  // Value Bet
  valueBet: {
    exists: boolean;
    recommendedBet: string;
    betType: '1' | 'X' | '2' | 'Over' | 'Under' | 'BTTS';
    odds: number;
    impliedProbability: number;
    ourProbability: number;
    valueGap: number;
    valueScore: number;
  };
  
  insights: string[];
  warnings: string[];
}

export type League = 
  // Championnats européens
  | 'ligue_1'
  | 'premier_league'
  | 'la_liga'
  | 'serie_a'
  | 'bundesliga'
  | 'eredivisie'
  | 'primeira_liga'
  | 'championship'
  // Compétitions européennes
  | 'champions_league'
  | 'europa_league'
  | 'conference_league'
  // International
  | 'world_cup'
  | 'euro'
  | 'copa_america'
  | 'africa_cup'
  | 'nations_league'
  | 'friendly'
  | 'world_cup_qualifier'
  | 'euro_qualifier'
  | 'other';

// ============================================
// DONNÉES DE RÉFÉRENCE
// ============================================

const LEAGUE_NAMES: Record<League, string> = {
  'ligue_1': 'Ligue 1',
  'premier_league': 'Premier League',
  'la_liga': 'La Liga',
  'serie_a': 'Serie A',
  'bundesliga': 'Bundesliga',
  'eredivisie': 'Eredivisie',
  'primeira_liga': 'Primeira Liga',
  'championship': 'Championship',
  'champions_league': 'Champions League',
  'europa_league': 'Europa League',
  'conference_league': 'Conference League',
  'world_cup': 'Coupe du Monde',
  'euro': 'Euro',
  'copa_america': 'Copa America',
  'africa_cup': 'Coupe d\'Afrique',
  'nations_league': 'Nations League',
  'friendly': 'Match Amical',
  'world_cup_qualifier': 'Éliminatoires CM',
  'euro_qualifier': 'Éliminatoires Euro',
  'other': 'Autre',
};

// Facteur d'importance des ligues pour la prédictibilité
const LEAGUE_PREDICTABILITY: Record<League, number> = {
  'ligue_1': 0.85,
  'premier_league': 0.88,
  'la_liga': 0.87,
  'serie_a': 0.86,
  'bundesliga': 0.87,
  'eredivisie': 0.80,
  'primeira_liga': 0.82,
  'championship': 0.75,
  'champions_league': 0.90,
  'europa_league': 0.82,
  'conference_league': 0.75,
  'world_cup': 0.85,
  'euro': 0.87,
  'copa_america': 0.82,
  'africa_cup': 0.70,
  'nations_league': 0.78,
  'friendly': 0.60,
  'world_cup_qualifier': 0.80,
  'euro_qualifier': 0.82,
  'other': 0.70,
};

// Équipes par championnat (données de référence)
const LEAGUE_TEAMS: Partial<Record<League, string[]>> = {
  'ligue_1': [
    'PSG', 'Marseille', 'Monaco', 'Lille', 'Lyon', 'Nice', 'Lens', 'Rennes',
    'Montpellier', 'Nantes', 'Strasbourg', 'Toulouse', 'Reims', 'Brest',
    'Lorient', 'Rennes', 'Metz', 'Le Havre', 'Clermont', 'Nantes'
  ],
  'premier_league': [
    'Manchester City', 'Arsenal', 'Liverpool', 'Manchester United', 'Chelsea',
    'Tottenham', 'Newcastle', 'Brighton', 'Aston Villa', 'West Ham',
    'Brentford', 'Fulham', 'Crystal Palace', 'Wolves', 'Everton',
    'Nottingham Forest', 'Bournemouth', 'Luton', 'Burnley', 'Sheffield United'
  ],
  'la_liga': [
    'Real Madrid', 'Barcelona', 'Atletico Madrid', 'Real Sociedad', 'Villarreal',
    'Real Betis', 'Athletic Bilbao', 'Sevilla', 'Valencia', 'Getafe',
    'Osasuna', 'Celta Vigo', 'Mallorca', 'Rayo Vallecano', 'Cadiz',
    'Girona', 'Almeria', 'Las Palmas', 'Alaves', 'Granada'
  ],
  'serie_a': [
    'Inter Milan', 'AC Milan', 'Napoli', 'Juventus', 'Roma', 'Lazio',
    'Atalanta', 'Fiorentina', 'Bologna', 'Torino', 'Monza', 'Udinese',
    'Sassuolo', 'Empoli', 'Lecce', 'Genoa', 'Cagliari', 'Verona',
    'Frosinone', 'Salernitana'
  ],
  'bundesliga': [
    'Bayern Munich', 'Borussia Dortmund', 'RB Leipzig', 'Union Berlin',
    'Freiburg', 'Eintracht Frankfurt', 'Wolfsburg', 'Mainz', 'Borussia M\'gladbach',
    'Köln', 'Hoffenheim', 'Werder Bremen', 'Bochum', 'Augsburg',
    'Stuttgart', 'Darmstadt', 'Heidenheim'
  ],
};

// Classements FIFA pour équipes nationales
const FIFA_RANKINGS: Record<string, number> = {
  'Argentina': 1, 'France': 2, 'Spain': 3, 'England': 4, 'Brazil': 5,
  'Belgium': 6, 'Netherlands': 7, 'Portugal': 8, 'Colombia': 9, 'Italy': 10,
  'Germany': 11, 'Uruguay': 12, 'Croatia': 13, 'Morocco': 14, 'Japan': 15,
  'USA': 16, 'Mexico': 17, 'Senegal': 18, 'Switzerland': 19, 'Iran': 20,
  'Denmark': 21, 'Australia': 22, 'Austria': 23, 'South Korea': 24, 'Egypt': 25,
};

// ============================================
// FONCTIONS D'ANALYSE
// ============================================

function calculateFormScore(form: ('W' | 'D' | 'L')[]): number {
  let score = 0;
  form.forEach((result, index) => {
    const weight = (index + 1) / form.length; // Plus récent = plus important
    if (result === 'W') score += 3 * weight;
    else if (result === 'D') score += 1 * weight;
  });
  return score;
}

function calculateHomeAdvantage(league: League, isNeutralVenue: boolean): number {
  if (isNeutralVenue) return 0;
  
  // Avantage domicile par championnat
  const homeAdvantages: Partial<Record<League, number>> = {
    'ligue_1': 12,
    'premier_league': 10,
    'la_liga': 11,
    'serie_a': 13,
    'bundesliga': 10,
    'champions_league': 8,
    'world_cup': 5, // Moins d'avantage en Coupe du Monde
    'friendly': 3,
  };
  
  return homeAdvantages[league] || 10;
}

function getStandingsScore(homeStats: TeamStats, awayStats: TeamStats): number {
  // Score basé sur la différence de position au classement
  const positionDiff = awayStats.position - homeStats.position;
  const pointsDiff = homeStats.points - awayStats.points;
  
  // Normaliser entre -100 et +100
  const positionScore = Math.tanh(positionDiff / 5) * 50;
  const pointsScore = Math.tanh(pointsDiff / 10) * 50;
  
  return (positionScore + pointsScore) / 2;
}

function getMotivationScore(
  homeStats: TeamStats,
  awayStats: TeamStats,
  league: League,
  matchImportance: 'high' | 'medium' | 'low'
): number {
  let homeMotivation = 5;
  let awayMotivation = 5;
  
  // Équipes en haut du classement = motivées pour le titre
  if (homeStats.position <= 3) homeMotivation += 3;
  if (awayStats.position <= 3) awayMotivation += 3;
  
  // Équipes en bas = motivées pour le maintien
  if (homeStats.position >= 16) homeMotivation += 2;
  if (awayStats.position >= 16) awayMotivation += 2;
  
  // Importance du match
  const importanceBonus = { high: 3, medium: 1, low: 0 };
  homeMotivation += importanceBonus[matchImportance];
  awayMotivation += importanceBonus[matchImportance];
  
  // Compétition européenne en parallèle = fatigue
  if (homeStats.europeanCompetition) homeMotivation -= 1;
  if (awayStats.europeanCompetition) awayMotivation -= 1;
  
  return (homeMotivation - awayMotivation) * 5;
}

function getSquadScore(homeStats: TeamStats, awayStats: TeamStats): number {
  // Impact des blessures et suspensions
  const homeUnavailable = homeStats.keyPlayersInjured.length + homeStats.keyPlayersSuspended.length;
  const awayUnavailable = awayStats.keyPlayersInjured.length + awayStats.keyPlayersSuspended.length;
  
  const homeScore = homeStats.keyPlayersAvailable - (homeUnavailable * 5);
  const awayScore = awayStats.keyPlayersAvailable - (awayUnavailable * 5);
  
  return (homeScore - awayScore) * 0.5;
}

function getScheduleScore(homeStats: TeamStats, awayStats: TeamStats): number {
  // Équipes avec matchs européens récents = fatigue
  let homeFatigue = 0;
  let awayFatigue = 0;
  
  // Vérifier les 5 derniers matchs
  homeStats.last5Matches.forEach(match => {
    // Match récent = fatigue
  });
  
  if (homeStats.europeanCompetition) homeFatigue += 5;
  if (awayStats.europeanCompetition) awayFatigue += 5;
  
  return awayFatigue - homeFatigue;
}

function calculateH2HScore(homeTeam: string, awayTeam: string): number {
  // En production, récupérer depuis une base de données
  // Pour l'instant, retour neutre
  return 0;
}

// ============================================
// FONCTION PRINCIPALE D'ANALYSE
// ============================================

export function analyzeFootballMatch(
  match: FootballMatch,
  homeStats?: TeamStats,
  awayStats?: TeamStats
): FootballAnalysis {
  // Si pas de stats, utiliser des valeurs par défaut
  const home = homeStats || getDefaultTeamStats(match.homeTeam, match.league);
  const away = awayStats || getDefaultTeamStats(match.awayTeam, match.league);
  
  // Calculer les scores pour chaque facteur
  const formScore = calculateFormScore(home.form) - calculateFormScore(away.form);
  const standingsScore = getStandingsScore(home, away);
  const homeAdvantageScore = calculateHomeAdvantage(match.league, match.isNeutralVenue);
  const h2hScore = calculateH2HScore(match.homeTeam, match.awayTeam);
  const motivationScore = getMotivationScore(home, away, match.league, match.matchImportance);
  const squadScore = getSquadScore(home, away);
  const scheduleScore = getScheduleScore(home, away);
  
  // Poids des facteurs
  const WEIGHTS = {
    form: 0.20,
    standings: 0.20,
    homeAdvantage: 0.12,
    h2h: 0.13,
    motivation: 0.15,
    squad: 0.10,
    schedule: 0.10,
  };
  
  // Score total
  const totalScore = 
    formScore * WEIGHTS.form +
    standingsScore * WEIGHTS.standings +
    homeAdvantageScore * WEIGHTS.homeAdvantage +
    h2hScore * WEIGHTS.h2h +
    motivationScore * WEIGHTS.motivation +
    squadScore * WEIGHTS.squad +
    scheduleScore * WEIGHTS.schedule;
  
  // Convertir en probabilités
  const leaguePredictability = LEAGUE_PREDICTABILITY[match.league] || 0.75;
  
  const homeProb = Math.min(0.85, Math.max(0.10, 
    0.45 + (totalScore / 100) * 0.4 * leaguePredictability
  ));
  const awayProb = Math.min(0.85, Math.max(0.10, 
    0.45 - (totalScore / 100) * 0.4 * leaguePredictability
  ));
  const drawProb = Math.max(0.15, 1 - homeProb - awayProb);
  
  // Normaliser
  const total = homeProb + drawProb + awayProb;
  const winProbability = {
    home: homeProb / total,
    draw: drawProb / total,
    away: awayProb / total,
  };
  
  // Prédiction du résultat
  let predictedOutcome: 'home' | 'draw' | 'away';
  if (winProbability.home > winProbability.away && winProbability.home > winProbability.draw) {
    predictedOutcome = 'home';
  } else if (winProbability.away > winProbability.home && winProbability.away > winProbability.draw) {
    predictedOutcome = 'away';
  } else {
    predictedOutcome = 'draw';
  }
  
  // Score prédit
  const predictedScore = {
    home: Math.round(home.avgGoalsScored * (1 + homeAdvantageScore / 100)),
    away: Math.round(away.avgGoalsScored * (1 - homeAdvantageScore / 100)),
  };
  
  // Confiance
  const maxProb = Math.max(winProbability.home, winProbability.draw, winProbability.away);
  const confidence: 'very_high' | 'high' | 'medium' | 'low' = 
    maxProb > 0.55 ? 'very_high' :
    maxProb > 0.45 ? 'high' :
    maxProb > 0.38 ? 'medium' : 'low';
  
  // Value Bet Detection
  const valueBet = detectValueBet(match, winProbability, predictedScore);
  
  // Insights et warnings
  const insights = generateInsights(home, away, match, {
    form: formScore,
    standings: standingsScore,
    motivation: motivationScore,
  });
  
  const warnings = generateWarnings(home, away, match);
  
  return {
    matchId: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    league: match.league,
    predictedOutcome,
    predictedScore,
    winProbability,
    confidence,
    factors: {
      form: { 
        score: formScore, 
        description: getFormDescription(home, away) 
      },
      standings: { 
        score: standingsScore, 
        description: `Positions: ${home.name} #${home.position} vs ${away.name} #${away.position}` 
      },
      homeAdvantage: { 
        score: homeAdvantageScore, 
        description: match.isNeutralVenue ? 'Terrain neutre' : `${home.name} à domicile` 
      },
      h2h: { 
        score: h2hScore, 
        description: 'Historique non disponible' 
      },
      motivation: { 
        score: motivationScore, 
        description: getMotivationDescription(home, away, match) 
      },
      squad: { 
        score: squadScore, 
        description: getSquadDescription(home, away) 
      },
      schedule: { 
        score: scheduleScore, 
        description: getScheduleDescription(home, away) 
      },
    },
    valueBet,
    insights,
    warnings,
  };
}

// ============================================
// FONCTIONS AUXILIAIRES
// ============================================

function getDefaultTeamStats(teamName: string, league: League): TeamStats {
  return {
    id: teamName.toLowerCase().replace(/\s+/g, '-'),
    name: teamName,
    country: 'Unknown',
    league,
    position: 10,
    points: 30,
    played: 20,
    won: 8,
    drawn: 6,
    lost: 6,
    goalsFor: 28,
    goalsAgainst: 24,
    form: ['D', 'D', 'D', 'D', 'D'],
    last5Matches: [],
    homeRecord: { won: 5, drawn: 3, lost: 2 },
    awayRecord: { won: 3, drawn: 3, lost: 4 },
    avgGoalsScored: 1.4,
    avgGoalsConceded: 1.2,
    cleanSheets: 6,
    failedToScore: 4,
    keyPlayersAvailable: 80,
    keyPlayersInjured: [],
    keyPlayersSuspended: [],
  };
}

function detectValueBet(
  match: FootballMatch,
  ourProbs: { home: number; draw: number; away: number },
  predictedScore: { home: number; away: number }
): FootballAnalysis['valueBet'] {
  const impliedProbs = {
    home: 1 / match.homeOdds,
    draw: 1 / match.drawOdds,
    away: 1 / match.awayOdds,
  };
  
  const valueGaps = {
    home: ourProbs.home - impliedProbs.home,
    draw: ourProbs.draw - impliedProbs.draw,
    away: ourProbs.away - impliedProbs.away,
  };
  
  // Vérifier aussi les paris buts
  const totalGoals = predictedScore.home + predictedScore.away;
  const over25Gap = totalGoals > 2.5 ? 0.1 : -0.1;
  const bttsGap = predictedScore.home > 0 && predictedScore.away > 0 ? 0.1 : -0.1;
  
  // Trouver le meilleur value bet
  const maxValueGap = Math.max(valueGaps.home, valueGaps.draw, valueGaps.away, over25Gap, bttsGap);
  
  let recommendedBet: string;
  let betType: '1' | 'X' | '2' | 'Over' | 'Under' | 'BTTS';
  let odds: number;
  let ourProb: number;
  let impliedProb: number;
  
  if (maxValueGap === valueGaps.home) {
    recommendedBet = `Victoire ${match.homeTeam}`;
    betType = '1';
    odds = match.homeOdds;
    ourProb = ourProbs.home;
    impliedProb = impliedProbs.home;
  } else if (maxValueGap === valueGaps.draw) {
    recommendedBet = 'Match nul';
    betType = 'X';
    odds = match.drawOdds;
    ourProb = ourProbs.draw;
    impliedProb = impliedProbs.draw;
  } else if (maxValueGap === valueGaps.away) {
    recommendedBet = `Victoire ${match.awayTeam}`;
    betType = '2';
    odds = match.awayOdds;
    ourProb = ourProbs.away;
    impliedProb = impliedProbs.away;
  } else if (maxValueGap === over25Gap) {
    recommendedBet = 'Over 2.5 buts';
    betType = 'Over';
    odds = 1.85; // Estimation
    ourProb = 0.55;
    impliedProb = 0.54;
  } else {
    recommendedBet = 'Les deux marquent';
    betType = 'BTTS';
    odds = 1.75;
    ourProb = 0.58;
    impliedProb = 0.57;
  }
  
  const valueScore = Math.min(100, Math.max(0, maxValueGap * 200 + 50));
  
  return {
    exists: maxValueGap > 0.03 && valueScore > 40,
    recommendedBet,
    betType,
    odds,
    impliedProbability: impliedProb,
    ourProbability: ourProb,
    valueGap: maxValueGap,
    valueScore,
  };
}

function getFormDescription(home: TeamStats, away: TeamStats): string {
  const homeForm = home.form.slice(0, 5).join('');
  const awayForm = away.form.slice(0, 5).join('');
  
  const homeWins = home.form.filter(r => r === 'W').length;
  const awayWins = away.form.filter(r => r === 'W').length;
  
  if (homeWins > awayWins + 1) {
    return `${home.name} en meilleure forme (${homeForm})`;
  } else if (awayWins > homeWins + 1) {
    return `${away.name} en meilleure forme (${awayForm})`;
  }
  return `Forme similaire: ${homeForm} vs ${awayForm}`;
}

function getMotivationDescription(home: TeamStats, away: TeamStats, match: FootballMatch): string {
  const descriptions: string[] = [];
  
  if (home.position <= 3) descriptions.push(`${home.name} lutte pour le titre`);
  if (away.position <= 3) descriptions.push(`${away.name} lutte pour le titre`);
  if (home.position >= 16) descriptions.push(`${home.name} lutte pour le maintien`);
  if (away.position >= 16) descriptions.push(`${away.name} lutte pour le maintien`);
  
  if (match.matchImportance === 'high') {
    descriptions.push('Match à enjeu élevé');
  }
  
  return descriptions.length > 0 ? descriptions.join('. ') : 'Motivation standard';
}

function getSquadDescription(home: TeamStats, away: TeamStats): string {
  const homeIssues = home.keyPlayersInjured.length + home.keyPlayersSuspended.length;
  const awayIssues = away.keyPlayersInjured.length + away.keyPlayersSuspended.length;
  
  if (homeIssues > awayIssues + 1) {
    return `${home.name} affaibli (${homeIssues} absences)`;
  } else if (awayIssues > homeIssues + 1) {
    return `${away.name} affaibli (${awayIssues} absences)`;
  }
  return 'Effectifs complets';
}

function getScheduleDescription(home: TeamStats, away: TeamStats): string {
  if (home.europeanCompetition && away.europeanCompetition) {
    return 'Les deux équipes ont des matchs européens';
  } else if (home.europeanCompetition) {
    return `${home.name} a des matchs européens`;
  } else if (away.europeanCompetition) {
    return `${away.name} a des matchs européens`;
  }
  return 'Calendrier normal';
}

function generateInsights(
  home: TeamStats,
  away: TeamStats,
  match: FootballMatch,
  scores: { form: number; standings: number; motivation: number }
): string[] {
  const insights: string[] = [];
  
  // Forme
  if (scores.form > 10) {
    insights.push(`📊 ${home.name} en excellente forme`);
  } else if (scores.form < -10) {
    insights.push(`📊 ${away.name} en excellente forme`);
  }
  
  // Domicile
  if (!match.isNeutralVenue) {
    const homeWinRate = home.homeRecord.won / (home.homeRecord.won + home.homeRecord.drawn + home.homeRecord.lost);
    if (homeWinRate > 0.65) {
      insights.push(`🏠 ${home.name} très fort à domicile (${(homeWinRate * 100).toFixed(0)}% victoires)`);
    }
  }
  
  // Classement
  if (Math.abs(home.position - away.position) > 10) {
    const better = home.position < away.position ? home.name : away.name;
    insights.push(`📈 Écart au classement: ${better} favori logique`);
  }
  
  // Buts
  if (home.avgGoalsScored > 2 && away.avgGoalsConceded > 1.5) {
    insights.push(`⚽ ${home.name} marque beaucoup (${home.avgGoalsScored.toFixed(1)} buts/match)`);
  }
  
  return insights;
}

function generateWarnings(home: TeamStats, away: TeamStats, match: FootballMatch): string[] {
  const warnings: string[] = [];
  
  // Blessures
  if (home.keyPlayersInjured.length > 0) {
    warnings.push(`⚠️ ${home.name} sans ${home.keyPlayersInjured.slice(0, 2).join(', ')}`);
  }
  if (away.keyPlayersInjured.length > 0) {
    warnings.push(`⚠️ ${away.name} sans ${away.keyPlayersInjured.slice(0, 2).join(', ')}`);
  }
  
  // Suspensions
  if (home.keyPlayersSuspended.length > 0) {
    warnings.push(`🚫 ${home.name} suspendu(s): ${home.keyPlayersSuspended.join(', ')}`);
  }
  if (away.keyPlayersSuspended.length > 0) {
    warnings.push(`🚫 ${away.name} suspendu(s): ${away.keyPlayersSuspended.join(', ')}`);
  }
  
  // Match amical
  if (match.league === 'friendly') {
    warnings.push('ℹ️ Match amical - résultats moins prévisibles');
  }
  
  // Calendrier chargé
  if (home.europeanCompetition && away.europeanCompetition) {
    warnings.push('🗓️ Les deux équipes ont des matchs européens récents');
  }
  
  return warnings;
}

// ============================================
// FONCTIONS EXPORTÉES
// ============================================

export function getUpcomingMatches(league?: League): FootballMatch[] {
  // En production, ces données viendraient d'une API
  // Pour l'instant, données de démonstration
  const today = new Date();
  
  const allMatches: FootballMatch[] = [
    // Ligue 1
    {
      id: 'ligue1-001',
      homeTeam: 'PSG',
      awayTeam: 'Marseille',
      homeTeamId: 'psg',
      awayTeamId: 'marseille',
      league: 'ligue_1',
      leagueRound: 'Journée 25',
      date: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      venue: 'Parc des Princes, Paris',
      homeOdds: 1.45,
      drawOdds: 4.50,
      awayOdds: 6.00,
      isNeutralVenue: false,
      matchImportance: 'high',
    },
    {
      id: 'ligue1-002',
      homeTeam: 'Lyon',
      awayTeam: 'Monaco',
      homeTeamId: 'lyon',
      awayTeamId: 'monaco',
      league: 'ligue_1',
      leagueRound: 'Journée 25',
      date: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      venue: 'Groupama Stadium, Lyon',
      homeOdds: 2.80,
      drawOdds: 3.40,
      awayOdds: 2.50,
      isNeutralVenue: false,
      matchImportance: 'medium',
    },
    
    // Premier League
    {
      id: 'pl-001',
      homeTeam: 'Manchester City',
      awayTeam: 'Liverpool',
      homeTeamId: 'manchester-city',
      awayTeamId: 'liverpool',
      league: 'premier_league',
      leagueRound: 'Gameweek 26',
      date: new Date(today.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString(),
      venue: 'Etihad Stadium, Manchester',
      homeOdds: 1.85,
      drawOdds: 3.60,
      awayOdds: 4.00,
      isNeutralVenue: false,
      matchImportance: 'high',
    },
    {
      id: 'pl-002',
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      homeTeamId: 'arsenal',
      awayTeamId: 'chelsea',
      league: 'premier_league',
      leagueRound: 'Gameweek 26',
      date: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      venue: 'Emirates Stadium, London',
      homeOdds: 1.75,
      drawOdds: 3.80,
      awayOdds: 4.50,
      isNeutralVenue: false,
      matchImportance: 'high',
    },
    
    // La Liga
    {
      id: 'laliga-001',
      homeTeam: 'Real Madrid',
      awayTeam: 'Barcelona',
      homeTeamId: 'real-madrid',
      awayTeamId: 'barcelona',
      league: 'la_liga',
      leagueRound: 'Jornada 25',
      date: new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString(),
      venue: 'Santiago Bernabéu, Madrid',
      homeOdds: 2.20,
      drawOdds: 3.50,
      awayOdds: 3.10,
      isNeutralVenue: false,
      matchImportance: 'high',
    },
    
    // Serie A
    {
      id: 'seriea-001',
      homeTeam: 'Inter Milan',
      awayTeam: 'AC Milan',
      homeTeamId: 'inter-milan',
      awayTeamId: 'ac-milan',
      league: 'serie_a',
      leagueRound: 'Giornata 25',
      date: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      venue: 'San Siro, Milan',
      homeOdds: 1.90,
      drawOdds: 3.60,
      awayOdds: 4.00,
      isNeutralVenue: false,
      matchImportance: 'high',
    },
    
    // Bundesliga
    {
      id: 'bundesliga-001',
      homeTeam: 'Bayern Munich',
      awayTeam: 'Borussia Dortmund',
      homeTeamId: 'bayern-munich',
      awayTeamId: 'borussia-dortmund',
      league: 'bundesliga',
      leagueRound: 'Spieltag 23',
      date: new Date(today.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString(),
      venue: 'Allianz Arena, Munich',
      homeOdds: 1.55,
      drawOdds: 4.20,
      awayOdds: 5.50,
      isNeutralVenue: false,
      matchImportance: 'high',
    },
    
    // Champions League
    {
      id: 'cl-001',
      homeTeam: 'Real Madrid',
      awayTeam: 'Manchester City',
      homeTeamId: 'real-madrid',
      awayTeamId: 'manchester-city',
      league: 'champions_league',
      leagueRound: '8es de finale - Aller',
      date: new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      venue: 'Santiago Bernabéu, Madrid',
      homeOdds: 2.40,
      drawOdds: 3.40,
      awayOdds: 2.90,
      isNeutralVenue: false,
      matchImportance: 'high',
    },
    
    // Coupe du Monde (match de préparation / phase finale)
    {
      id: 'wc-001',
      homeTeam: 'France',
      awayTeam: 'Brazil',
      homeTeamId: 'france',
      awayTeamId: 'brazil',
      league: 'world_cup',
      leagueRound: 'Phase de groupes',
      date: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      venue: 'Stade arbitré, Qatar',
      homeOdds: 2.60,
      drawOdds: 3.20,
      awayOdds: 2.75,
      isNeutralVenue: true,
      matchImportance: 'high',
    },
  ];
  
  if (league) {
    return allMatches.filter(m => m.league === league);
  }
  
  return allMatches;
}

export function analyzeAllMatches(matches?: FootballMatch[]): FootballAnalysis[] {
  const matchList = matches || getUpcomingMatches();
  return matchList.map(match => analyzeFootballMatch(match));
}

export function getValueBetsFromFootball(minValueScore: number = 50): (FootballMatch & FootballAnalysis)[] {
  const matches = getUpcomingMatches();
  const analyses = matches.map(match => ({
    ...match,
    ...analyzeFootballMatch(match),
  }));
  
  return analyses
    .filter(a => a.valueBet.exists && a.valueBet.valueScore >= minValueScore)
    .sort((a, b) => b.valueBet.valueScore - a.valueBet.valueScore);
}

export { LEAGUE_NAMES, LEAGUE_PREDICTABILITY, FIFA_RANKINGS };
