import { NextResponse } from 'next/server';
import { sendTelegramMessage } from '@/lib/telegramService';

/**
 * GET /api/telegram/test
 * Teste l'envoi d'un message Telegram avec le nouveau format
 */
export async function GET() {
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
      sentMessage: testMessage,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
