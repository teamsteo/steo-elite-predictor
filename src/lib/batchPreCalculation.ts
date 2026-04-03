/**
 * Batch Pre-Calculation Service - Pré-calcul des Stats
 * 
 * FONCTIONS:
 * - Pré-calculer les stats FBref pour les équipes populaires
 * - Pré-calculer les stats NBA pour toutes les équipes
 * - Stocker en cache persistant (/data/cache/)
 * - API endpoint pour déclenchement manuel ou cron
 * 
 * AVANTAGES:
 * - Évite le rate limiting de FBref (4s entre requêtes)
 * - Réduit le temps de réponse pour l'utilisateur
 * - Peut être exécuté en cron job (ex: 6h UTC chaque jour)
 */

import * as fs from 'fs';
import * as path from 'path';
import { scrapeFormGuide, scrapeTeamXG, scrapeDisciplineStats, FormGuide, TeamXGStats, DisciplineStats } from './fbrefScraper';
import { scrapeAllTeamStats, NBATeamStats } from './basketballReferenceScraper';

// ============================================
// TYPES
// ============================================

interface CachedTeamStats {
  team: string;
  form: FormGuide | null;
  xg: TeamXGStats | null;
  discipline: DisciplineStats | null;
  cachedAt: string;
  expiresAt: string;
}

interface CachedNBAStats {
  teams: NBATeamStats[];
  cachedAt: string;
  expiresAt: string;
}

interface BatchCacheData {
  football: {
    [league: string]: {
      [team: string]: CachedTeamStats;
    };
  };
  nba: CachedNBAStats | null;
  lastUpdate: string;
  nextScheduledUpdate: string;
}

// ============================================
// CONFIGURATION
// ============================================

const DATA_DIR = path.join(process.cwd(), 'data');
const CACHE_DIR = path.join(DATA_DIR, 'cache');
const BATCH_CACHE_FILE = path.join(CACHE_DIR, 'batch_stats.json');

const CACHE_DURATION_HOURS = 6; // Cache valide 6 heures
const UPDATE_INTERVAL_HOURS = 6; // Mise à jour toutes les 6 heures

// Équipes populaires par ligue (pré-calculées) - TOUTES LES LIGUES
const POPULAR_TEAMS: Record<string, string[]> = {
  // Top 5 Européennes
  'Premier League': [
    'Manchester City', 'Arsenal', 'Liverpool', 'Manchester United',
    'Chelsea', 'Tottenham', 'Newcastle', 'Brighton',
    'Aston Villa', 'West Ham', 'Crystal Palace'
  ],
  'Ligue 1': [
    'Paris Saint-Germain', 'Monaco', 'Marseille', 'Lyon',
    'Lille', 'Nice', 'Lens', 'Rennes', 'Strasbourg'
  ],
  'La Liga': [
    'Real Madrid', 'Barcelona', 'Atletico Madrid', 'Sevilla',
    'Real Sociedad', 'Villarreal', 'Real Betis', 'Athletic Bilbao'
  ],
  'Bundesliga': [
    'Bayern Munich', 'Dortmund', 'RB Leipzig', 'Leverkusen',
    'Frankfurt', 'Wolfsburg', 'Freiburg'
  ],
  'Serie A': [
    'Juventus', 'Inter', 'AC Milan', 'Napoli',
    'Roma', 'Lazio', 'Atalanta', 'Fiorentina'
  ],
  // Ligues supplémentaires
  'Liga Portugal': [
    'Benfica', 'Porto', 'Sporting CP', 'Braga',
    'Vitoria Guimaraes', 'Famalicao'
  ],
  'Eredivisie': [
    'Ajax', 'PSV Eindhoven', 'Feyenoord', 'AZ Alkmaar',
    'FC Twente', 'FC Utrecht'
  ],
  'Belgian Pro League': [
    'Club Brugge', 'Anderlecht', 'Genk', 'Antwerp', 'Gent'
  ],
  'Austrian Bundesliga': [
    'Red Bull Salzburg', 'Sturm Graz', 'Rapid Vienna', 'Austria Vienna'
  ],
  'Scottish Premiership': [
    'Celtic', 'Rangers', 'Aberdeen', 'Hearts'
  ],
};

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function loadBatchCache(): BatchCacheData {
  ensureCacheDir();
  
  if (!fs.existsSync(BATCH_CACHE_FILE)) {
    return {
      football: {},
      nba: null,
      lastUpdate: '',
      nextScheduledUpdate: '',
    };
  }
  
  try {
    const data = fs.readFileSync(BATCH_CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      football: {},
      nba: null,
      lastUpdate: '',
      nextScheduledUpdate: '',
    };
  }
}

