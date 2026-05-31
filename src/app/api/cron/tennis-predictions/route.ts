/**
 * API Cron Tennis Predictions
 * 
 * Publie automatiquement les pronostics tennis sur Telegram
 * - Tournois majeurs uniquement (Grand Chelem, Masters 1000, WTA 1000)
 * - Filtre safe et modéré (risque ≤ 50%)
 */

import { NextResponse } from 'next/server';
import { runTennisTelegramJob } from '../../../../lib/telegramTennisService';

// Vérification du secret pour sécuriser le cron
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  try {
    // Vérifier le secret si configuré
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    
    if (CRON_SECRET && secret !== CRON_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    console.log('🎾 Cron Tennis Predictions: Démarrage');
    console.log('=====================================');
    
    // Récupérer le type de publication
    const mode = searchParams.get('mode') || 'summary';
    
    let result;
    
    switch (mode) {
      case 'major':
        // Publier uniquement les grands tournois
        console.log('📋 Mode: Grands tournois uniquement');
        result = await runTennisTelegramJob({ majorOnly: true });
        break;
        
      case 'valuebets':
        // Publier uniquement les value bets
        console.log('📋 Mode: Value bets uniquement');
        result = await runTennisTelegramJob({ valueBetsOnly: true });
        break;
        
      case 'summary':
      default:
        // Publier le résumé complet
        console.log('📋 Mode: Résumé complet');
        result = await runTennisTelegramJob({});
        break;
    }
    
    console.log('=====================================');
    console.log(`✅ Résultat: ${result.message}`);
    
    return NextResponse.json({
      success: result.success,
      published: result.published,
      message: result.message,
      mode,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('❌ Erreur cron tennis:', error);
    return NextResponse.json(
      { error: 'Erreur serveur', message: String(error) },
      { status: 500 }
    );
  }
}

// Support POST pour les webhooks
export async function POST(request: Request) {
  return GET(request);
}
