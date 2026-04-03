/**
 * Kelly Criterion Service - Gestion Optimal du Bankroll
 * 
 * Le critère de Kelly détermine la mise optimale pour maximiser
 * la croissance du capital à long terme tout en minimisant le risque.
 * 
 * Formule: f* = (bp - q) / b
 * - f* = fraction du bankroll à miser
 * - b = cote décimale - 1
 * - p = probabilité estimée de gagner
 * - q = 1 - p (probabilité de perdre)
 * 
 * AJUSTEMENTS:
 * - Fractional Kelly (1/2, 1/4) pour réduire la volatilité
 * - Plafonds max pour protection
 * - Ajustement selon confiance du modèle
 */

// ============================================
// TYPES
// ============================================

export interface KellyInput {
  odds: number; // Cote décimale (ex: 2.10)
  probability: number; // Probabilité estimée (0-100)
  confidence?: 'very_high' | 'high' | 'medium' | 'low'; // Confiance du modèle
  bankroll: number; // Bankroll actuel
}

export interface KellyResult {
  fraction: number; // Fraction du bankroll à miser (0-1)
  amount: number; // Montant en €
  edge: number; // Avantage (en %)
  expectedValue: number; // Valeur attendue
  riskLevel: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  recommendation: 'strong_bet' | 'bet' | 'small_bet' | 'skip' | 'avoid';
  explanation: string;
  kellyType: 'full' | 'half' | 'quarter';
}

export interface BankrollStats {
  currentBankroll: number;
  startingBankroll: number;
  totalBets: number;
  winRate: number;
  roi: number; // Return on Investment
  profitLoss: number;
  averageStake: number;
  biggestWin: number;
  biggestLoss: number;
  currentStreak: number;
  maxStreak: number;
}

// ============================================
// CONSTANTES
// ============================================

// Limites de protection
const MAX_KELLY_FRACTION = 0.10; // Max 10% du bankroll par bet
const MIN_BANKROLL = 10; // Minimum pour calculer
const DEFAULT_BANKROLL = 1000; // Bankroll par défaut

// Ajustements selon confiance
const CONFIDENCE_MULTIPLIERS: Record<string, number> = {
  'very_high': 1.0, // Kelly complet
  'high': 0.75, // 3/4 Kelly
  'medium': 0.5, // 1/2 Kelly
  'low': 0.25, // 1/4 Kelly
};

// Seuils de recommandation
const RECOMMENDATION_THRESHOLDS = {
  strong_bet: { minEdge: 10, minFraction: 0.03 },
  bet: { minEdge: 5, minFraction: 0.01 },
  small_bet: { minEdge: 2, minFraction: 0.005 },
  skip: { minEdge: 0 },
  avoid: { minEdge: -100 },
};

// ============================================
// FONCTIONS PRINCIPALES
// ============================================

/**
 * Calcule la mise optimale selon le critère de Kelly
 */
export function calculateKellyBet(input: KellyInput): KellyResult {
  const {
    odds,
    probability,
    confidence = 'medium',
    bankroll = DEFAULT_BANKROLL
  } = input;

  // Validation
  if (odds <= 1 || probability < 0 || probability > 100 || bankroll < MIN_BANKROLL) {
    return createInvalidResult(bankroll);
  }

  // Conversion probabilité
  const p = probability / 100;
  const q = 1 - p;
  
  // Cote en format b = decimal - 1
  const b = odds - 1;
  
  // Kelly formule: f* = (bp - q) / b
  let kellyFraction = (b * p - q) / b;
  
  // Edge (avantage)
  const edge = kellyFraction * 100;
  
  // Expected Value
  const expectedValue = (p * b - q) * 100;
  
  // Si Kelly négatif, pas de value
  if (kellyFraction <= 0) {
    return {
      fraction: 0,
      amount: 0,
      edge: edge,
      expectedValue: expectedValue,
      riskLevel: 'very_low',
      recommendation: 'avoid',
      explanation: `Pas de value bet. Cote implicite: ${(1/odds*100).toFixed(1)}%, notre proba: ${probability.toFixed(1)}%`,
      kellyType: 'full',
    };
  }
  
  // Appliquer l'ajustement selon confiance
  const confidenceMultiplier = CONFIDENCE_MULTIPLIERS[confidence] || 0.5;
  let adjustedFraction = kellyFraction * confidenceMultiplier;
  
  // Déterminer le type de Kelly
  let kellyType: 'full' | 'half' | 'quarter' = 'full';
  if (confidenceMultiplier <= 0.25) kellyType = 'quarter';
  else if (confidenceMultiplier <= 0.5) kellyType = 'half';
  
  // Plafonner à MAX_KELLY_FRACTION
  adjustedFraction = Math.min(adjustedFraction, MAX_KELLY_FRACTION);
  
  // Calculer le montant
  const amount = Math.round(adjustedFraction * bankroll * 100) / 100;
  
  // Déterminer le niveau de risque
  const riskLevel = determineRiskLevel(adjustedFraction, edge);
  
  // Déterminer la recommandation
  const recommendation = determineRecommendation(edge, adjustedFraction);
  
  // Explication
  const explanation = generateExplanation(edge, odds, probability, adjustedFraction, confidence);
  
  return {
    fraction: adjustedFraction,
    amount,
    edge: Math.round(edge * 10) / 10,
    expectedValue: Math.round(expectedValue * 10) / 10,
    riskLevel,
    recommendation,
    explanation,
    kellyType,
  };
}

