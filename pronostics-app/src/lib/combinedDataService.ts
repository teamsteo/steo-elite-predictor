/**
 * Service combiné pour les données sportives
 * 
 * Sources:
 * - ESPN API: Matchs, scores, statuts live (GRATUIT, illimité)
 * - The Odds API: Vraies cotes des bookmakers (500 req/mois)
 * 
 * Stratégie: 
 * - ESPN fournit la structure des matchs
 * - The Odds API fournit les cotes réelles (cache intelligent)
 */

import { getMatchesFromCache, fetchAndCacheOdds, findOddsForMatch, getQuotaInfo } from './oddsApiManager';

// Cache pour les matchs ESPN
let espnCache: any[] = [];
let espnCacheTime = 0;
const ESPN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Mapping sports ESPN vers The Odds API
const SPORT_MAPPING: Record<string, string> = {
  'soccer': 'soccer',
  'basketball': 'basketball_nba',
  'nba': 'basketball_nba',
  'hockey': 'icehockey_nhl',
  'nhl': 'icehockey_nhl',
  'football': 'americanfootball_nfl',
  'nfl': 'americanfootball_nfl',
  'tennis': 'tennis',
};

/**
 * Récupère les matchs depuis ESPN avec vraies cotes
 */
export async function getMatchesWithRealOdds(): Promise<any[]> {
  console.log('🔄 Récupération matchs avec cotes réelles...');
  
  // 1. Charger les cotes depuis The Odds API (gestion quota automatique)
  await fetchAndCacheOdds();
  const oddsMatches = getMatchesFromCache();
  const quotaInfo = getQuotaInfo();
  
  console.log(`📊 The Odds API: ${oddsMatches.length} matchs, ${quotaInfo.remaining} requêtes restantes`);
  
  // 2. Récupérer les matchs ESPN (avec cotes DraftKings intégrées)
  const espnMatches = await fetchESPNMatches();
  const espnWithOdds = espnMatches.filter(m => m.hasRealOdds).length;
  console.log(`📺 ESPN: ${espnMatches.length} matchs (${espnWithOdds} avec cotes DraftKings)`);
  
  // 3. Fusionner les données - utiliser ESPN odds comme source principale
  const mergedMatches = espnMatches.map((match: any) => {
    // Si ESPN a déjà des cotes, les utiliser directement
    if (match.hasRealOdds && match.oddsHome > 0) {
      return {
        ...match,
        oddsSource: match.oddsSource || 'ESPN (DraftKings)',
      };
    }
    
    // Sinon, chercher dans The Odds API
    const odds = findOddsForMatch(match.homeTeam, match.awayTeam);
    
    if (odds) {
      return {
        ...match,
        oddsHome: odds.odds.home,
        oddsDraw: odds.odds.draw,
        oddsAway: odds.odds.away,
        bookmaker: odds.bookmaker,
        hasRealOdds: true,
        oddsSource: 'The Odds API',
        oddsCachedAt: odds.cachedAt,
      };
    }
    
    // Pas de cotes - estimation
    return {
      ...match,
      hasRealOdds: false,
      oddsSource: 'Estimation',
    };
  });
  
  // 4. Ajouter les matchs qui sont uniquement dans The Odds API (non présents dans ESPN)
  const espnTeams = new Set(espnMatches.flatMap((m: any) => [normalizeTeam(m.homeTeam), normalizeTeam(m.awayTeam)]));
  
  for (const oddsMatch of oddsMatches) {
    const homeNorm = normalizeTeam(oddsMatch.homeTeam);
    const awayNorm = normalizeTeam(oddsMatch.awayTeam);
    
    if (!espnTeams.has(homeNorm) && !espnTeams.has(awayNorm)) {
      // Match non présent dans ESPN - l'ajouter
      mergedMatches.push({
        id: `odds_${oddsMatch.id}`,
        homeTeam: oddsMatch.homeTeam,
        awayTeam: oddsMatch.awayTeam,
        sport: mapSportKey(oddsMatch.sport),
        league: oddsMatch.league,
        date: oddsMatch.commenceTime,
        oddsHome: oddsMatch.odds.home,
        oddsDraw: oddsMatch.odds.draw,
        oddsAway: oddsMatch.odds.away,
        bookmaker: oddsMatch.bookmaker,
        status: 'upcoming',
        hasRealOdds: true,
        oddsSource: 'The Odds API',
      });
    }
  }
  
  // Stats de qualité
  const realOddsCount = mergedMatches.filter(m => m.hasRealOdds).length;
  console.log(`✅ ${mergedMatches.length} matchs au total (${realOddsCount} avec vraies cotes)`);
  
  return mergedMatches;
}

