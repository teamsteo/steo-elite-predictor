// ============================================
// SCRIPT DE SCRAPING INDÉPENDANT - VERSION SÉCURISÉE
// ============================================
//
// Protections anti-bannissement:
// - Délais augmentés entre requêtes
// - Backoff exponentiel agressif
// - Cache pour éviter les doublons
// - Rotation de User Agents
// - Détection proactive du rate limiting
// - Limitation du nombre de requêtes
//

import { createClient } from '@supabase/supabase-js';

// ============================================
// CONFIGURATION SÉCURISÉE
// ============================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Variables Supabase manquantes');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Configuration avec protections renforcées
const CONFIG = {
  // Délais augmentés pour éviter le rate limiting
  delayBetweenRequests: parseInt(process.env.SCRAPER_DELAY || '5000'),      // 5s au lieu de 2s
  delayBetweenSources: parseInt(process.env.SCRAPER_SOURCE_DELAY || '15000'), // 15s au lieu de 5s
  requestTimeout: 30000,
  maxRetries: 3,
  
  // Backoff exponentiel: délai de base * 2^tentative
  backoffMultiplier: 2,
  maxBackoffDelay: 60000, // 1 minute max
  
  // Limite de requêtes par session
  maxRequestsPerSession: 50,
  
  // User agents étendus (10 au lieu de 5)
  userAgents: [
    // Chrome Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    // Chrome Mac
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    // Firefox Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    // Firefox Mac
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
    // Safari Mac
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    // Edge Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    // Chrome Linux
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};

// Cache en mémoire pour éviter les requêtes dupliquées
const requestCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Compteur de requêtes
let requestCount = 0;

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
// UTILITAIRES SÉCURISÉS
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomUserAgent(): string {
  return CONFIG.userAgents[Math.floor(Math.random() * CONFIG.userAgents.length)];
}

// Calcul du délai avec jitter (variation aléatoire)
function getDelayWithJitter(baseDelay: number): number {
  const jitter = Math.random() * 0.3 * baseDelay; // ±30% de variation
  return baseDelay + jitter;
}

// Vérification du cache
function getCached<T>(key: string): T | null {
  const cached = requestCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`  📦 Cache hit: ${key}`);
    return cached.data as T;
  }
  return null;
}

// Mise en cache
function setCache(key: string, data: any): void {
  requestCache.set(key, { data, timestamp: Date.now() });
}

// Vérification limite de requêtes
function checkRequestLimit(): boolean {
  if (requestCount >= CONFIG.maxRequestsPerSession) {
    console.error(`🚫 Limite de requêtes atteinte: ${requestCount}/${CONFIG.maxRequestsPerSession}`);
    return false;
  }
  return true;
}

// ============================================
// FETCH AVEC PROTECTIONS RENFORCÉES
// ============================================

interface FetchResult {
  data: any;
  fromCache: boolean;
}

