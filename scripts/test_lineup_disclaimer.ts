/**
 * Tests unitaires du disclaimer composition
 */
import {
  buildLineupDisclaimer,
  buildLineupDisclaimerHTML,
  shouldShowLineupDisclaimer,
} from '../src/lib/lineupDisclaimer';

interface R { name: string; passed: boolean; details?: string; }
const results: R[] = [];
function test(name: string, fn: () => void) {
  try { fn(); results.push({ name, passed: true }); }
  catch (e: any) { results.push({ name, passed: false, details: e.message }); }
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

// ─── Tests ─────────────────────────────────────────────────────────

test('shouldShowLineupDisclaimer: football = true', () => {
  assert(shouldShowLineupDisclaimer('football') === true, 'football devrait afficher');
  assert(shouldShowLineupDisclaimer('Foot') === true, 'Foot devrait afficher');
});

test('shouldShowLineupDisclaimer: US sports = true', () => {
  assert(shouldShowLineupDisclaimer('basketball') === true, 'basketball devrait afficher');
  assert(shouldShowLineupDisclaimer('NBA') === true, 'NBA devrait afficher');
  assert(shouldShowLineupDisclaimer('NHL') === true, 'NHL devrait afficher');
  assert(shouldShowLineupDisclaimer('MLB') === true, 'MLB devrait afficher');
  assert(shouldShowLineupDisclaimer('NFL') === true, 'NFL devrait afficher');
});

test('shouldShowLineupDisclaimer: tennis = false', () => {
  assert(shouldShowLineupDisclaimer('tennis') === false, 'tennis ne devrait pas afficher');
});

test('disclaimer football sans blessure: disclaimer générique affiché', () => {
  const d = buildLineupDisclaimer({
    sport: 'football',
    homeTeam: 'PSG',
    awayTeam: 'Marseille',
  });
  assert(d.shouldShow === true, 'doit afficher pour football');
  assert(d.keyPlayersCount === 0, 'aucun joueur connu');
  assert(d.text.includes('Vérifie la composition 1h avant'), `texte: ${d.text}`);
  assert(d.text.includes('non prise en compte'), `texte: ${d.text}`);
  assert(d.short.includes('⚠️'), `short: ${d.short}`);
});

test('disclaimer football avec blessures impact -5: joueurs listés', () => {
  const d = buildLineupDisclaimer({
    sport: 'football',
    homeTeam: 'Real Madrid',
    awayTeam: 'Barcelona',
    homeInjuries: ['Mbappé', 'Vinicius', 'Bellingham'],
    awayInjuries: ['Pedri'],
    homeImpact: -5,
    awayImpact: -2,
  });
  assert(d.keyPlayersCount > 0, 'doit avoir des joueurs clés');
  assert(d.text.includes('Mbappé'), `texte: ${d.text}`);
  assert(d.text.includes('Vinicius'), `texte: ${d.text}`);
  // Barcelona awayImpact > -3 → pas listé
  assert(!d.text.includes('Pedri'), `Pedri ne devrait pas être listé (impact > -3): ${d.text}`);
  assert(d.text.includes('Real Madrid'), `texte: ${d.text}`);
});

test('disclaimer NBA avec blessures: tous les out listés', () => {
  const d = buildLineupDisclaimer({
    sport: 'basketball',
    homeTeam: 'Lakers',
    awayTeam: 'Celtics',
    homeInjuries: ['LeBron James', 'Anthony Davis'],
    awayInjuries: ['Jayson Tatum'],
  });
  assert(d.keyPlayersCount === 3, `3 joueurs: ${d.keyPlayersCount}`);
  assert(d.text.includes('LeBron'), `texte: ${d.text}`);
  assert(d.text.includes('Davis'), `texte: ${d.text}`);
  assert(d.text.includes('Tatum'), `texte: ${d.text}`);
  assert(d.text.includes('Lakers'), `texte: ${d.text}`);
  assert(d.text.includes('Celtics'), `texte: ${d.text}`);
});

test('disclaimer HTML format: ligne dédiée + i tag', () => {
  const html = buildLineupDisclaimerHTML({
    sport: 'football',
    homeTeam: 'PSG',
    awayTeam: 'Marseille',
    homeInjuries: ['Mbappé'],
    homeImpact: -4,
  });
  assert(html.includes('<i>'), `doit contenir <i>: ${html}`);
  assert(html.includes('⚠️'), `doit contenir ⚠️: ${html}`);
  assert(html.includes('Mbappé'), `doit contenir Mbappé: ${html}`);
  assert(html.includes('\n'), `doit avoir saut de ligne: ${html}`);
});

// Note: NFL/American football n'est PAS dans le scope — utilisateur parle
// de football (soccer) uniquement. Pas de test NFL.

test('disclaimer limite à 5 joueurs par équipe (au lieu de 3)', () => {
  const d = buildLineupDisclaimer({
    sport: 'basketball',
    homeTeam: 'Team',
    awayTeam: 'Other',
    homeInjuries: ['A', 'B', 'C', 'D', 'E'],
  });
  // Nouveau: limite 5 par équipe au lieu de 3
  assert(d.keyPlayersCount === 5, `5 joueurs attendus: ${d.keyPlayersCount}`);
});

test('disclaimer détaillé avec keyPlayers: noms + types + statuts', () => {
  const d = buildLineupDisclaimer({
    sport: 'football',
    homeTeam: 'Real Madrid',
    awayTeam: 'Barcelona',
    homeKeyPlayers: [
      { name: 'Mbappé', type: 'cuisse', status: 'out' },
      { name: 'Vinicius', type: 'cheville', status: 'doubtful' },
    ],
    awayKeyPlayers: [
      { name: 'Pedri', type: 'genou', status: 'out' },
    ],
    homeImpact: -5,
    awayImpact: -3,
  });
  assert(d.keyPlayersCount === 3, `3 joueurs: ${d.keyPlayersCount}`);
  assert(d.text.includes('Mbappé'), `Mbappé: ${d.text}`);
  assert(d.text.includes('cuisse'), `type cuisse: ${d.text}`);
  assert(d.text.includes('Vinicius'), `Vinicius: ${d.text}`);
  assert(d.text.includes('cheville'), `type cheville: ${d.text}`);
  assert(d.text.includes('🚫'), `statut out: ${d.text}`);
  assert(d.text.includes('❓'), `statut doubtful: ${d.text}`);
  assert(d.text.includes('Real Madrid'), `texte: ${d.text}`);
  assert(d.text.includes('Barcelona'), `texte: ${d.text}`);
});

test('disclaimer détaillé tronque types longs (rupture des ligaments croisés)', () => {
  const d = buildLineupDisclaimer({
    sport: 'football',
    homeTeam: 'A',
    awayTeam: 'B',
    homeKeyPlayers: [
      { name: 'X', type: 'rupture des ligaments croisés antérieur', status: 'out' },
    ],
    homeImpact: -5,
  });
  // Type tronqué à 25 chars max
  assert(d.text.length < 200, `longueur raisonnable: ${d.text.length}`);
  assert(d.text.includes('rupture'), `contient rupture: ${d.text}`);
});

test('disclaimer limite à 5 joueurs par équipe', () => {
  const d = buildLineupDisclaimer({
    sport: 'football',
    homeTeam: 'A',
    awayTeam: 'B',
    homeKeyPlayers: [
      { name: 'J1', type: 'blessure', status: 'out' },
      { name: 'J2', type: 'blessure', status: 'out' },
      { name: 'J3', type: 'blessure', status: 'out' },
      { name: 'J4', type: 'blessure', status: 'out' },
      { name: 'J5', type: 'blessure', status: 'out' },
      { name: 'J6', type: 'blessure', status: 'out' },
      { name: 'J7', type: 'blessure', status: 'out' },
    ],
    homeImpact: -8,
  });
  assert(d.keyPlayersCount === 7, `7 joueurs total: ${d.keyPlayersCount}`);
  assert(d.text.includes('+2 autres'), `+2 autres: ${d.text}`);
});

test('disclaimer HTML multi-lignes avec joueurs détaillés', () => {
  const html = buildLineupDisclaimerHTML({
    sport: 'football',
    homeTeam: 'PSG',
    awayTeam: 'OM',
    homeKeyPlayers: [
      { name: 'Mbappé', type: 'cuisse', status: 'out' },
    ],
    awayKeyPlayers: [
      { name: 'Rongier', type: 'genou', status: 'out' },
    ],
    homeImpact: -4,
    awayImpact: -4,
  });
  // Multi-ligne: header en gras + 1 ligne par équipe en italique
  assert(html.includes('<b>'), `contient <b>: ${html}`);
  assert(html.includes('<i>'), `contient <i>: ${html}`);
  assert(html.includes('Mbappé'), `contient Mbappé: ${html}`);
  assert(html.includes('Rongier'), `contient Rongier: ${html}`);
  assert(html.includes('Absents PSG'), `texte home: ${html}`);
  assert(html.includes('Absents OM'), `texte away: ${html}`);
});

test('disclaimer football sans keyPlayers: fallback noms simples', () => {
  const d = buildLineupDisclaimer({
    sport: 'football',
    homeTeam: 'A',
    awayTeam: 'B',
    homeInjuries: ['Joueur1', 'Joueur2'],
    homeImpact: -4,
  });
  assert(d.text.includes('Joueur1'), `texte: ${d.text}`);
  assert(d.text.includes('Joueur2'), `texte: ${d.text}`);
  assert(d.text.includes('Absents A'), `texte: ${d.text}`);
});

test('disclaimer football sans blessures: générique', () => {
  const d = buildLineupDisclaimer({
    sport: 'football',
    homeTeam: 'A',
    awayTeam: 'B',
  });
  assert(d.text.includes('Vérifie la composition 1h avant'), `texte: ${d.text}`);
  assert(d.text.includes('Composition officielle non prise en compte'), `texte: ${d.text}`);
});

// ─── Résumé ───────────────────────────────────────────────────────

for (const t of results) {
  console.log(`  ${t.passed ? '✅' : '❌'} ${t.name}${t.details ? ` — ${t.details}` : ''}`);
}
const passed = results.filter(r => r.passed).length;
console.log(`\n${passed}/${results.length} tests passés`);
if (passed !== results.length) process.exit(1);
