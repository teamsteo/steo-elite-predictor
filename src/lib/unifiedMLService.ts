/**
 * Unified ML Service - Service ML Unifié avec persistance Supabase
 * 
 * PROBLÈMES RÉSOLUS:
 * 1. Persistance du modèle sur Vercel (read-only filesystem) → Stockage Supabase
 * 2. Synchronisation async/sync → Tout est async maintenant
 * 3. Apprentissage automatique → Intégré dans le cron
 * 
 * FONCTIONNALITÉS:
 * - Découverte de patterns depuis les résultats passés
 * - Mise à jour des seuils adaptatifs
 * - Persistance permanente dans Supabase
 * - Filtrage du bruit (patterns < 55% de succès ignorés)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Configuration Supabase
// SECURITY: Require service role key for server-side ML operations (not anon key)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Type pour le client Supabase
type GenericSupabaseClient = SupabaseClient<any, any, any>;

// ============================================
// TYPES
// ============================================

export interface MLPattern {
  id: string;
  sport: 'football' | 'basketball' | 'hockey' | 'baseball' | 'tennis';
  pattern_type: string;
  condition: string;
  outcome: string;
  sample_size: number;
  success_rate: number;
  confidence: number;
  description: string;
  last_updated: string;
  created_at?: string;
}

export interface MLModel {
  id?: string;
  version: string;
  edge_threshold: number;
  injury_impact_factor: number;
  form_weight: number;
  xg_weight: number;
  net_rating_weight: number;
  min_data_quality: number;
  confidence_weights: {
    very_high: number;
    high: number;
    medium: number;
    low: number;
  };
  samples_used: number;
  accuracy: number;
  last_trained: string;
  created_at?: string;
  // XGBoost params (from Python training script)
  xgboost_params?: XGBoostParams | null;
}

export interface XGBoostParams {
  trained: boolean;
  sports: Record<string, XGBoostSportParams>;
  global_cv_accuracy: number;
  total_samples: number;
  best_edge_threshold?: number;
  /** v3: méthode de scoring en prod — 'trees' = replay des arbres exportés */
  scoring?: 'trees' | 'none';
  training_version?: number;
  label?: string;
  label_semantics?: string;
}

/** Noeud d'arbre XGBoost compact (export ml/train_xgboost.py, format xgb_dump_v1) */
export interface XGBTreeNode {
  /** feuille: valeur de la marge */
  v?: number;
  /** noeud interne: index de la feature dans tree_dump.features */
  f?: number;
  /** seuil de split: go left si feature < t */
  t?: number;
  y?: XGBTreeNode;
  n?: XGBTreeNode;
  m?: XGBTreeNode;
}

export interface XGBTreeDump {
  format: 'xgb_dump_v1';
  features: string[];
  margin_offset: number;
  n_trees: number;
  /** politique feature absente en prod: 'zero' = 0 (comme fillna(0) au training) */
  missing_policy: 'zero';
  trees: XGBTreeNode[];
}

export interface XGBPlattParams {
  a: number;
  b: number;
  /** 'margin' = appliqué sur la marge brute (somme des feuilles) avant sigmoid */
  input: 'margin';
  applied: boolean;
}

export interface XGBoostSportParams {
  cv_accuracy: number;
  best_confidence_threshold: number;
  top_features: [string, number][];
  feature_importance: Record<string, number>;
  samples: number;
  version: string;
  trained_at: string;
  /** v3 — replay fidèle du modèle entraîné */
  scoring?: 'trees' | 'none';
  tree_dump?: XGBTreeDump | null;
  platt?: XGBPlattParams | null;
  features?: string[];
  label?: string;
  label_semantics?: string;
  holdout?: { n_train?: number; n_holdout?: number; accuracy?: number; brier?: number };
}

export interface TrainingResult {
  success: boolean;
  samplesUsed: number;
  patternsDiscovered: number;
  patternsSaved: number;
  patternsUpdated: number;
  accuracy: number;
  improvements: string[];
  errors: string[];
  // 🆕 Task 32 — observabilité du filtrage par seuil de bruit
  rejectedByThreshold?: { sport: string; type: string; rate: number; threshold: number }[];
  matchesBySport?: Record<string, number>;
}

export interface MatchForTraining {
  id: string;
  sport: string;
  home_team: string;
  away_team: string;
  home_score?: number;
  away_score?: number;
  status: string;
  date: string;
  home_xg?: number;
  away_xg?: number;
  odds_home?: number;
  odds_away?: number;
  odds_draw?: number;
  league?: string;
  predicted_result?: string;
  result_match?: boolean;
  risk_percentage?: number;  // 🆕 Task 32 — patterns par tranche de risque
  // Tennis fields
  home_sets_won?: number;
  away_sets_won?: number;
  league_tournament?: string;
}

// Client Supabase singleton
let supabaseClient: GenericSupabaseClient | null = null;

// Cache local pour les patterns
let patternsCache: MLPattern[] = [];
let modelCache: MLModel | null = null;
let lastCacheUpdate = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// ============================================
// CONNEXION SUPABASE
// ============================================

function getSupabase(): GenericSupabaseClient | null {
  if (!supabaseClient) {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.warn('⚠️ UnifiedML: Supabase non configuré');
      return null;
    }
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return supabaseClient;
}

// ============================================
// GESTION DU MODÈLE
// ============================================

/**
 * Charge le modèle ML depuis Supabase
 */
export async function loadMLModel(): Promise<MLModel> {
  const now = Date.now();
  
  // Utiliser le cache si valide
  if (modelCache && (now - lastCacheUpdate) < CACHE_DURATION) {
    return modelCache;
  }
  
  const supabase = getSupabase();
  
  // Modèle par défaut
  const defaultModel: MLModel = {
    version: '1.0.0',
    edge_threshold: 0.03,
    injury_impact_factor: 1.0,
    form_weight: 0.05,
    xg_weight: 0.03,
    net_rating_weight: 0.03,
    min_data_quality: 50,
    confidence_weights: {
      very_high: 0.5,
      high: 0.4,
      medium: 0.25,
      low: 0.1
    },
    samples_used: 0,
    accuracy: 0,
    last_trained: new Date().toISOString()
  };
  
  if (!supabase) {
    console.warn('⚠️ UnifiedML: Supabase non disponible, modèle par défaut');
    return defaultModel;
  }
  
  try {
    // Essayer de charger depuis la table ml_model
    const { data, error } = await supabase
      .from('ml_model')
      .select('*')
      .order('last_trained', { ascending: false })
      .limit(1)
      .single();
    
    if (error) {
      // Si la table n'existe pas, créer le modèle par défaut
      if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
        console.log('📦 UnifiedML: Création du modèle initial...');
        
        // Insérer le modèle par défaut
        await supabase.from('ml_model').insert({
          ...defaultModel,
          id: 'default_model'
        });
        
        modelCache = defaultModel;
        lastCacheUpdate = now;
        return defaultModel;
      }
      
      console.warn('⚠️ UnifiedML: Erreur chargement modèle:', error.message);
      return defaultModel;
    }
    
    if (data) {
      modelCache = {
        ...data,
        confidence_weights: typeof data.confidence_weights === 'string' 
          ? JSON.parse(data.confidence_weights) 
          : data.confidence_weights,
        xgboost_params: data.xgboost_params 
          ? (typeof data.xgboost_params === 'string' ? JSON.parse(data.xgboost_params) : data.xgboost_params)
          : null
      } as MLModel;
      lastCacheUpdate = now;
      const xgbStatus = modelCache.xgboost_params?.trained ? `XGBoost ✅ (${modelCache.xgboost_params.total_samples} samples)` : 'heuristiques';
      console.log(`✅ UnifiedML: Modèle v${modelCache.version} chargé (${modelCache.samples_used} échantillons, ${modelCache.accuracy}% accuracy) [${xgbStatus}]`);
      return modelCache;
    }
    
    return defaultModel;
  } catch (e) {
    console.error('❌ UnifiedML: Exception chargement modèle:', e);
    return defaultModel;
  }
}

