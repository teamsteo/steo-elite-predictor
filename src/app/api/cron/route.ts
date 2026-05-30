/**
 * Cron Job API - Automatisation quotidienne
 * Appelé par Vercel Cron:
 * - 00h UTC: Vérification résultats football soir (verify-evening)
 * - 04h UTC: Vérification résultats football matin (verify-morning)
 * - 05h UTC: Vérification résultats NBA nuit (verify-night)
 * - 05h30 UTC: Pré-calcul des pronostics (precalc)
 * - 06h00 UTC: Mise à jour données fondamentales (update-fundamentals)
 * 
 * Source principale: ESPN (gratuit, pas de clé API requise)
 */

import { NextRequest, NextResponse } from 'next/server';
import { PredictionStore } from '@/lib/store';
import { ExpertAdviceStore } from '@/lib/expertAdviceStore';
import { updateStatsHistory, forceUpdateStats } from '@/lib/statsUpdater';
import { syncPredictionsToML } from '@/lib/unifiedPredictionTracker';
import SupabaseStore from '@/lib/db-supabase';
import { updateFundamentalsForToday } from '@/lib/fundamental-cron';
import { trainUnifiedML, getUnifiedMLStats } from '@/lib/unifiedMLService';
import { 
  publishDailySummaryToTelegram, 
  publishValueBetsToTelegram,
  isSafeOrModerate
} from '@/lib/telegramService';
import { getMatchesWithRealOdds } from '@/lib/combinedDataService';
import { getBatchPredictions, getValueBets } from '@/lib/unifiedPredictionService';

// ============================================
// TENNIS INTEGRATION - Récupération prédictions tennis
// ============================================

interface TennisPrediction {
  matchId: string;
  player1: string;
  player2: string;
  tournament: string;
  surface: string;
  round: string;
  date: string;
  odds1: number;
  odds2: number;
  category: string;
  prediction: {
    winner: 'player1' | 'player2';
    winProbability: number;
    confidence: 'very_high' | 'high' | 'medium' | 'low';
    riskPercentage: number;
  };
  betting: {
    recommendedBet: boolean;
    kellyStake: number;
    winnerOdds: number;
    expectedValue: number;
  };
}

/**
 * Récupère les prédictions tennis depuis l'API interne
 */
