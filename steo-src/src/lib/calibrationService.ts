/**
 * Calibration Service — Isotonic Regression Runtime Calibration
 * 
 * This service implements a lightweight isotonic regression calibrator
 * that runs in the TypeScript prediction pipeline (no Python/sklearn dependency).
 * 
 * Pipeline position:
 *   XGBoost raw score → IsotonicRegression.calibrate(score) → calibrated probability P
 * 
 * Algorithm: Piecewise constant monotonic interpolation over reliability bins.
 * - Stores calibration map in Supabase `ml_model.xgboost_params.sports.{sport}.calibration`
 * - Falls back to identity (no calibration) if no calibration data available
 * - Recalibration happens via the Python training script (Brier score + reliability bins)
 * 
 * Also tracks predictions vs outcomes for live Brier score computation.
 */

import { createClient, SupabaseClient as SBClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// V-CRIT-1 FIX: Singleton client — avoid leaking connections
let _sbClient: SBClient | null = null;
function getSupabaseClient(): SBClient | null {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  if (!_sbClient) {
    _sbClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _sbClient;
}

// ============================================
// TYPES
// ============================================

export interface CalibrationBin {
  predicted: number;   // mean predicted probability in this bin
  actual: number;       // mean actual outcome in this bin
  count: number;        // number of predictions in this bin
}

export interface CalibrationMap {
  method: 'isotonic' | 'platt' | 'none';
  bins: CalibrationBin[];
  brierScore: number;
  sampleCount: number;
  lastCalibrated: string;
  // For Platt scaling: P_calibrated = 1 / (1 + exp(-(A * score + B)))
  plattA?: number;
  plattB?: number;
}

export interface PredictionOutcome {
  id: string;
  matchId: string;
  sport: string;
  predictedProb: number;    // model's predicted probability (0-1)
  calibratedProb: number;    // after calibration
  actualOutcome: number;     // 1 = win, 0 = loss
  confidence: string;
  recordedAt: string;
}

// ============================================
// IN-MEMORY CACHE
// ============================================

const calibrationCache = new Map<string, { map: CalibrationMap; loadedAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_MAX_ENTRIES = 50; // V-MED-1 FIX: Bound cache size to prevent unbounded memory

function evictStaleEntries(): void {
  if (calibrationCache.size <= CACHE_MAX_ENTRIES) return;
  // Evict oldest entries first
  const entries = [...calibrationCache.entries()].sort((a, b) => a[1].loadedAt - b[1].loadedAt);
  const toRemove = entries.slice(0, entries.length - CACHE_MAX_ENTRIES);
  for (const [key] of toRemove) {
    calibrationCache.delete(key);
  }
}

// ============================================
// ISOTONIC REGRESSION — Piecewise Constant Interpolation
// ============================================

/**
 * Apply isotonic regression calibration to a raw score.
 * Uses piecewise constant interpolation over the calibration bins.
 * 
 * Algorithm:
 * 1. Sort bins by predicted probability
 * 2. Find which bin the raw score falls into
 * 3. Return the actual probability of that bin (piecewise constant)
 * 4. For scores outside bin range, extrapolate from nearest bin
 * 5. Enforce monotonicity: bins are sorted and non-decreasing in actual
 * 
 * @param rawScore - Raw XGBoost score (0-1)
 * @param calibrationMap - Calibration bins from training
 * @returns Calibrated probability
 */
export function calibrateIsotonic(rawScore: number, calibrationMap: CalibrationMap): number {
  if (!calibrationMap || calibrationMap.method === 'none' || !calibrationMap.bins?.length) {
    return safeNum(rawScore, 0.5); // V-HIGH-1: Validate input
  }
  const score = safeNum(rawScore, 0.5); // V-HIGH-1: Clamp to safe range [0,1]
  const clampedScore = Math.max(0, Math.min(1, score));

  // Platt scaling path
  if (calibrationMap.method === 'platt' && calibrationMap.plattA !== undefined && calibrationMap.plattB !== undefined) {
    return applyPlattScaling(rawScore, calibrationMap.plattA, calibrationMap.plattB);
  }

  // Isotonic regression path
  const bins = [...calibrationMap.bins].sort((a, b) => a.predicted - b.predicted);

  if (bins.length === 0) return clampedScore;
  if (bins.length === 1) {
    // Single bin: just use the actual rate
    return clampProb(bins[0].actual);
  }

  // Enforce monotonicity: adjust bins to be non-decreasing in actual
  const monoBins = enforceMonotonicity(bins);

  // Find the bin where clampedScore falls
  // Piecewise constant: each bin covers [bin.predicted, next_bin.predicted)
  if (clampedScore <= monoBins[0].predicted) {
    // Below first bin: extrapolate from first bin
    return clampProb(monoBins[0].actual);
  }

  for (let i = 0; i < monoBins.length - 1; i++) {
    if (clampedScore >= monoBins[i].predicted && clampedScore < monoBins[i + 1].predicted) {
      return clampProb(monoBins[i].actual);
    }
  }

  // Above last bin: extrapolate from last bin
  return clampProb(monoBins[monoBins.length - 1].actual);
}

/**
 * Apply Platt scaling: P_calibrated = 1 / (1 + exp(-(A * score + B)))
 */
// V-HIGH-1 FIX: Validate numeric inputs are safe finite numbers
function safeNum(n: number, fallback: number = 0): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return n;
}

export function applyPlattScaling(rawScore: number, a: number, b: number): number {
  const score = safeNum(rawScore, 0.5);
  const coeffA = safeNum(a, 1);
  const coeffB = safeNum(b, 0);
  const linear = coeffA * score + coeffB;
  // Clamp linear term to prevent overflow
  const clampedLinear = Math.max(-20, Math.min(20, linear));
  return 1 / (1 + Math.exp(-clampedLinear));
}

/**
 * Enforce monotonicity on calibration bins (non-decreasing actual values).
 * Uses Pool Adjacent Violators Algorithm (PAVA) - simplified for pre-binned data.
 */
function enforceMonotonicity(bins: CalibrationBin[]): CalibrationBin[] {
  const monoBins: CalibrationBin[] = bins.map(b => ({ ...b }));
  
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < monoBins.length - 1; i++) {
      if (monoBins[i].actual > monoBins[i + 1].actual) {
        // Violation: pool adjacent bins (weighted average)
        const totalWeight = monoBins[i].count + monoBins[i + 1].count;
        if (totalWeight === 0) continue;
        
        const pooledActual = (monoBins[i].actual * monoBins[i].count + monoBins[i + 1].actual * monoBins[i + 1].count) / totalWeight;
        const pooledPredicted = (monoBins[i].predicted * monoBins[i].count + monoBins[i + 1].predicted * monoBins[i + 1].count) / totalWeight;
        
        monoBins[i].actual = pooledActual;
        monoBins[i].predicted = pooledPredicted;
        monoBins[i].count = totalWeight;
        
        // Remove the next bin
        monoBins.splice(i + 1, 1);
        changed = true;
        break; // Restart scan after pooling
      }
    }
  }
  
  return monoBins;
}

