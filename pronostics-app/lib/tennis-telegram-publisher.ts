/**
 * Tennis Telegram Publisher - Publication automatique des prédictions tennis
 * 
 * FONCTIONNALITÉS:
 * - Publication quotidienne des meilleures prédictions
 * - Alertes pour les value bets importants
 * - Résumé des tournois majeurs
 * - Rapports de performance hebdomadaires
 * 
 * Variables d'environnement requises:
 * - TELEGRAM_BOT_TOKEN
 * - TELEGRAM_CHAT_ID
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// INTERFACES
// ============================================

interface TelegramMessage {
  text: string;
  parse_mode?: 'HTML' | 'Markdown';
  disable_notification?: boolean;
}

interface TennisPrediction {
  matchId: string;
  player1: string;
  player2: string;
  tournament: string;
  surface: string;
  odds1: number;
  odds2: number;
  category: 'atp' | 'wta' | 'challenger' | 'itf';
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
  analysis: {
    rankingAdvantage: string;
    surfaceAdvantage: string;
    formAdvantage: string;
    h2hAdvantage: string;
    oddsValue: string;
  };
  keyFactors: string[];
}

interface PublishStats {
  lastPublished: string;
  totalMessages: number;
  predictionsPublished: number;
  errors: number;
}

// ============================================
// CONFIGURATION
// ============================================

const DATA_DIR = path.join(process.cwd(), 'data');
const STATS_FILE = path.join(DATA_DIR, 'telegram-publish-stats.json');
const PREDICTIONS_FILE = path.join(DATA_DIR, 'tennis-predictions.json');

const EMOJI = {
  tennis: '🎾',
  winner: '🏆',
  money: '💰',
  chart: '📊',
  fire: '🔥',
  warning: '⚠️',
  check: '✅',
  star: '⭐',
  target: '🎯',
  calendar: '📅',
  arrow: '➡️',
};

// ============================================
// TELEGRAM API
// ============================================

async function sendTelegramMessage(message: TelegramMessage): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!botToken || !chatId) {
    console.log('⚠️ Telegram credentials not configured');
    return false;
  }
  
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message.text,
        parse_mode: message.parse_mode || 'HTML',
        disable_notification: message.disable_notification || false,
      }),
    });
    
    const data = await response.json();
    
    if (!data.ok) {
      console.error('Telegram API error:', data.description);
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    return false;
  }
}

// ============================================
// MESSAGE FORMATTERS
// ============================================

function formatPredictionMessage(prediction: TennisPrediction): string {
  const winner = prediction.prediction.winner === 'player1' 
    ? prediction.player1 
    : prediction.player2;
  
  const confidenceEmoji = {
    very_high: '🔥',
    high: '⭐',
    medium: '📊',
    low: '⚠️',
  };
  
  const lines = [
    `${EMOJI.tennis} <b>TENNIS - ${prediction.tournament.toUpperCase()}</b>`,
    '',
    `<b>${prediction.player1}</b> vs <b>${prediction.player2}</b>`,
    `Surface: ${prediction.surface} | ${prediction.category.toUpperCase()}`,
    '',
    `${confidenceEmoji[prediction.prediction.confidence]} <b>PRÉDICTION: ${winner}</b>`,
    `Probabilité: ${prediction.prediction.winProbability}%`,
    `Confiance: ${prediction.prediction.confidence.toUpperCase()}`,
    '',
    `${EMOJI.chart} <b>ANALYSE:</b>`,
    `• Classement: ${prediction.analysis.rankingAdvantage}`,
    `• Surface: ${prediction.analysis.surfaceAdvantage}`,
    `• Forme: ${prediction.analysis.formAdvantage}`,
  ];
  
  if (prediction.betting.recommendedBet) {
    lines.push('');
    lines.push(`${EMOJI.money} <b>PARIS RECOMMANDÉ</b>`);
    lines.push(`Cote: ${prediction.betting.winnerOdds.toFixed(2)}`);
    lines.push(`Mise Kelly: ${prediction.betting.kellyStake}%`);
    lines.push(`EV: +${prediction.betting.expectedValue}%`);
  }
  
  if (prediction.keyFactors.length > 0) {
    lines.push('');
    lines.push(`${EMOJI.target} Facteurs clés:`);
    for (const factor of prediction.keyFactors.slice(0, 3)) {
      lines.push(`• ${factor}`);
    }
  }
  
  lines.push('');
  lines.push(`<i>📍 Généré par Tennis ML v2026</i>`);
  
  return lines.join('\n');
}

function formatDailySummary(predictions: TennisPrediction[]): string {
  const highConfidence = predictions.filter(
    p => p.prediction.confidence === 'very_high' || p.prediction.confidence === 'high'
  );
  const recommended = predictions.filter(p => p.betting.recommendedBet);
  
  const lines = [
    `${EMOJI.calendar} <b>RÉSUMÉ QUOTIDIEN TENNIS</b>`,
    `${EMOJI.calendar} ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`,
    '',
    `${EMOJI.chart} <b>${predictions.length}</b> matchs analysés`,
    `• ATP: ${predictions.filter(p => p.category === 'atp').length}`,
    `• WTA: ${predictions.filter(p => p.category === 'wta').length}`,
    `• Challenger: ${predictions.filter(p => p.category === 'challenger').length}`,
    '',
    `${EMOJI.fire} <b>${highConfidence.length}</b> prédictions haute confiance`,
    `${EMOJI.money} <b>${recommended.length}</b> paris recommandés`,
  ];
  
  // Top 3 prédictions
  const top3 = highConfidence.slice(0, 3);
  if (top3.length > 0) {
    lines.push('');
    lines.push(`${EMOJI.star} <b>TOP PRÉDICTIONS:</b>`);
    for (let i = 0; i < top3.length; i++) {
      const p = top3[i];
      const winner = p.prediction.winner === 'player1' ? p.player1 : p.player2;
      lines.push(`${i + 1}. ${winner} (${p.prediction.winProbability}%) - ${p.tournament}`);
    }
  }
  
  // Best value bets
  const valueBets = recommended
    .filter(p => p.betting.expectedValue > 10)
    .sort((a, b) => b.betting.expectedValue - a.betting.expectedValue)
    .slice(0, 3);
  
  if (valueBets.length > 0) {
    lines.push('');
    lines.push(`${EMOJI.money} <b>VALUE BETS:</b>`);
    for (const p of valueBets) {
      const winner = p.prediction.winner === 'player1' ? p.player1 : p.player2;
      lines.push(`• ${winner} @ ${p.betting.winnerOdds.toFixed(2)} (EV: +${p.betting.expectedValue}%)`);
    }
  }
  
  lines.push('');
  lines.push(`<i>📍 Pronostics Tennis ML v2026</i>`);
  
  return lines.join('\n');
}

function formatValueBetAlert(prediction: TennisPrediction): string {
  const winner = prediction.prediction.winner === 'player1' 
    ? prediction.player1 
    : prediction.player2;
  
  return [
    `${EMOJI.fire} <b>VALUE BET DÉTECTÉ!</b> ${EMOJI.fire}`,
    '',
    `${EMOJI.tennis} ${prediction.tournament}`,
    `<b>${winner}</b> @ <b>${prediction.betting.winnerOdds.toFixed(2)}</b>`,
    '',
    `${EMOJI.chart} Notre probabilité: ${prediction.prediction.winProbability}%`,
    `${EMOJI.target} Probabilité implicite: ${Math.round(100 / prediction.betting.winnerOdds)}%`,
    `${EMOJI.money} <b>Expected Value: +${prediction.betting.expectedValue}%</b>`,
    '',
    `Mise recommandée: ${prediction.betting.kellyStake}%`,
    '',
    `<i>📍 Alert Tennis ML</i>`,
  ].join('\n');
}

// ============================================
// PUBLISHER FUNCTIONS
// ============================================

function loadPredictions(): TennisPrediction[] {
  try {
    if (fs.existsSync(PREDICTIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf-8'));
      return data.predictions || [];
    }
  } catch (error) {
    console.error('Error loading predictions:', error);
  }
  return [];
}

function loadPublishStats(): PublishStats {
  try {
    if (fs.existsSync(STATS_FILE)) {
      return JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    }
  } catch (error) {
    // ignore
  }
  return {
    lastPublished: '',
    totalMessages: 0,
    predictionsPublished: 0,
    errors: 0,
  };
}

function savePublishStats(stats: PublishStats): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Publie le résumé quotidien des prédictions tennis
 */
