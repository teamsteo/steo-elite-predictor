/**
 * BetExplorer Service - Récupération des cotes réelles
 * Source: BetExplorer (scraping via ZAI SDK)
 * GRATUIT - Pas de quota - VRAIES COTES
 */

import ZAI from 'z-ai-web-dev-sdk';

export interface BetExplorerMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  bookmaker: string;
  source: 'real' | 'fallback';
}

interface ScrapedMatch {
  home: string;
  away: string;
  league: string;
  date: string;
  odds1: number;
  oddsX: number | null;
  odds2: number;
}

// Cache pour éviter les requêtes multiples
let cachedOdds: Map<string, BetExplorerMatch[]> = new Map();
let lastFetchTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

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
  championsLeague: 'https://www.betexplorer.com/soccer/europe/champions-league/',
};

// Mapping des noms de ligues vers URLs
const LEAGUE_URL_MAP: Record<string, string> = {
  'Premier League': BETEXPLORER_URLS.premierLeague,
  'La Liga': BETEXPLORER_URLS.liga,
  'Bundesliga': BETEXPLORER_URLS.bundesliga,
  'Serie A': BETEXPLORER_URLS.serieA,
  'Ligue 1': BETEXPLORER_URLS.ligue1,
  'Ligue des Champions': BETEXPLORER_URLS.championsLeague,
  'Champions League': BETEXPLORER_URLS.championsLeague,
  'NBA': BETEXPLORER_URLS.nba,
};

/**
 * Scrape les VRAIES cotes depuis BetExplorer via ZAI SDK
 * CECI UTILISE LES VRAIES COTES DES BOOKMAKERS
 */
async function scrapeRealOddsFromBetExplorer(league: string): Promise<BetExplorerMatch[]> {
  const results: BetExplorerMatch[] = [];
  
  try {
    const zai = await ZAI.create();
    const url = LEAGUE_URL_MAP[league] || BETEXPLORER_URLS.football;
    
    console.log(`🔍 Scraping BetExplorer: ${url}`);
    
    const result = await zai.functions.invoke('page_reader', {
      url
    });
    
    if (result.code !== 200 || !result.data?.html) {
      console.log(`⚠️ BetExplorer inaccessible pour ${league}`);
      return [];
    }
    
    const html = result.data.html;
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    
    // Parser les matchs et cotes
    // Pattern: Match avec cotes décimales (ex: "1.45 4.20 6.50")
    const matchPattern = /([A-Za-z][A-Za-z\s]+?)\s+-\s+([A-Za-z][A-Za-z\s]+?)(?:\s+(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+\.\d{2}))/g;
    
    let match;
    while ((match = matchPattern.exec(text)) !== null) {
      const homeTeam = match[1].trim();
      const awayTeam = match[2].trim();
      const oddsHome = parseFloat(match[3]);
      const oddsDraw = parseFloat(match[4]);
      const oddsAway = parseFloat(match[5]);
      
      // Validation des cotes
      if (oddsHome >= 1.01 && oddsHome <= 50 && oddsAway >= 1.01 && oddsAway <= 50) {
        results.push({
          id: `betexp_real_${homeTeam}_${awayTeam}_${Date.now()}`,
          homeTeam,
          awayTeam,
          league,
          date: new Date().toISOString(),
          oddsHome,
          oddsDraw: oddsDraw >= 1.01 && oddsDraw <= 50 ? oddsDraw : null,
          oddsAway,
          bookmaker: 'BetExplorer (Réel)',
          source: 'real'
        });
      }
    }
    
    console.log(`✅ BetExplorer ${league}: ${results.length} matchs avec VRAIES cotes`);
    
  } catch (error) {
    console.error(`❌ Erreur scraping BetExplorer ${league}:`, error);
  }
  
  return results;
}

/**
 * Fallback: génère des cotes réalistes basées sur la force des équipes
 * Utilisé UNIQUEMENT quand BetExplorer n'est pas accessible
 */
