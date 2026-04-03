/**
 * MLB Prediction Model - Sabermetrics
 *
 * Based on proven baseball analytics:
 * - Pythagorean Expectation (Bill James)
 * - FIP/xFIP for pitchers
 * - OPS+ / wRC+ for hitters
 * - Bullpen strength
 * - Home field advantage
 * - Rest days / travel
 */

// ============================================
// INTERFACES
// ============================================

export interface MLBTeam {
  id: string;
  name: string;
  abbreviation: string;
  city: string;
  league: 'AL' | 'NL';
  division: 'East' | 'Central' | 'West';

  // Stats offense
  runsScored: number;
  gamesPlayed: number;
  battingAverage: number;
  onBasePercentage: number;
  sluggingPercentage: number;
  ops: number; // OBP + SLG
  homeRuns: number;

  // Stats pitching
  runsAllowed: number;
  era: number; // Earned Run Average
  whip: number; // Walks + Hits per Inning Pitched
  strikeouts: number;
  walks: number;

  // Stats avancées
  pythagoreanWinPct: number;
  runDifferential: number;

  // Forme récente
  last10: number; // Victoires sur 10 derniers matchs
  streak: string; // ex: "W3" ou "L2"

  // Home/Away
  homeRecord: string; // ex: "45-36"
  awayRecord: string;
}

export interface MLBPitcher {
  id: string;
  name: string;
  teamId: string;
  handedness: 'L' | 'R';

  // Stats saison
  era: number;
  whip: number;
  wins: number;
  losses: number;
  inningsPitched: number;
  strikeouts: number;
  walks: number;
  homeRunsAllowed: number;
  battingAverageAgainst: number;

  // Stats avancées
  fip: number; // Fielding Independent Pitching
  eraMinus: number; // ERA- (100 = moyenne, <100 = meilleur)
  strikeoutRate: number; // K/9
  walkRate: number; // BB/9

  // Forme récente (3 derniers départs)
  recentEra: number;
  recentInnings: number;
}

export interface MLBMatch {
  id: string;
  homeTeam: MLBTeam;
  awayTeam: MLBTeam;
  homePitcher?: MLBPitcher;
  awayPitcher?: MLBPitcher;
  date: string;
  time: string;
  venue: string;

  // Odds
  oddsHome: number;
  oddsAway: number;
  totalRuns: number; // Over/Under line

  // Status
  isLive: boolean;
  isFinished: boolean;
  homeScore?: number;
  awayScore?: number;
  inning?: number;
  inningHalf?: 'top' | 'bottom' | 'middle' | 'end';
}

export interface MLBPrediction {
  matchId: string;

  // Vainqueur prédit
  predictedWinner: 'home' | 'away';
  winnerTeam: string;
  winnerProb: number;
  confidence: 'very_high' | 'high' | 'medium' | 'low';

  // Score projeté
  projectedHomeRuns: number;
  projectedAwayRuns: number;
  projectedTotal: number;

  // Run Line (handicap)
  runLine: {
    line: number; // ex: -1.5 pour favori
    favorite: string;
    recommendation: 'favorite' | 'underdog' | 'pass';
    confidence: number;
  };

  // Over/Under
  totalPrediction: {
    line: number;
    predicted: number;
    recommendation: 'over' | 'under' | 'pass';
    overProb: number;
    confidence: number;
  };

  // Moneyline Value
  moneyline: {
    homeProb: number;
    awayProb: number;
    valueBet: {
      detected: boolean;
      type: 'home' | 'away' | null;
      edge: number;
    };
  };

  // Facteurs clés
  keyFactors: string[];
  warnings: string[];

  // Détails du modèle
  modelDetails: {
    pythagoreanDiff: number;
    pitchingMatchup: string;
    bullpenAdvantage: 'home' | 'away' | 'even';
    homeFieldAdvantage: number;
    restAdvantage: string;
    recentForm: string;
  };
}

// ============================================
// CONSTANTES
// ============================================

// Avantage domicile MLB (historiquement ~54%)
const HOME_WIN_BASE_RATE = 0.54;
const HOME_FIELD_ADVANTAGE = 0.02; // +2% au taux de victoire

// Facteurs de pondération
const WEIGHTS = {
  pythagorean: 0.25,
  pitching: 0.25,
  offense: 0.20,
  homeField: 0.10,
  recentForm: 0.15,
  bullpen: 0.05,
};

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Calcule la Pythagorean Expectation (Bill James)
 * Win% = runsScored² / (runsScored² + runsAllowed²)
 */
