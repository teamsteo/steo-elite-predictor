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
