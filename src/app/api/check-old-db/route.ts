/**
 * Vérifie le contenu de l'ancienne base Supabase
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CRON_SECRET = process.env.CRON_SECRET;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Ancienne base (utilise les variables d'environnement)
const OLD_SUPABASE_URL = process.env.OLD_SUPABASE_URL || '';
const OLD_SUPABASE_KEY = process.env.OLD_SUPABASE_KEY || '';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');
  
  if (!CRON_SECRET || !secret || !timingSafeEqual(secret, CRON_SECRET)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  try {
    const oldClient = createClient(OLD_SUPABASE_URL, OLD_SUPABASE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    
    // Compter les enregistrements dans chaque table
    const counts: Record<string, any> = {};
    
    const tables = [
      'football_matches',
      'basketball_matches', 
      'nhl_matches',
      'mlb_matches',
      'ml_patterns',
      'predictions'
    ];
    
    for (const table of tables) {
      try {
        const { count, error } = await oldClient
          .from(table)
          .select('*', { count: 'exact', head: true });
        
        if (error) {
          counts[table] = { error: error.message };
        } else {
          counts[table] = { count };
        }
      } catch (e: any) {
        counts[table] = { error: e.message };
      }
    }
    
    // Récupérer quelques ml_patterns pour voir
    const { data: patterns, error: patternsError } = await oldClient
      .from('ml_patterns')
      .select('*')
      .limit(5);
    
    return NextResponse.json({
      oldBase: OLD_SUPABASE_URL,
      counts,
      samplePatterns: patterns || [],
      patternsError: patternsError?.message
    });
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
