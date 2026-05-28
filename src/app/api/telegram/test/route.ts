import { NextResponse } from 'next/server';

// Force rebuild v6 - Envoie les VRAIS pronostics du jour avec format ergonomique
/**
 * GET /api/telegram/test - Envoie les VRAIS pronostics du jour
 * Utilise le nouveau format ergonomique
 */
export async function GET() {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return NextResponse.json({
      success: false,
      error: 'TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID non configuré dans Vercel',
    }, { status: 500 });
  }

  try {
    // Récupérer les VRAIS matchs via l'API interne (pas de cache)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://my-project-zeta-five-85.vercel.app';
    const matchesResponse = await fetch(`${baseUrl}/api/matches?_=${Date.now()}`, {
      cache: 'no-store'
    });
    const matchesData = await matchesResponse.json();
    const matches = matchesData.matches || [];
    
    // Filtrer safe (≤30%) et modéré (31-50%)
    const safeModerate = matches.filter((m: any) => {
      const risk = m.riskPercentage;
      if (risk === undefined) return false;
      return risk <= 50;
    });

    if (safeModerate.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Aucun pronostic safe/modéré disponible',
        total: matches.length,
        allRisks: matches.map((m: any) => ({ 
          match: `${m.homeTeam} vs ${m.awayTeam}`, 
          risk: m.riskPercentage ?? 'N/A'
        }))
      });
    }

    // Construire le message avec les VRAIS matchs
    const today = new Date().toLocaleDateString('fr-FR', { 
      weekday: 'long', day: 'numeric', month: 'long' 
    });

    const safe = safeModerate.filter((m: any) => m.riskPercentage <= 30);
    const moderate = safeModerate.filter((m: any) => m.riskPercentage > 30);
    const valueBets = safeModerate.filter((m: any) => m.valueBets?.length > 0);

    let message = '';
    message += '╔════════════════════════╗\n';
    message += `║    📢 <b>PRONOSTICS DU JOUR</b>    ║\n`;
    message += '╚════════════════════════╝\n\n';
    message += `📅 <b>${today.charAt(0).toUpperCase() + today.slice(1)}</b>\n\n`;
    message += `🎯 <b>${safeModerate.length} PRONOSTICS</b>\n`;
    message += `    🟢 Safe: ${safe.length}\n`;
    message += `    🟡 Modéré: ${moderate.length}\n`;
    if (valueBets.length > 0) {
      message += `    💎 Value Bets: ${valueBets.length}\n`;
    }
    message += '\n';

    // Grouper par sport
    const bySport: Record<string, typeof safeModerate> = {};
    safeModerate.forEach((m: any) => {
      const sport = m.sport || 'Autre';
      if (!bySport[sport]) bySport[sport] = [];
      bySport[sport].push(m);
    });

    const sportEmojis: Record<string, string> = {
      'Foot': '⚽', 'Football': '⚽', 'Basket': '🏀', 'NBA': '🏀', 'NHL': '🏒', 'Hockey': '🏒',
      'Tennis': '🎾', 'MLB': '⚾', 'NFL': '🏈'
    };

    for (const [sport, matchs] of Object.entries(bySport)) {
      const emoji = sportEmojis[sport] || '🏟️';
      message += `━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `${emoji} <b>${sport.toUpperCase()}</b> (${matchs.length})\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

      matchs.forEach((m: any, i: number) => {
        const risk = m.riskPercentage;
        const riskEmoji = risk <= 30 ? '🟢' : '🟡';
        const winProb = 100 - risk;
        const vbEmoji = m.valueBets?.length > 0 ? '💎 ' : '';
        const time = m.displayDate || '';
        const rec = m.recommendations?.[0]?.label || '';

        message += `<b>${i + 1}.</b> ${vbEmoji}${m.homeTeam} vs ${m.awayTeam}\n`;
        if (time) message += `    📅 ${time}`;
        if (rec) message += ` | 🎯 ${rec}`;
        message += `\n    ${riskEmoji} ${winProb}% réussite\n\n`;
      });
    }

    message += '━━━━━━━━━━━━━━━━━━━━━\n';
    message += '🟢 Safe: Risque ≤ 30%\n';
    message += '🟡 Modéré: Risque 31-50%\n';
    message += '💎 Value Bet détecté';

    // Envoyer
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
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
      message: `✅ ${safeModerate.length} VRAIS pronostics envoyés sur Telegram !`,
      published: safeModerate.map((m: any) => ({
        match: `${m.homeTeam} vs ${m.awayTeam}`,
        sport: m.sport,
        risk: `${m.riskPercentage}%`,
        level: m.riskPercentage <= 30 ? 'Safe' : 'Modéré'
      })),
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
