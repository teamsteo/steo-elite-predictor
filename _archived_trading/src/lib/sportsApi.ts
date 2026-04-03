/**
 * Service d'intégration multi-sources pour données sportives réelles
 * Sources: The Odds API + SportAPI7 (RapidAPI)
 * 
 * OPTIMISÉ: 15 matchs max/jour avec croisement des sources
 * Validation croisée pour données fiables uniquement
 */

// Constantes de configuration
const MAX_MATCHES_PER_DAY = 15;
const CACHE_DURATION_MINUTES = 30;
const ODDS_TOLERANCE_PERCENT = 5; // Tolérance de 5% pour comparer les cotes

// Types pour les données sportives
export interface RealMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league?: string;
  date: Date;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  status: 'upcoming' | 'live' | 'finished';
  homeScore?: number;
  awayScore?: number;
  bookmaker?: string;
  // Données enrichies
  reliabilityScore?: number; // 0-100%
  sources?: string[];
  homeInjuries?: number;
  awayInjuries?: number;
  homeForm?: string; // ex: "W-W-D-L-W"
  awayForm?: string;
}

export interface ApiProvider {
  name: string;
  baseUrl: string;
  apiKey: string | undefined;
  host?: string;
  enabled: boolean;
}

export interface CrossValidatedMatch {
  match: RealMatch;
  validation: {
    isCrossValidated: boolean;
    sourcesInAgreement: number;
    oddsDifference: number; // Différence moyenne en %
    reliabilityScore: number;
    warnings: string[];
  };
}

// Sports prioritaires (dans l'ordre de préférence)
const PRIORITY_SPORTS = [
  'soccer_epl',           // Premier League
  'soccer_france_ligue_one',
  'soccer_germany_bundesliga',
  'soccer_italy_serie_a',
  'soccer_spain_la_liga',
  'soccer_uefa_champs_league',
  'basketball_nba',
  'icehockey_nhl',
  'soccer_germany_liga3',
  'soccer',
];

// Ligues à requêter spécifiquement pour le croisement
const LEAGUES_TO_FETCH = [
  'soccer_epl',           // Premier League (croisement avec Football-Data)
  'soccer_spain_la_liga',
  'soccer_italy_serie_a', 
  'soccer_germany_bundesliga',
  'soccer_france_ligue_one',
];

// Mapping des sports
const sportMapping: Record<string, string> = {
  'soccer': 'Foot',
  'soccer_france_ligue_one': 'Foot',
  'soccer_england_premier_league': 'Foot',
  'soccer_spain_la_liga': 'Foot',
  'soccer_italy_serie_a': 'Foot',
  'soccer_germany_bundesliga': 'Foot',
  'soccer_uefa_champs_league': 'Foot',
  'basketball': 'NBA',
  'basketball_nba': 'NBA',
  'ice_hockey': 'NHL',
  'icehockey_nhl': 'NHL',
  'icehockey_ahl': 'AHL',
  // SportAPI7 mappings
  'football': 'Foot',
  '1': 'Foot', // Championnat ID courant
  '2': 'Foot',
  '3': 'Foot',
};

// Mapping des bookmakers (priorité aux FR)
const bookmakerPriority = [
  'betclic',
  'winamax',
  'parionssport',
  'pmu',
  'unibet',
  'bwin',
  'bet365',
  'pinnacle',
];

// Configuration des providers
function getProviders(): ApiProvider[] {
  return [
    {
      name: 'the-odds-api',
      baseUrl: 'https://api.the-odds-api.com/v4',
      apiKey: process.env.THE_ODDS_API_KEY,
      enabled: !!process.env.THE_ODDS_API_KEY,
    },
    {
      name: 'sportapi7',
      baseUrl: 'https://sportapi7.p.rapidapi.com/api/v1',
      apiKey: process.env.RAPIDAPI_KEY,
      host: process.env.RAPIDAPI_HOST || 'sportapi7.p.rapidapi.com',
      enabled: !!process.env.RAPIDAPI_KEY,
    },
    {
      name: 'football-data',
      baseUrl: 'https://api.football-data.org/v4',
      apiKey: process.env.FOOTBALL_DATA_API_KEY,
      enabled: !!process.env.FOOTBALL_DATA_API_KEY,
    },
    {
      name: 'api-sports',
      baseUrl: 'https://v3.football.api-sports.io',
      apiKey: process.env.API_SPORTS_KEY,
      enabled: !!process.env.API_SPORTS_KEY,
    },
  ];
}

