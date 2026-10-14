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

/**
 * Export par défaut
 */
export default {
  predictMatch,
  DIXON_COLES_PARAMS,
  LEAGUE_STRENGTH,
};
