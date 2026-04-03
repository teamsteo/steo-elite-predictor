/**
 * ML Memory Service - Service de mémoire ML permanent
 * 
 * Ce service charge les patterns appris depuis Supabase et les utilise
 * pour améliorer les prédictions en temps réel.
 * 
 * Le système "se souvient" de son apprentissage et l'applique aux nouvelles analyses.
 */

import { createClient } from '@supabase/supabase-js';

// Configuration Supabase
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://aumsrakioetvvqopthbs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Types
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
}

export interface MatchAnalysis {
  homeTeam: string;
  awayTeam: string;
  league?: string;
  sport: 'football' | 'basketball' | 'hockey' | 'baseball';
  
  // Football
  homeXg?: number;
  awayXg?: number;
  homePossession?: number;
  awayPossession?: number;
  homeShots?: number;
  awayShots?: number;
  homeShotsOnTarget?: number;
  awayShotsOnTarget?: number;
  oddsHome?: number;
  oddsDraw?: number;
  oddsAway?: number;
  homeForm?: string;
  awayForm?: string;
  
  // Basketball
  homeFgPct?: number;
  awayFgPct?: number;
  homeRebounds?: number;
  awayRebounds?: number;
  homeAssists?: number;
  awayAssists?: number;
  homeAvgPoints?: number;
  awayAvgPoints?: number;
  
  // Hockey (NHL)
  homeCorsiPct?: number;
  awayCorsiPct?: number;
  homePdo?: number;
  awayPdo?: number;
  homeGoalieSvPct?: number;
  awayGoalieSvPct?: number;
  homePowerPlayPct?: number;
  awayPowerPlayPct?: number;
  
  // Baseball (MLB)
  homePitcherEra?: number;
  awayPitcherEra?: number;
  homePythWinPct?: number;
  awayPythWinPct?: number;
}

export interface MLPredictionBoost {
  patternId: string;
  patternType: string;
  condition: string;
  outcome: string;
  successRate: number;
  confidence: number;
  description: string;
  appliesToMatch: boolean;
  recommendation?: string;
}

export interface EnhancedPrediction {
  basePrediction: 'home' | 'draw' | 'away';
  mlBoostedPrediction: 'home' | 'draw' | 'away';
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  mlBoosts: MLPredictionBoost[];
  reasoning: string[];
  mlAccuracy: number;
}

// Cache des patterns
let patternsCache: MLPattern[] = [];
let lastCacheUpdate = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Client Supabase (type générique pour éviter les erreurs TypeScript)
let supabaseClient: any = null;

function getSupabase() {
  if (!supabaseClient && SUPABASE_URL && SUPABASE_KEY) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return supabaseClient;
}

/**
 * Charge les patterns ML depuis Supabase (avec cache)
 */
export async function loadMLPatterns(forceRefresh = false): Promise<MLPattern[]> {
  const now = Date.now();
  
  // Utiliser le cache si valide
  if (!forceRefresh && patternsCache.length > 0 && (now - lastCacheUpdate) < CACHE_DURATION) {
    return patternsCache;
  }
  
  const supabase = getSupabase();
  if (!supabase) {
    console.warn('⚠️ ML Memory: Supabase non configuré');
    return [];
  }
  
  try {
    const { data, error } = await supabase
      .from('ml_patterns')
      .select('*')
      .order('success_rate', { ascending: false });
    
    if (error) {
      console.error('❌ ML Memory: Erreur chargement patterns:', error.message);
      return patternsCache; // Retourner le cache existant
    }
    
    if (data && data.length > 0) {
      patternsCache = data as MLPattern[];
      lastCacheUpdate = now;
      console.log(`🧠 ML Memory: ${patternsCache.length} patterns chargés`);
    }
    
    return patternsCache;
  } catch (e) {
    console.error('❌ ML Memory: Exception:', e);
    return patternsCache;
  }
}

/**
 * Vérifie si un pattern s'applique à un match
 */
