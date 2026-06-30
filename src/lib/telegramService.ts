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

// Seuils de risque
const MAX_RISK_PERCENTAGE = 50; // Safe + Modéré uniquement
const KAMIKAZE_MIN_RISK = 51; // Kamikaze: risque >= 51%

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
  // Tennis
  'Tennis': '🎾', 'tennis': '🎾',
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
  'tennis': 4,
  'mlb': 5, 'baseball': 5,
};

function getSportPriority(sport: string): number {
  const s = sport.toLowerCase();
  for (const [key, priority] of Object.entries(SPORT_PRIORITY)) {
    if (s.includes(key)) return priority;
  }
  return 99; // Autres sports à la fin
}

/** Trie les sports : Football → Basket → Hockey → Tennis → Autres */
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
 */
function formatGoalsBlock(goals: GoalsPredictionResult): string {
  const sourceIcon = goals.source === 'dixon-coles' ? '🔬' : '📊';
  
  let block = `${sourceIcon} <b>${goals.expectedGoals}</b> buts attendus (${goals.mostLikelyScore})\n`;
  
  if (goals.recommendation !== 'skip') {
    const recEmoji = goals.recommendation === 'over25' ? '⬆️' : '⬇️';
    const recLabel = goals.recommendation === 'over25' ? 'Over 2.5' : 'Under 2.5';
    const pct = goals.recommendation === 'over25' ? goals.over25 : goals.under25;
    block += `   ${recEmoji} <b>${recLabel}</b>: <b>${pct}%</b>\n`;
  } else {
    block += `   ⚖️ +2.5: ${goals.over25}%  ·  -2.5: ${goals.under25}%\n`;
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
    if (displayDate) {
      const parts = displayDate.split(',');
      if (parts.length >= 2) {
        return { date: parts[0].trim(), time: parts[1].trim() };
      }
      return { date: displayDate, time: '' };
    }
    
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return { date: 'Date inconnue', time: '' };
    }
    
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
  } catch {
    return { date: 'Date inconnue', time: '' };
  }
}

// ============================================
// ENVOI TELEGRAM
// ============================================

