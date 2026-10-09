/**
 * Sport Metrics Service — BADJAN V3 Phase 4 (Task 41)
 *
 * Validation historique des prédictions NHL/MLB stockées en Supabase:
 *   - Taux de réussite + ROI (mise 1u à la cote enregistrée du côté prédit)
 *   - Brier score (modèle vs baseline marché devig)
 *   - Log loss (modèle vs baseline marché devig)
 *   - Calibration par tranches de probabilité
 *   - Découpage par niveau de confiance
 *
 * Méthodologie BADJAN V3 §historique:
 *   "Les probabilités ne sont jamais modifiées rétrospectivement" — toutes les
 *   métriques utilisent UNIQUEMENT les cotes/probas stockées au moment de la
 *   prédiction (odds_home/odds_away + edge_value), jamais les résultats.
 *
 * Reconstruction de la proba modèle (honnête et documentée):
 *   P_modèle(choisi) = P_marché_devig(choisi) + edge_value/100 (clampée 1-99%)
 *   edge_value est stocké au moment de la prédiction = écart modèle-marché en pp.
 *   La baseline marché = P_devig seule. Les deux Brier sont affichés côte à côte:
 *   le modèle doit faire MIEUX que le marché pour justifier son edge.
 *
 * CLV: non calculable actuellement (pas d'historique de cotes de clôture en DB)
 * — voir clv.note. Une fois oddsTrackingService historisé, la colonne se branchera ici.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Même configuration que db-supabase.ts (Base Historique ML)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

function getSupabase(): SupabaseClient<any, any, any> | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.warn('⚠️ Supabase non configuré - vérifiez NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY');
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

// ============================================
// TYPES
// ============================================

export interface CalibrationBucket {
  bucket: string;
  n: number;
  avgPredicted: number; // % moyenne proba prédite
  realized: number;     // % réalisée
  gapPp: number;        // écart réalisé − prédit
}

export interface ConfidenceRow {
  confidence: string;
  n: number;
  wins: number;
  winRate: number;   // %
  roiPct: number;
}

export interface SportMetrics {
  sport: string;
  windowDays: number;
  from: string;
  to: string;
  sample: {
    total: number;
    wins: number;
    losses: number;
    winRate: number; // %
  };
  roi: {
    stakeUnits: number;
    profitUnits: number;
    roiPct: number;
    avgOdds: number;
  };
  brier: {
    model: number;   // plus BAS = mieux
    market: number;  // baseline marché devig
    modelBeatsMarket: boolean;
    note: string;
  };
  logLoss: {
    model: number;
    market: number;
    modelBeatsMarket: boolean;
  };
  calibration: CalibrationBucket[];
  byConfidence: ConfidenceRow[];
  clv: {
    available: boolean;
    note: string;
  };
  reliability: {
    minSample: number;
    sufficient: boolean;
    note: string;
  };
}

export type SportFilter = 'all' | 'hockey' | 'baseball' | 'basketball' | 'football';

// ============================================
// FONCTIONS PURES (testées unitairement)
// ============================================

/** Devig 2-marchés pour le côté prédit (0 si cotes invalides) */
export function devigForSide(oddsSide: number, oddsOpposite: number): number {
  if (!(oddsSide > 1) || !(oddsOpposite > 1)) return 0;
  const invS = 1 / oddsSide;
  const invO = 1 / oddsOpposite;
  return invS / (invS + invO);
}

/** Brier score d'un échantillon (prob, outcome) — plus BAS = mieux */
export function brierScore(pairs: Array<{ p: number; y: number }>): number {
  if (pairs.length === 0) return 0;
  const s = pairs.reduce((acc, { p, y }) => acc + (p - y) * (p - y), 0);
  return s / pairs.length;
}

/** Log loss d'un échantillon (prob clampée) — plus BAS = mieux */
export function logLoss(pairs: Array<{ p: number; y: number }>): number {
  const valid = pairs.filter(({ p }) => p > 0.001 && p < 0.999);
  if (valid.length === 0) return 0;
  const s = valid.reduce((acc, { p, y }) => {
    const clamped = Math.max(0.001, Math.min(0.999, p));
    return acc - (y * Math.log(clamped) + (1 - y) * Math.log(1 - clamped));
  }, 0);
  return s / valid.length;
}

