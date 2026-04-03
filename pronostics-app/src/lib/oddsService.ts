/**
 * Service d'intégration ESPN + BetExplorer
 * 
 * SOURCE PRIMAIRE: 
 * - ESPN API (gratuit) pour les matchs réels
 * - BetExplorer (VRAIES COTES par scraping) pour les cotes NBA + Football
 * - Fallback: Estimation basée sur force des équipes
 * 
 * Ce service remplace The Odds API (quota épuisé)
 */

import { fetchAllESPNMatches, ESPNMatch } from './espnService';
import { fetchBetExplorerOdds, getMatchOdds, BetExplorerMatch } from './betExplorerService';
import { scrapeTodayOdds, findMatchOdds, RealOdds } from './betExplorerScraper';

// Types exportés
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
  // Prédictions
  insight: {
    riskPercentage: number;
    valueBetDetected: boolean;
    valueBetType: string | null;
    confidence: 'high' | 'medium' | 'low';
  };
}

// Cache pour les données
let cachedMatches: IntegratedMatch[] = [];
let lastFetchTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Cache pour les cotes scrapées
let scrapedOddsCache: RealOdds[] = [];
let lastScrapeTime = 0;

/**
 * Convertit le format ESPN en format intégré avec cotes
 * PRIORITÉ: Vraies cotes BetExplorer > Estimation
 */
