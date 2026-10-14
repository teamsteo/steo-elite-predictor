import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SAFE_THRESHOLD = { minProbability: 65, maxOdds: 2.0 };
const FUN_THRESHOLD = { minProbability: 50, minOdds: 1.4, minValue: 5 };

function classifyPick(pick: {
  confidence: string;
  winProbability: number;
  odds: number;
  value: number;
}): 'safe' | 'fun' | null {
  const { confidence, winProbability, odds, value } = pick;
  
  if ((confidence === 'very_high' || confidence === 'high') &&
      winProbability >= SAFE_THRESHOLD.minProbability &&
      odds <= SAFE_THRESHOLD.maxOdds) {
    return 'safe';
  }
  
  if (winProbability >= FUN_THRESHOLD.minProbability &&
      odds >= FUN_THRESHOLD.minOdds) {
    if (value >= FUN_THRESHOLD.minValue || confidence === 'high' || confidence === 'medium') {
      return 'fun';
    }
  }
  return null;
}

// Load tennis predictions
const tennisData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'tennis-predictions.json'), 'utf-8'));
const picks: any[] = [];

for (const pred of tennisData.predictions) {
  const confidence = pred.prediction?.confidence || 'medium';
  const winProbability = pred.prediction?.winProbability || 60;
  const odds = pred.betting?.winnerOdds || 1.85;
  const expectedValue = pred.betting?.expectedValue || 0;
  const value = expectedValue > 0 ? expectedValue : (winProbability / 100 * odds - 1) * 100;
  
  const type = classifyPick({ confidence, winProbability, odds, value });
  if (!type) continue;
  
  const winner = pred.prediction?.winner;
  const winnerName = winner === 'player1' ? pred.player1 : pred.player2;
  
  picks.push({
    player1: pred.player1,
    player2: pred.player2,
    tournament: pred.tournament,
    odds,
    confidence,
    winProbability,
    value: Math.round(value),
    type,
    winner: winnerName,
    ranking: pred.analysis?.rankingAdvantage
  });
}

console.log('=== PICKS GENERES ===');
console.log('Total:', picks.length);
console.log('Safe:', picks.filter(p => p.type === 'safe').length);
console.log('Fun:', picks.filter(p => p.type === 'fun').length);
console.log('');
console.log('=== TOP 15 PICKS ===');
picks.slice(0, 15).forEach((p, i) => {
  console.log(`${i+1}. ${p.winner} vs ${p.player1 === p.winner ? p.player2 : p.player1}`);
  console.log(`   Tournoi: ${p.tournament} | Cote: ${p.odds} | Prob: ${p.winProbability}%`);
  console.log(`   Type: ${p.type.toUpperCase()} | Classement: ${p.ranking}`);
  console.log('');
});
