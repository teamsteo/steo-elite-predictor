import { NextResponse } from 'next/server';

/**
 * API Tennis Enhanced - Prédictions ML améliorées
 * 
 * Améliorations par rapport à l'ancienne API:
 * 1. Facteur d'importance des tournois
 * 2. Classements réels ATP/WTA
 * 3. Protection anti-ban pour le scraping
 * 4. Système de validation des prédictions
 */

// Import dynamique pour éviter les erreurs côté client
import { collectMatches, getTournamentImportanceFactor } from '../../../lib/tennis-enhanced/smart-collector';
import { predictMatch } from '../../../lib/tennis-enhanced/enhanced-predictor';
import { savePrediction, loadMetrics, loadPredictions, calculateAndSaveMetrics, updatePredictionResult } from '../../../lib/tennis-enhanced/validation-system';

// ============================================
// INTERFACES
// ============================================

interface EnhancedTennisPrediction {
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
    valueRating: 'excellent' | 'good' | 'fair' | 'poor';
  };
  analysis: string;
  keyInsights: string[];
  warnings: string[];
  factors: {
    ranking: { score: number; description: string };
    surface: { score: number; description: string };
    form: { score: number; description: string };
    h2h: { score: number; description: string };
    odds: { score: number; description: string };
    tournament: { score: number; description: string };
    fatigue: { score: number; description: string };
    motivation: { score: number; description: string };
  };
  modelVersion: string;
  generatedAt: string;
}

