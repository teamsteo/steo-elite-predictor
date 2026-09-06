/**
 * POST /api/live-calibration/backtest
 *
 * Endpoint de test : permet de soumettre un payload mock (match à la mi-temps)
 * et de voir le résultat de la calibration SANS publier sur Telegram.
 *
 * Utilisé pour :
 *   - Tester le module en local sans attendre un match live
 *   - Démontrer le pipeline à l'utilisateur
 *   - Débugger les calculs intermédiaires
 */
import { NextRequest, NextResponse } from 'next/server';
import { calibrate } from '@/lib/liveCalibration/calibrate';
import { formatCalibrationTelegram } from '@/lib/liveCalibration/telegramFormatter';
import { LiveCalibrationInput } from '@/lib/liveCalibration/types';

/**
 * Exemple de payload (Liverpool vs Arsenal, 1-0 à la mi-temps, domine en xG).
 */
const MOCK_INPUT: LiveCalibrationInput = {
  match_id: 'mock_liv_ars_001',
  home_team: 'Liverpool',
  away_team: 'Arsenal',
  league: 'Premier League',
  kickoff_utc: '2026-09-06T14:00:00Z',
  halftime_utc: '2026-09-06T14:48:30Z',
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

export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const withTelegram = url.searchParams.get('publish') === 'true';

  // Accept either body payload or use mock
  let input: LiveCalibrationInput = MOCK_INPUT;
  try {
    const body = await request.json();
    if (body && body.match_id) input = body;
  } catch {
    // Body vide ou invalide → utilise le mock
  }

  try {
    const output = calibrate(input);

    const response: any = {
      success: true,
      input,
      output,
    };

    if (withTelegram) {
      const { sendTelegramPersonalMessage } = await import('@/lib/telegramService');
      const message = formatCalibrationTelegram(
        input.home_team,
        input.away_team,
        input.league,
        output,
      );
      const sent = await sendTelegramPersonalMessage(message);
      response.telegram_sent = sent;
      response.telegram_message = message;
    }

    return NextResponse.json(response);
  } catch (e: any) {
    console.error('❌ Backtest error:', e);
    return NextResponse.json(
      { error: e.message, stack: e.stack?.split('\n').slice(0, 5) },
      { status: 500 },
    );
  }
}
