/**
 * Football Live Service - Données temps réel pour simulation 2D
 * 
 * SOURCE: ESPN API (Gratuit et légal)
 * - Matchs en cours avec événements
 * - Position approximative du ballon
 * - Statistiques live
 * - Priorité automatique pour grandes rencontres
 */

// ============================================
// TYPES
// ============================================

export interface LiveFootballMatch {
  id: string;
  homeTeam: LiveTeam;
  awayTeam: LiveTeam;
  score: {
    home: number;
    away: number;
  };
  time: {
    minute: number;
    period: 'first_half' | 'half_time' | 'second_half' | 'extra_time' | 'penalties' | 'finished';
    display: string; // "45+2'" ou "78'"
  };
  status: 'scheduled' | 'live' | 'finished' | 'postponed';
  events: MatchEvent[];
  stats: MatchStats;
  ballPosition: BallPosition;
  priority: number; // 0-100, plus haut = plus important
  league: {
    name: string;
    logo?: string;
  };
  venue?: string;
}

export interface LiveTeam {
  id: string;
  name: string;
  shortName: string;
  logo: string;
  color: string;
  formation?: string;
  players?: LivePlayer[];
}

export interface LivePlayer {
  id: string;
  name: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  number: number;
  x: number; // 0-100 (pourcentage du terrain)
  y: number; // 0-100
}

export interface MatchEvent {
  id: string;
  type: 'goal' | 'own_goal' | 'penalty' | 'yellow_card' | 'red_card' | 'substitution' | 'var' | 'penalty_missed';
  minute: number;
  player: string;
  team: 'home' | 'away';
  assist?: string;
  detail?: string;
}

export interface MatchStats {
  possession: { home: number; away: number };
  shots: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  corners: { home: number; away: number };
  fouls: { home: number; away: number };
  yellowCards: { home: number; away: number };
  redCards: { home: number; away: number };
}

export interface BallPosition {
  x: number; // 0-100 (0 = but domicile, 100 = but extérieur)
  y: number; // 0-100 (0 = gauche, 100 = droite)
  zone: 'home_defense' | 'home_midfield' | 'center' | 'away_midfield' | 'away_defense';
  team: 'home' | 'away' | 'neutral'; // Équipe qui a le ballon
}

// ============================================
// CONSTANTES - Grandes Rencontres
// ============================================

// Ligues prioritaires
const PRIORITY_LEAGUES: Record<string, number> = {
  'UEFA Champions League': 100,
  'UEFA Europa League': 90,
  'English Premier League': 85,
  'Spanish LaLiga': 85,
  'German Bundesliga': 80,
  'Italian Serie A': 80,
  'French Ligue 1': 75,
  'FIFA World Cup': 100,
  'UEFA Euro': 100,
  'Copa America': 95,
  'FA Cup': 70,
  'Copa del Rey': 70,
  'DFB-Pokal': 70,
};

// Équipes "grandes" pour priorité
const BIG_TEAMS = [
  // Angleterre
  'Manchester City', 'Manchester United', 'Liverpool', 'Arsenal', 'Chelsea', 'Tottenham',
  // Espagne
  'Real Madrid', 'Barcelona', 'Atletico Madrid', 'Sevilla',
  // Allemagne
  'Bayern Munich', 'Borussia Dortmund', 'RB Leipzig',
  // Italie
  'Juventus', 'AC Milan', 'Inter Milan', 'Napoli', 'Roma',
  // France
  'PSG', 'Paris Saint-Germain', 'Marseille', 'Lyon',
  // Autres
  'Ajax', 'Benfica', 'Porto', 'Sporting CP',
];

// Couleurs par défaut des équipes
const TEAM_COLORS: Record<string, string> = {
  'Manchester City': '#6CABDD',
  'Manchester United': '#DA291C',
  'Liverpool': '#C8102E',
  'Arsenal': '#EF0107',
  'Chelsea': '#034694',
  'Tottenham': '#132257',
  'Real Madrid': '#FEBE10',
  'Barcelona': '#A50044',
  'Bayern Munich': '#DC052D',
  'Borussia Dortmund': '#FDE100',
  'Juventus': '#000000',
  'AC Milan': '#FB090B',
  'Inter Milan': '#0068A8',
  'PSG': '#004170',
  'Paris Saint-Germain': '#004170',
};

