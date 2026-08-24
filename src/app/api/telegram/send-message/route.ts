import { NextResponse } from 'next/server';
import { sendTelegramMessage } from '@/lib/telegramService';

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST /api/telegram/send-message - Envoie un message personnalisé sur Telegram
 * Body: { message: string, secret: string }
 */
export async function POST(request: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET non configuré' }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 });
  }

  // Auth
  const providedSecret = typeof body.secret === 'string' ? body.secret : '';
  if (providedSecret !== CRON_SECRET) {
    const authHeader = request.headers.get('authorization') || '';
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
  }

  const message = typeof body.message === 'string' ? body.message : '';
  if (!message) {
    return NextResponse.json({ error: 'Message requis' }, { status: 400 });
  }

  const success = await sendTelegramMessage(message);
  return NextResponse.json({ success });
}