// Cache simple en mémoire
let cachedMatches: CrossValidatedMatch[] = [];
let lastFetchTime = 0;

/**
 * SOURCE 1: Récupère les matchs depuis The Odds API
 * Priorité aux ligues populaires pour le croisement
 */
async function fetchFromOddsApi(): Promise<RealMatch[]> {
  const providers = getProviders();
  const provider = providers.find(p => p.name === 'the-odds-api');
  
  if (!provider?.enabled || !provider.apiKey) {
    console.log('⚠️ The Odds API non configurée');
    return [];
  }

  try {
    const allMatches: RealMatch[] = [];
    
    // D'abord, récupérer les ligues prioritaires (pour croisement)
    for (const sportKey of LEAGUES_TO_FETCH) {
      try {
        const response = await fetch(
          `${provider.baseUrl}/sports/${sportKey}/odds/?apiKey=${provider.apiKey}&regions=uk,eu&markets=h2h&oddsFormat=decimal&dateFormat=iso`,
          {
            next: { revalidate: CACHE_DURATION_MINUTES * 60 },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const matches = data.map((match: any) => {
            const bestBookmaker = findBestBookmaker(match.bookmakers);
            const odds = extractOdds(bestBookmaker?.markets, match.home_team, match.away_team);

            return {
              id: match.id,
              homeTeam: match.home_team,
              awayTeam: match.away_team,
              sport: 'Foot',
              league: match.sport_title,
              date: new Date(match.commence_time),
              oddsHome: odds?.home || 0,
              oddsDraw: odds?.draw || null,
              oddsAway: odds?.away || 0,
              status: 'upcoming' as const,
              bookmaker: bestBookmaker?.title,
              sources: ['the-odds-api'],
            };
          }).filter((m: RealMatch) => m.oddsHome > 0 && m.oddsAway > 0);
          
          allMatches.push(...matches);
          console.log(`  📌 ${sportKey}: ${matches.length} matchs`);
          
          if (allMatches.length >= MAX_MATCHES_PER_DAY) break;
        }
      } catch (e) {
        console.log(`  ⚠️ ${sportKey}: erreur`);
      }
    }
    
    // Si pas assez de matchs, récupérer tous les sports
    if (allMatches.length < MAX_MATCHES_PER_DAY) {
      const response = await fetch(
        `${provider.baseUrl}/sports/upcoming/odds/?apiKey=${provider.apiKey}&regions=fr,eu&markets=h2h&oddsFormat=decimal&dateFormat=iso`,
        {
          next: { revalidate: CACHE_DURATION_MINUTES * 60 },
        }
      );

      if (response.ok) {
        const data = await response.json();
        
        const additionalMatches = data
          .filter((match: any) => !allMatches.some(m => 
            m.homeTeam === match.home_team && m.awayTeam === match.away_team
          ))
          .map((match: any) => {
            const bestBookmaker = findBestBookmaker(match.bookmakers);
            const odds = extractOdds(bestBookmaker?.markets, match.home_team, match.away_team);

            return {
              id: match.id,
              homeTeam: match.home_team,
              awayTeam: match.away_team,
              sport: sportMapping[match.sport_key] || 'Foot',
              league: match.sport_title,
              date: new Date(match.commence_time),
              oddsHome: odds?.home || 0,
              oddsDraw: odds?.draw || null,
              oddsAway: odds?.away || 0,
              status: 'upcoming' as const,
              bookmaker: bestBookmaker?.title,
              sources: ['the-odds-api'],
            };
          })
          .filter((m: RealMatch) => m.oddsHome > 0 && m.oddsAway > 0);

        allMatches.push(...additionalMatches);
      }
    }

    console.log(`✅ The Odds API: ${allMatches.length} matchs`);
    return allMatches.slice(0, MAX_MATCHES_PER_DAY);
  } catch (error) {
    console.error('Erreur The Odds API:', error);
    return [];
  }
}

/**
 * SOURCE 2: Récupère les matchs depuis SportAPI7 (RapidAPI)
 */
async function fetchFromSportApi7(): Promise<RealMatch[]> {
  const providers = getProviders();
  const provider = providers.find(p => p.name === 'sportapi7');
  
  if (!provider?.enabled || !provider.apiKey) {
    console.log('⚠️ SportAPI7 non configurée');
    return [];
  }

  try {
    // Essayer l'endpoint live
    const response = await fetch(
      `${provider.baseUrl}/football/live`,
      {
        headers: {
          'x-rapidapi-key': provider.apiKey,
          'x-rapidapi-host': provider.host || 'sportapi7.p.rapidapi.com',
        },
        next: { revalidate: CACHE_DURATION_MINUTES * 60 },
      }
    );

    if (!response.ok) {
      // Si pas d'abonnement, essayer football-data.org
      console.log(`⚠️ SportAPI7: Status ${response.status} - Essai Football-Data.org`);
      return await fetchFromFootballData();
    }

    const data = await response.json();
    const matches = parseSportApi7Data(data);
    
    console.log(`✅ SportAPI7: ${matches.length} matchs`);
    return matches;
  } catch (error) {
    console.error('Erreur SportAPI7:', error);
    // Fallback vers Football-Data
    return await fetchFromFootballData();
  }
}

/**
 * SOURCE 3: Récupère les matchs depuis Football-Data.org (gratuit)
 * Note: Le plan gratuit ne fournit pas de cotes, mais permet de confirmer les matchs
 */
async function fetchFromFootballData(): Promise<RealMatch[]> {
  const providers = getProviders();
  const provider = providers.find(p => p.name === 'football-data');
  
  if (!provider?.enabled || !provider.apiKey) {
    console.log('⚠️ Football-Data non configurée');
    return [];
  }

  try {
    const today = new Date();
    const dateFrom = today.toISOString().split('T')[0];
    const dateTo = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const response = await fetch(
      `${provider.baseUrl}/matches?competitions=PL,PD,BL1,SA,FL1,CL&dateFrom=${dateFrom}&dateTo=${dateTo}`,
      {
        headers: {
          'X-Auth-Token': provider.apiKey,
        },
        next: { revalidate: CACHE_DURATION_MINUTES * 60 },
      }
    );

    if (!response.ok) {
      throw new Error(`Football-Data error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.matches || !Array.isArray(data.matches)) {
      return [];
    }

    // Garder les matchs même sans cotes (pour validation croisée)
    const matches = data.matches
      .slice(0, MAX_MATCHES_PER_DAY * 2)
      .map((match: any) => ({
        id: `fd-${match.id}`,
        homeTeam: match.homeTeam?.name || match.homeTeam,
        awayTeam: match.awayTeam?.name || match.awayTeam,
        sport: 'Foot',
        league: match.competition?.name,
        date: new Date(match.utcDate),
        // Les cotes ne sont pas disponibles dans le plan gratuit
        oddsHome: 0,
        oddsDraw: null,
        oddsAway: 0,
        status: match.status === 'IN_PLAY' ? 'live' : 'upcoming',
        sources: ['football-data'],
      }))
      .filter((m: RealMatch) => m.homeTeam && m.awayTeam);

    console.log(`✅ Football-Data: ${matches.length} matchs (pour validation croisée)`);
    return matches;
  } catch (error) {
    console.error('Erreur Football-Data:', error);
    return [];
  }
}

/**
 * SOURCE 4: Récupère les matchs depuis API-Sports
 */
async function fetchFromApiSports(): Promise<RealMatch[]> {
  const providers = getProviders();
  const provider = providers.find(p => p.name === 'api-sports');
  
  if (!provider?.enabled || !provider.apiKey) {
    return [];
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    
    const response = await fetch(
      `${provider.baseUrl}/fixtures?date=${today}`,
      {
        headers: {
          'x-apisports-key': provider.apiKey,
        },
        next: { revalidate: CACHE_DURATION_MINUTES * 60 },
      }
    );

    if (!response.ok) {
      throw new Error(`API-Sports error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.response || !Array.isArray(data.response)) {
      return [];
    }

    return data.response
      .slice(0, MAX_MATCHES_PER_DAY)
      .map((fixture: any) => ({
        id: `as-${fixture.fixture?.id}`,
        homeTeam: fixture.teams?.home?.name,
        awayTeam: fixture.teams?.away?.name,
        sport: 'Foot',
        league: fixture.league?.name,
        date: new Date(fixture.fixture?.date),
        oddsHome: fixture.bookmakers?.[0]?.bets?.[0]?.values?.[0]?.odd || 0,
        oddsDraw: fixture.bookmakers?.[0]?.bets?.[0]?.values?.[1]?.odd || null,
        oddsAway: fixture.bookmakers?.[0]?.bets?.[0]?.values?.[2]?.odd || 0,
        status: fixture.fixture?.status?.short === 'LIVE' ? 'live' : 'upcoming',
        sources: ['api-sports'],
      }))
      .filter((m: RealMatch) => m.homeTeam && m.awayTeam);
  } catch (error) {
    console.error('Erreur API-Sports:', error);
    return [];
  }
}

/**
 * Parse les données SportAPI7 vers notre format
 */
function parseSportApi7Data(data: any): RealMatch[] {
  if (!data || !Array.isArray(data.events) && !Array.isArray(data)) {
    return [];
  }

  const events = data.events || data;
  
  return events
    .slice(0, MAX_MATCHES_PER_DAY)
    .map((event: any) => {
      // Extraire les cotes si disponibles
      const odds = event.odds || event.betOdds || {};
      const homeOdds = odds.home || odds['1'] || event.homeTeam?.odds || 0;
      const drawOdds = odds.draw || odds['X'] || odds['N'] || null;
      const awayOdds = odds.away || odds['2'] || event.awayTeam?.odds || 0;

      return {
        id: event.id || event.matchId || `sport7-${Date.now()}-${Math.random()}`,
        homeTeam: event.homeTeam?.name || event.home || event.homeTeam,
        awayTeam: event.awayTeam?.name || event.away || event.awayTeam,
        sport: 'Foot',
        league: event.league?.name || event.tournament?.name,
        date: new Date(event.startTime || event.date || event.kickoff),
        oddsHome: typeof homeOdds === 'number' ? homeOdds : parseFloat(homeOdds) || 0,
        oddsDraw: drawOdds ? (typeof drawOdds === 'number' ? drawOdds : parseFloat(drawOdds)) : null,
        oddsAway: typeof awayOdds === 'number' ? awayOdds : parseFloat(awayOdds) || 0,
        status: event.status || 'upcoming',
        homeScore: event.homeScore,
        awayScore: event.awayScore,
        sources: ['sportapi7'],
      };
    })
    .filter((m: RealMatch) => m.oddsHome > 0 && m.oddsAway > 0 && m.homeTeam && m.awayTeam);
}

/**
 * CROISEMENT: Valide et fusionne les données des deux sources
 * Amélioré: Supporte la validation sans cotes (confirmation d'existence)
 */
function crossValidateMatches(
  oddsApiMatches: RealMatch[],
  sportApiMatches: RealMatch[]
): CrossValidatedMatch[] {
  const result: CrossValidatedMatch[] = [];
  const processedIds = new Set<string>();

  // Fonction pour normaliser le nom d'équipe (plus permissive)
  const normalizeTeamName = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/fc|afc|united|city|wanderers|hotspur|albion|athletic|footballclub/g, '')
      .substring(0, 6); // Premiers caractères pour matching
  };

  // Fonction pour calculer la similarité des noms (plus permissive)
  const areTeamsMatching = (team1: string, team2: string): boolean => {
    const n1 = normalizeTeamName(team1);
    const n2 = normalizeTeamName(team2);
    const t1 = team1.toLowerCase();
    const t2 = team2.toLowerCase();
    
    // Matching direct
    if (n1 === n2) return true;
    
    // Matching par inclusion
    if (t1.includes(t2) || t2.includes(t1)) return true;
    
    // Matching par mots clés
    const words1 = t1.split(/[\s-]+/).filter(w => w.length > 2);
    const words2 = t2.split(/[\s-]+/).filter(w => w.length > 2);
    const commonWords = words1.filter(w => words2.includes(w));
    if (commonWords.length > 0) return true;
    
    return false;
  };

  // Fonction pour comparer les cotes
  const compareOdds = (odds1: number, odds2: number): number => {
    if (odds1 === 0 || odds2 === 0) return 100;
    return Math.abs((odds1 - odds2) / odds1 * 100);
  };

  // Traiter les matchs de The Odds API
  for (const oddsMatch of oddsApiMatches) {
    const matchId = `${oddsMatch.homeTeam}-${oddsMatch.awayTeam}`;
    if (processedIds.has(matchId)) continue;

    // Chercher un match correspondant dans SportAPI7/Football-Data
    const correspondingMatch = sportApiMatches.find(sportMatch => {
      const homeMatch = areTeamsMatching(oddsMatch.homeTeam, sportMatch.homeTeam);
      const awayMatch = areTeamsMatching(oddsMatch.awayTeam, sportMatch.awayTeam);
      const dateMatch = Math.abs(new Date(oddsMatch.date).getTime() - new Date(sportMatch.date).getTime()) < 86400000; // 24h de tolérance
      
      return homeMatch && awayMatch && dateMatch;
    });

    const warnings: string[] = [];
    let reliabilityScore = 50;
    let sourcesInAgreement = 1;

    if (correspondingMatch) {
      // Match trouvé dans les deux sources - VALIDATION CROISÉE
      sourcesInAgreement = 2;
      
      // Vérifier si on a des cotes à comparer
      const hasOddsInSecondSource = correspondingMatch.oddsHome > 0 && correspondingMatch.oddsAway > 0;
      
      if (hasOddsInSecondSource) {
        // Comparer les cotes
        const homeDiff = compareOdds(oddsMatch.oddsHome, correspondingMatch.oddsHome);
        const awayDiff = compareOdds(oddsMatch.oddsAway, correspondingMatch.oddsAway);
        const avgDiff = (homeDiff + awayDiff) / 2;

        if (avgDiff <= ODDS_TOLERANCE_PERCENT) {
          reliabilityScore = 95 - avgDiff;
        } else if (avgDiff <= 15) {
          reliabilityScore = 80 - avgDiff;
          warnings.push(`Écart de cotes: ${avgDiff.toFixed(1)}%`);
        } else {
          reliabilityScore = 65;
          warnings.push(`Écart important de cotes: ${avgDiff.toFixed(1)}%`);
        }
      } else {
        // Pas de cotes dans la deuxième source, mais match confirmé
        reliabilityScore = 75;
        warnings.push('Match confirmé par 2 sources (cotes non disponibles dans la 2ème source)');
      }

      // Déterminer les sources
      const sourceList = ['the-odds-api'];
      if (correspondingMatch.sources?.includes('football-data')) {
        sourceList.push('football-data');
      } else if (correspondingMatch.sources?.includes('sportapi7')) {
        sourceList.push('sportapi7');
      } else {
        sourceList.push('secondary-api');
      }

      // Fusionner les données
      const fusedMatch: RealMatch = {
        ...oddsMatch,
        sources: sourceList,
        reliabilityScore,
        league: correspondingMatch.league || oddsMatch.league, // Garder la ligue si disponible
      };

      result.push({
        match: fusedMatch,
        validation: {
          isCrossValidated: true,
          sourcesInAgreement,
          oddsDifference: 0,
          reliabilityScore,
          warnings,
        },
      });

      processedIds.add(matchId);
    } else {
      // Match uniquement dans The Odds API
      warnings.push('Match validé par une seule source (The Odds API)');
      
      result.push({
        match: { ...oddsMatch, reliabilityScore: 50, sources: ['the-odds-api'] },
        validation: {
          isCrossValidated: false,
          sourcesInAgreement: 1,
          oddsDifference: 0,
          reliabilityScore: 50,
          warnings,
        },
      });

      processedIds.add(matchId);
    }
  }

  // Ajouter les matchs uniquement dans la source secondaire (non trouvés dans Odds API)
  for (const sportMatch of sportApiMatches) {
    const matchId = `${sportMatch.homeTeam}-${sportMatch.awayTeam}`;
    if (processedIds.has(matchId)) continue;
    
    // Ne pas ajouter les matchs sans cotes
    if (sportMatch.oddsHome === 0 || sportMatch.oddsAway === 0) continue;

    result.push({
      match: { ...sportMatch, reliabilityScore: 40, sources: sportMatch.sources || ['secondary-api'] },
      validation: {
        isCrossValidated: false,
        sourcesInAgreement: 1,
        oddsDifference: 0,
        reliabilityScore: 40,
        warnings: ['Match validé par une seule source secondaire'],
      },
    });

    processedIds.add(matchId);
  }

  // Trier par score de fiabilité décroissant
  result.sort((a, b) => b.validation.reliabilityScore - a.validation.reliabilityScore);

  // Limiter au nombre max de matchs
  return result.slice(0, MAX_MATCHES_PER_DAY);
}

