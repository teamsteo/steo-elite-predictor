/**
 * Tennis V3 — Moteur de prédiction (STRATÉGIE 8 ÉTAPES, implémentation pure)
 *
 * Poids (validation utilisateur) :
 *   Elo global+surface 25% | Service/Retour proxy 25% | Forme pondérée 15%
 *   Surface 15% | Matchup/contexte 10% | H2H 5% | Conditions 5%
 *
 * Philosophie : ne PAS chercher à "toujours gagner" mais éliminer les erreurs
 * systématiques → vetos durs (blessure/fatigue) + value (modèle vs implicite)
 * + 3 tiers (🟢 ≥70% consensus, 🟡 60-69%, 🔴 NO BET).
 *
 * Fonctions PURES (testables) — les données viennent de data-service.
 */

import { V3Factor, V3Match, V3PlayerProfile, V3Decision } from './types';
import { surfaceRating } from './elo-engine';

export const WEIGHTS = {
  elo: 0.25,
  dominance: 0.25,
  form: 0.15,
  surface: 0.15,
  matchup: 0.1,
  h2h: 0.05,
  conditions: 0.05,
} as const;

export const THRESHOLDS = {
  green: 0.70,
  yellow: 0.60,
  minFactorAgreement: 5, // sur 7 facteurs alignés avec le favori
  minEdge: 0.03, // 3% de value minimum
  bigEdgeNoDivergence: 0.08, // 8% edge requis si divergence favori marché
  minOdds: 1.3,
  maxOdds: 3.5,
  kellyCap: 0.05,
} as const;

const logistic = (x: number) => 1 / (1 + Math.exp(-x));

// ---------- Facteur 1 : Elo (25%) ----------
export function factorElo(p1: V3PlayerProfile, p2: V3PlayerProfile, surface: string): V3Factor {
  const e1 = 0.4 * p1.rating.overall + 0.6 * surfaceRating(p1.rating, surface);
  const e2 = 0.4 * p2.rating.overall + 0.6 * surfaceRating(p2.rating, surface);
  const diff = e1 - e2;
  const score = logistic(diff / 173.7); // 173.7 ≈ sigma équivalent 250 Elo / sqrt(2) ajusté
  return {
    key: 'elo',
    label: 'Elo global+surface',
    weight: WEIGHTS.elo,
    score,
    detail: `${Math.round(e1)} vs ${Math.round(e2)} (écart ${Math.round(diff)})`,
  };
}

// ---------- Facteur 2 : proxy service/retour — dominance récente (25%) ----------
export function factorDominance(p1: V3PlayerProfile, p2: V3PlayerProfile): V3Factor {
  const d1 = p1.dominanceSample >= 6 ? p1.dominance : 0.5;
  const d2 = p2.dominanceSample >= 6 ? p2.dominance : 0.5;
  const score = logistic((d1 - d2) * 6);
  return {
    key: 'dominance',
    label: 'Service/Retour (proxy dominance)',
    weight: WEIGHTS.dominance,
    score,
    detail: `${(d1 * 100).toFixed(1)}% vs ${(d2 * 100).toFixed(1)}% (n=${p1.dominanceSample}/${p2.dominanceSample})`,
  };
}

// ---------- Facteur 3 : forme pondérée par qualité adversaires (15%) ----------
export function factorForm(p1: V3PlayerProfile, p2: V3PlayerProfile): V3Factor {
  const f1 = p1.formSample >= 4 ? p1.formScore : 0.5;
  const f2 = p2.formSample >= 4 ? p2.formScore : 0.5;
  const score = logistic((f1 - f2) * 5);
  return {
    key: 'form',
    label: 'Forme pondérée (adversaires)',
    weight: WEIGHTS.form,
    score,
    detail: `${(f1 * 100).toFixed(0)} vs ${(f2 * 100).toFixed(0)} (n=${p1.formSample}/${p2.formSample})`,
  };
}

