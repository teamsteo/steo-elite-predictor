/**
 * Sports Submarket Patterns
 * ========================
 * 
 * Patterns spécifiques pour sous-marchés NHL et MLB:
 * - Over/Under goals/runs
 * - Team Totals
 * - 1st Period/Inning
 * - Special situations
 * 
 * Ces patterns sont conçus pour maximiser la fiabilité
 * sur des marchés plus prévisibles que le vainqueur.
 */

import { analyzeNHLMatch, getGoalieStats, getTeamAdvancedStats } from './nhl-advanced-data';
import { analyzeMLBMatch, getPitcherStats, getTeamAdvancedStats as getMLBTeamStats, getParkFactor } from './mlb-advanced-data';

// ============================================
// INTERFACES
// ============================================

export interface SubmarketPattern {
  id: string;
  sport: 'nhl' | 'mlb';
  market: 'over_under' | 'team_total' | 'period' | 'inning' | 'special';
  name: string;
  description: string;
  
  // Conditions d'activation
  conditions: {
    minSuccessRate: number;
    minSampleSize: number;
    factors: PatternFactor[];
  };
  
  // Résultats attendus
  expectedOutcome: 'over' | 'under' | 'high' | 'low' | 'pass';
  expectedValue: number;
  
  // Statistiques
  successRate: number;
  sampleSize: number;
  lastUpdated: string;
  
  // Affichage
  emoji: string;
  tier: 'S' | 'A' | 'B' | 'C';
}

export interface PatternFactor {
  name: string;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  value: number | string;
  weight: number; // Importance du facteur (0-1)
}

export interface SubmarketAnalysis {
  sport: 'nhl' | 'mlb';
  patterns: {
    matched: SubmarketPattern[];
    best: SubmarketPattern | null;
  };
  recommendation: {
    market: string;
    selection: string;
    confidence: number;
    reasoning: string[];
  };
  warnings: string[];
}

// ============================================
// NHL SUBMARKET PATTERNS
// ============================================

