/**
 * API d'analyse de match
 * Permet aux utilisateurs d'analyser des matchs (max 3/jour)
 * Intègre: Blessures, Suspensions, Forme, H2H via API-Football
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getMatchAnalysisData, 
  getRemainingRequests,
  type Injury, 
  type TeamFormData, 
  type H2HMatch 
} from '@/lib/apiFootball';
import {
  getRemainingAnalyses,
  recordAnalysis,
  getAnalysisInfo,
  MAX_ANALYSES_PER_DAY
} from '@/lib/analysisStore';

// Types
interface MatchInput {
  homeTeam: string;
  awayTeam: string;
  league?: string;
  odds?: number;
  betType?: string;
}

interface AnalysisResult {
  match: MatchInput;
  found: boolean;
  fixture?: {
    id: number;
    date: string;
    league: string;
    status: string;
  };
  ourOdds?: {
    home: number;
    draw: number | null;
    away: number;
  };
  risk?: number;
  confidence?: string;
  recommendation?: string;
  // Prédictions détaillées
  predictions?: {
    betType: string; // "Victoire" ou "Victoire/Nul"
    // corners et cards retirés - pas de données réelles disponibles
    goals: { total: number; over25: number; prediction: string };
  };
  // Données enrichies
  enrichment?: {
    homeInjuries: Injury[];
    awayInjuries: Injury[];
    homeForm: TeamFormData | null;
    awayForm: TeamFormData | null;
    h2h: H2HMatch[];
    homeStats?: { played: number; wins: number; draws: number; losses: number; form: string };
    awayStats?: { played: number; wins: number; draws: number; losses: number; form: string };
  };
  warnings?: string[];
  source: 'cache' | 'api' | 'not_found';
}

// Le stockage est maintenant géré par analysisStore (persistant)

/**
 * Normalize team name for comparison
 */
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Calculate Levenshtein distance for fuzzy matching
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity percentage between two strings
 */
function calculateSimilarity(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 100;
  const distance = levenshteinDistance(a, b);
  return Math.round((1 - distance / maxLength) * 100);
}

/**
 * Find best matching team name with fuzzy matching
 */
function findBestTeamMatch(
  inputName: string, 
  availableNames: string[], 
  threshold: number = 70
): { name: string; similarity: number } | null {
  const inputNorm = normalizeTeamName(inputName);
  
  let bestMatch: { name: string; similarity: number } | null = null;
  
  for (const name of availableNames) {
    const nameNorm = normalizeTeamName(name);
    
    // Check for exact match first
    if (nameNorm === inputNorm) {
      return { name, similarity: 100 };
    }
    
    // Check for contains match
    if (nameNorm.includes(inputNorm) || inputNorm.includes(nameNorm)) {
      const similarity = Math.max(
        calculateSimilarity(inputNorm, nameNorm),
        90 // High similarity for contains
      );
      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = { name, similarity };
      }
      continue;
    }
    
    // Check for fuzzy match
    const similarity = calculateSimilarity(inputNorm, nameNorm);
    if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = { name, similarity };
    }
  }
  
  return bestMatch;
}

/**
 * Find match in cache with fuzzy matching
 */
