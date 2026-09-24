/**
 * Smoke test V3 end-to-end : noms format BetExplorer → prédictions complètes
 * Run: npx tsx scripts/smoke_tennis_v3.ts
 */
import { getV3Predictions } from '../src/lib/tennis-v3/service';
import { TennisMatch } from '../src/lib/tennis-enhanced/smart-collector';

function mkMatch(id: string, p1: string, p2: string, odds1: number, odds2: number, surface: any, tier: any, days = 1): TennisMatch {
  return {
    id, player1: p1, player2: p2, player1Id: 'x', player2Id: 'y',
    tournament: 'Test Masters', tournamentId: 't1', tournamentTier: tier,
    surface, round: 'Quarterfinals', date: new Date(Date.now() + days * 86400000),
    odds1, odds2, bookmaker: 'avg', category: 'atp', status: 'scheduled' as any, source: 'betexplorer',
  } as TennisMatch;
}

(async () => {
  const matches = [
    mkMatch('m1', 'Carlos Alcaraz', 'Jannik Sinner', 2.1, 1.75, 'Hard', 'masters_1000'),
    mkMatch('m2', 'Taylor Fritz', 'Alexander Zverev', 2.8, 1.45, 'Hard', 'atp_500'),
    mkMatch('m3', 'Novak Djokovic', 'Casper Ruud', 1.6, 2.4, 'Clay', 'atp_250'),
    mkMatch('m4', 'Iga Swiatek', 'Aryna Sabalenka', 1.9, 1.95, 'Clay', 'wta_1000'),
    mkMatch('m5', 'Joueur Fantome X', 'Carlos Alcaraz', 6.0, 1.12, 'Hard', 'atp_250'), // 1 inconnu
  ];

  const res = await getV3Predictions(matches);
  console.log('\n════════ RÉSUMÉ V3 ════════');
  console.log(`Prédictions: ${res.predictions.length} | Non résolus: ${res.unresolved.length}`);
  console.log(`Data: seed=${res.status.seed?.total} matchs (${res.status.seed?.generatedAt}), incrémental=+${res.status.incrementalMatches}`);

  for (const p of res.predictions) {
    const d = p.decision;
    const pickOdds = p.winner === 'player1' ? p.odds1 : p.odds2;
    console.log(`\n${d.label} — ${p.player1} vs ${p.player2} (${p.surface})`);
    console.log(`   Pick: ${p.winnerName} @ ${pickOdds.toFixed(2)} | p=${(Math.max(d.probPlayer1, 1 - d.probPlayer1) * 100).toFixed(0)}% | consensus ${d.consensus}/7 | bet=${d.betRecommended}`);
    console.log(`   Facteurs: ${p.factors.map((f) => `${f.key}=${f.score.toFixed(2)}`).join(' ')}`);
    if (d.reasons.length) console.log(`   Raisons: ${d.reasons.join(' ; ')}`);
  }
  if (res.unresolved.length > 0) {
    console.log(`\n⚠️ Non résolus (attendu): ${res.unresolved.map((u) => u.player1).join(', ')}`);
  }
  // assertions de bon sens
  let ok = 0, ko = 0;
  const check = (name: string, cond: boolean) => { if (cond) { ok++; } else { ko++; console.log(`❌ ${name}`); } };
  const sinner = res.predictions.find((p) => p.matchId === 'm1');
  check('m1 prédit (Sinner/Alcaraz)', Boolean(sinner));
  if (sinner) {
    // proba du PICK (pas de p1) doit être cohérente pour un top-2 mondial
    const pickProb = Math.max(sinner.decision.probPlayer1, 1 - sinner.decision.probPlayer1);
    check('m1 proba pick dans [0.55,0.9]', pickProb > 0.55 && pickProb < 0.9, String(pickProb));
  }
  check('m5 fantôme partiellement non résolu', res.unresolved.some((u) => u.player1 === 'Joueur Fantome X'));
  check('facteurs = 7 par prédiction', res.predictions.every((p) => p.factors.length === 7));
  check('tiers valides', res.predictions.every((p) => ['green', 'yellow', 'red'].includes(p.decision.tier)));
  console.log(`\n════════ SMOKE: ${ok} OK / ${ko} KO ════════`);
  process.exit(ko > 0 ? 1 : 0);
})();
