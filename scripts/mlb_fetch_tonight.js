#!/usr/bin/env node
/** Fetch scoreboard MLB ESPN du jour : matchs + cotes + lanceurs probables + standings */
const https = require('https');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

(async () => {
  const sb = await fetchJSON('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard');
  const events = sb.events || [];
  console.log(`# MLB — ${events.length} match(s) aujourd'hui (${new Date().toISOString().slice(0, 16)} UTC)`);
  const out = [];
  for (const ev of events) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors.find(c => c.homeAway === 'home');
    const away = comp.competitors.find(c => c.homeAway === 'away');
    if (!home || !away) continue;
    const odds = comp.odds?.[0] || {};
    const g = {
      id: ev.id,
      date: ev.date,
      state: ev.status?.type?.state,
      detail: ev.status?.type?.shortDetail,
      home: {
        name: home.team.displayName, abbr: home.team.abbreviation,
        record: home.records?.[0]?.summary || '',
        wins: home.records?.[0]?.wins, losses: home.records?.[0]?.losses,
        score: home.score,
        pitcher: home.probables?.[0]?.athlete?.displayName || null,
        pitcherId: home.probables?.[0]?.athlete?.id || null,
        pitcherStats: home.probables?.[0]?.statistics?.[0]?.stats || null,
      },
      away: {
        name: away.team.displayName, abbr: away.team.abbreviation,
        record: away.records?.[0]?.summary || '',
        wins: away.records?.[0]?.wins, losses: away.records?.[0]?.losses,
        score: away.score,
        pitcher: away.probables?.[0]?.athlete?.displayName || null,
        pitcherId: away.probables?.[0]?.athlete?.id || null,
        pitcherStats: away.probables?.[0]?.statistics?.[0]?.stats || null,
      },
      odds: {
        homeML: odds.homeTeamOdds?.moneyLine ?? null,
        awayML: odds.awayTeamOdds?.moneyLine ?? null,
        ouLine: odds.overUnder ?? null,
        provider: odds.provider?.name || null,
        details: odds.details || null,
      },
      venue: comp.venue?.fullName || null,
    };
    out.push(g);
    const mlH = g.odds.homeML, mlA = g.odds.awayML;
    const pH = mlH < 0 ? (-mlH / (-mlH + 100)) : (100 / (mlH + 100));
    const pA = mlA < 0 ? (-mlA / (-mlA + 100)) : (100 / (mlA + 100));
    console.log(`\n${g.state === 'pre' ? '🕐' : g.state === 'in' ? '🔴' : '✅'} ${away.name} (${away.record}) @ ${home.name} (${home.record})`);
    console.log(`   ⏰ ${g.date.slice(11, 16)} UTC | ${g.detail} | ${g.venue}`);
    console.log(`   🥎 Lanceurs: ${away.pitcher || '?'} vs ${home.pitcher || '?'}`);
    if (away.pitcherStats) console.log(`      A-pitcher stats: ${away.pitcherStats.join('/')}`);
    if (home.pitcherStats) console.log(`      H-pitcher stats: ${home.pitcherStats.join('/')}`);
    console.log(`   💰 ML: ${away.name} ${mlA} (implied ${(pA * 100).toFixed(1)}%) | ${home.name} ${mlH} (implied ${(pH * 100).toFixed(1)}%) | vig ${((pH + pA - 1) * 100).toFixed(1)}%`);
    if (g.odds.ouLine) console.log(`   📊 O/U: ${g.odds.ouLine} | ${g.odds.details || ''}`);
  }
  require('fs').writeFileSync('/home/z/my-project/scripts/mlb_tonight.json', JSON.stringify(out, null, 2));
  console.log(`\n# Sauvegardé: scripts/mlb_tonight.json (${out.length} matchs)`);
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
