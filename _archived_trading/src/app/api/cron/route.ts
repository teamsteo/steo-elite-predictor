/**
 * Cron Job API - Automatisation quotidienne
 * Appelé par Vercel Cron:
 * - 00h UTC: Vérification résultats football soir (verify-evening)
 * - 04h UTC: Vérification résultats football matin (verify-morning)
 * - 05h UTC: Vérification résultats NBA nuit (verify-night)
 * - 05h30 UTC: Pré-calcul des pronostics (precalc)
 * 
 * Source principale: ESPN (gratuit, pas de clé API requise)
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
  league?: string;
  sport: 'football' | 'basketball';
}

// Ligues ESPN Football
const ESPN_FOOTBALL_LEAGUES = [
  { code: 'eng.1', name: 'Premier League' },
  { code: 'esp.1', name: 'La Liga' },
  { code: 'ger.1', name: 'Bundesliga' },
  { code: 'ita.1', name: 'Serie A' },
  { code: 'fra.1', name: 'Ligue 1' },
  { code: 'uefa.champions', name: 'Champions League' },
  { code: 'uefa.europa', name: 'Europa League' },
  { code: 'por.1', name: 'Liga Portugal' },
  { code: 'ned.1', name: 'Eredivisie' },
  { code: 'bel.1', name: 'Belgian Pro League' }
];

/**
 * Récupérer les résultats Football depuis ESPN (GRATUIT, pas de clé API)
 */
async function fetchFootballResultsFromESPN(): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  
  console.log(`📅 Recherche résultats football pour: ${yesterdayStr}`);

  // Récupérer les résultats de chaque ligue en parallèle
  const fetchPromises = ESPN_FOOTBALL_LEAGUES.map(async (league) => {
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.code}/scoreboard?dates=${yesterdayStr.replace(/-/g, '')}`,
        { 
          cache: 'no-store',
          headers: { 'Accept': 'application/json' }
        }
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      const events = data.events || [];

      return events
        .filter((e: any) => e.status?.type?.completed === true)
        .map((e: any) => {
          const competition = e.competitions?.[0];
          const home = competition?.competitors?.find((c: any) => c.homeAway === 'home');
          const away = competition?.competitors?.find((c: any) => c.homeAway === 'away');
          
          const homeScore = parseInt(home?.score || '0');
          const awayScore = parseInt(away?.score || '0');

          return {
            matchId: `espn_${e.id}`,
            homeTeam: home?.team?.displayName || home?.team?.shortDisplayName || 'Unknown',
            awayTeam: away?.team?.displayName || away?.team?.shortDisplayName || 'Unknown',
            homeScore,
            awayScore,
            status: 'finished' as const,
            actualResult: homeScore > awayScore 
              ? 'home' as const 
              : homeScore < awayScore 
                ? 'away' as const 
                : 'draw' as const,
            league: league.name,
            sport: 'football' as const
          };
        });
    } catch (error) {
      console.log(`⚠️ Erreur ESPN ${league.name}:`, error);
      return [];
    }
  });

  const allResults = await Promise.all(fetchPromises);
  const flatResults = allResults.flat();
  
  console.log(`✅ ESPN Football: ${flatResults.length} résultats récupérés`);
  return flatResults;
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
      console.log(`⚠️ ESPN NBA API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const events = data.events || [];

    // Filtrer les matchs terminés d'hier
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const results = events
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
              : 'draw' as const,
          league: 'NBA',
          sport: 'basketball' as const
        };
      });

    console.log(`✅ ESPN NBA: ${results.length} résultats récupérés`);
    return results;
  } catch (error) {
    console.error('Erreur ESPN NBA:', error);
    return [];
  }
}

/**
 * Matcher un résultat avec un pronostic (fuzzy matching amélioré)
 */
