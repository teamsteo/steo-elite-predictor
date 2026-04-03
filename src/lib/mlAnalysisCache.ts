/**
 * ML Analysis Cache System
 * Stores analysis results to avoid re-computing and save API credits
 */

import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'ml-analysis-cache.json');
const CACHE_TTL = 3 * 60 * 60 * 1000; // 3 hours

export interface MatchAnalysis {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
  
  // Odds at analysis time
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  
  // ML Results
  probabilities: {
    home: number;
    draw: number;
    away: number;
  };
  riskPercentage: number;
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  
  // Betting Recommendations
  recommendations: {
    type: 'home' | 'draw' | 'away' | 'home_or_draw' | 'away_or_draw' | 'over_2.5' | 'under_2.5' | 'btts_yes' | 'btts_no';
    label: string;
    probability: number;
    odds: number;
    value: number; // Edge percentage
    stake: number; // Kelly stake %
    recommendation: 'strong' | 'moderate' | 'weak' | 'avoid';
    patternSource?: string;
    statistics?: {
      sampleSize: number;
      successRate: number;
      confidenceInterval: { lower: number; upper: number };
      pValue: number;
      significance: 'significant' | 'highly_significant' | 'marginal';
    };
  }[];
  
  // Value bets detected
  valueBets: {
    type: string;
    edge: number;
    confidence: string;
    patternSource?: string;
    sampleSize?: number;
    successRate?: number;
  }[];
  
  // ML Patterns - NEW: Validated statistical patterns
  mlPatterns?: {
    bestTag: {
      type: string;
      label: string;
      confidence: number;
      reason: string;
      statistics?: {
        sampleSize: number;
        successRate: number;
        confidenceInterval: { lower: number; upper: number };
        pValue: number;
        significance: string;
      };
    } | null;
    allPatterns: {
      type: string;
      label: string;
      confidence: number;
      patternSource: string;
      sampleSize?: number;
      successRate?: number;
      pValue?: number;
    }[];
  };
  
  // Metadata
  analyzedAt: string;
  dataQuality: 'real' | 'estimated';
  apiCreditsUsed: number;
}

interface CacheData {
  analyses: Record<string, MatchAnalysis>;
  lastUpdate: string;
  totalCreditsUsed: number;
  dailyCreditsUsed: number;
  dailyCreditsDate: string;
}

// Ensure cache directory exists
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

// Load cache from file
export function loadCache(): CacheData {
  try {
    ensureCacheDir();
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading ML cache:', error);
  }
  
  return {
    analyses: {},
    lastUpdate: new Date().toISOString(),
    totalCreditsUsed: 0,
    dailyCreditsUsed: 0,
    dailyCreditsDate: new Date().toDateString(),
  };
}

// Save cache to file
export function saveCache(cache: CacheData): void {
  try {
    ensureCacheDir();
    cache.lastUpdate = new Date().toISOString();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error('Error saving ML cache:', error);
  }
}

// Get cached analysis for a match
export function getCachedAnalysis(matchId: string): MatchAnalysis | null {
  const cache = loadCache();
  const analysis = cache.analyses[matchId];
  
  if (!analysis) return null;
  
  // Check if analysis is still valid
  const analyzedAt = new Date(analysis.analyzedAt).getTime();
  const now = Date.now();
  
  if (now - analyzedAt > CACHE_TTL) {
    return null; // Cache expired
  }
  
  return analysis;
}

// Store analysis in cache
export function cacheAnalysis(analysis: MatchAnalysis): void {
  const cache = loadCache();
  
  // Reset daily credits if new day
  if (cache.dailyCreditsDate !== new Date().toDateString()) {
    cache.dailyCreditsUsed = 0;
    cache.dailyCreditsDate = new Date().toDateString();
  }
  
  cache.analyses[analysis.matchId] = analysis;
  cache.totalCreditsUsed += analysis.apiCreditsUsed;
  cache.dailyCreditsUsed += analysis.apiCreditsUsed;
  
  saveCache(cache);
}

// Get all cached analyses for today
export function getTodayAnalyses(): MatchAnalysis[] {
  const cache = loadCache();
  const today = new Date().toDateString();
  
  return Object.values(cache.analyses).filter(analysis => {
    const analysisDate = new Date(analysis.date).toDateString();
    return analysisDate === today;
  });
}

// Calculate Kelly Criterion stake
export function calculateKellyStake(probability: number, odds: number): number {
  const edge = (probability * odds) - 1;
  if (edge <= 0) return 0;
  
  const kelly = edge / (odds - 1);
  // Cap at 10% for safety
  return Math.min(kelly * 100, 10);
}

// Determine recommendation strength
export function getRecommendationStrength(edge: number, confidence: string): 'strong' | 'moderate' | 'weak' | 'avoid' {
  if (edge >= 8 && (confidence === 'very_high' || confidence === 'high')) return 'strong';
  if (edge >= 5) return 'moderate';
  if (edge >= 2) return 'weak';
  return 'avoid';
}

