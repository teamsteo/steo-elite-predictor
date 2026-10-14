/**
 * FBref Scraper - Données Football Avancées
 * 
 * Source: FBref.com (gratuit, très complet)
 * 
 * Données extraites:
 * - Form Guide (résultats 5/10/25 derniers matchs)
 * - Stats discipline (cartons jaunes/rouges)
 * - Historique H2H (confrontations passées)
 * - Buts et xG (Expected Goals)
 * 
 * IMPORTANT: Attendre 3-5 secondes entre chaque requête pour éviter le blocage IP
 * 
 * AMÉLIORÉ: Messages d'erreur explicites et indicateur de qualité
 */

import ZAI from 'z-ai-web-dev-sdk';
import { 
  ScraperError, 
  createScraperError, 
  detectErrorType,
  formatErrorForLog 
} from './scraperErrorHandler';

// Types
export interface MatchResult {
  date: string;
  opponent: string;
  homeAway: 'H' | 'A';
  result: 'W' | 'D' | 'L';
  goalsFor: number;
  goalsAgainst: number;
  possession?: number;
  xG?: number;
  xGA?: number;
}

export interface FormGuide {
  team: string;
  last5: MatchResult[];
  last10: MatchResult[];
  formPoints: number; // Points sur les 5 derniers (max 15)
  form: string; // ex: "W-D-W-W-L"
  goalsScored: number;
  goalsConceded: number;
  cleanSheets: number;
  avgPossession: number;
  avgXG: number;
}

export interface DisciplineStats {
  team: string;
  season: string;
  yellowCards: number;
  redCards: number;
  fouls: number;
  cardsPerMatch: number;
  mostCardedPlayer?: {
    name: string;
    yellow: number;
    red: number;
  };
}

export interface H2HMatch {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  competition: string;
  season: string;
}

export interface H2HHistory {
  team1: string;
  team2: string;
  totalMatches: number;
  team1Wins: number;
  team2Wins: number;
  draws: number;
  team1Goals: number;
  team2Goals: number;
  lastMatches: H2HMatch[];
}

export interface TeamXGStats {
  team: string;
  season: string;
  matches: number;
  goals: number;
  assists: number;
  xG: number;
  xGA: number; // xG Against
  xGD: number; // xG Difference
  xGDPer90: number;
  // Performance
  overperforming: number; // Goals - xG (positif = chanceux)
}

// Interface pour les résultats avec erreurs
export interface ScraperResult<T> {
  data: T | null;
  error: ScraperError | null;
  dataSource: 'real' | 'estimated' | 'none';
}

// Interface pour les stats avancées d'un match
export interface AdvancedMatchStatsResult {
  homeForm: FormGuide | null;
  awayForm: FormGuide | null;
  h2h: H2HHistory | null;
  homeXG: TeamXGStats | null;
  awayXG: TeamXGStats | null;
  homeDiscipline: DisciplineStats | null;
  awayDiscipline: DisciplineStats | null;
  analysis: {
    formAdvantage: 'home' | 'away' | 'neutral';
    xGAdvantage: 'home' | 'away' | 'neutral';
    disciplineRisk: 'low' | 'medium' | 'high';
    h2hTrend: string;
    recommendation: string;
  };
  errors: ScraperError[];
  dataQuality: 'real' | 'estimated' | 'partial' | 'none';
}

// Cache
let cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 heure
const RATE_LIMIT_DELAY = 4000; // 4 secondes entre requêtes

