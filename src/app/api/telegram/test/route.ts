import { NextResponse } from 'next/server';
import { sendTelegramMessage } from '@/lib/telegramService';
import { timingSafeEqual } from '@/lib/timingSafeEqual';

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * GET /api/telegram/test
 * Teste l'envoi d'un message Telegram avec le nouveau format
 */
export async function GET(request: Request) {
  // SECURITY FIX: require auth to prevent unauthorized Telegram API quota usage
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'Configuration manquante' }, { status: 500 });
  }
  const url = new URL(request.url);
  const urlSecret = url.searchParams.get('secret') || '';
  const authHeader = request.headers.get('authorization') || '';
  if (!timingSafeEqual(urlSecret, CRON_SECRET) && !timingSafeEqual(authHeader, `Bearer ${CRON_SECRET}`)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  // Message de test avec le nouveau format
  const testMessage = `━━━━━━━━━━━━━━━━━━━━━
⚽ <b>FOOTBALL</b>
━━━━━━━━━━━━━━━━━━━━━

🏟️ <b>Paris Saint-Germain</b>
    <b>VS</b>
🏟️ <b>Arsenal</b>

📅 <b>Samedi 31 Mai</b>
⏰ <b>21h00</b>
🏆 Champions League

📊 <b>COTES</b>
    1️⃣ 2.10  |  ❌ 3.40  |  2️⃣ 2.80

🎯 <b>PRONOSTIC</b>
    1️⃣ <b>Paris Saint-Germain</b>

🔥 <b>RÉUSSITE</b>
    ████████░░ <b>65%</b>

🟢 <b>RISQUE: SAFE</b> (35%)

━━━━━━━━━━━━━━━━━━━━━
🏀 <b>BASKETBALL</b>
━━━━━━━━━━━━━━━━━━━━━

🏟️ <b>Oklahoma City Thunder</b>
    <b>VS</b>
🏟️ <b>San Antonio Spurs</b>

📊 <b>COTES</b>
    1️⃣ 1.68  |  2️⃣ 2.24

🎯 <b>PRONOSTIC</b>
    1️⃣ <b>Oklahoma City Thunder</b>

⚡ <b>RÉUSSITE</b>
    ██████████░ <b>52%</b>

🟡 <b>RISQUE: MODÉRÉ</b> (48%)`;

  try {
    const result = await sendTelegramMessage(testMessage);
    
    return NextResponse.json({
      success: result,
      message: result 
        ? '✅ Message de test envoyé sur Telegram' 
        : '❌ Erreur envoi Telegram',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // SECURITY FIX: never expose error.message to users
    return NextResponse.json({
      success: false,
      error: 'Erreur interne',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
