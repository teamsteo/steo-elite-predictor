// @ts-nocheck
/**
 * Système de croisement multi-sources pour validation des pronostics
 * Combine: ESPN API + BetExplorer (cotes réalistes)
 * 
 * SOURCES PRIMAIRES:
 * - NBA: ESPN Scoreboard API (gratuite, temps réel)
 * - Football: ESPN Soccer API (gratuite)
 * - Cotes: BetExplorer (estimations basées sur la force des équipes)
 * 
 * TRANSPARENCE DES DONNÉES:
 * - dataQuality indique si les prédictions sont basées sur des données réelles ou estimées
 * - Les prédictions "estimated" sont clairement identifiées
 * 
 * NOTE: The Odds API n'est plus utilisée (quota épuisé)
 */

import { fetchRealNBAGames, getTodayNBASchedule, getNBAPredictions } from './nbaData';
import { getRealTimeSportsData, RealTimeMatch, isRealDataAvailable } from './realTimeSportsData';
import { analyzeMatchWithRealData, calculateFormScore } from './apiFootball';
import { fetchAllMatchesWithOdds, IntegratedMatch } from './oddsService';

// Alias pour compatibilité
type FallbackMatch = RealTimeMatch;

// Type pour la qualité des données
type DataQuality = 'real' | 'estimated' | 'none';

interface CrossValidatedMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  date: string;           // Date UTC (stockage technique)
  gameDate?: string;      // Date sportive (date de début en heure locale) - utilisée pour les statistiques
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  status: string;
  sources: string[]; // Liste des sources
  timeSlot?: 'day' | 'night';
  insight: {
    riskPercentage: number;
    valueBetDetected: boolean;
    valueBetType: string | null;
    confidence: string;
    crossValidation?: {
      sourcesCount: number;
      oddsConsensus: boolean;
      dataQuality: 'high' | 'medium' | 'low';
    };
  };
  // Qualité des prédictions (NOUVEAU)
  dataQuality?: {
    result: DataQuality; // 'real' si basé sur stats réelles
    goals: DataQuality; // 'real' si basé sur stats équipe
    cards: DataQuality; // 'none' car pas de données réelles
    corners: DataQuality; // 'none' car pas de données réelles
  };
  // Prédictions Football - avec source
  goalsPrediction?: {
    total: number;
    over05?: number;
    over15: number;
    over25: number;
    under25: number;
    over35?: number;
    over45?: number;
    bothTeamsScore: number;
    prediction: string;
    basedOn: DataQuality; // 'real' ou 'estimated'
  };
  // Prédictions de cartons (football uniquement)
  cardsPrediction?: {
    total: number;
    over45: number;
    under45: number;
    redCardRisk: number;
    prediction: string;
  };
  // Prédictions de corners (football uniquement)
  cornersPrediction?: {
    total: number;
    over85: number;
    under85: number;
    over95: number;
    prediction: string;
  };
  // Prédictions avancées (Football) - avec source
  advancedPredictions?: {
    btts: { yes: number; no: number; basedOn: DataQuality };
    correctScore: { home: number; away: number; prob: number }[];
    halfTime: { home: number; draw: number; away: number; basedOn: DataQuality };
  };
  // Stats équipe (NOUVEAU - données réelles)
  teamStats?: {
    home: {
      form: string;
      avgGoalsScored: number;
      avgGoalsConceded: number;
      winRate: number;
      dataAvailable: boolean;
    };
    away: {
      form: string;
      avgGoalsScored: number;
      avgGoalsConceded: number;
      winRate: number;
      dataAvailable: boolean;
    };
    h2h?: {
      total: number;
      homeWins: number;
      draws: number;
      awayWins: number;
      avgGoals: number;
    };
  };
  // Prédictions NBA spécifiques
  nbaPredictions?: {
    predictedWinner: 'home' | 'away';
    winnerTeam: string;
    winnerProb: number;
    spread: { line: number; favorite: string; confidence: number };
    totalPoints: { line: number; predicted: number; overProb: number; recommendation: string };
    topScorer: { team: string; player: string; predictedPoints: number };
    keyMatchup: string;
    confidence: 'high' | 'medium' | 'low';
  };
  // Propriétés pour les matchs en direct (NBA)
  homeScore?: number;
  awayScore?: number;
  isLive?: boolean;
  period?: number;
  clock?: string;
  // Impact des blessures
  injuryImpact?: {
    homeInjuries: number;
    awayInjuries: number;
    impactLevel: 'low' | 'medium' | 'high';
    affectedPlayers: string[];
  };
  injuryReasoning?: string[];
  injuryRecommendation?: string;
  injuries?: {
    homeTeam: any[];
    awayTeam: any[];
  };
}

// Interface pour les stats de timing
interface TimingInfo {
  currentHour: number;
  canRefresh: boolean;
  nextRefreshTime: string;
  currentPhase: 'morning' | 'afternoon' | 'evening';
  message: string;
}

// Interface pour les stats de sources
interface SourceStats {
  oddsApi: { count: number; status: 'online' | 'offline' };
  footballData: { count: number; status: 'online' | 'offline' };
  totalMatches: number;
  todayMatches: number;
  lastUpdate: string;
}

// Ligues prioritaires pour le football (plus le chiffre est bas, plus c'est prioritaire)
const PRIORITY_LEAGUES: Record<string, { priority: number; name: string; dataQuality: 'high' | 'medium' | 'low' }> = {
  // ===== ANGLETERRE =====
  'soccer_epl': { priority: 1, name: 'Premier League', dataQuality: 'high' },
  // ===== FRANCE =====
  'soccer_france_ligue_one': { priority: 1, name: 'Ligue 1', dataQuality: 'high' },
  // ===== ESPAGNE =====
  'soccer_spain_la_liga': { priority: 1, name: 'La Liga', dataQuality: 'high' },
  // ===== ALLEMAGNE =====
  'soccer_germany_bundesliga': { priority: 1, name: 'Bundesliga', dataQuality: 'high' },
  // ===== PORTUGAL =====
  'soccer_portugal_primeira_liga': { priority: 2, name: 'Liga Portugal', dataQuality: 'high' },
  // ===== BELGIQUE =====
  'soccer_belgium_first_div': { priority: 2, name: 'Jupiler Pro League', dataQuality: 'high' },
  // ===== COMPÉTITIONS EUROPÉENNES =====
  'soccer_uefa_champs_league': { priority: 1, name: 'Champions League', dataQuality: 'high' },
  'soccer_uefa_europa_league': { priority: 2, name: 'Europa League', dataQuality: 'high' },
  // ===== COMPÉTITIONS INTERNATIONALES =====
  'soccer_fifa_world_cup': { priority: 1, name: 'Coupe du Monde', dataQuality: 'high' },
  'soccer_uefa_euro': { priority: 1, name: 'Euro', dataQuality: 'high' },
};

// ===== NBA - BASKETBALL =====
const NBA_LEAGUE_KEY = 'basketball_nba';
const NBA_LEAGUE_NAME = 'NBA';

/**
 * Vérifie si un match est aujourd'hui (en heure locale Paris)
 * STRICTEMENT: N'accepte que les matchs de la date du jour
 */
function isToday(dateString: string, sport?: string, gameDate?: string): boolean {
  if (!dateString) return false;
  
  // Date du jour en heure de Paris
  const now = new Date();
  const todayParis = now.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  
  // Si gameDate est fourni, l'utiliser (date sportive déjà formatée)
  if (gameDate) {
    return gameDate === new Date().toISOString().split('T')[0];
  }
  
  // Date du match en heure de Paris
  const matchDate = new Date(dateString);
  const matchDateParis = matchDate.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  
  // STRICTEMENT: uniquement les matchs d'aujourd'hui
  return matchDateParis === todayParis;
}

/**
 * Formate une date pour l'affichage (en heure locale Paris)
 * Les dates stockées sont en UTC
 */
function formatMatchDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  
  // Comparer les dates en heure locale Paris
  const todayParis = new Date(now.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }));
  const tomorrowParis = new Date(todayParis);
  tomorrowParis.setDate(tomorrowParis.getDate() + 1);
  
  const dateParis = new Date(date.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }));
  
  // Heure en format local Paris
  const time = date.toLocaleTimeString('fr-FR', { 
    hour: '2-digit', 
    minute: '2-digit',
    timeZone: 'Europe/Paris'
  });
  
  const isTodayDate = dateParis.toDateString() === todayParis.toDateString();
  const isTomorrowDate = dateParis.toDateString() === tomorrowParis.toDateString();
  
  if (isTodayDate) {
    return `Aujourd'hui ${time}`;
  } else if (isTomorrowDate) {
    return `Demain ${time}`;
  } else {
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + time;
  }
}

/**
 * Détermine le créneau horaire d'un match basé sur son heure GMT
 * NOUVEAU PLAN:
 * - 00h-20h GMT = Journée (Foot uniquement)
 * - 20h-00h GMT = Nuit (NBA uniquement)
 */
