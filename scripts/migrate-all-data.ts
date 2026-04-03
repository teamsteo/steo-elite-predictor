/**
 * Script de migration complète - Transfère toutes les données de l'ancienne base vers la nouvelle
 * Ancienne base: https://aumsrakioetvvqopthbs.supabase.co
 * Nouvelle base: elitepronopro
 */

import { createClient } from '@supabase/supabase-js';

// Ancienne base de données (source)
const OLD_SUPABASE_URL = 'https://aumsrakioetvvqopthbs.supabase.co';
const OLD_SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

// Nouvelle base de données (destination)
const NEW_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jlqfcyphqpqzmerqzncr.supabase.co';
const NEW_SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpscWZjeXBocXBxem1lcnF6bmNyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDkzMDY2NSwiZXhwIjoyMDU2NTA2NjY1fQ.JQb6NV7oG2Z0Nr9rPRmX2eUfWCdKVOyPZLLOUJrI-PU';

async function migrateData() {
  console.log('🚀 Début de la migration complète des données...\n');
  
  // Créer les clients
  const oldDb = createClient(OLD_SUPABASE_URL, OLD_SUPABASE_SERVICE_KEY);
  const newDb = createClient(NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_KEY);
  
  let totalMigrated = 0;
  
  // 1. Migrer les matches de football
  console.log('📦 Migration de football_matches...');
  const { data: footballMatches, error: footballError } = await oldDb
    .from('football_matches')
    .select('*');
  
  if (footballError) {
    console.error('❌ Erreur lecture football_matches:', footballError.message);
  } else if (footballMatches && footballMatches.length > 0) {
    console.log(`   Trouvé ${footballMatches.length} matches de football`);
    
    // Insérer par batches de 100
    const batchSize = 100;
    for (let i = 0; i < footballMatches.length; i += batchSize) {
      const batch = footballMatches.slice(i, i + batchSize);
      const { error: insertError } = await newDb
        .from('football_matches')
        .insert(batch);
      
      if (insertError) {
        console.error(`   ❌ Erreur insertion batch ${i}-${i + batchSize}:`, insertError.message);
      } else {
        console.log(`   ✅ Batch ${i + 1}-${Math.min(i + batchSize, footballMatches.length)} inséré`);
      }
    }
    totalMigrated += footballMatches.length;
  }
  
  // 2. Migrer les matches de basketball
  console.log('\n📦 Migration de basketball_matches...');
  const { data: basketballMatches, error: basketballError } = await oldDb
    .from('basketball_matches')
    .select('*');
  
  if (basketballError) {
    console.error('❌ Erreur lecture basketball_matches:', basketballError.message);
  } else if (basketballMatches && basketballMatches.length > 0) {
    console.log(`   Trouvé ${basketballMatches.length} matches de basketball`);
    
    const batchSize = 100;
    for (let i = 0; i < basketballMatches.length; i += batchSize) {
      const batch = basketballMatches.slice(i, i + batchSize);
      const { error: insertError } = await newDb
        .from('basketball_matches')
        .insert(batch);
      
      if (insertError) {
        console.error(`   ❌ Erreur insertion batch ${i}-${i + batchSize}:`, insertError.message);
      } else {
        console.log(`   ✅ Batch ${i + 1}-${Math.min(i + batchSize, basketballMatches.length)} inséré`);
      }
    }
    totalMigrated += basketballMatches.length;
  }
  
  // 3. Migrer les matches NHL
  console.log('\n📦 Migration de nhl_matches...');
  const { data: nhlMatches, error: nhlError } = await oldDb
    .from('nhl_matches')
    .select('*');
  
  if (nhlError) {
    console.error('❌ Erreur lecture nhl_matches:', nhlError.message);
  } else if (nhlMatches && nhlMatches.length > 0) {
    console.log(`   Trouvé ${nhlMatches.length} matches NHL`);
    
    const batchSize = 100;
    for (let i = 0; i < nhlMatches.length; i += batchSize) {
      const batch = nhlMatches.slice(i, i + batchSize);
      const { error: insertError } = await newDb
        .from('nhl_matches')
        .insert(batch);
      
      if (insertError) {
        console.error(`   ❌ Erreur insertion batch ${i}-${i + batchSize}:`, insertError.message);
      } else {
        console.log(`   ✅ Batch ${i + 1}-${Math.min(i + batchSize, nhlMatches.length)} inséré`);
      }
    }
    totalMigrated += nhlMatches.length;
  }
  
  // 4. Migrer les matches MLB
  console.log('\n📦 Migration de mlb_matches...');
  const { data: mlbMatches, error: mlbError } = await oldDb
    .from('mlb_matches')
    .select('*');
  
  if (mlbError) {
    console.error('❌ Erreur lecture mlb_matches:', mlbError.message);
  } else if (mlbMatches && mlbMatches.length > 0) {
    console.log(`   Trouvé ${mlbMatches.length} matches MLB`);
    
    const batchSize = 100;
    for (let i = 0; i < mlbMatches.length; i += batchSize) {
      const batch = mlbMatches.slice(i, i + batchSize);
      const { error: insertError } = await newDb
        .from('mlb_matches')
        .insert(batch);
      
      if (insertError) {
        console.error(`   ❌ Erreur insertion batch ${i}-${i + batchSize}:`, insertError.message);
      } else {
        console.log(`   ✅ Batch ${i + 1}-${Math.min(i + batchSize, mlbMatches.length)} inséré`);
      }
    }
    totalMigrated += mlbMatches.length;
  }
  
  // 5. Migrer les patterns ML
  console.log('\n📦 Migration de ml_patterns...');
  const { data: mlPatterns, error: patternsError } = await oldDb
    .from('ml_patterns')
    .select('*');
  
  if (patternsError) {
    console.error('❌ Erreur lecture ml_patterns:', patternsError.message);
  } else if (mlPatterns && mlPatterns.length > 0) {
    console.log(`   Trouvé ${mlPatterns.length} patterns ML`);
    
    const { error: insertError } = await newDb
      .from('ml_patterns')
      .insert(mlPatterns);
    
    if (insertError) {
      console.error('   ❌ Erreur insertion ml_patterns:', insertError.message);
    } else {
      console.log(`   ✅ ${mlPatterns.length} patterns ML insérés`);
      totalMigrated += mlPatterns.length;
    }
  }
  
  // 6. Migrer les prédictions
  console.log('\n📦 Migration de predictions...');
  const { data: predictions, error: predictionsError } = await oldDb
    .from('predictions')
    .select('*');
  
  if (predictionsError) {
    console.error('❌ Erreur lecture predictions:', predictionsError.message);
  } else if (predictions && predictions.length > 0) {
    console.log(`   Trouvé ${predictions.length} prédictions`);
    
    const batchSize = 100;
    for (let i = 0; i < predictions.length; i += batchSize) {
      const batch = predictions.slice(i, i + batchSize);
      const { error: insertError } = await newDb
        .from('predictions')
        .insert(batch);
      
      if (insertError) {
        console.error(`   ❌ Erreur insertion batch ${i}-${i + batchSize}:`, insertError.message);
      } else {
        console.log(`   ✅ Batch ${i + 1}-${Math.min(i + batchSize, predictions.length)} inséré`);
      }
    }
    totalMigrated += predictions.length;
  }
  
  // 7. Migrer les bankroll_stats
  console.log('\n📦 Migration de bankroll_stats...');
  const { data: bankrollStats, error: bankrollError } = await oldDb
    .from('bankroll_stats')
    .select('*');
  
  if (bankrollError) {
    console.error('❌ Erreur lecture bankroll_stats:', bankrollError.message);
  } else if (bankrollStats && bankrollStats.length > 0) {
    console.log(`   Trouvé ${bankrollStats.length} entrées bankroll`);
    
    const { error: insertError } = await newDb
      .from('bankroll_stats')
      .insert(bankrollStats);
    
    if (insertError) {
      console.error('   ❌ Erreur insertion bankroll_stats:', insertError.message);
    } else {
      console.log(`   ✅ ${bankrollStats.length} entrées bankroll insérées`);
      totalMigrated += bankrollStats.length;
    }
  }
  
  // 8. Migrer les users
  console.log('\n📦 Migration de users...');
  const { data: users, error: usersError } = await oldDb
    .from('users')
    .select('*');
  
  if (usersError) {
    console.error('❌ Erreur lecture users:', usersError.message);
  } else if (users && users.length > 0) {
    console.log(`   Trouvé ${users.length} utilisateurs`);
    
    const { error: insertError } = await newDb
      .from('users')
      .insert(users);
    
    if (insertError) {
      console.error('   ❌ Erreur insertion users:', insertError.message);
    } else {
      console.log(`   ✅ ${users.length} utilisateurs insérés`);
      totalMigrated += users.length;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`🎉 Migration terminée ! Total: ${totalMigrated} enregistrements migrés`);
  console.log('='.repeat(50));
}

// Exécuter la migration
migrateData().catch(console.error);
