/**
 * MLB API - Prédictions Baseball avec Sabermetrics
 *
 * Source: ESPN API pour matchs + MLB Stats API pour lanceurs
 * Modèle: Pythagorean Expectation + FIP + OPS + Bullpen
 */

import { NextResponse } from 'next/server';
import {
  predictMLBMatch,
  generateDefaultTeamStats,
  calculatePythagoreanExpectation,
  type MLBMatch,
  type MLBTeam,
  type MLBPitcher,
} from '@/lib/mlbModel';
import {
  fetchMLBSchedule,
  fetchMultiplePitcherStats,
  buildPitcherFromMLBStats,
  normalizeTeamAbbr,
} from '@/lib/mlbPitcherService';
import {
  getMLBProjection,
  getMLBMarketEdges,
  type MLBProjection,
  type MLBMarketEdge,
} from '@/lib/mlbProjectionEngine';
import {
  decideFromEngine,
  type V3Decision,
} from '@/lib/v3DecisionLayer';

// ============================================
// INTERFACES ESPN
// ============================================

interface ESPNMLBEvent {
  id: string;
  date: string;
  name: string;
  status: {
    type: {
      state: string;
      name: string;
      completed: boolean;
      shortDetail: string;
    };
    inning?: number;
    period?: number;
    displayClock?: string;
  };
  competitions: Array<{
    venue?: { displayName: string };
    competitors: Array<{
      homeAway: string;
      score: string;
      winner?: boolean;
      team: {
        id: string;
        displayName: string;
        shortDisplayName: string;
        abbreviation: string;
        location: string;
        color: string;
      };
      records?: Array<{ summary: string; type: string }>;
      pitchers?: {
        starter?: {
          athlete: {
            id: string;
            displayName: string;
            handedness: { displayValue: string };
          };
          stats?: Array<{ name: string; value: number | string }>;
        };
      };
    }>;
    odds?: Array<{
      provider: { name: string };
      details: string;
      homeTeamOdds?: { moneyLine: number; total: number };
      awayTeamOdds?: { moneyLine: number };
    }>;
  }>;
}

// ============================================
// CONSTANTES
// ============================================

const ESPN_MLB_URL = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard';