function getTimeSlot(dateString: string, sport: string): 'day' | 'night' {
  const date = new Date(dateString);
  const startHour = date.getUTCHours(); // Utiliser UTC/GMT
  
  // NBA = toujours nuit (20h-00h GMT typiquement 01h-04h en Europe)
  if (sport === 'Basket') {
    return 'night';
  }
  
  // Football = journée (00h-20h GMT)
  // Matchs européens typiquement 12h-22h GMT
  if (startHour < 20) {
    return 'day';
  } else {
    return 'night';
  }
}

/**
 * Calcule les infos de timing pour la gestion du refresh
 * NOUVEAU PLAN:
 * - 00h-20h GMT: Football (10 matchs)
 * - 20h-00h GMT: NBA (5 matchs)
 */
function getTimingInfo(): TimingInfo {
  const now = new Date();
  const currentHour = now.getUTCHours(); // Utiliser GMT/UTC
  
  let canRefresh = true;
  let nextRefreshTime = 'Maintenant';
  let currentPhase: 'morning' | 'afternoon' | 'evening';
  let message = '';
  
  if (currentHour < 12) {
    // Matinée GMT: Football
    currentPhase = 'morning';
    canRefresh = true;
    message = '⚽ Matchs Football disponibles (journée)';
  } else if (currentHour < 20) {
    // Après-midi GMT: Football
    currentPhase = 'afternoon';
    canRefresh = true;
    message = '⚽ Matchs Football disponibles (soirée)';
  } else {
    // Nuit GMT: NBA
    currentPhase = 'evening';
    canRefresh = true;
    message = '🏀 Matchs NBA disponibles (nuit)';
  }
  
  return {
    currentHour,
    canRefresh,
    nextRefreshTime,
    currentPhase,
    message
  };
}

/**
 * Filtre et répartit les matchs selon le NOUVEAU PLAN:
 * - Journée (00h-20h GMT): 10 matchs Football
 * - Nuit (20h-00h GMT): 5 matchs NBA
 */
function distributeMatchesByTimeSlot(
  matches: CrossValidatedMatch[], 
  timing: TimingInfo
): CrossValidatedMatch[] {
  // Ajouter le timeSlot à chaque match
  const matchesWithSlot = matches.map(m => ({
    ...m,
    timeSlot: getTimeSlot(m.date, m.sport)
  }));
  
  // Séparer Football et NBA
  const footballMatches = matchesWithSlot.filter(m => m.sport === 'Foot');
  const nbaMatches = matchesWithSlot.filter(m => m.sport === 'Basket');
  
  // ===== LOGIQUE ADAPTATIVE =====
  // Si NBA disponible → 10 Foot + NBA
  // Si NBA indisponible (nuit/été) → Plus de Foot
  let selectedFootball: CrossValidatedMatch[];
  let selectedNBA: CrossValidatedMatch[];
  
  if (nbaMatches.length > 0) {
    // NBA disponible: 10 Foot + NBA
    selectedFootball = footballMatches.slice(0, 10);
    selectedNBA = nbaMatches.slice(0, 5);
    console.log(`🏀 NBA disponible: ${selectedNBA.length} matchs`);
  } else {
    // Pas de NBA (nuit européenne, off-season): Plus de Foot
    selectedFootball = footballMatches.slice(0, 15);
    selectedNBA = [];
    console.log(`🌙 NBA non disponible - Affichage de ${selectedFootball.length} matchs Foot`);
  }
  
  // Combiner: Football d'abord, puis NBA
  const result = [...selectedFootball, ...selectedNBA];
  
  console.log(`📊 Répartition: Football(${selectedFootball.length}) + NBA(${selectedNBA.length}) = ${result.length} matchs`);
  
  return result;
}

/**
 * Récupère les matchs depuis The Odds API
 * @deprecated The Odds API n'est plus utilisée (quota épuisé)
 * Utiliser ESPN + BetExplorer via oddsService à la place
 */
async function fetchOddsApiMatches(): Promise<any[]> {
  console.log('⚠️ The Odds API n\'est plus utilisée (quota épuisé) - Utiliser ESPN + BetExplorer');
  return [];
}

/**
 * Récupère les matchs depuis Football-Data API
 */
async function fetchFootballDataMatches(): Promise<any[]> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    console.log('⚠️ FOOTBALL_DATA_API_KEY non configurée');
    return [];
  }

  try {
    // Récupérer les matchs des prochaines 24h
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const dateFrom = today.toISOString().split('T')[0];
    const dateTo = tomorrow.toISOString().split('T')[0];
    
    const response = await fetch(
      `https://api.football-data.org/v4/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      {
        headers: { 'X-Auth-Token': apiKey },
        next: { revalidate: 21600 } // 6 heures de cache
      }
    );
    
    if (!response.ok) {
      console.error(`Erreur Football-Data API: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const matches = data.matches || [];
    
    console.log(`✅ Football-Data API: ${matches.length} matchs récupérés`);
    return matches.map((m: any) => ({ ...m, source: 'football-data' }));
    
  } catch (error) {
    console.error('Erreur Football-Data API:', error);
    return [];
  }
}

/**
 * Récupère les VRAIS matchs NBA depuis ESPN Scoreboard API
 * Source principale pour les matchs NBA en temps réel
 * IMPORTANT: Les dates sont en UTC
 */
async function fetchESPNNBAGames(): Promise<CrossValidatedMatch[]> {
  console.log('🏀 Récupération des VRAIS matchs NBA (ESPN)...');
  
  try {
    const games = await fetchRealNBAGames();
    
    if (games.length === 0) {
      console.log('⚠️ Aucun match NBA ESPN aujourd\'hui');
      return [];
    }
    
    const matches: CrossValidatedMatch[] = [];
    
    for (const game of games) {
      // Récupérer les prédictions basées sur les stats
      const predictions = getNBAPredictions(game.homeTeam, game.awayTeam);
      
      // Déterminer le statut
      let status: 'upcoming' | 'live' | 'finished' = 'upcoming';
      if (game.isLive) status = 'live';
      else if (game.status === 'finished') status = 'finished';
      
      // Utiliser le champ dateUTC si disponible, sinon construire la date
      const matchDate = game.dateUTC || `${game.date}T${game.time}:00Z`;
      
      const match: CrossValidatedMatch = {
        id: game.id,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        sport: 'Basket',
        league: 'NBA',
        date: matchDate,  // Date ISO en UTC
        gameDate: game.gameDate || game.date,  // Date sportive (date de début en heure locale EST)
        oddsHome: predictions.oddsHome,
        oddsDraw: null,
        oddsAway: predictions.oddsAway,
        status,
        sources: ['ESPN NBA API'],
        timeSlot: 'night',
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        isLive: game.isLive,
        period: game.period,
        clock: game.clock,
        insight: {
          riskPercentage: predictions.riskPercentage,
          valueBetDetected: Math.abs(predictions.winProb.home - 50) > 25,
          valueBetType: predictions.winProb.home > 60 ? 'home' : predictions.winProb.away > 60 ? 'away' : null,
          confidence: predictions.confidence,
          crossValidation: {
            sourcesCount: 1,
            oddsConsensus: true,
            dataQuality: 'high'
          }
        },
        nbaPredictions: {
          predictedWinner: predictions.winProb.home > 50 ? 'home' : 'away',
          winnerTeam: predictions.winProb.home > 50 ? game.homeTeam : game.awayTeam,
          winnerProb: Math.max(predictions.winProb.home, predictions.winProb.away),
          spread: {
            line: predictions.spread.line,
            favorite: predictions.spread.line > 0 ? game.awayTeam : game.homeTeam,
            confidence: predictions.spread.homeProb
          },
          totalPoints: {
            line: predictions.total.line,
            predicted: predictions.total.predicted,
            overProb: predictions.total.overProb,
            recommendation: predictions.total.overProb > 52 ? 'Over' : predictions.total.overProb < 48 ? 'Under' : 'Neutre'
          },
          topScorer: {
            team: game.homeTeam,
            player: 'N/A',
            predictedPoints: 25
          },
          keyMatchup: `${game.homeTeam} vs ${game.awayTeam}`,
          confidence: predictions.confidence
        }
      };
      
      matches.push(match);
    }
    
    const liveCount = matches.filter(m => m.isLive).length;
    console.log(`✅ ESPN NBA: ${matches.length} matchs (${liveCount} EN DIRECT)`);
    
    return matches;
    
  } catch (error) {
    console.error('❌ Erreur ESPN NBA:', error);
    return [];
  }
}

/**
 * Normalise le nom d'une équipe pour le croisement
 */
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Calcule les prédictions de buts UNIQUEMENT à partir des cotes
 * TRANSPARENCE: Cette fonction ne produit que des estimations basées sur les cotes
 * Pour des prédictions basées sur des stats réelles, utiliser analyzeMatchWithRealData()
 */
