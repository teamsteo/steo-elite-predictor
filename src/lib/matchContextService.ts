/**
 * Match Context Service - Service Unifié de Contexte Match
 * 
 * Ce service centralise TOUTES les sources de données pour l'analyse:
 * - FBref: Forme, xG, discipline, H2H (Football uniquement)
 * - Transfermarkt: Blessures Football
 * - NBA Official: Blessures NBA
 * - Web Search: News récentes, contexte additionnel
 * 
 * PHILOSOPHIE:
 * - Maximiser la qualité des données
 * - Minimiser les appels API redondants
 * - Cache intelligent par type de données
 * - Fallback gracieux si une source échoue
 */

import ZAI from 'z-ai-web-dev-sdk';
import { 
  getMatchInjuries as getFootballInjuries, 
  evaluateInjuryImpact,
  PlayerInjury 
} from './transfermarktScraper';
import { 
  getNBAMatchInjuries, 
  evaluateNBAInjuryImpact,
  NBAPlayerInjury 
} from './nbaInjuryScraper';
import {
  getAdvancedMatchStats,
  FormGuide,
  H2HHistory,
  TeamXGStats,
  DisciplineStats,
} from './fbrefScraper';
import {
  getNBAMatchupStats,
  calculateNBAFormScore,
  NBATeamStats,
} from './basketballReferenceScraper';
import {
  getCachedTeamStats,
  getCachedNBATeamStats,
  needsUpdate,
} from './batchPreCalculation';
import {
  getAdaptiveThresholds,
  calculateMLAdjustment,
  MLThresholds,
} from './adaptiveThresholdsML';
import {
  getMatchWeather,
  WeatherData,
  formatWeatherForDisplay,
} from './weatherService';
import {
  analyzeMatchNewsContext,
  adjustProbabilitiesByNews,
  TeamNewsAnalysis,
  MatchNewsContext,
} from './teamNewsService';
import {
  calculateMatchFactors,
  adjustProbabilitiesWithFactors,
  MatchFactors,
} from './matchFactorsService';

// ============================================
// TYPES
// ============================================

// Re-export MLThresholds type
export type { MLThresholds } from './adaptiveThresholdsML';

export interface UnifiedMatchContext {
  // Identifiants
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  sport: 'football' | 'basketball';
  league: string;
  
  // Seuils adaptatifs ML (NOUVEAU)
  mlThresholds?: MLThresholds;
  
  // Données FBref (Football uniquement)
  fbref?: {
    homeForm: FormGuide | null;
    awayForm: FormGuide | null;
    h2h: H2HHistory | null;
    homeXG: TeamXGStats | null;
    awayXG: TeamXGStats | null;
    homeDiscipline: DisciplineStats | null;
    awayDiscipline: DisciplineStats | null;
    analysis: {
      formAdvantage: 'home' | 'away' | 'neutral';
      xGAdvantage: 'home' | 'away' | 'neutral';
      disciplineRisk: 'low' | 'medium' | 'high';
      h2hTrend: string;
    };
  };
  
  // Données NBA (Basketball uniquement - NOUVEAU)
  nba?: {
    homeStats: NBATeamStats | null;
    awayStats: NBATeamStats | null;
    homeFormScore: number;
    awayFormScore: number;
    analysis: {
      offensiveAdvantage: 'home' | 'away' | 'neutral';
      defensiveAdvantage: 'home' | 'away' | 'neutral';
      pacePrediction: 'fast' | 'average' | 'slow';
      projectedTotal: number;
      spreadPrediction: number;
    };
  };
  
  // Données Météo (Football uniquement - NOUVEAU)
  weather?: WeatherData;
  
  // Actualités équipe - Coach, finances, conflits (NOUVEAU)
  teamNews?: MatchNewsContext;
  
  // Facteurs de match - Home Advantage, Referee, Rest Days, Crowd, Derby (NOUVEAU)
  matchFactors?: MatchFactors;
  
  // Données de blessures
  injuries: {
    home: (PlayerInjury | NBAPlayerInjury)[];
    away: (PlayerInjury | NBAPlayerInjury)[];
    homeImpact: number;
    awayImpact: number;
    summary: string;
    keyAbsentees?: { home: string[]; away: string[] };
    source: string;
  };
  
  // News récentes (Web Search)
  news: {
    items: Array<{
      title: string;
      snippet: string;
      url: string;
      date?: string;
    }>;
    injuriesDetected: { home: string[]; away: string[] };
    formInsights: { home: string; away: string };
  };
  
  // Analyse unifiée
  unifiedAnalysis: {
    overallAdvantage: 'home' | 'away' | 'neutral';
    confidence: 'high' | 'medium' | 'low';
    riskLevel: 'low' | 'medium' | 'high';
    keyFactors: string[];
    warnings: string[];
    dataQuality: number; // 0-100%
  };
  
  // Métadonnées
  generatedAt: string;
  sourcesUsed: string[];
}

// ============================================
// CACHE UNIFIÉ
// ============================================

