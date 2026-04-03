/**
 * Met à jour les patterns ML avec support données fondamentales
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://aumsrakioetvvqopthbs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const now = new Date().toISOString();

const patterns = [
  // ============ FOOTBALL ============
  {
    id: 'foot_home_favorite_15',
    sport: 'football',
    pattern_type: 'home_favorite',
    condition: 'odds_home < 1.5 AND fundamental_boost > -5',
    outcome: 'home_win',
    sample_size: 187,
    success_rate: 88,
    confidence: 0.92,
    description: 'Favori domicile cote <1.5: 88% succès [CI:82-93%] + check fondamentaux',
    last_updated: now
  },
  {
    id: 'foot_home_favorite_18',
    sport: 'football',
    pattern_type: 'home_favorite_moderate',
    condition: 'odds_home >= 1.5 AND odds_home < 1.8 AND no_negative_signals',
    outcome: 'home_win',
    sample_size: 245,
    success_rate: 75,
    confidence: 0.80,
    description: 'Favori modéré (1.5-1.8): 75% succès - vérifier signaux négatifs',
    last_updated: now
  },
  {
    id: 'foot_away_favorite_18',
    sport: 'football',
    pattern_type: 'away_favorite',
    condition: 'odds_away < 1.8',
    outcome: 'away_win',
    sample_size: 198,
    success_rate: 72,
    confidence: 0.78,
    description: 'Favori extérieur <1.8: 72% succès',
    last_updated: now
  },
  {
    id: 'foot_top_team_home',
    sport: 'football',
    pattern_type: 'elite_team',
    condition: 'top_team AND odds_home < 2.0 AND form_win_rate > 50',
    outcome: 'home_win',
    sample_size: 312,
    success_rate: 82,
    confidence: 0.85,
    description: 'Équipe elite en forme à domicile: 82%',
    last_updated: now
  },
  {
    id: 'foot_coach_pressure',
    sport: 'football',
    pattern_type: 'fundamental_negative',
    condition: 'coach_status = under_pressure',
    outcome: 'avoid_home_bet',
    sample_size: 45,
    success_rate: 68,
    confidence: 0.70,
    description: 'Coach sous pression: éviter paris domicile (68% négatif)',
    last_updated: now
  },
  {
    id: 'foot_good_form',
    sport: 'football',
    pattern_type: 'fundamental_positive',
    condition: 'form_win_rate >= 70 AND no_key_injuries',
    outcome: 'home_win_boost',
    sample_size: 89,
    success_rate: 78,
    confidence: 0.75,
    description: 'Excellente forme sans blessés: +15% confiance',
    last_updated: now
  },
  
  // ============ BASKETBALL ============
  {
    id: 'basket_over_220',
    sport: 'basketball',
    pattern_type: 'total_points',
    condition: 'true',
    outcome: 'over_220',
    sample_size: 408,
    success_rate: 75,
    confidence: 0.85,
    description: 'NBA Over 220pts: 75% succès - TOUS MATCHS',
    last_updated: now
  },
  {
    id: 'basket_home_favorite',
    sport: 'basketball',
    pattern_type: 'home_favorite',
    condition: 'odds_home < 1.5',
    outcome: 'home_win',
    sample_size: 156,
    success_rate: 78,
    confidence: 0.82,
    description: 'Favori NBA domicile <1.5: 78%',
    last_updated: now
  },
  {
    id: 'basket_back_to_back',
    sport: 'basketball',
    pattern_type: 'fundamental_negative',
    condition: 'back_to_back_games = true',
    outcome: 'fade_favorite',
    sample_size: 62,
    success_rate: 65,
    confidence: 0.68,
    description: 'Back-to-back: fatigué, éviter favori',
    last_updated: now
  },
  
  // ============ HOCKEY ============
  {
    id: 'nhl_over_55',
    sport: 'hockey',
    pattern_type: 'total_goals',
    condition: 'true',
    outcome: 'over_5.5',
    sample_size: 1451,
    success_rate: 59,
    confidence: 0.75,
    description: 'NHL Over 5.5: 59% succès - TOUS MATCHS',
    last_updated: now
  },
  {
    id: 'nhl_oilers_home',
    sport: 'hockey',
    pattern_type: 'team_home',
    condition: 'home_team = Edmonton Oilers',
    outcome: 'home_win',
    sample_size: 31,
    success_rate: 74,
    confidence: 0.80,
    description: 'Oilers domicile: 74% victoire',
    last_updated: now
  },
  {
    id: 'nhl_bruins_home',
    sport: 'hockey',
    pattern_type: 'team_home',
    condition: 'home_team = Boston Bruins',
    outcome: 'home_win',
    sample_size: 41,
    success_rate: 68,
    confidence: 0.75,
    description: 'Bruins domicile: 68% victoire',
    last_updated: now
  },
  {
    id: 'nhl_goalie_matchup',
    sport: 'hockey',
    pattern_type: 'fundamental_positive',
    condition: 'starting_goalie_save_pct > 0.920',
    outcome: 'under_boost',
    sample_size: 78,
    success_rate: 62,
    confidence: 0.70,
    description: 'Gardien elite: tendance Under',
    last_updated: now
  },
  
  // ============ BASEBALL ============
  {
    id: 'mlb_over_75',
    sport: 'baseball',
    pattern_type: 'total_runs',
    condition: 'true',
    outcome: 'over_7.5',
    sample_size: 4993,
    success_rate: 62,
    confidence: 0.70,
    description: 'MLB Over 7.5: 62% succès - TOUS MATCHS',
    last_updated: now
  },
  {
    id: 'mlb_reds_over',
    sport: 'baseball',
    pattern_type: 'team_over',
    condition: 'team = Cincinnati Reds',
    outcome: 'over_7.5',
    sample_size: 33,
    success_rate: 85,
    confidence: 0.90,
    description: 'Reds: 85% Over 7.5',
    last_updated: now
  },
  {
    id: 'mlb_redsox_over',
    sport: 'baseball',
    pattern_type: 'team_over',
    condition: 'team = Boston Red Sox',
    outcome: 'over_7.5',
    sample_size: 36,
    success_rate: 81,
    confidence: 0.88,
    description: 'Red Sox: 81% Over 7.5',
    last_updated: now
  },
  {
    id: 'mlb_pitcher_matchup',
    sport: 'baseball',
    pattern_type: 'fundamental_positive',
    condition: 'starting_pitcher_era < 3.00',
    outcome: 'under_boost',
    sample_size: 124,
    success_rate: 58,
    confidence: 0.65,
    description: 'Lanceur elite (ERA <3): tendance Under',
    last_updated: now
  }
];

async function updatePatterns() {
  console.log('💾 Mise à jour patterns ML + fondamentaux\n');
  
  // Supprimer anciens
  await supabase.from('ml_patterns').delete().neq('id', 'xxx');
  console.log('🗑️ Anciens patterns supprimés');
  
  // Insérer nouveaux
  let count = 0;
  for (const p of patterns) {
    const { error } = await supabase.from('ml_patterns').insert(p);
    if (!error) {
      console.log(`✅ ${p.sport}: ${p.id} (${p.success_rate}%)`);
      count++;
    }
  }
  
  console.log(`\n📊 ${count}/${patterns.length} patterns sauvegardés`);
  
  // Stats
  const { data } = await supabase.from('ml_patterns').select('sport');
  if (data) {
    const bySport = data.reduce((acc, p) => {
      acc[p.sport] = (acc[p.sport] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('\n📈 Par sport:');
    Object.entries(bySport).forEach(([sport, count]) => {
      console.log(`   ${sport}: ${count} patterns`);
    });
  }
}

updatePatterns();
