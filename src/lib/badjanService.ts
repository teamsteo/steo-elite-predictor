/**
 * ═══════════════════════════════════════════════════════════════════
 * BADJAN — Section Telegram dédiée (Task 14)
 * ═══════════════════════════════════════════════════════════════════
 * Spécification utilisateur :
 * - Matchs de FOOT uniquement, scrappés par le pipeline du jour
 * - Filtre : niveau de risque ≤ 45 %
 * - Les favoris doivent TOUS jouer à DOMICILE (prédiction home
 *   + cote domicile la plus basse du 1X2)
 * - AUCUNE sauvegarde Supabase, AUCUN bilan (verify) — juste une publication
 *
 * Fichier volontairement ISOLÉ : zéro import depuis le code existant
 * hors helpers Telegram exportés, zéro écriture DB, zéro impact sur
 * les sections summary / valuebets / kamikaze / combo.
 * ═══════════════════════════════════════════════════════════════════
 */

// ── Constantes BADJAN ──
export const BADJAN_MAX_RISK = 45;
export const BADJAN_MIN_FAVORITE_ODDS = 1.10; // garde-fou anti-cote corrompue
const TELEGRAM_MAX_LENGTH = 4096;

// ── Types (loose = compatibles avec le pipeline) ──
export interface BadjanMatchInput {
  homeTeam: string;
  awayTeam: string;
  sport?: string;
  league?: string;
  date?: string;
  displayDate?: string;
  predictedResult?: 'home' | 'away' | 'draw';
  confidence?: string;
  riskPercentage?: number;
  winProbability?: number;
  oddsHome?: number;
  oddsAway?: number;
  oddsDraw?: number | null;
  isEstimated?: boolean;
  recommendation?: string;
  _dixonColes?: any;
  [key: string]: any; // champs extra du pipeline tolérés
}

export interface BadjanPublishResult {
  success: boolean;
  picks: number;
  message?: string;
}

// ── Helpers locaux (répliques minimales, zéro couplage) ──

/** Foot uniquement : 'Football', 'football', 'soccer' (même logique que telegramService). */
function isFootballSport(sport?: string): boolean {
  if (!sport) return false;
  const s = sport.toLowerCase();
  return s.includes('foot') || s === 'soccer';
}

function formatBadjanDateTime(dateStr?: string, displayDate?: string): { date: string; time: string } {
  try {
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                            'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        // UTC : ESPN fournit des dates UTC, le canal Telegram est en UTC+0 (cohérent avec les autres sections)
        const date = `${dayNames[d.getUTCDay()]} ${d.getUTCDate()} ${monthNames[d.getUTCMonth()]}`;
        const time = `${d.getUTCHours().toString().padStart(2, '0')}h${d.getUTCMinutes().toString().padStart(2, '0')}`;
        return { date, time };
      }
    }
    if (displayDate) {
      const parts = displayDate.split(',');
      if (parts.length >= 2) return { date: parts[0].trim(), time: parts[1].trim() };
      return { date: displayDate, time: '' };
    }
    return { date: 'Date inconnue', time: '' };
  } catch {
    return { date: 'Date inconnue', time: '' };
  }
}

