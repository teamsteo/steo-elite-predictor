/**
 * NBA Real Match ML Analysis
 * Analyse ML complète pour les matchs NBA réels du jour
 */

interface NBATeam {
  name: string;
  wins: number;
  losses: number;
  homeRecord?: string;
  awayRecord?: string;
  recentForm: string; // W/D/L sur les 10 derniers
  pointsFor: number; // PPG
  pointsAgainst: number; // OPPG
  offensiveRating: number;
  defensiveRating: number;
  pace: number;
  injuries?: string[];
}

interface NBAMatch {
  id: string;
  homeTeam: NBATeam;
  awayTeam: NBATeam;
  odds: {
    home: number;
    away: number;
    spread?: number;
    total?: number;
  };
  date: string;
  venue: string;
}

interface MLPrediction {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  
  // Probabilités
  probabilities: {
    homeWin: number;
    awayWin: number;
  };
  
  // Valeur attendue
  expectedValue: {
    home: number;
    away: number;
    best: 'home' | 'away';
  };
  
  // Analyse ML
  mlAnalysis: {
    winRatePrediction: number;
    confidenceScore: number;
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    factors: string[];
    riskFactors: string[];
  };
  
  // Recommandation
  recommendation: {
    bet: string;
    odds: number;
    probability: number;
    edge: number;
    kellyStake: number;
    tag: 'GREEN' | 'ORANGE' | 'RED';
    tagLabel: string;
  };
  
  // Statistiques clés
  keyStats: {
    winDiff: number;
    homeAdvantage: number;
    formDiff: number;
    offensiveDiff: number;
    defensiveDiff: number;
  };
}

// ============================================
// DONNÉES RÉELLES DES 3 MATCHS NBA
// ============================================

const realMatches: NBAMatch[] = [
  {
    id: 'nba-001',
    date: '2026-03-21',
    venue: 'Toyota Center, Houston',
    homeTeam: {
      name: 'Houston Rockets',
      wins: 42,
      losses: 27,
      homeRecord: '25-10',
      recentForm: 'WWLWWLWWWL', // 7W-3L
      pointsFor: 114.2,
      pointsAgainst: 108.5,
      offensiveRating: 116.8,
      defensiveRating: 110.2,
      pace: 99.5
    },
    awayTeam: {
      name: 'Miami Heat',
      wins: 38,
      losses: 32,
      awayRecord: '16-18',
      recentForm: 'WLWLLWWLLW', // 5W-5L
      pointsFor: 109.8,
      pointsAgainst: 110.1,
      offensiveRating: 112.5,
      defensiveRating: 112.8,
      pace: 97.2
    },
    odds: {
      home: 1.70,
      away: 2.20
    }
  },
  {
    id: 'nba-002',
    date: '2026-03-21',
    venue: 'Spectrum Center, Charlotte',
    homeTeam: {
      name: 'Charlotte Hornets',
      wins: 36,
      losses: 34,
      homeRecord: '22-13',
      recentForm: 'WWLWWLLWWW', // 7W-3L
      pointsFor: 110.5,
      pointsAgainst: 111.2,
      offensiveRating: 113.2,
      defensiveRating: 113.8,
      pace: 100.1
    },
    awayTeam: {
      name: 'Memphis Grizzlies',
      wins: 24,
      losses: 45,
      awayRecord: '10-24',
      recentForm: 'LLWLLLWWLL', // 3W-7L
      pointsFor: 106.8,
      pointsAgainst: 115.5,
      offensiveRating: 108.2,
      defensiveRating: 117.5,
      pace: 101.5
    },
    odds: {
      home: 1.65,
      away: 2.35
    }
  },
  {
    id: 'nba-003',
    date: '2026-03-21',
    venue: 'Crypto.com Arena, Los Angeles',
    homeTeam: {
      name: 'LA Lakers',
      wins: 45,
      losses: 25,
      homeRecord: '27-8',
      recentForm: 'WWWLWWWWLW', // 8W-2L
      pointsFor: 115.8,
      pointsAgainst: 110.2,
      offensiveRating: 117.5,
      defensiveRating: 110.8,
      pace: 98.8
    },
    awayTeam: {
      name: 'Orlando Magic',
      wins: 38,
      losses: 31,
      awayRecord: '17-17',
      recentForm: 'WLWWLWLWWL', // 6W-4L
      pointsFor: 108.5,
      pointsAgainst: 107.8,
      offensiveRating: 111.2,
      defensiveRating: 109.5,
      pace: 95.5
    },
    odds: {
      home: 1.58,
      away: 2.45
    }
  }
];

