/**
 * Injury Scraper - Récupération des VRAIES blessures
 * 
 * Sources:
 * - Football: Transfermarkt (scraping)
 * - NBA: official.nba.com/nba-injury-report
 * 
 * GRATUIT - Données officielles à jour
 * 
 * AMÉLIORÉ: Messages d'erreur explicites et indicateur de qualité
 */

import ZAI from 'z-ai-web-dev-sdk';
import { 
  ScraperError, 
  ScraperErrorType,
  createScraperError, 
  detectErrorType,
  formatErrorForLog 
} from './scraperErrorHandler';

// Types
export interface InjuryInfo {
  player: string;
  team: string;
  injury: string;
  status: 'out' | 'doubtful' | 'probable' | 'day-to-day';
  returnDate?: string;
  source: string;
  scrapedAt: string;
}

export interface TeamInjuries {
  team: string;
  sport: 'Foot' | 'Basket';
  injuries: InjuryInfo[];
  lastUpdated: string;
  dataSource: 'real' | 'estimated' | 'none';
  errors?: ScraperError[];
}

// Cache
let cachedFootballInjuries: Map<string, TeamInjuries> = new Map();
let cachedNBAInjuries: Map<string, TeamInjuries> = new Map();
let lastScrapeTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// URLs
const TRANSFERMARKT_URLS = {
  premierLeague: 'https://www.transfermarkt.com/premier-league/verletzte/spielwettbewerb/GB1',
  ligue1: 'https://www.transfermarkt.com/ligue-1/verletzte/spielwettbewerb/FR1',
  liga: 'https://www.transfermarkt.com/laliga/verletzte/spielwettbewerb/ES1',
  bundesliga: 'https://www.transfermarkt.com/bundesliga/verletzte/spielwettbewerb/L1',
  serieA: 'https://www.transfermarkt.com/serie-a/verletzte/spielwettbewerb/IT1',
  championsLeague: 'https://www.transfermarkt.com/champions-league/verletzte/spielwettbewerb/CL',
};

const NBA_INJURY_URL = 'https://official.nba.com/nba-injury-report-2025-26-season/';

// Mapping équipes NBA (noms courts vers noms complets)
const NBA_TEAM_NAMES: Record<string, string> = {
  'ATL': 'Atlanta Hawks',
  'BOS': 'Boston Celtics',
  'BKN': 'Brooklyn Nets',
  'CHA': 'Charlotte Hornets',
  'CHI': 'Chicago Bulls',
  'CLE': 'Cleveland Cavaliers',
  'DAL': 'Dallas Mavericks',
  'DEN': 'Denver Nuggets',
  'DET': 'Detroit Pistons',
  'GS': 'Golden State Warriors',
  'GSW': 'Golden State Warriors',
  'HOU': 'Houston Rockets',
  'IND': 'Indiana Pacers',
  'LAC': 'LA Clippers',
  'LAL': 'Los Angeles Lakers',
  'MEM': 'Memphis Grizzlies',
  'MIA': 'Miami Heat',
  'MIL': 'Milwaukee Bucks',
  'MIN': 'Minnesota Timberwolves',
  'NOP': 'New Orleans Pelicans',
  'NYK': 'New York Knicks',
  'OKC': 'Oklahoma City Thunder',
  'ORL': 'Orlando Magic',
  'PHI': 'Philadelphia 76ers',
  'PHX': 'Phoenix Suns',
  'POR': 'Portland Trail Blazers',
  'SAC': 'Sacramento Kings',
  'SAS': 'San Antonio Spurs',
  'TOR': 'Toronto Raptors',
  'UTA': 'Utah Jazz',
  'WAS': 'Washington Wizards',
  'WSH': 'Washington Wizards',
};

