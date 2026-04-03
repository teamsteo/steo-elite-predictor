import { NextResponse } from 'next/server';

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
