/**
 * Telegram Service - Publication automatique des pronostics
 * 
 * Format des messages ergonomique et clair avec:
 * - Date et heure de la rencontre
 * - Pourcentage de réussite du pronostic
 * - Niveau de risque visuel
 * - Over/Under 2.5 buts (football, Dixon-Coles enrichi TheSportsDB)
 * - Ordre : Football en premier, puis les autres sports
 */

import { predictGoalsEnriched, type GoalsPredictionResult } from './dixonColesModel';
import { getMatchTeamStats } from './teamStatsService';
import SupabaseStore, { type DbPrediction } from './db-supabase';

// Configuration Telegram
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_PERSONAL_CHAT_ID = process.env.TELEGRAM_PERSONAL_CHAT_ID;

// Déduplication : track la dernière publication par type pour éviter les doublons
const lastPublication: Record<string, { date: string; hash: string }> = {};

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

/** Calcule un hash simple du contenu pour détecter les doublons */
function contentHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit int
  }
  return Math.abs(hash).toString(36);
}

/**
 * Vérifie si une publication est un doublon (même type, même jour, même contenu)
 * Retourne true si c'est un doublon (à ne PAS publier)
 * @param slotSuffix  Suffixe optionnel pour distinguer MATIN/SOIR
 */
export function isDuplicate(publicationType: string, messageContent: string, slotSuffix?: string): boolean {
  const today = getTodayStr();
  const hash = contentHash(messageContent);
  const key = slotSuffix ? `${publicationType}-${slotSuffix}` : publicationType;
  const last = lastPublication[key];

  if (last && last.date === today && last.hash === hash) {
    console.warn(`⚠️ Doublon Telegram détecté pour "${key}" — publication ignorée`);
    return true;
  }

  // Enregistrer cette publication
  lastPublication[key] = { date: today, hash };
  return false;
}

// Seuils de risque
const MAX_RISK_PERCENTAGE = 50; // Kamikaze: risque >= 51%
const KAMIKAZE_MIN_RISK = 51; // Kamikaze: risque >= 51%
const MAX_DAILY_PREDICTIONS = 10; // Maximum 10 pronostics par jour
const MAX_KAMIKAZE_PER_SPORT = 3; // Max 3 kamikazes par sport par jour
// 🎯 CRITÈRES ALIGNÉS SUR BACKTEST XGBoost (août 2026)
// Backtest foot: confidence ≥ 74% → 99.9% précision | ROI +34% à +43%
// → Foot: risk ≤ 25% (win prob ≥ 75%) — dans la zone prouvée du backtest
// → Basket: risk ≤ 30% (win prob ≥ 70%) — cotes courtes, besoin de plus de certitude
// → NHL/Baseball: risk ≤ 30% (win prob ≥ 70%) — instabilité plus élevée
// → Les filtres de confiance (very_high/high) dans unifiedPredictionService sont plus stricts
const TIGHT_MAX_RISK_FOOTBALL = 25; // Football: risque max 25% (backtest 74%+ → 99.9%)
const TIGHT_MAX_RISK_BASKETBALL = 30; // Basketball: risque max 30% (cotes courtes, + min 1.80)
const TIGHT_MAX_RISK_HIGH_RISK_SPORTS = 30; // NHL/baseball: risque max 30% (instabilité plus élevée)
const MIN_WIN_PROBABILITY = 70; // Aligné sur backtest: ≥74% précision, seuil pub ≥70%
// 🏆 LIMITES SPORTS NON PRIORITAIRES
// Backtest: football +32% ROI (priorité absolue)
// → Basketball limité à 3 (cotes courtes, -16% ROI à cotes < 1.80)
// → Baseball/Hockey limités à 3 (valuebets safe uniquement)
// 🎾 Tennis EXCLU des pronostics Telegram (pas de pipeline ML fiable)
const MAX_NON_PRIORITY_PER_SPORT = 3; // Max 3 rencontres par sport non prioritaire
const MAX_DISPLAY_PER_SPORT = 4; // Max 4 par sport dans l'affichage ET la sauvegarde (cohérence bilan)
const PRIORITY_SPORTS = ['football']; // Seul le football est prioritaire (backtest positif)
const NON_PRIORITY_SPORTS = ['basketball', 'baseball', 'hockey', 'other'];
const EXCLUDED_TELEGRAM_SPORTS = ['tennis']; // Sports exclus des pronostics Telegram
const BASKETBALL_MIN_ODDS = 1.80; // ROI break-even à 56% WR

/**
 * Vérifie si un pronostic est publiable (safe ou modéré)
 */
export function isSafeOrModerate(riskPercentage?: number): boolean {
  if (riskPercentage === undefined) return false;
  return riskPercentage <= MAX_RISK_PERCENTAGE;
}

/**
 * Vérifie si un pronostic est Kamikaze (haut risque)
 */
export function isKamikaze(riskPercentage?: number): boolean {
  if (riskPercentage === undefined) return false;
  return riskPercentage >= KAMIKAZE_MIN_RISK;
}

/**
 * Plafonner les kamikazes à MAX_KAMIKAZE_PER_SPORT par sport
 * Conserve l'ordre de tri (cotes décroissantes, puis sport prioritaire)
 */
function normalizeSportKey(sport: string): string {
  const s = (sport || '').toLowerCase();
  if (s.includes('foot') || s === 'soccer') return 'football';
  if (s.includes('basket') || s.includes('nba')) return 'basketball';
  if (s.includes('hockey') || s.includes('nhl')) return 'hockey';
  if (s.includes('baseball') || s.includes('mlb')) return 'baseball';
  return s;
}

// Surcharge générique: fonctionne avec TelegramMatch[] ET DbPrediction[]
export function capKamikazePerSport<T extends { sport?: string }>(picks: T[]): T[] {
  const sportCount: Record<string, number> = {};
  return picks.filter(p => {
    const key = normalizeSportKey(p.sport || '');
    sportCount[key] = (sportCount[key] || 0) + 1;
    return sportCount[key] <= MAX_KAMIKAZE_PER_SPORT;
  });
}

/**
 * Trie les kamikazes : cotes décroissantes, puis sport prioritaire (football en premier).
 * Fonction centralisée utilisée partout pour garantir la cohérence save vs publish.
 */
export function sortKamikazePicks<T extends { sport?: string; oddsHome?: number; oddsAway?: number }>(picks: T[]): T[] {
  return [...picks].sort((a, b) => {
    const oddsA = a.oddsHome && a.oddsAway ? Math.max(a.oddsHome, a.oddsAway) : 0;
    const oddsB = b.oddsHome && b.oddsAway ? Math.max(b.oddsHome, b.oddsAway) : 0;
    if (oddsB !== oddsA) return oddsB - oddsA;
    return getSportPriority(a.sport || '') - getSportPriority(b.sport || '');
  });
}

/**
 * Retourne le label du niveau de risque
 */
export function getRiskLabel(riskPercentage?: number): string {
  if (riskPercentage === undefined) return 'Non évalué';
  if (riskPercentage <= 30) return 'Safe';
  if (riskPercentage <= 50) return 'Modéré';
  return 'Kamikaze';
}

// Emojis pour les sports
const SPORT_EMOJIS: Record<string, string> = {
  // Football
  'Foot': '⚽', 'Football': '⚽', 'football': '⚽', 'Soccer': '⚽', 'soccer': '⚽',
  // Basket
  'Basket': '🏀', 'basket': '🏀', 'Basketball': '🏀', 'basketball': '🏀', 
  'NBA': '🏀', 'nba': '🏀', 'BASKET': '🏀',
  // Hockey
  'NHL': '🏒', 'Hockey': '🏒', 'hockey': '🏒',
  // Tennis — EXCLU des pronostics Telegram
  // 'Tennis': '🎾', 'tennis': '🎾',
  // Baseball
  'Baseball': '⚾', 'baseball': '⚾', 'MLB': '⚾', 'mlb': '⚾',
};

// ============================================
// ORDRE DES SPORTS (Football en premier)
// ============================================

const SPORT_PRIORITY: Record<string, number> = {
  'foot': 1, 'football': 1, 'soccer': 1,
  'basket': 2, 'basketball': 2, 'nba': 2,
  'nhl': 3, 'hockey': 3,
  // tennis: 4, — EXCLU des pronostics Telegram
  'mlb': 5, 'baseball': 5,
};

function getSportPriority(sport: string): number {
  const s = sport.toLowerCase();
  for (const [key, priority] of Object.entries(SPORT_PRIORITY)) {
    if (s.includes(key)) return priority;
  }
  return 99; // Autres sports à la fin
}

/** Trie les sports : Football → Basket → Hockey → Baseball → Autres */
function sortSportsByPriority(sports: string[]): string[] {
  return [...sports].sort((a, b) => getSportPriority(a) - getSportPriority(b));
}

/** Vérifie si c'est un match de football */
function isFootballMatch(sport?: string): boolean {
  if (!sport) return false;
  const s = sport.toLowerCase();
  return s.includes('foot') || s === 'soccer';
}

// ============================================
// PRÉDICTION DE BUTS (Football - Dixon-Coles Enrichi)
// ============================================

// Cache pour les stats d'équipe TheSportsDB
const teamStatsCache = new Map<string, { home: any; away: any; timestamp: number }>();
const TEAM_STATS_CACHE_TTL = 3600000; // 1 heure

/**
 * Calcule une prédiction de buts enrichie avec Dixon-Coles.
 * Combine: TheSportsDB (classement GF/GA/forme) + Poisson sur cotes.
 */
async function calculateGoalsPredictionEnriched(
  homeTeam: string,
  awayTeam: string,
  league: string,
  oddsHome?: number,
  oddsDraw?: number | null,
  oddsAway?: number,
  isEstimated?: boolean
): Promise<GoalsPredictionResult | null> {
  if (!oddsHome || !oddsAway || oddsHome <= 1 || oddsAway <= 1) return null;
  if (isEstimated) return null;

  let homeTableStats: import('./dixonColesModel').LeagueTableStats | null = null;
  let awayTableStats: import('./dixonColesModel').LeagueTableStats | null = null;

  try {
    const cacheKey = `${homeTeam}|${awayTeam}`;
    const cached = teamStatsCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < TEAM_STATS_CACHE_TTL) {
      homeTableStats = cached.home;
      awayTableStats = cached.away;
    } else {
      const stats = await getMatchTeamStats(homeTeam, awayTeam);
      if (stats.homeTeam) {
        homeTableStats = {
          teamName: stats.homeTeam.teamName,
          rank: stats.homeTeam.rank,
          played: stats.homeTeam.played,
          won: stats.homeTeam.won,
          drawn: stats.homeTeam.drawn,
          lost: stats.homeTeam.lost,
          goalsFor: stats.homeTeam.goalsFor,
          goalsAgainst: stats.homeTeam.goalsAgainst,
          goalDifference: stats.homeTeam.goalDifference,
          points: stats.homeTeam.points,
          form: stats.homeTeam.form,
        };
      }
      if (stats.awayTeam) {
        awayTableStats = {
          teamName: stats.awayTeam.teamName,
          rank: stats.awayTeam.rank,
          played: stats.awayTeam.played,
          won: stats.awayTeam.won,
          drawn: stats.awayTeam.drawn,
          lost: stats.awayTeam.lost,
          goalsFor: stats.awayTeam.goalsFor,
          goalsAgainst: stats.awayTeam.goalsAgainst,
          goalDifference: stats.awayTeam.goalDifference,
          points: stats.awayTeam.points,
          form: stats.awayTeam.form,
        };
      }
      teamStatsCache.set(cacheKey, { home: homeTableStats, away: awayTableStats, timestamp: Date.now() });
    }
  } catch (e) {
    // Silently fail — fallback to odds-based Poisson
  }

  return predictGoalsEnriched(
    homeTeam, awayTeam, league,
    oddsHome, oddsDraw, oddsAway,
    homeTableStats, awayTableStats,
    isEstimated
  );
}

/**
 * Formate la prédiction de buts pour Telegram (clair et lisible)
 * Utilisé en FALLBACK uniquement quand _dixonColes n'est pas disponible.
 */
function formatGoalsBlock(goals: GoalsPredictionResult): string {
  const sourceIcon = goals.source === 'dixon-coles' ? '🔬' : '📊';
  
  let block = '';
  
  // Over/Under
  if (goals.recommendation !== 'skip') {
    const recEmoji = goals.recommendation === 'over25' ? '⬆️' : '⬇️';
    const recLabel = goals.recommendation === 'over25' ? 'Over 2.5' : 'Under 2.5';
    const pct = goals.recommendation === 'over25' ? goals.over25 : goals.under25;
    block += `${sourceIcon} ${recEmoji} <b>${recLabel}</b>: <b>${pct}%</b>\n`;
  } else {
    block += `${sourceIcon} ⚖️ +2.5: ${goals.over25}%  ·  -2.5: ${goals.under25}%\n`;
  }
  
  // BTTS (Both Teams To Score) — info complémentaire utile
  if (goals.btts >= 55 || goals.btts <= 40) {
    const bttsEmoji = goals.btts >= 55 ? '✅' : '❌';
    block += `   ${bttsEmoji} BTTS: <b>${goals.btts}%</b>\n`;
  }
  
  return block;
}

/**
 * Formate les buts/BTTS directement depuis le pipeline unifié (_dixonColes).
 * Plus de recalcul — utilise les données déjà calculées par getBatchPredictions().
 * BTTS toujours affiché (pas de seuil 55/40), Over/Under avec recommandation.
 */
function formatGoalsFromUnified(dc: any): string {
  if (!dc) return '';
  
  let block = '🔬 ';
  
  // Over/Under 2.5
  const over25 = Math.round((dc.over25 || 0.5) * 100);
  const under25 = 100 - over25;
  if (over25 >= 60) {
    block += `⬆️ <b>Over 2.5</b>: <b>${over25}%</b>\n`;
  } else if (under25 >= 60) {
    block += `⬇️ <b>Under 2.5</b>: <b>${under25}%</b>\n`;
  } else {
    block += `⚖️ +2.5: ${over25}%  ·  -2.5: ${under25}%\n`;
  }
  
  // BTTS — Toujours affiché depuis le pipeline unifié (Dixon-Coles)
  const bttsPct = Math.round((dc.btts || 0.5) * 100);
  const bttsEmoji = bttsPct >= 55 ? '✅' : bttsPct <= 40 ? '❌' : '⚖️';
  block += `   ${bttsEmoji} BTTS: <b>${bttsPct}%</b>\n`;
  
  // Score exact le plus probable
  if (dc.mostLikelyScore) {
    const s = dc.mostLikelyScore;
    block += `   🎯 Score probable: <b>${s.home}-${s.away}</b> (${Math.round((s.prob || 0) * 100)}%)\n`;
  }
  
  return block;
}

/**
 * Crée une barre de progression visuelle (utilisée uniquement pour les résultats)
 */
