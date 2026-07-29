/**
 * API CRON Tennis Auto-Publish V2 — DÉSACTIVÉ
 * 
 * 🎾 Tennis EXCLU des pronostics Telegram (pas de pipeline ML fiable)
 * Ce cron est désactivé. Les prédictions tennis ne sont plus publiées sur Telegram.
 * 
 * Pour réactiver: restaurer les imports et la logique d'origine.
 */

import { NextResponse } from 'next/server';

// Secret pour sécuriser les appels CRON
const CRON_SECRET = process.env.CRON_SECRET || 'secretsteo-elitecron2026';

interface PublishResult {
  success: boolean;
  published: number;
  mode: string;
  message: string;
  timestamp: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const mode = searchParams.get('mode') || 'summary';
  
  // Vérification du secret
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  console.log('[TennisAutoPublish] 🎾 DÉSACTIVÉ — tennis exclu des pronostics Telegram');
  
  const result: PublishResult = {
    success: true,
    published: 0,
    mode,
    message: '🎾 Cron tennis désactivé — plus de pronostics tennis sur Telegram',
    timestamp: new Date().toISOString(),
  };
  
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  return GET(request);
}
