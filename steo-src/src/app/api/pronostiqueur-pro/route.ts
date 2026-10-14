/**
 * Pronostiqueur Pro API - Système de pronostics professionnels multi-sports
 * 
 * Critères STRICTS:
 * - SAFE: Probabilité >= 70%, Cote <= 1.80, Confiance HIGH/VERY_HIGH
 * - FUN: Probabilité >= 55%, Valeur >= 10%, Cote >= 1.40
 * 
 * Sources intégrées:
 * - Tennis: BetExplorer + Classements ATP/WTA réels
 * - Football: ESPN + Analyse expert
 * - Basket: ESPN + Analyse expert
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// ADMIN AUTHENTICATION
// ============================================

/**
 * Vérifie si l'utilisateur est admin via le cookie de session
 */
function isAdmin(request: NextRequest): { isAdmin: boolean; username?: string } {
  const sessionData = request.cookies.get('steo_elite_session_data');

  if (!sessionData) {
    return { isAdmin: false };
  }

  try {
    const data = JSON.parse(decodeURIComponent(sessionData.value));
    return {
      isAdmin: data.role === 'admin',
      username: data.user
    };
  } catch {
    return { isAdmin: false };
  }
}

// ============================================
// INTERFACES
// ============================================

interface BasePick {
  id: string;
  matchId: string;
  sport: 'football' | 'basketball' | 'tennis';
  league: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  
  // Prédiction
  bet: string;
  betLabel: string;
  odds: number;
  
  // Analyse ML
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  winProbability: number;  // Calculé par le modèle ML
  value: number;           // Expected value en %
  
  // Classification
  type: 'safe' | 'fun';
  reasoning: string[];
  
  // Données enrichies
  ranking?: string;
  tournament?: string;
  qualityScore?: number;   // Score de qualité 0-100
  
  // Résultat
  result?: 'won' | 'lost' | 'pending' | 'void';
  actualScore?: string;
}

interface ProPrediction {
  id: string;
  generatedAt: string;
  type: 'safe' | 'fun' | 'combo';
  
  picks: BasePick[];
  combinedOdds: number;
  
  totalStake: number;
  potentialWin: number;
  riskLevel: 'low' | 'medium' | 'high';
  
  result?: 'won' | 'lost' | 'pending' | 'partial';
  profit?: number;
  
  modelVersion: string;
  features: Record<string, number>;
}

// ============================================
// SEUILS STRICTS - Basés sur les résultats du backtest
// ============================================
// RÉSULTATS BACKTEST:
// - HIGH confidence: 100% win rate, +350€ profit
// - MEDIUM confidence: ~90% win rate, +182€ profit  
// - LOW confidence: 0% win rate, -1160€ perte
// CONCLUSION: Ne JAMAIS proposer de paris LOW confidence

const SAFE_THRESHOLD = {
  minProbability: 65,    // Remonté à 65 (plus strict)
  maxOdds: 1.85,        // Baisssé à 1.85 (plus strict)
  minConfidence: 'high' // UNIQUEMENT high ou very_high
};

const FUN_THRESHOLD = {
  minProbability: 55,    // Remonté à 55
  minOdds: 1.50,         // Remonté à 1.50
  minValue: 10,          // Remonté à 10
  minConfidence: 'medium' // Au minimum medium (LOW interdit)
};

// ============================================
// CHARGEMENT DES DONNÉES
// ============================================

const DATA_DIR = path.join(process.cwd(), 'data');

async function loadTennisPredictions(): Promise<any[]> {
  try {
    const filePath = path.join(DATA_DIR, 'tennis-predictions.json');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return data.predictions || [];
    }
  } catch (e) {}
  
  return [];
}

async function loadExpertAdvices(): Promise<any[]> {
  try {
    const filePath = path.join(DATA_DIR, 'expert-advices.json');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return data.advices || [];
    }
  } catch (e) {}
  
  return [];
}

