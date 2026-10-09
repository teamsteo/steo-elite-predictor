/**
 * Analyse de rentabilité par sport — bilans enregistrés (table predictions, prod)
 * Source: /api/history?days=365 (Snapshot Supabase via prod) + /api/tennis (v3Stats)
 * Convention identique à sportMetricsService: mise 1u sur le côté prédit,
 * profit = odds_side - 1 si gagné, -1 sinon. Nul/draw exclu (1 cas seulement).
 */
import * as fs from 'fs';

interface HistPred {
  matchId: string; homeTeam: string; awayTeam: string; league: string;
  sport: string; matchDate: string; predictedResult: string;
  confidence: string; oddsHome: number; oddsAway: number;
  status: string; resultMatch: boolean | null; checkedAt: string;
}

const raw = JSON.parse(fs.readFileSync('/home/z/my-project/scripts/history_365.json', 'utf-8')) as { predictions: HistPred[] };
const preds = raw.predictions;

const SPORT_LABEL: Record<string, string> = {
  football: 'Football (soccer)',
  basketball: 'Basketball (NBA)',
  hockey: 'Hockey (NHL)',
  other: 'Baseball (MLB)', // convention verifyMLBResults: sport='other' + league MLB
};

interface Agg {
  n: number; wins: number; losses: number; pending: number; skippedNoOdds: number;
  profit: number; stake: number; oddsSum: number;
}

function newAgg(): Agg { return { n: 0, wins: 0, losses: 0, pending: 0, skippedNoOdds: 0, profit: 0, stake: 0, oddsSum: 0 }; }

function addBet(a: Agg, odds: number, won: boolean | null, status: string) {
  if (status === 'pending' || won === null || won === undefined) { a.pending++; return; }
  if (!odds || odds <= 1.01) { a.skippedNoOdds++; return; }
  a.n++;
  a.stake += 1;
  a.oddsSum += odds;
  if (won) { a.wins++; a.profit += odds - 1; } else { a.losses++; a.profit -= 1; }
}

function roi(a: Agg): number { return a.stake > 0 ? (a.profit / a.stake) * 100 : 0; }
function wr(a: Agg): number { return (a.wins + a.losses) > 0 ? (a.wins / (a.wins + a.losses)) * 100 : 0; }

// ---- Par sport ----
const bySport = new Map<string, Agg>();
const bySportMonth = new Map<string, Map<string, Agg>>();
const bySportLeague = new Map<string, Map<string, Agg>>();
const bySportConf = new Map<string, Map<string, Agg>>();

for (const p of preds) {
  if (p.predictedResult === 'draw') continue; // 1 seul cas, pas d'odds nul stockée
  const sport = p.sport || 'other';
  if (!bySport.has(sport)) bySport.set(sport, newAgg());
  addBet(bySport.get(sport)!, Number(p.oddsSide ?? (p.predictedResult === 'home' ? p.oddsHome : p.oddsAway)), p.resultMatch, p.status);

  // mois
  const month = (p.matchDate || '').slice(0, 7);
  if (!bySportMonth.has(sport)) bySportMonth.set(sport, new Map());
  const mm = bySportMonth.get(sport)!;
  if (!mm.has(month)) mm.set(month, newAgg());
  addBet(mm.get(month)!, Number(p.predictedResult === 'home' ? p.oddsHome : p.oddsAway), p.resultMatch, p.status);

  // ligue
  const league = p.league || 'Unknown';
  if (!bySportLeague.has(sport)) bySportLeague.set(sport, new Map());
  const ll = bySportLeague.get(sport)!;
  if (!ll.has(league)) ll.set(league, newAgg());
  addBet(ll.get(league)!, Number(p.predictedResult === 'home' ? p.oddsHome : p.oddsAway), p.resultMatch, p.status);

  // confiance
  const conf = p.confidence || 'medium';
  if (!bySportConf.has(sport)) bySportConf.set(sport, new Map());
  const cc = bySportConf.get(sport)!;
  if (!cc.has(conf)) cc.set(conf, newAgg());
  addBet(cc.get(conf)!, Number(p.predictedResult === 'home' ? p.oddsHome : p.oddsAway), p.resultMatch, p.status);
}

const line = '─'.repeat(88);
console.log(line);
console.log('RENTABILITÉ PAR SPORT — bilans enregistrés (1u misé sur le côté prédit, cote stockée)');
console.log(line);
console.log(
  'Sport'.padEnd(22) + 'Pari'.padEnd(7) + 'G'.padEnd(5) + 'P'.padEnd(5) +
  'WinRate'.padEnd(10) + 'Profit(u)'.padEnd(11) + 'ROI'.padEnd(9) + 'CoteMoy'
);
const rows = [...bySport.entries()].map(([s, a]) => ({ s, a, r: roi(a) })).sort((x, y) => y.r - x.r);
for (const { s, a } of rows) {
  console.log(
    (SPORT_LABEL[s] || s).padEnd(22) + String(a.n).padEnd(7) + String(a.wins).padEnd(5) + String(a.losses).padEnd(5) +
    (wr(a).toFixed(1) + '%').padEnd(10) + (a.profit >= 0 ? '+' : '') + a.profit.toFixed(2) + 'u'.padEnd(6) +
    ((roi(a) >= 0 ? '+' : '') + roi(a).toFixed(1) + '%').padEnd(9) + (a.n ? (a.oddsSum / a.n).toFixed(2) : '-')
  );
}
console.log(line);

