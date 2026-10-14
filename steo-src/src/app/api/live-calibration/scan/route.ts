/**
 * GET /api/live-calibration/scan
 *
 * Scan : matchs football live à la mi-temps, calibre via pipeline bayésien,
 * publie les value bets (confidence >= 50) sur Telegram DM.
 *
 * Auth : accepte CRON_SECRET ou LIVE_CALIB_SECRET (header Bearer ou ?token=)
 *   - CRON_SECRET       : usage interne Vercel cron
 *   - LIVE_CALIB_SECRET : usage GitHub Actions (scan auto)
 *
 * Déclenchement :
 *   - Manuel via GitHub Actions (workflow_dispatch)
 *   - Cron GitHub Actions aux heures de mi-temps typiques
 *   - Appel direct avec token
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { getMatchesWithRealOdds, invalidateEspnCache } from '@/lib/combinedDataService';
import { sendTelegramPersonalMessage } from '@/lib/telegramService';
import { fetchUnderstatMatch, buildCalibrationInput } from '@/lib/liveCalibration/understatFetcher';
import { calibrate } from '@/lib/liveCalibration/calibrate';
import { formatCalibrationTelegram } from '@/lib/liveCalibration/telegramFormatter';
import { recordCalibration, isAlreadyPublished, markPublished, StoredCalibration } from '@/lib/liveCalibration/store';
import { persistCalibrationSnapshot } from '@/lib/liveCalibration/persistence';
import { isBettingWindow, bettingWindowRemainingMinutes } from '@/lib/liveCalibration/bettingWindow';

const FOOTBALL_SPORTS = new Set(['Football', 'football']);
const MIN_CONFIDENCE_TO_PUBLISH = 50;

// ============================================
// 🚨 ALERTE OPS — visibilité des échecs d'arrière-plan
// ============================================
// Depuis le passage en mode background (after), la réponse HTTP part 200
// AVANT la calibration : le cron GH Actions est donc vert même si le
// pipeline d'arrière-plan plante. Sans cette alerte, un échec ne laisserait
// AUCUNE trace observable (les console.error ne sont lus par personne).
// Throttle en mémoire : 1 alerte max par signature / 45 min — évite le spam
// si Understat est down pendant plusieurs runs cron consécutifs.
const ALERT_THROTTLE_MS = 45 * 60_000;
const alertThrottle = new Map<string, number>();

function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function notifyOpsFailure(signature: string, detail: string): Promise<void> {
  const last = alertThrottle.get(signature) ?? 0;
  if (Date.now() - last < ALERT_THROTTLE_MS) {
    console.log(`🔇 Alerte ops throttled (signature ${signature})`);
    return;
  }
  alertThrottle.set(signature, Date.now());
  try {
    const sent = await sendTelegramPersonalMessage(
      `🚨 <b>[LIVE CALIB] Échec arrière-plan</b>\n\n${detail}\n\n<i>Le scan a répondu 200 (mode background) — cette alerte est la seule trace visible de l'échec.</i>`,
      { disable_notification: false },
    );
    console.log(sent ? '📣 Alerte ops envoyée sur Telegram DM' : '⚠️ Alerte ops NON envoyée (Telegram indisponible)');
  } catch (e: any) {
    // On n'escalade jamais une erreur d'alerte : best-effort uniquement.
    console.error('❌ Alerte ops non envoyée:', e.message);
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  // Auth : accept CRON_SECRET ou LIVE_CALIB_SECRET (secret dédié pour GH Actions)
  const authHeader = request.headers.get('authorization');
  const tokenParam = new URL(request.url).searchParams.get('token');
  const cronSecret = process.env.CRON_SECRET;
  const liveCalibSecret = process.env.LIVE_CALIB_SECRET;
  const token = authHeader?.replace('Bearer ', '') || tokenParam;

  const authorized =
    (cronSecret && token === cronSecret) ||
    (liveCalibSecret && token === liveCalibSecret);

  if (!authorized) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  console.log('🎯 [LIVE CALIBRATION SCAN] Démarrage...');

  try {
    invalidateEspnCache();
    const matches = await getMatchesWithRealOdds(true);

    // ⏰ FENÊTRE DE PARI STRICTE — critique pour la rentabilité :
    //   On ne calibre QUE si le match est dans la fenêtre [42′, 55′].
    //   - clock < 42′ → 1ère MT pas finie, rien à recalibrer
    //   - clock > 55′ → 2e MT déjà bien entamée, les cotes live ont bougé,
    //     publier un value bet serait trompeur (impossible de parier au prix annoncé)
    //   - match fini → jamais
    const allLiveFootball = (matches || []).filter(
      (m: any) =>
        FOOTBALL_SPORTS.has(m.sport) &&
        m.isLive &&
        !m.isFinished,
    );

    const windowResults = allLiveFootball.map((m: any) => {
      const window = isBettingWindow(m.clock, m.period, m.isFinished);
      const wall = wallClockGuard(m.date);
      // Fenêtre effective = clock ESPN dans [42′,55′] ET wall-clock cohérent.
      // Si le clock ESPN dit "mi-temps" mais que le temps réel depuis le
      // kickoff contredit (match déjà fini, feed figé), on rejette.
      const effective = window.is_betting_window && !wall.ok
        ? { ...window, is_betting_window: false, reason: `${window.reason} — REJETÉ: ${wall.reason}` }
        : window;
      return { match: m, window: effective, wall };
    });

    const liveFootballHT = windowResults.filter(w => w.window.is_betting_window).map(w => w.match);

    // Logs détaillés du tri temporel (diagnostique les retards cron GH Actions)
    for (const w of windowResults) {
      console.log(`⏰ ${w.match.homeTeam} vs ${w.match.awayTeam} : ${w.window.reason}`);
    }

    console.log(`⚽ ${liveFootballHT.length} match(s) dans la fenêtre de pari (sur ${allLiveFootball.length} foot live)`);

    if (liveFootballHT.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucun match dans la fenêtre de pari mi-temps',
        scanned: matches?.length || 0,
        live_football: allLiveFootball.length,
        in_betting_window: 0,
        calibrated: 0,
        published: 0,
      });
    }

    // 🚀 RÉPONSE IMMÉDIATE + calibration en arrière-plan (after, Next 15).
    //
    // Avant : tout le pipeline (ESPN + Understat ×N + calibration + Telegram
    // + sleep 35s entre matchs) s'exécutait DANS la requête HTTP. Dès qu'UN
    // match était calibré, la durée dépassait le plafond serverless de 60s
    // (plan Hobby — le maxDuration:120 du vercel.json y est ignoré) →
    // FUNCTION_INVOCATION_TIMEOUT (504) → le cron GH Actions était marqué
    // FAILED alors que le message Telegram était déjà parti (run du
    // 2026-09-08 19:47 UTC : 504 à 62s, publication reçue). Aggravant :
    // l'ancien code dormait 35s même après le DERNIER match, et avec 2+
    // matchs le 2e n'était jamais traité (fonction tuée pendant le sleep
    // du 1er).
    //
    // Maintenant : on répond 200 dès le fetch ESPN (~10-20s), et le loop de
    // calibration tourne via after() — la fonction reste vivante après la
    // réponse (le travail background partage le même plafond 60s, d'où le
    // budget temps interne de processMatches).
    const queue = liveFootballHT.slice(0, 5).map((m: any) => `${m.homeTeam} vs ${m.awayTeam}`);
    console.log(`🚀 ${queue.length} match(s) mis en file de calibration (arrière-plan)`);

    after(async () => {
      try {
        await processMatches(liveFootballHT.slice(0, 5));
      } catch (e: any) {
        console.error('❌ [LIVE CALIBRATION SCAN] Erreur arrière-plan:', e.message);
        // 🚨 Alerte Telegram : le cron GH Actions voit un 200, il faut prévenir.
        await notifyOpsFailure(
          `fatal:${String(e.message || 'unknown').slice(0, 80)}`,
          `💥 Le pipeline d'arrière-plan a planté : <code>${escHtml(String(e.message || 'unknown').slice(0, 200))}</code>\nMatchs en file : ${queue.length}`,
        );
      }
    });

    return NextResponse.json({
      success: true,
      mode: 'background',
      scanned: matches?.length || 0,
      live_football: allLiveFootball.length,
      in_betting_window: liveFootballHT.length,
      queued_matches: queue,
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
 * 🔄 Pipeline de calibration par match — exécuté en arrière-plan (after()).
 *
 * ⏱️ BUDGET TEMPS : le travail background partage le plafond serverless de
 * 60s (plan Hobby) avec la phase inline (fetch ESPN, qui part à ~10-20s).
 * Budget 38s → on arrête proprement au-delà : les matchs déjà traités sont
 * publiés (Telegram + anti-doublon), les suivants sont repris par le
 * prochain run cron (toutes les 10 min) tant que la fenêtre [42′,55′]
 * est encore ouverte.
 */
