/**
 * Service combiné pour les données sportives
 * 
 * CASCADE DE COTES (automatique):
 * 1. ESPN (DraftKings) - GRATUIT ILLIMITÉ
 * 2. The Odds API - Fallback si ESPN sans cotes
 * 3. Estimations - Dernier recours (avec tag ⚠️)
 */

// Configuration The Odds API (fallback)
const ODDS_API_KEY = process.env.THE_ODDS_API_KEY || 'fcf0d3cbc8958a44007b0520751f8431';
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

// Cache pour les matchs ESPN
let espnCache: any[] = [];
let espnCacheTime = 0;
let espnCacheDate = '';
let oddsApiCache: Map<string, { home: number; draw: number | null; away: number }> | null = null;
const ESPN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * 📅 Obtient la date UTC actuelle au format YYYYMMDD
 * IMPORTANT: Utilise UTC pour éviter les problèmes de timezone sur Vercel
 */
function getUTCDateString(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * 📅 Obtient la date UTC d'hier au format YYYYMMDD
 */
function getYesterdayUTCString(): string {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * 📅 Obtient la date UTC de demain au format YYYYMMDD
 */
function getTomorrowUTCString(): string {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow.toISOString().slice(0, 10).replace(/-/g, '');
}

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
  // moneyline format - Attention: drawOdds peut être un objet avec moneyLine
  let homeOdds = odds.homeTeamOdds?.moneyLine || odds.moneyline?.home?.close?.odds || odds.moneyline?.home?.open?.odds || odds.homeOdds;
  let awayOdds = odds.awayTeamOdds?.moneyLine || odds.moneyline?.away?.close?.odds || odds.moneyline?.away?.open?.odds || odds.awayOdds;
  // drawOdds est souvent un objet ESPN avec { moneyLine: number, link: {...} }
  let drawOdds = odds.drawOdds?.moneyLine || odds.drawOdds || odds.moneyline?.draw?.close?.odds || odds.moneyline?.draw?.open?.odds || null;
  
  // S'assurer que drawOdds est un nombre (pas un objet)
  if (typeof drawOdds !== 'number') {
    drawOdds = null;
  }
  
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
 * FALLBACK: Récupère les cotes depuis The Odds API
 * ⚠️ DÉSACTIVÉ - Utilise trop de quota
 * ESPN est gratuit et couvre la plupart des sports
 * Le tennis utilise le quota manager via live-data-service
 */
async function fetchOddsApiFallback(): Promise<Map<string, { home: number; draw: number | null; away: number }>> {
  const oddsMap = new Map<string, { home: number; draw: number | null; away: number }>();
  
  // ⚠️ NE PLUS UTILISER - Trop coûteux en quota
  // ESPN fournit les cotes gratuitement pour les sports principaux
  console.log('📡 Odds API fallback désactivé (économie quota)');
  console.log('📡 Utilisation des cotes ESPN (gratuit) ou estimations');
  
  return oddsMap;
}

/**
 * Trouve les cotes Odds API pour un match (matching flexible)
 */
function findOddsApiMatch(
  homeTeam: string,
  awayTeam: string,
  oddsApiMap: Map<string, { home: number; draw: number | null; away: number }>
): { home: number; draw: number | null; away: number } | null {
  // Essayer plusieurs variantes de clés
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '').replace(/^(fc|afc|united|city)/, '');
  
  const keys = [
    `${homeTeam.toLowerCase()}_${awayTeam.toLowerCase()}`,
    `${awayTeam.toLowerCase()}_${homeTeam.toLowerCase()}`,
    `${normalize(homeTeam)}_${normalize(awayTeam)}`,
    `${normalize(awayTeam)}_${normalize(homeTeam)}`,
  ];
  
  for (const key of keys) {
    const odds = oddsApiMap.get(key);
    if (odds) return odds;
  }
  
  // Recherche par inclusion de mots
  for (const [key, odds] of oddsApiMap.entries()) {
    const [apiHome, apiAway] = key.split('_');
    if (
      (homeTeam.toLowerCase().includes(apiHome) || apiHome.includes(homeTeam.toLowerCase().split(' ')[0])) &&
      (awayTeam.toLowerCase().includes(apiAway) || apiAway.includes(awayTeam.toLowerCase().split(' ')[0]))
    ) {
      return odds;
    }
  }
  
  return null;
}

/**
 * Récupère les matchs depuis ESPN (GRATUIT) avec fallback The Odds API
 */
export async function getMatchesWithRealOdds(): Promise<any[]> {
  console.log('🔄 Récupération matchs (ESPN → Odds API → Estimations)...');
  
  const now = Date.now();
  const todayUTC = getUTCDateString();
  
  // 📅 TOUJOURS invalider le cache si le jour a changé
  // IMPORTANT: Comparer en UTC pour éviter les problèmes de timezone
  if (espnCacheDate && espnCacheDate !== todayUTC) {
    console.log(`🔄 NOUVEAU JOUR DÉTECTÉ - Invalidation du cache`);
    console.log(`   Cache date: ${espnCacheDate} | Aujourd'hui: ${todayUTC}`);
    espnCache = [];
    espnCacheTime = 0;
    espnCacheDate = '';
    oddsApiCache = null;
  }
  
  // Utiliser le cache si valide (même jour ET pas expiré)
  if (espnCache.length > 0 && espnCacheDate === todayUTC && (now - espnCacheTime) < ESPN_CACHE_TTL) {
    console.log(`📦 Cache ESPN valide (${espnCache.length} matchs) - TTL: ${Math.round((ESPN_CACHE_TTL - (now - espnCacheTime)) / 1000)}s restantes`);
    return espnCache;
  }
  
  const allMatches: any[] = [];
  
  try {
    // 📅 Utiliser les dates UTC pour éviter les problèmes de timezone
    const todayStr = getUTCDateString();
    const yesterdayStr = getYesterdayUTCString();
    const tomorrowStr = getTomorrowUTCString();
    
    console.log(`📅 Dates de recherche (UTC): Hier=${yesterdayStr}, Aujourd'hui=${todayStr}, Demain=${tomorrowStr}`);
    
    // 🎯 ÉTAPE 1: Préparer le fallback The Odds API en parallèle
    const oddsApiMapPromise = fetchOddsApiFallback();
    
    // Sports à récupérer - ESPN couvre tout gratuitement
    const sports = [
      // Sports US
      { key: 'basketball/nba', name: 'NBA', sport: 'Basket' },
      { key: 'hockey/nhl', name: 'NHL', sport: 'NHL' },
      { key: 'baseball/mlb', name: 'MLB', sport: 'Baseball' }, // ⚾ MLB actif en juin
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
      // 🌍 COMPÉTITIONS INTERNATIONALES - Qualifications Coupe du Monde
      { key: 'soccer/fifa.worldq.uefa', name: 'Éliminatoires Mondial Europe', sport: 'Foot', isInternational: true },
      { key: 'soccer/fifa.worldq.conmebol', name: 'Éliminatoires Mondial Amérique Sud', sport: 'Foot', isInternational: true },
      { key: 'soccer/fifa.worldq.concacaf', name: 'Éliminatoires Mondial Amérique Nord', sport: 'Foot', isInternational: true },
      { key: 'soccer/fifa.worldq.afc', name: 'Éliminatoires Mondial Asie', sport: 'Foot', isInternational: true },
      { key: 'soccer/fifa.worldq.caf', name: 'Éliminatoires Mondial Afrique', sport: 'Foot', isInternational: true },
      // 🌍 Autres compétitions internationales
      { key: 'soccer/uefa.nations', name: 'Nations League', sport: 'Foot', isInternational: true },
      { key: 'soccer/uefa.euro', name: 'Euro', sport: 'Foot', isInternational: true },
      { key: 'soccer/fifa.world', name: 'Coupe du Monde', sport: 'Foot', isInternational: true },
      // 🇺🇸 MLS (actif en été)
      { key: 'soccer/usa.1', name: 'MLS', sport: 'Foot' },
    ];
    
    // 🎯 ÉTAPE 2: Récupérer ESPN pour hier, aujourd'hui ET demain
    // Hier = pour les matchs NBA/NHL de nuit encore en cours
    const fetchPromises: Promise<any>[] = [];
    for (const sport of sports) {
      // Hier (pour matchs de nuit encore en cours)
      fetchPromises.push(
        fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport.key}/scoreboard?dates=${yesterdayStr}`)
          .then(r => r.json())
          .then(data => ({ sport: sport.name, mainSport: sport.sport, isInternational: sport.isInternational || false, data, dateType: 'yesterday' }))
          .catch(e => ({ sport: sport.name, mainSport: sport.sport, isInternational: sport.isInternational || false, data: null, error: e }))
      );
      // Aujourd'hui
      fetchPromises.push(
        fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport.key}/scoreboard?dates=${todayStr}`)
          .then(r => r.json())
          .then(data => ({ sport: sport.name, mainSport: sport.sport, isInternational: sport.isInternational || false, data, dateType: 'today' }))
          .catch(e => ({ sport: sport.name, mainSport: sport.sport, isInternational: sport.isInternational || false, data: null, error: e }))
      );
      // Demain
      fetchPromises.push(
        fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport.key}/scoreboard?dates=${tomorrowStr}`)
          .then(r => r.json())
          .then(data => ({ sport: sport.name, mainSport: sport.sport, isInternational: sport.isInternational || false, data, dateType: 'tomorrow' }))
          .catch(e => ({ sport: sport.name, mainSport: sport.sport, isInternational: sport.isInternational || false, data: null, error: e }))
      );
    }
    
    const [oddsApiMap, ...espnResults] = await Promise.all([
      oddsApiMapPromise,
      ...fetchPromises
    ]);
    
    // Stats
    let espnOddsCount = 0;
    let oddsApiFallbackCount = 0;
    let estimatedCount = 0;
    
    for (const result of espnResults) {
      if (!result?.data?.events) continue;
      
      const leagueName = result.sport;
      const mainSport = result.mainSport;
      const isInternational = result.isInternational || false;
      
      for (const event of result.data.events) {
        const competition = event.competitions?.[0];
        const home = competition?.competitors?.find((c: any) => c.homeAway === 'home');
        const away = competition?.competitors?.find((c: any) => c.homeAway === 'away');
        const statusType = event.status?.type;
        
        const homeTeam = home?.team?.displayName || home?.team?.shortDisplayName || 'TBD';
        const awayTeam = away?.team?.displayName || away?.team?.shortDisplayName || 'TBD';
        
        const isLive = statusType?.state === 'in';
        const isFinished = statusType?.completed === true;
        
        // 🎯 CASCADE DE COTES
        // 1. ESPN (DraftKings)
        const espnOdds = extractEspnOdds(event);
        
        let oddsHome = espnOdds.oddsHome;
        let oddsDraw = espnOdds.oddsDraw;
        let oddsAway = espnOdds.oddsAway;
        let bookmaker = espnOdds.bookmaker;
        let hasRealOdds = espnOdds.oddsHome > 0 && espnOdds.oddsAway > 0;
        let oddsSource: 'espn-draftkings' | 'the-odds-api' | 'estimation' = 'espn-draftkings';
        let isEstimated = false;
        
        if (hasRealOdds) {
          espnOddsCount++;
        }
        
        // 2. FALLBACK: The Odds API si ESPN sans cotes
        if (!hasRealOdds) {
          const oddsApiOdds = findOddsApiMatch(homeTeam, awayTeam, oddsApiMap);
          if (oddsApiOdds && oddsApiOdds.home > 0 && oddsApiOdds.away > 0) {
            oddsHome = oddsApiOdds.home;
            oddsDraw = oddsApiOdds.draw;
            oddsAway = oddsApiOdds.away;
            bookmaker = 'The Odds API';
            hasRealOdds = true;
            oddsSource = 'the-odds-api';
            oddsApiFallbackCount++;
          }
        }
        
        // 3. FALLBACK: Estimation si toujours pas de cotes
        if (!hasRealOdds) {
          const estimated = estimateOdds(homeTeam, awayTeam, 'home' as any);
          oddsHome = estimated;
          oddsAway = estimateOdds(homeTeam, awayTeam, 'away' as any);
          bookmaker = 'Estimation';
          oddsSource = 'estimation';
          isEstimated = true;
          estimatedCount++;
        }
        
        // 🎯 Calculer le risque et la prédiction à partir des cotes
        const homeProb = oddsHome > 0 ? Math.round((1 / oddsHome) * 100) : 50;
        const awayProb = oddsAway > 0 ? Math.round((1 / oddsAway) * 100) : 50;
        const favoriteProb = Math.max(homeProb, awayProb);
        const riskPercentage = 100 - favoriteProb;
        const predictedResult = homeProb > awayProb ? 'home' : 'away';
        const winProbability = favoriteProb;
        const confidence = favoriteProb >= 70 ? 'high' : favoriteProb >= 55 ? 'medium' : 'low';
        const recommendation = homeProb > awayProb ? homeTeam : awayTeam;

        allMatches.push({
          id: `espn_${event.id}`,
          homeTeam,
          awayTeam,
          sport: mainSport,
          league: event.competition?.name || event.league?.name || leagueName,
          date: event.date,
          status: isLive ? 'live' : isFinished ? 'finished' : 'upcoming',
          isLive,
          isFinished,
          homeScore: home?.score ? parseInt(home.score) : undefined,
          awayScore: away?.score ? parseInt(away.score) : undefined,
          clock: event.status?.displayClock,
          period: event.status?.period,
          homeRecord: home?.records?.[0]?.summary,
          awayRecord: away?.records?.[0]?.summary,
          // 🎯 Cotes avec cascade (ESPN → Odds API → Estimation)
          oddsHome,
          oddsDraw,
          oddsAway,
          bookmaker,
          hasRealOdds,
          oddsSource,
          isEstimated, // ⚠️ Tag pour identifier les cotes fictives
          // 🌍 Flag pour matchs internationaux (confiance réduite)
          isInternational,
          competitionType: isInternational ? 'international' : 'domestic' as 'international' | 'domestic',
          // 🎯 Prédiction calculée depuis les cotes
          riskPercentage,
          winProbability,
          predictedResult,
          confidence,
          recommendation,
        });
      }
    }
    
    // Filtrer pour garder UNIQUEMENT les matchs à venir d'aujourd'hui
    // ⚠️ Les matchs terminés ne doivent PAS être publiés comme pronostics
    // ⚠️ Les matchs de DEMAIN sont exclus des publications quotidiennes
    // 📅 Utiliser UTC pour la comparaison de dates
    const currentTime = new Date();
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    // 🕐 Heure limite pour les matchs d'hier (24h maximum)
    const yesterdayLimit = new Date(currentTime);
    yesterdayLimit.setUTCHours(yesterdayLimit.getUTCHours() - 24);

    // Bornes de demain (pour EXCLURE)
    const tomorrowExclude = new Date();
    tomorrowExclude.setUTCDate(tomorrowExclude.getUTCDate() + 1);
    tomorrowExclude.setUTCHours(0, 0, 0, 0);

    const filteredMatches = allMatches.filter(match => {
      const matchDate = new Date(match.date);

      // 🚫 EXCLURE les matchs terminés
      if (match.isFinished) {
        console.log(`🚫 Match terminé exclu: ${match.homeTeam} vs ${match.awayTeam}`);
        return false;
      }

      // 🚫 EXCLURE les matchs de plus de 24h
      if (matchDate < yesterdayLimit) {
        console.log(`🚫 Match trop vieux exclu: ${match.homeTeam} vs ${match.awayTeam}`);
        return false;
      }

      // 🚫 EXCLURE les matchs de DEMAIN — ils auront leur propre publication
      if (matchDate >= tomorrowExclude) {
        return false;
      }

      // Garder les matchs en cours (live)
      if (match.isLive) return true;

      // Garder les matchs à venir d'aujourd'hui ou d'hier (nuit US)
      if (matchDate >= yesterdayLimit && matchDate > currentTime) return true;
      // Garder aussi les matchs pas encore commencés d'aujourd'hui
      if (matchDate >= todayStart && matchDate <= currentTime) return true;

      return false;
    });

    // ⚠️ DÉDOUBLONNER par noms d'équipes (les double-headers MLB peuvent créer des doublons)
    // Garder le premier match trouvé (généralement le premier jeu du double-header)
    const seenTeams = new Set<string>();
    const dedupedMatches = filteredMatches.filter(match => {
      const key = [match.homeTeam, match.awayTeam].sort().join('|');
      if (seenTeams.has(key)) return false;
      seenTeams.add(key);
      return true;
    });

    // Ajouter un tag de date (hier, aujourd'hui, demain) pour l'affichage
    // 📅 Utiliser UTC pour la comparaison
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setUTCHours(23, 59, 59, 999);

    // Fonction pour déterminer le tag de date
    const getDateTag = (matchDate: Date, isLive: boolean, isFinished: boolean): {
      dateTag: 'hier' | 'aujourd\'hui' | 'demain';
      dateLabel: string;
      displayDate: string;
    } => {
      if (matchDate >= todayStart && matchDate < tomorrowStart) {
        // Aujourd'hui
        if (isLive) {
          return { dateTag: 'aujourd\'hui', dateLabel: '🔴 En cours', displayDate: 'Aujourd\'hui' };
        }
        if (isFinished) {
          return { dateTag: 'aujourd\'hui', dateLabel: '✅ Terminé', displayDate: 'Aujourd\'hui' };
        }
        return { dateTag: 'aujourd\'hui', dateLabel: '⏳ À venir', displayDate: 'Aujourd\'hui' };
      } else if (matchDate >= yesterdayStart && matchDate < todayStart) {
        // Hier (matchs de nuit encore en cours ou récemment terminés)
        if (isLive) {
          return { dateTag: 'hier', dateLabel: '🔴 En cours (nuit)', displayDate: 'Hier' };
        }
        if (isFinished) {
          return { dateTag: 'hier', dateLabel: '✅ Terminé', displayDate: 'Hier' };
        }
        return { dateTag: 'hier', dateLabel: '⏳ À venir', displayDate: 'Hier' };
      } else if (matchDate >= tomorrowStart && matchDate <= tomorrowEnd) {
        // Demain
        return { dateTag: 'demain', dateLabel: '📅 Demain', displayDate: 'Demain' };
      }
      // Par défaut
      return { dateTag: 'aujourd\'hui', dateLabel: '⏳ À venir', displayDate: 'Aujourd\'hui' };
    };

    // Enrichir chaque match avec le tag de date
    const finalMatches = dedupedMatches.map(match => {
      const matchDate = new Date(match.date);
      const dateInfo = getDateTag(matchDate, match.isLive, match.isFinished);
      return {
        ...match,
        dateTag: dateInfo.dateTag,
        dateLabel: dateInfo.dateLabel,
        displayDate: dateInfo.displayDate,
      };
    });

    // ⚠️ TOUJOURS mettre à jour le cache, même si vide
    espnCache = finalMatches;
    espnCacheTime = now;
    espnCacheDate = todayUTC; // 📅 Stocker en format UTC
    
    console.log(`📅 Date du cache (UTC): ${espnCacheDate}`);
    console.log(`✅ Total: ${finalMatches.length} matchs (ESPN: ${espnOddsCount}, Odds API: ${oddsApiFallbackCount}, Estimés: ${estimatedCount})`);
    
  } catch (error) {
    console.error('Erreur ESPN:', error);
  }
  
  return espnCache;
}

/**
 * Estime les cotes basées sur le niveau des équipes
 */
function estimateOdds(homeTeam: string | undefined, awayTeam: string | undefined, type: 'home' | 'away'): number {
  // Équipes favorites connues - Clubs
  const topClubTeams = [
    // Football
    'Real Madrid', 'Barcelona', 'Manchester City', 'Liverpool', 'Bayern Munich', 'PSG', 'Paris Saint-Germain',
    'Chelsea', 'Arsenal', 'Inter', 'AC Milan', 'Juventus', 'Napoli', 'Borussia Dortmund', 'Atletico Madrid',
    'Tottenham', 'Manchester United', 'RB Leipzig', 'Benfica', 'Porto', 'Ajax',
    // NBA
    'Celtics', 'Lakers', 'Warriors', 'Nuggets', 'Bucks', 'Suns', 'Heat', '76ers',
    // NHL
    'Bruins', 'Rangers', 'Oilers', 'Avalanche', 'Hurricanes', 'Maple Leafs',
  ];
  
  // 🌍 Équipes nationales favorites
  const topNationalTeams = [
    // Europe - Top
    'France', 'England', 'Germany', 'Spain', 'Portugal', 'Netherlands', 'Italy', 'Belgium',
    // Europe - Niveau 2
    'Croatia', 'Switzerland', 'Denmark', 'Austria', 'Ukraine', 'Poland', 'Czech Republic', 'Czechia',
    'Turkey', 'Türkiye', 'Sweden', 'Norway', 'Serbia', 'Hungary', 'Scotland', 'Romania',
    // Amérique du Sud
    'Argentina', 'Brazil', 'Uruguay', 'Colombia', 'Chile', 'Ecuador',
    // Amérique du Nord
    'USA', 'Mexico', 'Canada',
    // Afrique
    'Morocco', 'Senegal', 'Egypt', 'Nigeria', 'Algeria', 'Ivory Coast',
    // Asie
    'Japan', 'South Korea', 'Australia', 'Iran',
  ];
  
  // Équipes faibles (pour ajuster les cotes)
  const weakNationalTeams = [
    'San Marino', 'Andorra', 'Liechtenstein', 'Faroe Islands', 'Gibraltar', 'Malta', 'Luxembourg',
    'Moldova', 'Kazakhstan', 'Cyprus', 'Belarus', 'Armenia', 'Azerbaijan', 'Latvia',
  ];
  
  const homeIsTopClub = homeTeam && topClubTeams.some(t => homeTeam.toLowerCase().includes(t.toLowerCase()));
  const awayIsTopClub = awayTeam && topClubTeams.some(t => awayTeam.toLowerCase().includes(t.toLowerCase()));
  const homeIsTopNational = homeTeam && topNationalTeams.some(t => homeTeam.toLowerCase().includes(t.toLowerCase()));
  const awayIsTopNational = awayTeam && topNationalTeams.some(t => awayTeam.toLowerCase().includes(t.toLowerCase()));
  const homeIsWeak = homeTeam && weakNationalTeams.some(t => homeTeam.toLowerCase().includes(t.toLowerCase()));
  const awayIsWeak = awayTeam && weakNationalTeams.some(t => awayTeam.toLowerCase().includes(t.toLowerCase()));
  
  // Ajustement spécial pour équipes nationales
  const homeIsTop = homeIsTopClub || homeIsTopNational;
  const awayIsTop = awayIsTopClub || awayIsTopNational;
  
  if (type === 'home') {
    // Équipe à domicile forte vs équipe faible
    if (homeIsTop && awayIsWeak) return 1.25;
    if (homeIsTop && !awayIsTop) return 1.65;
    if (!homeIsTop && awayIsWeak) return 1.80;
    if (!homeIsTop && awayIsTop) return 3.80;
    if (homeIsTop && awayIsTop) return 2.30;
    return 2.50;
  } else {
    // Équipe à l'extérieur forte vs équipe faible à domicile
    if (!homeIsTop && awayIsTop) return 1.75;
    if (homeIsWeak && awayIsTop) return 1.40;
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
