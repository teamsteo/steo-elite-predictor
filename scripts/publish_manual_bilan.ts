const SITE_URL = 'https://my-project-zeta-five-85.vercel.app';
const SECRET = 'secretsteo-elitecron2026';

async function publishManual() {
  // 1. Verify results first (to catch any pending from yesterday)
  console.log('=== Step 1: Verifying results (verify-night) ===');
  const verifyRes = await fetch(`${SITE_URL}/api/cron?secret=${SECRET}&action=verify-night`);
  const verifyData = await verifyRes.json();
  console.log('Verify result:', JSON.stringify(verifyData, null, 2));

  // 2. Publish daily bilan (football/NBA/baseball/etc)
  console.log('\n=== Step 2: Publishing BILAN DE LA VEILLE ===');
  const resultsRes = await fetch(`${SITE_URL}/api/cron?secret=${SECRET}&action=telegram-results`);
  const resultsData = await resultsRes.json();
  console.log('Bilan result:', JSON.stringify(resultsData, null, 2));

  // 3. Publish tennis bilan
  console.log('\n=== Step 3: Publishing BILAN TENNIS ===');
  const tennisRes = await fetch(`${SITE_URL}/api/cron/tennis-auto-publish?secret=${SECRET}&mode=results`);
  const tennisData = await tennisRes.json();
  console.log('Tennis bilan result:', JSON.stringify(tennisData, null, 2));
}

publishManual().catch(console.error);
