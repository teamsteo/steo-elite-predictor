/**
 * Test Task 43 — fixes honnêteté cotes + CLV branché + quota Infinity
 * Run: npx tsx scripts/test_task43_odds_honesty.ts
 */
import {
  clvPctForPick,
  summarizeClv,
  devigForSide,
  type ClvStats,
} from '../src/lib/sportMetricsService';

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ─────────────────────────────────────────────
// 1. clvPctForPick
// ─────────────────────────────────────────────
console.log('\n1️⃣  clvPctForPick (Task 43)');
assert('cote baisse 2.50 → 2.00 → CLV +20%', clvPctForPick(2.5, 2.0) === 20, `got ${clvPctForPick(2.5, 2.0)}`);
assert('cote monte 2.00 → 2.50 → CLV -25%', clvPctForPick(2.0, 2.5) === -25, `got ${clvPctForPick(2.0, 2.5)}`);
assert('cote stable → CLV 0%', clvPctForPick(2.0, 2.0) === 0, `got ${clvPctForPick(2.0, 2.0)}`);
assert('cote 1.01 → 0.90 invalide → null', clvPctForPick(1.01, 0.9) === null);
assert('cote 0 → null', clvPctForPick(0, 2.0) === null);
assert('précision 2 décimales', clvPctForPick(2.35, 2.30) === 2.13, `got ${clvPctForPick(2.35, 2.3)}`);

// ─────────────────────────────────────────────
// 2. summarizeClv
// ─────────────────────────────────────────────
console.log('\n2️⃣  summarizeClv');
const empty = summarizeClv([]);
assert('vide → available=false', empty.available === false);
assert('vide → samples=0', empty.samples === 0);

const s1: ClvStats = summarizeClv([20, -5, 10, 0]);
assert('4 valeurs → available=true', s1.available === true);
assert('samples=4', s1.samples === 4);
assert('avg=(20-5+10+0)/4=+6.25%', s1.avgClvPct === 6.25, `got ${s1.avgClvPct}`);
assert('positifs: 2/4=50%', s1.positivePct === 50, `got ${s1.positivePct}`);

// CLV de 0 compte comme non-positif (strictement >0 = beat the close)
const s2 = summarizeClv([0, 0]);
assert('deux zéros → positivePct=0%', s2.positivePct === 0, `got ${s2.positivePct}`);
assert('deux zéros → avg=0', s2.avgClvPct === 0);

// ─────────────────────────────────────────────
// 3. devigForSide (régression — baseline marché)
// ─────────────────────────────────────────────
console.log('\n3️⃣  devigForSide (régression)');
const d = devigForSide(2.0, 2.0);
assert('cotes égales → devig 0.5', Math.abs(d - 0.5) < 1e-9);
assert('cote invalide → 0', devigForSide(1.0, 2.0) === 0);

// ─────────────────────────────────────────────
// 4. Propagation isEstimated (vérif statique du code modifié)
// ─────────────────────────────────────────────
console.log('\n4️⃣  Propagation isEstimated (grep statique)');
import * as fs from 'fs';

const checkFile = (path: string, needle: string) =>
  fs.existsSync(path) && fs.readFileSync(path, 'utf8').includes(needle);

assert('unifiedPredictionService: hasRealOdds &&= !isEstimated',
  checkFile('src/lib/unifiedPredictionService.ts',
    'let hasRealOdds = match.oddsHome > 0 && match.oddsAway > 0 && match.isEstimated !== true;'));

const callers = [
  ['src/app/api/matches/route.ts', 'isEstimated: m.isEstimated === true'],
  ['src/app/api/cron/route.ts', 'isEstimated: m.isEstimated === true'],
  ['src/app/api/telegram/publish-now/route.ts', 'isEstimated: m.isEstimated === true'],
  ['src/app/api/combo-private/route.ts', 'isEstimated: m.isEstimated === true'],
  ['src/app/api/pronostiqueur-pro/route.ts', 'isEstimated: m.isEstimated === true || m.oddsHome == null'],
  ['src/app/api/challenges/route.ts', 'isEstimated: (match as any).isEstimated === true'],
  ['src/lib/dailyPredictionService.ts', 'isEstimated: !home.odds?.current'],
];
for (const [f, needle] of callers) {
  assert(`${f} passe le flag`, checkFile(f, needle));
}

// dailyPredictionService doit avoir 3 occurrences (foot/nba/nhl)
const dps = fs.readFileSync('src/lib/dailyPredictionService.ts', 'utf8');
const occurrences = (dps.match(/isEstimated: !home\.odds\?\.current/g) || []).length;
assert('dailyPredictionService: 3 blocs propagés (foot+nba+nhl)', occurrences === 3, `got ${occurrences}`);

// ─────────────────────────────────────────────
// 5. Track-odds branché + cron + quota
// ─────────────────────────────────────────────
console.log('\n5️⃣  Branchement track-odds + cron + quota Infinity');
assert("cron: action track-odds existe", checkFile('src/app/api/cron/route.ts', "case 'track-odds'"));
const vercel = fs.readFileSync('vercel.json', 'utf8');
const trackOddsCrons = (vercel.match(/track-odds/g) || []).length;
assert('vercel.json: 3 crons track-odds', trackOddsCrons === 3, `got ${trackOddsCrons}`);
assert('real-odds: plus de valeur Infinity en code', !/:\s*Infinity|= Infinity|\(Infinity\)/.test(fs.readFileSync('src/app/api/real-odds/route.ts', 'utf8').replace(/\/\/.*$/gm, '')));
assert('real-odds: flag unlimited présent', checkFile('src/app/api/real-odds/route.ts', 'unlimited: true'));
assert('sportMetricsService: summarizeClv branché', checkFile('src/lib/sportMetricsService.ts', 'clv: summarizeClv(clvValues)'));

// ─────────────────────────────────────────────
// 6. Code mort supprimé
// ─────────────────────────────────────────────
console.log('\n6️⃣  Code mort supprimé');
assert('MainApp.tsx supprimé', !fs.existsSync('src/components/MainApp.tsx'));
assert('football-analyzer.ts supprimé', !fs.existsSync('src/lib/football-analyzer.ts'));
assert('footballAdvancedModel.ts supprimé', !fs.existsSync('src/lib/footballAdvancedModel.ts'));

console.log(`\n════════════════════════════════`);
console.log(`RÉSULTAT: ${passed} passés, ${failed} échoués`);
process.exit(failed > 0 ? 1 : 0);
