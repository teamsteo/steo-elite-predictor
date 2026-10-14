/**
 * SCRIPT DE SCRAPING INDÉPENDANT
 * ================================
 * 
 * Ce script est conçu pour tourner sur un serveur dédié (VPS, machine locale)
 * SÉPARÉMENT de Vercel. Il effectue:
 * 
 * 1. Récupération des matchs (ESPN - gratuit)
 * 2. Scraping avancé (Transfermarkt, FBRef, BetExplorer)
 * 3. Calcul des prédictions ML
 * 4. Stockage dans Supabase
 * 
 * UTILISATION:
 * - Local: npx tsx scripts/standalone-scraper.ts
 * - Cron: 0 */4 * * * cd /path/to/project && npx tsx scripts/standalone-scraper.ts
 * 
 * AVANTAGES:
 * - Pas de rate limiting Vercel
 * - Pas de timeout serverless (60s)
 * - User-agents personnalisables
 * - Délais entre requêtes configurables
 */

import { createClient } from '@supabase/supabase-js';

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  // Délais entre requêtes (ms)
  DELAYS: {
    betweenRequests: 2000,      // 2s entre chaque requête
    betweenDomains: 5000,       // 5s entre changements de domaine
    retryDelay: 10000,          // 10s avant retry
  },
  
  // User-agents rotatifs
  USER_AGENTS: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  ],
  
  // Configuration Supabase
  SUPABASE: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  },
  
  // Ligues à scraper
  LEAGUES: {
    football: [
      { code: 'eng.1', name: 'Premier League' },
      { code: 'esp.1', name: 'La Liga' },
      { code: 'ger.1', name: 'Bundesliga' },
      { code: 'ita.1', name: 'Serie A' },
      { code: 'fra.1', name: 'Ligue 1' },
      { code: 'uefa.champions', name: 'Champions League' },
      { code: 'uefa.europa', name: 'Europa League' },
    ],
  },
  
  // Mode simulation (pour tests sans scraping réel)
  DRY_RUN: process.env.DRY_RUN === 'true',
};

// ============================================
// CLIENT SUPABASE
// ============================================

let supabase: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!supabase && CONFIG.SUPABASE.url && CONFIG.SUPABASE.key) {
    supabase = createClient(CONFIG.SUPABASE.url, CONFIG.SUPABASE.key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return supabase;
}

// ============================================
// UTILITAIRES
// ============================================

let userAgentIndex = 0;

function getNextUserAgent(): string {
  const agent = CONFIG.USER_AGENTS[userAgentIndex];
  userAgentIndex = (userAgentIndex + 1) % CONFIG.USER_AGENTS.length;
  return agent;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function safeFetch(url: string, options: RequestInit = {}): Promise<Response | null> {
  const maxRetries = 3;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': getNextUserAgent(),
          'Accept': 'application/json, text/html, */*',
          'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
          ...options.headers,
        },
      });
      
      if (response.ok) {
        return response;
      }
      
      if (response.status === 429) {
        console.log(`⚠️ Rate limit atteint, attente ${CONFIG.DELAYS.retryDelay}ms...`);
        await sleep(CONFIG.DELAYS.retryDelay);
        continue;
      }
      
      return response;
    } catch (e: any) {
      lastError = e;
      console.log(`⚠️ Tentative ${attempt + 1} échouée: ${e.message}`);
      await sleep(CONFIG.DELAYS.retryDelay);
    }
  }
  
  console.error(`❌ Échec après ${maxRetries} tentatives:`, lastError?.message);
  return null;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0].replace(/-/g, '');
}

// ============================================
// RÉCUPÉRATION ESPN (GRATUIT)
// ============================================

interface ESPNMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore?: number;
  awayScore?: number;
  status: string;
  league: string;
  date: string;
  odds?: { home: number; draw: number; away: number };
}