/**
 * Calcule l'edge pour une cote donnée
 */
export function calculateEdge(odds: number, probability: number): number {
  const impliedProbability = (1 / odds) * 100;
  return probability - impliedProbability;
}

/**
 * Vérifie si un bet est une value bet
 */
export function isValueBet(odds: number, probability: number, minEdge: number = 2): boolean {
  const edge = calculateEdge(odds, probability);
  return edge >= minEdge;
}

/**
 * Calcule la mise optimale pour plusieurs bets (diversification)
 */
export function calculateOptimalPortfolio(
  bets: Array<{ odds: number; probability: number; confidence?: 'very_high' | 'high' | 'medium' | 'low' }>,
  bankroll: number
): Array<{ amount: number; fraction: number; kellyResult: KellyResult }> {
  const totalKellyFraction = bets.reduce((sum, bet) => {
    const result = calculateKellyBet({ ...bet, bankroll });
    return sum + result.fraction;
  }, 0);
  
  // Si le total dépasse 25% du bankroll, réduire proportionnellement
  const maxTotalFraction = 0.25;
  const scaleFactor = totalKellyFraction > maxTotalFraction 
    ? maxTotalFraction / totalKellyFraction 
    : 1;
  
  return bets.map(bet => {
    const result = calculateKellyBet({ ...bet, bankroll });
    const scaledFraction = result.fraction * scaleFactor;
    return {
      fraction: scaledFraction,
      amount: Math.round(scaledFraction * bankroll * 100) / 100,
      kellyResult: result,
    };
  });
}

/**
 * Simule l'évolution du bankroll
 */
export function simulateBankrollEvolution(
  startingBankroll: number,
  bets: Array<{ odds: number; probability: number; won: boolean }>,
  kellyFraction: number = 0.05
): { finalBankroll: number; history: number[]; maxDrawdown: number } {
  let bankroll = startingBankroll;
  const history = [bankroll];
  let maxBankroll = bankroll;
  let maxDrawdown = 0;
  
  for (const bet of bets) {
    const stake = bankroll * kellyFraction;
    
    if (bet.won) {
      const profit = stake * (bet.odds - 1);
      bankroll += profit;
    } else {
      bankroll -= stake;
    }
    
    history.push(bankroll);
    
    // Calculer drawdown
    if (bankroll > maxBankroll) maxBankroll = bankroll;
    const drawdown = (maxBankroll - bankroll) / maxBankroll;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  return {
    finalBankroll: bankroll,
    history,
    maxDrawdown: Math.round(maxDrawdown * 100),
  };
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

function createInvalidResult(bankroll: number): KellyResult {
  return {
    fraction: 0,
    amount: 0,
    edge: 0,
    expectedValue: 0,
    riskLevel: 'very_low',
    recommendation: 'skip',
    explanation: 'Paramètres invalides',
    kellyType: 'full',
  };
}

function determineRiskLevel(fraction: number, edge: number): KellyResult['riskLevel'] {
  if (fraction < 0.01 || edge < 2) return 'very_low';
  if (fraction < 0.03 || edge < 5) return 'low';
  if (fraction < 0.05 || edge < 8) return 'medium';
  if (fraction < 0.08 || edge < 12) return 'high';
  return 'very_high';
}

function determineRecommendation(edge: number, fraction: number): KellyResult['recommendation'] {
  if (edge >= 10 && fraction >= 0.03) return 'strong_bet';
  if (edge >= 5 && fraction >= 0.01) return 'bet';
  if (edge >= 2 && fraction >= 0.005) return 'small_bet';
  if (edge >= 0) return 'skip';
  return 'avoid';
}

function generateExplanation(
  edge: number,
  odds: number,
  probability: number,
  fraction: number,
  confidence: string
): string {
  const impliedProb = (1 / odds * 100).toFixed(1);
  const confidenceLabel = confidence === 'very_high' ? 'très haute' 
    : confidence === 'high' ? 'haute' 
    : confidence === 'medium' ? 'moyenne' 
    : 'faible';
  
  if (edge < 0) {
    return `❌ Pas de value. Cote implicite ${impliedProb}% > notre proba ${probability.toFixed(1)}%`;
  }
  
  if (edge < 2) {
    return `⚠️ Edge faible (${edge.toFixed(1)}%). Pas rentable après vig.`;
  }
  
  return `✅ Edge ${edge.toFixed(1)}% | Cote ${odds} vs proba ${probability.toFixed(1)}% | Confiance ${confidenceLabel} | Mise ${(fraction * 100).toFixed(1)}%`;
}

// ============================================
// EXPORT
// ============================================

const KellyCriterionService = {
  calculateKellyBet,
  calculateEdge,
  isValueBet,
  calculateOptimalPortfolio,
  simulateBankrollEvolution,
};

export default KellyCriterionService;