// ============================================
// MOTEUR ML NBA
// ============================================

function calculateWinRate(wins: number, losses: number): number {
  return wins / (wins + losses);
}

function calculateFormPoints(form: string): number {
  let points = 0;
  for (const result of form) {
    if (result === 'W') points += 1;
    else if (result === 'D') points += 0.5;
  }
  return points;
}

function calculateHomeAdvantage(homeRecord: string, awayRecord: string): number {
  const homeWins = parseInt(homeRecord.split('-')[0]);
  const homeLosses = parseInt(homeRecord.split('-')[1]);
  const awayWins = parseInt(awayRecord.split('-')[0]);
  const awayLosses = parseInt(awayRecord.split('-')[1]);
  
  const homeWinPct = homeWins / (homeWins + homeLosses);
  const awayWinPct = awayWins / (awayWins + awayLosses);
  
  return (homeWinPct - awayWinPct) * 100;
}

function calculateExpectedValue(probability: number, odds: number): number {
  return probability * odds - 1;
}

function calculateKellyStake(probability: number, odds: number): number {
  const edge = probability * odds - 1;
  if (edge <= 0) return 0;
  const kelly = edge / (odds - 1);
  return Math.min(Math.round(kelly * 100 * 10) / 10, 10);
}

function analyzeMatch(match: NBAMatch): MLPrediction {
  const { homeTeam, awayTeam, odds } = match;
  
  // 1. Calcul du différentiel de victoires
  const winDiff = homeTeam.wins - awayTeam.wins;
  const homeWinRate = calculateWinRate(homeTeam.wins, homeTeam.losses);
  const awayWinRate = calculateWinRate(awayTeam.wins, awayTeam.losses);
  
  // 2. Avantage domicile
  const homeAdvantage = calculateHomeAdvantage(
    homeTeam.homeRecord || '0-0',
    awayTeam.awayRecord || '0-0'
  );
  
  // 3. Forme récente
  const homeFormPoints = calculateFormPoints(homeTeam.recentForm);
  const awayFormPoints = calculateFormPoints(awayTeam.recentForm);
  const formDiff = homeFormPoints - awayFormPoints;
  
  // 4. Différentiel offensif/défensif
  const offensiveDiff = homeTeam.offensiveRating - awayTeam.offensiveRating;
  const defensiveDiff = awayTeam.defensiveRating - homeTeam.defensiveRating;
  
  // 5. Calcul des probabilités ML
  let homeWinProb = 50;
  let awayWinProb = 50;
  
  // Facteurs pondérés
  const winRateFactor = (homeWinRate - awayWinRate) * 100 * 0.30;
  const homeAdvantageFactor = homeAdvantage * 0.25;
  const formFactor = formDiff * 3 * 0.20;
  const ratingFactor = (offensiveDiff - defensiveDiff) * 0.15;
  const paceFactor = (homeTeam.pace > awayTeam.pace ? 2 : -2) * 0.10;
  
  const totalAdjustment = winRateFactor + homeAdvantageFactor + formFactor + ratingFactor + paceFactor;
  
  homeWinProb = 50 + totalAdjustment;
  awayWinProb = 100 - homeWinProb;
  
  // Normalisation
  homeWinProb = Math.max(15, Math.min(85, homeWinProb));
  awayWinProb = 100 - homeWinProb;
  
  // 6. Calcul des Expected Values
  const homeEV = calculateExpectedValue(homeWinProb / 100, odds.home);
  const awayEV = calculateExpectedValue(awayWinProb / 100, odds.away);
  
  // 7. Détermination du niveau de confiance
  const factors: string[] = [];
  const riskFactors: string[] = [];
  
  // Facteurs positifs
  if (winDiff > 5) factors.push(`✓ Avantage victoires: +${winDiff} wins`);
  if (homeAdvantage > 10) factors.push(`✓ Fort avantage domicile: +${homeAdvantage.toFixed(1)}%`);
  if (formDiff > 2) factors.push(`✓ Meilleure forme: +${formDiff.toFixed(1)} pts`);
  if (offensiveDiff > 3) factors.push(`✓ Attaque supérieure: +${offensiveDiff.toFixed(1)} ORtg`);
  if (defensiveDiff > 3) factors.push(`✓ Défense solide: -${defensiveDiff.toFixed(1)} DRtg adverse`);
  
  // Facteurs de risque
  if (homeWinProb < 60 && odds.home < 1.80) riskFactors.push('⚠ Cote faible sans domination claire');
  if (awayTeam.wins > homeTeam.wins * 0.85) riskFactors.push('⚠ Adversaire compétitif');
  if (Math.abs(formDiff) < 2) riskFactors.push('⚠ Forme récente similaire');
  if (awayWinRate > 0.45) riskFactors.push('⚠ Adversaire avec bon % de victoires');
  
  // Score de confiance
  let confidenceScore = 50;
  confidenceScore += Math.abs(winDiff) * 1.5;
  confidenceScore += homeAdvantage * 0.5;
  confidenceScore += Math.abs(formDiff) * 3;
  confidenceScore += Math.abs(offensiveDiff + defensiveDiff) * 0.5;
  confidenceScore -= riskFactors.length * 10;
  
  // Niveau de confiance
  let confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  if (confidenceScore >= 70 && homeEV > 0.05) {
    confidenceLevel = 'HIGH';
  } else if (confidenceScore >= 50 && homeEV > 0) {
    confidenceLevel = 'MEDIUM';
  } else {
    confidenceLevel = 'LOW';
  }
  
  // 8. Tag et recommandation
  const bestBet = homeEV >= awayEV ? 'home' : 'away';
  const bestOdds = bestBet === 'home' ? odds.home : odds.away;
  const bestProb = bestBet === 'home' ? homeWinProb : awayWinProb;
  const bestEV = bestBet === 'home' ? homeEV : awayEV;
  const kellyStake = calculateKellyStake(bestProb / 100, bestOdds);
  
  let tag: 'GREEN' | 'ORANGE' | 'RED';
  let tagLabel: string;
  
  if (confidenceLevel === 'HIGH' && bestEV > 0.08) {
    tag = 'GREEN';
    tagLabel = '🟢 À PRENDRE';
  } else if (confidenceLevel === 'MEDIUM' || (confidenceLevel === 'HIGH' && bestEV > 0.03)) {
    tag = 'ORANGE';
    tagLabel = '🟠 À CONSIDÉRER';
  } else {
    tag = 'RED';
    tagLabel = '🔴 REJETÉ AUTO';
  }
  
  return {
    matchId: match.id,
    homeTeam: homeTeam.name,
    awayTeam: awayTeam.name,
    probabilities: {
      homeWin: Math.round(homeWinProb * 10) / 10,
      awayWin: Math.round(awayWinProb * 10) / 10
    },
    expectedValue: {
      home: Math.round(homeEV * 100) / 100,
      away: Math.round(awayEV * 100) / 100,
      best: bestBet
    },
    mlAnalysis: {
      winRatePrediction: Math.round(bestProb * 10) / 10,
      confidenceScore: Math.round(confidenceScore),
      confidenceLevel,
      factors,
      riskFactors
    },
    recommendation: {
      bet: bestBet === 'home' ? `Victoire ${homeTeam.name}` : `Victoire ${awayTeam.name}`,
      odds: bestOdds,
      probability: Math.round(bestProb * 10) / 10,
      edge: Math.round(bestEV * 100),
      kellyStake,
      tag,
      tagLabel
    },
    keyStats: {
      winDiff,
      homeAdvantage: Math.round(homeAdvantage * 10) / 10,
      formDiff: Math.round(formDiff * 10) / 10,
      offensiveDiff: Math.round(offensiveDiff * 10) / 10,
      defensiveDiff: Math.round(defensiveDiff * 10) / 10
    }
  };
}

