/**
 * ML Sports Training API - Entraînement ML basé sur les résultats sportifs
 * 
 * GET /api/ml/train-sports
 * Analyse les résultats passés et apprend de nouveaux patterns
 * 
 * Ce module est spécifiquement conçu pour les pronostics sportifs:
 * - Football, Basketball, Hockey, Baseball, Tennis
 * - Apprend des résultats réels des rencontres
 * - Sauvegarde les patterns dans Supabase (ml_patterns)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { saveNewPattern, updatePatternStats, loadMLPatterns, getMLStats } from '@/lib/ml-memory-service';

// Configuration Supabase
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

interface MatchResult {
  id: string;
  sport: string;
  home_team: string;
  away_team: string;
  home_score?: number;
  away_score?: number;
  winner?: string;
  status: string;
  date: string;
  home_xg?: number;
  away_xg?: number;
  odds_home?: number;
  odds_away?: number;
  odds_draw?: number;
  league?: string;
}

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
 * Détecte les patterns Football
 */
function detectFootballPatterns(matches: MatchResult[]): PatternDiscovery[] {
  const patterns: PatternDiscovery[] = [];
  
  // Pattern: xG differential > 0.5 = favori gagne
  const xgDiffMatches = matches.filter(m => 
    m.home_xg !== undefined && m.away_xg !== undefined && 
    Math.abs(m.home_xg - m.away_xg) >= 0.5
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
      description: `Quand l'écart xG >= 0.5, le favori xG gagne ${Math.round((successCount / xgDiffMatches.length) * 100)}% du temps`
    });
  }
  
  // Pattern: Under 2.5 quand xG total < 2.2
  const lowXgMatches = matches.filter(m => 
    m.home_xg !== undefined && m.away_xg !== undefined && 
    (m.home_xg + m.away_xg) < 2.2
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
      description: `Quand xG total < 2.2, Under 2.5 réussit ${Math.round((underCount / lowXgMatches.length) * 100)}% du temps`
    });
  }
  
  // Pattern: Over 2.5 quand xG total > 2.8
  const highXgMatches = matches.filter(m => 
    m.home_xg !== undefined && m.away_xg !== undefined && 
    (m.home_xg + m.away_xg) >= 2.8
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
      description: `Quand xG total >= 2.8, Over 2.5 réussit ${Math.round((overCount / highXgMatches.length) * 100)}% du temps`
    });
  }
  
  // Pattern: Favori à domicile (cotes < 1.5)
  const homeFavoriteMatches = matches.filter(m => 
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
      description: `Favori domicile (cote < 1.5) gagne ${Math.round((homeWinCount / homeFavoriteMatches.length) * 100)}% du temps`
    });
  }
  
  return patterns;
}

/**
 * Détecte les patterns Basketball (NBA)
 */
function detectBasketballPatterns(matches: MatchResult[]): PatternDiscovery[] {
  const patterns: PatternDiscovery[] = [];
  
  // Pattern: Avantage domicile NBA
  const homeMatches = matches.filter(m => m.sport === 'basketball');
  
  if (homeMatches.length >= 10) {
    const homeWinCount = homeMatches.filter(m => 
      m.home_score! > m.away_score!
    ).length;
    
    patterns.push({
      sport: 'basketball',
      pattern_type: 'home_advantage',
      condition: 'NBA home game',
      outcome: 'home_win',
      success_rate: Math.round((homeWinCount / homeMatches.length) * 100),
      sample_size: homeMatches.length,
      description: `Avantage domicile NBA: ${Math.round((homeWinCount / homeMatches.length) * 100)}% de victoires à domicile`
    });
  }
  
  return patterns;
}

/**
 * Détecte les patterns Hockey (NHL)
 */
function detectHockeyPatterns(matches: MatchResult[]): PatternDiscovery[] {
  const patterns: PatternDiscovery[] = [];
  
  const hockeyMatches = matches.filter(m => m.sport === 'hockey');
  
  if (hockeyMatches.length >= 10) {
    // Pattern: Avantage domicile NHL
    const homeWinCount = hockeyMatches.filter(m => 
      m.home_score! > m.away_score!
    ).length;
    
    patterns.push({
      sport: 'hockey',
      pattern_type: 'home_advantage',
      condition: 'NHL home game',
      outcome: 'home_win',
      success_rate: Math.round((homeWinCount / hockeyMatches.length) * 100),
      sample_size: hockeyMatches.length,
      description: `Avantage domicile NHL: ${Math.round((homeWinCount / hockeyMatches.length) * 100)}% de victoires à domicile`
    });
    
    // Pattern: Over 5.5 buts
    const overCount = hockeyMatches.filter(m => 
      (m.home_score! + m.away_score!) >= 6
    ).length;
    
    patterns.push({
      sport: 'hockey',
      pattern_type: 'total_goals',
      condition: 'NHL total goals',
      outcome: 'over_5.5',
      success_rate: Math.round((overCount / hockeyMatches.length) * 100),
      sample_size: hockeyMatches.length,
      description: `Over 5.5 buts NHL: ${Math.round((overCount / hockeyMatches.length) * 100)}% des matchs`
    });
  }
  
  return patterns;
}

