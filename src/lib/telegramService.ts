/**
 * Telegram Service - Publication automatique des pronostics
 * 
 * Utilise Telegram Bot API pour envoyer les pronostics
 * Documentation: https://core.telegram.org/bots/api
 * 
 * CRÉER UN BOT TELEGRAM:
 * 1. Ouvrir Telegram et chercher @BotFather
 * 2. Envoyer /newbot
 * 3. Choisir un nom (ex: "Pronostics Bot")
 * 4. Choisir un username (ex: "mon_pronostics_bot")
 * 5. Récupérer le TOKEN fourni
 * 6. Créer un groupe/canal et ajouter le bot
 * 7. Récupérer le CHAT_ID (voir fonction getChatId ci-dessous)
 */

// Configuration Telegram
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Emojis pour les sports
const SPORT_EMOJIS: Record<string, string> = {
  'Foot': '⚽',
  'Basket': '🏀',
  'NBA': '🏀',
  'NHL': '🏒',
  'Hockey': '🏒',
  'football': '⚽',
  'basketball': '🏀',
  'hockey': '🏒',
};

/**
 * Envoie un message sur Telegram
 */
export async function sendTelegramMessage(text: string, options?: {
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_notification?: boolean;
}): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('⚠️ Telegram non configuré (TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID manquant)');
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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

/**
 * Formate un pronostic pour Telegram
 */
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
  confidence?: string;
  riskPercentage?: number;
  valueBetDetected?: boolean;
  valueBetType?: string | null;
  isLive?: boolean;
  isEstimated?: boolean;
  dateTag?: string;
  displayDate?: string;
}): string {
  const sportEmoji = SPORT_EMOJIS[prediction.sport] || '🏟️';
  
  // En-tête
  let message = '';
  
  if (prediction.valueBetDetected) {
    message += '🔔 <b>VALUE BET DÉTECTÉ !</b>\n\n';
  }
  
  // Titre du match
  message += `${sportEmoji} <b>${prediction.homeTeam} vs ${prediction.awayTeam}</b>\n`;
  
  // Statut live ou date
  if (prediction.isLive) {
    message += '🔴 <b>MATCH EN DIRECT</b>\n';
  } else if (prediction.displayDate) {
    message += `📅 ${prediction.displayDate}\n`;
  }
  
  // Ligue
  if (prediction.league) {
    message += `🏆 ${prediction.league}\n`;
  }
  
  message += '\n';
  
  // Cotes
  if (prediction.oddsHome && prediction.oddsAway) {
    if (prediction.oddsDraw) {
      message += `📈 <b>Cotes:</b> 1: ${prediction.oddsHome.toFixed(2)} | X: ${prediction.oddsDraw.toFixed(2)} | 2: ${prediction.oddsAway.toFixed(2)}\n`;
    } else {
      message += `📈 <b>Cotes:</b> 1: ${prediction.oddsHome.toFixed(2)} | 2: ${prediction.oddsAway.toFixed(2)}\n`;
    }
  }
  
  // Pronostic
  if (prediction.recommendation) {
    const confidenceEmoji = prediction.confidence === 'very_high' ? '🔥' 
                          : prediction.confidence === 'high' ? '✅' 
                          : prediction.confidence === 'medium' ? '⚡' : '⚠️';
    message += `${confidenceEmoji} <b>Pronostic:</b> ${prediction.recommendation}\n`;
  }
  
  // Risque
  if (prediction.riskPercentage !== undefined) {
    const riskEmoji = prediction.riskPercentage <= 30 ? '🟢' 
                    : prediction.riskPercentage <= 50 ? '🟡' : '🔴';
    message += `⚖️ <b>Risque:</b> ${riskEmoji} ${prediction.riskPercentage}%\n`;
  }
  
  // Value bet
  if (prediction.valueBetDetected && prediction.valueBetType) {
    message += `💎 <b>Value Bet:</b> ${prediction.valueBetType}\n`;
  }
  
  // Avertissement si cotes estimées
  if (prediction.isEstimated) {
    message += '\n⚠️ <i>Cotes estimées - Utilisez avec prudence</i>\n';
  }
  
  return message;
}

/**
 * Publie un pronostic sur Telegram
 */
export async function publishPredictionToTelegram(prediction: {
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league?: string;
  date: string;
  oddsHome?: number;
  oddsDraw?: number | null;
  oddsAway?: number;
  recommendation?: string;
  confidence?: string;
  riskPercentage?: number;
  valueBetDetected?: boolean;
  valueBetType?: string | null;
  isLive?: boolean;
  isEstimated?: boolean;
  dateTag?: string;
  displayDate?: string;
}): Promise<boolean> {
  const message = formatPrediction(prediction);
  return sendTelegramMessage(message);
}

/**
 * Publie un résumé quotidien sur Telegram
 */
