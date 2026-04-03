/**
 * SCRAPER NHL/MLB DÉTAILLÉ DEPUIS ESPN
 * Récupère les stats avancées: shots, PIM, ERA, etc.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://aumsrakioetvvqopthbs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Types
interface NHLGameData {
  id: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  homeScore: number;
  awayScore: number;
  result: string;
  season: string;
  // Stats détaillées
  homeShots: number | null;
  awayShots: number | null;
  homePim: number | null;
  awayPim: number | null;
  homePpg: number | null;
  awayPpg: number | null;
  // Cotes
  oddsHome: number | null;
  oddsAway: number | null;
}

interface MLBGameData {
  id: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  homeScore: number;
  awayScore: number;
  result: string;
  season: string;
  // Stats détaillées
  homeHits: number | null;
  awayHits: number | null;
  homeErrors: number | null;
  awayErrors: number | null;
  homeHomeruns: number | null;
  awayHomeruns: number | null;
  // Lanceurs
  homePitcherEra: number | null;
  awayPitcherEra: number | null;
  // Cotes
  oddsHome: number | null;
  oddsAway: number | null;
}

/**
 * Convertit les cotes américaines en décimales
 */
function americanToDecimal(americanOdds: string | number | undefined): number | null {
  if (!americanOdds) return null;
  
  const odds = typeof americanOdds === 'string' 
    ? parseFloat(americanOdds.replace('+', '')) 
    : americanOdds;
  
  if (isNaN(odds) || odds === 0) return null;
  
  if (odds > 0) {
    return Math.round((1 + odds / 100) * 100) / 100;
  } else {
    return Math.round((1 + 100 / Math.abs(odds)) * 100) / 100;
  }
}

/**
 * Scrape les matchs NHL récents avec stats détaillées
 */
async function scrapeNHLRecent(): Promise<NHLGameData[]> {
  console.log('\n🏒 Scraping NHL récent avec stats détaillées...');
  
  const matches: NHLGameData[] = [];
  const today = new Date();
  
  // Scrape les 7 derniers jours
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
        
        // Stats détaillées
        const homeStats = homeComp.statistics || [];
        const awayStats = awayComp.statistics || [];
        
        const getStat = (stats: any[], name: string): number | null => {
          const stat = stats.find((s: any) => s.name === name);
          return stat?.value ?? stat?.displayValue ? parseFloat(stat.displayValue) : null;
        };
        
        // Cotes
        const odds = competition?.odds?.[0];
        const oddsHome = odds ? americanToDecimal(odds.homeTeamOdds?.moneyLine) : null;
        const oddsAway = odds ? americanToDecimal(odds.awayTeamOdds?.moneyLine) : null;
        
        const homeScore = parseInt(homeComp.score) || 0;
        const awayScore = parseInt(awayComp.score) || 0;
        
        let result = 'D';
        if (homeScore > awayScore) result = 'H';
        else if (awayScore > homeScore) result = 'A';
        
        matches.push({
          id: `nhl_espn_${event.id}`,
          homeTeam: homeComp.team?.displayName || 'Unknown',
          awayTeam: awayComp.team?.displayName || 'Unknown',
          date: event.date,
          homeScore,
          awayScore,
          result,
          season: '2024-25',
          homeShots: getStat(homeStats, 'shots') || getStat(homeStats, 'SOG'),
          awayShots: getStat(awayStats, 'shots') || getStat(awayStats, 'SOG'),
          homePim: getStat(homeStats, 'penaltyMinutes'),
          awayPim: getStat(awayStats, 'penaltyMinutes'),
          homePpg: getStat(homeStats, 'powerPlayGoals'),
          awayPpg: getStat(awayStats, 'powerPlayGoals'),
          oddsHome,
          oddsAway
        });
      }
      
      console.log(`   📅 ${date.toISOString().split('T')[0]}: ${events.length} matchs`);
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 200));
      
    } catch (e) {
      console.log(`   ⚠️ Erreur ${date.toISOString().split('T')[0]}`);
    }
  }
  
  return matches;
}

/**
 * Scrape les matchs MLB récents avec stats détaillées
 */
