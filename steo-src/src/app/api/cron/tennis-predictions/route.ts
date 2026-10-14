/**
 * API Cron Tennis Predictions — DÉSACTIVÉ
 * 
 * 🎾 Tennis EXCLU des pronostics Telegram (pas de pipeline ML fiable)
 * Ce cron est désactivé. Les prédictions tennis ne sont plus publiées sur Telegram.
 * 
 * Pour réactiver: restaurer l'import de runTennisTelegramJob et la logique d'envoi.
 */

import { NextResponse } from 'next/server';
import { timingSafeEqual } from '@/lib/timingSafeEqual';

// Vérification du secret pour sécuriser le cron
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
    
    console.log('🎾 Cron Tennis Predictions: DÉSACTIVÉ — tennis exclu des pronostics Telegram');
    
    return NextResponse.json({
      success: true,
      published: 0,
      message: 'Tennis cron désactivé — plus de pronostics tennis sur Telegram',
      mode: 'disabled',
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('❌ Erreur cron tennis:', error);
    return NextResponse.json(
      { error: 'Erreur serveur', message: 'Erreur interne', code: 'TENNIS_PRED_ERROR' },
      { status: 500 }
    );
  }
}

// Support POST pour les webhooks
export async function POST(request: Request) {
  return GET(request);
}
