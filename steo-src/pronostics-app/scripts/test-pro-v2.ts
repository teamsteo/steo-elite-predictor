/**
 * Test du Pronostiqueur Pro v2.0 avec seuils stricts
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

// Seuils STRICTS
const SAFE_THRESHOLD = {
  minProbability: 70,
  maxOdds: 1.80
};

const FUN_THRESHOLD = {
  minProbability: 55,
  minOdds: 1.40,
  minValue: 10
};

function classifyPick(
  winProbability: number,
  odds: number,
  confidence: string,
  value: number
): 'safe' | 'fun' | null {
  
  // SAFE: Critères STRICTS
  if (winProbability >= SAFE_THRESHOLD.minProbability &&
      odds <= SAFE_THRESHOLD.maxOdds &&
      (confidence === 'high' || confidence === 'very_high')) {
    return 'safe';
  }
  
  // FUN: Valeur positive
  if (winProbability >= FUN_THRESHOLD.minProbability &&
      odds >= FUN_THRESHOLD.minOdds &&
      value >= FUN_THRESHOLD.minValue) {
    return 'fun';
  }
  
  return null;
}

// Charger les classements tennis
function loadTennisRankings(): Map<string, { rank: number; name: string; points: number }> {
  const rankingsMap = new Map();
  
  try {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'tennis-rankings.json'), 'utf-8'));
    
    for (const player of data.atp || []) {
      const normalizedName = player.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
      rankingsMap.set(normalizedName, player);
      const lastName = player.name.split(' ').pop()?.toLowerCase() || '';
      if (lastName) rankingsMap.set(lastName, player);
    }
    
    for (const player of data.wta || []) {
      const normalizedName = player.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
      rankingsMap.set(normalizedName, player);
      const lastName = player.name.split(' ').pop()?.toLowerCase() || '';
      if (lastName) rankingsMap.set(lastName, player);
    }
    
    console.log(`📊 Classements: ${rankingsMap.size} joueurs`);
  } catch (e) {
    console.log('❌ Erreur chargement classements');
  }
  
  return rankingsMap;
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              PRONOSTIQUEUR PRO v2.0 - SEUILS STRICTS                          ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
  console.log('║  SAFE: Prob ≥ 70% + Cote ≤ 1.80 + Confiance HIGH                              ║');
  console.log('║  FUN:  Prob ≥ 55% + Cote ≥ 1.40 + Valeur ≥ 10%                                ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  const rankingsMap = loadTennisRankings();
  
  // Charger tennis
  const tennisData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'tennis-predictions.json'), 'utf-8'));
  const tennisPredictions = tennisData.predictions || [];
  
  // Charger expert advices
  const expertData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'expert-advices.json'), 'utf-8'));
  const expertAdvices = expertData.advices || [];
  
  console.log(`📊 Données: ${tennisPredictions.length} tennis, ${expertAdvices.length} expert\n`);
  
  const allPicks: any[] = [];
  
  // ==========================================
  // TRAITER TENNIS
  // ==========================================
  console.log('🎾 ANALYSE TENNIS');
  console.log('─'.repeat(60));
  
  for (const pred of tennisPredictions) {
    const confidence = pred.prediction?.confidence || 'medium';
    const baseProbability = pred.prediction?.winProbability || 60;
    const odds = pred.betting?.winnerOdds || 1.85;
    
    // Recalculer la probabilité avec le modèle ML amélioré
    let winProbability = baseProbability;
    
    // Trouver les classements
    const p1Name = pred.player1;
    const p2Name = pred.player2;
    const p1Norm = p1Name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    const p2Norm = p2Name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    const p1LastName = p1Name.split(' ').pop()?.toLowerCase() || '';
    const p2LastName = p2Name.split(' ').pop()?.toLowerCase() || '';
    
    const ranking1 = rankingsMap.get(p1Norm) || rankingsMap.get(p1LastName);
    const ranking2 = rankingsMap.get(p2Norm) || rankingsMap.get(p2LastName);
    
    // Améliorer la probabilité si on a les classements
    if (ranking1 && ranking2) {
      const rankDiff = ranking2.rank - ranking1.rank;
      if (rankDiff > 100) winProbability = Math.min(85, baseProbability + 10);
      else if (rankDiff > 50) winProbability = Math.min(82, baseProbability + 5);
      else if (rankDiff > 20) winProbability = Math.min(78, baseProbability + 3);
      else if (rankDiff < -100) winProbability = Math.max(45, baseProbability - 10);
      else if (rankDiff < -50) winProbability = Math.max(50, baseProbability - 5);
    } else if (ranking1 && !ranking2) {
      winProbability = Math.min(78, baseProbability + 5);
    } else if (!ranking1 && ranking2) {
      winProbability = Math.max(52, baseProbability - 5);
    }
    
    const value = Math.round((winProbability / 100 * odds - 1) * 100);
    
    const type = classifyPick(winProbability, odds, confidence, value);
    
    const winner = pred.prediction?.winner;
    const winnerName = winner === 'player1' ? pred.player1 : pred.player2;
    
    allPicks.push({
      sport: 'tennis',
      match: `${pred.player1} vs ${pred.player2}`,
      pick: winnerName,
      tournament: pred.tournament,
      odds,
      probability: winProbability,
      confidence,
      value,
      type,
      ranking: ranking1 && ranking2 ? `#${ranking1.rank} vs #${ranking2.rank}` : 
               ranking1 ? `#${ranking1.rank} classé` : 
               ranking2 ? `#${ranking2.rank} classé` : 'N/A'
    });
  }
  
  // ==========================================
  // TRAITER EXPERT ADVICES
  // ==========================================
  console.log('\n⚽🏀 ANALYSE FOOTBALL/BASKET');
  console.log('─'.repeat(60));
  
  for (const advice of expertAdvices) {
    if (!advice.recommendation?.bet || advice.recommendation.bet === 'avoid') continue;
    
    const sport = advice.sport?.toLowerCase().includes('basket') ? 'basketball' : 'football';
    const confidence = advice.recommendation.confidence || 'low';
    
    // Ignorer les low confidence
    if (confidence === 'low') continue;
    
    const odds = advice.oddsAnalysis?.favoriteOdds || 1.85;
    
    // Calculer probabilité basée sur l'edge
    const edge = advice.oddsAnalysis?.edge || 0;
    let winProbability = 50;
    if (edge >= 20) winProbability = 68;
    else if (edge >= 15) winProbability = 62;
    else if (edge >= 10) winProbability = 58;
    else winProbability = 55;
    
    const value = Math.round((winProbability / 100 * odds - 1) * 100);
    
    const type = classifyPick(winProbability, odds, confidence, value);
    
    const team = advice.recommendation.bet === 'home' ? advice.homeTeam : advice.awayTeam;
    
    allPicks.push({
      sport,
      match: `${advice.homeTeam} vs ${advice.awayTeam}`,
      pick: team,
      tournament: advice.league,
      odds,
      probability: winProbability,
      confidence,
      value,
      type,
      ranking: 'N/A'
    });
  }
  
  // ==========================================
  // AFFICHER LES RÉSULTATS
  // ==========================================
  
  const safePicks = allPicks.filter(p => p.type === 'safe');
  const funPicks = allPicks.filter(p => p.type === 'fun');
  
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           RÉSULTATS                                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📊 TOTAL: ${allPicks.length} picks analysés`);
  console.log(`   ├─ 🛡️ SAFE: ${safePicks.length}`);
  console.log(`   └─ 🎯 FUN:  ${funPicks.length}`);
  console.log('');
  
  if (safePicks.length > 0) {
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║  🛡️ PICKS SAFE (Prob ≥ 70%, Cote ≤ 1.80, Confiance HIGH)                     ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    console.log('');
    
    safePicks.forEach((p, i) => {
      console.log(`${i + 1}. ${p.match}`);
      console.log(`   📍 ${p.tournament || 'N/A'}`);
      console.log(`   💰 Cote: ${p.odds} | Prob: ${p.probability}% | Valeur: ${p.value >= 0 ? '+' : ''}${p.value}%`);
      console.log(`   🎖️ Confiance: ${p.confidence.toUpperCase()}`);
      console.log(`   🏆 Classement: ${p.ranking}`);
      console.log('');
    });
  }
  
  if (funPicks.length > 0) {
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║  🎯 PICKS FUN (Valeur ≥ 10%, Prob ≥ 55%)                                     ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    console.log('');
    
    funPicks.slice(0, 10).forEach((p, i) => {
      console.log(`${i + 1}. ${p.match}`);
      console.log(`   📍 ${p.tournament || 'N/A'}`);
      console.log(`   💰 Cote: ${p.odds} | Prob: ${p.probability}% | Valeur: ${p.value >= 0 ? '+' : ''}${p.value}%`);
      console.log(`   🎖️ Confiance: ${p.confidence.toUpperCase()}`);
      console.log('');
    });
    
    if (funPicks.length > 10) {
      console.log(`   ... et ${funPicks.length - 10} autres picks FUN`);
    }
  }
  
  // ==========================================
  // COMBINAISONS POSSIBLES
  // ==========================================
  
  if (safePicks.length >= 2) {
    const comboSafe = safePicks.slice(0, 3);
    const combinedOdds = comboSafe.reduce((a: number, p: any) => a * p.odds, 1);
    
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║  🔗 COMBINAISON SAFE PROPOSÉE                                                ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    console.log('');
    
    comboSafe.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.pick} @ ${p.odds} (${p.sport})`);
    });
    
    console.log(``);
    console.log(`   📊 Cote combinée: ${combinedOdds.toFixed(2)}`);
    console.log(`   💵 Mise: 10€ → Gain potentiel: ${(10 * combinedOdds).toFixed(2)}€`);
    console.log('');
  }
  
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  ✅ Seuils stricts appliqués - Qualité privilégiée sur quantité              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
}

main().catch(console.error);