export async function publishDailySummary(): Promise<boolean> {
  const predictions = loadPredictions();
  const stats = loadPublishStats();
  
  if (predictions.length === 0) {
    console.log('⚠️ No predictions to publish');
    return false;
  }
  
  const message = formatDailySummary(predictions);
  const success = await sendTelegramMessage({ text: message });
  
  if (success) {
    stats.lastPublished = new Date().toISOString();
    stats.totalMessages++;
    stats.predictionsPublished += predictions.length;
    savePublishStats(stats);
    console.log('✅ Daily summary published');
  } else {
    stats.errors++;
    savePublishStats(stats);
  }
  
  return success;
}

/**
 * Publie une prédiction spécifique
 */
export async function publishPrediction(prediction: TennisPrediction): Promise<boolean> {
  const message = formatPredictionMessage(prediction);
  const stats = loadPublishStats();
  
  const success = await sendTelegramMessage({ text: message });
  
  if (success) {
    stats.totalMessages++;
    stats.predictionsPublished++;
    savePublishStats(stats);
    console.log(`✅ Prediction published: ${prediction.player1} vs ${prediction.player2}`);
  } else {
    stats.errors++;
    savePublishStats(stats);
  }
  
  return success;
}

/**
 * Publie une alerte value bet
 */
export async function publishValueBetAlert(prediction: TennisPrediction): Promise<boolean> {
  if (!prediction.betting.recommendedBet || prediction.betting.expectedValue < 5) {
    return false;
  }
  
  const message = formatValueBetAlert(prediction);
  return sendTelegramMessage({ text: message });
}