/** Dedup interne : mêmes équipes + même date = un seul pick. */
function dedupBadjan<T extends { homeTeam?: string; awayTeam?: string; date?: string }>(matches: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const m of matches) {
    const key = `${(m.homeTeam || '').toLowerCase().trim()}__${(m.awayTeam || '').toLowerCase().trim()}__${(m.date || '').split('T')[0]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════
// FILTRE BADJAN (pur, testable, sans réseau ni DB)
// ═══════════════════════════════════════════════════════════════════

/**
 * Filtre BADJAN strict :
 * 1. Football uniquement
 * 2. riskPercentage défini et ≤ 45
 * 3. Favori à domicile : prédiction 'home' ET cote domicile strictement
 *    la plus basse du 1X2 (le marché confirme le favori domicile)
 * 4. Cotes réelles (pas d'estimation) et cote favori plausible
 */
export function filterBadjanMatches(matches: BadjanMatchInput[]): BadjanMatchInput[] {
  const filtered = (matches || []).filter(m => {
    // 1. Football uniquement
    if (!isFootballSport(m.sport)) return false;

    // 2. Risque défini et ≤ 45 %
    if (typeof m.riskPercentage !== 'number' || !isFinite(m.riskPercentage)) return false;
    if (m.riskPercentage > BADJAN_MAX_RISK) return false;

    // 3. Favori à domicile
    if (m.predictedResult !== 'home') return false;
    const oh = m.oddsHome, oa = m.oddsAway, od = m.oddsDraw;
    if (typeof oh !== 'number' || typeof oa !== 'number' || !isFinite(oh) || !isFinite(oa)) return false;
    if (oh < BADJAN_MIN_FAVORITE_ODDS) return false;          // cote corrompue
    if (oh >= oa) return false;                               // marché : away au moins aussi bas → pas favori net
    if (typeof od === 'number' && isFinite(od) && oh >= od) return false; // nul coté plus bas → pas favori

    // 4. Cotes réelles uniquement (le risque doit être fiable)
    if (m.isEstimated) return false;

    return true;
  });

  // Dedup puis tri : risque croissant (le plus sûr d'abord), puis date
  const deduped = dedupBadjan(filtered);
  deduped.sort((a, b) => {
    const r = (a.riskPercentage ?? 100) - (b.riskPercentage ?? 100);
    if (r !== 0) return r;
    return new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime();
  });
  return deduped;
}

// ═══════════════════════════════════════════════════════════════════
// ENRICHISSEMENT BADJAN (Task 27 + Task 31 fallback cotes)
// ═══════════════════════════════════════════════════════════════════
// Spécification utilisateur : en plus de jouer à DOMICILE et d'être FAVORI,
// le pick doit avoir :
//   1. un BON RATIO DE VICTOIRE À DOMICILE (saison en cours, ESPN schedule)
//   2. un BON RATIO EN H2H (confrontations directes, ESPN summary/seasonseries)
// Sources 100% gratuites (site.api.espn.com — déjà utilisées par le pipeline).
//
// 🆕 Task 31 — FALLBACK COTES : si les stats ESPN sont indisponibles ou
// insuffisantes (équipes nationales, coupes, début de saison), le pick est
// accepté UNIQUEMENT si probHome ≥ BADJAN_FALLBACK_MIN_PROB_HOME (cotes 1X2
// normalisées, marge bookmaker retirée). Préserve l'esprit "favori domicile
// vérifié" via le marché quand ESPN n'a pas l'historique. Cache mémoire 6h.
// (Ancien fail-closed : si stats indispo ET probHome < 55%, rejet.)

export const BADJAN_MIN_HOME_WIN_RATIO = 0.5; // ≥ 50% de victoires à domicile
export const BADJAN_MIN_H2H_WIN_RATIO = 0.5;  // ≥ 50% de victoires en H2H
export const BADJAN_MIN_HOME_GAMES = 2;       // échantillon minimum à domicile
export const BADJAN_MIN_H2H_GAMES = 2;        // échantillon minimum H2H

// 🆕 Task 31 — FALLBACK COTES : si stats ESPN indisponibles (équipes nationales,
// coupes, début de saison), on bascule sur le marché (cotes 1X2 normalisées).
// Seuil probHome ≥ 55% = favori clair selon le marché. Préserve l'esprit
// "favori domicile vérifié" sans bloquer les matchs sans historique ESPN.
export const BADJAN_FALLBACK_MIN_PROB_HOME = 0.55;
const ESPN_TIMEOUT_MS = 8000;
const STATS_CACHE_TTL_MS = 6 * 3600 * 1000;

export interface BadjanHomeRecord {
  played: number;
  wins: number;
  draws: number;
  losses: number;
}

export interface BadjanH2HRecord {
  total: number;
  wins: number;   // victoires de l'équipe à domicile du pick
  draws: number;
  losses: number; // défaites face à l'adversaire du jour
}

export interface BadjanStats {
  home: BadjanHomeRecord;
  homeWinRatio: number; // 0..1
  h2h: BadjanH2HRecord;
  h2hWinRatio: number;  // 0..1
  // 🆕 Task 31 — badge fallback cotes (stats ESPN indispo, validation marché)
  fallback?: 'cotes';
  // 🆕 Task 31 — probHome marché normalisé (cotes 1X2, marge bookmaker retirée)
  // Stocké séparément de homeWinRatio pour affichage clair.
  probHomeMarket?: number;  // 0..1
}

export interface EnrichedBadjanMatch extends BadjanMatchInput {
  badjanStats?: BadjanStats;
}

async function espnJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(ESPN_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const homeRecordCache = new Map<string, { data: BadjanHomeRecord | null; ts: number }>();
const h2hCache = new Map<string, { data: BadjanH2HRecord | null; ts: number }>();

function cacheGet<T>(cache: Map<string, { data: T | null; ts: number }>, key: string): T | null | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.ts > STATS_CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.data;
}

function cacheSet<T>(cache: Map<string, { data: T | null; ts: number }>, key: string, data: T | null): void {
  cache.set(key, { data, ts: Date.now() });
}

/**
 * Ratio de victoires À DOMICILE de l'équipe (ESPN schedule, gratuit).
 * 1. Échantillon de la compétition du match (saison en cours).
 * 2. Fallback: si cet échantillon est trop faible (coupe d'Europe, coupe
 *    nationale — 0/1 match domicile), on utilise la LIGUE DOMESTIQUE de
 *    l'équipe (ESPN team → defaultLeague) — échantillon bien plus riche.
 */
export async function fetchBadjanHomeRecord(leagueSlug: string, teamId: string): Promise<BadjanHomeRecord | null> {
  if (!leagueSlug || !teamId) return null;
  const record = await fetchHomeRecordForSlug(leagueSlug, teamId);
  if (record && record.played >= BADJAN_MIN_HOME_GAMES) return record;

  // Fallback ligue domestique (Task 27): compétitions à peu de matchs domicile
  try {
    const defaultSlug = await fetchDefaultLeagueSlug(leagueSlug, teamId);
    if (defaultSlug && defaultSlug !== leagueSlug) {
      const fallback = await fetchHomeRecordForSlug(defaultSlug, teamId);
      if (fallback && fallback.played > 0) return fallback;
    }
  } catch { /* non bloquant */ }
  return record;
}

async function fetchHomeRecordForSlug(leagueSlug: string, teamId: string): Promise<BadjanHomeRecord | null> {
  const cacheKey = `${leagueSlug}#${teamId}`;
  const cached = cacheGet(homeRecordCache, cacheKey);
  if (cached !== undefined) return cached;

  const data = await espnJson(`https://site.api.espn.com/apis/site/v2/sports/${leagueSlug}/teams/${teamId}/schedule`);
  const record: BadjanHomeRecord = { played: 0, wins: 0, draws: 0, losses: 0 };
  try {
    const events = data?.events || [];
    for (const ev of events) {
      const comps = ev?.competitions?.[0]?.competitors || [];
      const ours = comps.find((c: any) => String(c?.team?.id) === String(teamId) && c?.homeAway === 'home');
      if (!ours) continue; // on ne compte que les matchs joués à domicile
      if (ours.winner !== true && ours.winner !== false) continue; // pas encore joué
      record.played++;
      if (ours.winner === true) record.wins++;
      else {
        // nul si aucun competitor gagnant, défaite si l'adversaire a gagné
        const oppWon = comps.some((c: any) => c !== ours && c?.winner === true);
        if (oppWon) record.losses++; else record.draws++;
      }
    }
  } catch {
    cacheSet(homeRecordCache, cacheKey, null);
    return null;
  }
  cacheSet(homeRecordCache, cacheKey, record);
  return record;
}

