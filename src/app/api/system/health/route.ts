import { NextResponse } from 'next/server';
import { PredictionStore } from '@/lib/store';

/**
 * GET - Vérifier la santé du système
 */
export async function GET() {
  const results = {
    status: 'healthy' as 'healthy' | 'degraded' | 'down',
    timestamp: new Date().toISOString(),
    apis: [] as Array<{
      name: string;
      healthy: boolean;
      responseTime: number;
      error?: string;
    }>,
    store: {
      healthy: false,
      predictionCount: 0,
      lastUpdate: 'N/A',
      error: ''
    },
    alerts: [] as Array<{
      id: string;
      type: string;
      source: string;
      message: string;
      timestamp: string;
    }>,
    summary: {
      totalAPIs: 3,
      healthyAPIs: 0,
      unhealthyAPIs: 0,
      alertCount: 0
    }
  };

  // Vérifier ESPN NBA
  try {
    const start = Date.now();
    const nbaRes = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard', {
      signal: AbortSignal.timeout(10000)
    });
    const nbaTime = Date.now() - start;
    
    if (nbaRes.ok) {
      results.apis.push({ name: 'ESPN NBA', healthy: true, responseTime: nbaTime });
      results.summary.healthyAPIs++;
    } else {
      results.apis.push({ name: 'ESPN NBA', healthy: false, responseTime: nbaTime, error: `HTTP ${nbaRes.status}` });
      results.summary.unhealthyAPIs++;
    }
  } catch (e: any) {
    results.apis.push({ name: 'ESPN NBA', healthy: false, responseTime: 0, error: e.message });
    results.summary.unhealthyAPIs++;
  }

  // Vérifier ESPN Football
  try {
    const start = Date.now();
    const footRes = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard', {
      signal: AbortSignal.timeout(10000)
    });
    const footTime = Date.now() - start;
    
    if (footRes.ok) {
      results.apis.push({ name: 'ESPN Football', healthy: true, responseTime: footTime });
      results.summary.healthyAPIs++;
    } else {
      results.apis.push({ name: 'ESPN Football', healthy: false, responseTime: footTime, error: `HTTP ${footRes.status}` });
      results.summary.unhealthyAPIs++;
    }
  } catch (e: any) {
    results.apis.push({ name: 'ESPN Football', healthy: false, responseTime: 0, error: e.message });
    results.summary.unhealthyAPIs++;
  }

  // Vérifier le Store via le store local
  try {
    const storeInfo = await PredictionStore.getInfoAsync();
    
    results.store = {
      healthy: true,
      predictionCount: storeInfo.total,
      lastUpdate: storeInfo.lastUpdate || 'N/A',
      error: ''
    };
    results.summary.healthyAPIs++;
    
    // Alerte si store vide (informatif, pas une erreur)
    if (storeInfo.total === 0) {
      results.alerts.push({
        id: `alert_store_${Date.now()}`,
        type: 'info',
        source: 'Store',
        message: 'Store vide - En attente de pronostics',
        timestamp: new Date().toISOString()
      });
    }
  } catch (e: any) {
    results.store = {
      healthy: false,
      predictionCount: 0,
      lastUpdate: 'N/A',
      error: e.message
    };
    results.summary.unhealthyAPIs++;
    results.alerts.push({
      id: `alert_store_${Date.now()}`,
      type: 'error',
      source: 'Store',
      message: 'Erreur de chargement du store',
      timestamp: new Date().toISOString()
    });
  }

  // Déterminer le statut global
  results.summary.alertCount = results.alerts.filter(a => a.type === 'error').length;
  
  // Ne marquer comme dégradé que s'il y a des erreurs (pas des infos)
  const errorCount = results.alerts.filter(a => a.type === 'error').length;
  if (errorCount > 0) {
    results.status = 'degraded';
  }
  
  // Marquer comme down si aucune API n'est healthy
  const healthyAPIs = results.apis.filter(a => a.healthy).length;
  if (healthyAPIs === 0 && !results.store.healthy) {
    results.status = 'down';
  }

  return NextResponse.json(results);
}
