/**
 * Persistence — Historique PERMANENT des calibrations trackées
 *
 * ⚠️ Problème résolu : le store in-memory (store.ts) est vidé à chaque
 * redéploiement Vercel → l'historique de fiabilité (Brier, ROI, picks)
 * repartait à zéro. Ce module le rend permanent.
 *
 * Choix technique : Supabase STORAGE (bucket privé "live-calibration")
 * plutôt qu'une table SQL, car :
 *   - Le DDL (CREATE TABLE) est impossible via Supabase REST API
 *   - Le Storage est pleinement accessible avec la service role key
 *   - Volume minuscule (quelques KB par mois) → un JSON suffit
 *
 * Fonctions :
 *   - loadHistory()                    : lit l'historique ([] si absent/erreur)
 *   - saveHistory()                    : écrit l'historique (upsert)
 *   - persistCalibrationSnapshot()     : upsert fire-and-forget au moment du scan
 *   - mergeIntoHistory()               : fusionne des entrées (mémoire gagne)
 *   - fetchRollingAggregatePersistent(): agrégat roulant depuis l'historique
 *
 * Dégradation gracieuse : TOUTE erreur Storage est loggée et ignorée —
 * le tracker retombe alors sur le store in-memory seul, comme avant.
 */

import type { StoredCalibration } from './store';
import { aggregateEntries } from './store';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const BUCKET = 'live-calibration';
const OBJECT_PATH = `history/tracked-calibrations.json`;
const MAX_HISTORY = 5000; // garde-fou taille (≈ plusieurs années)

function storageConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function objectUrl(cacheBust: boolean = false): string {
  const base = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${OBJECT_PATH}`;
  return cacheBust ? `${base}?t=${Date.now()}` : base;
}

function authHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_KEY || '',
    Authorization: `Bearer ${SUPABASE_KEY || ''}`,
  };
}

/**
 * Lit l'historique complet. Retourne [] si le fichier n'existe pas encore
 * ou si Storage est indisponible (dégradation gracieuse).
 */
export async function loadHistory(): Promise<StoredCalibration[]> {
  if (!storageConfigured()) return [];
  try {
    const res = await fetch(objectUrl(true), {
      headers: authHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404 || res.status === 400) return []; // fichier pas encore créé
    if (!res.ok) {
      console.warn(`⚠️ [PERSISTENCE] loadHistory HTTP ${res.status} — historique ignoré`);
      return [];
    }
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data as StoredCalibration[];
  } catch (e: any) {
    console.warn('⚠️ [PERSISTENCE] loadHistory échoué:', e.message);
    return [];
  }
}

/**
 * Écrit l'historique complet (upsert). Retourne true si succès.
 */
export async function saveHistory(entries: StoredCalibration[]): Promise<boolean> {
  if (!storageConfigured()) return false;
  try {
    // FIFO : garder les plus récents
    const trimmed = [...entries].sort((a, b) => (a.stored_at || 0) - (b.stored_at || 0));
    while (trimmed.length > MAX_HISTORY) trimmed.shift();

    const res = await fetch(objectUrl(), {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
        'x-upsert': 'true',
        'cache-control': 'no-cache',
      },
      body: JSON.stringify(trimmed),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`⚠️ [PERSISTENCE] saveHistory HTTP ${res.status}: ${body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e: any) {
    console.warn('⚠️ [PERSISTENCE] saveHistory échoué:', e.message);
    return false;
  }
}

/**
 * Fusionne des entrées dans l'historique existant (upsert par match_id).
 * Les entrées passées en argument ÉCRASENT celles de l'historique (données plus fraîches).
 */
export async function mergeIntoHistory(entries: StoredCalibration[]): Promise<StoredCalibration[]> {
  const history = await loadHistory();
  const byId = new Map<string, StoredCalibration>();
  for (const h of history) byId.set(h.match_id, h);
  for (const e of entries) byId.set(e.match_id, e);
  const merged = Array.from(byId.values());
  await saveHistory(merged);
  return merged;
}

/**
 * 📤 Snapshot fire-and-forget d'une calibration au moment du scan HT.
 * Appelé après recordCalibration — ne JAMAIS bloquer ni faire échouer le scan.
 * Seuls les matchs ESPN réels sont persistés (les mocks test restent en mémoire).
 */
export function persistCalibrationSnapshot(entry: StoredCalibration): void {
  if (!entry.match_id.startsWith('espn_')) return;
  // Fire-and-forget : la fonction est async mais on n'attend pas
  void (async () => {
    try {
      const history = await loadHistory();
      const byId = new Map<string, StoredCalibration>();
      for (const h of history) byId.set(h.match_id, h);
      byId.set(entry.match_id, entry);
      await saveHistory(Array.from(byId.values()));
      console.log(`💾 [PERSISTENCE] Snapshot persisté: ${entry.home_team} vs ${entry.away_team} (${byId.size} entrées historiques)`);
    } catch (e: any) {
      console.warn('⚠️ [PERSISTENCE] snapshot échoué (non bloquant):', e.message);
    }
  })();
}

/**
 * 📊 Agrégat roulant depuis l'historique PERMANENT.
 * Retourne null si Storage indisponible (le caller retombera sur la mémoire).
 */
export async function fetchRollingAggregatePersistent(): Promise<ReturnType<typeof aggregateEntries> | null> {
  const history = await loadHistory();
  if (history.length === 0) return null;
  const tracked = history.filter(c => c.final_score);
  if (tracked.length === 0) return null;
  return aggregateEntries(tracked);
}