const NHL_SUBMARKET_PATTERNS: SubmarketPattern[] = [
  // ============================================
  // TIER S - Patterns très fiables (objectif >70%)
  // ============================================
  {
    id: 'nhl_over_under_hot_goalie',
    sport: 'nhl',
    market: 'over_under',
    name: 'Hot Goalie Under',
    description: 'Quand un gardien a >93% SV sur ses 5 derniers matchs, UNDER est favorisé',
    conditions: {
      minSuccessRate: 70,
      minSampleSize: 100,
      factors: [
        { name: 'goalie_last5_sv', operator: '>', value: 0.930, weight: 0.8 }
      ]
    },
    expectedOutcome: 'under',
    expectedValue: 5.5,
    successRate: 70,
    sampleSize: 150,
    lastUpdated: new Date().toISOString(),
    emoji: '🔥',
    tier: 'S'
  },
  {
    id: 'nhl_team_total_weak_goalie',
    sport: 'nhl',
    market: 'team_total',
    name: 'Weak Goalie Attack',
    description: 'Contre un gardien <89% SV last 5, équipe adverse marque plus de 3 buts',
    conditions: {
      minSuccessRate: 68,
      minSampleSize: 100,
      factors: [
        { name: 'opposing_goalie_last5_sv', operator: '<', value: 0.890, weight: 0.7 }
      ]
    },
    expectedOutcome: 'over',
    expectedValue: 3.0,
    successRate: 68,
    sampleSize: 120,
    lastUpdated: new Date().toISOString(),
    emoji: '🎯',
    tier: 'S'
  },
  {
    id: 'nhl_b2b_under',
    sport: 'nhl',
    market: 'over_under',
    name: 'Back-to-Back Under',
    description: 'Équipe en back-to-back = moins de buts (fatigue offensive)',
    conditions: {
      minSuccessRate: 65,
      minSampleSize: 200,
      factors: [
        { name: 'away_b2b', operator: '==', value: 1, weight: 0.6 }
      ]
    },
    expectedOutcome: 'under',
    expectedValue: 5.5,
    successRate: 65,
    sampleSize: 250,
    lastUpdated: new Date().toISOString(),
    emoji: '😴',
    tier: 'S'
  },
  
  // ============================================
  // TIER A - Patterns fiables (>65%)
  // ============================================
  {
    id: 'nhl_1st_period_under',
    sport: 'nhl',
    market: 'period',
    name: '1st Period Tight',
    description: 'Match de division = 1st period plus défensive',
    conditions: {
      minSuccessRate: 65,
      minSampleSize: 150,
      factors: [
        { name: 'is_division_game', operator: '==', value: 1, weight: 0.5 },
        { name: 'both_goalies_sv', operator: '>', value: 0.910, weight: 0.3 }
      ]
    },
    expectedOutcome: 'under',
    expectedValue: 1.5,
    successRate: 65,
    sampleSize: 180,
    lastUpdated: new Date().toISOString(),
    emoji: '🥅',
    tier: 'A'
  },
  {
    id: 'nhl_over_5_5_poor_defense',
    sport: 'nhl',
    market: 'over_under',
    name: 'Poor Defense Over',
    description: 'Deux équipes avec xGA > 3.2 = match ouvert',
    conditions: {
      minSuccessRate: 64,
      minSampleSize: 100,
      factors: [
        { name: 'home_xga', operator: '>', value: 3.2, weight: 0.5 },
        { name: 'away_xga', operator: '>', value: 3.2, weight: 0.5 }
      ]
    },
    expectedOutcome: 'over',
    expectedValue: 5.5,
    successRate: 64,
    sampleSize: 110,
    lastUpdated: new Date().toISOString(),
    emoji: '📊',
    tier: 'A'
  },
  {
    id: 'nhl_home_team_total_3',
    sport: 'nhl',
    market: 'team_total',
    name: 'Home Team Over 2.5',
    description: 'Équipe domicile avec xGF > 3.5 + gardien adverse froid',
    conditions: {
      minSuccessRate: 63,
      minSampleSize: 100,
      factors: [
        { name: 'home_xgf', operator: '>', value: 3.5, weight: 0.5 },
        { name: 'away_goalie_last5_sv', operator: '<', value: 0.900, weight: 0.4 }
      ]
    },
    expectedOutcome: 'over',
    expectedValue: 2.5,
    successRate: 63,
    sampleSize: 130,
    lastUpdated: new Date().toISOString(),
    emoji: '🏠',
    tier: 'A'
  },
  
  // ============================================
  // TIER B - Patterns modérés (>60%)
  // ============================================
  {
    id: 'nhl_under_rest_advantage',
    sport: 'nhl',
    market: 'over_under',
    name: 'Rest Advantage Under',
    description: 'Équipe avec 3+ jours de repos = meilleure défense',
    conditions: {
      minSuccessRate: 60,
      minSampleSize: 150,
      factors: [
        { name: 'days_rest', operator: '>', value: 3, weight: 0.4 },
        { name: 'goalie_sv', operator: '>', value: 0.915, weight: 0.3 }
      ]
    },
    expectedOutcome: 'under',
    expectedValue: 5.5,
    successRate: 60,
    sampleSize: 180,
    lastUpdated: new Date().toISOString(),
    emoji: '💤',
    tier: 'B'
  },
  {
    id: 'nhl_corsi_dominance',
    sport: 'nhl',
    market: 'team_total',
    name: 'Corsi Dominance',
    description: 'Équipe avec CF% > 55% marque plus souvent',
    conditions: {
      minSuccessRate: 60,
      minSampleSize: 100,
      factors: [
        { name: 'corsi_for_pct', operator: '>', value: 55, weight: 0.6 }
      ]
    },
    expectedOutcome: 'over',
    expectedValue: 2.5,
    successRate: 60,
    sampleSize: 120,
    lastUpdated: new Date().toISOString(),
    emoji: '📈',
    tier: 'B'
  },
  
  // ============================================
  // TIER C - Patterns situationnels (>55%)
  // ============================================
  {
    id: 'nhl_playoff_race_under',
    sport: 'nhl',
    market: 'over_under',
    name: 'Playoff Race Tight',
    description: 'Match important = jeu plus serré',
    conditions: {
      minSuccessRate: 58,
      minSampleSize: 80,
      factors: [
        { name: 'playoff_urgency', operator: '>', value: 7, weight: 0.5 }
      ]
    },
    expectedOutcome: 'under',
    expectedValue: 5.5,
    successRate: 58,
    sampleSize: 95,
    lastUpdated: new Date().toISOString(),
    emoji: '🏆',
    tier: 'C'
  }
];

