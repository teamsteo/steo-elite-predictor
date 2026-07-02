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
import SupabaseStore, { type DbPrediction } from '@/lib/db-supabase';
import { updateFundamentalsForToday } from '@/lib/fundamental-cron';
import { trainUnifiedML, getUnifiedMLStats } from '@/lib/unifiedMLService';
import { 
  publishDailySummaryToTelegram, 
  publishValueBetsToTelegram,
  publishKamikazeToTelegram,
  publishDailyResultsToTelegram,
  isSafeOrModerate,
  isKamikaze
} from '@/lib/telegramService';
import { getMatchesWithRealOdds } from '@/lib/combinedDataService';

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
  sport: 'football' | 'basketball' | 'baseball' | 'tennis' | 'other';
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
  { code: 'bel.1', name: 'Belgian Pro League' },
  { code: 'uefa.nations', name: 'UEFA Nations League' },
  { code: 'fifa.world', name: 'FIFA World Cup' },
  { code: 'fifa.world_cup_qual', name: 'World Cup Qualifiers' },
  { code: 'concacaf.gold_cup', name: 'Gold Cup' },
  { code: 'concacaf.ccl', name: 'Champions Cup' },
  { code: 'conmebol.libertadores', name: 'Copa Libertadores' },
  { code: 'conmebol.sudamericana', name: 'Copa Sudamericana' },
  { code: 'usa.1', name: 'MLS' },
  { code: 'bra.1', name: 'Brasileirão' },
  { code: 'arg.1', name: 'Liga Profesional' },
];

/**
 * Récupérer les résultats Football depuis ESPN (GRATUIT, pas de clé API)
 * Cherche sur 3 jours (avant-hier, hier, aujourd'hui) pour rattraper les matchs manqués
 */
async function fetchFootballResultsFromESPN(): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  const dates: string[] = [];
  const today = new Date();
  for (let i = 3; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0].replace(/-/g, ''));
  }
  console.log(`📅 Recherche résultats football pour: ${dates.join(', ')}`);

  // Récupérer les résultats de chaque ligue et chaque date en parallèle
  const fetchPromises = ESPN_FOOTBALL_LEAGUES.flatMap(league =>
    dates.map(async (dateStr) => {
      try {
        const response = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.code}/scoreboard?dates=${dateStr}`,
          { 
            cache: 'no-store',
            headers: { 'Accept': 'application/json' }
          }
        );

        if (!response.ok) return [];

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
        console.log(`⚠️ Erreur ESPN ${league.name} ${dateStr}:`, error);
        return [];
      }
    })
  );

  const allResults = await Promise.all(fetchPromises);
  const flatResults = allResults.flat();
  
  console.log(`✅ ESPN Football: ${flatResults.length} résultats récupérés`);
  return flatResults;
}

/**
 * Récupérer les résultats NBA depuis ESPN
 * Cherche sur 3 jours (avant-hier, hier, aujourd'hui) pour rattraper les matchs manqués
 */
async function fetchNBAResults(): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  const today = new Date();
  const dates: string[] = [];
  for (let i = 3; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0].replace(/-/g, ''));
  }

  for (const dateStr of dates) {
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`,
        { cache: 'no-store' }
      );

      if (!response.ok) continue;

      const data = await response.json();
      const events = data.events || [];

      for (const e of events) {
        if (e.status?.type?.completed !== true) continue;
        const competition = e.competitions?.[0];
        const home = competition?.competitors?.find((c: any) => c.homeAway === 'home');
        const away = competition?.competitors?.find((c: any) => c.homeAway === 'away');
        
        const homeScore = parseInt(home?.score || '0');
        const awayScore = parseInt(away?.score || '0');

        results.push({
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
        });
      }
    } catch (error) {
      console.log(`⚠️ Erreur ESPN NBA ${dateStr}:`, error);
    }
  }

  console.log(`✅ ESPN NBA: ${results.length} résultats récupérés`);
  return results;
}

/**
 * Matcher un résultat avec un pronostic (fuzzy matching amélioré)
 * Fonctionne avec DbPrediction (home_team/away_team) ou Prediction locale (homeTeam/awayTeam)
 */
