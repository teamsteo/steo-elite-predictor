/**
 * POST /api/combo-private — P3 « COMBO GROUPÉ »
 * Génère le combo journalier multi-sports (Football ⚽ + MLB ⚾ — ou un seul sport
 * selon les disponibilités) et l'envoie en DM Telegram privé.
 *
 * P3 — changements vs ancienne version :
 *   1. MLB ajouté : candidats depuis ESPN (getMatchesWithRealOdds) + prédictions
 *      que le pipeline ML a scrapées en base (predictions, sport='baseball', pending).
 *   2. Contradiction mathématique corrigée : cote 10 = OBJECTIF de remplissage
 *      (max 7 legs), plus prérequis bloquant. Dès 2 legs fiables → publication.
 *   3. Caps de risque par sport (foot 25%, MLB 30%) + tier de recours étiqueté (≤35%).
 *   4. Anti-ban : extension J+2/J+3 via stealthFetch (plus de fetch brut — 72 requêtes
 *      parallèles non protégées supprimées), chunks de 12.
 *   5. Fix lookup de date (league normalisée 'Unknown' des deux côtés).
 *   6. Exclusion des matchs live/débutés (l'ancienne version pouvait sélectionner
 *      un match déjà en cours).
 *
 * Auth: bearer token (CRON_SECRET ou param ?token= / combo_key)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getMatchesWithRealOdds, invalidateEspnCache } from '@/lib/combinedDataService';
import { getBatchPredictions, type UnifiedPredictionInput } from '@/lib/unifiedPredictionService';
import { sendTelegramPersonalMessage } from '@/lib/telegramService';
import SupabaseStore from '@/lib/db-supabase';
import { stealthFetch } from '@/lib/stealthFetch';
import {
  type ComboCandidate,
  type ComboSport,
  SPORT_RISK_CAP,
  EXTENDED_RISK_CAP,
  buildGroupedCombo,
  formatComboMessage,
  impliedCandidate,
  isEligible,
  matchKey,
  selectedOddsForResult,
} from '@/lib/comboGrouped';

const FOOTBALL_SPORTS = new Set(['Football', 'football']);
const BASEBALL_SPORTS = new Set(['Baseball', 'baseball']);

/** Ligues ESPN pour l'extension multi-jours foot (activée si < 5 matchs foot) */
const FOOTBALL_ESPN_KEYS = [
  'soccer/eng.1', 'soccer/esp.1', 'soccer/ita.1', 'soccer/ger.1', 'soccer/fra.1',
  'soccer/uefa.champions', 'soccer/uefa.europa', 'soccer/uefa.europa.conf',
  'soccer/por.1', 'soccer/ned.1', 'soccer/bel.1', 'soccer/tur.1', 'soccer/gre.1',
  'soccer/usa.1', 'soccer/mex.1', 'soccer/arg.1', 'soccer/bra.1',
  'soccer/fra.2', 'soccer/eng.2', 'soccer/eng.3', 'soccer/esp.2', 'soccer/ita.2', 'soccer/ger.2',
  'soccer/scotland', 'soccer/ger.3',
];

/** Priorité de déduplication : analyse ML fraîche > pipeline en base > cotes implicites */
const SOURCE_PRIORITY: Record<ComboCandidate['source'], number> = { ml: 3, db: 2, implied: 1 };

function isUpcoming(m: { isFinished?: boolean; isLive?: boolean; date?: string }): boolean {
  if (m.isFinished || m.isLive) return false;
  if (!m.date) return true;
  const t = new Date(m.date).getTime();
  return !isNaN(t) && t > Date.now();
}

// ─── Extension multi-jours foot (stealthFetch, anti-ban) ─────────────────────

interface RawMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport: string;
  date: string;
  isFinished: boolean;
  isLive: boolean;
  isEstimated: boolean;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
}