/**
 * Sauvegarde le modèle ML dans Supabase
 */
export async function saveMLModel(model: MLModel): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('ml_model')
      .upsert({
        id: 'default_model',
        ...model,
        confidence_weights: model.confidence_weights,
        last_trained: new Date().toISOString()
      });
    
    if (error) {
      console.error('❌ UnifiedML: Erreur sauvegarde modèle:', error.message);
      return false;
    }
    
    // Mettre à jour le cache
    modelCache = model;
    lastCacheUpdate = Date.now();
    
    console.log(`✅ UnifiedML: Modèle v${model.version} sauvegardé`);
    return true;
  } catch (e) {
    console.error('❌ UnifiedML: Exception sauvegarde modèle:', e);
    return false;
  }
}

// ============================================
// GESTION DES PATTERNS
// ============================================

/**
 * Charge les patterns ML depuis Supabase
 */
export async function loadMLPatterns(forceRefresh = false): Promise<MLPattern[]> {
  const now = Date.now();
  
  // Utiliser le cache si valide
  if (!forceRefresh && patternsCache.length > 0 && (now - lastCacheUpdate) < CACHE_DURATION) {
    return patternsCache;
  }
  
  const supabase = getSupabase();
  if (!supabase) return [];
  
  try {
    const { data, error } = await supabase
      .from('ml_patterns')
      .select('*')
      .order('success_rate', { ascending: false });
    
    if (error) {
      console.error('❌ UnifiedML: Erreur chargement patterns:', error.message);
      return patternsCache;
    }
    
    if (data && data.length > 0) {
      patternsCache = data as MLPattern[];
      lastCacheUpdate = now;
      console.log(`🧠 UnifiedML: ${patternsCache.length} patterns chargés`);
    }
    
    return patternsCache;
  } catch (e) {
    console.error('❌ UnifiedML: Exception chargement patterns:', e);
    return patternsCache;
  }
}

/**
 * Sauvegarde un nouveau pattern
 *
 * 🆕 Task 32 — FIX CRITIQUE: la table ml_patterns n'a PAS de colonne id
 * auto-générée → l'insert sans id échouait silencieusement (violation NOT NULL)
 * → patternsSaved restait à 0 depuis toujours, alors que saveNewPattern
 * (ml-memory-service, utilisé par /api/ml/train-sports) génère un id explicite
 * et réussit. Alignement sur le même schéma d'id.
 */
export async function saveMLPattern(pattern: Omit<MLPattern, 'id' | 'last_updated' | 'created_at'>): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('ml_patterns')
      .insert({
        ...pattern,
        id: `${pattern.sport}_${pattern.pattern_type}_${Date.now()}`,  // 🆕 Task 32 — id explicite (identique à saveNewPattern)
        last_updated: new Date().toISOString()
      });
    
    if (error) {
      console.error('❌ UnifiedML: Erreur sauvegarde pattern:', error.message);
      return false;
    }
    
    // Rafraîchir le cache
    patternsCache = [];
    await loadMLPatterns(true);
    
    console.log(`✅ UnifiedML: Pattern "${pattern.pattern_type}" sauvegardé (${pattern.success_rate}% succès)`);
    return true;
  } catch (e) {
    console.error('❌ UnifiedML: Exception sauvegarde pattern:', e);
    return false;
  }
}

/**
 * Met à jour un pattern existant
 *
 * 🆕 Task 32 — CONTOURNEMENT TRIGGER: un trigger PostgreSQL sur ml_patterns
 * (BEFORE UPDATE) référence une colonne `updated_at` INEXISTANTE dans la table
 * → tout UPDATE échoue avec 'record "new" has no field "updated_at"'.
 * L'INSERT fonctionne (le trigger ne porte pas sur INSERT).
 * Stratégie: INSERT du pattern fusionné (nouvel id horodaté) puis DELETE de
 * l'ancien en best-effort. Si le DELETE échoue (trigger sur DELETE ?), le
 * doublon résiduel est inoffensif: find() prend le premier match et les
 * prochains runs fusionneront vers la ligne fraîche.
 * FIX DURABLE (à exécuter dans le SQL Editor Supabase):
 *   DROP TRIGGER <nom> ON ml_patterns;  -- trigger orphelin sur updated_at
 *   -- ou bien: ALTER TABLE ml_patterns ADD COLUMN updated_at timestamptz;
 */
export async function updateMLPattern(patternId: string, sampleSize: number, successRate: number): Promise<boolean | string> {
  const supabase = getSupabase();
  if (!supabase) return false;
  
  try {
    // 1) Charger la ligne existante (pour conserver sport/pattern_type/condition/outcome/description)
    const { data: existingRow, error: loadErr } = await supabase
      .from('ml_patterns')
      .select('*')
      .eq('id', patternId)
      .single();
    
    if (loadErr || !existingRow) {
      return `update KO: pattern source introuvable (${loadErr?.message || 'no row'})`;
    }
    
    // 2) INSERT du pattern fusionné avec un nouvel id horodaté (l'INSERT n'est pas bloqué par le trigger)
    const merged = {
      sport: existingRow.sport,
      pattern_type: existingRow.pattern_type,
      condition: existingRow.condition,
      outcome: existingRow.outcome,
      sample_size: sampleSize,
      success_rate: successRate,
      confidence: Math.min(successRate / 100, 0.95),
      description: existingRow.description,
      id: `${existingRow.sport}_${existingRow.pattern_type}_${Date.now()}`,
      last_updated: new Date().toISOString(),
    };
    
    const { error: insertErr } = await supabase
      .from('ml_patterns')
      .insert(merged);
    
    if (insertErr) {
      console.error('❌ UnifiedML: Erreur insert (update-contournement):', insertErr.message);
      return `update KO (insert contournement): ${insertErr.message}`;
    }
    
    // 3) DELETE de l'ancienne ligne (best-effort — si le trigger bloque aussi DELETE,
    //    le doublon résiduel est inoffensif)
    const { error: deleteErr } = await supabase
      .from('ml_patterns')
      .delete()
      .eq('id', patternId);
    
    if (deleteErr) {
      console.warn(`⚠️ UnifiedML: DELETE ancien pattern ${patternId} échoué (non bloquant): ${deleteErr.message}`);
    }
    
    // Rafraîchir le cache
    patternsCache = [];
    await loadMLPatterns(true);
    
    return true;
  } catch (e: any) {
    console.error('❌ UnifiedML: Exception mise à jour pattern:', e);
    return `update exception: ${e?.message || e}`;
  }
}