// ---- Détail par mois par sport (stabilité) ----
console.log('\nSTABILITÉ MENSUELLE (ROI% [n]) :');
for (const { s } of rows) {
  const mm = bySportMonth.get(s)!;
  const months = [...mm.entries()].filter(([, a]) => a.n > 0).sort((a, b) => a[0].localeCompare(b[0]));
  const cells = months.map(([m, a]) => `${m.slice(2)}: ${(roi(a) >= 0 ? '+' : '')}${roi(a).toFixed(0)}% [${a.n}]`);
  console.log(`  ${(SPORT_LABEL[s] || s).padEnd(20)} ${cells.join(' | ')}`);
}

// ---- Top ligues par sport (n>=8) ----
console.log('\nLIGUES (n≥8, triées par ROI) :');
for (const { s } of rows) {
  const ll = [...bySportLeague.get(s)!.entries()].filter(([, a]) => a.n >= 8);
  ll.sort((a, b) => roi(b[1]) - roi(a[1]));
  console.log(`  ${SPORT_LABEL[s] || s}:`);
  for (const [l, a] of ll.slice(0, 6)) {
    console.log(`    ${l.padEnd(28)} n=${String(a.n).padEnd(4)} WR=${wr(a).toFixed(0).padStart(3)}% ROI=${(roi(a) >= 0 ? '+' : '')}${roi(a).toFixed(1)}% coteMoy=${(a.oddsSum / a.n).toFixed(2)}`);
  }
  const neg = ll.filter(([, a]) => roi(a) < 0).length;
  console.log(`    → ${ll.filter(([, a]) => roi(a) > 0).length}/${ll.length} ligues positives`);
}

// ---- Par confiance ----
console.log('\nPAR CONFIANCE :');
for (const { s } of rows) {
  const cc = bySportConf.get(s)!;
  const parts = ['high', 'medium', 'low'].filter(c => cc.has(c) && cc.get(c)!.n > 0)
    .map(c => { const a = cc.get(c)!; return `${c}: n=${a.n} WR=${wr(a).toFixed(0)}% ROI=${(roi(a) >= 0 ? '+' : '')}${roi(a).toFixed(1)}%`; });
  console.log(`  ${(SPORT_LABEL[s] || s).padEnd(20)} ${parts.join(' | ')}`);
}

// ---- Sanity: pending & skipped ----
let totPending = 0, totSkipped = 0;
for (const [, a] of bySport) { totPending += a.pending; totSkipped += a.skippedNoOdds; }
console.log(`\n(Sanity: ${totPending} pending exclus, ${totSkipped} sans cote exploitable exclus, 1 draw exclu)`);

// ---- COTES RÉELLES vs ESTIMÉES (empreintes espnOddsService.estimateOdds + défaut 1.85) ----
// Empreintes football: {1.65,5.00} {4.50,1.75} {2.30,3.00} {2.50,2.80} ; défaut {1.85,1.85}
// Sans draw: {1.45,2.80} {2.60,1.50} {1.90,1.90} {1.95,1.85}
const FINGERPRINTS: Array<[number, number]> = [
  [1.65, 5.00], [4.50, 1.75], [2.30, 3.00], [2.50, 2.80], [1.85, 1.85],
  [1.45, 2.80], [2.60, 1.50], [1.90, 1.90], [1.95, 1.85],
];
function classifyOdds(oh: number, oa: number): 'estimée' | 'réelle' {
  for (const [fh, fa] of FINGERPRINTS) {
    if (Math.abs(oh - fh) < 0.011 && Math.abs(oa - fa) < 0.011) return 'estimée';
  }
  if (oh === oa && oh === 1.85) return 'estimée';
  return 'réelle';
}

const bySportOrigin = new Map<string, Map<string, Agg>>();
const drawFp = new Map<string, number>();
for (const p of preds) {
  if (p.predictedResult === 'draw') continue;
  const oh = Number(p.oddsHome), oa = Number(p.oddsAway);
  const sport = p.sport || 'other';
  const side = p.predictedResult === 'home' ? oh : oa;
  if (p.status !== 'pending' && p.resultMatch !== null && p.resultMatch !== undefined && side > 1.01) {
    const origin = classifyOdds(oh, oa);
    if (!bySportOrigin.has(sport)) bySportOrigin.set(sport, new Map());
    const om = bySportOrigin.get(sport)!;
    if (!om.has(origin)) om.set(origin, newAgg());
    addBet(om.get(origin)!, side, p.resultMatch, p.status);
  }
  if (!oh || !oa) drawFp.set(sport, (drawFp.get(sport) || 0) + 1);
}

