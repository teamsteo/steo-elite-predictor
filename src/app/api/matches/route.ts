import { NextResponse } from 'next/server';
import {
  getMatchesWithRealOdds,
  getDataStats,
  invalidateEspnCache,
} from '@/lib/combinedDataService';
import { getBatchPredictions, type UnifiedPrediction } from '@/lib/unifiedPredictionService';
import { getModelStatus } from '@/lib/adaptiveThresholdsML';
import {
  getBettingRecommendations,
  getBestBetTag,
  type MatchDataForRecommendation,
} from '@/lib/bettingRecommendations';
import { timingSafeEqual } from '@/lib/timingSafeEqual';

const CRON_SECRET = process.env.CRON_SECRET;
if (!CRON_SECRET) {
  console.error('[SECURITY] CRON_SECRET non configuré - endpoints write désactivés');
}

function verifyRequestAuth(request: Request): boolean {
  if (!CRON_SECRET) return false;
  const url = new URL(request.url);
  const urlSecret = url.searchParams.get('secret') || '';
  const authHeader = request.headers.get('authorization') || '';
  if (timingSafeEqual(urlSecret, CRON_SECRET)) return true;
  if (timingSafeEqual(authHeader, `Bearer ${CRON_SECRET}`)) return true;
  return false;
}

// In-memory cache for quick access
let cachedData: any = null;
let lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================
// UNIFIED MAPPER — UnifiedPrediction → Site + Telegram
// ============================================

/**
 * Convertit UnifiedPrediction en format enrichi pour le site web ET Telegram.
 * Un seul modèle, une seule source de vérité.
 */
