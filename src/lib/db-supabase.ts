/**
 * Service de stockage Supabase pour les pronostics
 * Utilise la base Historique ML (déjà configurée)
 * Une seule base pour : ML training + Prédictions quotidiennes + Stats
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Configuration Supabase - Base Historique ML
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// Type générique pour Supabase
type GenericSupabaseClient = SupabaseClient<any, any, any>;

// Client Supabase singleton
let supabaseClient: GenericSupabaseClient | null = null;

/**
 * Obtient le client Supabase (Base Historique ML)
 */
function getSupabase(): GenericSupabaseClient | null {
  if (!supabaseClient) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.warn('⚠️ Supabase non configuré - vérifiez NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY');
      return null;
    }
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return supabaseClient;
}

// ============================================
// TYPES
// ============================================

export interface DbPrediction {
  id?: string;
  match_id: string;
  home_team: string;
  away_team: string;
  league: string;
  sport: 'football' | 'basketball' | 'baseball' | 'hockey' | 'tennis' | 'other';
  match_date: string;
  season?: string;
  
  odds_home: number;
  odds_draw: number | null;
  odds_away: number;
  
  predicted_result: 'home' | 'draw' | 'away' | 'over' | 'under' | 'btts_yes' | 'btts_no' | 'avoid';
  predicted_goals?: string;
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  risk_percentage: number;
  
  home_score?: number;
  away_score?: number;
  total_goals?: number;
  actual_result?: 'home' | 'draw' | 'away' | 'over' | 'under' | 'btts_yes' | 'btts_no' | 'avoid';
  
  status: 'pending' | 'completed' | 'cancelled' | 'postponed';
  result_match?: boolean;
  goals_match?: boolean;
  
  source?: string;
  ml_model_version?: string;
  features?: any;
  model_confidence?: number;
  
  created_at?: string;
  checked_at?: string;
}

export interface DbDailyStats {
  id?: string;
  date: string;
  total_predictions: number;
  completed: number;
  wins: number;
  losses: number;
  win_rate: number;
  football_total: number;
  football_wins: number;
  football_win_rate: number;
  basketball_total: number;
  basketball_wins: number;
  basketball_win_rate: number;
  hockey_total: number;
  hockey_wins: number;
  hockey_win_rate: number;
}

// ============================================
// UTILITAIRES
// ============================================

function normalizeSport(sport: string): 'football' | 'basketball' | 'baseball' | 'hockey' | 'tennis' | 'other' {
  const s = sport.toLowerCase();
  if (s.includes('foot') || s.includes('soccer')) return 'football';
  if (s.includes('basket') || s.includes('nba')) return 'basketball';
  if (s.includes('baseball') || s.includes('mlb')) return 'baseball';
  if (s.includes('hockey') || s.includes('nhl')) return 'hockey';
  if (s.includes('tennis')) return 'tennis';
  return 'other';
}

function normalizeResult(result: string): 'home' | 'draw' | 'away' | 'over' | 'under' | 'btts_yes' | 'btts_no' | 'avoid' {
  const r = result.toLowerCase();
  if (r === 'home' || r === '1' || r === 'h') return 'home';
  if (r === 'draw' || r === 'x' || r === 'nul') return 'draw';
  if (r === 'away' || r === '2' || r === 'a') return 'away';
  if (r.includes('over')) return 'over';
  if (r.includes('under')) return 'under';
  if (r.includes('btts') && r.includes('yes')) return 'btts_yes';
  if (r.includes('btts') && r.includes('no')) return 'btts_no';
  return 'avoid';
}

function normalizeConfidence(confidence: string): 'very_high' | 'high' | 'medium' | 'low' {
  const c = confidence.toLowerCase();
  if (c.includes('very') || c.includes('tres') || c === 'very_high') return 'very_high';
  if (c.includes('high') || c.includes('haute') || c === 'high') return 'high';
  if (c.includes('medium') || c.includes('moyenne')) return 'medium';
  return 'low';
}

// ============================================
// SERVICE PRINCIPAL
// ============================================

