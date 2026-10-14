/**
 * comboService.ts — P4 Phase 5 : sélection DÉTERMINISTE + LLM narratif uniquement
 *
 * FAIBLESSE VISÉE : l'ancien combo déléguait LA SÉLECTION au LLM (non déterministe,
 * qualité variable selon le contexte du prompt du jour). Un LLM n'a aucune
 * légitimité pour choisir des paris — c'est un problème de calcul.
 *
 * NOUVEAU SPLIT DES RÔLES :
 *  - SÉLECTION : algorithme déterministe pur (score composite edge × kelly ×
 *    confiance, diversification ligue, plafond de cote combinée) — testable,
 *    reproductible, auditable.
 *  - LLM : RÉDACTION uniquement (nom + accroche). Échec LLM → libellés
 *    déterministes, jamais de blocage.
 *
 * ANTI-RÉGRESSION : signature `generateComboWithLLM(valueBets)` et type
 * `ComboResult` inchangés (consommateurs cron + DB + Telegram intacts).
 * Le fallback complet est déterministe: le combo part MÊME si le LLM est down.
 */

import ZAI from 'z-ai-web-dev-sdk';
import {
  comboLegIsVn, doubleChanceOdds, deviggedDrawProb, vnPickLabel,
} from './resultPolicy';

// ─── Types (contrats inchangés pour les consommateurs) ──────────────────────

export interface ComboMatch {
  homeTeam: string;
  awayTeam: string;
  sport: string; // 'football' | 'basketball' | 'baseball'
  league: string;
  predictedResult: 'home' | 'draw' | 'away';
  winProbability: number; // 0-100
  oddsHome: number;
  oddsAway: number;
  oddsDraw: number | null;
  riskPercentage: number; // 0-100
  valueBetDetected: boolean;
  valueBetType: string | null;
  confidence: string; // 'high', 'medium', 'low'
  date: string;
  _mlEdge?: number;
  _kellyStake?: number;
  _mlReasoning?: string[];
  _matchImportance?: any;
}

