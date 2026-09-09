/**
 * Test one-shot: ZAI page_reader sur BetExplorer NFL (structure HTML réelle)
 * Objectif: voir si les cotes moneyline 2-way sont extractibles (0 €, via service distant)
 */
async function main() {
  const ZAI = (await import('z-ai-web-dev-sdk')).default;
  const zai = await ZAI.create();
  const result = await zai.functions.invoke('page_reader', {
    url: 'https://www.betexplorer.com/next/american-football/',
  });
  const html: string = typeof result === 'string' ? result : (result?.html || result?.content || JSON.stringify(result));
  console.log('LEN:', html.length);
  // Extraire un échantillon structuré
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  console.log('ROWS:', rows.length);
  const withOdds = rows.filter(r => r.includes('data-odd'));
  console.log('ROWS_WITH_ODDS:', withOdds.length);
  for (const r of withOdds.slice(0, 3)) {
    console.log('--- ROW ---');
    console.log(r.replace(/\s+/g, ' ').slice(0, 800));
  }
  // Cherche les classes de noms d'équipes
  const part = html.match(/class="[^"]*match-part[^"]*"[^>]*>[^<]+</g) || [];
  console.log('MATCH_PARTS:', part.length, part.slice(0, 6));
  // Cherche les liens match
  const links = html.match(/\/american-football\/usa\/nfl\/[^"']+/g) || [];
  console.log('NFL_LINKS:', [...new Set(links)].slice(0, 6));
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
