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
  publishKamikazeBilanToTelegram,
  publishMonthlyResultsToTelegram,
  isSafeOrModerate,
  isKamikaze
} from '@/lib/telegramService';
import { getMatchesWithRealOdds, invalidateEspnCache } from '@/lib/combinedDataService';

// Secret pour sécuriser le cron
const CRON_SECRET = process.env.CRON_SECRET || 'steo-elite-cron-2026';
const CRON_VERSION = 'v10'; // Suppression limite 10, séparation sports améliorée

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
  espnDate?: string; // YYYYMMDD pour matching par date (critique pour MLB/NBA)
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

  // Générer les dates en heure US Eastern (ET) car ESPN utilise la date locale US
  // Couvrir aujourd'hui ET jusqu'à 7 jours en arrière
  for (let i = 0; i <= 7; i++) {
    const d = new Date(today.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    d.setDate(d.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dates.push(`${yyyy}${mm}${dd}`);
  }

  const uniqueDates = [...new Set(dates)];
  console.log(`🏀 Recherche résultats NBA pour (dates US ET): ${uniqueDates.join(', ')}`);

  for (const dateStr of uniqueDates) {
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
  result: MatchResult,
  returnInverted: true
): { matched: boolean; inverted: boolean };
function matchPredictionWithResult(
  prediction: { homeTeam?: string; awayTeam?: string; home_team?: string; away_team?: string; league?: string },
  result: MatchResult,
  returnInverted?: false
): boolean;
function matchPredictionWithResult(
  prediction: { homeTeam?: string; awayTeam?: string; home_team?: string; away_team?: string; league?: string },
  result: MatchResult,
  returnInverted?: boolean
): boolean | { matched: boolean; inverted: boolean } {
  const normalize = (s: string) => 
    s.toLowerCase()
     .normalize('NFD')
     .replace(/[\u0300-\u036f]/g, '')
     .replace(/[^a-z0-9]/g, '');

  const predHome = normalize(prediction.homeTeam || prediction.home_team || '');
  const predAway = normalize(prediction.awayTeam || prediction.away_team || '');
  const resHome = normalize(result.homeTeam);
  const resAway = normalize(result.awayTeam);

  if (!predHome || !predAway) return returnInverted ? { matched: false, inverted: false } : false;

  // Match direct
  if (predHome === resHome && predAway === resAway) {
    return returnInverted ? { matched: true, inverted: false } : true;
  }
  
  // Match inversé (domicile/extérieur inversés)
  if (predHome === resAway && predAway === resHome) {
    return returnInverted ? { matched: true, inverted: true } : true;
  }
  
  // Match partiel (l'une contient l'autre)
  if ((predHome.includes(resHome) || resHome.includes(predHome)) && 
      (predAway.includes(resAway) || resAway.includes(predAway))) {
    const inverted = predHome.includes(resAway) && predAway.includes(resHome);
    return returnInverted ? { matched: true, inverted } : true;
  }
  
  // Match avec noms courts
  const predHomeShort = predHome.substring(0, 5);
  const predAwayShort = predAway.substring(0, 5);
  const resHomeShort = resHome.substring(0, 5);
  const resAwayShort = resAway.substring(0, 5);
  
  if (predHomeShort === resHomeShort && predAwayShort === resAwayShort) {
    return returnInverted ? { matched: true, inverted: false } : true;
  }

  return returnInverted ? { matched: false, inverted: false } : false;
}

/**
 * Ajuste l'actualResult ESPN quand home/away sont inversés par rapport à la prédiction
 */
function adjustResultForInversion(
  espnResult: 'home' | 'draw' | 'away',
  inverted: boolean
): 'home' | 'draw' | 'away' {
  if (!inverted) return espnResult;
  if (espnResult === 'home') return 'away';
  if (espnResult === 'away') return 'home';
  return 'draw';
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
      
      const matchEntry = nbaResults
        .map(r => ({ result: r, match: matchPredictionWithResult(prediction, r, true) as { matched: boolean; inverted: boolean } }))
        .find(e => e.match.matched);
      
      if (matchEntry) {
        const result = matchEntry.result;
        const inverted = matchEntry.match.inverted;
        const predictedResult = prediction.predicted_result;
        const actualResult = adjustResultForInversion(result.actualResult, inverted);
        const resultMatch = predictedResult === actualResult;

        // Mettre à jour Supabase directement
        const success = await SupabaseStore.completePrediction(prediction.match_id, {
          homeScore: inverted ? result.awayScore : result.homeScore,
          awayScore: inverted ? result.homeScore : result.awayScore,
          actualResult,
          resultMatch,
          goalsMatch: undefined,
        });

        if (success) {
          updated++;
          if (resultMatch) won++; else lost++;
          console.log(`✅ NBA: ${prediction.home_team} vs ${prediction.away_team}: ${resultMatch ? 'GAGNÉ' : 'PERDU'} (${inverted ? '⚠️inversé ' : ''}${result.homeScore}-${result.awayScore})`);
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
      
      const matchEntry = footballResults
        .map(r => ({ result: r, match: matchPredictionWithResult(prediction, r, true) as { matched: boolean; inverted: boolean } }))
        .find(e => e.match.matched);
      
      if (matchEntry) {
        const result = matchEntry.result;
        const inverted = matchEntry.match.inverted;
        const predictedResult = prediction.predicted_result;
        const actualResult = adjustResultForInversion(result.actualResult, inverted);
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
          homeScore: inverted ? result.awayScore : result.homeScore,
          awayScore: inverted ? result.homeScore : result.awayScore,
          actualResult,
          resultMatch,
          goalsMatch
        });

        if (success) {
          updated++;
          if (resultMatch) won++; else lost++;
          console.log(`✅ Football: ${prediction.home_team} vs ${prediction.away_team}: ${resultMatch ? 'GAGNÉ' : 'PERDU'} (${inverted ? '⚠️inversé ' : ''}${result.homeScore}-${result.awayScore})`);
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
 * Génère une date US ET au format YYYYMMDD
 */
function toUSDateStr(d: Date): string {
  const usDate = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const yyyy = usDate.getFullYear();
  const mm = String(usDate.getMonth() + 1).padStart(2, '0');
  const dd = String(usDate.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/**
 * Récupérer les résultats MLB depuis ESPN (GRATUIT)
 * Cherche sur J-1 à J-4 (JAMAIS aujourd'hui — les matchs du jour ne sont pas encore terminés)
 */
async function fetchMLBResultsFromESPN(): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  const dates: string[] = [];

  // ⚠️ Cherche J-0 à J-4 (aujourd'hui inclus car les matchs du jour peuvent être terminés)
  for (let i = 0; i <= 4; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(toUSDateStr(d));
  }

  const uniqueDates = [...new Set(dates)];
  console.log(`⚾ Recherche résultats MLB pour (dates US ET passées): ${uniqueDates.join(', ')}`);

  for (const dateStr of uniqueDates) {
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${dateStr}`,
        { cache: 'no-store' }
      );

      if (!response.ok) continue;

      const data = await response.json();
      const events = data.events || [];

      for (const e of events) {
        // ⚠️ NE matcher QUE les matchs terminés (completed = true)
        if (e.status?.type?.completed !== true) continue;

        const competition = e.competitions?.[0];
        const home = competition?.competitors?.find((c: any) => c.homeAway === 'home');
        const away = competition?.competitors?.find((c: any) => c.homeAway === 'away');

        if (!home || !away) continue;

        const homeScore = parseInt(home?.score || '0');
        const awayScore = parseInt(away?.score || '0');

        // Si les deux scores sont 0, c'est suspect
        if (homeScore === 0 && awayScore === 0) continue;

        const espnHomeTeam = home?.team?.displayName || home?.team?.shortDisplayName || '';
        const espnAwayTeam = away?.team?.displayName || away?.team?.shortDisplayName || '';

        if (!espnHomeTeam || !espnAwayTeam) continue;

        results.push({
          matchId: `mlb_${e.id}`,
          homeTeam: espnHomeTeam,
          awayTeam: espnAwayTeam,
          homeScore,
          awayScore,
          status: 'finished' as const,
          actualResult: homeScore > awayScore
            ? 'home' as const
            : homeScore < awayScore
              ? 'away' as const
              : 'draw' as const,
          league: 'MLB',
          sport: 'baseball' as const,
          espnDate: dateStr,
        });

        console.log(`✅ MLB ESPN: ${espnHomeTeam}(H) ${homeScore}-${awayScore} ${espnAwayTeam}(A) [${dateStr}]`);
      }
    } catch (error) {
      console.log(`⚠️ Erreur ESPN MLB ${dateStr}:`, error);
    }
  }

  console.log(`✅ ESPN MLB: ${results.length} résultats récupérés`);
  return results;
}

/**
 * Normalise un nom d'équipe pour comparaison (NFD + lowercase + alpha-only)
 */
function normalizeTeamName(s: string): string {
  return s.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Vérifie si deux noms d'équipe correspondent (exact ou inversé)
 * Pour MLB: on utilise la correspondance stricte (pas de partial/fuzzy)
 * car les noms d'équipes MLB sont courts et uniques.
 */
function mlbTeamsMatch(predHome: string, predAway: string, espnHome: string, espnAway: string): { matched: boolean; inverted: boolean } {
  const pH = normalizeTeamName(predHome);
  const pA = normalizeTeamName(predAway);
  const eH = normalizeTeamName(espnHome);
  const eA = normalizeTeamName(espnAway);

  if (!pH || !pA || !eH || !eA) return { matched: false, inverted: false };

  // Match direct: notre home = ESPN home, notre away = ESPN away
  if (pH === eH && pA === eA) return { matched: true, inverted: false };

  // Match inversé: notre home = ESPN away, notre away = ESPN home
  if (pH === eA && pA === eH) return { matched: true, inverted: true };

  // ⚠️ PAS de fuzzy/partial matching pour MLB — trop risqué (invention de scores)
  return { matched: false, inverted: false };
}

/**
 * Vérifier les pronostics MLB/other (directement dans Supabase)
 * ⚠️ RÉÉCRITURE COMPLÈTE — corrige l'inversion de scores et les matchs inventés
 *
 * Règles strictes:
 * 1. Ne vérifie QUE les pronostics dont le match_date est antérieur à aujourd'hui (min 6h)
 * 2. Cherche sur prédiction_date ± 1 jour (tolérance timezone)
 * 3. Matching strict par nom d'équipe (pas de fuzzy)
 * 4. Ne JAMAIS inverser les scores — seulement ajuster le résultat (home/away)
 * 5. Vérification de cohérence finale avant mise à jour
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
    const pending = allPending.filter(p =>
      p.sport === 'other' || p.sport === 'hockey' || p.sport === 'baseball' ||
      p.league?.includes('MLB') || p.league?.includes('NHL')
    );

    if (pending.length === 0) {
      console.log('📋 Aucun pronostic MLB/other en attente dans Supabase');
      return { verified: 0, updated: 0, won: 0, lost: 0, errors: [] };
    }

    console.log(`📋 ${pending.length} pronostics MLB/other en attente à vérifier`);

    // Récupérer les résultats MLB depuis ESPN (J-1 à J-4 uniquement)
    const mlbResults = await fetchMLBResultsFromESPN();

    if (mlbResults.length === 0) {
      console.log('⚾ Aucun résultat MLB trouvé sur ESPN');
      return { verified: 0, updated: 0, won: 0, lost: 0, errors: [] };
    }

    const now = new Date();
    const MIN_AGE_MS = 2 * 60 * 60 * 1000; // 2h minimum (MLB dure ~3h, ESPN est fiable sur le statut completed)

    for (const prediction of pending) {
      verified++;

      // ⚠️ RÈGLE 1: Ne vérifier QUE les matchs passés (au moins 2h)
      const matchTime = new Date(prediction.match_date).getTime();
      if (matchTime > now.getTime() - MIN_AGE_MS) {
        console.log(`⏳ MLB: ${prediction.home_team} vs ${prediction.away_team}: match trop récent (< 2h), ignoré`);
        continue;
      }

      // ⚠️ RÈGLE 2: Chercher sur prédiction_date ± 1 jour pour gérer les écarts de timezone
      const predDate = new Date(prediction.match_date);
      const searchDates: string[] = [];
      for (let offset = -1; offset <= 1; offset++) {
        const d = new Date(predDate);
        d.setDate(d.getDate() + offset);
        searchDates.push(toUSDateStr(d));
      }

      // Filtrer les résultats ESPN dans la fenêtre de dates
      const candidateResults = mlbResults.filter(r => r.espnDate && searchDates.includes(r.espnDate));

      if (candidateResults.length === 0) {
        console.log(`⏳ MLB: ${prediction.home_team} vs ${prediction.away_team} (dates: ${searchDates.join('/')}): aucun résultat ESPN trouvé`);
        continue;
      }

      // ⚠️ RÈGLE 3: Matching STRICT par nom d'équipe
      const matchEntry = candidateResults
        .map(r => ({
          result: r,
          match: mlbTeamsMatch(prediction.home_team, prediction.away_team, r.homeTeam, r.awayTeam)
        }))
        .find(e => e.match.matched);

      if (!matchEntry) {
        console.log(`⏳ MLB: ${prediction.home_team} vs ${prediction.away_team}: non trouvé sur ESPN (teams ne correspondent pas)`);
        continue;
      }

      const espnResult = matchEntry.result;
      const inverted = matchEntry.match.inverted;

      // ⚠️ RÈGLE 4: Calculer le résultat réel sans inventer de scores
      // ESPN: homeTeam a homeScore points, awayTeam a awayScore points
      // Si inverted: ESPN's "home" = notre "away" dans Supabase
      // Donc les scores depuis NOTRE perspective:
      const ourHomeScore = inverted ? espnResult.awayScore : espnResult.homeScore;
      const ourAwayScore = inverted ? espnResult.homeScore : espnResult.awayScore;

      // Le résultat depuis NOTRE perspective
      let actualResult: 'home' | 'draw' | 'away';
      if (ourHomeScore > ourAwayScore) actualResult = 'home';
      else if (ourHomeScore < ourAwayScore) actualResult = 'away';
      else actualResult = 'draw';

      // ⚠️ RÈGLE 5: Vérification de cohérence
      const resultMatch = prediction.predicted_result === actualResult;

      // Double-check: les scores ESPN originaux doivent avoir un gagnant clair
      if (espnResult.homeScore === espnResult.awayScore) {
        console.log(`⚠️ MLB: ${prediction.home_team} vs ${prediction.away_team}: scores ESPN à égalité (${espnResult.homeScore}-${espnResult.awayScore}), ignoré`);
        continue;
      }

      if (inverted) {
        console.log(`🔄 MLB HOME/AWAY inversé: prediction(${prediction.home_team} vs ${prediction.away_team}) = ESPN(${espnResult.awayTeam} vs ${espnResult.homeTeam})`);
      }

      console.log(`🏏 MLB: ${prediction.home_team}(${ourHomeScore}) vs ${prediction.away_team}(${ourAwayScore}) → ${actualResult} | prédiction: ${prediction.predicted_result} → ${resultMatch ? 'GAGNÉ ✅' : 'PERDU ❌'}`);

      const success = await SupabaseStore.completePrediction(prediction.match_id, {
        homeScore: ourHomeScore,
        awayScore: ourAwayScore,
        actualResult,
        resultMatch,
        goalsMatch: undefined,
      });

      if (success) {
        updated++;
        if (resultMatch) won++; else lost++;
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
        
      case 'reset-date':
        // Réinitialiser les matchs zombies et/ou forcer la vérification MLB
        try {
          const resetDate = url.searchParams.get('date');
          if (!resetDate) {
            return NextResponse.json({ error: 'Paramètre date requis (format YYYY-MM-DD)' }, { status: 400 });
          }
          const subMode = url.searchParams.get('mode') || 'debug'; // debug | verify
          
          const allPreds = await SupabaseStore.getAllPredictions(2000);
          const datePreds = allPreds.filter(p =>
            p.match_date && (p.match_date as string).startsWith(resetDate)
          );
          
          if (subMode === 'verify') {
            // MODE VERIFY: forcer la vérification MLB depuis ESPN pour les pending de cette date
            const pending = datePreds.filter(p => 
              p.status === 'pending' || 
              (p.status === 'completed' && p.result_match !== true && p.result_match !== false)
            );
            
            // Fetch ESPN MLB results
            const targetD = new Date(resetDate + 'T12:00:00Z');
            const espnDates: string[] = [];
            for (let offset = -1; offset <= 1; offset++) {
              const dd = new Date(targetD);
              dd.setDate(dd.getDate() + offset);
              espnDates.push(toUSDateStr(dd));
            }
            const uniqueDates = [...new Set(espnDates)];
            
            const espnResults: any[] = [];
            for (const dateStr of uniqueDates) {
              try {
                const resp = await fetch(
                  `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${dateStr}`,
                  { cache: 'no-store' }
                );
                if (resp.ok) {
                  const data = await resp.json();
                  for (const e of (data.events || [])) {
                    const comp = e.competitions?.[0];
                    if (comp?.status?.type?.name !== 'STATUS_FINAL') continue;
                    const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
                    const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
                    espnResults.push({
                      homeTeam: home?.team?.displayName || '',
                      awayTeam: away?.team?.displayName || '',
                      homeScore: parseInt(home?.score) || 0,
                      awayScore: parseInt(away?.score) || 0,
                      espnDate: dateStr,
                    });
                  }
                }
              } catch (err) { /* skip */ }
            }
            
            let updated = 0, won = 0, lost = 0;
            const details: any[] = [];
            
            for (const pred of pending) {
              if (!pred.league?.includes('MLB') && pred.sport !== 'other') continue;
              
              const pH = (pred.home_team || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
              const pA = (pred.away_team || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
              
              let found = false;
              for (const espn of espnResults) {
                const eH = espn.homeTeam.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
                const eA = espn.awayTeam.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
                
                let inverted = false;
                if (pH === eH && pA === eA) { found = true; }
                else if (pH === eA && pA === eH) { found = true; inverted = true; }
                
                if (found) {
                  const ourHome = inverted ? espn.awayScore : espn.homeScore;
                  const ourAway = inverted ? espn.homeScore : espn.awayScore;
                  const actualResult: 'home' | 'away' = ourHome > ourAway ? 'home' : 'away';
                  const resultMatch = pred.predicted_result === actualResult;
                  
                  const ok = await SupabaseStore.completePrediction(pred.match_id, {
                    homeScore: ourHome,
                    awayScore: ourAway,
                    actualResult,
                    resultMatch,
                  });
                  if (ok) { updated++; if (resultMatch) won++; else lost++; }
                  details.push({ match: `${pred.home_team} vs ${pred.away_team}`, result: resultMatch ? 'WIN' : 'LOSS', score: `${ourHome}-${ourAway}`, inverted });
                  break;
                }
              }
              if (!found) {
                details.push({ match: `${pred.home_team} vs ${pred.away_team}`, result: 'NOT_FOUND', normHome: pH, normAway: pA });
              }
            }
            
            result = { resetDate: { mode: 'verify', date: resetDate, pendingFound: pending.length, espnResults: espnResults.length, updated, won, lost, details } };
          } else {
            // MODE DEBUG: montrer tous les matchs de cette date
            const debugInfo = datePreds.map(p => ({
              match_id: p.match_id, status: p.status, result_match: p.result_match,
              home_score: p.home_score, away_score: p.away_score,
              sport: p.sport, league: p.league,
              home_team: p.home_team, away_team: p.away_team,
              predicted_result: p.predicted_result, risk_percentage: p.risk_percentage,
              match_date: p.match_date,
            }));
            const zombiePreds = datePreds.filter(p =>
              p.status === 'completed' && p.result_match !== true && p.result_match !== false
            );
            let resetCount = 0;
            for (const p of zombiePreds) {
              const ok = await SupabaseStore.completePrediction(p.match_id, {
                homeScore: 0, awayScore: 0, actualResult: 'home',
                resultMatch: false, status: 'pending',
              });
              if (ok) resetCount++;
            }
            result = { resetDate: { date: resetDate, resetCount, totalChecked: allPreds.length, datePreds: datePreds.length, zombieFound: zombiePreds.length, debug: debugInfo } };
          }
        } catch (e: any) {
          result = { resetDate: { success: false, error: e.message } };
        }
        break;

      case 'reset-mlb':
        // Réinitialiser les résultats MLB erronés et revérifier avec date-aware matching
        try {
          const allMLB = await SupabaseStore.getAllPredictions();
          const mlbPreds = allMLB.filter(p => 
            p.league?.includes('MLB') || (p.sport === 'other' && p.league === 'MLB')
          );
          let resetCount = 0;
          for (const p of mlbPreds) {
            if (p.status === 'completed') {
              await SupabaseStore.completePrediction(p.match_id, {
                homeScore: 0,
                awayScore: 0,
                actualResult: 'home',
                resultMatch: false,
                status: 'pending',
              });
              resetCount++;
            }
          }
          // Re-run verification avec le nouveau code date-aware
          const verifyResult = await verifyAllResults();
          result = { resetMLB: { resetCount, ...verifyResult } };
        } catch (e: any) {
          result = { resetMLB: { success: false, error: e.message } };
        }
        break;

      case 'fix-sport':
        // Corrige sport='other' → bon sport basé sur la league, et supprime les doublons
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabaseDirect = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || '',
            process.env.SUPABASE_SERVICE_ROLE_KEY || ''
          );

          const fixDate = url.searchParams.get('date') || (() => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            return yesterday.toISOString().split('T')[0];
          })();
          const nextDayFix = (() => {
            const d = new Date(fixDate + 'T12:00:00Z');
            d.setDate(d.getDate() + 1);
            return d.toISOString().split('T')[0];
          })();
          const [dayPredsFix, nextDayPredsFix] = await Promise.all([
            SupabaseStore.getPredictionsByDate(fixDate),
            SupabaseStore.getPredictionsByDate(nextDayFix),
          ]);
          const seenFix = new Set<string>();
          const allFixPreds: any[] = [];
          for (const p of [...dayPredsFix, ...nextDayPredsFix]) {
            if (!seenFix.has(p.match_id)) { seenFix.add(p.match_id); allFixPreds.push(p); }
          }
          
          let fixedCount = 0;
          let deletedDupes = 0;
          const matchIdCount: Record<string, number> = {};
          
          // 1) Corriger sport='other' → bon sport
          for (const p of allFixPreds) {
            const baseId = p.match_id.replace(/-\d{6}$/, '');
            matchIdCount[baseId] = (matchIdCount[baseId] || 0) + 1;
            
            if (p.sport === 'other' && p.league) {
              const league = p.league.toLowerCase();
              let correctSport: string | null = null;
              if (league.includes('mlb') || league.includes('baseball')) correctSport = 'baseball';
              else if (league.includes('nba') || league.includes('basketball')) correctSport = 'basketball';
              else if (league.includes('nhl') || league.includes('hockey')) correctSport = 'hockey';
              else if (league.includes('atp') || league.includes('wta') || league.includes('tennis')) correctSport = 'tennis';
              
              if (correctSport && p.id) {
                const { error } = await supabaseDirect
                  .from('predictions')
                  .update({ sport: correctSport })
                  .eq('id', p.id);
                if (!error) {
                  fixedCount++;
                  console.log(`✅ Fix sport: ${p.home_team} vs ${p.away_team} → ${correctSport}`);
                } else {
                  console.error(`❌ Erreur fix sport:`, error.message);
                }
              }
            }
          }
          
          // 2) Supprimer les doublons (même baseId sans suffixe heure, garder le premier)
          const seenBaseIds = new Set<string>();
          for (const p of allFixPreds) {
            const baseId = p.match_id.replace(/-\d{6}$/, '');
            if (matchIdCount[baseId] > 1) {
              if (seenBaseIds.has(baseId)) {
                if (p.id) {
                  const success = await SupabaseStore.deletePrediction(p.id);
                  if (success) {
                    deletedDupes++;
                    console.log(`🗑️ Doublon supprimé: ${p.home_team} vs ${p.away_team} (${p.match_id})`);
                  }
                }
              } else {
                seenBaseIds.add(baseId);
              }
            }
          }
          
          result = { fixSport: { date: fixDate, total: allFixPreds.length, fixed: fixedCount, deletedDupes } };
        } catch (e: any) {
          result = { fixSport: { success: false, error: e.message } };
        }
        break;

      case 'rebuild-bilan':
        try {
          const rebuildDate = url.searchParams.get('date');
          if (!rebuildDate) {
            result = { rebuild: { error: 'Paramètre date requis (format YYYY-MM-DD)' } };
            break;
          }
          const nextDay = (() => {
            const d = new Date(rebuildDate + 'T12:00:00Z');
            d.setDate(d.getDate() + 1);
            return d.toISOString().split('T')[0];
          })();
          const [dayPreds, nextDayPreds] = await Promise.all([
            SupabaseStore.getPredictionsByDate(rebuildDate),
            SupabaseStore.getPredictionsByDate(nextDay),
          ]);
          const seen = new Set<string>();
          const allDatePreds: any[] = [];
          for (const p of [...dayPreds, ...nextDayPreds]) {
            if (!seen.has(p.match_id)) { seen.add(p.match_id); allDatePreds.push(p); }
          }
          const safeModerate = allDatePreds.filter(p => (p.risk_percentage ?? 100) <= 50);
          const kamikaze = allDatePreds.filter(p => (p.risk_percentage ?? 100) > 50);
          const publishedIds = new Set<string>();
          const bySport: Record<string, any[]> = {};
          for (const p of safeModerate) {
            const sport = p.sport || 'other';
            if (!bySport[sport]) bySport[sport] = [];
            bySport[sport].push(p);
          }
          // 💡 PLUS DE LIMITE : tout conserver (rebuild ne supprime rien de safe/modéré)
          for (const sport of Object.keys(bySport)) {
            const sorted = [...bySport[sport]].sort((a, b) => (a.risk_percentage ?? 100) - (b.risk_percentage ?? 100));
            sorted.forEach(p => publishedIds.add(p.match_id));
          }
          // Kamikaze: garder max 5 (inchangé)
          const kamikazeSorted = [...kamikaze].sort((a, b) => {
            const oddsA = Math.max(a.odds_home || 0, a.odds_away || 0);
            const oddsB = Math.max(b.odds_home || 0, b.odds_away || 0);
            return oddsB - oddsA;
          });
          kamikazeSorted.slice(0, 5).forEach(p => publishedIds.add(p.match_id));
          const toDelete = allDatePreds.filter(p => !publishedIds.has(p.match_id));
          let deletedCount = 0;
          for (const p of toDelete) {
            if (p.id) { const success = await SupabaseStore.deletePrediction(p.id); if (success) deletedCount++; }
          }
          result = { rebuild: { date: rebuildDate, totalFound: allDatePreds.length, published: publishedIds.size, deleted: deletedCount, message: `${deletedCount} supprimées, ${publishedIds.size} conservées pour ${rebuildDate}` } };
        } catch (e: any) { result = { rebuild: { success: false, error: e.message } }; }
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
          
          // 💾 Sauvegarder UNIQUEMENT les prédictions PUBLIÉES sur Telegram (même filtre que publishDailySummaryToTelegram)
          // ⚠️ Même logique : safe/modéré + max 10 par sport + trié par risque croissant
          try {
            // 1) Filtrer safe/modéré (identique à publishDailySummaryToTelegram)
            const safeModerate = predictions.filter(p => isSafeOrModerate(p.riskPercentage));
            
            // 2) Grouper par sport
            const bySport: Record<string, any[]> = {};
            for (const p of safeModerate) {
              const sport = p.sport || 'Autre';
              if (!bySport[sport]) bySport[sport] = [];
              bySport[sport].push(p);
            }
            
            // 3) Pour chaque sport : trier par risque croissant, PUBLIER TOUT (plus de limite)
            const publishedPredictions: any[] = [];
            for (const sport of Object.keys(bySport)) {
              const sorted = [...bySport[sport]].sort((a, b) => (a.riskPercentage || 100) - (b.riskPercentage || 100));
              publishedPredictions.push(...sorted);
            }
            
            const dbPredictions = publishedPredictions.map((p: any) => {
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
                sport: (p.sport || 'football').toLowerCase(),
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
            console.log(`💾 ${saved} prédictions PUBLIÉES sauvegardées dans Supabase (sur ${predictions.length} totales)`);
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
          // ⚠️ Force le refresh pour éviter le cache avec des cotes estimées (pas de kamikaze)
          console.log('📡 Récupération des matchs pour kamikaze depuis ESPN (force refresh)...');
          const matches = await getMatchesWithRealOdds(true);
          
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
          
          // 💾 Sauvegarder UNIQUEMENT les pronostics kamikaze PUBLIÉS sur Telegram
          // ⚠️ Même logique que publishKamikazeToTelegram : isKamikaze + tri par cote desc + max 5
          try {
            const kamikazeFiltered = predictions
              .filter(p => isKamikaze(p.riskPercentage))
              .sort((a: any, b: any) => {
                const oddsA = a.oddsHome && a.oddsAway ? Math.max(a.oddsHome, a.oddsAway) : 0;
                const oddsB = b.oddsHome && b.oddsAway ? Math.max(b.oddsHome, b.oddsAway) : 0;
                return oddsB - oddsA; // tri par cote décroissante (identique à publishKamikazeToTelegram)
              })
              .slice(0, 5); // max 5 (identique à publishKamikazeToTelegram)
            
            const dbPredictions = kamikazeFiltered.map((p: any) => {
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
            console.log(`💾 ${saved} pronostics kamikaze PUBLIÉS sauvegardés dans Supabase (sur ${kamikazeCount} kamikazes totaux)`);
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
          
          // Publier aussi le bilan kamikaze séparément
          const kamikazeBilanDate = targetDate || undefined;
          const kamikazeResult = await publishKamikazeBilanToTelegram(kamikazeBilanDate);
          
          result = { 
            telegram: { 
              success: telegramResult || kamikazeResult,
              verification: { verified: verifyResult.verified, updated: verifyResult.updated, won: verifyResult.won, lost: verifyResult.lost },
              kamikazeBilan: kamikazeResult,
              message: telegramResult 
                ? '📊 Bilan journalier publié sur Telegram'
                : 'Aucun pronostic safe/modéré à comparer pour cette date'
            } 
          };
        } catch (e: any) {
          result = { telegram: { success: false, error: e.message } };
        }
        break;

      case 'telegram-monthly':
        // Publier le bilan mensuel par sport sur Telegram
        try {
          const monthParam = url.searchParams.get('month'); // format: YYYY-MM
          const telegramResult = await publishMonthlyResultsToTelegram(monthParam || undefined);
          result = {
            telegram: {
              success: telegramResult,
              message: telegramResult
                ? '📊 Bilan mensuel publié sur Telegram'
                : 'Aucune donnée pour ce mois'
            }
          };
        } catch (e: any) {
          result = { telegram: { success: false, error: e.message } };
        }
        break;

      case 'reset-results':
        // Remettre toutes les prédictions d'une date en 'pending' (pour revérification)
        try {
          const resetDate = url.searchParams.get('date');
          if (!resetDate) {
            result = { reset: { error: 'Paramètre date requis (format YYYY-MM-DD)' } };
            break;
          }
          const nextDay = (() => {
            const d = new Date(resetDate + 'T12:00:00Z');
            d.setDate(d.getDate() + 1);
            return d.toISOString().split('T')[0];
          })();
          const [dayPreds, nextDayPreds] = await Promise.all([
            SupabaseStore.getPredictionsByDate(resetDate),
            SupabaseStore.getPredictionsByDate(nextDay),
          ]);
          const seen = new Set<string>();
          const allPreds: any[] = [];
          for (const p of [...dayPreds, ...nextDayPreds]) {
            if (!seen.has(p.match_id)) { seen.add(p.match_id); allPreds.push(p); }
          }
          let resetCount = 0;
          let alreadyPending = 0;
          for (const p of allPreds) {
            if (p.status === 'pending') { alreadyPending++; continue; }
            const success = await SupabaseStore.completePrediction(p.match_id, {
              homeScore: 0, awayScore: 0, actualResult: 'home', resultMatch: false, status: 'pending'
            });
            if (success) resetCount++;
          }
          result = { reset: { date: resetDate, total: allPreds.length, reset: resetCount, alreadyPending, message: `${resetCount} réinitialisées, ${alreadyPending} déjà en attente` } };
        } catch (e: any) { result = { reset: { error: e.message } }; }
        break;

      case 'fix-data':
        // 1) Corriger le sport 'other' → 'baseball' pour les matchs MLB
        // 2) Supprimer les doublons (même home/away/sport/date)
        try {
          const fixResult = await SupabaseStore.fixSportField();
          
          // Supprimer les doublons : garder le premier, supprimer les autres
          const allPreds = await SupabaseStore.getAllPredictions();
          const seen = new Set<string>();
          let dupesDeleted = 0;
          for (const p of allPreds) {
            // Clé de dédup basée sur home_team + away_team + date (sans l'heure)
            const dateStr = (p.match_date || '').split('T')[0];
            const key = `${(p.home_team || '').toLowerCase()}-${(p.away_team || '').toLowerCase()}-${dateStr}`;
            if (seen.has(key)) {
              const success = await SupabaseStore.deleteByMatchId(p.match_id);
              if (success) dupesDeleted++;
            } else {
              seen.add(key);
            }
          }
          
          result = { fixData: { sportFixed: fixResult.updated, dupesDeleted, message: `${fixResult.updated} sports corrigés, ${dupesDeleted} doublons supprimés` } };
        } catch (e: any) { result = { fixData: { error: e.message } }; }
        break;

      case 'rebuild-date':
        // Reconstruire complètement les prédictions pour une date donnée
        // 1) Supprimer toutes les prédictions de cette date
        // 2) Fix le sport field globalement
        // 3) Reset + re-vérifier + publier le bilan
        try {
          const rebuildTargetDate = url.searchParams.get('date');
          if (!rebuildTargetDate) {
            result = { rebuildDate: { error: 'Paramètre date requis (format YYYY-MM-DD)' } };
            break;
          }
          
          // Étape 1: Supprimer toutes les prédictions de cette date
          const deletedCount = await SupabaseStore.deleteByDate(rebuildTargetDate);
          
          // Étape 2: Fix le sport field pour tout le reste
          const fixResult = await SupabaseStore.fixSportField();
          
          result = { 
            rebuildDate: { 
              date: rebuildTargetDate, 
              deleted: deletedCount, 
              sportFixed: fixResult.updated,
              message: `${deletedCount} prédictions supprimées pour ${rebuildTargetDate}, ${fixResult.updated} sports corrigés globalement` 
            } 
          };
        } catch (e: any) { result = { rebuildDate: { error: e.message } }; }
        break;

      case 'insert-july8':
        // Insertion manuelle des 12 pronostics publiés le 8 juillet avec résultats ESPN vérifiés
        try {
          const cleanTeam = (name: string) => (name || '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
          const predictions = [
            { home: "New York Mets", away: "Kansas City Royals", pred: "home", oddsH: 1.55, oddsA: 2.49, risk: 35, time: "23:35" },
            { home: "St. Louis Cardinals", away: "Milwaukee Brewers", pred: "away", oddsH: 2.28, oddsA: 1.65, risk: 39, time: "23:40" },
            { home: "Cincinnati Reds", away: "Philadelphia Phillies", pred: "home", oddsH: 1.69, oddsA: 2.19, risk: 41, time: "23:40" },
            { home: "Detroit Tigers", away: "Athletics", pred: "home", oddsH: 1.73, oddsA: 2.14, risk: 42, time: "22:40" },
            { home: "Baltimore Orioles", away: "Chicago Cubs", pred: "home", oddsH: 1.76, oddsA: 2.08, risk: 43, time: "22:35" },
            { home: "Miami Marlins", away: "Seattle Mariners", pred: "away", oddsH: 2.08, oddsA: 1.76, risk: 43, time: "22:40" },
            { home: "Washington Nationals", away: "Houston Astros", pred: "home", oddsH: 1.74, oddsA: 2.13, risk: 43, time: "22:40" },
            { home: "San Francisco Giants", away: "Toronto Blue Jays", pred: "away", oddsH: 2.04, oddsA: 1.80, risk: 44, time: "19:45" },
            { home: "Pittsburgh Pirates", away: "Atlanta Braves", pred: "home", oddsH: 1.83, oddsA: 1.99, risk: 46, time: "22:40" },
            { home: "Minnesota Twins", away: "Cleveland Guardians", pred: "home", oddsH: 1.83, oddsA: 1.99, risk: 46, time: "22:40" },
            { home: "Chicago White Sox", away: "Boston Red Sox", pred: "home", oddsH: 1.89, oddsA: 1.93, risk: 47, time: "23:10" },
            { home: "Tampa Bay Rays", away: "New York Yankees", pred: "home", oddsH: 1.85, oddsA: 1.98, risk: 46, time: "22:40" },
          ];
          // Résultats ESPN vérifiés
          const results: Record<string, {hs: number; as: number; winner: string}> = {
            "new-york-mets-kansas-city-royals": { hs: 6, as: 2, winner: "home" },
            "st-louis-cardinals-milwaukee-brewers": { hs: 5, as: 1, winner: "home" },
            "cincinnati-reds-philadelphia-phillies": { hs: 11, as: 5, winner: "home" },
            "detroit-tigers-athletics": { hs: 6, as: 1, winner: "home" },
            "baltimore-orioles-chicago-cubs": { hs: 7, as: 9, winner: "away" },
            "miami-marlins-seattle-mariners": { hs: 2, as: 0, winner: "home" },
            "washington-nationals-houston-astros": { hs: 8, as: 2, winner: "home" },
            "san-francisco-giants-toronto-blue-jays": { hs: 0, as: 10, winner: "away" },
            "pittsburgh-pirates-atlanta-braves": { hs: 0, as: 3, winner: "away" },
            "minnesota-twins-cleveland-guardians": { hs: 6, as: 5, winner: "home" },
            "chicago-white-sox-boston-red-sox": { hs: 0, as: 5, winner: "away" },
            "tampa-bay-rays-new-york-yankees": { hs: 3, as: 0, winner: "home" },
          };

          let inserted = 0;
          const records: Record<string, any>[] = [];
          for (const p of predictions) {
            const timeSuffix = p.time ? `-${p.time.replace(':', '')}` : '';
            const matchId = `${cleanTeam(p.home)}-${cleanTeam(p.away)}-mlb-2026-07-08${timeSuffix}`;
            const r = results[matchId] || results[`${cleanTeam(p.home)}-${cleanTeam(p.away)}`];
            const isWin = r && p.pred === r.winner;
            const dbPred = {
              match_id: matchId,
              home_team: p.home,
              away_team: p.away,
              league: 'MLB',
              sport: 'other', // TODO: changer en 'baseball' quand l'enum Supabase sera mis à jour
              match_date: `2026-07-08T${p.time}:00Z`,
              odds_home: p.oddsH,
              odds_draw: null,
              odds_away: p.oddsA,
              predicted_result: p.pred,
              confidence: 'medium',
              risk_percentage: p.risk,
              status: 'completed',
              home_score: r?.hs ?? null,
              away_score: r?.as ?? null,
              actual_result: r?.winner || null,
              result_match: r ? isWin : null,
            };
            records.push(dbPred);
          }
          // Insert en masse via insertRaw (bypass normalizeSport)
          if (records.length > 0) {
            const insertResult = await SupabaseStore.insertRaw(records);
            inserted = insertResult.count || 0;
            if (!insertResult.success) {
              result = { insertJuly8: { error: insertResult.error, records: records.length } };
              break;
            }
          }
          result = { insertJuly8: { inserted, total: predictions.length, message: `${inserted}/${predictions.length} pronostics insérés avec résultats vérifiés` } };
        } catch (e: any) { result = { insertJuly8: { error: e.message } }; }
        break;
        
      default:
        return NextResponse.json(
          { error: 'Action non reconnue', validActions: ['precalc', 'verify', 'verify-evening', 'verify-morning', 'verify-night', 'update-ml', 'update-stats', 'update-fundamentals', 'train-ml', 'ml-stats', 'sync-all', 'ping', 'db-status', 'test-espn', 'telegram-summary', 'telegram-valuebets', 'telegram-kamikaze', 'telegram-results', 'telegram-kamikaze-bilan', 'telegram-monthly', 'reset-mlb', 'reset-date', 'cleanup-unpublished', 'rebuild-bilan', 'reset-results', 'fix-data', 'rebuild-date'] },
          { status: 400 }
        );
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Cron job terminé en ${duration}ms`);

    return NextResponse.json({
      success: true,
      action,
      timestamp: new Date().toISOString(),
      version: CRON_VERSION,
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

      case 'reset-date':
        try {
          const resetDate = url.searchParams.get('date');
          if (!resetDate) {
            return NextResponse.json({ error: 'Paramètre date requis (format YYYY-MM-DD)' }, { status: 400 });
          }
          const allPreds = await SupabaseStore.getAllPredictions(2000);
          const zombiePreds = allPreds.filter(p =>
            p.status === 'completed' &&
            p.match_date && p.match_date.startsWith(resetDate) &&
            p.result_match !== true && p.result_match !== false
          );
          let resetCount = 0;
          for (const p of zombiePreds) {
            const success = await SupabaseStore.completePrediction(p.match_id, {
              homeScore: 0, awayScore: 0, actualResult: 'home',
              resultMatch: false, status: 'pending',
            });
            if (success) resetCount++;
          }
          result = { resetDate: { date: resetDate, resetCount, totalChecked: allPreds.length, zombieFound: zombiePreds.length } };
        } catch (e: any) {
          result = { resetDate: { success: false, error: e.message } };
        }
        break;

      case 'reset-mlb':
        try {
          const allMLB = await SupabaseStore.getAllPredictions();
          const mlbPreds = allMLB.filter(p => 
            p.league?.includes('MLB') || (p.sport === 'other' && p.league === 'MLB')
          );
          let resetCount = 0;
          for (const p of mlbPreds) {
            if (p.status === 'completed') {
              await SupabaseStore.completePrediction(p.match_id, {
                homeScore: 0, awayScore: 0, actualResult: 'home',
                resultMatch: false, status: 'pending',
              });
              resetCount++;
            }
          }
          const verifyResult = await verifyAllResults();
          result = { resetMLB: { resetCount, ...verifyResult } };
        } catch (e: any) {
          result = { resetMLB: { success: false, error: e.message } };
        }
        break;

      case 'cleanup-unpublished':
        // Supprimer les prédictions PENDING qui n'ont jamais été publiées sur Telegram
        // ⚠️ Ne touche PAS aux prédictions completed (déjà vérifiées)
        try {
          const allPending = await SupabaseStore.getPendingPredictions();
          const today = new Date().toISOString().split('T')[0];
          
          // Grouper par date et sport pour simuler ce qui aurait été publié
          const byDateSport: Record<string, any[]> = {};
          for (const p of allPending) {
            const dateKey = (p.match_date || '').split('T')[0];
            const key = `${dateKey}__${p.sport || 'other'}`;
            if (!byDateSport[key]) byDateSport[key] = [];
            byDateSport[key].push(p);
          }
          
          // Simuler la logique de publication pour chaque groupe
          const toKeep = new Set<string>();
          for (const [key, preds] of Object.entries(byDateSport)) {
            const isKamikazeGroup = key.includes('__other') || preds.every(p => (p.risk_percentage ?? 100) > 50);
            
            if (isKamikazeGroup) {
              // Kamikaze: tri par cote desc, max 5
              const sorted = [...preds].sort((a, b) => {
                const oddsA = Math.max(a.odds_home || 0, a.odds_away || 0);
                const oddsB = Math.max(b.odds_home || 0, b.odds_away || 0);
                return oddsB - oddsA;
              });
              sorted.slice(0, 5).forEach(p => toKeep.add(p.match_id));
            } else {
              // Safe/modéré: tri par risque croissant, TOUT conserver (plus de limite)
              const sorted = [...preds].sort((a, b) => (a.risk_percentage ?? 100) - (b.risk_percentage ?? 100));
              sorted.forEach(p => toKeep.add(p.match_id));
            }
          }
          
          // Supprimer les prédictions qui n'auraient PAS été publiées
          const toDelete = allPending.filter(p => !toKeep.has(p.match_id));
          let deleted = 0;
          for (const p of toDelete) {
            if (p.id) {
              const success = await SupabaseStore.deletePrediction(p.id);
              if (success) deleted++;
            }
          }
          
          result = { 
            cleanup: { 
              totalPending: allPending.length,
              kept: toKeep.size,
              deleted,
              message: `Nettoyé ${deleted} prédictions non publiées (${toKeep.size} conservées)`
            } 
          };
        } catch (e: any) {
          result = { cleanup: { success: false, error: e.message } };
        }
        break;

      case 'rebuild-bilan':
        // Reconstruire le bilan pour une date :
        // 1) Identifier les prédictions qui auraient été publiées (même logique que le cron)
        // 2) Supprimer toutes les autres (même si completed)
        // 3) Re-vérifier + publier le bilan
        try {
          const rebuildDate = url.searchParams.get('date');
          if (!rebuildDate) {
            result = { rebuild: { error: 'Paramètre date requis (format YYYY-MM-DD)' } };
            break;
          }

          // Chercher sur la date + lendemain (matchs de nuit)
          const nextDay = (() => {
            const d = new Date(rebuildDate + 'T12:00:00Z');
            d.setDate(d.getDate() + 1);
            return d.toISOString().split('T')[0];
          })();

          const [dayPreds, nextDayPreds] = await Promise.all([
            SupabaseStore.getPredictionsByDate(rebuildDate),
            SupabaseStore.getPredictionsByDate(nextDay),
          ]);

          // Dédupliquer par match_id
          const seen = new Set<string>();
          const allDatePreds: any[] = [];
          for (const p of [...dayPreds, ...nextDayPreds]) {
            if (!seen.has(p.match_id)) {
              seen.add(p.match_id);
              allDatePreds.push(p);
            }
          }

          // Séparer safe/modéré et kamikaze
          const safeModerate = allDatePreds.filter(p => (p.risk_percentage ?? 100) <= 50);
          const kamikaze = allDatePreds.filter(p => (p.risk_percentage ?? 100) > 50);

          // Simuler la logique de publication pour safe/modéré
          const publishedIds = new Set<string>();
          
          // Safe/modéré: grouper par sport, trier par risque, TOUT publier
          const bySport: Record<string, any[]> = {};
          for (const p of safeModerate) {
            const sport = p.sport || 'other';
            if (!bySport[sport]) bySport[sport] = [];
            bySport[sport].push(p);
          }
          for (const sport of Object.keys(bySport)) {
            const sorted = [...bySport[sport]].sort((a, b) => (a.risk_percentage ?? 100) - (b.risk_percentage ?? 100));
            sorted.forEach(p => publishedIds.add(p.match_id));
          }

          // Kamikaze: trier par cote desc, max 5
          const kamikazeSorted = [...kamikaze].sort((a, b) => {
            const oddsA = Math.max(a.odds_home || 0, a.odds_away || 0);
            const oddsB = Math.max(b.odds_home || 0, b.odds_away || 0);
            return oddsB - oddsA;
          });
          kamikazeSorted.slice(0, 5).forEach(p => publishedIds.add(p.match_id));

          // Supprimer les prédictions qui n'auraient PAS été publiées
          const toDelete = allDatePreds.filter(p => !publishedIds.has(p.match_id));
          let deletedCount = 0;
          for (const p of toDelete) {
            if (p.id) {
              const success = await SupabaseStore.deletePrediction(p.id);
              if (success) deletedCount++;
            }
          }

          result = { 
            rebuild: { 
              date: rebuildDate,
              totalFound: allDatePreds.length,
              published: publishedIds.size,
              deleted: deletedCount,
              message: `${deletedCount} prédictions non publiées supprimées, ${publishedIds.size} conservées pour ${rebuildDate}`
            } 
          };
        } catch (e: any) {
          result = { rebuild: { success: false, error: e.message } };
        }
        break;

      case 'telegram-results':
        try {
          const verifyResult = await verifyAllResults();
          await new Promise(resolve => setTimeout(resolve, 2000));
          const targetDate = url.searchParams.get('date');
          const telegramResult = await publishDailyResultsToTelegram(targetDate || undefined);
          const kamikazeBilanDate = targetDate || undefined;
          const kamikazeResult = await publishKamikazeBilanToTelegram(kamikazeBilanDate);
          result = { 
            telegram: { 
              success: telegramResult || kamikazeResult,
              verification: { verified: verifyResult.verified, updated: verifyResult.updated, won: verifyResult.won, lost: verifyResult.lost },
              kamikazeBilan: kamikazeResult,
              message: telegramResult ? 'Bilan journalier publié sur Telegram' : 'Aucun pronostic safe/modéré à comparer'
            } 
          };
        } catch (e: any) {
          result = { telegram: { success: false, error: e.message } };
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
          { error: 'Action non reconnue', validActions: ['precalc', 'verify', 'verify-evening', 'verify-morning', 'verify-night', 'update-stats', 'sync-ml', 'sync-all', 'ping', 'train-ml', 'ml-stats', 'test-espn', 'telegram-summary', 'telegram-valuebets', 'telegram-kamikaze', 'telegram-results', 'telegram-kamikaze-bilan', 'telegram-monthly', 'reset-mlb', 'reset-date', 'cleanup-unpublished', 'rebuild-bilan', 'reset-results'] },
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
