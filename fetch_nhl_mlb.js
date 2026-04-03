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

async function getNHLMatches() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                    🏒 NHL HOCKEY - MATCHS DU JOUR                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  
  try {
    const data = await fetchJSON('https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard');
    const events = data.events || [];
    
    if (events.length === 0) {
      console.log('\n⚠️ Aucun match NHL aujourd\'hui');
      return [];
    }
    
    console.log(`\n📅 ${events.length} matchs NHL aujourd\'hui\n`);
    
    const matches = [];
    
    for (const event of events) {
      const competition = event.competitions?.[0];
      if (!competition) continue;
      
      const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
      const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
      
      if (!homeTeam || !awayTeam) continue;
      
      const homeName = homeTeam.team.displayName;
      const awayName = awayTeam.team.displayName;
      const status = event.status?.type?.shortDetail || 'À venir';
      const isLive = event.status?.type?.state === 'in';
      const isFinished = event.status?.type?.completed;
      
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
      
      // Records
      const homeRecord = homeTeam.records?.[0]?.summary || '';
      const awayRecord = awayTeam.records?.[0]?.summary || '';
      
      // Scores si en cours/terminé
      const homeScore = homeTeam.score;
      const awayScore = awayTeam.score;
      
      // Analyser avec ML
      const matchData = {
        sport: 'hockey',
        homeTeam: homeName,
        awayTeam: awayName,
        league: 'NHL',
        oddsHome,
        oddsAway
      };
      
      const recommendations = getBettingRecommendations(matchData);
      const bestTag = getBestBetTag(matchData);
      
      matches.push({
        homeTeam: homeName,
        awayTeam: awayName,
        oddsHome,
        oddsAway,
        overUnder,
        homeRecord,
        awayRecord,
        status,
        isLive,
        isFinished,
        homeScore,
        awayScore,
        recommendations,
        bestTag
      });
    }
    
    return matches;
    
  } catch (error) {
    console.error('Erreur NHL:', error.message);
    return [];
  }
}

async function getMLBMatches() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                    ⚾ MLB BASEBALL - MATCHS DU JOUR               ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  
  try {
    const data = await fetchJSON('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard');
    const events = data.events || [];
    
    if (events.length === 0) {
      console.log('\n⚠️ Aucun match MLB aujourd\'hui (hors saison?)');
      return [];
    }
    
    console.log(`\n📅 ${events.length} matchs MLB aujourd\'hui\n`);
    
    const matches = [];
    
    for (const event of events) {
      const competition = event.competitions?.[0];
      if (!competition) continue;
      
      const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
      const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
      
      if (!homeTeam || !awayTeam) continue;
      
      const homeName = homeTeam.team.displayName;
      const awayName = awayTeam.team.displayName;
      const status = event.status?.type?.shortDetail || 'À venir';
      const isLive = event.status?.type?.state === 'in';
      const isFinished = event.status?.type?.completed;
      
      // Cotes
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
      
      // Records
      const homeRecord = homeTeam.records?.[0]?.summary || '';
      const awayRecord = awayTeam.records?.[0]?.summary || '';
      
      // Scores
      const homeScore = homeTeam.score;
      const awayScore = awayTeam.score;
      
      // Analyser avec ML
      const matchData = {
        sport: 'baseball',
        homeTeam: homeName,
        awayTeam: awayName,
        league: 'MLB',
        oddsHome,
        oddsAway
      };
      
      const recommendations = getBettingRecommendations(matchData);
      const bestTag = getBestBetTag(matchData);
      
      matches.push({
        homeTeam: homeName,
        awayTeam: awayName,
        oddsHome,
        oddsAway,
        overUnder,
        homeRecord,
        awayRecord,
        status,
        isLive,
        isFinished,
        homeScore,
        awayScore,
        recommendations,
        bestTag
      });
    }
    
    return matches;
    
  } catch (error) {
    console.error('Erreur MLB:', error.message);
    return [];
  }
}