function generateRealisticOdds(homeTeam: string, awayTeam: string, league: string): BetExplorerMatch {
  // Base de données des équipes avec leurs forces relatives
  const teamStrength: Record<string, number> = {
    // Premier League
    'Liverpool': 95,
    'Arsenal': 92,
    'Manchester City': 94,
    'Chelsea': 85,
    'Manchester United': 82,
    'Tottenham': 80,
    'Newcastle': 78,
    'Brighton': 75,
    'Aston Villa': 76,
    'West Ham': 72,
    // La Liga
    'Real Madrid': 96,
    'Barcelona': 94,
    'Atletico Madrid': 88,
    'Real Sociedad': 80,
    'Athletic Bilbao': 78,
    'Villarreal': 76,
    // Serie A
    'Inter Milan': 93,
    'Napoli': 90,
    'AC Milan': 86,
    'Juventus': 87,
    'Atalanta': 85,
    'Roma': 78,
    // Bundesliga
    'Bayern Munich': 95,
    'Bayer Leverkusen': 92,
    'RB Leipzig': 85,
    'Borussia Dortmund': 86,
    'Stuttgart': 78,
    // Ligue 1
    'Paris Saint-Germain': 93,
    'Monaco': 82,
    'Marseille': 80,
    'Lille': 78,
    'Lyon': 75,
    'Nice': 76,
    'Lens': 77,
    // NBA
    'Boston Celtics': 95,
    'Oklahoma City Thunder': 94,
    'Denver Nuggets': 92,
    'Cleveland Cavaliers': 91,
    'Milwaukee Bucks': 88,
    'Minnesota Timberwolves': 87,
    'LA Clippers': 84,
    'New York Knicks': 83,
    'Phoenix Suns': 82,
    'Dallas Mavericks': 81,
    'Golden State Warriors': 80,
    'Los Angeles Lakers': 79,
    'Miami Heat': 78,
  };

  // Normaliser les noms d'équipes
  const normalizeName = (name: string): string => {
    const parts = name.toLowerCase().split(' ');
    for (const part of parts) {
      for (const [team, strength] of Object.entries(teamStrength)) {
        if (team.toLowerCase().includes(part) || part.includes(team.toLowerCase().split(' ')[0])) {
          return team;
        }
      }
    }
    return name;
  };

  const homeKey = normalizeName(homeTeam);
  const awayKey = normalizeName(awayTeam);
  
  const homeStrength = teamStrength[homeKey] || 70;
  const awayStrength = teamStrength[awayKey] || 70;

  // Calcul des probabilités basées sur la force
  const homeAdvantage = 5; // Avantage à domicile
  const adjustedHome = homeStrength + homeAdvantage;
  const totalStrength = adjustedHome + awayStrength;
  
  const homeProb = adjustedHome / totalStrength;
  const awayProb = awayStrength / totalStrength;
  const drawProb = 0.28 - Math.abs(homeProb - 0.5) * 0.3;

  // Convertir en cotes décimales
  const oddsHome = Math.round((1 / homeProb) * 100) / 100;
  const oddsAway = Math.round((1 / awayProb) * 100) / 100;
  const oddsDraw = drawProb > 0.1 ? Math.round((1 / drawProb) * 100) / 100 : null;

  return {
    id: `betexp_${homeTeam}_${awayTeam}_${Date.now()}`,
    homeTeam,
    awayTeam,
    league,
    date: new Date().toISOString(),
    oddsHome: Math.max(1.01, Math.min(15, oddsHome)),
    oddsDraw: oddsDraw ? Math.max(2.5, Math.min(6, oddsDraw)) : null,
    oddsAway: Math.max(1.01, Math.min(15, oddsAway)),
    bookmaker: 'BetExplorer (Estimation)',
    source: 'fallback' as const,
  };
}

/**
 * Récupère les cotes depuis BetExplorer - AVEC VRAIES COTES EN PRIORITÉ
 */
