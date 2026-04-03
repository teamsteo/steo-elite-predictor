import { generateEnhancedMLBAnalysis } from '../src/lib/mlbEnhancedAnalysis';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('    🎯 TEST MLB ENHANCED ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Test avec des matchs d'aujourd'hui
  const tests = [
    { home: 'Baltimore Orioles', away: 'Minnesota Twins' },
    { home: 'Philadelphia Phillies', away: 'Texas Rangers' },
    { home: 'Atlanta Braves', away: 'Kansas City Royals' },
    { home: 'Cincinnati Reds', away: 'Boston Red Sox' },
  ];
  
  for (const test of tests) {
    console.log(`\n⚾ ${test.away} @ ${test.home}`);
    console.log('─────────────────────────────────────────────────────────────');
    
    const analysis = await generateEnhancedMLBAnalysis(
      test.home,
      test.away,
      undefined,
      undefined,
      8.5
    );
    
    console.log(`\n   📊 LANCEURS:`);
    console.log(`      Domicile: ${analysis.homePitcher || 'N/A'} (ERA: ${analysis.homePitcherERA || 'N/A'})`);
    console.log(`      Extérieur: ${analysis.awayPitcher || 'N/A'} (ERA: ${analysis.awayPitcherERA || 'N/A'})`);
    
    console.log(`\n   📈 PRÉDICTION:`);
    console.log(`      Score projeté: ${analysis.projectedAwayRuns} - ${analysis.projectedHomeRuns}`);
    console.log(`      Total: ${analysis.projectedTotal} runs`);
    console.log(`      Vainqueur: ${analysis.predictedWinner === 'home' ? test.home : test.away} (${analysis.predictedWinner === 'home' ? analysis.homeWinProb : analysis.awayWinProb}%)`);
    
    console.log(`\n   🎯 OVER/UNDER (ligne 8.5):`);
    console.log(`      Recommandation: ${analysis.overRecommendation.toUpperCase()}`);
    console.log(`      Confiance: ${analysis.overConfidence}%`);
    console.log(`      Prob Over: ${analysis.overProb}%`);
    console.log(`      Risque: ${analysis.riskLevel}`);
    
    console.log(`\n   💡 RAISONNEMENT:`);
    analysis.reasoning.forEach(r => console.log(`      • ${r}`));
    
    if (analysis.keyFactors.length > 0) {
      console.log(`\n   ⭐ FACTEURS CLÉS:`);
      analysis.keyFactors.forEach(f => console.log(`      • ${f}`));
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('    ✅ TEST TERMINÉ');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
