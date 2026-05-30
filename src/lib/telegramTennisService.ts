/**
 * Telegram Tennis Service - Publication des pronostics tennis améliorés
 * 
 * Intégré avec l'API tennis-enhanced:
 * - Facteur d'importance des tournois
 * - Classements ATP/WTA réels
 * - Protection anti-ban
 */

import { sendTelegramMessage, isSafeOrModerate, getRiskLabel } from './telegramService';

// ============================================
// INTERFACES
// ============================================

interface TennisPrediction {
  matchId: string;
  player1: string;
  player2: string;
  tournament: string;
  tournamentTier: string;
  tournamentImportance: number;
  surface: string;
  round: string;
  date: string;
  odds1: number;
  odds2: number;
  category: string;
  prediction: {
    winner: 'player1' | 'player2';
    winnerName: string;
    winProbability: number;
    confidence: 'very_high' | 'high' | 'medium' | 'low';
    riskPercentage: number;
  };
  betting: {
    recommendedBet: boolean;
    kellyStake: number;
    winnerOdds: number;
    expectedValue: number;
    valueRating: 'excellent' | 'good' | 'fair' | 'poor';
  };
  analysis: string;
  keyInsights: string[];
  warnings: string[];
}

// ============================================
// CONFIGURATION
// ============================================

// Emojis par type de tournoi
const TIER_EMOJIS: Record<string, string> = {
  'grand_slam': '🏆',
  'masters_1000': '🥇',
  'wta_1000': '🥇',
  'atp_500': '🥈',
  'wta_500': '🥈',
  'atp_250': '🥉',
  'wta_250': '🥉',
  'challenger_175': '🎖️',
  'challenger_125': '🎖️',
  'challenger_100': '🎖️',
  'challenger_75': '🎖️',
  'challenger_50': '🎖️',
  'itf': '🎾',
  'unknown': '🎾',
};

// Noms display des tiers
const TIER_NAMES: Record<string, string> = {
  'grand_slam': 'GRAND CHELEM',
  'masters_1000': 'MASTERS 1000',
  'wta_1000': 'WTA 1000',
  'atp_500': 'ATP 500',
  'wta_500': 'WTA 500',
  'atp_250': 'ATP 250',
  'wta_250': 'WTA 250',
  'challenger_175': 'CHALLENGER 175',
  'challenger_125': 'CHALLENGER 125',
  'challenger_100': 'CHALLENGER 100',
  'challenger_75': 'CHALLENGER 75',
  'challenger_50': 'CHALLENGER 50',
  'itf': 'ITF',
  'unknown': 'TOURNOI',
};

// Emojis par surface
const SURFACE_EMOJIS: Record<string, string> = {
  'hard': '🏛️',
  'clay': '🟤',
  'grass': '🌿',
  'indoor': '🏠',
};

// Emojis de confiance
const CONFIDENCE_EMOJIS: Record<string, string> = {
  'very_high': '🔥',
  'high': '✅',
  'medium': '⚡',
  'low': '⚠️',
};

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

