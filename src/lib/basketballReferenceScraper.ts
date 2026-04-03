// @ts-nocheck
/**
 * Basketball Reference Scraper - Stats NBA Avancées
 * 
 * Source: basketball-reference.com (gratuit, très complet)
 * 
 * Données extraites:
 * - Team Stats: OFF RTG, DEF RTG, PACE, SRS, Elo
 * - Player Stats: Points, Rebounds, Assists, PER, WS
 * - Team Rankings: Conference standings, form
 * - Advanced: Four Factors, Shooting splits
 * 
 * Équivalent FBref pour la NBA
 */

import ZAI from 'z-ai-web-dev-sdk';

// ============================================
// TYPES
// ============================================

export interface NBATeamStats {
  team: string;
  abbreviation: string;
  season: string;
  
  // Stats de base
  games: number;
  wins: number;
  losses: number;
  winPercentage: number;
  
  // Stats avancées
  offensiveRating: number; // Points per 100 possessions
  defensiveRating: number; // Points allowed per 100 possessions
  netRating: number; // ORTG - DRTG
  pace: number; // Possessions per game
  srs: number; // Simple Rating System (margin + SOS)
  
  // Four Factors (Dean Oliver)
  fourFactors: {
    eFGPercent: number; // Effective FG%
    tovPercent: number; // Turnover %
    orbPercent: number; // Offensive Rebound %
    ftPerFga: number; // FT per FGA
  };
  
  // Shooting
  fgPercent: number;
  threePointPercent: number;
  ftPercent: number;
  
  // Forme récente
  last10?: string; // ex: "7-3"
  streak?: string; // ex: "W 3" or "L 2"
  
  // Elo (si disponible)
  elo?: number;
  
  // NOUVEAU: Stats de repos et fatigue
  rest?: {
    daysSinceLastGame: number;
    isBackToBack: boolean;
    gamesInLast7Days: number;
    restAdvantage: 'well_rested' | 'normal' | 'fatigued' | 'exhausted';
    backToBackCount: number; // Total B2B cette saison
    homeAwayStreak: number; // Matchs consécutifs home/away
  };
  
  // Métadonnées
  scrapedAt: string;
}

export interface NBAPlayerStats {
  name: string;
  team: string;
  season: string;
  
  // Stats de base
  games: number;
  minutesPerGame: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  
  // Stats avancées
  per: number; // Player Efficiency Rating
  ws: number; // Win Shares
  bpm: number; // Box Plus/Minus
  vorp: number; // Value Over Replacement
  
  // Shooting
  fgPercent: number;
  threePointPercent: number;
  ftPercent: number;
  
  // Métadonnées
  position?: string;
  injured?: boolean;
  scrapedAt: string;
}

export interface NBAMatchupStats {
  homeTeam: string;
  awayTeam: string;
  
  homeStats: NBATeamStats | null;
  awayStats: NBATeamStats | null;
  
  // NOUVEAU: Analyse de fatigue
  fatigueAnalysis?: {
    homeRest: NBATeamStats['rest'];
    awayRest: NBATeamStats['rest'];
    restAdvantage: 'home' | 'away' | 'neutral';
    backToBackAlert: { home: boolean; away: boolean };
    fatigueImpact: number; // -5 à +5 points
  };
  
  // Analyse
  analysis: {
    offensiveAdvantage: 'home' | 'away' | 'neutral';
    defensiveAdvantage: 'home' | 'away' | 'neutral';
    pacePrediction: 'fast' | 'average' | 'slow';
    projectedTotal: number; // Points totaux estimés
    spreadPrediction: number; // Différence estimée (positif = home gagne)
    confidence: 'high' | 'medium' | 'low';
  };
  
  // Historique récent
  recentH2H: Array<{
    date: string;
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
  }>;
  
  generatedAt: string;
}

// ============================================
// MAPPINGS
// ============================================

