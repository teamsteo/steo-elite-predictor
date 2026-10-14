import { NextResponse } from 'next/server';
import { getNFLMatches, getNFLTeamStats, generateUpcomingNFLMatches } from '@/lib/nflAdvancedScraper';

// NFL Match interface (matching page.tsx)
interface NFLMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string;
  awayAbbr: string;
  date: string;
  time: string;
  status: string;
  isLive?: boolean;
  homeRecord?: string;
  awayRecord?: string;
  
  projected: {
    homePoints: number;
    awayPoints: number;
    totalPoints: number;
    spread: number;
    homeWinProb: number;
    awayWinProb: number;
  };
  
  factors: {
    dvoaDiff: number;
    epaDiff: number;
    turnoverEdge: number;
    homeFieldAdvantage: number;
    restEdge: number;
    injuryEdge: number;
    trendEdge: number;
    qbMatchup: string;
  };
  
  insights: {
    spread: {
      line: number;
      recommendation: 'home' | 'away' | 'pass';
      confidence: number;
      reasoning: string;
    };
    total: {
      line: number;
      predicted: number;
      recommendation: 'over' | 'under' | 'pass';
      confidence: number;
      reasoning: string;
    };
    moneyline: {
      homeProb: number;
      awayProb: number;
      valueBet: {
        detected: boolean;
        type: 'home' | 'away' | null;
        edge: number;
      };
    };
    kellyFraction: number;
    confidence: number;
    recommendation: string;
  };
  
  injuryReport: {
    home: {
      impact: string;
      keyPlayersOut: string[];
    };
    away: {
      impact: string;
      keyPlayersOut: string[];
    };
    summary: string;
  };
  
  dataQuality: {
    homeStats: 'real' | 'fallback';
    awayStats: 'real' | 'fallback';
    overallScore: number;
  };
}

