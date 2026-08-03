import { NextResponse } from 'next/server';
import { timingSafeEqual } from '@/lib/timingSafeEqual';

// ============================================
// AUTHENTIFICATION
// ============================================
const CRON_SECRET = process.env.CRON_SECRET;
if (!CRON_SECRET) {
  console.error('[SECURITY] CRON_SECRET non configuré - endpoints write désactivés');
}

function verifyRequestAuth(request: Request): boolean {
  if (!CRON_SECRET) return false;
  const url = new URL(request.url);
  const urlSecret = url.searchParams.get('secret') || '';
  const authHeader = request.headers.get('authorization') || '';
  if (timingSafeEqual(urlSecret, CRON_SECRET)) return true;
  if (timingSafeEqual(authHeader, `Bearer ${CRON_SECRET}`)) return true;
  return false;
}

// Prédictions simulées pour la démo
let demoPredictions: any[] = [];

/**
 * GET - Récupérer les prédictions
 */
export async function GET() {
  return NextResponse.json(demoPredictions);
}

/**
 * POST - Ajouter une prédiction
 */
export async function POST(request: Request) {
  if (!verifyRequestAuth(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { matchId, betType, riskLevel } = body;

    const prediction = {
      id: Date.now().toString(),
      matchId,
      betType,
      riskLevel,
      result: 'pending',
      createdAt: new Date().toISOString(),
    };

    demoPredictions.push(prediction);

    return NextResponse.json({
      success: true,
      prediction,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
