import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://aumsrakioetvvqopthbs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Intervalle de confiance Wilson
function wilsonCI(successes: number, trials: number): { lower: number; upper: number } {
  if (trials === 0) return { lower: 0, upper: 0 };
  const p = successes / trials;
  const z = 1.96;
  const n = trials;
  const denominator = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return {
    lower: Math.round(((center - margin) / denominator) * 100),
    upper: Math.round(((center + margin) / denominator) * 100)
  };
}

async function analyzePatterns() {
  console.log('📊 ANALYSE DES PATTERNS NHL/MLB AVEC DONNÉES DISPONIBLES\n');
  console.log('='.repeat(60));

  // ============ NHL ============
  console.log('\n🏒 NHL - Analyse par équipe\n');
  
  const { data: nhl } = await supabase
    .from('nhl_matches')
    .select('home_team, away_team, result, home_score, away_score');
  
  if (nhl && nhl.length > 0) {
    // Grouper par équipe à domicile
    const teamStats: Record<string, { home: number; homeWins: number; away: number; awayWins: number; totalGoals: number; games: number }> = {};
    
    for (const match of nhl) {
      // Stats domicile
      if (!teamStats[match.home_team]) {
        teamStats[match.home_team] = { home: 0, homeWins: 0, away: 0, awayWins: 0, totalGoals: 0, games: 0 };
      }
      teamStats[match.home_team].home++;
      teamStats[match.home_team].totalGoals += (match.home_score || 0) + (match.away_score || 0);
      teamStats[match.home_team].games++;
      if (match.result === 'H') teamStats[match.home_team].homeWins++;
      
      // Stats extérieur
      if (!teamStats[match.away_team]) {
        teamStats[match.away_team] = { home: 0, homeWins: 0, away: 0, awayWins: 0, totalGoals: 0, games: 0 };
      }
      teamStats[match.away_team].away++;
      if (match.result === 'A') teamStats[match.away_team].awayWins++;
    }
    
    // Trouver les équipes avec avantage domicile significatif
    const homePatterns: { team: string; wins: number; games: number; rate: number; ci: { lower: number; upper: number } }[] = [];
    
    for (const [team, stats] of Object.entries(teamStats)) {
      if (stats.home >= 30) { // Minimum 30 matchs à domicile
        const rate = Math.round((stats.homeWins / stats.home) * 100);
        const ci = wilsonCI(stats.homeWins, stats.home);
        
        // Pattern significatif si CI lower > 55%
        if (ci.lower > 55) {
          homePatterns.push({ team, wins: stats.homeWins, games: stats.home, rate, ci });
        }
      }
    }
    
    // Trier par taux de succès
    homePatterns.sort((a, b) => b.rate - a.rate);
    
    console.log('🏆 Équipes avec avantage DOMICILE significatif (CI > 55%):\n');
    for (const p of homePatterns.slice(0, 10)) {
      console.log(`   ${p.team}: ${p.rate}% (${p.wins}/${p.games}) CI [${p.ci.lower}%, ${p.ci.upper}%]`);
    }
    
    // Analyser Over/Under
    const avgGoals = nhl.reduce((sum, m) => sum + (m.home_score || 0) + (m.away_score || 0), 0) / nhl.length;
    const over55 = nhl.filter(m => ((m.home_score || 0) + (m.away_score || 0)) > 5.5).length;
    const over65 = nhl.filter(m => ((m.home_score || 0) + (m.away_score || 0)) > 6.5).length;
    
    console.log(`\n📈 Stats Buts NHL:`);
    console.log(`   Moyenne buts/match: ${avgGoals.toFixed(2)}`);
    console.log(`   Over 5.5: ${Math.round(over55/nhl.length*100)}%`);
    console.log(`   Over 6.5: ${Math.round(over65/nhl.length*100)}%`);
  }

  // ============ MLB ============
  console.log('\n\n⚾ MLB - Analyse par équipe\n');
  
  const { data: mlb } = await supabase
    .from('mlb_matches')
    .select('home_team, away_team, result, home_score, away_score');
  
  if (mlb && mlb.length > 0) {
    // Grouper par équipe
    const teamStats: Record<string, { home: number; homeWins: number; away: number; awayWins: number; totalRuns: number }> = {};
    
    for (const match of mlb) {
      if (!teamStats[match.home_team]) {
        teamStats[match.home_team] = { home: 0, homeWins: 0, away: 0, awayWins: 0, totalRuns: 0 };
      }
      teamStats[match.home_team].home++;
      teamStats[match.home_team].totalRuns += (match.home_score || 0) + (match.away_score || 0);
      if (match.result === 'H') teamStats[match.home_team].homeWins++;
      
      if (!teamStats[match.away_team]) {
        teamStats[match.away_team] = { home: 0, homeWins: 0, away: 0, awayWins: 0, totalRuns: 0 };
      }
      teamStats[match.away_team].away++;
      if (match.result === 'A') teamStats[match.away_team].awayWins++;
    }
    
    // Patterns domicile significatifs
    const homePatterns: { team: string; wins: number; games: number; rate: number; ci: { lower: number; upper: number } }[] = [];
    
    for (const [team, stats] of Object.entries(teamStats)) {
      if (stats.home >= 50) {
        const rate = Math.round((stats.homeWins / stats.home) * 100);
        const ci = wilsonCI(stats.homeWins, stats.home);
        
        if (ci.lower > 55) {
          homePatterns.push({ team, wins: stats.homeWins, games: stats.home, rate, ci });
        }
      }
    }
    
    homePatterns.sort((a, b) => b.rate - a.rate);
    
    console.log('🏆 Équipes avec avantage DOMICILE significatif (CI > 55%):\n');
    for (const p of homePatterns.slice(0, 10)) {
      console.log(`   ${p.team}: ${p.rate}% (${p.wins}/${p.games}) CI [${p.ci.lower}%, ${p.ci.upper}%]`);
    }
    
    // Analyser Over/Under
    const avgRuns = mlb.reduce((sum, m) => sum + (m.home_score || 0) + (m.away_score || 0), 0) / mlb.length;
    const over75 = mlb.filter(m => ((m.home_score || 0) + (m.away_score || 0)) > 7.5).length;
    const over85 = mlb.filter(m => ((m.home_score || 0) + (m.away_score || 0)) > 8.5).length;
    
    console.log(`\n📈 Stats Points MLB:`);
    console.log(`   Moyenne points/match: ${avgRuns.toFixed(2)}`);
    console.log(`   Over 7.5: ${Math.round(over75/mlb.length*100)}%`);
    console.log(`   Over 8.5: ${Math.round(over85/mlb.length*100)}%`);
    
    // Patterns par équipe - Over
    console.log('\n📈 Équipes avec Over 7.5 fréquent:\n');
    const overPatterns: { team: string; overs: number; games: number; rate: number }[] = [];
    
    for (const [team, stats] of Object.entries(teamStats)) {
      if (stats.home >= 30) {
        // Recalculer pour cette équipe à domicile
        const teamHomeGames = mlb.filter(m => m.home_team === team);
        const overs = teamHomeGames.filter(m => ((m.home_score || 0) + (m.away_score || 0)) > 7.5).length;
        const rate = Math.round((overs / teamHomeGames.length) * 100);
        const ci = wilsonCI(overs, teamHomeGames.length);
        
        if (ci.lower > 55) {
          overPatterns.push({ team, overs, games: teamHomeGames.length, rate });
        }
      }
    }
    
    overPatterns.sort((a, b) => b.rate - a.rate);
    for (const p of overPatterns.slice(0, 5)) {
      console.log(`   ${p.team}: ${p.rate}% Over 7.5 (${p.overs}/${p.games})`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 RÉSUMÉ');
  console.log('='.repeat(60));
  console.log('\n⚠️ Les cotes (odds) sont NULL - impossible de créer des patterns sur les favoris');
  console.log('⚠️ Les stats avancées (tirs, hits) sont NULL - patterns limités');
  console.log('\n💡 SOLUTION: Scraper les cotes depuis ESPN pour améliorer les patterns');
}

analyzePatterns().catch(console.error);