export interface ComboResult {
  comboId: string;
  name: string;
  reasoning: string;
  legs: Array<{
    homeTeam: string;
    awayTeam: string;
    sport: string;
    league: string;
    predictedResult: string;
    betLabel: string;
    winProbability: number;
    odds: number;
    confidence: string;
    reasoning: string;
  }>;
  combinedOdds: number;
  combinedWinProbability: number;
  riskLevel: 'low' | 'medium' | 'high';
  expectedValue: number;
  publishedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateComboId(): string {
  const now = new Date();
  const dateStr =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const hex = Math.random().toString(16).slice(2, 6).toUpperCase();
  return `combo-${dateStr}-${hex}`;
}

/**
 * 🎯 Task 46 — libellé bookmaker de LA SEULE option jouée:
 *  - football home/away → "PSG ou Nul" / "Nul ou Marseille" (Double Chance);
 *  - football draw → "Match Nul"; sports US → "Victoire Équipe" (pas de nul).
 * (Avant: le libellé disait "Victoire X" avec la cote 1X2 alors que le nul
 *  était compté gagné à la vérification — incohérence corrigée.)
 */
export function betLabelForResult(match: ComboMatch, result: string): string {
  if (comboLegIsVn(match.sport, result)) {
    return vnPickLabel(result, match.homeTeam, match.awayTeam);
  }
  const team =
    result === 'home' ? match.homeTeam : result === 'away' ? match.awayTeam : 'Match Nul';
  const verb = result === 'draw' ? '' : 'Victoire ';
  return `${verb}${team}`;
}

/**
 * Marché de SÉLECTION (1X2 pur): utilisé par le scoring composite / plafond de
 * cote — inchangé (la value bet est détectée sur le marché du côté).
 */
export function oddsForResult(match: ComboMatch, result: string): number {
  if (result === 'home') return match.oddsHome;
  if (result === 'away') return match.oddsAway;
  return match.oddsDraw ?? 1;
}

/**
 * 🎯 Task 46 — marchés de PUBLICATION (une seule option par leg, cote correspondante):
 *  - football home/away → pari "Victoire ou Nul" (Double Chance, politique VN:
 *    nul = gagné) → cote DC = 1/(1/O_side + 1/O_draw), JAMAIS la cote 1X2 pure;
 *  - football 'draw' → "Match Nul" pur → cote du nul;
 *  - sports US (pas de nul) → victoire pure → cote du côté.
 * Fallback: si la cote du nul manque, la cote 1X2 du côté est conservée
 * (la cote d'origine est toujours préférable à un prix inventé).
 */
export function publishedOddsForResult(match: ComboMatch, result: string): number {
  if (result === 'draw') return match.oddsDraw ?? 1;
  if (comboLegIsVn(match.sport, result)) {
    const side = result === 'home' ? match.oddsHome : match.oddsAway;
    const dc = doubleChanceOdds(side, match.oddsDraw);
    if (dc) return dc;
  }
  return oddsForResult(match, result);
}

/**
 * 🎯 Task 46 — probabilité PUBLIÉE de la sélection (celle qui correspond à la cote):
 *  - VN: p_modèle(côté) + p_nul dévigorisée (le modèle ne publie qu'un côté);
 *  - V / Nul pur: proba modèle du côté, inchangée.
 */
export function publishedProbForResult(match: ComboMatch, result: string): number {
  const sideProb = Math.min(0.97, Math.max(0.02, match.winProbability / 100));
  if (comboLegIsVn(match.sport, result)) {
    const drawP = deviggedDrawProb(match.oddsHome, match.oddsDraw, match.oddsAway);
    if (drawP !== null) return Math.min(0.97, sideProb + drawP);
  }
  return sideProb;
}

const CONFIDENCE_WEIGHT: Record<string, number> = { high: 1.25, medium: 1.0, low: 0.6 };

/**
 * Score composite déterministe d'une value bet:
 *   edge relatif × kelly × confiance. Kelly est déjà proportionnel à
 *   edge/variance — le produit pénalise les edges de faible qualité.
 */
export function compositeScore(m: ComboMatch): number {
  const odds = oddsForResult(m, m.predictedResult);
  if (odds <= 1.01) return 0;
  const impliedProb = 1 / odds;
  const modelProb = Math.min(0.99, Math.max(0.01, m.winProbability / 100));
  // Edge relatif: (model - implied) / implied — comparable entre cotes
  const relativeEdge = (modelProb - impliedProb) / impliedProb;
  const kelly = m._kellyStake && m._kellyStake > 0 ? Math.min(m._kellyStake, 5) : 0.5;
  const conf = CONFIDENCE_WEIGHT[m.confidence] ?? 1.0;
  // Pénalité risque (au-delà de 50% de risque, la variance explose)
  const riskPenalty = m.riskPercentage > 50 ? 0.7 : 1.0;
  return relativeEdge * kelly * conf * riskPenalty;
}

/** Sélection déterministe du combo (2-3 legs) avec diversification */
export function selectComboDeterministic(valueBets: ComboMatch[]): ComboMatch[] | null {
  const eligible = valueBets.filter((m) => m.valueBetDetected);
  if (eligible.length < 2) return null;

  const scored = eligible
    .map((m) => ({ m, score: compositeScore(m) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length < 2) return null;

  const selected: ComboMatch[] = [];
  const usedLeagues = new Set<string>();
  let combinedOdds = 1;
  const MAX_COMBINED_ODDS = 20;
  const MAX_LEGS = 3;

  // 1. Meilleur pick global
  // 2. Diversification: meilleur pick d'une AUTRE ligue si dispo
  // 3. Complément: meilleur pick restant compatible avec le plafond de cote
  for (const phase of [0, 1, 2]) {
    const candidate = scored.find(({ m }) => {
      if (selected.includes(m)) return false;
      const nextOdds = combinedOdds * oddsForResult(m, m.predictedResult);
      if (nextOdds > MAX_COMBINED_ODDS) return false;
      if (phase === 1 && usedLeagues.has(m.league)) return false; // diversification
      return true;
    });
    if (!candidate) continue;
    selected.push(candidate.m);
    usedLeagues.add(candidate.m.league);
    combinedOdds *= oddsForResult(candidate.m, candidate.m.predictedResult);
    if (selected.length >= MAX_LEGS) break;
  }

  return selected.length >= 2 ? selected : null;
}

// ─── LLM narratif (optionnel — fallback déterministe) ───────────────────────

function deterministicName(legs: ComboMatch[], combinedOdds: number): string {
  const sports = new Set(legs.map((l) => l.sport));
  const sportLabel =
    sports.size > 1 ? 'Multi-Sports' :
    sports.has('baseball') ? 'MLB' :
    sports.has('basketball') ? 'Basket' : 'Foot';
  return `${sportLabel} Express x${combinedOdds.toFixed(1)}`.slice(0, 50);
}

function deterministicReasoning(legs: ComboMatch[]): string {
  return legs
    .map((l) => {
      // Task 46: le raisonnement décrit le pari PUBLIÉ (option VN + cote DC)
      const odds = publishedOddsForResult(l, l.predictedResult);
      // FIX Task 15: _mlEdge arrive déjà en points de % (ex: 33.0 pour 33%)
      // depuis mlPrediction.edge = Math.round(bestEdge * 1000) / 10.
      // L'ancien code (l._mlEdge * 100) produisait 3300% — absurde.
      // Garde-fou : si > 100, c'est que la source a déjà multiplié (cohérence défensive).
      const rawEdge = typeof l._mlEdge === 'number' && isFinite(l._mlEdge) ? l._mlEdge : 0;
      const edgePct = rawEdge > 100 ? rawEdge / 100 : rawEdge;
      const edge = edgePct > 0 ? ` (edge +${edgePct.toFixed(1)}%)` : '';
      return `${l.homeTeam} vs ${l.awayTeam} : ${betLabelForResult(l, l.predictedResult)} @${odds.toFixed(2)}${edge}`;
    })
    .join(' · ');
}

async function narrateWithLLM(
  legs: ComboMatch[],
  combinedOdds: number,
): Promise<{ name: string; reasoning: string } | null> {
  try {
    const zai = await ZAI.create();
    const legSummary = legs.map((l) => {
      // Task 46: le LLM reprend les paris PUBLIÉS (option VN + cote DC), pas le 1X2 interne
      const odds = publishedOddsForResult(l, l.predictedResult);
      return `- ${l.homeTeam} vs ${l.awayTeam} (${l.league}) : ${betLabelForResult(l, l.predictedResult)} @${odds.toFixed(2)}`;
    }).join('\n');

    const response = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            'Tu es rédacteur pour un service de pronostics sportifs. On te donne la composition ' +
            'FINALE et DÉFINITIVE d\'un combo. Ta mission est UNIQUEMENT rédactionnelle: ' +
            '1) un nom accrocheur en FRANÇAIS (max 50 caractères) 2) un raisonnement global ' +
            'de 2-3 phrases expliquant la logique du combo. N\'invente AUCUN match ni AUCUNE ' +
            'cote: reprends exactement ceux fournis. Réponds en JSON: {"name":"...","reasoning":"..."}',
        },
        {
          role: 'user',
          content: `Combo à cote combinée ${combinedOdds.toFixed(2)} :\n${legSummary}`,
        },
      ],
      thinking: { type: 'disabled' },
    });

