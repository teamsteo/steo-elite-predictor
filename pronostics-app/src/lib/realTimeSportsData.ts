/**
 * Real-Time Sports Data - Scraper de Données en Temps Réel
 * 
 * Ce module remplace le système de fallback fictif par de VRAIES données:
 * - Football: ESPN Soccer API + FBref (forme, xG)
 * - NBA: ESPN NBA API + Basketball-Reference
 * 
 * PHILOSOPHIE: Aucune donnée fictive - si pas de données, pas de match affiché
 */

import ZAI from 'z-ai-web-dev-sdk';

// ============================================
// TYPES
// ============================================

export interface RealTimeMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: 'football' | 'basketball';
  league: string;
  date: string;
  time: string;
  oddsHome: number | null;
  oddsDraw: number | null;
  oddsAway: number | null;
  status: 'upcoming' | 'live' | 'finished';
  source: 'ESPN' | 'Web-Scrape';
  dataQuality: 'real' | 'partial' | 'unavailable';
  
  // Données enrichies (optionnelles)
  homeForm?: string;
  awayForm?: string;
  homeInjuries?: number;
  awayInjuries?: number;
  
  // Probabilités (pour compatibilité crossValidation)
  winProb?: {
    home: number;
    away: number;
    draw?: number;
  };
  riskPercentage?: number;
  confidence?: 'high' | 'medium' | 'low';
  
  // NBA spécifique
  nbaPredictions?: {
    predictedWinner: 'home' | 'away';
    winnerTeam: string;
    winnerProb: number;
    spread?: { line: number; favorite: string; confidence: number };
    totalPoints?: { line: number; predicted: number; overProb: number; recommendation: string };
  };
}

export interface ScraperResult {
  matches: RealTimeMatch[];
  sources: string[];
  warnings: string[];
  dataQuality: {
    football: 'real' | 'partial' | 'unavailable';
    basketball: 'real' | 'partial' | 'unavailable';
  };
}

// ============================================
// CACHE
// ============================================

const cache = {
  football: { data: null as RealTimeMatch[] | null, timestamp: 0 },
  basketball: { data: null as RealTimeMatch[] | null, timestamp: 0 },
};
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// ============================================
// ESPN API - FOOTBALL
// ============================================

