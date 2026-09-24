/**
 * API Anti-Ban Status — Observabilité du bouclier central (Task 19)
 *
 * GET ?secret=X  (ou header Authorization: Bearer X)
 * → État temps réel par domaine : requêtes du jour vs plafond, rafale 60s,
 *   disjoncteur (bloqué ? cooldown restant ?), erreurs, délais de politesse.
 *
 * Diagnostic : si un domaine est "blocked" ou près de son dailyCap, les
 * scrapers correspondants basculent sur leurs fallbacks (cache, estimations,
 * seed) — c'est ce qui explique des publications sans données fraîches.
 */

import { NextResponse } from 'next/server';
import { timingSafeEqual } from '@/lib/timingSafeEqual';
import { getAntiBanStatus, DOMAIN_POLICIES } from '@/lib/stealthFetch';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const authHeader = request.headers.get('authorization');
  const providedSecret = authHeader?.replace('Bearer ', '') || searchParams.get('secret');
  if (!CRON_SECRET || !providedSecret || !timingSafeEqual(providedSecret, CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const status = getAntiBanStatus();
  const domains = Object.entries(status).map(([domain, s]) => ({
    domain,
    ...s,
    health:
      s.blocked
        ? 'BLOCKED (disjoncteur ouvert)'
        : s.dailyCap && s.todayCount >= s.dailyCap
          ? 'CAP_ATTEINT (fallbacks actifs)'
          : s.burstMax && s.burstLast60s >= s.burstMax
            ? 'RAFALE_SATUREE (attente courte ou fast-fail)'
            : s.errorCount >= 3
              ? 'DEGRADE (erreurs récentes)'
              : 'OK',
  }));

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    summary: {
      domainsTracked: domains.length,
      blocked: domains.filter((d) => d.blocked).length,
      capsHit: domains.filter((d) => d.health === 'CAP_ATTEINT').length,
    },
    policies: DOMAIN_POLICIES,
    domains,
  });
}

export async function POST(request: Request) {
  return GET(request);
}
