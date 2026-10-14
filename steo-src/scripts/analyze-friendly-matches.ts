/**
 * Analyse des matchs amicaux internationaux du 2 juin 2026
 * Source: ESPN API
 */

interface FriendlyMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  venue: string;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  homeForm: string;
  awayForm: string;
  fifaRankingHome: number;
  fifaRankingAway: number;
}

interface AnalysisResult {
  match: FriendlyMatch;
  prediction: {
    outcome: 'home' | 'draw' | 'away';
    homeWinProb: number;
    drawProb: number;
    awayWinProb: number;
    confidence: 'high' | 'medium' | 'low';
  };
  valueBet: {
    exists: boolean;
    bet: string;
    odds: number;
    impliedProb: number;
    ourProb: number;
    valueGap: number;
  };
  factors: string[];
  warning: string;
}

// Classements FIFA approximatifs
const FIFA_RANKINGS: Record<string, number> = {
  'Croatia': 12,
  'Belgium': 6,
  'Georgia': 70,
  'Romania': 45,
  'Morocco': 14,
  'Madagascar': 105,
  'Wales': 40,
  'Ghana': 55,
  'Haiti': 85,
  'New Zealand': 95,
};

// Matchs amicaux du 2 juin 2026
const MATCHES: FriendlyMatch[] = [
  {
    id: '401856361',
    homeTeam: 'Croatia',
    awayTeam: 'Belgium',
    date: '2026-06-02T16:00Z',
    venue: 'Stadion HNK Rijeka, Croatie',
    homeOdds: 2.70, // +170
    drawOdds: 3.25, // +225
    awayOdds: 2.65, // +165
    homeForm: 'LWWWW',
    awayForm: 'DWWDW',
    fifaRankingHome: 12,
    fifaRankingAway: 6,
  },
  {
    id: '401865145',
    homeTeam: 'Georgia',
    awayTeam: 'Romania',
    date: '2026-06-02T17:00Z',
    venue: 'Mikheil Meskhi Stadioni, Tbilisi',
    homeOdds: 2.20, // +120
    drawOdds: 3.25, // +225
    awayOdds: 3.40, // +240
    homeForm: 'WDLLL',
    awayForm: 'LLWLW',
    fifaRankingHome: 70,
    fifaRankingAway: 45,
  },
  {
    id: '401872680',
    homeTeam: 'Morocco',
    awayTeam: 'Madagascar',
    date: '2026-06-02T17:00Z',
    venue: 'Stade Prince Moulay Abdallah, Rabat',
    homeOdds: 1.09, // -1100
    drawOdds: 10.5, // +950
    awayOdds: 23.0, // +2200
    homeForm: 'WWDLW',
    awayForm: 'WWLWW',
    fifaRankingHome: 14,
    fifaRankingAway: 105,
  },
  {
    id: '401863573',
    homeTeam: 'Wales',
    awayTeam: 'Ghana',
    date: '2026-06-02T18:45Z',
    venue: 'Cardiff City Stadium, Cardiff',
    homeOdds: 2.35, // +135
    drawOdds: 3.15, // +215
    awayOdds: 3.20, // +220
    homeForm: 'DLWWL',
    awayForm: 'LLLLL',
    fifaRankingHome: 40,
    fifaRankingAway: 55,
  },
  {
    id: '401871830',
    homeTeam: 'Haiti',
    awayTeam: 'New Zealand',
    date: '2026-06-03T00:00Z',
    venue: 'Chase Stadium, Fort Lauderdale (USA)',
    homeOdds: 2.95, // +195
    drawOdds: 3.20, // +220
    awayOdds: 2.45, // +145
    homeForm: 'DLWWL',
    awayForm: 'WLLLD',
    fifaRankingHome: 85,
    fifaRankingAway: 95,
  },
];

function analyzeForm(form: string): number {
  const formMap: Record<string, number> = { 'W': 3, 'D': 1, 'L': 0 };
  let score = 0;
  for (const result of form) {
    score += formMap[result] || 0;
  }
  return score / (form.length * 3); // Normalisé 0-1
}

