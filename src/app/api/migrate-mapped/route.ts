/**
 * Migration avec mapping de colonnes
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CRON_SECRET = process.env.CRON_SECRET || 'steo-elite-cron-2026';

// Ancienne base (utilise les variables d'environnement)
const OLD_URL = process.env.OLD_SUPABASE_URL || '';
const OLD_KEY = process.env.OLD_SUPABASE_KEY || '';

// Mapping pour ml_patterns (ancienne → nouvelle structure)
function mapPattern(old: any): any {
  return {
    id: old.id,
    pattern_type: old.pattern_type,
    sport: old.sport,
    pattern_key: old.condition?.substring(0, 255) || old.id,
    pattern_value: old.outcome,
    conditions: { condition: old.condition, outcome: old.outcome },
    occurrences: old.sample_size,
    success_count: Math.round(old.sample_size * old.success_rate / 100),
    success_rate: old.success_rate / 100,
    last_seen: old.last_updated,
    created_at: old.last_updated,
    updated_at: old.last_updated
  };
}

// Mapping pour football_matches
function mapFootballMatch(old: any): any {
  return {
    id: old.id,
    home_team: old.home_team,
    away_team: old.away_team,
    league_name: old.league_name,
    season: old.season,
    match_date: old.match_date,
    home_score: old.home_score,
    away_score: old.away_score,
    result: old.result,
    home_possession: old.home_possession,
    away_possession: old.away_possession,
    home_shots: old.home_shots,
    away_shots: old.away_shots,
    home_shots_on_target: old.home_shots_on_target,
    away_shots_on_target: old.away_shots_on_target,
    home_corners: old.home_corners,
    away_corners: old.away_corners,
    home_xg: old.home_xg,
    away_xg: old.away_xg,
    odds_home: old.odds_home,
    odds_draw: old.odds_draw,
    odds_away: old.odds_away,
    data_source: old.data_source || 'migration'
  };
}

// Mapping pour basketball_matches
function mapBasketballMatch(old: any): any {
  return {
    id: old.id,
    home_team: old.home_team,
    away_team: old.away_team,
    league_name: old.league_name,
    season: old.season,
    match_date: old.match_date,
    home_score: old.home_score,
    away_score: old.away_score,
    result: old.result,
    home_fg_pct: old.home_fg_pct,
    away_fg_pct: old.away_fg_pct,
    home_3p_pct: old.home_3p_pct,
    away_3p_pct: old.away_3p_pct,
    home_rebounds: old.home_rebounds,
    away_rebounds: old.away_rebounds,
    home_assists: old.home_assists,
    away_assists: old.away_assists,
    odds_home: old.odds_home,
    odds_away: old.odds_away,
    spread: old.spread,
    data_source: old.data_source || 'migration'
  };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');
  const table = url.searchParams.get('table') || 'ml_patterns';
  
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
    
    // Lire depuis l'ancienne base
    const { data, error } = await oldClient.from(table).select('*');
    
    if (error) {
      return NextResponse.json({ step: 'lecture', error: error.message }, { status: 500 });
    }
    
    if (!data || data.length === 0) {
      return NextResponse.json({ step: 'lecture', message: 'Aucune donnée' });
    }
    
    // Mapper les données selon la table
    let mappedData: any[];
    
    switch (table) {
      case 'ml_patterns':
        mappedData = data.map(mapPattern);
        break;
      case 'football_matches':
        mappedData = data.map(mapFootballMatch);
        break;
      case 'basketball_matches':
        mappedData = data.map(mapBasketballMatch);
        break;
      default:
        mappedData = data;
    }
    
    // Insérer par batch de 500
    const batchSize = 500;
    let inserted = 0;
    
    for (let i = 0; i < mappedData.length; i += batchSize) {
      const batch = mappedData.slice(i, i + batchSize);
      const { error: insertError } = await newClient
        .from(table)
        .upsert(batch, { onConflict: 'id' });
      
      if (!insertError) {
        inserted += batch.length;
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      table, 
      read: data.length,
      migrated: inserted 
    });
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
