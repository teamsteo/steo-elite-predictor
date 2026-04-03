const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://aumsrakioetvvqopthbs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

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