const defaultLeagueCache = new Map<string, { data: string | null; ts: number }>();

/** Ligue domestique de l'équipe (ESPN team.defaultLeague) → slug 'soccer/{slug}'. */
async function fetchDefaultLeagueSlug(leagueSlug: string, teamId: string): Promise<string | null> {
  const cacheKey = `${leagueSlug}#${teamId}`;
  const hit = defaultLeagueCache.get(cacheKey);
  if (hit && (Date.now() - hit.ts) <= STATS_CACHE_TTL_MS) return hit.data;
  if (hit) defaultLeagueCache.delete(cacheKey);
  const data = await espnJson(`https://site.api.espn.com/apis/site/v2/sports/${leagueSlug}/teams/${teamId}`);
  const slug: string | null = (data?.team?.defaultLeague?.slug || data?.team?.leagueAbbrev || null) as string | null;
  const out: string | null = slug ? `soccer/${slug}` : null;
  defaultLeagueCache.set(cacheKey, { data: out, ts: Date.now() });
  return out;
}

/**
 * Ratio de victoires en H2H (confrontations directes) pour l'équipe à domicile du pick.
 * Source: GET /sports/{slug}/summary?event={id} → seasonseries (gratuit ESPN).
 */
export async function fetchBadjanH2H(leagueSlug: string, eventId: string, homeTeamId: string): Promise<BadjanH2HRecord | null> {
  if (!leagueSlug || !eventId || !homeTeamId) return null;
  const cacheKey = `${leagueSlug}#${eventId}`;
  const cached = cacheGet(h2hCache, cacheKey);
  if (cached !== undefined) return cached;

  const data = await espnJson(`https://site.api.espn.com/apis/site/v2/sports/${leagueSlug}/summary?event=${eventId}`);
  const record: BadjanH2HRecord = { total: 0, wins: 0, draws: 0, losses: 0 };
  try {
    const series = (data?.seasonseries || []).find((s: any) => s?.type === 'head-to-head') || data?.seasonseries?.[0];
    const events = series?.events || [];
    for (const ev of events) {
      if (String(ev?.id) === String(eventId)) continue;      // le match du jour ne compte pas
      if (ev?.statusType?.completed !== true) continue;      // seulement les matchs joués
      const comps = ev?.competitors || [];
      const ours = comps.find((c: any) => String(c?.team?.id) === String(homeTeamId));
      if (!ours) continue; // confrontation sur terrain neutre sous autre identité → ignorée
      record.total++;
      if (ours.winner === true) record.wins++;
      else if (comps.some((c: any) => c !== ours && c?.winner === true)) record.losses++;
      else record.draws++;
    }
  } catch {
    cacheSet(h2hCache, cacheKey, null);
    return null;
  }
  cacheSet(h2hCache, cacheKey, record);
  return record;
}

