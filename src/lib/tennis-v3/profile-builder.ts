/**
 * Tennis V3 — Constructeur de profils joueurs
 * Calcule les facteurs par joueur à partir du runtime (seed + incrémental) :
 * dominance (proxy service/retour), forme pondérée, surface, H2H, conditions, vetos.
 */

import { V3Match, V3PlayerProfile, V3Rating } from './types';
import { V3PlayerStats } from './types';
import { getRuntimeMatches, getStore, loadSeed, getSurnameIndex } from './data-service';
import { surfaceRating } from './elo-engine';
import { resolvePlayer } from './name-utils';

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Résout un nom (BetExplorer ou tennis-data) vers la clé canonique. */
export function resolveKey(name: string): string | null {
  const idx = getSurnameIndex();
  if (!idx) return null;
  return resolvePlayer(name, idx);
}

export function displayNameOf(key: string): string {
  const seed = loadSeed();
  return seed?.displayNames?.[key] || key;
}

/**
 * Profil complet d'un joueur (fenêtre 150 jours du runtime + stats 5 ans du seed).
 * matchesFor: matchs du runtime triés chronologiquement.
 */
export function buildProfile(
  key: string,
  matchesFor: V3Match[],
  today: string = todayStr()
): V3PlayerProfile | null {
  const seed = loadSeed();
  const store = getStore();
  if (!seed || !store) return null;

  const rating: V3Rating = seed.ratings[key]
    ? { ...seed.ratings[key] }
    : { overall: 1500, hard: 1500, clay: 1500, grass: 1500, games: 0 };
  // applique les updates incrémentaux éventuels (store = vérité runtime)
  const o = store.overall[key];
  if (o) {
    rating.overall = Math.round(o.rating * 10) / 10;
    rating.games = o.games;
    rating.hard = Math.round((store.hard[key]?.rating ?? 1500) * 10) / 10;
    rating.clay = Math.round((store.clay[key]?.rating ?? 1500) * 10) / 10;
    rating.grass = Math.round((store.grass[key]?.rating ?? 1500) * 10) / 10;
  }

  const stats: V3PlayerStats =
    seed.playerStats[key] || { hw: 0, hl: 0, cw: 0, cl: 0, gw: 0, gl: 0, iw: 0, il: 0, bo5: 0, m: 0, rank: 0, pts: 0 };

  // ---- fenêtre récente (chronologique) ----
  let dominanceNum = 0;
  let dominanceDen = 0;
  let formNum = 0;
  let formDen = 0;
  let matchesLast7d = 0;
  let matchesLast21d = 0;
  let lastMatch: V3Match | null = null;
  let lastMatchWalkover = false;

  const last7 = new Date(new Date(today).getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const last21 = new Date(new Date(today).getTime() - 21 * 86400000).toISOString().slice(0, 10);

  // dominance/forme : 25 derniers matchs de la fenêtre
  const playerMatches = matchesFor.filter((m) => m.w === key || m.l === key);
  const last25 = playerMatches.slice(-25);

  for (const m of playerMatches) {
    if (m.date >= last7) matchesLast7d++;
    if (m.date >= last21) matchesLast21d++;
  }
  for (let i = 0; i < last25.length; i++) {
    const m = last25[i];
    const isWin = m.w === key;
    // dominance : proxy service/retour via sets et marge de jeux
    // victoire 2-0 = 1.0 ; 2-1 = 0.65 ; défaite 1-2 = 0.35 ; 0-2 = 0.0 (forfait ≈ 0.2)
    let perf: number;
    if (m.walkover) perf = isWin ? 0.8 : 0.2;
    else {
      const ws = isWin ? m.wsets : m.lsets;
      const ls = isWin ? m.lsets : m.wsets;
      const total = ws + ls;
      if (total === 0) perf = isWin ? 0.8 : 0.2;
      else perf = ws / total;
      // ajuste par marge de jeux si sets 1-1 (tie-break écourté = plus plat)
      if (total >= 2 && ws === ls) perf = 0.5;
    }
    dominanceNum += perf;
    dominanceDen += 1;

    // forme pondérée : récence × qualité adversaire (rank)
    const oppRank = isWin ? m.lrank : m.wrank;
    const recencyW = Math.pow(0.93, last25.length - 1 - i);
    let oppW = 1.0;
    if (oppRank > 0) {
      if (oppRank <= 20) oppW = 2.0;
      else if (oppRank <= 50) oppW = 1.5;
      else if (oppRank <= 100) oppW = 1.2;
    }
    const winV = isWin ? 1 : 0;
    formNum += winV * recencyW * oppW;
    formDen += recencyW * oppW;
    if (m === playerMatches[playerMatches.length - 1]) {
      lastMatch = m;
      lastMatchWalkover = m.walkover;
    }
  }

  // ---- surface ----
  const surfaceMap: Record<string, [number, number]> = {
    Hard: [stats.hw, stats.hl],
    Clay: [stats.cw, stats.cl],
    Grass: [stats.gw, stats.gl],
  };
  const totalW = stats.hw + stats.cw + stats.gw;
  const totalL = stats.hl + stats.cl + stats.gl;
  const overallWinRate = totalW + totalL > 0 ? totalW / (totalW + totalL) : 0.5;

  // ---- H2H (fenêtre runtime 150j, poids 5% → volontairement light) ----
  // calculé à la demande par le service (a besoin de l'adversaire)

  const lastSeen = seed.lastSeen[key] || playerMatches[playerMatches.length - 1]?.date || null;

  const profile: V3PlayerProfile = {
    key,
    display: seed.displayNames?.[key] || key,
    rating,
    lastSeen: lastSeen || today,
    daysAbsent: lastSeen ? Math.max(0, daysBetween(lastSeen, today)) : 999,
    dominance: dominanceDen > 0 ? dominanceNum / dominanceDen : 0.5,
    dominanceSample: dominanceDen,
    formScore: formDen > 0 ? Math.min(1, formNum / formDen / 1.35) : 0.5, // 1.35 = normalisation pondération adversaires forts
    formSample: playerMatches.length,
    surfaceWinRate: 0.5, // renseigné par finalizeProfile()
    surfaceMatches: 0,
    overallWinRate,
    rankPoints: stats.pts,
    bo5Experience: stats.bo5,
    h2h: { wins: 0, losses: 0, surfaceWins: 0, surfaceLosses: 0, last: null },
    indoorWinRate: stats.iw + stats.il >= 10 ? stats.iw / (stats.iw + stats.il) : null,
    matchesLast7d,
    matchesLast21d,
    lastMatchWalkover,
  };
  return profile;
}

/** Finalise les champs dépendant du contexte du match (surface, adversaire). */
export function finalizeProfile(
  profile: V3PlayerProfile,
  surface: string,
  opponentKey: string,
  matchesFor: V3Match[]
): void {
  // surface winrate + sample (5 ans, seed)
  const seed = loadSeed();
  const stats = seed?.playerStats[profile.key];
  if (stats) {
    const map: Record<string, [number, number]> = {
      Hard: [stats.hw, stats.hl],
      Clay: [stats.cw, stats.cl],
      Grass: [stats.gw, stats.gl],
    };
    const [w, l] = map[surface] || [0, 0];
    profile.surfaceWinRate = w + l > 0 ? w / (w + l) : profile.overallWinRate;
    profile.surfaceMatches = w + l;
  }
  // H2H fenêtre 150j
  for (const m of matchesFor) {
    const involves = (m.w === profile.key || m.l === profile.key) && (m.w === opponentKey || m.l === opponentKey);
    if (!involves) continue;
    const isWin = m.w === profile.key;
    if (isWin) profile.h2h.wins++;
    else profile.h2h.losses++;
    if (m.surface === surface) {
      if (isWin) profile.h2h.surfaceWins++;
      else profile.h2h.surfaceLosses++;
    }
    profile.h2h.last = m.date;
  }
}
