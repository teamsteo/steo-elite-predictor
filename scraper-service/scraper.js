/**
 * ============================================
 * SCRAPER INDÉPENDANT - ElitePronosPro
 * ============================================
 * 
 * Ce script s'exécute sur Render.com (gratuit)
 * Il scrape ESPN et stocke les résultats dans Supabase
 * Vercel lit uniquement les données depuis Supabase
 * 
 * Architecture:
 * Render (Scraping) → Supabase → Vercel (Lecture)
 */

const { createClient } = require('@supabase/supabase-js');

// ============================================
// CONFIGURATION
// ============================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Variables Supabase manquantes');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CONFIG = {
  delayBetweenRequests: parseInt(process.env.SCRAPER_DELAY || '3000'),
  delayBetweenSources: parseInt(process.env.SCRAPER_SOURCE_DELAY || '8000'),
  requestTimeout: 30000,
  maxRetries: 3,
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};

const ESPN_FOOTBALL_LEAGUES = [
  { code: 'eng.1', name: 'Premier League' },
  { code: 'esp.1', name: 'La Liga' },
  { code: 'ger.1', name: 'Bundesliga' },
  { code: 'ita.1', name: 'Serie A' },
  { code: 'fra.1', name: 'Ligue 1' },
  { code: 'uefa.champions', name: 'Champions League' },
  { code: 'uefa.europa', name: 'Europa League' },
];

// ============================================
// UTILITAIRES
// ============================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomUserAgent() {
  return CONFIG.userAgents[Math.floor(Math.random() * CONFIG.userAgents.length)];
}

async function fetchWithRetry(url, options = {}) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.requestTimeout);
      
      const response = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'application/json',
          ...options.headers,
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) return response;
      
      if (response.status === 429) {
        console.log(`⚠️ Rate limited, attente de ${CONFIG.delayBetweenSources * 2}ms...`);
        await sleep(CONFIG.delayBetweenSources * 2);
        continue;
      }
      
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      console.log(`⚠️ Tentative ${attempt}/${CONFIG.maxRetries} échouée: ${error.message}`);
      if (attempt < CONFIG.maxRetries) {
        await sleep(CONFIG.delayBetweenRequests * attempt);
      }
    }
  }
  
  throw lastError || new Error('Erreur inconnue');
}

// ============================================
// SCRAPERS
// ============================================

