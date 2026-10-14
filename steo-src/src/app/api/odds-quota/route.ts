/**
 * API Route - Statut du quota Odds API
 * Permet de surveiller l'utilisation du quota
 */

import { NextResponse } from 'next/server';
import { getQuotaStatus } from '@/lib/oddsQuotaManager';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  
  const CRON_SECRET = process.env.CRON_SECRET;
  if (!CRON_SECRET || !secret || !timingSafeEqual(secret, CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const status = getQuotaStatus();
  
  return NextResponse.json({
    quota: {
      used: status.used,
      limit: status.limit,
      remaining: status.remaining,
      lastReset: status.lastReset,
    },
    cache: {
      valid: status.cacheValid,
      ageMinutes: status.cacheAge,
    },
    recommendation: status.remaining <= 3 
      ? '⚠️ Quota faible - réduisez les appels API'
      : '✅ Quota OK',
    strategy: {
      dailyBudget: 10,
      monthlyQuota: 500,
      estimatedMonthlyUsage: 10 * 30, // 300
      savings: 500 - (10 * 30), // 200 de marge
    },
  });
}