/** Tranche de calibration pour une proba (0-1) */
export function calibrationBucket(p: number): string {
  if (p < 0.40) return '<40%';
  if (p < 0.50) return '40-50%';
  if (p < 0.60) return '50-60%';
  if (p < 0.70) return '60-70%';
  if (p < 0.85) return '70-85%';
  return '≥85%';
}

// ============================================
// CALCUL PRINCIPAL
// ============================================

const MIN_SAMPLE = 30;

/**
 * Calcule les métriques de validation historique depuis Supabase.
 * sport = 'all' → une entrée par sport concerné (hockey, baseball).
 */
export async function computeSportMetrics(
  sport: SportFilter = 'all',
  days = 90
): Promise<{ metrics: SportMetrics[]; warnings: string[] }> {
  const warnings: string[] = [];
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase indisponible (clés non configurées)');
  }

  const sports = sport === 'all' ? ['hockey', 'baseball'] : [sport];
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fromISO = from.toISOString();
  const toISO = to.toISOString();

  // Récupération des lignes complétées avec résultat
  const { data, error } = await supabase
    .from('predictions')
    .select('sport, match_date, odds_home, odds_away, predicted_result, result_match, confidence, edge_value')
    .in('sport', sports)
    .not('result_match', 'is', null)
    .gte('match_date', fromISO)
    .lte('match_date', toISO)
    .limit(5000);

  if (error) {
    throw new Error(`Supabase: ${error.message}`);
  }

  const rows = (data || []) as Array<{
    sport: string;
    match_date: string;
    odds_home: number;
    odds_away: number;
    predicted_result: string;
    result_match: boolean | null;
    confidence: string;
    edge_value: number | null;
  }>;

  const metrics: SportMetrics[] = [];

  for (const sp of sports) {
    const sportRows = rows.filter((r) => r.sport === sp);

    // Chaque ligne: side prédit, probas, outcome
    interface EvalRow { pModel: number; pMarket: number; y: number; odds: number; profit: number; confidence: string }
    const evals: EvalRow[] = [];

    for (const r of sportRows) {
      const isHome = r.predicted_result === 'home';
      const isAway = r.predicted_result === 'away';
      if (!isHome && !isAway) continue; // nul/over/under → hors moneyline metrics

      const oddsSide = isHome ? Number(r.odds_home) : Number(r.odds_away);
      const oddsOpp = isHome ? Number(r.odds_away) : Number(r.odds_home);
      const pMarket = devigForSide(oddsSide, oddsOpp);
      if (pMarket <= 0) continue;

      const edge = Number(r.edge_value) || 0;
      const pModel = Math.max(0.01, Math.min(0.99, pMarket + edge / 100));
      const y = r.result_match === true ? 1 : 0;
      const profit = y === 1 ? oddsSide - 1 : -1;

      evals.push({ pModel, pMarket, y, odds: oddsSide, profit, confidence: r.confidence || 'medium' });
    }

    const n = evals.length;
    const wins = evals.filter((e) => e.y === 1).length;
    const stake = n; // 1 unité par prédiction
    const profitUnits = evals.reduce((s, e) => s + e.profit, 0);
    const avgOdds = n > 0 ? evals.reduce((s, e) => s + e.odds, 0) / n : 0;

    const brierModel = brierScore(evals.map((e) => ({ p: e.pModel, y: e.y })));
    const brierMarket = brierScore(evals.map((e) => ({ p: e.pMarket, y: e.y })));
    const llModel = logLoss(evals.map((e) => ({ p: e.pModel, y: e.y })));
    const llMarket = logLoss(evals.map((e) => ({ p: e.pMarket, y: e.y })));

    // Calibration par tranche (proba modèle)
    const bucketNames = ['<40%', '40-50%', '50-60%', '60-70%', '70-85%', '≥85%'];
    const calibration: CalibrationBucket[] = bucketNames.map((b) => {
      const inBucket = evals.filter((e) => calibrationBucket(e.pModel) === b);
      const avgP = inBucket.length > 0 ? inBucket.reduce((s, e) => s + e.pModel, 0) / inBucket.length : 0;
      const realized = inBucket.length > 0 ? inBucket.reduce((s, e) => s + e.y, 0) / inBucket.length : 0;
      return {
        bucket: b,
        n: inBucket.length,
        avgPredicted: Math.round(avgP * 1000) / 10,
        realized: Math.round(realized * 1000) / 10,
        gapPp: inBucket.length > 0 ? Math.round((realized - avgP) * 1000) / 10 : 0,
      };
    });

    // Découpage par confiance
    const confLevels = ['very_high', 'high', 'medium', 'low'];
    const byConfidence: ConfidenceRow[] = confLevels
      .map((c) => {
        const inConf = evals.filter((e) => e.confidence === c);
        const w = inConf.filter((e) => e.y === 1).length;
        const p = inConf.reduce((s, e) => s + e.profit, 0);
        return {
          confidence: c,
          n: inConf.length,
          wins: w,
          winRate: inConf.length > 0 ? Math.round((w / inConf.length) * 1000) / 10 : 0,
          roiPct: inConf.length > 0 ? Math.round((p / inConf.length) * 1000) / 10 : 0,
        };
      })
      .filter((c) => c.n > 0);

    metrics.push({
      sport: sp,
      windowDays: days,
      from: fromISO.split('T')[0],
      to: toISO.split('T')[0],
      sample: {
        total: n,
        wins,
        losses: n - wins,
        winRate: n > 0 ? Math.round((wins / n) * 1000) / 10 : 0,
      },
      roi: {
        stakeUnits: stake,
        profitUnits: Math.round(profitUnits * 100) / 100,
        roiPct: n > 0 ? Math.round((profitUnits / n) * 1000) / 10 : 0,
        avgOdds: Math.round(avgOdds * 100) / 100,
      },
      brier: {
        model: Math.round(brierModel * 10000) / 10000,
        market: Math.round(brierMarket * 10000) / 10000,
        modelBeatsMarket: n >= MIN_SAMPLE ? brierModel < brierMarket : brierModel < brierMarket,
        note: 'Brier modèle = devig + edge_value stocké à la prédiction (jamais rétrospectif)',
      },
      logLoss: {
        model: Math.round(llModel * 10000) / 10000,
        market: Math.round(llMarket * 10000) / 10000,
        modelBeatsMarket: llModel < llMarket,
      },
      calibration,
      byConfidence,
      clv: {
        available: false,
        note: 'CLV non calculable: historique de cotes de clôture non stocké. Brancher oddsTrackingService pour l\'activer.',
      },
      reliability: {
        minSample: MIN_SAMPLE,
        sufficient: n >= MIN_SAMPLE,
        note: n >= MIN_SAMPLE
          ? `Échantillon suffisant (${n} ≥ ${MIN_SAMPLE})`
          : `Échantillon insuffisant (${n} < ${MIN_SAMPLE}): métriques indicatives seulement — laisser tourner les crons de vérification`,
      },
    });

    if (n === 0) {
      warnings.push(`Aucune prédiction ${sp} complétée sur ${days} jours`);
    }
  }

  return { metrics, warnings };
}

