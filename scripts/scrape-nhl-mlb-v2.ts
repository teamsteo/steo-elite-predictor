/**
 * SCRAPER NHL/MLB AMÉLIORÉ - Avec stats détaillées et cotes
 * Version corrigée qui gère les contraintes de la base
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://aumsrakioetvvqopthbs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Scrape NHL avec gestion des stats ESPN
 */
async function scrapeNHL() {
  console.log('\n🏒 NHL Scraping...');
  
  const matches: any[] = [];
  const today = new Date();
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
    
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${dateStr}`
      );
      
      if (!response.ok) continue;
      
      const data = await response.json();
      const events = data.events || [];
      
      for (const event of events) {
        const competition = event.competitions?.[0];
        const homeComp = competition?.competitors?.find((c: any) => c.homeAway === 'home');
        const awayComp = competition?.competitors?.find((c: any) => c.homeAway === 'away');
        
        if (!homeComp || !awayComp) continue;
        
        // Récupérer les stats depuis les leaders si disponibles
        const homeLeaders = homeComp.leaders || [];
        const awayLeaders = awayComp.leaders || [];
        
        const getLeaderStat = (leaders: any[], name: string): number | null => {
          const leader = leaders.find((l: any) => l.name === name);
          return leader?.value ?? null;
        };
        
        const homeScore = parseInt(homeComp.score) || 0;
        const awayScore = parseInt(awayComp.score) || 0;
        
        // NHL: résultat valide = H, A (pas de D dans la contrainte)
        let result = homeScore > awayScore ? 'H' : awayScore > homeScore ? 'A' : null;
        
        // Ignorer les matchs nuls (pas dans la contrainte)
        if (!result) continue;
        
        // Cotes
        const odds = competition?.odds?.[0];
        let oddsHome: number | null = null;
        let oddsAway: number | null = null;
        
        if (odds?.homeTeamOdds?.moneyLine) {
          const ml = parseInt(odds.homeTeamOdds.moneyLine);
          oddsHome = ml > 0 ? (1 + ml/100) : (1 + 100/Math.abs(ml));
          oddsHome = Math.round(oddsHome * 100) / 100;
        }
        if (odds?.awayTeamOdds?.moneyLine) {
          const ml = parseInt(odds.awayTeamOdds.moneyLine);
          oddsAway = ml > 0 ? (1 + ml/100) : (1 + 100/Math.abs(ml));
          oddsAway = Math.round(oddsAway * 100) / 100;
        }
        
        matches.push({
          id: `nhl_espn_${event.id}`,
          home_team: homeComp.team?.displayName || 'Unknown',
          away_team: awayComp.team?.displayName || 'Unknown',
          match_date: event.date,
          home_score: homeScore,
          away_score: awayScore,
          result,
          season: '2024-25',
          league_name: 'NHL',
          home_shots: getLeaderStat(homeLeaders, 'shots') || getLeaderStat(homeLeaders, 'SOG'),
          away_shots: getLeaderStat(awayLeaders, 'shots') || getLeaderStat(awayLeaders, 'SOG'),
          odds_home: oddsHome,
          odds_away: oddsAway,
          data_source: 'ESPN_Detailed'
        });
      }
      
      console.log(`   📅 ${date.toISOString().split('T')[0]}: ${events.length} matchs`);
      await new Promise(r => setTimeout(r, 150));
      
    } catch (e) {
      console.log(`   ⚠️ Erreur ${date.toISOString().split('T')[0]}`);
    }
  }
  
  return matches;
}

/**
 * Scrape MLB avec stats
 */
async function scrapeMLB() {
  console.log('\n⚾ MLB Scraping...');
  
  const matches: any[] = [];
  const today = new Date();
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
    
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${dateStr}`
      );
      
      if (!response.ok) continue;
      
      const data = await response.json();
      const events = data.events || [];
      
      for (const event of events) {
        const competition = event.competitions?.[0];
        const homeComp = competition?.competitors?.find((c: any) => c.homeAway === 'home');
        const awayComp = competition?.competitors?.find((c: any) => c.homeAway === 'away');
        
        if (!homeComp || !awayComp) continue;
        
        // Stats
        const homeStats = homeComp.statistics || [];
        const awayStats = awayComp.statistics || [];
        
        const getStat = (stats: any[], name: string): number | null => {
          const stat = stats.find((s: any) => s.name === name);
          const val = stat?.value ?? stat?.displayValue;
          return val ? parseFloat(val) : null;
        };
        
        const homeScore = parseInt(homeComp.score) || 0;
        const awayScore = parseInt(awayComp.score) || 0;
        
        // MLB: résultat = H, A (pas de D)
        let result = homeScore > awayScore ? 'H' : awayScore > homeScore ? 'A' : null;
        
        // Ignorer les matchs nuls
        if (!result) continue;
        
        // Cotes
        const odds = competition?.odds?.[0];
        let oddsHome: number | null = null;
        let oddsAway: number | null = null;
        
        if (odds?.homeTeamOdds?.moneyLine) {
          const ml = parseInt(odds.homeTeamOdds.moneyLine);
          oddsHome = ml > 0 ? (1 + ml/100) : (1 + 100/Math.abs(ml));
          oddsHome = Math.round(oddsHome * 100) / 100;
        }
        if (odds?.awayTeamOdds?.moneyLine) {
          const ml = parseInt(odds.awayTeamOdds.moneyLine);
          oddsAway = ml > 0 ? (1 + ml/100) : (1 + 100/Math.abs(ml));
          oddsAway = Math.round(oddsAway * 100) / 100;
        }
        
        // Lanceurs probables
        const homePitcher = homeComp.probablePitcher;
        const awayPitcher = awayComp.probablePitcher;
        
        matches.push({
          id: `mlb_espn_${event.id}`,
          home_team: homeComp.team?.displayName || 'Unknown',
          away_team: awayComp.team?.displayName || 'Unknown',
          match_date: event.date,
          home_score: homeScore,
          away_score: awayScore,
          result,
          season: '2025',
          league_name: 'MLB',
          home_hits: getStat(homeStats, 'hits') || getStat(homeStats, 'H'),
          away_hits: getStat(awayStats, 'hits') || getStat(awayStats, 'H'),
          home_errors: getStat(homeStats, 'errors') || getStat(homeStats, 'E'),
          away_errors: getStat(awayStats, 'errors') || getStat(awayStats, 'E'),
          home_homeruns: getStat(homeStats, 'homeRuns'),
          away_homeruns: getStat(awayStats, 'homeRuns'),
          home_pitcher_era: homePitcher?.era ? parseFloat(homePitcher.era) : null,
          away_pitcher_era: awayPitcher?.era ? parseFloat(awayPitcher.era) : null,
          odds_home: oddsHome,
          odds_away: oddsAway,
          data_source: 'ESPN_Detailed'
        });
      }
      
      console.log(`   📅 ${date.toISOString().split('T')[0]}: ${events.length} matchs`);
      await new Promise(r => setTimeout(r, 150));
      
    } catch (e) {
      console.log(`   ⚠️ Erreur ${date.toISOString().split('T')[0]}`);
    }
  }
  
  return matches;
}

