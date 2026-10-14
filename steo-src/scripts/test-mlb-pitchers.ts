import { fetchMLBMatchups, analyzePitcherMatchup } from '../src/lib/mlbPitcherService';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('    🎯 TEST MLB PITCHER SERVICE');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Récupérer les matchs du jour
  const matchups = await fetchMLBMatchups();
  
  console.log(`📊 ${matchups.length} matchs trouvés\n`);
  
  for (const matchup of matchups) {
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`⚾ ${matchup.awayTeam} @ ${matchup.homeTeam}`);
    console.log(`   Status: ${matchup.status}`);
    
    if (matchup.awayPitcher) {
      console.log(`\n   🎽 ${matchup.awayPitcher.name} (${matchup.awayPitcher.teamName})`);
      console.log(`      ERA: ${matchup.awayPitcher.era} | WHIP: ${matchup.awayPitcher.whip}`);
      console.log(`      K/9: ${matchup.awayPitcher.k9} | BB/9: ${matchup.awayPitcher.bb9}`);
      console.log(`      W-L: ${matchup.awayPitcher.wins}-${matchup.awayPitcher.losses}`);
    }
    
    if (matchup.homePitcher) {
      console.log(`\n   🎽 ${matchup.homePitcher.name} (${matchup.homePitcher.teamName})`);
      console.log(`      ERA: ${matchup.homePitcher.era} | WHIP: ${matchup.homePitcher.whip}`);
      console.log(`      K/9: ${matchup.homePitcher.k9} | BB/9: ${matchup.homePitcher.bb9}`);
      console.log(`      W-L: ${matchup.homePitcher.wins}-${matchup.homePitcher.losses}`);
    }
    
    // Analyse
    const analysis = analyzePitcherMatchup(matchup);
    console.log('\n   📈 ANALYSE:');
    console.log(`      Avantage: ${analysis.pitcherAdvantage.toUpperCase()} (${analysis.advantageConfidence}%)`);
    console.log(`      Runs attendus: ${analysis.totalRunsExpected}`);
    console.log(`      Recommandation O/U: ${analysis.overUnderRecommendation.toUpperCase()} (${analysis.overUnderConfidence}%)`);
    if (analysis.reasoning.length > 0) {
      console.log(`      Raisons:`);
      analysis.reasoning.forEach(r => console.log(`        • ${r}`));
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('    ✅ TEST TERMINÉ');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