function checkPatternApplies(pattern: MLPattern, analysis: MatchAnalysis): boolean {
  switch (pattern.pattern_type) {
    // Football patterns
    case 'xg_differential':
      if (analysis.homeXg !== undefined && analysis.awayXg !== undefined) {
        return Math.abs(analysis.homeXg - analysis.awayXg) >= 0.5;
      }
      return false;
    
    case 'under_xg_threshold':
      if (analysis.homeXg !== undefined && analysis.awayXg !== undefined) {
        return (analysis.homeXg + analysis.awayXg) <= 2.2;
      }
      return false;
    
    case 'over_xg_threshold':
      if (analysis.homeXg !== undefined && analysis.awayXg !== undefined) {
        return (analysis.homeXg + analysis.awayXg) >= 2.8;
      }
      return false;
    
    case 'home_favorite':
    case 'home_favorite_low':
      if (analysis.oddsHome !== undefined) {
        return analysis.oddsHome < 1.5;
      }
      return false;
    
    // Basketball patterns
    case 'league_scoring_rate':
    case 'over_threshold':
      return analysis.sport === 'basketball';
    
    case 'home_advantage':
      return true; // Toujours applicable
    
    // Hockey (NHL) patterns
    case 'goalie_matchup':
      if (analysis.homeGoalieSvPct !== undefined && analysis.awayGoalieSvPct !== undefined) {
        return Math.abs(analysis.homeGoalieSvPct - analysis.awayGoalieSvPct) > 0.01;
      }
      return analysis.sport === 'hockey';
    
    case 'total_goals':
      return analysis.sport === 'hockey';
    
    case 'corsi_advantage':
      if (analysis.homeCorsiPct !== undefined && analysis.awayCorsiPct !== undefined) {
        return Math.abs(analysis.homeCorsiPct - analysis.awayCorsiPct) > 4;
      }
      return analysis.sport === 'hockey';
    
    case 'pdo_regression':
      if (analysis.homePdo !== undefined) {
        return analysis.homePdo > 103 || analysis.homePdo < 97;
      }
      if (analysis.awayPdo !== undefined) {
        return analysis.awayPdo > 103 || analysis.awayPdo < 97;
      }
      return analysis.sport === 'hockey';
    
    // Baseball (MLB) patterns
    case 'pitcher_matchup':
      if (analysis.homePitcherEra !== undefined && analysis.awayPitcherEra !== undefined) {
        return Math.abs(analysis.homePitcherEra - analysis.awayPitcherEra) > 1;
      }
      return analysis.sport === 'baseball';
    
    case 'total_runs':
      return analysis.sport === 'baseball';
    
    case 'pythagorean_expectation':
      if (analysis.homePythWinPct !== undefined && analysis.awayPythWinPct !== undefined) {
        return Math.abs(analysis.homePythWinPct - analysis.awayPythWinPct) > 0.1;
      }
      return analysis.sport === 'baseball';
    
    default:
      return false;
  }
}

/**
 * Génère une recommandation basée sur un pattern
 */
function generateRecommendation(pattern: MLPattern, analysis: MatchAnalysis): string {
  switch (pattern.pattern_type) {
    // Football
    case 'xg_differential':
      if (analysis.homeXg && analysis.awayXg) {
        const favorite = analysis.homeXg > analysis.awayXg ? analysis.homeTeam : analysis.awayTeam;
        return `${favorite} gagnant (xG: ${analysis.homeXg.toFixed(2)} vs ${analysis.awayXg.toFixed(2)})`;
      }
      return pattern.description;
    
    case 'under_xg_threshold':
      return `UNDER 2.5 buts (xG total: ${((analysis.homeXg || 0) + (analysis.awayXg || 0)).toFixed(2)})`;
    
    case 'over_xg_threshold':
      return `OVER 2.5 buts (xG total: ${((analysis.homeXg || 0) + (analysis.awayXg || 0)).toFixed(2)})`;
    
    case 'home_favorite':
    case 'home_favorite_low':
      return `${analysis.homeTeam} gagnant (cote: ${analysis.oddsHome})`;
    
    // Basketball
    case 'league_scoring_rate':
    case 'over_threshold':
      return `OVER 220 points (${pattern.success_rate}% des matchs NBA)`;
    
    // Hockey (NHL)
    case 'home_advantage':
      return `Avantage domicile NHL (${pattern.success_rate}%)`;
    
    case 'goalie_matchup':
      if (analysis.homeGoalieSvPct && analysis.awayGoalieSvPct) {
        const better = analysis.homeGoalieSvPct > analysis.awayGoalieSvPct ? analysis.homeTeam : analysis.awayTeam;
        return `${better} avantage gardien (${pattern.success_rate}%)`;
      }
      return `Matchup gardien favorable (${pattern.success_rate}%)`;
    
    case 'total_goals':
      return `Over 5.5 buts (${pattern.success_rate}% NHL)`;
    
    case 'corsi_advantage':
      if (analysis.homeCorsiPct && analysis.awayCorsiPct) {
        const better = analysis.homeCorsiPct > analysis.awayCorsiPct ? analysis.homeTeam : analysis.awayTeam;
        return `${better} domine possession Corsi (${pattern.success_rate}%)`;
      }
      return `Avantage Corsi (${pattern.success_rate}%)`;
    
    case 'pdo_regression':
      return `Régression PDO attendue (${pattern.success_rate}%)`;
    
    // Baseball (MLB)
    case 'pitcher_matchup':
      if (analysis.homePitcherEra && analysis.awayPitcherEra) {
        const better = analysis.homePitcherEra < analysis.awayPitcherEra ? analysis.homeTeam : analysis.awayTeam;
        return `${better} avantage lanceur (${pattern.success_rate}%)`;
      }
      return `Avantage lanceur (${pattern.success_rate}%)`;
    
    case 'total_runs':
      return `Over 8.5 points (${pattern.success_rate}% MLB)`;
    
    case 'pythagorean_expectation':
      return `Avantage Pythagorean (${pattern.success_rate}%)`;
    
    default:
      return pattern.description;
  }
}

