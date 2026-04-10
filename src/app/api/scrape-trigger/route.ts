/**
 * API de déclenchement du scraping pour cron-job.org
 * 
 * Cette API est appelée par cron-job.org (gratuit) pour déclencher le scraping.
 * 
 * URL à configurer dans cron-job.org:
 * https://my-project-zeta-five-85.vercel.app/api/scrape-trigger?secret=VOTRE_SECRET
 * 
 * Schedule recommandé: Tous les jours à 5h UTC
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Secret généré pour sécuriser l'API de scraping
// À configurer dans Vercel: SCRAPE_SECRET=47c1beb9093062cb0564a47737897aca9e3850ffe73cb8db56e6b03a92060651
const SCRAPE_SECRET = process.env.SCRAPE_SECRET || '47c1beb9093062cb0564a47737897aca9e3850ffe73cb8db56e6b03a92060651';

// Configuration ESPN
const ESPN_FOOTBALL_LEAGUES = [
  { code: 'eng.1', name: 'Premier League' },
  { code: 'esp.1', name: 'La Liga' },
  { code: 'ger.1', name: 'Bundesliga' },
  { code: 'ita.1', name: 'Serie A' },
  { code: 'fra.1', name: 'Ligue 1' },
];

// User-Agents variés
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithUA(url: string): Promise<any> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': getRandomUserAgent(),
      'Accept': 'application/json',
    },
  });
  return response.json();
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  
  // Vérification du secret OU appel depuis cron-job.org
  const userAgent = request.headers.get('user-agent') || '';
  const isCronJob = userAgent.includes('cron-job.org') || userAgent.includes('Cronitor');
  const hasValidSecret = secret === SCRAPE_SECRET;
  
  if (!hasValidSecret && !isCronJob) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  
  // Configuration Supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Configuration Supabase manquante' }, { status: 500 });
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Date d'hier
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0].replace(/-/g, '');
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  
  const results: any[] = [];
  
  try {
    // ============================================
    // SCRAPING FOOTBALL ESPN
    // ============================================
    console.log('📊 Scraping ESPN Football...');
    
    for (const league of ESPN_FOOTBALL_LEAGUES) {
      try {
        await sleep(1000); // Délai entre ligues
        
        const data = await fetchWithUA(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.code}/scoreboard?dates=${dateStr}`
        );
        
        const events = data.events || [];
        for (const event of events) {
          if (event.status?.type?.completed) {
            const competition = event.competitions?.[0];
            const home = competition?.competitors?.find((c: any) => c.homeAway === 'home');
            const away = competition?.competitors?.find((c: any) => c.homeAway === 'away');
            
            results.push({
              match_id: `espn_${event.id}`,
              home_team: home?.team?.displayName || 'Unknown',
              away_team: away?.team?.displayName || 'Unknown',
              home_score: parseInt(home?.score || '0'),
              away_score: parseInt(away?.score || '0'),
              league: league.name,
              sport: 'football',
              match_date: event.date,
              status: 'completed',
            });
          }
        }
        console.log(`  ✅ ${league.name}: ${events.length} matchs`);
      } catch (e: any) {
        console.error(`  ❌ ${league.name}:`, e.message);
      }
    }
    
    // ============================================
    // SCRAPING NBA ESPN
    // ============================================
    console.log('📊 Scraping ESPN NBA...');
    try {
      await sleep(2000);
      
      const data = await fetchWithUA(
        'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard'
      );
      
      const events = data.events || [];
      let nbaCount = 0;
      
      for (const event of events) {
        const eventDate = new Date(event.date).toISOString().split('T')[0];
        
        if (event.status?.type?.completed && eventDate === yesterdayStr) {
          const competition = event.competitions?.[0];
          const home = competition?.competitors?.find((c: any) => c.homeAway === 'home');
          const away = competition?.competitors?.find((c: any) => c.homeAway === 'away');
          
          results.push({
            match_id: `nba_${event.id}`,
            home_team: home?.team?.displayName || 'Unknown',
            away_team: away?.team?.displayName || 'Unknown',
            home_score: parseInt(home?.score || '0'),
            away_score: parseInt(away?.score || '0'),
            league: 'NBA',
            sport: 'basketball',
            match_date: event.date,
            status: 'completed',
          });
          nbaCount++;
        }
      }
      console.log(`  ✅ NBA: ${nbaCount} matchs`);
    } catch (e: any) {
      console.error('  ❌ NBA:', e.message);
    }
    
    // ============================================
    // SAUVEGARDE DANS SUPABASE
    // ============================================
    console.log(`📊 Sauvegarde de ${results.length} résultats...`);
    let saved = 0;
    
    for (const result of results) {
      try {
        // Vérifier si existe
        const { data: existing } = await supabase
          .from('predictions')
          .select('match_id')
          .eq('match_id', result.match_id)
          .single();
        
        if (existing) {
          // Update
          const { error } = await supabase
            .from('predictions')
            .update({
              home_score: result.home_score,
              away_score: result.away_score,
              status: 'completed',
              checked_at: new Date().toISOString(),
            })
            .eq('match_id', result.match_id);
          
          if (!error) saved++;
        } else {
          // Insert
          const { error } = await supabase
            .from('predictions')
            .insert({
              ...result,
              created_at: new Date().toISOString(),
              checked_at: new Date().toISOString(),
            });
          
          if (!error) saved++;
        }
      } catch (e) {
        // Ignorer les doublons
      }
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    console.log(`✅ Scraping terminé: ${results.length} résultats, ${saved} sauvegardés en ${duration}s`);
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}s`,
      scraped: results.length,
      saved,
      sample: results.slice(0, 3),
    });
    
  } catch (error: any) {
    console.error('❌ Erreur scraping:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
