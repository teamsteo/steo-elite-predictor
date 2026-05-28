/**
 * Discord Service - Publication automatique des pronostics
 * 
 * Utilise les Webhooks Discord pour envoyer les pronostics
 * Documentation: https://discord.com/developers/docs/resources/webhook
 */

// Configuration Discord Webhook
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer?: {
    text: string;
    icon_url?: string;
  };
  timestamp?: string;
  thumbnail?: {
    url: string;
  };
}

interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
  username?: string;
  avatar_url?: string;
}

// Couleurs pour les différents types de pronostics
const COLORS = {
  SUCCESS: 0x00FF00,      // Vert
  WARNING: 0xFFA500,      // Orange
  INFO: 0x3498DB,         // Bleu
  LIVE: 0xFF0000,         // Rouge (live)
  HIGH_CONFIDENCE: 0x00FF00,  // Vert (haute confiance)
  MEDIUM_CONFIDENCE: 0xFFFF00, // Jaune
  LOW_CONFIDENCE: 0xFF6B6B,    // Rouge clair
};

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
 * Envoie un message sur Discord via Webhook
 */
export async function sendDiscordMessage(message: DiscordMessage): Promise<boolean> {
  if (!DISCORD_WEBHOOK_URL) {
    console.warn('⚠️ Discord Webhook non configuré');
    return false;
  }

  try {
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...message,
        username: message.username || '🎯 Pronostics Bot',
        avatar_url: message.avatar_url || 'https://i.imgur.com/placeholder.png',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Erreur Discord:', error);
      return false;
    }

    console.log('✅ Message envoyé sur Discord');
    return true;
  } catch (error) {
    console.error('❌ Erreur envoi Discord:', error);
    return false;
  }
}

/**
 * Publie un pronostic sur Discord
 */