/**
 * Évaluation PURE des ratios (testable sans réseau).
 * Retourne pass=false + reason si un critère n'est pas satisfait.
 *
 * 🆕 Task 31 — FALLBACK COTES : si stats ESPN indisponibles ou insuffisantes
 * (home null/joué<2 OU h2h null/total<2), on accepte le pick UNIQUEMENT si
 * probHomeFallback ≥ BADJAN_FALLBACK_MIN_PROB_HOME (favori clair selon marché).
 * Ce fallback préserve l'esprit "favori domicile vérifié" sans bloquer les
 * matchs sans historique ESPN (équipes nationales, coupes, début saison).
 */
export function evaluateBadjanRatios(
  home: BadjanHomeRecord | null,
  h2h: BadjanH2HRecord | null,
  probHomeFallback?: number  // 🆕 0..1 — probHome normalisée 1X2 (fallback marché)
): { pass: boolean; reason?: string; stats?: BadjanStats } {
  // ── Chemin strict (Task 27) : stats ESPN disponibles ET échantillons suffisants
  const hasHome = !!home && isFinite(home.played) && home.played >= BADJAN_MIN_HOME_GAMES;
  const hasH2H = !!h2h && isFinite(h2h.total) && h2h.total >= BADJAN_MIN_H2H_GAMES;

  if (hasHome && hasH2H) {
    const homeWinRatio = home!.wins / home!.played;
    if (homeWinRatio < BADJAN_MIN_HOME_WIN_RATIO) {
      // Ratio domicile faible — on tente quand même le fallback cotes si probHome est solide
      if (typeof probHomeFallback === 'number' && isFinite(probHomeFallback) && probHomeFallback >= BADJAN_FALLBACK_MIN_PROB_HOME) {
        return {
          pass: true,
          stats: {
            home: home!,
            homeWinRatio,
            h2h: h2h!,
            h2hWinRatio: h2h!.wins / h2h!.total,
            fallback: 'cotes',
            probHomeMarket: probHomeFallback,
          },
        };
      }
      return { pass: false, reason: `ratio domicile trop faible (${Math.round(homeWinRatio * 100)}% V < ${Math.round(BADJAN_MIN_HOME_WIN_RATIO * 100)}%)` };
    }
    const h2hWinRatio = h2h!.wins / h2h!.total;
    if (h2hWinRatio < BADJAN_MIN_H2H_WIN_RATIO) {
      if (typeof probHomeFallback === 'number' && isFinite(probHomeFallback) && probHomeFallback >= BADJAN_FALLBACK_MIN_PROB_HOME) {
        return {
          pass: true,
          stats: {
            home: home!,
            homeWinRatio,
            h2h: h2h!,
            h2hWinRatio,
            fallback: 'cotes',
            probHomeMarket: probHomeFallback,
          },
        };
      }
      return { pass: false, reason: `ratio H2H trop faible (${Math.round(h2hWinRatio * 100)}% V < ${Math.round(BADJAN_MIN_H2H_WIN_RATIO * 100)}%)` };
    }
    return {
      pass: true,
      stats: { home: home!, homeWinRatio, h2h: h2h!, h2hWinRatio },
    };
  }

  // ── Chemin fallback (Task 31) : stats ESPN indispo/insuffisantes → marché
  const missingHomeReason = !home
    ? 'stats domicile indisponibles (ESPN)'
    : `échantillon domicile insuffisant (${home.played} match${home.played > 1 ? 's' : ''} < ${BADJAN_MIN_HOME_GAMES})`;
  const missingH2HReason = !h2h
    ? 'stats H2H indisponibles (ESPN)'
    : `échantillon H2H insuffisant (${h2h.total} confrontation${h2h.total > 1 ? 's' : ''} < ${BADJAN_MIN_H2H_GAMES})`;

  if (typeof probHomeFallback === 'number' && isFinite(probHomeFallback) && probHomeFallback >= BADJAN_FALLBACK_MIN_PROB_HOME) {
    // Fallback marché validé : favori domicile clair selon les cotes
    const homeRecord = home || { played: 0, wins: 0, draws: 0, losses: 0 };
    const h2hRecord = h2h || { total: 0, wins: 0, draws: 0, losses: 0 };
    return {
      pass: true,
      stats: {
        home: homeRecord,
        homeWinRatio: homeRecord.played > 0 ? homeRecord.wins / homeRecord.played : probHomeFallback,
        h2h: h2hRecord,
        h2hWinRatio: h2hRecord.total > 0 ? h2hRecord.wins / h2hRecord.total : 0,
        fallback: 'cotes',
        probHomeMarket: probHomeFallback,
      },
    };
  }

  // Pas de fallback possible : raison détaillée pour le diagnostic
  if (!home || home.played < BADJAN_MIN_HOME_GAMES) {
    return { pass: false, reason: `${missingHomeReason} (fallback cotes: probHome ${probHomeFallback !== undefined ? Math.round(probHomeFallback * 100) + '%' : 'N/A'} < ${Math.round(BADJAN_FALLBACK_MIN_PROB_HOME * 100)}%)` };
  }
  return { pass: false, reason: `${missingH2HReason} (fallback cotes: probHome ${probHomeFallback !== undefined ? Math.round(probHomeFallback * 100) + '%' : 'N/A'} < ${Math.round(BADJAN_FALLBACK_MIN_PROB_HOME * 100)}%)` };
}

