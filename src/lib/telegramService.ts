/**
 * Telegram Service - Publication automatique des pronostics
 * 
 * Format des messages ergonomique et clair avec:
 * - Date et heure de la rencontre
 * - Pourcentage de réussite du pronostic
 * - Niveau de risque visuel
 * - Over/Under 2.5 buts (football, Dixon-Coles enrichi)
 */

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

/**
 * Crée une barre de progression visuelle
 */
function createProgressBar(percentage: number, length: number = 10): string {
  const filled = Math.round((percentage / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

// ============================================
// PRÉDICTION DE BUTS (Football - Dixon-Coles Enrichi)
// ============================================

// Cache pour les stats d'équipe TheSportsDB (éviter les appels répétés)
const teamStatsCache = new Map<string, any>();
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

  // Essayer de récupérer les stats TheSportsDB
  let homeTableStats = null;
  let awayTableStats = null;

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
      // Mettre en cache
      teamStatsCache.set(cacheKey, {
        home: homeTableStats,
        away: awayTableStats,
        timestamp: Date.now(),
      });
    }
  } catch (e) {
    // Silently fail — fallback to odds-based Poisson
  }

  // Utiliser le modèle enrichi
  return predictGoalsEnriched(
    homeTeam, awayTeam, league,
    oddsHome, oddsDraw, oddsAway,
    homeTableStats, awayTableStats,
    isEstimated
  );
}

/**
 * Formatte une prédiction de buts pour Telegram
 */
function formatGoalsPrediction(goals: GoalsPredictionResult): string {
  const sourceLabel = goals.source === 'dixon-coles' ? '🔬' : '📊';
  
  let line = `${sourceLabel} <b>${goals.expectedGoals}</b> buts attendus (${goals.mostLikelyScore})\n`;
  
  // Over/Under 2.5
  if (goals.recommendation !== 'skip') {
    const recEmoji = goals.recommendation === 'over25' ? '⬆️' : '⬇️';
    const recLabel = goals.recommendation === 'over25' ? 'Over 2.5' : 'Under 2.5';
    line += `   ${recEmoji} <b>${recLabel}</b>: ${goals.recommendation === 'over25' ? goals.over25 : goals.under25}%\n`;
  } else {
    line += `   ⚖️ +2.5: ${goals.over25}%  ·  -2.5: ${goals.under25}%\n`;
  }
  
  return line;
}

/**
 * Formate la date et l'heure pour l'affichage
 */
