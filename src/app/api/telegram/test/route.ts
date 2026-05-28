import { NextResponse } from 'next/server';

// Force rebuild v3
/**
 * GET /api/telegram/test - Test direct de Telegram
 * Envoie un message test avec le nouveau format ergonomique
 */
export async function GET() {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  // Vérifier la configuration
  if (!TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({
      success: false,
      error: 'TELEGRAM_BOT_TOKEN non configuré dans Vercel',
    }, { status: 500 });
  }

  if (!TELEGRAM_CHAT_ID) {
    return NextResponse.json({
      success: false,
      error: 'TELEGRAM_CHAT_ID non configuré dans Vercel',
    }, { status: 500 });
  }

  try {
    // Message de test avec le NOUVEAU FORMAT ERGONOMIQUE
    const testMessage = `╔════════════════════════╗
║   📢 <b>PRONOSTICS DU JOUR</b>    ║
╚════════════════════════╝

📅 <b>Jeudi 29 Mai 2026</b>

🎯 <b>3 PRONOSTICS</b>
    🟢 Safe: 2
    🟡 Modéré: 1
    💎 Value Bets: 1

━━━━━━━━━━━━━━━━━━━━━
⚽ <b>FOOTBALL</b> (2)
━━━━━━━━━━━━━━━━━━━━━

<b>1.</b> 💎 PSG vs Barcelona
    ⏰ 21h00 | 🎯 Victoire PSG
    🟢 75% réussite

<b>2.</b> Real Madrid vs Bayern
    ⏰ 20h45 | 🎯 Over 2.5 buts
    🟡 62% réussite

━━━━━━━━━━━━━━━━━━━━━
🏀 <b>BASKET</b> (1)
━━━━━━━━━━━━━━━━━━━━━

<b>3.</b> Lakers vs Celtics
    ⏰ 02h30 | 🎯 Lakers +5.5
    🟢 78% réussite

━━━━━━━━━━━━━━━━━━━━━
🟢 Safe: Risque ≤ 30%
🟡 Modéré: Risque 31-50%
💎 Value Bet détecté`;

    // Envoyer le message
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: testMessage,
        parse_mode: 'HTML',
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      return NextResponse.json({
        success: false,
        error: data.description,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: '✅ Message de test envoyé avec le NOUVEAU FORMAT !',
      chatId: TELEGRAM_CHAT_ID,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error)
    }, { status: 500 });
  }
}