function clampProb(p: number): number {
  return Math.max(0.01, Math.min(0.99, p));
}

// ============================================
// LOAD CALIBRATION MAP FROM SUPABASE
// ============================================

/**
 * Load calibration map for a given sport from Supabase.
 * Uses in-memory cache (10 min TTL) to avoid repeated DB queries.
 */
export async function loadCalibrationMap(sport: string): Promise<CalibrationMap> {
  // V-HIGH-1: Validate sport parameter — whitelist allowed chars
  if (!sport || typeof sport !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(sport)) {
    return defaultCalibrationMap();
  }
  const sportLower = sport.toLowerCase();
  
  // Check cache
  const cached = calibrationCache.get(sportLower);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.map;
  }

  try {
    const sb = getSupabaseClient(); // V-CRIT-1 FIX: Singleton
    if (!sb) {
      return defaultCalibrationMap();
    }

    const { data, error } = await sb
      .from('ml_model')
      .select('xgboost_params')
      .order('last_trained', { ascending: false })
      .limit(1)
      .single();

    if (error || !data?.xgboost_params?.sports) {
      return defaultCalibrationMap();
    }

    const sportParams = data.xgboost_params.sports[sportLower] || data.xgboost_params.sports[sport];
    
    if (!sportParams?.calibration) {
      return defaultCalibrationMap();
    }

    const calibration: CalibrationMap = {
      method: sportParams.calibration.method || 'none',
      bins: (sportParams.calibration.reliability_bins || []).map(
        (bin: { predicted?: number; actual?: number; count?: number }, i: number) => ({
          predicted: bin.predicted ?? (i + 0.5) / 10,
          actual: bin.actual ?? 0.5,
          count: bin.count ?? 1,
        })
      ),
      brierScore: sportParams.calibration.brier_score_calibrated ?? sportParams.calibration.brier_score_original ?? 1,
      sampleCount: sportParams.calibration.sample_count ?? sportParams.samples ?? 0,
      lastCalibrated: sportParams.calibration.last_calibrated || sportParams.trained_at || new Date().toISOString(),
      plattA: sportParams.calibration.platt_a,
      plattB: sportParams.calibration.platt_b,
    };

    // Cache it (with eviction guard)
    evictStaleEntries(); // V-MED-1 FIX
    calibrationCache.set(sportLower, { map: calibration, loadedAt: Date.now() });

    return calibration;
  } catch {
    return defaultCalibrationMap();
  }
}

