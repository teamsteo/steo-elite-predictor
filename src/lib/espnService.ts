/**
 * ESPN Service - Récupération des matchs réels
 * Source: ESPN APIs (gratuites)
 * - NBA: site.api.espn.com/apis/site/v2/sports/basketball/nba/
 * - Football: site.api.espn.com/apis/site/v2/sports/soccer/
 */

export interface ESPNMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport: string;
  date: string;
  homeScore?: number;
  awayScore?: number;
  status: 'upcoming' | 'live' | 'finished';
  isLive?: boolean;
  clock?: string;
  period?: number;
  // Drapeau pour matchs internationaux
  isInternational?: boolean;
  competitionType?: 'domestic' | 'european' | 'international' | 'friendly';
}

interface ESPNEvent {
  id: string;
  date: string;
  name: string;
  shortName: string;
  status: {
    type: {
      state: string;
      name: string;
      completed: boolean;
    };
    period?: number;
    displayClock?: string;
  };
  competitions: Array<{
    competitors: Array<{
      homeAway: string;
      score: string;
      team: {
        id: string;
        displayName: string;
        abbreviation: string;
      };
    }>;
  }>;
  league?: {
    name: string;
  };
}

/**
 * Récupère les matchs NBA depuis ESPN
 */
export async function fetchESPNNBAGames(): Promise<ESPNMatch[]> {
  console.log('🏀 Récupération matchs NBA (ESPN)...');
  
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0].replace(/-/g, '');
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0].replace(/-/g, '');

    const response = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${todayStr}-${tomorrowStr}`,
      { next: { revalidate: 60 } }
    );

    if (!response.ok) {
      console.log(`⚠️ ESPN NBA error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const events: ESPNEvent[] = data.events || [];

    const matches: ESPNMatch[] = events.map((event) => {
      const competition = event.competitions?.[0];
      const homeCompetitor = competition?.competitors?.find(c => c.homeAway === 'home');
      const awayCompetitor = competition?.competitors?.find(c => c.homeAway === 'away');

      const isLive = event.status?.type?.state === 'in';
      const isFinished = event.status?.type?.completed;

      return {
        id: `espn_nba_${event.id}`,
        homeTeam: homeCompetitor?.team?.displayName || 'Unknown',
        awayTeam: awayCompetitor?.team?.displayName || 'Unknown',
        league: 'NBA',
        sport: 'Basket',
        date: event.date,
        homeScore: homeCompetitor?.score ? parseInt(homeCompetitor.score) : undefined,
        awayScore: awayCompetitor?.score ? parseInt(awayCompetitor.score) : undefined,
        status: (isLive ? 'live' : isFinished ? 'finished' : 'upcoming') as 'live' | 'finished' | 'upcoming',
        isLive,
        clock: isLive ? event.status?.displayClock : undefined,
        period: isLive ? event.status?.period : undefined,
      };
    });

    console.log(`✅ ESPN NBA: ${matches.length} matchs`);
    return matches;

  } catch (error) {
    console.error('Erreur ESPN NBA:', error);
    return [];
  }
}

/**
 * Récupère les matchs de Football depuis ESPN
 * Inclut: ligues nationales, compétitions européennes ET matchs internationaux
 */
