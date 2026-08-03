/**
 * Migration simple et directe
 */

import { NextRequest, NextResponse } from 'next/server';

const CRON_SECRET = process.env.CRON_SECRET;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');
  const table = url.searchParams.get('table') || 'ml_patterns';
  
  if (!CRON_SECRET || !secret || !timingSafeEqual(secret, CRON_SECRET)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const { createClient } = await import('@supabase/supabase-js');
  
  // Ancienne base (utilise les variables d'environnement)
  const oldUrl = process.env.OLD_SUPABASE_URL || '';
  const oldKey = process.env.OLD_SUPABASE_KEY || '';
  
  // Nouvelle base
  const newUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const newKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!newUrl || !newKey) {
    return NextResponse.json({ error: 'Nouvelle base non configurée' }, { status: 500 });
  }
  
  const oldClient = createClient(oldUrl, oldKey);
  const newClient = createClient(newUrl, newKey);
  
  // Lire depuis l'ancienne base
  const { data, error } = await oldClient.from(table).select('*');
  
  if (error) {
    return NextResponse.json({ step: 'lecture', error: 'Erreur interne', table }, { status: 500 });
  }
  
  if (!data || data.length === 0) {
    return NextResponse.json({ step: 'lecture', message: 'Aucune donnée', table });
  }
  
  // Insérer dans la nouvelle base
  const { error: insertError } = await newClient.from(table).upsert(data, { onConflict: 'id' });
  
  if (insertError) {
    return NextResponse.json({ step: 'insertion', error: 'Erreur interne', count: data.length }, { status: 500 });
  }
  
  return NextResponse.json({ success: true, table, migrated: data.length });
}