// Mapping équipes Football
const FOOTBALL_TEAM_ALIASES: Record<string, string[]> = {
  'Manchester City': ['Man City', 'Man. City', 'Manchester City FC'],
  'Manchester United': ['Man United', 'Man. United', 'Man Utd', 'Manchester United FC'],
  'Tottenham': ['Spurs', 'Tottenham Hotspur'],
  'Newcastle': ['Newcastle United'],
  'Brighton': ['Brighton & Hove Albion'],
  'West Ham': ['West Ham United'],
  'Wolves': ['Wolverhampton', 'Wolverhampton Wanderers'],
  'Paris Saint-Germain': ['PSG', 'Paris SG', 'Paris'],
  'Real Madrid': ['Real Madrid CF'],
  'Atletico Madrid': ['Atletico', 'Atlético Madrid'],
  'Bayern Munich': ['Bayern', 'FC Bayern Munich'],
  'Borussia Dortmund': ['Dortmund', 'BVB'],
  'Inter Milan': ['Inter', 'FC Internazionale'],
  'AC Milan': ['Milan'],
  'Juventus': ['Juventus FC'],
};

/**
 * Normalise le nom d'une équipe
 */
function normalizeTeamName(name: string): string {
  const normalized = name.trim().toLowerCase();
  
  // Vérifier les alias
  for (const [canonical, aliases] of Object.entries(FOOTBALL_TEAM_ALIASES)) {
    if (normalized.includes(canonical.toLowerCase())) return canonical;
    for (const alias of aliases) {
      if (normalized.includes(alias.toLowerCase())) return canonical;
    }
  }
  
  return name.trim();
}

/**
 * Parse le statut de blessure
 */
function parseInjuryStatus(status: string): 'out' | 'doubtful' | 'probable' | 'day-to-day' {
  const s = status.toLowerCase();
  if (s.includes('out') || s.includes('injured') || s.includes('blessé')) return 'out';
  if (s.includes('doubtful') || s.includes('doute') || s.includes('questionable')) return 'doubtful';
  if (s.includes('probable') || s.includes('probable')) return 'probable';
  return 'day-to-day';
}

/**
 * Scrape les blessures NBA depuis le rapport officiel
 * 
 * AMÉLIORÉ: Retourne maintenant les erreurs explicites
 */