// Équipes MLB connues avec stats estimées
const MLB_TEAMS_BASE: Record<string, Partial<MLBTeam>> = {
  // American League East
  'NYY': { name: 'New York Yankees', league: 'AL', division: 'East', era: 3.75, ops: 0.780 },
  'BOS': { name: 'Boston Red Sox', league: 'AL', division: 'East', era: 4.10, ops: 0.750 },
  'TB':  { name: 'Tampa Bay Rays', league: 'AL', division: 'East', era: 3.60, ops: 0.720 },
  'TOR': { name: 'Toronto Blue Jays', league: 'AL', division: 'East', era: 4.00, ops: 0.760 },
  'BAL': { name: 'Baltimore Orioles', league: 'AL', division: 'East', era: 3.85, ops: 0.770 },

  // American League Central
  'CLE': { name: 'Cleveland Guardians', league: 'AL', division: 'Central', era: 3.70, ops: 0.710 },
  'DET': { name: 'Detroit Tigers', league: 'AL', division: 'Central', era: 4.20, ops: 0.690 },
  'KC':  { name: 'Kansas City Royals', league: 'AL', division: 'Central', era: 4.30, ops: 0.700 },
  'MIN': { name: 'Minnesota Twins', league: 'AL', division: 'Central', era: 3.95, ops: 0.740 },
  'CWS': { name: 'Chicago White Sox', league: 'AL', division: 'Central', era: 4.50, ops: 0.680 },

  // American League West
  'HOU': { name: 'Houston Astros', league: 'AL', division: 'West', era: 3.65, ops: 0.770 },
  'TEX': { name: 'Texas Rangers', league: 'AL', division: 'West', era: 3.90, ops: 0.780 },
  'SEA': { name: 'Seattle Mariners', league: 'AL', division: 'West', era: 3.75, ops: 0.710 },
  'LAA': { name: 'Los Angeles Angels', league: 'AL', division: 'West', era: 4.40, ops: 0.740 },
  'OAK': { name: 'Athletics', league: 'AL', division: 'West', era: 4.60, ops: 0.670 },

  // National League East
  'ATL': { name: 'Atlanta Braves', league: 'NL', division: 'East', era: 3.70, ops: 0.790 },
  'NYM': { name: 'New York Mets', league: 'NL', division: 'East', era: 3.85, ops: 0.730 },
  'PHI': { name: 'Philadelphia Phillies', league: 'NL', division: 'East', era: 3.75, ops: 0.760 },
  'MIA': { name: 'Miami Marlins', league: 'NL', division: 'East', era: 4.00, ops: 0.680 },
  'WSH': { name: 'Washington Nationals', league: 'NL', division: 'East', era: 4.30, ops: 0.700 },

  // National League Central
  'MIL': { name: 'Milwaukee Brewers', league: 'NL', division: 'Central', era: 3.65, ops: 0.720 },
  'CHC': { name: 'Chicago Cubs', league: 'NL', division: 'Central', era: 3.95, ops: 0.750 },
  'STL': { name: 'St. Louis Cardinals', league: 'NL', division: 'Central', era: 4.10, ops: 0.740 },
  'CIN': { name: 'Cincinnati Reds', league: 'NL', division: 'Central', era: 4.25, ops: 0.760 },
  'PIT': { name: 'Pittsburgh Pirates', league: 'NL', division: 'Central', era: 4.20, ops: 0.690 },

  // National League West
  'LAD': { name: 'Los Angeles Dodgers', league: 'NL', division: 'West', era: 3.50, ops: 0.810 },
  'SD':  { name: 'San Diego Padres', league: 'NL', division: 'West', era: 3.80, ops: 0.750 },
  'SF':  { name: 'San Francisco Giants', league: 'NL', division: 'West', era: 4.00, ops: 0.730 },
  'ARI': { name: 'Arizona Diamondbacks', league: 'NL', division: 'West', era: 3.90, ops: 0.770 },
  'COL': { name: 'Colorado Rockies', league: 'NL', division: 'West', era: 5.10, ops: 0.720 },
};

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Convertit les cotes américaines en décimales
 */
function americanToDecimal(americanOdds: number | string | undefined): number {
  if (!americanOdds) return 0;

  const odds = typeof americanOdds === 'string'
    ? parseFloat(americanOdds.replace('+', ''))
    : americanOdds;

  if (isNaN(odds) || odds === 0) return 0;

  if (odds > 0) {
    return Math.round((1 + odds / 100) * 100) / 100;
  } else {
    return Math.round((1 + 100 / Math.abs(odds)) * 100) / 100;
  }
}

/**
 * Construit un objet MLBTeam à partir des données ESPN
 */
function buildTeamFromESPN(
  competitor: any,
  teamAbbr: string
): MLBTeam {
  const baseTeam = MLB_TEAMS_BASE[teamAbbr] || {};
  const displayName = competitor.team?.displayName || baseTeam.name || 'Unknown';

  // Extraire le record
  const recordSummary = competitor.records?.find((r: any) => r.type === 'total')?.summary || '0-0';
  const [wins, losses] = recordSummary.split('-').map(Number);

  // Estimer les stats si pas de base
  const gamesPlayed = (wins || 0) + (losses || 0) || 162;

  return {
    id: competitor.team?.id || teamAbbr,
    name: displayName,
    abbreviation: teamAbbr,
    city: competitor.team?.location || baseTeam.name?.split(' ')[0] || '',
    league: baseTeam.league || 'AL',
    division: baseTeam.division || 'East',

    // Stats offense
    runsScored: Math.round((baseTeam.ops || 0.720) / 0.720 * 750),
    gamesPlayed,
    battingAverage: 0.250,
    onBasePercentage: (baseTeam.ops || 0.720) * 0.44,
    sluggingPercentage: (baseTeam.ops || 0.720) * 0.56,
    ops: baseTeam.ops || 0.720,
    homeRuns: Math.round((baseTeam.ops || 0.720) / 0.720 * 200),

    // Stats pitching
    runsAllowed: Math.round(4.15 / (baseTeam.era || 4.15) * 700),
    era: baseTeam.era || 4.15,
    whip: (baseTeam.era || 4.15) / 4.15 * 1.30,
    strikeouts: 1400,
    walks: 500,

    // Stats avancées
    pythagoreanWinPct: calculatePythagoreanExpectation(
      Math.round((baseTeam.ops || 0.720) / 0.720 * 750),
      Math.round(4.15 / (baseTeam.era || 4.15) * 700)
    ),
    runDifferential: Math.round(((baseTeam.ops || 0.720) / 0.720 * 750) - (4.15 / (baseTeam.era || 4.15) * 700)),

    // Forme récente
    last10: Math.round(5 + (baseTeam.ops || 0.720) / 0.720 * 2 - (baseTeam.era || 4.15) / 4.15 * 2),
    streak: '',

    // Home/Away
    homeRecord: competitor.records?.find((r: any) => r.type === 'home')?.summary || '40-41',
    awayRecord: competitor.records?.find((r: any) => r.type === 'away')?.summary || '40-41',
  };
}

