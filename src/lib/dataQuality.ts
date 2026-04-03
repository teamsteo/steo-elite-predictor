/**
 * Data Quality System - Système de transparence des données
 * 
 * Ce module fournit des outils pour indiquer clairement la source
 * et la qualité des données utilisées dans les prédictions.
 */

// Types de qualité des données
export type DataQualityLevel = 'real' | 'estimated' | 'partial' | 'none';

// Sources de données possibles
export type DataSource = 
  | 'api-football'      // API-Football (données réelles)
  | 'balldontlie'       // Balldontlie API (données réelles NBA)
  | 'thesportsdb'       // TheSportsDB (données partielles)
  | 'espn'              // ESPN API
  | 'fbref'             // FBref (scraping - souvent bloqué)
  | 'transfermarkt'     // Transfermarkt (scraping - souvent bloqué)
  | 'odds-based'        // Estimation basée sur les cotes
  | 'historical'        // Données historiques
  | 'default'           // Valeurs par défaut
  | 'unknown';          // Source inconnue

// Configuration pour l'affichage de la qualité
export const DATA_QUALITY_CONFIG: Record<DataQualityLevel, {
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  real: {
    label: 'Données réelles',
    shortLabel: 'Réel',
    description: 'Données officielles provenant des APIs sportives',
    icon: '✓',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-500/15',
    borderColor: 'border-green-500/30',
  },
  estimated: {
    label: 'Estimation',
    shortLabel: 'Estim.',
    description: 'Calculé à partir des cotes des bookmakers',
    icon: '⚠',
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-500/15',
    borderColor: 'border-yellow-500/30',
  },
  partial: {
    label: 'Partiel',
    shortLabel: 'Part.',
    description: 'Certaines données réelles, autres estimées',
    icon: '◐',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-500/15',
    borderColor: 'border-blue-500/30',
  },
  none: {
    label: 'Non disponible',
    shortLabel: 'N/A',
    description: 'Aucune donnée disponible',
    icon: '✗',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-500/15',
    borderColor: 'border-gray-500/30',
  },
};

// Configuration des sources de données
export const DATA_SOURCE_CONFIG: Record<DataSource, {
  name: string;
  reliability: number;
  free: boolean;
  requiresKey: boolean;
  url?: string;
}> = {
  'api-football': {
    name: 'API-Football',
    reliability: 95,
    free: true,
    requiresKey: true,
    url: 'https://www.api-football.com/',
  },
  'balldontlie': {
    name: 'Balldontlie API',
    reliability: 90,
    free: true,
    requiresKey: false,
    url: 'https://www.balldontlie.io/',
  },
  'thesportsdb': {
    name: 'TheSportsDB',
    reliability: 75,
    free: true,
    requiresKey: false,
    url: 'https://www.thesportsdb.com/',
  },
  'espn': {
    name: 'ESPN API',
    reliability: 85,
    free: true,
    requiresKey: false,
  },
  'fbref': {
    name: 'FBref',
    reliability: 50,
    free: true,
    requiresKey: false,
    url: 'https://fbref.com/',
  },
  'transfermarkt': {
    name: 'Transfermarkt',
    reliability: 40,
    free: true,
    requiresKey: false,
    url: 'https://www.transfermarkt.com/',
  },
  'odds-based': {
    name: 'Cotes Bookmakers',
    reliability: 60,
    free: true,
    requiresKey: false,
  },
  'historical': {
    name: 'Données Historiques',
    reliability: 70,
    free: true,
    requiresKey: false,
  },
  'default': {
    name: 'Valeurs par défaut',
    reliability: 30,
    free: true,
    requiresKey: false,
  },
  'unknown': {
    name: 'Inconnue',
    reliability: 0,
    free: true,
    requiresKey: false,
  },
};

// Types d'erreurs possibles
export type ErrorType = 
  | 'api_timeout'
  | 'api_error'
  | 'rate_limited'
  | 'scraping_blocked'
  | 'no_data'
  | 'invalid_data'
  | 'missing_api_key';

// Messages d'erreur explicites
export const ERROR_MESSAGES: Record<ErrorType, {
  title: string;
  description: string;
  solution: string;
  severity: 'critical' | 'warning' | 'info';
}> = {
  api_timeout: {
    title: 'Délai d\'attente dépassé',
    description: 'L\'API met trop de temps à répondre',
    solution: 'Réessayez dans quelques instants',
    severity: 'warning',
  },
  api_error: {
    title: 'Erreur de l\'API',
    description: 'L\'API a retourné une erreur',
    solution: 'Vérifiez votre connexion et réessayez',
    severity: 'critical',
  },
  rate_limited: {
    title: 'Limite de requêtes atteinte',
    description: 'Trop de requêtes ont été envoyées à l\'API',
    solution: 'Attendez quelques minutes avant de réessayer',
    severity: 'warning',
  },
  scraping_blocked: {
    title: 'Scraping bloqué',
    description: 'Le site web a bloqué l\'accès automatique',
    solution: 'Utilisation des données de cotes comme alternative',
    severity: 'warning',
  },
  no_data: {
    title: 'Aucune donnée',
    description: 'Aucune donnée disponible pour ce match',
    solution: 'Les prédictions sont basées sur les cotes',
    severity: 'info',
  },
  invalid_data: {
    title: 'Données invalides',
    description: 'Les données reçues sont incorrectes',
    solution: 'Utilisation de valeurs par défaut',
    severity: 'warning',
  },
  missing_api_key: {
    title: 'Clé API manquante',
    description: 'Aucune clé API n\'est configurée',
    solution: 'Configurez une clé API gratuite pour plus de précision',
    severity: 'info',
  },
};

