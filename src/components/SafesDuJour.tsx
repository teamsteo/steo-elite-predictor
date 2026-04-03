'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MatchCard } from './MatchCard';
import { GlobalDataQualityBanner, DataQualityLevel } from './DataSourceIndicator';
import { Shield, TrendingUp, Sparkles, RefreshCw, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

interface SafeMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league?: string;
  date: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  status: string;
  insight?: {
    riskPercentage: number;
    valueBetDetected: boolean;
    valueBetType: string | null;
    confidence: string;
  };
  dataQuality?: {
    overall: DataQualityLevel;
    overallScore: number;
    sources: string[];
    hasRealData: boolean;
    warnings: string[];
    errors?: Array<{
      type: string;
      message: string;
      severity: 'critical' | 'warning' | 'info';
    }>;
    details: {
      form: DataQualityLevel;
      goals: DataQualityLevel;
      injuries: DataQualityLevel;
      h2h: DataQualityLevel;
    };
  };
}

export function SafesDuJour() {
  const [matches, setMatches] = useState<SafeMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSafes = useCallback(async () => {
    try {
      const response = await fetch('/api/matches?status=upcoming');
      const data = await response.json();
      
      // L'API retourne { matches: [...], timing: {...} }
      const allMatches = data.matches || data || [];
      
      // Filtrer et trier par risque le plus bas
      const safeMatches = allMatches
        .filter((m: SafeMatch) => m.insight && m.insight.riskPercentage <= 40)
        .sort((a: SafeMatch, b: SafeMatch) => 
          (a.insight?.riskPercentage || 50) - (b.insight?.riskPercentage || 50)
        )
        .slice(0, 20); // 20 matchs sûrs max
      
      setMatches(safeMatches);
    } catch (error) {
      console.error('Error fetching safes:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSafes();
  }, [fetchSafes]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchSafes();
  };

  // Calculer la qualité globale des données
  const getOverallDataQuality = (): { quality: DataQualityLevel; realCount: number; estimatedCount: number } => {
    if (matches.length === 0) {
      return { quality: 'estimated', realCount: 0, estimatedCount: 0 };
    }
    
    const realCount = matches.filter(m => m.dataQuality?.hasRealData || m.dataQuality?.overall === 'real').length;
    const estimatedCount = matches.length - realCount;
    
    let overallQuality: DataQualityLevel;
    if (realCount === matches.length) {
      overallQuality = 'real';
    } else if (realCount === 0) {
      overallQuality = 'estimated';
    } else {
      overallQuality = 'partial';
    }
    
    return { quality: overallQuality, realCount, estimatedCount };
  };

  const dataQualityInfo = getOverallDataQuality();

  return (
    <section id="safes" className="scroll-mt-20">
      <Card className="overflow-hidden border-green-500/30 bg-gradient-to-br from-card via-card to-green-500/5">
        <CardHeader className="border-b border-border/50 bg-gradient-to-r from-green-500/10 to-transparent">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div className="p-1.5 sm:p-2 rounded-xl bg-green-500 shrink-0 shadow-lg shadow-green-500/20">
                <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-lg sm:text-xl text-foreground">Safes du Jour</CardTitle>
                <p className="text-xs sm:text-sm text-muted-foreground truncate">
                  Pronostics avec le plus haut taux de réussite
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-9 w-9 shrink-0 text-green-500 hover:bg-green-500/10"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-4 sm:p-6">
          {/* Indicateur global de qualité des données */}
          {!loading && matches.length > 0 && (
            <div className="mb-4">
              <GlobalDataQualityBanner
                overallQuality={dataQualityInfo.quality}
                realDataCount={dataQualityInfo.realCount}
                estimatedDataCount={dataQualityInfo.estimatedCount}
              />
            </div>
          )}

          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : matches.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {matches.map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mb-4">
                <Shield className="h-8 w-8 text-green-500/50" />
              </div>
              <p className="text-foreground font-medium">
                Aucun pronostic sûr disponible pour le moment
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Les nouveaux matchs apparaîtront ici automatiquement
              </p>
            </div>
          )}
          
          {/* Stats Summary */}
          {matches.length > 0 && (
            <div className="mt-6 pt-4 border-t border-border/50">
              <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-xs sm:text-sm">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Badge className="bg-green-500 text-white border-0 text-xs sm:text-sm font-medium">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    {matches.length} Sûrs
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Badge className="bg-orange-500/15 text-orange-600 border-orange-500/30 dark:text-orange-400 text-xs sm:text-sm font-medium">
                    <Sparkles className="h-3 w-3 mr-1" />
                    {matches.filter(m => m.insight?.valueBetDetected).length} Value Bets
                  </Badge>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 px-3 py-1.5 rounded-full bg-green-500/10">
                  <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-green-500 shrink-0" />
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    Confiance: {Math.round(
                      matches.reduce((sum, m) => sum + (100 - (m.insight?.riskPercentage || 50)), 0) / matches.length
                    )}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
