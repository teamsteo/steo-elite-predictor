/**
 * Scraper Error Handler - Gestion centralisée des erreurs de scraping
 * 
 * Ce module fournit:
 * - Des messages d'erreur explicites pour les utilisateurs
 * - La détection automatique des types d'erreurs
 * - Des suggestions de solutions
 * - La classification de la sévérité des erreurs
 */

// Types d'erreurs possibles
export type ScraperErrorType = 
  | 'cloudflare_blocked'
  | 'rate_limited'
  | 'timeout'
  | 'not_found'
  | 'server_error'
  | 'javascript_rendering'
  | 'ip_blocked'
  | 'invalid_response'
  | 'parsing_failed'
  | 'network_error'
  | 'no_data'
  | 'unknown';

// Sévérité des erreurs
export type ErrorSeverity = 'critical' | 'warning' | 'info';

// Interface pour les erreurs de scraping
export interface ScraperError {
  type: ScraperErrorType;
  source: string;
  message: string;
  userMessage: string;
  solution: string;
  severity: ErrorSeverity;
  affectedData: string[];
  timestamp: string;
  retryable: boolean;
}

// Configuration des messages d'erreur
export const ERROR_CONFIG: Record<ScraperErrorType, {
  userMessage: string;
  solution: string;
  severity: ErrorSeverity;
  retryable: boolean;
}> = {
  cloudflare_blocked: {
    userMessage: 'Accès bloqué par Cloudflare (protection anti-bot)',
    solution: 'Les données sont estimées à partir des cotes des bookmakers',
    severity: 'warning',
    retryable: false,
  },
  rate_limited: {
    userMessage: 'Limite de requêtes atteinte sur ce site',
    solution: 'Réessayez dans quelques minutes',
    severity: 'warning',
    retryable: true,
  },
  timeout: {
    userMessage: 'Le site met trop de temps à répondre',
    solution: 'Les données de secours sont utilisées',
    severity: 'warning',
    retryable: true,
  },
  not_found: {
    userMessage: 'Page non trouvée sur le site source',
    solution: 'Vérifiez que l\'équipe existe dans cette compétition',
    severity: 'info',
    retryable: false,
  },
  server_error: {
    userMessage: 'Erreur du serveur distant',
    solution: 'Réessayez ultérieurement',
    severity: 'warning',
    retryable: true,
  },
  javascript_rendering: {
    userMessage: 'Le contenu nécessite JavaScript (non disponible)',
    solution: 'Utilisation de données alternatives',
    severity: 'warning',
    retryable: false,
  },
  ip_blocked: {
    userMessage: 'Adresse IP bloquée par le site',
    solution: 'Source alternative utilisée pour les données',
    severity: 'warning',
    retryable: false,
  },
  invalid_response: {
    userMessage: 'Réponse invalide reçue du site',
    solution: 'Données de secours utilisées',
    severity: 'warning',
    retryable: true,
  },
  parsing_failed: {
    userMessage: 'Impossible d\'extraire les données',
    solution: 'Le format du site a peut-être changé',
    severity: 'warning',
    retryable: false,
  },
  no_data: {
    userMessage: 'Aucune donnée disponible',
    solution: 'Les prédictions sont basées sur les cotes',
    severity: 'info',
    retryable: true,
  },
  network_error: {
    userMessage: 'Erreur de connexion réseau',
    solution: 'Vérifiez votre connexion internet',
    severity: 'critical',
    retryable: true,
  },
  unknown: {
    userMessage: 'Erreur inconnue lors de la récupération des données',
    solution: 'Réessayez ou utilisez les données de secours',
    severity: 'warning',
    retryable: true,
  },
};

/**
 * Détecte le type d'erreur à partir d'une réponse
 */