function calculateGoalsPredictionFromOdds(
  oddsHome: number,
  oddsAway: number,
  oddsDraw: number | null
): CrossValidatedMatch['goalsPrediction'] {
  // ATTENTION: Ces prédictions sont ESTIMÉES à partir des cotes
  // Elles ne reflètent PAS les performances réelles des équipes
  
  // Calcul des probabilités implicites
  const probHome = 1 / oddsHome;
  const probAway = 1 / oddsAway;
  const probDraw = oddsDraw ? 1 / oddsDraw : 0.25;
  const totalImplied = probHome + probAway + probDraw;
  
  // Normalisation (marge du bookmaker)
  const normalizedProbHome = probHome / totalImplied;
  const normalizedProbAway = probAway / totalImplied;
  
  // Estimation du nombre de buts basée sur la disparité des cotes
  const oddsRatio = Math.max(oddsHome, oddsAway) / Math.min(oddsHome, oddsAway);
  
  // Calcul du total attendu (modèle statistique basé sur cotes uniquement)
  let expectedGoals = 2.6; // Moyenne football
  
  if (oddsRatio > 3) {
    expectedGoals = 2.3;
  } else if (oddsRatio < 1.5) {
    expectedGoals = 2.9;
  }
  
  if (oddsDraw && oddsDraw < 3.0) {
    expectedGoals *= 0.9;
  }
  
  // Distribution de Poisson pour probabilités
  const avgGoals = expectedGoals;
  
  // Over 0.5 (au moins 1 but)
  const over05Prob = Math.round((1 - Math.exp(-avgGoals)) * 100);
  
  // Over 1.5
  const poissonCumulative1 = Math.exp(-avgGoals) * (1 + avgGoals);
  const over15Prob = Math.round((1 - poissonCumulative1) * 100);
  
  // Over 2.5
  const poissonCumulative2 = Math.exp(-avgGoals) * (1 + avgGoals + (avgGoals * avgGoals) / 2);
  const over25Prob = Math.round((1 - poissonCumulative2) * 100);
  
  // Over 3.5
  const poissonCumulative3 = Math.exp(-avgGoals) * (1 + avgGoals + (avgGoals * avgGoals) / 2 + (avgGoals * avgGoals * avgGoals) / 6);
  const over35Prob = Math.round((1 - poissonCumulative3) * 100);
  
  // Over 4.5
  const poissonCumulative4 = Math.exp(-avgGoals) * (1 + avgGoals + (avgGoals * avgGoals) / 2 + (avgGoals * avgGoals * avgGoals) / 6 + (avgGoals * avgGoals * avgGoals * avgGoals) / 24);
  const over45Prob = Math.round((1 - poissonCumulative4) * 100);
  
  const btsProb = Math.round((normalizedProbHome + normalizedProbAway) * 40 + 
                             (1 - Math.abs(normalizedProbHome - normalizedProbAway)) * 30);
  
  // Déterminer la prédiction
  let prediction = '';
  if (over25Prob >= 55) {
    prediction = 'Over 2.5 buts';
  } else if (over25Prob <= 45) {
    prediction = 'Under 2.5 buts';
  } else if (btsProb >= 55) {
    prediction = 'Les deux marquent';
  } else {
    prediction = over15Prob >= 60 ? 'Over 1.5 buts' : 'Match serré';
  }
  
  return {
    total: Math.round(expectedGoals * 10) / 10,
    over05: over05Prob,
    over15: over15Prob,
    over25: over25Prob,
    under25: 100 - over25Prob,
    over35: over35Prob,
    over45: over45Prob,
    bothTeamsScore: Math.min(btsProb, 85),
    prediction,
    basedOn: 'estimated' // Toujours 'estimated' car basé sur cotes uniquement
  };
}

/**
 * SUPPRIMÉ: calculateCardsPrediction et calculateCornersPrediction
 * 
 * RAISON DE LA SUPPRESSION:
 * Ces fonctions produisaient des "prédictions" basées sur des modèles purement théoriques
 * sans AUCUNE donnée réelle sur les équipes. Cela donnait une illusion de précision
 * qui n'existait pas.
 * 
 * Les prédictions de cartons nécessiteraient:
 * - Stats réelles de cartons par équipe (non disponibles)
 * - Style de jeu des équipes (non disponible)
 * - Historique de l'arbitre (non disponible)
 * 
 * Les prédictions de corners nécessiteraient:
 * - Stats réelles de corners par équipe (non disponibles)
 * - Tactiques des équipes (non disponibles)
 * 
 * CONCLUSION: Mieux vaut ne pas afficher ces prédictions que d'afficher des estimations
 * sans fondement réel. Seules les données de cotes des bookmakers sont fiables pour le moment.
 */

/**
 * Calcule les prédictions avancées (BTTS, Score exact, MT)
 * ATTENTION: Basées uniquement sur les cotes - qualité 'estimated'
 */
function calculateAdvancedPredictions(
  oddsHome: number,
  oddsAway: number,
  oddsDraw: number | null,
  goalsPrediction: CrossValidatedMatch['goalsPrediction']
): CrossValidatedMatch['advancedPredictions'] {
  // ATTENTION: Ces prédictions sont basées sur les cotes uniquement
  // Elles ne reflètent PAS les performances réelles des équipes
  
  // Probabilités implicites
  const probHome = 1 / oddsHome;
  const probAway = 1 / oddsAway;
  const probDraw = oddsDraw ? 1 / oddsDraw : 0.25;
  const totalImplied = probHome + probAway + probDraw;
  
  const normalizedProbHome = probHome / totalImplied;
  const normalizedProbAway = probAway / totalImplied;
  const normalizedProbDraw = probDraw / totalImplied;
  
  // BTTS (Both Teams To Score)
  const bttsYes = goalsPrediction?.bothTeamsScore || 
    Math.round((normalizedProbHome + normalizedProbAway) * 40 + 
               (1 - Math.abs(normalizedProbHome - normalizedProbAway)) * 30);
  
  // Score exact - basé sur la distribution de Poisson (théorique)
  const expectedHomeGoals = (goalsPrediction?.total || 2.5) * normalizedProbHome / (normalizedProbHome + normalizedProbAway);
  const expectedAwayGoals = (goalsPrediction?.total || 2.5) * normalizedProbAway / (normalizedProbHome + normalizedProbAway);
  
  // Scores probables (simplifié)
  const correctScore = [
    { home: Math.round(expectedHomeGoals), away: Math.round(expectedAwayGoals), prob: 15 },
    { home: Math.round(expectedHomeGoals), away: Math.round(expectedAwayGoals) - 1, prob: 12 },
    { home: Math.round(expectedHomeGoals) - 1, away: Math.round(expectedAwayGoals), prob: 10 },
    { home: 1, away: 1, prob: 12 },
    { home: 0, away: 0, prob: 8 },
  ].filter(s => s.home >= 0 && s.away >= 0).sort((a, b) => b.prob - a.prob).slice(0, 3);
  
  // Résultat MT (mi-temps) - généralement plus de nuls
  const halfTime = {
    home: Math.round(normalizedProbHome * 38),
    draw: Math.round(normalizedProbDraw * 45),
    away: Math.round(normalizedProbAway * 38)
  };
  // Normaliser à 100%
  const htTotal = halfTime.home + halfTime.draw + halfTime.away;
  halfTime.home = Math.round(halfTime.home * 100 / htTotal);
  halfTime.draw = Math.round(halfTime.draw * 100 / htTotal);
  halfTime.away = 100 - halfTime.home - halfTime.draw;
  
  return {
    btts: { yes: Math.min(bttsYes, 80), no: 100 - Math.min(bttsYes, 80), basedOn: 'estimated' },
    correctScore,
    halfTime: { ...halfTime, basedOn: 'estimated' }
  };
}

/**
 * Croise les données des deux sources
 */
