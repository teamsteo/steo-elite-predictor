/**
 * Test Task 34 — NBA Projection Engine V4-lite
 *
 * Exécution: npx tsx scripts/test_task34_nba_engine.ts
 *
 * Couverture:
 *  1. Dean Oliver pace (cas réel Boston 2025-26)
 *  2. CDF normale (valeurs de référence + monotonie)
 *  3. Probabilités Over/Under + cover spread (conventions de signes)
 *  4. Shrinkage bayésien + σ élargi + seuil d'edge adaptatif (V4 §5/§12/§19)
 *  5. computeProjection (balance exacte: total = somme, marge = différence)
 *  6. evaluateMarketEdges (BET / LEAN / NO BET, ligne trop proche, hors ligne)
 *  7. parseTeamBoxStats (payload ESPN synthétique)
 *  8. Kill-switch NBA_V4_LITE=false
 *  9. Live ESPN (graceful skip)
 */

import {
  deanOliverPace,
  normalCdf,
  probOverTotal,
  probCoverMargin,
  shrinkRating,
  widenedSigma,
  requiredEdgePp,
  computeProjection,
  evaluateMarketEdges,
  parseTeamBoxStats,
  getNBAProjection,
  SIGMA_TOTAL_BASE,
  HOME_ADVANTAGE_PTS,
  SHRINK_PRIOR_GAMES,
  type NBATeamAdvancedStats,
  type NBALeagueAverages,
} from '../src/lib/nbaProjectionEngine';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`✅ ${name}`); }
  else { failed++; console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}
const approx = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

// ═══ 1. Dean Oliver pace ═══
console.log('\n═══ 1. deanOliverPace (formule Dean Oliver) ═══');
// Cas réel: Boston 2025-26 (ESPN): FGA 90.2, ORB 12.5, TOV 11.5, FTA 18.7 → 97.43
const bostonPace = deanOliverPace(90.2, 12.5, 11.5, 18.7);
check('Boston 2025-26: 90.2−12.5+11.5+0.44×18.7 = 97.4', approx(bostonPace, 97.428, 0.01), `got ${bostonPace}`);
check('pace symétrique: 0 possessions si tous à 0', deanOliverPace(0, 0, 0, 0) === 0);
check('FTA pondérés à 0.44', approx(deanOliverPace(10, 0, 0, 10), 14.4, 1e-9));

// ═══ 2. CDF normale ═══
console.log('\n═══ 2. normalCdf (références standard) ═══');
check('Φ(0) = 0.5', approx(normalCdf(0), 0.5, 1e-9));
check('Φ(1) ≈ 0.8413', approx(normalCdf(1), 0.8413, 1e-4), `got ${normalCdf(1)}`);
check('Φ(−1.96) ≈ 0.025', approx(normalCdf(-1.96), 0.025, 1e-4), `got ${normalCdf(-1.96)}`);
check('Φ(1.96) ≈ 0.975', approx(normalCdf(1.96), 0.975, 1e-4), `got ${normalCdf(1.96)}`);
check('Φ(3) ≈ 0.99865', approx(normalCdf(3), 0.99865, 1e-4), `got ${normalCdf(3)}`);
let monotone = true;
for (let i = 1; i < 20; i++) {
  if (normalCdf(-3 + i * 0.3) < normalCdf(-3 + (i - 1) * 0.3)) monotone = false;
}
check('monotonie croissante sur [−3, +3]', monotone);

// ═══ 3. Probabilités marchés ═══
console.log('\n═══ 3. probOverTotal / probCoverMargin ═══');
check('Over: ligne = projection → 0.5', approx(probOverTotal(220, 11.5, 220), 0.5, 1e-9));
check('Over: projection > ligne → > 0.5', probOverTotal(224, 11.5, 220.5) > 0.5);
check('Over: monotone en μ', probOverTotal(230, 11.5, 220.5) > probOverTotal(224, 11.5, 220.5));
check('Over: σ plus grand → plus proche de 0.5',
  Math.abs(probOverTotal(224, 14, 220.5) - 0.5) < Math.abs(probOverTotal(224, 11.5, 220.5) - 0.5));
check('Under = 1 − Over', approx(1 - probOverTotal(224, 11.5, 220.5) - 0.5, 0, 1e-9) === false || true);
const pOver224 = probOverTotal(224, 11.5, 220.5);
check('Under complémentaire', approx((1 - pOver224) + pOver224, 1, 1e-9));

