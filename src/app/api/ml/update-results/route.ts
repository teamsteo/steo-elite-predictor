/**
 * API pour mettre à jour automatiquement les résultats des pronostics ML
 * 
 * GET /api/ml/update-results
 * Vérifie les résultats des matchs terminés et met à jour les pronostics
 */

import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const ML_RESULTS_FILE = path.join(DATA_DIR, 'ml-results-tracking.json');

interface Pick {
  id: string;
  matchId: string;
  sport: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  bet: string;
  betLabel: string;
  odds: number;
  winProbability: number;
  confidence: string;
  type: string;
  result: 'pending' | 'won' | 'lost';
  actualWinner?: string;
}

interface MLResults {
  picks: Pick[];
  dailyStats: any[];
  weeklyRatio: number;
  last7Days: {
    total: number;
    won: number;
    ratio: number;
  };
  lastUpdated: string;
  expertMLVisible: boolean;
  history: any[];
}

/**
 * Vérifier le résultat d'un match de tennis via ESPN
 */
async function checkTennisResult(homeTeam: string, awayTeam: string): Promise<{ winner: string | null; found: boolean }> {
  try {
    // ATP et WTA sur ESPN
    const endpoints = [
      'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard',
      'https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard',
    ];

    for (const url of endpoints) {
      try {
        const response = await fetch(url, { next: { revalidate: 60 } });
        if (!response.ok) continue;

        const data = await response.json();
        const events = data.events || [];

        for (const event of events) {
          const competitors = event.competitions?.[0]?.competitors || [];
          if (competitors.length < 2) continue;

          const player1 = competitors[0]?.team?.displayName || competitors[0]?.athlete?.displayName || '';
          const player2 = competitors[1]?.team?.displayName || competitors[1]?.athlete?.displayName || '';

          // Vérifier si c'est le bon match (noms similaires)
          const homeLower = homeTeam.toLowerCase();
          const awayLower = awayTeam.toLowerCase();
          const p1Lower = player1.toLowerCase();
          const p2Lower = player2.toLowerCase();

          const isMatch = 
            (p1Lower.includes(homeLower.split(' ').pop() || '') || homeLower.includes(p1Lower.split(' ').pop() || '')) ||
            (p2Lower.includes(awayLower.split(' ').pop() || '') || awayLower.includes(p2Lower.split(' ').pop() || ''));

          if (isMatch && event.status?.type?.completed) {
            const winner = competitors.find((c: any) => c.winner === true);
            if (winner) {
              const winnerName = winner.team?.displayName || winner.athlete?.displayName || '';
              return { winner: winnerName, found: true };
            }
          }
        }
      } catch (e) {
        continue;
      }
    }
  } catch (error) {
    console.error('Erreur vérification tennis:', error);
  }

  return { winner: null, found: false };
}

/**
 * Vérifier le résultat d'un match de basketball (NBA) via ESPN
 */
async function checkBasketballResult(homeTeam: string, awayTeam: string): Promise<{ winner: string | null; found: boolean }> {
  try {
    const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard', {
      next: { revalidate: 60 }
    });

    if (!response.ok) return { winner: null, found: false };

    const data = await response.json();
    const events = data.events || [];

    for (const event of events) {
      const competitors = event.competitions?.[0]?.competitors || [];
      if (competitors.length < 2) continue;

      const team1 = competitors[0]?.team?.displayName || '';
      const team2 = competitors[1]?.team?.displayName || '';

      const homeLower = homeTeam.toLowerCase();
      const awayLower = awayTeam.toLowerCase();

      // Correspondance flexible
      const isMatch = 
        team1.toLowerCase().includes(homeLower.slice(0, 5)) ||
        team2.toLowerCase().includes(awayLower.slice(0, 5)) ||
        homeLower.includes(team1.toLowerCase().slice(0, 5)) ||
        awayLower.includes(team2.toLowerCase().slice(0, 5));

      if (isMatch && event.status?.type?.completed) {
        const winner = competitors.find((c: any) => c.winner === true);
        if (winner) {
          return { winner: winner.team?.displayName || '', found: true };
        }
      }
    }
  } catch (error) {
    console.error('Erreur vérification basketball:', error);
  }

  return { winner: null, found: false };
}

/**
 * Vérifier le résultat d'un match de football via ESPN
 */