console.log('\n' + line);
console.log('FIABILITÉ DES COTES ENREGISTRÉES — réelles (marché) vs estimées (fallback modèle)');
console.log(line);
console.log('Sport'.padEnd(22) + 'Origine'.padEnd(11) + 'Pari'.padEnd(7) + 'WinRate'.padEnd(10) + 'Profit(u)'.padEnd(11) + 'ROI');
const sortedOrigins = [...bySportOrigin.entries()].sort((a, b) => roi(bySport.get(a[0])!) - roi(bySport.get(b[0])!));
for (const [s, om] of sortedOrigins) {
  for (const [origin, a] of [...om.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
    console.log(
      (SPORT_LABEL[s] || s).padEnd(22) + origin.padEnd(11) + String(a.n).padEnd(7) +
      (wr(a).toFixed(1) + '%').padEnd(10) + (a.profit >= 0 ? '+' : '') + a.profit.toFixed(2) + 'u'.padEnd(6) +
      ((roi(a) >= 0 ? '+' : '') + roi(a).toFixed(1) + '%')
    );
  }
}
console.log('\nSans cote du tout (exclues): ' + [...drawFp.entries()].map(([s, n]) => `${SPORT_LABEL[s] || s}=${n}`).join(', '));

// ============================================================
// ROI VN RÉEL football — les bilans foot suivent la politique VN
// (Victoire ou Nul = double chance, cf. resultPolicy.vnResultMatch)
// mais odds stockées = cotes 1X2 pures → ROI précédent GONFLÉ.
// Méthode: p_vn_raw = 1/O_side + 1/O_draw ; marge m = Σ(1/O_i) − 1
//          p_vn_marché = p_vn_raw / (1+m) ; cote_VN = 1/p_vn_marché
// ============================================================
interface VnRow { won: boolean; vnOdds: number }

const historyV2 = JSON.parse(fs.readFileSync('/home/z/my-project/scripts/history_365_v2.json', 'utf-8')) as { predictions: any[] };
const fp2 = historyV2.predictions;

const vnRows: VnRow[] = [];
let vnNoDrawOdds = 0;
const vnByRisk = new Map<string, Agg & { stakesVn: number; profitVn: number }>();
for (const p of fp2) {
  if (p.sport !== 'football' || p.predictedResult === 'draw') continue;
  if (p.status === 'pending' || p.resultMatch === null || p.resultMatch === undefined) continue;
  const oh = Number(p.oddsHome), od = Number(p.oddsDraw), oa = Number(p.oddsAway);
  const side = p.predictedResult === 'home' ? oh : oa;
  if (!side || side <= 1.01) continue;
  const risk = (p.riskPercentage ?? 50) <= 50 ? 'fiable (≤50)' : 'risqué (>50)';
  if (!vnByRisk.has(risk)) vnByRisk.set(risk, { ...newAgg(), stakesVn: 0, profitVn: 0 });

  const a = vnByRisk.get(risk)!;
  a.n++; a.stake += 1;
  if (p.resultMatch) a.wins++; else a.losses++;

  if (!od || od <= 1.01) { vnNoDrawOdds++; continue; } // pas de cote nul → VN non chiffrable
  const m = 1 / oh + 1 / od + 1 / oa - 1;
  if (m < 0 || m > 0.5) continue; // trio incohérent → ignorer
  const pVn = (1 / side + 1 / od) / (1 + m);
  const vnOdds = 1 / pVn;
  if (p.resultMatch) { vnRows.push({ won: true, vnOdds }); a.profitVn += vnOdds - 1; a.profit += vnOdds - 1; }
  else { vnRows.push({ won: false, vnOdds }); a.profitVn -= 1; a.profit -= 1; }
  a.stakesVn += 1;
  a.oddsSum += vnOdds;
}

console.log('\n' + line);
console.log('FOOTBALL — ROI RÉEL EN MODE VN (Victoire ou Nul, cote double chance reconstituée)');
console.log(line);
for (const [risk, a] of vnByRisk) {
  const roiVn = a.stakesVn > 0 ? (a.profitVn / a.stakesVn) * 100 : 0;
  console.log(
    `  ${risk.padEnd(14)} n=${String(a.n).padEnd(4)} WR_VN=${wr(a).toFixed(1).padStart(5)}% ` +
    `ROI_VN=${(roiVn >= 0 ? '+' : '') + roiVn.toFixed(1)}% ` +
    `(cote_VN moy=${a.stakesVn ? (a.oddsSum / a.stakesVn).toFixed(2) : '-'}, ${a.stakesVn}/${a.n} chiffrables)`
  );
}
const totalVn = vnRows.length;
const profitVnAll = vnRows.reduce((s, r) => s + (r.won ? r.vnOdds - 1 : -1), 0);
const wrVnAll = vnRows.filter(r => r.won).length / Math.max(1, totalVn) * 100;
console.log(`  TOTAL: n=${totalVn} chiffrables, WR_VN=${wrVnVnFix(wrVnAll)}%, ROI_VN=${((profitVnAll / Math.max(1, totalVn)) * 100 >= 0 ? '+' : '')}${(profitVnAll / Math.max(1, totalVn) * 100).toFixed(1)}% | ${vnNoDrawOdds} rows sans cote nul (non chiffrables)`);
function wrVnVnFix(x: number) { return x.toFixed(1); }