function createProgressBar(percentage: number, length: number = 10): string {
  const filled = Math.round((percentage / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

// ============================================
// FORMATAGE DATE
// ============================================

function formatDateTime(dateStr: string, displayDate?: string): { date: string; time: string } {
  try {
    // 🎯 PRIORITÉ à dateStr (ISO) — c'est la vraie date du match
    // displayDate est juste un label ("Aujourd'hui", "Demain") souvent trompeur
    if (dateStr) {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                            'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        
        const dayName = dayNames[date.getDay()];
        const day = date.getDate();
        const month = monthNames[date.getMonth()];
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        
        return { 
          date: `${dayName} ${day} ${month}`, 
          time: `${hours}h${minutes}` 
        };
      }
    }
    
    // Fallback sur displayDate si dateStr invalide
    if (displayDate) {
      const parts = displayDate.split(',');
      if (parts.length >= 2) {
        return { date: parts[0].trim(), time: parts[1].trim() };
      }
      return { date: displayDate, time: '' };
    }
    
    return { date: 'Date inconnue', time: '' };
  } catch {
    return { date: 'Date inconnue', time: '' };
  }
}

/**
 * Calcule un tag de date dynamique ([DEMAIN], [PROCHAIN]) en comparant
 * la date du match à la date d'aujourd'hui (timezone locale).
 */
function computeDateTag(matchDateStr?: string): string {
  if (!matchDateStr) return '';
  try {
    const matchDate = new Date(matchDateStr);
    if (isNaN(matchDate.getTime())) return '';
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const matchDay = new Date(matchDate.getFullYear(), matchDate.getMonth(), matchDate.getDate());
    if (matchDay.getTime() === tomorrowStart.getTime()) {
      return ' [DEMAIN]';
    } else if (matchDay.getTime() > tomorrowStart.getTime()) {
      return ' [PROCHAIN]';
    }
  } catch {}
  return '';
}

// ============================================
// ENVOI TELEGRAM
// ============================================

export async function sendTelegramMessage(text: string, options?: {
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_notification?: boolean;
  retryCount?: number;
}): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('⚠️ Telegram non configuré');
    return false;
  }

  const maxRetries = options?.retryCount ?? 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: options?.parse_mode || 'HTML',
          disable_notification: options?.disable_notification || false,
        }),
      });

      // Rate limit (429) → retry avec backoff
      if (response.status === 429 && attempt < maxRetries) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
        console.warn(`⚠️ Telegram rate limit, retry dans ${retryAfter}s (tentative ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, Math.min(retryAfter, 30) * 1000));
        continue;
      }

      const data = await response.json();

      if (!data.ok) {
        console.error('❌ Erreur Telegram:', data.description);
        return false;
      }

      console.log('✅ Message envoyé sur Telegram');
      return true;
    } catch (error) {
      if (attempt < maxRetries) {
        console.warn(`⚠️ Erreur envoi Telegram (tentative ${attempt + 1}/${maxRetries}), retry...`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      console.error('❌ Erreur envoi Telegram (échec après ${maxRetries} tentatives):', error);
      return false;
    }
  }
  return false;
}

// Envoi en message privé (chat personnel, pas le canal)
export async function sendTelegramPersonalMessage(text: string, options?: {
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_notification?: boolean;
}): Promise<boolean> {
  const chatId = TELEGRAM_PERSONAL_CHAT_ID || TELEGRAM_CHAT_ID;
  
  if (!TELEGRAM_BOT_TOKEN || !chatId) {
    console.warn('⚠️ Telegram perso non configuré (ni TELEGRAM_PERSONAL_CHAT_ID ni TELEGRAM_CHAT_ID)');
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options?.parse_mode || 'HTML',
        disable_notification: options?.disable_notification || false,
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error('❌ Erreur Telegram perso:', data.description);
      return false;
    }

    console.log(`✅ Message perso envoyé (chat_id: ${chatId})`);
    return true;
  } catch (error) {
    console.error('❌ Erreur envoi Telegram perso:', error);
    return false;
  }
}

// Split un message Telegram si > 4096 chars
async function sendTelegramMessageLong(text: string): Promise<boolean> {
  if (text.length <= 4096) return sendTelegramMessage(text);
  
  // Split sur les séparateurs de section
  const parts: string[] = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    if (remaining.length <= 4096) {
      parts.push(remaining);
      break;
    }
    
    // Chercher un point de coupure propre
    let splitIdx = remaining.lastIndexOf('\n\n', 4090);
    if (splitIdx < 3800) splitIdx = remaining.lastIndexOf('\n', 4090);
    if (splitIdx < 3800) splitIdx = 4090;
    
    parts.push(remaining.substring(0, splitIdx));
    remaining = remaining.substring(splitIdx).trimStart();
  }
  
  for (const part of parts) {
    const ok = await sendTelegramMessage(part);
    if (!ok) return false;
  }
  return true;
}

// ============================================
// OPTIONS DE PARI
// ============================================

/**
 * Vérifie si le sport est du baseball/MLB
 */
function isBaseballMatch(sport?: string): boolean {
  if (!sport) return false;
  const s = sport.toLowerCase();
  return s.includes('base') || s.includes('mlb') || s === 'other';
}

/**
 * Calcule les probabilités implicites depuis les cotes (normalisées)
 * Pour le football, si la cote de nul est absente, on estime une cote par défaut (~3.30)
 */
function calcImpliedProbs(oddsHome: number, oddsDraw?: number | null, oddsAway?: number, sport?: string): {
  home: number; draw: number | null; away: number;
  homeOrDraw: number; awayOrDraw: number;
} {
  const rawHome = 1 / (oddsHome || 1);
  const rawAway = 1 / (oddsAway || 1);
  
  // Pour le football, estimer la cote de nul si absente
  // Cote de nul typique : entre 2.80 et 4.00, on utilise 3.30 comme défaut
  let effectiveDraw: number | null = null;
  if (oddsDraw && oddsDraw > 1) {
    effectiveDraw = oddsDraw;
  } else if (sport && (sport.toLowerCase().includes('foot') || sport.toLowerCase() === 'soccer')) {
    effectiveDraw = 3.30; // Estimation par défaut pour le football
  }
  
  const rawDraw = effectiveDraw ? 1 / effectiveDraw : null;
  
  let total = rawHome + rawAway;
  if (rawDraw) total += rawDraw;
  
  const home = Math.round((rawHome / total) * 100);
  const away = Math.round((rawAway / total) * 100);
  const draw = rawDraw ? Math.round((rawDraw / total) * 100) : null;
  
  return {
    home,
    draw,
    away,
    homeOrDraw: draw !== null ? home + draw : home,
    awayOrDraw: draw !== null ? away + draw : away,
  };
}

/**
 * Estime les runs moyens pour un match MLB à partir des cotes.
 * Utilise un modèle basé sur les probabilités implicites et la moyenne historique MLB (~8.5 runs/match).
 * Retourne null si les cotes sont trop serrées (incertain).
 */
function estimateMLBRuns(oddsHome: number, oddsAway: number): { totalRuns: number; homeRuns: number; awayRuns: number } | null {
  try {
    const rawHome = 1 / (oddsHome || 1);
    const rawAway = 1 / (oddsAway || 1);
    const total = rawHome + rawAway;
    const probHome = rawHome / total; // probabilité normalisée home
    const probAway = rawAway / total; // probabilité normalisée away

    // La moyenne historique MLB est ~8.5 runs par match (total des 2 équipes)
    // Plus un favori est fort (probabilité élevée), plus le score attendu est déséquilibré
    const baseTotalRuns = 8.5;

    // Ajustement du total: si les cotes sont très serrées (match incertain),
    // les runs tendent à être plus élevés (plus de tension = plus de scored runs)
    // Si un favori très fort, le total peut être un peu plus bas (dominance pitching)
    const dominance = Math.abs(probHome - 0.5); // 0 = match serré, 0.5 = domination
    const totalRuns = Math.round(baseTotalRuns - (dominance * 2));

    // Répartition: le favori marque plus de runs
    // Si probHome > probAway, home est favori et marque plus
    const homeShare = probHome + (dominance * 0.15); // bonus favori
    const awayShare = probAway - (dominance * 0.15);
    const homeRuns = Math.max(1, Math.round(totalRuns * homeShare));
    const awayRuns = Math.max(1, totalRuns - homeRuns);

    // Vérifier si les cotes sont trop serrées (< 1.40 vs > 2.50)
    // pour considérer la prédiction comme "incertaine"
    const minOdds = Math.min(oddsHome, oddsAway);
    const maxOdds = Math.max(oddsHome, oddsAway);
    if (minOdds > 1.40 && maxOdds < 2.50) {
      // Cotes très serrées — match incertain, on retourne null
      return null;
    }

    return { totalRuns: homeRuns + awayRuns, homeRuns, awayRuns };
  } catch {
    return null;
  }
}

function getBetOption(predictedResult?: 'home' | 'away' | 'draw', sport?: string, oddsHome?: number, oddsDraw?: number | null, oddsAway?: number, homeTeam?: string, awayTeam?: string): string {
  if (!predictedResult) return '';
  
  // Pour le football : afficher TOUJOURS les 2 pourcentages (Victoire pure + V/N)
  // Format : "Victoire Équipe (72%) · V/N: 78%" — le parieur voit les 2 options + le nom de l'équipe
  // Le football a TOUJOURS un nul possible, même si ESPN ne fournit pas la cote de nul
  if (isFootballMatch(sport) && oddsHome && oddsAway) {
    const probs = calcImpliedProbs(oddsHome, oddsDraw, oddsAway, sport);
    if (predictedResult === 'home' || predictedResult === 'away') {
      const isHome = predictedResult === 'home';
      const teamName = isHome ? (homeTeam || 'Domicile') : (awayTeam || 'Extérieur');
      const purePct = isHome ? probs.home : probs.away;
      const vnPct = isHome ? probs.homeOrDraw : probs.awayOrDraw;
      return `Victoire <b>${teamName}</b> (${purePct}%) · V/N: ${vnPct}%`;
    } else if (predictedResult === 'draw') {
      return `Match Nul (${probs.draw || 0}%)`;
    }
  }
  
  // 🎯 Sports non-football : afficher le nom de l'équipe aussi (pas juste l'emoji)
  if (predictedResult === 'home') {
    const teamName = homeTeam || 'Domicile';
    return `1️⃣ <b>${teamName}</b>`;
  }
  if (predictedResult === 'away') {
    const teamName = awayTeam || 'Extérieur';
    return `2️⃣ <b>${teamName}</b>`;
  }
  
  return '';
}

// ============================================
// FORMATAGE PRONOSTIC INDIVIDUEL
// ============================================

function formatPrediction(prediction: {
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league?: string;
  date: string;
  oddsHome?: number;
  oddsDraw?: number | null;
  oddsAway?: number;
  recommendation?: string;
  predictedResult?: 'home' | 'away' | 'draw';
  confidence?: string;
  riskPercentage?: number;
  winProbability?: number;
  valueBetDetected?: boolean;
  valueBetType?: string | null;
  isLive?: boolean;
  isEstimated?: boolean;
  dateTag?: string;
  displayDate?: string;
}): string {
  const sportEmoji = SPORT_EMOJIS[prediction.sport] || '🏟️';
  const { date, time } = formatDateTime(prediction.date, prediction.displayDate);
  
  let message = '━━━━━━━━━━━━━━━━━━━━━\n';
  
  if (prediction.valueBetDetected) {
    message += `🔔 <b>VALUE BET</b> ${sportEmoji}\n`;
  } else {
    message += `${sportEmoji} <b>${prediction.sport.toUpperCase()}</b>\n`;
  }
  
  message += '━━━━━━━━━━━━━━━━━━━━━\n\n';
  
  message += `🏟️ <b>${prediction.homeTeam}</b>\n`;
  message += `    <b>VS</b>\n`;
  message += `🏟️ <b>${prediction.awayTeam}</b>\n\n`;
  
  message += `📅 <b>${date}</b>\n`;
  if (time) message += `⏰ <b>${time}</b>\n`;
  if (prediction.league) message += `🏆 ${prediction.league}\n`;
  message += '\n';
  
  if (prediction.oddsHome && prediction.oddsAway) {
    message += `📊 <b>COTES</b>\n`;
    if (prediction.oddsDraw) {
      message += `    1️⃣ ${prediction.oddsHome.toFixed(2)}  |  ❌ ${prediction.oddsDraw.toFixed(2)}  |  2️⃣ ${prediction.oddsAway.toFixed(2)}\n`;
    } else {
      message += `    1️⃣ ${prediction.oddsHome.toFixed(2)}  |  2️⃣ ${prediction.oddsAway.toFixed(2)}\n`;
    }
    message += '\n';
  }
  
  if (prediction.recommendation || prediction.predictedResult) {
    message += `🎯 <b>PRONOSTIC</b>\n`;
    const betOption = getBetOption(prediction.predictedResult, prediction.sport, prediction.oddsHome, prediction.oddsDraw, prediction.oddsAway, prediction.homeTeam, prediction.awayTeam);
    if (betOption && prediction.recommendation) {
      message += `    ${betOption} <b>${prediction.recommendation}</b>\n`;
    } else if (betOption) {
      const teamName = prediction.predictedResult === 'home' ? prediction.homeTeam :
                       prediction.predictedResult === 'away' ? prediction.awayTeam : 'Match Nul';
      message += `    ${betOption} <b>${teamName}</b>\n`;
    } else if (prediction.recommendation) {
      message += `    ▶️ <b>${prediction.recommendation}</b>\n`;
    }
    message += '\n';
  }
  
  if (prediction.riskPercentage !== undefined) {
    const winProb = prediction.winProbability || (100 - prediction.riskPercentage);
    const risk = prediction.riskPercentage;
    const riskEmoji = (risk || 100) <= 30 ? '🟢' : (risk || 100) <= 50 ? '🟡' : '🔴';
    const riskLabel = (risk || 100) <= 30 ? 'SAFE' : (risk || 100) <= 50 ? 'MODÉRÉ' : 'KAMIKAZE';
    const probEmoji = winProb >= 70 ? '🔥' : winProb >= 50 ? '✅' : '⚡';
    message += `${probEmoji} <b>CHANCE: ${winProb}%</b>  ·  ${riskEmoji} <b>${riskLabel}</b>\n`;
  }
  
  // ⚠️ RISQUE ÉLEVÉ pour NHL/baseball
  const predSport = (prediction.sport || '').toLowerCase();
  if (predSport.includes('base') || predSport.includes('mlb') || predSport.includes('hockey') || predSport.includes('nhl')) {
    message += `⚠️ <i>Sport à risque élevé</i>\n`;
  }
  
  if (prediction.valueBetDetected && prediction.valueBetType) {
    message += `💎 <b>Value: ${prediction.valueBetType}</b>\n`;
  }
  
  if (prediction.isEstimated) {
    message += `\n⚠️ <i>Cotes estimées</i>\n`;
  }
  
  return message;
}

export async function publishPredictionToTelegram(prediction: Parameters<typeof formatPrediction>[0]): Promise<boolean> {
  const message = formatPrediction(prediction);
  return sendTelegramMessage(message);
}

// ============================================
// TYPES COMMUNS POUR LES PUBLICATIONS
// ============================================

interface TelegramMatch {
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league?: string;
  date: string;
  displayDate?: string;
  dateTag?: string;
  recommendation?: string;
  predictedResult?: 'home' | 'away' | 'draw';
  confidence?: string;
  riskPercentage?: number;
  winProbability?: number;
  valueBetDetected?: boolean;
  valueBetType?: string | null;
  oddsHome?: number;
  oddsAway?: number;
  oddsDraw?: number | null;
  isEstimated?: boolean;
  // Métadonnées ML enrichies (ajoutées par le pipeline unifié)
  _mlEdge?: number;
  _mlReasoning?: string[];
  _dataQuality?: number;
  _kellyStake?: number;
  _dixonColes?: any;
  _sources?: string[];
  // Enjeu du match
  _matchImportance?: {
    stakeLevel: string;
    stakeScore: number;
    stakeLabel: string;
    seasonPhase: string;
    seasonPhaseLabel: string;
    competitionTypeLabel: string;
    formReliable: boolean;
    formReliability: string;
    formReliabilityReason: string;
    warnings: string[];
    insights: string[];
    contextSummary?: string;
  };
  // Contexte enrichi — blessures détaillées
  _injuries?: {
    home: number;
    away: number;
    homeImpact: number;
    awayImpact: number;
  };
  // Météo
  _weather?: {
    condition: string;
    temperature: number;
    impact: string;
  };
  // xG différentiel (football)
  _xg?: {
    home: number | null;
    away: number | null;
  };
  // Face-à-face historique
  _h2h?: {
    homeWins: number;
    draws: number;
    awayWins: number;
  };
  // Forme des équipes
  _form?: {
    home: number;
    away: number;
  };
  // Contexte enrichi (ancien — teamNews, etc.)
  _enrichedContext?: {
    injuries?: { home: any[]; away: any[]; homeImpact: number; awayImpact: number; summary: string; keyAbsentees?: { home: string[]; away: string[] } };
    form?: string;
    newsAlerts?: string[];
  };
}

// ============================================
// FORMAT MATCH BLOCK (réutilisable partout)
// ============================================

/**
 * Formate un block de match pour le résumé.
 * Football a un affichage enrichi (buts, over/under).
 * Autres sports : affichage standard.
 */
async function formatMatchBlock(
  m: TelegramMatch,
  index: number,
  includeGoals: boolean = true
): Promise<string> {
  const emoji = SPORT_EMOJIS[m.sport] || '🏟️';
  const { date, time } = formatDateTime(m.date, m.displayDate);
  const isFootball = isFootballMatch(m.sport);
  const winProb = m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : 50);
  const risk = m.riskPercentage || 100;
  const riskEmoji = risk <= 30 ? '🟢' : risk <= 50 ? '🟡' : '🔴';
  const riskLabel = risk <= 30 ? 'Safe' : risk <= 50 ? 'Modéré' : 'Kamikaze';
  const betLabel = getBetOption(m.predictedResult, m.sport, m.oddsHome, m.oddsDraw, m.oddsAway, m.homeTeam, m.awayTeam);
  
  // 📅 Date display: always show the date, with tag if different from today
  const dateTag = computeDateTag(m.date);
  const dateLine = `📅 <b>${date}</b>${dateTag}`;

  let block = '';

  // Séparateur + titre
  block += '───────────────────────────\n';
  // 💎 Marqueur "VALUE BET" si le match a un value bet détecté
  const valueBetBadge = m.valueBetDetected ? ' 💎 <b>VALUE BET</b>' : '';
  block += `<b>${index}.</b> ${m.homeTeam} vs ${m.awayTeam}${valueBetBadge}\n`;

  // 📅 Date de la rencontre (toujours affichée pour éviter confusion lendemain)
  block += `${dateLine}\n`;

  // Ligue
  if (m.league) block += `${emoji} ${m.league}\n`;

  // Cotes
  if (m.oddsHome && m.oddsAway) {
    let oddsLine = '📊 ';
    oddsLine += `1: <b>${m.oddsHome.toFixed(2)}</b>`;
    if (isFootball && m.oddsDraw) oddsLine += `  ·  X: <b>${m.oddsDraw.toFixed(2)}</b>`;
    oddsLine += `  ·  2: <b>${m.oddsAway.toFixed(2)}</b>`;
    block += `${oddsLine}\n`;
  }

  // Pronostic + heure
  let pronoLine = '';
  if (time) pronoLine += `⏰ ${time}  ·  `;
  if (betLabel && m.recommendation) pronoLine += `🎯 ${betLabel} <b>${m.recommendation}</b>`;
  if (pronoLine) block += `${pronoLine}\n`;

  // Confiance claire : niveau de risque + chance de réussite
  const riskLevel = (m.riskPercentage || 100) <= 30 ? 'Safe' : (m.riskPercentage || 100) <= 50 ? 'Modéré' : 'Kamikaze';
  block += `${riskEmoji} <b>${riskLevel}</b> — Chance: <b>${winProb}%</b>\n`;
  
  // ⚠️ RISQUE ÉLEVÉ pour NHL/baseball — toujours affiché pour informer l'utilisateur
  const sportLower = (m.sport || '').toLowerCase();
  const isHighRiskSport = sportLower.includes('base') || sportLower.includes('mlb') || sportLower.includes('hockey') || sportLower.includes('nhl');
  if (isHighRiskSport) {
    block += `⚠️ <i>Sport à risque élevé — Sélection stricte (risk ≤ 30%)</i>\n`;
  }

  // Prédiction de buts (football uniquement)
  // PRIORITÉ: données du pipeline unifié (_dixonColes) → fallback recalcul
  if (isFootball && includeGoals && m.oddsHome && m.oddsAway && !m.isEstimated && m.league) {
    if (m._dixonColes) {
      // ✅ Pipeline unifié — données déjà calculées (BTTS + Over/Under + Score)
      block += formatGoalsFromUnified(m._dixonColes);
    } else {
      // Fallback: recalcul Dixon-Coles (ancienne méthode)
      try {
        const goals = await calculateGoalsPredictionEnriched(
          m.homeTeam, m.awayTeam, m.league,
          m.oddsHome, m.oddsDraw, m.oddsAway, m.isEstimated
        );
        if (goals && goals.confidence !== 'low') {
          block += formatGoalsBlock(goals);
        }
      } catch (e) {
        // Silently skip goals prediction on error
      }
    }
  }

  // Prédiction runs moyens pour Baseball/MLB (à fort taux de buts)
  if (isBaseballMatch(m.sport) && m.oddsHome && m.oddsAway) {
    try {
      const runsPrediction = estimateMLBRuns(m.oddsHome, m.oddsAway);
      if (runsPrediction) {
        block += `    🔢 Runs estimés: ~${runsPrediction.totalRuns} (${runsPrediction.homeRuns}-${runsPrediction.awayRuns})\n`;
      } else {
        block += `    🔢 Runs: incertains (cotes trop serrées ou données insuffisantes)\n`;
      }
    } catch (e) {
      block += `    🔢 Runs: incalculables\n`;
    }
  }

  // ══════════════════════════════════════════
  // SECTION CONTEXTE ENRICHI (enjeu, blessures, météo, xG, H2H, forme)
  // ══════════════════════════════════════════
  const contextLines: string[] = [];
  // Track what's already in contextSummary to avoid duplicates
  const summaryLower = (m._matchImportance?.contextSummary || '').toLowerCase();

  // ── Enjeu du match — TOUJOURS affiché ──
  {
    const imp = m._matchImportance;
    const stakeEmoji: Record<string, string> = {
      'none': '⚪', 'very_low': '🟤', 'low': '🟡', 'medium': '🔵', 'high': '🟠', 'critical': '🔴',
    };
    const stakeLevel = imp?.stakeLevel || 'medium';
    const stakeLabel = imp?.stakeLabel || 'RAS';
    const phaseLabel = imp?.seasonPhaseLabel || 'Saison régulière';
    const compLabel = imp?.competitionTypeLabel || 'Championnat';

    contextLines.push(`${stakeEmoji[stakeLevel] || '🔵'} ENJEU: ${stakeLabel}`);
    contextLines.push(`📋 ${phaseLabel} · ${compLabel}`);

    if (imp && !imp.formReliable) {
      contextLines.push(`⚠️ ${imp.formReliabilityReason}`);
    }

    if (imp?.insights) {
      for (const insight of imp.insights.slice(0, 2)) {
        contextLines.push(insight);
      }
    }
  }

  // ── Blessures détaillées (depuis le pipeline unifié) ──
  // Affiche les impacts si significatifs, sauf si déjà dans contextSummary
  if (m._injuries) {
    const inj = m._injuries;
    const hasSignificantImpact =
      (inj.homeImpact <= -3) || (inj.awayImpact <= -3) ||
      (inj.home > 0) || (inj.away > 0);
    if (hasSignificantImpact && !summaryLower.includes('absent') && !summaryLower.includes('bless')) {
      const parts: string[] = [];
      if (inj.home > 0 && inj.homeImpact <= -3) {
        parts.push(`🏥 Dom: ${inj.home} blessé${inj.home > 1 ? 's' : ''} (impact ${inj.homeImpact >= 0 ? '+' : ''}${inj.homeImpact})`);
      }
      if (inj.away > 0 && inj.awayImpact <= -3) {
        parts.push(`🏥 Ext: ${inj.away} blessé${inj.away > 1 ? 's' : ''} (impact ${inj.awayImpact >= 0 ? '+' : ''}${inj.awayImpact})`);
      }
      // Si un seul côté significatif, l'afficher même sans count
      if (parts.length === 0) {
        if (inj.homeImpact <= -3) parts.push(`🏥 Impact blessures dom: ${inj.homeImpact >= 0 ? '+' : ''}${inj.homeImpact}`);
        if (inj.awayImpact <= -3) parts.push(`🏥 Impact blessures ext: ${inj.awayImpact >= 0 ? '+' : ''}${inj.awayImpact}`);
      }
      for (const p of parts.slice(0, 2)) {
        contextLines.push(p);
      }
    }
  }

  // ── Météo (depuis le pipeline unifié) ──
  if (m._weather && !summaryLower.includes(m._weather.condition.toLowerCase())) {
    const w = m._weather;
    const weatherEmoji = w.impact === 'extreme' || w.impact === 'significant' ? '🌧️' :
                        w.impact === 'moderate' ? '⛅' : '☀️';
    contextLines.push(`${weatherEmoji} ${w.condition} (${Math.round(w.temperature)}°C)`);
  }

  // ── xG différentiel (football) ──
  if (isFootball && m._xg && (m._xg.home !== null || m._xg.away !== null)) {
    const xgHome = m._xg.home;
    const xgAway = m._xg.away;
    if (xgHome !== null && xgAway !== null) {
      const diff = xgHome - xgAway;
      contextLines.push(`📊 xG: ${m.homeTeam} ${xgHome.toFixed(1)} vs ${m.awayTeam} ${xgAway.toFixed(1)} (${diff > 0 ? '+' : ''}${diff.toFixed(1)})`);
    } else if (xgHome !== null) {
      contextLines.push(`📊 xG ${m.homeTeam}: ${xgHome.toFixed(1)}`);
    } else if (xgAway !== null) {
      contextLines.push(`📊 xG ${m.awayTeam}: ${xgAway.toFixed(1)}`);
    }
  }

  // ── Face-à-face historique ──
  if (m._h2h) {
    const h2h = m._h2h;
    const total = h2h.homeWins + h2h.draws + h2h.awayWins;
    if (total > 0) {
      contextLines.push(`⚔️ H2H: ${h2h.homeWins}V-${h2h.draws}N-${h2h.awayWins}V (${total} matchs)`);
    }
  }

  // ── Forme des équipes (points ML) ──
  if (m._form && !summaryLower.includes('forme')) {
    const f = m._form;
    const formLabel = (pts: number) => pts >= 65 ? '🔥 Fort' : pts >= 50 ? '⚖️ Moyen' : '❄️ Faible';
    contextLines.push(`📈 Forme: ${formLabel(f.home)} vs ${formLabel(f.away)}`);
  }

  // ── contextSummary — résumé dynamique (dernier, une seule ligne) ──
  if (m._matchImportance?.contextSummary && m._matchImportance.contextSummary !== 'RAS') {
    contextLines.push(`📝 ${m._matchImportance.contextSummary}`);
  }
  
  // ── Reasoning ML — infos clés ──
  if (m._mlReasoning && m._mlReasoning.length > 0) {
    for (const r of m._mlReasoning) {
      if (r.includes('📊 VALUE BET')) contextLines.push(r);
      if (r.includes('⚽ Buts attendus')) contextLines.push(r);
      if (r.includes('⚖️ Avantage contextuel')) contextLines.push(r);
      if (r.includes('🧠 XGBoost')) contextLines.push(r);
    }
  }
  
  // ── News alertes (contexte enrichi ancien) ──
  if (m._enrichedContext?.newsAlerts && m._enrichedContext.newsAlerts.length > 0) {
    for (const alert of m._enrichedContext.newsAlerts.slice(0, 1)) {
      contextLines.push(`📰 ${alert}`);
    }
  }
  
  // Kelly stake
  if (m._kellyStake && m._kellyStake > 0) {
    const kellyEmoji = m._kellyStake >= 3 ? '💎' : m._kellyStake >= 2 ? '✨' : '📊';
    contextLines.push(`${kellyEmoji} Kelly: ${m._kellyStake.toFixed(1)}%`);
  }
  
  // Sources ML
  if (m._sources && m._sources.length > 2) {
    contextLines.push(`🔬 ${m._sources.length} sources (ML unifié)`);
  }
  
  // Ajouter la section contexte
  if (contextLines.length > 0) {
    block += `    ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n`;
    for (const line of contextLines.slice(0, 12)) { // Max 12 lignes (plus de place maintenant)
      block += `    ${line}\n`;
    }
  }

  block += '\n';
  return block;
}

// ============================================
// PUBLICATION RÉSUMÉ QUOTIDIEN
// ============================================

/**
 * Sélectionne les meilleurs pronostics pour la publication quotidienne.
 * Critères stricts pour maintenir un ratio élevé:
 * 1. Safe ou modéré uniquement (risk ≤ 50%)
 * 2. Cotes réelles uniquement (pas d'estimations ⚠️)
 * 3. Tri par fiabilité (risque croissant = plus fiable en premier)
 * 4. Maximum 10 pronostics par jour
 */
export function selectTopDailyPredictions(predictions: TelegramMatch[]): {
  selected: TelegramMatch[];
 totalEligible: number;
 excludedEstimated: number;
 excludedRisk: number;
 excludedByLimit: number;
} {
  // 0) 🎾 EXCLURE le tennis des pronostics Telegram (pas de pipeline ML fiable)
  const nonTennis = predictions.filter(p => {
    const sport = (p.sport || '').toLowerCase();
    return !EXCLUDED_TELEGRAM_SPORTS.includes(sport) && !sport.includes('tennis');
  });
  const excludedTennis = predictions.length - nonTennis.length;
  if (excludedTennis > 0) console.log(`🎾 ${excludedTennis} pronostics tennis exclus des prédictions Telegram`);

  // 1) Filtrer: cotes réelles uniquement
  const withRealOdds = nonTennis.filter(p => !p.isEstimated);
  const excludedEstimated = predictions.length - withRealOdds.length;
  
  // 2) CRITÈRES ALIGNÉS SUR BACKTEST: football ≤ 25%, basket ≤ 30%, NHL/baseball ≤ 30%
  // Plus on s'éloigne de 74% win prob, plus le ratio win/loss se dégrade
  const underRisk = withRealOdds.filter(p => {
    const sport = (p.sport || '').toLowerCase();
    let maxRisk: number;
    if (sport === 'baseball' || sport === 'hockey' || sport === 'nhl' || sport === 'mlb') {
      maxRisk = TIGHT_MAX_RISK_HIGH_RISK_SPORTS;
    } else if (sport === 'basketball' || sport === 'basket' || sport === 'nba') {
      maxRisk = TIGHT_MAX_RISK_BASKETBALL;
    } else {
      maxRisk = TIGHT_MAX_RISK_FOOTBALL;
    }
    return (p.riskPercentage ?? 100) <= maxRisk;
  });
  const excludedRisk = withRealOdds.length - underRisk.length;
  
  // 3) Confiance minimum: proba ≥ 70% (aligné sur backtest)
  const withConfidence = underRisk.filter(p => {
    const wp = p.winProbability ?? (100 - (p.riskPercentage ?? 50));
    return wp >= MIN_WIN_PROBABILITY;
  });
  
  // 4) Exclure les matchs internationaux (fiabilité réduite)
  const domesticOnly = withConfidence.filter(p => !(p as any).isInternational);

  // 4b) 🏀 BASKETBALL: cote minimum 1.80 (backtest -16% ROI à cotes courtes)
  // Les favoris NBA à 1.30-1.55 ne sont pas rentables même à 56% WR
  // 4c) 🎾 TENNIS: déjà exclu à l'étape 0
  const withMinOdds = domesticOnly.filter(p => {
    const sport = (p.sport || '').toLowerCase();
    if (sport === 'basketball' || sport === 'basket' || sport === 'nba') {
      const betOdds = p.predictedResult === 'home' ? p.oddsHome : p.oddsAway;
      return (betOdds || 0) >= BASKETBALL_MIN_ODDS;
    }
    return true;
  });
  
  // 5) Trier par fiabilité: risque croissant (plus fiable en premier)
  // En cas d'égalité: probabilité de réussite décroissante
  const sorted = [...withMinOdds].sort((a, b) => {
    const riskA = a.riskPercentage ?? 100;
    const riskB = b.riskPercentage ?? 100;
    if (riskA !== riskB) return riskA - riskB;
    
    const probA = a.winProbability ?? (100 - riskA);
    const probB = b.winProbability ?? (100 - riskB);
    return probB - probA;
  });
  
  // 6) Limiter à MAX_DAILY_PREDICTIONS
  const selected = sorted.slice(0, MAX_DAILY_PREDICTIONS);
  const excludedByLimit = sorted.length - selected.length;

  // 7) 🏆 PLAFONNER les sports non prioritaires à 3 max
  // Seul le football est prioritaire (meilleur rendement backtest +32% ROI)
  // 7b) 📱 PLAFONNER TOUS les sports à MAX_DISPLAY_PER_SPORT (4)
  // → Cohérence : ce qui est sauvegardé = ce qui est affiché sur Telegram
  const sportCount: Record<string, number> = {};
  const capped = selected.filter(p => {
    const sport = (p.sport || 'other').toLowerCase();
    const normalized = sport === 'foot' || sport === 'soccer' ? 'football'
      : sport === 'basket' || sport === 'nba' ? 'basketball'
      : sport === 'nhl' ? 'hockey'
      : sport === 'mlb' ? 'baseball'
      : sport;
    sportCount[normalized] = (sportCount[normalized] || 0) + 1;
    // Non-priority: max 3 | Priority (football): max 4 | All: max 4
    if (NON_PRIORITY_SPORTS.includes(normalized)) {
      return sportCount[normalized] <= MAX_NON_PRIORITY_PER_SPORT;
    }
    return sportCount[normalized] <= MAX_DISPLAY_PER_SPORT;
  });
  
  return { selected: capped, totalEligible: sorted.length, excludedEstimated, excludedRisk, excludedByLimit };
}

export async function publishDailySummaryToTelegram(predictions: TelegramMatch[]): Promise<boolean> {
  // Sélectionner les meilleurs pronostics (max 10, cotes réelles, par fiabilité)
  const { selected: filtered, totalEligible, excludedEstimated, excludedRisk, excludedByLimit } = selectTopDailyPredictions(predictions);
  
  // CAS: Des matchs existent mais aucun safe/modéré → Afficher Kamikaze direct
  if (filtered.length === 0 && predictions.length > 0) {
    console.log('⚠️ Aucun pronostic safe/modéré - affichage Kamikaze direct');
    return publishKamikazeOnlyMessage(predictions);
  }
  
  if (filtered.length === 0) {
    console.log('⚠️ Aucun pronostic à publier');
    return false;
  }

  console.log(`📊 Sélection: ${filtered.length}/${totalEligible} éligibles (max ${MAX_DAILY_PREDICTIONS}) — ${excludedEstimated} estimés exclus, ${excludedRisk} trop risqués, ${excludedByLimit} écartés par limite`);

  const today = new Date().toLocaleDateString('fr-FR', { 
    weekday: 'long', day: 'numeric', month: 'long' 
  });

  // 📅 Déterminer le slot horaire (MATIN / SOIR) en fonction de l'heure UTC
  // 07:00 UTC = matin (avant matchs EU) ; 18:00 UTC = soir (avant matchs US)
  const hourUTC = new Date().getUTCHours();
  const slotLabel = hourUTC < 14 ? 'MATIN' : 'SOIR';

  // Stats
  const safeCount = filtered.filter(p => (p.riskPercentage || 100) <= 30).length;
  const moderateCount = filtered.length - safeCount;
  const valueBetsCount = filtered.filter(p => p.valueBetDetected).length;

  // Grouper par sport avec FOOTBALL EN PREMIER
  const bySport: Record<string, TelegramMatch[]> = {};
  filtered.forEach(p => {
    const sport = p.sport || 'Autre';
    if (!bySport[sport]) bySport[sport] = [];
    bySport[sport].push(p);
  });

  // Trier : Football en premier
  const sortedSports = sortSportsByPriority(Object.keys(bySport));

  // Construire le message
  let message = '';
  
  // En-tête — titre unique selon le slot horaire
  message += '╔═════════════════════════════╗\n';
  message += '║\n';
  message += `║   📅 <b>PRONOS DU JOUR — ${slotLabel}</b>\n`;
  message += '║\n';
  message += '╚═════════════════════════════╝\n\n';
  
  message += `${today.charAt(0).toUpperCase() + today.slice(1)}\n\n`;
  
  let statsLine = `📊 <b>${filtered.length}</b> pronostic${filtered.length > 1 ? 's' : ''} (top ${totalEligible})`;
  statsLine += `  ·  🟢 ${safeCount}  ·  🟡 ${moderateCount}`;
  if (valueBetsCount > 0) statsLine += `  ·  💎 ${valueBetsCount} value bet${valueBetsCount > 1 ? 's' : ''}`;
  message += `${statsLine}\n\n`;
  
  // Détail par sport (ordonné : Foot en premier)
  for (let si = 0; si < sortedSports.length; si++) {
    const sport = sortedSports[si];
    const matches = bySport[sport];
    const emoji = SPORT_EMOJIS[sport] || '🏟️';

    // Séparateur visuel entre les sections de sports
    if (si > 0) {
      message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    }
    message += `───────────────────────────\n`;
    message += `${emoji} <b>${sport.toUpperCase()}</b> — ${matches.length} match${matches.length > 1 ? 's' : ''}\n`;
    message += `───────────────────────────\n\n`;
    
    // Trier : safe en premier, puis modéré (pour ne jamais tronquer les safe)
    const sorted = [...matches].sort((a, b) => (a.riskPercentage || 100) - (b.riskPercentage || 100));
    
    // 🎯 Limiter par sport aussi (max 4 par sport pour équilibrer)
    const sportMax = Math.min(sorted.length, 4);
    for (let i = 0; i < sportMax; i++) {
      const block = await formatMatchBlock(sorted[i], i + 1, true);
      message += block;
    }
    if (sorted.length > sportMax) {
      message += `    <i>... et ${sorted.length - sportMax} autre${sorted.length - sportMax > 1 ? 's' : ''}</i>\n\n`;
    }
  }
  
  // Pied de message
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  message += '🟢 Safe (faible risque)  ·  🟡 Modéré (risque moyen)\n';
  message += 'Chance = probabilité de réussite du pronostic\n';
  message += '🔬 = Dixon-Coles (stats classement)  ·  📊 = Poisson (cotes)\n';
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━';

  // Dedup: eviter d'envoyer le meme resume 2 fois
  if (isDuplicate('summary', message, slotLabel)) {
    console.log('Resume ' + slotLabel + ' deja publie - skip');
    return false;
  }

  return sendTelegramMessageLong(message);
}

/**
 * Message spécial quand aucun safe/modéré : affiche les Kamikaze disponibles
 */
async function publishKamikazeOnlyMessage(predictions: TelegramMatch[]): Promise<boolean> {
  // 🎾 EXCLURE le tennis des pronostics Telegram
  const nonTennis = predictions.filter(p => {
    const sport = (p.sport || '').toLowerCase();
    return !EXCLUDED_TELEGRAM_SPORTS.includes(sport) && !sport.includes('tennis');
  });
  const kamikazePicks = nonTennis.filter(p => isKamikaze(p.riskPercentage));

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  let message = '';
  message += '╔═════════════════════════════╗\n';
  message += '║\n';
  message += '║   💣 <b>PRONOS DU JOUR — KAMIKAZE</b>\n';
  message += '║\n';
  message += '╚═════════════════════════════╝\n\n';

  message += `📅 ${today.charAt(0).toUpperCase() + today.slice(1)}\n\n`;

  message += `⚠️ <b>AUCUN PRONOSTIC SAFE/MODÉRÉ</b>\n\n`;
  message += `📊 <b>${predictions.length} match${predictions.length > 1 ? 's' : ''} analysé${predictions.length > 1 ? 's' : ''}</b>\n`;
  message += `    mais aucun ne répond aux critères:\n`;
  message += `    🟢 Safe (risque ≤ 30%)\n`;
  message += `    🟡 Modéré (risque 31-50%)\n\n`;

  if (kamikazePicks.length > 0) {
    // Trie centralisé : cotes décroissantes, puis football en premier
    const kamikazeSorted = sortKamikazePicks(kamikazePicks);

    // 🔒 PLAFONNER à 3 kamikazes max par sport
    const kamikazeCapped = capKamikazePerSport(kamikazeSorted);

    message += '───────────────────────────\n';
    message += `💣 <b>SÉLECTION KAMIKAZE</b> — ${kamikazeCapped.length} opportunité${kamikazeCapped.length > 1 ? 's' : ''}\n`;
    message += '───────────────────────────\n\n';
    message += `⚠️ <b>HAUT RISQUE - HAUTE RÉCOMPENSE</b>\n\n`;

    for (let i = 0; i < kamikazeCapped.length; i++) {
      message += await formatMatchBlock(kamikazeCapped[i], i + 1, true);
    }

    if (kamikazePicks.length > kamikazeCapped.length) {
      message += `<i>... et ${kamikazePicks.length - kamikazeCapped.length} autres (plafond 3/sport)</i>\n\n`;
    }

    message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    message += `⚠️ <b>ATTENTION</b> — Ces pronostics sont très risqués.\n`;
    message += `Ne pariez que ce que vous pouvez perdre.\n`;
  } else {
    message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    message += `ℹ️ <b>AUCUN MATCH DISPONIBLE</b>\n`;
    message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    message += `Aucun pronostic à publier aujourd'hui.\n`;
    message += `Revenez demain pour les prochains matchs!\n`;
  }

  // Dedup: eviter d'envoyer le meme kamikaze-only 2 fois
  if (isDuplicate('kamikaze-only', message)) {
    console.log('Kamikaze-only deja publie - skip');
    return false;
  }

  return sendTelegramMessageLong(message);
}