/**
 * Analyse un match avec les patterns ML
 */
export async function analyzeMatchWithML(analysis: MatchAnalysis): Promise<EnhancedPrediction> {
  // Charger les patterns
  const patterns = await loadMLPatterns();
  
  // Filtrer par sport
  const sportPatterns = patterns.filter(p => p.sport === analysis.sport);
  
  // Prédiction de base (basée sur les cotes)
  let basePrediction: 'home' | 'draw' | 'away' = 'home';
  if (analysis.oddsHome && analysis.oddsAway) {
    if (analysis.oddsHome < analysis.oddsAway) {
      basePrediction = 'home';
    } else if (analysis.oddsAway < analysis.oddsHome) {
      basePrediction = 'away';
    } else {
      basePrediction = analysis.sport === 'football' ? 'draw' : 'home';
    }
  }
  
  // Analyser les patterns applicables
  const mlBoosts: MLPredictionBoost[] = [];
  const reasoning: string[] = [];
  let mlScore = { home: 0, draw: 0, away: 0 };
  
  for (const pattern of sportPatterns) {
    const applies = checkPatternApplies(pattern, analysis);
    
    const boost: MLPredictionBoost = {
      patternId: pattern.id,
      patternType: pattern.pattern_type,
      condition: pattern.condition,
      outcome: pattern.outcome,
      successRate: pattern.success_rate,
      confidence: pattern.confidence,
      description: pattern.description,
      appliesToMatch: applies
    };
    
    if (applies) {
      boost.recommendation = generateRecommendation(pattern, analysis);
      
      // Appliquer le boost selon le type de pattern
      const scoreBoost = pattern.success_rate * pattern.confidence;
      
      switch (pattern.outcome) {
        case 'home_win':
        case 'xg_favorite_wins':
          if (analysis.homeXg && analysis.awayXg && analysis.homeXg > analysis.awayXg) {
            mlScore.home += scoreBoost;
          } else if (analysis.homeXg && analysis.awayXg && analysis.awayXg > analysis.homeXg) {
            mlScore.away += scoreBoost;
          } else {
            mlScore.home += scoreBoost * 0.7; // Default home
          }
          break;
        
        case 'away_win':
          mlScore.away += scoreBoost;
          break;
        
        case 'over_2.5':
        case 'over_220':
          reasoning.push(`📈 ML: ${boost.recommendation} (${pattern.success_rate}% succès)`);
          break;
        
        case 'under_2.5':
          reasoning.push(`📉 ML: ${boost.recommendation} (${pattern.success_rate}% succès)`);
          break;
      }
    }
    
    mlBoosts.push(boost);
  }
  
  // Déterminer la prédiction boostée
  let mlBoostedPrediction = basePrediction;
  
  if (mlScore.home > mlScore.away + 20) {
    mlBoostedPrediction = 'home';
  } else if (mlScore.away > mlScore.home + 20) {
    mlBoostedPrediction = 'away';
  }
  
  // Calculer la confiance
  const maxScore = Math.max(mlScore.home, mlScore.away, 1);
  const applicablePatterns = mlBoosts.filter(b => b.appliesToMatch);
  
  let confidence: 'very_high' | 'high' | 'medium' | 'low';
  if (applicablePatterns.length >= 2 && maxScore > 80) {
    confidence = 'very_high';
  } else if (applicablePatterns.length >= 1 && maxScore > 60) {
    confidence = 'high';
  } else if (applicablePatterns.length >= 1) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  
  // Générer le raisonnement
  for (const boost of applicablePatterns) {
    if (boost.recommendation && !reasoning.includes(`🧠 ML: ${boost.recommendation} (${boost.successRate}% succès)`)) {
      reasoning.push(`🧠 ML: ${boost.recommendation} (${boost.successRate}% succès)`);
    }
  }
  
  // Accuracy ML moyenne
  const mlAccuracy = applicablePatterns.length > 0
    ? Math.round(applicablePatterns.reduce((sum, b) => sum + b.successRate, 0) / applicablePatterns.length)
    : 50;
  
  return {
    basePrediction,
    mlBoostedPrediction,
    confidence,
    mlBoosts,
    reasoning,
    mlAccuracy
  };
}

