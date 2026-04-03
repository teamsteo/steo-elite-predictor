/**
 * NBA Injury Service - ESPN Official Injury Report
 * 
 * Source: https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries
 * 
 * API 100% GRATUITE et officielle de la NBA
 * Aucune clé API requise
 */

export interface NBAInjury {
  player: string;
  team: string;
  status: string;
  details: string;
  position?: string;
}

export interface NBATeamInjuries {
  team: string;
  injuries: NBAInjury[];
  count: number;
}

// Cache des blessures NBA (30 minutes)
let cachedInjuries: NBAInjury[] = [];
let cacheTimestamp = 0;
const CACHE_TTL = 30 * 60 * 1000;

/**
 * Récupère toutes les blessures NBA depuis ESPN
 */
export async function fetchAllNBAInjuries(): Promise<NBAInjury[]> {
  if (cachedInjuries.length > 0 && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedInjuries;
  }

  try {
    const url = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries';
    
    console.log('🏥 Récupération blessures NBA (ESPN Official)...');
    
    const response = await fetch(url, {
      next: { revalidate: 1800 }
    });
    
    if (!response.ok) {
      console.log(`⚠️ ESPN Injury API erreur: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const allInjuries: NBAInjury[] = [];
    const teamsWithInjuries = data.injuries || [];
    
    for (const teamData of teamsWithInjuries) {
      const teamName = teamData.displayName || '';
      const teamInjuries = teamData.injuries || [];
      
      for (const inj of teamInjuries) {
        const athlete = inj.athlete || {};
        allInjuries.push({
          player: athlete.displayName || 'Unknown',
          team: athlete.team?.displayName || teamName,
          status: inj.status || 'Unknown',
          details: inj.shortComment || inj.longComment || '',
          position: athlete.position?.name || ''
        });
      }
    }
    
    cachedInjuries = allInjuries;
    cacheTimestamp = Date.now();
    
    console.log(`✅ ${allInjuries.length} blessures NBA récupérées`);
    return allInjuries;
    
  } catch (error) {
    console.error('❌ Erreur fetch NBA injuries:', error);
    return [];
  }
}

/**
 * Récupère les blessures pour un match NBA (2 équipes)
 */
export async function getNBAMatchInjuries(
  homeTeam: string, 
  awayTeam: string
): Promise<{
  homeTeam: NBATeamInjuries;
  awayTeam: NBATeamInjuries;
  totalInjuries: number;
  source: string;
  summary: string;
}> {
  const allInjuries = await fetchAllNBAInjuries();
  
  const findTeamInjuries = (teamName: string): NBAInjury[] => {
    const normalized = teamName.toLowerCase().trim();
    return allInjuries.filter(inj => {
      const injTeam = inj.team.toLowerCase();
      return injTeam.includes(normalized) || normalized.includes(injTeam);
    });
  };
  
  const homeInjuries = findTeamInjuries(homeTeam);
  const awayInjuries = findTeamInjuries(awayTeam);
  
  const totalInjuries = homeInjuries.length + awayInjuries.length;
  
  let summary = '';
  if (totalInjuries === 0) {
    summary = '✅ Aucune blessure signalée';
  } else {
    const homeNames = homeInjuries.slice(0, 2).map(i => `${i.player} (${i.status})`).join(', ');
    const awayNames = awayInjuries.slice(0, 2).map(i => `${i.player} (${i.status})`).join(', ');
    
    summary = '⚠️ Blessures: ';
    if (homeNames) summary += `${homeTeam}: ${homeNames}`;
    if (awayNames) summary += ` | ${awayTeam}: ${awayNames}`;
  }
  
  return {
    homeTeam: { team: homeTeam, injuries: homeInjuries, count: homeInjuries.length },
    awayTeam: { team: awayTeam, injuries: awayInjuries, count: awayInjuries.length },
    totalInjuries,
    source: 'espn_nba_official',
    summary
  };
}

// Joueurs NBA clés par équipe (pour calcul d'impact)
export const NBA_KEY_PLAYERS: Record<string, string[]> = {
  'Boston Celtics': ['Jayson Tatum', 'Jaylen Brown', 'Kristaps Porzingis', 'Jrue Holiday'],
  'Cleveland Cavaliers': ['Donovan Mitchell', 'Darius Garland', 'Jarrett Allen', 'Evan Mobley'],
  'Oklahoma City Thunder': ['Shai Gilgeous-Alexander', 'Jalen Williams', 'Chet Holmgren'],
  'Denver Nuggets': ['Nikola Jokic', 'Jamal Murray', 'Michael Porter Jr.', 'Aaron Gordon'],
  'Minnesota Timberwolves': ['Anthony Edwards', 'Karl-Anthony Towns', 'Rudy Gobert'],
  'Milwaukee Bucks': ['Giannis Antetokounmpo', 'Damian Lillard', 'Khris Middleton'],
  'Dallas Mavericks': ['Luka Doncic', 'Kyrie Irving', 'P.J. Washington'],
  'LA Clippers': ['Kawhi Leonard', 'Paul George', 'James Harden'],
  'Philadelphia 76ers': ['Joel Embiid', 'Tyrese Maxey', 'Paul George'],
  'New York Knicks': ['Jalen Brunson', 'Julius Randle', 'OG Anunoby'],
  'Phoenix Suns': ['Kevin Durant', 'Devin Booker', 'Bradley Beal'],
  'Los Angeles Lakers': ['LeBron James', 'Anthony Davis', 'Austin Reaves'],
  'Indiana Pacers': ['Tyrese Haliburton', 'Pascal Siakam', 'Myles Turner'],
  'Miami Heat': ['Jimmy Butler', 'Bam Adebayo', 'Tyler Herro'],
  'Orlando Magic': ['Paolo Banchero', 'Franz Wagner', 'Jalen Suggs'],
  'Sacramento Kings': ['De\'Aaron Fox', 'Domantas Sabonis', 'Malik Monk'],
  'Golden State Warriors': ['Stephen Curry', 'Klay Thompson', 'Draymond Green'],
  'Memphis Grizzlies': ['Ja Morant', 'Desmond Bane', 'Jaren Jackson Jr.'],
  'New Orleans Pelicans': ['Zion Williamson', 'Brandon Ingram', 'CJ McCollum'],
  'Atlanta Hawks': ['Trae Young', 'Dejounte Murray', 'Clint Capela'],
  'Houston Rockets': ['Alperen Sengun', 'Jalen Green', 'Fred VanVleet'],
  'Chicago Bulls': ['Zach LaVine', 'DeMar DeRozan', 'Nikola Vucevic'],
  'Brooklyn Nets': ['Mikal Bridges', 'Cameron Johnson', 'Nic Claxton'],
  'Toronto Raptors': ['Scottie Barnes', 'Pascal Siakam', 'OG Anunoby'],
  'San Antonio Spurs': ['Victor Wembanyama', 'De\'Aaron Fox', 'Jeremy Sochan'],
  'Portland Trail Blazers': ['Damian Lillard', 'Anfernee Simons', 'Jerami Grant'],
  'Utah Jazz': ['Lauri Markkanen', 'John Collins', 'Walker Kessler'],
  'Charlotte Hornets': ['LaMelo Ball', 'Brandon Miller', 'Miles Bridges'],
  'Detroit Pistons': ['Cade Cunningham', 'Jaden Ivey', 'Jalen Duren'],
  'Washington Wizards': ['Kyle Kuzma', 'Jordan Poole', 'Bilal Coulibaly'],
};

const nbaInjuryService = {
  fetchAllNBAInjuries,
  getNBAMatchInjuries
};

export default nbaInjuryService;
