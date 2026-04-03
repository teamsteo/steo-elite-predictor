/**
 * Stats Updater - Met à jour stats_history.json depuis les pronostics vérifiés
 * Ce module synchronise les statistiques avec les résultats réels
 * 
 * VERSION 2.0 - GitHub désactivé par défaut
 * Les stats sont stockées dans Supabase (table stats_history)
 */

import { isGitHubEnabled, GITHUB_CONFIG } from './github-config';
import SupabaseStore from './db-supabase';

// Interfaces
interface Prediction {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport: string;
  matchDate: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  predictedResult: string;
  predictedGoals?: string;
  confidence: string;
  riskPercentage: number;
  homeScore?: number;
  awayScore?: number;
  totalGoals?: number;
  actualResult?: string;
  status: 'pending' | 'completed' | 'cancelled' | 'postponed' | 'won' | 'lost';
  resultMatch?: boolean;
  goalsMatch?: boolean;
  cardsMatch?: boolean;
  createdAt: string;
  checkedAt?: string;
}

interface DailyStats {
  date: string;
  stats: {
    total: number;
    completed: number;
    wins: number;
    losses: number;
    winRate: number;
    bySport: {
      football: SportStats;
      basketball: SportStats;
      hockey: SportStats;
    };
  };
  predictions: Array<{
    matchId: string;
    homeTeam: string;
    awayTeam: string;
    sport: string;
    predictedResult: string;
    actualResult?: string;
    resultMatch?: boolean;
    homeScore?: number;
    awayScore?: number;
  }>;
}

interface SportStats {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  details: {
    resultats: { total: number; wins: number; winRate: number };
    buts: { total: number; wins: number; winRate: number };
    btts: { total: number; wins: number; winRate: number };
  };
}

interface StatsHistory {
  lastUpdate: string;
  version: string;
  dailyStats: DailyStats[];
  summary: {
    total: number;
    wins: number;
    losses: number;
    winRate: number;
    bySport: {
      football: SportStats;
      basketball: SportStats;
      hockey: SportStats;
    };
    expertAdvisor: {
      total: number;
      wins: number;
      winRate: number;
    } | null;
  };
}

// Normaliser le sport
function normalizeSport(sport: string): 'football' | 'basketball' | 'hockey' | 'other' {
  const s = sport.toLowerCase();
  if (s.includes('foot') || s.includes('soccer')) return 'football';
  if (s.includes('basket') || s.includes('nba')) return 'basketball';
  if (s.includes('hockey') || s.includes('nhl')) return 'hockey';
  return 'other';
}

// Créer des stats vides pour un sport
function createEmptySportStats(): SportStats {
  return {
    total: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    details: {
      resultats: { total: 0, wins: 0, winRate: 0 },
      buts: { total: 0, wins: 0, winRate: 0 },
      btts: { total: 0, wins: 0, winRate: 0 }
    }
  };
}

