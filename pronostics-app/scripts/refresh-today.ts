/**
 * Script pour rafraîchir les données du jour
 * 1. Nettoie les anciens pronostics
 * 2. Récupère les matchs d'aujourd'hui
 */

import PredictionStore from '../src/lib/store';
import fs from 'fs';
import path from 'path';

console.log('🔄 Rafraîchissement des données du jour...');
console.log(`📅 Date: ${new Date().toLocaleString('fr-FR')}`);

// 1. Réinitialiser le store (supprimer tout)
console.log('\n🗑️ Suppression des anciens pronostics...');
const cleared = PredictionStore.clearAll();
console.log(`  ✅ Données supprimées: ${cleared ? 'OK' : 'ERREUR'}`);

// 2. Vérifier que le fichier est propre
const info = PredictionStore.getInfo();
console.log(`\n📊 État après nettoyage:`);
console.log(`  - Total: ${info.total}`);
console.log(`  - En attente: ${info.pending}`);
console.log(`  - Terminés: ${info.completed}`);

// 3. Créer le répertoire data s'il n'existe pas
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`\n📁 Répertoire data créé: ${dataDir}`);
}

// 4. Forcer le refresh des matchs (via l'API)
console.log('\n🔄 Pour rafraîchir les matchs, le serveur doit être démarré.');
console.log('   Lancez: bun run dev');
console.log('   Puis appelez: curl http://localhost:3000/api/matches?refresh=true');

console.log('\n✅ Script terminé!');