const contextCache = new Map<string, { data: UnifiedMatchContext; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ============================================
// FONCTIONS PRINCIPALES
// ============================================

/**
 * Récupère le contexte complet d'un match
 * C'est la fonction principale à utiliser dans expertAdvisor
 * OPTIMISÉ: Parallélise les opérations pour réduire le temps de réponse
 */
export async function getUnifiedMatchContext(params: {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  sport: 'football' | 'basketball';
  league: string;
  forceRefresh?: boolean;
}): Promise<UnifiedMatchContext> {
  const cacheKey = `${params.matchId}_${params.sport}`;
  
  // Vérifier le cache
  if (!params.forceRefresh) {
    const cached = contextCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log(`📦 Utilisation cache contexte: ${params.homeTeam} vs ${params.awayTeam}`);
      return cached.data;
    }
  }
  
  console.log(`🔄 Récupération contexte complet: ${params.homeTeam} vs ${params.awayTeam} (${params.sport})`);
  
  const sourcesUsed: string[] = [];
  
  // Récupérer les seuils ML adaptatifs (synchrone, rapide)
  const mlThresholds = getAdaptiveThresholds(params.sport);
  
  // PARALLÉLISER toutes les opérations async pour gagner du temps
  const [injuryData, fbrefOrNbaData, weatherData, newsData, teamNewsData] = await Promise.all([
    // 1. Blessures
    fetchInjuryData(params.homeTeam, params.awayTeam, params.sport).then(data => {
      if (data.source !== 'None') sourcesUsed.push(data.source);
      return data;
    }).catch(err => {
      console.error('Erreur blessures:', err);
      return { home: [], away: [], homeImpact: 0, awayImpact: 0, summary: 'Non disponible', source: 'None' };
    }),
    
    // 2. Stats FBref (Foot) ou NBA (Basket)
    (async () => {
      if (params.sport === 'football') {
        // Essayer d'abord le cache pré-calculé
        const cachedHome = getCachedTeamStats(params.homeTeam);
        const cachedAway = getCachedTeamStats(params.awayTeam);
        
        if (cachedHome && cachedAway) {
          sourcesUsed.push('FBref-Cache');
          return {
            type: 'fbref' as const,
            data: {
              homeForm: cachedHome.form,
              awayForm: cachedAway.form,
              h2h: null,
              homeXG: cachedHome.xg,
              awayXG: cachedAway.xg,
              homeDiscipline: cachedHome.discipline,
              awayDiscipline: cachedAway.discipline,
              analysis: {
                formAdvantage: 'neutral' as const,
                xGAdvantage: 'neutral' as const,
                disciplineRisk: 'low' as const,
                h2hTrend: '',
              },
            }
          };
        }
        
        // Fallback: scraping direct
        try {
          const stats = await getAdvancedMatchStats(params.homeTeam, params.awayTeam);
          sourcesUsed.push('FBref');
          return {
            type: 'fbref' as const,
            data: {
              homeForm: stats.homeForm,
              awayForm: stats.awayForm,
              h2h: stats.h2h,
              homeXG: stats.homeXG,
              awayXG: stats.awayXG,
              homeDiscipline: stats.homeDiscipline,
              awayDiscipline: stats.awayDiscipline,
              analysis: stats.analysis,
            }
          };
        } catch (e) {
          console.log('⚠️ FBref non disponible');
          return null;
        }
      } else {
        // NBA
        try {
          let homeStats = getCachedNBATeamStats(params.homeTeam);
          let awayStats = getCachedNBATeamStats(params.awayTeam);
          
          if (!homeStats || !awayStats) {
            const matchup = await getNBAMatchupStats(params.homeTeam, params.awayTeam);
            homeStats = matchup.homeStats;
            awayStats = matchup.awayStats;
          }
          
          if (homeStats || awayStats) {
            sourcesUsed.push('Basketball-Reference');
            const homeFormScore = calculateNBAFormScore(homeStats);
            const awayFormScore = calculateNBAFormScore(awayStats);
            
            const nbaData: UnifiedMatchContext['nba'] = {
              homeStats,
              awayStats,
              homeFormScore,
              awayFormScore,
              analysis: {
                offensiveAdvantage: 'neutral',
                defensiveAdvantage: 'neutral',
                pacePrediction: 'average',
                projectedTotal: 220,
                spreadPrediction: 0,
              },
            };
            
            if (homeStats && awayStats) {
              if (homeStats.offensiveRating > awayStats.offensiveRating + 3) {
                nbaData.analysis.offensiveAdvantage = 'home';
              } else if (awayStats.offensiveRating > homeStats.offensiveRating + 3) {
                nbaData.analysis.offensiveAdvantage = 'away';
              }
              
              if (homeStats.defensiveRating < awayStats.defensiveRating - 3) {
                nbaData.analysis.defensiveAdvantage = 'home';
              } else if (awayStats.defensiveRating < homeStats.defensiveRating - 3) {
                nbaData.analysis.defensiveAdvantage = 'away';
              }
              
              const avgPace = (homeStats.pace + awayStats.pace) / 2;
              nbaData.analysis.pacePrediction = avgPace > 102 ? 'fast' : avgPace < 98 ? 'slow' : 'average';
              
              const homeOff = (homeStats.offensiveRating + awayStats.defensiveRating) / 2;
              const awayOff = (awayStats.offensiveRating + homeStats.defensiveRating) / 2;
              const paceFactor = avgPace / 100;
              
              nbaData.analysis.projectedTotal = Math.round((homeOff + awayOff) * paceFactor);
              nbaData.analysis.spreadPrediction = Math.round((homeOff - awayOff) * paceFactor + 3);
            }
            
            return { type: 'nba' as const, data: nbaData };
          }
        } catch (e) {
          console.log('⚠️ Basketball-Reference non disponible');
        }
        return null;
      }
    })(),
    
    // 3. Météo (Football uniquement)
    (async () => {
      if (params.sport !== 'football') return null;
      try {
        const weather = await getMatchWeather(params.homeTeam);
        if (weather) {
          sourcesUsed.push('Open-Meteo');
          console.log(`🌤️ Météo: ${formatWeatherForDisplay(weather)}`);
        }
        return weather;
      } catch (e) {
        console.log('⚠️ Météo non disponible');
        return null;
      }
    })(),
    
    // 4. News
    fetchNewsContext(params.homeTeam, params.awayTeam, params.sport).then(data => {
      if (data.items.length > 0) sourcesUsed.push('WebSearch');
      return data;
    }).catch(err => {
      console.error('Erreur news:', err);
      return { items: [], injuriesDetected: { home: [], away: [] }, formInsights: { home: '', away: '' } };
    }),
    
    // 5. Team News (Coach, finances, conflits - NOUVEAU)
    (async () => {
      try {
        const teamNews = await analyzeMatchNewsContext(params.homeTeam, params.awayTeam);
        if (teamNews.homeTeam.newsItems.length > 0 || teamNews.awayTeam.newsItems.length > 0) {
          sourcesUsed.push('TeamNews');
          console.log(`📰 Team News: ${teamNews.homeTeam.newsItems.length + teamNews.awayTeam.newsItems.length} actualités`);
        }
        return teamNews;
      } catch (e) {
        console.log('⚠️ Team News non disponible');
        return null;
      }
    })(),
  ]);
  
  // Extraire les données du résultat parallèle
  let fbrefData: UnifiedMatchContext['fbref'] = undefined;
  let nbaData: UnifiedMatchContext['nba'] = undefined;
  
  if (fbrefOrNbaData) {
    if (fbrefOrNbaData.type === 'fbref') {
      fbrefData = fbrefOrNbaData.data;
    } else if (fbrefOrNbaData.type === 'nba') {
      nbaData = fbrefOrNbaData.data;
    }
  }
  
  // 5. Calculer les facteurs de match (Home Advantage, Referee, Rest Days, Crowd, Derby)
  // Uniquement pour le football
  let matchFactorsData: MatchFactors | undefined;
  if (params.sport === 'football') {
    try {
      matchFactorsData = calculateMatchFactors({
        homeTeam: params.homeTeam,
        awayTeam: params.awayTeam,
        league: params.league,
        matchDate: new Date(),
        // Données de forme à domicile/extérieur si disponibles
        homeFormAtHome: fbrefData?.homeForm ? {
          wins: fbrefData.homeForm.last5?.filter((r) => r.result === 'W').length || 0,
          draws: fbrefData.homeForm.last5?.filter((r) => r.result === 'D').length || 0,
          losses: fbrefData.homeForm.last5?.filter((r) => r.result === 'L').length || 0,
        } : undefined,
        awayFormAway: fbrefData?.awayForm ? {
          wins: fbrefData.awayForm.last5?.filter((r) => r.result === 'W').length || 0,
          draws: fbrefData.awayForm.last5?.filter((r) => r.result === 'D').length || 0,
          losses: fbrefData.awayForm.last5?.filter((r) => r.result === 'L').length || 0,
        } : undefined,
      });
      sourcesUsed.push('MatchFactors');
    } catch (e) {
      console.log('⚠️ Erreur calcul facteurs match:', e);
    }
  }
  
  // 6. Générer l'analyse unifiée
  const unifiedAnalysis = generateUnifiedAnalysis(
    fbrefData,
    nbaData,
    injuryData,
    newsData,
    params.homeTeam,
    params.awayTeam,
    mlThresholds,
    weatherData || undefined,
    teamNewsData || undefined,
    matchFactorsData
  );
  
  // Construire le résultat
  const context: UnifiedMatchContext = {
    matchId: params.matchId,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    sport: params.sport,
    league: params.league,
    mlThresholds,
    fbref: fbrefData,
    nba: nbaData,
    weather: weatherData || undefined,
    teamNews: teamNewsData || undefined,
    matchFactors: matchFactorsData,
    injuries: injuryData,
    news: newsData,
    unifiedAnalysis,
    generatedAt: new Date().toISOString(),
    sourcesUsed,
  };
  
  // Mettre en cache
  contextCache.set(cacheKey, { data: context, timestamp: Date.now() });
  
  console.log(`✅ Contexte récupéré: ${sourcesUsed.length} sources utilisées`);
  
  return context;
}

