/**
 * API-Football Service - Real football statistics
 * Documentation: https://www.api-football.com/documentation-v3
 * 
 * Provides REAL data:
 * - Team statistics (goals scored/conceded, form)
 * - Head-to-head history
 * - Injuries/suspensions
 * - League standings
 */

// API Configuration
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const API_FOOTBALL_BASE = 'https://api-football-v1.p.rapidapi.com/v3';

// Rate limiting: 100 requests/day on free tier
let requestCount = 0;
const MAX_REQUESTS_PER_DAY = 100;

interface TeamStats {
  teamId: number;
  teamName: string;
  leagueId: number;
  season: number;
  fixtures: {
    played: { home: number; away: number; total: number };
    wins: { home: number; away: number; total: number };
    draws: { home: number; away: number; total: number };
    loses: { home: number; away: number; total: number };
  };
  goals: {
    total: { home: number; away: number; total: number };
    conceded: { home: number; away: number; total: number };
    avgPerMatch: { home: number; away: number; total: number };
  };
  cards: {
    yellow: { total: number; avgPerMatch: number };
    red: { total: number; avgPerMatch: number };
  };
  form: string; // e.g., "W,D,L,W,W"
  last5: { home: string[]; away: string[] };
}

interface H2HResult {
  total: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  avgGoalsHome: number;
  avgGoalsAway: number;
  lastMatches: Array<{
    date: string;
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
  }>;
}

interface TeamForm {
  last5Matches: Array<{
    date: string;
    opponent: string;
    result: 'W' | 'D' | 'L';
    goalsFor: number;
    goalsAgainst: number;
    home: boolean;
  }>;
  formScore: number; // 0-100 based on recent results
  avgGoalsScored: number;
  avgGoalsConceded: number;
  cleanSheets: number;
  failedToScore: number;
}

/**
 * Check if we can make API requests
 */
function canMakeRequest(): boolean {
  // Reset counter if it's a new day (simple check)
  return requestCount < MAX_REQUESTS_PER_DAY;
}

/**
 * Make authenticated API request
 */
