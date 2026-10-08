/**
 * Coupon Ticket Service — Task 37
 * ================================
 * Dérive un "coupon de paris" visuel (style app bookmaker) depuis les legs
 * RÉELS du combiné publié chaque matin par le bot combo (is_combo=true en DB).
 *
 * Principes d'honnêteté (non négociables):
 *  - Les sélections/cotes = les legs combo RÉELLEMENT publiées (historique canal vérifiable)
 *  - Le statut Gagné/Perdu vient des vérifications de résultats réelles (result_match)
 *  - Les pertes sont publiées comme les gains
 *
 * Sans nouvelle table: dérivation DÉTERMINISTE
 *  - Coupon du jour = premier combo créé ce jour (combo_id au created_at le plus ancien)
 *  - Résultat = même dérivation sur les jours précédents (les legs ne changent pas:
 *    odds figées à la création; seuls status/scores/result_match évoluent)
 *  - Leg bloquée (pending > 36h après match_date, aucun résultat vérifiable) → VOID
 *    (règle bookmaker: événement non résoluble = remboursé, JAMAIS compté perdu —
 *    on ne publie jamais une fausse défaite)
 */

import { SupabaseStore, type DbPrediction } from './db-supabase';

// ─── Types de vue (consommés par le renderer) ───────────────────────────────

export interface CouponLegView {
  sport: string;
  pickLabel: string;
  marketLabel: string;
  odds: number;
  legStatus: 'won' | 'lost' | 'pending';
  timeLabel: string;
  teams: { name: string; score: number | null; dimmed: boolean }[];
}

export interface CouponView {
  status: 'won' | 'lost' | 'pending';
  legs: CouponLegView[];
  totalOdds: number;
  stake: number;
  gains: number;
  combinedProb: number;
  comboId: string;
  dateISO: string;
  unresolvedLegs: number;
}

// ─── Constantes ─────────────────────────────────────────────────────────────

/** Mise minimale (F CFA) */
export const MIN_STAKE = 25000;
/** Une leg pending plus de STALL_H heures après l'heure de match = VOID (résultat non vérifiable) */
const STALL_HOURS = 36;
/** Fuseau d'affichage (audience principale) */
const TZ = 'Africa/Abidjan';

// ─── Utilitaires ────────────────────────────────────────────────────────────