function matchPredictionWithResult(
  prediction: { homeTeam?: string; awayTeam?: string; home_team?: string; away_team?: string; league?: string },
  result: MatchResult
): boolean {
  const normalize = (s: string) => 
    s.toLowerCase()
     .normalize('NFD')
     .replace(/[\u0300-\u036f]/g, '')
     .replace(/[^a-z0-9]/g, '');

  const predHome = normalize(prediction.homeTeam || prediction.home_team || '');
  const predAway = normalize(prediction.awayTeam || prediction.away_team || '');
  const resHome = normalize(result.homeTeam);
  const resAway = normalize(result.awayTeam);

  if (!predHome || !predAway) return false;

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
 * Vérifier les résultats NBA (directement dans Supabase)
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
    // Récupérer les pronostics NBA pending depuis Supabase
    const allPending = await SupabaseStore.getPendingPredictions();
    const pending = allPending.filter(p => p.sport === 'basketball');

    if (pending.length === 0) {
      console.log('📋 Aucun pronostic NBA en attente dans Supabase');
      return { verified: 0, updated: 0, won: 0, lost: 0, errors: [] };
    }

    console.log(`📋 ${pending.length} pronostics NBA en attente à vérifier`);

    // Récupérer les résultats NBA
    const nbaResults = await fetchNBAResults();

    if (nbaResults.length === 0) {
      console.log('🏀 Aucun résultat NBA trouvé sur ESPN');
      return { verified: 0, updated: 0, won: 0, lost: 0, errors: [] };
    }

    // Pour chaque pronostic, chercher le résultat correspondant
    for (const prediction of pending) {
      verified++;
      
      const result = nbaResults.find(r => matchPredictionWithResult(prediction, r));
      
      if (result) {
        const predictedResult = prediction.predicted_result;
        const actualResult = result.actualResult;
        const resultMatch = predictedResult === actualResult;

        // Mettre à jour Supabase directement
        const success = await SupabaseStore.completePrediction(prediction.match_id, {
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          actualResult,
          resultMatch,
          goalsMatch: undefined,
        });

        if (success) {
          updated++;
          if (resultMatch) won++; else lost++;
          console.log(`✅ NBA: ${prediction.home_team} vs ${prediction.away_team}: ${resultMatch ? 'GAGNÉ' : 'PERDU'} (${result.homeScore}-${result.awayScore})`);
        }
      } else {
        console.log(`⏳ NBA: ${prediction.home_team} vs ${prediction.away_team}: résultat non trouvé sur ESPN`);
      }
    }

  } catch (error: any) {
    errors.push(error.message);
    console.error('Erreur vérification NBA:', error);
  }

  return { verified, updated, won, lost, errors };
}

/**
 * Vérifier les pronostics football (directement dans Supabase)
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
    // Récupérer les pronostics football pending depuis Supabase
    const allPending = await SupabaseStore.getPendingPredictions();
    const pending = allPending.filter(p => p.sport === 'football');

    if (pending.length === 0) {
      console.log('📋 Aucun pronostic Football en attente dans Supabase');
      return { verified: 0, updated: 0, won: 0, lost: 0, errors: [] };
    }

    console.log(`📋 ${pending.length} pronostics Football en attente à vérifier`);

    // Récupérer les résultats Football depuis ESPN
    const footballResults = await fetchFootballResultsFromESPN();

    if (footballResults.length === 0) {
      console.log('⚽ Aucun résultat football trouvé sur ESPN');
      return { verified: 0, updated: 0, won: 0, lost: 0, errors: [] };
    }

    // Pour chaque pronostic, chercher le résultat correspondant
    for (const prediction of pending) {
      verified++;
      
      const result = footballResults.find(r => matchPredictionWithResult(prediction, r));
      
      if (result) {
        const predictedResult = prediction.predicted_result;
        const actualResult = result.actualResult;
        const resultMatch = predictedResult === actualResult;

        // Vérifier les buts (Over/Under 2.5)
        let goalsMatch: boolean | undefined;
        if (prediction.predicted_goals) {
          const totalGoals = result.homeScore + result.awayScore;
          const isOver = prediction.predicted_goals.toLowerCase().includes('over');
          goalsMatch = isOver ? totalGoals > 2.5 : totalGoals < 2.5;
        }

        // Mettre à jour Supabase directement
        const success = await SupabaseStore.completePrediction(prediction.match_id, {
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          actualResult,
          resultMatch,
          goalsMatch
        });

        if (success) {
          updated++;
          if (resultMatch) won++; else lost++;
          console.log(`✅ Football: ${prediction.home_team} vs ${prediction.away_team}: ${resultMatch ? 'GAGNÉ' : 'PERDU'} (${result.homeScore}-${result.awayScore})`);
        }
      } else {
        console.log(`⏳ Football: ${prediction.home_team} vs ${prediction.away_team}: résultat non trouvé sur ESPN`);
      }
    }

  } catch (error: any) {
    errors.push(error.message);
    console.error('Erreur vérification Football:', error);
  }

  return { verified, updated, won, lost, errors };
}

// ============================================
// VÉRIFICATION MLB (ESPN → Supabase)
// ============================================

/**
 * Récupérer les résultats MLB depuis ESPN (GRATUIT)
 * Cherche sur 3 jours pour rattraper les matchs manqués
 */
