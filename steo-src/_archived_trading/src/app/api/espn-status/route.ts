import { NextResponse } from 'next/server';
import { fetchAllESPNOdds, getESPNStatus, getESPNOddsStats } from '@/lib/espnOddsService';

/**
 * API ESPN Status - Monitoring du système de cotes avec fallback en cascade
 * 
 * CASCADE:
 * 1. ESPN (DraftKings) - GRATUIT ILLIMITÉ
 * 2. The Odds API - Fallback
 * 3. Estimations - Dernier recours
 */

export async function GET() {
  try {
    console.log('📡 Vérification statut système de cotes...');
    
    // Récupérer les données
    const matches = await fetchAllESPNOdds();
    const status = getESPNStatus();
    const stats = getESPNOddsStats();
    
    // Analyser les problèmes
    const issues: string[] = [];
    const warnings: string[] = [];
    
    if (matches.length === 0) {
      issues.push('Aucun match disponible - Vérifier les APIs');
    }
    
    // Compter par source
    const espnCount = matches.filter(m => m.oddsSource === 'espn-draftkings').length;
    const oddsApiCount = matches.filter(m => m.oddsSource === 'the-odds-api').length;
    const estimatedCount = matches.filter(m => m.oddsSource === 'estimation').length;
    const total = matches.length;
    
    // Déterminer le statut
    let primarySourceStatus: 'operational' | 'degraded' | 'issues' = 'operational';
    let fallbackUsed = false;
    
    if (total === 0) {
      primarySourceStatus = 'issues';
      issues.push('Aucune donnée disponible');
    } else if (espnCount === 0 && oddsApiCount === 0) {
      primarySourceStatus = 'issues';
      issues.push('ESPN et The Odds API indisponibles - Uniquement des estimations');
    } else if (espnCount === 0) {
      primarySourceStatus = 'degraded';
      fallbackUsed = true;
      warnings.push('ESPN (DraftKings) indisponible - Fallback The Odds API actif');
    } else if (estimatedCount > total * 0.5) {
      primarySourceStatus = 'degraded';
      warnings.push('Plus de 50% des cotes sont estimées');
    }
    
    // Répartition par sport
    const sportStats: Record<string, { total: number; espn: number; oddsApi: number; estimated: number }> = {};
    for (const match of matches) {
      if (!sportStats[match.sport]) {
        sportStats[match.sport] = { total: 0, espn: 0, oddsApi: 0, estimated: 0 };
      }
      sportStats[match.sport].total++;
      if (match.oddsSource === 'espn-draftkings') sportStats[match.sport].espn++;
      else if (match.oddsSource === 'the-odds-api') sportStats[match.sport].oddsApi++;
      else sportStats[match.sport].estimated++;
    }
    
    // Statut global
    const overallStatus = issues.length === 0 
      ? (warnings.length === 0 ? 'operational' : 'degraded')
      : 'issues';
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      
      // Statut global
      status: overallStatus,
      statusMessage: {
        operational: '✅ Système opérationnel - ESPN (DraftKings) actif',
        degraded: '⚠️ Mode dégradé - Fallback actif',
        issues: '❌ Problèmes détectés - Estimations uniquement',
      }[overallStatus],
      
      // Sources avec cascade
      sources: {
        primary: {
          name: 'ESPN (DraftKings)',
          status: espnCount > 0 ? 'online' : 'offline',
          type: 'primary',
          cost: 'GRATUIT',
          quota: 'ILLIMITÉ',
          matchesCount: espnCount,
          reliability: 95,
          description: 'Source primaire - Cotes DraftKings officielles',
        },
        fallback: {
          name: 'The Odds API',
          status: oddsApiCount > 0 ? 'online' : espnCount > 0 ? 'standby' : 'offline',
          type: 'fallback',
          cost: '500/mois gratuit',
          quota: 'LIMITÉ',
          matchesCount: oddsApiCount,
          reliability: 90,
          description: 'Utilisé automatiquement si ESPN indisponible',
        },
        lastResort: {
          name: 'Estimation',
          status: 'always-available',
          type: 'last-resort',
          cost: 'GRATUIT',
          quota: 'ILLIMITÉ',
          matchesCount: estimatedCount,
          reliability: 60,
          description: 'Basé sur la force historique des équipes',
        },
      },
      
      // Statistiques
      stats: {
        total,
        bySource: {
          espnDraftKings: espnCount,
          theOddsApi: oddsApiCount,
          estimated: estimatedCount,
        },
        realOddsPercentage: total > 0 ? Math.round(((espnCount + oddsApiCount) / total) * 100) : 0,
        live: matches.filter(m => m.isLive).length,
        bySport: sportStats,
        avgReliability: stats.matchesCount > 0 
          ? Math.round(matches.reduce((sum, m) => sum + m.reliabilityScore, 0) / matches.length)
          : 0,
      },
      
      // Cache
      cache: {
        lastUpdate: stats.lastUpdate,
        ageMinutes: stats.cacheAge,
      },
      
      // Problèmes et avertissements
      issues: issues.length > 0 ? issues : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      fallbackUsed,
      
      // Explication du système
      systemExplanation: {
        title: 'Système de fallback automatique en cascade',
        description: 'Le système essaie automatiquement les sources dans cet ordre:',
        cascade: [
          {
            priority: 1,
            source: 'ESPN (DraftKings)',
            condition: 'Toujours essayé en premier',
            reliability: '~95%',
            cost: 'GRATUIT ILLIMITÉ',
          },
          {
            priority: 2,
            source: 'The Odds API',
            condition: 'Si ESPN ne fournit pas de cotes',
            reliability: '~90%',
            cost: '500/mois gratuit',
          },
          {
            priority: 3,
            source: 'Estimation',
            condition: 'Si aucune API disponible',
            reliability: '~60%',
            cost: 'GRATUIT ILLIMITÉ',
          },
        ],
        whatHappensIf: {
          draftKingsDown: 'The Odds API prend automatiquement le relais',
          bothApisDown: 'Le système utilise des estimations basées sur la force des équipes',
          allDown: 'Les matchs sont affichés sans cotes (rare)',
        },
      },
      
    });
    
  } catch (error) {
    console.error('❌ Erreur statut:', error);
    
    return NextResponse.json({
      success: false,
      status: 'error',
      timestamp: new Date().toISOString(),
      error: String(error),
      message: 'Erreur lors de la vérification du statut',
    }, { status: 500 });
  }
}

/**
 * POST - Rafraîchir le cache
 */
export async function POST() {
  try {
    const { forceRefreshESPN } = await import('@/lib/espnOddsService');
    await forceRefreshESPN();
    return GET();
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 });
  }
}
