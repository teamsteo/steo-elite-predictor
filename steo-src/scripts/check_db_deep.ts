const SITE_URL = process.env.SITE_URL || 'https://my-project-zeta-five-85.vercel.app';
const SECRET = process.env.CRON_SECRET;
if (!SECRET) {
  console.error('CRON_SECRET non configuré');
  process.exit(1);
}

async function deepCheck() {
  // Try the cron's telegram-summary to see what data the ML pipeline produces NOW
  console.log('=== Triggering telegram-summary to see current match data ===');
  const res = await fetch(`${SITE_URL}/api/cron?secret=${SECRET}&action=telegram-summary`);
  const data = await res.json();
  
  // Extract the telegram part
  const telegram = data.telegram || data;
  console.log('Success:', telegram.success);
  console.log('Total matches:', telegram.total);
  console.log('ML analyzed:', telegram.mlAnalyzed);
  console.log('Published:', telegram.published);
  console.log('Source:', telegram.source);
  
  if (telegram.predictions) {
    console.log('\nPredictions:');
    for (const p of telegram.predictions) {
      console.log('  ' + p.match + ' | ' + p.sport + ' | ' + p.risk + ' | ' + p.recommendation);
    }
  }
  
  // Also trigger a publish-now to see the full summary
  console.log('\n\n=== Triggering publish-now ===');
  const res2 = await fetch(`${SITE_URL}/api/telegram/publish-now?type=summary`);
  const data2 = await res2.json();
  console.log(JSON.stringify(data2, null, 2).slice(0, 2000));
}

deepCheck().catch(console.error);
