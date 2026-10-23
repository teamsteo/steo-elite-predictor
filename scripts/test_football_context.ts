/**
 * Tests unitaires du formatage contexte football économique
 */
import {
  formatFootballContext,
  shouldShowFootballContext,
} from '../src/lib/footballContext';

interface R { name: string; passed: boolean; details?: string; }
const results: R[] = [];
function test(name: string, fn: () => void) {
  try { fn(); results.push({ name, passed: true }); }
  catch (e: any) { results.push({ name, passed: false, details: e.message }); }
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

// ─── Tests ─────────────────────────────────────────────────────────

test('shouldShowFootballContext: football = true', () => {
  assert(shouldShowFootballContext('football') === true, 'football');
  assert(shouldShowFootballContext('Foot') === true, 'Foot');
});

test('shouldShowFootballContext: autres sports = false', () => {
  assert(shouldShowFootballContext('basketball') === false, 'basketball');
  assert(shouldShowFootballContext('NHL') === false, 'NHL');
  assert(shouldShowFootballContext('tennis') === false, 'tennis');
});

test('contexte complet: 3 lignes générées (rang + H2H + forme)', () => {
  const r = formatFootballContext({
    homeTeam: 'PSG',
    awayTeam: 'Marseille',
    homeRank: 1,
    awayRank: 5,
    totalTeams: 20,
    homeFormStr: 'WWDLW',
    awayFormStr: 'WDWLW',
    homeFormPoints: 10,
    awayFormPoints: 8,
    h2h: {
      team1: 'PSG',
      team2: 'Marseille',
      totalMatches: 6,
      team1Wins: 4,
      team2Wins: 1,
      draws: 1,
      team1Goals: 12,
      team2Goals: 6,
      lastMatches: [{
        date: '2025-09-15',
        homeTeam: 'PSG',
        awayTeam: 'Marseille',
        homeScore: 2,
        awayScore: 1,
        competition: 'Ligue 1',
      }],
    },
  });
  assert(r.dataQuality === 3, `dataQuality devrait être 3: ${r.dataQuality}`);
  assert(r.lines.length === 3, `3 lignes attendues: ${r.lines.length}`);
  assert(r.lines[0].includes('PSG #1/20'), `rang home: ${r.lines[0]}`);
  assert(r.lines[0].includes('Marseille #5/20'), `rang away: ${r.lines[0]}`);
  assert(r.lines[1].includes('H2H'), `H2H manquant: ${r.lines[1]}`);
  assert(r.lines[1].includes('4V-1N-1M'), `H2H count: ${r.lines[1]}`);
  assert(r.lines[1].includes('dernier: PSG 2-1 Marseille'), `dernier match: ${r.lines[1]}`);
  assert(r.lines[2].includes('PSG WWDLW (10pts)'), `forme home: ${r.lines[2]}`);
  assert(r.lines[2].includes('Marseille WDWLW (8pts)'), `forme away: ${r.lines[2]}`);
});

test('contexte sans H2H: 2 lignes seulement (rang + forme)', () => {
  const r = formatFootballContext({
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    homeRank: 2,
    awayRank: 6,
    totalTeams: 20,
    homeFormStr: 'WWWLW',
    awayFormStr: 'LDWWW',
    homeFormPoints: 12,
    awayFormPoints: 10,
  });
  assert(r.dataQuality === 2, `dataQuality devrait être 2: ${r.dataQuality}`);
  assert(r.lines.length === 2, `2 lignes attendues: ${r.lines.length}`);
  assert(!r.lines.some(l => l.includes('H2H')), 'pas de H2H');
});

test('contexte sans données: 0 ligne', () => {
  const r = formatFootballContext({
    homeTeam: 'Team',
    awayTeam: 'Other',
  });
  assert(r.dataQuality === 0, `dataQuality devrait être 0`);
  assert(r.lines.length === 0, `0 ligne attendue`);
});

test('contexte rang seul: 1 ligne', () => {
  const r = formatFootballContext({
    homeTeam: 'Bayern',
    awayTeam: 'Dortmund',
    homeRank: 1,
    awayRank: 3,
    totalTeams: 18,
  });
  assert(r.dataQuality === 1, `dataQuality devrait être 1`);
  assert(r.lines.length === 1, `1 ligne attendue`);
  assert(r.lines[0].includes('Bayern #1/18'), `ligne: ${r.lines[0]}`);
  assert(r.lines[0].includes('Dortmund #3/18'), `ligne: ${r.lines[0]}`);
});

test('contexte forme seule: 1 ligne', () => {
  const r = formatFootballContext({
    homeTeam: 'Barça',
    awayTeam: 'Madrid',
    homeFormStr: 'WWDWL',
    awayFormStr: 'WWWWW',
    homeFormPoints: 11,
    awayFormPoints: 15,
  });
  assert(r.dataQuality === 1, `dataQuality devrait être 1`);
  assert(r.lines.length === 1, `1 ligne attendue`);
  assert(r.lines[0].includes('Barça WWDWL (11pts)'), `ligne: ${r.lines[0]}`);
  assert(r.lines[0].includes('Madrid WWWWW (15pts)'), `ligne: ${r.lines[0]}`);
});

test('contexte H2H seul avec dernier match', () => {
  const r = formatFootballContext({
    homeTeam: 'Liverpool',
    awayTeam: 'City',
    h2h: {
      team1: 'Liverpool',
      team2: 'City',
      totalMatches: 8,
      team1Wins: 3,
      team2Wins: 4,
      draws: 1,
      team1Goals: 0,
      team2Goals: 0,
      lastMatches: [{
        date: '2025-10-01',
        homeTeam: 'Liverpool',
        awayTeam: 'City',
        homeScore: 1,
        awayScore: 1,
        competition: 'Premier League',
      }],
    },
  });
  assert(r.dataQuality === 1, `dataQuality devrait être 1`);
  assert(r.lines.length === 1, `1 ligne attendue`);
  assert(r.lines[0].includes('Liverpool 3V-1N-4M'), `H2H: ${r.lines[0]}`);
  assert(r.lines[0].includes('8 matchs'), `total: ${r.lines[0]}`);
  assert(r.lines[0].includes('dernier: Liverpool 1-1 City'), `dernier: ${r.lines[0]}`);
});

test('forme avec tirets normalisée (W-D-W-W-L → WDWWL)', () => {
  const r = formatFootballContext({
    homeTeam: 'A',
    awayTeam: 'B',
    homeFormStr: 'W-D-W-W-L',
    awayFormStr: 'W-W-D-W-W',
    homeFormPoints: 10,
    awayFormPoints: 13,
  });
  assert(r.lines[0].includes('AWWDL'.slice(1)) || r.lines[0].includes('WDWWL'), `forme normalisée: ${r.lines[0]}`);
});

// ─── Résumé ───────────────────────────────────────────────────────

for (const t of results) {
  console.log(`  ${t.passed ? '✅' : '❌'} ${t.name}${t.details ? ` — ${t.details}` : ''}`);
}
const passed = results.filter(r => r.passed).length;
console.log(`\n${passed}/${results.length} tests passés`);
if (passed !== results.length) process.exit(1);