export async function scrapeNBAInjuries(): Promise<{
  injuries: Map<string, TeamInjuries>;
  errors: ScraperError[];
}> {
  console.log('🏀 Scraping blessures NBA (official.nba.com)...');
  
  const injuries = new Map<string, TeamInjuries>();
  const errors: ScraperError[] = [];
  
  try {
    const zai = await ZAI.create();
    
    const result = await zai.functions.invoke('page_reader', {
      url: NBA_INJURY_URL
    });
    
    // Détection des erreurs
    if (result.code !== 200) {
      const errorType = detectErrorType(result, 'NBA Official');
      const error = createScraperError(
        errorType,
        'NBA Official Injury Report',
        ['nba_injuries'],
        `Erreur HTTP ${result.code}: Accès refusé`
      );
      errors.push(error);
      console.warn(`⚠️ ${formatErrorForLog(error)}`);
      
      // Retourner avec données estimées vides
      return { injuries, errors };
    }
    
    if (!result.data?.html) {
      const error = createScraperError(
        'javascript_rendering',
        'NBA Official Injury Report',
        ['nba_injuries'],
        'Le site NBA nécessite JavaScript pour afficher les données'
      );
      errors.push(error);
      console.warn(`⚠️ ${formatErrorForLog(error)}`);
      
      return { injuries, errors };
    }
    
    const html = result.data.html;
    
    // Vérifier si le HTML est trop court (indique un problème de rendu)
    if (html.length < 5000) {
      const error = createScraperError(
        'javascript_rendering',
        'NBA Official Injury Report',
        ['nba_injuries'],
        'Contenu insuffisant - JavaScript probablement requis'
      );
      errors.push(error);
      console.warn(`⚠️ ${formatErrorForLog(error)}`);
    }
    
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    
    // Parser les blessures (format typique du rapport NBA)
    const patterns = [
      /([A-Z][a-z]+ [A-Z][a-z]+)\s*[-–]\s*([A-Z]{2,3})\s*[-–]\s*([^–]+)\s*[-–]\s*(Out|Doubtful|Probable|Day-to-Day)/gi,
      /([A-Z][a-z]+ [A-Z][a-z]+)\s+\(([A-Z]{2,3})\)\s*[-–]?\s*([^,]+),\s*(Out|Doubtful|Probable)/gi,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const playerName = match[1].trim();
        const teamAbbr = match[2].toUpperCase();
        const injury = match[3].trim();
        const status = parseInjuryStatus(match[4]);
        
        const teamName = NBA_TEAM_NAMES[teamAbbr] || teamAbbr;
        
        const injuryInfo: InjuryInfo = {
          player: playerName,
          team: teamName,
          injury,
          status,
          source: 'NBA Official',
          scrapedAt: new Date().toISOString(),
        };
        
        if (!injuries.has(teamName)) {
          injuries.set(teamName, {
            team: teamName,
            sport: 'Basket',
            injuries: [],
            lastUpdated: new Date().toISOString(),
            dataSource: 'real',
            errors: [],
          });
        }
        
        injuries.get(teamName)!.injuries.push(injuryInfo);
      }
    }
    
    // Méthode alternative: chercher les tableaux
    if (injuries.size === 0) {
      const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
      
      for (const row of rows) {
        const cells = row.match(/<td[^>]*>([^<]+)<\/td>/gi) || [];
        if (cells.length >= 3) {
          const playerCell = cells[0]?.replace(/<[^>]*>/g, '').trim();
          const teamCell = cells[1]?.replace(/<[^>]*>/g, '').trim();
          const injuryCell = cells[2]?.replace(/<[^>]*>/g, '').trim();
          const statusCell = cells[3]?.replace(/<[^>]*>/g, '').trim() || 'out';
          
          if (playerCell && teamCell && injuryCell && playerCell.length > 2) {
            const teamName = NBA_TEAM_NAMES[teamCell.toUpperCase()] || teamCell;
            
            const injuryInfo: InjuryInfo = {
              player: playerCell,
              team: teamName,
              injury: injuryCell,
              status: parseInjuryStatus(statusCell),
              source: 'NBA Official',
              scrapedAt: new Date().toISOString(),
            };
            
            if (!injuries.has(teamName)) {
              injuries.set(teamName, {
                team: teamName,
                sport: 'Basket',
                injuries: [],
                lastUpdated: new Date().toISOString(),
                dataSource: 'real',
                errors: [],
              });
            }
            
            injuries.get(teamName)!.injuries.push(injuryInfo);
          }
        }
      }
    }
    
    cachedNBAInjuries = injuries;
    
    if (injuries.size === 0 && errors.length === 0) {
      console.log('ℹ️ Aucune blessure NBA trouvée (normal si pas de rapports actifs)');
    } else {
      console.log(`✅ NBA Injuries: ${injuries.size} équipes avec blessures`);
    }
    
    if (errors.length > 0) {
      console.log(`⚠️ ${errors.length} erreur(s) rencontrée(s)`);
    }
    
    return { injuries, errors };
    
  } catch (error: any) {
    const scraperError = createScraperError(
      'unknown',
      'NBA Official Injury Report',
      ['nba_injuries'],
      error.message
    );
    errors.push(scraperError);
    console.error('❌ Erreur scraping NBA injuries:', error.message);
    
    return { injuries, errors };
  }
}

/**
 * Scrape les blessures Football depuis Transfermarkt
 * 
 * AMÉLIORÉ: Retourne maintenant les erreurs explicites
 */
