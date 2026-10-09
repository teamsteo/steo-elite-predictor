/**
 * Smoke test Task 41 — Engines V3 en conditions RÉELLES (ESPN live)
 *
 * Exécution: npx tsx scripts/smoke_task41_engines.ts
 * Vérifie: chargement standings réels NHL/MLB, projections, lanceurs MLB réels,
 *          décisions V3 cohérentes. Aucune écriture, lecture seule.
 */

import { getNHLProjection, getNHLMarketEdges } from '../src/lib/nhlProjectionEngine';
import { getMLBProjection, getMLBMarketEdges } from '../src/lib/mlbProjectionEngine';

async function main() {
  console.log('\n═══ SMOKE NHL (données ESPN réelles) ═══');
  const nhl = await getNHLProjection('Toronto Maple Leafs', 'Montreal Canadiens');
  if (nhl) {
    console.log(`✅ Projection: ${nhl.homeTeam} ${nhl.homeExpectedGoals} – ${nhl.awayExpectedGoals} ${nhl.awayTeam}`);
    console.log(`   total ${nhl.expectedTotal} (intervalle 70%: ${nhl.intervalTotal70[0]}-${nhl.intervalTotal70[1]}), P(home) ${(nhl.homeWinProb * 100).toFixed(1)}%`);
    console.log(`   données: ${nhl.dataBasis}`);
    const edges = getNHLMarketEdges(nhl, { total: 6.5 });
    for (const e of edges) {
      console.log(`   ${e.market} ${e.line}: P=${(e.probModel * 100).toFixed(1)}% edge ${e.edgePp > 0 ? '+' : ''}${e.edgePp}pp (req ${e.requiredEdgePp}) → ${e.decision}`);
    }
  } else {
    console.log('⚠️ NHL engine → null (saison pas active ou standings indisponibles — fail-closed OK)');
  }

  console.log('\n═══ SMOKE MLB (données ESPN + lanceurs réels) ═══');
  const mlb = await getMLBProjection('New York Yankees', 'Boston Red Sox');
  if (mlb) {
    console.log(`✅ Projection: ${mlb.homeTeam} ${mlb.homeExpectedRuns} – ${mlb.awayExpectedRuns} ${mlb.awayTeam}`);
    console.log(`   total ${mlb.expectedTotal} (intervalle 70%: ${mlb.intervalTotal70[0]}-${mlb.intervalTotal70[1]}), P(home) ${(mlb.homeWinProb * 100).toFixed(1)}%`);
    console.log(`   partants: ${mlb.awayStarter ?? 'n/d'} @ ${mlb.homeStarter ?? 'n/d'} (facteurs H ${mlb.starterFactorHome} / A ${mlb.starterFactorAway})`);
    console.log(`   données: ${mlb.dataBasis}`);
    const edges = getMLBMarketEdges(mlb, { total: 8.5 });
    for (const e of edges) {
      console.log(`   ${e.market} ${e.line}: P=${(e.probModel * 100).toFixed(1)}% edge ${e.edgePp > 0 ? '+' : ''}${e.edgePp}pp (req ${e.requiredEdgePp}) → ${e.decision}`);
    }
  } else {
    console.log('⚠️ MLB engine → null (hors saison ou standings indisponibles — fail-closed OK)');
  }

  console.log('\n✅ Smoke test terminé (fail-closed accepté si hors saison)');
}

main().catch((e) => { console.error('SMOKE ERROR:', e); process.exit(1); });