/**
 * Récupère les données de blessures
 */
async function fetchInjuryData(
  homeTeam: string,
  awayTeam: string,
  sport: 'football' | 'basketball'
): Promise<UnifiedMatchContext['injuries']> {
  try {
    if (sport === 'basketball') {
      const { home, away } = await getNBAMatchInjuries(homeTeam, awayTeam);
      const impact = evaluateNBAInjuryImpact(home, away);
      
      return {
        home,
        away,
        homeImpact: impact.homeImpact,
        awayImpact: impact.awayImpact,
        summary: impact.summary,
        keyAbsentees: impact.keyAbsentees,
        source: 'NBA Official',
      };
    } else {
      const { home, away } = await getFootballInjuries(homeTeam, awayTeam);
      const impact = evaluateInjuryImpact(home, away);
      
      return {
        home,
        away,
        homeImpact: impact.homeImpact,
        awayImpact: impact.awayImpact,
        summary: impact.summary,
        source: 'Transfermarkt',
      };
    }
  } catch (error) {
    console.error('Erreur récupération blessures:', error);
    return {
      home: [],
      away: [],
      homeImpact: 0,
      awayImpact: 0,
      summary: 'Données non disponibles',
      source: 'None',
    };
  }
}

/**
 * Récupère les news récentes via Web Search
 * OPTIMISÉ: Parallélise les requêtes et réduit leur nombre
 */
