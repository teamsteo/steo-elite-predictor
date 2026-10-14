/**
 * POST /api/combo-private
 * Génère un combo foot multi-jours (cote ≥10, risque ≤25%/sélection)
 * et l'envoie dans la boîte privée Telegram.
 *
 * Auth: bearer token (CRON_SECRET ou param ?token=)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getMatchesWithRealOdds, invalidateEspnCache, detectValueBets } from '@/lib/combinedDataService';
import { getBatchPredictions, type UnifiedPredictionInput } from '@/lib/unifiedPredictionService';
import { sendTelegramPersonalMessage } from '@/lib/telegramService';

const FOOTBALL_SPORTS = new Set(['Football', 'football']);
const MAX_RISK = 25; // % max par sélection
const MIN_COMBINED_ODDS = 10;
const MIN_LEGS = 3;
const MAX_LEGS = 7;

interface MatchCandidate {
  homeTeam: string;
  awayTeam: string;
  league: string;
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
  kellyStake: number;
  selectedOdds: number;
}

function selectOdds(
  result: string,
  oddsHome: number,
  oddsDraw: number | null,
  oddsAway: number,
): number {
  if (result === 'home') return oddsHome;
  if (result === 'away') return oddsAway;
  return oddsDraw ?? 3.0;
}

function betLabel(result: string, homeTeam: string, awayTeam: string): string {
  if (result === 'home') return `Victoire ${homeTeam}`;
  if (result === 'away') return `Victoire ${awayTeam}`;
  return 'Match Nul';
}

function formatMatchDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const jours = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const mois = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jui', 'aoû', 'sep', 'oct', 'nov', 'déc'];
    return `${jours[d.getDay()]} ${d.getDate()} ${mois[d.getMonth()]}`;
  } catch {
    return dateStr.split('T')[0];
  }
}

/**
 * Sélectionne le meilleur combo par recherche gloutonne optimisée.
 * On trie par proba de gain décroissante, puis on ajoute des matchs
 * tant que la cote combinée < 10 et le risque individuel ≤ 25%.
 */
function buildBestCombo(candidates: MatchCandidate[]): MatchCandidate[] | null {
  if (candidates.length < MIN_LEGS) return null;

  // Trier par winProbability décroissante (les plus fiables d'abord)
  const sorted = [...candidates].sort((a, b) => b.winProbability - a.winProbability);

  // Stratégie gloutonne : prendre les plus fiables d'abord,
  // puis ajouter pour atteindre cote ≥10
  let combo: MatchCandidate[] = [];
  let combinedOdds = 1;

  // Phase 1 : prendre les plus sûrs (risk ≤ 20%)
  for (const c of sorted) {
    if (combo.length >= MAX_LEGS) break;
    if (c.riskPercentage > MAX_RISK) continue;
    if (c.selectedOdds < 1.15) continue; // éviter les cotes trop basses (peu de valeur dans un combo)
    combo.push(c);
    combinedOdds *= c.selectedOdds;
    if (combinedOdds >= MIN_COMBINED_ODDS) break;
  }

  // Phase 2 : si on n'atteint pas 10, ajouter des matchs à risque 20-25%
  if (combinedOdds < MIN_COMBINED_ODDS) {
    const remaining = sorted.filter(
      (c) => !combo.includes(c) && c.riskPercentage <= MAX_RISK && c.selectedOdds >= 1.15,
    );
    for (const c of remaining) {
      if (combo.length >= MAX_LEGS) break;
      if (combinedOdds * c.selectedOdds > 25) continue; // ne pas dépasser cote 25
      combo.push(c);
      combinedOdds *= c.selectedOdds;
      if (combinedOdds >= MIN_COMBINED_ODDS) break;
    }
  }

  if (combo.length < MIN_LEGS) return null;
  if (combinedOdds < MIN_COMBINED_ODDS) return null;

  return combo;
}

