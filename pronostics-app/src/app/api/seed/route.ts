import { NextResponse } from 'next/server';
import PredictionStore from '@/lib/store';
import fs from 'fs';
import path from 'path';

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
      error: error.message
    }, { status: 500 });
  }
}

/**
 * POST - Actions de maintenance
 */
export async function POST(request: Request) {
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
      error: error.message
    }, { status: 500 });
  }
}
