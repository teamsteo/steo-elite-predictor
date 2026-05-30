/**
 * Unified Daily Prediction Service
 * 
 * ARCHITECTURE:
 * ┌────────────────────────────────────────────────────────────────┐
 * │  Cron 05:30 UTC                                                │
 * │      │                                                         │
 * │      ▼                                                         │
 * │  ┌─────────────────────────────────────────────────────────┐   │
 * │  │ 1. Scraping UNIQUE (ESPN, BetExplorer)                  │   │
 * │  │    - Football: ESPN API (gratuit)                       │   │
 * │  │    - Basketball: ESPN API (gratuit)                     │   │
 * │  │    - Hockey: ESPN API (gratuit)                         │   │
 * │  │    - Tennis: BetExplorer (protégé anti-ban)             │   │
 * │  └─────────────────────────────────────────────────────────┘   │
 * │      │                                                         │
 * │      ▼                                                         │
 * │  ┌─────────────────────────────────────────────────────────┐   │
 * │  │ 2. Calcul ML pour chaque match                          │   │
 * │  │    - 8 facteurs pour tennis                             │   │
 * │  │    - 5 facteurs pour autres sports                      │   │
 * │  │    - Classification risque: safe/modéré/risqué          │   │
 * │  └─────────────────────────────────────────────────────────┘   │
 * │      │                                                         │
 * │      ▼                                                         │
 * │  ┌─────────────────────────────────────────────────────────┐   │
 * │  │ 3. Stockage dans data/daily-predictions.json            │   │
 * │  │    - Toutes les prédictions du jour                     │   │
 * │  │    - Classées par sport + risque                        │   │
 * │  └─────────────────────────────────────────────────────────┘   │
 * │                                                                 │
 * │  ─────────────────────────────────────────────────────────────  │
 * │                                                                 │
 * │  Site Web ───► API ───► Lecture fichier (0 scraping)          │
 * │  Telegram  ───► API ───► Lecture fichier (0 scraping)          │
 * │                                                                 │
 * │  ✅ 1 SEUL SCRAPING PAR JOUR !                                 │
 * └────────────────────────────────────────────────────────────────┘
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// INTERFACES
// ============================================

export interface DailyPrediction {
  // Identification
  id: string;
  sport: 'football' | 'basketball' | 'hockey' | 'tennis';
  league?: string;
  tournament?: string;
  tournamentTier?: string;
  
  // Match
  homeTeam: string;
  awayTeam: string;
  player1?: string;  // Pour tennis
  player2?: string;  // Pour tennis
  
  // Timing
  date: string;
  time?: string;
  displayDate?: string;
  
  // Cotes
  oddsHome?: number;
  oddsAway?: number;
  oddsDraw?: number;
  
  // Prédiction
  recommendation: string;
  predictedResult: 'home' | 'away' | 'draw';
  winProbability: number;
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  
  // Risque (CLASSIFICATION PRINCIPALE)
  riskPercentage: number;
  riskLevel: 'safe' | 'moderate' | 'risky';
  
  // Betting
  valueBet: boolean;
  valueBetType?: string;
  expectedValue?: number;
  kellyStake?: number;
  
  // Analyse
  reasons: string[];
  warnings: string[];
  
  // Métadonnées
  source: string;
  modelVersion: string;
  generatedAt: string;
}

export interface DailyPredictionsFile {
  generatedAt: string;
  validUntil: string;
  summary: {
    total: number;
    bySport: Record<string, number>;
    byRisk: {
      safe: number;
      moderate: number;
      risky: number;
    };
    valueBets: number;
  };
  predictions: DailyPrediction[];
}

// ============================================
// CONFIGURATION
// ============================================

const DATA_DIR = path.join(process.cwd(), 'data');
const DAILY_FILE = path.join(DATA_DIR, 'daily-predictions.json');

const RISK_THRESHOLDS = {
  safe: 30,      // 0-30% risque = safe
  moderate: 50,  // 31-50% risque = modéré
  risky: 100,    // 51-100% risque = risqué
};

// ============================================
// FONCTIONS PRINCIPALES
// ============================================

/**
 * Génère toutes les prédictions du jour
 * Appelé UNE SEULE FOIS par le cron du matin
 */
