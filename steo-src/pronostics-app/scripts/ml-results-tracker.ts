/**
 * ML Results Tracker - Suit les résultats des pronostics ML
 * 
 * Fonctionnalités:
 * - Enregistre les pronostics ML chaque jour
 * - Récupère les résultats réels des matchs
 * - Calcule le ratio de réussite sur 7 jours glissants
 * - Active l'onglet Expert ML si ratio >= 70%
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const ML_RESULTS_FILE = path.join(DATA_DIR, 'ml-results-tracking.json');

// Interface pour un pronostic suivi
interface TrackedPick {
  id: string;
  matchId: string;
  sport: 'football' | 'basketball' | 'tennis';
  date: string;
  
  // Pronostic
  homeTeam: string;
  awayTeam: string;
  bet: string;
  betLabel: string;
  odds: number;
  
  // Analyse ML
  winProbability: number;
  confidence: string;
  type: 'safe' | 'fun';
  
  // Résultat
  result?: 'won' | 'lost' | 'void' | 'pending';
  actualScore?: string;
  verifiedAt?: string;
}

// Interface pour les stats quotidiennes
interface DailyStats {
  date: string;
  total: number;
  won: number;
  lost: number;
  pending: number;
  ratio: number;
  bySport: {
    football: { total: number; won: number };
    basketball: { total: number; won: number };
    tennis: { total: number; won: number };
  };
}

// Interface pour le fichier de suivi
interface MLResultsTracking {
  picks: TrackedPick[];
  dailyStats: DailyStats[];
  weeklyRatio: number;
  last7Days: {
    total: number;
    won: number;
    ratio: number;
  };
  lastUpdated: string;
  expertMLVisible: boolean; // true si ratio >= 70%
  history: {
    date: string;
    ratio: number;
    visible: boolean;
  }[];
}

// ============================================
// CHARGEMENT DES DONNÉES
// ============================================

function loadTracking(): MLResultsTracking {
  try {
    if (fs.existsSync(ML_RESULTS_FILE)) {
      return JSON.parse(fs.readFileSync(ML_RESULTS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Erreur chargement tracking:', e);
  }
  
  return {
    picks: [],
    dailyStats: [],
    weeklyRatio: 0,
    last7Days: { total: 0, won: 0, ratio: 0 },
    lastUpdated: new Date().toISOString(),
    expertMLVisible: false,
    history: []
  };
}

function saveTracking(tracking: MLResultsTracking): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  tracking.lastUpdated = new Date().toISOString();
  fs.writeFileSync(ML_RESULTS_FILE, JSON.stringify(tracking, null, 2));
  console.log('✅ Tracking ML sauvegardé');
}

// ============================================
// CHARGEMENT DES PRONOSTICS
// ============================================

async function loadMLPicks(): Promise<TrackedPick[]> {
  const picks: TrackedPick[] = [];
  const today = new Date().toISOString().split('T')[0];
  
  // Charger les pronostics tennis
  try {
    const tennisFile = path.join(DATA_DIR, 'tennis-predictions.json');
    if (fs.existsSync(tennisFile)) {
      const data = JSON.parse(fs.readFileSync(tennisFile, 'utf-8'));
      for (const pred of data.predictions || []) {
        // Ne garder que les SAFE
        if (pred.prediction?.confidence === 'very_high' || pred.prediction?.confidence === 'high') {
          const winner = pred.prediction?.winner || 'player1';
          const winnerName = winner === 'player1' ? pred.player1 : pred.player2;
          const winnerOdds = winner === 'player1' ? pred.odds1 : pred.odds2;
          
          picks.push({
            id: `tennis_${pred.matchId}`,
            matchId: pred.matchId,
            sport: 'tennis',
            date: pred.date || today,
            homeTeam: pred.player1,
            awayTeam: pred.player2,
            bet: winner,
            betLabel: `Victoire ${winnerName}`,
            odds: winnerOdds,
            winProbability: pred.prediction?.winProbability || 70,
            confidence: pred.prediction?.confidence,
            type: 'safe',
            result: 'pending'
          });
        }
      }
    }
  } catch (e) {
    console.error('Erreur chargement tennis:', e);
  }
  
  // Charger les pronostics expert (football/basket)
  try {
    const expertFile = path.join(DATA_DIR, 'expert-advices.json');
    if (fs.existsSync(expertFile)) {
      const data = JSON.parse(fs.readFileSync(expertFile, 'utf-8'));
      for (const advice of data.advices || []) {
        // Ne garder que confidence high/very_high avec bonne probabilité
        if (advice.recommendation?.confidence === 'high' || 
            advice.recommendation?.confidence === 'very_high') {
          const sport = advice.sport?.toLowerCase().includes('basket') ? 'basketball' : 'football';
          const odds = advice.oddsAnalysis?.favoriteOdds || 1.85;
          
          // Calculer la probabilité estimée
          const impliedProb = Math.round((1 / odds) * 100);
          
          picks.push({
            id: `expert_${advice.matchId}`,
            matchId: advice.matchId,
            sport,
            date: advice.matchDate || today,
            homeTeam: advice.homeTeam,
            awayTeam: advice.awayTeam,
            bet: advice.recommendation.bet,
            betLabel: advice.recommendation.reasoning?.[0] || `${advice.recommendation.bet}`,
            odds,
            winProbability: impliedProb,
            confidence: advice.recommendation.confidence,
            type: 'safe',
            result: 'pending'
          });
        }
      }
    }
  } catch (e) {
    console.error('Erreur chargement expert:', e);
  }
  
  return picks;
}

// ============================================
// VÉRIFICATION DES RÉSULTATS
// ============================================

async function verifyResults(tracking: MLResultsTracking): Promise<void> {
  console.log('\n🔍 Vérification des résultats...');
  
  const pendingPicks = tracking.picks.filter(p => p.result === 'pending');
  console.log(`   ${pendingPicks.length} pronostics en attente de vérification`);
  
  // Pour chaque pronostic en attente, on devrait vérifier le résultat réel
  // Pour l'instant, on simule avec les données disponibles
  
  // Note: Dans un vrai système, il faudrait appeler une API de résultats
  // comme API-Football, NBA API, ou ATP/WTA pour les résultats tennis
  
  // Marquer les vieux pronostics comme "void" si aucun résultat après 48h
  const now = new Date();
  const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  
  for (const pick of pendingPicks) {
    const pickDate = new Date(pick.date);
    if (pickDate < cutoff) {
      // Pour les démonstration, on marque certains comme gagnants/perdants
      // En production, il faudrait vérifier les vrais résultats
      console.log(`   Match ${pick.homeTeam} vs ${pick.awayTeam} - Résultat non vérifié`);
    }
  }
}

// ============================================
// CALCUL DES STATISTIQUES
// ============================================

function calculateStats(tracking: MLResultsTracking): void {
  console.log('\n📊 Calcul des statistiques...');
  
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  // Filtrer les pronostics des 7 derniers jours avec résultat
  const lastWeekPicks = tracking.picks.filter(p => {
    const pickDate = new Date(p.date);
    return pickDate >= sevenDaysAgo && p.result !== 'pending' && p.result !== 'void';
  });
  
  const won = lastWeekPicks.filter(p => p.result === 'won').length;
  const total = lastWeekPicks.length;
  const ratio = total > 0 ? Math.round((won / total) * 100) : 0;
  
  tracking.last7Days = { total, won, ratio };
  tracking.weeklyRatio = ratio;
  
  // Décision d'affichage: visible si ratio >= 70% ET au moins 10 pronostics
  tracking.expertMLVisible = ratio >= 70 && total >= 10;
  
  console.log(`   7 derniers jours: ${won}/${total} = ${ratio}%`);
  console.log(`   Expert ML visible: ${tracking.expertMLVisible ? '✅ OUI' : '❌ NON (besoins: ratio >= 70% et >= 10 pronostics)'}`);
  
  // Stats par sport
  const bySport = {
    football: { total: 0, won: 0 },
    basketball: { total: 0, won: 0 },
    tennis: { total: 0, won: 0 }
  };
  
  for (const pick of lastWeekPicks) {
    bySport[pick.sport].total++;
    if (pick.result === 'won') {
      bySport[pick.sport].won++;
    }
  }
  
  // Stats quotidiennes
  const today = now.toISOString().split('T')[0];
  const todayPicks = tracking.picks.filter(p => p.date.startsWith(today));
  const todayWon = todayPicks.filter(p => p.result === 'won').length;
  const todayLost = todayPicks.filter(p => p.result === 'lost').length;
  const todayPending = todayPicks.filter(p => p.result === 'pending').length;
  
  const existingDaily = tracking.dailyStats.find(d => d.date === today);
  if (!existingDaily) {
    tracking.dailyStats.push({
      date: today,
      total: todayPicks.length,
      won: todayWon,
      lost: todayLost,
      pending: todayPending,
      ratio: todayPicks.length > 0 ? Math.round((todayWon / (todayWon + todayLost)) * 100) || 0 : 0,
      bySport
    });
  }
  
  // Historique
  const existingHistory = tracking.history.find(h => h.date === today);
  if (!existingHistory) {
    tracking.history.push({
      date: today,
      ratio,
      visible: tracking.expertMLVisible
    });
  }
  
  // Garder seulement les 30 derniers jours d'historique
  tracking.history = tracking.history.slice(-30);
  tracking.dailyStats = tracking.dailyStats.slice(-30);
}

// ============================================
// ENREGISTREMENT DES NOUVEAUX PRONOSTICS
// ============================================

async function recordNewPicks(tracking: MLResultsTracking): Promise<void> {
  console.log('\n📝 Enregistrement des nouveaux pronostics...');
  
  const today = new Date().toISOString().split('T')[0];
  const existingIds = new Set(tracking.picks.map(p => p.id));
  
  // Charger les pronostics actuels
  const currentPicks = await loadMLPicks();
  
  let added = 0;
  for (const pick of currentPicks) {
    if (!existingIds.has(pick.id)) {
      tracking.picks.push(pick);
      added++;
    }
  }
  
  console.log(`   ${added} nouveaux pronostics ajoutés`);
  console.log(`   Total: ${tracking.picks.length} pronostics suivis`);
  
  // Nettoyer les vieux pronostics (>30 jours)
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const beforeCount = tracking.picks.length;
  tracking.picks = tracking.picks.filter(p => new Date(p.date) >= cutoff);
  const removed = beforeCount - tracking.picks.length;
  
  if (removed > 0) {
    console.log(`   ${removed} anciens pronostics supprimés (>30 jours)`);
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🎯 ML Results Tracker');
  console.log('=====================\n');
  
  // Charger les données existantes
  const tracking = loadTracking();
  console.log(`📂 Tracking chargé: ${tracking.picks.length} pronostics`);
  
  // Enregistrer les nouveaux pronostics
  await recordNewPicks(tracking);
  
  // Vérifier les résultats (si des matchs sont terminés)
  await verifyResults(tracking);
  
  // Calculer les statistiques
  calculateStats(tracking);
  
  // Sauvegarder
  saveTracking(tracking);
  
  // Afficher le résumé
  console.log('\n📈 RÉSUMÉ');
  console.log('=========');
  console.log(`Pronostics suivis: ${tracking.picks.length}`);
  console.log(`7 derniers jours: ${tracking.last7Days.won}/${tracking.last7Days.total} (${tracking.last7Days.ratio}%)`);
  console.log(`Expert ML visible: ${tracking.expertMLVisible ? '✅ OUI' : '❌ NON'}`);
  
  // Retourner le statut pour le CI/CD
  if (tracking.expertMLVisible) {
    console.log('\n🎉 Expert ML peut être affiché !');
  } else {
    console.log('\n⏳ Expert ML en mode apprentissage...');
    console.log(`   Besoin: ratio >= 70% et >= 10 pronostics vérifiés`);
    console.log(`   Actuel: ratio ${tracking.last7Days.ratio}%, ${tracking.last7Days.total} pronostics`);
  }
}

main().catch(console.error);
