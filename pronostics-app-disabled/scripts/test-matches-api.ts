/**
 * Test direct de l'API matches pour voir les matchs réels
 */

async function testMatchesAPI() {
  console.log('🔍 Test de l\'API matches...\n');
  
  try {
    // Test avec refresh
    const response = await fetch('http://localhost:3000/api/matches?refresh=true');
    const data = await response.json();
    
    console.log(`\n📊 Réponse API matches:`);
    console.log(`Status: ${response.status}`);
    
    // Afficher les dates
    const matches = Array.isArray(data) ? data : (data.matches || []);
    console.log(`Nombre de matchs: ${matches.length}`);
    
    if (matches.length > 0) {
      console.log('\n📅 Premier match:');
      console.log(`ID: ${matches[0].id}`);
      console.log(`Teams: ${matches[0].homeTeam} vs ${matches[0].awayTeam}`);
      console.log(`Date: ${matches[0].date}`);
      console.log(`Sport: ${matches[0].sport}`);
      
      // Afficher toutes les dates distinctes
      const dates = [...new Set(matches.map((m: any) => m.date?.split('T')[0]))];
      console.log('\n📆 Dates trouvées:');
      dates.forEach(d => console.log(`  - ${d}`));
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error);
  }
}

testMatchesAPI();
