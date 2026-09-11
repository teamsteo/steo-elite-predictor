/**
 * ═══════════════════════════════════════════════════════════════════
 * GÉNÉRATEUR DE COMBINÉS SÛRS — moteur extrait du site (Task 16)
 * ═══════════════════════════════════════════════════════════════════
 * Audit & corrections :
 *
 * ✅ Source de données : inchangée — /api/matches, /api/tennis, /api/mlb
 *    servent le VRAI pipeline ML (getMatchesWithRealOdds + getBatchPredictions).
 *
 * 🔧 FIX 1 (logique) : l'ancien algorithme générait des candidats pour TOUTES
 *    les issues (1/X/2) de chaque match et IGNORAIT predictedResult du modèle.
 *    Un "combiné sûr" pouvait donc contenir le côté OPPOSÉ à la prédiction ML
 *    (ex: model dit "Victoire domicile" mais le combo prenait le pick extérieur).
 *    Désormais : un seul pick par match = celui PRÉDIT par le pipeline ;
 *    fallback = favori du marché (cote la plus basse) si pas de prédiction.
 *
 * 🔧 FIX 2 (tri) : l'ancien comparateur mélangeait des différences d'échelles
 *    incompatibles (safetyScore ~0.2-1.5 vs distance en cotes 0-2.0) →
 *    comparateur non-transitif. Remplacé par un score de classement par combo
 *    : safety (60%) + proximité normalisée de la cote cible (40%).
 *
 * Forme de sortie IDENTIQUE à l'ancienne (UI inchangée) :
 *   pick  = { match, betType, odds, safetyScore, confidence, isValueBet, isLive }
 *   combo = { picks, combinedOdds, avgSafety, distance, riskLevel }
 * ═══════════════════════════════════════════════════════════════════
 */

export interface SafeComboPick {
  match: any;
  betType: 'home' | 'away' | 'draw';
  odds: number;
  safetyScore: number;
  confidence: string;
  isValueBet: boolean;
  isLive: boolean;
}

export interface SafeCombo {
  picks: SafeComboPick[];
  combinedOdds: number;
  avgSafety: number;
  distance: number;
  riskLevel: 'low' | 'medium' | 'high';
  rankScore?: number;
}