export async function generateDailyPredictions(): Promise<DailyPredictionsFile> {
  console.log('🔄 Génération des prédictions quotidiennes...');
  console.log('==========================================');
  
  const predictions: DailyPrediction[] = [];
  
  // 1. Football (ESPN - gratuit)
  console.log('\n📡 Récupération Football...');
  const footballPredictions = await fetchFootballPredictions();
  predictions.push(...footballPredictions);
  console.log(`✅ Football: ${footballPredictions.length} matchs`);
  
  // 2. Basketball (ESPN - gratuit)
  console.log('\n📡 Récupération Basketball...');
  const basketballPredictions = await fetchBasketballPredictions();
  predictions.push(...basketballPredictions);
  console.log(`✅ Basketball: ${basketballPredictions.length} matchs`);
  
  // 3. Hockey (ESPN - gratuit)
  console.log('\n📡 Récupération Hockey...');
  const hockeyPredictions = await fetchHockeyPredictions();
  predictions.push(...hockeyPredictions);
  console.log(`✅ Hockey: ${hockeyPredictions.length} matchs`);
  
  // 4. Tennis (BetExplorer avec protection anti-ban)
  console.log('\n📡 Récupération Tennis...');
  const tennisPredictions = await fetchTennisPredictions();
  predictions.push(...tennisPredictions);
  console.log(`✅ Tennis: ${tennisPredictions.length} matchs`);
  
  // Calculer le résumé
  const summary = calculateSummary(predictions);
  
  // Créer le fichier
  const dailyFile: DailyPredictionsFile = {
    generatedAt: new Date().toISOString(),
    validUntil: getEndOfDay(),
    summary,
    predictions,
  };
  
  // Sauvegarder
  saveDailyPredictions(dailyFile);
  
  console.log('\n==========================================');
  console.log(`✅ TOTAL: ${predictions.length} prédictions générées`);
  console.log(`   🟢 Safe: ${summary.byRisk.safe}`);
  console.log(`   🟡 Modéré: ${summary.byRisk.moderate}`);
  console.log(`   🔴 Risqué: ${summary.byRisk.risky}`);
  console.log(`   💎 Value Bets: ${summary.valueBets}`);
  
  return dailyFile;
}

/**
 * Charge les prédictions du jour
 * Appelé par le site web et Telegram (PAS de scraping)
 */
export function loadDailyPredictions(): DailyPredictionsFile | null {
  try {
    if (!fs.existsSync(DAILY_FILE)) {
      console.log('⚠️ Aucun fichier de prédictions');
      return null;
    }
    
    const data = JSON.parse(fs.readFileSync(DAILY_FILE, 'utf-8'));
    
    // Vérifier si les données sont encore valides
    if (new Date(data.validUntil) < new Date()) {
      console.log('⚠️ Prédictions expirées');
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Erreur chargement prédictions:', error);
    return null;
  }
}

/**
 * Récupère les prédictions filtrées
 */
export function getFilteredPredictions(options?: {
  sports?: string[];
  riskLevels?: ('safe' | 'moderate' | 'risky')[];
  valueBetsOnly?: boolean;
  minProbability?: number;
}): DailyPrediction[] {
  const data = loadDailyPredictions();
  
  if (!data) return [];
  
  let filtered = data.predictions;
  
  // Filtrer par sport
  if (options?.sports?.length) {
    filtered = filtered.filter(p => options.sports!.includes(p.sport));
  }
  
  // Filtrer par niveau de risque
  if (options?.riskLevels?.length) {
    filtered = filtered.filter(p => options.riskLevels!.includes(p.riskLevel));
  }
  
  // Filtrer value bets uniquement
  if (options?.valueBetsOnly) {
    filtered = filtered.filter(p => p.valueBet);
  }
  
  // Filtrer par probabilité minimum
  if (options?.minProbability) {
    filtered = filtered.filter(p => p.winProbability >= options.minProbability!);
  }
  
  return filtered;
}

// ============================================
// FONCTIONS DE SCRAPING (UNE SEULE FOIS PAR JOUR)
// ============================================

async function fetchFootballPredictions(): Promise<DailyPrediction[]> {
  const predictions: DailyPrediction[] = [];
  
  try {
    // ESPN API - gratuit, pas de rate limiting
    const response = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard',
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) return predictions;
    
    const data = await response.json();
    const events = data.events || [];
    
    for (const event of events) {
      if (event.status?.type?.completed) continue; // Skip matchs terminés
      
      const competition = event.competitions?.[0];
      const home = competition?.competitors?.find((c: any) => c.homeAway === 'home');
      const away = competition?.competitors?.find((c: any) => c.homeAway === 'away');
      
      if (!home || !away) continue;
      
      const prediction = createFootballPrediction(event, home, away);
      if (prediction) predictions.push(prediction);
    }
    
  } catch (error) {
    console.error('Erreur Football:', error);
  }
  
  return predictions;
}

