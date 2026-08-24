import { NextResponse } from 'next/server';
import { sendTelegramMessage } from '@/lib/telegramService';

/**
 * POST /api/telegram/send-message - Envoie un message personnalisé sur Telegram
 * TEMPORAIRE: sans auth pour le bilan du 23 août
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 });
  }

  const message = typeof body.message === 'string' ? body.message : '';
  if (!message) {
    return NextResponse.json({ error: 'Message requis' }, { status: 400 });
  }

  const success = await sendTelegramMessage(message);
  return NextResponse.json({ success });
}
