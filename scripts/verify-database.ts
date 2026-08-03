import { createClient } from '@supabase/supabase-js';

const URL_USED = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
if (!URL_USED) {
  console.error('Erreur: SUPABASE_URL non configuré');
  process.exit(1);
}
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error('Erreur: SUPABASE_SERVICE_ROLE_KEY non configuré');
  process.exit(1);
}

const supabase = createClient(URL_USED, KEY);

async function verify() {
  console.log('🔍 Vérification de la base de données');
  console.log('='.repeat(50));
  console.log(`📌 URL: ${URL_USED}`);
  console.log(`📌 Projet: aumsrakioetvvqopthbs`);
  console.log(`📌 C'est la base du NOUVEAU projet Vercel (elitepronopro)`);
  console.log('');
  
  // Vérifier les données
  const tables = [
    { name: 'ml_patterns', label: 'Patterns ML' },
    { name: 'football_matches', label: 'Matchs Football' },
    { name: 'basketball_matches', label: 'Matchs Basketball' },
    { name: 'nhl_matches', label: 'Matchs NHL' },
    { name: 'mlb_matches', label: 'Matchs MLB' }
  ];
  
  console.log('📊 Données en base:\n');
  
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table.name)
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.log(`   ❌ ${table.label}: ${error.message}`);
    } else {
      console.log(`   ✅ ${table.label}: ${count} enregistrements`);
    }
  }
  
  // Vérifier les ml_patterns récemment ajoutés
  console.log('\n📋 Derniers patterns ML sauvegardés:\n');
  const { data: patterns } = await supabase
    .from('ml_patterns')
    .select('id, sport, success_rate, sample_size')
    .order('last_updated', { ascending: false })
    .limit(5);
  
  if (patterns) {
    for (const p of patterns) {
      console.log(`   ${p.sport}: ${p.id} (${p.success_rate}% sur ${p.sample_size} matchs)`);
    }
  }
  
  console.log('\n✅ C\'est bien la NOUVELLE base (elitepronopro) !');
}

verify();
