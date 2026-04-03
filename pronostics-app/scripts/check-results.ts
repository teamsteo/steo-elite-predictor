/**
 * Script de Vérification des Résultats - VERSION COMPLÈTE
 * 
 * Vérifie tous les pronostics en attente avec les résultats réels ESPN
 * Sports: Football (toutes ligues), NBA, NHL
 * 
 * Exécution: bun run scripts/check-results.ts
 * Cron: Tous les jours à 5h UTC (7h Paris)
 */

import * as fs from 'fs';
import * as path from 'path';

// Configuration
const PREDICTIONS_FILE = path.join(process.cwd(), 'data/predictions.json');
const STATS_FILE = path.join(process.cwd(), 'data/stats_history.json');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = 'steohidy/my-project';

// Interfaces
interface Prediction {
  id: string;
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
  predictedGoals?: string | null;
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

// Normaliser le nom d'équipe
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Vérifier si le match peut être vérifié (passé de plus de 3h)
function canCheckResult(matchDate: string): boolean {
  const matchTime = new Date(matchDate).getTime();
  const now = Date.now();
  const threeHours = 3 * 60 * 60 * 1000;
  return now > matchTime + threeHours;
}

// ==================== FETCH RESULTS ====================

// Football - Toutes les ligues
async function fetchFootballResults(): Promise<Map<string, { homeScore: number; awayScore: number }>> {
  const results = new Map<string, { homeScore: number; awayScore: number }>();
  
  const leagues = [
    { code: 'eng.1', name: 'Premier League' },
    { code: 'esp.1', name: 'La Liga' },
    { code: 'ger.1', name: 'Bundesliga' },
    { code: 'ita.1', name: 'Serie A' },
    { code: 'fra.1', name: 'Ligue 1' },
    { code: 'uefa.champions', name: 'Champions League' },
    { code: 'uefa.europa', name: 'Europa League' },
    { code: 'uefa.europa.conf', name: 'Conference League' },
  ];
  
  console.log('⚽ Récupération résultats Football...');
  
  for (let i = 0; i < 3; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
    
    for (const league of leagues) {
      try {
        const response = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.code}/scoreboard?dates=${dateStr}`
        );
        
        if (!response.ok) continue;
        
        const data = await response.json();
        const events = data.events || [];
        
        for (const event of events) {
          if (!event.status?.type?.completed) continue;
          
          const homeComp = event.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'home');
          const awayComp = event.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'away');
          
          if (!homeComp || !awayComp) continue;
          
          const homeTeam = homeComp.team?.displayName || '';
          const awayTeam = awayComp.team?.displayName || '';
          const homeScore = parseInt(homeComp.score || '0');
          const awayScore = parseInt(awayComp.score || '0');
          
          const key = `${normalizeTeamName(homeTeam)}_${normalizeTeamName(awayTeam)}`;
          results.set(key, { homeScore, awayScore });
        }
      } catch (e) {
        // Continue
      }
    }
  }
  
  console.log(`   ✅ ${results.size} résultats Football`);
  return results;
}

// NBA
async function fetchNBAResults(): Promise<Map<string, { homeScore: number; awayScore: number }>> {
  const results = new Map<string, { homeScore: number; awayScore: number }>();
  
  console.log('🏀 Récupération résultats NBA...');
  
  for (let i = 0; i < 3; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
    
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`
      );
      
      if (!response.ok) continue;
      
      const data = await response.json();
      const events = data.events || [];
      
      for (const event of events) {
        if (!event.status?.type?.completed) continue;
        
        const homeComp = event.competitions[0]?.competitors?.find((c: any) => c.homeAway === 'home');
        const awayComp = event.competitions[0]?.competitors?.find((c: any) => c.homeAway === 'away');
        
        if (!homeComp || !awayComp) continue;
        
        const homeTeam = homeComp.team?.displayName || '';
        const awayTeam = awayComp.team?.displayName || '';
        const homeScore = parseInt(homeComp.score || '0');
        const awayScore = parseInt(awayComp.score || '0');
        
        const key = `${normalizeTeamName(homeTeam)}_${normalizeTeamName(awayTeam)}`;
        results.set(key, { homeScore, awayScore });
      }
    } catch (e) {
      // Continue
    }
  }
  
  console.log(`   ✅ ${results.size} résultats NBA`);
  return results;
}