async function fetchWithProtection(url: string): Promise<FetchResult> {
  // Vérifier le cache d'abord
  const cacheKey = url;
  const cached = getCached<any>(cacheKey);
  if (cached) {
    return { data: cached, fromCache: true };
  }
  
  // Vérifier la limite
  if (!checkRequestLimit()) {
    throw new Error('Limite de requêtes atteinte');
  }
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      // Délai avec jitter avant chaque requête
      const delay = getDelayWithJitter(CONFIG.delayBetweenRequests);
      if (attempt > 1) {
        // Backoff exponentiel pour les retries
        const backoffDelay = Math.min(
          CONFIG.delayBetweenRequests * Math.pow(CONFIG.backoffMultiplier, attempt - 1),
          CONFIG.maxBackoffDelay
        );
        console.log(`  ⏳ Attente backoff: ${Math.round(backoffDelay / 1000)}s...`);
        await sleep(backoffDelay);
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.requestTimeout);
      
      const userAgent = getRandomUserAgent();
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      requestCount++;
      
      // Vérifier les headers de rate limiting
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
      const rateLimitReset = response.headers.get('x-ratelimit-reset');
      
      if (rateLimitRemaining && parseInt(rateLimitRemaining) < 10) {
        console.log(`  ⚠️ Rate limit proche: ${rateLimitRemaining} restantes`);
        if (rateLimitReset) {
          const resetTime = parseInt(rateLimitReset) * 1000;
          const waitTime = resetTime - Date.now();
          if (waitTime > 0 && waitTime < 300000) { // Max 5 minutes d'attente
            console.log(`  ⏳ Attente reset: ${Math.round(waitTime / 1000)}s`);
            await sleep(waitTime + 1000);
          }
        }
      }
      
      // Gestion du rate limiting (429)
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        let waitTime = CONFIG.delayBetweenSources * 3;
        
        if (retryAfter) {
          waitTime = parseInt(retryAfter) * 1000;
        }
        
        console.log(`  🛑 Rate limited (429)! Attente: ${Math.round(waitTime / 1000)}s`);
        await sleep(waitTime);
        continue;
      }
      
      // Autres erreurs serveur (5xx)
      if (response.status >= 500) {
        throw new Error(`Erreur serveur HTTP ${response.status}`);
      }
      
      // Erreurs client (4xx) sauf 429
      if (response.status >= 400) {
        throw new Error(`Erreur client HTTP ${response.status}`);
      }
      
      if (response.ok) {
        const data = await response.json();
        setCache(cacheKey, data);
        return { data, fromCache: false };
      }
      
    } catch (error: any) {
      lastError = error;
      console.log(`  ⚠️ Tentative ${attempt}/${CONFIG.maxRetries} échouée: ${error.message}`);
      
      // Ne pas retry sur certaines erreurs
      if (error.message.includes('Limite de requêtes')) {
        throw error;
      }
    }
  }
  
  throw lastError || new Error('Erreur inconnue');
}

// ============================================
// SCRAPERS AVEC PROTECTIONS
// ============================================