export async function publishPredictionToDiscord(prediction: {
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
  const sportEmoji = SPORT_EMOJIS[prediction.sport] || '🏟️';
  
  // Déterminer la couleur selon la confiance
  let color = COLORS.INFO;
  if (prediction.confidence === 'very_high' || prediction.confidence === 'high') {
    color = COLORS.HIGH_CONFIDENCE;
  } else if (prediction.confidence === 'medium') {
    color = COLORS.MEDIUM_CONFIDENCE;
  } else if (prediction.confidence === 'low') {
    color = COLORS.LOW_CONFIDENCE;
  }

  // Construire l'embed
  const embed: DiscordEmbed = {
    title: `${sportEmoji} ${prediction.homeTeam} vs ${prediction.awayTeam}`,
    description: prediction.isLive 
      ? '🔴 **MATCH EN DIRECT**' 
      : `📅 ${prediction.displayDate || new Date(prediction.date).toLocaleDateString('fr-FR')}`,
    color: prediction.isLive ? COLORS.LIVE : color,
    fields: [],
    footer: {
      text: prediction.isEstimated 
        ? '⚠️ Cotes estimées - Utilisez avec prudence' 
        : '📊 Pronostics automatiques',
    },
    timestamp: new Date().toISOString(),
  };

  // Ajouter la ligue
  if (prediction.league) {
    embed.fields!.push({
      name: '🏆 Compétition',
      value: prediction.league,
      inline: true,
    });
  }

  // Ajouter les cotes
  if (prediction.oddsHome && prediction.oddsAway) {
    const oddsText = prediction.oddsDraw
      ? `**1** ${prediction.oddsHome.toFixed(2)} | **X** ${prediction.oddsDraw.toFixed(2)} | **2** ${prediction.oddsAway.toFixed(2)}`
      : `**1** ${prediction.oddsHome.toFixed(2)} | **2** ${prediction.oddsAway.toFixed(2)}`;
    
    embed.fields!.push({
      name: '📈 Cotes',
      value: oddsText,
      inline: true,
    });
  }

  // Ajouter la recommandation
  if (prediction.recommendation) {
    const confidenceEmoji = prediction.confidence === 'very_high' ? '🔥' 
                          : prediction.confidence === 'high' ? '✅' 
                          : prediction.confidence === 'medium' ? '⚡' : '⚠️';
    
    embed.fields!.push({
      name: `${confidenceEmoji} Pronostic`,
      value: `**${prediction.recommendation}**`,
      inline: false,
    });
  }

  // Ajouter le risque
  if (prediction.riskPercentage !== undefined) {
    const riskEmoji = prediction.riskPercentage <= 30 ? '🟢' 
                    : prediction.riskPercentage <= 50 ? '🟡' : '🔴';
    
    embed.fields!.push({
      name: '⚖️ Risque',
      value: `${riskEmoji} ${prediction.riskPercentage}%`,
      inline: true,
    });
  }

  // Ajouter le value bet si détecté
  if (prediction.valueBetDetected && prediction.valueBetType) {
    embed.fields!.push({
      name: '💎 Value Bet Détecté',
      value: `**${prediction.valueBetType}**`,
      inline: true,
    });
  }

  return sendDiscordMessage({
    content: prediction.valueBetDetected 
      ? '🔔 **VALUE BET DÉTECTÉ !**' 
      : undefined,
    embeds: [embed],
  });
}

/**
 * Publie un résumé quotidien des pronostics
 */
export async function publishDailySummaryToDiscord(predictions: Array<{
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

  // Construire les fields
  const fields: DiscordEmbed['fields'] = [];
  
  for (const [sport, matches] of Object.entries(bySport)) {
    const emoji = SPORT_EMOJIS[sport] || '🏟️';
    const valueBets = matches.filter(m => m.valueBetDetected).length;
    
    fields.push({
      name: `${emoji} ${sport}`,
      value: `${matches.length} match${matches.length > 1 ? 's' : ''}${valueBets > 0 ? ` | 💎 ${valueBets} value bet${valueBets > 1 ? 's' : ''}` : ''}`,
      inline: true,
    });
  }

  const embed: DiscordEmbed = {
    title: '📅 Programme du jour',
    description: `**${today.charAt(0).toUpperCase() + today.slice(1)}**\n${predictions.length} pronostic${predictions.length > 1 ? 's' : ''} disponible${predictions.length > 1 ? 's' : ''}`,
    color: COLORS.INFO,
    fields,
    footer: {
      text: '🎯 Pronostics Bot',
    },
    timestamp: new Date().toISOString(),
  };

  return sendDiscordMessage({
    content: '📢 **Nouveaux pronostics disponibles !**',
    embeds: [embed],
  });
}

/**
 * Publie une alerte de match live
 */
export async function publishLiveAlertToDiscord(match: {
  homeTeam: string;
  awayTeam: string;
  sport: string;
  homeScore?: number;
  awayScore?: number;
  clock?: string;
  recommendation?: string;
}): Promise<boolean> {
  const sportEmoji = SPORT_EMOJIS[match.sport] || '🏟️';
  
  const embed: DiscordEmbed = {
    title: `🔴 EN DIRECT - ${match.homeTeam} vs ${match.awayTeam}`,
    description: match.clock ? `⏱️ ${match.clock}` : undefined,
    color: COLORS.LIVE,
    fields: [],
    footer: {
      text: '🔴 Match en cours',
    },
    timestamp: new Date().toISOString(),
  };

  if (match.homeScore !== undefined && match.awayScore !== undefined) {
    embed.fields!.push({
      name: '📊 Score',
      value: `**${match.homeScore} - ${match.awayScore}**`,
      inline: true,
    });
  }

  if (match.recommendation) {
    embed.fields!.push({
      name: '💡 Pronostic',
      value: match.recommendation,
      inline: true,
    });
  }

  return sendDiscordMessage({
    content: '🚨 **MATCH EN DIRECT !**',
    embeds: [embed],
  });
}

/**
 * Publie les résultats du jour
 */
export async function publishResultsToDiscord(results: {
  total: number;
  correct: number;
  winRate: number;
  bestPredictions: Array<{
    match: string;
    prediction: string;
    result: 'won' | 'lost';
  }>;
}): Promise<boolean> {
  const embed: DiscordEmbed = {
    title: '📊 Résultats du jour',
    description: `**${results.correct}/${results.total} pronostics corrects**\nTaux de réussite: **${results.winRate}%**`,
    color: results.winRate >= 60 ? COLORS.SUCCESS : results.winRate >= 40 ? COLORS.WARNING : 0xFF0000,
    fields: results.bestPredictions.slice(0, 5).map(p => ({
      name: p.result === 'won' ? '✅' : '❌',
      value: `${p.match}\n_${p.prediction}_`,
      inline: false,
    })),
    footer: {
      text: '🎯 Pronostics Bot',
    },
    timestamp: new Date().toISOString(),
  };

  return sendDiscordMessage({
    embeds: [embed],
  });
}

export default {
  sendDiscordMessage,
  publishPredictionToDiscord,
  publishDailySummaryToDiscord,
  publishLiveAlertToDiscord,
  publishResultsToDiscord,
};
