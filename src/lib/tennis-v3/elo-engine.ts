/**
 * Tennis V3 — Moteur Elo (miroir EXACT de scripts/build_tennis_seed.py "elo-v1")
 * BASE=1500 ; K=250/(games+5)^0.4 ; margin (Bo3 2-0=1.0/2-1=0.85, Bo5 3-0=1.10/3-1=1.0/3-2=0.9)
 * bo5_mult=1.10 ; E=1/(1+10^(-d/400)) ; le perdant perd exactement ce que gagne le gagnant.
 * Deux pistes : overall + surface (Hard/Clay/Grass, indoor compté en Hard).
 */

import { V3Match, V3Rating } from './types';

export const ELO_BASE = 1500;

export function kFactor(games: number): number {
  return 250 / Math.pow(games + 5, 0.4);
}

export function marginMult(wsets: number, lsets: number, bo5: boolean): number {
  if (bo5) {
    const diff = wsets - lsets;
    if (diff >= 3) return 1.1;
    if (diff === 2) return 1.0;
    return 0.9; // 3-2 ou forfait
  }
  const diff = wsets - lsets;
  if (diff >= 2) return 1.0;
  return 0.85; // 2-1 ou forfait
}

export function expected(ra: number, rb: number): number {
  return 1 / (1 + Math.pow(10, -(ra - rb) / 400));
}

export interface EloStore {
  overall: Record<string, { rating: number; games: number }>;
  hard: Record<string, { rating: number; games: number }>;
  clay: Record<string, { rating: number; games: number }>;
  grass: Record<string, { rating: number; games: number }>;
}

export function newEloStore(): EloStore {
  return { overall: {}, hard: {}, clay: {}, grass: {} };
}

function track(store: EloStore, surface: string): Record<string, { rating: number; games: number }> {
  switch (surface) {
    case 'Clay': return store.clay;
    case 'Grass': return store.grass;
    default: return store.hard;
  }
}

/** Applique un match (chronologique obligatoire) — mute le store. */
export function applyMatch(store: EloStore, m: V3Match): void {
  const margin = marginMult(m.wsets, m.lsets, m.bo5);
  const bo5m = m.bo5 ? 1.1 : 1.0;
  const surfaces: Array<Record<string, { rating: number; games: number }>> = [store.overall, track(store, m.surface)];
  for (const d of surfaces) {
    const W = d[m.w] || { rating: ELO_BASE, games: 0 };
    const L = d[m.l] || { rating: ELO_BASE, games: 0 };
    const e = expected(W.rating, L.rating);
    const delta = kFactor(W.games) * bo5m * margin * (1 - e);
    d[m.w] = { rating: W.rating + delta, games: W.games + 1 };
    d[m.l] = { rating: L.rating - delta, games: L.games + 1 };
  }
}

/** Résume un store en ratings par joueur. */
export function snapshotRatings(store: EloStore): Record<string, import('./types').V3Rating> {
  const names = new Set<string>([
    ...Object.keys(store.overall),
    ...Object.keys(store.hard),
    ...Object.keys(store.clay),
    ...Object.keys(store.grass),
  ]);
  const out: Record<string, import('./types').V3Rating> = {};
  for (const n of names) {
    const o = store.overall[n] || { rating: ELO_BASE, games: 0 };
    out[n] = {
      overall: Math.round(o.rating * 10) / 10,
      games: o.games,
      hard: Math.round((store.hard[n]?.rating ?? ELO_BASE) * 10) / 10,
      clay: Math.round((store.clay[n]?.rating ?? ELO_BASE) * 10) / 10,
      grass: Math.round((store.grass[n]?.rating ?? ELO_BASE) * 10) / 10,
    };
  }
  return out;
}

/** Elo surface avec shrinkage vers l'overall si sample surface trop petit. */
export function surfaceRating(r: V3Rating, surface: string): number {
  const raw =
    surface === 'Clay' ? r.clay : surface === 'Grass' ? r.grass : r.hard;
  const gamesSurface =
    surface === 'Clay'
      ? Math.max(0, r.games / 4)
      : surface === 'Grass'
        ? Math.max(0, r.games / 6)
        : Math.max(0, r.games / 2);
  // si sample surface estimé < 20 matchs → mix avec overall
  const w = Math.min(1, gamesSurface / 20);
  return raw * w + r.overall * (1 - w);
}