function formatComboMessage(combo: MatchCandidate[]): string {
  const combinedOdds = combo.reduce((acc, c) => acc * c.selectedOdds, 1);
  const combinedWinProb = combo.reduce((acc, c) => acc * (c.winProbability / 100), 1);
  const ev = combinedOdds * combinedWinProb - 1;
  const dateParts = [...new Set(combo.map((c) => formatMatchDate(c.date)))];

  let msg = '╔═════════════════════════════════════════╗\n';
  msg += '║                                       ║\n';
  msg += '║   🎯 <b>COMBO MULTI-JOURS FOOT</b>        ║\n';
  msg += '║   ⚽ Risque max 25% / sélection          ║\n';
  msg += '║                                       ║\n';
  msg += '╚═════════════════════════════════════════╝\n\n';

  msg += `📅 <b>Période</b> : ${dateParts.join(' + ')}\n`;
  msg += `📊 <b>Cote combinée</b> : <code>${combinedOdds.toFixed(2)}</code>\n`;
  msg += `🎯 <b>Prob. cumulée</b> : ${(combinedWinProb * 100).toFixed(1)}%\n`;
  msg += `💰 <b>Valeur attendue</b> : ${(ev >= 0 ? '+' : '') + (ev * 100).toFixed(1)}%\n`;
  msg += `📈 <b>${combo.length} sélections</b>\n\n`;
  msg += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  combo.forEach((c, i) => {
    const dateLabel = formatMatchDate(c.date);
    const riskBar = c.riskPercentage <= 15 ? '🟢' : c.riskPercentage <= 20 ? '🟡' : '🟠';
    const confLabel = c.confidence === 'high' ? 'FIABLE' : c.confidence === 'medium' ? 'MOYEN' : 'FAIBLE';
    const vbLabel = c.valueBetDetected ? '💎 VB' : '';

    msg += `<b>${i + 1}.</b> ${c.homeTeam} vs ${c.awayTeam}\n`;
    msg += `   🏆 ${c.league}\n`;
    msg += `   📅 ${dateLabel}\n`;
    msg += `   ✅ <b>${betLabel(c.predictedResult, c.homeTeam, c.awayTeam)}</b>\n`;
    msg += `   💰 Cote : <code>${c.selectedOdds.toFixed(2)}</code>  ${riskBar} Risque ${c.riskPercentage}%  🔒 ${confLabel} ${vbLabel}\n`;
    if (c.reasoning && c.reasoning.length > 0) {
      msg += `   💡 ${c.reasoning.slice(0, 2).join(' | ')}\n`;
    }
    msg += '\n';
  });

  msg += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  msg += `🎯 <b>Cote totale : ${combinedOdds.toFixed(2)}</b>\n`;
  msg += `📈 <b>Proba. gain : ${(combinedWinProb * 100).toFixed(1)}%</b>\n`;
  msg += `💰 <b>VE : ${(ev >= 0 ? '+' : '') + (ev * 100).toFixed(1)}%</b>\n\n`;
  msg += '⚠️ <i>Combo à risque contrôlé — chaque sélection ≤ 25% de risque.</i>\n';
  msg += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  return msg;
}

