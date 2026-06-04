#!/usr/bin/env bun
/**
 * Vérification complète des résultats - Football & Basketball
 * Récupère les résultats réels depuis ESPN et met à jour les prédictions
 */

import * as fs from 'fs';
import * as path from 'path';

const PREDICTIONS_FILE = path.join(process.cwd(), 'data/predictions.json');
const STORE_FILE = path.join(process.cwd(), 'data/store-predictions.json');

interface Prediction {
  id: string;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  matchDate: string;
  predictedResult: string;
  predictedGoals?: string;
  status: 'pending' | 'completed';
  homeScore?: number;
  awayScore?: number;
  actualResult?: string;
  resultMatch?: boolean;
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

// Match fuzzy des noms d'équipes
function teamNamesMatch(predName: string, resultName: string): boolean {
  const predNorm = normalizeTeamName(predName);
  const resNorm = normalizeTeamName(resultName);
  
  if (predNorm === resNorm) return true;
  if (predNorm.includes(resNorm) || resNorm.includes(predNorm)) return true;
  
  // Match par mots clés
  const predWords = predNorm.split(/(?=[A-Z])/);
  for (const word of predWords) {
    if (word.length >= 4 && resNorm.includes(word)) return true;
  }
  
  return false;
}

// Vérifier si le match est terminé (3h après le début)
function canCheckResult(matchDate: string): boolean {
  const matchTime = new Date(matchDate).getTime();
  const now = Date.now();
  const threeHours = 3 * 60 * 60 * 1000;
  return now > matchTime + threeHours;
}

// Récupérer les résultats Football depuis ESPN
async function fetchFootballResults(): Promise<Map<string, { homeScore: number; awayScore: number; status: string }>> {
  const results = new Map<string, { homeScore: number; awayScore: number; status: string }>();
  
  const today = new Date();
  const dateStr = today.toISOString().split('-').join('').slice(0, 8);
  
  const leagues = [
    { code: 'eng.1', name: 'Premier League' },
    { code: 'esp.1', name: 'La Liga' },
    { code: 'ger.1', name: 'Bundesliga' },
    { code: 'ita.1', name: 'Serie A' },
    { code: 'fra.1', name: 'Ligue 1' },
    { code: 'uefa.champions', name: 'Ligue des Champions' },
  ];
  
  for (const league of leagues) {
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.code}/scoreboard?dates=${dateStr}`
      );
      const data = await response.json();
      
      if (data?.events) {
        for (const event of data.events) {
          const home = event.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'home');
          const away = event.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'away');
          const statusType = event.status?.type;
          
          if (home && away && statusType?.completed) {
            const homeTeam = home.team?.displayName || '';
            const awayTeam = away.team?.displayName || '';
            const key = `${normalizeTeamName(homeTeam)}_${normalizeTeamName(awayTeam)}`;
            
            results.set(key, {
              homeScore: parseInt(home.score) || 0,
              awayScore: parseInt(away.score) || 0,
              status: 'completed'
            });
            
            console.log(`✅ Football: ${homeTeam} ${home.score} - ${away.score} ${awayTeam}`);
          }
        }
      }
    } catch (error) {
      console.log(`⚠️ Erreur ${league.name}:`, error);
    }
  }
  
  return results;
}

// Récupérer les résultats NBA depuis ESPN
async function fetchNBAResults(): Promise<Map<string, { homeScore: number; awayScore: number; status: string }>> {
  const results = new Map<string, { homeScore: number; awayScore: number; status: string }>();
  
  const today = new Date();
  const dateStr = today.toISOString().split('-').join('').slice(0, 8);
  
  try {
    const response = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`
    );
    const data = await response.json();
    
    if (data?.events) {
      for (const event of data.events) {
        const home = event.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'home');
        const away = event.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'away');
        const statusType = event.status?.type;
        
        if (home && away && (statusType?.completed || statusType?.state === 'post')) {
          const homeTeam = home.team?.displayName || '';
          const awayTeam = away.team?.displayName || '';
          const key = `${normalizeTeamName(homeTeam)}_${normalizeTeamName(awayTeam)}`;
          
          results.set(key, {
            homeScore: parseInt(home.score) || 0,
            awayScore: parseInt(away.score) || 0,
            status: 'completed'
          });
          
          console.log(`✅ NBA: ${homeTeam} ${home.score} - ${away.score} ${awayTeam}`);
        }
      }
    }
  } catch (error) {
    console.log('⚠️ Erreur NBA:', error);
  }
  
  return results;
}

// Déterminer le résultat du match
function getActualResult(homeScore: number, awayScore: number, hasDraw: boolean): string {
  if (homeScore > awayScore) return 'home';
  if (awayScore > homeScore) return 'away';
  return hasDraw ? 'draw' : 'home'; // NBA n'a pas de nul
}