export async function publishDailySummaryToTelegram(predictions: Array<{
  homeTeam: string;
  awayTeam: string;
  sport: string;
  recommendation?: string;
  confidence?: string;
  valueBetDetected?: boolean;
}>): Promise<boolean> {
  const today = new Date().toLocaleDateString('fr-FR', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long' 
  });

  // Grouper par sport
  const bySport: Record<string, typeof predictions> = {};
  predictions.forEach(p => {
    const sport = p.sport || 'Autre';
    if (!bySport[sport]) bySport[sport] = [];
    bySport[sport].push(p);
  });

  let message = `📢 <b>PROGRAMME DU JOUR</b>\n`;
  message += `📅 ${today.charAt(0).toUpperCase() + today.slice(1)}\n`;
  message += `🎯 ${predictions.length} pronostic${predictions.length > 1 ? 's' : ''} disponible${predictions.length > 1 ? 's' : ''}\n\n`;
  
  // Stats par sport
  for (const [sport, matches] of Object.entries(bySport)) {
    const emoji = SPORT_EMOJIS[sport] || '🏟️';
    const valueBets = matches.filter(m => m.valueBetDetected).length;
    
    message += `${emoji} <b>${sport}</b>: ${matches.length} match${matches.length > 1 ? 's' : ''}`;
    if (valueBets > 0) {
      message += ` | 💎 ${valueBets} value bet${valueBets > 1 ? 's' : ''}`;
    }
    message += '\n';
  }
  
  // Top value bets
  const topValueBets = predictions.filter(p => p.valueBetDetected && p.confidence !== 'low').slice(0, 3);
  if (topValueBets.length > 0) {
    message += '\n💎 <b>TOP VALUE BETS:</b>\n';
    topValueBets.forEach((p, i) => {
      message += `${i + 1}. ${p.homeTeam} vs ${p.awayTeam}\n`;
      if (p.recommendation) {
        message += `   → ${p.recommendation}\n`;
      }
    });
  }

  return sendTelegramMessage(message);
}

/**
 * Publie une alerte live sur Telegram
 */
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
  
  let message = `🚨 <b>MATCH EN DIRECT !</b>\n\n`;
  message += `${sportEmoji} <b>${match.homeTeam} vs ${match.awayTeam}</b>\n`;
  
  if (match.homeScore !== undefined && match.awayScore !== undefined) {
    message += `📊 <b>Score:</b> ${match.homeScore} - ${match.awayScore}\n`;
  }
  
  if (match.clock) {
    message += `⏱️ ${match.clock}\n`;
  }
  
  if (match.recommendation) {
    message += `\n💡 <b>Pronostic:</b> ${match.recommendation}\n`;
  }

  return sendTelegramMessage(message);
}

/**
 * Publie les résultats du jour sur Telegram
 */
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
  
  let message = `${emoji} <b>RÉSULTATS DU JOUR</b>\n\n`;
  message += `✅ <b>${results.correct}/${results.total}</b> pronostics corrects\n`;
  message += `📈 Taux de réussite: <b>${results.winRate}%</b>\n\n`;
  
  if (results.bestPredictions.length > 0) {
    message += `<b>Meilleures prédictions:</b>\n`;
    results.bestPredictions.slice(0, 5).forEach(p => {
      const resultEmoji = p.result === 'won' ? '✅' : '❌';
      message += `${resultEmoji} ${p.match}\n`;
      message += `   <i>${p.prediction}</i>\n`;
    });
  }

  return sendTelegramMessage(message);
}

/**
 * Récupère le CHAT_ID Telegram
 * À appeler une seule fois pour configurer le bot
 */
export async function getTelegramChatId(): Promise<string | null> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN non configuré');
    return null;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.ok || !data.result || data.result.length === 0) {
      console.log('⚠️ Aucun message trouvé. Envoyez un message au bot ou ajoutez-le à un groupe.');
      return null;
    }

    // Récupérer le chat_id du dernier message
    const lastUpdate = data.result[data.result.length - 1];
    const chatId = lastUpdate.message?.chat?.id || lastUpdate.my_chat_member?.chat?.id;

    if (chatId) {
      console.log(`✅ CHAT_ID trouvé: ${chatId}`);
      return String(chatId);
    }

    return null;
  } catch (error) {
    console.error('❌ Erreur récupération CHAT_ID:', error);
    return null;
  }
}

/**
 * Teste la connexion Telegram
 */
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
    // Vérifier le bot
    const botUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`;
    const botResponse = await fetch(botUrl);
    const botData = await botResponse.json();

    if (!botData.ok) {
      return { success: false, error: botData.description };
    }

    const botName = botData.result.username;

    // Vérifier le chat_id
    if (!TELEGRAM_CHAT_ID) {
      const chatId = await getTelegramChatId();
      if (chatId) {
        return { success: true, chatId, botName };
      }
      return { 
        success: false, 
        botName, 
        error: 'TELEGRAM_CHAT_ID non configuré. Envoyez un message au bot puis appelez getTelegramChatId()'
      };
    }

    // Tester l'envoi
    const testSent = await sendTelegramMessage('🤖 Test de connexion réussi !');
    return { success: testSent, chatId: TELEGRAM_CHAT_ID, botName };

  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export default {
  sendTelegramMessage,
  publishPredictionToTelegram,
  publishDailySummaryToTelegram,
  publishLiveAlertToTelegram,
  publishResultsToTelegram,
  getTelegramChatId,
  testTelegramConnection,
};
