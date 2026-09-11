/**
 * Diagnostic BADJAN — pourquoi si peu de matchs ?
 * Exécute le pipeline réel (getMatchesWithRealOdds) et montre l'entonnoir
 * de filtres étape par étape. 0 écriture DB, 0 envoi Telegram.
 * Run: npx tsx scripts/test_badjan_funnel.ts
 */
import { getMatchesWithRealOdds } from '../src/lib/combinedDataService';
import { filterBadjanMatches, BADJAN_MAX_RISK } from '../src/lib/badjanService';

async function main() {
  console.log('📡 Récupération pipeline réel (force refresh)...\n');
  const matches = await getMatchesWithRealOdds(true);

  const isFoot = (s?: string) => !!s && (s.toLowerCase().includes('foot') || s.toLowerCase() === 'soccer');

  const total = matches.length;
  const foot = matches.filter((m: any) => isFoot(m.sport));
  const footWithRisk = foot.filter((m: any) => typeof m.riskPercentage === 'number' && isFinite(m.riskPercentage));
  const riskOk = footWithRisk.filter((m: any) => m.riskPercentage <= BADJAN_MAX_RISK);
  const predHome = riskOk.filter((m: any) => m.predictedResult === 'home');
  const marketOk = predHome.filter((m: any) => {
    const oh = m.oddsHome, oa = m.oddsAway, od = m.oddsDraw;
    if (typeof oh !== 'number' || typeof oa !== 'number') return false;
    if (oh < 1.10 || oh >= oa) return false;
    if (typeof od === 'number' && oh >= od) return false;
    return true;
  });
  const notEstimated = marketOk.filter((m: any) => !m.isEstimated);

  console.log('════════ ENTONNOIR BADJAN ════════');
  console.log(`1. Matchs pipeline total            : ${total}`);
  console.log(`2. Football uniquement              : ${foot.length}`);
  console.log(`3. Avec riskPercentage défini       : ${footWithRisk.length}`);
  console.log(`4. Risque ≤ ${BADJAN_MAX_RISK}%                    : ${riskOk.length}`);
  console.log(`5. Prédiction = victoire domicile   : ${predHome.length}`);
  console.log(`6. Marché confirme (cote 1 la plus basse du 1X2) : ${marketOk.length}`);
  console.log(`7. Cotes réelles (non estimées)     : ${notEstimated.length}`);
  console.log('');

  // Pourquoi les étapes 3→4 et 4→5 perdent des matchs : distribution des risques
  if (footWithRisk.length > 0) {
    const risks = footWithRisk.map((m: any) => m.riskPercentage).sort((a: number, b: number) => a - b);
    const buckets = [0, 15, 25, 35, 45, 55, 70, 101];
    console.log('══ Distribution des risques (foot avec risque défini) ══');
    for (let i = 0; i < buckets.length - 1; i++) {
      const n = risks.filter((r: number) => r >= buckets[i] && r < buckets[i + 1]).length;
      console.log(`   risque [${buckets[i]}-${buckets[i + 1 - (i === 0 ? 0 : 0) + 1 > buckets.length ? 100 : buckets[i + 1] - 1]}%] : ${n}`);
    }
  }
  console.log('');

  // Répartition des prédictions parmi les foot à risque OK
  if (riskOk.length > 0) {
    const byPred: Record<string, number> = {};
    riskOk.forEach((m: any) => { const p = m.predictedResult || '??'; byPred[p] = (byPred[p] || 0) + 1; });
    console.log('══ Prédictions parmi foot risque ≤45% ══');
    console.log('   ', JSON.stringify(byPred));
  }
  console.log('');

  // Estimated odds : combien de foot perdus à cause de isEstimated ?
  const estimatedFoot = marketOk.filter((m: any) => m.isEstimated);
  console.log(`Foot perdus à l'étape 7 (cotes estimées) : ${estimatedFoot.length}`);
  console.log('');

  const final = filterBadjanMatches(matches);
  console.log(`══ RÉSULTAT FINAL BADJAN : ${final.length} matchs ══`);
  final.forEach((m: any, i: number) => {
    console.log(`   ${i + 1}. ${m.homeTeam} vs ${m.awayTeam} [${m.league}] risque ${m.riskPercentage}% cotes 1:${m.oddsHome?.toFixed(2)} X:${m.oddsDraw?.toFixed(2)} 2:${m.oddsAway?.toFixed(2)}`);
  });

  // Si final < marketOk/estimation : pourquoi
  const rejectedByDedup = notEstimated.length - final.length;
  if (rejectedByDedup > 0) console.log(`   (dedup a retiré ${rejectedByDedup} doublon(s))`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