function mapUnifiedToEnrichedMatch(p: UnifiedPrediction, rawMatch?: any): any {
  const dc = p.dixonColes;
  const ml = p.mlPrediction;
  const rec = p.recommendation;
  const factors = p.factors;
  const dq = p.dataQuality;
  const mi = factors.matchImportance;
  const ma = p.marketAlignment;

  // Probabilités finales (ML-adjusted)
  const homeProb = Math.round(ml.homeProb * 100);
  const drawProb = Math.round(ml.drawProb * 100);
  const awayProb = Math.round(ml.awayProb * 100);
  const maxProb = Math.max(homeProb, drawProb, awayProb);
  const riskPercentage = Math.round(100 - maxProb);

  // Recommendation text
  const recommendationText = rec.bet === 'home' ? p.homeTeam
    : rec.bet === 'away' ? p.awayTeam
    : rec.bet === 'draw' ? 'Match Nul' : 'À éviter';
  const betOdds = rec.bet === 'home' ? p.odds.home
    : rec.bet === 'away' ? p.odds.away
    : p.odds.draw || 3.3;
  const winProbability = rec.bet === 'home' ? homeProb
    : rec.bet === 'away' ? awayProb
    : drawProb;

  // ── Advanced Predictions (site web) ──
  const expectedGoals = dc?.expectedGoals?.total || 2.5;

  // Over/Under
  const over25 = dc?.over25 ? Math.round(dc.over25) : (expectedGoals > 2.5 ? 58 : 42);
  const under25 = 100 - over25;
  const over15 = Math.min(85, over25 + 15);
  const over35 = Math.max(20, over25 - 20);
  const over45 = Math.max(12, over25 - 35);

  // BTTS
  const bttsYes = dc?.btts ? Math.round(dc.btts * 100) : (expectedGoals > 2.3 ? 55 : 42);
  const bttsNo = 100 - bttsYes;

  // Score exact probable
  const correctScores = dc?.mostLikelyScore ? [dc.mostLikelyScore] : [];
  // Générer quelques scores alternatifs basés sur expectedGoals
  if (dc?.expectedGoals) {
    const hg = dc.expectedGoals.home;
    const ag = dc.expectedGoals.away;
    const altScores = [
      { home: Math.round(hg), away: Math.round(ag), prob: 0 },
      { home: Math.round(hg), away: Math.max(0, Math.round(ag) - 1), prob: 0 },
      { home: Math.max(0, Math.round(hg) - 1), away: Math.round(ag), prob: 0 },
    ];
    for (const s of altScores) {
      if (!correctScores.find((c: any) => c.home === s.home && c.away === s.away)) {
        correctScores.push(s);
      }
    }
  }

  // Half-time approximation (basé sur ratio buts mi-temps / fin)
  const htHome = Math.round(homeProb * 0.55 + 22);
  const htDraw = Math.round(drawProb * 1.3 + 8);
  const htAway = 100 - htHome - htDraw;

  // Double Chance
  const dc1X = homeProb + drawProb;
  const dcX2 = drawProb + awayProb;
  const dc12 = homeProb + awayProb;

  // Draw No Bet
  const dnbHome = homeProb / (homeProb + awayProb) * 100;
  const dnbAway = awayProb / (homeProb + awayProb) * 100;
  const dnbHomeOdds = homeProb + awayProb > 0 ? Math.round((100 / (dnbHome / 100)) * 100) / 100 : 1.5;
  const dnbAwayOdds = homeProb + awayProb > 0 ? Math.round((100 / (dnbAway / 100)) * 100) / 100 : 1.5;

  // ── ML Patterns (site web — from bettingRecommendations) ──
  const sport = p.sport === 'Foot' ? 'football'
    : p.sport === 'NBA' ? 'basketball'
    : p.sport === 'NHL' ? 'hockey'
    : p.sport === 'MLB' ? 'baseball' : 'football';

  let bestTag: any = null;
  let allPatterns: any[] = [];
  try {
    const matchDataForML: MatchDataForRecommendation = {
      sport: sport as any,
      homeTeam: p.homeTeam,
      awayTeam: p.awayTeam,
      league: p.league,
      oddsHome: p.odds.home,
      oddsDraw: p.odds.draw || undefined,
      oddsAway: p.odds.away,
    };
    bestTag = getBestBetTag(matchDataForML);
    const mlRecs = getBettingRecommendations(matchDataForML);
    allPatterns = mlRecs.map((r: any) => ({
      type: r.type,
      label: r.label,
      confidence: r.confidence,
      patternSource: r.patternSource,
      sampleSize: r.statistics?.sampleSize,
      successRate: r.statistics?.successRate,
      pValue: r.statistics?.pValue,
    }));
  } catch {}

  // ── Value Bets ──
  const valueBets = ml.valueBet ? [{
    type: ml.valueBetType === 'home' ? `Victoire ${p.homeTeam}`
      : ml.valueBetType === 'away' ? `Victoire ${p.awayTeam}`
        : ml.valueBetType === 'draw' ? 'Match Nul' : recommendationText,
    edge: Math.round(ml.edge * 100) / 100,
    confidence: ml.confidence,
  }] : [];

  // ── Recommendations ──
  const recommendations = [{
    type: rec.bet,
    label: recommendationText,
    probability: winProbability,
    odds: betOdds,
    value: rec.expectedValue,
    stake: rec.kellyStake,
    recommendation: rec.status === 'take' ? 'strong' : rec.status === 'consider' ? 'moderate' : 'avoid',
  }];

  // ── Data Quality ──
  const dataQuality = {
    overall: dq.hasRealOdds ? 'real' : 'estimated',
    overallScore: dq.score,
    sources: dq.sources,
    hasRealData: dq.hasRealOdds,
    hasAdvancedStats: dq.hasAdvancedStats,
  };

  // ── Risk Label ──
  let riskLabel: string;
  if (riskPercentage <= 25) riskLabel = 'Sûr';
  else if (riskPercentage <= 40) riskLabel = 'Modéré';
  else if (riskPercentage <= 55) riskLabel = 'Audacieux';
  else riskLabel = 'Kamikaze';

  // ── Status Badge ──
  let statusBadge: string;
  if (ml.confidence === 'low') statusBadge = 'REJETÉ AUTO';
  else if (rec.status === 'take') statusBadge = 'À PRENDRE';
  else statusBadge = 'À CONSIDÉRER';

  // ── Build result ──
  return {
    id: p.matchId,
    homeTeam: p.homeTeam,
    awayTeam: p.awayTeam,
    sport: p.sport === 'Foot' ? 'Foot'
      : p.sport === 'NBA' ? 'Basket'
        : p.sport === 'NHL' ? 'NHL'
          : p.sport === 'MLB' ? 'Baseball'
            : p.sport,
    sportRaw: sport,
    league: p.league || 'Unknown',
    date: rawMatch?.date || new Date().toISOString(),
    displayDate: rawMatch?.displayDate || '',
    dateTag: rawMatch?.dateTag || "aujourd'hui",
    isFinished: rawMatch?.isFinished || false,
    isEstimated: !p.odds.hasRealOdds,
    isLive: rawMatch?.isLive || false,

    // Cotes
    oddsHome: p.odds.home,
    oddsAway: p.odds.away,
    oddsDraw: p.odds.draw,
    oddsSource: p.odds.source,
    bookmaker: p.odds.bookmaker,

    // ═══════════════════════════════════════
    // PIPELINE ML UNIFIÉ — Même données que Telegram
    // ═══════════════════════════════════════

    // Probabilités ML
    probabilities: { home: homeProb, draw: drawProb, away: awayProb },
    riskPercentage,
    confidence: ml.confidence,
    riskLabel,

    // Prediction
    predictedResult: rec.bet,
    winProbability,
    recommendation: recommendationText,
    expectedValue: rec.expectedValue,

    // ═══════════════════════════════════════
    // DONNÉES SITE WEB — Options de paris
    // ═══════════════════════════════════════

    insight: {
      riskPercentage,
      confidence: ml.confidence,
      valueBetDetected: ml.valueBet,
      valueBetType: ml.valueBetType || null,
      edge: ml.edge,
    },

    // Recommendations & value bets
    recommendations,
    valueBets,

    // ML Patterns (site web)
    mlPatterns: {
      bestTag: bestTag ? {
        type: bestTag.type,
        label: bestTag.label,
        confidence: bestTag.confidence,
        reason: bestTag.reason,
        statistics: bestTag.statistics,
      } : null,
      allPatterns,
    },
    bestTag: bestTag || null,
    statusBadge,

    // ═══════════════════════════════════════
    // DONNÉES AVANCÉES — Football
    // ═══════════════════════════════════════

    // Goals prediction (from Dixon-Coles, PAS hardcoded)
    goalsPrediction: {
      total: Math.round(expectedGoals * 10) / 10,
      over25,
      under25,
      over15,
      over35,
      over45,
      bothTeamsScore: bttsYes,
      prediction: over25 >= 55 ? 'Over 2.5' : 'Under 2.5',
      // Source données
      source: dc ? 'dixon-coles' : 'estimation',
    },

    // Advanced predictions (from Dixon-Coles)
    advancedPredictions: {
      btts: { yes: bttsYes, no: bttsNo },
      correctScore: correctScores.slice(0, 5),
      halfTime: {
        home: Math.max(0, Math.min(100, htHome)),
        draw: Math.max(0, Math.min(100, htDraw)),
        away: Math.max(0, Math.min(100, htAway)),
      },
      doubleChance: {
        homeOrDraw: Math.round(dc1X),
        drawOrAway: Math.round(dcX2),
        homeOrAway: Math.round(dc12),
      },
      drawNoBet: {
        home: Math.round(dnbHome),
        away: Math.round(dnbAway),
        homeOdds: dnbHomeOdds,
        awayOdds: dnbAwayOdds,
      },
      expectedGoals: dc?.expectedGoals || null,
      overUnder: {
        over25,
        under25,
        over15,
        over35,
        over45,
      },
    },

    // Dixon-Coles raw data
    dixonColes: dc ? {
      homeProb: Math.round(dc.homeProb),
      drawProb: Math.round(dc.drawProb),
      awayProb: Math.round(dc.awayProb),
      expectedGoals: dc.expectedGoals,
      mostLikelyScore: dc.mostLikelyScore,
      btts: Math.round((dc.btts || 0) * 100),
    } : null,

    // ═══════════════════════════════════════
    // DONNÉES TELEGRAM — Enjeu & Contexte ML
    // ═══════════════════════════════════════

    // Match Importance (enjeu dynamique)
    matchImportance: mi ? {
      stakeLevel: mi.stakeLevel,
      stakeScore: mi.stakeScore,
      stakeLabel: mi.stakeLabel,
      seasonPhase: mi.seasonPhase,
      seasonPhaseLabel: mi.seasonPhaseLabel,
      competitionTypeLabel: mi.competitionTypeLabel,
      formReliable: mi.formReliable,
      formReliability: mi.formReliability,
      formReliabilityReason: mi.formReliabilityReason,
      warnings: mi.warnings,
      insights: mi.insights,
      contextSummary: mi.contextSummary || 'RAS',
    } : null,

    // ML Enriched Metadata (même format que Telegram)
    _mlEdge: ml.edge,
    _mlReasoning: rec.reasoning || [],
    _dataQuality: dq.score,
    _kellyStake: rec.kellyStake,
    _dixonColes: dc,
    _sources: dq.sources,
    _matchImportance: mi ? {
      stakeLevel: mi.stakeLevel,
      stakeScore: mi.stakeScore,
      stakeLabel: mi.stakeLabel,
      seasonPhase: mi.seasonPhase,
      seasonPhaseLabel: mi.seasonPhaseLabel,
      competitionTypeLabel: mi.competitionTypeLabel,
      formReliable: mi.formReliable,
      formReliability: mi.formReliability,
      formReliabilityReason: mi.formReliabilityReason,
      warnings: mi.warnings,
      insights: mi.insights,
      contextSummary: mi.contextSummary || 'RAS',
    } : undefined,

    // ML Analysis
    mlAnalysis: {
      probabilities: { home: homeProb, draw: drawProb, away: awayProb },
      confidence: ml.confidence,
      factors: rec.reasoning || [],
      valueBetDetected: ml.valueBet,
      recommendation: recommendationText,
      edge: ml.edge,
      kellyStake: rec.kellyStake,
      expectedValue: rec.expectedValue,
      riskLevel: rec.riskLevel,
      status: rec.status,
      statusReason: rec.statusReason,
      xgboostUsed: ml.xgboostUsed,
      xgboostScore: ml.xgboostScore,
      calibrated: ml.calibrated,
      calibrationMethod: ml.calibrationMethod,
    },

    // Context factors
    factors: {
      form: factors.form,
      h2h: factors.h2h,
      injuries: factors.injuries,
      xg: factors.xg,
      weather: factors.weather,
    },

    // Market alignment
    marketAlignment: ma,

    // Data quality
    dataQuality,

    // Timing
    generatedAt: p.generatedAt,
    processingTimeMs: p.processingTimeMs,
    source: `ML unifié (${dq.sources.length} sources)`,
  };
}

