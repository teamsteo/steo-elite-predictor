/**
 * Tests Anti-Ban — couche politiques (rafale + plafond) de stealthFetch (Task 19)
 * Run: npx tsx scripts/test_anti_ban.ts
 * Zéro réseau réel : globalThis.fetch est mocké.
 */
import {
  stealthFetch,
  GuardBudgetError,
  getAntiBanStatus,
  DOMAIN_POLICIES,
  __resetAntiBanStateForTests,
  __setPoliciesForTests,
  DomainPolicy,
} from '../src/lib/stealthFetch';

let pass = 0, fail = 0;
function assert(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

// ── Mock fetch (aucun appel réel) ──
const realFetch = globalThis.fetch;
let mockStatus = 200;
let mockCalls = 0;
globalThis.fetch = (async () => {
  mockCalls++;
  return new Response('mock-body', { status: mockStatus, headers: { 'content-type': 'text/html' } });
}) as any;

// ── Politiques RÉELLES capturées avant modification ──
const realPolicies: Record<string, DomainPolicy> = JSON.parse(JSON.stringify(DOMAIN_POLICIES));

async function expectGuard(fn: () => Promise<any>, name: string, mustContain: string) {
  try {
    await fn();
    assert(name, false, 'aucune erreur levée');
  } catch (e: any) {
    assert(name, e instanceof GuardBudgetError && String(e.message).includes(mustContain),
      `reçu: ${e?.name}: ${e?.message?.slice(0, 90)}`);
  }
}

async function main() {
  // ============ 1. POLITIQUES RÉELLES ============
  console.log('\n📐 POLITIQUES RÉELLES');
  const espn = realPolicies['site.api.espn.com'];
  assert('ESPN: délai 450ms + rafale 80/60s + cap 400/jour',
    espn?.minDelayMs === 450 && espn?.burstMax === 80 && espn?.burstWindowMs === 60_000 && espn?.dailyCap === 400);
  const td = realPolicies['www.tennis-data.co.uk'];
  assert('tennis-data: cap 8/jour + rafale 2/60s + délai 2000ms',
    td?.dailyCap === 8 && td?.burstMax === 2 && td?.minDelayMs === 2000);
  const be = realPolicies['www.betexplorer.com'];
  assert('BetExplorer: cap 300/jour + rafale 20/60s',
    be?.dailyCap === 300 && be?.burstMax === 20);
  const oa = realPolicies['api.the-odds-api.com'];
  assert('Odds API: délai 2000ms + cap 40/jour', oa?.minDelayMs === 2000 && oa?.dailyCap === 40);

  // ============ 2. CHEMIN NORMAL ============
  console.log('\n✅ CHEMIN NORMAL (mock 200)');
  __resetAntiBanStateForTests();
  __setPoliciesForTests({ 'test.example.com': { minDelayMs: 10 } });
  const r = await stealthFetch('https://test.example.com/api');
  assert('requête simple → 200', r.status === 200);
  assert('télémétrie: 1 requête comptée', getAntiBanStatus()['test.example.com'].todayCount === 1);

  // ============ 3. PACING (délai de politesse) ============
  console.log('\n⏱️ PACING');
  __resetAntiBanStateForTests();
  __setPoliciesForTests({ 'pacing.example.com': { minDelayMs: 300 } });
  const t0 = Date.now();
  await stealthFetch('https://pacing.example.com/a');
  await stealthFetch('https://pacing.example.com/b');
  const elapsed = Date.now() - t0;
  assert(`2 requêtes espacées ≥ ~210ms (jitter ±30%) — mesuré ${elapsed}ms`, elapsed >= 180);

  // ============ 4. RAFALE (fenêtre glissante) ============
  console.log('\n💥 RAFALE');
  __resetAntiBanStateForTests();
  __setPoliciesForTests({ 'burst.example.com': { minDelayMs: 10, burstMax: 2, burstWindowMs: 60_000, maxQueueWaitMs: 200 } });
  await stealthFetch('https://burst.example.com/1');
  await stealthFetch('https://burst.example.com/2');
  const tb = Date.now();
  await expectGuard(
    () => stealthFetch('https://burst.example.com/3'),
    '3e requête → GuardBudgetError rapide (<2s)', 'rafale'
  );
  assert('fast-fail quasi immédiat', Date.now() - tb < 2000);

  // budget épuisé NE compte PAS la requête rejetée (jamais envoyée au domaine)
  const st = getAntiBanStatus()['burst.example.com'];
  assert('requête rejetée non comptée côté domaine (todayCount=2)', st.todayCount === 2, `todayCount=${st.todayCount}`);

  // ============ 5. PLAFOND JOURNALIER ============
  console.log('\n📅 PLAFOND JOURNALIER');
  __resetAntiBanStateForTests();
  __setPoliciesForTests({ 'cap.example.com': { minDelayMs: 10, dailyCap: 2 } });
  await stealthFetch('https://cap.example.com/1');
  await stealthFetch('https://cap.example.com/2');
  await expectGuard(
    () => stealthFetch('https://cap.example.com/3'),
    'cap 2 atteint → 3e requête rejetée', 'journalier'
  );

  // ============ 6. WAF 403 → DISJONCTEUR (comportement préservé) ============
  console.log('\n🚫 WAF + DISJONCTEUR');
  __resetAntiBanStateForTests();
  __setPoliciesForTests({ 'waf.example.com': { minDelayMs: 10 } });
  mockStatus = 403;
  const r403a = await stealthFetch('https://waf.example.com/x');
  const r403b = await stealthFetch('https://waf.example.com/y');
  const r403c = await stealthFetch('https://waf.example.com/z');
  assert('403: réponse retournée sans throw (poids 2×)', r403a.status === 403 && r403b.status === 403 && r403c.status === 403);
  let breakerMsg = '';
  try {
    await stealthFetch('https://waf.example.com/w');
  } catch (e: any) {
    breakerMsg = String(e.message);
  }
  assert('3× 403 (poids 6 ≥ 5) → disjoncteur OUVERT', breakerMsg.includes('circuit breaker'), breakerMsg.slice(0, 80));
  assert('403 comptés dans les budgets du domaine', getAntiBanStatus()['waf.example.com'].todayCount === 3);
  mockStatus = 200;

  // ============ 7. TÉLÉMÉTRIE ============
  console.log('\n📊 TÉLÉMÉTRIE');
  __resetAntiBanStateForTests();
  __setPoliciesForTests({ 'tele.example.com': { minDelayMs: 10, burstMax: 5, burstWindowMs: 60_000, dailyCap: 100 } });
  await stealthFetch('https://tele.example.com/1');
  await stealthFetch('https://tele.example.com/2');
  const tele = getAntiBanStatus()['tele.example.com'];
  assert('champs complets', tele.totalRequests === 2 && tele.todayCount === 2 && tele.burstLast60s === 2
    && tele.dailyCap === 100 && tele.burstMax === 5 && tele.minDelayMs === 10 && tele.blocked === false);

  // ============ RÉSULTAT ============
  globalThis.fetch = realFetch; // restauration hygiène
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`RÉSULTAT: ${pass} passés, ${fail} échoués`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('💥 Crash test:', e);
  process.exit(1);
});
