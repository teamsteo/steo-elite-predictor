/**
 * TEST TEMPORAIRE - Palier Intelligent sans auth
 * A SUPPRIMER après test
 */
import { NextResponse } from 'next/server';
import SupabaseStore from '@/lib/db-supabase';
import { sendTelegramPersonalMessage } from '@/lib/telegramService';

export async function GET() {
  try {
    const today = new Date();
    const todayISO = today.toISOString().split('T')[0];

    // 1. Lire les prédictions du jour
    const dayPredictions = await SupabaseStore.getPredictionsByCreatedAt(todayISO);

    // 2. Filtrer
    const eligible = dayPredictions.filter(p =>
      p.status === 'pending' &&
      p.odds_home > 0 &&
      p.odds_away > 0 &&
      !p.is_combo &&
      p.predicted_result &&
      p.confidence !== 'low'
    );

    // 3. Trier par fiabilité
    eligible.sort((a, b) => {
      const riskA = a.risk_percentage ?? 100;
      const riskB = b.risk_percentage ?? 100;
      if (riskA !== riskB) return riskA - riskB;
      return (b.edge_value || 0) - (a.edge_value || 0);
    });

    const top5 = eligible.slice(0, 5);

    // 4. Envoyer message test
    let msg = `🎯 <b>TEST PALIER INTELLIGENT</b>\n`;
    msg += `📅 ${todayISO}\n`;
    msg += `📊 Total prédictions: ${dayPredictions.length}\n`;
    msg += `✅ Éligibles: ${eligible.length}\n`;
    msg += `🏆 Top 5: ${top5.length}\n\n`;

    for (let i = 0; i < top5.length; i++) {
      const p = top5[i];
      msg += `${i + 1}. ${p.sport}: ${p.away_team} @ ${p.home_team}\n`;
      msg += `   → ${p.predicted_result} | Conf: ${p.confidence} | Risk: ${p.risk_percentage?.toFixed(0)}%\n`;
    }

    if (top5.length < 2) {
      msg += `\n⚠️ Pas assez de prédictions fiables pour un combo aujourd'hui.`;
    }

    const sent = await sendTelegramPersonalMessage(msg);

    return NextResponse.json({
      success: true,
      total: dayPredictions.length,
      eligible: eligible.length,
      top5: top5.length,
      telegram_sent: sent,
      preview: msg.slice(0, 200)
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
