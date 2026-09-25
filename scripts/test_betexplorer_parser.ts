/**
 * Test du parseur BetExplorer markup 2026 — sur la page réelle sauvegardée.
 * Usage: npx tsx scripts/test_betexplorer_parser.ts [chemin_html]
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseBetExplorerHTML } from '../src/lib/tennis-enhanced/smart-collector';

const htmlPath = process.argv[2] || path.join(__dirname, 'betexplorer_next_tennis.html');
const html = fs.readFileSync(htmlPath, 'utf-8');

const matches = parseBetExplorerHTML(html);

let failures = 0;
const check = (cond: boolean, label: string, detail?: string) => {
  console.log(`${cond ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
};

console.log(`\n=== TEST PARSEUR BETEXPLORER (markup 2026) ===\n`);

// 1. Volume
check(matches.length >= 50, `>= 50 singles collectés`, `${matches.length} matchs`);

// 2. Qualité des données
const badOdds = matches.filter((m) => !(m.odds1 >= 1.01 && m.odds1 <= 200) || !(m.odds2 >= 1.01 && m.odds2 <= 200));
check(badOdds.length === 0, `toutes les cotes valides`, badOdds.length ? JSON.stringify(badOdds[0]) : '');

const badNames = matches.filter((m) => !m.player1 || !m.player2 || m.player1.includes(' / ') || m.player2.includes(' / '));
check(badNames.length === 0, `tous les matchs sont des singles avec 2 joueurs`, `${badNames.length} invalides`);

const badDates = matches.filter((m) => {
  const ts = m.date.getTime();
  const now = Date.now();
  return ts < now - 11 * 60000 || ts > now + 5.1 * 86400e3 || Number.isNaN(ts);
});
check(badDates.length === 0, `toutes les dates dans la fenêtre [-10min ; +5j]`, `${badDates.length} hors fenêtre`);

// 3. Dates réelles (pas new Date() = maintenant) : variance attendue sur plusieurs jours
const days = new Set(matches.map((m) => m.date.toISOString().slice(0, 10)));
check(days.size >= 2, `dates réelles multi-jours (plus de fausses dates "maintenant")`, `jours: ${[...days].sort().join(', ')}`);

// 4. Catégories connues
const cats = new Set(matches.map((m) => m.category));
check([...cats].every((c) => ['atp', 'wta', 'challenger', 'itf'].includes(c)), `catégories valides`, [...cats].join(', '));

// 5. Tournois nommés (pas de « Tennis Match » générique)
check(matches.every((m) => m.tournament && m.tournament !== 'Tennis Match'), `tournois extraits du libellé`, [...new Set(matches.map((m) => m.tournament))].slice(0, 8).join(' | '));

// 6. IDs stables (be_xxxxx)
const stableIds = matches.filter((m) => m.id.startsWith('be_')).length;
check(stableIds >= matches.length * 0.9, `IDs stables depuis l'URL`, `${stableIds}/${matches.length}`);

// 7. Surfaces plausibles
const surfaces = new Set(matches.map((m) => m.surface));
check([...surfaces].every((s) => ['hard', 'clay', 'grass', 'indoor'].includes(s)), `surfaces valides`, [...surfaces].join(', '));

// 8. Pas de doublons d'ID
const ids = new Set(matches.map((m) => m.id));
check(ids.size === matches.length, `IDs uniques`, `${ids.size}/${matches.length}`);

// Aperçu
console.log(`\n--- Aperçu (10 premiers) ---`);
for (const m of matches.slice(0, 10)) {
  console.log(`${m.date.toISOString().slice(0, 16).replace('T', ' ')}Z  [${m.category}/${m.tournamentTier}] ${m.player1} vs ${m.player2}  @${m.odds1}/${m.odds2}  ${m.tournament} (${m.surface})`);
}
const byCat = matches.reduce<Record<string, number>>((a, m) => ({ ...a, [m.category]: (a[m.category] || 0) + 1 }), {});
console.log(`\nRépartition: ${JSON.stringify(byCat)}`);

console.log(`\n${failures === 0 ? '🎉 TOUS LES TESTS PASSENT' : `💥 ${failures} ÉCHEC(S)`}`);
process.exit(failures === 0 ? 0 : 1);
