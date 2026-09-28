/**
 * Test intégration Task 27 — enrichAndFilterBadjan sur les matchs ESPN réels
 * (cotes synthétiques favorables pour forcer le passage du filtre de base,
 *  puis vérification que les ratios domicile/H2H filtrnent correctement)
 * Exécution: npx tsx scripts/test_task27_integration.ts
 */
import { enrichAndFilterBadjan, formatBadjanMessage } from '../src/lib/badjanService';

const LEAGUES = ['soccer/eng.1', 'soccer/esp.1', 'soccer/ger.1', 'soccer/ita.1', 'soccer/fra.1', 'soccer/uefa.champions'];

async function main() {
  const matches: any[] = [];
  for (const slug of LEAGUES) {
    try {
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${slug}/scoreboard`, { signal: AbortSignal.timeout(10000) });
      const data = await res.json();
      for (const ev of (data?.events || [])) {
        const comps = ev?.competitions?.[0]?.competitors || [];
        const home = comps.find((c: any) => c.homeAway === 'home');
        const away = comps.find((c: any) => c.homeAway === 'away');
        if (!home || !away) continue;
        if (ev.status?.type?.completed) continue; // à venir uniquement
        matches.push({
          id: `espn_${ev.id}`,
          espnEventId: String(ev.id),
          homeTeamId: String(home?.team?.id || ''),
          awayTeamId: String(away?.team?.id || ''),
          espnLeagueSlug: slug,
          homeTeam: home.team.displayName,
          awayTeam: away.team.displayName,
          sport: 'Football',
          league: data?.leagues?.[0]?.name || slug,
          date: ev.date,
          // ⚠️ cotes SYNTHÉTIQUES favorables (test): favori domicile 1.60, risque 37.5% ≤ 45
          oddsHome: 1.6,
          oddsDraw: 3.8,
          oddsAway: 5.5,
          isEstimated: false,
          riskPercentage: 37.5,
          winProbability: 62.5,
          predictedResult: 'home' as const,
          confidence: 'high',
          recommendation: home.team.displayName,
        });
      }
    } catch (e: any) {
      console.log(`⚠️ ${slug}: ${e?.message}`);
    }
  }
  console.log(`Matchs à venir injectés (cotes synthétiques): ${matches.length}`);
  if (matches.length === 0) { console.log('Pas de matchs à venir — test neutralisé'); return; }

  const { picks, funnel } = await enrichAndFilterBadjan(matches);
  console.log('\n═══ FUNNEL ENRICHI ═══');
  console.log(JSON.stringify({
    total: funnel.total, foot: funnel.foot, candidates: funnel.candidates,
    statsChecked: funnel.statsChecked, statsUnavailable: funnel.statsUnavailable,
    homeRatioRejected: funnel.homeRatioRejected, h2hRejected: funnel.h2hRejected,
    finalPicks: funnel.finalPicks, reason: funnel.reason,
  }, null, 1));
  console.log('\n═══ REJETS (max 10) ═══');
  for (const d of funnel.rejectionDetails) console.log(`  ↳ ${d}`);
  console.log(`\n═══ PICKS FINAUX: ${picks.length} ═══`);
  if (picks.length > 0) {
    console.log(formatBadjanMessage(picks));
  }
}

main();
