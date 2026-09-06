/**
 * POST /api/live-calibration/test-bilan
 *
 * Endpoint de test : simule l'enregistrement de calibrations live
 * dans le store, puis génère un message bilan PREVIEW avec section
 * "RÉAJUSTEMENTS LIVE" et le retourne SANS le publier sur Telegram.
 *
 * Utilise 3 matchs mock réalistes (Liverpool, Real Madrid, Bayern)
 * pour valider le format du message avant publication réelle.
 */
import { NextRequest, NextResponse } from 'next/server';
import { calibrate } from '@/lib/liveCalibration/calibrate';
import { recordCalibration, clearStore, getStoreStats } from '@/lib/liveCalibration/store';
import { LiveCalibrationInput, LiveCalibrationOutput } from '@/lib/liveCalibration/types';

// Mock match 1 : Liverpool 1-0 Arsenal (confiance moyenne)
const MOCK_LIV_ARS: LiveCalibrationInput = {
  match_id: 'mock_liv_ars_001',
  home_team: 'Liverpool',
  away_team: 'Arsenal',
  league: 'Premier League',
  kickoff_utc: new Date().toISOString(),
  halftime_utc: new Date().toISOString(),
  score_ht: { home: 1, away: 0 },
  first_half: {
    duration_minutes: 47,
    shots: [
      { minute: 5, team: 'home', xg: 0.12, outcome: 'blocked', is_big_chance: false, is_penalty: false, location: 'outside_box' },
      { minute: 12, team: 'home', xg: 0.08, outcome: 'off_target', is_big_chance: false, is_penalty: false, location: 'penalty_area' },
      { minute: 18, team: 'away', xg: 0.05, outcome: 'saved', is_big_chance: false, is_penalty: false, location: 'outside_box' },
      { minute: 23, team: 'home', xg: 0.78, outcome: 'goal', is_big_chance: true, is_penalty: false, location: 'six_yard_box' },
      { minute: 28, team: 'home', xg: 0.42, outcome: 'saved', is_big_chance: true, is_penalty: false, location: 'penalty_area' },
      { minute: 33, team: 'away', xg: 0.15, outcome: 'off_target', is_big_chance: false, is_penalty: false, location: 'penalty_area' },
      { minute: 37, team: 'home', xg: 0.18, outcome: 'blocked', is_big_chance: false, is_penalty: false, location: 'penalty_area' },
      { minute: 41, team: 'away', xg: 0.22, outcome: 'saved', is_big_chance: false, is_penalty: false, location: 'penalty_area' },
      { minute: 44, team: 'home', xg: 0.35, outcome: 'post', is_big_chance: true, is_penalty: false, location: 'penalty_area' },
    ],
    summary: {
      xg_total: { home: 1.93, away: 0.42 },
      xg_big_chance: { home: 1.55, away: 0.0 },
      xg_penalty: { home: 0.0, away: 0.0 },
      xg_routine: { home: 0.38, away: 0.42 },
      shots_total: { home: 6, away: 3 },
      shots_on_target: { home: 3, away: 1 },
      possession_pct: { home: 62.3, away: 37.7 },
      field_tilt_pct: { home: 71.5, away: 28.5 },
      passes_final_third: { home: 45, away: 12 },
      pressures_high: { home: 18, away: 6 },
      corners: { home: 4, away: 1 },
      cards: { home_yellow: 1, away_yellow: 0, home_red: 0, away_red: 0 },
    },
    momentum_10min_windows: [
      { window_start: 0, window_end: 10, xg_home: 0.20, xg_away: 0.05 },
      { window_start: 10, window_end: 20, xg_home: 0.86, xg_away: 0.05 },
      { window_start: 20, window_end: 30, xg_home: 0.42, xg_away: 0.0 },
      { window_start: 30, window_end: 40, xg_home: 0.18, xg_away: 0.37 },
      { window_start: 40, window_end: 45, xg_home: 0.35, xg_away: 0.0 },
    ],
  },
  pre_match_model: {
    home_attack_rating: 1.85,
    home_defense_rating: 0.95,
    away_attack_rating: 1.55,
    away_defense_rating: 1.10,
    lambda_home: 1.75,
    lambda_away: 1.20,
    predicted_outcome_probs: { home: 0.52, draw: 0.25, away: 0.23 },
  },
  bookmaker_odds_ht: {
    home_win: 1.45,
    draw: 4.50,
    away_win: 6.50,
    over_2_5: 1.80,
    under_2_5: 2.00,
    btts_yes: 1.95,
    btts_no: 1.85,
  },
};

