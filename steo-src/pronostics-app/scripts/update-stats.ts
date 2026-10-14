/**
 * Script de Mise à Jour des Statistiques
 * 
 * Calcule les stats à partir des prédictions completed
 * et met à jour stats_history.json
 * 
 * NOUVEAU: Stats séparées par sport + Ratio Expert Advisor
 */

import * as fs from 'fs';
import * as path from 'path';

const PREDICTIONS_FILE = path.join(process.cwd(), 'data/predictions.json');
const STATS_FILE = path.join(process.cwd(), 'data/stats_history.json');
const EXPERT_ADVICES_FILE = path.join(process.cwd(), 'data/expert-advices.json');
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
  status: 'pending' | 'completed';
  homeScore?: number;
  awayScore?: number;
  actualResult?: string;
  resultMatch?: boolean;
  goalsMatch?: boolean;
  checkedAt?: string;
}

interface ExpertAdvice {
  matchId: string;
  sport: string;
  recommendation: {
    bet: 'home' | 'draw' | 'away' | 'avoid';
    confidence: 'very_high' | 'high' | 'medium' | 'low';
  };
}

// Normaliser le sport
function normalizeSport(sport: string): 'football' | 'basketball' | 'hockey' | 'other' {
  const s = sport.toLowerCase();
  if (s.includes('foot') || s.includes('soccer')) return 'football';
  if (s.includes('basket') || s.includes('nba')) return 'basketball';
  if (s.includes('hockey') || s.includes('nhl')) return 'hockey';
  return 'other';
}

// Grouper les prédictions par date
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

