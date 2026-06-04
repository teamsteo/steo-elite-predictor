/**
 * Script de Mise à Jour des Statistiques DÉTAILLÉES
 * 
 * Nouveau système avec stats par type de pari:
 * 
 * FOOTBALL:
 * - results: 1N2 (Victoire Domicile/Nul/Victoire Extérieur)
 * - goals: Over/Under 2.5 buts
 * - btts: Les deux équipes marquent
 * - corners: Over/Under 8.5 corners
 * - cards: Over/Under 4.5 cartons
 * 
 * BASKETBALL:
 * - results: Vainqueur du match
 * - totalPoints: Over/Under ligne de points
 * - handicap: Vainqueur avec handicap
 * 
 * HOCKEY:
 * - results: Vainqueur (avec prolongations)
 * - goals: Over/Under 5.5 buts
 */

import * as fs from 'fs';
import * as path from 'path';

const PREDICTIONS_FILE = path.join(process.cwd(), 'data/predictions.json');
const STATS_FILE = path.join(process.cwd(), 'data/stats_history.json');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = 'steohidy/my-project';

interface Prediction {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  matchDate: string;
  predictedResult: string;
  predictedGoals?: string | null;
  predictedCorners?: string | null;
  predictedCards?: string | null;
  predictedBTTS?: boolean | null;
  predictedTotalPoints?: string | null;
  predictedHandicap?: string | null;
  status: 'pending' | 'completed';
  homeScore?: number;
  awayScore?: number;
  actualResult?: string;
  resultMatch?: boolean;
  goalsMatch?: boolean;
  cornersMatch?: boolean;
  cardsMatch?: boolean;
  bttsMatch?: boolean;
  totalPointsMatch?: boolean;
  handicapMatch?: boolean;
  totalCorners?: number;
  totalCards?: number;
  homePoints?: number;
  awayPoints?: number;
  checkedAt?: string;
}

// Normaliser le sport
function normalizeSport(sport: string): 'football' | 'basketball' | 'hockey' | 'other' {
  const s = sport.toLowerCase();
  if (s.includes('foot') || s.includes('soccer')) return 'football';
  if (s.includes('basket') || s.includes('nba')) return 'basketball';
  if (s.includes('hockey') || s.includes('nhl')) return 'hockey';
  return 'other';
}

// Calculer les stats détaillées pour le Football
function calculateFootballStats(predictions: Prediction[]) {
  const completed = predictions.filter(p => p.status === 'completed');
  
  // Résultats 1N2
  const resultsTotal = completed.length;
  const resultsCorrect = completed.filter(p => p.resultMatch === true).length;
  
  // Buts Over/Under
  const goalsPreds = completed.filter(p => p.predictedGoals);
  const goalsCorrect = goalsPreds.filter(p => p.goalsMatch === true).length;
  
  // BTTS (Les deux marquent)
  const bttsPreds = completed.filter(p => p.predictedBTTS !== undefined && p.predictedBTTS !== null);
  const bttsCorrect = bttsPreds.filter(p => p.bttsMatch === true).length;
  
  // Corners
  const cornersPreds = completed.filter(p => p.predictedCorners);
  const cornersCorrect = cornersPreds.filter(p => p.cornersMatch === true).length;
  
  // Cartons
  const cardsPreds = completed.filter(p => p.predictedCards);
  const cardsCorrect = cardsPreds.filter(p => p.cardsMatch === true).length;
  
  return {
    results: {
      total: resultsTotal,
      correct: resultsCorrect,
      rate: resultsTotal > 0 ? Math.round(resultsCorrect / resultsTotal * 100) : 0,
      label: 'Résultats 1N2'
    },
    goals: {
      total: goalsPreds.length,
      correct: goalsCorrect,
      rate: goalsPreds.length > 0 ? Math.round(goalsCorrect / goalsPreds.length * 100) : 0,
      label: 'Buts O/U 2.5'
    },
    btts: {
      total: bttsPreds.length,
      correct: bttsCorrect,
      rate: bttsPreds.length > 0 ? Math.round(bttsCorrect / bttsPreds.length * 100) : 0,
      label: 'Les deux marquent'
    },
    corners: {
      total: cornersPreds.length,
      correct: cornersCorrect,
      rate: cornersPreds.length > 0 ? Math.round(cornersCorrect / cornersPreds.length * 100) : 0,
      label: 'Corners O/U 8.5'
    },
    cards: {
      total: cardsPreds.length,
      correct: cardsCorrect,
      rate: cardsPreds.length > 0 ? Math.round(cardsCorrect / cardsPreds.length * 100) : 0,
      label: 'Cartons O/U 4.5'
    },
    overall: resultsTotal > 0 ? Math.round(resultsCorrect / resultsTotal * 100) : 0
  };
}