// ============================================
// DÉCOUVERTE DE PATTERNS
// ============================================

interface PatternDiscovery {
  sport: string;
  pattern_type: string;
  condition: string;
  outcome: string;
  success_rate: number;
  sample_size: number;
  description: string;
}

/**
 * Détecte les patterns Football depuis les matchs
 */
function detectFootballPatterns(matches: MatchForTraining[]): PatternDiscovery[] {
  const patterns: PatternDiscovery[] = [];

  // 🆕 Task 32 — FIX: la majorité des matchs en DB n'a pas de xG (Understat non
  // scrappé systématiquement). L'ancien code exigeait home_xg+away_xg pour
  // TOUS les patterns xG → 0 pattern découvert → patternsSaved: 0 à chaque run.
  // On garde les patterns xG SI au moins 5 matchs ont des xG, mais on ajoute
  // des patterns basés sur les COTES seules (disponibles pour tous les matchs).

  // ── Patterns basés sur les cotes (disponibles pour tous les matchs) ──

  // Pattern: Favori à domicile (cotes < 1.5) — EXISTANT, conservé
  const homeFavoriteMatches = matches.filter(m =>
    m.home_score !== undefined && m.away_score !== undefined &&
    m.odds_home !== undefined && m.odds_home < 1.5
  );

  if (homeFavoriteMatches.length >= 5) {
    const homeWinCount = homeFavoriteMatches.filter(m =>
      m.home_score! > m.away_score!
    ).length;

    patterns.push({
      sport: 'football',
      pattern_type: 'home_favorite',
      condition: 'odds_home < 1.5',
      outcome: 'home_win',
      success_rate: Math.round((homeWinCount / homeFavoriteMatches.length) * 100),
      sample_size: homeFavoriteMatches.length,
      description: `Favori domicile (cote < 1.5): gagne ${Math.round((homeWinCount / homeFavoriteMatches.length) * 100)}%`
    });
  }

  // 🆕 Task 32 — Pattern: Favori domicile LARGE (cote < 1.8) — plus permissif
  const homeFavoriteLargeMatches = matches.filter(m =>
    m.home_score !== undefined && m.away_score !== undefined &&
    m.odds_home !== undefined && m.odds_home >= 1.5 && m.odds_home < 1.8
  );

  if (homeFavoriteLargeMatches.length >= 5) {
    const homeWinCount = homeFavoriteLargeMatches.filter(m =>
      m.home_score! > m.away_score!
    ).length;
    const homeOrDrawCount = homeFavoriteLargeMatches.filter(m =>
      m.home_score! >= m.away_score!
    ).length;

    patterns.push({
      sport: 'football',
      pattern_type: 'home_favorite_large',
      condition: '1.5 <= odds_home < 1.8',
      outcome: 'home_win',
      success_rate: Math.round((homeWinCount / homeFavoriteLargeMatches.length) * 100),
      sample_size: homeFavoriteLargeMatches.length,
      description: `Favori modéré domicile (1.5-1.8): gagne ${Math.round((homeWinCount / homeFavoriteLargeMatches.length) * 100)}% (VN: ${Math.round((homeOrDrawCount / homeFavoriteLargeMatches.length) * 100)}%)`
    });
  }

  // 🆕 Task 32 — Pattern: prédiction ML accuracy (si predicted_result dispo)
  const predictionsWithResults = matches.filter(m =>
    m.predicted_result && m.result_match !== undefined
  );

  if (predictionsWithResults.length >= 10) {
    const correctCount = predictionsWithResults.filter(m => m.result_match === true).length;

    patterns.push({
      sport: 'football',
      pattern_type: 'prediction_accuracy',
      condition: 'all_predictions',
      outcome: 'correct_prediction',
      success_rate: Math.round((correctCount / predictionsWithResults.length) * 100),
      sample_size: predictionsWithResults.length,
      description: `Taux de réussite global ML: ${Math.round((correctCount / predictionsWithResults.length) * 100)}%`
    });

    // 🆕 Task 32 — Pattern: accuracy par tranche de risque
    const riskBuckets = [
      { range: '0-25', min: 0, max: 25 },
      { range: '25-35', min: 25, max: 35 },
      { range: '35-45', min: 35, max: 45 },
    ];
    for (const bucket of riskBuckets) {
      const inBucket = predictionsWithResults.filter(m =>
        typeof m.risk_percentage === 'number' &&
        m.risk_percentage >= bucket.min && m.risk_percentage < bucket.max
      );
      if (inBucket.length >= 10) {
        const correctInBucket = inBucket.filter(m => m.result_match === true).length;
        patterns.push({
          sport: 'football',
          pattern_type: `prediction_risk_${bucket.range}`,
          condition: `risk ${bucket.range}%`,
          outcome: 'correct_prediction',
          success_rate: Math.round((correctInBucket / inBucket.length) * 100),
          sample_size: inBucket.length,
          description: `ML risque ${bucket.range}%: ${Math.round((correctInBucket / inBucket.length) * 100)}% réussite (${inBucket.length} matchs)`
        });
      }
    }
  }

  // 🆕 Task 32 — Pattern: VN (nul = gagné) sur favoris domicile
  if (homeFavoriteMatches.length >= 5) {
    const homeOrDrawCount = homeFavoriteMatches.filter(m =>
      m.home_score! >= m.away_score!
    ).length;
    patterns.push({
      sport: 'football',
      pattern_type: 'home_favorite_vn',
      condition: 'odds_home < 1.5 (VN: nul=gagné)',
      outcome: 'home_win_or_draw',
      success_rate: Math.round((homeOrDrawCount / homeFavoriteMatches.length) * 100),
      sample_size: homeFavoriteMatches.length,
      description: `Favori domicile VN (nul=gagné): ${Math.round((homeOrDrawCount / homeFavoriteMatches.length) * 100)}% (${homeFavoriteMatches.length} matchs)`
    });
  }

  // ── Patterns basés sur xG (seulement si ≥5 matchs ont des xG) ──
  const matchesWithXg = matches.filter(m =>
    m.home_xg !== undefined && m.away_xg !== undefined &&
    m.home_score !== undefined && m.away_score !== undefined
  );

  if (matchesWithXg.length >= 5) {
    // Pattern: xG differential > 0.5 = favori gagne
    const xgDiffMatches = matchesWithXg.filter(m =>
      Math.abs(m.home_xg! - m.away_xg!) >= 0.5
    );

    if (xgDiffMatches.length >= 5) {
      const successCount = xgDiffMatches.filter(m => {
        const favorite = m.home_xg! > m.away_xg! ? 'home' : 'away';
        const actualWinner = m.home_score! > m.away_score! ? 'home' :
                            m.away_score! > m.home_score! ? 'away' : 'draw';
        return favorite === actualWinner;
      }).length;

      patterns.push({
        sport: 'football',
        pattern_type: 'xg_differential',
        condition: 'xG_diff >= 0.5',
        outcome: 'xg_favorite_wins',
        success_rate: Math.round((successCount / xgDiffMatches.length) * 100),
        sample_size: xgDiffMatches.length,
        description: `Écart xG >= 0.5: favori gagne ${Math.round((successCount / xgDiffMatches.length) * 100)}%`
      });
    }

    // Pattern: Under 2.5 quand xG total < 2.2
    const lowXgMatches = matchesWithXg.filter(m =>
      (m.home_xg! + m.away_xg!) < 2.2
    );

    if (lowXgMatches.length >= 5) {
      const underCount = lowXgMatches.filter(m =>
        (m.home_score! + m.away_score!) < 2.5
      ).length;

      patterns.push({
        sport: 'football',
        pattern_type: 'under_xg_threshold',
        condition: 'xG_total < 2.2',
        outcome: 'under_2.5',
        success_rate: Math.round((underCount / lowXgMatches.length) * 100),
        sample_size: lowXgMatches.length,
        description: `xG total < 2.2: Under 2.5 réussit ${Math.round((underCount / lowXgMatches.length) * 100)}%`
      });
    }

    // Pattern: Over 2.5 quand xG total > 2.8
    const highXgMatches = matchesWithXg.filter(m =>
      (m.home_xg! + m.away_xg!) >= 2.8
    );

    if (highXgMatches.length >= 5) {
      const overCount = highXgMatches.filter(m =>
        (m.home_score! + m.away_score!) >= 2.5
      ).length;

      patterns.push({
        sport: 'football',
        pattern_type: 'over_xg_threshold',
        condition: 'xG_total >= 2.8',
        outcome: 'over_2.5',
        success_rate: Math.round((overCount / highXgMatches.length) * 100),
        sample_size: highXgMatches.length,
        description: `xG total >= 2.8: Over 2.5 réussit ${Math.round((overCount / highXgMatches.length) * 100)}%`
      });
    }
  }

  return patterns;
}

