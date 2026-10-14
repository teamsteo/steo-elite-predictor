/**
 * POST /api/live-calibration
 *
 * Reçoit un payload LiveCalibrationInput (mi-temps) et retourne
 * le réajustement complet : fair odds, lambdas, confidence, value bets.
 *
 * Auth : bearer token (CRON_SECRET) ou param ?token=
 */
import { NextRequest, NextResponse } from 'next/server';
import { calibrate } from '@/lib/liveCalibration/calibrate';
import { LiveCalibrationInput } from '@/lib/liveCalibration/types';

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

  let input: LiveCalibrationInput;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'JSON invalide — expected LiveCalibrationInput payload' },
      { status: 400 },
    );
  }

  if (!input.match_id || !input.first_half || !input.pre_match_model) {
    return NextResponse.json(
      { error: 'Payload incomplet — match_id, first_half, pre_match_model requis' },
      { status: 400 },
    );
  }

  try {
    const output = calibrate(input);
    return NextResponse.json(output);
  } catch (e: any) {
    console.error('❌ Live calibration error:', e);
    return NextResponse.json(
      { error: e.message, stack: e.stack?.split('\n').slice(0, 5) },
      { status: 500 },
    );
  }
}
