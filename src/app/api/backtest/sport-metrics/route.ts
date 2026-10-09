/**
 * API Backtest Sport Metrics — BADJAN V3 Phase 4 (Task 41)
 *
 * GET /api/backtest/sport-metrics?secret=CRON_SECRET&sport=all&days=90
 *   → métriques de validation historique NHL/MLB:
 *     win rate, ROI, Brier (modèle vs marché), log loss, calibration, par confiance.
 *
 * GET ...&notify=telegram → envoie aussi le résumé texte sur le canal Telegram
 *   (utilisé par le cron hebdomadaire vercel.json).
 *
 * Auth: secret en query OU header Authorization: Bearer (timing-safe).
 */

import { NextResponse } from 'next/server';
import { timingSafeEqual } from '@/lib/timingSafeEqual';
import { computeSportMetrics, formatMetricsText, type SportFilter } from '@/lib/sportMetricsService';

const CRON_SECRET = process.env.CRON_SECRET;
if (!CRON_SECRET) {
  console.error('[SECURITY] CRON_SECRET non configuré - endpoint metrics désactivé');
}

function verifyAuth(request: Request): boolean {
  if (!CRON_SECRET) return false;
  const url = new URL(request.url);
  const urlSecret = url.searchParams.get('secret') || '';
  const authHeader = request.headers.get('authorization') || '';
  if (timingSafeEqual(urlSecret, CRON_SECRET)) return true;
  if (timingSafeEqual(authHeader, `Bearer ${CRON_SECRET}`)) return true;
  return false;
}

const VALID_SPORTS: SportFilter[] = ['all', 'hockey', 'baseball', 'basketball', 'football'];

export async function GET(request: Request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const url = new URL(request.url);
  const sportParam = (url.searchParams.get('sport') || 'all') as SportFilter;
  const sport: SportFilter = VALID_SPORTS.includes(sportParam) ? sportParam : 'all';
  const daysParam = parseInt(url.searchParams.get('days') || '90', 10);
  const days = Number.isFinite(daysParam) ? Math.max(1, Math.min(365, daysParam)) : 90;
  const notifyTelegram = url.searchParams.get('notify') === 'telegram';
  const format = url.searchParams.get('format') || 'json';

  try {
    const { metrics, warnings } = await computeSportMetrics(sport, days);

    // Notification Telegram hebdomadaire (optionnelle)
    let telegramSent: boolean | null = null;
    if (notifyTelegram) {
      try {
        const { sendTelegramMessage } = await import('@/lib/telegramService');
        const text = formatMetricsText(metrics);
        telegramSent = await sendTelegramMessage(text);
        console.log(`📊 Metrics Telegram: ${telegramSent ? 'envoyé' : 'échec'}`);
      } catch (e: any) {
        console.log('⚠️ Metrics Telegram erreur:', e?.message);
        telegramSent = false;
      }
    }

    if (format === 'text') {
      return new NextResponse(formatMetricsText(metrics), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      params: { sport, days, notifyTelegram },
      warnings,
      metrics,
      telegramSent,
    });
  } catch (e: any) {
    console.error('Erreur sport-metrics:', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Erreur interne' },
      { status: 500 }
    );
  }
}
