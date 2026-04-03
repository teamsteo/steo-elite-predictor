/**
 * Détecteur de Value Bets et pièges
 * VERSION CLIENT-SIDE SAFE (sans Prisma)
 */

import { MatchData } from './riskCalculator';

export interface ValueBetResult {
  isValueBet: boolean;
  betType: 'home' | 'draw' | 'away';
  value: number;
  confidence: 'low' | 'medium' | 'high';
  explanation: string;
}

export interface TrapDetection {
  isTrap: boolean;
  trapType: 'overvalued_favorite' | 'tight_match' | 'injury_risk' | 'form_mismatch' | null;
  warning: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Détecte les value bets potentiels sur un match
 * Un value bet est une cote surévaluée par le bookmaker
 */
export function detectValueBets(match: MatchData): ValueBetResult[] {
  const results: ValueBetResult[] = [];
  
  // Analyser les trois types de paris
  const homeAnalysis = analyzeValueBet(match, 'home');
  const drawAnalysis = analyzeValueBet(match, 'draw');
  const awayAnalysis = analyzeValueBet(match, 'away');
  
  if (homeAnalysis.isValueBet) results.push(homeAnalysis);
  if (drawAnalysis.isValueBet) results.push(drawAnalysis);
  if (awayAnalysis.isValueBet) results.push(awayAnalysis);
  
  return results;
}

/**
 * Détecte les pièges potentiels dans un match
 */
export function detectTraps(match: MatchData): TrapDetection {
  const warnings: string[] = [];
  let trapType: TrapDetection['trapType'] = null;
  let severity: TrapDetection['severity'] = 'low';
  
  // 1. Détecter favori surévalué
  const favoriteOdds = Math.min(match.oddsHome, match.oddsAway);
  const underdogOdds = Math.max(match.oddsHome, match.oddsAway);
  const oddsDisparity = underdogOdds - favoriteOdds;
  
  if (favoriteOdds < 1.3 && oddsDisparity > 3) {
    warnings.push('Favori très lourd - Attention aux surprises');
    trapType = 'overvalued_favorite';
    severity = 'medium';
  }
  
  // 2. Détecter match serré
  if (oddsDisparity < 0.5) {
    warnings.push('Match très serré - Difficile à prédire');
    trapType = 'tight_match';
    severity = 'high';
  }
  
  // 3. Détecter risque de blessures (si données disponibles)
  if (match.homeInjuries && match.homeInjuries > 2) {
    warnings.push(`${match.homeTeam} a ${match.homeInjuries} blessés`);
    if (!trapType) trapType = 'injury_risk';
    severity = 'medium';
  }
  
  if (match.awayInjuries && match.awayInjuries > 2) {
    warnings.push(`${match.awayTeam} a ${match.awayInjuries} blessés`);
    if (!trapType) trapType = 'injury_risk';
    severity = 'medium';
  }
  
  // 4. Détecter incohérence de forme
  if (match.homeForm && match.awayForm) {
    const homeFormPoints = calculateFormPoints(match.homeForm);
    const awayFormPoints = calculateFormPoints(match.awayForm);
    
    // Si le favori a une mauvaise forme
    if (favoriteOdds < 1.5 && match.oddsHome < match.oddsAway && homeFormPoints < 6) {
      warnings.push(`${match.homeTeam} favori mais forme récente faible`);
      trapType = 'form_mismatch';
      severity = 'high';
    }
    if (favoriteOdds < 1.5 && match.oddsAway < match.oddsHome && awayFormPoints < 6) {
      warnings.push(`${match.awayTeam} favori mais forme récente faible`);
      trapType = 'form_mismatch';
      severity = 'high';
    }
  }
  
  return {
    isTrap: warnings.length > 0,
    trapType,
    warning: warnings.join(' | '),
    severity
  };
}

/**
 * Calcule les points de forme depuis une chaîne (ex: "W-W-D-L-W")
 */
function calculateFormPoints(form: string): number {
  const results = form.split('-');
  let points = 0;
  for (const result of results) {
    if (result === 'W') points += 3;
    else if (result === 'D') points += 1;
  }
  return points;
}

/**
 * Analyse un type de pari spécifique pour détecter un value bet
 */
function analyzeValueBet(match: MatchData, betType: 'home' | 'draw' | 'away'): ValueBetResult {
  const odds = getOdds(match, betType);
  const impliedProbability = 1 / odds;
  const trueProbability = estimateTrueProbability(match, betType);
  
  const value = trueProbability - impliedProbability;
  const isValueBet = value > 0.03; // Seuil de 3% pour considérer un value bet
  
  return {
    isValueBet,
    betType,
    value: Math.round(value * 100) / 100,
    confidence: getConfidence(Math.abs(value)),
    explanation: generateExplanation(match, betType, odds, value, isValueBet)
  };
}

/**
 * Obtient la cote pour un type de pari
 */
function getOdds(match: MatchData, betType: 'home' | 'draw' | 'away'): number {
  switch (betType) {
    case 'home':
      return match.oddsHome;
    case 'draw':
      return match.oddsDraw || 3.5;
    case 'away':
      return match.oddsAway;
    default:
      return match.oddsHome;
  }
}

/**
 * Estime la vraie probabilité d'un résultat
 */
function estimateTrueProbability(match: MatchData, betType: 'home' | 'draw' | 'away'): number {
  const homeOdds = match.oddsHome;
  const awayOdds = match.oddsAway;
  const drawOdds = match.oddsDraw || 3.5;
  
  // Probabilités implicites brutes
  const rawHomeProb = 1 / homeOdds;
  const rawDrawProb = 1 / drawOdds;
  const rawAwayProb = 1 / awayOdds;
  
  // Normaliser pour enlever la marge du bookmaker
  const total = rawHomeProb + rawDrawProb + rawAwayProb;
  
  const homeProb = rawHomeProb / total;
  const drawProb = rawDrawProb / total;
  const awayProb = rawAwayProb / total;
  
  // Ajustements basés sur des facteurs additionnels
  let adjustment = 0;
  
  // Facteur: Disparité des cotes
  const disparity = Math.abs(homeOdds - awayOdds);
  if (betType === 'home' && homeOdds < awayOdds && disparity > 2) {
    adjustment = 0.02;
  } else if (betType === 'away' && awayOdds < homeOdds && disparity > 2) {
    adjustment = -0.01;
  }
  
  // Facteur: Avantage domicile
  if (betType === 'home') {
    adjustment += 0.02;
  }
  
  switch (betType) {
    case 'home':
      return Math.min(0.95, Math.max(0.05, homeProb + adjustment));
    case 'draw':
      return Math.min(0.95, Math.max(0.05, drawProb));
    case 'away':
      return Math.min(0.95, Math.max(0.05, awayProb + adjustment));
    default:
      return 0.33;
  }
}

/**
 * Détermine le niveau de confiance
 */
function getConfidence(valueGap: number): 'low' | 'medium' | 'high' {
  if (valueGap > 0.1) return 'high';
  if (valueGap > 0.05) return 'medium';
  return 'low';
}

/**
 * Génère une explication pour le value bet
 */
function generateExplanation(
  match: MatchData,
  betType: 'home' | 'draw' | 'away',
  odds: number,
  value: number,
  isValueBet: boolean
): string {
  const team = betType === 'home' ? match.homeTeam : betType === 'away' ? match.awayTeam : 'Nul';
  const probability = Math.round((1 / odds) * 100);
  
  if (isValueBet) {
    const edge = Math.round(value * 100);
    return `${team}: Cote ${odds.toFixed(2)} sous-évaluée. Edge estimé: +${edge}%`;
  } else {
    return `${team}: Cote ${odds.toFixed(2)} juste ou surévaluée (${probability}% implicite)`;
  }
}

/**
 * Génère une recommandation de mise basée sur la confiance
 */
export function getStakeRecommendation(
  confidence: 'low' | 'medium' | 'high',
  bankroll: number
): { percentage: number; amount: number; reason: string } {
  switch (confidence) {
    case 'high':
      return {
        percentage: 5,
        amount: Math.round(bankroll * 0.05),
        reason: 'Value bet à haute confiance - Mise recommandée: 5% du bankroll'
      };
    case 'medium':
      return {
        percentage: 3,
        amount: Math.round(bankroll * 0.03),
        reason: 'Value bet modéré - Mise recommandée: 3% du bankroll'
      };
    case 'low':
      return {
        percentage: 1,
        amount: Math.round(bankroll * 0.01),
        reason: 'Value bet faible - Mise recommandée: 1% du bankroll'
      };
  }
}

// Alias pour compatibilité
export const identifyTraps = detectTraps;