/**
 * GET - Entraîne le modèle ML avec les résultats sportifs
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sport = searchParams.get('sport') || 'all';
  
  try {
    console.log('🏋️ ML Sports Training - Démarrage...');
    
    const supabase = getSupabase();
    
    if (!supabase) {
      return NextResponse.json({
        success: false,
        error: 'Configuration Supabase manquante',
        hint: 'Vérifiez NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY'
      }, { status: 500 });
    }
    
    // Récupérer les matchs terminés avec résultats
    const { data: matches, error } = await supabase
      .from('matches')
      .select('*')
      .eq('status', 'STATUS_FINAL')
      .not('home_score', 'is', null)
      .not('away_score', 'is', null)
      .order('date', { ascending: false })
      .limit(500);
    
    if (error) {
      console.error('Erreur récupération matchs:', error);
      return NextResponse.json({
        success: false,
        error: 'Erreur récupération matchs: ' + error.message
      }, { status: 500 });
    }
    
    if (!matches || matches.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucun match terminé disponible pour l\'entraînement',
        stats: await getMLStats()
      });
    }
    
    console.log(`📊 ${matches.length} matchs analysés pour patterns`);
    
    // Détecter les patterns par sport
    let allPatterns: PatternDiscovery[] = [];
    
    if (sport === 'all' || sport === 'football') {
      const footballMatches = matches.filter(m => m.sport === 'football' || m.sport === 'soccer');
      allPatterns = [...allPatterns, ...detectFootballPatterns(footballMatches)];
    }
    
    if (sport === 'all' || sport === 'basketball') {
      const basketballMatches = matches.filter(m => m.sport === 'basketball' || m.sport === 'nba');
      allPatterns = [...allPatterns, ...detectBasketballPatterns(basketballMatches)];
    }
    
    if (sport === 'all' || sport === 'hockey') {
      const hockeyMatches = matches.filter(m => m.sport === 'hockey' || m.sport === 'nhl');
      allPatterns = [...allPatterns, ...detectHockeyPatterns(hockeyMatches)];
    }
    
    // Charger les patterns existants
    const existingPatterns = await loadMLPatterns();
    
    // Sauvegarder les nouveaux patterns
    let savedCount = 0;
    let updatedCount = 0;
    
    for (const pattern of allPatterns) {
      // Ne garder que les patterns avec succès > 55%
      if (pattern.success_rate < 55) continue;
      
      const existingPattern = existingPatterns.find(
        p => p.sport === pattern.sport && p.pattern_type === pattern.pattern_type
      );
      
      if (existingPattern) {
        // Mettre à jour le pattern existant
        const newSampleSize = existingPattern.sample_size + pattern.sample_size;
        const newSuccessRate = Math.round(
          (existingPattern.success_rate * existingPattern.sample_size + 
           pattern.success_rate * pattern.sample_size) / newSampleSize
        );
        
        const updated = await updatePatternStats(existingPattern.id, newSampleSize, newSuccessRate);
        if (updated) updatedCount++;
      } else {
        // Créer un nouveau pattern
        const saved = await saveNewPattern({
          sport: pattern.sport as any,
          pattern_type: pattern.pattern_type,
          condition: pattern.condition,
          outcome: pattern.outcome,
          sample_size: pattern.sample_size,
          success_rate: pattern.success_rate,
          confidence: Math.min(pattern.success_rate / 100, 0.95),
          description: pattern.description
        });
        if (saved) savedCount++;
      }
    }
    
    // Statistiques finales
    const finalStats = await getMLStats();
    
    console.log(`✅ ML Training terminé: ${savedCount} nouveaux patterns, ${updatedCount} mis à jour`);
    
    return NextResponse.json({
      success: true,
      message: 'Entraînement ML Sports terminé avec succès',
      training: {
        matchesAnalyzed: matches.length,
        patternsDiscovered: allPatterns.length,
        patternsSaved: savedCount,
        patternsUpdated: updatedCount
      },
      patterns: allPatterns,
      stats: finalStats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Erreur ML Training:', error);
    return NextResponse.json({
      success: false,
      error: 'Erreur lors de l\'entraînement ML',
      details: String(error)
    }, { status: 500 });
  }
}
