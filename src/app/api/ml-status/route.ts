/**
 * API pour vérifier le statut de l'Expert ML
 * 
 * GET /api/ml-status
 * Retourne le ratio de réussite et si l'onglet doit être visible
 */

import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const ML_RESULTS_FILE = path.join(DATA_DIR, 'ml-results-tracking.json');

interface MLStatus {
  visible: boolean;
  weeklyRatio: number;
  last7Days: {
    total: number;
    won: number;
    ratio: number;
  };
  lastUpdated: string;
  message: string;
}

export async function GET() {
  try {
    if (!fs.existsSync(ML_RESULTS_FILE)) {
      return NextResponse.json({
        visible: false,
        weeklyRatio: 0,
        last7Days: { total: 0, won: 0, ratio: 0 },
        lastUpdated: new Date().toISOString(),
        message: 'Expert ML en mode apprentissage - Aucune donnée disponible'
      } as MLStatus);
    }
    
    const data = JSON.parse(fs.readFileSync(ML_RESULTS_FILE, 'utf-8'));
    
    const status: MLStatus = {
      visible: data.expertMLVisible || false,
      weeklyRatio: data.weeklyRatio || 0,
      last7Days: data.last7Days || { total: 0, won: 0, ratio: 0 },
      lastUpdated: data.lastUpdated || new Date().toISOString(),
      message: data.expertMLVisible 
        ? `Expert ML actif - ${data.last7Days.won}/${data.last7Days.total} réussis (${data.last7Days.ratio}%)`
        : `Expert ML en apprentissage - ${data.last7Days.won}/${data.last7Days.total} réussis (${data.last7Days.ratio}%) - Besoin: 70%+ et 10+ pronostics`
    };
    
    return NextResponse.json(status);
    
  } catch (error) {
    console.error('Erreur lecture ML status:', error);
    return NextResponse.json({
      visible: false,
      weeklyRatio: 0,
      last7Days: { total: 0, won: 0, ratio: 0 },
      lastUpdated: new Date().toISOString(),
      message: 'Erreur lors de la lecture du statut ML'
    } as MLStatus, { status: 500 });
  }
}