/**
 * Détecte les patterns Basketball (NBA) depuis les matchs
 * Task 34 (hygiène): EXCLUT la Summer League — totaux ~170-190 (40 min, jeunes
 * joueurs) qui polluaient le pattern over_220 (taux historique aberrant ~3%).
 */
function detectBasketballPatterns(matches: MatchForTraining[]): PatternDiscovery[] {
  const patterns: PatternDiscovery[] = [];
  
  const nbaMatches = matches.filter(m => {
    const s = (m.sport || '').toLowerCase();
    if (!(s === 'basketball' || s === 'nba' || s === 'basket')) return false;
    const league = (m.league || '').toLowerCase();
    if (league.includes('summer') || league.includes('preseason') || league.includes('pre-season')) return false;
    return true;
  });
  
  if (nbaMatches.length < 5) return patterns;
  
  // Pattern: Avantage domicile NBA
  const homeWinCount = nbaMatches.filter(m => 
    m.home_score !== undefined && m.away_score !== undefined &&
    m.home_score > m.away_score
  ).length;
  
  const matchesWithScores = nbaMatches.filter(m => 
    m.home_score !== undefined && m.away_score !== undefined
  );
  
  if (matchesWithScores.length >= 10) {
    patterns.push({
      sport: 'basketball',
      pattern_type: 'home_advantage',
      condition: 'NBA home game',
      outcome: 'home_win',
      success_rate: Math.round((homeWinCount / matchesWithScores.length) * 100),
      sample_size: matchesWithScores.length,
      description: `Avantage domicile NBA: ${Math.round((homeWinCount / matchesWithScores.length) * 100)}%`
    });
  }
  
  // Pattern: Over 220 points
  const overMatches = matchesWithScores.filter(m => 
    (m.home_score! + m.away_score!) >= 220
  );
  
  if (matchesWithScores.length >= 10) {
    patterns.push({
      sport: 'basketball',
      pattern_type: 'over_threshold',
      condition: 'NBA total points',
      outcome: 'over_220',
      success_rate: Math.round((overMatches.length / matchesWithScores.length) * 100),
      sample_size: matchesWithScores.length,
      description: `Over 220 points NBA: ${Math.round((overMatches.length / matchesWithScores.length) * 100)}%`
    });
  }
  
  return patterns;
}

/**
 * Détecte les patterns Hockey (NHL) depuis les matchs
 */
function detectHockeyPatterns(matches: MatchForTraining[]): PatternDiscovery[] {
  const patterns: PatternDiscovery[] = [];
  
  const nhlMatches = matches.filter(m => 
    m.sport === 'hockey' || m.sport === 'nhl'
  );
  
  if (nhlMatches.length < 5) return patterns;
  
  const matchesWithScores = nhlMatches.filter(m => 
    m.home_score !== undefined && m.away_score !== undefined
  );
  
  // Pattern: Avantage domicile NHL
  const homeWinCount = matchesWithScores.filter(m => 
    m.home_score! > m.away_score!
  ).length;
  
  if (matchesWithScores.length >= 10) {
    patterns.push({
      sport: 'hockey',
      pattern_type: 'home_advantage',
      condition: 'NHL home game',
      outcome: 'home_win',
      success_rate: Math.round((homeWinCount / matchesWithScores.length) * 100),
      sample_size: matchesWithScores.length,
      description: `Avantage domicile NHL: ${Math.round((homeWinCount / matchesWithScores.length) * 100)}%`
    });
  }

  // Pattern: Over 5.5 buts NHL
  if (matchesWithScores.length >= 10) {
    const overCount = matchesWithScores.filter(m =>
      (m.home_score! + m.away_score!) >= 6
    ).length;
    patterns.push({
      sport: 'hockey',
      pattern_type: 'total_goals',
      condition: 'NHL total goals',
      outcome: 'over_5.5',
      success_rate: Math.round((overCount / matchesWithScores.length) * 100),
      sample_size: matchesWithScores.length,
      description: `Over 5.5 buts NHL: ${Math.round((overCount / matchesWithScores.length) * 100)}%`
    });
  }

  return patterns;
}

/**
 * Détecte les patterns Tennis depuis les matchs
 */
