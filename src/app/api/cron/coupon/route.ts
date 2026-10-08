/**
 * Cron Coupon — Task 37
 * ======================
 * Publie chaque jour sur Telegram:
 *  1. L'IMAGE RÉSULTAT du combiné d'hier (Gagné/Perdu avec vrais scores)
 *  2. L'IMAGE "EN JEU" du combiné du jour (sélections + cotes + mise + gain potentiel)
 *
 * Les legs = les combinés RÉELS publiés par le bot combo (is_combo=true).
 * Auth: header Authorization Bearer (Vercel Cron) ou ?secret=CRON_SECRET (manuel).
 *
 * Actions:
 *  - (défaut) publish-daily  → les deux images ci-dessus
 *  - preview&date=YYYY-MM-DD&mode=won|lost|pending → renvoie le PNG (test visuel)
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from '@/lib/timingSafeEqual';
import { buildCouponView, couponCaption, type CouponView } from '@/lib/couponTicket';
import { renderCouponPNG } from '@/lib/couponRenderer';
import { sendTelegramPhoto } from '@/lib/telegramService';

const CRON_SECRET = process.env.CRON_SECRET;

function dateISOOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

async function publishView(view: CouponView): Promise<boolean> {
  const png = await renderCouponPNG(view);
  const caption = couponCaption(view);
  return sendTelegramPhoto(png, caption);
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const url = new URL(request.url);
  const urlSecret = url.searchParams.get('secret');
  const action = url.searchParams.get('action') || 'publish-daily';

  const providedSecret = authHeader?.replace('Bearer ', '') || urlSecret;
  if (!CRON_SECRET || !providedSecret || !timingSafeEqual(providedSecret, CRON_SECRET)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  // ─── Aperçu PNG (test visuel, aucune publication) ───
  if (action === 'preview') {
    const date = url.searchParams.get('date') || dateISOOffset(0);
    const mode = (url.searchParams.get('mode') || 'pending') as 'won' | 'lost' | 'pending';
    try {
      const view = await buildCouponView(date, mode === 'pending' ? undefined : mode);
      if (!view) {
        return NextResponse.json({ error: `Aucun combiné trouvé pour ${date}` }, { status: 404 });
      }
      const png = await renderCouponPNG(view);
      return new NextResponse(new Uint8Array(png), {
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
      });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'erreur rendu' }, { status: 500 });
    }
  }

  // ─── Publication quotidienne ───
  const log: Record<string, unknown> = { action: 'publish-daily', startedAt: new Date().toISOString() };

  try {
    // Phase 1 — résultat du combiné le plus récemment résolu (D-1 → D-4)
    let resultPublished = false;
    for (let offset = -1; offset >= -4 && !resultPublished; offset--) {
      const date = dateISOOffset(offset);
      try {
        const view = await buildCouponView(date);
        if (!view) continue;
        if (view.status === 'pending') {
          log[`result_${date}`] = 'skip (unresolved)';
          continue;
        }
        const sent = await publishView(view);
        log[`result_${date}`] = { status: view.status, legs: view.legs.length, stake: view.stake, gains: view.gains, sent };
        resultPublished = sent;
      } catch (e: any) {
        log[`result_${date}`] = `erreur: ${e?.message || e}`;
      }
    }
    log.resultPublished = resultPublished;

    // Phase 2 — combiné du jour "en jeu"
    let todayPublished = false;
    try {
      const today = dateISOOffset(0);
      const view = await buildCouponView(today);
      if (view && view.legs.length >= 2) {
        // Si toutes les legs sont déjà résolues (exécution tardive), ne pas publier "en jeu"
        const hasLivePending = view.legs.some(l => l.legStatus === 'pending');
        if (hasLivePending) {
          const sent = await publishView(view);
          log[`today_${today}`] = { legs: view.legs.length, totalOdds: view.totalOdds, stake: view.stake, sent };
          todayPublished = sent;
        } else {
          log[`today_${today}`] = 'skip (aucune leg en attente)';
        }
      } else {
        log[`today_${today}`] = 'skip (pas de combiné du jour)';
      }
    } catch (e: any) {
      log.today = `erreur: ${e?.message || e}`;
    }
    log.todayPublished = todayPublished;

    return NextResponse.json({ success: true, ...log });
  } catch (e: any) {
    console.error('❌ Cron coupon:', e);
    return NextResponse.json({ success: false, error: e?.message || 'erreur interne', ...log }, { status: 500 });
  }
}
