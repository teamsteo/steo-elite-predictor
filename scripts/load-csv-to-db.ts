/**
 * Charger les CSV directement dans la nouvelle base Supabase
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Nouvelle base de données
const NEW_SUPABASE_URL = 'https://jlqfcyphqpqzmerqzncr.supabase.co';
const NEW_SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpscWZjeXBocXBxem1lcnF6bmNyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDkzMDY2NSwiZXhwIjoyMDU2NTA2NjY1fQ.JQb6NV7oG2Z0Nr9rPRmX2eUfWCdKVOyPZLLOUJrI-PU';

const supabase = createClient(NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_KEY);
const CSV_DIR = '/home/z/my-project/download/migration-csv';

function parseCSV(content: string): { headers: string[], rows: any[][] } {
  const lines = content.split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const rows: any[][] = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    // Parse CSV simple (gère les guillemets)
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    rows.push(values);
  }
  
  return { headers, rows };
}

function convertValue(value: string, header: string): any {
  if (value === '' || value === 'NULL') return null;
  
  // Entiers
  if (['home_score', 'away_score', 'home_shots', 'away_shots', 'home_corners', 'away_corners',
       'home_fouls', 'away_fouls', 'home_yellow_cards', 'away_yellow_cards', 'home_red_cards', 'away_red_cards',
       'home_rebounds', 'away_rebounds', 'home_assists', 'away_assists',
       'home_q1', 'away_q1', 'home_q2', 'away_q2', 'home_q3', 'away_q3', 'home_q4', 'away_q4',
       'home_ot', 'away_ot', 'home_sog', 'away_sog', 'home_ppg', 'away_ppg', 'home_pim', 'away_pim',
       'home_hits', 'away_hits', 'home_errors', 'away_errors', 'home_homeruns', 'away_homeruns', 'innings',
       'sample_size'].includes(header)) {
    const num = parseInt(value);
    return isNaN(num) ? null : num;
  }
  
  // Floats
  if (['home_possession', 'away_possession', 'home_xg', 'away_xg',
       'odds_home', 'odds_draw', 'odds_away', 'spread',
       'home_fg_pct', 'away_fg_pct', 'home_3p_pct', 'away_3p_pct', 'home_ft_pct', 'away_ft_pct',
       'odds_away', 'total_line', 'home_pitcher_era', 'away_pitcher_era',
       'success_rate', 'confidence'].includes(header)) {
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  }
  
  return value;
}

async function loadCSV(tableName: string) {
  console.log(`\n📦 Chargement de ${tableName}...`);
  
  const filePath = path.join(CSV_DIR, `${tableName}.csv`);
  
  if (!fs.existsSync(filePath)) {
    console.log(`   ⚠️ Fichier non trouvé: ${filePath}`);
    return 0;
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const { headers, rows } = parseCSV(content);
  
  console.log(`   📄 ${rows.length} lignes à insérer`);
  
  // Insérer par batch de 100
  const batchSize = 100;
  let inserted = 0;
  
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    
    const records = batch.map(row => {
      const record: Record<string, any> = {};
      headers.forEach((header, idx) => {
        record[header] = convertValue(row[idx] || '', header);
      });
      return record;
    });
    
    const { error } = await supabase
      .from(tableName)
      .insert(records);
    
    if (error) {
      console.log(`   ❌ Erreur batch ${i}-${i + batchSize}: ${error.message}`);
      // Essayer un par un
      for (const record of records) {
        const { error: err2 } = await supabase.from(tableName).insert(record);
        if (!err2) inserted++;
      }
    } else {
      inserted += records.length;
      console.log(`   ✅ ${inserted}/${rows.length} insérés`);
    }
  }
  
  return inserted;
}

async function main() {
  console.log('🚀 Chargement des CSV dans la nouvelle base...');
  console.log(`📍 Base: ${NEW_SUPABASE_URL}`);
  
  let total = 0;
  
  total += await loadCSV('football_matches');
  total += await loadCSV('basketball_matches');
  total += await loadCSV('nhl_matches');
  total += await loadCSV('mlb_matches');
  
  // Vérification
  console.log('\n📊 Vérification...');
  
  const { count: football } = await supabase.from('football_matches').select('*', { count: 'exact', head: true });
  const { count: basketball } = await supabase.from('basketball_matches').select('*', { count: 'exact', head: true });
  const { count: nhl } = await supabase.from('nhl_matches').select('*', { count: 'exact', head: true });
  const { count: mlb } = await supabase.from('mlb_matches').select('*', { count: 'exact', head: true });
  const { count: patterns } = await supabase.from('ml_patterns').select('*', { count: 'exact', head: true });
  
  console.log(`   football_matches: ${football}`);
  console.log(`   basketball_matches: ${basketball}`);
  console.log(`   nhl_matches: ${nhl}`);
  console.log(`   mlb_matches: ${mlb}`);
  console.log(`   ml_patterns: ${patterns}`);
  
  console.log('\n' + '='.repeat(50));
  console.log(`🎉 Total inséré: ${total}`);
  console.log('='.repeat(50));
}

main().catch(console.error);
