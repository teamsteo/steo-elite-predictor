/**
 * Tennis V3 — Service de données
 * 1. Seed commité (tennis-seed.json.gz) : ratings Elo précalculés sur 29k+
 *    matchs tennis-data.co.uk 2021-2026, stats agrégées, matchs récents 150j.
 * 2. Update incrémental : xlsx ATP+WTA de l'année courante (1 dl/12h max,
 *    2 requêtes/jour → risque de ban quasi nul). Elo mis à jour sur les
 *    matchs post-seed, profils reconstruits à la demande.
 * Dégradation gracieuse : seed seul suffit si le download échoue.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { V3Match, V3PlayerProfile, V3Seed, V3Surface } from './types';
import { EloStore, newEloStore, applyMatch, ELO_BASE, surfaceRating } from './elo-engine';
import { parseCanonical, buildSurnameIndex } from './name-utils';
import { parseXlsx } from './xlsx-parser';
import { stealthFetch } from '../stealthFetch';
const TENNIS_DATA_BASE = 'https://www.tennis-data.co.uk/hrjk-85HytOjkhth76j_ygh4jf7';
const XLSX_TTL = 12 * 60 * 60 * 1000; // 12h

// ---------------- état runtime ----------------
let seedCache: V3Seed | null = null;
let store: EloStore | null = null;
let runtimeMatches: V3Match[] = [];
let incrementalCount = 0;
let surnameIndex: Map<string, string[]> | null = null;
let xlsxCache: { atp: { at: number; rows: any[] }; wta: { at: number; rows: any[] } } = {
  atp: { at: 0, rows: [] },
  wta: { at: 0, rows: [] },
};
let seedLoadError: string | null = null;
let buildPromise: Promise<boolean> | null = null;

function seedPath(): string {
  return path.join(process.cwd(), 'src', 'lib', 'tennis-v3', 'seed', 'tennis-seed.json.gz');
}

/**
 * Normalise les clés du seed (format python "alcaraz c.") vers le format
 * canonique TS ("alcaraz-c") — garantit déduplication + profils unifiés.
 */
function normalizeSeed(raw: V3Seed): V3Seed {
  const can = (k: string): string => {
    const c = parseCanonical(k).key;
    return c || k;
  };
  const mapKeys = (obj: Record<string, any>): Record<string, any> => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj || {})) {
      const ck = can(k);
      if (!out[ck]) out[ck] = v; // collision improbable → premier gardé
    }
    return out;
  };
  raw.ratings = mapKeys(raw.ratings);
  raw.playerStats = mapKeys(raw.playerStats);
  raw.lastSeen = mapKeys(raw.lastSeen);
  raw.displayNames = mapKeys(raw.displayNames);
  for (const m of raw.recentMatches || []) {
    m.w = can(m.w);
    m.l = can(m.l);
  }
  return raw;
}

export function loadSeed(): V3Seed | null {
  if (seedCache) return seedCache;
  try {
    let gz: Buffer | null = null;
    // 1. seed embarqué (bundlé webpack → sûr sur Vercel/serverless)
    try {
      const { SEED_B64 } = require('./seed-b64') as { SEED_B64: string };
      gz = Buffer.from(SEED_B64, 'base64');
    } catch {
      // module absent → fallback fs
    }
    // 2. fallback fichier disque (dev local / seed régénéré non recompilé)
    if (!gz || gz.length < 100) {
      gz = fs.readFileSync(seedPath());
    }
    const parsed = JSON.parse(zlib.gunzipSync(gz).toString('utf-8')) as V3Seed;
    seedCache = normalizeSeed(parsed);
    console.log(`[TennisV3] 📦 Seed: ${seedCache.counts.total} matchs (généré ${seedCache.generatedAt})`);
    return seedCache;
  } catch (e: any) {
    seedLoadError = e?.message || 'seed introuvable';
    console.error(`[TennisV3] ❌ Seed indisponible: ${seedLoadError}`);
    return null;
  }
}

export function getSeedLoadError(): string | null {
  return seedLoadError;
}

// ---------------- xlsx courant ----------------

function normSurface(s: string): V3Surface {
  const v = String(s || '').toLowerCase();
  if (v.includes('clay')) return 'Clay';
  if (v.includes('grass')) return 'Grass';
  return 'Hard';
}

function safeInt(v: any): number {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : 0;
}

