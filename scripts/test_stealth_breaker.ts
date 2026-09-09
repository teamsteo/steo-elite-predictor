/**
 * Test fonctionnel du disjoncteur stealthFetch (fetch mocké, aucun réseau réel)
 * Vérifie:
 *  1. Cohérence des profils: Firefox/Safari => AUCUN Sec-Ch-Ua ; Chrome => hints version-matched
 *  2. Statuts WAF (403/412) comptés en poids 2, AUCUN retry (1 seul fetch par appel)
 *  3. Le disjoncteur s'ouvre après 3 challenges WAF (6 >= 5)
 *  4. Pendant le cooldown: échec IMMÉDIAT (throw) sans appeler fetch
 *  5. Un 200 décrémente le compteur d'erreurs
 *  6. Un 429 fait un retry avec backoff puis lève StealthStatusError si persistant
 */
import { stealthFetch, getStealthState, StealthStatusError } from '../src/lib/stealthFetch';

let fetchCalls = 0;
let lastInit: any = null;
let mockStatus = 200;

(globalThis as any).fetch = async (url: any, init: any) => {
  fetchCalls++;
  lastInit = init;
  return {
    ok: mockStatus >= 200 && mockStatus < 300,
    status: mockStatus,
    text: async () => '',
    json: async () => ({}),
  } as any;
};

const DOMAIN = 'waf-test.example.com';
const URL = `https://${DOMAIN}/page`;

async function main() {
  // ── 1. Cohérence profil Firefox: pas de client hints ──
  let sawFirefox = false;
  for (let i = 0; i < 60 && !sawFirefox; i++) {
    mockStatus = 200;
    await stealthFetch(URL, { bypassRateLimit: true });
    const ua: string = lastInit.headers['User-Agent'] || '';
    const hasHints = 'Sec-Ch-Ua' in lastInit.headers;
    if (ua.includes('Firefox')) {
      sawFirefox = true;
      if (hasHints) throw new Error('❌ Firefox a envoyé Sec-Ch-Ua (contradiction fingerprint!)');
      if ('Sec-Fetch-User' in lastInit.headers === false) throw new Error('❌ Headers Sec-Fetch manquants');
    } else {
      const chromeMatch = ua.match(/Chrome\/(\d+)/);
      if (chromeMatch) {
        if (!hasHints) throw new Error(`❌ Chrome ${chromeMatch[1]} sans Sec-Ch-Ua`);
        if (!lastInit.headers['Sec-Ch-Ua'].includes(`v="${chromeMatch[1]}"`))
          throw new Error(`❌ Version hints ${lastInit.headers['Sec-Ch-Ua']} ≠ UA ${chromeMatch[1]}`);
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
  if (!sawFirefox) console.log('⚠️ (info) profil Firefox non tiré en 60 tirages — tirage aléatoire');
  else console.log('✅ 1. Profils cohérents (Firefox sans hints, Chrome version-matched, Platform alignée)');

  // ── Reset état du domaine de test ──
  const state = getStealthState();
  delete (state as any)[DOMAIN];

  // ── 2. Un 403 = poids 2, AUCUN retry (1 appel fetch max) ──
  mockStatus = 403;
  fetchCalls = 0;
  const res403 = await stealthFetch(URL, { bypassRateLimit: true });
  if (res403.status !== 403) throw new Error('❌ 403 doit retourner la response');
  if (fetchCalls !== 1) throw new Error(`❌ 403 a fait ${fetchCalls} appels (retry interdit!)`);
  if (getStealthState()[DOMAIN].errorCount !== 2) throw new Error(`❌ poids attendu 2, got ${getStealthState()[DOMAIN].errorCount}`);
  console.log('✅ 2. 403: poids 2, aucun retry, response retournée à l appelant');

  // ── 3. 3 challenges WAF => disjoncteur OUVERT ──
  await stealthFetch(URL, { bypassRateLimit: true }); // errorCount 4
  await stealthFetch(URL, { bypassRateLimit: true }); // errorCount 6 >= 5 => OUVERT, reset à 0
  const s3 = getStealthState()[DOMAIN];
  if (!s3.blocked) throw new Error('❌ disjoncteur devrait être ouvert après 3 challenges (6≥5)');
  console.log('✅ 3. Disjoncteur OUVERT après 3 challenges WAF (poids 2 chacun)');

  // ── 4. Cooldown = échec immédiat, fetch JAMAIS appelé ──
  fetchCalls = 0;
  let threw = false;
  try {
    await stealthFetch(URL, { bypassRateLimit: true });
  } catch (e) {
    threw = true;
    if (!(e as Error).message.includes('circuit breaker OUVERT')) throw new Error(`❌ message inattendu: ${e}`);
  }
  if (!threw) throw new Error('❌ devrait lever pendant le cooldown');
  if (fetchCalls !== 0) throw new Error('❌ fetch appelé pendant le cooldown!');
  console.log('✅ 4. Cooldown: throw immédiat, 0 appel réseau (fast-fail)');

  // ── 5. Un 200 décrémente le compteur ──
  // (nouveau domaine pour repartir propre)
  const D2 = 'healthy.example.com';
  mockStatus = 403;
  await stealthFetch(`https://${D2}/x`, { bypassRateLimit: true }); // 2
  await stealthFetch(`https://${D2}/x`, { bypassRateLimit: true }); // 4
  mockStatus = 200;
  await stealthFetch(`https://${D2}/x`, { bypassRateLimit: true }); // 3
  const s5 = getStealthState()[D2];
  if (s5.errorCount !== 3) throw new Error(`❌ après 403,403,200: attendu 3, got ${s5.errorCount}`);
  console.log('✅ 5. Succès 200: compteur décrémenté (4→3)');

  // ── 6. 429 persistant: 3 tentatives (1 + 2 retries) puis StealthStatusError ──
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
  console.log('✅ 6. 429 persistant: 3 tentatives avec backoff, StealthStatusError levée');

  console.log('\n🎉 TOUS LES TESTS PASSENT');
  process.exit(0);
}

main().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
