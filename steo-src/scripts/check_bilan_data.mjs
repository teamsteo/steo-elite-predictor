import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function check() {
  // Check predictions from Aug 24 by created_at
  const { data, error } = await supabase
    .from('predictions')
    .select('match_id, home_team, away_team, sport, predicted_result, status, result_match, created_at, match_date, confidence, risk_percentage, is_value_bet')
    .gte('created_at', '2026-08-24T00:00:00Z')
    .lte('created_at', '2026-08-24T23:59:59Z')
    .order('created_at', { ascending: true });
  
  if (error) { console.error('Error:', error); return; }
  console.log(`Total found by created_at Aug 24: ${data?.length || 0}`);
  if (data && data.length > 0) {
    for (const p of data) {
      console.log(`  ${p.sport} | ${p.home_team} vs ${p.away_team} | predicted=${p.predicted_result} | status=${p.status} | created=${(p.created_at||'').split('T')[0]} | match=${(p.match_date||'').split('T')[0]} | vb=${p.is_value_bet} | conf=${p.confidence}`);
    }
  }

  // Also check by match_date Aug 24
  console.log('\n--- By match_date Aug 24 ---');
  const { data: data2, error: error2 } = await supabase
    .from('predictions')
    .select('match_id, home_team, away_team, sport, predicted_result, status, result_match, created_at, match_date')
    .gte('match_date', '2026-08-23T00:00:00Z')
    .lte('match_date', '2026-08-25T23:59:59Z')
    .order('match_date', { ascending: true });
  
  if (error2) { console.error('Error:', error2); return; }
  console.log(`Total found by match_date range: ${data2?.length || 0}`);
  if (data2 && data2.length > 0) {
    for (const p of data2) {
      console.log(`  ${p.sport} | ${p.home_team} vs ${p.away_team} | predicted=${p.predicted_result} | status=${p.status} | created=${(p.created_at||'').split('T')[0]} | match=${(p.match_date||'').split('T')[0]}`);
    }
  }
}

check().catch(console.error);
