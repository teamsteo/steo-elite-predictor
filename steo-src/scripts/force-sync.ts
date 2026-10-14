/**
 * Script de synchronisation forcée
 * Corrige les prédictions en attente et synchronise les stats
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = 'steohidy/my-project';
const GITHUB_BRANCH = 'master';

interface Prediction {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport: string;
  matchDate: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  predictedResult: string;
  predictedGoals?: string;
  confidence: string;
  riskPercentage: number;
  homeScore?: number;
  awayScore?: number;
  totalGoals?: number;
  actualResult?: string;
  status: 'pending' | 'completed';
  resultMatch?: boolean;
  goalsMatch?: boolean;
  createdAt: string;
  checkedAt?: string;
}

interface StatsHistory {
  lastUpdate: string;
  version: string;
  dailyStats: any[];
  summary: any;
}

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
    console.log(`⚠️ Pas de GITHUB_TOKEN - simulation uniquement`);
    return false;
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

// Vérifier le résultat d'un match via ESPN
async function checkMatchResult(
  homeTeam: string, 
  awayTeam: string, 
  sport: string,
  matchDate: string
): Promise<{ homeScore: number; awayScore: number; found: boolean } | null> {
  const date = new Date(matchDate);
  const dateStr = date.toISOString().split('-').join('').substring(0, 8);
  
  try {
    if (sport.toLowerCase().includes('foot') || sport.toLowerCase() === 'soccer') {
      // Essayer plusieurs ligues
      const leagues = ['eng.1', 'esp.1', 'ger.1', 'ita.1', 'fra.1', 'uefa.champions', 'uefa.europa'];
      
      for (const league of leagues) {
        try {
          const res = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${dateStr}`
          );
          
          if (!res.ok) continue;
          
          const data = await res.json();
          const events = data.events || [];
          
          for (const event of events) {
            if (event.status?.type?.completed !== true) continue;
            
            const competition = event.competitions?.[0];
            const home = competition?.competitors?.find((c: any) => c.homeAway === 'home');
            const away = competition?.competitors?.find((c: any) => c.homeAway === 'away');
            
            const homeName = (home?.team?.displayName || '').toLowerCase();
            const awayName = (away?.team?.displayName || '').toLowerCase();
            
            // Correspondance flexible
            const homeMatch = homeName.includes(homeTeam.toLowerCase().slice(0, 4)) || 
                             homeTeam.toLowerCase().includes(homeName.slice(0, 4));
            const awayMatch = awayName.includes(awayTeam.toLowerCase().slice(0, 4)) || 
                             awayTeam.toLowerCase().includes(awayName.slice(0, 4));
            
            if (homeMatch && awayMatch) {
              return {
                homeScore: parseInt(home?.score || '0'),
                awayScore: parseInt(away?.score || '0'),
                found: true
              };
            }
          }
        } catch (e) {
          continue;
        }
      }
    } else if (sport.toLowerCase().includes('basket') || sport.toLowerCase() === 'nba') {
      const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard');
      
      if (res.ok) {
        const data = await res.json();
        const events = data.events || [];
        
        for (const event of events) {
          if (event.status?.type?.completed !== true) continue;
          
          const eventDate = new Date(event.date).toISOString().split('T')[0];
          const predDate = date.toISOString().split('T')[0];
          if (eventDate !== predDate) continue;
          
          const competition = event.competitions?.[0];
          const home = competition?.competitors?.find((c: any) => c.homeAway === 'home');
          const away = competition?.competitors?.find((c: any) => c.homeAway === 'away');
          
          const homeName = (home?.team?.displayName || '').toLowerCase();
          const awayName = (away?.team?.displayName || '').toLowerCase();
          
          const homeMatch = homeName.includes(homeTeam.toLowerCase().slice(0, 4)) || 
                           homeTeam.toLowerCase().includes(homeName.slice(0, 4));
          const awayMatch = awayName.includes(awayTeam.toLowerCase().slice(0, 4)) || 
                           awayTeam.toLowerCase().includes(awayName.slice(0, 4));
          
          if (homeMatch && awayMatch) {
            return {
              homeScore: parseInt(home?.score || '0'),
              awayScore: parseInt(away?.score || '0'),
              found: true
            };
          }
        }
      }
    }
  } catch (e) {
    console.error('Erreur vérification:', e);
  }
  
  return null;
}

// Fonction principale
async function main() {
  console.log('🔄 Début de la synchronisation forcée...\n');
  
  // 1. Charger les prédictions
  console.log('📥 Chargement des prédictions...');
  const store = await loadFromGitHub('data/store-predictions.json');
  if (!store || !store.predictions) {
    console.error('❌ Impossible de charger les prédictions');
    return;
  }
  
  const predictions: Prediction[] = store.predictions;
  const pending = predictions.filter(p => p.status === 'pending');
  const completed = predictions.filter(p => p.status === 'completed');
  
  console.log(`   Total: ${predictions.length} prédictions`);
  console.log(`   En attente: ${pending.length}`);
  console.log(`   Complétées: ${completed.length}\n`);
  
  // 2. Vérifier les prédictions en attente (matchs passés)
  const now = new Date();
  let updated = 0;
  let won = 0;
  let lost = 0;
  
  console.log('🔍 Vérification des matchs passés...');
  
  for (const pred of pending) {
    const matchDate = new Date(pred.matchDate);
    
    // Ne vérifier que les matchs passés de plus de 3 heures
    const threeHoursAfter = new Date(matchDate.getTime() + 3 * 60 * 60 * 1000);
    if (now < threeHoursAfter) continue;
    
    console.log(`   📋 ${pred.homeTeam} vs ${pred.awayTeam} (${pred.sport})`);
    
    const result = await checkMatchResult(pred.homeTeam, pred.awayTeam, pred.sport, pred.matchDate);
    
    if (result && result.found) {
      const actualResult = result.homeScore > result.awayScore ? 'home' : 
                          result.homeScore < result.awayScore ? 'away' : 'draw';
      
      pred.homeScore = result.homeScore;
      pred.awayScore = result.awayScore;
      pred.totalGoals = result.homeScore + result.awayScore;
      pred.actualResult = actualResult;
      pred.resultMatch = pred.predictedResult === actualResult;
      pred.status = 'completed';
      pred.checkedAt = now.toISOString();
      
      if (pred.resultMatch) won++; else lost++;
      updated++;
      
      console.log(`      ✅ Score: ${result.homeScore}-${result.awayScore} - ${pred.resultMatch ? 'GAGNÉ' : 'PERDU'}`);
    } else {
      console.log(`      ⏳ Résultat non trouvé`);
    }
    
    // Petit délai pour ne pas surcharger l'API
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`\n📊 Résultats: ${updated} mis à jour, ${won} gagnés, ${lost} perdus\n`);
  
  // 3. Sauvegarder si des mises à jour
  if (updated > 0) {
    console.log('💾 Sauvegarde des prédictions...');
    store.lastUpdate = now.toISOString();
    
    const saved = await saveToGitHub(
      'data/store-predictions.json',
      store,
      `📊 MAJ predictions: ${updated} vérifiés, ${won} gagnés, ${lost} perdus`
    );
    
    if (saved) {
      console.log('   ✅ Prédictions sauvegardées\n');
    } else {
      console.log('   ⚠️ Erreur sauvegarde\n');
    }
  }
  
  // 4. Mettre à jour les stats
  console.log('📊 Calcul des statistiques...');
  const allCompleted = predictions.filter(p => p.status === 'completed');
  const allWins = allCompleted.filter(p => p.resultMatch === true);
  
  const statsHistory: StatsHistory = {
    lastUpdate: now.toISOString(),
    version: '2.0',
    dailyStats: [],
    summary: {
      total: allCompleted.length,
      wins: allWins.length,
      losses: allCompleted.length - allWins.length,
      winRate: allCompleted.length > 0 ? Math.round((allWins.length / allCompleted.length) * 100) : 0,
      bySport: {
        football: { total: 0, wins: 0, losses: 0, winRate: 0, details: {} },
        basketball: { total: 0, wins: 0, losses: 0, winRate: 0, details: {} },
        hockey: { total: 0, wins: 0, losses: 0, winRate: 0, details: {} }
      }
    }
  };
  
  // Calculer par sport
  for (const p of allCompleted) {
    const sport = p.sport.toLowerCase();
    let sportKey: 'football' | 'basketball' | 'hockey' = 'football';
    if (sport.includes('basket') || sport.includes('nba')) sportKey = 'basketball';
    else if (sport.includes('hockey') || sport.includes('nhl')) sportKey = 'hockey';
    
    statsHistory.summary.bySport[sportKey].total++;
    if (p.resultMatch === true) {
      statsHistory.summary.bySport[sportKey].wins++;
    } else {
      statsHistory.summary.bySport[sportKey].losses++;
    }
  }
  
  // Calculer winRate par sport
  for (const sport of ['football', 'basketball', 'hockey'] as const) {
    const s = statsHistory.summary.bySport[sport];
    if (s.total > 0) {
      s.winRate = Math.round((s.wins / s.total) * 100);
    }
  }
  
  console.log(`   Total complétés: ${allCompleted.length}`);
  console.log(`   Gagnés: ${allWins.length}`);
  console.log(`   Taux: ${statsHistory.summary.winRate}%`);
  
  console.log('\n💾 Sauvegarde des stats...');
  const statsSaved = await saveToGitHub(
    'data/stats_history.json',
    statsHistory,
    `📊 MAJ stats: ${allWins.length}/${allCompleted.length} = ${statsHistory.summary.winRate}%`
  );
  
  if (statsSaved) {
    console.log('   ✅ Stats sauvegardées\n');
  } else {
    console.log('   ⚠️ Erreur sauvegarde stats\n');
  }
  
  console.log('✅ Synchronisation terminée!');
  console.log('\n📈 Résumé:');
  console.log(`   - Prédictions vérifiées: ${updated}`);
  console.log(`   - Pronostics gagnés: ${won}`);
  console.log(`   - Pronostics perdus: ${lost}`);
  console.log(`   - Taux de réussite: ${allCompleted.length > 0 ? Math.round((allWins.length / allCompleted.length) * 100) : 0}%`);
}

main().catch(console.error);
