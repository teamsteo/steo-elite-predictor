import { NextResponse } from 'next/server';

/**
 * Debug endpoint pour vérifier les matchs européens
 * Accessible via /api/debug-europa
 */
export async function GET() {
  const results: any = {
    timestamp: new Date().toISOString(),
    tests: {}
  };

  try {
    // Test 1: ESPN Europa League
    console.log('🧪 Test ESPN Europa League...');
    const europaUrl = 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard';
    const europaRes = await fetch(europaUrl, { next: { revalidate: 0 } });
    const europaData = await europaRes.json();
    results.tests.europaLeague = {
      status: europaRes.status,
      eventsCount: europaData.events?.length || 0,
      events: (europaData.events || []).slice(0, 3).map((e: any) => ({
        name: e.name,
        date: e.date,
        status: e.status?.type?.name
      }))
    };

    // Test 2: ESPN Conference League
    console.log('🧪 Test ESPN Conference League...');
    const confUrl = 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa.conf/scoreboard';
    const confRes = await fetch(confUrl, { next: { revalidate: 0 } });
    const confData = await confRes.json();
    results.tests.conferenceLeague = {
      status: confRes.status,
      eventsCount: confData.events?.length || 0,
      events: (confData.events || []).slice(0, 3).map((e: any) => ({
        name: e.name,
        date: e.date,
        status: e.status?.type?.name
      }))
    };

    // Test 3: ESPN Champions League
    console.log('🧪 Test ESPN Champions League...');
    const clUrl = 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard';
    const clRes = await fetch(clUrl, { next: { revalidate: 0 } });
    const clData = await clRes.json();
    results.tests.championsLeague = {
      status: clRes.status,
      eventsCount: clData.events?.length || 0,
      events: (clData.events || []).slice(0, 3).map((e: any) => ({
        name: e.name,
        date: e.date,
        status: e.status?.type?.name
      }))
    };

    // Test 4: Test combinedDataService
    console.log('🧪 Test combinedDataService...');
    const { getMatchesWithRealOdds } = await import('@/lib/combinedDataService');
    const allMatches = await getMatchesWithRealOdds();

    // Filtrer les matchs européens
    const europeanLeagues = ['Champions League', 'Europa League', 'Conference League',
                            'UEFA Champions League', 'UEFA Europa League', 'UEFA Conference League'];
    const europeanMatches = allMatches.filter((m: any) =>
      europeanLeagues.some(league =>
        m.league?.toLowerCase().includes(league.toLowerCase())
      )
    );

    results.tests.combinedDataService = {
      totalMatches: allMatches.length,
      europeanMatches: europeanMatches.length,
      europeanMatchesList: europeanMatches.slice(0, 5).map((m: any) => ({
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        league: m.league,
        date: m.date
      })),
      allLeagues: [...new Set(allMatches.map((m: any) => m.league))].slice(0, 20)
    };

    // Résumé
    results.summary = {
      espnEuropaWorking: results.tests.europaLeague.eventsCount > 0,
      espnConferenceWorking: results.tests.conferenceLeague.eventsCount > 0,
      espnCLWorking: results.tests.championsLeague.eventsCount > 0,
      serviceReturningEuropean: europeanMatches.length > 0,
      recommendation: europeanMatches.length === 0 && results.tests.europaLeague.eventsCount > 0
        ? 'PROBLEM: ESPN has matches but combinedDataService is not returning them'
        : europeanMatches.length > 0
          ? 'OK: European matches are being fetched correctly'
          : 'No European matches scheduled today'
    };

    return NextResponse.json(results, { status: 200 });

  } catch (error: any) {
    results.error = error.message;
    return NextResponse.json(results, { status: 500 });
  }
}
