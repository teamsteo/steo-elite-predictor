import { NextResponse } from 'next/server';

/**
 * API Tennis - Prédictions ML avancées avec système Enhanced
 *
 * Utilise le nouveau système avec:
 * - Facteur d'importance des tournois (Grand Chelem, Masters, etc.)
 * - Classements réels ATP/WTA
 * - Protection anti-ban pour le scraping
 * - 8 facteurs ML au lieu de 5
 */

// Import du système enhanced
import { 
  collectMatches, 
  getTournamentImportanceFactor,
  TournamentTier,
  Surface,
  Category
} from '../../../lib/tennis-enhanced/smart-collector';
import { predictMatch } from '../../../lib/tennis-enhanced/enhanced-predictor';
import { 
  savePrediction, 
  loadMetrics, 
  loadPredictions as loadValidationPredictions 
} from '../../../lib/tennis-enhanced/validation-system';
import { fetchATPRankings, fetchWTARankings } from '../../../lib/tennis-enhanced/external-sources';

// ============================================
// INTERFACES
// ============================================

interface TennisPrediction {
  matchId: string;
  player1: string;
  player2: string;
  tournament: string;
  tournamentTier: string;
  tournamentImportance: number;
  surface: string;
  round: string;
  date: string;
  odds1: number;
  odds2: number;
  category: string;
  prediction: {
    winner: 'player1' | 'player2';
    winnerName: string;
    winProbability: number;
    confidence: 'very_high' | 'high' | 'medium' | 'low';
    riskPercentage: number;
  };
  betting: {
    recommendedBet: boolean;
    kellyStake: number;
    winnerOdds: number;
    expectedValue: number;
    valueRating: string;
  };
  analysis: string;
  keyFactors: string[];
  warnings: string[];
  modelVersion: string;
}

// ============================================
// CACHE EN MÉMOIRE (TTL 5 minutes)
// ============================================

let cachedPredictions: TennisPrediction[] = [];
let lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================
// GET - Récupérer les prédictions
// ============================================

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';
    const forceRefresh = searchParams.get('refresh') === 'true';
    
    console.log('🎾 API Tennis Enhanced: Requête reçue');
    
    // Vérifier le cache
    const now = Date.now();
    if (!forceRefresh && cachedPredictions.length > 0 && (now - lastFetchTime) < CACHE_TTL) {
      console.log('📦 Retour depuis le cache');
      return NextResponse.json({
        predictions: filterPredictions(cachedPredictions, filter),
        stats: calculateStats(cachedPredictions),
        generatedAt: new Date(lastFetchTime).toISOString(),
        source: 'cache',
        modelInfo: getModelInfo(),
      });
    }
    
    // Collecter les matchs avec protection anti-ban
    console.log('📡 Collecte des matchs avec protection anti-ban...');
    const matches = await collectMatches();
    
    if (matches.length === 0) {
      console.log('⚠️ Aucun match collecté, essai classements ATP/WTA...');
      
      // Tenter de récupérer au moins les classements
      const [atpRankings, wtaRankings] = await Promise.all([
        fetchATPRankings(20).catch(() => []),
        fetchWTARankings(20).catch(() => []),
      ]);
      
      return NextResponse.json({
        predictions: [],
        stats: { total: 0 },
        generatedAt: new Date().toISOString(),
        source: 'empty',
        message: 'Aucun match disponible actuellement. Les tournois actifs apparaîtront automatiquement.',
        rankings: {
          atp: atpRankings.slice(0, 10),
          wta: wtaRankings.slice(0, 10),
        },
        modelInfo: getModelInfo(),
      });
    }
    
    console.log(`✅ ${matches.length} matchs collectés`);
    
    // Générer les prédictions améliorées
    const predictions: TennisPrediction[] = [];
    
    for (const match of matches) {
      try {
        const prediction = predictMatch(match);
        
        predictions.push({
          matchId: prediction.matchId,
          player1: prediction.player1,
          player2: prediction.player2,
          tournament: prediction.tournament,
          tournamentTier: prediction.tournamentTier,
          tournamentImportance: getTournamentImportanceFactor(prediction.tournamentTier),
          surface: prediction.surface,
          round: match.round,
          date: match.date.toISOString(),
          odds1: match.odds1,
          odds2: match.odds2,
          category: match.category,
          prediction: {
            winner: prediction.predictedWinner,
            winnerName: prediction.predictedWinner === 'player1' ? prediction.player1 : prediction.player2,
            winProbability: prediction.winProbability,
            confidence: prediction.confidence,
            riskPercentage: prediction.riskPercentage,
          },
          betting: {
            recommendedBet: prediction.betting.recommendedBet,
            kellyStake: prediction.betting.kellyStake,
            winnerOdds: prediction.betting.winnerOdds,
            expectedValue: prediction.betting.expectedValue,
            valueRating: prediction.betting.valueRating,
          },
          analysis: prediction.analysis,
          keyFactors: prediction.keyInsights,
          warnings: prediction.warnings,
          modelVersion: prediction.modelVersion,
        });
      } catch (error) {
        console.error(`Erreur prédiction match ${match.id}:`, error);
      }
    }
    
    // Filtrer les matchs passés
    const now_date = new Date();
    const filtered_by_date = predictions.filter(p => {
      const matchDate = new Date(p.date);
      // Garder les matchs futurs ou du jour même
      return matchDate >= now_date || matchDate.toDateString() === now_date.toDateString();
    });
    
    // Mettre en cache
    cachedPredictions = filtered_by_date;
    lastFetchTime = now;
    
    console.log(`📊 ${filtered_by_date.length} prédictions générées`);
    
    // Calculer les stats
    const stats = calculateStats(filtered_by_date);
    
    // Charger les métriques de performance
    const performanceMetrics = loadMetrics();
    
    return NextResponse.json({
      predictions: filterPredictions(filtered_by_date, filter),
      stats,
      performance: performanceMetrics,
      generatedAt: new Date().toISOString(),
      source: 'enhanced',
      modelInfo: getModelInfo(),
    });
    
  } catch (error) {
    console.error('❌ Erreur API Tennis:', error);
    return NextResponse.json(
      { error: 'Erreur serveur', predictions: [], stats: null },
      { status: 500 }
    );
  }
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

