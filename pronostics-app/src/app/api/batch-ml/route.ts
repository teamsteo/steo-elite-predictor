import { NextResponse } from 'next/server';
import { 
  precalculateAllStats, 
  getCacheStatus, 
  forceUpdate, 
  clearBatchCache 
} from '@/lib/batchPreCalculation';
import { trainModel, getAdaptiveThresholds, getModelStatus, resetModel } from '@/lib/adaptiveThresholdsML';
import { calculateStats, getStats } from '@/lib/predictionTracker';

/**
 * API pour le pré-calcul batch et l'entraînement ML
 * 
 * Endpoints:
 * - GET: Statut du cache et du modèle ML
 * - POST: Lancer un pré-calcul ou entraînement
 * 
 * Actions POST:
 * - action=precalc: Pré-calculer toutes les stats
 * - action=train: Entraîner le modèle ML
 * - action=stats: Calculer les statistiques de prédictions
 * - action=force_update: Forcer la mise à jour du cache
 * - action=reset_ml: Réinitialiser le modèle ML
 * - action=clear_cache: Vider le cache
 */
export async function GET() {
  try {
    // Récupérer les statuts
    const cacheStatus = getCacheStatus();
    const mlStatus = getModelStatus();
    const predStats = await getStats();
    
    return NextResponse.json({
      cache: cacheStatus,
      ml: mlStatus,
      predictions: predStats ? {
        total: predStats.total,
        resolved: predStats.resolved,
        accuracy: predStats.accuracy,
        roi: predStats.roi,
      } : null,
      thresholds: getAdaptiveThresholds(),
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('Erreur API batch/ml:', error);
    return NextResponse.json({ 
      error: 'Erreur lors de la récupération des statuts',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  
  try {
    switch (action) {
      case 'precalc': {
        // Pré-calculer toutes les stats
        const result = await precalculateAllStats();
        return NextResponse.json({
          success: true,
          message: 'Pré-calcul terminé',
          result,
        });
      }
      
      case 'train': {
        // Entraîner le modèle ML
        const result = trainModel();
        return NextResponse.json({
          success: result.success,
          message: result.success ? 'Entraînement terminé' : 'Pas assez de données',
          result,
        });
      }
      
      case 'stats': {
        // Calculer les statistiques
        const stats = await calculateStats();
        return NextResponse.json({
          success: true,
          stats,
        });
      }
      
      case 'force_update': {
        // Forcer la mise à jour
        await forceUpdate();
        return NextResponse.json({
          success: true,
          message: 'Cache mis à jour',
        });
      }
      
      case 'reset_ml': {
        // Réinitialiser le modèle ML
        resetModel();
        return NextResponse.json({
          success: true,
          message: 'Modèle ML réinitialisé',
        });
      }
      
      case 'clear_cache': {
        // Vider le cache
        clearBatchCache();
        return NextResponse.json({
          success: true,
          message: 'Cache vidé',
        });
      }
      
      default:
        return NextResponse.json({
          error: 'Action non reconnue',
          availableActions: ['precalc', 'train', 'stats', 'force_update', 'reset_ml', 'clear_cache'],
        }, { status: 400 });
    }
    
  } catch (error) {
    console.error('Erreur action batch/ml:', error);
    return NextResponse.json({ 
      error: 'Erreur lors de l\'exécution',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
