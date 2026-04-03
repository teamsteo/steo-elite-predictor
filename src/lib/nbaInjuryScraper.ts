/**
 * NBA Injury Scraper - Récupération des blessures NBA officielles
 * Source: official.nba.com/nba-injury-report
 * DONNÉES OFFICIELLES NBA - Mise à jour quotidienne
 */

import ZAI from 'z-ai-web-dev-sdk';

export interface NBAPlayerInjury {
  playerName: string;
  team: string;
  teamAbbreviation: string;
  injuryType: string;
  status: 'Out' | 'Doubtful' | 'Questionable' | 'Probable';
  gameDate: string;
  matchup: string;
  source: string;
  scrapedAt: string;
}

export interface NBATeamInjuries {
  team: string;
  abbreviation: string;
  players: NBAPlayerInjury[];
  lastUpdated: string;
}

// Cache pour éviter les requêtes multiples
const nbaInjuryCache = new Map<string, NBATeamInjuries>();
let lastNBAScrapeTime = 0;
const NBA_CACHE_TTL = 30 * 60 * 1000; // 30 minutes (les blessures changent souvent)

// URL officielle du rapport de blessures NBA
const NBA_INJURY_REPORT_URL = 'https://official.nba.com/nba-injury-report-2025-26-season/';

// Mapping des abréviations NBA vers noms complets
const NBA_TEAM_MAPPING: Record<string, { name: string; abbrev: string }> = {
  // Eastern Conference
  'atlanta hawks': { name: 'Atlanta Hawks', abbrev: 'ATL' },
  'hawks': { name: 'Atlanta Hawks', abbrev: 'ATL' },
  'boston celtics': { name: 'Boston Celtics', abbrev: 'BOS' },
  'celtics': { name: 'Boston Celtics', abbrev: 'BOS' },
  'brooklyn nets': { name: 'Brooklyn Nets', abbrev: 'BKN' },
  'nets': { name: 'Brooklyn Nets', abbrev: 'BKN' },
  'charlotte hornets': { name: 'Charlotte Hornets', abbrev: 'CHA' },
  'hornets': { name: 'Charlotte Hornets', abbrev: 'CHA' },
  'chicago bulls': { name: 'Chicago Bulls', abbrev: 'CHI' },
  'bulls': { name: 'Chicago Bulls', abbrev: 'CHI' },
  'cleveland cavaliers': { name: 'Cleveland Cavaliers', abbrev: 'CLE' },
  'cavaliers': { name: 'Cleveland Cavaliers', abbrev: 'CLE' },
  'cavs': { name: 'Cleveland Cavaliers', abbrev: 'CLE' },
  'detroit pistons': { name: 'Detroit Pistons', abbrev: 'DET' },
  'pistons': { name: 'Detroit Pistons', abbrev: 'DET' },
  'indiana pacers': { name: 'Indiana Pacers', abbrev: 'IND' },
  'pacers': { name: 'Indiana Pacers', abbrev: 'IND' },
  'miami heat': { name: 'Miami Heat', abbrev: 'MIA' },
  'heat': { name: 'Miami Heat', abbrev: 'MIA' },
  'milwaukee bucks': { name: 'Milwaukee Bucks', abbrev: 'MIL' },
  'bucks': { name: 'Milwaukee Bucks', abbrev: 'MIL' },
  'new york knicks': { name: 'New York Knicks', abbrev: 'NYK' },
  'knicks': { name: 'New York Knicks', abbrev: 'NYK' },
  'orlando magic': { name: 'Orlando Magic', abbrev: 'ORL' },
  'magic': { name: 'Orlando Magic', abbrev: 'ORL' },
  'philadelphia 76ers': { name: 'Philadelphia 76ers', abbrev: 'PHI' },
  '76ers': { name: 'Philadelphia 76ers', abbrev: 'PHI' },
  'sixers': { name: 'Philadelphia 76ers', abbrev: 'PHI' },
  'toronto raptors': { name: 'Toronto Raptors', abbrev: 'TOR' },
  'raptors': { name: 'Toronto Raptors', abbrev: 'TOR' },
  'washington wizards': { name: 'Washington Wizards', abbrev: 'WAS' },
  'wizards': { name: 'Washington Wizards', abbrev: 'WAS' },
  
  // Western Conference
  'dallas mavericks': { name: 'Dallas Mavericks', abbrev: 'DAL' },
  'mavericks': { name: 'Dallas Mavericks', abbrev: 'DAL' },
  'mavs': { name: 'Dallas Mavericks', abbrev: 'DAL' },
  'denver nuggets': { name: 'Denver Nuggets', abbrev: 'DEN' },
  'nuggets': { name: 'Denver Nuggets', abbrev: 'DEN' },
  'golden state warriors': { name: 'Golden State Warriors', abbrev: 'GSW' },
  'warriors': { name: 'Golden State Warriors', abbrev: 'GSW' },
  'houston rockets': { name: 'Houston Rockets', abbrev: 'HOU' },
  'rockets': { name: 'Houston Rockets', abbrev: 'HOU' },
  'la clippers': { name: 'LA Clippers', abbrev: 'LAC' },
  'clippers': { name: 'LA Clippers', abbrev: 'LAC' },
  'los angeles clippers': { name: 'LA Clippers', abbrev: 'LAC' },
  'los angeles lakers': { name: 'Los Angeles Lakers', abbrev: 'LAL' },
  'lakers': { name: 'Los Angeles Lakers', abbrev: 'LAL' },
  'memphis grizzlies': { name: 'Memphis Grizzlies', abbrev: 'MEM' },
  'grizzlies': { name: 'Memphis Grizzlies', abbrev: 'MEM' },
  'minnesota timberwolves': { name: 'Minnesota Timberwolves', abbrev: 'MIN' },
  'timberwolves': { name: 'Minnesota Timberwolves', abbrev: 'MIN' },
  'wolves': { name: 'Minnesota Timberwolves', abbrev: 'MIN' },
  'new orleans pelicans': { name: 'New Orleans Pelicans', abbrev: 'NOP' },
  'pelicans': { name: 'New Orleans Pelicans', abbrev: 'NOP' },
  'oklahoma city thunder': { name: 'Oklahoma City Thunder', abbrev: 'OKC' },
  'thunder': { name: 'Oklahoma City Thunder', abbrev: 'OKC' },
  'phoenix suns': { name: 'Phoenix Suns', abbrev: 'PHX' },
  'suns': { name: 'Phoenix Suns', abbrev: 'PHX' },
  'portland trail blazers': { name: 'Portland Trail Blazers', abbrev: 'POR' },
  'blazers': { name: 'Portland Trail Blazers', abbrev: 'POR' },
  'trail blazers': { name: 'Portland Trail Blazers', abbrev: 'POR' },
  'sacramento kings': { name: 'Sacramento Kings', abbrev: 'SAC' },
  'kings': { name: 'Sacramento Kings', abbrev: 'SAC' },
  'san antonio spurs': { name: 'San Antonio Spurs', abbrev: 'SAS' },
  'spurs': { name: 'San Antonio Spurs', abbrev: 'SAS' },
  'utah jazz': { name: 'Utah Jazz', abbrev: 'UTA' },
  'jazz': { name: 'Utah Jazz', abbrev: 'UTA' },
};

