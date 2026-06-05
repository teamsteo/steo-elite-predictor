/**
 * Calculateur de risque pour les pronostics
 * VERSION CLIENT-SIDE SAFE (sans Prisma)
 */

export interface MatchData {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league?: string;
  date: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  homeInjuries?: number;
  awayInjuries?: number;
  homeForm?: string;
  awayForm?: string;
}

export interface RiskFactor {
  name: string;
  weight: number;
  value: number;
  description: string;
}

export interface RiskAssessment {
  overallRisk: number;
  riskLevel: 'low' | 'medium' | 'high';
  factors: RiskFactor[];
  recommendation: string;
  confidence: number;
}

/**
 * Calcule le pourcentage de risque global d'un pronostic
 */
export function calculateRisk(match: MatchData): RiskAssessment {
  const factors: RiskFactor[] = [];
  
  // 1. Risque basé sur la disparité des cotes
  const oddsRisk = calculateOddsRisk(match);
  factors.push({
    name: 'Disparité cotes',
    weight: 0.35,
    value: oddsRisk,
    description: getOddsRiskDescription(oddsRisk)
  });
  
  // 2. Risque basé sur la valeur du pari
  const valueRisk = calculateValueRisk(match);
  factors.push({
    name: 'Value bet',
    weight: 0.25,
    value: valueRisk,
    description: getValueRiskDescription(valueRisk)
  });
  
  // 3. Risque basé sur les blessures
  const injuryRisk = calculateInjuryRisk(match);
  factors.push({
    name: 'Blessures',
    weight: 0.25,
    value: injuryRisk,
    description: getInjuryRiskDescription(injuryRisk, match)
  });
  
  // 4. Risque basé sur la forme
  const formRisk = calculateFormRisk(match);
  factors.push({
    name: 'Forme récente',
    weight: 0.15,
    value: formRisk,
    description: getFormRiskDescription(formRisk)
  });
  
  // Calcul du risque global pondéré
  const overallRisk = Math.round(
    factors.reduce((sum, factor) => sum + factor.value * factor.weight, 0)
  );
  
  // Niveau de risque
  const riskLevel = getRiskLevel(overallRisk);
  
  // Confiance (inverse du risque)
  const confidence = Math.max(20, 100 - overallRisk);
  
  // Recommandation
  const recommendation = generateRecommendation(overallRisk, factors, match);
  
  return {
    overallRisk,
    riskLevel,
    factors,
    recommendation,
    confidence
  };
}

/**
 * Calcule le risque basé sur les cotes
 */
function calculateOddsRisk(match: MatchData): number {
  const favoriteOdds = Math.min(match.oddsHome, match.oddsAway);
  const underdogOdds = Math.max(match.oddsHome, match.oddsAway);
  const disparity = underdogOdds - favoriteOdds;
  
  // Favori très lourd = risque plus bas sur le favori, mais attention aux pièges
  if (favoriteOdds < 1.3) return disparity > 3 ? 35 : 45;
  if (favoriteOdds < 1.5) return 40;
  if (favoriteOdds < 2.0) return 50;
  if (favoriteOdds < 2.5) return 55;
  
  // Match serré
  if (disparity < 0.5) return 65;
  
  return 50;
}

/**
 * Calcule le risque basé sur la valeur du pari
 */
function calculateValueRisk(match: MatchData): number {
  // Marge du bookmaker
  const margin = (1 / match.oddsHome) + (1 / match.oddsAway) + (match.oddsDraw ? 1 / match.oddsDraw : 0) - 1;
  
  // Marge élevée = moins de valeur
  if (margin > 0.1) return 60;
  if (margin > 0.07) return 50;
  if (margin > 0.05) return 40;
  return 35;
}

/**
 * Calcule le risque basé sur les blessures
 */
function calculateInjuryRisk(match: MatchData): number {
  const totalInjuries = (match.homeInjuries || 0) + (match.awayInjuries || 0);
  
  if (totalInjuries === 0) return 30;
  if (totalInjuries <= 2) return 40;
  if (totalInjuries <= 4) return 55;
  return 70;
}

/**
 * Calcule le risque basé sur la forme
 */
