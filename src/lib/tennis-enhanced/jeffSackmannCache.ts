/**
 * Jeff Sackmann CSV Cache - Cache centralisé 24h
 * 
 * 🛡️ OBJECTIF: Réduire les appels vers raw.githubusercontent.com
 * - Les classements changent ~1x/semaine → cache 24h est largement suffisant
 * - Les joueurs changent quasiment jamais → cache 24h
 * - Les matchs de l'année sont mis à jour quotidiennement → cache 24h
 * 
 * AVANT: calculateForm2026() téléchargeait le CSV complet (plusieurs MB) 
 *        pour CHAQUE joueur → 10 joueurs = 10 téléchargements identiques
 * APRÈS: 1 téléchargement par fichier/jour, partagé entre tous les modules
 * 
 * Modules consommateurs:
 * - live-data-service.ts (classements, joueurs, forme)
 * - prediction-engine-v2.ts (classements, joueurs, forme 2026)
 * - backtesting.ts (historique, utilisation manuelle uniquement)
 */

// ============================================
// TYPES
// ============================================

interface CacheEntry {
  text: string;
  timestamp: number;
  size: string; // taille lisible pour les logs
}

// ============================================
// CONFIGURATION
// ============================================

const ATP_BASE = 'https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master';
const WTA_BASE = 'https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master';

// 24 heures de cache
const CACHE_TTL = 24 * 60 * 60 * 1000;

// ============================================
// STOCKAGE CACHE
// ============================================

const cache = new Map<string, CacheEntry>();

// Compteurs pour les logs
let totalFetches = 0;
let cacheHits = 0;
let cacheMisses = 0;

// ============================================
// FONCTIONS INTERNES
// ============================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getCacheKey(category: 'atp' | 'wta', filename: string): string {
  return `${category}:${filename}`;
}

function getBaseUrl(category: 'atp' | 'wta'): string {
  return category === 'atp' ? ATP_BASE : WTA_BASE;
}

/**
 * Récupère un CSV depuis le cache ou le réseau
 */
async function fetchCSV(
  category: 'atp' | 'wta',
  filename: string
): Promise<string> {
  const key = getCacheKey(category, filename);
  totalFetches++;

  // 1. Vérifier le cache
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    cacheHits++;
    return cached.text;
  }

  // 2. Fetch depuis GitHub
  cacheMisses++;
  const url = `${getBaseUrl(category)}/${filename}`;
  
  console.log(`[SackmannCache] 🌐 Fetch ${category}/${filename} (miss #${cacheMisses}, hits: ${cacheHits})`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[SackmannCache] ❌ Erreur ${response.status} pour ${filename}`);
      // Retourner le cache expiré si disponible
      if (cached) {
        console.log(`[SackmannCache] 📦 Cache expiré utilisé pour ${filename}`);
        return cached.text;
      }
      return '';
    }

    const text = await response.text();

    // 3. Mettre en cache
    cache.set(key, {
      text,
      timestamp: Date.now(),
      size: formatBytes(text.length),
    });

    console.log(`[SackmannCache] ✅ ${filename} mis en cache (${formatBytes(text.length)})`);

    return text;
  } catch (error) {
    console.error(`[SackmannCache] ❌ Erreur fetch ${filename}:`, error);
    // Retourner le cache expiré si disponible
    if (cached) {
      console.log(`[SackmannCache] 📦 Cache expiré utilisé pour ${filename}`);
      return cached.text;
    }
    return '';
  }
}

// ============================================
// API PUBLIQUE - FICHIERS SPÉCIFIQUES
// ============================================

/**
 * Récupère les classements ATP actuels (csv text)
 */
export async function getATPRankingsCSV(): Promise<string> {
  return fetchCSV('atp', 'atp_rankings_current.csv');
}

/**
 * Récupère les classements WTA actuels (csv text)
 */
export async function getWTARankingsCSV(): Promise<string> {
  return fetchCSV('wta', 'wta_rankings_current.csv');
}

/**
 * Récupère le fichier joueurs ATP (csv text)
 */
export async function getATPPlayersCSV(): Promise<string> {
  return fetchCSV('atp', 'atp_players.csv');
}

/**
 * Récupère le fichier joueurs WTA (csv text)
 */
export async function getWTAPlayersCSV(): Promise<string> {
  return fetchCSV('wta', 'wta_players.csv');
}

/**
 * Récupère les matchs d'une année et catégorie
 * Essaie l'année courante, puis l'année précédente en fallback
 */
export async function getMatchesCSV(
  category: 'atp' | 'wta',
  year?: number
): Promise<{ text: string; year: number }> {
  const currentYear = year || new Date().getFullYear();
  
  let text = await fetchCSV(category, `${category}_matches_${currentYear}.csv`);
  
  if (!text || text.trim().length < 50) {
    // Fallback année précédente
    console.log(`[SackmannCache] 🔄 Fallback ${currentYear - 1} pour ${category}`);
    const fallbackText = await fetchCSV(category, `${category}_matches_${currentYear - 1}.csv`);
    return { text: fallbackText, year: currentYear - 1 };
  }
  
  return { text, year: currentYear };
}

// ============================================
// STATISTIQUES
// ============================================

export function getCacheStats() {
  const entries = Array.from(cache.entries());
  const validEntries = entries.filter(([, v]) => Date.now() - v.timestamp < CACHE_TTL);
  
  return {
    totalRequests: totalFetches,
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: totalFetches > 0 ? ((cacheHits / totalFetches) * 100).toFixed(1) + '%' : 'N/A',
    cachedFiles: entries.length,
    validFiles: validEntries.length,
    files: entries.map(([key, entry]) => ({
      key,
      size: entry.size,
      age: Math.round((Date.now() - entry.timestamp) / 60000) + 'min',
      valid: Date.now() - entry.timestamp < CACHE_TTL,
    })),
  };
}