import { NextResponse } from 'next/server';
import { getMatchesWithRealOdds } from '@/lib/combinedDataService';
import { getBatchPredictions, type UnifiedPredictionInput } from '@/lib/unifiedPredictionService';
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
 *
 * NOTE: Invoque le pipeline ML unifié (comme le cron 07:00) afin de propager
 * `_matchImportance.contextSummary` (news, blessures, forme, météo, derby)
 * vers le message Telegram. Sans cela, l'ENJEU afficherait toujours "RAS".
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

    // Filtrer: matchs à venir uniquement, cotes réelles
    const upcomingWithOdds = matches.filter((m: any) =>
      !m.isFinished && !m.isEstimated && m.oddsHome > 0 && m.oddsAway > 0
    );
    console.log(`📡 ${upcomingWithOdds.length} matchs éligibles pour analyse ML (sur ${matches.length} total)`);

    // Mapper vers le format UnifiedPredictionInput
    const mlInputs: UnifiedPredictionInput[] = upcomingWithOdds.map((m: any) => ({
      id: m.id || `espn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      sport: m.sport === 'Basketball' ? 'NBA' as const :
             m.sport === 'Hockey' ? 'NHL' as const : 'Foot' as const,
      league: m.league || 'Unknown',
      oddsHome: m.oddsHome,
      oddsDraw: m.oddsDraw || null,
      oddsAway: m.oddsAway,
    }));

    // 🧠 Exécuter le pipeline ML unifié (produit factors.matchImportance.contextSummary)
    let unifiedPreds: any[] = [];
    try {
      unifiedPreds = await getBatchPredictions(mlInputs);
      console.log(`🧠 ${unifiedPreds.length} prédictions ML calculées`);
    } catch (mlErr: any) {
      console.log(`⚠️ Pipeline ML échoué (${mlErr.message}), fallback sur cotes brutes`);
    }

    // Convertir les prédictions unifiées en format Telegram
    // Filtres stricts du site: pas de LOW confidence, pas de 'avoid'
    let predictions: any[] = [];

    if (unifiedPreds.length > 0) {
      predictions = unifiedPreds
        .filter((p: any) =>
          p.recommendation.bet !== 'avoid' &&
          p.mlPrediction.confidence !== 'low' &&
          p.odds.hasRealOdds
        )
        .map((p: any) => {
          const bet = p.recommendation.bet; // 'home' | 'draw' | 'away'
          const isHome = bet === 'home';
          const isAway = bet === 'away';
          const winProb = isHome ? p.mlPrediction.homeProb :
                           isAway ? p.mlPrediction.awayProb : p.mlPrediction.drawProb;
          const riskPct = Math.round(100 - winProb);

          return {
            homeTeam: p.homeTeam,
            awayTeam: p.awayTeam,
            sport: p.sport === 'NBA' ? 'Basketball' : p.sport === 'NHL' ? 'Hockey' : 'Football',
            league: p.league,
            date: undefined,
            displayDate: '',
            dateTag: "aujourd'hui",
            recommendation: isHome ? p.homeTeam : isAway ? p.awayTeam : 'Match Nul',
            predictedResult: bet,
            confidence: p.mlPrediction.confidence,
            valueBetDetected: p.mlPrediction.valueBet,
            valueBetType: p.mlPrediction.valueBetType,
            riskPercentage: riskPct,
            winProbability: winProb,
            oddsHome: p.odds.home,
            oddsAway: p.odds.away,
            oddsDraw: p.odds.draw,
            isEstimated: false,
            // 🧠 Métadonnées ML pour le formatage Telegram
            _mlEdge: p.mlPrediction.edge,
            _mlReasoning: p.recommendation.reasoning,
            _dataQuality: p.dataQuality?.score || 0,
            _kellyStake: p.recommendation.kellyStake,
            _dixonColes: p.dixonColes,
            _sources: p.dataQuality?.sources || [],
            // 🏆 Enjeu du match (phase saison, type compétition, importance, CONTEXTE)
            _matchImportance: p.factors?.matchImportance || undefined,
          };
        });

      console.log(`🧠 Pipeline ML: ${predictions.length} pronostics valides (HIGH/MEDIUM, non-avoid)`);
    }

    // Fallback: si le pipeline ML n'a rien produit, utiliser les cotes brutes
    if (predictions.length === 0) {
      console.log('⚠️ Fallback: aucun pronostic ML, utilisation cotes brutes filtrées');
      predictions = matches.map((m: any) => ({
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
        _matchImportance: m._matchImportance || m.matchImportance || undefined,
      }));
    }

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