function createProgressBar(percentage: number, length: number = 10): string {
  const filled = Math.round((percentage / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function formatDateTime(dateStr: string): { date: string; time: string } {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return { date: 'Date inconnue', time: '' };
    }
    
    const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 
                        'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    
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

function isMajorTournament(tier: string): boolean {
  return ['grand_slam', 'masters_1000', 'wta_1000'].includes(tier);
}

// ============================================
// FORMATAGE DES MESSAGES
// ============================================

/**
 * Formate un pronostic tennis individuel
 */
function formatTennisPrediction(prediction: TennisPrediction): string {
  const tierEmoji = TIER_EMOJIS[prediction.tournamentTier] || '🎾';
  const tierName = TIER_NAMES[prediction.tournamentTier] || 'TOURNOI';
  const surfaceEmoji = SURFACE_EMOJIS[prediction.surface] || '🏟️';
  const confidenceEmoji = CONFIDENCE_EMOJIS[prediction.prediction.confidence] || '⚡';
  
  const { date, time } = formatDateTime(prediction.date);
  
  let message = '';
  
  // En-tête avec importance du tournoi
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  
  if (isMajorTournament(prediction.tournamentTier)) {
    message += `⭐ <b>${tierEmoji} ${tierName}</b> ⭐\n`;
  } else {
    message += `${tierEmoji} <b>${tierName}</b>\n`;
  }
  
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  
  // Tournoi et surface
  message += `🏆 <b>${prediction.tournament}</b>\n`;
  message += `${surfaceEmoji} Surface: <b>${prediction.surface.toUpperCase()}</b>`;
  if (prediction.round && prediction.round !== 'Match') {
    message += ` | 📋 ${prediction.round}`;
  }
  message += '\n\n';
  
  // Match
  message += `👤 <b>${prediction.player1}</b>\n`;
  message += `    <b>VS</b>\n`;
  message += `👤 <b>${prediction.player2}</b>\n\n`;
  
  // Date et heure
  message += `📅 ${date}`;
  if (time) message += ` | ⏰ <b>${time}</b>`;
  message += '\n\n';
  
  // Cotes
  message += `📊 <b>COTES</b>\n`;
  message += `    1️⃣ ${prediction.odds1.toFixed(2)}  |  2️⃣ ${prediction.odds2.toFixed(2)}\n\n`;
  
  // Pronostic
  message += `🎯 <b>PRONOSTIC</b>\n`;
  message += `    ▶️ <b>${prediction.prediction.winnerName}</b>\n\n`;
  
  // Probabilité avec barre
  message += `${confidenceEmoji} <b>CONFIANCE: ${prediction.prediction.confidence.toUpperCase()}</b>\n`;
  message += `    ${createProgressBar(prediction.prediction.winProbability)} <b>${prediction.prediction.winProbability}%</b>\n\n`;
  
  // Risque
  const riskEmoji = prediction.prediction.riskPercentage <= 30 ? '🟢' : 
                    prediction.prediction.riskPercentage <= 50 ? '🟡' : '🔴';
  const riskLabel = getRiskLabel(prediction.prediction.riskPercentage);
  message += `${riskEmoji} <b>RISQUE: ${riskLabel.toUpperCase()}</b> (${prediction.prediction.riskPercentage}%)\n`;
  
  // Betting recommendation
  if (prediction.betting.recommendedBet) {
    message += `💰 <b>PARI RECOMMANDÉ</b>\n`;
    message += `    Cote: ${prediction.betting.winnerOdds.toFixed(2)} | EV: ${prediction.betting.expectedValue > 0 ? '+' : ''}${prediction.betting.expectedValue}%\n`;
  }
  
  // Insights
  if (prediction.keyInsights.length > 0) {
    message += `\n💡 <b>POINTS CLÉS</b>\n`;
    prediction.keyInsights.slice(0, 3).forEach(insight => {
      message += `    • ${insight}\n`;
    });
  }
  
  // Warnings
  if (prediction.warnings.length > 0) {
    message += `\n⚠️ <b>ATTENTION</b>\n`;
    prediction.warnings.slice(0, 2).forEach(warning => {
      message += `    • ${warning}\n`;
    });
  }
  
  return message;
}

/**
 * Formate un résumé de plusieurs pronostics tennis
 */
function formatTennisSummary(predictions: TennisPrediction[]): string {
  // Filtrer safe et modéré
  const filtered = predictions.filter(p => isSafeOrModerate(p.prediction.riskPercentage));
  
  if (filtered.length === 0) {
    return '';
  }
  
  const today = new Date().toLocaleDateString('fr-FR', { 
    weekday: 'long', day: 'numeric', month: 'long' 
  });
  
  // Stats
  const majorTournaments = filtered.filter(p => isMajorTournament(p.tournamentTier));
  const safeCount = filtered.filter(p => p.prediction.riskPercentage <= 30).length;
  const moderateCount = filtered.length - safeCount;
  const recommendedBets = filtered.filter(p => p.betting.recommendedBet).length;
  
  // Grouper par tier
  const byTier: Record<string, TennisPrediction[]> = {};
  filtered.forEach(p => {
    const tier = p.tournamentTier;
    if (!byTier[tier]) byTier[tier] = [];
    byTier[tier].push(p);
  });
  
  let message = '';
  
  // En-tête
  message += '╔════════════════════════════╗\n';
  message += `║  🎾 <b>PRONOSTICS TENNIS</b>     ║\n`;
  message += '╚════════════════════════════╝\n\n';
  
  message += `📅 <b>${today.charAt(0).toUpperCase() + today.slice(1)}</b>\n\n`;
  
  // Stats globales
  message += `🎯 <b>${filtered.length} PRONOSTICS</b>\n`;
  message += `    🟢 Safe: ${safeCount}\n`;
  message += `    🟡 Modéré: ${moderateCount}\n`;
  if (majorTournaments.length > 0) {
    message += `    ⏎ Grands tournois: ${majorTournaments.length}\n`;
  }
  if (recommendedBets > 0) {
    message += `    💰 Paris recommandés: ${recommendedBets}\n`;
  }
  message += '\n';
  
  // Trier les tiers par importance
  const sortedTiers = Object.keys(byTier).sort((a, b) => {
    const orderA = getTierOrder(a);
    const orderB = getTierOrder(b);
    return orderA - orderB;
  });
  
  // Afficher par tier
  for (const tier of sortedTiers) {
    const matches = byTier[tier];
    const tierEmoji = TIER_EMOJIS[tier] || '🎾';
    const tierName = TIER_NAMES[tier] || 'Tournoi';
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    
    if (isMajorTournament(tier)) {
      message += `⭐ <b>${tierEmoji} ${tierName}</b> ⭐ (${matches.length})\n`;
    } else {
      message += `${tierEmoji} <b>${tierName}</b> (${matches.length})\n`;
    }
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    // Lister les matchs
    matches.slice(0, 5).forEach((m, i) => {
      const { time } = formatDateTime(m.date);
      const riskEmoji = m.prediction.riskPercentage <= 30 ? '🟢' : '🟡';
      const surfaceEmoji = SURFACE_EMOJIS[m.surface] || '🏟️';
      
      message += `<b>${i + 1}.</b> ${m.player1} vs ${m.player2}\n`;
      message += `    🏆 ${m.tournament} ${surfaceEmoji}\n`;
      if (time) message += `    ⏰ ${time}`;
      message += ` | 🎯 <b>${m.prediction.winnerName}</b>\n`;
      message += `    ${riskEmoji} ${m.prediction.winProbability}% réussite\n\n`;
    });
    
    if (matches.length > 5) {
      message += `    <i>... et ${matches.length - 5} autres</i>\n\n`;
    }
  }
  
  // Pied de message
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  message += '🟢 Safe: Risque ≤ 30%\n';
  message += '🟡 Modéré: Risque 31-50%\n';
  message += '⏎ Grand Chelem, Masters 1000, WTA 1000\n';
  
  return message;
}

function getTierOrder(tier: string): number {
  const order: Record<string, number> = {
    'grand_slam': 1,
    'masters_1000': 2,
    'wta_1000': 2,
    'atp_500': 3,
    'wta_500': 3,
    'atp_250': 4,
    'wta_250': 4,
    'challenger_175': 5,
    'challenger_125': 6,
    'challenger_100': 7,
    'challenger_75': 8,
    'challenger_50': 9,
    'itf': 10,
    'unknown': 11,
  };
  return order[tier] || 99;
}

// ============================================
// FONCTIONS DE PUBLICATION
// ============================================

/**
 * Publie un pronostic tennis individuel
 */
export async function publishTennisPrediction(prediction: TennisPrediction): Promise<boolean> {
  // Vérifier que c'est safe ou modéré
  if (!isSafeOrModerate(prediction.prediction.riskPercentage)) {
    console.log(`⚠️ Pronostic ${prediction.player1} vs ${prediction.player2} ignoré (risque: ${prediction.prediction.riskPercentage}%)`);
    return false;
  }
  
  const message = formatTennisPrediction(prediction);
  return sendTelegramMessage(message);
}

/**
 * Publie un résumé des pronostics tennis
 */
export async function publishTennisSummary(predictions: TennisPrediction[]): Promise<boolean> {
  const message = formatTennisSummary(predictions);
  
  if (!message) {
    console.log('⚠️ Aucun pronostic tennis safe/modéré à publier');
    return false;
  }
  
  return sendTelegramMessage(message);
}

/**
 * Publie uniquement les grands tournois
 */
export async function publishMajorTournaments(predictions: TennisPrediction[]): Promise<boolean> {
  const majorPredictions = predictions.filter(p => 
    isMajorTournament(p.tournamentTier) && 
    isSafeOrModerate(p.prediction.riskPercentage)
  );
  
  if (majorPredictions.length === 0) {
    console.log('⚠️ Aucun grand tournoi à publier');
    return false;
  }
  
  let message = '';
  
  message += '╔════════════════════════════╗\n';
  message += `║ ⭐ <b>GRANDS TOURNOIS</b> ⭐     ║\n`;
  message += '╚════════════════════════════╝\n\n';
  
  message += `🔥 <b>${majorPredictions.length} match${majorPredictions.length > 1 ? 's' : ''} majeur${majorPredictions.length > 1 ? 's' : ''}</b>\n\n`;
  
  majorPredictions.slice(0, 5).forEach((p, i) => {
    const tierEmoji = TIER_EMOJIS[p.tournamentTier] || '🏆';
    const { time } = formatDateTime(p.date);
    const riskEmoji = p.prediction.riskPercentage <= 30 ? '🟢' : '🟡';
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `${tierEmoji} <b>${p.tournament.toUpperCase()}</b>\n`;
    message += `👤 ${p.player1} vs ${p.player2}\n`;
    if (time) message += `⏰ ${time} | `;
    message += `🎯 <b>${p.prediction.winnerName}</b>\n`;
    message += `${riskEmoji} ${p.prediction.winProbability}% | Cote: ${p.betting.winnerOdds.toFixed(2)}\n\n`;
  });
  
  return sendTelegramMessage(message);
}

/**
 * Publie les value bets tennis
 */
export async function publishTennisValueBets(predictions: TennisPrediction[]): Promise<boolean> {
  const valueBets = predictions.filter(p => 
    p.betting.recommendedBet && 
    p.betting.expectedValue > 0 &&
    isSafeOrModerate(p.prediction.riskPercentage)
  );
  
  if (valueBets.length === 0) {
    console.log('⚠️ Aucun value bet tennis à publier');
    return false;
  }
  
  let message = '';
  
  message += '╔════════════════════════════╗\n';
  message += `║  💎 <b>VALUE BETS TENNIS</b>    ║\n`;
  message += '╚════════════════════════════╝\n\n';
  
  message += `🔥 <b>${valueBets.length} opportunité${valueBets.length > 1 ? 's' : ''}</b>\n\n`;
  
  valueBets.slice(0, 5).forEach((p, i) => {
    const tierEmoji = TIER_EMOJIS[p.tournamentTier] || '🎾';
    const { time } = formatDateTime(p.date);
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `<b>${i + 1}. ${p.player1} vs ${p.player2}</b>\n`;
    message += `${tierEmoji} ${p.tournament}\n`;
    if (time) message += `⏰ ${time} | `;
    message += `🎯 <b>${p.prediction.winnerName}</b>\n`;
    message += `📊 Cote: ${p.betting.winnerOdds.toFixed(2)} | EV: <b>+${p.betting.expectedValue}%</b>\n`;
    message += `🔥 Réussite: <b>${p.prediction.winProbability}%</b>\n\n`;
  });
  
  return sendTelegramMessage(message);
}

/**
 * Récupère les pronostics tennis depuis l'API
 */
export async function fetchTennisPredictions(filter?: string): Promise<TennisPrediction[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    
    const url = `${baseUrl}/api/tennis-enhanced?filter=${filter || 'all'}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('❌ Erreur récupération pronostics tennis:', response.status);
      return [];
    }
    
    const data = await response.json();
    return data.predictions || [];
  } catch (error) {
    console.error('❌ Erreur fetch tennis:', error);
    return [];
  }
}

/**
 * Job principal: publie les pronostics tennis
 */
export async function runTennisTelegramJob(options?: {
  majorOnly?: boolean;
  valueBetsOnly?: boolean;
}): Promise<{
  success: boolean;
  published: number;
  message?: string;
}> {
  try {
    console.log('🎾 Récupération des pronostics tennis...');
    
    const predictions = await fetchTennisPredictions('all');
    
    if (predictions.length === 0) {
      return { success: false, published: 0, message: 'Aucun pronostic disponible' };
    }
    
    console.log(`📊 ${predictions.length} pronostics récupérés`);
    
    let published = 0;
    
    if (options?.majorOnly) {
      // Publier uniquement les grands tournois
      const success = await publishMajorTournaments(predictions);
      if (success) published = predictions.filter(p => isMajorTournament(p.tournamentTier)).length;
    } else if (options?.valueBetsOnly) {
      // Publier uniquement les value bets
      const success = await publishTennisValueBets(predictions);
      if (success) published = predictions.filter(p => p.betting.recommendedBet).length;
    } else {
      // Publier le résumé complet
      const success = await publishTennisSummary(predictions);
      if (success) published = predictions.filter(p => isSafeOrModerate(p.prediction.riskPercentage)).length;
    }
    
    return { 
      success: published > 0, 
      published,
      message: published > 0 ? `${published} pronostics publiés` : 'Aucun pronostic publié'
    };
  } catch (error) {
    console.error('❌ Erreur job tennis:', error);
    return { success: false, published: 0, message: String(error) };
  }
}

export default {
  publishTennisPrediction,
  publishTennisSummary,
  publishMajorTournaments,
  publishTennisValueBets,
  fetchTennisPredictions,
  runTennisTelegramJob,
};