// ============================================
// PUBLICATION VALUE BETS
// ============================================

export async function publishValueBetsToTelegram(predictions: TelegramMatch[]): Promise<boolean> {
  // 🎾 EXCLURE le tennis des pronostics Telegram
  const nonTennis = predictions.filter(p => {
    const sport = (p.sport || '').toLowerCase();
    return !EXCLUDED_TELEGRAM_SPORTS.includes(sport) && !sport.includes('tennis');
  });
  const valueBets = nonTennis.filter(p => 
    p.valueBetDetected && 
    p.confidence !== 'low' && 
    isSafeOrModerate(p.riskPercentage)
  );

  if (valueBets.length === 0) {
    console.log('⚠️ Aucun value bet safe/modéré');
    return false;
  }

  // Trier par fiabilité décroissante : edge le plus élevé d'abord, puis risque le plus faible
  valueBets.sort((a, b) => {
    // Priorité 1 : edge décroissant (meilleur edge = plus fiable)
    const edgeA = a._mlEdge || 0;
    const edgeB = b._mlEdge || 0;
    if (edgeB !== edgeA) return edgeB - edgeA;
    // Priorité 2 : risque croissant (moins risqué = plus fiable)
    return (a.riskPercentage || 100) - (b.riskPercentage || 100);
  });

  // 🔒 PLAFONNER à 5 value bets max — les plus sûrs uniquement
  const vbDisplayCount = Math.min(valueBets.length, 5);

  let message = '';
  
  message += '╔════════════════════════╗\n';
  message += `║   💎 <b>VALUE BETS DU JOUR</b>   ║\n`;
  message += '╚════════════════════════╝\n\n';
  
  if (valueBets.length > vbDisplayCount) {
    message += `🔥 <b>${vbDisplayCount}/${valueBets.length}</b> — top ${vbDisplayCount} par fiabilité\n\n`;
  } else {
    message += `🔥 <b>${valueBets.length} value bet${valueBets.length > 1 ? 's' : ''}</b>\n\n`;
  }

  for (let i = 0; i < vbDisplayCount; i++) {
    const m = valueBets[i];
    const sportEmoji = SPORT_EMOJIS[m.sport] || '🏟️';
    const { date, time } = formatDateTime(m.date, m.displayDate);
    const winProb = m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : 50);
    const betOption = getBetOption(m.predictedResult, m.sport, m.oddsHome, m.oddsDraw, m.oddsAway, m.homeTeam, m.awayTeam);
    const riskEmoji = (m.riskPercentage || 100) <= 30 ? '🟢' : (m.riskPercentage || 100) <= 50 ? '🟡' : '🔴';
    const riskLabel = (m.riskPercentage || 100) <= 30 ? 'Safe' : (m.riskPercentage || 100) <= 50 ? 'Modéré' : 'Kamikaze';
    
    message += '━━━━━━━━━━━━━━━━━━━━━\n';
    message += `<b>${i + 1}. ${m.homeTeam} vs ${m.awayTeam}</b>\n`;
    // 📅 Date toujours affichée + tag dynamique [DEMAIN] si applicable
    const vbDateTag = computeDateTag(m.date);
    message += `📅 <b>${date}</b>${vbDateTag}\n`;
    message += `${sportEmoji} ${m.sport}`;
    if (m.league) message += ` | ${m.league}`;
    message += `\n`;
    
    if (time) message += `⏰ ${time}  ·  `;
    // 🎯 Ne pas afficher 'N/A' si la recommendation est absente — le betOption contient déjà le nom de l'équipe
    const rec = m.recommendation && m.recommendation !== 'N/A' ? ` <b>${m.recommendation}</b>` : '';
    message += `🎯 ${betOption}${rec}\n`;
    
    if (m.oddsHome && m.oddsAway) {
      message += `📊 Cotes: 1:<b>${m.oddsHome.toFixed(2)}</b>`;
      if (m.oddsDraw) message += ` X:<b>${m.oddsDraw.toFixed(2)}</b>`;
      message += ` 2:<b>${m.oddsAway.toFixed(2)}</b>\n`;
    }
    
    message += `${riskEmoji} <b>${riskLabel}</b> — Chance: <b>${winProb}%</b>\n`;
    if (m.valueBetType) {
      message += `💎 Type: ${m.valueBetType}\n`;
    }
    message += '\n';
  }

  // Dedup: eviter d'envoyer les memes value bets 2 fois
  if (isDuplicate('valuebets', message)) {
    console.log('Value bets deja publies - skip');
    return false;
  }

  return sendTelegramMessageLong(message);
}