// URLs FBref - Toutes les ligues supportées
const FBREF_URLS = {
  // Top 5 Européennes
  premierLeague: 'https://fbref.com/en/comps/9/Premier-League-Stats',
  ligue1: 'https://fbref.com/en/comps/13/Ligue-1-Stats',
  laliga: 'https://fbref.com/en/comps/12/La-Liga-Stats',
  bundesliga: 'https://fbref.com/en/comps/20/Bundesliga-Stats',
  serieA: 'https://fbref.com/en/comps/11/Serie-A-Stats',
  
  // Ligues supplémentaires
  ligaPortugal: 'https://fbref.com/en/comps/32/Primeira-Liga-Stats',
  eredivisie: 'https://fbref.com/en/comps/23/Eredivisie-Stats',
  belgianProLeague: 'https://fbref.com/en/comps/37/Belgian-Pro-League-Stats',
  austrianBundesliga: 'https://fbref.com/en/comps/56/Austrian-Bundesliga-Stats',
  scottishPrem: 'https://fbref.com/en/comps/40/Scottish-Premiership-Stats',
  
  // Compétitions internationales
  championsLeague: 'https://fbref.com/en/comps/8/Champions-League-Stats',
  europaLeague: 'https://fbref.com/en/comps/19/Europa-League-Stats',
  conferenceLeague: 'https://fbref.com/en/comps/883/Conference-League-Stats',
};

// Liste des ligues supportées avec équipes populaires
export const SUPPORTED_LEAGUES = {
  'Premier League': {
    url: FBREF_URLS.premierLeague,
    teams: ['Manchester City', 'Arsenal', 'Liverpool', 'Manchester United', 'Chelsea', 'Tottenham', 'Newcastle', 'Brighton', 'Aston Villa', 'West Ham'],
  },
  'Ligue 1': {
    url: FBREF_URLS.ligue1,
    teams: ['Paris Saint-Germain', 'Monaco', 'Marseille', 'Lyon', 'Lille', 'Nice', 'Lens', 'Rennes', 'Strasbourg'],
  },
  'La Liga': {
    url: FBREF_URLS.laliga,
    teams: ['Real Madrid', 'Barcelona', 'Atletico Madrid', 'Sevilla', 'Real Sociedad', 'Villarreal', 'Real Betis', 'Athletic Bilbao'],
  },
  'Bundesliga': {
    url: FBREF_URLS.bundesliga,
    teams: ['Bayern Munich', 'Dortmund', 'RB Leipzig', 'Leverkusen', 'Frankfurt', 'Wolfsburg', 'Freiburg'],
  },
  'Serie A': {
    url: FBREF_URLS.serieA,
    teams: ['Juventus', 'Inter', 'AC Milan', 'Napoli', 'Roma', 'Lazio', 'Atalanta', 'Fiorentina'],
  },
  'Liga Portugal': {
    url: FBREF_URLS.ligaPortugal,
    teams: ['Benfica', 'Porto', 'Sporting CP', 'Braga', 'Vitoria Guimaraes'],
  },
  'Eredivisie': {
    url: FBREF_URLS.eredivisie,
    teams: ['Ajax', 'PSV Eindhoven', 'Feyenoord', 'AZ Alkmaar', 'FC Twente'],
  },
  'Belgian Pro League': {
    url: FBREF_URLS.belgianProLeague,
    teams: ['Club Brugge', 'Anderlecht', 'Genk', 'Antwerp', 'Gent'],
  },
};

// Mapping noms d'équipes FBref
const FBREF_TEAM_NAMES: Record<string, string> = {
  'Manchester City': 'Manchester City',
  'Man City': 'Manchester City',
  'Manchester United': 'Manchester Utd',
  'Man United': 'Manchester Utd',
  'Man Utd': 'Manchester Utd',
  'Tottenham': 'Tottenham',
  'Spurs': 'Tottenham',
  'Newcastle': 'Newcastle Utd',
  'Newcastle United': 'Newcastle Utd',
  'Brighton': 'Brighton',
  'West Ham': 'West Ham',
  'Wolves': 'Wolves',
  'Liverpool': 'Liverpool',
  'Arsenal': 'Arsenal',
  'Chelsea': 'Chelsea',
  'Everton': 'Everton',
  'PSG': 'Paris S-G',
  'Paris Saint-Germain': 'Paris S-G',
  'Paris': 'Paris S-G',
  'Real Madrid': 'Real Madrid',
  'Barcelona': 'Barcelona',
  'Barça': 'Barcelona',
  'Atletico Madrid': 'Atlético Madrid',
  'Atletico': 'Atlético Madrid',
  'Bayern Munich': 'Bayern Munich',
  'Bayern': 'Bayern Munich',
  'Dortmund': 'Dortmund',
  'Borussia Dortmund': 'Dortmund',
  'Inter Milan': 'Inter',
  'Inter': 'Inter',
  'AC Milan': 'Milan',
  'Milan': 'Milan',
  'Juventus': 'Juventus',
  'Napoli': 'Napoli',
  'Roma': 'Roma',
  'Lazio': 'Lazio',
};

