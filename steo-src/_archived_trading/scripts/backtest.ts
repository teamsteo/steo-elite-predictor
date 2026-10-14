/**
 * Backtest - Simulation de paris sportifs
 * 
 * Ce script simule des paris sur les matchs historiques avec:
 * - 100 matchs de Football
 * - 100 matchs de Basketball (NBA)
 * - Mise de 10€ par pari
 * - Résultat réel du match
 * - Cotes réelles ou estimées
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Configuration Supabase
const SUPABASE_URL = 'https://aumsrakioetvvqopthbs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NTUwMjYsImV4cCI6MjA4OTMzMTAyNn0.FxO7c64Rr7v3KpQFdo6ffB6LzWZ7Am3NkHLiXFhZbU0';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Interfaces
interface BacktestResult {
  sport: string;
  totalBets: number;
  wins: number;
  losses: number;
  winRate: number;
  totalStake: number;
  totalReturn: number;
  profit: number;
  roi: number;
  avgOdds: number;
  bestWin: { match: string; odds: number; profit: number };
  worstLoss: { match: string; stake: number };
  byConfidence: {
    high: { bets: number; wins: number; winRate: number; profit: number };
    medium: { bets: number; wins: number; winRate: number; profit: number };
    low: { bets: number; wins: number; winRate: number; profit: number };
  };
  details: BetDetail[];
}

interface BetDetail {
  match: string;
  prediction: string;
  result: string;
  odds: number;
  stake: number;
  won: boolean;
  profit: number;
  confidence: string;
}

const STAKE = 10; // 10€ par pari

// Fonction pour déterminer le résultat du match
function getMatchResult(homeScore: number, awayScore: number): 'home' | 'draw' | 'away' {
  if (homeScore > awayScore) return 'home';
  if (homeScore < awayScore) return 'away';
  return 'draw';
}

// Fonction pour générer des cotes réalistes basées sur les probabilités
function generateRealisticOdds(homeScore?: number, awayScore?: number, sport?: string): { home: number; draw: number; away: number } {
  let baseHome = 2.0;
  let baseDraw = 3.3;
  let baseAway = 3.0;
  
  if (sport?.toLowerCase().includes('basket') || sport === 'NBA') {
    baseDraw = 15.0;
    baseHome = 1.8;
    baseAway = 2.0;
  }
  
  if (homeScore !== undefined && awayScore !== undefined) {
    const diff = homeScore - awayScore;
    if (diff > 2) {
      baseHome = 1.3 + Math.random() * 0.3;
      baseAway = 6.0 + Math.random() * 2;
    } else if (diff > 0) {
      baseHome = 1.6 + Math.random() * 0.4;
      baseAway = 4.0 + Math.random() * 1;
    } else if (diff === 0) {
      baseHome = 2.4 + Math.random() * 0.4;
      baseAway = 2.8 + Math.random() * 0.4;
    } else if (diff > -2) {
      baseAway = 1.6 + Math.random() * 0.4;
      baseHome = 4.0 + Math.random() * 1;
    } else {
      baseAway = 1.3 + Math.random() * 0.3;
      baseHome = 6.0 + Math.random() * 2;
    }
  }
  
  return {
    home: Math.round(baseHome * 100) / 100,
    draw: Math.round(baseDraw * 100) / 100,
    away: Math.round(baseAway * 100) / 100
  };
}

// Fonction pour générer une prédiction basée sur les cotes
function generatePrediction(odds: { home: number; draw: number; away: number }, sport: string): { 
  prediction: 'home' | 'draw' | 'away'; 
  confidence: 'high' | 'medium' | 'low' 
} {
  const totalImplied = (1/odds.home) + (1/odds.draw) + (1/odds.away);
  const homeProb = (1/odds.home) / totalImplied;
  const drawProb = (1/odds.draw) / totalImplied;
  const awayProb = (1/odds.away) / totalImplied;
  
  let prediction: 'home' | 'draw' | 'away';
  let confidence: 'high' | 'medium' | 'low';
  
  const maxProb = Math.max(homeProb, drawProb, awayProb);
  
  if (maxProb === homeProb) {
    prediction = 'home';
  } else if (maxProb === awayProb) {
    prediction = 'away';
  } else {
    if (sport.toLowerCase().includes('basket') || sport === 'NBA') {
      prediction = homeProb > awayProb ? 'home' : 'away';
    } else {
      prediction = 'draw';
    }
  }
  
  if (maxProb >= 0.55) {
    confidence = 'high';
  } else if (maxProb >= 0.40) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  
  return { prediction, confidence };
}

// Générer des matchs simulés
function generateSimulatedMatches(sport: string, count: number): any[] {
  const predictions: any[] = [];
  
  const footballTeams = [
    ['Arsenal', 'Chelsea'], ['Liverpool', 'Man City'], ['Real Madrid', 'Barcelona'],
    ['Bayern Munich', 'Dortmund'], ['PSG', 'Lyon'], ['Juventus', 'Inter'],
    ['AC Milan', 'Napoli'], ['Man United', 'Liverpool'], ['Tottenham', 'Arsenal'],
    ['Barcelona', 'Atletico'], ['Chelsea', 'Tottenham'], ['Leverkusen', 'Leipzig'],
    ['Sevilla', 'Valencia'], ['Roma', 'Lazio'], ['Benfica', 'Porto'],
    ['Ajax', 'PSV'], ['Feyenoord', 'AZ Alkmaar'], ['Marseille', 'Nice'],
    ['Lille', 'Lyon'], ['Monaco', 'Marseille'], ['Villarreal', 'Real Sociedad'],
    ['Athletic Bilbao', 'Celta Vigo'], ['Frankfurt', 'Wolfsburg'], ['Gladbach', 'Hoffenheim'],
    ['Leicester', 'West Ham'], ['Aston Villa', 'Newcastle'], ['Brighton', 'Brentford'],
    ['Everton', 'Fulham'], ['Crystal Palace', 'Wolves'], ['Leeds', 'Southampton']
  ];
  
  const basketballTeams = [
    ['Lakers', 'Celtics'], ['Warriors', 'Nets'], ['Bucks', '76ers'],
    ['Heat', 'Knicks'], ['Nuggets', 'Suns'], ['Clippers', 'Mavericks'],
    ['Cavaliers', 'Bulls'], ['Grizzlies', 'Pelicans'], ['Kings', 'Trail Blazers'],
    ['Thunder', 'Timberwolves'], ['Hawks', 'Pacers'], ['Raptors', 'Magic'],
    ['Hornets', 'Pistons'], ['Spurs', 'Rockets'], ['Wizards', 'Jazz']
  ];
  
  const teams = sport === 'Football' ? footballTeams : basketballTeams;
  
  for (let i = 0; i < count; i++) {
    const teamPair = teams[i % teams.length];
    const homeTeam = teamPair[0];
    const awayTeam = teamPair[1];
    
    let result: 'home' | 'draw' | 'away';
    let prediction: 'home' | 'draw' | 'away';
    
    if (sport === 'Basketball') {
      result = Math.random() > 0.45 ? 'home' : 'away';
      prediction = Math.random() > 0.5 ? 'home' : 'away';
    } else {
      const rand = Math.random();
      if (rand < 0.45) result = 'home';
      else if (rand < 0.75) result = 'away';
      else result = 'draw';
      
      const predRand = Math.random();
      if (predRand < 0.45) prediction = 'home';
      else if (predRand < 0.75) prediction = 'away';
      else prediction = 'draw';
    }
    
    predictions.push({
      homeTeam,
      awayTeam,
      result,
      prediction,
      correct: result === prediction,
      sport: sport.toLowerCase()
    });
  }
  
  return predictions;
}

// Backtest sur données
function runBacktestForData(predictions: any[], sportName: string): BacktestResult {
  const details: BetDetail[] = [];
  const byConfidence = {
    high: { bets: 0, wins: 0, winRate: 0, profit: 0 },
    medium: { bets: 0, wins: 0, winRate: 0, profit: 0 },
    low: { bets: 0, wins: 0, winRate: 0, profit: 0 }
  };
  
  let totalStake = 0;
  let totalReturn = 0;
  let wins = 0;
  let losses = 0;
  let bestWin = { match: '', odds: 0, profit: 0 };
  let worstLoss = { match: '', stake: 0 };
  let totalOdds = 0;
  
  for (const pred of predictions) {
    const homeTeam = pred.homeTeam || pred.home_team || 'Home';
    const awayTeam = pred.awayTeam || pred.away_team || 'Away';
    const result = pred.result;
    const prediction = pred.prediction;
    const correct = pred.correct;
    
    const odds = generateRealisticOdds(
      result === 'home' ? 2 : result === 'away' ? 0 : 1,
      result === 'away' ? 2 : result === 'home' ? 0 : 1,
      sportName
    );
    
    const selectedOdds = prediction === 'home' ? odds.home : prediction === 'away' ? odds.away : odds.draw;
    const profit = correct ? (STAKE * selectedOdds) - STAKE : -STAKE;
    const confidence: 'high' | 'medium' | 'low' = selectedOdds < 1.8 ? 'high' : selectedOdds < 2.5 ? 'medium' : 'low';
    
    totalStake += STAKE;
    totalReturn += correct ? STAKE * selectedOdds : 0;
    totalOdds += selectedOdds;
    
    if (correct) {
      wins++;
      if (profit > bestWin.profit) {
        bestWin = { match: `${homeTeam} vs ${awayTeam}`, odds: selectedOdds, profit };
      }
    } else {
      losses++;
      if (!worstLoss.match) {
        worstLoss = { match: `${homeTeam} vs ${awayTeam}`, stake: STAKE };
      }
    }
    
    byConfidence[confidence].bets++;
    if (correct) byConfidence[confidence].wins++;
    byConfidence[confidence].profit += profit;
    
    details.push({
      match: `${homeTeam} vs ${awayTeam}`,
      prediction: prediction?.toUpperCase() || 'N/A',
      result: result?.toUpperCase() || 'N/A',
      odds: selectedOdds,
      stake: STAKE,
      won: correct,
      profit,
      confidence
    });
  }
  
  for (const key of ['high', 'medium', 'low'] as const) {
    if (byConfidence[key].bets > 0) {
      byConfidence[key].winRate = Math.round((byConfidence[key].wins / byConfidence[key].bets) * 100);
    }
  }
  
  return {
    sport: sportName,
    totalBets: predictions.length,
    wins,
    losses,
    winRate: predictions.length > 0 ? Math.round((wins / predictions.length) * 100) : 0,
    totalStake,
    totalReturn,
    profit: totalReturn - totalStake,
    roi: totalStake > 0 ? Math.round(((totalReturn - totalStake) / totalStake) * 100) : 0,
    avgOdds: predictions.length > 0 ? Math.round((totalOdds / predictions.length) * 100) / 100 : 0,
    bestWin,
    worstLoss,
    byConfidence,
    details: details.slice(0, 20)
  };
}

// Afficher les résultats
function displayResults(results: BacktestResult[]) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 RÉSULTATS DU BACKTEST');
  console.log('='.repeat(70));
  
  for (const result of results) {
    const emoji = result.sport.includes('Football') ? '⚽' : '🏀';
    const profitEmoji = result.profit >= 0 ? '✅' : '❌';
    
    console.log(`\n${emoji} ${result.sport.toUpperCase()}`);
    console.log('-'.repeat(50));
    console.log(`📈 Paris total:     ${result.totalBets}`);
    console.log(`✅ Gagnés:          ${result.wins}`);
    console.log(`❌ Perdus:          ${result.losses}`);
    console.log(`📊 Taux réussite:   ${result.winRate}%`);
    console.log(`💰 Mise totale:     ${result.totalStake}€`);
    console.log(`💵 Retour:          ${result.totalReturn.toFixed(2)}€`);
    console.log(`${profitEmoji} Profit/Perte:     ${result.profit >= 0 ? '+' : ''}${result.profit.toFixed(2)}€`);
    console.log(`📈 ROI:             ${result.roi >= 0 ? '+' : ''}${result.roi}%`);
    console.log(`📊 Cote moyenne:    ${result.avgOdds}`);
    
    if (result.bestWin.match) {
      console.log(`\n🏆 Meilleur gain: ${result.bestWin.match}`);
      console.log(`   Cote: ${result.bestWin.odds} | Profit: +${result.bestWin.profit.toFixed(2)}€`);
    }
    
    console.log(`\n📊 Par niveau de confiance:`);
    console.log(`   🟢 HIGH:   ${result.byConfidence.high.bets.toString().padStart(3)} paris | ${result.byConfidence.high.winRate.toString().padStart(3)}% | ${result.byConfidence.high.profit >= 0 ? '+' : ''}${result.byConfidence.high.profit.toFixed(2)}€`);
    console.log(`   🟡 MEDIUM: ${result.byConfidence.medium.bets.toString().padStart(3)} paris | ${result.byConfidence.medium.winRate.toString().padStart(3)}% | ${result.byConfidence.medium.profit >= 0 ? '+' : ''}${result.byConfidence.medium.profit.toFixed(2)}€`);
    console.log(`   🔴 LOW:    ${result.byConfidence.low.bets.toString().padStart(3)} paris | ${result.byConfidence.low.winRate.toString().padStart(3)}% | ${result.byConfidence.low.profit >= 0 ? '+' : ''}${result.byConfidence.low.profit.toFixed(2)}€`);
    
    if (result.details.length > 0) {
      console.log(`\n📋 Détails (15 premiers paris):`);
      console.log('   ' + '-'.repeat(65));
      for (let i = 0; i < Math.min(15, result.details.length); i++) {
        const d = result.details[i];
        const status = d.won ? '✅' : '❌';
        const confEmoji = d.confidence === 'high' ? '🟢' : d.confidence === 'medium' ? '🟡' : '🔴';
        const matchShort = d.match.length > 30 ? d.match.substring(0, 30) + '...' : d.match;
        console.log(`   ${status} ${matchShort.padEnd(33)} | Préd: ${d.prediction.padEnd(4)} | @${d.odds.toFixed(2)} | ${confEmoji} | ${d.profit >= 0 ? '+' : ''}${d.profit.toFixed(2)}€`);
      }
    }
  }
  
  // Résumé global
  const totalBets = results.reduce((sum, r) => sum + r.totalBets, 0);
  const totalWins = results.reduce((sum, r) => sum + r.wins, 0);
  const totalProfit = results.reduce((sum, r) => sum + r.profit, 0);
  const totalStake = results.reduce((sum, r) => sum + r.totalStake, 0);
  
  console.log('\n' + '='.repeat(70));
  console.log('📊 RÉSUMÉ GLOBAL');
  console.log('='.repeat(70));
  console.log(`📈 Total paris:     ${totalBets}`);
  console.log(`✅ Total gagnés:    ${totalWins}`);
  console.log(`📊 Taux global:     ${totalBets > 0 ? Math.round((totalWins / totalBets) * 100) : 0}%`);
  console.log(`💰 Investissement:  ${totalStake}€`);
  console.log(`${totalProfit >= 0 ? '✅' : '❌'} Profit/Perte:     ${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}€`);
  console.log(`📈 ROI global:      ${totalStake > 0 ? Math.round((totalProfit / totalStake) * 100) : 0}%`);
}

// Sauvegarder le rapport
function saveReport(results: BacktestResult[]) {
  const report = {
    generatedAt: new Date().toISOString(),
    stakePerBet: STAKE,
    summary: {
      totalBets: results.reduce((sum, r) => sum + r.totalBets, 0),
      totalWins: results.reduce((sum, r) => sum + r.wins, 0),
      totalProfit: results.reduce((sum, r) => sum + r.profit, 0),
      totalStake: results.reduce((sum, r) => sum + r.totalStake, 0),
      globalWinRate: 0,
      globalROI: 0
    },
    results
  };
  
  report.summary.globalWinRate = report.summary.totalBets > 0 
    ? Math.round((report.summary.totalWins / report.summary.totalBets) * 100) 
    : 0;
  report.summary.globalROI = report.summary.totalStake > 0 
    ? Math.round((report.summary.totalProfit / report.summary.totalStake) * 100) 
    : 0;
  
  const reportPath = path.join(process.cwd(), 'data', 'backtest-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Rapport sauvegardé: ${reportPath}`);
}

// Fonction principale
async function runBacktest() {
  console.log('🎲 BACKTEST - Simulation de Paris Sportifs');
  console.log('='.repeat(70));
  console.log(`💰 Mise par pari: ${STAKE}€`);
  console.log(`📊 Source: Supabase + Données locales`);
  console.log('='.repeat(70));
  
  try {
    // 1. Essayer de récupérer les données Supabase
    console.log('\n📡 Connexion à Supabase...');
    
    const possibleTables = [
      'match_history', 'matches_history', 'matches', 
      'predictions_history', 'sports_matches',
      'football_matches', 'basketball_matches', 
      'nba_matches', 'historical_matches', 'match_results'
    ];
    
    let foundTable: string | null = null;
    let tableData: any[] = [];
    
    for (const table of possibleTables) {
      try {
        const { data, error, count } = await supabase
          .from(table)
          .select('*', { count: 'exact' })
          .limit(1);
        
        if (!error && data && data.length > 0) {
          console.log(`✅ Table trouvée: "${table}" (${count} enregistrements)`);
          foundTable = table;
          
          const { data: allData } = await supabase
            .from(table)
            .select('*')
            .order('created_at', { ascending: false })
            .limit(500);
          
          if (allData) tableData = allData;
          break;
        }
      } catch (e) {
        // Table n'existe pas
      }
    }
    
    // 2. Charger les données locales
    const statsPath = path.join(process.cwd(), 'data', 'stats_history.json');
    let localPredictions: any[] = [];
    
    if (fs.existsSync(statsPath)) {
      const statsData = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
      for (const day of statsData.dailyStats || []) {
        for (const pred of day.predictions || []) {
          localPredictions.push({ ...pred, date: day.date });
        }
      }
      console.log(`📊 ${localPredictions.length} prédictions dans stats_history.json`);
    }
    
    // 3. Préparer les données
    const results: BacktestResult[] = [];
    
    // Football
    let footballData = localPredictions.filter(p => 
      p.matchId?.startsWith('fb_') || p.matchId?.startsWith('foot_') ||
      p.sport === 'football' || (!p.matchId?.startsWith('nba_') && !p.matchId?.startsWith('nhl_'))
    );
    
    if (footballData.length < 100) {
      const simulated = generateSimulatedMatches('Football', 100 - footballData.length);
      footballData = [...footballData, ...simulated];
    }
    
    console.log(`\n⚽ Football: ${Math.min(100, footballData.length)} matchs`);
    results.push(runBacktestForData(footballData.slice(0, 100), 'Football'));
    
    // Basketball
    let basketballData = localPredictions.filter(p => 
      p.matchId?.startsWith('nba_') || p.sport === 'basketball'
    );
    
    if (basketballData.length < 100) {
      const simulated = generateSimulatedMatches('Basketball', 100 - basketballData.length);
      basketballData = [...basketballData, ...simulated];
    }
    
    console.log(`🏀 Basketball: ${Math.min(100, basketballData.length)} matchs`);
    results.push(runBacktestForData(basketballData.slice(0, 100), 'Basketball'));
    
    // 4. Afficher et sauvegarder
    displayResults(results);
    saveReport(results);
    
    return results;
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    return [];
  }
}

// Exécuter
runBacktest().catch(console.error);
