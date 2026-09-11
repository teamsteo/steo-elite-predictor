/**
 * Test fonctionnel — Générateur de Combinés Sûrs (Task 16)
 * Moteur extrait : src/lib/safeComboGenerator.ts
 * Corrections testées : alignement sur la prédiction ML, fallback favori,
 * tolérance, dédup, max 5, tri transitive. 0 réseau, 0 DB.
 * Run: npx tsx scripts/test_safe_combo.ts
 */
import { findBestCombinations } from '../src/lib/safeComboGenerator';

let pass = 0;
let fail = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

let idSeq = 0;
function mk(over: any = {}): any {
  idSeq++;
  return {
    id: `m${idSeq}`,
    homeTeam: `Home${idSeq}`,
    awayTeam: `Away${idSeq}`,
    sport: 'Football',
    league: 'Test League',
    date: '2026-09-12T15:00:00Z',
    oddsHome: 1.80, oddsDraw: 3.50, oddsAway: 4.50,
    ...over,
  };
}

// ═══ 1. Alignement sur la prédiction ML (le cœur du fix) ═══
{
  const matches = [
    mk({ predictedResult: 'home', oddsHome: 1.50, oddsDraw: 4.00, oddsAway: 6.00 }),
    mk({ predictedResult: 'away', oddsHome: 3.00, oddsDraw: 3.30, oddsAway: 2.00 }),
  ];
  const combos = findBestCombinations(matches, 3.0); // 1.50 × 2.00 = 3.00
  assert('combo trouvé pour cote cible 3.0', combos.length >= 1);
  const combo = combos[0];
  const bets = combo.picks.map(p => p.betType).sort();
  assert('picks = prédictions du modèle (home + away)',
    JSON.stringify(bets) === JSON.stringify(['away', 'home']),
    `reçu: ${JSON.stringify(bets)}`);
  assert('cote combinée 3.00', Math.abs(combo.combinedOdds - 3.0) < 0.01,
    `reçu: ${combo.combinedOdds}`);
}

// ═══ 2. Ancien bug interdit : pick opposé à la prédiction ═══
{
  const matches = [
    // Le modèle prédit HOME — l'ancien code aurait pu prendre away (5.00)
    mk({ predictedResult: 'home', oddsHome: 1.60, oddsDraw: 3.80, oddsAway: 5.00 }),
    mk({ predictedResult: 'home', oddsHome: 1.55, oddsDraw: 3.70, oddsAway: 5.20 }),
  ];
  const combos = findBestCombinations(matches, 8.0); // 5.00×1.60≈8 aurait matché
  const bad = combos.flatMap(c => c.picks).filter(p => p.betType === 'away' || p.betType === 'draw');
  assert('aucun pick away/draw quand le modèle prédit home', bad.length === 0,
    `${bad.length} pick(s) hors prédiction`);
}

// ═══ 3. Fallback favori sans prédiction ═══
{
  const matches = [
    mk({ oddsHome: 1.40, oddsDraw: 4.20, oddsAway: 7.50 }), // pas de predictedResult
    mk({ predictedResult: 'home', oddsHome: 2.10, oddsDraw: 3.20, oddsAway: 3.40 }),
  ];
  const combos = findBestCombinations(matches, 2.9); // 1.40 × 2.10 = 2.94
  assert('combo via fallback favori trouvé', combos.length >= 1);
  const noPredPick = combos[0].picks.find(p => p.match.oddsHome === 1.40);
  assert('sans prédiction → favori (home 1.40)', noPredPick?.betType === 'home',
    `reçu: ${noPredPick?.betType}`);
}

