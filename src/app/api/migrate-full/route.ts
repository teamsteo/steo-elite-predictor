/**
 * Migration complète depuis l'ancienne base Supabase
 * Migre TOUT: football_matches, basketball_matches, nhl_matches, mlb_matches, ml_patterns, predictions
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CRON_SECRET = process.env.CRON_SECRET || 'steo-elite-cron-2026';

// Ancienne base (source) - utilise les variables d'environnement
const OLD_SUPABASE_URL = process.env.OLD_SUPABASE_URL || '';
const OLD_SUPABASE_KEY = process.env.OLD_SUPABASE_KEY || '';

async function migrateTable(oldClient: any, newClient: any, tableName: string, batchSize = 500): Promise<{ count: number; error?: string }> {
  console.log(`📦 Migration de ${tableName}...`);
  
  let total = 0;
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const { data, error } = await oldClient
      .from(tableName)
      .select('*')
      .range(offset, offset + batchSize - 1);
    
    if (error) {
      console.log(`   ❌ Erreur lecture: ${error.message}`);
      return { count: total, error: error.message };
    }
    
    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }
    
    // Insérer dans la nouvelle base
    const { error: insertError } = await newClient
      .from(tableName)
      .upsert(data, { onConflict: 'id' });
    
    if (insertError) {
      console.log(`   ⚠️ Erreur insertion: ${insertError.message}`);
      // Continuer quand même
    } else {
      total += data.length;
    }
    
    offset += batchSize;
    console.log(`   📊 ${total} enregistrements...`);
    
    if (data.length < batchSize) {
      hasMore = false;
    }
  }
  
  console.log(`   ✅ ${total} enregistrements migrés`);
  return { count: total };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');
  const table = url.searchParams.get('table') || 'all';
  
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  console.log('🚀 Migration complète ANCIENNE → NOUVELLE base');
  const startTime = Date.now();

  try {
    // Ancienne base (source)
    const oldClient = createClient(OLD_SUPABASE_URL, OLD_SUPABASE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    
    // Nouvelle base (destination)
    const newUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const newKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!newUrl || !newKey) {
      return NextResponse.json({ error: 'Nouvelle base non configurée' }, { status: 500 });
    }
    
    const newClient = createClient(newUrl, newKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    
    const results: Record<string, any> = {};
    
    // Tables à migrer dans l'ordre (avec les bons noms)
    const tables = [
      'ml_patterns',        // Patterns ML en premier (petit)
      'football_matches',   // 2741 matchs
      'basketball_matches', // 408 matchs
      'nhl_matches',        // 1400 matchs
      'mlb_matches',        // 4935 matchs
    ];
    
    for (const tableName of tables) {
      if (table === 'all' || table === tableName) {
        results[tableName] = await migrateTable(oldClient, newClient, tableName);
      }
    }
    
    const duration = Date.now() - startTime;
    const totalMigrated = Object.values(results).reduce((sum: number, r: any) => sum + (r.count || 0), 0);
    
    return NextResponse.json({
      success: true,
      message: `✅ Migration terminée: ${totalMigrated} enregistrements`,
      duration: `${duration}ms`,
      durationSec: `${(duration/1000).toFixed(1)}s`,
      results,
      oldBase: OLD_SUPABASE_URL,
      newBase: newUrl
    });
    
  } catch (error: any) {
    console.error('❌ Erreur migration:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