function displayMatches(matches, sport) {
  if (matches.length === 0) return;
  
  matches.forEach((match, i) => {
    const statusIcon = match.isLive ? '🔴' : match.isFinished ? '✅' : '⏰';
    const statusText = match.isLive ? 'LIVE' : match.isFinished ? 'TERMINÉ' : match.status;
    
    console.log('┌────────────────────────────────────────────────────────────────┐');
    console.log(`│ ${statusIcon} ${match.awayTeam} @ ${match.homeTeam}`.substring(0, 62).padEnd(62) + '│');
    
    if (match.isLive || match.isFinished) {
      console.log(`│    Score: ${match.awayScore} - ${match.homeScore} (${statusText})`.padEnd(62) + '│');
    } else {
      console.log(`│    ${statusText}`.padEnd(62) + '│');
    }
    
    console.log('├────────────────────────────────────────────────────────────────┤');
    console.log(`│ Cotes: ${match.homeTeam.split(' ')[0]} ${match.oddsHome.toFixed(2)} vs ${match.awayTeam.split(' ')[0]} ${match.oddsAway.toFixed(2)}`.padEnd(62) + '│');
    if (match.homeRecord || match.awayRecord) {
      console.log(`│ Records: ${match.homeRecord || '?-?'} vs ${match.awayRecord || '?-?'}`.padEnd(62) + '│');
    }
    console.log(`│ Over/Under: ${match.overUnder}`.padEnd(62) + '│');
    
    // Recommandations ML
    if (match.recommendations && match.recommendations.length > 0) {
      console.log('├────────────────────────────────────────────────────────────────┤');
      console.log('│ 🎯 PRÉDICTIONS ML:                                            │');
      
      match.recommendations.forEach(rec => {
        const conf = rec.confidence >= 70 ? '✅' : rec.confidence >= 60 ? '⚠️' : '⏳';
        const stats = rec.statistics;
        console.log(`│   ${conf} ${rec.label} (${rec.confidence}%)`.padEnd(62) + '│');
        if (stats) {
          console.log(`│      → ${stats.sampleSize} matchs, ${stats.successRate}% réussite`.padEnd(62) + '│');
        }
      });
    }
    
    console.log('└────────────────────────────────────────────────────────────────┘');
    console.log('');
  });
}

function displayTopPicks(nhlMatches, mlbMatches) {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                  ⭐ TOP PICKS DU JOUR - NHL & MLB                ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  
  const allPicks = [];
  
  // NHL picks
  nhlMatches.forEach(m => {
    if (m.isFinished) return;
    m.recommendations?.forEach(r => {
      if (r.confidence >= 70) {
        allPicks.push({
          sport: 'NHL',
          match: `${m.awayTeam} @ ${m.homeTeam}`,
          pick: r.label,
          confidence: r.confidence,
          sampleSize: r.statistics?.sampleSize,
          successRate: r.statistics?.successRate,
          odds: r.type === 'home_win' ? m.oddsHome : m.oddsAway
        });
      }
    });
  });
  
  // MLB picks
  mlbMatches.forEach(m => {
    if (m.isFinished) return;
    m.recommendations?.forEach(r => {
      if (r.confidence >= 70) {
        allPicks.push({
          sport: 'MLB',
          match: `${m.awayTeam} @ ${m.homeTeam}`,
          pick: r.label,
          confidence: r.confidence,
          sampleSize: r.statistics?.sampleSize,
          successRate: r.statistics?.successRate,
          odds: r.type === 'home_win' ? m.oddsHome : m.oddsAway
        });
      }
    });
  });
  
  // Trier par confiance
  allPicks.sort((a, b) => b.confidence - a.confidence);
  
  if (allPicks.length === 0) {
    console.log('\n⚠️ Aucun pick haute confiance (70%+) aujourd\'hui');
    return;
  }
  
  console.log('\n┌────────────────────────────────────────────────────────────────┐');
  console.log('│ Sport │ Match                        │ Pick           │ Conf  │');
  console.log('├────────────────────────────────────────────────────────────────┤');
  
  allPicks.slice(0, 10).forEach(pick => {
    const sport = pick.sport.padEnd(5);
    const match = pick.match.substring(0, 27).padEnd(27);
    const pickText = pick.pick.substring(0, 14).padEnd(14);
    const conf = `${pick.confidence}%`.padStart(5);
    console.log(`│ ${sport}│ ${match}│ ${pickText}│ ${conf} │`);
  });
  
  console.log('└────────────────────────────────────────────────────────────────┘');
}

async function main() {
  const nhlMatches = await getNHLMatches();
  displayMatches(nhlMatches, 'NHL');
  
  const mlbMatches = await getMLBMatches();
  displayMatches(mlbMatches, 'MLB');
  
  displayTopPicks(nhlMatches, mlbMatches);
}

main();
