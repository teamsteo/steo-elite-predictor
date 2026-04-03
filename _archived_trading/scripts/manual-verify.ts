/**
 * Script de vérification manuelle des prédictions
 * Récupère les résultats ESPN et met à jour le store
 */

import https from 'https';

// Configuration
const GITHUB_REPO = 'steohidy/my-project';
const GITHUB_BRANCH = 'master';
const STORE_PATH = 'data/store-predictions.json';

// Ligues ESPN Football
const ESPN_LEAGUES = [
  { code: 'eng.1', name: 'Premier League' },
  { code: 'esp.1', name: 'La Liga' },
  { code: 'ger.1', name: 'Bundesliga' },
  { code: 'ita.1', name: 'Serie A' },
  { code: 'fra.1', name: 'Ligue 1' },
  { code: 'uefa.champions', name: 'Champions League' },
  { code: 'uefa.europa', name: 'Europa League' }
];

interface MatchResult {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  actualResult: 'home' | 'draw' | 'away';
  league: string;
}

interface Prediction {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport: string;
  matchDate: string;
  predictedResult: string;
  predictedGoals?: string;
  confidence: string;
  status: string;
  homeScore?: number;
  awayScore?: number;
  actualResult?: string;
  resultMatch?: boolean;
  goalsMatch?: boolean;
}

// Fetch JSON depuis URL
function fetchJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Normaliser nom d'équipe
function normalize(s: string): string {
  return s.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Matcher prédiction avec résultat
function matchTeams(pred: Prediction, result: MatchResult): boolean {
  const predHome = normalize(pred.homeTeam);
  const predAway = normalize(pred.awayTeam);
  const resHome = normalize(result.homeTeam);
  const resAway = normalize(result.awayTeam);

  return (predHome === resHome && predAway === resAway) ||
         (predHome === resAway && predAway === resHome) ||
         (predHome.includes(resHome) && predAway.includes(resAway)) ||
         (resHome.includes(predHome) && resAway.includes(predAway));
}

async function main() {
  console.log('🔍 VÉRIFICATION MANUELLE DES PRÉDICTIONS\n');
  console.log('=' .repeat(60));

  // 1. Charger le store
  const storeUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${STORE_PATH}`;
  console.log('\n📥 Chargement du store...');
  
  let store: { predictions: Prediction[] };
  try {
    store = await fetchJSON(storeUrl);
    console.log(`✅ ${store.predictions.length} prédictions chargées`);
  } catch (e) {
    console.error('❌ Erreur chargement store:', e);
    return;
  }

  const pending = store.predictions.filter(p => p.status === 'pending');
  console.log(`📋 ${pending.length} prédictions en attente à vérifier\n`);

  if (pending.length === 0) {
    console.log('✅ Aucune prédiction à vérifier');
    return;
  }

  // 2. Récupérer les dates uniques
  const dates = [...new Set(pending.map(p => p.matchDate.split('T')[0]))];
  console.log(`📅 Dates à vérifier: ${dates.join(', ')}\n`);

  // 3. Récupérer les résultats ESPN
  const allResults: MatchResult[] = [];

  // Football
  for (const date of dates) {
    const dateParam = date.replace(/-/g, '');
    
    for (const league of ESPN_LEAGUES) {
      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.code}/scoreboard?dates=${dateParam}`;
        const data = await fetchJSON(url);
        
        const events = data.events || [];
        for (const e of events) {
          if (e.status?.type?.completed !== true) continue;
          
          const comp = e.competitions?.[0];
          const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
          const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
          
          const homeScore = parseInt(home?.score || '0');
          const awayScore = parseInt(away?.score || '0');

          allResults.push({
            homeTeam: home?.team?.displayName || 'Unknown',
            awayTeam: away?.team?.displayName || 'Unknown',
            homeScore,
            awayScore,
            actualResult: homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'draw',
            league: league.name
          });
        }
      } catch (e) {
        // Silencieux pour les erreurs de ligue
      }
    }
  }

  console.log(`✅ ${allResults.length} résultats football récupérés`);

  // NBA
  try {
    const nbaUrl = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
    const nbaData = await fetchJSON(nbaUrl);
    const events = nbaData.events || [];
    
    for (const e of events) {
      if (e.status?.type?.completed !== true) continue;
      
      const eventDate = new Date(e.date).toISOString().split('T')[0];
      if (!dates.includes(eventDate)) continue;
      
      const comp = e.competitions?.[0];
      const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
      const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
      
      const homeScore = parseInt(home?.score || '0');
      const awayScore = parseInt(away?.score || '0');

      allResults.push({
        homeTeam: home?.team?.displayName || 'Unknown',
        awayTeam: away?.team?.displayName || 'Unknown',
        homeScore,
        awayScore,
        actualResult: homeScore > awayScore ? 'home' : 'away',
        league: 'NBA'
      });
    }
    console.log(`✅ Résultats NBA ajoutés`);
  } catch (e) {
    console.log('⚠️ Erreur ESPN NBA');
  }

  // 4. Croiser et mettre à jour
  console.log('\n' + '='.repeat(60));
  console.log('🎯 CROISEMENT PRÉDICTIONS / RÉSULTATS\n');

  let updated = 0;
  let won = 0;
  let lost = 0;
  let notFound = 0;

  for (const pred of pending) {
    const result = allResults.find(r => matchTeams(pred, r));
    
    if (result) {
      const resultMatch = pred.predictedResult === result.actualResult;
      
      // Calculer goalsMatch si applicable
      let goalsMatch: boolean | undefined;
      if (pred.predictedGoals) {
        const totalGoals = result.homeScore + result.awayScore;
        const isOver = pred.predictedGoals.toLowerCase().includes('over');
        goalsMatch = isOver ? totalGoals > 2.5 : totalGoals < 2.5;
      }

      // Mettre à jour la prédiction
      pred.status = 'completed';
      pred.homeScore = result.homeScore;
      pred.awayScore = result.awayScore;
      pred.actualResult = result.actualResult;
      pred.resultMatch = resultMatch;
      pred.goalsMatch = goalsMatch;

      updated++;
      if (resultMatch) won++; else lost++;

      const icon = resultMatch ? '✅' : '❌';
      console.log(`${icon} ${pred.homeTeam} vs ${pred.awayTeam}`);
      console.log(`   Prédit: ${pred.predictedResult} | Réel: ${result.homeScore}-${result.awayScore} (${result.actualResult})`);
      console.log(`   Résultat: ${resultMatch ? 'GAGNÉ' : 'PERDU'} | Confiance: ${pred.confidence}`);
      console.log();
    } else {
      notFound++;
      console.log(`⏳ ${pred.homeTeam} vs ${pred.awayTeam} - Résultat non trouvé`);
    }
  }

  // 5. Résumé
  console.log('='.repeat(60));
  console.log('\n📊 RÉSUMÉ\n');
  console.log(`   Prédictions vérifiées: ${updated}`);
  console.log(`   ✅ Gagnées: ${won}`);
  console.log(`   ❌ Perdues: ${lost}`);
  console.log(`   ⏳ Non trouvées: ${notFound}`);
  if (updated > 0) {
    console.log(`   📈 Win Rate: ${Math.round((won / updated) * 100)}%`);
  }

  // 6. Sauvegarder (simulation)
  console.log('\n💾 Store mis à jour (en mémoire)');
  
  // Afficher le JSON à sauvegarder
  const updatedStore = {
    predictions: store.predictions,
    lastUpdate: new Date().toISOString(),
    version: '3.0'
  };
  
  console.log('\nFichier à mettre à jour: data/store-predictions.json');
}

main().catch(console.error);