/**
 * Trouve le meilleur bookmaker disponible (priorité FR)
 */
function findBestBookmaker(bookmakers: any[]): any | null {
  if (!bookmakers || bookmakers.length === 0) return null;

  for (const preferred of bookmakerPriority) {
    const found = bookmakers.find(b => 
      b.key?.toLowerCase().includes(preferred) || 
      b.title?.toLowerCase().includes(preferred)
    );
    if (found) return found;
  }

  return bookmakers[0];
}

/**
 * Extrait les cotes depuis les marchés
 */
function extractOdds(markets: any[], homeTeam?: string, awayTeam?: string): { home: number; draw: number | null; away: number } | null {
  if (!markets || markets.length === 0) return null;

  const h2h = markets.find(m => m.key === 'h2h');
  if (!h2h || !h2h.outcomes) return null;

  let home: number | undefined, draw: number | undefined, away: number | undefined;
  
  for (const outcome of h2h.outcomes) {
    const name = outcome.name?.toLowerCase() || '';
    if (name === 'draw' || name === 'x' || name === 'nul') {
      draw = outcome.price;
    } else if (homeTeam && name.includes(homeTeam.toLowerCase().split(' ')[0])) {
      home = outcome.price;
    } else if (awayTeam && name.includes(awayTeam.toLowerCase().split(' ')[0])) {
      away = outcome.price;
    } else if (!home) {
      home = outcome.price;
    } else if (!away) {
      away = outcome.price;
    }
  }

  if (!home || !away) return null;

  return {
    home: typeof home === 'number' ? home : parseFloat(home),
    draw: draw ? (typeof draw === 'number' ? draw : parseFloat(draw)) : null,
    away: typeof away === 'number' ? away : parseFloat(away),
  };
}

