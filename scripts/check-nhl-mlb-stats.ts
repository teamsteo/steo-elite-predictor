import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://aumsrakioetvvqopthbs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkStats() {
  console.log('📊 Vérification des données NHL/MLB en base\n');
  
  // NHL
  const { data: nhl, error: nhlError, count: nhlCount } = await supabase
    .from('nhl_matches')
    .select('*', { count: 'exact' })
    .limit(5);
  
  console.log('🏒 NHL:');
  if (nhlError) {
    console.log('   Erreur:', nhlError.message);
  } else {
    console.log('   Total matchs:', nhlCount);
    if (nhl && nhl.length > 0) {
      console.log('   Colonnes:', Object.keys(nhl[0]).join(', '));
      console.log('   Exemple:', JSON.stringify(nhl[0], null, 2));
    }
  }
  
  // MLB
  const { data: mlb, error: mlbError, count: mlbCount } = await supabase
    .from('mlb_matches')
    .select('*', { count: 'exact' })
    .limit(5);
  
  console.log('\n⚾ MLB:');
  if (mlbError) {
    console.log('   Erreur:', mlbError.message);
  } else {
    console.log('   Total matchs:', mlbCount);
    if (mlb && mlb.length > 0) {
      console.log('   Colonnes:', Object.keys(mlb[0]).join(', '));
      console.log('   Exemple:', JSON.stringify(mlb[0], null, 2));
    }
  }
  
  // Stats détaillées NHL
  if (nhlCount && nhlCount > 0) {
    const { data: nhlStats } = await supabase
      .from('nhl_matches')
      .select('home_score, away_score, result, home_shots, away_shots, home_pim, away_pim, odds_home, odds_away');
    
    if (nhlStats && nhlStats.length > 0) {
      const withShots = nhlStats.filter(m => m.home_shots !== null && m.home_shots !== undefined).length;
      const withPim = nhlStats.filter(m => m.home_pim !== null && m.home_pim !== undefined).length;
      const withOdds = nhlStats.filter(m => m.odds_home !== null && m.odds_home !== undefined).length;
      
      console.log('\n🏒 NHL Stats détaillées:');
      console.log('   Matchs avec tirs:', withShots);
      console.log('   Matchs avec PIM:', withPim);
      console.log('   Matchs avec cotes:', withOdds);
      
      // Home win rate
      const homeWins = nhlStats.filter(m => m.result === 'H' || m.result === 'home').length;
      console.log('   Victoires domicile:', homeWins, '/', nhlStats.length, `(${Math.round(homeWins/nhlStats.length*100)}%)`);
    }
  }
  
  // Stats détaillées MLB
  if (mlbCount && mlbCount > 0) {
    const { data: mlbStats } = await supabase
      .from('mlb_matches')
      .select('home_score, away_score, result, home_hits, away_hits, home_errors, away_errors, odds_home, odds_away');
    
    if (mlbStats && mlbStats.length > 0) {
      const withHits = mlbStats.filter(m => m.home_hits !== null && m.home_hits !== undefined).length;
      const withErrors = mlbStats.filter(m => m.home_errors !== null && m.home_errors !== undefined).length;
      const withOdds = mlbStats.filter(m => m.odds_home !== null && m.odds_home !== undefined).length;
      
      console.log('\n⚾ MLB Stats détaillées:');
      console.log('   Matchs avec coups sûrs:', withHits);
      console.log('   Matchs avec erreurs:', withErrors);
      console.log('   Matchs avec cotes:', withOdds);
      
      // Home win rate
      const homeWins = mlbStats.filter(m => m.result === 'H' || m.result === 'home').length;
      console.log('   Victoires domicile:', homeWins, '/', mlbStats.length, `(${Math.round(homeWins/mlbStats.length*100)}%)`);
    }
  }
}

checkStats().catch(console.error);
