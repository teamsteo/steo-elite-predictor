const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://aumsrakioetvvqopthbs.supabase.co';
// Clé depuis les scripts
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkTables() {
  console.log('🔍 Vérification des tables dans la nouvelle base Supabase...\n');
  
  // Vérifier ml_patterns
  const { data: patterns, error: patternError } = await supabase
    .from('ml_patterns')
    .select('id, name, sport, win_rate, sample_size')
    .order('created_at', { ascending: false });
  
  if (patternError) {
    console.log('❌ Table ml_patterns:', patternError.message);
  } else {
    console.log('✅ Table ml_patterns existe');
    console.log(`   ${patterns?.length || 0} patterns ML sauvegardés`);
    if (patterns && patterns.length > 0) {
      console.log('   Derniers patterns:');
      patterns.slice(0, 5).forEach(p => 
        console.log(`   - ${p.sport}: ${p.name} (${p.win_rate}% sur ${p.sample_size} matchs)`)
      );
    }
  }
  
  // Vérifier team_fundamentals
  const { data: fundamentals, error: fundError } = await supabase
    .from('team_fundamentals')
    .select('team_id, team_name, sport, form')
    .limit(5);
  
  console.log('');
  if (fundError) {
    console.log('⚠️ Table team_fundamentals:', fundError.message);
    console.log('   → Cette table doit être créée pour les données fondamentales');
  } else {
    console.log('✅ Table team_fundamentals existe');
    console.log(`   Données disponibles: ${fundamentals?.length || 0} équipes`);
  }
  
  // Vérifier match_history
  const { data: matches, error: matchError } = await supabase
    .from('match_history')
    .select('id')
    .limit(1);
  
  console.log('');
  if (matchError) {
    console.log('❌ Table match_history:', matchError.message);
  } else {
    console.log('✅ Table match_history existe');
  }
}

checkTables().catch(console.error);
