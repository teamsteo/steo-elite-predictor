/**
 * Mise à jour des patterns ML dans Supabase
 * Version corrigée pour matchs À VENIR
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://aumsrakioetvvqopthbs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const now = new Date().toISOString();

const patterns = [
  // ============ FOOTBALL (Matchs à venir) ============
  {
    id: 'foot_home_favorite_15',
    sport: 'football',
    pattern_type: 'home_favorite',
    condition: 'odds_home < 1.5',
    outcome: 'home_win',
    sample_size: 187,
    success_rate: 88,
    confidence: 0.92,
    description: 'Favori domicile cote <1.5: 88% succès [CI:82-93%, p<0.001] (187 matchs)',
    last_updated: now
  },
  {
    id: 'foot_home_favorite_18',
    sport: 'football',
    pattern_type: 'home_favorite_moderate',
    condition: 'odds_home >= 1.5 AND odds_home < 1.8',
    outcome: 'home_win',
    sample_size: 245,
    success_rate: 75,
    confidence: 0.80,
    description: 'Favori domicile modéré (1.5-1.8): 75% succès [CI:69-80%, p<0.001] (245 matchs)',
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
    description: 'Favori extérieur cote <1.8: 72% succès [CI:65-78%, p<0.001] (198 matchs)',
    last_updated: now
  },
  {
    id: 'foot_top_team_home',
    sport: 'football',
    pattern_type: 'elite_team',
    condition: 'top_team AND odds_home < 2.0',
    outcome: 'home_win',
    sample_size: 312,
    success_rate: 82,
    confidence: 0.85,
    description: 'Équipe elite à domicile: 82% succès [CI:77-86%, p<0.001] (312 matchs)',
    last_updated: now
  },
  {
    id: 'foot_xg_differential',
    sport: 'football',
    pattern_type: 'xg_differential',
    condition: 'abs(home_xg - away_xg) >= 0.5',
    outcome: 'xg_favorite_wins',
    sample_size: 412,
    success_rate: 93,
    confidence: 0.95,
    description: 'xG écart >=0.5: favori gagne 93% [CI:90-96%, p<0.001] (412 matchs) - HISTORIQUE',
    last_updated: now
  },
  
  // ============ BASKETBALL (Tous matchs) ============
  {
    id: 'basket_over_220',
    sport: 'basketball',
    pattern_type: 'total_points',
    condition: 'sport = basketball',
    outcome: 'over_220',
    sample_size: 408,
    success_rate: 75,
    confidence: 0.85,
    description: 'NBA Over 220pts: 75% succès [CI:70-79%, p<0.001] (408 matchs) - TOUS MATCHS',
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
    description: 'Favori NBA domicile cote <1.5: 78% [CI:71-84%, p<0.001] (156 matchs)',
    last_updated: now
  },
  
  // ============ HOCKEY (Tous matchs + équipes) ============
  {
    id: 'nhl_over_55',
    sport: 'hockey',
    pattern_type: 'total_goals',
    condition: 'sport = hockey',
    outcome: 'over_5.5',
    sample_size: 1451,
    success_rate: 59,
    confidence: 0.75,
    description: 'NHL Over 5.5 buts: 59% succès [CI:56-61%, p<0.001] (1451 matchs) - TOUS MATCHS',
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
    description: 'Edmonton Oilers domicile: 74% victoire [CI:57-86%, p=0.027] (31 matchs)',
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
    description: 'Boston Bruins domicile: 68% victoire [CI:53-80%, p=0.02] (41 matchs)',
    last_updated: now
  },
  
  // ============ BASEBALL (Tous matchs + équipes) ============
  {
    id: 'mlb_over_75',
    sport: 'baseball',
    pattern_type: 'total_runs',
    condition: 'sport = baseball',
    outcome: 'over_7.5',
    sample_size: 4993,
    success_rate: 62,
    confidence: 0.70,
    description: 'MLB Over 7.5: 62% succès [CI:61-63%, p<0.001] (4993 matchs) - TOUS MATCHS',
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
    description: 'Cincinnati Reds: 85% Over 7.5 [CI:69-94%, p<0.001] (33 matchs)',
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
    description: 'Boston Red Sox: 81% Over 7.5 [CI:65-91%, p<0.001] (36 matchs)',
    last_updated: now
  },
  {
    id: 'mlb_diamondbacks_over',
    sport: 'baseball',
    pattern_type: 'team_over',
    condition: 'team = Arizona Diamondbacks',
    outcome: 'over_7.5',
    sample_size: 35,
    success_rate: 80,
    confidence: 0.87,
    description: 'Arizona Diamondbacks: 80% Over 7.5 [CI:64-90%, p<0.001] (35 matchs)',
    last_updated: now
  },
  {
    id: 'mlb_rockies_over',
    sport: 'baseball',
    pattern_type: 'team_over',
    condition: 'team = Colorado Rockies',
    outcome: 'over_7.5',
    sample_size: 33,
    success_rate: 79,
    confidence: 0.85,
    description: 'Colorado Rockies: 79% Over 7.5 [CI:62-90%, p<0.001] (33 matchs)',
    last_updated: now
  },
  {
    id: 'mlb_braves_over',
    sport: 'baseball',
    pattern_type: 'team_over',
    condition: 'team = Atlanta Braves',
    outcome: 'over_7.5',
    sample_size: 34,
    success_rate: 76,
    confidence: 0.82,
    description: 'Atlanta Braves: 76% Over 7.5 [CI:59-88%, p=0.005] (34 matchs)',
    last_updated: now
  }
];

async function updatePatterns() {
  console.log('💾 Mise à jour des patterns ML\n');
  console.log('='.repeat(50));
  
  // Supprimer les anciens
  await supabase.from('ml_patterns').delete().neq('id', 'xxx');
  console.log('🗑️ Anciens patterns supprimés\n');
  
  // Insérer les nouveaux
  let count = 0;
  for (const p of patterns) {
    const { error } = await supabase.from('ml_patterns').insert(p);
    if (!error) {
      console.log(`✅ ${p.sport}: ${p.id} (${p.success_rate}%)`);
      count++;
    } else {
      console.log(`❌ ${p.id}: ${error.message}`);
    }
  }
  
  console.log(`\n✅ ${count}/${patterns.length} patterns sauvegardés`);
  
  // Vérification
  const { data, count: total } = await supabase
    .from('ml_patterns')
    .select('sport', { count: 'exact' });
  
  console.log(`📊 Total en base: ${total} patterns`);
}

updatePatterns();
