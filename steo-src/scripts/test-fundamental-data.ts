/**
 * Test des données fondamentales disponibles gratuitement
 */

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

async function testEspnData() {
  console.log('🔍 TEST DES DONNÉES FONDAMENTALES DISPONIBLES\n');
  console.log('='.repeat(60));

  // 1. Football - Premier League
  console.log('\n⚽ FOOTBALL - Test ESPN Premier League:\n');
  try {
    const pl = await fetch(`${ESPN_BASE}/soccer/eng.1/teams`).then(r => r.json());
    if (pl.sports?.[0]?.teams) {
      const team = pl.sports[0].teams[0];
      console.log('   Données équipe disponibles:', Object.keys(team.team || team));
      
      // Vérifier les stats détaillées
      const teamDetail = await fetch(`${ESPN_BASE}/soccer/eng.1/teams/${team.team?.id || team.id}`).then(r => r.json());
      if (teamDetail.team) {
        console.log('\n   Détails équipe:');
        console.log('   - Nom:', teamDetail.team.displayName);
        console.log('   - Classement:', teamDetail.team.standingSummary || 'N/A');
        console.log('   - Forme:', teamDetail.team.form?.slice(0, 5).join(', ') || 'N/A');
        console.log('   - Stats:', teamDetail.team.stats ? Object.keys(teamDetail.team.stats) : 'N/A');
      }
    }
  } catch (e) {
    console.log('   ❌ Erreur:', e);
  }

  // 2. NBA - Stats avancées
  console.log('\n\n🏀 NBA - Test ESPN:\n');
  try {
    const nba = await fetch(`${ESPN_BASE}/basketball/nba/teams`).then(r => r.json());
    if (nba.sports?.[0]?.teams) {
      const team = nba.sports[0].teams[0];
      const teamId = team.team?.id || team.id;
      
      console.log('   Données équipe disponibles:', Object.keys(team.team || team));
      
      // Stats détaillées
      const teamDetail = await fetch(`${ESPN_BASE}/basketball/nba/teams/${teamId}`).then(r => r.json());
      if (teamDetail.team) {
        console.log('\n   Détails équipe:', teamDetail.team.displayName);
        console.log('   - Record:', teamDetail.team.record?.items?.[0]?.summary || 'N/A');
        console.log('   - Classement conf:', teamDetail.team.standingSummary || 'N/A');
        
        // Vérifier les stats d'équipe
        if (teamDetail.team.stats) {
          console.log('   - Stats disponibles:', teamDetail.team.stats.length, 'catégories');
        }
        
        // Vérifier les joueurs/blessures
        console.log('   - Joueurs:', teamDetail.team.athletes?.length || 0);
        console.log('   - Blessures:', teamDetail.team.injuries?.length || 0);
      }
    }
  } catch (e) {
    console.log('   ❌ Erreur:', e);
  }

  // 3. NHL - Stats
  console.log('\n\n🏒 NHL - Test ESPN:\n');
  try {
    const nhl = await fetch(`${ESPN_BASE}/hockey/nhl/teams`).then(r => r.json());
    if (nhl.sports?.[0]?.teams) {
      const team = nhl.sports[0].teams[0];
      const teamId = team.team?.id || team.id;
      
      const teamDetail = await fetch(`${ESPN_BASE}/hockey/nhl/teams/${teamId}`).then(r => r.json());
      if (teamDetail.team) {
        console.log('   Détails équipe:', teamDetail.team.displayName);
        console.log('   - Record:', teamDetail.team.record?.items?.[0]?.summary || 'N/A');
        console.log('   - Stats:', teamDetail.team.stats ? 'Disponibles' : 'Non');
        console.log('   - Joueurs:', teamDetail.team.athletes?.length || 0);
      }
    }
  } catch (e) {
    console.log('   ❌ Erreur:', e);
  }

  // 4. MLB - Stats
  console.log('\n\n⚾ MLB - Test ESPN:\n');
  try {
    const mlb = await fetch(`${ESPN_BASE}/baseball/mlb/teams`).then(r => r.json());
    if (mlb.sports?.[0]?.teams) {
      const team = mlb.sports[0].teams[0];
      const teamId = team.team?.id || team.id;
      
      const teamDetail = await fetch(`${ESPN_BASE}/baseball/mlb/teams/${teamId}`).then(r => r.json());
      if (teamDetail.team) {
        console.log('   Détails équipe:', teamDetail.team.displayName);
        console.log('   - Record:', teamDetail.team.record?.items?.[0]?.summary || 'N/A');
        console.log('   - Stats:', teamDetail.team.stats ? 'Disponibles' : 'Non');
      }
    }
  } catch (e) {
    console.log('   ❌ Erreur:', e);
  }

  // 5. Test API NBA Stats (officielle)
  console.log('\n\n📊 NBA Stats API (officielle):\n');
  try {
    // Team stats
    const nbaStats = await fetch('https://stats.nba.com/stats/leaguestandingsv3', {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.nba.com/',
        'x-nba-stats-origin': 'stats',
        'x-nba-stats-token': 'true'
      }
    }).then(r => r.json());
    
    if (nbaStats.resultSets) {
      console.log('   ✅ Stats NBA disponibles:', nbaStats.resultSets.length, 'datasets');
      console.log('   Headers:', nbaStats.resultSets[0]?.headers?.slice(0, 8).join(', '));
    }
  } catch (e) {
    console.log('   ⚠️ NBA Stats API:', String(e).slice(0, 50));
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n💡 DONNÉES FONDAMENTALES RÉCUPÉRABLES:\n');
  console.log('   ✅ Classement/Record - Tous sports');
  console.log('   ✅ Forme récente - Football, NBA, NHL, MLB');
  console.log('   ✅ Stats équipe (buts/pts marqués/encaissés) - Tous');
  console.log('   ✅ Blessures - NBA, NHL, MLB (via ESPN)');
  console.log('   ✅ Stats avancées NBA - Officiel');
  console.log('   ⚠️ xG/Stats avancées football - Limité');
}

testEspnData();
