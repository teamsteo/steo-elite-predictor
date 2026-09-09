/**
 * Test fonctionnel disjoncteur stealthFetch + garde distribué (fetch mocké, 0 réseau réel)
 *
 * Section A (local): profils cohérents, WAF poids 2, ouverture, fast-fail, 429 retries
 * Section B (partagé): Supabase Storage mocké — blocage partagé + push à l'ouverture
 *
 * NOTE: env Supabase factice définie AVANT les imports dynamiques pour que
 * distributedGuard lise la config mockée (les modules lisent process.env au top-level).
 */

// ── Config AVANT imports dynamiques ──
process.env.SUPABASE_URL = 'https://fake-supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';

// ── État du "Storage" mocké ──
const sharedFile = {
  updated_at: new Date().toISOString(),
  domains: {
    'shared-banned.example.com': { blocked_until: Date.now() + 600_000, error_count: 9, updated_at: new Date().toISOString() },
  } as Record<string, any>,
};
let storagePOSTs: any[] = [];

// ── Mock fetch global ──
let fetchCalls = 0;
let lastInit: any = null;
let mockStatus = 200;

(globalThis as any).fetch = async (url: any, init: any) => {
  const u = String(url);
  if (u.includes('fake-supabase.test/storage')) {
    if (init?.method === 'POST') {
      storagePOSTs.push(JSON.parse(init.body));
      return { ok: true, status: 200, text: async () => '' } as any;
    }
    return { ok: true, status: 200, json: async () => sharedFile, text: async () => '' } as any;
  }
  fetchCalls++;
  lastInit = init;
  return {
    ok: mockStatus >= 200 && mockStatus < 300,
    status: mockStatus,
    text: async () => '',
    json: async () => ({}),
  } as any;
};

