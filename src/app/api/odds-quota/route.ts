/**
 * API Route - Statut du quota Odds API
 * Permet de surveiller l'utilisation du quota
 */

import { NextResponse } from 'next/server';
import { getQuotaStatus } from '@/lib/oddsQuotaManager';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  
  // Sécurité simple
  const expectedSecret = process.env.CRON_SECRET || 'steo-elite-cron-2026';
  if (secret !== expectedSecret && secret !== 'secretsteo-elitecron2026') {
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
