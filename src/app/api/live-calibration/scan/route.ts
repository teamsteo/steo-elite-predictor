/**
 * GET /api/live-calibration/scan
 *
 * Cron : scanne les matchs football live à la mi-temps,
 * récupère les xG Understat, calibre les prédictions,
 * et publie les value bets sur Telegram (DM privé).
 *
 * - Auth : CRON_SECRET (header Bearer ou ?token=)
 * - Filtre : ne publie que les matchs avec confidence >= 50
 * - Rate limit : 1 match Understat / 30s max
 *
 * Cron schedule: every 10 minutes (see vercel.json)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getMatchesWithRealOdds, invalidateEspnCache } from '@/lib/combinedDataService';
import { sendTelegramPersonalMessage } from '@/lib/telegramService';
import { fetchUnderstatMatch, buildCalibrationInput } from '@/lib/liveCalibration/understatFetcher';
import { calibrate } from '@/lib/liveCalibration/calibrate';
import { formatCalibrationTelegram } from '@/lib/liveCalibration/telegramFormatter';

const FOOTBALL_SPORTS = new Set(['Football', 'football']);
const MIN_CONFIDENCE_TO_PUBLISH = 50;

export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  // Auth
  const authHeader = request.headers.get('authorization');
  const tokenParam = new URL(request.url).searchParams.get('token');
  const cronSecret = process.env.CRON_SECRET;
  const token = authHeader?.replace('Bearer ', '') || tokenParam;

  if (cronSecret && token !== cronSecret) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  console.log('🎯 [LIVE CALIBRATION SCAN] Démarrage...');

  try {
    invalidateEspnCache();
    const matches = await getMatchesWithRealOdds(true);

    // Filtrer : matchs de foot live à la mi-temps
    const liveFootballHT = (matches || []).filter(
      (m: any) =>
        FOOTBALL_SPORTS.has(m.sport) &&
        m.isLive &&
        !m.isFinished &&
        m.period === 2 && // 2nd half started = HT was reached
        m.clock &&
        (m.clock.includes('45') || m.clock.includes('46') ||
         m.clock.includes('47') || m.clock.includes('48') ||
         m.clock.includes('49') || m.clock.includes('50')),
    );

    console.log(`⚽ ${liveFootballHT.length} match(s) live à la mi-temps détecté(s)`);

    if (liveFootballHT.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucun match live à la mi-temps',
        scanned: matches?.length || 0,
        calibrated: 0,
        published: 0,
      });
    }

    const results: any[] = [];
    let publishedCount = 0;

    for (const match of liveFootballHT.slice(0, 5)) { // limite à 5 matchs par run
      try {
        console.log(`📡 Calibration : ${match.homeTeam} vs ${match.awayTeam}`);

        // Récupérer les xG Understat (ou fallback estimation)
        const understatData = await fetchUnderstatMatch(
          match.homeTeam,
          match.awayTeam,
          match.league,
          match.date,
        );

        // Construire le pre-match model à partir des cotes ESPN
        const preMatchModel = derivePreMatchModel(match);

        // Construire l'input
        const input = buildCalibrationInput(match, understatData, preMatchModel);
        if (!input) continue;

        // Calibrer
        const output = calibrate(input);

        results.push({
          match: `${match.homeTeam} vs ${match.awayTeam}`,
          league: match.league,
          confidence: output.confidence_index,
          value_bets_count: output.value_bets_detected.length,
        });

        // Publier si confiance suffisante
        if (output.confidence_index >= MIN_CONFIDENCE_TO_PUBLISH) {
          const message = formatCalibrationTelegram(
            match.homeTeam,
            match.awayTeam,
            match.league,
            output,
          );
          const sent = await sendTelegramPersonalMessage(message);
          if (sent) publishedCount++;
          console.log(`✅ Publié : ${match.homeTeam} vs ${match.awayTeam} (confiance ${output.confidence_index})`);
        } else {
          console.log(`⏸️ Skip publication : confiance trop faible (${output.confidence_index} < ${MIN_CONFIDENCE_TO_PUBLISH})`);
        }

        // Délai entre matchs pour respecter rate limit Understat
        await sleep(35_000);
      } catch (e: any) {
        console.error(`❌ Erreur calibration ${match.homeTeam} vs ${match.awayTeam}:`, e.message);
      }
    }

    console.log(`🎯 [LIVE CALIBRATION SCAN] Terminé : ${results.length} calibré(s), ${publishedCount} publié(s)`);

    return NextResponse.json({
      success: true,
      scanned: matches?.length || 0,
      live_at_halftime: liveFootballHT.length,
      calibrated: results.length,
      published: publishedCount,
      results,
    });
  } catch (e: any) {
    console.error('❌ Live calibration scan error:', e);
    return NextResponse.json(
      { error: e.message },
      { status: 500 },
    );
  }
}

/**
 * Déduit un pre-match model à partir des cotes ESPN.
 * À défaut d'avoir attack/defense ratings calibrés, on utilise les
 * implied probabilities (vig-adjusted) pour estimer les lambdas.
 */
function derivePreMatchModel(match: any): any {
  const oddsH = match.oddsHome || 2.0;
  const oddsD = match.oddsDraw || 3.3;
  const oddsA = match.oddsAway || 3.5;

  const ih = 1 / oddsH;
  const id = 1 / oddsD;
  const ia = 1 / oddsA;
  const total = ih + id + ia;
  const pH = ih / total;
  const pD = id / total;
  const pA = ia / total;

  // Estimate lambda via total goals expectation (2.5 average)
  const totalGoalsExp = 2.5;
  const sumWinProbs = pH + pA + 0.001;
  const lambdaHome = (totalGoalsExp * pH) / sumWinProbs;
  const lambdaAway = (totalGoalsExp * pA) / sumWinProbs;

  // Attack/defense ratings (relatifs, base 1.0)
  const homeAttack = Math.max(0.5, lambdaHome / 1.4);
  const awayAttack = Math.max(0.5, lambdaAway / 1.4);
  const homeDefense = Math.max(0.5, lambdaAway / 1.4);
  const awayDefense = Math.max(0.5, lambdaHome / 1.4);

  return {
    home_attack_rating: homeAttack,
    home_defense_rating: homeDefense,
    away_attack_rating: awayAttack,
    away_defense_rating: awayDefense,
    lambda_home: lambdaHome,
    lambda_away: lambdaAway,
    predicted_outcome_probs: { home: pH, draw: pD, away: pA },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