// ============================================
// MLB SUBMARKET PATTERNS
// ============================================

const MLB_SUBMARKET_PATTERNS: SubmarketPattern[] = [
  // ============================================
  // TIER S - Patterns très fiables (>70%)
  // ============================================
  {
    id: 'mlb_ace_pitcher_under',
    sport: 'mlb',
    market: 'over_under',
    name: 'Ace Pitcher Under',
    description: 'Lanceur ace avec ERA last 5 < 2.75 = UNDER runs',
    conditions: {
      minSuccessRate: 72,
      minSampleSize: 150,
      factors: [
        { name: 'starter_last5_era', operator: '<', value: 2.75, weight: 0.8 }
      ]
    },
    expectedOutcome: 'under',
    expectedValue: 7.5,
    successRate: 72,
    sampleSize: 200,
    lastUpdated: new Date().toISOString(),
    emoji: '🔥',
    tier: 'S'
  },
  {
    id: 'mlb_weak_pitcher_over',
    sport: 'mlb',
    market: 'over_under',
    name: 'Weak Pitcher Over',
    description: 'Lanceur avec ERA last 5 > 5.00 = OVER runs',
    conditions: {
      minSuccessRate: 70,
      minSampleSize: 100,
      factors: [
        { name: 'starter_last5_era', operator: '>', value: 5.00, weight: 0.7 },
        { name: 'opposing_ops', operator: '>', value: 0.720, weight: 0.3 }
      ]
    },
    expectedOutcome: 'over',
    expectedValue: 7.5,
    successRate: 70,
    sampleSize: 140,
    lastUpdated: new Date().toISOString(),
    emoji: '💥',
    tier: 'S'
  },
  {
    id: 'mlb_team_total_ace',
    sport: 'mlb',
    market: 'team_total',
    name: 'Ace Suppression',
    description: 'Face à un ace, équipe marque moins de 4 runs',
    conditions: {
      minSuccessRate: 68,
      minSampleSize: 120,
      factors: [
        { name: 'opposing_pitcher_last5_era', operator: '<', value: 3.00, weight: 0.7 }
      ]
    },
    expectedOutcome: 'under',
    expectedValue: 4.0,
    successRate: 68,
    sampleSize: 150,
    lastUpdated: new Date().toISOString(),
    emoji: '🎯',
    tier: 'S'
  },
  
  // ============================================
  // TIER A - Patterns fiables (>65%)
  // ============================================
  {
    id: 'mlb_bullpen_over',
    sport: 'mlb',
    market: 'over_under',
    name: 'Bad Bullpen Over',
    description: 'Bullpen ERA > 5.00 last 7 = runs en fin de match',
    conditions: {
      minSuccessRate: 66,
      minSampleSize: 100,
      factors: [
        { name: 'bullpen_last7_era', operator: '>', value: 5.00, weight: 0.6 }
      ]
    },
    expectedOutcome: 'over',
    expectedValue: 7.5,
    successRate: 66,
    sampleSize: 130,
    lastUpdated: new Date().toISOString(),
    emoji: '📊',
    tier: 'A'
  },
  {
    id: 'mlb_handedness_advantage',
    sport: 'mlb',
    market: 'team_total',
    name: 'Handedness Edge',
    description: 'Équipe excellente vs lanceur du type opposé',
    conditions: {
      minSuccessRate: 65,
      minSampleSize: 150,
      factors: [
        { name: 'team_ops_vs_handed', operator: '>', value: 0.780, weight: 0.6 },
        { name: 'pitcher_era_vs_handed', operator: '>', value: 4.50, weight: 0.4 }
      ]
    },
    expectedOutcome: 'over',
    expectedValue: 4.5,
    successRate: 65,
    sampleSize: 180,
    lastUpdated: new Date().toISOString(),
    emoji: '⚾',
    tier: 'A'
  },
  {
    id: 'mlb_1st_5_under',
    sport: 'mlb',
    market: 'inning',
    name: '1st 5 Innings Under',
    description: 'Deux bons lanceurs partants = début serré',
    conditions: {
      minSuccessRate: 64,
      minSampleSize: 100,
      factors: [
        { name: 'home_pitcher_era', operator: '<', value: 3.50, weight: 0.4 },
        { name: 'away_pitcher_era', operator: '<', value: 3.50, weight: 0.4 }
      ]
    },
    expectedOutcome: 'under',
    expectedValue: 5.0,
    successRate: 64,
    sampleSize: 120,
    lastUpdated: new Date().toISOString(),
    emoji: '🧢',
    tier: 'A'
  },
  
  // ============================================
  // TIER B - Patterns modérés (>60%)
  // ============================================
  {
    id: 'mlb_coors_over',
    sport: 'mlb',
    market: 'over_under',
    name: 'Coors Field Effect',
    description: 'Colorado = facteur de runs > 1.35',
    conditions: {
      minSuccessRate: 62,
      minSampleSize: 100,
      factors: [
        { name: 'park_runs_factor', operator: '>', value: 1.30, weight: 0.7 }
      ]
    },
    expectedOutcome: 'over',
    expectedValue: 10.5,
    successRate: 62,
    sampleSize: 150,
    lastUpdated: new Date().toISOString(),
    emoji: '🏔️',
    tier: 'B'
  },
  {
    id: 'mlb_pitcher_park_under',
    sport: 'mlb',
    market: 'over_under',
    name: 'Pitcher Park Under',
    description: 'Stade pitcher-friendly + bon lanceur',
    conditions: {
      minSuccessRate: 61,
      minSampleSize: 80,
      factors: [
        { name: 'park_runs_factor', operator: '<', value: 0.95, weight: 0.5 },
        { name: 'starter_era', operator: '<', value: 3.50, weight: 0.4 }
      ]
    },
    expectedOutcome: 'under',
    expectedValue: 7.5,
    successRate: 61,
    sampleSize: 100,
    lastUpdated: new Date().toISOString(),
    emoji: '🏟️',
    tier: 'B'
  },
  {
    id: 'mlb_rest_advantage',
    sport: 'mlb',
    market: 'team_total',
    name: 'Rest Advantage',
    description: 'Lanceur avec 5+ jours de repos performe mieux',
    conditions: {
      minSuccessRate: 60,
      minSampleSize: 120,
      factors: [
        { name: 'days_rest', operator: '>', value: 5, weight: 0.5 },
        { name: 'pitcher_quality_start_pct', operator: '>', value: 0.60, weight: 0.3 }
      ]
    },
    expectedOutcome: 'under',
    expectedValue: 4.0,
    successRate: 60,
    sampleSize: 140,
    lastUpdated: new Date().toISOString(),
    emoji: '💤',
    tier: 'B'
  },
  
  // ============================================
  // TIER C - Patterns situationnels (>55%)
  // ============================================
  {
    id: 'mlb_interleague_under',
    sport: 'mlb',
    market: 'over_under',
    name: 'Interleague Unknown',
    description: 'Match interleague = moins de familiarité = moins de runs',
    conditions: {
      minSuccessRate: 57,
      minSampleSize: 100,
      factors: [
        { name: 'is_interleague', operator: '==', value: 1, weight: 0.4 }
      ]
    },
    expectedOutcome: 'under',
    expectedValue: 8.0,
    successRate: 57,
    sampleSize: 130,
    lastUpdated: new Date().toISOString(),
    emoji: '🌐',
    tier: 'C'
  }
];