async function fetchNewsContext(
  homeTeam: string,
  awayTeam: string,
  sport: 'football' | 'basketball'
): Promise<UnifiedMatchContext['news']> {
  try {
    const zai = await ZAI.create();
    
    // Réduire à 1 requête principale pour accélérer
    const query = `${homeTeam} vs ${awayTeam} ${sport === 'basketball' ? 'NBA' : ''} preview prediction ${new Date().getFullYear()}`;
    
    const items: UnifiedMatchContext['news']['items'] = [];
    
    try {
      const searchResult = await zai.functions.invoke('web_search', {
        query,
        num: 5 // Récupérer plus de résultats en une seule requête
      });
      
      if (Array.isArray(searchResult)) {
        for (const item of searchResult as any[]) {
          items.push({
            title: item.name || '',
            snippet: item.snippet || '',
            url: item.url || '',
            date: item.date,
          });
        }
      }
    } catch (e) {
      // Continuer si la requête échoue
    }
    
    // Extraire les blessures et forme du texte
    const injuriesDetected = { home: [] as string[], away: [] as string[] };
    const formInsights = { home: '', away: '' };
    
    for (const item of items) {
      const text = `${item.title} ${item.snippet}`.toLowerCase();
      
      // Détecter les blessures
      const injuryKeywords = ['injured', 'blessé', 'out', 'sidelined', 'injury', 'absent'];
      if (injuryKeywords.some(kw => text.includes(kw))) {
        if (text.includes(homeTeam.toLowerCase())) {
          injuriesDetected.home.push(item.snippet.substring(0, 80));
        }
        if (text.includes(awayTeam.toLowerCase())) {
          injuriesDetected.away.push(item.snippet.substring(0, 80));
        }
      }
      
      // Détecter la forme
      const formKeywords = ['form', 'win streak', 'losing streak', 'unbeaten', 'forme'];
      if (formKeywords.some(kw => text.includes(kw))) {
        if (text.includes(homeTeam.toLowerCase()) && !formInsights.home) {
          formInsights.home = item.snippet.substring(0, 80);
        }
        if (text.includes(awayTeam.toLowerCase()) && !formInsights.away) {
          formInsights.away = item.snippet.substring(0, 80);
        }
      }
    }
    
    return {
      items: items.slice(0, 5),
      injuriesDetected,
      formInsights,
    };
    
  } catch (error) {
    console.error('Erreur Web Search:', error);
    return {
      items: [],
      injuriesDetected: { home: [], away: [] },
      formInsights: { home: '', away: '' },
    };
  }
}

/**
 * Génère l'analyse unifiée à partir de toutes les sources
 */