/**
 * Délai pour respecter le rate limiting
 */
async function delay(ms: number = RATE_LIMIT_DELAY): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Normalise le nom d'équipe pour FBref
 */
function normalizeForFBref(teamName: string): string {
  return FBREF_TEAM_NAMES[teamName] || teamName;
}

/**
 * Cherche une équipe sur FBref et retourne son URL
 */
async function findTeamPage(teamName: string): Promise<string | null> {
  const normalized = normalizeForFBref(teamName);
  
  try {
    const zai = await ZAI.create();
    
    // Chercher via la page de recherche FBref
    const searchUrl = `https://fbref.com/en/search/search.fcgi?search=${encodeURIComponent(normalized)}`;
    
    const result = await zai.functions.invoke('page_reader', {
      url: searchUrl
    });
    
    if (result.code !== 200 || !result.data?.html) {
      return null;
    }
    
    const html = result.data.html;
    
    // Chercher l'URL de l'équipe
    const teamUrlMatch = html.match(/href="\/en\/squads\/[^"]+"/);
    if (teamUrlMatch) {
      const relativeUrl = teamUrlMatch[0].replace(/href="|"/g, '');
      return `https://fbref.com${relativeUrl}`;
    }
    
    return null;
  } catch (error) {
    console.error('Erreur recherche équipe FBref:', error);
    return null;
  }
}

/**
 * Scrape le Form Guide d'une équipe
 * 
 * AMÉLIORÉ: Retourne maintenant les erreurs explicites
 */