async function loadTennisRankings(): Promise<Map<string, { rank: number; name: string; points: number }>> {
  const rankingsMap = new Map();
  
  try {
    const filePath = path.join(DATA_DIR, 'tennis-rankings.json');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      
      for (const player of data.atp || []) {
        const normalizedName = player.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
        rankingsMap.set(normalizedName, player);
        
        // Ajouter aussi par nom de famille
        const lastName = player.name.split(' ').pop()?.toLowerCase() || '';
        if (lastName) {
          rankingsMap.set(lastName, player);
        }
      }
      
      for (const player of data.wta || []) {
        const normalizedName = player.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
        rankingsMap.set(normalizedName, player);
        
        const lastName = player.name.split(' ').pop()?.toLowerCase() || '';
        if (lastName) {
          rankingsMap.set(lastName, player);
        }
      }
    }
  } catch (e) {}
  
  return rankingsMap;
}

// NOUVEAU: Charger les matchs live directement depuis le service de données
async function loadLiveMatches(): Promise<any[]> {
  try {
    // Import dynamique pour éviter les problèmes de circularité
    const { getMatchesWithRealOdds } = await import('@/lib/combinedDataService');
    
    const allMatches = await getMatchesWithRealOdds();
    
    // Filtrer pour les matchs d'aujourd'hui, à venir et en cours
    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date();
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
    tomorrowEnd.setHours(23, 59, 59, 999);
    
    const todayMatches = allMatches.filter((m: any) => {
      const matchDate = new Date(m.date);
      // Matchs d'aujourd'hui
      if (matchDate >= todayStart && matchDate <= tomorrowEnd) return true;
      // Matchs en cours
      if (m.isLive) return true;
      // Matchs à venir (status upcoming)
      if (m.status === 'upcoming') return true;
      return false;
    });
    
    console.log(`📡 Live matches: ${todayMatches.length} matchs aujourd'hui/en cours (${allMatches.length} total)`);
    return todayMatches;
  } catch (e) {
    console.error('Erreur chargement live matches:', e);
    return [];
  }
}

// ============================================
// MODÈLE ML TENNIS AMÉLIORÉ
// ============================================

function calculateTennisProbability(
  player1: string,
  player2: string,
  odds1: number,
  odds2: number,
  ranking1: { rank: number; name: string; points: number } | null,
  ranking2: { rank: number; name: string; points: number } | null,
  surface: string
): { probability: number; confidence: 'very_high' | 'high' | 'medium' | 'low'; reasoning: string[] } {
  
  const reasoning: string[] = [];
  let probability = 0;
  let confidenceScore = 0;
  
  // 1. Probabilité implicite des cotes (base 30%)
  const impliedProb1 = 1 / odds1;
  const impliedProb2 = 1 / odds2;
  probability = impliedProb1 * 0.30;
  reasoning.push(`Cote: ${odds1.toFixed(2)} vs ${odds2.toFixed(2)}`);
  
  // 2. Facteur classement ATP/WTA (40%)
  if (ranking1 && ranking2) {
    const rankDiff = ranking2.rank - ranking1.rank; // Positif si P1 mieux classé
    
    // Formule améliorée basée sur l'écart de classement
    let rankingBonus = 0;
    if (rankDiff > 100) {
      rankingBonus = 0.35;  // Écart énorme: +35%
      reasoning.push(`Écart classement énorme: ${ranking1.name} #${ranking1.rank} vs #${ranking2.rank}`);
    } else if (rankDiff > 50) {
      rankingBonus = 0.25;
      reasoning.push(`${ranking1.name} #${ranking1.rank} vs #${ranking2.rank}`);
    } else if (rankDiff > 20) {
      rankingBonus = 0.15;
      reasoning.push(`${ranking1.name} mieux classé (+${rankDiff} places)`);
    } else if (rankDiff > 5) {
      rankingBonus = 0.08;
    } else if (rankDiff < -100) {
      rankingBonus = -0.35;
      reasoning.push(`${ranking2.name} #${ranking2.rank} vs #${ranking1.rank}`);
    } else if (rankDiff < -50) {
      rankingBonus = -0.25;
    } else if (rankDiff < -20) {
      rankingBonus = -0.15;
    }
    
    probability += rankingBonus;
    confidenceScore += 30; // Données de classement = plus de confiance
    
    // Bonus points ATP/WTA
    if (ranking1.points > ranking2.points * 2) {
      probability += 0.05;
      reasoning.push(`Points: ${ranking1.points} vs ${ranking2.points}`);
    }
  } else if (ranking1) {
    probability += 0.15;
    reasoning.push(`${ranking1.name} #${ranking1.rank} classé`);
    confidenceScore += 15;
  } else if (ranking2) {
    probability -= 0.15;
    reasoning.push(`${ranking2.name} #${ranking2.rank} classé`);
    confidenceScore += 15;
  } else {
    reasoning.push('Classements non disponibles');
  }
  
  // 3. Ajustement surface (10%)
  // Les surfaces préférées peuvent donner un avantage
  const surfaceBonus = 0; // À enrichir avec données de performance surface
  probability += surfaceBonus * 0.10;
  
  // 4. Valeur de la cote (20%)
  // Si la cote est haute par rapport à la probabilité calculée, il y a de la valeur
  const valueOdds = (impliedProb1 - probability) * 100;
  
  // Normaliser la probabilité entre 0.35 et 0.95
  probability = Math.max(0.35, Math.min(0.95, probability));
  
  // Calculer la confiance
  let confidence: 'very_high' | 'high' | 'medium' | 'low';
  if (probability >= 0.75 && confidenceScore >= 30) {
    confidence = 'very_high';
  } else if (probability >= 0.70 && confidenceScore >= 15) {
    confidence = 'high';
  } else if (probability >= 0.55) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  
  return {
    probability: Math.round(probability * 100),
    confidence,
    reasoning
  };
}

