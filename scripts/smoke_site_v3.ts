/**
 * Smoke test site-layer V3 (Task 21) : fixtures TennisMatch → getV3Predictions (seed offline)
 * → toSiteFormat (conversion partagée du pipeline site+Telegram)
 * Vérifie : probabilités affichées 50-100, kelly en %, shape compatible front.
 */
import { getV3Predictions, toApiPrediction } from '../src/lib/tennis-v3/service';
import { toSiteFormat } from '../src/lib/tennis-v3/pipeline';
import { TennisMatch } from '../src/lib/tennis-enhanced/smart-collector';

function fixture(p1: string, p2: string, tomorrow = true): TennisMatch {
  const d = new Date(Date.now() + (tomorrow ? 86400000 : 0));
  return {
    id: `${p1}-${p2}`.replace(/\s+/g, '_').toLowerCase(),
    player1: p1,
    player2: p2,
    player1Id: p1.toLowerCase(),
    player2Id: p2.toLowerCase(),
    tournament: 'ATP Masters 1000',
    tournamentId: 'm1000',
    tournamentTier: 'masters_1000' as any,
    surface: 'hard' as any,
    round: 'Quarterfinals',
    date: d,
    odds1: 1.85,
    odds2: 1.95,
  } as TennisMatch;
}

async function main() {
  const matches = [
    fixture('Carlos Alcaraz', 'Jannik Sinner'),
    fixture('Novak Djokovic', 'Taylor Fritz'),
    fixture('Iga Swiatek', 'Aryna Sabalenka'),
  ];
  const v3 = await getV3Predictions(matches);
  // Chemin exact du pipeline : API 0-1 d'abord, puis conversion affichage partagée
  const apiV3 = v3.predictions.map((p) => toSiteFormat(toApiPrediction(p)));

  let fails = 0;
  const check = (cond: boolean, label: string) => {
    if (!cond) { console.log(`❌ ${label}`); fails++; } else { console.log(`✅ ${label}`); }
  };

  check(apiV3.length > 0, `prédictions générées (${apiV3.length})`);
  for (const p of apiV3.slice(0, 8)) {
    const prob = p.prediction.winProbability;
    check(Number.isInteger(prob) && prob >= 50 && prob <= 100,
      `${p.player1} vs ${p.player2} → prob affichée ${prob}% (50-100)`);
    check(p.prediction.riskPercentage >= 0 && p.prediction.riskPercentage <= 50,
      `  risque ${p.prediction.riskPercentage}% (0-50)`);
    check(p.betting.kellyStake >= 0 && p.betting.kellyStake <= 25,
      `  kelly ${p.betting.kellyStake}% (échelle %)`);
    check(!!p.prediction.winnerName && !!p.prediction.winner, '  winner/winnerName présents');
    check(typeof p.betting.recommendedBet === 'boolean', '  recommendedBet boolean');
    check(!!p.matchId && !!p.date && !!p.tournament, '  champs front (matchId/date/tournament) OK');
  }

  console.log(fails === 0 ? '\n════ SMOKE SITE-LAYER V3 : TOUT PASSE ════' : `\n════ ${fails} ÉCHECS ════`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERREUR:', e); process.exit(1); });
