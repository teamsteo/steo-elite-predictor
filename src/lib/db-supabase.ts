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
  ml_model_version?: string;  features?: any;
  model_confidence?: number;
  
  // Combo (parlay) fields
  combo_id?: string;
  combo_name?: string;
  is_combo?: boolean;
  
  // Value bet tracking
  is_value_bet?: boolean;
  edge_value?: number; // % edge (model prob - market implied prob)
  
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
  if (!result) return 'home'; // 🔒 FIX: ne jamais retourner 'avoid' par défaut
  const r = result.toLowerCase();
  if (r === 'home' || r === '1' || r === 'h') return 'home';
  if (r === 'draw' || r === 'x' || r === 'nul') return 'draw';
  if (r === 'away' || r === '2' || r === 'a') return 'away';
  if (r.includes('over')) return 'over';
  if (r.includes('under')) return 'under';
  if (r.includes('btts') && r.includes('yes')) return 'btts_yes';
  if (r.includes('btts') && r.includes('no')) return 'btts_no';
  // 🔒 FIX: Si la valeur est non reconnue, retourner 'home' au lieu de 'avoid'
  // 'avoid' corrompt le bilan (affiché 'Non joué' mais compté comme pari)
  console.warn(`⚠️ normalizeResult: valeur non reconnue '${result}' → fallback 'home'`);
  return 'home';
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
  
  async addPredictions(predictions: Array<Record<string, any>>): Promise<number> {
    const supabase = getSupabase();
    if (!supabase) return 0;

    // 🔒 Ne JAMAIS inclure created_at dans l'upsert.
    // - Nouvelles lignes : PostgreSQL DEFAULT now() gère created_at
    // - Upserts (existants) : created_at est PRÉSERVÉ automatiquement car absent du set
    // Cela évite le bug où un re-lancement du pipeline changeait la date de publication
    const normalized: Record<string, any>[] = predictions.map(p => {
      const pr = p.predicted_result;
      return {
        // 🔒 Ne JAMAIS spread ...p — éviter d'injecter des champs indésirables
        // (result_match, home_score, actual_result, etc.) qui corrompraient l'upsert
        match_id: p.match_id,
        home_team: p.home_team,
        away_team: p.away_team,
        league: p.league,
        sport: normalizeSport(p.sport as string),
        match_date: p.match_date,
        season: p.season || null,
        odds_home: p.odds_home,
        odds_draw: p.odds_draw ?? null,
        odds_away: p.odds_away,
        // 🔒 predicted_result: utiliser la valeur normalisée, ou 'home' si absent
        predicted_result: pr ? normalizeResult(pr as string) : 'home',
        confidence: normalizeConfidence((p.confidence || 'medium') as string),
        risk_percentage: p.risk_percentage ?? 50,
        is_value_bet: p.is_value_bet === true,
        edge_value: p.edge_value || 0,
        is_combo: p.is_combo === true,
        combo_id: p.combo_id || null,
        combo_name: p.combo_name || null,
        status: p.status || 'pending',
        // ⛔ created_at volontairement OMIS — voir commentaire ci-dessus
      };
    });

    // 🔒 SÉCURITÉ: Exclure les match_ids déjà vérifiés (status='completed')
    // Un upsert écraserait status='completed' par 'pending' et perdrait la vérification
    try {
      const matchIds = normalized.map(p => p.match_id);
      const { data: existingPreds } = await supabase
        .from('predictions')
        .select('match_id, status')
        .in('match_id', matchIds);

      if (existingPreds && existingPreds.length > 0) {
        const completedSet = new Set<string>();
        for (const ep of existingPreds) {
          if (ep.status === 'completed') {
            completedSet.add(ep.match_id);
          }
        }

        if (completedSet.size > 0) {
          const before = normalized.length;
          const filtered = normalized.filter(p => !completedSet.has(p.match_id));
          console.log(`🔒 [UPSAFEGUARD] ${completedSet.size} prédictions déjà vérifiées exclues de l'upsert (${before} → ${filtered.length})`);
          if (filtered.length === 0) return 0;

          try {
            const { data, error } = await supabase
              .from('predictions')
              .upsert(filtered, { onConflict: 'match_id' })
              .select();
            if (error) {
              console.error('Erreur ajout prédictions:', error);
              return 0;
            }
            // 🔧 Post-upsert: fixer created_at=NULL pour les nouvelles insertions
            // (si la colonne n'a pas de DEFAULT)
            const newIds = filtered.map(p => p.match_id);
            await supabase
              .from('predictions')
              .update({ created_at: new Date().toISOString() })
              .in('match_id', newIds)
              .is('created_at', null);
            return data?.length || 0;
          } catch (e) {
            console.error('Exception ajout prédictions:', e);
            return 0;
          }
        }
      }
    } catch {
      // Si la vérification échoue, continuer avec l'upsert normal (fallback)
    }

    try {
      const { data, error } = await supabase
        .from('predictions')
        .upsert(normalized, { onConflict: 'match_id' })
        .select();

      if (error) {
        console.error('Erreur ajout prédictions:', error);
        return 0;
      }

      // 🔧 Post-upsert: fixer created_at=NULL pour les nouvelles insertions
      if (data && data.length > 0) {
        const newIds = (data as any[]).map(p => p.match_id);
        await supabase
          .from('predictions')
          .update({ created_at: new Date().toISOString() })
          .in('match_id', newIds)
          .is('created_at', null);
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
   * Récupère les prédictions pour une date spécifique.
   * ⚠️ FIX: Utilise une plage large (day-1 à day+2) + filtrage JS côté date-only.
   * Les dates ESPN sont en UTC avec suffixe 'Z' (ex: '2026-08-01T23:00:00Z').
   * La comparaison textuelle '2026-08-01T23:59:59' vs '2026-08-01T23:00:00Z'
   * échoue car 'Z' > '9' en ASCII → match jamais trouvé.
   */
  async getPredictionsByDate(dateISO: string): Promise<DbPrediction[]> {
    const supabase = getSupabase();
    if (!supabase) return [];
    
    try {
      // Plage large : jour-1 à jour+2 pour couvrir les fuseaux horaires
      const targetDate = new Date(dateISO + 'T12:00:00Z');
      const dayBefore = new Date(targetDate);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayAfter = new Date(targetDate);
      dayAfter.setDate(dayAfter.getDate() + 2);

      const startRange = dayBefore.toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ
      const endRange = dayAfter.toISOString();

      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .gte('match_date', startRange)
        .lt('match_date', endRange)
        .order('match_date', { ascending: true });
      
      if (error) {
        console.error('Erreur getPredictionsByDate:', error);
        return [];
      }

      // 🔍 LOG: voir ce que Supabase retourne AVANT filtrage JS
      const rawData = data as DbPrediction[];
      if (rawData.length > 0) {
        console.log(`🔍 [DB] getPredictionsByDate("${dateISO}"): Supabase retourne ${rawData.length} lignes (plage ${startRange} → ${endRange}), dates: ${JSON.stringify(rawData.map(p => (p.match_date || '').split('T')[0]))}`);
      }

      // Filtrage côté JS : comparaison date-only (YYYY-MM-DD)
      const filtered = rawData.filter(p => {
        const datePart = (p.match_date || '').split('T')[0];
        return datePart === dateISO;
      });

      console.log(`🔍 [DB] getPredictionsByDate("${dateISO}"): ${filtered.length} après filtrage JS (date === "${dateISO}")`);
      return filtered || [];
    } catch {
      return [];
    }
  },

  /**
   * Récupère les prédictions publiées à une date donnée (par created_at, pas match_date).
   * Le bilan journalier porte sur les publications du jour, pas sur la date du match.
   */
  async getPredictionsByCreatedAt(dateISO: string): Promise<DbPrediction[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    try {
      const startRange = `${dateISO}T00:00:00Z`;
      const endRange = `${dateISO}T23:59:59Z`;

      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .gte('created_at', startRange)
        .lte('created_at', endRange)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Erreur getPredictionsByCreatedAt:', error);
        return [];
      }

      const rawData = data as DbPrediction[];
      if (rawData.length > 0) {
        console.log(`🔍 [DB] getPredictionsByCreatedAt("${dateISO}"): ${rawData.length} lignes, sports: ${JSON.stringify(rawData.map(p => ({ s: p.sport, md: (p.match_date || '').split('T')[0], st: p.status })))}`);
      }

      return rawData || [];
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

  /**
   * Nettoie les prédictions corrompues : predicted_result null/avoid/empty
   * @param dateISO Optionnel : limiter à une date de match spécifique
   * @returns { deleted: number, fixed: number, details: any[] }
   */
  async fixCorruptedPredictions(dateISO?: string): Promise<{ deleted: number; fixed: number; details: any[] }> {
    const supabase = getSupabase();
    if (!supabase) return { deleted: 0, fixed: 0, details: [] };

    try {
      // Récupérer les prédictions avec predicted_result corrompu
      let query = supabase
        .from('predictions')
        .select('*')
        .or('predicted_result.is.null,predicted_result.eq.avoid,predicted_result.eq.')
        .order('match_date', { ascending: true });

      const { data, error } = await query;
      if (error) { console.error('fixCorruptedPredictions error:', error); return { deleted: 0, fixed: 0, details: [] }; }

      let allCorrupted = (data as DbPrediction[]) || [];

      // Filtrer par date si demandé
      if (dateISO) {
        allCorrupted = allCorrupted.filter(p => {
          const md = (p.match_date || '').split('T')[0];
          const ca = (p.created_at || '').split('T')[0];
          return md === dateISO || ca === dateISO;
        });
      }

      if (allCorrupted.length === 0) {
        console.log('✅ [FIX-CORRUPTED] Aucune prédiction corrompue trouvée');
        return { deleted: 0, fixed: 0, details: [] };
      }

      console.log(`🔧 [FIX-CORRUPTED] ${allCorrupted.length} prédictions corrompues trouvées`);

      let deleted = 0;
      let fixed = 0;
      const details: any[] = [];

      for (const p of allCorrupted) {
        // Déduire le predicted_result depuis les cotes (le favori = cote la plus basse)
        let inferredResult: 'home' | 'away' | 'draw' = 'home';
        const hOdds = p.odds_home || 999;
        const aOdds = p.odds_away || 999;
        const dOdds = p.odds_draw || 999;

        if (dOdds < hOdds && dOdds < aOdds) {
          inferredResult = 'draw';
        } else if (aOdds < hOdds) {
          inferredResult = 'away';
        }
        // else home (default)

        // Mettre à jour predicted_result
        const { error: updateError } = await supabase
          .from('predictions')
          .update({ predicted_result: inferredResult })
          .eq('match_id', p.match_id);

        if (updateError) {
          console.error(`❌ [FIX-CORRUPTED] Échec mise à jour ${p.match_id}:`, updateError.message);
          // Si on ne peut pas corriger, supprimer
          const delOk = await this.deleteByMatchId(p.match_id);
          if (delOk) deleted++;
          details.push({ match: `${p.home_team} vs ${p.away_team}`, action: 'deleted', reason: updateError.message });
        } else {
          fixed++;
          details.push({
            match: `${p.home_team} vs ${p.away_team}`,
            sport: p.sport,
            match_date: (p.match_date || '').split('T')[0],
            created_at: (p.created_at || '').split('T')[0],
            old_predicted: p.predicted_result || 'null',
            new_predicted: inferredResult,
            status: p.status,
            action: 'fixed',
          });
        }
      }

      console.log(`🔧 [FIX-CORRUPTED] Résultat: ${fixed} corrigées, ${deleted} supprimées`);
      return { deleted, fixed, details };
    } catch (e: any) {
      console.error('fixCorruptedPredictions:', e);
      return { deleted: 0, fixed: 0, details: [] };
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
      // ⚠️ FIX: Même logique que getPredictionsByDate — plage large + filtrage JS
      // Les dates ESPN avec 'Z' font échouer la comparaison textuelle
      const targetDate = new Date(dateISO + 'T12:00:00Z');
      const dayBefore = new Date(targetDate);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayAfter = new Date(targetDate);
      dayAfter.setDate(dayAfter.getDate() + 2);

      const startRange = dayBefore.toISOString();
      const endRange = dayAfter.toISOString();

      // Récupérer les IDs à supprimer via filtrage JS (Supabase delete ne filtre pas en JS)
      const { data, error } = await supabase
        .from('predictions')
        .select('id, match_date')
        .gte('match_date', startRange)
        .lt('match_date', endRange);
      
      if (error || !data) return 0;

      // Filtrage côté JS : ne supprimer que les matchs de la date exacte
      const toDeleteIds = data
        .filter(p => (p.match_date || '').split('T')[0] === dateISO)
        .map(p => p.id)
        .filter(Boolean);

      if (toDeleteIds.length === 0) return 0;

      const { error: deleteError } = await supabase
        .from('predictions')
        .delete()
        .in('id', toDeleteIds);

      return deleteError ? 0 : toDeleteIds.length;
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
      baseball: { total: number; wins: number; winRate: number };
      hockey: { total: number; wins: number; winRate: number };
      tennis: { total: number; wins: number; winRate: number };
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
        baseball: { total: 0, wins: 0, winRate: 0 },
        hockey: { total: 0, wins: 0, winRate: 0 },
        tennis: { total: 0, wins: 0, winRate: 0 }
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
        baseball: { total: 0, wins: 0, winRate: 0 },
        hockey: { total: 0, wins: 0, winRate: 0 },
        tennis: { total: 0, wins: 0, winRate: 0 }
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
      
      for (const sport of ['football', 'basketball', 'baseball', 'hockey', 'tennis'] as const) {
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
  // STATISTIQUES VALUE BET vs SAFE
  // ============================================
  
  async getStatsByValueBet(days?: number): Promise<{
    valueBet: { total: number; wins: number; losses: number; winRate: number; roi: number; profitUnits: number; avgEdge: number };
    safe: { total: number; wins: number; losses: number; winRate: number; roi: number; profitUnits: number };
    kamikaze: { total: number; wins: number; losses: number; winRate: number; roi: number; profitUnits: number };
    combo: { total: number; wins: number; losses: number; winRate: number; roi: number; profitUnits: number };
    period: string;
  }> {
    const supabase = getSupabase();
    const defaultResult = {
      valueBet: { total: 0, wins: 0, losses: 0, winRate: 0, roi: 0, profitUnits: 0, avgEdge: 0 },
      safe: { total: 0, wins: 0, losses: 0, winRate: 0, roi: 0, profitUnits: 0 },
      kamikaze: { total: 0, wins: 0, losses: 0, winRate: 0, roi: 0, profitUnits: 0 },
      combo: { total: 0, wins: 0, losses: 0, winRate: 0, roi: 0, profitUnits: 0 },
      period: days ? `last_${days}_days` : 'all_time',
    };

    if (!supabase) return defaultResult;

    try {
      // Fetch completed predictions with is_value_bet column
      let query = supabase
        .from('predictions')
        .select('is_value_bet, edge_value, is_combo, risk_percentage, result_match, predicted_result, odds_home, odds_draw, odds_away, match_date')
        .eq('status', 'completed')
        .not('result_match', 'is', null);

      // Optionally filter by date range
      if (days && days > 0) {
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - days);
        const fromISO = fromDate.toISOString().split('T')[0];
        query = query.gte('match_date', fromISO + 'T00:00:00Z');
      }

      const { data, error } = await query;
      if (error || !data) return defaultResult;

      // Stats accumulators
      const vb = { total: 0, wins: 0, losses: 0, profitUnits: 0, edgeSum: 0, edgeCount: 0, stakes: 0 };
      const safe = { total: 0, wins: 0, losses: 0, profitUnits: 0, stakes: 0 };
      const kami = { total: 0, wins: 0, losses: 0, profitUnits: 0, stakes: 0 };
      const combo = { total: 0, wins: 0, losses: 0, profitUnits: 0, stakes: 0 };

      for (const p of data) {
        const isVB = p.is_value_bet === true;
        const isCombo = p.is_combo === true;
        const isKami = p.risk_percentage > 50;
        const won = p.result_match === true;
        const lost = p.result_match === false;

        // Find bet odds
        let betOdds = 1.0;
        if (p.predicted_result === 'home') betOdds = p.odds_home || 1.0;
        else if (p.predicted_result === 'away') betOdds = p.odds_away || 1.0;
        else if (p.predicted_result === 'draw') betOdds = p.odds_draw || 1.0;

        // Profit calculation (1 unit stake per bet)
        const profit = won ? (betOdds - 1) : (lost ? -1 : 0);

        // Route to correct bucket
        // Priority: combo > value bet > kamikaze > safe
        if (isCombo) {
          combo.total++;
          combo.stakes++;
          if (won) combo.wins++;
          if (lost) combo.losses++;
          combo.profitUnits += profit;
        } else if (isVB) {
          vb.total++;
          vb.stakes++;
          if (won) vb.wins++;
          if (lost) vb.losses++;
          vb.profitUnits += profit;
          if (p.edge_value !== null && p.edge_value !== undefined) {
            vb.edgeSum += p.edge_value;
            vb.edgeCount++;
          }
        } else if (isKami) {
          kami.total++;
          kami.stakes++;
          if (won) kami.wins++;
          if (lost) kami.losses++;
          kami.profitUnits += profit;
        } else {
          // Safe/moderate (risk <= 50, not value bet, not combo)
          safe.total++;
          safe.stakes++;
          if (won) safe.wins++;
          if (lost) safe.losses++;
          safe.profitUnits += profit;
        }
      }

      return {
        valueBet: {
          total: vb.total,
          wins: vb.wins,
          losses: vb.losses,
          winRate: vb.total > 0 ? Math.round((vb.wins / vb.total) * 100) : 0,
          roi: vb.stakes > 0 ? Math.round((vb.profitUnits / vb.stakes) * 100) : 0,
          profitUnits: Math.round(vb.profitUnits * 100) / 100,
          avgEdge: vb.edgeCount > 0 ? Math.round((vb.edgeSum / vb.edgeCount) * 10) / 10 : 0,
        },
        safe: {
          total: safe.total,
          wins: safe.wins,
          losses: safe.losses,
          winRate: safe.total > 0 ? Math.round((safe.wins / safe.total) * 100) : 0,
          roi: safe.stakes > 0 ? Math.round((safe.profitUnits / safe.stakes) * 100) : 0,
          profitUnits: Math.round(safe.profitUnits * 100) / 100,
        },
        kamikaze: {
          total: kami.total,
          wins: kami.wins,
          losses: kami.losses,
          winRate: kami.total > 0 ? Math.round((kami.wins / kami.total) * 100) : 0,
          roi: kami.stakes > 0 ? Math.round((kami.profitUnits / kami.stakes) * 100) : 0,
          profitUnits: Math.round(kami.profitUnits * 100) / 100,
        },
        combo: {
          total: combo.total,
          wins: combo.wins,
          losses: combo.losses,
          winRate: combo.total > 0 ? Math.round((combo.wins / combo.total) * 100) : 0,
          roi: combo.stakes > 0 ? Math.round((combo.profitUnits / combo.stakes) * 100) : 0,
          profitUnits: Math.round(combo.profitUnits * 100) / 100,
        },
        period: days ? `last_${days}_days` : 'all_time',
      };
    } catch {
      return defaultResult;
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