export async function scrapeFormGuide(teamName: string): Promise<ScraperResult<FormGuide>> {
  console.log(`📊 Scraping Form Guide: ${teamName} (FBref)...`);
  
  const cacheKey = `form_${teamName}`;
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return { data: cached.data, error: null, dataSource: 'real' };
  }
  
  try {
    await delay();
    
    const zai = await ZAI.create();
    const teamUrl = await findTeamPage(teamName);
    
    if (!teamUrl) {
      console.log(`⚠️ Équipe non trouvée sur FBref: ${teamName}`);
      return {
        data: null,
        error: createScraperError(
          'not_found',
          'FBref',
          ['form'],
          `Équipe "${teamName}" non trouvée sur FBref`
        ),
        dataSource: 'none',
      };
    }
    
    await delay();
    
    const result = await zai.functions.invoke('page_reader', {
      url: teamUrl
    });
    
    // Détection des erreurs
    if (result.code !== 200) {
      const errorType = detectErrorType(result, 'FBref');
      const error = createScraperError(
        errorType,
        'FBref',
        ['form'],
        `Erreur HTTP ${result.code} lors de l'accès à la page de l'équipe`
      );
      console.warn(`⚠️ ${formatErrorForLog(error)}`);
      return { data: null, error, dataSource: 'none' };
    }
    
    if (!result.data?.html) {
      const error = createScraperError(
        'invalid_response',
        'FBref',
        ['form'],
        'Pas de données HTML reçues'
      );
      return { data: null, error, dataSource: 'none' };
    }
    
    const html = result.data.html;
    
    // Vérifier Cloudflare
    if (html.includes('cloudflare') || html.includes('challenge-platform') || html.length < 3000) {
      const error = createScraperError(
        'cloudflare_blocked',
        'FBref',
        ['form', 'xg', 'h2h'],
        'Cloudflare a bloqué l\'accès - protection anti-bot active'
      );
      console.warn(`⚠️ ${formatErrorForLog(error)}`);
      return { data: null, error, dataSource: 'none' };
    }
    
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    
    // Parser les résultats récents
    const matches: MatchResult[] = [];
    
    // Pattern pour les matchs: Date Opponent Result Score
    const matchPattern = /(\d{4}-\d{2}-\d{2})\s+([A-Za-z ]+)\s+(H|A)\s+(W|D|L)\s+(\d+)[–-](\d+)/g;
    
    let match;
    while ((match = matchPattern.exec(text)) !== null) {
      matches.push({
        date: match[1],
        opponent: match[2].trim(),
        homeAway: match[3] as 'H' | 'A',
        result: match[4] as 'W' | 'D' | 'L',
        goalsFor: parseInt(match[5]),
        goalsAgainst: parseInt(match[6]),
      });
      
      if (matches.length >= 25) break;
    }
    
    // Calculer les stats
    const last5 = matches.slice(0, 5);
    const last10 = matches.slice(0, 10);
    
    const formPoints = last5.reduce((sum, m) => {
      if (m.result === 'W') return sum + 3;
      if (m.result === 'D') return sum + 1;
      return sum;
    }, 0);
    
    const form = last5.map(m => m.result).join('-');
    const goalsScored = last5.reduce((sum, m) => sum + m.goalsFor, 0);
    const goalsConceded = last5.reduce((sum, m) => sum + m.goalsAgainst, 0);
    const cleanSheets = last5.filter(m => m.goalsAgainst === 0).length;
    
    // Chercher xG si disponible
    const xgPattern = /xG:\s*([\d.]+)/g;
    const xgMatches = text.match(xgPattern) || [];
    const avgXG = xgMatches.length > 0 
      ? xgMatches.reduce((sum, m) => sum + parseFloat(m.replace('xG:', '').trim()), 0) / xgMatches.length
      : 0;
    
    const formGuide: FormGuide = {
      team: teamName,
      last5,
      last10,
      formPoints,
      form,
      goalsScored,
      goalsConceded,
      cleanSheets,
      avgPossession: 50, // À améliorer avec parsing plus précis
      avgXG: Math.round(avgXG * 100) / 100,
    };
    
    cache.set(cacheKey, { data: formGuide, timestamp: Date.now() });
    console.log(`✅ Form Guide: ${teamName} - Form: ${form} (${formPoints}/15 pts)`);
    
    return { data: formGuide, error: null, dataSource: 'real' };
    
  } catch (error: any) {
    const scraperError = createScraperError(
      'unknown',
      'FBref',
      ['form'],
      error.message
    );
    console.error('Erreur scraping Form Guide:', error.message);
    return { data: null, error: scraperError, dataSource: 'none' };
  }
}

/**
 * Scrape les stats de discipline d'une équipe
 * 
 * AMÉLIORÉ: Retourne maintenant les erreurs explicites
 */
