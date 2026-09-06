/**
 * Live Calibration Store — Cache in-memory des calibrations publiées
 *
 * Stocke les calibrations live émises pendant la journée pour
 * permettre au bilan quotidien Telegram de les inclure dans une
 * section dédiée "RÉAJUSTEMENTS LIVE".
 *
 * Cache in-memory (pas de persistance DB) car :
 *   - Le bilan est généré 1x/jour (cron 08:00 UTC)
 *   - Les calibrations sont éphémères (valables le jour du match)
 *   - Pas de besoin d'historique long-terme
 *
 * TTL : 48h (au cas où le cron tombe sur le jour suivant)
 * Capacité : max 200 entrées (FIFO)
 */

import type { LiveCalibrationOutput } from './types';

/** Value bet stocké intégralement (pour évaluation ROI 1u flat par le tracker) */
export interface StoredValueBet {
  market: string;
  model_prob: number;
  fair_odds: number;
  bookmaker_odds: number;
  edge_pct: number;
  recommendation: string;
}

export interface StoredCalibration {
  match_id: string;
  home_team: string;
  away_team: string;
  league: string;
  kickoff_utc: string;
  halftime_utc: string;
  score_ht: { home: number; away: number };
  confidence_index: number;
  confidence_level: string;
  value_bets_count: number;
  top_value_bet?: {
    market: string;
    edge_pct: number;
    bookmaker_odds: number;
    fair_odds: number;
    recommendation: string;
  };
  lambda_home_2nd_half: number;
  lambda_away_2nd_half: number;
  stored_at: number; // epoch ms
  // 🔒 Anti-doublon + traçabilité de publication
  published: boolean;              // le message Telegram a-t-il été envoyé ?
  published_at?: number;           // epoch ms de la publication
  // ⏰ Fenêtre de pari (traçabilité du timing)
  clock_at_calibration?: number;   // minute du match au moment de la calibration
  betting_window_remaining_min?: number; // minutes restantes avant fermeture fenêtre
  // 📈 Résultat final (rempli par le bilan du lendemain pour mesurer la performance)
  final_score?: { home: number; away: number };
  value_bets_outcome?: ('won' | 'lost' | 'void')[];
  // 📊 TRACKER DE CALIBRATION (rempli par /api/live-calibration/track-results)
  value_bets?: StoredValueBet[];                    // TOUS les value bets (pas seulement le top)
  model_outcome_probs?: { home: number; draw: number; away: number }; // 1X2 modèle post-recalibration
  pre_match_outcome_probs?: { home: number; draw: number; away: number }; // 1X2 pre-match (comparaison)
  brier_model?: number;             // Brier 1X2 du modèle recalibré (0-2, bas = mieux)
  brier_pre_match?: number;         // Brier 1X2 du pre-match seul (mesure l'apport de la recalibration)
  model_pick_hit?: boolean;         // le pick directionnel (argmax proba) était-il correct ?
  tracked_at?: number;              // epoch ms de la résolution
}

const MAX_ENTRIES = 200;
const TTL_MS = 48 * 60 * 60 * 1000; // 48h

const store: StoredCalibration[] = [];

/**
 * Ajoute une calibration au cache (ou met à jour l'entrée existante pour ce match).
 * 🔒 Ne PAS écraser le flag published (sinon on republierait 2x le même match).
 */
