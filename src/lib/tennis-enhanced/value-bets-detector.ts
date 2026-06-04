/**
 * Détecteur de Value Bets / Challenges Négligés
 * 
 * Principe: Identifier les matchs où les bookmakers sous-estiment un joueur
 * - Cote élevée (> 2.5) mais notre analyse donne une probabilité plus forte
 * - Ces "challenges" sont des opportunités de paris à valeur
 * 
 * Indicateurs de value bet:
 * - Écart entre proba analysée et proba implicite bookmaker
 * - Joueur en forme montante face à un favori en déclin
 * - Avantage surface non pris en compte par les cotes
 * - Match-up favorable (H2H)
 * - Pression classement sur le favori
 */

import { EnhancedPrediction } from './enhanced-predictor';

export interface ValueBet {
  id: string;
  match: {
    player1: string;
    player2: string;
    tournament: string;
    surface: string;
    round?: string;
  };
  
  // Le défi
  challenge: {
    underdog: string;           // Le joueur sous-estimé
    favorite: string;           // Le favori du bookmaker
    underdogOdds: number;       // Cote de l'underdog
    favoriteOdds: number;       // Cote du favori
    impliedProbability: number; // % implicite selon bookmaker
    ourProbability: number;     // % selon notre analyse
    valueGap: number;           // Écart (notre proba - proba bookmaker)
  };
  
  // Facteurs qui plaident pour l'underdog
  valueFactors: {
    formAdvantage: boolean;      // Avantage forme récente
    surfaceAdvantage: boolean;   // Avantage sur la surface
    h2hAdvantage: boolean;       // Historique favorable
    pressureAdvantage: boolean;  // Moins de pression classement
    homeAdvantage: boolean;      // Joue à domicile
    favoriteDecline: boolean;    // Favori en déclin
    fatigueAdvantage: boolean;   // Favori fatigué
  };
  
  // Score et recommandation
  valueScore: number;           // 0-100 (plus élevé = meilleur value)
  confidenceLevel: 'high' | 'medium' | 'low';
  riskLevel: 'calculated' | 'moderate' | 'high';
  
  // Explication
  reasoning: string[];
  keyInsight: string;
  
  // Métadonnées
  prediction: EnhancedPrediction;
  detectedAt: Date;
}

export interface ValueBetsResult {
  totalScanned: number;
  valueBetsFound: number;
  challenges: ValueBet[];
  summary: {
    highConfidenceCount: number;
    averageValueGap: number;
    bestValue: ValueBet | null;
  };
}

// Seuils de détection
const VALUE_BET_THRESHOLDS = {
  minOdds: 2.0,           // Cote minimum pour underdog
  minValueGap: 8,         // Écart minimum (%) entre nos proba et bookmaker
  highValueGap: 15,       // Écart élevé = haute confiance
  veryHighValueGap: 25,   // Écart très élevé = excellente opportunité
};

/**
 * Analyse une prédiction pour détecter un value bet potentiel
 */
export function detectValueBet(prediction: EnhancedPrediction): ValueBet | null {
  const { player1, player2, betting, factors, winProbability, predictedWinner } = prediction;
  
  // Identifier favori et underdog selon les cotes
  const p1Odds = prediction.betting.winnerOdds; // Cote du prédit gagnant
  const odds1 = factors.odds.description.includes(player1) ? 
    parseFloat(factors.odds.description.match(/[\d.]+/g)?.[0] || '1') : 1;
  const odds2 = parseFloat(factors.odds.description.match(/[\d.]+/g)?.[1] || '1');
  
  // Déterminer underdog (cote la plus élevée)
  const underdog = odds1 > odds2 ? player1 : player2;
  const favorite = odds1 > odds2 ? player2 : player1;
  const underdogOdds = Math.max(odds1, odds2);
  const favoriteOdds = Math.min(odds1, odds2);
  
  // Probabilité implicite du bookmaker pour l'underdog
  const impliedProbability = Math.round((1 / underdogOdds) * 100);
  
  // Notre probabilité pour l'underdog
  let ourProbability: number;
  if (underdog === predictedWinner) {
    ourProbability = winProbability;
  } else {
    ourProbability = 100 - winProbability;
  }
  
  // Calcul du value gap (positif = underdog sous-estimé)
  const valueGap = ourProbability - impliedProbability;
  
  // Vérifier si c'est un value bet potentiel
  if (underdogOdds < VALUE_BET_THRESHOLDS.minOdds) return null;
  if (valueGap < VALUE_BET_THRESHOLDS.minValueGap) return null;
  
  // Analyser les facteurs de valeur
  const valueFactors = analyzeValueFactors(prediction, underdog, favorite);
  
  // Calculer le score de valeur
  const valueScore = calculateValueScore(valueGap, underdogOdds, valueFactors);
  
  // Déterminer niveau de confiance
  let confidenceLevel: 'high' | 'medium' | 'low';
  if (valueGap >= VALUE_BET_THRESHOLDS.veryHighValueGap && countTrueValues(valueFactors) >= 3) {
    confidenceLevel = 'high';
  } else if (valueGap >= VALUE_BET_THRESHOLDS.highValueGap || countTrueValues(valueFactors) >= 4) {
    confidenceLevel = 'medium';
  } else {
    confidenceLevel = 'low';
  }
  
  // Déterminer niveau de risque
  let riskLevel: 'calculated' | 'moderate' | 'high';
  if (underdogOdds <= 3.0 && confidenceLevel === 'high') {
    riskLevel = 'calculated';
  } else if (underdogOdds <= 4.0) {
    riskLevel = 'moderate';
  } else {
    riskLevel = 'high';
  }
  
  // Générer le raisonnement
  const reasoning = generateReasoning(prediction, underdog, favorite, valueFactors, valueGap);
  
  // Insight clé
  const keyInsight = generateKeyInsight(underdog, valueGap, valueFactors, underdogOdds);
  
  return {
    id: `vb-${prediction.matchId}`,
    match: {
      player1,
      player2,
      tournament: prediction.tournament,
      surface: prediction.surface,
    },
    challenge: {
      underdog,
      favorite,
      underdogOdds,
      favoriteOdds,
      impliedProbability,
      ourProbability,
      valueGap,
    },
    valueFactors,
    valueScore,
    confidenceLevel,
    riskLevel,
    reasoning,
    keyInsight,
    prediction,
    detectedAt: new Date(),
  };
}