export interface BadjanFunnelEnriched extends BadjanFunnel {
  candidates: number;         // après le filtre de base (foot + risque + favori domicile)
  statsChecked: number;       // stats ESPN récupérées (2 req/candidat)
  statsUnavailable: number;   // rejetés: ESPN injoignable / IDs manquants (avant fallback)
  homeRatioRejected: number;  // rejetés: ratio domicile < seuil (ET fallback cotes insuffisant)
  h2hRejected: number;        // rejetés: ratio H2H < seuil (ET fallback cotes insuffisant)
  fallbackCotes: number;      // 🆕 Task 31 — picks validés via fallback marché (stats ESPN indispo)
  finalPicks: number;         // picks finaux enrichis (strict + fallback)
  rejectionDetails: string[]; // motifs individuels (max 10, pour diagnostic)
}

/**
 * Chaîne complète BADJAN : filtre de base (sync) + enrichissement stats + filtres ratios.
 * Task 27 : fail-closed strict (stats ESPN requises).
 * Task 31 : fallback cotes normalisées si stats ESPN indispo (probHome ≥ 55%).
 */
export async function enrichAndFilterBadjan(matches: BadjanMatchInput[]): Promise<{ picks: EnrichedBadjanMatch[]; funnel: BadjanFunnelEnriched }> {
  const base = filterBadjanMatches(matches);
  const funnel: BadjanFunnelEnriched = {
    ...analyzeBadjanFunnel(matches),
    candidates: base.length,
    statsChecked: 0,
    statsUnavailable: 0,
    homeRatioRejected: 0,
    h2hRejected: 0,
    fallbackCotes: 0,
    finalPicks: 0,
    rejectionDetails: [],
  };

  if (base.length === 0) {
    if (!funnel.reason) funnel.reason = '0 candidat après filtre de base BADJAN';
    return { picks: [], funnel };
  }

  // 🆕 Task 31 — calcul probHome fallback (cotes 1X2 normalisées, marge bookmaker retirée)
  function computeProbHome(m: BadjanMatchInput): number {
    const oh = m.oddsHome, oa = m.oddsAway, od = m.oddsDraw;
    const invH = typeof oh === 'number' && oh > 0 ? 1 / oh : 0;
    const invA = typeof oa === 'number' && oa > 0 ? 1 / oa : 0;
    const invD = typeof od === 'number' && od > 0 ? 1 / od : 0;
    const invSum = invH + invA + invD;
    return invSum > 0 ? invH / invSum : 0;
  }

  // Récupération parallèle des stats (2 req max par candidat, cachées 6h)
  const settled = await Promise.all(base.map(async (m) => {
    const leagueSlug: string = (m as any).espnLeagueSlug || '';
    const homeTeamId: string = String((m as any).homeTeamId || '');
    const eventId: string = String((m as any).espnEventId || '');
    const probHomeFallback = computeProbHome(m);
    if (!leagueSlug || !homeTeamId || !eventId) {
      return { match: m, home: null, h2h: null, missing: true, probHomeFallback };
    }
    const [home, h2h] = await Promise.all([
      fetchBadjanHomeRecord(leagueSlug, homeTeamId),
      fetchBadjanH2H(leagueSlug, eventId, homeTeamId),
    ]);
    return { match: m as EnrichedBadjanMatch, home, h2h, missing: !home || !h2h, probHomeFallback };
  }));

  const picks: EnrichedBadjanMatch[] = [];
  for (const s of settled) {
    // 🆕 Task 31 — passe systématique par evaluateBadjanRatios qui gère le fallback
    const hasStats = !!s.home && !!s.h2h;
    if (hasStats) funnel.statsChecked++;
    else funnel.statsUnavailable++;

    const evalRes = evaluateBadjanRatios(s.home, s.h2h, s.probHomeFallback);
    if (evalRes.pass && evalRes.stats) {
      s.match.badjanStats = evalRes.stats;
      if (evalRes.stats.fallback === 'cotes') funnel.fallbackCotes++;
      picks.push(s.match);
      continue;
    }

    // Rejet — catégorisation pour le funnel
    const isHomeIssue = evalRes.reason?.includes('domicile');
    if (isHomeIssue) funnel.homeRatioRejected++; else funnel.h2hRejected++;
    if (funnel.rejectionDetails.length < 10) {
      funnel.rejectionDetails.push(`${s.match.homeTeam} vs ${s.match.awayTeam}: ${evalRes.reason}`);
    }
  }

  funnel.finalPicks = picks.length;
  if (picks.length === 0) {
    funnel.reason = funnel.statsUnavailable > 0 && funnel.statsChecked === 0
      ? `Stats ESPN indispo et probHome < ${Math.round(BADJAN_FALLBACK_MIN_PROB_HOME * 100)}% pour tous les candidats`
      : `Aucun candidat ne passe les ratios (domicile ≥ ${Math.round(BADJAN_MIN_HOME_WIN_RATIO * 100)}% V, H2H ≥ ${Math.round(BADJAN_MIN_H2H_WIN_RATIO * 100)}% V, fallback cotes ≥ ${Math.round(BADJAN_FALLBACK_MIN_PROB_HOME * 100)}%)`;
  }
  return { picks, funnel };
}