// ---------- Facteur 4 : spécialisation surface (15%) ----------
export function factorSurface(p1: V3PlayerProfile, p2: V3PlayerProfile, surface: string): V3Factor {
  const wr1 = shrink(p1.surfaceWinRate, p1.surfaceMatches, p1.overallWinRate, 12);
  const wr2 = shrink(p2.surfaceWinRate, p2.surfaceMatches, p2.overallWinRate, 12);
  const score = logistic((wr1 - wr2) * 7);
  return {
    key: 'surface',
    label: 'Spécialisation surface',
    weight: WEIGHTS.surface,
    score,
    detail: `${(wr1 * 100).toFixed(0)}% vs ${(wr2 * 100).toFixed(0)}% (n=${p1.surfaceMatches}/${p2.surfaceMatches})`,
  };
}

function shrink(rate: number, n: number, prior: number, k: number): number {
  if (n <= 0) return prior;
  return (rate * n + prior * k) / (n + k);
}

// ---------- Facteur 5 : matchup/contexte (10%) ----------
export function factorMatchup(p1: V3PlayerProfile, p2: V3PlayerProfile, bo5: boolean): V3Factor {
  // momentum ranking points (proxy expérience/activité circuit) + expérience Bo5
  const pts1 = Math.log10(Math.max(10, p1.rankPoints));
  const pts2 = Math.log10(Math.max(10, p2.rankPoints));
  let score = logistic((pts1 - pts2) * 2.2);
  if (bo5) {
    const exp = Math.min(1, (p1.bo5Experience - p2.bo5Experience) / 20); // ±20 matchs GS
    score = 0.75 * score + 0.25 * logistic(exp * 2);
  }
  return {
    key: 'matchup',
    label: 'Contexte matchup (points, Bo5)',
    weight: WEIGHTS.matchup,
    score,
    detail: `${p1.rankPoints} pts (bo5×${p1.bo5Experience}) vs ${p2.rankPoints} pts (bo5×${p2.bo5Experience})`,
  };
}

// ---------- Facteur 6 : H2H (5%) ----------
export function factorH2H(p1: V3PlayerProfile, p2: V3PlayerProfile, surface: string): V3Factor {
  const h = p1.h2h;
  const n = h.wins + h.losses;
  const ns = h.surfaceWins + h.surfaceLosses;
  const rate = n >= 4 ? shrink(h.wins / n, n, 0.5, 6) : 0.5;
  // bonus surface-specific si sample H2H surface suffisant
  const rateSurface = ns >= 3 ? (h.surfaceWins / ns) * 0.6 + rate * 0.4 : rate;
  return {
    key: 'h2h',
    label: 'H2H (fenêtre 5 ans)',
    weight: WEIGHTS.h2h,
    score: logistic((rateSurface - 0.5) * 4),
    detail: n > 0 ? `${h.wins}-${h.losses} (surface ${h.surfaceWins}-${h.surfaceLosses})` : 'aucun H2H récent',
  };
}

// ---------- Facteur 7 : conditions (5%) ----------
export function factorConditions(p1: V3PlayerProfile, p2: V3PlayerProfile, court: string): V3Factor {
  const indoor = String(court).toLowerCase().startsWith('indoor');
  let score = 0.5;
  const detailParts: string[] = [];
  if (indoor && p1.indoorWinRate !== null && p2.indoorWinRate !== null) {
    score = logistic((p1.indoorWinRate - p2.indoorWinRate) * 5);
    detailParts.push(`indoor ${(p1.indoorWinRate * 100).toFixed(0)}% vs ${(p2.indoorWinRate * 100).toFixed(0)}%`);
  } else if (indoor) {
    detailParts.push('indoor, échantillon insuffisant → neutre');
  }
  // fatigue différentielle (matchs 21 derniers jours)
  const fatigueDiff = p2.matchesLast21d - p1.matchesLast21d;
  if (Math.abs(fatigueDiff) >= 2) {
    const fatigueBonus = logistic(fatigueDiff * 0.35); // moins de matchs = avantage
    score = 0.7 * score + 0.3 * fatigueBonus;
    detailParts.push(`charge 21j: ${p1.matchesLast21d} vs ${p2.matchesLast21d}`);
  }
  if (detailParts.length === 0) detailParts.push('neutre');
  return {
    key: 'conditions',
    label: 'Conditions (indoor/fatigue)',
    weight: WEIGHTS.conditions,
    score,
    detail: detailParts.join(' ; '),
  };
}

