import { NextResponse } from 'next/server';

/**
 * API pour récupérer les matchs européens
 * - Champions League
 * - Europa League  
 * - Conference League
 * 
 * SOURCE: ESPN API (GRATUIT ET ILLIMITÉ)
 * Plus de problème de quota !
 */

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
  homeScore?: number;
  awayScore?: number;
  status: 'upcoming' | 'live' | 'finished';
  isLive?: boolean;
  isFinished?: boolean;
  predictions?: {
    result: { home: number; draw: number; away: number };
    goals: { expected: number; over25: number; recommendation: string };
    valueBet?: { detected: boolean; type: string; edge: number };
    confidence: string;
  };
}

interface ESPNEvent {
  id: string;
  date: string;
  name: string;
  status: {
    type: {
      state: string;
      name: string;
      completed: boolean;
    };
    period?: number;
    displayClock?: string;
  };
  competitions: Array<{
    competitors: Array<{
      homeAway: string;
      score: string;
      team: {
        id: string;
        displayName: string;
        abbreviation: string;
      };
    }>;
    odds?: Array<{
      provider: { name: string };
      homeTeamOdds?: { moneyLine: number };
      awayTeamOdds?: { moneyLine: number };
      drawOdds?: { moneyLine: number };
      moneyline?: {
        home?: { close?: { odds: number }; open?: { odds: number } };
        away?: { close?: { odds: number }; open?: { odds: number } };
        draw?: { close?: { odds: number }; open?: { odds: number } };
      };
    }>;
  }>;
}

// Compétitions européennes sur ESPN
const EUROPEAN_LEAGUES = [
  { key: 'uefa.champions', name: 'Champions League' },
  { key: 'uefa.europa', name: 'Europa League' },
  { key: 'uefa.europa.conf', name: 'Conference League' },
];

/**
 * Convertit les cotes américaines en décimales
 */