const NBA_TEAM_ABBREVIATIONS: Record<string, string> = {
  'Atlanta Hawks': 'ATL',
  'Boston Celtics': 'BOS',
  'Brooklyn Nets': 'BRK',
  'Charlotte Hornets': 'CHO',
  'Chicago Bulls': 'CHI',
  'Cleveland Cavaliers': 'CLE',
  'Detroit Pistons': 'DET',
  'Indiana Pacers': 'IND',
  'Miami Heat': 'MIA',
  'Milwaukee Bucks': 'MIL',
  'New York Knicks': 'NYK',
  'Orlando Magic': 'ORL',
  'Philadelphia 76ers': 'PHI',
  'Toronto Raptors': 'TOR',
  'Washington Wizards': 'WAS',
  'Dallas Mavericks': 'DAL',
  'Denver Nuggets': 'DEN',
  'Golden State Warriors': 'GSW',
  'Houston Rockets': 'HOU',
  'Los Angeles Clippers': 'LAC',
  'Los Angeles Lakers': 'LAL',
  'Memphis Grizzlies': 'MEM',
  'Minnesota Timberwolves': 'MIN',
  'New Orleans Pelicans': 'NOP',
  'Oklahoma City Thunder': 'OKC',
  'Phoenix Suns': 'PHO',
  'Portland Trail Blazers': 'POR',
  'Sacramento Kings': 'SAC',
  'San Antonio Spurs': 'SAS',
  'Utah Jazz': 'UTA',
};

const ABBREV_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(NBA_TEAM_ABBREVIATIONS).map(([name, abbrev]) => [abbrev, name])
);

const BBR_URLS = {
  standings: 'https://www.basketball-reference.com/leagues/NBA_2026_standings.html',
  teamStats: 'https://www.basketball-reference.com/leagues/NBA_2026.html',
  advanced: 'https://www.basketball-reference.com/leagues/NBA_2026-advanced.html',
};

// ============================================
// CACHE
// ============================================

const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 heure
const RATE_LIMIT_DELAY = 3000; // 3 secondes entre requêtes

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

async function delay(ms: number = RATE_LIMIT_DELAY): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getAbbreviation(teamName: string): string {
  const normalized = teamName.trim();
  return NBA_TEAM_ABBREVIATIONS[normalized] || 
         Object.entries(NBA_TEAM_ABBREVIATIONS).find(([name]) => 
           name.toLowerCase().includes(normalized.toLowerCase()) ||
           normalized.toLowerCase().includes(name.toLowerCase())
         )?.[1] || 
         normalized.substring(0, 3).toUpperCase();
}

function parseTeamName(name: string): string {
  // Nettoyer le nom de l'équipe
  return name.replace(/\*/g, '').trim();
}

// ============================================
// FONCTIONS DE SCRAPING
// ============================================

/**
 * Scrape les stats de base de toutes les équipes NBA
 */
