/**
 * TEST Telegram DM - debug complet - sans auth
 * A SUPPRIMER après test
 */
import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_PERSONAL_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  const msg = `✅ <b>Test DM Telegram - Debug</b>\n\nSi tu vois ce message, tout fonctionne ! 🎯`;

  if (!token || !chatId) {
    return NextResponse.json({ error: 'Token ou Chat ID manquant', token: !!token, chatId: chatId || null });
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: msg,
        parse_mode: 'HTML',
      }),
    });

    const data = await response.json();
    return NextResponse.json({
      ok: data.ok,
      error: data.description || null,
      error_code: data.error_code || null,
      chat_id_used: chatId,
      token_prefix: token.slice(0, 8),
      response_status: response.status,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, chat_id: chatId, token_prefix: token.slice(0, 8) });
  }
}