/**
 * Convertit les cotes américaines en cotes décimales
 */
function americanToDecimal(americanOdds: string | number): number {
  if (!americanOdds) return 0;
  
  const odds = typeof americanOdds === 'string' ? parseFloat(americanOdds.replace('+', '')) : americanOdds;
  
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
 * Extrait les cotes depuis les données ESPN
 */
function extractEspnOdds(event: any): { oddsHome: number; oddsDraw: number | null; oddsAway: number; bookmaker: string } {
  const odds = event.competitions?.[0]?.odds?.[0];
  
  if (!odds) {
    return { oddsHome: 0, oddsDraw: null, oddsAway: 0, bookmaker: 'None' };
  }
  
  const bookmaker = odds.provider?.name || 'ESPN';
  
  // Extraire les cotes moneyline
  const homeOdds = odds.moneyline?.home?.close?.odds || odds.moneyline?.home?.open?.odds;
  const awayOdds = odds.moneyline?.away?.close?.odds || odds.moneyline?.away?.open?.odds;
  const drawOdds = odds.moneyline?.draw?.close?.odds || odds.moneyline?.draw?.open?.odds || odds.drawOdds;
  
  return {
    oddsHome: americanToDecimal(homeOdds),
    oddsDraw: drawOdds ? americanToDecimal(drawOdds) : null,
    oddsAway: americanToDecimal(awayOdds),
    bookmaker,
  };
}

/**
 * Formate une date en format ESPN (YYYYMMDD)
 */
function formatDate(date: Date): string {
  return date.toISOString().split('-').join('').slice(0, 8);
}

/**
 * Récupère les matchs depuis ESPN
 */
async function fetchESPNMatches(): Promise<any[]> {
  const now = Date.now();
  
  // Utiliser le cache si valide
  if (espnCache.length > 0 && (now - espnCacheTime) < ESPN_CACHE_TTL) {
    return espnCache;
  }
  
  const allMatches: any[] = [];
  
  try {
    const today = new Date();
    const todayStr = formatDate(today);
    
    // Récupérer hier, aujourd'hui et demain pour les matchs NBA/NHL de nuit
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatDate(yesterday);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatDate(tomorrow);
    
    // Date de référence pour comparer (sans heure)
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    
    // Sports à récupérer - incluant les compétitions européennes
    const sports = [
      // Sports US
      { key: 'basketball/nba', name: 'NBA' },
      { key: 'hockey/nhl', name: 'NHL' },
      // Ligues nationales
      { key: 'soccer/eng.1', name: 'Premier League' },
      { key: 'soccer/esp.1', name: 'La Liga' },
      { key: 'soccer/ita.1', name: 'Serie A' },
      { key: 'soccer/ger.1', name: 'Bundesliga' },
      { key: 'soccer/fra.1', name: 'Ligue 1' },
      // Compétitions européennes
      { key: 'soccer/uefa.champions', name: 'Champions League' },
      { key: 'soccer/uefa.europa', name: 'Europa League' },
      { key: 'soccer/uefa.europa.conf', name: 'Conference League' },
      // Autres ligues populaires
      { key: 'soccer/ned.1', name: 'Eredivisie' },
      { key: 'soccer/por.1', name: 'Liga Portugal' },
      { key: 'soccer/bel.1', name: 'Jupiler Pro League' },
    ];
    
    // Récupérer les matchs sur 3 jours (hier, aujourd'hui, demain)
    const dateRanges = [
      { date: yesterdayStr, label: 'hier' },
      { date: todayStr, label: 'aujourd\'hui' },
      { date: tomorrowStr, label: 'demain' }
    ];
    
    const results = await Promise.allSettled(
      sports.flatMap(sport => 
        dateRanges.map(dateRange => 
          fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport.key}/scoreboard?dates=${dateRange.date}`)
            .then(r => r.json())
            .then(data => ({ sport: sport.name, data, dateLabel: dateRange.label, dateStr: dateRange.date }))
        )
      )
    );
    
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value?.data?.events) {
        // Déterminer le sport principal (pas le nom de la ligue)
        const sportKey = result.value.data?.sports?.[0]?.slug || '';
        const leagueName = result.value.sport; // Nom de la ligue depuis la config (ex: "Europa League")
        const dateLabel = result.value.dateLabel; // 'hier', 'aujourd\'hui', ou 'demain'
        const dateStr = result.value.dateStr;
        
        // Mapper le sport correctement
        let mainSport = 'Autre';
        if (sportKey.includes('soccer') || sportKey.includes('uefa') ||
            leagueName.includes('League') || leagueName.includes('Liga') || 
            leagueName.includes('Serie') || leagueName.includes('Bundesliga') || 
            leagueName.includes('Ligue 1') || leagueName.includes('Eredivisie') || 
            leagueName.includes('Portugal') || leagueName.includes('Pro League') ||
            leagueName.includes('Champions') || leagueName.includes('Europa') ||
            leagueName.includes('Conference')) {
          mainSport = 'Foot';
        } else if (sportKey.includes('basketball') || leagueName.includes('NBA')) {
          mainSport = 'Basket';
        } else if (sportKey.includes('hockey') || leagueName.includes('NHL')) {
          mainSport = 'NHL';
        } else if (sportKey.includes('americanfootball') || leagueName.includes('NFL')) {
          mainSport = 'NFL';
        } else if (sportKey.includes('tennis')) {
          mainSport = 'Tennis';
        }
        
        for (const event of result.value.data.events) {
          const home = event.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'home');
          const away = event.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'away');
          const statusType = event.status?.type;
          
          const isLive = statusType?.state === 'in';
          const isFinished = statusType?.completed === true;
          
          // Récupérer le nom de la ligue depuis event.competition ou utiliser leagueName
          const eventLeague = event.competition?.name || event.league?.name || leagueName;
          
          // Extraire les cotes depuis ESPN (DraftKings)
          const espnOdds = extractEspnOdds(event);
          
          // Calculer les tags de date pour l'affichage
          const eventDate = new Date(event.date);
          const eventDateStart = new Date(eventDate);
          eventDateStart.setHours(0, 0, 0, 0);
          
          // Déterminer le tag de date basé sur la comparaison avec aujourd'hui
          let dateTag: 'hier' | 'aujourd\'hui' | 'demain';
          let displayDate: string;
          
          if (eventDateStart < todayStart) {
            dateTag = 'hier';
            // Pour les matchs LIVE qui sont datés "hier" (matchs de nuit NBA/NHL)
            displayDate = isLive ? "En cours" : `Hier ${eventDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
          } else if (eventDateStart > todayStart) {
            dateTag = 'demain';
            displayDate = `Demain ${eventDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
          } else {
            dateTag = 'aujourd\'hui';
            displayDate = isLive ? "En cours" : (isFinished ? "Terminé" : "Aujourd'hui");
          }
          
          // Labels spécifiques selon le statut
          let dateLabelDisplay: string;
          if (isLive) {
            dateLabelDisplay = "🔴 EN DIRECT";
          } else if (isFinished) {
            dateLabelDisplay = "Terminé";
          } else if (dateTag === 'hier') {
            dateLabelDisplay = "Match reporté/hier";
          } else if (dateTag === 'demain') {
            dateLabelDisplay = "À venir demain";
          } else {
            dateLabelDisplay = "À venir";
          }
          
          allMatches.push({
            id: `espn_${event.id}`,
            homeTeam: home?.team?.displayName || 'TBD',
            awayTeam: away?.team?.displayName || 'TBD',
            sport: mainSport, // Utiliser le sport mappé (Foot, Basket, etc.)
            league: eventLeague, // Nom de la ligue/compétition
            date: event.date,
            status: isLive ? 'live' : isFinished ? 'finished' : 'upcoming',
            isLive,
            homeScore: home?.score ? parseInt(home.score) : undefined,
            awayScore: away?.score ? parseInt(away.score) : undefined,
            clock: event.status?.displayClock,
            period: event.status?.period,
            homeRecord: home?.records?.[0]?.summary,
            awayRecord: away?.records?.[0]?.summary,
            // Tags de date pour l'affichage
            dateTag,
            dateLabel: dateLabelDisplay,
            displayDate,
            // Ajouter les cotes ESPN
            oddsHome: espnOdds.oddsHome,
            oddsDraw: espnOdds.oddsDraw,
            oddsAway: espnOdds.oddsAway,
            bookmaker: espnOdds.bookmaker,
            hasRealOdds: espnOdds.oddsHome > 0,
            oddsSource: espnOdds.oddsHome > 0 ? `ESPN (${espnOdds.bookmaker})` : 'Estimation',
          });
        }
      }
    }
    
    espnCache = allMatches;
    espnCacheTime = now;
    
  } catch (error) {
    console.error('Erreur ESPN:', error);
  }
  
  return allMatches;
}

/**
 * Normalise un nom d'équipe pour la comparaison
 */
function normalizeTeam(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .substring(0, 8);
}

/**
 * Map les clés sport de The Odds API vers format interne
 */
function mapSportKey(key: string): string {
  if (key.includes('basketball') || key.includes('nba')) return 'NBA';
  if (key.includes('hockey') || key.includes('nhl')) return 'NHL';
  if (key.includes('soccer') || key.includes('football')) return 'Foot';
  if (key.includes('tennis')) return 'Tennis';
  if (key.includes('americanfootball') || key.includes('nfl')) return 'NFL';
  if (key.includes('baseball') || key.includes('mlb')) return 'MLB';
  return 'Autre';
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
    return { home: 0.33, draw: 0.33, away: 0.33, margin: 0 };
  }
  
  const homeProb = 1 / oddsHome;
  const awayProb = 1 / oddsAway;
  const drawProb = oddsDraw ? 1 / oddsDraw : 0;
  
  const total = homeProb + awayProb + drawProb;
  const margin = total - 1; // Marge du bookmaker
  
  return {
    home: Math.round((homeProb / total) * 100),
    draw: Math.round((drawProb / total) * 100),
    away: Math.round((awayProb / total) * 100),
    margin: Math.round(margin * 100),
  };
}

/**
 * Détecte les value bets (cotes mal ajustées)
 */
export function detectValueBets(
  oddsHome: number,
  oddsDraw: number | null,
  oddsAway: number,
  modelProbs: { home: number; draw: number; away: number }
): { detected: boolean; type: string | null; edge: number; explanation: string } {
  
  const impliedProbs = calculateImpliedProbabilities(oddsHome, oddsDraw, oddsAway);
  
  // Comparer les probabilités du modèle avec celles du marché
  const homeEdge = modelProbs.home - impliedProbs.home;
  const drawEdge = modelProbs.draw - impliedProbs.draw;
  const awayEdge = modelProbs.away - impliedProbs.away;
  
  const threshold = 5; // 5% minimum d'edge
  
  if (homeEdge > threshold) {
    return {
      detected: true,
      type: 'home',
      edge: homeEdge,
      explanation: `Value détecté: Modèle estime ${modelProbs.home}% vs marché ${impliedProbs.home}% (edge: +${homeEdge.toFixed(1)}%)`,
    };
  }
  
  if (awayEdge > threshold) {
    return {
      detected: true,
      type: 'away',
      edge: awayEdge,
      explanation: `Value détecté: Modèle estime ${modelProbs.away}% vs marché ${impliedProbs.away}% (edge: +${awayEdge.toFixed(1)}%)`,
    };
  }
  
  if (drawEdge > threshold && oddsDraw) {
    return {
      detected: true,
      type: 'draw',
      edge: drawEdge,
      explanation: `Value détecté sur le nul: ${modelProbs.draw}% vs ${impliedProbs.draw}% (edge: +${drawEdge.toFixed(1)}%)`,
    };
  }
  
  return {
    detected: false,
    type: null,
    edge: 0,
    explanation: 'Pas de value bet détecté',
  };
}

/**
 * Stats publiques pour affichage
 */
export function getDataStats(): {
  matchesWithRealOdds: number;
  matchesWithEstimatedOdds: number;
  quotaRemaining: number;
  lastOddsUpdate: string;
} {
  const oddsMatches = getMatchesFromCache();
  const quotaInfo = getQuotaInfo();
  
  return {
    matchesWithRealOdds: oddsMatches.length,
    matchesWithEstimatedOdds: 0, // Sera calculé dynamiquement
    quotaRemaining: quotaInfo.remaining,
    lastOddsUpdate: quotaInfo.lastUpdate,
  };
}

const combinedDataService = {
  getMatchesWithRealOdds,
  calculateImpliedProbabilities,
  detectValueBets,
  getDataStats,
};

export default combinedDataService;