// ============================================
// PUBLICATION KAMIKAZE
// ============================================

export async function publishKamikazeToTelegram(predictions: TelegramMatch[]): Promise<boolean> {
  // 🎾 EXCLURE le tennis des pronostics Telegram
  const nonTennis = predictions.filter(p => {
    const sport = (p.sport || '').toLowerCase();
    return !EXCLUDED_TELEGRAM_SPORTS.includes(sport) && !sport.includes('tennis');
  });
  const kamikazePicks = nonTennis.filter(p => isKamikaze(p.riskPercentage));

  if (kamikazePicks.length === 0) {
    console.log('⚠️ Aucun pronostic Kamikaze à publier');
    return false;
  }

  // Trie centralisé : cotes décroissantes, puis football en premier
  const kamikazeSorted = sortKamikazePicks(kamikazePicks);

  // 🔒 PLAFONNER à 3 kamikazes max par sport
  const kamikazeCapped = capKamikazePerSport(kamikazeSorted);

  let message = '';

  message += '╔════════════════════════╗\n';
  message += `║ 💣 <b>KAMIKAZE DU JOUR</b>  ║\n`;
  message += '╚════════════════════════╝\n\n';

  message += `⚠️ <b>HAUT RISQUE - HAUTE RÉCOMPENSE</b>\n`;
  message += `🔥 <b>${kamikazeCapped.length} opportunité${kamikazeCapped.length > 1 ? 's' : ''} à gros potentiel</b>\n\n`;

  for (let i = 0; i < kamikazeCapped.length; i++) {
    const m = kamikazeCapped[i];
    const sportEmoji = SPORT_EMOJIS[m.sport] || '🏟️';
    const { date, time } = formatDateTime(m.date, m.displayDate);
    const winProb = m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : 50);
    const maxOdds = m.oddsHome && m.oddsAway ? Math.max(m.oddsHome, m.oddsAway) : 0;
    const betOption = getBetOption(m.predictedResult, m.sport, m.oddsHome, m.oddsDraw, m.oddsAway, m.homeTeam, m.awayTeam);
    const isFootball = isFootballMatch(m.sport);

    message += '━━━━━━━━━━━━━━━━━━━━━\n';
    message += `<b>${i + 1}. ${m.homeTeam} vs ${m.awayTeam}</b>\n`;
    // 📅 Date toujours affichée + tag dynamique [DEMAIN] si applicable
    const kzDateTag = computeDateTag(m.date);
    message += `📅 <b>${date}</b>${kzDateTag}\n`;
    message += `${sportEmoji} ${m.sport}`;
    if (m.league) message += ` | ${m.league}`;
    message += `\n`;

    if (time) message += `⏰ ${time}  ·  `;
    // 🎯 Ne pas afficher 'N/A' si la recommendation est absente — le betOption contient déjà le nom de l'équipe
    const rec = m.recommendation && m.recommendation !== 'N/A' ? ` <b>${m.recommendation}</b>` : '';
    message += `🎯 ${betOption}${rec}\n`;

    if (m.oddsHome && m.oddsAway) {
      message += `📊 Cotes: 1:<b>${m.oddsHome.toFixed(2)}</b>`;
      if (m.oddsDraw) message += ` X:<b>${m.oddsDraw.toFixed(2)}</b>`;
      message += ` 2:<b>${m.oddsAway.toFixed(2)}</b>\n`;
    }

    message += `💥 <b>Kamikaze</b> — Chance: <b>${winProb}%</b>\n`;
    message += `💰 Gain potentiel: <b>x${maxOdds.toFixed(2)}</b>\n`;
    
    // Buts pour le football kamikaze aussi
    // PRIORITÉ: pipeline unifié → fallback recalcul
    if (isFootball && m.oddsHome && m.oddsAway && !m.isEstimated && m.league) {
      if (m._dixonColes) {
        message += formatGoalsFromUnified(m._dixonColes);
      } else {
        try {
          const goals = await calculateGoalsPredictionEnriched(
            m.homeTeam, m.awayTeam, m.league,
            m.oddsHome, m.oddsDraw, m.oddsAway, m.isEstimated
          );
          if (goals && goals.confidence !== 'low') {
            message += formatGoalsBlock(goals);
          }
        } catch (e) {
          // Skip
        }
      }
    }
    
    message += '\n';
  }

  message += `━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `⚠️ <b>ATTENTION</b>\n`;
  message += `Ces pronostics sont très risqués.\n`;
  message += `Ne pariez que ce que vous pouvez perdre.\n`;

  // Dedup: eviter d'envoyer les memes kamikazes 2 fois
  if (isDuplicate('kamikaze', message)) {
    console.log('Kamikaze deja publie - skip');
    return false;
  }

  return sendTelegramMessageLong(message);
}

// ============================================
// PUBLICATION LIVE & RÉSULTATS
// ============================================

export async function publishLiveAlertToTelegram(match: {
  homeTeam: string;
  awayTeam: string;
  sport: string;
  homeScore?: number;
  awayScore?: number;
  clock?: string;
  recommendation?: string;
}): Promise<boolean> {
  const sportEmoji = SPORT_EMOJIS[match.sport] || '🏟️';
  
  let message = '━━━━━━━━━━━━━━━━━━━━━\n';
  message += `🔴 <b>MATCH EN DIRECT</b>\n`;
  message += '━━━━━━━━━━━━━━━━━━━━━\n\n';
  
  message += `${sportEmoji} <b>${match.homeTeam} vs ${match.awayTeam}</b>\n\n`;
  
  if (match.homeScore !== undefined && match.awayScore !== undefined) {
    message += `📊 <b>SCORE: ${match.homeScore} - ${match.awayScore}</b>\n`;
  }
  
  if (match.clock) {
    message += `⏱️ ${match.clock}\n`;
  }
  
  if (match.recommendation) {
    message += `\n💡 <b>Pronostic: ${match.recommendation}</b>\n`;
  }

  return sendTelegramMessage(message);
}

export async function publishResultsToTelegram(results: {
  total: number;
  correct: number;
  winRate: number;
  bestPredictions: Array<{
    match: string;
    prediction: string;
    result: 'won' | 'lost';
  }>;
}): Promise<boolean> {
  const emoji = results.winRate >= 60 ? '🎉' : results.winRate >= 40 ? '📊' : '📉';
  
  let message = '';
  message += '╔════════════════════════╗\n';
  message += `║   ${emoji} <b>RÉSULTATS DU JOUR</b>    ║\n`;
  message += '╚════════════════════════╝\n\n';
  
  message += `✅ <b>${results.correct}/${results.total}</b> pronostics corrects\n`;
  message += `📈 Taux: <b>${results.winRate}%</b>\n`;
  message += `    ${createProgressBar(results.winRate)}\n\n`;
  
  if (results.bestPredictions.length > 0) {
    message += `━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `<b>DÉTAILS</b>\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    results.bestPredictions.slice(0, 5).forEach(p => {
      const resultEmoji = p.result === 'won' ? '✅' : '❌';
      message += `${resultEmoji} <b>${p.match}</b>\n`;
      message += `    🎯 ${p.prediction}\n\n`;
    });
  }

  return sendTelegramMessage(message);
}

// ============================================
// UTILITAIRES TELEGRAM
// ============================================

export async function getTelegramChatId(): Promise<string | null> {
  if (!TELEGRAM_BOT_TOKEN) return null;

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.ok || !data.result?.length) return null;

    const lastUpdate = data.result[data.result.length - 1];
    const chatId = lastUpdate.message?.chat?.id || lastUpdate.my_chat_member?.chat?.id;

    return chatId ? String(chatId) : null;
  } catch {
    return null;
  }
}

export async function testTelegramConnection(): Promise<{
  success: boolean;
  chatId?: string;
  botName?: string;
  error?: string;
}> {
  if (!TELEGRAM_BOT_TOKEN) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN non configuré' };
  }

  try {
    const botUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`;
    const botResponse = await fetch(botUrl);
    const botData = await botResponse.json();

    if (!botData.ok) return { success: false, error: botData.description };

    const botName = botData.result.username;

    if (!TELEGRAM_CHAT_ID) {
      const chatId = await getTelegramChatId();
      return chatId ? { success: true, chatId, botName } : { success: false, botName, error: 'CHAT_ID non trouvé' };
    }

    const testSent = await sendTelegramMessage('🤖 Test de connexion réussi !');
    return { success: testSent, chatId: TELEGRAM_CHAT_ID, botName };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ============================================