async function scrapeMLBRecent(): Promise<MLBGameData[]> {
  console.log('\n⚾ Scraping MLB récent avec stats détaillées...');
  
  const matches: MLBGameData[] = [];
  const today = new Date();
  
  // Scrape les 7 derniers jours
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
        
        // Stats détaillées
        const homeStats = homeComp.statistics || [];
        const awayStats = awayComp.statistics || [];
        
        const getStat = (stats: any[], name: string): number | null => {
          const stat = stats.find((s: any) => s.name === name);
          return stat?.value ?? stat?.displayValue ? parseFloat(stat.displayValue) : null;
        };
        
        // Cotes
        const odds = competition?.odds?.[0];
        const oddsHome = odds ? americanToDecimal(odds.homeTeamOdds?.moneyLine) : null;
        const oddsAway = odds ? americanToDecimal(odds.awayTeamOdds?.moneyLine) : null;
        
        // Lanceurs probables (ERA)
        const homePitcher = homeComp.probablePitcher || homeComp.startingPitcher;
        const awayPitcher = awayComp.probablePitcher || awayComp.startingPitcher;
        
        const homeScore = parseInt(homeComp.score) || 0;
        const awayScore = parseInt(awayComp.score) || 0;
        
        let result = 'D';
        if (homeScore > awayScore) result = 'H';
        else if (awayScore > homeScore) result = 'A';
        
        matches.push({
          id: `mlb_espn_${event.id}`,
          homeTeam: homeComp.team?.displayName || 'Unknown',
          awayTeam: awayComp.team?.displayName || 'Unknown',
          date: event.date,
          homeScore,
          awayScore,
          result,
          season: '2025',
          homeHits: getStat(homeStats, 'hits') || getStat(homeStats, 'H'),
          awayHits: getStat(awayStats, 'hits') || getStat(awayStats, 'H'),
          homeErrors: getStat(homeStats, 'errors') || getStat(homeStats, 'E'),
          awayErrors: getStat(awayStats, 'errors') || getStat(awayStats, 'E'),
          homeHomeruns: getStat(homeStats, 'homeRuns') || getStat(homeStats, 'HR'),
          awayHomeruns: getStat(awayStats, 'homeRuns') || getStat(awayStats, 'HR'),
          homePitcherEra: homePitcher?.era ? parseFloat(homePitcher.era) : null,
          awayPitcherEra: awayPitcher?.era ? parseFloat(awayPitcher.era) : null,
          oddsHome,
          oddsAway
        });
      }
      
      console.log(`   📅 ${date.toISOString().split('T')[0]}: ${events.length} matchs`);
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 200));
      
    } catch (e) {
      console.log(`   ⚠️ Erreur ${date.toISOString().split('T')[0]}`);
    }
  }
  
  return matches;
}

/**
 * Met à jour la base avec les nouvelles données
 */
async function updateDatabase(nhlMatches: NHLGameData[], mlbMatches: MLBGameData[]) {
  console.log('\n💾 Mise à jour de la base de données...');
  
  // NHL
  if (nhlMatches.length > 0) {
    for (const match of nhlMatches) {
      const { error } = await supabase
        .from('nhl_matches')
        .upsert({
          id: match.id,
          home_team: match.homeTeam,
          away_team: match.awayTeam,
          match_date: match.date,
          home_score: match.homeScore,
          away_score: match.awayScore,
          result: match.result,
          season: match.season,
          league_name: 'NHL',
          home_shots: match.homeShots,
          away_shots: match.awayShots,
          home_pim: match.homePim,
          away_pim: match.awayPim,
          home_ppg: match.homePpg,
          away_ppg: match.awayPpg,
          odds_home: match.oddsHome,
          odds_away: match.oddsAway,
          data_source: 'ESPN_Detailed'
        }, { onConflict: 'id' });
      
      if (error) {
        console.log(`   ❌ NHL ${match.homeTeam} vs ${match.awayTeam}: ${error.message}`);
      }
    }
    console.log(`   ✅ NHL: ${nhlMatches.length} matchs mis à jour`);
  }
  
  // MLB
  if (mlbMatches.length > 0) {
    for (const match of mlbMatches) {
      const { error } = await supabase
        .from('mlb_matches')
        .upsert({
          id: match.id,
          home_team: match.homeTeam,
          away_team: match.awayTeam,
          match_date: match.date,
          home_score: match.homeScore,
          away_score: match.awayScore,
          result: match.result,
          season: match.season,
          league_name: 'MLB',
          home_hits: match.homeHits,
          away_hits: match.awayHits,
          home_errors: match.homeErrors,
          away_errors: match.awayErrors,
          home_homeruns: match.homeHomeruns,
          away_homeruns: match.awayHomeruns,
          home_pitcher_era: match.homePitcherEra,
          away_pitcher_era: match.awayPitcherEra,
          odds_home: match.oddsHome,
          odds_away: match.oddsAway,
          data_source: 'ESPN_Detailed'
        }, { onConflict: 'id' });
      
      if (error) {
        console.log(`   ❌ MLB ${match.homeTeam} vs ${match.awayTeam}: ${error.message}`);
      }
    }
    console.log(`   ✅ MLB: ${mlbMatches.length} matchs mis à jour`);
  }
}

