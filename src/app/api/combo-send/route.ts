import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { sendTelegramPersonalMessage } from '@/lib/telegramService';

/**
 * TEMP endpoint — sends a pre-built combo message to the personal Telegram DM.
 * Accepts POST body { message: string } OR query ?msg=...
 * TO BE REMOVED after use.
 */
export async function GET(request: NextRequest) {
  const msg = request.nextUrl.searchParams.get('msg');
  if (!msg) {
    return NextResponse.json({ error: 'Missing ?msg= query param' }, { status: 400 });
  }
  try {
    const result = await sendTelegramPersonalMessage(msg);
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const msg = body?.message;
  if (!msg || typeof msg !== 'string') {
    return NextResponse.json({ error: 'Missing { message: string }' }, { status: 400 });
  }
  try {
    const result = await sendTelegramPersonalMessage(msg);
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
