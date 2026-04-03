/**
 * Génère des scripts SQL INSERT pour la migration
 * Les scripts sont sauvegardés dans /home/z/my-project/download/
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

// Ancienne base de données (source)
const OLD_SUPABASE_URL = 'https://aumsrakioetvvqopthbs.supabase.co';
const OLD_SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

const oldDb = createClient(OLD_SUPABASE_URL, OLD_SUPABASE_SERVICE_KEY);

const OUTPUT_DIR = '/home/z/my-project/download/migration-sql';

function escapeValue(value: any): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return 'NULL';
}

async function generateInsertScript(table: string, columns: string[]): Promise<number> {
  console.log(`\n📄 Génération SQL pour ${table}...`);
  
  // Charger toutes les données avec pagination
  const allData: any[] = [];
  let page = 0;
  const pageSize = 500;
  
  while (true) {
    const { data, error } = await oldDb
      .from(table)
      .select('*')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    
    if (error) {
      console.error(`   ❌ Erreur lecture: ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;
    
    allData.push(...data);
    page++;
    
    if (data.length < pageSize) break;
  }
  
  if (allData.length === 0) {
    console.log(`   ⚠️ Aucune donnée trouvée`);
    return 0;
  }
  
  console.log(`   ✅ ${allData.length} enregistrements trouvés`);
  
  // Générer les INSERT
  const inserts: string[] = [];
  
  for (const row of allData) {
    const values = columns.map(col => escapeValue(row[col])).join(', ');
    inserts.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values});`);
  }
  
  // Sauvegarder
  const sql = `-- Migration de ${table}
-- ${allData.length} enregistrements
-- Généré le ${new Date().toISOString()}

${inserts.join('\n')}
`;
  
  const filePath = `${OUTPUT_DIR}/${table}.sql`;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(filePath, sql);
  
  console.log(`   💾 Fichier: ${filePath}`);
  
  return allData.length;
}

async function main() {
  console.log('🚀 Génération des scripts SQL de migration...');
  
  // Créer le répertoire
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  let total = 0;
  
  // Football matches
  total += await generateInsertScript('football_matches', [
    'id', 'home_team', 'away_team', 'league_name', 'season', 'match_date',
    'home_score', 'away_score', 'result', 'home_xg', 'away_xg',
    'home_possession', 'away_possession', 'home_shots', 'away_shots',
    'home_shots_on_target', 'away_shots_on_target', 'odds_home', 'odds_draw', 'odds_away',
    'created_at', 'updated_at'
  ]);
  
  // Basketball matches
  total += await generateInsertScript('basketball_matches', [
    'id', 'home_team', 'away_team', 'league_name', 'season', 'match_date',
    'home_score', 'away_score', 'result', 'home_fg_pct', 'away_fg_pct',
    'home_3p_pct', 'away_3p_pct', 'home_rebounds', 'away_rebounds',
    'home_assists', 'away_assists', 'odds_home', 'odds_away',
    'created_at', 'updated_at'
  ]);
  
  // NHL matches
  total += await generateInsertScript('nhl_matches', [
    'id', 'home_team', 'away_team', 'league_name', 'season', 'match_date',
    'home_score', 'away_score', 'result', 'home_shots', 'away_shots',
    'home_ppg', 'away_ppg', 'odds_home', 'odds_away',
    'created_at', 'updated_at'
  ]);
  
  // MLB matches
  total += await generateInsertScript('mlb_matches', [
    'id', 'home_team', 'away_team', 'league_name', 'season', 'match_date',
    'home_score', 'away_score', 'result', 'home_hits', 'away_hits',
    'home_errors', 'away_errors', 'odds_home', 'odds_away',
    'created_at', 'updated_at'
  ]);
  
  // ML patterns
  total += await generateInsertScript('ml_patterns', [
    'id', 'sport', 'pattern_name', 'conditions', 'success_rate', 'sample_size',
    'created_at', 'updated_at'
  ]);
  
  // Predictions
  total += await generateInsertScript('predictions', [
    'id', 'sport', 'match_id', 'home_team', 'away_team', 'prediction', 'confidence',
    'odds', 'result', 'status', 'created_at', 'updated_at'
  ]);
  
  console.log('\n' + '='.repeat(50));
  console.log(`🎉 Terminé ! ${total} enregistrements à migrer`);
  console.log(`📁 Fichiers dans: ${OUTPUT_DIR}`);
  console.log('='.repeat(50));
}

main().catch(console.error);
