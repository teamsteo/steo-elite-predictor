import { NextResponse } from 'next/server';

/**
 * API /api/telegram/publish-tennis — DÉSACTIVÉ
 * 
 * 🎾 Tennis EXCLU des pronostics Telegram (pas de pipeline ML fiable)
 * Cette route est désactivée. Les prédictions tennis ne sont plus publiées sur Telegram.
 */

export async function GET(request: Request) {
  console.log('🎾 Publication Tennis: DÉSACTIVÉ — tennis exclu des pronostics Telegram');

  return NextResponse.json({
    success: true,
    published: 0,
    message: '🎾 Tennis publication désactivée — plus de pronostics tennis sur Telegram',
    timestamp: new Date().toISOString(),
  });
}

// Support POST pour webhooks
export async function POST(request: Request) {
  return GET(request);
}