export function recordCalibration(
  matchInfo: {
    match_id: string;
    home_team: string;
    away_team: string;
    league: string;
    kickoff_utc: string;
    halftime_utc: string;
    score_ht: { home: number; away: number };
  },
  output: LiveCalibrationOutput,
  options?: {
    clock_at_calibration?: number;
    betting_window_remaining_min?: number;
    pre_match_probs?: { home: number; draw: number; away: number };
  },
): StoredCalibration {
  // 📊 Probas 1X2 implicites aux fair odds (p = 1/cote, normalisées) — pour le Brier
  const fo = output.halftime_fair_odds;
  const invSum = 1 / fo.home_win + 1 / fo.draw + 1 / fo.away_win;
  const modelProbs = {
    home: 1 / fo.home_win / invSum,
    draw: 1 / fo.draw / invSum,
    away: 1 / fo.away_win / invSum,
  };
  // Supprimer les doublons (même match_id) en préservant l'état de publication
  const existingIdx = store.findIndex(c => c.match_id === matchInfo.match_id);
  let wasPublished = false;
  let publishedAt: number | undefined;
  if (existingIdx >= 0) {
    wasPublished = store[existingIdx].published;
    publishedAt = store[existingIdx].published_at;
    store.splice(existingIdx, 1);
  }

  // Extraire le top value bet (edge le plus élevé)
  const topVB = output.value_bets_detected.length > 0
    ? [...output.value_bets_detected].sort((a, b) => b.edge_pct - a.edge_pct)[0]
    : undefined;

  const entry: StoredCalibration = {
    ...matchInfo,
    confidence_index: output.confidence_index,
    confidence_level: output.confidence_level,
    value_bets_count: output.value_bets_detected.length,
    top_value_bet: topVB ? {
      market: topVB.market,
      edge_pct: topVB.edge_pct,
      bookmaker_odds: topVB.bookmaker_odds,
      fair_odds: topVB.fair_odds,
      recommendation: topVB.recommendation,
    } : undefined,
    lambda_home_2nd_half: output.lambda_remaining.lambda_home_2nd_half,
    lambda_away_2nd_half: output.lambda_remaining.lambda_away_2nd_half,
    stored_at: Date.now(),
    published: wasPublished,
    published_at: publishedAt,
    clock_at_calibration: options?.clock_at_calibration,
    betting_window_remaining_min: options?.betting_window_remaining_min,
    // 📊 Tracker : TOUS les value bets + probas pour calibration empirique
    value_bets: output.value_bets_detected.map(vb => ({
      market: vb.market,
      model_prob: vb.model_prob,
      fair_odds: vb.fair_odds,
      bookmaker_odds: vb.bookmaker_odds,
      edge_pct: vb.edge_pct,
      recommendation: vb.recommendation,
    })),
    model_outcome_probs: modelProbs,
    pre_match_outcome_probs: options?.pre_match_probs,
  };

  store.push(entry);

  // FIFO eviction
  while (store.length > MAX_ENTRIES) {
    store.shift();
  }

  // TTL eviction
  const now = Date.now();
  for (let i = store.length - 1; i >= 0; i--) {
    if (now - store[i].stored_at > TTL_MS) {
      store.splice(i, 1);
    }
  }

  console.log(`📊 [LIVE CALIB STORE] Enregistré: ${matchInfo.home_team} vs ${matchInfo.away_team} (confiance ${output.confidence_index}/100, ${output.value_bets_detected.length} value bet(s), déjà publié: ${wasPublished ? 'OUI' : 'non'}) — total: ${store.length}`);

  return entry;
}

/**
 * 🔒 Anti-doublon : ce match a-t-il déjà été publié sur Telegram ?
 */
export function isAlreadyPublished(matchId: string): boolean {
  const entry = store.find(c => c.match_id === matchId);
  return entry?.published === true;
}

/**
 * Marque une calibration comme publiée (après envoi Telegram réussi).
 */
export function markPublished(matchId: string): void {
  const entry = store.find(c => c.match_id === matchId);
  if (entry) {
    entry.published = true;
    entry.published_at = Date.now();
    console.log(`📊 [LIVE CALIB STORE] Marqué publié: ${matchId}`);
  }
}

/**
 * 📈 Met à jour le résultat final d'une calibration (appelé par le bilan).
 * Calcule aussi le win/loss de chaque value bet publié.
 */
