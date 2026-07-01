/**
 * Modèle Dixon-Coles pour Prédictions Football
 * 
 * Amélioration du modèle Poisson classique avec:
 * - Ajustement pour scores bas (0-0, 1-0, 1-1)
 * - Paramètre de dépendance temporelle (déclin forme)
 * - Calibration sur données réelles
 * 
 * Référence: Dixon & Coles (1997) "Modelling Association Football Scores"
 */

// Interface pour les stats d'équipe
interface TeamStats {
  name: string;
  goalsScored: number;
  goalsConceded: number;
  matches: number;
  homeGoalsScored?: number;
  homeGoalsConceded?: number;
  homeMatches?: number;
  awayGoalsScored?: number;
  awayGoalsConceded?: number;
  awayMatches?: number;
  form?: number[]; // 5 derniers matchs (1=win, 0.5=draw, 0=loss)
}

// Interface pour les prédictions
interface MatchPrediction {
  homeTeam: string;
  awayTeam: string;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  mostLikelyScore: { home: number; away: number; prob: number };
  over25: number;
  under25: number;
  btts: { yes: number; no: number };
  correctScores: { home: number; away: number; prob: number }[];
  confidence: 'high' | 'medium' | 'low';
  valueBet: {
    detected: boolean;
    type: 'home' | 'draw' | 'away' | null;
    edge: number;
    odds: number;
  };
}

// Paramètres du modèle Dixon-Coles
const DIXON_COLES_PARAMS = {
  // Paramètre d'ajustement pour scores bas
  rho: 0.13, // Dépendance entre buts home/away pour scores bas
  // Paramètre de déclin temporel (poids forme récente)
  xi: 0.0018, // Taux de déclin
  // Force des équipes top (pour ajustement)
  topTeamsStrength: 1.5,
  // Seuils de confiance
  highConfidenceThreshold: 65,
  lowConfidenceThreshold: 45,
};

// Force de base des ligues (pour normalisation)
const LEAGUE_STRENGTH: Record<string, number> = {
  'Premier League': 1.0,
  'La Liga': 0.95,
  'Bundesliga': 0.92,
  'Serie A': 0.90,
  'Ligue 1': 0.88,
  'Ligue des Champions': 1.1,
  'Europa League': 0.95,
  'default': 0.85,
};

/**
 * Calcul de la force offensive et défensive d'une équipe
 */
function calculateTeamStrength(stats: TeamStats): {
  attackStrength: number;
  defenseStrength: number;
  homeAttackBonus: number;
  homeDefenseBonus: number;
} {
  if (stats.matches === 0) {
    return { attackStrength: 1.0, defenseStrength: 1.0, homeAttackBonus: 1.1, homeDefenseBonus: 0.9 };
  }

  // Moyennes de buts par match
  const avgGoalsScored = stats.goalsScored / stats.matches;
  const avgGoalsConceded = stats.goalsConceded / stats.matches;
  
  // Force offensive (plus c'est haut, plus l'équipe marque)
  const attackStrength = avgGoalsScored > 0 ? avgGoalsScored / 1.35 : 0.8;
  
  // Force défensive (plus c'est bas, moins l'équipe encaisse)
  const defenseStrength = avgGoalsConceded > 0 ? 1.35 / avgGoalsConceded : 1.2;
  
  // Bonus domicile
  const homeAttackBonus = (stats.homeGoalsScored && stats.homeMatches)
    ? (stats.homeGoalsScored / stats.homeMatches) / avgGoalsScored
    : 1.15;
  
  const homeDefenseBonus = (stats.homeGoalsConceded && stats.homeMatches)
    ? (stats.homeGoalsConceded / stats.homeMatches) / avgGoalsConceded
    : 0.9;

  return {
    attackStrength: Math.min(2.0, Math.max(0.5, attackStrength)),
    defenseStrength: Math.min(2.0, Math.max(0.5, defenseStrength)),
    homeAttackBonus: Math.min(1.5, Math.max(0.8, homeAttackBonus)),
    homeDefenseBonus: Math.min(1.2, Math.max(0.7, homeDefenseBonus)),
  };
}

/**
 * Calcul de l'ajustement Dixon-Coles pour scores bas
 */
