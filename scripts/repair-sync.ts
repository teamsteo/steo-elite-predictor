/**
 * Script de réparation et synchronisation complète
 * Répare la déconnexion entre store-predictions et stats_history
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = 'steohidy/my-project';
const GITHUB_BRANCH = 'master';

// Charger un fichier depuis GitHub
async function loadFromGitHub(path: string): Promise<any> {
  const res = await fetch(
    `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}`
  );
  if (res.ok) {
    return await res.json();
  }
  return null;
}

// Sauvegarder sur GitHub
async function saveToGitHub(path: string, data: any, message: string): Promise<boolean> {
  if (!GITHUB_TOKEN) {
    console.log(`⚠️ Pas de GITHUB_TOKEN - données affichées en preview`);
    console.log(`📄 Contenu qui serait sauvegardé dans ${path}:`);
    console.log(JSON.stringify(data, null, 2).substring(0, 500) + '...\n');
    return true; // Simuler le succès pour voir les données
  }

  // Récupérer le SHA
  const getRes = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
    {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json'
      }
    }
  );

  let sha = '';
  if (getRes.ok) {
    const fileInfo = await getRes.json();
    sha = fileInfo.sha;
  }

  // Sauvegarder
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  const saveRes = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message,
        content,
        sha: sha || undefined,
        branch: GITHUB_BRANCH
      })
    }
  );

  return saveRes.ok;
}

async function main() {
  console.log('🔧 RÉPARATION ET SYNCHRONISATION COMPLETE\n');
  console.log('=' .repeat(50));
  
  // 1. Charger toutes les sources de données
  console.log('\n📥 Chargement des données...');
  
  const storePredictions = await loadFromGitHub('data/store-predictions.json');
  const statsHistory = await loadFromGitHub('data/stats_history.json');
  const mlResults = await loadFromGitHub('data/ml-results-tracking.json');
  
  console.log(`   store-predictions: ${storePredictions?.predictions?.length || 0} prédictions`);
  console.log(`   stats_history: ${statsHistory?.dailyStats?.length || 0} jours de stats`);
  console.log(`   ml-results: ${mlResults?.picks?.length || 0} picks ML`);
  
  // 2. Extraire les résultats depuis stats_history
  console.log('\n📊 Extraction des résultats depuis stats_history...');
  
  const completedFromStats: Map<string, any> = new Map();
  
  if (statsHistory?.dailyStats) {
    for (const day of statsHistory.dailyStats) {
      if (day.predictions) {
        for (const pred of day.predictions) {
          if (pred.matchId && pred.result) {
            completedFromStats.set(pred.matchId, {
              matchId: pred.matchId,
              homeTeam: pred.homeTeam,
              awayTeam: pred.awayTeam,
              actualResult: pred.result,
              predictedResult: pred.prediction,
              resultMatch: pred.correct,
              date: day.date
            });
          }
        }
      }
    }
  }
  
  console.log(`   ${completedFromStats.size} résultats extraits`);
  
  // 3. Construire les prédictions complétées
  const allPredictions: any[] = [];
  const now = new Date().toISOString();
  
  // Ajouter les prédictions existantes
  if (storePredictions?.predictions) {
    for (const pred of storePredictions.predictions) {
      const completed = completedFromStats.get(pred.matchId);
      if (completed) {
        // Mettre à jour avec les résultats
        allPredictions.push({
          ...pred,
          status: 'completed',
          actualResult: completed.actualResult,
          resultMatch: completed.resultMatch,
          checkedAt: completed.date
        });
        completedFromStats.delete(pred.matchId);
      } else {
        allPredictions.push(pred);
      }
    }
  }
  
  // Ajouter les prédictions de stats_history non présentes dans store
  for (const [matchId, pred] of completedFromStats) {
    allPredictions.push({
      matchId: pred.matchId,
      homeTeam: pred.homeTeam,
      awayTeam: pred.awayTeam,
      sport: 'Foot',
      league: 'Unknown',
      matchDate: pred.date,
      oddsHome: 1.0,
      oddsDraw: null,
      oddsAway: 1.0,
      predictedResult: pred.predictedResult,
      confidence: 'medium',
      riskPercentage: 50,
      status: 'completed',
      actualResult: pred.actualResult,
      resultMatch: pred.resultMatch,
      createdAt: pred.date,
      checkedAt: pred.date
    });
  }
  
  // 4. Calculer les statistiques
  console.log('\n📈 Calcul des statistiques...');
  
  const completed = allPredictions.filter(p => p.status === 'completed');
  const pending = allPredictions.filter(p => p.status === 'pending');
  const wins = completed.filter(p => p.resultMatch === true);
  const losses = completed.filter(p => p.resultMatch === false);
  
  const bySport: any = {
    football: { total: 0, wins: 0, losses: 0, winRate: 0, details: { resultats: { total: 0, wins: 0, winRate: 0 }, buts: { total: 0, wins: 0, winRate: 0 }, btts: { total: 0, wins: 0, winRate: 0 } } },
    basketball: { total: 0, wins: 0, losses: 0, winRate: 0, details: { resultats: { total: 0, wins: 0, winRate: 0 }, buts: { total: 0, wins: 0, winRate: 0 }, btts: { total: 0, wins: 0, winRate: 0 } } },
    hockey: { total: 0, wins: 0, losses: 0, winRate: 0, details: { resultats: { total: 0, wins: 0, winRate: 0 }, buts: { total: 0, wins: 0, winRate: 0 }, btts: { total: 0, wins: 0, winRate: 0 } } }
  };
  
  for (const p of completed) {
    const sport = (p.sport || '').toLowerCase();
    let key: 'football' | 'basketball' | 'hockey' = 'football';
    if (sport.includes('basket') || sport.includes('nba')) key = 'basketball';
    else if (sport.includes('hockey') || sport.includes('nhl')) key = 'hockey';
    
    bySport[key].total++;
    bySport[key].details.resultats.total++;
    if (p.resultMatch === true) {
      bySport[key].wins++;
      bySport[key].details.resultats.wins++;
    } else {
      bySport[key].losses++;
    }
  }
  
  // Calculer winRates
  for (const sport of ['football', 'basketball', 'hockey'] as const) {
    if (bySport[sport].total > 0) {
      bySport[sport].winRate = Math.round((bySport[sport].wins / bySport[sport].total) * 100);
      bySport[sport].details.resultats.winRate = bySport[sport].winRate;
    }
  }
  
  const winRate = completed.length > 0 ? Math.round((wins.length / completed.length) * 100) : 0;
  
  console.log(`   Complétées: ${completed.length}`);
  console.log(`   En attente: ${pending.length}`);
  console.log(`   Gagnées: ${wins.length}`);
  console.log(`   Perdues: ${losses.length}`);
  console.log(`   Taux global: ${winRate}%`);
  console.log(`   Football: ${bySport.football.wins}/${bySport.football.total} = ${bySport.football.winRate}%`);
  console.log(`   Basketball: ${bySport.basketball.wins}/${bySport.basketball.total} = ${bySport.basketball.winRate}%`);
  
  // 5. Créer les nouvelles données
  const newStorePredictions = {
    predictions: allPredictions,
    lastUpdate: now,
    version: '3.0'
  };
  
  const newStatsHistory = {
    lastUpdate: now,
    version: '2.0',
    dailyStats: statsHistory?.dailyStats || [],
    summary: {
      total: completed.length,
      wins: wins.length,
      losses: losses.length,
      winRate,
      bySport
    }
  };
  
  // Mettre à jour les ML results
  const newMLResults = {
    picks: mlResults?.picks || [],
    dailyStats: mlResults?.dailyStats || [],
    weeklyRatio: winRate,
    last7Days: {
      total: completed.length,
      won: wins.length,
      ratio: winRate
    },
    lastUpdated: now,
    expertMLVisible: winRate >= 70 && completed.length >= 10
  };
  
  // 6. Sauvegarder
  console.log('\n💾 Sauvegarde des données...');
  
  console.log('\n--- store-predictions.json ---');
  await saveToGitHub(
    'data/store-predictions.json',
    newStorePredictions,
    `🔧 Sync predictions: ${completed.length} complétées, ${pending.length} en attente`
  );
  
  console.log('\n--- stats_history.json ---');
  await saveToGitHub(
    'data/stats_history.json',
    newStatsHistory,
    `📊 Sync stats: ${wins.length}/${completed.length} = ${winRate}%`
  );
  
  console.log('\n--- ml-results-tracking.json ---');
  await saveToGitHub(
    'data/ml-results-tracking.json',
    newMLResults,
    `🧠 Sync ML: ${winRate}% win rate`
  );
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ SYNCHRONISATION TERMINÉE\n');
  
  console.log('📋 RÉSUMÉ FINAL:');
  console.log(`   Total prédictions: ${allPredictions.length}`);
  console.log(`   Complétées: ${completed.length}`);
  console.log(`   En attente: ${pending.length}`);
  console.log(`   Gagnées: ${wins.length}`);
  console.log(`   Perdues: ${losses.length}`);
  console.log(`   Taux de réussite: ${winRate}%`);
}

main().catch(console.error);
