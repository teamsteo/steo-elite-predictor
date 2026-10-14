import { NextResponse } from 'next/server';
import { PredictionStore } from '@/lib/store';

/**
 * GET - Récupérer les prédictions RÉELLES depuis le store
 */
export async function GET() {
  try {
    // Charger les prédictions réelles depuis le store (GitHub)
    const predictions = await PredictionStore.getAllAsync();
    
    // Récupérer les stats détaillées
    const detailedStats = await PredictionStore.getDetailedStatsAsync();
    const storeInfo = await PredictionStore.getInfoAsync();
    
    return NextResponse.json({
      predictions,
      stats: detailedStats,
      storeInfo,
      source: 'github-store',
      lastUpdate: storeInfo.lastUpdate
    });
  } catch (error) {
    console.error('Erreur récupération prédictions:', error);
    return NextResponse.json({
      predictions: [],
      stats: null,
      error: 'Erreur de chargement'
    });
  }
}

/**
 * POST - Ajouter une prédiction au store
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const prediction = await PredictionStore.addAsync({
      matchId: body.matchId,
      homeTeam: body.homeTeam,
      awayTeam: body.awayTeam,
      league: body.league,
      sport: body.sport || 'football',
      matchDate: body.matchDate,
      oddsHome: body.oddsHome,
      oddsDraw: body.oddsDraw || null,
      oddsAway: body.oddsAway,
      predictedResult: body.predictedResult,
      predictedGoals: body.predictedGoals,
      confidence: body.confidence || 'medium',
      riskPercentage: body.riskPercentage || 50
    });

    return NextResponse.json({
      success: true,
      prediction,
      source: 'github-store'
    });
  } catch (error) {
    console.error('Erreur ajout prédiction:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Invalid request' 
    }, { status: 400 });
  }
}

/**
 * DELETE - Nettoyer les anciennes prédictions
 */
export async function DELETE() {
  try {
    const removed = await PredictionStore.cleanupAsync();
    return NextResponse.json({
      success: true,
      removed,
      message: `${removed} anciennes prédictions supprimées`
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Erreur de nettoyage'
    }, { status: 500 });
  }
}
