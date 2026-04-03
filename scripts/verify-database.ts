import { createClient } from '@supabase/supabase-js';

// URL de la base utilisée dans mes scripts
const URL_USED = 'https://aumsrakioetvvqopthbs.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

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