// ═══ 4. Tennis : predictedWinner mappé ═══
{
  const matches = [
    mk({ sport: 'Tennis', oddsDraw: null, predictedWinner: 'away', oddsHome: 2.20, oddsAway: 1.65 }),
    mk({ predictedResult: 'home', oddsHome: 1.80, oddsDraw: 3.50, oddsAway: 4.50 }),
  ];
  const combos = findBestCombinations(matches, 3.0); // 1.65 × 1.80 = 2.97
  assert('combo tennis trouvé', combos.length >= 1);
  const tennisPick = combos[0].picks.find(p => p.match.sport === 'Tennis');
  assert('tennis : predictedWinner away respecté', tennisPick?.betType === 'away',
    `reçu: ${tennisPick?.betType}`);
}

// ═══ 5. Tolérance ±20% ═══
{
  const matches = [
    mk({ predictedResult: 'home', oddsHome: 1.50, oddsDraw: 4.00, oddsAway: 6.00 }),
    mk({ predictedResult: 'away', oddsHome: 3.00, oddsDraw: 3.30, oddsAway: 2.00 }),
  ];
  const inside = findBestCombinations(matches, 3.2); // 3.00 → écart 6.7% OK
  const outside = findBestCombinations(matches, 4.2); // 3.00 → écart 40% KO
  assert('cote 3.2 (écart 6.7%) → combo trouvé', inside.length >= 1);
  assert('cote 4.2 (écart 40%) → aucun combo', outside.length === 0);
}

// ═══ 6. Dédup + max 5 + ensembles de matchs uniques ═══
{
  const matches: any[] = [];
  for (let i = 0; i < 12; i++) {
    matches.push(mk({ predictedResult: 'home', oddsHome: 1.30 + i * 0.02, oddsDraw: 4.5, oddsAway: 7.0 }));
  }
  const combos = findBestCombinations(matches, 2.0);
  assert('max 5 combinaisons retournées', combos.length <= 5, `reçu: ${combos.length}`);
  const sets = combos.map(c => c.picks.map(p => p.match.id).sort().join('-'));
  assert('tous les ensembles de matchs sont uniques', new Set(sets).size === sets.length);
  const ids = new Set(combos.flatMap(c => c.picks.map(p => p.match.id)));
  assert('chaque match n\'apparaît que dans un seul ensemble par combo', ids.size >= combos.flatMap(c => c.picks).length / combos.length);
}

// ═══ 7. Un match ne peut pas être combiné avec lui-même ═══
{
  const matches = [
    mk({ predictedResult: 'home', oddsHome: 1.90, oddsDraw: 3.40, oddsAway: 4.00 }),
  ];
  const combos = findBestCombinations(matches, 3.6); // 1.90²=3.61 (même match) doit être exclu
  assert('même match deux fois → interdit', combos.length === 0);
}

// ═══ 8. Prédiction draw sans cote de nul → match ignoré ═══
{
  const matches = [
    mk({ predictedResult: 'draw', oddsDraw: null }),
    mk({ predictedResult: 'home', oddsHome: 1.80, oddsDraw: 3.50, oddsAway: 4.50 }),
  ];
  const combos = findBestCombinations(matches, 1.8);
  const withMissingDraw = combos.some(c => c.picks.some(p => p.match.oddsDraw === null));
  assert('prédiction draw sans cote → exclu des combos', !withMissingDraw);
}

// ═══ 9. Tri : rankScore décroissant (transitif) ═══
{
  const matches: any[] = [];
  for (let i = 0; i < 8; i++) {
    matches.push(mk({ predictedResult: 'home', oddsHome: 1.25 + i * 0.03, oddsDraw: 4.5, oddsAway: 7.5 }));
  }
  const combos = findBestCombinations(matches, 2.0);
  const scores = combos.map(c => c.rankScore ?? 0);
  const sorted = [...scores].sort((a, b) => b - a);
  assert('tri rankScore décroissant', JSON.stringify(scores) === JSON.stringify(sorted),
    `${scores.map(s => s.toFixed(3))}`);
}

console.log('════════════════════════════════');
console.log(`Résultat: ${pass} passés, ${fail} échoués`);
process.exit(fail > 0 ? 1 : 0);