/**
 * GET - Fetch matches with UNIFIED ML predictions
 * PIPELINE UNIQUE: Même modèle que Telegram (getBatchPredictions)
 * Plus de daily-predictions.json, plus de fallback analyzeMatch()
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === 'true';

  try {
    const now = Date.now();

    // Check memory cache first
    if (!forceRefresh && cachedData && (now - lastFetchTime) < CACHE_TTL) {
      console.log('📦 Using memory cache');
      return NextResponse.json(cachedData);
    }

    console.log('🔄 Pipeline unifié: fetch matches + ML predictions...');

    // ═══════════════════════════════════════
    // ÉTAPE 1: Récupérer les matchs (ESPN → Odds API → Estimations)
    // ═══════════════════════════════════════
    if (forceRefresh) invalidateEspnCache();
    const matches = await getMatchesWithRealOdds();

    if (matches.length === 0) {
      console.log('⚠️ Aucun match disponible');
      return NextResponse.json({
        matches: [],
        timing: {
          currentHour: new Date().getUTCHours(),
          canRefresh: true,
          nextRefreshTime: '5 min',
          message: 'Aucun match disponible',
        },
        dataStats: { total: 0, withRealOdds: 0, highConfidence: 0, valueBets: 0, bySport: {}, byRisk: {} },
        mlStatus: getModelStatus(),
        lastUpdate: new Date().toISOString(),
      });
    }

    // ═══════════════════════════════════════
    // ÉTAPE 2: Pipeline ML unifié (même que Telegram)
    // ═══════════════════════════════════════
    const upcomingWithOdds = matches.filter((m: any) =>
      !m.isFinished && !m.isEstimated && m.oddsHome > 0 && m.oddsAway > 0
    );

    // Mapper vers UnifiedPredictionInput
    const mlInputs = upcomingWithOdds.map((m: any) => ({
      id: m.id || `espn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      sport: m.sport === 'Basketball' ? 'NBA' as const
        : m.sport === 'Hockey' ? 'NHL' as const
          : m.sport === 'Baseball' ? 'MLB' as const
            : 'Foot' as const,
      league: m.league || 'Unknown',
      oddsHome: m.oddsHome,
      oddsDraw: m.oddsDraw || null,
      oddsAway: m.oddsAway,
    }));

    // Exécuter le pipeline ML unifié
    let unifiedPreds: UnifiedPrediction[] = [];
    try {
      unifiedPreds = await getBatchPredictions(mlInputs);
      console.log(`🧠 Pipeline ML: ${unifiedPreds.length} prédictions calculées`);
    } catch (mlErr: any) {
      console.log(`⚠️ Pipeline ML échoué (${mlErr.message})`);
    }

    // ═══════════════════════════════════════
    // ÉTAPE 3: Mapper vers le format enrichi (site + telegram)
    // ═══════════════════════════════════════

    // Build a lookup map from prediction
    const predMap = new Map<string, UnifiedPrediction>();
    for (const pred of unifiedPreds) {
      predMap.set(`${pred.homeTeam}|${pred.awayTeam}`, pred);
    }

    // Enrichir TOUS les matchs (même ceux sans prédiction ML)
    const enrichedMatches = matches.map((match: any) => {
      const pred = predMap.get(`${match.homeTeam}|${match.awayTeam}`);

      if (pred) {
        // Match avec pipeline ML complet
        return mapUnifiedToEnrichedMatch(pred, match);
      }

      // Match sans prédiction ML (estimé, terminé, ou sans cotes)
      // → données basiques depuis les cotes
      const totalImplied = (1 / (match.oddsHome || 2)) + (1 / (match.oddsAway || 2)) + (match.oddsDraw && match.oddsDraw > 1 ? 1 / match.oddsDraw : 0);
      const homeProb = Math.round((1 / (match.oddsHome || 2)) / totalImplied * 100);
      const drawProb = match.oddsDraw && match.oddsDraw > 1 ? Math.round((1 / match.oddsDraw) / totalImplied * 100) : 28;
      const awayProb = 100 - homeProb - drawProb;
      const maxProb = Math.max(homeProb, awayProb, drawProb);

      return {
        id: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        sport: match.sport || 'Foot',
        sportRaw: 'football',
        league: match.league || 'Unknown',
        date: match.date,
        displayDate: match.displayDate || '',
        dateTag: match.dateTag || "aujourd'hui",
        isFinished: match.isFinished || false,
        isLive: match.isLive || false,
        oddsHome: match.oddsHome || 0,
        oddsAway: match.oddsAway || 0,
        oddsDraw: match.oddsDraw || null,
        probabilities: { home: homeProb, draw: drawProb, away: awayProb },
        riskPercentage: 100 - maxProb,
        confidence: maxProb >= 65 ? 'medium' : 'low',
        riskLabel: maxProb >= 75 ? 'Sûr' : maxProb >= 60 ? 'Modéré' : 'Audaceux',
        insight: {
          riskPercentage: 100 - maxProb,
          confidence: maxProb >= 65 ? 'medium' : 'low',
          valueBetDetected: false,
          valueBetType: null,
          edge: 0,
        },
        recommendations: [],
        valueBets: [],
        goalsPrediction: {
          total: 2.5, over25: 55, under25: 45, over15: 75, over35: 35, over45: 20,
          bothTeamsScore: 50, prediction: 'Over 2.5', source: 'estimation',
        },
        advancedPredictions: {
          btts: { yes: 50, no: 50 },
          correctScore: [],
          halfTime: { home: 35, draw: 30, away: 35 },
          doubleChance: { homeOrDraw: homeProb + drawProb, drawOrAway: drawProb + awayProb, homeOrAway: homeProb + awayProb },
          drawNoBet: { home: 50, away: 50, homeOdds: 1.5, awayOdds: 1.5 },
          expectedGoals: null,
          overUnder: { over25: 55, under25: 45, over15: 75, over35: 35, over45: 20 },
        },
        dataQuality: {
          overall: match.isEstimated ? 'estimated' : 'real',
          overallScore: match.isEstimated ? 40 : 70,
          sources: match.isEstimated ? ['Estimation'] : ['ESPN'],
          hasRealData: !match.isEstimated,
        },
        source: 'cotes-brutes',
        mlAnalysis: null,
        matchImportance: null,
        bestTag: null,
        statusBadge: match.isEstimated ? 'DONNÉES LIMITÉES' : 'À CONSIDÉRER',
      };
    });

    // ═══════════════════════════════════════
    // ÉTAPE 4: Stats résumées
    // ═══════════════════════════════════════
    const bySport: Record<string, number> = {};
    const byRisk: Record<string, number> = { 'Sûr': 0, 'Modéré': 0, 'Audacieux': 0, 'Kamikaze': 0 };
    for (const m of enrichedMatches) {
      const s = m.sport || 'Foot';
      bySport[s] = (bySport[s] || 0) + 1;
      const r = m.riskLabel || 'Modéré';
      if (r in byRisk) byRisk[r]++;
    }

    const dataStats = {
      total: enrichedMatches.length,
      withRealOdds: enrichedMatches.filter((m: any) => m.oddsHome > 1 && m.oddsAway > 1 && !m.isEstimated).length,
      highConfidence: enrichedMatches.filter((m: any) => m.confidence === 'high' || m.confidence === 'very_high').length,
      valueBets: enrichedMatches.filter((m: any) => m.valueBets?.length > 0).length,
      mlAnalyzed: unifiedPreds.length,
      bySport,
      byRisk,
    };

    console.log(`✅ ${enrichedMatches.length} matchs chargés (${dataStats.withRealOdds} cotes réelles, ${dataStats.highConfidence} haute confiance, ${dataStats.valueBets} value bets)`);

    const result = {
      matches: enrichedMatches,
      timing: {
        currentHour: new Date().getUTCHours(),
        canRefresh: true,
        nextRefreshTime: '5 min',
        message: `${enrichedMatches.length} matchs (${dataStats.mlAnalyzed} analysés ML)`,
        source: 'pipeline-unifié',
      },
      dataStats,
      mlStatus: getModelStatus(),
      lastUpdate: new Date().toISOString(),
    };

    // Update memory cache
    cachedData = result;
    lastFetchTime = now;

    return NextResponse.json(result);
  } catch (error) {
    console.error('API matches error:', error);
    return NextResponse.json({
      error: 'Connection error',
      matches: [],
      timing: {
        currentHour: new Date().getUTCHours(),
        canRefresh: false,
        nextRefreshTime: '5 min',
        message: 'Erreur de chargement',
      },
      dataStats: { total: 0, withRealOdds: 0, highConfidence: 0, valueBets: 0, bySport: {}, byRisk: {} },
      mlStatus: null,
    });
  }
}

/**
 * POST - Clear cache and force refresh
 */
export async function POST(request: Request) {
  if (!verifyRequestAuth(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  try {
    console.log('🔄 Cache clear requested');
    cachedData = null;
    lastFetchTime = 0;
    return NextResponse.json({ success: true, message: 'Cache cleared' });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({ success: false, error: 'Clear failed' });
  }
}
