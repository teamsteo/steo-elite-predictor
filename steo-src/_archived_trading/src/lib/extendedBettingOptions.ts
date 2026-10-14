/**
 * Options de Paris Étendues - Football & Basketball
 * 
 * Ce module génère des prédictions pour de nombreux types de paris
 * basées sur les cotes disponibles et les modèles statistiques.
 * 
 * FOOTBALL:
 * - Double Chance (1X, X2, 12)
 * - Draw No Bet (DNB)
 * - Over/Under Buts (0.5, 1.5, 2.5, 3.5, 4.5)
 * - Both Teams To Score (BTTS)
 * - Half Time / Full Time (HT/FT)
 * - Première période buts
 * - Score exact (probabilités)
 * 
 * BASKETBALL:
 * - Spread (handicap)
 * - Total Points (Over/Under)
 * - Moneyline (vainqueur)
 * - Race to X points
 * - Première équipe à 20, 50, 100 points
 * - Marge de victoire
 * - Quart-temps gagnants
 */

// ============================================
// TYPES
// ============================================

export interface FootballBettingOptions {
  // Resultat principal
  result: {
    home: number;  // % chance victoire domicile
    draw: number;  // % chance nul
    away: number;  // % chance victoire extérieur
    recommendation: 'home' | 'draw' | 'away' | 'avoid';
    confidence: 'high' | 'medium' | 'low';
  };
  
  // Double Chance
  doubleChance: {
    homeOrDraw: number;  // 1X
    awayOrDraw: number;  // X2  
    homeOrAway: number;  // 12
    recommendation: '1X' | 'X2' | '12' | 'none';
    bestValue: number;
  };
  
  // Draw No Bet (remboursement si nul)
  drawNoBet: {
    home: number;  // % DNB domicile
    away: number;  // % DNB extérieur
    recommendation: 'home' | 'away' | 'none';
    impliedOdds: { home: number; away: number };
  };
  
  // Over/Under Buts
  goals: {
    over05: number;
    under05: number;
    over15: number;
    under15: number;
    over25: number;
    under25: number;
    over35: number;
    under35: number;
    over45: number;
    under45: number;
    expectedTotal: number;
    recommendation: string;
  };
  
  // Both Teams To Score
  btts: {
    yes: number;
    no: number;
    recommendation: 'yes' | 'no';
  };
  
  // Half Time
  halfTime: {
    home: number;
    draw: number;
    away: number;
    recommendation: 'home' | 'draw' | 'away';
  };
  
  // Half Time / Full Time
  htft: {
    'home-home': number;
    'home-draw': number;
    'home-away': number;
    'draw-home': number;
    'draw-draw': number;
    'draw-away': number;
    'away-home': number;
    'away-draw': number;
    'away-away': number;
    mostLikely: string;
  };
  
  // Score Exact (top 5)
  correctScore: Array<{
    score: string;
    probability: number;
  }>;
  
  // Première période
  firstHalf: {
    expectedGoals: number;
    over05: number;
    over15: number;
    bothTeamsScore: number;
  };
  
  // Indice de valeur globale
  valueIndex: number;
}

export interface BasketballBettingOptions {
  // Moneyline (Vainqueur)
  moneyline: {
    home: number;
    away: number;
    recommendation: 'home' | 'away';
    confidence: 'high' | 'medium' | 'low';
  };
  
  // Spread (Handicap)
  spread: {
    line: number;  // ex: -5.5 signifie favori doit gagner par 6+
    favorite: 'home' | 'away';
    homeCoverProb: number;
    awayCoverProb: number;
    recommendation: 'home' | 'away';
  };
  
  // Total Points
  totalPoints: {
    line: number;
    expected: number;
    overProb: number;
    underProb: number;
    recommendation: 'over' | 'under';
  };
  
  // Quart-temps
  quarters: {
    q1: { home: number; away: number };
    q2: { home: number; away: number };
    q3: { home: number; away: number };
    q4: { home: number; away: number };
    mostLikelyWinner: { quarter: string; team: 'home' | 'away' };
  };
  
  // Race to X points
  raceTo: {
    '20': { home: number; away: number };
    '50': { home: number; away: number };
    '100': { home: number; away: number };
  };
  
  // Marge de victoire
  margin: {
    '1-5': number;
    '6-10': number;
    '11-15': number;
    '16-20': number;
    '21+': number;
    mostLikely: string;
  };
  
  // Première équipe à marquer
  firstToScore: {
    home: number;
    away: number;
  };
  
  // Indice de valeur
  valueIndex: number;
}

// ============================================
// FONCTIONS DE CALCUL - FOOTBALL
// ============================================

/**
 * Calcule toutes les options de paris football
 */
