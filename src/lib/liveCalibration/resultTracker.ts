/**
 * Result Tracker — Mesure empirique de la fiabilité du module Live Calibration
 *
 * Répond à LA question : "le modèle est-il fiable ?" par la donnée, pas la théorie.
 *
 * Chaque soir (22:30 + 23:45 UTC via GitHub Actions), le tracker :
 *   1. Récupère les calibrations du jour sans résultat final
 *   2. Fetch les scores finaux ESPN (fetchFinalScoresBatch)
 *   3. Pour chaque match résolu :
 *        - Brier 1X2 du modèle recalibré vs Brier du pre-match seul
 *          (mesure l'APPORT RÉEL de la recalibration à la mi-temps)
 *        - Pick directionnel (argmax proba) correct ou non
 *        - ROI simulé des value bets en mise fixe 1 unité (au cote bookmaker réelles)
 *   4. Envoie le message indicatif EN PRIVÉ sur Telegram (DM)
 *
 * Lecture des métriques :
 *   - Brier : 0 = parfait. Référence universelle : prédire 1/3-1/3-1/3 = 0.667.
 *     Livres de qualité sur 1X2 football (saison complète) ≈ 0.19-0.22.
 *   - ROI : +X% = edge réel confirmé ; négatif sur 100+ paris = pas d'edge.
 *   - recalibration_wins : combien de fois la mise à jour MT a battu le pre-match.
 */

import {
  getPendingTracking,
  getDailyCalibrations,
  getRollingAggregate,
  updateFinalScore,
  StoredCalibration,
} from './store';
import { fetchFinalScoresBatch } from './finalScores';

export interface TrackedMatch {
  home_team: string;
  away_team: string;
  league: string;
  score_ht: { home: number; away: number };
  final_score: { home: number; away: number };
  model_pick_hit?: boolean;
  brier_model?: number;
  brier_pre_match?: number;
  bets: Array<{ market: string; outcome: 'won' | 'lost' | 'void'; bookmaker_odds: number; profit_units: number }>;
  day_profit_units: number;
}

export interface DayStats {
  resolved: number;
  unresolved: number;
  pick_hits: number;
  brier_avg_model: number | null;
  brier_avg_pre_match: number | null;
  bets_won: number;
  bets_lost: number;
  bets_void: number;
  profit_units: number;
  staked: number;
  roi_pct: number | null;
}

export interface TrackingResult {
  date: string;
  matches: TrackedMatch[];
  day: DayStats;
  rolling: ReturnType<typeof getRollingAggregate>;
  unresolved_ids: string[];
}

/**
 * Résout les calibrations d'une date : fetch scores finaux, calcule les métriques,
 * met à jour le store. Idempotent (les matchs déjà résolus ne sont pas retraités).
 */
export async function trackResultsForDate(dateISO?: string): Promise<TrackingResult> {
  const date = dateISO || 'today';
  const pending = getPendingTracking(date);

  const matches: TrackedMatch[] = [];
  const unresolvedIds: string[] = [];

  if (pending.length > 0) {
    // 1. Fetch des scores finaux (par batch, rate-limit friendly)
    const scores = await fetchFinalScoresBatch(pending.map(c => ({
      match_id: c.match_id,
      league: c.league,
      kickoff_utc: c.kickoff_utc,
    })));

    // 2. Résoudre chaque match
    for (const entry of pending) {
      const score = scores.get(entry.match_id);
      if (!score) {
        unresolvedIds.push(entry.match_id);
        continue; // pas encore fini, reporté, ou ligue non couverte → retry au prochain run
      }
      updateFinalScore(entry.match_id, score);
      matches.push(buildTrackedMatch(entry, score));
    }
  }

  // 3. Stats du jour : inclure aussi les matchs résolus par le bilan plus tôt
  const allDay = getDailyCalibrations(date).filter(c => c.final_score);
  const resolvedAll = allDay.map(c => buildTrackedMatch(c, c.final_score!));

  return {
    date,
    matches: resolvedAll.length > 0 ? resolvedAll : matches,
    day: computeDayStats(allDay, unresolvedIds.length),
    rolling: getRollingAggregate(),
    unresolved_ids: unresolvedIds,
  };
}

