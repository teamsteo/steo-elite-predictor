import { NextResponse } from 'next/server';

/**
 * API Tennis - Prédictions ML OPTIMISÉES
 *
 * 🎯 OPTIMISATIONS v3.0:
 * 1. Cache intelligent The Odds API (économie de crédits)
 * 2. Classements ATP/WTA en temps réel (Jeff Sackmann - GRATUIT)
 * 3. Seuils de confiance CONSERVATEURS (réduit les faux positifs)
 * 
 * 📊 PROBLÈME CORRIGÉ:
 * - Avant: 1 victoire sur 3 pour des matchs "90% fiables"
 * - Solution: Données live + validation croisée + seuils stricts
 */

// Import du système optimisé
import { 
  collectMatches, 
  getTournamentImportanceFactor,
  TournamentTier,
  Surface,
  Category
} from '../../../lib/tennis-enhanced/smart-collector';
import { predictMatchOptimized, OptimizedPrediction } from '../../../lib/tennis-enhanced/optimized-predictor';
import { predictMatch } from '../../../lib/tennis-enhanced/enhanced-predictor'; // Fallback
import { 
  savePrediction, 
  loadMetrics, 
  loadPredictions as loadValidationPredictions 
} from '../../../lib/tennis-enhanced/validation-system';
import { fetchATPRankings, fetchWTARankings } from '../../../lib/tennis-enhanced/external-sources';
import { getQuotaStatus } from '../../../lib/oddsQuotaManager';

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
  crossValidation?: {
    status: 'confirmed' | 'neutral' | 'divergence' | 'excluded';
    bookmakerFavorite: 'player1' | 'player2';
    ourFavorite: 'player1' | 'player2';
    probabilityGap: number;
  };
  analysis: string;
  keyFactors: string[];
  warnings: string[];
  modelVersion: string;
  dataSource?: 'live' | 'cached' | 'fallback';
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
    const useOptimized = searchParams.get('optimized') !== 'false'; // Par défaut: optimisé
    
    console.log('🎾 API Tennis Optimized v3.0: Requête reçue');
    
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
        quotaStatus: getQuotaStatus(),
      });
    }
    
    // Collecter les matchs avec protection anti-ban
    console.log('📡 Collecte des matchs...');
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
        quotaStatus: getQuotaStatus(),
      });
    }
    
    console.log(`✅ ${matches.length} matchs collectés`);
    
    // Générer les prédictions avec le modèle OPTIMISÉ
    const predictions: TennisPrediction[] = [];
    
    for (const match of matches) {
      try {
        let prediction: TennisPrediction;
        
        if (useOptimized) {
          // Utiliser le prédicteur OPTIMISÉ (avec données live)
          const optimizedPred = await predictMatchOptimized(match);
          
          prediction = {
            matchId: optimizedPred.matchId,
            player1: optimizedPred.player1,
            player2: optimizedPred.player2,
            tournament: optimizedPred.tournament,
            tournamentTier: optimizedPred.tournamentTier,
            tournamentImportance: getTournamentImportanceFactor(optimizedPred.tournamentTier),
            surface: optimizedPred.surface,
            round: match.round,
            date: match.date.toISOString(),
            odds1: match.odds1,
            odds2: match.odds2,
            category: match.category,
            prediction: {
              winner: optimizedPred.predictedWinner,
              winnerName: optimizedPred.predictedWinner === 'player1' ? optimizedPred.player1 : optimizedPred.player2,
              winProbability: optimizedPred.winProbability,
              confidence: optimizedPred.confidence,
              riskPercentage: optimizedPred.riskPercentage,
            },
            betting: {
              recommendedBet: optimizedPred.betting.recommendedBet,
              kellyStake: optimizedPred.betting.kellyStake,
              winnerOdds: optimizedPred.betting.winnerOdds,
              expectedValue: optimizedPred.betting.expectedValue,
              valueRating: optimizedPred.betting.valueRating,
            },
            crossValidation: optimizedPred.crossValidation,
            analysis: optimizedPred.analysis,
            keyFactors: optimizedPred.keyInsights,
            warnings: optimizedPred.warnings,
            modelVersion: optimizedPred.modelVersion,
            dataSource: optimizedPred.dataSource,
          };
        } else {
          // Fallback vers l'ancien prédicteur
          const basicPred = predictMatch(match);
          
          prediction = {
            matchId: basicPred.matchId,
            player1: basicPred.player1,
            player2: basicPred.player2,
            tournament: basicPred.tournament,
            tournamentTier: basicPred.tournamentTier,
            tournamentImportance: getTournamentImportanceFactor(basicPred.tournamentTier),
            surface: basicPred.surface,
            round: match.round,
            date: match.date.toISOString(),
            odds1: match.odds1,
            odds2: match.odds2,
            category: match.category,
            prediction: {
              winner: basicPred.predictedWinner,
              winnerName: basicPred.predictedWinner === 'player1' ? basicPred.player1 : basicPred.player2,
              winProbability: basicPred.winProbability,
              confidence: basicPred.confidence,
              riskPercentage: basicPred.riskPercentage,
            },
            betting: {
              recommendedBet: basicPred.betting.recommendedBet,
              kellyStake: basicPred.betting.kellyStake,
              winnerOdds: basicPred.betting.winnerOdds,
              expectedValue: basicPred.betting.expectedValue,
              valueRating: basicPred.betting.valueRating,
            },
            analysis: basicPred.analysis,
            keyFactors: basicPred.keyInsights,
            warnings: basicPred.warnings,
            modelVersion: basicPred.modelVersion,
          };
        }
        
        predictions.push(prediction);
      } catch (error) {
        console.error(`Erreur prédiction match ${match.id}:`, error);
      }
    }
    
    // Filtrer les matchs passés
    const now_date = new Date();
    let filtered_by_date = predictions.filter(p => {
      const matchDate = new Date(p.date);
      return matchDate >= now_date || matchDate.toDateString() === now_date.toDateString();
    });
    
    // 🎯 FILTRE QUALITÉ: Tournois majeurs uniquement
    const HIGH_QUALITY_TIERS = [
      'grand_slam',
      'masters_1000',
      'wta_1000',
      'atp_500',
      'wta_500',
      'atp_250',
      'wta_250',
    ];
    
    const beforeFilter = filtered_by_date.length;
    filtered_by_date = filtered_by_date.filter(p => 
      HIGH_QUALITY_TIERS.includes(p.tournamentTier)
    );
    
    if (beforeFilter !== filtered_by_date.length) {
      console.log(`🎯 Filtre qualité: ${filtered_by_date.length}/${beforeFilter} prédictions gardées`);
    }
    
    // 🚨 FILTRE VALIDATION CROISÉE: Exclure les divergences
    const divergenceFiltered = filtered_by_date.filter(p => 
      !p.crossValidation || p.crossValidation.status !== 'excluded'
    );
    
    if (divergenceFiltered.length !== filtered_by_date.length) {
      console.log(`🚨 Filtre validation: ${divergenceFiltered.length}/${filtered_by_date.length} (divergences exclues)`);
    }
    
    // Mettre en cache
    cachedPredictions = divergenceFiltered;
    lastFetchTime = now;
    
    console.log(`📊 ${divergenceFiltered.length} prédictions générées`);
    
    // Calculer les stats
    const stats = calculateStats(divergenceFiltered);
    
    // Charger les métriques de performance
    const performanceMetrics = loadMetrics();
    
    return NextResponse.json({
      predictions: filterPredictions(divergenceFiltered, filter),
      stats,
      performance: performanceMetrics,
      generatedAt: new Date().toISOString(),
      source: 'optimized',
      modelInfo: getModelInfo(),
      quotaStatus: getQuotaStatus(),
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
    case 'confirmed':
      // Uniquement les prédictions confirmées par les bookmakers
      filtered = predictions.filter(p => 
        p.crossValidation?.status === 'confirmed'
      );
      break;
    case 'major':
      filtered = predictions.filter(p => 
        ['grand_slam', 'masters_1000', 'wta_1000'].includes(p.tournamentTier)
      );
      break;
    case 'safe':
      filtered = predictions.filter(p => p.prediction.riskPercentage <= 30);
      break;
    case 'live':
      // Uniquement les prédictions avec données live
      filtered = predictions.filter(p => p.dataSource === 'live');
      break;
  }
  
  // Trier par confiance puis par importance
  const confidenceOrder = { very_high: 0, high: 1, medium: 2, low: 3 };
  
  return filtered.sort((a, b) => {
    // D'abord par confiance
    const confA = confidenceOrder[a.prediction.confidence] ?? 2;
    const confB = confidenceOrder[b.prediction.confidence] ?? 2;
    if (confA !== confB) return confA - confB;
    
    // Ensuite par importance du tournoi
    if (b.tournamentImportance !== a.tournamentImportance) {
      return b.tournamentImportance - a.tournamentImportance;
    }
    
    // Enfin par probabilité
    return b.prediction.winProbability - a.prediction.winProbability;
  });
}

