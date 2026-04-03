/**
 * NHL & MLB Historical Data Scraper
 * 
 * Scrape les données des 2 dernières saisons pour:
 * - NHL (hockey): 2023-24 et 2024-25
 * - MLB (baseball): 2023 et 2024
 * 
 * Sources:
 * - ESPN API (gratuit, pas de clé)
 * - MLB Stats API (officiel, gratuit)
 * - NHL Stats API (officiel, gratuit)
 */

import { createClient } from '@supabase/supabase-js';

// Configuration Supabase
const SUPABASE_URL = 'https://aumsrakioetvvqopthbs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// INTERFACES
// ============================================

interface NHLGame {
  id: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  result: 'H' | 'A' | 'OT';
  season: string;
  match_date: string;
  league_name: string;
  home_shots?: number;
  away_shots?: number;
  home_pim?: number;
  away_pim?: number;
  home_ppg?: number;
  away_ppg?: number;
  home_sog?: number;
  away_sog?: number;
  odds_home?: number;
  odds_away?: number;
  total_line?: number;
  data_source: string;
}

interface MLBGame {
  id: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  result: 'H' | 'A';
  season: string;
  match_date: string;
  league_name: string;
  home_hits?: number;
  away_hits?: number;
  home_errors?: number;
  away_errors?: number;
  home_homeruns?: number;
  away_homeruns?: number;
  innings?: number;
  odds_home?: number;
  odds_away?: number;
  total_line?: number;
  home_pitcher_era?: number;
  away_pitcher_era?: number;
  data_source: string;
}

// ============================================
// NHL SCRAPER
// ============================================

async function fetchNHLGamesForDate(dateStr: string): Promise<any[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${dateStr}`;
  
  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    return data.events || [];
  } catch (e) {
    console.log(`   ⚠️ Erreur ${dateStr}: ${e}`);
    return [];
  }
}

async function scrapeNHLSeason(season: string): Promise<NHLGame[]> {
  console.log(`\n🏒 Scraping NHL saison ${season}...`);
  
  // Saison NHL: octobre à avril (regular season)
  const year1 = parseInt(`20${season.substring(0, 2)}`);
  const year2 = parseInt(`20${season.substring(2, 4)}`);
  
  const games: NHLGame[] = [];
  const dates: string[] = [];
  
  // Générer les dates (octobre à avril)
  for (let month = 10; month <= 12; month++) {
    for (let day = 1; day <= 31; day++) {
      const mm = month.toString().padStart(2, '0');
      const dd = day.toString().padStart(2, '0');
      dates.push(`${year1}${mm}${dd}`);
    }
  }
  for (let month = 1; month <= 4; month++) {
    for (let day = 1; day <= 31; day++) {
      const mm = month.toString().padStart(2, '0');
      const dd = day.toString().padStart(2, '0');
      dates.push(`${year2}${mm}${dd}`);
    }
  }
  
  console.log(`   📅 ${dates.length} dates à vérifier...`);
  
  let processed = 0;
  let found = 0;
  
  // Traiter par batch de 7 jours
  for (let i = 0; i < dates.length; i += 7) {
    const batch = dates.slice(i, i + 7);
    
    const batchPromises = batch.map(date => fetchNHLGamesForDate(date));
    const batchResults = await Promise.all(batchPromises);
    
    for (const events of batchResults) {
      for (const event of events) {
        if (event.status?.type?.completed === true) {
          const competition = event.competitions?.[0];
          const home = competition?.competitors?.find((c: any) => c.homeAway === 'home');
          const away = competition?.competitors?.find((c: any) => c.homeAway === 'away');
          
          if (home && away) {
            const homeScore = parseInt(home.score) || 0;
            const awayScore = parseInt(away.score) || 0;
            
            let result: 'H' | 'A' | 'OT' = homeScore > awayScore ? 'H' : 'A';
            // Check for overtime
            if (event.status?.type?.shortDetail?.includes('OT')) {
              result = result; // Keep the result but note it was OT
            }
            
            games.push({
              id: `nhl_${event.id}`,
              home_team: home.team?.displayName || home.team?.shortDisplayName || 'Unknown',
              away_team: away.team?.displayName || away.team?.shortDisplayName || 'Unknown',
              home_score: homeScore,
              away_score: awayScore,
              result,
              season,
              match_date: event.date?.split('T')[0] || '',
              league_name: 'NHL',
              data_source: 'ESPN'
            });
            found++;
          }
        }
      }
    }
    
    processed += batch.length;
    if (processed % 30 === 0) {
      console.log(`   📊 Progression: ${processed}/${dates.length} dates, ${found} matchs trouvés`);
    }
    
    // Rate limiting
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`   ✅ ${found} matchs NHL récupérés pour ${season}`);
  return games;
}

// ============================================
// MLB SCRAPER
// ============================================

async function fetchMLBGamesForDate(dateStr: string): Promise<any[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${dateStr}`;
  
  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    return data.events || [];
  } catch (e) {
    return [];
  }
}

