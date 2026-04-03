import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://aumsrakioetvvqopthbs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkSchema() {
  // Essayer d'insérer un pattern test pour voir les colonnes
  const testPattern = {
    id: 'test_schema_check',
    sport: 'football',
    pattern_type: 'test',
    condition: 'test',
    outcome: 'test',
    sample_size: 1,
    success_rate: 50,
    confidence: 0.5,
    description: 'test'
  };
  
  const { error } = await supabase
    .from('ml_patterns')
    .insert(testPattern);
  
  if (error) {
    console.log('Erreur:', error.message);
  }
  
  // Récupérer un pattern existant pour voir les colonnes
  const { data, error: selectError } = await supabase
    .from('ml_patterns')
    .select('*')
    .limit(1);
  
  if (selectError) {
    console.log('Erreur select:', selectError.message);
  } else if (data && data.length > 0) {
    console.log('Colonnes existantes:', Object.keys(data[0]));
  } else {
    console.log('Table vide ou n\'existe pas');
  }
  
  // Supprimer le test
  await supabase.from('ml_patterns').delete().eq('id', 'test_schema_check');
}

checkSchema();
