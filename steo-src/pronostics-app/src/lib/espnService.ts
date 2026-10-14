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
 */
export async function fetchESPNFootballGames(): Promise<ESPNMatch[]> {
  console.log('⚽ Récupération matchs Football (ESPN)...');
  
  try {
    // Ligues disponibles sur ESPN
    const leagues = [
      // Ligues nationales
      { key: 'eng.1', name: 'Premier League' },
      { key: 'esp.1', name: 'La Liga' },
      { key: 'ger.1', name: 'Bundesliga' },
      { key: 'ita.1', name: 'Serie A' },
      { key: 'fra.1', name: 'Ligue 1' },
      // Compétitions européennes - SOURCE PRINCIPALE
      { key: 'uefa.champions', name: 'Champions League' },
      { key: 'uefa.europa', name: 'Europa League' },
      { key: 'uefa.europa.conf', name: 'Conference League' },
    ];

    const allMatches: ESPNMatch[] = [];

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

          allMatches.push({
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
          });
        }

        console.log(`  📌 ${league.name}: ${events.length} matchs`);
      } catch (e) {
        console.log(`  ⚠️ ${league.name}: erreur`);
      }
    }

    console.log(`✅ ESPN Football: ${allMatches.length} matchs`);
    return allMatches;

  } catch (error) {
    console.error('Erreur ESPN Football:', error);
    return [];
  }
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