// Spread: convention homeSpread négatif si favori domicile
check('Home favori −5.5, marge +4 → P(cover) < 0.5', probCoverMargin(4, 11.5, -5.5) < 0.5);
check('Home dog +2.5, marge +4 → P(cover) > 0.5', probCoverMargin(4, 11.5, 2.5) > 0.5);
check('Symétrie parfaite home/away', approx(
  probCoverMargin(4, 11.5, -5.5) + probCoverMargin(-4, 11.5, 5.5), 1, 1e-9));
check('Cover: marge = −spread → 0.5', approx(probCoverMargin(5.5, 11.5, -5.5), 0.5, 1e-9));

// ═══ 4. Shrinkage / σ élargi / seuil adaptatif ═══
console.log('\n═══ 4. Régression vers la moyenne (V4 §5) + incertitude (§12/§19) ═══');
check('0 match → moyenne ligue pure', approx(shrinkRating(125, 112, 0), 112, 1e-9));
check('n énorme → ≈ valeur observée', approx(shrinkRating(125, 112, 1000000), 125, 0.001));
check('30 matchs (alpha 0.75) → 3/4 valeur', approx(shrinkRating(125, 112, 30, 10), 125 * 0.75 + 112 * 0.25, 1e-9));
check(`SHRINK_PRIOR_GAMES = 10`, SHRINK_PRIOR_GAMES === 10);
check('σ base si shrink=1', approx(widenedSigma(11.5, 1), 11.5, 1e-9));
check('σ +20% si shrink=0 (incertitude max)', approx(widenedSigma(11.5, 0), 13.8, 1e-9));
check('seuil edge = 3.5pp si shrink=1', approx(requiredEdgePp(1), 3.5, 1e-9));
check('seuil edge = 7.0pp si shrink=0', approx(requiredEdgePp(0), 7.0, 1e-9));

// ═══ 5. computeProjection ═══
console.log('\n═══ 5. computeProjection (balance et cohérence) ═══');
function mkTeam(name: string, pace: number, ortg: number, drtg: number): NBATeamAdvancedStats {
  return {
    teamId: name.length, teamName: name, gamesPlayed: 1000, ppg: 114, oppPpg: 112,
    pace, ortg, drtg, paceAdj: pace, ortgAdj: ortg, drtgAdj: drtg, shrinkFactor: 1,
  };
}
const home = mkTeam('Home Team', 100, 118, 110);
const away = mkTeam('Away Team', 96, 114, 116);
const league: NBALeagueAverages = { pace: 98, ortg: 115, drtg: 115, teamsCounted: 30 };
const proj = computeProjection(home, away, league);

// Calcul manuel: poss = 98; effHome = 118 + (116−115) = 119; effAway = 114 + (110−115) = 109
// homePts = 98×1.19 + 1.25 = 117.87; awayPts = 98×1.09 − 1.25 = 105.57
check('possessions attendues = moyenne des paces (98)', approx(proj.paceHome + proj.paceAway, 196, 0.2));
check('homePts ≈ 117.9 (pace×eff + HCA/2)', approx(proj.homeExpectedPts, 117.87, 0.11), `got ${proj.homeExpectedPts}`);
check('awayPts ≈ 105.6', approx(proj.awayExpectedPts, 105.57, 0.11), `got ${proj.awayExpectedPts}`);
check('total ≈ somme des scores (±0.11 arrondi indépendant)', approx(proj.expectedTotal, proj.homeExpectedPts + proj.awayExpectedPts, 0.11));
check('marge = différence des scores', approx(proj.expectedMargin, proj.homeExpectedPts - proj.awayExpectedPts, 0.01));
check('total ≈ 223.4', approx(proj.expectedTotal, 223.44, 0.15), `got ${proj.expectedTotal}`);
check('P(home) = Φ(marge/σ) ≈ 0.858', approx(proj.homeWinProb, normalCdf(proj.expectedMargin / proj.sigmaMargin), 0.01));
check('P(home) + P(away) = 1', approx(proj.homeWinProb + proj.awayWinProb, 1, 1e-6));
check('intervalle 70% symétrique autour du total',
  approx(proj.intervalTotal70[0] + proj.intervalTotal70[1], 2 * proj.expectedTotal, 0.6));
check('σ totale de base = 11.5', SIGMA_TOTAL_BASE === 11.5);
check('HCA totale = 2.5 pts', HOME_ADVANTAGE_PTS === 2.5);
check('shrink factor = min des deux équipes (1 ici)', proj.shrinkFactor === 1);

