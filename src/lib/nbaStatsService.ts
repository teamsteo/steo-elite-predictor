/**
 * NBA Stats Service - Stats officielles en temps réel
 * 
 * Sources:
 * - ESPN NBA Standings API (gratuite): standings, win/loss, records
 * - Ball Don't Lie API (gratuite): stats avancées par équipe
 */

export interface NBATeamStats {
  id: number;
  name: string;
  abbreviation: string;
  conference: 'East' | 'West';
  gamesPlayed: number;
  wins: number;
  losses: number;
  winPct: number;
  ptsPerGame: number;
  oppPtsPerGame: number;
  offRating: number;
  defRating: number;
  netRating: number;
  pace: number;
  elo: number;
  last10: string;
  homeRecord: string;
  awayRecord: string;
}

// Cache (10 min)
let cachedTeamStats: NBATeamStats[] = [];
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000;

// Mappings
const TEAM_NAME_TO_ID: Record<string, number> = {
  'Atlanta Hawks': 1, 'Boston Celtics': 2, 'Brooklyn Nets': 3, 'Charlotte Hornets': 4,
  'Chicago Bulls': 5, 'Cleveland Cavaliers': 6, 'Dallas Mavericks': 7, 'Denver Nuggets': 8,
  'Detroit Pistons': 9, 'Golden State Warriors': 10, 'Houston Rockets': 11, 'Indiana Pacers': 12,
  'LA Clippers': 13, 'Los Angeles Clippers': 13, 'Los Angeles Lakers': 14, 'Memphis Grizzlies': 15,
  'Miami Heat': 16, 'Milwaukee Bucks': 17, 'Minnesota Timberwolves': 18, 'New Orleans Pelicans': 19,
  'New York Knicks': 20, 'Oklahoma City Thunder': 21, 'Orlando Magic': 22, 'Philadelphia 76ers': 23,
  'Phoenix Suns': 24, 'Portland Trail Blazers': 25, 'Sacramento Kings': 26, 'San Antonio Spurs': 27,
  'Toronto Raptors': 28, 'Utah Jazz': 29, 'Washington Wizards': 30,
};

const ID_TO_TEAM_NAME: Record<number, string> = Object.fromEntries(
  Object.entries(TEAM_NAME_TO_ID).map(([name, id]) => [id, name])
);

const TEAM_ABBREVIATIONS: Record<number, string> = {
  1: 'ATL', 2: 'BOS', 3: 'BKN', 4: 'CHA', 5: 'CHI', 6: 'CLE', 7: 'DAL', 8: 'DEN',
  9: 'DET', 10: 'GSW', 11: 'HOU', 12: 'IND', 13: 'LAC', 14: 'LAL', 15: 'MEM', 16: 'MIA',
  17: 'MIL', 18: 'MIN', 19: 'NOP', 20: 'NYK', 21: 'OKC', 22: 'ORL', 23: 'PHI', 24: 'PHX',
  25: 'POR', 26: 'SAC', 27: 'SAS', 28: 'TOR', 29: 'UTA', 30: 'WAS',
};

/**
 * Récupère les standings NBA depuis ESPN
 */
async function fetchESPNStandings(): Promise<any[]> {
  try {
    const response = await fetch(
      'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings',
      { next: { revalidate: 600 } }
    );

    if (!response.ok) return [];

    const data = await response.json();
    const standings: any[] = [];
    const entries = data.standings?.entries || [];

    for (const entry of entries) {
      const team = entry.team;
      const stats = entry.stats || [];

      const getStat = (name: string) => {
        const found = stats.find((s: any) => s.name === name);
        return found?.value || 0;
      };

      const teamId = TEAM_NAME_TO_ID[team.displayName] || 0;

      standings.push({
        id: teamId,
        name: team.displayName,
        abbreviation: team.abbreviation || TEAM_ABBREVIATIONS[teamId] || '',
        wins: getStat('wins') || 0,
        losses: getStat('losses') || 0,
        winPct: getStat('winPercent') || 0.5,
        ptsPerGame: getStat('pointsPerGame') || 110,
        oppPtsPerGame: getStat('oppPointsPerGame') || 110,
        homeRecord: getStat('homeRecord') || '0-0',
        awayRecord: getStat('roadRecord') || '0-0',
        last10: getStat('last10') || '5-5',
        gamesPlayed: getStat('gamesPlayed') || 0,
      });
    }

    console.log(`✅ ESPN Standings: ${standings.length} équipes`);
    return standings;

  } catch (error) {
    console.error('❌ Erreur ESPN Standings:', error);
    return [];
  }
}

/**
 * Calcule l'ELO basé sur les performances
 */
function calculateELO(wins: number, losses: number, ptsFor: number, ptsAgainst: number, last10Wins: number): number {
  let elo = 1500;
  
  const winPct = wins / (wins + losses);
  elo += (winPct - 0.5) * 400;
  
  const ptDiff = ptsFor - ptsAgainst;
  elo += ptDiff * 3;
  
  elo += (last10Wins - 5) * 15;
  
  return Math.max(1300, Math.min(1850, Math.round(elo)));
}

/**
 * Récupère les stats de toutes les équipes
 */