// NHL
async function fetchNHLResults(): Promise<Map<string, { homeScore: number; awayScore: number }>> {
  const results = new Map<string, { homeScore: number; awayScore: number }>();
  
  console.log('🏒 Récupération résultats NHL...');
  
  for (let i = 0; i < 3; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
    
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${dateStr}`
      );
      
      if (!response.ok) continue;
      
      const data = await response.json();
      const events = data.events || [];
      
      for (const event of events) {
        if (!event.status?.type?.completed) continue;
        
        const homeComp = event.competitions[0]?.competitors?.find((c: any) => c.homeAway === 'home');
        const awayComp = event.competitions[0]?.competitors?.find((c: any) => c.homeAway === 'away');
        
        if (!homeComp || !awayComp) continue;
        
        const homeTeam = homeComp.team?.displayName || '';
        const awayTeam = awayComp.team?.displayName || '';
        const homeScore = parseInt(homeComp.score || '0');
        const awayScore = parseInt(awayComp.score || '0');
        
        const key = `${normalizeTeamName(homeTeam)}_${normalizeTeamName(awayTeam)}`;
        results.set(key, { homeScore, awayScore });
      }
    } catch (e) {
      // Continue
    }
  }
  
  console.log(`   ✅ ${results.size} résultats NHL`);
  return results;
}

// Trouver un résultat correspondant
function findMatchingResult(
  prediction: Prediction,
  allResults: Map<string, { homeScore: number; awayScore: number }>
): { homeScore: number; awayScore: number } | null {
  
  for (const [key, value] of allResults.entries()) {
    const [resultHome, resultAway] = key.split('_');
    const predHome = normalizeTeamName(prediction.homeTeam);
    const predAway = normalizeTeamName(prediction.awayTeam);
    
    // Match direct
    if ((predHome === resultHome && predAway === resultAway) ||
        (predHome.includes(resultHome) && predAway.includes(resultAway)) ||
        (resultHome.includes(predHome) && resultAway.includes(predAway))) {
      return value;
    }
    
    // Match inversé
    if ((predHome === resultAway && predAway === resultHome) ||
        (predHome.includes(resultAway) && predAway.includes(resultHome))) {
      return { homeScore: value.awayScore, awayScore: value.homeScore };
    }
  }
  
  return null;
}

// Sauvegarder sur GitHub
async function saveToGitHub(content: string, path: string, message: string): Promise<boolean> {
  if (!GITHUB_TOKEN) {
    console.log('⚠️ GITHUB_TOKEN non configuré');
    return false;
  }
  
  try {
    // Get SHA
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
    
    // Save
    const base64Content = Buffer.from(content).toString('base64');
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
          content: base64Content,
          sha: sha || undefined,
          branch: 'master'
        })
      }
    );
    
    return saveRes.ok;
  } catch (e) {
    console.error('Erreur GitHub:', e);
    return false;
  }
}

// Mettre à jour les stats
function updateStats(predictions: Prediction[]): void {
  const today = new Date().toISOString().split('T')[0];
  
  const completed = predictions.filter(p => p.status === 'completed' && p.checkedAt);
  const todayPredictions = completed.filter(p => p.checkedAt?.startsWith(today));
  
  if (todayPredictions.length === 0) return;
  
  const correctResults = todayPredictions.filter(p => p.resultMatch).length;
  const correctGoals = todayPredictions.filter(p => p.goalsMatch).length;
  
  // Créer les stats du jour
  const dailyStat = {
    date: today,
    stats: {
      results: { total: todayPredictions.length, correct: correctResults, rate: Math.round(correctResults / todayPredictions.length * 100) },
      goals: { total: todayPredictions.filter(p => p.predictedGoals).length, correct: correctGoals, rate: todayPredictions.filter(p => p.predictedGoals).length > 0 ? Math.round(correctGoals / todayPredictions.filter(p => p.predictedGoals).length * 100) : 0 },
      overall: Math.round((correctResults + correctGoals) / (todayPredictions.length + todayPredictions.filter(p => p.predictedGoals).length) * 100) || 0,
      completed: todayPredictions.length,
      wins: correctResults,
      losses: todayPredictions.length - correctResults,
      winRate: Math.round(correctResults / todayPredictions.length * 100)
    },
    predictions: todayPredictions.map(p => ({
      matchId: p.matchId,
      homeTeam: p.homeTeam,
      awayTeam: p.awayTeam,
      result: p.actualResult,
      prediction: p.predictedResult,
      correct: p.resultMatch,
      goalsPrediction: p.predictedGoals,
      goalsCorrect: p.goalsMatch
    }))
  };
  
  // Charger les stats existantes
  let statsData: any = { dailyStats: [], version: '1.0' };
  if (fs.existsSync(STATS_FILE)) {
    statsData = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
  }
  
  // Vérifier si la date existe déjà
  const existingIndex = statsData.dailyStats.findIndex((s: any) => s.date === today);
  if (existingIndex >= 0) {
    statsData.dailyStats[existingIndex] = dailyStat;
  } else {
    statsData.dailyStats.push(dailyStat);
  }
  
  // Trier par date
  statsData.dailyStats.sort((a: any, b: any) => b.date.localeCompare(a.date));
  
  // Garder 30 jours
  statsData.dailyStats = statsData.dailyStats.slice(0, 30);
  
  // Sauvegarder
  fs.writeFileSync(STATS_FILE, JSON.stringify(statsData, null, 2));
  console.log(`📊 Stats mises à jour: ${correctResults}/${todayPredictions.length} (${Math.round(correctResults / todayPredictions.length * 100)}%)`);
}

// ==================== MAIN ====================
async function main() {
  console.log('🔍 ==========================================');
  console.log('🔍 VÉRIFICATION DES RÉSULTATS - TOUS SPORTS');
  console.log(`🔍 ${new Date().toLocaleString('fr-FR')}`);
  console.log('🔍 ==========================================\n');
  
  if (!fs.existsSync(PREDICTIONS_FILE)) {
    console.log('❌ Fichier prédictions non trouvé');
    return;
  }
  
  const store = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf-8'));
  console.log(`📊 ${store.predictions.length} prédictions chargées`);
  
  // Filtrer les prédictions à vérifier
  const toCheck = store.predictions.filter((p: Prediction) => 
    p.status === 'pending' && canCheckResult(p.matchDate)
  );
  
  console.log(`⏳ ${toCheck.length} prédictions à vérifier\n`);
  
  if (toCheck.length === 0) {
    console.log('✅ Aucune prédiction à vérifier');
    return;
  }
  
  // Récupérer TOUS les résultats
  const [footballResults, nbaResults, nhlResults] = await Promise.all([
    fetchFootballResults(),
    fetchNBAResults(),
    fetchNHLResults()
  ]);
  
  // Combiner tous les résultats
  const allResults = new Map([
    ...footballResults,
    ...nbaResults,
    ...nhlResults
  ]);
  
  console.log(`\n📡 Total: ${allResults.size} résultats disponibles\n`);
  
  // Vérifier chaque prédiction
  let checked = 0;
  let correct = 0;
  
  for (const prediction of toCheck) {
    const result = findMatchingResult(prediction, allResults);
    
    if (result) {
      const actualResult = result.homeScore > result.awayScore ? 'home'
        : result.homeScore < result.awayScore ? 'away' : 'draw';
      
      prediction.homeScore = result.homeScore;
      prediction.awayScore = result.awayScore;
      prediction.totalGoals = result.homeScore + result.awayScore;
      prediction.actualResult = actualResult;
      prediction.status = 'completed';
      prediction.checkedAt = new Date().toISOString();
      prediction.resultMatch = prediction.predictedResult === actualResult;
      
      if (prediction.resultMatch) correct++;
      checked++;
      
      const icon = prediction.resultMatch ? '✅' : '❌';
      const sportIcon = prediction.sport === 'Foot' ? '⚽' : prediction.sport === 'Basket' ? '🏀' : '🏒';
      console.log(`${icon} ${sportIcon} ${prediction.homeTeam} ${result.homeScore}-${result.awayScore} ${prediction.awayTeam}`);
    }
  }
  
  console.log(`\n📊 Résumé:`);
  console.log(`   Vérifiés: ${checked}/${toCheck.length}`);
  console.log(`   Corrects: ${correct}/${checked} (${checked > 0 ? Math.round(correct/checked*100) : 0}%)`);
  
  // Mettre à jour le store
  store.lastUpdate = new Date().toISOString();
  fs.writeFileSync(PREDICTIONS_FILE, JSON.stringify(store, null, 2));
  
  // Mettre à jour les stats
  updateStats(store.predictions);
  
  // Sauvegarder sur GitHub
  if (GITHUB_TOKEN) {
    console.log('\n📤 Sauvegarde sur GitHub...');
    await saveToGitHub(
      JSON.stringify(store, null, 2),
      'data/predictions.json',
      `📊 Vérification résultats: ${correct}/${checked} corrects`
    );
    
    // Sauvegarder aussi les stats
    const statsContent = fs.readFileSync(STATS_FILE, 'utf-8');
    await saveToGitHub(
      statsContent,
      'data/stats_history.json',
      `📈 Stats mises à jour ${new Date().toLocaleDateString('fr-FR')}`
    );
  }
  
  console.log('\n🎉 Vérification terminée!');
}

main().catch(console.error);
