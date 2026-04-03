/**
 * Service d'intégration des cotes ESPN (DraftKings)
 * 
 * SOURCE PRIMAIRE: ESPN API (GRATUIT ET ILLIMITÉ)
 * - Cotes DraftKings officielles
 * - NBA, NHL, Football (toutes ligues européennes)
 * - Pas de quota, pas de limite
 * 
 * Ce service remplace The Odds API (quota limité)
 */

import { 
  fetchAllESPNOdds, 
  fetchESPNFootballOdds, 
  fetchESPNNBAOdds,
  fetchESPNNHLOdds,
  fetchESPNLiveOdds,
  getESPNStatus,
  getESPNOddsStats,
  ESPNOddMatch 
} from './espnOddsService';

// Types exportés pour compatibilité
export interface IntegratedMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: 'Foot' | 'Basket';
  league: string;
  date: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  status: 'upcoming' | 'live' | 'finished';
  isLive?: boolean;
  homeScore?: number;
  awayScore?: number;
  clock?: string;
  period?: number;
  sources: string[];
  hasRealOdds: boolean;
  bookmaker: string;
  reliabilityScore: number;
  // Prédictions
  insight: {
    riskPercentage: number;
    valueBetDetected: boolean;
    valueBetType: string | null;
    confidence: 'high' | 'medium' | 'low';
  };
}

// Cache pour les données converties
let cachedIntegratedMatches: IntegratedMatch[] = [];
let lastConvertTime = 0;
const CONVERT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Calcule les probabilités implicites depuis les cotes
 */
function calculateImpliedProbabilities(oddsHome: number, oddsDraw: number | null, oddsAway: number) {
  if (!oddsHome || !oddsAway || oddsHome <= 1 || oddsAway <= 1) {
    return { home: 33, draw: 34, away: 33 };
  }
  
  const homeProb = 1 / oddsHome;
  const awayProb = 1 / oddsAway;
  const drawProb = oddsDraw && oddsDraw > 1 ? 1 / oddsDraw : 0;
  
  const total = homeProb + awayProb + drawProb;
  
  return {
    home: Math.round((homeProb / total) * 100),
    draw: Math.round((drawProb / total) * 100),
    away: Math.round((awayProb / total) * 100),
  };
}

/**
 * Convertit un match ESPN en format intégré avec prédictions
 */
function convertESPNTToIntegrated(espnMatch: ESPNOddMatch): IntegratedMatch {
  const probs = calculateImpliedProbabilities(espnMatch.oddsHome, espnMatch.oddsDraw, espnMatch.oddsAway);
  
  // Déterminer le favori
  const favorite = espnMatch.oddsHome < espnMatch.oddsAway ? 'home' : 'away';
  const favoriteProb = Math.max(probs.home, probs.away);
  const favoriteOdds = favorite === 'home' ? espnMatch.oddsHome : espnMatch.oddsAway;
  
  // Calcul du risque basé sur la recommandation
  let recommendationSuccessProb = 50;
  
  if (favoriteOdds < 1.5 && favoriteProb >= 65) {
    recommendationSuccessProb = favoriteProb;
  } else if (favoriteOdds < 2.0 && favoriteProb >= 50) {
    recommendationSuccessProb = favorite === 'home' 
      ? probs.home + probs.draw 
      : probs.away + probs.draw;
  } else {
    recommendationSuccessProb = Math.max(probs.home, probs.away);
  }
  
  const riskPercentage = 100 - recommendationSuccessProb;
  
  // Détection value bet
  const margin = (1 / espnMatch.oddsHome) + (1 / espnMatch.oddsAway) + (espnMatch.oddsDraw ? 1 / espnMatch.oddsDraw : 0) - 1;
  const hasValueBet = margin > 0.03;
  
  let valueBetType: string | null = null;
  if (hasValueBet) {
    if (espnMatch.oddsDraw && espnMatch.oddsDraw > 3.0) {
      valueBetType = 'draw';
    } else if (espnMatch.oddsHome < espnMatch.oddsAway) {
      valueBetType = 'home';
    } else {
      valueBetType = 'away';
    }
  }
  
  // Confiance basée sur la fiabilité et le risque
  let confidence: 'high' | 'medium' | 'low';
  if (riskPercentage <= 35 && espnMatch.hasRealOdds) {
    confidence = 'high';
  } else if (riskPercentage <= 55) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  
  return {
    id: espnMatch.id,
    homeTeam: espnMatch.homeTeam,
    awayTeam: espnMatch.awayTeam,
    sport: espnMatch.sport === 'NBA' || espnMatch.sport === 'NHL' ? 'Basket' : 'Foot',
    league: espnMatch.league,
    date: espnMatch.date,
    oddsHome: espnMatch.oddsHome,
    oddsDraw: espnMatch.oddsDraw,
    oddsAway: espnMatch.oddsAway,
    status: espnMatch.status,
    isLive: espnMatch.isLive,
    homeScore: espnMatch.homeScore,
    awayScore: espnMatch.awayScore,
    clock: espnMatch.clock,
    period: espnMatch.period,
    sources: ['ESPN', 'DraftKings'],
    hasRealOdds: espnMatch.hasRealOdds,
    bookmaker: espnMatch.bookmaker,
    reliabilityScore: espnMatch.reliabilityScore,
    insight: {
      riskPercentage,
      valueBetDetected: hasValueBet,
      valueBetType,
      confidence,
    },
  };
}