// ---------- Assemblage ----------
export interface V3RawPrediction {
  factors: V3Factor[];
  rawProbPlayer1: number;
  consensus: number;
  winner: 'player1' | 'player2';
}

export function computeRawPrediction(
  p1: V3PlayerProfile,
  p2: V3PlayerProfile,
  ctx: { surface: string; court: string; bo5: boolean }
): V3RawPrediction {
  const factors = [
    factorElo(p1, p2, ctx.surface),
    factorDominance(p1, p2),
    factorForm(p1, p2),
    factorSurface(p1, p2, ctx.surface),
    factorMatchup(p1, p2, ctx.bo5),
    factorH2H(p1, p2, ctx.surface),
    factorConditions(p1, p2, ctx.court),
  ];
  const wSum = factors.reduce((s, f) => s + f.weight, 0);
  const weighted = factors.reduce((s, f) => s + f.weight * f.score, 0) / wSum;
  // Amplification logistique monotone : la somme pondérée avec facteurs neutres (0.5)
  // compresse l'échelle (300 Elo → ~0.59). On réamplifie autour de 0.5 (k=6) pour
  // retrouver une dynamique exploitable (0.5→0.5, 0.59→0.63, 0.65→0.75).
  const raw = logistic((weighted - 0.5) * 6);
  // consensus : nb de facteurs (pondérés > 0) du même côté que le favori
  const winnerSide = raw >= 0.5 ? 1 : 0;
  const consensus = factors.filter((f) => (f.score >= 0.5 ? 1 : 0) === winnerSide).length;
  return {
    factors,
    rawProbPlayer1: raw,
    consensus,
    winner: winnerSide === 1 ? 'player1' : 'player2',
  };
}

// ---------- Calibration ----------
export interface CalibrationParams {
  a: number; // pente
  b: number; // biais
}
export const DEFAULT_CALIBRATION: CalibrationParams = { a: 1.0, b: 0.0 };

export function calibrate(rawProb: number, tierMultiplier: number, params: CalibrationParams = DEFAULT_CALIBRATION): number {
  // logit-space : p' = sigmoid((logit(p) * a) + b) puis ajustement tier (prudence)
  const clamped = Math.min(0.97, Math.max(0.03, rawProb));
  const logit = Math.log(clamped / (1 - clamped));
  const p = logistic(logit * params.a + params.b);
  // tierMultiplier < 1 tire vers 0.5 (GS = plus imprévisible, Challenger très imprévisible)
  return 0.5 + (p - 0.5) * tierMultiplier;
}

export function tierMultiplierOf(tournamentTier: string): number {
  const t = (tournamentTier || '').toLowerCase();
  if (t.includes('grand_slam') || t.includes('gs')) return 0.9;
  if (t.includes('challenger') || t.includes('itf')) return 0.78;
  if (t.includes('finals')) return 0.88;
  return 0.95; // 250/500/1000
}

// ---------- Value & Kelly ----------
export function computeValue(modelProb: number, odds: number): V3Decision['value'] {
  if (!odds || odds < 1.01) return null;
  const implied = 1 / odds;
  const edge = modelProb - implied;
  const ev = modelProb * odds - 1;
  const kelly = Math.max(0, Math.min(THRESHOLDS.kellyCap, ev / Math.max(0.01, odds - 1)));
  return { odds, impliedProb: implied, edge, ev, kelly };
}

