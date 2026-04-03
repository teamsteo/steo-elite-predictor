const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://aumsrakioetvvqopthbs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkPatterns() {
  console.log('📊 Contenu de la table ml_patterns:\n');
  
  const { data, error } = await supabase
    .from('ml_patterns')
    .select('*');
  
  if (error) {
    console.log('Erreur:', error.message);
    return;
  }
  
  if (data && data.length > 0) {
    console.log(`✅ ${data.length} patterns ML sauvegardés\n`);
    console.log('Colonnes disponibles:', Object.keys(data[0]).join(', '));
    console.log('\n--- Détail des patterns ---\n');
    
    data.forEach((p, i) => {
      console.log(`${i + 1}. [${p.sport}] ${p.pattern_type || p.description?.substring(0, 30)}`);
      console.log(`   Sample: ${p.sample_size} | Success: ${p.success_rate}%`);
      console.log('');
    });
  }
}

checkPatterns().catch(console.error);