// Calculer les stats détaillées pour le Basketball
function calculateBasketballStats(predictions: Prediction[]) {
  const completed = predictions.filter(p => p.status === 'completed');
  
  // Vainqueur
  const resultsTotal = completed.length;
  const resultsCorrect = completed.filter(p => p.resultMatch === true).length;
  
  // Total Points Over/Under
  const totalPointsPreds = completed.filter(p => p.predictedTotalPoints);
  const totalPointsCorrect = totalPointsPreds.filter(p => p.totalPointsMatch === true).length;
  
  // Handicap
  const handicapPreds = completed.filter(p => p.predictedHandicap);
  const handicapCorrect = handicapPreds.filter(p => p.handicapMatch === true).length;
  
  return {
    results: {
      total: resultsTotal,
      correct: resultsCorrect,
      rate: resultsTotal > 0 ? Math.round(resultsCorrect / resultsTotal * 100) : 0,
      label: 'Vainqueur'
    },
    totalPoints: {
      total: totalPointsPreds.length,
      correct: totalPointsCorrect,
      rate: totalPointsPreds.length > 0 ? Math.round(totalPointsCorrect / totalPointsPreds.length * 100) : 0,
      label: 'Total Points O/U'
    },
    handicap: {
      total: handicapPreds.length,
      correct: handicapCorrect,
      rate: handicapPreds.length > 0 ? Math.round(handicapCorrect / handicapPreds.length * 100) : 0,
      label: 'Handicap'
    },
    overall: resultsTotal > 0 ? Math.round(resultsCorrect / resultsTotal * 100) : 0
  };
}

// Calculer les stats détaillées pour le Hockey
function calculateHockeyStats(predictions: Prediction[]) {
  const completed = predictions.filter(p => p.status === 'completed');
  
  // Vainqueur
  const resultsTotal = completed.length;
  const resultsCorrect = completed.filter(p => p.resultMatch === true).length;
  
  // Buts Over/Under
  const goalsPreds = completed.filter(p => p.predictedGoals);
  const goalsCorrect = goalsPreds.filter(p => p.goalsMatch === true).length;
  
  return {
    results: {
      total: resultsTotal,
      correct: resultsCorrect,
      rate: resultsTotal > 0 ? Math.round(resultsCorrect / resultsTotal * 100) : 0,
      label: 'Vainqueur'
    },
    goals: {
      total: goalsPreds.length,
      correct: goalsCorrect,
      rate: goalsPreds.length > 0 ? Math.round(goalsCorrect / goalsPreds.length * 100) : 0,
      label: 'Buts O/U 5.5'
    },
    overall: resultsTotal > 0 ? Math.round(resultsCorrect / resultsTotal * 100) : 0
  };
}