function matchPredictionWithResult(
  prediction: { homeTeam: string; awayTeam: string; league?: string },
  result: MatchResult
): boolean {
  const normalize = (s: string) => 
    s.toLowerCase()
     .normalize('NFD')
     .replace(/[\u0300-\u036f]/g, '')
     .replace(/[^a-z0-9]/g, '');

  const predHome = normalize(prediction.homeTeam);
  const predAway = normalize(prediction.awayTeam);
  const resHome = normalize(result.homeTeam);
  const resAway = normalize(result.awayTeam);

  // Match direct
  if (predHome === resHome && predAway === resAway) return true;
  
  // Match inversé (domicile/extérieur inversés)
  if (predHome === resAway && predAway === resHome) return true;
  
  // Match partiel (l'une contient l'autre)
  if ((predHome.includes(resHome) || resHome.includes(predHome)) && 
      (predAway.includes(resAway) || resAway.includes(predAway))) return true;
  
  // Match avec noms courts
  const predHomeShort = predHome.substring(0, 5);
  const predAwayShort = predAway.substring(0, 5);
  const resHomeShort = resHome.substring(0, 5);
  const resAwayShort = resAway.substring(0, 5);
  
  if (predHomeShort === resHomeShort && predAwayShort === resAwayShort) return true;

  return false;
}

/**
 * Vérifier les résultats NBA spécifiquement
 */
async function verifyNBAResults(): Promise<{
  verified: number;
  updated: number;
  won: number;
  lost: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let verified = 0;
  let updated = 0;
  let won = 0;
  let lost = 0;

  try {
    // Charger les données depuis GitHub
    const pending = (await PredictionStore.getPendingAsync()).filter(p => 
      p.sport === 'Basket' || p.sport === 'Basketball' || p.sport === 'NBA'
    );
    
    if (pending.length === 0) {
      console.log('📋 Aucun pronostic NBA en attente');
      return { verified: 0, updated: 0, won: 0, lost: 0, errors: [] };
    }

    console.log(`📋 ${pending.length} pronostics NBA en attente à vérifier`);

    // Récupérer les résultats NBA
    const nbaResults = await fetchNBAResults();

    // Pour chaque pronostic, chercher le résultat correspondant
    for (const prediction of pending) {
      verified++;
      
      const result = nbaResults.find(r => matchPredictionWithResult(prediction, r));
      
      if (result) {
        const predictedResult = prediction.predictedResult;
        const resultMatch = predictedResult === result.actualResult;
        
        const success = await PredictionStore.completeAsync(prediction.matchId, {
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          actualResult: result.actualResult,
          resultMatch,
          goalsMatch: undefined
        });

        if (success) {
          updated++;
          if (resultMatch) won++; else lost++;
          console.log(`✅ NBA: ${prediction.homeTeam} vs ${prediction.awayTeam}: ${resultMatch ? 'GAGNÉ' : 'PERDU'} (${result.homeScore}-${result.awayScore})`);
        }
      } else {
        console.log(`⏳ NBA: ${prediction.homeTeam} vs ${prediction.awayTeam}: résultat non trouvé`);
      }
    }

  } catch (error: any) {
    errors.push(error.message);
    console.error('Erreur vérification NBA:', error);
  }

  return { verified, updated, won, lost, errors };
}

/**
 * Vérifier les pronostics football
 */
async function verifyFootballResults(): Promise<{
  verified: number;
  updated: number;
  won: number;
  lost: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let verified = 0;
  let updated = 0;
  let won = 0;
  let lost = 0;

  try {
    // Charger les données depuis GitHub
    const pending = (await PredictionStore.getPendingAsync()).filter(p => 
      p.sport === 'Foot' || p.sport === 'Football' || p.sport === 'Soccer' || !p.sport
    );
    
    if (pending.length === 0) {
      console.log('📋 Aucun pronostic Football en attente');
      return { verified: 0, updated: 0, won: 0, lost: 0, errors: [] };
    }

    console.log(`📋 ${pending.length} pronostics Football en attente à vérifier`);

    // Récupérer les résultats Football depuis ESPN
    const footballResults = await fetchFootballResultsFromESPN();

    // Pour chaque pronostic, chercher le résultat correspondant
    for (const prediction of pending) {
      verified++;
      
      const result = footballResults.find(r => matchPredictionWithResult(prediction, r));
      
      if (result) {
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

        const success = await PredictionStore.completeAsync(prediction.matchId, {
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          actualResult,
          resultMatch,
          goalsMatch
        });

        if (success) {
          updated++;
          if (resultMatch) won++; else lost++;
          console.log(`✅ Football: ${prediction.homeTeam} vs ${prediction.awayTeam}: ${resultMatch ? 'GAGNÉ' : 'PERDU'} (${result.homeScore}-${result.awayScore})`);
        }
      } else {
        console.log(`⏳ Football: ${prediction.homeTeam} vs ${prediction.awayTeam}: résultat non trouvé`);
      }
    }

  } catch (error: any) {
    errors.push(error.message);
    console.error('Erreur vérification Football:', error);
  }

  return { verified, updated, won, lost, errors };
}

