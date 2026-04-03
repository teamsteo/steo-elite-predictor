/**
 * API d'enrichissement des pronostics avec API-Football
 * Récupère blessures, suspensions et forme pour les matchs du jour
 * Optimisé pour économiser les 100 requêtes/jour
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getInjuriesAndSuspensions
} from '@/lib/apiFootball';

// Cache des enrichissements (2 heures TTL)
const enrichmentCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 heures

/**
 * GET - Récupérer les enrichissements pour un match
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const homeTeam = searchParams.get('homeTeam');
  const awayTeam = searchParams.get('awayTeam');
  
  if (!homeTeam || !awayTeam) {
    return NextResponse.json({
      success: false,
      error: 'homeTeam et awayTeam requis'
    }, { status: 400 });
  }
  
  // Vérifier le cache
  const cacheKey = `${homeTeam}-${awayTeam}`;
  const cached = enrichmentCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json({
      success: true,
      data: cached.data,
      cached: true
    });
  }
  
  try {
    // Récupérer les blessures des deux équipes
    const [homeInjuries, awayInjuries] = await Promise.all([
      getInjuriesAndSuspensions(homeTeam),
      getInjuriesAndSuspensions(awayTeam)
    ]);
    
    // Construire la réponse
    const data = {
      homeTeam: {
        injuryCount: homeInjuries.length,
        keyInjuries: homeInjuries.slice(0, 3).map((i: any) => ({
          player: i.player,
          type: i.type
        }))
      },
      awayTeam: {
        injuryCount: awayInjuries.length,
        keyInjuries: awayInjuries.slice(0, 3).map((i: any) => ({
          player: i.player,
          type: i.type
        }))
      },
      totalInjuries: homeInjuries.length + awayInjuries.length
    };
    
    // Mettre en cache
    enrichmentCache.set(cacheKey, { data, timestamp: Date.now() });
    
    return NextResponse.json({
      success: true,
      data,
      cached: false
    });
    
  } catch (error: any) {
    console.error('Erreur enrichissement pronos:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Erreur lors de l\'enrichissement'
    }, { status: 500 });
  }
}

/**
 * POST - Enrichir plusieurs matchs en batch (optimisé)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { matches } = body;
    
    if (!matches || !Array.isArray(matches)) {
      return NextResponse.json({
        success: false,
        error: 'Liste de matchs requise'
      }, { status: 400 });
    }
    
    const results: Record<string, any> = {};
    
    // Enrichir chaque match (avec cache)
    for (const match of matches.slice(0, 20)) { // Max 20 matchs
      const cacheKey = `${match.homeTeam}-${match.awayTeam}`;
      
      // Vérifier le cache d'abord
      const cached = enrichmentCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        results[cacheKey] = { ...cached.data, cached: true };
        continue;
      }
      
      // Récupérer les données
      try {
        const [homeInjuries, awayInjuries] = await Promise.all([
          getInjuriesAndSuspensions(match.homeTeam),
          getInjuriesAndSuspensions(match.awayTeam)
        ]);
        
        const data = {
          homeTeam: {
            injuryCount: homeInjuries.length,
            keyInjuries: homeInjuries.slice(0, 2).map((i: any) => i.player)
          },
          awayTeam: {
            injuryCount: awayInjuries.length,
            keyInjuries: awayInjuries.slice(0, 2).map((i: any) => i.player)
          },
          totalInjuries: homeInjuries.length + awayInjuries.length
        };
        
        results[cacheKey] = data;
        enrichmentCache.set(cacheKey, { data, timestamp: Date.now() });
        
      } catch (e) {
        // Ignorer les erreurs individuelles
        results[cacheKey] = { error: 'Non disponible' };
      }
    }
    
    return NextResponse.json({
      success: true,
      data: results
    });
    
  } catch (error: any) {
    console.error('Erreur batch enrichment:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