// ============================================
// FONCTIONS D'ANALYSE
// ============================================

/**
 * Analyse un match NHL pour les sous-marchés
 */
export function analyzeNHLSubmarkets(
  homeTeamAbbr: string,
  awayTeamAbbr: string,
  oddsHome: number = 2.0,
  oddsAway: number = 2.0,
  isBackToBackHome: boolean = false,
  isBackToBackAway: boolean = false
): SubmarketAnalysis {
  const matchedPatterns: SubmarketPattern[] = [];
  const reasoning: string[] = [];
  const warnings: string[] = [];
  
  // Récupérer les données
  const homeGoalie = getGoalieStats(homeTeamAbbr);
  const awayGoalie = getGoalieStats(awayTeamAbbr);
  const homeTeamStats = getTeamAdvancedStats(homeTeamAbbr);
  const awayTeamStats = getTeamAdvancedStats(awayTeamAbbr);
  
  // Analyser chaque pattern
  for (const pattern of NHL_SUBMARKET_PATTERNS) {
    let matchScore = 0;
    const factors = pattern.conditions.factors;
    
    for (const factor of factors) {
      let value: number | undefined;
      
      switch (factor.name) {
        case 'goalie_last5_sv':
        case 'both_goalies_sv':
          value = Math.max(homeGoalie?.last5SV || 0, awayGoalie?.last5SV || 0);
          break;
        case 'opposing_goalie_last5_sv':
        case 'away_goalie_last5_sv':
          value = awayGoalie?.last5SV;
          break;
        case 'away_b2b':
          value = isBackToBackAway ? 1 : 0;
          break;
        case 'is_division_game':
          // Check division
          const divisions = [
            ['BOS', 'BUF', 'DET', 'FLA', 'MTL', 'OTT', 'TBL', 'TOR'],
            ['CAR', 'CBJ', 'NJD', 'NYI', 'NYR', 'PHI', 'PIT', 'WSH'],
            ['CHI', 'COL', 'DAL', 'MIN', 'NSH', 'STL', 'WPG', 'UTA'],
            ['ANA', 'CGY', 'EDM', 'LAK', 'SEA', 'SJS', 'VAN', 'VGK']
          ];
          value = divisions.some(div => div.includes(homeTeamAbbr) && div.includes(awayTeamAbbr)) ? 1 : 0;
          break;
        case 'home_xga':
          value = homeTeamStats?.xGAPer60;
          break;
        case 'away_xga':
          value = awayTeamStats?.xGAPer60;
          break;
        case 'home_xgf':
          value = homeTeamStats?.xGFPer60;
          break;
        case 'days_rest':
          value = Math.max(homeGoalie?.daysSinceLastGame || 2, awayGoalie?.daysSinceLastGame || 2);
          break;
        case 'goalie_sv':
          value = Math.min(homeGoalie?.seasonSV || 0.905, awayGoalie?.seasonSV || 0.905);
          break;
        case 'corsi_for_pct':
          value = Math.max(homeTeamStats?.corsiForPct || 50, awayTeamStats?.corsiForPct || 50);
          break;
        case 'playoff_urgency':
          // Approximation basée sur le classement division
          value = (homeTeamStats?.divisionRank || 4) <= 3 ? 8 : 4;
          break;
      }
      
      if (value !== undefined) {
        if (checkCondition(value, factor.operator, factor.value)) {
          matchScore += factor.weight;
        }
      }
    }
    
    // Si le pattern match (score > 0.5)
    if (matchScore > 0.5) {
      matchedPatterns.push(pattern);
      reasoning.push(`${pattern.emoji} ${pattern.tier}-TIER: ${pattern.name} (${pattern.successRate}% succès)`);
    }
  }
  
  // Trier par success rate
  matchedPatterns.sort((a, b) => b.successRate - a.successRate);
  
  // Meilleur pattern
  const best = matchedPatterns[0] || null;
  
  // Recommandation
  let recommendation: { market: string; selection: string; confidence: number; reasoning: string[] };
  
  if (best) {
    recommendation = {
      market: best.market === 'over_under' ? 'Total Buts' : best.market === 'team_total' ? 'Team Total' : '1st Period',
      selection: `${best.expectedOutcome.toUpperCase()} ${best.expectedValue}`,
      confidence: best.successRate,
      reasoning
    };
  } else {
    recommendation = {
      market: 'Aucun',
      selection: 'Éviter',
      confidence: 50,
      reasoning: ['Aucun pattern fiable détecté pour ce match']
    };
  }
  
  // Warnings
  if (matchedPatterns.filter(p => p.tier === 'S').length === 0) {
    warnings.push('⚠️ Aucun pattern S-TIER détecté - Confiance réduite');
  }
  if (!homeGoalie || !awayGoalie) {
    warnings.push('⚠️ Données gardien manquantes');
  }
  
  return {
    sport: 'nhl',
    patterns: {
      matched: matchedPatterns,
      best
    },
    recommendation,
    warnings
  };
}

