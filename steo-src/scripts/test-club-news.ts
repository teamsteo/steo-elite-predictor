/**
 * Test des sources d'actualités club (coach, faillite, transferts)
 * Objectif: Récupérer automatiquement les infos de gestion
 */

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

async function testClubNews() {
  console.log('🔍 TEST DES SOURCES D\'ACTUALITÉS CLUB\n');
  console.log('='.repeat(60));

  // 1. ESPN News par équipe
  console.log('\n📰 ESPN - Actualités par équipe:\n');
  try {
    // Test avec Manchester United
    const teamNews = await fetch(`${ESPN_BASE}/soccer/eng.1/news`).then(r => r.json());
    if (teamNews.articles || teamNews.items) {
      const articles = teamNews.articles || teamNews.items || [];
      console.log(`   ✅ ${articles.length} articles trouvés`);
      if (articles[0]) {
        console.log('   Exemple:', articles[0].headline || articles[0].title);
        console.log('   Source:', articles[0].source || 'ESPN');
        console.log('   Type:', articles[0].type || 'N/A');
      }
    }
  } catch (e) {
    console.log('   ⚠️ Erreur:', String(e).slice(0, 50));
  }

  // 2. ESPN Team Notes
  console.log('\n\n📝 ESPN - Notes équipe (blessures, news):\n');
  try {
    const teamDetail = await fetch(`${ESPN_BASE}/soccer/eng.1/teams/360`).then(r => r.json());
    if (teamDetail.team) {
      console.log('   Équipe:', teamDetail.team.displayName);
      console.log('   Note:', teamDetail.team.note || 'N/A');
      console.log('   Status:', teamDetail.team.status?.type || 'N/A');
      console.log('   Blessures:', teamDetail.team.injuries?.length || 0);
      console.log('   News:', teamDetail.team.news?.length || 0);
      
      // Vérifier les champs disponibles
      const keys = Object.keys(teamDetail.team);
      console.log('\n   Champs disponibles:', keys.filter(k => 
        k.includes('coach') || k.includes('manager') || k.includes('news') || 
        k.includes('note') || k.includes('status') || k.includes('injury')
      ).join(', '));
    }
  } catch (e) {
    console.log('   ⚠️ Erreur:', String(e).slice(0, 50));
  }

  // 3. Basketball - NBA (plus de détails)
  console.log('\n\n🏀 NBA - Détails équipe:\n');
  try {
    const nbaTeam = await fetch(`${ESPN_BASE}/basketball/nba/teams/13`).then(r => r.json());
    if (nbaTeam.team) {
      console.log('   Équipe:', nbaTeam.team.displayName);
      console.log('   Coach:', nbaTeam.team.coaches?.[0]?.fullName || 'N/A');
      console.log('   Status franchise:', nbaTeam.team.franchise?.status || 'N/A');
      
      const keys = Object.keys(nbaTeam.team);
      console.log('\n   Infos gestion disponibles:', keys.filter(k => 
        k.includes('coach') || k.includes('manager') || k.includes('owner') || 
        k.includes('franchise') || k.includes('status')
      ).join(', '));
    }
  } catch (e) {
    console.log('   ⚠️ Erreur:', String(e).slice(0, 50));
  }

  // 4. Test TheSportsDB (open database)
  console.log('\n\n📚 TheSportsDB (base gratuite):\n');
  try {
    // Recherche équipe
    const search = await fetch('https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=Arsenal').then(r => r.json());
    if (search.teams) {
      const team = search.teams[0];
      console.log('   Équipe:', team.strTeam);
      console.log('   Manager:', team.strManager || 'N/A');
      console.log('   Stade:', team.strStadium);
      console.log('   Capacité:', team.intStadiumCapacity);
      console.log('   Fondé:', team.intFormedYear);
      console.log('   Description:', team.strDescriptionEN?.slice(0, 100) + '...');
      
      console.log('\n   Champs clés:', Object.keys(team).filter(k => 
        k.includes('Manager') || k.includes('Coach') || k.includes('Owner') || 
        k.includes('Status') || k.includes('Formed')
      ).join(', '));
    }
  } catch (e) {
    console.log('   ⚠️ Erreur:', String(e).slice(0, 50));
  }

  // 5. Football-Data.org (stats européennes)
  console.log('\n\n⚽ Football-Data.org:\n');
  try {
    const fd = await fetch('https://api.football-data.org/v4/teams/57', {
      headers: { 'X-Auth-Token': 'demo' } // Token demo limité
    }).then(r => r.json());
    
    if (fd.name) {
      console.log('   Équipe:', fd.name);
      console.log('   Coach:', fd.coach?.name || 'N/A');
      console.log('   Fondé:', fd.founded);
      console.log('   Venue:', fd.venue);
      console.log('   Squad:', fd.squad?.length || 0, 'joueurs');
      console.log('   Running competitions:', fd.runningCompetitions?.length || 0);
    }
  } catch (e) {
    console.log('   ⚠️ Erreur:', String(e).slice(0, 50));
  }

  // 6. Wikipedia API (infos générales)
  console.log('\n\n📖 Wikipedia API (infos club):\n');
  try {
    const wiki = await fetch(
      'https://en.wikipedia.org/api/rest_v1/page/summary/Manchester_United_F.C.'
    ).then(r => r.json());
    
    if (wiki.extract) {
      console.log('   ✅ Wikipedia accessible');
      console.log('   Extrait:', wiki.extract.slice(0, 200) + '...');
      
      // Vérifier les infos importantes
      const text = wiki.extract.toLowerCase();
      const issues = [];
      if (text.includes('debt') || text.includes('faillite')) issues.push('Dette/Faillite mentionnée');
      if (text.includes('takeover') || text.includes('rachat')) issues.push('Rachat en cours');
      if (text.includes('crisis') || text.includes('crise')) issues.push('Crise mentionnée');
      
      if (issues.length > 0) {
        console.log('\n   ⚠️ Signaux détectés:', issues.join(', '));
      }
    }
  } catch (e) {
    console.log('   ⚠️ Erreur:', String(e).slice(0, 50));
  }

  console.log('\n' + '='.repeat(60));
}

testClubNews();
