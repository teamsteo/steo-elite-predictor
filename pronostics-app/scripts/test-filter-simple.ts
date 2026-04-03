/**
 * Test simple du filtre isToday
 */

const now = new Date();
const todayParis = now.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });

// Simuler les dates de l'API
const apiDate1 = '2026-03-09T15:00:00Z';  // Match Foot aujourd'hui 15h UTC
const apiDate2 = '2026-03-10T00:00:00Z';  // Match NBA demain 00h UTC

// Convertir en heure Paris
const d1 = new Date(apiDate1);
const d2 = new Date(apiDate2);

const date1Paris = d1.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
const date2Paris = d2.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });

console.log('📅 Date du jour (Paris):', todayParis);
console.log('\n📊 Test des dates API:');
console.log('  apiDate1:', apiDate1, '→', date1Paris, date1Paris === todayParis ? '✅ AUJOURD\'HUI' : '❌ PAS AUJOURD\'HUI');
console.log('  apiDate2:', apiDate2, '→', date2Paris, date2Paris === todayParis ? '✅ AUJOURD\'HUI' : '❌ PAS AUJOURD\'HUI');