async function fetchFootExtension(): Promise<RawMatch[]> {
  const extraDates: string[] = [];
  for (let d = 2; d <= 3; d++) {
    const dt = new Date();
    dt.setUTCDate(dt.getUTCDate() + d);
    extraDates.push(dt.toISOString().split('T')[0]);
  }

  const tasks: (() => Promise<RawMatch[]>)[] = [];
  for (const date of extraDates) {
    for (const sportKey of FOOTBALL_ESPN_KEYS) {
      tasks.push(async () => {
        try {
          // stealthFetch : profil navigateur cohérent + rate limit + disjoncteur
          const r = await stealthFetch(
            `https://site.api.espn.com/apis/site/v2/sports/${sportKey}/scoreboard?dates=${date}`,
            { maxRetries: 1 },
          );
          if (!r.ok) return [];
          const data = await r.json();
          const events = data?.events || [];
          return events.map((ev: any): RawMatch => {
            const comp = ev.competitions?.[0];
            const homeTeam =
              comp?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.displayName || '';
            const awayTeam =
              comp?.competitors?.find((c: any) => c.homeAway === 'away')?.team?.displayName || '';
            return {
              id: `combo_${ev.id}`,
              homeTeam,
              awayTeam,
              league: ev.league?.name || sportKey,
              sport: 'Football',
              date: ev.date || `${date}T00:00:00Z`,
              isFinished: ev.status?.type?.completed || false,
              isLive: ev.status?.type?.state === 'in',
              isEstimated: false,
              oddsHome: comp?.odds?.[0]?.homeTeamOdds?.value || 0,
              oddsDraw: comp?.odds?.[0]?.drawOdds?.value || null,
              oddsAway: comp?.odds?.[0]?.awayTeamOdds?.value || 0,
            };
          });
        } catch {
          // Disjoncteur/erreur → [] honnête, l'extension est optionnelle
          return [];
        }
      });
    }
  }

  // Chunks de 12 requêtes max en parallèle (per-domain rate limit stealthFetch en +
  // côté app pour éviter les bursts de 50 sur l'API publique ESPN)
  const results: RawMatch[] = [];
  for (let i = 0; i < tasks.length; i += 12) {
    const chunk = tasks.slice(i, i + 12);
    const settled = await Promise.allSettled(chunk.map((t) => t()));
    for (const s of settled) {
      if (s.status === 'fulfilled') results.push(...s.value);
    }
  }

  return results.filter(
    (m) => m.homeTeam && m.awayTeam && m.oddsHome > 0 && m.oddsAway > 0 && isUpcoming(m),
  );
}

// ─── MLB depuis la base (pipeline ML scrapé en base) ─────────────────────────

async function fetchMlbFromDb(): Promise<ComboCandidate[]> {
  try {
    const todayISO = new Date().toISOString().split('T')[0];
    const dayPredictions = await SupabaseStore.getPredictionsByCreatedAt(todayISO);
    const now = Date.now();

    return (dayPredictions || [])
      .filter((p) => {
        if ((p.sport || '').toLowerCase() !== 'baseball') return false;
        if (p.status !== 'pending' || p.is_combo) return false;
        const bet = (p.predicted_result || '') as string;
        if (bet !== 'home' && bet !== 'away') return false;
        if (!(p.odds_home > 0 && p.odds_away > 0)) return false;
        const t = new Date(p.match_date || '').getTime();
        if (!isNaN(t) && t <= now) return false; // match déjà débuté
        if ((p.risk_percentage ?? 100) > EXTENDED_RISK_CAP) return false;
        return true;
      })
      .map((p): ComboCandidate => {
        const bet = (p.predicted_result || 'home') as 'home' | 'away';
        const winProb = p.risk_percentage != null ? 100 - p.risk_percentage : 50;
        return {
          homeTeam: p.home_team,
          awayTeam: p.away_team,
          league: p.league || 'MLB',
          date: p.match_date || '',
          sport: 'baseball',
          predictedResult: bet,
          oddsHome: p.odds_home,
          oddsDraw: p.odds_draw ?? null,
          oddsAway: p.odds_away,
          riskPercentage: p.risk_percentage ?? 100,
          winProbability: Math.round(winProb),
          confidence: p.confidence || 'medium',
          valueBetDetected: p.is_value_bet === true,
          edge: p.edge_value || 0,
          reasoning: [],
          kellyStake: 0,
          selectedOdds: selectedOddsForResult(bet, p.odds_home, p.odds_draw ?? null, p.odds_away),
          source: 'db',
        };
      });
  } catch (err: any) {
    console.log(`⚠️ [COMBO] MLB depuis base indisponible: ${err.message}`);
    return [];
  }
}

