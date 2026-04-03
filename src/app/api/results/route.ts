import { NextResponse } from 'next/server';
import PredictionStore from '@/lib/store';
import * as fs from 'fs';
import * as path from 'path';

// Configuration GitHub
const GITHUB_REPO = 'steohidy/my-project';
const GITHUB_BRANCH = 'master';

/**
 * Charger les stats historiques - d'abord local, puis GitHub
 */
async function loadStatsHistory(): Promise<any> {
  // 1. Essayer de lire le fichier local (disponible sur Vercel)
  try {
    const localPath = path.join(process.cwd(), 'data/stats_history.json');
    if (fs.existsSync(localPath)) {
      const content = fs.readFileSync(localPath, 'utf-8');
      const data = JSON.parse(content);
      console.log('📊 Stats chargées depuis fichier local');
      return data;
    }
  } catch (e) {
    console.log('⚠️ Impossible de lire stats_history local:', e);
  }
  
  // 2. Fallback: charger depuis GitHub
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/data/stats_history.json`,
      { next: { revalidate: 60 } }
    );
    if (res.ok) {
      console.log('📊 Stats chargées depuis GitHub');
      return await res.json();
    }
  } catch (e) {
    console.error('Erreur chargement stats_history:', e);
  }
  return null;
}

/**
 * Charger les prédictions - d'abord local, puis GitHub
 */
async function loadPredictions(): Promise<any> {
  // 1. Essayer de lire le fichier local
  try {
    const localPath = path.join(process.cwd(), 'data/predictions.json');
    if (fs.existsSync(localPath)) {
      const content = fs.readFileSync(localPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.log('⚠️ Impossible de lire predictions local:', e);
  }
  
  // 2. Fallback: charger depuis GitHub
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/data/predictions.json`,
      { next: { revalidate: 60 } }
    );
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.error('Erreur chargement predictions:', e);
  }
  return null;
}

/**
 * Normaliser le sport
 */
function normalizeSport(sport: string): 'football' | 'basketball' | 'hockey' | 'other' {
  const s = sport.toLowerCase();
  if (s.includes('foot') || s.includes('soccer')) return 'football';
  if (s.includes('basket') || s.includes('nba')) return 'basketball';
  if (s.includes('hockey') || s.includes('nhl')) return 'hockey';
  return 'other';
}

/**
 * Helper functions pour le filtrage temporel
 */