async function fetchXlsxRows(category: 'atp' | 'wta'): Promise<any[]> {
  const cached = xlsxCache[category];
  if (cached.rows.length > 0 && Date.now() - cached.at < XLSX_TTL) return cached.rows;
  const year = new Date().getFullYear();
  const url =
    category === 'atp'
      ? `${TENNIS_DATA_BASE}/${year}/${year}.xlsx`
      : `${TENNIS_DATA_BASE}/${year}w/${year}.xlsx`;
  try {
    // stealthFetch (Task 19) : profils navigateur cohérents + budget anti-ban
    // (tennis-data: rafale 2/60s, plafond 8/jour) + disjoncteur WAF partagé.
    // En cas de budget épuisé / breaker → catch ci-dessous → « seed seul ».
    const res = await stealthFetch(url, {
      signal: AbortSignal.timeout(25000),
      maxRetries: 1, // xlsx = gros fichier, pas de retry agressif
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await parseXlsx(Buffer.from(await res.arrayBuffer()));
    xlsxCache[category] = { at: Date.now(), rows };
    console.log(`[TennisV3] 🌐 xlsx ${category.toUpperCase()} ${year}: ${rows.length} lignes`);
    return rows;
  } catch (e: any) {
    console.error(`[TennisV3] ⚠️ xlsx ${category} KO (${e?.message}) — seed seul`);
    return cached.rows; // cache périmé accepté en fallback
  }
}

/** Convertit une cellule Date xlsx (série Excel, "YYYY-MM-DD", "DD/MM/YYYY") en ISO. */
function isoDate(v: any): string {
  // série Excel (nombre de jours depuis 1899-12-30)
  const n = Number(v);
  if (Number.isFinite(n) && n > 20000 && n < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return '';
}

function toMatch(d: Record<string, any>): V3Match | null {
  if (!d['Winner'] || !d['Loser'] || !d['Date']) return null;
  const dt = isoDate(d['Date']);
  if (!dt) return null;
  const w = parseCanonical(String(d['Winner'])).key;
  const l = parseCanonical(String(d['Loser'])).key;
  if (!w || !l || w === l) return null;
  const comment = String(d['Comment'] || '').toLowerCase();
  return {
    date: dt,
    w,
    l,
    surface: normSurface(String(d['Surface'] || 'Hard')),
    court: String(d['Court'] || 'Outdoor'),
    series: String(d['Series'] || ''),
    tourney: String(d['Tournament'] || ''),
    round: String(d['Round'] || ''),
    bo5: String(d['Best of'] || '3') === '5',
    wsets: safeInt(d['Wsets']),
    lsets: safeInt(d['Lsets']),
    walkover: comment.includes('walkover') || comment.includes('retired'),
    wrank: safeInt(d['WRank']),
    lrank: safeInt(d['LRank']),
    wpts: safeInt(d['WPts']),
    lpts: safeInt(d['LPts']),
  };
}

/** Construit l'état runtime complet (idempotent). Retourne true si seed dispo. */
async function buildRuntime(): Promise<boolean> {
  const seed = loadSeed();
  if (!seed) return false;

  // 1. Elo depuis les ratings du seed
  store = newEloStore();
  for (const [name, r] of Object.entries(seed.ratings)) {
    store.overall[name] = { rating: r.overall, games: r.games };
    store.hard[name] = { rating: r.hard, games: Math.round(r.games / 2) };
    store.clay[name] = { rating: r.clay, games: Math.round(r.games / 4) };
    store.grass[name] = { rating: r.grass, games: Math.round(r.games / 6) };
  }

  // 2. matchs récents du seed + incrémental xlsx (dédup)
  const matches: V3Match[] = seed.recentMatches.map((m) => ({ ...m }));
  const known = new Set(matches.map((m) => `${m.date}|${m.w}|${m.l}`));
  const [atpRows, wtaRows] = await Promise.all([fetchXlsxRows('atp'), fetchXlsxRows('wta')]);
  incrementalCount = 0;
  for (const d of [...atpRows, ...wtaRows]) {
    const m = toMatch(d);
    if (!m) continue;
    const k = `${m.date}|${m.w}|${m.l}`;
    if (known.has(k)) continue;
    known.add(k);
    matches.push(m);
    incrementalCount++;
  }
  matches.sort((a, b) => a.date.localeCompare(b.date));

  // 3. Elo incrémental : uniquement les matchs POSTÉRIEURS au seed
  const seedDate = seed.generatedAt;
  for (const m of matches) {
    if (m.date > seedDate) applyMatch(store, m);
  }

  runtimeMatches = matches;
  surnameIndex = buildSurnameIndex(Object.keys(seed.ratings));
  console.log(`[TennisV3] 🔧 Runtime: ${matches.length} matchs 150j (incrémental +${incrementalCount})`);
  return true;
}

/** Précharge tout (à appeler avant les prédictions). */
export async function ensureFreshData(): Promise<boolean> {
  if (store && Date.now() - (xlsxCache.atp.at || 0) < XLSX_TTL && Date.now() - (xlsxCache.wta.at || 0) < XLSX_TTL) {
    return true;
  }
  if (!buildPromise) {
    buildPromise = buildRuntime().finally(() => {
      buildPromise = null;
    });
  }
  return buildPromise;
}

export interface V3DataStatus {
  seed: { total: number; generatedAt: string; recent: number } | null;
  incrementalMatches: number;
  runtimeMatches: number;
  error: string | null;
}

export function getDataStatus(): V3DataStatus {
  const seed = loadSeed();
  return {
    seed: seed
      ? { total: seed.counts.total, generatedAt: seed.generatedAt, recent: seed.counts.recent }
      : null,
    incrementalMatches: incrementalCount,
    runtimeMatches: runtimeMatches.length,
    error: seedLoadError,
  };
}

export function invalidateCaches(): void {
  seedCache = null;
  store = null;
  runtimeMatches = [];
  surnameIndex = null;
  xlsxCache = { atp: { at: 0, rows: [] }, wta: { at: 0, rows: [] } };
}

export function getRuntimeMatches(): V3Match[] {
  return runtimeMatches;
}

export function getStore(): EloStore | null {
  return store;
}

export function getSurnameIndex(): Map<string, string[]> | null {
  return surnameIndex;
}

export function getRating(key: string) {
  return store?.overall[key] || null;
}

export { ELO_BASE, surfaceRating };
