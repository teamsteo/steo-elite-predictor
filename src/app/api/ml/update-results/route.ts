/**
 * API pour mettre à jour automatiquement les résultats des pronostics ML
 * Version Supabase - Stockage permanent des pronostics
 * 
 * GET /api/ml/update-results
 * Vérifie les résultats des matchs terminés et met à jour les pronostics
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Configuration Supabase
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

interface MlPick {
  id: string;
  match_id: string;
  sport: string;
  date: string;
  home_team: string;
  away_team: string;
  bet: string;
  bet_label: string;
  odds: number;
  win_probability: number;
  confidence: string;
  type: string;
  result: 'pending' | 'won' | 'lost';
  actual_winner?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Vérifier le résultat d'un match de tennis via ESPN
 */
async function checkTennisResult(homeTeam: string, awayTeam: string): Promise<{ winner: string | null; found: boolean }> {
  try {
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
function updateMlPickResult(pick: MlPick, actualWinner: string | null): 'won' | 'lost' | 'pending' {
  if (!actualWinner) return 'pending';

  // Pour le tennis
  if (pick.sport === 'tennis') {
    const betPlayer = pick.bet === 'player1' ? pick.home_team : pick.away_team;
    const winnerLower = actualWinner.toLowerCase();
    const betPlayerLower = betPlayer.toLowerCase();

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
  const betTeam = pick.bet === 'home' ? pick.home_team : pick.away_team;
  const betTeamLower = betTeam.toLowerCase();

  if (winnerLower.includes(betTeamLower.slice(0, 4)) || betTeamLower.includes(winnerLower.slice(0, 4))) {
    return 'won';
  }

  return 'lost';
}

/**
 * GET - Mettre à jour les résultats des pronostics
 */
export async function GET() {
  try {
    console.log('🔄 Mise à jour des résultats ML (Supabase)...');

    const supabase = getSupabase();
    
    if (!supabase) {
      return NextResponse.json({
        success: false,
        error: 'Configuration Supabase manquante',
        hint: 'Vérifiez NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY'
      }, { status: 500 });
    }

    // Récupérer les pronostics en attente
    const { data: pendingMlPicks, error: fetchError } = await supabase
      .from('ml_picks')
      .select('*')
      .eq('result', 'pending');

    if (fetchError) {
      // Si la table n'existe pas, on retourne un message
      if (fetchError.code === 'PGRST116' || fetchError.message.includes('does not exist')) {
        return NextResponse.json({
          success: true,
          message: 'Table ml_picks non configurée. Veuillez créer la table dans Supabase.',
          sqlHint: `
CREATE TABLE ml_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id VARCHAR(255),
  sport VARCHAR(50) NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  home_team VARCHAR(255) NOT NULL,
  away_team VARCHAR(255) NOT NULL,
  bet VARCHAR(50) NOT NULL,
  bet_label VARCHAR(255),
  odds DECIMAL(10,2),
  win_probability DECIMAL(5,2),
  confidence VARCHAR(20),
  type VARCHAR(50),
  result VARCHAR(20) DEFAULT 'pending',
  actual_winner VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ml_picks_result ON ml_picks(result);
CREATE INDEX idx_ml_picks_date ON ml_picks(date);
          `
        });
      }
      
      return NextResponse.json({
        success: false,
        error: 'Erreur récupération pronostics: ' + fetchError.message
      }, { status: 500 });
    }

    if (!pendingMlPicks || pendingMlPicks.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucun pronostic en attente à mettre à jour',
        updated: 0,
        stats: { total: 0, won: 0, pending: 0, lost: 0 }
      });
    }

    let updated = 0;
    const now = new Date();

    // Vérifier chaque pronostic en attente
    for (const pick of pendingMlPicks as MlPick[]) {
      // Ne vérifier que les matchs qui ont commencé il y a plus de 3 heures
      const matchDate = new Date(pick.date);
      const threeHoursAfterMatch = new Date(matchDate.getTime() + 3 * 60 * 60 * 1000);
      
      if (now < threeHoursAfterMatch) continue; // Match pas encore terminé

      console.log(`  📋 Vérification: ${pick.home_team} vs ${pick.away_team} (${pick.sport})`);

      let result: { winner: string | null; found: boolean } = { winner: null, found: false };

      // Vérifier selon le sport
      switch (pick.sport.toLowerCase()) {
        case 'tennis':
          result = await checkTennisResult(pick.home_team, pick.away_team);
          break;
        case 'basketball':
        case 'nba':
          result = await checkBasketballResult(pick.home_team, pick.away_team);
          break;
        case 'football':
        case 'soccer':
          result = await checkFootballResult(pick.home_team, pick.away_team);
          break;
        case 'hockey':
        case 'nhl':
          result = await checkNHLResult(pick.home_team, pick.away_team);
          break;
      }

      if (result.found && result.winner) {
        const newResult = updateMlPickResult(pick, result.winner);
        
        // Mettre à jour dans Supabase
        const { error: updateError } = await supabase
          .from('ml_picks')
          .update({
            result: newResult,
            actual_winner: result.winner,
            updated_at: new Date().toISOString()
          })
          .eq('id', pick.id);

        if (!updateError) {
          updated++;
          console.log(`    ✅ Résultat: ${newResult} (gagnant: ${result.winner})`);
        }
      }
    }

    // Calculer les statistiques mises à jour
    const { data: allMlPicks } = await supabase
      .from('ml_picks')
      .select('result');

    const stats = {
      total: allMlPicks?.length || 0,
      won: allMlPicks?.filter((p: any) => p.result === 'won').length || 0,
      lost: allMlPicks?.filter((p: any) => p.result === 'lost').length || 0,
      pending: allMlPicks?.filter((p: any) => p.result === 'pending').length || 0
    };

    const ratio = stats.total > 0 ? Math.round((stats.won / (stats.won + stats.lost)) * 100) : 0;

    console.log(`✅ Mise à jour terminée: ${updated} pronostics mis à jour`);

    return NextResponse.json({
      success: true,
      message: `${updated} pronostic(s) mis à jour`,
      updated,
      stats: {
        ...stats,
        ratio
      }
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

/**
 * POST - Ajouter un nouveau pronostic
 */
export async function POST(request: Request) {
  try {
    const supabase = getSupabase();
    
    if (!supabase) {
      return NextResponse.json({
        success: false,
        error: 'Configuration Supabase manquante'
      }, { status: 500 });
    }

    const body = await request.json();
    const { 
      match_id, 
      sport, 
      date, 
      home_team, 
      away_team, 
      bet, 
      bet_label, 
      odds, 
      win_probability, 
      confidence, 
      type 
    } = body;

    if (!sport || !date || !home_team || !away_team || !bet) {
      return NextResponse.json({
        success: false,
        error: 'Champs requis: sport, date, home_team, away_team, bet'
      }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('ml_picks')
      .insert({
        match_id,
        sport,
        date,
        home_team,
        away_team,
        bet,
        bet_label,
        odds,
        win_probability,
        confidence,
        type,
        result: 'pending'
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({
        success: false,
        error: 'Erreur création pronostic: ' + error.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Pronostic ajouté avec succès',
      pick: data
    });

  } catch (error) {
    console.error('Erreur ajout pronostic:', error);
    return NextResponse.json({
      success: false,
      error: 'Erreur lors de l\'ajout du pronostic'
    }, { status: 500 });
  }
}
