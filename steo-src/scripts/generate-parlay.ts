import https from 'https';

// Types
interface Match {
  id: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  oddsHome?: number;
  oddsAway?: number;
  oddsDraw?: number;
  homeScore?: number;
  awayScore?: number;
  status: string;
}

interface MLPattern {
  id: string;
  sport: string;
  condition: string;
  confidence: number;
  successRate: number;
  sampleSize: number;
}

interface Pick {
  match: string;
  sport: string;
  prediction: string;
  confidence: number;
  estimatedOdds: number;
  pattern: string;
}

// Patterns ML validés
const ML_PATTERNS: MLPattern[] = [
  // NBA
  { id: 'nba_over_220', sport: 'basketball', condition: 'all', confidence: 75, successRate: 75, sampleSize: 408 },
  { id: 'nba_home_favorite', sport: 'basketball', condition: 'oddsHome < 1.5', confidence: 78, successRate: 78, sampleSize: 156 },
  
  // NHL
  { id: 'nhl_over_55', sport: 'hockey', condition: 'all', confidence: 59, successRate: 59, sampleSize: 1451 },
  { id: 'oilers_home', sport: 'hockey', condition: 'Edmonton home', confidence: 74, successRate: 74, sampleSize: 31 },
  { id: 'bruins_home', sport: 'hockey', condition: 'Boston home', confidence: 68, successRate: 68, sampleSize: 41 },
  { id: 'rangers_home', sport: 'hockey', condition: 'NY Rangers home', confidence: 65, successRate: 65, sampleSize: 38 },
  
  // MLB
  { id: 'mlb_over_75', sport: 'baseball', condition: 'all', confidence: 62, successRate: 62, sampleSize: 4993 },
  { id: 'reds_over', sport: 'baseball', condition: 'Cincinnati plays', confidence: 85, successRate: 85, sampleSize: 33 },
  { id: 'redsox_over', sport: 'baseball', condition: 'Boston Red Sox plays', confidence: 81, successRate: 81, sampleSize: 36 },
  { id: 'rockies_over', sport: 'baseball', condition: 'Colorado plays', confidence: 79, successRate: 79, sampleSize: 33 },
  { id: 'diamondbacks_over', sport: 'baseball', condition: 'Arizona plays', confidence: 80, successRate: 80, sampleSize: 35 },
  { id: 'braves_over', sport: 'baseball', condition: 'Atlanta plays', confidence: 76, successRate: 76, sampleSize: 34 },
  { id: 'yankees_over', sport: 'baseball', condition: 'NY Yankees plays', confidence: 72, successRate: 72, sampleSize: 38 },
];

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
function extractMatches(espnData: any, sport: string): Match[] {
  const matches: Match[] = [];
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
      startTime: event.date,
      oddsHome,
      oddsAway,
      homeScore: home.score ? parseInt(home.score) : undefined,
      awayScore: away.score ? parseInt(away.score) : undefined,
      status: event.status?.type?.name || 'scheduled'
    });
  }
  
  return matches;
}

