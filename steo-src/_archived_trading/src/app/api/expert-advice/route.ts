import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

// Configuration Vercel - 60 secondes max pour cette API
export const maxDuration = 60;

// Configuration GitHub
const GITHUB_REPO = 'steohidy/my-project';
const GITHUB_BRANCH = 'master';

import { getCrossValidatedMatches } from '@/lib/crossValidation';
import { generateExpertAdvice, ExpertAdvice } from '@/lib/expertAdvisor';
import ExpertAdviceStore, { ExpertAdvicesData } from '@/lib/expertAdviceStore';

/**
 * Charger les stats historiques - d'abord local, puis GitHub
 */
async function loadStatsHistory(): Promise<any> {
  // 1. Essayer de lire le fichier local (disponible sur Vercel)
  try {
    const localPath = path.join(process.cwd(), 'data/stats_history.json');
    if (fs.existsSync(localPath)) {
      const content = fs.readFileSync(localPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.log('⚠️ Impossible de lire stats_history local:', e);
  }
  
  // 2. Fallback: charger depuis GitHub
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/data/stats_history.json`,
      { next: { revalidate: 60 } }
    );
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.error('Erreur chargement stats_history:', e);
  }
  return null;
}

// Timeout wrapper
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

/**
 * Détermine quels matchs afficher selon l'heure UTC
 */
function getMatchesForCurrentTime(matches: any[]): { 
  matches: any[], 
  phase: string, 
  nextReset: string,
  stats: { football: number; basketball: number; finished: number }
} {
  const now = new Date();
  const hour = now.getUTCHours();
  
  const isNotFinished = (m: any) => m.status !== 'finished' && m.status !== 'STATUS_FINAL';
  
  const footballMatches = matches.filter(m => 
    (m.sport === 'Foot' || m.sport === 'Football') && isNotFinished(m)
  );
  const basketballMatches = matches.filter(m => 
    (m.sport === 'Basket' || m.sport === 'Basketball') && isNotFinished(m)
  );
  const finishedMatches = matches.filter(m => 
    m.status === 'finished' || m.status === 'STATUS_FINAL'
  );
  
  let phase: string;
  let selectedMatches: any[];
  let nextReset: string;
  
  if (hour >= 10 && hour < 22) {
    phase = '⚽ Phase Football (10h-22h UTC)';
    selectedMatches = footballMatches.slice(0, 5); // Max 5 pour fallback
    nextReset = '22h00 UTC (basculera vers NBA)';
  } else {
    phase = '🏀 Phase NBA (22h-10h UTC)';
    selectedMatches = basketballMatches.slice(0, 5); // Max 5 pour fallback
    nextReset = '10h00 UTC (basculera vers Football)';
  }
  
  return {
    matches: selectedMatches,
    phase,
    nextReset,
    stats: {
      football: footballMatches.length,
      basketball: basketballMatches.length,
      finished: finishedMatches.length
    }
  };
}

/**
 * GET - Récupérer les conseils experts
 * 
 * NOUVEAU: Lit d'abord les données pré-calculées depuis GitHub (rapide!)
 * Fallback: Calcule en temps réel si données non disponibles
 */
export async function GET(request: Request) {
  try {
    console.log('🎯 Expert Advice API: Requête reçue');
    
    // 1. Essayer de charger les données pré-calculées
    const precalcData = await ExpertAdviceStore.load();
    
    // Charger les stats expert depuis stats_history
    let expertStats = { expertWinRate: 0, expertWins: 0, expertTotal: 0 };
    try {
      const statsData = await loadStatsHistory();
      if (statsData?.summary?.expertAdvisor) {
        expertStats = {
          expertWinRate: statsData.summary.expertAdvisor.winRate || 0,
          expertWins: statsData.summary.expertAdvisor.wins || 0,
          expertTotal: statsData.summary.expertAdvisor.total || 0
        };
        console.log(`📊 Expert Stats: ${expertStats.expertWinRate}% (${expertStats.expertWins}/${expertStats.expertTotal})`);
      }
    } catch (e) {
      console.log('⚠️ Impossible de charger les stats expert');
    }
    
    // Utiliser les données pré-calculées si disponibles (même si anciennes)
    // C'est mieux que le timeout du fallback!
    if (precalcData.advices.length > 0) {
      const isFresh = ExpertAdviceStore.isFresh(precalcData);
      if (!isFresh) {
        console.log('⚠️ Données pré-calculées anciennes, mais utilisées pour éviter le timeout');
      }
      // Données pré-calculées disponibles!
      const now = new Date();
      const hour = now.getUTCHours();
      
      // Nouveau format: tous les sports pré-calculés
      let phase: string;
      if (precalcData.phase === 'all-sports') {
        phase = '🌟 Tous Sports (pré-calculé)';
      } else {
        phase = hour >= 10 && hour < 22 ? '⚽ Phase Football (10h-22h UTC)' : '🏀 Phase NBA (22h-10h UTC)';
      }
      
      console.log(`✅ Données pré-calculées: ${precalcData.advices.length} conseils (générés le ${precalcData.generatedAt})`);
      
      return NextResponse.json({
        advices: precalcData.advices,
        generatedAt: precalcData.generatedAt,
        phase,
        nextReset: precalcData.nextReset,
        totalMatches: precalcData.stats.football + precalcData.stats.basketball,
        stats: {
          football: precalcData.stats.football,
          basketball: precalcData.stats.basketball,
          finished: 0
        },
        // Stats Expert Advisor
        expertWinRate: expertStats.expertWinRate,
        expertWins: expertStats.expertWins,
        expertTotal: expertStats.expertTotal,
        source: 'precalculated',
        cached: true,
        dataAge: isFresh ? 'fresh' : 'stale'
      });
    }
    
    // 2. Données non disponibles ou expirées -> Fallback calcul en temps réel
    console.log('⚠️ Données pré-calculées non disponibles, calcul en temps réel...');
    
    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get('matchId');
    
    console.log('📊 Récupération des matchs...');
    const { matches } = await getCrossValidatedMatches();
    console.log(`📊 ${matches.length} matchs récupérés`);
    
    if (matches.length === 0) {
      return NextResponse.json({
        advices: [],
        generatedAt: new Date().toISOString(),
        totalMatches: 0,
        phase: 'Aucune donnée',
        nextReset: '-',
        message: 'Aucun match disponible',
        stats: { football: 0, basketball: 0, finished: 0 },
        source: 'fallback'
      });
    }
    
    // Match spécifique demandé
    if (matchId) {
      const match = matches.find(m => m.id === matchId);
      if (!match) {
        return NextResponse.json({ error: 'Match not found' }, { status: 404 });
      }
      
      try {
        const advice = await withTimeout(
          generateExpertAdvice({
            id: match.id,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            sport: match.sport,
            league: match.league,
            oddsHome: match.oddsHome,
            oddsDraw: match.oddsDraw,
            oddsAway: match.oddsAway,
          }),
          15000,
          'Timeout lors de l\'analyse'
        );
        
        return NextResponse.json({
          ...advice,
          source: 'fallback'
        });
      } catch {
        return NextResponse.json({ 
          error: 'Analyse trop longue',
          matchId
        }, { status: 408 });
      }
    }
    
    // Sélectionner les matchs selon l'heure
    const { matches: selectedMatches, phase, nextReset, stats } = getMatchesForCurrentTime(matches);
    
    console.log(`📊 Phase: ${phase}`);
    console.log(`📊 ${selectedMatches.length} matchs pour analyse fallback`);
    
    if (selectedMatches.length === 0) {
      return NextResponse.json({
        advices: [],
        generatedAt: new Date().toISOString(),
        phase,
        nextReset,
        message: 'Aucun match disponible pour cette phase',
        stats,
        source: 'fallback'
      });
    }
    
    // Calculer avec un timeout global plus court
    const advices: ExpertAdvice[] = [];
    
    const analysisPromises = selectedMatches.map(async (match) => {
      try {
        const advice = await withTimeout(
          generateExpertAdvice({
            id: match.id,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            sport: match.sport,
            league: match.league,
            oddsHome: match.oddsHome,
            oddsDraw: match.oddsDraw,
            oddsAway: match.oddsAway,
          }, { trackPrediction: false }),
          6000, // 6 secondes max par match (plus court)
          `Timeout ${match.homeTeam}`
        );
        
        console.log(`✅ ${match.homeTeam} vs ${match.awayTeam}`);
        return advice;
      } catch (error) {
        console.error(`❌ ${match.homeTeam} vs ${match.awayTeam}:`, error);
        return null;
      }
    });
    
    const results = await Promise.all(analysisPromises);
    for (const result of results) {
      if (result) advices.push(result);
    }
    
    // Trier par edge décroissant
    advices.sort((a, b) => b.oddsAnalysis.edge - a.oddsAnalysis.edge);
    
    console.log(`📊 ${advices.length} conseils générés (fallback)`);
    
    return NextResponse.json({
      advices,
      generatedAt: new Date().toISOString(),
      phase,
      nextReset,
      totalMatches: matches.length,
      analyzedMatches: selectedMatches.length,
      successCount: advices.length,
      stats,
      source: 'fallback',
      warning: 'Données calculées en temps réel (plus lent). Exécutez le script de pré-calcul pour de meilleures performances.'
    });
    
  } catch (error) {
    console.error('❌ Erreur API expert-advice:', error);
    return NextResponse.json({ 
      error: 'Server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * POST - Analyser un match personnalisé
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { homeTeam, awayTeam, sport = 'Foot', league = 'Personnalisé' } = body;
    
    if (!homeTeam || !awayTeam) {
      return NextResponse.json({ error: 'homeTeam et awayTeam requis' }, { status: 400 });
    }
    
    const customMatchId = `custom-${homeTeam.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    const estimatedOdds = estimateOdds(homeTeam, awayTeam, sport);
    
    try {
      const advice = await withTimeout(
        generateExpertAdvice({
          id: customMatchId,
          homeTeam,
          awayTeam,
          sport,
          league,
          oddsHome: estimatedOdds.home,
          oddsDraw: sport === 'Foot' ? estimatedOdds.draw : null,
          oddsAway: estimatedOdds.away,
        }),
        15000,
        'Timeout'
      );
      
      return NextResponse.json({
        ...advice,
        isCustomAnalysis: true,
        source: 'custom'
      });
    } catch {
      return NextResponse.json({ error: 'Analyse trop longue' }, { status: 408 });
    }
  } catch (error) {
    return NextResponse.json({ 
      error: 'Erreur',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}

function estimateOdds(home: string, away: string, sport: string): { home: number; draw: number; away: number } {
  const strong = new Set([
    'real madrid', 'barcelona', 'bayern', 'manchester city', 'liverpool', 'psg', 'juventus',
    'lakers', 'celtics', 'warriors', 'bucks', 'nuggets', 'suns'
  ]);
  
  const homeStrong = strong.has(home.toLowerCase());
  const awayStrong = strong.has(away.toLowerCase());
  
  if (sport === 'Basket') {
    if (homeStrong && !awayStrong) return { home: 1.45, draw: 0, away: 2.70 };
    if (!homeStrong && awayStrong) return { home: 2.50, draw: 0, away: 1.55 };
    return { home: 1.90, draw: 0, away: 1.90 };
  }
  
  if (homeStrong && !awayStrong) return { home: 1.40, draw: 4.50, away: 7.00 };
  if (!homeStrong && awayStrong) return { home: 5.50, draw: 3.80, away: 1.55 };
  return { home: 2.40, draw: 3.20, away: 2.90 };
}