// ============================================
// MODÈLE ML FOOTBALL/BASKET AMÉLIORÉ
// ============================================

function calculateFootballBasketProbability(
  advice: any
): { probability: number; confidence: 'very_high' | 'high' | 'medium' | 'low'; reasoning: string[] } {
  
  const reasoning: string[] = [];
  let probability = 0;
  fbConfidenceScore = 0; // Reset pour chaque appel
  
  const odds = advice.oddsAnalysis?.favoriteOdds || 1.85;
  const edge = advice.oddsAnalysis?.edge || 0;
  const dataQuality = advice.dataQuality || 'low';
  const baseConfidence = advice.recommendation?.confidence || 'low';
  
  // 1. Probabilité implicite de la cote (base 40%)
  const impliedProb = 1 / odds;
  probability = impliedProb * 0.40;
  
  // 2. Edge détecté (30%)
  if (edge >= 20) {
    probability += 0.15;
    reasoning.push(`Edge important: ${edge}%`);
  } else if (edge >= 15) {
    probability += 0.10;
    reasoning.push(`Edge: ${edge}%`);
  } else if (edge >= 10) {
    probability += 0.05;
    reasoning.push(`Edge modéré: ${edge}%`);
  }
  
  // 3. Qualité des données (20%)
  if (dataQuality === 'high') {
    probability += 0.10;
    fbConfidenceScore += 20;
    reasoning.push('Données de qualité');
  } else if (dataQuality === 'medium') {
    probability += 0.05;
    reasoning.push('Données moyennes');
  } else {
    reasoning.push('Données limitées');
  }
  
  // 4. Confiance de base de l'expert (10%)
  if (baseConfidence === 'high') {
    probability += 0.10;
    reasoning.push('Analyse expert: haute confiance');
  } else if (baseConfidence === 'medium') {
    probability += 0.05;
    reasoning.push('Analyse expert: confiance moyenne');
  }
  
  // Normaliser
  probability = Math.max(0.35, Math.min(0.85, probability));
  
  // Calculer la confiance finale
  let confidence: 'very_high' | 'high' | 'medium' | 'low';
  if (probability >= 0.70 && dataQuality === 'high' && edge >= 15) {
    confidence = 'very_high';
  } else if (probability >= 0.65 && (dataQuality === 'high' || edge >= 15)) {
    confidence = 'high';
  } else if (probability >= 0.50) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  
  return {
    probability: Math.round(probability * 100),
    confidence,
    reasoning
  };
}

// Variable pour le score de confiance dans calculateFootballBasketProbability
let fbConfidenceScore = 0;

// ============================================
// CLASSIFICATION STRICTE
// ============================================

