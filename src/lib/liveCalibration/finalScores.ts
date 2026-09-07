/**
 * Final Scores — Récupère les scores finaux ESPN pour évaluer les value bets live
 *
 * Utilisé par le bilan quotidien pour mesurer la PERFORMANCE RÉELLE des
 * réajustements live : chaque value bet publié est marqué won/lost/void
 * selon le résultat final du match.
 *
 * ESPN scoreboard API (gratuite) :
 *   https://site.api.espn.com/apis/site/v2/sports/soccer/{leagueCode}/scoreboard?dates=YYYYMMDD
 */

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

// Mapping noms de ligues (ESPN getMatchesWithRealOdds) → codes ESPN scoreboard
const LEAGUE_CODE_MAP: Record<string, string> = {
  'Premier League': 'eng.1',
  'English Premier League': 'eng.1',
  'La Liga': 'esp.1',
  'Spanish LaLiga': 'esp.1',
  'Serie A': 'ita.1',
  'Italian Serie A': 'ita.1',
  'Bundesliga': 'ger.1',
  'German Bundesliga': 'ger.1',
  'Ligue 1': 'fra.1',
  'French Ligue 1': 'fra.1',
  'UEFA Champions League': 'uefa.champions',
  'UEFA Europa League': 'uefa.europa',
  'UEFA Europa Conference League': 'uefa.europa.conf',
};

export function getEspnLeagueCode(league: string): string | null {
  return LEAGUE_CODE_MAP[league] || null;
}

/**
 * Fetch le score final d'un match ESPN par son ID.
 *
 * @param espnMatchId  ID ESPN brut ("123456") ou préfixé ("espn_123456")
 * @param league       Nom de la ligue (pour choisir le bon scoreboard)
 * @param kickoffDate  Date du match (ISO) — pour la requête scoreboard
 */
export async function fetchFinalScore(
  espnMatchId: string,
  league: string,
  kickoffDate: string,
): Promise<{ home: number; away: number } | null> {
  const leagueCode = getEspnLeagueCode(league);
  if (!leagueCode) return null;

  // Extraire l'ID numérique (le store stocke "espn_XXXX" ou l'ID brut)
  const numericId = espnMatchId.replace(/^espn_/, '');
  if (!/^\d+$/.test(numericId)) return null; // match mock ou id non-ESPN

  // Date au format ESPN YYYYMMDD
  const dateObj = new Date(kickoffDate);
  if (isNaN(dateObj.getTime())) return null;
  const yyyymmdd = dateObj.toISOString().split('T')[0].replace(/-/g, '');

  try {
    const url = `${ESPN_BASE}/${leagueCode}/scoreboard?dates=${yyyymmdd}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;

    const data: any = await response.json();
    const events = data?.events || [];

    // Trouver l'event par ID
    for (const ev of events) {
      if (ev.id === numericId) {
        const comp = ev.competitions?.[0];
        if (!comp) return null;

        const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
        const away = comp.competitors?.find((c: any) => c.homeAway === 'away');

        if (!home || !away) return null;

        const homeScore = parseInt(home.score, 10);
        const awayScore = parseInt(away.score, 10);
        if (isNaN(homeScore) || isNaN(awayScore)) return null;

        return { home: homeScore, away: awayScore };
      }
    }

    return null;
  } catch (e) {
    console.warn(`⚠️ [FINAL SCORES] Fetch échoué pour ${espnMatchId}:`, e);
    return null;
  }
}

/**
 * Fetch les scores finaux de plusieurs matchs en parallèle (limité).
 */
export async function fetchFinalScoresBatch(
  matches: Array<{ match_id: string; league: string; kickoff_utc: string }>,
): Promise<Map<string, { home: number; away: number }>> {
  const results = new Map<string, { home: number; away: number }>();

  // Parallèle par batch de 3 (rate limit raisonnable)
  const BATCH_SIZE = 3;
  for (let i = 0; i < matches.length; i += BATCH_SIZE) {
    const batch = matches.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (m) => {
      const score = await fetchFinalScore(m.match_id, m.league, m.kickoff_utc);
      if (score) results.set(m.match_id, score);
    });
    await Promise.all(promises);
    if (i + BATCH_SIZE < matches.length) {
      await new Promise(r => setTimeout(r, 500)); // petite pause entre batches
    }
  }

  return results;
}