// Analyser un match avec les patterns ML
function analyzeMatch(match: Match): Pick[] {
  const picks: Pick[] = [];
  
  // NBA Analysis
  if (match.sport === 'basketball') {
    // Pattern nba_over_220 - 75% confiance
    picks.push({
      match: `${match.awayTeam} @ ${match.homeTeam}`,
      sport: 'NBA',
      prediction: 'Over 220.5 Points',
      confidence: 75,
      estimatedOdds: 1.85,
      pattern: 'nba_over_220 (75% sur 408 matchs)'
    });
    
    // Pattern nba_home_favorite - si cote < 1.5
    if (match.oddsHome && match.oddsHome < 1.5) {
      picks.push({
        match: `${match.awayTeam} @ ${match.homeTeam}`,
        sport: 'NBA',
        prediction: `${match.homeTeam} Gagne`,
        confidence: 78,
        estimatedOdds: match.oddsHome || 1.45,
        pattern: 'nba_home_favorite (78% sur 156 matchs)'
      });
    }
  }
  
  // NHL Analysis
  if (match.sport === 'hockey') {
    const homeTeamLower = match.homeTeam.toLowerCase();
    
    // Oilers home - 74%
    if (homeTeamLower.includes('edmonton') || homeTeamLower.includes('oilers')) {
      picks.push({
        match: `${match.awayTeam} @ ${match.homeTeam}`,
        sport: 'NHL',
        prediction: `${match.homeTeam} Gagne`,
        confidence: 74,
        estimatedOdds: match.oddsHome || 1.65,
        pattern: 'oilers_home (74% sur 31 matchs)'
      });
    }
    
    // Bruins home - 68%
    if (homeTeamLower.includes('boston') || homeTeamLower.includes('bruins')) {
      picks.push({
        match: `${match.awayTeam} @ ${match.homeTeam}`,
        sport: 'NHL',
        prediction: `${match.homeTeam} Gagne`,
        confidence: 68,
        estimatedOdds: match.oddsHome || 1.70,
        pattern: 'bruins_home (68% sur 41 matchs)'
      });
    }
    
    // Rangers home - 65%
    if (homeTeamLower.includes('rangers') || homeTeamLower.includes('new york rangers')) {
      picks.push({
        match: `${match.awayTeam} @ ${match.homeTeam}`,
        sport: 'NHL',
        prediction: `${match.homeTeam} Gagne`,
        confidence: 65,
        estimatedOdds: match.oddsHome || 1.75,
        pattern: 'rangers_home (65% sur 38 matchs)'
      });
    }
    
    // Over 5.5 général - 59%
    picks.push({
      match: `${match.awayTeam} @ ${match.homeTeam}`,
      sport: 'NHL',
      prediction: 'Over 5.5 Buts',
      confidence: 59,
      estimatedOdds: 1.90,
      pattern: 'nhl_over_55 (59% sur 1451 matchs)'
    });
  }
  
  // MLB Analysis
  if (match.sport === 'baseball') {
    const homeTeamLower = match.homeTeam.toLowerCase();
    const awayTeamLower = match.awayTeam.toLowerCase();
    const bothTeams = `${homeTeamLower} ${awayTeamLower}`;
    
    // Reds Over - 85% (MEILLEUR PATTERN!)
    if (bothTeams.includes('reds') || bothTeams.includes('cincinnati')) {
      picks.push({
        match: `${match.awayTeam} @ ${match.homeTeam}`,
        sport: 'MLB',
        prediction: 'Over 7.5 Runs',
        confidence: 85,
        estimatedOdds: 1.85,
        pattern: 'reds_over (85% sur 33 matchs) ⭐ TOP'
      });
    }
    
    // Red Sox Over - 81%
    if (bothTeams.includes('red sox') || bothTeams.includes('boston')) {
      picks.push({
        match: `${match.awayTeam} @ ${match.homeTeam}`,
        sport: 'MLB',
        prediction: 'Over 7.5 Runs',
        confidence: 81,
        estimatedOdds: 1.85,
        pattern: 'redsox_over (81% sur 36 matchs)'
      });
    }
    
    // Diamondbacks Over - 80%
    if (bothTeams.includes('diamondbacks') || bothTeams.includes('arizona')) {
      picks.push({
        match: `${match.awayTeam} @ ${match.homeTeam}`,
        sport: 'MLB',
        prediction: 'Over 7.5 Runs',
        confidence: 80,
        estimatedOdds: 1.85,
        pattern: 'diamondbacks_over (80% sur 35 matchs)'
      });
    }
    
    // Rockies Over - 79%
    if (bothTeams.includes('rockies') || bothTeams.includes('colorado')) {
      picks.push({
        match: `${match.awayTeam} @ ${match.homeTeam}`,
        sport: 'MLB',
        prediction: 'Over 7.5 Runs',
        confidence: 79,
        estimatedOdds: 1.85,
        pattern: 'rockies_over (79% sur 33 matchs)'
      });
    }
    
    // Braves Over - 76%
    if (bothTeams.includes('braves') || bothTeams.includes('atlanta')) {
      picks.push({
        match: `${match.awayTeam} @ ${match.homeTeam}`,
        sport: 'MLB',
        prediction: 'Over 7.5 Runs',
        confidence: 76,
        estimatedOdds: 1.85,
        pattern: 'braves_over (76% sur 34 matchs)'
      });
    }
    
    // Yankees Over - 72%
    if (bothTeams.includes('yankees')) {
      picks.push({
        match: `${match.awayTeam} @ ${match.homeTeam}`,
        sport: 'MLB',
        prediction: 'Over 7.5 Runs',
        confidence: 72,
        estimatedOdds: 1.85,
        pattern: 'yankees_over (72% sur 38 matchs)'
      });
    }
  }
  
  return picks;
}