function generateUnifiedAnalysis(
  fbref: UnifiedMatchContext['fbref'],
  nba: UnifiedMatchContext['nba'],
  injuries: UnifiedMatchContext['injuries'],
  news: UnifiedMatchContext['news'],
  homeTeam: string,
  awayTeam: string,
  mlThresholds: MLThresholds,
  weather?: WeatherData,
  teamNews?: MatchNewsContext,
  matchFactors?: MatchFactors
): UnifiedMatchContext['unifiedAnalysis'] {
  const keyFactors: string[] = [];
  const warnings: string[] = [];
  let homeScore = 0;
  let awayScore = 0;
  let dataQuality = 0;
  
  // 1. Analyser FBref (Football uniquement)
  if (fbref) {
    dataQuality += 40; // FBref fournit des données de haute qualité
    
    // Forme (avec poids ML)
    const formWeight = mlThresholds?.formWeight || 0.05;
    if (fbref.analysis.formAdvantage === 'home') {
      homeScore += 2 * (formWeight / 0.05); // Ajuster par le poids ML
      keyFactors.push(`${homeTeam} en meilleure forme (${fbref.homeForm?.form || 'N/A'})`);
    } else if (fbref.analysis.formAdvantage === 'away') {
      awayScore += 2 * (formWeight / 0.05);
      keyFactors.push(`${awayTeam} en meilleure forme (${fbref.awayForm?.form || 'N/A'})`);
    }
    
    // xG
    if (fbref.analysis.xGAdvantage === 'home') {
      homeScore += 1.5;
      if (fbref.homeXG && fbref.homeXG.overperforming > 3) {
        warnings.push(`${homeTeam} surperforme (risque de régression)`);
      }
    } else if (fbref.analysis.xGAdvantage === 'away') {
      awayScore += 1.5;
      if (fbref.awayXG && fbref.awayXG.overperforming > 3) {
        warnings.push(`${awayTeam} surperforme (risque de régression)`);
      }
    }
    
    // H2H
    if (fbref.h2h && fbref.h2h.totalMatches > 0) {
      keyFactors.push(fbref.analysis.h2hTrend);
    }
    
    // Discipline
    if (fbref.analysis.disciplineRisk === 'high') {
      warnings.push('Risque de cartons élevé');
    }
  }
  
  // 1b. Analyser NBA (Basketball uniquement)
  if (nba) {
    dataQuality += 35; // Basketball-Reference fournit des données de qualité
    
    // Net Rating
    const netRatingWeight = mlThresholds?.netRatingWeight || 0.03;
    if (nba.analysis.offensiveAdvantage === 'home') {
      homeScore += 2 * (netRatingWeight / 0.03);
      keyFactors.push(`${homeTeam} avantage offensif (ORTG: ${nba.homeStats?.offensiveRating?.toFixed(1) || 'N/A'})`);
    } else if (nba.analysis.offensiveAdvantage === 'away') {
      awayScore += 2 * (netRatingWeight / 0.03);
      keyFactors.push(`${awayTeam} avantage offensif (ORTG: ${nba.awayStats?.offensiveRating?.toFixed(1) || 'N/A'})`);
    }
    
    if (nba.analysis.defensiveAdvantage === 'home') {
      homeScore += 1.5;
      keyFactors.push(`${homeTeam} meilleure défense`);
    } else if (nba.analysis.defensiveAdvantage === 'away') {
      awayScore += 1.5;
      keyFactors.push(`${awayTeam} meilleure défense`);
    }
    
    // Form Score NBA
    const formDiff = nba.homeFormScore - nba.awayFormScore;
    if (Math.abs(formDiff) > 10) {
      keyFactors.push(`Forme: ${formDiff > 0 ? homeTeam : awayTeam} +${Math.abs(formDiff)}`);
    }
    
    // Pace
    if (nba.analysis.pacePrediction !== 'average') {
      keyFactors.push(`Rythme ${nba.analysis.pacePrediction === 'fast' ? 'élevé' : 'lent'} attendu`);
    }
  }
  
  // 1c. Analyser la Météo (Football uniquement)
  if (weather) {
    dataQuality += 15; // La météo ajoute de la qualité au contexte
    
    // Ajouter les facteurs météo
    if (weather.impact.factors.length > 0) {
      keyFactors.push(`Météo: ${weather.impact.factors[0]}`);
    }
    
    // Conditions extrêmes = warning
    if (weather.impact.overall === 'extreme' || weather.impact.overall === 'significant') {
      warnings.push(`Conditions météo difficiles: ${weather.impact.factors.join(', ')}`);
    }
    
    // Ajustement des buts attendus
    if (weather.impact.goalsAdjustment !== 0) {
      keyFactors.push(`Ajustement buts: ${weather.impact.goalsAdjustment > 0 ? '+' : ''}${weather.impact.goalsAdjustment}`);
    }
    
    // Risque élevé
    if (weather.impact.riskLevel === 'high') {
      // En cas de mauvaise météo, l'équipe à domicile peut être désavantagée (moins habitué)
      // Mais aussi l'équipe visiteuse (déplacement difficile)
      // Effet neutre sur les scores, mais augmente le risque global
      warnings.push('Météo défavorable - augmenter la prudence');
    }
    
    // Conditions spécifiques
    if (weather.current.condition === 'rain' || weather.current.condition === 'heavy_rain') {
      // La pluie favorise un jeu plus direct, potentiellement plus de buts
      keyFactors.push('Pluie: jeu direct attendu');
    }
    
    if (weather.current.windSpeed > 30) {
      // Vent fort: impact sur les centres et tirs lointains
      keyFactors.push(`Vent: ${weather.current.windSpeed} km/h`);
    }
    
    // Températures extrêmes
    if (weather.current.temperature < 0) {
      warnings.push('Températures négatives - risque de blessures');
    } else if (weather.current.temperature > 30) {
      warnings.push('Chaleur élevée - fatigue accrue en 2ème MT');
    }
  }
  
  // 2. Analyser les blessures
  if (injuries.source !== 'None') {
    dataQuality += 30;
    
    if (injuries.homeImpact < -3) {
      awayScore += Math.abs(injuries.homeImpact) / 2;
      warnings.push(`${homeTeam}: impact blessures ${injuries.homeImpact}`);
    }
    if (injuries.awayImpact < -3) {
      homeScore += Math.abs(injuries.awayImpact) / 2;
      warnings.push(`${awayTeam}: impact blessures ${injuries.awayImpact}`);
    }
    
    if (injuries.keyAbsentees) {
      const totalKeyAbsentees = injuries.keyAbsentees.home.length + injuries.keyAbsentees.away.length;
      if (totalKeyAbsentees > 0) {
        keyFactors.push(`${totalKeyAbsentees} joueur(s) clé(s) absent(s)`);
      }
    }
  }
  
  // 3. Analyser les news
  if (news.items.length > 0) {
    dataQuality += 20;
    
    if (news.injuriesDetected.home.length > news.injuriesDetected.away.length) {
      awayScore += 0.5;
    } else if (news.injuriesDetected.away.length > news.injuriesDetected.home.length) {
      homeScore += 0.5;
    }
  }
  
  // 4. Analyser les actualités équipe (Coach, finances, conflits - NOUVEAU)
  if (teamNews) {
    dataQuality += 25; // Team news ajoute de la qualité contextuelle
    
    // Impact performance équipe domicile
    const homeNewsImpact = teamNews.homeTeam.overallImpact.performanceModifier;
    const awayNewsImpact = teamNews.awayTeam.overallImpact.performanceModifier;
    
    // Ajuster les scores selon l'impact des news
    if (homeNewsImpact < -5) {
      awayScore += Math.abs(homeNewsImpact) / 3;
      warnings.push(`${homeTeam}: ${teamNews.homeTeam.keyFactors[0] || 'Problème détecté'}`);
    }
    if (awayNewsImpact < -5) {
      homeScore += Math.abs(awayNewsImpact) / 3;
      warnings.push(`${awayTeam}: ${teamNews.awayTeam.keyFactors[0] || 'Problème détecté'}`);
    }
    
    // Ajouter les facteurs clés
    if (teamNews.homeTeam.keyFactors.length > 0) {
      keyFactors.push(`${homeTeam}: ${teamNews.homeTeam.keyFactors[0]}`);
    }
    if (teamNews.awayTeam.keyFactors.length > 0) {
      keyFactors.push(`${awayTeam}: ${teamNews.awayTeam.keyFactors[0]}`);
    }
    
    // Avertissements selon le niveau de risque
    if (teamNews.homeTeam.overallImpact.riskLevel === 'very_high') {
      warnings.push(`⚠️ ${homeTeam}: Risque très élevé (actualité)`);
    }
    if (teamNews.awayTeam.overallImpact.riskLevel === 'very_high') {
      warnings.push(`⚠️ ${awayTeam}: Risque très élevé (actualité)`);
    }
  }
  
  // 5. Analyser les facteurs de match (Home Advantage, Referee, Rest Days, Crowd, Derby)
  if (matchFactors) {
    dataQuality += 15; // Les facteurs ajoutent du contexte
    
    const { combined, homeAdvantage, restDays, crowd, derby } = matchFactors;
    
    // Appliquer l'ajustement combiné aux scores
    if (combined.homeAdjustment > 0) {
      homeScore += combined.homeAdjustment * 50; // Convertir en score
    } else if (combined.homeAdjustment < 0) {
      awayScore += Math.abs(combined.homeAdjustment) * 50;
    }
    
    // Ajouter les facteurs clés significatifs
    if (homeAdvantage.advantage !== 'neutral') {
      keyFactors.push(homeAdvantage.explanation);
    }
    
    // Fatigue significative
    if (restDays.homeFatigue === 'exhausted' || restDays.awayFatigue === 'exhausted') {
      keyFactors.push(restDays.explanation);
    }
    
    // Derby/Clásico
    if (derby.isDerby && derby.intensity !== 'low') {
      keyFactors.push(derby.explanation);
      if (derby.intensity === 'extreme') {
        warnings.push('Derby intense - résultat imprévisible');
      }
    }
    
    // Crowd hostile
    if (crowd.atmosphere === 'hostile') {
      keyFactors.push(`Stade hostile pour ${awayTeam}`);
    }
    
    // Ajouter les warnings des facteurs
    warnings.push(...combined.warnings);
  }
  
  // Déterminer l'avantage global
  let overallAdvantage: 'home' | 'away' | 'neutral' = 'neutral';
  if (homeScore - awayScore >= 2) {
    overallAdvantage = 'home';
  } else if (awayScore - homeScore >= 2) {
    overallAdvantage = 'away';
  }
  
  // Déterminer la confiance
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (dataQuality >= 60 && Math.abs(homeScore - awayScore) >= 3) {
    confidence = 'high';
  } else if (dataQuality >= 40 && Math.abs(homeScore - awayScore) >= 1) {
    confidence = 'medium';
  }
  
  // Déterminer le niveau de risque
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (warnings.length >= 3 || (injuries.homeImpact + injuries.awayImpact) < -10) {
    riskLevel = 'high';
  } else if (warnings.length >= 1 || (injuries.homeImpact + injuries.awayImpact) < -5) {
    riskLevel = 'medium';
  }
  
  // Ajuster dataQuality minimum
  dataQuality = Math.min(100, Math.max(10, dataQuality));
  
  return {
    overallAdvantage,
    confidence,
    riskLevel,
    keyFactors,
    warnings,
    dataQuality,
  };
}

