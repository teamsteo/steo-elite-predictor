const { getBettingRecommendations, getBestBetTag } = require('./src/lib/bettingRecommendations.ts');

// Test du match Minnesota vs Detroit
const match = {
  sport: 'basketball',
  homeTeam: 'Minnesota Timberwolves',
  awayTeam: 'Detroit Pistons',
  league: 'NBA',
  oddsHome: 1.45,  // Estimation - Minnesota favori à domicile
  oddsDraw: null,
  oddsAway: 2.80   // Detroit outsider
};

console.log('🏀 ANALYSE NBA: Minnesota Timberwolves vs Detroit Pistons');
console.log('='.repeat(60));
console.log('');
console.log('📊 Données du match:');
console.log(`   Domicile: ${match.homeTeam} (cote ${match.oddsHome})`);
console.log(`   Extérieur: ${match.awayTeam} (cote ${match.oddsAway})`);
console.log('');

// Récupérer les recommandations
const recommendations = getBettingRecommendations(match);
const bestTag = getBestBetTag(match);

console.log('🎯 RECOMMANDATIONS ML:');
console.log('─'.repeat(60));

recommendations.forEach((rec, i) => {
  console.log(`\n${i + 1}. ${rec.label}`);
  console.log(`   Type: ${rec.type}`);
  console.log(`   Confiance: ${rec.confidence}%`);
  console.log(`   Raison: ${rec.reason}`);
  console.log(`   Source: ${rec.patternSource}`);
  if (rec.statistics) {
    console.log(`   📈 Statistiques:`);
    console.log(`      - Échantillon: ${rec.statistics.sampleSize} matchs`);
    console.log(`      - Taux de réussite: ${rec.statistics.successRate}%`);
    console.log(`      - Intervalle de confiance: [${rec.statistics.confidenceInterval.lower}%, ${rec.statistics.confidenceInterval.upper}%]`);
    console.log(`      - p-value: ${rec.statistics.pValue}`);
    console.log(`      - Significativité: ${rec.statistics.significance}`);
  }
});

console.log('\n');
console.log('⭐ MEILLEUR TAG:');
console.log('─'.repeat(60));
if (bestTag) {
  console.log(`   ${bestTag.label}`);
  console.log(`   Confiance: ${bestTag.confidence}%`);
  console.log(`   ${bestTag.reason}`);
} else {
  console.log('   Aucun tag détecté');
}

// Vérifier spécifiquement le pattern Over 220
const over220Pattern = recommendations.find(r => r.patternSource === 'nba_over_220');
console.log('\n');
console.log('📈 ANALYSE OVER 220 POINTS:');
console.log('─'.repeat(60));
if (over220Pattern) {
  console.log(`   ✅ OUI - Le module prévoit Over 220 points`);
  console.log(`   Confiance: ${over220Pattern.confidence}%`);
  console.log(`   Basé sur ${over220Pattern.statistics?.sampleSize} matchs NBA`);
  console.log(`   Taux de réussite historique: ${over220Pattern.statistics?.successRate}%`);
} else {
  console.log('   ❌ Pattern Over 220 non détecté');
}
