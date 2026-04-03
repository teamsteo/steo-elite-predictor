/**
 * API d'alertes Vercel - Envoie des notifications en cas de problème
 * 
 * GET /api/system/alerts
 * Vérifie le statut du système et envoie des alertes si nécessaire
 * 
 * Intégration possible: Email, Webhook, Discord, Slack
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ALERT_WEBHOOK = process.env.ALERT_WEBHOOK_URL; // Webhook Discord/Slack optionnel

interface SystemAlert {
  type: 'warning' | 'error' | 'critical';
  service: string;
  message: string;
  timestamp: string;
  details?: any;
}

// Historique des alertes (en mémoire, limité)
const recentAlerts: SystemAlert[] = [];
const MAX_ALERTS = 50;

/**
 * Envoie une alerte via webhook (Discord/Slack)
 */
async function sendWebhookAlert(alert: SystemAlert): Promise<boolean> {
  if (!ALERT_WEBHOOK) return false;
  
  try {
    const colors = {
      warning: 16776960, // Jaune
      error: 16711680,   // Rouge
      critical: 15548997 // Rouge foncé
    };
    
    // Format Discord
    const payload = {
      embeds: [{
        title: `🚨 Alerte Steo Élite - ${alert.type.toUpperCase()}`,
        description: alert.message,
        color: colors[alert.type],
        fields: [
          { name: 'Service', value: alert.service, inline: true },
          { name: 'Timestamp', value: alert.timestamp, inline: true }
        ],
        footer: { text: 'Steo Élite Monitoring' }
      }]
    };
    
    const response = await fetch(ALERT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    return response.ok;
  } catch (error) {
    console.error('Erreur envoi webhook:', error);
    return false;
  }
}

/**
 * Enregistre une alerte
 */
async function logAlert(alert: SystemAlert): Promise<void> {
  recentAlerts.unshift(alert);
  if (recentAlerts.length > MAX_ALERTS) {
    recentAlerts.pop();
  }
  
  // Envoyer via webhook si configuré
  await sendWebhookAlert(alert);
  
  console.log(`[ALERT][${alert.type}] ${alert.service}: ${alert.message}`);
}

/**
 * Vérifie la santé de Supabase
 */
async function checkSupabaseHealth(): Promise<{ healthy: boolean; message: string }> {
  const supabase = SUPABASE_URL && SUPABASE_KEY 
    ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
  
  if (!supabase) {
    return { healthy: false, message: 'Configuration Supabase manquante' };
  }
  
  try {
    // Test simple: compter les matchs
    const { count, error } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      return { healthy: false, message: `Erreur Supabase: ${error.message}` };
    }
    
    return { healthy: true, message: `${count} matchs en base` };
  } catch (error: any) {
    return { healthy: false, message: `Exception: ${error.message}` };
  }
}

/**
 * Vérifie l'API ESPN
 */
async function checkESPNHealth(): Promise<{ healthy: boolean; message: string }> {
  try {
    const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 60 }
    });
    
    if (!response.ok) {
      return { healthy: false, message: `ESPN API status: ${response.status}` };
    }
    
    const data = await response.json();
    const eventsCount = data.events?.length || 0;
    
    return { healthy: true, message: `${eventsCount} événements disponibles` };
  } catch (error: any) {
    return { healthy: false, message: `Exception: ${error.message}` };
  }
}

/**
 * Vérifie les limites Vercel (simulation)
 */
function checkVercelLimits(): { healthy: boolean; message: string; warnings: string[] } {
  const warnings: string[] = [];
  
  // Vérifier les variables d'environnement critiques
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    warnings.push('NEXT_PUBLIC_SUPABASE_URL manquant');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    warnings.push('SUPABASE_SERVICE_ROLE_KEY manquant');
  }
  
  // Vérifier la mémoire (approximatif)
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  
  if (heapUsedMB > 400) {
    warnings.push(`Usage mémoire élevé: ${heapUsedMB}MB`);
  }
  
  return {
    healthy: warnings.length === 0,
    message: warnings.length === 0 ? 'Toutes les ressources OK' : `${warnings.length} avertissement(s)`,
    warnings
  };
}

/**
 * GET - Vérification complète du système
 */
export async function GET(request: NextRequest) {
  const timestamp = new Date().toISOString();
  const checks: any = {};
  const alerts: SystemAlert[] = [];
  
  try {
    // 1. Vérifier Supabase
    const supabaseHealth = await checkSupabaseHealth();
    checks.supabase = supabaseHealth;
    
    if (!supabaseHealth.healthy) {
      alerts.push({
        type: 'error',
        service: 'Supabase',
        message: supabaseHealth.message,
        timestamp
      });
    }
    
    // 2. Vérifier ESPN
    const espnHealth = await checkESPNHealth();
    checks.espn = espnHealth;
    
    if (!espnHealth.healthy) {
      alerts.push({
        type: 'warning',
        service: 'ESPN API',
        message: espnHealth.message,
        timestamp
      });
    }
    
    // 3. Vérifier les limites Vercel
    const vercelHealth = checkVercelLimits();
    checks.vercel = vercelHealth;
    
    if (!vercelHealth.healthy) {
      alerts.push({
        type: 'warning',
        service: 'Vercel',
        message: vercelHealth.message,
        details: vercelHealth.warnings,
        timestamp
      });
    }
    
    // Envoyer les alertes
    for (const alert of alerts) {
      await logAlert(alert);
    }
    
    // Déterminer le statut global
    const allHealthy = Object.values(checks).every((c: any) => c.healthy);
    
    return NextResponse.json({
      success: true,
      timestamp,
      status: allHealthy ? 'healthy' : 'degraded',
      checks,
      alertsGenerated: alerts.length,
      recentAlerts: recentAlerts.slice(0, 10),
      recommendation: allHealthy 
        ? 'Système opérationnel' 
        : 'Vérifiez les services en erreur ci-dessus'
    });
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      timestamp,
      status: 'error',
      error: error.message
    }, { status: 500 });
  }
}

/**
 * POST - Déclencher une alerte manuelle
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, service, message, details } = body;
    
    if (!type || !service || !message) {
      return NextResponse.json({
        error: 'Champs requis: type, service, message'
      }, { status: 400 });
    }
    
    const alert: SystemAlert = {
      type: type as 'warning' | 'error' | 'critical',
      service,
      message,
      details,
      timestamp: new Date().toISOString()
    };
    
    await logAlert(alert);
    
    return NextResponse.json({
      success: true,
      message: 'Alerte envoyée',
      alert
    });
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
