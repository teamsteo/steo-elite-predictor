/**
 * Transfermarkt Scraper - Récupération des blessures Football
 * Source: Transfermarkt (scraping via ZAI web-reader)
 * GRATUIT - Données de blessures et absences en temps réel
 */

import ZAI from 'z-ai-web-dev-sdk';

export interface PlayerInjury {
  playerName: string;
  team: string;
  injuryType: string;
  expectedReturn: string;
  status: 'out' | 'doubtful' | 'questionable';
  injuredAt: string;
  source: string;
  scrapedAt: string;
}

export interface TeamInjuries {
  team: string;
  players: PlayerInjury[];
  lastUpdated: string;
}

// Cache pour éviter les requêtes multiples
const injuryCache = new Map<string, TeamInjuries>();
let lastScrapeTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 heure

// URLs Transfermarkt pour les blessures
const TRANSFERMARKT_URLS = {
  injuries_base: 'https://www.transfermarkt.com/verletzungen/',
  premier_league: 'https://www.transfermarkt.com/premier-league/verletzungen/wettbewerb/GB1',
  ligue1: 'https://www.transfermarkt.com/ligue-1/verletzungen/wettbewerb/FR1',
  laliga: 'https://www.transfermarkt.com/laliga/verletzungen/wettbewerb/ES1',
  bundesliga: 'https://www.transfermarkt.com/bundesliga/verletzungen/wettbewerb/L1',
  seriea: 'https://www.transfermarkt.com/serie-a/verletzungen/wettbewerb/IT1',
  champions_league: 'https://www.transfermarkt.com/champions-league/verletzungen/wettbewerb/CL',
};

// Mapping des équipes françaises/anglaises vers Transfermarkt
const TEAM_NAME_MAPPING: Record<string, string> = {
  // Premier League
  'manchester city': 'Manchester City',
  'manchester united': 'Manchester United',
  'liverpool': 'Liverpool FC',
  'chelsea': 'Chelsea FC',
  'arsenal': 'Arsenal FC',
  'tottenham': 'Tottenham Hotspur',
  'newcastle': 'Newcastle United',
  'brighton': 'Brighton & Hove Albion',
  'aston villa': 'Aston Villa',
  'west ham': 'West Ham United',
  'crystal palace': 'Crystal Palace',
  'wolves': 'Wolverhampton Wanderers',
  'fulham': 'Fulham FC',
  'brentford': 'Brentford FC',
  'everton': 'Everton FC',
  'nottingham': 'Nottingham Forest',
  'bournemouth': 'AFC Bournemouth',
  
  // Ligue 1
  'psg': 'Paris Saint-Germain',
  'paris saint-germain': 'Paris Saint-Germain',
  'marseille': 'Olympique Marseille',
  'monaco': 'AS Monaco',
  'lyon': 'Olympique Lyon',
  'lille': 'LOSC Lille',
  'nice': 'OGC Nice',
  'lens': 'Racing Club de Lens',
  'rennes': 'Stade Rennais',
  'montpellier': 'Montpellier HSC',
  'strasbourg': 'RC Strasbourg',
  'nantes': 'FC Nantes',
  'toulouse': 'Toulouse FC',
  'saint-etienne': 'AS Saint-Etienne',
  
  // La Liga
  'real madrid': 'Real Madrid',
  'barcelona': 'FC Barcelona',
  'atletico madrid': 'Atletico Madrid',
  'sevilla': 'Sevilla FC',
  'real sociedad': 'Real Sociedad',
  'villarreal': 'Villarreal CF',
  'real betis': 'Real Betis',
  'athletic bilbao': 'Athletic Club',
  'valencia': 'Valencia CF',
  'girona': 'Girona FC',
  
  // Bundesliga
  'bayern munich': 'FC Bayern Munich',
  'bayern': 'FC Bayern Munich',
  'dortmund': 'Borussia Dortmund',
  'rb leipzig': 'RB Leipzig',
  'leverkusen': 'Bayer 04 Leverkusen',
  'frankfurt': 'Eintracht Frankfurt',
  'wolfsburg': 'VfL Wolfsburg',
  'freiburg': 'SC Freiburg',
  'hamburg': 'Hamburger SV',
  
  // Serie A
  'juventus': 'Juventus FC',
  'inter milan': 'Inter Milan',
  'inter': 'Inter Milan',
  'ac milan': 'AC Milan',
  'milan': 'AC Milan',
  'napoli': 'SSC Napoli',
  'roma': 'AS Roma',
  'lazio': 'SS Lazio',
  'atalanta': 'Atalanta BC',
  'fiorentina': 'ACF Fiorentina',
  'torino': 'Torino FC',
  'bologna': 'Bologna FC',
};