/**
 * Vérification complète (Football + NBA)
 */
async function verifyAllResults(): Promise<{
  verified: number;
  updated: number;
  won: number;
  lost: number;
  errors: string[];
}> {
  const [footballResult, nbaResult] = await Promise.all([
    verifyFootballResults(),
    verifyNBAResults()
  ]);

  return {
    verified: footballResult.verified + nbaResult.verified,
    updated: footballResult.updated + nbaResult.updated,
    won: footballResult.won + nbaResult.won,
    lost: footballResult.lost + nbaResult.lost,
    errors: [...footballResult.errors, ...nbaResult.errors]
  };
}

/**
 * Pré-calcul des pronostics du jour
 */
async function runPrecalc(): Promise<{ success: boolean; count: number; errors: string[] }> {
  const errors: string[] = [];

  try {
    console.log('📊 Invalidation du cache Expert Advices...');
    
    ExpertAdviceStore.invalidateCache();
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
    
    const completed = await PredictionStore.getCompletedAsync();
    
    if (completed.length < 10) {
      console.log('⚠️ Pas assez de données pour entraîner (< 10)');
      return { success: false, accuracy: 0, errors: ['Pas assez de données'] };
    }

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
        result = await runPrecalc();
        break;
        
      case 'verify-evening':
        result = await verifyAllResults();
        break;
        
      case 'verify-morning':
        result = await verifyAllResults();
        break;
        
      case 'verify-night':
        result = await verifyNBAResults();
        break;
        
      case 'verify':
        const verifyResult = await verifyAllResults();
        const mlResult = await trainMLModel();
        
        result = {
          verified: verifyResult.verified,
          updated: verifyResult.updated,
          won: verifyResult.won,
          lost: verifyResult.lost,
          errors: verifyResult.errors,
          mlTraining: mlResult
        };
        break;
        
      case 'test-espn':
        // Test des endpoints ESPN
        const [footResults, nbaResults] = await Promise.all([
          fetchFootballResultsFromESPN(),
          fetchNBAResults()
        ]);
        result = {
          football: footResults.length,
          nba: nbaResults.length,
          sampleFootball: footResults.slice(0, 3),
          sampleNBA: nbaResults.slice(0, 3)
        };
        break;
        
      default:
        return NextResponse.json(
          { error: 'Action non reconnue', validActions: ['precalc', 'verify', 'verify-evening', 'verify-morning', 'verify-night', 'test-espn'] },
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
        
      case 'verify-evening':
      case 'verify-morning':
        result = await verifyAllResults();
        break;
        
      case 'verify-night':
        result = await verifyNBAResults();
        break;
        
      case 'verify':
        const verifyResult = await verifyAllResults();
        const mlResult = await trainMLModel();
        
        result = {
          verified: verifyResult.verified,
          updated: verifyResult.updated,
          won: verifyResult.won,
          lost: verifyResult.lost,
          errors: verifyResult.errors,
          mlTraining: mlResult
        };
        break;
        
      case 'test-espn':
        const [footResults, nbaResults] = await Promise.all([
          fetchFootballResultsFromESPN(),
          fetchNBAResults()
        ]);
        result = {
          football: footResults.length,
          nba: nbaResults.length,
          sampleFootball: footResults.slice(0, 5),
          sampleNBA: nbaResults.slice(0, 5)
        };
        break;
        
      default:
        return NextResponse.json(
          { error: 'Action non reconnue', validActions: ['precalc', 'verify', 'verify-evening', 'verify-morning', 'verify-night', 'test-espn'] },
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
