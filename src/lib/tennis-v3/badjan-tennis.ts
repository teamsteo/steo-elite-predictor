/**
 * ═══════════════════════════════════════════════════════════════════
 * BADJAN TENNIS — Section Telegram dédiée (Task 18)
 * ═══════════════════════════════════════════════════════════════════
 * Spécification utilisateur :
 * - Section "Badjan Tennis" : pronostics analysés par le moteur V3
 * - Uniquement les picks 🟢 (≥70% + consensus ≥5/7 + value ≥3% + vetos OK)
 * - Bilan automatique le lendemain (résultats + P&L + cumul V3)
 * - 0 pick → publication silencieuse (design BADJAN, Task 14/16)
 *
 * Fichier volontairement PUR (zéro réseau, zéro DB, zéro import Telegram) :
 * formatage + math du P&L uniquement → testable à 100 %.
 * La publication vit dans /api/cron/tennis-v3 (modes badjan / bilan).
 * ═══════════════════════════════════════════════════════════════════
 */

import type { TrackedBet } from './persistence';

const TELEGRAM_MAX_LENGTH = 4096;
export const BADJAN_TENNIS_MIN_PROB = 0.70;   // 🟢 ≥70 %
export const BADJAN_TENNIS_MIN_CONSENSUS = 5; // ≥5/7
export const BADJAN_TENNIS_MIN_EDGE = 0.03;   // value ≥3 %

/** Champs strictement nécessaires au formatage (découplé du moteur). */
export interface BadjanTennisPick {
  player1: string;
  player2: string;
  tournament: string;
  surface: string;
  round: string;
  date: string; // ISO
  pickName: string;
  odds: number;
  probability: number; // 0-1 (côté pick)
  edge: number | null; // fraction (ex 0.062)
  kelly: number | null; // fraction (ex 0.021)
  odds1: number;
  odds2: number;
}

function esc(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtDateFr(iso: string): { date: string; time: string } {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { date: '', time: '' };
    const date = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const hasTime = d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
    const time = hasTime
      ? `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`
      : '';
    return { date, time };
  } catch {
    return { date: '', time: '' };
  }
}

/** Bloc individuel d'un pick (utilisé seul ou assemblé). */
function pickBlock(p: BadjanTennisPick, index: number): string {
  const { date, time } = fmtDateFr(p.date);
  const prob = Math.round((p.probability || 0) * 100);
  const edge = p.edge != null ? `+${(p.edge * 100).toFixed(1)}%` : '—';
  const kelly = p.kelly != null ? `${(p.kelly * 100).toFixed(1)}%` : '—';
  const lines = [
    `<b>${index + 1}. ${esc(p.player1)} vs ${esc(p.player2)}</b>`,
  ];
  const when = [`📅 ${date}`, time ? `  ·  ⏰ ${time}` : ''].join('');
  if (date) lines.push(when);
  if (p.tournament) lines.push(`🏆 ${esc(p.tournament)} · ${esc(p.surface || '—')} · ${esc(p.round || '—')}`);
  if (p.odds1 > 0 && p.odds2 > 0) lines.push(`📊 Cotes: 1:<b>${p.odds1.toFixed(2)}</b>  2:<b>${p.odds2.toFixed(2)}</b>`);
  lines.push(`🎯 Pari: <b>${esc(p.pickName)} @ ${p.odds.toFixed(2)}</b>`);
  lines.push(`💥 Modèle: <b>${prob}%</b> · Risque: <b>${100 - prob}%</b>`);
  lines.push(`💰 Edge: <b>${edge}</b> · Kelly: <b>${kelly}</b>`);
  return lines.join('\n');
}

/**
 * Message BADJAN Tennis (picks 🟢 du jour).
 * Retourne '' si picks vide → l'appelant reste silencieux (design BADJAN).
 */
export function formatBadjanTennisMessage(picks: BadjanTennisPick[], headerDate?: string): string {
  if (!picks || picks.length === 0) return '';
  const dateStr =
    headerDate ||
    new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  let message = '';
  message += '╔════════════════════════╗\n';
  message += `║ 🎾 <b>BADJAN TENNIS — V3</b> ║\n`;
  message += '╚════════════════════════╝\n\n';
  message += `✅ <b>${picks.length} pick${picks.length > 1 ? 's' : ''}</b> — ${dateStr}\n`;
  message += `🟢 Confiance ≥ ${BADJAN_TENNIS_MIN_PROB * 100}% · consensus ≥ ${BADJAN_TENNIS_MIN_CONSENSUS}/7 · value ≥ ${BADJAN_TENNIS_MIN_EDGE * 100}%\n\n`;

  for (let i = 0; i < picks.length; i++) {
    message += '━━━━━━━━━━━━━━━━━━━━━\n';
    message += pickBlock(picks[i], i);
    message += '\n\n';
  }

  message += '━━━━━━━━━━━━━━━━━━━━━\n';
  message += `🎾 <b>Badjan Tennis</b> — moteur V3 (Elo tennis-data 5 ans + 7 facteurs + vetos).\n`;
  message += `Bilan automatique demain. Pariez responsable.`;

  if (message.length > TELEGRAM_MAX_LENGTH) {
    // Filet de sécurité : picks stricts ⇒ très rare ; on coupe le footer si besoin
    message = message.slice(0, TELEGRAM_MAX_LENGTH - 1);
  }
  return message;
}