export async function scrapeDisciplineStats(teamName: string): Promise<ScraperResult<DisciplineStats>> {
  console.log(`🟨 Scraping Discipline: ${teamName} (FBref)...`);
  
  const cacheKey = `discipline_${teamName}`;
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return { data: cached.data, error: null, dataSource: 'real' };
  }
  
  try {
    await delay();
    
    const zai = await ZAI.create();
    const teamUrl = await findTeamPage(teamName);
    
    if (!teamUrl) {
      return {
        data: null,
        error: createScraperError(
          'not_found',
          'FBref',
          ['discipline'],
          `Équipe "${teamName}" non trouvée`
        ),
        dataSource: 'none',
      };
    }
    
    // Aller sur la page des stats de l'équipe
    const statsUrl = teamUrl.replace('/squads/', '/squads/') + '#team_stats';
    
    await delay();
    
    const result = await zai.functions.invoke('page_reader', {
      url: statsUrl
    });
    
    // Détection des erreurs
    if (result.code !== 200) {
      const errorType = detectErrorType(result, 'FBref');
      return {
        data: null,
        error: createScraperError(errorType, 'FBref', ['discipline'], `Erreur HTTP ${result.code}`),
        dataSource: 'none',
      };
    }
    
    if (!result.data?.html) {
      return {
        data: null,
        error: createScraperError('invalid_response', 'FBref', ['discipline'], 'Pas de données reçues'),
        dataSource: 'none',
      };
    }
    
    const html = result.data.html;
    
    // Vérifier Cloudflare
    if (html.includes('cloudflare') || html.includes('challenge-platform') || html.length < 3000) {
      return {
        data: null,
        error: createScraperError('cloudflare_blocked', 'FBref', ['discipline'], 'Accès bloqué par Cloudflare'),
        dataSource: 'none',
      };
    }
    
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    
    // Parser les cartons
    const yellowMatch = text.match(/(\d+)\s*(?:CrdY|Yellow|Jaune)/i);
    const redMatch = text.match(/(\d+)\s*(?:CrdR|Red|Rouge)/i);
    const foulsMatch = text.match(/(\d+)\s*(?:Fls|Fouls|Fautes)/i);
    const matchesMatch = text.match(/(\d+)\s*(?:MP|Matches|Matchs)/i);
    
    const yellowCards = yellowMatch ? parseInt(yellowMatch[1]) : 0;
    const redCards = redMatch ? parseInt(redMatch[1]) : 0;
    const fouls = foulsMatch ? parseInt(foulsMatch[1]) : 0;
    const matches = matchesMatch ? parseInt(matchesMatch[1]) : 38;
    
    const discipline: DisciplineStats = {
      team: teamName,
      season: '2025-2026',
      yellowCards,
      redCards,
      fouls,
      cardsPerMatch: Math.round((yellowCards + redCards * 2) / matches * 100) / 100,
    };
    
    cache.set(cacheKey, { data: discipline, timestamp: Date.now() });
    console.log(`✅ Discipline: ${teamName} - ${yellowCards}🟨 ${redCards}🟥`);
    
    return { data: discipline, error: null, dataSource: 'real' };
    
  } catch (error: any) {
    return {
      data: null,
      error: createScraperError('unknown', 'FBref', ['discipline'], error.message),
      dataSource: 'none',
    };
  }
}

/**
 * Scrape l'historique H2H entre deux équipes
 * 
 * AMÉLIORÉ: Retourne maintenant les erreurs explicites
 */
