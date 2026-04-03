/**
 * Génère les scripts SQL INSERT corrects pour la migration
 * Adapté à la structure de la NOUVELLE base
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

// Ancienne base de données (source)
const OLD_SUPABASE_URL = 'https://aumsrakioetvvqopthbs.supabase.co';
const OLD_SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

const oldDb = createClient(OLD_SUPABASE_URL, OLD_SUPABASE_SERVICE_KEY);
const OUTPUT_DIR = '/home/z/my-project/download/migration-sql';

function escapeSQL(value: any): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === 'string') return `'${value.replace(/'/g, "''").replace(/\\/g, '\\\\')}'`;
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return 'NULL';
}

async function generateFootballSQL() {
  console.log('\n⚽ Génération SQL pour football_matches...');
  
  const allData: any[] = [];
  let page = 0;
  const pageSize = 500;
  
  while (true) {
    const { data, error } = await oldDb
      .from('football_matches')
      .select('*')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    
    if (error || !data || data.length === 0) break;
    allData.push(...data);
    page++;
    if (data.length < pageSize) break;
  }
  
  console.log(`   ✅ ${allData.length} enregistrements`);
  
  // Colonnes de la NOUVELLE table football_matches
  // id, home_team, away_team, league_name, season, match_date, home_score, away_score, result,
  // home_possession, away_possession, home_shots, away_shots, home_shots_on_target, away_shots_on_target,
  // home_corners, away_corners, home_xg, away_xg, odds_home, odds_draw, odds_away, data_source, created_at
  
  const inserts: string[] = [];
  
  for (const row of allData) {
    const values = [
      escapeSQL(row.id),
      escapeSQL(row.home_team),
      escapeSQL(row.away_team),
      escapeSQL(row.league_name),
      escapeSQL(row.season),
      escapeSQL(row.match_date),
      escapeSQL(row.home_score),
      escapeSQL(row.away_score),
      escapeSQL(row.result),
      escapeSQL(row.home_possession),
      escapeSQL(row.away_possession),
      escapeSQL(row.home_shots),
      escapeSQL(row.away_shots),
      escapeSQL(row.home_shots_on_target),
      escapeSQL(row.away_shots_on_target),
      escapeSQL(row.home_corners || null),
      escapeSQL(row.away_corners || null),
      escapeSQL(row.home_xg),
      escapeSQL(row.away_xg),
      escapeSQL(row.odds_home),
      escapeSQL(row.odds_draw),
      escapeSQL(row.odds_away),
      escapeSQL(row.data_source || 'api-football'),
      escapeSQL(row.created_at)
    ].join(', ');
    
    inserts.push(`INSERT INTO football_matches (id, home_team, away_team, league_name, season, match_date, home_score, away_score, result, home_possession, away_possession, home_shots, away_shots, home_shots_on_target, away_shots_on_target, home_corners, away_corners, home_xg, away_xg, odds_home, odds_draw, odds_away, data_source, created_at) VALUES (${values});`);
  }
  
  const sql = `-- Migration football_matches: ${allData.length} enregistrements\n${inserts.join('\n')}\n`;
  fs.writeFileSync(`${OUTPUT_DIR}/03_football_matches.sql`, sql);
  console.log(`   💾 Fichier: ${OUTPUT_DIR}/03_football_matches.sql`);
  
  return allData.length;
}

async function generateBasketballSQL() {
  console.log('\n🏀 Génération SQL pour basketball_matches...');
  
  const allData: any[] = [];
  let page = 0;
  const pageSize = 500;
  
  while (true) {
    const { data, error } = await oldDb
      .from('basketball_matches')
      .select('*')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    
    if (error || !data || data.length === 0) break;
    allData.push(...data);
    page++;
    if (data.length < pageSize) break;
  }
  
  console.log(`   ✅ ${allData.length} enregistrements`);
  
  const inserts: string[] = [];
  
  for (const row of allData) {
    const values = [
      escapeSQL(row.id),
      escapeSQL(row.home_team),
      escapeSQL(row.away_team),
      escapeSQL(row.league_name),
      escapeSQL(row.season),
      escapeSQL(row.match_date),
      escapeSQL(row.home_score),
      escapeSQL(row.away_score),
      escapeSQL(row.result),
      escapeSQL(row.home_fg_pct),
      escapeSQL(row.away_fg_pct),
      escapeSQL(row.home_3p_pct),
      escapeSQL(row.away_3p_pct),
      escapeSQL(row.home_rebounds),
      escapeSQL(row.away_rebounds),
      escapeSQL(row.home_assists),
      escapeSQL(row.away_assists),
      escapeSQL(row.odds_home),
      escapeSQL(row.odds_away),
      escapeSQL(row.spread || null),
      escapeSQL(row.data_source || 'api-basketball'),
      escapeSQL(row.created_at)
    ].join(', ');
    
    inserts.push(`INSERT INTO basketball_matches (id, home_team, away_team, league_name, season, match_date, home_score, away_score, result, home_fg_pct, away_fg_pct, home_3p_pct, away_3p_pct, home_rebounds, away_rebounds, home_assists, away_assists, odds_home, odds_away, spread, data_source, created_at) VALUES (${values});`);
  }
  
  const sql = `-- Migration basketball_matches: ${allData.length} enregistrements\n${inserts.join('\n')}\n`;
  fs.writeFileSync(`${OUTPUT_DIR}/04_basketball_matches.sql`, sql);
  console.log(`   💾 Fichier: ${OUTPUT_DIR}/04_basketball_matches.sql`);
  
  return allData.length;
}

async function generateNHLSQL() {
  console.log('\n🏒 Génération SQL pour nhl_matches...');
  
  const allData: any[] = [];
  let page = 0;
  const pageSize = 500;
  
  while (true) {
    const { data, error } = await oldDb
      .from('nhl_matches')
      .select('*')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    
    if (error || !data || data.length === 0) break;
    allData.push(...data);
    page++;
    if (data.length < pageSize) break;
  }
  
  console.log(`   ✅ ${allData.length} enregistrements`);
  
  const inserts: string[] = [];
  
  for (const row of allData) {
    const values = [
      escapeSQL(row.id),
      escapeSQL(row.home_team),
      escapeSQL(row.away_team),
      escapeSQL(row.league_name),
      escapeSQL(row.season),
      escapeSQL(row.match_date),
      escapeSQL(row.home_score),
      escapeSQL(row.away_score),
      escapeSQL(row.result),
      escapeSQL(row.home_shots),
      escapeSQL(row.away_shots),
      escapeSQL(row.home_pim || null),
      escapeSQL(row.away_pim || null),
      escapeSQL(row.home_ppg),
      escapeSQL(row.away_ppg),
      escapeSQL(row.home_sog || row.home_shots),
      escapeSQL(row.away_sog || row.away_shots),
      escapeSQL(row.odds_home),
      escapeSQL(row.odds_away),
      escapeSQL(row.total_line || null),
      escapeSQL(row.data_source || 'espn-nhl'),
      escapeSQL(row.created_at)
    ].join(', ');
    
    inserts.push(`INSERT INTO nhl_matches (id, home_team, away_team, league_name, season, match_date, home_score, away_score, result, home_shots, away_shots, home_pim, away_pim, home_ppg, away_ppg, home_sog, away_sog, odds_home, odds_away, total_line, data_source, created_at) VALUES (${values});`);
  }
  
  const sql = `-- Migration nhl_matches: ${allData.length} enregistrements\n${inserts.join('\n')}\n`;
  fs.writeFileSync(`${OUTPUT_DIR}/05_nhl_matches.sql`, sql);
  console.log(`   💾 Fichier: ${OUTPUT_DIR}/05_nhl_matches.sql`);
  
  return allData.length;
}

async function generateMLBSQL() {
  console.log('\n⚾ Génération SQL pour mlb_matches...');
  
  const allData: any[] = [];
  let page = 0;
  const pageSize = 500;
  
  while (true) {
    const { data, error } = await oldDb
      .from('mlb_matches')
      .select('*')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    
    if (error || !data || data.length === 0) break;
    allData.push(...data);
    page++;
    if (data.length < pageSize) break;
  }
  
  console.log(`   ✅ ${allData.length} enregistrements`);
  
  const inserts: string[] = [];
  
  for (const row of allData) {
    const values = [
      escapeSQL(row.id),
      escapeSQL(row.home_team),
      escapeSQL(row.away_team),
      escapeSQL(row.league_name),
      escapeSQL(row.season),
      escapeSQL(row.match_date),
      escapeSQL(row.home_score),
      escapeSQL(row.away_score),
      escapeSQL(row.result),
      escapeSQL(row.home_hits),
      escapeSQL(row.away_hits),
      escapeSQL(row.home_errors),
      escapeSQL(row.away_errors),
      escapeSQL(row.home_homeruns || null),
      escapeSQL(row.away_homeruns || null),
      escapeSQL(row.innings || 9),
      escapeSQL(row.home_pitcher_era || null),
      escapeSQL(row.away_pitcher_era || null),
      escapeSQL(row.odds_home),
      escapeSQL(row.odds_away),
      escapeSQL(row.total_line || null),
      escapeSQL(row.data_source || 'espn-mlb'),
      escapeSQL(row.created_at)
    ].join(', ');
    
    inserts.push(`INSERT INTO mlb_matches (id, home_team, away_team, league_name, season, match_date, home_score, away_score, result, home_hits, away_hits, home_errors, away_errors, home_homeruns, away_homeruns, innings, home_pitcher_era, away_pitcher_era, odds_home, odds_away, total_line, data_source, created_at) VALUES (${values});`);
  }
  
  const sql = `-- Migration mlb_matches: ${allData.length} enregistrements\n${inserts.join('\n')}\n`;
  fs.writeFileSync(`${OUTPUT_DIR}/06_mlb_matches.sql`, sql);
  console.log(`   💾 Fichier: ${OUTPUT_DIR}/06_mlb_matches.sql`);
  
  return allData.length;
}

async function main() {
  console.log('🚀 Génération des scripts SQL corrigés...');
  
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  let total = 0;
  total += await generateFootballSQL();
  total += await generateBasketballSQL();
  total += await generateNHLSQL();
  total += await generateMLBSQL();
  
  console.log('\n' + '='.repeat(50));
  console.log(`🎉 Terminé ! ${total} enregistrements`);
  console.log(`📁 Dossier: ${OUTPUT_DIR}`);
  console.log('='.repeat(50));
}

main().catch(console.error);