function buildTrackedMatch(entry: StoredCalibration, score: { home: number; away: number }): TrackedMatch {
  const bets: TrackedMatch['bets'] = [];
  if (entry.value_bets && entry.value_bets_outcome) {
    entry.value_bets.forEach((vb, i) => {
      const outcome = entry.value_bets_outcome![i];
      if (!outcome) return;
      const profit = outcome === 'won' ? vb.bookmaker_odds - 1 : outcome === 'lost' ? -1 : 0;
      bets.push({
        market: vb.market,
        outcome,
        bookmaker_odds: vb.bookmaker_odds,
        profit_units: profit,
      });
    });
  } else if (entry.top_value_bet && entry.value_bets_outcome && entry.value_bets_outcome[0]) {
    const outcome = entry.value_bets_outcome[0];
    const odds = entry.top_value_bet.bookmaker_odds;
    bets.push({
      market: entry.top_value_bet.market,
      outcome,
      bookmaker_odds: odds,
      profit_units: outcome === 'won' ? odds - 1 : outcome === 'lost' ? -1 : 0,
    });
  }

  return {
    home_team: entry.home_team,
    away_team: entry.away_team,
    league: entry.league,
    score_ht: entry.score_ht,
    final_score: score,
    model_pick_hit: entry.model_pick_hit,
    brier_model: entry.brier_model,
    brier_pre_match: entry.brier_pre_match,
    bets,
    day_profit_units: bets.reduce((a, b) => a + b.profit_units, 0),
  };
}

function computeDayStats(
  resolvedDay: StoredCalibration[],
  unresolved: number,
): DayStats {
  let betsWon = 0, betsLost = 0, betsVoid = 0, profit = 0;
  for (const c of resolvedDay) {
    if (!c.value_bets || !c.value_bets_outcome) continue;
    c.value_bets_outcome.forEach((o, i) => {
      const odds = c.value_bets![i]?.bookmaker_odds ?? 2;
      if (o === 'won') { betsWon++; profit += odds - 1; }
      else if (o === 'lost') { betsLost++; profit -= 1; }
      else betsVoid++;
    });
  }
  const staked = betsWon + betsLost;
  const withBrierM = resolvedDay.filter(c => c.brier_model !== undefined);
  const withBrierP = resolvedDay.filter(c => c.brier_model !== undefined && c.brier_pre_match !== undefined);

  return {
    resolved: resolvedDay.length,
    unresolved,
    pick_hits: resolvedDay.filter(c => c.model_pick_hit === true).length,
    brier_avg_model: withBrierM.length ? withBrierM.reduce((a, c) => a + c.brier_model!, 0) / withBrierM.length : null,
    brier_avg_pre_match: withBrierP.length ? withBrierP.reduce((a, c) => a + c.brier_pre_match!, 0) / withBrierP.length : null,
    bets_won: betsWon,
    bets_lost: betsLost,
    bets_void: betsVoid,
    profit_units: profit,
    staked,
    roi_pct: staked > 0 ? (profit / staked) * 100 : null,
  };
}

// ============================================
// MESSAGE TELEGRAM (indicatif, privé)
// ============================================

const MARKET_LABELS: Record<string, string> = {
  match_winner_home: '1 Victoire domicile',
  match_winner_draw: 'X Nul',
  match_winner_away: '2 Victoire extérieur',
  over_2_5: 'Over 2.5',
  under_2_5: 'Under 2.5',
  btts_yes: 'BTTS Oui',
  btts_no: 'BTTS Non',
};

function brierVerdict(brier: number): string {
  if (brier < 0.25) return 'excellente';
  if (brier < 0.45) return 'bonne';
  if (brier < 0.70) return 'moyenne';
  return 'faible';
}

