/**
 * API CRON Tennis V3 — Publication Telegram contrôlée
 *
 * 🎾 Stratégie 8 étapes : uniquement les picks 🟢 (≥70% + consensus ≥5/7
 * + value ≥3% + vetos OK). Si 0 pick → message bref, ou silencieux si
 * TENNIS_V3_SILENT_EMPTY=true.
 *
 * Endpoints (protégés par CRON_SECRET) :
 *   GET ?secret=X&mode=picks   → publie les 🟢 (défaut)
 *   GET ?secret=X&mode=report  → rapport complet (facteurs, vetos, funnel, data)
 *   GET ?secret=X&mode=settle  → règle les paris trackés (résultats xlsx tennis-data)
 */

import { NextResponse } from 'next/server';
import { timingSafeEqual } from '@/lib/timingSafeEqual';
import { collectMatches } from '@/lib/tennis-enhanced/smart-collector';
import { getV3Predictions, toApiPrediction, V3_MODEL_VERSION } from '@/lib/tennis-v3/service';
import {
  saveTrackedBets,
  isPersistenceEnabled,
  getUnsettledBets,
  settleBet,
} from '@/lib/tennis-v3/persistence';
import { ensureFreshData, getRuntimeMatches } from '@/lib/tennis-v3/data-service';
import { parseCanonical } from '@/lib/tennis-v3/name-utils';

const CRON_SECRET = process.env.CRON_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_PERSONAL_CHAT_ID;
// Réactivation contrôlée : tennis exclu de Telegram depuis le V2 → flag explicite,
// picks ultra-sélectifs uniquement. Désactivation possible via TENNIS_V3_TELEGRAM_ENABLED=false.
const TENNIS_V3_ENABLED = process.env.TENNIS_V3_TELEGRAM_ENABLED !== 'false';

function tgEnabled(): boolean {
  return Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
}