/**
 * Fonction principale pour récupérer toutes les données (avec cache)
 */
export async function fetchAllRealMatches(): Promise<RealMatch[]> {
  const providers = getProviders();
  const enabledProviders = providers.filter(p => p.enabled);

  if (enabledProviders.length === 0) {
    console.log('⚠️ Aucune API configurée');
    return [];
  }

  // Vérifier le cache
  const now = Date.now();
  if (cachedMatches.length > 0 && (now - lastFetchTime) < CACHE_DURATION_MINUTES * 60 * 1000) {
    console.log('📦 Utilisation du cache');
    return cachedMatches.map(cm => cm.match);
  }

  // Récupérer les données de toutes les sources en parallèle
  const [oddsApiMatches, sportApiMatches, footballDataMatches] = await Promise.all([
    fetchFromOddsApi(),
    fetchFromSportApi7(),
    fetchFromFootballData(),
  ]);

  // Combiner les sources secondaires pour le croisement
  const secondaryMatches = [...sportApiMatches, ...footballDataMatches];

  // Croiser et valider les données
  const validatedMatches = crossValidateMatches(oddsApiMatches, secondaryMatches);

  // Mettre à jour le cache
  cachedMatches = validatedMatches;
  lastFetchTime = now;

  // Statistiques
  const crossValidated = validatedMatches.filter(cm => cm.validation.isCrossValidated).length;
  const avgReliability = validatedMatches.reduce((sum, cm) => sum + cm.validation.reliabilityScore, 0) / validatedMatches.length;

  console.log(`✅ ${validatedMatches.length} matchs validés (${crossValidated} croisés, fiabilité moyenne: ${avgReliability.toFixed(0)}%)`);
  
  return validatedMatches.map(cm => cm.match);
}