/** 25000 → "25 000 F" */
export function formatFcfa(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} F`;
}

/** 2.48 → "2,48" */
export function formatOdds(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

/** Heure d'un ISO en fuseau audience: "07:02" */
function timeInTz(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

/** "Hier 07:02" / "Aujourd'hui 06:45" / "Lun 13:38" relatif à now */
export function relativeTimeLabel(iso: string, now: Date): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dayOf = (x: Date) => fmt.format(x);
  const today = dayOf(now);
  const yesterday = dayOf(new Date(now.getTime() - 86400000));
  const label = dayOf(d);
  const hhmm = timeInTz(iso);
  if (label === today) return `Aujourd'hui ${hhmm}`;
  if (label === yesterday) return `Hier ${hhmm}`;
  const wd = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'short' }).format(d);
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${hhmm}`;
}

function legOdds(leg: DbPrediction): number {
  if (leg.predicted_result === 'home') return leg.odds_home || 0;
  if (leg.predicted_result === 'away') return leg.odds_away || 0;
  if (leg.predicted_result === 'draw') return leg.odds_draw || 0;
  return 0;
}

function marketLabel(_sport: string, predicted: string): string {
  if (predicted === 'over' || predicted === 'under') return 'Total de points';
  if (predicted === 'btts_yes') return 'Les deux équipes marquent — Oui';
  if (predicted === 'btts_no') return 'Les deux équipes marquent — Non';
  return 'Vainqueur du match';
}

function pickLabelOf(leg: DbPrediction): string {
  switch (leg.predicted_result) {
    case 'home': return leg.home_team;
    case 'away': return leg.away_team;
    case 'draw': return 'Nul';
    case 'over': return 'Over';
    case 'under': return 'Under';
    case 'btts_yes': return 'Oui';
    case 'btts_no': return 'Non';
    default: return leg.predicted_result;
  }
}

function legWinProb(leg: DbPrediction): number {
  const rp = typeof leg.risk_percentage === 'number' ? leg.risk_percentage : 50;
  return Math.min(0.97, Math.max(0.05, (100 - rp) / 100));
}

// ─── Lecture des combos ─────────────────────────────────────────────────────

/**
 * Legs du PREMIER combo publié à la date donnée (created_at).
 * Retourne [] si aucun combo ce jour-là.
 */
export async function getEarliestComboLegs(dateISO: string): Promise<DbPrediction[]> {
  const { data } = await SupabaseStore.queryPredictions({
    gte_created: `${dateISO}T00:00:00Z`,
    lte_created: `${dateISO}T23:59:59Z`,
  });
  const comboLegs = (data || []).filter(p => p.is_combo === true && !!p.combo_id);
  if (comboLegs.length === 0) return [];

  // Grouper par combo_id, trier les groupes par created_at minimal
  const groups = new Map<string, DbPrediction[]>();
  for (const leg of comboLegs) {
    const arr = groups.get(leg.combo_id!) || [];
    arr.push(leg);
    groups.set(leg.combo_id!, arr);
  }
  const sorted = [...groups.entries()].sort((a, b) => {
    const minA = a[1].reduce((m, l) => Math.min(m, new Date(l.created_at || 0).getTime()), Infinity);
    const minB = b[1].reduce((m, l) => Math.min(m, new Date(l.created_at || 0).getTime()), Infinity);
    return minA - minB;
  });
  // Legs triées par created_at (ordre de publication)
  return sorted[0][1].sort((a, b) =>
    new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
}

// ─── Résolution du ticket ───────────────────────────────────────────────────

export interface TicketResolution {
  status: 'won' | 'lost' | 'pending' | 'unresolved';
  stalledLegs: number;
  voidLegs: number;
  effectiveOdds: number;
  combinedProb: number;
}

/**
 * Règles (alignées bookmaker):
 *  - leg completed + result_match=false → ticket PERDU
 *  - leg pending au-delà de 36h après match_date (aucun résultat vérifiable) → VOID
 *    (cote comptée 1.0 — comme chez Betclic quand un événement est annulé:
 *    JAMAIS comptée perdue, on ne publie pas de fausse défaite)
 *  - leg cancelled/postponed → VOID (cote comptée 1.0, neutre)
 *  - toutes les autres gagnées (ou void) → GAGNÉ (cote effective = produit des cotes non-void)
 *  - au moins une leg pending "vivante" → UNRESOLVED (on ne publie rien)
 *  - TOUTES les legs void → UNRESOLVED (rien publier: ni faux gain ni fausse perte)
 */
export function resolveTicket(legs: DbPrediction[], now: Date = new Date()): TicketResolution {
  let stalledLegs = 0;
  let voidLegs = 0;
  let effectiveOdds = 1;
  let combinedProb = 1;
  let anyFalse = false;
  let anyLivePending = false;

  for (const leg of legs) {
    const odds = legOdds(leg) || 1;
    combinedProb *= legWinProb(leg);

    if (leg.status === 'cancelled' || leg.status === 'postponed') {
      voidLegs++;
      continue; // cote comptée 1.0
    }

    const matchTs = new Date(leg.match_date || 0).getTime();
    const stalled = leg.status === 'pending' && matchTs > 0 && matchTs < now.getTime() - STALL_HOURS * 3600000;

    if (leg.status === 'completed') {
      if (leg.result_match === true) effectiveOdds *= odds;
      else { anyFalse = true; }
    } else if (stalled) {
      // Résultat jamais publié par les sources → VOID (remboursé), PAS perdu
      stalledLegs++;
      voidLegs++;
    } else if (leg.status === 'pending') {
      anyLivePending = true;
    }
  }

  let status: TicketResolution['status'];
  if (anyFalse) status = 'lost';
  else if (anyLivePending) status = 'unresolved';
  else if (voidLegs > 0 && voidLegs === legs.length) status = 'unresolved'; // tout void → rien publier
  else status = 'won';

  return {
    status,
    stalledLegs,
    voidLegs,
    effectiveOdds: Math.round(effectiveOdds * 100) / 100,
    combinedProb: Math.round(combinedProb * 1000) / 1000,
  };
}

// ─── Palier de mise ─────────────────────────────────────────────────────────

/** Mise selon la probabilité combinée du ticket (min 25 000 F) */
export function computeStake(combinedProb: number): number {
  if (combinedProb >= 0.80) return 75000;
  if (combinedProb >= 0.72) return 50000;
  return MIN_STAKE;
}

// ─── Vue de rendu ───────────────────────────────────────────────────────────

function legView(leg: DbPrediction, now: Date): CouponLegView {
  const odds = legOdds(leg);
  const resolved = leg.status === 'completed' || leg.status === 'cancelled' || leg.status === 'postponed';
  const stalled = leg.status === 'pending'
    && new Date(leg.match_date || 0).getTime() < now.getTime() - STALL_HOURS * 3600000;
  const legStatus: 'won' | 'lost' | 'pending' =
    leg.status === 'completed' ? (leg.result_match === true ? 'won' : 'lost')
    : (leg.status === 'cancelled' || leg.status === 'postponed') ? 'pending'
    : stalled ? 'pending' // void: rendue comme non jouée (⏳/↩️ en légende)
    : 'pending';

  // Équipes + scores (match terminé) — vainqueur en blanc, perdant grisé
  const hasScores = typeof leg.home_score === 'number' && typeof leg.away_score === 'number';
  const homeWon = hasScores && (leg.home_score as number) > (leg.away_score as number);
  const awayWon = hasScores && (leg.away_score as number) > (leg.home_score as number);

  return {
    sport: leg.sport,
    pickLabel: pickLabelOf(leg),
    marketLabel: marketLabel(leg.sport, leg.predicted_result),
    odds,
    legStatus,
    timeLabel: relativeTimeLabel(leg.match_date, now),
    teams: [
      { name: leg.home_team, score: hasScores ? (leg.home_score as number) : null, dimmed: resolved && hasScores ? !homeWon && !awayWon ? false : awayWon : false },
      { name: leg.away_team, score: hasScores ? (leg.away_score as number) : null, dimmed: resolved && hasScores ? homeWon || !awayWon ? homeWon : false : false },
    ],
  };
}

/**
 * Construit la vue complète du coupon d'une date.
 * status 'pending' = ticket du jour (en jeu), 'won'/'lost' = résultat.
 * Retourne null si aucune leg / statut non publiable.
 */
export async function buildCouponView(
  dateISO: string,
  forceMode?: 'won' | 'lost' | 'pending'
): Promise<CouponView | null> {
  const now = new Date();
  const legs = await getEarliestComboLegs(dateISO);
  if (legs.length === 0) return null;

  const resolution = resolveTicket(legs, now);
  const status: CouponView['status'] =
    forceMode ?? (resolution.status === 'unresolved' ? 'pending' : resolution.status);

  // Ticket du jour non encore jouable en image résultat → mode pending
  const unresolvedLegs = legs.filter(l => {
    if (l.status === 'pending') {
      const stalled = new Date(l.match_date || 0).getTime() < now.getTime() - STALL_HOURS * 3600000;
      return !stalled && l.status === 'pending';
    }
    return false;
  }).length;

  const view: CouponView = {
    status,
    legs: legs.map(l => legView(l, now)),
    // Ticket gagné: cote effective (legs void comptées 1.0, comme en boutique)
    // Ticket perdu/en jeu: cote totale d'origine
    totalOdds: Math.round((status === 'won' ? resolution.effectiveOdds
      : legs.reduce((acc, l) => acc * (legOdds(l) || 1), 1)) * 100) / 100,
    stake: computeStake(resolution.combinedProb),
    gains: 0,
    combinedProb: resolution.combinedProb,
    comboId: legs[0]?.combo_id || '',
    dateISO,
    unresolvedLegs,
  };

  if (status === 'won') {
    view.gains = Math.round(view.stake * resolution.effectiveOdds);
  } else if (status === 'lost') {
    view.gains = 0;
  } else {
    view.gains = Math.round(view.stake * view.totalOdds); // gain potentiel
  }

  return view;
}

// ─── Légendes Telegram ──────────────────────────────────────────────────────

export function couponCaption(view: CouponView): string {
  if (view.status === 'pending') {
    return [
      `🎟️ <b>COMBINÉ DU JOUR</b> — ${view.legs.length} sélections`,
      `${view.legs.map(l => `• ${l.pickLabel} @${formatOdds(l.odds)}`).join('\n')}`,
      `🎯 Cote totale <b>${formatOdds(view.totalOdds)}</b> · Mise <b>${formatFcfa(view.stake)}</b>`,
      `💰 Gain potentiel: <b>${formatFcfa(view.gains)}</b>`,
      `⏳ Résultat au bilan de demain — gains et pertes publiés.`,
    ].join('\n');
  }
  if (view.status === 'won') {
    return [
      `✅ <b>COMBINÉ GAGNÉ</b> (+${formatFcfa(view.gains - view.stake)} net)`,
      `${view.legs.map(l => `${l.legStatus === 'won' ? '✅' : '↩️'} ${l.pickLabel} @${formatOdds(l.odds)}`).join('\n')}`,
      `🎯 Cote ${formatOdds(view.totalOdds)} · Mise ${formatFcfa(view.stake)} → <b>${formatFcfa(view.gains)}</b>`,
      `📊 Pronos BADJAN — les gains comme les pertes, toujours vérifiés.`,
    ].join('\n');
  }
  return [
    `❌ <b>COMBINÉ PERDU</b> (−${formatFcfa(view.stake)})`,
    `${view.legs.map(l => `${l.legStatus === 'won' ? '✅' : l.legStatus === 'lost' ? '❌' : '⏳'} ${l.pickLabel} @${formatOdds(l.odds)}`).join('\n')}`,
    `🎯 Cote ${formatOdds(view.totalOdds)} · Mise ${formatFcfa(view.stake)} → 0 F`,
    `📊 On assume: demain on revient plus fort. Transparence totale.`,
  ].join('\n');
}
