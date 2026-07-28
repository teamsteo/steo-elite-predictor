const SITE_URL = 'https://my-project-zeta-five-85.vercel.app';

async function check() {
  // Use the ml-stats endpoint to get all predictions from Supabase
  // Or use the matches endpoint with a date filter
  // Let's try triggering a verify first to see what's pending

  console.log('=== Step 1: Check pending predictions (verify-night) ===');
  const verifyRes = await fetch(SITE_URL + '/api/cron?secret=secretsteo-elitecron2026&action=verify-night');
  const verifyData = await verifyRes.json();
  console.log(JSON.stringify(verifyData, null, 2).slice(0, 3000));
  
  // Now check results
  console.log('\n\n=== Step 2: Check telegram-results ===');
  const resultsRes = await fetch(SITE_URL + '/api/cron?secret=secretsteo-elitecron2026&action=telegram-results');
  const resultsData = await resultsRes.json();
  console.log(JSON.stringify(resultsData, null, 2).slice(0, 3000));
}

check();