/**
 * Récupère les matchs avec détails de validation
 */
export async function fetchMatchesWithValidation(): Promise<CrossValidatedMatch[]> {
  const providers = getProviders();
  const enabledProviders = providers.filter(p => p.enabled);

  if (enabledProviders.length === 0) {
    return [];
  }

  const now = Date.now();
  if (cachedMatches.length > 0 && (now - lastFetchTime) < CACHE_DURATION_MINUTES * 60 * 1000) {
    return cachedMatches;
  }

  // Récupérer les données de toutes les sources en parallèle
  const [oddsApiMatches, sportApiMatches, footballDataMatches] = await Promise.all([
    fetchFromOddsApi(),
    fetchFromSportApi7(),
    fetchFromFootballData(),
  ]);

  // Combiner les sources secondaires pour le croisement
  const secondaryMatches = [...sportApiMatches, ...footballDataMatches];

  const validatedMatches = crossValidateMatches(oddsApiMatches, secondaryMatches);

  cachedMatches = validatedMatches;
  lastFetchTime = now;

  return validatedMatches;
}

/**
 * Force le rafraîchissement des données
 */
export async function forceRefresh(): Promise<RealMatch[]> {
  cachedMatches = [];
  lastFetchTime = 0;
  return fetchAllRealMatches();
}

