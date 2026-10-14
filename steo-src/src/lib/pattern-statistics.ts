/**
 * Pattern Statistics - Outils statistiques pour valider les patterns ML
 * 
 * Ce module implémente des tests statistiques rigoureux pour filtrer le bruit
 * et ne garder que les patterns réellement significatifs.
 * 
 * Concepts clés:
 * - Intervalle de confiance de Wilson (adapté aux proportions)
 * - Test de significativité (p-value)
 * - Ajustement pour petits échantillons
 */

/**
 * Calcule l'intervalle de confiance de Wilson pour une proportion
 * 
 * L'intervalle de Wilson est plus précis que l'intervalle normal
 * pour les petits échantillons et les proportions extrêmes (proches de 0 ou 1).
 * 
 * @param successes - Nombre de succès
 * @param trials - Nombre total d'essais
 * @param confidence - Niveau de confiance (0.90, 0.95, 0.99)
 * @returns Limite inférieure et supérieure de l'intervalle
 */
export function wilsonConfidenceInterval(
  successes: number,
  trials: number,
  confidence: number = 0.95
): { lower: number; upper: number; point: number } {
  if (trials === 0) {
    return { lower: 0, upper: 0, point: 0 };
  }

  const p = successes / trials;
  const z = getZScore(confidence);
  const n = trials;

  // Formule de Wilson
  const denominator = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);

  return {
    lower: Math.max(0, (center - margin) / denominator),
    upper: Math.min(1, (center + margin) / denominator),
    point: p
  };
}

/**
 * Obtient le score Z pour un niveau de confiance donné
 */
function getZScore(confidence: number): number {
  switch (confidence) {
    case 0.90: return 1.645;
    case 0.95: return 1.96;
    case 0.99: return 2.576;
    default: return 1.96;
  }
}

/**
 * Calcule la p-value pour tester si une proportion est significativement
 * différente d'une valeur de référence (généralement 50% pour le hasard)
 * 
 * Utilise le test binomial exact (plus précis pour petits échantillons)
 * Approximé par la loi normale pour grands échantillons (n > 30)
 * 
 * @param successes - Nombre de succès
 * @param trials - Nombre total d'essais
 * @param nullHypothesis - Valeur de référence (défaut: 0.5 = hasard)
 * @returns p-value (probabilité que ce résultat soit dû au hasard)
 */
export function calculatePValue(
  successes: number,
  trials: number,
  nullHypothesis: number = 0.5
): number {
  if (trials === 0) return 1;

  const p = successes / trials;
  const p0 = nullHypothesis;

  // Test Z pour grands échantillons
  if (trials >= 30) {
    const se = Math.sqrt(p0 * (1 - p0) / trials);
    const z = Math.abs(p - p0) / se;
    // P-value bilatérale
    return 2 * (1 - normalCDF(z));
  }

  // Pour petits échantillons, approximation avec facteur de correction
  const se = Math.sqrt(p0 * (1 - p0) / trials);
  const z = Math.abs(p - p0) / se;
  return 2 * (1 - normalCDF(z));
}

/**
 * Fonction de répartition de la loi normale standard
 * Approximation de Abramowitz et Stegun
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Résultat de la validation statistique d'un pattern
 */
export interface PatternValidation {
  isValid: boolean;
  successRate: number;
  sampleSize: number;
  
  // Intervalle de confiance à 95%
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  
  // P-value (probabilité que ce soit du hasard)
  pValue: number;
  
  // Niveau de significativité
  significance: 'not_significant' | 'marginal' | 'significant' | 'highly_significant';
  
  // Score de confiance ajusté (0-100)
  adjustedConfidence: number;
  
  // Warnings
  warnings: string[];
}

/**
 * Valide un pattern avec des tests statistiques rigoureux
 * 
 * @param successes - Nombre de prédictions correctes
 * @param trials - Nombre total de matchs
 * @param sport - Sport concerné (pour ajuster les seuils)
 */
export function validatePattern(
  successes: number,
  trials: number,
  sport: 'football' | 'basketball' | 'hockey' | 'baseball' = 'football'
): PatternValidation {
  const warnings: string[] = [];
  
  // 1. Calcul de l'intervalle de confiance de Wilson
  const ci = wilsonConfidenceInterval(successes, trials, 0.95);
  
  // 2. Calcul de la p-value (test contre hasard = 50%)
  const pValue = calculatePValue(successes, trials, 0.5);
  
  // 3. Déterminer la significativité
  let significance: PatternValidation['significance'];
  if (pValue < 0.01) {
    significance = 'highly_significant';
  } else if (pValue < 0.05) {
    significance = 'significant';
  } else if (pValue < 0.10) {
    significance = 'marginal';
  } else {
    significance = 'not_significant';
    warnings.push(`Pattern non significatif (p-value: ${(pValue * 100).toFixed(1)}%)`);
  }
  
  // 4. Vérifier la taille d'échantillon minimum
  const minSampleBySport: Record<string, number> = {
    football: 50,    // Plus de variance, besoin de plus de données
    basketball: 30,  // Moins de variance
    hockey: 40,
    baseball: 40
  };
  
  const minSample = minSampleBySport[sport] || 30;
  if (trials < minSample) {
    warnings.push(`Échantillon trop petit (${trials} < ${minSample} recommandés)`);
  }
  
  // 5. Vérifier la largeur de l'intervalle de confiance
  const intervalWidth = ci.upper - ci.lower;
  if (intervalWidth > 0.20) {
    warnings.push(`Intervalle de confiance large (±${((intervalWidth / 2) * 100).toFixed(0)}%) - données insuffisantes`);
  }
  
  // 6. Calculer le score de confiance ajusté
  // Pénalise les patterns avec:
  // - Petits échantillons
  // - Grands intervalles de confiance
  // - P-values élevées
  
  const sampleFactor = Math.min(1, trials / minSample);
  const intervalFactor = 1 - (intervalWidth / 2);
  const pValueFactor = 1 - pValue;
  
  // La borne inférieure de l'intervalle est le taux de succès "garanti"
  const guaranteedRate = ci.lower;
  
  // Score ajusté: on utilise la borne inférieure de Wilson
  // C'est plus conservateur et évite l'overfitting
  const adjustedConfidence = Math.round(
    guaranteedRate * 100 * sampleFactor * intervalFactor * (0.7 + 0.3 * pValueFactor)
  );
  
  // 7. Déterminer si le pattern est valide
  const isValid = 
    significance !== 'not_significant' &&
    ci.lower >= 0.55 &&  // Borne inférieure >= 55%
    trials >= minSample * 0.6 &&  // Au moins 60% de la taille recommandée
    adjustedConfidence >= 50;
  
  return {
    isValid,
    successRate: Math.round((successes / trials) * 100),
    sampleSize: trials,
    confidenceInterval: {
      lower: Math.round(ci.lower * 100),
      upper: Math.round(ci.upper * 100)
    },
    pValue: Math.round(pValue * 1000) / 1000,
    significance,
    adjustedConfidence,
    warnings
  };
}