export async function fetchESPNFootballGames(): Promise<ESPNMatch[]> {
  console.log('⚽ Récupération matchs Football (ESPN)...');
  
  try {
    // Ligues disponibles sur ESPN (codes vérifiés)
    // Type explicite pour permettre 'domestic' | 'european' | 'international' | 'friendly'
    const leagues: Array<{ key: string; name: string; type: 'domestic' | 'european' | 'international' | 'friendly' }> = [
      // Ligues nationales
      { key: 'eng.1', name: 'Premier League', type: 'domestic' },
      { key: 'esp.1', name: 'La Liga', type: 'domestic' },
      { key: 'ger.1', name: 'Bundesliga', type: 'domestic' },
      { key: 'ita.1', name: 'Serie A', type: 'domestic' },
      { key: 'fra.1', name: 'Ligue 1', type: 'domestic' },
      // Compétitions européennes
      { key: 'uefa.champions', name: 'Champions League', type: 'european' },
      { key: 'uefa.europa', name: 'Europa League', type: 'european' },
      { key: 'uefa.europa.conf', name: 'Conference League', type: 'european' },
      // 🌍 COMPÉTITIONS INTERNATIONALES (codes ESPN validés)
      { key: 'fifa.world', name: 'Coupe du Monde', type: 'international' },
      { key: 'uefa.nations', name: 'Nations League', type: 'international' },
      // Éliminatoires Coupe du Monde - toutes confédérations
      { key: 'fifa.worldq.uefa', name: 'Éliminatoires Mondial Europe', type: 'international' },
      { key: 'fifa.worldq.conmebol', name: 'Éliminatoires Mondial Amérique Sud', type: 'international' },
      { key: 'fifa.worldq.concacaf', name: 'Éliminatoires Mondial Amérique Nord', type: 'international' },
      { key: 'fifa.worldq.afc', name: 'Éliminatoires Mondial Asie', type: 'international' },
      { key: 'fifa.worldq.caf', name: 'Éliminatoires Mondial Afrique', type: 'international' },
      // Tournois continentaux
      { key: 'uefa.euro', name: 'Euro', type: 'international' },
    ];

    const allMatches: ESPNMatch[] = [];
    const internationalMatches: ESPNMatch[] = [];

    for (const league of leagues) {
      try {
        const response = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.key}/scoreboard`,
          { next: { revalidate: 300 } }
        );

        if (!response.ok) continue;

        const data = await response.json();
        const events: ESPNEvent[] = data.events || [];

        for (const event of events) {
          const competition = event.competitions?.[0];
          const homeCompetitor = competition?.competitors?.find(c => c.homeAway === 'home');
          const awayCompetitor = competition?.competitors?.find(c => c.homeAway === 'away');

          const isLive = event.status?.type?.state === 'in';
          const isFinished = event.status?.type?.completed;
          const isInternational = league.type === 'international' || league.type === 'friendly';

          const match: ESPNMatch = {
            id: `espn_soccer_${event.id}`,
            homeTeam: homeCompetitor?.team?.displayName || 'Unknown',
            awayTeam: awayCompetitor?.team?.displayName || 'Unknown',
            league: league.name,
            sport: 'Foot',
            date: event.date,
            homeScore: homeCompetitor?.score ? parseInt(homeCompetitor.score) : undefined,
            awayScore: awayCompetitor?.score ? parseInt(awayCompetitor.score) : undefined,
            status: (isLive ? 'live' : isFinished ? 'finished' : 'upcoming') as 'live' | 'finished' | 'upcoming',
            isLive,
            isInternational,
            competitionType: league.type,
          };

          allMatches.push(match);
          
          if (isInternational) {
            internationalMatches.push(match);
          }
        }

        console.log(`  📌 ${league.name}: ${events.length} matchs${league.type !== 'domestic' ? ' 🌍' : ''}`);
      } catch (e) {
        console.log(`  ⚠️ ${league.name}: erreur`);
      }
    }

    console.log(`✅ ESPN Football: ${allMatches.length} matchs (${internationalMatches.length} internationaux)`);
    return allMatches;

  } catch (error) {
    console.error('Erreur ESPN Football:', error);
    return [];
  }
}

/**
 * Récupère uniquement les matchs internationaux
 */
export async function fetchESPNInternationalGames(): Promise<ESPNMatch[]> {
  const allMatches = await fetchESPNFootballGames();
  return allMatches.filter(m => m.isInternational);
}

/**
 * Récupère tous les matchs (NBA + Football)
 */
export async function fetchAllESPNMatches(): Promise<ESPNMatch[]> {
  const [nba, football] = await Promise.all([
    fetchESPNNBAGames(),
    fetchESPNFootballGames(),
  ]);

  return [...football, ...nba];
}