/**
 * Construit un objet MLBPitcher à partir des données ESPN
 */
function buildPitcherFromESPN(
  starterData: any,
  teamAbbr: string
): MLBPitcher | undefined {
  if (!starterData?.athlete) return undefined;

  const athlete = starterData.athlete;
  const stats = starterData.stats || [];

  const getStat = (name: string): number => {
    const stat = stats.find((s: any) => s.name === name);
    return stat ? parseFloat(String(stat.value)) || 0 : 0;
  };

  return {
    id: athlete.id,
    name: athlete.displayName,
    teamId: teamAbbr,
    handedness: athlete.handedness?.displayValue === 'Left' ? 'L' : 'R',

    era: getStat('earnedRunAverage') || 4.15,
    whip: getStat('walksAndHitsPerInningPitched') || 1.30,
    wins: getStat('wins') || 0,
    losses: getStat('losses') || 0,
    inningsPitched: getStat('inningsPitched') || 100,
    strikeouts: getStat('strikeouts') || 100,
    walks: getStat('basesOnBalls') || 40,
    homeRunsAllowed: getStat('homeRunsAllowed') || 20,
    battingAverageAgainst: getStat('battingAverageAgainst') || 0.250,

    fip: getStat('fieldingIndependentPitching') || 4.15,
    eraMinus: 100,
    strikeoutRate: getStat('strikeoutsPer9Innings') || 9.0,
    walkRate: getStat('walksPer9Innings') || 3.0,

    recentEra: getStat('earnedRunAverage') || 4.15,
    recentInnings: getStat('inningsPitched') || 100,
  };
}

// ============================================
// FETCH ESPN DATA
// ============================================