function dixonColesAdjustment(homeGoals: number, awayGoals: number, lambda: number, mu: number, rho: number): number {
  // Ajustement pour les scores 0-0, 1-0, 0-1, 1-1
  if (homeGoals === 0 && awayGoals === 0) {
    return 1 - (lambda * mu * rho);
  } else if (homeGoals === 1 && awayGoals === 0) {
    return 1 + (lambda * rho);
  } else if (homeGoals === 0 && awayGoals === 1) {
    return 1 + (mu * rho);
  } else if (homeGoals === 1 && awayGoals === 1) {
    return 1 - rho;
  }
  return 1;
}

/**
 * Probabilité Poisson
 */
function poissonProb(k: number, lambda: number): number {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

/**
 * Factorielle (optimisée)
 */
function factorial(n: number): number {
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n === 3) return 6;
  if (n === 4) return 24;
  if (n === 5) return 120;
  if (n === 6) return 720;
  if (n === 7) return 5040;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

/**
 * Calcul du poids temporel (forme récente)
 */
function temporalWeight(form: number[], xi: number = DIXON_COLES_PARAMS.xi): number {
  if (!form || form.length === 0) return 0.5;
  
  // Poids exponentiel décroissant (matchs récents = plus important)
  let totalWeight = 0;
  let weightedForm = 0;
  
  form.forEach((result, idx) => {
    const daysAgo = (form.length - idx) * 7; // Approximation: 1 match/semaine
    const weight = Math.exp(-xi * daysAgo);
    totalWeight += weight;
    weightedForm += result * weight;
  });
  
  return totalWeight > 0 ? weightedForm / totalWeight : 0.5;
}

/**
 * Prédiction principale Dixon-Coles
 */
export function predictMatch(
  homeStats: TeamStats,
  awayStats: TeamStats,
  league: string = 'default',
  homeOdds: number = 2.0,
  drawOdds: number = 3.3,
  awayOdds: number = 3.5
): MatchPrediction {
  
  // 1. Calculer les forces des équipes
  const homeStrength = calculateTeamStrength(homeStats);
  const awayStrength = calculateTeamStrength(awayStats);
  
  // 2. Force de la ligue
  const leagueFactor = LEAGUE_STRENGTH[league] || LEAGUE_STRENGTH['default'];
  
  // 3. Calculer les espérances de buts (lambda = home, mu = away)
  // Buts attendus = force offensive × faiblesse défensive adverse × facteur domicile
  const baseHomeGoals = 1.35 * leagueFactor; // Moyenne de buts domicile
  const baseAwayGoals = 1.10 * leagueFactor; // Moyenne de buts extérieur
  
  const lambda = baseHomeGoals 
    * homeStrength.attackStrength 
    * awayStrength.defenseStrength 
    * homeStrength.homeAttackBonus;
  
  const mu = baseAwayGoals 
    * awayStrength.attackStrength 
    * homeStrength.defenseStrength 
    * (2 - homeStrength.homeDefenseBonus);
  
  // 4. Ajustement forme récente
  const homeFormWeight = temporalWeight(homeStats.form || []);
  const awayFormWeight = temporalWeight(awayStats.form || []);
  
  const formAdjustment = 0.15 * (homeFormWeight - awayFormWeight);
  
  const adjustedLambda = Math.max(0.3, lambda * (1 + formAdjustment));
  const adjustedMu = Math.max(0.3, mu * (1 - formAdjustment * 0.5));
  
  // 5. Calculer les probabilités avec Dixon-Coles
  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;
  let over25Prob = 0;
  let bttsYesProb = 0;
  
  const maxGoals = 8;
  const scoreProbs: { home: number; away: number; prob: number }[] = [];
  
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      // Probabilité Poisson de base
      const poissonHome = poissonProb(h, adjustedLambda);
      const poissonAway = poissonProb(a, adjustedMu);
      
      // Ajustement Dixon-Coles
      const dcAdj = dixonColesAdjustment(h, a, adjustedLambda, adjustedMu, DIXON_COLES_PARAMS.rho);
      
      // Probabilité ajustée
      const prob = poissonHome * poissonAway * dcAdj;
      
      // Classer par résultat
      if (h > a) homeWinProb += prob;
      else if (h === a) drawProb += prob;
      else awayWinProb += prob;
      
      // Over 2.5
      if (h + a > 2.5) over25Prob += prob;
      
      // BTTS
      if (h > 0 && a > 0) bttsYesProb += prob;
      
      // Stocker pour score exact
      scoreProbs.push({ home: h, away: a, prob });
    }
  }
  
  // Normaliser (le total peut dépasser 1% à cause des arrondis)
  const total = homeWinProb + drawProb + awayWinProb;
  homeWinProb /= total;
  drawProb /= total;
  awayWinProb /= total;
  
  // 6. Scores exacts les plus probables
  scoreProbs.sort((a, b) => b.prob - a.prob);
  const topScores = scoreProbs.slice(0, 5);
  
  // 7. Calculer le value bet
  const impliedHome = 1 / homeOdds;
  const impliedDraw = 1 / drawOdds;
  const impliedAway = 1 / awayOdds;
  
  const homeEdge = homeWinProb - impliedHome;
  const drawEdge = drawProb - impliedDraw;
  const awayEdge = awayWinProb - impliedAway;
  
  let valueBet: MatchPrediction['valueBet'] = {
    detected: false,
    type: null,
    edge: 0,
    odds: 0,
  };
  
  // Détecter le value bet (edge > 5%)
  if (homeEdge > 0.05) {
    valueBet = { detected: true, type: 'home', edge: homeEdge, odds: homeOdds };
  } else if (awayEdge > 0.05) {
    valueBet = { detected: true, type: 'away', edge: awayEdge, odds: awayOdds };
  } else if (drawEdge > 0.04) {
    valueBet = { detected: true, type: 'draw', edge: drawEdge, odds: drawOdds };
  }
  
  // 8. Calculer la confiance
  const maxProb = Math.max(homeWinProb, drawProb, awayWinProb);
  let confidence: 'high' | 'medium' | 'low';
  
  if (maxProb > DIXON_COLES_PARAMS.highConfidenceThreshold / 100) {
    confidence = 'high';
  } else if (maxProb > DIXON_COLES_PARAMS.lowConfidenceThreshold / 100) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  
  // 9. Score le plus probable
  const mostLikelyScore = topScores[0];
  
  return {
    homeTeam: homeStats.name,
    awayTeam: awayStats.name,
    homeWinProb: Math.round(homeWinProb * 1000) / 10,
    drawProb: Math.round(drawProb * 1000) / 10,
    awayWinProb: Math.round(awayWinProb * 1000) / 10,
    expectedHomeGoals: Math.round(adjustedLambda * 10) / 10,
    expectedAwayGoals: Math.round(adjustedMu * 10) / 10,
    mostLikelyScore: {
      home: mostLikelyScore.home,
      away: mostLikelyScore.away,
      prob: Math.round(mostLikelyScore.prob * 1000) / 10,
    },
    over25: Math.round(over25Prob * 1000) / 10,
    under25: Math.round((1 - over25Prob) * 1000) / 10,
    btts: {
      yes: Math.round(bttsYesProb * 1000) / 10,
      no: Math.round((1 - bttsYesProb) * 1000) / 10,
    },
    correctScores: topScores.map(s => ({
      home: s.home,
      away: s.away,
      prob: Math.round(s.prob * 1000) / 10,
    })),
    confidence,
    valueBet,
  };
}