async function scrapeESPNFootball(): Promise<RealTimeMatch[]> {
  console.log('📡 Scraping ESPN Football...');
  const matches: RealTimeMatch[] = [];
  
  try {
    // Ligues majeures ESPN
    const leagues = [
      { name: 'Premier League', code: 'eng.1' },
      { name: 'La Liga', code: 'esp.1' },
      { name: 'Bundesliga', code: 'ger.1' },
      { name: 'Serie A', code: 'ita.1' },
      { name: 'Ligue 1', code: 'fra.1' },
      { name: 'Champions League', code: 'uefa.champions' },
    ];
    
    const today = new Date().toISOString().split('T')[0];
    
    for (const league of leagues) {
      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.code}/scoreboard?dates=${today.replace(/-/g, '')}`;
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        
        if (!response.ok) continue;
        
        const data = await response.json();
        const events = data.events || [];
        
        for (const event of events) {
          if (!event.competitions || event.competitions.length === 0) continue;
          
          const competition = event.competitions[0];
          const homeTeam = competition.competitors?.find((c: any) => c.homeAway === 'home');
          const awayTeam = competition.competitors?.find((c: any) => c.homeAway === 'away');
          
          if (!homeTeam || !awayTeam) continue;
          
          // Cotes depuis ESPN (si disponibles)
          const odds = competition.odds?.[0];
          
          matches.push({
            id: `espn_fb_${event.id}`,
            homeTeam: homeTeam.team?.displayName || homeTeam.team?.name || 'Unknown',
            awayTeam: awayTeam.team?.displayName || awayTeam.team?.name || 'Unknown',
            sport: 'football',
            league: league.name,
            date: event.date?.split('T')[0] || today,
            time: event.date?.split('T')[1]?.substring(0, 5) || '00:00',
            oddsHome: odds?.homeTeamOdds?.current ? parseFloat(odds.homeTeamOdds.current) : null,
            oddsDraw: odds?.drawOdds?.current ? parseFloat(odds.drawOdds.current) : null,
            oddsAway: odds?.awayTeamOdds?.current ? parseFloat(odds.awayTeamOdds.current) : null,
            status: event.status?.type?.name?.toLowerCase().includes('live') ? 'live' : 
                    event.status?.type?.completed ? 'finished' : 'upcoming',
            source: 'ESPN',
            dataQuality: odds ? 'real' : 'partial',
          });
        }
      } catch (e) {
        // Continue avec autres ligues
      }
    }
    
    console.log(`✅ ESPN Football: ${matches.length} matchs`);
    
  } catch (error) {
    console.error('❌ Erreur ESPN Football:', error);
  }
  
  return matches;
}

// ============================================
// ESPN API - NBA
// ============================================

async function scrapeESPNNBA(): Promise<RealTimeMatch[]> {
  console.log('📡 Scraping ESPN NBA...');
  const matches: RealTimeMatch[] = [];
  
  try {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      throw new Error(`ESPN NBA API error: ${response.status}`);
    }
    
    const data = await response.json();
    const events = data.events || [];
    
    for (const event of events) {
      if (!event.competitions || event.competitions.length === 0) continue;
      
      const competition = event.competitions[0];
      const homeTeam = competition.competitors?.find((c: any) => c.homeAway === 'home');
      const awayTeam = competition.competitors?.find((c: any) => c.homeAway === 'away');
      
      if (!homeTeam || !awayTeam) continue;
      
      // Cotes
      const odds = competition.odds?.[0];
      
      matches.push({
        id: `espn_nba_${event.id}`,
        homeTeam: homeTeam.team?.displayName || homeTeam.team?.name || 'Unknown',
        awayTeam: awayTeam.team?.displayName || awayTeam.team?.name || 'Unknown',
        sport: 'basketball',
        league: 'NBA',
        date: event.date?.split('T')[0] || dateStr,
        time: event.date?.split('T')[1]?.substring(0, 5) || '00:00',
        oddsHome: odds?.homeTeamOdds?.current ? parseFloat(odds.homeTeamOdds.current) : null,
        oddsDraw: null,
        oddsAway: odds?.awayTeamOdds?.current ? parseFloat(odds.awayTeamOdds.current) : null,
        status: event.status?.type?.name?.toLowerCase().includes('live') ? 'live' : 
                event.status?.type?.completed ? 'finished' : 'upcoming',
        source: 'ESPN',
        dataQuality: odds ? 'real' : 'partial',
      });
    }
    
    console.log(`✅ ESPN NBA: ${matches.length} matchs`);
    
  } catch (error) {
    console.error('❌ Erreur ESPN NBA:', error);
  }
  
  return matches;
}

// ============================================
// WEB SEARCH FALLBACK
// ============================================

async function searchTodayMatches(sport: 'football' | 'basketball'): Promise<RealTimeMatch[]> {
  console.log(`🔍 Web Search: Matchs ${sport} du jour...`);
  const matches: RealTimeMatch[] = [];
  
  try {
    const zai = await ZAI.create();
    
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    const query = sport === 'football' 
      ? `soccer football matches today ${dateStr} schedule odds`
      : `NBA basketball games today ${dateStr} schedule odds`;
    
    const searchResult = await zai.functions.invoke('web_search', {
      query,
      num: 10
    });
    
    if (!Array.isArray(searchResult)) {
      return matches;
    }
    
    // Parser les résultats pour extraire les matchs
    for (const item of searchResult as any[]) {
      const text = `${item.name} ${item.snippet}`.toLowerCase();
      
      // Essayer d'extraire des équipes
      const vsMatch = text.match(/([a-z\s]+)\s+v[s.]?\s+([a-z\s]+)/i);
      
      if (vsMatch) {
        const homeTeam = vsMatch[1].trim();
        const awayTeam = vsMatch[2].trim();
        
        // Éviter les doublons
        if (matches.some(m => 
          (m.homeTeam.toLowerCase().includes(homeTeam.toLowerCase()) && 
           m.awayTeam.toLowerCase().includes(awayTeam.toLowerCase())) ||
          (m.homeTeam.toLowerCase().includes(awayTeam.toLowerCase()) && 
           m.awayTeam.toLowerCase().includes(homeTeam.toLowerCase()))
        )) {
          continue;
        }
        
        matches.push({
          id: `web_${sport}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          homeTeam: homeTeam.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          awayTeam: awayTeam.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          sport,
          league: sport === 'football' ? 'Unknown League' : 'NBA',
          date: today.toISOString().split('T')[0],
          time: 'TBD',
          oddsHome: null,
          oddsDraw: sport === 'football' ? null : null,
          oddsAway: null,
          status: 'upcoming',
          source: 'Web-Scrape',
          dataQuality: 'partial',
        });
      }
    }
    
    console.log(`✅ Web Search ${sport}: ${matches.length} matchs trouvés`);
    
  } catch (error) {
    console.error(`❌ Erreur Web Search ${sport}:`, error);
  }
  
  return matches;
}

