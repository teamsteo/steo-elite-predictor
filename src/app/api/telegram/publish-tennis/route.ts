import { NextResponse } from 'next/server';
import { runTennisTelegramJob } from '@/lib/telegramTennisService';

/**
 * GET /api/telegram/publish-tennis
 * Publie manuellement les pronostics tennis sur Telegram
 * 
 * Paramètres:
 * - mode: summary (défaut) | major | valuebets
 * 
 * Pas d'authentification requise - utilisable pour envoi manuel
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'summary';

  try {
    console.log('🎾 Publication manuelle Tennis Telegram...');
    console.log(`📋 Mode: ${mode}`);

    // Vérifier la configuration Telegram
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      return NextResponse.json({
        success: false,
        error: 'Configuration Telegram manquante',
        setup: {
          step1: '1. Configurer TELEGRAM_BOT_TOKEN dans Vercel',
          step2: '2. Configurer TELEGRAM_CHAT_ID dans Vercel',
        },
      }, { status: 500 });
    }

    let options: { majorOnly?: boolean; valueBetsOnly?: boolean } = {};
    
    if (mode === 'major') {
      options = { majorOnly: true };
    } else if (mode === 'valuebets') {
      options = { valueBetsOnly: true };
    }

    const result = await runTennisTelegramJob(options);

    return NextResponse.json({
      success: result.success,
      published: result.published,
      message: result.message,
      mode,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Erreur publication tennis:', error);
    return NextResponse.json({
      success: false,
      error: String(error),
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// Support POST pour webhooks
export async function POST(request: Request) {
  return GET(request);
}
