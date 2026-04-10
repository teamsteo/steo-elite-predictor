/**
 * API ML Status - Statut du modèle ML
 * 
 * GET /api/ml/status
 * Retourne le statut complet du modèle ML: version, accuracy, patterns, etc.
 */

import { NextResponse } from 'next/server';
import { getUnifiedMLStats, loadMLPatterns } from '@/lib/unifiedMLService';

export async function GET() {
  try {
    const stats = await getUnifiedMLStats();
    const patterns = await loadMLPatterns();
    
    // Calculer les patterns par type
    const patternsByType: Record<string, number> = {};
    for (const p of patterns) {
      patternsByType[p.pattern_type] = (patternsByType[p.pattern_type] || 0) + 1;
    }
    
    // Calculer le taux de succès moyen par sport
    const successRateBySport: Record<string, { avg: number; count: number }> = {};
    for (const p of patterns) {
      if (!successRateBySport[p.sport]) {
        successRateBySport[p.sport] = { avg: 0, count: 0 };
      }
      successRateBySport[p.sport].avg += p.success_rate;
      successRateBySport[p.sport].count++;
    }
    
    for (const sport of Object.keys(successRateBySport)) {
      const data = successRateBySport[sport];
      data.avg = Math.round(data.avg / data.count);
    }
    
    // Top patterns
    const topPatterns = patterns
      .sort((a, b) => b.success_rate * b.sample_size - a.success_rate * a.sample_size)
      .slice(0, 10)
      .map(p => ({
        sport: p.sport,
        type: p.pattern_type,
        successRate: p.success_rate,
        sampleSize: p.sample_size,
        description: p.description
      }));
    
    return NextResponse.json({
      success: true,
      model: {
        version: stats.model?.version || 'Non initialisé',
        accuracy: stats.model?.accuracy || 0,
        samplesUsed: stats.model?.samples_used || 0,
        lastTrained: stats.model?.last_trained || 'Jamais',
        edgeThreshold: stats.model?.edge_threshold || 0.03,
        confidenceWeights: stats.model?.confidence_weights || {
          very_high: 0.5,
          high: 0.4,
          medium: 0.25,
          low: 0.1
        }
      },
      patterns: {
        total: stats.patterns.total,
        bySport: {
          football: stats.patterns.football,
          basketball: stats.patterns.basketball,
          hockey: stats.patterns.hockey
        },
        byType: patternsByType,
        avgSuccessRate: stats.patterns.avgSuccessRate,
        topPatterns
      },
      learning: {
        status: stats.patterns.total > 0 ? 'Actif' : 'En attente de données',
        canLearn: stats.recentTraining.samplesUsed >= 20,
        minSamplesRequired: 20,
        currentSamples: stats.recentTraining.samplesUsed,
        progressPercent: Math.min(100, Math.round((stats.recentTraining.samplesUsed / 100) * 100))
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Erreur ML status:', error);
    return NextResponse.json({
      success: false,
      error: String(error),
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