// ─── Conversion ML → candidats ───────────────────────────────────────────────

function mlSportToComboSport(sport: string): ComboSport | null {
  if (sport === 'Foot') return 'football';
  if (sport === 'MLB') return 'baseball';
  return null; // NBA/NHL/tennis… hors combo groupé P3
}

function mlPredictionToCandidate(p: any, dateFromLookup: string): ComboCandidate | null {
  const sport = mlSportToComboSport(p.sport);
  if (!sport) return null;

  const bet = p.recommendation?.bet;
  if (bet !== 'home' && bet !== 'draw' && bet !== 'away') return null;

  const isHome = bet === 'home';
  const isAway = bet === 'away';
  const winProb = isHome ? p.mlPrediction.homeProb : isAway ? p.mlPrediction.awayProb : p.mlPrediction.drawProb;
  const oddsDraw = p.odds.draw ?? null;
  const risk = Math.round(100 - winProb);

  // Baseball : jamais de draw
  const finalBet = sport === 'baseball' && bet === 'draw'
    ? (p.mlPrediction.homeProb >= p.mlPrediction.awayProb ? 'home' : 'away')
    : bet;

  return {
    homeTeam: p.homeTeam,
    awayTeam: p.awayTeam,
    league: p.league || 'Unknown',
    date: dateFromLookup || p.date || '',
    sport,
    predictedResult: finalBet,
    oddsHome: p.odds.home,
    oddsDraw,
    oddsAway: p.odds.away,
    riskPercentage: risk,
    winProbability: Math.round(winProb),
    confidence: p.mlPrediction.confidence,
    valueBetDetected: p.mlPrediction.valueBet === true,
    edge: p.mlPrediction.edge || 0,
    reasoning: p.recommendation.reasoning || [],
    kellyStake: p.recommendation.kellyStake || 0,
    selectedOdds: selectedOddsForResult(finalBet, p.odds.home, oddsDraw, p.odds.away),
    source: 'ml',
  };
}

// ─── Message diagnostic (quand aucun combo n'est publiable) ──────────────────