async function getTennisPredictions(): Promise<TennisPrediction[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://my-project-zeta-five-85.vercel.app';
    const response = await fetch(`${baseUrl}/api/tennis?filter=recommended`, {
      next: { revalidate: 300 } // Cache 5 minutes
    });
    
    if (!response.ok) {
      console.log(`⚠️ API Tennis non disponible: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const predictions = data.predictions || [];
    
    console.log(`🎾 ${predictions.length} prédictions tennis récupérées`);
    return predictions;
  } catch (error) {
    console.error('Erreur récupération tennis:', error);
    return [];
  }
}

/**
 * Convertit une prédiction tennis au format Telegram
 */
function formatTennisForTelegram(tennis: TennisPrediction) {
  const winner = tennis.prediction.winner;
  const winnerName = winner === 'player1' ? tennis.player1 : tennis.player2;
  const winnerOdds = winner === 'player1' ? tennis.odds1 : tennis.odds2;
  
  return {
    homeTeam: tennis.player1,
    awayTeam: tennis.player2,
    sport: 'Tennis',
    league: `${tennis.tournament} (${tennis.category.toUpperCase()})`,
    date: tennis.date,
    displayDate: undefined,
    recommendation: `Victoire ${winnerName}`,
    confidence: tennis.prediction.confidence,
    valueBetDetected: tennis.betting.recommendedBet && tennis.betting.expectedValue > 5,
    valueBetType: tennis.betting.expectedValue > 5 ? `Edge +${tennis.betting.expectedValue}%` : null,
    riskPercentage: tennis.prediction.riskPercentage,
    winProbability: tennis.prediction.winProbability,
    oddsHome: tennis.odds1,
    oddsAway: tennis.odds2,
    oddsDraw: null,
  };
}

// Secret pour sécuriser le cron
const CRON_SECRET = process.env.CRON_SECRET || 'steo-elite-cron-2026';

/**
 * Ping la base Supabase (Historique ML) pour la garder active
 * Plan gratuit = pause après 7 jours d'inactivité
 */
async function pingSupabase(): Promise<{
  success: boolean;
  message: string;
  ml?: { available: boolean; message: string; latency?: number };
}> {
  try {
    const result = await SupabaseStore.ping();

    return {
      success: result.success,
      message: result.message,
      ml: {
        available: result.success,
        message: result.message,
        latency: result.latency
      }
    };
  } catch (e: any) {
    return {
      success: false,
      message: `❌ Erreur ping: ${e.message}`
    };
  }
}

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
  statsUpdate?: { success: boolean; message: string };
  mlSync?: { synced: number; mlStats: any };
}> {
  const [footballResult, nbaResult] = await Promise.all([
    verifyFootballResults(),
    verifyNBAResults()
  ]);

  const result = {
    verified: footballResult.verified + nbaResult.verified,
    updated: footballResult.updated + nbaResult.updated,
    won: footballResult.won + nbaResult.won,
    lost: footballResult.lost + nbaResult.lost,
    errors: [...footballResult.errors, ...nbaResult.errors],
    statsUpdate: undefined as { success: boolean; message: string } | undefined,
    mlSync: undefined as { synced: number; mlStats: any } | undefined
  };

  // Mettre à jour les statistiques si des résultats ont été vérifiés
  if (result.updated > 0) {
    console.log('📊 Mise à jour des statistiques...');
    try {
      const allPredictions = await PredictionStore.getAllAsync();
      const statsResult = await updateStatsHistory(allPredictions);
      result.statsUpdate = { success: statsResult.success, message: statsResult.message };
      console.log(statsResult.message);
    } catch (e: any) {
      console.error('❌ Erreur mise à jour stats:', e);
      result.statsUpdate = { success: false, message: e.message };
    }

    // Synchroniser avec le système ML
    console.log('🧠 Synchronisation avec le système ML...');
    try {
      const mlSyncResult = await syncPredictionsToML();
      result.mlSync = mlSyncResult;
      console.log(`✅ ML sync: ${mlSyncResult.synced} prédictions synchronisées`);
    } catch (e: any) {
      console.error('❌ Erreur sync ML:', e);
    }
  }

  return result;
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
 * Entraînement du modèle ML unifié (persisté dans Supabase)
 */
async function trainMLModel(): Promise<{ 
  success: boolean; 
  accuracy: number; 
  samplesUsed: number;
  patternsSaved: number;
  patternsUpdated: number;
  improvements: string[];
  errors: string[] 
}> {
  console.log('🧠 Entraînement du modèle ML unifié...');

  try {
    // Utiliser le nouveau service ML unifié avec persistance Supabase
    const result = await trainUnifiedML();
    
    if (result.success) {
      console.log(`✅ ML Training terminé - Accuracy: ${result.accuracy}%, Patterns: ${result.patternsSaved} nouveaux, ${result.patternsUpdated} mis à jour`);
    }
    
    return {
      success: result.success,
      accuracy: result.accuracy,
      samplesUsed: result.samplesUsed,
      patternsSaved: result.patternsSaved,
      patternsUpdated: result.patternsUpdated,
      improvements: result.improvements,
      errors: result.errors
    };
  } catch (error: any) {
    console.error('Erreur ML training:', error);
    return { 
      success: false, 
      accuracy: 0, 
      samplesUsed: 0,
      patternsSaved: 0,
      patternsUpdated: 0,
      improvements: [],
      errors: [error.message] 
    };
  }
}

/**
 * Synchronisation complète depuis Supabase (sans GitHub)
 * Calcule les statistiques globales
 */
async function fullSyncFromStatsHistory(): Promise<{
  success: boolean;
  message: string;
  stats?: any;
  errors?: string[];
}> {
  console.log('🔧 Synchronisation complète depuis Supabase...');

  try {
    // Récupérer toutes les prédictions depuis Supabase
    const allPredictions = await SupabaseStore.getAllPredictions();
    
    if (allPredictions.length === 0) {
      return { 
        success: true, 
        message: 'Aucune prédiction dans Supabase', 
        stats: { total: 0, completed: 0, pending: 0, wins: 0, losses: 0, winRate: 0 } 
      };
    }

    const completed = allPredictions.filter(p => p.status === 'completed');
    const pending = allPredictions.filter(p => p.status === 'pending');
    const wins = completed.filter(p => p.result_match === true);
    const losses = completed.filter(p => p.result_match === false);

    // Calculer les stats par sport
    const bySport: any = {
      football: { total: 0, wins: 0, losses: 0, winRate: 0 },
      basketball: { total: 0, wins: 0, losses: 0, winRate: 0 },
      hockey: { total: 0, wins: 0, losses: 0, winRate: 0 }
    };

    for (const p of completed) {
      const sport = (p.sport || '').toLowerCase();
      let key: 'football' | 'basketball' | 'hockey' = 'football';
      if (sport.includes('basket') || sport.includes('nba')) key = 'basketball';
      else if (sport.includes('hockey') || sport.includes('nhl')) key = 'hockey';

      bySport[key].total++;
      if (p.result_match === true) {
        bySport[key].wins++;
      } else {
        bySport[key].losses++;
      }
    }

    // Calculer winRates
    for (const sport of ['football', 'basketball', 'hockey'] as const) {
      if (bySport[sport].total > 0) {
        bySport[sport].winRate = Math.round((bySport[sport].wins / bySport[sport].total) * 100);
      }
    }

    const winRate = completed.length > 0 ? Math.round((wins.length / completed.length) * 100) : 0;

    console.log(`📈 Stats Supabase: ${wins.length}/${completed.length} = ${winRate}%`);

    return {
      success: true,
      message: `✅ Sync Supabase: ${completed.length} prédictions, ${wins.length} gagnées (${winRate}%)`,
      stats: {
        total: allPredictions.length,
        completed: completed.length,
        pending: pending.length,
        wins: wins.length,
        losses: losses.length,
        winRate,
        bySport: {
          football: `${bySport.football.wins}/${bySport.football.total} = ${bySport.football.winRate}%`,
          basketball: `${bySport.basketball.wins}/${bySport.basketball.total} = ${bySport.basketball.winRate}%`,
          hockey: `${bySport.hockey.wins}/${bySport.hockey.total} = ${bySport.hockey.winRate}%`
        }
      }
    };

  } catch (error: any) {
    console.error('❌ Erreur sync Supabase:', error);
    return {
      success: false,
      message: error.message,
      errors: [error.message]
    };
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

  // Ping Supabase pour éviter la mise en pause (plan gratuit)
  const pingResult = await pingSupabase();
  console.log(`📡 Ping Supabase: ${pingResult.message}`);

  try {
    let result: any = {};
    let supabasePing = pingResult;

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
        
        // Mettre à jour les résultats ML
        try {
          await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://my-project-zeta-five-85.vercel.app'}/api/ml/update-results`);
          console.log('✅ ML results updated');
        } catch (e) {
          console.log('⚠️ ML update failed:', e);
        }
        
        result = {
          verified: verifyResult.verified,
          updated: verifyResult.updated,
          won: verifyResult.won,
          lost: verifyResult.lost,
          errors: verifyResult.errors,
          statsUpdate: verifyResult.statsUpdate,
          mlSync: verifyResult.mlSync,
          mlTraining: mlResult
        };
        break;
        
      case 'update-ml':
        // Mise à jour spécifique des résultats ML
        try {
          const mlUpdateResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://my-project-zeta-five-85.vercel.app'}/api/ml/update-results`);
          const mlUpdateData = await mlUpdateResponse.json();
          result = { mlUpdate: mlUpdateData };
        } catch (e: any) {
          result = { mlUpdate: { success: false, error: e.message } };
        }
        break;
        
      case 'update-stats':
        // Forcer la mise à jour des statistiques
        try {
          const statsResult = await forceUpdateStats();
          result = { statsUpdate: statsResult };
        } catch (e: any) {
          result = { statsUpdate: { success: false, error: e.message } };
        }
        break;

      case 'sync-all':
        // Synchronisation complète depuis stats_history
        try {
          const syncResult = await fullSyncFromStatsHistory();
          result = { syncAll: syncResult };
        } catch (e: any) {
          result = { syncAll: { success: false, error: e.message } };
        }
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

      case 'ping':
        // Ping explicite des bases Supabase
        result = { ping: pingResult };
        break;

      case 'db-status':
        // Statut détaillé de la base de données
        const dbStats = await SupabaseStore.getStats();
        result = {
          database: {
            name: 'Historique ML (Base unique)',
            available: pingResult.success,
            message: pingResult.message,
            latency: pingResult.ml?.latency,
            stats: dbStats
          },
          config: {
            url: process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Configuré' : '❌ Non configuré',
            key: process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Configuré' : '❌ Non configuré'
          }
        };
        break;
        
      case 'update-fundamentals':
        // Mise à jour des données fondamentales (forme, blessures, news)
        try {
          const fundamentalResult = await updateFundamentalsForToday();
          result = { fundamentals: fundamentalResult };
        } catch (e: any) {
          result = { fundamentals: { success: false, error: e.message } };
        }
        break;
        
      case 'train-ml':
        // Entraînement manuel du modèle ML
        try {
          const mlTrainResult = await trainMLModel();
          result = { mlTraining: mlTrainResult };
        } catch (e: any) {
          result = { mlTraining: { success: false, error: e.message } };
        }
        break;
        
      case 'ml-stats':
        // Statistiques du modèle ML
        try {
          const mlStats = await getUnifiedMLStats();
          result = { mlStats };
        } catch (e: any) {
          result = { mlStats: { success: false, error: e.message } };
        }
        break;
        
      case 'telegram-summary':
        // Publier le résumé quotidien sur Telegram (UNIQUEMENT safe et modéré)
        // Inclut: Football + Basket + NHL + Tennis
        // Utilise le service de prédiction unifié pour calculer riskPercentage et confidence
        try {
          // 1. Récupérer les matchs Foot/Basket/NHL bruts
          const rawMatches = await getMatchesWithRealOdds();
          
          // Filtrer les matchs à venir (pas terminés, pas en cours)
          const upcomingMatches = rawMatches.filter((m: any) => 
            m.status !== 'finished' && !m.isFinished && !m.isLive
          );
          
          console.log(`📊 ${upcomingMatches.length} matchs à venir sur ${rawMatches.length} total`);
          
          // 2. Préparer les inputs pour le service ML unifié
          const matchInputs = upcomingMatches
            .filter((m: any) => m.oddsHome > 0 && m.oddsAway > 0) // Besoin de cotes
            .map((m: any) => ({
              id: m.id,
              homeTeam: m.homeTeam,
              awayTeam: m.awayTeam,
              sport: m.sport === 'Basket' ? 'NBA' as const : m.sport === 'NHL' ? 'NHL' as const : 'Foot' as const,
              league: m.league || 'Unknown',
              oddsHome: m.oddsHome || 2.0,
              oddsDraw: m.oddsDraw || null,
              oddsAway: m.oddsAway || 2.0,
            }));
          
          // 3. Calculer les prédictions ML
          console.log(`🧠 Calcul prédictions ML pour ${matchInputs.length} matchs...`);
          let mlPredictions: any[] = [];
          
          if (matchInputs.length > 0) {
            try {
              mlPredictions = await getBatchPredictions(matchInputs);
              console.log(`✅ ${mlPredictions.length} prédictions ML calculées`);
            } catch (mlError) {
              console.log(`⚠️ Erreur ML predictions: ${mlError}`);
            }
          }
          
          // 4. Formater pour Telegram avec riskPercentage calculé
          const footBasketPredictions = mlPredictions.map((pred: any) => {
            const match = upcomingMatches.find((m: any) => m.id === pred.matchId) || {};
            const bet = pred.recommendation?.bet;
            const confidence = pred.mlPrediction?.confidence || 'low';
            
            // riskPercentage = 100 - winProbability
            let winProb = 50;
            let riskPercentage = 50;
            let recommendation = '';
            
            if (bet === 'home') {
              winProb = pred.mlPrediction?.homeProb || 50;
              recommendation = `Victoire ${pred.homeTeam}`;
            } else if (bet === 'away') {
              winProb = pred.mlPrediction?.awayProb || 50;
              recommendation = `Victoire ${pred.awayTeam}`;
            } else if (bet === 'draw') {
              winProb = pred.mlPrediction?.drawProb || 33;
              recommendation = 'Match Nul';
            }
            
            riskPercentage = Math.round(100 - winProb);
            
            // Ajuster riskPercentage selon la confiance
            if (confidence === 'low') {
              riskPercentage = Math.max(riskPercentage, 60); // Low = au moins 60% risque
            }
            
            return {
              homeTeam: pred.homeTeam,
              awayTeam: pred.awayTeam,
              sport: pred.sport,
              league: pred.league,
              date: match.date || pred.generatedAt,
              displayDate: match.displayDate,
              recommendation: bet !== 'avoid' ? recommendation : undefined,
              confidence: confidence,
              valueBetDetected: pred.mlPrediction?.valueBet || false,
              valueBetType: pred.mlPrediction?.valueBetType,
              riskPercentage: riskPercentage,
              winProbability: Math.round(winProb),
              oddsHome: pred.odds?.home,
              oddsAway: pred.odds?.away,
              oddsDraw: pred.odds?.draw,
            };
          }).filter((p: any) => p.confidence !== 'low'); // Exclure les low confidence
          
          // 5. Récupérer les prédictions Tennis
          console.log('🎾 Récupération prédictions tennis pour Telegram...');
          const tennisPredictions = await getTennisPredictions();
          const tennisFormatted = tennisPredictions
            .filter(t => t.betting.recommendedBet && t.prediction.confidence !== 'low')
            .map(formatTennisForTelegram);
          
          // 6. Combiner toutes les prédictions
          const allPredictions = [...footBasketPredictions, ...tennisFormatted];
          
          const filteredCount = allPredictions.filter(p => isSafeOrModerate(p.riskPercentage)).length;
          const tennisCount = tennisFormatted.filter(p => isSafeOrModerate(p.riskPercentage)).length;
          
          console.log(`📊 Total: ${allPredictions.length} prédictions (${footBasketPredictions.length} foot/basket + ${tennisFormatted.length} tennis)`);
          console.log(`✅ Safe/Modéré: ${filteredCount} (${tennisCount} tennis)`);
          
          const telegramResult = await publishDailySummaryToTelegram(allPredictions);
          result = { 
            telegram: { 
              success: telegramResult, 
              total: allPredictions.length,
              published: filteredCount,
              excluded: allPredictions.length - filteredCount,
              breakdown: {
                footBasket: footBasketPredictions.length,
                tennis: tennisFormatted.length
              },
              message: telegramResult 
                ? `Résumé publié: ${filteredCount} pronostics safe/modéré sur Telegram (${tennisCount} tennis)`
                : 'Erreur publication Telegram'
            } 
          };
        } catch (e: any) {
          result = { telegram: { success: false, error: e.message } };
        }
        break;
        
      case 'telegram-valuebets':
        // Publier uniquement les value bets sur Telegram (UNIQUEMENT safe et modéré)
        // Inclut: Football + Basket + NHL + Tennis
        try {
          // 1. Récupérer les matchs Foot/Basket/NHL bruts
          const rawMatches = await getMatchesWithRealOdds();
          
          // Filtrer les matchs à venir
          const upcomingMatches = rawMatches.filter((m: any) => 
            m.status !== 'finished' && !m.isFinished && !m.isLive
          );
          
          // 2. Préparer les inputs pour le service ML unifié
          const matchInputs = upcomingMatches
            .filter((m: any) => m.oddsHome > 0 && m.oddsAway > 0)
            .map((m: any) => ({
              id: m.id,
              homeTeam: m.homeTeam,
              awayTeam: m.awayTeam,
              sport: m.sport === 'Basket' ? 'NBA' as const : m.sport === 'NHL' ? 'NHL' as const : 'Foot' as const,
              league: m.league || 'Unknown',
              oddsHome: m.oddsHome || 2.0,
              oddsDraw: m.oddsDraw || null,
              oddsAway: m.oddsAway || 2.0,
            }));
          
          // 3. Récupérer les value bets avec le service ML
          console.log(`💎 Calcul value bets ML pour ${matchInputs.length} matchs...`);
          let mlValueBets: any[] = [];
          
          if (matchInputs.length > 0) {
            try {
              mlValueBets = await getValueBets(matchInputs);
              console.log(`✅ ${mlValueBets.length} value bets ML détectés`);
            } catch (mlError) {
              console.log(`⚠️ Erreur value bets: ${mlError}`);
            }
          }
          
          // 4. Formater pour Telegram
          const footBasketValueBets = mlValueBets.map((pred: any) => {
            const match = upcomingMatches.find((m: any) => m.id === pred.matchId) || {};
            const bet = pred.recommendation?.bet;
            const confidence = pred.mlPrediction?.confidence || 'low';
            
            let winProb = 50;
            let riskPercentage = 50;
            let recommendation = '';
            
            if (bet === 'home') {
              winProb = pred.mlPrediction?.homeProb || 50;
              recommendation = `Victoire ${pred.homeTeam}`;
            } else if (bet === 'away') {
              winProb = pred.mlPrediction?.awayProb || 50;
              recommendation = `Victoire ${pred.awayTeam}`;
            } else if (bet === 'draw') {
              winProb = pred.mlPrediction?.drawProb || 33;
              recommendation = 'Match Nul';
            }
            
            riskPercentage = Math.round(100 - winProb);
            
            return {
              homeTeam: pred.homeTeam,
              awayTeam: pred.awayTeam,
              sport: pred.sport,
              league: pred.league,
              date: match.date || pred.generatedAt,
              displayDate: match.displayDate,
              recommendation: recommendation,
              confidence: confidence,
              valueBetDetected: true,
              valueBetType: pred.mlPrediction?.valueBetType,
              riskPercentage: riskPercentage,
              winProbability: Math.round(winProb),
              oddsHome: pred.odds?.home,
              oddsAway: pred.odds?.away,
              oddsDraw: pred.odds?.draw,
            };
          });
          
          // 5. Récupérer les value bets Tennis
          console.log('🎾 Récupération value bets tennis...');
          const tennisPredictions = await getTennisPredictions();
          const tennisValueBets = tennisPredictions
            .filter(t => t.betting.recommendedBet && t.betting.expectedValue > 5 && t.prediction.confidence !== 'low')
            .map(formatTennisForTelegram);
          
          // 6. Combiner
          const allValueBets = [...footBasketValueBets, ...tennisValueBets];

          const telegramResult = await publishValueBetsToTelegram(allValueBets);
          const valueBetsCount = allValueBets.filter(p => 
            p.valueBetDetected && 
            p.confidence !== 'low' && 
            isSafeOrModerate(p.riskPercentage)
          ).length;
          const tennisVBCount = tennisValueBets.filter(p => 
            p.valueBetDetected && 
            p.confidence !== 'low' && 
            isSafeOrModerate(p.riskPercentage)
          ).length;
          
          console.log(`💎 Value bets: ${valueBetsCount} (${tennisVBCount} tennis)`);
          
          result = { 
            telegram: { 
              success: telegramResult, 
              total: valueBetsCount,
              tennisValueBets: tennisVBCount,
              message: telegramResult 
                ? `${valueBetsCount} value bet(s) publié(s) sur Telegram (${tennisVBCount} tennis)`
                : 'Erreur ou aucun value bet à publier'
            } 
          };
        } catch (e: any) {
          result = { telegram: { success: false, error: e.message } };
        }
        break;
        
      default:
        return NextResponse.json(
          { error: 'Action non reconnue', validActions: ['precalc', 'verify', 'verify-evening', 'verify-morning', 'verify-night', 'update-ml', 'update-stats', 'update-fundamentals', 'train-ml', 'ml-stats', 'sync-all', 'ping', 'db-status', 'test-espn', 'telegram-summary', 'telegram-valuebets'] },
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
      supabase: supabasePing,
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

  // Ping Supabase pour éviter la mise en pause (plan gratuit)
  const pingResult = await pingSupabase();
  console.log(`📡 Ping Supabase: ${pingResult.message}`);

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
          statsUpdate: verifyResult.statsUpdate,
          mlSync: verifyResult.mlSync,
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
        
      case 'update-stats':
        // Forcer la mise à jour des statistiques
        try {
          const statsResult = await forceUpdateStats();
          result = { statsUpdate: statsResult };
        } catch (e: any) {
          result = { statsUpdate: { success: false, error: e.message } };
        }
        break;
        
      case 'sync-ml':
        // Forcer la synchronisation ML
        try {
          const mlSyncResult = await syncPredictionsToML();
          result = { mlSync: mlSyncResult };
        } catch (e: any) {
          result = { mlSync: { success: false, error: e.message } };
        }
        break;

      case 'sync-all':
        // Synchronisation complète depuis stats_history
        try {
          const syncResult = await fullSyncFromStatsHistory();
          result = { syncAll: syncResult };
        } catch (e: any) {
          result = { syncAll: { success: false, error: e.message } };
        }
        break;

      case 'ping':
        // Ping explicite de Supabase
        result = { ping: pingResult };
        break;

      case 'train-ml':
        // Entraînement manuel du modèle ML
        try {
          const mlTrainResult = await trainMLModel();
          result = { mlTraining: mlTrainResult };
        } catch (e: any) {
          result = { mlTraining: { success: false, error: e.message } };
        }
        break;
        
      case 'ml-stats':
        // Statistiques du modèle ML
        try {
          const mlStats = await getUnifiedMLStats();
          result = { mlStats };
        } catch (e: any) {
          result = { mlStats: { success: false, error: e.message } };
        }
        break;

      default:
        return NextResponse.json(
          { error: 'Action non reconnue', validActions: ['precalc', 'verify', 'verify-evening', 'verify-morning', 'verify-night', 'update-stats', 'sync-ml', 'sync-all', 'ping', 'train-ml', 'ml-stats', 'test-espn'] },
          { status: 400 }
        );
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      action,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      supabase: pingResult,
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
