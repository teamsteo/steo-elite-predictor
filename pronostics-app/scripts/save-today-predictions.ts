/**
 * Sauvegarde manuelle des pronostics du jour
 */

import PredictionStore from '../src/lib/store';

// Récupérer les matchs depuis l'API locale
async function main() {
  console.log('💾 Sauvegarde des pronostics du jour...');
  
  try {
    const response = await fetch('http://localhost:3000/api/matches?refresh=true');
    const data = await response.json();
    const matches = data.matches || [];
    
    console.log(`📊 ${matches.length} matchs récupérés`);
    
    if (matches.length === 0) {
      console.log('⚠️ Aucun match à sauvegarder');
      return;
    }
    
    // Préparer les pronostics
    const predictions = matches.map((m: any) => ({
      matchId: m.id,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      league: m.league,
      sport: m.sport,
      matchDate: m.date,
      oddsHome: m.oddsHome,
      oddsDraw: m.oddsDraw,
      oddsAway: m.oddsAway,
      predictedResult: m.oddsHome < m.oddsAway ? 'home' : 'away',
      predictedGoals: m.goalsPrediction?.prediction || null,
      confidence: m.insight?.confidence || 'medium',
      riskPercentage: m.insight?.riskPercentage || 50
    }));
    
    // Sauvegarder
    const saved = PredictionStore.addMany(predictions);
    console.log(`✅ ${saved} pronostics sauvegardés`);
    
    // Vérifier
    const info = PredictionStore.getInfo();
    console.log(`\n📊 État après sauvegarde:`);
    console.log(`  - Total: ${info.total}`);
    console.log(`  - En attente: ${info.pending}`);
    console.log(`  - Terminés: ${info.completed}`);
    
  } catch (error) {
    console.error('❌ Erreur:', error);
  }
}

main();
