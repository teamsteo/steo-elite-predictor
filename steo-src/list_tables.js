const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  console.error('SUPABASE_URL non configuré');
  process.exit(1);
}
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY non configuré');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function listTables() {
  console.log('🔍 Test des tables dans Supabase...\n');
  
  // Tables to test
  const tablesToTest = [
    'ml_patterns', 'patterns', 'predictions', 'match_history', 'matches',
    'team_fundamentals', 'fundamentals', 'teams', 'users', 'stats',
    'expert_picks', 'picks', 'historical_matches', 'training_data',
    'events', 'leagues', 'sports'
  ];
  
  for (const table of tablesToTest) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (!error) {
        console.log(`✅ ${table} - ${count || 0} enregistrements`);
        
        // Récupérer un sample pour voir les colonnes
        const { data: sample } = await supabase.from(table).select('*').limit(1);
        if (sample && sample.length > 0) {
          const columns = Object.keys(sample[0]).join(', ');
          console.log(`   Colonnes: ${columns.substring(0, 100)}...\n`);
        }
      }
    } catch (e) {
      // Table doesn't exist
    }
  }
}

listTables().catch(console.error);