export function calculateFootballBettingOptions(
  oddsHome: number,
  oddsDraw: number | null,
  oddsAway: number,
  homeTeam?: string,
  awayTeam?: string
): FootballBettingOptions {
  
  // Probabilités implicites
  const totalImplied = (1 / oddsHome) + (1 / oddsAway) + (oddsDraw ? 1 / oddsDraw : 0);
  const homeProb = (1 / oddsHome) / totalImplied;
  const awayProb = (1 / oddsAway) / totalImplied;
  const drawProb = oddsDraw ? (1 / oddsDraw) / totalImplied : 0.28;
  
  // ===== 1. RÉSULTAT PRINCIPAL =====
  const result = {
    home: Math.round(homeProb * 100),
    draw: Math.round(drawProb * 100),
    away: Math.round(awayProb * 100),
    recommendation: homeProb > awayProb + 0.15 ? 'home' as const :
                   awayProb > homeProb + 0.15 ? 'away' as const :
                   drawProb > 0.32 ? 'draw' as const : 'avoid' as const,
    confidence: Math.abs(homeProb - awayProb) > 0.25 ? 'high' as const :
                Math.abs(homeProb - awayProb) > 0.10 ? 'medium' as const : 'low' as const
  };
  
  // ===== 2. DOUBLE CHANCE =====
  const doubleChance = {
    homeOrDraw: Math.round((homeProb + drawProb) * 100),  // 1X
    awayOrDraw: Math.round((awayProb + drawProb) * 100),  // X2
    homeOrAway: Math.round((homeProb + awayProb) * 100),  // 12
    recommendation: (homeProb + drawProb) > 0.65 ? '1X' as const :
                   (awayProb + drawProb) > 0.65 ? 'X2' as const :
                   (homeProb + awayProb) > 0.75 ? '12' as const : 'none' as const,
    bestValue: Math.max(homeProb + drawProb, awayProb + drawProb, homeProb + awayProb) * 100
  };
  
  // ===== 3. DRAW NO BET =====
  // Si nul, mise remboursée - donc probabilité ajustée
  const dnbHome = homeProb / (homeProb + awayProb);
  const dnbAway = awayProb / (homeProb + awayProb);
  const drawNoBet = {
    home: Math.round(dnbHome * 100),
    away: Math.round(dnbAway * 100),
    recommendation: dnbHome > 0.55 ? 'home' as const : dnbAway > 0.55 ? 'away' as const : 'none' as const,
    impliedOdds: {
      home: Math.round((1 / dnbHome) * 100) / 100,
      away: Math.round((1 / dnbAway) * 100) / 100
    }
  };
  
  // ===== 4. OVER/UNDER BUTS =====
  // Estimation du nombre de buts basée sur les cotes
  const oddsRatio = Math.max(oddsHome, oddsAway) / Math.min(oddsHome, oddsAway);
  let expectedGoals = 2.6;
  if (oddsRatio > 3) expectedGoals = 2.2;
  else if (oddsRatio > 2) expectedGoals = 2.4;
  else if (oddsRatio < 1.5) expectedGoals = 2.9;
  
  // Ajustement selon probabilité de nul
  if (drawProb > 0.32) expectedGoals *= 0.85;
  if (oddsDraw && oddsDraw < 3.0) expectedGoals *= 0.9;
  
  // Distribution de Poisson
  const lambda = expectedGoals;
  
  const over05 = Math.round((1 - Math.exp(-lambda)) * 100);
  const over15 = Math.round((1 - Math.exp(-lambda) * (1 + lambda)) * 100);
  const over25 = Math.round((1 - Math.exp(-lambda) * (1 + lambda + (lambda * lambda) / 2)) * 100);
  const over35 = Math.round((1 - Math.exp(-lambda) * (1 + lambda + (lambda * lambda) / 2 + (lambda * lambda * lambda) / 6)) * 100);
  const over45 = Math.round((1 - Math.exp(-lambda) * (1 + lambda + (lambda * lambda) / 2 + (lambda * lambda * lambda) / 6 + (lambda * lambda * lambda * lambda) / 24)) * 100);
  
  // Calculer les under AVANT de les utiliser
  const under05 = 100 - over05;
  const under15 = 100 - over15;
  const under25 = 100 - over25;
  const under35 = 100 - over35;
  const under45 = 100 - over45;
  
  const goals = {
    over05,
    under05,
    over15,
    under15,
    over25,
    under25,
    over35,
    under35,
    over45,
    under45,
    expectedTotal: Math.round(expectedGoals * 10) / 10,
    recommendation: over25 >= 60 ? 'Over 2.5' :
                   under25 >= 60 ? 'Under 2.5' :
                   over35 >= 55 ? 'Over 3.5' :
                   under15 >= 60 ? 'Under 1.5' : 'Match serré'
  };
  
  // ===== 5. BTTS =====
  // Probabilité que les deux marquent
  const bttsProb = Math.round(
    Math.min(homeProb * 80 + drawProb * 20, 70) +
    (1 - Math.abs(homeProb - awayProb)) * 15
  );
  const btts = {
    yes: Math.min(bttsProb, 80),
    no: 100 - Math.min(bttsProb, 80),
    recommendation: bttsProb >= 55 ? 'yes' as const : 'no' as const
  };
  
  // ===== 6. HALF TIME =====
  // En MT, plus de chance de nul
  const htDraw = Math.min(drawProb * 1.5, 0.50);
  const htHome = homeProb * (1 - htDraw - awayProb * 0.3);
  const htAway = awayProb * (1 - htDraw - homeProb * 0.3);
  const htTotal = htHome + htDraw + htAway;
  
  const halfTime = {
    home: Math.round((htHome / htTotal) * 100),
    draw: Math.round((htDraw / htTotal) * 100),
    away: Math.round((htAway / htTotal) * 100),
    recommendation: htHome > htAway + 0.1 ? 'home' as const :
                   htAway > htHome + 0.1 ? 'away' as const : 'draw' as const
  };
  
  // ===== 7. HT/FT =====
  const htft = {
    'home-home': Math.round(homeProb * 0.45 * 100),
    'home-draw': Math.round(homeProb * 0.15 * 100),
    'home-away': Math.round(homeProb * 0.05 * 100),
    'draw-home': Math.round(drawProb * 0.25 * 100),
    'draw-draw': Math.round(drawProb * 0.50 * 100),
    'draw-away': Math.round(drawProb * 0.25 * 100),
    'away-home': Math.round(awayProb * 0.05 * 100),
    'away-draw': Math.round(awayProb * 0.15 * 100),
    'away-away': Math.round(awayProb * 0.45 * 100),
    mostLikely: homeProb > awayProb ? 
                (drawProb > 0.28 ? 'draw-home' : 'home-home') :
                (drawProb > 0.28 ? 'draw-away' : 'away-away')
  };
  
  // ===== 8. SCORE EXACT =====
  const homeExpected = expectedGoals * homeProb / (homeProb + awayProb);
  const awayExpected = expectedGoals * awayProb / (homeProb + awayProb);
  
  const correctScore = [
    { score: `${Math.round(homeExpected)}-${Math.round(awayExpected)}`, probability: 15 },
    { score: `${Math.round(homeExpected)}-${Math.round(awayExpected) - 1}`, probability: 12 },
    { score: `${Math.round(homeExpected) - 1}-${Math.round(awayExpected)}`, probability: 10 },
    { score: '1-1', probability: 12 },
    { score: '0-0', probability: Math.round((1 - over05) * 0.8) },
    { score: '1-0', probability: Math.round(homeProb * 12) },
    { score: '0-1', probability: Math.round(awayProb * 12) },
    { score: '2-1', probability: Math.round(homeProb * 8) },
    { score: '1-2', probability: Math.round(awayProb * 8) },
    { score: '2-0', probability: Math.round(homeProb * 6) },
  ].sort((a, b) => b.probability - a.probability).slice(0, 5);
  
  // ===== 9. PREMIÈRE PÉRIODE =====
  const firstHalf = {
    expectedGoals: Math.round(expectedGoals * 0.45 * 10) / 10,
    over05: Math.round(over05 * 0.85),
    over15: Math.round(over15 * 0.60),
    bothTeamsScore: Math.round(bttsProb * 0.70)
  };
  
  // ===== 10. INDICE DE VALEUR =====
  const valueIndex = Math.round(
    (Math.abs(homeProb - awayProb) * 50) +
    (over25 > 60 || under25 > 60 ? 20 : 0) +
    (bttsProb > 60 || bttsProb < 40 ? 15 : 0) +
    (Math.max(doubleChance.homeOrDraw, doubleChance.awayOrDraw) > 70 ? 15 : 0)
  );
  
  return {
    result,
    doubleChance,
    drawNoBet,
    goals,
    btts,
    halfTime,
    htft,
    correctScore,
    firstHalf,
    valueIndex
  };
}