export async function scrapeAllTeamStats(): Promise<NBATeamStats[]> {
  console.log('🏀 Scraping NBA Team Stats (basketball-reference)...');
  
  const cacheKey = 'nba_all_teams';
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }
  
  try {
    await delay();
    const zai = await ZAI.create();
    
    const result = await zai.functions.invoke('page_reader', {
      url: BBR_URLS.teamStats
    });
    
    if (result.code !== 200 || !result.data?.html) {
      console.log('⚠️ Erreur accès basketball-reference');
      return [];
    }
    
    const html = result.data.html;
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    
    const teams: NBATeamStats[] = [];
    
    // Parser les tableaux de stats
    // Format basketball-reference: Team | G | W | L | W/L% | etc.
    const teamPattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(\d+)\s+(\d+)\s+(\d+)\s+\.(\d+)/g;
    
    let match;
    while ((match = teamPattern.exec(text)) !== null) {
      const teamName = parseTeamName(match[1]);
      const games = parseInt(match[2]);
      const wins = parseInt(match[3]);
      const losses = parseInt(match[4]);
      const winPct = parseFloat(`0.${match[5]}`);
      
      teams.push({
        team: teamName,
        abbreviation: getAbbreviation(teamName),
        season: '2025-26',
        games,
        wins,
        losses,
        winPercentage: winPct,
        offensiveRating: 0, // À compléter avec stats avancées
        defensiveRating: 0,
        netRating: 0,
        pace: 0,
        srs: 0,
        fourFactors: {
          eFGPercent: 0,
          tovPercent: 0,
          orbPercent: 0,
          ftPerFga: 0,
        },
        fgPercent: 0,
        threePointPercent: 0,
        ftPercent: 0,
        scrapedAt: new Date().toISOString(),
      });
    }
    
    // Scrape aussi les stats avancées
    await delay();
    const advancedStats = await scrapeAdvancedTeamStats();
    
    // Merger les données
    for (const team of teams) {
      const advanced = advancedStats.find(a => 
        a.abbreviation === team.abbreviation ||
        (a.team && team.team && a.team.toLowerCase().includes(team.team.toLowerCase()))
      );
      
      if (advanced) {
        team.offensiveRating = advanced.offensiveRating ?? team.offensiveRating;
        team.defensiveRating = advanced.defensiveRating ?? team.defensiveRating;
        team.netRating = advanced.netRating ?? team.netRating;
        team.pace = advanced.pace ?? team.pace;
        team.srs = advanced.srs ?? team.srs;
      }
    }
    
    cache.set(cacheKey, { data: teams, timestamp: Date.now() });
    console.log(`✅ NBA Stats: ${teams.length} équipes scrapées`);
    
    return teams;
    
  } catch (error) {
    console.error('Erreur scraping NBA team stats:', error);
    return [];
  }
}

/**
 * Scrape les stats avancées (ORTG, DRTG, PACE, SRS)
 */
async function scrapeAdvancedTeamStats(): Promise<Partial<NBATeamStats>[]> {
  console.log('📊 Scraping NBA Advanced Stats...');
  
  try {
    const zai = await ZAI.create();
    
    const result = await zai.functions.invoke('page_reader', {
      url: BBR_URLS.advanced
    });
    
    if (result.code !== 200 || !result.data?.html) {
      return [];
    }
    
    const html = result.data.html;
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    
    const teams: Partial<NBATeamStats>[] = [];
    
    // Pattern pour les stats avancées
    // ORTG: "Off Rtg" ou "ORtg", DRTG: "Def Rtg" ou "DRtg"
    const pattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([-+]?\d+\.?\d*)/g;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      teams.push({
        team: parseTeamName(match[1]),
        abbreviation: getAbbreviation(match[1]),
        offensiveRating: parseFloat(match[2]) || 0,
        defensiveRating: parseFloat(match[3]) || 0,
        netRating: parseFloat(match[4]) || 0,
        pace: parseFloat(match[5]) || 0,
        srs: parseFloat(match[6]) || 0,
      });
    }
    
    // Pattern alternatif plus simple
    if (teams.length === 0) {
      const simplePattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)[^)]*?(\d+\.\d)\s+(\d+\.\d)\s+(\d+\.\d)/g;
      
      while ((match = simplePattern.exec(text)) !== null) {
        const teamName = parseTeamName(match[1]);
        
        // Éviter les doublons
        if (!teams.find(t => t.team === teamName)) {
          teams.push({
            team: teamName,
            abbreviation: getAbbreviation(teamName),
            offensiveRating: parseFloat(match[2]) || 0,
            defensiveRating: parseFloat(match[3]) || 0,
            pace: parseFloat(match[4]) || 0,
          });
        }
      }
    }
    
    console.log(`✅ Advanced Stats: ${teams.length} équipes`);
    return teams;
    
  } catch (error) {
    console.error('Erreur scraping advanced stats:', error);
    return [];
  }
}

/**
 * Scrape les stats d'une équipe spécifique
 */
export async function scrapeTeamStats(teamName: string): Promise<NBATeamStats | null> {
  console.log(`🏀 Scraping stats: ${teamName}`);
  
  const cacheKey = `nba_team_${teamName}`;
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }
  
  try {
    const allTeams = await scrapeAllTeamStats();
    const abbrev = getAbbreviation(teamName);
    
    const team = allTeams.find(t => 
      t.abbreviation === abbrev ||
      t.team.toLowerCase().includes(teamName.toLowerCase()) ||
      teamName.toLowerCase().includes(t.team.toLowerCase())
    );
    
    if (team) {
      cache.set(cacheKey, { data: team, timestamp: Date.now() });
      return team;
    }
    
    return null;
    
  } catch (error) {
    console.error('Erreur scraping team stats:', error);
    return null;
  }
}