// Mock match 2 : Betis 0-0 Real Madrid
const MOCK_BET_MAD: LiveCalibrationInput = {
  match_id: 'mock_bet_mad_002',
  home_team: 'Real Betis',
  away_team: 'Real Madrid',
  league: 'La Liga',
  kickoff_utc: new Date().toISOString(),
  halftime_utc: new Date().toISOString(),
  score_ht: { home: 0, away: 0 },
  first_half: {
    duration_minutes: 46,
    shots: [
      { minute: 8, team: 'away', xg: 0.25, outcome: 'saved', is_big_chance: true, is_penalty: false, location: 'penalty_area' },
      { minute: 15, team: 'home', xg: 0.10, outcome: 'off_target', is_big_chance: false, is_penalty: false, location: 'outside_box' },
      { minute: 22, team: 'away', xg: 0.42, outcome: 'post', is_big_chance: true, is_penalty: false, location: 'penalty_area' },
      { minute: 31, team: 'away', xg: 0.15, outcome: 'blocked', is_big_chance: false, is_penalty: false, location: 'penalty_area' },
      { minute: 38, team: 'home', xg: 0.30, outcome: 'saved', is_big_chance: true, is_penalty: false, location: 'penalty_area' },
      { minute: 43, team: 'away', xg: 0.18, outcome: 'off_target', is_big_chance: false, is_penalty: false, location: 'penalty_area' },
    ],
    summary: {
      xg_total: { home: 0.40, away: 1.00 },
      xg_big_chance: { home: 0.30, away: 0.67 },
      xg_penalty: { home: 0.0, away: 0.0 },
      xg_routine: { home: 0.10, away: 0.33 },
      shots_total: { home: 2, away: 4 },
      shots_on_target: { home: 1, away: 1 },
      possession_pct: { home: 45.0, away: 55.0 },
      field_tilt_pct: { home: 35.0, away: 65.0 },
      passes_final_third: { home: 18, away: 32 },
      pressures_high: { home: 8, away: 14 },
      corners: { home: 1, away: 3 },
      cards: { home_yellow: 2, away_yellow: 1, home_red: 0, away_red: 0 },
    },
    momentum_10min_windows: [
      { window_start: 0, window_end: 10, xg_home: 0.0, xg_away: 0.25 },
      { window_start: 10, window_end: 20, xg_home: 0.10, xg_away: 0.0 },
      { window_start: 20, window_end: 30, xg_home: 0.0, xg_away: 0.42 },
      { window_start: 30, window_end: 40, xg_home: 0.30, xg_away: 0.15 },
      { window_start: 40, window_end: 45, xg_home: 0.0, xg_away: 0.18 },
    ],
  },
  pre_match_model: {
    home_attack_rating: 1.20,
    home_defense_rating: 1.10,
    away_attack_rating: 1.85,
    away_defense_rating: 0.90,
    lambda_home: 0.95,
    lambda_away: 1.55,
    predicted_outcome_probs: { home: 0.22, draw: 0.27, away: 0.51 },
  },
  bookmaker_odds_ht: {
    home_win: 5.50,
    draw: 3.20,
    away_win: 1.65,
    over_2_5: 2.10,
    under_2_5: 1.75,
    btts_yes: 1.90,
    btts_no: 1.90,
  },
};

