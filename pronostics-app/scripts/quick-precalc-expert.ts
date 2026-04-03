/**
 * Pré-Calcul Rapide des Conseils Expert
 * TOUS SPORTS: Football, Basketball, Hockey
 * Utilisé par GitHub Actions cron à 6h30 UTC
 */

import * as fs from 'fs';
import * as path from 'path';

// Chemins
const EXPERT_ADVICES_FILE = path.join(process.cwd(), 'data/expert-advices.json');
const PREDICTIONS_FILE = path.join(process.cwd(), 'data/predictions.json');

// Types
interface Prediction {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  matchDate: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  predictedResult: string;
  predictedGoals?: string | null;
  confidence: string;
  riskPercentage: number;
}

interface ExpertAdvice {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  context: {
    recentNews: string[];
    injuries: { home: string[]; away: string[] };
    form: { home: string; away: string };
  };
  oddsAnalysis: {
    favorite: string;
    favoriteOdds: number;
    edge: number;
    publicPercentage: number;
    isPublicFade: boolean;
  };
  recommendation: {
    bet: 'home' | 'draw' | 'away' | 'avoid';
    confidence: 'very_high' | 'high' | 'medium' | 'low';
    reasoning: string[];
    kellyStake: number;
    maxStake: number;
    expectedValue: number;
  };
  warnings: string[];
  dataQuality: 'high' | 'medium' | 'low';
}

// Calculer l'edge basé sur les cotes
function calculateEdge(oddsHome: number, oddsDraw: number | null, oddsAway: number): {
  favorite: string;
  favoriteOdds: number;
  edge: number;
  publicPercentage: number;
} {
  let favorite: string;
  let favoriteOdds: number;
  let publicPercentage: number;

  if (oddsHome <= oddsAway && (oddsDraw === null || oddsHome <= oddsDraw)) {
    favorite = 'home';
    favoriteOdds = oddsHome;
    publicPercentage = Math.round(100 / oddsHome);
  } else if (oddsAway <= oddsHome && (oddsDraw === null || oddsAway <= oddsDraw)) {
    favorite = 'away';
    favoriteOdds = oddsAway;
    publicPercentage = Math.round(100 / oddsAway);
  } else {
    favorite = 'draw';
    favoriteOdds = oddsDraw || 3.5;
    publicPercentage = Math.round(100 / favoriteOdds);
  }

  const impliedProb = (1 / oddsHome) + (oddsDraw ? 1 / oddsDraw : 0) + (1 / oddsAway);
  const edge = Math.round((impliedProb - 1) * 100 * -1);

  return { favorite, favoriteOdds, edge: Math.abs(edge), publicPercentage };
}

// Générer un conseil expert
function generateAdvice(prediction: Prediction): ExpertAdvice {
  const oddsAnalysis = calculateEdge(
    prediction.oddsHome,
    prediction.oddsDraw,
    prediction.oddsAway
  );

  let bet: 'home' | 'draw' | 'away' | 'avoid' = 'avoid';
  let confidence: 'very_high' | 'high' | 'medium' | 'low' = 'low';
  let kellyStake = 0;
  let maxStake = 1;
  const reasoning: string[] = [];
  const warnings: string[] = [];

  // Analyse basée sur les cotes et la confiance
  if (prediction.confidence === 'high' || prediction.confidence === 'very_high') {
    if (prediction.riskPercentage < 25) {
      confidence = prediction.confidence as 'very_high' | 'high';
      kellyStake = 4;
      maxStake = 5;
    } else if (prediction.riskPercentage < 40) {
      confidence = 'medium';
      kellyStake = 2;
      maxStake = 3;
    }
  } else if (prediction.confidence === 'medium') {
    confidence = 'medium';
    kellyStake = 2;
    maxStake = 3;
  } else {
    confidence = 'low';
    kellyStake = 1;
    maxStake = 2;
    warnings.push('Confiance faible - parier avec prudence');
  }

  // Déterminer le pari
  if (prediction.predictedResult === 'home') {
    bet = 'home';
    reasoning.push(`${prediction.homeTeam} favori selon l'analyse`);
    if (prediction.oddsHome < 1.5) {
      reasoning.push('Cote basse - value limitée');
      warnings.push('Cote très basse - considérer un combiné');
    }
  } else if (prediction.predictedResult === 'away') {
    bet = 'away';
    reasoning.push(`${prediction.awayTeam} a un avantage`);
    if (prediction.oddsAway > 2.5) {
      reasoning.push('Bonne value potentielle');
    }
  } else {
    bet = 'draw';
    reasoning.push('Match équilibré - le nul est probable');
  }

  if (prediction.predictedGoals) {
    reasoning.push(`Prédiction buts: ${prediction.predictedGoals}`);
  }

  if (oddsAnalysis.edge > 5) {
    warnings.push(`Edge élevé détecté: ${oddsAnalysis.edge}%`);
  }

  const isPublicFade = oddsAnalysis.publicPercentage > 65 && oddsAnalysis.edge < 3;
  if (isPublicFade) {
    warnings.push('Attention: le public parie massivement sur ce résultat');
    kellyStake = Math.max(1, kellyStake - 1);
  }

  const expectedValue = oddsAnalysis.edge * (kellyStake / 5);

  return {
    matchId: prediction.matchId,
    homeTeam: prediction.homeTeam,
    awayTeam: prediction.awayTeam,
    sport: prediction.sport,
    league: prediction.league,
    context: {
      recentNews: [],
      injuries: { home: [], away: [] },
      form: { home: 'N/A', away: 'N/A' }
    },
    oddsAnalysis: {
      ...oddsAnalysis,
      isPublicFade: isPublicFade
    },
    recommendation: {
      bet,
      confidence,
      reasoning,
      kellyStake,
      maxStake,
      expectedValue: Math.round(expectedValue * 10) / 10
    },
    warnings,
    dataQuality: prediction.confidence === 'high' ? 'high' : prediction.confidence === 'medium' ? 'medium' : 'low'
  };
}

