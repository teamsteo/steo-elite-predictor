/**
 * Expert Advice Store - Stockage des conseils pré-calculés
 * 
 * VERSION 2.0 - GitHub désactivé par défaut
 * 
 * Ce service utilise Supabase comme source principale.
 * Les conseils sont calculés par le script de scraping indépendant.
 */

import { isGitHubEnabled, GITHUB_CONFIG } from './github-config';

// Types
export interface ExpertAdvice {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  unifiedContext?: {
    sourcesUsed: string[];
    dataQuality: number;
    overallAdvantage: 'home' | 'away' | 'neutral';
    keyFactors: string[];
  };
  weather?: {
    temperature: number;
    condition: string;
    windSpeed: number;
    impact: 'ideal' | 'minor' | 'moderate' | 'significant' | 'extreme';
    factors: string[];
  };
  mlInfo?: {
    edgeThreshold: number;
    modelAccuracy: number;
    adaptiveWeights: { form: number; xg: number; injuries: number };
  };
  context?: {
    recentNews: string[];
    injuries: { home: string[]; away: string[] };
    form: { home: string; away: string };
  };
  oddsAnalysis: {
    favorite: string;
    favoriteOdds: number;
    edge: number;
    publicPercentage: number;
    isPublicFade: boolean;
  };
  recommendation: {
    bet: 'home' | 'draw' | 'away' | 'avoid';
    confidence: 'very_high' | 'high' | 'medium' | 'low';
    reasoning: string[];
    kellyStake: number;
    maxStake: number;
    expectedValue: number;
  };
  warnings: string[];
  dataQuality: 'high' | 'medium' | 'low';
}

export interface ExpertAdvicesData {
  generatedAt: string;
  phase: 'football' | 'basketball' | 'all-sports';
  nextReset: string;
  totalAdvices: number;
  stats: {
    football: number;
    basketball: number;
    hockey?: number;
  };
  advices: ExpertAdvice[];
}

// Cache en mémoire
let cachedData: ExpertAdvicesData | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

// Données par défaut
const DEFAULT_DATA: ExpertAdvicesData = {
  generatedAt: new Date().toISOString(),
  phase: 'football',
  nextReset: '22h00 UTC',
  totalAdvices: 0,
  stats: { football: 0, basketball: 0 },
  advices: []
};

/**
 * Charge les conseils expert depuis Supabase (priorité) ou GitHub (fallback désactivé)
 */
async function loadFromStorage(): Promise<ExpertAdvicesData> {
  // Vérifier le cache
  if (cachedData && (Date.now() - cacheTimestamp) < CACHE_TTL) {
    return cachedData;
  }

  // GitHub désactivé par défaut pour éviter le blocage
  if (!isGitHubEnabled()) {
    console.log('📊 Expert Advices: GitHub désactivé, utilisation du cache local');
    return cachedData || DEFAULT_DATA;
  }

  const token = GITHUB_CONFIG.token;

  // Essayer d'abord avec l'API GitHub (pour les repos privés)
  if (token) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_CONFIG.repo}/contents/data/expert-advices.json?ref=${GITHUB_CONFIG.branch}`,
        { 
          headers: { 
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.raw'
          },
          next: { revalidate: 60 }
        }
      );
      
      if (res.ok) {
        const data = await res.json();
        cachedData = data;
        cacheTimestamp = Date.now();
        console.log('📊 Expert Advices: données chargées depuis GitHub API');
        return data;
      }
    } catch (e) {
      console.error('Erreur chargement expert advices API GitHub:', e);
    }
  }

  // Fallback: essayer raw.githubusercontent.com
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/data/expert-advices.json`,
      { 
        next: { revalidate: 60 },
        headers: { 'Cache-Control': 'no-cache' }
      }
    );
    
    if (res.ok) {
      const data = await res.json();
      cachedData = data;
      cacheTimestamp = Date.now();
      console.log('📊 Expert Advices: données chargées depuis GitHub Raw');
      return data;
    } else {
      console.log('📊 Expert Advices: fichier non trouvé sur GitHub');
    }
  } catch (e) {
    console.error('Erreur chargement expert advices:', e);
  }
  
  return cachedData || DEFAULT_DATA;
}