    const raw =
      typeof response === 'string'
        ? response
        : (response as any).choices?.[0]?.message?.content ?? (response as any).content ?? '';

    let jsonStr = raw.trim();
    const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) jsonStr = fence[1].trim();
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed?.name === 'string' && typeof parsed?.reasoning === 'string') {
      return { name: parsed.name.slice(0, 50), reasoning: parsed.reasoning };
    }
    return null;
  } catch {
    return null; // LLM down → fallback déterministe (jamais bloquant)
  }
}

// ─── Point d'entrée (signature inchangée) ───────────────────────────────────

export async function generateComboWithLLM(
  valueBets: ComboMatch[],
): Promise<ComboResult | null> {
  try {
    // 1. SÉLECTION DÉTERMINISTE (le LLM ne choisit plus rien)
    const selected = selectComboDeterministic(valueBets);
    if (!selected) return null;

    const legs = selected.map((m) => {
      const source = m;
      // 🎯 Task 46: la leg publiée porte UNE option + LA cote qui correspond
      const odds = publishedOddsForResult(source, source.predictedResult);
      const betType: 'V' | 'VN' = comboLegIsVn(source.sport, source.predictedResult) ? 'VN'
        : source.predictedResult === 'draw' ? 'VN' : 'V';
      return {
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        sport: m.sport,
        league: m.league,
        predictedResult: m.predictedResult,
        betLabel: betLabelForResult(m, m.predictedResult),
        // Probabilité de la sélection publiée (VN inclut le nul pour le football)
        winProbability: Math.round(publishedProbForResult(m, m.predictedResult) * 1000) / 10,
        odds,
        // Type de pari affiché (transparence: VN = nul compris dans le pari)
        betType,
        // 🎯 FIX Task 45: propager la vraie date du match + les cotes complètes.
        // Avant: legs sans date → le cron sauvegardait match_date placeholder T12:00Z
        // et des cotes à un seul côté (odds_home null si reco=away) → bilan cassé
        // (vérification impossible, devig impossible, double comptage OKC combo+summary).
        date: m.date,
        oddsHome: m.oddsHome,
        oddsDraw: m.oddsDraw,
        oddsAway: m.oddsAway,
        confidence: m.confidence,
        reasoning: (m._mlReasoning ?? []).slice(0, 2).join(' | '),
      };
    });

    // 🎯 Task 46: cote combinée et probabilité = produits des sélections PUBLIÉES
    // (VN pour le football) — cohérents entre eux, donc EV honnête.
    const combinedOdds = legs.reduce((acc, leg) => acc * leg.odds, 1);
    const combinedWinProbability = legs.reduce(
      (acc, leg) => acc * (leg.winProbability / 100),
      1,
    );
    const expectedValue = combinedOdds * combinedWinProbability - 1;

    // 2. NARRATION (LLM best-effort, fallback déterministe)
    const narrative =
      (await narrateWithLLM(selected, combinedOdds)) ?? {
        name: deterministicName(selected, combinedOdds),
        reasoning: deterministicReasoning(selected),
      };

    const riskLevel: 'low' | 'medium' | 'high' =
      combinedOdds <= 4 ? 'low' : combinedOdds <= 10 ? 'medium' : 'high';

    return {
      comboId: generateComboId(),
      name: narrative.name,
      reasoning: narrative.reasoning,
      legs,
      combinedOdds: Math.round(combinedOdds * 100) / 100,
      combinedWinProbability: Math.round(combinedWinProbability * 10000) / 10000,
      riskLevel,
      expectedValue: Math.round(expectedValue * 10000) / 10000,
      publishedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[ComboService] Génération combo échouée:', error);
    return null;
  }
}