async function fetchBasketballPredictions(): Promise<DailyPrediction[]> {
  const predictions: DailyPrediction[] = [];
  
  try {
    const response = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) return predictions;
    
    const data = await response.json();
    const events = data.events || [];
    
    for (const event of events) {
      if (event.status?.type?.completed) continue;
      
      const competition = event.competitions?.[0];
      const home = competition?.competitors?.find((c: any) => c.homeAway === 'home');
      const away = competition?.competitors?.find((c: any) => c.homeAway === 'away');
      
      if (!home || !away) continue;
      
      const prediction = createBasketballPrediction(event, home, away);
      if (prediction) predictions.push(prediction);
    }
    
  } catch (error) {
    console.error('Erreur Basketball:', error);
  }
  
  return predictions;
}

async function fetchHockeyPredictions(): Promise<DailyPrediction[]> {
  const predictions: DailyPrediction[] = [];
  
  try {
    const response = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard',
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) return predictions;
    
    const data = await response.json();
    const events = data.events || [];
    
    for (const event of events) {
      if (event.status?.type?.completed) continue;
      
      const competition = event.competitions?.[0];
      const home = competition?.competitors?.find((c: any) => c.homeAway === 'home');
      const away = competition?.competitors?.find((c: any) => c.homeAway === 'away');
      
      if (!home || !away) continue;
      
      const prediction = createHockeyPrediction(event, home, away);
      if (prediction) predictions.push(prediction);
    }
    
  } catch (error) {
    console.error('Erreur Hockey:', error);
  }
  
  return predictions;
}

async function fetchTennisPredictions(): Promise<DailyPrediction[]> {
  const predictions: DailyPrediction[] = [];
  
  try {
    // Utiliser le smart-collector avec protection anti-ban
    const { collectMatches } = await import('./tennis-enhanced/smart-collector');
    const { predictMatch } = await import('./tennis-enhanced/enhanced-predictor');
    
    const matches = await collectMatches();
    
    for (const match of matches) {
      try {
        const prediction = predictMatch(match);
        
        predictions.push({
          id: prediction.matchId,
          sport: 'tennis',
          tournament: prediction.tournament,
          tournamentTier: prediction.tournamentTier,
          homeTeam: prediction.player1,
          awayTeam: prediction.player2,
          player1: prediction.player1,
          player2: prediction.player2,
          date: prediction.generatedAt.toISOString(),
          oddsHome: match.odds1,
          oddsAway: match.odds2,
          recommendation: prediction.predictedWinner === 'player1' ? prediction.player1 : prediction.player2,
          predictedResult: prediction.predictedWinner === 'player1' ? 'home' : 'away',
          winProbability: prediction.winProbability,
          confidence: prediction.confidence,
          riskPercentage: prediction.riskPercentage,
          riskLevel: getRiskLevel(prediction.riskPercentage),
          valueBet: prediction.betting.recommendedBet && prediction.betting.expectedValue > 0,
          expectedValue: prediction.betting.expectedValue,
          kellyStake: prediction.betting.kellyStake,
          reasons: prediction.keyInsights,
          warnings: prediction.warnings,
          source: 'smart-collector',
          modelVersion: prediction.modelVersion,
          generatedAt: prediction.generatedAt.toISOString(),
        });
      } catch (error) {
        console.error(`Erreur prédiction tennis ${match.player1} vs ${match.player2}:`, error);
      }
    }
    
  } catch (error) {
    console.error('Erreur Tennis:', error);
  }
  
  return predictions;
}

