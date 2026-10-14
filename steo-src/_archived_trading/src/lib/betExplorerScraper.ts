/**
 * BetExplorer Scraper - Récupération des VRAIES cotes
 * Source: BetExplorer (scraping via ZAI web-reader)
 * GRATUIT - Pas de quota - Cotes réelles de bookmakers
 */

import ZAI from 'z-ai-web-dev-sdk';

export interface RealOdds {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport: 'Foot' | 'Basket';
  date: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  bookmaker: string;
  scrapedAt: string;
}

// Cache pour éviter les requêtes multiples
let cachedOdds: Map<string, RealOdds[]> = new Map();
let lastScrapeTime = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// URLs BetExplorer
const BETEXPLORER_URLS = {
  football: 'https://www.betexplorer.com/next/soccer/',
  basketball: 'https://www.betexplorer.com/next/basketball/',
  nba: 'https://www.betexplorer.com/basketball/usa/nba/',
  premierLeague: 'https://www.betexplorer.com/soccer/england/premier-league/',
  ligue1: 'https://www.betexplorer.com/soccer/france/ligue-1/',
  liga: 'https://www.betexplorer.com/soccer/spain/laliga/',
  bundesliga: 'https://www.betexplorer.com/soccer/germany/bundesliga/',
  serieA: 'https://www.betexplorer.com/soccer/italy/serie-a/',
};

/**
 * Extrait les cotes depuis le HTML de BetExplorer
 */
