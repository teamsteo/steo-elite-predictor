/**
 * oddsConsensus.ts — P4 Phase 2 : consensus multi-bookmakers
 *
 * FAIBLESSE VISÉE : l'edge est calculé contre la ligne DraftKings/ESPN seule.
 * Un value bet « faux positif » vient souvent d'une ligne isolée — le marché
 * consensus est la référence honnête.
 *
 * SOURCE 0 € : The Odds API (déjà intégrée, clé déjà utilisée en fallback) —
 * la réponse h2h contient TOUS les bookmakers par match; l'ancien code n'en
 * lisait qu'un seul. 1 appel/jour pour la MLB (cache journalier) → ≤ 31
 * appels/mois, très loin du free tier 500/mois. Anti-ban: via stealthFetch.
 *
 * ANTI-RÉGRESSION :
 *  - Les cotes PRIMAIRES (ESPN/DraftKings) ne sont JAMAIS modifiées.
 *  - Le consensus est ADDITIF (champs optionnels, fallback automatique).
 *  - Kill-switch: ODDS_CONSENSUS_DISABLED=true désactive tout (sans redeploy).
 *  - L'edge utilise le meilleur prix SEULEMENT si ≥ 3 books couvrent le match.
 */

import { stealthFetch } from './stealthFetch';

export interface BookOdds {
  bookmaker: string;
  home: number;
  draw: number | null;
  away: number;
}

export interface ConsensusOdds {
  /** Meilleur prix par issue (max des books) — ce que le parieur peut viser */
  best: { home: number; draw: number | null; away: number };
  /** Médiane par issue — référence marché la plus robuste */
  median: { home: number; draw: number | null; away: number };
  /** Nombre de bookmakers concordants */
  bookCount: number;
  /** Écart max-min sur le favori (dispersion du marché) */
  spread: number;
}

