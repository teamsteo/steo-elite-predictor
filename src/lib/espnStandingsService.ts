/**
 * ESPN Standings Service — Classement et records via ESPN scoreboard API
 * 
 * Source: https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard
 * 
 * Les records (W-L-D) sont inclus dans chaque événement du scoreboard.
 * On les extrait sans faire de requête supplémentaire (données déjà disponibles).
 * 
 * Anti-ban: Aucune requête supplémentaire — réutilise les données du scoreboard
 * qu'on appelle déjà pour les matchs et cotes.
 */

export interface TeamRecord {
  team: string;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
  winPct: number;  // 0-1
  record: string;  // ex: "5-3-1", "12-8"
  source: 'espn_scoreboard';
}

export interface TeamStanding {
  team: string;
  record: TeamRecord;
  rank: number;
  totalTeams: number;
  position: 'top' | 'upper-mid' | 'mid' | 'lower-mid' | 'bottom';
  // Enjeu calculé
  context: {
    isTitleRace: boolean;
    isRelegationBattle: boolean;
    isPlayoffPush: boolean;
    isMidTable: boolean;
    gapToLeader: number;
    gapToSafety: number;
  };
}

// Mapping ligue ESPN
const ESPN_LEAGUES: Record<string, { sport: string; league: string; name: string }> = {
  'premier-league':   { sport: 'soccer',     league: 'eng.1',          name: 'Premier League' },
  'ligue-1':          { sport: 'soccer',     league: 'fra.1',          name: 'Ligue 1' },
  'la-liga':          { sport: 'soccer',     league: 'esp.1',          name: 'La Liga' },
  'bundesliga':       { sport: 'soccer',     league: 'ger.1',          name: 'Bundesliga' },
  'serie-a':          { sport: 'soccer',     league: 'ita.1',          name: 'Serie A' },
  'champions-league': { sport: 'soccer',     league: 'uefa.champions', name: 'Champions League' },
  'nba':             { sport: 'basketball', league: 'nba',           name: 'NBA' },
  'nhl':             { sport: 'hockey',     league: 'nhl',           name: 'NHL' },
  'mlb':             { sport: 'baseball',   league: 'mlb',           name: 'MLB' },
};

const LEAGUE_NAME_TO_KEY: Record<string, string> = {
  'english premier league': 'premier-league',
  'premier league': 'premier-league',
  'french ligue 1': 'ligue-1',
  'ligue 1': 'ligue-1',
  'french ligue 2': 'ligue-1',
  'ligue 2': 'ligue-1',
  'spanish la liga': 'la-liga',
  'la liga': 'la-liga',
  'german bundesliga': 'bundesliga',
  'bundesliga': 'bundesliga',
  'italian serie a': 'serie-a',
  'serie a': 'serie-a',
  'uefa champions league': 'champions-league',
  'champions league': 'champions-league',
  'national basketball association': 'nba',
  'nba': 'nba',
  'national hockey league': 'nhl',
  'nhl': 'nhl',
  'major league baseball': 'mlb',
  'mlb': 'mlb',
};

// Cache: 2h TTL (les records changent lentement)
const standingsCache = new Map<string, { teams: Map<string, TeamStanding>; timestamp: number; totalTeams: number }>();
const CACHE_TTL = 2 * 60 * 60 * 1000;

/**
 * Récupère les records d'équipes depuis le scoreboard ESPN
 * Utilise les données déjà disponibles (pas de requête scraping)
 */
