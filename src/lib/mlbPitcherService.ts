/**
 * MLB Pitcher Service
 * Récupère les lanceurs probables depuis MLB Stats API
 */

export interface MLBStatsPitcher {
  id: number;
  fullName: string;
  link: string;
  handedness?: 'L' | 'R';
  era?: number;
  whip?: number;
  wins?: number;
  losses?: number;
  inningsPitched?: number;
  strikeouts?: number;
  walks?: number;
  battingAverageAgainst?: number;
}

export interface MLBStatsGame {
  gamePk: number;
  gameDate: string;
  status: {
    abstractGameState: string;
    detailedState: string;
    statusCode: string;
  };
  teams: {
    away: {
      team: {
        id: number;
        name: string;
        abbreviation: string;
        teamCode: string;
      };
      leagueRecord?: {
        wins: number;
        losses: number;
        pct: string;
      };
      probablePitcher?: {
        id: number;
        fullName: string;
        link: string;
      };
    };
    home: {
      team: {
        id: number;
        name: string;
        abbreviation: string;
        teamCode: string;
      };
      leagueRecord?: {
        wins: number;
        losses: number;
        pct: string;
      };
      probablePitcher?: {
        id: number;
        fullName: string;
        link: string;
      };
    };
  };
  venue?: {
    name: string;
  };
}

export interface MLBStatsSchedule {
  totalGames: number;
  dates: Array<{
    date: string;
    games: MLBStatsGame[];
  }>;
}

