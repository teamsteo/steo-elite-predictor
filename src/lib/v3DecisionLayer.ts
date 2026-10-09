/**
 * V3 Decision Layer — BADJAN "Modèle indépendant du marché" (Task 41, Phase 3)
 *
 * Implémente les ÉTAPES 5-6-7 de la méthodologie BADJAN NHL & MLB V3:
 *
 *   ÉTAPE 5 — Analyse de la cote (seulement APRÈS la proba sportive):
 *     P_implicite brute = 1/cote
 *     P_marché corrigée = devig 2-marchés: (1/cote_A)/[(1/cote_A)+(1/cote_B)]
 *     Écart = P_modèle − P_marché_corrigée
 *     EV = (P_modèle × cote) − 1
 *
 *   ÉTAPE 6 — Détection d'erreur du bookmaker:
 *     Un grand écart = anomalie À VÉRIFIER, pas une prestation automatique.
 *     Les 8 garde-fous "fausse value" sont vérifiés explicitement.
 *
 *   ÉTAPE 7 — Décision finale en 3 classes:
 *     RETENIR    = proba robuste + EV>0 APRÈS avoir soustrait l'incertitude
 *     SURVEILLER = écart intéressant mais à confirmer
 *     REJETER    = pas de value / données fragiles / incertitude trop haute / prix défavorable
 *
 * Points méthodologiques respectés:
 *   - AUCUN filtre de cote initial (le seuil dépend de l'incertitude, pas d'un
 *     intervalle 1.40-1.70 — règle "interdiction de filtrage par cotes" de V3)
 *   - La proba modère ENTRÉE est la proba sportive PURE de l'engine (étapes 2-3),
 *     pas la proba blendée affichée sur le site
 *   - Le scénario défavorable (V3 §8 point 7) est testé via une proba
 *     conservatrice (marge engine rétrécie vers 0) → EV pessimiste
 *   - Le seuil minimal de value s'élargit avec l'incertitude (shrinkage)
 *
 * KILL-SWITCH: env V3_DECISION=false désactive la couche (aucun bloc décision).
 */

// ============================================
// CONSTANTES (recalibrables via backtest Phase 4)
// ============================================

/** Écart minimal (pp) pour RETENIR quand les données sont parfaites */
export const BASE_REQUIRED_GAP_PP = 3.5;
/** Bonus maximal (pp) ajouté quand l'incertitude est maximale */
export const MAX_UNCERTAINTY_BONUS_PP = 4.5;
/** Shrinkage minimal pour RETENIR (en-dessous = données fragiles → REJETER/SURVEILLER) */
export const MIN_SHRINK_FOR_RETENIR = 0.4;
/** Écart minimal (pp) pour un simple statut SURVEILLER */
export const SURVEILLER_GAP_PP = 2.0;

// ============================================
// TYPES
// ============================================

export interface V3DecisionInput {
  sport: string;
  side: 'home' | 'away';
  homeTeam: string;
  awayTeam: string;
  /** Proba sportive PURE de l'engine pour le côté choisi (étapes 2-3) */
  modelProb: number;
  /** Proba conservatrice (scénario défavorable): marge rétrécie vers 0 */
  modelProbConservative: number;
  /** Cote décimale du côté choisi */
  oddsSide: number;
  /** Cote décimale du côté opposé (pour le devig 2-marchés) */
  oddsOpposite: number;
  /** Shrinkage engine (0-1): 1 = échantillon riche, 0 = aucune donnée */
  shrinkFactor: number;
  /** Cotes réelles disponibles (jamais de value sur cotes estimées) */
  hasRealOdds: boolean;
  /** Données lanceurs/gardien manquantes → fiabilité réduite */
  startersMissing?: boolean;
  /** Infos de projection pour les raisons */
  projectionSummary?: string;
}

export interface V3Checks {
  /** 1. Compositions/absences intégrées (engine shrinkée + lanceurs réels) */
  lineupsIntegrated: boolean;
  /** 2. Incertitude mesurée (intervalle + shrinkage) */
  uncertaintyMeasured: boolean;
  /** 3. Divergence modèle-marché explicable (données récentes suffisantes) */
  divergenceExplained: boolean;
  /** 4. Marge bookmaker retirée (devig appliqué) */
  devigApplied: boolean;
  /** 5. EV calculé avec la proba pure du modèle */
  evComputed: boolean;
  /** 6. Prix réel disponible (cotes estimées → jamais RETENIR) */
  realOddsAvailable: boolean;
  /** 7. Scénario défavorable: EV reste positif avec la proba conservatrice */
  adverseScenarioPositive: boolean;
  /** 8. Pas de dépendance à une estimation trop optimiste (écart ≥ seuil adaptatif) */
  notOverOptimistic: boolean;
}

