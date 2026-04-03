/**
 * RapidAPI (SportAPI7) Integration
 * Source alternative quand The Odds API is exhausted
 */

interface RapidApiMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league?: string;
  date: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  status: 'upcoming' | 'live' | 'finished';
}

interface RapidApiResponse {
  events?: RapidApiMatch[];
  matches?: RapidApiMatch[];
}

/**
 * Fetch matches from RapidAPI (SportAPI7)
 */
export async function fetchRapidApiMatches(): Promise<RapidApiMatch[]> {
  const apiKey = process.env.RAPIDAPI_KEY;
  const apiHost = process.env.RAPIDAPI_HOST || 'sportapi7.p.rapidapi.com';
  
  if (!apiKey) {
    console.log('⚠️ RAPIDAPI_KEY non configurée');
    return [];
  }

  console.log('🔑 Tentative RapidAPI (SportAPI7)...');
  const allMatches: RapidApiMatch[] = [];

  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Try football matches endpoint
    const response = await fetch(
      `https://${apiHost}/api/v1/football?date=${today}`,
      {
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': apiHost,
        },
        next: { revalidate: 3600 }
      }
    );

    if (!response.ok) {
      // Try alternative endpoint
      const altResponse = await fetch(
        `https://${apiHost}/api/v1/football/matches?date=${today}`,
        {
          headers: {
            'x-rapidapi-key': apiKey,
            'x-rapidapi-host': apiHost,
          },
          next: { revalidate: 3600 }
        }
      );

      if (!altResponse.ok) {
        console.log(`⚠️ RapidAPI: Status ${altResponse.status}`);
        return [];
      }

      const data = await altResponse.json();
      return parseRapidApiData(data);
    }

    const data = await response.json();
    const matches = parseRapidApiData(data);
    
    console.log(`✅ RapidAPI: ${matches.length} matchs récupérés`);
    return matches;

  } catch (error) {
    console.error('Erreur RapidAPI:', error);
    return [];
  }
}

/**
 * Parse RapidAPI response to our format
 */
function parseRapidApiData(data: any): RapidApiMatch[] {
  const events = data.events || data.matches || data.data || [];
  if (!Array.isArray(events)) return [];

  return events
    .filter((event: any) => event.homeTeam && event.awayTeam)
    .map((event: any) => {
      const odds = event.odds || event.betOdds || {};
      const homeOdds = odds.home || odds['1'] || event.homeOdds || 0.9;
      const drawOdds = odds.draw || odds['X'] || event.drawOdds || null;
      const awayOdds = odds.away || odds['2'] || event.awayOdds || 1.9;

      return {
        id: `rapid_${event.id || event.matchId || Date.now()}`,
        homeTeam: event.homeTeam?.name || event.homeTeam || event.home,
        awayTeam: event.awayTeam?.name || event.awayTeam || event.away,
        league: event.league?.name || event.tournament?.name || 'Football',
        date: event.startTime || event.date || event.kickoff || new Date().toISOString(),
        oddsHome: typeof homeOdds === 'number' ? homeOdds : parseFloat(homeOdds) || 1.9,
        oddsDraw: drawOdds ? (typeof drawOdds === 'number' ? drawOdds : parseFloat(drawOdds)) : null,
        oddsAway: typeof awayOdds === 'number' ? awayOdds : parseFloat(awayOdds) || 1.9,
        status: event.status === 'live' ? 'live' : event.status === 'finished' ? 'finished' : 'upcoming'
      };
    });
}

/**
 * Get API status
 */
export function getRapidApiStatus(): { configured: boolean; host: string } {
  return {
    configured: !!process.env.RAPIDAPI_KEY,
    host: process.env.RAPIDAPI_HOST || 'sportapi7.p.rapidapi.com'
  };
}