// ═══════════════════════════════════════════════════════════════════
// DIAGNOSTIC FUNNEL (pur, sans effet de bord — Task 16)
// Permet de comprendre POURQUOI 0 pick (réponse JSON du cron,
// jamais publiée sur Telegram). Miroir exact de filterBadjanMatches.
// ═══════════════════════════════════════════════════════════════════

export interface BadjanFunnel {
  total: number;            // matchs pipeline reçus
  foot: number;             // football uniquement
  riskDefined: number;      // riskPercentage défini
  riskOk: number;           // risque ≤ BADJAN_MAX_RISK
  predictedHome: number;    // prédiction victoire domicile
  marketConfirmed: number;  // cote 1 strictement la plus basse du 1X2
  realOdds: number;         // cotes réelles (non estimées) = picks
  reason?: string;          // première cause de vide (si 0 pick)
}

export function analyzeBadjanFunnel(matches: BadjanMatchInput[]): BadjanFunnel {
  const all = matches || [];
  const foot = all.filter(m => isFootballSport(m.sport));
  const riskDefined = foot.filter(m => typeof m.riskPercentage === 'number' && isFinite(m.riskPercentage));
  const riskOk = riskDefined.filter(m => m.riskPercentage! <= BADJAN_MAX_RISK);
  const predictedHome = riskOk.filter(m => m.predictedResult === 'home');
  const marketConfirmed = predictedHome.filter(m => {
    const oh = m.oddsHome, oa = m.oddsAway, od = m.oddsDraw;
    if (typeof oh !== 'number' || typeof oa !== 'number' || !isFinite(oh) || !isFinite(oa)) return false;
    if (oh < BADJAN_MIN_FAVORITE_ODDS) return false;
    if (oh >= oa) return false;
    if (typeof od === 'number' && isFinite(od) && oh >= od) return false;
    return true;
  });
  const realOdds = marketConfirmed.filter(m => !m.isEstimated);

  let reason: string | undefined;
  if (all.length === 0) reason = 'Pipeline 0 match (ESPN/Odds API injoignables ou throttling ?)';
  else if (foot.length === 0) reason = '0 match de football dans le pipeline';
  else if (riskDefined.length === 0) reason = 'Aucun riskPercentage calculé sur le foot';
  else if (riskOk.length === 0) reason = `Tous les risques foot > ${BADJAN_MAX_RISK}%`;
  else if (predictedHome.length === 0) reason = 'Aucune prédiction victoire domicile parmi risques ≤45%';
  else if (marketConfirmed.length === 0) reason = 'Marché ne confirme aucun favori domicile (cote 1 pas la plus basse)';
  else if (realOdds.length === 0) reason = 'Cotes estimées uniquement (Odds API absente ou quota épuisé ?)';
  else reason = undefined;

  return {
    total: all.length,
    foot: foot.length,
    riskDefined: riskDefined.length,
    riskOk: riskOk.length,
    predictedHome: predictedHome.length,
    marketConfirmed: marketConfirmed.length,
    realOdds: realOdds.length,
    reason,
  };
}