// Mapping inverse: abréviation -> nom complet
const ABBREV_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.values(NBA_TEAM_MAPPING).map(v => [v.abbrev, v.name])
);

/**
 * Normalise un nom d'équipe NBA
 */
function normalizeNBATeamName(name: string): { name: string; abbrev: string } {
  const lower = name.toLowerCase().trim();
  return NBA_TEAM_MAPPING[lower] || { name, abbrev: name.substring(0, 3).toUpperCase() };
}

/**
 * Parse le statut de blessure
 */
function parseInjuryStatus(statusText: string): 'Out' | 'Doubtful' | 'Questionable' | 'Probable' {
  const lower = statusText.toLowerCase();
  
  if (lower.includes('out') || lower === 'o') return 'Out';
  if (lower.includes('doubtful') || lower === 'd') return 'Doubtful';
  if (lower.includes('questionable') || lower === 'q') return 'Questionable';
  if (lower.includes('probable') || lower === 'p') return 'Probable';
  
  // Par défaut
  if (lower.includes('injured') || lower.includes('injury')) return 'Out';
  
  return 'Questionable';
}

/**
 * Extrait les blessures depuis le HTML du rapport NBA officiel
 */
function parseNBAInjuryReport(html: string): NBAPlayerInjury[] {
  const injuries: NBAPlayerInjury[] = [];
  
  try {
    // Le rapport NBA officiel est généralement en format tableau
    // Format typique: Date | Game | Team | Player | Injury Type | Status
    
    // Extraire les lignes de tableau
    const rowPattern = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
    const rows = html.match(rowPattern) || [];
    
    for (const row of rows) {
      try {
        // Extraire les cellules
        const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        const cells: string[] = [];
        let cellMatch;
        
        while ((cellMatch = cellPattern.exec(row)) !== null) {
          // Nettoyer le HTML
          const cellText = cellMatch[1]
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .trim();
          cells.push(cellText);
        }
        
        // Le format NBA a généralement: Date, Game, Team, Player, Injury, Status
        if (cells.length >= 4) {
          let gameDate = cells[0] || '';
          let matchup = cells[1] || '';
          let teamAbbrev = cells[2] || '';
          let playerName = cells[3] || '';
          let injuryType = cells[4] || 'Not specified';
          let statusText = cells[5] || '';
          
          // Parfois le format est différent, on essaie de détecter
          if (!playerName && cells.length >= 3) {
            // Format alternatif: Team, Player, Status
            teamAbbrev = cells[0];
            playerName = cells[1];
            statusText = cells[2];
            injuryType = cells[3] || 'Not specified';
          }
          
          // Normaliser l'équipe
          const teamInfo = normalizeNBATeamName(teamAbbrev);
          
          // Parser le statut
          const status = parseInjuryStatus(statusText);
          
          if (playerName && playerName.length > 2) {
            injuries.push({
              playerName,
              team: teamInfo.name || ABBREV_TO_NAME[teamAbbrev] || teamAbbrev,
              teamAbbreviation: teamInfo.abbrev || teamAbbrev,
              injuryType,
              status,
              gameDate,
              matchup,
              source: 'NBA Official Injury Report',
              scrapedAt: new Date().toISOString(),
            });
          }
        }
      } catch (e) {
        // Ignorer les erreurs individuelles
      }
    }
    
    // Méthode alternative: parsing par texte
    if (injuries.length === 0) {
      // Chercher les patterns de joueurs NBA avec statut
      const playerPattern = /([A-Z][a-z]+ [A-Z][a-z]+)\s*[-–]?\s*(Out|Doubtful|Questionable|Probable)/gi;
      let match;
      
      while ((match = playerPattern.exec(html)) !== null) {
        injuries.push({
          playerName: match[1],
          team: 'Unknown',
          teamAbbreviation: 'UNK',
          injuryType: 'Not specified',
          status: match[2] as 'Out' | 'Doubtful' | 'Questionable' | 'Probable',
          gameDate: new Date().toISOString().split('T')[0],
          matchup: '',
          source: 'NBA Official Injury Report',
          scrapedAt: new Date().toISOString(),
        });
      }
      
      // Pattern avec abréviation d'équipe
      const teamPattern = /(ATL|BOS|BKN|CHA|CHI|CLE|DET|IND|MIA|MIL|NYK|ORL|PHI|TOR|WAS|DAL|DEN|GSW|HOU|LAC|LAL|MEM|MIN|NOP|OKC|PHX|POR|SAC|SAS|UTA)\s*[-–]?\s*([A-Z][a-z]+ [A-Z][a-z]+)/g;
      let teamMatch;
      
      while ((teamMatch = teamPattern.exec(html)) !== null) {
        const abbrev = teamMatch[1];
        const playerName = teamMatch[2];
        
        // Chercher si on a déjà ce joueur et mettre à jour son équipe
        const existing = injuries.find(i => i.playerName === playerName);
        if (existing) {
          existing.teamAbbreviation = abbrev;
          existing.team = ABBREV_TO_NAME[abbrev] || abbrev;
        }
      }
    }
    
  } catch (error) {
    console.error('Erreur parsing HTML NBA Injury Report:', error);
  }
  
  // Dédupliquer
  const seen = new Set<string>();
  return injuries.filter(inj => {
    const key = `${inj.playerName}_${inj.teamAbbreviation}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Scrape le rapport de blessures NBA officiel
 */
export async function scrapeNBAInjuries(): Promise<NBAPlayerInjury[]> {
  // Vérifier le cache
  const now = Date.now();
  const cachedInjuries = Array.from(nbaInjuryCache.values()).flatMap(t => t.players);
  
  if (cachedInjuries.length > 0 && (now - lastNBAScrapeTime) < NBA_CACHE_TTL) {
    console.log('📦 Utilisation du cache NBA Injuries');
    return cachedInjuries;
  }
  
  console.log('🏀 Scraping des blessures NBA officielles...');
  
  try {
    const zai = await ZAI.create();
    
    const result = await zai.functions.invoke('page_reader', {
      url: NBA_INJURY_REPORT_URL
    });
    
    if (result.code !== 200 || !result.data?.html) {
      console.log('⚠️ Erreur accès NBA Injury Report, tentative alternative...');
      
      // Essayer une recherche web comme fallback
      const searchResult = await zai.functions.invoke('web_search', {
        query: 'NBA injury report today official',
        num: 5
      });
      
      if (Array.isArray(searchResult) && searchResult.length > 0) {
        // Essayer de scraper une autre source
        for (const item of searchResult as any[]) {
          if (item.url && item.url.includes('nba.com')) {
            const altResult = await zai.functions.invoke('page_reader', {
              url: item.url
            });
            
            if (altResult.code === 200 && altResult.data?.html) {
              const injuries = parseNBAInjuryReport(altResult.data.html);
              if (injuries.length > 0) {
                console.log(`✅ NBA Injuries (alternative): ${injuries.length} joueurs`);
                return injuries;
              }
            }
          }
        }
      }
      
      return [];
    }
    
    const injuries = parseNBAInjuryReport(result.data.html);
    
    // Mettre à jour le cache par équipe
    nbaInjuryCache.clear();
    const teamMap = new Map<string, NBAPlayerInjury[]>();
    
    for (const injury of injuries) {
      const key = injury.teamAbbreviation;
      if (!teamMap.has(key)) {
        teamMap.set(key, []);
      }
      teamMap.get(key)!.push(injury);
    }
    
    for (const [abbrev, players] of teamMap.entries()) {
      nbaInjuryCache.set(abbrev, {
        team: ABBREV_TO_NAME[abbrev] || abbrev,
        abbreviation: abbrev,
        players,
        lastUpdated: new Date().toISOString(),
      });
    }
    lastNBAScrapeTime = now;
    
    console.log(`✅ NBA Injuries: ${injuries.length} joueurs blessés`);
    return injuries;
    
  } catch (error) {
    console.error('Erreur scraping NBA injuries:', error);
    return [];
  }
}

/**
 * Récupère les blessures pour une équipe NBA spécifique
 */
export async function getNBATeamInjuries(teamName: string): Promise<NBAPlayerInjury[]> {
  const teamInfo = normalizeNBATeamName(teamName);
  
  // Vérifier le cache d'abord
  const cached = nbaInjuryCache.get(teamInfo.abbrev);
  if (cached && (Date.now() - lastNBAScrapeTime) < NBA_CACHE_TTL) {
    return cached.players;
  }
  
  // Scrape si pas en cache
  const allInjuries = await scrapeNBAInjuries();
  
  // Filtrer pour l'équipe
  return allInjuries.filter(inj => {
    const abbrevLower = inj.teamAbbreviation.toLowerCase();
    const searchLower = teamInfo.abbrev.toLowerCase();
    return abbrevLower === searchLower;
  });
}

/**
 * Récupère les blessures pour un match NBA (les deux équipes)
 */
export async function getNBAMatchInjuries(
  homeTeam: string,
  awayTeam: string
): Promise<{ home: NBAPlayerInjury[]; away: NBAPlayerInjury[] }> {
  console.log(`🏥 Récupération blessures NBA: ${homeTeam} vs ${awayTeam}`);
  
  // S'assurer qu'on a les données
  if (nbaInjuryCache.size === 0 || (Date.now() - lastNBAScrapeTime) > NBA_CACHE_TTL) {
    await scrapeNBAInjuries();
  }
  
  const homeInjuries = await getNBATeamInjuries(homeTeam);
  const awayInjuries = await getNBATeamInjuries(awayTeam);
  
  return {
    home: homeInjuries,
    away: awayInjuries,
  };
}

/**
 * Évalue l'impact des blessures NBA sur un match
 */
export function evaluateNBAInjuryImpact(
  homeInjuries: NBAPlayerInjury[],
  awayInjuries: NBAPlayerInjury[]
): {
  homeImpact: number; // -10 à 0 (0 = pas d'impact, -10 = impact majeur)
  awayImpact: number;
  keyAbsentees: { home: string[]; away: string[] };
  summary: string;
} {
  // Pondération par statut (les "Out" comptent plus)
  const statusWeight: Record<string, number> = {
    'Out': 1.0,
    'Doubtful': 0.6,
    'Questionable': 0.3,
    'Probable': 0.1,
  };
  
  // Calculer l'impact
  let homeImpactScore = 0;
  let awayImpactScore = 0;
  
  const keyAbsenteesHome: string[] = [];
  const keyAbsenteesAway: string[] = [];
  
  for (const inj of homeInjuries) {
    const weight = statusWeight[inj.status] || 0.5;
    homeImpactScore += weight;
    
    if (inj.status === 'Out' || inj.status === 'Doubtful') {
      keyAbsenteesHome.push(`${inj.playerName} (${inj.status}${inj.injuryType !== 'Not specified' ? ` - ${inj.injuryType}` : ''})`);
    }
  }
  
  for (const inj of awayInjuries) {
    const weight = statusWeight[inj.status] || 0.5;
    awayImpactScore += weight;
    
    if (inj.status === 'Out' || inj.status === 'Doubtful') {
      keyAbsenteesAway.push(`${inj.playerName} (${inj.status}${inj.injuryType !== 'Not specified' ? ` - ${inj.injuryType}` : ''})`);
    }
  }
  
  // Normaliser sur une échelle de 0 à -10
  const homeImpact = Math.max(-10, -homeImpactScore * 2);
  const awayImpact = Math.max(-10, -awayImpactScore * 2);
  
  // Générer un résumé
  let summary = '';
  if (homeInjuries.length > awayInjuries.length) {
    summary = `${homeInjuries.length} joueur(s) impacté(s) côté ${homeInjuries[0]?.team || 'domicile'} dont ${keyAbsenteesHome.length} absent(s)`;
  } else if (awayInjuries.length > homeInjuries.length) {
    summary = `${awayInjuries.length} joueur(s) impacté(s) côté ${awayInjuries[0]?.team || 'extérieur'} dont ${keyAbsenteesAway.length} absent(s)`;
  } else if (homeInjuries.length > 0) {
    summary = `${homeInjuries.length} joueur(s) impacté(s) de chaque côté`;
  } else {
    summary = 'Aucune blessure signalée';
  }
  
  return {
    homeImpact: Math.round(homeImpact * 10) / 10,
    awayImpact: Math.round(awayImpact * 10) / 10,
    keyAbsentees: { home: keyAbsenteesHome, away: keyAbsenteesAway },
    summary,
  };
}

/**
 * Vide le cache NBA
 */
export function clearNBAInjuryCache(): void {
  nbaInjuryCache.clear();
  lastNBAScrapeTime = 0;
  console.log('🗑️ Cache NBA Injuries vidé');
}

// Export par défaut
const NBAInjuryScraper = {
  scrapeNBAInjuries,
  getNBATeamInjuries,
  getNBAMatchInjuries,
  evaluateNBAInjuryImpact,
  clearCache: clearNBAInjuryCache,
};

export default NBAInjuryScraper;
