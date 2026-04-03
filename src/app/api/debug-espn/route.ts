import { NextResponse } from 'next/server';

/**
 * Debug ESPN - Vérifie la connectivité ESPN et les matchs européens
 */
export async function GET() {
  const results: any = {
    timestamp: new Date().toISOString(),
    env: {
      hasOddsApiKey: !!process.env.THE_ODDS_API_KEY,
      nodeEnv: process.env.NODE_ENV,
    },
    tests: []
  };

  const today = new Date().toISOString().split('-').join('').slice(0, 8);

  // Test ESPN endpoints
  const endpoints = [
    { url: `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard?dates=${today}`, name: 'Europa League' },
    { url: `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa.conf/scoreboard?dates=${today}`, name: 'Conference League' },
    { url: `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=${today}`, name: 'Premier League' },
  ];

  for (const endpoint of endpoints) {
    try {
      const startTime = Date.now();
      const res = await fetch(endpoint.url, {
        next: { revalidate: 0 },
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PronosticsApp/1.0)',
        }
      });
      const duration = Date.now() - startTime;

      const data = await res.json();
      const events = data.events || [];

      results.tests.push({
        name: endpoint.name,
        status: res.status,
        duration: `${duration}ms`,
        eventsCount: events.length,
        sampleEvents: events.slice(0, 2).map((e: any) => {
          const home = e.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'home');
          const away = e.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'away');
          return {
            name: e.name,
            home: home?.team?.displayName,
            away: away?.team?.displayName,
            date: e.date,
          };
        }),
      });
    } catch (error: any) {
      results.tests.push({
        name: endpoint.name,
        error: error.message,
      });
    }
  }

  // Test combined data service
  try {
    const { getMatchesWithRealOdds } = await import('@/lib/combinedDataService');
    const matches = await getMatchesWithRealOdds();

    const europeanLeagues = ['Champions League', 'Europa League', 'Conference League'];
    const europeanMatches = matches.filter((m: any) =>
      europeanLeagues.some(l => m.league?.toLowerCase().includes(l.toLowerCase()))
    );

    results.combinedDataService = {
      totalMatches: matches.length,
      europeanMatches: europeanMatches.length,
      leagues: [...new Set(matches.map((m: any) => m.league))].slice(0, 15),
      sampleEuropean: europeanMatches.slice(0, 3).map((m: any) => ({
        home: m.homeTeam,
        away: m.awayTeam,
        league: m.league,
      })),
    };
  } catch (error: any) {
    results.combinedDataService = {
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3),
    };
  }

  return NextResponse.json(results, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    }
  });
}