// Calculer les stats globales d'une journée
function calculateDayStats(predictions: Prediction[]) {
  const completed = predictions.filter(p => p.status === 'completed');
  
  // Séparer par sport
  const footballPreds = completed.filter(p => normalizeSport(p.sport) === 'football');
  const basketballPreds = completed.filter(p => normalizeSport(p.sport) === 'basketball');
  const hockeyPreds = completed.filter(p => normalizeSport(p.sport) === 'hockey');
  
  // Stats détaillées par sport
  const footballStats = calculateFootballStats(footballPreds);
  const basketballStats = calculateBasketballStats(basketballPreds);
  const hockeyStats = calculateHockeyStats(hockeyPreds);
  
  // Stats globales
  const totalWins = completed.filter(p => p.resultMatch === true).length;
  const totalLosses = completed.filter(p => p.resultMatch === false).length;
  
  return {
    stats: {
      completed: completed.length,
      wins: totalWins,
      losses: totalLosses,
      winRate: completed.length > 0 ? Math.round(totalWins / completed.length * 100) : 0,
      // Stats détaillées par sport
      bySport: {
        football: footballStats,
        basketball: basketballStats,
        hockey: hockeyStats
      },
      // Stats globales (tous sports confondus)
      results: {
        total: completed.length,
        correct: totalWins,
        rate: completed.length > 0 ? Math.round(totalWins / completed.length * 100) : 0
      },
      goals: {
        total: completed.filter(p => p.predictedGoals).length,
        correct: completed.filter(p => p.goalsMatch === true).length,
        rate: 0 // Calculé dynamiquement
      }
    },
    predictions: completed.map(p => ({
      matchId: p.matchId,
      homeTeam: p.homeTeam,
      awayTeam: p.awayTeam,
      sport: normalizeSport(p.sport),
      league: p.league,
      result: p.actualResult,
      prediction: p.predictedResult,
      correct: p.resultMatch,
      score: p.homeScore !== undefined ? `${p.homeScore}-${p.awayScore}` : undefined,
      goalsPrediction: p.predictedGoals,
      goalsCorrect: p.goalsMatch
    }))
  };
}

// Grouper par date
function groupByDate(predictions: Prediction[]): Map<string, Prediction[]> {
  const groups = new Map<string, Prediction[]>();
  
  for (const pred of predictions) {
    if (pred.status !== 'completed') continue;
    
    const date = pred.matchDate.split('T')[0];
    if (!groups.has(date)) {
      groups.set(date, []);
    }
    groups.get(date)!.push(pred);
  }
  
  return groups;
}

