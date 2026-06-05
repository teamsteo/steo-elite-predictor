/**
 * Cron Job API - Automatisation quotidienne
 * Appelé par Vercel Cron:
 * - 6h UTC: Pré-calcul des pronostics du jour (action=precalc)
 * - 7h UTC: Vérification des résultats + ML training (action=verify)
 */

import { NextRequest, NextResponse } from 'next/server';
import { PredictionStore } from '@/lib/store';
import { ExpertAdviceStore } from '@/lib/expertAdviceStore';

// Secret pour sécuriser le cron
const CRON_SECRET = process.env.CRON_SECRET || 'steo-elite-cron-2026';

// Interfaces
interface MatchResult {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: 'finished';
  actualResult: 'home' | 'draw' | 'away';
}

/**
 * Récupérer les résultats Football depuis Football-Data API
 */
async function fetchFootballResults(): Promise<MatchResult[]> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    console.log('⚠️ FOOTBALL_DATA_API_KEY non configurée');
    return [];
  }

  try {
    // Récupérer les matchs d'hier
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateFrom = yesterday.toISOString().split('T')[0];
    const dateTo = dateFrom;

    const response = await fetch(
      `https://api.football-data.org/v4/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      {
        headers: { 'X-Auth-Token': apiKey },
        next: { revalidate: 0 }
      }
    );

    if (!response.ok) {
      console.log(`⚠️ Football-Data API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const matches = data.matches || [];

    return matches
      .filter((m: any) => m.status === 'FINISHED')
      .map((m: any) => ({
        matchId: `fd_${m.id}`,
        homeTeam: m.homeTeam?.name || m.homeTeam,
        awayTeam: m.awayTeam?.name || m.awayTeam,
        homeScore: m.score?.fullTime?.home ?? 0,
        awayScore: m.score?.fullTime?.away ?? 0,
        status: 'finished' as const,
        actualResult: m.score?.fullTime?.home > m.score?.fullTime?.away 
          ? 'home' as const 
          : m.score?.fullTime?.home < m.score?.fullTime?.away 
            ? 'away' as const 
            : 'draw' as const
      }));
  } catch (error) {
    console.error('Erreur Football-Data:', error);
    return [];
  }
}

/**
 * Récupérer les résultats NBA depuis ESPN
 */