// ============================================
// PRÉDICTION ENRICHI AVEC DONNÉES THESPORTSDB
// ============================================

/**
 * Interface pour les données de classement TheSportsDB
 */
export interface LeagueTableStats {
  teamName: string;
  rank: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: string; // ex: "WWLWD"
}

/**
 * Résultat enrichi pour Over/Under 2.5
 */
export interface GoalsPredictionResult {
  over25: number;       // Probabilité Over 2.5 (%)
  under25: number;      // Probabilité Under 2.5 (%)
  over15: number;       // Probabilité Over 1.5 (%)
  btts: number;        // Probabilité Both Teams To Score (%)
  expectedGoals: number;
  expectedHome: number;
  expectedAway: number;
  mostLikelyScore: string;
  // Score le plus probable cohérent avec l'Over/Under
  mostLikelyOverScore: string;   // Score le plus probable avec 3+ buts
  mostLikelyUnderScore: string;  // Score le plus probable avec 0-2 buts
  confidence: 'high' | 'medium' | 'low';
  source: 'dixon-coles' | 'poisson-odds';
  // Recommandation
  recommendation: 'over25' | 'under25' | 'skip';
  recConfidence: number;
}

/**
 * Calcule une prédiction Over/Under enrichie en combinant:
 * 1. Dixon-Coles (si stats TheSportsDB disponibles)
 * 2. Poisson sur cotes (fallback)
 * 
 * Les données TheSportsDB (classement) fournissent GF/GA et forme,
 * permettant un calcul Dixon-Coles beaucoup plus précis.
 */