async function sendTelegram(text: string): Promise<boolean> {
  if (!tgEnabled()) {
    console.log('[TennisV3Cron] ⚠️ Telegram non configuré (TELEGRAM_BOT_TOKEN/CHAT_ID)');
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (e: any) {
    console.error(`[TennisV3Cron] ❌ sendTelegram: ${e?.message}`);
    return false;
  }
}

function esc(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function keyOf(nameOrKey: string): string {
  if (/^[a-z'-]+-[a-z]$/.test(nameOrKey.trim())) return nameOrKey.trim();
  return parseCanonical(nameOrKey).key;
}

function formatPick(p: ReturnType<typeof toApiPrediction>): string {
  const v = p.v3.decision.value;
  const odds = p.betting.winnerOdds.toFixed(2);
  const prob = Math.round((p.prediction.winProbability || 0) * 100);
  const kelly = v?.kelly ? (v.kelly * 100).toFixed(1) : '—';
  const edge = v?.edge ? `${(v.edge * 100).toFixed(1)}%` : '—';
  const topFactors = p.v3.factors
    .slice()
    .sort((a: any, b: any) => Math.abs(b.score - 0.5) * b.weight - Math.abs(a.score - 0.5) * a.weight)
    .slice(0, 3)
    .map((f: any) => `${f.label}: ${f.detail}`)
    .join(' · ');
  return [
    `🎾 <b>${esc(p.player1)} vs ${esc(p.player2)}</b>`,
    `🏆 ${esc(p.tournament)} · ${esc(p.surface)} · ${esc(p.round)}`,
    `✅ <b>Pick: ${esc(p.prediction.winnerName)} @ ${odds}</b> (modèle ${prob}%)`,
    `💰 edge ${edge} · Kelly ${kelly}% · consensus ${p.v3.decision.consensus}/7`,
    `📊 ${esc(topFactors)}`,
  ].join('\n');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const mode = searchParams.get('mode') || 'picks';

  if (!CRON_SECRET || !secret || !timingSafeEqual(secret, CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // ---- mode settle : règlement des paris trackés ----
    if (mode === 'settle') {
      if (!isPersistenceEnabled()) {
        return NextResponse.json({ success: true, message: 'Supabase non configuré — settlement ignoré', settled: 0 });
      }
      const unsettled = await getUnsettledBets();
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      await ensureFreshData();
      const runtime = getRuntimeMatches();
      let settled = 0;
      for (const bet of unsettled) {
        if (bet.match_date && bet.match_date > yesterday) continue; // pas encore joué
        const kw = keyOf(bet.pick_name);
        const found = runtime.find((m) => m.date === bet.match_date && (m.w === kw || m.l === kw));
        if (!found) continue;
        const pickWon = found.w === kw;
        await settleBet(bet.match_id, bet.pick, pickWon ? 'win' : 'loss');
        settled++;
      }
      return NextResponse.json({ success: true, settled, checked: unsettled.length });
    }

    // ---- modes picks / report ----
    const matches = await collectMatches();
    const v3 = await getV3Predictions(matches);
    const api = v3.predictions.map(toApiPrediction);
    const greens = api.filter((p) => p.v3.decision.tier === 'green' && p.v3.decision.betRecommended);
    const yellows = api.filter((p) => p.v3.decision.tier === 'yellow');

    // tracking Supabase (fire-and-forget)
    if (isPersistenceEnabled() && greens.length > 0) {
      saveTrackedBets(
        greens.map((p) => ({
          match_id: p.matchId,
          player1: p.player1,
          player2: p.player2,
          tournament: p.tournament,
          surface: p.surface,
          round: p.round,
          match_date: p.date.slice(0, 10),
          pick: p.prediction.winner,
          pick_name: p.prediction.winnerName,
          probability: p.prediction.winProbability,
          odds: p.betting.winnerOdds,
          edge: p.v3.decision.value?.edge ?? 0,
          kelly: p.v3.decision.value?.kelly ?? 0,
          tier: 'green',
          model_version: V3_MODEL_VERSION,
        }))
      );
    }

    const dateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    let message = '';

    if (mode === 'report') {
      const st = v3.status;
      message = [
        `📊 <b>RAPPORT TENNIS V3 — ${esc(dateStr)}</b>`,
        ``,
        `🧠 <b>Moteur</b> ${esc(V3_MODEL_VERSION)}`,
        `• Elo auto-calculé: ${st.seed ? st.seed.total : 0} matchs 2021-2026 (seed ${st.seed?.generatedAt || 'N/A'})`,
        `• +${st.incrementalMatches} matchs incrémentaux (xlsx du jour, 2 req/jour max)`,
        `• 7 facteurs pondérés + vetos blessure/fatigue + value vs implicite`,
        `• Persistance: ${isPersistenceEnabled() ? 'Supabase ✅' : 'mémoire (Supabase non configuré)'}`,
        ``,
        `📈 <b>Funnel</b>`,
        `• Matchs collectés (BetExplorer): ${matches.length}`,
        `• Prédictions V3: ${api.length} (noms non résolus: ${v3.unresolved.length})`,
        `• 🟢 candidats: ${greens.length} · 🟡 prudence: ${yellows.length} · 🔴 no-bet: ${api.length - greens.length - yellows.length}`,
        ``,
        greens.length > 0
          ? `✅ <b>PICKS DU JOUR (${greens.length})</b>\n\n${greens.map(formatPick).join('\n\n')}`
          : `⚪ Aucun 🟢 aujourd'hui — sélection V3 stricte (≥70% + consensus 5/7 + value ≥3%).`,
      ].join('\n');
    } else {
      if (greens.length === 0) {
        const silent = process.env.TENNIS_V3_SILENT_EMPTY === 'true';
        message = silent
          ? ''
          : `⚪ <b>Tennis V3</b> — ${dateStr}\nAucun pick 🟢 aujourd'hui (${api.length} matchs analysés, sélection stricte).`;
      } else {
        message = [
          `🎾 <b>TENNIS V3 — PICKS 🟢 (${dateStr})</b>`,
          ``,
          ...greens.map(formatPick),
          ``,
          `<i>${greens.length} pick(s) · ≥70% + consensus 5/7 + value ≥3% · vetos OK</i>`,
        ].join('\n');
      }
    }

    let sent = false;
    if (message && TENNIS_V3_ENABLED) {
      sent = await sendTelegram(message);
    }

    return NextResponse.json({
      success: true,
      mode,
      telegramEnabled: TENNIS_V3_ENABLED && tgEnabled(),
      sent,
      published: greens.length,
      funnel: {
        collected: matches.length,
        predicted: api.length,
        unresolved: v3.unresolved.length,
        greens: greens.length,
        yellows: yellows.length,
      },
      data: v3.status,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error(`[TennisV3Cron] ❌ ${e?.message}`);
    return NextResponse.json({ success: false, error: e?.message || 'erreur V3' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