/**
 * Normalise un nom d'équipe pour la recherche
 */
function normalizeTeamName(name: string): string {
  const lower = name.toLowerCase().trim();
  return TEAM_NAME_MAPPING[lower] || name;
}

/**
 * Extrait les informations de blessures depuis le HTML de Transfermarkt
 */
function parseInjuriesFromHTML(html: string): PlayerInjury[] {
  const injuries: PlayerInjury[] = [];
  
  try {
    // Pattern pour les tableaux de blessures Transfermarkt
    // Format typique: <tr> avec joueur, type de blessure, durée
    
    // Extraire les lignes de tableau
    const rowPattern = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
    const rows = html.match(rowPattern) || [];
    
    for (const row of rows) {
      try {
        // Chercher le nom du joueur
        const playerNameMatch = row.match(/title="([^"]+)"[^>]*class="[^"]*player[^"]*"/i) ||
                                row.match(/<a[^>]*class="[^"]*player[^"]*"[^>]*>([^<]+)<\/a>/i) ||
                                row.match(/href="\/[^"]+\/profil\/spieler\/[^"]+">([^<]+)<\/a>/i);
        
        // Chercher le type de blessure
        const injuryMatch = row.match(/verletzung[^>]*>([^<]+)</i) ||
                           row.match(/injury[^>]*>([^<]+)</i) ||
                           row.match(/class="[^"]*injury[^"]*"[^>]*>([^<]+)</i);
        
        // Chercher la durée/retour
        const returnMatch = row.match(/return[^>]*>([^<]+)</i) ||
                           row.match(/duration[^>]*>([^<]+)</i) ||
                           row.match(/class="[^"]*(?:return|duration)[^"]*"[^>]*>([^<]+)</i);
        
        // Chercher l'équipe
        const teamMatch = row.match(/class="[^"]*team[^"]*"[^>]*>([^<]+)</i) ||
                         row.match(/href="\/[^"]+\/startseite\/verein\/[^"]+"[^>]*>([^<]+)<\/a>/i);
        
        if (playerNameMatch) {
          const playerName = playerNameMatch[1].trim();
          const injuryType = injuryMatch ? injuryMatch[1].trim() : 'Unknown';
          const expectedReturn = returnMatch ? returnMatch[1].trim() : 'Unknown';
          const team = teamMatch ? teamMatch[1].trim() : 'Unknown';
          
          // Déterminer le statut
          let status: 'out' | 'doubtful' | 'questionable' = 'out';
          const returnLower = expectedReturn.toLowerCase();
          
          if (returnLower.includes('doubt') || returnLower.includes('doute')) {
            status = 'doubtful';
          } else if (returnLower.includes('question') || returnLower.includes('jour') || returnLower.includes('day')) {
            status = 'questionable';
          }
          
          injuries.push({
            playerName,
            team,
            injuryType,
            expectedReturn,
            status,
            injuredAt: '',
            source: 'Transfermarkt',
            scrapedAt: new Date().toISOString(),
          });
        }
      } catch (e) {
        // Ignorer les erreurs de parsing individuelles
      }
    }
    
    // Méthode alternative: parsing via texte brut
    if (injuries.length === 0) {
      // Chercher les patterns de texte avec blessures
      const injuryPatterns = [
        /([A-Z][a-z]+ [A-Z][a-z]+)\s*[-–]\s*(muscle|knee|ankle|hamstring|thigh|groin|back|shoulder|foot|leg|calf|hip|head|concussion|fracture|ligament|tendon|muscular|injury|injured)/gi,
        /([A-Z][a-z]+ [A-Z][a-z]+)\s*\((injured|out|doubtful)\)/gi,
      ];
      
      for (const pattern of injuryPatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          injuries.push({
            playerName: match[1],
            team: 'Unknown',
            injuryType: match[2] || 'Unknown',
            expectedReturn: 'Unknown',
            status: match[2]?.toLowerCase().includes('doubt') ? 'doubtful' : 'out',
            injuredAt: '',
            source: 'Transfermarkt',
            scrapedAt: new Date().toISOString(),
          });
        }
      }
    }
    
  } catch (error) {
    console.error('Erreur parsing HTML Transfermarkt:', error);
  }
  
  // Dédupliquer
  const seen = new Set<string>();
  return injuries.filter(inj => {
    const key = `${inj.playerName}_${inj.injuryType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Scrape les blessures d'une ligue spécifique
 */
async function scrapeLeagueInjuries(url: string, leagueName: string): Promise<PlayerInjury[]> {
  try {
    const zai = await ZAI.create();
    
    const result = await zai.functions.invoke('page_reader', {
      url: url
    });
    
    if (result.code !== 200 || !result.data?.html) {
      console.log(`⚠️ Erreur accès Transfermarkt ${leagueName}`);
      return [];
    }
    
    const injuries = parseInjuriesFromHTML(result.data.html);
    console.log(`  📌 ${leagueName}: ${injuries.length} blessures trouvées`);
    
    return injuries;
    
  } catch (error) {
    console.error(`Erreur scraping ${leagueName}:`, error);
    return [];
  }
}

/**
 * Récupère toutes les blessures football actuelles
 */
export async function scrapeAllFootballInjuries(): Promise<PlayerInjury[]> {
  // Vérifier le cache
  const now = Date.now();
  const cachedInjuries = Array.from(injuryCache.values()).flatMap(t => t.players);
  
  if (cachedInjuries.length > 0 && (now - lastScrapeTime) < CACHE_TTL) {
    console.log('📦 Utilisation du cache Transfermarkt');
    return cachedInjuries;
  }
  
  console.log('🔄 Scraping des blessures football depuis Transfermarkt...');
  
  const allInjuries: PlayerInjury[] = [];
  
  // Scrape les principales ligues
  const leagues = [
    { url: TRANSFERMARKT_URLS.premier_league, name: 'Premier League' },
    { url: TRANSFERMARKT_URLS.ligue1, name: 'Ligue 1' },
    { url: TRANSFERMARKT_URLS.laliga, name: 'La Liga' },
    { url: TRANSFERMARKT_URLS.bundesliga, name: 'Bundesliga' },
    { url: TRANSFERMARKT_URLS.seriea, name: 'Serie A' },
  ];
  
  for (const league of leagues) {
    const injuries = await scrapeLeagueInjuries(league.url, league.name);
    allInjuries.push(...injuries);
    
    // Délai entre les requêtes
    await new Promise(resolve => setTimeout(resolve, 800));
  }
  
  // Mettre à jour le cache
  injuryCache.clear();
  const teamMap = new Map<string, PlayerInjury[]>();
  
  for (const injury of allInjuries) {
    if (!teamMap.has(injury.team)) {
      teamMap.set(injury.team, []);
    }
    teamMap.get(injury.team)!.push(injury);
  }
  
  for (const [team, players] of teamMap.entries()) {
    injuryCache.set(team, {
      team,
      players,
      lastUpdated: new Date().toISOString(),
    });
  }
  lastScrapeTime = now;
  
  console.log(`✅ Total: ${allInjuries.length} blessures football`);
  return allInjuries;
}

/**
 * Récupère les blessures pour une équipe spécifique
 */
export async function getTeamInjuries(teamName: string): Promise<PlayerInjury[]> {
  const normalizedName = normalizeTeamName(teamName);
  
  // Vérifier le cache d'abord
  const cached = injuryCache.get(normalizedName);
  if (cached && (Date.now() - lastScrapeTime) < CACHE_TTL) {
    return cached.players;
  }
  
  // Scrape si pas en cache
  const allInjuries = await scrapeAllFootballInjuries();
  
  // Filtrer pour l'équipe
  return allInjuries.filter(inj => {
    const teamLower = inj.team.toLowerCase();
    const searchLower = normalizedName.toLowerCase();
    return teamLower.includes(searchLower) || searchLower.includes(teamLower);
  });
}

/**
 * Récupère les blessures pour un match (les deux équipes)
 */
export async function getMatchInjuries(
  homeTeam: string,
  awayTeam: string
): Promise<{ home: PlayerInjury[]; away: PlayerInjury[] }> {
  console.log(`🏥 Récupération blessures: ${homeTeam} vs ${awayTeam}`);
  
  // S'assurer qu'on a les données
  if (injuryCache.size === 0 || (Date.now() - lastScrapeTime) > CACHE_TTL) {
    await scrapeAllFootballInjuries();
  }
  
  const homeInjuries = await getTeamInjuries(homeTeam);
  const awayInjuries = await getTeamInjuries(awayTeam);
  
  return {
    home: homeInjuries,
    away: awayInjuries,
  };
}

/**
 * Évalue l'impact des blessures sur un match
 */
export function evaluateInjuryImpact(
  homeInjuries: PlayerInjury[],
  awayInjuries: PlayerInjury[]
): {
  homeImpact: number; // -10 à 0 (0 = pas d'impact, -10 = impact majeur)
  awayImpact: number;
  summary: string;
} {
  // Pondération par statut
  const statusWeight: Record<string, number> = {
    'out': 1.0,
    'doubtful': 0.6,
    'questionable': 0.3,
  };
  
  // Calculer l'impact
  let homeImpactScore = 0;
  let awayImpactScore = 0;
  
  for (const inj of homeInjuries) {
    homeImpactScore += statusWeight[inj.status] || 0.5;
  }
  
  for (const inj of awayInjuries) {
    awayImpactScore += statusWeight[inj.status] || 0.5;
  }
  
  // Normaliser sur une échelle de 0 à -10
  const homeImpact = Math.max(-10, -homeImpactScore * 1.5);
  const awayImpact = Math.max(-10, -awayImpactScore * 1.5);
  
  // Générer un résumé
  let summary = '';
  if (homeInjuries.length > awayInjuries.length) {
    summary = `${homeInjuries.length} blessure(s) côté ${homeInjuries[0]?.team || 'domicile'} vs ${awayInjuries.length} côté extérieur`;
  } else if (awayInjuries.length > homeInjuries.length) {
    summary = `${awayInjuries.length} blessure(s) côté ${awayInjuries[0]?.team || 'extérieur'} vs ${homeInjuries.length} côté domicile`;
  } else if (homeInjuries.length > 0) {
    summary = `${homeInjuries.length} blessure(s) de chaque côté`;
  } else {
    summary = 'Aucune blessure signalée';
  }
  
  return {
    homeImpact: Math.round(homeImpact * 10) / 10,
    awayImpact: Math.round(awayImpact * 10) / 10,
    summary,
  };
}

/**
 * Vide le cache
 */
export function clearTransfermarktCache(): void {
  injuryCache.clear();
  lastScrapeTime = 0;
  console.log('🗑️ Cache Transfermarkt vidé');
}

// Export par défaut
const TransfermarktScraper = {
  scrapeAllFootballInjuries,
  getTeamInjuries,
  getMatchInjuries,
  evaluateInjuryImpact,
  clearCache: clearTransfermarktCache,
};

export default TransfermarktScraper;
