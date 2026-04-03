/**
 * TheSportsDB Service - SOURCE 100% GRATUITE pour blessures Football
 * 
 * API publique pour les blessures et informations d'équipes
 * Documentation: https://www.thesportsdb.com/free_api_info
 * 
 * Pas de clé API requise pour l'utilisation de base!
 */

export interface TSDBPlayer {
  idPlayer: string;
  strPlayer: string;
  strTeam: string;
  strPosition: string;
  strStatus: string;
  strDescriptionEN: string;
}

export interface InjuryInfo {
  player: string;
  team: string;
  status: 'injured' | 'suspended' | 'doubt' | 'available';
  type: string;
  details?: string;
}

// Mapping équipes vers ID TheSportsDB
const TEAM_ID_MAP: Record<string, string> = {
  // Premier League
  'Manchester City': '133604',
  'Arsenal': '133602',
  'Liverpool': '133613',
  'Manchester United': '133612',
  'Chelsea': '133601',
  'Tottenham': '133615',
  'Newcastle': '133611',
  'Brighton': '133600',
  'Aston Villa': '133599',
  'West Ham': '133616',
  'Crystal Palace': '133606',
  'Brentford': '133597',
  'Fulham': '133608',
  'Wolves': '133617',
  'Everton': '133607',
  'Bournemouth': '133596',
  'Nottingham Forest': '133614',
  // La Liga
  'Real Madrid': '133802',
  'Barcelona': '133797',
  'Atletico Madrid': '133796',
  'Sevilla': '133805',
  'Real Sociedad': '133804',
  'Villarreal': '133806',
  // Serie A
  'Inter Milan': '133982',
  'AC Milan': '133977',
  'Juventus': '133981',
  'Napoli': '133985',
  'Roma': '133987',
  'Lazio': '133983',
  'Atalanta': '133978',
  // Bundesliga
  'Bayern Munich': '133432',
  'Borussia Dortmund': '133435',
  'RB Leipzig': '133442',
  'Bayer Leverkusen': '133433',
  // Ligue 1
  'PSG': '133729',
  'Paris Saint-Germain': '133729',
  'Marseille': '133720',
  'Monaco': '133726',
  'Lyon': '133719',
  'Lille': '133716',
  'Nice': '133727',
  'Rennes': '133730',
  'Lens': '133713',
};

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 350;

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => 
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
    );
  }
  lastRequestTime = Date.now();
}

/**
 * Recherche une équipe par nom
 */