// Mock match 3 : Schalke 0-2 Bayern (haute confiance)
const MOCK_SCH_BAY: LiveCalibrationInput = {
  match_id: 'mock_sch_bay_003',
  home_team: 'Schalke 04',
  away_team: 'Bayern Munich',
  league: 'Bundesliga',
  kickoff_utc: new Date().toISOString(),
  halftime_utc: new Date().toISOString(),
  score_ht: { home: 0, away: 2 },
  first_half: {
    duration_minutes: 47,
    shots: [
      { minute: 7, team: 'away', xg: 0.55, outcome: 'goal', is_big_chance: true, is_penalty: false, location: 'penalty_area' },
      { minute: 14, team: 'away', xg: 0.32, outcome: 'saved', is_big_chance: true, is_penalty: false, location: 'penalty_area' },
      { minute: 19, team: 'away', xg: 0.18, outcome: 'off_target', is_big_chance: false, is_penalty: false, location: 'outside_box' },
      { minute: 24, team: 'home', xg: 0.08, outcome: 'blocked', is_big_chance: false, is_penalty: false, location: 'penalty_area' },
      { minute: 31, team: 'away', xg: 0.45, outcome: 'goal', is_big_chance: true, is_penalty: false, location: 'six_yard_box' },
      { minute: 36, team: 'away', xg: 0.20, outcome: 'saved', is_big_chance: false, is_penalty: false, location: 'penalty_area' },
      { minute: 42, team: 'home', xg: 0.12, outcome: 'off_target', is_big_chance: false, is_penalty: false, location: 'outside_box' },
    ],
    summary: {
      xg_total: { home: 0.20, away: 1.70 },
      xg_big_chance: { home: 0.0, away: 1.32 },
      xg_penalty: { home: 0.0, away: 0.0 },
      xg_routine: { home: 0.20, away: 0.38 },
      shots_total: { home: 2, away: 5 },
      shots_on_target: { home: 0, away: 4 },
      possession_pct: { home: 32.0, away: 68.0 },
      field_tilt_pct: { home: 22.0, away: 78.0 },
      passes_final_third: { home: 8, away: 42 },
      pressures_high: { home: 4, away: 22 },
      corners: { home: 0, away: 5 },
      cards: { home_yellow: 2, away_yellow: 0, home_red: 0, away_red: 0 },
    },
    momentum_10min_windows: [
      { window_start: 0, window_end: 10, xg_home: 0.0, xg_away: 0.55 },
      { window_start: 10, window_end: 20, xg_home: 0.0, xg_away: 0.32 },
      { window_start: 20, window_end: 30, xg_home: 0.08, xg_away: 0.0 },
      { window_start: 30, window_end: 40, xg_home: 0.0, xg_away: 0.65 },
      { window_start: 40, window_end: 45, xg_home: 0.12, xg_away: 0.0 },
    ],
  },
  pre_match_model: {
    home_attack_rating: 0.80,
    home_defense_rating: 1.50,
    away_attack_rating: 2.20,
    away_defense_rating: 0.70,
    lambda_home: 0.65,
    lambda_away: 2.40,
    predicted_outcome_probs: { home: 0.10, draw: 0.18, away: 0.72 },
  },
  bookmaker_odds_ht: {
    home_win: 18.00,
    draw: 7.50,
    away_win: 1.10,
    over_2_5: 1.40,
    under_2_5: 2.95,
    btts_yes: 1.85,
    btts_no: 1.95,
  },
};

const MOCK_MATCHES = [MOCK_LIV_ARS, MOCK_BET_MAD, MOCK_SCH_BAY];

export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const publishTelegram = url.searchParams.get('publish') === 'true';

  try {
    // 1. Vider le store pour test propre
    clearStore();

    // 2. Enregistrer 3 calibrations mock
    console.log('🧪 [TEST BILAN] Enregistrement de 3 calibrations mock...');
    const recorded: LiveCalibrationOutput[] = [];
    for (const input of MOCK_MATCHES) {
      const output = calibrate(input);
      recordCalibration({
        match_id: input.match_id,
        home_team: input.home_team,
        away_team: input.away_team,
        league: input.league,
        kickoff_utc: input.kickoff_utc,
        halftime_utc: input.halftime_utc,
        score_ht: input.score_ht,
      }, output);
      recorded.push(output);
    }

    // 3. Stats du store
    const stats = getStoreStats();
    console.log(`📊 [TEST BILAN] Store: ${stats.today_entries} entrées, ${stats.published_count_today} publiées`);

    // 4. Générer le bilan preview (sans publication Telegram)
    const bilanPreview = buildBilanPreview(recorded);

    // 5. Optionnellement publier sur Telegram
    let telegramSent: boolean | undefined;
    if (publishTelegram) {
      const { sendTelegramPersonalMessage } = await import('@/lib/telegramService');
      telegramSent = await sendTelegramPersonalMessage(bilanPreview);
    }

    return NextResponse.json({
      success: true,
      store_stats: stats,
      calibrations_recorded: recorded.length,
      telegram_sent: telegramSent,
      bilan_preview: bilanPreview,
    });
  } catch (e: any) {
    console.error('❌ Test bilan error:', e);
    return NextResponse.json(
      { error: e.message, stack: e.stack?.split('\n').slice(0, 5) },
      { status: 500 },
    );
  }
}

