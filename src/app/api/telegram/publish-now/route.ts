import { NextResponse } from 'next/server';
import { getMatchesWithRealOdds } from '@/lib/combinedDataService';
import {
  publishDailySummaryToTelegram,
  publishValueBetsToTelegram,
  publishDailyResultsToTelegram,
  isSafeOrModerate,
  selectTopDailyPredictions
} from '@/lib/telegramService';

/**
 * GET /api/telegram/publish-now
 * Publie manuellement les pronostics du jour sur Telegram
 * Paramètres:
 *   - type: "summary" (défaut), "valuebets" ou "results"
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'summary';

  try {
    console.log('📢 Publication manuelle Telegram...');

    // Récupérer les matchs
    const matches = await getMatchesWithRealOdds();

    if (!matches || matches.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Aucun match disponible actuellement',
        timestamp: new Date().toISOString()
      });
    }

    // Mapper les données (tennis inclus — plus d'exclusion)
    const predictions = matches.map((m: any) => ({
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        sport: m.sport,
        league: m.league,
        date: m.date,
        displayDate: m.displayDate,
        dateTag: m.dateTag,
        recommendation: m.recommendations?.[0]?.label || m.recommendation,
        predictedResult: m.predictedResult || (m.probabilities?.home > m.probabilities?.away ? 'home' : 'away'),
        confidence: m.confidence,
        riskPercentage: m.riskPercentage,
        winProbability: m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : undefined),
        valueBetDetected: m.valueBets?.length > 0,
        valueBetType: m.valueBets?.[0]?.type,
        oddsHome: m.oddsHome,
        oddsAway: m.oddsAway,
        oddsDraw: m.oddsDraw,
        isEstimated: m.isEstimated || false,
      }));

    // DEBUG: Voir les risques
    console.log('📊 Prédictions avec risques:', predictions.map(p => ({
      match: `${p.homeTeam} vs ${p.awayTeam}`,
      risk: p.riskPercentage,
      riskType: typeof p.riskPercentage,
      isSafe: isSafeOrModerate(p.riskPercentage)
    })));

    // Sélectionner les meilleurs pronostics (max 10, cotes réelles, par fiabilité)
    const { selected: safeModeratePredictions, totalEligible, excludedEstimated, excludedRisk, excludedByLimit } = selectTopDailyPredictions(predictions);
    const excludedPredictions = predictions.length - safeModeratePredictions.length;

    console.log(`✅ Sélectionné: ${safeModeratePredictions.length}/${totalEligible} éligibles — estimés exclus: ${excludedEstimated}, risque exclus: ${excludedRisk}, limite: ${excludedByLimit}`);

    if (safeModeratePredictions.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Aucun pronostic éligible (cotes réelles + safe/modéré)',
        total: predictions.length,
        totalEligible,
        excludedEstimated,
        excludedRisk,
        timestamp: new Date().toISOString()
      });
    }

    let telegramResult: boolean;
    let published: number;

    if (type === 'valuebets') {
      // Publier uniquement les value bets
      telegramResult = await publishValueBetsToTelegram(predictions);
      published = predictions.filter(p =>
        p.valueBetDetected &&
        p.confidence !== 'low' &&
        isSafeOrModerate(p.riskPercentage)
      ).length;
    } else if (type === 'results') {
      // Publier le bilan quotidien
      const targetDate = searchParams.get('date');
      telegramResult = await publishDailyResultsToTelegram(targetDate || undefined);
      published = telegramResult ? 1 : 0;
    } else {
      // Publier le résumé complet
      telegramResult = await publishDailySummaryToTelegram(predictions);
      published = safeModeratePredictions.length;
    }

    // Détails des pronostics
    const details = safeModeratePredictions.map(p => ({
      match: `${p.homeTeam} vs ${p.awayTeam}`,
      sport: p.sport,
      risk: p.riskPercentage ? `${p.riskPercentage}%` : 'N/A',
      level: p.riskPercentage !== undefined ?
        (p.riskPercentage <= 30 ? 'Safe' : 'Modéré') : 'N/A',
      recommendation: p.recommendation || 'N/A',
      winProb: p.winProbability ? `${p.winProbability}%` : 'N/A'
    }));

    return NextResponse.json({
      success: telegramResult,
      type: type === 'valuebets' ? 'Value Bets' : 'Résumé quotidien',
      message: telegramResult
        ? `✅ ${published} pronostic(s) publié(s) sur Telegram`
        : '❌ Erreur lors de la publication',
      stats: {
        total: predictions.length,
        published: published,
        totalEligible,
        excludedEstimated,
        excludedByLimit,
        excluded: excludedPredictions
      },
      predictions: details,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Erreur publication Telegram:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