/**
 * Vérifie si un match est aujourd'hui (heure de Paris)
 */
function isToday(dateString: string): boolean {
  if (!dateString) return false;
  
  const now = new Date();
  const todayParis = now.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  
  const matchDate = new Date(dateString);
  const matchDateParis = matchDate.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  
  return matchDateParis === todayParis;
}

/**
 * Fonction principale: Récupère tous les matchs avec cotes
 * Source: ESPN (DraftKings) - GRATUIT ET ILLIMITÉ
 */
export async function fetchAllMatchesWithOdds(): Promise<IntegratedMatch[]> {
  console.log('🔄 Récupération matchs + cotes (ESPN DraftKings)...');
  
  // Vérifier le cache de conversion
  const now = Date.now();
  if (cachedIntegratedMatches.length > 0 && (now - lastConvertTime) < CONVERT_CACHE_TTL) {
    console.log('📦 Utilisation du cache converti');
    return cachedIntegratedMatches;
  }
  
  try {
    // 1. Récupérer les matchs depuis ESPN
    const espnMatches = await fetchAllESPNOdds();
    console.log(`📡 ESPN: ${espnMatches.length} matchs récupérés`);
    
    if (espnMatches.length === 0) {
      console.log('⚠️ Aucun match ESPN disponible');
      return [];
    }
    
    // 2. Convertir avec prédictions
    const integratedMatches: IntegratedMatch[] = espnMatches.map(convertESPNTToIntegrated);
    
    // 3. Filtrer uniquement les matchs d'aujourd'hui (optionnel)
    // const todayMatches = integratedMatches.filter(m => isToday(m.date));
    // Pour l'instant, on garde tous les matchs à venir
    
    const upcomingMatches = integratedMatches.filter(m => m.status === 'upcoming' || m.isLive);
    
    // 4. Trier: live d'abord, puis par fiabilité, puis par heure
    upcomingMatches.sort((a, b) => {
      // Live en premier
      if (a.isLive && !b.isLive) return -1;
      if (!a.isLive && b.isLive) return 1;
      // Puis par fiabilité
      if (a.reliabilityScore !== b.reliabilityScore) {
        return b.reliabilityScore - a.reliabilityScore;
      }
      // Puis par date
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
    
    // Mettre à jour le cache
    cachedIntegratedMatches = upcomingMatches;
    lastConvertTime = now;
    
    // Stats
    const liveCount = upcomingMatches.filter(m => m.isLive).length;
    const footCount = upcomingMatches.filter(m => m.sport === 'Foot').length;
    const basketCount = upcomingMatches.filter(m => m.sport === 'Basket').length;
    const realOddsCount = upcomingMatches.filter(m => m.hasRealOdds).length;
    
    console.log(`✅ ${upcomingMatches.length} matchs: ${footCount} Foot + ${basketCount} Basket (${liveCount} en direct, ${realOddsCount} avec cotes réelles)`);
    
    return upcomingMatches;
    
  } catch (error) {
    console.error('❌ Erreur fetchAllMatchesWithOdds:', error);
    return cachedIntegratedMatches; // Retourner le cache en cas d'erreur
  }
}

/**
 * Récupère uniquement les matchs de football
 */
export async function fetchFootballMatches(): Promise<IntegratedMatch[]> {
  const all = await fetchAllMatchesWithOdds();
  return all.filter(m => m.sport === 'Foot');
}

/**
 * Récupère uniquement les matchs NBA
 */
export async function fetchNBAMatches(): Promise<IntegratedMatch[]> {
  const all = await fetchAllMatchesWithOdds();
  return all.filter(m => m.sport === 'Basket');
}

/**
 * Récupère les matchs en direct
 */
export async function fetchLiveMatches(): Promise<IntegratedMatch[]> {
  const all = await fetchAllMatchesWithOdds();
  return all.filter(m => m.isLive);
}

/**
 * Force le rafraîchissement du cache
 */
export async function forceRefreshMatches(): Promise<IntegratedMatch[]> {
  cachedIntegratedMatches = [];
  lastConvertTime = 0;
  return fetchAllMatchesWithOdds();
}

/**
 * Retourne les infos de cache
 */
export function getCacheInfo() {
  return {
    hasCache: cachedIntegratedMatches.length > 0,
    cacheAge: Date.now() - lastConvertTime,
    cacheTTL: CONVERT_CACHE_TTL,
    matchesCount: cachedIntegratedMatches.length,
    espnStats: getESPNOddsStats(),
  };
}

/**
 * Retourne le statut ESPN
 */
export function getOddsStatus() {
  return getESPNStatus();
}

// Export par défaut
const oddsService = {
  fetchAllMatchesWithOdds,
  fetchFootballMatches,
  fetchNBAMatches,
  fetchLiveMatches,
  forceRefreshMatches,
  getCacheInfo,
  getOddsStatus,
};

export default oddsService;