/**
 * Construit un message bilan PREVIEW qui inclut la section
 * "RÉAJUSTEMENTS LIVE" — réplique la logique de publishDailyResultsToTelegram.
 */
function buildBilanPreview(calibrations: LiveCalibrationOutput[]): string {
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  let message = '';
  message += '╔═════════════════════════════╗\n';
  message += '║\n';
  message += '║   📊 <b>BILAN DE LA VEILLE</b>\n';
  message += '║\n';
  message += '╚═════════════════════════════╝\n\n';
  message += `📅 <b>${today.charAt(0).toUpperCase() + today.slice(1)}</b>\n\n`;

  // Section live
  const published = calibrations.filter(c => c.confidence_index >= 50);
  const skipped = calibrations.length - published.length;
  const avgConf = published.length > 0
    ? Math.round(published.reduce((acc, c) => acc + c.confidence_index, 0) / published.length)
    : 0;
  const totalVBs = published.reduce((acc, c) => acc + c.value_bets_detected.length, 0);

  message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  message += '🎯 <b>RÉAJUSTEMENTS LIVE (MI-TEMPS)</b>\n\n';
  message += `📊 ${calibrations.length} matchs analysés à la MT  ·  📨 ${published.length} publiés`;
  if (skipped > 0) message += `  ·  ⏸️ ${skipped} skip`;
  message += '\n';
  if (published.length > 0) {
    message += `🎯 Confiance moyenne: <b>${avgConf}/100</b>  ·  💎 ${totalVBs} value bets\n`;
  }
  message += '\n';

  const sorted = [...published].sort((a, b) => b.confidence_index - a.confidence_index);
  for (const c of sorted) {
    const confBar = c.confidence_index >= 85 ? '🟢' :
                    c.confidence_index >= 70 ? '🟡' :
                    c.confidence_index >= 50 ? '🟠' : '🔴';
    // Récupérer les infos du match via le mock
    const mockMatch = MOCK_MATCHES.find(m =>
      m.home_team === c.match_id || m.match_id === c.match_id
    ) || MOCK_MATCHES[MOCK_MATCHES.findIndex(m => m.home_team.length > 0)];
    // Plus simple : on prend juste les 3 mock dans l'ordre
    const idx = sorted.indexOf(c);
    const m = MOCK_MATCHES[MOCK_MATCHES.findIndex(mm => mm.match_id === c.match_id)] || MOCK_MATCHES[idx];

    message += `${confBar} <b>${m.home_team} ${m.score_ht.home}-${m.score_ht.away} ${m.away_team}</b>\n`;
    message += `    ${m.league}  ·  Confiance ${Math.round(c.confidence_index)}/100\n`;
    message += `    λ 2e MT: ${m.home_team.split(' ')[0]} ${c.lambda_remaining.lambda_home_2nd_half.toFixed(2)} · ${m.away_team.split(' ')[0]} ${c.lambda_remaining.lambda_away_2nd_half.toFixed(2)}\n`;
    if (c.value_bets_detected.length > 0) {
      const topVB = [...c.value_bets_detected].sort((a, b) => b.edge_pct - a.edge_pct)[0];
      const recBar = topVB.recommendation === 'HIGH_CONFIDENCE' ? '🟢' :
                     topVB.recommendation === 'LOW_STAKE' ? '🟡' : '🟠';
      message += `    ${recBar} Top VB: <b>${topVB.market.replace(/_/g, ' ').toUpperCase()}</b> +${topVB.edge_pct.toFixed(1)}% (cote ${topVB.bookmaker_odds.toFixed(2)} / fair ${topVB.fair_odds.toFixed(2)})\n`;
    }
    message += '\n';
  }

  message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  message += '🤖 Bilan journalier · Pronos du jour (safe + modéré)\n';
  message += '🎯 Section live ajoutée — module In-Play Calibration\n';
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━';

  return message;
}
