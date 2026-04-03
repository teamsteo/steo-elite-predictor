/**
 * Générateur de Prédictions Quotidiennes
 * 
 * Ce script génère toutes les prédictions pour la journée:
 * - Football: Dixon-Coles amélioré
 * - Basketball: Modèle NBA avancé
 * - NFL: Modèle NFL avec DVOA/EPA
 * 
 * Exécution: Une fois par jour à 6h GMT (via cron)
 * 
 * Usage:
 *   bun run scripts/generate-daily-predictions.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Import des modules
import { getCrossValidatedMatches } from '../src/lib/crossValidation';
import { predictMatch } from '../src/lib/dixonColesModel';
import { savePredictions, createEmptyData, type StablePrediction, type DailyPredictionsData } from '../src/lib/stablePredictions';

// Configuration
const MAX_FOOTBALL = 10;
const MAX_BASKETBALL = 6;
const MAX_NFL = 10;

// Stats d'équipes (cache)
const teamStatsCache = new Map<string, any>();

/**
 * Récupère les stats d'une équipe football
 */
function getFootballTeamStats(teamName: string): any {
  if (teamStatsCache.has(teamName)) {
    return teamStatsCache.get(teamName);
  }
  
  // Stats estimées basées sur le nom de l'équipe (à remplacer par vraies données)
  const topTeams = [
    'Manchester City', 'Arsenal', 'Liverpool', 'Chelsea', 'Manchester United', 'Tottenham',
    'Real Madrid', 'Barcelona', 'Atletico Madrid',
    'Bayern Munich', 'Dortmund', 'RB Leipzig',
    'Inter Milan', 'AC Milan', 'Juventus', 'Napoli',
    'PSG', 'Monaco', 'Marseille',
  ];
  
  const isTopTeam = topTeams.some(t => teamName.toLowerCase().includes(t.toLowerCase()));
  
  const stats = {
    name: teamName,
    goalsScored: isTopTeam ? 50 + Math.floor(Math.random() * 20) : 30 + Math.floor(Math.random() * 20),
    goalsConceded: isTopTeam ? 20 + Math.floor(Math.random() * 15) : 35 + Math.floor(Math.random() * 20),
    matches: 20,
    homeGoalsScored: isTopTeam ? 30 + Math.floor(Math.random() * 10) : 18 + Math.floor(Math.random() * 10),
    homeGoalsConceded: isTopTeam ? 10 + Math.floor(Math.random() * 8) : 18 + Math.floor(Math.random() * 10),
    homeMatches: 10,
    awayGoalsScored: isTopTeam ? 20 + Math.floor(Math.random() * 10) : 12 + Math.floor(Math.random() * 10),
    awayGoalsConceded: isTopTeam ? 10 + Math.floor(Math.random() * 8) : 17 + Math.floor(Math.random() * 10),
    awayMatches: 10,
    form: Array(5).fill(0).map(() => isTopTeam ? 0.5 + Math.random() * 0.5 : Math.random()),
  };
  
  teamStatsCache.set(teamName, stats);
  return stats;
}

/**
 * Génère les prédictions Football avec Dixon-Coles
 */
async function generateFootballPredictions(matches: any[]): Promise<StablePrediction[]> {
  console.log(`\n⚽ Génération prédictions Football (${matches.length} matchs)...`);
  
  const predictions: StablePrediction[] = [];
  
  for (const match of matches.slice(0, MAX_FOOTBALL)) {
    try {
      const homeStats = getFootballTeamStats(match.homeTeam);
      const awayStats = getFootballTeamStats(match.awayTeam);
      
      // Exécuter le modèle Dixon-Coles
      const dixonColes = predictMatch(
        homeStats,
        awayStats,
        match.league,
        match.oddsHome || 2.0,
        match.oddsDraw || 3.3,
        match.oddsAway || 3.5
      );
      
      // Calculer la confiance
      const maxProb = Math.max(dixonColes.homeWinProb, dixonColes.drawProb, dixonColes.awayWinProb);
      let confidence: 'high' | 'medium' | 'low';
      if (maxProb > 65) confidence = 'high';
      else if (maxProb > 45) confidence = 'medium';
      else confidence = 'low';
      
      // Value bet
      const homeEdge = dixonColes.homeWinProb / 100 - (1 / (match.oddsHome || 2.0));
      const awayEdge = dixonColes.awayWinProb / 100 - (1 / (match.oddsAway || 3.5));
      const drawEdge = dixonColes.drawProb / 100 - (1 / (match.oddsDraw || 3.3));
      
      let valueBet = { detected: false, type: null as 'home' | 'draw' | 'away' | null, edge: 0, kellyStake: 0 };
      
      if (homeEdge > 0.05) {
        valueBet = { detected: true, type: 'home', edge: homeEdge, kellyStake: Math.min(0.05, homeEdge * 2) };
      } else if (awayEdge > 0.05) {
        valueBet = { detected: true, type: 'away', edge: awayEdge, kellyStake: Math.min(0.05, awayEdge * 2) };
      } else if (drawEdge > 0.04) {
        valueBet = { detected: true, type: 'draw', edge: drawEdge, kellyStake: Math.min(0.03, drawEdge * 2) };
      }
      
      predictions.push({
        id: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        sport: 'football',
        league: match.league,
        matchDate: match.date,
        oddsHome: match.oddsHome || 2.0,
        oddsDraw: match.oddsDraw || 3.3,
        oddsAway: match.oddsAway || 3.5,
        dixonColes: {
          ...dixonColes,
          correctScores: dixonColes.correctScores.slice(0, 5),
        },
        valueBet,
        confidence,
        generatedAt: new Date().toISOString(),
        dataQuality: 'estimated', // Serait 'real' avec vraies stats
      });
      
      console.log(`  ✅ ${match.homeTeam} vs ${match.awayTeam}: ${dixonColes.homeWinProb}%/${dixonColes.drawProb}%/${dixonColes.awayWinProb}%`);
      
    } catch (error) {
      console.log(`  ❌ Erreur ${match.homeTeam} vs ${match.awayTeam}`);
    }
  }
  
  return predictions;
}

