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
const CRON_SECRET = process.env.CRON_SECRET;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

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
  
  if (!CRON_SECRET || !secret || !timingSafeEqual(secret, CRON_SECRET)) {
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