// Cache pour les stats des lanceurs
const pitcherStatsCache = new Map<number, { stats: MLBStatsPitcher; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Récupère le schedule MLB avec les lanceurs probables
 */
export async function fetchMLBSchedule(date?: string): Promise<MLBStatsGame[]> {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${targetDate}&hydrate=team,lineseries,probablePitcher(note),game(content(summary,media(epg)))`;

    console.log(`⚾ MLB Schedule: Récupération du ${targetDate}...`);

    const response = await fetch(url, {
      next: { revalidate: 300 }, // 5 min cache
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      console.error(`❌ MLB Stats API error: ${response.status}`);
      return [];
    }

    const data: MLBStatsSchedule = await response.json();
    const games = data.dates?.[0]?.games || [];

    console.log(`✅ MLB Schedule: ${games.length} matchs trouvés`);
    return games;

  } catch (error) {
    console.error('Erreur fetch MLB Schedule:', error);
    return [];
  }
}

/**
 * Récupère les stats détaillées d'un lanceur
 */
export async function fetchPitcherStats(pitcherId: number): Promise<MLBStatsPitcher | null> {
  try {
    // Vérifier le cache
    const cached = pitcherStatsCache.get(pitcherId);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`✅ Cache hit pour lanceur ${pitcherId}`);
      return cached.stats;
    }

    // Utiliser la saison 2025 (les stats 2026 ne sont pas encore disponibles)
    // MLB Stats API garde les stats de la saison précédente jusqu'à mi-saison
    const season = 2025;
    
    // URL avec paramètres corrects pour les stats
    const url = `https://statsapi.mlb.com/api/v1/people/${pitcherId}?hydrate=stats(type=season,group=pitching,season=${season})`;

    console.log(`🔍 Fetching pitcher ${pitcherId} (season ${season})...`);
    const response = await fetch(url, {
      next: { revalidate: 300 },
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      console.log(`❌ Erreur HTTP ${response.status} pour lanceur ${pitcherId}`);
      return null;
    }

    const data = await response.json();
    const person = data.people?.[0];

    if (!person) {
      console.log(`❌ Pas de données pour lanceur ${pitcherId}`);
      return null;
    }

    // Extraire les stats de pitching
    let pitchingStats: any = null;
    
    const statsArray = person.stats || [];
    
    // Chercher les stats de pitching dans les splits
    for (const statGroup of statsArray) {
      if (statGroup.group?.displayName === 'pitching' && statGroup.splits?.length > 0) {
        // Prendre le premier split (stats de la saison)
        pitchingStats = statGroup.splits[0].stat;
        break;
      }
    }

    console.log(`📊 Stats pour ${person.fullName} (${pitcherId}):`, pitchingStats ? 'trouvées' : 'non trouvées');

    const pitcher: MLBStatsPitcher = {
      id: person.id,
      fullName: person.fullName,
      link: person.link,
      handedness: person.pitchHand?.code || 'R',
      era: pitchingStats?.era ? parseFloat(String(pitchingStats.era)) : undefined,
      whip: pitchingStats?.whip ? parseFloat(String(pitchingStats.whip)) : undefined,
      wins: pitchingStats?.wins ? parseInt(String(pitchingStats.wins)) : undefined,
      losses: pitchingStats?.losses ? parseInt(String(pitchingStats.losses)) : undefined,
      inningsPitched: pitchingStats?.inningsPitched ? parseFloat(String(pitchingStats.inningsPitched)) : undefined,
      strikeouts: pitchingStats?.strikeouts ? parseInt(String(pitchingStats.strikeouts)) : undefined,
      walks: pitchingStats?.baseOnBalls ? parseInt(String(pitchingStats.baseOnBalls)) : undefined,
      battingAverageAgainst: pitchingStats?.avg ? parseFloat(String(pitchingStats.avg)) : undefined,
    };

    // Log des stats extraites
    if (pitcher.era) {
      console.log(`✅ ${pitcher.fullName}: ERA=${pitcher.era}, WHIP=${pitcher.whip}, W-${pitcher.wins}, L-${pitcher.losses}`);
    } else {
      console.log(`⚠️ ${person.fullName}: Pas de stats 2025/2026, utilise valeurs par défaut`);
    }

    // Mettre en cache
    pitcherStatsCache.set(pitcherId, { stats: pitcher, timestamp: Date.now() });

    return pitcher;

  } catch (error) {
    console.error(`Erreur fetch pitcher ${pitcherId}:`, error);
    return null;
  }
}

/**
 * Récupère les stats de plusieurs lanceurs en parallèle
 */
export async function fetchMultiplePitcherStats(pitcherIds: number[]): Promise<Map<number, MLBStatsPitcher>> {
  const results = new Map<number, MLBStatsPitcher>();

  // Filtrer les IDs valides
  const validIds = pitcherIds.filter(id => id && !isNaN(id));

  // Requêtes en parallèle (max 10 à la fois)
  const chunks: number[][] = [];
  for (let i = 0; i < validIds.length; i += 10) {
    chunks.push(validIds.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (id) => {
      const stats = await fetchPitcherStats(id);
      if (stats) {
        results.set(id, stats);
      }
    });

    await Promise.all(promises);
  }

  return results;
}

/**
 * Construit un objet lanceur simplifié à partir des données MLB Stats
 */
export function buildPitcherFromMLBStats(
  probablePitcher: { id: number; fullName: string } | undefined,
  teamAbbr: string,
  detailedStats?: MLBStatsPitcher | null
) {
  if (!probablePitcher) return undefined;

  return {
    id: String(probablePitcher.id),
    name: probablePitcher.fullName,
    teamId: teamAbbr,
    handedness: detailedStats?.handedness || 'R',
    era: detailedStats?.era || 4.15,
    whip: detailedStats?.whip || 1.30,
    wins: detailedStats?.wins || 0,
    losses: detailedStats?.losses || 0,
    inningsPitched: detailedStats?.inningsPitched || 0,
    strikeouts: detailedStats?.strikeouts || 0,
    walks: detailedStats?.walks || 0,
    homeRunsAllowed: 0,
    battingAverageAgainst: detailedStats?.battingAverageAgainst || 0.250,
    fip: detailedStats?.era || 4.15,
    eraMinus: 100,
    strikeoutRate: detailedStats?.strikeouts && detailedStats?.inningsPitched
      ? (detailedStats.strikeouts / detailedStats.inningsPitched) * 9
      : 9.0,
    walkRate: detailedStats?.walks && detailedStats?.inningsPitched
      ? (detailedStats.walks / detailedStats.inningsPitched) * 9
      : 3.0,
    recentEra: detailedStats?.era || 4.15,
    recentInnings: detailedStats?.inningsPitched || 0,
  };
}

// Mapping des abréviations MLB Stats vers ESPN
export const MLB_TEAM_ABBR_MAP: Record<string, string> = {
  'BAL': 'BAL', 'BOS': 'BOS', 'NYY': 'NYY', 'TB': 'TB', 'TOR': 'TOR',
  'CHA': 'CHW', 'CLE': 'CLE', 'DET': 'DET', 'KCA': 'KC', 'MIN': 'MIN',
  'HOU': 'HOU', 'LAA': 'LAA', 'OAK': 'ATH', 'SEA': 'SEA', 'TEX': 'TEX',
  'ATL': 'ATL', 'MIA': 'MIA', 'NYM': 'NYM', 'PHI': 'PHI', 'WSN': 'WSH',
  'CHC': 'CHC', 'CIN': 'CIN', 'MIL': 'MIL', 'PIT': 'PIT', 'SLN': 'STL',
  'ARI': 'ARI', 'COL': 'COL', 'LAD': 'LAD', 'SDN': 'SD', 'SFN': 'SF',
  'ATH': 'ATH', 'AZ': 'ARI', 'ANA': 'LAA', 'WAS': 'WSH', 'SF': 'SF', 'SD': 'SD',
};

/**
 * Normalise l'abbréviation d'une équipe
 */
export function normalizeTeamAbbr(abbr: string): string {
  return MLB_TEAM_ABBR_MAP[abbr] || abbr;
}

// ============================================
// TYPES POUR MLB MATCHUPS
// ============================================

export interface MLBMatchup {
  homeTeam: string;
  awayTeam: string;
  homePitcher?: {
    name: string;
    era: number;
  };
  awayPitcher?: {
    name: string;
    era: number;
  };
  gamePk: number;
  gameDate: string;
}

export interface PitcherAnalysis {
  totalRunsExpected: number;
  pitcherAdvantage: 'home' | 'away' | 'neutral';
  advantageConfidence: number;
  overUnderRecommendation?: 'over' | 'under' | 'neutral';
  overUnderConfidence?: number;
  reasoning: string[];
}

/**
 * Récupère les matchups MLB du jour avec les lanceurs
 */
export async function fetchMLBMatchups(date?: string): Promise<MLBMatchup[]> {
  try {
    const games = await fetchMLBSchedule(date);
    const matchups: MLBMatchup[] = [];

    for (const game of games) {
      const matchup: MLBMatchup = {
        homeTeam: game.teams.home.team.name,
        awayTeam: game.teams.away.team.name,
        gamePk: game.gamePk,
        gameDate: game.gameDate
      };

      // Récupérer les stats des lanceurs probables
      if (game.teams.home.probablePitcher) {
        const stats = await fetchPitcherStats(game.teams.home.probablePitcher.id);
        matchup.homePitcher = {
          name: game.teams.home.probablePitcher.fullName,
          era: stats?.era || 4.15
        };
      }

      if (game.teams.away.probablePitcher) {
        const stats = await fetchPitcherStats(game.teams.away.probablePitcher.id);
        matchup.awayPitcher = {
          name: game.teams.away.probablePitcher.fullName,
          era: stats?.era || 4.15
        };
      }

      matchups.push(matchup);
    }

    return matchups;
  } catch (error) {
    console.error('Erreur fetchMLBMatchups:', error);
    return [];
  }
}

/**
 * Analyse l'avantage des lanceurs dans un matchup
 */
export function analyzePitcherMatchup(matchup: MLBMatchup): PitcherAnalysis {
  const reasoning: string[] = [];
  let pitcherAdvantage: 'home' | 'away' | 'neutral' = 'neutral';
  let advantageConfidence = 0;

  const homeERA = matchup.homePitcher?.era || 4.15;
  const awayERA = matchup.awayPitcher?.era || 4.15;
  const eraDiff = awayERA - homeERA;

  // Déterminer l'avantage lanceur
  if (Math.abs(eraDiff) >= 1.0) {
    if (eraDiff > 0) {
      pitcherAdvantage = 'home';
      advantageConfidence = Math.min(40, eraDiff * 15);
      reasoning.push(`Avantage lanceur domicile: ${matchup.homePitcher?.name} (ERA ${homeERA.toFixed(2)}) vs ${matchup.awayPitcher?.name} (ERA ${awayERA.toFixed(2)})`);
    } else {
      pitcherAdvantage = 'away';
      advantageConfidence = Math.min(40, Math.abs(eraDiff) * 15);
      reasoning.push(`Avantage lanceur extérieur: ${matchup.awayPitcher?.name} (ERA ${awayERA.toFixed(2)}) vs ${matchup.homePitcher?.name} (ERA ${homeERA.toFixed(2)})`);
    }
  }

  // Calculer les runs attendus basés sur les ERA
  // Plus l'ERA est élevé, plus l'équipe adverse marque
  const homeRunsExpected = (awayERA / 4.15) * 4.5; // 4.5 = moyenne runs/match
  const awayRunsExpected = (homeERA / 4.15) * 4.5;
  const totalRunsExpected = Math.round((homeRunsExpected + awayRunsExpected) * 10) / 10;

  // Déterminer recommandation Over/Under
  let overUnderRecommendation: 'over' | 'under' | 'neutral' = 'neutral';
  let overUnderConfidence = 0;

  if (totalRunsExpected >= 10) {
    overUnderRecommendation = 'over';
    overUnderConfidence = Math.min(30, (totalRunsExpected - 9) * 15);
    reasoning.push(`OVER favorisé: ${totalRunsExpected} runs attendus`);
  } else if (totalRunsExpected <= 7.5) {
    overUnderRecommendation = 'under';
    overUnderConfidence = Math.min(30, (8 - totalRunsExpected) * 15);
    reasoning.push(`UNDER favorisé: ${totalRunsExpected} runs attendus`);
  }

  return {
    totalRunsExpected,
    pitcherAdvantage,
    advantageConfidence,
    overUnderRecommendation,
    overUnderConfidence,
    reasoning
  };
}