async function fetchNBAResults(): Promise<MatchResult[]> {
  try {
    const response = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
      { cache: 'no-store' }
    );

    if (!response.ok) {
      console.log(`⚠️ ESPN API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const events = data.events || [];

    // Filtrer les matchs terminés d'hier
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    return events
      .filter((e: any) => {
        const eventDate = new Date(e.date).toISOString().split('T')[0];
        return e.status?.type?.completed === true && eventDate === yesterdayStr;
      })
      .map((e: any) => {
        const competition = e.competitions?.[0];
        const home = competition?.competitors?.find((c: any) => c.homeAway === 'home');
        const away = competition?.competitors?.find((c: any) => c.homeAway === 'away');
        
        const homeScore = parseInt(home?.score || '0');
        const awayScore = parseInt(away?.score || '0');

        return {
          matchId: `nba_${e.id}`,
          homeTeam: home?.team?.displayName || 'Unknown',
          awayTeam: away?.team?.displayName || 'Unknown',
          homeScore,
          awayScore,
          status: 'finished' as const,
          actualResult: homeScore > awayScore 
            ? 'home' as const 
            : homeScore < awayScore 
              ? 'away' as const 
              : 'draw' as const
        };
      });
  } catch (error) {
    console.error('Erreur ESPN NBA:', error);
    return [];
  }
}

/**
 * Matcher un résultat avec un pronostic (fuzzy matching)
 */
function matchPredictionWithResult(
  prediction: { homeTeam: string; awayTeam: string },
  result: MatchResult
): boolean {
  const normalize = (s: string) => 
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

  const predHome = normalize(prediction.homeTeam);
  const predAway = normalize(prediction.awayTeam);
  const resHome = normalize(result.homeTeam);
  const resAway = normalize(result.awayTeam);

  // Match direct ou inversé
  return (predHome === resHome && predAway === resAway) ||
         (predHome === resAway && predAway === resHome) ||
         (predHome.includes(resHome) && predAway.includes(resAway)) ||
         (resHome.includes(predHome) && resAway.includes(predAway));
}

/**
 * Vérifier les pronostics et mettre à jour les résultats
 */
async function verifyAndUpdatePredictions(): Promise<{
  verified: number;
  updated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let verified = 0;
  let updated = 0;

  try {
    // Récupérer les pronostics en attente
    const pending = PredictionStore.getPending();
    
    if (pending.length === 0) {
      console.log('📋 Aucun pronostic en attente');
      return { verified: 0, updated: 0, errors: [] };
    }

    console.log(`📋 ${pending.length} pronostics en attente à vérifier`);

    // Récupérer les résultats
    const [footballResults, nbaResults] = await Promise.all([
      fetchFootballResults(),
      fetchNBAResults()
    ]);

    const allResults = [...footballResults, ...nbaResults];
    console.log(`✅ ${allResults.length} résultats récupérés (Foot: ${footballResults.length}, NBA: ${nbaResults.length})`);

    // Pour chaque pronostic, chercher le résultat correspondant
    for (const prediction of pending) {
      verified++;
      
      const result = allResults.find(r => matchPredictionWithResult(prediction, r));
      
      if (result) {
        // Déterminer si le pronostic est correct
        const predictedResult = prediction.predictedResult;
        const actualResult = result.actualResult;
        
        const resultMatch = predictedResult === actualResult;
        
        // Vérifier les buts (Over/Under 2.5)
        let goalsMatch: boolean | undefined;
        if (prediction.predictedGoals) {
          const totalGoals = result.homeScore + result.awayScore;
          const isOver = prediction.predictedGoals.toLowerCase().includes('over');
          goalsMatch = isOver ? totalGoals > 2.5 : totalGoals < 2.5;
        }

        // Mettre à jour le pronostic
        const success = PredictionStore.complete(prediction.matchId, {
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          actualResult: actualResult,
          resultMatch,
          goalsMatch
        });

        if (success) {
          updated++;
          console.log(`✅ ${prediction.homeTeam} vs ${prediction.awayTeam}: ${resultMatch ? 'GAGNÉ' : 'PERDU'} (${result.homeScore}-${result.awayScore})`);
        }
      } else {
        console.log(`⏳ ${prediction.homeTeam} vs ${prediction.awayTeam}: résultat non trouvé`);
      }
    }

  } catch (error: any) {
    errors.push(error.message);
    console.error('Erreur vérification:', error);
  }

  return { verified, updated, errors };
}

/**
 * Pré-calcul des pronostics du jour (Version Vercel - légère)
 * Note: Le pré-calcul complet est fait localement et poussé sur GitHub
 * Cette fonction invalide juste le cache pour forcer le rechargement
 */
async function runPrecalc(): Promise<{ success: boolean; count: number; errors: string[] }> {
  const errors: string[] = [];

  try {
    console.log('📊 Invalidation du cache Expert Advices...');
    
    // Invalider le cache pour forcer le rechargement depuis GitHub
    ExpertAdviceStore.invalidateCache();
    
    // Recharger les données
    const data = await ExpertAdviceStore.load();
    
    console.log(`✅ Cache invalidé - ${data.totalAdvices} conseils disponibles`);
    
    return { success: true, count: data.totalAdvices, errors };
  } catch (error: any) {
    errors.push(error.message);
    console.error('Erreur pré-calcul:', error);
    return { success: false, count: 0, errors };
  }
}

/**
 * Entraînement du modèle ML
 */
async function trainMLModel(): Promise<{ success: boolean; accuracy: number; errors: string[] }> {
  const errors: string[] = [];

  try {
    console.log('🧠 Entraînement du modèle ML...');
    
    // Récupérer les pronostics vérifiés
    const completed = PredictionStore.getCompleted();
    
    if (completed.length < 10) {
      console.log('⚠️ Pas assez de données pour entraîner (< 10)');
      return { success: false, accuracy: 0, errors: ['Pas assez de données'] };
    }

    // Calculer la précision globale
    const correct = completed.filter(p => p.resultMatch === true).length;
    const accuracy = completed.length > 0 ? (correct / completed.length) * 100 : 0;

    console.log(`✅ ML training terminé - Précision: ${accuracy.toFixed(1)}% (${correct}/${completed.length})`);
    
    return { success: true, accuracy, errors };
  } catch (error: any) {
    errors.push(error.message);
    console.error('Erreur ML training:', error);
    return { success: false, accuracy: 0, errors };
  }
}

/**
 * GET - Cron job appelé par Vercel
 */
export async function GET(request: NextRequest) {
  // Vérifier l'authentification
  const authHeader = request.headers.get('authorization');
  const url = new URL(request.url);
  const urlSecret = url.searchParams.get('secret');
  const action = url.searchParams.get('action') || 'verify';
  
  const providedSecret = authHeader?.replace('Bearer ', '') || urlSecret;
  
  if (providedSecret !== CRON_SECRET) {
    return NextResponse.json(
      { error: 'Non autorisé' },
      { status: 401 }
    );
  }

  const startTime = Date.now();
  console.log(`🔄 Début du cron job - Action: ${action}`);

  try {
    let result: any = {};

    switch (action) {
      case 'precalc':
        // 6h GMT: Pré-calcul des pronostics
        result = await runPrecalc();
        break;
        
      case 'verify':
        // 7h GMT: Vérification des résultats + ML training
        const verifyResult = await verifyAndUpdatePredictions();
        const mlResult = await trainMLModel();
        const cleaned = PredictionStore.cleanup();
        
        result = {
          verified: verifyResult.verified,
          updated: verifyResult.updated,
          cleaned,
          mlTraining: mlResult
        };
        break;
        
      default:
        return NextResponse.json(
          { error: 'Action non reconnue', validActions: ['precalc', 'verify'] },
          { status: 400 }
        );
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Cron job terminé en ${duration}ms`);

    return NextResponse.json({
      success: true,
      action,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      ...result
    });

  } catch (error: any) {
    console.error('❌ Erreur cron job:', error);
    return NextResponse.json({
      success: false,
      action,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * POST - Permet de déclencher manuellement (admin)
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'verify';
  const startTime = Date.now();

  try {
    let result: any = {};

    switch (action) {
      case 'precalc':
        result = await runPrecalc();
        break;
        
      case 'verify':
        const verifyResult = await verifyAndUpdatePredictions();
        const mlResult = await trainMLModel();
        const cleaned = PredictionStore.cleanup();
        
        result = {
          verified: verifyResult.verified,
          updated: verifyResult.updated,
          cleaned,
          mlTraining: mlResult
        };
        break;
        
      default:
        return NextResponse.json(
          { error: 'Action non reconnue', validActions: ['precalc', 'verify'] },
          { status: 400 }
        );
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      action,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      ...result
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      action,
      error: error.message
    }, { status: 500 });
  }
}