// Fonction principale
async function main() {
  console.log('🎯 Pré-Calcul Rapide des Conseils Expert - TOUS SPORTS');
  console.log('======================================================\n');

  // Charger les prédictions
  if (!fs.existsSync(PREDICTIONS_FILE)) {
    console.log('❌ Aucune prédiction trouvée');
    return;
  }

  const predictionsData = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf-8'));
  const predictions: Prediction[] = predictionsData.predictions || [];

  console.log(`📊 ${predictions.length} prédictions chargées`);

  // Filtrer les matchs à venir
  const now = new Date();
  const upcomingPredictions = predictions.filter(p => {
    const matchDate = new Date(p.matchDate);
    return matchDate > now;
  });

  console.log(`📅 ${upcomingPredictions.length} matchs à venir\n`);

  if (upcomingPredictions.length === 0) {
    console.log('⚠️ Aucun match à venir - génération de conseils pour les prédictions actuelles');
  }

  // Générer les conseils pour TOUS les sports
  const advices: ExpertAdvice[] = [];
  const toProcess = upcomingPredictions.length > 0 ? upcomingPredictions : predictions.slice(0, 20);

  // Compter par sport
  const sportCount = { foot: 0, basket: 0, hockey: 0, other: 0 };

  for (const prediction of toProcess) {
    const icon = prediction.sport === 'Foot' || prediction.sport === 'Football' ? '⚽' :
                 prediction.sport === 'Basket' || prediction.sport === 'Basketball' ? '🏀' :
                 prediction.sport === 'Hockey' || prediction.sport === 'NHL' ? '🏒' : '🎯';
    
    console.log(`  ${icon} ${prediction.homeTeam} vs ${prediction.awayTeam}`);
    
    const advice = generateAdvice(prediction);
    advices.push(advice);
    
    // Compter
    if (prediction.sport === 'Foot' || prediction.sport === 'Football') sportCount.foot++;
    else if (prediction.sport === 'Basket' || prediction.sport === 'Basketball') sportCount.basket++;
    else if (prediction.sport === 'Hockey' || prediction.sport === 'NHL') sportCount.hockey++;
    else sportCount.other++;
    
    console.log(`    ✅ Edge: ${advice.oddsAnalysis.edge}% | Recommandation: ${advice.recommendation.bet}`);
  }

  // Trier par edge décroissant
  advices.sort((a, b) => b.oddsAnalysis.edge - a.oddsAnalysis.edge);

  // Préparer les données - TOUS SPORTS
  const outputData = {
    generatedAt: new Date().toISOString(),
    phase: 'all-sports',
    nextReset: 'Pré-calcul quotidien 6h30 UTC',
    totalAdvices: advices.length,
    stats: {
      football: sportCount.foot,
      basketball: sportCount.basket,
      hockey: sportCount.hockey
    },
    advices
  };

  // Sauvegarder
  fs.writeFileSync(EXPERT_ADVICES_FILE, JSON.stringify(outputData, null, 2));
  console.log(`\n✅ ${advices.length} conseils expert sauvegardés`);

  // Résumé
  console.log('\n📊 Répartition par sport:');
  console.log(`   ⚽ Football: ${sportCount.foot}`);
  console.log(`   🏀 Basketball: ${sportCount.basket}`);
  console.log(`   🏒 Hockey: ${sportCount.hockey}`);
  if (sportCount.other > 0) console.log(`   🎯 Autres: ${sportCount.other}`);
  
  console.log('\n🏆 TOP 5:');
  advices.slice(0, 5).forEach((advice, i) => {
    const icon = advice.sport === 'Foot' || advice.sport === 'Football' ? '⚽' :
                 advice.sport === 'Basket' || advice.sport === 'Basketball' ? '🏀' :
                 advice.sport === 'Hockey' ? '🏒' : '🎯';
    console.log(`${i + 1}. ${icon} ${advice.homeTeam} vs ${advice.awayTeam}`);
    console.log(`   Edge: ${advice.oddsAnalysis.edge}% | Confiance: ${advice.recommendation.confidence} | Kelly: ${advice.recommendation.kellyStake}%`);
  });
}

main().catch(console.error);
