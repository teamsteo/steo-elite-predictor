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

async function getUpcomingNHL() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║               🏒 NHL - PROCHAINS MATCHS (3 jours)                ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  
  const matches = [];
  
  // Chercher sur 3 jours
  for (let i = 1; i <= 3; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
    
    try {
      const data = await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${dateStr}`);
      const events = data.events || [];
      
      for (const event of events) {
        const competition = event.competitions?.[0];
        if (!competition) continue;
        
        const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
        const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
        
        if (!homeTeam || !awayTeam) continue;
        
        const homeName = homeTeam.team.displayName;
        const awayName = awayTeam.team.displayName;
        const matchDate = new Date(event.date);
        
        // Cotes
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
        
        // ML Analysis
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
          date: matchDate,
          homeTeam: homeName,
          awayTeam: awayName,
          oddsHome,
          oddsAway,
          overUnder,
          homeRecord: homeTeam.records?.[0]?.summary,
          awayRecord: awayTeam.records?.[0]?.summary,
          recommendations
        });
      }
    } catch (e) {
      // skip
    }
  }
  
  return matches;
}

async function getUpcomingMLB() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║               ⚾ MLB - PROCHAINS MATCHS (3 jours)                ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  
  const matches = [];
  
  for (let i = 1; i <= 3; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
    
    try {
      const data = await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${dateStr}`);
      const events = data.events || [];
      
      for (const event of events) {
        const competition = event.competitions?.[0];
        if (!competition) continue;
        
        const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
        const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
        
        if (!homeTeam || !awayTeam) continue;
        
        const homeName = homeTeam.team.displayName;
        const awayName = awayTeam.team.displayName;
        const matchDate = new Date(event.date);
        
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
          date: matchDate,
          homeTeam: homeName,
          awayTeam: awayName,
          oddsHome,
          oddsAway,
          overUnder,
          homeRecord: homeTeam.records?.[0]?.summary,
          awayRecord: awayTeam.records?.[0]?.summary,
          recommendations
        });
      }
    } catch (e) {
      // skip
    }
  }
  
  return matches;
}

function displayMatchWithML(match, sport) {
  const dateStr = match.date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const timeStr = match.date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  
  console.log('┌────────────────────────────────────────────────────────────────┐');
  console.log(`│ 📅 ${dateStr} à ${timeStr}`.padEnd(62) + '│');
  console.log(`│ ${match.awayTeam} @ ${match.homeTeam}`.substring(0, 62).padEnd(62) + '│');
  console.log('├────────────────────────────────────────────────────────────────┤');
  console.log(`│ Cotes: ${match.homeTeam.split(' ')[0]} ${match.oddsHome.toFixed(2)} vs ${match.awayTeam.split(' ')[0]} ${match.oddsAway.toFixed(2)}`.padEnd(62) + '│');
  console.log(`│ O/U: ${match.overUnder}`.padEnd(62) + '│');
  
  if (match.recommendations && match.recommendations.length > 0) {
    console.log('├────────────────────────────────────────────────────────────────┤');
    console.log('│ 🎯 PRÉDICTIONS ML:                                            │');
    
    match.recommendations.forEach(rec => {
      const icon = rec.confidence >= 75 ? '✅' : rec.confidence >= 65 ? '⚠️' : '⏳';
      console.log(`│   ${icon} ${rec.label} (${rec.confidence}%)`.padEnd(62) + '│');
      if (rec.statistics) {
        console.log(`│      n=${rec.statistics.sampleSize} | ${rec.statistics.successRate}% réussite`.padEnd(62) + '│');
      }
    });
  }
  console.log('└────────────────────────────────────────────────────────────────┘');
  console.log('');
}

function displayTopPicks(nhl, mlb) {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║              ⭐ TOP PICKS - NHL & MLB (PROCHAINS JOURS)          ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  
  const allPicks = [];
  
  nhl.forEach(m => {
    m.recommendations?.forEach(r => {
      if (r.confidence >= 68) {
        allPicks.push({
          sport: 'NHL',
          date: m.date,
          match: `${m.awayTeam} @ ${m.homeTeam}`,
          pick: r.label,
          confidence: r.confidence,
          sampleSize: r.statistics?.sampleSize,
          successRate: r.statistics?.successRate
        });
      }
    });
  });
  
  mlb.forEach(m => {
    m.recommendations?.forEach(r => {
      if (r.confidence >= 70) {
        allPicks.push({
          sport: 'MLB',
          date: m.date,
          match: `${m.awayTeam} @ ${m.homeTeam}`,
          pick: r.label,
          confidence: r.confidence,
          sampleSize: r.statistics?.sampleSize,
          successRate: r.statistics?.successRate
        });
      }
    });
  });
  
  allPicks.sort((a, b) => b.confidence - a.confidence);
  
  if (allPicks.length === 0) {
    console.log('\n⚠️ Aucun pick haute confiance trouvé');
    return;
  }
  
  console.log('\n┌─────────────────────────────────────────────────────────────────────┐');
  console.log('│ Sport│ Date       │ Match                    │ Pick        │ Conf │');
  console.log('├─────────────────────────────────────────────────────────────────────┤');
  
  allPicks.slice(0, 15).forEach(pick => {
    const sport = pick.sport.padEnd(4);
    const date = pick.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }).padEnd(10);
    const match = pick.match.substring(0, 24).padEnd(24);
    const pickText = pick.pick.replace(/[📈🏒]/g, '').trim().substring(0, 11).padEnd(11);
    const conf = `${pick.confidence}%`.padStart(4);
    console.log(`│ ${sport}│ ${date}│ ${match}│ ${pickText}│ ${conf} │`);
  });
  
  console.log('└─────────────────────────────────────────────────────────────────────┘');
  
  // Détail des meilleurs picks
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                  📊 DÉTAIL DES MEILLEURS PICKS                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  
  allPicks.slice(0, 5).forEach((pick, i) => {
    console.log(`\n${i + 1}. ${pick.pick} (${pick.confidence}%)`);
    console.log(`   📅 ${pick.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`);
    console.log(`   🏟️ ${pick.match}`);
    console.log(`   📈 Stats: ${pick.sampleSize} matchs analysés, ${pick.successRate}% réussite`);
  });
}

async function main() {
  const nhl = await getUpcomingNHL();
  
  if (nhl.length > 0) {
    console.log(`\n📅 ${nhl.length} matchs NHL à venir:\n`);
    nhl.forEach(m => displayMatchWithML(m, 'NHL'));
  } else {
    console.log('\n⚠️ Aucun match NHL trouvé');
  }
  
  const mlb = await getUpcomingMLB();
  
  if (mlb.length > 0) {
    console.log(`\n📅 ${mlb.length} matchs MLB à venir:\n`);
    mlb.forEach(m => displayMatchWithML(m, 'MLB'));
  } else {
    console.log('\n⚠️ Aucun match MLB trouvé');
  }
  
  displayTopPicks(nhl, mlb);
}

main();
