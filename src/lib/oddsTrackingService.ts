/**
 * Odds Tracking Service — Zero-Cost Odds Tracking
 * 
 * Tracks odds movements using data already fetched from ESPN.
 * No additional API calls required — reuses combinedDataService data.
 * 
 * Features:
 * - Save odds snapshots (max 5/match/day, skip if unchanged ±0.01)
 * - Detect steam moves (>3% change in 6h → moderate/significant/steam)
 * - Calculate Closing Line Value (CLV): positive = market agrees with pick
 * - Cleanup old snapshots (>7 days)
 * 
 * Requires Supabase table `odds_history` (create with schema below):
 * CREATE TABLE odds_history (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   match_id text NOT NULL,
 *   sport text,
 *   home_team text,
 *   away_team text,
 *   odds_home numeric(5,2),
 *   odds_draw numeric(5,2),
 *   odds_away numeric(5,2),
 *   snapshot_source text DEFAULT 'espn',
 *   recorded_at timestamptz DEFAULT now(),
 *   created_at timestamptz DEFAULT now()
 * );
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabaseClient: any = null;

function getSupabase() {
  if (!supabaseClient && SUPABASE_URL && SUPABASE_KEY) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseClient;
}

// ============================================
// TYPES
// ============================================

export interface OddsSnapshot {
  matchId: string;
  sport?: string;
  homeTeam?: string;
  awayTeam?: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  snapshotSource?: string;
}

export interface SteamMove {
  matchId: string;
  homeTeam?: string;
  awayTeam?: string;
  direction: 'home' | 'away';       // which side the steam moved toward
  changePercent: number;             // e.g., 4.5 = 4.5%
  severity: 'moderate' | 'significant' | 'steam';
  timeSpanHours: number;
  oldOdds: number;
  newOdds: number;
}

export interface CLVResult {
  matchId: string;
  homeTeam?: string;
  awayTeam?: string;
  openingOddsHome: number;
  openingOddsAway: number;
  currentOddsHome: number;
  currentOddsAway: number;
  clvHome: number;    // positive = odds dropped (market agrees with home pick)
  clvAway: number;    // positive = odds dropped (market agrees with away pick)
  interpretation: string;
}

export interface TrackingResult {
  snapshotsSaved: number;
  steamMoves: SteamMove[];
  clvResults: CLVResult[];
}

// ============================================
// CONSTANTS
// ============================================

const MAX_SNAPSHOTS_PER_MATCH_PER_DAY = 5;
const ODDS_CHANGE_TOLERANCE = 0.01;     // Skip if odds changed less than this
const STEAM_MOVE_THRESHOLD = 0.03;      // 3% minimum for steam move detection
const STEAM_MOVE_LOOKBACK_HOURS = 6;    // Look back 6h for steam detection
const SNAPSHOT_MAX_AGE_DAYS = 7;        // Delete snapshots older than this

// ============================================
// SAVE ODDS SNAPSHOTS
// ============================================

export async function saveOddsSnapshots(snapshots: OddsSnapshot[]): Promise<number> {
  const sb = getSupabase();
  if (!sb || snapshots.length === 0) return 0;
  
  let saved = 0;
  
  for (const snap of snapshots) {
    if (!snap.matchId || snap.oddsHome <= 0 || snap.oddsAway <= 0) continue;
    
    try {
      // Check existing snapshots for this match today
      const today = new Date().toISOString().split('T')[0];
      const { data: existing, error: fetchError } = await sb
        .from('odds_history')
        .select('id, odds_home, odds_away')
        .eq('match_id', snap.matchId)
        .gte('recorded_at', `${today}T00:00:00Z`)
        .order('recorded_at', { ascending: false })
        .limit(MAX_SNAPSHOTS_PER_MATCH_PER_DAY);
      
      if (fetchError) continue;
      
      // Check if odds changed significantly vs last snapshot
      if (existing && existing.length > 0) {
        const last = existing[0];
        const homeDiff = Math.abs((last.odds_home || 0) - snap.oddsHome);
        const awayDiff = Math.abs((last.odds_away || 0) - snap.oddsAway);
        
        if (homeDiff < ODDS_CHANGE_TOLERANCE && awayDiff < ODDS_CHANGE_TOLERANCE) {
          continue; // No significant change, skip
        }
        
        // Check max snapshots limit
        if (existing.length >= MAX_SNAPSHOTS_PER_MATCH_PER_DAY) {
          continue; // Already at max for today
        }
      }
      
      // Insert new snapshot
      const { error: insertError } = await sb.from('odds_history').insert({
        match_id: snap.matchId,
        sport: snap.sport || null,
        home_team: snap.homeTeam || null,
        away_team: snap.awayTeam || null,
        odds_home: snap.oddsHome,
        odds_draw: snap.oddsDraw,
        odds_away: snap.oddsAway,
        snapshot_source: snap.snapshotSource || 'espn',
      });
      
      if (!insertError) saved++;
    } catch {
      // Non-blocking: skip individual failures
    }
  }
  
  return saved;
}

// ============================================
// DETECT STEAM MOVES
// ============================================

export async function detectSteamMoves(matchIds?: string[]): Promise<SteamMove[]> {
  const sb = getSupabase();
  if (!sb) return [];
  
  try {
    const lookbackTime = new Date();
    lookbackTime.setHours(lookbackTime.getHours() - STEAM_MOVE_LOOKBACK_HOURS);
    
    let query = sb
      .from('odds_history')
      .select('match_id, home_team, away_team, odds_home, odds_away, recorded_at')
      .gte('recorded_at', lookbackTime.toISOString())
      .order('match_id, recorded_at', { ascending: true });
    
    const { data, error } = await query;
    if (error || !data || data.length === 0) return [];
    
    // Filter by match IDs if provided
    const relevant = matchIds
      ? data.filter((s: any) => matchIds.includes(s.match_id))
      : data;
    
    // Group by match
    const byMatch = new Map<string, any[]>();
    for (const snap of relevant) {
      const existing = byMatch.get(snap.match_id) || [];
      existing.push(snap);
      byMatch.set(snap.match_id, existing);
    }
    
    const steamMoves: SteamMove[] = [];
    
    for (const [matchId, snaps] of byMatch) {
      if (snaps.length < 2) continue;
      
      const oldest = snaps[0];
      const newest = snaps[snaps.length - 1];
      
      // Home odds change
      const homeChange = ((oldest.odds_home || 2.0) - (newest.odds_home || 2.0)) / (oldest.odds_home || 2.0) * 100;
      // Away odds change
      const awayChange = ((oldest.odds_away || 2.0) - (newest.odds_away || 2.0)) / (oldest.odds_away || 2.0) * 100;
      
      // Determine direction and magnitude
      const homeAbs = Math.abs(homeChange);
      const awayAbs = Math.abs(awayChange);
      const maxChange = Math.max(homeAbs, awayAbs);
      
      if (maxChange < STEAM_MOVE_THRESHOLD * 100) continue; // Convert threshold to %
      if (maxChange < 3) continue; // Minimum 3%
      
      // Determine severity
      let severity: 'moderate' | 'significant' | 'steam';
      if (maxChange > 8) severity = 'steam';
      else if (maxChange > 5) severity = 'significant';
      else severity = 'moderate';
      
      // Direction: positive homeChange = odds dropped = money on home
      const direction = homeAbs >= awayAbs
        ? (homeChange > 0 ? 'home' : 'away')
        : (awayChange > 0 ? 'away' : 'home');
      
      const changePercent = direction === 'home' ? homeAbs : awayAbs;
      
      // Time span
      const oldestTime = new Date(oldest.recorded_at).getTime();
      const newestTime = new Date(newest.recorded_at).getTime();
      const timeSpanHours = Math.max(0.5, (newestTime - oldestTime) / (1000 * 60 * 60));
      
      steamMoves.push({
        matchId,
        homeTeam: oldest.home_team,
        awayTeam: oldest.away_team,
        direction,
        changePercent: Math.round(changePercent * 10) / 10,
        severity,
        timeSpanHours: Math.round(timeSpanHours * 10) / 10,
        oldOdds: direction === 'home' ? (oldest.odds_home || 0) : (oldest.odds_away || 0),
        newOdds: direction === 'home' ? (newest.odds_home || 0) : (newest.odds_away || 0),
      });
    }
    
    return steamMoves;
  } catch {
    return [];
  }
}

// ============================================
// CALCULATE LIVE CLV
// ============================================

export async function calculateLiveCLV(matchIds?: string[]): Promise<CLVResult[]> {
  const sb = getSupabase();
  if (!sb) return [];
  
  try {
    // Get opening odds (earliest snapshot per match)
    // and current odds (latest snapshot per match)
    const { data, error } = await sb
      .from('odds_history')
      .select('match_id, home_team, away_team, odds_home, odds_away, recorded_at')
      .order('match_id, recorded_at', { ascending: true });
    
    if (error || !data || data.length === 0) return [];
    
    const relevant = matchIds
      ? data.filter((s: any) => matchIds.includes(s.match_id))
      : data;
    
    // Group by match
    const byMatch = new Map<string, any[]>();
    for (const snap of relevant) {
      const existing = byMatch.get(snap.match_id) || [];
      existing.push(snap);
      byMatch.set(snap.match_id, existing);
    }
    
    const results: CLVResult[] = [];
    
    for (const [matchId, snaps] of byMatch) {
      if (snaps.length < 1) continue;
      
      const opening = snaps[0];
      const closing = snaps[snaps.length - 1];
      
      // CLV = opening odds - closing odds (positive = odds dropped = value)
      const clvHome = Math.round(((opening.odds_home || 2) - (closing.odds_home || 2)) * 1000) / 1000;
      const clvAway = Math.round(((opening.odds_away || 2) - (closing.odds_away || 2)) * 1000) / 1000;
      
      // Interpretation
      let interpretation: string;
      if (clvHome > 0.1 && clvAway < -0.1) {
        interpretation = 'Marché confirme le favori home';
      } else if (clvAway > 0.1 && clvHome < -0.1) {
        interpretation = 'Marché confirme le favori away';
      } else if (Math.abs(clvHome) < 0.05 && Math.abs(clvAway) < 0.05) {
        interpretation = 'Marché stable';
      } else {
        interpretation = 'Mouvement modéré';
      }
      
      results.push({
        matchId,
        homeTeam: opening.home_team,
        awayTeam: opening.away_team,
        openingOddsHome: opening.odds_home,
        openingOddsAway: opening.odds_away,
        currentOddsHome: closing.odds_home,
        currentOddsAway: closing.odds_away,
        clvHome,
        clvAway,
        interpretation,
      });
    }
    
    return results;
  } catch {
    return [];
  }
}

// ============================================
// CLEANUP OLD SNAPSHOTS
// ============================================

export async function cleanupOldSnapshots(): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;
  
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - SNAPSHOT_MAX_AGE_DAYS);
    
    const { data, error } = await sb
      .from('odds_history')
      .select('id')
      .lt('recorded_at', cutoff.toISOString());
    
    if (error || !data || data.length === 0) return 0;
    
    const ids = data.map((r: any) => r.id);
    
    const { error: deleteError } = await sb
      .from('odds_history')
      .delete()
      .in('id', ids);
    
    return deleteError ? 0 : ids.length;
  } catch {
    return 0;
  }
}

// ============================================
// CRON HELPER — All-in-one tracking
// ============================================

export async function trackOddsForToday(
  matches: Array<{
    matchId?: string;
    id?: string;
    sport?: string;
    homeTeam?: string;
    awayTeam?: string;
    oddsHome?: number;
    oddsDraw?: number | null;
    oddsAway?: number;
  }>
): Promise<TrackingResult> {
  const matchId = '';
  
  // Build snapshots from current match odds
  const snapshots: OddsSnapshot[] = matches
    .filter(m => {
      const mid = m.matchId || m.id;
      return mid && (m.oddsHome || 0) > 0 && (m.oddsAway || 0) > 0;
    })
    .map(m => ({
      matchId: m.matchId || m.id || '',
      sport: m.sport,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      oddsHome: m.oddsHome || 0,
      oddsDraw: m.oddsDraw || null,
      oddsAway: m.oddsAway || 0,
      snapshotSource: 'espn',
    }));
  
  // Save snapshots (non-blocking)
  const snapshotsSaved = await saveOddsSnapshots(snapshots);
  
  // Detect steam moves (only for matches with new snapshots)
  const matchIds = snapshots.map(s => s.matchId).filter(Boolean);
  const steamMoves = await detectSteamMoves(matchIds.length > 0 ? matchIds : undefined);
  
  // Calculate CLV
  const clvResults = await calculateLiveCLV(matchIds.length > 0 ? matchIds : undefined);
  
  // Cleanup old snapshots (run occasionally)
  if (Math.random() < 0.1) { // 10% chance per run
    cleanupOldSnapshots().catch(() => {});
  }
  
  return { snapshotsSaved, steamMoves, clvResults };
}
