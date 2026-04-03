/**
 * API de synchronisation forcée
 * Corrige la déconnexion entre store-predictions et stats_history
 *
 * POST /api/sync-all?secret=XXX
 */

import { NextRequest, NextResponse } from 'next/server';

const GITHUB_REPO = 'steohidy/my-project';
const GITHUB_BRANCH = 'master';
const CRON_SECRET = process.env.CRON_SECRET || 'steo-elite-cron-2026';

// Charger un fichier depuis GitHub
async function loadFromGitHub(path: string): Promise<any> {
  const res = await fetch(
    `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}`
  );
  if (res.ok) {
    return await res.json();
  }
  return null;
}

// Sauvegarder sur GitHub
async function saveToGitHub(path: string, data: any, message: string): Promise<{ success: boolean; error?: string }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { success: false, error: 'GITHUB_TOKEN non configuré' };
  }

  try {
    // Récupérer le SHA
    const getRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );

    let sha = '';
    if (getRes.ok) {
      const fileInfo = await getRes.json();
      sha = fileInfo.sha;
    }

    // Sauvegarder
    const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    const saveRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message,
          content,
          sha: sha || undefined,
          branch: GITHUB_BRANCH
        })
      }
    );

    if (saveRes.ok) {
      return { success: true };
    } else {
      const error = await saveRes.text();
      return { success: false, error };
    }
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function POST(request: NextRequest) {
  // Vérifier le secret
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');

  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  console.log('🔧 Début de la synchronisation forcée...');

  try {
    // 1. Charger toutes les sources de données
    const storePredictions = await loadFromGitHub('data/store-predictions.json');
    const statsHistory = await loadFromGitHub('data/stats_history.json');
    const mlResults = await loadFromGitHub('data/ml-results-tracking.json');

    console.log(`📥 Données chargées: ${storePredictions?.predictions?.length || 0} prédictions`);

    // 2. Extraire les résultats depuis stats_history
    const completedFromStats: Map<string, any> = new Map();

    if (statsHistory?.dailyStats) {
      for (const day of statsHistory.dailyStats) {
        if (day.predictions) {
          for (const pred of day.predictions) {
            if (pred.matchId && pred.result) {
              completedFromStats.set(pred.matchId, {
                matchId: pred.matchId,
                homeTeam: pred.homeTeam,
                awayTeam: pred.awayTeam,
                actualResult: pred.result,
                predictedResult: pred.prediction,
                resultMatch: pred.correct,
                date: day.date
              });
            }
          }
        }
      }
    }

    console.log(`📊 ${completedFromStats.size} résultats extraits de stats_history`);

    // 3. Construire les prédictions complétées
    const allPredictions: any[] = [];
    const now = new Date().toISOString();

    // Ajouter les prédictions existantes
    if (storePredictions?.predictions) {
      for (const pred of storePredictions.predictions) {
        const completed = completedFromStats.get(pred.matchId);
        if (completed) {
          // Mettre à jour avec les résultats
          allPredictions.push({
            ...pred,
            status: 'completed',
            actualResult: completed.actualResult,
            resultMatch: completed.resultMatch,
            checkedAt: completed.date
          });
          completedFromStats.delete(pred.matchId);
        } else {
          allPredictions.push(pred);
        }
      }
    }

    // Ajouter les prédictions de stats_history non présentes dans store
    for (const [matchId, pred] of completedFromStats) {
      allPredictions.push({
        matchId: pred.matchId,
        homeTeam: pred.homeTeam,
        awayTeam: pred.awayTeam,
        sport: 'Foot',
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

    // 4. Calculer les statistiques
    const completed = allPredictions.filter(p => p.status === 'completed');
    const pending = allPredictions.filter(p => p.status === 'pending');
    const wins = completed.filter(p => p.resultMatch === true);
    const losses = completed.filter(p => p.resultMatch === false);

    const bySport: any = {
      football: { total: 0, wins: 0, losses: 0, winRate: 0, details: { resultats: { total: 0, wins: 0, winRate: 0 }, buts: { total: 0, wins: 0, winRate: 0 }, btts: { total: 0, wins: 0, winRate: 0 } } },
      basketball: { total: 0, wins: 0, losses: 0, winRate: 0, details: { resultats: { total: 0, wins: 0, winRate: 0 }, buts: { total: 0, wins: 0, winRate: 0 }, btts: { total: 0, wins: 0, winRate: 0 } } },
      hockey: { total: 0, wins: 0, losses: 0, winRate: 0, details: { resultats: { total: 0, wins: 0, winRate: 0 }, buts: { total: 0, wins: 0, winRate: 0 }, btts: { total: 0, wins: 0, winRate: 0 } } }
    };

    for (const p of completed) {
      const sport = (p.sport || '').toLowerCase();
      let key: 'football' | 'basketball' | 'hockey' = 'football';
      if (sport.includes('basket') || sport.includes('nba')) key = 'basketball';
      else if (sport.includes('hockey') || sport.includes('nhl')) key = 'hockey';

      bySport[key].total++;
      bySport[key].details.resultats.total++;
      if (p.resultMatch === true) {
        bySport[key].wins++;
        bySport[key].details.resultats.wins++;
      } else {
        bySport[key].losses++;
      }
    }

    // Calculer winRates
    for (const sport of ['football', 'basketball', 'hockey'] as const) {
      if (bySport[sport].total > 0) {
        bySport[sport].winRate = Math.round((bySport[sport].wins / bySport[sport].total) * 100);
        bySport[sport].details.resultats.winRate = bySport[sport].winRate;
      }
    }

    const winRate = completed.length > 0 ? Math.round((wins.length / completed.length) * 100) : 0;

    console.log(`📈 Stats: ${wins.length}/${completed.length} = ${winRate}%`);

    // 5. Créer les nouvelles données
    const newStorePredictions = {
      predictions: allPredictions,
      lastUpdate: now,
      version: '3.0'
    };

    const newStatsHistory = {
      lastUpdate: now,
      version: '2.0',
      dailyStats: statsHistory?.dailyStats || [],
      summary: {
        total: completed.length,
        wins: wins.length,
        losses: losses.length,
        winRate,
        bySport
      }
    };

    // Mettre à jour les ML results
    const newMLResults = {
      picks: mlResults?.picks || [],
      dailyStats: mlResults?.dailyStats || [],
      weeklyRatio: winRate,
      last7Days: {
        total: completed.length,
        won: wins.length,
        ratio: winRate
      },
      lastUpdated: now,
      expertMLVisible: winRate >= 70 && completed.length >= 10
    };

    // 6. Sauvegarder
    const results: any = {};

    console.log('💾 Sauvegarde...');
    results.store = await saveToGitHub(
      'data/store-predictions.json',
      newStorePredictions,
      `🔧 Sync predictions: ${completed.length} complétées, ${pending.length} en attente`
    );

    results.stats = await saveToGitHub(
      'data/stats_history.json',
      newStatsHistory,
      `📊 Sync stats: ${wins.length}/${completed.length} = ${winRate}%`
    );

    results.ml = await saveToGitHub(
      'data/ml-results-tracking.json',
      newMLResults,
      `🧠 Sync ML: ${winRate}% win rate`
    );

    console.log('✅ Synchronisation terminée');

    return NextResponse.json({
      success: true,
      timestamp: now,
      stats: {
        total: allPredictions.length,
        completed: completed.length,
        pending: pending.length,
        wins: wins.length,
        losses: losses.length,
        winRate,
        bySport: {
          football: `${bySport.football.wins}/${bySport.football.total} = ${bySport.football.winRate}%`,
          basketball: `${bySport.basketball.wins}/${bySport.basketball.total} = ${bySport.basketball.winRate}%`,
          hockey: `${bySport.hockey.wins}/${bySport.hockey.total} = ${bySport.hockey.winRate}%`
        }
      },
      saved: {
        store: results.store.success,
        stats: results.stats.success,
        ml: results.ml.success
      },
      errors: [results.store.error, results.stats.error, results.ml.error].filter(Boolean)
    });

  } catch (error: any) {
    console.error('❌ Erreur:', error);
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

  try {
    const storePredictions = await loadFromGitHub('data/store-predictions.json');
    const statsHistory = await loadFromGitHub('data/stats_history.json');

    const completed = (storePredictions?.predictions || []).filter((p: any) => p.status === 'completed');
    const pending = (storePredictions?.predictions || []).filter((p: any) => p.status === 'pending');
    const wins = completed.filter((p: any) => p.resultMatch === true);

    return NextResponse.json({
      storePredictions: {
        total: storePredictions?.predictions?.length || 0,
        completed: completed.length,
        pending: pending.length,
        wins: wins.length
      },
      statsHistory: {
        version: statsHistory?.version,
        dailyStats: statsHistory?.dailyStats?.length || 0,
        summary: statsHistory?.summary
      },
      needsSync: completed.length === 0 && statsHistory?.dailyStats?.length > 0
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
