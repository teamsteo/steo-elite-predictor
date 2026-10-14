import ZAI from 'z-ai-web-dev-sdk';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ComboMatch {
  homeTeam: string;
  awayTeam: string;
  sport: string; // 'football' or 'basketball'
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

function betLabelForResult(
  match: ComboMatch,
  result: string,
): string {
  const team =
    result === 'home' ? match.homeTeam : result === 'away' ? match.awayTeam : 'Match Nul';
  const verb = result === 'draw' ? '' : 'Victoire ';
  return `${verb}${team}`;
}

function oddsForResult(match: ComboMatch, result: string): number {
  if (result === 'home') return match.oddsHome;
  if (result === 'away') return match.oddsAway;
  return match.oddsDraw ?? 1;
}

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un expert analyste de paris sportifs spécialisé dans les combos (parlay) intelligents. Tu analyses des value bets détectées et tu dois composer le combo le plus malin possible.

RÈGLES STRICTES :
1. Sélectionne 2 ou 3 matchs PARMI les value bets proposés.
2. Tu ne peux utiliser QUE des matchs de football ou de basketball.
3. Pour chaque match, conserve le résultat prédit tel quel — ne change PAS le predictedResult.
4. Privilégie la diversité des sports (mélanger football + basketball est un plus).
5. Évite de combiner des matchs qui se chevauchent trop dans le temps.
6. Le nom du combo doit être accrocheur, max 50 caractères.
7. Le nom doit être en FRANÇAIS.
8. Fournis un raisonnement global ET un raisonnement par sélection.
9. Évalue le niveau de risque global du combo.
10. Si moins de 2 value bets sont disponibles, retourne {"skip": true}.

Tu dois répondre UNIQUEMENT en JSON valide avec cette structure exacte :
{
  "name": "Nom du combo",
  "reasoning": "Explication globale du combo",
  "riskLevel": "low" | "medium" | "high",
  "legs": [
    {
      "homeTeam": "...",
      "awayTeam": "...",
      "sport": "...",
      "league": "...",
      "predictedResult": "home" | "draw" | "away",
      "betLabel": "Victoire Équipe X",
      "winProbability": 65,
      "odds": 1.85,
      "confidence": "high" | "medium" | "low",
      "reasoning": "Pourquoi ce match a été sélectionné"
    }
  ]
}

Ne fais JAMAIS de commentaires en dehors du JSON. Réponds UNIQUEMENT avec du JSON valide.`;

// ─── Main Function ───────────────────────────────────────────────────────────

export async function generateComboWithLLM(
  valueBets: ComboMatch[],
): Promise<ComboResult | null> {
  try {
    // Filter to only value bets in football/basketball
    const eligible = valueBets.filter(
      (m) =>
        m.valueBetDetected &&
        (m.sport === 'football' || m.sport === 'basketball'),
    );

    if (eligible.length < 2) {
      return null;
    }

    // Build user message with match data
    const matchData = eligible.map((m, i) => ({
      index: i,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      sport: m.sport,
      league: m.league,
      predictedResult: m.predictedResult,
      winProbability: m.winProbability,
      oddsHome: m.oddsHome,
      oddsAway: m.oddsAway,
      oddsDraw: m.oddsDraw,
      riskPercentage: m.riskPercentage,
      valueBetType: m.valueBetType,
      confidence: m.confidence,
      date: m.date,
      mlEdge: m._mlEdge ?? null,
      kellyStake: m._kellyStake ?? null,
      mlReasoning: m._mlReasoning ?? [],
    }));

    const userMessage = `Voici les value bets disponibles aujourd'hui. Analyse-les et compose le meilleur combo de 2-3 matchs :

${JSON.stringify(matchData, null, 2)}`;

    // Call LLM via z-ai-web-dev-sdk
    const zai = await ZAI.create();
    const response = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      thinking: { type: 'disabled' },
    });

    // Extract text from response
    const raw =
      typeof response === 'string'
        ? response
        : (response as any).choices?.[0]?.message?.content ??
          (response as any).content ??
          JSON.stringify(response);

    // Parse JSON — try to extract from potential markdown code blocks
    let jsonStr = raw.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    // Handle skip signal
    const parsed = JSON.parse(jsonStr);
    if (parsed.skip === true) {
      return null;
    }

    // Validate legs exist
    if (!Array.isArray(parsed.legs) || parsed.legs.length < 2 || parsed.legs.length > 3) {
      return null;
    }

    // Enrich legs with computed values and resolve from source data
    const legs = parsed.legs.map((leg: any) => {
      const source = eligible.find(
        (m) =>
          m.homeTeam === leg.homeTeam &&
          m.awayTeam === leg.awayTeam &&
          m.league === leg.league,
      );

      // Prefer source data for accuracy, fall back to LLM output
      const predictedResult = source?.predictedResult ?? leg.predictedResult;
      const winProbability = source?.winProbability ?? leg.winProbability;
      const odds = source
        ? oddsForResult(source, predictedResult)
        : leg.odds;
      const confidence = source?.confidence ?? leg.confidence;
      const betLabel = source
        ? betLabelForResult(source, predictedResult)
        : leg.betLabel;

      return {
        homeTeam: leg.homeTeam,
        awayTeam: leg.awayTeam,
        sport: leg.sport,
        league: leg.league,
        predictedResult,
        betLabel,
        winProbability,
        odds,
        confidence,
        reasoning: leg.reasoning ?? '',
      };
    });

    // Compute derived metrics
    const combinedOdds = legs.reduce((acc: number, leg: any) => acc * leg.odds, 1);
    const combinedWinProbability = legs.reduce(
      (acc: number, leg: any) => acc * (leg.winProbability / 100),
      1,
    );
    const expectedValue = combinedOdds * combinedWinProbability - 1;

    const result: ComboResult = {
      comboId: generateComboId(),
      name: (parsed.name ?? 'Combo Smart Bet').slice(0, 50),
      reasoning: parsed.reasoning ?? '',
      legs,
      combinedOdds: Math.round(combinedOdds * 100) / 100,
      combinedWinProbability:
        Math.round(combinedWinProbability * 10000) / 10000,
      riskLevel: ['low', 'medium', 'high'].includes(parsed.riskLevel)
        ? parsed.riskLevel
        : 'medium',
      expectedValue: Math.round(expectedValue * 10000) / 10000,
      publishedAt: new Date().toISOString(),
    };

    return result;
  } catch (error) {
    console.error('[ComboService] LLM combo generation failed:', error);
    return null;
  }
}