// ============================================
// ESPN API
// ============================================

const ESPN_FOOTBALL_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/all/league';

// Mapping des ligues ESPN
const ESPN_LEAGUES = [
  { id: 'eng.1', name: 'English Premier League', priority: 85 },
  { id: 'esp.1', name: 'Spanish LaLiga', priority: 85 },
  { id: 'ger.1', name: 'German Bundesliga', priority: 80 },
  { id: 'ita.1', name: 'Italian Serie A', priority: 80 },
  { id: 'fra.1', name: 'French Ligue 1', priority: 75 },
  { id: 'uefa.champions', name: 'UEFA Champions League', priority: 100 },
  { id: 'uefa.europa', name: 'UEFA Europa League', priority: 90 },
];

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Calcule la priorité d'un match
 */
function calculateMatchPriority(
  leagueName: string,
  homeTeam: string,
  awayTeam: string
): number {
  let priority = 50; // Base

  // Bonus ligue
  for (const [league, bonus] of Object.entries(PRIORITY_LEAGUES)) {
    if (leagueName.toLowerCase().includes(league.toLowerCase())) {
      priority = Math.max(priority, bonus);
      break;
    }
  }

  // Bonus si deux grandes équipes s'affrontent (classico)
  const homeIsBig = BIG_TEAMS.some(t => homeTeam.toLowerCase().includes(t.toLowerCase()));
  const awayIsBig = BIG_TEAMS.some(t => awayTeam.toLowerCase().includes(t.toLowerCase()));

  if (homeIsBig && awayIsBig) {
    priority += 20; // Classico!
  } else if (homeIsBig || awayIsBig) {
    priority += 10;
  }

  return Math.min(100, priority);
}

/**
 * Détermine la couleur d'une équipe
 */
function getTeamColor(teamName: string): string {
  // Recherche directe
  for (const [name, color] of Object.entries(TEAM_COLORS)) {
    if (teamName.toLowerCase().includes(name.toLowerCase())) {
      return color;
    }
  }
  // Couleur par défaut
  return '#6B7280';
}

/**
 * Parse le temps du match
 */
function parseMatchTime(status: string, displayClock: string, period: number): LiveFootballMatch['time'] {
  // Période
  let matchPeriod: LiveFootballMatch['time']['period'] = 'first_half';
  
  if (period === 1) matchPeriod = 'first_half';
  else if (period === 2) matchPeriod = 'second_half';
  else if (period === 3) matchPeriod = 'extra_time';
  else if (displayClock?.includes('HT')) matchPeriod = 'half_time';
  else if (displayClock?.includes('FT')) matchPeriod = 'finished';
  else if (displayClock?.includes('PK')) matchPeriod = 'penalties';

  // Minute
  let minute = 0;
  const clockMatch = displayClock?.match(/(\d+)/);
  if (clockMatch) {
    minute = parseInt(clockMatch[1]);
    if (period === 2) minute += 45;
    if (period === 3) minute += 90;
  }

  return {
    minute,
    period: matchPeriod,
    display: displayClock || `${minute}'`
  };
}

/**
 * Estime la position du ballon basée sur les événements et stats
 */
function estimateBallPosition(
  events: MatchEvent[],
  stats: MatchStats,
  homeTeam: string,
  awayTeam: string
): BallPosition {
  // Par défaut: centre
  let x = 50;
  let y = 50;
  let team: 'home' | 'away' | 'neutral' = 'neutral';

  // Basé sur la possession
  if (stats.possession.home > 55) {
    x = 60 + (stats.possession.home - 55) * 0.5; // Vers le camp adverse
    team = 'home';
  } else if (stats.possession.away > 55) {
    x = 40 - (stats.possession.away - 55) * 0.5; // Vers le camp adverse
    team = 'away';
  }

  // Ajuster selon le dernier événement
  const lastEvent = events[events.length - 1];
  if (lastEvent) {
    if (lastEvent.type === 'goal') {
      // Après un but, reset au centre
      x = 50;
      y = 50;
      team = 'neutral';
    } else if (lastEvent.team === 'home') {
      // Dernier événement par l'équipe domicile = elles attaque
      x = Math.min(85, x + 15);
      team = 'home';
    } else {
      x = Math.max(15, x - 15);
      team = 'away';
    }
  }

  // Ajouter un peu de randomness pour le réalisme
  x += (Math.random() - 0.5) * 10;
  y += (Math.random() - 0.5) * 20;

  // Clamp
  x = Math.max(5, Math.min(95, x));
  y = Math.max(5, Math.min(95, y));

  // Zone
  let zone: BallPosition['zone'];
  if (x < 25) zone = 'home_defense';
  else if (x < 45) zone = 'home_midfield';
  else if (x < 55) zone = 'center';
  else if (x < 75) zone = 'away_midfield';
  else zone = 'away_defense';

  return { x, y, zone, team };
}

