/**
 * Expert Advice Store - Stockage des conseils pré-calculés
 * 
 * Ce service lit les conseils expert pré-calculés depuis GitHub.
 * Les conseils sont calculés localement et poussés sur GitHub pour
 * éviter les timeouts sur Vercel.
 */

// Configuration GitHub
const GITHUB_REPO = 'steohidy/my-project';
const GITHUB_BRANCH = 'master';
const EXPERT_ADVICES_FILE = 'data/expert-advices.json';

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
 * Charge les conseils expert depuis GitHub
 */
async function loadFromGitHub(): Promise<ExpertAdvicesData> {
  // Vérifier le cache
  if (cachedData && (Date.now() - cacheTimestamp) < CACHE_TTL) {
    return cachedData;
  }

  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${EXPERT_ADVICES_FILE}`,
      { 
        next: { revalidate: 60 }, // Cache Next.js: 1 minute
        headers: { 'Cache-Control': 'no-cache' }
      }
    );
    
    if (res.ok) {
      const data = await res.json();
      cachedData = data;
      cacheTimestamp = Date.now();
      console.log('📊 Expert Advices: données chargées depuis GitHub');
      return data;
    } else {
      console.log('📊 Expert Advices: fichier non trouvé sur GitHub');
    }
  } catch (e) {
    console.error('Erreur chargement expert advices:', e);
  }
  
  return DEFAULT_DATA;
}

/**
 * Sauvegarde les conseils sur GitHub (appelé par le script local)
 */
async function saveToGitHub(data: ExpertAdvicesData): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN;
  
  if (!token) {
    console.warn('⚠️ GITHUB_TOKEN non configuré');
    return false;
  }

  try {
    // Récupérer le SHA du fichier existant
    const getRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${EXPERT_ADVICES_FILE}`,
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
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${EXPERT_ADVICES_FILE}`,
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
          branch: GITHUB_BRANCH
        })
      }
    );
    
    if (saveRes.ok) {
      console.log('📊 Expert Advices: sauvegardés sur GitHub');
      // Mettre à jour le cache
      cachedData = data;
      cacheTimestamp = Date.now();
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
    return loadFromGitHub();
  },

  /**
   * Récupère tous les conseils
   */
  async getAll(): Promise<ExpertAdvice[]> {
    const data = await loadFromGitHub();
    return data.advices;
  },

  /**
   * Récupère un conseil par match ID
   */
  async getByMatchId(matchId: string): Promise<ExpertAdvice | null> {
    const data = await loadFromGitHub();
    return data.advices.find(a => a.matchId === matchId) || null;
  },

  /**
   * Sauvegarde les conseils (pour le script local)
   */
  async save(data: ExpertAdvicesData): Promise<boolean> {
    return saveToGitHub(data);
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