function isToday(dateString: string): boolean {
  const date = new Date(dateString);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function isThisWeek(dateString: string): boolean {
  const date = new Date(dateString);
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  return date >= weekAgo && date <= today;
}

function isThisMonth(dateString: string): boolean {
  const date = new Date(dateString);
  const today = new Date();
  return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
}

/**
 * Calculer les stats depuis les prédictions
 */
function calculateStatsFromPredictions(predictions: any[], filter?: 'football' | 'basketball'): any {
  // Filtrer par sport si demandé
  const filtered = filter 
    ? predictions.filter((p: any) => normalizeSport(p.sport) === filter)
    : predictions;
  
  const today = filtered.filter((p: any) => isToday(p.matchDate));
  const week = filtered.filter((p: any) => isThisWeek(p.matchDate));
  const month = filtered.filter((p: any) => isThisMonth(p.matchDate));
  
  const calcStats = (preds: any[]) => {
    const total = preds.length;
    const completed = preds.filter((p: any) => p.status === 'completed');
    const wins = completed.filter((p: any) => p.resultMatch === true).length;
    const losses = completed.filter((p: any) => p.resultMatch === false).length;
    
    return {
      totalPredictions: total,
      completed: completed.length,
      wins,
      losses,
      winRate: completed.length > 0 ? Math.round(wins / completed.length * 100) : 0
    };
  };
  
  return {
    daily: calcStats(today),
    weekly: calcStats(week),
    monthly: calcStats(month),
    overall: calcStats(filtered)
  };
}

/**
 * Calculer les stats depuis stats_history.json avec séparation par sport
 */
function calculateStatsFromHistory(statsHistory: any, predictions: any): any {
  if (!statsHistory || !statsHistory.dailyStats) {
    return null;
  }
  
  const dailyStats = statsHistory.dailyStats;
  const today = new Date().toISOString().split('T')[0];
  
  // Hier
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  
  const yesterdayData = dailyStats.find((d: any) => d.date === yesterdayStr);
  
  // Semaine (7 derniers jours)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekStats = dailyStats.filter((d: any) => new Date(d.date) >= weekAgo);
  
  // Mois (30 derniers jours)
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const monthStats = dailyStats.filter((d: any) => new Date(d.date) >= monthAgo);
  
  // Calculer les agrégats depuis la structure réelle du fichier
  const aggregateStats = (stats: any[]) => {
    if (stats.length === 0) return { totalPredictions: 0, wins: 0, losses: 0, winRate: 0, completed: 0 };
    const totals = stats.reduce((acc, d) => ({
      completed: acc.completed + (d.stats?.completed || 0),
      wins: acc.wins + (d.stats?.wins || 0),
      losses: acc.losses + (d.stats?.losses || 0)
    }), { completed: 0, wins: 0, losses: 0 });
    
    return {
      totalPredictions: totals.completed,
      completed: totals.completed,
      wins: totals.wins,
      losses: totals.losses,
      winRate: totals.completed > 0 ? Math.round((totals.wins / totals.completed) * 100) : 0
    };
  };
  
  // Stats par sport depuis les nouvelles données avec détails
  const aggregateBySport = (stats: any[], sport: 'football' | 'basketball' | 'hockey') => {
    if (stats.length === 0) return { total: 0, wins: 0, losses: 0, winRate: 0, details: { resultats: { total: 0, wins: 0, winRate: 0 }, buts: { total: 0, wins: 0, winRate: 0 }, btts: { total: 0, wins: 0, winRate: 0 } } };
    
    const totals = stats.reduce((acc, d) => {
      const sportStats = d.stats?.bySport?.[sport] || { total: 0, wins: 0, losses: 0 };
      const details = d.stats?.bySport?.[sport]?.details || { resultats: { total: 0, wins: 0 }, buts: { total: 0, wins: 0 }, btts: { total: 0, wins: 0 } };
      return {
        total: acc.total + (sportStats.total || 0),
        wins: acc.wins + (sportStats.wins || 0),
        losses: acc.losses + (sportStats.losses || 0),
        details: {
          resultats: {
            total: acc.details.resultats.total + (details.resultats?.total || 0),
            wins: acc.details.resultats.wins + (details.resultats?.wins || 0)
          },
          buts: {
            total: acc.details.buts.total + (details.buts?.total || 0),
            wins: acc.details.buts.wins + (details.buts?.wins || 0)
          },
          btts: {
            total: acc.details.btts.total + (details.btts?.total || 0),
            wins: acc.details.btts.wins + (details.btts?.wins || 0)
          }
        }
      };
    }, { total: 0, wins: 0, losses: 0, details: { resultats: { total: 0, wins: 0 }, buts: { total: 0, wins: 0 }, btts: { total: 0, wins: 0 } } });
    
    return {
      total: totals.total,
      wins: totals.wins,
      losses: totals.losses,
      winRate: totals.total > 0 ? Math.round((totals.wins / totals.total) * 100) : 0,
      details: {
        resultats: {
          total: totals.details.resultats.total,
          wins: totals.details.resultats.wins,
          winRate: totals.details.resultats.total > 0 ? Math.round((totals.details.resultats.wins / totals.details.resultats.total) * 100) : 0
        },
        buts: {
          total: totals.details.buts.total,
          wins: totals.details.buts.wins,
          winRate: totals.details.buts.total > 0 ? Math.round((totals.details.buts.wins / totals.details.buts.total) * 100) : 0
        },
        btts: {
          total: totals.details.btts.total,
          wins: totals.details.btts.wins,
          winRate: totals.details.btts.total > 0 ? Math.round((totals.details.btts.wins / totals.details.btts.total) * 100) : 0
        }
      }
    };
  };
  
  // Stats quotidiennes (hier)
  const dailyResult = yesterdayData ? {
    totalPredictions: yesterdayData.stats?.completed || 0,
    completed: yesterdayData.stats?.completed || 0,
    wins: yesterdayData.stats?.wins || 0,
    losses: yesterdayData.stats?.losses || 0,
    winRate: yesterdayData.stats?.winRate || 0,
    bySport: {
      football: yesterdayData.stats?.bySport?.football || { total: 0, wins: 0, losses: 0, winRate: 0 },
      basketball: yesterdayData.stats?.bySport?.basketball || { total: 0, wins: 0, losses: 0, winRate: 0 },
      hockey: yesterdayData.stats?.bySport?.hockey || { total: 0, wins: 0, losses: 0, winRate: 0 }
    },
    predictions: yesterdayData.predictions || []
  } : { totalPredictions: 0, completed: 0, wins: 0, losses: 0, winRate: 0, predictions: [], bySport: { football: { total: 0, wins: 0, losses: 0, winRate: 0 }, basketball: { total: 0, wins: 0, losses: 0, winRate: 0 }, hockey: { total: 0, wins: 0, losses: 0, winRate: 0 } } };
  
  return {
    daily: dailyResult,
    weekly: {
      ...aggregateStats(weekStats),
      bySport: {
        football: aggregateBySport(weekStats, 'football'),
        basketball: aggregateBySport(weekStats, 'basketball'),
        hockey: aggregateBySport(weekStats, 'hockey')
      }
    },
    monthly: {
      ...aggregateStats(monthStats),
      bySport: {
        football: aggregateBySport(monthStats, 'football'),
        basketball: aggregateBySport(monthStats, 'basketball'),
        hockey: aggregateBySport(monthStats, 'hockey')
      }
    },
    overall: {
      ...(statsHistory.summary || aggregateStats(dailyStats)),
      bySport: statsHistory.summary?.bySport || {
        football: aggregateBySport(dailyStats, 'football'),
        basketball: aggregateBySport(dailyStats, 'basketball'),
        hockey: aggregateBySport(dailyStats, 'hockey')
      },
      expertAdvisor: statsHistory.summary?.expertAdvisor || null
    }
  };
}

/**
 * Normaliser le nom d'équipe pour la comparaison
 */
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 8);
}