export function updateFinalScore(
  matchId: string,
  finalScore: { home: number; away: number },
): void {
  const entry = store.find(c => c.match_id === matchId);
  if (!entry) return;

  entry.final_score = finalScore;
  entry.tracked_at = Date.now();

  const totalGoals = finalScore.home + finalScore.away;

  // Évaluer TOUS les value bets contre le résultat final
  // Note : les value bets du module live portent sur le RÉSULTAT FINAL du match
  // (match_winner_home/draw/away, over/under 2.5 total, btts) — pas seulement la 2e MT
  if (entry.value_bets) {
    entry.value_bets_outcome = entry.value_bets.map(
      vb => evaluateMarketOutcome(vb.market, finalScore.home, finalScore.away, totalGoals),
    );
  } else if (entry.top_value_bet) {
    const outcome = evaluateMarketOutcome(entry.top_value_bet.market, finalScore.home, finalScore.away, totalGoals);
    entry.value_bets_outcome = [outcome];
  }

  // 📊 Brier 1X2 du modèle recalibré (+ du pre-match pour comparaison)
  if (entry.model_outcome_probs) {
    entry.brier_model = computeBrier(entry.model_outcome_probs, finalScore);
  }
  if (entry.pre_match_outcome_probs) {
    entry.brier_pre_match = computeBrier(entry.pre_match_outcome_probs, finalScore);
  }

  // 🎯 Pick directionnel : argmax des probas modèle vs résultat réel
  if (entry.model_outcome_probs) {
    const p = entry.model_outcome_probs;
    const pick = p.home >= p.draw && p.home >= p.away ? 'home' : p.away >= p.draw ? 'away' : 'draw';
    const actual = finalScore.home > finalScore.away ? 'home' : finalScore.away > finalScore.home ? 'away' : 'draw';
    entry.model_pick_hit = pick === actual;
  }
}

/**
 * Brier multi-classes 1X2 : Σ (p_i - o_i)² avec o one-hot.
 * 0 = parfait, 2 = pire. Référence : prédire 1/3 partout = 0.667.
 */
export function computeBrier(
  probs: { home: number; draw: number; away: number },
  finalScore: { home: number; away: number },
): number {
  const actual = finalScore.home > finalScore.away
    ? { home: 1, draw: 0, away: 0 }
    : finalScore.away > finalScore.home
      ? { home: 0, draw: 0, away: 1 }
      : { home: 0, draw: 1, away: 0 };
  return (
    Math.pow(probs.home - actual.home, 2) +
    Math.pow(probs.draw - actual.draw, 2) +
    Math.pow(probs.away - actual.away, 2)
  );
}

/**
 * 📈 Calibrations avec résultat final mais pas encore évaluées par le tracker.
 */
export function getPendingTracking(dateISO?: string): StoredCalibration[] {
  return getDailyCalibrations(dateISO).filter(c => !c.final_score);
}

/**
 * 📊 Agrégat roulant sur TOUTES les calibrations résolues du store
 * (historique complet de la fiabilité empirique).
 */
export function getRollingAggregate(): {
  matches_tracked: number;
  avg_brier_model: number | null;
  avg_brier_pre_match: number | null;
  recalibration_wins: number;      // matchs où brier_model < brier_pre_match
  pick_hits: number;
  bets_won: number;
  bets_lost: number;
  bets_void: number;
  stakes: number;
  returns: number;                 // profit net en unités (stake 1u flat)
  roi_pct: number | null;
} {
  const tracked = store.filter(c => c.final_score);
  const withBrierM = tracked.filter(c => c.brier_model !== undefined);
  const withBrierP = tracked.filter(c => c.brier_model !== undefined && c.brier_pre_match !== undefined);

  let betsWon = 0, betsLost = 0, betsVoid = 0, returns = 0;
  for (const c of tracked) {
    if (!c.value_bets || !c.value_bets_outcome) continue;
    c.value_bets_outcome.forEach((o, i) => {
      const odds = c.value_bets![i]?.bookmaker_odds ?? 2;
      if (o === 'won') { betsWon++; returns += odds - 1; }
      else if (o === 'lost') { betsLost++; returns -= 1; }
      else betsVoid++;
    });
  }
  const stakes = betsWon + betsLost; // void = stake remboursée

  return {
    matches_tracked: tracked.length,
    avg_brier_model: withBrierM.length > 0
      ? withBrierM.reduce((a, c) => a + (c.brier_model || 0), 0) / withBrierM.length : null,
    avg_brier_pre_match: withBrierP.length > 0
      ? withBrierP.reduce((a, c) => a + (c.brier_pre_match || 0), 0) / withBrierP.length : null,
    recalibration_wins: withBrierP.filter(c => (c.brier_model || 0) < (c.brier_pre_match || 0)).length,
    pick_hits: tracked.filter(c => c.model_pick_hit === true).length,
    bets_won: betsWon,
    bets_lost: betsLost,
    bets_void: betsVoid,
    stakes,
    returns,
    roi_pct: stakes > 0 ? (returns / stakes) * 100 : null,
  };
}