export async function scrapeH2HHistory(
  team1: string,
  team2: string
): Promise<ScraperResult<H2HHistory>> {
  console.log(`⚔️ Scraping H2H: ${team1} vs ${team2} (FBref)...`);
  
  const cacheKey = `h2h_${team1}_${team2}`;
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return { data: cached.data, error: null, dataSource: 'real' };
  }
  
  try {
    await delay();
    
    const zai = await ZAI.create();
    
    // URL H2H FBref
    const h2hUrl = `https://fbref.com/en/headtohead/${encodeURIComponent(team1)}-vs-${encodeURIComponent(team2)}`;
    
    const result = await zai.functions.invoke('page_reader', {
      url: h2hUrl
    });
    
    // Détection des erreurs
    if (result.code !== 200) {
      const errorType = detectErrorType(result, 'FBref');
      return {
        data: null,
        error: createScraperError(errorType, 'FBref', ['h2h'], `Erreur HTTP ${result.code}`),
        dataSource: 'none',
      };
    }
    
    if (!result.data?.html) {
      return {
        data: null,
        error: createScraperError('invalid_response', 'FBref', ['h2h'], 'Pas de données reçues'),
        dataSource: 'none',
      };
    }
    
    const html = result.data.html;
    
    // Vérifier Cloudflare
    if (html.includes('cloudflare') || html.includes('challenge-platform') || html.length < 3000) {
      return {
        data: null,
        error: createScraperError('cloudflare_blocked', 'FBref', ['h2h'], 'Accès bloqué par Cloudflare'),
        dataSource: 'none',
      };
    }
    
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    
    // Parser les matchs H2H
    const matches: H2HMatch[] = [];
    
    // Pattern: Date Team1 Score Team2 Competition
    const matchPattern = /(\d{4}-\d{2}-\d{2})\s+([A-Za-z ]+)\s+(\d+)[–-](\d+)\s+([A-Za-z ]+)\s+([A-Za-z ]+)/g;
    
    let match;
    while ((match = matchPattern.exec(text)) !== null) {
      matches.push({
        date: match[1],
        homeTeam: match[2].trim(),
        awayTeam: match[5].trim(),
        homeScore: parseInt(match[3]),
        awayScore: parseInt(match[4]),
        competition: match[6].trim(),
        season: match[1].substring(0, 4),
      });
      
      if (matches.length >= 20) break;
    }
    
    // Calculer les stats H2H
    let team1Wins = 0;
    let team2Wins = 0;
    let draws = 0;
    let team1Goals = 0;
    let team2Goals = 0;
    
    const team1Norm = team1.toLowerCase();
    const team2Norm = team2.toLowerCase();
    
    for (const m of matches) {
      const isTeam1Home = m.homeTeam.toLowerCase().includes(team1Norm) || team1Norm.includes(m.homeTeam.toLowerCase());
      const isTeam2Away = m.awayTeam.toLowerCase().includes(team2Norm) || team2Norm.includes(m.awayTeam.toLowerCase());
      
      if (isTeam1Home && isTeam2Away) {
        team1Goals += m.homeScore;
        team2Goals += m.awayScore;
        
        if (m.homeScore > m.awayScore) team1Wins++;
        else if (m.homeScore < m.awayScore) team2Wins++;
        else draws++;
      } else {
        team2Goals += m.homeScore;
        team1Goals += m.awayScore;
        
        if (m.homeScore > m.awayScore) team2Wins++;
        else if (m.homeScore < m.awayScore) team1Wins++;
        else draws++;
      }
    }
    
    const h2h: H2HHistory = {
      team1,
      team2,
      totalMatches: matches.length,
      team1Wins,
      team2Wins,
      draws,
      team1Goals,
      team2Goals,
      lastMatches: matches.slice(0, 10),
    };
    
    cache.set(cacheKey, { data: h2h, timestamp: Date.now() });
    console.log(`✅ H2H: ${team1} ${team1Wins}W - ${draws}D - ${team2Wins}W ${team2}`);
    
    return { data: h2h, error: null, dataSource: 'real' };
    
  } catch (error: any) {
    return {
      data: null,
      error: createScraperError('unknown', 'FBref', ['h2h'], error.message),
      dataSource: 'none',
    };
  }
}

/**
 * Scrape les xG d'une équipe
 * 
 * AMÉLIORÉ: Retourne maintenant les erreurs explicites
 */