// ═══════════════════════════════════════════════════════════════════
// BILAN J+1
// ═══════════════════════════════════════════════════════════════════

export interface DayPnl {
  wins: number;
  losses: number;
  voids: number;
  pending: number;
  profit: number; // unités
}

/** P&L du jour : stake 1u — win → +(odds-1), loss → -1, void/pending → 0. */
export function computeDayPnl(bets: TrackedBet[]): DayPnl {
  const pnl: DayPnl = { wins: 0, losses: 0, voids: 0, pending: 0, profit: 0 };
  for (const b of bets || []) {
    const odds = Number(b.odds) || 0;
    if (b.result === 'win') {
      pnl.wins++;
      pnl.profit += odds > 1 ? odds - 1 : 0;
    } else if (b.result === 'loss') {
      pnl.losses++;
      pnl.profit -= 1;
    } else if (b.result === 'void') {
      pnl.voids++;
    } else {
      pnl.pending++;
    }
  }
  return pnl;
}

/**
 * Message bilan du lendemain.
 * Retourne '' si aucun pari tracké ce jour → l'appelant reste silencieux.
 */
export function formatBilanMessage(
  bets: TrackedBet[],
  overall: { wins: number; losses: number; profitUnits: number; roi: number; settled: number },
  targetDateFr?: string
): string {
  if (!bets || bets.length === 0) return '';
  const day = computeDayPnl(bets);

  // date cible = match_date du premier pari (source de vérité), fallback hier
  const dateStr =
    targetDateFr ||
    (() => {
      const d = bets[0]?.match_date ? new Date(`${bets[0].match_date}T12:00:00Z`) : new Date(Date.now() - 86400000);
      return isNaN(d.getTime())
        ? ''
        : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    })();

  let message = '';
  message += '╔════════════════════════╗\n';
  message += `║ 🎾 <b>BADJAN TENNIS — BILAN</b> ║\n`;
  message += '╚════════════════════════╝\n\n';
  message += `📅 Résultats du <b>${dateStr}</b>\n\n`;

  for (const b of bets) {
    const odds = Number(b.odds) || 0;
    const icon =
      b.result === 'win' ? '✅' : b.result === 'loss' ? '❌' : b.result === 'void' ? '➖' : '⏳';
    const label =
      b.result === 'win'
        ? `GAGNÉ (+${(odds - 1).toFixed(2)}u)`
        : b.result === 'loss'
          ? 'PERDU (-1u)'
          : b.result === 'void'
            ? 'ANNULÉ (0u)'
            : 'en attente';
    message += `${icon} <b>${esc(b.player1)} vs ${esc(b.player2)}</b>\n`;
    message += `   Pick ${esc(b.pick_name || b.pick)} @ ${odds.toFixed(2)} → <b>${label}</b>\n`;
    if (b.result !== 'win' && b.result !== 'loss' && b.result !== 'void') {
      message += `   <i>(match du ${b.match_date} pas encore dans la base — réglé au prochain bilan)</i>\n`;
    }
  }

  message += '\n━━━━━━━━━━━━━━━━━━━━━\n';
  const daySettled = day.wins + day.losses;
  message += `📊 Journée: <b>${day.wins}✅ ${day.losses}❌</b>`;
  if (day.pending > 0) message += ` · ${day.pending}⏳`;
  if (day.voids > 0) message += ` · ${day.voids}➖`;
  message += ` · P&amp;L: <b>${day.profit >= 0 ? '+' : ''}${day.profit.toFixed(2)}u</b>`;
  if (daySettled > 0) message += ` · ROI: <b>${((day.profit / daySettled) * 100).toFixed(1)}%</b>`;
  message += '\n';

  if (overall && overall.settled > 0) {
    message += `📈 Cumul V3: <b>${overall.wins}✅ ${overall.losses}❌</b> (${((overall.wins / overall.settled) * 100).toFixed(1)}%)`;
    message += ` · ROI: <b>${overall.roi >= 0 ? '+' : ''}${(overall.roi * 100).toFixed(1)}%</b>`;
    message += ` · ${overall.settled} pari${overall.settled > 1 ? 's' : ''} réglé${overall.settled > 1 ? 's' : ''}\n`;
  } else {
    message += `📈 Cumul V3: premiers résultats en cours de collecte.\n`;
  }
  message += '\n🎾 <b>Badjan Tennis</b> — bilan automatique J+1 (settlement tennis-data). Pariez responsable.';

  if (message.length > TELEGRAM_MAX_LENGTH) {
    message = message.slice(0, TELEGRAM_MAX_LENGTH - 1);
  }
  return message;
}