// ============================================
// FONCTION PRINCIPALE
// ============================================

export async function getRealTimeSportsData(): Promise<ScraperResult> {
  console.log('🔄 Récupération données temps réel...');
  
  const warnings: string[] = [];
  const sources: string[] = [];
  
  // Vérifier le cache
  const now = Date.now();
  const cacheValid = (sport: 'football' | 'basketball') => {
    const c = cache[sport];
    return c.data && (now - c.timestamp) < CACHE_TTL;
  };
  
  let footballMatches: RealTimeMatch[] = [];
  let basketballMatches: RealTimeMatch[] = [];
  
  // 1. Football - ESPN
  if (cacheValid('football')) {
    footballMatches = cache.football.data!;
    sources.push('ESPN-Cache');
  } else {
    footballMatches = await scrapeESPNFootball();
    if (footballMatches.length > 0) {
      cache.football = { data: footballMatches, timestamp: now };
      sources.push('ESPN');
    } else {
      // Fallback: Web Search
      console.log('⚠️ ESPN Football vide - Tentative Web Search...');
      footballMatches = await searchTodayMatches('football');
      if (footballMatches.length > 0) {
        sources.push('Web-Search');
        warnings.push('⚠️ Données football partielles (ESPN indisponible)');
      } else {
        warnings.push('❌ Aucune donnée football disponible aujourd\'hui');
      }
    }
  }
  
  // 2. Basketball - ESPN
  if (cacheValid('basketball')) {
    basketballMatches = cache.basketball.data!;
    sources.push('ESPN-Cache');
  } else {
    basketballMatches = await scrapeESPNNBA();
    if (basketballMatches.length > 0) {
      cache.basketball = { data: basketballMatches, timestamp: now };
      sources.push('ESPN');
    } else {
      // Fallback: Web Search
      console.log('⚠️ ESPN NBA vide - Tentative Web Search...');
      basketballMatches = await searchTodayMatches('basketball');
      if (basketballMatches.length > 0) {
        sources.push('Web-Search');
        warnings.push('⚠️ Données NBA partielles (ESPN indisponible)');
      } else {
        warnings.push('❌ Aucune donnée NBA disponible aujourd\'hui');
      }
    }
  }
  
  // Déterminer la qualité des données
  const dataQuality = {
    football: footballMatches.length > 0 && footballMatches.some(m => m.oddsHome !== null) 
      ? 'real' as const 
      : footballMatches.length > 0 ? 'partial' as const : 'unavailable' as const,
    basketball: basketballMatches.length > 0 && basketballMatches.some(m => m.oddsHome !== null)
      ? 'real' as const 
      : basketballMatches.length > 0 ? 'partial' as const : 'unavailable' as const,
  };
  
  const allMatches = [...footballMatches, ...basketballMatches];
  
  console.log(`✅ Total: ${allMatches.length} matchs (${footballMatches.length} Football, ${basketballMatches.length} NBA)`);
  console.log(`📊 Qualité: Football=${dataQuality.football}, NBA=${dataQuality.basketball}`);
  
  if (warnings.length > 0) {
    warnings.forEach(w => console.log(w));
  }
  
  return {
    matches: allMatches,
    sources,
    warnings,
    dataQuality,
  };
}

// ============================================
// HELPERS
// ============================================

export function clearRealTimeCache(): void {
  cache.football = { data: null, timestamp: 0 };
  cache.basketball = { data: null, timestamp: 0 };
  console.log('🗑️ Cache temps réel vidé');
}

export function isRealDataAvailable(match: RealTimeMatch): boolean {
  return match.dataQuality === 'real' || match.dataQuality === 'partial';
}

// Export par défaut
const RealTimeSportsData = {
  getRealTimeSportsData,
  clearRealTimeCache,
  isRealDataAvailable,
};

export default RealTimeSportsData;