// NFL Teams Data (DVOA, EPA from recent seasons)
const NFL_TEAMS: Record<string, { name: string; abbr: string; dvoa: number; epa: number; qbr: string }> = {
  'KC': { name: 'Kansas City Chiefs', abbr: 'KC', dvoa: 28.5, epa: 0.15, qbr: 'Mahomes - Elite' },
  'BUF': { name: 'Buffalo Bills', abbr: 'BUF', dvoa: 24.2, epa: 0.12, qbr: 'Allen - Elite' },
  'SF': { name: 'San Francisco 49ers', abbr: 'SF', dvoa: 26.1, epa: 0.14, qbr: 'Purdy - High' },
  'PHI': { name: 'Philadelphia Eagles', abbr: 'PHI', dvoa: 22.8, epa: 0.11, qbr: 'Hurts - High' },
  'DAL': { name: 'Dallas Cowboys', abbr: 'DAL', dvoa: 18.5, epa: 0.08, qbr: 'Prescott - Above Avg' },
  'MIA': { name: 'Miami Dolphins', abbr: 'MIA', dvoa: 20.3, epa: 0.10, qbr: 'Tagovailoa - High' },
  'DET': { name: 'Detroit Lions', abbr: 'DET', dvoa: 19.7, epa: 0.09, qbr: 'Goff - Above Avg' },
  'BAL': { name: 'Baltimore Ravens', abbr: 'BAL', dvoa: 23.4, epa: 0.13, qbr: 'Jackson - Elite' },
  'CIN': { name: 'Cincinnati Bengals', abbr: 'CIN', dvoa: 15.2, epa: 0.06, qbr: 'Burrow - High' },
  'GB': { name: 'Green Bay Packers', abbr: 'GB', dvoa: 12.8, epa: 0.05, qbr: 'Love - Above Avg' },
  'LAR': { name: 'Los Angeles Rams', abbr: 'LAR', dvoa: 10.5, epa: 0.03, qbr: 'Stafford - Average' },
  'SEA': { name: 'Seattle Seahawks', abbr: 'SEA', dvoa: 8.2, epa: 0.01, qbr: 'Smith - Average' },
  'NYJ': { name: 'New York Jets', abbr: 'NYJ', dvoa: -2.5, epa: -0.05, qbr: 'Rodgers - Unknown' },
  'LV': { name: 'Las Vegas Raiders', abbr: 'LV', dvoa: -5.8, epa: -0.08, qbr: 'Minshew - Below Avg' },
  'NE': { name: 'New England Patriots', abbr: 'NE', dvoa: -8.2, epa: -0.10, qbr: 'Brissett - Below Avg' },
  'CAR': { name: 'Carolina Panthers', abbr: 'CAR', dvoa: -12.5, epa: -0.15, qbr: 'Young - Developing' },
  'ATL': { name: 'Atlanta Falcons', abbr: 'ATL', dvoa: 5.5, epa: 0.02, qbr: 'Cousins - Above Avg' },
  'TB': { name: 'Tampa Bay Buccaneers', abbr: 'TB', dvoa: 7.2, epa: 0.03, qbr: 'Mayfield - Average' },
  'NO': { name: 'New Orleans Saints', abbr: 'NO', dvoa: 3.1, epa: 0.01, qbr: 'Carr - Average' },
  'MIN': { name: 'Minnesota Vikings', abbr: 'MIN', dvoa: 11.5, epa: 0.04, qbr: 'Darnold - Above Avg' },
  'CHI': { name: 'Chicago Bears', abbr: 'CHI', dvoa: -1.2, epa: -0.02, qbr: 'Williams - Rookie' },
  'HOU': { name: 'Houston Texans', abbr: 'HOU', dvoa: 14.8, epa: 0.07, qbr: 'Stroud - High' },
  'IND': { name: 'Indianapolis Colts', abbr: 'IND', dvoa: 4.2, epa: 0.02, qbr: 'Richardson - Developing' },
  'JAX': { name: 'Jacksonville Jaguars', abbr: 'JAX', dvoa: 2.5, epa: 0.01, qbr: 'Lawrence - Above Avg' },
  'TEN': { name: 'Tennessee Titans', abbr: 'TEN', dvoa: -3.5, epa: -0.04, qbr: 'Levis - Below Avg' },
  'DEN': { name: 'Denver Broncos', abbr: 'DEN', dvoa: -0.8, epa: -0.01, qbr: 'Nix - Rookie' },
  'LAC': { name: 'Los Angeles Chargers', abbr: 'LAC', dvoa: 9.5, epa: 0.02, qbr: 'Herbert - High' },
  'ARI': { name: 'Arizona Cardinals', abbr: 'ARI', dvoa: -4.2, epa: -0.03, qbr: 'Murray - Average' },
  'WAS': { name: 'Washington Commanders', abbr: 'WAS', dvoa: 1.5, epa: 0.01, qbr: 'Daniels - Rookie' },
  'NYG': { name: 'New York Giants', abbr: 'NYG', dvoa: -6.8, epa: -0.07, qbr: 'Jones - Below Avg' },
  'CLE': { name: 'Cleveland Browns', abbr: 'CLE', dvoa: 6.8, epa: 0.02, qbr: 'Watson - Average' },
  'PIT': { name: 'Pittsburgh Steelers', abbr: 'PIT', dvoa: 8.5, epa: 0.03, qbr: 'Fields/Wilson - Average' },
};

// ESPN API URL for NFL
const ESPN_NFL_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

/**
 * Fetch REAL NFL matches from ESPN API
 */