async function main() {
  const { stealthFetch, getStealthState, StealthStatusError } = await import('../src/lib/stealthFetch');
  const { getSharedBlock } = await import('../src/lib/distributedGuard');

  const DOMAIN = 'waf-test.example.com';
  const URL_T = `https://${DOMAIN}/page`;

  // ── A1. Cohérence profil Firefox/Safari/Chrome/Edge ──
  let sawFirefox = false;
  for (let i = 0; i < 60 && !sawFirefox; i++) {
    mockStatus = 200;
    await stealthFetch(URL_T, { bypassRateLimit: true });
    const ua: string = lastInit.headers['User-Agent'] || '';
    const hasHints = 'Sec-Ch-Ua' in lastInit.headers;
    if (ua.includes('Firefox')) {
      sawFirefox = true;
      if (hasHints) throw new Error('❌ Firefox a envoyé Sec-Ch-Ua (contradiction fingerprint!)');
    } else {
      const chromeMatch = ua.match(/Chrome\/(\d+)/);
      if (chromeMatch) {
        if (!hasHints) throw new Error(`❌ Chrome ${chromeMatch[1]} sans Sec-Ch-Ua`);
        if (!lastInit.headers['Sec-Ch-Ua'].includes(`v="${chromeMatch[1]}"`))
          throw new Error(`❌ Version hints ≠ UA ${chromeMatch[1]}`);
        const plat = lastInit.headers['Sec-Ch-Ua-Platform'];
        if (ua.includes('Windows') && plat !== '"Windows"') throw new Error('❌ Platform Windows incohérente');
        if (ua.includes('Macintosh') && plat !== '"macOS"') throw new Error('❌ Platform macOS incohérente');
        if (ua.includes('Edg/') && !lastInit.headers['Sec-Ch-Ua'].includes('Microsoft Edge'))
          throw new Error('❌ Edge sans hint Microsoft Edge');
      }
      if (ua.includes('Safari') && !ua.includes('Chrome') && hasHints)
        throw new Error('❌ Safari a envoyé Sec-Ch-Ua');
    }
  }
  if (!sawFirefox) console.log('⚠️ (info) profil Firefox non tiré en 60 tirages');
  console.log('✅ A1. Profils navigateur cohérents (UA ↔ hints ↔ platform)');

  // ── A2. 403 = poids 2, aucun retry ──
  delete (getStealthState() as any)[DOMAIN];
  mockStatus = 403;
  fetchCalls = 0;
  const res403 = await stealthFetch(URL_T, { bypassRateLimit: true });
  if (res403.status !== 403) throw new Error('❌ 403 doit retourner la response');
  if (fetchCalls !== 1) throw new Error(`❌ 403 a fait ${fetchCalls} appels (retry interdit!)`);
  if (getStealthState()[DOMAIN].errorCount !== 2) throw new Error('❌ poids 403 attendu: 2');
  console.log('✅ A2. 403: poids 2, aucun retry');

  // ── A3. 3 challenges → breaker local OUVERT ──
  await stealthFetch(URL_T, { bypassRateLimit: true });
  await stealthFetch(URL_T, { bypassRateLimit: true });
  if (!getStealthState()[DOMAIN].blocked) throw new Error('❌ breaker local devrait être ouvert');
  console.log('✅ A3. Disjoncteur local OUVERT après 3 challenges WAF');

  // ── A4. Fast-fail local + PUSH vers le store partagé ──
  fetchCalls = 0;
  let threw = false;
  try {
    await stealthFetch(URL_T, { bypassRateLimit: true });
  } catch (e) {
    threw = true;
    if (!(e as Error).message.includes('circuit breaker')) throw new Error(`❌ message inattendu: ${e}`);
  }
  if (!threw) throw new Error('❌ devrait lever pendant le cooldown local');
  if (fetchCalls !== 0) throw new Error('❌ fetch appelé pendant le cooldown!');
  await new Promise(r => setTimeout(r, 50)); // laisse le fire-and-forget partir
  const pushEntry = storagePOSTs.flatMap(p => Object.entries(p.domains)).find(([d]) => d === DOMAIN);
  if (!pushEntry) throw new Error('❌ aucun push partagé reçu pour le domaine ouvert!');
  if (!(pushEntry[1].blocked_until > Date.now())) throw new Error('❌ blocked_until partagé non futur');
  console.log('✅ A4. Fast-fail local (0 appel) + push partagé publié à l\'ouverture');

  // ── A5. Un 200 décrémente ──
  const D2 = 'healthy.example.com';
  mockStatus = 403;
  await stealthFetch(`https://${D2}/x`, { bypassRateLimit: true });
  await stealthFetch(`https://${D2}/x`, { bypassRateLimit: true });
  mockStatus = 200;
  await stealthFetch(`https://${D2}/x`, { bypassRateLimit: true });
  if (getStealthState()[D2].errorCount !== 3) throw new Error(`❌ compteur attendu 3, got ${getStealthState()[D2].errorCount}`);
  console.log('✅ A5. Succès 200: compteur décrémenté (4→3)');

  // ── A6. 429 persistant: 3 tentatives puis StealthStatusError ──
  const D3 = 'ratelimit.example.com';
  mockStatus = 429;
  fetchCalls = 0;
  let statusErr: any = null;
  try {
    await stealthFetch(`https://${D3}/x`, { bypassRateLimit: true, maxRetries: 2 });
  } catch (e) {
    statusErr = e;
  }
  if (!(statusErr instanceof StealthStatusError) || statusErr.status !== 429)
    throw new Error(`❌ attendu StealthStatusError(429), got ${statusErr}`);
  if (fetchCalls !== 3) throw new Error(`❌ 429: attendu 3 tentatives, got ${fetchCalls}`);
  console.log('✅ A6. 429 persistant: 3 tentatives, StealthStatusError');

  // ── B1. Blocage PARTAGÉ: le domaine pré-bloqué dans le Storage mocké ──
  const sharedUntil = await getSharedBlock('shared-banned.example.com');
  if (!(sharedUntil > Date.now())) throw new Error('❌ getSharedBlock devrait lire le Storage mocké');
  fetchCalls = 0;
  let sharedThrew = false;
  try {
    await stealthFetch('https://shared-banned.example.com/page', { bypassRateLimit: true });
  } catch (e) {
    sharedThrew = true;
    if (!(e as Error).message.includes('PARTAGÉ')) throw new Error(`❌ message partagé inattendu: ${e}`);
  }
  if (!sharedThrew) throw new Error('❌ le blocage partagé doit lever');
  if (fetchCalls !== 0) throw new Error('❌ fetch appelé sur un domaine partagé-bloqué!');
  console.log('✅ B1. Circuit breaker PARTAGÉ: throw immédiat, 0 appel réseau');

  console.log('\n🎉 TOUS LES TESTS PASSENT (A1-A6 + B1)');
  process.exit(0);
}

main().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
