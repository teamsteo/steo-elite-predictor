/**
 * Tennis V3 — Orchestrateur
 * Prend les matchs à venir (collectMatches du smart-collector existant, BetExplorer)
 * → résout les noms → construit les profils → moteur V3 → prédictions format API.
 * Les cotes viennent de BetExplorer (déjà intégré, anti-ban) — zéro appel réseau V3
 * au-delà des 2 xlsx/jour tennis-data.
 */

import { TennisMatch } from '../tennis-enhanced/smart-collector';
import { ensureFreshData, getRuntimeMatches, getDataStatus, getSeedLoadError } from './data-service';
import { buildProfile, finalizeProfile, resolveKey } from './profile-builder';
import { computeRawPrediction, calibrate, tierMultiplierOf, decide, computeVeto } from './prediction-engine-v3';
import { V3Prediction } from './types';
import { getManualVetoFlags } from './persistence';

export const V3_MODEL_VERSION = 'tennis-v3.0.0';

function tierOf(match: TennisMatch): string {
  return (match as any).tournamentTier || 'unknown';
}

function surfaceOf(match: TennisMatch): string {
  const s = (match as any).surface || 'Hard';
  const v = String(s).toLowerCase();
  if (v.includes('clay')) return 'Clay';
  if (v.includes('grass')) return 'Grass';
  return 'Hard';
}

export interface V3Result {
  predictions: V3Prediction[];
  unresolved: { player1: string; player2: string }[];
  status: ReturnType<typeof getDataStatus>;
}

export async function getV3Predictions(matches: TennisMatch[]): Promise<V3Result> {
  const ok = await ensureFreshData();
  const status = getDataStatus();
  if (!ok) {
    return { predictions: [], unresolved: [], status };
  }
  const runtime = getRuntimeMatches();
  const flags = await getManualVetoFlags(); // {playerKey: reason} — fallback {} si pas de Supabase

  const predictions: V3Prediction[] = [];
  const unresolved: { player1: string; player2: string }[] = [];

  // pré-résolution des clés (1 passe)
  const keyCache = new Map<string, string | null>();
  const resolve = (name: string): string | null => {
    if (keyCache.has(name)) return keyCache.get(name)!;
    const k = resolveKey(name);
    keyCache.set(name, k);
    return k;
  };

  for (const match of matches) {
    try {
      const k1 = resolve(match.player1);
      const k2 = resolve(match.player2);
      const seedNow = (await import('./data-service')).loadSeed();
      if (!k1 || !k2 || k1 === k2 || !seedNow?.ratings[k1] || !seedNow?.ratings[k2]) {
        // joueur inconnu du DB 5 ans → pas de prédiction possible (honnêteté > devinette)
        unresolved.push({ player1: match.player1, player2: match.player2 });
        continue;
      }
      const p1 = buildProfile(k1, runtime);
      const p2 = buildProfile(k2, runtime);
      if (!p1 || !p2) {
        unresolved.push({ player1: match.player1, player2: match.player2 });
        continue;
      }
      const surface = surfaceOf(match);
      const court = 'Outdoor'; // BetExplorer ne fournit pas court de façon fiable → outdoor par défaut
      finalizeProfile(p1, surface, k2, runtime);
      finalizeProfile(p2, surface, k1, runtime);

      const bo5 = String(tierOf(match)).toLowerCase().includes('grand_slam');
      const raw = computeRawPrediction(p1, p2, { surface, court, bo5 });
      const tierMult = tierMultiplierOf(tierOf(match));
      const calibrated = calibrate(raw.rawProbPlayer1, tierMult);
      const veto =
        computeVeto(p1) ??
        computeVeto(p2) ??
        ((flags[k1] || flags[k2]) as any || null);
      const decision = decide(raw, calibrated, tierOf(match), match.odds1, match.odds2, veto);

      predictions.push({
        matchId: match.id,
        player1: match.player1,
        player2: match.player2,
        tournament: match.tournament,
        tournamentTier: tierOf(match),
        surface,
        round: match.round,
        date: match.date.toISOString(),
        category: (match as any).category || 'atp',
        odds1: match.odds1,
        odds2: match.odds2,
        winner: decision.probPlayer1 >= 0.5 ? 'player1' : 'player2',
        winnerName: decision.probPlayer1 >= 0.5 ? match.player1 : match.player2,
        factors: raw.factors,
        decision,
        dataSource: 'tennis-data.co.uk + BetExplorer',
        modelVersion: V3_MODEL_VERSION,
      });
    } catch (e: any) {
      console.error(`[TennisV3] erreur match ${match?.id}: ${e?.message}`);
      unresolved.push({ player1: match.player1, player2: match.player2 });
    }
  }

  // tri : green d'abord, puis proba décroissante
  const order = { green: 0, yellow: 1, red: 2 };
  predictions.sort((a, b) => order[a.decision.tier] - order[b.decision.tier] || b.decision.probPlayer1 - a.decision.probPlayer1);

  return { predictions, unresolved, status };
}

/** Format compatible TennisPrediction de la route API existante. */
export function toApiPrediction(p: V3Prediction) {
  return {
    matchId: p.matchId,
    player1: p.player1,
    player2: p.player2,
    tournament: p.tournament,
    tournamentTier: p.tournamentTier,
    surface: p.surface,
    round: p.round,
    date: p.date,
    odds1: p.odds1,
    odds2: p.odds2,
    category: p.category,
    prediction: {
      winner: p.winner,
      winnerName: p.winnerName,
      winProbability: p.decision.probPlayer1 >= 0.5 ? p.decision.probPlayer1 : 1 - p.decision.probPlayer1,
      confidence:
        p.decision.tier === 'green' ? 'very_high' : p.decision.tier === 'yellow' ? 'medium' : 'low',
      riskPercentage: Math.round((1 - (p.decision.probPlayer1 >= 0.5 ? p.decision.probPlayer1 : 1 - p.decision.probPlayer1)) * 100),
      tier: p.decision.label,
    },
    betting: {
      recommendedBet: p.decision.betRecommended,
      kellyStake: p.decision.value?.kelly ?? 0,
      winnerOdds: p.winner === 'player1' ? p.odds1 : p.odds2,
      expectedValue: p.decision.value ? p.decision.value.ev : 0,
      valueRating: !p.decision.value ? 'poor' : p.decision.value.edge >= 0.08 ? 'excellent' : p.decision.value.edge >= 0.05 ? 'good' : 'fair',
    },
    analysis: p.factors.map((f) => `${f.label}: ${f.detail}`).join(' | '),
    keyFactors: p.decision.reasons,
    warnings: p.decision.veto ? [`Veto: ${p.decision.veto}`] : [],
    modelVersion: p.modelVersion,
    dataSource: 'live' as const,
    v3: {
      factors: p.factors,
      decision: p.decision,
    },
  };
}