export const SupabaseStore = {
  
  /**
   * Vérifie si Supabase est disponible
   */
  async isAvailable(): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;
    
    try {
      const { error } = await supabase.from('predictions').select('id').limit(1);
      return !error;
    } catch {
      return false;
    }
  },
  
  /**
   * Ping la base pour éviter la mise en pause
   */
  async ping(): Promise<{ success: boolean; message: string; latency?: number }> {
    const startTime = Date.now();
    const supabase = getSupabase();
    
    if (!supabase) {
      return { success: false, message: 'Supabase non configuré' };
    }
    
    try {
      const { error } = await supabase.from('predictions').select('id').limit(1);
      const latency = Date.now() - startTime;
      
      if (error) {
        return { success: false, message: `Erreur: ${error.message}`, latency };
      }
      
      return { 
        success: true, 
        message: '✅ Base Historique ML active', 
        latency 
      };
    } catch (e: any) {
      return { success: false, message: `Exception: ${e.message}` };
    }
  },
  
  // ============================================
  // PRONOSTICS
  // ============================================
  
  async addPrediction(data: Omit<DbPrediction, 'id' | 'created_at'>): Promise<DbPrediction | null> {
    const supabase = getSupabase();
    if (!supabase) return null;
    
    const prediction: Record<string, any> = {
      ...data,
      sport: normalizeSport(data.sport as string),
      predicted_result: normalizeResult(data.predicted_result as string),
      confidence: normalizeConfidence(data.confidence as string),
      status: data.status || 'pending'
    };
    
    try {
      const { data: result, error } = await supabase
        .from('predictions')
        .upsert(prediction, { onConflict: 'match_id' })
        .select()
        .single();
      
      if (error) {
        console.error('Erreur ajout prédiction:', error);
        return null;
      }
      
      return result as DbPrediction;
    } catch (e) {
      console.error('Exception ajout prédiction:', e);
      return null;
    }
  },
  
  async addPredictions(predictions: Omit<DbPrediction, 'id' | 'created_at'>[]): Promise<number> {
    const supabase = getSupabase();
    if (!supabase) return 0;
    
    const normalized: Record<string, any>[] = predictions.map(p => ({
      ...p,
      sport: normalizeSport(p.sport as string),
      predicted_result: normalizeResult(p.predicted_result as string),
      confidence: normalizeConfidence(p.confidence as string),
      status: p.status || 'pending'
    }));
    
    try {
      const { data, error } = await supabase
        .from('predictions')
        .upsert(normalized, { onConflict: 'match_id' })
        .select();
      
      if (error) {
        console.error('Erreur ajout prédictions:', error);
        return 0;
      }
      
      return data?.length || 0;
    } catch (e) {
      console.error('Exception ajout prédictions:', e);
      return 0;
    }
  },
  
  async getPendingPredictions(): Promise<DbPrediction[]> {
    const supabase = getSupabase();
    if (!supabase) return [];
    
    try {
      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .eq('status', 'pending')
        .order('match_date', { ascending: true });
      
      if (error) return [];
      return (data as DbPrediction[]) || [];
    } catch {
      return [];
    }
  },
  
  async getCompletedPredictions(limit = 500): Promise<DbPrediction[]> {
    const supabase = getSupabase();
    if (!supabase) return [];
    
    try {
      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .eq('status', 'completed')
        .order('match_date', { ascending: false })
        .limit(limit);
      
      if (error) return [];
      return (data as DbPrediction[]) || [];
    } catch {
      return [];
    }
  },
  
  async getAllPredictions(limit = 1000): Promise<DbPrediction[]> {
    const supabase = getSupabase();
    if (!supabase) return [];
    
    try {
      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .order('match_date', { ascending: false })
        .limit(limit);
      
      if (error) return [];
      return (data as DbPrediction[]) || [];
    } catch {
      return [];
    }
  },

  /**
   * Récupère les prédictions pour une date spécifique (filtré côté Supabase).
   * Plus efficace que getAllPredictions + filtre JS.
   */
  async getPredictionsByDate(dateISO: string): Promise<DbPrediction[]> {
    const supabase = getSupabase();
    if (!supabase) return [];
    
    try {
      const startOfDay = `${dateISO}T00:00:00`;
      const endOfDay = `${dateISO}T23:59:59`;
      
      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .gte('match_date', startOfDay)
        .lte('match_date', endOfDay)
        .order('match_date', { ascending: true });
      
      if (error) {
        console.error('Erreur getPredictionsByDate:', error);
        return [];
      }
      return (data as DbPrediction[]) || [];
    } catch {
      return [];
    }
  },

  /**
   * Récupère les prédictions récentes complétées (pour calcul des séries/streaks).
   * Plus efficace que getAllPredictions car filtre status + result_match non null.
   */
  async getRecentCompletedPredictions(limit = 500): Promise<DbPrediction[]> {
    const supabase = getSupabase();
    if (!supabase) return [];
    
    try {
      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .eq('status', 'completed')
        .not('result_match', 'is', null)
        .order('match_date', { ascending: false })
        .limit(limit);
      
      if (error) {
        console.error('Erreur getRecentCompletedPredictions:', error);
        return [];
      }
      return (data as DbPrediction[]) || [];
    } catch {
      return [];
    }
  },
  
  async completePrediction(matchId: string, result: {
    homeScore: number;
    awayScore: number;
    actualResult: 'home' | 'draw' | 'away';
    resultMatch: boolean;
    goalsMatch?: boolean;
    status?: 'completed' | 'pending';
  }): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;
    
    try {
      const update: any = {
        checked_at: new Date().toISOString()
      };
      if (result.status === 'pending') {
        // Mode reset: remettre en pending
        update.home_score = null;
        update.away_score = null;
        update.total_goals = null;
        update.actual_result = null;
        update.result_match = null;
        update.goals_match = null;
        update.status = 'pending';
      } else {
        update.home_score = result.homeScore;
        update.away_score = result.awayScore;
        update.total_goals = result.homeScore + result.awayScore;
        update.actual_result = result.actualResult;
        update.result_match = result.resultMatch;
        update.goals_match = result.goalsMatch;
        update.status = 'completed';
      }
      
      const { error } = await supabase
        .from('predictions')
        .update(update)
        .eq('match_id', matchId);
      
      return !error;
    } catch {
      return false;
    }
  },
  
  async deletePrediction(id: string): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;
    
    try {
      const { error } = await supabase
        .from('predictions')
        .delete()
        .eq('id', id);
      
      return !error;
    } catch {
      return false;
    }
  },

  async deleteByMatchId(matchId: string): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;
    try {
      const { error } = await supabase
        .from('predictions')
        .delete()
        .eq('match_id', matchId);
      return !error;
    } catch {
      return false;
    }
  },

  async fixSportField(): Promise<{ updated: number }> {
    const supabase = getSupabase();
    if (!supabase) return { updated: 0 };
    try {
      // Fix: mettre à jour 'other' → 'baseball' pour les matchs MLB
      const { data, error } = await supabase
        .from('predictions')
        .update({ sport: 'baseball' })
        .eq('sport', 'other')
        .ilike('league', '%MLB%')
        .select('id');
      if (error) console.error('fixSportField error:', error);
      return { updated: data?.length || 0 };
    } catch (e: any) {
      console.error('fixSportField:', e);
      return { updated: 0 };
    }
  },

  async insertRaw(records: Record<string, any>[]): Promise<{ success: boolean; error?: string; count?: number }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase non configuré' };
    try {
      const { data, error } = await supabase
        .from('predictions')
        .upsert(records, { onConflict: 'match_id' })
        .select();
      if (error) return { success: false, error: error.message };
      return { success: true, count: data?.length || 0 };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async deleteByDate(dateISO: string): Promise<number> {
    const supabase = getSupabase();
    if (!supabase) return 0;
    try {
      // Supprimer sur la date + le lendemain (matchs de nuit US en UTC)
      const dates = [dateISO];
      const nextDay = new Date(dateISO + 'T12:00:00Z');
      nextDay.setDate(nextDay.getDate() + 1);
      dates.push(nextDay.toISOString().split('T')[0]);
      
      let totalDeleted = 0;
      for (const d of dates) {
        const startOfDay = `${d}T00:00:00`;
        const endOfDay = `${d}T23:59:59`;
        const { data, error } = await supabase
          .from('predictions')
          .delete()
          .gte('match_date', startOfDay)
          .lte('match_date', endOfDay)
          .select('id');
        if (!error && data) totalDeleted += data.length;
      }
      return totalDeleted;
    } catch {
      return 0;
    }
  },

  async deleteOldPendingPredictions(daysOld: number = 7): Promise<{ deleted: number; errors: string[] }> {
    const supabase = getSupabase();
    if (!supabase) return { deleted: 0, errors: ['Supabase non configuré'] };
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const errors: string[] = [];
    let deleted = 0;
    
    try {
      // D'abord récupérer les IDs à supprimer
      const { data: oldPredictions, error: fetchError } = await supabase
        .from('predictions')
        .select('id')
        .eq('status', 'pending')
        .lt('match_date', cutoffDate.toISOString());
      
      if (fetchError) {
        return { deleted: 0, errors: [fetchError.message] };
      }
      
      if (!oldPredictions || oldPredictions.length === 0) {
        return { deleted: 0, errors: [] };
      }
      
      // Supprimer par lots
      const ids = oldPredictions.map(p => p.id);
      
      const { error: deleteError } = await supabase
        .from('predictions')
        .delete()
        .in('id', ids);
      
      if (deleteError) {
        errors.push(deleteError.message);
      } else {
        deleted = ids.length;
      }
      
      return { deleted, errors };
    } catch (e: any) {
      return { deleted: 0, errors: [e.message] };
    }
  },
  
  // ============================================
  // STATISTIQUES
  // ============================================
  
  async getStats(): Promise<{
    total: number;
    completed: number;
    wins: number;
    losses: number;
    winRate: number;
    bySport: {
      football: { total: number; wins: number; winRate: number };
      basketball: { total: number; wins: number; winRate: number };
      hockey: { total: number; wins: number; winRate: number };
    };
  }> {
    const supabase = getSupabase();
    
    const defaultStats = {
      total: 0,
      completed: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      bySport: {
        football: { total: 0, wins: 0, winRate: 0 },
        basketball: { total: 0, wins: 0, winRate: 0 },
        hockey: { total: 0, wins: 0, winRate: 0 }
      }
    };
    
    if (!supabase) return defaultStats;
    
    try {
      const { data, error } = await supabase
        .from('predictions')
        .select('sport, result_match')
        .eq('status', 'completed');
      
      if (error || !data) return defaultStats;
      
      const completed = data;
      const wins = completed.filter((p: any) => p.result_match === true);
      const losses = completed.filter((p: any) => p.result_match === false);
      
      const bySport = {
        football: { total: 0, wins: 0, winRate: 0 },
        basketball: { total: 0, wins: 0, winRate: 0 },
        hockey: { total: 0, wins: 0, winRate: 0 }
      };
      
      for (const p of completed) {
        const sport = (p as any).sport as keyof typeof bySport;
        if (sport in bySport) {
          bySport[sport].total++;
          if ((p as any).result_match === true) {
            bySport[sport].wins++;
          }
        }
      }
      
      for (const sport of ['football', 'basketball', 'hockey'] as const) {
        if (bySport[sport].total > 0) {
          bySport[sport].winRate = Math.round((bySport[sport].wins / bySport[sport].total) * 100);
        }
      }
      
      return {
        total: completed.length,
        completed: completed.length,
        wins: wins.length,
        losses: losses.length,
        winRate: completed.length > 0 ? Math.round((wins.length / completed.length) * 100) : 0,
        bySport
      };
    } catch {
      return defaultStats;
    }
  },
  
  // ============================================
  // MIGRATION
  // ============================================
  
  async migrateFromJSON(predictions: any[]): Promise<number> {
    const supabase = getSupabase();
    if (!supabase) return 0;
    
    const normalized: Record<string, any>[] = predictions.map(p => ({
      match_id: p.matchId,
      home_team: p.homeTeam,
      away_team: p.awayTeam,
      league: p.league || 'Unknown',
      sport: normalizeSport(p.sport),
      match_date: p.matchDate || p.createdAt,
      odds_home: p.oddsHome || 1.0,
      odds_draw: p.oddsDraw || null,
      odds_away: p.oddsAway || 1.0,
      predicted_result: normalizeResult(p.predictedResult),
      predicted_goals: p.predictedGoals,
      confidence: normalizeConfidence(p.confidence),
      risk_percentage: p.riskPercentage || 50,
      home_score: p.homeScore,
      away_score: p.awayScore,
      total_goals: p.totalGoals,
      actual_result: p.actualResult ? normalizeResult(p.actualResult) : null,
      status: p.status || 'pending',
      result_match: p.resultMatch,
      goals_match: p.goalsMatch,
      created_at: p.createdAt,
      checked_at: p.checkedAt
    }));
    
    try {
      const { data, error } = await supabase
        .from('predictions')
        .upsert(normalized, { onConflict: 'match_id' })
        .select();
      
      if (error) {
        console.error('Erreur migration:', error);
        return 0;
      }
      
      return data?.length || 0;
    } catch (e) {
      console.error('Exception migration:', e);
      return 0;
    }
  }
};

export default SupabaseStore;
