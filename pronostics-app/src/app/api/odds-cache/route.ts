import { NextResponse } from 'next/server';
import { 
  fetchAndCacheOdds, 
  getQuotaInfo, 
  forceRefresh,
  getMatchesFromCache,
  getPublicStats,
} from '@/lib/oddsApiManager';

// ============================================
// AUTHENTIFICATION
// ============================================
const CRON_SECRET = process.env.CRON_SECRET;
if (!CRON_SECRET) {
  console.error('[SECURITY] CRON_SECRET non configuré - endpoints write désactivés');
}

function verifyRequestAuth(request: Request): boolean {
  if (!CRON_SECRET) return false;
  const url = new URL(request.url);
  const urlSecret = url.searchParams.get('secret');
  const authHeader = request.headers.get('authorization');
  if (urlSecret === CRON_SECRET) return true;
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;
  return false;
}

/**
 * GET - Récupérer les cotes depuis le cache
 * - Si cache valide: retourne les données sans appeler l'API
 * - Si cache vide/invalide: charge les données (consomme 1 requête)
 */
export async function GET() {
  try {
    // Essayer de charger/récupérer les données
    const cache = await fetchAndCacheOdds();
    const quotaInfo = getQuotaInfo();
    const stats = getPublicStats();
    
    return NextResponse.json({
      success: true,
      source: stats.cacheStatus === 'valid' ? 'cache' : 'api',
      message: stats.cacheStatus === 'valid' 
        ? `${stats.matchCount} matchs depuis le cache`
        : `${stats.matchCount} matchs chargés depuis l'API`,
      matches: cache.matches,
      quota: {
        used: quotaInfo.used,
        remaining: quotaInfo.remaining,
        dailyUsed: quotaInfo.dailyUsed,
        dailyBudget: quotaInfo.dailyBudget,
        monthlyBudget: 500,
      },
      lastUpdate: quotaInfo.lastUpdate,
      cacheValid: quotaInfo.cacheValid,
    });
    
  } catch (error) {
    console.error('Erreur odds cache:', error);
    return NextResponse.json({
      success: false,
      error: 'Erreur lors de la récupération des cotes',
      matches: [],
    }, { status: 500 });
  }
}

/**
 * POST - Forcer le rafraîchissement du cache
 * Consomme 1 requête API (si quota disponible)
 */
export async function POST(request: Request) {
  if (!verifyRequestAuth(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  try {
    const result = await forceRefresh();
    const quotaInfo = getQuotaInfo();
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        matchesCount: result.matches,
        quota: {
          used: quotaInfo.used,
          remaining: quotaInfo.remaining,
          dailyUsed: quotaInfo.dailyUsed,
          dailyBudget: quotaInfo.dailyBudget,
        },
      });
    } else {
      return NextResponse.json({
        success: false,
        message: result.message,
        matchesCount: result.matches,
        quota: {
          used: quotaInfo.used,
          remaining: quotaInfo.remaining,
          dailyUsed: quotaInfo.dailyUsed,
          dailyBudget: quotaInfo.dailyBudget,
        },
      }, { status: 429 }); // 429 Too Many Requests
    }
    
  } catch (error) {
    console.error('Erreur refresh odds:', error);
    return NextResponse.json({
      success: false,
      error: 'Erreur lors du rafraîchissement',
    }, { status: 500 });
  }
}
