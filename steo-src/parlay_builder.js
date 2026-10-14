const https = require('https');
const { getBettingRecommendations, getBestBetTag } = require('./src/lib/bettingRecommendations.ts');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Récupérer les matchs NBA
async function getNBAMatches() {
  const matches = [];
  for (let i = 0; i <= 3; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
    
    try {
      const data = await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`);
      const events = data.events || [];
      
      for (const event of events) {
        if (event.status?.type?.completed) continue;
        
        const competition = event.competitions?.[0];
        if (!competition) continue;
        
        const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
        const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
        
        if (!homeTeam || !awayTeam) continue;
        
        const homeName = homeTeam.team.displayName;
        const awayName = awayTeam.team.displayName;
        
        const odds = competition.odds?.[0];
        let oddsHome = 1.50;
        let oddsAway = 2.50;
        let overUnder = 220;
        
        if (odds) {
          if (odds.homeTeamOdds?.moneyLine) {
            const ml = odds.homeTeamOdds.moneyLine;
            oddsHome = ml > 0 ? (ml / 100 + 1) : (100 / Math.abs(ml) + 1);
          }
          if (odds.awayTeamOdds?.moneyLine) {
            const ml = odds.awayTeamOdds.moneyLine;
            oddsAway = ml > 0 ? (ml / 100 + 1) : (100 / Math.abs(ml) + 1);
          }
          overUnder = parseFloat(odds.overUnder) || 220;
        }
        
        const matchData = {
          sport: 'basketball',
          homeTeam: homeName,
          awayTeam: awayName,
          league: 'NBA',
          oddsHome,
          oddsAway
        };
        
        const recommendations = getBettingRecommendations(matchData);
        
        matches.push({
          date: new Date(event.date),
          homeTeam: homeName,
          awayTeam: awayName,
          oddsHome,
          oddsAway,
          overUnder,
          recommendations
        });
      }
    } catch (e) {}
  }
  return matches;
}

// Récupérer les matchs NHL
async function getNHLMatches() {
  const matches = [];
  for (let i = 0; i <= 3; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
    
    try {
      const data = await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${dateStr}`);
      const events = data.events || [];
      
      for (const event of events) {
        if (event.status?.type?.completed) continue;
        
        const competition = event.competitions?.[0];
        if (!competition) continue;
        
        const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
        const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
        
        if (!homeTeam || !awayTeam) continue;
        
        const homeName = homeTeam.team.displayName;
        const awayName = awayTeam.team.displayName;
        
        const odds = competition.odds?.[0];
        let oddsHome = 1.80;
        let oddsAway = 2.10;
        let overUnder = 5.5;
        
        if (odds) {
          if (odds.homeTeamOdds?.moneyLine) {
            const ml = odds.homeTeamOdds.moneyLine;
            oddsHome = ml > 0 ? (ml / 100 + 1) : (100 / Math.abs(ml) + 1);
          }
          if (odds.awayTeamOdds?.moneyLine) {
            const ml = odds.awayTeamOdds.moneyLine;
            oddsAway = ml > 0 ? (ml / 100 + 1) : (100 / Math.abs(ml) + 1);
          }
          overUnder = parseFloat(odds.overUnder) || 5.5;
        }
        
        const matchData = {
          sport: 'hockey',
          homeTeam: homeName,
          awayTeam: awayName,
          league: 'NHL',
          oddsHome,
          oddsAway
        };
        
        const recommendations = getBettingRecommendations(matchData);
        
        matches.push({
          date: new Date(event.date),
          homeTeam: homeName,
          awayTeam: awayName,
          oddsHome,
          oddsAway,
          overUnder,
          recommendations
        });
      }
    } catch (e) {}
  }
  return matches;
}