/**
 * Trouver le résultat correspondant dans les données Football-Data
 */
function findMatchResult(
  fdMatch: any, 
  homeTeam: string,
  awayTeam: string
): { found: boolean; homeScore: number; awayScore: number } {
  const predHomeNorm = normalizeTeamName(homeTeam);
  const predAwayNorm = normalizeTeamName(awayTeam);
  
  const fdHomeNorm = normalizeTeamName(fdMatch.homeTeam?.name || '');
  const fdAwayNorm = normalizeTeamName(fdMatch.awayTeam?.name || '');
  
  const homeMatch = predHomeNorm === fdHomeNorm || 
                    predHomeNorm.includes(fdHomeNorm) || 
                    fdHomeNorm.includes(predHomeNorm);
  const awayMatch = predAwayNorm === fdAwayNorm || 
                    predAwayNorm.includes(fdAwayNorm) || 
                    fdAwayNorm.includes(predAwayNorm);
  
  if (homeMatch && awayMatch) {
    return {
      found: true,
      homeScore: fdMatch.score?.fullTime?.home ?? fdMatch.score?.fullTime?.homeTeam ?? 0,
      awayScore: fdMatch.score?.fullTime?.away ?? fdMatch.score?.fullTime?.awayTeam ?? 0
    };
  }
  
  return { found: false, homeScore: 0, awayScore: 0 };
}

/**
 * Récupérer les résultats réels d'hier via Football-Data API
 */
