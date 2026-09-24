/**
 * Tennis V3 — Persistance Supabase (dégradation gracieuse)
 * Tables : tennis_v3_bets (suivi des picks), tennis_v3_calibration (a/b),
 * tennis_v3_flags (vetos manuels blessure/suspension).
 * Sans Supabase configuré → opérations no-op sûres (comportement mémoire).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { parseCanonical } from './name-utils';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let client: SupabaseClient<any, any, any> | null = null;

function getClient(): SupabaseClient<any, any, any> | null {
  if (!client) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}

export function isPersistenceEnabled(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);
}

// ---------------- flags vetos manuels ----------------

export interface VetoFlag {
  player: string; // clé canonique ou nom libre (matché par surname)
  reason: string;
  until: string; // YYYY-MM-DD
}

const flagCache: { at: number; flags: Record<string, string> } = { at: 0, flags: {} };
const FLAG_TTL = 30 * 60 * 1000; // 30 min

/** Renvoie {playerKey: reason} — {} si Supabase absent ou erreur. */
export async function getManualVetoFlags(): Promise<Record<string, string>> {
  const sb = getClient();
  if (!sb) return {};
  if (flagCache.flags && Date.now() - flagCache.at < FLAG_TTL) return flagCache.flags;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await sb
      .from('tennis_v3_flags')
      .select('player, reason, until')
      .gte('until', today);
    if (error) throw error;
    const flags: Record<string, string> = {};
    for (const row of (data || []) as VetoFlag[]) {
      const key = surnameKeyOf(row.player);
      if (key) flags[key] = 'flag_manuel';
    }
    flagCache.at = Date.now();
    flagCache.flags = flags;
    return flags;
  } catch (e: any) {
    console.error(`[TennisV3] flags indisponibles (${e?.message})`);
    return {};
  }
}

function surnameKeyOf(nameOrKey: string): string {
  // accepte déjà-clé ("alcaraz-c") ou nom libre ("Carlos Alcaraz")
  if (/^[a-z'-]+-[a-z]$/.test(nameOrKey.trim())) return nameOrKey.trim();
  return parseCanonical(nameOrKey).key;
}

// ---------------- suivi des paris ----------------

export interface TrackedBet {
  match_id: string;
  player1: string;
  player2: string;
  tournament: string;
  surface: string;
  round: string;
  match_date: string;
  pick: string; // "player1" | "player2"
  pick_name: string;
  probability: number;
  odds: number;
  edge: number;
  kelly: number;
  tier: string;
  model_version: string;
  result?: 'win' | 'loss' | 'void' | null;
  settled_at?: string | null;
}

/** Enregistre les picks recommandés (fire-and-forget, jamais bloquant). */
export async function saveTrackedBets(bets: TrackedBet[]): Promise<void> {
  const sb = getClient();
  if (!sb || bets.length === 0) return;
  try {
    const { error } = await sb.from('tennis_v3_bets').upsert(bets, { onConflict: 'match_id,pick' });
    if (error) throw error;
    console.log(`[TennisV3] 💾 ${bets.length} picks trackés`);
  } catch (e: any) {
    console.error(`[TennisV3] ⚠️ tracking bets KO (${e?.message})`);
  }
}

/** Récupère les paris non réglés pour settlement. */
export async function getUnsettledBets(): Promise<TrackedBet[]> {
  const sb = getClient();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from('tennis_v3_bets')
      .select('*')
      .is('result', null)
      .order('match_date', { ascending: false })
      .limit(200);
    if (error) throw error;
    return ((data || []) as any[]) as TrackedBet[];
  } catch (e: any) {
    console.error(`[TennisV3] ⚠️ load bets KO (${e?.message})`);
    return [];
  }
}

/** Marque un pari réglé. */
export async function settleBet(matchId: string, pick: string, result: 'win' | 'loss' | 'void'): Promise<void> {
  const sb = getClient();
  if (!sb) return;
  try {
    const { error } = await sb
      .from('tennis_v3_bets')
      .update({ result, settled_at: new Date().toISOString() })
      .match({ match_id: matchId, pick });
    if (error) throw error;
  } catch (e: any) {
    console.error(`[TennisV3] ⚠️ settle KO (${e?.message})`);
  }
}

/** Récupère les paris d'une date donnée (YYYY-MM-DD) — pour le bilan J+1. */
export async function getBetsForDate(matchDate: string): Promise<TrackedBet[]> {
  const sb = getClient();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from('tennis_v3_bets')
      .select('*')
      .eq('match_date', matchDate)
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) throw error;
    return ((data || []) as any[]) as TrackedBet[];
  } catch (e: any) {
    console.error(`[TennisV3] ⚠️ load bets du ${matchDate} KO (${e?.message})`);
    return [];
  }
}

export interface V3OverallStats {
  wins: number;
  losses: number;
  voids: number;
  pending: number;
  settled: number;
  total: number;
  profitUnits: number; // somme des P&L en unités (stake 1u, win → odds-1, loss → -1)
  roi: number; // profitUnits / settled (fraction, ex 0.093 = +9.3%)
  hitRate: number; // wins / (wins + losses) (fraction)
}

/** Statistiques cumulées V3 (jusqu'aux 500 derniers paris trackés). */
export async function getOverallStats(): Promise<V3OverallStats> {
  const empty: V3OverallStats = {
    wins: 0, losses: 0, voids: 0, pending: 0, settled: 0, total: 0,
    profitUnits: 0, roi: 0, hitRate: 0,
  };
  const sb = getClient();
  if (!sb) return empty;
  try {
    const { data, error } = await sb
      .from('tennis_v3_bets')
      .select('result, odds')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    const stats = { ...empty };
    for (const row of (data || []) as any[]) {
      stats.total++;
      const odds = Number(row.odds) || 0;
      if (row.result === 'win') {
        stats.wins++;
        stats.profitUnits += odds > 1 ? odds - 1 : 0;
      } else if (row.result === 'loss') {
        stats.losses++;
        stats.profitUnits -= 1;
      } else if (row.result === 'void') {
        stats.voids++;
      } else {
        stats.pending++;
      }
    }
    stats.settled = stats.wins + stats.losses;
    stats.roi = stats.settled > 0 ? stats.profitUnits / stats.settled : 0;
    stats.hitRate = stats.settled > 0 ? stats.wins / stats.settled : 0;
    return stats;
  } catch (e: any) {
    console.error(`[TennisV3] ⚠️ stats globales KO (${e?.message})`);
    return empty;
  }
}

// ---------------- calibration ----------------

export interface StoredCalibration {
  category: string;
  a: number;
  b: number;
  sample: number;
}

export async function loadCalibration(category: string): Promise<StoredCalibration | null> {
  const sb = getClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('tennis_v3_calibration')
      .select('category, a, b, sample')
      .eq('category', category)
      .maybeSingle();
    if (error) throw error;
    return (data as StoredCalibration) || null;
  } catch {
    return null;
  }
}

/** Mémorise/actualise les paramètres de calibration (backtest/cron futur). */
export async function saveCalibration(category: string, a: number, b: number, sample: number): Promise<void> {
  const sb = getClient();
  if (!sb) return;
  try {
    const { error } = await sb
      .from('tennis_v3_calibration')
      .upsert({ category, a, b, sample, updated_at: new Date().toISOString() }, { onConflict: 'category' });
    if (error) throw error;
  } catch (e: any) {
    console.error(`[TennisV3] ⚠️ save calibration KO (${e?.message})`);
  }
}