function defaultCalibrationMap(): CalibrationMap {
  return {
    method: 'none',
    bins: [],
    brierScore: 1,
    sampleCount: 0,
    lastCalibrated: new Date().toISOString(),
  };
}

// ============================================
// BRIER SCORE — Live Computation
// ============================================

/**
 * Calculate Brier score from a list of prediction-outcome pairs.
 * Brier = (1/N) * Σ(predicted_i - actual_i)²
 * 
 * A Brier score of 0 means perfect calibration.
 * A Brier score of 0.25 means no better than random (coin flip).
 * Below 0.15 is generally considered good for binary outcomes.
 */
export function calculateBrierScore(predictions: PredictionOutcome[]): number {
  if (predictions.length === 0) return 1;
  
  let sumSquaredError = 0;
  for (const pred of predictions) {
    const error = pred.calibratedProb - pred.actualOutcome;
    sumSquaredError += error * error;
  }
  
  return sumSquaredError / predictions.length;
}

/**
 * Calculate Brier score broken down by confidence bucket.
 * Useful for reliability diagram analysis.
 */
export function calculateBrierScoreByBucket(
  predictions: PredictionOutcome[],
  bucketCount: number = 10
): CalibrationBin[] {
  if (predictions.length < bucketCount) {
    return [{ predicted: 0.5, actual: 0.5, count: predictions.length }];
  }

  // Sort by predicted probability
  const sorted = [...predictions].sort((a, b) => a.calibratedProb - b.calibratedProb);
  const bucketSize = Math.ceil(sorted.length / bucketCount);
  const bins: CalibrationBin[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const start = i * bucketSize;
    const end = Math.min(start + bucketSize, sorted.length);
    const bucket = sorted.slice(start, end);

    if (bucket.length === 0) continue;

    const meanPredicted = bucket.reduce((s, p) => s + p.calibratedProb, 0) / bucket.length;
    const meanActual = bucket.reduce((s, p) => s + p.actualOutcome, 0) / bucket.length;

    bins.push({
      predicted: Math.round(meanPredicted * 1000) / 1000,
      actual: Math.round(meanActual * 1000) / 1000,
      count: bucket.length,
    });
  }

  return bins;
}

/**
 * Track a prediction-outcome pair for Brier score computation.
 * Stores in the `prediction_outcomes` table (created lazily).
 */
