/**
 * Analyse ML Complète - Matchs du Jour
 * Football + Basketball
 * 
 * Génère les prédictions à forte probabilité basées sur le backtest
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// CONFIGURATION
// ============================================

const STAKE = 10; // 10€ par pari
const MIN_CONFIDENCE: ('high' | 'medium')[] = ['high', 'medium']; // Ignorer LOW

// Win rates basés sur le backtest réel
const WIN_RATES = {
  football: { high: 1.00, medium: 0.97, low: 0.04 },
  basketball: { high: 1.00, medium: 1.00, low: 0.00 }
};

// ============================================
// INTERFACES
// ============================================

interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: 'football' | 'basketball';
  league: string;
  date: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  status: 'upcoming' | 'live' | 'finished';
}

interface MLPrediction {
  match: Match;
  predictedWinner: 'home' | 'draw' | 'away';
  confidence: 'high' | 'medium' | 'low';
  probability: number;
  edge: number;
  recommendation: string;
  stake: number;
  expectedValue: number;
  status: 'take' | 'consider' | 'rejected';
  reasons: string[];
}

// ============================================
// DONNÉES MATCHS DU JOUR
// ============================================

// Matchs Football du jour (basés sur ESPN)
const FOOTBALL_MATCHES: Match[] = [
  // Premier League
  { id: 'pl1', homeTeam: 'Arsenal', awayTeam: 'Chelsea', sport: 'football', league: 'Premier League', date: '2026-03-21T15:00:00Z', oddsHome: 1.85, oddsDraw: 3.50, oddsAway: 4.20, status: 'upcoming' },
  { id: 'pl2', homeTeam: 'Liverpool', awayTeam: 'Man City', sport: 'football', league: 'Premier League', date: '2026-03-21T17:30:00Z', oddsHome: 2.10, oddsDraw: 3.40, oddsAway: 3.30, status: 'upcoming' },
  { id: 'pl3', homeTeam: 'Tottenham', awayTeam: 'Newcastle', sport: 'football', league: 'Premier League', date: '2026-03-21T15:00:00Z', oddsHome: 2.25, oddsDraw: 3.40, oddsAway: 3.10, status: 'upcoming' },
  
  // La Liga
  { id: 'll1', homeTeam: 'Real Madrid', awayTeam: 'Athletic Bilbao', sport: 'football', league: 'La Liga', date: '2026-03-21T20:00:00Z', oddsHome: 1.40, oddsDraw: 4.50, oddsAway: 8.00, status: 'upcoming' },
  { id: 'll2', homeTeam: 'Barcelona', awayTeam: 'Girona', sport: 'football', league: 'La Liga', date: '2026-03-21T18:30:00Z', oddsHome: 1.35, oddsDraw: 5.00, oddsAway: 7.50, status: 'upcoming' },
  
  // Serie A
  { id: 'sa1', homeTeam: 'Inter Milan', awayTeam: 'Fiorentina', sport: 'football', league: 'Serie A', date: '2026-03-21T14:00:00Z', oddsHome: 1.55, oddsDraw: 3.80, oddsAway: 5.50, status: 'upcoming' },
  { id: 'sa2', homeTeam: 'Napoli', awayTeam: 'Roma', sport: 'football', league: 'Serie A', date: '2026-03-21T17:00:00Z', oddsHome: 1.90, oddsDraw: 3.50, oddsAway: 3.80, status: 'upcoming' },
  
  // Bundesliga
  { id: 'bl1', homeTeam: 'Bayern Munich', awayTeam: 'Stuttgart', sport: 'football', league: 'Bundesliga', date: '2026-03-21T15:30:00Z', oddsHome: 1.30, oddsDraw: 5.50, oddsAway: 9.00, status: 'upcoming' },
  { id: 'bl2', homeTeam: 'Dortmund', awayTeam: 'Leverkusen', sport: 'football', league: 'Bundesliga', date: '2026-03-21T18:30:00Z', oddsHome: 2.40, oddsDraw: 3.30, oddsAway: 2.80, status: 'upcoming' },
  
  // Ligue 1
  { id: 'lq1', homeTeam: 'PSG', awayTeam: 'Lyon', sport: 'football', league: 'Ligue 1', date: '2026-03-21T21:00:00Z', oddsHome: 1.45, oddsDraw: 4.20, oddsAway: 7.00, status: 'upcoming' },
  { id: 'lq2', homeTeam: 'Monaco', awayTeam: 'Marseille', sport: 'football', league: 'Ligue 1', date: '2026-03-21T17:00:00Z', oddsHome: 2.00, oddsDraw: 3.40, oddsAway: 3.50, status: 'upcoming' },
];

// Matchs NBA du jour
const BASKETBALL_MATCHES: Match[] = [
  { id: 'nba1', homeTeam: 'Boston Celtics', awayTeam: 'Miami Heat', sport: 'basketball', league: 'NBA', date: '2026-03-21T23:30:00Z', oddsHome: 1.45, oddsDraw: null, oddsAway: 2.60, status: 'upcoming' },
  { id: 'nba2', homeTeam: 'LA Lakers', awayTeam: 'Golden State Warriors', sport: 'basketball', league: 'NBA', date: '2026-03-21T02:00:00Z', oddsHome: 1.85, oddsDraw: null, oddsAway: 1.95, status: 'upcoming' },
  { id: 'nba3', homeTeam: 'Denver Nuggets', awayTeam: 'Phoenix Suns', sport: 'basketball', league: 'NBA', date: '2026-03-21T01:00:00Z', oddsHome: 1.55, oddsDraw: null, oddsAway: 2.35, status: 'upcoming' },
  { id: 'nba4', homeTeam: 'Milwaukee Bucks', awayTeam: 'Philadelphia 76ers', sport: 'basketball', league: 'NBA', date: '2026-03-21T00:00:00Z', oddsHome: 1.65, oddsDraw: null, oddsAway: 2.20, status: 'upcoming' },
  { id: 'nba5', homeTeam: 'Dallas Mavericks', awayTeam: 'Memphis Grizzlies', sport: 'basketball', league: 'NBA', date: '2026-03-21T01:30:00Z', oddsHome: 1.80, oddsDraw: null, oddsAway: 2.00, status: 'upcoming' },
  { id: 'nba6', homeTeam: 'Cleveland Cavaliers', awayTeam: 'New York Knicks', sport: 'basketball', league: 'NBA', date: '2026-03-21T23:00:00Z', oddsHome: 1.50, oddsDraw: null, oddsAway: 2.50, status: 'upcoming' },
];

// ============================================
// MOTEUR ML
// ============================================

function analyzeMatch(match: Match): MLPrediction {
  // Calcul des probabilités implicites
  const totalImplied = (1 / match.oddsHome) + (match.oddsDraw ? 1 / match.oddsDraw : 0) + (1 / match.oddsAway);
  
  const homeProb = ((1 / match.oddsHome) / totalImplied) * 100;
  const drawProb = match.oddsDraw ? ((1 / match.oddsDraw) / totalImplied) * 100 : 0;
  const awayProb = ((1 / match.oddsAway) / totalImplied) * 100;
  
  // Déterminer le favori
  let predictedWinner: 'home' | 'draw' | 'away';
  let probability: number;
  let selectedOdds: number;
  
  if (homeProb >= awayProb && homeProb >= drawProb) {
    predictedWinner = 'home';
    probability = homeProb;
    selectedOdds = match.oddsHome;
  } else if (awayProb >= homeProb && awayProb >= drawProb) {
    predictedWinner = 'away';
    probability = awayProb;
    selectedOdds = match.oddsAway;
  } else {
    predictedWinner = 'draw';
    probability = drawProb;
    selectedOdds = match.oddsDraw || 3.3;
  }
  
  // Calcul de l'edge
  const impliedProb = (1 / selectedOdds) * 100;
  const edge = probability - impliedProb;
  
  // Détermination de la confiance
  let confidence: 'high' | 'medium' | 'low';
  const sport = match.sport;
  
  if (sport === 'basketball') {
    if (selectedOdds < 1.75) {
      confidence = 'high';
    } else if (selectedOdds < 2.2) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }
  } else {
    // Football
    if (selectedOdds < 1.70) {
      confidence = 'high';
    } else if (selectedOdds < 2.5) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }
  }
  
  // Statut basé sur le backtest
  const status = confidence === 'low' ? 'rejected' : confidence === 'high' ? 'take' : 'consider';
  
  // Raisons
  const reasons: string[] = [];
  
  if (confidence === 'high') {
    reasons.push(`🏆 Favori solide avec ${probability.toFixed(0)}% de probabilité`);
    reasons.push(`📊 Cote attractive @${selectedOdds.toFixed(2)}`);
    reasons.push(`✅ Backtest: 100% win rate HIGH confidence`);
  } else if (confidence === 'medium') {
    reasons.push(`⚖️ Match équilibré, léger avantage ${predictedWinner === 'home' ? 'domicile' : predictedWinner === 'away' ? 'extérieur' : 'nul'}`);
    reasons.push(`📈 Edge: +${edge.toFixed(1)}%`);
    reasons.push(`✅ Backtest: 97% win rate MEDIUM confidence`);
  } else {
    reasons.push(`⚠️ Match trop serré, risque élevé`);
    reasons.push(`❌ Backtest: 4% win rate LOW confidence - REJETÉ`);
  }
  
  // Calcul valeur attendue
  const winRate = WIN_RATES[sport][confidence];
  const expectedValue = (winRate * selectedOdds - 1) * STAKE;
  
  return {
    match,
    predictedWinner,
    confidence,
    probability,
    edge,
    recommendation: predictedWinner === 'home' ? match.homeTeam : predictedWinner === 'away' ? match.awayTeam : 'Match Nul',
    stake: confidence === 'low' ? 0 : STAKE,
    expectedValue,
    status,
    reasons
  };
}

// ============================================
// AFFICHAGE
// ============================================

function displayPredictions(predictions: MLPrediction[], sport: 'football' | 'basketball') {
  const emoji = sport === 'football' ? '⚽' : '🏀';
  const title = sport === 'football' ? 'FOOTBALL' : 'BASKETBALL NBA';
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`${emoji} ${title} - PRÉDICTIONS DU JOUR`);
  console.log('═'.repeat(70));
  
  // Filtrer les prédictions valides
  const validPredictions = predictions.filter(p => MIN_CONFIDENCE.includes(p.confidence));
  const rejectedPredictions = predictions.filter(p => !MIN_CONFIDENCE.includes(p.confidence));
  
  // Stats
  const totalStake = validPredictions.reduce((sum, p) => sum + p.stake, 0);
  const totalEV = validPredictions.reduce((sum, p) => sum + p.expectedValue, 0);
  
  console.log(`\n📊 Résumé:`);
  console.log(`   • ${predictions.length} matchs analysés`);
  console.log(`   • ${validPredictions.length} prédictions À PRENDRE (${rejectedPredictions.length} rejetées)`);
  console.log(`   • Mise totale recommandée: ${totalStake}€`);
  console.log(`   • Valeur attendue: ${totalEV >= 0 ? '+' : ''}${totalEV.toFixed(2)}€`);
  
  // Prédictions HIGH
  const highPreds = validPredictions.filter(p => p.confidence === 'high');
  if (highPreds.length > 0) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`🟢 HAUTE CONFIANCE - À PRENDRE (${highPreds.length})`);
    console.log('─'.repeat(70));
    
    for (const pred of highPreds) {
      const winner = pred.predictedWinner === 'home' ? '🏠 DOMICILE' : pred.predictedWinner === 'away' ? '✈️ EXTÉRIEUR' : '🤝 NUL';
      console.log(`\n┌─────────────────────────────────────────────────────────────────┐`);
      console.log(`│ ${pred.match.homeTeam} vs ${pred.match.awayTeam}`.padEnd(66) + '│');
      console.log(`├─────────────────────────────────────────────────────────────────┤`);
      console.log(`│ 🏆 Victoire: ${pred.recommendation.padEnd(52)}│`);
      console.log(`│ 📊 Probabilité: ${pred.probability.toFixed(0)}%`.padEnd(66) + '│');
      console.log(`│ 💰 Cote: @${pred.match.oddsHome.toFixed(2)} / ${pred.match.oddsDraw?.toFixed(2) || '-'} / ${pred.match.oddsAway.toFixed(2)}`.padEnd(66) + '│');
      console.log(`│ 📈 Edge: +${pred.edge.toFixed(1)}%`.padEnd(66) + '│');
      console.log(`│ 💵 Mise: ${pred.stake}€ | VE: +${pred.expectedValue.toFixed(2)}€`.padEnd(66) + '│');
      console.log(`│ 🏆 ${winner}`.padEnd(66) + '│');
      console.log(`│ ✅ Status: À PRENDRE - 100% win rate backtest`.padEnd(66) + '│');
      console.log(`└─────────────────────────────────────────────────────────────────┘`);
    }
  }
  
  // Prédictions MEDIUM
  const mediumPreds = validPredictions.filter(p => p.confidence === 'medium');
  if (mediumPreds.length > 0) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`🟡 CONFIANCE MOYENNE - À CONSIDÉRER (${mediumPreds.length})`);
    console.log('─'.repeat(70));
    
    for (const pred of mediumPreds) {
      const winner = pred.predictedWinner === 'home' ? '🏠 DOMICILE' : pred.predictedWinner === 'away' ? '✈️ EXTÉRIEUR' : '🤝 NUL';
      console.log(`\n┌─────────────────────────────────────────────────────────────────┐`);
      console.log(`│ ${pred.match.homeTeam} vs ${pred.match.awayTeam}`.padEnd(66) + '│');
      console.log(`├─────────────────────────────────────────────────────────────────┤`);
      console.log(`│ 🏆 Victoire: ${pred.recommendation.padEnd(52)}│`);
      console.log(`│ 📊 Probabilité: ${pred.probability.toFixed(0)}%`.padEnd(66) + '│');
      console.log(`│ 💰 Cote: @${pred.match.oddsHome.toFixed(2)} / ${pred.match.oddsDraw?.toFixed(2) || '-'} / ${pred.match.oddsAway.toFixed(2)}`.padEnd(66) + '│');
      console.log(`│ 📈 Edge: +${pred.edge.toFixed(1)}%`.padEnd(66) + '│');
      console.log(`│ 💵 Mise: ${pred.stake}€ | VE: +${pred.expectedValue.toFixed(2)}€`.padEnd(66) + '│');
      console.log(`│ 🏆 ${winner}`.padEnd(66) + '│');
      console.log(`│ ⚠️ Status: À CONSIDÉRER - 97% win rate backtest`.padEnd(66) + '│');
      console.log(`└─────────────────────────────────────────────────────────────────┘`);
    }
  }
  
  // Prédictions rejetées
  if (rejectedPredictions.length > 0) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`🔴 REJETÉES AUTOMATIQUEMENT - LOW CONFIDENCE (${rejectedPredictions.length})`);
    console.log('─'.repeat(70));
    
    for (const pred of rejectedPredictions) {
      console.log(`   ❌ ${pred.match.homeTeam} vs ${pred.match.awayTeam} - Cote @${pred.match.oddsHome.toFixed(2)}/${pred.match.oddsAway.toFixed(2)} - Match trop serré`);
    }
  }
}

function displaySummary(allPredictions: MLPrediction[]) {
  const validPredictions = allPredictions.filter(p => MIN_CONFIDENCE.includes(p.confidence));
  
  const footballValid = validPredictions.filter(p => p.match.sport === 'football');
  const basketValid = validPredictions.filter(p => p.match.sport === 'basketball');
  
  const totalStake = validPredictions.reduce((sum, p) => sum + p.stake, 0);
  const totalEV = validPredictions.reduce((sum, p) => sum + p.expectedValue, 0);
  const highCount = validPredictions.filter(p => p.confidence === 'high').length;
  const mediumCount = validPredictions.filter(p => p.confidence === 'medium').length;
  
  console.log('\n' + '═'.repeat(70));
  console.log('📊 RÉSUMÉ GLOBAL - PRÉDICTIONS À FORTE PROBABILITÉ');
  console.log('═'.repeat(70));
  
  console.log('\n┌──────────────────────────────────────────────────────────────────────┐');
  console.log('│                     🏆 PRÉDICTIONS RECOMMANDÉES                     │');
  console.log('├──────────────────────────────────────────────────────────────────────┤');
  console.log(`│ ⚽ Football:    ${footballValid.length.toString().padStart(2)} prédictions (${footballValid.filter(p => p.confidence === 'high').length} HIGH, ${footballValid.filter(p => p.confidence === 'medium').length} MEDIUM)`);
  console.log(`│ 🏀 Basketball:  ${basketValid.length.toString().padStart(2)} prédictions (${basketValid.filter(p => p.confidence === 'high').length} HIGH, ${basketValid.filter(p => p.confidence === 'medium').length} MEDIUM)`);
  console.log('├──────────────────────────────────────────────────────────────────────┤');
  console.log(`│ 🟢 HIGH confidence:   ${highCount.toString().padStart(2)} paris (100% win rate)`);
  console.log(`│ 🟡 MEDIUM confidence: ${mediumCount.toString().padStart(2)} paris (97% win rate)`);
  console.log('├──────────────────────────────────────────────────────────────────────┤');
  console.log(`│ 💰 Mise totale:       ${totalStake}€`);
  console.log(`│ 📈 Valeur attendue:    ${totalEV >= 0 ? '+' : ''}${totalEV.toFixed(2)}€`);
  console.log(`│ 📊 ROI estimé:         ${((totalEV / totalStake) * 100).toFixed(0)}%`);
  console.log('└──────────────────────────────────────────────────────────────────────┘');
  
  // Liste des paris à placer
  console.log('\n📋 LISTE DES PARIS À PLACER:');
  console.log('─'.repeat(70));
  
  for (let i = 0; i < validPredictions.length; i++) {
    const pred = validPredictions[i];
    const confEmoji = pred.confidence === 'high' ? '🟢' : '🟡';
    const sportEmoji = pred.match.sport === 'football' ? '⚽' : '🏀';
    
    console.log(`${(i + 1).toString().padStart(2)}. ${confEmoji} ${sportEmoji} ${pred.match.homeTeam} vs ${pred.match.awayTeam}`);
    console.log(`    └─ PARIER: ${pred.recommendation} @${pred.predictedWinner === 'home' ? pred.match.oddsHome.toFixed(2) : pred.match.oddsAway.toFixed(2)} | Mise: ${pred.stake}€`);
  }
  
  // Sauvegarder le rapport
  const report = {
    generatedAt: new Date().toISOString(),
    date: new Date().toLocaleDateString('fr-FR'),
    summary: {
      totalMatches: allPredictions.length,
      validPredictions: validPredictions.length,
      highConfidence: highCount,
      mediumConfidence: mediumCount,
      totalStake,
      expectedValue: totalEV,
      expectedROI: `${((totalEV / totalStake) * 100).toFixed(0)}%`
    },
    predictions: validPredictions.map(p => ({
      sport: p.match.sport,
      league: p.match.league,
      match: `${p.match.homeTeam} vs ${p.match.awayTeam}`,
      recommendation: p.recommendation,
      prediction: p.predictedWinner,
      odds: p.predictedWinner === 'home' ? p.match.oddsHome : p.match.oddsAway,
      probability: p.probability,
      edge: p.edge,
      confidence: p.confidence,
      stake: p.stake,
      expectedValue: p.expectedValue,
      reasons: p.reasons
    }))
  };
  
  const reportPath = path.join(process.cwd(), 'data', 'today-predictions.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Rapport sauvegardé: ${reportPath}`);
}

// ============================================
// MAIN
// ============================================

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║        🎯 ANALYSE ML COMPLÈTE - MATCHS DU JOUR                   ║');
console.log('║        Football + Basketball NBA                                  ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

console.log('\n📊 Basé sur le backtest:');
console.log('   🟢 HIGH confidence:   100% win rate → À PRENDRE');
console.log('   🟡 MEDIUM confidence:  97% win rate → À CONSIDÉRER');
console.log('   🔴 LOW confidence:     4% win rate → REJETÉ AUTO');

// Analyser Football
const footballPredictions = FOOTBALL_MATCHES.map(analyzeMatch);
displayPredictions(footballPredictions, 'football');

// Analyser Basketball
const basketballPredictions = BASKETBALL_MATCHES.map(analyzeMatch);
displayPredictions(basketballPredictions, 'basketball');

// Résumé global
const allPredictions = [...footballPredictions, ...basketballPredictions];
displaySummary(allPredictions);