/** Format texte français prêt pour Telegram / console */
export function formatMetricsText(metrics: SportMetrics[]): string {
  const lines: string[] = ['📊 VALIDATION V3 — NHL/MLB', ''];
  for (const m of metrics) {
    const icon = m.sport === 'hockey' ? '🏒' : '⚾';
    lines.push(`${icon} ${m.sport.toUpperCase()} (${m.from} → ${m.to})`);
    lines.push(`• Échantillon: ${m.sample.total} pronos, ${m.sample.wins}W-${m.sample.losses}L (${m.sample.winRate}%)`);
    lines.push(`• ROI: ${m.roi.roiPct > 0 ? '+' : ''}${m.roi.roiPct}% (${m.roi.profitUnits > 0 ? '+' : ''}${m.roi.profitUnits}u, cote moy ${m.roi.avgOdds})`);
    lines.push(`• Brier: modèle ${m.brier.model} vs marché ${m.brier.market} ${m.brier.model < m.brier.market ? '✅' : '⚠️'}`);
    lines.push(`• Log loss: ${m.logLoss.model} vs ${m.logLoss.market} ${m.logLoss.modelBeatsMarket ? '✅' : '⚠️'}`);
    const calib = m.calibration.filter((c) => c.n > 0);
    if (calib.length > 0) {
      lines.push(`• Calibration: ${calib.map((c) => `${c.bucket}: ${c.realized}% (n=${c.n})`).join(' · ')}`);
    }
    for (const c of m.byConfidence) {
      lines.push(`  ↳ ${c.confidence}: ${c.wins}/${c.n} (${c.winRate}%), ROI ${c.roiPct > 0 ? '+' : ''}${c.roiPct}%`);
    }
    lines.push(`• Fiabilité: ${m.reliability.note}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}