export function findBestCombinations(matches: any[], targetOdds: number): SafeCombo[] {
  if (matches.length === 0) return [];

  // ── 1. Construire TOUS les picks possibles avec leur score de sécurité ──
  const allPicks: SafeComboPick[] = [];

  matches.forEach(match => {
    const homeOdds = match.oddsHome || 999;
    const awayOdds = match.oddsAway || 999;
    const drawOdds = match.oddsDraw || 999;

    const confidence = match.insight?.confidence || match.confidence || 'medium';
    const isValueBet = match.insight?.valueBetDetected || match.predictions?.valueBet?.detected || false;

    // Score de sécurité d'un pick (heuristique inchangée)
    const calculateSafetyScore = (odds: number) => {
      let score = 1 / odds; // probabilité implicite

      // Bonus pour haute confiance (le pipeline qualifie le pick prédit)
      if (confidence === 'very_high') score *= 1.4;
      else if (confidence === 'high') score *= 1.2;
      else if (confidence === 'medium') score *= 1.0;
      else score *= 0.7;

      // Bonus pour value bet détecté
      if (isValueBet) score *= 1.15;

      // Bonus pour favori (cote < 2.0)
      if (odds < 1.5) score *= 1.3;
      else if (odds < 2.0) score *= 1.15;
      else if (odds < 2.5) score *= 1.05;
      // Pénalité progressive pour outsiders
      else if (odds > 4.0) score *= 0.7;
      else if (odds > 3.0) score *= 0.85;

      return score;
    };

    // 🔧 FIX 1 : un seul pick par match = celui PRÉDIT par le pipeline ML.
    // predictedResult (/api/matches) ou predictedWinner (tennis/MLB mappés).
    const modelPick: 'home' | 'away' | 'draw' | null =
      match.predictedResult === 'home' || match.predictedResult === 'away' || match.predictedResult === 'draw'
        ? match.predictedResult
        : (match.predictedWinner === 'home' || match.predictedWinner === 'away')
          ? match.predictedWinner
          : null;

    const candidates: Array<{ betType: 'home' | 'away' | 'draw'; odds: number }> = [];
    if (modelPick) {
      const odds = modelPick === 'home' ? homeOdds : modelPick === 'away' ? awayOdds : drawOdds;
      candidates.push({ betType: modelPick, odds });
    } else {
      // Pas de prédiction ML → favori du marché uniquement (esprit "combinés sûrs")
      const options: Array<{ betType: 'home' | 'away' | 'draw'; odds: number }> = [
        { betType: 'home', odds: homeOdds },
        { betType: 'away', odds: awayOdds },
      ];
      if (drawOdds > 1 && drawOdds < 6) options.push({ betType: 'draw', odds: drawOdds });
      const fav = options.filter(o => o.odds > 1 && o.odds < 20).sort((a, b) => a.odds - b.odds)[0];
      if (fav) candidates.push(fav);
    }

    candidates.forEach(({ betType, odds }) => {
      // Gardes-fous d'origine : cotes plausibles, nul limité à < 6
      if (!(odds > 1 && odds < 20)) return;
      if (betType === 'draw' && !(drawOdds > 1 && drawOdds < 6)) return;
      allPicks.push({
        match,
        betType,
        odds,
        safetyScore: calculateSafetyScore(odds),
        confidence,
        isValueBet,
        isLive: match.isLive || false,
      });
    });
  });

  // Trier par score de sécurité décroissant
  allPicks.sort((a, b) => b.safetyScore - a.safetyScore);

  // ── 2. Générer des combinaisons optimisées pour la cote cible ──
  const combinations: SafeCombo[] = [];
  const tolerance = 0.20; // 20% de tolérance

  const topPicks = allPicks.slice(0, 30);

  // 2 picks
  for (let i = 0; i < topPicks.length; i++) {
    for (let j = i + 1; j < topPicks.length; j++) {
      if (topPicks[i].match.id === topPicks[j].match.id) continue;

      const combinedOdds = topPicks[i].odds * topPicks[j].odds;
      if (Math.abs(combinedOdds - targetOdds) <= targetOdds * tolerance) {
        combinations.push({
          picks: [topPicks[i], topPicks[j]],
          combinedOdds,
          avgSafety: (topPicks[i].safetyScore + topPicks[j].safetyScore) / 2,
          distance: Math.abs(combinedOdds - targetOdds),
          riskLevel: topPicks[i].odds > 2.5 || topPicks[j].odds > 2.5 ? 'medium' : 'low',
        });
      }
    }
  }

  // 3 picks si pas assez de résultats ou cote élevée
  if (combinations.length < 5 || targetOdds >= 3.0) {
    for (let i = 0; i < Math.min(topPicks.length, 20); i++) {
      for (let j = i + 1; j < Math.min(topPicks.length, 20); j++) {
        for (let k = j + 1; k < Math.min(topPicks.length, 20); k++) {
          if (topPicks[i].match.id === topPicks[j].match.id ||
              topPicks[i].match.id === topPicks[k].match.id ||
              topPicks[j].match.id === topPicks[k].match.id) continue;

          const combinedOdds = topPicks[i].odds * topPicks[j].odds * topPicks[k].odds;
          if (Math.abs(combinedOdds - targetOdds) <= targetOdds * tolerance) {
            const avgOdds = combinedOdds / 3;
            const riskLevel = avgOdds > 2.5 ? 'high' : avgOdds > 1.8 ? 'medium' : 'low';
            combinations.push({
              picks: [topPicks[i], topPicks[j], topPicks[k]],
              combinedOdds,
              avgSafety: (topPicks[i].safetyScore + topPicks[j].safetyScore + topPicks[k].safetyScore) / 3,
              distance: Math.abs(combinedOdds - targetOdds),
              riskLevel,
            });
          }
        }
      }
    }
  }

  // 4 picks pour les très hautes cotes (5+)
  if ((combinations.length < 3 || targetOdds >= 5.0) && topPicks.length >= 4) {
    for (let i = 0; i < Math.min(topPicks.length, 15); i++) {
      for (let j = i + 1; j < Math.min(topPicks.length, 15); j++) {
        for (let k = j + 1; k < Math.min(topPicks.length, 15); k++) {
          for (let l = k + 1; l < Math.min(topPicks.length, 15); l++) {
            const matchIds = [topPicks[i].match.id, topPicks[j].match.id, topPicks[k].match.id, topPicks[l].match.id];
            if (new Set(matchIds).size < 4) continue;

            const combinedOdds = topPicks[i].odds * topPicks[j].odds * topPicks[k].odds * topPicks[l].odds;
            if (Math.abs(combinedOdds - targetOdds) <= targetOdds * tolerance) {
              combinations.push({
                picks: [topPicks[i], topPicks[j], topPicks[k], topPicks[l]],
                combinedOdds,
                avgSafety: (topPicks[i].safetyScore + topPicks[j].safetyScore + topPicks[k].safetyScore + topPicks[l].safetyScore) / 4,
                distance: Math.abs(combinedOdds - targetOdds),
                riskLevel: 'high',
              });
            }
          }
        }
      }
    }
  }

  // ── 3. 🔧 FIX 2 : tri transitive par score de classement ──
  // sécurité (60%) + proximité normalisée de la cote cible (40%)
  combinations.forEach(c => {
    const proximity = 1 - Math.min(1, c.distance / Math.max(1e-9, targetOdds * tolerance));
    c.rankScore = c.avgSafety * 0.6 + proximity * 0.4;
  });
  combinations.sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0));

  // ── 4. Dédup : une seule combinaison par ensemble de matchs uniques, max 5 ──
  const uniqueCombinations: SafeCombo[] = [];
  const seenMatchSets = new Set<string>();

  for (const combo of combinations) {
    const matchIds = combo.picks.map(p => p.match.id).sort().join('-');

    if (!seenMatchSets.has(matchIds)) {
      seenMatchSets.add(matchIds);
      uniqueCombinations.push(combo);
    }

    if (uniqueCombinations.length >= 5) break;
  }

  return uniqueCombinations;
}