export async function trackPredictionOutcome(outcome: Omit<PredictionOutcome, 'id'>): Promise<boolean> {
  try {
    // V-HIGH-1: Validate inputs
    if (!outcome.matchId || typeof outcome.matchId !== 'string' || outcome.matchId.length > 255) return false;
    if (!outcome.sport || typeof outcome.sport !== 'string' || outcome.sport.length > 50) return false;
    if (typeof outcome.predictedProb !== 'number' || !Number.isFinite(outcome.predictedProb)) return false;
    if (typeof outcome.calibratedProb !== 'number' || !Number.isFinite(outcome.calibratedProb)) return false;
    if (outcome.actualOutcome !== 0 && outcome.actualOutcome !== 1) return false;

    const sb = getSupabaseClient(); // V-CRIT-1 FIX: Singleton
    if (!sb) return false;

    const { error } = await sb.from('prediction_outcomes').insert({
      match_id: outcome.matchId.slice(0, 255),
      sport: outcome.sport.slice(0, 50),
      predicted_prob: Math.round(Math.max(0, Math.min(1, outcome.predictedProb)) * 10000) / 10000,
      calibrated_prob: Math.round(Math.max(0, Math.min(1, outcome.calibratedProb)) * 10000) / 10000,
      actual_outcome: outcome.actualOutcome,
      confidence: (outcome.confidence || 'medium').slice(0, 20),
      recorded_at: outcome.recordedAt || new Date().toISOString(),
    });

    if (error) {
      // V-MED-2 FIX: Log error type only, not message contents
      console.debug('prediction_outcomes insert failed:', error.code || 'unknown');
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch recent prediction outcomes for live Brier score computation.
 */
export async function fetchRecentOutcomes(
  sport?: string,
  daysAgo: number = 30
): Promise<PredictionOutcome[]> {
  try {
    // V-HIGH-1: Validate daysAgo — cap to prevent excessive queries
    const safeDaysAgo = Math.max(1, Math.min(365, Math.floor(safeNum(daysAgo, 30))));

    const sb = getSupabaseClient(); // V-CRIT-1 FIX: Singleton
    if (!sb) return [];

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - safeDaysAgo);
    const cutoffISO = cutoff.toISOString();

    let query = sb
      .from('prediction_outcomes')
      .select('*')
      .gte('recorded_at', cutoffISO)
      .order('recorded_at', { ascending: false })
      .limit(500);

    if (sport) {
      // V-HIGH-1: Validate sport parameter
      if (/^[a-zA-Z0-9_-]{1,50}$/.test(sport)) {
        query = query.eq('sport', sport.toLowerCase());
      }
    }

    const { data, error } = await query;

    if (error || !data) return [];

    // V-HIGH-1: Validate each row before mapping
    return data
      .filter((row: any) => 
        row && typeof row.predicted_prob === 'number' && Number.isFinite(row.predicted_prob)
      )
      .map((row: any) => ({
        id: row.id,
        matchId: String(row.match_id || '').slice(0, 255),
        sport: String(row.sport || '').slice(0, 50),
        predictedProb: Math.max(0, Math.min(1, row.predicted_prob)),
        calibratedProb: Math.max(0, Math.min(1, row.calibrated_prob ?? row.predicted_prob)),
        actualOutcome: row.actual_outcome === 1 ? 1 : 0,
        confidence: String(row.confidence || 'medium').slice(0, 20),
        recordedAt: String(row.recorded_at || ''),
      }));
  } catch {
    return [];
  }
}

/**
 * Get a live calibration report for a sport:
 * - Overall Brier score
 * - Per-bucket reliability bins
 * - Sample count
 * - Calibration quality assessment
 */
export async function getCalibrationReport(sport: string): Promise<{
  brierScore: number;
  brierScoreUncalibrated: number;
  bins: CalibrationBin[];
  sampleCount: number;
  quality: 'excellent' | 'good' | 'acceptable' | 'poor' | 'needs_recalibration';
  recommendation: string;
}> {
  const outcomes = await fetchRecentOutcomes(sport, 30);
  
  if (outcomes.length < 20) {
    return {
      brierScore: 1,
      brierScoreUncalibrated: 1,
      bins: [],
      sampleCount: outcomes.length,
      quality: 'needs_recalibration',
      recommendation: `Insuffisant: ${outcomes.length}/20 échantillons minimum requis`,
    };
  }

  // Brier score with calibrated probabilities
  const brierCalibrated = calculateBrierScore(outcomes);
  
  // Brier score with uncalibrated probabilities
  const uncalibratedOutcomes = outcomes.map(o => ({ ...o, calibratedProb: o.predictedProb }));
  const brierUncalibrated = calculateBrierScore(uncalibratedOutcomes);
  
  // Reliability bins
  const bins = calculateBrierScoreByBucket(outcomes, 10);

  // Quality assessment
  let quality: 'excellent' | 'good' | 'acceptable' | 'poor' | 'needs_recalibration';
  let recommendation: string;

  if (brierCalibrated < 0.05) {
    quality = 'excellent';
    recommendation = 'Calibration excellente. Modèle très bien calibré.';
  } else if (brierCalibrated < 0.10) {
    quality = 'good';
    recommendation = 'Bonne calibration. Monitorer pour stabilité.';
  } else if (brierCalibrated < 0.15) {
    quality = 'acceptable';
    recommendation = 'Calibration acceptable. Considérer recalibration si >0.12.';
  } else if (brierCalibrated < 0.20) {
    quality = 'poor';
    recommendation = 'Calibration médiocre. Recalibration recommandée.';
  } else {
    quality = 'needs_recalibration';
    recommendation = 'Calibration insuffisante. Recalibration urgente requise.';
  }

  return {
    brierScore: Math.round(brierCalibrated * 10000) / 10000,
    brierScoreUncalibrated: Math.round(brierUncalibrated * 10000) / 10000,
    bins,
    sampleCount: outcomes.length,
    quality,
    recommendation,
  };
}

// ============================================
// CLEAR CACHE (for testing / recalibration)
// ============================================

export function clearCalibrationCache(): void {
  calibrationCache.clear();
}
