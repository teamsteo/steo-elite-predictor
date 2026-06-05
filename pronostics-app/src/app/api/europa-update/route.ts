import { NextResponse } from 'next/server';

/**
 * API pour mettre à jour manuellement les matchs européens
 * - Europa League
 * - Conference League
 * - Champions League
 */

const ODDS_API_KEY = process.env.THE_ODDS_API_KEY || 'fcf0d3cbc8958a44007b0520751f8431';
const BASE_URL = 'https://api.the-odds-api.com/v4';

// Sports européens à surveiller
const EUROPEAN_SPORTS = [
  { key: 'soccer_uefa_champions_league', name: 'Champions League' },
  { key: 'soccer_uefa_europa_league', name: 'Europa League' },
  { key: 'soccer_uefa_conference_league', name: 'Conference League' },
];

interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  date: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  bookmaker: string;
  hasRealOdds: boolean;
  predictions?: {
    result: { home: number; draw: number; away: number };
    goals: { expected: number; over25: number; recommendation: string };
    valueBet?: { detected: boolean; type: string; edge: number };
    confidence: string;
  };
}

/**
 * Calculer les probabilités implicites depuis les cotes
 */
function calculateImpliedProbabilities(oddsHome: number, oddsDraw: number | null, oddsAway: number) {
  if (!oddsHome || !oddsAway || oddsHome <= 1 || oddsAway <= 1) {
    return { home: 33, draw: 34, away: 33 };
  }
  
  const homeProb = 1 / oddsHome;
  const awayProb = 1 / oddsAway;
  const drawProb = oddsDraw && oddsDraw > 1 ? 1 / oddsDraw : 0;
  
  const total = homeProb + awayProb + drawProb;
  
  return {
    home: Math.round((homeProb / total) * 100),
    draw: Math.round((drawProb / total) * 100),
    away: Math.round((awayProb / total) * 100),
  };
}

/**
 * Calculer les prédictions avec la nouvelle méthode
 */
function calculatePredictions(match: Match) {
  const probs = calculateImpliedProbabilities(match.oddsHome, match.oddsDraw, match.oddsAway);
  
  // Expected goals basé sur les probabilités
  const expectedGoals = (probs.home / 100) * 2.2 + (probs.away / 100) * 0.9 + (probs.draw / 100) * 1.2;
  
  // Value bet detection
  const favorite = probs.home > probs.away ? 'home' : 'away';
  const favoriteProb = Math.max(probs.home, probs.away);
  const favoriteOdds = favorite === 'home' ? match.oddsHome : match.oddsAway;
  const impliedProb = 1 / favoriteOdds;
  const edge = favoriteProb - (impliedProb * 100);
  
  return {
    result: probs,
    goals: {
      expected: expectedGoals,
      over25: expectedGoals > 2.5 ? 55 : 45,
      recommendation: expectedGoals > 2.5 ? `Over 2.5 (${expectedGoals.toFixed(1)} buts attendus)` : `Under 2.5`,
    },
    valueBet: {
      detected: edge > 5,
      type: edge > 5 ? favorite : '',
      edge: Math.max(0, edge),
    },
    confidence: favoriteProb >= 60 ? 'high' : favoriteProb >= 45 ? 'medium' : 'low',
  };
}

/**
 * GET - Récupérer les matchs européens
 */
export async function GET() {
  try {
    const allMatches: Match[] = [];
    let quotaUsed = 0;
    let quotaRemaining = 500;

    // Récupérer les cotes pour chaque compétition européenne
    for (const sport of EUROPEAN_SPORTS) {
      try {
        console.log(`📡 Récupération ${sport.name}...`);
        
        const response = await fetch(
          `${BASE_URL}/sports/${sport.key}/odds/?regions=eu&markets=h2h&oddsFormat=decimal&apiKey=${ODDS_API_KEY}`,
          { next: { revalidate: 0 } }
        );
        
        if (!response.ok) {
          console.log(`⚠️ ${sport.name}: ${response.status}`);
          continue;
        }
        
        // Lire les headers de quota
        quotaUsed = parseInt(response.headers.get('x-requests-used') || '0');
        quotaRemaining = parseInt(response.headers.get('x-requests-remaining') || '0');
        
        const data = await response.json();
        
        for (const match of data) {
          const bookmaker = match.bookmakers?.[0];
          const h2hMarket = bookmaker?.markets?.find((m: any) => m.key === 'h2h');
          const outcomes = h2hMarket?.outcomes || [];
          
          if (outcomes.length < 2) continue;
          
          let oddsHome = 0;
          let oddsDraw: number | null = null;
          let oddsAway = 0;
          
          for (const outcome of outcomes) {
            const name = outcome.name?.toLowerCase() || '';
            if (name === 'draw' || name === 'x' || name === 'nul') {
              oddsDraw = outcome.price;
            } else if (oddsHome === 0) {
              oddsHome = outcome.price;
            } else {
              oddsAway = outcome.price;
            }
          }
          
          if (oddsHome > 0 && oddsAway > 0) {
            const matchData: Match = {
              id: match.id,
              homeTeam: match.home_team,
              awayTeam: match.away_team,
              sport: 'Foot',
              league: sport.name,
              date: match.commence_time,
              oddsHome,
              oddsDraw,
              oddsAway,
              bookmaker: bookmaker?.title || 'Unknown',
              hasRealOdds: true,
            };
            
            // Calculer les prédictions avec la nouvelle méthode
            matchData.predictions = calculatePredictions(matchData);
            
            allMatches.push(matchData);
          }
        }
        
        console.log(`✅ ${sport.name}: ${data.length} matchs`);
        
      } catch (error) {
        console.error(`❌ Erreur ${sport.name}:`, error);
      }
    }

    // Trier par date
    allMatches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Stats
    const byLeague: Record<string, number> = {};
    for (const m of allMatches) {
      byLeague[m.league] = (byLeague[m.league] || 0) + 1;
    }

    return NextResponse.json({
      success: true,
      message: `${allMatches.length} matchs européens trouvés`,
      matches: allMatches,
      stats: {
        total: allMatches.length,
        byLeague,
        quotaUsed,
        quotaRemaining,
      },
      lastUpdate: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Erreur:', error);
    return NextResponse.json({
      success: false,
      message: 'Erreur lors de la récupération des matchs',
      matches: [],
    }, { status: 500 });
  }
}

/**
 * POST - Forcer la mise à jour
 */
export async function POST() {
  return GET();
}