// Generate betting recommendations
export function generateBettingRecommendations(
  probs: { home: number; draw: number; away: number },
  odds: { home: number; draw: number | null; away: number },
  confidence: string
): any[] {
  const recommendations: any[] = [];
  
  // 1. Match Winner (1X2)
  const homeEdge = probs.home - (100 / odds.home);
  const awayEdge = probs.away - (100 / odds.away);
  
  if (homeEdge > 2) {
    recommendations.push({
      label: `1 - ${probs.home}%`,
      type: 'home',
      probability: probs.home,
      odds: odds.home,
      value: Math.round(homeEdge * 10) / 10,
      stake: calculateKellyStake(probs.home / 100, odds.home),
      recommendation: homeEdge > 8 ? 'strong' : homeEdge > 5 ? 'moderate' : 'weak',
    });
  }
  
  if (awayEdge > 2) {
    recommendations.push({
      label: `2 - ${probs.away}%`,
      type: 'away',
      probability: probs.away,
      odds: odds.away,
      value: Math.round(awayEdge * 10) / 10,
      stake: calculateKellyStake(probs.away / 100, odds.away),
      recommendation: awayEdge > 8 ? 'strong' : awayEdge > 5 ? 'moderate' : 'weak',
    });
  }
  
  // 2. Double Chance
  if (odds.draw && odds.draw > 1) {
    const homeOrDrawProb = probs.home + probs.draw;
    const awayOrDrawProb = probs.away + probs.draw;
    
    if (homeOrDrawProb > 55) {
      recommendations.push({
        label: `1X - ${Math.round(homeOrDrawProb)}%`,
        type: 'home_or_draw',
        probability: homeOrDrawProb,
        odds: 1.35,
        value: Math.round((homeOrDrawProb - 74) * 10) / 10,
        stake: calculateKellyStake(homeOrDrawProb / 100, 1.35),
        recommendation: homeOrDrawProb > 70 ? 'strong' : homeOrDrawProb > 60 ? 'moderate' : 'weak',
      });
    }
    
    if (awayOrDrawProb > 55) {
      recommendations.push({
        label: `X2 - ${Math.round(awayOrDrawProb)}%`,
        type: 'away_or_draw',
        probability: awayOrDrawProb,
        odds: 1.35,
        value: Math.round((awayOrDrawProb - 74) * 10) / 10,
        stake: calculateKellyStake(awayOrDrawProb / 100, 1.35),
        recommendation: awayOrDrawProb > 70 ? 'strong' : awayOrDrawProb > 60 ? 'moderate' : 'weak',
      });
    }
  }
  
  // 3. Over/Under 2.5 goals
  const goalIntensity = (probs.home + probs.away) / 100;
  const over25Prob = Math.min(70, Math.max(35, goalIntensity * 60 + 15));
  const under25Prob = 100 - over25Prob;
  
  recommendations.push({
    label: `+2.5 buts - ${Math.round(over25Prob)}%`,
    type: 'over_2.5',
    probability: over25Prob,
    odds: 1.90,
    value: Math.round((over25Prob - 52.6) * 10) / 10,
    stake: calculateKellyStake(over25Prob / 100, 1.90),
    recommendation: over25Prob > 60 ? 'moderate' : 'weak',
  });
  
  recommendations.push({
    label: `-2.5 buts - ${Math.round(under25Prob)}%`,
    type: 'under_2.5',
    probability: under25Prob,
    odds: 1.90,
    value: Math.round((under25Prob - 52.6) * 10) / 10,
    stake: calculateKellyStake(under25Prob / 100, 1.90),
    recommendation: under25Prob > 60 ? 'moderate' : 'weak',
  });
  
  // 4. BTTS
  const bttsProb = Math.min(65, Math.max(35, goalIntensity * 50 + 10));
  
  recommendations.push({
    label: `Les deux marquent - ${Math.round(bttsProb)}%`,
    type: 'btts_yes',
    probability: bttsProb,
    odds: 1.75,
    value: Math.round((bttsProb - 57.1) * 10) / 10,
    stake: calculateKellyStake(bttsProb / 100, 1.75),
    recommendation: bttsProb > 55 ? 'moderate' : 'weak',
  });
  
  // Sort by value (descending)
  recommendations.sort((a, b) => b.value - a.value);
  
  return recommendations;
}

// Get credit usage stats
export function getCreditStats(): { total: number; daily: number; remaining: number } {
  const cache = loadCache();
  
  // Reset daily credits if new day
  let dailyUsed = cache.dailyCreditsUsed;
  if (cache.dailyCreditsDate !== new Date().toDateString()) {
    dailyUsed = 0;
  }
  
  // Monthly quota (assuming 500 credits/month)
  const monthlyQuota = 500;
  const dailyBudget = 16; // 500 / 30 days
  
  return {
    total: cache.totalCreditsUsed,
    daily: dailyUsed,
    remaining: Math.max(0, dailyBudget - dailyUsed),
  };
}

// Check if we should use API credits
export function shouldUseApiCredits(): boolean {
  const stats = getCreditStats();
  return stats.remaining > 2; // Keep some buffer
}
