const { getBettingRecommendations, getBestBetTag, getTagColor, getTagIcon } = require('./src/lib/bettingRecommendations.ts');

// Données RÉELLES du match
const match = {
  sport: 'basketball',
  homeTeam: 'Minnesota Timberwolves',
  awayTeam: 'Detroit Pistons',
  league: 'NBA',
  oddsHome: 1.50,        // Cote réelle
  oddsDraw: null,
  oddsAway: 2.50,        // Cote réelle
  overUnder: 223.5       // Ligne réelle
};

console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          🏀 ANALYSE ML - NBA PREMIUM                         ║');
console.log('╠══════════════════════════════════════════════════════════════╣');
console.log('║  Minnesota Timberwolves vs Detroit Pistons                  ║');
console.log('║  28 Mars 2026 - 21:30 - Target Center                       ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('\n');

console.log('📊 DONNÉES DU MATCH:');
console.log('─'.repeat(60));
console.log(`   🏠 Domicile: Minnesota Timberwolves (cote 1.50)`);
console.log(`      Record: 45-28`);
console.log(`   ✈️ Extérieur: Detroit Pistons (cote 2.50)`);
console.log(`      Record: 53-20`);
console.log(`   📈 Ligne Over/Under: ${match.overUnder} pts`);
console.log(`   📊 Spread: -2.5`);
console.log('');

// Récupérer les recommandations ML
const recommendations = getBettingRecommendations(match);
const bestTag = getBestBetTag(match);

console.log('🧠 PRÉDICTIONS ML PATTERNS:');
console.log('═'.repeat(60));

recommendations.forEach((rec, i) => {
  const color = getTagColor(rec.type);
  const icon = getTagIcon(rec.type);
  
  console.log(`\n┌─────────────────────────────────────────────────────────────┐`);
  console.log(`│ ${icon} ${rec.label.padEnd(50)}│`);
  console.log(`├─────────────────────────────────────────────────────────────┤`);
  console.log(`│ Type: ${rec.type.padEnd(53)}│`);
  console.log(`│ Confiance: ${rec.confidence}%`.padEnd(62) + '│');
  console.log(`│ Raison: ${rec.reason.substring(0, 48).padEnd(48)}`.padEnd(62) + '│');
  
  if (rec.statistics) {
    console.log(`├─────────────────────────────────────────────────────────────┤`);
    console.log(`│ 📈 VALIDATION STATISTIQUE:                                  │`);
    console.log(`│    • Échantillon: ${rec.statistics.sampleSize} matchs`.padEnd(62) + '│');
    console.log(`│    • Taux de réussite: ${rec.statistics.successRate}%`.padEnd(62) + '│');
    console.log(`│    • Intervalle de confiance: [${rec.statistics.confidenceInterval.lower}%, ${rec.statistics.confidenceInterval.upper}%]`.padEnd(62) + '│');
    console.log(`│    • p-value: ${rec.statistics.pValue}`.padEnd(62) + '│');
    console.log(`│    • Significativité: ${rec.statistics.significance}`.padEnd(62) + '│');
  }
  console.log(`└─────────────────────────────────────────────────────────────┘`);
});

console.log('\n');
console.log('⭐ MEILLEURE PRÉDICTION:');
console.log('═'.repeat(60));
if (bestTag) {
  console.log(`\n   🎯 ${bestTag.label}`);
  console.log(`   Confiance: ${bestTag.confidence}%`);
  console.log(`   ${bestTag.reason}`);
  if (bestTag.statistics) {
    console.log(`   Basé sur ${bestTag.statistics.sampleSize} matchs (${bestTag.statistics.successRate}% réussite)`);
  }
}

// Analyse spécifique Over/Under
const overPattern = recommendations.find(r => r.type === 'over');
const homeFavoritePattern = recommendations.find(r => r.patternSource === 'nba_home_favorite');

console.log('\n');
console.log('📈 ANALYSE OVER/UNDER SPÉCIFIQUE:');
console.log('═'.repeat(60));
console.log(`\n   Ligne bookmaker: ${match.overUnder} pts`);
console.log(`   Pattern ML: Over 220 pts`);

if (overPattern) {
  console.log(`\n   ✅ PRÉDICTION: OVER ${match.overUnder} PTS`);
  console.log(`   Confiance: ${overPattern.confidence}%`);
  console.log(`   Taux historique: ${overPattern.statistics?.successRate}% sur ${overPattern.statistics?.sampleSize} matchs`);
  
  // Ajustement pour la ligne réelle
  const lineDiff = match.overUnder - 220;
  const adjustedConfidence = lineDiff > 0 ? overPattern.confidence - (lineDiff * 0.5) : overPattern.confidence;
  
  console.log(`\n   📊 AJUSTEMENT LIGNE ${match.overUnder}:`);
  console.log(`   La ligne bookmaker (${match.overUnder}) est ${lineDiff > 0 ? 'supérieure' : 'inférieure'} au seuil ML (220)`);
  console.log(`   Confiance ajustée: ~${Math.round(adjustedConfidence)}%`);
  
  if (adjustedConfidence >= 65) {
    console.log(`\n   💡 RECOMMANDATION: PARIER OVER ${match.overUnder} ✅`);
  } else if (adjustedConfidence >= 55) {
    console.log(`\n   💡 RECOMMANDATION: PARIER OVER ${match.overUnder} (modéré) ⚠️`);
  } else {
    console.log(`\n   💡 RECOMMANDATION: ÉVITER - Ligne trop élevée ⏳`);
  }
}

console.log('\n');
console.log('🏆 ANALYSE VAINQUEUR:');
console.log('═'.repeat(60));
if (homeFavoritePattern) {
  console.log(`\n   ✅ FAVORI: Minnesota Timberwolves`);
  console.log(`   Confiance: ${homeFavoritePattern.confidence}%`);
  console.log(`   Taux historique: ${homeFavoritePattern.statistics?.successRate}% sur ${homeFavoritePattern.statistics?.sampleSize} matchs`);
  console.log(`   Cote: 1.50 (value modérée)`);
  
  // Calcul de l'edge
  const impliedProb = 1 / 1.50;
  const mlProb = homeFavoritePattern.confidence / 100;
  const edge = (mlProb - impliedProb) * 100;
  
  console.log(`\n   📊 VALUE BET:`);
  console.log(`   Probabilité ML: ${homeFavoritePattern.confidence}%`);
  console.log(`   Probabilité implicite: ${Math.round(impliedProb * 100)}%`);
  console.log(`   Edge: ${edge > 0 ? '+' : ''}${edge.toFixed(1)}%`);
  
  if (edge > 5) {
    console.log(`   💡 VALUE BET DÉTECTÉE! ✅`);
  } else if (edge > 0) {
    console.log(`   💡 Légère value, par modéré ⚠️`);
  } else {
    console.log(`   💡 Pas de value sur cette cote ⏳`);
  }
}

console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║                    📋 RÉSUMÉ PRONOSTIC                       ║');
console.log('╠══════════════════════════════════════════════════════════════╣');
if (overPattern && bestTag) {
  console.log(`║                                                              ║`);
  console.log(`║  🏆 Vainqueur: Minnesota Timberwolves (${homeFavoritePattern?.confidence}% conf)        ║`);
  console.log(`║  📈 Total: OVER ${match.overUnder} pts (${overPattern.confidence}% conf)              ║`);
  console.log(`║                                                              ║`);
  console.log(`║  ⚠️ Note: Detroit a un meilleur record (53-20 vs 45-28)     ║`);
  console.log(`║     mais Minnesota joue à domicile et est favori           ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
}
console.log('\n');