// GET handler pour le cron Vercel (envoie GET par défaut, pas POST)
export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  try {
    // Auth : CRON_SECRET ou param combo_key (pour appel manuel unique)
    const authHeader = request.headers.get('authorization');
    const tokenParam = new URL(request.url).searchParams.get('token');
    const comboKey = new URL(request.url).searchParams.get('combo_key');
    const cronSecret = process.env.CRON_SECRET;
    const token = authHeader?.replace('Bearer ', '') || tokenParam;

    // Accès via combo_key (single-use, à changer après usage)
    if (comboKey === 'steo-combo-aout-2026' || (cronSecret && token === cronSecret)) {
      // OK
    } else if (cronSecret && token) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    console.log('🎯 [COMBO PRIVATE] Début génération combo multi-jours...');

    // 1. Récupérer les matchs via pipeline standard (ESPN hier/aujourd'hui/demain)
    invalidateEspnCache();
    let matches = await getMatchesWithRealOdds(true);

    // 2. Si pas assez de foot, étendre à J+2 et J+3 via ESPN direct
    const footMatches = matches?.filter((m: any) => FOOTBALL_SPORTS.has(m.sport) && !m.isFinished && !m.isEstimated && m.oddsHome > 0 && m.oddsAway > 0) || [];
    
    if (footMatches.length < 5) {
      console.log(`⚠️ Seulement ${footMatches.length} matchs foot — extension à J+2/J+3`);
      const FOOTBALL_ESPN_KEYS = [
        'soccer/eng.1', 'soccer/esp.1', 'soccer/ita.1', 'soccer/ger.1', 'soccer/fra.1',
        'soccer/uefa.champions', 'soccer/uefa.europa', 'soccer/uefa.europa.conf',
        'soccer/por.1', 'soccer/ned.1', 'soccer/bel.1', 'soccer/tur.1', 'soccer/gre.1',
        'soccer/usa.1', 'soccer/mex.1', 'soccer/arg.1', 'soccer/bra.1',
        'soccer/fra.2', 'soccer/eng.2', 'soccer/eng.3', 'soccer/esp.2', 'soccer/ita.2', 'soccer/ger.2',
        'soccer/scotland', 'soccer/ger.3',
      ];
      
      const extraDates: string[] = [];
      for (let d = 2; d <= 4; d++) {
        const dt = new Date();
        dt.setUTCDate(dt.getUTCDate() + d);
        extraDates.push(dt.toISOString().split('T')[0]);
      }
      
      const extraPromises: Promise<any[]>[] = [];
      for (const date of extraDates) {
        for (const sportKey of FOOTBALL_ESPN_KEYS) {
          extraPromises.push(
            fetch(`https://site.api.espn.com/apis/site/v2/sports/${sportKey}/scoreboard?dates=${date}`)
              .then(r => r.json())
              .then(data => {
                const events = data?.events || [];
                return events.map((ev: any) => {
                  const comp = ev.competitions?.[0];
                  const homeTeam = comp?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.displayName || '';
                  const awayTeam = comp?.competitors?.find((c: any) => c.homeAway === 'away')?.team?.displayName || '';
                  return {
                    id: ev.id,
                    homeTeam,
                    awayTeam,
                    league: ev.league?.name || sportKey,
                    sport: 'Football',
                    date: ev.date || `${date}T00:00:00Z`,
                    isFinished: ev.status?.type?.completed || false,
                    isEstimated: false,
                    oddsHome: comp?.odds?.[0]?.homeTeamOdds?.value || 0,
                    oddsDraw: comp?.odds?.[0]?.drawOdds?.value || null,
                    oddsAway: comp?.odds?.[0]?.awayTeamOdds?.value || 0,
                  };
                });
              })
              .catch(() => []),
          );
        }
      }
      
      const extraResults = await Promise.all(extraPromises);
      const extraMatches = extraResults.flat().filter(
        (m: any) => m.homeTeam && m.awayTeam && m.oddsHome > 0 && m.oddsAway > 0 && !m.isFinished,
      );
      
      console.log(`📡 +${extraMatches.length} matchs foot supplémentaires (J+2 à J+4)`);
      matches = [...(matches || []), ...extraMatches];
    }

    if (!matches || matches.length === 0) {
      console.log('⚠️ getMatchesWithRealOdds a retourné un tableau vide');
    }

    // Filtrer les matchs foot avec cotes réelles
    const footballMatches = (matches || []).filter(
      (m: any) =>
        FOOTBALL_SPORTS.has(m.sport) &&
        !m.isFinished &&
        !m.isEstimated &&
        m.oddsHome > 0 &&
        m.oddsAway > 0,
    );

    console.log(`⚽ ${footballMatches.length} matchs foot éligibles`);

    if (footballMatches.length === 0) {
      const trèveMsg =
        '╔═════════════════════════════════════════╗\n' +
        '║                                       ║\n' +
        '║   🎯 <b>COMBO MULTI-JOURS FOOT</b>        ║\n' +
        '║                                       ║\n' +
        '╚═════════════════════════════════════════╝\n\n' +
        '⏳ <b>Trêve internationale</b> — aucun match foot avec cotes disponibles.\n\n' +
        `📊 ${matches.length} matchs trouvés (autres sports), 0 foot.\n\n` +
        '🔄 Le combo sera généré automatiquement dès que des matchs foot seront disponibles.\n' +
        '📅 Prochaines journées de ligue : probablement après la trêve FIFA.\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

      await sendTelegramPersonalMessage(trèveMsg);
      return NextResponse.json({ error: 'Trêve internationale', totalMatches: matches.length, footballMatches: 0 });
    }

    // 3. Pipeline ML
    const dateLookup = new Map<string, string>();
    const mlInputs: UnifiedPredictionInput[] = footballMatches.map((m: any) => {
      if (m.date) dateLookup.set(`${m.homeTeam}|${m.awayTeam}|${m.league || ''}`, m.date);
      return {
        id: m.id || `espn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        sport: 'Foot' as const,
        league: m.league || 'Unknown',
        oddsHome: m.oddsHome,
        oddsDraw: m.oddsDraw || null,
        oddsAway: m.oddsAway,
      };
    });

    let mlPreds: any[] = [];
    try {
      mlPreds = await getBatchPredictions(mlInputs);
      console.log(`🧠 ${mlPreds.length} prédictions ML`);
    } catch (mlErr: any) {
      console.log(`⚠️ ML échoué: ${mlErr.message}`);
    }

    // 4. Convertir en candidats combo
    const candidates: MatchCandidate[] = [];

    const predList = mlPreds.length > 0
      ? mlPreds
          .filter((p: any) => p.recommendation.bet !== 'avoid' && p.mlPrediction.confidence !== 'low')
          .map((p: any) => {
            const bet = p.recommendation.bet;
            const isHome = bet === 'home';
            const isAway = bet === 'away';
            const winProb = isHome ? p.mlPrediction.homeProb : isAway ? p.mlPrediction.awayProb : p.mlPrediction.drawProb;
            const risk = Math.round(100 - winProb);
            const selOdds = isHome ? p.odds.home : isAway ? p.odds.away : p.odds.draw || 3.0;
            const date = dateLookup.get(`${p.homeTeam}|${p.awayTeam}|${p.league || ''}`);

            return {
              homeTeam: p.homeTeam,
              awayTeam: p.awayTeam,
              league: p.league,
              date: date || '',
              sport: 'football',
              predictedResult: bet as 'home' | 'draw' | 'away',
              oddsHome: p.odds.home,
              oddsDraw: p.odds.draw,
              oddsAway: p.odds.away,
              riskPercentage: risk,
              winProbability: winProb,
              confidence: p.mlPrediction.confidence,
              valueBetDetected: p.mlPrediction.valueBet,
              edge: p.mlPrediction.edge || 0,
              reasoning: p.recommendation.reasoning || [],
              kellyStake: p.recommendation.kellyStake || 0,
              selectedOdds: selOdds,
            };
          })
      : // Fallback: utiliser les probas implicites des cotes
        footballMatches.map((m: any) => {
          const impliedHome = 1 / m.oddsHome;
          const impliedAway = 1 / m.oddsAway;
          const impliedDraw = m.oddsDraw ? 1 / m.oddsDraw : 0;
          const margin = impliedHome + impliedAway + impliedDraw - 1;
          const vigAdj = margin > 0 ? 1 + margin : 1;

          const probHome = impliedHome / vigAdj;
          const probAway = impliedAway / vigAdj;
          const probDraw = impliedDraw / vigAdj;

          // Choisir le résultat le plus probable
          let bestResult: 'home' | 'draw' | 'away' = 'home';
          let bestProb = probHome;
          if (probAway > bestProb) { bestResult = 'away'; bestProb = probAway; }
          if (probDraw > bestProb) { bestResult = 'draw'; bestProb = probDraw; }

          const risk = Math.round(100 - bestProb * 100);
          const selOdds = bestResult === 'home' ? m.oddsHome : bestResult === 'away' ? m.oddsAway : m.oddsDraw || 3.0;

          return {
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
            league: m.league || 'Unknown',
            date: m.date || '',
            sport: 'football',
            predictedResult: bestResult,
            oddsHome: m.oddsHome,
            oddsDraw: m.oddsDraw || null,
            oddsAway: m.oddsAway,
            riskPercentage: risk,
            winProbability: Math.round(bestProb * 100),
            confidence: risk <= 20 ? 'medium' : 'low',
            valueBetDetected: false,
            edge: 0,
            reasoning: [],
            kellyStake: 0,
            selectedOdds: selOdds,
          };
        });

    // 5. Filtrer : risque ≤ 25%, cote ≥ 1.15
    const eligible = predList.filter(
      (c) => c.riskPercentage <= MAX_RISK && c.selectedOdds >= 1.15,
    );

    console.log(`🎯 ${eligible.length} candidats éligibles (risque ≤${MAX_RISK}%, cote ≥1.15)`);

    if (eligible.length < MIN_LEGS) {
      // Envoyer quand même un message informatif
      const infoMsg =
        '╔═════════════════════════════════════════╗\n' +
        '║                                       ║\n' +
        '║   🎯 <b>COMBO MULTI-JOURS FOOT</b>        ║\n' +
        '║                                       ║\n' +
        '╚═════════════════════════════════════════╝\n\n' +
        `⚠️ <b>${eligible.length} matchs éligibles</b> (minimum ${MIN_LEGS} requis)\n\n` +
        `📊 Matchs foot avec cotes : ${footballMatches.length}\n` +
        `🎯 Avec risque ≤${MAX_RISK}% : ${eligible.length}\n\n` +
        (eligible.length > 0
          ? 'Matchs disponibles :\n' +
            eligible
              .slice(0, 5)
              .map(
                (c) =>
                  `  • ${c.homeTeam} vs ${c.awayTeam} (${c.league}) — ${c.riskPercentage}% risque @${c.selectedOdds.toFixed(2)}`,
              )
              .join('\n') +
            (eligible.length > 5 ? `\n  ... et ${eligible.length - 5} autres` : '')
          : '') +
        '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

      await sendTelegramPersonalMessage(infoMsg);
      return NextResponse.json({
        success: false,
        message: `Pas assez de candidats (${eligible.length}/${MIN_LEGS})`,
        candidates: eligible.length,
      });
    }

    // 6. Construire le combo optimal
    const combo = buildBestCombo(eligible);

    if (!combo) {
      await sendTelegramPersonalMessage(
        '⚠️ <b>Combo impossible</b> : pas assez de sélections pour atteindre cote ≥' +
          MIN_COMBINED_ODDS +
          ' avec risque ≤' +
          MAX_RISK +
          '%\n Candidats disponibles : ' +
          eligible.length,
      );
      return NextResponse.json({ success: false, message: 'Combo impossible (cote < 10)' });
    }

    // 7. Formater et envoyer
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
          date: formatMatchDate(c.date),
          result: c.predictedResult,
          odds: +c.selectedOdds.toFixed(2),
          risk: c.riskPercentage,
          confidence: c.confidence,
        })),
      },
    });
  } catch (e: any) {
    console.error('❌ [COMBO PRIVATE] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
