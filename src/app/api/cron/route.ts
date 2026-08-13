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
import { runBacktest, formatBacktestForTelegram } from '@/lib/backtestService';
import { 
  publishDailySummaryToTelegram, 
  publishValueBetsToTelegram,
  publishKamikazeToTelegram,
  publishDailyResultsToTelegram,
  publishKamikazeBilanToTelegram,
  publishMonthlyResultsToTelegram,
  sendTelegramPersonalMessage,
  isSafeOrModerate,
  isKamikaze,
  selectTopDailyPredictions,
  capKamikazePerSport,
  sortKamikazePicks
} from '@/lib/telegramService';
import { getMatchesWithRealOdds, invalidateEspnCache, detectValueBets } from '@/lib/combinedDataService';
import { getBatchPredictions, type UnifiedPredictionInput } from '@/lib/unifiedPredictionService';
import { timingSafeEqual } from '@/lib/timingSafeEqual';

// Secret pour sécuriser le cron
const CRON_SECRET = process.env.CRON_SECRET;
const CRON_VERSION = 'v14'; // Max 10 pronostics + cotes réelles uniquement + tennis EXCLU + bilan cohérent

/**
 * Normalise le type de prédiction en 'home' | 'away' | 'draw'
 * Les recommendations ML peuvent inclure des types étendus (home_or_draw, over_2.5, etc.)
 * qui ne sont pas des prédictions de résultat directes → on les mappe au résultat le plus probable
 */
function normalizePredictionType(type?: string): 'home' | 'away' | 'draw' {
  if (!type) return 'home';
  if (type === 'home' || type === 'home_or_draw') return 'home';
  if (type === 'away' || type === 'away_or_draw') return 'away';
  if (type === 'draw') return 'draw';
  // Types étendus (over_2.5, under_2.5, btts_yes, btts_no) → par défaut 'home'
  return 'home';
}

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
      message: 'Erreur ping Supabase'
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
  sport: 'football' | 'basketball' | 'baseball' | 'hockey' | 'other'; // 🎾 tennis exclu des pronostics Telegram
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
 * Cherche sur basketball/nba ET basketball/nba-summer (Summer League en juillet)
 * Couvre 7 jours en arrière pour rattraper les matchs manqués
 */
async function fetchNBAResults(): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  const today = new Date();
  const dates: string[] = [];

  // Générer les dates en heure US Eastern (ET) car ESPN utilise la date locale US
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

  // 🏀 Deux sources ESPN : NBA régulière + Summer League
  const nbaEndpoints = [
    { url: (d: string) => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${d}`, league: 'NBA' },
    { url: (d: string) => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba-summer/scoreboard?dates=${d}`, league: 'NBA Summer League' },
  ];

  for (const endpoint of nbaEndpoints) {
    for (const dateStr of uniqueDates) {
      try {
        const response = await fetch(endpoint.url(dateStr), { cache: 'no-store' });
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
            league: endpoint.league,
            sport: 'basketball' as const
          });
        }
      } catch (error) {
        console.log(`⚠️ Erreur ESPN ${endpoint.league} ${dateStr}:`, error);
      }
    }
  }

  // Dédoublonner par matchId
  const seen = new Set<string>();
  const deduped = results.filter(r => {
    if (seen.has(r.matchId)) return false;
    seen.add(r.matchId);
    return true;
  });

  console.log(`✅ ESPN NBA (+Summer): ${deduped.length} résultats récupérés`);
  return deduped;
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
    errors.push('Erreur interne');
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
    errors.push('Erreur interne');
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
    // ⚠️ Hockey EXCLU — a son propre vérificateur verifyNHLResults()
    const allPending = await SupabaseStore.getPendingPredictions();
    const pending = allPending.filter(p =>
      p.sport === 'other' || p.sport === 'baseball' ||
      p.league?.includes('MLB')
    );

    if (pending.length === 0) {
      console.log('📋 Aucun pronostic MLB/other en attente dans Supabase');
      return { verified: 0, updated: 0, won: 0, lost: 0, errors: [] };
    }

    console.log(`📋 ${pending.length} pronostics MLB en attente à vérifier`);

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
    errors.push('Erreur interne');
    console.error('Erreur vérification MLB:', error);
  }

  return { verified, updated, won, lost, errors };
}

// ============================================
// VÉRIFICATION NHL (ESPN → Supabase)
// ============================================

/**
 * Récupérer les résultats NHL depuis ESPN (GRATUIT)
 * Même logique que NBA : J-0 à J-7
 */
