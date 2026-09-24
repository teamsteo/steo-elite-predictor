/**
 * Tennis V3 Pipeline — UNIQUE point d'entrée site + Telegram (Task 21)
 * =====================================================================
 *
 * ⚠️ Problème résolu : /api/tennis (site) et /api/cron/tennis-v3 (Telegram)
 * avaient CHACUN leur `collectMatches() → getV3Predictions()` → deux chaînes
 * identiques à maintenir, 2× la charge BetExplorer, et un risque de divergence
 * entre ce que le site affiche et ce que BADJAN publie.
 *
 * Après : runV3Pipeline() = UNE collecte, UN calcul, UN format canonique
 * (API 0-1), avec 2 niveaux de cache :
 *
 *   L1 — mémoire instance (TTL 5 min, 0 réseau) : absorbe le trafic site.
 *   L2 — Supabase Storage PARTAGÉ inter-instances (pattern distributedGuard,
 *        bucket 'live-calibration', dégradation gracieuse si indisponible) :
 *        le site de la journée et le cron 10:15 réutilisent la MÊME collecte
 *        → BetExplorer voit ~1 collecte / 15 min au lieu de N × instances
 *        → ce que le site affiche = EXACTEMENT ce que Telegram publie.
 *
 * Format canonique stocké/partagé : sorties `toApiPrediction` (prob 0-1).
 * La conversion affichage site (prob ×100, kelly en %) est faite par
 * `toSiteFormat()` à la lecture — le cron BADJAN garde ses propres
 * conversions inchangées (0-1), zéro régression Telegram.
 *
 * Jamais bloquant : toute erreur Storage est avalée (L1 seul = comportement
 * de l'ancien code). Écritures fire-and-forget, dernier écrivain gagnant.
 */

import { TennisMatch, collectMatches } from '../tennis-enhanced/smart-collector';
import { getV3Predictions, toApiPrediction } from './service';

// ============================================
// CONFIG
// ============================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const BUCKET = 'live-calibration';
const OBJECT_PATH = 'tennis-v3/daily-predictions.json';

const MEMORY_TTL_MS = 5 * 60 * 1000;   // L1 : 5 min (identique à l'ancien CACHE_TTL site)
const SHARED_TTL_MS = 15 * 60 * 1000;  // L2 : age max d'une collecte partagée
const READ_TIMEOUT_MS = 3_000;         // ne jamais faire attendre une requête > 3 s
const WRITE_TIMEOUT_MS = 5_000;

// ============================================
// TYPES
// ============================================

export type ApiPrediction = ReturnType<typeof toApiPrediction>;
/** Type exact du champ status renvoyé par getV3Predictions (seed, incrémental…). */
type V3Status = Awaited<ReturnType<typeof getV3Predictions>>['status'];

export interface V3PipelineMeta {
  /** ISO — moment de la collecte (pas du cache hit) */
  collectedAt: string;
  /** matchs collectés par le smart-collector (funnel) */
  collectedCount: number;
  /** noms V3 non résolus (funnel) */
  unresolvedCount: number;
  /** v3.status (seed, incrémental, etc.) */
  status: V3Status;
  /** provenance de la réponse */
  source: 'memory' | 'shared' | 'fresh';
}

export interface V3PipelineOutput {
  /** format API canonique 0-1 — consommé par le cron (BADJAN/report/picks) */
  predictions: ApiPrediction[];
  /** format site (prob 0-100, kelly %) — consommé par /api/tennis */
  site: ReturnType<typeof toSiteFormat>[];
  meta: V3PipelineMeta;
}

/** Format du fichier partagé (exporté pour tests/consommateurs avancés). */
export interface SharedFileLike {
  updated_at: string;
  collected_at: string;
  predictions: ApiPrediction[];
  collected_count: number;
  unresolved_count: number;
  status: V3Status;
}

// ============================================
// CONVERSION AFFICHAGE SITE (pure, testable)
// ============================================

/**
 * Convertit une prédiction API (0-1) en format d'affichage site (V2-convention) :
 * winProbability ×100, kellyStake en %. riskPercentage/expectedValue inchangés.
 * Le cron BADJAN/report NE DOIT PAS passer ici (il fait ses propres ×100).
 */
export function toSiteFormat(api: ApiPrediction) {
  return {
    ...api,
    prediction: {
      ...api.prediction,
      winProbability: Math.round(api.prediction.winProbability * 100),
    },
    betting: {
      ...api.betting,
      kellyStake: Math.round((api.betting.kellyStake || 0) * 1000) / 10,
    },
  };
}

// ============================================
// L2 — CACHE PARTAGÉ (Supabase Storage, gracieux)
// ============================================

function storageConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function objectUrl(cacheBust = false): string {
  const base = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${OBJECT_PATH}`;
  return cacheBust ? `${base}?t=${Date.now()}` : base;
}

function authHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_KEY || '',
    Authorization: `Bearer ${SUPABASE_KEY || ''}`,
  };
}

function sharedToOutput(f: SharedFileLike): V3PipelineOutput {
  return {
    predictions: f.predictions,
    site: f.predictions.map(toSiteFormat),
    meta: {
      collectedAt: f.collected_at,
      collectedCount: f.collected_count,
      unresolvedCount: f.unresolved_count,
      status: f.status,
      source: 'shared',
    },
  };
}

/** Hook de test — injectable pour couvrir la logique L2 sans réseau. */
let _readSharedHook: (() => Promise<SharedFileLike | null>) | null = null;
let _writeSharedHook: ((f: SharedFileLike) => Promise<void>) | null = null;

/** Lit la collecte partagée. null = absente/indisponible/trop vieille. */
async function readShared(maxAgeMs: number): Promise<V3PipelineOutput | null> {
  try {
    let raw: SharedFileLike | null = null;
    if (_readSharedHook) {
      raw = await _readSharedHook();
    } else {
      if (!storageConfigured()) return null;
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), READ_TIMEOUT_MS);
      const res = await fetch(objectUrl(true), {
        headers: authHeaders(),
        signal: ctrl.signal,
        cache: 'no-store',
      });
      clearTimeout(to);
      if (!res.ok) return null; // 404 (1re collecte) ou Storage indisponible
      raw = (await res.json()) as SharedFileLike;
    }
    if (!raw || !Array.isArray(raw.predictions)) return null;
    const ts = Date.parse(raw.updated_at || '') || 0;
    if (Date.now() - ts > maxAgeMs) return null;
    return sharedToOutput(raw);
  } catch {
    return null; // dégradation gracieuse → L1/collecte
  }
}

/** Écrit la collecte partagée. Fire-and-forget, jamais bloquant. */
async function writeShared(out: V3PipelineOutput): Promise<void> {
  try {
    const file: SharedFileLike = {
      updated_at: new Date().toISOString(),
      collected_at: out.meta.collectedAt,
      predictions: out.predictions,
      collected_count: out.meta.collectedCount,
      unresolved_count: out.meta.unresolvedCount,
      status: out.meta.status,
    };
    if (_writeSharedHook) {
      await _writeSharedHook(file);
      return;
    }
    if (!storageConfigured()) return;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), WRITE_TIMEOUT_MS);
    await fetch(objectUrl(), {
      method: 'POST', // upsert via POST x-upsert header
      headers: { ...authHeaders(), 'Content-Type': 'application/json', 'x-upsert': 'true', 'cache-control': 'no-cache' },
      body: JSON.stringify(file),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    // 200/201 attendus ; toute erreur = cache partagé simplement absent ce cycle
  } catch {
    // silencieux — le cache partagé est un plus, jamais une dépendance
  }
}

// ============================================
// PIPELINE
// ============================================

let memory: { out: V3PipelineOutput; ts: number } | null = null;
let inflight: Promise<V3PipelineOutput> | null = null;

export interface PipelineOptions {
  /** force la collecte (bypass L1+L2) — ?refresh=true site ou besoin cron */
  forceRefresh?: boolean;
  /** age max de la collecte partagée (défaut 15 min) */
  maxAgeMs?: number;
  /** hooks de test */
  _collect?: () => Promise<TennisMatch[]>;
  _predict?: typeof getV3Predictions;
  _readShared?: () => Promise<SharedFileLike | null>;
  _writeShared?: (f: SharedFileLike) => Promise<void>;
}

export async function runV3Pipeline(opts: PipelineOptions = {}): Promise<V3PipelineOutput> {
  const now = Date.now();
  const maxAge = opts.maxAgeMs ?? SHARED_TTL_MS;

  // L1 — mémoire instance
  if (!opts.forceRefresh && memory && now - memory.ts < MEMORY_TTL_MS) {
    return { ...memory.out, meta: { ...memory.out.meta, source: 'memory' } };
  }

  // L2 — collecte partagée inter-instances
  if (opts._readShared) _readSharedHook = opts._readShared;
  if (opts._writeShared) _writeSharedHook = opts._writeShared;
  if (!opts.forceRefresh) {
    const shared = await readShared(maxAge);
    if (shared) {
      memory = { out: shared, ts: now };
      return shared;
    }
  }

  // Collecte + calcul (dédoublonnage des appels concurrents dans l'instance)
  if (inflight) return inflight;
  inflight = (async (): Promise<V3PipelineOutput> => {
    const collect = opts._collect || collectMatches;
    const predict = opts._predict || getV3Predictions;

    const matches = await collect();
    const v3 = await predict(matches);
    const predictions = v3.predictions.map(toApiPrediction);

    const out: V3PipelineOutput = {
      predictions,
      site: predictions.map(toSiteFormat),
      meta: {
        collectedAt: new Date().toISOString(),
        collectedCount: matches.length,
        unresolvedCount: v3.unresolved.length,
        status: v3.status,
        source: 'fresh',
      },
    };

    memory = { out, ts: Date.now() };
    // partage fire-and-forget : le site ET le cron en bénéficieront
    void writeShared(out);
    return out;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
    if (opts._readShared) _readSharedHook = null;
    if (opts._writeShared) _writeSharedHook = null;
  }
}

/** Réinitialise les caches (tests uniquement). */
export function __resetPipelineForTests(): void {
  memory = null;
  inflight = null;
  _readSharedHook = null;
  _writeSharedHook = null;
}