export async function fetchBetExplorerOdds(
  matches: Array<{ homeTeam: string; awayTeam: string; league: string; date: string }>
): Promise<BetExplorerMatch[]> {
  
  console.log(`📊 Récupération VRAIES cotes pour ${matches.length} matchs...`);

  // Vérifier le cache
  const now = Date.now();
  if (cachedOdds.size > 0 && (now - lastFetchTime) < CACHE_TTL) {
    console.log('📦 Utilisation du cache cotes');
    return Array.from(cachedOdds.values()).flat();
  }

  const results: BetExplorerMatch[] = [];
  
  // D'abord essayer de récupérer les VRAIES cotes par ligue
  const uniqueLeagues = [...new Set(matches.map(m => m.league))];
  const realOddsByLeague = new Map<string, BetExplorerMatch[]>();
  
  // Scrape en parallèle toutes les ligues
  const scrapePromises = uniqueLeagues.map(async (league) => {
    const realOdds = await scrapeRealOddsFromBetExplorer(league);
    return { league, realOdds };
  });
  
  const scrapeResults = await Promise.all(scrapePromises);
  
  for (const { league, realOdds } of scrapeResults) {
    realOddsByLeague.set(league, realOdds);
  }
  
  // Maintenant associer les cotes aux matchs demandés
  for (const match of matches) {
    // Chercher les vraies cotes d'abord
    const leagueOdds = realOddsByLeague.get(match.league) || [];
    const realMatch = leagueOdds.find(o => 
      (o.homeTeam.toLowerCase().includes(match.homeTeam.toLowerCase()) ||
       match.homeTeam.toLowerCase().includes(o.homeTeam.toLowerCase())) &&
      (o.awayTeam.toLowerCase().includes(match.awayTeam.toLowerCase()) ||
       match.awayTeam.toLowerCase().includes(o.awayTeam.toLowerCase()))
    );
    
    if (realMatch && realMatch.source === 'real') {
      // Utiliser les VRAIES cotes scrapées
      realMatch.date = match.date;
      results.push(realMatch);
      console.log(`✅ VRAIES cotes pour ${match.homeTeam} vs ${match.awayTeam}: ${realMatch.oddsHome}/${realMatch.oddsDraw || '-'}/${realMatch.oddsAway}`);
    } else {
      // Fallback: cotes estimées (uniquement si impossible d'avoir les vraies)
      const fallbackOdds = generateRealisticOdds(match.homeTeam, match.awayTeam, match.league);
      fallbackOdds.date = match.date;
      fallbackOdds.source = 'fallback';
      results.push(fallbackOdds);
      console.log(`⚠️ Cotes estimées pour ${match.homeTeam} vs ${match.awayTeam} (pas de données réelles)`);
    }
    
    cachedOdds.set(`${match.homeTeam}_${match.awayTeam}`, [results[results.length - 1]]);
  }

  lastFetchTime = now;

  // Compter les sources
  const realCount = results.filter(r => r.source === 'real').length;
  const fallbackCount = results.filter(r => r.source === 'fallback').length;
  console.log(`✅ Cotes: ${realCount} RÉELLES + ${fallbackCount} estimées`);
  
  return results;
}

/**
 * Récupère les cotes pour un match spécifique - VRAIES COTES EN PRIORITÉ
 */
export async function getMatchOdds(
  homeTeam: string,
  awayTeam: string,
  league: string
): Promise<{ oddsHome: number; oddsDraw: number | null; oddsAway: number; source: string } | null> {
  
  // D'abord chercher dans le cache
  const cacheKey = `${homeTeam}_${awayTeam}`;
  const cached = cachedOdds.get(cacheKey);
  if (cached && cached[0]) {
    return {
      oddsHome: cached[0].oddsHome,
      oddsDraw: cached[0].oddsDraw,
      oddsAway: cached[0].oddsAway,
      source: cached[0].source || 'cache'
    };
  }
  
  // Essayer de scraper les vraies cotes
  try {
    const realOdds = await scrapeRealOddsFromBetExplorer(league);
    const match = realOdds.find(o =>
      (o.homeTeam.toLowerCase().includes(homeTeam.toLowerCase()) ||
       homeTeam.toLowerCase().includes(o.homeTeam.toLowerCase())) &&
      (o.awayTeam.toLowerCase().includes(awayTeam.toLowerCase()) ||
       awayTeam.toLowerCase().includes(o.awayTeam.toLowerCase()))
    );
    
    if (match) {
      return {
        oddsHome: match.oddsHome,
        oddsDraw: match.oddsDraw,
        oddsAway: match.oddsAway,
        source: 'real'
      };
    }
  } catch (error) {
    console.log('⚠️ Impossible de récupérer vraies cotes, utilisation fallback');
  }
  
  // Fallback
  const odds = generateRealisticOdds(homeTeam, awayTeam, league);
  
  return {
    oddsHome: odds.oddsHome,
    oddsDraw: odds.oddsDraw,
    oddsAway: odds.oddsAway,
    source: 'fallback'
  };
}

/**
 * Vide le cache
 */
export function clearOddsCache(): void {
  cachedOdds = new Map();
  lastFetchTime = 0;
  console.log('🗑️ Cache cotes vidé');
}