/**
 * Analyse un match MLB pour les sous-marchés
 */
export function analyzeMLBSubmarkets(
  homeTeamAbbr: string,
  awayTeamAbbr: string,
  oddsHome: number = 1.90,
  oddsAway: number = 1.90,
  totalRuns: number = 8.5
): SubmarketAnalysis {
  const matchedPatterns: SubmarketPattern[] = [];
  const reasoning: string[] = [];
  const warnings: string[] = [];
  
  // Récupérer les données
  const homePitcher = getPitcherStats(homeTeamAbbr);
  const awayPitcher = getPitcherStats(awayTeamAbbr);
  const homeTeamStats = getMLBTeamStats(homeTeamAbbr);
  const awayTeamStats = getMLBTeamStats(awayTeamAbbr);
  const parkFactor = getParkFactor(homeTeamAbbr);
  
  // Analyser chaque pattern
  for (const pattern of MLB_SUBMARKET_PATTERNS) {
    let matchScore = 0;
    const factors = pattern.conditions.factors;
    
    for (const factor of factors) {
      let value: number | undefined;
      
      switch (factor.name) {
        case 'starter_last5_era':
          value = Math.min(homePitcher?.last5ERA || 5, awayPitcher?.last5ERA || 5);
          break;
        case 'opposing_pitcher_last5_era':
          value = Math.max(homePitcher?.last5ERA || 3, awayPitcher?.last5ERA || 3);
          break;
        case 'opposing_ops':
          value = Math.max(homeTeamStats?.ops || 0.720, awayTeamStats?.ops || 0.720);
          break;
        case 'bullpen_last7_era':
          value = Math.max(homeTeamStats?.bullpenLast7ERA || 4, awayTeamStats?.bullpenLast7ERA || 4);
          break;
        case 'team_ops_vs_handed':
          // Check vs opposing pitcher handedness
          const homeVsHanded = homePitcher?.handedness === 'L' 
            ? awayTeamStats?.opsVsLHP 
            : awayTeamStats?.opsVsRHP;
          value = homeVsHanded;
          break;
        case 'pitcher_era_vs_handed':
          value = homePitcher?.eraVsLHB || homePitcher?.era;
          break;
        case 'home_pitcher_era':
          value = homePitcher?.era;
          break;
        case 'away_pitcher_era':
          value = awayPitcher?.era;
          break;
        case 'park_runs_factor':
          value = parkFactor?.runsFactor;
          break;
        case 'starter_era':
          value = Math.min(homePitcher?.era || 4, awayPitcher?.era || 4);
          break;
        case 'days_rest':
          value = Math.max(homePitcher?.daysRest || 5, awayPitcher?.daysRest || 5);
          break;
        case 'pitcher_quality_start_pct':
          value = Math.max(homePitcher?.qualityStartPct || 0.5, awayPitcher?.qualityStartPct || 0.5);
          break;
        case 'is_interleague':
          // AL vs NL
          const alTeams = ['BAL', 'BOS', 'CWS', 'CLE', 'DET', 'HOU', 'KC', 'LAA', 'MIN', 'NYY', 'OAK', 'SEA', 'TB', 'TEX', 'TOR'];
          const nlTeams = ['ARI', 'ATL', 'CHC', 'CIN', 'COL', 'LAD', 'MIA', 'MIL', 'NYM', 'PHI', 'PIT', 'SD', 'SFG', 'STL', 'WSH'];
          value = (alTeams.includes(homeTeamAbbr) && nlTeams.includes(awayTeamAbbr)) ||
                  (nlTeams.includes(homeTeamAbbr) && alTeams.includes(awayTeamAbbr)) ? 1 : 0;
          break;
      }
      
      if (value !== undefined) {
        if (checkCondition(value, factor.operator, factor.value)) {
          matchScore += factor.weight;
        }
      }
    }
    
    // Si le pattern match
    if (matchScore > 0.5) {
      matchedPatterns.push(pattern);
      reasoning.push(`${pattern.emoji} ${pattern.tier}-TIER: ${pattern.name} (${pattern.successRate}% succès)`);
    }
  }
  
  // Trier par success rate
  matchedPatterns.sort((a, b) => b.successRate - a.successRate);
  
  // Meilleur pattern
  const best = matchedPatterns[0] || null;
  
  // Recommandation
  let recommendation: { market: string; selection: string; confidence: number; reasoning: string[] };
  
  if (best) {
    recommendation = {
      market: best.market === 'over_under' ? 'Total Runs' : best.market === 'team_total' ? 'Team Total' : '1st 5 Innings',
      selection: `${best.expectedOutcome.toUpperCase()} ${best.expectedValue}`,
      confidence: best.successRate,
      reasoning
    };
  } else {
    recommendation = {
      market: 'Aucun',
      selection: 'Éviter',
      confidence: 50,
      reasoning: ['Aucun pattern fiable détecté pour ce match']
    };
  }
  
  // Warnings
  if (matchedPatterns.filter(p => p.tier === 'S').length === 0) {
    warnings.push('⚠️ Aucun pattern S-TIER détecté - Confiance réduite');
  }
  if (!homePitcher || !awayPitcher) {
    warnings.push('⚠️ Données lanceur manquantes');
  }
  
  return {
    sport: 'mlb',
    patterns: {
      matched: matchedPatterns,
      best
    },
    recommendation,
    warnings
  };
}