// Calculer les stats pour une liste de prédictions
function calculateStats(predictions: Prediction[]): {
  total: number;
  completed: number;
  wins: number;
  losses: number;
  winRate: number;
  bySport: { football: SportStats; basketball: SportStats; hockey: SportStats };
} {
  const completed = predictions.filter(p => p.status === 'completed' || p.status === 'won' || p.status === 'lost');
  const wins = completed.filter(p => p.resultMatch === true || p.status === 'won');
  const losses = completed.filter(p => p.resultMatch === false || p.status === 'lost');

  // Stats par sport
  const bySport = {
    football: createEmptySportStats(),
    basketball: createEmptySportStats(),
    hockey: createEmptySportStats()
  };

  for (const p of completed) {
    const sportKey = normalizeSport(p.sport);
    if (sportKey === 'other') continue;

    // Stats globales du sport
    bySport[sportKey].total++;
    if (p.resultMatch === true || p.status === 'won') {
      bySport[sportKey].wins++;
    } else if (p.resultMatch === false || p.status === 'lost') {
      bySport[sportKey].losses++;
    }

    // Stats détaillées par type de pari
    // Résultats (1X2)
    if (p.predictedResult && p.actualResult) {
      bySport[sportKey].details.resultats.total++;
      if (p.resultMatch === true || p.status === 'won') {
        bySport[sportKey].details.resultats.wins++;
      }
    }

    // Buts (Over/Under)
    if (p.goalsMatch !== undefined) {
      bySport[sportKey].details.buts.total++;
      if (p.goalsMatch === true) {
        bySport[sportKey].details.buts.wins++;
      }
    }

    // BTTS (Les deux équipes marquent)
    if (p.predictedGoals?.toLowerCase().includes('btts') && p.homeScore !== undefined && p.awayScore !== undefined) {
      const bttsResult = p.homeScore > 0 && p.awayScore > 0;
      bySport[sportKey].details.btts.total++;
      if (p.goalsMatch === true || bttsResult) {
        bySport[sportKey].details.btts.wins++;
      }
    }
  }

  // Calculer les winRates
  for (const sport of ['football', 'basketball', 'hockey'] as const) {
    if (bySport[sport].total > 0) {
      bySport[sport].winRate = Math.round((bySport[sport].wins / bySport[sport].total) * 100);
    }
    if (bySport[sport].details.resultats.total > 0) {
      bySport[sport].details.resultats.winRate = Math.round(
        (bySport[sport].details.resultats.wins / bySport[sport].details.resultats.total) * 100
      );
    }
    if (bySport[sport].details.buts.total > 0) {
      bySport[sport].details.buts.winRate = Math.round(
        (bySport[sport].details.buts.wins / bySport[sport].details.buts.total) * 100
      );
    }
    if (bySport[sport].details.btts.total > 0) {
      bySport[sport].details.btts.winRate = Math.round(
        (bySport[sport].details.btts.wins / bySport[sport].details.btts.total) * 100
      );
    }
  }

  return {
    total: predictions.length,
    completed: completed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: completed.length > 0 ? Math.round((wins.length / completed.length) * 100) : 0,
    bySport
  };
}

// Charger les stats existantes depuis Supabase (priorité) ou GitHub (fallback désactivé)
async function loadStatsHistory(): Promise<StatsHistory | null> {
  // GitHub désactivé par défaut pour éviter le blocage
  if (!isGitHubEnabled()) {
    console.log('📊 Stats: GitHub désactivé, utilisation de Supabase');
    // Les stats sont maintenant calculées en temps réel depuis Supabase
    return null;
  }

  const token = GITHUB_CONFIG.token;

  // Essayer d'abord avec l'API GitHub (pour les repos privés)
  if (token) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_CONFIG.repo}/contents/data/stats_history.json?ref=${GITHUB_CONFIG.branch}`,
        { 
          headers: { 
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.raw'
          },
          next: { revalidate: 0 }
        }
      );
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.log('⚠️ Impossible de charger stats_history API GitHub:', e);
    }
  }

  // Fallback: essayer raw.githubusercontent.com
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/data/stats_history.json`,
      { next: { revalidate: 0 } }
    );
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.log('⚠️ Impossible de charger stats_history:', e);
  }
  return null;
}

// Sauvegarder les stats sur GitHub (désactivé par défaut)
async function saveStatsHistory(stats: StatsHistory): Promise<boolean> {
  // GitHub désactivé par défaut
  if (!isGitHubEnabled()) {
    console.log('📊 Stats: GitHub désactivé, stats non sauvegardées sur GitHub');
    return true; // On retourne true car ce n'est pas une erreur
  }

  const token = GITHUB_CONFIG.token;
  if (!token) {
    console.warn('⚠️ GITHUB_TOKEN non configuré - stats non sauvegardées');
    return false;
  }

  try {
    // Récupérer le SHA du fichier existant
    const getRes = await fetch(
      `https://api.github.com/repos/${GITHUB_CONFIG.repo}/contents/data/stats_history.json`,
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
    const content = Buffer.from(JSON.stringify(stats, null, 2)).toString('base64');
    const saveRes = await fetch(
      `https://api.github.com/repos/${GITHUB_CONFIG.repo}/contents/data/stats_history.json`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `📊 MAJ stats_history ${new Date().toLocaleString('fr-FR')}`,
          content,
          sha: sha || undefined,
          branch: GITHUB_CONFIG.branch
        })
      }
    );

    if (saveRes.ok) {
      console.log('✅ Stats_history sauvegardées sur GitHub');
      return true;
    } else {
      console.error('❌ Erreur sauvegarde stats_history:', await saveRes.text());
      return false;
    }
  } catch (e) {
    console.error('❌ Erreur sauvegarde stats_history:', e);
    return false;
  }
}

