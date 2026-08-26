import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

async function check() {
  const { data: d1, error: e1 } = await supabase
    .from('predictions')
    .select('match_id, home_team, away_team, predicted_result, status, result_match, created_at, match_date, odds_home, odds_away, risk_percentage, is_value_bet')
    .gte('created_at', '2026-08-25T00:00:00Z')
    .lte('created_at', '2026-08-25T23:59:59Z')
    .order('created_at', { ascending: true })
  if (e1) { console.error('Error:', e1); return }
  console.log('=== created_at Aug 25 ===')
  console.log('Total:', d1?.length || 0)
  for (const p of (d1 || [])) {
    const md = (p.match_date || '').split('T')[0]
    const ca = (p.created_at || '').split('T')[0]
    const vb = p.is_value_bet ? 'VB' : ''
    const rm = p.result_match === null ? 'null' : p.result_match ? 'WIN' : 'LOSS'
    console.log(`${md} | ${(p.home_team||'').padEnd(22)} vs ${(p.away_team||'').padEnd(22)} | pred:${(p.predicted_result||'N/A').padEnd(6)} | risk:${String(p.risk_percentage||'?').padEnd(3)} | ${p.status?.padEnd(10)} | ${rm} | ${ca} ${vb}`)
  }

  const { data: d2 } = await supabase
    .from('predictions')
    .select('match_id, home_team, away_team, predicted_result, status, result_match, created_at, match_date')
    .gte('created_at', '2026-08-24T00:00:00Z')
    .lte('created_at', '2026-08-24T23:59:59Z')
    .order('created_at', { ascending: true })
  console.log('\n=== created_at Aug 24 (corrupted check) ===')
  console.log('Total:', d2?.length || 0)
  for (const p of (d2 || [])) {
    const corrupted = !p.predicted_result || p.predicted_result === 'avoid'
    const rm = p.result_match === null ? 'null' : p.result_match ? 'WIN' : 'LOSS'
    console.log(`${(p.match_date||'').split('T')[0]} | ${(p.home_team||'').padEnd(22)} vs ${(p.away_team||'').padEnd(15)} | pred:${(p.predicted_result||'NULL').padEnd(8)} | ${p.status?.padEnd(10)} | ${rm}${corrupted ? ' CORROMPU' : ''}`)
  }
}
check().catch(console.error)