async function findMatchInCache(match: MatchInput): Promise<AnalysisResult | null> {
  try {
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    
    const response = await fetch(`${baseUrl}/api/matches`, {
      cache: 'no-store'
    });
    const data = await response.json();
    const matches = data.matches || [];
    
    // Get all team names for fuzzy matching
    const homeTeams = matches.map((m: any) => m.homeTeam as string).filter(Boolean);
    const awayTeams = matches.map((m: any) => m.awayTeam as string).filter(Boolean);
    const allTeams: string[] = [...new Set([...homeTeams, ...awayTeams])] as string[];
    
    // Find best matches for input teams
    const homeMatch = findBestTeamMatch(match.homeTeam, allTeams);
    const awayMatch = findBestTeamMatch(match.awayTeam, allTeams);
    
    if (!homeMatch || !awayMatch) {
      return null;
    }
    
    // Find the specific match
    for (const m of matches) {
      const mHomeNorm = normalizeTeamName(m.homeTeam);
      const mAwayNorm = normalizeTeamName(m.awayTeam);
      const homeMatchNorm = normalizeTeamName(homeMatch.name);
      const awayMatchNorm = normalizeTeamName(awayMatch.name);
      
      if (
        (mHomeNorm === homeMatchNorm || calculateSimilarity(mHomeNorm, homeMatchNorm) >= 85) &&
        (mAwayNorm === awayMatchNorm || calculateSimilarity(mAwayNorm, awayMatchNorm) >= 85)
      ) {
        // Calculate predictions
        const predictions = calculatePredictions(m);
        
        return {
          match: {
            ...match,
            homeTeam: m.homeTeam, // Use actual name from cache
            awayTeam: m.awayTeam
          },
          found: true,
          ourOdds: {
            home: m.oddsHome,
            draw: m.oddsDraw,
            away: m.oddsAway
          },
          risk: m.insight?.riskPercentage || 50,
          confidence: m.insight?.confidence || 'medium',
          recommendation: generateRecommendation(m, match.betType),
          predictions,
          source: 'cache',
          warnings: []
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Erreur recherche cache:', error);
    return null;
  }
}

/**
 * Calculate detailed predictions for corners, cards, goals
 */
function calculatePredictions(match: any): AnalysisResult['predictions'] {
  const oddsHome = match.oddsHome;
  const oddsAway = match.oddsAway;
  const oddsDraw = match.oddsDraw;
  
  // Determine bet type
  const favorite = oddsHome < oddsAway ? 'home' : 'away';
  const favoriteOdds = favorite === 'home' ? oddsHome : oddsAway;
  const drawProb = oddsDraw ? Math.round(100 / oddsDraw / ((1/oddsHome) + (1/oddsAway) + (1/oddsDraw)) * 100) : 0;
  
  let betType = '';
  if (favoriteOdds < 1.5) {
    betType = `Victoire ${favorite === 'home' ? match.homeTeam : match.awayTeam}`;
  } else if (favoriteOdds < 2.0 && drawProb < 30) {
    betType = `Victoire ${favorite === 'home' ? match.homeTeam : match.awayTeam}`;
  } else {
    betType = `${favorite === 'home' ? match.homeTeam : match.awayTeam} ou Nul`;
  }
  
  // Use existing predictions from match if available
  const goalsPrediction = match.goalsPrediction || calculateGoals(oddsHome, oddsAway, oddsDraw);
  // Cards and Corners retirés - pas de données réelles disponibles
  
  return {
    betType,
    goals: {
      total: goalsPrediction.total,
      over25: goalsPrediction.over25,
      prediction: goalsPrediction.prediction
    }
  };
}

/**
 * Calculate goals prediction
 */
function calculateGoals(oddsHome: number, oddsAway: number, oddsDraw: number | null): any {
  const probHome = 1 / oddsHome;
  const probAway = 1 / oddsAway;
  const probDraw = oddsDraw ? 1 / oddsDraw : 0.25;
  const total = probHome + probAway + probDraw;
  
  const disparity = Math.abs(oddsHome - oddsAway);
  let expectedGoals = 2.6;
  
  if (Math.max(oddsHome, oddsAway) / Math.min(oddsHome, oddsAway) > 3) {
    expectedGoals = 2.2;
  } else if (Math.max(oddsHome, oddsAway) / Math.min(oddsHome, oddsAway) < 1.5) {
    expectedGoals = 2.8;
  }
  
  const avgGoals = expectedGoals;
  const poissonCumulative2 = Math.exp(-avgGoals) * (1 + avgGoals + (avgGoals * avgGoals) / 2);
  const over25 = Math.round((1 - poissonCumulative2) * 100);
  
  let prediction = over25 >= 55 ? 'Over 2.5' : over25 <= 45 ? 'Under 2.5' : 'Match serré';
  
  return { total: Math.round(expectedGoals * 10) / 10, over25, prediction };
}

// Cards and Corners prediction functions REMOVED
// Reason: No real data source available for these statistics
// To re-enable: Integrate API-Football or similar service

/**
 * Generate recommendation based on match data
 */
function generateRecommendation(match: any, betType?: string): string {
  const oddsHome = match.oddsHome;
  const oddsAway = match.oddsAway;
  const oddsDraw = match.oddsDraw;
  
  const favorite = oddsHome < oddsAway ? 'home' : 'away';
  const favoriteTeam = favorite === 'home' ? match.homeTeam : match.awayTeam;
  const favoriteOdds = favorite === 'home' ? oddsHome : oddsAway;
  
  // Calculate probabilities
  const totalImplied = (1/oddsHome) + (1/oddsAway) + (oddsDraw ? 1/oddsDraw : 0);
  const homeProb = Math.round((1/oddsHome) / totalImplied * 100);
  const drawProb = oddsDraw ? Math.round((1/oddsDraw) / totalImplied * 100) : 0;
  const awayProb = Math.round((1/oddsAway) / totalImplied * 100);
  const favoriteProb = favorite === 'home' ? homeProb : awayProb;
  
  if (favoriteOdds < 1.5 && favoriteProb >= 65) {
    return `✅ Victoire ${favoriteTeam} recommandée (${favoriteProb}% de probabilité)`;
  } else if (favoriteOdds < 2.0 && favoriteProb >= 50) {
    return `✅ ${favoriteTeam} ou Nul - Double chance sûre (${favoriteProb + drawProb}%)`;
  } else if (drawProb >= 30) {
    return `⚠️ Risque de nul élevé (${drawProb}%) - Considérez la double chance`;
  } else {
    return `⏳ Match serré - Analysez les blessures et la forme récente`;
  }
}

/**
 * Enrich analysis with API-Football data
 */
async function enrichWithApiFootball(
  homeTeam: string,
  awayTeam: string
): Promise<AnalysisResult['enrichment']> {
  try {
    const analysisData = await getMatchAnalysisData(homeTeam, awayTeam);
    
    return {
      homeInjuries: analysisData.homeInjuries,
      awayInjuries: analysisData.awayInjuries,
      homeForm: analysisData.homeForm,
      awayForm: analysisData.awayForm,
      h2h: analysisData.h2h,
      homeStats: analysisData.homeStats ? {
        played: analysisData.homeStats.played,
        wins: analysisData.homeStats.wins,
        draws: analysisData.homeStats.draws,
        losses: analysisData.homeStats.losses,
        form: analysisData.homeStats.form
      } : undefined,
      awayStats: analysisData.awayStats ? {
        played: analysisData.awayStats.played,
        wins: analysisData.awayStats.wins,
        draws: analysisData.awayStats.draws,
        losses: analysisData.awayStats.losses,
        form: analysisData.awayStats.form
      } : undefined
    };
  } catch (error) {
    console.error('Erreur enrichissement API-Football:', error);
    return undefined;
  }
}

/**
 * Verify match exists and is current
 */
async function verifyMatch(homeTeam: string, awayTeam: string): Promise<{
  valid: boolean;
  fixture?: { id: number; date: string; league: string; status: string };
  warnings: string[];
}> {
  const warnings: string[] = [];
  
  try {
    const analysisData = await getMatchAnalysisData(homeTeam, awayTeam);
    
    if (analysisData.fixture) {
      // Check if match is in the future
      const matchDate = new Date(analysisData.fixture.date);
      const now = new Date();
      
      if (matchDate < now) {
        warnings.push('⚠️ Ce match a déjà commencé ou est terminé');
      }
      
      // Check if within next 7 days
      const weekLater = new Date(now);
      weekLater.setDate(weekLater.getDate() + 7);
      
      if (matchDate > weekLater) {
        warnings.push('📅 Ce match est programmé dans plus de 7 jours');
      }
      
      return { 
        valid: true, 
        fixture: analysisData.fixture,
        warnings 
      };
    }
    
    // Match not found in API-Football, check if teams exist
    warnings.push('ℹ️ Match non trouvé dans notre base de données API-Football');
    return { valid: false, warnings };
    
  } catch (error) {
    warnings.push('⚠️ Impossible de vérifier le match via API-Football');
    return { valid: false, warnings };
  }
}

/**
 * Analyze matches
 */
async function analyzeMatches(
  matches: MatchInput[],
  username: string
): Promise<{
  success: boolean;
  results: AnalysisResult[];
  remainingAnalyses: number;
  error?: string;
}> {
  // Check limit
  const remaining = getRemainingAnalyses(username);
  if (remaining <= 0) {
    return {
      success: false,
      results: [],
      remainingAnalyses: 0,
      error: 'Limite quotidienne atteinte (3 analyses/jour)'
    };
  }
  
  // Check max matches
  if (matches.length > 3) {
    return {
      success: false,
      results: [],
      remainingAnalyses: remaining,
      error: 'Maximum 3 matchs par analyse'
    };
  }
  
  if (matches.length === 0) {
    return {
      success: false,
      results: [],
      remainingAnalyses: remaining,
      error: 'Aucun match fourni'
    };
  }
  
  const results: AnalysisResult[] = [];
  
  for (const match of matches) {
    // 1. Find in cache
    let result = await findMatchInCache(match);
    
    if (!result) {
      // 2. Verify match exists and enrich with API-Football
      const verification = await verifyMatch(match.homeTeam, match.awayTeam);
      
      if (verification.valid && verification.fixture) {
        // Match exists, create basic result
        result = {
          match,
          found: true,
          fixture: verification.fixture,
          risk: 50,
          confidence: 'medium',
          recommendation: 'Match confirmé - Consultez les cotes de votre bookmaker',
          warnings: verification.warnings,
          source: 'api'
        };
      } else {
        // Match not found
        result = {
          match,
          found: false,
          warnings: verification.warnings,
          source: 'not_found',
          recommendation: 'Match non trouvé. Vérifiez les noms des équipes.'
        };
      }
    }
    
    // 3. Enrich with API-Football data (injuries, form, H2H)
    if (result && result.found) {
      const enrichment = await enrichWithApiFootball(
        result.match.homeTeam,
        result.match.awayTeam
      );
      
      if (enrichment) {
        result.enrichment = enrichment;
        
        // Add injury warnings
        const totalInjuries = (enrichment.homeInjuries?.length || 0) + 
                              (enrichment.awayInjuries?.length || 0);
        if (totalInjuries > 0) {
          result.warnings = result.warnings || [];
          result.warnings.push(`🏥 ${totalInjuries} joueur(s) blessé(s) ou suspendu(s)`);
        }
      }
    }
    
    results.push(result);
  }
  
  // Record analysis (only count 1 per request, not per match)
  const recordResult = recordAnalysis(username);
  
  return {
    success: true,
    results,
    remainingAnalyses: recordResult.remaining
  };
}

/**
 * GET - Get user analysis status
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  
  if (!username) {
    return NextResponse.json({
      success: false,
      error: 'Username requis'
    }, { status: 400 });
  }
  
  const info = getAnalysisInfo(username);
  const apiFootballStatus = getRemainingRequests();
  
  return NextResponse.json({
    success: true,
    date: info.date,
    remainingAnalyses: info.remaining,
    maxAnalysesPerDay: info.max,
    usedToday: info.used,
    resetTime: info.resetTime,
    apiFootball: apiFootballStatus
  });
}

/**
 * POST - Analyze matches
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, matches } = body;
    
    if (!username) {
      return NextResponse.json({
        success: false,
        error: 'Username requis'
      }, { status: 400 });
    }
    
    if (!matches || !Array.isArray(matches)) {
      return NextResponse.json({
        success: false,
        error: 'Liste de matchs requise'
      }, { status: 400 });
    }
    
    const result = await analyzeMatches(matches, username);
    
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('Erreur analyse match:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Erreur lors de l\'analyse'
    }, { status: 500 });
  }
}