export async function scrapeFootballInjuries(): Promise<{
  injuries: Map<string, TeamInjuries>;
  errors: ScraperError[];
}> {
  console.log('⚽ Scraping blessures Football (Transfermarkt)...');
  
  const injuries = new Map<string, TeamInjuries>();
  const errors: ScraperError[] = [];
  
  try {
    const zai = await ZAI.create();
    
    // Scrape chaque ligue
    for (const [league, url] of Object.entries(TRANSFERMARKT_URLS)) {
      try {
        console.log(`  📌 ${league}...`);
        
        const result = await zai.functions.invoke('page_reader', {
          url
        });
        
        // Détection des erreurs
        if (result.code !== 200) {
          const errorType = detectErrorType(result, 'Transfermarkt');
          const error = createScraperError(
            errorType,
            `Transfermarkt ${league}`,
            ['football_injuries', league.toLowerCase()],
            `Erreur HTTP ${result.code} - Accès bloqué`
          );
          errors.push(error);
          console.warn(`    ⚠️ ${error.userMessage}`);
          continue;
        }
        
        if (!result.data?.html) {
          const error = createScraperError(
            'invalid_response',
            `Transfermarkt ${league}`,
            ['football_injuries'],
            'Pas de données HTML reçues'
          );
          errors.push(error);
          console.warn(`    ⚠️ ${error.userMessage}`);
          continue;
        }
        
        const html = result.data.html;
        
        // Vérifier Cloudflare
        if (html.includes('cloudflare') || html.includes('challenge-platform') || html.length < 3000) {
          const error = createScraperError(
            'cloudflare_blocked',
            `Transfermarkt ${league}`,
            ['football_injuries'],
            'Cloudflare a bloqué l\'accès - protection anti-bot active'
          );
          errors.push(error);
          console.warn(`    ⚠️ ${error.userMessage}`);
          continue;
        }
        
        // Parser les blessures Transfermarkt
        const rows = html.match(/<tr[^>]*class="[^"]*odd[^"]*"[\s\S]*?<\/tr>|<tr[^>]*class="[^"]*even[^"]*"[\s\S]*?<\/tr>/gi) || [];
        
        for (const row of rows) {
          try {
            const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
            
            if (cells.length >= 3) {
              const playerCell = cells[0]?.replace(/<[^>]*>/g, '').trim();
              const teamCell = cells[1]?.replace(/<[^>]*>/g, '').trim();
              const injuryCell = cells[2]?.replace(/<[^>]*>/g, '').trim();
              const returnCell = cells[3]?.replace(/<[^>]*>/g, '').trim();
              
              if (playerCell && teamCell && injuryCell && playerCell.length > 2) {
                const teamName = normalizeTeamName(teamCell);
                
                const injuryInfo: InjuryInfo = {
                  player: playerCell,
                  team: teamName,
                  injury: injuryCell,
                  status: returnCell?.toLowerCase().includes('return') ? 'probable' : 'out',
                  returnDate: returnCell || undefined,
                  source: 'Transfermarkt',
                  scrapedAt: new Date().toISOString(),
                };
                
                if (!injuries.has(teamName)) {
                  injuries.set(teamName, {
                    team: teamName,
                    sport: 'Foot',
                    injuries: [],
                    lastUpdated: new Date().toISOString(),
                    dataSource: 'real',
                    errors: [],
                  });
                }
                
                injuries.get(teamName)!.injuries.push(injuryInfo);
              }
            }
          } catch (e) {
            // Ignorer erreurs parsing individuelles
          }
        }
        
        // Délai entre les requêtes
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (e: any) {
        const error = createScraperError(
          'unknown',
          `Transfermarkt ${league}`,
          ['football_injuries'],
          e.message
        );
        errors.push(error);
        console.warn(`    ⚠️ Erreur: ${e.message}`);
      }
    }
    
    cachedFootballInjuries = injuries;
    
    if (injuries.size === 0) {
      console.log('⚠️ Aucune blessure Football récupérée');
      if (errors.length > 0) {
        console.log('📋 Raisons:');
        errors.forEach(e => console.log(`   - ${e.source}: ${e.userMessage}`));
      }
    } else {
      console.log(`✅ Football Injuries: ${injuries.size} équipes avec blessures`);
    }
    
    return { injuries, errors };
    
  } catch (error: any) {
    const scraperError = createScraperError(
      'unknown',
      'Transfermarkt',
      ['football_injuries'],
      error.message
    );
    errors.push(scraperError);
    console.error('❌ Erreur scraping Football injuries:', error.message);
    
    return { injuries, errors };
  }
}

/**
 * Récupère les blessures pour une équipe spécifique
 * 
 * AMÉLIORÉ: Retourne maintenant les erreurs et la source des données
 */
export async function getTeamInjuries(
  teamName: string,
  sport: 'Foot' | 'Basket'
): Promise<{
  data: TeamInjuries | null;
  error: ScraperError | null;
  dataSource: 'real' | 'estimated' | 'none';
}> {
  // Vérifier le cache
  const cache = sport === 'Basket' ? cachedNBAInjuries : cachedFootballInjuries;
  
  // Normaliser le nom
  const normalizedName = normalizeTeamName(teamName);
  
  // Chercher dans le cache
  for (const [team, data] of cache) {
    if (team.toLowerCase().includes(normalizedName.toLowerCase()) ||
        normalizedName.toLowerCase().includes(team.toLowerCase())) {
      return { data, error: null, dataSource: data.dataSource };
    }
  }
  
  // Si pas en cache, scraper
  if (sport === 'Basket') {
    const { injuries, errors } = await scrapeNBAInjuries();
    for (const [team, data] of injuries) {
      if (team.toLowerCase().includes(normalizedName.toLowerCase()) ||
          normalizedName.toLowerCase().includes(team.toLowerCase())) {
        return { 
          data, 
          error: errors[0] || null, 
          dataSource: data.dataSource 
        };
      }
    }
    // Aucune donnée trouvée
    return {
      data: null,
      error: createScraperError(
        'not_found',
        'NBA Official',
        ['injuries'],
        `Aucune blessure trouvée pour ${teamName}`
      ),
      dataSource: 'none',
    };
  } else {
    const { injuries, errors } = await scrapeFootballInjuries();
    for (const [team, data] of injuries) {
      if (team.toLowerCase().includes(normalizedName.toLowerCase()) ||
          normalizedName.toLowerCase().includes(team.toLowerCase())) {
        return { 
          data, 
          error: errors[0] || null, 
          dataSource: data.dataSource 
        };
      }
    }
    // Aucune donnée trouvée
    return {
      data: null,
      error: createScraperError(
        'not_found',
        'Transfermarkt',
        ['injuries'],
        `Aucune blessure trouvée pour ${teamName}`
      ),
      dataSource: 'none',
    };
  }
}

/**
 * Récupère toutes les blessures (Foot + NBA)
 * 
 * AMÉLIORÉ: Retourne maintenant les erreurs et statistiques
 */
export async function getAllInjuries(): Promise<{
  football: Map<string, TeamInjuries>;
  nba: Map<string, TeamInjuries>;
  errors: ScraperError[];
  stats: {
    footballTeams: number;
    nbaTeams: number;
    totalErrors: number;
    hasRealData: boolean;
  };
}> {
  const now = Date.now();
  
  // Utiliser le cache si récent
  if ((now - lastScrapeTime) < CACHE_TTL && 
      cachedFootballInjuries.size > 0 && 
      cachedNBAInjuries.size > 0) {
    console.log('📦 Utilisation du cache blessures');
    return {
      football: cachedFootballInjuries,
      nba: cachedNBAInjuries,
      errors: [],
      stats: {
        footballTeams: cachedFootballInjuries.size,
        nbaTeams: cachedNBAInjuries.size,
        totalErrors: 0,
        hasRealData: true,
      },
    };
  }
  
  // Scrape en parallèle
  const [footballResult, nbaResult] = await Promise.all([
    scrapeFootballInjuries(),
    scrapeNBAInjuries(),
  ]);
  
  const allErrors = [...footballResult.errors, ...nbaResult.errors];
  
  lastScrapeTime = now;
  
  return {
    football: footballResult.injuries,
    nba: nbaResult.injuries,
    errors: allErrors,
    stats: {
      footballTeams: footballResult.injuries.size,
      nbaTeams: nbaResult.injuries.size,
      totalErrors: allErrors.length,
      hasRealData: footballResult.injuries.size > 0 || nbaResult.injuries.size > 0,
    },
  };
}

/**
 * Formate les blessures pour l'affichage
 */
export function formatInjuriesForDisplay(teamInjuries: TeamInjuries): string[] {
  const lines: string[] = [];
  
  for (const injury of teamInjuries.injuries) {
    const statusEmoji = injury.status === 'out' ? '❌' : 
                       injury.status === 'doubtful' ? '⚠️' : 
                       injury.status === 'probable' ? '✅' : '🔄';
    
    const returnInfo = injury.returnDate ? ` (Retour: ${injury.returnDate})` : '';
    
    lines.push(`${statusEmoji} ${injury.player} - ${injury.injury}${returnInfo}`);
  }
  
  return lines;
}

/**
 * Calcule l'impact des blessures sur un match
 * 
 * AMÉLIORÉ: Inclut maintenant les erreurs et la source des données
 */
export async function calculateInjuryImpact(
  homeTeam: string,
  awayTeam: string,
  sport: 'Foot' | 'Basket'
): Promise<{
  homeInjuries: number;
  awayInjuries: number;
  impactLevel: 'low' | 'medium' | 'high';
  homeOut: string[];
  awayOut: string[];
  errors: ScraperError[];
  dataQuality: 'real' | 'estimated' | 'none';
}> {
  const result = {
    homeInjuries: 0,
    awayInjuries: 0,
    impactLevel: 'low' as 'low' | 'medium' | 'high',
    homeOut: [] as string[],
    awayOut: [] as string[],
    errors: [] as ScraperError[],
    dataQuality: 'none' as 'real' | 'estimated' | 'none',
  };
  
  try {
    const homeResult = await getTeamInjuries(homeTeam, sport);
    const awayResult = await getTeamInjuries(awayTeam, sport);
    
    // Collecter les erreurs
    if (homeResult.error) result.errors.push(homeResult.error);
    if (awayResult.error) result.errors.push(awayResult.error);
    
    // Déterminer la qualité des données
    if (homeResult.dataSource === 'real' || awayResult.dataSource === 'real') {
      result.dataQuality = 'real';
    } else if (homeResult.dataSource === 'estimated' || awayResult.dataSource === 'estimated') {
      result.dataQuality = 'estimated';
    }
    
    if (homeResult.data) {
      result.homeInjuries = homeResult.data.injuries.length;
      result.homeOut = homeResult.data.injuries
        .filter(i => i.status === 'out')
        .map(i => i.player);
    }
    
    if (awayResult.data) {
      result.awayInjuries = awayResult.data.injuries.length;
      result.awayOut = awayResult.data.injuries
        .filter(i => i.status === 'out')
        .map(i => i.player);
    }
    
    // Calculer l'impact
    const totalOut = result.homeOut.length + result.awayOut.length;
    if (totalOut >= 4) {
      result.impactLevel = 'high';
    } else if (totalOut >= 2) {
      result.impactLevel = 'medium';
    }
    
  } catch (e: any) {
    result.errors.push(createScraperError(
      'unknown',
      'Injury Calculator',
      ['injuries'],
      e.message
    ));
    console.error('Erreur calcul impact blessures:', e);
  }
  
  return result;
}

/**
 * Vide le cache
 */
export function clearInjuryCache(): void {
  cachedFootballInjuries = new Map();
  cachedNBAInjuries = new Map();
  lastScrapeTime = 0;
  console.log('🗑️ Cache blessures vidé');
}

// Export par défaut
const InjuryScraper = {
  scrapeNBAInjuries,
  scrapeFootballInjuries,
  getTeamInjuries,
  getAllInjuries,
  formatInjuriesForDisplay,
  calculateInjuryImpact,
  clearCache: clearInjuryCache,
};

export default InjuryScraper;