async function fetchMLBResultsFromESPN(): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  const dates: string[] = [];
  const today = new Date();
  for (let i = 3; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0].replace(/-/g, ''));
  }

  console.log(`⚾ Recherche résultats MLB pour: ${dates.join(', ')}`);

  for (const dateStr of dates) {
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${dateStr}`,
        { cache: 'no-store' }
      );

      if (!response.ok) continue;

      const data = await response.json();
      const events = data.events || [];

      for (const e of events) {
        if (e.status?.type?.completed !== true) continue;
        const competition = e.competitions?.[0];
        const home = competition?.competitors?.find((c: any) => c.homeAway === 'home');
        const away = competition?.competitors?.find((c: any) => c.homeAway === 'away');

        if (!home || !away) continue;

        const homeScore = parseInt(home?.score || '0');
        const awayScore = parseInt(away?.score || '0');

        results.push({
          matchId: `mlb_${e.id}`,
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
          league: 'MLB',
          sport: 'baseball' as const
        });
      }
    } catch (error) {
      console.log(`⚠️ Erreur ESPN MLB ${dateStr}:`, error);
    }
  }

  console.log(`✅ ESPN MLB: ${results.length} résultats récupérés`);
  return results;
}

/**
 * Vérifier les pronostics MLB/other (directement dans Supabase)
 * Gère le baseball et tout sport classé 'other' dans Supabase
 */
async function verifyMLBResults(): Promise<{
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
    // Récupérer les pronostics MLB/other pending depuis Supabase
    const allPending = await SupabaseStore.getPendingPredictions();
    const pending = allPending.filter(p => p.sport === 'other' || p.sport === 'hockey' || p.league?.includes('MLB') || p.league?.includes('NHL'));

    if (pending.length === 0) {
      console.log('📋 Aucun pronostic MLB/other en attente dans Supabase');
      return { verified: 0, updated: 0, won: 0, lost: 0, errors: [] };
    }

    console.log(`📋 ${pending.length} pronostics MLB/other en attente à vérifier`);

    // Récupérer les résultats MLB depuis ESPN
    const mlbResults = await fetchMLBResultsFromESPN();

    if (mlbResults.length === 0) {
      console.log('⚾ Aucun résultat MLB trouvé sur ESPN');
      return { verified: 0, updated: 0, won: 0, lost: 0, errors: [] };
    }

    // Pour chaque pronostic, chercher le résultat correspondant
    for (const prediction of pending) {
      verified++;

      const result = mlbResults.find(r => matchPredictionWithResult(prediction, r));

      if (result) {
        const predictedResult = prediction.predicted_result;
        const actualResult = result.actualResult;
        const resultMatch = predictedResult === actualResult;

        // Mettre à jour Supabase directement
        const success = await SupabaseStore.completePrediction(prediction.match_id, {
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          actualResult,
          resultMatch,
          goalsMatch: undefined,
        });

        if (success) {
          updated++;
          if (resultMatch) won++; else lost++;
          console.log(`⚾ MLB: ${prediction.home_team} vs ${prediction.away_team}: ${resultMatch ? 'GAGNÉ' : 'PERDU'} (${result.homeScore}-${result.awayScore})`);
        }
      } else {
        console.log(`⏳ MLB: ${prediction.home_team} vs ${prediction.away_team}: résultat non trouvé sur ESPN`);
      }
    }
  } catch (error: any) {
    errors.push(error.message);
    console.error('Erreur vérification MLB:', error);
  }

  return { verified, updated, won, lost, errors };
}

// ============================================
// VÉRIFICATION TENNIS (ESPN → Supabase)
// ============================================

interface TennisMatchResult {
  player1: string;
  player2: string;
  winner: 'home' | 'away';
  setsWon1: number;
  setsWon2: number;
  tournament: string;
}

/**
 * Récupérer les résultats tennis (ATP + WTA) depuis ESPN (GRATUIT)
 */
async function fetchTennisResultsFromESPN(): Promise<TennisMatchResult[]> {
  const results: TennisMatchResult[] = [];
  const dates: string[] = [];
  const today = new Date();
  for (let i = 3; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0].replace(/-/g, ''));
  }

  console.log(`🎾 Recherche résultats tennis pour: ${dates.join(', ')}`);

  const tours = ['atp', 'wta'];

  for (const tour of tours) {
    for (const dateStr of dates) {
      try {
        const response = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/tennis/${tour}/scoreboard?dates=${dateStr}`,
          { cache: 'no-store', headers: { 'Accept': 'application/json' } }
        );

        if (!response.ok) continue;

        const data = await response.json();
        const events = data.events || [];

        for (const event of events) {
          const tournament = event.name || event.shortName || tour.toUpperCase();
          const competitions = event.competitions || [];

          for (const comp of competitions) {
            if (comp.status?.type?.completed !== true) continue;

            const competitors = comp.competitors || [];
            const home = competitors.find((c: any) => c.homeAway === 'home');
            const away = competitors.find((c: any) => c.homeAway === 'away');

            if (!home || !away) continue;

            const p1Name = home.athlete?.displayName || home.athlete?.shortDisplayName || '';
            const p2Name = away.athlete?.displayName || away.athlete?.shortDisplayName || '';
            if (!p1Name || !p2Name) continue;

            // Compter les sets gagnés
            const sets1 = (home.linescores || []).filter((s: any) => s.winner === true).length;
            const sets2 = (away.linescores || []).filter((s: any) => s.winner === true).length;

            results.push({
              player1: p1Name,
              player2: p2Name,
              winner: home.winner === true ? 'home' as const : 'away' as const,
              setsWon1: sets1 || 0,
              setsWon2: sets2 || 0,
              tournament,
            });
          }
        }
      } catch (error) {
        console.log(`⚠️ Erreur ESPN ${tour.toUpperCase()} ${dateStr}:`, error);
      }
    }
    console.log(`🎾 ESPN ${tour.toUpperCase()}: ${results.length} résultats (total cumulé)`);
  }

  return results;
}