async function fetchYesterdayResults(): Promise<any[]> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  
  if (!apiKey) {
    console.error('❌ FOOTBALL_DATA_API_KEY non configurée');
    return [];
  }
  
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    console.log(`📅 Récupération des résultats du ${dateStr}`);
    
    const response = await fetch(
      `https://api.football-data.org/v4/matches?date=${dateStr}`,
      {
        headers: { 'X-Auth-Token': apiKey },
        next: { revalidate: 0 }
      }
    );
    
    if (!response.ok) {
      console.error(`Erreur API Football-Data: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    const finishedMatches = (data.matches || []).filter(
      (m: any) => m.status === 'FINISHED' || m.status === 'FT'
    );
    
    console.log(`✅ ${finishedMatches.length} matchs terminés trouvés`);
    
    return finishedMatches;
    
  } catch (error) {
    console.error('Erreur récupération résultats:', error);
    return [];
  }
}

/**
 * GET - Récupérer les statistiques et pronostics
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'stats';
    const sport = searchParams.get('sport'); // Filtre par sport
    const betType = searchParams.get('betType'); // Filtre par type de pari
    
    // Statistiques détaillées par période - DEPUIS GITHUB
    if (action === 'stats') {
      // Charger les stats depuis GitHub
      const statsHistory = await loadStatsHistory();
      
      // Type pour les stats
      type StatsType = {
        daily: { totalPredictions: number; completed: number; wins: number; losses: number; winRate: number; bySport?: any };
        weekly: { totalPredictions: number; completed: number; wins: number; losses: number; winRate: number; bySport?: any };
        monthly: { totalPredictions: number; completed: number; wins: number; losses: number; winRate: number; bySport?: any };
        overall: { totalPredictions: number; completed: number; wins: number; losses: number; winRate: number; bySport?: any; expertAdvisor?: any };
      };
      
      // Utiliser les stats pré-calculées si disponibles ET récentes (moins de 24h)
      let stats: StatsType | null = null;
      const statsUpdateTime = statsHistory?.lastUpdate ? new Date(statsHistory.lastUpdate) : null;
      const isStatsRecent = statsUpdateTime && (Date.now() - statsUpdateTime.getTime() < 24 * 60 * 60 * 1000);
      
      if (statsHistory && isStatsRecent) {
        stats = calculateStatsFromHistory(statsHistory, null);
      }
      
      // Si pas de stats récentes, calculer directement depuis PredictionStore
      if (!stats) {
        console.log('📊 Calcul des stats depuis PredictionStore (temps réel)');
        const detailedStats = await PredictionStore.getDetailedStatsAsync();
        
        // Convertir le format pour correspondre à l'attendu
        stats = {
          daily: {
            totalPredictions: detailedStats.daily.totalPredictions,
            completed: detailedStats.daily.completed,
            wins: detailedStats.daily.wins,
            losses: detailedStats.daily.losses,
            winRate: detailedStats.daily.winRate,
            bySport: detailedStats.daily.bySport || {
              football: { total: 0, wins: 0, losses: 0, winRate: 0 },
              basketball: { total: 0, wins: 0, losses: 0, winRate: 0 },
              hockey: { total: 0, wins: 0, losses: 0, winRate: 0 }
            }
          },
          weekly: {
            totalPredictions: detailedStats.weekly.totalPredictions,
            completed: detailedStats.weekly.completed,
            wins: detailedStats.weekly.wins,
            losses: detailedStats.weekly.losses,
            winRate: detailedStats.weekly.winRate,
            bySport: detailedStats.weekly.bySport || {
              football: { total: 0, wins: 0, losses: 0, winRate: 0 },
              basketball: { total: 0, wins: 0, losses: 0, winRate: 0 },
              hockey: { total: 0, wins: 0, losses: 0, winRate: 0 }
            }
          },
          monthly: {
            totalPredictions: detailedStats.monthly.totalPredictions,
            completed: detailedStats.monthly.completed,
            wins: detailedStats.monthly.wins,
            losses: detailedStats.monthly.losses,
            winRate: detailedStats.monthly.winRate,
            bySport: detailedStats.monthly.bySport || {
              football: { total: 0, wins: 0, losses: 0, winRate: 0 },
              basketball: { total: 0, wins: 0, losses: 0, winRate: 0 },
              hockey: { total: 0, wins: 0, losses: 0, winRate: 0 }
            }
          },
          overall: {
            totalPredictions: detailedStats.overall.totalPredictions,
            completed: detailedStats.overall.completed,
            wins: detailedStats.overall.wins,
            losses: detailedStats.overall.losses,
            winRate: detailedStats.overall.winRate,
            bySport: detailedStats.overall.bySport || {
              football: { total: 0, wins: 0, losses: 0, winRate: 0 },
              basketball: { total: 0, wins: 0, losses: 0, winRate: 0 },
              hockey: { total: 0, wins: 0, losses: 0, winRate: 0 }
            }
          }
        };
      }
      
      // Filtrer par sport si demandé
      if (sport) {
        const sportKey = sport === 'football' ? 'football' : sport === 'basketball' ? 'basketball' : null;
        
        if (sportKey && stats) {
          stats = {
            daily: {
              ...(stats.daily?.bySport?.[sportKey] || stats.daily),
              totalPredictions: stats.daily?.bySport?.[sportKey]?.total || stats.daily?.totalPredictions || 0
            },
            weekly: {
              ...(stats.weekly?.bySport?.[sportKey] || stats.weekly),
              totalPredictions: stats.weekly?.bySport?.[sportKey]?.total || stats.weekly?.totalPredictions || 0
            },
            monthly: {
              ...(stats.monthly?.bySport?.[sportKey] || stats.monthly),
              totalPredictions: stats.monthly?.bySport?.[sportKey]?.total || stats.monthly?.totalPredictions || 0
            },
            overall: {
              ...(stats.overall?.bySport?.[sportKey] || stats.overall),
              totalPredictions: stats.overall?.bySport?.[sportKey]?.total || stats.overall?.totalPredictions || 0
            }
          };
        }
      }
      
      const info = await PredictionStore.getInfoAsync();
      const integrity = await PredictionStore.verifyIntegrityAsync();
      
      return NextResponse.json({
        // Stats par période
        daily: stats?.daily || { totalPredictions: 0, completed: 0, wins: 0, losses: 0, winRate: 0 },
        weekly: stats?.weekly || { totalPredictions: 0, completed: 0, wins: 0, losses: 0, winRate: 0 },
        monthly: stats?.monthly || { totalPredictions: 0, completed: 0, wins: 0, losses: 0, winRate: 0 },
        overall: stats?.overall || { totalPredictions: 0, completed: 0, wins: 0, losses: 0, winRate: 0 },
        // Stats par sport (nouveau)
        bySport: stats?.overall?.bySport || {
          football: { total: 0, wins: 0, losses: 0, winRate: 0 },
          basketball: { total: 0, wins: 0, losses: 0, winRate: 0 },
          hockey: { total: 0, wins: 0, losses: 0, winRate: 0 }
        },
        // Expert Advisor ratio (nouveau)
        expertAdvisor: stats?.overall?.expertAdvisor || null,
        // Filtre actif
        filter: sport ? { sport } : null,
        // Infos générales
        ...info,
        // Intégrité
        integrity: integrity.valid,
        // Source des données
        source: statsHistory && isStatsRecent ? 'github_stats_history' : 'prediction_store_realtime',
        timestamp: new Date().toISOString()
      });
    }
    
    // Statistiques détaillées complètes
    if (action === 'detailed_stats') {
      const statsHistory = await loadStatsHistory();
      const predictions = await loadPredictions();
      const stats = calculateStatsFromHistory(statsHistory, predictions);
      
      if (stats) {
        return NextResponse.json(stats);
      }
      
      // Fallback sur store local
      const localStats = PredictionStore.getDetailedStats();
      return NextResponse.json(localStats);
    }
    
    // Historique des pronostics terminés
    if (action === 'history') {
      const predictions = await loadPredictions();
      const completed = predictions?.predictions?.filter((p: any) => p.status === 'completed') || [];
      return NextResponse.json({ predictions: completed });
    }
    
    // Pronostics en attente
    if (action === 'pending') {
      const predictions = await loadPredictions();
      const pending = predictions?.predictions?.filter((p: any) => p.status === 'pending') || [];
      return NextResponse.json({ predictions: pending });
    }
    
    // Tous les pronostics
    if (action === 'all') {
      const predictions = await loadPredictions();
      const statsHistory = await loadStatsHistory();
      const stats = calculateStatsFromHistory(statsHistory, predictions);
      return NextResponse.json({ 
        predictions: predictions?.predictions || [], 
        stats 
      });
    }
    
    // Vérifier l'intégrité
    if (action === 'verify') {
      const integrity = PredictionStore.verifyIntegrity();
      return NextResponse.json(integrity);
    }
    
    return NextResponse.json({ predictions: [] });
    
  } catch (error) {
    console.error('Erreur API results GET:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * POST - Actions: sauvegarder, vérifier les résultats, nettoyer
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, predictions } = body;
    
    // Sauvegarder les pronostics du jour
    if (action === 'save_predictions') {
      if (!predictions || !Array.isArray(predictions)) {
        return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
      }
      
      const saved = PredictionStore.addMany(predictions.map(p => ({
        matchId: p.matchId,
        homeTeam: p.homeTeam,
        awayTeam: p.awayTeam,
        league: p.league || 'Unknown',
        sport: p.sport || 'Foot',
        matchDate: p.matchDate || new Date().toISOString(),
        oddsHome: p.oddsHome,
        oddsDraw: p.oddsDraw || null,
        oddsAway: p.oddsAway,
        predictedResult: p.predictedResult,
        predictedGoals: p.predictedGoals,
        predictedCards: p.predictedCards,
        confidence: p.confidence || 'medium',
        riskPercentage: p.riskPercentage || 50
      })));
      
      return NextResponse.json({
        success: true,
        message: `${saved} nouveaux pronostics enregistrés`,
        saved
      });
    }
    
    // Vérifier les résultats d'hier
    if (action === 'check_results') {
      console.log('🔍 Vérification des résultats...');
      
      const realResults = await fetchYesterdayResults();
      
      if (realResults.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'Aucun résultat disponible à vérifier',
          checked: 0,
          source: 'Football-Data API'
        });
      }
      
      const pendingPredictions = PredictionStore.getPending();
      
      let checkedCount = 0;
      let resultCorrect = 0;
      let goalsCorrect = 0;
      
      for (const prediction of pendingPredictions) {
        for (const realMatch of realResults) {
          const { found, homeScore, awayScore } = findMatchResult(
            realMatch, 
            prediction.homeTeam,
            prediction.awayTeam
          );
          
          if (found) {
            const actualResult = homeScore > awayScore ? 'home' 
              : homeScore < awayScore ? 'away' 
              : 'draw';
            
            const resultMatch = prediction.predictedResult === actualResult;
            if (resultMatch) resultCorrect++;
            
            let goalsMatch: boolean | undefined;
            
            if (prediction.predictedGoals) {
              const totalGoals = homeScore + awayScore;
              if (prediction.predictedGoals === 'over2.5') {
                goalsMatch = totalGoals > 2.5;
              } else if (prediction.predictedGoals === 'under2.5') {
                goalsMatch = totalGoals < 2.5;
              } else if (prediction.predictedGoals === 'btts') {
                goalsMatch = homeScore > 0 && awayScore > 0;
              }
              if (goalsMatch) goalsCorrect++;
            }
            
            PredictionStore.complete(prediction.matchId, {
              homeScore,
              awayScore,
              actualResult,
              resultMatch,
              goalsMatch
            });
            
            checkedCount++;
            console.log(`✅ ${prediction.homeTeam} ${homeScore}-${awayScore} ${prediction.awayTeam} - Résultat: ${resultMatch ? '✓' : '✗'}`);
            break;
          }
        }
      }
      
      // Récupérer les stats mises à jour
      const updatedStats = PredictionStore.getDetailedStats();
      
      return NextResponse.json({
        success: true,
        message: `${checkedCount} pronostics vérifiés`,
        checked: checkedCount,
        resultCorrect,
        goalsCorrect,
        source: 'Football-Data API',
        stats: updatedStats.daily
      });
    }
    
    // Nettoyer les anciennes données
    if (action === 'cleanup') {
      const removed = PredictionStore.cleanup();
      return NextResponse.json({
        success: true,
        message: `${removed} anciens pronostics supprimés`,
        removed
      });
    }
    
    // Supprimer toutes les données (reset complet)
    if (action === 'clear_all') {
      // Vérification de sécurité - nécessite un token
      const adminToken = body.token;
      const expectedToken = process.env.ADMIN_TOKEN || 'steo-admin-2026';
      
      if (adminToken !== expectedToken) {
        return NextResponse.json({ 
          error: 'Token administrateur requis' 
        }, { status: 403 });
      }
      
      const cleared = PredictionStore.clearAll();
      return NextResponse.json({
        success: cleared,
        message: cleared ? 'Toutes les données ont été supprimées' : 'Erreur lors de la suppression'
      });
    }
    
    return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
    
  } catch (error) {
    console.error('Erreur API results POST:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
