/**
 * Test unitaire pour buildMatchContextSummary + analyzeMatchImportance
 *
 * Vérifie que:
 *   1. Sans contexte → "RAS"
 *   2. Avec forme + blessures → résumé combiné
 *   3. Avec derby → "🔥 Derby" en premier
 *   4. Avec news à haut risque → signal news
 *   5. Avec météo impactante → signal météo
 *   6. analyzeMatchImportance propage contextSummary dans le retour
 */
import {
  analyzeMatchImportance,
  buildMatchContextSummary,
  MatchContextInput,
} from '../src/lib/matchImportanceService';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (e) {
    console.error(`❌ ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// ---------- Test 1: Sans contexte → "RAS" ----------
test('Sans contexte → "RAS"', () => {
  const s = buildMatchContextSummary(undefined, 'football');
  assert(s === 'RAS', `Attendu "RAS", reçu "${s}"`);
});

// ---------- Test 2: Objet vide → "RAS" ----------
test('Objet vide → "RAS"', () => {
  const s = buildMatchContextSummary({}, 'football');
  assert(s === 'RAS', `Attendu "RAS", reçu "${s}"`);
});

// ---------- Test 3: Forme FBref ----------
test('Forme FBref présente → résumé "Forme: ..."', () => {
  const ctx: MatchContextInput = {
    fbref: {
      homeForm: { form: 'WWDLW', formPoints: 10, last5: [
        { result: 'W' }, { result: 'W' }, { result: 'D' }, { result: 'L' }, { result: 'W' },
      ] },
      awayForm: { form: 'LDWLW', formPoints: 7, last5: [
        { result: 'L' }, { result: 'D' }, { result: 'W' }, { result: 'L' }, { result: 'W' },
      ] },
    },
  };
  const s = buildMatchContextSummary(ctx, 'football');
  assert(s.includes('Forme:'), `Devrait contenir "Forme:", reçu "${s}"`);
  assert(s.includes('WWDLW'), `Devrait contenir "WWDLW", reçu "${s}"`);
});

// ---------- Test 4: Forme NBA ----------
test('Forme NBA → "Forme: chaud vs froid"', () => {
  const ctx: MatchContextInput = {
    nba: { homeFormScore: 75, awayFormScore: 35 },
  };
  const s = buildMatchContextSummary(ctx, 'basketball');
  assert(s.includes('chaud'), `Devrait contenir "chaud", reçu "${s}"`);
  assert(s.includes('froid'), `Devrait contenir "froid", reçu "${s}"`);
});

// ---------- Test 5: Blessures clés ----------
test('Blessures significatives → "🏥 ..."', () => {
  const ctx: MatchContextInput = {
    injuries: {
      homeImpact: -5,
      awayImpact: 0,
      summary: 'Mbappé absent',
      keyAbsentees: { home: ['Mbappé', 'Neymar'], away: [] },
    },
  };
  const s = buildMatchContextSummary(ctx, 'football');
  assert(s.includes('🏥'), `Devrait contenir "🏥", reçu "${s}"`);
  assert(s.includes('2 absents dom.'), `Devrait détailler les absents, reçu "${s}"`);
});

// ---------- Test 6: Derby ----------
test('Derby → "🔥 Derby"', () => {
  const ctx: MatchContextInput = {
    matchFactors: { derby: { isDerby: true, intensity: 'high' } },
  };
  const s = buildMatchContextSummary(ctx, 'football');
  assert(s.includes('🔥 Derby'), `Devrait contenir "🔥 Derby", reçu "${s}"`);
  assert(s.includes('(fort)'), `Devrait contenir "(fort)", reçu "${s}"`);
});

// ---------- Test 7: News à haut risque ----------
test('News risque high → "📰 ..."', () => {
  const ctx: MatchContextInput = {
    teamNews: {
      homeTeam: {
        summary: 'Coach sous pression',
        overallImpact: { riskLevel: 'high' },
        keyFactors: ['Coach under pressure'],
      },
    },
  };
  const s = buildMatchContextSummary(ctx, 'football');
  assert(s.includes('📰'), `Devrait contenir "📰", reçu "${s}"`);
  assert(s.includes('dom:'), `Devrait mentionner "dom:", reçu "${s}"`);
});

// ---------- Test 8: Météo non-idéale ----------
test('Météo pluvieuse → signal météo', () => {
  const ctx: MatchContextInput = {
    weather: {
      current: { condition: 'Pluie forte', temperature: 8 },
      impact: { overall: 'extreme' },
    },
  };
  const s = buildMatchContextSummary(ctx, 'football');
  assert(s.includes('🌧️'), `Devrait contenir "🌧️", reçu "${s}"`);
  assert(s.includes('Pluie forte'), `Devrait contenir "Pluie forte", reçu "${s}"`);
});

// ---------- Test 8b: Météo mineure ignorée ----------
test('Météo mineure → ignorée (RAS)', () => {
  const ctx: MatchContextInput = {
    weather: {
      current: { condition: 'Légère bruine', temperature: 15 },
      impact: { overall: 'minor' },
    },
  };
  const s = buildMatchContextSummary(ctx, 'football');
  assert(s === 'RAS', `Météo mineure ne devrait pas apparaître, reçu "${s}"`);
});

// ---------- Test 9: Repos asymétrique ----------
test('Repos asymétrique → signal', () => {
  const ctx: MatchContextInput = {
    matchFactors: {
      restDays: { homeDaysRest: 3, awayDaysRest: 1, homeFatigue: 'fresh', awayFatigue: 'tired' },
    },
  };
  const s = buildMatchContextSummary(ctx, 'football');
  assert(s.includes('😴'), `Devrait contenir "😴", reçu "${s}"`);
  assert(s.includes('dom'), `Devrait mentionner "dom", reçu "${s}"`);
});

// ---------- Test 10: Combo complet ----------
test('Combo complet (derby + forme + blessures + météo) → tous signaux', () => {
  const ctx: MatchContextInput = {
    matchFactors: { derby: { isDerby: true, intensity: 'extreme' } },
    fbref: {
      homeForm: { form: 'WWDWL', formPoints: 10, last5: [] },
      awayForm: { form: 'LDLWL', formPoints: 4, last5: [] },
    },
    injuries: {
      homeImpact: 0,
      awayImpact: -4,
      summary: 'Keeper absent',
      keyAbsentees: { home: [], away: ['Donnarumma'] },
    },
    weather: {
      current: { condition: 'Vent fort', temperature: 5 },
      impact: { overall: 'medium' },
    },
  };
  const s = buildMatchContextSummary(ctx, 'football');
  console.log(`   Résumé combo: "${s}"`);
  assert(s.includes('🔥 Derby'), 'Devrait contenir derby');
  assert(s.includes('Forme:'), 'Devrait contenir forme');
  assert(s.includes('🏥'), 'Devrait contenir blessures');
  assert(s.includes('⛅'), 'Devrait contenir météo');
});

// ---------- Test 11: analyzeMatchImportance propage contextSummary ----------
test('analyzeMatchImportance propage contextSummary', () => {
  const imp = analyzeMatchImportance(
    'english-premier-league',
    'football',
    new Date('2026-01-15'),
    undefined,
    undefined,
    undefined,
    {
      fbref: {
        homeForm: { form: 'WWWDL', formPoints: 12 },
        awayForm: { form: 'LDLDW', formPoints: 5 },
      },
    }
  );
  assert(typeof imp.contextSummary === 'string', 'contextSummary doit être une string');
  assert(imp.contextSummary.includes('Forme:'), `Devrait contenir "Forme:", reçu "${imp.contextSummary}"`);
  console.log(`   contextSummary: "${imp.contextSummary}"`);
});

// ---------- Test 12: analyzeMatchImportance sans contexte → "RAS" ----------
test('analyzeMatchImportance sans contexte → contextSummary = "RAS"', () => {
  const imp = analyzeMatchImportance('laliga', 'football', new Date('2026-02-01'));
  assert(imp.contextSummary === 'RAS', `Attendu "RAS", reçu "${imp.contextSummary}"`);
});

console.log('\nTous les tests passent ✅');