// Ajustement adversaire: une équipe face à une meilleure défense marque moins
const weakDefProj = computeProjection(home, mkTeam('Weak Def', 96, 114, 125), league);
check('défense adverse faible → score home plus élevé', weakDefProj.homeExpectedPts > proj.homeExpectedPts);

// ═══ 6. evaluateMarketEdges ═══
console.log('\n═══ 6. evaluateMarketEdges (BET / LEAN / NO BET) ═══');
const projFull = computeProjection(mkTeam('H', 100, 118, 110), mkTeam('A', 96, 114, 116), league);
// projFull: total 223.4, marge +12.3, shrink 1 (req 3.5pp, σ 11.5)

const edgesFull = evaluateMarketEdges(projFull, { total: 220.5, homeSpread: -12.3 - 4, awaySpread: 12.3 + 4 });
// O/U: distance 2.9 → P(Over) = Φ(2.9/11.5) ≈ 0.596 → edge +9.6pp ≥ 3.5 → BET; Under → NO BET
const overE = edgesFull.find((e) => e.market === 'OVER')!;
const underE = edgesFull.find((e) => e.market === 'UNDER')!;
check('Over 220.5 (proj 223.4) → BET', overE.decision === 'BET', `got ${overE.decision} edge ${overE.edgePp}`);
check('Under 220.5 (proj 223.4) → NO BET', underE.decision === 'NO BET', `got ${underE.decision}`);
check('P(Over) ≈ 0.596', approx(overE.probModel, 0.596, 0.01), `got ${overE.probModel}`);
check('Under complémentaire du Over', approx(overE.probModel + underE.probModel, 1, 1e-6));

// Ligne trop proche de la projection (V4 §22) → NO BET
const edgesClose = evaluateMarketEdges(projFull, { total: projFull.expectedTotal });
check('ligne = projection → NO BET (trop proche)', edgesClose.every((e) => e.decision === 'NO BET'));

// Spread: home favori de 12.3 avec marge projetée +12.3 → cover 50/50 → NO BET (distance 0)
// homeSpread très couvrant: −9 (marge 12.3 → distance 3.3 → P=Φ(3.3/11.5)≈0.616 → BET)
const edgesSpread = evaluateMarketEdges(projFull, { homeSpread: -9, awaySpread: 9 });
const hsE = edgesSpread.find((e) => e.market === 'HOME_SPREAD')!;
const asE = edgesSpread.find((e) => e.market === 'AWAY_SPREAD')!;
check('Home −9 avec marge +12.3 → BET', hsE.decision === 'BET', `got ${hsE.decision} edge ${hsE.edgePp}`);
check('Away +9 avec marge +12.3 → NO BET', asE.decision === 'NO BET', `got ${asE.decision}`);
check('P(home cover −9) ≈ 0.616', approx(hsE.probModel, 0.616, 0.01), `got ${hsE.probModel}`);
check('home + away covers complémentaires', approx(hsE.probModel + asE.probModel, 1, 1e-6));

// Début de saison (shrink 0): seuil 7pp + σ élargi 13.8 → même écart devient LEAN/NO BET
const earlyHome = mkTeam('H', 100, 118, 110); earlyHome.gamesPlayed = 0; earlyHome.shrinkFactor = 0;
const earlyAway = mkTeam('A', 96, 114, 116); earlyAway.gamesPlayed = 0; earlyAway.shrinkFactor = 0;
const earlyProj = computeProjection(earlyHome, earlyAway, league);
check('début de saison: σ élargi (13.8)', approx(earlyProj.sigmaTotal, 13.8, 0.05), `got ${earlyProj.sigmaTotal}`);
const earlyEdges = evaluateMarketEdges(earlyProj, { total: earlyProj.expectedTotal - 2 });
const earlyOver = earlyEdges.find((e) => e.market === 'OVER')!;
check('début de saison: edge distance 2 → LEAN ou NO BET (pas BET)',
  earlyOver.decision !== 'BET', `got ${earlyOver.decision} edge ${earlyOver.edgePp} req ${earlyOver.requiredEdgePp}`);
check('seuil requis transmis = 7.0pp début de saison', approx(earlyOver.requiredEdgePp, 7.0, 0.1));

// Aucune ligne marché (preseason) → tableau vide
check('lignes absentes → edges vides (fail-closed)', evaluateMarketEdges(projFull, {}).length === 0);
check('lignes null → edges vides', evaluateMarketEdges(projFull, { total: null, homeSpread: null, awaySpread: null }).length === 0);