function evaluateMarketOutcome(
  market: string,
  homeGoals: number,
  awayGoals: number,
  totalGoals: number,
): 'won' | 'lost' | 'void' {
  if (market === 'match_winner_home') return homeGoals > awayGoals ? 'won' : 'lost';
  if (market === 'match_winner_away') return awayGoals > homeGoals ? 'won' : 'lost';
  if (market === 'match_winner_draw') return homeGoals === awayGoals ? 'won' : 'lost';
  if (market === 'over_2_5') return totalGoals > 2.5 ? 'won' : 'lost';
  if (market === 'under_2_5') return totalGoals < 2.5 ? 'won' : 'lost';
  if (market === 'btts_yes') return (homeGoals > 0 && awayGoals > 0) ? 'won' : 'lost';
  if (market === 'btts_no') return (homeGoals === 0 || awayGoals === 0) ? 'won' : 'lost';
  return 'void';
}

/**
 * Récupère les calibrations du jour (ou d'une date spécifique).
 *
 * @param dateISO Format YYYY-MM-DD. Si non fourni, prend aujourd'hui (UTC).
 *                Si "yesterday", prend hier (cas du cron bilan à 08:00 UTC).
 */
export function getDailyCalibrations(dateISO?: string): StoredCalibration[] {
  let targetDate: Date;
  if (!dateISO || dateISO === 'today') {
    targetDate = new Date();
  } else if (dateISO === 'yesterday') {
    targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - 1);
  } else {
    targetDate = new Date(dateISO + 'T12:00:00Z');
  }
  const targetDateStr = targetDate.toISOString().split('T')[0];

  return store.filter(c => {
    // Match par kickoff_utc ou halftime_utc
    const calibDate = c.kickoff_utc || c.halftime_utc || new Date(c.stored_at).toISOString();
    const calibDateStr = calibDate.split('T')[0];
    return calibDateStr === targetDateStr;
  });
}

/**
 * Récupère les calibrations des dernières 24h (utilisé pour debug).
 */
export function getRecentCalibrations(): StoredCalibration[] {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return store.filter(c => c.stored_at >= cutoff);
}

/**
 * Statistiques globales (pour debug / UI).
 */
export function getStoreStats(): {
  total_entries: number;
  today_entries: number;
  published_count_today: number;
  avg_confidence_today: number;
  total_value_bets_today: number;
} {
  const today = getDailyCalibrations('today');
  const published = today.filter(c => c.confidence_index >= 50);

  return {
    total_entries: store.length,
    today_entries: today.length,
    published_count_today: published.length,
    avg_confidence_today: published.length > 0
      ? Math.round(published.reduce((acc, c) => acc + c.confidence_index, 0) / published.length)
      : 0,
    total_value_bets_today: today.reduce((acc, c) => acc + c.value_bets_count, 0),
  };
}

/**
 * Vide le cache (pour tests / maintenance).
 */
export function clearStore(): void {
  store.length = 0;
  console.log('📊 [LIVE CALIB STORE] Cache vidé');
}