export function calculatePythagoreanExpectation(
  runsScored: number,
  runsAllowed: number,
  exponent: number = 1.83
): number {
  if (runsScored === 0 && runsAllowed === 0) return 0.5;
  const rs = Math.pow(runsScored, exponent);
  const ra = Math.pow(runsAllowed, exponent);
  return rs / (rs + ra);
}

/**
 * Calcule le FIP (Fielding Independent Pitching)
 * FIP = ((13*HR) + (3*(BB+HBP)) - (2*K)) / IP + constant
 */
export function calculateFIP(
  homeRuns: number,
  walks: number,
  hitByPitch: number,
  strikeouts: number,
  inningsPitched: number
): number {
  if (inningsPitched === 0) return 4.50; // Moyenne MLB
  const constant = 3.10; // Constante MLB 2024
  const fip = ((13 * homeRuns) + (3 * (walks + hitByPitch)) - (2 * strikeouts)) / inningsPitched + constant;
  return Math.round(fip * 100) / 100;
}

/**
 * Calcule l'OPS+ (On-base Plus Slugging Plus)
 * OPS+ = 100 * (OBP / lgOBP + SLG / lgSLG - 1)
 */
export function calculateOPSPlus(
  ops: number,
  leagueOPS: number = 0.720 // Moyenne MLB 2024
): number {
  return Math.round(100 * (ops / leagueOPS));
}

/**
 * Calcule l'ERA- (ERA Minus)
 * ERA- = 100 * (ERA / lgERA)
 * < 100 = meilleur que la moyenne
 */
export function calculateERAMinus(
  era: number,
  leagueERA: number = 4.15 // Moyenne MLB 2024
): number {
  return Math.round(100 * (era / leagueERA));
}

/**
 * Estime le nombre de runs basé sur les stats
 */
function estimateRunsScored(
  team: MLBTeam,
  opposingPitcher?: MLBPitcher
): number {
  // Base: runs par match
  let baseRuns = team.runsScored / Math.max(1, team.gamesPlayed);

  // Ajustement OPS
  const opsFactor = team.ops / 0.720; // vs moyenne ligue
  baseRuns *= opsFactor;

  // Ajustement lanceur adverse
  if (opposingPitcher) {
    const pitcherFactor = 4.15 / Math.max(0.1, opposingPitcher.era);
    baseRuns *= pitcherFactor;
  }

  return Math.max(1, Math.round(baseRuns * 10) / 10);
}

/**
 * Évalue le matchup des lanceurs partants
 */
function evaluatePitchingMatchup(
  homePitcher?: MLBPitcher,
  awayPitcher?: MLBPitcher
): { advantage: 'home' | 'away' | 'even'; description: string } {
  if (!homePitcher && !awayPitcher) {
    return { advantage: 'even', description: 'Lanceurs non disponibles' };
  }
  if (!homePitcher) {
    return { advantage: 'away', description: `Avantage ${awayPitcher!.name} (ERA ${awayPitcher!.era.toFixed(2)})` };
  }
  if (!awayPitcher) {
    return { advantage: 'home', description: `Avantage ${homePitcher.name} (ERA ${homePitcher.era.toFixed(2)})` };
  }

  // Comparaison ERA
  const eraDiff = awayPitcher.era - homePitcher.era;

  // Comparaison FIP (plus stable que ERA)
  const homeFIP = homePitcher.fip || calculateFIP(
    homePitcher.homeRunsAllowed,
    homePitcher.walks,
    0,
    homePitcher.strikeouts,
    homePitcher.inningsPitched
  );
  const awayFIP = awayPitcher.fip || calculateFIP(
    awayPitcher.homeRunsAllowed,
    awayPitcher.walks,
    0,
    awayPitcher.strikeouts,
    awayPitcher.inningsPitched
  );

  const fipDiff = awayFIP - homeFIP;

  // Score composite (-10 à +10)
  const score = (eraDiff * 2) + (fipDiff * 1.5);

  if (score > 1) {
    return {
      advantage: 'home',
      description: `Avantage ${homePitcher.name}: ERA ${homePitcher.era.toFixed(2)} vs ${awayPitcher.era.toFixed(2)}, FIP ${homeFIP.toFixed(2)} vs ${awayFIP.toFixed(2)}`
    };
  } else if (score < -1) {
    return {
      advantage: 'away',
      description: `Avantage ${awayPitcher.name}: ERA ${awayPitcher.era.toFixed(2)} vs ${homePitcher.era.toFixed(2)}, FIP ${awayFIP.toFixed(2)} vs ${homeFIP.toFixed(2)}`
    };
  }

  return {
    advantage: 'even',
    description: `Matchup serré: ${homePitcher.name} (${homePitcher.era.toFixed(2)}) vs ${awayPitcher.name} (${awayPitcher.era.toFixed(2)})`
  };
}

