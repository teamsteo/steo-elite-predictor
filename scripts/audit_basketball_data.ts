/**
 * Audit qualité données basket en DB (analyse V4)
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.log('❌ Credentials Supabase absents du .env local — audit via production API à la place');
  process.exit(2);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function q(label: string, build: () => any, pick?: (r: any) => any) {
  const { data, error } = await build();
  console.log(`\n== ${label} ==`);
  if (error) { console.log('ERREUR:', error.message); return; }
  const rows = pick ? pick(data) : data;
  console.log(JSON.stringify(rows, null, 1).slice(0, 2500));
}

async function main() {
  await q('Volume par sport', () =>
    sb.from('predictions').select('sport,home_score,status').limit(5000),
  (rows: any[]) => {
    const agg: Record<string, { n: number; withScores: number }> = {};
    for (const r of rows) {
      const k = (r.sport || 'null').toLowerCase();
      agg[k] = agg[k] || { n: 0, withScores: 0 };
      agg[k].n++;
      if (r.home_score != null) agg[k].withScores++;
    }
    return agg;
  });

  await q('Basket: 15 lignes récentes avec scores', () =>
    sb.from('predictions').select('match_id,home_team,away_team,home_score,away_score,status,win_probability,prediction_type,match_date')
      .ilike('sport', '%basket%').not('home_score', 'is', null)
      .order('match_date', { ascending: false }).limit(15));

  await q('Basket: stats score (détection quarts vs points)', () =>
    sb.from('predictions').select('home_score,away_score').ilike('sport', '%basket%').not('home_score', 'is', null).limit(2000),
  (rows: any[]) => {
    if (!rows.length) return 'aucune ligne';
    const hs = rows.map((r) => r.home_score).filter((v) => v != null);
    const as = rows.map((r) => r.away_score).filter((v) => v != null);
    const stats = (a: number[]) => ({
      min: Math.min(...a), max: Math.max(...a),
      avg: Math.round(a.reduce((s, v) => s + v, 0) / a.length * 10) / 10,
    });
    return { n: rows.length, home: stats(hs), away: stats(as) };
  });

  await q('Basket: répartition statut', () =>
    sb.from('predictions').select('status').ilike('sport', '%basket%').limit(2000),
  (rows: any[]) => {
    const agg: Record<string, number> = {};
    for (const r of rows) agg[r.status || 'null'] = (agg[r.status || 'null'] || 0) + 1;
    return agg;
  });
}
main();