export function formatResultsTelegram(result: TrackingResult): string {
  const lines: string[] = [];
  const dateLabel = result.date === 'today' ? new Date().toISOString().split('T')[0] : result.date;

  lines.push('╔═══════════════════════════════════════╗');
  lines.push('║                                       ║');
  lines.push('║   📊 <b>TRACKER DE CALIBRATION — RÉSULTATS</b>   ║');
  lines.push(`║   📅 ${dateLabel} (message indicatif)      ║`);
  lines.push('║                                       ║');
  lines.push('╚═══════════════════════════════════════╝');
  lines.push('');

  if (result.matches.length === 0) {
    lines.push(`<i>Aucun match résolu pour ${dateLabel} (0 calibration en attente ou scores pas encore disponibles).</i>`);
    lines.push('');
    lines.push(`<i>📊 Cumul global : ${result.rolling.matches_tracked} match(s) suivi(s).</i>`);
    return lines.join('\n');
  }

  // ---- Détail par match ----
  lines.push('<b>⚽ MATCHS RÉSOLUS</b>');
  lines.push('');
  for (const m of result.matches) {
    const pickIcon = m.model_pick_hit === undefined ? '➖' : m.model_pick_hit ? '✅' : '❌';
    lines.push(`<b>${m.home_team} ${m.final_score.home}-${m.final_score.away} ${m.away_team}</b> ${pickIcon}`);
    lines.push(`   🏆 ${m.league} | MT : ${m.score_ht.home}-${m.score_ht.away}`);
    if (m.brier_model !== undefined) {
      let brierLine = `   📊 Brier recalibré : <b>${m.brier_model.toFixed(3)}</b> (${brierVerdict(m.brier_model)})`;
      if (m.brier_pre_match !== undefined) {
        const delta = m.brier_pre_match - m.brier_model;
        brierLine += ` | vs pre-match : ${m.brier_pre_match.toFixed(3)} (${delta >= 0 ? '📈 recalibration utile +' : '📉 recalibration contre-productive '}${delta.toFixed(3)})`;
      }
      lines.push(brierLine);
    }
    if (m.bets.length > 0) {
      for (const b of m.bets) {
        const icon = b.outcome === 'won' ? '✅' : b.outcome === 'lost' ? '❌' : '➖';
        const profit = b.profit_units >= 0 ? `+${b.profit_units.toFixed(2)}u` : `${b.profit_units.toFixed(2)}u`;
        lines.push(`   ${icon} ${MARKET_LABELS[b.market] || b.market} @${b.bookmaker_odds.toFixed(2)} → <b>${profit}</b>`);
      }
    }
    lines.push('');
  }

  // ---- Stats du jour ----
  const d = result.day;
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`<b>📅 JOURNÉE ${dateLabel}</b>`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`🎯 Pick directionnel : <b>${d.pick_hits}/${d.resolved}</b> corrects (${d.resolved > 0 ? Math.round((d.pick_hits / d.resolved) * 100) : 0}%)`);
  if (d.brier_avg_model !== null) {
    lines.push(`📊 Brier moyen recalibré : <b>${d.brier_avg_model.toFixed(3)}</b> — calibration ${brierVerdict(d.brier_avg_model)}`);
    if (d.brier_avg_pre_match !== null) {
      const delta = d.brier_avg_pre_match - d.brier_avg_model;
      lines.push(`🔬 vs pre-match seul : ${d.brier_avg_pre_match.toFixed(3)} → recalibration ${delta >= 0 ? `<b>utile</b> (-${delta.toFixed(3)})` : `<b>contre-productive</b> (+${Math.abs(delta).toFixed(3)})`}`);
    }
  }
  lines.push(`💎 Value bets : ${d.bets_won}✅ ${d.bets_lost}❌${d.bets_void > 0 ? ` ${d.bets_void}➖` : ''} | P&L : <b>${d.profit_units >= 0 ? '+' : ''}${d.profit_units.toFixed(2)}u</b>${d.roi_pct !== null ? ` (ROI ${d.roi_pct >= 0 ? '+' : ''}${d.roi_pct.toFixed(1)}%)` : ''}`);
  lines.push('');

  // ---- Cumul roulant (LA mesure de fiabilité) ----
  const r = result.rolling;
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('<b>📈 CUMUL GLOBAL (fiabilité empirique)</b>');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`⚽ Matchs suivis : <b>${r.matches_tracked}</b>`);
  if (r.matches_tracked > 0) {
    lines.push(`🎯 Picks corrects : <b>${r.pick_hits}/${r.matches_tracked}</b> (${Math.round((r.pick_hits / r.matches_tracked) * 100)}%)`);
  }
  if (r.avg_brier_model !== null) {
    lines.push(`📊 Brier moyen : <b>${r.avg_brier_model.toFixed(3)}</b> — calibration ${brierVerdict(r.avg_brier_model)}`);
    if (r.avg_brier_pre_match !== null) {
      const wins = r.recalibration_wins;
      const total = r.matches_tracked;
      lines.push(`🔬 Recalibration bat pre-match : <b>${wins}/${total}</b> (${Math.round((wins / total) * 100)}%)`);
    }
  }
  if (r.stakes > 0) {
    lines.push(`💎 Paris : ${r.bets_won}✅ ${r.bets_lost}❌${r.bets_void > 0 ? ` ${r.bets_void}➖` : ''} | P&L cumulé : <b>${r.returns >= 0 ? '+' : ''}${r.returns.toFixed(2)}u</b> | ROI : <b>${r.roi_pct !== null && r.roi_pct >= 0 ? '+' : ''}${r.roi_pct?.toFixed(1)}%</b>`);
  }
  lines.push('');
  lines.push(`<i>ℹ️ Référence Brier : prédire au hasard = 0.667 · bookmaker pro ≈ 0.19-0.22 (sur saison). Simulation en mise fixe 1u aux cotes bookmaker — INDICATIF, pas un conseil de mise.</i>`);

  return lines.join('\n');
}