/**
 * Génère les prédictions NBA
 */
async function generateBasketballPredictions(matches: any[]): Promise<StablePrediction[]> {
  console.log(`\n🏀 Génération prédictions NBA (${matches.length} matchs)...`);
  
  const predictions: StablePrediction[] = [];
  
  // Stats NBA estimées
  const nbaStats: Record<string, { ortg: number; drtg: number; pace: number }> = {
    'Boston Celtics': { ortg: 122, drtg: 110, pace: 99 },
    'Cleveland Cavaliers': { ortg: 118, drtg: 108, pace: 97 },
    'Milwaukee Bucks': { ortg: 120, drtg: 112, pace: 100 },
    'Denver Nuggets': { ortg: 119, drtg: 111, pace: 98 },
    'Oklahoma City': { ortg: 117, drtg: 107, pace: 101 },
    'Minnesota Timberwolves': { ortg: 115, drtg: 106, pace: 96 },
    'LA Clippers': { ortg: 116, drtg: 110, pace: 95 },
    'Phoenix Suns': { ortg: 118, drtg: 113, pace: 99 },
    'Golden State Warriors': { ortg: 117, drtg: 114, pace: 102 },
    'Los Angeles Lakers': { ortg: 115, drtg: 112, pace: 98 },
    'default': { ortg: 113, drtg: 113, pace: 98 },
  };
  
  for (const match of matches.slice(0, MAX_BASKETBALL)) {
    try {
      const homeStats = nbaStats[match.homeTeam] || nbaStats['default'];
      const awayStats = nbaStats[match.awayTeam] || nbaStats['default'];
      
      // Calculer les points attendus
      const homeExpected = (homeStats.ortg + awayStats.drtg) / 200 * (homeStats.pace + awayStats.pace) / 2;
      const awayExpected = (awayStats.ortg + homeStats.drtg) / 200 * (homeStats.pace + awayStats.pace) / 2;
      
      // Probabilité de victoire (modèle simplifié)
      const pointDiff = homeExpected - awayExpected;
      const homeWinProb = Math.min(0.85, Math.max(0.15, 0.5 + pointDiff * 0.03));
      const awayWinProb = 1 - homeWinProb;
      
      // Spread
      const spread = -pointDiff;
      
      // Total points
      const totalPoints = homeExpected + awayExpected;
      
      // Value bet
      const homeEdge = homeWinProb - (1 / (match.oddsHome || 1.9));
      const awayEdge = awayWinProb - (1 / (match.oddsAway || 1.9));
      
      let valueBet = { detected: false, type: null as 'home' | 'away' | null, edge: 0, kellyStake: 0 };
      
      if (homeEdge > 0.05) {
        valueBet = { detected: true, type: 'home', edge: homeEdge, kellyStake: Math.min(0.05, homeEdge * 2) };
      } else if (awayEdge > 0.05) {
        valueBet = { detected: true, type: 'away', edge: awayEdge, kellyStake: Math.min(0.05, awayEdge * 2) };
      }
      
      const confidence: 'high' | 'medium' | 'low' = 
        Math.max(homeWinProb, awayWinProb) > 0.65 ? 'high' :
        Math.max(homeWinProb, awayWinProb) > 0.55 ? 'medium' : 'low';
      
      predictions.push({
        id: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        sport: 'basketball',
        league: 'NBA',
        matchDate: match.date,
        oddsHome: match.oddsHome || 1.9,
        oddsDraw: null,
        oddsAway: match.oddsAway || 1.9,
        nbaPrediction: {
          predictedWinner: homeWinProb > 0.5 ? 'home' : 'away',
          winnerProb: Math.round(Math.max(homeWinProb, awayWinProb) * 100),
          spread: Math.round(spread * 10) / 10,
          totalPoints: Math.round(totalPoints),
          overProb: Math.round((totalPoints > 220 ? 0.55 : 0.45) * 100),
          confidence: Math.round(Math.abs(homeWinProb - 0.5) * 100 + 50),
        },
        valueBet,
        confidence,
        generatedAt: new Date().toISOString(),
        dataQuality: 'estimated',
      });
      
      console.log(`  ✅ ${match.homeTeam} vs ${match.awayTeam}: ${Math.round(homeWinProb * 100)}%`);
      
    } catch (error) {
      console.log(`  ❌ Erreur ${match.homeTeam} vs ${match.awayTeam}`);
    }
  }
  
  return predictions;
}

