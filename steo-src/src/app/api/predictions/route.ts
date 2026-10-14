import { NextResponse } from 'next/server';
import { PredictionStore } from '@/lib/store';
import { timingSafeEqual } from '@/lib/timingSafeEqual';

const CRON_SECRET = process.env.CRON_SECRET;
if (!CRON_SECRET) {
  console.error('[SECURITY] CRON_SECRET non configuré - endpoints write désactivés');
}

function verifyRequestAuth(request: Request): boolean {
  if (!CRON_SECRET) return false;
  const url = new URL(request.url);
  const urlSecret = url.searchParams.get('secret') || '';
  const authHeader = request.headers.get('authorization') || '';
  if (timingSafeEqual(urlSecret, CRON_SECRET)) return true;
  if (timingSafeEqual(authHeader, `Bearer ${CRON_SECRET}`)) return true;
  return false;
}

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
  if (!verifyRequestAuth(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
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
export async function DELETE(request: Request) {
  if (!verifyRequestAuth(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
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