/**
 * Matcher un résultat tennis avec une prédiction Supabase (fuzzy matching noms de joueurs)
 */
function matchTennisPrediction(
  prediction: DbPrediction,
  result: TennisMatchResult
): boolean {
  const normalize = (s: string) =>
    s.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');

  const predHome = normalize(prediction.home_team || '');
  const predAway = normalize(prediction.away_team || '');
  const resHome = normalize(result.player1);
  const resAway = normalize(result.player2);

  if (!predHome || !predAway || !resHome || !resAway) return false;

  // Match direct
  if (predHome === resHome && predAway === resAway) return true;
  // Match inversé
  if (predHome === resAway && predAway === resHome) return true;
  // Match partiel (nom contenu dans l'autre)
  if ((predHome.includes(resHome) || resHome.includes(predHome)) &&
      (predAway.includes(resAway) || resAway.includes(predAway))) return true;

  return false;
}

/**
 * Vérifier les résultats tennis (directement dans Supabase, pas le store local)
 */
async function verifyTennisResults(): Promise<{
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
    // Récupérer les pronostics tennis pending depuis Supabase
    const allPending = await SupabaseStore.getPendingPredictions();
    const pending = allPending.filter(p => p.sport === 'tennis');

    if (pending.length === 0) {
      console.log('📋 Aucun pronostic Tennis en attente dans Supabase');
      return { verified: 0, updated: 0, won: 0, lost: 0, errors: [] };
    }

    console.log(`📋 ${pending.length} pronostics Tennis en attente à vérifier`);

    // Récupérer les résultats tennis depuis ESPN
    const tennisResults = await fetchTennisResultsFromESPN();

    if (tennisResults.length === 0) {
      console.log('🎾 Aucun résultat tennis trouvé sur ESPN');
      return { verified: 0, updated: 0, won: 0, lost: 0, errors: [] };
    }

    // Pour chaque prédiction, chercher le résultat correspondant
    for (const prediction of pending) {
      verified++;

      const result = tennisResults.find(r => matchTennisPrediction(prediction, r));

      if (result) {
        const predictedResult = prediction.predicted_result;
        const actualResult = result.winner; // 'home' or 'away'
        const resultMatch = predictedResult === actualResult;

        // Mettre à jour Supabase directement
        const success = await SupabaseStore.completePrediction(prediction.match_id, {
          homeScore: result.setsWon1,
          awayScore: result.setsWon2,
          actualResult,
          resultMatch,
          goalsMatch: undefined,
        });

        if (success) {
          updated++;
          if (resultMatch) won++; else lost++;
          console.log(`🎾 Tennis: ${prediction.home_team} vs ${prediction.away_team}: ${resultMatch ? 'GAGNÉ' : 'PERDU'} (${result.setsWon1}-${result.setsWon2} sets)`);
        }
      } else {
        console.log(`⏳ Tennis: ${prediction.home_team} vs ${prediction.away_team}: résultat non trouvé sur ESPN`);
      }
    }
  } catch (error: any) {
    errors.push(error.message);
    console.error('Erreur vérification Tennis:', error);
  }

  return { verified, updated, won, lost, errors };
}

