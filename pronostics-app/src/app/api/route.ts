import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    name: 'Steo Élite Predictor API',
    version: '1.0.0',
    status: 'operational',
    endpoints: {
      matches: '/api/matches',
      realOdds: '/api/real-odds',
      insights: '/api/insights',
      bankroll: '/api/bankroll',
      predictions: '/api/predictions',
      analyzeLink: '/api/analyze-link',
    },
  });
}
