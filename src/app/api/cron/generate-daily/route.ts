/**
 * API Cron - Génération quotidienne des prédictions
 * 
 * Appelé UNE SEULE FOIS par jour (05:30 UTC)
 * - Scraping de toutes les sources
 * - Calcul ML pour chaque match
 * - Stockage dans daily-predictions.json
 * 
 * Ensuite, le site web et Telegram lisent le fichier (pas de scraping)
 */

import { NextResponse } from 'next/server';
import { generateDailyPredictions } from '../../../../lib/dailyPredictionService';
import { timingSafeEqual } from '@/lib/timingSafeEqual';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  try {
    // Vérifier le secret (SECURITY FIX: fail if secret is missing, not skip)
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    
    if (!CRON_SECRET || !timingSafeEqual(secret || '', CRON_SECRET)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    console.log('🔄 Cron Génération Prédictions: Démarrage');
    console.log('==========================================');
    
    // Générer toutes les prédictions
    const result = await generateDailyPredictions();
    
    console.log('==========================================');
    console.log('✅ Génération terminée');
    
    return NextResponse.json({
      success: true,
      generatedAt: result.generatedAt,
      validUntil: result.validUntil,
      summary: result.summary,
      message: `${result.predictions.length} prédictions générées`,
    });
    
  } catch (error) {
    console.error('❌ Erreur génération:', error);
    return NextResponse.json(
      { error: 'Erreur serveur', message: 'Erreur interne', code: 'GENERATE_DAILY_FAILED' },
      { status: 500 }
    );
  }
}