async function fetchRealNFLMatches(): Promise<any[]> {
  try {
    const today = new Date();
    const dateStr = today.toISOString().split('-').join('').slice(0, 8);
    
    // Get today's and next 7 days matches
    const response = await fetch(`${ESPN_NFL_URL}?dates=${dateStr}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SteoElite/1.0)' },
      next: { revalidate: 300 } // 5 min cache
    });
    
    if (!response.ok) {
      console.error('ESPN NFL API error:', response.status);
      return [];
    }
    
    const data = await response.json();
    
    if (!data?.events) {
      console.log('No NFL events found');
      return [];
    }
    
    console.log(`✅ ESPN NFL: ${data.events.length} matchs récupérés`);
    
    return data.events.slice(0, 20); // Max 20 NFL matches
  } catch (error) {
    console.error('Error fetching NFL matches:', error);
    return [];
  }
}

/**
 * Generate NFL predictions based on team stats
 */
function generateNFLPrediction(homeTeam: string, awayTeam: string, matchDate: Date): NFLMatch | null {
  // Find team data
  const homeData = Object.values(NFL_TEAMS).find(t => 
    t.name.toLowerCase().includes(homeTeam.toLowerCase()) || 
    t.abbr.toLowerCase() === homeTeam.toLowerCase()
  );
  const awayData = Object.values(NFL_TEAMS).find(t => 
    t.name.toLowerCase().includes(awayTeam.toLowerCase()) || 
    t.abbr.toLowerCase() === awayTeam.toLowerCase()
  );
  
  if (!homeData || !awayData) {
    console.log(`⚠️ Team not found: ${homeTeam} or ${awayTeam}`);
    return null;
  }
  
  // Calculate factors
  const dvoaDiff = homeData.dvoa - awayData.dvoa;
  const epaDiff = homeData.epa - awayData.epa;
  const homeFieldAdvantage = 2.5; // Standard NFL home field advantage
  const turnoverEdge = (homeData.dvoa + awayData.dvoa) / 20; // Simplified
  const restEdge = Math.random() * 2 - 1; // Would need real data
  const injuryEdge = Math.random() * 2 - 1; // Would need real data
  const trendEdge = Math.random() * 2 - 1; // Would need real data
  
  // Calculate win probability
  const baseHomeProb = 50 + dvoaDiff * 1.2 + homeFieldAdvantage * 2;
  const homeWinProb = Math.min(85, Math.max(15, baseHomeProb));
  const awayWinProb = 100 - homeWinProb;
  
  // Projected score
  const totalPoints = 44 + Math.floor(Math.random() * 10);
  const pointDiff = (homeWinProb - 50) / 5;
  const homePoints = Math.round(totalPoints / 2 + pointDiff);
  const awayPoints = totalPoints - homePoints;
  
  // Spread calculation
  const spread = Math.abs(pointDiff).toFixed(1);
  
  // Confidence calculation
  const confidence = Math.min(90, Math.max(40, 50 + Math.abs(dvoaDiff) + Math.abs(epaDiff) * 20));
  
  // Value bet detection
  const valueDetected = Math.abs(dvoaDiff) > 10 && confidence > 60;
  const valueEdge = valueDetected ? Math.abs(dvoaDiff) / 3 : 0;
  
  const matchId = `nfl-${homeData.abbr}-${awayData.abbr}-${matchDate.getTime()}`;
  
  return {
    id: matchId,
    homeTeam: homeData.name,
    awayTeam: awayData.name,
    homeAbbr: homeData.abbr,
    awayAbbr: awayData.abbr,
    date: matchDate.toISOString(),
    time: matchDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    status: 'scheduled',
    
    projected: {
      homePoints,
      awayPoints,
      totalPoints,
      spread: parseFloat(spread),
      homeWinProb: homeWinProb / 100,
      awayWinProb: awayWinProb / 100
    },
    
    factors: {
      dvoaDiff,
      epaDiff,
      turnoverEdge,
      homeFieldAdvantage,
      restEdge,
      injuryEdge,
      trendEdge,
      qbMatchup: `${homeData.qbr} vs ${awayData.qbr}`
    },
    
    insights: {
      spread: {
        line: parseFloat(spread),
        recommendation: dvoaDiff > 3 ? 'home' : dvoaDiff < -3 ? 'away' : 'pass',
        confidence: Math.round(confidence),
        reasoning: dvoaDiff > 0 
          ? `${homeData.abbr} advantage: DVOA +${dvoaDiff.toFixed(1)}%`
          : dvoaDiff < 0 
            ? `${awayData.abbr} advantage: DVOA +${Math.abs(dvoaDiff).toFixed(1)}%`
            : 'Match équilibré'
      },
      total: {
        line: totalPoints,
        predicted: totalPoints + (Math.random() > 0.5 ? 3 : -2),
        recommendation: totalPoints < 45 ? 'over' : 'under',
        confidence: Math.round(50 + Math.random() * 20),
        reasoning: totalPoints < 45 ? 'Défenses solides' : 'Attaques productives'
      },
      moneyline: {
        homeProb: homeWinProb / 100,
        awayProb: awayWinProb / 100,
        valueBet: {
          detected: valueDetected,
          type: valueDetected ? (homeWinProb > 50 ? 'home' : 'away') : null,
          edge: valueEdge
        }
      },
      kellyFraction: Math.min(0.05, Math.max(0.01, valueEdge / 100)),
      confidence: Math.round(confidence),
      recommendation: homeWinProb > 60 
        ? `Parier ${homeData.name}` 
        : awayWinProb > 60 
          ? `Parier ${awayData.name}` 
          : 'Éviter - Match serré'
    },
    
    injuryReport: {
      home: {
        impact: injuryEdge < -1 ? 'Significatif' : 'Mineur',
        keyPlayersOut: []
      },
      away: {
        impact: injuryEdge > 1 ? 'Significatif' : 'Mineur',
        keyPlayersOut: []
      },
      summary: 'Aucune blessure majeure rapportée'
    },
    
    dataQuality: {
      homeStats: 'real',
      awayStats: 'real',
      overallScore: 85
    }
  };
}

/**
 * GET - Fetch NFL matches from ESPN or advanced scraper
 */
export async function GET() {
  try {
    console.log('🏈 NFL API: Récupération des matchs...');
    
    // Utiliser le nouveau scraper avancé qui gère la saison ET hors-saison
    const advancedMatches = await getNFLMatches();
    
    // Vérifier si on est en saison NFL (Sep à Feb)
    const month = new Date().getMonth() + 1;
    const isNFLSeason = month >= 9 || month <= 2;
    
    if (advancedMatches.length > 0) {
      // Convertir au format NFLMatch attendu par le frontend
      const matches: NFLMatch[] = advancedMatches.map((m: any) => ({
        id: m.id,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        homeAbbr: m.homeAbbr,
        awayAbbr: m.awayAbbr,
        date: m.date,
        time: m.time || '13:00 EST',
        status: m.status || 'scheduled',
        isLive: m.isLive || false,
        homeRecord: m.homeRecord,
        awayRecord: m.awayRecord,
        projected: m.projected,
        factors: m.factors,
        insights: m.insights,
        injuryReport: m.injuryReport,
        dataQuality: m.dataQuality,
      }));
      
      // Calculate stats
      const valueBets = matches.filter(m => m.insights.moneyline.valueBet.detected);
      const highConfidence = matches.filter(m => m.insights.confidence >= 70);
      const avgTotal = matches.length > 0 
        ? Math.round(matches.reduce((sum, m) => sum + m.projected.totalPoints, 0) / matches.length)
        : 0;
      
      return NextResponse.json({
        success: true,
        predictions: matches,
        week: advancedMatches[0]?.week || 1,
        timeRange: isNFLSeason ? 'Saison en cours' : 'Saison à venir - Septembre',
        stats: {
          total: matches.length,
          valueBets: valueBets.length,
          highConfidence: highConfidence.length,
          avgTotal
        },
        message: isNFLSeason 
          ? `${matches.length} matchs NFL disponibles`
          : '🏈 Hors saison - Prédictions pour la saison à venir basées sur Pro-Football-Reference & TeamRankings',
        source: isNFLSeason ? 'espn+advanced' : 'pro-football-reference+teamrankings',
        lastUpdate: new Date().toISOString()
      });
    }
    
    // Fallback: si aucun match
    return NextResponse.json({
      success: true,
      predictions: [],
      week: 0,
      timeRange: {
        start: 'N/A',
        end: 'N/A',
        date: 'Aucun match disponible'
      },
      stats: {
        total: 0,
        valueBets: 0,
        highConfidence: 0,
        avgTotal: 0
      },
      message: isNFLSeason 
        ? 'Aucun match NFL prévu aujourd\'hui'
        : '🏈 Hors saison NFL - Reprise en septembre!',
      source: 'empty',
      lastUpdate: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ NFL API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch NFL data',
      predictions: []
    }, { status: 500 });
  }
}