// Calculer le summary global
function calculateSummary(dailyStats: any[]) {
  // Aggréger les stats par sport
  const footballAgg = {
    results: { total: 0, correct: 0 },
    goals: { total: 0, correct: 0 },
    btts: { total: 0, correct: 0 },
    corners: { total: 0, correct: 0 },
    cards: { total: 0, correct: 0 }
  };
  
  const basketballAgg = {
    results: { total: 0, correct: 0 },
    totalPoints: { total: 0, correct: 0 },
    handicap: { total: 0, correct: 0 }
  };
  
  const hockeyAgg = {
    results: { total: 0, correct: 0 },
    goals: { total: 0, correct: 0 }
  };
  
  for (const day of dailyStats) {
    const bySport = day.stats.bySport;
    
    // Football
    if (bySport.football) {
      footballAgg.results.total += bySport.football.results?.total || 0;
      footballAgg.results.correct += bySport.football.results?.correct || 0;
      footballAgg.goals.total += bySport.football.goals?.total || 0;
      footballAgg.goals.correct += bySport.football.goals?.correct || 0;
      footballAgg.btts.total += bySport.football.btts?.total || 0;
      footballAgg.btts.correct += bySport.football.btts?.correct || 0;
      footballAgg.corners.total += bySport.football.corners?.total || 0;
      footballAgg.corners.correct += bySport.football.corners?.correct || 0;
      footballAgg.cards.total += bySport.football.cards?.total || 0;
      footballAgg.cards.correct += bySport.football.cards?.correct || 0;
    }
    
    // Basketball
    if (bySport.basketball) {
      basketballAgg.results.total += bySport.basketball.results?.total || 0;
      basketballAgg.results.correct += bySport.basketball.results?.correct || 0;
      basketballAgg.totalPoints.total += bySport.basketball.totalPoints?.total || 0;
      basketballAgg.totalPoints.correct += bySport.basketball.totalPoints?.correct || 0;
      basketballAgg.handicap.total += bySport.basketball.handicap?.total || 0;
      basketballAgg.handicap.correct += bySport.basketball.handicap?.correct || 0;
    }
    
    // Hockey
    if (bySport.hockey) {
      hockeyAgg.results.total += bySport.hockey.results?.total || 0;
      hockeyAgg.results.correct += bySport.hockey.results?.correct || 0;
      hockeyAgg.goals.total += bySport.hockey.goals?.total || 0;
      hockeyAgg.goals.correct += bySport.hockey.goals?.correct || 0;
    }
  }
  
  // Calculer les rates
  const calcRate = (correct: number, total: number) => total > 0 ? Math.round(correct / total * 100) : 0;
  
  return {
    totalDays: dailyStats.length,
    football: {
      results: {
        ...footballAgg.results,
        rate: calcRate(footballAgg.results.correct, footballAgg.results.total),
        label: 'Résultats 1N2'
      },
      goals: {
        ...footballAgg.goals,
        rate: calcRate(footballAgg.goals.correct, footballAgg.goals.total),
        label: 'Buts O/U 2.5'
      },
      btts: {
        ...footballAgg.btts,
        rate: calcRate(footballAgg.btts.correct, footballAgg.btts.total),
        label: 'Les deux marquent'
      },
      corners: {
        ...footballAgg.corners,
        rate: calcRate(footballAgg.corners.correct, footballAgg.corners.total),
        label: 'Corners O/U 8.5'
      },
      cards: {
        ...footballAgg.cards,
        rate: calcRate(footballAgg.cards.correct, footballAgg.cards.total),
        label: 'Cartons O/U 4.5'
      },
      overall: calcRate(footballAgg.results.correct, footballAgg.results.total)
    },
    basketball: {
      results: {
        ...basketballAgg.results,
        rate: calcRate(basketballAgg.results.correct, basketballAgg.results.total),
        label: 'Vainqueur'
      },
      totalPoints: {
        ...basketballAgg.totalPoints,
        rate: calcRate(basketballAgg.totalPoints.correct, basketballAgg.totalPoints.total),
        label: 'Total Points O/U'
      },
      handicap: {
        ...basketballAgg.handicap,
        rate: calcRate(basketballAgg.handicap.correct, basketballAgg.handicap.total),
        label: 'Handicap'
      },
      overall: calcRate(basketballAgg.results.correct, basketballAgg.results.total)
    },
    hockey: {
      results: {
        ...hockeyAgg.results,
        rate: calcRate(hockeyAgg.results.correct, hockeyAgg.results.total),
        label: 'Vainqueur'
      },
      goals: {
        ...hockeyAgg.goals,
        rate: calcRate(hockeyAgg.goals.correct, hockeyAgg.goals.total),
        label: 'Buts O/U 5.5'
      },
      overall: calcRate(hockeyAgg.results.correct, hockeyAgg.results.total)
    }
  };
}

