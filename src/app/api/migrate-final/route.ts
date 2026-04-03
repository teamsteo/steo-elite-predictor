/**
 * Migration directe sans mapping - structure identique
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CRON_SECRET = process.env.CRON_SECRET || 'steo-elite-cron-2026';

// Ancienne base (utilise les variables d'environnement)
const OLD_URL = process.env.OLD_SUPABASE_URL || '';
const OLD_KEY = process.env.OLD_SUPABASE_KEY || '';

const TABLES = ['ml_patterns', 'football_matches', 'basketball_matches', 'nhl_matches', 'mlb_matches'];

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');
  const table = url.searchParams.get('table') || 'all';
  
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  try {
    const oldClient = createClient(OLD_URL, OLD_KEY);
    
    const newUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const newKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!newUrl || !newKey) {
      return NextResponse.json({ error: 'Nouvelle base non configurée' }, { status: 500 });
    }
    
    const newClient = createClient(newUrl, newKey);
    
    const tablesToMigrate = table === 'all' ? TABLES : [table];
    const results: Record<string, any> = {};
    
    for (const tableName of tablesToMigrate) {
      try {
        const { data, error } = await oldClient.from(tableName).select('*');
        
        if (error) {
          results[tableName] = { read: 0, error: error.message };
          continue;
        }
        
        const count = data?.length || 0;
        
        if (count === 0) {
          results[tableName] = { read: 0, migrated: 0 };
          continue;
        }
        
        const { error: insertError } = await newClient.from(tableName).upsert(data, { onConflict: 'id' });
        
        if (insertError) {
          results[tableName] = { read: count, migrated: 0, error: insertError.message };
        } else {
          results[tableName] = { read: count, migrated: count };
        }
        
      } catch (e: any) {
        results[tableName] = { error: e.message };
      }
    }
    
    const total = Object.values(results).reduce((sum: number, r: any) => sum + (r.migrated || 0), 0);
    
    return NextResponse.json({
      success: true,
      message: 'Migration terminée',
      total,
      results
    });
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