function calculateStats(predictions: TennisPrediction[]) {
  // Stats validation croisée
  const confirmed = predictions.filter(p => p.crossValidation?.status === 'confirmed').length;
  const neutral = predictions.filter(p => p.crossValidation?.status === 'neutral').length;
  const divergence = predictions.filter(p => p.crossValidation?.status === 'divergence').length;
  
  // Stats source de données
  const live = predictions.filter(p => p.dataSource === 'live').length;
  const cached = predictions.filter(p => p.dataSource === 'cached').length;
  const fallback = predictions.filter(p => p.dataSource === 'fallback').length;
  
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
    byValidation: {
      confirmed,
      neutral,
      divergence,
    },
    byDataSource: {
      live,
      cached,
      fallback,
    },
    recommendedBets: predictions.filter(p => p.betting.recommendedBet).length,
    averageProbability: predictions.length > 0
      ? Math.round(predictions.reduce((sum, p) => sum + p.prediction.winProbability, 0) / predictions.length)
      : 0,
  };
}

function getModelInfo() {
  return {
    version: 'tennis-optimized-v3.0',
    optimizations: [
      '🎯 CACHE INTELLIGENT: 12h pour classements, 2h pour cotes',
      '📊 CLASSEMENTS LIVE: Jeff Sackmann GitHub (GRATUIT, mis à jour chaque semaine)',
      '🔒 SEUILS STRICTS: very_high nécessite 80%+ (vs 70% avant)',
      '✅ VALIDATION CROISÉE: Exclusion automatique des divergences avec bookmakers',
      '💰 ÉCONOMIE API: Budget 5 req/jour = 150/mois max',
    ],
    qualityFilter: {
      enabled: true,
      reason: 'Exclusion des tournois mineurs et des divergences bookmakers',
      includedTiers: ['grand_slam', 'masters_1000', 'wta_1000', 'atp_500', 'wta_500', 'atp_250', 'wta_250'],
      excludedTiers: ['challenger_*', 'itf', 'unknown'],
    },
    confidenceThresholds: {
      very_high: '80%+ (validé par bookmakers)',
      high: '70%+',
      medium: '60%+',
      low: '<60%',
    },
    weights: {
      ranking: '22% (LIVE depuis Jeff Sackmann)',
      surface: '12%',
      form: '15%',
      h2h: '8%',
      odds: '15% (réduit - pas assez fiable seul)',
      tournament: '8%',
      fatigue: '8%',
      motivation: '6%',
      pressure: '6%',
    },
    crossValidation: {
      enabled: true,
      description: 'Compare notre analyse avec les cotes des bookmakers',
      statuses: {
        confirmed: 'Notre analyse et bookmakers sont d\'accord',
        neutral: 'Léger écart entre nos analyses',
        divergence: 'Désaccord significatif - pari exclu',
        excluded: 'Favoris différents - pari automatiquement exclu',
      },
    },
    recommendationCriteria: {
      required: [
        'crossValidation = confirmed',
        'confidence = very_high',
        'winProbability >= 75%',
        'kellyStake >= 2.0',
        'expectedValue >= 10%',
        'tier NOT IN (itf, challenger)',
      ],
    },
  };
}