// Interface pour les métadonnées de qualité
export interface DataQualityMetadata {
  overall: DataQualityLevel;
  overallScore: number; // 0-100
  byType: {
    form: DataQualityLevel;
    goals: DataQualityLevel;
    cards: DataQualityLevel;
    corners: DataQualityLevel;
    injuries: DataQualityLevel;
    h2h: DataQualityLevel;
  };
  sources: DataSource[];
  errors: DataQualityError[];
  lastUpdated: string;
}

export interface DataQualityError {
  type: ErrorType;
  message: string;
  affectedData: string[];
  fallback?: string;
  severity: 'critical' | 'warning' | 'info';
}

/**
 * Crée des métadonnées de qualité par défaut (estimation)
 */
export function createDefaultQualityMetadata(): DataQualityMetadata {
  return {
    overall: 'estimated',
    overallScore: 40,
    byType: {
      form: 'none',
      goals: 'estimated',
      cards: 'estimated',
      corners: 'estimated',
      injuries: 'none',
      h2h: 'none',
    },
    sources: ['odds-based'],
    errors: [],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Crée des métadonnées de qualité pour données réelles
 */
export function createRealDataQualityMetadata(source: DataSource): DataQualityMetadata {
  return {
    overall: 'real',
    overallScore: 90,
    byType: {
      form: 'real',
      goals: 'real',
      cards: 'real',
      corners: 'real',
      injuries: 'real',
      h2h: 'real',
    },
    sources: [source],
    errors: [],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Calcule la qualité globale à partir des qualités par type
 */
export function calculateOverallQuality(
  byType: Record<string, DataQualityLevel>
): { level: DataQualityLevel; score: number } {
  const weights: Record<string, number> = {
    form: 0.25,
    goals: 0.25,
    injuries: 0.20,
    h2h: 0.15,
    cards: 0.10,
    corners: 0.05,
  };
  
  const qualityScores: Record<DataQualityLevel, number> = {
    real: 100,
    partial: 60,
    estimated: 40,
    none: 0,
  };
  
  let totalScore = 0;
  let totalWeight = 0;
  
  for (const [type, quality] of Object.entries(byType)) {
    const weight = weights[type] || 0.1;
    totalScore += qualityScores[quality] * weight;
    totalWeight += weight;
  }
  
  const score = Math.round(totalWeight > 0 ? totalScore / totalWeight : 0);
  
  let level: DataQualityLevel;
  if (score >= 80) level = 'real';
  else if (score >= 50) level = 'partial';
  else if (score >= 20) level = 'estimated';
  else level = 'none';
  
  return { level, score };
}

/**
 * Détecte si les scrapers sont bloqués
 */
export function detectScrapingBlock(result: any): DataQualityError | null {
  if (!result) {
    return {
      type: 'scraping_blocked',
      message: 'Aucune réponse du serveur',
      affectedData: ['form', 'injuries', 'h2h'],
      fallback: 'Utilisation des cotes pour estimation',
      severity: 'warning',
    };
  }
  
  if (result.code === 403 || result.code === 429) {
    return {
      type: 'scraping_blocked',
      message: 'Accès bloqué par le site (protection anti-bot)',
      affectedData: ['form', 'injuries', 'h2h'],
      fallback: 'Utilisation des cotes pour estimation',
      severity: 'warning',
    };
  }
  
  if (result.data === null || result.data === undefined) {
    return {
      type: 'no_data',
      message: 'Données non disponibles',
      affectedData: ['form', 'injuries', 'h2h'],
      fallback: 'Estimation basée sur les cotes',
      severity: 'info',
    };
  }
  
  return null;
}

/**
 * Formate les métadonnées pour l'affichage
 */
export function formatQualityForDisplay(metadata: DataQualityMetadata): {
  summary: string;
  details: string[];
  warnings: string[];
} {
  const config = DATA_QUALITY_CONFIG[metadata.overall];
  const details: string[] = [];
  const warnings: string[] = [];
  
  const typeNames: Record<string, string> = {
    form: 'Forme',
    goals: 'Buts',
    cards: 'Cartons',
    corners: 'Corners',
    injuries: 'Blessures',
    h2h: 'H2H',
  };
  
  for (const [type, quality] of Object.entries(metadata.byType)) {
    const typeConfig = DATA_QUALITY_CONFIG[quality];
    const typeName = typeNames[type] || type;
    
    if (quality !== 'real') {
      details.push(`${typeName}: ${typeConfig.shortLabel}`);
    }
  }
  
  for (const error of metadata.errors) {
    const errorMsg = ERROR_MESSAGES[error.type];
    if (errorMsg && error.severity !== 'info') {
      warnings.push(errorMsg.description);
    }
  }
  
  return {
    summary: `${config.icon} ${config.label} (${metadata.overallScore}%)`,
    details,
    warnings,
  };
}

// Export par défaut
const DataQuality = {
  DATA_QUALITY_CONFIG,
  DATA_SOURCE_CONFIG,
  ERROR_MESSAGES,
  calculateOverallQuality,
  createDefaultQualityMetadata,
  createRealDataQualityMetadata,
  detectScrapingBlock,
  formatQualityForDisplay,
};

export default DataQuality;