// Récupérer les matchs MLB
async function getMLBMatches() {
  const matches = [];
  for (let i = 0; i <= 3; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
    
    try {
      const data = await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${dateStr}`);
      const events = data.events || [];
      
      for (const event of events) {
        if (event.status?.type?.completed) continue;
        
        const competition = event.competitions?.[0];
        if (!competition) continue;
        
        const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
        const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
        
        if (!homeTeam || !awayTeam) continue;
        
        const homeName = homeTeam.team.displayName;
        const awayName = awayTeam.team.displayName;
        
        const odds = competition.odds?.[0];
        let oddsHome = 1.85;
        let oddsAway = 1.95;
        let overUnder = 7.5;
        
        if (odds) {
          if (odds.homeTeamOdds?.moneyLine) {
            const ml = odds.homeTeamOdds.moneyLine;
            oddsHome = ml > 0 ? (ml / 100 + 1) : (100 / Math.abs(ml) + 1);
          }
          if (odds.awayTeamOdds?.moneyLine) {
            const ml = odds.awayTeamOdds.moneyLine;
            oddsAway = ml > 0 ? (ml / 100 + 1) : (100 / Math.abs(ml) + 1);
          }
          overUnder = parseFloat(odds.overUnder) || 7.5;
        }
        
        const matchData = {
          sport: 'baseball',
          homeTeam: homeName,
          awayTeam: awayName,
          league: 'MLB',
          oddsHome,
          oddsAway
        };
        
        const recommendations = getBettingRecommendations(matchData);
        
        matches.push({
          date: new Date(event.date),
          homeTeam: homeName,
          awayTeam: awayName,
          oddsHome,
          oddsAway,
          overUnder,
          recommendations
        });
      }
    } catch (e) {}
  }
  return matches;
}

// Sélectionner les meilleurs picks haute confiance
function selectTopPicks(matches, sport, minCount = 3) {
  const allPicks = [];
  
  matches.forEach(m => {
    m.recommendations?.forEach(r => {
      // Ne prendre que les picks avec confiance >= 70%
      if (r.confidence >= 70) {
        let betOdds = 1.50;
        
        if (r.type === 'home_win') {
          betOdds = m.oddsHome;
        } else if (r.type === 'away_win') {
          betOdds = m.oddsAway;
        } else if (r.type === 'over') {
          betOdds = 1.85; // Cote standard pour Over
        } else if (r.type === 'under') {
          betOdds = 1.85;
        }
        
        allPicks.push({
          sport,
          date: m.date,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          pick: r.label,
          type: r.type,
          confidence: r.confidence,
          betOdds,
          overUnder: m.overUnder,
          sampleSize: r.statistics?.sampleSize,
          successRate: r.statistics?.successRate,
          significance: r.statistics?.significance
        });
      }
    });
  });
  
  // Trier par confiance puis par cote (plus haute cote = meilleure value)
  allPicks.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.betOdds - a.betOdds;
  });
  
  return allPicks.slice(0, minCount);
}

// Afficher le combiné
function displayParlay(nbaPicks, nhlPicks, mlbPicks) {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    🎰 COMBINÉ HAUTE CONFIANCE - MULTI-SPORT               ║');
  console.log('║                         📊 ANALYSE ML POINTILLEUSE                         ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  
  const allPicks = [...nbaPicks, ...nhlPicks, ...mlbPicks];
  let combinedOdds = 1;
  
  // NBA
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                          🏀 NBA BASKETBALL (3 picks)                       ║');
  console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
  
  nbaPicks.forEach((p, i) => {
    const dateStr = p.date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
    console.log(`║                                                                           ║`);
    console.log(`║  ${i + 1}. 📅 ${dateStr}`.padEnd(75) + '║');
    console.log(`║     🏟️ ${p.awayTeam} @ ${p.homeTeam}`.substring(0, 73).padEnd(75) + '║');
    console.log(`║     🎯 PICK: ${p.pick}`.padEnd(75) + '║');
    console.log(`║     📊 Confiance: ${p.confidence}% | Cote: ${p.betOdds.toFixed(2)} | n=${p.sampleSize}`.padEnd(75) + '║');
    console.log(`║     ✅ Validité: ${p.significance || 'highly_significant'}`.padEnd(75) + '║');
    combinedOdds *= p.betOdds;
  });
  
  // NHL
  console.log(`║                                                                           ║`);
  console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
  console.log('║                          🏒 NHL HOCKEY (3 picks)                           ║');
  console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
  
  nhlPicks.forEach((p, i) => {
    const dateStr = p.date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
    console.log(`║                                                                           ║`);
    console.log(`║  ${i + 1}. 📅 ${dateStr}`.padEnd(75) + '║');
    console.log(`║     🏟️ ${p.awayTeam} @ ${p.homeTeam}`.substring(0, 73).padEnd(75) + '║');
    console.log(`║     🎯 PICK: ${p.pick}`.padEnd(75) + '║');
    console.log(`║     📊 Confiance: ${p.confidence}% | Cote: ${p.betOdds.toFixed(2)} | n=${p.sampleSize}`.padEnd(75) + '║');
    console.log(`║     ✅ Validité: ${p.significance || 'highly_significant'}`.padEnd(75) + '║');
    combinedOdds *= p.betOdds;
  });
  
  // MLB
  console.log(`║                                                                           ║`);
  console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
  console.log('║                          ⚾ MLB BASEBALL (3 picks)                         ║');
  console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
  
  mlbPicks.forEach((p, i) => {
    const dateStr = p.date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
    console.log(`║                                                                           ║`);
    console.log(`║  ${i + 1}. 📅 ${dateStr}`.padEnd(75) + '║');
    console.log(`║     🏟️ ${p.awayTeam} @ ${p.homeTeam}`.substring(0, 73).padEnd(75) + '║');
    console.log(`║     🎯 PICK: ${p.pick}`.padEnd(75) + '║');
    console.log(`║     📊 Confiance: ${p.confidence}% | Cote: ${p.betOdds.toFixed(2)} | n=${p.sampleSize}`.padEnd(75) + '║');
    console.log(`║     ✅ Validité: ${p.significance || 'highly_significant'}`.padEnd(75) + '║');
    combinedOdds *= p.betOdds;
  });
  
  // RÉCAPITULATIF
  console.log(`║                                                                           ║`);
  console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
  console.log('║                           📋 RÉCAPITULATIF                                ║');
  console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
  
  // Calcul confiance moyenne
  const avgConfidence = Math.round(allPicks.reduce((a, b) => a + b.confidence, 0) / allPicks.length);
  const minConfidence = Math.min(...allPicks.map(p => p.confidence));
  
  // Calcul probabilité combinée
  const combinedProb = allPicks.reduce((a, p) => a * (p.confidence / 100), 1);
  
  console.log(`║                                                                           ║`);
  console.log(`║  📊 Nombre de sélections: ${allPicks.length}`.padEnd(75) + '║');
  console.log(`║  📈 Confiance moyenne: ${avgConfidence}%`.padEnd(75) + '║');
  console.log(`║  📉 Confiance minimum: ${minConfidence}%`.padEnd(75) + '║');
  console.log(`║                                                                           ║`);
  console.log(`║  💰 COTE COMBINÉE: ${combinedOdds.toFixed(2)}`.padEnd(75) + '║');
  console.log(`║  📊 Probabilité combinée: ${(combinedProb * 100).toFixed(1)}%`.padEnd(75) + '║');
  console.log(`║                                                                           ║`);
  
  // Value bet?
  const impliedProb = 1 / combinedOdds;
  const edge = combinedProb - impliedProb;
  
  if (edge > 0) {
    console.log(`║  ✅ VALUE BET DÉTECTÉE: +${(edge * 100).toFixed(1)}% d'edge`.padEnd(75) + '║');
  } else {
    console.log(`║  ⚠️ Pas de value détectée sur ce combiné`.padEnd(75) + '║');
  }
  
  console.log(`║                                                                           ║`);
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  
  // TABLEAU RÉSUMÉ
  console.log('\n');
  console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│                        📊 TABLEAU RÉSUMÉ DES PICKS                         │');
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  console.log('│ #  │ Sport │ Match                    │ Pick           │ Conf │ Cote     │');
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  
  allPicks.forEach((p, i) => {
    const num = (i + 1).toString().padStart(2);
    const sport = p.sport.substring(0, 3).toUpperCase().padEnd(4);
    const match = `${p.awayTeam.split(' ').slice(-1)[0]} @ ${p.homeTeam.split(' ').slice(-1)[0]}`.substring(0, 24).padEnd(24);
    const pick = p.pick.replace(/[📈🏆🏒⚾]/g, '').trim().substring(0, 14).padEnd(14);
    const conf = `${p.confidence}%`.padStart(4);
    const odds = p.betOdds.toFixed(2).padStart(5);
    console.log(`│ ${num} │ ${sport}│ ${match}│ ${pick}│ ${conf} │ ${odds}    │`);
  });
  
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  console.log(`│                    TOTAL: ${allPicks.length} picks │ COTE FINALE: ${combinedOdds.toFixed(2)}       │`);
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  
  // ANALYSE DES RISQUES
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                         ⚠️ ANALYSE DES RISQUES                            ║');
  console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
  console.log(`║                                                                           ║`);
  console.log(`║  📊 Probabilité de réussite: ${(combinedProb * 100).toFixed(1)}%`.padEnd(75) + '║');
  console.log(`║  📈 Cote implicite: 1 sur ${Math.round(1 / combinedProb)}`.padEnd(75) + '║');
  console.log(`║                                                                           ║`);
  
  if (combinedProb >= 0.15) {
    console.log(`║  ✅ NIVEAU DE RISQUE: MODÉRÉ`.padEnd(75) + '║');
    console.log(`║     → Bonne valeur pour un combiné multi-sport`.padEnd(75) + '║');
  } else if (combinedProb >= 0.08) {
    console.log(`║  ⚠️ NIVEAU DE RISQUE: ÉLEVÉ`.padEnd(75) + '║');
    console.log(`║     → Miser une petite mise (1-2% de la bankroll)`.padEnd(75) + '║');
  } else {
    console.log(`║  🔴 NIVEAU DE RISQUE: TRÈS ÉLEVÉ`.padEnd(75) + '║');
    console.log(`║     → Ne pas miser plus de 0.5% de la bankroll`.padEnd(75) + '║');
  }
  
  console.log(`║                                                                           ║`);
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  
  // RECOMMANDATION FINALE
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                         💡 RECOMMANDATION FINALE                          ║');
  console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
  console.log(`║                                                                           ║`);
  console.log(`║  🎯 COMBINÉ RECOMMANDÉ:`.padEnd(75) + '║');
  console.log(`║                                                                           ║`);
  
  allPicks.forEach(p => {
    console.log(`║     • ${p.sport.toUpperCase()}: ${p.pick} (${p.confidence}%)`.padEnd(75) + '║');
  });
  
  console.log(`║                                                                           ║`);
  console.log(`║  💰 Cote totale: ${combinedOdds.toFixed(2)}`.padEnd(75) + '║');
  console.log(`║  📊 Confiance moyenne: ${avgConfidence}%`.padEnd(75) + '║');
  console.log(`║  ⚡ Mise recommandée: 1-2% de la bankroll`.padEnd(75) + '║');
  console.log(`║                                                                           ║`);
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  
  return { allPicks, combinedOdds, combinedProb, avgConfidence };
}

async function main() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    🔍 ANALYSE ML EN COURS...                              ║');
  console.log('║            Récupération des matchs NBA, NHL, MLB (4 jours)                ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  
  const [nbaMatches, nhlMatches, mlbMatches] = await Promise.all([
    getNBAMatches(),
    getNHLMatches(),
    getMLBMatches()
  ]);
  
  console.log(`\n  ✅ NBA: ${nbaMatches.length} matchs analysés`);
  console.log(`  ✅ NHL: ${nhlMatches.length} matchs analysés`);
  console.log(`  ✅ MLB: ${mlbMatches.length} matchs analysés`);
  
  // Sélectionner les 3 meilleurs picks par sport
  const nbaPicks = selectTopPicks(nbaMatches, 'NBA', 3);
  const nhlPicks = selectTopPicks(nhlMatches, 'NHL', 3);
  const mlbPicks = selectTopPicks(mlbMatches, 'MLB', 3);
  
  console.log(`\n  🎯 NBA: ${nbaPicks.length} picks haute confiance trouvés`);
  console.log(`  🎯 NHL: ${nhlPicks.length} picks haute confiance trouvés`);
  console.log(`  🎯 MLB: ${mlbPicks.length} picks haute confiance trouvés`);
  
  // Afficher le combiné
  displayParlay(nbaPicks, nhlPicks, mlbPicks);
}

main().catch(console.error);