async function processMatches(matches: any[]): Promise<void> {
  const BG_BUDGET_MS = 38_000;         // marge sous le plafond 60s (Hobby)
  const INTER_MATCH_DELAY_MS = 12_000; // rate-limit Understat (35s → 12s)
  const MIN_RESERVE_MS = 8_000;        // réserve minimale pour traiter 1 match
  const deadline = Date.now() + BG_BUDGET_MS;

  let publishedCount = 0;
  let skippedDuplicates = 0;
  const results: any[] = [];
  const failures: { match: string; error: string }[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];

    // ⏱️ Plus de budget → rend la main, le cron suivant reprendra.
    if (deadline - Date.now() < MIN_RESERVE_MS) {
      console.log(`⏱️ Budget arrière-plan épuisé — ${matches.length - i} match(s) reporté(s) au prochain run`);
      break;
    }

    try {
      // 🔒 ANTI-DOUBLON : ne jamais republier un match déjà publié
      // (les crons GH Actions passent toutes les 5-10 min, un match peut
      //  rester dans la fenêtre [42′,55′] pour 2 runs consécutifs)
      if (isAlreadyPublished(match.id)) {
        skippedDuplicates++;
        console.log(`⏭️ ${match.homeTeam} vs ${match.awayTeam} : déjà publié, skip`);
        continue;
      }

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

      // ⏰ Infos fenêtre de pari (pour le message Telegram et le bilan)
      const window = isBettingWindow(match.clock, match.period, match.isFinished);
      const remainingMin = bettingWindowRemainingMinutes(window.minutes, match.period);

      // 📊 Enregistrer dans le store (pour bilan quotidien Telegram)
      // On enregistre TOUTES les calibrations (même non publiées) pour que
      // le bilan puisse montrer "X matchs analysés à la mi-temps" même si 0 publication
      const stored: StoredCalibration = recordCalibration({
        match_id: input.match_id,
        home_team: input.home_team,
        away_team: input.away_team,
        league: input.league,
        kickoff_utc: input.kickoff_utc,
        halftime_utc: input.halftime_utc,
        score_ht: input.score_ht,
      }, output, {
        clock_at_calibration: window.minutes ?? undefined,
        betting_window_remaining_min: remainingMin ?? undefined,
        // 📊 Probas pre-match pour mesurer l'apport de la recalibration (Brier comparé)
        pre_match_probs: preMatchModel.predicted_outcome_probs,
      });

      // 💾 Snapshot permanent (fire-and-forget) : survit aux redéploiements,
      // permet au tracker du soir de retrouver la calibration même si
      // l'instance Vercel a été recyclée entre la MT et 22:30 UTC.
      persistCalibrationSnapshot(stored);

      results.push({
        match: `${match.homeTeam} vs ${match.awayTeam}`,
        league: match.league,
        confidence: output.confidence_index,
        value_bets_count: output.value_bets_detected.length,
        clock_at_calibration: window.minutes,
        betting_window_remaining_min: remainingMin,
      });

      // Publier si confiance suffisante
      if (output.confidence_index >= MIN_CONFIDENCE_TO_PUBLISH) {
        // ⏰ Timeout dynamique selon le temps restant de la fenêtre de pari :
        //   si la fenêtre ferme dans < 3 min, on NE PUBLIE PAS (le message
        //   arriverait trop tard pour que l'utilisateur puisse parier)
        if (remainingMin !== null && remainingMin < 3) {
          console.log(`⏰ Skip publication : fenêtre de pari ferme dans ${remainingMin} min (trop tard pour parier)`);
        } else {
          const message = formatCalibrationTelegram(
            match.homeTeam,
            match.awayTeam,
            match.league,
            output,
            {
              clock_at_calibration: window.minutes ?? undefined,
              betting_window_remaining_min: remainingMin ?? undefined,
            },
          );
          const sent = await sendTelegramPersonalMessage(message);
          if (sent) {
            publishedCount++;
            // 🔒 Marquer publié APRÈS envoi réussi (anti-doublon persistant)
            markPublished(input.match_id);
            console.log(`✅ Publié : ${match.homeTeam} vs ${match.awayTeam} (confiance ${output.confidence_index}, fenêtre ${remainingMin ?? '?'} min restantes)`);
          }
        }
      } else {
        console.log(`⏸️ Skip publication : confiance trop faible (${output.confidence_index} < ${MIN_CONFIDENCE_TO_PUBLISH})`);
      }

      // Délai entre matchs (rate limit Understat) — UNIQUEMENT s'il reste
      // un match à traiter ET du budget (l'ancien code dormait 35s même
      // après le DERNIER match → à lui seul, timeout 60s sur run à 1 match).
      if (i < matches.length - 1) {
        const wait = Math.min(INTER_MATCH_DELAY_MS, deadline - Date.now() - MIN_RESERVE_MS);
        if (wait > 2_000) await sleep(wait);
      }
    } catch (e: any) {
      console.error(`❌ Erreur calibration ${match.homeTeam} vs ${match.awayTeam}:`, e.message);
      failures.push({
        match: `${match.homeTeam} vs ${match.awayTeam}`,
        error: String(e.message || 'erreur inconnue').slice(0, 160),
      });
    }
  }

  // 🚨 Alerte consolidée (1 message max par run) si au moins un match a échoué.
  // Les reports pour budget épuisé ne sont PAS une erreur (reprise au run
  // suivant) → pas d'alerte pour eux.
  if (failures.length > 0) {
    const lines = failures.slice(0, 5)
      .map(f => `• ${escHtml(f.match)} — <code>${escHtml(f.error)}</code>`);
    const more = failures.length > 5 ? `\n… +${failures.length - 5} autre(s)` : '';
    await notifyOpsFailure(
      `matches:${failures.length}:${failures[0].error.slice(0, 60)}`,
      `⚠️ ${failures.length} match(s) n'ont pas pu être calibré(s) :\n${lines.join('\n')}${more}`,
    );
  }

  console.log(`🎯 [LIVE CALIBRATION SCAN] Terminé : ${results.length} calibré(s), ${publishedCount} publié(s), ${skippedDuplicates} doublon(s) skip, ${failures.length} échec(s)`);
}

