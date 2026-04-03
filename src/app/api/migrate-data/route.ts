/**
 * API Migration - Charge les données JSON depuis GitHub vers Supabase
 * Usage: /api/migrate-data?secret=steo-elite-cron-2026
 */

import { NextRequest, NextResponse } from 'next/server';
import SupabaseStore from '@/lib/db-supabase';

const CRON_SECRET = process.env.CRON_SECRET || 'steo-elite-cron-2026';
const GITHUB_REPO = 'steohidy/my-project';
const GITHUB_BRANCH = 'master';

// Charger un fichier JSON depuis GitHub
async function loadFromGitHub(path: string): Promise<any> {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Normaliser le sport
function normalizeSport(sport: string): string {
  const s = sport?.toLowerCase() || '';
  if (s.includes('foot') || s.includes('soccer')) return 'football';
  if (s.includes('basket') || s.includes('nba')) return 'basketball';
  if (s.includes('hockey') || s.includes('nhl')) return 'hockey';
  if (s.includes('tennis')) return 'tennis';
  return 'other';
}

// Normaliser le résultat
function normalizeResult(result: string): string {
  const r = result?.toLowerCase() || '';
  if (r === 'home' || r === '1' || r === 'h') return 'home';
  if (r === 'draw' || r === 'x' || r === 'nul') return 'draw';
  if (r === 'away' || r === '2' || r === 'a') return 'away';
  if (r.includes('over')) return 'over';
  if (r.includes('under')) return 'under';
  if (r.includes('btts') && r.includes('yes')) return 'btts_yes';
  if (r.includes('btts') && r.includes('no')) return 'btts_no';
  return 'avoid';
}

// Normaliser la confiance
function normalizeConfidence(confidence: string): string {
  const c = confidence?.toLowerCase() || '';
  if (c.includes('very') || c.includes('tres')) return 'very_high';
  if (c.includes('high') || c.includes('haute')) return 'high';
  if (c.includes('medium') || c.includes('moyenne')) return 'medium';
  return 'low';
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');
  
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  console.log('🚀 Début de la migration JSON → Supabase');
  const startTime = Date.now();

  try {
    // 1. Charger les données depuis GitHub
    console.log('📥 Chargement des fichiers depuis GitHub...');
    
    const [storeData, mlTraining, statsHistory] = await Promise.all([
      loadFromGitHub('data/store-predictions.json'),
      loadFromGitHub('data/ml-training-report.json'),
      loadFromGitHub('data/stats_history.json')
    ]);

    const results = {
      predictions: 0,
      patterns: 0,
      dailyStats: 0
    };

    // 2. Migrer les prédictions
    if (storeData?.predictions && storeData.predictions.length > 0) {
      console.log(`📊 Migration de ${storeData.predictions.length} prédictions...`);
      
      const records: any[] = storeData.predictions.map((p: any) => ({
        match_id: p.matchId || `migrated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        home_team: p.homeTeam || 'Unknown',
        away_team: p.awayTeam || 'Unknown',
        league: p.league || 'Unknown',
        sport: normalizeSport(p.sport),
        match_date: p.matchDate || p.createdAt || new Date().toISOString(),
        odds_home: p.oddsHome || 1.0,
        odds_draw: p.oddsDraw || null,
        odds_away: p.oddsAway || 1.0,
        predicted_result: normalizeResult(p.predictedResult),
        predicted_goals: p.predictedGoals || null,
        confidence: normalizeConfidence(p.confidence),
        risk_percentage: p.riskPercentage || 50,
        home_score: p.homeScore ?? null,
        away_score: p.awayScore ?? null,
        total_goals: p.totalGoals ?? null,
        actual_result: p.actualResult ? normalizeResult(p.actualResult) : null,
        status: p.status || 'pending',
        result_match: p.resultMatch ?? null,
        source: 'migration'
      }));

      // Insert via SupabaseStore
      const inserted = await SupabaseStore.addPredictions(records);
      results.predictions = inserted;
      
      console.log(`   ✅ ${results.predictions} prédictions migrées`);
    }

    // 3. Stats patterns
    if (mlTraining?.patterns) {
      results.patterns = mlTraining.patterns.length;
    }

    // 4. Stats journalières
    if (statsHistory?.dailyStats) {
      results.dailyStats = statsHistory.dailyStats.length;
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Migration terminée en ${duration}ms`);

    // 5. Vérifier le résultat
    const finalStats = await SupabaseStore.getStats();

    return NextResponse.json({
      success: true,
      message: `Migration terminée: ${results.predictions} prédictions migrées`,
      duration: `${duration}ms`,
      migrated: results,
      database: finalStats
    });

  } catch (error: any) {
    console.error('❌ Erreur migration:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
