/**
 * Team Stats Service - Statistiques d'équipe RÉELLES depuis TheSportsDB
 * 
 * Fournit: Forme, Buts marqués/encaissés, Points, V/N/D
 * Source: TheSportsDB API (gratuite, clé publique)
 * Mise à jour: Quotidienne
 */

// IDs des ligues TheSportsDB
export const LEAGUE_IDS = {
  'Premier League': '4328',
  'La Liga': '4335', 
  'Serie A': '4332',
  'Bundesliga': '4331',
  'Ligue 1': '4334',
  'Champions League': '4480',
} as const;

// Type pour les stats d'équipe
export interface TeamStats {
  teamId: string;
  teamName: string;
  league: string;
  rank: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: string; // ex: "WWLWD" - 5 derniers matchs
  formAnalysis: {
    wins: number;
    draws: number;
    losses: number;
    averageGoalsScored: number;
    averageGoalsConceded: number;
    formPoints: number; // Points sur les 5 derniers matchs
  };
  lastUpdated: string;
  badge?: string;
}

// Cache des stats
const statsCache = new Map<string, { data: TeamStats; timestamp: number }>();
const CACHE_DURATION = 3600000; // 1 heure

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 350;

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => 
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
    );
  }
  lastRequestTime = Date.now();
}

/**
 * Analyse la forme (ex: "WWLWD") et retourne des métriques
 */
function analyzeForm(formString: string): TeamStats['formAnalysis'] {
  const form = formString.toUpperCase();
  let wins = 0, draws = 0, losses = 0;
  
  for (const result of form) {
    if (result === 'W') wins++;
    else if (result === 'D') draws++;
    else if (result === 'L') losses++;
  }
  
  // Points sur les 5 derniers matchs (3pts victoire, 1pt nul)
  const formPoints = wins * 3 + draws;
  
  // Estimation basée sur les stats globales (approximation)
  const averageGoalsScored = wins * 2 + draws * 1 + losses * 0.5;
  const averageGoalsConceded = wins * 0.5 + draws * 1 + losses * 2;
  
  return {
    wins,
    draws,
    losses,
    averageGoalsScored: averageGoalsScored / 5,
    averageGoalsConceded: averageGoalsConceded / 5,
    formPoints
  };
}

/**
 * Récupère le classement d'une ligue
 */
