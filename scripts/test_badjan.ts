/**
 * Test fonctionnel BADJAN — Task 14 (0 réseau, 0 DB, fonctions pures)
 * Run: npx tsx scripts/test_badjan.ts
 */
import {
  BADJAN_MAX_RISK,
  BadjanMatchInput,
  filterBadjanMatches,
  formatBadjanMessage,
  publishBadjanToTelegram,
} from '../src/lib/badjanService';

let pass = 0;
let fail = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`✅ ${name}`);
  } else {
    fail++;
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ── Fixture : match foot idéal ──
function footMatch(over: Partial<BadjanMatchInput> = {}): BadjanMatchInput {
  return {
    homeTeam: 'PSG',
    awayTeam: 'Le Havre',
    sport: 'Football',
    league: 'Ligue 1',
    date: '2026-09-09T18:45:00Z',
    predictedResult: 'home',
    riskPercentage: 40,
    winProbability: 60,
    oddsHome: 1.55,
    oddsDraw: 4.20,
    oddsAway: 5.80,
    isEstimated: false,
    ...over,
  };
}

// ═══ 1. Filtre : inclusion ═══
{
  const out = filterBadjanMatches([footMatch()]);
  assert('foot + risque 40 + favori domicile → inclus', out.length === 1);
  assert('constante BADJAN_MAX_RISK = 45', BADJAN_MAX_RISK === 45);
}
{
  const out = filterBadjanMatches([footMatch({ riskPercentage: 45 })]);
  assert('risque 45 (borne incluse) → inclus', out.length === 1);
}

// ═══ 2. Filtre : risque ═══
{
  const out = filterBadjanMatches([footMatch({ riskPercentage: 45.1 })]);
  assert('risque 45.1 → exclu', out.length === 0);
}
{
  const out = filterBadjanMatches([footMatch({ riskPercentage: undefined })]);
  assert('risque non défini → exclu', out.length === 0);
}
{
  const out = filterBadjanMatches([footMatch({ riskPercentage: NaN })]);
  assert('risque NaN → exclu', out.length === 0);
}

// ═══ 3. Filtre : favori à domicile ═══
{
  const out = filterBadjanMatches([footMatch({ predictedResult: 'away' })]);
  assert('prédiction away → exclu (favori pas à domicile)', out.length === 0);
}
{
  const out = filterBadjanMatches([footMatch({ predictedResult: 'draw' })]);
  assert('prédiction draw → exclu', out.length === 0);
}
{
  const out = filterBadjanMatches([footMatch({ oddsHome: 3.10, oddsAway: 2.30 })]);
  assert('cote domicile > cote extérieure (marché contredit) → exclu', out.length === 0);
}
{
  const out = filterBadjanMatches([footMatch({ oddsHome: 1.55, oddsDraw: 1.40, oddsAway: 5.80 })]);
  assert('nul coté plus bas que le favori domicile → exclu', out.length === 0);
}
{
  const out = filterBadjanMatches([footMatch({ oddsHome: 1.05 })]);
  assert('cote favori 1.05 (< 1.10 garde-fou) → exclu', out.length === 0);
}
{
  const out = filterBadjanMatches([footMatch({ oddsHome: undefined })]);
  assert('cotes manquantes → exclu', out.length === 0);
}

// ═══ 4. Filtre : sport + cotes estimées ═══
{
  const out = filterBadjanMatches([footMatch({ sport: 'Basketball' })]);
  assert('basketball → exclu (foot uniquement)', out.length === 0);
}
{
  const out = filterBadjanMatches([footMatch({ sport: 'soccer' })]);
  assert('sport "soccer" → inclus (alias foot)', out.length === 1);
}
{
  const out = filterBadjanMatches([footMatch({ isEstimated: true })]);
  assert('cotes estimées → exclu', out.length === 0);
}

// ═══ 5. Dedup + tri ═══
{
  const out = filterBadjanMatches([
    footMatch({ homeTeam: 'PSG', awayTeam: 'Le Havre', date: '2026-09-09T18:45:00Z' }),
    footMatch({ homeTeam: 'PSG', awayTeam: 'Le Havre', date: '2026-09-09T18:45:00Z', riskPercentage: 38 }),
  ]);
  assert('doublon (équipes+date) → 1 seul pick', out.length === 1);
}
{
  const out = filterBadjanMatches([
    footMatch({ homeTeam: 'Marseille', awayTeam: 'Brest', riskPercentage: 42 }),
    footMatch({ homeTeam: 'PSG', awayTeam: 'Le Havre', riskPercentage: 30 }),
    footMatch({ homeTeam: 'Lille', awayTeam: 'Nantes', riskPercentage: 36 }),
  ]);
  const risks = out.map(m => m.riskPercentage);
  assert('tri par risque croissant', JSON.stringify(risks) === JSON.stringify([30, 36, 42]));
}
{
  const out = filterBadjanMatches([
    footMatch({ date: '2026-09-09T20:00:00Z', riskPercentage: 40 }),
    footMatch({ homeTeam: 'Lyon', awayTeam: 'Toulouse', date: '2026-09-09T16:00:00Z', riskPercentage: 40 }),
  ]);
  assert('tri secondaire par heure croissante', out[0].homeTeam === 'Lyon');
}

// ═══ 6. Format message ═══
{
  const msg = formatBadjanMessage([footMatch()]);
  assert('message contient le titre BADJAN', msg.includes('BADJAN'));
  assert('message contient le pari domicile', msg.includes('PSG (domicile)'));
  assert('message contient les cotes formatées', msg.includes('1.55'));
  assert('message contient chance 60%', msg.includes('60%'));
  assert('message contient risque 40%', msg.includes('40%'));
  assert('message contient la ligue', msg.includes('Ligue 1'));
  assert('aucun bilan promis dans le message', !msg.toLowerCase().includes('bilan'));
}
{
  const msg = formatBadjanMessage([
    footMatch({ _dixonColes: { expectedHomeGoals: 2.4, expectedAwayGoals: 0.8 } }),
  ]);
  assert('bloc xG affiché si Dixon-Coles fourni', msg.includes('2.4'));
}

// ═══ 7. Publish sans réseau : cas 0 pick (early return, aucun envoi) ═══
{
  publishBadjanToTelegram([]).then(r => {
    assert('publish [] → success:false, picks:0', r.success === false && r.picks === 0);

    // Récap final
    console.log('════════════════════════════════');
    console.log(`Résultat: ${pass} passés, ${fail} échoués`);
    process.exit(fail > 0 ? 1 : 0);
  });
}
