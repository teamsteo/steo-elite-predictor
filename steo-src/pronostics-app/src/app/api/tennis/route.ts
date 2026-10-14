import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

/**
 * API Tennis - Prédictions ML avancées
 * Version robuste avec fallback instantané
 */

// ============================================
// INTERFACES
// ============================================

interface TennisPrediction {
  matchId: string;
  player1: string;
  player2: string;
  tournament: string;
  surface: 'hard' | 'clay' | 'grass' | 'carpet';
  round: string;
  date: string;
  odds1: number;
  odds2: number;
  category: 'atp' | 'wta' | 'challenger' | 'itf';
  prediction: {
    winner: 'player1' | 'player2';
    winProbability: number;
    confidence: 'very_high' | 'high' | 'medium' | 'low';
    riskPercentage: number;
  };
  betting: {
    recommendedBet: boolean;
    kellyStake: number;
    winnerOdds: number;
    expectedValue: number;
  };
  analysis: {
    rankingAdvantage: string;
    surfaceAdvantage: string;
    formAdvantage: string;
    h2hAdvantage: string;
    oddsValue: string;
  };
  keyFactors: string[];
  warnings: string[];
}

// ============================================
// DONNÉES DE DÉMO POUR FALLBACK
// ============================================

function getDemoPredictions(): TennisPrediction[] {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  return [
    // ATP - Roland Garros
    {
      matchId: 'demo_atp_1',
      player1: 'Jannik Sinner',
      player2: 'Carlos Alcaraz',
      tournament: 'Roland Garros',
      surface: 'clay',
      round: 'Quarts de finale',
      date: today,
      odds1: 2.10,
      odds2: 1.75,
      category: 'atp',
      prediction: {
        winner: 'player2',
        winProbability: 65,
        confidence: 'high',
        riskPercentage: 25
      },
      betting: {
        recommendedBet: true,
        kellyStake: 3,
        winnerOdds: 1.75,
        expectedValue: 12
      },
      analysis: {
        rankingAdvantage: 'Sinner #1 vs Alcaraz #3',
        surfaceAdvantage: 'Alcaraz excellent sur terre battue',
        formAdvantage: 'Alcaraz: 8V-2D sur ses 10 derniers matchs',
        h2hAdvantage: 'Alcaraz mène 4-3',
        oddsValue: 'Cote Alcaraz: 1.75 - Value détectée'
      },
      keyFactors: ['Surface favorable à Alcaraz', 'H2H positif', 'Forme récente excellente'],
      warnings: ['Match serré attendu']
    },
    {
      matchId: 'demo_atp_2',
      player1: 'Novak Djokovic',
      player2: 'Alexander Zverev',
      tournament: 'Roland Garros',
      surface: 'clay',
      round: 'Quarts de finale',
      date: today,
      odds1: 1.65,
      odds2: 2.25,
      category: 'atp',
      prediction: {
        winner: 'player1',
        winProbability: 68,
        confidence: 'high',
        riskPercentage: 22
      },
      betting: {
        recommendedBet: true,
        kellyStake: 4,
        winnerOdds: 1.65,
        expectedValue: 8
      },
      analysis: {
        rankingAdvantage: 'Djokovic #7 vs Zverev #2',
        surfaceAdvantage: 'Djokovic 3 titres à Roland Garros',
        formAdvantage: 'Djokovic: 7V-3D sur ses 10 derniers matchs',
        h2hAdvantage: 'Djokovic mène 8-4',
        oddsValue: 'Cote Djokovic: 1.65 - Value modérée'
      },
      keyFactors: ['Expérience Grand Chelem', 'H2H favorable', 'Surface maîtrisée'],
      warnings: ['Djokovic 39 ans - fatigue possible']
    },
    // WTA
    {
      matchId: 'demo_wta_1',
      player1: 'Aryna Sabalenka',
      player2: 'Iga Swiatek',
      tournament: 'Roland Garros',
      surface: 'clay',
      round: 'Demi-finale',
      date: today,
      odds1: 2.40,
      odds2: 1.55,
      category: 'wta',
      prediction: {
        winner: 'player2',
        winProbability: 70,
        confidence: 'high',
        riskPercentage: 20
      },
      betting: {
        recommendedBet: true,
        kellyStake: 4,
        winnerOdds: 1.55,
        expectedValue: 6
      },
      analysis: {
        rankingAdvantage: 'Sabalenka #1 vs Swiatek #2',
        surfaceAdvantage: 'Swiatek 4 titres à Roland Garros',
        formAdvantage: 'Swiatek: 9V-1D sur terre battue en 2026',
        h2hAdvantage: 'Swiatek mène 6-3',
        oddsValue: 'Cote Swiatek: 1.55 - Value correcte'
      },
      keyFactors: ['Spécialiste terre battue', 'H2H favorable', 'Forme exceptionnelle'],
      warnings: []
    },
    {
      matchId: 'demo_wta_2',
      player1: 'Coco Gauff',
      player2: 'Madison Keys',
      tournament: 'Roland Garros',
      surface: 'clay',
      round: 'Quarts de finale',
      date: today,
      odds1: 1.85,
      odds2: 2.00,
      category: 'wta',
      prediction: {
        winner: 'player1',
        winProbability: 58,
        confidence: 'medium',
        riskPercentage: 35
      },
      betting: {
        recommendedBet: false,
        kellyStake: 1,
        winnerOdds: 1.85,
        expectedValue: 5
      },
      analysis: {
        rankingAdvantage: 'Gauff #3 vs Keys #5',
        surfaceAdvantage: 'Gauff plus régulière sur terre',
        formAdvantage: 'Gauff: 6V-3D sur ses 10 derniers matchs',
        h2hAdvantage: 'Gauff mène 2-1',
        oddsValue: 'Cote Gauff: 1.85 - Match équilibré'
      },
      keyFactors: ['Classement favorable', 'Régularité'],
      warnings: ['Match potentiellement serré', 'Keys en bonne forme']
    },
    // Challenger
    {
      matchId: 'demo_challenger_1',
      player1: 'Lucas Pouille',
      player2: 'Richard Gasquet',
      tournament: 'Open de Bordeaux',
      surface: 'clay',
      round: 'Huitièmes de finale',
      date: today,
      odds1: 2.10,
      odds2: 1.70,
      category: 'challenger',
      prediction: {
        winner: 'player2',
        winProbability: 62,
        confidence: 'medium',
        riskPercentage: 30
      },
      betting: {
        recommendedBet: false,
        kellyStake: 2,
        winnerOdds: 1.70,
        expectedValue: 3
      },
      analysis: {
        rankingAdvantage: 'Gasquet mieux classé',
        surfaceAdvantage: 'Gasquet plus à l\'aise sur terre',
        formAdvantage: 'Gasquet: 5V-2D récents',
        h2hAdvantage: 'Pas d\'historique récent',
        oddsValue: 'Cote Gasquet: 1.70'
      },
      keyFactors: ['Expérience', 'Surface favorable'],
      warnings: ['Match challenger - volatilité élevée']
    }
  ];
}

