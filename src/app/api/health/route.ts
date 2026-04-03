/**
 * Health Check API - Point de contrôle pour le monitoring
 * GET /api/health
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const timestamp = new Date().toISOString();
  const checks: Record<string, { status: string; message?: string; latency?: number }> = {};

  // 1. Vérifier Supabase
  const supabaseStart = Date.now();
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      checks.supabase = { status: 'error', message: 'Variables manquantes' };
    } else {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
      
      const { count, error } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true });
      
      const latency = Date.now() - supabaseStart;
      
      if (error) {
        checks.supabase = { status: 'error', message: error.message, latency };
      } else {
        checks.supabase = { status: 'ok', message: `${count} matchs`, latency };
      }
    }
  } catch (e: any) {
    checks.supabase = { status: 'error', message: e.message, latency: Date.now() - supabaseStart };
  }

  // 2. Vérifier ESPN
  const espnStart = Date.now();
  try {
    const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 60 }
    });
    
    const latency = Date.now() - espnStart;
    
    if (response.ok) {
      checks.espn = { status: 'ok', latency };
    } else {
      checks.espn = { status: 'error', message: `HTTP ${response.status}`, latency };
    }
  } catch (e: any) {
    checks.espn = { status: 'error', message: e.message, latency: Date.now() - espnStart };
  }

  // 3. Vérifier la mémoire
  const mem = process.memoryUsage();
  checks.memory = {
    status: mem.heapUsed < 300 * 1024 * 1024 ? 'ok' : 'warning',
    message: `${Math.round(mem.heapUsed / 1024 / 1024)}MB utilisé`
  };

  // 4. Vérifier les variables d'environnement
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  ];
  
  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  checks.env = {
    status: missingVars.length === 0 ? 'ok' : 'error',
    message: missingVars.length === 0 ? 'Toutes les variables présentes' : `Manquantes: ${missingVars.join(', ')}`
  };

  // Statut global
  const allOk = Object.values(checks).every(c => c.status === 'ok');
  const hasError = Object.values(checks).some(c => c.status === 'error');
  
  const status = hasError ? 'unhealthy' : allOk ? 'healthy' : 'degraded';

  return NextResponse.json({
    status,
    timestamp,
    version: '2026.04.03-v1',
    app: 'Steo Élite Sports Predictor',
    checks
  }, { 
    status: status === 'unhealthy' ? 503 : 200 
  });
}