/**
 * Lance le réentraînement ML avec les nouvelles données
 */
async function retrainML() {
  console.log('\n🧠 Réentraînement ML avec nouvelles données...');
  
  // Compter les données enrichies
  const { data: nhl } = await supabase
    .from('nhl_matches')
    .select('id, home_shots, away_shots, odds_home')
    .not('home_shots', 'is', null)
    .limit(100);
  
  const { data: mlb } = await supabase
    .from('mlb_matches')
    .select('id, home_hits, away_hits, odds_home')
    .not('home_hits', 'is', null)
    .limit(100);
  
  const nhlWithStats = nhl?.filter(m => m.home_shots && m.odds_home).length || 0;
  const mlbWithStats = mlb?.filter(m => m.home_hits && m.odds_home).length || 0;
  
  console.log(`   📊 NHL avec stats: ${nhlWithStats}`);
  console.log(`   📊 MLB avec stats: ${mlbWithStats}`);
  
  if (nhlWithStats >= 30 || mlbWithStats >= 30) {
    console.log('\n   ✅ Assez de données pour réentraîner!');
    console.log('   💡 Lancez: npx tsx scripts/analyze-basic-nhl-mlb.ts');
  } else {
    console.log('\n   ⚠️ Pas encore assez de données enrichies');
    console.log('   💡 Relancez ce script quotidiennement pour accumuler les données');
  }
}

/**
 * MAIN
 */
async function main() {
  console.log('🚀 SCRAPER NHL/MLB DÉTAILLÉ DEPUIS ESPN');
  console.log('='.repeat(60));
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log('='.repeat(60));
  
  // Scraper les données
  const nhlMatches = await scrapeNHLRecent();
  const mlbMatches = await scrapeMLBRecent();
  
  console.log('\n📊 RÉSUMÉ:');
  console.log(`   🏒 NHL: ${nhlMatches.length} matchs avec stats`);
  console.log(`   ⚾ MLB: ${mlbMatches.length} matchs avec stats`);
  
  // Vérifier les stats récupérées
  const nhlWithShots = nhlMatches.filter(m => m.homeShots).length;
  const mlbWithHits = mlbMatches.filter(m => m.homeHits).length;
  const nhlWithOdds = nhlMatches.filter(m => m.oddsHome).length;
  const mlbWithOdds = mlbMatches.filter(m => m.oddsHome).length;
  
  console.log(`\n   📈 NHL avec shots: ${nhlWithShots}/${nhlMatches.length}`);
  console.log(`   📈 NHL avec cotes: ${nhlWithOdds}/${nhlMatches.length}`);
  console.log(`   📈 MLB avec hits: ${mlbWithHits}/${mlbMatches.length}`);
  console.log(`   📈 MLB avec cotes: ${mlbWithOdds}/${mlbMatches.length}`);
  
  // Mettre à jour la base
  await updateDatabase(nhlMatches, mlbMatches);
  
  // Vérifier si on peut réentraîner
  await retrainML();
  
  console.log('\n✅ Terminé!');
}

main().catch(console.error);