/**
 * Mettre à jour stats_history.json depuis les prédictions
 * Cette fonction est appelée par le cron après vérification des résultats
 */
export async function updateStatsHistory(predictions: Prediction[]): Promise<{
  success: boolean;
  stats: StatsHistory | null;
  message: string;
}> {
  console.log('📊 Mise à jour des statistiques...');

  try {
    // Charger les stats existantes
    const existingStats = await loadStatsHistory();

    // Grouper les prédictions par jour
    const predictionsByDate = new Map<string, Prediction[]>();
    for (const p of predictions) {
      const date = p.matchDate.split('T')[0];
      if (!predictionsByDate.has(date)) {
        predictionsByDate.set(date, []);
      }
      predictionsByDate.get(date)!.push(p);
    }

    // Créer les stats quotidiennes
    const dailyStats: DailyStats[] = [];
    const sortedDates = Array.from(predictionsByDate.keys()).sort();

    for (const date of sortedDates) {
      const dayPredictions = predictionsByDate.get(date)!;
      const stats = calculateStats(dayPredictions);

      // Ne pas inclure les jours sans pronostics terminés
      if (stats.completed === 0) continue;

      dailyStats.push({
        date,
        stats,
        predictions: dayPredictions
          .filter(p => p.status === 'completed' || p.status === 'won' || p.status === 'lost')
          .map(p => ({
            matchId: p.matchId,
            homeTeam: p.homeTeam,
            awayTeam: p.awayTeam,
            sport: p.sport,
            predictedResult: p.predictedResult,
            actualResult: p.actualResult,
            resultMatch: p.resultMatch,
            homeScore: p.homeScore,
            awayScore: p.awayScore
          }))
      });
    }

    // Calculer les stats globales
    const allCompleted = predictions.filter(p => p.status === 'completed' || p.status === 'won' || p.status === 'lost');
    const allWins = allCompleted.filter(p => p.resultMatch === true || p.status === 'won');

    const newStatsHistory: StatsHistory = {
      lastUpdate: new Date().toISOString(),
      version: '2.0',
      dailyStats,
      summary: {
        total: allCompleted.length,
        wins: allWins.length,
        losses: allCompleted.length - allWins.length,
        winRate: allCompleted.length > 0
          ? Math.round((allWins.length / allCompleted.length) * 100)
          : 0,
        bySport: calculateStats(allCompleted).bySport,
        expertAdvisor: existingStats?.summary?.expertAdvisor || null
      }
    };

    // Sauvegarder sur GitHub (si activé)
    const saved = await saveStatsHistory(newStatsHistory);

    return {
      success: true, // Toujours true car les stats sont calculées
      stats: newStatsHistory,
      message: `✅ Stats mises à jour: ${allCompleted.length} pronostics, ${allWins.length} gagnés (${newStatsHistory.summary.winRate}%)`
    };

  } catch (error: any) {
    console.error('❌ Erreur mise à jour stats:', error);
    return {
      success: false,
      stats: null,
      message: `Erreur: ${error.message}`
    };
  }
}

/**
 * Forcer la mise à jour des stats (pour appel manuel)
 */
export async function forceUpdateStats(): Promise<{
  success: boolean;
  message: string;
}> {
  // Cette fonction sera appelée depuis l'API
  // Elle doit charger les prédictions depuis PredictionStore puis mettre à jour
  const { PredictionStore } = await import('./store');
  const predictions = await PredictionStore.getAllAsync();
  const result = await updateStatsHistory(predictions);
  return result;
}

const statsUpdater = {
  updateStatsHistory,
  forceUpdateStats
};

export default statsUpdater;