export async function scrapeTeamXG(teamName: string): Promise<ScraperResult<TeamXGStats>> {
  console.log(`📈 Scraping xG: ${teamName} (FBref)...`);
  
  const cacheKey = `xg_${teamName}`;
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return { data: cached.data, error: null, dataSource: 'real' };
  }
  
  try {
    await delay();
    
    const zai = await ZAI.create();
    const teamUrl = await findTeamPage(teamName);
    
    if (!teamUrl) {
      return {
        data: null,
        error: createScraperError('not_found', 'FBref', ['xg'], `Équipe "${teamName}" non trouvée`),
        dataSource: 'none',
      };
    }
    
    await delay();
    
    const result = await zai.functions.invoke('page_reader', {
      url: teamUrl
    });
    
    // Détection des erreurs
    if (result.code !== 200) {
      const errorType = detectErrorType(result, 'FBref');
      return {
        data: null,
        error: createScraperError(errorType, 'FBref', ['xg'], `Erreur HTTP ${result.code}`),
        dataSource: 'none',
      };
    }
    
    if (!result.data?.html) {
      return {
        data: null,
        error: createScraperError('invalid_response', 'FBref', ['xg'], 'Pas de données reçues'),
        dataSource: 'none',
      };
    }
    
    const html = result.data.html;
    
    // Vérifier Cloudflare
    if (html.includes('cloudflare') || html.includes('challenge-platform') || html.length < 3000) {
      return {
        data: null,
        error: createScraperError('cloudflare_blocked', 'FBref', ['xg'], 'Accès bloqué par Cloudflare'),
        dataSource: 'none',
      };
    }
    
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    
    // Parser les xG
    const xgMatch = text.match(/xG:\s*([\d.]+)/i);
    const xgaMatch = text.match(/xGA:\s*([\d.]+)/i);
    const goalsMatch = text.match(/(?:Goals|GF):\s*(\d+)/i);
    const matchesMatch = text.match(/(\d+)\s*(?:MP|Matches)/i);
    
    const xG = xgMatch ? parseFloat(xgMatch[1]) : 0;
    const xGA = xgaMatch ? parseFloat(xgaMatch[1]) : 0;
    const goals = goalsMatch ? parseInt(goalsMatch[1]) : 0;
    const matches = matchesMatch ? parseInt(matchesMatch[1]) : 38;
    
    const xGD = xG - xGA;
    const xGDPer90 = matches > 0 ? xGD / matches : 0;
    const overperforming = goals - xG;
    
    const xgStats: TeamXGStats = {
      team: teamName,
      season: '2025-2026',
      matches,
      goals,
      assists: 0, // À parser si nécessaire
      xG,
      xGA,
      xGD: Math.round(xGD * 10) / 10,
      xGDPer90: Math.round(xGDPer90 * 100) / 100,
      overperforming: Math.round(overperforming * 10) / 10,
    };
    
    cache.set(cacheKey, { data: xgStats, timestamp: Date.now() });
    
    const performance = overperforming > 0 ? 'chanceux' : overperforming < 0 ? 'malchanceux' : 'neutre';
    console.log(`✅ xG: ${teamName} - xG:${xG.toFixed(1)} xGA:${xGA.toFixed(1)} (${performance})`);
    
    return { data: xgStats, error: null, dataSource: 'real' };
    
  } catch (error: any) {
    return {
      data: null,
      error: createScraperError('unknown', 'FBref', ['xg'], error.message),
      dataSource: 'none',
    };
  }
}

/**
 * Récupère toutes les stats avancées pour un match
 * 
 * AMÉLIORÉ: Retourne maintenant les erreurs explicites et la qualité des données
 */