// PUBLICATION BILAN QUOTIDIEN
// ============================================

interface ComboResultSummary {
  comboId: string;
  comboName: string;
  legs: Array<{
    homeTeam: string;
    awayTeam: string;
    sport: string;
    league: string;
    predicted: string;
    resultMatch: boolean | null;
    status: string;
    odds?: number;
  }>;
  allLegsVerified: boolean;
  allLegsWon: boolean;
  status: 'won' | 'lost' | 'partial' | 'pending';
}

interface DailyResultSummary {
  date: string;
  totalPredictions: number;
  totalVerified: number;
  totalPending: number;
  wins: number;
  losses: number;
  winRate: number;
  goalsWins: number;
  goalsLosses: number;
  roi: number;           // ROI en % (bénéfice net / mises totales)
  profitUnits: number;    // Bénéfice en unités (-1 par perte, cote-1 par gain)
  streaks: Record<string, { type: 'win' | 'loss' | 'none'; count: number }>;
  bySport: Record<string, { total: number; wins: number; losses: number; winRate: number; pending: number; roi: number; profitUnits: number }>;
  combos: ComboResultSummary[];
  // Value bet vs safe comparison
  valueBetStats?: { total: number; wins: number; losses: number; winRate: number; roi: number; profitUnits: number; avgEdge: number };
  safeStats?: { total: number; wins: number; losses: number; winRate: number; roi: number; profitUnits: number };
  details: Array<{
    homeTeam: string;
    awayTeam: string;
    sport: string;
    league: string;
    predicted: string;
    predictedGoals?: string;
    actualHome: number | null;
    actualAway: number | null;
    actualResult: string | null;
    resultMatch: boolean | null;
    goalsMatch: boolean | null;
    status: string;
    oddsHome?: number;
    oddsDraw?: number | null;
    oddsAway?: number;
    predictedResult?: string;
  }>;
}

/**
 * Récupère les résultats d'une date donnée depuis Supabase
 * ⚠️ Filtrage par created_at (date de publication), pas match_date
 * Le bilan journalier porte sur les publications du jour, pas sur la date du match
 */