async function fetchNHLResultsFromESPN(): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  const dates: string[] = [];

  for (let i = 0; i <= 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dates.push(`${yyyy}${mm}${dd}`);
  }

  const uniqueDates = [...new Set(dates)];
  console.log(`🏒 Recherche résultats NHL pour (dates US): ${uniqueDates.join(', ')}`);

  for (const dateStr of uniqueDates) {
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${dateStr}`,
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

        if (homeScore === 0 && awayScore === 0) continue;

        const espnHomeTeam = home?.team?.displayName || home?.team?.shortDisplayName || '';
        const espnAwayTeam = away?.team?.displayName || away?.team?.shortDisplayName || '';

        if (!espnHomeTeam || !espnAwayTeam) continue;

        results.push({
          matchId: `nhl_${e.id}`,
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
          league: 'NHL',
          sport: 'hockey' as const,
          espnDate: dateStr,
        });

        console.log(`✅ NHL ESPN: ${espnHomeTeam}(H) ${homeScore}-${awayScore} ${espnAwayTeam}(A) [${dateStr}]`);
      }
    } catch (error) {
      console.log(`⚠️ Erreur ESPN NHL ${dateStr}:`, error);
    }
  }

  console.log(`✅ ESPN NHL: ${results.length} résultats récupérés`);
  return results;
}

/**
 * Vérifier les pronostics NHL (hockey) via ESPN
 * Même structure que verifyNBAResults
 */
async function verifyNHLResults(): Promise<{
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
    const allPending = await SupabaseStore.getPendingPredictions();
    const pending = allPending.filter(p =>
      p.sport === 'hockey' || p.league?.includes('NHL')
    );

    if (pending.length === 0) {
      console.log('📋 Aucun pronostic NHL en attente dans Supabase');
      return { verified: 0, updated: 0, won: 0, lost: 0, errors: [] };
    }

    console.log(`📋 ${pending.length} pronostics NHL en attente à vérifier`);

    const nhlResults = await fetchNHLResultsFromESPN();

    if (nhlResults.length === 0) {
      console.log('🏒 Aucun résultat NHL trouvé sur ESPN');
      return { verified: 0, updated: 0, won: 0, lost: 0, errors: [] };
    }

    for (const prediction of pending) {
      verified++;

      const matchEntry = nhlResults
        .map(r => ({ result: r, match: matchPredictionWithResult(prediction, r, true) as { matched: boolean; inverted: boolean } }))
        .find(e => e.match.matched);

      if (matchEntry) {
        const result = matchEntry.result;
        const inverted = matchEntry.match.inverted;
        const predictedResult = prediction.predicted_result;
        const actualResult = adjustResultForInversion(result.actualResult, inverted);
        const resultMatch = predictedResult === actualResult;

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
          console.log(`✅ NHL: ${prediction.home_team} vs ${prediction.away_team}: ${resultMatch ? 'GAGNÉ' : 'PERDU'} (${inverted ? '⚠️inversé ' : ''}${result.homeScore}-${result.awayScore})`);
        }
      } else {
        console.log(`⏳ NHL: ${prediction.home_team} vs ${prediction.away_team}: résultat non trouvé sur ESPN`);
      }
    }

  } catch (error: any) {
    errors.push('Erreur interne');
    console.error('Erreur vérification NHL:', error);
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
 * 🔧 FALLBACK: Récupérer les résultats tennis via z-ai SDK (page_reader)
 * Utilise tennis-db.com quand ESPN ne retourne aucun résultat.
 * tennis-db.com fournit des pages .md par tournoi avec les résultats structurés.
 * On cherche d'abord les tournois actifs via les prédictions pending, puis on fetch
 * les résultats depuis tennis-db.com.
 */
async function fetchTennisResultsFromTennisDB(pendingPredictions: DbPrediction[]): Promise<TennisMatchResult[]> {
  const results: TennisMatchResult[] = [];
  let zai: any = null;

  try {
    // Initialiser le SDK z-ai pour le page_reader
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    zai = await ZAI.create();
    console.log('🎾 [TennisDB Fallback] z-ai SDK initialisé');
  } catch (e: any) {
    console.log(`🎾 [TennisDB Fallback] z-ai SDK non disponible: ${e.message}`);
    return results;
  }

  // Extraire les tournois uniques depuis les prédictions pending
  const tournamentNames = [...new Set(
    pendingPredictions
      .map(p => p.league || '')
      .filter(l => l.length > 0)
  )];

  console.log(`🎾 [TennisDB Fallback] Tournois à chercher: ${tournamentNames.join(', ')}`);

  // Essayer de trouver les résultats via z-ai page_reader
  // On cherche sur tennis-db.com et tennisuptodate.com
  for (const tournName of tournamentNames.slice(0, 5)) { // Max 5 tournois pour éviter timeout
    try {
      // Construire une requête de recherche pour trouver les résultats
      const searchQuery = `${tournName} tennis results completed matches ${new Date().toISOString().split('T')[0]}`;
      
      const searchResult = await zai.functions.invoke('web_search', {
        query: searchQuery,
        num: 3,
      });

      // Chercher un lien tennis-db.com dans les résultats
      const tennisDbUrl = (searchResult || []).find(
        (r: any) => r.url && r.url.includes('tennis-db.com/tournaments')
      );

      if (tennisDbUrl) {
        // Ajouter .md pour le format structuré
        const mdUrl = tennisDbUrl.url.endsWith('.md') ? tennisDbUrl.url : tennisDbUrl.url + '.md';
        console.log(`🎾 [TennisDB] Lecture: ${mdUrl}`);
        
        try {
          const pageResult = await zai.functions.invoke('page_reader', { url: mdUrl });
          const html = pageResult?.data?.html || '';
          
          // Extraire le contenu texte (les pages .md sont dans un <pre>)
          const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
          const text = preMatch ? preMatch[1] : html;
          
          // Parser les résultats
          const lines = text.split('\n');
          for (const line of lines) {
            // Format: "YYYY-MM-DD · ROUND: Winner d. Loser score1 score2 [score3...]"
            const resultMatch = line.match(
              /(\d{4}-\d{2}-\d{2})\s*·\s*(\w+):\s*(.+)\s+d\.\s+(.+)\s+((?:\d+-\d+\s*)+)/
            );
            if (!resultMatch) continue;

            const winner = resultMatch[3].trim();
            const loser = resultMatch[4].trim();
            const scores = resultMatch[5].trim();

            const setScores = scores.match(/\d+-\d+/g) || [];
            let setsWon1 = 0;
            let setsWon2 = 0;
            for (const set of setScores) {
              const parts = set.split('-');
              const s1 = parseInt(parts[0]);
              const s2 = parseInt(parts[1]);
              if (!isNaN(s1) && !isNaN(s2)) {
                if (s1 > s2) setsWon1++;
                else setsWon2++;
              }
            }

            results.push({
              player1: winner,
              player2: loser,
              winner: 'home' as const,
              setsWon1,
              setsWon2,
              tournament: tournName,
            });
          }
        } catch (pageError: any) {
          console.log(`🎾 [TennisDB] Erreur lecture page: ${pageError.message}`);
        }
      }
    } catch (error: any) {
      console.log(`🎾 [TennisDB] Skip ${tournName}: ${error.message || 'timeout'}`);
    }
  }

  // 🔧 FALLBACK 2: Si toujours rien, essier tennisuptodate.com
  if (results.length === 0 && tournamentNames.length > 0) {
    console.log('🎾 [TennisDB] Essai tennisuptodate.com...');
    try {
      const tourn = tournamentNames[0];
      const searchQuery = `site:tennisuptodate.com ${tourn} 2026 results scores`;
      const searchResult = await zai.functions.invoke('web_search', {
        query: searchQuery,
        num: 3,
      });
      
      const tucUrl = (searchResult || []).find(
        (r: any) => r.url && r.url.includes('tennisuptodate.com')
      );
      
      if (tucUrl) {
        const pageResult = await zai.functions.invoke('page_reader', { url: tucUrl.url });
        const html = pageResult?.data?.html || '';
        
        // Parser les blocs de résultat depuis tennisuptodate
        // Format: "Player1 d. Player2 score" 
        const resultRegex = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+d\.\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(\d+-\d+(?:\s+\d+-\d+(?:\s+\d+-\d+)?)?)/g;
        let match;
        while ((match = resultRegex.exec(html)) !== null) {
          const winner = match[1].trim();
          const loser = match[2].trim();
          const scores = match[3].trim();
          
          const setScores = scores.match(/\d+-\d+/g) || [];
          let setsWon1 = 0;
          let setsWon2 = 0;
          for (const set of setScores) {
            const parts = set.split('-');
            const s1 = parseInt(parts[0]);
            const s2 = parseInt(parts[1]);
            if (!isNaN(s1) && !isNaN(s2)) {
              if (s1 > s2) setsWon1++;
              else setsWon2++;
            }
          }
          
          results.push({
            player1: winner,
            player2: loser,
            winner: 'home' as const,
            setsWon1,
            setsWon2,
            tournament: tourn,
          });
        }
      }
    } catch (e: any) {
      console.log(`🎾 [TennisDB] tennisuptodate fallback échoué: ${e.message}`);
    }
  }

  console.log(`🎾 [TennisDB Fallback] ${results.length} résultats trouvés (total)`);
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

    // Récupérer les résultats tennis depuis ESPN (source principale)
    let tennisResults = await fetchTennisResultsFromESPN();

    // 🔧 FALLBACK: Si ESPN ne retourne rien, utiliser z-ai SDK + tennis-db.com / tennisuptodate.com
    if (tennisResults.length === 0) {
      console.log('🎾 ESPN vide → tentative fallback z-ai + tennis-db...');
      tennisResults = await fetchTennisResultsFromTennisDB(pending);
    }

    if (tennisResults.length === 0) {
      console.log('🎾 Aucun résultat tennis trouvé (ESPN + TennisDB)');
      return { verified: 0, updated: 0, won: 0, lost: 0, errors: [] };
    }

    console.log(`🎾 ${tennisResults.length} résultats tennis trouvés (ESPN ou fallback)`);

    // Pour chaque prédiction, chercher le résultat correspondant
    for (const prediction of pending) {
      verified++;

      const result = tennisResults.find(r => matchTennisPrediction(prediction, r));

      if (result) {
        const predictedResult = prediction.predicted_result; // 'home' or 'away'

        // 🔧 Pour le fallback tennis-db: player1 = winner, mais il faut vérifier
        // si player1 correspond à home_team ou away_team de la prédiction
        let actualResult: 'home' | 'away' = result.winner;

        // Si le résultat vient du fallback (tennis-db), player1 est toujours le winner.
        // On vérifie si le winner (player1) correspond à home_team de la prédiction.
        const normalize = (s: string) =>
          s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
        const predHomeNorm = normalize(prediction.home_team || '');
        const predAwayNorm = normalize(prediction.away_team || '');
        const resWinnerNorm = normalize(result.player1);

        // Si le winner du résultat ne correspond ni à home ni à away de la prédiction,
        // c'est probablement que le format est "Winner d. Loser" (fallback tennis-db)
        // où winner=player1 mais home/away dans la prédiction est inversé.
        if (resWinnerNorm && predHomeNorm && predAwayNorm) {
          if (resWinnerNorm === predAwayNorm) {
            actualResult = 'away';
          } else if (resWinnerNorm === predHomeNorm) {
            actualResult = 'home';
          }
          // Sinon garder result.winner tel quel (ESPN format)
        }

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
        console.log(`⏳ Tennis: ${prediction.home_team} vs ${prediction.away_team}: résultat non trouvé`);
      }
    }
  } catch (error: any) {
    errors.push('Erreur interne');
    console.error('Erreur vérification Tennis:', error);
  }

  return { verified, updated, won, lost, errors };
}

/**
 * Vérification complète (Football + NBA + MLB + NHL)
 * 🎾 Tennis EXCLU des prédictions Telegram
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
  const [footballResult, nbaResult, mlbResult, nhlResult] = await Promise.all([
    verifyFootballResults(),
    verifyNBAResults(),
    verifyMLBResults(),
    verifyNHLResults(),
    // 🎾 Tennis vérification SUPPRIMÉE — exclu des pronostics Telegram
  ]);

  const result = {
    verified: footballResult.verified + nbaResult.verified + mlbResult.verified + nhlResult.verified,
    updated: footballResult.updated + nbaResult.updated + mlbResult.updated + nhlResult.updated,
    won: footballResult.won + nbaResult.won + mlbResult.won + nhlResult.won,
    lost: footballResult.lost + nbaResult.lost + mlbResult.lost + nhlResult.lost,
    errors: [...footballResult.errors, ...nbaResult.errors, ...mlbResult.errors, ...nhlResult.errors],
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
    errors.push('Erreur interne');
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
      errors: ['Erreur interne'] 
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
      hockey: { total: 0, wins: 0, losses: 0, winRate: 0 },
      baseball: { total: 0, wins: 0, losses: 0, winRate: 0 }
    };

    for (const p of completed) {
      const sport = (p.sport || '').toLowerCase();
      let key: 'football' | 'basketball' | 'hockey' | 'baseball' = 'football';
      if (sport.includes('basket') || sport.includes('nba')) key = 'basketball';
      else if (sport.includes('hockey') || sport.includes('nhl')) key = 'hockey';
      else if (sport.includes('baseball') || sport.includes('mlb')) key = 'baseball';

      bySport[key].total++;
      if (p.result_match === true) {
        bySport[key].wins++;
      } else {
        bySport[key].losses++;
      }
    }

    // Calculer winRates
    for (const sport of ['football', 'basketball', 'hockey', 'baseball'] as const) {
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
          hockey: `${bySport.hockey.wins}/${bySport.hockey.total} = ${bySport.hockey.winRate}%`,
          baseball: `${bySport.baseball.wins}/${bySport.baseball.total} = ${bySport.baseball.winRate}%`
        }
      }
    };

  } catch (error: any) {
    console.error('❌ Erreur sync Supabase:', error);
    return {
      success: false,
      message: 'Erreur interne',
      errors: ['Erreur interne']
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
  
  if (!CRON_SECRET || !providedSecret || !timingSafeEqual(providedSecret, CRON_SECRET)) {
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
          result = { mlUpdate: { success: false, error: 'Erreur interne' } };
        }
        break;
        
      case 'update-stats':
        // Forcer la mise à jour des statistiques
        try {
          const statsResult = await forceUpdateStats();
          result = { statsUpdate: statsResult };
        } catch (e: any) {
          result = { statsUpdate: { success: false, error: 'Erreur interne' } };
        }
        break;

      case 'sync-all':
        // Synchronisation complète depuis stats_history
        try {
          const syncResult = await fullSyncFromStatsHistory();
          result = { syncAll: syncResult };
        } catch (e: any) {
          result = { syncAll: { success: false, error: 'Erreur interne' } };
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
          result = { fundamentals: { success: false, error: 'Erreur interne' } };
        }
        break;
        
      case 'train-ml':
        // Entraînement manuel du modèle ML
        try {
          const mlTrainResult = await trainMLModel();
          result = { mlTraining: mlTrainResult };
        } catch (e: any) {
          result = { mlTraining: { success: false, error: 'Erreur interne' } };
        }
        break;
        
      case 'backtest':
        // Backtest ML vs hasard
        try {
          const backtestResult = await runBacktest(30);
          result = { backtest: backtestResult };
        } catch (e: any) {
          result = { backtest: { success: false, error: 'Erreur interne' } };
        }
        break;
        
      case 'ml-stats':
        // Statistiques du modèle ML
        try {
          const mlStats = await getUnifiedMLStats();
          result = { mlStats };
        } catch (e: any) {
          result = { mlStats: { success: false, error: 'Erreur interne' } };
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
          result = { resetDate: { success: false, error: 'Erreur interne' } };
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
          result = { resetMLB: { success: false, error: 'Erreur interne' } };
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
              else if (league.includes('atp') || league.includes('wta') || league.includes('tennis')) correctSport = 'other'; // 🎾 tennis reste 'other' — exclu
              
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
          result = { fixSport: { success: false, error: 'Erreur interne' } };
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
          // Kamikaze: max 3 par sport (aligné sur publishKamikazeToTelegram)
          const kamikazeSorted = [...kamikaze].sort((a, b) => {
            const oddsA = Math.max(a.odds_home || 0, a.odds_away || 0);
            const oddsB = Math.max(b.odds_home || 0, b.odds_away || 0);
            return oddsB - oddsA;
          });
          const kamikazeCapped = capKamikazePerSport(kamikazeSorted);
          kamikazeCapped.forEach(p => publishedIds.add(p.match_id));
          const toDelete = allDatePreds.filter(p => !publishedIds.has(p.match_id));
          let deletedCount = 0;
          for (const p of toDelete) {
            if (p.id) { const success = await SupabaseStore.deletePrediction(p.id); if (success) deletedCount++; }
          }
          result = { rebuild: { date: rebuildDate, totalFound: allDatePreds.length, published: publishedIds.size, deleted: deletedCount, message: `${deletedCount} supprimées, ${publishedIds.size} conservées pour ${rebuildDate}` } };
        } catch (e: any) { result = { rebuild: { success: false, error: 'Erreur interne' } }; }
        break;
        
      case 'telegram-summary':
        // ══════════════════════════════════════════════════════
        // 🧠 PIPELINE UNIFIÉ — Même méthode que le site web
        // Au lieu de proba implicite brute des cotes, on utilise:
        // - Foot: 35% cotes + 35% Dixon-Coles + 15% contexte + 15% ML
        // - Basket: 50% cotes + 30% contexte (ORTG/DRTG/forme) + 20% ML
        // - Filtres stricts: LOW confidence = rejet auto (0% win rate)
        // - Edge minimum requis, Kelly criterion, value bet detection
        // ══════════════════════════════════════════════════════
        try {
          invalidateEspnCache();
          console.log('🧠 Pipeline unifié: récupération matchs + analyse ML...');
          const matches = await getMatchesWithRealOdds();
          
          if (matches.length === 0) {
            result = { telegram: { success: false, message: 'Aucun match disponible' } };
            break;
          }
          
          // Filtrer: matchs à venir uniquement, cotes réelles
          const upcomingWithOdds = matches.filter((m: any) => 
            !m.isFinished && !m.isEstimated && m.oddsHome > 0 && m.oddsAway > 0
          );
          console.log(`📡 ${upcomingWithOdds.length} matchs éligibles pour analyse ML (sur ${matches.length} total)`);
          
          // Mapper vers le format UnifiedPredictionInput
          // 📅 Conserver la date ESPN originale pour la sauvegarde Supabase
          const dateLookup = new Map<string, string>();
          const mlInputs: UnifiedPredictionInput[] = upcomingWithOdds.map((m: any) => {
            const mid = m.id || `espn_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
            if (m.date) dateLookup.set(`${m.homeTeam}|${m.awayTeam}`, m.date);
            return {
              id: mid,
              homeTeam: m.homeTeam,
              awayTeam: m.awayTeam,
              sport: m.sport === 'Basketball' ? 'NBA' as const : 
                     m.sport === 'Hockey' ? 'NHL' as const : 
                     m.sport === 'Baseball' ? 'MLB' as const : 'Foot' as const,
              league: m.league || 'Unknown',
              oddsHome: m.oddsHome,
              oddsDraw: m.oddsDraw || null,
              oddsAway: m.oddsAway,
            };
          });
          
          // 🧠 Exécuter le pipeline ML unifié
          let unifiedPreds: any[] = [];
          try {
            unifiedPreds = await getBatchPredictions(mlInputs);
            console.log(`🧠 ${unifiedPreds.length} prédictions ML calculées`);
          } catch (mlErr: any) {
            console.log(`⚠️ Pipeline ML échoué (${mlErr.message}), fallback sur cotes brutes`);
          }
          
          // Convertir les prédictions unifiées en format Telegram
          // Filtres stricts du site: pas de LOW confidence, pas de 'avoid'
          let predictions: any[] = [];
          
          if (unifiedPreds.length > 0) {
            predictions = unifiedPreds
              .filter((p: any) => 
                p.recommendation.bet !== 'avoid' && 
                p.mlPrediction.confidence !== 'low' &&
                p.odds.hasRealOdds
              )
              .map((p: any) => {
                const bet = p.recommendation.bet; // 'home' | 'draw' | 'away'
                const isHome = bet === 'home';
                const isAway = bet === 'away';
                const winProb = isHome ? p.mlPrediction.homeProb : 
                                 isAway ? p.mlPrediction.awayProb : p.mlPrediction.drawProb;
                const riskPct = Math.round(100 - winProb);
                const selectedOdds = isHome ? p.odds.home : isAway ? p.odds.away : p.odds.draw || 3.3;
                
                return {
                  homeTeam: p.homeTeam,
                  awayTeam: p.awayTeam,
                  sport: p.sport === 'NBA' ? 'Basketball' : p.sport === 'NHL' ? 'Hockey' : p.sport === 'MLB' ? 'Baseball' : 'Football',
                  league: p.league,
                  // 📅 Date ESPN originale (lookup par équipes) — CRITIQUE pour la sauvegarde Supabase
                  // Le bilan cherche les prédictions par date de match, pas par date de publication
                  date: dateLookup.get(`${p.homeTeam}|${p.awayTeam}`) || undefined,
                  displayDate: '',
                  dateTag: "aujourd'hui",
                  recommendation: isHome ? p.homeTeam : isAway ? p.awayTeam : 'Match Nul',
                  predictedResult: bet,
                  confidence: p.mlPrediction.confidence,
                  valueBetDetected: p.mlPrediction.valueBet,
                  valueBetType: p.mlPrediction.valueBetType,
                  riskPercentage: riskPct,
                  winProbability: winProb,
                  oddsHome: p.odds.home,
                  oddsAway: p.odds.away,
                  oddsDraw: p.odds.draw,
                  isEstimated: false,
                  // 🧠 Métadonnées ML pour le formatage Telegram
                  _mlEdge: p.mlPrediction.edge,
                  _mlReasoning: p.recommendation.reasoning,
                  _dataQuality: p.dataQuality?.score || 0,
                  _kellyStake: p.recommendation.kellyStake,
                  _dixonColes: p.dixonColes,
                  _sources: p.dataQuality?.sources || [],
                  // 🏆 Enjeu du match (phase saison, type compétition, importance)
                  _matchImportance: p.factors?.matchImportance || undefined,
                };
              });
            
            console.log(`🧠 Pipeline ML: ${predictions.length} pronostics valides (HIGH/MEDIUM, non-avoid)`);
          }
          
          // Fallback: si le pipeline ML n'a rien produit, utiliser les cotes brutes
          if (predictions.length === 0) {
            console.log('⚠️ Fallback: aucun pronostic ML, utilisation cotes brutes filtrées');
            predictions = upcomingWithOdds.map((m: any) => ({
              homeTeam: m.homeTeam,
              awayTeam: m.awayTeam,
              sport: m.sport,
              league: m.league,
              date: m.date,
              displayDate: m.displayDate,
              dateTag: m.dateTag,
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
              isEstimated: m.isEstimated || false,
            }));
          } else {
            // Compléter les dates depuis les matchs originaux
            const matchMap = new Map(upcomingWithOdds.map((m: any) => [m.homeTeam, m]));
            for (const pred of predictions) {
              const orig = matchMap.get(pred.homeTeam);
              if (orig) {
                pred.date = orig.date;
                pred.displayDate = orig.displayDate || '';
                pred.dateTag = orig.dateTag || "aujourd'hui";
              }
            }
          }
          
          if (predictions.length === 0) {
            result = { telegram: { success: false, message: 'Aucun pronostic valide (ML: tous rejetés)' } };
            break;
          }
          
          // 📊 Sélectionner le top 10 PUBLIÉ (même filtres que Telegram)
          const { selected: publishedList, totalEligible } = selectTopDailyPredictions(predictions);
          
          // 💾 Sauvegarder en Supabase TOUS les pronostics éligibles (pas seulement le top publié)
          // → Le bilan doit refléter TOUS les sports, pas seulement ceux affichés sur Telegram
          // publishedList = top 10 affichés ; allEligible = tous les matchs qui passent les filtres ML
          const allEligible = predictions.filter((p: any) => {
            const sport = (p.sport || '').toLowerCase();
            if (['tennis'].includes(sport)) return false;
            if (p.isEstimated) return false;
            const wp = p.winProbability ?? (100 - (p.riskPercentage ?? 50));
            if (wp < 70) return false;
            if (p.riskPercentage > 50) return false;
            return true;
          });
          
          let toSave: any[] = publishedList;
          try {
            const todayISO = new Date().toISOString().split('T')[0];
            
            // 🔥 Si aucun safe/modéré → les kamikazes seront publiés à la place
            // Il faut les sauvegarder pour le bilan
            if (publishedList.length === 0 && predictions.length > 0) {
              // Même logique que publishKamikazeToTelegram + publishKamikazeOnlyMessage
              const nonTennis = predictions.filter((p: any) => {
                const sport = (p.sport || '').toLowerCase();
                return !['tennis'].includes(sport);
              });
              const kamikazePicks = nonTennis
                .filter((p: any) => isKamikaze(p.riskPercentage));
              toSave = capKamikazePerSport(sortKamikazePicks(kamikazePicks));
              console.log(`💣 Mode kamikaze: ${toSave.length} kamikazes à sauvegarder en Supabase (sur ${kamikazePicks.length} totaux)`);
            }
            
            // 💾 Sauvegarder TOUS les éligibles pour le bilan (tous les sports)
            if (allEligible.length > 0) {
              const allDbPredictions = allEligible.map((p: any) => {
                const cleanTeam = (name: string) => (name || '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
                const dateStr = (p.date || '').split('T')[0] || todayISO;
                const timeMatch = (p.date || '').match(/T(\d{2}:\d{2})/);
                const timeSuffix = timeMatch ? `-${timeMatch[1].replace(':', '')}` : '';
                const matchId = `${cleanTeam(p.homeTeam)}-${cleanTeam(p.awayTeam)}-${cleanTeam(p.league || '')}-${dateStr}${timeSuffix}`;
                const isPublished = publishedList.some((pub: any) => 
                  pub.homeTeam === p.homeTeam && pub.awayTeam === p.awayTeam && pub.league === p.league
                );
                return {
                  match_id: matchId,
                  home_team: p.homeTeam,
                  away_team: p.awayTeam,
                  league: p.league || 'Unknown',
                  sport: (p.sport || 'football').toLowerCase(),
                  match_date: p.date || `${todayISO}T12:00:00Z`,
                  odds_home: p.oddsHome || 1.0,
                  odds_draw: p.oddsDraw || null,
                  odds_away: p.oddsAway || 1.0,
                  predicted_result: p.predictedResult || 'home',
                  confidence: p.confidence || 'medium',
                  risk_percentage: p.riskPercentage ?? 50,
                  is_value_bet: p.valueBetDetected === true,
                  edge_value: p._mlEdge || (p.valueBetDetected ? (p.edge || 0) : 0),
                  status: 'pending' as const,
                  source: isPublished ? 'telegram_published' : 'ml_eligible',
                };
              });
              console.log(`💾 Sauvegarde TOUS éligibles: ${allEligible.length} pronostics (published: ${publishedList.length}, non-publiés: ${allEligible.length - publishedList.length})`);
              const allSaved = await SupabaseStore.addPredictions(allDbPredictions);
              console.log(`💾 ${allSaved}/${allEligible.length} pronostics éligibles sauvegardés (bilan complet tous sports)`);
            }
            
            console.log(`📊 Sauvegarde Supabase: ${toSave.length} pronostics publiés sur Telegram`);
            
            if (toSave.length > 0) {
              const dbPredictions = toSave.map((p: any) => {
                const cleanTeam = (name: string) => (name || '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
                const dateStr = (p.date || '').split('T')[0] || todayISO;
                const timeMatch = (p.date || '').match(/T(\d{2}:\d{2})/);
                const timeSuffix = timeMatch ? `-${timeMatch[1].replace(':', '')}` : '';
                const matchId = `${cleanTeam(p.homeTeam)}-${cleanTeam(p.awayTeam)}-${cleanTeam(p.league || '')}-${dateStr}${timeSuffix}`;
                return {
                  match_id: matchId,
                  home_team: p.homeTeam,
                  away_team: p.awayTeam,
                  league: p.league || 'Unknown',
                  sport: (p.sport || 'football').toLowerCase(),
                  match_date: p.date || `${todayISO}T12:00:00Z`,
                  odds_home: p.oddsHome || 1.0,
                  odds_draw: p.oddsDraw || null,
                  odds_away: p.oddsAway || 1.0,
                  predicted_result: p.predictedResult || 'home',
                  confidence: p.confidence || 'medium',
                  risk_percentage: p.riskPercentage ?? 50,
                  is_value_bet: p.valueBetDetected === true,
                  edge_value: p._mlEdge || (p.valueBetDetected ? (p.edge || 0) : 0),
                  status: 'pending' as const,
                };
              });
              console.log(`💾 Sauvegarde summary: ${toSave.length} pronostics, risk breakdown: ${JSON.stringify(toSave.slice(0, 5).map((p: any) => ({ r: p.riskPercentage, s: p.sport, d: (p.date || '').split('T')[0], t: p.homeTeam, vb: p.valueBetDetected })))}`);
              const saved = await SupabaseStore.addPredictions(dbPredictions);
              console.log(`💾 ${saved} pronostics sauvegardés en Supabase (sur ${toSave.length} publiés)`);
              if (saved === 0 && toSave.length > 0) {
                console.error('❌ [ALERTE] Sauvegarde summary ÉCHOUÉE — 0 enregistré sur ${toSave.length}!');
                // Loguer les match_ids et match_dates pour diagnostic
                for (const db of dbPredictions.slice(0, 3)) {
                  console.error(`   ❌ match_id=${db.match_id}, match_date=${db.match_date}, sport=${db.sport}, risk=${db.risk_percentage}`);
                }
              } else if (saved > 0) {
                console.log(`💾 [DETAIL] match_ids sauvegardés: ${dbPredictions.slice(0, 3).map((d: any) => `${d.match_id?.slice(0, 50)}→${d.match_date}`).join(' | ')}`);
              }
            } else {
              console.log('⚠️ Aucun pronostic à sauvegarder (liste vide)');
            }
            
            // 💣 SAUVEGARDER AUSSI les kamikazes séparément (même si safe/modéré existent)
            // Le cron telegram-kamikaze à 13h UTC peut ne rien trouver (matchs US terminés)
            // → sauvegarder les kamikazes ici garantit qu'ils seront dans le bilan
            if (publishedList.length > 0) {
              const nonTennis = predictions.filter((p: any) => {
                const sport = (p.sport || '').toLowerCase();
                return !['tennis'].includes(sport);
              });
              const kamikazePicks = nonTennis.filter((p: any) => isKamikaze(p.riskPercentage));
              const kamikazeToSave = capKamikazePerSport(sortKamikazePicks(kamikazePicks));
              
              if (kamikazeToSave.length > 0) {
                const kamikazeDbPredictions = kamikazeToSave.map((p: any) => {
                  const cleanTeam = (name: string) => (name || '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
                  const dateStr = (p.date || '').split('T')[0] || todayISO;
                  const timeMatch = (p.date || '').match(/T(\d{2}:\d{2})/);
                  const timeSuffix = timeMatch ? `-${timeMatch[1].replace(':', '')}` : '';
                  const matchId = `${cleanTeam(p.homeTeam)}-${cleanTeam(p.awayTeam)}-${cleanTeam(p.league || '')}-${dateStr}${timeSuffix}`;
                  return {
                    match_id: matchId,
                    home_team: p.homeTeam,
                    away_team: p.awayTeam,
                    league: p.league || 'Unknown',
                    sport: (p.sport || 'football').toLowerCase(),
                    match_date: p.date || `${todayISO}T12:00:00Z`,
                    odds_home: p.oddsHome || 1.0,
                    odds_draw: p.oddsDraw || null,
                    odds_away: p.oddsAway || 1.0,
                    predicted_result: p.predictedResult || 'home',
                    confidence: p.confidence || 'medium',
                    risk_percentage: p.riskPercentage ?? 50,
                    is_value_bet: p.valueBetDetected === true,
                    edge_value: p._mlEdge || 0,
                    status: 'pending' as const,
                  };
                });
                const kSaved = await SupabaseStore.addPredictions(kamikazeDbPredictions);
                console.log(`💣 [SUMMARY] ${kSaved} kamikazes sauvegardés en plus (total kamikazes: ${kamikazeToSave.length})`);
              } else {
                console.log('📊 [SUMMARY] Aucun kamikaze à sauvegarder en plus (tous les matchs sont safe/modéré)');
              }
            }
          } catch (e: any) {
            console.log('⚠️ Erreur sauvegarde Supabase:', e.message);
          }
          
          const telegramResult = await publishDailySummaryToTelegram(predictions);
          const isKamikazeMode = publishedList.length === 0 && predictions.length > 0;
          result = { 
            telegram: { 
              success: telegramResult, 
              total: matches.length,
              mlAnalyzed: upcomingWithOdds.length,
              published: isKamikazeMode ? toSave.length : publishedList.length,
              totalEligible,
              excluded: predictions.length - (isKamikazeMode ? toSave.length : publishedList.length),
              source: isKamikazeMode ? 'kamikaze-fallback' : 'unified-ml',
              version: CRON_VERSION,
              message: telegramResult 
                ? isKamikazeMode 
                  ? `💣 Kamikaze publié: ${toSave.length} pronostics (aucun safe/modéré)`
                  : `Résumé ML publié: ${publishedList.length}/10 pronostics`
                : 'Erreur publication Telegram'
            } 
          };
        } catch (e: any) {
          result = { telegram: { success: false, error: 'Erreur interne' } };
        }
        break;
        
      case 'telegram-combo':
        // 🤖 Générer et publier un combiné intelligent via LLM
        try {
          const { generateComboWithLLM } = await import('@/lib/comboService');
          const { publishComboToTelegram: publishCombo } = await import('@/lib/telegramService');
          
          // Récupérer les matchs du jour
          invalidateEspnCache();
          const matches = await getMatchesWithRealOdds();
          
          if (!matches || matches.length === 0) {
            result = { telegram: { success: false, message: 'Aucun match disponible pour combo' } };
            break;
          }
          
          // Filtrer: à venir, cotes réelles, foot et basket uniquement
          const upcomingWithOdds = matches.filter((m: any) =>
            !m.isFinished && !m.isEstimated && m.oddsHome > 0 && m.oddsAway > 0
          );
          
          // Mapper vers le format ComboMatch + détecter les value bets inline
          const comboInputs: any[] = upcomingWithOdds
            .filter((m: any) => {
              const sport = (m.sport || '').toLowerCase();
              return sport === 'football' || sport.includes('foot') || sport === 'basketball' || sport.includes('basket');
            })
            .map((m: any) => {
              // 💎 Détecter value bet: comparer proba modèle vs proba impliquée (seuil 5%)
              const drawProb = m.oddsDraw && m.oddsDraw > 1 ? (100 / m.oddsDraw) : 0;
              const modelProbs = {
                home: m.winProbability || (100 - (m.riskPercentage ?? 50)),
                draw: drawProb,
                away: 100 - (m.winProbability || (100 - (m.riskPercentage ?? 50))) - drawProb,
              };
              const vb = detectValueBets(m.oddsHome, m.oddsDraw, m.oddsAway, modelProbs);
              return {
                homeTeam: m.homeTeam,
                awayTeam: m.awayTeam,
                sport: (m.sport || '').toLowerCase().includes('basket') ? 'basketball' : 'football',
                league: m.league || 'Unknown',
                predictedResult: m.predictedResult || (m.probabilities?.home > m.probabilities?.away ? 'home' : 'away'),
                winProbability: m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : 50),
                oddsHome: m.oddsHome,
                oddsAway: m.oddsAway,
                oddsDraw: m.oddsDraw,
                riskPercentage: m.riskPercentage ?? 50,
                valueBetDetected: vb.detected,
                valueBetType: vb.type,
                confidence: m.confidence || 'medium',
                date: m.date,
                _mlEdge: vb.edge,
                _kellyStake: m._kellyStake,
                _mlReasoning: m._mlReasoning,
                _matchImportance: m._matchImportance,
              };
            });
          
          console.log(`🤖 Combo: ${comboInputs.length} matchs foot/basket éligibles, ${comboInputs.filter(m => m.valueBetDetected).length} value bets détectés`);
          
          if (comboInputs.length < 2) {
            result = { telegram: { success: false, message: 'Pas assez de matchs pour un combo (min 2)' } };
            break;
          }
          
          // LLM génère le combo
          const combo = await generateComboWithLLM(comboInputs);
          
          if (!combo) {
            result = { telegram: { success: false, message: 'LLM: pas de combo généré (pas assez de value bets qualifiés)' } };
            break;
          }
          
          // 💾 Sauvegarder les legs dans Supabase (pour le bilan journalier)
          try {
            const dbPredictions = combo.legs.map((leg: any) => {
              const cleanTeam = (name: string) => (name || '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
              const dateStr = new Date().toISOString().split('T')[0];
              const timeSuffix = combo.comboId.split('-').pop() || '';
              const matchId = `${cleanTeam(leg.homeTeam)}-${cleanTeam(leg.awayTeam)}-${cleanTeam(leg.league || '')}-${dateStr}-${timeSuffix}`;
              return {
                match_id: matchId,
                home_team: leg.homeTeam,
                away_team: leg.awayTeam,
                league: leg.league || 'Unknown',
                sport: (leg.sport || 'football').toLowerCase(),
                match_date: leg.date || `${dateStr}T12:00:00Z`,
                odds_home: leg.predictedResult === 'home' ? leg.odds : (leg.predictedResult === 'away' ? null : null),
                odds_draw: leg.predictedResult === 'draw' ? leg.odds : null,
                odds_away: leg.predictedResult === 'away' ? leg.odds : (leg.predictedResult === 'home' ? null : null),
                predicted_result: leg.predictedResult,
                confidence: leg.confidence || 'medium',
                risk_percentage: 100 - leg.winProbability,
                combo_id: combo.comboId,
                combo_name: combo.name,
                is_combo: true,
                is_value_bet: true, // Combo legs are always value bets
                edge_value: leg.edge || 0,
                status: 'pending' as const,
              };
            });
            
            const saved = await SupabaseStore.addPredictions(dbPredictions);
            console.log(`💾 ${saved} legs combo sauvegardées (combo_id: ${combo.comboId})`);
          } catch (saveErr: any) {
            console.log('⚠️ Erreur sauvegarde combo Supabase:', saveErr.message);
          }
          
          // Publier sur Telegram
          const telegramResult = await publishCombo(combo);
          
          result = {
            telegram: {
              success: telegramResult,
              comboId: combo.comboId,
              comboName: combo.name,
              legs: combo.legs.length,
              combinedOdds: combo.combinedOdds,
              combinedWinProb: (combo.combinedWinProbability * 100).toFixed(1) + '%',
              riskLevel: combo.riskLevel,
              message: telegramResult
                ? `🤖 Combo "${combo.name}" publié (${combo.legs.length} legs, x${combo.combinedOdds.toFixed(2)})`
                : 'Erreur publication combo',
            },
          };
        } catch (e: any) {
          result = { telegram: { success: false, error: 'Erreur interne' } };
        }
        break;
        
      case 'telegram-valuebets':
        // Publier uniquement les value bets sur Telegram
        try {
          console.log('📡 Récupération des matchs pour value bets depuis ESPN...');
          const matches = await getMatchesWithRealOdds();
          
          let predictions: any[] = matches
            .map((m: any) => {
              // 💎 Détecter value bet inline (même logique que combo)
              const drawProb = m.oddsDraw && m.oddsDraw > 1 ? (100 / m.oddsDraw) : 0;
              const modelProbs = {
                home: m.winProbability || (100 - (m.riskPercentage ?? 50)),
                draw: drawProb,
                away: 100 - (m.winProbability || (100 - (m.riskPercentage ?? 50))) - drawProb,
              };
              const vb = detectValueBets(m.oddsHome, m.oddsDraw, m.oddsAway, modelProbs);
              return {
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
                valueBetDetected: vb.detected,
                valueBetType: vb.type,
                riskPercentage: m.riskPercentage,
                winProbability: m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : undefined),
                oddsHome: m.oddsHome,
                oddsAway: m.oddsAway,
                oddsDraw: m.oddsDraw,
              };
            });
          console.log(`💎 Value bets: ${predictions.filter(p => p.valueBetDetected).length} détectés sur ${predictions.length} matchs`);

          const telegramResult = await publishValueBetsToTelegram(predictions);
          
          // 💾 Sauvegarder les value bets PUBLIÉS en Supabase pour le bilan
          // Les value bets sont un sous-ensemble des safe/modéré → déjà sauvegardés via telegram-summary
          // Mais si appelé séparément, il faut aussi les sauvegarder
          try {
            const vbFiltered = predictions.filter((p: any) => {
              const sport = (p.sport || '').toLowerCase();
              // 🎾 Exclure tennis + filtres value bet standard
              return !sport.includes('tennis') && 
                p.valueBetDetected && 
                p.confidence !== 'low' && 
                isSafeOrModerate(p.riskPercentage);
            })
            // Trier par fiabilité décroissante (edge descendant, risque ascendant)
            .sort((a: any, b: any) => {
              const edgeA = a._mlEdge || a.edge || 0;
              const edgeB = b._mlEdge || b.edge || 0;
              if (edgeB !== edgeA) return edgeB - edgeA;
              return (a.riskPercentage || 100) - (b.riskPercentage || 100);
            })
            // 🔒 PLAFONNER à 5 — seuls les 5 plus fiables sont sauvegardés pour le bilan
            .slice(0, 5);
            
            if (vbFiltered.length > 0) {
              const todayISO = new Date().toISOString().split('T')[0];
              const dbPredictions = vbFiltered.map((p: any) => {
                const cleanTeam = (name: string) => (name || '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
                const dateStr = (p.date || '').split('T')[0] || todayISO;
                const timeMatch = (p.date || '').match(/T(\d{2}:\d{2})/);
                const timeSuffix = timeMatch ? `-${timeMatch[1].replace(':', '')}` : '';
                const matchId = `${cleanTeam(p.homeTeam)}-${cleanTeam(p.awayTeam)}-${cleanTeam(p.league || '')}-${dateStr}${timeSuffix}`;
                return {
                  match_id: matchId,
                  home_team: p.homeTeam,
                  away_team: p.awayTeam,
                  league: p.league || 'Unknown',
                  sport: (p.sport || 'football').toLowerCase(),
                  match_date: p.date || `${todayISO}T12:00:00Z`,
                  odds_home: p.oddsHome || 1.0,
                  odds_draw: p.oddsDraw || null,
                  odds_away: p.oddsAway || 1.0,
                  predicted_result: p.predictedResult || 'home',
                  confidence: p.confidence || 'medium',
                  risk_percentage: p.riskPercentage || 50,
                  is_value_bet: true, // Value bets section — always true
                  edge_value: p._mlEdge || p.edge || 0,
                  status: 'pending' as const,
                };
              });
              const saved = await SupabaseStore.addPredictions(dbPredictions);
              console.log(`💾 ${saved} value bets sauvegardés en Supabase (sur ${vbFiltered.length} publiés)`);
            }
          } catch (saveErr: any) {
            console.log('⚠️ Erreur sauvegarde value bets Supabase:', saveErr.message);
          }
          
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
          result = { telegram: { success: false, error: 'Erreur interne' } };
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
          
          // 🎾 Tennis EXCLU du kamikaze — pas de pipeline ML fiable
          // Les prédictions tennis ne sont plus ajoutées aux pronostics Telegram
          
          const kamikazeCount = predictions.filter(p => isKamikaze(p.riskPercentage)).length;
          
          // 💾 Sauvegarder UNIQUEMENT les pronostics kamikaze PUBLIÉS sur Telegram
          // ⚠️ Même logique que publishKamikazeToTelegram : isKamikaze + tri par cote desc + max 3/sport
          try {
            const kamikazeFiltered = capKamikazePerSport(
              sortKamikazePicks(
                predictions.filter((p: any) => isKamikaze(p.riskPercentage))
              )
            );
            
            const dbPredictions = kamikazeFiltered.map((p: any) => {
                const cleanTeam = (name: string) => (name || '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
                const dateStr = (p.date || '').split('T')[0] || new Date().toISOString().split('T')[0];
                const todayISO = dateStr;
                const timeMatch = (p.date || '').match(/T(\d{2}:\d{2})/);
                const timeSuffix = timeMatch ? `-${timeMatch[1].replace(':', '')}` : '';
                const matchId = `${cleanTeam(p.homeTeam)}-${cleanTeam(p.awayTeam)}-${cleanTeam(p.league || '')}-${todayISO}${timeSuffix}`;
                return {
                  match_id: matchId,
                  home_team: p.homeTeam,
                  away_team: p.awayTeam,
                  league: p.league || 'Unknown',
                  sport: (p.sport || 'football').toLowerCase(),
                  match_date: p.date || `${todayISO}T12:00:00Z`,
                  odds_home: p.oddsHome || 1.0,
                  odds_draw: p.oddsDraw || null,
                  odds_away: p.oddsAway || 1.0,
                  predicted_result: p.predictedResult || 'home',
                  confidence: p.confidence || 'medium',
                  risk_percentage: p.riskPercentage ?? 50,
                  is_value_bet: p.valueBetDetected === true,
                  edge_value: p._mlEdge || 0,
                  status: 'pending' as const,
                };
              });
            console.log(`💣 Sauvegarde kamikaze GET: ${kamikazeFiltered.length} kamikazes, risk breakdown: ${JSON.stringify(kamikazeFiltered.slice(0, 5).map((p: any) => ({ r: p.riskPercentage, s: p.sport, t: p.homeTeam, vb: p.valueBetDetected })))}`);
            const saved = await SupabaseStore.addPredictions(dbPredictions);
            console.log(`💾 ${saved} pronostics kamikaze PUBLIÉS sauvegardés dans Supabase (sur ${kamikazeCount} kamikazes totaux)`);
            if (saved === 0 && kamikazeFiltered.length > 0) {
              console.error('💣 [ALERTE] Sauvegarde kamikaze GET ÉCHOUÉE — 0 enregistrement sauvegardé malgré ${kamikazeFiltered.length} kamikazes!');
            }
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
          result = { telegram: { success: false, error: 'Erreur interne' } };
        }
        break;
        
      case 'telegram-results':
        // Publier le bilan quotidien des pronostics (prédictions vs résultats réels)
        // ⚠️ DÉCOUPLÉ: verifyAllResults() peut crasher, le bilan doit QUAND MÊME être publié
        try {
          // D'abord lancer la vérification pour mettre à jour les résultats (non-bloquant)
          let verifyResult = { verified: 0, updated: 0, won: 0, lost: 0, errors: [] as string[] };
          try {
            console.log('🔄 Vérification des résultats avant bilan...');
            verifyResult = await verifyAllResults();
            console.log(`✅ Vérification: ${verifyResult.verified} matchs, ${verifyResult.updated} mis à jour`);
          } catch (verifyErr: any) {
            console.error(`⚠️ verifyAllResults() échoué (non-bloquant): ${verifyErr.message}`);
          }
          
          // Petite pause pour que Supabase soit à jour
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Récupérer la date cible (hier par défaut, ou date passée en param)
          const targetDate = url.searchParams.get('date');
          const bilanDateISO = targetDate || (() => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            return yesterday.toISOString().split('T')[0];
          })();
          
          // 🔍 Vérifier d'abord si des prédictions ont été PUBLIÉES ce jour (created_at)
          // Le bilan couvre les publications de la veille → filtrer par created_at
          const predsCheck = await SupabaseStore.getPredictionsByCreatedAt(bilanDateISO);
          const totalPredsExist = predsCheck.length;
          console.log(`📊 [BILAN CHECK] ${totalPredsExist} pronostics publiés le ${bilanDateISO}`);
          
          const telegramResult = await publishDailyResultsToTelegram(targetDate || undefined);
          
          // Publier aussi le bilan kamikaze séparément
          const kamikazeBilanDate = targetDate || undefined;
          const kamikazeResult = await publishKamikazeBilanToTelegram(kamikazeBilanDate);
          
          // 🔔 Si aucun bilan n'a été publié
          if (!telegramResult && !kamikazeResult) {
            const dateObj = new Date(bilanDateISO + 'T12:00:00');
            const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
            const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
            const dateLabel = `${dayNames[dateObj.getDay()]} ${dateObj.getDate()} ${monthNames[dateObj.getMonth()]}`;
            
            let noDataMsg = '╔═════════════════════════════╗\n';
            noDataMsg += '║\n';
            noDataMsg += '║   📊 <b>BILAN DE LA VEILLE</b>\n';
            noDataMsg += '║\n';
            noDataMsg += '╚═════════════════════════════╝\n\n';
            noDataMsg += `📅 <b>${dateLabel}</b>\n\n`;
            noDataMsg += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
            
            if (totalPredsExist > 0) {
              // Pronostics publiés ce jour mais résultats pas encore disponibles
              const pendingCount = predsCheck.filter(p => p.status === 'pending').length;
              noDataMsg += `⏳ <b>${totalPredsExist} pronostic${totalPredsExist > 1 ? 's' : ''} publié${totalPredsExist > 1 ? 's' : ''}</b> — ${pendingCount} en attente de résultat\n\n`;
              noDataMsg += `🔍 Vérification: ${verifyResult.verified} matchs vérifiés, ${verifyResult.updated} mis à jour\n`;
            } else {
              // Vraiment aucun pronostic pour cette date
              noDataMsg += '⏳ <b>Aucun pronostic à vérifier</b>\n\n';
              noDataMsg += `🔍 Vérification: ${verifyResult.verified} matchs vérifiés, ${verifyResult.updated} mis à jour\n`;
            }
            if (verifyResult.errors.length > 0) {
              noDataMsg += `⚠️ Erreurs vérification: ${verifyResult.errors.slice(0, 3).join(', ')}\n`;
            }
            noDataMsg += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
            noDataMsg += '🤖 Bilan journalier · Aucune prédiction active\n';
            noDataMsg += '━━━━━━━━━━━━━━━━━━━━━━━━━';
            
            const { sendTelegramMessage } = await import('@/lib/telegramService');
            await sendTelegramMessage(noDataMsg);
          }
          
          result = { 
            telegram: { 
              success: telegramResult || kamikazeResult,
              verification: { verified: verifyResult.verified, updated: verifyResult.updated, won: verifyResult.won, lost: verifyResult.lost },
              kamikazeBilan: kamikazeResult,
              message: telegramResult 
                ? '📊 Bilan journalier publié sur Telegram'
                : kamikazeResult 
                  ? '💣 Bilan kamikaze uniquement (pas de safe/modéré)'
                  : '📊 Message informatif envoyé (aucun pronostic à vérifier)'
            } 
          };
        } catch (e: any) {
          // ⚠️ Dernier recours: même si tout crash, essayer d'envoyer un message d'erreur
          try {
            const errMsg = `⚠️ <b>ERREUR BILAN</b>\n\n📅 Le cron tourne mais une erreur est survenue.`;
            const { sendTelegramMessage } = await import('@/lib/telegramService');
            await sendTelegramMessage(errMsg);
          } catch { /* silent */ }
          result = { telegram: { success: false, error: 'Erreur interne' } };
        }
        break;

      case 'telegram-kamikaze-bilan':
        // Publier UNIQUEMENT le bilan kamikaze (sans relancer verify)
        try {
          const kDate = url.searchParams.get('date');
          const kamikazeOnlyResult = await publishKamikazeBilanToTelegram(kDate || undefined);
          result = {
            telegram: {
              success: kamikazeOnlyResult,
              message: kamikazeOnlyResult
                ? '💣 Bilan kamikaze publié sur Telegram'
                : 'Aucun pronostic kamikaze pour cette date'
            }
          };
        } catch (e: any) {
          result = { telegram: { success: false, error: 'Erreur interne' } };
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
          result = { telegram: { success: false, error: 'Erreur interne' } };
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
        } catch (e: any) { result = { reset: { success: false, error: 'Erreur interne' } }; }
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
        } catch (e: any) { result = { fixData: { success: false, error: 'Erreur interne' } }; }
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
        } catch (e: any) { result = { rebuildDate: { success: false, error: 'Erreur interne' } }; }
        break;

      case 'announce':
        // Envoyer un message d'annonce sur Telegram
        try {
          const msg = url.searchParams.get('msg') || 'Mise à jour déployée';
          const sent = await (await import('@/lib/telegramService')).sendTelegramMessage(msg);
          result = { announce: { success: sent, message: sent ? 'Annonce publiée' : 'Erreur envoi' } };
        } catch (e: any) { result = { announce: { success: false, error: 'Erreur interne' } }; }
        break;

      default:
        return NextResponse.json(
          { error: 'Action non reconnue', validActions: ['precalc', 'verify', 'verify-evening', 'verify-morning', 'verify-night', 'update-ml', 'update-stats', 'update-fundamentals', 'train-ml', 'backtest', 'ml-stats', 'sync-all', 'ping', 'db-status', 'test-espn', 'telegram-summary', 'telegram-valuebets', 'telegram-kamikaze', 'telegram-combo', 'telegram-results', 'telegram-kamikaze-bilan', 'telegram-monthly', 'reset-mlb', 'reset-date', 'rebuild-bilan', 'reset-results', 'fix-data', 'fix-sport', 'rebuild-date'] },
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
      error: 'Erreur interne',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * POST - Permet de déclencher manuellement (admin)
 */
export async function POST(request: NextRequest) {
  // SECURITY FIX: POST must also verify auth (Vercel Cron uses Bearer header)
  const authHeader = request.headers.get('authorization');
  const url = new URL(request.url);
  const urlSecret = url.searchParams.get('secret');
  const action = url.searchParams.get('action') || 'verify';
  
  const providedSecret = authHeader?.replace('Bearer ', '') || urlSecret;
  
  if (!CRON_SECRET || !providedSecret || !timingSafeEqual(providedSecret, CRON_SECRET)) {
    return NextResponse.json(
      { error: 'Non autorisé' },
      { status: 401 }
    );
  }

  const startTime = Date.now();
  console.log(`🔄 [POST] Début du cron job - Action: ${action}`);

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
          result = { statsUpdate: { success: false, error: 'Erreur interne' } };
        }
        break;
        
      case 'sync-ml':
        // Forcer la synchronisation ML
        try {
          const mlSyncResult = await syncPredictionsToML();
          result = { mlSync: mlSyncResult };
        } catch (e: any) {
          result = { mlSync: { success: false, error: 'Erreur interne' } };
        }
        break;

      case 'sync-all':
        // Synchronisation complète depuis stats_history
        try {
          const syncResult = await fullSyncFromStatsHistory();
          result = { syncAll: syncResult };
        } catch (e: any) {
          result = { syncAll: { success: false, error: 'Erreur interne' } };
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
          result = { mlTraining: { success: false, error: 'Erreur interne' } };
        }
        break;
        
      case 'backtest':
        // Backtest ML vs hasard
        try {
          const backtestResult = await runBacktest(30);
          result = { backtest: backtestResult };
        } catch (e: any) {
          result = { backtest: { success: false, error: 'Erreur interne' } };
        }
        break;
        
      case 'ml-stats':
        // Statistiques du modèle ML
        try {
          const mlStats = await getUnifiedMLStats();
          result = { mlStats };
        } catch (e: any) {
          result = { mlStats: { success: false, error: 'Erreur interne' } };
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
          result = { resetDate: { success: false, error: 'Erreur interne' } };
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
          result = { resetMLB: { success: false, error: 'Erreur interne' } };
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
              // Kamikaze: tri par cote desc, max 3 par sport
              const sorted = [...preds].sort((a, b) => {
                const oddsA = Math.max(a.odds_home || 0, a.odds_away || 0);
                const oddsB = Math.max(b.odds_home || 0, b.odds_away || 0);
                return oddsB - oddsA;
              });
              const capped = capKamikazePerSport(sorted);
              capped.forEach(p => toKeep.add(p.match_id));
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
          result = { cleanup: { success: false, error: 'Erreur interne' } };
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

          // Kamikaze: trier par cote desc, max 3 par sport (aligné sur publishKamikazeToTelegram)
          const kamikazeSorted = [...kamikaze].sort((a, b) => {
            const oddsA = Math.max(a.odds_home || 0, a.odds_away || 0);
            const oddsB = Math.max(b.odds_home || 0, b.odds_away || 0);
            return oddsB - oddsA;
          });
          const kamikazeCapped = capKamikazePerSport(kamikazeSorted);
          kamikazeCapped.forEach(p => publishedIds.add(p.match_id));

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
          result = { rebuild: { success: false, error: 'Erreur interne' } };
        }
        break;

      case 'telegram-kamikaze':
        // [POST] Publier les pronostics Kamikaze (haut risque) sur Telegram
        try {
          console.log('📡 [POST] Récupération des matchs pour kamikaze depuis ESPN (force refresh)...');
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
          
          const kamikazeCount = predictions.filter(p => isKamikaze(p.riskPercentage)).length;
          
          // 💾 Sauvegarder UNIQUEMENT les pronostics kamikaze PUBLIÉS (même logique que GET)
          try {
            const kamikazeFiltered = capKamikazePerSport(
              sortKamikazePicks(
                predictions.filter((p: any) => isKamikaze(p.riskPercentage))
              )
            );
            
            const dbPredictions = kamikazeFiltered.map((p: any) => {
              const cleanTeam = (name: string) => (name || '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
              const dateStr = p.date?.split('T')[0] || new Date().toISOString().split('T')[0];
              const timeMatch = (p.date || '').match(/T(\d{2}:\d{2})/);
              const timeSuffix = timeMatch ? `-${timeMatch[1].replace(':', '')}` : '';
              const matchId = `${cleanTeam(p.homeTeam)}-${cleanTeam(p.awayTeam)}-${cleanTeam(p.league || '')}-${dateStr}${timeSuffix}`;
              return {
                match_id: matchId,
                home_team: p.homeTeam,
                away_team: p.awayTeam,
                league: p.league || 'Unknown',
                sport: (p.sport || 'football').toLowerCase(),
                match_date: p.date || `${dateStr}T12:00:00Z`,
                odds_home: p.oddsHome || 1.0,
                odds_draw: p.oddsDraw || null,
                odds_away: p.oddsAway || 1.0,
                predicted_result: p.predictedResult || 'home',
                confidence: p.confidence || 'medium',
                risk_percentage: p.riskPercentage ?? 50,
                is_value_bet: p.valueBetDetected === true,
                edge_value: p._mlEdge || 0,
                status: 'pending' as const,
              };
            });
            console.log(`💣 Sauvegarde kamikaze POST: ${kamikazeFiltered.length} kamikazes, risk: ${JSON.stringify(kamikazeFiltered.slice(0, 5).map((p: any) => ({ r: p.riskPercentage, s: p.sport, t: p.homeTeam, vb: p.valueBetDetected })))}`);
            const saved = await SupabaseStore.addPredictions(dbPredictions);
            console.log(`💾 [POST] ${saved} pronostics kamikaze sauvegardés en Supabase (sur ${kamikazeCount} totaux)`);
            if (saved === 0 && kamikazeFiltered.length > 0) {
              console.error('💣 [ALERTE] Sauvegarde kamikaze POST ÉCHOUÉE — 0 enregistrement!');
            }
          } catch (e: any) {
            console.log('⚠️ [POST] Erreur sauvegarde kamikaze:', e.message);
          }
          
          const telegramResult = await publishKamikazeToTelegram(predictions);
          result = { 
            telegram: { 
              success: telegramResult, 
              total: kamikazeCount,
              message: telegramResult 
                ? `💣 [POST] ${kamikazeCount} pronostic(s) Kamikaze publié(s)`
                : 'Erreur ou aucun pronostic Kamikaze'
            } 
          };
        } catch (e: any) {
          result = { telegram: { success: false, error: 'Erreur interne' } };
        }
        break;

      case 'telegram-results':
        try {
          // ⚠️ DÉCOUPLÉ: verifyAllResults() peut crasher, le bilan doit QUAND MÊME être publié
          let verifyResult = { verified: 0, updated: 0, won: 0, lost: 0, errors: [] as string[] };
          try {
            console.log('🔄 [POST] Vérification des résultats avant bilan...');
            verifyResult = await verifyAllResults();
          } catch (verifyErr: any) {
            console.error(`⚠️ [POST] verifyAllResults() échoué (non-bloquant): ${verifyErr.message}`);
          }
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
          result = { telegram: { success: false, error: 'Erreur interne' } };
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
            predictedResult: normalizePredictionType(m.recommendations?.[0]?.type), // ← type = 'home'|'away'|'draw' normalisé
            confidence: m.confidence,
            valueBetDetected: m.valueBets?.length > 0,
            riskPercentage: m.riskPercentage,
            winProbability: m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : undefined),
            oddsHome: m.oddsHome,
            oddsAway: m.oddsAway,
            oddsDraw: m.oddsDraw,
          }));

          const { selected: publishedList } = selectTopDailyPredictions(predictions);

          // 💾 [POST] Sauvegarder TOUS les éligibles en Supabase (pas seulement le top publié)
          const allEligiblePOST = predictions.filter((p: any) => {
            const sport = (p.sport || '').toLowerCase();
            if (['tennis'].includes(sport)) return false;
            if (p.riskPercentage > 50) return false;
            const wp = p.winProbability ?? (100 - (p.riskPercentage ?? 50));
            return wp >= 70;
          });

          try {
            const todayISO = new Date().toISOString().split('T')[0];
            if (allEligiblePOST.length > 0) {
              const allDbPredictions = allEligiblePOST.map((p: any) => {
                const cleanTeam = (name: string) => (name || '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
                const dateStr = (p.date || '').split('T')[0] || todayISO;
                const timeMatch = (p.date || '').match(/T(\d{2}:\d{2})/);
                const timeSuffix = timeMatch ? `-${timeMatch[1].replace(':', '')}` : '';
                const matchId = `${cleanTeam(p.homeTeam)}-${cleanTeam(p.awayTeam)}-${cleanTeam(p.league || '')}-${dateStr}${timeSuffix}`;
                return {
                  match_id: matchId,
                  home_team: p.homeTeam,
                  away_team: p.awayTeam,
                  league: p.league || 'Unknown',
                  sport: (p.sport || 'football').toLowerCase(),
                  match_date: p.date || `${todayISO}T12:00:00Z`,
                  odds_home: p.oddsHome || 1.0,
                  odds_draw: p.oddsDraw || null,
                  odds_away: p.oddsAway || 1.0,
                  predicted_result: p.predictedResult || 'home',
                  confidence: p.confidence || 'medium',
                  risk_percentage: p.riskPercentage ?? 50,
                  is_value_bet: p.valueBetDetected === true,
                  edge_value: 0,
                  status: 'pending' as const,
                  source: 'telegram_published',
                };
              });
              const allSaved = await SupabaseStore.addPredictions(allDbPredictions);
              console.log(`💾 [POST summary] ${allSaved}/${allEligiblePOST.length} éligibles sauvegardés (bilan complet tous sports)`);
            }
          } catch (saveErr: any) {
            console.log('⚠️ [POST summary] Erreur sauvegarde Supabase:', saveErr.message);
          }

          const telegramResult = await publishDailySummaryToTelegram(predictions);
          result = {
            telegram: {
              success: telegramResult,
              total: predictions.length,
              published: publishedList.length,
              excluded: predictions.length - publishedList.length,
              saved: publishedList.length,
              message: telegramResult
                ? `Résumé publié: ${publishedList.length} pronostics sur Telegram`
                : 'Erreur publication Telegram'
            }
          };
        } catch (e: any) {
          result = { telegram: { success: false, error: 'Erreur interne' } };
        }
        break;

      case 'telegram-valuebets':
        // Publier uniquement les value bets sur Telegram (UNIQUEMENT safe et modéré)
        try {
          const matches = await getMatchesWithRealOdds();
          const predictions = matches.map((m: any) => {
            // 💎 Détecter value bet inline
            const drawProb = m.oddsDraw && m.oddsDraw > 1 ? (100 / m.oddsDraw) : 0;
            const modelProbs = {
              home: m.winProbability || (100 - (m.riskPercentage ?? 50)),
              draw: drawProb,
              away: 100 - (m.winProbability || (100 - (m.riskPercentage ?? 50))) - drawProb,
            };
            const vb = detectValueBets(m.oddsHome, m.oddsDraw, m.oddsAway, modelProbs);
            return {
              homeTeam: m.homeTeam,
              awayTeam: m.awayTeam,
              sport: m.sport,
              league: m.league,
              date: m.date,
              displayDate: m.displayDate,
              recommendation: m.recommendations?.[0]?.label,
              predictedResult: m.predictedResult || (m.probabilities?.home > m.probabilities?.away ? 'home' : 'away'),
              confidence: m.confidence,
              riskPercentage: m.riskPercentage,
              winProbability: m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : undefined),
              valueBetDetected: vb.detected,
              valueBetType: vb.type,
              oddsHome: m.oddsHome,
              oddsAway: m.oddsAway,
              oddsDraw: m.oddsDraw,
            };
          });
          console.log(`💎 [POST] Value bets: ${predictions.filter(p => p.valueBetDetected).length} détectés sur ${predictions.length} matchs`);

          const telegramResult = await publishValueBetsToTelegram(predictions);
          
          // 💾 Sauvegarder les value bets PUBLIÉS en Supabase (POST = même logique que GET)
          try {
            const vbFiltered = predictions.filter((p: any) => {
              const sport = (p.sport || '').toLowerCase();
              return !sport.includes('tennis') && p.valueBetDetected && p.confidence !== 'low' && isSafeOrModerate(p.riskPercentage);
            }).slice(0, 5);
            if (vbFiltered.length > 0) {
              const todayISO = new Date().toISOString().split('T')[0];
              const dbPredictions = vbFiltered.map((p: any) => {
                const cleanTeam = (name: string) => (name || '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
                const dateStr = (p.date || '').split('T')[0] || todayISO;
                const timeMatch = (p.date || '').match(/T(\d{2}:\d{2})/);
                const timeSuffix = timeMatch ? `-${timeMatch[1].replace(':', '')}` : '';
                const matchId = `${cleanTeam(p.homeTeam)}-${cleanTeam(p.awayTeam)}-${cleanTeam(p.league || '')}-${dateStr}${timeSuffix}`;
                return {
                  match_id: matchId, home_team: p.homeTeam, away_team: p.awayTeam,
                  league: p.league || 'Unknown', sport: (p.sport || 'football').toLowerCase(),
                  match_date: p.date || `${todayISO}T12:00:00Z`, odds_home: p.oddsHome || 1.0,
                  odds_draw: p.oddsDraw || null, odds_away: p.oddsAway || 1.0,
                  predicted_result: p.predictedResult || 'home', confidence: p.confidence || 'medium',
                  risk_percentage: p.riskPercentage || 50, is_value_bet: true,
                  edge_value: p._mlEdge || p.edge || 0, status: 'pending' as const,
                };
              });
              await SupabaseStore.addPredictions(dbPredictions);
              console.log(`💾 [POST] ${vbFiltered.length} value bets sauvegardés en Supabase`);
            }
          } catch (saveErr: any) {
            console.log('⚠️ [POST] Erreur sauvegarde value bets:', saveErr.message);
          }
          
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
          result = { telegram: { success: false, error: 'Erreur interne' } };
        }
        break;

      case 'telegram-combo':
        // 🤖 Générer et publier un combiné intelligent via LLM (POST)
        try {
          const { generateComboWithLLM } = await import('@/lib/comboService');
          const { publishComboToTelegram: publishCombo } = await import('@/lib/telegramService');
          
          invalidateEspnCache();
          const matches = await getMatchesWithRealOdds();
          
          if (!matches || matches.length === 0) {
            result = { telegram: { success: false, message: 'Aucun match disponible pour combo' } };
            break;
          }
          
          const upcomingWithOdds = matches.filter((m: any) =>
            !m.isFinished && !m.isEstimated && m.oddsHome > 0 && m.oddsAway > 0
          );
          
          const comboInputs: any[] = upcomingWithOdds
            .filter((m: any) => {
              const sport = (m.sport || '').toLowerCase();
              return sport === 'football' || sport.includes('foot') || sport === 'basketball' || sport.includes('basket');
            })
            .map((m: any) => {
              // 💎 Détecter value bet inline
              const drawProb = m.oddsDraw && m.oddsDraw > 1 ? (100 / m.oddsDraw) : 0;
              const modelProbs = {
                home: m.winProbability || (100 - (m.riskPercentage ?? 50)),
                draw: drawProb,
                away: 100 - (m.winProbability || (100 - (m.riskPercentage ?? 50))) - drawProb,
              };
              const vb = detectValueBets(m.oddsHome, m.oddsDraw, m.oddsAway, modelProbs);
              return {
                homeTeam: m.homeTeam,
                awayTeam: m.awayTeam,
                sport: (m.sport || '').toLowerCase().includes('basket') ? 'basketball' : 'football',
                league: m.league || 'Unknown',
                predictedResult: m.predictedResult || (m.probabilities?.home > m.probabilities?.away ? 'home' : 'away'),
                winProbability: m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : 50),
                oddsHome: m.oddsHome,
                oddsAway: m.oddsAway,
                oddsDraw: m.oddsDraw,
                riskPercentage: m.riskPercentage ?? 50,
                valueBetDetected: vb.detected,
                valueBetType: vb.type,
                confidence: m.confidence || 'medium',
                date: m.date,
                _mlEdge: vb.edge,
                _kellyStake: m._kellyStake,
                _mlReasoning: m._mlReasoning,
                _matchImportance: m._matchImportance,
              };
            });
          
          if (comboInputs.length < 2) {
            result = { telegram: { success: false, message: 'Pas assez de matchs pour un combo (min 2)' } };
            break;
          }
          
          const combo = await generateComboWithLLM(comboInputs);
          
          if (!combo) {
            result = { telegram: { success: false, message: 'LLM: pas de combo généré' } };
            break;
          }
          
          try {
            const dbPredictions = combo.legs.map((leg: any) => {
              const cleanTeam = (name: string) => (name || '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
              const dateStr = new Date().toISOString().split('T')[0];
              const timeSuffix = combo.comboId.split('-').pop() || '';
              const matchId = `${cleanTeam(leg.homeTeam)}-${cleanTeam(leg.awayTeam)}-${cleanTeam(leg.league || '')}-${dateStr}-${timeSuffix}`;
              return {
                match_id: matchId,
                home_team: leg.homeTeam,
                away_team: leg.awayTeam,
                league: leg.league || 'Unknown',
                sport: (leg.sport || 'football').toLowerCase(),
                match_date: leg.date || `${dateStr}T12:00:00Z`,
                odds_home: leg.predictedResult === 'home' ? leg.odds : null,
                odds_draw: leg.predictedResult === 'draw' ? leg.odds : null,
                odds_away: leg.predictedResult === 'away' ? leg.odds : null,
                predicted_result: leg.predictedResult,
                confidence: leg.confidence || 'medium',
                risk_percentage: 100 - leg.winProbability,
                combo_id: combo.comboId,
                combo_name: combo.name,
                is_combo: true,
                is_value_bet: true, // Combo legs are always value bets
                edge_value: leg.edge || 0,
                status: 'pending' as const,
              };
            });
            
            const saved = await SupabaseStore.addPredictions(dbPredictions);
            console.log(`💾 [POST] ${saved} legs combo sauvegardées (combo_id: ${combo.comboId})`);
          } catch (saveErr: any) {
            console.log('⚠️ Erreur sauvegarde combo Supabase:', saveErr.message);
          }
          
          const telegramResult = await publishCombo(combo);
          
          result = {
            telegram: {
              success: telegramResult,
              comboId: combo.comboId,
              comboName: combo.name,
              legs: combo.legs.length,
              combinedOdds: combo.combinedOdds,
              message: telegramResult ? `🤖 Combo "${combo.name}" publié` : 'Erreur publication combo',
            },
          };
        } catch (e: any) {
          result = { telegram: { success: false, error: 'Erreur interne' } };
        }
        break;

      case 'mlb-palier': {
        // Analyse MLB quotidienne pour montante palier intelligent → message perso Telegram
        try {
          const mlbResult = await generateMLBPalierAnalysis();
          result = mlbResult;
        } catch (e: any) {
          console.error('❌ Erreur MLB palier:', e);
          result = { mlb_palier: { success: false, error: e.message } };
        }
        break;
      }

      default:
        return NextResponse.json(
          { error: 'Action non reconnue', validActions: ['precalc', 'verify', 'verify-evening', 'verify-morning', 'verify-night', 'update-stats', 'sync-ml', 'sync-all', 'ping', 'train-ml', 'backtest', 'ml-stats', 'test-espn', 'telegram-summary', 'telegram-valuebets', 'telegram-combo', 'telegram-results', 'reset-mlb', 'reset-date', 'cleanup-unpublished', 'rebuild-bilan', 'reset-results', 'mlb-palier'] },
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
      error: 'Erreur interne'
    }, { status: 500 });
  }
}

