import { NextResponse } from 'next/server';
import { fetchMatchesWithValidation } from '@/lib/sportsApi';
import { calculateRiskPercentage } from '@/lib/riskCalculator';
import { detectValueBets, identifyTraps } from '@/lib/valueBetDetector';

// Cache pour les insights
let cachedInsights: any[] = [];
let lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

/**
 * GET - Récupérer tous les insights
 */
export async function GET() {
  try {
    const now = Date.now();
    
    if (cachedInsights.length > 0 && (now - lastFetchTime) < CACHE_TTL) {
      return NextResponse.json(cachedInsights);
    }

    const validatedMatches = await fetchMatchesWithValidation();
    
    const insights = validatedMatches.map(({ match, validation }) => {
      const homeRisk = calculateRiskPercentage(match as any, 'home');
      const drawRisk = calculateRiskPercentage(match as any, 'draw');
      const awayRisk = calculateRiskPercentage(match as any, 'away');

      const valueBets = detectValueBets(match as any);
      const trap = identifyTraps(match as any);
      const hasValueBet = valueBets.some(vb => vb.isValueBet);
      const bestValueBet = valueBets.find(vb => vb.isValueBet);

      const minRisk = Math.min(homeRisk, drawRisk, awayRisk);
      
      let confidence: 'low' | 'medium' | 'high';
      if (validation.reliabilityScore >= 80 && minRisk <= 30) {
        confidence = 'high';
      } else if (validation.reliabilityScore >= 50 && minRisk <= 50) {
        confidence = 'medium';
      } else {
        confidence = 'low';
      }

      return {
        matchId: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        sport: match.sport,
        date: match.date,
        oddsHome: match.oddsHome,
        oddsDraw: match.oddsDraw,
        oddsAway: match.oddsAway,
        analysis: generateAnalysis(match, homeRisk, drawRisk, awayRisk, trap, validation),
        riskPercentage: minRisk,
        valueBetDetected: hasValueBet,
        valueBetType: bestValueBet?.betType,
        confidence,
        recommendation: trap.isTrap ? 'avoid' : hasValueBet ? bestValueBet?.betType : 'analyze',
        isCrossValidated: validation.isCrossValidated,
        reliabilityScore: validation.reliabilityScore,
      };
    });

    cachedInsights = insights;
    lastFetchTime = now;

    return NextResponse.json(insights);
  } catch (error) {
    console.error('Erreur insights:', error);
    return NextResponse.json([], { status: 500 });
  }
}

function generateAnalysis(
  match: any,
  homeRisk: number,
  drawRisk: number,
  awayRisk: number,
  trap: any,
  validation: any
): string {
  const favorite = match.oddsHome < match.oddsAway ? match.homeTeam : match.awayTeam;
  const favoriteRisk = match.oddsHome < match.oddsAway ? homeRisk : awayRisk;

  let analysis = `**${match.homeTeam} vs ${match.awayTeam}**\n`;
  analysis += `🏆 Favori: ${favorite} (${100 - favoriteRisk}% confiance)\n`;
  analysis += `📊 Risques: ${homeRisk}% | ${drawRisk}% | ${awayRisk}%\n`;
  analysis += `✅ Fiabilité: ${validation.reliabilityScore}%`;
  
  if (trap.isTrap) {
    analysis += `\n⚠️ ${trap.explanation}`;
  }

  return analysis;
}
