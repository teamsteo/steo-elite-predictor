/**
 * Génère les fichiers CSV avec la structure EXACTE de l'ancienne base
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

async function generateCSV(table: string, columns: string[], outputFile: string) {
  console.log(`\n📄 Génération ${table}...`);
  
  const allData: any[] = [];
  let page = 0;
  
  while (true) {
    const { data, error } = await oldDb
      .from(table)
      .select('*')
      .range(page * 500, (page + 1) * 500 - 1);
    
    if (error || !data || data.length === 0) break;
    allData.push(...data);
    page++;
    if (data.length < 500) break;
  }
  
  const headers = columns.join(',');
  
  const rows = allData.map(row => toCSVRow(columns.map(col => row[col])));
  
  fs.writeFileSync(`${OUTPUT_DIR}/${outputFile}`, [headers, ...rows].join('\n'));
  console.log(`   ✅ ${allData.length} enregistrements → ${outputFile}`);
  
  return allData.length;
}

async function main() {
  console.log('🚀 Génération des CSV avec structure exacte...');
  
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  let total = 0;
  
  // football_matches - structure exacte de l'ancienne base
  total += await generateCSV('football_matches', [
    'id', 'home_team', 'away_team', 'league_id', 'league_name', 'season',
    'match_date', 'match_id_api', 'home_score', 'away_score', 'result',
    'home_possession', 'away_possession', 'home_shots', 'away_shots',
    'home_shots_on_target', 'away_shots_on_target', 'home_corners', 'away_corners',
    'home_fouls', 'away_fouls', 'home_yellow_cards', 'away_yellow_cards',
    'home_red_cards', 'away_red_cards', 'home_xg', 'away_xg',
    'odds_home', 'odds_draw', 'odds_away', 'data_source', 'created_at', 'updated_at'
  ], 'football_matches.csv');
  
  // basketball_matches
  total += await generateCSV('basketball_matches', [
    'id', 'home_team', 'away_team', 'league_name', 'season', 'match_date',
    'match_id_api', 'home_score', 'away_score', 'result',
    'home_q1', 'away_q1', 'home_q2', 'away_q2', 'home_q3', 'away_q3',
    'home_q4', 'away_q4', 'home_ot', 'away_ot',
    'home_fg_pct', 'away_fg_pct', 'home_3p_pct', 'away_3p_pct',
    'home_ft_pct', 'away_ft_pct', 'home_rebounds', 'away_rebounds',
    'home_assists', 'away_assists', 'odds_home', 'odds_away', 'spread',
    'data_source', 'created_at', 'updated_at'
  ], 'basketball_matches.csv');
  
  // nhl_matches
  total += await generateCSV('nhl_matches', [
    'id', 'home_team', 'away_team', 'home_score', 'away_score', 'result',
    'season', 'match_date', 'league_name', 'home_shots', 'away_shots',
    'home_sog', 'away_sog', 'home_ppg', 'away_ppg', 'home_pim', 'away_pim',
    'odds_home', 'odds_away', 'total_line', 'data_source', 'created_at', 'updated_at'
  ], 'nhl_matches.csv');
  
  // mlb_matches
  total += await generateCSV('mlb_matches', [
    'id', 'home_team', 'away_team', 'home_score', 'away_score', 'result',
    'season', 'match_date', 'league_name', 'home_hits', 'away_hits',
    'home_errors', 'away_errors', 'home_homeruns', 'away_homeruns', 'innings',
    'odds_home', 'odds_away', 'total_line', 'home_pitcher_era', 'away_pitcher_era',
    'data_source', 'created_at', 'updated_at'
  ], 'mlb_matches.csv');
  
  console.log('\n' + '='.repeat(50));
  console.log(`🎉 Terminé ! ${total} enregistrements`);
  console.log(`📁 Dossier: ${OUTPUT_DIR}`);
  console.log('='.repeat(50));
}

main().catch(console.error);
