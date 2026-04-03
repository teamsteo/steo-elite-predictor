const { getBettingRecommendations, getBestBetTag } = require('./src/lib/bettingRecommendations.ts');

console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║          🏒⚾ TOP PICKS NHL & MLB - PROCHAINS JOURS                  ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝');

// NHL TOP PICKS basés sur les patterns
const nhlPicks = [
  { team: 'Edmonton Oilers', opponent: 'Seattle Kraken', date: 'Mercredi 1 Avril', pick: 'Oilers Domicile', confidence: 74, sample: 31, type: 'home_win' },
  { team: 'Boston Bruins', opponent: 'Dallas Stars', date: 'Mardi 31 Mars', pick: 'Bruins Domicile', confidence: 68, sample: 41, type: 'home_win' },
  { team: 'New York Rangers', opponent: 'Florida Panthers', date: 'Dimanche 29 Mars', pick: 'Rangers Domicile', confidence: 65, sample: 38, type: 'home_win' }
];

// MLB TOP PICKS basés sur les patterns  
const mlbPicks = [
  { team: 'Cincinnati Reds', opponent: 'Boston Red Sox', date: 'Dimanche 29 Mars', pick: 'Reds Over 7.5', confidence: 85, sample: 33, type: 'over' },
  { team: 'Boston Red Sox', opponent: 'Cincinnati Reds', date: 'Dimanche 29 Mars', pick: 'Red Sox Over 7.5', confidence: 81, sample: 36, type: 'over' },
  { team: 'Colorado Rockies', opponent: 'Miami Marlins', date: 'Dimanche 29 Mars', pick: 'Rockies Over 7.5', confidence: 79, sample: 33, type: 'over' },
  { team: 'Atlanta Braves', opponent: 'Kansas City Royals', date: 'Dimanche 29 Mars', pick: 'Braves Over 7.5', confidence: 76, sample: 34, type: 'over' },
  { team: 'Cincinnati Reds', opponent: 'Pittsburgh Pirates', date: 'Lundi 30 Mars', pick: 'Reds Over 7.5', confidence: 85, sample: 33, type: 'over' }
];

console.log('\n');
console.log('┌────────────────────────────────────────────────────────────────────────┐');
console.log('│                        🏒 NHL HOCKEY                                   │');
console.log('├────────────────────────────────────────────────────────────────────────┤');
console.log('│ Date            │ Match                          │ Pick     │ Conf   │');
console.log('├────────────────────────────────────────────────────────────────────────┤');

nhlPicks.forEach(p => {
  const date = p.date.padEnd(15);
  const match = `${p.opponent} @ ${p.team}`.substring(0, 30).padEnd(30);
  const pick = p.pick.substring(0, 8).padEnd(8);
  const conf = `${p.confidence}%`.padStart(5);
  const icon = p.confidence >= 70 ? '✅' : '⚠️';
  console.log(`│ ${date}│ ${match}│ ${pick}│ ${conf} ${icon}│`);
});

console.log('└────────────────────────────────────────────────────────────────────────┘');

console.log('\n');
console.log('┌────────────────────────────────────────────────────────────────────────┐');
console.log('│                        ⚾ MLB BASEBALL                                 │');
console.log('├────────────────────────────────────────────────────────────────────────┤');
console.log('│ Date            │ Match                          │ Pick     │ Conf   │');
console.log('├────────────────────────────────────────────────────────────────────────┤');

mlbPicks.forEach(p => {
  const date = p.date.padEnd(15);
  const match = `${p.opponent} @ ${p.team}`.substring(0, 30).padEnd(30);
  const pick = p.pick.substring(0, 8).padEnd(8);
  const conf = `${p.confidence}%`.padStart(5);
  const icon = p.confidence >= 75 ? '✅' : '⚠️';
  console.log(`│ ${date}│ ${match}│ ${pick}│ ${conf} ${icon}│`);
});

console.log('└────────────────────────────────────────────────────────────────────────┘');

// DÉTAIL DES PATTERNS
console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║                    📊 DÉTAIL DES PATTERNS UTILISÉS                   ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝');

console.log('\n🏒 NHL Patterns:');
console.log('   • Oilers Domicile: 74% sur 31 matchs (Edmonton très fort à domicile)');
console.log('   • Bruins Domicile: 68% sur 41 matchs (Boston solide à domicile)');
console.log('   • Rangers Domicile: 65% sur 38 matchs (New York performant à domicile)');
console.log('   • Over 5.5 NHL: 59% sur 1451 matchs (tous matchs NHL)');

console.log('\n⚾ MLB Patterns:');
console.log('   • Reds Over 7.5: 85% sur 33 matchs (Cincinnati = équipe la plus "over")');
console.log('   • Red Sox Over 7.5: 81% sur 36 matchs (Boston marque beaucoup)');
console.log('   • Rockies Over 7.5: 79% sur 33 matchs (Colorado = altitude = points)');
console.log('   • Braves Over 7.5: 76% sur 34 matchs (Atlanta offensif)');
console.log('   • D-Backs Over 7.5: 80% sur 35 matchs (Arizona offensif)');
console.log('   • Over 7.5 MLB: 62% sur 4993 matchs (tous matchs MLB)');

// RECOMMANDATIONS FINALES
console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║                      💡 MEILLEURES VALEURS                            ║');
console.log('╠══════════════════════════════════════════════════════════════════════╣');
console.log('║                                                                       ║');
console.log('║  🏒 NHL - TOP VALUE:                                                  ║');
console.log('║     ✅ Edmonton Oilers vs Seattle (Mercredi) - 74% confiance          ║');
console.log('║        → Pattern: Oilers très fort à domicile                         ║');
console.log('║                                                                       ║');
console.log('║  ⚾ MLB - TOP VALUE:                                                  ║');
console.log('║     ✅ Cincinnati Reds Over 7.5 (Dimanche/Lundi) - 85% confiance      ║');
console.log('║        → Pattern: Reds = équipe la plus "over" en MLB                 ║');
console.log('║                                                                       ║');
console.log('║     ✅ Colorado Rockies Over 7.5 (Dimanche) - 79% confiance           ║');
console.log('║        → Pattern: Altitude de Denver = plus de points                 ║');
console.log('║                                                                       ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝');

console.log('\n');