/**
 * Calcule l'ajustement de probabilité basé sur le contexte
 */
export function calculateContextAdjustment(
  context: UnifiedMatchContext
): {
  homeAdjustment: number; // -0.15 à +0.15
  awayAdjustment: number;
  confidence: number; // 0-1
} {
  const { unifiedAnalysis, injuries, fbref, nba, mlThresholds, weather, teamNews } = context;
  
  let homeAdjustment = 0;
  let awayAdjustment = 0;
  let confidence = unifiedAnalysis.dataQuality / 100;
  
  // 1. Ajustement basé sur l'avantage unifié
  if (unifiedAnalysis.overallAdvantage === 'home') {
    homeAdjustment += 0.05;
  } else if (unifiedAnalysis.overallAdvantage === 'away') {
    awayAdjustment += 0.05;
  }
  
  // 2. Ajustement basé sur les blessures (impact -10 à 0)
  const injuryFactor = mlThresholds?.injuryImpactFactor || 1.0;
  homeAdjustment += (injuries.homeImpact * injuryFactor) / 200; // -0.05 max
  awayAdjustment += (injuries.awayImpact * injuryFactor) / 200;
  
  // 3. Ajustement basé sur FBref (Football uniquement)
  if (fbref) {
    // Forme
    if (fbref.homeForm && fbref.awayForm) {
      const formWeight = mlThresholds?.formWeight || 0.05;
      const formDiff = (fbref.homeForm.formPoints - fbref.awayForm.formPoints) / 30;
      homeAdjustment += formDiff * formWeight;
    }
    
    // xG
    if (fbref.homeXG && fbref.awayXG) {
      const xgWeight = mlThresholds?.xgWeight || 0.03;
      const xgDiff = fbref.homeXG.xGDPer90 - fbref.awayXG.xGDPer90;
      homeAdjustment += xgDiff * xgWeight;
    }
  }
  
  // 4. Ajustement basé sur NBA (Basketball uniquement)
  if (nba) {
    const netRatingWeight = mlThresholds?.netRatingWeight || 0.03;
    
    // Net Rating
    if (nba.homeStats && nba.awayStats) {
      const netDiff = (nba.homeStats.netRating - nba.awayStats.netRating) / 10;
      homeAdjustment += netDiff * netRatingWeight * 2;
    }
    
    // Form Score
    const formDiff = (nba.homeFormScore - nba.awayFormScore) / 100;
    homeAdjustment += formDiff * 0.05;
  }
  
  // 5. Ajustement basé sur la Météo (Football uniquement)
  if (weather) {
    // L'équipe à domicile est plus affectée par des conditions extrêmes
    // car elle joue sur son terrain habituel et peut être "dérangée" par les changements
    // L'équipe visiteuse peut profiter de la perturbation
    
    if (weather.impact.overall === 'extreme') {
      // Conditions extrêmes: réduire la confiance, pas d'avantage clair
      confidence *= 0.7;
    } else if (weather.impact.overall === 'significant') {
      // Conditions difficiles: léger impact
      confidence *= 0.85;
    }
    
    // Ajustement basé sur l'ajustement de buts
    // Plus de buts attendus = moins d'avantage défensif
    const goalsAdj = weather.impact.goalsAdjustment;
    if (goalsAdj > 0) {
      // Plus de buts attendus: favorise légèrement l'équipe en forme offensive
      // L'ajustement est neutre car on ne sait pas quelle équipe est offensive
      // Mais on peut réduire l'avantage domicile (terrain glissant, etc.)
      homeAdjustment -= 0.01;
    } else if (goalsAdj < 0) {
      // Moins de buts attendus: favorise les défenses
      // L'avantage domicile peut être plus important
      homeAdjustment += 0.01;
    }
    
    // Vent fort: impact sur le jeu aérien
    if (weather.current.windSpeed > 40) {
      // Vent très fort: jeu imprévisible
      confidence *= 0.9;
    }
    
    // Pluie/terrain glissant: favorise le jeu direct
    if (weather.current.condition === 'rain' || weather.current.condition === 'heavy_rain') {
      // Les équipes techniques sont désavantagées
      // L'équipe à domicile qui connaît son terrain a un léger avantage
      homeAdjustment += 0.01;
    }
  }
  
  // 6. Ajustement basé sur les actualités équipe (NOUVEAU)
  if (teamNews) {
    // Impact des news sur les probabilités
    const homeNewsImpact = teamNews.homeTeam.overallImpact.performanceModifier;
    const awayNewsImpact = teamNews.awayTeam.overallImpact.performanceModifier;
    
    // Convertir l'impact en ajustement de probabilité
    // Impact négatif = équipe désavantagée
    const homeNewsAdj = -homeNewsImpact * 0.005; // 0.5% par point d'impact
    const awayNewsAdj = -awayNewsImpact * 0.005;
    
    homeAdjustment += homeNewsAdj - awayNewsAdj * 0.3;
    awayAdjustment += awayNewsAdj - homeNewsAdj * 0.3;
    
    // Réduire la confiance si risque élevé
    if (teamNews.homeTeam.overallImpact.riskLevel === 'very_high' ||
        teamNews.awayTeam.overallImpact.riskLevel === 'very_high') {
      confidence *= 0.85;
    } else if (teamNews.homeTeam.overallImpact.riskLevel === 'high' ||
               teamNews.awayTeam.overallImpact.riskLevel === 'high') {
      confidence *= 0.92;
    }
  }
  
  // 7. Ajustement basé sur les facteurs de match (Home Advantage, Referee, Rest Days, Crowd, Derby)
  if (context.matchFactors) {
    const { combined, derby } = context.matchFactors;
    
    // Appliquer l'ajustement combiné
    homeAdjustment += combined.homeAdjustment;
    awayAdjustment += combined.awayAdjustment;
    
    // Ajuster la confiance selon les facteurs
    confidence *= combined.confidenceModifier;
    
    // Derbies extrêmes: réduire encore la confiance
    if (derby.isDerby && derby.intensity === 'extreme') {
      confidence *= 0.90;
    }
  }
  
  // 8. Appliquer les ajustements ML
  if (mlThresholds) {
    // Ajuster la confiance basée sur la qualité des données
    if (unifiedAnalysis.dataQuality < mlThresholds.minDataQuality) {
      confidence *= 0.7; // Réduire la confiance si qualité insuffisante
    }
  }
  
  // Limiter les ajustements
  homeAdjustment = Math.max(-0.15, Math.min(0.15, homeAdjustment));
  awayAdjustment = Math.max(-0.15, Math.min(0.15, awayAdjustment));
  
  return {
    homeAdjustment: Math.round(homeAdjustment * 1000) / 1000,
    awayAdjustment: Math.round(awayAdjustment * 1000) / 1000,
    confidence: Math.round(confidence * 100) / 100,
  };
}