// Vérifier la prédiction de buts
function checkGoalsPrediction(predictedGoals: string | undefined, totalGoals: number): boolean {
  if (!predictedGoals) return false;
  
  if (predictedGoals.includes('Over 1.5')) return totalGoals > 1.5;
  if (predictedGoals.includes('Under 1.5')) return totalGoals < 1.5;
  if (predictedGoals.includes('Over 2.5')) return totalGoals > 2.5;
  if (predictedGoals.includes('Under 2.5')) return totalGoals < 2.5;
  if (predictedGoals.includes('Over 3.5')) return totalGoals > 3.5;
  if (predictedGoals.includes('Under 3.5')) return totalGoals < 3.5;
  if (predictedGoals.toLowerCase().includes('btts') || predictedGoals.includes('Les deux marquent')) {
    // BTTS - Both Teams To Score
    return true; // Simplifié
  }
  
  return false;
}

// Charger les prédictions
function loadPredictions(): Prediction[] {
  if (fs.existsSync(STORE_FILE)) {
    const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
    return data.predictions || [];
  }
  if (fs.existsSync(PREDICTIONS_FILE)) {
    const data = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf-8'));
    return data.predictions || [];
  }
  return [];
}

// Sauvegarder les prédictions
function savePredictions(predictions: Prediction[]) {
  const data = {
    predictions,
    lastUpdate: new Date().toISOString(),
    version: '2.0'
  };
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
}

// Générer le résumé des stats
function generateStatsSummary(predictions: Prediction[]): string {
  const completed = predictions.filter(p => p.status === 'completed');
  const football = completed.filter(p => p.sport === 'Foot');
  const basketball = completed.filter(p => p.sport === 'Basket');
  
  const footballWins = football.filter(p => p.resultMatch).length;
  const basketballWins = basketball.filter(p => p.resultMatch).length;
  
  let summary = `
## 📊 Statistiques des Prédictions

### 📅 Période: 7 mars - ${new Date().toLocaleDateString('fr-FR')}

### ⚽ Football
- **Total vérifié:** ${football.length}
- **Prédictions correctes:** ${footballWins}
- **Taux de réussite:** ${football.length > 0 ? ((footballWins / football.length) * 100).toFixed(1) : 0}%

### 🏀 Basketball (NBA)
- **Total vérifié:** ${basketball.length}
- **Prédictions correctes:** ${basketballWins}
- **Taux de réussite:** ${basketball.length > 0 ? ((basketballWins / basketball.length) * 100).toFixed(1) : 0}%

### 📈 Global
- **Total vérifié:** ${completed.length}
- **Prédictions correctes:** ${footballWins + basketballWins}
- **Taux global:** ${completed.length > 0 ? (((footballWins + basketballWins) / completed.length) * 100).toFixed(1) : 0}%
`;
  
  return summary;
}

// Main
async function main() {
  console.log('🔍 Vérification des résultats...\n');
  
  const predictions = loadPredictions();
  console.log(`📋 ${predictions.length} prédictions chargées\n`);
  
  // Récupérer les résultats
  console.log('📡 Récupération des résultats Football...');
  const footballResults = await fetchFootballResults();
  console.log(`   → ${footballResults.size} résultats trouvés\n`);
  
  console.log('📡 Récupération des résultats NBA...');
  const nbaResults = await fetchNBAResults();
  console.log(`   → ${nbaResults.size} résultats trouvés\n`);
  
  let updated = 0;
  let correct = 0;
  
  // Mettre à jour les prédictions
  for (const pred of predictions) {
    if (pred.status === 'completed') continue;
    if (!canCheckResult(pred.matchDate)) continue;
    
    const homeNorm = normalizeTeamName(pred.homeTeam);
    const awayNorm = normalizeTeamName(pred.awayTeam);
    const key = `${homeNorm}_${awayNorm}`;
    
    let result = pred.sport === 'Foot' ? footballResults.get(key) : nbaResults.get(key);
    
    // Essayer aussi avec fuzzy matching
    if (!result) {
      for (const [resultKey, resultData] of (pred.sport === 'Foot' ? footballResults : nbaResults).entries()) {
        const [resHome, resAway] = resultKey.split('_');
        if (teamNamesMatch(pred.homeTeam, resHome) && teamNamesMatch(pred.awayTeam, resAway)) {
          result = resultData;
          break;
        }
      }
    }
    
    if (result) {
      pred.homeScore = result.homeScore;
      pred.awayScore = result.awayScore;
      pred.status = 'completed';
      pred.actualResult = getActualResult(result.homeScore, result.awayScore, pred.sport === 'Foot');
      pred.resultMatch = pred.predictedResult === pred.actualResult;
      
      updated++;
      if (pred.resultMatch) correct++;
      
      console.log(`📝 ${pred.homeTeam} ${result.homeScore} - ${result.awayScore} ${pred.awayTeam}`);
      console.log(`   Prédit: ${pred.predictedResult} | Réel: ${pred.actualResult} | ${pred.resultMatch ? '✅' : '❌'}`);
    }
  }
  
  // Sauvegarder
  savePredictions(predictions);
  
  console.log(`\n✅ ${updated} prédictions mises à jour`);
  console.log(`🎯 ${correct}/${updated} prédictions correctes (${((correct/updated)*100).toFixed(1)}%)\n`);
  
  // Afficher le résumé
  console.log(generateStatsSummary(predictions));
}

main().catch(console.error);