// ============================================
// GET - Récupérer les prédictions
// ============================================

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';
    const tier = searchParams.get('tier') || null;
    const minProbability = parseInt(searchParams.get('minProb') || '0');
    const maxRisk = parseInt(searchParams.get('maxRisk') || '100');
    
    console.log('🎾 API Tennis Enhanced: Requête reçue');
    
    // 1. Collecter les matchs avec protection anti-ban
    console.log('📡 Collecte des matchs...');
    const matches = await collectMatches();
    
    if (matches.length === 0) {
      return NextResponse.json({
        predictions: [],
        stats: { total: 0 },
        message: 'Aucun match disponible. Réessayez dans quelques minutes.',
        generatedAt: new Date().toISOString(),
      });
    }
    
    console.log(`✅ ${matches.length} matchs collectés`);
    
    // 2. Générer les prédictions améliorées
    const predictions: EnhancedTennisPrediction[] = [];
    
    for (const match of matches) {
      try {
        const prediction = predictMatch(match);
        
        // Sauvegarder pour le tracking
        savePrediction({
          matchId: prediction.matchId,
          player1: prediction.player1,
          player2: prediction.player2,
          tournament: prediction.tournament,
          tournamentTier: prediction.tournamentTier,
          predictedWinner: prediction.predictedWinner,
          winProbability: prediction.winProbability,
          confidence: prediction.confidence,
          riskPercentage: prediction.riskPercentage,
          odds1: match.odds1,
          odds2: match.odds2,
          recommendedBet: prediction.betting.recommendedBet,
          generatedAt: prediction.generatedAt.toISOString(),
        });
        
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
          betting: prediction.betting,
          analysis: prediction.analysis,
          keyInsights: prediction.keyInsights,
          warnings: prediction.warnings,
          factors: prediction.factors,
          modelVersion: prediction.modelVersion,
          generatedAt: prediction.generatedAt.toISOString(),
        });
      } catch (error) {
        console.error(`Erreur prédiction match ${match.id}:`, error);
      }
    }
    
    // 3. Filtrer selon les paramètres
    let filtered = predictions;
    
    // Filtre par catégorie
    if (filter === 'atp') {
      filtered = filtered.filter(p => p.category === 'atp');
    } else if (filter === 'wta') {
      filtered = filtered.filter(p => p.category === 'wta');
    } else if (filter === 'challenger') {
      filtered = filtered.filter(p => p.category === 'challenger');
    } else if (filter === 'recommended') {
      filtered = filtered.filter(p => p.betting.recommendedBet);
    } else if (filter === 'high_confidence') {
      filtered = filtered.filter(p => 
        p.prediction.confidence === 'very_high' || p.prediction.confidence === 'high'
      );
    } else if (filter === 'major') {
      // Nouveau filtre: tournois majeurs uniquement
      filtered = filtered.filter(p => 
        ['grand_slam', 'masters_1000', 'wta_1000'].includes(p.tournamentTier)
      );
    }
    
    // Filtre par tier
    if (tier) {
      filtered = filtered.filter(p => p.tournamentTier === tier);
    }
    
    // Filtre par probabilité minimum
    if (minProbability > 0) {
      filtered = filtered.filter(p => p.prediction.winProbability >= minProbability);
    }
    
    // Filtre par risque maximum
    if (maxRisk < 100) {
      filtered = filtered.filter(p => p.prediction.riskPercentage <= maxRisk);
    }
    
    // Trier par importance du tournoi puis par probabilité
    filtered.sort((a, b) => {
      // D'abord par importance du tournoi
      if (b.tournamentImportance !== a.tournamentImportance) {
        return b.tournamentImportance - a.tournamentImportance;
      }
      // Puis par probabilité
      return b.prediction.winProbability - a.prediction.winProbability;
    });
    
    // 4. Calculer les stats
    const stats = {
      total: filtered.length,
      byCategory: {
        atp: filtered.filter(p => p.category === 'atp').length,
        wta: filtered.filter(p => p.category === 'wta').length,
        challenger: filtered.filter(p => p.category === 'challenger').length,
        itf: filtered.filter(p => p.category === 'itf').length,
      },
      byTier: {
        grand_slam: filtered.filter(p => p.tournamentTier === 'grand_slam').length,
        masters_1000: filtered.filter(p => p.tournamentTier === 'masters_1000' || p.tournamentTier === 'wta_1000').length,
        atp_500: filtered.filter(p => p.tournamentTier === 'atp_500' || p.tournamentTier === 'wta_500').length,
        atp_250: filtered.filter(p => p.tournamentTier === 'atp_250' || p.tournamentTier === 'wta_250').length,
        challenger: filtered.filter(p => p.tournamentTier.includes('challenger')).length,
        itf: filtered.filter(p => p.tournamentTier === 'itf').length,
      },
      byConfidence: {
        very_high: filtered.filter(p => p.prediction.confidence === 'very_high').length,
        high: filtered.filter(p => p.prediction.confidence === 'high').length,
        medium: filtered.filter(p => p.prediction.confidence === 'medium').length,
        low: filtered.filter(p => p.prediction.confidence === 'low').length,
      },
      bySurface: {
        hard: filtered.filter(p => p.surface === 'hard').length,
        clay: filtered.filter(p => p.surface === 'clay').length,
        grass: filtered.filter(p => p.surface === 'grass').length,
        indoor: filtered.filter(p => p.surface === 'indoor').length,
      },
      recommendedBets: filtered.filter(p => p.betting.recommendedBet).length,
      averageProbability: filtered.length > 0
        ? Math.round(filtered.reduce((sum, p) => sum + p.prediction.winProbability, 0) / filtered.length)
        : 0,
    };
    
    // 5. Charger les métriques de performance
    const performanceMetrics = loadMetrics();
    
    // 6. Réponse
    return NextResponse.json({
      predictions: filtered,
      stats,
      performance: performanceMetrics,
      generatedAt: new Date().toISOString(),
      modelInfo: {
        version: 'tennis-enhanced-v2.0',
        improvements: [
          'Facteur d\'importance des tournois (Grand Chelem, Masters 1000, etc.)',
          'Classements réels ATP/WTA intégrés',
          'Protection anti-ban pour le scraping',
          '8 facteurs d\'analyse (classement, surface, forme, H2H, cotes, tournoi, fatigue, motivation)',
          'Calibration des probabilités par type de tournoi',
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
          atp_500: '1.05x',
          atp_250: '1.00x (référence)',
          challenger: '0.70-0.85x',
          itf: '0.60x (moins prévisible)',
        },
      },
    });
    
  } catch (error) {
    console.error('❌ Erreur API Tennis Enhanced:', error);
    return NextResponse.json(
      { error: 'Erreur serveur', predictions: [], stats: null },
      { status: 500 }
    );
  }
}

// ============================================
// POST - Mettre à jour les résultats
// ============================================

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, predictionId, actualWinner } = body;
    
    if (action === 'update_result' && predictionId && actualWinner) {
      // Mettre à jour le résultat d'une prédiction
      const success = updatePredictionResult(predictionId, actualWinner);
      
      if (success) {
        const metrics = calculateAndSaveMetrics();
        return NextResponse.json({
          success: true,
          message: 'Résultat mis à jour',
          metrics,
        });
      } else {
        return NextResponse.json(
          { success: false, message: 'Prédiction non trouvée' },
          { status: 404 }
        );
      }
    }
    
    if (action === 'get_metrics') {
      const metrics = loadMetrics();
      return NextResponse.json({ metrics });
    }
    
    if (action === 'get_history') {
      const limit = body.limit || 50;
      const predictions = loadPredictions(limit);
      return NextResponse.json({ predictions });
    }
    
    return NextResponse.json(
      { success: false, message: 'Action non reconnue' },
      { status: 400 }
    );
    
  } catch (error) {
    console.error('❌ Erreur POST Tennis Enhanced:', error);
    return NextResponse.json(
      { success: false, message: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