/**
 * Upsert dans la base
 */
async function saveMatches(table: string, matches: any[]) {
  console.log(`\n💾 Sauvegarde ${table}...`);
  
  let saved = 0;
  
  for (const match of matches) {
    const { error } = await supabase
      .from(table)
      .upsert(match, { onConflict: 'id' });
    
    if (!error) saved++;
  }
  
  console.log(`   ✅ ${saved}/${matches.length} matchs sauvegardés`);
  return saved;
}

/**
 * Vérifie les stats disponibles
 */
async function checkStats() {
  console.log('\n📊 Vérification des stats disponibles...');
  
  // NHL avec shots
  const { data: nhlShots } = await supabase
    .from('nhl_matches')
    .select('id, home_shots, away_shots, odds_home')
    .not('home_shots', 'is', null);
  
  const { data: nhlOdds } = await supabase
    .from('nhl_matches')
    .select('id')
    .not('odds_home', 'is', null);
  
  // MLB avec hits
  const { data: mlbHits } = await supabase
    .from('mlb_matches')
    .select('id, home_hits, away_hits, odds_home')
    .not('home_hits', 'is', null);
  
  const { data: mlbOdds } = await supabase
    .from('mlb_matches')
    .select('id')
    .not('odds_home', 'is', null);
  
  console.log(`   🏒 NHL avec shots: ${nhlShots?.length || 0}`);
  console.log(`   🏒 NHL avec cotes: ${nhlOdds?.length || 0}`);
  console.log(`   ⚾ MLB avec hits: ${mlbHits?.length || 0}`);
  console.log(`   ⚾ MLB avec cotes: ${mlbOdds?.length || 0}`);
  
  return {
    nhlShots: nhlShots?.length || 0,
    nhlOdds: nhlOdds?.length || 0,
    mlbHits: mlbHits?.length || 0,
    mlbOdds: mlbOdds?.length || 0
  };
}

async function main() {
  console.log('🚀 SCRAPER NHL/MLB DÉTAILLÉ');
  console.log('='.repeat(60));
  
  // Scrape
  const nhlMatches = await scrapeNHL();
  const mlbMatches = await scrapeMLB();
  
  // Stats récupérées
  const nhlWithShots = nhlMatches.filter(m => m.home_shots).length;
  const mlbWithHits = mlbMatches.filter(m => m.home_hits).length;
  const nhlWithOdds = nhlMatches.filter(m => m.odds_home).length;
  const mlbWithOdds = mlbMatches.filter(m => m.odds_home).length;
  
  console.log(`\n📊 Stats récupérées:`);
  console.log(`   🏒 NHL shots: ${nhlWithShots}/${nhlMatches.length}`);
  console.log(`   🏒 NHL cotes: ${nhlWithOdds}/${nhlMatches.length}`);
  console.log(`   ⚾ MLB hits: ${mlbWithHits}/${mlbMatches.length}`);
  console.log(`   ⚾ MLB cotes: ${mlbWithOdds}/${mlbMatches.length}`);
  
  // Sauvegarder
  await saveMatches('nhl_matches', nhlMatches);
  await saveMatches('mlb_matches', mlbMatches);
  
  // Vérifier
  await checkStats();
  
  console.log('\n✅ Terminé!');
}

main().catch(console.error);