export async function searchTeam(teamName: string): Promise<{idTeam: string; strTeam: string} | null> {
  await waitForRateLimit();
  
  try {
    const url = `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(teamName)}`;
    
    const response = await fetch(url, {
      next: { revalidate: 86400 }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.teams && data.teams.length > 0) {
      return {
        idTeam: data.teams[0].idTeam,
        strTeam: data.teams[0].strTeam
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Récupère l'effectif d'une équipe
 */
export async function getTeamSquad(teamName: string): Promise<TSDBPlayer[]> {
  let teamId = TEAM_ID_MAP[teamName];
  
  if (!teamId) {
    const team = await searchTeam(teamName);
    if (team) {
      teamId = team.idTeam;
      TEAM_ID_MAP[teamName] = teamId;
    }
  }
  
  if (!teamId) return [];
  
  await waitForRateLimit();
  
  try {
    const url = `https://www.thesportsdb.com/api/v1/json/3/lookup_all_players.php?id=${teamId}`;
    
    const response = await fetch(url, {
      next: { revalidate: 3600 }
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    return data.player || [];
  } catch {
    return [];
  }
}

/**
 * Extrait les blessures d'un effectif
 */
export function extractInjuriesFromSquad(players: TSDBPlayer[]): InjuryInfo[] {
  const injuries: InjuryInfo[] = [];
  
  for (const player of players) {
    const status = player.strStatus?.toLowerCase() || '';
    const description = player.strDescriptionEN?.toLowerCase() || '';
    
    if (status.includes('injur') || description.includes('injur')) {
      injuries.push({
        player: player.strPlayer,
        team: player.strTeam,
        status: 'injured',
        type: 'Injury',
        details: player.strStatus || 'Injured'
      });
    } else if (status.includes('suspend') || description.includes('suspend')) {
      injuries.push({
        player: player.strPlayer,
        team: player.strTeam,
        status: 'suspended',
        type: 'Suspension',
        details: player.strStatus || 'Suspended'
      });
    } else if (status.includes('doubt') || description.includes('doubt')) {
      injuries.push({
        player: player.strPlayer,
        team: player.strTeam,
        status: 'doubt',
        type: 'Doubtful',
        details: player.strStatus || 'Doubtful'
      });
    }
  }
  
  return injuries;
}

/**
 * Récupère les blessures pour un match Football (2 équipes)
 */
export async function getFootballMatchInjuries(
  homeTeam: string, 
  awayTeam: string
): Promise<{
  homeTeam: { team: string; injuries: InjuryInfo[]; count: number };
  awayTeam: { team: string; injuries: InjuryInfo[]; count: number };
  totalInjuries: number;
  source: string;
  summary: string;
}> {
  const [homeSquad, awaySquad] = await Promise.all([
    getTeamSquad(homeTeam),
    getTeamSquad(awayTeam)
  ]);
  
  const homeInjuries = extractInjuriesFromSquad(homeSquad);
  const awayInjuries = extractInjuriesFromSquad(awaySquad);
  
  const totalInjuries = homeInjuries.length + awayInjuries.length;
  
  let summary = '';
  if (totalInjuries === 0) {
    summary = '✅ Aucune blessure signalée';
  } else {
    const homeInjured = homeInjuries.slice(0, 2).map(i => i.player).join(', ');
    const awayInjured = awayInjuries.slice(0, 2).map(i => i.player).join(', ');
    
    summary = '⚠️ Blessures: ';
    if (homeInjured) summary += `${homeTeam}: ${homeInjured}`;
    if (awayInjured) summary += ` | ${awayTeam}: ${awayInjured}`;
  }
  
  return {
    homeTeam: { team: homeTeam, injuries: homeInjuries, count: homeInjuries.length },
    awayTeam: { team: awayTeam, injuries: awayInjuries, count: awayInjuries.length },
    totalInjuries,
    source: 'thesportsdb',
    summary
  };
}

// Joueurs clés Football par équipe
export const FOOTBALL_KEY_PLAYERS: Record<string, string[]> = {
  'Manchester City': ['Haaland', 'De Bruyne', 'Rodri', 'Foden'],
  'Arsenal': ['Saka', 'Odegaard', 'Martinelli', 'Saliba', 'Rice'],
  'Liverpool': ['Salah', 'Nunez', 'Van Dijk', 'Alexander-Arnold'],
  'Manchester United': ['Rashford', 'Bruno', 'Casemiro', 'Martinez'],
  'Chelsea': ['Palmer', 'Jackson', 'Caicedo', 'Reece James'],
  'Tottenham': ['Son', 'Maddison', 'Kulusevski', 'Romero'],
  'Real Madrid': ['Vinicius', 'Bellingham', 'Rodrygo', 'Courtois'],
  'Barcelona': ['Lewandowski', 'Pedri', 'Gavi', 'Yamal', 'Raphinha'],
  'Bayern Munich': ['Kane', 'Musiala', 'Sane', 'Muller'],
  'PSG': ['Dembélé', 'Barcola', 'Vitinha', 'Donnarumma'],
  'Inter Milan': ['Lautaro', 'Thuram', 'Barella'],
  'Juventus': ['Vlahovic', 'Chiesa', 'Rabiot'],
};

const theSportsDBService = {
  searchTeam,
  getTeamSquad,
  extractInjuriesFromSquad,
  getFootballMatchInjuries
};

export default theSportsDBService;