/**
 * Vérifie si les APIs sont configurées
 */
export function getApiStatus(): { provider: string; enabled: boolean }[] {
  return getProviders().map(p => ({
    provider: p.name,
    enabled: p.enabled,
  }));
}

/**
 * Retourne les statistiques du quota
 */
export function getQuotaInfo() {
  return {
    maxMatchesPerDay: MAX_MATCHES_PER_DAY,
    cacheDurationMinutes: CACHE_DURATION_MINUTES,
    monthlyQuota: 500,
    estimatedDailyUsage: 2, // 2 requêtes par refresh (1 par source)
    daysPossible: 250, // ~8 mois avec 2 req/jour
    sources: getProviders().filter(p => p.enabled).map(p => p.name),
  };
}

/**
 * Génère un résumé des cotes pour l'affichage
 */
export function formatOddsForDisplay(match: RealMatch): string {
  const parts = [match.oddsHome?.toFixed(2) || '0.00'];
  if (match.oddsDraw != null && typeof match.oddsDraw === 'number') {
    parts.push(match.oddsDraw.toFixed(2));
  }
  parts.push(match.oddsAway?.toFixed(2) || '0.00');
  return parts.join(' | ');
}

const sportsApiService = {
  fetchAllRealMatches,
  fetchMatchesWithValidation,
  forceRefresh,
  getApiStatus,
  getQuotaInfo,
  formatOddsForDisplay,
};

export default sportsApiService;