// Main
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('    🎯 GÉNÉRATION COMBINÉ MULTI-SPORT - HIGH CONFIDENCE PICKS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const allPicks: Pick[] = [];
  
  // Fetch NBA
  console.log('📡 Récupération matchs NBA...');
  try {
    const nbaData = await fetchESPN('basketball/nba');
    const nbaMatches = extractMatches(nbaData, 'basketball');
    console.log(`   ✅ ${nbaMatches.length} matchs NBA trouvés`);
    
    for (const match of nbaMatches.slice(0, 5)) {
      const picks = analyzeMatch(match);
      allPicks.push(...picks);
    }
  } catch (e) {
    console.log('   ⚠️ Erreur NBA:', e);
  }
  
  // Fetch NHL
  console.log('📡 Récupération matchs NHL...');
  try {
    const nhlData = await fetchESPN('hockey/nhl');
    const nhlMatches = extractMatches(nhlData, 'hockey');
    console.log(`   ✅ ${nhlMatches.length} matchs NHL trouvés`);
    
    for (const match of nhlMatches.slice(0, 5)) {
      const picks = analyzeMatch(match);
      allPicks.push(...picks);
    }
  } catch (e) {
    console.log('   ⚠️ Erreur NHL:', e);
  }
  
  // Fetch MLB
  console.log('📡 Récupération matchs MLB...');
  try {
    const mlbData = await fetchESPN('baseball/mlb');
    const mlbMatches = extractMatches(mlbData, 'baseball');
    console.log(`   ✅ ${mlbMatches.length} matchs MLB trouvés`);
    
    for (const match of mlbMatches.slice(0, 5)) {
      const picks = analyzeMatch(match);
      allPicks.push(...picks);
    }
  } catch (e) {
    console.log('   ⚠️ Erreur MLB:', e);
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('    📊 ANALYSE DES PICKS - CLASSEMENT PAR CONFIANCE');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Trier par confiance décroissante
  allPicks.sort((a, b) => b.confidence - a.confidence);
  
  // Grouper par sport
  const nbaPicks = allPicks.filter(p => p.sport === 'NBA').slice(0, 5);
  const nhlPicks = allPicks.filter(p => p.sport === 'NHL').slice(0, 5);
  const mlbPicks = allPicks.filter(p => p.sport === 'MLB').slice(0, 5);
  
  // Afficher NBA
  console.log('🏀 NBA - TOP PICKS:\n');
  nbaPicks.forEach((pick, i) => {
    const emoji = pick.confidence >= 75 ? '🔥' : pick.confidence >= 70 ? '✅' : '👍';
    console.log(`   ${i + 1}. ${emoji} ${pick.match}`);
    console.log(`      → ${pick.prediction} @ ${pick.estimatedOdds.toFixed(2)}`);
    console.log(`      → Confiance: ${pick.confidence}% | ${pick.pattern}`);
    console.log('');
  });
  
  // Afficher NHL
  console.log('🏒 NHL - TOP PICKS:\n');
  nhlPicks.forEach((pick, i) => {
    const emoji = pick.confidence >= 70 ? '🔥' : pick.confidence >= 65 ? '✅' : '👍';
    console.log(`   ${i + 1}. ${emoji} ${pick.match}`);
    console.log(`      → ${pick.prediction} @ ${pick.estimatedOdds.toFixed(2)}`);
    console.log(`      → Confiance: ${pick.confidence}% | ${pick.pattern}`);
    console.log('');
  });
  
  // Afficher MLB
  console.log('⚾ MLB - TOP PICKS:\n');
  mlbPicks.forEach((pick, i) => {
    const emoji = pick.confidence >= 80 ? '🔥' : pick.confidence >= 75 ? '✅' : '👍';
    console.log(`   ${i + 1}. ${emoji} ${pick.match}`);
    console.log(`      → ${pick.prediction} @ ${pick.estimatedOdds.toFixed(2)}`);
    console.log(`      → Confiance: ${pick.confidence}% | ${pick.pattern}`);
    console.log('');
  });
  
  // Sélection finale pour combiné (3+ par sport, haute confiance)
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('    🎰 COMBINÉ FINAL - HAUTE CONFIANCE');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const finalPicks: Pick[] = [];
  
  // 3 meilleurs NBA (confiance >= 70%)
  const topNBA = nbaPicks.filter(p => p.confidence >= 70).slice(0, 3);
  finalPicks.push(...topNBA);
  
  // 3 meilleurs NHL (confiance >= 60%)
  const topNHL = nhlPicks.filter(p => p.confidence >= 60).slice(0, 3);
  finalPicks.push(...topNHL);
  
  // 3 meilleurs MLB (confiance >= 75%)
  const topMLB = mlbPicks.filter(p => p.confidence >= 75).slice(0, 3);
  finalPicks.push(...topMLB);
  
  // Afficher le combiné
  let totalOdds = 1;
  
  console.log('📋 SÉLECTION FINALE:\n');
  
  const sports = ['NBA', 'NHL', 'MLB'];
  for (const sport of sports) {
    const sportPicks = finalPicks.filter(p => p.sport === sport);
    if (sportPicks.length > 0) {
      console.log(`\n${sport === 'NBA' ? '🏀' : sport === 'NHL' ? '🏒' : '⚾'} ${sport}:`);
      sportPicks.forEach((pick, i) => {
        console.log(`   ${i + 1}. ${pick.match}`);
        console.log(`      → ${pick.prediction} @ ${pick.estimatedOdds.toFixed(2)}`);
        console.log(`      → Confiance: ${pick.confidence}%`);
        totalOdds *= pick.estimatedOdds;
      });
    }
  }
  
  // Récapitulatif
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('    📈 RÉCAPITULATIF DU COMBINÉ');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const avgConfidence = finalPicks.reduce((sum, p) => sum + p.confidence, 0) / finalPicks.length;
  
  console.log(`   📊 Nombre de sélections: ${finalPicks.length}`);
  console.log(`   📊 Confiance moyenne: ${avgConfidence.toFixed(1)}%`);
  console.log(`   📊 Cote combinée estimée: ${totalOdds.toFixed(2)}`);
  console.log(`   📊 Gain potentiel (100€): ${(100 * totalOdds).toFixed(2)}€`);
  
  // Avertissement
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('    ⚠️  AVERTISSEMENT');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('   Les prédictions sont basées sur des patterns statistiques');
  console.log('   historiques. Les paris comportent des risques. Jouez');
  console.log('   responsablement.\n');
}

main().catch(console.error);