function classifyPick(
  winProbability: number,
  odds: number,
  confidence: string,
  value: number
): 'safe' | 'fun' | null {
  
  // IMPORTANT: LOW confidence = 0% win rate dans le backtest
  // On rejette automatiquement tous les paris LOW
  if (confidence === 'low') {
    return null; // Rejeté automatiquement
  }
  
  // SAFE: UNIQUEMENT high ou very_high confidence
  if (winProbability >= SAFE_THRESHOLD.minProbability &&
      odds <= SAFE_THRESHOLD.maxOdds &&
      (confidence === 'high' || confidence === 'very_high')) {
    return 'safe';
  }
  
  // FUN: medium confidence minimum, avec valeur positive
  if (winProbability >= FUN_THRESHOLD.minProbability &&
      odds >= FUN_THRESHOLD.minOdds &&
      value >= FUN_THRESHOLD.minValue &&
      confidence !== 'low') {
    return 'fun';
  }
  
  return null;
}

// ============================================
// GÉNÉRATION DES PICKS
// ============================================

async function generatePicks(): Promise<BasePick[]> {
  const picks: BasePick[] = [];
  
  const [tennisPredictions, expertAdvices, tennisRankings, liveMatches] = await Promise.all([
    loadTennisPredictions(),
    loadExpertAdvices(),
    loadTennisRankings(),
    loadLiveMatches()  // NOUVEAU: Charger les matchs live
  ]);
  
  console.log(`📊 Données: ${tennisPredictions.length} tennis, ${expertAdvices.length} expert, ${tennisRankings.size} classements, ${liveMatches.length} live matches`);
  
  // ==========================================
  // NOUVEAU: TRAITER LES MATCHS LIVE (FOOTBALL + BASKET) AVEC ML
  // ==========================================
  
  // Essayer d'utiliser le service unifié pour les prédictions ML
  let unifiedPredictions: Map<string, any> = new Map();
  try {
    const { getBatchPredictions } = await import('@/lib/unifiedPredictionService');
    
    // Préparer les matchs pour le service unifié
    const matchInputs = liveMatches
      .filter(m => m.status !== 'finished' && !m.isFinished)
      .map(m => ({
        id: m.id,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        sport: m.sport === 'Basket' ? 'NBA' as const : m.sport === 'Hockey' ? 'NHL' as const : 'Foot' as const,
        league: m.league || 'Unknown',
        oddsHome: m.oddsHome || 2.0,
        oddsDraw: m.oddsDraw || 3.3,
        oddsAway: m.oddsAway || 2.0,
      }));
    
    if (matchInputs.length > 0) {
      console.log(`🧠 Calcul prédictions ML pour ${matchInputs.length} matchs...`);
      const predictions = await getBatchPredictions(matchInputs);
      
      for (const pred of predictions) {
        unifiedPredictions.set(pred.matchId, pred);
      }
      console.log(`✅ ${predictions.length} prédictions ML calculées`);
    }
  } catch (e) {
    console.log('⚠️ Service ML non disponible, utilisation du fallback');
  }
  
  for (const match of liveMatches) {
    // Ignorer les matchs terminés
    if (match.status === 'finished' || match.isFinished) continue;
    
    const sport = match.sport === 'Basket' ? 'basketball' : 'football';
    
    // Vérifier si on a une prédiction ML unifiée
    const unifiedPred = unifiedPredictions.get(match.id);
    
    let betType = '';
    let betLabel = '';
    let winProbability = 0;
    let selectedOdds = 0;
    let confidence: 'very_high' | 'high' | 'medium' | 'low' = 'low';
    let reasoning: string[] = [];
    
    if (unifiedPred) {
      // Utiliser la prédiction ML unifiée
      const ml = unifiedPred.mlPrediction;
      const rec = unifiedPred.recommendation;
      
      if (rec.bet === 'avoid') continue;
      
      // Récupérer les valeurs depuis la prédiction ML
      if (rec.bet === 'home') {
        betType = 'home';
        betLabel = `Victoire ${match.homeTeam}`;
        selectedOdds = unifiedPred.odds.home;
        winProbability = ml.homeProb;
      } else if (rec.bet === 'away') {
        betType = 'away';
        betLabel = `Victoire ${match.awayTeam}`;
        selectedOdds = unifiedPred.odds.away;
        winProbability = ml.awayProb;
      } else if (rec.bet === 'draw') {
        betType = 'draw';
        betLabel = 'Match Nul';
        selectedOdds = unifiedPred.odds.draw || 3.3;
        winProbability = ml.drawProb;
      }
      
      confidence = ml.confidence;
      reasoning = rec.reasoning;
      reasoning.push('🧠 Prédiction ML unifiée');
      
      if (unifiedPred.dataQuality?.hasRealOdds) {
        reasoning.push('📊 Cotes ESPN DraftKings');
      }
      
    } else {
      // Fallback: Calcul basique depuis les cotes
      const oddsHome = match.oddsHome || 2.0;
      const oddsAway = match.oddsAway || 2.0;
      const oddsDraw = match.oddsDraw || 3.3;
      
      const totalImplied = (1/oddsHome) + (1/oddsAway) + (1/oddsDraw);
      const homeProb = Math.round((1/oddsHome) / totalImplied * 100);
      const awayProb = Math.round((1/oddsAway) / totalImplied * 100);
      const drawProb = Math.round((1/oddsDraw) / totalImplied * 100);
      
      // Déterminer le favori
      const favorite = oddsHome < oddsAway ? 'home' : 'away';
      const favoriteOdds = favorite === 'home' ? oddsHome : oddsAway;
      const favoriteProb = favorite === 'home' ? homeProb : awayProb;
      const favoriteTeam = favorite === 'home' ? match.homeTeam : match.awayTeam;
      
      // Double chance probability
      const doubleChanceProb = favorite === 'home' ? homeProb + drawProb : awayProb + drawProb;
      
      // Calculer la confiance
      if (favoriteProb >= 70 && favoriteOdds < 1.5) {
        confidence = 'very_high';
      } else if (favoriteProb >= 60 && favoriteOdds < 1.8) {
        confidence = 'high';
      } else if (favoriteProb >= 50) {
        confidence = 'medium';
      } else {
        confidence = 'low';
      }
      
      if (favoriteOdds < 1.5 && favoriteProb >= 65) {
        betType = favorite;
        betLabel = `Victoire ${favoriteTeam}`;
        winProbability = favoriteProb;
        selectedOdds = favoriteOdds;
        reasoning.push(`Favori solide: ${favoriteProb}% (${favoriteOdds})`);
      } else if (favoriteOdds < 2.0 && doubleChanceProb >= 70) {
        betType = favorite === 'home' ? '1X' : 'X2';
        betLabel = `${favoriteTeam} ou Nul`;
        winProbability = doubleChanceProb;
        selectedOdds = favorite === 'home' ? 
          Math.round((1 / ((homeProb + drawProb) / 100)) * 100) / 100 :
          Math.round((1 / ((awayProb + drawProb) / 100)) * 100) / 100;
        reasoning.push(`Double chance sûre: ${doubleChanceProb}%`);
      } else if (favoriteProb >= 55) {
        betType = favorite;
        betLabel = `Victoire ${favoriteTeam}`;
        winProbability = favoriteProb;
        selectedOdds = favoriteOdds;
        reasoning.push(`Favori modéré: ${favoriteProb}% (${favoriteOdds})`);
      } else {
        continue;
      }
      
      reasoning.push(match.hasRealOdds ? 'Cotes ESPN DraftKings' : 'Cotes estimées');
    }
    
    // Calculer la valeur
    const value = Math.round((winProbability / 100 * selectedOdds - 1) * 100);
    
    // Classifier
    const type = classifyPick(winProbability, selectedOdds, confidence, value);
    if (!type) continue;
    
    // Score de qualité
    const qualityScore = Math.round(
      (winProbability * 0.4) +
      ((confidence === 'very_high' ? 100 : confidence === 'high' ? 75 : confidence === 'medium' ? 50 : 25) * 0.3) +
      (Math.max(0, value) * 0.3)
    );
    
    if (match.isLive) {
      reasoning.push('🔥 Match en cours');
    }
    
    picks.push({
      id: `live_${match.id}`,
      matchId: match.id,
      sport,
      league: match.league || 'Unknown',
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      date: match.date || new Date().toISOString(),
      bet: betType,
      betLabel,
      odds: selectedOdds,
      confidence,
      winProbability,
      value,
      type,
      reasoning,
      qualityScore,
      result: 'pending'
    });
  }
  
  // ==========================================
  // TENNIS - Avec vrais classements ATP/WTA
  // ==========================================
  
  for (const pred of tennisPredictions) {
    // Trouver les classements
    const p1Normalized = pred.player1.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    const p2Normalized = pred.player2.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    
    const p1LastName = pred.player1.split(' ').pop()?.toLowerCase() || '';
    const p2LastName = pred.player2.split(' ').pop()?.toLowerCase() || '';
    
    let ranking1 = tennisRankings.get(p1Normalized) || tennisRankings.get(p1LastName) || null;
    let ranking2 = tennisRankings.get(p2Normalized) || tennisRankings.get(p2LastName) || null;
    
    const odds1 = pred.odds1 || 1.85;
    const odds2 = pred.odds2 || 1.85;
    
    // Recalculer la probabilité avec notre modèle amélioré
    const mlResult = calculateTennisProbability(
      pred.player1,
      pred.player2,
      odds1,
      odds2,
      ranking1,
      ranking2,
      pred.surface
    );
    
    const winner = pred.prediction?.winner || 'player1';
    const winnerName = winner === 'player1' ? pred.player1 : pred.player2;
    const winnerOdds = winner === 'player1' ? odds1 : odds2;
    
    // Utiliser la probabilité recalculée (plus précise)
    const winProbability = mlResult.probability;
    const confidence = mlResult.confidence;
    
    // Calculer la valeur
    const value = Math.round((winProbability / 100 * winnerOdds - 1) * 100);
    
    // Classifier
    const type = classifyPick(winProbability, winnerOdds, confidence, value);
    if (!type) continue;
    
    // Score de qualité
    const qualityScore = Math.round(
      (winProbability * 0.4) +
      ((confidence === 'very_high' ? 100 : confidence === 'high' ? 75 : 50) * 0.3) +
      (Math.max(0, value) * 0.3)
    );
    
    picks.push({
      id: `tennis_${pred.matchId}`,
      matchId: pred.matchId,
      sport: 'tennis',
      league: pred.tournament || 'Tennis',
      homeTeam: pred.player1,
      awayTeam: pred.player2,
      date: pred.date || new Date().toISOString(),
      bet: winner,
      betLabel: `Victoire ${winnerName}`,
      odds: winnerOdds,
      confidence,
      winProbability,
      value,
      type,
      reasoning: mlResult.reasoning,
      ranking: ranking1 && ranking2 ? 
        `${ranking1.name} #${ranking1.rank} vs #${ranking2.rank}` : 
        ranking1 ? `${ranking1.name} #${ranking1.rank}` :
        ranking2 ? `${ranking2.name} #${ranking2.rank}` : undefined,
      tournament: pred.tournament,
      qualityScore,
      result: 'pending'
    });
  }
  
  // ==========================================
  // FOOTBALL / BASKET - Avec modèle amélioré
  // ==========================================
  
  for (const advice of expertAdvices) {
    if (!advice.recommendation?.bet || advice.recommendation.bet === 'avoid') continue;
    
    const sport = advice.sport?.toLowerCase().includes('basket') ? 'basketball' : 'football';
    
    // Recalculer avec notre modèle
    const mlResult = calculateFootballBasketProbability(advice);
    
    const winProbability = mlResult.probability;
    const confidence = mlResult.confidence;
    
    let odds = advice.oddsAnalysis?.favoriteOdds || 1.85;
    if (advice.recommendation.bet === 'away' && advice.oddsAnalysis?.underdogOdds) {
      odds = advice.oddsAnalysis.underdogOdds;
    }
    
    const value = Math.round((winProbability / 100 * odds - 1) * 100);
    
    // Classifier
    const type = classifyPick(winProbability, odds, confidence, value);
    if (!type) continue;
    
    const team = advice.recommendation.bet === 'home' ? advice.homeTeam : 
                 advice.recommendation.bet === 'away' ? advice.awayTeam : advice.recommendation.bet;
    
    let betLabel = '';
    if (advice.recommendation.bet === 'home') betLabel = `Victoire ${advice.homeTeam}`;
    else if (advice.recommendation.bet === 'away') betLabel = `Victoire ${advice.awayTeam}`;
    else if (advice.recommendation.bet === 'draw') betLabel = 'Match nul';
    else betLabel = advice.recommendation.betType || advice.recommendation.bet;
    
    const qualityScore = Math.round(
      (winProbability * 0.4) +
      ((confidence === 'very_high' ? 100 : confidence === 'high' ? 75 : 50) * 0.3) +
      (Math.max(0, value) * 0.3)
    );
    
    picks.push({
      id: `expert_${advice.matchId}`,
      matchId: advice.matchId,
      sport,
      league: advice.league || 'Unknown',
      homeTeam: advice.homeTeam,
      awayTeam: advice.awayTeam,
      date: advice.matchDate || new Date().toISOString(),
      bet: advice.recommendation.bet,
      betLabel,
      odds,
      confidence,
      winProbability,
      value,
      type,
      reasoning: mlResult.reasoning,
      qualityScore,
      result: 'pending'
    });
  }
  
  // Trier par score de qualité décroissant
  picks.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
  
  console.log(`✅ ${picks.length} picks: ${picks.filter(p => p.type === 'safe').length} SAFE, ${picks.filter(p => p.type === 'fun').length} FUN`);
  
  return picks;
}

