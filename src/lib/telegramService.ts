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
const MAX_RISK_PERCENTAGE = 50; // Kamikaze: risque >= 51%
const KAMIKAZE_MIN_RISK = 51; // Kamikaze: risque >= 51%
const MAX_DAILY_PREDICTIONS = 10; // Maximum 10 pronostics par jour
// 🎯 CRITÈRES RESSERRÉS (juillet 2026) — risque max 40%, confiance medium+ requise
const TIGHT_MAX_RISK = 40; // Au lieu de 50 — exclut les modérés trop risqués
const MIN_WIN_PROBABILITY = 58; // Probabilité min du favori (au lieu de 55)

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
  // Format : "Victoire (72%) · V/N: 78%" — le parieur voit les 2 options
  // Le football a TOUJOURS un nul possible, même si ESPN ne fournit pas la cote de nul
  if (isFootballMatch(sport) && oddsHome && oddsAway) {
    const probs = calcImpliedProbs(oddsHome, oddsDraw, oddsAway, sport);
    if (predictedResult === 'home' || predictedResult === 'away') {
      const isHome = predictedResult === 'home';
      const purePct = isHome ? probs.home : probs.away;
      const vnPct = isHome ? probs.homeOrDraw : probs.awayOrDraw;
      return `Victoire (${purePct}%) · V/N: ${vnPct}%`;
    } else if (predictedResult === 'draw') {
      return `Match Nul (${probs.draw || 0}%)`;
    }
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
  const betLabel = getBetOption(m.predictedResult, m.sport, m.oddsHome, m.oddsDraw, m.oddsAway, m.homeTeam, m.awayTeam);
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
  // 1) Filtrer: cotes réelles uniquement
  const withRealOdds = predictions.filter(p => !p.isEstimated);
  const excludedEstimated = predictions.length - withRealOdds.length;
  
  // 2) CRITÈRES RESSERRÉS: risque ≤ 40% (au lieu de 50%)
  const underRisk = withRealOdds.filter(p => (p.riskPercentage ?? 100) <= TIGHT_MAX_RISK);
  const excludedRisk = withRealOdds.length - underRisk.length;
  
  // 3) Confiance minimum: proba ≥ 58% (exclut les trop serrés)
  const withConfidence = underRisk.filter(p => {
    const wp = p.winProbability ?? (100 - (p.riskPercentage ?? 50));
    return wp >= MIN_WIN_PROBABILITY;
  });
  
  // 4) Exclure les matchs internationaux (fiabilité réduite)
  const domesticOnly = withConfidence.filter(p => !(p as any).isInternational);
  
  // 5) Trier par fiabilité: risque croissant (plus fiable en premier)
  // En cas d'égalité: probabilité de réussite décroissante
  const sorted = [...domesticOnly].sort((a, b) => {
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
  
  return { selected, totalEligible: sorted.length, excludedEstimated, excludedRisk, excludedByLimit };
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
  
  let statsLine = `📊 <b>${filtered.length}</b> pronostic${filtered.length > 1 ? 's' : ''} (top ${totalEligible})`;
  statsLine += `  ·  🟢 ${safeCount}  ·  🟡 ${moderateCount}`;
  if (valueBetsCount > 0) statsLine += `  ·  💎 ${valueBetsCount}`;
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
    const betOption = getBetOption(m.predictedResult, m.sport, m.oddsHome, m.oddsDraw, m.oddsAway, m.homeTeam, m.awayTeam);
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
    const betOption = getBetOption(m.predictedResult, m.sport, m.oddsHome, m.oddsDraw, m.oddsAway, m.homeTeam, m.awayTeam);
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
    oddsHome?: number;
    oddsDraw?: number | null;
    oddsAway?: number;
    predictedResult?: string;
  }>;
}

/**
 * Récupère les résultats d'une date donnée depuis Supabase
 * Cherche sur la date visée + le lendemain pour inclure les matchs MLB de nuit US
 * (un match à 22h ET = 02h UTC le lendemain → match_date le lendemain)
 */
async function fetchDailyResultsFromSupabase(dateISO?: string): Promise<DailyResultSummary> {
  const targetDate = dateISO || (() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  })();

  // Chercher sur 2 jours : la date visée + le lendemain (matchs de nuit UTC)
  const nextDay = (() => {
    const d = new Date(targetDate + 'T12:00:00Z');
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();

  const [dayPreds, nextDayPreds] = await Promise.all([
    SupabaseStore.getPredictionsByDate(targetDate),
    SupabaseStore.getPredictionsByDate(nextDay),
  ]);

  // Fusionner en dédupliquant par match_id (priorité au jour principal)
  const seen = new Set<string>();
  const allDayPredictions: any[] = [];
  for (const p of [...dayPreds, ...nextDayPreds]) {
    if (!seen.has(p.match_id)) {
      seen.add(p.match_id);
      allDayPredictions.push(p);
    }
  }

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
    // ⚠️ FILTRER : uniquement Safe + Modéré (risk_percentage <= 50)
    // Le bilan journalier ne concerne PAS les kamikazes
    const dayPredictions = allDayPredictions.filter(p => (p.risk_percentage ?? 100) <= 50);
    if (dayPredictions.length === 0) return emptySummary;

    const summary: DailyResultSummary = {
      ...emptySummary,
      totalPredictions: dayPredictions.length,
    };

    // Grouper par sport et calculer les stats
    let totalStakes = 0;
    let totalProfit = 0;

    for (const p of dayPredictions) {
      // ⚠️ Normaliser le sport (anciennes données pouvant avoir 'foot', 'basket', 'nhl')
      let sport = (p.sport || 'other').toLowerCase();
      // Normalisation des variantes
      if (sport === 'foot' || sport === 'soccer') sport = 'football';
      else if (sport === 'basket' || sport === 'nba') sport = 'basketball';
      else if (sport === 'nhl') sport = 'hockey';
      else if (sport === 'mlb') sport = 'baseball';

      // ⚠️ Inférer le vrai sport à partir du league si sport='other'
      if (sport === 'other' && p.league) {
        const league = p.league.toLowerCase();
        if (league.includes('mlb') || league.includes('baseball')) sport = 'baseball';
        else if (league.includes('nba') || league.includes('basketball')) sport = 'basketball';
        else if (league.includes('nhl') || league.includes('hockey')) sport = 'hockey';
        else if (league.includes('atp') || league.includes('wta') || league.includes('tennis')) sport = 'tennis';
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

    // Calcul des séries (streaks) par sport — requête optimisée Supabase (status=completed + result_match non null)
    try {
      const completed = await SupabaseStore.getRecentCompletedPredictions(500);
      // Déjà triés par date décroissante via la requête Supabase

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
    'football': '⚽', 'basketball': '🏀', 'hockey': '🏒', 'tennis': '🎾', 'baseball': '⚾', 'other': '🏟️',
  };
  const sportNames: Record<string, string> = {
    'football': 'Football', 'basketball': 'Basket', 'hockey': 'Hockey', 'tennis': 'Tennis', 'baseball': 'Baseball', 'other': 'Autres',
  };
  const sportPriority: Record<string, number> = {
    'football': 1, 'basketball': 2, 'hockey': 3, 'tennis': 4, 'baseball': 5, 'other': 99,
  };
  const sortedSports = Object.keys(summary.bySport).sort((a, b) => (sportPriority[a] || 99) - (sportPriority[b] || 99));

  let message = '';

  // En-tête
  message += '╔═════════════════════════════╗\n';
  message += '║\n';
  message += '║   📊 <b>BILAN JOURNALIER</b>\n';
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

      // Ne montrer que les sports qui ont au moins 1 match terminé
      if (verified === 0) continue;

      // Séparateur visuel entre les sports
      if (si > 0) {
        message += '───────────────────────────\n';
      }

      // Indicateur de performance
      const sportEmoji = s.winRate >= 60 ? '🏆' : s.winRate >= 40 ? '📊' : '📉';
      message += `${emoji} <b>${name}</b> ${sportEmoji}\n`;

      // Ligne principale: X/Y corrects · Z%
      message += `    ✅ ${s.wins}/${verified} corrects  ·  <b>${s.winRate}%</b>\n`;

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
  // RÉSULTAT GLOBAL (uniquement les terminés)
  // =============================================
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  const globalEmoji = summary.winRate >= 60 ? '🏆' : summary.winRate >= 40 ? '📊' : '📉';
  message += `${globalEmoji} <b>RÉSULTAT GLOBAL</b>\n`;
  message += `    ✅ ${summary.wins}/${summary.totalVerified} corrects`;
  if (summary.totalVerified > 0) message += `  ·  <b>${summary.winRate}%</b>`;
  message += '\n';

  // ROI (rendement) global
  if (summary.totalVerified > 0 && summary.profitUnits !== 0) {
    const roiSign = summary.roi >= 0 ? '+' : '';
    const profitSign = summary.profitUnits >= 0 ? '+' : '';
    const roiEmoji = summary.roi >= 0 ? '💰' : '📉';
    message += `    ${roiEmoji} ROI: <b>${roiSign}${summary.roi}%</b> (${profitSign}${summary.profitUnits.toFixed(2)}u)\n`;
  }
  message += '\n';

  // =============================================
  // DÉTAILS PAR MATCH — UNIQUEMENT LES TERMINÉS
  // =============================================
  const completedDetails = summary.details.filter(d => d.status === 'completed');
  if (completedDetails.length > 0) {
    message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    message += '<b>DÉTAILS</b>\n\n';

    // Trier: par sport d'abord (ordre priorité)
    const sortedDetails = completedDetails.sort((a, b) => {
      const priorityA = sportPriority[a.sport] || 99;
      const priorityB = sportPriority[b.sport] || 99;
      return priorityA - priorityB;
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

      if (d.resultMatch !== null) {
        const resultEmoji = d.resultMatch ? '✅' : '❌';
        const actual = formatActualResult(d.actualResult, d.actualHome, d.actualAway);
        message += `    ${resultEmoji} <b>${d.predicted}</b> → <b>${actual}</b>\n`;
      } else {
        message += `    ⚠️ En attente de résultat\n`;
      }
    }
    message += '\n';
  }

  // Pied de message
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  message += '🤖 Bilan journalier · Safe & Modéré uniquement\n';
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━';

  // Envoyer le message
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
    if (allDayPredictions.length === 0) return false;

    // ⚠️ UNIQUEMENT les kamikazes (risk_percentage > 50)
    const kamikazePredictions = allDayPredictions.filter(p => (p.risk_percentage ?? 100) > 50);
    if (kamikazePredictions.length === 0) return false;

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

    const sportEmojis: Record<string, string> = { 'football': '⚽', 'basketball': '🏀', 'hockey': '🏒', 'tennis': '🎾', 'baseball': '⚾', 'other': '🏟️' };

    let message = '';
    message += '╔═════════════════════════════╗\n';
    message += '║\n';
    message += '║   💣 <b>BILAN KAMIKAZE</b>\n';
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
    
    // Filtrer: status=completed, match_date dans le mois cible
    const monthPredictions = allPredictions.filter(p => {
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
      'football': '⚽', 'basketball': '🏀', 'hockey': '🏒', 'tennis': '🎾', 'other': '🏟️',
    };
    const sportNames: Record<string, string> = {
      'football': 'Football', 'basketball': 'Basket', 'hockey': 'Hockey', 'tennis': 'Tennis', 'other': 'Autres',
    };
    const sportPriority: Record<string, number> = {
      'football': 1, 'basketball': 2, 'hockey': 3, 'tennis': 4, 'other': 99,
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
  getTelegramChatId,
  testTelegramConnection,
  isSafeOrModerate,
  isKamikaze,
  selectTopDailyPredictions,
};