/**
 * Génère les prédictions NFL
 */
async function generateNFLPredictions(): Promise<StablePrediction[]> {
  console.log(`\n🏈 Génération prédictions NFL...`);
  
  // Récupérer depuis l'API NFL
  try {
    const response = await fetch('http://localhost:3000/api/nfl-pro');
    const data = await response.json();
    
    if (!data.predictions || data.predictions.length === 0) {
      console.log('  ⚠️ Aucun match NFL disponible');
      return [];
    }
    
    return data.predictions.slice(0, MAX_NFL).map((match: any) => ({
      id: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      sport: 'nfl' as const,
      league: 'NFL',
      matchDate: match.date,
      oddsHome: 1.9,
      oddsDraw: null,
      oddsAway: 1.9,
      nflPrediction: {
        homeWinProb: Math.round(match.projected.homeWinProb * 100),
        awayWinProb: Math.round(match.projected.awayWinProb * 100),
        spread: match.insights.spread.line,
        totalPoints: match.insights.total.line,
        dvoaDiff: match.factors.dvoaDiff,
        confidence: match.insights.confidence,
      },
      valueBet: {
        detected: match.insights.moneyline.valueBet.detected,
        type: match.insights.moneyline.valueBet.type,
        edge: match.insights.moneyline.valueBet.edge / 100,
        kellyStake: match.insights.kellyFraction,
      },
      confidence: match.insights.confidence >= 70 ? 'high' : match.insights.confidence >= 50 ? 'medium' : 'low',
      generatedAt: new Date().toISOString(),
      dataQuality: 'real',
    }));
    
  } catch (error) {
    console.log('  ❌ Erreur récupération NFL');
    return [];
  }
}

/**
 * Fonction principale
 */
async function main() {
  console.log('🚀 ========================================');
  console.log('🚀 GÉNÉRATION QUOTIDIENNE DES PRÉDICTIONS');
  console.log('🚀 ========================================');
  console.log(`📅 ${new Date().toISOString()}`);
  
  const startTime = Date.now();
  
  // 1. Créer la structure de données
  const data: DailyPredictionsData = createEmptyData();
  
  // 2. Récupérer les matchs
  console.log('\n📊 Récupération des matchs...');
  const { matches } = await getCrossValidatedMatches();
  console.log(`✅ ${matches.length} matchs récupérés`);
  
  // Séparer par sport
  const footballMatches = matches.filter(m => m.sport === 'Foot' || m.sport === 'Football');
  const basketballMatches = matches.filter(m => m.sport === 'Basket' || m.sport === 'Basketball');
  
  console.log(`  ⚽ Football: ${footballMatches.length}`);
  console.log(`  🏀 Basketball: ${basketballMatches.length}`);
  
  // 3. Générer les prédictions
  data.predictions.football = await generateFootballPredictions(footballMatches);
  data.predictions.basketball = await generateBasketballPredictions(basketballMatches);
  data.predictions.nfl = await generateNFLPredictions();
  
  // 4. Calculer les stats
  data.stats = {
    football: data.predictions.football.length,
    basketball: data.predictions.basketball.length,
    nfl: data.predictions.nfl.length,
    totalValueBets: [
      ...data.predictions.football,
      ...data.predictions.basketball,
      ...data.predictions.nfl,
    ].filter(p => p.valueBet.detected).length,
    highConfidence: [
      ...data.predictions.football,
      ...data.predictions.basketball,
      ...data.predictions.nfl,
    ].filter(p => p.confidence === 'high').length,
  };
  
  // 5. Sauvegarder
  const saved = savePredictions(data);
  
  const elapsed = Date.now() - startTime;
  
  console.log('\n📊 RÉSUMÉ:');
  console.log('========================================');
  console.log(`  ⚽ Football: ${data.stats.football} prédictions`);
  console.log(`  🏀 Basketball: ${data.stats.basketball} prédictions`);
  console.log(`  🏈 NFL: ${data.stats.nfl} prédictions`);
  console.log(`  💰 Value Bets: ${data.stats.totalValueBets}`);
  console.log(`  ⭐ Haute confiance: ${data.stats.highConfidence}`);
  console.log(`  ⏱️ Temps: ${elapsed}ms`);
  console.log(`  ✅ Sauvegardé: ${saved ? 'OUI' : 'NON'}`);
  console.log('========================================');
  
  return data;
}

// Exécuter
main()
  .then(() => {
    console.log('\n🎉 Génération terminée!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erreur:', error);
    process.exit(1);
  });