export async function getAdvancedMatchStats(
  homeTeam: string,
  awayTeam: string
): Promise<AdvancedMatchStatsResult> {
  console.log(`📊 Récupération stats avancées: ${homeTeam} vs ${awayTeam}`);
  
  const errors: ScraperError[] = [];
  let realDataCount = 0;
  let totalDataTypes = 7; // form x2, h2h, xg x2, discipline x2
  
  // Récupérer toutes les données en séquence (avec délais pour rate limiting)
  const homeFormResult = await scrapeFormGuide(homeTeam);
  if (homeFormResult.error) errors.push(homeFormResult.error);
  if (homeFormResult.data) realDataCount++;
  await delay();
  
  const awayFormResult = await scrapeFormGuide(awayTeam);
  if (awayFormResult.error) errors.push(awayFormResult.error);
  if (awayFormResult.data) realDataCount++;
  await delay();
  
  const h2hResult = await scrapeH2HHistory(homeTeam, awayTeam);
  if (h2hResult.error) errors.push(h2hResult.error);
  if (h2hResult.data) realDataCount++;
  await delay();
  
  const homeXGResult = await scrapeTeamXG(homeTeam);
  if (homeXGResult.error) errors.push(homeXGResult.error);
  if (homeXGResult.data) realDataCount++;
  await delay();
  
  const awayXGResult = await scrapeTeamXG(awayTeam);
  if (awayXGResult.error) errors.push(awayXGResult.error);
  if (awayXGResult.data) realDataCount++;
  await delay();
  
  const homeDisciplineResult = await scrapeDisciplineStats(homeTeam);
  if (homeDisciplineResult.error) errors.push(homeDisciplineResult.error);
  if (homeDisciplineResult.data) realDataCount++;
  await delay();
  
  const awayDisciplineResult = await scrapeDisciplineStats(awayTeam);
  if (awayDisciplineResult.error) errors.push(awayDisciplineResult.error);
  if (awayDisciplineResult.data) realDataCount++;
  
  // Déterminer la qualité globale des données
  const realDataRatio = realDataCount / totalDataTypes;
  let dataQuality: 'real' | 'estimated' | 'partial' | 'none';
  if (realDataRatio >= 0.8) dataQuality = 'real';
  else if (realDataRatio >= 0.4) dataQuality = 'partial';
  else if (realDataRatio > 0) dataQuality = 'estimated';
  else dataQuality = 'none';
  
  // Extraction des données
  const homeForm = homeFormResult.data;
  const awayForm = awayFormResult.data;
  const h2h = h2hResult.data;
  const homeXG = homeXGResult.data;
  const awayXG = awayXGResult.data;
  const homeDiscipline = homeDisciplineResult.data;
  const awayDiscipline = awayDisciplineResult.data;
  
  // Analyse
  let formAdvantage: 'home' | 'away' | 'neutral' = 'neutral';
  if (homeForm && awayForm) {
    const diff = homeForm.formPoints - awayForm.formPoints;
    if (diff >= 3) formAdvantage = 'home';
    else if (diff <= -3) formAdvantage = 'away';
  }
  
  let xGAdvantage: 'home' | 'away' | 'neutral' = 'neutral';
  if (homeXG && awayXG) {
    const diff = homeXG.xGDPer90 - awayXG.xGDPer90;
    if (diff >= 0.3) xGAdvantage = 'home';
    else if (diff <= -0.3) xGAdvantage = 'away';
  }
  
  let disciplineRisk: 'low' | 'medium' | 'high' = 'low';
  if (homeDiscipline && awayDiscipline) {
    const totalCards = homeDiscipline.cardsPerMatch + awayDiscipline.cardsPerMatch;
    if (totalCards >= 4) disciplineRisk = 'high';
    else if (totalCards >= 2.5) disciplineRisk = 'medium';
  }
  
  let h2hTrend = 'Pas de données H2H';
  if (h2h && h2h.totalMatches > 0) {
    const homeWinPct = Math.round(h2h.team1Wins / h2h.totalMatches * 100);
    h2hTrend = `${homeTeam} ${homeWinPct}% victoires (${h2h.team1Wins}W-${h2h.draws}D-${h2h.team2Wins}L)`;
  }
  
  // Recommandation
  const recommendations: string[] = [];
  
  if (formAdvantage === 'home' && homeForm) {
    recommendations.push(`${homeTeam} en meilleure forme (${homeForm.form})`);
  } else if (formAdvantage === 'away' && awayForm) {
    recommendations.push(`${awayTeam} en meilleure forme (${awayForm.form})`);
  }
  
  if (xGAdvantage === 'home' && homeXG) {
    if (homeXG.overperforming > 2) {
      recommendations.push(`${homeTeam} peut régresser (surperformance xG)`);
    } else if (homeXG.overperforming < -2) {
      recommendations.push(`${homeTeam} sous-performe, peut rebondir`);
    }
  }
  
  if (disciplineRisk === 'high') {
    recommendations.push('Risque de cartons élevé');
  }
  
  const analysis = {
    formAdvantage,
    xGAdvantage,
    disciplineRisk,
    h2hTrend,
    recommendation: recommendations.join('. ') || 'Match équilibré',
  };
  
  // Log des erreurs si présentes
  if (errors.length > 0) {
    console.log(`⚠️ ${errors.length} erreur(s) rencontrée(s):`);
    errors.forEach(e => console.log(`   - ${e.source}: ${e.userMessage}`));
  }
  
  console.log(`✅ Analyse: ${analysis.recommendation} (Qualité: ${dataQuality})`);
  
  return {
    homeForm,
    awayForm,
    h2h,
    homeXG,
    awayXG,
    homeDiscipline,
    awayDiscipline,
    analysis,
    errors,
    dataQuality,
  };
}

/**
 * Vide le cache
 */
export function clearFBrefCache(): void {
  cache = new Map();
  console.log('🗑️ Cache FBref vidé');
}

// Export par défaut
const FBrefScraper = {
  scrapeFormGuide,
  scrapeDisciplineStats,
  scrapeH2HHistory,
  scrapeTeamXG,
  getAdvancedMatchStats,
  clearCache: clearFBrefCache,
};

export default FBrefScraper;
