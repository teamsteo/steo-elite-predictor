/**
 * TEMP: Envoi combo Telegram - sans auth
 * A REVERT apres envoi
 */
import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_PERSONAL_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

  const msg = `
╔====================================╗
║                                       ║
║   ⭐ <b>COMBO MULTI-JOURS FOOT</b>        ║
║   ⚽ 5 Grands Championnats Europeens ║
║   🛡️ 7 selections - Favoris solides    ║
║                                       ║
╚====================================╝

📅 <b>Periode</b> : Ven. 4 sept + Sam. 5 sept
📊 <b>Cote combinee</b> : <code>13.34</code>
🎯 <b>Prob. cumulee</b> : 9.6%
💰 <b>Valeur attendue</b> : +28.1%
📈 <b>7 selections</b>

-------------------------------------

<b>1. Victoire Man City</b> @1.20
   🇬🇧 PL | City vs Coventry City
   Sam. 5 sept 14:00 | 85% | Risque 15% 🟢

<b>2. Victoire Bayern</b> @1.33
   🇩🇪 BUN | Schalke vs Bayern
   Sam. 5 sept 13:30 | 78% | Risque 22% 🟡

<b>3. Victoire OGC Nice</b> @1.45
   🇫🏷 L1 | Nice vs Le Mans
   Sam. 5 sept 19:00 | 72% | Risque 28% 🟠

<b>4. Victoire Leverkusen</b> @1.50
   🇩🇪 BUN | Leverkusen vs Union Berlin
   Sam. 5 sept 13:30 | 70% | Risque 30% 🟠

<b>5. Victoire Liverpool</b> @1.55
   🇬🇧 PL | Ipswich vs Liverpool
   Ven. 4 sept 19:00 | 68% | Risque 32% 🟠

<b>6. Victoire PSG</b> @1.55
   🇫🏷 L1 | PSG vs Monaco
   Ven. 4 sept 19:05 | 66% | Risque 34% 🟠

<b>7. Victoire Lyon</b> @1.60
   🇫🏷 L1 | OL vs Auxerre
   Ven. 4 sept 17:00 | 64% | Risque 36% 🟠

-------------------------------------

💳 <b>Simu bankroll</b>
   1 000F = <b>13 340F</b> (+12 340F)

🛡️ Risque global : <b>🟡 MODERE</b>
⚠️ <i>Favoris solides sur 3 jours / 5 ligues.</i>
-------------------------------------`;

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
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, chat_id: chatId });
  }
}
