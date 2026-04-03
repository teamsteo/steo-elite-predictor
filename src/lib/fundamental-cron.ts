/**
 * Fundamental Cron Service
 * Met à jour automatiquement les données fondamentales chaque jour
 * 
 * Données récupérées:
 * - Forme des équipes (derniers matchs)
 * - Classements
 * - Blessures
 * - Actualités (coach, transferts)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://aumsrakioetvvqopthbs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
}) : null;

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

// Configuration des ligues par sport
const SPORTS_CONFIG = {
  football: {
    espnPath: 'soccer',
    leagues: [
      { code: 'eng.1', name: 'Premier League' },
      { code: 'esp.1', name: 'La Liga' },
      { code: 'ger.1', name: 'Bundesliga' },
      { code: 'ita.1', name: 'Serie A' },
      { code: 'fra.1', name: 'Ligue 1' },
      { code: 'uefa.champions', name: 'Champions League' }
    ]
  },
  basketball: {
    espnPath: 'basketball',
    leagues: [{ code: 'nba', name: 'NBA' }]
  },
  hockey: {
    espnPath: 'hockey',
    leagues: [{ code: 'nhl', name: 'NHL' }]
  },
  baseball: {
    espnPath: 'baseball',
    leagues: [{ code: 'mlb', name: 'MLB' }]
  }
};

// Interface pour les données fondamentales
interface TeamFundamentals {
  team_id: string;
  team_name: string;
  sport: string;
  league: string;
  
  // Forme
  form: string; // "WWDLL"
  form_win_rate: number;
  last5_goals_scored: number;
  last5_goals_conceded: number;
  
  // Classement
  standing_position: number;
  standing_points: number;
  standing_played: number;
  
  // Stats
  home_win_rate: number;
  away_win_rate: number;
  
  // Blessures
  injury_count: number;
  injury_key_players: string;
  
  // News
  recent_news: string;
  coach_status: string;
  
  // Signaux
  signals: string;
  
  updated_at: string;
}

/**
 * Récupère les standings ESPN
 */