async function fetchDailyResultsFromSupabase(dateISO?: string): Promise<DailyResultSummary> {
  const targetDate = dateISO || (() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  })();

  // 🎯 Filtrer par created_at = date de publication (pas match_date)
  // Le bilan du jour J couvre les publications de la VEILLE (J-1)
  // Ex: bilan publié le 11 août à 5h → publications du 10 août
  const dayPreds = await SupabaseStore.getPredictionsByCreatedAt(targetDate);

  console.log(`📊 [BILAN] created_at: ${targetDate} (publications de la veille)`);
  console.log(`📊 [BILAN] Trouvé: ${dayPreds.length} pronostics publiés ce jour`);
  if (dayPreds.length > 0) {
    console.log(`📊 [BILAN] Détails: ${JSON.stringify(dayPreds.slice(0, 5).map(p => ({ id: p.match_id?.slice(0, 40), sport: p.sport, risk: p.risk_percentage, status: p.status, created: (p.created_at || '').split('T')[0], match: (p.match_date || '').split('T')[0] })))}`);
  }

  const allDayPredictions = dayPreds;

  const emptySummary: DailyResultSummary = {
    date: targetDate,
    totalPredictions: 0,
    totalVerified: 0,
    totalPending: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    goalsWins: 0,
    goalsLosses: 0,
    roi: 0,
    profitUnits: 0,
    streaks: {},
    bySport: {},
    combos: [],
    valueBetStats: { total: 0, wins: 0, losses: 0, winRate: 0, roi: 0, profitUnits: 0, avgEdge: 0 },
    safeStats: { total: 0, wins: 0, losses: 0, winRate: 0, roi: 0, profitUnits: 0 },
    details: [],
  };

  try {
    // 📊 BILAN COMPLET : TOUS les pronostics publiés (safe, modéré, kamikaze)
    // Le filtre risk ne s'applique qu'à la SÉLECTION, pas au BILAN
    // Foot/basket = risque faible, NHL/baseball = risque plus élevé → TOUS tracqués
    const dayPredictions = allDayPredictions;
    if (dayPredictions.length === 0) return emptySummary;

    // 🤖 Séparer les combos (is_combo=true) des pronostics normaux
    const comboPredictions = dayPredictions.filter(p => p.is_combo === true);
    const normalPredictions = dayPredictions.filter(p => !p.is_combo);

    // Grouper les legs par combo_id
    const comboMap = new Map<string, any[]>();
    const comboNames = new Map<string, string>();
    for (const p of comboPredictions) {
      const cid = p.combo_id || 'unknown';
      if (!comboMap.has(cid)) comboMap.set(cid, []);
      comboMap.get(cid)!.push(p);
      if (p.combo_name) comboNames.set(cid, p.combo_name);
    }

    // Construire les résumés de combo
    const combos: ComboResultSummary[] = [];
    for (const [comboId, legs] of comboMap) {
      const allVerified = legs.every(l => l.status === 'completed');
      const allPending = legs.every(l => l.status === 'pending');
      const allWon = allVerified && legs.every(l => l.result_match === true);
      const anyLost = legs.some(l => l.result_match === false);

      let status: ComboResultSummary['status'] = 'pending';
      if (allPending) status = 'pending';
      else if (allWon) status = 'won';
      else if (anyLost) status = 'lost';
      else status = 'partial';

      combos.push({
        comboId,
        comboName: comboNames.get(comboId) || 'Combo',
        legs: legs.map(l => {
          const predictedLabel = formatPredictedResult(l.predicted_result, l.sport, l.home_team, l.away_team, l.odds_home, l.odds_draw, l.odds_away);
          let betOdds = 1.0;
          if (l.predicted_result === 'home') betOdds = l.odds_home || 1.0;
          else if (l.predicted_result === 'away') betOdds = l.odds_away || 1.0;
          else if (l.predicted_result === 'draw') betOdds = l.odds_draw || 1.0;
          return {
            homeTeam: l.home_team || '',
            awayTeam: l.away_team || '',
            sport: l.sport || 'football',
            league: l.league || '',
            predicted: predictedLabel,
            resultMatch: l.result_match ?? null,
            status: l.status || 'pending',
            odds: betOdds,
          };
        }),
        allLegsVerified: allVerified,
        allLegsWon: allWon,
        status,
      });
    }

    const summary: DailyResultSummary = {
      ...emptySummary,
      totalPredictions: normalPredictions.length,
      combos,
    };

    // Grouper par sport et calculer les stats
    let totalStakes = 0;
    let totalProfit = 0;

    // 💎 Value bet vs safe accumulators
    const vbStats = { total: 0, wins: 0, losses: 0, profitUnits: 0, stakes: 0, edgeSum: 0, edgeCount: 0 };
    const safeStats = { total: 0, wins: 0, losses: 0, profitUnits: 0, stakes: 0 };

    // 📊 BILAN : PAS de plafond par sport — on comptabilise TOUT ce qui est publié
    // Le plafond ne s'applique qu'à la SÉLECTION (selectTopDailyPredictions)

    for (const p of normalPredictions) {
      // ⚠️ Normaliser le sport (anciennes données pouvant avoir 'foot', 'basket', 'nhl')
      let sport = (p.sport || 'other').toLowerCase();
      // Normalisation des variantes
      if (sport === 'foot' || sport === 'soccer') sport = 'football';
      else if (sport === 'basket' || sport === 'nba') sport = 'basketball';
      else if (sport === 'nhl') sport = 'hockey';
      else if (sport === 'mlb') sport = 'baseball';

      // 🎾 EXCLURE le tennis des pronostics Telegram (pas de pipeline ML fiable)
      if (sport === 'tennis') continue;

      // ⚠️ Inférer le vrai sport à partir du league si sport='other'
      // 🎾 Tennis EXCLU — ne pas inférer tennis depuis 'other'
      if (sport === 'other' && p.league) {
        const league = p.league.toLowerCase();
        if (league.includes('mlb') || league.includes('baseball')) sport = 'baseball';
        else if (league.includes('nba') || league.includes('basketball')) sport = 'basketball';
        else if (league.includes('nhl') || league.includes('hockey')) sport = 'hockey';
        // tennis (atp/wta) reste 'other' — exclu du bilan
      }
      if (!summary.bySport[sport]) {
        summary.bySport[sport] = { total: 0, wins: 0, losses: 0, winRate: 0, pending: 0, roi: 0, profitUnits: 0 };
      }
      summary.bySport[sport].total++;

      const isVerified = p.status === 'completed';
      const isPending = p.status === 'pending';

      if (isPending) {
        summary.totalPending++;
        summary.bySport[sport].pending++;
      } else if (isVerified) {
        summary.totalVerified++;

        // Calcul du bénéfice (ROI)
        if (p.result_match !== null && p.result_match !== undefined) {
          // Trouver la cote du pronostic
          let betOdds = 1.0;
          if (p.predicted_result === 'home') betOdds = p.odds_home || 1.0;
          else if (p.predicted_result === 'away') betOdds = p.odds_away || 1.0;
          else if (p.predicted_result === 'draw') betOdds = p.odds_draw || 1.0;

          if (p.result_match === true) {
            // Gain : profit = cote - 1
            const profit = betOdds - 1;
            totalProfit += profit;
            summary.bySport[sport].profitUnits += profit;
            summary.wins++;
            summary.bySport[sport].wins++;
          } else if (p.result_match === false) {
            // Perte : -1 unité
            totalProfit -= 1;
            summary.bySport[sport].profitUnits -= 1;
            summary.losses++;
            summary.bySport[sport].losses++;
          }
          totalStakes += 1;

          // 💎 Accumulate value bet vs safe stats for completed predictions
          const isVB = (p as any).is_value_bet === true;
          if (isVB) {
            vbStats.total++;
            vbStats.stakes++;
            if (p.result_match === true) vbStats.wins++;
            if (p.result_match === false) vbStats.losses++;
            vbStats.profitUnits += (p.result_match === true) ? (betOdds - 1) : (p.result_match === false ? -1 : 0);
            if ((p as any).edge_value !== null && (p as any).edge_value !== undefined) {
              vbStats.edgeSum += (p as any).edge_value;
              vbStats.edgeCount++;
            }
          } else {
            safeStats.total++;
            safeStats.stakes++;
            if (p.result_match === true) safeStats.wins++;
            if (p.result_match === false) safeStats.losses++;
            safeStats.profitUnits += (p.result_match === true) ? (betOdds - 1) : (p.result_match === false ? -1 : 0);
          }
        }

        // ❌ Plus de suivi des buts dans le bilan — uniquement le résultat de la prédiction
      }

      // Détail du match
      const predictedLabel = formatPredictedResult(p.predicted_result, sport, p.home_team, p.away_team, p.odds_home, p.odds_draw, p.odds_away);
      summary.details.push({
        homeTeam: p.home_team || '',
        awayTeam: p.away_team || '',
        sport: sport,
        league: p.league || '',
        predicted: predictedLabel,
        predictedGoals: p.predicted_goals || undefined,
        actualHome: p.home_score ?? null,
        actualAway: p.away_score ?? null,
        actualResult: p.actual_result || null,
        resultMatch: p.result_match ?? null,
        goalsMatch: p.goals_match ?? null,
        status: p.status || 'pending',
        oddsHome: p.odds_home || undefined,
        oddsDraw: p.odds_draw ?? undefined,
        oddsAway: p.odds_away || undefined,
        predictedResult: p.predicted_result,
      });
    }

    // Calcul des taux + ROI
    summary.profitUnits = Math.round(totalProfit * 100) / 100;
    summary.roi = totalStakes > 0 ? Math.round((totalProfit / totalStakes) * 100) : 0;

    if (summary.totalVerified > 0) {
      summary.winRate = Math.round((summary.wins / summary.totalVerified) * 100);
    }
    for (const sport of Object.keys(summary.bySport)) {
      const s = summary.bySport[sport];
      const verified = s.wins + s.losses;
      s.winRate = verified > 0 ? Math.round((s.wins / verified) * 100) : 0;
      s.roi = verified > 0 ? Math.round((s.profitUnits / verified) * 100) : 0;
      s.profitUnits = Math.round(s.profitUnits * 100) / 100;
    }

    // 💎 Finalize value bet vs safe stats
    summary.valueBetStats = {
      total: vbStats.total,
      wins: vbStats.wins,
      losses: vbStats.losses,
      winRate: vbStats.total > 0 ? Math.round((vbStats.wins / vbStats.total) * 100) : 0,
      roi: vbStats.stakes > 0 ? Math.round((vbStats.profitUnits / vbStats.stakes) * 100) : 0,
      profitUnits: Math.round(vbStats.profitUnits * 100) / 100,
      avgEdge: vbStats.edgeCount > 0 ? Math.round((vbStats.edgeSum / vbStats.edgeCount) * 10) / 10 : 0,
    };
    summary.safeStats = {
      total: safeStats.total,
      wins: safeStats.wins,
      losses: safeStats.losses,
      winRate: safeStats.total > 0 ? Math.round((safeStats.wins / safeStats.total) * 100) : 0,
      roi: safeStats.stakes > 0 ? Math.round((safeStats.profitUnits / safeStats.stakes) * 100) : 0,
      profitUnits: Math.round(safeStats.profitUnits * 100) / 100,
    };

    // Calcul des séries (streaks) par sport — requête optimisée Supabase (status=completed + result_match non null)
    try {
      const completed = await SupabaseStore.getRecentCompletedPredictions(500);
      // Exclure les legs de combo pour ne pas gonfler les séries
      const completedNoCombos = completed.filter(p => !p.is_combo);
      // Déjà triés par date décroissante via la requête Supabase

      const sportStreaks: Record<string, { type: 'win' | 'loss' | 'none'; count: number }> = {};
      for (const p of completedNoCombos) {
        let sport = (p.sport || 'other').toLowerCase();
        // Normaliser pour éviter les clés dupliquées (foot vs football, nhl vs hockey)
        if (sport === 'foot' || sport === 'soccer') sport = 'football';
        else if (sport === 'basket' || sport === 'nba') sport = 'basketball';
        else if (sport === 'nhl') sport = 'hockey';
        else if (sport === 'mlb') sport = 'baseball';
        if (!sportStreaks[sport]) {
          sportStreaks[sport] = { type: p.result_match ? 'win' : 'loss', count: 1 };
        } else if (p.result_match && sportStreaks[sport].type === 'win') {
          sportStreaks[sport].count++;
        } else if (!p.result_match && sportStreaks[sport].type === 'loss') {
          sportStreaks[sport].count++;
        } else {
          // La série est cassée, on arrête de compter pour ce sport
          continue;
        }
      }
      summary.streaks = sportStreaks;
    } catch {
      // Streaks sont un bonus, pas critique
    }

    return summary;
  } catch (e) {
    console.error('Erreur fetchDailyResultsFromSupabase:', e);
    return emptySummary;
  }
}

/**
 * Vérifie si le sport autorise le match nul.
 * - Football : TOUJOURS vrai (même si ESPN ne fournit pas la cote de nul)
 * - Hockey : vrai uniquement si une cote de nul est fournie
 */
function hasDrawOption(sport?: string, oddsDraw?: number | null): boolean {
  if (!sport) return false;
  const s = sport.toLowerCase();
  // Le football a toujours un nul possible (sauf phases finales à élimination directe)
  if (s.includes('foot') || s === 'soccer') return true;
  // Autres sports : nul uniquement si une cote de nul est explicitement fournie
  if (oddsDraw !== null && oddsDraw !== undefined && oddsDraw > 1.0) return true;
  return false;
}

function formatPredictedResult(
  result?: string,
  sport?: string,
  homeTeam?: string,
  awayTeam?: string,
  oddsHome?: number,
  oddsDraw?: number | null,
  oddsAway?: number,
): string {
  if (!result) return 'N/A';
  
  // Affinage pour les sports avec nul (football, hockey)
  const withDraw = hasDrawOption(sport, oddsDraw);
  
  if (withDraw && (result === 'home' || result === 'away')) {
    const team = result === 'home' ? homeTeam : awayTeam;
    if (oddsHome && oddsAway) {
      const probs = calcImpliedProbs(oddsHome, oddsDraw, oddsAway, sport);
      const isHome = result === 'home';
      const purePct = isHome ? probs.home : probs.away;
      const vnPct = isHome ? probs.homeOrDraw : probs.awayOrDraw;
      return `Victoire ${team} (${purePct}%) · V/N: ${vnPct}%`;
    }
    return result === 'home' ? `Victoire ${homeTeam || 'Domicile'}` : `Victoire ${awayTeam || 'Extérieur'}`;
  }
  
  if (withDraw && result === 'draw' && oddsHome && oddsAway) {
    const probs = calcImpliedProbs(oddsHome, oddsDraw, oddsAway, sport);
    return `Match Nul (${probs.draw || 0}%)`;
  }
  
  switch (result) {
    case 'home': return 'Victoire Domicile';
    case 'draw': return 'Match Nul';
    case 'away': return 'Victoire Extérieur';
    case 'over': return 'Over 2.5';
    case 'under': return 'Under 2.5';
    case 'btts_yes': return 'BTTS Oui';
    case 'btts_no': return 'BTTS Non';
    case 'avoid': return 'Non joué';
    default: return result;
  }
}

function formatActualResult(result?: string | null, homeScore?: number | null, awayScore?: number | null): string {
  if (homeScore !== null && homeScore !== undefined && awayScore !== null && awayScore !== undefined) {
    return `${homeScore}-${awayScore}`;
  }
  if (!result) return 'En attente';
  switch (result) {
    case 'home': return 'Victoire Domicile';
    case 'draw': return 'Match Nul';
    case 'away': return 'Victoire Extérieur';
    default: return result;
  }
}

/**
 * Publie le bilan quotidien des pronostics sur Telegram.
 * Format: résumé par sport détaillé AVANT bilan global, puis détails par match.
 */
