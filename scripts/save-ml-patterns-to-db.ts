/**
 * Sauvegarde définitive des patterns ML dans Supabase
 * Table: ml_patterns (colonnes existantes)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://aumsrakioetvvqopthbs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const now = new Date().toISOString();

// Tous les patterns validés statistiquement
// Description inclut les stats: [CI lower-upper, p-value, significance]
const patterns = [
  // ============ FOOTBALL ============
  {
    id: 'foot_home_favorite_15',
    sport: 'football',
    pattern_type: 'home_favorite',
    condition: 'odds_home < 1.5',
    outcome: 'home_win',
    sample_size: 187,
    success_rate: 88,
    confidence: 0.92,
    description: 'Favori domicile cote <1.5: 88% succès [CI:82-93%, p<0.001, highly_significant] (187 matchs)',
    last_updated: now
  },
  {
    id: 'foot_xg_differential_05',
    sport: 'football',
    pattern_type: 'xg_differential',
    condition: 'abs(home_xg - away_xg) >= 0.5',
    outcome: 'xg_favorite_wins',
    sample_size: 412,
    success_rate: 93,
    confidence: 0.95,
    description: 'xG écart >=0.5: favori gagne 93% [CI:90-96%, p<0.001, highly_significant] (412 matchs)',
    last_updated: now
  },
  {
    id: 'foot_over_xg_28',
    sport: 'football',
    pattern_type: 'over_xg_threshold',
    condition: 'home_xg + away_xg >= 2.8',
    outcome: 'over_2.5',
    sample_size: 156,
    success_rate: 84,
    confidence: 0.88,
    description: 'xG total >=2.8: Over 2.5 à 84% [CI:77-89%, p<0.001, highly_significant] (156 matchs)',
    last_updated: now
  },
  {
    id: 'foot_under_xg_22',
    sport: 'football',
    pattern_type: 'under_xg_threshold',
    condition: 'home_xg + away_xg <= 2.2',
    outcome: 'under_2.5',
    sample_size: 12,
    success_rate: 100,
    confidence: 0.70,
    description: 'xG total <=2.2: Under 2.5 à 100% [CI:74-100%, p=0.05, marginal] ATTENTION: échantillon petit (12 matchs)',
    last_updated: now
  },

  // ============ BASKETBALL ============
  {
    id: 'basket_over_220',
    sport: 'basketball',
    pattern_type: 'league_scoring_rate',
    condition: 'league_avg_points > 220',
    outcome: 'over_220',
    sample_size: 408,
    success_rate: 75,
    confidence: 0.85,
    description: 'NBA Over 220pts: 75% succès [CI:70-79%, p<0.001, highly_significant] (408 matchs)',
    last_updated: now
  },

  // ============ HOCKEY (NHL) ============
  {
    id: 'nhl_oilers_home',
    sport: 'hockey',
    pattern_type: 'team_home_advantage',
    condition: 'home_team = "Edmonton Oilers"',
    outcome: 'home_win',
    sample_size: 31,
    success_rate: 74,
    confidence: 0.80,
    description: 'Edmonton Oilers domicile: 74% victoire [CI:57-86%, p=0.027, significant] (31 matchs)',
    last_updated: now
  },
  {
    id: 'nhl_over_55',
    sport: 'hockey',
    pattern_type: 'total_goals',
    condition: 'sport = hockey',
    outcome: 'over_5.5',
    sample_size: 1451,
    success_rate: 59,
    confidence: 0.75,
    description: 'NHL Over 5.5 buts: 59% succès [CI:56-61%, p<0.001, highly_significant] (1451 matchs)',
    last_updated: now
  },

  // ============ BASEBALL (MLB) ============
  {
    id: 'mlb_reds_over',
    sport: 'baseball',
    pattern_type: 'team_over',
    condition: 'home_team = "Cincinnati Reds" OR away_team = "Cincinnati Reds"',
    outcome: 'over_7.5',
    sample_size: 33,
    success_rate: 85,
    confidence: 0.90,
    description: 'Cincinnati Reds: 85% Over 7.5 [CI:69-94%, p<0.001, highly_significant] (33 matchs)',
    last_updated: now
  },
  {
    id: 'mlb_redsox_over',
    sport: 'baseball',
    pattern_type: 'team_over',
    condition: 'home_team = "Boston Red Sox" OR away_team = "Boston Red Sox"',
    outcome: 'over_7.5',
    sample_size: 36,
    success_rate: 81,
    confidence: 0.88,
    description: 'Boston Red Sox: 81% Over 7.5 [CI:65-91%, p<0.001, highly_significant] (36 matchs)',
    last_updated: now
  },
  {
    id: 'mlb_diamondbacks_over',
    sport: 'baseball',
    pattern_type: 'team_over',
    condition: 'home_team = "Arizona Diamondbacks" OR away_team = "Arizona Diamondbacks"',
    outcome: 'over_7.5',
    sample_size: 35,
    success_rate: 80,
    confidence: 0.87,
    description: 'Arizona Diamondbacks: 80% Over 7.5 [CI:64-90%, p<0.001, highly_significant] (35 matchs)',
    last_updated: now
  },
  {
    id: 'mlb_rockies_over',
    sport: 'baseball',
    pattern_type: 'team_over',
    condition: 'home_team = "Colorado Rockies" OR away_team = "Colorado Rockies"',
    outcome: 'over_7.5',
    sample_size: 33,
    success_rate: 79,
    confidence: 0.85,
    description: 'Colorado Rockies: 79% Over 7.5 [CI:62-90%, p<0.001, highly_significant] (33 matchs)',
    last_updated: now
  },
  {
    id: 'mlb_braves_over',
    sport: 'baseball',
    pattern_type: 'team_over',
    condition: 'home_team = "Atlanta Braves" OR away_team = "Atlanta Braves"',
    outcome: 'over_7.5',
    sample_size: 34,
    success_rate: 76,
    confidence: 0.82,
    description: 'Atlanta Braves: 76% Over 7.5 [CI:59-88%, p=0.005, significant] (34 matchs)',
    last_updated: now
  },
  {
    id: 'mlb_over_75',
    sport: 'baseball',
    pattern_type: 'total_runs',
    condition: 'sport = baseball',
    outcome: 'over_7.5',
    sample_size: 4993,
    success_rate: 62,
    confidence: 0.70,
    description: 'MLB Over 7.5: 62% succès [CI:61-63%, p<0.001, highly_significant] (4993 matchs)',
    last_updated: now
  }
];

async function savePatterns() {
  console.log('💾 Sauvegarde des patterns ML dans Supabase');
  console.log('='.repeat(60));
  console.log(`📊 ${patterns.length} patterns à sauvegarder\n`);

  // 1. Supprimer les anciens patterns
  console.log('🗑️ Suppression des anciens patterns...');
  const { error: deleteError } = await supabase
    .from('ml_patterns')
    .delete()
    .neq('id', 'xxx');
  
  if (deleteError) {
    console.log('   ⚠️ Erreur:', deleteError.message);
  } else {
    console.log('   ✅ Anciens patterns supprimés');
  }

  // 2. Insérer les nouveaux patterns
  console.log('\n📝 Insertion des nouveaux patterns...\n');
  
  let successCount = 0;
  let errorCount = 0;

  for (const pattern of patterns) {
    const { error } = await supabase
      .from('ml_patterns')
      .insert(pattern);
    
    if (error) {
      console.log(`   ❌ ${pattern.id}: ${error.message}`);
      errorCount++;
    } else {
      const icon = pattern.sport === 'football' ? '⚽' : 
                   pattern.sport === 'basketball' ? '🏀' : 
                   pattern.sport === 'hockey' ? '🏒' : '⚾';
      console.log(`   ✅ ${icon} ${pattern.id}: ${pattern.success_rate}% (${pattern.sample_size} matchs)`);
      successCount++;
    }
  }

  // 3. Vérification
  console.log('\n' + '='.repeat(60));
  console.log('📊 Vérification...');
  
  const { data: savedPatterns, count } = await supabase
    .from('ml_patterns')
    .select('*', { count: 'exact' })
    .order('success_rate', { ascending: false });
  
  console.log(`\n✅ ${successCount} patterns sauvegardés`);
  if (errorCount > 0) console.log(`❌ ${errorCount} erreurs`);
  console.log(`📊 Total en base: ${count} patterns\n`);

  // 4. Résumé par sport
  if (savedPatterns) {
    console.log('📈 Résumé par sport:');
    const sports = [
      { name: 'football', icon: '⚽' },
      { name: 'basketball', icon: '🏀' },
      { name: 'hockey', icon: '🏒' },
      { name: 'baseball', icon: '⚾' }
    ];
    
    for (const { name, icon } of sports) {
      const sportPatterns = savedPatterns.filter(p => p.sport === name);
      if (sportPatterns.length > 0) {
        const avgSuccess = Math.round(sportPatterns.reduce((s, p) => s + p.success_rate, 0) / sportPatterns.length);
        const totalSamples = sportPatterns.reduce((s, p) => s + p.sample_size, 0);
        console.log(`   ${icon} ${name}: ${sportPatterns.length} patterns, ${avgSuccess}% moyen, ${totalSamples} matchs`);
      }
    }
    
    console.log('\n📋 Liste complète:');
    for (const p of savedPatterns) {
      console.log(`   ${p.id}: ${p.success_rate}% sur ${p.sample_size} matchs`);
    }
  }

  console.log('\n🎉 SAUVEGARDE TERMINÉE - Les patterns sont maintenant en base!');
}

savePatterns().catch(console.error);
