/**
 * Telegram Formatter — Construit le message HTML pour la publication Telegram
 * du réajustement live.
 *
 * Format inspiré du combo-private : titre ASCII, table des sélections,
 * simulation bankroll, disclaimer.
 */

import { LiveCalibrationOutput } from './types';

export function formatCalibrationTelegram(
  homeTeam: string,
  awayTeam: string,
  league: string,
  output: LiveCalibrationOutput,
): string {
  const lines: string[] = [];

  // Header
  lines.push('╔═══════════════════════════════════════╗');
  lines.push('║                                       ║');
  lines.push('║   🎯 <b>RÉAJUSTEMENT LIVE — MI-TEMPS</b>   ║');
  lines.push('║   🔄 Fair Odds recalculées (2e mi-temps)║');
  lines.push('║                                       ║');
  lines.push('╚═══════════════════════════════════════╝');
  lines.push('');

  // Match info
  lines.push(`⚽ <b>${homeTeam} vs ${awayTeam}</b>`);
  lines.push(`🏆 ${league}`);
  lines.push(`📊 Score MT : <b>${output.lambda_remaining.lambda_home_2nd_half > 0 ? '🔥' : '💤'} ${homeTeam} ${Math.round(output.lambda_remaining.lambda_home_2nd_half * 10) / 10}λ | ${awayTeam} ${Math.round(output.lambda_remaining.lambda_away_2nd_half * 10) / 10}λ</b>`);
  lines.push('');

  // Fair odds
  const odds = output.halftime_fair_odds;
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('<b>📊 FAIR ODDS (2e mi-temps)</b>');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`1️⃣ <b>${homeTeam}</b> : <code>${odds.home_win.toFixed(2)}</code>`);
  lines.push(`❌ <b>Nul</b> : <code>${odds.draw.toFixed(2)}</code>`);
  lines.push(`2️⃣ <b>${awayTeam}</b> : <code>${odds.away_win.toFixed(2)}</code>`);
  lines.push(`📈 <b>Over 2.5</b> : <code>${odds.over_2_5.toFixed(2)}</code>`);
  lines.push(`📉 <b>Under 2.5</b> : <code>${odds.under_2_5.toFixed(2)}</code>`);
  lines.push(`🥅 <b>BTTS Oui</b> : <code>${odds.btts_yes.toFixed(2)}</code>`);
  lines.push(`🚫 <b>BTTS Non</b> : <code>${odds.btts_no.toFixed(2)}</code>`);
  lines.push('');

  // Confidence
  const conf = output.calibration_components;
  const confBar = output.confidence_index >= 85 ? '🟢' :
                  output.confidence_index >= 70 ? '🟡' :
                  output.confidence_index >= 50 ? '🟠' : '🔴';
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`<b>🛡️ INDICE DE FIABILITÉ : ${confBar} ${Math.round(output.confidence_index)}/100 (${output.confidence_level})</b>`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`   📊 Sample size : ${Math.round(conf.sample_size_score)}/25`);
  lines.push(`   🎯 Signal quality : ${Math.round(conf.signal_quality_score)}/25`);
  lines.push(`   ⚖️ Game state stability : ${Math.round(conf.game_state_stability)}/25`);
  lines.push(`   🤝 Pre-model agreement : ${Math.round(conf.pre_model_agreement)}/25`);
  lines.push('');

  // Components clés
  const fxg = output.filtered_xg;
  const gs = output.game_state_bias;
  lines.push('<b>🔬 Composants du réajustement</b>');
  lines.push(`   xG shrinké MT : ${homeTeam} <code>${fxg.home.shrinked.toFixed(2)}</code> | ${awayTeam} <code>${fxg.away.shrinked.toFixed(2)}</code>`);
  lines.push(`   Big chances : ${fxg.home.big_chance.toFixed(2)} | ${fxg.away.big_chance.toFixed(2)}`);
  lines.push(`   Game state : ${gs.home_state >= 0 ? '+' : ''}${gs.home_state} (${gs.home_state > 0 ? `${homeTeam} mène` : gs.home_state < 0 ? `${awayTeam} mène` : 'Match nul'})`);
  lines.push('');

  // Value bets
  if (output.value_bets_detected.length > 0) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('<b>💎 VALUE BETS DÉTECTÉS</b>');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    output.value_bets_detected.forEach((vb, i) => {
      const recBar = vb.recommendation === 'HIGH_CONFIDENCE' ? '🟢' :
                     vb.recommendation === 'LOW_STAKE' ? '🟡' : '🟠';
      lines.push('');
      lines.push(`<b>${i + 1}. ${vb.market.replace(/_/g, ' ').toUpperCase()}</b> ${recBar}`);
      lines.push(`   💰 Cote bookmaker : <code>${vb.bookmaker_odds.toFixed(2)}</code>`);
      lines.push(`   🎯 Fair odds modèle : <code>${vb.fair_odds.toFixed(2)}</code>`);
      lines.push(`   📈 Edge : <b>+${vb.edge_pct.toFixed(1)}%</b>`);
      lines.push(`   🎲 Proba modèle : ${(vb.model_prob * 100).toFixed(1)}%`);
      lines.push(`   📍 Recommandation : <b>${vb.recommendation}</b>`);
      lines.push(`   💡 ${vb.reasoning}`);
    });
    lines.push('');
  } else {
    lines.push("<i>ℹ️ Aucun value bet détecté (confiance insuffisante ou pas d'edge).</i>");
    lines.push('');
  }

  // Disclaimer
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (output.confidence_index < 50) {
    lines.push('⚠️ <i>Fiabilité insuffisante — signal en mode observation.</i>');
  } else if (output.confidence_index < 70) {
    lines.push('⚠️ <i>Fiabilité moyenne — surveillance uniquement, pas de mise.</i>');
  } else if (output.confidence_index < 85) {
    lines.push('⚠️ <i>Fiabilité correcte — petites mises possibles (0.5-1% bankroll).</i>');
  } else {
    lines.push('✅ <i>Haute confiance — mises standard possibles (2-3% bankroll).</i>');
  }
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return lines.join('\n');
}
