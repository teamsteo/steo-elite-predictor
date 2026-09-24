/**
 * Tests pipeline V3 partagé site + Telegram (Task 21)
 * =====================================================
 * Couvre :
 *  - toSiteFormat : conversion affichage (×100 prob, kelly %, champs préservés)
 *  - L1 mémoire : 2 appels rapprochés → 1 seule collecte, source 'memory'
 *  - L2 partagé : fichier frais → 0 collecte + source 'shared' ; fichier périmé → collecte + write
 *  - forceRefresh : bypass L1+L2
 *  - dédoublonnage concurrent (inflight)
 *  - dégradation gracieuse sans Storage (hooks absents + env absente)
 */
import {
  runV3Pipeline,
  toSiteFormat,
  __resetPipelineForTests,
  ApiPrediction,
  SharedFileLike,
} from '../src/lib/tennis-v3/pipeline';
import { TennisMatch } from '../src/lib/tennis-enhanced/smart-collector';

let pass = 0, fail = 0;
function assert(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

/** ApiPrediction factice au format toApiPrediction (prob 0-1). */
function fakeApi(prob: number, kelly: number): ApiPrediction {
  return {
    matchId: 'm1', player1: 'A', player2: 'B',
    tournament: 'ATP Masters 1000', tournamentTier: 'masters_1000',
    surface: 'hard', round: 'QF', date: new Date().toISOString(),
    odds1: 1.9, odds2: 1.9, category: 'atp',
    prediction: { winner: 'player1', winnerName: 'A', winProbability: prob, confidence: 'high', riskPercentage: Math.round((1 - prob) * 100), tier: '🟢' },
    betting: { recommendedBet: true, kellyStake: kelly, winnerOdds: 1.9, expectedValue: 0.05, valueRating: 'good' },
    analysis: 'x', keyFactors: [], warnings: [],
    modelVersion: 'tennis-v3.0.0', dataSource: 'live' as const,
    v3: { factors: [], decision: { tier: 'green', betRecommended: true } },
  } as unknown as ApiPrediction;
}

function fakeSharedFile(predictions: ApiPrediction[], ageMs: number): SharedFileLike {
  return {
    updated_at: new Date(Date.now() - ageMs).toISOString(),
    collected_at: new Date(Date.now() - ageMs).toISOString(),
    predictions,
    collected_count: 42,
    unresolved_count: 3,
    status: { seed: { total: 29756 } },
  };
}

const fixtureMatch = (): TennisMatch => ({
  id: 'a_b', player1: 'A', player2: 'B', player1Id: 'a', player2Id: 'b',
  tournament: 'ATP Masters 1000', tournamentId: 'm1000', tournamentTier: 'masters_1000' as any,
  surface: 'hard' as any, round: 'QF', date: new Date(), odds1: 1.9, odds2: 1.9,
} as TennisMatch);

const fakeV3Result = (preds: ApiPrediction[]) => ({
  predictions: [],
  unresolved: [{ player1: 'X', player2: 'Y' }],
  status: { seed: { total: 29756, generatedAt: '2026-09-24' }, incrementalMatches: 10 },
  ...{},
}) as any;

async function main() {
  console.log('═══ 1. toSiteFormat — conversion affichage ═══');
  {
    const api = fakeApi(0.72, 0.0523);
    const site = toSiteFormat(api);
    assert('prob 0.72 → 72', site.prediction.winProbability === 72, String(site.prediction.winProbability));
    assert('kelly 0.0523 → 5.2 (%)', site.betting.kellyStake === 5.2, String(site.betting.kellyStake));
    assert('risk inchangé (28)', site.prediction.riskPercentage === api.prediction.riskPercentage);
    assert('EV inchangé (0.05)', site.betting.expectedValue === 0.05);
    assert('champs top-level préservés', site.player1 === 'A' && site.odds1 === 1.9);
    assert('API brut non muté', api.prediction.winProbability === 0.72 && api.betting.kellyStake === 0.0523);
    const zeroKelly = toSiteFormat(fakeApi(0.6, 0));
    assert('kelly 0 → 0 (pas NaN)', zeroKelly.betting.kellyStake === 0);
  }

  console.log('═══ 2. L1 mémoire — 1 collecte pour 2 appels ═══');
  {
    __resetPipelineForTests();
    let collects = 0;
    const opts = {
      _collect: async () => { collects++; return [fixtureMatch()]; },
      _predict: async () => fakeV3Result([]),
      _readShared: async () => null,
    };
    const r1 = await runV3Pipeline(opts);
    const r2 = await runV3Pipeline(opts);
    assert('collecte exécutée 1×', collects === 1, String(collects));
    assert('1er appel source fresh', r1.meta.source === 'fresh');
    assert('2e appel source memory', r2.meta.source === 'memory');
    assert('mêmes prédictions', r1.predictions === r2.predictions);
    assert('funnel collecté=1', r1.meta.collectedCount === 1);
    assert('funnel unresolved=1', r1.meta.unresolvedCount === 1);
  }

  console.log('═══ 3. L2 partagé — fichier frais réutilisé ═══');
  {
    __resetPipelineForTests();
    let collects = 0, writes = 0;
    const shared = fakeSharedFile([fakeApi(0.65, 0.04)], 60_000); // 1 min
    const opts = {
      _collect: async () => { collects++; return [fixtureMatch()]; },
      _predict: async () => fakeV3Result([]),
      _readShared: async () => shared,
      _writeShared: async () => { writes++; },
    };
    const r = await runV3Pipeline(opts);
    assert('0 collecte (réutilise shared)', collects === 0, String(collects));
    assert('source shared', r.meta.source === 'shared');
    assert('predictions = contenu partagé', r.predictions.length === 1 && r.predictions[0].prediction.winProbability === 0.65);
    assert('site converti depuis shared (65)', (r.site[0] as any).prediction.winProbability === 65);
    assert('meta du fichier (collected=42)', r.meta.collectedCount === 42);
    assert('pas de write (lecture seule)', writes === 0);
  }

  console.log('═══ 4. L2 périmé → collecte fraîche + partage ═══');
  {
    __resetPipelineForTests();
    let collects = 0, writes = 0;
    const stale = fakeSharedFile([fakeApi(0.5, 0)], 30 * 60_000); // 30 min > 15 min
    const opts = {
      _collect: async () => { collects++; return [fixtureMatch(), fixtureMatch()]; },
      _predict: async () => fakeV3Result([]),
      _readShared: async () => stale,
      _writeShared: async () => { writes++; },
    };
    const r = await runV3Pipeline(opts);
    assert('collecte exécutée (stale ignoré)', collects === 1);
    assert('source fresh', r.meta.source === 'fresh');
    assert('write partagé appelé 1×', writes === 1, String(writes));
    assert('maxAgeMs custom respecté (2 min)', await (async () => {
      __resetPipelineForTests();
      let c2 = 0;
      const r2 = await runV3Pipeline({
        maxAgeMs: 2 * 60_000,
        _collect: async () => { c2++; return []; },
        _predict: async () => fakeV3Result([]),
        _readShared: async () => stale, // 30 min > 2 min → ignoré
      });
      return c2 === 1 && r2.meta.source === 'fresh';
    })());
  }

  console.log('═══ 5. forceRefresh — bypass L1+L2 ═══');
  {
    __resetPipelineForTests();
    let collects = 0;
    const opts = {
      _collect: async () => { collects++; return [fixtureMatch()]; },
      _predict: async () => fakeV3Result([]),
      _readShared: async () => null, // L2 absente : le 1er appel remplit la mémoire L1
    };
    await runV3Pipeline(opts);
    const r2 = await runV3Pipeline({ ...opts, forceRefresh: true });
    assert('forceRefresh recollecte malgré L1 fraîche', collects === 2, String(collects));
    assert('source fresh malgré caches', r2.meta.source === 'fresh');
  }

  console.log('═══ 6. Dédoublonnage concurrent (inflight) ═══');
  {
    __resetPipelineForTests();
    let collects = 0;
    const slowOpts = {
      _collect: async () => { collects++; await new Promise((r) => setTimeout(r, 30)); return [fixtureMatch()]; },
      _predict: async () => fakeV3Result([]),
      _readShared: async () => null,
    };
    const [a, b] = await Promise.all([runV3Pipeline(slowOpts), runV3Pipeline(slowOpts)]);
    assert('2 appels simultanés → 1 collecte', collects === 1, String(collects));
    assert('même résultat partagé', a.predictions === b.predictions);
  }

  console.log('═══ 7. Sans Storage ni hooks — dégradation gracieuse ═══');
  {
    __resetPipelineForTests();
    // pas de _readShared/_writeShared, env Supabase absente en test → L2 skippée
    let collects = 0;
    const r = await runV3Pipeline({
      _collect: async () => { collects++; return [fixtureMatch()]; },
      _predict: async () => fakeV3Result([]),
    });
    assert('collecte directe (L2 indisponible)', collects === 1 && r.meta.source === 'fresh');
  }

  console.log('═══ 8. Format canonique : API 0-1 vs site 0-100 ═══');
  {
    __resetPipelineForTests();
    const r = await runV3Pipeline({
      _collect: async () => [fixtureMatch()],
      _predict: async () => fakeV3Result([]),
      _readShared: async () => fakeSharedFile([fakeApi(0.73, 0.06)], 0),
    });
    assert('cron lit 0-1', r.predictions[0].prediction.winProbability === 0.73);
    assert('site lit 0-100', (r.site[0] as any).prediction.winProbability === 73);
    assert('cron kelly 0-1', r.predictions[0].betting.kellyStake === 0.06);
    assert('site kelly %', (r.site[0] as any).betting.kellyStake === 6);
  }

  __resetPipelineForTests();
  console.log(fail === 0
    ? `\n════════════════════════════════════════\nRÉSULTAT: ${pass} passés / ${fail} échoués — PIPELINE V3 VALIDÉ`
    : `\n════════════════════════════════════════\nRÉSULTAT: ${pass} passés / ${fail} ÉCHOUÉS`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERREUR:', e); process.exit(1); });