function saveBatchCache(cache: BatchCacheData): void {
  ensureCacheDir();
  fs.writeFileSync(BATCH_CACHE_FILE, JSON.stringify(cache, null, 2));
}

function isCacheValid(cachedAt: string): boolean {
  const cacheTime = new Date(cachedAt).getTime();
  const now = Date.now();
  const hoursSinceCache = (now - cacheTime) / (1000 * 60 * 60);
  return hoursSinceCache < CACHE_DURATION_HOURS;
}

// ============================================
// FONCTIONS DE PRÉ-CALCUL
// ============================================

/**
 * Pré-calcule les stats FBref pour toutes les équipes populaires
 */
export async function precalculateFootballStats(): Promise<{
  success: boolean;
  teamsProcessed: number;
  errors: string[];
  duration: number;
}> {
  const startTime = Date.now();
  console.log('🔄 Pré-calcul des stats Football (FBref)...');
  
  const errors: string[] = [];
  let teamsProcessed = 0;
  
  const cache = loadBatchCache();
  cache.football = cache.football || {};
  
  for (const [league, teams] of Object.entries(POPULAR_TEAMS)) {
    console.log(`\n📋 Traitement ${league} (${teams.length} équipes)...`);
    cache.football[league] = cache.football[league] || {};
    
    for (const team of teams) {
      try {
        console.log(`  🔄 ${team}...`);
        
        // Vérifier si le cache est encore valide
        const existing = cache.football[league][team];
        if (existing && isCacheValid(existing.cachedAt)) {
          console.log(`  ✅ ${team} déjà en cache`);
          teamsProcessed++;
          continue;
        }
        
        // Scrape les stats
        const [formResult, xgResult, disciplineResult] = await Promise.all([
          scrapeFormGuide(team),
          scrapeTeamXG(team),
          scrapeDisciplineStats(team),
        ]);
        
        // Extraire les données (les scrapers retournent maintenant ScraperResult<T>)
        const form = formResult.data;
        const xg = xgResult.data;
        const discipline = disciplineResult.data;
        
        // Stocker en cache
        const now = new Date();
        const expires = new Date(now.getTime() + CACHE_DURATION_HOURS * 60 * 60 * 1000);
        
        cache.football[league][team] = {
          team,
          form,
          xg,
          discipline,
          cachedAt: now.toISOString(),
          expiresAt: expires.toISOString(),
        };
        
        teamsProcessed++;
        console.log(`  ✅ ${team} mis en cache`);
        
        // Délai pour respecter rate limiting
        await new Promise(resolve => setTimeout(resolve, 4000));
        
      } catch (error) {
        const errorMsg = `${team}: ${error instanceof Error ? error.message : 'Erreur inconnue'}`;
        errors.push(errorMsg);
        console.log(`  ❌ ${errorMsg}`);
      }
    }
    
    // Sauvegarder après chaque ligue
    saveBatchCache(cache);
  }
  
  const duration = Date.now() - startTime;
  cache.lastUpdate = new Date().toISOString();
  cache.nextScheduledUpdate = new Date(Date.now() + UPDATE_INTERVAL_HOURS * 60 * 60 * 1000).toISOString();
  saveBatchCache(cache);
  
  console.log(`\n✅ Pré-calcul terminé: ${teamsProcessed} équipes en ${Math.round(duration / 1000)}s`);
  if (errors.length > 0) {
    console.log(`⚠️ ${errors.length} erreurs`);
  }
  
  return {
    success: true,
    teamsProcessed,
    errors,
    duration,
  };
}

/**
 * Pré-calcule les stats NBA pour toutes les équipes
 */