function detectTennisPatterns(matches: MatchForTraining[]): PatternDiscovery[] {
  const patterns: PatternDiscovery[] = [];

  const tennisMatches = matches.filter(m =>
    m.sport === 'tennis' || m.sport === 'Tennis'
  );

  if (tennisMatches.length < 5) return patterns;

  const matchesWithScores = tennisMatches.filter(m =>
    m.home_score !== undefined && m.away_score !== undefined
  );

  if (matchesWithScores.length < 5) return patterns;

  // Pattern: Gros favori (cote < 1.4) gagne
  const favoriteMatches = matchesWithScores.filter(m =>
    m.odds_home !== undefined && m.odds_home < 1.4
  );

  if (favoriteMatches.length >= 5) {
    const favWinCount = favoriteMatches.filter(m =>
      m.home_score! > m.away_score!
    ).length;
    patterns.push({
      sport: 'tennis',
      pattern_type: 'heavy_favorite',
      condition: 'odds_home < 1.4',
      outcome: 'player1_win',
      success_rate: Math.round((favWinCount / favoriteMatches.length) * 100),
      sample_size: favoriteMatches.length,
      description: `Gros favori tennis (< 1.4): gagne ${Math.round((favWinCount / favoriteMatches.length) * 100)}%`
    });
  }

  // Pattern: Underdog gagne quand cote > 3.0
  const underdogMatches = matchesWithScores.filter(m =>
    m.odds_home !== undefined && m.odds_home > 3.0
  );

  if (underdogMatches.length >= 5) {
    const dogWinCount = underdogMatches.filter(m =>
      m.home_score! > m.away_score!
    ).length;
    patterns.push({
      sport: 'tennis',
      pattern_type: 'underdog_win',
      condition: 'odds_home > 3.0',
      outcome: 'player1_win',
      success_rate: Math.round((dogWinCount / underdogMatches.length) * 100),
      sample_size: underdogMatches.length,
      description: `Outsider tennis (> 3.0): gagne ${Math.round((dogWinCount / underdogMatches.length) * 100)}%`
    });
  }

  // Pattern: Match serré (3 sets)
  const closeMatches = matchesWithScores.filter(m => {
    if (m.home_sets_won !== undefined && m.away_sets_won !== undefined) {
      return (m.home_sets_won + m.away_sets_won) === 3;
    }
    return (m.home_score! >= 2 && m.away_score! >= 1) || (m.home_score! >= 1 && m.away_score! >= 2);
  });

  if (closeMatches.length >= 5) {
    patterns.push({
      sport: 'tennis',
      pattern_type: 'three_set_match',
      condition: 'close match 3 sets',
      outcome: 'competitive',
      success_rate: Math.round((closeMatches.length / matchesWithScores.length) * 100),
      sample_size: closeMatches.length,
      description: `Match serré 3 sets: ${Math.round((closeMatches.length / matchesWithScores.length) * 100)}%`
    });
  }

  // Pattern: Avantage J1 Grand Slam
  const gsKeywords = ['grand slam', 'wimbledon', 'roland garros', 'us open', 'australian open'];
  const gsMatches = matchesWithScores.filter(m => {
    const league = (m.league || '').toLowerCase();
    return gsKeywords.some(k => league.includes(k));
  });

  if (gsMatches.length >= 5) {
    const j1Win = gsMatches.filter(m => m.home_score! > m.away_score!).length;
    patterns.push({
      sport: 'tennis',
      pattern_type: 'grand_slam_home_advantage',
      condition: 'Grand Slam tournament',
      outcome: 'player1_win',
      success_rate: Math.round((j1Win / gsMatches.length) * 100),
      sample_size: gsMatches.length,
      description: `Avantage J1 Grand Slam: ${Math.round((j1Win / gsMatches.length) * 100)}%`
    });
  }

  return patterns;
}

/**
 * Détecte les patterns Baseball (MLB) depuis les matchs
 */
function detectBaseballPatterns(matches: MatchForTraining[]): PatternDiscovery[] {
  const patterns: PatternDiscovery[] = [];

  const mlbMatches = matches.filter(m =>
    m.sport === 'baseball' || m.sport === 'mlb'
  );

  if (mlbMatches.length < 5) return patterns;

  const matchesWithScores = mlbMatches.filter(m =>
    m.home_score !== undefined && m.away_score !== undefined
  );

  if (matchesWithScores.length < 5) return patterns;

  // Pattern: Avantage domicile MLB
  if (matchesWithScores.length >= 10) {
    const homeWinCount = matchesWithScores.filter(m =>
      m.home_score! > m.away_score!
    ).length;
    patterns.push({
      sport: 'baseball',
      pattern_type: 'home_advantage',
      condition: 'MLB home game',
      outcome: 'home_win',
      success_rate: Math.round((homeWinCount / matchesWithScores.length) * 100),
      sample_size: matchesWithScores.length,
      description: `Avantage domicile MLB: ${Math.round((homeWinCount / matchesWithScores.length) * 100)}%`
    });
  }

  // Pattern: Over 8.5 points MLB
  if (matchesWithScores.length >= 10) {
    const overCount = matchesWithScores.filter(m =>
      (m.home_score! + m.away_score!) >= 9
    ).length;
    patterns.push({
      sport: 'baseball',
      pattern_type: 'total_runs',
      condition: 'MLB total runs',
      outcome: 'over_8.5',
      success_rate: Math.round((overCount / matchesWithScores.length) * 100),
      sample_size: matchesWithScores.length,
      description: `Over 8.5 points MLB: ${Math.round((overCount / matchesWithScores.length) * 100)}%`
    });
  }

  return patterns;
}

// ============================================
// SEUILS DYNAMIQUES PAR SPORT
// ============================================

const SPORT_THRESHOLDS: Record<string, number> = {
  football: 55,
  basketball: 52,
  hockey: 52,
  baseball: 50,
  tennis: 52
};

// ============================================
// ENTRAÎNEMENT PRINCIPAL
// ============================================

/**
 * Entraîne le modèle ML avec les données disponibles
 */
