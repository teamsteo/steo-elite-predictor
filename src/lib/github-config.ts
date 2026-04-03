/**
 * Configuration GitHub centralisée
 * 
 * GitHub est DÉSACTIVÉ par défaut pour éviter le blocage de l'API.
 * Pour réactiver, définir GITHUB_ENABLED=true dans les variables d'environnement.
 * 
 * Raisons de la désactivation:
 * - Blocage pour violation (scraping répétitif)
 * - Rate limiting de l'API GitHub (5000 req/heure avec token, 60 sans)
 * - Architecture recommandée: Supabase comme source principale
 */

// Configuration centralisée
export const GITHUB_CONFIG = {
  // GitHub doit être EXPLICITEMENT activé
  enabled: process.env.GITHUB_ENABLED === 'true',
  
  // Configuration du repo
  repo: process.env.GITHUB_REPO || 'steohidy/my-project',
  branch: process.env.GITHUB_BRANCH || 'master',
  token: process.env.GITHUB_TOKEN || '',
  
  // Rate limiting - délai minimum entre les requêtes (ms)
  minDelay: 1000,
  
  // URL de base de l'API
  apiBaseUrl: 'https://api.github.com',
  rawBaseUrl: 'https://raw.githubusercontent.com',
} as const;

/**
 * Vérifie si GitHub est activé et configuré
 */
export function isGitHubEnabled(): boolean {
  return GITHUB_CONFIG.enabled && GITHUB_CONFIG.token.length > 0;
}

/**
 * Retourne un message de statut pour le debug
 */
export function getGitHubStatus(): { enabled: boolean; reason: string } {
  if (!GITHUB_CONFIG.enabled) {
    return { enabled: false, reason: 'GITHUB_ENABLED non défini' };
  }
  if (!GITHUB_CONFIG.token) {
    return { enabled: false, reason: 'GITHUB_TOKEN non configuré' };
  }
  return { enabled: true, reason: 'GitHub activé et configuré' };
}

/**
 * Wrapper pour les appels GitHub API avec vérification
 * Retourne null si GitHub est désactivé
 */
export async function safeGitHubFetch<T>(
  fetchFn: () => Promise<T>
): Promise<T | null> {
  if (!isGitHubEnabled()) {
    console.log('📊 GitHub: désactivé, opération ignorée');
    return null;
  }
  
  try {
    return await fetchFn();
  } catch (error) {
    console.error('❌ GitHub API error:', error);
    return null;
  }
}

export default GITHUB_CONFIG;