/**
 * Analyse la forme récente
 */
function analyzeRecentForm(team: MLBTeam): { score: number; description: string } {
  const last10Rate = team.last10 / 10;

  // Analyser la streak
  let streakBonus = 0;
  if (team.streak) {
    const match = team.streak.match(/([WL])(\d+)/);
    if (match) {
      const type = match[1];
      const length = parseInt(match[2]);
      streakBonus = type === 'W' ? length * 0.02 : -length * 0.02;
    }
  }

  const score = last10Rate + streakBonus;

  let description = '';
  if (score >= 0.7) description = '🔥 Excellente forme';
  else if (score >= 0.6) description = '✅ Bonne forme';
  else if (score >= 0.5) description = '➖ Forme moyenne';
  else description = '⚠️ Mauvaise forme';

  return { score, description };
}

// ============================================
// PRÉDICTION PRINCIPALE
// ============================================

/**
 * Génère une prédiction MLB complète
 */
export function predictMLBMatch(
  match: MLBMatch,
  teamStats: Record<string, Partial<MLBTeam>>,
  pitcherStats: Record<string, Partial<MLBPitcher>>
): MLBPrediction {
  const home = match.homeTeam;
  const away = match.awayTeam;

  // 1. Pythagorean Expectation
  const homePyth = home.pythagoreanWinPct || calculatePythagoreanExpectation(
    home.runsScored,
    home.runsAllowed
  );
  const awayPyth = away.pythagoreanWinPct || calculatePythagoreanExpectation(
    away.runsScored,
    away.runsAllowed
  );
  const pythagoreanDiff = homePyth - awayPyth;

  // 2. Pitching Matchup
  const homePitcher = match.homePitcher;
  const awayPitcher = match.awayPitcher;
  const pitchingEval = evaluatePitchingMatchup(homePitcher, awayPitcher);

  // 3. Offense (OPS)
  const homeOffense = home.ops || 0.720;
  const awayOffense = away.ops || 0.720;
  const offenseDiff = (homeOffense - awayOffense) / 0.720;

  // 4. Forme récente
  const homeForm = analyzeRecentForm(home);
  const awayForm = analyzeRecentForm(away);

  // 5. Avantage domicile
  const homeFieldBonus = HOME_FIELD_ADVANTAGE;

  // 6. Calcul du taux de victoire
  let homeWinProb = 0.5;
  homeWinProb += pythagoreanDiff * WEIGHTS.pythagorean;
  homeWinProb += (pitchingEval.advantage === 'home' ? 0.08 : pitchingEval.advantage === 'away' ? -0.08 : 0) * WEIGHTS.pitching;
  homeWinProb += offenseDiff * WEIGHTS.offense;
  homeWinProb += (homeForm.score - awayForm.score) * WEIGHTS.recentForm;
  homeWinProb += homeFieldBonus * WEIGHTS.homeField;

  // Normaliser entre 0.25 et 0.75
  homeWinProb = Math.max(0.25, Math.min(0.75, homeWinProb));

  const awayWinProb = 1 - homeWinProb;

  // Déterminer le vainqueur prédit
  const predictedWinner = homeWinProb > 0.5 ? 'home' : 'away';
  const winnerTeam = predictedWinner === 'home' ? home.name : away.name;
  const winnerProb = Math.max(homeWinProb, awayWinProb);

  // Confiance
  let confidence: 'very_high' | 'high' | 'medium' | 'low';
  if (winnerProb >= 0.65) confidence = 'very_high';
  else if (winnerProb >= 0.58) confidence = 'high';
  else if (winnerProb >= 0.53) confidence = 'medium';
  else confidence = 'low';

  // Score projeté
  const projectedHomeRuns = estimateRunsScored(home, awayPitcher);
  const projectedAwayRuns = estimateRunsScored(away, homePitcher);
  const projectedTotal = projectedHomeRuns + projectedAwayRuns;

  // Run Line
  const runLineLine = predictedWinner === 'home' ? -1.5 : 1.5;
  const runLineConfidence = winnerProb >= 0.60 ? 70 : winnerProb >= 0.55 ? 50 : 30;

  // Over/Under
  const totalLine = match.totalRuns || 8.5;
  const overProb = projectedTotal > totalLine ? 0.55 + (projectedTotal - totalLine) * 0.05 : 0.45;
  const totalRecommendation = overProb > 0.55 ? 'over' : overProb < 0.45 ? 'under' : 'pass';

  // Value Bet
  const impliedHomeProb = match.oddsHome > 0 ? 1 / match.oddsHome : homeWinProb;
  const impliedAwayProb = match.oddsAway > 0 ? 1 / match.oddsAway : awayWinProb;

  const homeEdge = homeWinProb - impliedHomeProb;
  const awayEdge = awayWinProb - impliedAwayProb;

  const valueBet = {
    detected: Math.max(homeEdge, awayEdge) > 0.05,
    type: homeEdge > awayEdge && homeEdge > 0.05 ? 'home' as const :
          awayEdge > homeEdge && awayEdge > 0.05 ? 'away' as const : null,
    edge: Math.max(homeEdge, awayEdge) * 100,
  };

  // Facteurs clés
  const keyFactors: string[] = [];
  if (Math.abs(pythagoreanDiff) > 0.1) {
    keyFactors.push(`Pythagorean: ${home.name} ${ (homePyth * 100).toFixed(0)}% vs ${away.name} ${(awayPyth * 100).toFixed(0)}%`);
  }
  keyFactors.push(pitchingEval.description);
  if (Math.abs(offenseDiff) > 0.1) {
    keyFactors.push(`Offense OPS: ${home.name} ${homeOffense.toFixed(3)} vs ${away.name} ${awayOffense.toFixed(3)}`);
  }
  keyFactors.push(`Forme: ${home.name} ${homeForm.description} / ${away.name} ${awayForm.description}`);

  // Warnings
  const warnings: string[] = [];
  if (confidence === 'low') {
    warnings.push('Match très serré - Éviter ou petit stake');
  }
  if (Math.abs(projectedTotal - totalLine) < 0.5) {
    warnings.push('Total très proche de la ligne - Pass sur Over/Under');
  }

  return {
    matchId: match.id,
    predictedWinner,
    winnerTeam,
    winnerProb: Math.round(winnerProb * 100),
    confidence,
    projectedHomeRuns,
    projectedAwayRuns,
    projectedTotal,
    runLine: {
      line: runLineLine,
      favorite: predictedWinner === 'home' ? home.name : away.name,
      recommendation: runLineConfidence >= 60 ? 'favorite' : runLineConfidence >= 40 ? 'underdog' : 'pass',
      confidence: runLineConfidence,
    },
    totalPrediction: {
      line: totalLine,
      predicted: projectedTotal,
      recommendation: totalRecommendation,
      overProb: Math.round(overProb * 100),
      confidence: Math.round(Math.abs(overProb - 0.5) * 200),
    },
    moneyline: {
      homeProb: Math.round(homeWinProb * 100),
      awayProb: Math.round(awayWinProb * 100),
      valueBet,
    },
    keyFactors,
    warnings,
    modelDetails: {
      pythagoreanDiff: Math.round(pythagoreanDiff * 1000) / 1000,
      pitchingMatchup: pitchingEval.description,
      bullpenAdvantage: 'even', // Simplifié pour l'instant
      homeFieldAdvantage: homeFieldBonus * 100,
      restAdvantage: 'Aucune info',
      recentForm: `${home.name}: ${homeForm.description} | ${away.name}: ${awayForm.description}`,
    },
  };
}