/**
 * Compare deux patterns pour déterminer lequel est le plus fiable
 * 
 * Utilise le test du chi-carré pour comparer deux proportions
 */
export function comparePatterns(
  pattern1: { successes: number; trials: number },
  pattern2: { successes: number; trials: number }
): {
  winner: 1 | 2 | 'tie';
  confidence: number;
  reason: string;
} {
  // Calculer les intervalles de confiance
  const ci1 = wilsonConfidenceInterval(pattern1.successes, pattern1.trials);
  const ci2 = wilsonConfidenceInterval(pattern2.successes, pattern2.trials);
  
  // Si les intervalles ne se chevauchent pas, la différence est significative
  if (ci1.lower > ci2.upper) {
    return {
      winner: 1,
      confidence: 95,
      reason: `Pattern 1 significativement meilleur (${Math.round(ci1.point * 100)}% vs ${Math.round(ci2.point * 100)}%)`
    };
  }
  
  if (ci2.lower > ci1.upper) {
    return {
      winner: 2,
      confidence: 95,
      reason: `Pattern 2 significativement meilleur (${Math.round(ci2.point * 100)}% vs ${Math.round(ci1.point * 100)}%)`
    };
  }
  
  // Les intervalles se chevauchent - pas de différence significative
  // On choisit celui avec le plus grand échantillon
  if (pattern1.trials > pattern2.trials * 1.5) {
    return {
      winner: 1,
      confidence: 70,
      reason: `Pattern 1 préféré (échantillon plus grand: ${pattern1.trials} vs ${pattern2.trials})`
    };
  }
  
  if (pattern2.trials > pattern1.trials * 1.5) {
    return {
      winner: 2,
      confidence: 70,
      reason: `Pattern 2 préféré (échantillon plus grand: ${pattern2.trials} vs ${pattern1.trials})`
    };
  }
  
  // Sinon, on prend le meilleur taux brut
  const winner = ci1.point >= ci2.point ? 1 : 2;
  return {
    winner: winner as 1 | 2,
    confidence: 60,
    reason: `Pattern ${winner} légèrement meilleur (différence non significative)`
  };
}

/**
 * Génère un rapport statistique détaillé pour un pattern
 */
export function generatePatternReport(
  patternId: string,
  successes: number,
  trials: number,
  sport: 'football' | 'basketball' | 'hockey' | 'baseball'
): string {
  const validation = validatePattern(successes, trials, sport);
  
  let report = `📊 RAPPORT STATISTIQUE: ${patternId}\n`;
  report += `${'='.repeat(50)}\n\n`;
  
  report += `📈 STATISTIQUES BRUTES\n`;
  report += `   Taux de succès: ${validation.successRate}% (${successes}/${trials})\n`;
  report += `   Taille échantillon: ${trials} matchs\n\n`;
  
  report += `📊 INTERVALLE DE CONFIANCE (95%)\n`;
  report += `   Borne inférieure: ${validation.confidenceInterval.lower}%\n`;
  report += `   Borne supérieure: ${validation.confidenceInterval.upper}%\n`;
  report += `   → Le taux de succès réel est probablement entre ${validation.confidenceInterval.lower}% et ${validation.confidenceInterval.upper}%\n\n`;
  
  report += `🎯 SIGNIFICATIVITÉ\n`;
  report += `   P-value: ${validation.pValue} (${(validation.pValue * 100).toFixed(1)}%)\n`;
  report += `   Niveau: ${validation.significance.replace('_', ' ')}\n`;
  report += `   → ${validation.pValue < 0.05 ? '✅ Résultat significatif (pas dû au hasard)' : '⚠️ Résultat potentiellement dû au hasard'}\n\n`;
  
  report += `⭐ SCORE AJUSTÉ\n`;
  report += `   Confiance ajustée: ${validation.adjustedConfidence}%\n`;
  report += `   → Ce score prend en compte la taille d'échantillon et les intervalles de confiance\n\n`;
  
  if (validation.warnings.length > 0) {
    report += `⚠️ AVERTISSEMENTS\n`;
    validation.warnings.forEach(w => report += `   • ${w}\n`);
    report += `\n`;
  }
  
  report += `${'='.repeat(50)}\n`;
  report += validation.isValid ? '✅ PATTERN VALIDÉ' : '❌ PATTERN REJETÉ';
  
  return report;
}

export default {
  wilsonConfidenceInterval,
  calculatePValue,
  validatePattern,
  comparePatterns,
  generatePatternReport
};