/**
 * 🕐 GARDE-FOU HORAIRE (anti feed figé) — la garantie finale.
 *
 * Le clock ESPN peut MENTIR : feed figé, données en retard, match abandonné.
 * Ce garde-fou croise le clock ESPN avec le temps RÉEL écoulé depuis le kickoff :
 *   - wall < 40′  → physiquement impossible d'être à la pause → clock suspect
 *   - wall > 80′  → un clock ∈ [42′,55′] est impossible à cet instant
 *                   (80 min réelles = ~2e MT 65′) → feed figé, match
 *                   vraisemblablement terminé → JAMAIS de publication
 * Fenêtre physique de validité : 1ère MT finit vers 45-49′ réelles, pause
 * jusqu'à ~60′, 2e MT clock 55′ ≈ 70′ réelles (+arrêts de jeu ≈ 75′ max).
 */
function wallClockGuard(kickoffRaw: string | undefined): { ok: boolean; reason: string } {
  const kickoff = parseKickoffUtc(kickoffRaw);
  // Pas de timestamp fiable → on ne peut pas vérifier ; on laisse passer
  // (le clock ESPN + isFinished restent les gardes primaires).
  if (kickoff === null) {
    return { ok: true, reason: 'kickoff non parsable — garde-fou wall-clock inapplicable' };
  }
  const wallMin = (Date.now() - kickoff) / 60000;
  if (wallMin < 40) {
    return { ok: false, reason: `wall-clock ${Math.round(wallMin)}′ < 40′ — impossible d'être à la pause, clock ESPN suspect` };
  }
  if (wallMin > 80) {
    return { ok: false, reason: `wall-clock ${Math.round(wallMin)}′ > 80′ — match terminé ou feed figé, publication interdite` };
  }
  return { ok: true, reason: `wall-clock cohérent (${Math.round(wallMin)}′ depuis kickoff)` };
}

/**
 * Parse le kickoff ESPN en timestamp. Retourne null si non fiable.
 * ESPN renvoie parfois "2026-09-06T1900Z" (sans deux-points) → Date.parse = NaN.
 * Une date seule ("2026-09-06") est ignorée : elle donnerait un wall-clock faux.
 */
function parseKickoffUtc(raw: string | undefined): number | null {
  if (!raw) return null;
  // Format sans deux-points "T1900Z" → normaliser en "T19:00:00Z"
  const normalized = /^(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})Z$/.test(raw)
    ? raw.replace(/^(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})Z$/, '$1T$2:$3:00Z')
    : raw;
  // Date seule → inutilisable pour un wall-clock précis
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const t = Date.parse(normalized);
  return Number.isNaN(t) ? null : t;
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
