/**
 * ESPN Injury Service — Blessures multi-sport via API ESPN officielle
 * 
 * Source: https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/injuries
 * 
 * Avantages:
 * - API 100% GRATUITE, structurée, officielle
 * - Pas de scraping HTML (pas de risque de ban)
 * - Couvre: NBA, NHL, MLB, NFL + foot européen (en saison)
 * - Cache agressif (1h) pour minimiser les appels
 * 
 * Anti-ban:
 * - Cache TTL 1h par ligue
 * - 1 seule requête par ligue (pas de pagination)
 * - Pas de user-agent spécial (API publique ESPN)
 * - Rate limit: max 6 requêtes par cycle (6 ligues foot)
 */

export interface ESPNInjury {
  player: string;
  team: string;
  status: string;       // 'Out', 'Day-To-Day', 'Questionable', 'Doubtful', etc.
  details: string;      // Description courte
  date: string;         // Date de l'information
  position?: string;
}

export interface ESPNLeagueInjuries {
  league: string;
  injuries: ESPNInjury[];
  source: string;
  fetchedAt: number;
}

// Mapping ligue ESPN → slug API
const ESPN_INJURY_LEAGUES: Record<string, { sport: string; league: string; name: string }> = {
  'premier-league':      { sport: 'soccer',       league: 'eng.1',          name: 'Premier League' },
  'ligue-1':             { sport: 'soccer',       league: 'fra.1',          name: 'Ligue 1' },
  'la-liga':             { sport: 'soccer',       league: 'esp.1',          name: 'La Liga' },
  'bundesliga':          { sport: 'soccer',       league: 'ger.1',          name: 'Bundesliga' },
  'serie-a':             { sport: 'soccer',       league: 'ita.1',          name: 'Serie A' },
  'champions-league':    { sport: 'soccer',       league: 'uefa.champions', name: 'Champions League' },
  'europa-league':       { sport: 'soccer',       league: 'uefa.europa',   name: 'Europa League' },
  'nba':                { sport: 'basketball',   league: 'nba',           name: 'NBA' },
  'nhl':                { sport: 'hockey',       league: 'nhl',           name: 'NHL' },
  'mlb':                { sport: 'baseball',     league: 'mlb',           name: 'MLB' },
};

// Mapping nom de ligue (depuis ESPN/Telegram) → clé ESPN_INJURY_LEAGUES
const LEAGUE_NAME_TO_KEY: Record<string, string> = {
  'english premier league': 'premier-league',
  'premier league': 'premier-league',
  'england premier league': 'premier-league',
  'french ligue 1': 'ligue-1',
  'ligue 1': 'ligue-1',
  'france ligue 1': 'ligue-1',
  'french ligue 2': 'ligue-1', // L2 approximation
  'ligue 2': 'ligue-1',
  'spanish la liga': 'la-liga',
  'la liga': 'la-liga',
  'spain la liga': 'la-liga',
  'german bundesliga': 'bundesliga',
  'bundesliga': 'bundesliga',
  'italian serie a': 'serie-a',
  'serie a': 'serie-a',
  'uefa champions league': 'champions-league',
  'champions league': 'champions-league',
  'uefa europa league': 'europa-league',
  'europa league': 'europa-league',
  'national basketball association': 'nba',
  'nba': 'nba',
  'national hockey league': 'nhl',
  'nhl': 'nhl',
  'major league baseball': 'mlb',
  'mlb': 'mlb',
};