export async function fetchLeagueStandings(
  leagueName: string,
  sport?: string
): Promise<Map<string, TeamStanding>> {
  // Trouver la config ligue
  const key = findLeagueKey(leagueName, sport);
  if (!key) {
    console.log(`⚠️ [ESPN Standings] Ligue non reconnue: "${leagueName}"`);
    return new Map();
  }

  const config = ESPN_LEAGUES[key];
  const cacheKey = `${config.sport}/${config.league}`;
  const cached = standingsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.teams;
  }

  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${config.sport}/${config.league}/scoreboard`;
    const response = await fetch(url, { next: { revalidate: 7200 } });

    if (!response.ok) {
      console.log(`⚠️ [ESPN Standings] ${cacheKey}: HTTP ${response.status}`);
      return cached?.teams || new Map();
    }

    const data = await response.json();
    const events = data.events || [];

    // Extraire les records de chaque événement
    const teamRecords = new Map<string, { team: string; record: TeamRecord }>();

    for (const event of events) {
      const comp = event.competitions?.[0];
      if (!comp) continue;

      for (const competitor of (comp.competitors || [])) {
        const teamName = competitor.team?.displayName || '';
        if (!teamName) continue;

        const records = competitor.records || [];
        const mainRecord = records.find(r => r.name === 'overall' || r.name === 'Overall' || !r.name) || records[0];
        const summary = mainRecord?.summary || '0-0-0';

        const parsed = parseRecord(summary);
        const winPct = parsed.gamesPlayed > 0 
          ? (parsed.wins + parsed.draws * 0.5) / parsed.gamesPlayed 
          : 0;

        teamRecords.set(teamName, {
          team: teamName,
          wins: parsed.wins,
          losses: parsed.losses,
          draws: parsed.draws,
          gamesPlayed: parsed.gamesPlayed,
          winPct,
          record: summary,
          source: 'espn_scoreboard',
        });
      }
    }

    // Trier par winPct descendant pour attribuer un rang
    const sorted = [...teamRecords.entries()].sort((a, b) => b[1].record.winPct - a[1].record.winPct);
    const totalTeams = sorted.length;

    const standings = new Map<string, TeamStanding>();
    for (let i = 0; i < sorted.length; i++) {
      const [name, record] = sorted[i];
      const rank = i + 1;
      const position = getPositionZone(rank, totalTeams);

      // Calculer le contexte d'enjeu
      const context = calculateContext(rank, totalTeams, record, sorted);

      standings.set(name, { team: name, record, rank, totalTeams, position, context });
    }

    standingsCache.set(cacheKey, { teams: standings, timestamp: Date.now(), totalTeams });
    console.log(`✅ [ESPN Standings] ${config.name}: ${totalTeams} équipes`);
    return standings;

  } catch (error: any) {
    console.log(`⚠️ [ESPN Standings] ${cacheKey}: ${error.message}`);
    return cached?.teams || new Map();
  }
}

/**
 * Récupère le standing d'une équipe pour un match
 */
export async function getTeamStanding(
  teamName: string,
  leagueName: string,
  sport?: string
): Promise<TeamStanding | null> {
  const standings = await fetchLeagueStandings(leagueName, sport);
  if (standings.size === 0) return null;

  // Matching flou
  for (const [name, standing] of standings) {
    if (teamFuzzyMatch(name, teamName)) {
      return standing;
    }
  }
  return null;
}

/**
 * Récupère les standings pour les 2 équipes d'un match
 */
export async function getMatchStandings(
  homeTeam: string,
  awayTeam: string,
  leagueName: string,
  sport?: string
): Promise<{ home: TeamStanding | null; away: TeamStanding | null; totalTeams: number }> {
  const standings = await fetchLeagueStandings(leagueName, sport);

  let home: TeamStanding | null = null;
  let away: TeamStanding | null = null;

  for (const [name, standing] of standings) {
    if (!home && teamFuzzyMatch(name, homeTeam)) home = standing;
    if (!away && teamFuzzyMatch(name, awayTeam)) away = standing;
    if (home && away) break;
  }

  return { home, away, totalTeams: standings.size };
}

/**
 * Génère un label d'enjeu basé sur les positions réelles
 */
export function getDynamicStakeLabel(
  home: TeamStanding | null,
  away: TeamStanding | null
): { label: string; level: string; insights: string[] } {
  if (!home && !away) {
    return { label: 'RAS', level: 'medium', insights: [] };
  }

  const insights: string[] = [];
  let maxScore = 0;
  let bestLabel = 'Enjeu modéré';
  let bestLevel = 'medium';

  // Analyser chaque équipe
  for (const team of [home, away] as (TeamStanding | null)[]) {
    if (!team) continue;
    const ctx = team.context;

    if (ctx.isTitleRace) {
      const score = 5;
      if (score > maxScore) {
        maxScore = score;
        bestLabel = `Lutte pour le titre (${team.record.record})`;
        bestLevel = 'critical';
      }
      insights.push(`${team.team}: ${ctx.gapToLeader}pts du leader, ${team.rank}e/${team.totalTeams}`);
    }

    if (ctx.isRelegationBattle) {
      const score = 4;
      if (score > maxScore) {
        maxScore = score;
        bestLabel = `Zone de relégation (${team.record.record})`;
        bestLevel = 'high';
      }
      insights.push(`${team.team}: à ${ctx.gapToSafety}pts de la zone de maintien`);
    }

    if (ctx.isPlayoffPush) {
      const score = 3.5;
      if (score > maxScore) {
        maxScore = score;
        bestLabel = `Course aux playoffs (${team.record.record})`;
        bestLevel = 'high';
      }
      insights.push(`${team.team}: ${team.rank}e, course aux playoffs`);
    }
  }

  // Détection: duel entre deux prétendants au titre
  if (home?.context.isTitleRace && away?.context.isTitleRace) {
    maxScore = 6;
    bestLabel = `Duel au sommet (${home.record.record} vs ${away.record.record})`;
    bestLevel = 'critical';
    insights.push(`Match entre les 2 prétendants au titre !`);
  }

  // Détection: match entre deux relégables
  if (home?.context.isRelegationBattle && away?.context.isRelegationBattle) {
    maxScore = 5;
    bestLabel = `Duel de relégables (${home.record.record} vs ${away.record.record})`;
    bestLevel = 'critical';
    insights.push(`Match crucial pour le maintien !`);
  }

  // Si on a des positions mais pas d'enjeu fort → enjeu modéré/faible
  if (maxScore === 0 && (home || away)) {
    const t = home || away!;
    if (t.context.isMidTable) {
      bestLabel = 'Enjeu faible (milieu de tableau)';
      bestLevel = 'low';
    } else {
      bestLabel = 'Enjeu modéré';
      bestLevel = 'medium';
    }
  }

  return { label: bestLabel, level: bestLevel, insights };
}

// ==================== Internes ====================

function parseRecord(summary: string): { wins: number; losses: number; draws: number; gamesPlayed: number } {
  const parts = summary.split('-').map(Number);
  if (parts.length >= 3) {
    return { wins: parts[0] || 0, losses: parts[1] || 0, draws: parts[2] || 0, gamesPlayed: (parts[0] || 0) + (parts[1] || 0) + (parts[2] || 0) };
  }
  if (parts.length === 2) {
    return { wins: parts[0] || 0, losses: parts[1] || 0, draws: 0, gamesPlayed: (parts[0] || 0) + (parts[1] || 0) };
  }
  return { wins: 0, losses: 0, draws: 0, gamesPlayed: 0 };
}

function getPositionZone(rank: number, total: number): 'top' | 'upper-mid' | 'mid' | 'lower-mid' | 'bottom' {
  const pct = rank / total;
  if (pct <= 0.15) return 'top';       // Top 15%
  if (pct <= 0.33) return 'upper-mid'; // Top third
  if (pct <= 0.67) return 'mid';       // Middle third
  if (pct <= 0.83) return 'lower-mid'; // Bottom third
  return 'bottom';                    // Bottom 17%
}

function calculateContext(
  rank: number,
  totalTeams: number,
  record: TeamRecord,
  sorted: [string, { record: TeamRecord }][]
): TeamStanding['context'] {
  const leader = sorted[0]?.[1].record;
  const gapToLeader = leader ? (leader.wins + leader.draws * 0.5) - (record.wins + record.draws * 0.5) : 0;

  // Zone de relégation (derniers 3 pour foot, variable pour autres)
  const relegationZone = totalTeams >= 20 ? 3 : Math.max(2, Math.floor(totalTeams * 0.15));
  const firstRelegationRank = totalTeams - relegationZone + 1;
  const safetyTeam = sorted[firstRelegationRank - 2]?.[1].record; // Équipe juste au-dessus de la zone
  const gapToSafety = safetyTeam
    ? (safetyTeam.wins + safetyTeam.draws * 0.5) - (record.wins + record.draws * 0.5)
    : 0;

  // Zone playoffs (NBA: top 10, NHL: top ~50%)
  const playoffCutoff = totalTeams >= 30 ? 10 : Math.ceil(totalTeams * 0.5);

  const isTitleRace = rank <= 3 && gapToLeader <= 6;
  const isRelegationBattle = rank >= firstRelegationRank - 2 && gapToSafety <= 4;
  const isPlayoffPush = rank <= playoffCutoff + 2 && rank > playoffCutoff;
  const isMidTable = rank > 3 && rank < firstRelegationRank - 2 && !isPlayoffPush;

  return {
    isTitleRace,
    isRelegationBattle,
    isPlayoffPush,
    isMidTable,
    gapToLeader: Math.round(gapToLeader * 10) / 10,
    gapToSafety: Math.round(gapToSafety * 10) / 10,
  };
}

function findLeagueKey(leagueName: string, sport?: string): string | null {
  if (!leagueName) return null;
  const normalized = leagueName.toLowerCase().trim();
  return LEAGUE_NAME_TO_KEY[normalized] || null;
}

function teamFuzzyMatch(espnTeam: string, localTeam: string): boolean {
  if (!espnTeam || !localTeam) return false;
  const a = normalizeTeam(espnTeam);
  const b = normalizeTeam(localTeam);
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const wordsA = a.split(/\s+/);
  const wordsB = b.split(/\s+/);
  const commonWords = wordsA.filter(w => w.length > 3 && wordsB.some(bw => bw.includes(w) || w.includes(bw)));
  return commonWords.length >= 2;
}

function normalizeTeam(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+(fc|sc|ac|cf|ss|as|rc|us|os)$/i, '')
    .trim();
}

const espnStandingsService = {
  fetchLeagueStandings,
  getTeamStanding,
  getMatchStandings,
  getDynamicStakeLabel,
};

export default espnStandingsService;
