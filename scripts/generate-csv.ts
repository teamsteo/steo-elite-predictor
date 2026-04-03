/**
 * Génère les fichiers CSV pour import via Table Editor Supabase
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const OLD_SUPABASE_URL = 'https://aumsrakioetvvqopthbs.supabase.co';
const OLD_SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

const oldDb = createClient(OLD_SUPABASE_URL, OLD_SUPABASE_SERVICE_KEY);
const OUTPUT_DIR = '/home/z/my-project/download/migration-csv';

function toCSVRow(values: any[]): string {
  return values.map(v => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return `"${v.replace(/"/g, '""')}"`;
    return String(v);
  }).join(',');
}

async function generateFootballCSV() {
  console.log('\n⚽ Génération CSV football_matches...');
  
  const allData: any[] = [];
  let page = 0;
  
  while (true) {
    const { data, error } = await oldDb
      .from('football_matches')
      .select('*')
      .range(page * 500, (page + 1) * 500 - 1);
    
    if (error || !data || data.length === 0) break;
    allData.push(...data);
    page++;
    if (data.length < 500) break;
  }
  
  // En-têtes pour la NOUVELLE structure
  const headers = 'id,home_team,away_team,league_name,season,match_date,home_score,away_score,result,home_possession,away_possession,home_shots,away_shots,home_shots_on_target,away_shots_on_target,home_corners,away_corners,home_xg,away_xg,odds_home,odds_draw,odds_away,data_source,created_at';
  
  const rows = allData.map(row => toCSVRow([
    row.id,
    row.home_team,
    row.away_team,
    row.league_name,
    row.season,
    row.match_date,
    row.home_score,
    row.away_score,
    row.result,
    row.home_possession,
    row.away_possession,
    row.home_shots,
    row.away_shots,
    row.home_shots_on_target,
    row.away_shots_on_target,
    row.home_corners || '',
    row.away_corners || '',
    row.home_xg,
    row.away_xg,
    row.odds_home,
    row.odds_draw,
    row.odds_away,
    row.data_source || 'api-football',
    row.created_at
  ]));
  
  fs.writeFileSync(`${OUTPUT_DIR}/football_matches.csv`, [headers, ...rows].join('\n'));
  console.log(`   ✅ ${allData.length} enregistrements → ${OUTPUT_DIR}/football_matches.csv`);
  return allData.length;
}

async function generateBasketballCSV() {
  console.log('\n🏀 Génération CSV basketball_matches...');
  
  const allData: any[] = [];
  let page = 0;
  
  while (true) {
    const { data, error } = await oldDb
      .from('basketball_matches')
      .select('*')
      .range(page * 500, (page + 1) * 500 - 1);
    
    if (error || !data || data.length === 0) break;
    allData.push(...data);
    page++;
    if (data.length < 500) break;
  }
  
  const headers = 'id,home_team,away_team,league_name,season,match_date,home_score,away_score,result,home_fg_pct,away_fg_pct,home_3p_pct,away_3p_pct,home_rebounds,away_rebounds,home_assists,away_assists,odds_home,odds_away,spread,data_source,created_at';
  
  const rows = allData.map(row => toCSVRow([
    row.id,
    row.home_team,
    row.away_team,
    row.league_name,
    row.season,
    row.match_date,
    row.home_score,
    row.away_score,
    row.result,
    row.home_fg_pct,
    row.away_fg_pct,
    row.home_3p_pct,
    row.away_3p_pct,
    row.home_rebounds,
    row.away_rebounds,
    row.home_assists,
    row.away_assists,
    row.odds_home,
    row.odds_away,
    row.spread || '',
    row.data_source || 'api-basketball',
    row.created_at
  ]));
  
  fs.writeFileSync(`${OUTPUT_DIR}/basketball_matches.csv`, [headers, ...rows].join('\n'));
  console.log(`   ✅ ${allData.length} enregistrements → ${OUTPUT_DIR}/basketball_matches.csv`);
  return allData.length;
}

async function generateNHLCSV() {
  console.log('\n🏒 Génération CSV nhl_matches...');
  
  const allData: any[] = [];
  let page = 0;
  
  while (true) {
    const { data, error } = await oldDb
      .from('nhl_matches')
      .select('*')
      .range(page * 500, (page + 1) * 500 - 1);
    
    if (error || !data || data.length === 0) break;
    allData.push(...data);
    page++;
    if (data.length < 500) break;
  }
  
  const headers = 'id,home_team,away_team,league_name,season,match_date,home_score,away_score,result,home_shots,away_shots,home_pim,away_pim,home_ppg,away_ppg,home_sog,away_sog,odds_home,odds_away,total_line,data_source,created_at';
  
  const rows = allData.map(row => toCSVRow([
    row.id,
    row.home_team,
    row.away_team,
    row.league_name,
    row.season,
    row.match_date,
    row.home_score,
    row.away_score,
    row.result,
    row.home_shots,
    row.away_shots,
    row.home_pim || '',
    row.away_pim || '',
    row.home_ppg,
    row.away_ppg,
    row.home_sog || row.home_shots,
    row.away_sog || row.away_shots,
    row.odds_home,
    row.odds_away,
    row.total_line || '',
    row.data_source || 'espn-nhl',
    row.created_at
  ]));
  
  fs.writeFileSync(`${OUTPUT_DIR}/nhl_matches.csv`, [headers, ...rows].join('\n'));
  console.log(`   ✅ ${allData.length} enregistrements → ${OUTPUT_DIR}/nhl_matches.csv`);
  return allData.length;
}

async function generateMLBCSV() {
  console.log('\n⚾ Génération CSV mlb_matches...');
  
  const allData: any[] = [];
  let page = 0;
  
  while (true) {
    const { data, error } = await oldDb
      .from('mlb_matches')
      .select('*')
      .range(page * 500, (page + 1) * 500 - 1);
    
    if (error || !data || data.length === 0) break;
    allData.push(...data);
    page++;
    if (data.length < 500) break;
  }
  
  const headers = 'id,home_team,away_team,league_name,season,match_date,home_score,away_score,result,home_hits,away_hits,home_errors,away_errors,home_homeruns,away_homeruns,innings,home_pitcher_era,away_pitcher_era,odds_home,odds_away,total_line,data_source,created_at';
  
  const rows = allData.map(row => toCSVRow([
    row.id,
    row.home_team,
    row.away_team,
    row.league_name,
    row.season,
    row.match_date,
    row.home_score,
    row.away_score,
    row.result,
    row.home_hits,
    row.away_hits,
    row.home_errors,
    row.away_errors,
    row.home_homeruns || '',
    row.away_homeruns || '',
    row.innings || 9,
    row.home_pitcher_era || '',
    row.away_pitcher_era || '',
    row.odds_home,
    row.odds_away,
    row.total_line || '',
    row.data_source || 'espn-mlb',
    row.created_at
  ]));
  
  fs.writeFileSync(`${OUTPUT_DIR}/mlb_matches.csv`, [headers, ...rows].join('\n'));
  console.log(`   ✅ ${allData.length} enregistrements → ${OUTPUT_DIR}/mlb_matches.csv`);
  return allData.length;
}

async function main() {
  console.log('🚀 Génération des fichiers CSV pour import...');
  
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  let total = 0;
  total += await generateFootballCSV();
  total += await generateBasketballCSV();
  total += await generateNHLCSV();
  total += await generateMLBCSV();
  
  console.log('\n' + '='.repeat(50));
  console.log(`🎉 Terminé ! ${total} enregistrements`);
  console.log(`📁 Dossier CSV: ${OUTPUT_DIR}`);
  console.log('='.repeat(50));
}

main().catch(console.error);
