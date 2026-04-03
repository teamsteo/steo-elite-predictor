/**
 * RÉENTRAÎNEMENT MLB AVEC STATS HITS
 * Utilise les nouvelles données ESPN avec hits
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://aumsrakioetvvqopthbs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MIN_SUCCESS_RATE = 70; // Réduit à 70% pour NHL/MLB
const MIN_SAMPLE_SIZE = 20;

interface MLBMatch {
  id: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  result: string;
  home_hits: number | null;
  away_hits: number | null;
  home_errors: number | null;
  away_errors: number | null;
  home_homeruns: number | null;
  away_homeruns: number | null;
}

async function trainMLB() {
  console.log('\n⚾ ENTRAÎNEMENT MLB AVEC HITS');
  console.log('='.repeat(60));
  
  // Charger les matchs avec hits
  const { data: matches } = await supabase
    .from('mlb_matches')
    .select('*')
    .not('home_hits', 'is', null)
    .not('away_hits', 'is', null);
  
  if (!matches || matches.length === 0) {
    console.log('❌ Pas de matchs avec hits disponibles');
    return [];
  }
  
  console.log(`📊 ${matches.length} matchs avec hits disponibles`);
  
  const patterns: any[] = [];
  
  // 1. Pattern Hits Differential
  console.log('\n📈 Analyse Hits Differential...');
  
  const hitsMatches = matches.filter(m => 
    m.home_hits !== null && m.away_hits !== null &&
    m.home_hits > 0 && m.away_hits > 0
  );
  
  for (const threshold of [2, 3, 4, 5, 6]) {
    const applicable = hitsMatches.filter(m => 
      Math.abs(m.home_hits - m.away_hits) >= threshold
    );
    
    if (applicable.length >= MIN_SAMPLE_SIZE) {
      let correct = 0;
      
      applicable.forEach(m => {
        const moreHitsHome = m.home_hits > m.away_hits;
        const homeWins = m.result === 'H';
        
        if ((moreHitsHome && homeWins) || (!moreHitsHome && !homeWins)) {
          correct++;
        }
      });
      
      const successRate = Math.round((correct / applicable.length) * 100);
      
      console.log(`   Hits diff ≥ ${threshold}: ${successRate}% (${applicable.length} matchs)`);
      
      if (successRate >= MIN_SUCCESS_RATE) {
        patterns.push({
          id: `mlb_hits_diff_${threshold}`,
          sport: 'baseball',
          pattern_type: 'hits_differential',
          condition: `abs(home_hits - away_hits) >= ${threshold}`,
          outcome: 'more_hits_wins',
          sample_size: applicable.length,
          success_rate: successRate,
          confidence: Math.min(0.9, 0.5 + applicable.length / 100),
          description: `MLB: Différence coups sûrs ≥ ${threshold} → ${successRate}%`,
          last_updated: new Date().toISOString()
        });
      }
    }
  }
  
  // 2. Pattern Home Team High Hits
  console.log('\n📈 Analyse Home Team High Hits...');
  
  for (const threshold of [8, 9, 10, 11, 12]) {
    const homeHighHits = matches.filter(m => m.home_hits >= threshold);
    
    if (homeHighHits.length >= MIN_SAMPLE_SIZE) {
      const wins = homeHighHits.filter(m => m.result === 'H').length;
      const successRate = Math.round((wins / homeHighHits.length) * 100);
      
      console.log(`   Home hits ≥ ${threshold}: ${successRate}% (${homeHighHits.length} matchs)`);
      
      if (successRate >= MIN_SUCCESS_RATE) {
        patterns.push({
          id: `mlb_home_hits_${threshold}`,
          sport: 'baseball',
          pattern_type: 'home_high_hits',
          condition: `home_hits >= ${threshold}`,
          outcome: 'home_win',
          sample_size: homeHighHits.length,
          success_rate: successRate,
          confidence: Math.min(0.85, 0.5 + homeHighHits.length / 100),
          description: `MLB: ${threshold}+ coups sûrs domicile → ${successRate}%`,
          last_updated: new Date().toISOString()
        });
      }
    }
  }
  
  // 3. Pattern Away Team Low Hits
  console.log('\n📈 Analyse Away Team Low Hits...');
  
  for (const threshold of [4, 5, 6]) {
    const awayLowHits = matches.filter(m => m.away_hits <= threshold);
    
    if (awayLowHits.length >= MIN_SAMPLE_SIZE) {
      const wins = awayLowHits.filter(m => m.result === 'H').length;
      const successRate = Math.round((wins / awayLowHits.length) * 100);
      
      console.log(`   Away hits ≤ ${threshold}: ${successRate}% (${awayLowHits.length} matchs)`);
      
      if (successRate >= MIN_SUCCESS_RATE) {
        patterns.push({
          id: `mlb_away_low_hits_${threshold}`,
          sport: 'baseball',
          pattern_type: 'away_low_hits',
          condition: `away_hits <= ${threshold}`,
          outcome: 'home_win',
          sample_size: awayLowHits.length,
          success_rate: successRate,
          confidence: Math.min(0.8, 0.5 + awayLowHits.length / 100),
          description: `MLB: Extérieur ≤ ${threshold} hits → ${successRate}%`,
          last_updated: new Date().toISOString()
        });
      }
    }
  }
  
  // 4. Pattern Total Runs (approximation via scores)
  console.log('\n📈 Analyse Total Runs...');
  
  const scoreMatches = matches.filter(m => 
    m.home_score !== null && m.away_score !== null
  );
  
  for (const threshold of [7.5, 8.5, 9.5]) {
    const overMatches = scoreMatches.filter(m => 
      (m.home_score + m.away_score) > threshold
    );
    
    const underMatches = scoreMatches.filter(m => 
      (m.home_score + m.away_score) < threshold
    );
    
    if (overMatches.length >= MIN_SAMPLE_SIZE) {
      const rate = Math.round((overMatches.length / scoreMatches.length) * 100);
      console.log(`   Over ${threshold}: ${rate}% (${overMatches.length}/${scoreMatches.length})`);
    }
    
    if (underMatches.length >= MIN_SAMPLE_SIZE) {
      const rate = Math.round((underMatches.length / scoreMatches.length) * 100);
      console.log(`   Under ${threshold}: ${rate}% (${underMatches.length}/${scoreMatches.length})`);
    }
  }
  
  return patterns;
}

async function savePatterns(patterns: any[]) {
  if (patterns.length === 0) {
    console.log('\n⚠️ Aucun pattern atteignant le seuil de 70%');
    return;
  }
  
  console.log(`\n💾 Sauvegarde de ${patterns.length} patterns...`);
  
  // Supprimer les anciens patterns MLB
  await supabase.from('ml_patterns').delete().eq('sport', 'baseball');
  
  const { error } = await supabase.from('ml_patterns').insert(patterns);
  
  if (error) {
    console.log(`❌ Erreur: ${error.message}`);
  } else {
    console.log(`✅ ${patterns.length} patterns MLB sauvegardés!`);
  }
}

async function main() {
  console.log('🧠 ENTRAÎNEMENT MLB AVEC NOUVELLES STATS');
  console.log('='.repeat(60));
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log(`🎯 Seuil minimum succès: ${MIN_SUCCESS_RATE}%`);
  console.log(`🎯 Échantillon minimum: ${MIN_SAMPLE_SIZE} matchs`);
  console.log('='.repeat(60));
  
  const patterns = await trainMLB();
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 RÉSUMÉ');
  console.log('='.repeat(60));
  
  patterns.forEach(p => {
    console.log(`\n✅ ${p.pattern_type}: ${p.success_rate}% (${p.sample_size} matchs)`);
    console.log(`   Condition: ${p.condition}`);
  });
  
  await savePatterns(patterns);
  
  console.log('\n✅ Terminé!');
}

main().catch(console.error);
