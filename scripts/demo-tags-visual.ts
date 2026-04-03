import { getBettingRecommendations, getTagColor, getTagIcon } from '../src/lib/bettingRecommendations';

console.log('\n🎨 VISUALISATION DES TAGS ML SUR LE SITE\n');
console.log('='.repeat(60));

// Scénario 1: PSG vs Marseille (favori domicile)
console.log('\n📱 MATCH: PSG vs Marseille');
console.log('   Cotes: 1.40 - 7.00');
const ps = getBettingRecommendations({
  sport: 'football',
  homeTeam: 'PSG',
  awayTeam: 'Marseille',
  oddsHome: 1.40,
  oddsAway: 7.0,
  homeXg: undefined, // Pas de xG pour match à venir
  awayXg: undefined
});
if (ps.length > 0) {
  console.log('\n   ┌─────────────────────────────────────┐');
  for (const r of ps.slice(0, 2)) {
    const c = getTagColor(r.type);
    const ic = getTagIcon(r.type);
    console.log(`   │  ${ic} ${r.label} (${r.confidence}%)`.padEnd(37) + '│');
  }
  console.log('   └─────────────────────────────────────┘');
}

// Scénario 2: Match équilibré
console.log('\n📱 MATCH: Liverpool vs Arsenal');
console.log('   Cotes: 2.50 - 2.80');
const eq = getBettingRecommendations({
  sport: 'football',
  homeTeam: 'Liverpool',
  awayTeam: 'Arsenal',
  oddsHome: 2.50,
  oddsAway: 2.80
});
console.log(`   Tags: ${eq.length > 0 ? eq.map(r => r.label).join(', ') : '❌ Aucun (cotes > 1.5)'}`);

// Scénario 3: NBA
console.log('\n📱 MATCH: Lakers vs Celtics (NBA)');
const nba = getBettingRecommendations({
  sport: 'basketball',
  homeTeam: 'Los Angeles Lakers',
  awayTeam: 'Boston Celtics',
  oddsHome: 2.5,
  oddsAway: 1.5,
  leagueAvgPoints: 220
});
if (nba.length > 0) {
  console.log('\n   ┌─────────────────────────────────────┐');
  for (const r of nba) {
    const ic = getTagIcon(r.type);
    console.log(`   │  ${ic} ${r.label} (${r.confidence}%)`.padEnd(37) + '│');
  }
  console.log('   └─────────────────────────────────────┘');
}

// Scénario 4: NHL Edmonton
console.log('\n📱 MATCH: Edmonton Oilers vs Seattle Kraken (NHL)');
const nhl = getBettingRecommendations({
  sport: 'hockey',
  homeTeam: 'Edmonton Oilers',
  awayTeam: 'Seattle Kraken'
});
if (nhl.length > 0) {
  console.log('\n   ┌─────────────────────────────────────┐');
  for (const r of nhl) {
    const ic = getTagIcon(r.type);
    console.log(`   │  ${ic} ${r.label} (${r.confidence}%)`.padEnd(37) + '│');
  }
  console.log('   └─────────────────────────────────────┘');
}

// Scénario 5: MLB Cincinnati
console.log('\n📱 MATCH: Cincinnati Reds vs Oakland Athletics (MLB)');
const mlb = getBettingRecommendations({
  sport: 'baseball',
  homeTeam: 'Cincinnati Reds',
  awayTeam: 'Oakland Athletics'
});
if (mlb.length > 0) {
  console.log('\n   ┌─────────────────────────────────────┐');
  for (const r of mlb) {
    const ic = getTagIcon(r.type);
    console.log(`   │  ${ic} ${r.label} (${r.confidence}%)`.padEnd(37) + '│');
  }
  console.log('   └─────────────────────────────────────┘');
}

console.log('\n' + '='.repeat(60));
console.log('\n💡 POURQUOI VOUS NE VOYEZ PEUT-ÊTRE PAS LES TAGS:');
console.log('');
console.log('   1. Les matchs affichés ont des cotes > 1.5 (pas favori)');
console.log('   2. Les xG ne sont disponibles QUE pour les matchs joués');
console.log('   3. Les tags ne s\'affichent que SI les conditions sont remplies');
console.log('');
console.log('📌 CONDITIONS D\'AFFICHAGE:');
console.log('   • Football: odds_home < 1.5 OU xG disponibles');
console.log('   • Basketball: Tous les matchs (leagueAvg > 220)');
console.log('   • NHL: Edmonton Oilers à domicile');
console.log('   • MLB: Reds, Red Sox, Diamondbacks, Rockies, Braves');
console.log('');