export function predictGoalsEnriched(
  homeTeam: string,
  awayTeam: string,
  league: string,
  oddsHome?: number,
  oddsDraw?: number | null,
  oddsAway?: number,
  homeTableStats?: LeagueTableStats | null,
  awayTableStats?: LeagueTableStats | null,
  isEstimated?: boolean
): GoalsPredictionResult {
  // Priorité 1: Dixon-Coles avec stats réelles TheSportsDB
  if (homeTableStats && awayTableStats && homeTableStats.played >= 5 && awayTableStats.played >= 5) {
    return predictGoalsFromTableStats(homeTableStats, awayTableStats);
  }
  
  // Priorité 2: Poisson sur cotes (si cotes réelles)
  if (oddsHome && oddsAway && oddsHome > 1 && oddsAway > 1 && !isEstimated) {
    return predictGoalsFromOdds(oddsHome, oddsDraw, oddsAway);
  }
  
  // Fallback: aucune donnée fiable
  return {
    over25: 50,
    under25: 50,
    over15: 65,
    btts: 50,
    expectedGoals: 2.5,
    expectedHome: 1.3,
    expectedAway: 1.2,
    mostLikelyScore: '1-1',
    mostLikelyOverScore: '2-1',
    mostLikelyUnderScore: '1-1',
    confidence: 'low',
    source: 'poisson-odds',
    recommendation: 'skip',
    recConfidence: 0,
  };
}

/**
 * Dixon-Coles enrichi avec stats réelles du classement TheSportsDB.
 * Utilise: GF, GA, forme (WWLWD), rang, points par match.
 */
