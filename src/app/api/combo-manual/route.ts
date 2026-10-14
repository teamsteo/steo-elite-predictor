/**
 * POST /api/combo-manual
 * Endpoint temporaire pour générer un combo à partir de matchs fournis manuellement.
 * Passe les matchs au ML, sélectionne le meilleur combo, envoie en Telegram DM.
 * À SUPPRIMER après usage.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getBatchPredictions, type UnifiedPredictionInput } from '@/lib/unifiedPredictionService';
import { sendTelegramPersonalMessage } from '@/lib/telegramService';

const MAX_RISK = 25;
const MIN_COMBINED_ODDS = 10;
const MIN_LEGS = 3;
const MAX_LEGS = 7;

interface ManualMatch {
  home: string;
  away: string;
  league: string;
  flag: string;
  date: string;
  oddsH: number;
  oddsD: number;
  oddsA: number;
}

interface MatchCandidate {
  homeTeam: string;
  awayTeam: string;
  league: string;
  flag: string;
  date: string;
  sport: string;
  predictedResult: 'home' | 'draw' | 'away';
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  riskPercentage: number;
  winProbability: number;
  confidence: string;
  valueBetDetected: boolean;
  edge: number;
  reasoning: string[];
  selectedOdds: number;
  betLabel: string;
}

function vigAdjustedProb(oddsH: number, oddsD: number, oddsA: number) {
  const impH = 1 / oddsH;
  const impD = 1 / oddsD;
  const impA = 1 / oddsA;
  const margin = impH + impD + impA - 1;
  const adj = 1 + margin;
  return { probH: impH / adj, probD: impD / adj, probA: impA / adj };
}

function buildBestCombo(candidates: MatchCandidate[]): MatchCandidate[] | null {
  if (candidates.length < MIN_LEGS) return null;

  const sorted = [...candidates].sort((a, b) => b.winProbability - a.winProbability);
  let combo: MatchCandidate[] = [];
  let combinedOdds = 1;

  // Phase 1 : safest (risk <= 20%)
  for (const c of sorted) {
    if (combo.length >= MAX_LEGS) break;
    if (c.riskPercentage > MAX_RISK) continue;
    if (c.selectedOdds < 1.15) continue;
    if (combinedOdds * c.selectedOdds > 25) continue;
    combo.push(c);
    combinedOdds *= c.selectedOdds;
    if (combinedOdds >= MIN_COMBINED_ODDS) break;
  }

  // Phase 2 : add 20-25% risk if needed
  if (combinedOdds < MIN_COMBINED_ODDS) {
    const remaining = sorted.filter(
      (c) => !combo.includes(c) && c.riskPercentage <= MAX_RISK && c.selectedOdds >= 1.15,
    );
    for (const c of remaining) {
      if (combo.length >= MAX_LEGS) break;
      if (combinedOdds * c.selectedOdds > 25) continue;
      combo.push(c);
      combinedOdds *= c.selectedOdds;
      if (combinedOdds >= MIN_COMBINED_ODDS) break;
    }
  }

  if (combo.length < MIN_LEGS || combinedOdds < MIN_COMBINED_ODDS) return null;
  return combo;
}

function formatComboMessage(combo: MatchCandidate[]): string {
  const combinedOdds = combo.reduce((acc, c) => acc * c.selectedOdds, 1);
  const combinedWinProb = combo.reduce((acc, c) => acc * (c.winProbability / 100), 1);
  const ev = combinedOdds * combinedWinProb - 1;
  const dates = [...new Set(combo.map((c) => c.date))].sort();

  let msg = '╔' + '═'.repeat(39) + '╗\n';
  msg += '║' + ' '.repeat(39) + '║\n';
  msg += '║   \U0001f3af <b>COMBO MULTI-JOURS FOOT</b>        \u2551\n';
  msg += '║   \u26bd 5 Grands Championnats Europ\u00e9ens \u2551\n';
  msg += '║   \U0001f6e1\ufe0f Risque max 25% / s\u00e9lection          \u2551\n';
  msg += '║' + ' '.repeat(39) + '\u2551\n';
  msg += '╚' + '═'.repeat(39) + '\u255d\n\n';

  msg += `\U0001f4c5 <b>P\u00e9riode</b> : ${dates.join(' + ')}\n`;
  msg += `\U0001f4ca <b>Cote combin\u00e9e</b> : <code>${combinedOdds.toFixed(2)}</code>\n`;
  msg += `\U0001f3af <b>Prob. cumul\u00e9e</b> : ${(combinedWinProb * 100).toFixed(1)}%\n`;
  msg += `\U0001f4b0 <b>Valeur attendue</b> : ${(ev >= 0 ? '+' : '') + (ev * 100).toFixed(1)}%\n`;
  msg += `\U0001f4c8 <b>${combo.length} s\u00e9lections</b>\n\n`;
  msg += '\u2501'.repeat(37) + '\n\n';

  combo.forEach((c, i) => {
    const riskBar = c.riskPercentage <= 15 ? '\U0001f7e2' : c.riskPercentage <= 20 ? '\U0001f7e1' : '\U0001f7e0';
    const vbBadge = c.valueBetDetected ? ' \u2b50 VB' : '';

    msg += `<b>${i + 1}. ${c.betLabel}</b>\n`;
    msg += `   ${c.flag} ${c.league}\n`;
    msg += `   ${c.homeTeam} vs ${c.awayTeam}\n`;
    msg += `   \U0001f552 ${c.date}\n`;
    msg += `   \U0001f4b0 Cote : <code>${c.selectedOdds.toFixed(2)}</code> | `;
    msg += `\U0001f3af Proba : ${c.winProbability.toFixed(1)}% | `;
    msg += `Risque : ${c.riskPercentage.toFixed(1)}% ${riskBar}${vbBadge}\n`;
    if (c.reasoning.length > 0) {
      msg += `   \U0001f4ad ${c.reasoning.slice(0, 2).join(' | ')}\n`;
    }
    msg += '\n';
  });

  msg += '\u2501'.repeat(37) + '\n\n';

  // Bankroll sim
  const stake = 1000;
  const potentialWin = stake * combinedOdds;
  msg += `\U0001f4b3 <b>Simulation bankroll</b>\n`;
  const fmt = (n: number) => n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  msg += `   Mise : ${fmt(stake)}F \u2192 Gain potentiel : <b>${fmt(potentialWin)}F</b>\n`;
  msg += `   Profit net : +${fmt(potentialWin - stake)}F\n\n`;

  const riskLevel = combinedWinProb >= 0.25 ? '\U0001f7e2 CONTR\u00d4L\u00c9' : combinedWinProb >= 0.15 ? '\U0001f7e1 MOD\u00c9R\u00c9' : '\U0001f7e0 RISQU\u00c9';
  msg += `\U0001f6e1\ufe0f Niveau de risque global : <b>${riskLevel}</b>\n`;
  msg += `\u26a0\ufe0f <i>Combo \u00e0 risque contr\u00f4l\u00e9 \u2014 chaque s\u00e9lection \u2264 25% de risque.</i>\n`;
  msg += '\u2501'.repeat(37);

  return msg;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const matches: ManualMatch[] = body.matches;

    if (!matches || matches.length === 0) {
      return NextResponse.json({ error: 'Aucun match fourni' }, { status: 400 });
    }

    console.log(`\U0001f3af [COMBO MANUAL] ${matches.length} matchs re\u00e7us`);

    // 1. Pr\u00e9parer les inputs ML
    const mlInputs: UnifiedPredictionInput[] = matches.map((m, i) => ({
      id: `manual_${Date.now()}_${i}`,
      homeTeam: m.home,
      awayTeam: m.away,
      sport: 'Foot' as const,
      league: m.league,
      oddsHome: m.oddsH,
      oddsDraw: m.oddsD,
      oddsAway: m.oddsA,
    }));

    // 2. Pipeline ML
    let mlPreds: any[] = [];
    try {
      mlPreds = await getBatchPredictions(mlInputs);
      console.log(`\U0001f9e0 ${mlPreds.length} pr\u00e9dictions ML obtenues`);
    } catch (mlErr: any) {
      console.error(`\u26a0\ufe0f ML \u00e9chou\u00e9: ${mlErr.message}`);
    }

    // 3. Convertir en candidats
    const candidates: MatchCandidate[] = [];

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];

      if (mlPreds.length > 0 && mlPreds[i]) {
        const p = mlPreds[i];
        const bet = p.recommendation?.bet;
        if (!bet || bet === 'avoid' || p.mlPrediction?.confidence === 'low') continue;

        const isHome = bet === 'home';
        const isAway = bet === 'away';
        const winProb = isHome ? p.mlPrediction.homeProb : isAway ? p.mlPrediction.awayProb : p.mlPrediction.drawProb;
        const risk = 100 - winProb;
        const selOdds = isHome ? p.odds.home : isAway ? p.odds.away : (p.odds.draw || 3.0);

        const resultLabel = isHome ? '1' : isAway ? '2' : 'X';
        const betTeam = isHome ? m.home : isAway ? m.away : 'Match Nul';

        candidates.push({
          homeTeam: m.home,
          awayTeam: m.away,
          league: m.league,
          flag: m.flag,
          date: m.date,
          sport: 'football',
          predictedResult: bet as 'home' | 'draw' | 'away',
          oddsHome: m.oddsH,
          oddsDraw: m.oddsD,
          oddsAway: m.oddsA,
          riskPercentage: Math.round(risk * 10) / 10,
          winProbability: Math.round(winProb * 10) / 10,
          confidence: p.mlPrediction?.confidence || 'medium',
          valueBetDetected: p.mlPrediction?.valueBet || false,
          edge: p.mlPrediction?.edge || 0,
          reasoning: p.recommendation?.reasoning || [],
          selectedOdds: selOdds,
          betLabel: `Victoire ${betTeam}`,
        });
      } else {
        // Fallback: probas implicites
        const { probH, probD, probA } = vigAdjustedProb(m.oddsH, m.oddsD, m.oddsA);
        let bestProb = probH;
        let result: 'home' | 'draw' | 'away' = 'home';
        let betLabel = `Victoire ${m.home}`;
        let selOdds = m.oddsH;
        if (probA > bestProb) {
          bestProb = probA; result = 'away'; selOdds = m.oddsA;
          betLabel = `Victoire ${m.away}`;
        }
        if (probD > bestProb) {
          bestProb = probD; result = 'draw'; selOdds = m.oddsD;
          betLabel = 'Match Nul';
        }

        candidates.push({
          homeTeam: m.home,
          awayTeam: m.away,
          league: m.league,
          flag: m.flag,
          date: m.date,
          sport: 'football',
          predictedResult: result,
          oddsHome: m.oddsH,
          oddsDraw: m.oddsD,
          oddsAway: m.oddsA,
          riskPercentage: Math.round((1 - bestProb) * 1000) / 10,
          winProbability: Math.round(bestProb * 1000) / 10,
          confidence: (1 - bestProb) <= 0.20 ? 'medium' : 'low',
          valueBetDetected: false,
          edge: 0,
          reasoning: [],
          selectedOdds: selOdds,
          betLabel,
        });
      }
    }

    // 4. Filtrer risque <= 25%, cote >= 1.15
    const eligible = candidates.filter(
      (c) => c.riskPercentage <= MAX_RISK && c.selectedOdds >= 1.15,
    );

    console.log(`\U0001f3af ${eligible.length} candidats \u00e9ligibles (risque <=${MAX_RISK}%)`);

    if (eligible.length < MIN_LEGS) {
      // Envoyer rapport \u00e0 Telegram
      let infoMsg = '\u2554' + '\u2550'.repeat(39) + '\u2557\n';
      infoMsg += '\u2551   \U0001f3af <b>COMBO MANUAL - ANALYSE</b>           \u2551\n';
      infoMsg += '\u255a' + '\u2550'.repeat(39) + '\u255d\n\n';
      infoMsg += `\u26a0\ufe0f <b>${eligible.length} matchs \u00e9ligibles</b> (minimum ${MIN_LEGS} requis)\n\n`;

      // Trier tous les candidats par risque
      const allSorted = [...candidates].sort((a, b) => a.riskPercentage - b.riskPercentage);
      infoMsg += '<b>Top 10 par fiabilit\u00e9 :</b>\n';
      allSorted.slice(0, 10).forEach((c, i) => {
        const riskBar = c.riskPercentage <= 15 ? '\U0001f7e2' : c.riskPercentage <= 20 ? '\U0001f7e1' : c.riskPercentage <= 25 ? '\U0001f7e0' : '\U0001f534';
        infoMsg += `  ${i + 1}. ${c.betLabel} @${c.selectedOdds.toFixed(2)} | ${c.winProbability.toFixed(1)}% | ${c.riskPercentage.toFixed(1)}% ${riskBar}\n`;
        infoMsg += `     ${c.homeTeam} vs ${c.awayTeam} (${c.league})\n`;
      });

      await sendTelegramPersonalMessage(infoMsg);
      return NextResponse.json({
        success: false,
        message: `Pas assez de candidats (${eligible.length}/${MIN_LEGS})`,
        candidates: eligible.length,
        allCandidates: candidates.map(c => ({
          match: `${c.homeTeam} vs ${c.awayTeam}`,
          bet: c.betLabel,
          odds: c.selectedOdds,
          prob: c.winProbability,
          risk: c.riskPercentage,
          source: c.reasoning.length > 0 ? 'ML' : 'implied',
        })),
      });
    }

    // 5. Construire le combo
    const combo = buildBestCombo(eligible);

    if (!combo) {
      await sendTelegramPersonalMessage(
        `\u26a0\ufe0f <b>Combo impossible</b> : ${eligible.length} candidats mais cote < ${MIN_COMBINED_ODDS} avec risque <=${MAX_RISK}%`,
      );
      return NextResponse.json({ success: false, message: 'Combo impossible (cote < 10)' });
    }

    // 6. Formater et envoyer
    const message = formatComboMessage(combo);
    const sent = await sendTelegramPersonalMessage(message);

    const combinedOdds = combo.reduce((acc, c) => acc * c.selectedOdds, 1);
    const combinedWinProb = combo.reduce((acc, c) => acc * (c.winProbability / 100), 1);

    return NextResponse.json({
      success: sent,
      combo: {
        legs: combo.length,
        combinedOdds: +combinedOdds.toFixed(2),
        combinedWinProb: +(combinedWinProb * 100).toFixed(1),
        selections: combo.map((c) => ({
          match: `${c.homeTeam} vs ${c.awayTeam}`,
          league: c.league,
          date: c.date,
          bet: c.betLabel,
          odds: +c.selectedOdds.toFixed(2),
          prob: c.winProbability,
          risk: c.riskPercentage,
          confidence: c.confidence,
        })),
      },
    });
  } catch (e: any) {
    console.error('\u274c [COMBO MANUAL] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
