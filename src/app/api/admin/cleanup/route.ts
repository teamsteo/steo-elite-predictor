/**
 * API Endpoint pour nettoyer les anciennes prédictions
 * 
 * GET /api/admin/cleanup?secret=XXX
 * - Nettoie les prédictions en attente de plus de 7 jours
 * - Affiche les statistiques de nettoyage
 * 
 * POST /api/admin/cleanup?secret=XXX
 * - Exécute le nettoyage (pas de dry run)
 */

import { NextRequest, NextResponse } from 'next/server';
import SupabaseStore from '@/lib/db-supabase';

const ADMIN_SECRET = process.env.CRON_SECRET || 'steo-elite-cron-2026';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');
  const dryRun = url.searchParams.get('dryRun') !== 'false'; // Par défaut, dry run
  
  // Vérification du secret
  if (secret !== ADMIN_SECRET) {
    return NextResponse.json(
      { error: 'Non autorisé' },
      { status: 401 }
    );
  }

  const results = {
    timestamp: new Date().toISOString(),
    dryRun,
    stats: {
      before: { total: 0, pending: 0, old: 0 },
      after: { total: 0, pending: 0, deleted: 0 },
    },
    oldPredictions: [] as Array<{
      id: string;
      match: string;
      sport: string;
      date: string;
      daysOld: number;
    }>,
    errors: [] as string[],
  };

  try {
    // 1. Stats avant nettoyage
    const allPredictions = await SupabaseStore.getAllPredictions();
    results.stats.before.total = allPredictions.length;
    results.stats.before.pending = allPredictions.filter(p => p.status === 'pending').length;

    // 2. Identifier les vieilles prédictions (plus de 7 jours)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const oldPendingPredictions = allPredictions.filter(p => {
      if (p.status !== 'pending') return false;
      const matchDate = p.match_date ? new Date(p.match_date) : new Date(p.created_at || 0);
      return matchDate < sevenDaysAgo;
    });

    results.stats.before.old = oldPendingPredictions.length;

    console.log(`📊 Avant: ${results.stats.before.total} total, ${results.stats.before.pending} en attente, ${results.stats.before.old} vieux`);

    // 3. Afficher les vieilles prédictions (max 20)
    results.oldPredictions = oldPendingPredictions.slice(0, 20).map(pred => {
      const matchDate = pred.match_date ? new Date(pred.match_date) : new Date(pred.created_at || 0);
      const daysOld = Math.floor((Date.now() - matchDate.getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: pred.id || '',
        match: `${pred.home_team} vs ${pred.away_team}`,
        sport: pred.sport || 'N/A',
        date: matchDate.toISOString(),
        daysOld,
      };
    });

    // 4. Exécuter le nettoyage si demandé
    if (!dryRun && oldPendingPredictions.length > 0) {
      const cleanupResult = await SupabaseStore.deleteOldPendingPredictions(7);
      results.stats.after.deleted = cleanupResult.deleted;
      results.errors = cleanupResult.errors;

      // Recharger les stats
      const remainingPredictions = await SupabaseStore.getAllPredictions();
      results.stats.after.total = remainingPredictions.length;
      results.stats.after.pending = remainingPredictions.filter(p => p.status === 'pending').length;
    } else {
      // Mode dry run: simuler
      results.stats.after.total = results.stats.before.total - oldPendingPredictions.length;
      results.stats.after.pending = results.stats.before.pending - oldPendingPredictions.length;
    }

    console.log(`📊 Après: ${results.stats.after.total} total, ${results.stats.after.pending} en attente, ${results.stats.after.deleted} supprimés`);

    return NextResponse.json({
      success: true,
      message: dryRun 
        ? `Mode simulation: ${oldPendingPredictions.length} vieilles prédictions seraient supprimées`
        : `Nettoyage terminé: ${results.stats.after.deleted} prédictions supprimées`,
      results,
    });

  } catch (error: any) {
    console.error('❌ Erreur cleanup:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      results,
    }, { status: 500 });
  }
}

/**
 * POST - Force le nettoyage (pas de dry run)
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');
  
  // Vérification du secret
  if (secret !== ADMIN_SECRET) {
    return NextResponse.json(
      { error: 'Non autorisé' },
      { status: 401 }
    );
  }
  
  // Créer une nouvelle URL avec dryRun=false
  const newUrl = new URL(request.url);
  newUrl.searchParams.set('dryRun', 'false');
  
  // Appeler GET
  return GET(new Request(newUrl.toString()) as NextRequest);
}
