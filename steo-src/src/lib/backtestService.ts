/**
 * Backtest Service - Système de backtesting automatique
 * 
 * Compare les prédictions ML vs hasard (coin flip) pour mesurer
 * la valeur réelle ajoutée par le modèle.
 * 
 * Exécution: chaque dimanche à 05:30 UTC via cron
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type GenericSupabaseClient = SupabaseClient<any, any, any>;

function getSupabase(): GenericSupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export interface BacktestResult {
  period: string;
  totalPredictions: number;
  mlCorrect: number;
  mlWinRate: number;
  randomCorrect: number;
  randomWinRate: number;
  edge: number; // ML win rate - Random win rate
  roi: number; // ROI simulé
  bySport: Record<string, {
    total: number;
    mlWinRate: number;
    randomWinRate: number;
    edge: number;
    roi: number;
  }>;
  byConfidence: Record<string, {
    total: number;
    mlWinRate: number;
    edge: number;
    roi: number;
  }>;
  verdict: 'excellent' | 'bon' | 'moyen' | 'faible' | 'nul';
  verdictEmoji: string;
  summary: string;
}

/**
 * Exécute un backtest complet sur les N derniers jours
 */
export async function runBacktest(days = 30): Promise<BacktestResult> {
  const supabase = getSupabase();
  
  const defaultResult: BacktestResult = {
    period: `${days}d`,
    totalPredictions: 0,
    mlCorrect: 0,
    mlWinRate: 0,
    randomCorrect: 0,
    randomWinRate: 0,
    edge: 0,
    roi: 0,
    bySport: {},
    byConfidence: {},
    verdict: 'nul',
    verdictEmoji: '❓',
    summary: 'Aucune donnée disponible'
  };

  if (!supabase) {
    defaultResult.summary = 'Supabase non configuré';
    return defaultResult;
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  try {
    // 1. Récupérer les prédictions complétées
    const { data: predictions, error } = await supabase
      .from('predictions')
      .select('*')
      .eq('status', 'completed')
      .not('result_match', 'is', null)
      .gte('match_date', cutoffDate.toISOString())
      .order('match_date', { ascending: false });

    if (error || !predictions || predictions.length === 0) {
      defaultResult.summary = `Aucune prédiction complétée sur les ${days} derniers jours`;
      return defaultResult;
    }

    const total = predictions.length;
    const mlCorrect = predictions.filter((p: any) => p.result_match === true).length;
    const mlWinRate = Math.round((mlCorrect / total) * 100);

    // 2. Simulation hasard (coin flip calibré sur les cotes)
    let randomCorrect = 0;
    let totalStake = 0;
    let totalReturn = 0;

    // Pour chaque prédiction, simuler un choix aléatoire pondéré par les cotes
    // et calculer ce qu'un parieur hasardeux aurait gagné/perdu
    for (const p of predictions) {
      // Probabilité implicite du favori (le choix le plus probable au hasard)
      const minOdds = Math.min(
        p.odds_home || 10,
        p.odds_away || 10,
        p.odds_draw || 10
      );
      const impliedProb = 1 / minOdds;
      
      // Le hasard choisirait le favori avec probabilité implicite
      // On simule avec la moyenne des probabilités implicites
      const avgImplied = (
        1 / (p.odds_home || 2) +
        1 / (p.odds_draw || 10) +
        1 / (p.odds_away || 2)
      ) / 3;

      // Random baseline: 33% pour 3 outcomes (football), ~50% pour 2 outcomes
      const numOutcomes = p.odds_draw ? 3 : 2;
      const randomProb = p.result_match === true 
        ? (1 / numOutcomes) // Si correct, le hasard avait 1/N chance
        : 1 - (1 / numOutcomes); // Si incorrect, le hasard avait (N-1)/N chance d'être aussi faux

      // Simplification: randomCorrect = total * (1/numOutcomes)
      // Ce n'est pas exactement un coin flip mais une baseline réaliste
    }

    // Random baseline plus précis: on suppose que le hasard = 1/N
    const outcomesBySport: Record<string, number> = {
      football: 3, // home/draw/away
      basketball: 2,
      hockey: 2,
      tennis: 2,
      baseball: 2,
    };

    // Calcul par sport
    const bySport: BacktestResult['bySport'] = {};
    const sportGroups: Record<string, any[]> = {};
    
    for (const p of predictions) {
      const sport = (p.sport || 'other').toLowerCase();
      if (!sportGroups[sport]) sportGroups[sport] = [];
      sportGroups[sport].push(p);
    }

    let totalRandomCorrect = 0;

    for (const [sport, preds] of Object.entries(sportGroups)) {
      const sportTotal = preds.length;
      const sportMlCorrect = preds.filter((p: any) => p.result_match === true).length;
      const sportMlWinRate = Math.round((sportMlCorrect / sportTotal) * 100);
      const numOut = outcomesBySport[sport] || 2;
      const sportRandomWinRate = Math.round((100 / numOut));
      const sportRandomCorrect = Math.round(sportTotal / numOut);
      
      totalRandomCorrect += sportRandomCorrect;

      // ROI simulé: on suppose mises de 1€ sur chaque prediction
      let sportReturn = 0;
      for (const p of preds) {
        const stake = 1;
        totalStake += stake;
        if (p.result_match === true) {
          const odds = p.predicted_result === 'home' ? p.odds_home :
                       p.predicted_result === 'away' ? p.odds_away :
                       p.predicted_result === 'draw' ? p.odds_draw : 1.5;
          sportReturn += (odds || 1.5) * stake;
        }
        totalReturn += p.result_match === true ? (p.predicted_result === 'home' ? p.odds_home || 1.5 :
                           p.predicted_result === 'away' ? p.odds_away || 1.5 :
                           p.predicted_result === 'draw' ? p.odds_draw || 1.5 : 1.5) : 0;
      }

      bySport[sport] = {
        total: sportTotal,
        mlWinRate: sportMlWinRate,
        randomWinRate: sportRandomWinRate,
        edge: sportMlWinRate - sportRandomWinRate,
        roi: Math.round(((sportReturn - sportTotal) / sportTotal) * 100)
      };
    }

    const randomWinRate = Math.round((totalRandomCorrect / total) * 100);
    const edge = mlWinRate - randomWinRate;
    const roi = totalStake > 0 ? Math.round(((totalReturn - totalStake) / totalStake) * 100) : 0;

    // Calcul par niveau de confiance
    const byConfidence: BacktestResult['byConfidence'] = {};
    const confidenceGroups: Record<string, any[]> = {};
    
    for (const p of predictions) {
      const conf = (p.confidence || 'medium').toString();
      if (!confidenceGroups[conf]) confidenceGroups[conf] = [];
      confidenceGroups[conf].push(p);
    }

    for (const [conf, preds] of Object.entries(confidenceGroups)) {
      const confTotal = preds.length;
      const confMlCorrect = preds.filter((p: any) => p.result_match === true).length;
      const confMlWinRate = Math.round((confMlCorrect / confTotal) * 100);
      const numOut = 2.5; // average
      const confEdge = confMlWinRate - Math.round(100 / numOut);
      
      let confReturn = 0;
      for (const p of preds) {
        if (p.result_match === true) {
          confReturn += p.predicted_result === 'home' ? p.odds_home || 1.5 :
                       p.predicted_result === 'away' ? p.odds_away || 1.5 :
                       p.predicted_result === 'draw' ? p.odds_draw || 1.5 : 1.5;
        }
      }

      byConfidence[conf] = {
        total: confTotal,
        mlWinRate: confMlWinRate,
        edge: confEdge,
        roi: Math.round(((confReturn - confTotal) / confTotal) * 100)
      };
    }

    // Verdict
    let verdict: BacktestResult['verdict'];
    let verdictEmoji: string;
    let summary: string;

    if (edge >= 20 && mlWinRate >= 65) {
      verdict = 'excellent';
      verdictEmoji = '🏆';
      summary = `Excellent! ML bat le hasard de +${edge}pp avec ${mlWinRate}% de réussite (vs ${randomWinRate}% hasard). ROI: ${roi > 0 ? '+' : ''}${roi}%.`;
    } else if (edge >= 10 && mlWinRate >= 55) {
      verdict = 'bon';
      verdictEmoji = '✅';
      summary = `Bon modèle. ML bat le hasard de +${edge}pp avec ${mlWinRate}% de réussite (vs ${randomWinRate}% hasard). ROI: ${roi > 0 ? '+' : ''}${roi}%.`;
    } else if (edge >= 5) {
      verdict = 'moyen';
      verdictEmoji = '⚡';
      summary = `Modèle moyen. Légèrement au-dessus du hasard (+${edge}pp). ${mlWinRate}% de réussite vs ${randomWinRate}% hasard. ROI: ${roi > 0 ? '+' : ''}${roi}%.`;
    } else if (edge >= 0) {
      verdict = 'faible';
      verdictEmoji = '⚠️';
      summary = `Modèle faible. Peu de valeur ajoutée vs hasard (+${edge}pp). ${mlWinRate}% de réussite vs ${randomWinRate}% hasard. Nécessite plus de données.`;
    } else {
      verdict = 'nul';
      verdictEmoji = '❌';
      summary = `Modèle sous le hasard (${edge}pp). ${mlWinRate}% de réussite vs ${randomWinRate}% hasard. Réentraînement recommandé.`;
    }

    return {
      period: `${days}d`,
      totalPredictions: total,
      mlCorrect,
      mlWinRate,
      randomCorrect: totalRandomCorrect,
      randomWinRate,
      edge,
      roi,
      bySport,
      byConfidence,
      verdict,
      verdictEmoji,
      summary
    };

  } catch (e: any) {
    defaultResult.summary = `Erreur backtest: ${e.message}`;
    return defaultResult;
  }
}

/**
 * Formate le résultat du backtest pour Telegram
 */
export function formatBacktestForTelegram(result: BacktestResult): string {
  const lines: string[] = [];
  
  lines.push(`${result.verdictEmoji} *BACKTEST ML ${result.period}*`);
  lines.push('');
  lines.push(`📊 *${result.totalPredictions}* prédictions analysées`);
  lines.push(`✅ ML: *${result.mlWinRate}%* (${result.mlCorrect}/${result.totalPredictions})`);
  lines.push(`🎲 Hasard: *${result.randomWinRate}%* (${result.randomCorrect}/${result.totalPredictions})`);
  lines.push(`📈 *Edge: ${result.edge > 0 ? '+' : ''}${result.edge}pp*`);
  lines.push(`💰 ROI simulé: *${result.roi > 0 ? '+' : ''}${result.roi}%*`);
  lines.push('');

  // Par sport
  if (Object.keys(result.bySport).length > 0) {
    lines.push('📋 *Par sport:*');
    for (const [sport, data] of Object.entries(result.bySport)) {
      const emoji = sport === 'football' ? '⚽' : sport === 'basketball' ? '🏀' : 
                    sport === 'tennis' ? '🎾' : sport === 'hockey' ? '🏒' : '⚾';
      lines.push(`${emoji} ${sport}: ${data.mlWinRate}% (hasard: ${data.randomWinRate}%) | edge: ${data.edge > 0 ? '+' : ''}${data.edge}pp | ROI: ${data.roi > 0 ? '+' : ''}${data.roi}%`);
    }
    lines.push('');
  }

  // Par confiance
  if (Object.keys(result.byConfidence).length > 0) {
    lines.push('🎯 *Par confiance:*');
    const confOrder = ['very_high', 'high', 'medium', 'low'];
    for (const conf of confOrder) {
      const data = result.byConfidence[conf];
      if (!data) continue;
      const label = conf === 'very_high' ? 'Très haute' : conf === 'high' ? 'Haute' : conf === 'medium' ? 'Moyenne' : 'Basse';
      lines.push(`  ${label}: ${data.mlWinRate}% (${data.total} pronos) | edge: ${data.edge > 0 ? '+' : ''}${data.edge}pp`);
    }
    lines.push('');
  }

  lines.push(`💬 *${result.summary}*`);

  return lines.join('\n');
}

export default { runBacktest, formatBacktestForTelegram };
