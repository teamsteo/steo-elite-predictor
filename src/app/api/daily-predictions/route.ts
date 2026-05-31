/**
 * API Daily Predictions
 * 
 * Lit les prédictions depuis le fichier pré-calculé
 * AUCUN SCRAPING - juste lecture de fichier
 * 
 * Utilisé par:
 * - Site web (affichage)
 * - Telegram (publication)
 */

import { NextResponse } from 'next/server';
import { loadDailyPredictions, getFilteredPredictions } from '../../../lib/dailyPredictionService';

// ============================================
// GET - Lire les prédictions (pas de scraping)
// ============================================

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Paramètres de filtrage
    const sports = searchParams.get('sports')?.split(',') || undefined;
    const riskLevels = searchParams.get('risk')?.split(',') as ('safe' | 'moderate' | 'risky')[] | undefined;
    const valueBetsOnly = searchParams.get('valueBets') === 'true';
    const minProbability = searchParams.get('minProb') ? parseInt(searchParams.get('minProb')!) : undefined;
    
    // Charger les prédictions
    const data = loadDailyPredictions();
    
    if (!data) {
      return NextResponse.json({
        error: 'Aucune prédiction disponible',
        message: 'Les prédictions sont générées chaque matin à 05:30 UTC. Réessayez plus tard.',
        predictions: [],
        stats: null,
      }, { status: 404 });
    }
    
    // Filtrer
    const predictions = getFilteredPredictions({
      sports,
      riskLevels,
      valueBetsOnly,
      minProbability,
    });
    
    // Stats
    const stats = {
      total: predictions.length,
      bySport: {
        football: predictions.filter(p => p.sport === 'football').length,
        basketball: predictions.filter(p => p.sport === 'basketball').length,
        hockey: predictions.filter(p => p.sport === 'hockey').length,
        tennis: predictions.filter(p => p.sport === 'tennis').length,
      },
      byRisk: {
        safe: predictions.filter(p => p.riskLevel === 'safe').length,
        moderate: predictions.filter(p => p.riskLevel === 'moderate').length,
        risky: predictions.filter(p => p.riskLevel === 'risky').length,
      },
      valueBets: predictions.filter(p => p.valueBet).length,
    };
    
    return NextResponse.json({
      predictions,
      stats,
      generatedAt: data.generatedAt,
      validUntil: data.validUntil,
      source: 'precalculated',
    });
    
  } catch (error) {
    console.error('Erreur API daily-predictions:', error);
    return NextResponse.json(
      { error: 'Erreur serveur', predictions: [] },
      { status: 500 }
    );
  }
}
