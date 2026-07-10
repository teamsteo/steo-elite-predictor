/**
 * API CRON Tennis Auto-Publish V2 - Publication automatique intelligente
 * 
 * 🎯 FONCTIONNALITÉS:
 * 1. Publication matinale: Résumé des matchs du jour
 * 2. Publication soir: Résultats et apprentissage
 * 3. Alertes live: Matchs en cours avec opportunités
 * 
 * 📅 HORAIRE:
 * - 07:30 UTC: Grands tournois (Grand Chelem, Masters 1000)
 * - 09:00 UTC: Résumé complet ATP/WTA
 * - 18:00 UTC: Value bets du soir
 */

import { NextResponse } from 'next/server';
import { sendTelegramMessage, isSafeOrModerate, isKamikaze } from '@/lib/telegramService';
import SupabaseStore from '@/lib/db-supabase';

// Import des services tennis
import { predictMatchV2, fetchATPRankings2026, fetchWTARankings2026 } from '@/lib/tennis-enhanced/prediction-engine-v2';
import { collectMatches, getTournamentImportanceFactor } from '@/lib/tennis-enhanced/smart-collector';

// Secret pour sécuriser les appels CRON
const CRON_SECRET = process.env.CRON_SECRET || 'secretsteo-elitecron2026';

// ============================================
// INTERFACES
// ============================================

interface PublishResult {
  success: boolean;
  published: number;
  mode: string;
  message: string;
  timestamp: string;
  details?: {
    veryHigh: number;
    high: number;
    medium: number;
    total: number;
  };
}