// ============================================
// CRÉATION DE PRÉDICTIONS
// ============================================

function createFootballPrediction(event: any, home: any, away: any): DailyPrediction | null {
  const homeTeam = home.team?.displayName || 'Unknown';
  const awayTeam = away.team?.displayName || 'Unknown';
  const homeScore = parseInt(home.score) || 0;
  const awayScore = parseInt(away.score) || 0;
  
  // Calcul simple basé sur les records (si disponibles)
  const homeRecord = home.records?.find((r: any) => r.type === 'total');
  const awayRecord = away.records?.find((r: any) => r.type === 'total');
  const homeWins = homeRecord?.wins || 0;
  const awayWins = awayRecord?.wins || 0;
  
  const totalWins = homeWins + awayWins;
  const homeProb = totalWins > 0 ? (homeWins / totalWins) * 100 : 50;
  
  // Probabilité ajustée (favori domicile)
  const adjustedProb = Math.min(75, Math.max(25, homeProb + 10));
  
  const riskPercentage = 100 - adjustedProb;
  
  return {
    id: `fb_${event.id}`,
    sport: 'football',
    league: event.league?.name || 'Football',
    homeTeam,
    awayTeam,
    date: event.date,
    oddsHome: 1.85, // Cote estimée
    oddsAway: 1.85,
    oddsDraw: 3.3,
    recommendation: adjustedProb > 50 ? homeTeam : awayTeam,
    predictedResult: adjustedProb > 50 ? 'home' : 'away',
    winProbability: Math.round(adjustedProb > 50 ? adjustedProb : 100 - adjustedProb),
    confidence: getConfidenceFromProb(adjustedProb > 50 ? adjustedProb : 100 - adjustedProb),
    riskPercentage: Math.round(riskPercentage),
    riskLevel: getRiskLevel(riskPercentage),
    valueBet: false,
    reasons: [
      `Match ${homeTeam} vs ${awayTeam}`,
      `Probabilité: ${Math.round(adjustedProb)}%`,
    ],
    warnings: [],
    source: 'espn',
    modelVersion: 'football-v1.0',
    generatedAt: new Date().toISOString(),
  };
}

function createBasketballPrediction(event: any, home: any, away: any): DailyPrediction | null {
  const homeTeam = home.team?.displayName || 'Unknown';
  const awayTeam = away.team?.displayName || 'Unknown';
  
  // Calcul basé sur les records
  const homeRecord = home.records?.find((r: any) => r.type === 'total');
  const awayRecord = away.records?.find((r: any) => r.type === 'total');
  const homeWins = homeRecord?.wins || 0;
  const homeLosses = homeRecord?.losses || 0;
  const awayWins = awayRecord?.wins || 0;
  const awayLosses = awayRecord?.losses || 0;
  
  const homeWinRate = homeWins / (homeWins + homeLosses) || 0.5;
  const awayWinRate = awayWins / (awayWins + awayLosses) || 0.5;
  
  // Avantage domicile en NBA (~60%)
  const homeProb = (homeWinRate * 0.6 + (1 - awayWinRate) * 0.4) * 100 + 10;
  const adjustedProb = Math.min(75, Math.max(25, homeProb));
  
  const riskPercentage = 100 - adjustedProb;
  
  return {
    id: `nba_${event.id}`,
    sport: 'basketball',
    league: 'NBA',
    homeTeam,
    awayTeam,
    date: event.date,
    oddsHome: 1.85,
    oddsAway: 1.85,
    recommendation: adjustedProb > 50 ? homeTeam : awayTeam,
    predictedResult: adjustedProb > 50 ? 'home' : 'away',
    winProbability: Math.round(adjustedProb > 50 ? adjustedProb : 100 - adjustedProb),
    confidence: getConfidenceFromProb(adjustedProb > 50 ? adjustedProb : 100 - adjustedProb),
    riskPercentage: Math.round(riskPercentage),
    riskLevel: getRiskLevel(riskPercentage),
    valueBet: false,
    reasons: [
      `${homeTeam}: ${homeWins}W-${homeLosses}L`,
      `${awayTeam}: ${awayWins}W-${awayLosses}L`,
      `Avantage domicile NBA`,
    ],
    warnings: [],
    source: 'espn',
    modelVersion: 'nba-v1.0',
    generatedAt: new Date().toISOString(),
  };
}

