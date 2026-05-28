import { NextResponse } from 'next/server';
import { 
  publishPredictionToTelegram, 
  publishDailySummaryToTelegram,
  testTelegramConnection,
  getTelegramChatId
} from '@/lib/telegramService';
import { getMatchesWithRealOdds } from '@/lib/combinedDataService';

/**
 * GET /api/telegram/publish - Publie sur Telegram
 * 
 * Paramètres:
 * - type: summary | valuebets | test | chatid
 * - matchId: ID du match (optionnel, pour type=all)
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

    // Résumé quotidien
    if (type === 'summary') {
      const matches = await getMatchesWithRealOdds();
      
      const predictions = matches.map((m: any) => ({
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        sport: m.sport,
        recommendation: m.recommendations?.[0]?.label,
        confidence: m.confidence,
        valueBetDetected: m.valueBets?.length > 0,
      }));

      const success = await publishDailySummaryToTelegram(predictions);

      return NextResponse.json({
        success,
        message: success 
          ? `Résumé publié: ${predictions.length} matchs` 
          : 'Erreur lors de la publication',
        count: predictions.length,
      });
    }

    // Value bets uniquement
    if (type === 'valuebets') {
      const matches = await getMatchesWithRealOdds();
      
      const valueBets = matches.filter((m: any) => 
        m.valueBets?.length > 0 && m.confidence !== 'low'
      );

      let published = 0;
      for (const match of valueBets.slice(0, 5)) {
        const success = await publishPredictionToTelegram({
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          sport: match.sport,
          league: match.league,
          date: match.date,
          oddsHome: match.oddsHome,
          oddsDraw: match.oddsDraw,
          oddsAway: match.oddsAway,
          recommendation: match.recommendations?.[0]?.label,
          confidence: match.confidence,
          riskPercentage: match.riskPercentage,
          valueBetDetected: true,
          valueBetType: match.valueBets?.[0]?.type,
          dateTag: match.dateTag,
          displayDate: match.displayDate,
          isEstimated: match.isEstimated,
        });
        
        if (success) published++;
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return NextResponse.json({
        success: published > 0,
        message: `${published} value bet(s) publié(s)`,
        total: valueBets.length,
        published,
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
