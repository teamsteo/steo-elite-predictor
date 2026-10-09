/**
 * Smoke test Task 41-b — Route /api/mlb avec engine V4 + décision V3
 * Exécution: npx tsx scripts/smoke_task41_mlb_route.ts
 */

// Polymock minimal pour Next.js runtime (route utilise fetch global uniquement)
async function main() {
  const { GET } = await import('../src/app/api/mlb/route');
  const req = new Request('http://localhost:3000/api/mlb');
  const res = await GET(req);
  const data = await res.json();

  console.log(`HTTP ${res.status} · success=${data.success} · total=${data.stats?.total ?? 0}`);

  const preds = data.predictions || [];
  console.log(`\n${preds.length} prédictions:`);
  for (const p of preds.slice(0, 6)) {
    const eng = p.engine;
    const v3 = p.v3Decision;
    console.log(
      `  ${p.homeTeam?.name} vs ${p.awayTeam?.name}` +
      `\n    winner=${p.prediction?.winnerTeam} (${p.prediction?.winnerProb}%) total=${p.prediction?.projectedTotal}` +
      (eng ? `\n    🔧 engine: proj ${eng.homeExpectedRuns}-${eng.awayExpectedRuns}, partants ${eng.awayStarter ?? 'n/d'} @ ${eng.homeStarter ?? 'n/d'}, shrink ${eng.shrinkFactor}` : '\n    🔧 engine: n/d (fail-closed)') +
      (v3 ? `\n    🧭 V3: ${v3.category} → ${v3.sideLabel} · écart ${v3.gapPp}pp · EV ${v3.ev}% (pessim ${v3.evConservative}%) · ${v3.reasons[0]}` : '\n    🧭 V3: n/d') +
      `\n    insight: conf=${p.insight?.confidence} VB=${p.insight?.valueBetDetected}`
    );
  }

  // Résumé décisions
  const cats = preds.reduce((acc: any, p: any) => { acc[p.v3Decision?.category ?? 'none'] = (acc[p.v3Decision?.category ?? 'none'] || 0) + 1; return acc; }, {});
  console.log(`\nDécisions V3: ${JSON.stringify(cats)}`);
  console.log('\n✅ Smoke route terminé');
}

main().catch((e) => { console.error('SMOKE ERROR:', e); process.exit(1); });