function filterPredictions(predictions: TennisPrediction[], filter: string): TennisPrediction[] {
  let filtered = predictions;
  
  switch (filter) {
    case 'atp':
      filtered = predictions.filter(p => p.category === 'atp');
      break;
    case 'wta':
      filtered = predictions.filter(p => p.category === 'wta');
      break;
    case 'challenger':
      filtered = predictions.filter(p => p.category === 'challenger');
      break;
    case 'recommended':
      filtered = predictions.filter(p => p.betting.recommendedBet);
      break;
    case 'high_confidence':
      filtered = predictions.filter(p => 
        p.prediction.confidence === 'very_high' || p.prediction.confidence === 'high'
      );
      break;
    case 'major':
      // Tournois majeurs uniquement
      filtered = predictions.filter(p => 
        ['grand_slam', 'masters_1000', 'wta_1000'].includes(p.tournamentTier)
      );
      break;
    case 'safe':
      // Safe uniquement (risque <= 30%)
      filtered = predictions.filter(p => p.prediction.riskPercentage <= 30);
      break;
  }
  
  // Trier par importance puis par probabilité
  return filtered.sort((a, b) => {
    if (b.tournamentImportance !== a.tournamentImportance) {
      return b.tournamentImportance - a.tournamentImportance;
    }
    return b.prediction.winProbability - a.prediction.winProbability;
  });
}

function calculateStats(predictions: TennisPrediction[]) {
  return {
    total: predictions.length,
    byCategory: {
      atp: predictions.filter(p => p.category === 'atp').length,
      wta: predictions.filter(p => p.category === 'wta').length,
      challenger: predictions.filter(p => p.category === 'challenger').length,
      itf: predictions.filter(p => p.category === 'itf').length,
    },
    byTier: {
      grand_slam: predictions.filter(p => p.tournamentTier === 'grand_slam').length,
      masters_1000: predictions.filter(p => ['masters_1000', 'wta_1000'].includes(p.tournamentTier)).length,
      atp_500: predictions.filter(p => ['atp_500', 'wta_500'].includes(p.tournamentTier)).length,
      atp_250: predictions.filter(p => ['atp_250', 'wta_250'].includes(p.tournamentTier)).length,
      challenger: predictions.filter(p => p.tournamentTier.includes('challenger')).length,
      itf: predictions.filter(p => p.tournamentTier === 'itf').length,
    },
    bySurface: {
      hard: predictions.filter(p => p.surface === 'hard').length,
      clay: predictions.filter(p => p.surface === 'clay').length,
      grass: predictions.filter(p => p.surface === 'grass').length,
      indoor: predictions.filter(p => p.surface === 'indoor').length,
    },
    byConfidence: {
      very_high: predictions.filter(p => p.prediction.confidence === 'very_high').length,
      high: predictions.filter(p => p.prediction.confidence === 'high').length,
      medium: predictions.filter(p => p.prediction.confidence === 'medium').length,
      low: predictions.filter(p => p.prediction.confidence === 'low').length,
    },
    byRisk: {
      safe: predictions.filter(p => p.prediction.riskPercentage <= 30).length,
      moderate: predictions.filter(p => p.prediction.riskPercentage > 30 && p.prediction.riskPercentage <= 50).length,
      risky: predictions.filter(p => p.prediction.riskPercentage > 50).length,
    },
    recommendedBets: predictions.filter(p => p.betting.recommendedBet).length,
    averageProbability: predictions.length > 0
      ? Math.round(predictions.reduce((sum, p) => sum + p.prediction.winProbability, 0) / predictions.length)
      : 0,
  };
}

function getModelInfo() {
  return {
    version: 'tennis-enhanced-v2.0',
    improvements: [
      'Facteur d\'importance des tournois (Grand Chelem 1.25x, Masters 1.15x, etc.)',
      'Classements réels ATP/WTA intégrés',
      'Protection anti-ban pour le scraping (rotation User-Agents, délais aléatoires)',
      '8 facteurs d\'analyse (classement, surface, forme, H2H, cotes, tournoi, fatigue, motivation)',
      'Calibration des probabilités par type de tournoi',
      'Circuit breaker pour éviter les blocages',
    ],
    weights: {
      ranking: '22%',
      surface: '15%',
      form: '12%',
      h2h: '10%',
      odds: '20%',
      tournament: '8%',
      fatigue: '7%',
      motivation: '6%',
    },
    tierMultipliers: {
      grand_slam: '1.25x (plus prévisible)',
      masters_1000: '1.15x',
      wta_1000: '1.12x',
      atp_500: '1.05x',
      atp_250: '1.00x (référence)',
      challenger: '0.70-0.85x',
      itf: '0.60x (moins prévisible)',
    },
    antiBanProtection: {
      userAgents: 'Rotation de 6 User-Agents différents',
      delays: 'Délais aléatoires entre 2-7 secondes',
      circuitBreaker: 'Blocage après 3 échecs, réessai après 5 min',
      cache: 'Cache intelligent avec TTL variable',
    },
  };
}