// ============================================
// EXÉCUTION DE L'ANALYSE
// ============================================

console.log('🏀 ANALYSE ML NBA - MATCHS RÉELS DU 21/03/2026\n');
console.log('=' .repeat(70));

const predictions: MLPrediction[] = [];

for (const match of realMatches) {
  const prediction = analyzeMatch(match);
  predictions.push(prediction);
  
  console.log(`\n📍 ${prediction.homeTeam} vs ${prediction.awayTeam}`);
  console.log(`   ${match.venue}`);
  console.log('-'.repeat(50));
  
  console.log(`\n📊 STATISTIQUES CLÉS:`);
  console.log(`   Différence victoires: ${prediction.keyStats.winDiff > 0 ? '+' : ''}${prediction.keyStats.winDiff}`);
  console.log(`   Avantage domicile: ${prediction.keyStats.homeAdvantage > 0 ? '+' : ''}${prediction.keyStats.homeAdvantage}%`);
  console.log(`   Différence forme: ${prediction.keyStats.formDiff > 0 ? '+' : ''}${prediction.keyStats.formDiff} pts`);
  console.log(`   Diff. offensive: ${prediction.keyStats.offensiveDiff > 0 ? '+' : ''}${prediction.keyStats.offensiveDiff}`);
  console.log(`   Diff. defensive: ${prediction.keyStats.defensiveDiff > 0 ? '+' : ''}${prediction.keyStats.defensiveDiff}`);
  
  console.log(`\n📈 PROBABILITÉS ML:`);
  console.log(`   ${prediction.homeTeam}: ${prediction.probabilities.homeWin}%`);
  console.log(`   ${prediction.awayTeam}: ${prediction.probabilities.awayWin}%`);
  
  console.log(`\n💰 EXPECTED VALUE:`);
  console.log(`   ${prediction.homeTeam}: ${prediction.expectedValue.home > 0 ? '+' : ''}${(prediction.expectedValue.home * 100).toFixed(1)}%`);
  console.log(`   ${prediction.awayTeam}: ${prediction.expectedValue.away > 0 ? '+' : ''}${(prediction.expectedValue.away * 100).toFixed(1)}%`);
  
  console.log(`\n🎯 NIVEAU DE CONFIANCE: ${prediction.mlAnalysis.confidenceLevel} (${prediction.mlAnalysis.confidenceScore}/100)`);
  
  if (prediction.mlAnalysis.factors.length > 0) {
    console.log(`\n✅ FACTEURS POSITIFS:`);
    prediction.mlAnalysis.factors.forEach(f => console.log(`   ${f}`));
  }
  
  if (prediction.mlAnalysis.riskFactors.length > 0) {
    console.log(`\n⚠️ FACTEURS DE RISQUE:`);
    prediction.mlAnalysis.riskFactors.forEach(r => console.log(`   ${r}`));
  }
  
  console.log(`\n🏷️ RECOMMANDATION: ${prediction.recommendation.tagLabel}`);
  console.log(`   Paris: ${prediction.recommendation.bet}`);
  console.log(`   Cote: ${prediction.recommendation.odds}`);
  console.log(`   Probabilité: ${prediction.recommendation.probability}%`);
  console.log(`   Edge: +${prediction.recommendation.edge}%`);
  console.log(`   Mise Kelly: ${prediction.recommendation.kellyStake}%`);
  
  console.log('\n' + '='.repeat(70));
}

