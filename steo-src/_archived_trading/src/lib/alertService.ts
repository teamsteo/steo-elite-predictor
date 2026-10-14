/**
 * Service d'alertes système
 * Détecte les problèmes d'API et affiche des alertes dans l'interface
 */

export interface SystemAlert {
  id: string;
  type: 'error' | 'warning' | 'info';
  source: string;
  message: string;
  timestamp: string;
  details?: string;
}

// Stockage des alertes en mémoire (avec limite)
const alerts: SystemAlert[] = [];
const MAX_ALERTS = 50;

// Sources à surveiller
const API_SOURCES = {
  'ESPN NBA': 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
  'ESPN Football': 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard',
  'GitHub Store': 'https://raw.githubusercontent.com/steohidy/my-project/master/data/store-predictions.json',
};

/**
 * Ajouter une alerte
 */
export function addAlert(alert: Omit<SystemAlert, 'id' | 'timestamp'>): SystemAlert {
  const newAlert: SystemAlert = {
    ...alert,
    id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString()
  };
  
  alerts.unshift(newAlert);
  
  // Limiter le nombre d'alertes
  if (alerts.length > MAX_ALERTS) {
    alerts.pop();
  }
  
  console.log(`🚨 ALERT [${alert.type.toUpperCase()}] ${alert.source}: ${alert.message}`);
  
  return newAlert;
}

/**
 * Récupérer toutes les alertes
 */
export function getAlerts(): SystemAlert[] {
  return alerts;
}

/**
 * Récupérer les alertes actives (24h)
 */
export function getActiveAlerts(): SystemAlert[] {
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  
  return alerts.filter(a => new Date(a.timestamp) > oneDayAgo);
}

/**
 * Effacer les alertes
 */
export function clearAlerts(): void {
  alerts.length = 0;
}

/**
 * Vérifier la santé d'une API
 */
export async function checkAPIHealth(name: string, url: string): Promise<{
  healthy: boolean;
  responseTime: number;
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10000) // 10s timeout
    });
    
    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      return {
        healthy: false,
        responseTime,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }
    
    return { healthy: true, responseTime };
  } catch (error: any) {
    return {
      healthy: false,
      responseTime: Date.now() - startTime,
      error: error.message || 'Connection failed'
    };
  }
}

/**
 * Vérifier toutes les APIs
 */
export async function checkAllAPIs(): Promise<{
  healthy: number;
  unhealthy: number;
  results: Array<{
    name: string;
    healthy: boolean;
    responseTime: number;
    error?: string;
  }>;
}> {
  const results: Array<{
    name: string;
    healthy: boolean;
    responseTime: number;
    error?: string;
  }> = [];
  let healthy = 0;
  let unhealthy = 0;
  
  for (const [name, url] of Object.entries(API_SOURCES)) {
    const result = await checkAPIHealth(name, url);
    results.push({ name, ...result });
    
    if (result.healthy) {
      healthy++;
    } else {
      unhealthy++;
      // Ajouter une alerte pour les APIs défaillantes
      addAlert({
        type: 'error',
        source: name,
        message: 'API non disponible',
        details: result.error
      });
    }
  }
  
  return { healthy, unhealthy, results };
}

/**
 * Vérifier le store GitHub
 */
export async function checkStoreHealth(): Promise<{
  healthy: boolean;
  predictionCount: number;
  lastUpdate: string;
  error?: string;
}> {
  try {
    const response = await fetch(
      'https://raw.githubusercontent.com/steohidy/my-project/master/data/store-predictions.json',
      { next: { revalidate: 60 } }
    );
    
    if (!response.ok) {
      return {
        healthy: false,
        predictionCount: 0,
        lastUpdate: 'N/A',
        error: `HTTP ${response.status}`
      };
    }
    
    const data = await response.json();
    
    return {
      healthy: true,
      predictionCount: data.predictions?.length || 0,
      lastUpdate: data.lastUpdate || 'N/A'
    };
  } catch (error: any) {
    return {
      healthy: false,
      predictionCount: 0,
      lastUpdate: 'N/A',
      error: error.message
    };
  }
}

export const AlertService = {
  addAlert,
  getAlerts,
  getActiveAlerts,
  clearAlerts,
  checkAPIHealth,
  checkAllAPIs,
  checkStoreHealth
};

export default AlertService;