async function convertESPNToIntegrated(espnMatch: ESPNMatch): Promise<IntegratedMatch> {
  // 1. Essayer de récupérer les VRAIES cotes depuis BetExplorer Scraper
  let odds: { oddsHome: number; oddsDraw: number | null; oddsAway: number } | null = null;
  const sport: 'Foot' | 'Basket' = espnMatch.sport === 'Basket' ? 'Basket' : 'Foot';
  
  try {
    // Chercher dans le cache des cotes scrapées
    const realOdds = await findMatchOdds(espnMatch.homeTeam, espnMatch.awayTeam, sport);
    if (realOdds) {
      odds = {
        oddsHome: realOdds.oddsHome,
        oddsDraw: realOdds.oddsDraw,
        oddsAway: realOdds.oddsAway,
      };
      console.log(`📊 Vraies cotes pour ${espnMatch.homeTeam} vs ${espnMatch.awayTeam}: ${odds.oddsHome}/${odds.oddsDraw || '-'}/${odds.oddsAway}`);
    }
  } catch (e) {
    console.log(`⚠️ Pas de cotes réelles pour ${espnMatch.homeTeam} vs ${espnMatch.awayTeam}`);
  }
  
  // 2. Fallback: Estimation basée sur la force des équipes
  if (!odds) {
    const fallbackOdds = await getMatchOdds(espnMatch.homeTeam, espnMatch.awayTeam, espnMatch.league);
    if (fallbackOdds) {
      odds = fallbackOdds;
    }
  }
  
  // Calculer les probabilités implicites
  const oddsHome = odds?.oddsHome || 2.0;
  const oddsDraw = odds?.oddsDraw ?? null;
  const oddsAway = odds?.oddsAway || 2.0;
  
  const totalImplied = (1/oddsHome) + (1/oddsAway) + (oddsDraw ? 1/oddsDraw : 0);
  const homeWinProb = Math.round((1/oddsHome) / totalImplied * 100);
  const awayWinProb = Math.round((1/oddsAway) / totalImplied * 100);
  const drawProb = oddsDraw ? Math.round((1/oddsDraw) / totalImplied * 100) : 0;
  
  // Déterminer le favori
  const favorite = oddsHome < oddsAway ? 'home' : 'away';
  const favoriteProb = favorite === 'home' ? homeWinProb : awayWinProb;
  const favoriteOdds = favorite === 'home' ? oddsHome : oddsAway;
  
  // Calcul du risque basé sur la recommandation
  let recommendationSuccessProb = 50;
  
  if (favoriteOdds < 1.5 && favoriteProb >= 65) {
    recommendationSuccessProb = favoriteProb;
  } else if (favoriteOdds < 2.0 && favoriteProb >= 50) {
    recommendationSuccessProb = favorite === 'home' 
      ? homeWinProb + drawProb 
      : awayWinProb + drawProb;
  } else {
    recommendationSuccessProb = Math.max(homeWinProb, awayWinProb);
  }
  
  const riskPercentage = 100 - recommendationSuccessProb;
  
  // Détection value bet
  const margin = totalImplied - 1;
  const hasValueBet = margin > 0.03;
  
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
  
  // Confiance
  let confidence: 'high' | 'medium' | 'low';
  if (riskPercentage <= 35) {
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
    sport: espnMatch.sport === 'Basket' ? 'Basket' : 'Foot',
    league: espnMatch.league,
    date: espnMatch.date,
    oddsHome,
    oddsDraw,
    oddsAway,
    status: espnMatch.status,
    isLive: espnMatch.isLive,
    homeScore: espnMatch.homeScore,
    awayScore: espnMatch.awayScore,
    clock: espnMatch.clock,
    period: espnMatch.period,
    sources: ['ESPN', 'BetExplorer'],
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
 * Combine ESPN (matchs) + BetExplorer (cotes)
 */
export async function fetchAllMatchesWithOdds(): Promise<IntegratedMatch[]> {
  console.log('🔄 Récupération matchs + cotes (ESPN + BetExplorer)...');
  
  // Vérifier le cache
  const now = Date.now();
  if (cachedMatches.length > 0 && (now - lastFetchTime) < CACHE_TTL) {
    console.log('📦 Utilisation du cache');
    return cachedMatches;
  }
  
  try {
    // 1. Récupérer les matchs depuis ESPN
    const espnMatches = await fetchAllESPNMatches();
    console.log(`📡 ESPN: ${espnMatches.length} matchs récupérés`);
    
    if (espnMatches.length === 0) {
      console.log('⚠️ Aucun match ESPN disponible');
      return [];
    }
    
    // 2. Convertir avec cotes BetExplorer
    const integratedMatches: IntegratedMatch[] = [];
    
    for (const espnMatch of espnMatches) {
      try {
        const integrated = await convertESPNToIntegrated(espnMatch);
        integratedMatches.push(integrated);
      } catch (e) {
        console.log(`⚠️ Erreur conversion ${espnMatch.homeTeam} vs ${espnMatch.awayTeam}`);
      }
    }
    
    // 3. Filtrer uniquement les matchs d'aujourd'hui
    const todayMatches = integratedMatches.filter(m => isToday(m.date));
    console.log(`📅 Matchs du jour: ${todayMatches.length}`);
    
    // 4. Trier: live d'abord, puis par heure
    todayMatches.sort((a, b) => {
      // Live en premier
      if (a.isLive && !b.isLive) return -1;
      if (!a.isLive && b.isLive) return 1;
      // Puis par date
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
    
    // Mettre à jour le cache
    cachedMatches = todayMatches;
    lastFetchTime = now;
    
    // Stats
    const liveCount = todayMatches.filter(m => m.isLive).length;
    const footCount = todayMatches.filter(m => m.sport === 'Foot').length;
    const basketCount = todayMatches.filter(m => m.sport === 'Basket').length;
    
    console.log(`✅ ${todayMatches.length} matchs: ${footCount} Foot + ${basketCount} Basket (${liveCount} en direct)`);
    
    return todayMatches;
    
  } catch (error) {
    console.error('❌ Erreur fetchAllMatchesWithOdds:', error);
    return cachedMatches; // Retourner le cache en cas d'erreur
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
  cachedMatches = [];
  lastFetchTime = 0;
  return fetchAllMatchesWithOdds();
}

/**
 * Retourne les infos de cache
 */
export function getCacheInfo() {
  return {
    hasCache: cachedMatches.length > 0,
    cacheAge: Date.now() - lastFetchTime,
    cacheTTL: CACHE_TTL,
    matchesCount: cachedMatches.length,
  };
}

// Export par défaut
const oddsService = {
  fetchAllMatchesWithOdds,
  fetchFootballMatches,
  fetchNBAMatches,
  fetchLiveMatches,
  forceRefreshMatches,
  getCacheInfo,
};

export default oddsService;