// ============================================
// RÉSUMÉ FINAL
// ============================================

console.log('\n\n🎯 RÉSUMÉ DES PRONOSTICS NBA\n');
console.log('='.repeat(70));

const greenBets = predictions.filter(p => p.recommendation.tag === 'GREEN');
const orangeBets = predictions.filter(p => p.recommendation.tag === 'ORANGE');
const redBets = predictions.filter(p => p.recommendation.tag === 'RED');

if (greenBets.length > 0) {
  console.log('\n🟢 PRONOSTICS À PRENDRE (HIGH CONFIDENCE):');
  greenBets.forEach(p => {
    console.log(`   ✓ ${p.recommendation.bet} @${p.recommendation.odds}`);
    console.log(`     Confiance: ${p.mlAnalysis.confidenceLevel} | Edge: +${p.recommendation.edge}%`);
    console.log(`     Mise Kelly recommandée: ${p.recommendation.kellyStake}%`);
  });
}

if (orangeBets.length > 0) {
  console.log('\n🟠 PRONOSTICS À CONSIDÉRER (MEDIUM CONFIDENCE):');
  orangeBets.forEach(p => {
    console.log(`   ○ ${p.recommendation.bet} @${p.recommendation.odds}`);
    console.log(`     Confiance: ${p.mlAnalysis.confidenceLevel} | Edge: +${p.recommendation.edge}%`);
    console.log(`     Mise Kelly: ${p.recommendation.kellyStake}%`);
  });
}

if (redBets.length > 0) {
  console.log('\n🔴 PRONOSTICS REJETÉS (LOW CONFIDENCE):');
  redBets.forEach(p => {
    console.log(`   ✗ ${p.recommendation.bet} @${p.recommendation.odds}`);
    console.log(`     Raison: Confiance ${p.mlAnalysis.confidenceLevel} | Edge insuffisant`);
  });
}

// Export JSON
import { writeFileSync } from 'fs';

const outputData = {
  date: '2026-03-21',
  generated: new Date().toISOString(),
  summary: {
    total: predictions.length,
    green: greenBets.length,
    orange: orangeBets.length,
    red: redBets.length
  },
  predictions: predictions
};

writeFileSync(
  '/home/z/my-project/data/nba-real-predictions.json',
  JSON.stringify(outputData, null, 2)
);

console.log('\n📁 Fichier sauvegardé: data/nba-real-predictions.json');
console.log('\n✅ Analyse ML terminée!');
