import { NextResponse } from 'next/server';
import PredictionStore from '@/lib/store';
import fs from 'fs';
import path from 'path';
import { timingSafeEqual } from '@/lib/timingSafeEqual';

const CRON_SECRET = process.env.CRON_SECRET;
if (!CRON_SECRET) {
  console.error('[SECURITY] CRON_SECRET non configuré - endpoints write désactivés');
}

function verifyRequestAuth(request: Request): boolean {
  if (!CRON_SECRET) return false;
  const url = new URL(request.url);
  const urlSecret = url.searchParams.get('secret') || '';
  const authHeader = request.headers.get('authorization') || '';
  if (timingSafeEqual(urlSecret, CRON_SECRET)) return true;
  if (timingSafeEqual(authHeader, `Bearer ${CRON_SECRET}`)) return true;
  return false;
}

const DATA_FILE = path.join(process.cwd(), 'data', 'predictions.json');

/**
 * GET - Infos du stockage
 */
export async function GET() {
  try {
    const info = PredictionStore.getInfo();
    const stats = PredictionStore.getStats();
    
    return NextResponse.json({
      success: true,
      message: '✅ Stockage fichier opérationnel',
      storage: 'Fichier JSON persistant',
      info,
      stats
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: 'Erreur interne serveur',
      code: 'SEED_INFO_FAILED'
    }, { status: 500 });
  }
}

/**
 * POST - Actions de maintenance
 */
export async function POST(request: Request) {
  if (!verifyRequestAuth(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { action } = body;
    
    if (action === 'cleanup') {
      const deleted = PredictionStore.cleanup();
      return NextResponse.json({
        success: true,
        message: `${deleted} anciens pronostics supprimés`
      });
    }
    
    if (action === 'clear_all') {
      // Réinitialiser le stockage
      if (fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({ predictions: [], lastUpdate: new Date().toISOString() }));
      }
      
      return NextResponse.json({
        success: true,
        message: 'Toutes les données ont été supprimées'
      });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Action non reconnue'
    }, { status: 400 });
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: 'Erreur interne serveur',
      code: 'SEED_OPERATION_FAILED'
    }, { status: 500 });
  }
}