function calculateProbabilities(match: FriendlyMatch): { home: number; draw: number; away: number } {
  // Facteur classement FIFA
  const rankingDiff = match.fifaRankingAway - match.fifaRankingHome;
  const rankingFactor = Math.tanh(rankingDiff / 30) * 0.3;

  // Facteur forme
  const homeFormScore = analyzeForm(match.homeForm);
  const awayFormScore = analyzeForm(match.awayForm);
  const formFactor = (homeFormScore - awayFormScore) * 0.25;

  // Facteur domicile
  const homeFactor = 0.10;

  // Score total (-1 à 1)
  const totalScore = rankingFactor + formFactor + homeFactor;

  // Conversion en probabilités
  const baseHome = 0.35;
  const baseDraw = 0.30;
  const baseAway = 0.35;

  const home = Math.max(0.10, Math.min(0.85, baseHome + totalScore));
  const away = Math.max(0.10, Math.min(0.85, baseAway - totalScore));
  const draw = Math.max(0.15, Math.min(0.40, baseDraw - Math.abs(totalScore) * 0.2));

  // Normaliser
  const total = home + draw + away;
  return {
    home: home / total,
    draw: draw / total,
    away: away / total,
  };
}

function analyzeMatch(match: FriendlyMatch): AnalysisResult {
  const probs = calculateProbabilities(match);
  
  // Déterminer la prédiction
  let outcome: 'home' | 'draw' | 'away';
  if (probs.home > probs.draw && probs.home > probs.away) {
    outcome = 'home';
  } else if (probs.away > probs.home && probs.away > probs.draw) {
    outcome = 'away';
  } else {
    outcome = 'draw';
  }

  const maxProb = Math.max(probs.home, probs.draw, probs.away);
  const confidence: 'high' | 'medium' | 'low' = maxProb > 0.45 ? 'high' : maxProb > 0.38 ? 'medium' : 'low';

  // Value bets
  const impliedProbs = {
    home: 1 / match.homeOdds,
    draw: 1 / match.drawOdds,
    away: 1 / match.awayOdds,
  };

  const valueGaps = {
    home: probs.home - impliedProbs.home,
    draw: probs.draw - impliedProbs.draw,
    away: probs.away - impliedProbs.away,
  };

  const maxValueGap = Math.max(valueGaps.home, valueGaps.draw, valueGaps.away);
  const bestBet = valueGaps.home === maxValueGap ? 'home' : 
                  valueGaps.draw === maxValueGap ? 'draw' : 'away';

  const factors: string[] = [];
  
  // Analyse classement
  if (match.fifaRankingHome < match.fifaRankingAway - 20) {
    factors.push(`📊 ${match.homeTeam} mieux classé FIFA (#${match.fifaRankingHome} vs #${match.fifaRankingAway})`);
  } else if (match.fifaRankingAway < match.fifaRankingHome - 20) {
    factors.push(`📊 ${match.awayTeam} mieux classé FIFA (#${match.fifaRankingAway} vs #${match.fifaRankingHome})`);
  }

  // Analyse forme
  const homeFormScore = analyzeForm(match.homeForm);
  const awayFormScore = analyzeForm(match.awayForm);
  if (homeFormScore > awayFormScore + 0.2) {
    factors.push(`🔥 ${match.homeTeam} en meilleure forme (${match.homeForm})`);
  } else if (awayFormScore > homeFormScore + 0.2) {
    factors.push(`🔥 ${match.awayTeam} en meilleure forme (${match.awayForm})`);
  }

  // Avantage domicile
  if (match.venue.includes(match.homeTeam) || match.venue.includes('Cardiff') || match.venue.includes('Rabat') || match.venue.includes('Tbilisi') || match.venue.includes('Rijeka')) {
    factors.push(`🏠 ${match.homeTeam} joue à domicile`);
  }

  return {
    match,
    prediction: {
      outcome,
      homeWinProb: probs.home,
      drawProb: probs.draw,
      awayWinProb: probs.away,
      confidence,
    },
    valueBet: {
      exists: maxValueGap > 0.03,
      bet: bestBet === 'home' ? `Victoire ${match.homeTeam}` :
           bestBet === 'draw' ? 'Match nul' : `Victoire ${match.awayTeam}`,
      odds: bestBet === 'home' ? match.homeOdds :
            bestBet === 'draw' ? match.drawOdds : match.awayOdds,
      impliedProb: impliedProbs[bestBet],
      ourProb: probs[bestBet],
      valueGap: maxValueGap,
    },
    factors,
    warning: '⚠️ Match amical - résultats moins prévisibles, attention à la motivation des équipes',
  };
}