export async function trainUnifiedML(sport?: 'football' | 'basketball' | 'hockey' | 'baseball' | 'tennis' | 'all'): Promise<TrainingResult> {
  const result: TrainingResult = {
    success: false,
    samplesUsed: 0,
    patternsDiscovered: 0,
    patternsSaved: 0,
    patternsUpdated: 0,
    accuracy: 0,
    improvements: [],
    errors: [],
    rejectedByThreshold: [],
    matchesBySport: {},
  };
  
  const supabase = getSupabase();
  if (!supabase) {
    result.errors.push('Supabase non configuré');
    return result;
  }
  
  console.log('🧠 UnifiedML: Démarrage de l\'entraînement...');
  
  try {
    // 1. Charger les matchs terminés depuis Supabase
    const { data: matches, error: matchError } = await supabase
      .from('predictions')
      .select('*')
      .eq('status', 'completed')
      .not('home_score', 'is', null)
      .not('away_score', 'is', null)
      .order('match_date', { ascending: false })
      .limit(1000);
    
    if (matchError) {
      result.errors.push('Erreur chargement matchs: ' + matchError.message);
      return result;
    }
    
    if (!matches || matches.length === 0) {
      result.errors.push('Aucun match terminé disponible');
      return result;
    }
    
    result.samplesUsed = matches.length;
    
    // 🆕 Task 32 — diagnostic répartition par sport (normalisation sport insensible à la casse)
    const bySport: Record<string, number> = {};
    for (const m of matches) {
      const s = String(m.sport || 'unknown').toLowerCase();
      bySport[s] = (bySport[s] || 0) + 1;
    }
    result.matchesBySport = bySport;
    console.log(`📊 UnifiedML: ${matches.length} matchs analysés — répartition:`, bySport);
    
    // 2. Détecter les patterns par sport
    // 🆕 Task 32 — normalisation insensible à la casse: 'Football', 'NBA', 'NHL',
    // 'MLB', 'Tennis' en DB ne doivent pas faire échouer la détection
    const sportOf = (m: any): string => String(m.sport || '').toLowerCase();
    let allPatterns: PatternDiscovery[] = [];
    
    if (!sport || sport === 'all' || sport === 'football') {
      const footballMatches = matches.filter((m: any) => {
        const s = sportOf(m);
        return s === 'football' || s === 'soccer' || s === 'foot' || s.includes('soccer') || s.includes('football');
      });
      allPatterns = [...allPatterns, ...detectFootballPatterns(footballMatches as MatchForTraining[])];
    }
    
    if (!sport || sport === 'all' || sport === 'basketball') {
      const basketballMatches = matches.filter((m: any) => {
        const s = sportOf(m);
        return s === 'basketball' || s === 'nba' || s === 'basket' || s.includes('basket');
      });
      allPatterns = [...allPatterns, ...detectBasketballPatterns(basketballMatches as MatchForTraining[])];
    }
    
    if (!sport || sport === 'all' || sport === 'hockey') {
      const hockeyMatches = matches.filter((m: any) => {
        const s = sportOf(m);
        return s === 'hockey' || s === 'nhl' || s.includes('hockey');
      });
      allPatterns = [...allPatterns, ...detectHockeyPatterns(hockeyMatches as MatchForTraining[])];
    }
    
    if (!sport || sport === 'all' || sport === 'tennis') {
      const tennisMatches = matches.filter((m: any) => {
        const s = sportOf(m);
        return s === 'tennis' || s.includes('tennis');
      });
      allPatterns = [...allPatterns, ...detectTennisPatterns(tennisMatches as MatchForTraining[])];
    }
    
    if (!sport || sport === 'all' || sport === 'baseball') {
      const baseballMatches = matches.filter((m: any) => {
        const s = sportOf(m);
        return s === 'baseball' || s === 'mlb' || s.includes('baseball');
      });
      allPatterns = [...allPatterns, ...detectBaseballPatterns(baseballMatches as MatchForTraining[])];
    }
    
    result.patternsDiscovered = allPatterns.length;
    console.log(`🔍 UnifiedML: ${allPatterns.length} patterns découverts:`, allPatterns.map(p => `${p.sport}/${p.pattern_type}=${p.success_rate}%(${p.sample_size})`));
    
    // 3. Charger les patterns existants
    const existingPatterns = await loadMLPatterns();
    
    // 4. Sauvegarder/mettre à jour les patterns (filtrer le bruit avec seuils dynamiques par sport)
    for (const pattern of allPatterns) {
      const sportThreshold = SPORT_THRESHOLDS[pattern.sport] || 55;
      if (pattern.success_rate < sportThreshold) {
        console.log(`🔇 UnifiedML: Pattern "${pattern.pattern_type}" ignoré (${pattern.sport}: ${pattern.success_rate}% < ${sportThreshold}%)`);
        result.rejectedByThreshold!.push({
          sport: pattern.sport,
          type: pattern.pattern_type,
          rate: pattern.success_rate,
          threshold: sportThreshold,
        });
        continue;
      }
      
      const existing = existingPatterns.find(
        p => p.sport === pattern.sport && p.pattern_type === pattern.pattern_type
      );
      
      if (existing) {
        // Mettre à jour le pattern existant
        const newSampleSize = existing.sample_size + pattern.sample_size;
        const newSuccessRate = Math.round(
          (existing.success_rate * existing.sample_size + 
           pattern.success_rate * pattern.sample_size) / newSampleSize
        );
        
        const updated = await updateMLPattern(existing.id, newSampleSize, newSuccessRate);
        if (updated === true) {
          result.patternsUpdated++;
          result.improvements.push(`Pattern "${pattern.pattern_type}" mis à jour: ${newSuccessRate}% (${newSampleSize} échantillons)`);
        } else {
          // 🆕 Task 32 — l'échec d'update ne doit plus être silencieux (message exact si string)
          const detail = typeof updated === 'string' ? ` — ${updated}` : '';
          result.errors.push(`Échec update pattern "${pattern.pattern_type}" (id=${existing.id})${detail}`);
        }
      } else {
        // Créer un nouveau pattern
        const saved = await saveMLPattern({
          sport: pattern.sport as MLPattern['sport'],
          pattern_type: pattern.pattern_type,
          condition: pattern.condition,
          outcome: pattern.outcome,
          sample_size: pattern.sample_size,
          success_rate: pattern.success_rate,
          confidence: Math.min(pattern.success_rate / 100, 0.95),
          description: pattern.description
        });
        
        if (saved) {
          result.patternsSaved++;
          result.improvements.push(`Nouveau pattern "${pattern.pattern_type}": ${pattern.success_rate}% (${pattern.sample_size} échantillons)`);
        } else {
          // 🆕 Task 32 — l'échec d'insert ne doit plus être silencieux
          result.errors.push(`Échec insert pattern "${pattern.pattern_type}" (${pattern.sport})`);
        }
      }
    }
    
    // 5. Mettre à jour le modèle ML
    const model = await loadMLModel();
    
    // Calculer l'accuracy globale
    const completedWithResults = matches.filter(m => m.result_match !== undefined);
    const correctCount = completedWithResults.filter(m => m.result_match === true).length;
    const newAccuracy = completedWithResults.length > 0 
      ? Math.round((correctCount / completedWithResults.length) * 100) 
      : 0;
    
    // Optimiser le seuil d'edge
    let bestEdgeThreshold = model.edge_threshold;
    let bestEdgeAccuracy = 0;
    
    for (let threshold = 0.01; threshold <= 0.10; threshold += 0.005) {
      const aboveThreshold = completedWithResults.filter(m => {
        // Utiliser les odds pour calculer l'edge si disponible
        if (m.odds_home && m.odds_away) {
          const impliedProb = 1 / m.odds_home;
          const edge = Math.abs(impliedProb - 0.5); // Simplifié
          return edge >= threshold;
        }
        return true;
      });
      
      if (aboveThreshold.length >= 10) {
        const correctAbove = aboveThreshold.filter(m => m.result_match === true).length;
        const accuracy = correctAbove / aboveThreshold.length;
        
        if (accuracy > bestEdgeAccuracy) {
          bestEdgeAccuracy = accuracy;
          bestEdgeThreshold = threshold;
        }
      }
    }
    
    // Mettre à jour le modèle
    // GARDE-FOU v3: si loadMLModel a retourné le modèle par défaut (échec
    // transient Supabase au chargement), ne JAMAIS sauvegarder — on écraserait
    // xgboost_params (dont les arbres exportés) avec le defaultModel vide.
    const modelLooksLikeDefault = !model.samples_used && !model.xgboost_params?.trained;
    if (modelLooksLikeDefault) {
      result.errors.push(
        'UnifiedML: modèle source = défaut (ml_model illisible ?) — sauvegarde annulée pour protéger xgboost_params'
      );
      console.error('🛑 UnifiedML: sauvegarde annulée (modèle source = fallback défaut, possible échec Supabase au chargement)');
      return result;
    }

    const updatedModel: MLModel = {
      ...model,
      version: incrementVersion(model.version),
      edge_threshold: bestEdgeThreshold,
      samples_used: matches.length,
      accuracy: newAccuracy,
      last_trained: new Date().toISOString()
    };
    
    await saveMLModel(updatedModel);
    
    result.accuracy = newAccuracy;
    result.success = true;
    
    console.log(`✅ UnifiedML: Entraînement terminé - ${result.patternsSaved} nouveaux, ${result.patternsUpdated} mis à jour, ${newAccuracy}% accuracy`);
    
    return result;
    
  } catch (e) {
    console.error('❌ UnifiedML: Exception entraînement:', e);
    result.errors.push(String(e));
    return result;
  }
}