// ============================================
// FONCTIONS DE CALCUL - BASKETBALL
// ============================================

/**
 * Calcule toutes les options de paris basketball
 */
export function calculateBasketballBettingOptions(
  oddsHome: number,
  oddsAway: number,
  homeTeam?: string,
  awayTeam?: string
): BasketballBettingOptions {
  
  // Probabilités implicites
  const totalImplied = (1 / oddsHome) + (1 / oddsAway);
  const homeProb = (1 / oddsHome) / totalImplied;
  const awayProb = (1 / oddsAway) / totalImplied;
  
  // ===== 1. MONEYLINE =====
  const moneyline = {
    home: Math.round(homeProb * 100),
    away: Math.round(awayProb * 100),
    recommendation: homeProb > 0.5 ? 'home' as const : 'away' as const,
    confidence: Math.abs(homeProb - awayProb) > 0.20 ? 'high' as const :
                Math.abs(homeProb - awayProb) > 0.10 ? 'medium' as const : 'low' as const
  };
  
  // ===== 2. SPREAD =====
  // Estimation de l'écart basée sur les probabilités
  const spreadLine = Math.round(Math.abs(homeProb - awayProb) * 15 * 10) / 10;
  const favorite = homeProb > awayProb ? 'home' as const : 'away' as const;
  
  // Probabilité de couvrir le spread
  const coverProb = Math.max(homeProb, awayProb) * 0.85;
  
  const spread = {
    line: favorite === 'home' ? -spreadLine : spreadLine,
    favorite,
    homeCoverProb: favorite === 'home' ? Math.round(coverProb * 100) : Math.round((1 - coverProb) * 100),
    awayCoverProb: favorite === 'away' ? Math.round(coverProb * 100) : Math.round((1 - coverProb) * 100),
    recommendation: coverProb > 0.52 ? favorite : (favorite === 'home' ? 'away' as const : 'home' as const)
  };
  
  // ===== 3. TOTAL POINTS =====
  // Estimation du total (moyenne NBA ~220)
  const expectedTotal = 220 + (Math.abs(homeProb - awayProb) > 0.15 ? -5 : 5);
  const line = Math.round(expectedTotal / 5) * 5;
  
  // Probabilité calculée (pas de random)
  const overProb = Math.round(45 + (expectedTotal - line) * 2);
  const underProb = 100 - overProb;
  
  const totalPoints = {
    line,
    expected: expectedTotal,
    overProb,
    underProb,
    recommendation: expectedTotal > line ? 'over' as const : 'under' as const
  };
  
  // ===== 4. QUARTERS - REMOVED RANDOM VALUES =====
  // Quarter predictions removed - no real data source
  // Using main game probabilities as baseline
  const quarters = {
    q1: { 
      home: Math.round(homeProb * 100),
      away: Math.round(awayProb * 100)
    },
    q2: { 
      home: Math.round(homeProb * 100),
      away: Math.round(awayProb * 100)
    },
    q3: { 
      home: Math.round(homeProb * 100),
      away: Math.round(awayProb * 100)
    },
    q4: { 
      home: Math.round(homeProb * 100),
      away: Math.round(awayProb * 100)
    },
    mostLikelyWinner: {
      quarter: 'Q1',
      team: homeProb > awayProb ? 'home' as const : 'away' as const
    }
  };
  
  // ===== 5. RACE TO X POINTS =====
  const raceTo = {
    '20': { 
      home: Math.round(homeProb * 100),
      away: Math.round(awayProb * 100)
    },
    '50': { 
      home: Math.round(homeProb * 95 + 3),
      away: Math.round(awayProb * 95 + 3)
    },
    '100': { 
      home: Math.round(homeProb * 90 + 5),
      away: Math.round(awayProb * 90 + 5)
    }
  };
  
  // ===== 6. MARGIN =====
  const expectedMargin = Math.abs(homeProb - awayProb) * 20;
  const margin = {
    '1-5': Math.round(expectedMargin < 5 ? 35 : 20),
    '6-10': Math.round(expectedMargin >= 5 && expectedMargin < 10 ? 30 : 25),
    '11-15': Math.round(expectedMargin >= 10 && expectedMargin < 15 ? 25 : 20),
    '16-20': Math.round(expectedMargin >= 15 && expectedMargin < 20 ? 20 : 15),
    '21+': Math.round(expectedMargin >= 20 ? 25 : 10),
    mostLikely: expectedMargin < 5 ? '1-5 pts' :
                expectedMargin < 10 ? '6-10 pts' :
                expectedMargin < 15 ? '11-15 pts' :
                expectedMargin < 20 ? '16-20 pts' : '21+ pts'
  };
  
  // ===== 7. FIRST TO SCORE =====
  const firstToScore = {
    home: Math.round(homeProb * 100),
    away: Math.round(awayProb * 100)
  };
  
  // ===== 8. VALUE INDEX =====
  const valueIndex = Math.round(
    (Math.abs(homeProb - awayProb) * 60) +
    (coverProb > 0.55 ? 20 : 0) +
    (Math.abs(totalPoints.overProb - totalPoints.underProb) > 10 ? 15 : 0)
  );
  
  return {
    moneyline,
    spread,
    totalPoints,
    quarters,
    raceTo,
    margin,
    firstToScore,
    valueIndex
  };
}

// ============================================
// EXPORTS
// ============================================

export default {
  calculateFootballBettingOptions,
  calculateBasketballBettingOptions
};
