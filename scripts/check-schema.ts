/**
 * Vérifier la structure exacte des tables dans l'ancienne base
 */

import { createClient } from '@supabase/supabase-js';

const OLD_SUPABASE_URL = 'https://aumsrakioetvvqopthbs.supabase.co';
const OLD_SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

const oldDb = createClient(OLD_SUPABASE_URL, OLD_SUPABASE_SERVICE_KEY);

async function checkSchema() {
  console.log('🔍 Vérification de la structure des tables...\n');
  
  // Vérifier ml_patterns
  console.log('=== ml_patterns ===');
  const { data: patterns, error: patternsError } = await oldDb
    .from('ml_patterns')
    .select('*')
    .limit(1);
  
  if (patternsError) {
    console.log('Erreur:', patternsError.message);
  } else if (patterns && patterns.length > 0) {
    console.log('Colonnes:', Object.keys(patterns[0]));
    console.log('Exemple:', JSON.stringify(patterns[0], null, 2));
  }
  
  // Vérifier football_matches
  console.log('\n=== football_matches ===');
  const { data: football, error: footballError } = await oldDb
    .from('football_matches')
    .select('*')
    .limit(1);
  
  if (footballError) {
    console.log('Erreur:', footballError.message);
  } else if (football && football.length > 0) {
    console.log('Colonnes:', Object.keys(football[0]));
  }
  
  // Vérifier basketball_matches
  console.log('\n=== basketball_matches ===');
  const { data: basketball, error: basketballError } = await oldDb
    .from('basketball_matches')
    .select('*')
    .limit(1);
  
  if (basketballError) {
    console.log('Erreur:', basketballError.message);
  } else if (basketball && basketball.length > 0) {
    console.log('Colonnes:', Object.keys(basketball[0]));
  }
  
  // Vérifier nhl_matches
  console.log('\n=== nhl_matches ===');
  const { data: nhl, error: nhlError } = await oldDb
    .from('nhl_matches')
    .select('*')
    .limit(1);
  
  if (nhlError) {
    console.log('Erreur:', nhlError.message);
  } else if (nhl && nhl.length > 0) {
    console.log('Colonnes:', Object.keys(nhl[0]));
  }
  
  // Vérifier mlb_matches
  console.log('\n=== mlb_matches ===');
  const { data: mlb, error: mlbError } = await oldDb
    .from('mlb_matches')
    .select('*')
    .limit(1);
  
  if (mlbError) {
    console.log('Erreur:', mlbError.message);
  } else if (mlb && mlb.length > 0) {
    console.log('Colonnes:', Object.keys(mlb[0]));
  }
  
  // Compter les enregistrements
  console.log('\n=== COMPTE DES ENREGISTREMENTS ===');
  
  const tables = ['football_matches', 'basketball_matches', 'nhl_matches', 'mlb_matches', 'ml_patterns'];
  
  for (const table of tables) {
    const { count, error } = await oldDb
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.log(`${table}: Erreur - ${error.message}`);
    } else {
      console.log(`${table}: ${count} enregistrements`);
    }
  }
}

checkSchema().catch(console.error);
