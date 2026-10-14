/**
 * Tests Task 45 — anomalies basket site + Telegram :
 * 1. Site: riskPercentage = 100 − proba du côté RECOMMANDÉ (plus maxProb)
 * 2. ComboService: legs portent date + cotes complètes
 * 3. Cron combo save: match_id déterministe (date match), vraie match_date, cotes 3 issues, dedup inter-combos
 * 4. verifyNBAResults: matching date-aware (espnDate + tolérance ±1.5j, placeholder T12:00 → ancien comportement)
 */
import * as fs from 'fs';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

// ── 1. Site mapper (src/app/api/matches/route.ts) ──
const matchesRoute = fs.readFileSync('/home/z/my-project/src/app/api/matches/route.ts', 'utf-8');
check('site: recProb calculé depuis rec.bet', matchesRoute.includes("rec.bet === 'home' ? homeProb") && matchesRoute.includes("rec.bet === 'away' ? awayProb"));
check('site: riskPercentage = 100 − recProb', /const riskPercentage = Math\.max\(0, Math\.min\(100, 100 - recProb\)\)/.test(matchesRoute));
check('site: ancien risk=100−maxProb supprimé du mapper', !/const riskPercentage = Math\.max\(0, Math\.min\(100, 100 - maxProb\)\)/.test(matchesRoute));
check('site: insight.riskPercentage réutilise la variable', matchesRoute.includes('insight: {\n      riskPercentage,'));

// ── 2. ComboService legs ──
const comboService = fs.readFileSync('/home/z/my-project/src/lib/comboService.ts', 'utf-8');
const legsBlock = comboService.slice(comboService.indexOf('const legs = selected.map'), comboService.indexOf('const combinedOdds = legs.reduce'));
check('comboService: leg.date propagé', legsBlock.includes('date: m.date'));
check('comboService: leg.oddsHome/oddsDraw/oddsAway propagés', legsBlock.includes('oddsHome: m.oddsHome') && legsBlock.includes('oddsDraw: m.oddsDraw') && legsBlock.includes('oddsAway: m.oddsAway'));

// ── 3. Cron combo save ──
const cron = fs.readFileSync('/home/z/my-project/src/app/api/cron/route.ts', 'utf-8');
check('cron: match_id combo = date du match (legDateStr)', cron.includes('${cleanTeam(leg.homeTeam)}-${cleanTeam(leg.awayTeam)}-${cleanTeam(leg.league || \'\')}-${legDateStr}${legTimeSuffix}'));
check('cron: plus de suffixe hex comboId dans match_id', !cron.includes("combo.comboId.split('-').pop()"));
check('cron: match_date combo = leg.date', cron.includes('match_date: legMatchDate'));
check('cron: cotes complètes legs (oddsHome ??)', cron.includes('odds_home: leg.oddsHome ?? (leg.predictedResult === \'home\' ? leg.odds : null)') && cron.includes("odds_away: leg.oddsAway ?? (leg.predictedResult === 'away' ? leg.odds : null)"));
check('cron: dedup inter-combos (alreadyInCombo)', cron.includes('alreadyInCombo') && cron.includes("r.is_combo"));
check('cron: fetchNBAResults attache espnDate', /espnDate: dateStr\n          \}\);/.test(cron.replace(/\r/g, '')) || cron.includes("// un pick pouvait être vérifié contre le score d'un AUTRE jour)."));

// ── 4. Vérification NBA date-aware ──
check('cron: pickDatedResultMatch existe', cron.includes('function pickDatedResultMatch'));
check('cron: verifyNBAResults utilise pickDatedResultMatch', /const matchEntry = pickDatedResultMatch\(prediction, nbaResults\)/.test(cron));
check('cron: tolérance date ±1.5 jour', cron.includes('d <= 1.5'));
check('cron: placeholder T12:00 → comportement antérieur', cron.includes('isPlaceholderDate') && cron.includes('T12:00:00'));

// ── Logique espnDateToISO / dayDistance (sémantique copiée) ──
function espnDateToISO(espnDate?: string): string | null {
  if (!espnDate || espnDate.length !== 8 || !/^\d{8}$/.test(espnDate)) return null;
  return `${espnDate.slice(0, 4)}-${espnDate.slice(4, 6)}-${espnDate.slice(6, 8)}`;
}
function dayDistance(a: string, b: string): number | null {
  const da = new Date(a + 'T12:00:00Z').getTime();
  const dbb = new Date(b + 'T12:00:00Z').getTime();
  if (!Number.isFinite(da) || !Number.isFinite(dbb)) return null;
  return Math.abs(da - dbb) / 86400000;
}
check('espnDateToISO: 20261014 → 2026-10-14', espnDateToISO('20261014') === '2026-10-14');
check('espnDateToISO: invalide → null', espnDateToISO('2026101') === null && espnDateToISO(undefined) === null);
check('dayDistance: même jour = 0', dayDistance('2026-10-14', '2026-10-14') === 0);
check('dayDistance: J+1 = 1 (toléré)', dayDistance('2026-10-14', '2026-10-15') === 1);
check('dayDistance: J+3 = 3 (rejeté)', dayDistance('2026-10-14', '2026-10-17') === 3);

// ── Scénario end-to-end simplifié: pick du 14 vs résultats du 13/14/15 ──
const predDate = '2026-10-14';
const results = ['20261013', '20261014', '20261015'];
const within = results.map(r => ({ d: dayDistance(espnDateToISO(r)!, predDate) }));
check('scénario: 3 candidats, 3 dans la tolérance ±1.5j', within.filter(w => w.d !== null && w.d! <= 1.5).length === 3);
const resultsFar = ['20261008', '20261009'];
check('scénario: résultats d\'autre semaine → tous rejetés', resultsFar.every(r => (dayDistance(espnDateToISO(r)!, predDate) || 99) > 1.5));

console.log(`\n${pass}/${pass + fail} tests verts`);
process.exit(fail > 0 ? 1 : 0);
