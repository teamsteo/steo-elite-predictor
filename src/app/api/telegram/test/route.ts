import { NextResponse } from 'next/server';
import { getMatchesWithRealOdds } from '@/lib/combinedDataService';

// Force rebuild v4 - VRAIS MATCHS
/**
 * GET /api/telegram/test - Envoie les VRAIS pronostics du jour
 */
export async function GET() {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return NextResponse.json({
      success: false,
      error: 'Telegram non configuré',
    }, { status: 500 });
  }

  try {
    // Récupérer les VRAIS matchs
    const matches = await getMatchesWithRealOdds();
    
    // Filtrer safe (≤30%) et modéré (31-50%)
    const safeModerate = matches.filter((m: any) => {
      // Essayer plusieurs sources pour le risque
      const risk = m.riskPercentage ?? m.insight?.riskPercentage ?? m.mlAnalysis?.probabilities?.risk;
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
          risk: m.riskPercentage ?? m.insight?.riskPercentage ?? 'N/A'
        }))
      });
    }

    // Construire le message avec les VRAIS matchs
    const today = new Date().toLocaleDateString('fr-FR', { 
      weekday: 'long', day: 'numeric', month: 'long' 
    });

    const safe = safeModerate.filter((m: any) => (m.riskPercentage ?? m.insight?.riskPercentage ?? 100) <= 30);
    const moderate = safeModerate.filter((m: any) => (m.riskPercentage ?? m.insight?.riskPercentage ?? 100) > 30);
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
      'Foot': '⚽', 'Football': '⚽', 'Basket': '🏀', 'NBA': '🏀', 'NHL': '🏒', 'Hockey': '🏒'
    };

    for (const [sport, matchs] of Object.entries(bySport)) {
      const emoji = sportEmojis[sport] || '🏟️';
      message += `━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `${emoji} <b>${sport.toUpperCase()}</b> (${matchs.length})\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

      matchs.forEach((m: any, i: number) => {
        const risk = m.riskPercentage ?? m.insight?.riskPercentage ?? 50;
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
      published: safeModerate.map((m: any) => {
        const risk = m.riskPercentage ?? m.insight?.riskPercentage ?? 0;
        return {
          match: `${m.homeTeam} vs ${m.awayTeam}`,
          sport: m.sport,
          risk: `${risk}%`,
          level: risk <= 30 ? 'Safe' : 'Modéré'
        };
      }),
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