/**
 * Incrémente la version du modèle (semver-lite, robuste aux corruptions).
 *
 * 🆕 Task 32 — FIX: la version stockée en DB a pu être corrompue à un moment
 * (chaîne vide, "NaN", "undefined", etc.) → l'ancien code produisait "NaN..1"
 * qui restait bloqué (le split retournait [NaN] puis parts[2] = 1 → join = "NaN..1").
 *
 * Stratégie :
 *   - Si la version entrante est invalide (vide, NaN, moins de 3 segments),
 *     on repart de "1.0.0" (réinitialisation propre, pas de corruption cascade).
 *   - Sinon on incrémente le patch (parts[2] + 1) en préservant major.minor.
 *
 * Exemples:
 *   "1.0.0"  → "1.0.1"
 *   "2.3.7"  → "2.3.8"
 *   ""       → "1.0.0"   (était "NaN..1" avant — BUG)
 *   "NaN"    → "1.0.0"   (était "NaN..1" avant)
 *   "1"      → "1.0.1"   (était "1..1" avant)
 */
function incrementVersion(version: string): string {
  if (typeof version !== 'string' || version.trim() === '') {
    return '1.0.0';
  }
  const parts = version.split('.').map(s => {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  });
  // S'assurer d'avoir au moins 3 segments [major, minor, patch]
  while (parts.length < 3) parts.push(0);
  parts[2] = (parts[2] || 0) + 1;
  return parts.slice(0, 3).join('.');
}

// ============================================
// XGBOOST PREDICTION ENGINE
// ============================================

/**
 * Score une prédiction en utilisant les paramètres XGBoost entraînés.
 * Simule un modèle XGBoost en appliquant les feature importances apprises.
 *
 * Retourne un score 0-1 et un ajustement de confiance basé sur le modèle.
 */
/**
 * scoreWithXGBoost — v3: REPLAY FIDÈLE des arbres XGBoost entraînés.
 * ════════════════════════════════════════════════════════════════════
 * Ancienne implémentation (RETIREE): moyenne pondérée des feature
 * importances. Problèmes fatals:
 *   1. Les importances (gain) sont toujours positives → la DIRECTION des
 *      effets était ignorée: une prob_away élevée AUGMENTAIT le score
 *      "home". Le scoring prod contredisait le modèle entraîné.
 *   2. Une moyenne linéaire ne peut pas reproduire des arbres non linéaires.
 *
 * v3: ml/train_xgboost.py exporte les arbres (format xgb_dump_v1) avec
 * auto-vérification (le replay Python reproduit predict_proba à 1e-4).
 * Ici on rejoue exactement ces arbres:
 *   margin = Σ feuilles des arbres + margin_offset
 *   p = sigmoid(margin)  →  Platt optionnel: p = sigmoid(A·margin + B)
 * Le score est une P(victoire domicile | match décidé), même cible qu'au
 * training. Feature absente → 0 (identique au fillna(0) du training).
 * Pas d'arbres exportés → isXGBoostTrained: false (heuristiques pures).
 */
function evalXGBTree(
  node: XGBTreeNode,
  features: Record<string, number>,
  featureNames: string[],
  usage: Map<string, number> | null
): number {
  if (node.v !== undefined) return node.v;
  const name = node.f !== undefined ? featureNames[node.f] : undefined;
  if (name === undefined) return 0;
  if (usage) usage.set(name, (usage.get(name) || 0) + 1);
  // Politique identique au training: fillna(0)
  let v = features[name];
  if (v === undefined || v === null || Number.isNaN(v)) v = 0;
  // ⚠️ XGBoost compare les splits en FLOAT32 — Math.fround reproduit ce cast.
  // Double-cast: la valeur ET le seuil (le seuil JSON à 9 chiffres redevient
  // exactement le float32 d'origine, l'erreur étant < demi-ulp).
  const v32 = Math.fround(v);
  const t32 = Math.fround(node.t ?? 0);
  // Convention XGBoost: gauche (y) si valeur < seuil
  return v32 < t32
    ? evalXGBTree(node.y!, features, featureNames, usage)
    : evalXGBTree(node.n!, features, featureNames, usage);
}

export function scoreWithXGBoost(
  sport: string,
  features: Record<string, number>,
  model: MLModel
): {
  score: number;
  isXGBoostTrained: boolean;
  cvAccuracy: number;
  confidenceThreshold: number;
  featureContributions: { feature: string; weight: number; value: number }[];
  recommendation: string;
} {
  // Default: no XGBoost trained
  const defaultResponse = {
    score: 0.5,
    isXGBoostTrained: false,
    cvAccuracy: 0,
    confidenceThreshold: 0.5,
    featureContributions: [],
    recommendation: 'ML heuristique (pas de modèle XGBoost rejouable)'
  };

  if (!model.xgboost_params?.trained) {
    return defaultResponse;
  }

  const sportLower = sport.toLowerCase();
  const sportParams = model.xgboost_params.sports?.[sportLower] ||
                     model.xgboost_params.sports?.[sport];

  if (!sportParams) {
    return defaultResponse;
  }

  const dump = sportParams.tree_dump;
  // Sans arbres exportés (ancien modèle v2 ou dump annulé au training),
  // on refuse de scorer — l'ancienne moyenne pondérée était directionnellement fausse.
  if (
    !dump ||
    dump.format !== 'xgb_dump_v1' ||
    !Array.isArray(dump.trees) ||
    dump.trees.length === 0 ||
    !Array.isArray(dump.features) ||
    dump.features.length === 0
  ) {
    return defaultResponse;
  }

  try {
    // ── Replay des arbres ──
    const usage = new Map<string, number>();
    let margin = dump.margin_offset || 0;
    for (const tree of dump.trees) {
      margin += evalXGBTree(tree, features, dump.features, usage);
    }

    // ── Proba brute: sigmoid de la marge ──
    const clampM = Math.max(-30, Math.min(30, margin));
    let p = 1 / (1 + Math.exp(-clampM));

    // ── Calibration Platt (fit holdout au training, optionnelle) ──
    const platt = sportParams.platt;
    if (platt && platt.applied && platt.input === 'margin' &&
        typeof platt.a === 'number' && Number.isFinite(platt.a) && platt.a !== 0) {
      const m2 = platt.a * margin + platt.b;
      p = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, m2))));
    }

    // Clamp de stabilité pour le downstream (comme l'ancien [0.05, 0.95])
    const finalScore = Math.max(0.03, Math.min(0.97, p));

    // ── Contributions: features réellement utilisées le long des chemins ──
    const contributions = [...usage.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([feature, count]) => ({
        feature,
        weight: count / dump.trees.length,
        value: features[feature] ?? 0,
      }));

    // ── Recommandation ──
    const threshold = sportParams.best_confidence_threshold || 0.5;
    const isAboveThreshold = finalScore >= threshold;
    const holdoutAcc = sportParams.holdout?.accuracy ?? sportParams.cv_accuracy;
    const reliability = holdoutAcc > 0.6 ? 'fiable' : 'prudent';
    let recommendation = '';
    if (isAboveThreshold && finalScore >= 0.7) {
      recommendation = `🏆 XGBoost CONFORT home (${(finalScore * 100).toFixed(0)}%) — ${reliability}`;
    } else if (isAboveThreshold) {
      recommendation = `✅ XGBoost favorable home (${(finalScore * 100).toFixed(0)}%)`;
    } else if (finalScore <= 1 - threshold && finalScore <= 0.3) {
      recommendation = `🔻 XGBoost favorable away (${((1 - finalScore) * 100).toFixed(0)}%)`;
    } else {
      recommendation = `⚠️ XGBoost incertain (${(finalScore * 100).toFixed(0)}% home)`;
    }

    return {
      score: finalScore,
      isXGBoostTrained: true,
      cvAccuracy: sportParams.cv_accuracy,
      confidenceThreshold: sportParams.best_confidence_threshold,
      featureContributions: contributions,
      recommendation
    };
  } catch {
    // Toute erreur de replay → fallback heuristique (jamais de score fantaisiste)
    return defaultResponse;
  }
}
/**
 * Obtient les stats XGBoost pour affichage
 */
