/**
 * Service combiné pour les données sportives
 * 
 * SOURCE PRINCIPALE: ESPN API (GRATUIT, ILLIMITÉ)
 * - Fournit les matchs, scores, statuts live
 * - Fournit les cotes DraftKings (gratuit)
 * 
 * The Odds API n'est PLUS utilisé (quota limité)
 */

// Cache pour les matchs ESPN
let espnCache: any[] = [];
let espnCacheTime = 0;
let espnCacheDate = '';
const ESPN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Convertit les cotes américaines en cotes décimales
 */
function americanToDecimal(americanOdds: string | number | undefined): number {
  if (!americanOdds) return 0;
  
  const odds = typeof americanOdds === 'string' 
    ? parseFloat(americanOdds.replace('+', '')) 
    : americanOdds;
  
  if (isNaN(odds) || odds === 0) return 0;
  
  if (odds > 0) {
    // Positive odds: profit = odds/100, decimal = 1 + odds/100
    return Math.round((1 + odds / 100) * 100) / 100;
  } else {
    // Negative odds: risk = |odds| to win 100, decimal = 1 + 100/|odds|
    return Math.round((1 + 100 / Math.abs(odds)) * 100) / 100;
  }
}

/**
 * Extrait les cotes depuis les données ESPN (DraftKings)
 */
function extractEspnOdds(event: any): { oddsHome: number; oddsDraw: number | null; oddsAway: number; bookmaker: string } {
  const competition = event.competitions?.[0];
  const odds = competition?.odds?.[0];
  
  if (!odds) {
    return { oddsHome: 0, oddsDraw: null, oddsAway: 0, bookmaker: 'None' };
  }
  
  const bookmaker = odds.provider?.name || odds.provider || 'DraftKings';
  
  // Format ESPN: odds peuvent être en format américain ou décimal
  // moneyline format
  let homeOdds = odds.homeTeamOdds?.moneyLine || odds.moneyline?.home?.close?.odds || odds.moneyline?.home?.open?.odds || odds.homeOdds;
  let awayOdds = odds.awayTeamOdds?.moneyLine || odds.moneyline?.away?.close?.odds || odds.moneyline?.away?.open?.odds || odds.awayOdds;
  let drawOdds = odds.drawOdds || odds.moneyline?.draw?.close?.odds || odds.moneyline?.draw?.open?.odds || null;
  
  // Si les cotes sont au format américain (entier), les convertir
  if (homeOdds && Math.abs(homeOdds) > 2) {
    homeOdds = americanToDecimal(homeOdds);
  }
  if (awayOdds && Math.abs(awayOdds) > 2) {
    awayOdds = americanToDecimal(awayOdds);
  }
  if (drawOdds && Math.abs(drawOdds) > 2) {
    drawOdds = americanToDecimal(drawOdds);
  }
  
  return {
    oddsHome: homeOdds || 0,
    oddsDraw: drawOdds || null,
    oddsAway: awayOdds || 0,
    bookmaker: bookmaker,
  };
}

/**
 * Récupère les matchs depuis ESPN (GRATUIT)
 */