async function fetchMLBGames(): Promise<ESPNMLBEvent[]> {
  try {
    const today = new Date().toISOString().split('-').join('').slice(0, 8);

    const response = await fetch(
      `${ESPN_MLB_URL}?dates=${today}`,
      {
        next: { revalidate: 300 }, // 5 min cache
        headers: { 'Accept': 'application/json' }
      }
    );

    if (!response.ok) {
      console.log(`⚠️ ESPN MLB error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.events || [];

  } catch (error) {
    console.error('Erreur fetch ESPN MLB:', error);
    return [];
  }
}

/**
 * V4-lite (Task 41, BADJAN V3): cotes RÉELLES ESPN (DraftKings) par équipe.
 * Map displayName normalisé → { oddsHome, oddsAway, hasRealOdds, bookmaker }.
 * Utilisée pour la couche décision V3 (jamais de value sur cotes estimées).
 */
function buildRealOddsMap(events: ESPNMLBEvent[]): Map<string, { oddsHome: number; oddsAway: number; bookmaker: string }> {
  const map = new Map<string, { oddsHome: number; oddsAway: number; bookmaker: string }>();
  for (const e of events || []) {
    const comp = e.competitions?.[0];
    if (!comp?.odds?.length) continue;
    const odd = comp.odds[0];
    const homeOdds = americanToDecimal(odd.homeTeamOdds?.moneyLine);
    const awayOdds = americanToDecimal(odd.awayTeamOdds?.moneyLine);
    if (homeOdds <= 1 || awayOdds <= 1) continue;
    for (const c of comp.competitors || []) {
      const name = c?.team?.displayName;
      if (!name) continue;
      const key = name.toLowerCase().replace(/[^a-z]/g, '');
      if (!map.has(key)) {
        map.set(key, { oddsHome: homeOdds, oddsAway: awayOdds, bookmaker: odd.provider?.name || 'ESPN' });
      }
    }
  }
  return map;
}

// ============================================
// API ROUTE
// ============================================

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';

    console.log('⚾ MLB API: Récupération des matchs avec lanceurs...');

    // Récupérer les matchs depuis MLB Stats API (inclut les lanceurs probables)
    const mlbGames = await fetchMLBSchedule();

    if (mlbGames.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucun match MLB prévu aujourd\'hui',
        predictions: [],
        stats: { total: 0 },
        source: 'MLB Stats API',
      });
    }

    // V4-lite (Task 41): cotes RÉELLES ESPN + engine indépendante
    const espnEvents = await fetchMLBGames();
    const realOddsMap = buildRealOddsMap(espnEvents);

    // Collecter tous les IDs de lanceurs
    const pitcherIds: number[] = [];
    const pitcherNames: string[] = [];
    for (const game of mlbGames) {
      if (game.teams?.away?.probablePitcher?.id) {
        pitcherIds.push(game.teams.away.probablePitcher.id);
        pitcherNames.push(`${game.teams.away.probablePitcher.fullName} (${game.teams.away.team?.abbreviation})`);
      }
      if (game.teams?.home?.probablePitcher?.id) {
        pitcherIds.push(game.teams.home.probablePitcher.id);
        pitcherNames.push(`${game.teams.home.probablePitcher.fullName} (${game.teams.home.team?.abbreviation})`);
      }
    }

    // Récupérer les stats de tous les lanceurs en parallèle
    console.log(`⚾ Lanceurs probables: ${pitcherNames.slice(0, 5).join(', ')}${pitcherNames.length > 5 ? '...' : ''}`);
    const pitcherStats = await fetchMultiplePitcherStats(pitcherIds);
    console.log(`✅ Stats récupérées pour ${pitcherStats.size} lanceurs`);

    const predictions: any[] = [];
    const now = new Date();

    for (const game of mlbGames) {
      // Status
      const isLive = game.status?.statusCode === 'I' || game.status?.abstractGameState === 'Live';
      const isFinished = game.status?.statusCode === 'F' || game.status?.detailedState === 'Final';

      // Filtrer les matchs terminés
      if (isFinished) continue;

      // Vérifier si le match a déjà commencé
      const matchDate = new Date(game.gameDate);
      if (!isLive && matchDate.getTime() < now.getTime()) {
        const matchStartWithMargin = new Date(matchDate.getTime() + 5 * 60 * 1000);
        if (now > matchStartWithMargin) continue;
      }

      const awayTeam = game.teams?.away;
      const homeTeam = game.teams?.home;

      if (!awayTeam || !homeTeam) continue;

      // Normaliser les abréviations
      const homeAbbr = normalizeTeamAbbr(homeTeam.team?.abbreviation || '');
      const awayAbbr = normalizeTeamAbbr(awayTeam.team?.abbreviation || '');

      // Construire les équipes
      const home = buildTeamFromESPN({ team: homeTeam.team, records: [] }, homeAbbr);
      const away = buildTeamFromESPN({ team: awayTeam.team, records: [] }, awayAbbr);

      // Construire les lanceurs avec leurs stats réelles
      const homePitcherId = homeTeam.probablePitcher?.id;
      const awayPitcherId = awayTeam.probablePitcher?.id;

      const homePitcherStats = homePitcherId ? pitcherStats.get(homePitcherId) : null;
      const awayPitcherStats = awayPitcherId ? pitcherStats.get(awayPitcherId) : null;

      const homePitcher = buildPitcherFromMLBStats(
        homeTeam.probablePitcher,
        homeAbbr,
        homePitcherStats
      );

      const awayPitcher = buildPitcherFromMLBStats(
        awayTeam.probablePitcher,
        awayAbbr,
        awayPitcherStats
      );

      // Estimer les cotes
      const homeWinBase = home.pythagoreanWinPct + 0.02;
      let oddsHome = Math.round((1 / homeWinBase) * 100) / 100;
      let oddsAway = Math.round((1 / (1 - homeWinBase)) * 100) / 100;
      const totalRuns = 8.5;

      // Créer l'objet match
      const match: MLBMatch = {
        id: `mlb_${game.gamePk}`,
        homeTeam: home,
        awayTeam: away,
        homePitcher,
        awayPitcher,
        date: game.gameDate,
        time: new Date(game.gameDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        venue: '',
        oddsHome,
        oddsAway,
        totalRuns,
        isLive,
        isFinished,
        homeScore: undefined,
        awayScore: undefined,
        inning: undefined,
      };

      // Générer la prédiction
      const teamStats: Record<string, Partial<MLBTeam>> = {
        [homeAbbr]: home,
        [awayAbbr]: away,
      };

      const pitcherStatsMap: Record<string, Partial<MLBPitcher>> = {};
      if (homePitcher) pitcherStatsMap[homePitcher.id] = homePitcher;
      if (awayPitcher) pitcherStatsMap[awayPitcher.id] = awayPitcher;

      const prediction = predictMLBMatch(match, teamStats, pitcherStatsMap);

      // ── V4-lite (Task 41, BADJAN V3): engine indépendante + décision V3 ──
      // ÉTAPES 2-3: proba sportive PURE (runs réels ESPN + lanceurs réels).
      // ÉTAPES 5-7: cotes RÉELLES ESPN → devig → Écart → EV → RETENIR/SURVEILLER/REJETER.
      // Fail-closed: engine indisponible → prédiction historique inchangée.
      let engine: MLBProjection | null = null;
      let engineMarkets: MLBMarketEdge[] = [];
      let v3Decision: V3Decision | null = null;
      try {
        engine = await getMLBProjection(
          homeTeam.team?.name || home.name,
          awayTeam.team?.name || away.name,
          new Date(game.gameDate).toISOString().split('T')[0]
        );
        if (engine) {
          engineMarkets = getMLBMarketEdges(engine, { total: totalRuns });
          const realOdds = realOddsMap.get((homeTeam.team?.name || home.name).toLowerCase().replace(/[^a-z]/g, ''));
          const oddsH = realOdds?.oddsHome || oddsHome;
          const oddsA = realOdds?.oddsAway || oddsAway;
          const hasRealOdds = realOdds != null;
          v3Decision = decideFromEngine(
            'MLB',
            homeTeam.team?.name || home.name,
            awayTeam.team?.name || away.name,
            engine.homeWinProb,
            oddsH,
            oddsA,
            engine.shrinkFactor,
            hasRealOdds,
            !engine.homeStarter || !engine.awayStarter,
            engine.dataBasis
          );
          console.log(
            `⚾ Engine V4 ${homeTeam.team?.name}: proj ${engine.homeExpectedRuns}-${engine.awayExpectedRuns}` +
            ` P(home) ${(engine.homeWinProb * 100).toFixed(0)}% → V3 ${v3Decision.category}` +
            ` (écart ${v3Decision.gapPp > 0 ? '+' : ''}${v3Decision.gapPp}pp, EV ${v3Decision.ev > 0 ? '+' : ''}${v3Decision.ev}%${hasRealOdds ? '' : ', cotes estimées → REJETER'})`
          );
        }
      } catch (e) {
        console.log('⚠️ Engine V4 MLB erreur (fail-closed):', e);
        engine = null;
      }

      // Engine disponible → les probas affichées deviennent celles de l'engine
      // (données RÉELLES) au lieu des stats statiques. Shape identique pour le site.
      if (engine) {
        const engineFavorsHome = engine.homeWinProb >= 0.5;
        prediction.predictedWinner = engineFavorsHome ? 'home' : 'away';
        prediction.winnerTeam = engineFavorsHome ? home.name : away.name;
        prediction.winnerProb = Math.round((engineFavorsHome ? engine.homeWinProb : engine.awayWinProb) * 100);
        prediction.projectedHomeRuns = engine.homeExpectedRuns;
        prediction.projectedAwayRuns = engine.awayExpectedRuns;
        prediction.projectedTotal = engine.expectedTotal;
        prediction.moneyline.homeProb = Math.round(engine.homeWinProb * 1000) / 10;
        prediction.moneyline.awayProb = Math.round(engine.awayWinProb * 1000) / 10;
        // Value bet = décision V3 RETENIR uniquement (jamais sur cotes estimées)
        prediction.moneyline.valueBet = {
          detected: v3Decision?.category === 'RETENIR',
          type: v3Decision?.category === 'RETENIR' ? v3Decision.side : null,
          edge: v3Decision ? v3Decision.gapPp / 100 : 0,
        };
        prediction.confidence = v3Decision?.category === 'RETENIR'
          ? 'high'
          : v3Decision?.category === 'SURVEILLER' ? 'medium' : 'low';
      }

      predictions.push({
        ...match,
        prediction,
        engine: engine ? {
          homeExpectedRuns: engine.homeExpectedRuns,
          awayExpectedRuns: engine.awayExpectedRuns,
          expectedTotal: engine.expectedTotal,
          expectedMargin: engine.expectedMargin,
          homeWinProb: engine.homeWinProb,
          awayWinProb: engine.awayWinProb,
          intervalTotal70: engine.intervalTotal70,
          homeStarter: engine.homeStarter,
          awayStarter: engine.awayStarter,
          shrinkFactor: engine.shrinkFactor,
          dataBasis: engine.dataBasis,
          markets: engineMarkets,
        } : undefined,
        v3Decision: v3Decision ?? undefined,
        insight: {
          riskPercentage: 100 - prediction.winnerProb,
          confidence: prediction.confidence,
          valueBetDetected: prediction.moneyline.valueBet.detected,
          valueBetType: prediction.moneyline.valueBet.type,
        },
      });
    }

    // Filtrer si demandé
    let filtered = predictions;
    if (filter === 'live') {
      filtered = predictions.filter(p => p.isLive);
    } else if (filter === 'value') {
      filtered = predictions.filter(p => p.prediction.moneyline.valueBet.detected);
    } else if (filter === 'high_confidence') {
      filtered = predictions.filter(p =>
        p.prediction.confidence === 'very_high' || p.prediction.confidence === 'high'
      );
    }

    // Stats
    const stats = {
      total: predictions.length,
      live: predictions.filter(p => p.isLive).length,
      upcoming: predictions.filter(p => !p.isLive && !p.isFinished).length,
      valueBets: predictions.filter(p => p.prediction.moneyline.valueBet.detected).length,
      highConfidence: predictions.filter(p =>
        p.prediction.confidence === 'very_high' || p.prediction.confidence === 'high'
      ).length,
      byConfidence: {
        very_high: predictions.filter(p => p.prediction.confidence === 'very_high').length,
        high: predictions.filter(p => p.prediction.confidence === 'high').length,
        medium: predictions.filter(p => p.prediction.confidence === 'medium').length,
        low: predictions.filter(p => p.prediction.confidence === 'low').length,
      },
      pitchersFound: pitcherStats.size,
    };

    console.log(`✅ MLB: ${predictions.length} matchs analysés (${stats.pitchersFound} lanceurs avec stats)`);

    return NextResponse.json({
      success: true,
      predictions: filtered,
      stats,
      source: 'MLB Stats API (Gratuit)',
      methodology: {
        name: 'Sabermetrics ML v1.0',
        features: [
          'Pythagorean Expectation (Bill James)',
          'FIP - Fielding Independent Pitching',
          'OPS+ / wRC+ - Offensive Production',
          'Starting Pitcher Matchup',
          'Home Field Advantage (~54%)',
          'Recent Form (Last 10)',
        ],
        weights: {
          pythagorean: '25%',
          pitching: '25%',
          offense: '20%',
          homeField: '10%',
          recentForm: '15%',
          bullpen: '5%',
        },
      },
      lastUpdate: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Erreur API MLB:', error);
    return NextResponse.json({
      success: false,
      error: 'Erreur serveur',
      predictions: [],
    }, { status: 500 });
  }
}

/**
 * POST - Force refresh
 */
export async function POST() {
  return GET(new Request('http://localhost/api/mlb'));
}