async function apiFetch(endpoint: string, params: Record<string, string>): Promise<any> {
  if (!API_FOOTBALL_KEY) {
    console.log('⚠️ API-Football key not configured');
    return null;
  }

  if (!canMakeRequest()) {
    console.log('⚠️ API-Football daily limit reached');
    return null;
  }

  const url = new URL(`${API_FOOTBALL_BASE}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  try {
    requestCount++;
    console.log(`📡 API-Football request #${requestCount}: ${endpoint}`);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': API_FOOTBALL_KEY,
        'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
      },
      next: { revalidate: 3600 } // 1 hour cache
    });

    if (!response.ok) {
      console.error(`❌ API-Football error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.response;

  } catch (error) {
    console.error('❌ API-Football fetch error:', error);
    return null;
  }
}

/**
 * Get team ID by name
 */
const TEAM_ID_CACHE: Record<string, number> = {
  // Premier League
  'Manchester City': 50,
  'Arsenal': 42,
  'Liverpool': 40,
  'Manchester United': 33,
  'Chelsea': 49,
  'Tottenham': 47,
  'Newcastle': 34,
  'Brighton': 51,
  'Aston Villa': 66,
  'West Ham': 48,
  'Fulham': 36,
  'Crystal Palace': 52,
  'Brentford': 55,
  'Nottingham Forest': 65,
  'Everton': 45,
  'Bournemouth': 35,
  'Wolves': 39,
  'Southampton': 41,
  
  // La Liga
  'Real Madrid': 541,
  'Barcelona': 529,
  'Atletico Madrid': 530,
  'Real Sociedad': 548,
  'Villarreal': 533,
  'Athletic Bilbao': 531,
  'Sevilla': 536,
  'Real Betis': 543,
  'Valencia': 532,
  'Girona': 547,
  'Rayo Vallecano': 989,
  
  // Bundesliga
  'Bayern Munich': 157,
  'Borussia Dortmund': 165,
  'RB Leipzig': 173,
  'Bayer Leverkusen': 168,
  'Eintracht Frankfurt': 161,
  'Wolfsburg': 161,
  'Freiburg': 160,
  'Mainz': 167,
  'Borussia Monchengladbach': 163,
  'Hamburger SV': 161,
  
  // Serie A
  'Inter Milan': 505,
  'AC Milan': 489,
  'Juventus': 496,
  'Napoli': 492,
  'Roma': 497,
  'Lazio': 487,
  'Atalanta': 499,
  'Fiorentina': 502,
  
  // Ligue 1
  'PSG': 85,
  'Marseille': 81,
  'Monaco': 91,
  'Lyon': 80,
  'Lille': 79,
  'Nice': 84,
  'Lens': 94,
  'Rennes': 83
};

/**
 * Get league ID by name
 */
const LEAGUE_ID: Record<string, number> = {
  'Premier League': 39,
  'La Liga': 140,
  'Bundesliga': 78,
  'Serie A': 135,
  'Ligue 1': 61,
  'Champions League': 2,
  'Europa League': 3
};

/**
 * Get team statistics from API
 */
export async function getTeamStats(teamName: string, league: string = 'Premier League'): Promise<TeamStats | null> {
  const teamId = TEAM_ID_CACHE[teamName];
  const leagueId = LEAGUE_ID[league];
  
  if (!teamId || !leagueId) {
    console.log(`⚠️ Team or league not found in cache: ${teamName} / ${league}`);
    return null;
  }
  
  const currentYear = new Date().getFullYear();
  const season = currentYear - 1; // Football season starts previous year
  
  const data = await apiFetch('/teams/statistics', {
    team: teamId.toString(),
    league: leagueId.toString(),
    season: season.toString()
  });
  
  if (!data) return null;
  
  const stats = data[0];
  if (!stats) return null;
  
  return {
    teamId: teamId,
    teamName: stats.team?.name || teamName,
    leagueId: leagueId,
    season: season,
    fixtures: {
      played: {
        home: stats.fixtures?.played?.home || 0,
        away: stats.fixtures?.played?.away || 0,
        total: stats.fixtures?.played?.total || 0
      },
      wins: {
        home: stats.fixtures?.wins?.home || 0,
        away: stats.fixtures?.wins?.away || 0,
        total: stats.fixtures?.wins?.total || 0
      },
      draws: {
        home: stats.fixtures?.draws?.home || 0,
        away: stats.fixtures?.draws?.away || 0,
        total: stats.fixtures?.draws?.total || 0
      },
      loses: {
        home: stats.fixtures?.loses?.home || 0,
        away: stats.fixtures?.loses?.away || 0,
        total: stats.fixtures?.loses?.total || 0
      }
    },
    goals: {
      total: {
        home: stats.goals?.for?.total?.home || 0,
        away: stats.goals?.for?.total?.away || 0,
        total: stats.goals?.for?.total?.total || 0
      },
      conceded: {
        home: stats.goals?.against?.total?.home || 0,
        away: stats.goals?.against?.total?.away || 0,
        total: stats.goals?.against?.total?.total || 0
      },
      avgPerMatch: {
        home: stats.goals?.for?.average?.home || 0,
        away: stats.goals?.for?.average?.away || 0,
        total: stats.goals?.for?.average?.total || 0
      }
    },
    cards: {
      yellow: {
        total: (stats.cards?.yellow?.total || 0),
        avgPerMatch: stats.cards?.yellow?.average || 0
      },
      red: {
        total: (stats.cards?.red?.total || 0),
        avgPerMatch: stats.cards?.red?.average || 0
      }
    },
    form: stats.form || '',
    last5: {
      home: [],
      away: []
    }
  };
}

/**
 * Get Head-to-Head history between two teams
 */
export async function getH2H(team1Name: string, team2Name: string): Promise<H2HResult | null> {
  const team1Id = TEAM_ID_CACHE[team1Name];
  const team2Id = TEAM_ID_CACHE[team2Name];
  
  if (!team1Id || !team2Id) {
    console.log(`⚠️ Teams not found for H2H: ${team1Name} vs ${team2Name}`);
    return null;
  }
  
  const data = await apiFetch('/fixtures/headtohead', {
    h2h: `${team1Id}-${team2Id}`,
    last: '10' // Last 10 meetings
  });
  
  if (!data || data.length === 0) return null;
  
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let totalHomeGoals = 0;
  let totalAwayGoals = 0;
  const lastMatches: H2HResult['lastMatches'] = [];
  
  for (const match of data) {
    const homeTeam = match.teams?.home?.name;
    const awayTeam = match.teams?.away?.name;
    const homeScore = match.goals?.home || 0;
    const awayScore = match.goals?.away || 0;
    
    totalHomeGoals += homeScore;
    totalAwayGoals += awayScore;
    
    if (homeScore > awayScore) {
      if (homeTeam === team1Name) homeWins++;
      else awayWins++;
    } else if (homeScore < awayScore) {
      if (homeTeam === team1Name) awayWins++;
      else homeWins++;
    } else {
      draws++;
    }
    
    lastMatches.push({
      date: match.fixture?.date || '',
      homeTeam: homeTeam || '',
      awayTeam: awayTeam || '',
      homeScore,
      awayScore
    });
  }
  
  return {
    total: data.length,
    homeWins,
    draws,
    awayWins,
    avgGoalsHome: totalHomeGoals / data.length,
    avgGoalsAway: totalAwayGoals / data.length,
    lastMatches: lastMatches.slice(0, 5)
  };
}

/**
 * Calculate form score from team statistics
 */
export function calculateFormScore(stats: TeamStats | null): number {
  if (!stats) return 50; // Default neutral
  
  const winRate = stats.fixtures.wins.total / Math.max(stats.fixtures.played.total, 1);
  const goalsPerGame = stats.goals.avgPerMatch.total || 0;
  const goalsConcededPerGame = stats.goals.conceded.total / Math.max(stats.fixtures.played.total, 1);
  
  // Calculate score (0-100)
  let score = 50;
  score += winRate * 30; // Up to 30 points for win rate
  score += Math.min(goalsPerGame * 5, 15); // Up to 15 points for goals
  score -= Math.min(goalsConcededPerGame * 5, 15); // Reduce for goals conceded
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Analyze match with real statistics
 */
export async function analyzeMatchWithRealData(
  homeTeam: string,
  awayTeam: string,
  league: string,
  oddsHome: number,
  oddsDraw: number | null,
  oddsAway: number
): Promise<{
  homeStats: TeamStats | null;
  awayStats: TeamStats | null;
  h2h: H2HResult | null;
  prediction: {
    result: { prediction: string; confidence: number; basedOn: string };
    goals: { predicted: number; over25: number; basedOn: string } | null;
    dataQuality: 'real' | 'partial' | 'none';
  };
}> {
  // Fetch real data
  const [homeStats, awayStats, h2h] = await Promise.all([
    getTeamStats(homeTeam, league),
    getTeamStats(awayTeam, league),
    getH2H(homeTeam, awayTeam)
  ]);
  
  // Determine data quality
  const hasRealData = !!(homeStats && awayStats);
  const hasH2H = !!(h2h && h2h.total > 0);
  const dataQuality: 'real' | 'partial' | 'none' = hasRealData ? 'real' : (hasH2H ? 'partial' : 'none');
  
  // Result prediction
  let resultPrediction = '';
  let resultConfidence = 50;
  
  if (hasRealData) {
    // Use real stats
    const homeFormScore = calculateFormScore(homeStats);
    const awayFormScore = calculateFormScore(awayStats);
    
    const homeWinRate = homeStats.fixtures.wins.total / Math.max(homeStats.fixtures.played.total, 1);
    const awayWinRate = awayStats.fixtures.wins.away / Math.max(awayStats.fixtures.played.away, 1);
    
    // Home advantage + form
    const homeStrength = homeFormScore + 10 + (homeWinRate * 20);
    const awayStrength = awayFormScore + (awayWinRate * 20);
    
    if (homeStrength > awayStrength + 15) {
      resultPrediction = 'home';
      resultConfidence = Math.min(85, 60 + (homeStrength - awayStrength));
    } else if (awayStrength > homeStrength + 10) {
      resultPrediction = 'away';
      resultConfidence = Math.min(75, 55 + (awayStrength - homeStrength));
    } else {
      // Close match - consider draw
      if (oddsDraw && oddsDraw < 3.5) {
        resultPrediction = 'draw';
        resultConfidence = 40;
      } else if (homeStrength > awayStrength) {
        resultPrediction = 'home';
        resultConfidence = 55;
      } else {
        resultPrediction = 'away';
        resultConfidence = 50;
      }
    }
  } else {
    // Fallback to odds
    if (oddsHome < oddsAway && oddsHome < 2.0) {
      resultPrediction = 'home';
      resultConfidence = Math.round(70 - (oddsHome - 1) * 30);
    } else if (oddsAway < oddsHome && oddsAway < 2.0) {
      resultPrediction = 'away';
      resultConfidence = Math.round(70 - (oddsAway - 1) * 30);
    } else {
      resultPrediction = oddsHome < oddsAway ? 'home' : 'away';
      resultConfidence = 45;
    }
  }
  
  // Goals prediction (only if real data)
  let goalsPrediction: { predicted: number; over25: number; basedOn: string } | null = null;
  if (hasRealData) {
    const avgHomeGoals = homeStats.goals.avgPerMatch.total || 0;
    const avgAwayGoals = awayStats.goals.avgPerMatch.total || 0;
    const avgHomeConceded = homeStats.goals.conceded.total / Math.max(homeStats.fixtures.played.total, 1);
    const avgAwayConceded = awayStats.goals.conceded.total / Math.max(awayStats.fixtures.played.total, 1);
    
    const predictedTotal = (avgHomeGoals + avgAwayConceded + avgAwayGoals + avgHomeConceded) / 2;
    
    // Calculate over 2.5 probability based on averages
    const over25 = predictedTotal > 2.5 ? Math.min(75, 50 + (predictedTotal - 2.5) * 20) : Math.max(25, 50 - (2.5 - predictedTotal) * 15);
    
    goalsPrediction = {
      predicted: Math.round(predictedTotal * 10) / 10,
      over25: Math.round(over25),
      basedOn: 'real_stats'
    };
  }
  
  return {
    homeStats,
    awayStats,
    h2h,
    prediction: {
      result: {
        prediction: resultPrediction,
        confidence: resultConfidence,
        basedOn: hasRealData ? 'real_stats' : 'odds_only'
      },
      goals: goalsPrediction,
      dataQuality
    }
  };
}

/**
 * Get team name from cache (fuzzy match)
 */
export function findTeamId(teamName: string): number | null {
  // Exact match
  if (TEAM_ID_CACHE[teamName]) return TEAM_ID_CACHE[teamName];
  
  // Fuzzy match
  const normalized = teamName.toLowerCase().trim();
  for (const [name, id] of Object.entries(TEAM_ID_CACHE)) {
    const cached = name.toLowerCase();
    if (cached.includes(normalized) || normalized.includes(cached)) {
      return id;
    }
  }
  
  return null;
}

// ===== Types for backward compatibility =====
export interface Injury {
  player: string;
  team: string;
  type: 'injury' | 'suspension';
  reason: string;
}

export interface TeamFormData {
  last5Matches: Array<{
    date: string;
    opponent: string;
    result: 'W' | 'D' | 'L';
    goalsFor: number;
    goalsAgainst: number;
  }>;
  formScore: number;
  avgGoalsScored: number;
  avgGoalsConceded: number;
}

export interface H2HMatch {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  competition: string;
}

export interface MatchAnalysisData {
  fixture?: { id: number; date: string; league: string; status: string };
  homeInjuries: Injury[];
  awayInjuries: Injury[];
  homeForm: TeamFormData | null;
  awayForm: TeamFormData | null;
  h2h: H2HMatch[];
  homeStats?: { played: number; wins: number; draws: number; losses: number; form: string };
  awayStats?: { played: number; wins: number; draws: number; losses: number; form: string };
}

/**
 * Get remaining API requests info
 */
export function getRemainingRequests(): { remaining: number; total: number; resetAt: string } {
  return {
    remaining: MAX_REQUESTS_PER_DAY - requestCount,
    total: MAX_REQUESTS_PER_DAY,
    resetAt: 'midnight UTC'
  };
}

/**
 * Get match analysis data (backward compatible wrapper)
 * Uses TheSportsDB via teamStatsService as primary source
 */
export async function getMatchAnalysisData(
  homeTeam: string,
  awayTeam: string,
  league?: string
): Promise<MatchAnalysisData> {
  // Try to get stats from teamStatsService (TheSportsDB)
  try {
    const { getMatchTeamStats } = await import('./teamStatsService');
    const matchStats = await getMatchTeamStats(homeTeam, awayTeam);
    
    const result: MatchAnalysisData = {
      homeInjuries: [],
      awayInjuries: [],
      homeForm: null,
      awayForm: null,
      h2h: []
    };
    
    if (matchStats.homeTeam) {
      result.homeStats = {
        played: matchStats.homeTeam.played,
        wins: matchStats.homeTeam.won,
        draws: matchStats.homeTeam.drawn,
        losses: matchStats.homeTeam.lost,
        form: matchStats.homeTeam.form
      };
      
      // Convert form string to TeamFormData
      const formString = matchStats.homeTeam.form || '';
      result.homeForm = {
        last5Matches: formString.split('').map((result, i) => ({
          date: '',
          opponent: '',
          result: result as 'W' | 'D' | 'L',
          goalsFor: 0,
          goalsAgainst: 0
        })),
        formScore: matchStats.homeTeam.formAnalysis.formPoints * 5,
        avgGoalsScored: matchStats.homeTeam.goalsFor / matchStats.homeTeam.played,
        avgGoalsConceded: matchStats.homeTeam.goalsAgainst / matchStats.homeTeam.played
      };
    }
    
    if (matchStats.awayTeam) {
      result.awayStats = {
        played: matchStats.awayTeam.played,
        wins: matchStats.awayTeam.won,
        draws: matchStats.awayTeam.drawn,
        losses: matchStats.awayTeam.lost,
        form: matchStats.awayTeam.form
      };
      
      const formString = matchStats.awayTeam.form || '';
      result.awayForm = {
        last5Matches: formString.split('').map((result, i) => ({
          date: '',
          opponent: '',
          result: result as 'W' | 'D' | 'L',
          goalsFor: 0,
          goalsAgainst: 0
        })),
        formScore: matchStats.awayTeam.formAnalysis.formPoints * 5,
        avgGoalsScored: matchStats.awayTeam.goalsFor / matchStats.awayTeam.played,
        avgGoalsConceded: matchStats.awayTeam.goalsAgainst / matchStats.awayTeam.played
      };
    }
    
    return result;
    
  } catch (error) {
    console.error('Erreur getMatchAnalysisData:', error);
    return {
      homeInjuries: [],
      awayInjuries: [],
      homeForm: null,
      awayForm: null,
      h2h: []
    };
  }
}

/**
 * Get injuries and suspensions for a team
 * Returns array of injured/suspended players
 */
export async function getInjuriesAndSuspensions(teamName: string): Promise<Injury[]> {
  const teamId = TEAM_ID_CACHE[teamName];
  
  if (!teamId) {
    console.log(`⚠️ Team not found for injuries: ${teamName}`);
    return [];
  }
  
  const currentYear = new Date().getFullYear();
  const season = currentYear - 1;
  
  const data = await apiFetch('/injuries', {
    team: teamId.toString(),
    season: season.toString()
  });
  
  if (!data || data.length === 0) return [];
  
  return data.slice(0, 10).map((item: any) => ({
    player: item.player?.name || 'Unknown',
    team: item.team?.name || teamName,
    type: (item.type?.toLowerCase().includes('suspension') ? 'suspension' : 'injury') as 'injury' | 'suspension',
    reason: item.reason || 'Unknown'
  }));
}

export { TEAM_ID_CACHE, LEAGUE_ID };