/**
 * Sauvegarde un nouveau pattern découvert
 */
export async function saveNewPattern(pattern: Omit<MLPattern, 'id' | 'last_updated'>): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  
  const newPattern: MLPattern = {
    ...pattern,
    id: `${pattern.sport}_${pattern.pattern_type}_${Date.now()}`,
    last_updated: new Date().toISOString()
  };
  
  const { error } = await supabase
    .from('ml_patterns')
    .insert(newPattern);
  
  if (error) {
    console.error('❌ ML Memory: Erreur sauvegarde pattern:', error.message);
    return false;
  }
  
  // Rafraîchir le cache
  patternsCache = [];
  await loadMLPatterns(true);
  
  console.log(`✅ ML Memory: Nouveau pattern sauvegardé: ${pattern.pattern_type}`);
  return true;
}

/**
 * Met à jour un pattern existant avec de nouvelles données
 */
export async function updatePatternStats(
  patternId: string, 
  newSampleSize: number, 
  newSuccessRate: number
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  
  const { error } = await supabase
    .from('ml_patterns')
    .update({
      sample_size: newSampleSize,
      success_rate: newSuccessRate,
      last_updated: new Date().toISOString()
    })
    .eq('id', patternId);
  
  if (error) {
    console.error('❌ ML Memory: Erreur mise à jour pattern:', error.message);
    return false;
  }
  
  // Rafraîchir le cache
  patternsCache = [];
  await loadMLPatterns(true);
  
  return true;
}

/**
 * Obtient les statistiques ML globales
 */
export async function getMLStats(): Promise<{
  totalPatterns: number;
  footballPatterns: number;
  basketballPatterns: number;
  hockeyPatterns: number;
  baseballPatterns: number;
  avgSuccessRate: number;
  totalSamples: number;
}> {
  const patterns = await loadMLPatterns();
  
  const football = patterns.filter(p => p.sport === 'football');
  const basketball = patterns.filter(p => p.sport === 'basketball');
  const hockey = patterns.filter(p => p.sport === 'hockey');
  const baseball = patterns.filter(p => p.sport === 'baseball');
  
  return {
    totalPatterns: patterns.length,
    footballPatterns: football.length,
    basketballPatterns: basketball.length,
    hockeyPatterns: hockey.length,
    baseballPatterns: baseball.length,
    avgSuccessRate: patterns.length > 0 
      ? Math.round(patterns.reduce((sum, p) => sum + p.success_rate, 0) / patterns.length)
      : 0,
    totalSamples: patterns.reduce((sum, p) => sum + p.sample_size, 0)
  };
}

/**
 * Force le rechargement des patterns (après entraînement par exemple)
 */
export async function refreshMLMemory(): Promise<void> {
  patternsCache = [];
  await loadMLPatterns(true);
  console.log('🔄 ML Memory: Mémoire rafraîchie');
}

// Export par défaut
export default {
  loadMLPatterns,
  analyzeMatchWithML,
  saveNewPattern,
  updatePatternStats,
  getMLStats,
  refreshMLMemory
};