// Analyse tous les matchs
console.log('═══════════════════════════════════════════════════════════════');
console.log('  🏆 MATCHS AMICAUX INTERNATIONAUX - 2 JUIN 2026');
console.log('═══════════════════════════════════════════════════════════════\n');

const analyses = MATCHES.map(analyzeMatch);

// Afficher les résultats
for (const analysis of analyses) {
  const { match, prediction, valueBet, factors, warning } = analysis;
  
  console.log(`\n⚽ ${match.homeTeam} vs ${match.awayTeam}`);
  console.log(`📍 ${match.venue}`);
  console.log(`📅 ${new Date(match.date).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`);
  console.log(`\n📈 COTES:`);
  console.log(`   ${match.homeTeam}: ${match.homeOdds.toFixed(2)} | Nul: ${match.drawOdds.toFixed(2)} | ${match.awayTeam}: ${match.awayOdds.toFixed(2)}`);
  
  console.log(`\n🎯 PRÉDICTION: ${prediction.outcome === 'home' ? match.homeTeam : prediction.outcome === 'away' ? match.awayTeam : 'Match nul'}`);
  console.log(`   Confiance: ${prediction.confidence.toUpperCase()}`);
  console.log(`   Probabilités: ${match.homeTeam} ${(prediction.homeWinProb * 100).toFixed(1)}% | Nul ${(prediction.drawProb * 100).toFixed(1)}% | ${match.awayTeam} ${(prediction.awayWinProb * 100).toFixed(1)}%`);
  
  if (factors.length > 0) {
    console.log(`\n📋 FACTEURS:`);
    factors.forEach(f => console.log(`   ${f}`));
  }
  
  if (valueBet.exists) {
    console.log(`\n💰 VALUE BET: ${valueBet.bet} @ ${valueBet.odds.toFixed(2)}`);
    console.log(`   Notre proba: ${(valueBet.ourProb * 100).toFixed(1)}% vs Bookmaker: ${(valueBet.impliedProb * 100).toFixed(1)}%`);
    console.log(`   Value Gap: +${(valueBet.valueGap * 100).toFixed(1)}%`);
  }
  
  console.log(`\n${warning}`);
  console.log('\n───────────────────────────────────────────────────────────────');
}

// Résumé des value bets
console.log('\n\n═══════════════════════════════════════════════════════════════');
console.log('  💰 RÉSUMÉ DES VALUE BETS');
console.log('═══════════════════════════════════════════════════════════════\n');

const valueBets = analyses.filter(a => a.valueBet.exists);
if (valueBets.length > 0) {
  valueBets.forEach(vb => {
    console.log(`✅ ${vb.match.homeTeam} vs ${vb.match.awayTeam}: ${vb.valueBet.bet} @ ${vb.valueBet.odds.toFixed(2)} (Value: +${(vb.valueBet.valueGap * 100).toFixed(1)}%)`);
  });
} else {
  console.log('❌ Aucun value bet significatif détecté');
}

// Top pronostics
console.log('\n\n═══════════════════════════════════════════════════════════════');
console.log('  🏆 TOP PRONOSTICS DU JOUR');
console.log('═══════════════════════════════════════════════════════════════\n');

const sortedByConfidence = [...analyses].sort((a, b) => {
  const confOrder = { 'high': 3, 'medium': 2, 'low': 1 };
  return confOrder[b.prediction.confidence] - confOrder[a.prediction.confidence];
});

sortedByConfidence.forEach((analysis, index) => {
  const { match, prediction } = analysis;
  const pred = prediction.outcome === 'home' ? match.homeTeam : 
               prediction.outcome === 'away' ? match.awayTeam : 'Nul';
  const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
  console.log(`${emoji} ${match.homeTeam} vs ${match.awayTeam}: ${pred} (${prediction.confidence.toUpperCase()})`);
});

console.log('\n');