function americanToDecimal(americanOdds: string | number | undefined): number {
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
 * Extrait les cotes ESPN (DraftKings)
 */
function extractEspnOdds(competition: any): { home: number; draw: number | null; away: number; provider: string } {
  const odds = competition?.odds?.[0];
  
  if (!odds) {
    return { home: 0, draw: null, away: 0, provider: 'None' };
  }
  
  const provider = odds.provider?.name || 'DraftKings';
  
  // Format ESPN pour les cotes
  let homeOdds = odds.homeTeamOdds?.moneyLine || odds.moneyline?.home?.close?.odds || 0;
  let awayOdds = odds.awayTeamOdds?.moneyLine || odds.moneyline?.away?.close?.odds || 0;
  let drawOdds = odds.drawOdds || odds.moneyline?.draw?.close?.odds || null;
  
  // Convertir en décimal si nécessaire
  homeOdds = americanToDecimal(homeOdds);
  awayOdds = americanToDecimal(awayOdds);
  drawOdds = drawOdds ? americanToDecimal(drawOdds) : null;
  
  return { home: homeOdds, draw: drawOdds, away: awayOdds, provider };
}

/**
 * Estimer les cotes si ESPN n'en fournit pas
 */
function estimateOdds(homeTeam: string, awayTeam: string): { home: number; draw: number; away: number } {
  const favoriteTeams = [
    'Real Madrid', 'Manchester City', 'Bayern Munich', 'Paris Saint-Germain', 'Barcelona',
    'Liverpool', 'Chelsea', 'Arsenal', 'Inter Milan', 'AC Milan', 'Borussia Dortmund',
    'Atletico Madrid', 'Juventus', 'Napoli', 'Roma', 'Lazio', 'Bayer Leverkusen', 'Atalanta',
  ];
  
  const homeIsFavorite = favoriteTeams.some(t => homeTeam.toLowerCase().includes(t.toLowerCase()));
  const awayIsFavorite = favoriteTeams.some(t => awayTeam.toLowerCase().includes(t.toLowerCase()));
  
  if (homeIsFavorite && !awayIsFavorite) {
    return { home: 1.65, draw: 3.60, away: 5.00 };
  } else if (!homeIsFavorite && awayIsFavorite) {
    return { home: 4.50, draw: 3.60, away: 1.75 };
  } else if (homeIsFavorite && awayIsFavorite) {
    return { home: 2.30, draw: 3.30, away: 3.00 };
  }
  return { home: 2.50, draw: 3.30, away: 2.80 };
}

/**
 * Calculer les prédictions
 */
function calculatePredictions(match: Match) {
  const probs = calculateImpliedProbabilities(match.oddsHome, match.oddsDraw, match.oddsAway);
  
  const expectedGoals = (probs.home / 100) * 2.2 + (probs.away / 100) * 0.9 + (probs.draw / 100) * 1.2;
  
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
      recommendation: expectedGoals > 2.5 ? `Over 2.5 (${expectedGoals.toFixed(1)} buts)` : `Under 2.5`,
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
 * GET - Récupérer les matchs européens depuis ESPN (GRATUIT)
 */
export async function GET() {
  try {
    console.log('📡 Récupération matchs européens depuis ESPN (GRATUIT ET ILLIMITÉ)...');
    
    const allMatches: Match[] = [];

    for (const league of EUROPEAN_LEAGUES) {
      try {
        console.log(`  📌 ${league.name}...`);
        
        const response = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.key}/scoreboard`,
          { next: { revalidate: 300 } }
        );

        if (!response.ok) {
          console.log(`  ⚠️ ${league.name}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const events: ESPNEvent[] = data.events || [];

        for (const event of events) {
          const competition = event.competitions?.[0];
          const homeCompetitor = competition?.competitors?.find(c => c.homeAway === 'home');
          const awayCompetitor = competition?.competitors?.find(c => c.homeAway === 'away');

          if (!homeCompetitor || !awayCompetitor) continue;

          const homeTeam = homeCompetitor.team?.displayName || 'Unknown';
          const awayTeam = awayCompetitor.team?.displayName || 'Unknown';
          
          // Récupérer les cotes ESPN (DraftKings)
          const espnOdds = extractEspnOdds(competition);
          
          let oddsHome = espnOdds.home;
          let oddsAway = espnOdds.away;
          let oddsDraw = espnOdds.draw;
          
          // Si pas de cotes, estimer
          if (!oddsHome || !oddsAway) {
            const estimated = estimateOdds(homeTeam, awayTeam);
            oddsHome = estimated.home;
            oddsDraw = estimated.draw;
            oddsAway = estimated.away;
          }
          
          const isLive = event.status?.type?.state === 'in';
          const isFinished = event.status?.type?.completed;

          // Vérifier si le match a déjà commencé (basé sur l'heure)
          const matchDate = new Date(event.date);
          const now = new Date();
          const hasStarted = matchDate.getTime() < now.getTime();

          // Ne pas inclure les matchs terminés
          if (isFinished) {
            console.log(`  ⏭️ Match terminé ignoré: ${homeTeam} vs ${awayTeam}`);
            continue;
          }

          // Ne pas inclure les matchs qui ont commencé mais ne sont pas live
          // (marge de 5 minutes pour éviter les erreurs de timing)
          if (hasStarted && !isLive) {
            const matchStartWithMargin = new Date(matchDate.getTime() + 5 * 60 * 1000);
            if (now > matchStartWithMargin) {
              console.log(`  ⏭️ Match déjà commencé ignoré: ${homeTeam} vs ${awayTeam}`);
              continue;
            }
          }

          const matchData: Match = {
            id: `espn_${league.key}_${event.id}`,
            homeTeam,
            awayTeam,
            sport: 'Foot',
            league: league.name,
            date: event.date,
            oddsHome,
            oddsDraw,
            oddsAway,
            bookmaker: espnOdds.provider || 'ESPN',
            hasRealOdds: espnOdds.home > 0,
            homeScore: homeCompetitor.score ? parseInt(homeCompetitor.score) : undefined,
            awayScore: awayCompetitor.score ? parseInt(awayCompetitor.score) : undefined,
            status: isLive ? 'live' : 'upcoming',
            isLive,
            isFinished: false, // Toujours false car on filtre les matchs terminés
          };

          matchData.predictions = calculatePredictions(matchData);

          allMatches.push(matchData);
        }

        console.log(`  ✅ ${league.name}: ${events.length} matchs`);

      } catch (error) {
        console.error(`  ❌ Erreur ${league.name}:`, error);
      }
    }

    allMatches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const byLeague: Record<string, number> = {};
    for (const m of allMatches) {
      byLeague[m.league] = (byLeague[m.league] || 0) + 1;
    }

    const matchesWithOdds = allMatches.filter(m => m.hasRealOdds).length;
    console.log(`✅ Total: ${allMatches.length} matchs européens (${matchesWithOdds} avec cotes ESPN) - GRATUIT`);

    return NextResponse.json({
      success: true,
      message: `${allMatches.length} matchs européens (ESPN - Gratuit & Illimité)`,
      matches: allMatches,
      stats: {
        total: allMatches.length,
        byLeague,
        source: 'ESPN (DraftKings)',
        matchesWithOdds,
        quotaCost: 0, // Toujours gratuit !
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
 * POST - Rafraîchir les données
 */
export async function POST() {
  return GET();
}