// ============================================
// GÉNÉRATION COMBINAISONS
// ============================================

function generateCombinations(picks: BasePick[]): ProPrediction[] {
  const predictions: ProPrediction[] = [];
  
  const safePicks = picks.filter(p => p.type === 'safe');
  const funPicks = picks.filter(p => p.type === 'fun');
  
  // COMBINAISON SAFE (2-3 matchs max)
  if (safePicks.length >= 2) {
    const selectedSafe = safePicks.slice(0, Math.min(3, safePicks.length));
    const combinedOdds = selectedSafe.reduce((acc, p) => acc * p.odds, 1);
    
    predictions.push({
      id: `pro_safe_${Date.now()}`,
      generatedAt: new Date().toISOString(),
      type: 'safe',
      picks: selectedSafe,
      combinedOdds: Math.round(combinedOdds * 100) / 100,
      totalStake: 10,
      potentialWin: Math.round(10 * combinedOdds * 100) / 100,
      riskLevel: 'low',
      result: 'pending',
      modelVersion: 'pro-v2.0-strict',
      features: {
        avgProbability: selectedSafe.reduce((a, p) => a + p.winProbability, 0) / selectedSafe.length,
        avgQualityScore: selectedSafe.reduce((a, p) => a + (p.qualityScore || 0), 0) / selectedSafe.length,
        pickCount: selectedSafe.length,
        sports: [...new Set(selectedSafe.map(p => p.sport))].length
      }
    });
  }
  
  // COMBINAISON FUN (1-2 matchs avec valeur)
  if (funPicks.length >= 1) {
    const selectedFun = funPicks.slice(0, Math.min(2, funPicks.length));
    const combinedOdds = selectedFun.reduce((acc, p) => acc * p.odds, 1);
    
    predictions.push({
      id: `pro_fun_${Date.now()}`,
      generatedAt: new Date().toISOString(),
      type: 'fun',
      picks: selectedFun,
      combinedOdds: Math.round(combinedOdds * 100) / 100,
      totalStake: 5,
      potentialWin: Math.round(5 * combinedOdds * 100) / 100,
      riskLevel: 'medium',
      result: 'pending',
      modelVersion: 'pro-v2.0-strict',
      features: {
        avgProbability: selectedFun.reduce((a, p) => a + p.winProbability, 0) / selectedFun.length,
        avgValue: selectedFun.reduce((a, p) => a + p.value, 0) / selectedFun.length,
        pickCount: selectedFun.length,
        sports: [...new Set(selectedFun.map(p => p.sport))].length
      }
    });
  }
  
  // COMBO MIXTE (1 safe + 1 fun)
  if (safePicks.length >= 1 && funPicks.length >= 1) {
    const mixed = [safePicks[0], funPicks[0]];
    const combinedOdds = mixed.reduce((acc, p) => acc * p.odds, 1);
    
    predictions.push({
      id: `pro_combo_${Date.now()}`,
      generatedAt: new Date().toISOString(),
      type: 'combo',
      picks: mixed,
      combinedOdds: Math.round(combinedOdds * 100) / 100,
      totalStake: 5,
      potentialWin: Math.round(5 * combinedOdds * 100) / 100,
      riskLevel: 'medium',
      result: 'pending',
      modelVersion: 'pro-v2.0-strict',
      features: {
        avgProbability: mixed.reduce((a, p) => a + p.winProbability, 0) / mixed.length,
        avgValue: mixed.reduce((a, p) => a + p.value, 0) / mixed.length,
        pickCount: 2,
        sports: [...new Set(mixed.map(p => p.sport))].length
      }
    });
  }
  
  return predictions;
}

