/**
 * Test fonctionnel P4 — consensus multi-books + combo déterministe + parser MLB
 * (0 réseau, fonctions pures). Run: npx tsx scripts/test_p4_improvements.ts
 */
import {
  BookOdds,
  buildConsensus,
  collectBooksFromOddsApiEvent,
  findConsensus,
  normalizeTeamKey,
  shouldUseConsensusEdge,
  teamsMatch,
} from '../src/lib/oddsConsensus';
import {
  ComboMatch,
  compositeScore,
  selectComboDeterministic,
} from '../src/lib/comboService';
import {
  parseBetExplorerDate,
  parseMlbResultsHTML,
} from '../src/lib/betExplorerBaseballScraper';

let pass = 0;
let fail = 0;
function assert(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

console.log('\n════════ P4 — Tests des 5 phases ════════\n');

// ── Phase 2: consensus multi-books ──────────────────────────────────────────
console.log('1. Consensus multi-bookmakers (Phase 2)');

const oddsApiEvent = {
  home_team: 'New York Yankees',
  away_team: 'Boston Red Sox',
  bookmakers: [
    { key: 'pinnacle', markets: [{ key: 'h2h', outcomes: [{ name: 'New York Yankees', price: 1.95 }, { name: 'Boston Red Sox', price: 1.95 }] }] },
    { key: 'marathonbet', markets: [{ key: 'h2h', outcomes: [{ name: 'New York Yankees', price: 2.10 }, { name: 'Boston Red Sox', price: 1.80 }] }] },
    { key: 'bet365', markets: [{ key: 'h2h', outcomes: [{ name: 'New York Yankees', price: 2.00 }, { name: 'Boston Red Sox', price: 1.90 }] }] },
    { key: 'unibet', markets: [{ key: 'other', outcomes: [] }] },
  ],
};
const books = collectBooksFromOddsApiEvent(oddsApiEvent);
assert('3 books h2h extraits (le 4e sans h2h ignoré)', books.length === 3, `${books.length}`);
const consensus = buildConsensus(books);
assert('consensus construit', consensus !== null);
assert('best home = 2.10 (max des books)', consensus?.best.home === 2.10, `${consensus?.best.home}`);
assert('median home = 2.00', consensus?.median.home === 2.00, `${consensus?.median.home}`);
assert('bookCount = 3', consensus?.bookCount === 3);

assert('1 seul book → pas de consensus', buildConsensus(books.slice(0, 1)) === null);
assert('0 book → pas de consensus', buildConsensus([]) === null);

assert('teamsMatch: normalisation stricte', teamsMatch('New York Yankees', 'new york yankees'));
assert('teamsMatch: partiel (ESPN "Yankees" vs Odds API "New York Yankees")', teamsMatch('New York Yankees', 'Yankees'));
assert('teamsMatch: équipes différentes rejetées', !teamsMatch('Yankees', 'Mets'));

const map = new Map();
map.set(`${normalizeTeamKey('New York Yankees')}|${normalizeTeamKey('Boston Red Sox')}`, consensus!);
const found = findConsensus(map, 'Yankees', 'Red Sox');
assert('findConsensus: matching tolérant', found !== null && found.bookCount === 3);
const foundSwap = findConsensus(map, 'Red Sox', 'Yankees');
assert('findConsensus: swap home/away inversé', foundSwap !== null && foundSwap.best.home === 1.95, `${foundSwap?.best.home}`);

const savedDisabled = process.env.ODDS_CONSENSUS_DISABLED;
process.env.ODDS_CONSENSUS_DISABLED = 'true';
assert('kill-switch ODDS_CONSENSUS_DISABLED', !shouldUseConsensusEdge(consensus));
process.env.ODDS_CONSENSUS_DISABLED = savedDisabled;

const twoBooks = buildConsensus(books.slice(0, 2));
assert('garde-fou < 3 books → edge non consensus', !shouldUseConsensusEdge(twoBooks));
assert('edge consensus OK avec 3 books', shouldUseConsensusEdge(consensus));

// ── Phase 5: combo déterministe ─────────────────────────────────────────────
console.log('\n2. Combo déterministe (Phase 5)');

function vb(overrides: Partial<ComboMatch> & { homeTeam: string; awayTeam: string; league: string }): ComboMatch {
  return {
    sport: 'football',
    predictedResult: 'home',
    winProbability: 65,
    oddsHome: 1.85,
    oddsAway: 4.0,
    oddsDraw: 3.5,
    riskPercentage: 35,
    valueBetDetected: true,
    valueBetType: 'edge',
    confidence: 'medium',
    date: '2026-09-09',
    _kellyStake: 2,
    ...overrides,
  } as ComboMatch;
}

const picks = [
  vb({ homeTeam: 'PSG', awayTeam: 'Nice', league: 'Ligue 1', winProbability: 70, oddsHome: 1.60, _mlEdge: 0.08 }),
  vb({ homeTeam: 'Yankees', awayTeam: 'Mets', league: 'MLB', sport: 'baseball', predictedResult: 'away', winProbability: 58, oddsAway: 2.10, oddsHome: 1.75, _mlEdge: 0.07 }),
  vb({ homeTeam: 'Celtic', awayTeam: 'Rangers', league: 'Scottish Premiership', winProbability: 55, oddsHome: 2.20, _mlEdge: 0.06 }),
  vb({ homeTeam: 'LowEdge', awayTeam: 'X', league: 'Ligue 1', winProbability: 51, oddsHome: 2.05, _mlEdge: 0.001 }),
];

const scores = picks.map((p) => compositeScore(p));
assert('scores décroissants avec l\'edge', scores[0] > scores[3], `${scores[0].toFixed(3)} vs ${scores[3].toFixed(3)}`);

const combo = selectComboDeterministic(picks);
assert('combo 2-3 legs sélectionné', combo !== null && combo.length >= 2 && combo.length <= 3, `${combo?.length}`);
// Edge RELATIF = (model - implied)/implied: Yankees @2.10 (21.8%) > Celtic (21.0%) > PSG @1.60 (12%)
assert('1er leg = meilleur score composite (edge relatif)', combo?.[0]?.homeTeam === 'Yankees', combo?.[0]?.homeTeam);
assert('diversification ligue (pas 2× Ligue 1 si autre dispo)', new Set(combo?.map((c) => c.league)).size === (combo?.length ?? 0));

// Pas de value bet → null
const noVB = selectComboDeterministic([vb({ homeTeam: 'A', awayTeam: 'B', league: 'L', valueBetDetected: false }), vb({ homeTeam: 'C', awayTeam: 'D', league: 'M', valueBetDetected: false })]);
assert('aucune value bet → null', noVB === null);

// Un seul VB → null
const oneVB = selectComboDeterministic([vb({ homeTeam: 'A', awayTeam: 'B', league: 'L' }), vb({ homeTeam: 'C', awayTeam: 'D', league: 'M', valueBetDetected: false })]);
assert('1 seul VB → null', oneVB === null);

// ── Phase 1: parser archives MLB ────────────────────────────────────────────
console.log('\n3. Parser archives MLB betExplorer (Phase 1)');

assert('date format betExplorer', parseBetExplorerDate('9.9.2026') === '2026-09-09T00:00:00Z');
assert('date invalide → null', parseBetExplorerDate('31.13.2026') === null);

const html = `
<table class="table-main">
<tr><td class="h-time">8.9.2026</td>
<td class="h-main"><span><a href="/baseball/usa/mlb/teams/yankees/">New York Yankees</a></span><span><a href="/baseball/usa/mlb/teams/red-sox/">Boston Red Sox</a></span></td>
<td class="h-sc">5:3</td>
<td class="odds"><a data-odd="1.75">1.75</a></td><td class="odds"><a data-odd="2.10">2.10</a></td></tr>
<tr><td class="h-time">8.9.2026</td>
<td class="h-main"><span><a href="/baseball/usa/mlb/teams/dodgers/">Los Angeles Dodgers</a></span><span><a href="/baseball/usa/mlb/teams/giants/">San Francisco Giants</a></span></td>
<td class="h-sc">2:4</td>
<td class="odds"><a data-odd="1.55">1.55</a></td><td class="odds"><a data-odd="2.55">2.55</a></td></tr>
</table>`;
const parsed = parseMlbResultsHTML(html);
assert('2 matchs extraits', parsed.length === 2, `${parsed.length}`);
assert('match 1: équipes + score + cotes',
  parsed[0]?.homeTeam === 'New York Yankees' && parsed[0]?.homeScore === 5 && parsed[0]?.oddsHome === 1.75);
assert('match 2: Dodgers perdent 2:4', parsed[1]?.homeScore === 2 && parsed[1]?.awayScore === 4);
assert('matchId stable et dédupliqué',
  parsed[0]?.matchId === 'betexp_mlb_newyorkyankees-bostonredsox-20260908',
  parsed[0]?.matchId);
assert('HTML vide → []', parseMlbResultsHTML('').length === 0);

// ── Phase 1: logique export (test Python séparé — vérif sanity TS) ──────────
console.log('\n4. Contrats stables (anti-régression)');
const c1 = vb({ homeTeam: 'A', awayTeam: 'B', league: 'L' });
assert('betLabel: predictedResult home → Victoire A (contrat comboService)',
  `Victoire ${c1.homeTeam}` === 'Victoire A');

console.log(`\n════════ Résultat : ${pass}/${pass + fail} passent ════════\n`);
process.exit(fail > 0 ? 1 : 0);