export interface V3Decision {
  side: 'home' | 'away';
  category: 'RETENIR' | 'SURVEILLER' | 'REJETER';
  /** Équipe ou issue recommandée (label français prêt à afficher) */
  sideLabel: string;
  // ── Étape 5: marché ──
  impliedRaw: number;        // 1/cote brute
  impliedDevig: number;      // marge corrigée 2-marchés
  bookmakerMargin: number;   // overround total (pp)
  // ── Modèle ──
  modelProb: number;
  modelProbConservative: number;
  // ── Diagnostics ──
  gapPp: number;             // Écart = (P_modèle − P_marché) × 100
  ev: number;                // (P_modèle × cote − 1) × 100
  evConservative: number;    // EV au scénario défavorable × 100
  kellyFraction: number;     // fraction de Kelly (quarter-Kelly affiché)
  requiredGapPp: number;     // seuil adaptatif selon incertitude
  dataReliability: number;   // shrinkFactor ajusté (lanceurs manquants pénalisés)
  checks: V3Checks;
  reasons: string[];         // explications prêtes à afficher (français)
}

// ============================================
// FONCTIONS PURES (testées unitairement)
// ============================================

/** P_marché corrigée (devig 2-marchés) pour le côté choisi */
export function devigTwoWay(oddsSide: number, oddsOpposite: number): number {
  if (!(oddsSide > 1) || !(oddsOpposite > 1)) return 0;
  const invSide = 1 / oddsSide;
  const invOpp = 1 / oddsOpposite;
  return invSide / (invSide + invOpp);
}

/** Marge bookmaker totale (overround) en pp */
export function bookmakerMarginPp(oddsSide: number, oddsOpposite: number): number {
  if (!(oddsSide > 1) || !(oddsOpposite > 1)) return 0;
  return ((1 / oddsSide + 1 / oddsOpposite) - 1) * 100;
}

/** EV d'une mise de 1 unité à la cote donnée avec la proba modèle (×100) */
export function expectedValue(modelProb: number, odds: number): number {
  return (modelProb * odds - 1) * 100;
}

/** Seuil d'écart adaptatif (pp): plus d'incertitude → seuil plus élevé */
export function requiredGapPpFor(dataReliability: number): number {
  const uncertainty = Math.max(0, Math.min(1, 1 - dataReliability));
  return BASE_REQUIRED_GAP_PP + uncertainty * MAX_UNCERTAINTY_BONUS_PP;
}

/**
 * Proba conservatrice: rétrécit la marge modèle de `shrink` vers 0.5.
 * Scénario défavorable V3 (point 7): et si le modèle était trop confiant?
 */
export function conservativeProb(modelProb: number, strength = 0.35): number {
  return 0.5 + (modelProb - 0.5) * (1 - strength);
}

/** Fraction de Kelly pour la mise (quarter-Kelly appliqué à l'affichage) */
export function kellyFractionFor(modelProb: number, odds: number): number {
  if (!(odds > 1)) return 0;
  const b = odds - 1;
  const f = (modelProb * odds - 1) / b;
  return Math.max(0, f / 4); // quarter-Kelly par prudence
}

// ============================================
// DÉCISION COMPLÈTE
// ============================================

/**
 * Décision finale V3 pour un match (étapes 5-6-7).
 * Retourne toujours une décision (REJETER est une décision normale et souhaitable).
 */