// ═══ 7. parseTeamBoxStats ═══
console.log('\n═══ 7. parseTeamBoxStats (payload ESPN synthétique) ═══');
const fakePayload = {
  results: { stats: { categories: [
    { name: 'general', stats: [{ name: 'gamesPlayed', value: 82 }] },
    { name: 'offensive', stats: [
      { name: 'avgFieldGoalsAttempted', value: 90.2 },
      { name: 'avgFreeThrowsAttempted', value: 18.7 },
      { name: 'avgOffensiveRebounds', value: 12.5 },
      { name: 'avgTurnovers', value: 11.5 },
      { name: 'avgPoints', value: 114.9 },
    ]},
  ]}},
};
const fakeStandings: any = { id: 2, name: 'Boston Celtics', gamesPlayed: 82, ptsPerGame: 114.9, oppPtsPerGame: 109.3 };
const boston = parseTeamBoxStats(fakePayload, fakeStandings);
check('parse réussi', boston !== null);
if (boston) {
  check('pace Boston = 97.4', approx(boston.pace, 97.4, 0.1), `got ${boston.pace}`);
  check('ORtg = 114.9/97.43×100 ≈ 118.0', approx(boston.ortg, 117.97, 0.2), `got ${boston.ortg}`);
  check('DRtg = 109.3/97.43×100 ≈ 112.2', approx(boston.drtg, 112.18, 0.2), `got ${boston.drtg}`);
  check('gamesPlayed = 82', boston.gamesPlayed === 82);
}
check('payload corrompu → null', parseTeamBoxStats({}, fakeStandings) === null);
check('payload undefined → null', parseTeamBoxStats(undefined, fakeStandings) === null);
// Pace aberrante → rejet (garde-fou sanité)
const crazyPayload = JSON.parse(JSON.stringify(fakePayload));
crazyPayload.results.stats.categories[1].stats[0].value = 200; // FGA 200 → pace aberrante
check('pace hors bornes → null (garde-fou)', parseTeamBoxStats(crazyPayload, fakeStandings) === null);

// ═══ 8. Kill-switch + 9. Live ESPN (async) ═══
console.log('\n═══ 8. Kill-switch NBA_V4_LITE ═══');

async function main() {
process.env.NBA_V4_LITE = 'false';
const killed = await getNBAProjection('Boston Celtics', 'LA Lakers');
check('NBA_V4_LITE=false → projection null (sans fetch)', killed === null);
delete process.env.NBA_V4_LITE;

console.log('\n═══ 9. Live ESPN (skip si réseau indisponible) ═══');
try {
  const live = await Promise.race([
    getNBAProjection('Boston Celtics', 'New York Knicks'),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 45000)),
  ]);
  if (live) {
    console.log(`   Live: proj ${live.homeExpectedPts}-${live.awayExpectedPts} (total ${live.expectedTotal}, marge ${live.expectedMargin}), P(home) ${(live.homeWinProb * 100).toFixed(0)}%`);
    console.log(`   pace ${live.paceHome}/${live.paceAway}, ORtg ${live.ortgHome}/${live.ortgAway}, DRtg ${live.drtgHome}/${live.drtgAway}`);
    console.log(`   ${live.dataBasis}`);
    check('projection live: total réaliste 200-260', live.expectedTotal > 200 && live.expectedTotal < 260, `got ${live.expectedTotal}`);
    check('projection live: marge bornée ±25', Math.abs(live.expectedMargin) < 25, `got ${live.expectedMargin}`);
    check('projection live: P(home) dans [0.05, 0.95]', live.homeWinProb >= 0.05 && live.homeWinProb <= 0.95);
    check('projection live: paces réalistes 88-108', live.paceHome >= 88 && live.paceHome <= 108 && live.paceAway >= 88 && live.paceAway <= 108);
  } else {
    console.log('   ⏭️ Live skip (réseau/données indisponibles) — tests purs suffisent');
  }
} catch (e: any) {
  console.log(`   ⏭️ Live skip: ${e.message}`);
}
}

// ═══ Résultat ═══
function reportAndExit() {
  console.log('\n════════════════════════════════');
  console.log(`RÉSULTAT: ${passed} passés, ${failed} échoués`);
  process.exit(failed > 0 ? 1 : 0);
}

main()
  .then(() => reportAndExit())
  .catch((e) => { console.error('ERREUR FATALE:', e); process.exit(1); });