function crossValidateMatches(
  oddsApiMatches: any[],
  footballDataMatches: any[]
): CrossValidatedMatch[] {
  const validatedMatches: CrossValidatedMatch[] = [];
  const usedOddsIds = new Set<string>();
  
  // Créer un index des matchs Football-Data pour recherche rapide
  const fdIndex = new Map<string, any>();
  for (const fdMatch of footballDataMatches) {
    const homeKey = normalizeTeamName(fdMatch.homeTeam?.name || fdMatch.homeTeam || '');
    const awayKey = normalizeTeamName(fdMatch.awayTeam?.name || fdMatch.awayTeam || '');
    const key = `${homeKey}-${awayKey}`;
    fdIndex.set(key, fdMatch);
  }
  
  // Traiter les matchs Odds API
  for (const oddsMatch of oddsApiMatches) {
    const homeKey = normalizeTeamName(oddsMatch.home_team || '');
    const awayKey = normalizeTeamName(oddsMatch.away_team || '');
    const crossKey = `${homeKey}-${awayKey}`;
    
    const fdMatch = fdIndex.get(crossKey);
    const hasMultipleSources = !!fdMatch;
    
    // Extraire les cotes - CORRECTION: associer correctement aux équipes
    const bookmaker = oddsMatch.bookmakers?.[0];
    const h2hMarket = bookmaker?.markets?.find((m: any) => m.key === 'h2h');
    const outcomes = h2hMarket?.outcomes || [];
    
    let oddsHome = 0;
    let oddsDraw: number | null = null;
    let oddsAway = 0;
    
    const homeTeamNorm = normalizeTeamName(oddsMatch.home_team || '');
    const awayTeamNorm = normalizeTeamName(oddsMatch.away_team || '');
    
    for (const outcome of outcomes) {
      const outcomeName = normalizeTeamName(outcome.name || '');
      const price = outcome.price;
      const name = outcome.name?.toLowerCase() || '';
      
      // Vérifier si c'est un match nul
      if (name === 'draw' || name === 'x' || name === 'nul' || name === 'match nul') {
        oddsDraw = price;
      } 
      // Associer à l'équipe domicile
      else if (outcomeName === homeTeamNorm || 
               outcomeName.includes(homeTeamNorm) || 
               homeTeamNorm.includes(outcomeName)) {
        oddsHome = price;
      }
      // Associer à l'équipe extérieur
      else if (outcomeName === awayTeamNorm || 
               outcomeName.includes(awayTeamNorm) || 
               awayTeamNorm.includes(outcomeName)) {
        oddsAway = price;
      }
      // Fallback: si pas encore assigné
      else if (oddsHome === 0) {
        oddsHome = price;
      } else {
        oddsAway = price;
      }
    }
    
    if (oddsHome === 0 || oddsAway === 0) continue;
    
    // ===== CALCUL DES PROBABILITÉS RÉELLES =====
    const totalImplied = (1/oddsHome) + (1/oddsAway) + (oddsDraw ? 1/oddsDraw : 0);
    
    // Probabilités implicites normalisées (en pourcentage)
    const homeWinProb = Math.round((1/oddsHome) / totalImplied * 100);
    const awayWinProb = Math.round((1/oddsAway) / totalImplied * 100);
    const drawProb = oddsDraw ? Math.round((1/oddsDraw) / totalImplied * 100) : 0;
    
    // Déterminer le favori
    const favorite = oddsHome < oddsAway ? 'home' : 'away';
    const favoriteProb = favorite === 'home' ? homeWinProb : awayWinProb;
    const favoriteOdds = favorite === 'home' ? oddsHome : oddsAway;
    
    // ===== CALCUL DU RISQUE BASÉ SUR LA RECOMMANDATION =====
    // Le risque = 100 - probabilité de réussite de la recommandation
    let recommendationSuccessProb = 50;
    let riskPercentage = 50;
    
    // Si cote du favori < 1.5 → Recommandation "Victoire Favori"
    if (favoriteOdds < 1.5 && favoriteProb >= 65) {
      recommendationSuccessProb = favoriteProb;
    }
    // Si cote du favori < 2.0 → Recommandation "Favori ou Nul" (Double Chance)
    else if (favoriteOdds < 2.0 && favoriteProb >= 50) {
      // Probabilité = Victoire favori + Nul
      recommendationSuccessProb = favorite === 'home' 
        ? homeWinProb + drawProb 
        : awayWinProb + drawProb;
    }
    // Sinon → Match serré, probabilité basée sur le favori
    else {
      recommendationSuccessProb = Math.max(homeWinProb, awayWinProb);
    }
    
    // Le risque est l'inverse de la probabilité de réussite
    riskPercentage = 100 - recommendationSuccessProb;
    
    // Ajustement pour sources multiples (plus de confiance)
    if (hasMultipleSources) {
      riskPercentage = Math.max(riskPercentage - 5, 10);
    }
    
    // Détection de value bet améliorée
    const margin = totalImplied - 1;
    const hasValueBet = margin > 0.03;
    
    // Déterminer le type de value bet
    let valueBetType: string | null = null;
    if (hasValueBet) {
      if (oddsDraw && oddsDraw > 3.0) {
        valueBetType = 'draw';
      } else if (oddsHome < oddsAway) {
        valueBetType = 'home';
      } else {
        valueBetType = 'away';
      }
    }
    
    // Qualité des données
    const dataQuality: 'high' | 'medium' | 'low' = hasMultipleSources ? 'high' : 'medium';
    
    // Confiance
    let confidence: string;
    if (riskPercentage <= 30 && hasMultipleSources) {
      confidence = 'high';
    } else if (riskPercentage <= 40) {
      confidence = 'high';
    } else if (riskPercentage <= 55) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }
    
    // Sport et ligue - Utiliser sport_type si disponible
    const sportKey = oddsMatch.sport_key || '';
    const sportType = oddsMatch.sport_type; // 'football' ou 'nba'
    const leagueInfo = PRIORITY_LEAGUES[sportKey];
    
    // Déterminer le sport: NBA en priorité si sport_type='nba'
    const sport = sportType === 'nba' || sportKey.includes('basketball') ? 'Basket' : 
                  sportKey.includes('icehockey') ? 'Hockey' : 
                  sportKey.includes('tennis') ? 'Tennis' : 'Foot';
    
    // Nom de la ligue
    const leagueName = sport === 'Basket' ? NBA_LEAGUE_NAME : 
                       (leagueInfo?.name || oddsMatch.sport_title || 'Autre');
    
    // Calculer les prédictions de buts (Football uniquement, basées sur cotes)
    // ATTENTION: Prédictions estimées à partir des cotes uniquement
    const goalsPrediction = sport === 'Foot' ? calculateGoalsPredictionFromOdds(oddsHome, oddsAway, oddsDraw) : undefined;
    const advancedPredictions = sport === 'Foot' ? calculateAdvancedPredictions(oddsHome, oddsAway, oddsDraw, goalsPrediction) : undefined;
    
    validatedMatches.push({
      id: oddsMatch.id,
      homeTeam: oddsMatch.home_team,
      awayTeam: oddsMatch.away_team,
      sport,
      league: leagueName,
      date: oddsMatch.commence_time,
      oddsHome,
      oddsDraw,
      oddsAway,
      status: 'upcoming',
      sources: hasMultipleSources ? ['Odds API', 'Football-Data'] : ['Odds API'],
      insight: {
        riskPercentage,
        valueBetDetected: hasValueBet,
        valueBetType,
        confidence,
        crossValidation: {
          sourcesCount: hasMultipleSources ? 2 : 1,
          oddsConsensus: true,
          dataQuality,
        },
      },
      // Qualité des données - TRANSPARENCE
      dataQuality: {
        result: 'estimated', // Basé sur cotes uniquement
        goals: 'estimated', // Basé sur modèle Poisson + cotes
        cards: 'none', // Pas de données réelles disponibles
        corners: 'none' // Pas de données réelles disponibles
      },
      goalsPrediction,
      // cardsPrediction et cornersPrediction SUPPRIMÉS - pas de données réelles
      advancedPredictions,
    });
    
    usedOddsIds.add(oddsMatch.id);
  }
  
  return validatedMatches;
}

/**
 * Trie les matchs par qualité des données, priorité de ligue, et risque
 * NBA est considérée comme haute qualité
 */
function sortMatchesByQuality(matches: CrossValidatedMatch[]): CrossValidatedMatch[] {
  return matches.sort((a, b) => {
    // NBA = haute qualité par défaut
    const isNBA_a = a.sport === 'Basket' && a.league === 'NBA';
    const isNBA_b = b.sport === 'Basket' && b.league === 'NBA';
    
    // 1. Qualité des données de la ligue (high > medium > low)
    let aDataQuality: 'high' | 'medium' | 'low' = isNBA_a ? 'high' : 'low';
    let bDataQuality: 'high' | 'medium' | 'low' = isNBA_b ? 'high' : 'low';
    
    if (!isNBA_a) {
      const aLeagueKey = Object.keys(PRIORITY_LEAGUES).find(k => 
        a.league.includes(PRIORITY_LEAGUES[k].name)
      );
      aDataQuality = aLeagueKey ? PRIORITY_LEAGUES[aLeagueKey].dataQuality : 'low';
    }
    
    if (!isNBA_b) {
      const bLeagueKey = Object.keys(PRIORITY_LEAGUES).find(k => 
        b.league.includes(PRIORITY_LEAGUES[k].name)
      );
      bDataQuality = bLeagueKey ? PRIORITY_LEAGUES[bLeagueKey].dataQuality : 'low';
    }
    
    const qualityOrder = { 'high': 1, 'medium': 2, 'low': 3 };
    if (qualityOrder[aDataQuality] !== qualityOrder[bDataQuality]) {
      return qualityOrder[aDataQuality] - qualityOrder[bDataQuality];
    }
    
    // 2. Priorité de ligue (NBA = priorité 1)
    let aLeaguePriority = isNBA_a ? 1 : 99;
    let bLeaguePriority = isNBA_b ? 1 : 99;
    
    if (!isNBA_a) {
      const aLeagueKey = Object.keys(PRIORITY_LEAGUES).find(k => 
        a.league.includes(PRIORITY_LEAGUES[k].name)
      );
      aLeaguePriority = aLeagueKey ? PRIORITY_LEAGUES[aLeagueKey].priority : 99;
    }
    
    if (!isNBA_b) {
      const bLeagueKey = Object.keys(PRIORITY_LEAGUES).find(k => 
        b.league.includes(PRIORITY_LEAGUES[k].name)
      );
      bLeaguePriority = bLeagueKey ? PRIORITY_LEAGUES[bLeagueKey].priority : 99;
    }
    
    if (aLeaguePriority !== bLeaguePriority) {
      return aLeaguePriority - bLeaguePriority;
    }
    
    // 3. Sources multiples = meilleures données
    const aSources = a.insight.crossValidation?.sourcesCount || 1;
    const bSources = b.insight.crossValidation?.sourcesCount || 1;
    if (aSources !== bSources) {
      return bSources - aSources;
    }
    
    // 4. Risque (plus bas = mieux)
    if (a.insight.riskPercentage !== b.insight.riskPercentage) {
      return a.insight.riskPercentage - b.insight.riskPercentage;
    }
    
    // 5. Value bet en priorité
    if (a.insight.valueBetDetected !== b.insight.valueBetDetected) {
      return a.insight.valueBetDetected ? -1 : 1;
    }
    
    return 0;
  });
}