export async function sendTelegramMessage(text: string, options?: {
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_notification?: boolean;
}): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('⚠️ Telegram non configuré');
    return false;
  }

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

    const data = await response.json();

    if (!data.ok) {
      console.error('❌ Erreur Telegram:', data.description);
      return false;
    }

    console.log('✅ Message envoyé sur Telegram');
    return true;
  } catch (error) {
    console.error('❌ Erreur envoi Telegram:', error);
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

function getBetOption(predictedResult?: 'home' | 'away' | 'draw', sport?: string): string {
  if (!predictedResult) return '';
  
  if (isFootballMatch(sport)) {
    if (predictedResult === 'home') return '1️⃣';
    if (predictedResult === 'draw') return '❌';
    if (predictedResult === 'away') return '2️⃣';
  }
  
  if (predictedResult === 'home') return '1️⃣';
  if (predictedResult === 'away') return '2️⃣';
  
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
    const betOption = getBetOption(prediction.predictedResult, prediction.sport);
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
    const riskEmoji = prediction.riskPercentage <= 30 ? '🟢' : '🟡';
    const riskLabel = prediction.riskPercentage <= 30 ? 'SAFE' : 'MODÉRÉ';
    const probEmoji = winProb >= 70 ? '🔥' : winProb >= 50 ? '✅' : '⚡';
    message += `${probEmoji} <b>CHANCE: ${winProb}%</b>  ·  ${riskEmoji} <b>${riskLabel}</b>\n`;
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
  const { time } = formatDateTime(m.date, m.displayDate);
  const isFootball = isFootballMatch(m.sport);
  const winProb = m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : 50);
  const riskEmoji = (m.riskPercentage || 100) <= 30 ? '🟢' : '🟡';
  const riskLabel = (m.riskPercentage || 100) <= 30 ? 'Safe' : 'Modéré';
  const betLabel = getBetOption(m.predictedResult, m.sport);
  const dateDisplay = m.dateTag && m.dateTag !== "aujourd'hui" ? ` [${m.dateTag.toUpperCase()}]` : '';

  let block = '';

  // Séparateur + titre
  block += '───────────────────────────\n';
  block += `<b>${index}.</b> ${m.homeTeam} vs ${m.awayTeam}${dateDisplay}\n`;

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

  // Prédiction de buts (football uniquement)
  if (isFootball && includeGoals && m.oddsHome && m.oddsAway && !m.isEstimated && m.league) {
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

  block += '\n';
  return block;
}

// ============================================
// PUBLICATION RÉSUMÉ QUOTIDIEN
// ============================================

export async function publishDailySummaryToTelegram(predictions: TelegramMatch[]): Promise<boolean> {
  // Filtrer safe et modéré
  const filtered = predictions.filter(p => isSafeOrModerate(p.riskPercentage));
  
  // CAS: Des matchs existent mais aucun safe/modéré → Afficher Kamikaze direct
  if (filtered.length === 0 && predictions.length > 0) {
    console.log('⚠️ Aucun pronostic safe/modéré - affichage Kamikaze direct');
    return publishKamikazeOnlyMessage(predictions);
  }
  
  if (filtered.length === 0) {
    console.log('⚠️ Aucun pronostic à publier');
    return false;
  }

  const today = new Date().toLocaleDateString('fr-FR', { 
    weekday: 'long', day: 'numeric', month: 'long' 
  });

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
  
  // En-tête
  message += '╔═════════════════════════════╗\n';
  message += '║\n';
  message += '║   📢 <b>PRONOSTICS DU JOUR</b>\n';
  message += '║\n';
  message += '╚═════════════════════════════╝\n\n';
  
  message += `📅 ${today.charAt(0).toUpperCase() + today.slice(1)}\n\n`;
  
  let statsLine = `📊 <b>${filtered.length}</b> pronostic${filtered.length > 1 ? 's' : ''}`;
  statsLine += `  ·  🟢 ${safeCount}  ·  🟡 ${moderateCount}`;
  if (valueBetsCount > 0) statsLine += `  ·  💎 ${valueBetsCount}`;
  message += `${statsLine}\n\n`;
  
  // Détail par sport (ordonné : Foot en premier)
  for (const sport of sortedSports) {
    const matches = bySport[sport];
    const emoji = SPORT_EMOJIS[sport] || '🏟️';

    message += `${emoji} <b>${sport.toUpperCase()}</b> — ${matches.length} match${matches.length > 1 ? 's' : ''}\n\n`;
    
    for (let i = 0; i < Math.min(matches.length, 10); i++) {
      const block = await formatMatchBlock(matches[i], i + 1, true);
      message += block;
    }
    
    if (matches.length > 10) {
      message += `<i>... et ${matches.length - 10} autres match${matches.length - 10 > 1 ? 's' : ''}</i>\n\n`;
    }
  }
  
  // Pied de message
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  message += '🟢 Safe (faible risque)  ·  🟡 Modéré (risque moyen)\n';
  message += 'Chance = probabilité de réussite du pronostic\n';
  message += '🔬 = Dixon-Coles (stats classement)  ·  📊 = Poisson (cotes)\n';
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━';

  return sendTelegramMessageLong(message);
}

/**
 * Message spécial quand aucun safe/modéré : affiche les Kamikaze disponibles
 */
async function publishKamikazeOnlyMessage(predictions: TelegramMatch[]): Promise<boolean> {
  const kamikazePicks = predictions.filter(p => isKamikaze(p.riskPercentage));

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  let message = '';
  message += '╔═════════════════════════════╗\n';
  message += '║\n';
  message += '║   📢 <b>PRONOSTICS DU JOUR</b>\n';
  message += '║\n';
  message += '╚═════════════════════════════╝\n\n';

  message += `📅 ${today.charAt(0).toUpperCase() + today.slice(1)}\n\n`;

  message += `⚠️ <b>AUCUN PRONOSTIC SAFE/MODÉRÉ</b>\n\n`;
  message += `📊 <b>${predictions.length} match${predictions.length > 1 ? 's' : ''} analysé${predictions.length > 1 ? 's' : ''}</b>\n`;
  message += `    mais aucun ne répond aux critères:\n`;
  message += `    🟢 Safe (risque ≤ 30%)\n`;
  message += `    🟡 Modéré (risque 31-50%)\n\n`;

  if (kamikazePicks.length > 0) {
    // Trier par sport (Football en premier)
    kamikazePicks.sort((a, b) => getSportPriority(a.sport) - getSportPriority(b.sport));

    message += '───────────────────────────\n';
    message += `💣 <b>SÉLECTION KAMIKAZE</b> — ${kamikazePicks.length} opportunité${kamikazePicks.length > 1 ? 's' : ''}\n`;
    message += '───────────────────────────\n\n';
    message += `⚠️ <b>HAUT RISQUE - HAUTE RÉCOMPENSE</b>\n\n`;

    for (let i = 0; i < Math.min(kamikazePicks.length, 5); i++) {
      message += await formatMatchBlock(kamikazePicks[i], i + 1, true);
    }

    if (kamikazePicks.length > 5) {
      message += `<i>... et ${kamikazePicks.length - 5} autres</i>\n\n`;
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

  return sendTelegramMessageLong(message);
}

// ============================================
// PUBLICATION VALUE BETS
// ============================================

export async function publishValueBetsToTelegram(predictions: TelegramMatch[]): Promise<boolean> {
  const valueBets = predictions.filter(p => 
    p.valueBetDetected && 
    p.confidence !== 'low' && 
    isSafeOrModerate(p.riskPercentage)
  );

  if (valueBets.length === 0) {
    console.log('⚠️ Aucun value bet safe/modéré');
    return false;
  }

  // Trier : Football en premier
  valueBets.sort((a, b) => getSportPriority(a.sport) - getSportPriority(b.sport));

  let message = '';
  
  message += '╔════════════════════════╗\n';
  message += `║   💎 <b>VALUE BETS DU JOUR</b>   ║\n`;
  message += '╚════════════════════════╝\n\n';
  
  message += `🔥 <b>${valueBets.length} opportunité${valueBets.length > 1 ? 's' : ''} détectée${valueBets.length > 1 ? 's' : ''}</b>\n\n`;

  for (let i = 0; i < Math.min(valueBets.length, 5); i++) {
    const m = valueBets[i];
    const sportEmoji = SPORT_EMOJIS[m.sport] || '🏟️';
    const { time } = formatDateTime(m.date, m.displayDate);
    const winProb = m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : 50);
    const betOption = getBetOption(m.predictedResult, m.sport);
    const riskEmoji = (m.riskPercentage || 100) <= 30 ? '🟢' : '🟡';
    const riskLabel = (m.riskPercentage || 100) <= 30 ? 'Safe' : 'Modéré';
    
    message += '━━━━━━━━━━━━━━━━━━━━━\n';
    message += `<b>${i + 1}. ${m.homeTeam} vs ${m.awayTeam}</b>\n`;
    message += `${sportEmoji} ${m.sport}`;
    if (m.league) message += ` | ${m.league}`;
    message += `\n`;
    
    if (time) message += `⏰ ${time}  ·  `;
    message += `🎯 ${betOption} <b>${m.recommendation || 'N/A'}</b>\n`;
    
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

  return sendTelegramMessageLong(message);
}

// ============================================
// PUBLICATION KAMIKAZE
// ============================================

export async function publishKamikazeToTelegram(predictions: TelegramMatch[]): Promise<boolean> {
  const kamikazePicks = predictions.filter(p => isKamikaze(p.riskPercentage));

  if (kamikazePicks.length === 0) {
    console.log('⚠️ Aucun pronostic Kamikaze à publier');
    return false;
  }

  // Trier par cote décroissante, puis football en premier
  kamikazePicks.sort((a, b) => {
    const oddsA = a.oddsHome && a.oddsAway ? Math.max(a.oddsHome, a.oddsAway) : 0;
    const oddsB = b.oddsHome && b.oddsAway ? Math.max(b.oddsHome, b.oddsAway) : 0;
    if (oddsB !== oddsA) return oddsB - oddsA;
    return getSportPriority(a.sport) - getSportPriority(b.sport);
  });

  let message = '';

  message += '╔════════════════════════╗\n';
  message += `║ 💣 <b>SÉLECTION KAMIKAZE</b>  ║\n`;
  message += '╚════════════════════════╝\n\n';

  message += `⚠️ <b>HAUT RISQUE - HAUTE RÉCOMPENSE</b>\n`;
  message += `🔥 <b>${kamikazePicks.length} opportunité${kamikazePicks.length > 1 ? 's' : ''} à gros potentiel</b>\n\n`;

  for (let i = 0; i < Math.min(kamikazePicks.length, 5); i++) {
    const m = kamikazePicks[i];
    const sportEmoji = SPORT_EMOJIS[m.sport] || '🏟️';
    const { time } = formatDateTime(m.date, m.displayDate);
    const winProb = m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : 50);
    const maxOdds = m.oddsHome && m.oddsAway ? Math.max(m.oddsHome, m.oddsAway) : 0;
    const betOption = getBetOption(m.predictedResult, m.sport);
    const isFootball = isFootballMatch(m.sport);

    message += '━━━━━━━━━━━━━━━━━━━━━\n';
    message += `<b>${i + 1}. ${m.homeTeam} vs ${m.awayTeam}</b>\n`;
    message += `${sportEmoji} ${m.sport}`;
    if (m.league) message += ` | ${m.league}`;
    message += `\n`;

    if (time) message += `⏰ ${time}  ·  `;
    message += `🎯 ${betOption} <b>${m.recommendation || 'N/A'}</b>\n`;

    if (m.oddsHome && m.oddsAway) {
      message += `📊 Cotes: 1:<b>${m.oddsHome.toFixed(2)}</b>`;
      if (m.oddsDraw) message += ` X:<b>${m.oddsDraw.toFixed(2)}</b>`;
      message += ` 2:<b>${m.oddsAway.toFixed(2)}</b>\n`;
    }

    message += `💥 <b>Kamikaze</b> — Chance: <b>${winProb}%</b>\n`;
    message += `💰 Gain potentiel: <b>x${maxOdds.toFixed(2)}</b>\n`;
    
    // Buts pour le football kamikaze aussi
    if (isFootball && m.oddsHome && m.oddsAway && !m.isEstimated && m.league) {
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
    
    message += '\n';
  }

  message += `━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `⚠️ <b>ATTENTION</b>\n`;
  message += `Ces pronostics sont très risqués.\n`;
  message += `Ne pariez que ce que vous pouvez perdre.\n`;

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
  }>;
}

/**
 * Récupère les résultats d'une date donnée depuis Supabase
 */
async function fetchDailyResultsFromSupabase(dateISO?: string): Promise<DailyResultSummary> {
  const targetDate = dateISO || (() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  })();

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
    details: [],
  };

  try {
    // Récupérer les prédictions du jour (pending + completed)
    const predictions = await SupabaseStore.getAllPredictions(2000);
    if (!predictions || predictions.length === 0) return emptySummary;

    // Filtrer par date cible (match_date du jour visé)
    const dayPredictions = predictions.filter(p => {
      const matchDate = (p.match_date || '').split('T')[0];
      return matchDate === targetDate;
    });

    if (dayPredictions.length === 0) return emptySummary;

    const summary: DailyResultSummary = {
      ...emptySummary,
      totalPredictions: dayPredictions.length,
    };

    // Grouper par sport et calculer les stats
    let totalStakes = 0;
    let totalProfit = 0;

    for (const p of dayPredictions) {
      const sport = p.sport || 'other';
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
        }

        if (p.goals_match === true) summary.goalsWins++;
        if (p.goals_match === false) summary.goalsLosses++;
      }

      // Détail du match
      const predictedLabel = formatPredictedResult(p.predicted_result);
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

    // Calcul des séries (streaks) par sport — à partir de l'historique récent
    try {
      const recentPredictions = await SupabaseStore.getAllPredictions(2000);
      // Ne garder que les complétés, triés par date décroissante
      const completed = recentPredictions
        .filter((p: DbPrediction) => p.status === 'completed' && p.result_match !== null && p.result_match !== undefined)
        .sort((a: DbPrediction, b: DbPrediction) => (a.match_date > b.match_date ? -1 : 1));

      const sportStreaks: Record<string, { type: 'win' | 'loss' | 'none'; count: number }> = {};
      for (const p of completed) {
        const sport = p.sport || 'other';
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

function formatPredictedResult(result?: string): string {
  if (!result) return 'N/A';
  switch (result) {
    case 'home': return 'Victoire Domicile (1)';
    case 'draw': return 'Match Nul (X)';
    case 'away': return 'Victoire Extérieur (2)';
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
 * Format: ⚽ Foot 2/3 · 🏀 Basket 4/4 ... avec détails par match.
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

  let message = '';

  // En-tête
  message += '╔═════════════════════════════╗\n';
  message += '║\n';
  message += '║   📊 <b>BILAN DES PRONOSTICS</b>\n';
  message += '║\n';
  message += '╚═════════════════════════════╝\n\n';
  message += `📅 <b>${dateLabel}</b>\n\n`;

  // Résumé global
  const globalEmoji = summary.winRate >= 60 ? '🏆' : summary.winRate >= 40 ? '📊' : '📉';
  message += `${globalEmoji} <b>RÉSULTAT GLOBAL</b>\n`;
  message += `    ✅ ${summary.wins}/${summary.totalVerified} corrects`;
  if (summary.totalVerified > 0) message += `  ·  <b>${summary.winRate}%</b>`;
  message += '\n';

  // ROI (rendement)
  if (summary.totalVerified > 0 && summary.profitUnits !== 0) {
    const roiSign = summary.roi >= 0 ? '+' : '';
    const profitSign = summary.profitUnits >= 0 ? '+' : '';
    const roiEmoji = summary.roi >= 0 ? '💰' : '📉';
    message += `    ${roiEmoji} ROI: <b>${roiSign}${summary.roi}%</b> (${profitSign}${summary.profitUnits.toFixed(2)}u)\n`;
  }
  if (summary.totalPending > 0) {
    message += `    ⏳ ${summary.totalPending} en attente de résultat\n`;
  }
  if (summary.goalsWins + summary.goalsLosses > 0) {
    message += `    ⚽ Buts: ${summary.goalsWins}/${summary.goalsWins + summary.goalsLosses} corrects\n`;
  }
  message += '\n';

  // Résumé par sport (ordonné: football en premier)
  const sportEmojis: Record<string, string> = {
    'football': '⚽', 'basketball': '🏀', 'hockey': '🏒', 'tennis': '🎾', 'other': '🏟️',
  };
  const sportNames: Record<string, string> = {
    'football': 'Football', 'basketball': 'Basket', 'hockey': 'Hockey', 'tennis': 'Tennis', 'other': 'Autres',
  };
  const sportPriority: Record<string, number> = {
    'football': 1, 'basketball': 2, 'hockey': 3, 'tennis': 4, 'other': 99,
  };
  const sortedSports = Object.keys(summary.bySport).sort((a, b) => (sportPriority[a] || 99) - (sportPriority[b] || 99));

  // Ligne de résumé sport
  if (sortedSports.length > 0) {
    message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    message += '<b>PAR SPORT</b>\n\n';
    const sportLines: string[] = [];
    for (const sport of sortedSports) {
      const s = summary.bySport[sport];
      const emoji = sportEmojis[sport] || '🏟️';
      const name = sportNames[sport] || sport;
      if (s.pending > 0 && s.wins + s.losses === 0) {
        sportLines.push(`${emoji} ${name}: ⏳ ${s.pending} en attente`);
      } else {
        const verified = s.wins + s.losses;
        let line = `${emoji} <b>${name}</b>: ${s.wins}/${verified}`;
        // ROI par sport
        if (verified > 0 && s.profitUnits !== 0) {
          const sign = s.roi >= 0 ? '+' : '';
          line += ` (${sign}${s.roi}%)`;
        }
        sportLines.push(line);
      }
    }
    message += sportLines.join('  ·  ') + '\n';

    // Séries en cours
    if (Object.keys(summary.streaks).length > 0) {
      message += '\n';
      const streakLines: string[] = [];
      for (const sport of sortedSports) {
        const streak = summary.streaks[sport];
        if (!streak || streak.count < 2) continue;
        const emoji = sportEmojis[sport] || '🏟️';
        const name = sportNames[sport] || sport;
        if (streak.type === 'win') {
          streakLines.push(`${emoji} ${name}: 🔥 ${streak.count}V`);
        } else {
          streakLines.push(`${emoji} ${name}: ❄️ ${streak.count}D`);
        }
      }
      if (streakLines.length > 0) {
        message += `<b>SÉRIES</b>\n`;
        message += `    ${streakLines.join('  ·  ')}\n`;
      }
    }
    message += '\n';
  }

  // Détail par match
  if (summary.details.length > 0) {
    message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    message += '<b>DÉTAILS</b>\n\n';

    // Trier les détails: football en premier, puis par statut (completed d'abord, pending après)
    const sortedDetails = [...summary.details].sort((a, b) => {
      const priorityA = sportPriority[a.sport] || 99;
      const priorityB = sportPriority[b.sport] || 99;
      if (priorityA !== priorityB) return priorityA - priorityB;
      const statusOrder: Record<string, number> = { completed: 0, pending: 1, cancelled: 2, postponed: 3 };
      return (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
    });

    for (const d of sortedDetails) {
      const emoji = sportEmojis[d.sport] || '🏟️';
      const isVerified = d.status === 'completed';
      const isPending = d.status === 'pending';

      message += `${emoji} ${d.homeTeam} vs ${d.awayTeam}\n`;

      if (isVerified && d.resultMatch !== null) {
        const resultEmoji = d.resultMatch ? '✅' : '❌';
        const actual = formatActualResult(d.actualResult, d.actualHome, d.actualAway);
        message += `    ${resultEmoji} Pronostic: <b>${d.predicted}</b> → Score: <b>${actual}</b>\n`;
        // Afficher aussi la vérification des buts si applicable
        if (d.goalsMatch !== null && d.goalsMatch !== undefined) {
          const goalsEmoji = d.goalsMatch ? '✅' : '❌';
          message += `    ${goalsEmoji} Buts: ${d.predictedGoals || 'N/A'} → Réel: ${d.actualHome ?? '?'}-${d.actualAway ?? '?'}\n`;
        }
      } else if (isPending) {
        message += `    ⏳ En attente — Pronostic: ${d.predicted}\n`;
      } else {
        message += `    ⚠️ ${d.status}\n`;
      }

      message += '\n';
    }
  }

  // Pied de message
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  message += '🤖 Bilan automatique après vérification\n';
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━';

  return sendTelegramMessageLong(message);
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
  getTelegramChatId,
  testTelegramConnection,
  isSafeOrModerate,
  isKamikaze,
};
