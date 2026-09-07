/**
 * Probe Understat : vérifie la structure de datesData (page league) et shotsData (page match)
 */
const UA = 'Mozilla/5.0 (compatible; SteoElitePredictor-backtest/1.0; backtest academique)';

function extractJsonParse(html: string, varName: string): any | null {
  const re = new RegExp(`var ${varName}\\s*=\\s*JSON\\.parse\\('([^']+)'\\)`);
  const m = html.match(re);
  if (!m) return null;
  const escaped = m[1].replace(/\\x([0-9a-fA-F]{2})/g, (_: string, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)));
  try { return JSON.parse(escaped); } catch (e) { console.error('parse fail', e); return null; }
}

async function main() {
  // 1. Page league EPL saison 2025-26
  const res = await fetch('https://understat.com/league/EPL/2025', {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000),
  });
  console.log('league page HTTP', res.status);
  const html = await res.text();
  const dates = extractJsonParse(html, 'datesData');
  if (!dates) { console.log('datesData introuvable'); return; }
  console.log('nb matches:', dates.length);
  console.log('row[0]:', JSON.stringify(dates[0]));
  console.log('row[100]:', JSON.stringify(dates[100]));
  const played = dates.filter((m: any[]) => typeof m[3] === 'number' && typeof m[4] === 'number');
  console.log('matches with numeric score:', played.length);
  console.log('last played:', JSON.stringify(played[played.length - 1]));

  // 2. Page match (le premier match joué)
  const mid = played[played.length - 1][0];
  await new Promise(r => setTimeout(r, 2000));
  const res2 = await fetch(`https://understat.com/match/${mid}`, {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000),
  });
  console.log('\nmatch page HTTP', res2.status);
  const html2 = await res2.text();
  const shots = extractJsonParse(html2, 'shotsData');
  if (!shots) { console.log('shotsData introuvable'); return; }
  console.log('nb shots:', shots.length);
  console.log('shot[0]:', JSON.stringify(shots[0]));
  console.log('shot[1]:', JSON.stringify(shots[1]));
  const minutes = shots.map((s: any[]) => String(s[1]));
  console.log('exemples minutes:', minutes.slice(0, 10), '...', minutes.slice(-5));
  const firstHalf = shots.filter((s: any[]) => parseInt(String(s[1]), 10) <= 45);
  console.log('shots 1re MT (<=45):', firstHalf.length);
  const goals1st = firstHalf.filter((s: any[]) => s[2] === 'Goal');
  console.log('buts 1re MT (shots):', goals1st.map((s: any) => `${s[7]} ${s[1]}'`));
}

main().catch(e => { console.error('ERREUR', e); process.exit(1); });
