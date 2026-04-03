const https = require('https');

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

async function searchMinnesotaDetroit() {
  console.log('🔍 Recherche du match Minnesota vs Detroit dans les prochains jours...\n');
  
  // Chercher sur plusieurs jours
  const dates = [];
  for (let i = 0; i <= 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split('T')[0].replace(/-/g, ''));
  }
  
  for (const date of dates) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${date}`;
      const data = await fetchJSON(url);
      const events = data.events || [];
      
      const targetMatch = events.find(e => {
        const home = e.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home')?.team?.displayName?.toLowerCase() || '';
        const away = e.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away')?.team?.displayName?.toLowerCase() || '';
        
        return (home.includes('minnesota') || away.includes('minnesota')) &&
               (home.includes('detroit') || away.includes('detroit'));
      });
      
      if (targetMatch) {
        console.log('✅ MATCH TROUVÉ!\n');
        console.log('='.repeat(60));
        
        const competition = targetMatch.competitions[0];
        const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
        const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
        
        const matchDate = new Date(targetMatch.date);
        console.log(`📅 Date: ${matchDate.toLocaleDateString('fr-FR')} à ${matchDate.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}`);
        console.log(`🏟️ ${homeTeam.team.displayName} (Domicile) vs ${awayTeam.team.displayName} (Extérieur)`);
        console.log(`📍 ${competition.venue?.fullName || 'Lieu TBD'}`);
        console.log('='.repeat(60));
        
        // Cotes
        const odds = competition.odds?.[0];
        console.log('\n💰 COTES:');
        
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
          
          console.log(`   ${homeTeam.team.displayName}: ${oddsHome.toFixed(2)}`);
          console.log(`   ${awayTeam.team.displayName}: ${oddsAway.toFixed(2)}`);
          console.log(`   📈 Over/Under: ${overUnder} pts`);
          if (odds.spread) console.log(`   📊 Spread: ${odds.spread}`);
        } else {
          console.log('   ⚠️ Cotes pas encore disponibles');
          console.log(`   Estimation: ${homeTeam.team.displayName} ${oddsHome.toFixed(2)} vs ${awayTeam.team.displayName} ${oddsAway.toFixed(2)}`);
        }
        
        // Records
        console.log('\n📊 RECORDS SAISON:');
        const homeRecord = homeTeam.records?.[0];
        const awayRecord = awayTeam.records?.[0];
        if (homeRecord) {
          console.log(`   ${homeTeam.team.displayName}: ${homeRecord.summary} (${homeRecord.type || 'global'})`);
        }
        if (awayRecord) {
          console.log(`   ${awayTeam.team.displayName}: ${awayRecord.summary} (${awayRecord.type || 'global'})`);
        }
        
        // Stats additionnelles
        if (homeTeam.stats || awayTeam.stats) {
          console.log('\n📈 STATISTIQUES:');
          const homeStats = {};
          const awayStats = {};
          
          (homeTeam.stats || []).forEach(s => {
            if (s.name === 'pointsPerGame' || s.name === 'avgPoints') homeStats.ppg = s.value;
            if (s.name === 'reboundsPerGame') homeStats.rpg = s.value;
            if (s.name === 'assistsPerGame') homeStats.apg = s.value;
          });
          (awayTeam.stats || []).forEach(s => {
            if (s.name === 'pointsPerGame' || s.name === 'avgPoints') awayStats.ppg = s.value;
            if (s.name === 'reboundsPerGame') awayStats.rpg = s.value;
            if (s.name === 'assistsPerGame') awayStats.apg = s.value;
          });
          
          if (homeStats.ppg) console.log(`   ${homeTeam.team.displayName}: ${homeStats.ppg} pts/match`);
          if (awayStats.ppg) console.log(`   ${awayTeam.team.displayName}: ${awayStats.ppg} pts/match`);
        }
        
        // ANALYSE ML
        console.log('\n');
        console.log('🧠 ANALYSE ML PATTERNS');
        console.log('='.repeat(60));
        
        return {
          found: true,
          homeTeam: homeTeam.team.displayName,
          awayTeam: awayTeam.team.displayName,
          oddsHome,
          oddsAway,
          overUnder,
          date: matchDate
        };
      }
      
    } catch (e) {
      // Continue to next date
    }
  }
  
  console.log('❌ Match Minnesota vs Detroit non trouvé dans les 7 prochains jours');
  return { found: false };
}

searchMinnesotaDetroit();
