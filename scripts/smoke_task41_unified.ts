/**
 * Smoke test Task 41-c — getUnifiedPrediction NHL/MLB end-to-end
 * Exécution: npx tsx scripts/smoke_task41_unified.ts
 * Vérifie: engine NHL/MLB branchée, blend 50/35/15, décision V3, blocs de sortie.
 */

import { getUnifiedPrediction } from '../src/lib/unifiedPredictionService';

async function main() {
  console.log('═══ UNIFIED NHL end-to-end ═══');
  const nhl = await getUnifiedPrediction({
    id: 'smoke_nhl_1',
    homeTeam: 'Toronto Maple Leafs',
    awayTeam: 'Montreal Canadiens',
    sport: 'NHL',
    league: 'NHL',
    oddsHome: 1.80,
    oddsDraw: null,
    oddsAway: 2.05,
  });
  console.log(`Probas finales: H=${nhl.mlPrediction.homeProb}% D=${nhl.mlPrediction.drawProb}% A=${nhl.mlPrediction.awayProb}%`);
  console.log(`Sources: ${nhl.dataQuality.sources.join(', ')}`);
  console.log(`DataQuality: ${nhl.dataQuality.score}`);
  console.log(`nhlEngine: ${nhl.nhlEngine ? `proj ${nhl.nhlEngine.homeExpectedGoals}-${nhl.nhlEngine.awayExpectedGoals} P(home) ${(nhl.nhlEngine.homeWinProb * 100).toFixed(0)}% markets=${nhl.nhlEngine.markets.length}` : 'ABSENT'}`);
  console.log(`v3Decision: ${nhl.v3Decision ? `${nhl.v3Decision.category} → ${nhl.v3Decision.sideLabel} · écart ${nhl.v3Decision.gapPp}pp · EV ${nhl.v3Decision.ev}% · seuil ${nhl.v3Decision.requiredGapPp}pp` : 'ABSENT'}`);
  console.log('Reasoning:');
  for (const r of nhl.recommendation.reasoning) console.log(`  • ${r}`);

  // Assertions critiques
  const checks: Array<[string, boolean]> = [
    ['NHL: bloc nhlEngine présent', !!nhl.nhlEngine],
    ['NHL: décision V3 présente', !!nhl.v3Decision],
    ['NHL: source NHL-Engine-V4', nhl.dataQuality.sources.includes('NHL-Engine-V4')],
    ['NHL: dataQuality boostée ≥ 60', nhl.dataQuality.score >= 60],
    ['NHL: somme probas = 100', Math.abs(nhl.mlPrediction.homeProb + nhl.mlPrediction.awayProb + nhl.mlPrediction.drawProb - 100) < 0.5],
    ['NHL: ligne raisonnement engine', nhl.recommendation.reasoning.some((r) => r.includes('Engine V4 NHL'))],
  ];
  let fail = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? '✅' : '❌'} ${name}`);
    if (!ok) fail++;
  }

  console.log('\n═══ UNIFIED MLB end-to-end ═══');
  const mlb = await getUnifiedPrediction({
    id: 'smoke_mlb_1',
    homeTeam: 'New York Yankees',
    awayTeam: 'Boston Red Sox',
    sport: 'MLB',
    league: 'MLB',
    oddsHome: 1.72,
    oddsDraw: null,
    oddsAway: 2.15,
  });
  console.log(`Probas finales: H=${mlb.mlPrediction.homeProb}% A=${mlb.mlPrediction.awayProb}%`);
  console.log(`Sources: ${mlb.dataQuality.sources.join(', ')}`);
  console.log(`mlbEngine: ${mlb.mlbEngine ? `proj ${mlb.mlbEngine.homeExpectedRuns}-${mlb.mlbEngine.awayExpectedRuns} P(home) ${(mlb.mlbEngine.homeWinProb * 100).toFixed(0)}% partants ${mlb.mlbEngine.awayStarter ?? 'n/d'} @ ${mlb.mlbEngine.homeStarter ?? 'n/d'}` : 'ABSENT'}`);
  console.log(`v3Decision: ${mlb.v3Decision ? `${mlb.v3Decision.category} → ${mlb.v3Decision.sideLabel} · écart ${mlb.v3Decision.gapPp}pp · EV ${mlb.v3Decision.ev}%` : 'ABSENT'}`);

  const checksMlb: Array<[string, boolean]> = [
    ['MLB: bloc mlbEngine présent', !!mlb.mlbEngine],
    ['MLB: décision V3 présente', !!mlb.v3Decision],
    ['MLB: source MLB-Engine-V4', mlb.dataQuality.sources.includes('MLB-Engine-V4')],
    ['MLB: somme probas = 100', Math.abs(mlb.mlPrediction.homeProb + mlb.mlPrediction.awayProb + mlb.mlPrediction.drawProb - 100) < 0.5],
    ['MLB: ligne raisonnement engine', mlb.recommendation.reasoning.some((r) => r.includes('Engine V4 MLB'))],
  ];
  for (const [name, ok] of checksMlb) {
    console.log(`${ok ? '✅' : '❌'} ${name}`);
    if (!ok) fail++;
  }

  console.log(`\n${fail === 0 ? '✅ TOUS CHECKS PASSÉS' : `❌ ${fail} CHECKS ÉCHOUÉS`}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error('SMOKE ERROR:', e); process.exit(1); });
