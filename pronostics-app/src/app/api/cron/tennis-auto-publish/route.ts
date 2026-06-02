/**
 * CRON Tennis Auto Publish - Endpoint unifie pour le systeme tennis
 * 
 * FONCTIONNALITES:
 * 1. Recuperation donnees Jeff Sackmann (classements ATP/WTA 2026)
 * 2. Generation predictions avec le modele optimise
 * 3. Publication automatique sur Telegram
 * 4. Verification resultats et auto-apprentissage
 * 5. Backtesting sur donnees historiques
 * 
 * APPEL:
 * - GET /api/cron/tennis-auto-publish?secret=XXX&action=[daily|valuebets|backtest|learn]
 * - Header: Authorization: Bearer XXX
 * 
 * CRON JOBS RECOMMANDES:
 * - 6h00 UTC: daily (publication quotidienne)
 * - 10h00 UTC: valuebets (alertes value bets)
 * - 12h00 UTC: learn (auto-apprentissage)
 * - Dimanche 8h00 UTC: backtest (rapport hebdomadaire)
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  fetchATPRankings, 
  fetchWTARankings, 
  fetchATPMatches2026,
  getAllTennisData,
  PlayerWithRanking,
  ProcessedMatch 
} from '@/lib/tennis-jeff-sackmann-service';
import { 
  publishTopPredictions, 
  publishValueBetAlert,
  publishDailySummary,
  publishWeeklyReport 
} from '@/lib/tennis-telegram-publisher';
import {
  recordPrediction,
  verifyResult,
  getPerformanceReport,
  getLearnedWeights,
  PredictionRecord
} from '@/lib/tennis-auto-learning';
import { runBacktest } from '@/lib/tennis-backtesting';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// CONFIGURATION
// ============================================

const DATA_DIR = path.join(process.cwd(), 'data');
const PREDICTIONS_FILE = path.join(DATA_DIR, 'tennis-predictions.json');
const LAST_RUN_FILE = path.join(DATA_DIR, 'tennis-cron-last-run.json');

const CRON_SECRET = process.env.CRON_SECRET || 'tennis-ml-2026';

// Seuils de confiance stricts
const CONFIDENCE_THRESHOLDS = {
  very_high: 80,  // 80%+ pour very_high
  high: 70,       // 70%+ pour high
  medium: 60,     // 60%+ pour medium
};

// ============================================
// INTERFACES
// ============================================

interface TennisPredictionOutput {
  matchId: string;
  player1: string;
  player2: string;
  tournament: string;
  surface: string;
  category: 'atp' | 'wta' | 'challenger' | 'itf';
  odds1: number;
  odds2: number;
  prediction: {
    winner: 'player1' | 'player2';
    winProbability: number;
    confidence: 'very_high' | 'high' | 'medium' | 'low';
    riskPercentage: number;
  };
  betting: {
    recommendedBet: boolean;
    kellyStake: number;
    winnerOdds: number;
    expectedValue: number;
  };
  analysis: {
    rankingAdvantage: string;
    surfaceAdvantage: string;
    formAdvantage: string;
    h2hAdvantage: string;
    oddsValue: string;
  };
  keyFactors: string[];
  timestamp: string;
}

interface CronResult {
  success: boolean;
  action: string;
  message: string;
  details?: any;
  duration: number;
  timestamp: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const urlSecret = new URL(request.url).searchParams.get('secret');
  
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;
  if (urlSecret === CRON_SECRET) return true;
  
  return false;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function savePredictions(predictions: TennisPredictionOutput[]): void {
  ensureDataDir();
  fs.writeFileSync(PREDICTIONS_FILE, JSON.stringify({
    predictions,
    lastUpdated: new Date().toISOString(),
    total: predictions.length,
  }, null, 2));
}

function loadPredictions(): TennisPredictionOutput[] {
  try {
    if (fs.existsSync(PREDICTIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf-8'));
      return data.predictions || [];
    }
  } catch (error) {
    console.error('Error loading predictions:', error);
  }
  return [];
}

function saveLastRun(result: CronResult): void {
  ensureDataDir();
  fs.writeFileSync(LAST_RUN_FILE, JSON.stringify(result, null, 2));
}

// ============================================
// PREDICTION ENGINE
// ============================================

function calculateWinProbability(
  p1Rank: number, 
  p2Rank: number, 
  surface: string,
  p1Form?: { wins: number; losses: number },
  weights?: { ranking: number; surface: number; form: number; h2h: number; odds: number }
): number {
  const w = weights || getLearnedWeights();
  
  // Score base sur le classement
  const rankingDiff = p2Rank - p1Rank;
  const rankingScore = Math.tanh(rankingDiff / 50) * 100;
  
  // Bonus surface (simule - dans un vrai systeme on utiliserait les stats reelles)
  const surfaceScore = (Math.random() - 0.5) * 10;
  
  // Score total
  const totalScore = rankingScore * w.ranking + surfaceScore * w.surface;
  
  // Convertir en probabilite
  const rawProb = 1 / (1 + Math.exp(-totalScore / 30));
  
  return Math.min(0.95, Math.max(0.05, rawProb));
}

function determineConfidence(probability: number): 'very_high' | 'high' | 'medium' | 'low' {
  const pct = probability * 100;
  
  if (pct >= CONFIDENCE_THRESHOLDS.very_high) return 'very_high';
  if (pct >= CONFIDENCE_THRESHOLDS.high) return 'high';
  if (pct >= CONFIDENCE_THRESHOLDS.medium) return 'medium';
  return 'low';
}

function generatePredictions(
  atpRankings: PlayerWithRanking[],
  wtaRankings: PlayerWithRanking[],
  atpMatches: ProcessedMatch[]
): TennisPredictionOutput[] {
  const predictions: TennisPredictionOutput[] = [];
  const weights = getLearnedWeights();
  
  // Generer des predictions pour les matchs recents/upcoming
  // Dans un vrai systeme, on recupererait les matchs a venir depuis une API
  
  // Pour l'instant, on simule base sur les donnees historiques
  const recentMatches = atpMatches
    .filter(m => m.winnerRank < 100 && m.loserRank < 100)
    .slice(0, 20);
  
  for (const match of recentMatches) {
    // Trouver les infos des joueurs
    const winnerInfo = atpRankings.find(p => p.name === match.winner);
    const loserInfo = atpRankings.find(p => p.name === match.loser);
    
    if (!winnerInfo || !loserInfo) continue;
    
    // Simuler des cotes basees sur le classement
    const rankDiff = loserInfo.ranking - winnerInfo.ranking;
    const probImplied = 0.5 + Math.tanh(rankDiff / 50) * 0.35;
    const odds1 = Math.round((1 / probImplied) * 100) / 100;
    const odds2 = Math.round((1 / (1 - probImplied)) * 100) / 100;
    
    // Calculer la probabilite avec notre modele
    const winProb = calculateWinProbability(
      winnerInfo.ranking, 
      loserInfo.ranking, 
      match.surface,
      undefined,
      weights
    );
    
    const confidence = determineConfidence(winProb);
    const predicted = winProb >= 0.5 ? 'player1' : 'player2';
    const displayProb = winProb >= 0.5 ? winProb : 1 - winProb;
    
    // Calculer le value bet
    const winnerOdds = predicted === 'player1' ? odds1 : odds2;
    const ev = (displayProb * winnerOdds) - 1;
    const kellyStake = Math.max(0, Math.min(5, (displayProb * (winnerOdds - 1) - (1 - displayProb)) / (winnerOdds - 1) * 100 * 0.25));
    
    const recommendedBet = 
      confidence === 'very_high' && 
      ev > 0.10 && 
      kellyStake >= 2;
    
    predictions.push({
      matchId: match.id,
      player1: match.winner,
      player2: match.loser,
      tournament: match.tournament,
      surface: match.surface,
      category: 'atp',
      odds1,
      odds2,
      prediction: {
        winner: predicted,
        winProbability: Math.round(displayProb * 100),
        confidence,
        riskPercentage: Math.round((1 - displayProb) * 100),
      },
      betting: {
        recommendedBet,
        kellyStake: Math.round(kellyStake * 10) / 10,
        winnerOdds,
        expectedValue: Math.round(ev * 100),
      },
      analysis: {
        rankingAdvantage: rankDiff > 20 ? match.winner : rankDiff < -20 ? match.loser : 'Equilibre',
        surfaceAdvantage: `Performance sur ${match.surface}`,
        formAdvantage: 'Donnees forme limitees',
        h2hAdvantage: 'H2H non disponible',
        oddsValue: ev > 0.10 ? 'Value bet detecte' : 'Cotes equilibrees',
      },
      keyFactors: [
        `Ecart classement: ${Math.abs(rankDiff)} places`,
        `Surface: ${match.surface}`,
        `Tournoi: ${match.level}`,
      ],
      timestamp: new Date().toISOString(),
    });
  }
  
  return predictions;
}

// ============================================
// CRON HANDLERS
// ============================================

async function handleDailyPublish(): Promise<CronResult> {
  const startTime = Date.now();
  console.log('\n🎾 DAILY TENNIS PUBLISH -', new Date().toISOString());
  console.log('='.repeat(50));
  
  try {
    // 1. Recuperer les donnees
    console.log('📊 Fetching tennis data...');
    const { atpRankings, wtaRankings, atpMatches } = await getAllTennisData();
    
    // 2. Generer les predictions
    console.log('🎯 Generating predictions...');
    const predictions = generatePredictions(atpRankings, wtaRankings, atpMatches);
    
    // 3. Sauvegarder
    savePredictions(predictions);
    console.log(`✅ ${predictions.length} predictions saved`);
    
    // 4. Publier sur Telegram
    console.log('📤 Publishing to Telegram...');
    const published = await publishTopPredictions(5);
    
    // 5. Enregistrer les predictions pour l'auto-apprentissage
    for (const pred of predictions.slice(0, 10)) {
      recordPrediction({
        player1: pred.player1,
        player2: pred.player2,
        tournament: pred.tournament,
        surface: pred.surface,
        category: pred.category,
        predictedWinner: pred.prediction.winner,
        winProbability: pred.prediction.winProbability,
        confidence: pred.prediction.confidence,
        recommendedBet: pred.betting.recommendedBet,
        kellyStake: pred.betting.kellyStake,
        odds1: pred.odds1,
        odds2: pred.odds2,
        factors: {
          rankingDiff: 0, // A calculer
          surfaceAdvantage: pred.analysis.surfaceAdvantage,
          formAdvantage: pred.analysis.formAdvantage,
          h2hExists: false,
          oddsImpliedProb: Math.round(100 / pred.betting.winnerOdds),
        },
      });
    }
    
    const duration = Date.now() - startTime;
    
    const result: CronResult = {
      success: true,
      action: 'daily',
      message: `Published ${published} messages for ${predictions.length} predictions`,
      details: {
        atpRankings: atpRankings.length,
        wtaRankings: wtaRankings.length,
        atpMatches: atpMatches.length,
        predictions: predictions.length,
        published,
      },
      duration,
      timestamp: new Date().toISOString(),
    };
    
    saveLastRun(result);
    return result;
    
  } catch (error: any) {
    const result: CronResult = {
      success: false,
      action: 'daily',
      message: `Error: ${error.message}`,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
    saveLastRun(result);
    return result;
  }
}

async function handleValueBets(): Promise<CronResult> {
  const startTime = Date.now();
  console.log('\n💰 CHECKING VALUE BETS -', new Date().toISOString());
  
  try {
    const predictions = loadPredictions();
    
    const valueBets = predictions.filter(
      p => p.betting.recommendedBet && p.betting.expectedValue >= 10
    );
    
    let alerts = 0;
    for (const pred of valueBets.slice(0, 3)) {
      const success = await publishValueBetAlert(pred);
      if (success) alerts++;
      await new Promise(r => setTimeout(r, 500));
    }
    
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      action: 'valuebets',
      message: `Sent ${alerts} value bet alerts`,
      details: { valueBetsFound: valueBets.length, alertsSent: alerts },
      duration,
      timestamp: new Date().toISOString(),
    };
    
  } catch (error: any) {
    return {
      success: false,
      action: 'valuebets',
      message: `Error: ${error.message}`,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

async function handleBacktest(): Promise<CronResult> {
  const startTime = Date.now();
  console.log('\n📊 RUNNING BACKTEST -', new Date().toISOString());
  
  try {
    const results = await runBacktest([2025, 2026], 1000);
    
    // Publier le rapport hebdomadaire
    await publishWeeklyReport({
      totalPredictions: results.totalMatches,
      correctPredictions: results.correctPredictions,
      accuracy: results.accuracy,
      roi: results.bankrollSimulation.roi,
      byConfidence: results.byConfidence,
    });
    
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      action: 'backtest',
      message: `Backtest complete: ${results.accuracy.toFixed(1)}% accuracy`,
      details: {
        totalMatches: results.totalMatches,
        accuracy: results.accuracy,
        roi: results.bankrollSimulation.roi,
        recommendations: results.recommendations,
      },
      duration,
      timestamp: new Date().toISOString(),
    };
    
  } catch (error: any) {
    return {
      success: false,
      action: 'backtest',
      message: `Error: ${error.message}`,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

async function handleLearn(): Promise<CronResult> {
  const startTime = Date.now();
  console.log('\n🧠 AUTO-LEARNING -', new Date().toISOString());
  
  try {
    const report = getPerformanceReport();
    
    console.log(`\n📊 Performance Report:`);
    console.log(`  Summary: ${report.summary}`);
    console.log(`  Recommendations:`);
    for (const rec of report.recommendations) {
      console.log(`    - ${rec}`);
    }
    
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      action: 'learn',
      message: 'Auto-learning analysis complete',
      details: {
        summary: report.summary,
        recommendations: report.recommendations,
        metrics: {
          totalPredictions: report.metrics.totalPredictions,
          verifiedPredictions: report.metrics.verifiedPredictions,
          overallAccuracy: report.metrics.overallAccuracy,
          currentWeights: report.metrics.modelWeights,
        },
      },
      duration,
      timestamp: new Date().toISOString(),
    };
    
  } catch (error: any) {
    return {
      success: false,
      action: 'learn',
      message: `Error: ${error.message}`,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

// ============================================
// MAIN HANDLER
// ============================================

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  // Verifier l'authentification
  if (!verifyAuth(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Invalid or missing secret' },
      { status: 401 }
    );
  }
  
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'daily';
  
  console.log(`\n🎾 TENNIS CRON: ${action.toUpperCase()}`);
  
  let result: CronResult;
  
  switch (action) {
    case 'daily':
      result = await handleDailyPublish();
      break;
    
    case 'valuebets':
      result = await handleValueBets();
      break;
    
    case 'backtest':
      result = await handleBacktest();
      break;
    
    case 'learn':
      result = await handleLearn();
      break;
    
    case 'status':
      // Retourner le statut du systeme
      const predictions = loadPredictions();
      const report = getPerformanceReport();
      result = {
        success: true,
        action: 'status',
        message: 'System status',
        details: {
          predictionsCount: predictions.length,
          highConfidenceCount: predictions.filter(p => 
            p.prediction.confidence === 'very_high' || p.prediction.confidence === 'high'
          ).length,
          performance: report.summary,
          lastUpdated: predictions.length > 0 ? predictions[0].timestamp : null,
        },
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
      break;
    
    default:
      return NextResponse.json(
        { 
          error: 'Invalid action', 
          message: 'Use: daily, valuebets, backtest, learn, status',
          availableActions: ['daily', 'valuebets', 'backtest', 'learn', 'status'],
        },
        { status: 400 }
      );
  }
  
  return NextResponse.json(result);
}

// Support POST pour les webhooks
export async function POST(request: NextRequest) {
  return GET(request);
}