function predictGoalsFromTableStats(
  home: LeagueTableStats,
  away: LeagueTableStats
): GoalsPredictionResult {
  // 1. Calculer force offensive/défensive à partir du classement réel
  // Buts attendus par match (basé sur GF total / joués)
  const homeGoalsPerMatch = home.goalsFor / home.played;
  const awayGoalsPerMatch = away.goalsFor / away.played;
  const homeConcededPerMatch = home.goalsAgainst / home.played;
  const awayConcededPerMatch = away.goalsAgainst / away.played;
  
  // 2. Force relative (pondérée par le nombre de matchs)
  // Plus de matchs = données plus fiables
  const weightFactor = Math.min(1.0, (home.played + away.played) / 60); // Max à ~30 matchs chacun
  
  // 3. Bonus/penalité forme récente (5 derniers matchs)
  const homeForm = parseFormString(home.form);
  const awayForm = parseFormString(away.form);
  const homeFormMultiplier = 1.0 + (homeForm.goalsScoredAvg - 1.3) * 0.15;
  const awayFormMultiplier = 1.0 + (awayForm.goalsScoredAvg - 1.3) * 0.15;
  const homeConcededMultiplier = 1.0 + (homeForm.goalsConcededAvg - 1.0) * 0.1;
  const awayConcededMultiplier = 1.0 + (awayForm.goalsConcededAvg - 1.0) * 0.1;
  
  // 4. Bonus domicile (historiquement ~+0.3 buts)
  const homeAdvantage = 0.25;
  
  // 5. Calculer les lambdas (buts attendus) pour Dixon-Coles
  // Home expected goals = (home attack strength) * (away defensive weakness) * home advantage
  const lambda = Math.max(0.4, 
    homeGoalsPerMatch * awayConcededPerMatch * homeFormMultiplier * (1 + homeAdvantage) * weightFactor +
    1.35 * (1 - weightFactor) // Fallback vers la moyenne de la ligue
  );
  
  // Away expected goals = (away attack strength) * (home defensive weakness)
  const mu = Math.max(0.3,
    awayGoalsPerMatch * homeConcededPerMatch * awayFormMultiplier * awayConcededMultiplier * weightFactor +
    1.10 * (1 - weightFactor) // Fallback
  );
  
  // 6. Exécuter le modèle Poisson-Dixon-Coles
  const maxGoals = 8;
  let over25Prob = 0;
  let over15Prob = 0;
  let bttsProb = 0;
  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;
  
  const scoreProbs: { home: number; away: number; prob: number }[] = [];
  
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const poissonHome = poissonProb(h, lambda);
      const poissonAway = poissonProb(a, mu);
      const dcAdj = dixonColesAdjustment(h, a, lambda, mu, DIXON_COLES_PARAMS.rho);
      const prob = poissonHome * poissonAway * dcAdj;
      
      if (h > a) homeWinProb += prob;
      else if (h === a) drawProb += prob;
      else awayWinProb += prob;
      
      if (h + a > 2.5) over25Prob += prob;
      if (h + a > 1.5) over15Prob += prob;
      if (h > 0 && a > 0) bttsProb += prob;
      
      scoreProbs.push({ home: h, away: a, prob });
    }
  }
  
  // Normaliser
  const total = homeWinProb + drawProb + awayWinProb;
  if (total > 0) {
    homeWinProb /= total;
    drawProb /= total;
    awayWinProb /= total;
  }
  
  // Score le plus probable (global, over, under)
  scoreProbs.sort((a, b) => b.prob - a.prob);
  const topScore = scoreProbs[0];
  const topOverScore = scoreProbs.find(s => s.home + s.away >= 3) || topScore;
  const topUnderScore = scoreProbs.find(s => s.home + s.away <= 2) || topScore;
  
  // 7. Confiance basée sur la quantité de données
  let confidence: 'high' | 'medium' | 'low';
  const dataPoints = home.played + away.played;
  if (dataPoints >= 50) confidence = 'high';
  else if (dataPoints >= 20) confidence = 'medium';
  else confidence = 'low';
  
  // 8. Recommandation Over/Under
  const over25Pct = Math.round(over25Prob * 1000) / 10;
  let recommendation: 'over25' | 'under25' | 'skip' = 'skip';
  let recConfidence = 0;
  
  // Seuil de confiance: |over% - 50%| doit être significatif
  if (over25Pct >= 60) {
    recommendation = 'over25';
    recConfidence = over25Pct - 50;
  } else if (over25Pct <= 40) {
    recommendation = 'under25';
    recConfidence = 50 - over25Pct;
  }
  
  return {
    over25: over25Pct,
    under25: Math.round((1 - over25Prob) * 1000) / 10,
    over15: Math.round(over15Prob * 1000) / 10,
    btts: Math.round(bttsProb * 1000) / 10,
    expectedGoals: Math.round((lambda + mu) * 10) / 10,
    expectedHome: Math.round(lambda * 10) / 10,
    expectedAway: Math.round(mu * 10) / 10,
    mostLikelyScore: `${topScore.home}-${topScore.away}`,
    mostLikelyOverScore: `${topOverScore.home}-${topOverScore.away}`,
    mostLikelyUnderScore: `${topUnderScore.home}-${topUnderScore.away}`,
    confidence,
    source: 'dixon-coles',
    recommendation,
    recConfidence: Math.round(recConfidence * 10) / 10,
  };
}

/**
 * Parse la forme ("WWLWD") en métriques de buts estimés.
 * W = ~2 buts marqués, 0.7 encaissés
 * D = ~1 but marqué, 1 encaissé
 * L = ~0.6 buts marqués, 1.5 encaissés
 */
function parseFormString(form: string): { goalsScoredAvg: number; goalsConcededAvg: number } {
  if (!form || form.length === 0) {
    return { goalsScoredAvg: 1.3, goalsConcededAvg: 1.1 };
  }
  
  let totalScored = 0;
  let totalConceded = 0;
  let count = 0;
  
  for (const result of form.toUpperCase()) {
    if (result === 'W') {
      totalScored += 2.1;
      totalConceded += 0.7;
    } else if (result === 'D') {
      totalScored += 1.0;
      totalConceded += 1.0;
    } else if (result === 'L') {
      totalScored += 0.6;
      totalConceded += 1.5;
    }
    count++;
  }
  
  return count > 0
    ? { goalsScoredAvg: totalScored / count, goalsConcededAvg: totalConceded / count }
    : { goalsScoredAvg: 1.3, goalsConcededAvg: 1.1 };
}