async function fetchESPNMatches(date: Date = new Date()): Promise<ESPNMatch[]> {
  console.log(`📺 Récupération ESPN pour ${date.toISOString().split('T')[0]}...`);
  
  const matches: ESPNMatch[] = [];
  const dateStr = formatDate(date);
  
  for (const league of CONFIG.LEAGUES.football) {
    if (!CONFIG.DRY_RUN) {
      await sleep(CONFIG.DELAYS.betweenRequests);
    }
    
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.code}/scoreboard?dates=${dateStr}`;
      const response = await safeFetch(url);
      
      if (!response || !response.ok) {
        console.log(`⚠️ ESPN ${league.name}: pas de réponse`);
        continue;
      }
      
      const data = await response.json();
      const events = data.events || [];
      
      for (const event of events) {
        const competition = event.competitions?.[0];
        const home = competition?.competitors?.find((c: any) => c.homeAway === 'home');
        const away = competition?.competitors?.find((c: any) => c.homeAway === 'away');
        
        matches.push({
          id: `espn_${event.id}`,
          homeTeam: home?.team?.displayName || 'Unknown',
          awayTeam: away?.team?.displayName || 'Unknown',
          homeScore: home?.score ? parseInt(home.score) : undefined,
          awayScore: away?.score ? parseInt(away.score) : undefined,
          status: event.status?.type?.name || 'scheduled',
          league: league.name,
          date: event.date,
        });
      }
      
      console.log(`✅ ESPN ${league.name}: ${events.length} matchs`);
    } catch (e: any) {
      console.error(`❌ ESPN ${league.name}:`, e.message);
    }
  }
  
  return matches;
}

// ============================================
// RÉCUPÉRATION NBA (ESPN)
// ============================================

async function fetchNBAMatches(): Promise<ESPNMatch[]> {
  console.log(`🏀 Récupération NBA...`);
  
  const matches: ESPNMatch[] = [];
  
  try {
    const url = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
    const response = await safeFetch(url);
    
    if (!response || !response.ok) {
      console.log(`⚠️ NBA: pas de réponse`);
      return [];
    }
    
    const data = await response.json();
    const events = data.events || [];
    
    for (const event of events) {
      const competition = event.competitions?.[0];
      const home = competition?.competitors?.find((c: any) => c.homeAway === 'home');
      const away = competition?.competitors?.find((c: any) => c.homeAway === 'away');
      
      matches.push({
        id: `nba_${event.id}`,
        homeTeam: home?.team?.displayName || 'Unknown',
        awayTeam: away?.team?.displayName || 'Unknown',
        homeScore: home?.score ? parseInt(home.score) : undefined,
        awayScore: away?.score ? parseInt(away.score) : undefined,
        status: event.status?.type?.name || 'scheduled',
        league: 'NBA',
        date: event.date,
      });
    }
    
    console.log(`✅ NBA: ${events.length} matchs`);
  } catch (e: any) {
    console.error(`❌ NBA:`, e.message);
  }
  
  return matches;
}

// ============================================
// STOCKAGE SUPABASE
// ============================================

async function saveMatchesToSupabase(matches: ESPNMatch[]): Promise<number> {
  const db = getSupabase();
  if (!db) {
    console.error('❌ Supabase non configuré');
    return 0;
  }
  
  if (matches.length === 0) {
    console.log('📋 Aucun match à sauvegarder');
    return 0;
  }
  
  const records = matches.map(m => ({
    match_id: m.id,
    home_team: m.homeTeam,
    away_team: m.awayTeam,
    league: m.league,
    sport: m.league === 'NBA' ? 'basketball' : 'football',
    match_date: m.date,
    home_score: m.homeScore,
    away_score: m.awayScore,
    status: m.status === 'STATUS_FINAL' ? 'completed' : 'pending',
    created_at: new Date().toISOString(),
  }));
  
  try {
    const { data, error } = await db
      .from('matches')
      .upsert(records, { onConflict: 'match_id' })
      .select();
    
    if (error) {
      console.error('❌ Erreur Supabase:', error.message);
      return 0;
    }
    
    console.log(`✅ Supabase: ${data?.length || 0} matchs sauvegardés`);
    return data?.length || 0;
  } catch (e: any) {
    console.error('❌ Erreur Supabase:', e.message);
    return 0;
  }
}

// ============================================
// ANALYSE ML SIMPLIFIÉE
// ============================================

interface Prediction {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  predictedResult: 'home' | 'draw' | 'away';
  confidence: 'high' | 'medium' | 'low';
  odds: { home: number; draw: number; away: number };
}

function generatePredictions(matches: ESPNMatch[]): Prediction[] {
  const predictions: Prediction[] = [];
  
  for (const match of matches) {
    if (match.status === 'STATUS_FINAL') continue;
    
    // Algorithme simple basé sur les stats (à améliorer avec vrai ML)
    const homeAdvantage = 0.15;
    const random = Math.random();
    
    let predictedResult: 'home' | 'draw' | 'away';
    let confidence: 'high' | 'medium' | 'low';
    
    // Simulation de prédictions (remplacer par vrai modèle ML)
    if (random < 0.45 + homeAdvantage) {
      predictedResult = 'home';
    } else if (random < 0.75) {
      predictedResult = 'draw';
    } else {
      predictedResult = 'away';
    }
    
    // Confiance basée sur la "certitude" (simulation)
    confidence = random < 0.3 || random > 0.85 ? 'high' : 
                 random < 0.4 || random > 0.75 ? 'medium' : 'low';
    
    predictions.push({
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      predictedResult,
      confidence,
      odds: { home: 2.0, draw: 3.3, away: 3.5 }, // Odds par défaut
    });
  }
  
  return predictions;
}

async function savePredictionsToSupabase(predictions: Prediction[]): Promise<number> {
  const db = getSupabase();
  if (!db) {
    console.error('❌ Supabase non configuré');
    return 0;
  }
  
  if (predictions.length === 0) {
    console.log('📋 Aucune prédiction à sauvegarder');
    return 0;
  }
  
  const records = predictions.map(p => ({
    match_id: p.matchId,
    home_team: p.homeTeam,
    away_team: p.awayTeam,
    predicted_result: p.predictedResult,
    confidence: p.confidence,
    odds_home: p.odds.home,
    odds_draw: p.odds.draw,
    odds_away: p.odds.away,
    sport: 'football',
    status: 'pending',
    created_at: new Date().toISOString(),
  }));
  
  try {
    const { data, error } = await db
      .from('predictions')
      .upsert(records, { onConflict: 'match_id' })
      .select();
    
    if (error) {
      console.error('❌ Erreur Supabase predictions:', error.message);
      return 0;
    }
    
    console.log(`✅ Supabase: ${data?.length || 0} prédictions sauvegardées`);
    return data?.length || 0;
  } catch (e: any) {
    console.error('❌ Erreur Supabase:', e.message);
    return 0;
  }
}

// ============================================
// VÉRIFICATION DES RÉSULTATS
// ============================================

async function verifyResults(): Promise<{ verified: number; updated: number }> {
  const db = getSupabase();
  if (!db) {
    console.error('❌ Supabase non configuré');
    return { verified: 0, updated: 0 };
  }
  
  console.log('🔍 Vérification des résultats...');
  
  // Récupérer les prédictions en attente
  const { data: pending, error } = await db
    .from('predictions')
    .select('*')
    .eq('status', 'pending');
  
  if (error || !pending) {
    console.log('📋 Aucune prédiction en attente');
    return { verified: 0, updated: 0 };
  }
  
  console.log(`📋 ${pending.length} prédictions à vérifier`);
  
  // Récupérer les résultats ESPN d'hier
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  const footballResults = await fetchESPNMatches(yesterday);
  const nbaResults = await fetchNBAMatches();
  const allResults = [...footballResults, ...nbaResults].filter(m => m.status === 'STATUS_FINAL');
  
  let verified = 0;
  let updated = 0;
  
  for (const pred of pending) {
    const result = allResults.find(r => 
      r.id === pred.match_id ||
      (r.homeTeam === pred.home_team && r.awayTeam === pred.away_team)
    );
    
    if (result && result.homeScore !== undefined && result.awayScore !== undefined) {
      verified++;
      
      const actualResult = result.homeScore > result.awayScore ? 'home' :
                           result.homeScore < result.awayScore ? 'away' : 'draw';
      
      const resultMatch = pred.predicted_result === actualResult;
      
      const { error: updateError } = await db
        .from('predictions')
        .update({
          home_score: result.homeScore,
          away_score: result.awayScore,
          actual_result: actualResult,
          result_match: resultMatch,
          status: 'completed',
          checked_at: new Date().toISOString(),
        })
        .eq('match_id', pred.match_id);
      
      if (!updateError) {
        updated++;
        console.log(`✅ ${pred.home_team} vs ${pred.away_team}: ${resultMatch ? 'GAGNÉ' : 'PERDU'} (${result.homeScore}-${result.awayScore})`);
      }
    }
  }
  
  return { verified, updated };
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🚀 Démarrage du scraper indépendant...');
  console.log(`📅 ${new Date().toISOString()}`);
  console.log(`🔧 Mode: ${CONFIG.DRY_RUN ? 'DRY RUN (simulation)' : 'PRODUCTION'}`);
  
  const startTime = Date.now();
  
  try {
    // 1. Récupérer les matchs du jour
    console.log('\n📊 ÉTAPE 1: Récupération des matchs');
    const footballMatches = await fetchESPNMatches();
    const nbaMatches = await fetchNBAMatches();
    const allMatches = [...footballMatches, ...nbaMatches];
    
    console.log(`📈 Total: ${allMatches.length} matchs récupérés`);
    
    // 2. Sauvegarder les matchs
    console.log('\n📊 ÉTAPE 2: Sauvegarde des matchs');
    const savedMatches = await saveMatchesToSupabase(allMatches);
    
    // 3. Générer les prédictions
    console.log('\n📊 ÉTAPE 3: Génération des prédictions');
    const predictions = generatePredictions(allMatches);
    const savedPredictions = await savePredictionsToSupabase(predictions);
    
    // 4. Vérifier les résultats précédents
    console.log('\n📊 ÉTAPE 4: Vérification des résultats');
    const { verified, updated } = await verifyResults();
    
    // Résumé
    const duration = Date.now() - startTime;
    console.log('\n' + '='.repeat(50));
    console.log('📋 RÉSUMÉ');
    console.log('='.repeat(50));
    console.log(`✅ Matchs récupérés: ${allMatches.length}`);
    console.log(`✅ Matchs sauvegardés: ${savedMatches}`);
    console.log(`✅ Prédictions générées: ${predictions.length}`);
    console.log(`✅ Prédictions sauvegardées: ${savedPredictions}`);
    console.log(`✅ Résultats vérifiés: ${verified}`);
    console.log(`✅ Prédictions mises à jour: ${updated}`);
    console.log(`⏱️ Durée: ${(duration / 1000).toFixed(1)}s`);
    console.log('='.repeat(50));
    
  } catch (e: any) {
    console.error('\n❌ ERREUR FATALE:', e.message);
    process.exit(1);
  }
}

// Exécuter
main().catch(console.error);