async function fetchMLBFromStatsAPI(year: number): Promise<MLBGame[]> {
  console.log(`   📡 MLB Stats API pour ${year}...`);
  
  const games: MLBGame[] = [];
  
  try {
    // MLB Stats API - schedule endpoint
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${year}-03-01&endDate=${year}-11-30&hydrate=team,linescore`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.dates) {
      for (const dateData of data.dates) {
        for (const game of dateData.games || []) {
          if (game.status?.codedGameState === 'F') { // Final
            const homeTeam = game.teams?.home?.team?.name || 'Unknown';
            const awayTeam = game.teams?.away?.team?.name || 'Unknown';
            const homeScore = game.teams?.home?.score || 0;
            const awayScore = game.teams?.away?.score || 0;
            
            games.push({
              id: `mlb_${game.gamePk}`,
              home_team: homeTeam,
              away_team: awayTeam,
              home_score: homeScore,
              away_score: awayScore,
              result: homeScore > awayScore ? 'H' : 'A',
              season: year.toString(),
              match_date: game.officialDate || game.gameDate?.split('T')[0] || '',
              league_name: 'MLB',
              data_source: 'MLB_Stats_API'
            });
          }
        }
      }
    }
  } catch (e) {
    console.log(`   ⚠️ Erreur MLB Stats API: ${e}`);
  }
  
  return games;
}

async function scrapeMLBSeason(year: number): Promise<MLBGame[]> {
  console.log(`\n⚾ Scraping MLB saison ${year}...`);
  
  // Essayer d'abord MLB Stats API
  const games = await fetchMLBFromStatsAPI(year);
  
  if (games.length > 0) {
    console.log(`   ✅ ${games.length} matchs MLB récupérés pour ${year}`);
    return games;
  }
  
  // Fallback vers ESPN
  console.log(`   📡 Fallback vers ESPN...`);
  
  const allGames: MLBGame[] = [];
  const dates: string[] = [];
  
  // Saison MLB: mars à octobre
  for (let month = 3; month <= 10; month++) {
    for (let day = 1; day <= 31; day++) {
      const mm = month.toString().padStart(2, '0');
      const dd = day.toString().padStart(2, '0');
      dates.push(`${year}${mm}${dd}`);
    }
  }
  
  let found = 0;
  
  for (let i = 0; i < dates.length; i += 7) {
    const batch = dates.slice(i, i + 7);
    
    const batchPromises = batch.map(date => fetchMLBGamesForDate(date));
    const batchResults = await Promise.all(batchPromises);
    
    for (const events of batchResults) {
      for (const event of events) {
        if (event.status?.type?.completed === true) {
          const competition = event.competitions?.[0];
          const home = competition?.competitors?.find((c: any) => c.homeAway === 'home');
          const away = competition?.competitors?.find((c: any) => c.homeAway === 'away');
          
          if (home && away) {
            const homeScore = parseInt(home.score) || 0;
            const awayScore = parseInt(away.score) || 0;
            
            allGames.push({
              id: `mlb_${event.id}`,
              home_team: home.team?.displayName || 'Unknown',
              away_team: away.team?.displayName || 'Unknown',
              home_score: homeScore,
              away_score: awayScore,
              result: homeScore > awayScore ? 'H' : 'A',
              season: year.toString(),
              match_date: event.date?.split('T')[0] || '',
              league_name: 'MLB',
              data_source: 'ESPN'
            });
            found++;
          }
        }
      }
    }
    
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`   ✅ ${found} matchs MLB récupérés pour ${year}`);
  return allGames;
}

// ============================================
// SUPABASE STORAGE
// ============================================

async function createTablesIfNotExist(): Promise<void> {
  console.log('\n📋 Vérification des tables...');
  
  // Vérifier si les tables existent, sinon créer
  const { error: nhlError } = await supabase
    .from('nhl_matches')
    .select('id')
    .limit(1);
  
  if (nhlError?.message?.includes('Could not find')) {
    console.log('   Création table nhl_matches...');
    // La table doit être créée via SQL dans Supabase
  } else {
    console.log('   ✅ Table nhl_matches existe');
  }
  
  const { error: mlbError } = await supabase
    .from('mlb_matches')
    .select('id')
    .limit(1);
  
  if (mlbError?.message?.includes('Could not find')) {
    console.log('   Création table mlb_matches...');
  } else {
    console.log('   ✅ Table mlb_matches existe');
  }
}

async function saveNHLGames(games: NHLGame[]): Promise<number> {
  if (games.length === 0) return 0;
  
  console.log(`\n💾 Sauvegarde de ${games.length} matchs NHL...`);
  
  let saved = 0;
  const batchSize = 100;
  
  for (let i = 0; i < games.length; i += batchSize) {
    const batch = games.slice(i, i + batchSize);
    
    const { error } = await supabase
      .from('nhl_matches')
      .upsert(batch, { onConflict: 'id' });
    
    if (error) {
      console.log(`   ⚠️ Erreur batch: ${error.message}`);
    } else {
      saved += batch.length;
    }
  }
  
  console.log(`   ✅ ${saved} matchs NHL sauvegardés`);
  return saved;
}

async function saveMLBGames(games: MLBGame[]): Promise<number> {
  if (games.length === 0) return 0;
  
  console.log(`\n💾 Sauvegarde de ${games.length} matchs MLB...`);
  
  let saved = 0;
  const batchSize = 100;
  
  for (let i = 0; i < games.length; i += batchSize) {
    const batch = games.slice(i, i + batchSize);
    
    const { error } = await supabase
      .from('mlb_matches')
      .upsert(batch, { onConflict: 'id' });
    
    if (error) {
      console.log(`   ⚠️ Erreur batch: ${error.message}`);
    } else {
      saved += batch.length;
    }
  }
  
  console.log(`   ✅ ${saved} matchs MLB sauvegardés`);
  return saved;
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🏒⚾ NHL & MLB HISTORICAL DATA SCRAPER');
  console.log('='.repeat(70));
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log('='.repeat(70));
  
  // Vérifier/créer les tables
  await createTablesIfNotExist();
  
  // ===== NHL =====
  const nhlGames: NHLGame[] = [];
  
  // Saison 2023-24
  const nhl2324 = await scrapeNHLSeason('202324');
  nhlGames.push(...nhl2324);
  
  // Saison 2024-25
  const nhl2425 = await scrapeNHLSeason('202425');
  nhlGames.push(...nhl2425);
  
  // Sauvegarder NHL
  const nhlSaved = await saveNHLGames(nhlGames);
  
  // ===== MLB =====
  const mlbGames: MLBGame[] = [];
  
  // Saison 2023
  const mlb23 = await scrapeMLBSeason(2023);
  mlbGames.push(...mlb23);
  
  // Saison 2024
  const mlb24 = await scrapeMLBSeason(2024);
  mlbGames.push(...mlb24);
  
  // Sauvegarder MLB
  const mlbSaved = await saveMLBGames(mlbGames);
  
  // Résumé
  console.log('\n' + '='.repeat(70));
  console.log('📊 RÉSUMÉ');
  console.log('='.repeat(70));
  console.log(`🏒 NHL: ${nhlSaved} matchs sauvegardés`);
  console.log(`⚾ MLB: ${mlbSaved} matchs sauvegardés`);
  console.log(`📊 TOTAL: ${nhlSaved + mlbSaved} matchs`);
  
  console.log('\n🎉 SCRAPPING TERMINÉ!');
}

main().catch(console.error);
