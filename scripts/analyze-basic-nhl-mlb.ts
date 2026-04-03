/**
 * ANALYSE NHL/MLB AVEC DONNÉES LIMITÉES
 * Utilise les scores disponibles pour extraire des patterns
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://aumsrakioetvvqopthbs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MIN_SUCCESS_RATE = 70; // Réduit pour données limitées
const MIN_SAMPLE_SIZE = 50;

async function analyzeNHL() {
  console.log('\n🏒 ANALYSE NHL (données de base)...\n');

  const { data: matches } = await supabase
    .from('nhl_matches')
    .select('*');

  if (!matches || matches.length === 0) {
    console.log('❌ Pas de données NHL');
    return [];
  }

  const patterns: any[] = [];

  // 1. Avantage domicile global
  const homeWins = matches.filter(m => m.result === 'H').length;
  const homeWinRate = Math.round((homeWins / matches.length) * 100);
  console.log(`🏠 Avantage domicile NHL: ${homeWinRate}% (${homeWins}/${matches.length})`);

  // 2. Distribution des scores
  const scores = matches.filter(m => m.home_score && m.away_score);
  const totalGoals = scores.map(m => m.home_score + m.away_score);
  const avgGoals = totalGoals.reduce((a, b) => a + b, 0) / totalGoals.length;
  const medianGoals = totalGoals.sort((a, b) => a - b)[Math.floor(totalGoals.length / 2)];

  console.log(`📊 Moyenne buts/match: ${avgGoals.toFixed(2)}`);
  console.log(`📊 Médiane buts/match: ${medianGoals}`);

  // 3. Over/Under 5.5
  const over5_5 = scores.filter(m => (m.home_score + m.away_score) > 5.5).length;
  const over5_5Rate = Math.round((over5_5 / scores.length) * 100);
  console.log(`📈 Over 5.5: ${over5_5Rate}%`);

  // 4. Over/Under 6.5
  const over6_5 = scores.filter(m => (m.home_score + m.away_score) > 6.5).length;
  const over6_5Rate = Math.round((over6_5 / scores.length) * 100);
  console.log(`📈 Over 6.5: ${over6_5Rate}%`);

  // 5. Analyse par équipe domicile
  const homeTeams: Record<string, { wins: number; total: number }> = {};
  matches.forEach(m => {
    if (!homeTeams[m.home_team]) {
      homeTeams[m.home_team] = { wins: 0, total: 0 };
    }
    homeTeams[m.home_team].total++;
    if (m.result === 'H') homeTeams[m.home_team].wins++;
  });

  // Équipes dominantes à domicile (>60%)
  const dominantHomeTeams = Object.entries(homeTeams)
    .filter(([_, stats]) => stats.total >= 30 && (stats.wins / stats.total) >= 0.60)
    .sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total));

  console.log(`\n🏆 Équipes dominantes à domicile (≥60%):`);
  dominantHomeTeams.slice(0, 5).forEach(([team, stats]) => {
    const rate = Math.round((stats.wins / stats.total) * 100);
    console.log(`   ${team}: ${rate}% (${stats.wins}/${stats.total})`);
  });

  // 6. Créer patterns si pertinents
  if (dominantHomeTeams.length > 0) {
    patterns.push({
      id: 'nhl_home_dominant',
      sport: 'hockey',
      pattern_type: 'home_dominant_teams',
      condition: `home_team IN (${dominantHomeTeams.slice(0, 5).map(([t]) => `"${t}"`).join(', ')})`,
      outcome: 'home_win',
      sample_size: dominantHomeTeams.slice(0, 5).reduce((sum, [_, s]) => sum + s.total, 0),
      success_rate: Math.round(dominantHomeTeams.slice(0, 5).reduce((sum, [_, s]) => sum + (s.wins / s.total), 0) / 5 * 100),
      confidence: 0.65,
      description: `NHL: Équipes dominantes à domicile`,
      last_updated: new Date().toISOString()
    });
  }

  // Pattern Under 6.5 si fréquent
  if (over6_5Rate < 45) {
    patterns.push({
      id: 'nhl_under_6_5',
      sport: 'hockey',
      pattern_type: 'under_total',
      condition: 'total_goals < 6.5',
      outcome: 'under_6.5',
      sample_size: scores.length,
      success_rate: 100 - over6_5Rate,
      confidence: 0.7,
      description: `NHL: Under 6.5 buts (${100 - over6_5Rate}%)`,
      last_updated: new Date().toISOString()
    });
  }

  return patterns;
}

async function analyzeMLB() {
  console.log('\n⚾ ANALYSE MLB (données de base)...\n');

  const { data: matches } = await supabase
    .from('mlb_matches')
    .select('*');

  if (!matches || matches.length === 0) {
    console.log('❌ Pas de données MLB');
    return [];
  }

  const patterns: any[] = [];

  // 1. Avantage domicile global
  const homeWins = matches.filter(m => m.result === 'H').length;
  const homeWinRate = Math.round((homeWins / matches.length) * 100);
  console.log(`🏠 Avantage domicile MLB: ${homeWinRate}% (${homeWins}/${matches.length})`);

  // 2. Distribution des scores
  const scores = matches.filter(m => m.home_score && m.away_score);
  const totalRuns = scores.map(m => m.home_score + m.away_score);
  const avgRuns = totalRuns.reduce((a, b) => a + b, 0) / totalRuns.length;
  const medianRuns = totalRuns.sort((a, b) => a - b)[Math.floor(totalRuns.length / 2)];

  console.log(`📊 Moyenne points/match: ${avgRuns.toFixed(2)}`);
  console.log(`📊 Médiane points/match: ${medianRuns}`);

  // 3. Over/Under 7.5
  const over7_5 = scores.filter(m => (m.home_score + m.away_score) > 7.5).length;
  const over7_5Rate = Math.round((over7_5 / scores.length) * 100);
  console.log(`📈 Over 7.5: ${over7_5Rate}%`);

  // 4. Over/Under 8.5
  const over8_5 = scores.filter(m => (m.home_score + m.away_score) > 8.5).length;
  const over8_5Rate = Math.round((over8_5 / scores.length) * 100);
  console.log(`📈 Over 8.5: ${over8_5Rate}%`);

  // 5. Analyse par équipe domicile
  const homeTeams: Record<string, { wins: number; total: number }> = {};
  matches.forEach(m => {
    if (!homeTeams[m.home_team]) {
      homeTeams[m.home_team] = { wins: 0, total: 0 };
    }
    homeTeams[m.home_team].total++;
    if (m.result === 'H') homeTeams[m.home_team].wins++;
  });

  // Équipes dominantes à domicile (>58%)
  const dominantHomeTeams = Object.entries(homeTeams)
    .filter(([_, stats]) => stats.total >= 30 && (stats.wins / stats.total) >= 0.58)
    .sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total));

  console.log(`\n🏆 Équipes dominantes à domicile (≥58%):`);
  dominantHomeTeams.slice(0, 5).forEach(([team, stats]) => {
    const rate = Math.round((stats.wins / stats.total) * 100);
    console.log(`   ${team}: ${rate}% (${stats.wins}/${stats.total})`);
  });

  // 6. Analyse par équipe extérieur (faibles)
  const weakAwayTeams = Object.entries(
    matches.reduce((acc, m) => {
      if (!acc[m.away_team]) acc[m.away_team] = { wins: 0, total: 0 };
      acc[m.away_team].total++;
      if (m.result === 'A') acc[m.away_team].wins++;
      return acc;
    }, {} as Record<string, { wins: number; total: number }>)
  )
    .filter(([_, stats]) => stats.total >= 30 && (stats.wins / stats.total) <= 0.42)
    .sort((a, b) => (a[1].wins / a[1].total) - (b[1].wins / b[1].total));

  console.log(`\n❌ Équipes faibles à l'extérieur (≤42%):`);
  weakAwayTeams.slice(0, 5).forEach(([team, stats]) => {
    const rate = Math.round((stats.wins / stats.total) * 100);
    console.log(`   ${team}: ${rate}% (${stats.wins}/${stats.total})`);
  });

  // Pattern Under 8.5 si fréquent
  if (over8_5Rate < 45) {
    patterns.push({
      id: 'mlb_under_8_5',
      sport: 'baseball',
      pattern_type: 'under_total',
      condition: 'total_runs < 8.5',
      outcome: 'under_8.5',
      sample_size: scores.length,
      success_rate: 100 - over8_5Rate,
      confidence: 0.7,
      description: `MLB: Under 8.5 points (${100 - over8_5Rate}%)`,
      last_updated: new Date().toISOString()
    });
  }

  // Pattern équipes dominantes
  if (dominantHomeTeams.length > 0) {
    patterns.push({
      id: 'mlb_home_dominant',
      sport: 'baseball',
      pattern_type: 'home_dominant_teams',
      condition: `home_team IN (${dominantHomeTeams.slice(0, 5).map(([t]) => `"${t}"`).join(', ')})`,
      outcome: 'home_win',
      sample_size: dominantHomeTeams.slice(0, 5).reduce((sum, [_, s]) => sum + s.total, 0),
      success_rate: Math.round(dominantHomeTeams.slice(0, 5).reduce((sum, [_, s]) => sum + (s.wins / s.total), 0) / 5 * 100),
      confidence: 0.65,
      description: `MLB: Équipes dominantes à domicile`,
      last_updated: new Date().toISOString()
    });
  }

  return patterns;
}

async function main() {
  console.log('🧠 ANALYSE NHL/MLB AVEC DONNÉES LIMITÉES');
  console.log('='.repeat(60));

  const nhlPatterns = await analyzeNHL();
  const mlbPatterns = await analyzeMLB();

  console.log('\n' + '='.repeat(60));
  console.log('📊 PATTERNS TROUVÉS');
  console.log('='.repeat(60));

  const allPatterns = [...nhlPatterns, ...mlbPatterns];

  allPatterns.forEach(p => {
    console.log(`\n✅ ${p.sport.toUpperCase()}: ${p.pattern_type}`);
    console.log(`   Condition: ${p.condition}`);
    console.log(`   Succès: ${p.success_rate}% (${p.sample_size} matchs)`);
  });

  if (allPatterns.length > 0) {
    console.log('\n💾 Sauvegarde...');
    const { error } = await supabase.from('ml_patterns').insert(allPatterns);
    if (error) {
      console.log(`❌ ${error.message}`);
    } else {
      console.log(`✅ ${allPatterns.length} patterns sauvegardés!`);
    }
  }

  console.log('\n💡 RECOMMANDATIONS:');
  console.log('   1. Scraper les cotes (odds_home, odds_away)');
  console.log('   2. Ajouter stats goalies NHL (SV%, GAA)');
  console.log('   3. Ajouter stats lanceurs MLB (ERA, WHIP)');
}

main().catch(console.error);
