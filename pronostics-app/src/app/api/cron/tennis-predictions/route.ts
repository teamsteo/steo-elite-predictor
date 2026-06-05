/**
 * CRON Tennis Predictions - Endpoint pour publication automatique
 * 
 * Ce fichier est appelé par:
 * 1. Vercel Cron Jobs
 * 2. GitHub Actions (schedule)
 * 3. Appel manuel via API
 * 
 * Fréquence recommandée:
 * - Quotidien à 8h00 UTC: publication du résumé
 * - Toutes les 2h: vérification value bets
 */

import { NextRequest, NextResponse } from 'next/server';
import { publishTopPredictions, publishValueBetAlert } from '@/lib/tennis-telegram-publisher';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// CONFIGURATION
// ============================================

const DATA_DIR = path.join(process.cwd(), 'data');
const PREDICTIONS_FILE = path.join(DATA_DIR, 'tennis-predictions.json');
const LAST_RUN_FILE = path.join(DATA_DIR, 'cron-last-run.json');

const CRON_SECRET = process.env.CRON_SECRET || 'tennis-ml-2026';

// ============================================
// HELPER FUNCTIONS
// ============================================

function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const urlSecret = new URL(request.url).searchParams.get('secret');
  
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;
  if (urlSecret === CRON_SECRET) return true;
  
  return false;
}

function loadPredictions(): any[] {
  try {
    if (fs.existsSync(PREDICTIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf-8'));
      return data.predictions || [];
    }
  } catch (error) {
    console.error('Error loading predictions:', error);
  }
  return [];
}

function saveLastRun(type: string, success: boolean, details: any): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    const data = {
      lastRun: new Date().toISOString(),
      type,
      success,
      details,
    };
    
    fs.writeFileSync(LAST_RUN_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving last run:', error);
  }
}

// ============================================
// CRON HANDLERS
// ============================================

async function handleDailyPublish(): Promise<{ success: boolean; published: number; message: string }> {
  console.log('🎾 Starting daily tennis predictions publish...');
  
  try {
    const published = await publishTopPredictions(5);
    
    return {
      success: true,
      published,
      message: `Published ${published} messages`,
    };
  } catch (error: any) {
    return {
      success: false,
      published: 0,
      message: `Error: ${error.message}`,
    };
  }
}

async function handleValueBetsCheck(): Promise<{ success: boolean; alerts: number; message: string }> {
  console.log('🎾 Checking for value bets...');
  
  const predictions = loadPredictions();
  let alerts = 0;
  
  const valueBets = predictions.filter(
    (p: any) => p.betting?.recommendedBet && p.betting?.expectedValue >= 10
  );
  
  for (const pred of valueBets.slice(0, 3)) {
    const success = await publishValueBetAlert(pred);
    if (success) alerts++;
    
    // Pause pour éviter rate limiting
    await new Promise(r => setTimeout(r, 500));
  }
  
  return {
    success: true,
    alerts,
    message: `Sent ${alerts} value bet alerts`,
  };
}

async function handleRefreshPredictions(): Promise<{ success: boolean; message: string }> {
  console.log('🎾 Refreshing predictions...');
  
  // Cette fonction peut appeler le script de pré-calcul
  // Pour l'instant, on retourne un message
  return {
    success: true,
    message: 'Predictions refresh triggered',
  };
}

// ============================================
// MAIN HANDLER
// ============================================

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  // Vérifier l'authentification
  if (!verifyAuth(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'daily';
  
  console.log(`🎾 CRON Tennis: ${action}`);
  
  let result;
  
  switch (action) {
    case 'daily':
      result = await handleDailyPublish();
      break;
    
    case 'valuebets':
      result = await handleValueBetsCheck();
      break;
    
    case 'refresh':
      result = await handleRefreshPredictions();
      break;
    
    default:
      return NextResponse.json(
        { error: 'Invalid action. Use: daily, valuebets, refresh' },
        { status: 400 }
      );
  }
  
  const duration = Date.now() - startTime;
  
  saveLastRun(action, result.success, result);
  
  return NextResponse.json({
    action,
    ...result,
    duration: `${duration}ms`,
    timestamp: new Date().toISOString(),
  });
}

// Support POST pour les webhooks
export async function POST(request: NextRequest) {
  return GET(request);
}