function formatDiagnosticMessage(
  totalBySport: Record<ComboSport, number>,
  eligible: ComboCandidate[],
  extendedOnly: ComboCandidate[],
): string {
  let msg = '╔═════════════════════════════════════════╗\n';
  msg += '║                                       ║\n';
  msg += '║   🎯 <b>COMBO GROUPÉ ⚽+⚾</b>\n';
  msg += '║                                       ║\n';
  msg += '╚═════════════════════════════════════════╝\n\n';
  msg += `⚠️ <b>Aucun combo publiable aujourd'hui</b> (minimum 2 sélections fiables)\n\n`;
  msg += `📊 Matchs analysés : ⚽ ${totalBySport.football} foot · ⚾ ${totalBySport.baseball} MLB\n`;
  msg += `🎯 Éligibles (foot ≤${SPORT_RISK_CAP.football}% / MLB ≤${SPORT_RISK_CAP.baseball}%) : ${eligible.length}\n`;
  msg += `📈 Mode étendu (≤${EXTENDED_RISK_CAP}%) : ${extendedOnly.length}\n\n`;

  const shown = [...eligible, ...extendedOnly].slice(0, 5);
  if (shown.length > 0) {
    msg += 'Meilleurs candidats (hors cap) :\n';
    for (const c of shown) {
      const emoji = c.sport === 'baseball' ? '⚾' : '⚽';
      msg += `  • ${emoji} ${c.homeTeam} vs ${c.awayTeam} — ${c.riskPercentage}% risque @${c.selectedOdds.toFixed(2)}\n`;
    }
  }
  msg += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  return msg;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

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

    if (comboKey === 'steo-combo-aout-2026' || (cronSecret && token === cronSecret)) {
      // OK
    } else if (cronSecret && token) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    console.log('🎯 [COMBO P3] Début génération combo groupé (foot + MLB)...');

    // ── 1. Récupérer les matchs via pipeline standard (ESPN hier/aujourd'hui/demain)
    invalidateEspnCache();
    let matches: any[] = (await getMatchesWithRealOdds(true)) || [];

    const withRealOdds = matches.filter(
      (m: any) =>
        !m.isEstimated &&
        m.oddsHome > 0 &&
        m.oddsAway > 0 &&
        (FOOTBALL_SPORTS.has(m.sport) || BASEBALL_SPORTS.has(m.sport)),
    );
    let footRaw = withRealOdds.filter((m: any) => FOOTBALL_SPORTS.has(m.sport) && isUpcoming(m));
    let mlbRaw = withRealOdds.filter((m: any) => BASEBALL_SPORTS.has(m.sport) && isUpcoming(m));
    console.log(`⚽ ${footRaw.length} matchs foot à venir · ⚾ ${mlbRaw.length} matchs MLB à venir`);

    // ── 2. Extension multi-jours foot (J+2/J+3) si nécessaire — via stealthFetch
    if (footRaw.length < 5) {
      console.log(`⚠️ Seulement ${footRaw.length} matchs foot — extension J+2/J+3 (stealthFetch)`);
      const extraMatches = await fetchFootExtension();
      console.log(`📡 +${extraMatches.length} matchs foot supplémentaires (J+2/J+3)`);
      footRaw = [...footRaw, ...extraMatches.map((m: any) => ({ ...m, sport: 'Football' }))];
    }

    // ── 3. MLB : prédictions scrapées en base par le pipeline ML (source produit P3)
    const mlbFromDb = await fetchMlbFromDb();
    if (mlbFromDb.length > 0) {
      console.log(`💾 +${mlbFromDb.length} prédictions MLB depuis la base (pipeline ML)`);
    }

    const totalFoot = footRaw.length;
    const totalMlb = Math.max(mlbRaw.length, mlbFromDb.length);

    if (totalFoot === 0 && mlbRaw.length === 0 && mlbFromDb.length === 0) {
      const trèveMsg =
        '╔═════════════════════════════════════════╗\n' +
        '║                                       ║\n' +
        '║   🎯 <b>COMBO GROUPÉ ⚽+⚾</b>\n' +
        '║                                       ║\n' +
        '╚═════════════════════════════════════════╝\n\n' +
        '⏳ <b>Aucun match</b> avec cotes réelles disponibles (foot + MLB).\n\n' +
        '🔄 Le combo sera généré automatiquement dès que des matchs seront disponibles.\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
      await sendTelegramPersonalMessage(trèveMsg);
      return NextResponse.json({ success: false, message: 'Aucun match foot/MLB', totalFoot: 0, totalMlb: 0 });
    }

    // ── 4. Analyse ML fraîche (« refaire l'analyse de tout ») — foot + MLB
    const dateLookup = new Map<string, string>();
    const mlInputs: UnifiedPredictionInput[] = [...footRaw, ...mlbRaw].map((m: any) => {
      const league = m.league || 'Unknown'; // 🔧 fix A4 : normalisé des DEUX côtés
      if (m.date) dateLookup.set(`${m.homeTeam}|${m.awayTeam}|${league}`, m.date);
      return {
        id: m.id || `combo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        sport: FOOTBALL_SPORTS.has(m.sport) ? ('Foot' as const) : ('MLB' as const),
        league,
        oddsHome: m.oddsHome,
        oddsDraw: m.oddsDraw || null,
        oddsAway: m.oddsAway,
      };
    });

    const merged = new Map<string, ComboCandidate>();
    const pushCandidate = (c: ComboCandidate) => {
      if (!c.date || !c.homeTeam || !c.awayTeam) return;
      if (!(c.oddsHome > 0 && c.oddsAway > 0)) return;
      const key = matchKey(c.homeTeam, c.awayTeam, c.date);
      const existing = merged.get(key);
      if (!existing || SOURCE_PRIORITY[c.source] > SOURCE_PRIORITY[existing.source]) {
        merged.set(key, c);
      }
    };

    let mlPreds: any[] = [];
    try {
      mlPreds = await getBatchPredictions(mlInputs);
      console.log(`🧠 ${mlPreds.length} prédictions ML (foot + MLB)`);
    } catch (mlErr: any) {
      console.log(`⚠️ ML échoué: ${mlErr.message}`);
    }

    if (mlPreds.length > 0) {
      for (const p of mlPreds) {
        const lookupKey = `${p.homeTeam}|${p.awayTeam}|${p.league || 'Unknown'}`;
        const c = mlPredictionToCandidate(p, dateLookup.get(lookupKey) || '');
        if (c) pushCandidate(c);
      }
    }

    // Fallback cotes implicites UNIQUEMENT pour les matchs sans analyse ML
    if (mlPreds.length === 0) {
      for (const m of footRaw) {
        pushCandidate(impliedCandidate(m, 'football'));
      }
      for (const m of mlbRaw) {
        pushCandidate(impliedCandidate(m, 'baseball'));
      }
    }

    // ── 5. Merge prédictions MLB de la base (complète les matchs absents d'ESPN)
    for (const c of mlbFromDb) {
      pushCandidate(c);
    }

    const allCandidates = [...merged.values()];
    const bySport = {
      football: allCandidates.filter((c) => c.sport === 'football').length,
      baseball: allCandidates.filter((c) => c.sport === 'baseball').length,
    };
    console.log(`📊 ${allCandidates.length} candidats dédupliqués (⚽ ${bySport.football} / ⚾ ${bySport.baseball})`);

    // ── 6. Éligibilité (caps par sport) puis construction
    const eligible = allCandidates.filter((c) => isEligible(c));
    console.log(`🎯 ${eligible.length} éligibles (foot ≤${SPORT_RISK_CAP.football}% / MLB ≤${SPORT_RISK_CAP.baseball}%, cote ≥1.15, ≠low)`);

    let built = buildGroupedCombo(eligible);
    let extended = false;

    // ── 7. Tier de recours : risque étendu ≤35% (publication clairement étiquetée)
    if (!built) {
      const extendedPool = allCandidates.filter(
        (c) => isEligible(c, EXTENDED_RISK_CAP) && !eligible.includes(c),
      );
      built = buildGroupedCombo(extendedPool);
      extended = built !== null;
      if (built) console.log(`📈 Combo mode étendu (${built.combo.length} legs, cote ${built.combinedOdds})`);
    }

    // ── 8. Publication
    if (!built) {
      const extendedOnly = allCandidates.filter(
        (c) => isEligible(c, EXTENDED_RISK_CAP) && !eligible.includes(c),
      );
      const diagMsg = formatDiagnosticMessage(bySport, eligible, extendedOnly);
      await sendTelegramPersonalMessage(diagMsg);
      return NextResponse.json({
        success: false,
        message: 'Aucun combo publiable',
        analyzed: { football: bySport.football, baseball: bySport.baseball },
        eligible: eligible.length,
        extended: extendedOnly.length,
      });
    }

    const message = formatComboMessage(built, extended);
    const sent = await sendTelegramPersonalMessage(message);

    return NextResponse.json({
      success: sent,
      tier: extended ? 'extended' : built.reachedTarget ? 'multi-days' : 'day',
      combo: {
        legs: built.combo.length,
        multiSport: built.isMultiSport,
        combinedOdds: built.combinedOdds,
        combinedWinProb: +(built.combinedWinProb * 100).toFixed(1),
        ev: +(built.ev * 100).toFixed(1),
        selections: built.combo.map((c) => ({
          match: `${c.homeTeam} vs ${c.awayTeam}`,
          sport: c.sport,
          league: c.league,
          date: c.date ? c.date.split('T')[0] : '',
          result: c.predictedResult,
          odds: +c.selectedOdds.toFixed(2),
          risk: c.riskPercentage,
          confidence: c.confidence,
          source: c.source,
        })),
      },
    });
  } catch (e: any) {
    console.error('❌ [COMBO P3] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