async function scrapeESPNFootball(): Promise<any[]> {
  console.log('📊 Scraping ESPN Football...');
  const results: any[] = [];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0].replace(/-/g, '');
  
  for (let i = 0; i < ESPN_FOOTBALL_LEAGUES.length; i++) {
    const league = ESPN_FOOTBALL_LEAGUES[i];
    
    // Vérifier la limite avant chaque ligue
    if (!checkRequestLimit()) {
      console.log(`  🛑 Arrêt: limite de requêtes atteinte`);
      break;
    }
    
    try {
      console.log(`  📌 [${i + 1}/${ESPN_FOOTBALL_LEAGUES.length}] ${league.name}...`);
      
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.code}/scoreboard?dates=${dateStr}`;
      const { data, fromCache } = await fetchWithProtection(url);
      
      const events = data.events || [];
      let matchCount = 0;
      
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
            source: 'espn',
          });
          matchCount++;
        }
      }
      
      console.log(`    ✅ ${matchCount} matchs ${fromCache ? '(cache)' : ''}`);
      
      // Délai entre chaque ligue (sauf si du cache)
      if (!fromCache && i < ESPN_FOOTBALL_LEAGUES.length - 1) {
        const delay = getDelayWithJitter(CONFIG.delayBetweenSources);
        console.log(`    ⏳ Pause: ${Math.round(delay / 1000)}s`);
        await sleep(delay);
      }
      
    } catch (error: any) {
      console.error(`    ❌ Erreur ${league.name}: ${error.message}`);
      // Continuer avec les autres ligues
    }
  }
  
  console.log(`✅ ESPN Football: ${results.length} résultats`);
  return results;
}

async function scrapeESPNNBA(): Promise<any[]> {
  console.log('📊 Scraping ESPN NBA...');
  const results: any[] = [];
  
  if (!checkRequestLimit()) {
    console.log('  🛑 Arrêt: limite de requêtes atteinte');
    return results;
  }
  
  try {
    const url = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
    const { data, fromCache } = await fetchWithProtection(url);
    
    const events = data.events || [];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
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
          source: 'espn',
        });
      }
    }
    
    console.log(`✅ ESPN NBA: ${results.length} résultats ${fromCache ? '(cache)' : ''}`);
  } catch (error: any) {
    console.error(`❌ Erreur NBA: ${error.message}`);
  }
  
  return results;
}

async function scrapeESPNNHL(): Promise<any[]> {
  console.log('📊 Scraping ESPN NHL...');
  const results: any[] = [];
  
  if (!checkRequestLimit()) {
    console.log('  🛑 Arrêt: limite de requêtes atteinte');
    return results;
  }
  
  try {
    const url = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard';
    const { data, fromCache } = await fetchWithProtection(url);
    
    const events = data.events || [];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    for (const event of events) {
      const eventDate = new Date(event.date).toISOString().split('T')[0];
      
      if (event.status?.type?.completed && eventDate === yesterdayStr) {
        const competition = event.competitions?.[0];
        const home = competition?.competitors?.find((c: any) => c.homeAway === 'home');
        const away = competition?.competitors?.find((c: any) => c.homeAway === 'away');
        
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
    
    console.log(`✅ ESPN NHL: ${results.length} résultats ${fromCache ? '(cache)' : ''}`);
  } catch (error: any) {
    console.error(`❌ Erreur NHL: ${error.message}`);
  }
  
  return results;
}

// ============================================
// STOCKAGE SUPABASE - VERSION CORRIGÉE
// ============================================

async function saveToSupabase(results: any[]): Promise<number> {
  if (results.length === 0) return 0;
  
  console.log(`📊 Sauvegarde de ${results.length} résultats dans Supabase...`);
  
  let saved = 0;
  
  for (const result of results) {
    try {
      // 1. D'abord chercher par match_id
      let { data: existing } = await supabase
        .from('predictions')
        .select('id, match_id, home_team, away_team')
        .eq('match_id', result.match_id)
        .single();
      
      // 2. Si pas trouvé, chercher par nom d'équipes (plus flexible)
      if (!existing) {
        const { data: byTeams } = await supabase
          .from('predictions')
          .select('id, match_id, home_team, away_team')
          .or(`home_team.ilike.%${result.home_team}%,away_team.ilike.%${result.away_team}%`)
          .ilike('home_team', `%${result.home_team.split(' ').pop()}%`) // Match par dernier mot (ex: "Lakers")
          .ilike('away_team', `%${result.away_team.split(' ').pop()}%`)
          .eq('sport', result.sport === 'football' ? 'Foot' : result.sport)
          .single();
        
        if (byTeams) {
          existing = byTeams;
          console.log(`  📝 Match trouvé par équipes: ${result.home_team} vs ${result.away_team}`);
        }
      }
      
      if (existing) {
        // Mettre à jour l'enregistrement existant
        const { error } = await supabase
          .from('predictions')
          .update({
            home_score: result.home_score,
            away_score: result.away_score,
            status: 'completed',
            actual_result: result.home_score > result.away_score ? 'home' : 
                           result.away_score > result.home_score ? 'away' : 'draw',
            result_match: true, // Sera recalculé si predicted_result existe
            checked_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        
        if (!error) {
          saved++;
          console.log(`  ✅ Mis à jour: ${result.home_team} ${result.home_score}-${result.away_score} ${result.away_team}`);
        } else {
          console.log(`  ⚠️ Erreur update: ${error.message}`);
        }
      } else {
        // Créer un nouvel enregistrement uniquement si inexistant
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
            actual_result: result.home_score > result.away_score ? 'home' : 
                           result.away_score > result.home_score ? 'away' : 'draw',
            checked_at: new Date().toISOString(),
          });
        
        if (!error) {
          saved++;
          console.log(`  ➕ Créé: ${result.home_team} ${result.home_score}-${result.away_score} ${result.away_team}`);
        }
      }
      
      await sleep(150);
    } catch (error: any) {
      if (!error.message?.includes('duplicate') && !error.message?.includes('No rows found')) {
        console.error(`❌ Erreur sauvegarde ${result.match_id}: ${error.message}`);
      }
    }
  }
  
  console.log(`✅ ${saved} résultats sauvegardés`);
  return saved;
}

async function updatePendingPredictions(): Promise<{ verified: number; won: number; lost: number }> {
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
      // Chercher le résultat par nom d'équipes
      const homeTeamName = pred.home_team?.split(' ').pop() || pred.home_team;
      const awayTeamName = pred.away_team?.split(' ').pop() || pred.away_team;
      
      const { data: matchResult } = await supabase
        .from('predictions')
        .select('*')
        .ilike('home_team', `%${homeTeamName}%`)
        .ilike('away_team', `%${awayTeamName}%`)
        .eq('status', 'completed')
        .not('home_score', 'is', null)
        .limit(1)
        .single();
      
      if (matchResult && matchResult.home_score !== null && matchResult.away_score !== null) {
        const homeScore = matchResult.home_score;
        const awayScore = matchResult.away_score;
        
        // Calculer le résultat réel
        let actualResult: 'home' | 'draw' | 'away';
        if (homeScore > awayScore) actualResult = 'home';
        else if (awayScore > homeScore) actualResult = 'away';
        else actualResult = 'draw';
        
        // Vérifier si la prédiction était correcte
        const resultMatch = pred.predicted_result === actualResult;
        
        // Calculer le nouveau statut
        const newStatus = resultMatch ? 'won' : 'lost';
        
        const { error: updateError } = await supabase
          .from('predictions')
          .update({
            home_score: homeScore,
            away_score: awayScore,
            actual_result: actualResult,
            result_match: resultMatch,
            status: newStatus,
            checked_at: new Date().toISOString(),
          })
          .eq('id', pred.id);
        
        if (!updateError) {
          verified++;
          if (resultMatch) won++; else lost++;
          console.log(`  ${resultMatch ? '✅' : '❌'} ${pred.home_team} vs ${pred.away_team}: ${resultMatch ? 'GAGNÉ' : 'PERDU'} (${homeScore}-${awayScore})`);
        }
      } else {
        console.log(`  ⏳ Pas de résultat trouvé: ${pred.home_team} vs ${pred.away_team}`);
      }
      
      await sleep(150);
    } catch (error: any) {
      // Match non trouvé, normal
    }
  }
  
  console.log(`📊 Résultats: ${verified} vérifiés, ${won} gagnés, ${lost} perdus`);
  return { verified, won, lost };
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🚀 Scraper indépendant - ElitePronosPro (Version Sécurisée)');
  console.log(`📅 ${new Date().toLocaleString('fr-FR')}`);
  console.log(`🔧 Config: délai=${CONFIG.delayBetweenRequests}ms, backoff=x${CONFIG.backoffMultiplier}`);
  console.log(`🔒 Limite requêtes: ${CONFIG.maxRequestsPerSession}/session`);
  console.log('');
  
  const startTime = Date.now();
  
  try {
    // 1. Scraping
    console.log('=== ÉTAPE 1: SCRAPING ===');
    console.log(`📊 Requêtes effectuées: ${requestCount}`);
    
    // Délai initial pour éviter le pic au démarrage
    await sleep(getDelayWithJitter(CONFIG.delayBetweenSources));
    
    const footballResults = await scrapeESPNFootball();
    console.log(`📊 Total requêtes: ${requestCount}`);
    
    await sleep(getDelayWithJitter(CONFIG.delayBetweenSources));
    
    const nbaResults = await scrapeESPNNBA();
    console.log(`📊 Total requêtes: ${requestCount}`);
    
    await sleep(getDelayWithJitter(CONFIG.delayBetweenSources));
    
    const nhlResults = await scrapeESPNNHL();
    console.log(`📊 Total requêtes: ${requestCount}`);
    
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
    console.log(`📊 Requêtes ESPN: ${requestCount}`);
    console.log(`📊 Résultats: ${allResults.length}`);
    console.log(`💾 Sauvegardés: ${saved}`);
    console.log(`✅ Vérifiés: ${verified} (${won}W/${lost}L)`);
    console.log('');
    console.log('✅ Terminé avec succès');
    
  } catch (error: any) {
    console.error('❌ Erreur fatale:', error.message);
    console.error('📊 Requêtes effectuées avant erreur:', requestCount);
    process.exit(1);
  }
}

// Lancer
main();