// Cache par ligue
const leagueCache = new Map<string, { data: ESPNInjury[]; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 heure

// Rate limiting
let lastFetchTime = 0;
const MIN_FETCH_INTERVAL = 200; // 200ms entre chaque requête

/**
 * Récupère les blessures pour une ligue ESPN donnée
 */
async function fetchLeagueInjuries(sport: string, league: string): Promise<ESPNInjury[]> {
  const cacheKey = `${sport}/${league}`;
  const cached = leagueCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Rate limiting: minimum 200ms entre les appels
  const now = Date.now();
  const wait = Math.max(0, MIN_FETCH_INTERVAL - (now - lastFetchTime));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastFetchTime = Date.now();

  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/injuries`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    
    if (!response.ok) {
      console.log(`⚠️ [ESPN Injuries] ${sport}/${league}: HTTP ${response.status}`);
      return cached?.data || [];
    }

    const data = await response.json();
    const injuries: ESPNInjury[] = [];
    const teams = data.injuries || [];

    for (const teamData of teams) {
      const teamName = teamData.displayName || teamData.team?.displayName || '';
      for (const inj of (teamData.injuries || [])) {
        const athlete = inj.athlete || {};
        injuries.push({
          player: athlete.displayName || 'Unknown',
          team: athlete.team?.displayName || teamName,
          status: inj.status || 'Unknown',
          details: inj.shortComment || '',
          date: inj.date || '',
          position: athlete.position?.abbreviation || '',
        });
      }
    }

    leagueCache.set(cacheKey, { data: injuries, timestamp: Date.now() });
    console.log(`✅ [ESPN Injuries] ${sport}/${league}: ${injuries.length} blessures`);
    return injuries;

  } catch (error: any) {
    console.log(`⚠️ [ESPN Injuries] ${sport}/${league}: ${error.message}`);
    return cached?.data || [];
  }
}

/**
 * Récupère les blessures pour un match donné (cross-sport)
 * Cherche dans la ligue appropriée et filtre par équipes
 */
export async function getESPNMatchInjuries(
  homeTeam: string,
  awayTeam: string,
  leagueName?: string,
  sport?: string
): Promise<{
  home: ESPNInjury[];
  away: ESPNInjury[];
  homeImpact: number;
  awayImpact: number;
  summary: string;
  source: string;
  keyAbsentees: { home: string[]; away: string[] };
}> {
  // Déterminer la ligue ESPN
  const leagueKey = findLeagueKey(leagueName || '', sport || '');

  let allInjuries: ESPNInjury[] = [];
  let usedLeagues: string[] = [];

  if (leagueKey) {
    const config = ESPN_INJURY_LEAGUES[leagueKey];
    if (config) {
      allInjuries = await fetchLeagueInjuries(config.sport, config.league);
      usedLeagues.push(config.name);
    }
  } else {
    // Pas de ligue identifiée → essayer les ligues du sport
    const sportLeagues = Object.entries(ESPN_INJURY_LEAGUES)
      .filter(([, v]) => !sport || v.sport === normalizeSport(sport))
      .map(([k, v]) => ({ key: k, ...v }));

    // Limiter à 3 requêtes max pour ne pas spammer
    for (const sl of sportLeagues.slice(0, 3)) {
      const inj = await fetchLeagueInjuries(sl.sport, sl.league);
      if (inj.length > 0) {
        allInjuries = allInjuries.concat(inj);
        usedLeagues.push(sl.name);
      }
    }
  }

  // Filtrer par équipes (matching flou)
  const homeInjuries = allInjuries.filter(i => teamMatch(i.team, homeTeam));
  const awayInjuries = allInjuries.filter(i => teamMatch(i.team, awayTeam));

  // Calculer l'impact
  const { homeImpact, awayImpact, keyAbsentees } = evaluateImpact(homeInjuries, awayInjuries);

  // Générer le résumé
  const summary = buildInjurySummary(homeTeam, awayTeam, homeInjuries, awayInjuries, homeImpact, awayImpact);

  return {
    home: homeInjuries,
    away: awayInjuries,
    homeImpact,
    awayImpact,
    summary,
    source: usedLeagues.length > 0 ? `ESPN (${usedLeagues.join(', ')})` : 'ESPN',
    keyAbsentees,
  };
}

/**
 * Récupère TOUTES les blessures d'un sport (pour le cache global)
 * Utile pour pré-charger le cache en début de journée
 */
export async function preloadESPNSportInjuries(sport: string): Promise<number> {
  const leagues = Object.entries(ESPN_INJURY_LEAGUES)
    .filter(([, v]) => v.sport === sport);

  let total = 0;
  for (const [, config] of leagues) {
    const inj = await fetchLeagueInjuries(config.sport, config.league);
    total += inj.length;
  }
  return total;
}

/**
 * Évalue l'impact des blessures sur un match
 * Statuts graves: Out, Doubtful, IR (Injured Reserve)
 * Statuts mineurs: Day-To-Day, Questionable, Probable
 */
function evaluateImpact(
  homeInjuries: ESPNInjury[],
  awayInjuries: ESPNInjury[]
): { homeImpact: number; awayImpact: number; keyAbsentees: { home: string[]; away: string[] } } {
  // Poids par statut
  const STATUS_WEIGHT: Record<string, number> = {
    'out': 3,
    'ir': 3,
    'injured reserve': 3,
    'doubtful': 2.5,
    'questionable': 1.5,
    'day-to-day': 0.5,
    'probable': 0.3,
    'available': 0,
    'full participation': 0,
    'limited participation': 0.5,
    'did not participate': 2.5,
    'not injury related': 0,
  };

  // Positions clés (plus d'impact)
  const KEY_POSITIONS = new Set([
    'QB', 'RB', 'WR', 'TE',     // NFL
    'PG', 'SG', 'SF', 'PF', 'C', // NBA
    'G', 'D', 'C', 'LW', 'RW',   // NHL
    'GK', 'CB', 'CM', 'CF', 'ST', // Football
    'SP', 'RP', 'CL', '1B', '2B', 'SS', '3B', 'OF', // MLB
  ]);

  const calcImpact = (injuries: ESPNInjury[]): { impact: number; keyAbsent: string[] } => {
    let impact = 0;
    const keyAbsent: string[] = [];

    for (const inj of injuries) {
      const status = (inj.status || '').toLowerCase();
      const weight = STATUS_WEIGHT[status] ?? 1;
      const isKey = inj.position ? KEY_POSITIONS.has(inj.position.toUpperCase()) : false;
      const multiplier = isKey ? 1.5 : 1;

      impact -= weight * multiplier;

      if (weight >= 2 && isKey) {
        keyAbsent.push(`${inj.player} (${inj.position || inj.status})`);
      }
    }

    // Plafond à -10
    return { impact: Math.max(impact, -10), keyAbsent };
  };

  const home = calcImpact(homeInjuries);
  const away = calcImpact(awayInjuries);

  return {
    homeImpact: home.impact,
    awayImpact: away.impact,
    keyAbsentees: { home: home.keyAbsent, away: away.keyAbsent },
  };
}

/**
 * Construit un résumé lisible des blessures
 */
function buildInjurySummary(
  homeTeam: string,
  awayTeam: string,
  homeInjuries: ESPNInjury[],
  awayInjuries: ESPNInjury[],
  homeImpact: number,
  awayImpact: number
): string {
  if (homeInjuries.length === 0 && awayInjuries.length === 0) {
    return 'Aucune blessure signalée';
  }

  const formatTeam = (team: string, injuries: ESPNInjury[]) => {
    if (injuries.length === 0) return '';
    const serious = injuries.filter(i => {
      const s = (i.status || '').toLowerCase();
      return ['out', 'ir', 'doubtful', 'did not participate'].includes(s);
    });
    if (serious.length === 0) return '';
    const names = serious.slice(0, 3).map(i => `${i.player} (${i.status})`).join(', ');
    return `${team}: ${names}`;
  };

  const parts: string[] = [];
  const h = formatTeam(homeTeam, homeInjuries);
  const a = formatTeam(awayTeam, awayInjuries);
  if (h) parts.push(h);
  if (a) parts.push(a);

  if (parts.length === 0) {
    return 'Blessures mineures uniquement';
  }

  return `Blessures: ${parts.join(' | ')}`;
}

/**
 * Trouve la clé ligue ESPN à partir du nom de ligue
 */
function findLeagueKey(leagueName: string, sport: string): string | null {
  if (!leagueName) return null;
  const normalized = leagueName.toLowerCase().trim();
  return LEAGUE_NAME_TO_KEY[normalized] || null;
}

/**
 * Normalise le sport en clé ESPN
 */
function normalizeSport(sport: string): string {
  const s = sport.toLowerCase();
  if (s.includes('foot') || s === 'soccer') return 'soccer';
  if (s.includes('basket') || s === 'nba') return 'basketball';
  if (s.includes('hockey') || s === 'nhl') return 'hockey';
  if (s.includes('baseball') || s === 'mlb') return 'baseball';
  if (s.includes('football') && !s.includes('soccer')) return 'football';
  return s;
}

/**
 * Matching flou nom d'équipe (ESPN vs données locales)
 * Tolerant aux abréviations, accents, ordre des mots
 */
function teamMatch(espnTeam: string, localTeam: string): boolean {
  if (!espnTeam || !localTeam) return false;
  const a = normalizeTeam(espnTeam);
  const b = normalizeTeam(localTeam);
  if (a === b) return true;
  // Containment: un nom contient l'autre (ex: "LA Lakers" vs "Los Angeles Lakers")
  if (a.includes(b) || b.includes(a)) return true;
  // Containment par mots (ex: "Golden State" vs "Golden State Warriors")
  const wordsA = a.split(/\s+/);
  const wordsB = b.split(/\s+/);
  const commonWords = wordsA.filter(w => w.length > 3 && wordsB.some(bw => bw.includes(w) || w.includes(bw)));
  if (commonWords.length >= 2) return true;
  return false;
}

function normalizeTeam(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+(fc|sc|ac|cf|ss|as|rc|us|os)$/, '')
    .trim();
}

const espnInjuryService = {
  getESPNMatchInjuries,
  preloadESPNSportInjuries,
};

export default espnInjuryService;