export function computeV3Decision(input: V3DecisionInput): V3Decision {
  const reasons: string[] = [];
  const sideLabel = input.side === 'home' ? input.homeTeam : input.awayTeam;

  // ── ÉTAPE 5: analyse de la cote ──
  const impliedRaw = input.oddsSide > 1 ? 1 / input.oddsSide : 0;
  const impliedDevig = devigTwoWay(input.oddsSide, input.oddsOpposite);
  const marginPp = bookmakerMarginPp(input.oddsSide, input.oddsOpposite);
  const gapPp = (input.modelProb - impliedDevig) * 100;
  const ev = expectedValue(input.modelProb, input.oddsSide);
  const evConservative = expectedValue(input.modelProbConservative, input.oddsSide);
  const dataReliability = Math.max(0, Math.min(1, input.shrinkFactor * (input.startersMissing ? 0.8 : 1)));
  const requiredGapPp = requiredGapPpFor(dataReliability);
  const kelly = kellyFractionFor(input.modelProb, input.oddsSide);

  // ── ÉTAPE 6: les 8 garde-fous "fausse value" ──
  const checks: V3Checks = {
    lineupsIntegrated: dataReliability >= MIN_SHRINK_FOR_RETENIR && !input.startersMissing,
    uncertaintyMeasured: input.shrinkFactor > 0,
    divergenceExplained: dataReliability >= MIN_SHRINK_FOR_RETENIR,
    devigApplied: marginPp > 0,
    evComputed: Number.isFinite(ev),
    realOddsAvailable: input.hasRealOdds && input.oddsSide > 1 && input.oddsOpposite > 1,
    adverseScenarioPositive: evConservative > 0,
    notOverOptimistic: gapPp >= requiredGapPp,
  };

  // ── ÉTAPE 7: classification ──
  let category: V3Decision['category'];

  if (!checks.realOddsAvailable) {
    category = 'REJETER';
    reasons.push('Cotes réelles indisponibles → aucune value prouvable (V3: jamais sur cotes estimées)');
  } else if (gapPp <= 0) {
    category = 'REJETER';
    reasons.push(`Modèle aligné ou derrière le marché (écart ${gapPp.toFixed(1)}pp) → pas d'avantage`);
  } else if (dataReliability < MIN_SHRINK_FOR_RETENIR) {
    // échantillon trop faible pour expliquer la divergence → jamais RETENIR
    category = gapPp >= SURVEILLER_GAP_PP ? 'SURVEILLER' : 'REJETER';
    reasons.push(`Données fragiles (fiabilité ${(dataReliability * 100).toFixed(0)}%) — divergence à confirmer, décision ${category.toLowerCase()}`);
  } else if (checks.adverseScenarioPositive && checks.notOverOptimistic && gapPp >= requiredGapPp) {
    category = 'RETENIR';
    reasons.push(`Value validée: écart +${gapPp.toFixed(1)}pp ≥ seuil ${requiredGapPp.toFixed(1)}pp, EV +${ev.toFixed(1)}% (pessimiste +${evConservative.toFixed(1)}%)`);
  } else if (gapPp >= SURVEILLER_GAP_PP && ev > 0) {
    category = 'SURVEILLER';
    if (!checks.notOverOptimistic) {
      reasons.push(`Écart +${gapPp.toFixed(1)}pp < seuil adaptatif ${requiredGapPp.toFixed(1)}pp (incertitude ${(1 - dataReliability).toFixed(2)}) → à confirmer`);
    } else {
      reasons.push(`EV devient négatif au scénario défavorable (+${evConservative.toFixed(1)}%) → à confirmer`);
    }
  } else {
    category = 'REJETER';
    reasons.push(`Écart +${gapPp.toFixed(1)}pp insuffisant (seuil ${requiredGapPp.toFixed(1)}pp) et EV ${ev > 0 ? '+' : ''}${ev.toFixed(1)}%`);
  }

  // Raisons contextuelles
  if (input.projectionSummary) reasons.push(input.projectionSummary);
  if (input.startersMissing && category === 'RETENIR') {
    // ne devrait pas arriver (lineupsIntegrated false), garde-fou affichage
    category = 'SURVEILLER';
    reasons.push('Lanceurs/gardiens manquants → rétrogradé en surveillance');
  }
  if (category === 'RETENIR') {
    reasons.push(`Kelly affiché ${(kelly * 100).toFixed(1)}% (quarter-Kelly, marge book ${marginPp.toFixed(1)}pp)`);
  }

  return {
    side: input.side,
    category,
    sideLabel,
    impliedRaw: round4(impliedRaw),
    impliedDevig: round4(impliedDevig),
    bookmakerMargin: Math.round(marginPp * 10) / 10,
    modelProb: round4(input.modelProb),
    modelProbConservative: round4(input.modelProbConservative),
    gapPp: Math.round(gapPp * 10) / 10,
    ev: Math.round(ev * 10) / 10,
    evConservative: Math.round(evConservative * 10) / 10,
    kellyFraction: Math.round(kelly * 1000) / 1000,
    requiredGapPp: Math.round(requiredGapPp * 10) / 10,
    dataReliability: Math.round(dataReliability * 100) / 100,
    checks,
    reasons,
  };
}

/**
 * Construit la décision V3 depuis une projection engine + cotes.
 * Le côté choisi est celui que l'engine favorise (proba pure maximale) —
 * V3: la décision part du MODÈLE, la cote n'intervient qu'ensuite.
 */
export function decideFromEngine(
  sport: 'NHL' | 'MLB',
  homeTeam: string,
  awayTeam: string,
  engineHomeProb: number,
  oddsHome: number,
  oddsAway: number,
  shrinkFactor: number,
  hasRealOdds: boolean,
  startersMissing: boolean,
  projectionSummary?: string
): V3Decision {
  const side: 'home' | 'away' = engineHomeProb >= 0.5 ? 'home' : 'away';
  const modelProb = side === 'home' ? engineHomeProb : 1 - engineHomeProb;
  return computeV3Decision({
    sport,
    side,
    homeTeam,
    awayTeam,
    modelProb,
    modelProbConservative: conservativeProb(modelProb),
    oddsSide: side === 'home' ? oddsHome : oddsAway,
    oddsOpposite: side === 'home' ? oddsAway : oddsHome,
    shrinkFactor,
    hasRealOdds,
    startersMissing,
    projectionSummary,
  });
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