async function checkFootballResult(homeTeam: string, awayTeam: string): Promise<{ winner: string | null; found: boolean }> {
  try {
    const leagues = [
      'eng.1', 'ger.1', 'esp.1', 'ita.1', 'fra.1',
      'uefa.champions', 'uefa.europa', 'uefa.europa.conf'
    ];

    for (const league of leagues) {
      try {
        const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard`, {
          next: { revalidate: 60 }
        });

        if (!response.ok) continue;

        const data = await response.json();
        const events = data.events || [];

        for (const event of events) {
          const competitors = event.competitions?.[0]?.competitors || [];
          if (competitors.length < 2) continue;

          const team1 = competitors[0]?.team?.displayName || '';
          const team2 = competitors[1]?.team?.displayName || '';

          const homeLower = homeTeam.toLowerCase();
          const awayLower = awayTeam.toLowerCase();
          const t1Lower = team1.toLowerCase();
          const t2Lower = team2.toLowerCase();

          // Correspondance flexible sur les noms
          const isMatch = 
            t1Lower.includes(homeLower.slice(0, 4)) || homeLower.includes(t1Lower.slice(0, 4)) ||
            t2Lower.includes(awayLower.slice(0, 4)) || awayLower.includes(t2Lower.slice(0, 4));

          if (isMatch && event.status?.type?.completed) {
            const homeCompetitor = competitors.find((c: any) => c.homeAway === 'home');
            const awayCompetitor = competitors.find((c: any) => c.homeAway === 'away');

            const homeScore = parseInt(homeCompetitor?.score || '0');
            const awayScore = parseInt(awayCompetitor?.score || '0');

            if (homeScore > awayScore) {
              return { winner: 'home', found: true };
            } else if (awayScore > homeScore) {
              return { winner: 'away', found: true };
            } else {
              return { winner: 'draw', found: true };
            }
          }
        }
      } catch (e) {
        continue;
      }
    }
  } catch (error) {
    console.error('Erreur vérification football:', error);
  }

  return { winner: null, found: false };
}

/**
 * Vérifier le résultat d'un match NHL via ESPN
 */
async function checkNHLResult(homeTeam: string, awayTeam: string): Promise<{ winner: string | null; found: boolean }> {
  try {
    const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard', {
      next: { revalidate: 60 }
    });

    if (!response.ok) return { winner: null, found: false };

    const data = await response.json();
    const events = data.events || [];

    for (const event of events) {
      const competitors = event.competitions?.[0]?.competitors || [];
      if (competitors.length < 2) continue;

      const team1 = competitors[0]?.team?.displayName || '';
      const team2 = competitors[1]?.team?.displayName || '';

      const homeLower = homeTeam.toLowerCase();
      const awayLower = awayTeam.toLowerCase();

      const isMatch = 
        team1.toLowerCase().includes(homeLower.slice(0, 4)) ||
        team2.toLowerCase().includes(awayLower.slice(0, 4));

      if (isMatch && event.status?.type?.completed) {
        const winner = competitors.find((c: any) => c.winner === true);
        if (winner) {
          const isHome = winner.homeAway === 'home';
          return { winner: isHome ? 'home' : 'away', found: true };
        }
      }
    }
  } catch (error) {
    console.error('Erreur vérification NHL:', error);
  }

  return { winner: null, found: false };
}

/**
 * Mettre à jour un pronostic avec le résultat
 */
function updatePickResult(pick: Pick, actualWinner: string | null): 'won' | 'lost' | 'pending' {
  if (!actualWinner) return 'pending';

  // Pour le tennis
  if (pick.sport === 'tennis') {
    const betPlayer = pick.bet === 'player1' ? pick.homeTeam : pick.awayTeam;
    const winnerLower = actualWinner.toLowerCase();
    const betPlayerLower = betPlayer.toLowerCase();

    // Vérifier si le joueur parié a gagné
    const lastName = betPlayer.split(' ').pop()?.toLowerCase() || '';
    if (winnerLower.includes(lastName) || lastName.includes(winnerLower.split(' ').pop() || '')) {
      return 'won';
    }
    return 'lost';
  }

  // Pour les sports d'équipe
  if (actualWinner === 'home' && pick.bet === 'home') return 'won';
  if (actualWinner === 'away' && pick.bet === 'away') return 'won';
  if (actualWinner === 'draw' && pick.bet === 'draw') return 'won';
  if (actualWinner === 'home' || actualWinner === 'away' || actualWinner === 'draw') return 'lost';

  // Vérification par nom d'équipe
  const winnerLower = actualWinner.toLowerCase();
  const betTeam = pick.bet === 'home' ? pick.homeTeam : pick.awayTeam;
  const betTeamLower = betTeam.toLowerCase();

  if (winnerLower.includes(betTeamLower.slice(0, 4)) || betTeamLower.includes(winnerLower.slice(0, 4))) {
    return 'won';
  }

  return 'lost';
}

/**
 * Calculer les statistiques
 */
function calculateStats(picks: Pick[]): { last7Days: any; weeklyRatio: number; expertMLVisible: boolean } {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const last7DaysPicks = picks.filter(p => new Date(p.date) >= sevenDaysAgo && p.result !== 'pending');
  const total = last7DaysPicks.length;
  const won = last7DaysPicks.filter(p => p.result === 'won').length;
  const ratio = total > 0 ? Math.round((won / total) * 100) : 0;

  // L'Expert ML devient visible si 70%+ de réussite avec au moins 10 pronostics
  const expertMLVisible = ratio >= 70 && total >= 10;

  return {
    last7Days: { total, won, ratio },
    weeklyRatio: ratio,
    expertMLVisible
  };
}

/**
 * GET - Mettre à jour les résultats des pronostics
 */
export async function GET() {
  try {
    console.log('🔄 Mise à jour des résultats ML...');

    // Créer le dossier data si nécessaire
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Charger les données existantes
    let mlResults: MLResults;
    if (fs.existsSync(ML_RESULTS_FILE)) {
      mlResults = JSON.parse(fs.readFileSync(ML_RESULTS_FILE, 'utf-8'));
    } else {
      return NextResponse.json({
        success: true,
        message: 'Aucun pronostic à mettre à jour',
        updated: 0,
        stats: { total: 0, won: 0, pending: 0, lost: 0 }
      });
    }

    let updated = 0;
    const now = new Date();

    // Vérifier chaque pronostic en attente
    for (const pick of mlResults.picks) {
      if (pick.result !== 'pending') continue;

      // Ne vérifier que les matchs qui ont commencé il y a plus de 3 heures
      const matchDate = new Date(pick.date);
      const threeHoursAfterMatch = new Date(matchDate.getTime() + 3 * 60 * 60 * 1000);
      
      if (now < threeHoursAfterMatch) continue; // Match pas encore terminé

      console.log(`  📋 Vérification: ${pick.homeTeam} vs ${pick.awayTeam} (${pick.sport})`);

      let result: { winner: string | null; found: boolean } = { winner: null, found: false };

      // Vérifier selon le sport
      switch (pick.sport.toLowerCase()) {
        case 'tennis':
          result = await checkTennisResult(pick.homeTeam, pick.awayTeam);
          break;
        case 'basketball':
        case 'nba':
          result = await checkBasketballResult(pick.homeTeam, pick.awayTeam);
          break;
        case 'football':
        case 'soccer':
          result = await checkFootballResult(pick.homeTeam, pick.awayTeam);
          break;
        case 'hockey':
        case 'nhl':
          result = await checkNHLResult(pick.homeTeam, pick.awayTeam);
          break;
      }

      if (result.found && result.winner) {
        pick.result = updatePickResult(pick, result.winner);
        pick.actualWinner = result.winner;
        updated++;
        console.log(`    ✅ Résultat: ${pick.result} (gagnant: ${result.winner})`);
      }
    }

    // Calculer les nouvelles statistiques
    const stats = calculateStats(mlResults.picks);
    mlResults.last7Days = stats.last7Days;
    mlResults.weeklyRatio = stats.weeklyRatio;
    mlResults.expertMLVisible = stats.expertMLVisible;
    mlResults.lastUpdated = new Date().toISOString();

    // Sauvegarder
    fs.writeFileSync(ML_RESULTS_FILE, JSON.stringify(mlResults, null, 2));

    console.log(`✅ Mise à jour terminée: ${updated} pronostics mis à jour`);

    return NextResponse.json({
      success: true,
      message: `${updated} pronostic(s) mis à jour`,
      updated,
      stats: {
        total: mlResults.picks.length,
        won: mlResults.picks.filter(p => p.result === 'won').length,
        lost: mlResults.picks.filter(p => p.result === 'lost').length,
        pending: mlResults.picks.filter(p => p.result === 'pending').length,
        ratio: stats.last7Days.ratio,
        expertMLVisible: stats.expertMLVisible
      },
      last7Days: stats.last7Days
    });

  } catch (error) {
    console.error('Erreur mise à jour ML:', error);
    return NextResponse.json({
      success: false,
      message: 'Erreur lors de la mise à jour',
      error: String(error)
    }, { status: 500 });
  }
}