// ============================================
// CONFIGURATION
// ============================================

const DATA_DIR = path.join(process.cwd(), 'data');
const PRECALC_FILE = path.join(DATA_DIR, 'tennis-predictions.json');

const GITHUB_REPO = 'steohidy/my-project';
const GITHUB_BRANCH = 'master';

// ============================================
// CHARGEMENT DONNÉES PRÉ-CALCULÉES
// ============================================

async function loadPrecalculatedData(): Promise<TennisPrediction[] | null> {
  // 1. Essayer fichier local
  try {
    if (fs.existsSync(PRECALC_FILE)) {
      const content = fs.readFileSync(PRECALC_FILE, 'utf-8');
      const data = JSON.parse(content);
      if (data.predictions && data.predictions.length > 0) {
        console.log(`✅ ${data.predictions.length} prédictions locales`);
        return data.predictions;
      }
    }
  } catch (e) {
    console.log('⚠️ Erreur lecture local');
  }
  
  // 2. Fallback: GitHub raw avec timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const res = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/data/tennis-predictions.json`,
      { signal: controller.signal, next: { revalidate: 300 } }
    );
    clearTimeout(timeoutId);
    
    if (res.ok) {
      const data = await res.json();
      if (data.predictions && data.predictions.length > 0) {
        console.log(`✅ ${data.predictions.length} prédictions GitHub`);
        return data.predictions;
      }
    }
  } catch (e) {
    console.log('⚠️ Erreur chargement GitHub (timeout ou erreur)');
  }
  
  return null;
}