function calculateFormRisk(match: MatchData): number {
  if (!match.homeForm && !match.awayForm) return 50;
  
  const homePoints = match.homeForm ? calculateFormPoints(match.homeForm) : 6;
  const awayPoints = match.awayForm ? calculateFormPoints(match.awayForm) : 6;
  
  const pointsDiff = Math.abs(homePoints - awayPoints);
  
  // Grande différence de forme = plus prévisible
  if (pointsDiff >= 6) return 35;
  if (pointsDiff >= 4) return 45;
  if (pointsDiff >= 2) return 50;
  return 55; // Formes similaires = moins prévisible
}

/**
 * Calcule les points de forme
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
 * Descriptions des risques
 */
function getOdsRiskDescription(risk: number): string {
  if (risk < 40) return 'Favori clair - Risque modéré';
  if (risk < 55) return 'Match équilibré';
  return 'Match serré - Difficile à prédire';
}

function getOddsRiskDescription(risk: number): string {
  if (risk < 40) return 'Favori clair - Risque modéré';
  if (risk < 55) return 'Match équilibré';
  return 'Match serré - Difficile à prédire';
}

function getValueRiskDescription(risk: number): string {
  if (risk < 40) return 'Bonne valeur détectée';
  if (risk < 55) return 'Valeur moyenne';
  return 'Valeur faible';
}

function getInjuryRiskDescription(risk: number, match: MatchData): string {
  const total = (match.homeInjuries || 0) + (match.awayInjuries || 0);
  if (total === 0) return 'Aucune blessure signalée';
  return `${total} joueur(s) blessé(s)`;
}

function getFormRiskDescription(risk: number): string {
  if (risk < 40) return 'Écart de forme significatif';
  if (risk < 55) return 'Formes comparables';
  return 'Forme inconnue ou équilibrée';
}

/**
 * Retourne le niveau de risque textuel
 */
export function getRiskLevel(percentage: number): 'low' | 'medium' | 'high' {
  if (percentage <= 40) return 'low';
  if (percentage <= 60) return 'medium';
  return 'high';
}

/**
 * Retourne la couleur associée au niveau de risque
 */
export function getRiskColor(percentage: number): string {
  if (percentage <= 40) return 'text-green-500';
  if (percentage <= 60) return 'text-yellow-500';
  return 'text-red-500';
}

/**
 * Retourne la classe CSS pour le badge de risque
 */
export function getRiskBadgeClass(percentage: number): string {
  if (percentage <= 40) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (percentage <= 60) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  return 'bg-red-500/20 text-red-400 border-red-500/30';
}

/**
 * Génère une recommandation basée sur l'analyse
 */
function generateRecommendation(risk: number, factors: RiskFactor[], match: MatchData): string {
  const favorite = match.oddsHome < match.oddsAway ? match.homeTeam : match.awayTeam;
  
  if (risk <= 35) {
    return `✅ ${favorite} - Pronostic fiable. Mise suggérée: 3-5% du bankroll`;
  } else if (risk <= 50) {
    return `⚡ ${favorite} - Pronostic modéré. Mise suggérée: 2-3% du bankroll`;
  } else if (risk <= 65) {
    return `⚠️ Match serré - Parier avec prudence. Mise max: 1-2%`;
  } else {
    return `🚫 Risque élevé - Éviter ou parier petit. Mise max: 1%`;
  }
}

/**
 * Génère le niveau de confiance textuel
 */
export function getConfidenceLevel(percentage: number): string {
  if (percentage >= 70) return 'Très haute confiance';
  if (percentage >= 55) return 'Haute confiance';
  if (percentage >= 45) return 'Confiance modérée';
  if (percentage >= 30) return 'Confiance faible';
  return 'Risque élevé';
}

/**
 * Calcule le pourcentage de risque pour un type de pari spécifique
 */
export function calculateRiskPercentage(
  match: MatchData,
  betType: 'home' | 'draw' | 'away'
): number {
  const assessment = calculateRisk(match);
  
  // Ajuster le risque selon le type de pari
  const odds = betType === 'home' ? match.oddsHome :
               betType === 'away' ? match.oddsAway :
               match.oddsDraw || 3.5;
  
  // Cote basse = moins de risque sur ce résultat
  const oddsRisk = Math.min(50, Math.max(10, (odds - 1) * 30));
  
  // Combiner avec le risque global
  const baseRisk = assessment.overallRisk;
  const adjustedRisk = (baseRisk + oddsRisk) / 2;
  
  return Math.round(Math.min(80, Math.max(15, adjustedRisk)));
}
