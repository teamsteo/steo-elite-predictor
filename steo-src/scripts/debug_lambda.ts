/** Debug : lambdas estimés depuis les cotes + étapes du shrinkage */
import { estimatePreMatchFromOdds, fullMatchProbs, devig } from './manual_prono';

const odds = { home: 1.95, draw: 3.60, away: 4.00, over_2_5: 1.80, under_2_5: 2.05 };
const pm = estimatePreMatchFromOdds(odds);
console.log('lambdas estimés :', pm.lambda_home.toFixed(3), pm.lambda_away.toFixed(3));
console.log('probs modèle    :', JSON.stringify(pm.predicted_outcome_probs));
console.log('probs cotes dévig :', devig([odds.home, odds.draw, odds.away]).map(p => p.toFixed(3)));

// Shrinkage manuel : routine Arsenal = 0.91 - 0.56 = 0.35
const routine = 0.35, L = pm.lambda_home, minutes = 45, alpha = 2.0, beta = 0.6;
const priorRate = L / 90;
const prior = alpha * priorRate * minutes;
const obs = beta * routine;
console.log(`\nshrinkage manuel : prior=${prior.toFixed(3)} obs=${obs.toFixed(3)} → ${(prior + obs) / (alpha + beta)}`);