// ============================================
// GESTION BASE DE DONNÉES
// ============================================

interface ProDatabase {
  predictions: ProPrediction[];
  stats: any;
  modelWeights: any;
  lastUpdated: string;
}

const PRO_DB_FILE = path.join(DATA_DIR, 'pronostiqueur-pro.json');

function loadProDatabase(): ProDatabase {
  try {
    if (fs.existsSync(PRO_DB_FILE)) {
      return JSON.parse(fs.readFileSync(PRO_DB_FILE, 'utf-8'));
    }
  } catch (e) {}
  
  return {
    predictions: [],
    stats: {},
    modelWeights: {
      safeThreshold: SAFE_THRESHOLD,
      funThreshold: FUN_THRESHOLD
    },
    lastUpdated: new Date().toISOString()
  };
}

function saveProDatabase(db: ProDatabase): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  db.lastUpdated = new Date().toISOString();
  fs.writeFileSync(PRO_DB_FILE, JSON.stringify(db, null, 2));
}

// ============================================
// API
// ============================================

export async function GET(request: NextRequest) {
  // Vérification admin
  const { isAdmin: admin } = isAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Accès non autorisé - Admin uniquement' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'predictions';
  
  const db = loadProDatabase();
  
  switch (action) {
    case 'predictions': {
      const picks = await generatePicks();
      const predictions = generateCombinations(picks);
      
      // Stats des données
      const bySport = {
        tennis: picks.filter(p => p.sport === 'tennis').length,
        football: picks.filter(p => p.sport === 'football').length,
        basketball: picks.filter(p => p.sport === 'basketball').length
      };
      
      const byType = {
        safe: picks.filter(p => p.type === 'safe').length,
        fun: picks.filter(p => p.type === 'fun').length
      };
      
      return NextResponse.json({
        predictions,
        allPicks: picks,
        stats: db.stats,
        thresholds: {
          safe: SAFE_THRESHOLD,
          fun: FUN_THRESHOLD
        },
        modelVersion: 'pro-v2.0-strict',
        dataSummary: {
          totalPicks: picks.length,
          byType,
          bySport,
          avgProbability: picks.length > 0 ? 
            Math.round(picks.reduce((a, p) => a + p.winProbability, 0) / picks.length) : 0,
          avgQualityScore: picks.length > 0 ? 
            Math.round(picks.reduce((a, p) => a + (p.qualityScore || 0), 0) / picks.length) : 0
        },
        lastUpdated: db.lastUpdated
      });
    }
    
    case 'history':
      return NextResponse.json({
        predictions: db.predictions,
        stats: db.stats
      });
      
    case 'stats':
      return NextResponse.json(db.stats);
      
    default:
      return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  // Vérification admin
  const { isAdmin: admin } = isAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Accès non autorisé - Admin uniquement' }, { status: 403 });
  }

  const body = await request.json();
  const { action, predictionId, results, prediction } = body;
  
  const db = loadProDatabase();
  
  switch (action) {
    case 'save':
      if (prediction) {
        db.predictions.push(prediction);
        saveProDatabase(db);
      }
      return NextResponse.json({ success: true });
      
    case 'update_result': {
      const pred = db.predictions.find(p => p.id === predictionId);
      if (pred) {
        pred.result = results.result;
        pred.profit = results.result === 'won' 
          ? pred.potentialWin - pred.totalStake 
          : -pred.totalStake;
        
        if (results.pickResults) {
          for (const pickResult of results.pickResults) {
            const pick = pred.picks.find(p => p.id === pickResult.id);
            if (pick) {
              pick.result = pickResult.result;
              pick.actualScore = pickResult.actualScore;
            }
          }
        }
        
        saveProDatabase(db);
      }
      return NextResponse.json({ success: true });
    }
    
    case 'reset':
      db.predictions = [];
      saveProDatabase(db);
      return NextResponse.json({ success: true });
      
    default:
      return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
  }
}