export function normalizeTeamKey(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Clé de matching tolérante: l'équipe la plus longue contient-elle l'autre ? */
export function teamsMatch(a: string, b: string): boolean {
  const ka = normalizeTeamKey(a);
  const kb = normalizeTeamKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  return ka.length >= kb.length ? ka.includes(kb) : kb.includes(ka);
}

/**
 * Extrait TOUS les bookmakers h2h d'un event The Odds API
 * (l'ancien code ne lisait que le 1er book trouvé).
 */
export function collectBooksFromOddsApiEvent(event: any): BookOdds[] {
  const books: BookOdds[] = [];
  const home = event?.home_team || '';
  const away = event?.away_team || '';
  if (!home || !away) return books;

  for (const b of event.bookmakers || []) {
    const h2h = (b.markets || []).find((m: any) => m.key === 'h2h');
    if (!h2h?.outcomes?.length) continue;
    const homeOut = h2h.outcomes.find((o: any) => o.name === home);
    const awayOut = h2h.outcomes.find((o: any) => o.name === away);
    // 2 issues (US sports) : le draw peut être absent
    const drawOut = h2h.outcomes.find((o: any) => o.name === 'Draw');
    if (homeOut?.price && awayOut?.price) {
      books.push({
        bookmaker: b.key || b.title || 'unknown',
        home: homeOut.price,
        away: awayOut.price,
        draw: drawOut?.price ?? null,
      });
    }
  }
  return books;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Construit le consensus (best + médiane) depuis une liste de books.
 * Garde-fou: < 2 books → null (pas de consensus fiable).
 */
export function buildConsensus(books: BookOdds[]): ConsensusOdds | null {
  if (!books || books.length < 2) return null;

  const homes = books.map((b) => b.home).filter((v) => v > 1);
  const aways = books.map((b) => b.away).filter((v) => v > 1);
  const draws = books.map((b) => b.draw).filter((v): v is number => v != null && v > 1);
  if (homes.length < 2 || aways.length < 2) return null;

  const drawOdds = draws.length >= 2 ? median(draws) : null;
  // Dispersion sur le favori (issue la plus courte)
  const favSpread = Math.max(
    Math.max(...homes) - Math.min(...homes),
    Math.max(...aways) - Math.min(...aways),
  );

  return {
    best: {
      home: Math.max(...homes),
      away: Math.max(...aways),
      draw: draws.length >= 2 ? Math.max(...draws) : null,
    },
    median: {
      home: median(homes),
      away: median(aways),
      draw: drawOdds,
    },
    bookCount: books.length,
    spread: Math.round(favSpread * 100) / 100,
  };
}

/** Consensus par match depuis les events The Odds API d'une ligue */
export function buildConsensusMapFromOddsApi(events: any[]): Map<string, ConsensusOdds> {
  const map = new Map<string, ConsensusOdds>();
  for (const ev of events || []) {
    const books = collectBooksFromOddsApiEvent(ev);
    const consensus = buildConsensus(books);
    if (!consensus) continue;
    // Indexer par les DEUX sens (home_away) pour matching robuste
    map.set(`${normalizeTeamKey(ev.home_team)}|${normalizeTeamKey(ev.away_team)}`, consensus);
  }
  return map;
}

// ─── Cache journalier par ligue (0 € : 1 appel/ligue/jour) ──────────────────

interface DailyCacheEntry {
  dateUTC: string;
  map: Map<string, ConsensusOdds>;
}

const consensusCaches = new Map<string, DailyCacheEntry>();

function todayUTC(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Consensus The Odds API pour une ligue, max 1 appel/jour (cache).
 * sportsOddsApi: ex. 'baseball_mlb'. Échec → Map vide (jamais bloquant).
 */
export async function fetchDailyConsensus(
  oddsApiSportKey: string,
  apiKey: string,
): Promise<Map<string, ConsensusOdds>> {
  const today = todayUTC();
  const cached = consensusCaches.get(oddsApiSportKey);
  if (cached && cached.dateUTC === today) return cached.map;

  const empty = new Map<string, ConsensusOdds>();
  if (!apiKey) return empty;

  try {
    const url = `https://api.the-odds-api.com/v4/sports/${oddsApiSportKey}/odds/?apiKey=${apiKey}&regions=eu,us&markets=h2h&oddsFormat=decimal`;
    const resp = await stealthFetch(url, { signal: AbortSignal.timeout(10000), maxRetries: 1 });
    if (!resp.ok) {
      console.log(`📡 [CONSENSUS] ${oddsApiSportKey}: HTTP ${resp.status} (cache conservé)`);
      consensusCaches.set(oddsApiSportKey, { dateUTC: today, map: empty });
      return empty;
    }
    const events = await resp.json();
    const map = buildConsensusMapFromOddsApi(Array.isArray(events) ? events : []);
    console.log(`📡 [CONSENSUS] ${oddsApiSportKey}: ${map.size} matchs multi-books (>=2 books)`);
    consensusCaches.set(oddsApiSportKey, { dateUTC: today, map });
    return map;
  } catch (e: any) {
    console.log(`📡 [CONSENSUS] ${oddsApiSportKey} échec (non bloquant): ${e.message}`);
    consensusCaches.set(oddsApiSportKey, { dateUTC: today, map: empty });
    return empty;
  }
}

/** Recherche consensus d'un match par équipes (matching tolérant, 2 sens) */
export function findConsensus(
  map: Map<string, ConsensusOdds>,
  homeTeam: string,
  awayTeam: string,
): ConsensusOdds | null {
  for (const [key, consensus] of map) {
    const [kHome, kAway] = key.split('|');
    if (teamsMatch(kHome, homeTeam) && teamsMatch(kAway, awayTeam)) return consensus;
    // Sens inversé (home/away swap selon la source)
    if (teamsMatch(kHome, awayTeam) && teamsMatch(kAway, homeTeam)) {
      return {
        best: { home: consensus.best.away, draw: consensus.best.draw, away: consensus.best.home },
        median: { home: consensus.median.away, draw: consensus.median.draw, away: consensus.median.home },
        bookCount: consensus.bookCount,
        spread: consensus.spread,
      };
    }
  }
  return null;
}

/**
 * L'edge doit-il être calculé contre le meilleur prix consensus ?
 * Garde-fous: kill-switch env, ≥ 3 books, consensus présent.
 */
export function shouldUseConsensusEdge(consensus: ConsensusOdds | null | undefined): boolean {
  if (!consensus) return false;
  if (process.env.ODDS_CONSENSUS_DISABLED === 'true') return false;
  if (process.env.ODDS_CONSENSUS_EDGE === 'false') return false;
  return consensus.bookCount >= 3;
}