// Calculer les stats d'une journée avec séparation par sport et type de pari
function calculateDayStats(predictions: Prediction[]): any {
  const completed = predictions.filter(p => p.status === 'completed');
  const wins = completed.filter(p => p.resultMatch === true).length;
  const losses = completed.filter(p => p.resultMatch === false).length;
  
  const withGoals = completed.filter(p => p.predictedGoals);
  const goalsCorrect = withGoals.filter(p => p.goalsMatch === true).length;
  
  const total = completed.length;
  const rate = total > 0 ? Math.round(wins / total * 100) : 0;
  const goalsRate = withGoals.length > 0 ? Math.round(goalsCorrect / withGoals.length * 100) : 0;
  
  // Stats par sport
  const footballPreds = completed.filter(p => normalizeSport(p.sport) === 'football');
  const basketballPreds = completed.filter(p => normalizeSport(p.sport) === 'basketball');
  const hockeyPreds = completed.filter(p => normalizeSport(p.sport) === 'hockey');
  
  const footballWins = footballPreds.filter(p => p.resultMatch === true).length;
  const basketballWins = basketballPreds.filter(p => p.resultMatch === true).length;
  const hockeyWins = hockeyPreds.filter(p => p.resultMatch === true).length;
  
  // === STATS DÉTAILLÉES PAR TYPE DE PARI ===
  // Football: Résultats (1X2)
  const footballResults = footballPreds.filter(p => p.predictedResult);
  const footballResultsWins = footballResults.filter(p => p.resultMatch === true).length;
  
  // Football: Buts Over/Under
  const footballOverUnder = footballPreds.filter(p => p.predictedGoals && (p.predictedGoals.includes('Over') || p.predictedGoals.includes('Under')));
  const footballOverUnderWins = footballOverUnder.filter(p => p.goalsMatch === true).length;
  
  // Football: BTTS (Les deux marquent)
  const footballBTTS = footballPreds.filter(p => p.predictedGoals && p.predictedGoals.toLowerCase().includes('marquent'));
  const footballBTTSWins = footballBTTS.filter(p => p.goalsMatch === true).length;
  
  // Basketball: Résultats
  const basketballResults = basketballPreds.filter(p => p.predictedResult);
  const basketballResultsWins = basketballResults.filter(p => p.resultMatch === true).length;
  
  // Hockey: Résultats
  const hockeyResults = hockeyPreds.filter(p => p.predictedResult);
  const hockeyResultsWins = hockeyResults.filter(p => p.resultMatch === true).length;
  
  return {
    stats: {
      results: { total, correct: wins, rate },
      goals: { total: withGoals.length, correct: goalsCorrect, rate: goalsRate },
      overall: Math.round((rate + goalsRate) / 2),
      completed: total,
      wins,
      losses,
      winRate: rate,
      // Stats par sport
      bySport: {
        football: {
          total: footballPreds.length,
          wins: footballWins,
          losses: footballPreds.length - footballWins,
          winRate: footballPreds.length > 0 ? Math.round(footballWins / footballPreds.length * 100) : 0,
          // Détails par type de pari
          details: {
            resultats: { total: footballResults.length, wins: footballResultsWins, winRate: footballResults.length > 0 ? Math.round(footballResultsWins / footballResults.length * 100) : 0 },
            buts: { total: footballOverUnder.length, wins: footballOverUnderWins, winRate: footballOverUnder.length > 0 ? Math.round(footballOverUnderWins / footballOverUnder.length * 100) : 0 },
            btts: { total: footballBTTS.length, wins: footballBTTSWins, winRate: footballBTTS.length > 0 ? Math.round(footballBTTSWins / footballBTTS.length * 100) : 0 }
          }
        },
        basketball: {
          total: basketballPreds.length,
          wins: basketballWins,
          losses: basketballPreds.length - basketballWins,
          winRate: basketballPreds.length > 0 ? Math.round(basketballWins / basketballPreds.length * 100) : 0,
          // Détails par type de pari
          details: {
            resultats: { total: basketballResults.length, wins: basketballResultsWins, winRate: basketballResults.length > 0 ? Math.round(basketballResultsWins / basketballResults.length * 100) : 0 }
          }
        },
        hockey: {
          total: hockeyPreds.length,
          wins: hockeyWins,
          losses: hockeyPreds.length - hockeyWins,
          winRate: hockeyPreds.length > 0 ? Math.round(hockeyWins / hockeyPreds.length * 100) : 0,
          // Détails par type de pari
          details: {
            resultats: { total: hockeyResults.length, wins: hockeyResultsWins, winRate: hockeyResults.length > 0 ? Math.round(hockeyResultsWins / hockeyResults.length * 100) : 0 }
          }
        }
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
      predictedGoals: p.predictedGoals,
      correct: p.resultMatch,
      goalsCorrect: p.goalsMatch,
      score: p.homeScore !== undefined ? `${p.homeScore}-${p.awayScore}` : undefined
    }))
  };
}

// Calculer le ratio de l'expert advisor
function calculateExpertRatio(predictions: Prediction[], expertAdvices: ExpertAdvice[]): any {
  // Filtrer les prédictions terminées
  const completed = predictions.filter(p => p.status === 'completed');
  
  // Associer les conseils expert avec les résultats
  let expertPredictions = 0;
  let expertWins = 0;
  let expertHighConfidencePredictions = 0;
  let expertHighConfidenceWins = 0;
  
  for (const pred of completed) {
    const advice = expertAdvices.find(a => a.matchId === pred.matchId);
    if (advice) {
      expertPredictions++;
      if (pred.resultMatch === true) {
        expertWins++;
      }
      
      // Stats haute confiance
      if (advice.recommendation.confidence === 'high' || advice.recommendation.confidence === 'very_high') {
        expertHighConfidencePredictions++;
        if (pred.resultMatch === true) {
          expertHighConfidenceWins++;
        }
      }
    }
  }
  
  return {
    total: expertPredictions,
    wins: expertWins,
    losses: expertPredictions - expertWins,
    winRate: expertPredictions > 0 ? Math.round(expertWins / expertPredictions * 100) : 0,
    highConfidence: {
      total: expertHighConfidencePredictions,
      wins: expertHighConfidenceWins,
      winRate: expertHighConfidencePredictions > 0 ? Math.round(expertHighConfidenceWins / expertHighConfidencePredictions * 100) : 0
    }
  };
}

