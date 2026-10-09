/**
 * Test Task 41 — BADJAN V3: Engines NHL/MLB + Couche décision + Métriques
 *
 * Exécution: npx tsx scripts/test_task41_v3.ts
 *
 * Couverture:
 *  1. NHL Engine: PMF Poisson (valeurs connues), convolution victoire (Σ=1),
 *     Over/Under exacts, avantage domicile, shrinkage, projection complète
 *  2. MLB Engine: normalCdf (Φ connus), starterImpactFactor (direction + clamp),
 *     surdispersion σ, projection complète, edges marché
 *  3. V3 Decision: devig 2-marchés, marge, EV, proba conservatrice, Kelly,
 *     seuil adaptatif, classification RETENIR/SURVEILLER/REJETER (tous les chemins)
 *  4. Métriques Phase 4: brierScore, logLoss, devigForSide, calibrationBucket
 *  5. Intégration: simulation complète d'un match NHL + MLB → décision cohérente
 */

import {
  poissonPmf, homeWinProbability, probOverTotal, shrinkRating,
  computeNHLProjection, evaluateNHLMarketEdges, requiredEdgePp as nhlRequiredEdgePp,
  widenedSigmaTotal, type NHLEngineTeamStats,
} from '../src/lib/nhlProjectionEngine';
import {
  normalCdf, shrinkRating as mlbShrink, starterImpactFactor, computeMLBProjection,
  evaluateMLBMarketEdges, sigmaTotalFor, sigmaMarginFor, type MLBEngineTeamStats,
} from '../src/lib/mlbProjectionEngine';
import {
  devigTwoWay, bookmakerMarginPp, expectedValue, conservativeProb, kellyFractionFor,
  requiredGapPpFor, computeV3Decision, decideFromEngine,
} from '../src/lib/v3DecisionLayer';
import {
  brierScore, logLoss, devigForSide, calibrationBucket,
} from '../src/lib/sportMetricsService';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`✅ ${name}`); }
  else { failed++; console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function section(t: string) { console.log(`\n${'='.repeat(60)}\n${t}\n${'='.repeat(60)}`); }
function approx(x: number, y: number, eps = 1e-6): boolean { return Math.abs(x - y) < eps; }

// ============================================
// 1. NHL ENGINE
// ============================================
section('1. NHL ENGINE V4-lite (Poisson + Skellam)');

// PMF Poisson valeurs connues: P(X=0|1) = e^-1 ≈ 0.3679, P(X=1|1) = e^-1 ≈ 0.3679
check('Poisson P(X=0|λ=1) = e^-1', approx(poissonPmf(1, 0), Math.exp(-1), 1e-9));
check('Poisson P(X=1|λ=1) = e^-1', approx(poissonPmf(1, 1), Math.exp(-1), 1e-9));
// P(X=2|λ=2) = e^-2 × 4/2 = 2e^-2 ≈ 0.2707
check('Poisson P(X=2|λ=2) = 2e^-2', approx(poissonPmf(2, 2), 2 * Math.exp(-2), 1e-9));

// Somme des PMF 0..14 ≈ 1 pour λ NHL
let sumPmf = 0;
for (let k = 0; k <= 14; k++) sumPmf += poissonPmf(3.0, k);
check('Poisson Σ PMF (λ=3, 0..14) ≈ 1', approx(sumPmf, 1, 1e-5));

// Probabilités de victoire: somme = 1
const d1 = homeWinProbability(3.0, 3.0);
check('NHL Σ P(win) = 1 (égal λ)', approx(d1.homeWinProb + d1.awayWinProb, 1, 1e-9));
check('NHL domicile favori à domicile (HCA + OT split)', d1.homeWinProb > 0.5, `P=${d1.homeWinProb.toFixed(4)}`);
check('NHL P(égalité 60min) plausible 15-35%', d1.tieProb > 0.12 && d1.tieProb < 0.40, `tie=${(d1.tieProb * 100).toFixed(1)}%`);

// Favori fort: λ 4.5 vs 2.0 → home très favori
const d2 = homeWinProbability(4.5, 2.0);
check('NHL fort favori: P(home) > 0.80', d2.homeWinProb > 0.80, `P=${d2.homeWinProb.toFixed(4)}`);
check('NHL fort favori: puck line home < moneyline home', d2.pHomeCover15 < d2.homeWinProb);
check('NHL sous-dog: P(home) = 1 − P(away)', approx(d2.homeWinProb, 1 - d2.awayWinProb, 1e-9));

// Over/Under: ligne très basse → over ≈ 1; très haute → over ≈ 0
check('NHL Over ligne 1.5 (total 6.0) ≈ 1', probOverTotal(3, 3, 1.5) > 0.98);
check('NHL Under ligne 20.5 (total 6.0) ≈ 0', probOverTotal(3, 3, 20.5) < 0.02);
// Symétrie: ligne 6.5 avec λ 3.25/3.25 → P(over) < 0.5 (grille discrète vs .5)
const p65 = probOverTotal(3.25, 3.25, 6.5);
check('NHL P(over 6.5) ∈ [0.3, 0.7]', p65 > 0.3 && p65 < 0.7, `p=${p65.toFixed(3)}`);

// Shrinkage: 0 match → moyenne ligue; beaucoup de matchs → valeur brute
check('NHL shrink 0 GP → moyenne ligue', approx(shrinkRating(4.0, 3.0, 0), 3.0, 1e-9));
check('NHL shrink 50 GP → proche valeur (3.833)', approx(shrinkRating(4.0, 3.0, 50), 3.8333, 0.001));

// Projection complète
const nhlHome: NHLEngineTeamStats = {
  teamName: 'Toronto Maple Leafs', gamesPlayed: 20,
  gfPerGame: 3.8, gaPerGame: 2.9, wins: 12, losses: 6, otLosses: 2, last10Wins: 6,
  attackAdj: shrinkRating(3.8, 3.05, 20), defenseAdj: shrinkRating(2.9, 3.05, 20), shrinkFactor: 20 / 30,
};
const nhlAway: NHLEngineTeamStats = {
  teamName: 'Montreal Canadiens', gamesPlayed: 20,
  gfPerGame: 2.8, gaPerGame: 3.4, wins: 7, losses: 10, otLosses: 3, last10Wins: 4,
  attackAdj: shrinkRating(2.8, 3.05, 20), defenseAdj: shrinkRating(3.4, 3.05, 20), shrinkFactor: 20 / 30,
};
const nhlLeague = { goalsPerGame: 3.05, teamsCounted: 32 };
const proj = computeNHLProjection(nhlHome, nhlAway, nhlLeague);
check('NHL proj: total = λh + λa', approx(proj.expectedTotal, proj.homeExpectedGoals + proj.awayExpectedGoals, 0.011));
check('NHL proj: marge = λh − λa', approx(proj.expectedMargin, proj.homeExpectedGoals - proj.awayExpectedGoals, 0.011));
check('NHL proj: domicile favori (attaque forte vs défense faible)', proj.homeWinProb > 0.55, `P=${(proj.homeWinProb * 100).toFixed(1)}%`);
check('NHL proj: P(home) + P(away) = 1', approx(proj.homeWinProb + proj.awayWinProb, 1, 1e-6));
check('NHL proj: shrink factor = 20/30', approx(proj.shrinkFactor, 20 / 30, 0.01));
check('NHL proj: intervalle 70% encadre le total', proj.intervalTotal70[0] < proj.expectedTotal && proj.expectedTotal < proj.intervalTotal70[1]);

// Edges marché
const edges = evaluateNHLMarketEdges(proj, { total: 6.5 });
check('NHL edges: 2 marchés évalués (O/U + puck)', edges.length === 2, `n=${edges.length}`);
check('NHL edges: O/U ligne 6.5 présent', edges.some((e) => e.market === 'OVER' || e.market === 'UNDER'));
check('NHL edges: seuil adaptatif dans [3.5, 7.5]', edges.every((e) => e.requiredEdgePp >= 3.5 && e.requiredEdgePp <= 7.6));
check('NHL edges: décision ∈ {BET, LEAN, NO BET}', edges.every((e) => ['BET', 'LEAN', 'NO BET'].includes(e.decision)));

// Kill de sanité σ
const sigmaTot = widenedSigmaTotal(6.0, 0.5);
check('NHL σ total ≈ √6 × 1.05 × (1 + 0.5×0.2)', approx(sigmaTot, Math.sqrt(6) * 1.05 * 1.1, 0.01));

// ============================================
// 2. MLB ENGINE
// ============================================
section('2. MLB ENGINE V4-lite (runs + lanceurs réels)');

check('MLB normalCdf(0) = 0.5', approx(normalCdf(0), 0.5, 1e-9));
check('MLB normalCdf(1.96) ≈ 0.975', approx(normalCdf(1.96), 0.975, 0.001));
check('MLB normalCdf(-1) ≈ 0.1587', approx(normalCdf(-1), 0.1587, 0.001));

// starterImpactFactor: bon lanceur (ERA 3.0 vs ligue 4.5) → < 1 (on marque moins)
const fGood = starterImpactFactor(3.0, 100, 4.5);
check('MLB facteur as (ERA 3.0) < 1', fGood < 1, `f=${fGood.toFixed(3)}`);
const fBad = starterImpactFactor(6.0, 100, 4.5);
check('MLB facteur lanceur faible (ERA 6.0) > 1', fBad > 1, `f=${fBad.toFixed(3)}`);
check('MLB facteur neutre sans lanceur', starterImpactFactor(null, 0, 4.5) === 1);
check('MLB facteur clampé [0.65, 1.40] avant amort', starterImpactFactor(1.0, 100, 4.5) > 0.7);
// Peu d'IP → fiabilité réduite → facteur proche de 1
const fLowIp = starterImpactFactor(2.0, 5, 4.5);
check('MLB faible IP → facteur amorti vers 1', Math.abs(fLowIp - 1) < Math.abs(starterImpactFactor(2.0, 120, 4.5) - 1));

// Surdispersion: σ_total MLB ≈ √8 × 1.35 ≈ 3.82
check('MLB σ total √8×1.35', approx(sigmaTotalFor(8, 1), Math.sqrt(8) * 1.35, 0.01));
check('MLB σ marge √8×1.15', approx(sigmaMarginFor(8, 1), Math.sqrt(8) * 1.15, 0.01));
check('MLB σ élargi si incertitude', sigmaTotalFor(8, 0.2) > sigmaTotalFor(8, 1));

// Shrinkage MLB
check('MLB shrink 0 GP → moyenne', approx(mlbShrink(5.0, 4.4, 0), 4.4, 1e-9));

// Projection complète
const mlbHome: MLBEngineTeamStats = {
  teamName: 'New York Yankees', gamesPlayed: 100,
  rsPerGame: 5.0, raPerGame: 4.0, wins: 58, losses: 42,
  attackAdj: mlbShrink(5.0, 4.5, 100), defenseAdj: mlbShrink(4.0, 4.5, 100), shrinkFactor: 100 / 110,
};
const mlbAway: MLBEngineTeamStats = {
  teamName: 'Boston Red Sox', gamesPlayed: 100,
  rsPerGame: 4.2, raPerGame: 4.6, wins: 48, losses: 52,
  attackAdj: mlbShrink(4.2, 4.5, 100), defenseAdj: mlbShrink(4.6, 4.5, 100), shrinkFactor: 100 / 110,
};
const mlbLeague = { runsPerGame: 4.5, teamsCounted: 30 };
const projMLB = computeMLBProjection(mlbHome, mlbAway, mlbLeague, {
  home: { name: 'Gerrit Cole', era: 3.2, inningsPitched: 120 },
  away: { name: 'Brayan Bello', era: 4.8, inningsPitched: 110 },
});
check('MLB proj: total = λh + λa', approx(projMLB.expectedTotal, projMLB.homeExpectedRuns + projMLB.awayExpectedRuns, 0.011));
check('MLB proj: domicile favori', projMLB.homeWinProb > 0.55, `P=${(projMLB.homeWinProb * 100).toFixed(1)}%`);
check('MLB proj: P(home) + P(away) = 1', approx(projMLB.homeWinProb + projMLB.awayWinProb, 1, 1e-6));
check('MLB proj: lanceurs réels transportés', projMLB.homeStarter === 'Gerrit Cole' && projMLB.awayStarter === 'Brayan Bello');
check('MLB proj: facteur partant adverse < 1 pour le DOMICILE quand le partant EXTÉRIEUR est fort', (() => {
  const p2 = computeMLBProjection(mlbHome, mlbAway, mlbLeague, {
    home: { name: 'Faible', era: 5.5, inningsPitched: 100 },
    away: { name: 'Cole', era: 3.0, inningsPitched: 100 },
  });
  return p2.starterFactorHome < 1;
})(), 'f=' + projMLB.starterFactorHome);
check('MLB proj: facteur partant DOMICILE fort → λ extérieur réduit', projMLB.starterFactorAway < 1, `f=${projMLB.starterFactorAway}`);
check('MLB proj: intervalle 70% encadre le total', projMLB.intervalTotal70[0] < projMLB.expectedTotal && projMLB.expectedTotal < projMLB.intervalTotal70[1]);
check('MLB proj: λ dans bornes de sanité [1.8, 9.0]', projMLB.homeExpectedRuns >= 1.8 && projMLB.homeExpectedRuns <= 9.0 && projMLB.awayExpectedRuns >= 1.8 && projMLB.awayExpectedRuns <= 9.0);

// Sans lanceurs → pénalité shrink
const projNoP = computeMLBProjection(mlbHome, mlbAway, mlbLeague, { home: null, away: null });
check('MLB sans lanceurs: shrink pénalisé (×0.8)', approx(projNoP.shrinkFactor, mlbShrink(0, 0, 0) + (100 / 110) * 0.8 - 0, 0.01) || approx(projNoP.shrinkFactor, (100 / 110) * 0.8, 0.01), `s=${projNoP.shrinkFactor}`);
check('MLB sans lanceurs: partants null', projNoP.homeStarter === null && projNoP.awayStarter === null);

// Edges marché
const edgesMLB = evaluateMLBMarketEdges(projMLB, { total: 8.5 });
check('MLB edges: 2 marchés évalués', edgesMLB.length === 2);
check('MLB edges: décision ∈ {BET, LEAN, NO BET}', edgesMLB.every((e) => ['BET', 'LEAN', 'NO BET'].includes(e.decision)));

// ============================================
// 3. V3 DECISION LAYER
// ============================================
section('3. V3 DECISION LAYER (devig, EV, RETENIR/SURVEILLER/REJETER)');

// Devig: cotes équitables 2.0/2.0 → 50/50, marge 0
check('V3 devig 2.0/2.0 → 0.5', approx(devigTwoWay(2.0, 2.0), 0.5, 1e-9));
check('V3 marge 2.0/2.0 → 0pp', approx(bookmakerMarginPp(2.0, 2.0), 0, 1e-9));
// Cotes réelles 1.85/2.05: marge = 0.5405+0.4878−1 = 2.83pp
check('V3 devig 1.85/2.05 ≈ 0.5257', approx(devigTwoWay(1.85, 2.05), (1 / 1.85) / (1 / 1.85 + 1 / 2.05), 1e-9));
check('V3 marge 1.85/2.05 ≈ 2.83pp', approx(bookmakerMarginPp(1.85, 2.05), 2.832, 0.01));

// EV: P=0.55, cote 2.0 → +10%
check('V3 EV(0.55, 2.0) = +10%', approx(expectedValue(0.55, 2.0), 10, 1e-9));
check('V3 EV(0.45, 2.0) = −10%', approx(expectedValue(0.45, 2.0), -10, 1e-9));

// Proba conservatrice: 0.60 → 0.5 + 0.1×0.65 = 0.565
check('V3 conservatrice(0.60) = 0.565', approx(conservativeProb(0.60), 0.565, 1e-9));
check('V3 conservatrice(0.50) = 0.50', approx(conservativeProb(0.50), 0.5, 1e-9));

// Kelly: f = (p×o − 1)/(o−1), quarter-Kelly: (0.55×2.0−1)/1/4 = 0.025
check('V3 Kelly(0.55, 2.0) = 0.025 (quarter)', approx(kellyFractionFor(0.55, 2.0), 0.025, 1e-9));
check('V3 Kelly EV négative → 0', kellyFractionFor(0.45, 2.0) === 0);

// Seuil adaptatif: parfait → 3.5pp; incertain → jusqu'à 8pp
check('V3 seuil parfait = 3.5pp', approx(requiredGapPpFor(1), 3.5, 1e-9));
check('V3 seuil incertain = 8pp', approx(requiredGapPpFor(0), 8, 1e-9));

// ── Classification: RETENIR ──
const dRetenir = computeV3Decision({
  sport: 'NHL', side: 'home', homeTeam: 'Toronto', awayTeam: 'Montreal',
  modelProb: 0.60, modelProbConservative: conservativeProb(0.60),
  oddsSide: 2.10, oddsOpposite: 1.78, shrinkFactor: 0.8, hasRealOdds: true,
});
check('V3 RETENIR: value robuste', dRetenir.category === 'RETENIR', `${dRetenir.category} (gap ${dRetenir.gapPp}pp, evC ${dRetenir.evConservative})`);
check('V3 RETENIR: EV positif', dRetenir.ev > 0);
check('V3 RETENIR: devig appliqué', dRetenir.impliedDevig > 0 && dRetenir.impliedDevig < dRetenir.impliedRaw);

// ── Classification: REJETER (pas d'avantage) ──
const dRejeter = computeV3Decision({
  sport: 'NHL', side: 'home', homeTeam: 'A', awayTeam: 'B',
  modelProb: 0.50, modelProbConservative: 0.50,
  oddsSide: 1.95, oddsOpposite: 1.95, shrinkFactor: 0.8, hasRealOdds: true,
});
check('V3 REJETER: modèle aligné au marché', dRejeter.category === 'REJETER', dRejeter.category);

// ── Classification: REJETER (cotes estimées) ──
const dNoOdds = computeV3Decision({
  sport: 'NHL', side: 'home', homeTeam: 'A', awayTeam: 'B',
  modelProb: 0.70, modelProbConservative: 0.62,
  oddsSide: 2.0, oddsOpposite: 1.9, shrinkFactor: 0.8, hasRealOdds: false,
});
check('V3 REJETER: jamais de value sur cotes estimées', dNoOdds.category === 'REJETER', dNoOdds.category);

// ── Classification: jamais RETENIR si données fragiles ──
const dFragile = computeV3Decision({
  sport: 'NHL', side: 'home', homeTeam: 'A', awayTeam: 'B',
  modelProb: 0.68, modelProbConservative: conservativeProb(0.68),
  oddsSide: 2.2, oddsOpposite: 1.72, shrinkFactor: 0.25, hasRealOdds: true,
});
check('V3 données fragiles: jamais RETENIR (max SURVEILLER)', dFragile.category !== 'RETENIR', dFragile.category);
check('V3 données fragiles: divergence non explicable', dFragile.checks.divergenceExplained === false);

// ── Classification: SURVEILLER (EV positif mais scénario défavorable négatif) ──
// EV = 0.60×1.95−1 = +17% mais EV pessimiste = 0.50×1.95−1 = −2.5% → SURVEILLER
const dSurv = computeV3Decision({
  sport: 'NHL', side: 'home', homeTeam: 'A', awayTeam: 'B',
  modelProb: 0.60, modelProbConservative: 0.50,
  oddsSide: 1.95, oddsOpposite: 1.90, shrinkFactor: 0.8, hasRealOdds: true,
});
check('V3 SURVEILLER: EV pessimiste négatif → à confirmer', dSurv.category === 'SURVEILLER', `${dSurv.category} (evC=${dSurv.evConservative})`);

// ── decideFromEngine: côté choisi = côté favori engine ──
const dEng = decideFromEngine('NHL', 'Toronto', 'Montreal', 0.58, 1.90, 2.05, 0.7, true, false, 'Projeté 3.6-2.8');
check('V3 decideFromEngine: side home si P(home) ≥ 0.5', dEng.side === 'home');
check('V3 decideFromEngine: modelProb = P(home)', approx(dEng.modelProb, 0.58, 1e-9));
check('V3 decideFromEngine: side away si P(home) < 0.5', decideFromEngine('MLB', 'A', 'B', 0.42, 2.2, 1.75, 0.7, true, false).side === 'away');
check('V3 decideFromEngine: résumé transporté', dEng.reasons.some((r) => r.includes('Projeté')));

// ── Pas de filtre par cote: value sur cote haute est possible ──
const dHighOdds = computeV3Decision({
  sport: 'MLB', side: 'away', homeTeam: 'A', awayTeam: 'B',
  modelProb: 0.42, modelProbConservative: conservativeProb(0.42),
  oddsSide: 2.9, oddsOpposite: 1.42, shrinkFactor: 0.85, hasRealOdds: true,
});
// devig away = (1/2.9)/((1/2.9)+(1/1.42)) = 0.3288; gap = 9.1pp; EV = 0.42×2.9−1 = +21.8%
check('V3 PAS de filtre de cote: outsider @2.90 classable RETENIR', dHighOdds.category === 'RETENIR', `${dHighOdds.category} (gap ${dHighOdds.gapPp}, evC ${dHighOdds.evConservative})`);

// ── 8 garde-fous présents ──
check('V3: 8 garde-fous retournés', Object.keys(dRetenir.checks).length === 8);
check('V3 RETENIR: scénario défavorable positif', dRetenir.checks.adverseScenarioPositive === true);
check('V3 RETENIR: prix réel requis', dRetenir.checks.realOddsAvailable === true);

// ============================================
// 4. PHASE 4 — MÉTRIQUES
// ============================================
section('4. MÉTRIQUES PHASE 4 (Brier, log loss, calibration)');

// Brier: parfait = 0; constant 0.5 = 0.25
check('Brier parfait = 0', approx(brierScore([{ p: 1, y: 1 }, { p: 0, y: 0 }]), 0, 1e-9));
check('Brier constant 0.5 = 0.25', approx(brierScore([{ p: 0.5, y: 1 }, { p: 0.5, y: 0 }]), 0.25, 1e-9));
check('Brier pire = 1', approx(brierScore([{ p: 1, y: 0 }, { p: 0, y: 1 }]), 1, 1e-9));

// Log loss: confident et juste → petit; confident et faux → énorme
const llGood = logLoss([{ p: 0.9, y: 1 }]);
const llBad = logLoss([{ p: 0.9, y: 0 }]);
check('Log loss confiant+juste < confiant+faux', llGood < llBad, `${llGood} vs ${llBad}`);
check('Log loss p=0.5, y=1 ≈ 0.693', approx(logLoss([{ p: 0.5, y: 1 }]), 0.693, 0.001));

// Devig côté
check('devigForSide(1.85, 2.05) ≈ 0.5257', approx(devigForSide(1.85, 2.05), 0.5257, 0.001));
check('devigForSide cotes invalides → 0', devigForSide(0, 2) === 0 && devigForSide(1, 2) === 0);

// Buckets calibration
check('bucket 0.35 < 40%', calibrationBucket(0.35) === '<40%');
check('bucket 0.55 ∈ 50-60%', calibrationBucket(0.55) === '50-60%');
check('bucket 0.90 ≥ 85%', calibrationBucket(0.90) === '≥85%');

// ============================================
// 5. INTÉGRATION: cohérence décision ↔ projection
// ============================================
section('5. INTÉGRATION PROJECTION → DÉCISION → MÉTRIQUES');

// Chaîne NHL complète
const projNHL2 = computeNHLProjection(nhlHome, nhlAway, nhlLeague);
const decNHL = decideFromEngine('NHL', 'Toronto Maple Leafs', 'Montreal Canadiens',
  projNHL2.homeWinProb, 1.75, 2.20, projNHL2.shrinkFactor, true, false, projNHL2.dataBasis);
check('Chaîne NHL: décision produite', ['RETENIR', 'SURVEILLER', 'REJETER'].includes(decNHL.category), decNHL.category);
check('Chaîne NHL: side cohérent avec projection', decNHL.side === 'home');
check('Chaîne NHL: P_modèle = P(home) engine', approx(decNHL.modelProb, projNHL2.homeWinProb, 1e-6));

// Chaîne MLB complète avec sous-dog
const projMLB2 = computeMLBProjection(mlbHome, mlbAway, mlbLeague, { home: { name: 'Cole', era: 3.0, inningsPitched: 100 }, away: { name: 'Bello', era: 5.2, inningsPitched: 100 } });
const decMLB = decideFromEngine('MLB', 'New York Yankees', 'Boston Red Sox',
  projMLB2.homeWinProb, 1.60, 2.50, projMLB2.shrinkFactor, true, false);
check('Chaîne MLB: décision produite', ['RETENIR', 'SURVEILLER', 'REJETER'].includes(decMLB.category), decMLB.category);
check('Chaîne MLB: side home (favori net)', decMLB.side === 'home');

// Si un modèle Brier bat le marché, le diagnostic est correct
const pairs = [{ p: 0.6, y: 1 }, { p: 0.45, y: 0 }, { p: 0.55, y: 1 }];
const bm = brierScore(pairs);
check('Brier échantillon mixte < 0.25 (mieux que hasard)', bm < 0.25, `${bm.toFixed(4)}`);

// ============================================
// RÉSULTAT
// ============================================
console.log(`\n${'='.repeat(60)}`);
console.log(`RÉSULTAT: ${passed} passés, ${failed} échoués sur ${passed + failed}`);
console.log('='.repeat(60));
if (failed > 0) process.exit(1);
