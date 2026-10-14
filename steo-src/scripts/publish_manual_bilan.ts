const SITE_URL = process.env.SITE_URL || 'https://my-project-zeta-five-85.vercel.app';
const SECRET = process.env.CRON_SECRET;
if (!SECRET) {
  console.error('CRON_SECRET non configuré');
  process.exit(1);
}

async function publishManual() {
  // 1. Verify ALL results first (foot + NBA + MLB + Tennis) — pas juste NBA
  console.log('=== Step 1: Verifying ALL results (verify-all) ===');
  const verifyRes = await fetch(`${SITE_URL}/api/cron?secret=${SECRET}&action=verify`);
  const verifyData = await verifyRes.json();
  console.log('Verify result:', JSON.stringify(verifyData, null, 2));

  // Petite pause pour que Supabase soit à jour
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 2. Publish daily bilan (football/NBA/baseball/tennis — tous sports)
  console.log('\n=== Step 2: Publishing BILAN DE LA VEILLE ===');
  const resultsRes = await fetch(`${SITE_URL}/api/cron?secret=${SECRET}&action=telegram-results`);
  const resultsData = await resultsRes.json();
  console.log('Bilan result:', JSON.stringify(resultsData, null, 2));

  // 3. Publish tennis bilan (séparé, dédié tennis)
  console.log('\n=== Step 3: Publishing BILAN TENNIS ===');
  const tennisRes = await fetch(`${SITE_URL}/api/cron/tennis-auto-publish?secret=${SECRET}&mode=results`);
  const tennisData = await tennisRes.json();
  console.log('Tennis bilan result:', JSON.stringify(tennisData, null, 2));
}

publishManual().catch(console.error);
