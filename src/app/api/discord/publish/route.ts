import { NextResponse } from 'next/server';
import { 
  publishPredictionToDiscord, 
  publishDailySummaryToDiscord 
} from '@/lib/discordService';
import { getMatchesWithRealOdds } from '@/lib/combinedDataService';

/**
 * GET /api/discord/publish - Publie le résumé quotidien sur Discord
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'summary';
  const matchId = searchParams.get('matchId');

  try {
    // Vérifier que le webhook est configuré
    if (!process.env.DISCORD_WEBHOOK_URL) {
      return NextResponse.json({
        success: false,
        error: 'DISCORD_WEBHOOK_URL non configuré',
        hint: 'Ajoutez DISCORD_WEBHOOK_URL dans vos variables d\'environnement',
      }, { status: 500 });
    }

    if (type === 'summary') {
      // Publier le résumé quotidien
      const matches = await getMatchesWithRealOdds();
      
      const predictions = matches.map((m: any) => ({
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        sport: m.sport,
        recommendation: m.recommendations?.[0]?.label,
        confidence: m.confidence,
        valueBetDetected: m.valueBets?.length > 0,
      }));

      const success = await publishDailySummaryToDiscord(predictions);

      return NextResponse.json({
        success,
        message: success 
          ? `Résumé publié: ${predictions.length} matchs` 
          : 'Erreur lors de la publication',
        count: predictions.length,
      });
    }

    if (type === 'valuebets') {
      // Publier uniquement les value bets
      const matches = await getMatchesWithRealOdds();
      
      const valueBets = matches.filter((m: any) => 
        m.valueBets?.length > 0 && m.confidence !== 'low'
      );

      let published = 0;
      for (const match of valueBets.slice(0, 5)) {
        const success = await publishPredictionToDiscord({
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
        
        // Pause entre chaque envoi pour éviter le rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return NextResponse.json({
        success: published > 0,
        message: `${published} value bet(s) publié(s)`,
        total: valueBets.length,
      });
    }

    if (type === 'all' && matchId) {
      // Publier un match spécifique
      const matches = await getMatchesWithRealOdds();
      const match = matches.find((m: any) => m.id === matchId);
      
      if (!match) {
        return NextResponse.json({
          success: false,
          error: 'Match non trouvé',
        }, { status: 404 });
      }

      const success = await publishPredictionToDiscord({
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
        valueBetDetected: match.valueBets?.length > 0,
        valueBetType: match.valueBets?.[0]?.type,
        dateTag: match.dateTag,
        displayDate: match.displayDate,
        isLive: match.isLive,
        isEstimated: match.isEstimated,
      });

      return NextResponse.json({
        success,
        match: `${match.homeTeam} vs ${match.awayTeam}`,
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Type non supporté',
      availableTypes: ['summary', 'valuebets', 'all'],
    });

  } catch (error) {
    console.error('Erreur Discord publish:', error);
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 });
  }
}

/**
 * POST /api/discord/publish - Publie des pronostics personnalisés
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { predictions } = body;

    if (!predictions || !Array.isArray(predictions)) {
      return NextResponse.json({
        success: false,
        error: 'Liste de pronostics requise',
      }, { status: 400 });
    }

    let published = 0;
    for (const prediction of predictions.slice(0, 10)) {
      const success = await publishPredictionToDiscord(prediction);
      if (success) published++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return NextResponse.json({
      success: published > 0,
      published,
      total: predictions.length,
    });

  } catch (error) {
    console.error('Erreur Discord POST:', error);
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 });
  }
}