/**
 * Sauvegarde les conseils sur GitHub (désactivé par défaut)
 */
async function saveToStorage(data: ExpertAdvicesData): Promise<boolean> {
  // Mettre à jour le cache local
  cachedData = data;
  cacheTimestamp = Date.now();

  // GitHub désactivé par défaut
  if (!isGitHubEnabled()) {
    console.log('📊 Expert Advices: GitHub désactivé, données en cache local uniquement');
    return true;
  }

  const token = GITHUB_CONFIG.token;
  
  if (!token) {
    console.warn('⚠️ GITHUB_TOKEN non configuré');
    return false;
  }

  try {
    // Récupérer le SHA du fichier existant
    const getRes = await fetch(
      `https://api.github.com/repos/${GITHUB_CONFIG.repo}/contents/data/expert-advices.json`,
      { 
        headers: { 
          Authorization: `token ${token}`, 
          Accept: 'application/vnd.github.v3+json' 
        } 
      }
    );
    
    let sha = '';
    if (getRes.ok) {
      const fileInfo = await getRes.json();
      sha = fileInfo.sha;
    }

    // Sauvegarder
    const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    const saveRes = await fetch(
      `https://api.github.com/repos/${GITHUB_CONFIG.repo}/contents/data/expert-advices.json`,
      {
        method: 'PUT',
        headers: { 
          Authorization: `token ${token}`, 
          Accept: 'application/vnd.github.v3+json', 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          message: `🎯 Expert Advices MAJ ${new Date().toLocaleString('fr-FR')}`,
          content,
          sha: sha || undefined,
          branch: GITHUB_CONFIG.branch
        })
      }
    );
    
    if (saveRes.ok) {
      console.log('📊 Expert Advices: sauvegardés sur GitHub');
      return true;
    } else {
      console.error('Erreur sauvegarde GitHub expert advices:', await saveRes.text());
      return false;
    }
  } catch (e) {
    console.error('Erreur sauvegarde expert advices:', e);
    return false;
  }
}

/**
 * Vérifie si les données sont fraîches (moins de 6 heures)
 */
function isDataFresh(data: ExpertAdvicesData): boolean {
  if (!data.generatedAt) return false;
  
  const generatedTime = new Date(data.generatedAt).getTime();
  const now = Date.now();
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  
  return (now - generatedTime) < SIX_HOURS;
}

/**
 * API Publique
 */
export const ExpertAdviceStore = {
  /**
   * Charge les conseils expert pré-calculés
   */
  async load(): Promise<ExpertAdvicesData> {
    return loadFromStorage();
  },

  /**
   * Récupère tous les conseils
   */
  async getAll(): Promise<ExpertAdvice[]> {
    const data = await loadFromStorage();
    return data.advices;
  },

  /**
   * Récupère un conseil par match ID
   */
  async getByMatchId(matchId: string): Promise<ExpertAdvice | null> {
    const data = await loadFromStorage();
    return data.advices.find(a => a.matchId === matchId) || null;
  },

  /**
   * Sauvegarde les conseils (pour le script local)
   */
  async save(data: ExpertAdvicesData): Promise<boolean> {
    return saveToStorage(data);
  },

  /**
   * Vérifie si les données sont fraîches
   */
  isFresh(data: ExpertAdvicesData): boolean {
    return isDataFresh(data);
  },

  /**
   * Invalide le cache
   */
  invalidateCache(): void {
    cachedData = null;
    cacheTimestamp = 0;
  },

  /**
   * Retourne les infos sur le cache
   */
  getCacheInfo(): { cached: boolean; age: number; fresh: boolean } {
    return {
      cached: cachedData !== null,
      age: cachedData ? Date.now() - cacheTimestamp : 0,
      fresh: cachedData ? isDataFresh(cachedData) : false
    };
  }
};

export default ExpertAdviceStore;