export async function fetchLeagueTable(leagueId: string): Promise<TeamStats[]> {
  const cacheKey = `league-${leagueId}`;
  const cached = statsCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return [cached.data]; // Retourner juste une entrée pour simplifier
  }
  
  await waitForRateLimit();
  
  try {
    const url = `https://www.thesportsdb.com/api/v1/json/3/lookuptable.php?l=${leagueId}&s=2025-2026`;
    
    const response = await fetch(url, {
      next: { revalidate: 3600 } // Cache Next.js: 1h
    });
    
    if (!response.ok) {
      console.error(`Erreur API TheSportsDB: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.table || !Array.isArray(data.table)) {
      return [];
    }
    
    const teamStats: TeamStats[] = data.table.map((row: any) => ({
      teamId: row.idTeam,
      teamName: row.strTeam,
      league: row.strLeague,
      rank: parseInt(row.intRank),
      played: parseInt(row.intPlayed),
      won: parseInt(row.intWin),
      drawn: parseInt(row.intDraw),
      lost: parseInt(row.intLoss),
      goalsFor: parseInt(row.intGoalsFor),
      goalsAgainst: parseInt(row.intGoalsAgainst),
      goalDifference: parseInt(row.intGoalDifference),
      points: parseInt(row.intPoints),
      form: row.strForm || '',
      formAnalysis: analyzeForm(row.strForm || ''),
      lastUpdated: row.dateUpdated,
      badge: row.strBadge
    }));
    
    // Mettre en cache
    for (const team of teamStats) {
      statsCache.set(`team-${team.teamName.toLowerCase()}`, {
        data: team,
        timestamp: Date.now()
      });
    }
    
    console.log(`✅ Classement ${leagueId}: ${teamStats.length} équipes`);
    return teamStats;
    
  } catch (error) {
    console.error('Erreur fetchLeagueTable:', error);
    return [];
  }
}

/**
 * Récupère les stats d'une équipe par nom
 */
export async function getTeamStatsByName(teamName: string): Promise<TeamStats | null> {
  // Normaliser le nom pour le cache
  const normalizedName = teamName.toLowerCase().trim();
  const cached = statsCache.get(`team-${normalizedName}`);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.data;
  }
  
  // Mapping des noms d'équipe vers les ligues
  const teamToLeague: Record<string, string> = {
    // Premier League
    'arsenal': '4328', 'manchester city': '4328', 'liverpool': '4328',
    'manchester united': '4328', 'man united': '4328', 'chelsea': '4328',
    'tottenham': '4328', 'newcastle': '4328', 'brighton': '4328',
    'aston villa': '4328', 'west ham': '4328', 'crystal palace': '4328',
    'brentford': '4328', 'fulham': '4328', 'wolves': '4328',
    'everton': '4328', 'bournemouth': '4328', 'nottingham forest': '4328',
    'leicester': '4328', 'ipswich': '4328', 'southampton': '4328',
    // La Liga
    'barcelona': '4335', 'barca': '4335', 'real madrid': '4335',
    'atletico madrid': '4335', 'atletico': '4335', 'villarreal': '4335',
    'real betis': '4335', 'sevilla': '4335', 'real sociedad': '4335',
    'athletic bilbao': '4335', 'athletic': '4335', 'girona': '4335',
    // Serie A
    'inter milan': '4332', 'inter': '4332', 'ac milan': '4332', 'milan': '4332',
    'napoli': '4332', 'roma': '4332', 'lazio': '4332', 'juventus': '4332',
    'atalanta': '4332', 'fiorentina': '4332', 'bologna': '4332',
    // Bundesliga
    'bayern munich': '4331', 'bayern': '4331', 'borussia dortmund': '4331',
    'dortmund': '4331', 'rb leipzig': '4331', 'leipzig': '4331',
    'bayer leverkusen': '4331', 'leverkusen': '4331', 'stuttgart': '4331',
    'hoffenheim': '4331', 'freiburg': '4331',
    // Ligue 1
    'paris sg': '4334', 'psg': '4334', 'paris saint-germain': '4334',
    'marseille': '4334', 'lyon': '4334', 'lille': '4334', 'lens': '4334',
    'monaco': '4334', 'nice': '4334', 'rennes': '4334', 'nantes': '4334',
  };
  
  // Trouver la ligue correspondante
  let leagueId = teamToLeague[normalizedName];
  
  // Recherche partielle si pas trouvé
  if (!leagueId) {
    for (const [key, league] of Object.entries(teamToLeague)) {
      if (normalizedName.includes(key) || key.includes(normalizedName)) {
        leagueId = league;
        break;
      }
    }
  }
  
  if (!leagueId) {
    // Par défaut, chercher en Premier League
    leagueId = '4328';
  }
  
  // Récupérer le classement de la ligue
  const table = await fetchLeagueTable(leagueId);
  
  // Chercher l'équipe dans le classement
  for (const team of table) {
    const teamNorm = team.teamName.toLowerCase();
    if (teamNorm === normalizedName || 
        teamNorm.includes(normalizedName) || 
        normalizedName.includes(teamNorm)) {
      return team;
    }
  }
  
  return null;
}

/**
 * Récupère les stats pour les deux équipes d'un match
 */
export async function getMatchTeamStats(
  homeTeam: string, 
  awayTeam: string
): Promise<{
  homeTeam: TeamStats | null;
  awayTeam: TeamStats | null;
  comparison: {
    formAdvantage: 'home' | 'away' | 'draw';
    rankAdvantage: 'home' | 'away' | 'draw';
    goalsAdvantage: 'home' | 'away' | 'draw';
    overallAdvantage: 'home' | 'away' | 'draw';
    confidence: number; // 0-100
    analysis: string;
  };
}> {
  const [homeStats, awayStats] = await Promise.all([
    getTeamStatsByName(homeTeam),
    getTeamStatsByName(awayTeam)
  ]);
  
  let comparison = {
    formAdvantage: 'draw' as 'home' | 'away' | 'draw',
    rankAdvantage: 'draw' as 'home' | 'away' | 'draw',
    goalsAdvantage: 'draw' as 'home' | 'away' | 'draw',
    overallAdvantage: 'draw' as 'home' | 'away' | 'draw',
    confidence: 50,
    analysis: 'Données insuffisantes pour l\'analyse'
  };
  
  if (homeStats && awayStats) {
    // Comparaison de forme
    if (homeStats.formAnalysis.formPoints > awayStats.formAnalysis.formPoints) {
      comparison.formAdvantage = 'home';
    } else if (awayStats.formAnalysis.formPoints > homeStats.formAnalysis.formPoints) {
      comparison.formAdvantage = 'away';
    }
    
    // Comparaison de rang
    if (homeStats.rank < awayStats.rank) {
      comparison.rankAdvantage = 'home';
    } else if (awayStats.rank < homeStats.rank) {
      comparison.rankAdvantage = 'away';
    }
    
    // Comparaison de buts
    const homeGoalDiff = homeStats.goalsFor - homeStats.goalsAgainst;
    const awayGoalDiff = awayStats.goalsFor - awayStats.goalsAgainst;
    if (homeGoalDiff > awayGoalDiff) {
      comparison.goalsAdvantage = 'home';
    } else if (awayGoalDiff > homeGoalDiff) {
      comparison.goalsAdvantage = 'away';
    }
    
    // Avantage global
    let homeScore = 0, awayScore = 0;
    if (comparison.formAdvantage === 'home') homeScore += 2;
    else if (comparison.formAdvantage === 'away') awayScore += 2;
    
    if (comparison.rankAdvantage === 'home') homeScore += 1;
    else if (comparison.rankAdvantage === 'away') awayScore += 1;
    
    if (comparison.goalsAdvantage === 'home') homeScore += 1;
    else if (comparison.goalsAdvantage === 'away') awayScore += 1;
    
    if (homeScore > awayScore) {
      comparison.overallAdvantage = 'home';
    } else if (awayScore > homeScore) {
      comparison.overallAdvantage = 'away';
    }
    
    // Calcul de confiance
    const totalPoints = homeScore + awayScore;
    comparison.confidence = Math.min(90, 50 + Math.abs(homeScore - awayScore) * 10);
    
    // Analyse textuelle
    const analysisParts: string[] = [];
    
    // Forme
    analysisParts.push(`${homeStats.teamName}: ${homeStats.form || 'N/A'} (${homeStats.formAnalysis.wins}V ${homeStats.formAnalysis.draws}N ${homeStats.formAnalysis.losses}D)`);
    analysisParts.push(`${awayStats.teamName}: ${awayStats.form || 'N/A'} (${awayStats.formAnalysis.wins}V ${awayStats.formAnalysis.draws}N ${awayStats.formAnalysis.losses}D)`);
    
    // Classement
    analysisParts.push(`Classement: ${homeStats.teamName} ${homeStats.rank}e vs ${awayStats.teamName} ${awayStats.rank}e`);
    
    // Buts
    analysisParts.push(`Buts: ${homeStats.teamName} ${homeStats.goalsFor}MJ/${homeStats.goalsAgainst}ME vs ${awayStats.teamName} ${awayStats.goalsFor}MJ/${awayStats.goalsAgainst}ME`);
    
    comparison.analysis = analysisParts.join(' | ');
  }
  
  return {
    homeTeam: homeStats,
    awayTeam: awayStats,
    comparison
  };
}

/**
 * Précharge les classements des principales ligues
 */
export async function preloadLeagueTables(): Promise<void> {
  console.log('📊 Préchargement des classements...');
  
  const leagues = ['4328', '4335', '4332', '4331', '4334'];
  
  for (const leagueId of leagues) {
    await fetchLeagueTable(leagueId);
    // Petit délai entre chaque ligue
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('✅ Classements préchargés');
}

/**
 * Retourne les stats en cache (utile pour éviter les re-renders)
 */
export function getCachedStats(): TeamStats[] {
  const stats: TeamStats[] = [];
  for (const [, value] of statsCache) {
    stats.push(value.data);
  }
  return stats;
}

const teamStatsService = {
  fetchLeagueTable,
  getTeamStatsByName,
  getMatchTeamStats,
  preloadLeagueTables,
  getCachedStats,
  LEAGUE_IDS
};

export default teamStatsService;