// ============================================
// GET - Point d'entrée CRON
// ============================================

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const mode = searchParams.get('mode') || 'summary'; // summary | major | valuebets | results | kamikaze
  const test = searchParams.get('test') === 'true';
  
  // Vérification du secret
  if (!test && secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  console.log(`[TennisAutoPublish] 🎾 Démarrage mode: ${mode}`);
  console.log('================================================');
  
  try {
    let result: PublishResult;
    
    switch (mode) {
      case 'major':
        result = await publishMajorTournaments(test);
        break;
      case 'valuebets':
        result = await publishValueBets(test);
        break;
      case 'results':
        result = await publishResults(test);
        break;
      case 'kamikaze':
        result = await publishKamikaze(test);
        break;
      case 'summary':
      default:
        result = await publishDailySummary(test);
        break;
    }
    
    console.log('================================================');
    console.log(`[TennisAutoPublish] ✅ Terminé: ${result.message}`);
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('[TennisAutoPublish] ❌ Erreur:', error);
    return NextResponse.json({
      success: false,
      published: 0,
      mode,
      message: `Erreur: ${error}`,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// ============================================
// PUBLICATION: RÉSUMÉ QUOTIDIEN
// ============================================

async function publishDailySummary(test: boolean): Promise<PublishResult> {
  console.log('[TennisAutoPublish] 📅 Génération résumé quotidien...');
  
  // Récupérer les classements live
  const [atpRankings, wtaRankings] = await Promise.all([
    fetchATPRankings2026(),
    fetchWTARankings2026(),
  ]);
  
  console.log(`[TennisAutoPublish] 📊 Classements: ATP ${atpRankings.length} | WTA ${wtaRankings.length}`);
  
  // Collecter les matchs
  const matches = await collectMatches();
  
  if (matches.length === 0) {
    // Aucun match programmé du tout
    const infoMessage = buildNoMatchMessage(atpRankings, wtaRankings, false);
    
    if (!test) {
      await sendTelegramMessage(infoMessage);
    }
    
    return {
      success: true,
      published: 0,
      mode: 'summary',
      message: 'Aucun match aujourd\'hui - info envoyée',
      timestamp: new Date().toISOString(),
    };
  }
  
  console.log(`[TennisAutoPublish] 🎾 ${matches.length} matchs à analyser`);
  
  // Générer les prédictions V2
  const predictions: any[] = [];
  for (const match of matches.slice(0, 20)) { // Limiter à 20 matchs
    try {
      const prediction = await predictMatchV2(match);
      predictions.push(prediction);
    } catch (error) {
      console.error(`[TennisAutoPublish] Erreur match ${match.player1} vs ${match.player2}:`, error);
    }
  }
  
  // Filtrer les prédictions publiables (safe et modéré)
  const publishable = predictions.filter(p => 
    isSafeOrModerate(p.prediction.riskPercentage) &&
    p.crossValidation.status !== 'excluded'
  );
  
  // 🆕 CAS: Il y a des matchs mais aucun safe/modéré -> Afficher directement les Kamikaze
  if (publishable.length === 0 && predictions.length > 0) {
    console.log(`[TennisAutoPublish] ⚠️ ${predictions.length} matchs mais aucun safe/modéré`);

    // Filtrer les Kamikaze (risque >= 51%)
    const kamikazePicks = predictions.filter(p => isKamikaze(p.prediction.riskPercentage));

    // 💾 Sauvegarder les kamikaze dans Supabase (même voie de secours)
    if (kamikazePicks.length > 0) {
      try {
        const cleanTeam = (name: string) => (name || '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
        const dbKam = kamikazePicks.map(p => {
          const dateStr = new Date().toISOString().split('T')[0];
          return {
            match_id: `tennis-kam-${cleanTeam(p.player1)}-${cleanTeam(p.player2)}-${dateStr}`,
            home_team: p.player1, away_team: p.player2,
            league: p.tournament || 'ATP', sport: 'tennis' as const,
            match_date: new Date().toISOString(),
            odds_home: p.odds1 || 1.0, odds_draw: null, odds_away: p.odds2 || 1.0,
            predicted_result: (p.prediction?.winner === 'player1' ? 'home' : 'away') as 'home' | 'away',
            confidence: p.prediction?.confidence || 'medium',
            risk_percentage: p.prediction?.riskPercentage || 50,
            status: 'pending' as const,
          };
        });
        await SupabaseStore.addPredictions(dbKam);
        console.log(`[TennisAutoPublish] 💾 ${dbKam.length} kamikaze (fallback) sauvegardés dans Supabase`);
      } catch (e: any) {
        console.log(`[TennisAutoPublish] ⚠️ Erreur sauvegarde kamikaze fallback: ${e.message}`);
      }
    }

    const infoMessage = buildNoMatchMessage(atpRankings, wtaRankings, true, kamikazePicks);

    if (!test) {
      await sendTelegramMessage(infoMessage);
    }

    return {
      success: true,
      published: kamikazePicks.length,
      mode: 'summary',
      message: `${predictions.length} matchs - ${kamikazePicks.length} Kamikaze affichés`,
      timestamp: new Date().toISOString(),
    };
  }
  
  // Trier par confiance et importance
  publishable.sort((a, b) => {
    const confOrder = { very_high: 0, high: 1, medium: 2, low: 3 };
    const confDiff = (confOrder[a.prediction.confidence] || 2) - (confOrder[b.prediction.confidence] || 2);
    if (confDiff !== 0) return confDiff;
    return b.prediction.winProbability - a.prediction.winProbability;
  });
  
  // Construire le message
  const message = buildSummaryMessage(publishable, atpRankings, wtaRankings);
  
  // 💾 Sauvegarder les prédictions tennis dans Supabase (pour le bilan)
  let savedCount = 0;
  try {
    const cleanTeam = (name: string) => (name || '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const dbPredictions = publishable.map(p => {
      const dateStr = new Date().toISOString().split('T')[0];
      return {
        match_id: `tennis-${cleanTeam(p.player1)}-${cleanTeam(p.player2)}-${dateStr}`,
        home_team: p.player1,
        away_team: p.player2,
        league: p.tournament || 'ATP',
        sport: 'tennis' as const,
        match_date: new Date().toISOString(),
        odds_home: p.odds1 || 1.0,
        odds_draw: null,
        odds_away: p.odds2 || 1.0,
        predicted_result: (p.prediction?.winner === 'player1' ? 'home' : 'away') as 'home' | 'away',
        confidence: p.prediction?.confidence || 'medium',
        risk_percentage: p.prediction?.riskPercentage || 50,
        status: 'pending' as const,
      };
    });
    savedCount = await SupabaseStore.addPredictions(dbPredictions);
    console.log(`[TennisAutoPublish] 💾 ${savedCount} prédictions tennis sauvegardées dans Supabase`);
  } catch (e: any) {
    console.log(`[TennisAutoPublish] ⚠️ Erreur sauvegarde Supabase: ${e.message}`);
  }

  // Envoyer si pas en test
  if (!test && publishable.length > 0) {
    const sent = await sendTelegramMessage(message);
    if (!sent) {
      return {
        success: false,
        published: 0,
        mode: 'summary',
        message: 'Erreur envoi Telegram',
        timestamp: new Date().toISOString(),
      };
    }
  }
  
  // Stats
  const veryHigh = publishable.filter(p => p.prediction.confidence === 'very_high').length;
  const high = publishable.filter(p => p.prediction.confidence === 'high').length;
  const medium = publishable.filter(p => p.prediction.confidence === 'medium').length;
  
  return {
    success: true,
    published: publishable.length,
    mode: 'summary',
    message: `${publishable.length} pronostics publiés`,
    timestamp: new Date().toISOString(),
    details: { veryHigh, high, medium, total: publishable.length },
  };
}

// ============================================
// PUBLICATION: GRANDS TOURNOIS
// ============================================

async function publishMajorTournaments(test: boolean): Promise<PublishResult> {
  console.log('[TennisAutoPublish] ⭐ Génération grands tournois...');
  
  const matches = await collectMatches();
  
  // Filtrer uniquement les grands tournois
  const majorMatches = matches.filter(m => 
    ['grand_slam', 'masters_1000', 'wta_1000'].includes(m.tournamentTier)
  );
  
  if (majorMatches.length === 0) {
    return {
      success: true,
      published: 0,
      mode: 'major',
      message: 'Aucun grand tournoi aujourd\'hui',
      timestamp: new Date().toISOString(),
    };
  }
  
  // Générer les prédictions
  const predictions: any[] = [];
  for (const match of majorMatches) {
    try {
      const prediction = await predictMatchV2(match);
      predictions.push(prediction);
    } catch (error) {
      console.error('[TennisAutoPublish] Erreur prédiction:', error);
    }
  }
  
  // Filtrer safe/modéré
  const publishable = predictions.filter(p => isSafeOrModerate(p.prediction.riskPercentage));
  
  // Construire et envoyer le message
  const message = buildMajorTournamentsMessage(publishable);
  
  if (!test && publishable.length > 0) {
    await sendTelegramMessage(message);
  }
  
  return {
    success: true,
    published: publishable.length,
    mode: 'major',
    message: `${publishable.length} pronostics grands tournois`,
    timestamp: new Date().toISOString(),
  };
}

// ============================================
// PUBLICATION: VALUE BETS
// ============================================

async function publishValueBets(test: boolean): Promise<PublishResult> {
  console.log('[TennisAutoPublish] 💎 Génération value bets...');
  
  const matches = await collectMatches();
  
  // Générer les prédictions
  const predictions: any[] = [];
  for (const match of matches) {
    try {
      const prediction = await predictMatchV2(match);
      predictions.push(prediction);
    } catch (error) {
      console.error('[TennisAutoPublish] Erreur prédiction:', error);
    }
  }
  
  // Filtrer uniquement les value bets
  const valueBets = predictions.filter(p => 
    p.betting.recommendedBet &&
    p.betting.expectedValue > 10 &&
    isSafeOrModerate(p.prediction.riskPercentage)
  );
  
  if (valueBets.length === 0) {
    return {
      success: true,
      published: 0,
      mode: 'valuebets',
      message: 'Aucun value bet détecté',
      timestamp: new Date().toISOString(),
    };
  }
  
  // 💾 Sauvegarder les value bets tennis dans Supabase
  try {
    const cleanTeam = (name: string) => (name || '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const dbPredictions = valueBets.map(p => {
      const dateStr = new Date().toISOString().split('T')[0];
      return {
        match_id: `tennis-vb-${cleanTeam(p.player1)}-${cleanTeam(p.player2)}-${dateStr}`,
        home_team: p.player1,
        away_team: p.player2,
        league: p.tournament || 'ATP',
        sport: 'tennis' as const,
        match_date: new Date().toISOString(),
        odds_home: p.odds1 || 1.0,
        odds_draw: null,
        odds_away: p.odds2 || 1.0,
        predicted_result: (p.prediction?.winner === 'player1' ? 'home' : 'away') as 'home' | 'away',
        confidence: p.prediction?.confidence || 'medium',
        risk_percentage: p.prediction?.riskPercentage || 50,
        status: 'pending' as const,
      };
    });
    await SupabaseStore.addPredictions(dbPredictions);
    console.log(`[TennisAutoPublish] 💾 ${dbPredictions.length} value bets tennis sauvegardés dans Supabase`);
  } catch (e: any) {
    console.log(`[TennisAutoPublish] ⚠️ Erreur sauvegarde VB Supabase: ${e.message}`);
  }

  // Construire et envoyer le message
  const message = buildValueBetsMessage(valueBets);
  
  if (!test) {
    await sendTelegramMessage(message);
  }
  
  return {
    success: true,
    published: valueBets.length,
    mode: 'valuebets',
    message: `${valueBets.length} value bets publiés`,
    timestamp: new Date().toISOString(),
  };
}

// ============================================
// PUBLICATION: KAMIKAZE (HAUT RISQUE)
// ============================================

async function publishKamikaze(test: boolean): Promise<PublishResult> {
  console.log('[TennisAutoPublish] 💣 Génération sélection Kamikaze...');
  
  const matches = await collectMatches();
  
  if (matches.length === 0) {
    return {
      success: true,
      published: 0,
      mode: 'kamikaze',
      message: 'Aucun match disponible pour Kamikaze',
      timestamp: new Date().toISOString(),
    };
  }
  
  // Générer les prédictions
  const predictions: any[] = [];
  for (const match of matches) {
    try {
      const prediction = await predictMatchV2(match);
      predictions.push(prediction);
    } catch (error) {
      console.error('[TennisAutoPublish] Erreur prédiction:', error);
    }
  }
  
  // Filtrer UNIQUEMENT les Kamikaze (risque > 50%)
  const kamikazePicks = predictions.filter(p => isKamikaze(p.prediction.riskPercentage));
  
  if (kamikazePicks.length === 0) {
    return {
      success: true,
      published: 0,
      mode: 'kamikaze',
      message: 'Aucun pronostic Kamikaze détecté',
      timestamp: new Date().toISOString(),
    };
  }
  
  // Trier par cote décroissante (plus gros potentiel)
  kamikazePicks.sort((a, b) => {
    const oddsA = Math.max(a.odds1 || 1, a.odds2 || 1);
    const oddsB = Math.max(b.odds1 || 1, b.odds2 || 1);
    return oddsB - oddsA;
  });
  
  // 💾 Sauvegarder les kamikaze tennis dans Supabase (pour le bilan kamikaze)
  try {
    const cleanTeam = (name: string) => (name || '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const dbPredictions = kamikazePicks.map(p => {
      const dateStr = new Date().toISOString().split('T')[0];
      return {
        match_id: `tennis-kam-${cleanTeam(p.player1)}-${cleanTeam(p.player2)}-${dateStr}`,
        home_team: p.player1,
        away_team: p.player2,
        league: p.tournament || 'ATP',
        sport: 'tennis' as const,
        match_date: new Date().toISOString(),
        odds_home: p.odds1 || 1.0,
        odds_draw: null,
        odds_away: p.odds2 || 1.0,
        predicted_result: (p.prediction?.winner === 'player1' ? 'home' : 'away') as 'home' | 'away',
        confidence: p.prediction?.confidence || 'medium',
        risk_percentage: p.prediction?.riskPercentage || 50,
        status: 'pending' as const,
      };
    });
    await SupabaseStore.addPredictions(dbPredictions);
    console.log(`[TennisAutoPublish] 💾 ${dbPredictions.length} kamikaze tennis sauvegardés dans Supabase`);
  } catch (e: any) {
    console.log(`[TennisAutoPublish] ⚠️ Erreur sauvegarde kamikaze Supabase: ${e.message}`);
  }

  // Construire et envoyer le message
  const message = buildKamikazeMessage(kamikazePicks);
  
  if (!test) {
    await sendTelegramMessage(message);
  }
  
  return {
    success: true,
    published: kamikazePicks.length,
    mode: 'kamikaze',
    message: `💣 ${kamikazePicks.length} pronostics Kamikaze publiés`,
    timestamp: new Date().toISOString(),
  };
}

// ============================================
// PUBLICATION: RÉSULTATS
// ============================================

async function publishResults(test: boolean): Promise<PublishResult> {
  console.log('[TennisAutoPublish] 📊 Publication résultats...');
  
  // TODO: Implémenter la récupération des résultats réels
  // Pour l'instant, juste un message placeholder
  
  return {
    success: true,
    published: 0,
    mode: 'results',
    message: 'Fonctionnalité en cours de développement',
    timestamp: new Date().toISOString(),
  };
}

// ============================================
// BUILDERS DE MESSAGES
// ============================================

function buildSummaryMessage(
  predictions: any[],
  atpRankings: any[],
  wtaRankings: any[]
): string {
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  
  // Stats
  const atp = predictions.filter(p => !p.player1Data?.id?.includes('wta'));
  const wta = predictions.filter(p => p.player1Data?.id?.includes('wta'));
  const veryHigh = predictions.filter(p => p.prediction.confidence === 'very_high').length;
  const high = predictions.filter(p => p.prediction.confidence === 'high').length;
  const valueBets = predictions.filter(p => p.betting.recommendedBet).length;
  
  let message = '';
  
  // En-tête
  message += '╔════════════════════════════╗\n';
  message += '║  🎾 PRONOSTICS TENNIS 2026  ║\n';
  message += '╚════════════════════════════╝\n\n';
  
  message += `📅 <b>${today.charAt(0).toUpperCase() + today.slice(1)}</b>\n\n`;
  
  // Stats globales
  message += `🎯 <b>${predictions.length} PRONOSTICS</b>\n`;
  message += `    ⚪ ATP: ${atp.length} | WTA: ${wta.length}\n`;
  message += `    🔥 Très haute confiance: ${veryHigh}\n`;
  message += `    ✅ Haute confiance: ${high}\n`;
  if (valueBets > 0) {
    message += `    💎 Value bets: ${valueBets}\n`;
  }
  message += '\n';
  
  // Détail des matchs (max 10 pour garder lisible)
  message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `<b>📋 PRONOSTICS DU JOUR</b>\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  for (let i = 0; i < Math.min(predictions.length, 10); i++) {
    const p = predictions[i];
    const confEmoji = p.prediction.confidence === 'very_high' ? '🔥' :
                      p.prediction.confidence === 'high' ? '✅' : '⚡';
    const riskEmoji = p.prediction.riskPercentage <= 30 ? '🟢' : '🟡';
    const betOption = p.prediction.winner === 'player1' ? '1️⃣' : '2️⃣';
    
    message += `<b>${i + 1}.</b> ${p.player1} vs ${p.player2}\n`;
    message += `    🏆 ${p.tournament}\n`;
    message += `    🎯 ${betOption} <b>${p.prediction.winnerName}</b>\n`;
    message += `    ${confEmoji} ${p.prediction.winProbability}% | ${riskEmoji} Risque ${p.prediction.riskPercentage}%\n`;
    
    if (p.betting.recommendedBet) {
      message += `    💎 Value Bet: EV +${p.betting.expectedValue}%\n`;
    }
    
    message += '\n';
  }
  
  if (predictions.length > 10) {
    message += `<i>... et ${predictions.length - 10} autres matchs</i>\n\n`;
  }
  
  // Pied de message
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  message += '🟢 Safe: Risque ≤ 30%\n';
  message += '🟡 Modéré: Risque 31-50%\n';
  message += '🔥 Très haute confiance: 80%+\n';
  message += '💎 Value Bet: EV > 10%\n';
  
  return message;
}

function buildMajorTournamentsMessage(predictions: any[]): string {
  let message = '';
  
  message += '╔════════════════════════════╗\n';
  message += '║ ⭐ GRANDS TOURNOIS 2026 ⭐  ║\n';
  message += '╚════════════════════════════╝\n\n';
  
  message += `🔥 <b>${predictions.length} match${predictions.length > 1 ? 's' : ''} majeur${predictions.length > 1 ? 's' : ''}</b>\n\n`;
  
  for (let i = 0; i < predictions.length; i++) {
    const p = predictions[i];
    const tierEmoji = p.tournamentTier === 'grand_slam' ? '🏆' : '🥇';
    const confEmoji = p.prediction.confidence === 'very_high' ? '🔥' : '✅';
    const betOption = p.prediction.winner === 'player1' ? '1️⃣' : '2️⃣';
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `${tierEmoji} <b>${p.tournament.toUpperCase()}</b>\n`;
    message += `👤 ${p.player1} vs ${p.player2}\n`;
    message += `🎯 ${betOption} <b>${p.prediction.winnerName}</b>\n`;
    message += `${confEmoji} ${p.prediction.winProbability}% | Cote: ${p.betting.winnerOdds.toFixed(2)}\n\n`;
  }
  
  return message;
}

function buildValueBetsMessage(predictions: any[]): string {
  let message = '';
  
  message += '╔════════════════════════════╗\n';
  message += '║  💎 VALUE BETS TENNIS 2026 ║\n';
  message += '╚════════════════════════════╝\n\n';
  
  message += `🔥 <b>${predictions.length} opportunité${predictions.length > 1 ? 's' : ''}</b>\n\n`;
  
  for (let i = 0; i < predictions.length; i++) {
    const p = predictions[i];
    const betOption = p.prediction.winner === 'player1' ? '1️⃣' : '2️⃣';
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `<b>${i + 1}. ${p.player1} vs ${p.player2}</b>\n`;
    message += `🏆 ${p.tournament}\n`;
    message += `🎯 ${betOption} <b>${p.prediction.winnerName}</b>\n`;
    message += `📊 Cote: ${p.betting.winnerOdds.toFixed(2)} | EV: <b>+${p.betting.expectedValue}%</b>\n`;
    message += `🔥 Réussite: <b>${p.prediction.winProbability}%</b>\n\n`;
  }
  
  return message;
}

function buildKamikazeMessage(predictions: any[]): string {
  let message = '';
  
  message += '╔════════════════════════════╗\n';
  message += '║ 💣 TENNIS KAMIKAZE 2026 💣 ║\n';
  message += '╚════════════════════════════╝\n\n';
  
  message += `⚠️ <b>HAUT RISQUE - HAUTE RÉCOMPENSE</b>\n`;
  message += `🔥 <b>${predictions.length} opportunité${predictions.length > 1 ? 's' : ''} à gros potentiel</b>\n\n`;
  
  for (let i = 0; i < predictions.length; i++) {
    const p = predictions[i];
    const betOption = p.prediction.winner === 'player1' ? '1️⃣' : '2️⃣';
    const maxOdds = Math.max(p.odds1 || 1, p.odds2 || 1);
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `<b>${i + 1}. ${p.player1} vs ${p.player2}</b>\n`;
    message += `🏆 ${p.tournament}\n`;
    message += `🎯 ${betOption} <b>${p.prediction.winnerName}</b>\n`;
    message += `📊 Cotes: 1️⃣ ${(p.odds1 || 1).toFixed(2)} | 2️⃣ ${(p.odds2 || 1).toFixed(2)}\n`;
    message += `💥 Risque: <b>${p.prediction.riskPercentage}%</b>\n`;
    message += `💰 Gain potentiel: <b>x${maxOdds.toFixed(2)}</b>\n`;
    message += `🔥 Réussite: <b>${p.prediction.winProbability}%</b>\n\n`;
  }
  
  message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `⚠️ <b>ATTENTION</b>\n`;
  message += `Ces pronostics sont très risqués.\n`;
  message += `Ne pariez que ce que vous pouvez perdre.\n`;
  
  return message;
}

function buildNoMatchMessage(atpRankings: any[], wtaRankings: any[], hasMatchesButNotSafe: boolean = false, kamikazePicks: any[] = []): string {
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  let message = '';

  message += '╔════════════════════════════╗\n';
  message += '║  🎾 TENNIS 2026 - INFO     ║\n';
  message += '╚════════════════════════════╝\n\n';

  message += `📅 <b>${today.charAt(0).toUpperCase() + today.slice(1)}</b>\n\n`;

  if (hasMatchesButNotSafe) {
    // Il y a des matchs mais aucun n'est safe/modéré
    message += `⚠️ <b>AUCUN PRONOSTIC SAFE/MODÉRÉ</b>\n\n`;
    message += `📊 Des matchs sont programmés aujourd'hui,\n`;
    message += `    mais aucun ne répond aux critères:\n`;
    message += `    🟢 Safe (risque ≤ 30%)\n`;
    message += `    🟡 Modéré (risque 31-50%)\n\n`;

    // Afficher DIRECTEMENT les matchs Kamikaze disponibles
    if (kamikazePicks.length > 0) {
      message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `💣 <b>SÉLECTION KAMIKAZE</b>\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      message += `⚠️ <b>HAUT RISQUE - HAUTE RÉCOMPENSE</b>\n`;
      message += `🔥 <b>${kamikazePicks.length} opportunité${kamikazePicks.length > 1 ? 's' : ''}</b>\n\n`;

      kamikazePicks.slice(0, 5).forEach((p, i) => {
        const tierEmoji = p.tournamentTier === 'grand_slam' ? '🏆' :
                          ['masters_1000', 'wta_1000'].includes(p.tournamentTier) ? '🥇' : '🎾';
        const maxOdds = Math.max(p.odds1 || 1, p.odds2 || 1);
        const betOption = p.prediction?.winner === 'player1' ? '1️⃣' : '2️⃣';

        message += `<b>${i + 1}. ${p.player1} vs ${p.player2}</b>\n`;
        message += `${tierEmoji} ${p.tournament}\n`;
        message += `🎯 ${betOption} <b>${p.prediction?.winnerName || 'N/A'}</b>\n`;
        message += `📊 Cotes: ${(p.odds1 || 1).toFixed(2)} / ${(p.odds2 || 1).toFixed(2)}\n`;
        message += `💥 Risque: <b>${p.prediction?.riskPercentage}%</b>`;
        message += ` | 💰 x${maxOdds.toFixed(2)}\n`;
        message += `🔥 Réussite: <b>${p.prediction?.winProbability}%</b>\n\n`;
      });

      if (kamikazePicks.length > 5) {
        message += `<i>... et ${kamikazePicks.length - 5} autres</i>\n\n`;
      }

      message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `⚠️ <b>ATTENTION</b>\n`;
      message += `Ces pronostics sont très risqués.\n`;
      message += `Ne pariez que ce que vous pouvez perdre.\n`;
    } else {
      // Pas de Kamikaze non plus
      message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `ℹ️ <b>AUCUN MATCH KAMIKAZE</b>\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      message += `Les matchs du jour ne présentent pas\n`;
      message += `d'opportunités à haut risque identifiables.\n\n`;
      message += `📅 Revenez demain!\n`;
    }
  } else {
    // Aucun match programmé du tout
    message += `ℹ️ <b>Aucun match programmé aujourd'hui</b>\n\n`;
    message += `📅 Revenez demain pour les prochains\n`;
    message += `    pronostics tennis!\n\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `💡 <b>CONSEIL</b>\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    message += `🧐 Vérifiez aussi les autres sports:\n`;
    message += `    ⚽ Football\n`;
    message += `    🏀 Basketball\n`;
    message += `    🏒 Hockey\n`;
  }

  return message;
}

// Support POST
export async function POST(request: Request) {
  return GET(request);
}