// ═══════════════════════════════════════════════════════════════════
// FORMAT BADJAN
// ═══════════════════════════════════════════════════════════════════

export function formatBadjanMessage(picks: EnrichedBadjanMatch[]): string {
  // 🆕 Task 31 — distinguer picks stricts (stats ESPN) vs fallback cotes
  const strictPicks = picks.filter(p => !p.badjanStats?.fallback);
  const fallbackPicks = picks.filter(p => p.badjanStats?.fallback === 'cotes');

  let message = '';
  message += '╔════════════════════════╗\n';
  message += `║ 🏠 <b>BADJAN — Favoris à domicile</b> ║\n`;
  message += '╚════════════════════════╝\n\n';
  message += `✅ <b>${picks.length} match${picks.length > 1 ? 's' : ''}</b> — risque ≤ ${BADJAN_MAX_RISK} % · favori domicile`;
  if (strictPicks.length > 0) {
    message += ` · ≥${Math.round(BADJAN_MIN_HOME_WIN_RATIO * 100)}% V domicile · ≥${Math.round(BADJAN_MIN_H2H_WIN_RATIO * 100)}% V H2H`;
  }
  message += '\n';
  if (fallbackPicks.length > 0) {
    message += `📈 <b>${fallbackPicks.length} fallback cotes</b> (stats ESPN indispo — probHome ≥ ${Math.round(BADJAN_FALLBACK_MIN_PROB_HOME * 100)}%)\n`;
  }
  message += '\n';

  for (let i = 0; i < picks.length; i++) {
    const m = picks[i];
    const { date, time } = formatBadjanDateTime(m.date, m.displayDate);
    const winProb = m.winProbability ?? (m.riskPercentage !== undefined ? 100 - m.riskPercentage : undefined);

    message += '━━━━━━━━━━━━━━━━━━━━━\n';
    message += `<b>${i + 1}. ${m.homeTeam} vs ${m.awayTeam}</b>\n`;
    if (date) message += `📅 ${date}`;
    if (time) message += `  ·  ⏰ ${time}`;
    if (date || time) message += '\n';
    if (m.league) message += `🏆 ${m.league}\n`;

    if (typeof m.oddsHome === 'number' && typeof m.oddsAway === 'number') {
      message += `📊 Cotes: 1:<b>${m.oddsHome.toFixed(2)}</b>`;
      if (typeof m.oddsDraw === 'number') message += ` X:<b>${m.oddsDraw.toFixed(2)}</b>`;
      message += ` 2:<b>${m.oddsAway.toFixed(2)}</b>\n`;
    }

    message += `🎯 Pari: <b>${m.homeTeam} (domicile)</b>`;
    if (m.recommendation && m.recommendation !== 'N/A') message += ` — <b>${m.recommendation}</b>`;
    message += '\n';

    // 🆕 Critères BADJAN vérifiés (Task 27 + Task 31 fallback cotes)
    if (m.badjanStats) {
      const st = m.badjanStats;
      const h = st.home;
      const h2 = st.h2h;
      if (st.fallback === 'cotes') {
        // 🆕 Task 31 — pick validé via fallback marché (stats ESPN indispo/insuffisantes)
        const probHomePct = Math.round((st.probHomeMarket ?? 0) * 100);
        message += `📈 <b>Fallback cotes</b> (stats ESPN indispo) — probHome marché: <b>${probHomePct}%</b> ≥ ${Math.round(BADJAN_FALLBACK_MIN_PROB_HOME * 100)}%\n`;
        if (h.played > 0) {
          message += `   🏠 Domicile partiel: <b>${h.wins}V-${h.draws}N-${h.losses}D</b> (${h.played} match${h.played > 1 ? 's' : ''})\n`;
        }
        if (h2.total > 0) {
          message += `   ⚔️ H2H partiel: <b>${h2.wins}V-${h2.draws}N-${h2.losses}D</b> (${h2.total} confrontation${h2.total > 1 ? 's' : ''})\n`;
        }
      } else {
        // Task 27 — pick strict (stats ESPN complètes et valides)
        message += `🏠 Domicile (saison): <b>${h.wins}V-${h.draws}N-${h.losses}D</b> → ${Math.round(st.homeWinRatio * 100)}% V\n`;
        message += `⚔️ H2H: <b>${h2.wins}V-${h2.draws}N-${h2.losses}D</b> → ${Math.round(st.h2hWinRatio * 100)}% V (${h2.total} confrontation${h2.total > 1 ? 's' : ''})\n`;
      }
    }

    // 🆕 Task 29 — DUO V/VN : deux pronostics par match avec le pourcentage de chacun
    //   V (risqué)   = victoire pure du favori domicile
    //   VN (fiable)  = Victoire ou Nul (double chance) — le bilan suit le VN (nul = gagné)
    if (typeof m.vProbability === 'number' && typeof m.vnProbability === 'number') {
      message += `🎯 <b>V (risqué): ${Math.round(m.vProbability * 100)}%</b> · <b>VN (fiable): ${Math.round(m.vnProbability * 100)}%</b>\n`;
      message += `   Risque (perte si défaite): <b>${Math.round(m.riskPercentage ?? 100 - m.vProbability * 100)}%</b>\n`;
    } else if (winProb !== undefined) {
      message += `💥 Chance: <b>${Math.round(winProb)}%</b> · Risque: <b>${Math.round(m.riskPercentage ?? 100 - winProb)}%</b>\n`;
    }

    // Bloc Dixon-Coles UNIQUEMENT si déjà calculé par le pipeline (zéro calcul ajouté)
    if (m._dixonColes) {
      try {
        const dc = m._dixonColes;
        if (dc?.expectedHomeGoals !== undefined && dc?.expectedAwayGoals !== undefined) {
          message += `⚽ xG attendu: ${Number(dc.expectedHomeGoals).toFixed(1)} - ${Number(dc.expectedAwayGoals).toFixed(1)}\n`;
        }
      } catch { /* skip */ }
    }

    message += '\n';
  }

  message += '━━━━━━━━━━━━━━━━━━━━━\n';
  message += `🏠 <b>Badjan</b> — favori domicile (stats ESPN si dispo, sinon cotes marché).\n`;
  message += `Un favori domicile reste toujours favorite : pariez responsable.\n`;

  return message;
}

