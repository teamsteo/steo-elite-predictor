import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

/**
 * API Tennis - Prédictions ML avancées
 * 
 * Données pré-calculées par GitHub Actions quotidiennement
 * Features: Classement, Surface, Forme, H2H, Cotes
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

interface PrecalcData {
  generatedAt: string;
  totalMatches: number;
  byCategory: { atp: number; wta: number; challenger: number; itf: number };
  byConfidence: { very_high: number; high: number; medium: number; low: number };
  bySurface: { hard: number; clay: number; grass: number; carpet: number };
  predictions: TennisPrediction[];
  modelVersion: string;
}

// ============================================
// CONFIGURATION
// ============================================

const DATA_DIR = path.join(process.cwd(), 'data');
const PRECALC_FILE = path.join(DATA_DIR, 'tennis-predictions.json');
const PLAYERS_FILE = path.join(DATA_DIR, 'tennis-players.json');

const GITHUB_REPO = 'steohidy/my-project';
const GITHUB_BRANCH = 'master';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

// ============================================
// CHARGEMENT DONNÉES
// ============================================

async function loadPrecalculatedData(): Promise<PrecalcData | null> {
  // 1. Essayer fichier local
  try {
    if (fs.existsSync(PRECALC_FILE)) {
      const content = fs.readFileSync(PRECALC_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.log('⚠️ Erreur lecture local');
  }
  
  // 2. Fallback: GitHub raw
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/data/tennis-predictions.json`,
      { headers: HEADERS, next: { revalidate: 60 } }
    );
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.log('⚠️ Erreur chargement GitHub');
  }
  
  return null;
}

// ============================================
// FALLBACK: RÉCUPÉRATION EN DIRECT
// ============================================

function detectSurface(tournamentName: string): 'hard' | 'clay' | 'grass' | 'carpet' {
  const name = tournamentName.toLowerCase();
  
  if (name.includes('wimbledon') || name.includes('halle') || name.includes('queen') || 
      name.includes('eastbourne') || name.includes('s-hertogenbosch')) {
    return 'grass';
  }
  
  if (name.includes('roland') || name.includes('garros') || name.includes('clay') || 
      name.includes('monte carlo') || name.includes('barcelona') || name.includes('rome') ||
      name.includes('cap cana') || name.includes('santiago')) {
    return 'clay';
  }
  
  if (name.includes('indoor') || name.includes('metz') || name.includes('vienna') || 
      name.includes('basel') || name.includes('stockholm') || name.includes('cherbourg')) {
    return 'carpet';
  }
  
  return 'hard';
}

function detectCategory(url: string): 'atp' | 'wta' | 'challenger' | 'itf' {
  if (url.includes('atp-singles') || url.includes('atp-doubles')) return 'atp';
  if (url.includes('wta-singles') || url.includes('wta-doubles')) return 'wta';
  if (url.includes('challenger')) return 'challenger';
  if (url.includes('itf')) return 'itf';
  return 'atp';
}

function slugToPlayerNames(slug: string): { player1: string; player2: string } {
  const parts = slug.split('-');
  const half = Math.floor(parts.length / 2);
  const formatName = (p: string[]) => p.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return {
    player1: formatName(parts.slice(0, half)),
    player2: formatName(parts.slice(half))
  };
}

async function fetchLiveMatches(): Promise<TennisPrediction[]> {
  const predictions: TennisPrediction[] = [];
  
  try {
    const res = await fetch('https://www.betexplorer.com/tennis/next/', {
      headers: HEADERS,
      next: { revalidate: 60 }
    });
    
    if (!res.ok) return predictions;
    
    const html = await res.text();
    
    const matchLinkRegex = /href="\/tennis\/([a-z-]+)\/([a-z-]+)\/([a-z-]+)\/([a-zA-Z0-9]+)\/"/g;
    const oddsRegex = /data-odd="(\d+\.?\d*)"/g;
    
    const allOdds: number[] = [];
    let oddsMatch;
    while ((oddsMatch = oddsRegex.exec(html)) !== null) {
      allOdds.push(parseFloat(oddsMatch[1]));
    }
    
    const seenMatches = new Set<string>();
    let oddsIndex = 0;
    let matchLink;
    
    while ((matchLink = matchLinkRegex.exec(html)) !== null) {
      const categoryPath = matchLink[1];
      const tournamentSlug = matchLink[2];
      const playersSlug = matchLink[3];
      const matchId = matchLink[4];
      
      const key = `${categoryPath}_${tournamentSlug}_${matchId}`;
      if (seenMatches.has(key)) continue;
      seenMatches.add(key);
      
      const category = detectCategory(categoryPath);
      const tournament = tournamentSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const surface = detectSurface(tournament);
      const { player1, player2 } = slugToPlayerNames(playersSlug);
      
      const odds1 = allOdds[oddsIndex] || 1.85;
      const odds2 = allOdds[oddsIndex + 1] || 1.85;
      oddsIndex += 2;
      
      // Prédiction simple basée sur les cotes
      const impliedP1 = 1 / odds1;
      const impliedP2 = 1 / odds2;
      const winner = impliedP1 > impliedP2 ? 'player1' : 'player2';
      const winProb = Math.max(impliedP1, impliedP2) * 100;
      
      let confidence: 'very_high' | 'high' | 'medium' | 'low';
      let risk: number;
      
      if (winProb >= 75) { confidence = 'very_high'; risk = 15; }
      else if (winProb >= 65) { confidence = 'high'; risk = 25; }
      else if (winProb >= 55) { confidence = 'medium'; risk = 40; }
      else { confidence = 'low'; risk = 50; }
      
      predictions.push({
        matchId: `live_${matchId}`,
        player1,
        player2,
        tournament,
        surface,
        round: 'Match',
        date: new Date().toISOString(),
        odds1,
        odds2,
        category,
        prediction: {
          winner,
          winProbability: Math.round(winProb),
          confidence,
          riskPercentage: risk
        },
        betting: {
          recommendedBet: confidence !== 'low' && winProb >= 60,
          kellyStake: confidence === 'low' ? 0 : Math.round(winProb / 20),
          winnerOdds: winner === 'player1' ? odds1 : odds2,
          expectedValue: Math.round((winProb / 100 * (winner === 'player1' ? odds1 : odds2) - 1) * 100)
        },
        analysis: {
          rankingAdvantage: 'Données non disponibles',
          surfaceAdvantage: 'Données non disponibles',
          formAdvantage: 'Données non disponibles',
          h2hAdvantage: 'Pas d\'historique',
          oddsValue: `Cote ${winner === 'player1' ? player1 : player2}: ${(winner === 'player1' ? odds1 : odds2).toFixed(2)}`
        },
        keyFactors: [`Cote: ${odds1.toFixed(2)} / ${odds2.toFixed(2)}`],
        warnings: ['Prédiction basée uniquement sur les cotes']
      });
    }
    
  } catch (error) {
    console.error('Erreur fetch live:', error);
  }
  
  return predictions;
}

// ============================================
// GET
// ============================================

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';
    
    console.log('🎾 API Tennis: Requête reçue');
    
    // 1. Charger les prédictions pré-calculées
    let precalcData = await loadPrecalculatedData();
    let predictions: TennisPrediction[] = [];
    let source = 'precalculated';
    let generatedAt = '';
    
    if (precalcData && precalcData.predictions.length > 0) {
      predictions = precalcData.predictions;
      generatedAt = precalcData.generatedAt;
      console.log(`✅ ${predictions.length} prédictions pré-calculées (générées: ${generatedAt})`);
      
      // Vérifier si les données sont fraîches (< 12h)
      const age = Date.now() - new Date(generatedAt).getTime();
      const TWELVE_HOURS = 12 * 60 * 60 * 1000;
      if (age > TWELVE_HOURS) {
        console.log('⚠️ Données anciennes (>12h), récupération live...');
        const livePredictions = await fetchLiveMatches();
        if (livePredictions.length > 0) {
          predictions = livePredictions;
          source = 'live';
          console.log(`✅ ${livePredictions.length} matchs live récupérés`);
        }
      }
    } else {
      // Fallback: données en direct
      console.log('⚠️ Pas de pré-calcul, récupération live...');
      predictions = await fetchLiveMatches();
      source = 'live';
    }
    
    // FILTRER LES MATCHS PASSÉS - Ne garder que les matchs qui n'ont pas encore commencé
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    predictions = predictions.filter(p => {
      const matchDate = new Date(p.date);

      // Garder les matchs futurs (après aujourd'hui)
      if (matchDate > todayStart) return true;

      // Pour les matchs d'aujourd'hui, vérifier l'heure
      if (matchDate >= todayStart && matchDate <= now) {
        // Le match a déjà commencé aujourd'hui - l'exclure
        return false;
      }

      // Garder les matchs d'aujourd'hui qui n'ont pas encore commencé
      if (matchDate >= todayStart) {
        // Ajouter une marge de 5 minutes avant le début
        const matchStart = new Date(matchDate.getTime() - 5 * 60 * 1000);
        return now < matchStart;
      }

      return false;
    });
    
    console.log(`📅 Après filtrage: ${predictions.length} matchs à venir`);
    
    // 2. Filtrer
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
    
    // 3. Stats
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
    
    // 4. Réponse
    return NextResponse.json({
      predictions: filtered,
      stats,
      generatedAt: generatedAt || new Date().toISOString(),
      source,
      methodology: {
        name: 'Tennis ML v1.0',
        features: [
          'Classement estimé des joueurs',
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
    return NextResponse.json(
      { error: 'Erreur serveur', predictions: [], stats: null },
      { status: 500 }
    );
  }
}