async function main() {
  console.log('📊 ==========================================');
  console.log('📊 MISE À JOUR STATS DÉTAILLÉES V4.0');
  console.log(`📊 ${new Date().toLocaleString('fr-FR')}`);
  console.log('📊 ==========================================\n');
  
  if (!fs.existsSync(PREDICTIONS_FILE)) {
    console.log('❌ Fichier prédictions non trouvé');
    return;
  }
  
  const store = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf-8'));
  const predictions: Prediction[] = store.predictions || [];
  
  console.log(`📊 ${predictions.length} prédictions chargées`);
  console.log(`📊 ${predictions.filter(p => p.status === 'completed').length} terminées\n`);
  
  // Stats par sport
  const footballCount = predictions.filter(p => normalizeSport(p.sport) === 'football' && p.status === 'completed').length;
  const basketballCount = predictions.filter(p => normalizeSport(p.sport) === 'basketball' && p.status === 'completed').length;
  const hockeyCount = predictions.filter(p => normalizeSport(p.sport) === 'hockey' && p.status === 'completed').length;
  
  console.log(`⚽ Football: ${footballCount} prédictions terminées`);
  console.log(`🏀 Basketball: ${basketballCount} prédictions terminées`);
  console.log(`🏒 Hockey: ${hockeyCount} prédictions terminées\n`);
  
  // Grouper par date
  const byDate = groupByDate(predictions);
  console.log(`📅 ${byDate.size} jours avec des résultats\n`);
  
  // Calculer les stats pour chaque jour
  const dailyStats: any[] = [];
  for (const [date, dayPredictions] of byDate) {
    const dayStats = calculateDayStats(dayPredictions);
    dailyStats.push({
      date,
      ...dayStats
    });
    
    const { stats } = dayStats;
    console.log(`📅 ${date}:`);
    console.log(`   ⚽ Foot: ${stats.bySport.football.results?.rate || 0}% résultats`);
    console.log(`   🏀 Basket: ${stats.bySport.basketball.results?.rate || 0}% résultats`);
    console.log(`   🏒 Hockey: ${stats.bySport.hockey.results?.rate || 0}% résultats`);
  }
  
  // Trier par date (plus récent d'abord)
  dailyStats.sort((a, b) => b.date.localeCompare(a.date));
  
  // Garder 30 jours
  const recentStats = dailyStats.slice(0, 30);
  
  // Calculer le summary
  const summary = calculateSummary(recentStats);
  
  // Charger les stats existantes
  let statsData: any = { dailyStats: [], version: '4.0' };
  if (fs.existsSync(STATS_FILE)) {
    statsData = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
  }
  
  // Mettre à jour
  statsData.dailyStats = recentStats;
  statsData.summary = summary;
  statsData.lastUpdated = new Date().toISOString();
  statsData.version = '4.0';
  
  // Sauvegarder
  fs.writeFileSync(STATS_FILE, JSON.stringify(statsData, null, 2));
  
  console.log('\n📊 ==========================================');
  console.log('📊 RÉSUMÉ GLOBAL');
  console.log('📊 ==========================================');
  console.log(`\n⚽ FOOTBALL:`);
  console.log(`   Résultats 1N2: ${summary.football.results.rate}% (${summary.football.results.correct}/${summary.football.results.total})`);
  console.log(`   Buts O/U 2.5: ${summary.football.goals.rate}% (${summary.football.goals.correct}/${summary.football.goals.total})`);
  console.log(`   BTTS: ${summary.football.btts.rate}% (${summary.football.btts.correct}/${summary.football.btts.total})`);
  console.log(`   Corners: ${summary.football.corners.rate}% (${summary.football.corners.correct}/${summary.football.corners.total})`);
  console.log(`   Cartons: ${summary.football.cards.rate}% (${summary.football.cards.correct}/${summary.football.cards.total})`);
  
  console.log(`\n🏀 BASKETBALL:`);
  console.log(`   Vainqueur: ${summary.basketball.results.rate}% (${summary.basketball.results.correct}/${summary.basketball.results.total})`);
  console.log(`   Total Points: ${summary.basketball.totalPoints.rate}% (${summary.basketball.totalPoints.correct}/${summary.basketball.totalPoints.total})`);
  console.log(`   Handicap: ${summary.basketball.handicap.rate}% (${summary.basketball.handicap.correct}/${summary.basketball.handicap.total})`);
  
  console.log(`\n🏒 HOCKEY:`);
  console.log(`   Vainqueur: ${summary.hockey.results.rate}% (${summary.hockey.results.correct}/${summary.hockey.results.total})`);
  console.log(`   Buts O/U: ${summary.hockey.goals.rate}% (${summary.hockey.goals.correct}/${summary.hockey.goals.total})`);
  
  console.log('\n✅ Stats mises à jour!');
}

main().catch(console.error);