export async function publishDailyResultsToTelegram(dateISO?: string): Promise<boolean> {
  const summary = await fetchDailyResultsFromSupabase(dateISO);

  if (summary.totalPredictions === 0) {
    console.log('⚠️ Aucun pronostic à comparer pour cette date');
    return false;
  }

  // Formatter la date
  const dateObj = new Date(summary.date + 'T12:00:00');
  const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const dateLabel = `${dayNames[dateObj.getDay()]} ${dateObj.getDate()} ${monthNames[dateObj.getMonth()]}`;

  // Maps sport
  const sportEmojis: Record<string, string> = {
    'football': '⚽', 'basketball': '🏀', 'hockey': '🏒', 'baseball': '⚾', 'other': '🏟️',
  };
  const sportNames: Record<string, string> = {
    'football': 'Football', 'basketball': 'Basket', 'hockey': 'Hockey', 'baseball': 'Baseball', 'other': 'Autres',
  };
  const sportPriority: Record<string, number> = {
    'football': 1, 'basketball': 2, 'hockey': 3, 'baseball': 4, 'other': 99,
  };
  const sortedSports = Object.keys(summary.bySport).sort((a, b) => (sportPriority[a] || 99) - (sportPriority[b] || 99));

  let message = '';

  // En-tête
  message += '╔═════════════════════════════╗\n';
  message += '║\n';
  message += '║   📊 <b>BILAN DE LA VEILLE</b>\n';
  message += '║\n';
  message += '╚═════════════════════════════╝\n\n';
  message += `📅 <b>${dateLabel}</b>\n\n`;

  // =============================================
  // RÉSUMÉ PAR SPORT (détaillé, AVANT le global)
  // =============================================
  if (sortedSports.length > 0) {
    message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    message += '<b>BILAN PAR SPORT</b>\n\n';

    for (let si = 0; si < sortedSports.length; si++) {
      const sport = sortedSports[si];
      const s = summary.bySport[sport];
      const emoji = sportEmojis[sport] || '🏟️';
      const name = sportNames[sport] || sport;
      const verified = s.wins + s.losses;
      const hasPending = s.pending > 0;

      // Ne montrer que les sports qui ont au moins 1 match (terminé OU en attente)
      if (verified === 0 && !hasPending) continue;

      // Séparateur visuel entre les sports
      if (si > 0) {
        message += '───────────────────────────\n';
      }

      // Indicateur de performance
      const sportEmoji = verified > 0 ? (s.winRate >= 60 ? '🏆' : s.winRate >= 40 ? '📊' : '📉') : '⏳';
      message += `${emoji} <b>${name}</b> ${sportEmoji}\n`;

      if (verified > 0) {
        // Ligne principale: X/Y corrects · Z%
        message += `    ✅ ${s.wins}/${verified} corrects  ·  <b>${s.winRate}%</b>\n`;
      } else {
        message += `    ⏳ ${s.pending} en attente de résultat\n`;
      }

      // ROI par sport
      if (verified > 0 && s.profitUnits !== 0) {
        const roiSign = s.roi >= 0 ? '+' : '';
        const profitSign = s.profitUnits >= 0 ? '+' : '';
        const roiEmoji = s.roi >= 0 ? '💰' : '📉';
        message += `    ${roiEmoji} ROI: <b>${roiSign}${s.roi}%</b> (${profitSign}${s.profitUnits.toFixed(2)}u)\n`;
      }

      message += '\n';
    }
  }

  // =============================================
  // RÉSULTAT GLOBAL (terminés + en attente)
  // =============================================
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  const globalEmoji = summary.totalVerified > 0
    ? (summary.winRate >= 60 ? '🏆' : summary.winRate >= 40 ? '📊' : '📉')
    : '⏳';
  message += `${globalEmoji} <b>RÉSULTAT GLOBAL</b>\n`;
  if (summary.totalVerified > 0) {
    message += `    ✅ ${summary.wins}/${summary.totalVerified} corrects  ·  <b>${summary.winRate}%</b>\n`;
  } else {
    message += `    ⏳ Aucun résultat vérifié\n`;
  }
  if (summary.totalPending > 0) {
    message += `    📋 ${summary.totalPending} en attente de résultat\n`;
  }

  // ROI (rendement) global
  if (summary.totalVerified > 0 && summary.profitUnits !== 0) {
    const roiSign = summary.roi >= 0 ? '+' : '';
    const profitSign = summary.profitUnits >= 0 ? '+' : '';
    const roiEmoji = summary.roi >= 0 ? '💰' : '📉';
    message += `    ${roiEmoji} ROI: <b>${roiSign}${summary.roi}%</b> (${profitSign}${summary.profitUnits.toFixed(2)}u)\n`;
  }
  message += '\n';

  // =============================================
  // 💎 VALUE BET vs SAFE COMPARISON
  // =============================================
  if (summary.valueBetStats && summary.safeStats && 
      (summary.valueBetStats.total > 0 || summary.safeStats.total > 0)) {
    message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    message += '💎 <b>VALUE BET vs SAFE</b>\n\n';

    if (summary.valueBetStats.total > 0) {
      const vb = summary.valueBetStats;
      const vbEmoji = vb.roi >= 0 ? '💰' : '📉';
      const vbRoiSign = vb.roi >= 0 ? '+' : '';
      const vbProfitSign = vb.profitUnits >= 0 ? '+' : '';
      message += `💎 <b>Value Bets</b> (${vb.total} pronostics)\n`;
      message += `    ✅ ${vb.wins}/${vb.wins + vb.losses} corrects · <b>${vb.winRate}%</b>\n`;
      message += `    ${vbEmoji} ROI: <b>${vbRoiSign}${vb.roi}%</b> (${vbProfitSign}${vb.profitUnits.toFixed(2)}u)\n`;
      if (vb.avgEdge > 0) {
        message += `    📊 Edge moyen: <b>${vb.avgEdge}%</b>\n`;
      }
      message += '\n';
    }

    if (summary.safeStats.total > 0) {
      const s = summary.safeStats;
      const sEmoji = s.roi >= 0 ? '💰' : '📉';
      const sRoiSign = s.roi >= 0 ? '+' : '';
      const sProfitSign = s.profitUnits >= 0 ? '+' : '';
      message += `🛡️ <b>Safes (non-VB)</b> (${s.total} pronostics)\n`;
      message += `    ✅ ${s.wins}/${s.wins + s.losses} corrects · <b>${s.winRate}%</b>\n`;
      message += `    ${sEmoji} ROI: <b>${sRoiSign}${s.roi}%</b> (${sProfitSign}${s.profitUnits.toFixed(2)}u)\n`;
      message += '\n';
    }

    // Quick verdict: which is performing better
    if (summary.valueBetStats.total >= 3 && summary.safeStats.total >= 3) {
      const vbROI = summary.valueBetStats.roi;
      const sROI = summary.safeStats.roi;
      const diff = vbROI - sROI;
      if (Math.abs(diff) >= 5) {
        message += `📋 <b>Verdict:</b> `;
        if (diff > 0) {
          message += `Value bets +${diff}pp de ROI vs safes — le modèle repère bien les erreurs du marché`;
        } else {
          message += `Safes +${Math.abs(diff)}pp de ROI vs value bets — les value bets n'apportent pas encore d'avantage`;
        }
        message += '\n';
      }
    }
    message += '\n';
  }

  // =============================================
  // 🤖 BILAN DES COMBOS (PARLEYS)
  // =============================================
  if (summary.combos && summary.combos.length > 0) {
    message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    message += '🤖 <b>BILAN COMBOS IA</b>\n\n';

    for (const combo of summary.combos) {
      const statusEmoji = combo.status === 'won' ? '🏆' : combo.status === 'lost' ? '❌' : combo.status === 'partial' ? '⏳' : '⏳';
      const statusLabel = combo.status === 'won' ? 'GAGNÉ' : combo.status === 'lost' ? 'PERDU' : combo.status === 'partial' ? 'EN COURS' : 'EN ATTENTE';

      message += `${statusEmoji} <b>${combo.comboName}</b> — <b>${statusLabel}</b>\n`;

      for (let i = 0; i < combo.legs.length; i++) {
        const leg = combo.legs[i];
        const legSport = (leg.sport || '').toLowerCase();
        const sportEmoji = legSport.includes('basket') ? '🏀' : legSport.includes('base') || legSport.includes('mlb') ? '⚾' : legSport.includes('hockey') || legSport.includes('nhl') ? '🏒' : '⚽';
        const legResult = leg.status === 'completed'
          ? (leg.resultMatch === true ? '✅' : '❌')
          : '⏳';
        message += `    ${legResult} ${sportEmoji} ${leg.homeTeam} vs ${leg.awayTeam} → <b>${leg.predicted}</b>`;
        if (leg.odds && leg.odds > 1) message += ` (${leg.odds.toFixed(2)})`;
        message += '\n';
      }

      // Cote combinée si toutes les legs ont des cotes
      const legsWithOdds = combo.legs.filter(l => l.odds && l.odds > 1);
      if (legsWithOdds.length === combo.legs.length) {
        const combinedOdds = legsWithOdds.reduce((acc, l) => acc * (l.odds || 1), 1);
        message += `    📈 Cote combinée: x${combinedOdds.toFixed(2)}\n`;
      }

      message += '\n';
    }
  }

  // =============================================
  // DÉTAILS PAR MATCH — TERMINÉS + EN ATTENTE
  // =============================================
  const allDetails = summary.details; // Tous : completed + pending
  if (allDetails.length > 0) {
    message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    message += '<b>DÉTAILS</b>\n\n';

    // Trier: par sport d'abord (ordre priorité), puis terminés avant pending
    const sortedDetails = allDetails.sort((a, b) => {
      const priorityA = sportPriority[a.sport] || 99;
      const priorityB = sportPriority[b.sport] || 99;
      if (priorityA !== priorityB) return priorityA - priorityB;
      // Terminés avant pending
      const statusA = a.status === 'completed' ? 0 : 1;
      const statusB = b.status === 'completed' ? 0 : 1;
      return statusA - statusB;
    });

    let currentSport = '';
    for (const d of sortedDetails) {
      const emoji = sportEmojis[d.sport] || '🏟️';

      // Séparateur visuel par sport
      if (d.sport !== currentSport) {
        if (currentSport) {
          message += '───────────────────────────\n';
          message += '\n';
        }
        const sportName = sportNames[d.sport] || d.sport;
        message += `${emoji} <b>${sportName.toUpperCase()}</b>\n`;
        message += '───────────────────────────\n';
        currentSport = d.sport;
      }

      message += `${emoji} ${d.homeTeam} vs ${d.awayTeam}\n`;

      if (d.status === 'completed' && d.resultMatch !== null) {
        const resultEmoji = d.resultMatch ? '✅' : '❌';
        const actual = formatActualResult(d.actualResult, d.actualHome, d.actualAway);
        message += `    ${resultEmoji} <b>${d.predicted}</b> → <b>${actual}</b>\n`;
      } else {
        message += `    ⏳ <b>${d.predicted}</b> — En attente\n`;
      }
    }
    message += '\n';
  }

  // Pied de message
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  message += '🤖 Bilan journalier · Tous pronostics publiés\n';
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━';

  // Envoyer le message

  // Dedup: eviter bilans en double
  if (isDuplicate('results', message)) {
    return false;
  }

  const sent = await sendTelegramMessageLong(message);

  // Envoyer un sticker en fonction du bilan
  if (sent) {
    await sendResultSticker(summary.winRate, summary.wins, summary.losses);
  }

  return sent;
}

/**
 * Publie le bilan KAMIKAZE séparé (uniquement les pronostics risk_percentage > 50)
 */
export async function publishKamikazeBilanToTelegram(dateISO?: string): Promise<boolean> {
  const targetDate = dateISO || (() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  })();

  try {
    // Chercher aussi sur le lendemain pour les matchs de nuit US
    const nextDay = (() => {
      const d = new Date(targetDate + 'T12:00:00Z');
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    })();
    const [dayPreds, nextDayPreds] = await Promise.all([
      SupabaseStore.getPredictionsByDate(targetDate),
      SupabaseStore.getPredictionsByDate(nextDay),
    ]);
    const seen = new Set<string>();
    const allDayPredictions: any[] = [];
    for (const p of [...dayPreds, ...nextDayPreds]) {
      if (!seen.has(p.match_id)) {
        seen.add(p.match_id);
        allDayPredictions.push(p);
      }
    }
    
    // 🔍 LOG DIAGNOSTIC: aider à comprendre pourquoi le bilan est vide
    console.log(`💣 [BILAN KAMIKAZE] Date: ${targetDate} + ${nextDay}`);
    console.log(`💣 [BILAN KAMIKAZE] Trouvé: ${dayPreds.length} (jour) + ${nextDayPreds.length} (lendemain) = ${allDayPredictions.length} total (après dédup)`);
    if (allDayPredictions.length > 0) {
      const riskBreakdown = allDayPredictions
        .filter(p => !p.is_combo)
        .map(p => ({ id: p.match_id?.slice(0, 40), sport: p.sport, risk: p.risk_percentage, status: p.status }));
      console.log(`💣 [BILAN KAMIKAZE] Détails risk:`, JSON.stringify(riskBreakdown.slice(0, 10)));
    }
    
    if (allDayPredictions.length === 0) {
      console.log('💣 [BILAN KAMIKAZE] Aucune prédiction trouvée pour cette date');
      return false;
    }

    // ⚠️ UNIQUEMENT les kamikazes (risk_percentage > 50)
    // 🎾 EXCLURE le tennis des pronostics Telegram
    const kamikazePredictions = allDayPredictions.filter(p => {
      if (p.is_combo === true) return false; // Exclure les legs de combo
      if ((p.risk_percentage ?? 100) <= 50) return false;
      const sport = (p.sport || 'other').toLowerCase();
      if (sport === 'tennis') return false;
      return true;
    });
    
    console.log(`💣 [BILAN KAMIKAZE] Kamikazes filtrés: ${kamikazePredictions.length} (risk > 50, non-combo, non-tennis)`);
    
    if (kamikazePredictions.length === 0) {
      console.log('💣 [BILAN KAMIKAZE] Aucun kamikaze trouvé — toutes les prédictions ont risk <= 50');
      return false;
    }

    // Calculer les stats
    let wins = 0;
    let losses = 0;
    let totalProfit = 0;

    const bySport: Record<string, { wins: number; losses: number; details: any[] }> = {};

    for (const p of kamikazePredictions) {
      // ⚠️ Normaliser le sport
      let sport = (p.sport || 'other').toLowerCase();
      if (sport === 'foot' || sport === 'soccer') sport = 'football';
      else if (sport === 'basket' || sport === 'nba') sport = 'basketball';
      else if (sport === 'nhl') sport = 'hockey';
      else if (sport === 'mlb') sport = 'baseball';

      if (!bySport[sport]) bySport[sport] = { wins: 0, losses: 0, details: [] };

      if (p.status === 'completed' && p.result_match !== null && p.result_match !== undefined) {
        let betOdds = 1.0;
        if (p.predicted_result === 'home') betOdds = p.odds_home || 1.0;
        else if (p.predicted_result === 'away') betOdds = p.odds_away || 1.0;
        else if (p.predicted_result === 'draw') betOdds = p.odds_draw || 1.0;

        if (p.result_match === true) {
          wins++;
          totalProfit += (betOdds - 1);
          bySport[sport].wins++;
        } else {
          losses++;
          totalProfit -= 1;
          bySport[sport].losses++;
        }
      }

      const predictedLabel = formatPredictedResult(p.predicted_result, sport, p.home_team, p.away_team, p.odds_home, p.odds_draw, p.odds_away);
      bySport[sport].details.push({
        homeTeam: p.home_team,
        awayTeam: p.away_team,
        predicted: predictedLabel,
        actualHome: p.home_score ?? null,
        actualAway: p.away_score ?? null,
        actualResult: p.actual_result || null,
        resultMatch: p.result_match ?? null,
        status: p.status || 'pending',
      });
    }

    const total = wins + losses;
    // 💡 Publier même si aucun terminé (montrer "en attente")
    const hasPending = kamikazePredictions.filter(p => p.status === 'pending').length > 0;

    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    const roi = total > 0 ? Math.round(totalProfit * 100 / total) : 0;
    const profitSign = totalProfit >= 0 ? '+' : '';
    const roiSign = roi >= 0 ? '+' : '';

    // Formatter la date
    const dateObj = new Date(targetDate + 'T12:00:00');
    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const dateLabel = `${dayNames[dateObj.getDay()]} ${dateObj.getDate()} ${monthNames[dateObj.getMonth()]}`;

    const sportEmojis: Record<string, string> = { 'football': '⚽', 'basketball': '🏀', 'hockey': '🏒', 'baseball': '⚾', 'other': '🏟️' };

    let message = '';
    message += '╔═════════════════════════════╗\n';
    message += '║\n';
    message += '║   💣 <b>BILAN KAMIKAZE</b> — Résultats\n';
    message += '║\n';
    message += '╚═════════════════════════════╝\n\n';
    message += `📅 <b>${dateLabel}</b>\n\n`;

    message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    if (total > 0) {
      const kEmoji = winRate >= 60 ? '🔥' : winRate >= 40 ? '💀' : '☠️';
      message += `${kEmoji} ✅ ${wins}/${total} corrects  ·  <b>${winRate}%</b>\n`;
      if (totalProfit !== 0) {
        const pEmoji = roi >= 0 ? '💰' : '📉';
        message += `${pEmoji} ROI: <b>${roiSign}${roi}%</b> (${profitSign}${totalProfit.toFixed(2)}u)\n`;
      }
    } else if (hasPending) {
      message += `⏳ <b>${kamikazePredictions.length} pronostic${kamikazePredictions.length > 1 ? 's' : ''} en attente de résultat</b>\n`;
    }
    message += '\n';

    // Détails — afficher TOUS les kamikazes (terminés ET en attente)
    message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    message += '<b>DÉTAILS</b>\n\n';

    for (const [sport, data] of Object.entries(bySport)) {
      const emoji = sportEmojis[sport] || '🏟️';
      // Séparateur par sport
      message += `${emoji} <b>${sport.toUpperCase()}</b>\n`;
      message += '───────────────────────────\n';

      for (const d of data.details) {
        if (d.status === 'completed' && d.resultMatch !== null) {
          const rEmoji = d.resultMatch ? '✅' : '❌';
          const actual = formatActualResult(d.actualResult, d.actualHome, d.actualAway);
          message += `${emoji} ${d.homeTeam} vs ${d.awayTeam}\n`;
          message += `    ${rEmoji} <b>${d.predicted}</b> → <b>${actual}</b>\n`;
        } else {
          // En attente
          message += `${emoji} ${d.homeTeam} vs ${d.awayTeam}\n`;
          message += `    ⏳ <b>${d.predicted}</b> — En attente\n`;
        }
      }
      message += '\n';
    }

    message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    message += '💣 Bilan kamikaze · Haut risque uniquement\n';
    message += '━━━━━━━━━━━━━━━━━━━━━━━━━';


    // Dedup: eviter bilans kamikaze en double
    if (isDuplicate('kamikaze-bilan', message)) {
      return false;
    }

    return await sendTelegramMessageLong(message);
  } catch (e) {
    console.error('Erreur bilan kamikaze:', e);
    return false;
  }
}