export async function getMatchesWithRealOdds(): Promise<any[]> {
  console.log('🔄 Récupération matchs depuis ESPN (GRATUIT)...');
  
  const now = Date.now();
  const today = new Date().toDateString();
  
  // Invalider le cache si le jour a changé
  if (espnCacheDate && espnCacheDate !== today) {
    console.log('🔄 Nouveau jour détecté - Invalidation du cache');
    espnCache = [];
    espnCacheTime = 0;
  }
  
  // Utiliser le cache si valide
  if (espnCache.length > 0 && (now - espnCacheTime) < ESPN_CACHE_TTL) {
    console.log(`📦 Cache ESPN valide (${espnCache.length} matchs)`);
    return espnCache;
  }
  
  const allMatches: any[] = [];
  
  try {
    const today = new Date().toISOString().split('-').join('').slice(0, 8);
    
    // Sports à récupérer - ESPN couvre tout gratuitement
    const sports = [
      // Sports US
      { key: 'basketball/nba', name: 'NBA', sport: 'Basket' },
      { key: 'hockey/nhl', name: 'NHL', sport: 'NHL' },
      // Ligues nationales européennes
      { key: 'soccer/eng.1', name: 'Premier League', sport: 'Foot' },
      { key: 'soccer/esp.1', name: 'La Liga', sport: 'Foot' },
      { key: 'soccer/ita.1', name: 'Serie A', sport: 'Foot' },
      { key: 'soccer/ger.1', name: 'Bundesliga', sport: 'Foot' },
      { key: 'soccer/fra.1', name: 'Ligue 1', sport: 'Foot' },
      // Compétitions européennes
      { key: 'soccer/uefa.champions', name: 'Champions League', sport: 'Foot' },
      { key: 'soccer/uefa.europa', name: 'Europa League', sport: 'Foot' },
      { key: 'soccer/uefa.europa.conf', name: 'Conference League', sport: 'Foot' },
      // Autres ligues
      { key: 'soccer/ned.1', name: 'Eredivisie', sport: 'Foot' },
      { key: 'soccer/por.1', name: 'Liga Portugal', sport: 'Foot' },
      { key: 'soccer/bel.1', name: 'Jupiler Pro League', sport: 'Foot' },
      { key: 'soccer/tur.1', name: 'Süper Lig', sport: 'Foot' },
    ];
    
    const results = await Promise.allSettled(
      sports.map(sport => 
        fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport.key}/scoreboard?dates=${today}`)
          .then(r => r.json())
          .then(data => ({ sport: sport.name, mainSport: sport.sport, data }))
          .catch(e => ({ sport: sport.name, mainSport: sport.sport, data: null, error: e }))
      )
    );
    
    let matchesWithOdds = 0;
    
    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value?.data?.events) continue;
      
      const leagueName = result.value.sport;
      const mainSport = result.value.mainSport;
      
      for (const event of result.value.data.events) {
        const competition = event.competitions?.[0];
        const home = competition?.competitors?.find((c: any) => c.homeAway === 'home');
        const away = competition?.competitors?.find((c: any) => c.homeAway === 'away');
        const statusType = event.status?.type;
        
        const isLive = statusType?.state === 'in';
        const isFinished = statusType?.completed === true;
        
        // Récupérer les cotes ESPN (DraftKings)
        const espnOdds = extractEspnOdds(event);
        
        if (espnOdds.oddsHome > 0) {
          matchesWithOdds++;
        }
        
        allMatches.push({
          id: `espn_${event.id}`,
          homeTeam: home?.team?.displayName || home?.team?.shortDisplayName || 'TBD',
          awayTeam: away?.team?.displayName || away?.team?.shortDisplayName || 'TBD',
          sport: mainSport,
          league: event.competition?.name || event.league?.name || leagueName,
          date: event.date,
          status: isLive ? 'live' : isFinished ? 'finished' : 'upcoming',
          isLive,
          homeScore: home?.score ? parseInt(home.score) : undefined,
          awayScore: away?.score ? parseInt(away.score) : undefined,
          clock: event.status?.displayClock,
          period: event.status?.period,
          homeRecord: home?.records?.[0]?.summary,
          awayRecord: away?.records?.[0]?.summary,
          // Cotes ESPN (DraftKings)
          oddsHome: espnOdds.oddsHome || estimateOdds(home?.team?.displayName, away?.team?.displayName, 'home'),
          oddsDraw: espnOdds.oddsDraw,
          oddsAway: espnOdds.oddsAway || estimateOdds(home?.team?.displayName, away?.team?.displayName, 'away'),
          bookmaker: espnOdds.bookmaker,
          hasRealOdds: espnOdds.oddsHome > 0,
          oddsSource: espnOdds.oddsHome > 0 ? `ESPN (${espnOdds.bookmaker})` : 'Estimation',
        });
      }
    }
    
    // Filtrer pour ne garder que les matchs d'aujourd'hui, à venir et en cours
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    
    // Also include matches from the next 24 hours
    const tomorrowEnd = new Date();
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
    tomorrowEnd.setHours(23, 59, 59, 999);
    
    const filteredMatches = allMatches.filter(match => {
      const matchDate = new Date(match.date);
      // Garder les matchs d'aujourd'hui (live ou à venir)
      if (matchDate >= todayStart && matchDate <= todayEnd) return true;
      // Garder les matchs à venir dans les prochaines 24h
      if (matchDate > todayEnd && matchDate <= tomorrowEnd) return true;
      // Garder les matchs en cours (même s'ils ont commencé hier)
      if (match.isLive) return true;
      return false;
    });
    
    // If no matches found, return all matches (fallback)
    const finalMatches = filteredMatches.length > 0 ? filteredMatches : allMatches;
    
    espnCache = finalMatches;
    espnCacheTime = now;
    espnCacheDate = today;
    
    console.log(`✅ ESPN: ${allMatches.length} matchs (${matchesWithOdds} avec cotes DraftKings) - GRATUIT ET ILLIMITÉ`);
    
  } catch (error) {
    console.error('Erreur ESPN:', error);
  }
  
  return espnCache;
}

/**
 * Estime les cotes basées sur le niveau des équipes
 */
function estimateOdds(homeTeam: string | undefined, awayTeam: string | undefined, type: 'home' | 'away'): number {
  // Équipes favorites connues
  const topTeams = [
    // Football
    'Real Madrid', 'Barcelona', 'Manchester City', 'Liverpool', 'Bayern Munich', 'PSG', 'Paris Saint-Germain',
    'Chelsea', 'Arsenal', 'Inter', 'AC Milan', 'Juventus', 'Napoli', 'Borussia Dortmund', 'Atletico Madrid',
    'Tottenham', 'Manchester United', 'RB Leipzig', 'Benfica', 'Porto', 'Ajax',
    // NBA
    'Celtics', 'Lakers', 'Warriors', 'Nuggets', 'Bucks', 'Suns', 'Heat', '76ers',
    // NHL
    'Bruins', 'Rangers', 'Oilers', 'Avalanche', 'Hurricanes', 'Maple Leafs',
  ];
  
  const homeIsTop = homeTeam && topTeams.some(t => homeTeam.toLowerCase().includes(t.toLowerCase()));
  const awayIsTop = awayTeam && topTeams.some(t => awayTeam.toLowerCase().includes(t.toLowerCase()));
  
  if (type === 'home') {
    if (homeIsTop && !awayIsTop) return 1.65;
    if (!homeIsTop && awayIsTop) return 3.80;
    if (homeIsTop && awayIsTop) return 2.30;
    return 2.50;
  } else {
    if (!homeIsTop && awayIsTop) return 1.75;
    if (homeIsTop && !awayIsTop) return 4.50;
    if (homeIsTop && awayIsTop) return 3.00;
    return 2.80;
  }
}

/**
 * Calcule les probabilités implicites depuis les cotes
 */
export function calculateImpliedProbabilities(oddsHome: number, oddsDraw: number | null, oddsAway: number): {
  home: number;
  draw: number;
  away: number;
  margin: number;
} {
  if (!oddsHome || !oddsAway || oddsHome <= 1 || oddsAway <= 1) {
    return { home: 33, draw: 34, away: 33, margin: 0 };
  }
  
  const homeProb = 1 / oddsHome;
  const awayProb = 1 / oddsAway;
  const drawProb = oddsDraw ? 1 / oddsDraw : 0.28;
  
  const total = homeProb + awayProb + drawProb;
  const margin = total - 1;
  
  return {
    home: Math.round((homeProb / total) * 100),
    draw: Math.round((drawProb / total) * 100),
    away: Math.round((awayProb / total) * 100),
    margin: Math.round(margin * 100),
  };
}

/**
 * Détecte les value bets
 */
export function detectValueBets(
  oddsHome: number,
  oddsDraw: number | null,
  oddsAway: number,
  modelProbs: { home: number; draw: number; away: number }
): { detected: boolean; type: string | null; edge: number; explanation: string } {
  
  const impliedProbs = calculateImpliedProbabilities(oddsHome, oddsDraw, oddsAway);
  
  const homeEdge = modelProbs.home - impliedProbs.home;
  const awayEdge = modelProbs.away - impliedProbs.away;
  
  const threshold = 5;
  
  if (homeEdge > threshold) {
    return {
      detected: true,
      type: 'home',
      edge: homeEdge,
      explanation: `Value: Modèle ${modelProbs.home}% vs Marché ${impliedProbs.home}% (+${homeEdge.toFixed(1)}%)`,
    };
  }
  
  if (awayEdge > threshold) {
    return {
      detected: true,
      type: 'away',
      edge: awayEdge,
      explanation: `Value: Modèle ${modelProbs.away}% vs Marché ${impliedProbs.away}% (+${awayEdge.toFixed(1)}%)`,
    };
  }
  
  return { detected: false, type: null, edge: 0, explanation: 'Pas de value bet' };
}

/**
 * Stats publiques
 */
export function getDataStats(): {
  matchesWithRealOdds: number;
  matchesWithEstimatedOdds: number;
  quotaRemaining: number;
  lastOddsUpdate: string;
} {
  const matchesWithOdds = espnCache.filter(m => m.hasRealOdds).length;
  
  return {
    matchesWithRealOdds: matchesWithOdds,
    matchesWithEstimatedOdds: espnCache.length - matchesWithOdds,
    quotaRemaining: 999, // ESPN est illimité
    lastOddsUpdate: new Date(espnCacheTime).toISOString(),
  };
}

const combinedDataService = {
  getMatchesWithRealOdds,
  calculateImpliedProbabilities,
  detectValueBets,
  getDataStats,
};

export default combinedDataService;
