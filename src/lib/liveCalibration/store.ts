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
}

const MAX_ENTRIES = 200;
const TTL_MS = 48 * 60 * 60 * 1000; // 48h

const store: StoredCalibration[] = [];

/**
 * Ajoute une calibration au cache après publication Telegram.
 * Évite les doublons (même match_id écrase l'ancienne entrée).
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
): void {
  // Supprimer les doublons (même match_id)
  const existingIdx = store.findIndex(c => c.match_id === matchInfo.match_id);
  if (existingIdx >= 0) {
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

  console.log(`📊 [LIVE CALIB STORE] Enregistré: ${matchInfo.home_team} vs ${matchInfo.away_team} (confiance ${output.confidence_index}/100, ${output.value_bets_detected.length} value bet(s)) — total: ${store.length}`);
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
