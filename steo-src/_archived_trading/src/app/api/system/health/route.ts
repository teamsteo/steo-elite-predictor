import { NextResponse } from 'next/server';

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
      results.alerts.push({
        id: `alert_nba_${Date.now()}`,
        type: 'error',
        source: 'ESPN NBA',
        message: 'API non disponible',
        timestamp: new Date().toISOString()
      });
    }
  } catch (e: any) {
    results.apis.push({ name: 'ESPN NBA', healthy: false, responseTime: 0, error: e.message });
    results.summary.unhealthyAPIs++;
    results.alerts.push({
      id: `alert_nba_${Date.now()}`,
      type: 'error',
      source: 'ESPN NBA',
      message: 'Erreur de connexion',
      timestamp: new Date().toISOString()
    });
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
      results.alerts.push({
        id: `alert_foot_${Date.now()}`,
        type: 'error',
        source: 'ESPN Football',
        message: 'API non disponible',
        timestamp: new Date().toISOString()
      });
    }
  } catch (e: any) {
    results.apis.push({ name: 'ESPN Football', healthy: false, responseTime: 0, error: e.message });
    results.summary.unhealthyAPIs++;
    results.alerts.push({
      id: `alert_foot_${Date.now()}`,
      type: 'error',
      source: 'ESPN Football',
      message: 'Erreur de connexion',
      timestamp: new Date().toISOString()
    });
  }

  // Vérifier GitHub Store
  try {
    const storeRes = await fetch(
      'https://raw.githubusercontent.com/steohidy/my-project/master/data/store-predictions.json',
      { next: { revalidate: 60 } }
    );
    
    if (storeRes.ok) {
      const data = await storeRes.json();
      results.store = {
        healthy: true,
        predictionCount: data.predictions?.length || 0,
        lastUpdate: data.lastUpdate || 'N/A',
        error: ''
      };
      results.summary.healthyAPIs++;
    } else {
      results.store = {
        healthy: false,
        predictionCount: 0,
        lastUpdate: 'N/A',
        error: `HTTP ${storeRes.status}`
      };
      results.summary.unhealthyAPIs++;
      results.alerts.push({
        id: `alert_store_${Date.now()}`,
        type: 'error',
        source: 'GitHub Store',
        message: 'Impossible de charger les données',
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
      source: 'GitHub Store',
      message: 'Erreur de connexion',
      timestamp: new Date().toISOString()
    });
  }

  // Déterminer le statut global
  results.summary.alertCount = results.alerts.length;
  
  if (results.summary.unhealthyAPIs > 0) {
    results.status = 'degraded';
  }
  
  if (results.summary.healthyAPIs === 0) {
    results.status = 'down';
  }

  return NextResponse.json(results);
}