export function detectErrorType(
  response: { code?: number; data?: any; error?: string } | null,
  source: string
): ScraperErrorType {
  if (!response) {
    return 'network_error';
  }

  const code = response.code || 200;
  const error = response.error?.toLowerCase() || '';

  // Cloudflare
  if (code === 403 || code === 503 || 
      error.includes('cloudflare') || 
      error.includes('challenge') ||
      error.includes('blocked')) {
    return 'cloudflare_blocked';
  }

  // Rate limiting
  if (code === 429 || error.includes('rate limit') || error.includes('too many')) {
    return 'rate_limited';
  }

  // Timeout
  if (code === 408 || code === 504 || error.includes('timeout')) {
    return 'timeout';
  }

  // Not found
  if (code === 404) {
    return 'not_found';
  }

  // Server error
  if (code >= 500) {
    return 'server_error';
  }

  // IP blocked
  if (code === 403 || error.includes('forbidden') || error.includes('denied')) {
    return 'ip_blocked';
  }

  // Invalid response
  if (!response.data || response.data === null) {
    return 'invalid_response';
  }

  // JavaScript rendering needed
  if (response.data?.html && 
      (response.data.html.includes('JavaScript') || 
       response.data.html.includes('<noscript>') ||
       response.data.html.length < 1000)) {
    return 'javascript_rendering';
  }

  return 'unknown';
}

/**
 * Crée une erreur de scraping structurée
 */
export function createScraperError(
  type: ScraperErrorType,
  source: string,
  affectedData: string[] = [],
  customMessage?: string
): ScraperError {
  const config = ERROR_CONFIG[type];
  
  return {
    type,
    source,
    message: customMessage || config.userMessage,
    userMessage: config.userMessage,
    solution: config.solution,
    severity: config.severity,
    affectedData,
    timestamp: new Date().toISOString(),
    retryable: config.retryable,
  };
}

/**
 * Wrapper pour les appels de scraping avec gestion d'erreurs
 */
export async function withErrorHandling<T>(
  scraperFn: () => Promise<T>,
  source: string,
  affectedData: string[]
): Promise<{ data: T | null; error: ScraperError | null }> {
  try {
    const data = await scraperFn();
    
    // Vérifier si les données sont vides ou invalides
    if (!data || (Array.isArray(data) && data.length === 0) || 
        (typeof data === 'object' && Object.keys(data).length === 0)) {
      return {
        data: null,
        error: createScraperError('no_data', source, affectedData),
      };
    }
    
    return { data, error: null };
  } catch (error: any) {
    const errorType = detectErrorType(
      { error: error.message, code: error.code },
      source
    );
    
    return {
      data: null,
      error: createScraperError(errorType, source, affectedData, error.message),
    };
  }
}

/**
 * Formate les erreurs pour l'affichage utilisateur
 */
export function formatErrorForUser(error: ScraperError): {
  title: string;
  message: string;
  icon: 'error' | 'warning' | 'info';
} {
  const icons: Record<ErrorSeverity, 'error' | 'warning' | 'info'> = {
    critical: 'error',
    warning: 'warning',
    info: 'info',
  };

  return {
    title: error.userMessage,
    message: `💡 ${error.solution}`,
    icon: icons[error.severity],
  };
}

/**
 * Formate les erreurs pour les logs
 */
export function formatErrorForLog(error: ScraperError): string {
  return `[${error.timestamp}] ${error.source}: ${error.type} - ${error.message} (affected: ${error.affectedData.join(', ')})`;
}

/**
 * Regroupe les erreurs par sévérité
 */
export function groupErrorsBySeverity(errors: ScraperError[]): {
  critical: ScraperError[];
  warning: ScraperError[];
  info: ScraperError[];
} {
  return {
    critical: errors.filter(e => e.severity === 'critical'),
    warning: errors.filter(e => e.severity === 'warning'),
    info: errors.filter(e => e.severity === 'info'),
  };
}

/**
 * Crée un résumé des erreurs pour l'affichage
 */
export function createErrorSummary(errors: ScraperError[]): {
  hasCriticalErrors: boolean;
  hasWarnings: boolean;
  totalErrors: number;
  summaryMessage: string;
} {
  const grouped = groupErrorsBySeverity(errors);
  
  return {
    hasCriticalErrors: grouped.critical.length > 0,
    hasWarnings: grouped.warning.length > 0,
    totalErrors: errors.length,
    summaryMessage: grouped.critical.length > 0
      ? `${grouped.critical.length} erreur(s) critique(s), ${grouped.warning.length} avertissement(s)`
      : `${grouped.warning.length} avertissement(s)`,
  };
}

// Export par défaut
const ScraperErrorHandler = {
  detectErrorType,
  createScraperError,
  withErrorHandling,
  formatErrorForUser,
  formatErrorForLog,
  groupErrorsBySeverity,
  createErrorSummary,
  ERROR_CONFIG,
};

export default ScraperErrorHandler;
