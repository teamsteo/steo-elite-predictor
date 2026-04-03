/**
 * ENTRAÎNEMENT NHL/MLB AMÉLIORÉ
 * Teste les nouveaux patterns sur les données existantes
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://aumsrakioetvvqopthbs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MIN_SUCCESS_RATE = 75;
const MIN_SAMPLE_SIZE = 30;

// ============================================
// PATTERNS NHL AMÉLIORÉS
// ============================================

interface NHLMatch {
  id: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  result: string;
  home_shots: number;
  away_shots: number;
  home_sog: number;
  away_sog: number;
  home_ppg: number;
  away_ppg: number;
  home_pim: number;
  away_pim: number;
  odds_home: number;
  odds_away: number;
}

function extractNHLPatterns(matches: NHLMatch[]) {
  console.log('\n🏒 ANALYSE NHL AMÉLIORÉE...');
  const patterns: any[] = [];

  // 1. Shots Differential
  const shotsMatches = matches.filter(m =>
    m.home_shots && m.away_shots && m.home_shots > 0 && m.away_shots > 0
  );

  const shotThresholds = [5, 8, 10, 12, 15];
  for (const threshold of shotThresholds) {
    const applicable = shotsMatches.filter(m =>
      Math.abs(m.home_shots - m.away_shots) >= threshold
    );

    if (applicable.length >= MIN_SAMPLE_SIZE) {
      let correct = 0;
      applicable.forEach(m => {
        const moreShotsHome = m.home_shots > m.away_shots;
        const actualWinner = m.home_score > m.away_score ? 'home' : m.home_score < m.away_score ? 'away' : 'draw';
        if ((moreShotsHome && actualWinner === 'home') || (!moreShotsHome && actualWinner === 'away')) {
          correct++;
        }
      });

      const successRate = Math.round((correct / applicable.length) * 100);
      if (successRate >= MIN_SUCCESS_RATE) {
        patterns.push({
          id: `nhl_shots_diff_${threshold}`,
          sport: 'hockey',
          pattern_type: 'shots_differential',
          condition: `abs(home_shots - away_shots) >= ${threshold}`,
          outcome: 'more_shots_wins',
          sample_size: applicable.length,
          success_rate: successRate,
          confidence: Math.min(0.9, 0.5 + applicable.length / 500),
          description: `NHL: Différence tirs ≥ ${threshold} → ${successRate}%`,
          last_updated: new Date().toISOString()
        });
      }
      console.log(`   Shots diff ≥ ${threshold}: ${successRate}% (${applicable.length} matchs)`);
    }
  }

  // 2. PIM Differential (moins de pénalités = avantage)
  const pimMatches = matches.filter(m =>
    m.home_pim !== null && m.away_pim !== null &&
    m.home_pim !== undefined && m.away_pim !== undefined
  );

  const pimThresholds = [4, 6, 8, 10];
  for (const threshold of pimThresholds) {
    const applicable = pimMatches.filter(m =>
      Math.abs(m.home_pim - m.away_pim) >= threshold
    );

    if (applicable.length >= MIN_SAMPLE_SIZE) {
      let correct = 0;
      applicable.forEach(m => {
        const lessPimHome = m.home_pim < m.away_pim;
        const actualWinner = m.home_score > m.away_score ? 'home' : m.home_score < m.away_score ? 'away' : 'draw';
        if ((lessPimHome && actualWinner === 'home') || (!lessPimHome && actualWinner === 'away')) {
          correct++;
        }
      });

      const successRate = Math.round((correct / applicable.length) * 100);
      if (successRate >= MIN_SUCCESS_RATE) {
        patterns.push({
          id: `nhl_pim_diff_${threshold}`,
          sport: 'hockey',
          pattern_type: 'pim_differential',
          condition: `abs(home_pim - away_pim) >= ${threshold}`,
          outcome: 'less_pim_wins',
          sample_size: applicable.length,
          success_rate: successRate,
          confidence: Math.min(0.85, 0.5 + applicable.length / 500),
          description: `NHL: Moins de pénalités gagne (${successRate}%)`,
          last_updated: new Date().toISOString()
        });
      }
      console.log(`   PIM diff ≥ ${threshold}: ${successRate}% (${applicable.length} matchs)`);
    }
  }

  // 3. Power Play Goals
  const ppgMatches = matches.filter(m =>
    m.home_ppg !== null && m.away_ppg !== null
  );

  for (let threshold = 1; threshold <= 3; threshold++) {
    const homeHighPPG = ppgMatches.filter(m => m.home_ppg >= threshold);
    const awayHighPPG = ppgMatches.filter(m => m.away_ppg >= threshold);

    if (homeHighPPG.length >= MIN_SAMPLE_SIZE) {
      const wins = homeHighPPG.filter(m => m.result === 'H').length;
      const successRate = Math.round((wins / homeHighPPG.length) * 100);
      if (successRate >= MIN_SUCCESS_RATE) {
        patterns.push({
          id: `nhl_home_ppg_${threshold}`,
          sport: 'hockey',
          pattern_type: 'power_play_goals',
          condition: `home_ppg >= ${threshold}`,
          outcome: 'home_win',
          sample_size: homeHighPPG.length,
          success_rate: successRate,
          confidence: Math.min(0.8, 0.5 + homeHighPPG.length / 300),
          description: `NHL: ${threshold}+ buts PP domicile → ${successRate}%`,
          last_updated: new Date().toISOString()
        });
      }
      console.log(`   Home PPG ≥ ${threshold}: ${successRate}% (${homeHighPPG.length} matchs)`);
    }
  }

  // 4. Cote favorite
  const oddsMatches = matches.filter(m => m.odds_home && m.odds_home > 1);
  const oddsThresholds = [1.5, 1.6, 1.7, 1.8, 2.0];

  for (const threshold of oddsThresholds) {
    const homeFav = oddsMatches.filter(m => m.odds_home <= threshold);

    if (homeFav.length >= MIN_SAMPLE_SIZE) {
      const wins = homeFav.filter(m => m.result === 'H').length;
      const successRate = Math.round((wins / homeFav.length) * 100);

      if (successRate >= MIN_SUCCESS_RATE) {
        patterns.push({
          id: `nhl_home_fav_${threshold}`,
          sport: 'hockey',
          pattern_type: 'home_favorite',
          condition: `odds_home <= ${threshold}`,
          outcome: 'home_win',
          sample_size: homeFav.length,
          success_rate: successRate,
          confidence: Math.min(0.85, 0.5 + homeFav.length / 400),
          description: `NHL: Favori domicile ≤ ${threshold} → ${successRate}%`,
          last_updated: new Date().toISOString()
        });
      }
      console.log(`   Home favorite ≤ ${threshold}: ${successRate}% (${homeFav.length} matchs)`);
    }
  }

  return patterns;
}

// ============================================
// PATTERNS MLB AMÉLIORÉS
// ============================================

interface MLBMatch {
  id: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  result: string;
  home_hits: number;
  away_hits: number;
  home_errors: number;
  away_errors: number;
  home_homeruns: number;
  away_homeruns: number;
  innings: number;
  odds_home: number;
  odds_away: number;
  home_pitcher_era: number;
  away_pitcher_era: number;
}

function extractMLBPatterns(matches: MLBMatch[]) {
  console.log('\n⚾ ANALYSE MLB AMÉLIORÉE...');
  const patterns: any[] = [];

  // 1. ERA Differential
  const eraMatches = matches.filter(m =>
    m.home_pitcher_era && m.away_pitcher_era &&
    m.home_pitcher_era > 0 && m.away_pitcher_era > 0
  );

  const eraThresholds = [0.5, 1.0, 1.5, 2.0, 2.5];
  for (const threshold of eraThresholds) {
    const applicable = eraMatches.filter(m =>
      Math.abs(m.home_pitcher_era - m.away_pitcher_era) >= threshold
    );

    if (applicable.length >= MIN_SAMPLE_SIZE) {
      let correct = 0;
      applicable.forEach(m => {
        const betterEraHome = m.home_pitcher_era < m.away_pitcher_era;
        const actualWinner = m.home_score > m.away_score ? 'home' : m.home_score < m.away_score ? 'away' : 'draw';
        if ((betterEraHome && actualWinner === 'home') || (!betterEraHome && actualWinner === 'away')) {
          correct++;
        }
      });

      const successRate = Math.round((correct / applicable.length) * 100);
      if (successRate >= MIN_SUCCESS_RATE) {
        patterns.push({
          id: `mlb_era_diff_${threshold}`,
          sport: 'baseball',
          pattern_type: 'era_differential',
          condition: `abs(home_era - away_era) >= ${threshold}`,
          outcome: 'better_era_wins',
          sample_size: applicable.length,
          success_rate: successRate,
          confidence: Math.min(0.9, 0.5 + applicable.length / 1000),
          description: `MLB: Différence ERA ≥ ${threshold} → ${successRate}%`,
          last_updated: new Date().toISOString()
        });
      }
      console.log(`   ERA diff ≥ ${threshold}: ${successRate}% (${applicable.length} matchs)`);
    }
  }

  // 2. Hits Differential
  const hitsMatches = matches.filter(m =>
    m.home_hits && m.away_hits && m.home_hits > 0 && m.away_hits > 0
  );

  const hitsThresholds = [3, 4, 5, 6];
  for (const threshold of hitsThresholds) {
    const applicable = hitsMatches.filter(m =>
      Math.abs(m.home_hits - m.away_hits) >= threshold
    );

    if (applicable.length >= MIN_SAMPLE_SIZE) {
      let correct = 0;
      applicable.forEach(m => {
        const moreHitsHome = m.home_hits > m.away_hits;
        const actualWinner = m.home_score > m.away_score ? 'home' : m.home_score < m.away_score ? 'away' : 'draw';
        if ((moreHitsHome && actualWinner === 'home') || (!moreHitsHome && actualWinner === 'away')) {
          correct++;
        }
      });

      const successRate = Math.round((correct / applicable.length) * 100);
      if (successRate >= MIN_SUCCESS_RATE) {
        patterns.push({
          id: `mlb_hits_diff_${threshold}`,
          sport: 'baseball',
          pattern_type: 'hits_differential',
          condition: `abs(home_hits - away_hits) >= ${threshold}`,
          outcome: 'more_hits_wins',
          sample_size: applicable.length,
          success_rate: successRate,
          confidence: Math.min(0.85, 0.5 + applicable.length / 500),
          description: `MLB: Différence coups sûrs ≥ ${threshold} → ${successRate}%`,
          last_updated: new Date().toISOString()
        });
      }
      console.log(`   Hits diff ≥ ${threshold}: ${successRate}% (${applicable.length} matchs)`);
    }
  }

  // 3. Homeruns
  const hrMatches = matches.filter(m =>
    m.home_homeruns !== null && m.away_homeruns !== null
  );

  // Équipe à domicile avec 2+ homeruns
  const home2PlusHR = hrMatches.filter(m => m.home_homeruns >= 2);
  if (home2PlusHR.length >= MIN_SAMPLE_SIZE) {
    const wins = home2PlusHR.filter(m => m.result === 'H').length;
    const successRate = Math.round((wins / home2PlusHR.length) * 100);
    if (successRate >= MIN_SUCCESS_RATE) {
      patterns.push({
        id: `mlb_home_hr_2`,
        sport: 'baseball',
        pattern_type: 'homeruns_home',
        condition: `home_homeruns >= 2`,
        outcome: 'home_win',
        sample_size: home2PlusHR.length,
        success_rate: successRate,
        confidence: Math.min(0.8, 0.5 + home2PlusHR.length / 500),
        description: `MLB: 2+ homeruns domicile → ${successRate}%`,
        last_updated: new Date().toISOString()
      });
    }
    console.log(`   Home HR ≥ 2: ${successRate}% (${home2PlusHR.length} matchs)`);
  }

  // 4. Cote favorite
  const oddsMatches = matches.filter(m => m.odds_home && m.odds_home > 1);
  const oddsThresholds = [1.5, 1.6, 1.7, 1.8];

  for (const threshold of oddsThresholds) {
    const homeFav = oddsMatches.filter(m => m.odds_home <= threshold);

    if (homeFav.length >= MIN_SAMPLE_SIZE) {
      const wins = homeFav.filter(m => m.result === 'H').length;
      const successRate = Math.round((wins / homeFav.length) * 100);

      if (successRate >= MIN_SUCCESS_RATE) {
        patterns.push({
          id: `mlb_home_fav_${threshold}`,
          sport: 'baseball',
          pattern_type: 'home_favorite',
          condition: `odds_home <= ${threshold}`,
          outcome: 'home_win',
          sample_size: homeFav.length,
          success_rate: successRate,
          confidence: Math.min(0.85, 0.5 + homeFav.length / 500),
          description: `MLB: Favori domicile ≤ ${threshold} → ${successRate}%`,
          last_updated: new Date().toISOString()
        });
      }
      console.log(`   Home favorite ≤ ${threshold}: ${successRate}% (${homeFav.length} matchs)`);
    }
  }

  // 5. Under 7.5 avec deux bons lanceurs
  const underMatches = matches.filter(m =>
    m.home_pitcher_era && m.away_pitcher_era &&
    m.home_pitcher_era > 0 && m.away_pitcher_era > 0 &&
    m.home_score !== null && m.away_score !== null
  );

  for (const eraLimit of [3.0, 3.5, 4.0]) {
    const goodPitchers = underMatches.filter(m =>
      m.home_pitcher_era < eraLimit && m.away_pitcher_era < eraLimit
    );

    if (goodPitchers.length >= MIN_SAMPLE_SIZE) {
      const under7_5 = goodPitchers.filter(m => (m.home_score + m.away_score) < 7.5).length;
      const successRate = Math.round((under7_5 / goodPitchers.length) * 100);

      if (successRate >= MIN_SUCCESS_RATE) {
        patterns.push({
          id: `mlb_under_era_${eraLimit}`,
          sport: 'baseball',
          pattern_type: 'under_total',
          condition: `home_era < ${eraLimit} AND away_era < ${eraLimit}`,
          outcome: 'under_7.5',
          sample_size: goodPitchers.length,
          success_rate: successRate,
          confidence: Math.min(0.8, 0.5 + goodPitchers.length / 500),
          description: `MLB: Under 7.5 si 2 lanceurs ERA < ${eraLimit} → ${successRate}%`,
          last_updated: new Date().toISOString()
        });
      }
      console.log(`   Under 7.5 (ERA < ${eraLimit}): ${successRate}% (${goodPitchers.length} matchs)`);
    }
  }

  return patterns;
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🧠 ENTRAÎNEMENT NHL/MLB AMÉLIORÉ');
  console.log('='.repeat(60));
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log(`🎯 Seuil minimum succès: ${MIN_SUCCESS_RATE}%`);
  console.log(`🎯 Échantillon minimum: ${MIN_SAMPLE_SIZE} matchs`);
  console.log('='.repeat(60));

  // Charger NHL
  const { data: nhlMatches } = await supabase
    .from('nhl_matches')
    .select('*');

  console.log(`\n📊 NHL: ${nhlMatches?.length || 0} matchs chargés`);

  // Charger MLB
  const { data: mlbMatches } = await supabase
    .from('mlb_matches')
    .select('*');

  console.log(`📊 MLB: ${mlbMatches?.length || 0} matchs chargés`);

  // Extraire les patterns
  const nhlPatterns = nhlMatches ? extractNHLPatterns(nhlMatches as NHLMatch[]) : [];
  const mlbPatterns = mlbMatches ? extractMLBPatterns(mlbMatches as MLBMatch[]) : [];

  console.log('\n' + '='.repeat(60));
  console.log('📊 RÉSUMÉ');
  console.log('='.repeat(60));

  console.log(`\n🏒 NHL: ${nhlPatterns.length} patterns ≥ ${MIN_SUCCESS_RATE}%`);
  nhlPatterns.forEach(p => {
    console.log(`   ✅ ${p.pattern_type}: ${p.success_rate}% (${p.sample_size} matchs)`);
  });

  console.log(`\n⚾ MLB: ${mlbPatterns.length} patterns ≥ ${MIN_SUCCESS_RATE}%`);
  mlbPatterns.forEach(p => {
    console.log(`   ✅ ${p.pattern_type}: ${p.success_rate}% (${p.sample_size} matchs)`);
  });

  // Sauvegarder dans Supabase
  const allPatterns = [...nhlPatterns, ...mlbPatterns];

  if (allPatterns.length > 0) {
    console.log('\n💾 Sauvegarde des nouveaux patterns...');

    // D'abord supprimer les anciens patterns NHL/MLB
    await supabase.from('ml_patterns').delete().in('sport', ['hockey', 'baseball']);

    const { error } = await supabase.from('ml_patterns').insert(allPatterns);

    if (error) {
      console.log(`❌ Erreur: ${error.message}`);
    } else {
      console.log(`✅ ${allPatterns.length} nouveaux patterns sauvegardés!`);
    }
  } else {
    console.log('\n⚠️ Aucun pattern atteignant le seuil de 75%');
    console.log('💡 Recommandation: Scraper plus de données ou ajuster les features');
  }
}

main().catch(console.error);
