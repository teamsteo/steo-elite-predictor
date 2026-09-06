/**
 * Test end-to-end du tracker de calibration avec un VRAI match ESPN.
 *
 * 1. Fetch le scoreboard ESPN du jour (PL/Liga/Serie A/Bundesliga/L1)
 * 2. Trouve un match TERMINÉ (status completed)
 * 3. Construit une calibration réaliste pour ce match (HT = première moitié du score final)
 * 4. recordCalibration → trackResultsForDate → affiche le message Telegram + stats JSON
 */
import { calibrate } from '../src/lib/liveCalibration/calibrate';
import { recordCalibration, clearStore, getDailyCalibrations } from '../src/lib/liveCalibration/store';
import { trackResultsForDate, formatResultsTelegram } from '../src/lib/liveCalibration/resultTracker';
import type { LiveCalibrationInput } from '../src/lib/liveCalibration/types';

const LEAGUES = ['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1'];

async function findFinishedMatch(): Promise<any | null> {
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  for (const lg of LEAGUES) {
    try {
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/scoreboard?dates=${today}`);
      if (!res.ok) continue;
      const data: any = await res.json();
      for (const ev of data?.events || []) {
        const comp = ev.competitions?.[0];
        const completed = ev.status?.type?.completed === true;
        if (!comp || !completed) continue;
        const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
        const away = comp.competitors?.find((c: any) => c.homeAway === 'away');
        if (!home?.score || !away?.score) continue;
        return {
          id: ev.id,
          league: data?.leagues?.[0]?.name || lg,
          date: ev.date,
          homeTeam: home.team?.displayName || 'Home',
          awayTeam: away.team?.displayName || 'Away',
          final: { home: parseInt(home.score, 10), away: parseInt(away.score, 10) },
        };
      }
    } catch (e) {
      console.warn(`  ⚠️ ${lg}: ${e}`);
    }
  }
  return null;
}

async function main() {
  console.log('🔍 Recherche d\'un match terminé aujourd\'hui sur ESPN...');
  const match = await findFinishedMatch();
  if (!match) {
    console.error('❌ Aucun match terminé trouvé aujourd\'hui — réessayer plus tard ou changer la date');
    process.exit(1);
  }
  console.log(`✅ Match trouvé : ${match.homeTeam} vs ${match.awayTeam} (final ${match.final.home}-${match.final.away}, id ${match.id}, ${match.league})`);

  // HT plausible = moitié du score final (arrondi bas) — le tracker n'évalue QUE vs le final
  const ht = { home: Math.floor(match.final.home / 2), away: Math.floor(match.final.away / 2) };
  const goalsOffset = 1; // un but marqué en 2e MT pour l'histoire

  const input: LiveCalibrationInput = {
    match_id: `espn_${match.id}`,
    home_team: match.homeTeam,
    away_team: match.awayTeam,
    league: match.league,
    kickoff_utc: match.date,
    halftime_utc: match.date,
    score_ht: ht,
    first_half: {
      duration_minutes: 45,
      shots: [
        { minute: 3, team: 'home', xg: 0.08, outcome: 'blocked', is_big_chance: false, is_penalty: false, location: 'outside_box' },
        { minute: 12, team: 'home', xg: 0.45, outcome: 'goal', is_big_chance: true, is_penalty: false, location: 'penalty_area' },
        { minute: 17, team: 'home', xg: 0.12, outcome: 'saved', is_big_chance: false, is_penalty: false, location: 'penalty_area' },
        { minute: 25, team: 'away', xg: 0.18, outcome: 'saved', is_big_chance: false, is_penalty: false, location: 'penalty_area' },
        { minute: 29, team: 'home', xg: 0.25, outcome: 'post', is_big_chance: true, is_penalty: false, location: 'penalty_area' },
        { minute: 33, team: 'away', xg: 0.09, outcome: 'off_target', is_big_chance: false, is_penalty: false, location: 'outside_box' },
        { minute: 38, team: 'home', xg: 0.30, outcome: 'saved', is_big_chance: true, is_penalty: false, location: 'six_yard_box' },
        { minute: 41, team: 'away', xg: 0.28, outcome: 'goal', is_big_chance: true, is_penalty: false, location: 'penalty_area' },
        { minute: 43, team: 'away', xg: 0.22, outcome: 'off_target', is_big_chance: false, is_penalty: false, location: 'outside_box' },
        { minute: 45, team: 'home', xg: 0.15, outcome: 'blocked', is_big_chance: false, is_penalty: false, location: 'outside_box' },
      ],
      summary: {
        xg_total: { home: 1.35, away: 0.77 },
        xg_big_chance: { home: 1.00, away: 0.28 },
        xg_penalty: { home: 0.0, away: 0.0 },
        xg_routine: { home: 0.35, away: 0.49 },
        shots_total: { home: 6, away: 4 },
        shots_on_target: { home: 3, away: 1 },
        possession_pct: { home: 55, away: 45 },
        field_tilt_pct: { home: 60, away: 40 },
        passes_final_third: { home: 30, away: 18 },
        pressures_high: { home: 12, away: 8 },
        corners: { home: 3, away: 1 },
        cards: { home_yellow: 0, away_yellow: 1, home_red: 0, away_red: 0 },
      },
      momentum_10min_windows: [
        { window_start: 0, window_end: 10, xg_home: 0.05, xg_away: 0.0 },
        { window_start: 10, window_end: 20, xg_home: 0.45, xg_away: 0.05 },
        { window_start: 20, window_end: 30, xg_home: 0.05, xg_away: 0.18 },
        { window_start: 30, window_end: 40, xg_home: 0.30, xg_away: 0.10 },
        { window_start: 40, window_end: 45, xg_home: 0.0, xg_away: 0.12 },
      ],
    },
    pre_match_model: {
      home_attack_rating: 1.60,
      home_defense_rating: 1.00,
      away_attack_rating: 1.30,
      away_defense_rating: 1.05,
      lambda_home: 1.55,
      lambda_away: 1.15,
      predicted_outcome_probs: { home: 0.45, draw: 0.27, away: 0.28 },
    },
    bookmaker_odds_ht: {
      home_win: 1.75,
      draw: 3.60,
      away_win: 5.00,
      over_2_5: 1.95,
      under_2_5: 2.50,   // surestimé volontairement → value bet probable (perdant si 2-2+)
      btts_yes: 1.60,    // sous-estimé volontairement → value bet probable (gagnant si BTTS)
      btts_no: 1.72,
    },
  };

  console.log('\n🧮 Calibration...');
  const output = calibrate(input);
  console.log(`   confiance: ${output.confidence_index.toFixed(1)} | value bets: ${output.value_bets_detected.length}`);
  console.log(`   fair odds 1X2: ${output.halftime_fair_odds.home_win.toFixed(2)} / ${output.halftime_fair_odds.draw.toFixed(2)} / ${output.halftime_fair_odds.away_win.toFixed(2)}`);

  console.log('\n📦 Enregistrement au store...');
  clearStore();
  recordCalibration({
    match_id: input.match_id,
    home_team: input.home_team,
    away_team: input.away_team,
    league: input.league,
    kickoff_utc: input.kickoff_utc,
    halftime_utc: input.halftime_utc,
    score_ht: input.score_ht,
  }, output, {
    pre_match_probs: input.pre_match_model.predicted_outcome_probs,
  });

  console.log(`\n🎯 Tracking (kickoff ${input.kickoff_utc})...`);
  const result = await trackResultsForDate('today');

  console.log('\n━━━ STATS JSON ━━━');
  console.log(JSON.stringify({ resolved: result.resolved ?? result.matches.length, day: result.day, rolling: result.rolling, unresolved: result.unresolved_ids }, null, 2));

  console.log('\n━━━ MESSAGE TELEGRAM (indicatif, privé) ━━━');
  console.log(formatResultsTelegram(result).replace(/<[^>]+>/g, ''));

  // Assertions de cohérence
  const entry = getDailyCalibrations('today')[0];
  const okBrier = typeof entry?.brier_model === 'number' && typeof entry?.brier_pre_match === 'number';
  const okBets = !entry?.value_bets || entry.value_bets_outcome?.length === entry.value_bets.length;
  const okPick = typeof entry?.model_pick_hit === 'boolean';
  console.log('\n━━━ ASSERTIONS ━━━');
  console.log(`brier calculé (modèle + pre-match): ${okBrier ? '✅' : '❌'} (${entry?.brier_model?.toFixed(3)} vs ${entry?.brier_pre_match?.toFixed(3)})`);
  console.log(`tous les value bets évalués: ${okBets ? '✅' : '❌'}`);
  console.log(`pick directionnel: ${okPick ? '✅' : '❌'} (${entry?.model_pick_hit})`);
  if (!okBrier || !okBets || !okPick) process.exit(1);
  console.log('\n🎉 TEST PASSED');
  void goalsOffset;
}

main().catch(e => { console.error('❌', e); process.exit(1); });