// ---------- Décision finale (tiers + vetos + value) ----------
export function decide(
  raw: V3RawPrediction,
  calibratedProb1: number,
  tier: string,
  odds1: number,
  odds2: number,
  veto: import('./types').V3VetoReason | null
): import('./types').V3Decision {
  const pickP1 = raw.winner === 'player1';
  const prob = pickP1 ? calibratedProb1 : 1 - calibratedProb1;
  const odds = pickP1 ? odds1 : odds2;
  const reasons: string[] = [];

  // VETO = au-dessus de tout
  if (veto) {
    const labels: Record<string, string> = {
      walkover_recent: 'walkover/abandon récent',
      absence_longue: 'absence prolongée (>60j)',
      surcharge_matchs: 'surcharge de matchs (≥4 en 7j)',
      flag_manuel: 'flag manuel actif',
      donnees_insuffisantes: 'données insuffisantes',
    };
    return {
      tier: 'red',
      label: '🔴 NO BET (veto)',
      probPlayer1: calibratedProb1,
      rawProbPlayer1: raw.rawProbPlayer1,
      consensus: raw.consensus,
      betRecommended: false,
      veto,
      value: null,
      reasons: [`Veto: ${labels[veto] || veto}`],
    };
  }

  const value = computeValue(prob, odds);

  // divergence avec le marché
  const marketProb = odds > 0 ? 1 / odds : 0.5;
  const divergence = pickP1 ? prob < marketProb : (1 - prob) < (odds2 > 0 ? 1 / odds2 : 0.5);

  let tierVerdict: 'green' | 'yellow' | 'red';
  if (prob >= THRESHOLDS.green && raw.consensus >= THRESHOLDS.minFactorAgreement) {
    tierVerdict = 'green';
    reasons.push(`🟢 ${Math.round(prob * 100)}% ≥70% + consensus ${raw.consensus}/7`);
  } else if (prob >= THRESHOLDS.yellow) {
    tierVerdict = 'yellow';
    reasons.push(`🟡 ${Math.round(prob * 100)}% (60-69% ou consensus ${raw.consensus}/7 < 5)`);
  } else {
    tierVerdict = 'red';
    reasons.push(`🔴 ${Math.round(prob * 100)}% <60% → NO BET`);
  }

  // value gate
  let betRecommended = tierVerdict === 'green';
  if (betRecommended && value) {
    if (value.edge < THRESHOLDS.minEdge) {
      betRecommended = false;
      reasons.push(`edge ${(value.edge * 100).toFixed(1)}% <3% → pas de bet`);
    } else if (divergence && value.edge < THRESHOLDS.bigEdgeNoDivergence) {
      betRecommended = false;
      reasons.push(`divergence favori marché, edge ${(value.edge * 100).toFixed(1)}% <8% → pas de bet`);
    } else if (odds < THRESHOLDS.minOdds || odds > THRESHOLDS.maxOdds) {
      betRecommended = false;
      reasons.push(`cote ${odds.toFixed(2)} hors plage [1.30-3.50] → pas de bet`);
    } else {
      reasons.push(`value OK: edge ${(value.edge * 100).toFixed(1)}%, EV ${(value.ev * 100).toFixed(1)}%`);
    }
  }

  const labels = { green: '🟢 CANDIDAT', yellow: '🟡 PRUDENCE', red: '🔴 NO BET' };
  return {
    tier: tierVerdict,
    label: labels[tierVerdict],
    probPlayer1: calibratedProb1,
    rawProbPlayer1: raw.rawProbPlayer1,
    consensus: raw.consensus,
    betRecommended,
    veto: null,
    value: betRecommended || (tierVerdict !== 'red' && value && value.edge > 0) ? value : null,
    reasons,
  };
}

// ---------- Vetos ----------
export function computeVeto(p: V3PlayerProfile): import('./types').V3VetoReason | null {
  if (p.lastMatchWalkover) return 'walkover_recent';
  if (p.daysAbsent > 60) return 'absence_longue';
  if (p.matchesLast7d >= 4) return 'surcharge_matchs';
  return null;
}
