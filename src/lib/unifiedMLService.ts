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
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Type pour le client Supabase
type GenericSupabaseClient = SupabaseClient<any, any, any>;

// ============================================
// TYPES
// ============================================

export interface MLPattern {
  id: string;
  sport: 'football' | 'basketball' | 'hockey' | 'baseball';
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
          : data.confidence_weights
      } as MLModel;
      lastCacheUpdate = now;
      console.log(`✅ UnifiedML: Modèle v${modelCache.version} chargé (${modelCache.samples_used} échantillons, ${modelCache.accuracy}% accuracy)`);
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
 */
export async function saveMLPattern(pattern: Omit<MLPattern, 'id' | 'last_updated' | 'created_at'>): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('ml_patterns')
      .insert({
        ...pattern,
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
 */
export async function updateMLPattern(patternId: string, sampleSize: number, successRate: number): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('ml_patterns')
      .update({
        sample_size: sampleSize,
        success_rate: successRate,
        last_updated: new Date().toISOString()
      })
      .eq('id', patternId);
    
    if (error) {
      console.error('❌ UnifiedML: Erreur mise à jour pattern:', error.message);
      return false;
    }
    
    // Rafraîchir le cache
    patternsCache = [];
    await loadMLPatterns(true);
    
    return true;
  } catch (e) {
    console.error('❌ UnifiedML: Exception mise à jour pattern:', e);
    return false;
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
  
  // Pattern: xG differential > 0.5 = favori gagne
  const xgDiffMatches = matches.filter(m => 
    m.home_xg !== undefined && m.away_xg !== undefined && 
    Math.abs(m.home_xg - m.away_xg) >= 0.5 &&
    m.home_score !== undefined && m.away_score !== undefined
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
  const lowXgMatches = matches.filter(m => 
    m.home_xg !== undefined && m.away_xg !== undefined && 
    (m.home_xg + m.away_xg) < 2.2 &&
    m.home_score !== undefined && m.away_score !== undefined
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
  const highXgMatches = matches.filter(m => 
    m.home_xg !== undefined && m.away_xg !== undefined && 
    (m.home_xg + m.away_xg) >= 2.8 &&
    m.home_score !== undefined && m.away_score !== undefined
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
  
  // Pattern: Favori à domicile (cotes < 1.5)
  const homeFavoriteMatches = matches.filter(m => 
    m.odds_home !== undefined && m.odds_home < 1.5 &&
    m.home_score !== undefined && m.away_score !== undefined
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
  
  // Pattern: Pronostics corrects par niveau de confiance
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
      description: `Taux de réussite global: ${Math.round((correctCount / predictionsWithResults.length) * 100)}%`
    });
  }
  
  return patterns;
}

/**
 * Détecte les patterns Basketball (NBA) depuis les matchs
 */
function detectBasketballPatterns(matches: MatchForTraining[]): PatternDiscovery[] {
  const patterns: PatternDiscovery[] = [];
  
  const nbaMatches = matches.filter(m => 
    m.sport === 'basketball' || m.sport === 'nba' || m.sport === 'Basket'
  );
  
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
  
  return patterns;
}

// ============================================
// ENTRAÎNEMENT PRINCIPAL
// ============================================

/**
 * Entraîne le modèle ML avec les données disponibles
 */
export async function trainUnifiedML(sport?: 'football' | 'basketball' | 'hockey' | 'all'): Promise<TrainingResult> {
  const result: TrainingResult = {
    success: false,
    samplesUsed: 0,
    patternsDiscovered: 0,
    patternsSaved: 0,
    patternsUpdated: 0,
    accuracy: 0,
    improvements: [],
    errors: []
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
    console.log(`📊 UnifiedML: ${matches.length} matchs analysés`);
    
    // 2. Détecter les patterns par sport
    let allPatterns: PatternDiscovery[] = [];
    
    if (!sport || sport === 'all' || sport === 'football') {
      const footballMatches = matches.filter(m => 
        m.sport === 'football' || m.sport === 'soccer' || m.sport === 'Foot'
      );
      allPatterns = [...allPatterns, ...detectFootballPatterns(footballMatches as MatchForTraining[])];
    }
    
    if (!sport || sport === 'all' || sport === 'basketball') {
      const basketballMatches = matches.filter(m => 
        m.sport === 'basketball' || m.sport === 'nba' || m.sport === 'Basket'
      );
      allPatterns = [...allPatterns, ...detectBasketballPatterns(basketballMatches as MatchForTraining[])];
    }
    
    if (!sport || sport === 'all' || sport === 'hockey') {
      const hockeyMatches = matches.filter(m => 
        m.sport === 'hockey' || m.sport === 'nhl'
      );
      allPatterns = [...allPatterns, ...detectHockeyPatterns(hockeyMatches as MatchForTraining[])];
    }
    
    result.patternsDiscovered = allPatterns.length;
    console.log(`🔍 UnifiedML: ${allPatterns.length} patterns découverts`);
    
    // 3. Charger les patterns existants
    const existingPatterns = await loadMLPatterns();
    
    // 4. Sauvegarder/mettre à jour les patterns (filtrer le bruit < 55%)
    for (const pattern of allPatterns) {
      // Ignorer les patterns avec taux de succès < 55% (bruit)
      if (pattern.success_rate < 55) {
        console.log(`🔇 UnifiedML: Pattern "${pattern.pattern_type}" ignoré (bruit: ${pattern.success_rate}%)`);
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
        if (updated) {
          result.patternsUpdated++;
          result.improvements.push(`Pattern "${pattern.pattern_type}" mis à jour: ${newSuccessRate}% (${newSampleSize} échantillons)`);
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
 * Incrémente la version du modèle
 */
function incrementVersion(version: string): string {
  const parts = version.split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1;
  return parts.join('.');
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
  
  return {
    model,
    patterns: {
      total: patterns.length,
      football: football.length,
      basketball: basketball.length,
      hockey: hockey.length,
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

// Export par défaut
export default {
  loadMLModel,
  saveMLModel,
  loadMLPatterns,
  saveMLPattern,
  updateMLPattern,
  trainUnifiedML,
  getUnifiedMLStats,
  refreshMLCache
};