/**
 * Génère des matchs NBA simulés basés sur les données réelles des équipes
 * Utilisé comme fallback quand The Odds API est épuisé
 * IMPORTANT: Les dates sont en UTC
 */
function generateNBAFallbackMatches(): CrossValidatedMatch[] {
  console.log('🏀 Génération des matchs NBA (fallback)...');
  
  const nbaSchedule = getTodayNBASchedule();
  const matches: CrossValidatedMatch[] = [];
  
  for (const game of nbaSchedule) {
    const predictions = getNBAPredictions(game.homeTeam, game.awayTeam);
    
    // Utiliser le champ dateUTC si disponible
    const matchDate = game.dateUTC || `${game.date}T${game.time}:00Z`;
    
    // Créer le match au format attendu
    const match: CrossValidatedMatch = {
      id: game.id,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      sport: 'Basket',
      league: 'NBA',
      date: matchDate,  // Date ISO en UTC
      gameDate: game.gameDate || game.date,  // Date sportive (date de début en heure locale EST)
      oddsHome: predictions.oddsHome,
      oddsDraw: null, // Pas de nul en NBA
      oddsAway: predictions.oddsAway,
      status: 'upcoming',
      sources: ['NBA Stats (Fallback)'],
      timeSlot: 'night',
      insight: {
        riskPercentage: predictions.riskPercentage,
        valueBetDetected: Math.abs(predictions.winProb.home - 50) > 25,
        valueBetType: predictions.winProb.home > 60 ? 'home' : predictions.winProb.away > 60 ? 'away' : null,
        confidence: predictions.confidence,
      },
      // Qualité des données
      dataQuality: {
        result: 'estimated', // Basé sur Elo ratings estimés
        goals: 'none', // Pas applicable NBA
        cards: 'none',
        corners: 'none'
      },
      // NBA utilise des prédictions différentes
      nbaPredictions: {
        predictedWinner: predictions.winProb.home > 50 ? 'home' : 'away',
        winnerTeam: predictions.winProb.home > 50 ? game.homeTeam : game.awayTeam,
        winnerProb: Math.max(predictions.winProb.home, predictions.winProb.away),
        spread: {
          line: predictions.spread.line,
          favorite: predictions.spread.line > 0 ? game.awayTeam : game.homeTeam,
          confidence: predictions.spread.homeProb
        },
        totalPoints: {
          line: predictions.total.line,
          predicted: predictions.total.predicted,
          overProb: predictions.total.overProb,
          recommendation: predictions.total.overProb > 52 ? 'Over' : predictions.total.overProb < 48 ? 'Under' : 'Neutre'
        },
        topScorer: { team: game.homeTeam, player: 'N/A', predictedPoints: 25 },
        keyMatchup: `${game.homeTeam} vs ${game.awayTeam}`,
        confidence: predictions.confidence
      }
    };
    
    matches.push(match);
  }
  
  console.log(`🏀 NBA Fallback: ${matches.length} matchs générés`);
  return matches;
}

/**
 * Convertit un match fallback vers le format CrossValidatedMatch
 */
function convertFallbackToValidated(fallback: FallbackMatch): CrossValidatedMatch {
  return {
    id: fallback.id,
    homeTeam: fallback.homeTeam,
    awayTeam: fallback.awayTeam,
    sport: fallback.sport,
    league: fallback.league,
    date: `${fallback.date}T${fallback.time}:00Z`,
    oddsHome: fallback.oddsHome,
    oddsDraw: fallback.oddsDraw,
    oddsAway: fallback.oddsAway,
    status: fallback.status,
    sources: [fallback.source],
    timeSlot: fallback.sport === 'Basket' || fallback.sport === 'Hockey' ? 'night' : 'day',
    insight: {
      riskPercentage: fallback.riskPercentage,
      valueBetDetected: Math.abs(fallback.winProb.home - 50) > 25 || 
                        (fallback.winProb.draw !== undefined && fallback.winProb.draw > 32),
      valueBetType: fallback.winProb.home > 60 ? 'home' : 
                    fallback.winProb.away > 60 ? 'away' : 
                    fallback.winProb.draw && fallback.winProb.draw > 30 ? 'draw' : null,
      confidence: fallback.confidence,
      crossValidation: {
        sourcesCount: 1,
        oddsConsensus: true,
        dataQuality: 'medium',
      },
    },
    // Prédictions de buts (football uniquement)
    goalsPrediction: fallback.sport === 'Foot' ? {
      total: 2.5,
      over25: fallback.winProb.home > 55 || fallback.winProb.away > 55 ? 55 : 48,
      under25: fallback.winProb.home > 55 || fallback.winProb.away > 55 ? 45 : 52,
      over15: 72,
      bothTeamsScore: 52,
      prediction: fallback.winProb.draw && fallback.winProb.draw > 28 ? 'Match serré' : 'Over 1.5 buts',
      basedOn: 'estimated' as DataQuality,
    } : undefined,
    // Prédictions de cartons (football uniquement)
    cardsPrediction: fallback.sport === 'Foot' ? {
      total: 4.2,
      over45: 52,
      under45: 48,
      redCardRisk: 18,
      prediction: 'Match normal',
    } : undefined,
    // Prédictions de corners (football uniquement)
    cornersPrediction: fallback.sport === 'Foot' ? {
      total: 9.5,
      over85: 55,
      under85: 45,
      over95: 42,
      prediction: 'Over 8.5 corners',
    } : undefined,
    // Prédictions avancées (football)
    advancedPredictions: fallback.sport === 'Foot' ? {
      btts: { yes: 52, no: 48, basedOn: 'estimated' as DataQuality },
      correctScore: [],
      halfTime: {
        home: Math.round(fallback.winProb.home * 0.8),
        draw: fallback.winProb.draw ? Math.round(fallback.winProb.draw * 1.3) : 15,
        away: Math.round(fallback.winProb.away * 0.8),
        basedOn: 'estimated' as DataQuality,
      },
    } : undefined,
    // Prédictions NBA (basket uniquement)
    nbaPredictions: fallback.sport === 'Basket' && fallback.nbaPredictions ? fallback.nbaPredictions : undefined,
  };
}

/**
 * Fonction principale : récupère et croise les données
 * GARANTIT: Football + NBA Live depuis ESPN
 * SOURCES: ESPN (matchs) + BetExplorer (cotes)
 */