/**
 * Génère un résumé du contexte pour l'affichage
 */
export function generateContextSummary(context: UnifiedMatchContext): string {
  const parts: string[] = [];
  
  // Avantage global
  if (context.unifiedAnalysis.overallAdvantage !== 'neutral') {
    const team = context.unifiedAnalysis.overallAdvantage === 'home' 
      ? context.homeTeam 
      : context.awayTeam;
    parts.push(`Avantage ${team}`);
  }
  
  // Blessures
  if (context.injuries.summary !== 'Aucune blessure signalée') {
    parts.push(context.injuries.summary);
  }
  
  // Facteurs clés
  if (context.unifiedAnalysis.keyFactors.length > 0) {
    parts.push(context.unifiedAnalysis.keyFactors[0]);
  }
  
  // Qualité des données
  parts.push(`Qualité: ${context.unifiedAnalysis.dataQuality}%`);
  
  return parts.join(' | ');
}

/**
 * Vide le cache
 */
export function clearMatchContextCache(): void {
  contextCache.clear();
  console.log('🗑️ Cache MatchContext vidé');
}

// Export par défaut
const MatchContextService = {
  getUnifiedMatchContext,
  calculateContextAdjustment,
  generateContextSummary,
  clearCache: clearMatchContextCache,
};

export default MatchContextService;

