/**
 * Script de migration des données JSON vers Supabase
 * Usage: bun run scripts/migrate-to-supabase.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Configuration Supabase (nouvelle base)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Variables NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requises');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ============================================
// UTILITAIRES
// ============================================

function loadData(filename: string): any {
  const filePath = path.join(process.cwd(), 'data', filename);
  if (!fs.existsSync(filePath)) {
    console.log(`   ⚠️ ${filename} non trouvé`);
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function normalizeSport(sport: string): string {
  const s = sport?.toLowerCase() || '';
  if (s.includes('foot') || s.includes('soccer')) return 'football';
  if (s.includes('basket') || s.includes('nba')) return 'basketball';
  if (s.includes('hockey') || s.includes('nhl')) return 'hockey';
  if (s.includes('tennis')) return 'tennis';
  return 'other';
}

function normalizeResult(result: string): string {
  const r = result?.toLowerCase() || '';
  if (r === 'home' || r === '1' || r === 'h') return 'home';
  if (r === 'draw' || r === 'x' || r === 'nul') return 'draw';
  if (r === 'away' || r === '2' || r === 'a') return 'away';
  if (r.includes('over')) return 'over';
  if (r.includes('under')) return 'under';
  if (r.includes('btts') && r.includes('yes')) return 'btts_yes';
  if (r.includes('btts') && r.includes('no')) return 'btts_no';
  return 'avoid';
}

function normalizeConfidence(confidence: string): string {
  const c = confidence?.toLowerCase() || '';
  if (c.includes('very') || c.includes('tres') || c === 'very_high') return 'very_high';
  if (c.includes('high') || c.includes('haute')) return 'high';
  if (c.includes('medium') || c.includes('moyenne')) return 'medium';
  return 'low';
}

// ============================================
// MIGRATIONS
// ============================================

async function migratePredictions() {
  console.log('\n📦 Migration des prédictions...');
  
  const storeData = loadData('store-predictions.json');
  if (!storeData?.predictions) {
    console.log('   ⚠️ Aucune prédiction à migrer');
    return 0;
  }

  const predictions = storeData.predictions;
  console.log(`   📊 ${predictions.length} prédictions trouvées`);

  const records: any[] = [];
  
  for (const p of predictions) {
    records.push({
      match_id: p.matchId || `migrated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      home_team: p.homeTeam || 'Unknown',
      away_team: p.awayTeam || 'Unknown',
      league: p.league || 'Unknown',
      sport: normalizeSport(p.sport),
      match_date: p.matchDate || p.createdAt || new Date().toISOString(),
      odds_home: p.oddsHome || 1.0,
      odds_draw: p.oddsDraw || null,
      odds_away: p.oddsAway || 1.0,
      predicted_result: normalizeResult(p.predictedResult),
      predicted_goals: p.predictedGoals || null,
      confidence: normalizeConfidence(p.confidence),
      risk_percentage: p.riskPercentage || 50,
      home_score: p.homeScore ?? null,
      away_score: p.awayScore ?? null,
      total_goals: p.totalGoals ?? null,
      actual_result: p.actualResult ? normalizeResult(p.actualResult) : null,
      status: p.status || 'pending',
      result_match: p.resultMatch ?? null,
      goals_match: p.goalsMatch ?? null,
      source: p.source || 'migration',
      created_at: p.createdAt || new Date().toISOString(),
      checked_at: p.checkedAt || null
    });
  }

  // Insérer par batch de 100
  let inserted = 0;
  const batchSize = 100;
  
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await supabase
      .from('predictions')
      .upsert(batch, { onConflict: 'match_id' });
    
    if (error) {
      console.log(`   ⚠️ Erreur batch: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }

  console.log(`   ✅ ${inserted} prédictions migrées`);
  return inserted;
}

async function migrateMLPatterns() {
  console.log('\n📦 Migration des patterns ML...');
  
  const mlResults = loadData('ml-results-tracking.json');
  const mlTraining = loadData('ml-training-report.json');
  
  // Extraire les patterns depuis les résultats ML
  const patterns: any[] = [];
  
  // Depuis ml-training-report
  if (mlTraining?.patterns) {
    for (const p of mlTraining.patterns) {
      patterns.push({
        pattern_type: p.pattern_type || p.type || 'general',
        sport: normalizeSport(p.sport || 'football'),
        pattern_key: p.pattern_key || p.key || `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        pattern_value: p.pattern_value || p.value || JSON.stringify(p),
        conditions: p.conditions || null,
        occurrences: p.occurrences || p.sample_size || 1,
        success_count: p.success_count || Math.floor((p.occurrences || 1) * (p.success_rate || 0.5)),
        success_rate: p.success_rate || p.accuracy || 0.5
      });
    }
  }

  if (patterns.length === 0) {
    console.log('   ⚠️ Aucun pattern à migrer');
    return 0;
  }

  console.log(`   📊 ${patterns.length} patterns trouvés`);

  const { error } = await supabase
    .from('ml_patterns')
    .upsert(patterns, { onConflict: 'pattern_type,sport,pattern_key' });

  if (error) {
    console.log(`   ⚠️ Erreur: ${error.message}`);
    return 0;
  }

  console.log(`   ✅ ${patterns.length} patterns migrés`);
  return patterns.length;
}

async function migrateDailyStats() {
  console.log('\n📦 Migration des statistiques journalières...');
  
  const statsData = loadData('stats_history.json');
  if (!statsData?.dailyStats) {
    console.log('   ⚠️ Aucune statistique à migrer');
    return 0;
  }

  const dailyStats = statsData.dailyStats;
  console.log(`   📊 ${dailyStats.length} jours de statistiques`);

  const records: any[] = [];
  
  for (const day of dailyStats) {
    records.push({
      date: day.date,
      total_predictions: day.totalPredictions || day.total || 0,
      completed: day.completed || 0,
      wins: day.wins || 0,
      losses: day.losses || 0,
      win_rate: day.winRate || 0,
      football_total: day.footballTotal || day.bySport?.football?.total || 0,
      football_wins: day.footballWins || day.bySport?.football?.wins || 0,
      football_win_rate: day.footballWinRate || day.bySport?.football?.winRate || 0,
      basketball_total: day.basketballTotal || day.bySport?.basketball?.total || 0,
      basketball_wins: day.basketballWins || day.bySport?.basketball?.wins || 0,
      basketball_win_rate: day.basketballWinRate || day.bySport?.basketball?.winRate || 0,
      hockey_total: day.hockeyTotal || day.bySport?.hockey?.total || 0,
      hockey_wins: day.hockeyWins || day.bySport?.hockey?.wins || 0,
      hockey_win_rate: day.hockeyWinRate || day.bySport?.hockey?.winRate || 0
    });
  }

  let inserted = 0;
  const batchSize = 50;
  
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await supabase
      .from('daily_stats')
      .upsert(batch, { onConflict: 'date' });
    
    if (!error) {
      inserted += batch.length;
    }
  }

  console.log(`   ✅ ${inserted} statistiques journalières migrées`);
  return inserted;
}

async function migrateExpertAdvices() {
  console.log('\n📦 Migration des conseils experts...');
  
  const expertData = loadData('expert-advices.json');
  if (!expertData?.advices) {
    console.log('   ⚠️ Aucun conseil expert à migrer');
    return 0;
  }

  console.log(`   📊 ${expertData.advices.length} conseils trouvés`);
  
  // Les conseils experts peuvent être stockés comme prédictions avec un tag spécial
  const records: any[] = [];
  
  for (const advice of expertData.advices) {
    records.push({
      match_id: `expert_${advice.id || Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      home_team: advice.homeTeam || advice.home || 'Unknown',
      away_team: advice.awayTeam || advice.away || 'Unknown',
      league: advice.league || 'Expert',
      sport: normalizeSport(advice.sport || 'football'),
      match_date: advice.matchDate || advice.date || new Date().toISOString(),
      odds_home: advice.oddsHome || advice.odds?.home || 1.0,
      odds_draw: advice.oddsDraw || advice.odds?.draw || null,
      odds_away: advice.oddsAway || advice.odds?.away || 1.0,
      predicted_result: normalizeResult(advice.prediction || advice.predictedResult),
      confidence: 'high',
      risk_percentage: advice.risk || 50,
      source: 'expert',
      status: advice.status || 'pending'
    });
  }

  const { error } = await supabase
    .from('predictions')
    .upsert(records, { onConflict: 'match_id' });

  if (error) {
    console.log(`   ⚠️ Erreur: ${error.message}`);
    return 0;
  }

  console.log(`   ✅ ${records.length} conseils experts migrés`);
  return records.length;
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🚀 Migration des données vers Supabase');
  console.log('==========================================');
  console.log(`📍 URL: ${SUPABASE_URL}`);

  // Test de connexion
  const { error: testError } = await supabase.from('predictions').select('id').limit(1);
  if (testError) {
    console.error('❌ Erreur de connexion à Supabase:', testError.message);
    process.exit(1);
  }
  console.log('✅ Connexion Supabase OK\n');

  const results = {
    predictions: 0,
    patterns: 0,
    dailyStats: 0,
    experts: 0
  };

  try {
    results.predictions = await migratePredictions();
    results.patterns = await migrateMLPatterns();
    results.dailyStats = await migrateDailyStats();
    results.experts = await migrateExpertAdvices();
  } catch (e: any) {
    console.error('❌ Erreur:', e.message);
  }

  console.log('\n==========================================');
  console.log('📊 RÉSUMÉ DE LA MIGRATION');
  console.log('==========================================');
  console.log(`✅ Prédictions: ${results.predictions}`);
  console.log(`✅ Patterns ML: ${results.patterns}`);
  console.log(`✅ Stats journalières: ${results.dailyStats}`);
  console.log(`✅ Conseils experts: ${results.experts}`);
  console.log(`\n📈 Total: ${results.predictions + results.patterns + results.dailyStats + results.experts} enregistrements`);
  console.log('\n🎉 Migration terminée !');
}

main().catch(console.error);