function formatDateTime(dateStr: string, displayDate?: string): { date: string; time: string } {
  try {
    // Si on a déjà un displayDate formaté, l'utiliser
    if (displayDate) {
      const parts = displayDate.split(',');
      if (parts.length >= 2) {
        return { date: parts[0].trim(), time: parts[1].trim() };
      }
      return { date: displayDate, time: '' };
    }
    
    // Sinon parser la date
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

/**
 * Envoie un message sur Telegram
 */
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

/**
 * Convertit le résultat prédit en option de pari (1, X, 2)
 */
function getBetOption(predictedResult?: 'home' | 'away' | 'draw', sport?: string): string {
  if (!predictedResult) return '';
  
  // Pour le football: 1, X, 2
  if (sport?.toLowerCase().includes('foot') || sport?.toLowerCase() === 'soccer') {
    if (predictedResult === 'home') return '1️⃣';
    if (predictedResult === 'draw') return '❌';
    if (predictedResult === 'away') return '2️⃣';
  }
  
  // Pour tennis/basket/hockey: 1 ou 2 (pas de match nul)
  if (predictedResult === 'home') return '1️⃣';
  if (predictedResult === 'away') return '2️⃣';
  
  return '';
}

/**
 * Formate un pronostic individuel (format ergonomique)
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
  
  // En-tête avec bordure
  let message = '━━━━━━━━━━━━━━━━━━━━━\n';
  
  // Ligne titre avec sport et value bet
  if (prediction.valueBetDetected) {
    message += `🔔 <b>VALUE BET</b> ${sportEmoji}\n`;
  } else {
    message += `${sportEmoji} <b>${prediction.sport.toUpperCase()}</b>\n`;
  }
  
  message += '━━━━━━━━━━━━━━━━━━━━━\n\n';
  
  // Match
  message += `🏟️ <b>${prediction.homeTeam}</b>\n`;
  message += `    <b>VS</b>\n`;
  message += `🏟️ <b>${prediction.awayTeam}</b>\n\n`;
  
  // Date et heure
  message += `📅 <b>${date}</b>\n`;
  if (time) {
    message += `⏰ <b>${time}</b>\n`;
  }
  
  // Ligue
  if (prediction.league) {
    message += `🏆 ${prediction.league}\n`;
  }
  
  message += '\n';
  
  // Cotes
  if (prediction.oddsHome && prediction.oddsAway) {
    message += `📊 <b>COTES</b>\n`;
    if (prediction.oddsDraw) {
      message += `    1️⃣ ${prediction.oddsHome.toFixed(2)}  |  ❌ ${prediction.oddsDraw.toFixed(2)}  |  2️⃣ ${prediction.oddsAway.toFixed(2)}\n`;
    } else {
      message += `    1️⃣ ${prediction.oddsHome.toFixed(2)}  |  2️⃣ ${prediction.oddsAway.toFixed(2)}\n`;
    }
    message += '\n';
  }
  
  // Pronostic avec mise en évidence - OPTION DE PARI CLAIRE
  if (prediction.recommendation || prediction.predictedResult) {
    message += `🎯 <b>PRONOSTIC</b>\n`;
    
    // Afficher l'option de pari (1, X, 2)
    const betOption = getBetOption(prediction.predictedResult, prediction.sport);
    
    if (betOption && prediction.recommendation) {
      message += `    ${betOption} <b>${prediction.recommendation}</b>\n`;
    } else if (betOption) {
      // Si on a que l'option, afficher le nom de l'équipe correspondante
      const teamName = prediction.predictedResult === 'home' ? prediction.homeTeam :
                       prediction.predictedResult === 'away' ? prediction.awayTeam : 'Match Nul';
      message += `    ${betOption} <b>${teamName}</b>\n`;
    } else if (prediction.recommendation) {
      message += `    ▶️ <b>${prediction.recommendation}</b>\n`;
    }
    message += '\n';
  }
  
  // Pourcentage de réussite
  const winProb = prediction.winProbability || (prediction.riskPercentage !== undefined ? 100 - prediction.riskPercentage : null);
  if (winProb !== null && winProb !== undefined) {
    const probEmoji = winProb >= 70 ? '🔥' : winProb >= 50 ? '✅' : '⚡';
    message += `${probEmoji} <b>RÉUSSITE</b>\n`;
    message += `    ${createProgressBar(winProb)} <b>${winProb}%</b>\n\n`;
  }
  
  // Niveau de risque
  if (prediction.riskPercentage !== undefined) {
    const riskEmoji = prediction.riskPercentage <= 30 ? '🟢' : '🟡';
    const riskLabel = prediction.riskPercentage <= 30 ? 'SAFE' : 'MODÉRÉ';
    message += `${riskEmoji} <b>RISQUE: ${riskLabel}</b> (${prediction.riskPercentage}%)\n`;
  }
  
  // Value bet info
  if (prediction.valueBetDetected && prediction.valueBetType) {
    message += `💎 <b>Value: ${prediction.valueBetType}</b>\n`;
  }
  
  // Avertissement
  if (prediction.isEstimated) {
    message += `\n⚠️ <i>Cotes estimées</i>\n`;
  }
  
  return message;
}

/**
 * Publie un pronostic individuel sur Telegram
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
}): Promise<boolean> {
  const message = formatPrediction(prediction);
  return sendTelegramMessage(message);
}

/**
 * Publie un résumé quotidien ergonomique
 */
export async function publishDailySummaryToTelegram(predictions: Array<{
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
  oddsHome?: number;
  oddsAway?: number;
  oddsDraw?: number | null;
  isEstimated?: boolean;
}>): Promise<boolean> {
  // Filtrer safe et modéré
  const filtered = predictions.filter(p => isSafeOrModerate(p.riskPercentage));
  
  // 🆕 CAS: Il y a des matchs mais aucun safe/modéré -> Afficher directement les Kamikaze
  if (filtered.length === 0 && predictions.length > 0) {
    console.log('⚠️ Aucun pronostic safe/modéré - affichage Kamikaze direct');

    // Filtrer les matchs Kamikaze (risque >= 51%)
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

    // Afficher DIRECTEMENT les matchs Kamikaze disponibles
    if (kamikazePicks.length > 0) {
      message += '───────────────────────────\n';
      message += `💣 <b>SÉLECTION KAMIKAZE</b> — ${kamikazePicks.length} opportunité${kamikazePicks.length > 1 ? 's' : ''}\n`;
      message += '───────────────────────────\n\n';
      message += `⚠️ <b>HAUT RISQUE - HAUTE RÉCOMPENSE</b>\n\n`;

      kamikazePicks.slice(0, 5).forEach((m, i) => {
        const { time } = formatDateTime(m.date, m.displayDate);
        const isFootball = m.sport?.toLowerCase().includes('foot') || m.sport?.toLowerCase() === 'soccer';
        const winProb = m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : 50);
        const betOption = getBetOption(m.predictedResult, m.sport);
        const dateDisplay = m.dateTag && m.dateTag !== "aujourd'hui" ? ` [${m.dateTag.toUpperCase()}]` : '';

        message += '───────────────────────────\n';
        message += `<b>${i + 1}.</b> ${m.homeTeam} vs ${m.awayTeam}${dateDisplay}\n`;

        if (m.league) {
          message += `${SPORT_EMOJIS[m.sport] || '🏟️'} ${m.league}\n`;
        }

        if (m.oddsHome && m.oddsAway) {
          let oddsLine = `📊 `;
          oddsLine += `1: <b>${m.oddsHome.toFixed(2)}</b>`;
          if (isFootball && m.oddsDraw) oddsLine += `  ·  X: <b>${m.oddsDraw.toFixed(2)}</b>`;
          oddsLine += `  ·  2: <b>${m.oddsAway.toFixed(2)}</b>`;
          message += `${oddsLine}\n`;
        }

        let pronoLine = '';
        if (time) pronoLine += `⏰ ${time}  ·  `;
        if (betOption && m.recommendation) {
          pronoLine += `🎯 ${betOption} <b>${m.recommendation}</b>`;
        }
        if (pronoLine) message += `${pronoLine}\n`;

        message += `💥 <b>${m.riskPercentage}%</b>  ·  ✅ <b>${winProb}%</b>\n`;

        // Prédiction de buts (football uniquement, si cotes réelles)
        if (isFootball && m.oddsHome && m.oddsAway) {
          const goals = calculateGoalsPrediction(m.oddsHome, m.oddsAway, m.oddsDraw, m.isEstimated);
          if (goals) {
            message += `⚽ Total: <b>${goals.total}</b> buts  ·  +2.5: <b>${goals.over25}%</b>  ·  ${goals.prediction}\n`;
          }
        }

        message += '\n';
      });

      if (kamikazePicks.length > 5) {
        message += `<i>... et ${kamikazePicks.length - 5} autres</i>\n\n`;
      }

      message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
      message += `⚠️ <b>ATTENTION</b> — Ces pronostics sont très risqués.\n`;
      message += `Ne pariez que ce que vous pouvez perdre.\n`;
    } else {
      // Aucun Kamikaze non plus
      message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
      message += `ℹ️ <b>AUCUN MATCH DISPONIBLE</b>\n`;
      message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
      message += `Aucun pronostic à publier aujourd'hui.\n`;
      message += `Revenez demain pour les prochains matchs!\n`;
    }

    return sendTelegramMessage(message);
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

  // Grouper par sport
  const bySport: Record<string, typeof filtered> = {};
  filtered.forEach(p => {
    const sport = p.sport || 'Autre';
    if (!bySport[sport]) bySport[sport] = [];
    bySport[sport].push(p);
  });

  // Construire le message
  let message = '';
  
  // En-tête (style Kamikaze)
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
  
  // Détail par sport
  for (const [sport, matches] of Object.entries(bySport)) {
    const emoji = SPORT_EMOJIS[sport] || '🏟️';

    message += `${emoji} <b>${sport.toUpperCase()}</b> — ${matches.length} match${matches.length > 1 ? 's' : ''}\n\n`;
    
    matches.slice(0, 10).forEach((m, i) => {
      const { time } = formatDateTime(m.date, m.displayDate);
      const isFootball = m.sport?.toLowerCase().includes('foot') || m.sport?.toLowerCase() === 'soccer';
      const winProb = m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : 50);
      const riskEmoji = (m.riskPercentage || 100) <= 30 ? '🟢' : '🟡';
      const betLabel = getBetOption(m.predictedResult, m.sport);
      const dateDisplay = m.dateTag && m.dateTag !== "aujourd'hui" ? ` [${m.dateTag.toUpperCase()}]` : '';

      message += '───────────────────────────\n';
      message += `<b>${i + 1}.</b> ${m.homeTeam} vs ${m.awayTeam}${dateDisplay}\n`;

      if (m.league) {
        message += `${emoji} ${m.league}\n`;
      }

      if (m.oddsHome && m.oddsAway) {
        let oddsLine = `📊 `;
        oddsLine += `1: <b>${m.oddsHome.toFixed(2)}</b>`;
        if (isFootball && m.oddsDraw) oddsLine += `  ·  X: <b>${m.oddsDraw.toFixed(2)}</b>`;
        oddsLine += `  ·  2: <b>${m.oddsAway.toFixed(2)}</b>`;
        message += `${oddsLine}\n`;
      }

      let pronoLine = '';
      if (time) pronoLine += `⏰ ${time}  ·  `;
      if (betLabel && m.recommendation) {
        pronoLine += `🎯 ${betLabel} <b>${m.recommendation}</b>`;
      }
      if (pronoLine) message += `${pronoLine}\n`;

      message += `${riskEmoji} ${m.riskPercentage}%  ·  ✅ <b>${winProb}%</b>\n`;

      // Prédiction de buts (football uniquement, si cotes réelles)
      if (isFootball && m.oddsHome && m.oddsAway) {
        const goals = calculateGoalsPrediction(m.oddsHome, m.oddsAway, m.oddsDraw, m.isEstimated);
        if (goals) {
          message += `⚽ Total: <b>${goals.total}</b> buts  ·  +2.5: <b>${goals.over25}%</b>  ·  ${goals.prediction}\n`;
        }
      }

      message += '\n';
    });
    
    if (matches.length > 10) {
      message += `<i>... et ${matches.length - 10} autres match${matches.length - 10 > 1 ? 's' : ''} dans ce sport</i>\n\n`;
    }
  }
  
  // Pied de message
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  message += '🟢 Safe (≤30%)  ·  🟡 Modéré (31-50%)\n';
  message += '⚽ = Prédiction buts (modèle Poisson)\n';
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━';

  return sendTelegramMessage(message);
}

/**
 * Publie les value bets uniquement
 */
export async function publishValueBetsToTelegram(predictions: Array<{
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league?: string;
  date: string;
  displayDate?: string;
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
}>): Promise<boolean> {
  // Filtrer: value bet + safe/modéré
  const valueBets = predictions.filter(p => 
    p.valueBetDetected && 
    p.confidence !== 'low' && 
    isSafeOrModerate(p.riskPercentage)
  );

  if (valueBets.length === 0) {
    console.log('⚠️ Aucun value bet safe/modéré');
    return false;
  }

  let message = '';
  
  message += '╔════════════════════════╗\n';
  message += `║   💎 <b>VALUE BETS DU JOUR</b>   ║\n`;
  message += '╚════════════════════════╝\n\n';
  
  message += `🔥 <b>${valueBets.length} opportunité${valueBets.length > 1 ? 's' : ''} détectée${valueBets.length > 1 ? 's' : ''}</b>\n\n`;

  valueBets.slice(0, 5).forEach((m, i) => {
    const sportEmoji = SPORT_EMOJIS[m.sport] || '🏟️';
    const { time } = formatDateTime(m.date, m.displayDate);
    const winProb = m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : 50);
    const betOption = getBetOption(m.predictedResult, m.sport);
    
    message += `━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `<b>${i + 1}. ${m.homeTeam} vs ${m.awayTeam}</b>\n`;
    message += `${sportEmoji} ${m.sport}`;
    if (m.league) message += ` | ${m.league}`;
    message += `\n`;
    
    if (time) message += `⏰ ${time} | `;
    message += `🎯 ${betOption} <b>${m.recommendation || 'N/A'}</b>\n`;
    
    if (m.oddsHome && m.oddsAway) {
      message += `📊 Cotes: 1:${m.oddsHome.toFixed(2)}`;
      if (m.oddsDraw) message += ` X:${m.oddsDraw.toFixed(2)}`;
      message += ` 2:${m.oddsAway.toFixed(2)}\n`;
    }
    
    message += `🔥 Réussite: <b>${winProb}%</b>\n`;
    if (m.valueBetType) {
      message += `💎 Type: ${m.valueBetType}\n`;
    }
    message += '\n';
  });

  return sendTelegramMessage(message);
}

/**
 * Publie les pronostics Kamikaze (haut risque, haute récompense)
 */
export async function publishKamikazeToTelegram(predictions: Array<{
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league?: string;
  date: string;
  displayDate?: string;
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
}>): Promise<boolean> {
  // Filtrer: uniquement Kamikaze (risque > 50%)
  const kamikazePicks = predictions.filter(p => isKamikaze(p.riskPercentage));

  if (kamikazePicks.length === 0) {
    console.log('⚠️ Aucun pronostic Kamikaze à publier');
    return false;
  }

  // Trier par cote décroissante (plus haute cote = plus gros gain potentiel)
  kamikazePicks.sort((a, b) => {
    const oddsA = a.oddsHome && a.oddsAway ? Math.max(a.oddsHome, a.oddsAway) : 0;
    const oddsB = b.oddsHome && b.oddsAway ? Math.max(b.oddsHome, b.oddsAway) : 0;
    return oddsB - oddsA;
  });

  let message = '';

  message += '╔════════════════════════╗\n';
  message += `║ 💣 <b>SÉLECTION KAMIKAZE</b>  ║\n`;
  message += '╚════════════════════════╝\n\n';

  message += `⚠️ <b>HAUT RISQUE - HAUTE RÉCOMPENSE</b>\n`;
  message += `🔥 <b>${kamikazePicks.length} opportunité${kamikazePicks.length > 1 ? 's' : ''} à gros potentiel</b>\n\n`;

  kamikazePicks.slice(0, 5).forEach((m, i) => {
    const sportEmoji = SPORT_EMOJIS[m.sport] || '🏟️';
    const { time } = formatDateTime(m.date, m.displayDate);
    const winProb = m.winProbability || (m.riskPercentage !== undefined ? 100 - m.riskPercentage : 50);
    const maxOdds = m.oddsHome && m.oddsAway ? Math.max(m.oddsHome, m.oddsAway) : 0;
    const betOption = getBetOption(m.predictedResult, m.sport);

    message += `━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `<b>${i + 1}. ${m.homeTeam} vs ${m.awayTeam}</b>\n`;
    message += `${sportEmoji} ${m.sport}`;
    if (m.league) message += ` | ${m.league}`;
    message += `\n`;

    if (time) message += `⏰ ${time} | `;
    message += `🎯 ${betOption} <b>${m.recommendation || 'N/A'}</b>\n`;

    if (m.oddsHome && m.oddsAway) {
      message += `📊 Cotes: 1:${m.oddsHome.toFixed(2)}`;
      if (m.oddsDraw) message += ` X:${m.oddsDraw.toFixed(2)}`;
      message += ` 2:${m.oddsAway.toFixed(2)}\n`;
    }

    message += `💥 Risque: <b>${m.riskPercentage}%</b>\n`;
    message += `💰 Gain potentiel: <b>x${maxOdds.toFixed(2)}</b>\n`;
    message += `🔥 Réussite: <b>${winProb}%</b>\n\n`;
  });

  message += `━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `⚠️ <b>ATTENTION</b>\n`;
  message += `Ces pronostics sont très risqués.\n`;
  message += `Ne pariez que ce que vous pouvez perdre.\n`;

  return sendTelegramMessage(message);
}

/**
 * Publie une alerte live
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

/**
 * Publie les résultats
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

/**
 * Récupère le CHAT_ID
 */
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

/**
 * Teste la connexion
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

export default {
  sendTelegramMessage,
  publishPredictionToTelegram,
  publishDailySummaryToTelegram,
  publishValueBetsToTelegram,
  publishKamikazeToTelegram,
  publishLiveAlertToTelegram,
  publishResultsToTelegram,
  getTelegramChatId,
  testTelegramConnection,
  isSafeOrModerate,
  isKamikaze,
};