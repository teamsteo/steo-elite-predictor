/**
 * Service pour récupérer les scores NBA en temps réel via Web Search
 * Utilise le z-ai-web-dev-sdk pour rechercher les scores sur Google
 */

import ZAI from 'z-ai-web-dev-sdk';

interface NBAScore {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  period: string;
  clock: string;
  status: 'live' | 'finished' | 'upcoming';
  date: string;
}

/**
 * Récupère les scores NBA en temps réel via Web Search
 */
export async function getNBALiveScoresFromWeb(): Promise<NBAScore[]> {
  try {
    const zai = await ZAI.create();
    
    // Rechercher les scores NBA du jour
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    const searchQuery = `NBA scores today ${dateStr} live results`;
    
    const searchResult = await zai.functions.invoke("web_search", {
      query: searchQuery,
      num: 10
    });
    
    if (!searchResult || !Array.isArray(searchResult)) {
      console.log('⚠️ Pas de résultats de recherche NBA');
      return [];
    }
    
    console.log(`🔍 Web Search NBA: ${searchResult.length} résultats trouvés`);
    
    // Parser les résultats pour extraire les scores
    const scores: NBAScore[] = [];
    
    for (const result of searchResult) {
      const snippet = result.snippet || '';
      const name = result.name || '';
      
      // Chercher des patterns de scores NBA (ex: "Lakers 112 - 108 Warriors")
      const scorePattern = /([A-Za-z\s]+)\s+(\d+)\s*[-–]\s*(\d+)\s+([A-Za-z\s]+)/g;
      let match;
      
      while ((match = scorePattern.exec(snippet + ' ' + name)) !== null) {
        const homeTeam = match[1].trim();
        const awayTeam = match[4].trim();
        const homeScore = parseInt(match[2]);
        const awayScore = parseInt(match[3]);
        
        // Vérifier que c'est bien un score NBA (entre 80-150 points typiquement)
        if (homeScore >= 70 && homeScore <= 180 && awayScore >= 70 && awayScore <= 180) {
          // Éviter les doublons
          const exists = scores.some(s => 
            (s.homeTeam === homeTeam && s.awayTeam === awayTeam) ||
            (s.homeTeam === awayTeam && s.awayTeam === homeTeam)
          );
          
          if (!exists) {
            scores.push({
              homeTeam,
              awayTeam,
              homeScore,
              awayScore,
              period: 'Final',
              clock: '',
              status: 'finished',
              date: today.toISOString()
            });
          }
        }
      }
      
      // Chercher des matchs en cours (avec Q1, Q2, Q3, Q4, OT)
      const livePattern = /([A-Za-z\s]+)\s+(\d+)\s*[-–]\s*(\d+)\s+([A-Za-z\s]+).*?(Q[1-4]|OT|Halftime|Final)/i;
      const liveMatch = livePattern.exec(snippet);
      
      if (liveMatch) {
        const homeTeam = liveMatch[1].trim();
        const awayTeam = liveMatch[4].trim();
        const homeScore = parseInt(liveMatch[2]);
        const awayScore = parseInt(liveMatch[3]);
        const period = liveMatch[5];
        
        if (homeScore >= 0 && awayScore >= 0) {
          const exists = scores.some(s => 
            s.homeTeam === homeTeam && s.awayTeam === awayTeam
          );
          
          if (!exists) {
            scores.push({
              homeTeam,
              awayTeam,
              homeScore,
              awayScore,
              period,
              clock: '',
              status: period === 'Final' ? 'finished' : 'live',
              date: today.toISOString()
            });
          }
        }
      }
    }
    
    console.log(`✅ Web Search NBA: ${scores.length} scores extraits`);
    return scores;
    
  } catch (error) {
    console.error('❌ Erreur Web Search NBA:', error);
    return [];
  }
}

/**
 * Récupère les matchs NBA à venir via Web Search
 */
export async function getNBAUpcomingFromWeb(): Promise<NBAScore[]> {
  try {
    const zai = await ZAI.create();
    
    const searchQuery = 'NBA schedule today games tonight';
    
    const searchResult = await zai.functions.invoke("web_search", {
      query: searchQuery,
      num: 10
    });
    
    if (!searchResult || !Array.isArray(searchResult)) {
      return [];
    }
    
    const games: NBAScore[] = [];
    const today = new Date();
    
    for (const result of searchResult) {
      const snippet = result.snippet || '';
      
      // Pattern pour matchs à venir (ex: "Lakers vs Warriors 7:30 PM ET")
      const upcomingPattern = /([A-Za-z\s]+)\s+vs\.?\s+([A-Za-z\s]+)\s+(\d{1,2}:\d{2})\s*(AM|PM|ET|PT)?/gi;
      let match;
      
      while ((match = upcomingPattern.exec(snippet)) !== null) {
        const homeTeam = match[1].trim();
        const awayTeam = match[2].trim();
        const time = match[3];
        const ampm = match[4] || 'ET';
        
        // Éviter les doublons
        const exists = games.some(g => 
          g.homeTeam === homeTeam && g.awayTeam === awayTeam
        );
        
        if (!exists && homeTeam.length > 2 && awayTeam.length > 2) {
          games.push({
            homeTeam,
            awayTeam,
            homeScore: 0,
            awayScore: 0,
            period: '',
            clock: `${time} ${ampm}`,
            status: 'upcoming',
            date: today.toISOString()
          });
        }
      }
    }
    
    return games;
  } catch (error) {
    console.error('❌ Erreur Web Search NBA upcoming:', error);
    return [];
  }
}

/**
 * Combine les données ESPN avec les données Web Search
 */
export async function enrichNBAScores(espnMatches: any[]): Promise<any[]> {
  try {
    // Récupérer les scores via web search
    const webScores = await getNBALiveScoresFromWeb();
    
    if (webScores.length === 0) {
      return espnMatches;
    }
    
    // Enrichir les matchs ESPN avec les scores web
    return espnMatches.map(match => {
      // Chercher un score correspondant
      const webScore = webScores.find(s => 
        match.homeTeam?.toLowerCase().includes(s.homeTeam.toLowerCase()) ||
        s.homeTeam.toLowerCase().includes(match.homeTeam?.toLowerCase()) ||
        match.awayTeam?.toLowerCase().includes(s.awayTeam.toLowerCase()) ||
        s.awayTeam.toLowerCase().includes(match.awayTeam?.toLowerCase())
      );
      
      if (webScore && !match.homeScore) {
        return {
          ...match,
          homeScore: webScore.homeScore,
          awayScore: webScore.awayScore,
          period: webScore.period,
          status: webScore.status,
          isLive: webScore.status === 'live',
          isFinished: webScore.status === 'finished'
        };
      }
      
      return match;
    });
  } catch (error) {
    console.error('❌ Erreur enrichissement NBA:', error);
    return espnMatches;
  }
}

export default {
  getNBALiveScoresFromWeb,
  getNBAUpcomingFromWeb,
  enrichNBAScores
};