/**
 * Analyse les facteurs qui favorisent l'underdog
 */
function analyzeValueFactors(
  prediction: EnhancedPrediction, 
  underdog: string, 
  favorite: string
): ValueBet['valueFactors'] {
  const { factors, keyInsights, warnings } = prediction;
  
  // Avantage forme
  const formAdvantage = factors.form.score !== 0 && (
    (underdog === prediction.player1 && factors.form.score > 10) ||
    (underdog === prediction.player2 && factors.form.score < -10)
  );
  
  // Avantage surface
  const surfaceAdvantage = factors.surface.score !== 0 && (
    (underdog === prediction.player1 && factors.surface.score > 10) ||
    (underdog === prediction.player2 && factors.surface.score < -10)
  );
  
  // Avantage H2H
  const h2hAdvantage = factors.h2h.score !== 0 && (
    (underdog === prediction.player1 && factors.h2h.score > 15) ||
    (underdog === prediction.player2 && factors.h2h.score < -15)
  );
  
  // Avantage pression (moins de points à défendre)
  const pressureAdvantage = factors.pressure?.score !== 0 && (
    (underdog === prediction.player1 && (factors.pressure?.score || 0) > 5) ||
    (underdog === prediction.player2 && (factors.pressure?.score || 0) < -5)
  );
  
  // Avantage domicile
  const homeAdvantage = keyInsights.some(i => 
    i.includes(underdog) && i.includes('domicile')
  );
  
  // Favori en déclin
  const favoriteDecline = warnings.some(w => 
    w.includes(favorite) && (
      w.includes('défaite') || 
      w.includes('déclin') || 
      w.includes('mauvaise forme') ||
      w.includes('série de')
    )
  );
  
  // Avantage fatigue
  const fatigueAdvantage = factors.fatigue.score !== 0 && (
    (underdog === prediction.player1 && factors.fatigue.score > 10) ||
    (underdog === prediction.player2 && factors.fatigue.score < -10)
  );
  
  return {
    formAdvantage,
    surfaceAdvantage,
    h2hAdvantage,
    pressureAdvantage,
    homeAdvantage,
    favoriteDecline,
    fatigueAdvantage,
  };
}

/**
 * Calcule le score de valeur (0-100)
 */
function calculateValueScore(
  valueGap: number, 
  odds: number, 
  factors: ValueBet['valueFactors']
): number {
  let score = 0;
  
  // Score de base basé sur le value gap
  score += Math.min(40, valueGap * 1.5);
  
  // Bonus pour cote attractive (pas trop haute = plus réaliste)
  if (odds >= 2.0 && odds <= 3.0) score += 20;
  else if (odds > 3.0 && odds <= 4.0) score += 15;
  else if (odds > 4.0 && odds <= 5.0) score += 10;
  else score += 5;
  
  // Bonus pour chaque facteur positif
  const factorCount = countTrueValues(factors);
  score += factorCount * 8;
  
  return Math.min(100, Math.round(score));
}

/**
 * Compte les facteurs vrais
 */
function countTrueValues(factors: ValueBet['valueFactors']): number {
  return Object.values(factors).filter(Boolean).length;
}