/**
 * Récupère les stats pour un matchup (les deux équipes)
 */
export async function getNBAMatchupStats(
  homeTeam: string,
  awayTeam: string
): Promise<NBAMatchupStats> {
  console.log(`🏀 NBA Matchup Stats: ${homeTeam} vs ${awayTeam}`);
  
  const [homeStats, awayStats] = await Promise.all([
    scrapeTeamStats(homeTeam),
    scrapeTeamStats(awayTeam),
  ]);
  
  // Analyse
  const analysis = analyzeMatchup(homeStats, awayStats);
  
  return {
    homeTeam,
    awayTeam,
    homeStats,
    awayStats,
    analysis,
    recentH2H: [], // À implémenter si nécessaire
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Analyse un matchup NBA
 */
function analyzeMatchup(
  homeStats: NBATeamStats | null,
  awayStats: NBATeamStats | null
): NBAMatchupStats['analysis'] {
  
  // Valeurs par défaut
  let offensiveAdvantage: 'home' | 'away' | 'neutral' = 'neutral';
  let defensiveAdvantage: 'home' | 'away' | 'neutral' = 'neutral';
  let pacePrediction: 'fast' | 'average' | 'slow' = 'average';
  let projectedTotal = 220; // Moyenne NBA
  let spreadPrediction = 0;
  let confidence: 'high' | 'medium' | 'low' = 'low';
  
  if (homeStats && awayStats) {
    // Avantage offensif
    const ortgDiff = homeStats.offensiveRating - awayStats.offensiveRating;
    if (ortgDiff > 3) offensiveAdvantage = 'home';
    else if (ortgDiff < -3) offensiveAdvantage = 'away';
    
    // Avantage défensif
    const drtgDiff = homeStats.defensiveRating - awayStats.defensiveRating;
    // Plus DRTG est BAS, meilleure est la défense
    if (drtgDiff < -3) defensiveAdvantage = 'home';
    else if (drtgDiff > 3) defensiveAdvantage = 'away';
    
    // Pace prédit
    const avgPace = (homeStats.pace + awayStats.pace) / 2;
    if (avgPace > 102) pacePrediction = 'fast';
    else if (avgPace < 98) pacePrediction = 'slow';
    
    // Score projeté
    // Home score = (Home ORTG + Away DRTG) / 2 × Pace / 100
    const homeOffScore = (homeStats.offensiveRating + awayStats.defensiveRating) / 2;
    const awayOffScore = (awayStats.offensiveRating + homeStats.defensiveRating) / 2;
    
    const paceFactor = avgPace / 100;
    const homeProjected = homeOffScore * paceFactor;
    const awayProjected = awayOffScore * paceFactor;
    
    projectedTotal = Math.round(homeProjected + awayProjected);
    spreadPrediction = Math.round((homeProjected - awayProjected) * 10) / 10;
    
    // Avantage domicile (+3 points en NBA)
    spreadPrediction += 3;
    
    // Confiance basée sur les données disponibles
    if (homeStats.offensiveRating > 0 && awayStats.offensiveRating > 0) {
      confidence = 'high';
    } else if (homeStats.wins > 0 && awayStats.wins > 0) {
      confidence = 'medium';
    }
  }
  
  // Ajuster pour win percentage si pas de stats avancées
  if (homeStats && awayStats && confidence === 'low') {
    const winDiff = homeStats.winPercentage - awayStats.winPercentage;
    spreadPrediction = Math.round(winDiff * 20); // Approximation
    spreadPrediction += 3; // Avantage domicile
  }
  
  return {
    offensiveAdvantage,
    defensiveAdvantage,
    pacePrediction,
    projectedTotal,
    spreadPrediction: Math.round(spreadPrediction * 10) / 10,
    confidence,
  };
}

/**
 * Calcule un "NBA Form Score" similaire au FormPoints football
 */
export function calculateNBAFormScore(teamStats: NBATeamStats | null): number {
  if (!teamStats) return 0;
  
  let score = 0;
  
  // Win percentage (max 30 points)
  score += teamStats.winPercentage * 30;
  
  // Net Rating (max 20 points)
  if (teamStats.netRating > 0) {
    score += Math.min(20, teamStats.netRating);
  } else {
    score += Math.max(-20, teamStats.netRating);
  }
  
  // SRS (max 10 points)
  if (teamStats.srs > 0) {
    score += Math.min(10, teamStats.srs);
  }
  
  // Normaliser sur 100
  return Math.round(Math.max(0, Math.min(100, score + 50)));
}

/**
 * Évalue la forme récente (Last 10)
 */
export function parseLast10Record(record: string): { wins: number; losses: number; points: number } {
  const match = record.match(/(\d+)-(\d+)/);
  if (match) {
    const wins = parseInt(match[1]);
    const losses = parseInt(match[2]);
    return {
      wins,
      losses,
      points: wins * 3, // Sur 30 points possibles
    };
  }
  return { wins: 0, losses: 0, points: 0 };
}

/**
 * Vide le cache
 */
export function clearBBRCache(): void {
  cache.clear();
  console.log('🗑️ Cache Basketball Reference vidé');
}

// ============================================
// NOUVEAU: GESTION DU REPOS ET FATIGUE
// ============================================

/**
 * Calcule les stats de repos pour une équipe
 * Nécessite la date du dernier match
 */
export function calculateRestStats(
  teamStats: NBATeamStats | null,
  lastGameDate?: Date,
  schedule?: Date[]
): NBATeamStats['rest'] {
  const now = new Date();
  
  // Valeurs par défaut
  const defaultRest: NBATeamStats['rest'] = {
    daysSinceLastGame: 2,
    isBackToBack: false,
    gamesInLast7Days: 2,
    restAdvantage: 'normal',
    backToBackCount: 0,
    homeAwayStreak: 0,
  };
  
  if (!teamStats) return defaultRest;
  
  try {
    // Calculer les jours depuis le dernier match
    let daysSinceLastGame = 2;
    if (lastGameDate) {
      const diffMs = now.getTime() - lastGameDate.getTime();
      daysSinceLastGame = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }
    
    // Détecter back-to-back
    const isBackToBack = daysSinceLastGame === 0 || daysSinceLastGame === 1;
    
    // Compter les matchs dans les 7 derniers jours
    let gamesInLast7Days = 2; // Valeur par défaut
    if (schedule && schedule.length > 0) {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      gamesInLast7Days = schedule.filter(d => d >= sevenDaysAgo && d <= now).length;
    }
    
    // Déterminer l'avantage de repos
    let restAdvantage: NBATeamStats['rest']['restAdvantage'] = 'normal';
    if (daysSinceLastGame >= 3 && gamesInLast7Days <= 2) {
      restAdvantage = 'well_rested';
    } else if (isBackToBack && gamesInLast7Days >= 4) {
      restAdvantage = 'exhausted';
    } else if (daysSinceLastGame === 1 || gamesInLast7Days >= 4) {
      restAdvantage = 'fatigued';
    }
    
    return {
      daysSinceLastGame,
      isBackToBack,
      gamesInLast7Days,
      restAdvantage,
      backToBackCount: 0, // Nécessite tracking saisonnier
      homeAwayStreak: 0,  // Nécessite tracking
    };
    
  } catch (error) {
    console.error('Erreur calcul rest stats:', error);
    return defaultRest;
  }
}

/**
 * Analyse la fatigue pour un matchup
 */
export function analyzeFatigue(
  homeStats: NBATeamStats | null,
  awayStats: NBATeamStats | null,
  homeLastGame?: Date,
  awayLastGame?: Date
): NBAMatchupStats['fatigueAnalysis'] {
  
  const homeRest = calculateRestStats(homeStats, homeLastGame);
  const awayRest = calculateRestStats(awayStats, awayLastGame);
  
  // Ces valeurs sont toujours définies (calculateRestStats retourne defaultRest en cas d'erreur)
  const homeRestData = homeRest!;
  const awayRestData = awayRest!;
  
  // Déterminer l'avantage de repos
  let restAdvantage: 'home' | 'away' | 'neutral' = 'neutral';
  
  const homeRestScore = restToScore(homeRestData.restAdvantage);
  const awayRestScore = restToScore(awayRestData.restAdvantage);
  
  if (homeRestScore - awayRestScore >= 1.5) {
    restAdvantage = 'home';
  } else if (awayRestScore - homeRestScore >= 1.5) {
    restAdvantage = 'away';
  }
  
  // Alertes back-to-back
  const backToBackAlert = {
    home: homeRestData.isBackToBack,
    away: awayRestData.isBackToBack,
  };
  
  // Impact sur le spread (en points)
  let fatigueImpact = 0;
  
  // Impact du back-to-back: -1.5 à -3 points
  if (homeRestData.isBackToBack) {
    fatigueImpact -= 2;
  }
  if (awayRestData.isBackToBack) {
    fatigueImpact += 2;
  }
  
  // Impact du repos supplémentaire
  if (homeRestData.daysSinceLastGame > awayRestData.daysSinceLastGame + 1) {
    fatigueImpact += 1;
  } else if (awayRestData.daysSinceLastGame > homeRestData.daysSinceLastGame + 1) {
    fatigueImpact -= 1;
  }
  
  // Impact de la fatigue accumulée
  if (homeRestData.gamesInLast7Days > 4) {
    fatigueImpact -= 1;
  }
  if (awayRestData.gamesInLast7Days > 4) {
    fatigueImpact += 1;
  }
  
  return {
    homeRest: homeRestData,
    awayRest: awayRestData,
    restAdvantage,
    backToBackAlert,
    fatigueImpact: Math.max(-5, Math.min(5, fatigueImpact)),
  };
}

/**
 * Convertit restAdvantage en score numérique
 */
function restToScore(advantage: NBATeamStats['rest']['restAdvantage']): number {
  switch (advantage) {
    case 'well_rested': return 3;
    case 'normal': return 2;
    case 'fatigued': return 1;
    case 'exhausted': return 0;
    default: return 2;
  }
}

/**
 * Ajuste le spread en fonction de la fatigue
 */
export function adjustSpreadForFatigue(
  baseSpread: number,
  fatigueAnalysis: NBAMatchupStats['fatigueAnalysis'] | undefined
): number {
  if (!fatigueAnalysis) return baseSpread;
  
  return baseSpread + fatigueAnalysis.fatigueImpact;
}

/**
 * Génère un résumé de la fatigue pour l'affichage
 */
export function formatFatigueSummary(
  fatigueAnalysis: NBAMatchupStats['fatigueAnalysis'] | undefined
): string {
  if (!fatigueAnalysis) return 'No fatigue data';
  
  const warnings: string[] = [];
  
  if (fatigueAnalysis.backToBackAlert.home) {
    warnings.push('Home B2B');
  }
  if (fatigueAnalysis.backToBackAlert.away) {
    warnings.push('Away B2B');
  }
  
  if (fatigueAnalysis.restAdvantage === 'home') {
    warnings.push('Home +rest');
  } else if (fatigueAnalysis.restAdvantage === 'away') {
    warnings.push('Away +rest');
  }
  
  return warnings.length > 0 ? warnings.join(', ') : 'No fatigue factor';
}

// ============================================
// EXPORTS
// ============================================

const BasketballReferenceScraper = {
  scrapeAllTeamStats,
  scrapeTeamStats,
  getNBAMatchupStats,
  calculateNBAFormScore,
  parseLast10Record,
  calculateRestStats,
  analyzeFatigue,
  adjustSpreadForFatigue,
  formatFatigueSummary,
  clearCache: clearBBRCache,
};

export default BasketballReferenceScraper;