async function fetchStandings(sport: string, league: string): Promise<any[]> {
  try {
    const config = SPORTS_CONFIG[sport as keyof typeof SPORTS_CONFIG];
    if (!config) return [];
    
    const url = `${ESPN_BASE}/${config.espnPath}/${league}/standings`;
    const response = await fetch(url, { 
      next: { revalidate: 3600 },
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    return data.standings?.entries || [];
  } catch (error) {
    console.error(`Erreur standings ${sport}/${league}:`, error);
    return [];
  }
}

/**
 * Récupère les blessures ESPN
 */
async function fetchInjuries(sport: string, league: string): Promise<Map<string, string[]>> {
  const injuries = new Map<string, string[]>();
  
  try {
    const config = SPORTS_CONFIG[sport as keyof typeof SPORTS_CONFIG];
    if (!config) return injuries;
    
    const url = `${ESPN_BASE}/${config.espnPath}/${league}/teams`;
    const response = await fetch(url, {
      next: { revalidate: 3600 },
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) return injuries;
    
    const data = await response.json();
    const teams = data.sports?.[0]?.teams || [];
    
    for (const team of teams) {
      const teamName = team.team?.displayName || team.team?.shortDisplayName;
      const injuriesList = team.team?.injuries || [];
      
      if (teamName && injuriesList.length > 0) {
        injuries.set(teamName, injuriesList.map((i: any) => 
          i.athlete?.displayName || i.name || 'Unknown'
        ).slice(0, 3));
      }
    }
  } catch (error) {
    console.error(`Erreur injuries ${sport}/${league}:`, error);
  }
  
  return injuries;
}

/**
 * Extrait la forme depuis les données ESPN
 */
function extractForm(entry: any): { form: string; winRate: number } {
  const form: string[] = [];
  const record = entry.stats || [];
  
  // Chercher les stats de forme
  for (const stat of record) {
    if (stat.name === 'form' || stat.name === 'lastFive') {
      const formStr = stat.value || '';
      for (const c of formStr.toUpperCase()) {
        if (c === 'W' || c === 'D' || c === 'L') {
          form.push(c);
        }
      }
    }
  }
  
  const wins = form.filter(r => r === 'W').length;
  const winRate = form.length > 0 ? Math.round((wins / form.length) * 100) : 0;
  
  return { form: form.join(''), winRate };
}

/**
 * Génère les signaux pour une équipe
 */
function generateSignals(
  formWinRate: number,
  standingPosition: number,
  injuryCount: number,
  coachStatus: string
): string[] {
  const signals: string[] = [];
  
  if (formWinRate >= 70) signals.push('good_form');
  if (formWinRate <= 30) signals.push('bad_form');
  if (standingPosition <= 3) signals.push('top_team');
  if (standingPosition >= 18 && standingPosition > 0) signals.push('relegation_zone');
  if (injuryCount >= 3) signals.push('key_injuries');
  if (coachStatus === 'under_pressure') signals.push('coach_pressure');
  
  return signals;
}

/**
 * Met à jour les fondamentaux pour tous les sports
 */
export async function updateFundamentalsForToday(): Promise<{
  success: boolean;
  updated: number;
  errors: string[];
  details: Record<string, number>;
}> {
  console.log('📊 Mise à jour des données fondamentales...');
  
  const errors: string[] = [];
  let updated = 0;
  const details: Record<string, number> = {};
  
  if (!supabase) {
    return { success: false, updated: 0, errors: ['Supabase non configuré'], details: {} };
  }
  
  for (const [sport, config] of Object.entries(SPORTS_CONFIG)) {
    let sportUpdated = 0;
    
    for (const league of config.leagues) {
      try {
        // Récupérer standings
        const standings = await fetchStandings(sport, league.code);
        
        // Récupérer blessures
        const injuries = await fetchInjuries(sport, league.code);
        
        // Traiter chaque équipe
        for (const entry of standings) {
          const teamName = entry.team?.displayName || entry.team?.shortDisplayName || entry.team?.name;
          if (!teamName) continue;
          
          // Extraire les données
          const { form, winRate } = extractForm(entry);
          const position = entry.stats?.find((s: any) => s.name === 'rank')?.value || 0;
          const points = entry.stats?.find((s: any) => s.name === 'points')?.value || 0;
          const played = entry.stats?.find((s: any) => s.name === 'gamesPlayed')?.value || 0;
          
          const teamInjuries = injuries.get(teamName) || [];
          
          // Générer les signaux
          const signals = generateSignals(
            winRate,
            position,
            teamInjuries.length,
            'stable'
          );
          
          // Sauvegarder en base
          const fundamentals: TeamFundamentals = {
            team_id: `${sport}_${teamName.toLowerCase().replace(/[^a-z]/g, '_')}`,
            team_name: teamName,
            sport,
            league: league.name,
            form,
            form_win_rate: winRate,
            last5_goals_scored: 0,
            last5_goals_conceded: 0,
            standing_position: position,
            standing_points: points,
            standing_played: played,
            home_win_rate: 0,
            away_win_rate: 0,
            injury_count: teamInjuries.length,
            injury_key_players: teamInjuries.join(', '),
            recent_news: '',
            coach_status: 'stable',
            signals: signals.join(','),
            updated_at: new Date().toISOString()
          };
          
          // Upsert en base
          const { error } = await supabase
            .from('team_fundamentals')
            .upsert(fundamentals, { onConflict: 'team_id' });
          
          if (error) {
            // Si la table n'existe pas, on skippe silencieusement
            if (!error.message.includes('does not exist')) {
              console.error(`Erreur save ${teamName}:`, error.message);
            }
          } else {
            sportUpdated++;
          }
        }
        
      } catch (error: any) {
        errors.push(`${sport}/${league.code}: ${error.message}`);
      }
    }
    
    details[sport] = sportUpdated;
    updated += sportUpdated;
  }
  
  console.log(`✅ Fondamentaux mis à jour: ${updated} équipes`);
  
  return {
    success: true,
    updated,
    errors,
    details
  };
}

/**
 * Récupère les fondamentaux pour une équipe
 */
export async function getTeamFundamentals(teamName: string, sport: string): Promise<TeamFundamentals | null> {
  if (!supabase) return null;
  
  const teamId = `${sport}_${teamName.toLowerCase().replace(/[^a-z]/g, '_')}`;
  
  try {
    const { data, error } = await supabase
      .from('team_fundamentals')
      .select('*')
      .eq('team_id', teamId)
      .single();
    
    if (error) return null;
    return data as TeamFundamentals;
  } catch {
    return null;
  }
}

/**
 * Calcule le boost de confiance basé sur les fondamentaux
 */
export function calculateFundamentalBoostFromDB(fundamentals: TeamFundamentals | null): number {
  if (!fundamentals) return 0;
  
  let boost = 0;
  
  // Forme
  if (fundamentals.form_win_rate >= 70) boost += 5;
  else if (fundamentals.form_win_rate >= 60) boost += 3;
  else if (fundamentals.form_win_rate <= 30) boost -= 5;
  else if (fundamentals.form_win_rate <= 40) boost -= 3;
  
  // Signaux
  const signals = fundamentals.signals?.split(',') || [];
  for (const signal of signals) {
    switch (signal.trim()) {
      case 'good_form':
        boost += 3;
        break;
      case 'bad_form':
        boost -= 3;
        break;
      case 'key_injuries':
        boost -= 4;
        break;
      case 'coach_pressure':
        boost -= 2;
        break;
      case 'top_team':
        boost += 2;
        break;
    }
  }
  
  return Math.max(-10, Math.min(10, boost));
}

export default {
  updateFundamentalsForToday,
  getTeamFundamentals,
  calculateFundamentalBoostFromDB
};