export async function precalculateNBAStats(): Promise<{
  success: boolean;
  teamsProcessed: number;
  errors: string[];
  duration: number;
}> {
  const startTime = Date.now();
  console.log('🏀 Pré-calcul des stats NBA...');
  
  const errors: string[] = [];
  
  const cache = loadBatchCache();
  
  try {
    const teams = await scrapeAllTeamStats();
    
    const now = new Date();
    const expires = new Date(now.getTime() + CACHE_DURATION_HOURS * 60 * 60 * 1000);
    
    cache.nba = {
      teams,
      cachedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    };
    
    cache.lastUpdate = now.toISOString();
    saveBatchCache(cache);
    
    console.log(`✅ Pré-calcul NBA terminé: ${teams.length} équipes`);
    
    return {
      success: true,
      teamsProcessed: teams.length,
      errors,
      duration: Date.now() - startTime,
    };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
    errors.push(errorMsg);
    console.log(`❌ Erreur pré-calcul NBA: ${errorMsg}`);
    
    return {
      success: false,
      teamsProcessed: 0,
      errors,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Pré-calcule toutes les stats (Football + NBA)
 */
export async function precalculateAllStats(): Promise<{
  football: {
    success: boolean;
    teamsProcessed: number;
    errors: string[];
  };
  nba: {
    success: boolean;
    teamsProcessed: number;
    errors: string[];
  };
  totalDuration: number;
}> {
  console.log('🚀 Pré-calcul complet de toutes les stats...\n');
  
  const startTime = Date.now();
  
  const football = await precalculateFootballStats();
  const nba = await precalculateNBAStats();
  
  const totalDuration = Date.now() - startTime;
  
  console.log(`\n🎉 Pré-calcul complet terminé en ${Math.round(totalDuration / 1000)}s`);
  
  return {
    football: {
      success: football.success,
      teamsProcessed: football.teamsProcessed,
      errors: football.errors,
    },
    nba: {
      success: nba.success,
      teamsProcessed: nba.teamsProcessed,
      errors: nba.errors,
    },
    totalDuration,
  };
}

/**
 * Récupère les stats en cache pour une équipe
 */
export function getCachedTeamStats(team: string): CachedTeamStats | null {
  const cache = loadBatchCache();
  
  // Chercher dans toutes les ligues
  for (const league of Object.keys(cache.football)) {
    const leagueCache = cache.football[league];
    for (const cachedTeam of Object.keys(leagueCache)) {
      if (cachedTeam.toLowerCase().includes(team.toLowerCase()) ||
          team.toLowerCase().includes(cachedTeam.toLowerCase())) {
        const stats = leagueCache[cachedTeam];
        if (isCacheValid(stats.cachedAt)) {
          return stats;
        }
      }
    }
  }
  
  return null;
}

/**
 * Récupère les stats NBA en cache
 */
export function getCachedNBAStats(): NBATeamStats[] | null {
  const cache = loadBatchCache();
  
  if (cache.nba && isCacheValid(cache.nba.cachedAt)) {
    return cache.nba.teams;
  }
  
  return null;
}

/**
 * Récupère les stats NBA pour une équipe spécifique
 */
export function getCachedNBATeamStats(team: string): NBATeamStats | null {
  const teams = getCachedNBAStats();
  
  if (!teams) return null;
  
  return teams.find(t => 
    t.team.toLowerCase().includes(team.toLowerCase()) ||
    team.toLowerCase().includes(t.team.toLowerCase()) ||
    t.abbreviation.toLowerCase() === team.toLowerCase()
  ) || null;
}

/**
 * Vérifie si le cache a besoin d'être mis à jour
 */
export function needsUpdate(): boolean {
  const cache = loadBatchCache();
  
  if (!cache.lastUpdate) return true;
  
  const lastUpdate = new Date(cache.lastUpdate).getTime();
  const now = Date.now();
  const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);
  
  return hoursSinceUpdate >= UPDATE_INTERVAL_HOURS;
}

/**
 * Obtient le statut du cache
 */
export function getCacheStatus(): {
  lastUpdate: string;
  nextScheduledUpdate: string;
  footballTeams: number;
  nbaTeams: number;
  isValid: boolean;
} {
  const cache = loadBatchCache();
  
  let footballTeams = 0;
  for (const league of Object.keys(cache.football)) {
    footballTeams += Object.keys(cache.football[league]).length;
  }
  
  const nbaTeams = cache.nba?.teams.length || 0;
  
  return {
    lastUpdate: cache.lastUpdate || 'Jamais',
    nextScheduledUpdate: cache.nextScheduledUpdate || 'Non planifiée',
    footballTeams,
    nbaTeams,
    isValid: cache.lastUpdate ? isCacheValid(cache.lastUpdate) : false,
  };
}

/**
 * Force la mise à jour du cache
 */
export async function forceUpdate(): Promise<void> {
  await precalculateAllStats();
}

/**
 * Vide le cache
 */
export function clearBatchCache(): void {
  ensureCacheDir();
  
  if (fs.existsSync(BATCH_CACHE_FILE)) {
    fs.unlinkSync(BATCH_CACHE_FILE);
  }
  
  console.log('🗑️ Cache batch vidé');
}

// ============================================
// EXPORTS
// ============================================

const BatchPreCalculationService = {
  precalculateFootballStats,
  precalculateNBAStats,
  precalculateAllStats,
  getCachedTeamStats,
  getCachedNBAStats,
  getCachedNBATeamStats,
  needsUpdate,
  getCacheStatus,
  forceUpdate,
  clearCache: clearBatchCache,
};

export default BatchPreCalculationService;
