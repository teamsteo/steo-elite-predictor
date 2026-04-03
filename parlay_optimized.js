const https = require('https');
const { getBettingRecommendations, getBestBetTag } = require('./src/lib/bettingRecommendations.ts');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function getMatches(sport, espnSport, league) {
  const matches = [];
  for (let i = 0; i <= 5; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
    
    try {
      const data = await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/${espnSport}/${league}/scoreboard?dates=${dateStr}`);
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
        let oddsHome = sport === 'basketball' ? 1.50 : sport === 'hockey' ? 1.80 : 1.85;
        let oddsAway = sport === 'basketball' ? 2.50 : sport === 'hockey' ? 2.10 : 1.95;
        let overUnder = sport === 'basketball' ? 220 : sport === 'hockey' ? 5.5 : 7.5;
        
        if (odds) {
          if (odds.homeTeamOdds?.moneyLine) {
            const ml = odds.homeTeamOdds.moneyLine;
            oddsHome = ml > 0 ? (ml / 100 + 1) : (100 / Math.abs(ml) + 1);
          }
          if (odds.awayTeamOdds?.moneyLine) {
            const ml = odds.awayTeamOdds.moneyLine;
            oddsAway = ml > 0 ? (ml / 100 + 1) : (100 / Math.abs(ml) + 1);
          }
          overUnder = parseFloat(odds.overUnder) || overUnder;
        }
        
        const matchData = { sport, homeTeam: homeName, awayTeam: awayName, league: league.toUpperCase(), oddsHome, oddsAway };
        const recommendations = getBettingRecommendations(matchData);
        
        matches.push({ date: new Date(event.date), homeTeam: homeName, awayTeam: awayName, oddsHome, oddsAway, overUnder, recommendations, sport });
      }
    } catch (e) {}
  }
  return matches;
}

function selectTopPicks(matches, sportName, count = 3, minConfidence = 65) {
  const allPicks = [];
  
  matches.forEach(m => {
    m.recommendations?.forEach(r => {
      if (r.confidence >= minConfidence) {
        let betOdds = r.type === 'home_win' ? m.oddsHome : r.type === 'away_win' ? m.oddsAway : 1.85;
        allPicks.push({
          sport: sportName,
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
  
  // Supprimer les doublons (même match, même pick)
  const unique = [];
  const seen = new Set();
  allPicks.forEach(p => {
    const key = `${p.homeTeam}-${p.awayTeam}-${p.pick}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  });
  
  unique.sort((a, b) => b.confidence - a.confidence);
  return unique.slice(0, count);
}

function displayParlay(picks, sportLabel, sportEmoji) {
  const sportPicks = picks.filter(p => p.sport === sportLabel);
  if (sportPicks.length === 0) return 0;
  
  console.log(`║                          ${sportEmoji} ${sportLabel} (${sportPicks.length} picks)`.padEnd(75) + '║');
  console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
  
  let combinedOdds = 1;
  sportPicks.forEach((p, i) => {
    const dateStr = p.date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    console.log(`║                                                                           ║`);
    console.log(`║  ${i + 1}. 📅 ${dateStr}`.padEnd(75) + '║');
    console.log(`║     🏟️ ${p.awayTeam} @ ${p.homeTeam}`.substring(0, 73).padEnd(75) + '║');
    console.log(`║     🎯 PICK: ${p.pick}`.padEnd(75) + '║');
    console.log(`║     📊 Confiance: ${p.confidence}% | Cote: ${p.betOdds.toFixed(2)} | n=${p.sampleSize}`.padEnd(75) + '║');
    console.log(`║     ✅ Taux réussite: ${p.successRate}%`.padEnd(75) + '║');
    combinedOdds *= p.betOdds;
  });
  
  return combinedOdds;
}