async function scrapeESPNFootball() {
  console.log('📊 Scraping ESPN Football...');
  const results = [];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0].replace(/-/g, '');
  
  for (const league of ESPN_FOOTBALL_LEAGUES) {
    try {
      console.log(`  📌 ${league.name}...`);
      
      const response = await fetchWithRetry(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.code}/scoreboard?dates=${dateStr}`
      );
      
      const data = await response.json();
      const events = data.events || [];
      
      for (const event of events) {
        if (event.status?.type?.completed) {
          const competition = event.competitions?.[0];
          const home = competition?.competitors?.find((c) => c.homeAway === 'home');
          const away = competition?.competitors?.find((c) => c.homeAway === 'away');
          
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
            source: 'espn',
          });
        }
      }
      
      await sleep(CONFIG.delayBetweenRequests);
    } catch (error) {
      console.error(`  ❌ Erreur ${league.name}: ${error.message}`);
    }
  }
  
  console.log(`✅ ESPN Football: ${results.length} résultats`);
  return results;
}

async function scrapeESPNNBA() {
  console.log('📊 Scraping ESPN NBA...');
  const results = [];
  
  try {
    const response = await fetchWithRetry(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard'
    );
    
    const data = await response.json();
    const events = data.events || [];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    for (const event of events) {
      const eventDate = new Date(event.date).toISOString().split('T')[0];
      
      if (event.status?.type?.completed && eventDate === yesterdayStr) {
        const competition = event.competitions?.[0];
        const home = competition?.competitors?.find((c) => c.homeAway === 'home');
        const away = competition?.competitors?.find((c) => c.homeAway === 'away');
        
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
          source: 'espn',
        });
      }
    }
    
    console.log(`✅ ESPN NBA: ${results.length} résultats`);
  } catch (error) {
    console.error(`❌ Erreur NBA: ${error.message}`);
  }
  
  return results;
}

async function scrapeESPNNHL() {
  console.log('📊 Scraping ESPN NHL...');
  const results = [];
  
  try {
    const response = await fetchWithRetry(
      'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard'
    );
    
    const data = await response.json();
    const events = data.events || [];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    for (const event of events) {
      const eventDate = new Date(event.date).toISOString().split('T')[0];
      
      if (event.status?.type?.completed && eventDate === yesterdayStr) {
        const competition = event.competitions?.[0];
        const home = competition?.competitors?.find((c) => c.homeAway === 'home');
        const away = competition?.competitors?.find((c) => c.homeAway === 'away');
        
        results.push({
          match_id: `nhl_${event.id}`,
          home_team: home?.team?.displayName || 'Unknown',
          away_team: away?.team?.displayName || 'Unknown',
          home_score: parseInt(home?.score || '0'),
          away_score: parseInt(away?.score || '0'),
          league: 'NHL',
          sport: 'hockey',
          match_date: event.date,
          status: 'completed',
          source: 'espn',
        });
      }
    }
    
    console.log(`✅ ESPN NHL: ${results.length} résultats`);
  } catch (error) {
    console.error(`❌ Erreur NHL: ${error.message}`);
  }
  
  return results;
}

// ============================================
// STOCKAGE SUPABASE
// ============================================

async function saveToSupabase(results) {
  if (results.length === 0) return 0;
  
  console.log(`📊 Sauvegarde de ${results.length} résultats dans Supabase...`);
  
  let saved = 0;
  
  for (const result of results) {
    try {
      const { data: existing } = await supabase
        .from('predictions')
        .select('match_id')
        .eq('match_id', result.match_id)
        .single();
      
      if (existing) {
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
        const { error } = await supabase
          .from('predictions')
          .insert({
            match_id: result.match_id,
            home_team: result.home_team,
            away_team: result.away_team,
            home_score: result.home_score,
            away_score: result.away_score,
            league: result.league,
            sport: result.sport,
            match_date: result.match_date,
            status: 'completed',
            checked_at: new Date().toISOString(),
          });
        
        if (!error) saved++;
      }
      
      await sleep(100);
    } catch (error) {
      // Ignorer les erreurs de doublons
      if (!error.message?.includes('duplicate')) {
        console.error(`❌ Erreur sauvegarde ${result.match_id}: ${error.message}`);
      }
    }
  }
  
  console.log(`✅ ${saved} résultats sauvegardés`);
  return saved;
}

async function updatePendingPredictions() {
  console.log('📊 Mise à jour des prédictions en attente...');
  
  const { data: pending, error } = await supabase
    .from('predictions')
    .select('*')
    .eq('status', 'pending');
  
  if (error || !pending) {
    console.error('❌ Erreur récupération prédictions:', error);
    return { verified: 0, won: 0, lost: 0 };
  }
  
  console.log(`📋 ${pending.length} prédictions en attente`);
  
  let verified = 0, won = 0, lost = 0;
  
  for (const pred of pending) {
    try {
      const { data: matchResult } = await supabase
        .from('predictions')
        .select('*')
        .eq('home_team', pred.home_team)
        .eq('away_team', pred.away_team)
        .eq('status', 'completed')
        .not('home_score', 'is', null)
        .single();
      
      if (matchResult) {
        const homeScore = matchResult.home_score;
        const awayScore = matchResult.away_score;
        
        let actualResult;
        if (homeScore > awayScore) actualResult = 'home';
        else if (awayScore > homeScore) actualResult = 'away';
        else actualResult = 'draw';
        
        const resultMatch = pred.predicted_result === actualResult;
        
        const { error: updateError } = await supabase
          .from('predictions')
          .update({
            home_score: homeScore,
            away_score: awayScore,
            actual_result: actualResult,
            result_match: resultMatch,
            status: resultMatch ? 'won' : 'lost',
            checked_at: new Date().toISOString(),
          })
          .eq('id', pred.id);
        
        if (!updateError) {
          verified++;
          if (resultMatch) won++; else lost++;
          console.log(`  ✅ ${pred.home_team} vs ${pred.away_team}: ${resultMatch ? 'GAGNÉ' : 'PERDU'} (${homeScore}-${awayScore})`);
        }
      }
      
      await sleep(100);
    } catch (error) {
      // Ignorer
    }
  }
  
  console.log(`📊 Résultats: ${verified} vérifiés, ${won} gagnés, ${lost} perdus`);
  return { verified, won, lost };
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('');
  console.log('🚀 ============================================');
  console.log('   SCRAPER INDÉPENDANT - ElitePronosPro');
  console.log('   Hébergé sur Render.com');
  console.log('============================================');
  console.log(`📅 ${new Date().toLocaleString('fr-FR')}`);
  console.log('');
  
  const startTime = Date.now();
  
  try {
    // 1. Scraping
    console.log('=== ÉTAPE 1: SCRAPING ===');
    await sleep(CONFIG.delayBetweenSources);
    
    const footballResults = await scrapeESPNFootball();
    await sleep(CONFIG.delayBetweenSources);
    
    const nbaResults = await scrapeESPNNBA();
    await sleep(CONFIG.delayBetweenSources);
    
    const nhlResults = await scrapeESPNNHL();
    
    const allResults = [...footballResults, ...nbaResults, ...nhlResults];
    console.log(`📊 Total: ${allResults.length} résultats`);
    console.log('');
    
    // 2. Sauvegarde
    console.log('=== ÉTAPE 2: SAUVEGARDE ===');
    const saved = await saveToSupabase(allResults);
    console.log('');
    
    // 3. Mise à jour prédictions
    console.log('=== ÉTAPE 3: MISE À JOUR ===');
    const { verified, won, lost } = await updatePendingPredictions();
    console.log('');
    
    // 4. Résumé
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log('=== RÉSUMÉ ===');
    console.log(`⏱️ Durée: ${duration}s`);
    console.log(`📊 Résultats: ${allResults.length}`);
    console.log(`💾 Sauvegardés: ${saved}`);
    console.log(`✅ Vérifiés: ${verified} (${won}W/${lost}L)`);
    console.log('');
    console.log('✅ Terminé avec succès');
    console.log('============================================');
    console.log('');
    
    // Exit code 0 pour Render
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Erreur fatale:', error.message);
    console.log('============================================');
    process.exit(1);
  }
}

// Lancer
main();
