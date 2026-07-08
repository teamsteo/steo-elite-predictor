/**
 * Endpoint dédié pour corriger et publier le bilan d'une date spécifique.
 */
import { NextRequest, NextResponse } from 'next/server';
import SupabaseStore, { type DbPrediction } from '@/lib/db-supabase';

const CRON_SECRET = process.env.CRON_SECRET || 'steo-elite-cron-2026';

function normalizeTeamName(s: string): string {
  return s.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function toUSDateStr(d: Date): string {
  const usDate = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const yyyy = usDate.getFullYear();
  const mm = String(usDate.getMonth() + 1).padStart(2, '0');
  const dd = String(usDate.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const providedSecret = url.searchParams.get('secret') || url.headers.get('authorization')?.replace('Bearer ', '');
  
  if (providedSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const targetDate = url.searchParams.get('date');
  if (!targetDate) {
    return NextResponse.json({ error: 'Paramètre date requis (YYYY-MM-DD)' }, { status: 400 });
  }

  const mode = url.searchParams.get('mode') || 'debug';

  try {
    const startTime = Date.now();

    if (mode === 'verify-mlb') {
      // Mode: vérifier manuellement les MLB pour une date
      return await verifyMLBForDate(targetDate, startTime);
    }

    if (mode === 'force-verify') {
      // Mode: forcer la vérification de tous les pending pour cette date
      return await forceVerifyDate(targetDate, startTime);
    }

    // Mode debug par défaut
    const dayPreds = await SupabaseStore.getPredictionsByDate(targetDate);
    
    const debugData = dayPreds.map(p => ({
      match_id: p.match_id,
      status: p.status,
      result_match: p.result_match,
      result_type: typeof p.result_match,
      home_score: p.home_score,
      away_score: p.away_score,
      sport: p.sport,
      league: p.league,
      home_team: p.home_team,
      away_team: p.away_team,
      predicted_result: p.predicted_result,
      match_date: p.match_date,
      risk_percentage: p.risk_percentage,
    }));

    return NextResponse.json({
      success: true,
      date: targetDate,
      totalForDate: dayPreds.length,
      debug: debugData,
      duration: `${Date.now() - startTime}ms`
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message, stack: error.stack }, { status: 500 });
  }
}

async function verifyMLBForDate(targetDate: string, startTime: number) {
  // Fetch ESPN results for this date
  const d = new Date(targetDate + 'T12:00:00Z');
  const espnDate = toUSDateStr(d);
  
  const response = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${espnDate}`,
    { cache: 'no-store' }
  );
  
  if (!response.ok) {
    return NextResponse.json({ error: `ESPN error: ${response.status}` }, { status: 500 });
  }
  
  const data = await response.json();
  const events = data.events || [];
  
  const espnResults = events.map((e: any) => {
    const comp = e.competitions?.[0];
    const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
    const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
    return {
      homeTeam: home?.team?.displayName || '',
      awayTeam: away?.team?.displayName || '',
      homeScore: parseInt(home?.score) || 0,
      awayScore: parseInt(away?.score) || 0,
      status: comp?.status?.type?.name,
    };
  }).filter((r: any) => r.status === 'STATUS_FINAL');

  // Get pending predictions for this date
  const dayPreds = await SupabaseStore.getPredictionsByDate(targetDate);
  const pending = dayPreds.filter(p => p.status === 'pending');

  // Try to match each pending with ESPN
  const matchResults: any[] = [];
  
  for (const pred of pending) {
    const predHomeNorm = normalizeTeamName(pred.home_team || '');
    const predAwayNorm = normalizeTeamName(pred.away_team || '');
    
    for (const espn of espnResults) {
      const espnHomeNorm = normalizeTeamName(espn.homeTeam);
      const espnAwayNorm = normalizeTeamName(espn.awayTeam);
      
      let matched = false;
      let inverted = false;
      
      if (predHomeNorm === espnHomeNorm && predAwayNorm === espnAwayNorm) {
        matched = true;
      } else if (predHomeNorm === espnAwayNorm && predAwayNorm === espnHomeNorm) {
        matched = true;
        inverted = true;
      }
      
      if (matched) {
        const actualResult = espn.homeScore > espn.awayScore ? 'home' : 'away';
        const resultMatch = pred.predicted_result === actualResult;
        
        matchResults.push({
          prediction: `${pred.home_team} vs ${pred.away_team}`,
          predicted: pred.predicted_result,
          espn: `${espn.homeTeam} ${espn.homeScore}-${espn.awayScore} ${espn.awayTeam}`,
          inverted,
          ourHomeScore: inverted ? espn.awayScore : espn.homeScore,
          ourAwayScore: inverted ? espn.homeScore : espn.awayScore,
          actualResult,
          resultMatch,
          match_id: pred.match_id,
        });

        // Update in Supabase
        const success = await SupabaseStore.completePrediction(pred.match_id, {
          homeScore: inverted ? espn.awayScore : espn.homeScore,
          awayScore: inverted ? espn.homeScore : espn.homeScore,
          actualResult: actualResult as 'home' | 'draw' | 'away',
          resultMatch,
        });
        
        break; // Found match, stop searching
      }
    }
    
    if (!matchResults.find(m => m.match_id === pred.match_id)) {
      matchResults.push({
        prediction: `${pred.home_team} vs ${pred.away_team}`,
        predicted: pred.predicted_result,
        espn: 'NOT FOUND',
        match_id: pred.match_id,
        predHomeNorm,
        predAwayNorm,
      });
    }
  }

  return NextResponse.json({
    success: true,
    espnDate,
    espnResults: espnResults.length,
    pendingFound: pending.length,
    matches: matchResults,
    duration: `${Date.now() - startTime}ms`
  });
}

async function forceVerifyDate(targetDate: string, startTime: number) {
  // Get ALL predictions for this date (pending + completed without results)
  const dayPreds = await SupabaseStore.getPredictionsByDate(targetDate);
  const pending = dayPreds.filter(p => 
    p.status === 'pending' || 
    (p.status === 'completed' && p.result_match !== true && p.result_match !== false)
  );

  // Also check next day for night matches
  const nextDay = new Date(targetDate + 'T12:00:00Z');
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayStr = nextDay.toISOString().split('T')[0];
  const nextDayPreds = await SupabaseStore.getPredictionsByDate(nextDayStr);
  const nextPending = nextDayPreds.filter(p => 
    p.status === 'pending' || 
    (p.status === 'completed' && p.result_match !== true && p.result_match !== false)
  );

  // Deduplicate
  const seen = new Set<string>();
  const allPending: DbPrediction[] = [];
  for (const p of [...pending, ...nextPending]) {
    if (!seen.has(p.match_id)) {
      seen.add(p.match_id);
      allPending.push(p);
    }
  }

  // Fetch ESPN results for multiple dates
  const espnDates: string[] = [];
  for (let offset = -1; offset <= 1; offset++) {
    const d = new Date(targetDate + 'T12:00:00Z');
    d.setDate(d.getDate() + offset);
    espnDates.push(toUSDateStr(d));
  }

  const allEspnResults: any[] = [];
  for (const dateStr of [...new Set(espnDates)]) {
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${dateStr}`,
        { cache: 'no-store' }
      );
      if (response.ok) {
        const data = await response.json();
        for (const e of (data.events || [])) {
          const comp = e.competitions?.[0];
          if (comp?.status?.type?.name !== 'STATUS_FINAL') continue;
          const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
          const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
          allEspnResults.push({
            homeTeam: home?.team?.displayName || '',
            awayTeam: away?.team?.displayName || '',
            homeScore: parseInt(home?.score) || 0,
            awayScore: parseInt(away?.score) || 0,
            espnDate: dateStr,
          });
        }
      }
    } catch (e) {
      // Continue with other dates
    }
  }

  // Also fetch football results
  const footballResults: any[] = [];
  for (const dateStr of [...new Set(espnDates)]) {
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/liga/scoreboard?dates=${dateStr}`,
        { cache: 'no-store' }
      );
      // Try multiple football leagues
    } catch (e) {}
  }

  // Match and update
  let updated = 0;
  let won = 0;
  let lost = 0;
  const details: any[] = [];

  for (const pred of allPending) {
    const predHomeNorm = normalizeTeamName(pred.home_team || '');
    const predAwayNorm = normalizeTeamName(pred.away_team || '');
    
    // Try to find in ESPN MLB results
    const sport = pred.sport || '';
    const league = pred.league || '';
    const isMLB = league.includes('MLB') || sport === 'other';
    const isFootball = sport === 'football';
    
    if (isMLB) {
      for (const espn of allEspnResults) {
        const eH = normalizeTeamName(espn.homeTeam);
        const eA = normalizeTeamName(espn.awayTeam);
        
        let matched = false;
        let inverted = false;
        if (predHomeNorm === eH && predAwayNorm === eA) { matched = true; }
        else if (predHomeNorm === eA && predAwayNorm === eH) { matched = true; inverted = true; }
        
        if (matched) {
          const actualResult = espn.homeScore > espn.awayScore ? 'home' : 'away';
          const resultMatch = pred.predicted_result === actualResult;
          
          const success = await SupabaseStore.completePrediction(pred.match_id, {
            homeScore: inverted ? espn.awayScore : espn.homeScore,
            awayScore: inverted ? espn.homeScore : espn.homeScore,
            actualResult: actualResult as 'home' | 'draw' | 'away',
            resultMatch,
          });
          
          if (success) {
            updated++;
            if (resultMatch) won++; else lost++;
            details.push({
              match: `${pred.home_team} vs ${pred.away_team}`,
              result: resultMatch ? 'WIN' : 'LOSS',
              score: `${inverted ? espn.awayScore : espn.homeScore}-${inverted ? espn.homeScore : espn.awayScore}`,
            });
          }
          break;
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    date: targetDate,
    pendingFound: allPending.length,
    espnResults: allEspnResults.length,
    updated,
    won,
    lost,
    details,
    duration: `${Date.now() - startTime}ms`
  });
}