/**
 * Fundamental Analysis Service
 * 
 * Récupère les données fondamentales des équipes:
 * - Forme récente (derniers matchs)
 * - Classement et points
 * - Blessures / Absences
 * - Stats équipe (buts/pts marqués/encaissés)
 * - Actualités club (coach, transferts, problèmes)
 * - Signaux de gestion (faillite, rachat, crise)
 * 
 * Sources: ESPN, TheSportsDB, Football-Data, Wikipedia
 */

// Cache pour éviter les appels répétés
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ============================================
// INTERFACES
// ============================================

export interface FundamentalData {
  team: string;
  sport: 'football' | 'basketball' | 'hockey' | 'baseball';
  league: string;
  
  // Forme
  form: {
    last5: ('W' | 'D' | 'L')[];
    winRate: number;
    goalsScored: number;
    goalsConceded: number;
    avgGoalsScored: number;
    avgGoalsConceded: number;
  };
  
  // Classement
  standing: {
    position: number;
    points: number;
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goalDifference: number;
  };
  
  // Blessures
  injuries: {
    count: number;
    keyPlayers: string[];
  };
  
  // Gestion
  management: {
    coach: string | null;
    coachSince: string | null;
    coachStatus: 'stable' | 'under_pressure' | 'recent_change' | 'unknown';
    owner: string | null;
    financialStatus: 'healthy' | 'debt_reported' | 'takeover_rumors' | 'unknown';
    recentNews: NewsItem[];
  };
  
  // Stats avancées
  advancedStats: {
    homeWinRate: number;
    awayWinRate: number;
    overRate: number; // % matchs over
    bttsRate: number; // % both teams score
  };
  
  // Signaux
  signals: Signal[];
  
  lastUpdated: string;
}

export interface NewsItem {
  date: string;
  title: string;
  type: 'transfer' | 'injury' | 'coach' | 'financial' | 'other';
  impact: 'positive' | 'negative' | 'neutral';
}

export interface Signal {
  type: 'coach_pressure' | 'financial_issues' | 'key_injury' | 'good_form' | 'bad_form' | 'home_advantage' | 'away_weak';
  description: string;
  impact: 'positive' | 'negative';
  strength: number; // 1-10
}

// ============================================
// ESPN API - Stats équipe
// ============================================

async function fetchEspnTeam(sport: string, league: string, teamId: string): Promise<any> {
  const cacheKey = `espn_${sport}_${league}_${teamId}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/teams/${teamId}`;
    const response = await fetch(url);
    const data = await response.json();
    
    cache.set(cacheKey, { data: data.team, timestamp: Date.now() });
    return data.team;
  } catch (error) {
    console.error('ESPN fetch error:', error);
    return null;
  }
}

async function fetchEspnStandings(sport: string, league: string): Promise<any[]> {
  const cacheKey = `espn_standings_${sport}_${league}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/standings`;
    const response = await fetch(url);
    const data = await response.json();
    
    const standings = data.standings?.entries || [];
    cache.set(cacheKey, { data: standings, timestamp: Date.now() });
    return standings;
  } catch (error) {
    console.error('ESPN standings error:', error);
    return [];
  }
}

// ============================================
// TheSportsDB - Infos club (gratuit)
// ============================================

async function fetchTheSportsDB(teamName: string): Promise<any> {
  const cacheKey = `tsdb_${teamName}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const url = `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(teamName)}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.teams && data.teams[0]) {
      cache.set(cacheKey, { data: data.teams[0], timestamp: Date.now() });
      return data.teams[0];
    }
    return null;
  } catch (error) {
    console.error('TheSportsDB error:', error);
    return null;
  }
}

// ============================================
// Wikipedia API - Actualités et contexte
// ============================================

