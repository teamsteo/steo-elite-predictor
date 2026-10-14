/**
 * Script manuel pour exécuter les tâches du cron job
 * Usage: npx tsx scripts/run-cron.ts
 */

import PredictionStore from '../src/lib/store';

console.log('🔄 Exécution manuelle du cron job...');
console.log(`📅 Date: ${new Date().toLocaleString('fr-FR')}`);

// 1. Vérifier l'état actuel
const info = PredictionStore.getInfo();
console.log('\n📊 État actuel:');
console.log(`  - Total pronostics: ${info.total}`);
console.log(`  - En attente: ${info.pending}`);
console.log(`  - Terminés: ${info.completed}`);

// 2. Nettoyer les anciennes données (plus de 2 mois)
const cleaned = PredictionStore.cleanup();
console.log(`\n🗑️ Nettoyage: ${cleaned} anciens pronostics supprimés`);

// 3. Vérifier l'intégrité
const integrity = PredictionStore.verifyIntegrity();
console.log(`\n🔒 Intégrité: ${integrity.valid ? 'OK' : 'PROBLÈME'}`);
if (!integrity.valid) {
  console.log(`  - ${integrity.invalidCount} entrées invalides sur ${integrity.total}`);
}

// 4. Afficher les stats
const stats = PredictionStore.getDetailedStats();
console.log('\n📈 Statistiques:');
console.log(`  - Aujourd'hui: ${stats.daily.totalPredictions} pronostics`);
console.log(`    • Résultats: ${stats.daily.results.correct}/${stats.daily.results.total} (${stats.daily.results.rate}%)`);
console.log(`    • Taux global: ${stats.daily.winRate}%`);
console.log(`  - Semaine: ${stats.weekly.totalPredictions} pronostics, ${stats.weekly.winRate}% réussite`);
console.log(`  - Mois: ${stats.monthly.totalPredictions} pronostics, ${stats.monthly.winRate}% réussite`);
console.log(`  - Global: ${stats.overall.totalPredictions} pronostics, ${stats.overall.winRate}% réussite`);

// 5. Afficher les pronostics en attente
const pending = PredictionStore.getPending();
if (pending.length > 0) {
  console.log(`\n⏳ ${pending.length} pronostics en attente de vérification:`);
  pending.slice(0, 5).forEach(p => {
    console.log(`  - ${p.homeTeam} vs ${p.awayTeam} (${p.matchDate})`);
  });
  if (pending.length > 5) {
    console.log(`  ... et ${pending.length - 5} autres`);
  }
}

console.log('\n✅ Cron job terminé avec succès!');
