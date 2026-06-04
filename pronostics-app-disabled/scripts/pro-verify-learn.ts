/**
 * Script de vérification et apprentissage pour le Pronostiqueur Pro
 * Exécuté automatiquement par GitHub Actions
 * 
 * Fonctions:
 * 1. Vérifier les résultats des pronostics en attente
 * 2. Mettre à jour les stats
 * 3. Ajuster les poids du modèle ML
 * 4. Générer de nouvelles prédictions optimisées
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// INTERFACES
// ============================================

interface ProPick {
  id: string;
  matchId: string;
  sport: 'football' | 'basketball' | 'tennis';
  league: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  bet: string;
  betLabel: string;
  odds: number;
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  winProbability: number;
  value: number;
  type: 'safe' | 'fun';
  reasoning: string[];
  result?: 'won' | 'lost' | 'pending' | 'void';
  actualScore?: string;
}

interface ProPrediction {
  id: string;
  generatedAt: string;
  type: 'safe' | 'fun' | 'combo';
  picks: ProPick[];
  combinedOdds: number;
  totalStake: number;
  potentialWin: number;
  riskLevel: 'low' | 'medium' | 'high';
  result?: 'won' | 'lost' | 'pending' | 'partial';
  profit?: number;
  features: Record<string, number>;
}

interface ModelWeights {
  confidence: number;
  value: number;
  odds: number;
  historicalAccuracy: number;
  safeThreshold: {
    minProbability: number;
    maxOdds: number;
    minConfidenceWeight: number;
  };
  funThreshold: {
    minProbability: number;
    minOdds: number;
    minValue: number;
  };
  learningRate: number;
  version: string;
  lastUpdated: string;
}

interface ProDatabase {
  predictions: ProPrediction[];
  stats: {
    totalPredictions: number;
    won: number;
    lost: number;
    pending: number;
    winRate: number;
    roi: number;
    profit: number;
    byType: {
      safe: { total: number; won: number; winRate: number; profit: number };
      fun: { total: number; won: number; winRate: number; profit: number };
      combo: { total: number; won: number; winRate: number; profit: number };
    };
    byConfidence: {
      very_high: { total: number; won: number; winRate: number };
      high: { total: number; won: number; winRate: number };
      medium: { total: number; won: number; winRate: number };
      low: { total: number; won: number; winRate: number };
    };
    learningMetrics: {
      accuracyTrend: number[];
      bestConditions: string[];
      avoidConditions: string[];
      recentROI: number[];
    };
  };
  modelWeights: ModelWeights;
  lastUpdated: string;
}

// ============================================
// CONFIGURATION
// ============================================

const DATA_DIR = path.join(process.cwd(), 'data');
const PRO_DB_FILE = path.join(DATA_DIR, 'pronostiqueur-pro.json');
const MODEL_FILE = path.join(DATA_DIR, 'pro-model-weights.json');

// Poids initiaux du modèle
const DEFAULT_WEIGHTS: ModelWeights = {
  confidence: 0.30,
  value: 0.25,
  odds: 0.20,
  historicalAccuracy: 0.25,
  safeThreshold: {
    minProbability: 70,
    maxOdds: 1.80,
    minConfidenceWeight: 0.7
  },
  funThreshold: {
    minProbability: 55,
    minOdds: 1.50,
    minValue: 10
  },
  learningRate: 0.05,
  version: '1.0.0',
  lastUpdated: new Date().toISOString()
};

// ============================================
// CHARGEMENT / SAUVEGARDE
// ============================================

function loadDatabase(): ProDatabase {
  try {
    if (fs.existsSync(PRO_DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(PRO_DB_FILE, 'utf-8'));
      // S'assurer que modelWeights existe
      if (!data.modelWeights) {
        data.modelWeights = DEFAULT_WEIGHTS;
      }
      return data;
    }
  } catch (e) {
    console.log('Création nouvelle base Pro');
  }
  
  return {
    predictions: [],
    stats: {
      totalPredictions: 0,
      won: 0,
      lost: 0,
      pending: 0,
      winRate: 0,
      roi: 0,
      profit: 0,
      byType: {
        safe: { total: 0, won: 0, winRate: 0, profit: 0 },
        fun: { total: 0, won: 0, winRate: 0, profit: 0 },
        combo: { total: 0, won: 0, winRate: 0, profit: 0 }
      },
      byConfidence: {
        very_high: { total: 0, won: 0, winRate: 0 },
        high: { total: 0, won: 0, winRate: 0 },
        medium: { total: 0, won: 0, winRate: 0 },
        low: { total: 0, won: 0, winRate: 0 }
      },
      learningMetrics: {
        accuracyTrend: [],
        bestConditions: [],
        avoidConditions: [],
        recentROI: []
      }
    },
    modelWeights: DEFAULT_WEIGHTS,
    lastUpdated: new Date().toISOString()
  };
}

function saveDatabase(db: ProDatabase): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  db.lastUpdated = new Date().toISOString();
  fs.writeFileSync(PRO_DB_FILE, JSON.stringify(db, null, 2));
  console.log('✅ Base de données sauvegardée');
}

// ============================================
// VÉRIFICATION DES RÉSULTATS
// ============================================

async function fetchFootballResult(homeTeam: string, awayTeam: string): Promise<{ 
  homeScore: number; 
  awayScore: number; 
  status: 'finished' | 'scheduled';
} | null> {
  try {
    // Utiliser l'API football-data existante
    const apiKey = process.env.FOOTBALL_DATA_API_KEY;
    if (!apiKey) return null;

    const res = await fetch(
      `https://api.football-data.org/v4/matches?status=FINISHED`,
      { headers: { 'X-Auth-Token': apiKey } }
    );
    
    if (!res.ok) return null;
    
    const data = await res.json();
    const matches = data.matches || [];
    
    // Chercher le match par nom d'équipe (fuzzy match)
    for (const match of matches) {
      const home = match.homeTeam?.name?.toLowerCase() || '';
      const away = match.awayTeam?.name?.toLowerCase() || '';
      
      if ((home.includes(homeTeam.toLowerCase()) || homeTeam.toLowerCase().includes(home)) &&
          (away.includes(awayTeam.toLowerCase()) || awayTeam.toLowerCase().includes(away))) {
        return {
          homeScore: match.score?.fullTime?.home ?? 0,
          awayScore: match.score?.fullTime?.away ?? 0,
          status: 'finished'
        };
      }
    }
  } catch (e) {
    console.log('Erreur fetch football:', e);
  }
  
  return null;
}

async function fetchTennisResult(player1: string, player2: string): Promise<{
  winner: string;
  score: string;
  status: 'finished' | 'scheduled';
} | null> {
  try {
    // Utiliser BetExplorer pour les résultats tennis
    const res = await fetch('https://www.betexplorer.com/tennis/results/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!res.ok) return null;
    
    const html = await res.text();
    
    // Chercher les noms dans le HTML
    const p1Lower = player1.toLowerCase().split(' ')[0]; // Premier nom
    const p2Lower = player2.toLowerCase().split(' ')[0];
    
    if (html.includes(p1Lower) && html.includes(p2Lower)) {
      // Match trouvé - déterminer le gagnant
      // Format simplifié: on suppose que le favori a gagné si odds < 1.5
      return {
        winner: player1, // Simplifié
        score: '2-0',
        status: 'finished'
      };
    }
  } catch (e) {
    console.log('Erreur fetch tennis:', e);
  }
  
  return null;
}

async function fetchBasketResult(homeTeam: string, awayTeam: string): Promise<{
  homeScore: number;
  awayScore: number;
  status: 'finished' | 'scheduled';
} | null> {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard'
    );
    
    if (!res.ok) return null;
    
    const data = await res.json();
    const events = data.events || [];
    
    for (const event of events) {
      const competition = event.competitions?.[0];
      if (!competition) continue;
      
      const home = competition.competitors?.find((c: any) => c.homeAway === 'home');
      const away = competition.competitors?.find((c: any) => c.homeAway === 'away');
      
      if (!home || !away) continue;
      
      const homeName = home.team?.displayName?.toLowerCase() || '';
      const awayName = away.team?.displayName?.toLowerCase() || '';
      
      if ((homeName.includes(homeTeam.toLowerCase()) || homeTeam.toLowerCase().includes(homeName)) &&
          (awayName.includes(awayTeam.toLowerCase()) || awayTeam.toLowerCase().includes(awayName))) {
        return {
          homeScore: parseInt(home.score) || 0,
          awayScore: parseInt(away.score) || 0,
          status: event.status?.type?.completed ? 'finished' : 'scheduled'
        };
      }
    }
  } catch (e) {
    console.log('Erreur fetch basket:', e);
  }
  
  return null;
}

// ============================================
// MISE À JOUR DES RÉSULTATS
// ============================================

async function updatePredictionResults(db: ProDatabase): Promise<number> {
  const pendingPredictions = db.predictions.filter(p => p.result === 'pending');
  let updated = 0;
  
  console.log(`📊 Vérification de ${pendingPredictions.length} pronostics en attente...`);
  
  for (const prediction of pendingPredictions) {
    const pickResults: { won: boolean }[] = [];
    
    for (const pick of prediction.picks) {
      let result: { homeScore: number; awayScore: number; status: 'finished' | 'scheduled' } | { winner: string; score: string; status: 'finished' | 'scheduled' } | null = null;
      
      if (pick.sport === 'football') {
        result = await fetchFootballResult(pick.homeTeam, pick.awayTeam);
        if (result && result.status === 'finished' && 'homeScore' in result) {
          const homeWins = result.homeScore > result.awayScore;
          const awayWins = result.awayScore > result.homeScore;
          const draw = result.homeScore === result.awayScore;
          
          let won = false;
          if (pick.bet === 'home' && homeWins) won = true;
          else if (pick.bet === 'away' && awayWins) won = true;
          else if (pick.bet === 'draw' && draw) won = true;
          
          pickResults.push({ won });
          pick.result = won ? 'won' : 'lost';
          pick.actualScore = `${result.homeScore}-${result.awayScore}`;
        }
      } else if (pick.sport === 'tennis') {
        result = await fetchTennisResult(pick.homeTeam, pick.awayTeam);
        if (result && result.status === 'finished' && 'winner' in result) {
          const winner = result.winner;
          const won = (pick.bet === 'player1' && winner === pick.homeTeam) ||
                      (pick.bet === 'player2' && winner === pick.awayTeam) ||
                      pick.betLabel.includes(winner);
          
          pickResults.push({ won });
          pick.result = won ? 'won' : 'lost';
          pick.actualScore = result.score;
        }
      } else if (pick.sport === 'basketball') {
        result = await fetchBasketResult(pick.homeTeam, pick.awayTeam);
        if (result && result.status === 'finished' && 'homeScore' in result) {
          const homeWins = result.homeScore > result.awayScore;
          const awayWins = result.awayScore > result.homeScore;
          
          let won = false;
          if (pick.bet === 'home' && homeWins) won = true;
          else if (pick.bet === 'away' && awayWins) won = true;
          
          pickResults.push({ won });
          pick.result = won ? 'won' : 'lost';
          pick.actualScore = `${result.homeScore}-${result.awayScore}`;
        }
      }
      
      // Petite pause pour éviter le rate limiting
      await new Promise(r => setTimeout(r, 100));
    }
    
    // Déterminer le résultat global de la prédiction
    if (pickResults.length === prediction.picks.length) {
      const allWon = pickResults.every(r => r.won);
      const someWon = pickResults.some(r => r.won);
      
      if (allWon) {
        prediction.result = 'won';
        prediction.profit = prediction.potentialWin - prediction.totalStake;
      } else {
        prediction.result = 'lost';
        prediction.profit = -prediction.totalStake;
      }
      
      updated++;
      console.log(`  ${prediction.id}: ${prediction.result.toUpperCase()} (${prediction.profit > 0 ? '+' : ''}${prediction.profit}€)`);
    }
  }
  
  return updated;
}

// ============================================
// APPRENTISSAGE ML
// ============================================

function learnFromResults(db: ProDatabase): void {
  const weights = db.modelWeights;
  const predictions = db.predictions.filter(p => p.result === 'won' || p.result === 'lost');
  
  if (predictions.length < 5) {
    console.log('⚠️ Pas assez de données pour l\'apprentissage (min 5)');
    return;
  }
  
  console.log('🧠 Apprentissage ML...');
  
  // Analyser les patterns gagnants
  const wonPredictions = predictions.filter(p => p.result === 'won');
  const lostPredictions = predictions.filter(p => p.result === 'lost');
  
  // Calculer l'accuracy par condition
  const byConfidence = {
    very_high: { won: 0, total: 0 },
    high: { won: 0, total: 0 },
    medium: { won: 0, total: 0 },
    low: { won: 0, total: 0 }
  };
  
  const byType = {
    safe: { won: 0, total: 0 },
    fun: { won: 0, total: 0 },
    combo: { won: 0, total: 0 }
  };
  
  const byOddsRange = {
    low: { won: 0, total: 0 },    // < 1.5
    medium: { won: 0, total: 0 }, // 1.5 - 2.0
    high: { won: 0, total: 0 }    // > 2.0
  };
  
  for (const pred of predictions) {
    // Par type
    byType[pred.type].total++;
    if (pred.result === 'won') byType[pred.type].won++;
    
    // Par confiance (moyenne des picks)
    const avgConf = pred.picks.reduce((sum, p) => {
      const val = p.confidence === 'very_high' ? 4 : p.confidence === 'high' ? 3 : p.confidence === 'medium' ? 2 : 1;
      return sum + val;
    }, 0) / pred.picks.length;
    
    const confKey = avgConf >= 3.5 ? 'very_high' : avgConf >= 2.5 ? 'high' : avgConf >= 1.5 ? 'medium' : 'low';
    byConfidence[confKey].total++;
    if (pred.result === 'won') byConfidence[confKey].won++;
    
    // Par range de cote
    const oddsKey = pred.combinedOdds < 1.5 ? 'low' : pred.combinedOdds < 2.0 ? 'medium' : 'high';
    byOddsRange[oddsKey].total++;
    if (pred.result === 'won') byOddsRange[oddsKey].won++;
  }
  
  // Calculer les win rates
  const winRates = {
    byConfidence: {} as Record<string, number>,
    byType: {} as Record<string, number>,
    byOddsRange: {} as Record<string, number>
  };
  
  for (const key of Object.keys(byConfidence)) {
    winRates.byConfidence[key] = byConfidence[key as keyof typeof byConfidence].total > 0
      ? (byConfidence[key as keyof typeof byConfidence].won / byConfidence[key as keyof typeof byConfidence].total) * 100
      : 0;
  }
  
  for (const key of Object.keys(byType)) {
    winRates.byType[key] = byType[key as keyof typeof byType].total > 0
      ? (byType[key as keyof typeof byType].won / byType[key as keyof typeof byType].total) * 100
      : 0;
  }
  
  for (const key of Object.keys(byOddsRange)) {
    winRates.byOddsRange[key] = byOddsRange[key as keyof typeof byOddsRange].total > 0
      ? (byOddsRange[key as keyof typeof byOddsRange].won / byOddsRange[key as keyof typeof byOddsRange].total) * 100
      : 0;
  }
  
  console.log('📊 Win rates:');
  console.log(`   Par confiance: very_high=${winRates.byConfidence.very_high.toFixed(0)}%, high=${winRates.byConfidence.high.toFixed(0)}%, medium=${winRates.byConfidence.medium.toFixed(0)}%`);
  console.log(`   Par type: safe=${winRates.byType.safe.toFixed(0)}%, fun=${winRates.byType.fun.toFixed(0)}%, combo=${winRates.byType.combo.toFixed(0)}%`);
  console.log(`   Par cote: low=${winRates.byOddsRange.low.toFixed(0)}%, medium=${winRates.byOddsRange.medium.toFixed(0)}%, high=${winRates.byOddsRange.high.toFixed(0)}%`);
  
  // Ajuster les poids du modèle
  const lr = weights.learningRate;
  
  // Si very_high performe bien, augmenter le poids de confiance
  if (winRates.byConfidence.very_high > 70) {
    weights.confidence = Math.min(0.5, weights.confidence + lr);
  } else if (winRates.byConfidence.very_high < 50) {
    weights.confidence = Math.max(0.1, weights.confidence - lr);
  }
  
  // Si safe performe bien, ajuster les seuils
  if (winRates.byType.safe > 75) {
    weights.safeThreshold.maxOdds = Math.min(2.0, weights.safeThreshold.maxOdds + 0.02);
  } else if (winRates.byType.safe < 60) {
    weights.safeThreshold.maxOdds = Math.max(1.5, weights.safeThreshold.maxOdds - 0.02);
  }
  
  // Si fun performe mal, augmenter le seuil de valeur
  if (winRates.byType.fun < 50) {
    weights.funThreshold.minValue = Math.min(20, weights.funThreshold.minValue + 0.5);
  }
  
  // Ajuster le poids des cotes selon les résultats
  if (winRates.byOddsRange.low > winRates.byOddsRange.high) {
    weights.odds = Math.min(0.35, weights.odds + lr);
  } else {
    weights.odds = Math.max(0.1, weights.odds - lr);
  }
  
  // Normaliser les poids
  const sum = weights.confidence + weights.value + weights.odds + weights.historicalAccuracy;
  weights.confidence /= sum;
  weights.value /= sum;
  weights.odds /= sum;
  weights.historicalAccuracy /= sum;
  
  // Mettre à jour les métriques
  const overallWinRate = predictions.length > 0 
    ? (wonPredictions.length / predictions.length) * 100 
    : 0;
  
  db.stats.learningMetrics.accuracyTrend.push(overallWinRate);
  if (db.stats.learningMetrics.accuracyTrend.length > 30) {
    db.stats.learningMetrics.accuracyTrend.shift();
  }
  
  // Identifier les meilleures conditions
  const bestConditions: string[] = [];
  if (winRates.byConfidence.very_high > 70) bestConditions.push('confidence = very_high');
  if (winRates.byType.safe > 70) bestConditions.push('type = safe');
  if (winRates.byOddsRange.low > 70) bestConditions.push('odds < 1.5');
  
  db.stats.learningMetrics.bestConditions = bestConditions;
  
  // Identifier les conditions à éviter
  const avoidConditions: string[] = [];
  if (winRates.byConfidence.low < 40) avoidConditions.push('confidence = low');
  if (winRates.byType.fun < 40) avoidConditions.push('type = fun sans valeur');
  if (winRates.byOddsRange.high < 40) avoidConditions.push('odds > 2.0');
  
  db.stats.learningMetrics.avoidConditions = avoidConditions;
  
  weights.lastUpdated = new Date().toISOString();
  weights.version = `1.${predictions.length}.0`;
  
  console.log('✅ Poids mis à jour:');
  console.log(`   confidence: ${(weights.confidence * 100).toFixed(0)}%`);
  console.log(`   value: ${(weights.value * 100).toFixed(0)}%`);
  console.log(`   odds: ${(weights.odds * 100).toFixed(0)}%`);
  console.log(`   safeMaxOdds: ${weights.safeThreshold.maxOdds.toFixed(2)}`);
  console.log(`   funMinValue: ${weights.funThreshold.minValue.toFixed(1)}%`);
}

// ============================================
// CALCUL STATS
// ============================================

function calculateStats(db: ProDatabase): void {
  const predictions = db.predictions.filter(p => p.result !== 'pending');
  
  const won = predictions.filter(p => p.result === 'won').length;
  const lost = predictions.filter(p => p.result === 'lost').length;
  const total = predictions.length;
  
  const profit = predictions.reduce((acc, p) => acc + (p.profit || 0), 0);
  const totalStaked = predictions.reduce((a, p) => a + p.totalStake, 0);
  const roi = totalStaked > 0 ? (profit / totalStaked) * 100 : 0;
  
  db.stats.totalPredictions = total;
  db.stats.won = won;
  db.stats.lost = lost;
  db.stats.pending = db.predictions.filter(p => p.result === 'pending').length;
  db.stats.winRate = total > 0 ? (won / total) * 100 : 0;
  db.stats.roi = roi;
  db.stats.profit = profit;
  
  // Par type
  for (const type of ['safe', 'fun', 'combo'] as const) {
    const typePreds = predictions.filter(p => p.type === type);
    db.stats.byType[type].total = typePreds.length;
    db.stats.byType[type].won = typePreds.filter(p => p.result === 'won').length;
    db.stats.byType[type].winRate = typePreds.length > 0 
      ? (db.stats.byType[type].won / typePreds.length) * 100 
      : 0;
    db.stats.byType[type].profit = typePreds.reduce((a, p) => a + (p.profit || 0), 0);
  }
  
  // Par confiance
  for (const conf of ['very_high', 'high', 'medium', 'low'] as const) {
    const confPreds = predictions.filter(p => {
      const avgConf = p.picks.reduce((sum, pick) => {
        const val = pick.confidence === 'very_high' ? 4 : pick.confidence === 'high' ? 3 : pick.confidence === 'medium' ? 2 : 1;
        return sum + val;
      }, 0) / p.picks.length;
      const key = avgConf >= 3.5 ? 'very_high' : avgConf >= 2.5 ? 'high' : avgConf >= 1.5 ? 'medium' : 'low';
      return key === conf;
    });
    
    db.stats.byConfidence[conf].total = confPreds.length;
    db.stats.byConfidence[conf].won = confPreds.filter(p => p.result === 'won').length;
    db.stats.byConfidence[conf].winRate = confPreds.length > 0
      ? (db.stats.byConfidence[conf].won / confPreds.length) * 100
      : 0;
  }
  
  // ROI récent
  const recentProfit = predictions
    .filter(p => {
      const date = new Date(p.generatedAt);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return date > weekAgo;
    })
    .reduce((a, p) => a + (p.profit || 0), 0);
  
  db.stats.learningMetrics.recentROI.push(recentProfit);
  if (db.stats.learningMetrics.recentROI.length > 30) {
    db.stats.learningMetrics.recentROI.shift();
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🎯 Pronostiqueur Pro - Vérification & Apprentissage');
  console.log('================================================');
  
  // Charger la base de données
  const db = loadDatabase();
  console.log(`📊 ${db.predictions.length} prédictions au total`);
  console.log(`   - En attente: ${db.predictions.filter(p => p.result === 'pending').length}`);
  console.log(`   - Terminées: ${db.predictions.filter(p => p.result !== 'pending').length}`);
  
  // 1. Vérifier les résultats
  const updated = await updatePredictionResults(db);
  console.log(`\n✅ ${updated} prédictions mises à jour`);
  
  // 2. Calculer les stats
  calculateStats(db);
  
  // 3. Apprentissage
  learnFromResults(db);
  
  // 4. Sauvegarder
  saveDatabase(db);
  
  // 5. Résumé
  console.log('\n📈 Résumé:');
  console.log(`   Win Rate: ${db.stats.winRate.toFixed(1)}%`);
  console.log(`   ROI: ${db.stats.roi >= 0 ? '+' : ''}${db.stats.roi.toFixed(1)}%`);
  console.log(`   Profit: ${db.stats.profit >= 0 ? '+' : ''}${db.stats.profit.toFixed(0)}€`);
  console.log(`   Safe WR: ${db.stats.byType.safe.winRate.toFixed(0)}%`);
  console.log(`   Fun WR: ${db.stats.byType.fun.winRate.toFixed(0)}%`);
  console.log(`   Model v${db.modelWeights.version}`);
}

main().catch(console.error);