function parseOddsFromHTML(html: string, sport: 'Foot' | 'Basket'): RealOdds[] {
  const odds: RealOdds[] = [];
  
  try {
    // Pattern pour les matchs avec cotes
    // Format typique: data-odd="1.50" ou "odds":"1.50"
    const oddsPattern = /data-odd="([0-9.]+)"/g;
    const matchPattern = /class="match[^"]*"[^>]*>([^<]+)<\/a>/g;
    
    // Extraire les lignes de match
    const rows = html.match(/<tr[^>]*class="[^"]*match[^"]*"[^>]*>[\s\S]*?<\/tr>/gi) || [];
    
    for (const row of rows) {
      try {
        // Extraire les noms d'équipes
        const teamMatches = row.matchAll(/class="[^"]*match-part[^"]*"[^>]*>([^<]+)</g);
        const teams: string[] = [];
        for (const match of teamMatches) {
          teams.push(match[1].trim());
        }
        
        if (teams.length < 2) continue;
        
        // Extraire les cotes
        const oddsMatches = row.matchAll(/data-odd="([0-9.]+)"/g);
        const oddsValues: number[] = [];
        for (const match of oddsMatches) {
          oddsValues.push(parseFloat(match[1]));
        }
        
        if (oddsValues.length < 2) continue;
        
        // Créer l'objet cotes
        const odd: RealOdds = {
          matchId: `betexp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          homeTeam: teams[0],
          awayTeam: teams[1],
          league: 'Unknown',
          sport,
          date: new Date().toISOString(),
          oddsHome: oddsValues[0] || 2.0,
          oddsDraw: sport === 'Foot' && oddsValues.length > 2 ? oddsValues[1] : null,
          oddsAway: sport === 'Foot' && oddsValues.length > 2 ? oddsValues[2] : oddsValues[1],
          bookmaker: 'BetExplorer',
          scrapedAt: new Date().toISOString(),
        };
        
        odds.push(odd);
      } catch (e) {
        // Ignorer les erreurs de parsing individuelles
      }
    }
    
    // Alternative: parsing JSON si présent
    const jsonPattern = /"odds"\s*:\s*\[([0-9.,\s]+)\]/g;
    const namePattern = /"name"\s*:\s*"([^"]+)"/g;
    
    // Méthode alternative si la première n'a pas trouvé de matchs
    if (odds.length === 0) {
      const text = html;
      
      // Chercher les patterns de matchs
      const matchLines = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+-\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
      const allOdds = text.match(/[0-9]+\.[0-9]{2}/g) || [];
      
      for (let i = 0; i < matchLines.length && i * 3 < allOdds.length; i++) {
        const parts = matchLines[i].split(' - ');
        if (parts.length === 2) {
          const idx = i * 3;
          odds.push({
            matchId: `betexp_${Date.now()}_${i}`,
            homeTeam: parts[0].trim(),
            awayTeam: parts[1].trim(),
            league: 'Unknown',
            sport,
            date: new Date().toISOString(),
            oddsHome: parseFloat(allOdds[idx]) || 2.0,
            oddsDraw: sport === 'Foot' && allOdds[idx + 1] ? parseFloat(allOdds[idx + 1]) : null,
            oddsAway: parseFloat(allOdds[idx + 2] || allOdds[idx + 1]) || 2.0,
            bookmaker: 'BetExplorer',
            scrapedAt: new Date().toISOString(),
          });
        }
      }
    }
    
  } catch (error) {
    console.error('Erreur parsing HTML BetExplorer:', error);
  }
  
  return odds;
}

/**
 * Scrape les cotes NBA depuis BetExplorer
 */
export async function scrapeNBAOdds(): Promise<RealOdds[]> {
  console.log('🏀 Scraping cotes NBA depuis BetExplorer...');
  
  try {
    const zai = await ZAI.create();
    
    const result = await zai.functions.invoke('page_reader', {
      url: BETEXPLORER_URLS.nba
    });
    
    if (result.code !== 200 || !result.data?.html) {
      console.log('⚠️ Erreur accès BetExplorer NBA');
      return [];
    }
    
    const odds = parseOddsFromHTML(result.data.html, 'Basket');
    console.log(`✅ BetExplorer NBA: ${odds.length} matchs avec cotes`);
    
    return odds;
    
  } catch (error) {
    console.error('Erreur scraping NBA:', error);
    return [];
  }
}

/**
 * Scrape les cotes Football depuis BetExplorer
 */
export async function scrapeFootballOdds(): Promise<RealOdds[]> {
  console.log('⚽ Scraping cotes Football depuis BetExplorer...');
  
  const allOdds: RealOdds[] = [];
  
  try {
    const zai = await ZAI.create();
    
    // Scrape les principales ligues
    const leagues = [
      { url: BETEXPLORER_URLS.premierLeague, name: 'Premier League' },
      { url: BETEXPLORER_URLS.ligue1, name: 'Ligue 1' },
      { url: BETEXPLORER_URLS.liga, name: 'La Liga' },
      { url: BETEXPLORER_URLS.bundesliga, name: 'Bundesliga' },
      { url: BETEXPLORER_URLS.serieA, name: 'Serie A' },
    ];
    
    for (const league of leagues) {
      try {
        const result = await zai.functions.invoke('page_reader', {
          url: league.url
        });
        
        if (result.code === 200 && result.data?.html) {
          const odds = parseOddsFromHTML(result.data.html, 'Foot');
          
          // Assigner la ligue
          for (const odd of odds) {
            odd.league = league.name;
          }
          
          allOdds.push(...odds.slice(0, 5)); // Max 5 par ligue
          console.log(`  📌 ${league.name}: ${odds.length} matchs`);
        }
        
        // Délai entre les requêtes
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (e) {
        console.log(`  ⚠️ ${league.name}: erreur`);
      }
    }
    
    console.log(`✅ BetExplorer Football: ${allOdds.length} matchs avec cotes`);
    return allOdds;
    
  } catch (error) {
    console.error('Erreur scraping Football:', error);
    return [];
  }
}

/**
 * Scrape les cotes des matchs du jour (Football + NBA)
 */
export async function scrapeTodayOdds(): Promise<RealOdds[]> {
  // Vérifier le cache
  const now = Date.now();
  if (cachedOdds.size > 0 && (now - lastScrapeTime) < CACHE_TTL) {
    console.log('📦 Utilisation du cache BetExplorer');
    return Array.from(cachedOdds.values()).flat();
  }
  
  console.log('🔄 Scraping des cotes du jour...');
  
  const [football, nba] = await Promise.all([
    scrapeFootballOdds(),
    scrapeNBAOdds(),
  ]);
  
  const allOdds = [...football, ...nba];
  
  // Mettre en cache
  cachedOdds.clear();
  for (const odd of allOdds) {
    const key = `${odd.homeTeam}_${odd.awayTeam}`;
    cachedOdds.set(key, [odd]);
  }
  lastScrapeTime = now;
  
  console.log(`✅ Total: ${allOdds.length} matchs avec vraies cotes`);
  return allOdds;
}

/**
 * Trouve les cotes pour un match spécifique
 */
export async function findMatchOdds(
  homeTeam: string,
  awayTeam: string,
  sport: 'Foot' | 'Basket'
): Promise<RealOdds | null> {
  // Normaliser les noms
  const normalizeName = (name: string): string => {
    return name.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 8);
  };
  
  const homeNorm = normalizeName(homeTeam);
  const awayNorm = normalizeName(awayTeam);
  
  // Vérifier le cache d'abord
  const cacheKey = `${homeTeam}_${awayTeam}`;
  if (cachedOdds.has(cacheKey)) {
    return cachedOdds.get(cacheKey)![0];
  }
  
  // Chercher dans tous les matchs
  const allOdds = await scrapeTodayOdds();
  
  for (const odd of allOdds) {
    const oddHomeNorm = normalizeName(odd.homeTeam);
    const oddAwayNorm = normalizeName(odd.awayTeam);
    
    if ((oddHomeNorm === homeNorm || homeNorm.includes(oddHomeNorm) || oddHomeNorm.includes(homeNorm)) &&
        (oddAwayNorm === awayNorm || awayNorm.includes(oddAwayNorm) || oddAwayNorm.includes(awayNorm))) {
      return odd;
    }
  }
  
  return null;
}

/**
 * Vide le cache
 */
export function clearBetExplorerCache(): void {
  cachedOdds = new Map();
  lastScrapeTime = 0;
  console.log('🗑️ Cache BetExplorer vidé');
}

// Export par défaut
const BetExplorerScraper = {
  scrapeNBAOdds,
  scrapeFootballOdds,
  scrapeTodayOdds,
  findMatchOdds,
  clearCache: clearBetExplorerCache,
};

export default BetExplorerScraper;