// ============================================
// NOUVEAUTES: Kelly Criterion & Motivation Analysis
// ============================================

/**
 * Analyse le contexte de motivation d'un match
 */
export interface MotivationAnalysis {
  homeMotivation: number; // 0-100
  awayMotivation: number;
  difference: number;
  explanation: string;
}

export interface TeamMotivationData {
  position: number;
  totalTeams: number;
  recentResults: ('W' | 'D' | 'L')[];
  daysSinceLastMatch?: number;
  injuries?: number;
}

/**
 * Calcule le score de motivation d'une équipe
 */
export function calculateMotivation(
  position: number,
  totalTeams: number,
  recentResults: ('W' | 'D' | 'L')[]
): number {
  let motivation = 50;
  
  // Position
  if (position <= 3) motivation += 15;
  else if (position >= totalTeams - 3) motivation += 15;
  
  // Forme
  const wins = recentResults.filter(r => r === 'W').length;
  if (wins >= 4) motivation += 15;
  else if (wins === 3) motivation += 10;
  else if (wins === 0) motivation -= 15;
  
  return Math.max(0, Math.min(100, motivation));
}

/**
 * Analyse le contexte d'un match pour la motivation
 */
export function analyzeMatchMotivation(
  homeTeam: string,
  awayTeam: string,
  homeData: TeamMotivationData,
  awayData: TeamMotivationData
): MotivationAnalysis {
  const homeMotivation = calculateMotivation(
    homeData.position,
    homeData.totalTeams,
    homeData.recentResults
  );
  
  const awayMotivation = calculateMotivation(
    awayData.position,
    awayData.totalTeams,
    awayData.recentResults
  );
  
  const difference = homeMotivation - awayMotivation;
  
  let explanation = '';
  if (difference > 15) {
    explanation = `${homeTeam} largement plus motivé`;
  } else if (difference > 5) {
    explanation = `${homeTeam} plus motivé`;
  } else if (difference < -15) {
    explanation = `${awayTeam} largement plus motivé`;
  } else if (difference < -5) {
    explanation = `${awayTeam} plus motivé`;
  } else {
    explanation = 'Motivation équilibrée';
  }
  
  return {
    homeMotivation,
    awayMotivation,
    difference,
    explanation,
  };
}

/**
 * Crée un contexte simplifié d'équipe
 */
export function createTeamContext(
  position: number,
  totalTeams: number,
  recentResults: ('W' | 'D' | 'L')[],
  daysSinceLastMatch: number = 4,
  injuries: number = 0
): TeamMotivationData {
  return {
    position,
    totalTeams,
    recentResults,
    daysSinceLastMatch,
    injuries,
  };
}

/**
 * Ajuste les probabilités selon la motivation
 */
export function adjustProbabilitiesByMotivation(
  homeProb: number,
  drawProb: number,
  awayProb: number,
  motivation: MotivationAnalysis
): { home: number; draw: number; away: number } {
  // Ajustement: +1% par point de motivation au-dessus de 50
  const homeAdj = (motivation.homeMotivation - 50) * 0.2;
  const awayAdj = (motivation.awayMotivation - 50) * 0.2;
  
  let adjustedHome = homeProb + homeAdj - awayAdj * 0.5;
  let adjustedAway = awayProb + awayAdj - homeAdj * 0.5;
  let adjustedDraw = drawProb - (Math.abs(homeAdj) + Math.abs(awayAdj)) * 0.3;
  
  // Normaliser
  const total = adjustedHome + adjustedDraw + adjustedAway;
  return {
    home: (adjustedHome / total) * 100,
    draw: (adjustedDraw / total) * 100,
    away: (adjustedAway / total) * 100,
  };
}
