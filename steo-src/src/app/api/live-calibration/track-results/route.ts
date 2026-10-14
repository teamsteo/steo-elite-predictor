/**
 * GET/POST /api/live-calibration/track-results
 *
 * Tracker de calibration : résout les résultats finaux des matchs calibrés
 * et envoie le message indicatif EN PRIVÉ sur Telegram (DM).
 *
 * Métriques calculées par match :
 *   - Brier 1X2 du modèle recalibré vs Brier du pre-match seul
 *   - Pick directionnel correct ou non
 *   - P&L simulé des value bets (mise fixe 1u, cotes bookmaker réelles)
 * + Cumul roulant sur tout l'historique du store (fiabilité empirique).
 *
 * Auth : CRON_SECRET ou LIVE_CALIB_SECRET (même modèle que /scan)
 * Params :
 *   ?date=today|yesterday|YYYY-MM-DD   (défaut : today)
 *   ?publish=false                      (ne PAS envoyer le message Telegram)
 *   ?force=1                            (envoyer le message même si 0 résolution)
 *
 * Déclenché par GitHub Actions à 22:30 et 23:45 UTC (après la fin des matchs).
 */
import { NextRequest, NextResponse } from 'next/server';
import { trackResultsForDate, formatResultsTelegram } from '@/lib/liveCalibration/resultTracker';
import { sendTelegramPersonalMessage } from '@/lib/telegramService';

export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const url = new URL(request.url);
  const tokenParam = url.searchParams.get('token');
  const cronSecret = process.env.CRON_SECRET;
  const liveCalibSecret = process.env.LIVE_CALIB_SECRET;
  const token = authHeader?.replace('Bearer ', '') || tokenParam;

  const authorized =
    (cronSecret && token === cronSecret) ||
    (liveCalibSecret && token === liveCalibSecret);

  if (!authorized) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const date = url.searchParams.get('date') || 'today';
  const publish = url.searchParams.get('publish') !== 'false';
  const force = url.searchParams.get('force') === '1';

  console.log(`📊 [TRACK RESULTS] Démarrage (date=${date}, publish=${publish})...`);

  try {
    const result = await trackResultsForDate(date === 'yesterday' ? 'yesterday' : date);

    // Message indicatif envoyé UNIQUEMENT s'il y a du nouveau résolu
    // (évite le spam si le cron repasse sur la même journée sans changement)
    const shouldPublish = publish && (result.matches.length > 0 || force);

    let telegram_sent = false;
    if (shouldPublish) {
      const message = formatResultsTelegram(result);
      telegram_sent = await sendTelegramPersonalMessage(message);
      console.log(`📊 [TRACK RESULTS] Message indicatif ${telegram_sent ? 'envoyé en DM privé ✅' : 'ÉCHEC envoi ❌'}`);
    }

    console.log(`📊 [TRACK RESULTS] Terminé : ${result.matches.length} résolu(s), ${result.unresolved_ids.length} en attente, ${result.rolling.matches_tracked} au cumul`);

    return NextResponse.json({
      success: true,
      date: result.date,
      resolved: result.matches.length,
      unresolved: result.unresolved_ids.length,
      telegram_sent,
      day: result.day,
      rolling: result.rolling,
      matches: result.matches.map(m => ({
        match: `${m.home_team} ${m.final_score.home}-${m.final_score.away} ${m.away_team}`,
        pick_hit: m.model_pick_hit,
        brier_model: m.brier_model,
        brier_pre_match: m.brier_pre_match,
        profit_units: m.day_profit_units,
      })),
      unresolved_ids: result.unresolved_ids,
    });
  } catch (e: any) {
    console.error('❌ [TRACK RESULTS] Erreur:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
