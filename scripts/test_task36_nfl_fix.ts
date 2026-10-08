/**
 * Test Task 36 — Fix NFL /api/nfl-pro (mapping ESPN → NFLMatch normalisé)
 *
 * Exécution: npx tsx scripts/test_task36_nfl_fix.ts
 *
 * Couverture:
 *  1. mapESPNEventToNFLMatch — event complet (home favori, away favori, sans odds)
 *  2. Conventions ESPN: odds.spread = spread côté HOME (négatif = home favori)
 *  3. Blend 65% marché / 35% engine (marge + total), cohérence interne
 *  4. Probabilités via CDF normale, clamps 0.15-0.85
 *  5. Fail-closed: event malformé → null (jamais d'exception)
 *  6. Match terminé (post) → scores réels + signaux pass
 *  7. Déterminisme: 0 Math.random (2 appels → résultat identique)
 *  8. Alias abbreviation WSH → WAS
 *  9. getNFLMatches live ESPN (graceful skip si réseau indisponible)
 */

import {
  mapESPNEventToNFLMatch,
  type NormalizedNFLMatch,
} from '../src/lib/nflAdvancedScraper';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`✅ ${name}`); }
  else { failed++; console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function section(title: string) {
  console.log(`\n${'='.repeat(60)}\n${title}\n${'='.repeat(60)}`);
}

// ---------- Fabriques d'events ESPN synthétiques ----------

function makeEvent(opts: {
  homeAbbr?: string;
  awayAbbr?: string;
  spread?: number;       // spread côté home (ESPN convention)
  overUnder?: number;
  state?: string;
  homeScore?: string;
  awayScore?: string;
  includeOdds?: boolean;
}) {
  const homeAbbr = opts.homeAbbr ?? 'DAL';
  const awayAbbr = opts.awayAbbr ?? 'TB';
  const competitors: any[] = [
    {
      homeAway: 'home',
      team: { abbreviation: homeAbbr, displayName: `${homeAbbr} DisplayName` },
      score: opts.homeScore ?? '0',
      records: [{ summary: '2-2' }],
    },
    {
      homeAway: 'away',
      team: { abbreviation: awayAbbr, displayName: `${awayAbbr} DisplayName` },
      score: opts.awayScore ?? '0',
      records: [{ summary: '3-1' }],
    },
  ];
  const event: any = {
    id: '401547431',
    date: '2026-10-09T00:15:00Z',
    name: `${awayAbbr} at ${homeAbbr}`,
    week: { number: 5 },
    season: { year: 2026 },
    status: { type: { state: opts.state ?? 'pre' } },
    competitions: [{ competitors }],
  };
  if (opts.includeOdds !== false) {
    event.competitions[0].odds = [{
      details: `${opts.spread !== undefined && opts.spread < 0 ? homeAbbr : awayAbbr} ${Math.abs(opts.spread ?? 3.5)}`,
      spread: opts.spread,
      overUnder: opts.overUnder,
    }];
  }
  return event;
}

// ============ 1. Event complet — home favori (cas réel TB @ DAL) ============
section('1. Event ESPN complet — home favori (DAL -9.5, O/U 48.5)');

const m1 = mapESPNEventToNFLMatch(makeEvent({ spread: -9.5, overUnder: 48.5 })) as NormalizedNFLMatch;
check('mapping non-null', m1 !== null);
if (m1) {
  check('id stable', m1.id === 'nfl-DAL-TB-20261009', m1.id);
  check('équipes résolues depuis la table', m1.homeTeam === 'Dallas Cowboys' && m1.awayTeam === 'Tampa Bay Buccaneers', `${m1.homeTeam} / ${m1.awayTeam}`);
  // DAL dvoa 18.5, TB dvoa 7.2 → engineMargin = (18.5-7.2)*0.45+2.5 = 7.585
  // blend = 0.65*9.5 + 0.35*7.585 = 8.83
  check('spread projeté = blend', Math.abs(m1.projected.spread - (0.65 * 9.5 + 0.35 * ((18.5 - 7.2) * 0.45 + 2.5))) < 0.2, `spread=${m1.projected.spread}`);
  check('total = homePoints + awayPoints', Math.abs(m1.projected.homePoints + m1.projected.awayPoints - m1.projected.totalPoints) < 0.3, `${m1.projected.homePoints}+${m1.projected.awayPoints} vs ${m1.projected.totalPoints}`);
  check('marge = homePoints - awayPoints ≈ spread', Math.abs((m1.projected.homePoints - m1.projected.awayPoints) - m1.projected.spread) < 0.3);
  check('home favori → homeWinProb > 0.5', m1.projected.homeWinProb > 0.55, `prob=${m1.projected.homeWinProb}`);
  check('probas dans [0.15, 0.85]', m1.projected.homeWinProb >= 0.15 && m1.projected.homeWinProb <= 0.85 && Math.abs(m1.projected.homeWinProb + m1.projected.awayWinProb - 1) < 0.01);
  check('spread line = 9.5 (absolu marché)', m1.insights.spread.line === 9.5, `line=${m1.insights.spread.line}`);
  check('total line = 48.5 (réel ESPN)', m1.insights.total.line === 48.5, `line=${m1.insights.total.line}`);
  check('records réels ESPN', m1.homeRecord === '2-2' && m1.awayRecord === '3-1');
  check('week + season', m1.week === 5 && m1.season === 2026);
  check('status scheduled, pas live', m1.status === 'scheduled' && !m1.isLive);
  check('dataQuality real (équives connues + marché)', m1.dataQuality.homeStats === 'real' && m1.dataQuality.awayStats === 'real' && m1.dataQuality.overallScore === 85);
  check('source espn-odds+dvoa-engine', m1.source === 'espn-odds+dvoa-engine');
  check('reasoning mentionne le marché', m1.insights.spread.reasoning.includes('Marché'));
  check('factors déterministes (restEdge/injuryEdge = 0)', m1.factors.restEdge === 0 && m1.factors.injuryEdge === 0);
  check('confidence bornée [40, 85]', m1.insights.confidence >= 40 && m1.insights.confidence <= 85, `conf=${m1.insights.confidence}`);
}

// ============ 2. Away favori (CHI @ GB: spread=+1.5 côté home) ============
section('2. Away favori — spread home positif (GB +1.5)');

const m2 = mapESPNEventToNFLMatch(makeEvent({ homeAbbr: 'GB', awayAbbr: 'CHI', spread: 1.5, overUnder: 45.5 })) as NormalizedNFLMatch;
check('mapping non-null', m2 !== null);
if (m2) {
  // GB DVOA 12.8, CHI -1.2 → engine marge = (12.8+1.2)*0.45+2.5 = 8.8 (trop optimiste GB)
  // blend: 0.65*(-1.5) + 0.35*8.8 = -0.975 + 3.08 = 2.105 → home encore favori au final
  check('total cohérent', Math.abs(m2.projected.homePoints + m2.projected.awayPoints - m2.projected.totalPoints) < 0.3);
  // marché voit GB +1.5 (underdog) mais engine penche GB → proba finale > marché implicite
  check('probEdge home > 0 (engine contredit le marché)', m2.insights.moneyline.valueBet.detected && m2.insights.moneyline.valueBet.type === 'home', `edge=${m2.insights.moneyline.valueBet.edge}`);
  check('valueBet edge en % (0-100)', m2.insights.moneyline.valueBet.edge > 0 && m2.insights.moneyline.valueBet.edge <= 50, `edge=${m2.insights.moneyline.valueBet.edge}`);
}

// ============ 3. Sans cotes (fail-soft engine seule) ============
section('3. Sans cotes ESPN — engine seule, signaux pass');

const m3 = mapESPNEventToNFLMatch(makeEvent({ includeOdds: false })) as NormalizedNFLMatch;
check('mapping non-null (équipes connues)', m3 !== null);
if (m3) {
  check('source dvoa-engine-only', m3.source === 'dvoa-engine-only');
  check('spread rec = pass (fail-closed)', m3.insights.spread.recommendation === 'pass');
  check('total rec = pass (fail-closed)', m3.insights.total.recommendation === 'pass');
  check('pas de value bet sans marché', !m3.insights.moneyline.valueBet.detected);
  check('dataQuality dégradée', m3.dataQuality.overallScore === 55);
}

// ============ 4. Fail-closed: events malformés ============
section('4. Events malformés → null, jamais d\'exception');

check('event undefined', mapESPNEventToNFLMatch(undefined as any) === null);
check('event null', mapESPNEventToNFLMatch(null as any) === null);
check('sans competitors', mapESPNEventToNFLMatch({ competitions: [{}] } as any) === null);
check('sans abbreviations', mapESPNEventToNFLMatch({
  competitions: [{ competitors: [{ homeAway: 'home', team: {} }, { homeAway: 'away', team: {} }] }],
} as any) === null);
check('competitions manquantes', mapESPNEventToNFLMatch({ id: 'x' } as any) === null);
check('odds avec NaN', mapESPNEventToNFLMatch({
  competitions: [{
    competitors: makeEvent({}).competitions[0].competitors,
    odds: [{ spread: NaN, overUnder: NaN }],
  }],
} as any) !== null, 'NaN → traité comme sans marché');

// ============ 5. Match terminé (post) ============
section('5. Match terminé — scores réels, signaux pass');

const m5t = mapESPNEventToNFLMatch(makeEvent({ spread: -9.5, overUnder: 48.5, state: 'post', homeScore: '31', awayScore: '14' }));
if (m5t) {
  check('scores réels dans projected', m5t.projected.homePoints === 31 && m5t.projected.awayPoints === 14, `${m5t.projected.homePoints}-${m5t.projected.awayPoints}`);
  check('total réel', m5t.projected.totalPoints === 45);
  check('spread réel', m5t.projected.spread === 17);
  check('status completed', m5t.status === 'completed' && !m5t.isLive);
  check('recommandations pass', m5t.insights.spread.recommendation === 'pass' && m5t.insights.total.recommendation === 'pass');
  check('pas de value bet post', !m5t.insights.moneyline.valueBet.detected);
  check('recommandation = Match terminé', m5t.insights.recommendation === 'Match terminé');
} else {
  check('mapping post non-null', false);
}

// ============ 6. Déterminisme ============
section('6. Déterminisme — zéro Math.random');

const a = mapESPNEventToNFLMatch(makeEvent({ spread: -3.5, overUnder: 45.5 }));
const b = mapESPNEventToNFLMatch(makeEvent({ spread: -3.5, overUnder: 45.5 }));
check('deux appels → JSON identique', JSON.stringify(a) === JSON.stringify(b));

// ============ 7. Alias WSH → WAS ============
section('7. Alias abbreviations ESPN');

const m7 = mapESPNEventToNFLMatch(makeEvent({ homeAbbr: 'WSH', awayAbbr: 'DAL', spread: -6.5, overUnder: 44.5 }));
check('WSH mappé vers WAS (stats connues)', m7 !== null && m7.homeTeam === 'Washington Commanders', m7?.homeTeam);
check('dataQuality real via alias', m7?.dataQuality.homeStats === 'real');

// ============ 8. Équipe inconnue → fallback honnête ============
section('8. Équipe absente de la table → dataQuality fallback');

const m8 = mapESPNEventToNFLMatch(makeEvent({ homeAbbr: 'XX', awayAbbr: 'DAL', spread: -3, overUnder: 44 }));
check('mapping conservé (marché réel dispo)', m8 !== null);
check('homeStats fallback', m8?.dataQuality.homeStats === 'fallback' && m8?.dataQuality.overallScore === 70);

// ============ 9. Live ESPN ============
section('9. getNFLMatches live (graceful skip si réseau indisponible)');

async function liveTest() {
  try {
    const { getNFLMatches } = await import('../src/lib/nflAdvancedScraper');
    const matches = await getNFLMatches();
    if (matches.length === 0) {
      console.log('⏭️  SKIP live: aucun match retourné (hors saison / réseau)');
      return;
    }
    check('live: > 0 matchs', matches.length > 0, `${matches.length}`);
    const bad = matches.filter(m => !m.projected || !m.insights || !Number.isFinite(m.projected.homePoints));
    check('live: 100% normalisés (projected + insights)', bad.length === 0, `${bad.length} incomplets`);
    const withMarket = matches.filter(m => m.source === 'espn-odds+dvoa-engine');
    console.log(`   ℹ️  ${withMarket.length}/${matches.length} avec cotes ESPN réelles`);
    const sample = matches[0];
    console.log(`   Exemple: ${sample.awayAbbr} @ ${sample.homeAbbr} — proj ${sample.projected.awayPoints}-${sample.projected.homePoints} (total ${sample.projected.totalPoints}, spread ${sample.projected.spread}) · prob ${Math.round(sample.projected.homeWinProb * 100)}% · conf ${sample.insights.confidence} · ${sample.source}`);
    const withRecords = matches.filter(m => m.homeRecord && m.awayRecord);
    console.log(`   ℹ️  ${withRecords.length}/${matches.length} avec bilans réels ESPN`);
  } catch (e: any) {
    console.log(`⏭️  SKIP live: ${e?.message ?? e}`);
  }
}

// ============ Rapport ============
(async () => {
  await liveTest();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RÉSULTAT: ${passed} passés, ${failed} échoués`);
  console.log('='.repeat(60));
  process.exit(failed > 0 ? 1 : 0);
})();
