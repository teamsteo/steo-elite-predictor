/**
 * Script de diagnostic pour vérifier les données ESPN et Supabase
 * 
 * Exécution: npx tsx scripts/diagnose-data.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Variables Supabase manquantes');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Fonction pour obtenir les dates UTC
function getUTCDateString(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function getYesterdayUTCString(): string {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().slice(0, 10).replace(/-/g, '');
}

function getTomorrowUTCString(): string {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow.toISOString().slice(0, 10).replace(/-/g, '');
}

async function checkESPNData() {
  console.log('\n========================================');
  console.log('📊 DIAGNOSTIC ESPN');
  console.log('========================================\n');

  const todayStr = getUTCDateString();
  const yesterdayStr = getYesterdayUTCString();
  const tomorrowStr = getTomorrowUTCString();
  
  console.log(`📅 Dates (UTC):`);
  console.log(`   Hier: ${yesterdayStr}`);
  console.log(`   Aujourd'hui: ${todayStr}`);
  console.log(`   Demain: ${tomorrowStr}`);
  console.log('');

  const sports = [
    { key: 'basketball/nba', name: 'NBA' },
    { key: 'hockey/nhl', name: 'NHL' },
    { key: 'soccer/eng.1', name: 'Premier League' },
    { key: 'soccer/esp.1', name: 'La Liga' },
    { key: 'soccer/ger.1', name: 'Bundesliga' },
    { key: 'soccer/ita.1', name: 'Serie A' },
    { key: 'soccer/fra.1', name: 'Ligue 1' },
    { key: 'soccer/uefa.champions', name: 'Champions League' },
    { key: 'soccer/fifa.worldq.uefa', name: 'Éliminatoires Mondial Europe' },
    { key: 'soccer/uefa.nations', name: 'Nations League' },
  ];

  for (const sport of sports) {
    console.log(`\n📌 ${sport.name} (${sport.key}):`);
    
    for (const dateType of ['hier', 'aujourd\'hui', 'demain'] as const) {
      const dateStr = dateType === 'hier' ? yesterdayStr : 
                      dateType === 'demain' ? tomorrowStr : todayStr;
      
      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/${sport.key}/scoreboard?dates=${dateStr}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          console.log(`   ${dateType}: ❌ HTTP ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        const events = data.events || [];
        
        if (events.length === 0) {
          console.log(`   ${dateType}: 📭 Aucun match`);
        } else {
          const completed = events.filter((e: any) => e.status?.type?.completed).length;
          const upcoming = events.length - completed;
          const live = events.filter((e: any) => e.status?.type?.state === 'in').length;
          
          console.log(`   ${dateType}: ✅ ${events.length} matchs (${completed} terminés, ${upcoming} à venir${live > 0 ? `, ${live} en direct` : ''})`);
          
          // Afficher quelques exemples
          const samples = events.slice(0, 3);
          for (const event of samples) {
            const competition = event.competitions?.[0];
            const home = competition?.competitors?.find((c: any) => c.homeAway === 'home');
            const away = competition?.competitors?.find((c: any) => c.homeAway === 'away');
            const status = event.status?.type?.state || 'unknown';
            const date = new Date(event.date).toLocaleString('fr-FR');
            
            console.log(`      - ${home?.team?.displayName || '?'} vs ${away?.team?.displayName || '?'} (${status}) - ${date}`);
          }
          
          if (events.length > 3) {
            console.log(`      ... et ${events.length - 3} autres`);
          }
        }
        
        // Petit délai pour éviter le rate limiting
        await new Promise(r => setTimeout(r, 500));
        
      } catch (error: any) {
        console.log(`   ${dateType}: ❌ ${error.message}`);
      }
    }
  }
}

async function checkSupabaseData() {
  console.log('\n========================================');
  console.log('📊 DIAGNOSTIC SUPABASE');
  console.log('========================================\n');

  // 1. Compter les prédictions par statut
  const { count: totalCount } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true });

  const { count: pendingCount } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  const { count: completedCount } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed');

  const { count: wonCount } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'won');

  const { count: lostCount } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'lost');

  console.log(`📈 Statistiques globales:`);
  console.log(`   Total: ${totalCount || 0}`);
  console.log(`   En attente: ${pendingCount || 0}`);
  console.log(`   Terminés: ${completedCount || 0}`);
  console.log(`   Gagnés: ${wonCount || 0}`);
  console.log(`   Perdus: ${lostCount || 0}`);
  console.log('');

  // 2. Prédictions en attente - détails
  const { data: pendingPredictions, error } = await supabase
    .from('predictions')
    .select('*')
    .eq('status', 'pending')
    .order('match_date', { ascending: true })
    .limit(20);

  if (error) {
    console.error('❌ Erreur récupération prédictions:', error);
    return;
  }

  if (pendingPredictions && pendingPredictions.length > 0) {
    console.log(`\n📋 Prédictions en attente (${pendingPredictions.length} sur 20 affichés):`);
    
    for (const pred of pendingPredictions) {
      const matchDate = pred.match_date ? new Date(pred.match_date).toLocaleDateString('fr-FR') : 'Date inconnue';
      const daysSinceMatch = pred.match_date ? Math.floor((Date.now() - new Date(pred.match_date).getTime()) / (1000 * 60 * 60 * 24)) : '?';
      
      console.log(`   - ${pred.home_team} vs ${pred.away_team}`);
      console.log(`     Sport: ${pred.sport || 'N/A'} | Date: ${matchDate}`);
      console.log(`     Âge: ${daysSinceMatch} jours | ID: ${pred.id}`);
      console.log('');
    }
  } else {
    console.log(`\n✅ Aucune prédiction en attente`);
  }

  // 3. Prédictions par sport
  const { data: bySport } = await supabase
    .from('predictions')
    .select('sport, status');

  if (bySport && bySport.length > 0) {
    const sportStats: Record<string, { total: number; pending: number; completed: number }> = {};
    
    for (const pred of bySport) {
      const sport = pred.sport || 'Autre';
      if (!sportStats[sport]) {
        sportStats[sport] = { total: 0, pending: 0, completed: 0 };
      }
      sportStats[sport].total++;
      if (pred.status === 'pending') sportStats[sport].pending++;
      if (pred.status === 'completed' || pred.status === 'won' || pred.status === 'lost') {
        sportStats[sport].completed++;
      }
    }

    console.log(`\n📊 Par sport:`);
    for (const [sport, stats] of Object.entries(sportStats)) {
      console.log(`   ${sport}: ${stats.total} total, ${stats.pending} en attente, ${stats.completed} terminés`);
    }
  }

  // 4. Vérifier les vieux matchs en attente (> 3 jours)
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const { data: oldPending } = await supabase
    .from('predictions')
    .select('*')
    .eq('status', 'pending')
    .lt('match_date', threeDaysAgo.toISOString());

  if (oldPending && oldPending.length > 0) {
    console.log(`\n⚠️ ANCIENS MATCHS EN ATTENTE (plus de 3 jours): ${oldPending.length}`);
    console.log(`   Ces matchs doivent être nettoyés ou leur résultat vérifié.`);
  }
}

async function proposeCleanup() {
  console.log('\n========================================');
  console.log('🧹 PROPOSITION DE NETTOYAGE');
  console.log('========================================\n');

  // Matchs en attente de plus de 7 jours
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { count: veryOldCount } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .lt('match_date', sevenDaysAgo.toISOString());

  if (veryOldCount && veryOldCount > 0) {
    console.log(`⚠️ ${veryOldCount} matchs en attente depuis plus de 7 jours`);
    console.log(`   Ces matchs sont probablement obsolètes et devraient être supprimés.`);
    console.log('');
    console.log(`   Pour les supprimer:`);
    console.log(`   DELETE FROM predictions WHERE status = 'pending' AND match_date < '${sevenDaysAgo.toISOString()}';`);
  } else {
    console.log(`✅ Aucun match très ancien en attente`);
  }

  // Matchs terminés de plus de 30 jours
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { count: oldCompletedCount } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true })
    .in('status', ['completed', 'won', 'lost'])
    .lt('match_date', thirtyDaysAgo.toISOString());

  if (oldCompletedCount && oldCompletedCount > 0) {
    console.log(`\n📊 ${oldCompletedCount} matchs terminés de plus de 30 jours`);
    console.log(`   Ces matchs peuvent être archivés si nécessaire.`);
  }
}

async function main() {
  console.log('🔍 DIAGNOSTIC DU SYSTÈME DE PRONOSTICS');
  console.log(`📅 ${new Date().toLocaleString('fr-FR')}`);
  console.log('');

  await checkESPNData();
  await checkSupabaseData();
  await proposeCleanup();

  console.log('\n========================================');
  console.log('✅ DIAGNOSTIC TERMINÉ');
  console.log('========================================\n');
}

main().catch(console.error);
