/**
 * Test du diagnostic funnel BADJAN (Task 16) — 0 réseau, 0 DB
 * Run: npx tsx scripts/test_badjan_funnel_pure.ts
 */
import { analyzeBadjanFunnel, BadjanMatchInput, filterBadjanMatches } from '../src/lib/badjanService';

let pass = 0;
let fail = 0;
function assert(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

const ideal: BadjanMatchInput = {
  homeTeam: 'PSG', awayTeam: 'Le Havre', sport: 'Football',
  predictedResult: 'home', riskPercentage: 30,
  oddsHome: 1.45, oddsAway: 5.5, oddsDraw: 4.2, isEstimated: false,
};

// 1. Funnel avec 1 match idéal
let f = analyzeBadjanFunnel([ideal]);
assert('funnel idéal : realOdds=1', f.realOdds === 1 && !f.reason, JSON.stringify(f));
assert('funnel idéal : picks == filter realOdds', filterBadjanMatches([ideal]).length === f.realOdds);

// 2. Funnel vide total
f = analyzeBadjanFunnel([]);
assert('pipeline vide → reason pipeline', f.total === 0 && !!f.reason?.includes('Pipeline 0 match'));

// 3. Aucun foot
f = analyzeBadjanFunnel([{ ...ideal, sport: 'Basketball', homeTeam: 'LAL', awayTeam: 'BOS' }]);
assert('0 foot → reason foot', f.foot === 0 && !!f.reason?.includes('football'));

// 4. Risque trop élevé
f = analyzeBadjanFunnel([{ ...ideal, riskPercentage: 60 }]);
assert('risque >45 → reason risque', f.riskOk === 0 && !!f.reason?.includes('45'));

// 5. Pas de prédiction domicile
f = analyzeBadjanFunnel([{ ...ideal, predictedResult: 'away' }]);
assert('prédiction away → reason domicile', f.predictedHome === 0 && !!f.reason?.includes('domicile'));

// 6. Marché ne confirme pas (away plus bas)
f = analyzeBadjanFunnel([{ ...ideal, oddsHome: 2.1, oddsAway: 1.8 }]);
assert('marché défavorable → reason marché', f.marketConfirmed === 0 && !!f.reason?.includes('Marché'));

// 7. Cotes estimées uniquement
f = analyzeBadjanFunnel([{ ...ideal, isEstimated: true }]);
assert('cotes estimées → reason Odds API', f.realOdds === 0 && !!f.reason?.includes('estimées'));

// 8. Cohérence funnel == filtre réel sur mélange
const mix: BadjanMatchInput[] = [
  ideal,
  { ...ideal, homeTeam: 'Marseille', awayTeam: 'PSG', riskPercentage: 55 },
  { ...ideal, homeTeam: 'Lyon', awayTeam: 'Nice', predictedResult: 'draw' },
  { ...ideal, homeTeam: 'Lille', awayTeam: 'Rennes', isEstimated: true },
  { ...ideal, homeTeam: 'Monaco', awayTeam: 'Nantes', sport: 'Soccer', riskPercentage: 42 },
];
f = analyzeBadjanFunnel(mix);
assert('mix : funnel == filtre réel', f.realOdds === filterBadjanMatches(mix).length, `funnel=${f.realOdds} filter=${filterBadjanMatches(mix).length}`);
assert('mix : 2 picks attendus (PSG + Monaco)', f.realOdds === 2, `realOdds=${f.realOdds}`);

console.log(`\n═══ RÉSULTAT: ${pass} passés / ${fail} échoués ═══`);
process.exit(fail > 0 ? 1 : 0);