export function getXGBoostStatus(model: MLModel): {
  trained: boolean;
  totalSamples: number;
  globalCvAccuracy: number;
  bestEdgeThreshold: number;
  sports: { sport: string; cvAccuracy: number; samples: number; topFeatures: string[] }[];
  lastTrained: string;
  version: string;
} {
  if (!model.xgboost_params?.trained) {
    return {
      trained: false,
      totalSamples: 0,
      globalCvAccuracy: 0,
      bestEdgeThreshold: model.edge_threshold,
      sports: [],
      lastTrained: model.last_trained,
      version: model.version
    };
  }

  const xgb = model.xgboost_params;
  const sportList = Object.entries(xgb.sports || {}).map(([sport, params]) => ({
    sport,
    cvAccuracy: params.cv_accuracy,
    samples: params.samples,
    topFeatures: (params.top_features || []).slice(0, 5).map(f => f[0])
  }));

  return {
    trained: true,
    totalSamples: xgb.total_samples,
    globalCvAccuracy: xgb.global_cv_accuracy,
    bestEdgeThreshold: xgb.best_edge_threshold ?? model.edge_threshold,
    sports: sportList,
    lastTrained: model.last_trained,
    version: model.version
  };
}

// ============================================
// STATISTIQUES
// ============================================

/**
 * Obtient les statistiques ML globales
 */
export async function getUnifiedMLStats(): Promise<{
  model: MLModel | null;
  patterns: {
    total: number;
    football: number;
    basketball: number;
    hockey: number;
    tennis: number;
    baseball: number;
    avgSuccessRate: number;
  };
  recentTraining: {
    lastTrained: string;
    samplesUsed: number;
    accuracy: number;
  };
}> {
  const model = await loadMLModel();
  const patterns = await loadMLPatterns();
  
  const football = patterns.filter(p => p.sport === 'football');
  const basketball = patterns.filter(p => p.sport === 'basketball');
  const hockey = patterns.filter(p => p.sport === 'hockey');
  const tennis = patterns.filter(p => p.sport === 'tennis');
  const baseball = patterns.filter(p => p.sport === 'baseball');
  
  return {
    model,
    patterns: {
      total: patterns.length,
      football: football.length,
      basketball: basketball.length,
      hockey: hockey.length,
      tennis: tennis.length,
      baseball: baseball.length,
      avgSuccessRate: patterns.length > 0 
        ? Math.round(patterns.reduce((sum, p) => sum + p.success_rate, 0) / patterns.length)
        : 0
    },
    recentTraining: {
      lastTrained: model?.last_trained || 'Jamais',
      samplesUsed: model?.samples_used || 0,
      accuracy: model?.accuracy || 0
    }
  };
}

/**
 * Rafraîchit le cache ML
 */
export async function refreshMLCache(): Promise<void> {
  patternsCache = [];
  modelCache = null;
  lastCacheUpdate = 0;

  await Promise.all([
    loadMLPatterns(true),
    loadMLModel()
  ]);

  console.log('🔄 UnifiedML: Cache rafraîchi');
}

/**
 * P4 — Qualité de la section XGBoost d'un sport donné.
 * Porte d'activation du ML pour les sports non-football: un modèle baseball
 * n'est utilisé en prod QUE s'il a des arbres rejouables ET un CV ≥ 52%
 * (baseline hasard 2 issues = 50%) ET un edge strictement positif.
 * Retourne false si absent/sous-qualité → comportement historique (heuristiques).
 * Le résultat suit le cache du modèle (pas de requête supplémentaire).
 */
export async function getSportModelQuality(
  sport: 'football' | 'basketball' | 'hockey' | 'baseball' | 'tennis',
): Promise<{ ready: boolean; cvAccuracy?: number; edge?: number; reason: string }> {
  const model = await loadMLModel();
  const params: any = model?.xgboost_params;
  if (!params?.trained) return { ready: false, reason: 'model_not_trained' };

  const sportParams: any = params.sports?.[sport];
  if (!sportParams) return { ready: false, reason: 'section_absente' };
  if (!sportParams.tree_dump || sportParams.scoring !== 'trees') {
    return { ready: false, cvAccuracy: sportParams.cv_accuracy, reason: 'arbres_absents' };
  }

  const cv = typeof sportParams.cv_accuracy === 'number' ? sportParams.cv_accuracy : 0;
  const edge = typeof sportParams.edge_vs_random === 'number' ? sportParams.edge_vs_random : 0;
  if (cv < 0.52) return { ready: false, cvAccuracy: cv, edge, reason: `cv_sous_seuil_52 (${(cv * 100).toFixed(1)}%)` };
  if (edge <= 0) return { ready: false, cvAccuracy: cv, edge, reason: 'edge_non_positif' };

  return { ready: true, cvAccuracy: cv, edge, reason: 'ok' };
}

// Export par défaut
export default {
  loadMLModel,
  saveMLModel,
  loadMLPatterns,
  saveMLPattern,
  updateMLPattern,
  trainUnifiedML,
  getUnifiedMLStats,
  refreshMLCache,
  scoreWithXGBoost,
  getXGBoostStatus,
  getSportModelQuality
};