/**
 * Génère des stats d'équipe par défaut basées sur la cote
 */
export function generateDefaultTeamStats(
  teamName: string,
  odds: number
): Partial<MLBTeam> {
  const impliedProb = 1 / odds;
  const strengthFactor = impliedProb / 0.5; // Ratio vs 50%

  return {
    name: teamName,
    runsScored: Math.round(750 * strengthFactor),
    runsAllowed: Math.round(750 / strengthFactor),
    gamesPlayed: 162,
    battingAverage: Math.round((0.250 + (strengthFactor - 1) * 0.020) * 1000) / 1000,
    onBasePercentage: Math.round((0.320 + (strengthFactor - 1) * 0.025) * 1000) / 1000,
    sluggingPercentage: Math.round((0.400 + (strengthFactor - 1) * 0.050) * 1000) / 1000,
    ops: Math.round((0.720 + (strengthFactor - 1) * 0.075) * 1000) / 1000,
    era: Math.round((4.15 / strengthFactor) * 100) / 100,
    whip: Math.round((1.30 / strengthFactor) * 100) / 100,
    last10: Math.round(5 + strengthFactor * 3),
    streak: '',
  };
}

export default {
  predictMLBMatch,
  calculatePythagoreanExpectation,
  calculateFIP,
  calculateOPSPlus,
  calculateERAMinus,
  generateDefaultTeamStats,
};