// ============================================
// MLB PALIER INTELLIGENT - Analyse quotidienne
// ============================================

const MLB_HFA = 0.038;

function mlbAmericanToProb(oddsStr: string): number {
  const odds = parseInt(oddsStr, 10);
  if (odds > 0) return odds / (odds + 100);
  return 100 / (Math.abs(odds) + 100);
}

function mlbOddsToDecimal(oddsStr: string): number {
  const odds = parseInt(oddsStr, 10);
  if (odds < 0) return 100 / Math.abs(odds);
  return 1 + odds / 100;
}

interface MLBMatchAnalysis {
  match: string;
  time: string;
  fav: string;
  favOdds: string;
  favProb: number;
  edge: number;
  risk: string;
  emoji: string;
}

async function generateMLBPalierAnalysis(): Promise<{ mlb_palier: { success: boolean; matches: number; combo?: string; error?: string } }> {
  console.log('⚾ [MLB PALIER] Début analyse quotidienne...');
  
  // Fetch today's MLB scoreboard from ESPN
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0].replace(/-/g, '');
  
  // Also fetch tomorrow in case today's odds aren't up yet
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0].replace(/-/g, '');
  
  let allMatches: MLBMatchAnalysis[] = [];
  
  for (const dateStr of [todayStr, tomorrowStr]) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${dateStr}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        console.log(`⚠️ [MLB PALIER] ESPN ${dateStr} → ${resp.status}`);
        continue;
      }
      
      const data = await resp.json();
      const events = data.events || [];
      const dateLabel = dateStr === todayStr ? "Aujourd'hui" : "Demain";
      
      console.log(`📊 [MLB PALIER] ${dateLabel} (${dateStr}): ${events.length} matchs`);
      
      for (const event of events) {
        const comp = event.competitions?.[0];
        if (!comp) continue;
        
        const competitors = comp.competitors || [];
        let homeTeam = 'Unknown';
        let awayTeam = 'Unknown';
        
        for (const c of competitors) {
          const name = c.team?.displayName || 'Unknown';
          if (c.homeAway === 'home') homeTeam = name;
          else awayTeam = name;
        }
        
        // Extract moneyline odds from DraftKings (preferred) or any provider
        let homeOdds: string | null = null;
        let awayOdds: string | null = null;
        
        const oddsItems = comp.odds || [];
        const providers = ['DraftKings', 'Caesars', 'FanDuel'];
        
        for (const prov of providers) {
          for (const o of oddsItems) {
            if (o.provider?.name?.includes(prov)) {
              try {
                homeOdds = o.moneyline.home.close.odds;
                awayOdds = o.moneyline.away.close.odds;
                break;
              } catch {}
            }
          }
          if (homeOdds) break;
        }
        
        // Fallback: any provider
        if (!homeOdds) {
          for (const o of oddsItems) {
            try {
              homeOdds = o.moneyline.home.close.odds;
              awayOdds = o.moneyline.away.close.odds;
              break;
            } catch {}
          }
        }
        
        if (!homeOdds || !awayOdds) continue;
        
        // Calculate probabilities
        const homeImplied = mlbAmericanToProb(homeOdds);
        const awayImplied = mlbAmericanToProb(awayOdds);
        const totalImplied = homeImplied + awayImplied;
        if (totalImplied === 0) continue;
        
        // Fair probabilities (remove vigorish)
        const homeFair = homeImplied / totalImplied;
        const awayFair = awayImplied / totalImplied;
        
        // Model probability with HFA
        const homeModel = Math.max(0.01, Math.min(0.99, homeFair + MLB_HFA / 2));
        const awayModel = Math.max(0.01, Math.min(0.99, awayFair - MLB_HFA / 2));
        
        // Determine favorite
        let fav: string, favOdds: string, favProb: number, favImplied: number;
        if (homeModel > awayModel) {
          fav = homeTeam; favOdds = homeOdds; favProb = homeModel; favImplied = homeImplied;
        } else {
          fav = awayTeam; favOdds = awayOdds; favProb = awayModel; favImplied = awayImplied;
        }
        
        const edge = (favProb - favImplied) * 100;
        
        let risk: string, emoji: string;
        if (favProb >= 0.65) { risk = 'SAFE'; emoji = '🟢'; }
        else if (favProb >= 0.58) { risk = 'MODÉRÉ'; emoji = '🟡'; }
        else if (favProb >= 0.53) { risk = 'ACCEPTABLE'; emoji = '🟠'; }
        else { risk = 'DANGEREUX'; emoji = '🔴'; }
        
        let matchTime = '';
        try {
          const dt = new Date(event.date);
          matchTime = dt.toISOString().slice(11, 16) + ' UTC';
        } catch {}
        
        allMatches.push({
          match: `${awayTeam} @ ${homeTeam}`,
          time: matchTime,
          fav,
          favOdds,
          favProb: favProb * 100,
          edge,
          risk,
          emoji,
        });
      }
    } catch (err: any) {
      console.error(`❌ [MLB PALIER] Erreur fetch ${dateStr}:`, err.message);
    }
  }
  
  // Sort by safety: highest prob first, then highest edge
  allMatches.sort((a, b) => b.favProb - a.favProb || b.edge - a.edge);
  
  console.log(`📊 [MLB PALIER] Total matchs analysés: ${allMatches.length}`);
  
  if (allMatches.length < 2) {
    const msg = `⚠️ <b>MLB Palier Intelligent</b>\n\nAucun match MLB avec cotes disponibles aujourd'hui.\nLes cotes sont généralement publiées ~24h avant le match.\n\n🔄 Prochain essai demain matin.`;
    await sendTelegramPersonalMessage(msg);
    return { mlb_palier: { success: true, matches: 0 } };
  }
  
  // Build Telegram message
  let message = `🎲 <b>MLB - Analyse Palier Intelligent</b>\n`;
  message += `📅 ${today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  // Show all matches ranked
  message += `📊 <b>Matchs classés par fiabilité:</b>\n\n`;
  
  const top = allMatches.slice(0, Math.min(allMatches.length, 10));
  for (let i = 0; i < top.length; i++) {
    const m = top[i];
    message += `${i + 1}. ${m.emoji} ${m.match}\n`;
    message += `   ⏰ ${m.time}\n`;
    message += `   → <b>${m.fav}</b> (${m.favOdds})\n`;
    message += `   📈 ${m.favProb.toFixed(1)}% | Edge: ${m.edge >= 0 ? '+' : ''}${m.edge.toFixed(1)}% | ${m.risk}\n\n`;
  }
  
  // Best combo (top 2 safest)
  const pick1 = allMatches[0];
  const pick2 = allMatches[1];
  
  const comboProb = (pick1.favProb / 100) * (pick2.favProb / 100) * 100;
  const comboOdds = mlbOddsToDecimal(pick1.favOdds) * mlbOddsToDecimal(pick2.favOdds);
  const comboOddsStr = comboOdds.toFixed(2);
  
  let palierNiveau: string;
  if (comboProb >= 42) palierNiveau = '🟢 EXCELLENT pour montante';
  else if (comboProb >= 35) palierNiveau = '🟡 BON pour montante';
  else if (comboProb >= 28) palierNiveau = '🟠 ACCEPTABLE';
  else palierNiveau = '🔴 TROP RISQUÉ';
  
  message += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `🎯 <b>COMBO OPTIMAL DU JOUR</b>\n\n`;
  message += `1️⃣ ${pick1.fav} (${pick1.favOdds}) → ${pick1.favProb.toFixed(1)}%\n`;
  message += `2️⃣ ${pick2.fav} (${pick2.favOdds}) → ${pick2.favProb.toFixed(1)}%\n`;
  message += `\n╔══════════════════════════╗\n`;
  message += `║  Cote combo: x${comboOddsStr}\n`;
  message += `║  Prob: ${comboProb.toFixed(1)}%\n`;
  message += `║  Palier: ${palierNiveau}\n`;
  message += `╚══════════════════════════╝\n`;
  
  // Palier simulation
  message += `\n💰 <b>Simulation Montante</b> (mise 10,000F)\n`;
  message += `   Mise: 10,000F\n`;
  message += `   Gain potentiel: ${Math.round(10000 * comboOdds).toLocaleString('fr-FR')}F\n`;
  message += `   Retrait 40%: ${Math.round(10000 * comboOdds * 0.4).toLocaleString('fr-FR')}F ✅\n`;
  message += `   Bankroll palier suivant: ${Math.round(10000 * comboOdds * 0.6).toLocaleString('fr-FR')}F\n`;
  
  // Split if too long
  if (message.length > 4096) {
    // Send in 2 parts
    const mid = message.lastIndexOf('\n━━', Math.floor(message.length / 2));
    if (mid > 0) {
      await sendTelegramPersonalMessage(message.slice(0, mid));
      await sendTelegramPersonalMessage(message.slice(mid));
    } else {
      await sendTelegramPersonalMessage(message.slice(0, 4000));
      await sendTelegramPersonalMessage(message.slice(4000));
    }
  } else {
    await sendTelegramPersonalMessage(message);
  }
  
  console.log(`✅ [MLB PALIER] Analyse envoyée en message perso (${allMatches.length} matchs, combo: ${comboProb.toFixed(1)}%)`);
  
  return {
    mlb_palier: {
      success: true,
      matches: allMatches.length,
      combo: `${pick1.fav} + ${pick2.fav} @ ${comboProb.toFixed(1)}%`,
    }
  };
}