/**
 * Envoie un message émotif en fonction du bilan du jour
 * Utilise des emojis car les file_ids de stickers ne sont pas fiables entre bots
 */
async function sendResultSticker(winRate: number, wins: number, losses: number): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  const total = wins + losses;
  let emojiMessage = '';

  if (total === 0) {
    emojiMessage = '💤 Aucun match vérifié aujourd\'hui...';
  } else if (winRate >= 100 && total >= 3) {
    emojiMessage = '🏆🔥 PARFAIT ! ' + total + '/' + total + ' — Le bot est en feu !';
  } else if (winRate >= 70) {
    emojiMessage = '🎉💪 Excellent bilan ! On continue sur cette lancée !';
  } else if (winRate >= 50) {
    emojiMessage = '👍 Bon bilan, dans le positif !';
  } else if (winRate >= 40) {
    emojiMessage = '⚖️ Jour mitigé... La chance va tourner !';
  } else if (wins > 0) {
    emojiMessage = '😬 Jour difficile... Ca va mieux demain !';
  } else {
    emojiMessage = '💀 Jour noir... Mais le rebond est proche !';
  }

  if (!emojiMessage) return;

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: emojiMessage,
      }),
    });
    console.log(`🎨 Message émotif envoyé: ${winRate}% (${wins}/${total})`);
  } catch (e) {
    console.log('⚠️ Impossible d\'envoyer le message émotif:', e);
  }
}

// ============================================
// BILAN MENSUEL PAR SPORT
// ============================================

/**
 * Récupère les données mensuelles depuis Supabase et publie un bilan par sport
 */
export async function publishMonthlyResultsToTelegram(monthISO?: string): Promise<boolean> {
  // Calculer le mois cible
  const targetMonth = monthISO || (() => {
    const now = new Date();
    // Le mois précédent (car le 1er du mois, on veut le bilan du mois qui vient de finir)
    now.setMonth(now.getMonth() - 1);
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  })();

  try {
    // Récupérer TOUTES les prédictions terminées du mois depuis Supabase
    const allPredictions = await SupabaseStore.getAllPredictions();
    
    // Filtrer: status=completed, match_date dans le mois cible, exclure les combos
    const monthPredictions = allPredictions.filter(p => {
      if (p.is_combo === true) return false; // Exclure les legs de combo
      if (p.status !== 'completed' || p.result_match === null || p.result_match === undefined) return false;
      const matchDate = p.match_date?.split('T')[0]; // "2026-06-15"
      return matchDate?.startsWith(targetMonth);
    });

    if (monthPredictions.length === 0) {
      console.log(`⚠️ Aucune prédiction terminée pour le mois ${targetMonth}`);
      return false;
    }

    // Grouper par sport
    const bySport: Record<string, { wins: number; losses: number; total: number; profitUnits: number; leagues: Set<string> }> = {};
    
    for (const p of monthPredictions) {
      // ⚠️ Normaliser le sport
      let sport = (p.sport || 'other').toLowerCase();
      if (sport === 'foot' || sport === 'soccer') sport = 'football';
      else if (sport === 'basket' || sport === 'nba') sport = 'basketball';
      else if (sport === 'nhl') sport = 'hockey';
      else if (sport === 'mlb') sport = 'baseball';

      if (!bySport[sport]) {
        bySport[sport] = { wins: 0, losses: 0, total: 0, profitUnits: 0, leagues: new Set() };
      }
      bySport[sport].total++;
      
      if (p.result_match === true) {
        bySport[sport].wins++;
        // Profit = cote - 1
        let betOdds = 1.0;
        if (p.predicted_result === 'home') betOdds = p.odds_home || 1.0;
        else if (p.predicted_result === 'away') betOdds = p.odds_away || 1.0;
        else if (p.predicted_result === 'draw') betOdds = p.odds_draw || 1.0;
        bySport[sport].profitUnits += (betOdds - 1);
      } else if (p.result_match === false) {
        bySport[sport].losses++;
        bySport[sport].profitUnits -= 1;
      }

      if (p.league) bySport[sport].leagues.add(p.league);
    }

    // Calculer le global
    const totalWins = Object.values(bySport).reduce((s, v) => s + v.wins, 0);
    const totalLosses = Object.values(bySport).reduce((s, v) => s + v.losses, 0);
    const totalVerified = totalWins + totalLosses;
    const globalWinRate = totalVerified > 0 ? Math.round((totalWins / totalVerified) * 100) : 0;
    const globalProfit = Object.values(bySport).reduce((s, v) => s + v.profitUnits, 0);
    const globalROI = totalVerified > 0 ? Math.round((globalProfit / totalVerified) * 100) : 0;

    // Formatter le mois
    const [year, month] = targetMonth.split('-');
    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const monthLabel = `${monthNames[parseInt(month) - 1]} ${year}`;

    // Maps sport
    const sportEmojis: Record<string, string> = {
      'football': '⚽', 'basketball': '🏀', 'hockey': '🏒', 'baseball': '⚾', 'other': '🏟️',
    };
    const sportNames: Record<string, string> = {
      'football': 'Football', 'basketball': 'Basket', 'hockey': 'Hockey', 'baseball': 'Baseball', 'other': 'Autres',
    };
    const sportPriority: Record<string, number> = {
      'football': 1, 'basketball': 2, 'hockey': 3, 'baseball': 4, 'other': 99,
    };
    const sortedSports = Object.keys(bySport).sort((a, b) => (sportPriority[a] || 99) - (sportPriority[b] || 99));

    // Construire le message
    let message = '';
    message += '╔═════════════════════════════╗\n';
    message += '║\n';
    message += '║   📊 <b>BILAN MENSUEL</b>\n';
    message += '║\n';
    message += '╚═════════════════════════════╝\n\n';
    message += `📅 <b>${monthLabel}</b>\n\n`;

    // Bilan par sport
    message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    message += '<b>BILAN PAR SPORT</b>\n\n';

    for (const sport of sortedSports) {
      const s = bySport[sport];
      const emoji = sportEmojis[sport] || '🏟️';
      const name = sportNames[sport] || sport;
      const winRate = s.total > 0 ? Math.round((s.wins / s.total) * 100) : 0;
      const roi = s.total > 0 ? Math.round((s.profitUnits / s.total) * 100) : 0;
      const perfEmoji = winRate >= 60 ? '🏆' : winRate >= 40 ? '📊' : '📉';

      message += `${emoji} <b>${name}</b> ${perfEmoji}\n`;
      message += `    ✅ ${s.wins}/${s.total} corrects  ·  <b>${winRate}%</b>\n`;

      if (s.profitUnits !== 0) {
        const roiSign = roi >= 0 ? '+' : '';
        const profitSign = s.profitUnits >= 0 ? '+' : '';
        const roiEmoji = roi >= 0 ? '💰' : '📉';
        message += `    ${roiEmoji} ROI: <b>${roiSign}${roi}%</b> (${profitSign}${s.profitUnits.toFixed(2)}u)\n`;
      }

      // Ligues couvertes
      if (s.leagues.size > 0) {
        const leagueList = [...s.leagues].slice(0, 3).join(', ');
        const more = s.leagues.size > 3 ? ` +${s.leagues.size - 3} autres` : '';
        message += `    🏟️ ${leagueList}${more}\n`;
      }

      message += '\n';
    }

    // Global
    message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    const globalEmoji = globalWinRate >= 60 ? '🏆' : globalWinRate >= 40 ? '📊' : '📉';
    message += `${globalEmoji} <b>RÉSULTAT GLOBAL ${monthLabel.toUpperCase()}</b>\n`;
    message += `    ✅ ${totalWins}/${totalVerified} corrects  ·  <b>${globalWinRate}%</b>\n`;

    if (globalProfit !== 0) {
      const roiSign = globalROI >= 0 ? '+' : '';
      const profitSign = globalProfit >= 0 ? '+' : '';
      const roiEmoji = globalROI >= 0 ? '💰' : '📉';
      message += `    ${roiEmoji} ROI: <b>${roiSign}${globalROI}%</b> (${profitSign}${globalProfit.toFixed(2)}u)\n`;
    }
    message += '\n';

    message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    message += '🤖 Bilan mensuel automatique\n';
    message += '━━━━━━━━━━━━━━━━━━━━━━━━━';

    const sent = await sendTelegramMessageLong(message);
    
    // Sticker pour le bilan mensuel
    if (sent) {
      await sendResultSticker(globalWinRate, totalWins, totalLosses);
    }

    return sent;
  } catch (e) {
    console.error('Erreur bilan mensuel:', e);
    return false;
  }
}

// ============================================
// PUBLICATION COMBO LLM (Combiné Intelligent)
// ============================================

/**
 * Publie un combiné intelligent généré par l'IA sur Telegram
 * Section nommée distincte avec badge 🤖 pour identification
 */
export async function publishComboToTelegram(combo: any): Promise<boolean> {
  const sportEmojis: Record<string, string> = {
    'football': '⚽', 'basketball': '🏀',
  };
  const riskEmojis: Record<string, string> = {
    'low': '🟢', 'medium': '🟡', 'high': '🔴',
  };

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  let message = '';
  message += '╔═════════════════════════════╗\n';
  message += '║\n';
  message += '║   🤖 <b>COMBO IA DU JOUR</b>  ║\n';
  message += '║\n';
  message += '╚═════════════════════════════╝\n\n';
  message += `📅 ${today.charAt(0).toUpperCase() + today.slice(1)}\n\n`;
  message += `✨ <b>${combo.name}</b>\n\n`;

  // Raisonnement global
  if (combo.reasoning) {
    message += `💡 ${combo.reasoning}\n\n`;
  }

  message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  message += `<b> ${combo.legs.length} SÉLECTION${combo.legs.length > 1 ? 'S' : ''}</b>\n`;
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  for (let i = 0; i < combo.legs.length; i++) {
    const leg = combo.legs[i];
    const emoji = sportEmojis[leg.sport] || '🏟️';
    const riskEmoji = riskEmojis[leg.confidence === 'high' ? 'low' : leg.confidence === 'low' ? 'high' : 'medium'] || '🟡';

    message += `<b>${i + 1}.</b> ${emoji} <b>${leg.homeTeam} vs ${leg.awayTeam}</b>\n`;
    // 📅 Date du match si disponible
    if (leg.date) {
      const { date: legDate, time: legTime } = formatDateTime(leg.date, leg.displayDate);
      const legDateTag = computeDateTag(leg.date);
      message += `    📅 <b>${legDate}</b>${legDateTag}`;
      if (legTime) message += ` · ⏰ ${legTime}`;
      message += `\n`;
    }
    message += `    🏆 ${leg.league}\n`;
    message += `    🎯 <b>${leg.betLabel}</b>\n`;
    message += `    📊 Cote: <b>${leg.odds.toFixed(2)}</b> · Chance: <b>${leg.winProbability}%</b>\n`;
    if (leg.reasoning) {
      message += `    💡 ${leg.reasoning}\n`;
    }
    message += '\n';
  }

  // Stats du combo
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  message += '<b>STATS COMBO</b>\n\n';
  message += `    📈 Cote combinée: <b>x${combo.combinedOdds.toFixed(2)}</b>\n`;
  message += `    🎯 Proba combinée: <b>${(combo.combinedWinProbability * 100).toFixed(1)}%</b>\n`;
  message += `    ${riskEmojis[combo.riskLevel] || '🟡'} Risque: <b>${combo.riskLevel === 'low' ? 'Faible' : combo.riskLevel === 'medium' ? 'Modéré' : 'Élevé'}</b>\n`;
  message += `    💰 Valeur attendue: <b>${combo.expectedValue > 0 ? '+' : ''}${(combo.expectedValue * 100).toFixed(1)}%</b>\n`;
  message += '\n';

  message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  message += '🤖 Combo généré par IA · Parlay intelligent\n';
  message += '⚠️ Les combinés multiplient les cotes MAIS aussi le risque\n';
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━';


  // Dedup: eviter combos en double
  const comboKey = `combo-${combo.comboId || Date.now()}`;
  if (isDuplicate(comboKey, message)) {
    return false;
  }

  return await sendTelegramMessageLong(message);
}

export default {
  sendTelegramMessage,
  publishPredictionToTelegram,
  publishDailySummaryToTelegram,
  publishValueBetsToTelegram,
  publishKamikazeToTelegram,
  publishLiveAlertToTelegram,
  publishResultsToTelegram,
  publishDailyResultsToTelegram,
  publishKamikazeBilanToTelegram,
  publishMonthlyResultsToTelegram,
  publishComboToTelegram,
  getTelegramChatId,
  testTelegramConnection,
  isSafeOrModerate,
  isKamikaze,
  selectTopDailyPredictions,
  capKamikazePerSport,
  sortKamikazePicks,
};
