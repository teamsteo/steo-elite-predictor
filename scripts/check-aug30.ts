/**
 * Script de diagnostic : vérifier les prédictions autour du 30 août 2026
 * Lance avec: npx tsx scripts/check-aug30.ts
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/home/z/my-project/.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Variables Supabase manquantes');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function check() {
  // 1. Toutes les prédictions du 28 au 31 août (par created_at)
  console.log('\n=== PAR CREATED_AT ===');
  for (const d of ['2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31']) {
    const { data, error } = await supabase
      .from('predictions')
      .select('match_id, home_team, away_team, league, sport, match_date, created_at, status, predicted_result')
      .gte('created_at', `${d}T00:00:00Z`)
      .lte('created_at', `${d}T23:59:59Z`)
      .order('created_at', { ascending: true });

    if (error) {
      console.error(`  ❌ ${d}: ${error.message}`);
    } else {
      console.log(`  📅 ${d} (created_at): ${(data || []).length} prédictions`);
      for (const p of (data || [])) {
        const md = (p.match_date || '').split('T')[0];
        console.log(`    ${p.sport?.padEnd(10)} ${p.league?.padEnd(25)} ${p.home_team?.padEnd(20)} vs ${(p.away_team || '').padEnd(20)} | match_date=${md} | status=${p.status} | pred=${p.predicted_result}`);
      }
    }
  }

  // 2. Toutes les prédictions avec match_date du 29 au 31 août
  console.log('\n=== PAR MATCH_DATE ===');
  for (const d of ['2026-08-29', '2026-08-30', '2026-08-31']) {
    const targetDate = new Date(d + 'T12:00:00Z');
    const dayBefore = new Date(targetDate);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const dayAfter = new Date(targetDate);
    dayAfter.setDate(dayAfter.getDate() + 2);

    const { data, error } = await supabase
      .from('predictions')
      .select('match_id, home_team, away_team, league, sport, match_date, created_at, status, predicted_result')
      .gte('match_date', dayBefore.toISOString())
      .lt('match_date', dayAfter.toISOString())
      .order('match_date', { ascending: true });

    if (error) {
      console.error(`  ❌ ${d}: ${error.message}`);
    } else {
      const filtered = (data || []).filter((p: any) => (p.match_date || '').split('T')[0] === d);
      console.log(`  📅 ${d} (match_date): ${filtered.length} prédictions (raw: ${(data || []).length})`);
      for (const p of filtered) {
        const ca = (p.created_at || '').split('T')[0];
        console.log(`    ${p.sport?.padEnd(10)} ${p.league?.padEnd(25)} ${p.home_team?.padEnd(20)} vs ${(p.away_team || '').padEnd(20)} | created_at=${ca} | status=${p.status} | pred=${p.predicted_result}`);
      }
    }
  }

  // 3. Dernières 20 prédictions enregistrées (pour voir le flux global)
  console.log('\n=== 20 DERNIÈRES PRÉDICTIONS (created_at DESC) ===');
  const { data: recent } = await supabase
    .from('predictions')
    .select('match_id, home_team, away_team, league, sport, match_date, created_at, status, predicted_result')
    .order('created_at', { ascending: false })
    .limit(20);

  for (const p of (recent || [])) {
    const md = (p.match_date || '').split('T')[0];
    const ca = (p.created_at || '').substring(0, 16);
    console.log(`  ${ca} | ${p.sport?.padEnd(10)} ${p.league?.padEnd(25)} ${p.home_team} vs ${p.away_team} | match_date=${md} | status=${p.status} | pred=${p.predicted_result}`);
  }

  // 4. Comptes globaux
  const { count: total } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true });
  console.log(`\n📊 Total prédictions en DB: ${total}`);

  const { count: pending } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  console.log(`📊 En attente (pending): ${pending}`);

  const { count: completed } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed');
  console.log(`📊 Complétées: ${completed}`);

  const { count: nullPred } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true })
    .is('predicted_result', null);
  console.log(`📊 Avec predicted_result=NULL: ${nullPred}`);

  await supabase.auth.signOut();
}

check().catch(e => { console.error(e); process.exit(1); });