export async function getCrossValidatedMatches(): Promise<{
  matches: CrossValidatedMatch[];
  timing: TimingInfo;
}> {
  console.log('🔄 Début du croisement multi-sources...');
  console.log(`📅 Date du jour: ${new Date().toLocaleDateString('fr-FR')}`);
  
  // Obtenir les infos de timing
  const timing = getTimingInfo();
  console.log(`⏰ Timing: ${timing.message}`);
  
  let validatedMatches: CrossValidatedMatch[] = [];
  
  try {
    // ===== NOUVEAU: Utiliser ESPN + BetExplorer =====
    console.log('📡 Récupération matchs depuis ESPN + cotes BetExplorer...');
    const espnMatches = await fetchAllMatchesWithOdds();
    
    if (espnMatches.length > 0) {
      console.log(`✅ ESPN + BetExplorer: ${espnMatches.length} matchs récupérés`);
      
      // Convertir au format CrossValidatedMatch
      validatedMatches = espnMatches.map((m: IntegratedMatch) => ({
        id: m.id,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        sport: m.sport,
        league: m.league,
        date: m.date,
        oddsHome: m.oddsHome,
        oddsDraw: m.oddsDraw,
        oddsAway: m.oddsAway,
        status: m.status,
        sources: m.sources,
        timeSlot: m.sport === 'Basket' ? 'night' as const : 'day' as const,
        isLive: m.isLive,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        clock: m.clock,
        period: m.period,
        insight: {
          riskPercentage: m.insight.riskPercentage,
          valueBetDetected: m.insight.valueBetDetected,
          valueBetType: m.insight.valueBetType,
          confidence: m.insight.confidence,
          crossValidation: {
            sourcesCount: 2, // ESPN + BetExplorer
            oddsConsensus: true,
            dataQuality: 'high' as const,
          },
        },
        dataQuality: {
          result: 'estimated' as DataQuality,
          goals: 'estimated' as DataQuality,
          cards: 'none' as DataQuality,
          corners: 'none' as DataQuality,
        },
      }));
    }
  } catch (error) {
    console.log('⚠️ Erreur ESPN/BetExplorer:', error);
  }
  
  // ===== NOUVEAU FALLBACK: Scraper temps réel (PAS de données fictives) =====
  if (validatedMatches.length === 0) {
    console.log('⚠️ ESPN indisponible - Tentative récupération temps réel...');
    
    const realTimeData = await getRealTimeSportsData();
    
    // Afficher les avertissements
    if (realTimeData.warnings.length > 0) {
      realTimeData.warnings.forEach(w => console.log(w));
    }
    
    if (realTimeData.matches.length > 0) {
      // Convertir les matchs temps réel au format validé
      validatedMatches = realTimeData.matches
        .filter(m => isRealDataAvailable(m))
        .map((m: RealTimeMatch) => ({
          id: m.id,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          sport: m.sport === 'football' ? 'Foot' : 'Basket',
          league: m.league,
          date: m.date,
          gameDate: m.date,
          oddsHome: m.oddsHome || 2.0,
          oddsDraw: m.oddsDraw,
          oddsAway: m.oddsAway || 2.0,
          status: m.status,
          sources: [m.source],
          timeSlot: m.sport === 'basketball' ? 'night' as const : 'day' as const,
          isLive: m.status === 'live',
          insight: {
            riskPercentage: 50,
            valueBetDetected: false,
            valueBetType: null,
            confidence: m.dataQuality === 'real' ? 'high' : 'medium',
            crossValidation: {
              sourcesCount: 1,
              oddsConsensus: m.oddsHome !== null,
              dataQuality: m.dataQuality === 'real' ? 'high' : 'medium',
            },
          },
          dataQuality: {
            result: 'estimated' as DataQuality,
            goals: 'estimated' as DataQuality,
            cards: 'none' as DataQuality,
            corners: 'none' as DataQuality,
          },
        }));
      
      console.log(`✅ Temps réel: ${validatedMatches.length} matchs (${realTimeData.sources.join(', ')})`);
    } else {
      // AUCUNE DONNÉE DISPONIBLE - On ne génère PAS de données fictives
      console.log('❌ AUCUN match disponible - Aucune donnée fictive utilisée');
      console.log('💡 Suggestion: Vérifiez votre connexion ou réessayez plus tard');
      
      // Retourner un tableau vide avec avertissement
      return {
        matches: [],
        timing,
      };
    }
  }
  
  // ⚠️ FILTRER UNIQUEMENT LES MATCHS DU JOUR (en heure de Paris)
  const todayMatches = validatedMatches.filter(m => isToday(m.date, m.sport, m.gameDate));
  const filteredCount = validatedMatches.length - todayMatches.length;
  
  if (filteredCount > 0) {
    console.log(`🔍 ${filteredCount} matchs hors-date exclus`);
  }
  
  console.log(`📅 Matchs du jour: ${todayMatches.length}`);
  
  // Trier par qualité (ligues prioritaires + données multiples)
  const sortedMatches = sortMatchesByQuality(todayMatches);
  
  // Répartir selon le PLAN: 10 Foot + NBA Live
  let distributedMatches = distributeMatchesByTimeSlot(sortedMatches, timing);
  
  // ===== ENRICHISSEMENT AVEC BLESSURES ET STATS LIVE =====
  try {
    // 0. NOUVEAU: Enrichir avec les VRAIES blessures (Transfermarkt + NBA Official)
    const { calculateInjuryImpact: getInjuryImpact, scrapeFootballInjuries, scrapeNBAInjuries } = await import('./injuryScraper');
    
    // 0.1 Football (Transfermarkt)
    const footballMatches = distributedMatches.filter(m => m.sport === 'Foot');
    if (footballMatches.length > 0) {
      console.log('🏥 Enrichissement Football avec blessures (Transfermarkt)...');
      
      // Scraper les blessures une seule fois
      const footballInjuries = await scrapeFootballInjuries();
      
      for (const match of footballMatches.slice(0, 8)) {
        try {
          const impact = await getInjuryImpact(match.homeTeam, match.awayTeam, 'Foot');
          
          if (impact.homeOut.length > 0 || impact.awayOut.length > 0) {
            const idx = distributedMatches.findIndex(m => m.id === match.id);
            if (idx >= 0) {
              const riskAdjustment = impact.impactLevel === 'high' ? 15 : impact.impactLevel === 'medium' ? 10 : 5;
              
              distributedMatches[idx] = {
                ...distributedMatches[idx],
                insight: {
                  ...distributedMatches[idx].insight,
                  riskPercentage: Math.min(80, distributedMatches[idx].insight.riskPercentage + riskAdjustment)
                },
                injuryImpact: {
                  homeInjuries: impact.homeInjuries,
                  awayInjuries: impact.awayInjuries,
                  impactLevel: impact.impactLevel,
                  affectedPlayers: [...impact.homeOut, ...impact.awayOut]
                },
                injuryReasoning: impact.homeOut.length > 0 ? 
                  [`Blessés ${match.homeTeam}: ${impact.homeOut.join(', ')}`] : [],
                injuryRecommendation: impact.impactLevel === 'high' ? 
                  `⚠️ Impact élevé: ${impact.homeOut.length + impact.awayOut.length} joueurs clés absents` : 
                  impact.impactLevel === 'medium' ? 
                  `⚠️ Impact modéré: certains absents à considérer` : undefined,
              };
            }
          }
        } catch (e) {
          console.log(`⚠️ Erreur blessures pour ${match.homeTeam}`);
        }
      }
      console.log('✅ Blessures Football (Transfermarkt) enrichies');
    }
    
    // 0.2 NBA (NBA Official Injury Report)
    const nbaMatches = distributedMatches.filter(m => m.sport === 'Basket');
    if (nbaMatches.length > 0) {
      console.log('🏥 Enrichissement NBA avec blessures (NBA Official)...');
      
      // Scraper les blessures NBA une seule fois
      const nbaInjuries = await scrapeNBAInjuries();
      
      for (const match of nbaMatches) {
        try {
          const impact = await getInjuryImpact(match.homeTeam, match.awayTeam, 'Basket');
          
          if (impact.homeOut.length > 0 || impact.awayOut.length > 0) {
            const idx = distributedMatches.findIndex(m => m.id === match.id);
            if (idx >= 0) {
              const riskAdjustment = impact.impactLevel === 'high' ? 15 : impact.impactLevel === 'medium' ? 10 : 5;
              
              distributedMatches[idx] = {
                ...distributedMatches[idx],
                insight: {
                  ...distributedMatches[idx].insight,
                  riskPercentage: Math.min(80, distributedMatches[idx].insight.riskPercentage + riskAdjustment)
                },
                injuryImpact: {
                  homeInjuries: impact.homeInjuries,
                  awayInjuries: impact.awayInjuries,
                  impactLevel: impact.impactLevel,
                  affectedPlayers: [...impact.homeOut, ...impact.awayOut]
                },
                injuryReasoning: [
                  ...(impact.homeOut.length > 0 ? [`${match.homeTeam}: ${impact.homeOut.join(', ')}`] : []),
                  ...(impact.awayOut.length > 0 ? [`${match.awayTeam}: ${impact.awayOut.join(', ')}`] : []),
                ],
                injuryRecommendation: impact.impactLevel === 'high' ? 
                  `⚠️ Impact élevé: ${impact.homeOut.length + impact.awayOut.length} joueurs out` : undefined,
              };
            }
          }
        } catch (e) {
          console.log(`⚠️ Erreur blessures pour ${match.homeTeam}`);
        }
      }
      console.log('✅ Blessures NBA (Official) enrichies');
    }
    
    // 1. Enrichir les matchs Football avec les blessures (TheSportsDB - FALLBACK)
    const footballMatchesForTheSportsDB = distributedMatches.filter(m => m.sport === 'Foot' && !m.injuryImpact);
    if (footballMatchesForTheSportsDB.length > 0) {
      console.log('🏥 Enrichissement Football avec blessures (TheSportsDB)...');
      const { getFootballMatchInjuries, FOOTBALL_KEY_PLAYERS } = await import('./theSportsDBService');
      
      for (let i = 0; i < Math.min(footballMatchesForTheSportsDB.length, 5); i++) {
        const match = footballMatchesForTheSportsDB[i];
        try {
          const injuryData = await getFootballMatchInjuries(match.homeTeam, match.awayTeam);
          
          // Calculer l'impact
          const homeKeyPlayers = FOOTBALL_KEY_PLAYERS[match.homeTeam] || [];
          const awayKeyPlayers = FOOTBALL_KEY_PLAYERS[match.awayTeam] || [];
          
          const homeKeyInjuries = injuryData.homeTeam.injuries.filter((inj: any) =>
            homeKeyPlayers.some(kp => 
              inj.player.toLowerCase().includes(kp.toLowerCase()) ||
              kp.toLowerCase().includes(inj.player.toLowerCase())
            )
          );
          const awayKeyInjuries = injuryData.awayTeam.injuries.filter((inj: any) =>
            awayKeyPlayers.some(kp =>
              inj.player.toLowerCase().includes(kp.toLowerCase()) ||
              kp.toLowerCase().includes(inj.player.toLowerCase())
            )
          );
          
          const totalKeyInjuries = homeKeyInjuries.length + awayKeyInjuries.length;
          
          let impactLevel: 'none' | 'low' | 'medium' | 'high' = 'none';
          let riskAdjustment = 0;
          
          if (totalKeyInjuries >= 3) {
            impactLevel = 'high';
            riskAdjustment = 15;
          } else if (totalKeyInjuries >= 2 || injuryData.totalInjuries >= 4) {
            impactLevel = 'medium';
            riskAdjustment = 10;
          } else if (injuryData.totalInjuries >= 1) {
            impactLevel = 'low';
            riskAdjustment = 5;
          }
          
          // Mettre à jour le match
          const idx = distributedMatches.findIndex(m => m.id === match.id);
          if (idx >= 0) {
            distributedMatches[idx] = {
              ...distributedMatches[idx],
              insight: {
                ...distributedMatches[idx].insight,
                riskPercentage: Math.min(80, distributedMatches[idx].insight.riskPercentage + riskAdjustment)
              },
              injuryImpact: {
                homeInjuries: injuryData.homeTeam.injuries.length,
                awayInjuries: injuryData.awayTeam.injuries.length,
                impactLevel: impactLevel === 'none' ? 'low' : impactLevel,
                affectedPlayers: [...homeKeyInjuries, ...awayKeyInjuries].map(inj => inj.player)
              },
              injuryReasoning: injuryData.summary ? [injuryData.summary] : [],
              injuryRecommendation: injuryData.summary,
              injuries: {
                homeTeam: injuryData.homeTeam.injuries,
                awayTeam: injuryData.awayTeam.injuries
              }
            };
          }
        } catch (e) {
          console.log(`⚠️ Erreur blessures pour ${match.homeTeam} vs ${match.awayTeam}`);
        }
      }
      console.log('✅ Blessures Football enrichies');
    }
    
    // 1.5 Enrichir les matchs Football avec les VRAIES stats d'équipe
    const footballMatchesForStats = distributedMatches.filter(m => m.sport === 'Foot');
    if (footballMatchesForStats.length > 0) {
      console.log('📊 Enrichissement Football avec stats avancées (FBref + TheSportsDB)...');
      
      // NOUVEAU: Essayer FBref d'abord (xG, Form Guide, H2H)
      try {
        const { getAdvancedMatchStats: getFBrefStats } = await import('./fbrefScraper');
        
        for (let i = 0; i < Math.min(footballMatchesForStats.length, 5); i++) {
          const match = footballMatchesForStats[i];
          
          try {
            const fbrefStats = await getFBrefStats(match.homeTeam, match.awayTeam);
            
            if (fbrefStats.homeForm || fbrefStats.awayForm || fbrefStats.h2h) {
              const idx = distributedMatches.findIndex(m => m.id === match.id);
              if (idx >= 0) {
                // Utiliser les données FBref pour enrichir les prédictions
                let formAdjustment = 0;
                
                if (fbrefStats.homeForm && fbrefStats.awayForm) {
                  formAdjustment = (fbrefStats.homeForm.formPoints - fbrefStats.awayForm.formPoints) * 2;
                }
                
                // xG Advantage
                let xgAdjustment = 0;
                if (fbrefStats.homeXG && fbrefStats.awayXG) {
                  xgAdjustment = (fbrefStats.homeXG.xGDPer90 - fbrefStats.awayXG.xGDPer90) * 10;
                }
                
                // H2H Impact
                let h2hAdjustment = 0;
                if (fbrefStats.h2h && fbrefStats.h2h.totalMatches > 0) {
                  const homeWinRate = fbrefStats.h2h.team1Wins / fbrefStats.h2h.totalMatches;
                  if (homeWinRate > 0.55) h2hAdjustment = 5;
                  else if (homeWinRate < 0.45) h2hAdjustment = -5;
                }
                
                distributedMatches[idx] = {
                  ...distributedMatches[idx],
                  insight: {
                    ...distributedMatches[idx].insight,
                    riskPercentage: Math.max(15, Math.min(80, 
                      distributedMatches[idx].insight.riskPercentage - formAdjustment - xgAdjustment - h2hAdjustment
                    )),
                  },
                  teamStats: {
                    ...distributedMatches[idx].teamStats,
                    fbref: {
                      homeForm: fbrefStats.homeForm?.form,
                      awayForm: fbrefStats.awayForm?.form,
                      xGDifference: fbrefStats.homeXG?.xGDPer90,
                      disciplineRisk: fbrefStats.analysis.disciplineRisk,
                      h2hTrend: fbrefStats.analysis.h2hTrend,
                    },
                  },
                };
                
                console.log(`  📈 FBref: ${match.homeTeam} (${fbrefStats.homeForm?.form || 'N/A'}) vs ${match.awayTeam} (${fbrefStats.awayForm?.form || 'N/A'})`);
              }
            }
          } catch (e) {
            console.log(`  ⚠️ FBref non disponible pour ${match.homeTeam} vs ${match.awayTeam}`);
          }
        }
      } catch (e) {
        console.log('⚠️ Service FBref non disponible, fallback TheSportsDB');
      }
      
      // Fallback: TheSportsDB si FBref n'a pas fonctionné
      try {
        const { getMatchTeamStats } = await import('./teamStatsService');
        
        for (let i = 0; i < Math.min(footballMatchesForStats.length, 8); i++) {
          const match = footballMatchesForStats[i];
          
          try {
            const teamStats = await getMatchTeamStats(match.homeTeam, match.awayTeam);
            
            if (teamStats.homeTeam && teamStats.awayTeam) {
              const homeStats = teamStats.homeTeam;
              const awayStats = teamStats.awayTeam;
              
              // Recalculer les prédictions basées sur les VRAIES stats
              const homeFormPoints = homeStats.formAnalysis.formPoints;
              const awayFormPoints = awayStats.formAnalysis.formPoints;
              
              // Avantage basé sur la forme
              const formAdvantage = homeFormPoints - awayFormPoints;
              
              // Avantage basé sur le classement
              const rankAdvantage = awayStats.rank - homeStats.rank; // Négatif si home mieux classé
              
              // Calcul des probabilités basées sur les stats réelles
              let homeWinProb = 40 + (formAdvantage * 2) + (rankAdvantage * 1.5);
              let awayWinProb = 40 - (formAdvantage * 2) - (rankAdvantage * 1.5);
              let drawProb = 25;
              
              // Ajustement selon le total de buts
              const avgHomeGoals = (homeStats.goalsFor / homeStats.played);
              const avgAwayGoals = (awayStats.goalsFor / awayStats.played);
              const avgHomeConceded = (homeStats.goalsAgainst / homeStats.played);
              const avgAwayConceded = (awayStats.goalsAgainst / awayStats.played);
              
              const expectedTotal = (avgHomeGoals + avgAwayConceded + avgAwayGoals + avgHomeConceded) / 4;
              
              // Normaliser les probabilités
              const total = homeWinProb + awayWinProb + drawProb;
              homeWinProb = Math.round(homeWinProb * 100 / total);
              awayWinProb = Math.round(awayWinProb * 100 / total);
              drawProb = 100 - homeWinProb - awayWinProb;
              
              // Calcul Over/Under basé sur les vraies stats
              const over25Prob = expectedTotal > 2.5 ? Math.min(65, 45 + expectedTotal * 8) : Math.max(35, 45 + expectedTotal * 8);
              
              // BTTS basé sur les stats offensives/défensives
              const homeScoresOften = avgHomeGoals > 1.5;
              const awayScoresOften = avgAwayGoals > 1.5;
              const homeConcedesOften = avgHomeConceded > 1.2;
              const awayConcedesOften = avgAwayConceded > 1.2;
              const bttsProb = ((homeScoresOften ? 25 : 10) + (awayScoresOften ? 25 : 10) + 
                               (homeConcedesOften ? 20 : 10) + (awayConcedesOften ? 20 : 10));
              
              // Indice de confiance basé sur les données disponibles
              const confidenceBonus = 15; // Bonus car données réelles
              const newRisk = Math.max(15, Math.min(70, match.insight.riskPercentage - confidenceBonus));
              
              // Déterminer la recommandation
              let recommendation = '';
              if (homeWinProb > 55) {
                recommendation = `Victoire ${homeStats.teamName}`;
              } else if (awayWinProb > 55) {
                recommendation = `Victoire ${awayStats.teamName}`;
              } else if (over25Prob > 58) {
                recommendation = 'Over 2.5 buts';
              } else if (bttsProb > 60) {
                recommendation = 'Les deux marquent';
              } else if (drawProb > 30) {
                recommendation = 'Match serré - Nul possible';
              } else {
                recommendation = 'Over 1.5 buts';
              }
              
              // Mettre à jour le match
              const idx = distributedMatches.findIndex(m => m.id === match.id);
              if (idx >= 0) {
                distributedMatches[idx] = {
                  ...distributedMatches[idx],
                  sources: [...(distributedMatches[idx].sources || []), 'TheSportsDB Stats'],
                  insight: {
                    ...distributedMatches[idx].insight,
                    riskPercentage: newRisk,
                    confidence: teamStats.comparison.confidence > 70 ? 'high' : 
                               teamStats.comparison.confidence > 50 ? 'medium' : 'low',
                    crossValidation: {
                      sourcesCount: (distributedMatches[idx].insight.crossValidation?.sourcesCount || 1) + 1,
                      oddsConsensus: true,
                      dataQuality: 'high'
                    }
                  },
                  dataQuality: {
                    result: 'real',
                    goals: 'real',
                    cards: 'none',
                    corners: 'none'
                  },
                  teamStats: {
                    home: {
                      form: homeStats.form,
                      avgGoalsScored: avgHomeGoals,
                      avgGoalsConceded: avgHomeConceded,
                      winRate: (homeStats.won / homeStats.played) * 100,
                      dataAvailable: true
                    },
                    away: {
                      form: awayStats.form,
                      avgGoalsScored: avgAwayGoals,
                      avgGoalsConceded: avgAwayConceded,
                      winRate: (awayStats.won / awayStats.played) * 100,
                      dataAvailable: true
                    }
                  },
                  goalsPrediction: {
                    total: Math.round(expectedTotal * 10) / 10,
                    over25: Math.round(over25Prob),
                    under25: Math.round(100 - over25Prob),
                    over15: Math.round(Math.min(85, over25Prob + 20)),
                    bothTeamsScore: Math.round(Math.min(80, bttsProb)),
                    prediction: recommendation,
                    basedOn: 'real'
                  }
                };
                
                console.log(`⚽ ${match.homeTeam} vs ${match.awayTeam}: Forme ${homeStats.form} vs ${awayStats.form} → ${recommendation}`);
              }
            }
          } catch (e) {
            console.log(`⚠️ Erreur stats pour ${match.homeTeam} vs ${match.awayTeam}`);
          }
        }
        console.log('✅ Stats équipe Football enrichies');
      } catch (error) {
        console.log('⚠️ Erreur chargement teamStatsService:', error);
      }
    }
    
    // 2. Enrichir les matchs NBA avec stats live et blessures
    const nbaMatchesForEnrichment = distributedMatches.filter(m => m.sport === 'Basket');
    if (nbaMatchesForEnrichment.length > 0) {
      console.log('📊 Enrichissement NBA avec stats live et blessures...');
      
      // Charger les services
      const { fetchAllTeamStats, calculatePredictionFromStats } = await import('./nbaStatsService');
      const { getNBAMatchInjuries, NBA_KEY_PLAYERS } = await import('./nbaInjuryService');
      
      // Récupérer les stats live
      const liveStats = await fetchAllTeamStats();
      
      for (const match of nbaMatchesForEnrichment) {
        try {
          // Trouver les stats des équipes
          const homeStats = liveStats.find(t => 
            t.name.toLowerCase().includes(match.homeTeam.toLowerCase()) ||
            match.homeTeam.toLowerCase().includes(t.name.toLowerCase())
          );
          const awayStats = liveStats.find(t => 
            t.name.toLowerCase().includes(match.awayTeam.toLowerCase()) ||
            match.awayTeam.toLowerCase().includes(t.name.toLowerCase())
          );
          
          // Recalculer les prédictions si stats disponibles
          if (homeStats && awayStats) {
            const livePreds = calculatePredictionFromStats(homeStats, awayStats);
            
            // Récupérer les blessures
            const injuryData = await getNBAMatchInjuries(match.homeTeam, match.awayTeam);
            
            const homeKeyPlayers = NBA_KEY_PLAYERS[match.homeTeam] || [];
            const awayKeyPlayers = NBA_KEY_PLAYERS[match.awayTeam] || [];
            
            const homeKeyInjuries = injuryData.homeTeam.injuries.filter((inj: any) =>
              homeKeyPlayers.some(kp => 
                inj.player.toLowerCase().includes(kp.toLowerCase()) ||
                kp.toLowerCase().includes(inj.player.toLowerCase())
              )
            );
            const awayKeyInjuries = injuryData.awayTeam.injuries.filter((inj: any) =>
              awayKeyPlayers.some(kp =>
                inj.player.toLowerCase().includes(kp.toLowerCase()) ||
                kp.toLowerCase().includes(inj.player.toLowerCase())
              )
            );
            
            const totalKeyInjuries = homeKeyInjuries.length + awayKeyInjuries.length;
            
            let impactLevel: 'none' | 'low' | 'medium' | 'high' = 'none';
            let adjustedProb = livePreds.homeWinProb;
            let riskAdjustment = 0;
            
            if (totalKeyInjuries >= 3) {
              impactLevel = 'high';
              riskAdjustment = 15;
            } else if (totalKeyInjuries >= 2 || injuryData.totalInjuries >= 4) {
              impactLevel = 'medium';
              riskAdjustment = 10;
            } else if (injuryData.totalInjuries >= 1) {
              impactLevel = 'low';
              riskAdjustment = 5;
            }
            
            // Ajuster selon les blessures
            const probAdjustment = (awayKeyInjuries.length - homeKeyInjuries.length) * 3;
            adjustedProb = Math.max(30, Math.min(70, adjustedProb + probAdjustment));
            
            // Mettre à jour le match
            const idx = distributedMatches.findIndex(m => m.id === match.id);
            if (idx >= 0) {
              distributedMatches[idx] = {
                ...distributedMatches[idx],
                sources: [...(distributedMatches[idx].sources || []), 'Stats Live 2025-26'],
                insight: {
                  ...distributedMatches[idx].insight,
                  riskPercentage: Math.min(80, Math.max(15, 100 - Math.max(adjustedProb, 100 - adjustedProb) + riskAdjustment)),
                  confidence: livePreds.confidence,
                  crossValidation: {
                    sourcesCount: 2,
                    oddsConsensus: true,
                    dataQuality: 'high'
                  }
                },
                nbaPredictions: {
                  ...distributedMatches[idx].nbaPredictions!,
                  winnerProb: adjustedProb,
                  spread: {
                    line: livePreds.spread,
                    favorite: livePreds.spread > 0 ? match.awayTeam : match.homeTeam,
                    confidence: livePreds.homeWinProb
                  },
                  totalPoints: {
                    line: livePreds.totalPoints,
                    predicted: livePreds.totalPoints,
                    overProb: 50,
                    recommendation: 'Neutre'
                  },
                  confidence: livePreds.confidence
                },
                injuryImpact: {
                  homeInjuries: injuryData.homeTeam.injuries.length,
                  awayInjuries: injuryData.awayTeam.injuries.length,
                  impactLevel: impactLevel === 'none' ? 'low' : impactLevel,
                  affectedPlayers: [...homeKeyInjuries, ...awayKeyInjuries].map((inj: any) => inj.player)
                },
                injuryReasoning: injuryData.summary ? [injuryData.summary] : [],
                injuryRecommendation: injuryData.summary,
                injuries: {
                  homeTeam: injuryData.homeTeam.injuries,
                  awayTeam: injuryData.awayTeam.injuries
                }
              };
            }
            
            console.log(`📊 ${match.homeTeam} vs ${match.awayTeam}: ELO ${homeStats.elo} vs ${awayStats.elo} → ${adjustedProb}%`);
          }
        } catch (e) {
          console.log(`⚠️ Erreur enrichment NBA pour ${match.homeTeam}`);
        }
      }
      console.log('✅ Stats live et blessures NBA enrichies');
    }
  } catch (error) {
    console.log('⚠️ Erreur enrichissement:', error);
  }
  
  // Stats détaillées par sport
  const footballCount = distributedMatches.filter(m => m.sport === 'Foot').length;
  const nbaCount = distributedMatches.filter(m => m.sport === 'Basket').length;
  console.log(`✅ ${distributedMatches.length} matchs sélectionnés: ${footballCount} Football + ${nbaCount} NBA`);
  
  // Stats
  const safes = distributedMatches.filter(m => m.insight.riskPercentage <= 40).length;
  const valueBets = distributedMatches.filter(m => m.insight.valueBetDetected).length;
  
  return {
    matches: distributedMatches,
    timing
  };
}

/**
 * Export de la fonction getTimingInfo
 */
export { getTimingInfo };

/**
 * Récupère les statistiques des sources
 */
export async function getSourceStats(): Promise<SourceStats> {
  const [oddsApiMatches, footballDataMatches] = await Promise.all([
    fetchOddsApiMatches(),
    fetchFootballDataMatches(),
  ]);
  
  const validatedMatches = crossValidateMatches(oddsApiMatches, footballDataMatches);
  const todayMatches = validatedMatches.filter(m => isToday(m.date));
  
  return {
    oddsApi: { 
      count: oddsApiMatches.length, 
      status: oddsApiMatches.length > 0 ? 'online' : 'offline' 
    },
    footballData: { 
      count: footballDataMatches.length, 
      status: footballDataMatches.length > 0 ? 'online' : 'offline' 
    },
    totalMatches: validatedMatches.length,
    todayMatches: todayMatches.length,
    lastUpdate: new Date().toLocaleTimeString('fr-FR'),
  };
}

export type { CrossValidatedMatch, SourceStats };
