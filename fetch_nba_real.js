const https = require('https');

// Récupérer les matchs NBA du jour depuis ESPN
const ESPN_NBA_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';

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

async function findMinnesotaDetroit() {
  console.log('🏀 Recherche du match Minnesota vs Detroit...\n');
  
  try {
    const data = await fetchJSON(ESPN_NBA_URL);
    const events = data.events || [];
    
    // Chercher le match
    const targetMatch = events.find(e => {
      const name = e.name?.toLowerCase() || '';
      const home = e.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home')?.team?.displayName?.toLowerCase() || '';
      const away = e.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away')?.team?.displayName?.toLowerCase() || '';
      
      return (name.includes('minnesota') || home.includes('minnesota') || away.includes('minnesota')) &&
             (name.includes('detroit') || home.includes('detroit') || away.includes('detroit'));
    });
    
    if (!targetMatch) {
      console.log('❌ Match non trouvé dans les matchs du jour');
      console.log('\n📋 Matchs NBA disponibles aujourd\'hui:');
      events.slice(0, 10).forEach(e => {
        const home = e.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home')?.team?.displayName;
        const away = e.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away')?.team?.displayName;
        const status = e.status?.type?.shortDetail;
        console.log(`   ${away} @ ${home} - ${status}`);
      });
      return;
    }
    
    // Extraire les données
    const competition = targetMatch.competitions[0];
    const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
    const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
    
    console.log('✅ MATCH TROUVÉ!\n');
    console.log('='.repeat(60));
    console.log(`📅 ${targetMatch.date}`);
    console.log(`🏟️ ${homeTeam.team.displayName} vs ${awayTeam.team.displayName}`);
    console.log(`📊 Status: ${targetMatch.status?.type?.shortDetail}`);
    console.log('='.repeat(60));
    
    // Scores si en cours/terminé
    if (homeTeam.score || awayTeam.score) {
      console.log(`\n🏀 SCORE: ${homeTeam.team.displayName} ${homeTeam.score} - ${awayTeam.score} ${awayTeam.team.displayName}`);
    }
    
    // Cotes (si disponibles)
    const odds = competition.odds?.[0];
    if (odds) {
      console.log('\n💰 COTES (DraftKings):');
      console.log(`   ${homeTeam.team.displayName}: ${odds.homeTeamOdds?.moneyLine || odds.details || 'N/A'}`);
      console.log(`   ${awayTeam.team.displayName}: ${odds.awayTeamOdds?.moneyLine || 'N/A'}`);
      if (odds.overUnder) {
        console.log(`   📈 Over/Under: ${odds.overUnder}`);
      }
      if (odds.spread) {
        console.log(`   📊 Spread: ${odds.spread}`);
      }
    } else {
      console.log('\n⚠️ Cotes non disponibles pour ce match');
    }
    
    // Stats équipes
    console.log('\n📊 STATS SAISON:');
    if (homeTeam.records) {
      console.log(`   ${homeTeam.team.displayName}: ${homeTeam.records?.[0]?.summary || 'N/A'}`);
    }
    if (awayTeam.records) {
      console.log(`   ${awayTeam.team.displayName}: ${awayTeam.records?.[0]?.summary || 'N/A'}`);
    }
    
    // Analyser avec le module ML
    console.log('\n');
    console.log('🧠 ANALYSE ML PATTERNS');
    console.log('='.repeat(60));
    
    // Déterminer le favori basé sur les cotes ou le record
    const homeRecord = homeTeam.records?.[0]?.summary || '';
    const awayRecord = awayTeam.records?.[0]?.summary || '';
    
    // Estimation des cotes si non disponibles
    let oddsHome = 1.45;
    let oddsAway = 2.80;
    
    if (odds?.homeTeamOdds?.moneyLine) {
      const ml = odds.homeTeamOdds.moneyLine;
      oddsHome = ml > 0 ? (ml / 100 + 1) : (100 / Math.abs(ml) + 1);
    }
    if (odds?.awayTeamOdds?.moneyLine) {
      const ml = odds.awayTeamOdds.moneyLine;
      oddsAway = ml > 0 ? (ml / 100 + 1) : (100 / Math.abs(ml) + 1);
    }
    
    console.log(`   Cotes estimées: ${homeTeam.team.displayName} ${oddsHome.toFixed(2)} vs ${awayTeam.team.displayName} ${oddsAway.toFixed(2)}`);
    
    // Over/Under line
    const ouLine = odds?.overUnder || 220;
    console.log(`   Ligne Over/Under: ${ouLine} pts`);
    
    return {
      homeTeam: homeTeam.team.displayName,
      awayTeam: awayTeam.team.displayName,
      oddsHome,
      oddsAway,
      overUnder: ouLine,
      status: targetMatch.status?.type?.shortDetail
    };
    
  } catch (error) {
    console.error('Erreur:', error.message);
  }
}

findMinnesotaDetroit();