// ═══════════════════════════════════════════════════════════════════
// PUBLICATION BADJAN (Telegram uniquement — pas de DB, pas de bilan)
// ═══════════════════════════════════════════════════════════════════

export interface BadjanPublishResult {
  success: boolean;
  picks: number;
  message?: string;
  funnel?: BadjanFunnelEnriched;
}

export async function publishBadjanToTelegram(matches: BadjanMatchInput[]): Promise<BadjanPublishResult> {
  const { sendTelegramMessage, isDuplicate } = await import('./telegramService');

  // 🆕 Chaîne complète (Task 27): filtre de base + stats domicile/H2H (fail-closed)
  const { picks: enrichedPicks, funnel } = await enrichAndFilterBadjan(matches);
  const picks = enrichedPicks;

  if (picks.length === 0) {
    console.log(`🏈 BADJAN: 0 match éligible (foot + risque ≤45% + favori domicile + ratios domicile/H2H + fallback cotes ≥${Math.round(BADJAN_FALLBACK_MIN_PROB_HOME * 100)}%) — ${funnel.reason || 'aucune raison'}`);
    for (const d of funnel.rejectionDetails) console.log(`   ↳ ${d}`);
    return { success: false, picks: 0, message: 'Aucun match éligible', funnel };
  }

  // 🆕 Task 31 — log distinctif picks stricts vs fallback cotes
  const strictCount = picks.filter(p => !p.badjanStats?.fallback).length;
  const fallbackCount = picks.length - strictCount;
  console.log(`🏈 BADJAN: ${picks.length} pick(s) — ${strictCount} strict(s) ESPN + ${fallbackCount} fallback cotes`);
  const message = formatBadjanMessage(picks);

  // Dedup : ne jamais publier deux fois la même sélection sur une même instance
  if (isDuplicate('badjan', message)) {
    console.log('🏈 BADJAN: sélection identique déjà publiée — skip');
    return { success: false, picks: picks.length, message: 'Déjà publiée' };
  }

  // Message trop long → découpe propre aux frontières de matchs
  if (message.length <= TELEGRAM_MAX_LENGTH) {
    const ok = await sendTelegramMessage(message);
    return { success: ok, picks: picks.length, message: ok ? 'Publié' : 'Erreur envoi', funnel };
  }

  const header = `🏠 <b>BADJAN — Favoris à domicile</b> (${picks.length} matchs)\n\n`;
  let current = header;
  let part = 1;
  let allOk = true;

  for (let i = 0; i < picks.length; i++) {
    const block = formatBadjanMessage([picks[i]])
      .split('━━━━━━━━━━━━━━━━━━━━━\n')[1] || ''; // bloc individuel sans le footer
    if (current.length + block.length > TELEGRAM_MAX_LENGTH - 200) {
      const ok = await sendTelegramMessage(current + `— partie ${part} —`);
      allOk = allOk && ok;
      part++;
      current = header;
    }
    current += block + '\n';
  }
  if (current.trim() !== header.trim()) {
    const ok = await sendTelegramMessage(current);
    allOk = allOk && ok;
  }

  return { success: allOk, picks: picks.length, message: `Publié en ${part} partie(s)`, funnel };
}