/**
 * Parse les événements ESPN
 */
function parseEvents(espnEvents: any[]): MatchEvent[] {
  if (!espnEvents) return [];

  return espnEvents.map((e, i) => ({
    id: `event_${i}`,
    type: mapEventType(e.type?.id || e.type, e.type?.text),
    minute: e.clock?.value || e.time?.displayValue || 0,
    player: e.athlete?.displayName || e.player?.displayName || 'Unknown',
    team: e.team?.id === e.competition?.competitors?.[0]?.team?.id ? 'home' : 'away',
    assist: e.assist?.displayName || undefined,
    detail: e.type?.text || undefined,
  }));
}

/**
 * Map les types d'événements ESPN
 */
function mapEventType(typeId: string | number, text?: string): MatchEvent['type'] {
  const id = String(typeId).toLowerCase();
  const desc = (text || '').toLowerCase();

  if (desc.includes('own goal') || id === 'own_goal') return 'own_goal';
  if (desc.includes('penalty') && desc.includes('miss')) return 'penalty_missed';
  if (desc.includes('penalty')) return 'penalty';
  if (desc.includes('red card') || id === 'red_card') return 'red_card';
  if (desc.includes('yellow card') || id === 'yellow_card') return 'yellow_card';
  if (desc.includes('substitution') || id === 'sub') return 'substitution';
  if (desc.includes('var')) return 'var';
  if (desc.includes('goal') || id === 'goal') return 'goal';

  return 'goal'; // Default
}

/**
 * Parse les stats ESPN
 */
function parseStats(competitors: any[]): MatchStats {
  const home = competitors.find((c: any) => c.homeAway === 'home');
  const away = competitors.find((c: any) => c.homeAway === 'away');

  const getStat = (team: any, statName: string): number => {
    const stat = team?.statistics?.find((s: any) => 
      s.name?.toLowerCase().includes(statName.toLowerCase())
    );
    return stat?.value || 0;
  };

  return {
    possession: {
      home: getStat(home, 'possession') || 50,
      away: getStat(away, 'possession') || 50,
    },
    shots: {
      home: getStat(home, 'shots') || getStat(home, 'total shots') || 0,
      away: getStat(away, 'shots') || getStat(away, 'total shots') || 0,
    },
    shotsOnTarget: {
      home: getStat(home, 'shots on target') || 0,
      away: getStat(away, 'shots on target') || 0,
    },
    corners: {
      home: getStat(home, 'corners') || 0,
      away: getStat(away, 'corners') || 0,
    },
    fouls: {
      home: getStat(home, 'fouls') || 0,
      away: getStat(away, 'fouls') || 0,
    },
    yellowCards: {
      home: getStat(home, 'yellow cards') || 0,
      away: getStat(away, 'yellow cards') || 0,
    },
    redCards: {
      home: getStat(home, 'red cards') || 0,
      away: getStat(away, 'red cards') || 0,
    },
  };
}

// ============================================
// API PRINCIPALE
// ============================================

/**
 * Récupère tous les matchs live
 */