async function fetchWikipediaInfo(teamName: string): Promise<{ extract: string; issues: string[] }> {
  const cacheKey = `wiki_${teamName}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    // Encoder le nom pour Wikipedia
    const wikiTitle = teamName.replace(/ /g, '_') + '_F.C.';
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`;
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      // Essayer sans F.C.
      const url2 = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(teamName.replace(/ /g, '_'))}`;
      const response2 = await fetch(url2, { headers: { 'Accept': 'application/json' } });
      if (!response2.ok) return { extract: '', issues: [] };
      const data2 = await response2.json();
      return processWikiData(data2, teamName);
    }
    
    const data = await response.json();
    return processWikiData(data, teamName);
  } catch (error) {
    return { extract: '', issues: [] };
  }
}

function processWikiData(data: any, teamName: string): { extract: string; issues: string[] } {
  const extract = data.extract || '';
  const issues: string[] = [];
  
  const text = extract.toLowerCase();
  
  // Détecter les signaux négatifs
  if (text.includes('debt') || text.includes('faillite') || text.includes('bankrupt')) {
    issues.push('Dette/faillite mentionnée');
  }
  if (text.includes('takeover') || text.includes('rachat') || text.includes('acquisition')) {
    issues.push('Rachat en cours/discuté');
  }
  if (text.includes('crisis') || text.includes('crise')) {
    issues.push('Crise mentionnée');
  }
  if (text.includes('relegation') || text.includes('relégation')) {
    issues.push('Risque de relégation');
  }
  
  // Signaux positifs
  if (text.includes('champion') || text.includes('title')) {
    issues.push('Champion récent');
  }
  
  return { extract, issues };
}

// ============================================
// News API (via ESPN et autres)
// ============================================

async function fetchTeamNews(teamName: string, sport: string): Promise<NewsItem[]> {
  const news: NewsItem[] = [];
  
  try {
    // ESPN News
    const sportPath = sport === 'football' ? 'soccer' : sport;
    const league = sport === 'football' ? 'eng.1' : sport === 'basketball' ? 'nba' : sport === 'hockey' ? 'nhl' : 'mlb';
    
    const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/${league}/news`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.articles || data.items) {
      const articles = data.articles || data.items || [];
      
      for (const article of articles.slice(0, 10)) {
        const title = article.headline || article.title || '';
        const newsItem = classifyNews(title, article.published || article.lastModified || new Date().toISOString());
        
        // Filtrer les news pertinentes pour l'équipe
        if (title.toLowerCase().includes(teamName.toLowerCase().split(' ')[0])) {
          news.push(newsItem);
        }
      }
    }
  } catch (error) {
    console.error('News fetch error:', error);
  }
  
  return news;
}

function classifyNews(title: string, date: string): NewsItem {
  const titleLower = title.toLowerCase();
  
  let type: NewsItem['type'] = 'other';
  let impact: NewsItem['impact'] = 'neutral';
  
  // Classification
  if (titleLower.includes('coach') || titleLower.includes('manager') || titleLower.includes('entraîneur')) {
    type = 'coach';
    if (titleLower.includes('fire') || titleLower.includes('sack') || titleLower.includes('quit')) {
      impact = 'negative';
    } else if (titleLower.includes('sign') || titleLower.includes('extend')) {
      impact = 'positive';
    }
  } else if (titleLower.includes('injury') || titleLower.includes('blessure') || titleLower.includes('out')) {
    type = 'injury';
    impact = 'negative';
  } else if (titleLower.includes('transfer') || titleLower.includes('sign') || titleLower.includes('deal')) {
    type = 'transfer';
    impact = titleLower.includes('star') || titleLower.includes('key') ? 'positive' : 'neutral';
  } else if (titleLower.includes('debt') || titleLower.includes('bankrupt') || titleLower.includes('financial')) {
    type = 'financial';
    impact = 'negative';
  }
  
  return { date, title, type, impact };
}

// ============================================
// Fonction principale
// ============================================

