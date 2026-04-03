import { NextResponse } from 'next/server';
import { PredictionStore } from '@/lib/store';

/**
 * GET - Récupérer l'historique complet avec résultats
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // 'pending', 'completed', ou null pour tout
    const days = parseInt(searchParams.get('days') || '30');
    
    // Charger les prédictions
    const allPredictions = await PredictionStore.getAllAsync();
    
    // Filtrer par statut
    let predictions = allPredictions;
    if (status === 'pending') {
      predictions = allPredictions.filter(p => p.status === 'pending');
    } else if (status === 'completed') {
      predictions = allPredictions.filter(p => p.status === 'completed');
    }
    
    // Filtrer par date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    predictions = predictions.filter(p => new Date(p.matchDate) >= cutoffDate);
    
    // Trier par date (plus récent d'abord)
    predictions.sort((a, b) => 
      new Date(b.matchDate).getTime() - new Date(a.matchDate).getTime()
    );
    
    // Calculer les statistiques de vérification
    const completed = predictions.filter(p => p.status === 'completed');
    const pending = predictions.filter(p => p.status === 'pending');
    
    const resultStats = {
      total: completed.length,
      won: completed.filter(p => p.resultMatch === true).length,
      lost: completed.filter(p => p.resultMatch === false).length,
      pending: pending.length
    };
    
    const goalsStats = {
      total: completed.filter(p => p.goalsMatch !== undefined).length,
      won: completed.filter(p => p.goalsMatch === true).length,
      lost: completed.filter(p => p.goalsMatch === false).length
    };
    
    // Stats par sport
    const bySport: Record<string, { total: number; won: number; lost: number; pending: number }> = {};
    for (const p of predictions) {
      const sport = p.sport || 'Unknown';
      if (!bySport[sport]) {
        bySport[sport] = { total: 0, won: 0, lost: 0, pending: 0 };
      }
      bySport[sport].total++;
      if (p.status === 'completed') {
        if (p.resultMatch === true) bySport[sport].won++;
        else if (p.resultMatch === false) bySport[sport].lost++;
      } else {
        bySport[sport].pending++;
      }
    }
    
    // Stats par confiance
    const byConfidence: Record<string, { total: number; won: number; lost: number }> = {};
    for (const p of completed) {
      const conf = p.confidence || 'unknown';
      if (!byConfidence[conf]) {
        byConfidence[conf] = { total: 0, won: 0, lost: 0 };
      }
      byConfidence[conf].total++;
      if (p.resultMatch === true) byConfidence[conf].won++;
      else if (p.resultMatch === false) byConfidence[conf].lost++;
    }
    
    return NextResponse.json({
      success: true,
      predictions: predictions.map(p => ({
        matchId: p.matchId,
        homeTeam: p.homeTeam,
        awayTeam: p.awayTeam,
        league: p.league,
        sport: p.sport,
        matchDate: p.matchDate,
        predictedResult: p.predictedResult,
        predictedGoals: p.predictedGoals,
        confidence: p.confidence,
        oddsHome: p.oddsHome,
        oddsAway: p.oddsAway,
        status: p.status,
        homeScore: p.homeScore,
        awayScore: p.awayScore,
        actualResult: p.actualResult,
        resultMatch: p.resultMatch,
        goalsMatch: p.goalsMatch,
        checkedAt: p.checkedAt
      })),
      stats: {
        results: resultStats,
        goals: goalsStats,
        bySport,
        byConfidence,
        winRate: resultStats.total > 0 
          ? Math.round((resultStats.won / resultStats.total) * 100) 
          : 0
      },
      filters: {
        status,
        days
      },
      generated: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Erreur historique:', error);
    return NextResponse.json({
      success: false,
      error: 'Erreur de chargement'
    }, { status: 500 });
  }
}