// Sauvegarder sur GitHub
async function saveToGitHub(content: string, filePath: string, message: string): Promise<boolean> {
  if (!GITHUB_TOKEN) {
    console.log('⚠️ GITHUB_TOKEN non configuré');
    return false;
  }
  
  try {
    // Get SHA
    const getRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`,
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
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`,
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

async function main() {
  console.log('📊 ==========================================');
  console.log('📊 MISE À JOUR DES STATISTIQUES V3.0');
  console.log(`📊 ${new Date().toLocaleString('fr-FR')}`);
  console.log('📊 ==========================================\n');
  
  if (!fs.existsSync(PREDICTIONS_FILE)) {
    console.log('❌ Fichier prédictions non trouvé');
    return;
  }
  
  const store = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf-8'));
  const predictions: Prediction[] = store.predictions || [];
  
  // Charger les conseils expert
  let expertAdvices: ExpertAdvice[] = [];
  if (fs.existsSync(EXPERT_ADVICES_FILE)) {
    const expertData = JSON.parse(fs.readFileSync(EXPERT_ADVICES_FILE, 'utf-8'));
    expertAdvices = expertData.advices || [];
    console.log(`🎯 ${expertAdvices.length} conseils expert chargés`);
  }
  
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
  
  // Charger les stats existantes
  let statsData: any = { dailyStats: [], version: '3.0' };
  if (fs.existsSync(STATS_FILE)) {
    statsData = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
  }
  
  // Calculer les stats pour chaque jour
  let updated = 0;
  for (const [date, dayPredictions] of byDate) {
    const dayStats = calculateDayStats(dayPredictions);
    
    const existingIndex = statsData.dailyStats.findIndex((s: any) => s.date === date);
    const newEntry = {
      date,
      ...dayStats
    };
    
    if (existingIndex >= 0) {
      statsData.dailyStats[existingIndex] = newEntry;
    } else {
      statsData.dailyStats.push(newEntry);
    }
    updated++;
    
    const { stats } = dayStats;
    console.log(`📅 ${date}: ${stats.wins}/${stats.completed} (${stats.winRate}%) | ⚽${stats.bySport.football.total} 🏀${stats.bySport.basketball.total} 🏒${stats.bySport.hockey.total}`);
  }
  
  // Trier par date (plus récent d'abord)
  statsData.dailyStats.sort((a: any, b: any) => b.date.localeCompare(a.date));
  
  // Garder 30 jours
  statsData.dailyStats = statsData.dailyStats.slice(0, 30);
  
  // Calculer les totaux globaux
  const totalCompleted = statsData.dailyStats.reduce((sum: number, d: any) => sum + d.stats.completed, 0);
  const totalWins = statsData.dailyStats.reduce((sum: number, d: any) => sum + d.stats.wins, 0);
  
  // Calculer les totaux par sport avec détails
  const footballStats = {
    total: statsData.dailyStats.reduce((sum: number, d: any) => sum + (d.stats.bySport?.football?.total || 0), 0),
    wins: statsData.dailyStats.reduce((sum: number, d: any) => sum + (d.stats.bySport?.football?.wins || 0), 0),
    details: {
      resultats: {
        total: statsData.dailyStats.reduce((sum: number, d: any) => sum + (d.stats.bySport?.football?.details?.resultats?.total || 0), 0),
        wins: statsData.dailyStats.reduce((sum: number, d: any) => sum + (d.stats.bySport?.football?.details?.resultats?.wins || 0), 0)
      },
      buts: {
        total: statsData.dailyStats.reduce((sum: number, d: any) => sum + (d.stats.bySport?.football?.details?.buts?.total || 0), 0),
        wins: statsData.dailyStats.reduce((sum: number, d: any) => sum + (d.stats.bySport?.football?.details?.buts?.wins || 0), 0)
      },
      btts: {
        total: statsData.dailyStats.reduce((sum: number, d: any) => sum + (d.stats.bySport?.football?.details?.btts?.total || 0), 0),
        wins: statsData.dailyStats.reduce((sum: number, d: any) => sum + (d.stats.bySport?.football?.details?.btts?.wins || 0), 0)
      }
    }
  };
  
  const basketballStats = {
    total: statsData.dailyStats.reduce((sum: number, d: any) => sum + (d.stats.bySport?.basketball?.total || 0), 0),
    wins: statsData.dailyStats.reduce((sum: number, d: any) => sum + (d.stats.bySport?.basketball?.wins || 0), 0),
    details: {
      resultats: {
        total: statsData.dailyStats.reduce((sum: number, d: any) => sum + (d.stats.bySport?.basketball?.details?.resultats?.total || 0), 0),
        wins: statsData.dailyStats.reduce((sum: number, d: any) => sum + (d.stats.bySport?.basketball?.details?.resultats?.wins || 0), 0)
      }
    }
  };
  
  const hockeyStats = {
    total: statsData.dailyStats.reduce((sum: number, d: any) => sum + (d.stats.bySport?.hockey?.total || 0), 0),
    wins: statsData.dailyStats.reduce((sum: number, d: any) => sum + (d.stats.bySport?.hockey?.wins || 0), 0),
    details: {
      resultats: {
        total: statsData.dailyStats.reduce((sum: number, d: any) => sum + (d.stats.bySport?.hockey?.details?.resultats?.total || 0), 0),
        wins: statsData.dailyStats.reduce((sum: number, d: any) => sum + (d.stats.bySport?.hockey?.details?.resultats?.wins || 0), 0)
      }
    }
  };
  
  // Calculer le ratio expert
  const expertRatio = calculateExpertRatio(predictions, expertAdvices);
  
  statsData.summary = {
    totalDays: statsData.dailyStats.length,
    totalPredictions: totalCompleted,
    totalWins,
    totalLosses: totalCompleted - totalWins,
    overallWinRate: totalCompleted > 0 ? Math.round(totalWins / totalCompleted * 100) : 0,
    // Stats par sport avec détails
    bySport: {
      football: {
        total: footballStats.total,
        wins: footballStats.wins,
        losses: footballStats.total - footballStats.wins,
        winRate: footballStats.total > 0 ? Math.round(footballStats.wins / footballStats.total * 100) : 0,
        details: {
          resultats: {
            total: footballStats.details.resultats.total,
            wins: footballStats.details.resultats.wins,
            winRate: footballStats.details.resultats.total > 0 ? Math.round(footballStats.details.resultats.wins / footballStats.details.resultats.total * 100) : 0
          },
          buts: {
            total: footballStats.details.buts.total,
            wins: footballStats.details.buts.wins,
            winRate: footballStats.details.buts.total > 0 ? Math.round(footballStats.details.buts.wins / footballStats.details.buts.total * 100) : 0
          },
          btts: {
            total: footballStats.details.btts.total,
            wins: footballStats.details.btts.wins,
            winRate: footballStats.details.btts.total > 0 ? Math.round(footballStats.details.btts.wins / footballStats.details.btts.total * 100) : 0
          }
        }
      },
      basketball: {
        total: basketballStats.total,
        wins: basketballStats.wins,
        losses: basketballStats.total - basketballStats.wins,
        winRate: basketballStats.total > 0 ? Math.round(basketballStats.wins / basketballStats.total * 100) : 0,
        details: {
          resultats: {
            total: basketballStats.details.resultats.total,
            wins: basketballStats.details.resultats.wins,
            winRate: basketballStats.details.resultats.total > 0 ? Math.round(basketballStats.details.resultats.wins / basketballStats.details.resultats.total * 100) : 0
          }
        }
      },
      hockey: {
        total: hockeyStats.total,
        wins: hockeyStats.wins,
        losses: hockeyStats.total - hockeyStats.wins,
        winRate: hockeyStats.total > 0 ? Math.round(hockeyStats.wins / hockeyStats.total * 100) : 0,
        details: {
          resultats: {
            total: hockeyStats.details.resultats.total,
            wins: hockeyStats.details.resultats.wins,
            winRate: hockeyStats.details.resultats.total > 0 ? Math.round(hockeyStats.details.resultats.wins / hockeyStats.details.resultats.total * 100) : 0
          }
        }
      }
    },
    // Ratio Expert Advisor
    expertAdvisor: expertRatio,
    lastUpdated: new Date().toISOString()
  };
  
  // Sauvegarder localement
  fs.writeFileSync(STATS_FILE, JSON.stringify(statsData, null, 2));
  console.log(`\n✅ ${updated} jours mis à jour`);
  console.log(`📊 Total: ${totalWins}/${totalCompleted} (${statsData.summary.overallWinRate}%)`);
  
  console.log(`\n📊 ========== STATS DÉTAILLÉES PAR SPORT ==========`);
  
  // Football avec détails
  console.log(`\n⚽ FOOTBALL: ${footballStats.wins}/${footballStats.total} (${statsData.summary.bySport.football.winRate}%)`);
  if (footballStats.details.resultats.total > 0) {
    console.log(`   📋 Résultats (1X2): ${footballStats.details.resultats.wins}/${footballStats.details.resultats.total} (${statsData.summary.bySport.football.details.resultats.winRate}%)`);
  }
  if (footballStats.details.buts.total > 0) {
    console.log(`   ⚽ Buts (Over/Under): ${footballStats.details.buts.wins}/${footballStats.details.buts.total} (${statsData.summary.bySport.football.details.buts.winRate}%)`);
  }
  if (footballStats.details.btts.total > 0) {
    console.log(`   🎯 BTTS (Les 2 marquent): ${footballStats.details.btts.wins}/${footballStats.details.btts.total} (${statsData.summary.bySport.football.details.btts.winRate}%)`);
  }
  
  // Basketball avec détails
  console.log(`\n🏀 BASKETBALL: ${basketballStats.wins}/${basketballStats.total} (${statsData.summary.bySport.basketball.winRate}%)`);
  if (basketballStats.details.resultats.total > 0) {
    console.log(`   📋 Résultats: ${basketballStats.details.resultats.wins}/${basketballStats.details.resultats.total} (${statsData.summary.bySport.basketball.details.resultats.winRate}%)`);
  }
  
  // Hockey avec détails
  console.log(`\n🏒 HOCKEY: ${hockeyStats.wins}/${hockeyStats.total} (${statsData.summary.bySport.hockey.winRate}%)`);
  if (hockeyStats.details.resultats.total > 0) {
    console.log(`   📋 Résultats: ${hockeyStats.details.resultats.wins}/${hockeyStats.details.resultats.total} (${statsData.summary.bySport.hockey.details.resultats.winRate}%)`);
  }
  
  console.log(`\n🎯 EXPERT ADVISOR:`);
  console.log(`   Total: ${expertRatio.wins}/${expertRatio.total} (${expertRatio.winRate}%)`);
  console.log(`   Haute confiance: ${expertRatio.highConfidence.wins}/${expertRatio.highConfidence.total} (${expertRatio.highConfidence.winRate}%)`);
  
  // Sauvegarder sur GitHub
  if (GITHUB_TOKEN) {
    console.log('\n📤 Sauvegarde sur GitHub...');
    const saved = await saveToGitHub(
      JSON.stringify(statsData, null, 2),
      'data/stats_history.json',
      `📊 Stats V3: ${totalWins}/${totalCompleted} (${statsData.summary.overallWinRate}%) | Expert: ${expertRatio.winRate}%`
    );
    console.log(saved ? '✅ Sauvegardé sur GitHub' : '❌ Erreur sauvegarde');
  }
  
  console.log('\n🎉 Terminé!');
}

main().catch(console.error);