export async function fetchLiveFootballMatches(): Promise<LiveFootballMatch[]> {
  const allMatches: LiveFootballMatch[] = [];

  // Récupérer les matchs de chaque ligue en parallèle
  const promises = ESPN_LEAGUES.map(async (league) => {
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.id}/scoreboard`,
        {
          next: { revalidate: 30 }, // 30 secondes cache
          headers: { 'Accept': 'application/json' }
        }
      );

      if (!response.ok) {
        console.log(`⚠️ ESPN ${league.name} error: ${response.status}`);
        return [];
      }

      const data = await response.json();
      const events = data.events || [];

      return events
        .filter((e: any) => e.status?.type?.state === 'in') // Live uniquement
        .map((event: any) => parseESPNEvent(event, league.name, league.priority));

    } catch (error) {
      console.log(`⚠️ Error fetching ${league.name}:`, error);
      return [];
    }
  });

  const results = await Promise.all(promises);
  results.forEach(matches => allMatches.push(...matches));

  // Trier par priorité décroissante
  allMatches.sort((a, b) => b.priority - a.priority);

  console.log(`✅ Live Football: ${allMatches.length} matchs en cours`);

  return allMatches;
}

/**
 * Parse un événement ESPN en LiveFootballMatch
 */
function parseESPNEvent(event: any, leagueName: string, leaguePriority: number): LiveFootballMatch {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors || [];

  const homeCompetitor = competitors.find((c: any) => c.homeAway === 'home');
  const awayCompetitor = competitors.find((c: any) => c.homeAway === 'away');

  const homeTeam = homeCompetitor?.team?.displayName || 'Home';
  const awayTeam = awayCompetitor?.team?.displayName || 'Away';

  const stats = parseStats(competitors);
  const espnEvents = event.competitions?.[0]?.details || [];
  const parsedEvents = parseEvents(espnEvents);

  return {
    id: event.id,
    homeTeam: {
      id: homeCompetitor?.team?.id || 'home',
      name: homeTeam,
      shortName: homeCompetitor?.team?.shortDisplayName || homeTeam.substring(0, 3).toUpperCase(),
      logo: homeCompetitor?.team?.logo || '',
      color: getTeamColor(homeTeam),
    },
    awayTeam: {
      id: awayCompetitor?.team?.id || 'away',
      name: awayTeam,
      shortName: awayCompetitor?.team?.shortDisplayName || awayTeam.substring(0, 3).toUpperCase(),
      logo: awayCompetitor?.team?.logo || '',
      color: getTeamColor(awayTeam),
    },
    score: {
      home: parseInt(homeCompetitor?.score) || 0,
      away: parseInt(awayCompetitor?.score) || 0,
    },
    time: parseMatchTime(
      event.status?.type?.name || '',
      event.status?.displayClock || '',
      event.status?.period || 1
    ),
    status: event.status?.type?.state === 'in' ? 'live' : 'scheduled',
    events: parsedEvents,
    stats,
    ballPosition: estimateBallPosition(parsedEvents, stats, homeTeam, awayTeam),
    priority: calculateMatchPriority(leagueName, homeTeam, awayTeam),
    league: {
      name: leagueName,
      logo: competition?.league?.logo || '',
    },
    venue: competition?.venue?.displayName,
  };
}

/**
 * Récupère les détails d'un match spécifique
 */
export async function fetchMatchDetails(matchId: string): Promise<LiveFootballMatch | null> {
  try {
    // Essayer chaque ligue
    for (const league of ESPN_LEAGUES) {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.id}/summary?event=${matchId}`,
        { next: { revalidate: 10 } }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.header?.id) {
          return parseESPNEvent(data.header, league.name, league.priority);
        }
      }
    }

    return null;
  } catch (error) {
    console.log(`⚠️ Error fetching match ${matchId}:`, error);
    return null;
  }
}

/**
 * Récupère les prochains matchs (non live)
 */
export async function fetchUpcomingMatches(): Promise<LiveFootballMatch[]> {
  const allMatches: LiveFootballMatch[] = [];

  const promises = ESPN_LEAGUES.map(async (league) => {
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.id}/scoreboard`,
        { next: { revalidate: 300 } }
      );

      if (!response.ok) return [];

      const data = await response.json();
      const events = data.events || [];

      return events
        .filter((e: any) => e.status?.type?.state !== 'in' && e.status?.type?.state !== 'post')
        .slice(0, 5) // Max 5 par ligue
        .map((event: any) => parseESPNEvent(event, league.name, league.priority));

    } catch {
      return [];
    }
  });

  const results = await Promise.all(promises);
  results.forEach(matches => allMatches.push(...matches));

  allMatches.sort((a, b) => b.priority - a.priority);

  return allMatches.slice(0, 10); // Max 10 matchs à venir
}

// ============================================
// EXPORT
// ============================================

const footballLiveService = {
  fetchLiveFootballMatches,
  fetchMatchDetails,
  fetchUpcomingMatches,
};

export default footballLiveService;