export async function getFundamentalData(
  teamName: string,
  sport: 'football' | 'basketball' | 'hockey' | 'baseball',
  league: string = ''
): Promise<FundamentalData | null> {
  
  const cacheKey = `fund_${teamName}_${sport}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    // 1. Récupérer les données ESPN
    const espnData = await fetchEspnTeam(
      sport === 'football' ? 'soccer' : sport,
      league || getDefaultLeague(sport),
      teamName
    );
    
    // 2. Récupérer les données TheSportsDB
    const tsdbData = await fetchTheSportsDB(teamName);
    
    // 3. Récupérer les infos Wikipedia
    const wikiInfo = await fetchWikipediaInfo(teamName);
    
    // 4. Récupérer les news
    const news = await fetchTeamNews(teamName, sport);
    
    // 5. Construire l'objet FundamentalData
    const data: FundamentalData = {
      team: teamName,
      sport,
      league: league || getDefaultLeague(sport),
      
      form: extractForm(espnData),
      
      standing: extractStanding(espnData),
      
      injuries: extractInjuries(espnData),
      
      management: {
        coach: tsdbData?.strManager || espnData?.coaches?.[0]?.fullName || null,
        coachSince: null,
        coachStatus: determineCoachStatus(news),
        owner: tsdbData?.strOwner || null,
        financialStatus: determineFinancialStatus(wikiInfo.issues),
        recentNews: news.slice(0, 5)
      },
      
      advancedStats: extractAdvancedStats(espnData),
      
      signals: generateSignals(espnData, wikiInfo.issues, news),
      
      lastUpdated: new Date().toISOString()
    };
    
    cache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
    
  } catch (error) {
    console.error('Fundamental analysis error:', error);
    return null;
  }
}

// ============================================
// Helpers
// ============================================

function getDefaultLeague(sport: string): string {
  const defaults: Record<string, string> = {
    football: 'eng.1',
    basketball: 'nba',
    hockey: 'nhl',
    baseball: 'mlb'
  };
  return defaults[sport] || '';
}

function extractForm(espnData: any): FundamentalData['form'] {
  if (!espnData) {
    return { last5: [], winRate: 0, goalsScored: 0, goalsConceded: 0, avgGoalsScored: 0, avgGoalsConceded: 0 };
  }
  
  const last5: ('W' | 'D' | 'L')[] = [];
  const form = espnData.form || espnData.record?.items?.[0]?.form || '';
  
  for (const c of form.slice(0, 5)) {
    if (c === 'W' || c === 'w') last5.push('W');
    else if (c === 'D' || c === 'd' || c === 'T') last5.push('D');
    else if (c === 'L' || c === 'l') last5.push('L');
  }
  
  const wins = last5.filter(r => r === 'W').length;
  
  return {
    last5,
    winRate: last5.length > 0 ? Math.round((wins / last5.length) * 100) : 0,
    goalsScored: espnData.pointsFor || 0,
    goalsConceded: espnData.pointsAgainst || 0,
    avgGoalsScored: espnData.avgPointsFor || 0,
    avgGoalsConceded: espnData.avgPointsAgainst || 0
  };
}

function extractStanding(espnData: any): FundamentalData['standing'] {
  if (!espnData?.record?.items?.[0]) {
    return { position: 0, points: 0, played: 0, wins: 0, draws: 0, losses: 0, goalDifference: 0 };
  }
  
  const record = espnData.record.items[0];
  const summary = record.summary || '';
  
  // Parse "10-5-3" format
  const parts = summary.split('-').map(Number);
  
  return {
    position: espnData.standingSummary ? parseInt(espnData.standingSummary) : 0,
    points: record.points || 0,
    played: parts.reduce((a, b) => a + b, 0),
    wins: parts[0] || 0,
    draws: parts[1] || 0,
    losses: parts[2] || 0,
    goalDifference: record.differential || 0
  };
}

function extractInjuries(espnData: any): FundamentalData['injuries'] {
  const injuries = espnData?.injuries || [];
  return {
    count: injuries.length,
    keyPlayers: injuries.slice(0, 3).map((i: any) => i.athlete?.displayName || i.name || 'Unknown')
  };
}

function extractAdvancedStats(espnData: any): FundamentalData['advancedStats'] {
  return {
    homeWinRate: espnData?.homeRecord ? calculateWinRate(espnData.homeRecord) : 50,
    awayWinRate: espnData?.awayRecord ? calculateWinRate(espnData.awayRecord) : 50,
    overRate: espnData?.overRate || 50,
    bttsRate: espnData?.bttsRate || 50
  };
}

function calculateWinRate(record: string): number {
  const parts = record.split('-').map(Number);
  const total = parts.reduce((a, b) => a + b, 0);
  return total > 0 ? Math.round((parts[0] / total) * 100) : 50;
}

function determineCoachStatus(news: NewsItem[]): FundamentalData['management']['coachStatus'] {
  const coachNews = news.filter(n => n.type === 'coach');
  
  if (coachNews.length === 0) return 'unknown';
  
  const negativeNews = coachNews.filter(n => n.impact === 'negative');
  if (negativeNews.length > 0) return 'under_pressure';
  
  return 'stable';
}

function determineFinancialStatus(issues: string[]): FundamentalData['management']['financialStatus'] {
  if (issues.some(i => i.includes('Dette') || i.includes('faillite'))) {
    return 'debt_reported';
  }
  if (issues.some(i => i.includes('Rachat'))) {
    return 'takeover_rumors';
  }
  return 'healthy';
}

function generateSignals(espnData: any, wikiIssues: string[], news: NewsItem[]): Signal[] {
  const signals: Signal[] = [];
  
  // Forme
  const form = extractForm(espnData);
  if (form.winRate >= 70) {
    signals.push({ type: 'good_form', description: `Excellente forme: ${form.winRate}% victoires`, impact: 'positive', strength: 7 });
  } else if (form.winRate <= 30) {
    signals.push({ type: 'bad_form', description: `Mauvaise forme: ${form.winRate}% victoires`, impact: 'negative', strength: 7 });
  }
  
  // Blessures clés
  const injuries = extractInjuries(espnData);
  if (injuries.count >= 3) {
    signals.push({ type: 'key_injury', description: `${injuries.count} blessés dont joueurs clés`, impact: 'negative', strength: 6 });
  }
  
  // Problèmes financiers
  if (wikiIssues.some(i => i.includes('Dette') || i.includes('faillite'))) {
    signals.push({ type: 'financial_issues', description: 'Problèmes financiers rapportés', impact: 'negative', strength: 5 });
  }
  
  // Pression sur le coach
  const coachNews = news.filter(n => n.type === 'coach' && n.impact === 'negative');
  if (coachNews.length > 0) {
    signals.push({ type: 'coach_pressure', description: 'Coach sous pression', impact: 'negative', strength: 4 });
  }
  
  // Avantage domicile
  const stats = extractAdvancedStats(espnData);
  if (stats.homeWinRate >= 60) {
    signals.push({ type: 'home_advantage', description: `Fort à domicile: ${stats.homeWinRate}%`, impact: 'positive', strength: 5 });
  }
  
  return signals;
}

// ============================================
// Export pour prédiction
// ============================================

export function calculateFundamentalBoost(data: FundamentalData, isHome: boolean): number {
  let boost = 0;
  
  // Forme
  if (data.form.winRate >= 70) boost += 5;
  else if (data.form.winRate >= 60) boost += 3;
  else if (data.form.winRate <= 30) boost -= 5;
  else if (data.form.winRate <= 40) boost -= 3;
  
  // Signaux
  for (const signal of data.signals) {
    if (signal.impact === 'positive') boost += signal.strength;
    else boost -= signal.strength;
  }
  
  // Avantage domicile/extérieur
  if (isHome && data.advancedStats.homeWinRate >= 60) boost += 3;
  if (!isHome && data.advancedStats.awayWinRate <= 40) boost -= 3;
  
  // Blessures
  if (data.injuries.count >= 3) boost -= 4;
  
  return Math.max(-15, Math.min(15, boost));
}

export default {
  getFundamentalData,
  calculateFundamentalBoost
};
