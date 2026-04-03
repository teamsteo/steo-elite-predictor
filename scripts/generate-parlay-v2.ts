import https from 'https';

// Types
interface Pick {
  match: string;
  sport: string;
  prediction: string;
  confidence: number;
  estimatedOdds: number;
  pattern: string;
  startTime: string;
}

// Fetch ESPN API
function fetchESPN(league: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${league}/scoreboard`;
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

// Extraire les matchs
function extractMatches(espnData: any, sport: string) {
  const matches: any[] = [];
  const events = espnData?.events || [];
  
  for (const event of events) {
    const competitions = event.competitions?.[0];
    if (!competitions) continue;
    
    const home = competitions.competitors?.find((c: any) => c.homeAway === 'home');
    const away = competitions.competitors?.find((c: any) => c.homeAway === 'away');
    
    if (!home || !away) continue;
    
    // Extraire les cotes
    let oddsHome: number | undefined;
    let oddsAway: number | undefined;
    
    const odds = competitions.odds?.[0];
    if (odds) {
      if (odds.homeTeamOdds?.moneyLine) {
        oddsHome = odds.homeTeamOdds.moneyLine > 0 ? odds.homeTeamOdds.moneyLine / 100 + 1 : 100 / Math.abs(odds.homeTeamOdds.moneyLine) + 1;
      }
      if (odds.awayTeamOdds?.moneyLine) {
        oddsAway = odds.awayTeamOdds.moneyLine > 0 ? odds.awayTeamOdds.moneyLine / 100 + 1 : 100 / Math.abs(odds.awayTeamOdds.moneyLine) + 1;
      }
    }
    
    matches.push({
      id: event.id,
      sport,
      homeTeam: home.team?.displayName || 'Unknown',
      awayTeam: away.team?.displayName || 'Unknown',
      homeTeamShort: home.team?.shortDisplayName || '',
      awayTeamShort: away.team?.shortDisplayName || '',
      startTime: event.date,
      oddsHome,
      oddsAway,
      status: event.status?.type?.name || 'scheduled'
    });
  }
  
  return matches;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('    🎯 GÉNÉRATION COMBINÉ MULTI-SPORT - 3+ PICKS PAR SPORT');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const picks: Pick[] = [];
  
  // ==================== NBA ====================
  console.log('🏀 ANALYSE NBA...\n');
  try {
    const nbaData = await fetchESPN('basketball/nba');
    const nbaMatches = extractMatches(nbaData, 'basketball');
    console.log(`   📡 ${nbaMatches.length} matchs trouvés\n`);
    
    // Pattern NBA Over 220 - 75% confiance
    for (const match of nbaMatches) {
      picks.push({
        match: `${match.awayTeam} @ ${match.homeTeam}`,
        sport: 'NBA',
        prediction: 'Over 220.5 Points',
        confidence: 75,
        estimatedOdds: 1.85,
        pattern: 'nba_over_220 (75% SR, n=408)',
        startTime: match.startTime
      });
    }
  } catch (e) {
    console.log('   ⚠️ Erreur NBA');
  }
  
  // ==================== NHL ====================
  console.log('🏒 ANALYSE NHL...\n');
  try {
    const nhlData = await fetchESPN('hockey/nhl');
    const nhlMatches = extractMatches(nhlData, 'hockey');
    console.log(`   📡 ${nhlMatches.length} matchs trouvés\n`);
    
    for (const match of nhlMatches) {
      const homeLower = match.homeTeam.toLowerCase();
      const homeShort = match.homeTeamShort.toLowerCase();
      
      // Oilers home - 74%
      if (homeLower.includes('edmonton') || homeLower.includes('oilers') || homeShort.includes('oilers')) {
        picks.push({
          match: `${match.awayTeam} @ ${match.homeTeam}`,
          sport: 'NHL',
          prediction: `${match.homeTeam} Gagne`,
          confidence: 74,
          estimatedOdds: match.oddsHome || 1.65,
          pattern: 'oilers_home (74% SR, n=31) ⭐',
          startTime: match.startTime
        });
      }
      
      // Bruins home - 68%
      if (homeLower.includes('boston') || homeLower.includes('bruins') || homeShort.includes('bruins')) {
        picks.push({
          match: `${match.awayTeam} @ ${match.homeTeam}`,
          sport: 'NHL',
          prediction: `${match.homeTeam} Gagne`,
          confidence: 68,
          estimatedOdds: match.oddsHome || 1.70,
          pattern: 'bruins_home (68% SR, n=41)',
          startTime: match.startTime
        });
      }
      
      // Rangers home - 65%
      if (homeLower.includes('rangers')) {
        picks.push({
          match: `${match.awayTeam} @ ${match.homeTeam}`,
          sport: 'NHL',
          prediction: `${match.homeTeam} Gagne`,
          confidence: 65,
          estimatedOdds: match.oddsHome || 1.75,
          pattern: 'rangers_home (65% SR, n=38)',
          startTime: match.startTime
        });
      }
      
      // Over 5.5 général - 59% (pour compléter)
      picks.push({
        match: `${match.awayTeam} @ ${match.homeTeam}`,
        sport: 'NHL',
        prediction: 'Over 5.5 Buts',
        confidence: 59,
        estimatedOdds: 1.90,
        pattern: 'nhl_over_55 (59% SR, n=1451)',
        startTime: match.startTime
      });
    }
  } catch (e) {
    console.log('   ⚠️ Erreur NHL');
  }
  
  // ==================== MLB ====================
  console.log('⚾ ANALYSE MLB...\n');
  try {
    const mlbData = await fetchESPN('baseball/mlb');
    const mlbMatches = extractMatches(mlbData, 'baseball');
    console.log(`   📡 ${mlbMatches.length} matchs trouvés\n`);
    
    // Debug: afficher les équipes
    console.log('   Équipes MLB détectées:');
    for (const m of mlbMatches.slice(0, 5)) {
      console.log(`   - ${m.awayTeam} @ ${m.homeTeam}`);
    }
    console.log('');
    
    for (const match of mlbMatches) {
      const homeLower = match.homeTeam.toLowerCase();
      const awayLower = match.awayTeam.toLowerCase();
      const both = `${homeLower} ${awayLower}`;
      
      // Reds - 85%
      if (both.includes('reds') || both.includes('cincinnati')) {
        picks.push({
          match: `${match.awayTeam} @ ${match.homeTeam}`,
          sport: 'MLB',
          prediction: 'Over 7.5 Runs',
          confidence: 85,
          estimatedOdds: 1.85,
          pattern: 'reds_over (85% SR, n=33) ⭐⭐ TOP',
          startTime: match.startTime
        });
      }
      
      // Red Sox - 81%
      if (both.includes('red sox')) {
        picks.push({
          match: `${match.awayTeam} @ ${match.homeTeam}`,
          sport: 'MLB',
          prediction: 'Over 7.5 Runs',
          confidence: 81,
          estimatedOdds: 1.85,
          pattern: 'redsox_over (81% SR, n=36) ⭐',
          startTime: match.startTime
        });
      }
      
      // Diamondbacks - 80%
      if (both.includes('diamondbacks') || both.includes('arizona') || both.includes('d-backs')) {
        picks.push({
          match: `${match.awayTeam} @ ${match.homeTeam}`,
          sport: 'MLB',
          prediction: 'Over 7.5 Runs',
          confidence: 80,
          estimatedOdds: 1.85,
          pattern: 'diamondbacks_over (80% SR, n=35) ⭐',
          startTime: match.startTime
        });
      }
      
      // Rockies - 79%
      if (both.includes('rockies') || both.includes('colorado')) {
        picks.push({
          match: `${match.awayTeam} @ ${match.homeTeam}`,
          sport: 'MLB',
          prediction: 'Over 7.5 Runs',
          confidence: 79,
          estimatedOdds: 1.85,
          pattern: 'rockies_over (79% SR, n=33)',
          startTime: match.startTime
        });
      }
      
      // Braves - 76%
      if (both.includes('braves') || both.includes('atlanta')) {
        picks.push({
          match: `${match.awayTeam} @ ${match.homeTeam}`,
          sport: 'MLB',
          prediction: 'Over 7.5 Runs',
          confidence: 76,
          estimatedOdds: 1.85,
          pattern: 'braves_over (76% SR, n=34)',
          startTime: match.startTime
        });
      }
      
      // Yankees - 72%
      if (both.includes('yankees')) {
        picks.push({
          match: `${match.awayTeam} @ ${match.homeTeam}`,
          sport: 'MLB',
          prediction: 'Over 7.5 Runs',
          confidence: 72,
          estimatedOdds: 1.85,
          pattern: 'yankees_over (72% SR, n=38)',
          startTime: match.startTime
        });
      }
      
      // Over 7.5 général pour tous les matchs - 62%
      picks.push({
        match: `${match.awayTeam} @ ${match.homeTeam}`,
        sport: 'MLB',
        prediction: 'Over 7.5 Runs',
        confidence: 62,
        estimatedOdds: 1.85,
        pattern: 'mlb_over_75 (62% SR, n=4993)',
        startTime: match.startTime
      });
    }
  } catch (e) {
    console.log('   ⚠️ Erreur MLB');
  }
  
  // ==================== SÉLECTION FINALE ====================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('    🎰 COMBINÉ FINAL - 3+ PICKS HAUTE CONFIANCE PAR SPORT');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Prendre les meilleurs picks par sport
  const nbaPicks = picks.filter(p => p.sport === 'NBA').sort((a, b) => b.confidence - a.confidence);
  const nhlPicks = picks.filter(p => p.sport === 'NHL').sort((a, b) => b.confidence - a.confidence);
  const mlbPicks = picks.filter(p => p.sport === 'MLB').sort((a, b) => b.confidence - a.confidence);
  
  // Dédupliquer et prendre le meilleur par match
  const uniqueNBA = new Map<string, Pick>();
  for (const p of nbaPicks) {
    if (!uniqueNBA.has(p.match)) uniqueNBA.set(p.match, p);
  }
  
  const uniqueNHL = new Map<string, Pick>();
  for (const p of nhlPicks) {
    if (!uniqueNHL.has(p.match)) uniqueNHL.set(p.match, p);
  }
  
  const uniqueMLB = new Map<string, Pick>();
  for (const p of mlbPicks) {
    if (!uniqueMLB.has(p.match)) uniqueMLB.set(p.match, p);
  }
  
  // Sélectionner 3+ picks par sport
  const finalNBA = [...uniqueNBA.values()].slice(0, 3);
  const finalNHL = [...uniqueNHL.values()].slice(0, 3);
  const finalMLB = [...uniqueMLB.values()].slice(0, 3);
  
  const finalPicks = [...finalNBA, ...finalNHL, ...finalMLB];
  
  let totalOdds = 1;
  
  // NBA
  console.log('🏀 NBA:\n');
  finalNBA.forEach((pick, i) => {
    const emoji = pick.confidence >= 75 ? '🔥' : '✅';
    console.log(`   ${i + 1}. ${emoji} ${pick.match}`);
    console.log(`      → ${pick.prediction} @ ${pick.estimatedOdds.toFixed(2)}`);
    console.log(`      → Confiance: ${pick.confidence}%`);
    console.log(`      → Pattern: ${pick.pattern}`);
    console.log('');
    totalOdds *= pick.estimatedOdds;
  });
  
  // NHL
  console.log('🏒 NHL:\n');
  finalNHL.forEach((pick, i) => {
    const emoji = pick.confidence >= 70 ? '🔥' : pick.confidence >= 65 ? '✅' : '👍';
    console.log(`   ${i + 1}. ${emoji} ${pick.match}`);
    console.log(`      → ${pick.prediction} @ ${pick.estimatedOdds.toFixed(2)}`);
    console.log(`      → Confiance: ${pick.confidence}%`);
    console.log(`      → Pattern: ${pick.pattern}`);
    console.log('');
    totalOdds *= pick.estimatedOdds;
  });
  
  // MLB
  console.log('⚾ MLB:\n');
  finalMLB.forEach((pick, i) => {
    const emoji = pick.confidence >= 80 ? '🔥' : pick.confidence >= 70 ? '✅' : '👍';
    console.log(`   ${i + 1}. ${emoji} ${pick.match}`);
    console.log(`      → ${pick.prediction} @ ${pick.estimatedOdds.toFixed(2)}`);
    console.log(`      → Confiance: ${pick.confidence}%`);
    console.log(`      → Pattern: ${pick.pattern}`);
    console.log('');
    totalOdds *= pick.estimatedOdds;
  });
  
  // ==================== RÉCAPITULATIF ====================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('    📊 RÉCAPITULATIF DU COMBINÉ');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const avgConf = finalPicks.reduce((s, p) => s + p.confidence, 0) / finalPicks.length;
  const probSucces = finalPicks.reduce((prob, p) => prob * (p.confidence / 100), 1);
  
  console.log(`   📋 Sélections: ${finalPicks.length}`);
  console.log(`   📋 NBA: ${finalNBA.length} picks`);
  console.log(`   📋 NHL: ${finalNHL.length} picks`);
  console.log(`   📋 MLB: ${finalMLB.length} picks`);
  console.log('');
  console.log(`   📈 Confiance moyenne: ${avgConf.toFixed(1)}%`);
  console.log(`   📈 Probabilité combinée: ${(probSucces * 100).toFixed(1)}%`);
  console.log('');
  console.log(`   💰 COTE COMBINÉE: ${totalOdds.toFixed(2)}`);
  console.log(`   💰 Mise 10€ → Gain potentiel: ${(10 * totalOdds).toFixed(2)}€`);
  console.log(`   💰 Mise 50€ → Gain potentiel: ${(50 * totalOdds).toFixed(2)}€`);
  console.log(`   💰 Mise 100€ → Gain potentiel: ${(100 * totalOdds).toFixed(2)}€`);
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('    ⚠️  Les paris comportent des risques. Jouez responsablement.');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
