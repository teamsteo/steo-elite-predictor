import { NextResponse } from 'next/server';
import { PredictionStore } from '@/lib/store';

/**
 * POST - Sauvegarder les pronostics du jour pour les stats
 * Appelé automatiquement par l'application après génération des pronostics
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { predictions, sport } = body;

    if (!predictions || !Array.isArray(predictions)) {
      return NextResponse.json({
        success: false,
        error: 'Predictions array required'
      }, { status: 400 });
    }

    // Filtrer les pronostics d'aujourd'hui
    const today = new Date().toISOString().split('T')[0];
    const todayPredictions = predictions.filter((p: any) => {
      const matchDate = p.matchDate || p.date || '';
      return matchDate.startsWith(today);
    });

    if (todayPredictions.length === 0) {
      return NextResponse.json({
        success: true,
        saved: 0,
        message: 'Aucun pronostic pour aujourd\'hui à sauvegarder'
      });
    }

    // Formater pour le store
    const predictionsToSave = todayPredictions.map((p: any) => ({
      matchId: p.matchId || `${sport}_${today}_${Math.random().toString(36).substr(2, 9)}`,
      homeTeam: p.homeTeam,
      awayTeam: p.awayTeam,
      league: p.league || 'Unknown',
      sport: sport || p.sport || 'Foot',
      matchDate: p.matchDate || p.date || new Date().toISOString(),
      oddsHome: p.oddsHome || p.odds?.home || 1.0,
      oddsDraw: p.oddsDraw || p.odds?.draw || null,
      oddsAway: p.oddsAway || p.odds?.away || 1.0,
      predictedResult: p.predictedResult || p.prediction || 'home',
      predictedGoals: p.predictedGoals || null,
      confidence: p.confidence || 'medium',
      riskPercentage: p.riskPercentage || p.risk || 50
    }));

    // Sauvegarder dans le store
    const saved = await PredictionStore.addManyAsync(predictionsToSave);

    return NextResponse.json({
      success: true,
      saved,
      total: todayPredictions.length,
      message: `${saved} nouveaux pronostics ${sport || ''} sauvegardés pour aujourd'hui`
    });

  } catch (error: any) {
    console.error('Erreur sauvegarde pronostics:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

/**
 * GET - Voir les pronostics sauvegardés
 */
export async function GET() {
  try {
    const predictions = await PredictionStore.getAllAsync();
    const pending = await PredictionStore.getPendingAsync();
    const completed = await PredictionStore.getCompletedAsync();
    const info = await PredictionStore.getInfoAsync();

    return NextResponse.json({
      predictions,
      pending: pending.length,
      completed: completed.length,
      total: predictions.length,
      lastUpdate: info.lastUpdate,
      version: info.version
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message
    }, { status: 500 });
  }
}

/**
 * DELETE - Réinitialiser le store
 */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    const expectedToken = process.env.ADMIN_TOKEN || 'steo-admin-2026';

    if (token !== expectedToken) {
      return NextResponse.json({
        error: 'Token requis'
      }, { status: 403 });
    }

    await PredictionStore.clearAllAsync();

    return NextResponse.json({
      success: true,
      message: 'Store réinitialisé'
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message
    }, { status: 500 });
  }
}