// ============================================
// GET - API ROBUSTE
// ============================================

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';
    
    console.log('🎾 API Tennis: Requête reçue');
    
    // 1. Charger les prédictions pré-calculées (avec timeout)
    let predictions = await loadPrecalculatedData();
    let source = 'precalculated';
    
    // 2. Si pas de données, utiliser les données de démo
    if (!predictions || predictions.length === 0) {
      console.log('⚠️ Pas de pré-calcul, utilisation données démo');
      predictions = getDemoPredictions();
      source = 'demo';
    }
    
    // 3. Filtrer
    let filtered = predictions;
    
    if (filter === 'atp') {
      filtered = predictions.filter(p => p.category === 'atp');
    } else if (filter === 'wta') {
      filtered = predictions.filter(p => p.category === 'wta');
    } else if (filter === 'challenger') {
      filtered = predictions.filter(p => p.category === 'challenger');
    } else if (filter === 'recommended') {
      filtered = predictions.filter(p => p.betting.recommendedBet);
    } else if (filter === 'high_confidence') {
      filtered = predictions.filter(p => 
        p.prediction.confidence === 'very_high' || p.prediction.confidence === 'high'
      );
    }
    
    // 4. Stats
    const stats = {
      total: filtered.length,
      atp: filtered.filter(p => p.category === 'atp').length,
      wta: filtered.filter(p => p.category === 'wta').length,
      challenger: filtered.filter(p => p.category === 'challenger').length,
      itf: filtered.filter(p => p.category === 'itf').length,
      bySurface: {
        hard: filtered.filter(p => p.surface === 'hard').length,
        clay: filtered.filter(p => p.surface === 'clay').length,
        grass: filtered.filter(p => p.surface === 'grass').length,
        carpet: filtered.filter(p => p.surface === 'carpet').length
      },
      byConfidence: {
        very_high: filtered.filter(p => p.prediction.confidence === 'very_high').length,
        high: filtered.filter(p => p.prediction.confidence === 'high').length,
        medium: filtered.filter(p => p.prediction.confidence === 'medium').length,
        low: filtered.filter(p => p.prediction.confidence === 'low').length
      },
      recommendedBets: filtered.filter(p => p.betting.recommendedBet).length
    };
    
    // 5. Réponse
    return NextResponse.json({
      predictions: filtered,
      stats,
      generatedAt: new Date().toISOString(),
      source,
      methodology: {
        name: 'Tennis ML v1.0',
        features: [
          'Classement ATP/WTA',
          'Performance sur la surface du match',
          'Forme récente (10 derniers matchs)',
          'Historique tête-à-tête (H2H)',
          'Cotes des bookmakers'
        ],
        weights: {
          ranking: '25%',
          surface: '20%',
          form: '20%',
          h2h: '15%',
          odds: '20%'
        },
        confidence: {
          very_high: 'Probabilité > 75% (risque 15%)',
          high: 'Probabilité 65-75% (risque 25%)',
          medium: 'Probabilité 55-65% (risque 40%)',
          low: 'Probabilité < 55% (risque 50%)'
        },
        kelly: 'Critère de Kelly fractionné pour gestion bankroll'
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur API Tennis:', error);
    
    // Retourner les données de démo même en cas d'erreur
    const demoPredictions = getDemoPredictions();
    const stats = {
      total: demoPredictions.length,
      atp: demoPredictions.filter(p => p.category === 'atp').length,
      wta: demoPredictions.filter(p => p.category === 'wta').length,
      challenger: demoPredictions.filter(p => p.category === 'challenger').length,
      itf: demoPredictions.filter(p => p.category === 'itf').length,
      bySurface: {
        hard: demoPredictions.filter(p => p.surface === 'hard').length,
        clay: demoPredictions.filter(p => p.surface === 'clay').length,
        grass: demoPredictions.filter(p => p.surface === 'grass').length,
        carpet: demoPredictions.filter(p => p.surface === 'carpet').length
      },
      byConfidence: {
        very_high: demoPredictions.filter(p => p.prediction.confidence === 'very_high').length,
        high: demoPredictions.filter(p => p.prediction.confidence === 'high').length,
        medium: demoPredictions.filter(p => p.prediction.confidence === 'medium').length,
        low: demoPredictions.filter(p => p.prediction.confidence === 'low').length
      },
      recommendedBets: demoPredictions.filter(p => p.betting.recommendedBet).length
    };
    
    return NextResponse.json({
      predictions: demoPredictions,
      stats,
      generatedAt: new Date().toISOString(),
      source: 'demo',
      error: 'Erreur chargement données - affichage démo',
      methodology: {
        name: 'Tennis ML v1.0',
        features: ['Classement ATP/WTA', 'Performance surface', 'Forme récente', 'H2H', 'Cotes'],
        weights: { ranking: '25%', surface: '20%', form: '20%', h2h: '15%', odds: '20%' }
      }
    });
  }
}
