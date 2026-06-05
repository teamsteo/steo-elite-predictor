/**
 * Service pour récupérer les scores Football en temps réel via Web Search
 * Utilise le z-ai-web-dev-sdk pour rechercher les scores sur Google
 */

import ZAI from 'z-ai-web-dev-sdk';

interface FootballScore {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  minute: string;
  status: 'live' | 'finished' | 'upcoming';
  league: string;
  date: string;
}

/**
 * Récupère les scores Football en temps réel via Web Search
 */
export async function getFootballLiveScoresFromWeb(): Promise<FootballScore[]> {
  try {
    const zai = await ZAI.create();
    
    // Rechercher les scores football du jour
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric' 
    });
    
    const searchQueries = [
      `Premier League scores today ${dateStr} live results`,
      `La Liga scores today ${dateStr} results`,
      `Champions League scores today live`,
      `Ligue 1 scores today ${dateStr} results`,
      `Serie A scores today ${dateStr} results`,
      `Bundesliga scores today ${dateStr} results`,
    ];
    
    const allScores: FootballScore[] = [];
    
    for (const query of searchQueries.slice(0, 3)) { // Limiter à 3 requêtes
      try {
        const searchResult = await zai.functions.invoke("web_search", {
          query,
          num: 8
        });
        
        if (!searchResult || !Array.isArray(searchResult)) continue;
        
        for (const result of searchResult) {
          const snippet = result.snippet || '';
          const name = result.name || '';
          const text = snippet + ' ' + name;
          
          // Pattern pour scores football (ex: "Arsenal 2 - 1 Chelsea" ou "Man City 3-0 Liverpool")
          const scorePattern = /([A-Za-z][A-Za-z\s]{2,20})\s+(\d)\s*[-–]\s*(\d)\s+([A-Za-z][A-Za-z\s]{2,20})/g;
          let match;
          
          while ((match = scorePattern.exec(text)) !== null) {
            const homeTeam = match[1].trim();
            const awayTeam = match[4].trim();
            const homeScore = parseInt(match[2]);
            const awayScore = parseInt(match[3]);
            
            // Vérifier que c'est un score valide (0-15 buts max)
            if (homeScore >= 0 && homeScore <= 15 && awayScore >= 0 && awayScore <= 15) {
              // Détecter si c'est en cours ou terminé
              const isLive = text.toLowerCase().includes('live') || 
                            text.toLowerCase().includes("min") ||
                            text.includes("'");
              
              // Extraire la minute si disponible
              let minute = '';
              const minMatch = text.match(/(\d{1,2})['′]/);
              if (minMatch) {
                minute = minMatch[1] + "'";
              } else if (text.toLowerCase().includes('halftime') || text.toLowerCase().includes('mi-temps')) {
                minute = 'MT';
              } else if (text.toLowerCase().includes('finished') || text.toLowerCase().includes('full time')) {
                minute = 'FT';
              }
              
              // Éviter les doublons
              const exists = allScores.some(s => 
                (s.homeTeam.toLowerCase().includes(homeTeam.toLowerCase()) || 
                 homeTeam.toLowerCase().includes(s.homeTeam.toLowerCase())) &&
                (s.awayTeam.toLowerCase().includes(awayTeam.toLowerCase()) || 
                 awayTeam.toLowerCase().includes(s.awayTeam.toLowerCase()))
              );
              
              // Détecter la ligue
              let league = 'Autre';
              if (text.toLowerCase().includes('premier league') || text.toLowerCase().includes('epl')) {
                league = 'Premier League';
              } else if (text.toLowerCase().includes('la liga')) {
                league = 'La Liga';
              } else if (text.toLowerCase().includes('champions league') || text.toLowerCase().includes('ucl')) {
                league = 'Ligue des Champions';
              } else if (text.toLowerCase().includes('ligue 1')) {
                league = 'Ligue 1';
              } else if (text.toLowerCase().includes('serie a')) {
                league = 'Serie A';
              } else if (text.toLowerCase().includes('bundesliga')) {
                league = 'Bundesliga';
              } else if (text.toLowerCase().includes('europa league')) {
                league = 'Europa League';
              }
              
              if (!exists && homeTeam.length > 2 && awayTeam.length > 2) {
                allScores.push({
                  homeTeam,
                  awayTeam,
                  homeScore,
                  awayScore,
                  minute,
                  status: minute === 'FT' ? 'finished' : isLive ? 'live' : 'finished',
                  league,
                  date: today.toISOString()
                });
              }
            }
          }
        }
      } catch {
        continue;
      }
    }
    
    console.log(`✅ Web Search Football: ${allScores.length} scores extraits`);
    return allScores;
    
  } catch (error) {
    console.error('❌ Erreur Web Search Football:', error);
    return [];
  }
}

/**
 * Enrichit les matchs football avec les scores web
 */
export async function enrichFootballScores(espnMatches: any[]): Promise<any[]> {
  try {
    const webScores = await getFootballLiveScoresFromWeb();
    
    if (webScores.length === 0) {
      return espnMatches;
    }
    
    return espnMatches.map(match => {
      // Chercher un score correspondant
      const webScore = webScores.find(s => {
        const homeMatch = match.homeTeam?.toLowerCase().includes(s.homeTeam.toLowerCase()) ||
                         s.homeTeam.toLowerCase().includes(match.homeTeam?.toLowerCase());
        const awayMatch = match.awayTeam?.toLowerCase().includes(s.awayTeam.toLowerCase()) ||
                         s.awayTeam.toLowerCase().includes(match.awayTeam?.toLowerCase());
        return homeMatch && awayMatch;
      });
      
      if (webScore && (match.homeScore === undefined || match.homeScore === null)) {
        return {
          ...match,
          homeScore: webScore.homeScore,
          awayScore: webScore.awayScore,
          minute: webScore.minute,
          status: webScore.status,
          isLive: webScore.status === 'live',
          isFinished: webScore.status === 'finished'
        };
      }
      
      return match;
    });
  } catch (error) {
    console.error('❌ Erreur enrichissement Football:', error);
    return espnMatches;
  }
}

export default {
  getFootballLiveScoresFromWeb,
  enrichFootballScores
};
