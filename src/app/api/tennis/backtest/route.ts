/**
 * API Backtesting Tennis - Calibration et validation du modèle
 * 
 * GET /api/tennis/backtest
 * - year: Année à tester (défaut: 2025)
 * - category: atp | wta (défaut: atp)
 * - limit: Nombre max de matchs (défaut: 1000)
 */

import { NextResponse } from 'next/server';
import { runBacktest, loadHistoricalMatches } from '@/lib/tennis-enhanced/backtesting';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') || '2025');
  const category = (searchParams.get('category') || 'atp') as 'atp' | 'wta';
  const limit = parseInt(searchParams.get('limit') || '1000');
  
  console.log(`[BacktestAPI] 🧪 Backtesting ${category.toUpperCase()} ${year}...`);
  
  try {
    // Charger les matchs historiques
    const matches = await loadHistoricalMatches(year, category);
    
    if (matches.length === 0) {
      return NextResponse.json({
        success: false,
        error: `Aucun match trouvé pour ${category.toUpperCase()} ${year}`,
        timestamp: new Date().toISOString(),
      });
    }
    
    // Limiter le nombre de matchs
    const limitedMatches = matches.slice(0, limit);
    
    // Lancer le backtest
    const result = await runBacktest(limitedMatches, { verbose: true });
    
    return NextResponse.json({
      success: true,
      params: { year, category, limit, actualMatches: limitedMatches.length },
      result,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('[BacktestAPI] Erreur:', error);
    return NextResponse.json({
      success: false,
      error: String(error),
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
