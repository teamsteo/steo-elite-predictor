import { NextResponse } from 'next/server';

/**
 * POST - Analyser un lien de pari (simulation)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL requise' }, { status: 400 });
    }

    // Simulation d'analyse
    const analysis = {
      url,
      isValid: url.includes('bet') || url.includes('pari') || url.includes('sport'),
      detectedMatches: Math.floor(Math.random() * 5) + 1,
      totalOdds: (Math.random() * 10 + 1.5).toFixed(2),
      riskLevel: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
      recommendation: Math.random() > 0.5 ? 'safe' : 'risky',
      warnings: [
        'Vérifiez toujours les cotes sur le site du bookmaker',
        'Les pronostics sont basés sur des analyses statistiques',
      ],
      analyzedAt: new Date().toISOString(),
    };

    return NextResponse.json(analysis);
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de l\'analyse' }, { status: 500 });
  }
}