/**
 * Fallback: Poisson sur cotes (même logique qu'avant mais enrichi)
 */
function predictGoalsFromOdds(
  oddsHome: number,
  oddsDraw: number | null | undefined,
  oddsAway: number
): GoalsPredictionResult {
  const probHome = 1 / oddsHome;
  const probAway = 1 / oddsAway;
  const probDraw = (oddsDraw && oddsDraw > 1) ? 1 / oddsDraw : 0.25;
  const totalImplied = probHome + probAway + probDraw;
  const normHome = probHome / totalImplied;
  const normAway = probAway / totalImplied;
  
  // Estimation des buts attendus à partir du ratio de cotes
  const oddsRatio = Math.max(oddsHome, oddsAway) / Math.min(oddsHome, oddsAway);
  let expectedGoals = 2.6;
  if (oddsRatio > 3) expectedGoals = 2.3;
  else if (oddsRatio < 1.5) expectedGoals = 2.9;
  if (oddsDraw && oddsDraw < 3.0) expectedGoals *= 0.9;
  
  // Répartition domicile/extérieur
  const homeBias = 1.15;
  const expectedHome = expectedGoals * (normHome + 0.5) / (normHome + normAway + 1) * homeBias;
  const expectedAway = expectedGoals - expectedHome + (expectedGoals * (homeBias - 1));
  
  // Poisson
  const lambda = Math.max(0.5, expectedHome);
  const mu = Math.max(0.3, expectedGoals - expectedHome + 0.1);
  
  let over25Prob = 0;
  let over15Prob = 0;
  let bttsProb = 0;
  const scoreProbs: { home: number; away: number; prob: number }[] = [];
  
  for (let h = 0; h <= 8; h++) {
    for (let a = 0; a <= 8; a++) {
      const prob = poissonProb(h, lambda) * poissonProb(a, mu);
      if (h + a > 2.5) over25Prob += prob;
      if (h + a > 1.5) over15Prob += prob;
      if (h > 0 && a > 0) bttsProb += prob;
      scoreProbs.push({ home: h, away: a, prob });
    }
  }
  
  scoreProbs.sort((a, b) => b.prob - a.prob);
  const topScore = scoreProbs[0];
  const topOverScore = scoreProbs.find(s => s.home + s.away >= 3) || topScore;
  const topUnderScore = scoreProbs.find(s => s.home + s.away <= 2) || topScore;
  
  const over25Pct = Math.round(over25Prob * 1000) / 10;
  
  let recommendation: 'over25' | 'under25' | 'skip' = 'skip';
  let recConfidence = 0;
  if (over25Pct >= 58) {
    recommendation = 'over25';
    recConfidence = over25Pct - 50;
  } else if (over25Pct <= 42) {
    recommendation = 'under25';
    recConfidence = 50 - over25Pct;
  }
  
  return {
    over25: over25Pct,
    under25: Math.round((1 - over25Prob) * 1000) / 10,
    over15: Math.round(over15Prob * 1000) / 10,
    btts: Math.round(bttsProb * 1000) / 10,
    expectedGoals: Math.round(expectedGoals * 10) / 10,
    expectedHome: Math.round(lambda * 10) / 10,
    expectedAway: Math.round(mu * 10) / 10,
    mostLikelyScore: `${topScore.home}-${topScore.away}`,
    mostLikelyOverScore: `${topOverScore.home}-${topOverScore.away}`,
    mostLikelyUnderScore: `${topUnderScore.home}-${topUnderScore.away}`,
    confidence: 'medium',
    source: 'poisson-odds',
    recommendation,
    recConfidence: Math.round(recConfidence * 10) / 10,
  };
}

/**
 * Export par défaut
 */
export default {
  predictMatch,
  predictGoalsEnriched,
  DIXON_COLES_PARAMS,
  LEAGUE_STRENGTH,
};