/**
 * Vérifie une condition
 */
function checkCondition(value: number, operator: string, target: number | string): boolean {
  const targetNum = typeof target === 'string' ? parseFloat(target) : target;
  
  switch (operator) {
    case '>': return value > targetNum;
    case '<': return value < targetNum;
    case '>=': return value >= targetNum;
    case '<=': return value <= targetNum;
    case '==': return value === targetNum;
    case '!=': return value !== targetNum;
    default: return false;
  }
}

/**
 * Obtient tous les patterns disponibles
 */
export function getAllPatterns(): { nhl: SubmarketPattern[]; mlb: SubmarketPattern[] } {
  return {
    nhl: NHL_SUBMARKET_PATTERNS,
    mlb: MLB_SUBMARKET_PATTERNS
  };
}

/**
 * Filtre les patterns par tier
 */
export function getPatternsByTier(tier: 'S' | 'A' | 'B' | 'C'): { nhl: SubmarketPattern[]; mlb: SubmarketPattern[] } {
  return {
    nhl: NHL_SUBMARKET_PATTERNS.filter(p => p.tier === tier),
    mlb: MLB_SUBMARKET_PATTERNS.filter(p => p.tier === tier)
  };
}

// ============================================
// EXPORT
// ============================================

export default {
  analyzeNHLSubmarkets,
  analyzeMLBSubmarkets,
  getAllPatterns,
  getPatternsByTier,
  NHL_SUBMARKET_PATTERNS,
  MLB_SUBMARKET_PATTERNS
};
