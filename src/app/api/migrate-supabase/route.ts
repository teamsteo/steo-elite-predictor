/**
 * API de migration vers Supabase
 * Migre les données JSON vers la base de données Supabase
 *
 * POST /api/migrate-supabase?secret=XXX
 */

import { NextRequest, NextResponse } from 'next/server';
import { SupabaseStore } from '@/lib/db-supabase';

const CRON_SECRET = process.env.CRON_SECRET || 'steo-elite-cron-2026';
const GITHUB_REPO = 'steohidy/my-project';
const GITHUB_BRANCH = 'master';

async function loadFromGitHub(path: string): Promise<any> {
  const res = await fetch(
    `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}`
  );
  if (res.ok) return await res.json();
  return null;
}

// Liste des équipes NBA pour la détection automatique
const NBA_TEAMS = [
  'Thunder', 'Lakers', 'Celtics', 'Warriors', 'Nets', 'Knicks', 'Heat', 'Bucks',
  '76ers', 'Mavericks', 'Nuggets', 'Clippers', 'Suns', 'Grizzlies', 'Cavaliers',
  'Raptors', 'Kings', 'Jazz', 'Timberwolves', 'Pelicans', 'Trail Blazers', 'Spurs',
  'Magic', 'Pacers', 'Hornets', 'Pistons', 'Hawks', 'Bulls', 'Wizards', 'Rockets',
  'Sixers', 'Blazers'
];

function detectNBATeam(teamName: string): boolean {
  for (const team of NBA_TEAMS) {
    if (teamName.includes(team)) return true;
  }
  return false;
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');

  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  console.log('🔄 Début de la migration vers Supabase...');

  try {
    // 1. Vérifier que Supabase est disponible
    const available = await SupabaseStore.isAvailable();
    if (!available) {
      return NextResponse.json({
        success: false,
        error: 'Supabase non disponible - vérifiez les variables d\'environnement',
        required: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
      }, { status: 500 });
    }

    // 2. Charger les données depuis GitHub
    console.log('📥 Chargement des données JSON...');
    const storePredictions = await loadFromGitHub('data/store-predictions.json');
    const statsHistory = await loadFromGitHub('data/stats_history.json');

    const predictions = storePredictions?.predictions || [];
    const dailyStats = statsHistory?.dailyStats || [];

    console.log(`   ${predictions.length} prédictions dans store-predictions.json`);
    console.log(`   ${dailyStats.length} jours de stats dans stats_history.json`);

    // 3. Extraire les résultats depuis stats_history avec détection NBA
    const completedFromStats: Map<string, any> = new Map();

    for (const day of dailyStats) {
      if (day.predictions) {
        for (const pred of day.predictions) {
          if (pred.matchId && pred.result) {
            const homeTeam = pred.homeTeam || '';
            const awayTeam = pred.awayTeam || '';

            // Détecter le sport
            let sport = 'football';
            if (detectNBATeam(homeTeam) || detectNBATeam(awayTeam)) {
              sport = 'basketball';
            }

            completedFromStats.set(pred.matchId, {
              matchId: pred.matchId,
              homeTeam: pred.homeTeam,
              awayTeam: pred.awayTeam,
              actualResult: pred.result,
              predictedResult: pred.prediction,
              resultMatch: pred.correct,
              date: day.date,
              sport
            });
          }
        }
      }
    }

    console.log(`📊 ${completedFromStats.size} résultats extraits de stats_history`);

    // 4. Construire la liste complète des prédictions
    const allPredictions: any[] = [];

    // Ajouter les prédictions existantes
    for (const pred of predictions) {
      const completed = completedFromStats.get(pred.matchId);
      if (completed) {
        allPredictions.push({
          ...pred,
          status: 'completed',
          actualResult: completed.actualResult,
          resultMatch: completed.resultMatch,
          sport: completed.sport,
          checkedAt: completed.date
        });
        completedFromStats.delete(pred.matchId);
      } else {
        // Détecter NBA pour les prédictions en attente
        let sport = pred.sport;
        if (detectNBATeam(pred.homeTeam) || detectNBATeam(pred.awayTeam)) {
          sport = 'basketball';
        }
        allPredictions.push({ ...pred, sport });
      }
    }

    // Ajouter les prédictions de stats_history non présentes dans store
    for (const [matchId, pred] of completedFromStats) {
      allPredictions.push({
        matchId: pred.matchId,
        homeTeam: pred.homeTeam,
        awayTeam: pred.awayTeam,
        sport: pred.sport,
        league: 'Unknown',
        matchDate: pred.date,
        oddsHome: 1.0,
        oddsDraw: null,
        oddsAway: 1.0,
        predictedResult: pred.predictedResult,
        confidence: 'medium',
        riskPercentage: 50,
        status: 'completed',
        actualResult: pred.actualResult,
        resultMatch: pred.resultMatch,
        createdAt: pred.date,
        checkedAt: pred.date
      });
    }

    // 5. Migrer vers Supabase
    console.log('💾 Migration vers Supabase...');
    const migrated = await SupabaseStore.migrateFromJSON(allPredictions);

    // 6. Calculer les stats
    const stats = await SupabaseStore.getStats();

    console.log(`✅ Migration terminée: ${migrated} prédictions migrées`);

    return NextResponse.json({
      success: true,
      migrated,
      stats: {
        total: stats.total,
        completed: stats.completed,
        wins: stats.wins,
        losses: stats.losses,
        winRate: stats.winRate,
        bySport: stats.bySport
      },
      details: {
        fromStore: predictions.length,
        fromStatsHistory: completedFromStats.size,
        total: allPredictions.length
      }
    });

  } catch (error: any) {
    console.error('❌ Erreur migration:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

// GET pour vérifier le status
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');

  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const available = await SupabaseStore.isAvailable();

  if (!available) {
    return NextResponse.json({
      available: false,
      message: 'Supabase non configuré',
      required: [
        'NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_ANON_KEY'
      ]
    });
  }

  const stats = await SupabaseStore.getStats();

  return NextResponse.json({
    available: true,
    stats
  });
}
