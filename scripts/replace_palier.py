# Replace everything from line 3722 to end of file with new generatePalierIntelligent

with open('/home/z/my-project/src/app/api/cron/route.ts', 'r') as f:
    lines = f.readlines()

# Keep lines 1 to 3721 (indices 0 to 3720)
header = lines[:3721]

new_function = '''async function generatePalierIntelligent(): Promise<{ mlb_palier: { success: boolean; matches: number; combo?: string; error?: string } }> {
  console.log('🎯 [PALIER] Lecture prédictions pipeline ML...');

  const today = new Date();
  const todayISO = today.toISOString().split('T')[0];

  // 1. Lire les prédictions générées aujourd'hui par le pipeline ML (07:00 UTC)
  const dayPredictions = await SupabaseStore.getPredictionsByCreatedAt(todayISO);
  console.log(`📊 [PALIER] ${dayPredictions.length} prédictions trouvées pour ${todayISO}`);

  // 2. Filtrer : pending, cotes réelles, pas combo, pas avoid, pas low confidence
  const eligible = dayPredictions.filter(p =>
    p.status === 'pending' &&
    p.odds_home > 0 &&
    p.odds_away > 0 &&
    !p.is_combo &&
    p.predicted_result !== 'avoid' &&
    p.confidence !== 'low'
  );
  console.log(`📊 [PALIER] ${eligible.length} éligibles (pending, cotes réelles, pas combo)`);

  // 3. Trier par fiabilité : risk % croissant, puis edge décroissant
  eligible.sort((a, b) => {
    const riskA = a.risk_percentage ?? 100;
    const riskB = b.risk_percentage ?? 100;
    if (riskA !== riskB) return riskA - riskB;
    return (b.edge_value || 0) - (a.edge_value || 0);
  });

  // 4. Top 5 max
  const top5 = eligible.slice(0, 5);
  console.log(`📊 [PALIER] Top ${top5.length} sélectionnés`);

  if (top5.length < 2) {
    const msg = `⚠️ <b>Palier Intelligent</b>\\n\\nPas assez de prédictions fiables aujourd'hui (${top5.length} seulement).\\nLe pipeline ML tourne à 07:00 UTC.\\n\\n🔄 Prochain essai demain.`;
    await sendTelegramPersonalMessage(msg);
    return { mlb_palier: { success: true, matches: top5.length } };
  }

  // 5. Construire le message
  const sportEmoji: Record<string, string> = {
    football: '⚽', basketball: '🏀', baseball: '⚾', hockey: '🏒', tennis: '🎾', other: '⚡',
  };
  const confLabel: Record<string, string> = {
    very_high: '🔥', high: '✅', medium: '⚡', low: '⚠️',
  };

  let message = `🎯 <b>PALIER INTELLIGENT - Top Fiables</b>\\n`;
  message += `📅 ${today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\\n`;
  message += `📊 ${eligible.length} prédictions analysées → Top ${top5.length}\\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━━\\n\\n`;

  for (let i = 0; i < top5.length; i++) {
    const p = top5[i];
    const se = sportEmoji[p.sport] || '⚡';
    const cl = confLabel[p.confidence || 'medium'] || '⚡';

    let teamPred = '';
    let oddsPred = 0;
    if (p.predicted_result === 'home') {
      teamPred = p.home_team;
      oddsPred = p.odds_home;
    } else if (p.predicted_result === 'away') {
      teamPred = p.away_team;
      oddsPred = p.odds_away;
    } else if (p.predicted_result === 'draw') {
      teamPred = 'Match Nul';
      oddsPred = p.odds_draw || 0;
    } else {
      teamPred = p.predicted_result || '?';
      oddsPred = Math.max(p.odds_home, p.odds_away);
    }

    const risk = p.risk_percentage ?? 100;
    const edge = p.edge_value || 0;

    let riskLabel: string, riskEmoji: string;
    if (risk <= 25) { riskLabel = 'SAFE'; riskEmoji = '🟢'; }
    else if (risk <= 40) { riskLabel = 'FIABLE'; riskEmoji = '🟡'; }
    else if (risk <= 50) { riskLabel = 'MODÉRÉ'; riskEmoji = '🟠'; }
    else { riskLabel = 'RISQUÉ'; riskEmoji = '🔴'; }

    let matchTime = '';
    try {
      const dt = new Date(p.match_date);
      matchTime = dt.toISOString().slice(11, 16) + ' UTC';
    } catch {}

    message += `${i + 1}. ${riskEmoji} ${se} <b>${p.away_team} @ ${p.home_team}</b>\\n`;
    message += `   ⏰ ${matchTime} | ${p.league}\\n`;
    message += `   → <b>${teamPred}</b> @ ${oddsPred.toFixed(2)}\\n`;
    message += `   ${cl} Confiance: ${p.confidence || '?'} | Risque: ${risk.toFixed(0)}% | Edge: ${edge >= 0 ? '+' : ''}${edge.toFixed(1)}%\\n`;
    message += `   Niveau: ${riskLabel}\\n\\n`;
  }

  // 6. Combo : 2 plus sûrs, idéalement sports différents
  let pick1 = top5[0];
  let pick2: typeof top5[0] | null = null;
  for (let i = 1; i < top5.length; i++) {
    if (top5[i].sport !== pick1.sport) {
      pick2 = top5[i];
      break;
    }
  }
  if (!pick2) pick2 = top5[1];

  function getOdds(p: typeof pick1): number {
    if (p.predicted_result === 'home') return p.odds_home;
    if (p.predicted_result === 'away') return p.odds_away;
    if (p.predicted_result === 'draw') return p.odds_draw || 1.5;
    return Math.max(p.odds_home, p.odds_away);
  }

  function getTeam(p: typeof pick1): string {
    if (p.predicted_result === 'home') return p.home_team;
    if (p.predicted_result === 'away') return p.away_team;
    if (p.predicted_result === 'draw') return 'Match Nul';
    return p.predicted_result || '?';
  }

  const odds1 = getOdds(pick1);
  const odds2 = getOdds(pick2);
  const comboOdds = odds1 * odds2;
  const comboProb = ((100 - (pick1.risk_percentage ?? 100)) / 100) * ((100 - (pick2.risk_percentage ?? 100)) / 100) * 100;

  let palierNiveau: string;
  if (comboProb >= 45) palierNiveau = '🟢 EXCELLENT';
  else if (comboProb >= 35) palierNiveau = '🟡 BON';
  else if (comboProb >= 25) palierNiveau = '🟠 ACCEPTABLE';
  else palierNiveau = '🔴 TROP RISQUÉ';

  const se1 = sportEmoji[pick1.sport] || '⚡';
  const se2 = sportEmoji[pick2.sport] || '⚡';

  message += `━━━━━━━━━━━━━━━━━━━━━━━━\\n`;
  message += `🎯 <b>COMBO DU JOUR</b>\\n\\n`;
  message += `1️⃣ ${se1} ${getTeam(pick1)} @ ${odds1.toFixed(2)} [${pick1.league}]\\n`;
  message += `     Risque: ${(pick1.risk_percentage ?? 100).toFixed(0)}% | ${pick1.confidence}\\n`;
  message += `2️⃣ ${se2} ${getTeam(pick2)} @ ${odds2.toFixed(2)} [${pick2.league}]\\n`;
  message += `     Risque: ${(pick2.risk_percentage ?? 100).toFixed(0)}% | ${pick2.confidence}\\n`;
  message += `\\n╔══════════════════════════╗\\n`;
  message += `║  Cote combo: x${comboOdds.toFixed(2)}\\n`;
  message += `║  Probabilité: ${comboProb.toFixed(1)}%\\n`;
  message += `║  Niveau: ${palierNiveau}\\n`;
  message += `╚══════════════════════════╝\\n`;

  const mise = 10000;
  const gain = Math.round(mise * comboOdds);
  const retrait = Math.round(gain * 0.4);
  const bankrollSuiv = gain - retrait;

  message += `\\n💰 <b>Simulation Montante</b>\\n`;
  message += `   Mise: ${mise.toLocaleString('fr-FR')}F\\n`;
  message += `   Gain: ${gain.toLocaleString('fr-FR')}F\\n`;
  message += `   Retrait 40%: ${retrait.toLocaleString('fr-FR')}F ✅\\n`;
  message += `   Bankroll suivant: ${bankrollSuiv.toLocaleString('fr-FR')}F\\n`;

  if (message.length > 4096) {
    const mid = message.lastIndexOf('\\n━━', Math.floor(message.length / 2));
    if (mid > 0) {
      await sendTelegramPersonalMessage(message.slice(0, mid));
      await sendTelegramPersonalMessage(message.slice(mid));
    } else {
      await sendTelegramPersonalMessage(message.slice(0, 4000));
      await sendTelegramPersonalMessage(message.slice(4000));
    }
  } else {
    await sendTelegramPersonalMessage(message);
  }

  console.log(`✅ [PALIER] ${top5.length} picks envoyés perso, combo: ${getTeam(pick1)} + ${getTeam(pick2)} @ ${comboProb.toFixed(1)}%`);

  return {
    mlb_palier: {
      success: true,
      matches: top5.length,
      combo: `${getTeam(pick1)} (${pick1.sport}) + ${getTeam(pick2)} (${pick2.sport}) @ ${comboProb.toFixed(1)}%`,
    }
  };
}
'''

with open('/home/z/my-project/src/app/api/cron/route.ts', 'w') as f:
    f.writelines(header)
    f.write(new_function)

print("✅ Replaced from line 3722 to end with clean generatePalierIntelligent")
