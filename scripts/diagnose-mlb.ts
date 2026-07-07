/**
 * Diagnostic script - vérifie les données MLB dans Supabase
 * et compare avec ESPN pour détecter des incohérences
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  
  // Récupérer les 20 dernières prédictions MLB complétées
  const { data: predictions, error } = await supabase
    .from('predictions')
    .select('match_id, home_team, away_team, predicted_result, actual_result, home_score, away_score, result_match, match_date, league, odds_home, odds_draw, odds_away')
    .eq('status', 'completed')
    .or('sport.eq.other,league.ilike.%MLB%,sport.eq.baseball')
    .order('match_date', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Erreur:', error);
    return;
  }

  console.log(`\n=== ${predictions?.length || 0} prédictions MLB/other complétées ===\n`);

  if (predictions) {
    // Stats
    const wins = predictions.filter(p => p.result_match === true).length;
    const losses = predictions.filter(p => p.result_match === false).length;
    console.log(`✅ ${wins} gagnés, ❌ ${losses} perdus\n`);

    for (const p of predictions) {
      const emoji = p.result_match ? '✅' : '❌';
      const score = (p.home_score !== null && p.away_score !== null) 
        ? `${p.home_score}-${p.away_score}` 
        : 'N/A';
      const actualWinner = 
        p.home_score > p.away_score ? 'home' : 
        p.away_score > p.home_score ? 'away' : 'draw';
      const predLabel = p.predicted_result === 'home' ? p.home_team : p.away_team;
      
      console.log(`${emoji} ${p.home_team} vs ${p.away_team}`);
      console.log(`   Date: ${p.match_date}`);
      console.log(`   Prono: ${p.predicted_result} (${predLabel}) → Réel: ${p.actual_result} (score: ${score})`);
      console.log(`   result_match: ${p.result_match} | League: ${p.league}`);
      console.log(`   Odds: H=${p.odds_home} D=${p.odds_draw} A=${p.odds_away}`);
      console.log('');
    }
  }

  // Vérifier aussi les foot avec VN
  console.log('\n=== PRÉDICTIONS FOOT RÉCENTES (vérification VN) ===\n');
  
  const { data: footPreds } = await supabase
    .from('predictions')
    .select('match_id, home_team, away_team, predicted_result, odds_home, odds_draw, odds_away, status, match_date')
    .eq('sport', 'football')
    .order('match_date', { ascending: false })
    .limit(10);

  if (footPreds) {
    for (const p of footPreds) {
      const hasVN = p.odds_draw !== null && p.odds_draw > 1.0;
      console.log(`${p.home_team} vs ${p.away_team} | prono: ${p.predicted_result} | odds: H=${p.odds_home} D=${p.odds_draw} A=${p.odds_away} | VN possible: ${hasVN} | status: ${p.status}`);
    }
  }
}

main().catch(console.error);