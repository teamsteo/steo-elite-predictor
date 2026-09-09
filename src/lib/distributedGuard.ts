/**
 * DistributedGuard — État du disjoncteur stealthFetch PARTAGÉ entre instances
 * ===========================================================================
 *
 * ⚠️ Problème résolu : sur Vercel, chaque instance serverless a son propre
 * Map en mémoire (stealthFetch.domainStates). Résultat : quand une instance
 * détecte un challenge WAF et ouvre son circuit breaker, les AUTRES instances
 * continuent de marteler le domaine → le bannissement se durcit pour tout le
 * monde. Le garde-fou doit être visible globalement.
 *
 * Choix technique (0 €) : Supabase STORAGE (bucket privé "live-calibration",
 * déjà utilisé par liveCalibration/persistence.ts) plutôt qu'une table SQL :
 *   - Le DDL (CREATE TABLE) est impossible via Supabase REST API
 *   - Une table dédiée type Upstash coûterait un compte en plus
 *   - Volume minuscule : un JSON de quelques centaines d'octets
 *
 * Sémantique :
 *   - getSharedBlock(domain)  → blocked_until si le domaine est bloqué
 *     GLOBALEMENT (cache local 10 s pour ne pas marteler Storage),
 *     0 si rien ou si Storage indisponible (dégradation gracieuse).
 *   - pushSharedBlock(domain) → fire-and-forget, appelé quand le circuit
 *     breaker local S'OUVRE. Dernier écrivain gagnant (garde consultatif).
 *
 * Jamais bloquant : toute erreur Storage est avalée — le comportement local
 * (Map en mémoire) reste la base, le partagé est un plus.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const BUCKET = 'live-calibration';
const OBJECT_PATH = 'guard/domain-breakers.json';
const READ_CACHE_TTL_MS = 10 * 1000;   // 1 lecture Storage max / 10 s
const READ_TIMEOUT_MS = 3_000;         // ne jamais faire attendre une requête > 3 s
const WRITE_TIMEOUT_MS = 5_000;

interface SharedDomainState {
  blocked_until: number;
  error_count: number;
  updated_at: string;
}

interface SharedGuardFile {
  updated_at: string;
  domains: Record<string, SharedDomainState>;
}

let cache: { data: SharedGuardFile; fetchedAt: number } | null = null;
let inflight: Promise<SharedGuardFile | null> | null = null;

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

function emptyFile(): SharedGuardFile {
  return { updated_at: new Date().toISOString(), domains: {} };
}

/** Lit le fichier partagé (cache 10 s, dédoublonnage des lectures concurrentes). */
async function loadShared(): Promise<SharedGuardFile | null> {
  if (!storageConfigured()) return null;

  if (cache && Date.now() - cache.fetchedAt < READ_CACHE_TTL_MS) {
    return cache.data;
  }

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch(objectUrl(true), {
        headers: authHeaders(),
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      });
      if (res.status === 404 || res.status === 400) {
        const empty = emptyFile(); // fichier pas encore créé — normal au démarrage
        cache = { data: empty, fetchedAt: Date.now() };
        return empty;
      }
      if (!res.ok) return cache?.data || null; // dégradation gracieuse
      const data = await res.json();
      const file: SharedGuardFile =
        data && typeof data === 'object' && data.domains && typeof data.domains === 'object'
          ? { updated_at: String(data.updated_at || ''), domains: data.domains }
          : emptyFile();
      cache = { data: file, fetchedAt: Date.now() };
      return file;
    } catch {
      return cache?.data || null; // Storage indisponible → état local seulement
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * Retourne le blocked_until PARTAGÉ du domaine (0 si non bloqué / indisponible).
 * Appelé AVANT chaque requête stealthFetch — coût réel : ~0 ms (cache 10 s),
 * 1 GET Storage par 10 s maximum toutes instances confondues par instance.
 */
export async function getSharedBlock(domain: string): Promise<number> {
  const file = await loadShared();
  if (!file) return 0;
  const st = file.domains[domain];
  return st && typeof st.blocked_until === 'number' ? st.blocked_until : 0;
}

/**
 * Publie l'ouverture du circuit breaker LOCAL vers le store partagé.
 * Fire-and-forget (jamais attendu par le chemin critique) — fusion
 * conservatrice : on garde le blocked_until le PLUS LOINTAIN des deux.
 */
export function pushSharedBlock(domain: string, blockedUntil: number, errorCount: number): void {
  if (!storageConfigured() || !(blockedUntil > Date.now())) return;
  void (async () => {
    try {
      const current = (await loadShared()) || emptyFile();
      const prev = current.domains[domain];
      const merged: SharedDomainState = {
        blocked_until: Math.max(blockedUntil, prev?.blocked_until || 0),
        error_count: Math.max(errorCount, prev?.error_count || 0),
        updated_at: new Date().toISOString(),
      };
      const next: SharedGuardFile = {
        updated_at: new Date().toISOString(),
        domains: { ...current.domains, [domain]: merged },
      };
      const res = await fetch(objectUrl(), {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
          'x-upsert': 'true',
          'cache-control': 'no-cache',
        },
        body: JSON.stringify(next),
        signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
      });
      if (res.ok) {
        cache = { data: next, fetchedAt: Date.now() };
      } else {
        const body = await res.text().catch(() => '');
        console.warn(`⚠️ [GUARD] pushSharedBlock HTTP ${res.status}: ${body.slice(0, 120)}`);
      }
    } catch (e: any) {
      console.warn('⚠️ [GUARD] pushSharedBlock échoué (non bloquant):', e.message);
    }
  })();
}

/** Purge les entrées expirées (ménage interne, appelé au push). */
export function pruneExpired(file: SharedGuardFile): SharedGuardFile {
  const now = Date.now();
  const domains: Record<string, SharedDomainState> = {};
  for (const [d, st] of Object.entries(file.domains)) {
    if (st.blocked_until > now) domains[d] = st;
  }
  return { updated_at: new Date().toISOString(), domains };
}