/**
 * Génère le raisonnement du value bet
 */
function generateReasoning(
  prediction: EnhancedPrediction,
  underdog: string,
  favorite: string,
  factors: ValueBet['valueFactors'],
  valueGap: number
): string[] {
  const reasoning: string[] = [];
  
  reasoning.push(`📊 Value Gap: +${valueGap}% d'écart avec les bookmakers`);
  
  if (factors.formAdvantage) {
    reasoning.push(`📈 ${underdog} en meilleure forme récente`);
  }
  
  if (factors.surfaceAdvantage) {
    reasoning.push(`🎾 Avantage surface pour ${underdog}`);
  }
  
  if (factors.h2hAdvantage) {
    reasoning.push(`⚔️ Historique H2H favorable à ${underdog}`);
  }
  
  if (factors.pressureAdvantage) {
    reasoning.push(`🏆 ${favorite} sous pression (points à défendre)`);
  }
  
  if (factors.homeAdvantage) {
    reasoning.push(`🏠 ${underdog} joue à domicile`);
  }
  
  if (factors.favoriteDecline) {
    reasoning.push(`📉 ${favorite} en phase de déclin`);
  }
  
  if (factors.fatigueAdvantage) {
    reasoning.push(`😴 ${favorite} potentiellement fatigué`);
  }
  
  return reasoning;
}

/**
 * Génère l'insight clé
 */
function generateKeyInsight(
  underdog: string,
  valueGap: number,
  factors: ValueBet['valueFactors'],
  odds: number
): string {
  const factorCount = countTrueValues(factors);
  
  if (valueGap >= 20 && factorCount >= 4) {
    return `🔥 EXCELLENT VALUE BET: ${underdog} sous-estimé de ${valueGap}% (cote @${odds.toFixed(2)})`;
  } else if (valueGap >= 15 && factorCount >= 3) {
    return `⚡ BON VALUE BET: ${underdog} mérite mieux que cette cote`;
  } else if (valueGap >= 10) {
    return `💡 Value intéressant sur ${underdog} - à surveiller`;
  } else {
    return `👀 Petit value sur ${underdog} - risque calculé`;
  }
}

/**
 * Analyse une liste de prédictions pour extraire tous les value bets
 */
export function scanForValueBets(predictions: EnhancedPrediction[]): ValueBetsResult {
  const valueBets: ValueBet[] = [];
  
  for (const prediction of predictions) {
    const valueBet = detectValueBet(prediction);
    if (valueBet) {
      valueBets.push(valueBet);
    }
  }
  
  // Trier par score de valeur décroissant
  valueBets.sort((a, b) => b.valueScore - a.valueScore);
  
  // Calculer le résumé
  const highConfidenceCount = valueBets.filter(vb => vb.confidenceLevel === 'high').length;
  const averageValueGap = valueBets.length > 0 
    ? Math.round(valueBets.reduce((sum, vb) => sum + vb.challenge.valueGap, 0) / valueBets.length)
    : 0;
  
  return {
    totalScanned: predictions.length,
    valueBetsFound: valueBets.length,
    challenges: valueBets,
    summary: {
      highConfidenceCount,
      averageValueGap,
      bestValue: valueBets[0] || null,
    },
  };
}

/**
 * Formate un value bet pour affichage Telegram
 */
export function formatValueBetForTelegram(vb: ValueBet): string {
  const emoji = {
    high: '🔥',
    medium: '⚡',
    low: '💡',
  };
  
  const riskEmoji = {
    calculated: '✅',
    moderate: '⚠️',
    high: '🎲',
  };
  
  let message = `${emoji[vb.confidenceLevel]} *CHALLENGE NÉGLIGÉ*\n\n`;
  message += `🎾 ${vb.match.player1} vs ${vb.match.player2}\n`;
  message += `📍 ${vb.match.tournament} (${vb.match.surface})\n\n`;
  
  message += `📊 *L'opportunité:*\n`;
  message += `• Underdog: ${vb.challenge.underdog} @${vb.challenge.underdogOdds.toFixed(2)}\n`;
  message += `• Bookmaker estime: ${vb.challenge.impliedProbability}%\n`;
  message += `• Notre analyse: ${vb.challenge.ourProbability}%\n`;
  message += `• Value Gap: *+${vb.challenge.valueGap}%*\n\n`;
  
  message += `🔍 *Facteurs en sa faveur:*\n`;
  vb.reasoning.forEach(r => {
    message += `• ${r}\n`;
  });
  
  message += `\n${riskEmoji[vb.riskLevel]} Risque: ${vb.riskLevel.toUpperCase()}\n`;
  message += `📈 Value Score: ${vb.valueScore}/100\n\n`;
  
  message += `_${vb.keyInsight}_`;
  
  return message;
}
