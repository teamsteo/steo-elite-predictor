// Test d'intégration: replay TS des arbres XGBoost exportés (doit matcher le replay Python)
const fs = require('fs');

const dump = JSON.parse(fs.readFileSync('/tmp/test_dump.json', 'utf8'));

function evalXGBTree(node, features, featureNames) {
  if (node.v !== undefined) return node.v;
  const name = node.f !== undefined ? featureNames[node.f] : undefined;
  if (name === undefined) return 0;
  let v = features[name];
  if (v === undefined || v === null || Number.isNaN(v)) v = 0;
  const v32 = Math.fround(v);
  const t32 = Math.fround(node.t ?? 0);
  return v32 < t32
    ? evalXGBTree(node.y, features, featureNames)
    : evalXGBTree(node.n, features, featureNames);
}

function score(features) {
  let margin = dump.margin_offset || 0;
  for (const t of dump.trees) margin += evalXGBTree(t, features, dump.features);
  const p = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, margin))));
  return { margin, p };
}

// 3 profils de matchs (features de la liste blanche)
const rows = [
  { prob_home: 0.546448087431694, prob_away: 0.2439, prob_draw: 0.2667, odds_ratio: 2.2404, log_odds_ratio: 0.8067, is_home_favorite: 1, favorite_strength: 0.3025, draw_signal: 0.2667, underdog_match: 1, confidence_numeric: 0.5, odds_confidence: 0.2732, favorite_confidence: 0.1513, is_football: 1 },
  { prob_home: 0.6, prob_away: 0.25, prob_draw: 0.3, odds_ratio: 2.4, log_odds_ratio: 0.875, is_home_favorite: 1, favorite_strength: 0.35, draw_signal: 0.3, confidence_numeric: 0.75, odds_confidence: 0.45, favorite_confidence: 0.26, is_football: 1 },
  { prob_home: 0.35, prob_away: 0.5, prob_draw: 0.28, odds_ratio: 0.7, log_odds_ratio: -0.357, is_home_favorite: 0, favorite_strength: 0.15, draw_signal: 0.28, confidence_numeric: 0.5, odds_confidence: 0.175, favorite_confidence: 0.075, is_football: 1 },
];

console.log('Features du dump:', dump.features.join(', '));
console.log('margin_offset:', dump.margin_offset);
for (const r of rows) {
  const { margin, p } = score(r);
  console.log(`\nrow: ${JSON.stringify(r).slice(0, 90)}...`);
  console.log(`  margin=${margin.toFixed(6)}  P(home win)=${(p * 100).toFixed(2)}%`);
}
console.log('\n✅ Replay TS exécuté sans erreur — comparer les marges au replay Python');