/**
 * Vérification complète (Football + NBA + MLB + Tennis)
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
  const [footballResult, nbaResult, mlbResult, tennisResult] = await Promise.all([
    verifyFootballResults(),
    verifyNBAResults(),
    verifyMLBResults(),
    verifyTennisResults()
  ]);

  const result = {
    verified: footballResult.verified + nbaResult.verified + mlbResult.verified + tennisResult.verified,
    updated: footballResult.updated + nbaResult.updated + mlbResult.updated + tennisResult.updated,
    won: footballResult.won + nbaResult.won + mlbResult.won + tennisResult.won,
    lost: footballResult.lost + nbaResult.lost + mlbResult.lost + tennisResult.lost,
    errors: [...footballResult.errors, ...nbaResult.errors, ...mlbResult.errors, ...tennisResult.errors],
    statsUpdate: undefined as { success: boolean; message: string } | undefined,
    mlSync: undefined as { synced: number; mlStats: any } | undefined
  };

  // Mettre à jour les statistiques si des résultats ont été vérifiés
  if (result.updated > 0) {
    console.log('📊 Mise à jour des statistiques...');
    // Note: PredictionStore.getAllAsync() lit le fichier local — ignoré en prod Vercel

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
        // Publier le résumé quotidien sur Telegram
        // ⚠️ Tennis EXCLU car il a son propre cron dédié (07:30 et 09:00 GMT)
        try {
          // 🔄 TOUJOURS utiliser ESPN en direct (le fichier pré-calculé ne persiste pas sur Vercel)
          console.log('📡 Récupération des matchs depuis ESPN...');
          const matches = await getMatchesWithRealOdds();
          
          let predictions: any[] = matches
            .filter((m: any) => m.sport?.toLowerCase() !== 'tennis') // 🎾 Tennis exclu
            .map((m: any) => ({
              homeTeam: m.homeTeam,
              awayTeam: m.awayTeam,
              sport: m.sport,
              league: m.league,
              date: m.date,
              displayDate: m.displayDate,
              dateTag: m.dateTag, // 📅 Tag de date (aujourd'hui/demain)
              recommendation: m.recommendations?.[0]?.label || m.recommendation,
              predictedResult: m.predictedResult || (m.probabilities?.home > m.probabilities?.away ? 'home' : 'away'),
              confidence: m.confidence,
              valueBetDetected: m.valueBets?.length > 0,
              valueBetType: m.valueBets?.[0]?.type,
              riskPercentage: m.riskPercentage,
              winProbability: m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : undefined),
              oddsHome: m.oddsHome,
              oddsAway: m.oddsAway,
              oddsDraw: m.oddsDraw,
            }));
          console.log(`📡 ESPN live: ${predictions.length} matchs récupérés`);
          
          // Si aucun match, essayer le fichier pré-calculé en dernier recours
          if (predictions.length === 0) {
            const { loadDailyPredictions } = await import('@/lib/dailyPredictionService');
            const dailyData = loadDailyPredictions();
            
            if (dailyData && dailyData.predictions.length > 0) {
              predictions = dailyData.predictions
                .filter(p => p.sport !== 'tennis')
                .map(p => ({
                  homeTeam: p.homeTeam,
                  awayTeam: p.awayTeam,
                  sport: p.sport,
                  league: p.league || p.tournament,
                  date: p.date,
                  recommendation: p.recommendation,
                  predictedResult: p.predictedResult,
                  confidence: p.confidence,
                  valueBetDetected: p.valueBet,
                  valueBetType: p.valueBetType,
                  riskPercentage: p.riskPercentage,
                  winProbability: p.winProbability,
                  oddsHome: p.oddsHome,
                  oddsAway: p.oddsAway,
                  oddsDraw: p.oddsDraw,
                }));
              console.log(`📦 Fallback fichier pré-calculé: ${predictions.length} matchs`);
            }
          }
          
          if (predictions.length === 0) {
            result = { 
              telegram: { 
                success: false, 
                message: 'Aucun match disponible aujourd\'hui'
              } 
            };
            break;
          }
          
          const filteredCount = predictions.filter(p => isSafeOrModerate(p.riskPercentage)).length;
          
          // 💾 Sauvegarder les prédictions dans Supabase pour le bilan quotidien
          try {
            const dbPredictions = predictions.map((p: any) => {
              const cleanTeam = (name: string) => (name || '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
              const dateStr = p.date?.split('T')[0] || new Date().toISOString().split('T')[0];
              // Extraire l'heure du match pour éviter les collisions (ex: même équipes, même jour, compétitions différentes)
              const timeMatch = (p.date || '').match(/T(\d{2}:\d{2})/);
              const timeSuffix = timeMatch ? `-${timeMatch[1].replace(':', '')}` : '';
              const matchId = `${cleanTeam(p.homeTeam)}-${cleanTeam(p.awayTeam)}-${cleanTeam(p.league || '')}-${dateStr}${timeSuffix}`;
              return {
                match_id: matchId,
                home_team: p.homeTeam,
                away_team: p.awayTeam,
                league: p.league || 'Unknown',
                sport: p.sport || 'football',
                match_date: p.date || new Date().toISOString(),
                odds_home: p.oddsHome || 1.0,
                odds_draw: p.oddsDraw || null,
                odds_away: p.oddsAway || 1.0,
                predicted_result: p.predictedResult || 'home',
                confidence: p.confidence || 'medium',
                risk_percentage: p.riskPercentage || 50,
                status: 'pending' as const,
              };
            });
            const saved = await SupabaseStore.addPredictions(dbPredictions);
            console.log(`💾 ${saved} prédictions sauvegardées dans Supabase`);
          } catch (e: any) {
            console.log('⚠️ Erreur sauvegarde Supabase:', e.message);
          }
          
          const telegramResult = await publishDailySummaryToTelegram(predictions);
          result = { 
            telegram: { 
              success: telegramResult, 
              total: predictions.length,
              published: filteredCount,
              excluded: predictions.length - filteredCount,
              source: 'espn-live',
              message: telegramResult 
                ? `Résumé publié: ${filteredCount} pronostics safe/modéré sur Telegram`
                : 'Erreur publication Telegram'
            } 
          };
        } catch (e: any) {
          result = { telegram: { success: false, error: e.message } };
        }
        break;
        
      case 'telegram-valuebets':
        // Publier uniquement les value bets sur Telegram
        // ⚠️ Tennis EXCLU car il a son propre cron dédié
        try {
          // 🔄 TOUJOURS utiliser ESPN en direct (le fichier pré-calculé ne persiste pas sur Vercel)
          console.log('📡 Récupération des matchs pour value bets depuis ESPN...');
          const matches = await getMatchesWithRealOdds();
          
          let predictions: any[] = matches
            .filter((m: any) => m.sport?.toLowerCase() !== 'tennis')
            .map((m: any) => ({
              homeTeam: m.homeTeam,
              awayTeam: m.awayTeam,
              sport: m.sport,
              league: m.league,
              date: m.date,
              displayDate: m.displayDate,
              dateTag: m.dateTag,
              recommendation: m.recommendations?.[0]?.label,
              predictedResult: m.predictedResult || (m.probabilities?.home > m.probabilities?.away ? 'home' : 'away'),
              confidence: m.confidence,
              valueBetDetected: m.valueBets?.length > 0,
              valueBetType: m.valueBets?.[0]?.type,
              riskPercentage: m.riskPercentage,
              winProbability: m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : undefined),
              oddsHome: m.oddsHome,
              oddsAway: m.oddsAway,
              oddsDraw: m.oddsDraw,
            }));

          const telegramResult = await publishValueBetsToTelegram(predictions);
          const valueBetsCount = predictions.filter(p => 
            p.valueBetDetected && 
            p.confidence !== 'low' && 
            isSafeOrModerate(p.riskPercentage)
          ).length;
          
          result = { 
            telegram: { 
              success: telegramResult, 
              total: valueBetsCount,
              source: 'espn-live',
              message: telegramResult 
                ? `${valueBetsCount} value bet(s) publié(s) sur Telegram`
                : 'Erreur ou aucun value bet à publier'
            } 
          };
        } catch (e: any) {
          result = { telegram: { success: false, error: e.message } };
        }
        break;
        
      case 'telegram-kamikaze':
        // Publier les pronostics Kamikaze (haut risque) sur Telegram
        // 🎾 Tennis INCLUS dans le kamikaze
        try {
          // 🔄 TOUJOURS utiliser ESPN en direct (le fichier pré-calculé ne persiste pas sur Vercel)
          console.log('📡 Récupération des matchs pour kamikaze depuis ESPN...');
          const matches = await getMatchesWithRealOdds();
          
          let predictions: any[] = matches.map((m: any) => ({
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
            sport: m.sport,
            league: m.league,
            date: m.date,
            displayDate: m.displayDate,
            dateTag: m.dateTag,
            recommendation: m.recommendations?.[0]?.label,
            predictedResult: m.predictedResult || (m.probabilities?.home > m.probabilities?.away ? 'home' : 'away'),
            confidence: m.confidence,
            valueBetDetected: m.valueBets?.length > 0,
            valueBetType: m.valueBets?.[0]?.type,
            riskPercentage: m.riskPercentage,
            winProbability: m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : undefined),
            oddsHome: m.oddsHome,
            oddsAway: m.oddsAway,
            oddsDraw: m.oddsDraw,
          }));
          
          // Ajouter les prédictions tennis pour le kamikaze
          try {
            const tennisResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://my-project-zeta-five-85.vercel.app'}/api/tennis`);
            if (tennisResponse.ok) {
              const tennisData = await tennisResponse.json();
              const tennisPredictions = (tennisData.predictions || []).map((p: any) => ({
                homeTeam: p.player1,
                awayTeam: p.player2,
                sport: 'Tennis',
                league: p.tournament,
                date: p.date,
                recommendation: p.prediction?.winnerName,
                predictedResult: p.prediction?.winner === 'player1' ? 'home' : 'away',
                confidence: p.prediction?.confidence,
                valueBetDetected: p.betting?.recommendedBet,
                riskPercentage: p.prediction?.riskPercentage,
                winProbability: p.prediction?.winProbability,
                oddsHome: p.odds1,
                oddsAway: p.odds2,
                oddsDraw: null,
              }));
              predictions = [...predictions, ...tennisPredictions];
              console.log(`🎾 Tennis ajouté au kamikaze: ${tennisPredictions.length} matchs`);
            }
          } catch (e) {
            console.log('⚠️ Impossible de récupérer tennis pour kamikaze:', e);
          }
          
          const kamikazeCount = predictions.filter(p => isKamikaze(p.riskPercentage)).length;
          
          // 💾 Sauvegarder aussi les pronostics kamikaze (tennis inclus) dans Supabase
          try {
            const dbPredictions = predictions
              .filter(p => isKamikaze(p.riskPercentage))
              .map((p: any) => {
                const cleanTeam = (name: string) => (name || '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
                const dateStr = p.date?.split('T')[0] || new Date().toISOString().split('T')[0];
                // Extraire l'heure du match pour éviter les collisions
                const timeMatch = (p.date || '').match(/T(\d{2}:\d{2})/);
                const timeSuffix = timeMatch ? `-${timeMatch[1].replace(':', '')}` : '';
                const matchId = `${cleanTeam(p.homeTeam)}-${cleanTeam(p.awayTeam)}-${cleanTeam(p.league || '')}-${dateStr}${timeSuffix}`;
                return {
                  match_id: matchId,
                  home_team: p.homeTeam,
                  away_team: p.awayTeam,
                  league: p.league || 'Unknown',
                  sport: (p.sport || 'other').toLowerCase(),
                  match_date: p.date || new Date().toISOString(),
                  odds_home: p.oddsHome || 1.0,
                  odds_draw: p.oddsDraw || null,
                  odds_away: p.oddsAway || 1.0,
                  predicted_result: p.predictedResult || 'home',
                  confidence: p.confidence || 'medium',
                  risk_percentage: p.riskPercentage || 50,
                  status: 'pending' as const,
                };
              });
            const saved = await SupabaseStore.addPredictions(dbPredictions);
            console.log(`💾 ${saved} pronostics kamikaze (tennis inclus) sauvegardés dans Supabase`);
          } catch (e: any) {
            console.log('⚠️ Erreur sauvegarde kamikaze Supabase:', e.message);
          }
          
          const telegramResult = await publishKamikazeToTelegram(predictions);
          result = { 
            telegram: { 
              success: telegramResult, 
              total: kamikazeCount,
              source: 'espn-live',
              message: telegramResult 
                ? `💣 ${kamikazeCount} pronostic(s) Kamikaze publié(s) sur Telegram`
                : 'Erreur ou aucun pronostic Kamikaze à publier'
            } 
          };
        } catch (e: any) {
          result = { telegram: { success: false, error: e.message } };
        }
        break;
        
      case 'telegram-results':
        // Publier le bilan quotidien des pronostics (prédictions vs résultats réels)
        try {
          // D'abord lancer la vérification pour mettre à jour les résultats
          console.log('🔄 Vérification des résultats avant bilan...');
          const verifyResult = await verifyAllResults();
          console.log(`✅ Vérification: ${verifyResult.verified} matchs, ${verifyResult.updated} mis à jour`);
          
          // Petite pause pour que Supabase soit à jour
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Récupérer la date cible (hier par défaut, ou date passée en param)
          const targetDate = url.searchParams.get('date');
          const telegramResult = await publishDailyResultsToTelegram(targetDate || undefined);
          
          result = { 
            telegram: { 
              success: telegramResult,
              verification: { verified: verifyResult.verified, updated: verifyResult.updated, won: verifyResult.won, lost: verifyResult.lost },
              message: telegramResult 
                ? '📊 Bilan quotidien publié sur Telegram'
                : 'Aucun pronostic à comparer pour cette date'
            } 
          };
        } catch (e: any) {
          result = { telegram: { success: false, error: e.message } };
        }
        break;
        
      default:
        return NextResponse.json(
          { error: 'Action non reconnue', validActions: ['precalc', 'verify', 'verify-evening', 'verify-morning', 'verify-night', 'update-ml', 'update-stats', 'update-fundamentals', 'train-ml', 'ml-stats', 'sync-all', 'ping', 'db-status', 'test-espn', 'telegram-summary', 'telegram-valuebets', 'telegram-kamikaze', 'telegram-results'] },
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

      case 'telegram-summary':
        // Publier le résumé quotidien sur Telegram (UNIQUEMENT safe et modéré)
        try {
          const matches = await getMatchesWithRealOdds();
          const predictions = matches.map((m: any) => ({
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
            sport: m.sport,
            league: m.league,
            date: m.date,
            displayDate: m.displayDate,
            recommendation: m.recommendations?.[0]?.label,
            confidence: m.confidence,
            valueBetDetected: m.valueBets?.length > 0,
            riskPercentage: m.riskPercentage,
            winProbability: m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : undefined),
            oddsHome: m.oddsHome,
            oddsAway: m.oddsAway,
            oddsDraw: m.oddsDraw,
          }));

          const filteredCount = predictions.filter(p => isSafeOrModerate(p.riskPercentage)).length;

          const telegramResult = await publishDailySummaryToTelegram(predictions);
          result = {
            telegram: {
              success: telegramResult,
              total: predictions.length,
              published: filteredCount,
              excluded: predictions.length - filteredCount,
              message: telegramResult
                ? `Résumé publié: ${filteredCount} pronostics safe/modéré sur Telegram`
                : 'Erreur publication Telegram'
            }
          };
        } catch (e: any) {
          result = { telegram: { success: false, error: e.message } };
        }
        break;

      case 'telegram-valuebets':
        // Publier uniquement les value bets sur Telegram (UNIQUEMENT safe et modéré)
        try {
          const matches = await getMatchesWithRealOdds();
          const predictions = matches.map((m: any) => ({
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
            sport: m.sport,
            league: m.league,
            date: m.date,
            displayDate: m.displayDate,
            recommendation: m.recommendations?.[0]?.label,
            confidence: m.confidence,
            riskPercentage: m.riskPercentage,
            winProbability: m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : undefined),
            valueBetDetected: m.valueBets?.length > 0,
            valueBetType: m.valueBets?.[0]?.type,
            oddsHome: m.oddsHome,
            oddsAway: m.oddsAway,
            oddsDraw: m.oddsDraw,
          }));

          const telegramResult = await publishValueBetsToTelegram(predictions);
          const valueBetsCount = predictions.filter(p =>
            p.valueBetDetected &&
            p.confidence !== 'low' &&
            isSafeOrModerate(p.riskPercentage)
          ).length;

          result = {
            telegram: {
              success: telegramResult,
              total: valueBetsCount,
              message: telegramResult
                ? `${valueBetsCount} value bet(s) publié(s) sur Telegram`
                : 'Erreur ou aucun value bet à publier'
            }
          };
        } catch (e: any) {
          result = { telegram: { success: false, error: e.message } };
        }
        break;

      default:
        return NextResponse.json(
          { error: 'Action non reconnue', validActions: ['precalc', 'verify', 'verify-evening', 'verify-morning', 'verify-night', 'update-stats', 'sync-ml', 'sync-all', 'ping', 'train-ml', 'ml-stats', 'test-espn', 'telegram-summary', 'telegram-valuebets'] },
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
