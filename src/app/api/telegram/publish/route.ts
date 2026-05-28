import { NextResponse } from 'next/server';
import { 
  publishPredictionToTelegram, 
  publishDailySummaryToTelegram,
  publishValueBetsToTelegram,
  testTelegramConnection,
  getTelegramChatId,
  isSafeOrModerate
} from '@/lib/telegramService';
import { getMatchesWithRealOdds } from '@/lib/combinedDataService';

/**
 * GET /api/telegram/publish - Publie sur Telegram
 * 
 * Paramètres:
 * - type: summary | valuebets | test | chatid
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'summary';

  try {
    // Test de connexion
    if (type === 'test') {
      const result = await testTelegramConnection();
      return NextResponse.json(result);
    }

    // Récupérer le CHAT_ID
    if (type === 'chatid') {
      const chatId = await getTelegramChatId();
      return NextResponse.json({
        success: !!chatId,
        chatId,
        message: chatId 
          ? `Ajoutez TELEGRAM_CHAT_ID="${chatId}" à vos variables d'environnement`
          : 'Envoyez un message au bot puis réessayez',
      });
    }

    // Vérifier la configuration
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      return NextResponse.json({
        success: false,
        error: 'Configuration Telegram manquante',
        setup: {
          step1: '1. Créer un bot avec @BotFather sur Telegram',
          step2: '2. Récupérer le TOKEN',
          step3: '3. Ajouter le bot à un groupe/canal',
          step4: '4. Appeler /api/telegram/publish?type=chatid pour obtenir le CHAT_ID',
          step5: '5. Configurer TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID',
        },
      }, { status: 500 });
    }

    // Résumé quotidien (UNIQUEMENT safe et modéré)
    if (type === 'summary') {
      const matches = await getMatchesWithRealOdds();
      
      const predictions = matches.map((m: any) => ({
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        sport: m.sport,
        league: m.league,
        date: m.date,
        displayDate: m.displayDate,
        recommendation: m.recommendations?.[0]?.label,
        confidence: m.confidence,
        valueBetDetected: m.valueBets?.length > 0,
        riskPercentage: m.riskPercentage,
        winProbability: m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : undefined),
        oddsHome: m.oddsHome,
        oddsAway: m.oddsAway,
        oddsDraw: m.oddsDraw,
      }));

      // Filtrer safe et modéré uniquement
      const filteredCount = predictions.filter(p => isSafeOrModerate(p.riskPercentage)).length;
      const excludedCount = predictions.length - filteredCount;

      const success = await publishDailySummaryToTelegram(predictions);

      return NextResponse.json({
        success,
        message: success 
          ? `Résumé publié: ${filteredCount} pronostics (safe/modéré)` 
          : 'Erreur lors de la publication',
        total: predictions.length,
        published: filteredCount,
        excluded: excludedCount,
        excludedReason: 'Risque > 50% (risqué)',
      });
    }

    // Value bets uniquement (UNIQUEMENT safe et modéré)
    if (type === 'valuebets') {
      const matches = await getMatchesWithRealOdds();
      
      const predictions = matches.map((m: any) => ({
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        sport: m.sport,
        league: m.league,
        date: m.date,
        displayDate: m.displayDate,
        recommendation: m.recommendations?.[0]?.label,
        confidence: m.confidence,
        riskPercentage: m.riskPercentage,
        winProbability: m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : undefined),
        valueBetDetected: m.valueBets?.length > 0,
        valueBetType: m.valueBets?.[0]?.type,
        oddsHome: m.oddsHome,
        oddsAway: m.oddsAway,
        oddsDraw: m.oddsDraw,
      }));

      const success = await publishValueBetsToTelegram(predictions);
      
      const valueBetsCount = predictions.filter(p => 
        p.valueBetDetected && 
        p.confidence !== 'low' && 
        isSafeOrModerate(p.riskPercentage)
      ).length;

      return NextResponse.json({
        success,
        message: success 
          ? `${valueBetsCount} value bet(s) publié(s)`
          : 'Erreur ou aucun value bet à publier',
        count: valueBetsCount,
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Type non supporté',
      availableTypes: ['summary', 'valuebets', 'test', 'chatid'],
    });

  } catch (error) {
    console.error('Erreur Telegram publish:', error);
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 });
  }
}