async function main() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                🔍 ANALYSE ML APPROFONDIE - 6 JOURS                        ║');
  console.log('║              Recherche de 3 picks HAUTE CONFIANCE par sport               ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  
  const [nba, nhl, mlb] = await Promise.all([
    getMatches('basketball', 'basketball', 'nba'),
    getMatches('hockey', 'hockey', 'nhl'),
    getMatches('baseball', 'baseball', 'mlb')
  ]);
  
  console.log(`\n  ✅ NBA: ${nba.length} matchs | NHL: ${nhl.length} matchs | MLB: ${mlb.length} matchs`);
  
  // Sélectionner 3 picks par sport (seuil ajusté par sport)
  const nbaPicks = selectTopPicks(nba, 'NBA', 3, 70);
  const nhlPicks = selectTopPicks(nhl, 'NHL', 3, 65);  // Seuil plus bas pour NHL
  const mlbPicks = selectTopPicks(mlb, 'MLB', 3, 70);
  
  const allPicks = [...nbaPicks, ...nhlPicks, ...mlbPicks];
  
  console.log(`  🎯 Picks trouvés: NBA=${nbaPicks.length}, NHL=${nhlPicks.length}, MLB=${mlbPicks.length}`);
  
  // AFFICHAGE DU COMBINÉ
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                🎰 COMBINÉ MULTI-SPORT - HAUTE CONFIANCE                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  
  console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
  let totalOdds = 0;
  totalOdds += displayParlay(allPicks, 'NBA', '🏀');
  totalOdds += displayParlay(allPicks, 'NHL', '🏒');
  totalOdds += displayParlay(allPicks, 'MLB', '⚾');
  
  // RÉCAPITULATIF
  const avgConf = Math.round(allPicks.reduce((a, b) => a + b.confidence, 0) / allPicks.length);
  const minConf = Math.min(...allPicks.map(p => p.confidence));
  const combProb = allPicks.reduce((a, p) => a * (p.confidence / 100), 1);
  
  console.log(`║                                                                           ║`);
  console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
  console.log('║                           📋 RÉCAPITULATIF                                ║');
  console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
  console.log(`║  📊 Total sélections: ${allPicks.length} picks`.padEnd(75) + '║');
  console.log(`║  📈 Confiance moyenne: ${avgConf}%`.padEnd(75) + '║');
  console.log(`║  📉 Confiance minimum: ${minConf}%`.padEnd(75) + '║');
  console.log(`║                                                                           ║`);
  console.log(`║  💰 💰 💰 COTE COMBINÉE: ${totalOdds.toFixed(2)}`.padEnd(75) + '║');
  console.log(`║  📊 Probabilité combinée: ${(combProb * 100).toFixed(1)}%`.padEnd(75) + '║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  
  // TABLEAU RÉSUMÉ
  console.log('\n');
  console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│                        📊 TABLEAU RÉSUMÉ COMPLET                           │');
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  console.log('│ #  │ Sport │ Match                          │ Pick         │ Conf │ Cote  │');
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  
  allPicks.forEach((p, i) => {
    const num = (i + 1).toString().padStart(2);
    const sport = p.sport.padEnd(4);
    const match = `${p.awayTeam.split(' ').slice(-1)[0]} @ ${p.homeTeam.split(' ').slice(-1)[0]}`.substring(0, 30).padEnd(30);
    const pick = p.pick.replace(/[📈🏆🏒⚾]/g, '').trim().substring(0, 12).padEnd(12);
    const conf = `${p.confidence}%`.padStart(4);
    const odds = p.betOdds.toFixed(2).padStart(4);
    console.log(`│ ${num} │ ${sport}│ ${match}│ ${pick}│ ${conf} │ ${odds} │`);
  });
  
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  console.log(`│              TOTAL: ${allPicks.length} picks │ COTE: ${totalOdds.toFixed(2)} │ Prob: ${(combProb * 100).toFixed(1)}%     │`);
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  
  // ANALYSE RISQUE
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                         ⚠️ ANALYSE DES RISQUES                            ║');
  console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
  console.log(`║  📊 Probabilité de gain: ${(combProb * 100).toFixed(1)}% (1 chance sur ${Math.round(1/combProb)})`.padEnd(75) + '║');
  
  const edge = combProb - (1/totalOdds);
  if (edge > 0) {
    console.log(`║  ✅ VALUE BET: +${(edge * 100).toFixed(1)}% d'avantage`.padEnd(75) + '║');
  }
  
  if (combProb >= 0.15) {
    console.log(`║  🟢 RISQUE: MODÉRÉ - Mise suggérée: 2-3% bankroll`.padEnd(75) + '║');
  } else if (combProb >= 0.08) {
    console.log(`║  🟡 RISQUE: ÉLEVÉ - Mise suggérée: 1-2% bankroll`.padEnd(75) + '║');
  } else {
    console.log(`║  🔴 RISQUE: TRÈS ÉLEVÉ - Mise suggérée: 0.5-1% bankroll`.padEnd(75) + '║');
  }
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  
  // SIMULATION GAINS
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                         💰 SIMULATION DES GAINS                            ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log(`║  Mise 10€  → Gain potentiel: ${(10 * totalOdds).toFixed(0)}€`.padEnd(75) + '║');
  console.log(`║  Mise 20€  → Gain potentiel: ${(20 * totalOdds).toFixed(0)}€`.padEnd(75) + '║');
  console.log(`║  Mise 50€  → Gain potentiel: ${(50 * totalOdds).toFixed(0)}€`.padEnd(75) + '║');
  console.log(`║  Mise 100€ → Gain potentiel: ${(100 * totalOdds).toFixed(0)}€`.padEnd(75) + '║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  
  // PICKS RÉSUMÉ
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                      🎯 RÉSUMÉ DES 9 PICKS                                ║');
  console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
  console.log('║                                                                           ║');
  console.log('║  🏀 NBA:                                                                  ║');
  nbaPicks.forEach(p => {
    console.log(`║     ✅ ${p.awayTeam.split(' ').slice(-1)[0]} @ ${p.homeTeam.split(' ').slice(-1)[0]} → ${p.pick} (${p.confidence}%)`.padEnd(75) + '║');
  });
  console.log('║                                                                           ║');
  console.log('║  🏒 NHL:                                                                  ║');
  nhlPicks.forEach(p => {
    console.log(`║     ✅ ${p.awayTeam.split(' ').slice(-1)[0]} @ ${p.homeTeam.split(' ').slice(-1)[0]} → ${p.pick} (${p.confidence}%)`.padEnd(75) + '║');
  });
  console.log('║                                                                           ║');
  console.log('║  ⚾ MLB:                                                                  ║');
  mlbPicks.forEach(p => {
    console.log(`║     ✅ ${p.awayTeam.split(' ').slice(-1)[0]} @ ${p.homeTeam.split(' ').slice(-1)[0]} → ${p.pick} (${p.confidence}%)`.padEnd(75) + '║');
  });
  console.log('║                                                                           ║');
  console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
  console.log(`║  💰 COTE TOTALE: ${totalOdds.toFixed(2)} | CONFIANCE MOYENNE: ${avgConf}%`.padEnd(75) + '║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
}

main();