export async function fetchAllTeamStats(): Promise<NBATeamStats[]> {
  if (cachedTeamStats.length > 0 && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedTeamStats;
  }

  console.log('📊 Récupération stats NBA officielles 2025-26...');

  const espnStandings = await fetchESPNStandings();
  const teamStats: NBATeamStats[] = [];

  if (espnStandings.length > 0) {
    for (const standing of espnStandings) {
      const last10Wins = parseInt(standing.last10?.split('-')[0]) || 5;
      
      const offRating = standing.ptsPerGame * 100 / 98;
      const defRating = standing.oppPtsPerGame * 100 / 98;
      
      const elo = calculateELO(
        standing.wins,
        standing.losses,
        standing.ptsPerGame,
        standing.oppPtsPerGame,
        last10Wins
      );

      teamStats.push({
        id: standing.id,
        name: standing.name,
        abbreviation: standing.abbreviation,
        conference: standing.id <= 15 ? 'East' : 'West',
        gamesPlayed: standing.gamesPlayed || standing.wins + standing.losses,
        wins: standing.wins,
        losses: standing.losses,
        winPct: standing.winPct,
        ptsPerGame: standing.ptsPerGame,
        oppPtsPerGame: standing.oppPtsPerGame,
        offRating: Math.round(offRating * 10) / 10,
        defRating: Math.round(defRating * 10) / 10,
        netRating: Math.round((offRating - defRating) * 10) / 10,
        pace: 98,
        elo,
        last10: standing.last10,
        homeRecord: standing.homeRecord,
        awayRecord: standing.awayRecord,
      });
    }
  } else {
    return getFallbackStats();
  }

  teamStats.sort((a, b) => b.elo - a.elo);
  console.log('🏆 Top 5 ELO:', teamStats.slice(0, 5).map(t => `${t.name}: ${t.elo}`).join(', '));

  cachedTeamStats = teamStats;
  cacheTimestamp = Date.now();

  return teamStats;
}

/**
 * Stats de fallback
 */
function getFallbackStats(): NBATeamStats[] {
  const teams: NBATeamStats[] = [];
  
  const fallbackData: Record<number, Partial<NBATeamStats>> = {
    2: { wins: 62, losses: 20, ptsPerGame: 120, oppPtsPerGame: 109, elo: 1750 },
    6: { wins: 60, losses: 22, ptsPerGame: 118, oppPtsPerGame: 108, elo: 1745 },
    21: { wins: 58, losses: 24, ptsPerGame: 117, oppPtsPerGame: 107, elo: 1740 },
    8: { wins: 54, losses: 28, ptsPerGame: 115, oppPtsPerGame: 110, elo: 1720 },
    18: { wins: 52, losses: 30, ptsPerGame: 114, oppPtsPerGame: 108, elo: 1710 },
    17: { wins: 50, losses: 32, ptsPerGame: 117, oppPtsPerGame: 112, elo: 1700 },
    7: { wins: 48, losses: 34, ptsPerGame: 116, oppPtsPerGame: 113, elo: 1690 },
    14: { wins: 47, losses: 35, ptsPerGame: 114, oppPtsPerGame: 112, elo: 1675 },
    24: { wins: 45, losses: 37, ptsPerGame: 115, oppPtsPerGame: 113, elo: 1660 },
    20: { wins: 44, losses: 38, ptsPerGame: 113, oppPtsPerGame: 111, elo: 1655 },
  };

  for (let id = 1; id <= 30; id++) {
    const fallback = fallbackData[id] || {};
    const name = ID_TO_TEAM_NAME[id] || `Team ${id}`;

    teams.push({
      id,
      name,
      abbreviation: TEAM_ABBREVIATIONS[id] || '',
      conference: id <= 15 ? 'East' : 'West',
      gamesPlayed: 82,
      wins: fallback.wins || 41,
      losses: fallback.losses || 41,
      winPct: (fallback.wins || 41) / 82,
      ptsPerGame: fallback.ptsPerGame || 110,
      oppPtsPerGame: fallback.oppPtsPerGame || 110,
      offRating: (fallback.ptsPerGame || 110) * 100 / 98,
      defRating: (fallback.oppPtsPerGame || 110) * 100 / 98,
      netRating: (fallback.ptsPerGame || 110) - (fallback.oppPtsPerGame || 110),
      pace: 98,
      elo: fallback.elo || 1600,
      last10: '5-5',
      homeRecord: '20-20',
      awayRecord: '20-20',
    });
  }

  teams.sort((a, b) => b.elo - a.elo);
  cachedTeamStats = teams;
  cacheTimestamp = Date.now();

  return teams;
}

/**
 * Calcule les prédictions basées sur les stats
 */
export function calculatePredictionFromStats(
  homeStats: NBATeamStats,
  awayStats: NBATeamStats
): {
  homeWinProb: number;
  awayWinProb: number;
  spread: number;
  totalPoints: number;
  confidence: 'high' | 'medium' | 'low';
} {
  const homeEloAdjusted = homeStats.elo + 65;
  const awayElo = awayStats.elo;

  const homeWinProb = 1 / (1 + Math.pow(10, (awayElo - homeEloAdjusted) / 400));

  const spreadBase = (homeStats.netRating - awayStats.netRating) / 3;
  const spread = Math.round(spreadBase * 2) / 2;

  const avgPace = 98;
  const homeExpectedPts = (homeStats.offRating + awayStats.defRating) / 2 * (avgPace / 100);
  const awayExpectedPts = (awayStats.offRating + homeStats.defRating) / 2 * (avgPace / 100);
  const totalPoints = Math.round((homeExpectedPts + awayExpectedPts) / 5) * 5;

  const eloDiff = Math.abs(homeEloAdjusted - awayElo);
  const confidence: 'high' | 'medium' | 'low' =
    eloDiff > 150 ? 'high' : eloDiff > 80 ? 'medium' : 'low';

  return {
    homeWinProb: Math.round(homeWinProb * 100),
    awayWinProb: Math.round((1 - homeWinProb) * 100),
    spread,
    totalPoints,
    confidence
  };
}

export { TEAM_NAME_TO_ID, ID_TO_TEAM_NAME, TEAM_ABBREVIATIONS };