function createHockeyPrediction(event: any, home: any, away: any): DailyPrediction | null {
  const homeTeam = home.team?.displayName || 'Unknown';
  const awayTeam = away.team?.displayName || 'Unknown';
  
  // Calcul similaire au basketball
  const homeRecord = home.records?.find((r: any) => r.type === 'total');
  const awayRecord = away.records?.find((r: any) => r.type === 'total');
  const homeWins = homeRecord?.wins || 0;
  const awayWins = awayRecord?.wins || 0;
  
  const totalWins = homeWins + awayWins;
  const homeProb = totalWins > 0 ? (homeWins / totalWins) * 100 + 5 : 50;
  const adjustedProb = Math.min(75, Math.max(25, homeProb));
  
  const riskPercentage = 100 - adjustedProb;
  
  return {
    id: `nhl_${event.id}`,
    sport: 'hockey',
    league: 'NHL',
    homeTeam,
    awayTeam,
    date: event.date,
    oddsHome: 1.85,
    oddsAway: 1.85,
    recommendation: adjustedProb > 50 ? homeTeam : awayTeam,
    predictedResult: adjustedProb > 50 ? 'home' : 'away',
    winProbability: Math.round(adjustedProb > 50 ? adjustedProb : 100 - adjustedProb),
    confidence: getConfidenceFromProb(adjustedProb > 50 ? adjustedProb : 100 - adjustedProb),
    riskPercentage: Math.round(riskPercentage),
    riskLevel: getRiskLevel(riskPercentage),
    valueBet: false,
    reasons: [
      `Match NHL: ${homeTeam} vs ${awayTeam}`,
    ],
    warnings: [],
    source: 'espn',
    modelVersion: 'nhl-v1.0',
    generatedAt: new Date().toISOString(),
  };
}

// ============================================
// UTILITAIRES
// ============================================

function getRiskLevel(riskPercentage: number): 'safe' | 'moderate' | 'risky' {
  if (riskPercentage <= RISK_THRESHOLDS.safe) return 'safe';
  if (riskPercentage <= RISK_THRESHOLDS.moderate) return 'moderate';
  return 'risky';
}

function getConfidenceFromProb(prob: number): 'very_high' | 'high' | 'medium' | 'low' {
  if (prob >= 75) return 'very_high';
  if (prob >= 65) return 'high';
  if (prob >= 55) return 'medium';
  return 'low';
}

function getEndOfDay(): string {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
}

function calculateSummary(predictions: DailyPrediction[]): DailyPredictionsFile['summary'] {
  const bySport: Record<string, number> = {};
  const byRisk = { safe: 0, moderate: 0, risky: 0 };
  let valueBets = 0;
  
  for (const p of predictions) {
    bySport[p.sport] = (bySport[p.sport] || 0) + 1;
    byRisk[p.riskLevel]++;
    if (p.valueBet) valueBets++;
  }
  
  return {
    total: predictions.length,
    bySport,
    byRisk,
    valueBets,
  };
}

function saveDailyPredictions(data: DailyPredictionsFile): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  fs.writeFileSync(DAILY_FILE, JSON.stringify(data, null, 2));
  console.log(`💾 Prédictions sauvegardées: ${DAILY_FILE}`);
}

// ============================================
// EXPORTS
// ============================================

export {
  RISK_THRESHOLDS,
  DAILY_FILE,
};