/**
 * Publie les meilleures prédictions du jour (exécution CRON)
 */
export async function publishTopPredictions(limit: number = 5): Promise<number> {
  const predictions = loadPredictions();
  
  // Filtrer les meilleures
  const topPredictions = predictions
    .filter(p => p.prediction.confidence === 'very_high' || p.prediction.confidence === 'high')
    .sort((a, b) => b.prediction.winProbability - a.prediction.winProbability)
    .slice(0, limit);
  
  let published = 0;
  
  // Envoyer d'abord le résumé
  if (topPredictions.length > 0) {
    const summarySuccess = await publishDailySummary();
    if (summarySuccess) published++;
  }
  
  // Ensuite les prédictions détaillées
  for (const pred of topPredictions.slice(0, 3)) {
    const success = await publishPrediction(pred);
    if (success) published++;
    
    // Pause entre messages pour éviter le rate limiting
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`✅ Published ${published} messages`);
  return published;
}

/**
 * Rapport de performance hebdomadaire
 */
export async function publishWeeklyReport(metrics: {
  totalPredictions: number;
  correctPredictions: number;
  accuracy: number;
  roi: number;
  byConfidence: Record<string, { total: number; correct: number; accuracy: number }>;
}): Promise<boolean> {
  const lines = [
    `${EMOJI.chart} <b>RAPPORT HEBDOMADAIRE TENNIS</b>`,
    '',
    `${EMOJI.calendar} Semaine du ${getMonday().toLocaleDateString('fr-FR')}`,
    '',
    `${EMOJI.target} <b>PERFORMANCE:</b>`,
    `• Prédictions: ${metrics.totalPredictions}`,
    `• Correctes: ${metrics.correctPredictions}`,
    `• Précision: ${metrics.accuracy.toFixed(1)}%`,
    `• ROI: ${metrics.roi.toFixed(1)}%`,
    '',
    `${EMOJI.chart} Par niveau de confiance:`,
  ];
  
  for (const [conf, data] of Object.entries(metrics.byConfidence)) {
    if (data.total > 0) {
      lines.push(`• ${conf}: ${data.accuracy.toFixed(1)}% (${data.correct}/${data.total})`);
    }
  }
  
  lines.push('');
  lines.push(`<i>📍 Tennis ML v2026 - Rapport automatique</i>`);
  
  return sendTelegramMessage({ text: lines.join('\n') });
}

function getMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// ============================================
// EXPORT
// ============================================

export {
  sendTelegramMessage,
  formatPredictionMessage,
  formatDailySummary,
};
