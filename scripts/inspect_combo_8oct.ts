/**
 * Inspection DB — état des legs du combiné du 8 oct (Spurs + 76ers)
 * Vérifie si les verify crons ont mis à jour result_match / status.
 */
import { readFileSync } from 'fs';

const src = readFileSync('/home/z/my-project/_archived_trading/scripts/backtest.ts', 'utf8');
const urlMatch = src.match(/const SUPABASE_URL\s*=\s*'([^']+)'/);
const keyMatch = src.match(/const SUPABASE_ANON_KEY\s*=\s*'([^']+)'/);
if (!urlMatch || !keyMatch) { console.error('❌ clés introuvables'); process.exit(1); }
const URL = urlMatch[1];
const KEY = keyMatch[1];

async function sb(path: string) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json', Accept: 'application/json',
    },
  });
  if (!r.ok) { console.error(`❌ ${r.status} ${path}`, await r.text()); return null; }
  return r.json();
}

(async () => {
  // Legs combo autour du 8 oct
  const legs = await sb(
    `predictions?is_combo=eq.true&order=created_at.desc&limit=20&select=id,match_id,home_team,away_team,league,sport,match_date,predicted_result,status,result_match,home_score,away_score,combo_id,created_at,confidence`
  );
  if (!legs) return;
  console.log(`\n=== ${legs.length} legs combo récentes ===`);
  for (const l of legs) {
    console.log(
      `${(l.combo_id ?? '').slice(-8)} | ${l.sport} | ${l.home_team} vs ${l.away_team}` +
      ` | ${l.match_date} | pick=${l.predicted_result} | status=${l.status}` +
      ` | result=${l.result_match} | score=${l.home_score ?? '-'}-${l.away_score ?? '-'}`
    );
  }
})();
