/**
 * Noise Filter — Filtrage du bruit sur le xG de 1ère mi-temps
 *
 * 4 étapes :
 *   1. Séparation en composantes (penalty / big_chance / routine)
 *   2. Filtre de Hampel sur la séquence des tirs (détecte outliers)
 *   3. Shrinkage bayésien : mélange prior pré-match / observation live
 *   4. Indicateur de qualité du signal (big_chance / total ratio)
 */

import { ShotEvent, FilteredXG, PreMatchModel } from './types';

// ============================================
// ÉTAPE 1 : SÉPARATION DES COMPOSANTES
// ============================================

interface XGComponents {
  total: number;
  big_chance: number;
  penalty: number;
  routine: number;
}

function splitXGComponents(shots: ShotEvent[], team: 'home' | 'away'): XGComponents {
  let total = 0;
  let big_chance = 0;
  let penalty = 0;
  let routine = 0;

  for (const shot of shots) {
    if (shot.team !== team) continue;
    total += shot.xg;
    if (shot.is_penalty) {
      penalty += shot.xg;
    } else if (shot.is_big_chance) {
      big_chance += shot.xg;
    } else {
      routine += shot.xg;
    }
  }

  return { total, big_chance, penalty, routine };
}

// ============================================
// ÉTAPE 2 : FILTRE DE HAMPEL
// ============================================

/**
 * Filtre de Hampel : pour chaque tir, calcule médiane + MAD sur fenêtre ±5 min.
 * Si xG du tir > médiane + 3*MAD → outlier (down-pondéré à 50%).
 * Détecte les penalties chanceux / tirs lointains chanceux.
 */
function hampelFilter(shots: ShotEvent[], team: 'home' | 'away'): ShotEvent[] {
  const teamShots = shots.filter(s => s.team === team).sort((a, b) => a.minute - b.minute);
  const filtered: ShotEvent[] = [];

  for (const shot of teamShots) {
    const window = teamShots.filter(s => Math.abs(s.minute - shot.minute) <= 5);
    if (window.length < 3) {
      filtered.push(shot);
      continue;
    }

    const xgs = window.map(s => s.xg).sort((a, b) => a - b);
    const median = xgs[Math.floor(xgs.length / 2)];
    const deviations = xgs.map(x => Math.abs(x - median));
    const mad = deviations.sort((a, b) => a - b)[Math.floor(deviations.length / 2)];

    // MAD = 0 si au moins 50% des tirs ont le même xG → on garde
    if (mad === 0) {
      filtered.push(shot);
      continue;
    }

    const score = Math.abs(shot.xg - median) / (1.4826 * mad);
    if (score > 3 && !shot.is_big_chance && !shot.is_penalty) {
      // Outlier détecté : down-pondérer à 50% (garder le signal mais réduire l'impact)
      filtered.push({ ...shot, xg: shot.xg * 0.5 });
    } else {
      filtered.push(shot);
    }
  }

  return filtered;
}

// ============================================
// ÉTAPE 3 : SHRINKAGE BAYÉSIEN
// ============================================

/**
 * Mélange prior pré-match et observation live.
 *
 *   xG_shrinked = (α * prior_rate * 45 + β * observed_xG) / (α * 45 + β * 45)
 *
 * α = force du prior (2.0 = ~90 min équivalentes)
 * β = poids de l'observation live (0.6 = 45 min équivalentes à 27 min)
 *
 * Si l'équipe a un prior λ_home = 1.75 buts/90min, le prior_rate = 1.75/90 = 0.0194/min
 * Sur 45 min, prior contribution = 0.0194 * 45 = 0.875 xG attendus.
 */
function bayesianShrinkage(
  observedXG: number,
  priorLambdaPer90: number,
  observedMinutes: number,
  alpha: number = 2.0,
  beta: number = 0.6,
): number {
  const priorRate = priorLambdaPer90 / 90; // xG par minute
  // Convex mix : (α * prior_total + β * observed_total) / (α + β)
  //   prior_total    = priorRate * observedMinutes  (xG attendus sur la fenêtre)
  //   observed_total = observedXG                   (xG routine observés)
  // ⚠️ Le dénominateur est (α + β), PAS (α + β) * minutes — sinon le résultat
  // est un taux/min et le signal live est écrasé ~45× (bug corrigé 2026-09).
  const priorContribution = alpha * priorRate * observedMinutes;
  const observedContribution = beta * observedXG;
  const totalWeight = alpha + beta;
  return (priorContribution + observedContribution) / totalWeight;
}

// ============================================
// PIPELINE COMPLET
// ============================================

export function filterNoise(
  shots: ShotEvent[],
  preMatch: PreMatchModel,
  observedMinutes: number = 45,
): FilteredXG {
  // Étape 2 : Hampel filter sur chaque équipe
  const homeShotsHampel = hampelFilter(shots, 'home');
  const awayShotsHampel = hampelFilter(shots, 'away');

  // Étape 1 : split composantes (sur les tirs filtrés Hampel)
  const homeComponents = splitXGComponents(homeShotsHampel, 'home');
  const awayComponents = splitXGComponents(awayShotsHampel, 'away');

  // Le signal "routine" exclut penalties et big chances
  const homeRoutine = homeComponents.routine;
  const awayRoutine = awayComponents.routine;

  // Étape 3 : shrinkage bayésien sur le xG routine (signal le moins bruité)
  // On utilise le lambda pré-match (90 min) comme prior
  const homeShrinked = bayesianShrinkage(
    homeRoutine,
    preMatch.lambda_home,
    observedMinutes,
  );
  const awayShrinked = bayesianShrinkage(
    awayRoutine,
    preMatch.lambda_away,
    observedMinutes,
  );

  // Étape 4 : indicateur de qualité du signal
  // Si big_chance / total > 0.6 → signal fort
  // Si < 0.3 → bruit dominant (tirs peu dangereux)
  const homeSignalQuality = homeComponents.total > 0
    ? homeComponents.big_chance / homeComponents.total
    : 0;
  const awaySignalQuality = awayComponents.total > 0
    ? awayComponents.big_chance / awayComponents.total
    : 0;

  return {
    home: {
      raw: homeComponents.total,
      shrinked: homeShrinked,
      big_chance: homeComponents.big_chance,
      penalty: homeComponents.penalty,
      routine: homeRoutine,
      signal_quality: homeSignalQuality,
    },
    away: {
      raw: awayComponents.total,
      shrinked: awayShrinked,
      big_chance: awayComponents.big_chance,
      penalty: awayComponents.penalty,
      routine: awayRoutine,
      signal_quality: awaySignalQuality,
    },
  };
}
