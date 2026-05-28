import { NextResponse } from 'next/server';

// Force rebuild v2 - $(date +%s)
/**
 * GET /api/telegram/test - Test direct de Telegram
 * Envoie un message test sur Telegram
 */
export async function GET() {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  // Vérifier la configuration
  if (!TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({
      success: false,
      error: 'TELEGRAM_BOT_TOKEN non configuré dans Vercel',
      help: 'Ajoutez TELEGRAM_BOT_TOKEN dans Settings > Environment Variables'
    }, { status: 500 });
  }

  if (!TELEGRAM_CHAT_ID) {
    return NextResponse.json({
      success: false,
      error: 'TELEGRAM_CHAT_ID non configuré dans Vercel',
      help: 'Ajoutez TELEGRAM_CHAT_ID dans Settings > Environment Variables'
    }, { status: 500 });
  }

  try {
    // Message de test
    const testMessage = `🤖 <b>TEST CONNEXION</b>

✅ Le bot Telegram fonctionne parfaitement !

📅 ${new Date().toLocaleDateString('fr-FR', { 
  weekday: 'long', 
  day: 'numeric', 
  month: 'long',
  hour: '2-digit',
  minute: '2-digit'
})}

🎯 Les pronostics <b>Safe</b> et <b>Modéré</b> seront publiés automatiquement ici.

🟢 Safe: Risque ≤ 30%
🟡 Modéré: Risque 31-50%
🔴 Risqué: > 50% (non publié)

<i>Message de test envoyé depuis Steo Élite Predictor</i>`;

    // Envoyer le message
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
        telegramError: data
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: '✅ Message envoyé avec succès sur Telegram !',
      chatId: TELEGRAM_CHAT_ID,
      timestamp: new Date().toISOString(),
      botInfo: {
        firstName: data.result?.from?.first_name,
        username: data.result?.from?.username,
      },
      chatInfo: {
        type: data.result?.chat?.type,
        title: data.result?.chat?.title,
      }
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error)
    }, { status: 500 });
  }
}
