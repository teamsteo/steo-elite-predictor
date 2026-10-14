'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Shield, AlertCircle, TrendingDown, Zap, CheckCircle } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

interface TrapMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  date: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  trapInfo?: {
    isTrap: boolean;
    trapType: string;
    explanation: string;
    recommendation: string;
  };
}

const trapTypeLabels: Record<string, { label: string; icon: typeof AlertTriangle; color: string }> = {
  favorite_trap: { 
    label: 'Piège Favori', 
    icon: AlertTriangle, 
    color: 'text-red-500 bg-red-500/15 border-red-500/30' 
  },
  disparity_trap: { 
    label: 'Écart Trompeur', 
    icon: TrendingDown, 
    color: 'text-orange-500 bg-orange-500/15 border-orange-500/30' 
  },
  uncertainty_trap: { 
    label: 'Match Incertain', 
    icon: AlertCircle, 
    color: 'text-amber-500 bg-amber-500/15 border-amber-500/30' 
  },
  away_favorite_trap: { 
    label: 'Favori Extérieur', 
    icon: Zap, 
    color: 'text-orange-500 bg-orange-500/15 border-orange-500/30' 
  },
};

export function AntiTrap() {
  const [trapMatches, setTrapMatches] = useState<TrapMatch[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTraps = useCallback(async () => {
    try {
      const response = await fetch('/api/matches');
      const data = await response.json();
      
      // Simuler la détection de pièges
      // En production, ceci serait calculé côté serveur
      const traps = data.slice(0, 3).map((match: any) => {
        const homeOdds = match.oddsHome;
        const awayOdds = match.oddsAway;
        const disparity = Math.abs(homeOdds - awayOdds);
        
        let trapInfo = {
          isTrap: false,
          trapType: 'none',
          explanation: '',
          recommendation: '',
        };
        
        // Détecter les pièges
        if (homeOdds < 1.3 || awayOdds < 1.3) {
          trapInfo = {
            isTrap: true,
            trapType: 'favorite_trap',
            explanation: `Cote ultra-basse (${Math.min(homeOdds, awayOdds).toFixed(2)}) sur le favori. Gains minimes pour un risque présent.`,
            recommendation: 'Éviter ou miser très petit. Le ratio risque/récompense est défavorable.',
          };
        } else if (disparity > 3 && (homeOdds < 1.6 || awayOdds < 1.6)) {
          trapInfo = {
            isTrap: true,
            trapType: 'disparity_trap',
            explanation: `Grand écart de cotes (${disparity.toFixed(1)}). Le favori semble imbattable mais attention aux surprises!`,
            recommendation: 'Considérer une protection ou éviter ce match.',
          };
        } else if (awayOdds < homeOdds && awayOdds < 1.9) {
          trapInfo = {
            isTrap: true,
            trapType: 'away_favorite_trap',
            explanation: `Favori à l'extérieur avec cote basse. Les équipes extérieures sont souvent surévaluées.`,
            recommendation: 'Analyser la forme récente avant de parier sur le favori extérieur.',
          };
        }
        
        return { ...match, trapInfo };
      }).filter((m: TrapMatch) => m.trapInfo?.isTrap);
      
      setTrapMatches(traps);
    } catch (error) {
      console.error('Error fetching traps:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTraps();
  }, [fetchTraps]);

  return (
    <section id="antitrap" className="scroll-mt-20">
      <Card className="overflow-hidden border-red-500/30 bg-gradient-to-br from-card via-card to-red-500/5">
        <CardHeader className="border-b border-border/50 bg-gradient-to-r from-red-500/10 to-transparent">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 rounded-xl bg-red-500 shrink-0 shadow-lg shadow-red-500/20">
              <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-lg sm:text-xl text-foreground flex items-center gap-2">
                Anti-Trap
                <Badge className="bg-red-500 text-white border-0 text-xs font-medium">
                  Alerte
                </Badge>
              </CardTitle>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                Évitez les pièges des bookmakers
              </p>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-4 sm:p-6">
          {loading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : trapMatches.length > 0 ? (
            <div className="space-y-4">
              {trapMatches.map((match) => {
                const trapConfig = trapTypeLabels[match.trapInfo?.trapType || ''] || {
                  label: 'Alerte',
                  icon: AlertTriangle,
                  color: 'text-amber-500 bg-amber-500/15 border-amber-500/30',
                };
                const Icon = trapConfig.icon;
                
                return (
                  <div
                    key={match.id}
                    className="p-4 rounded-xl border border-red-500/20 bg-gradient-to-r from-red-500/5 to-transparent hover:border-red-500/30 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                      <div className="p-2 rounded-lg bg-red-500/15 shrink-0 self-start">
                        <Icon className="h-5 w-5 text-red-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <Badge variant="outline" className={trapConfig.color + ' font-medium'}>
                            {trapConfig.label}
                          </Badge>
                          <span className="text-sm font-medium text-foreground truncate">
                            {match.homeTeam} vs {match.awayTeam}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {match.trapInfo?.explanation}
                        </p>
                        <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                          💡 {match.trapInfo?.recommendation}
                        </p>
                      </div>
                      <div className="text-right shrink-0 bg-muted/50 px-3 py-2 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Cotes</div>
                        <div className="font-mono text-sm font-bold">
                          <span className="text-orange-500">{match.oddsHome?.toFixed(2) || '-'}</span>
                          {match.oddsDraw != null && typeof match.oddsDraw === 'number' && (
                            <span className="text-muted-foreground mx-1">| {match.oddsDraw.toFixed(2)} |</span>
                          )}
                          <span className="text-foreground">{match.oddsAway?.toFixed(2) || '-'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mb-4">
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
              <p className="text-green-600 dark:text-green-400 font-semibold mb-1">
                Aucun piège détecté actuellement
              </p>
              <p className="text-sm text-muted-foreground">
                Tous les matchs présentent un profil normal
              </p>
            </div>
          )}
          
          {/* Tips */}
          <div className="mt-6 pt-4 border-t border-border/50">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2 text-foreground">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              Comment repérer les pièges
            </h4>
            <div className="grid gap-2 md:grid-cols-2 text-xs">
              <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/5 border border-red-500/10">
                <span className="text-red-500 font-bold">•</span>
                <span className="text-muted-foreground">Cotes très basses (&lt;1.3) = gains minimes, risque présent</span>
              </div>
              <div className="flex items-start gap-2 p-2 rounded-lg bg-orange-500/5 border border-orange-500/10">
                <span className="text-orange-500 font-bold">•</span>
                <span className="text-muted-foreground">Grands écarts de cotes = favori surévalué</span>
              </div>
              <div className="flex items-start gap-2 p-2 rounded-lg bg-orange-500/5 border border-orange-500/10">
                <span className="text-orange-500 font-bold">•</span>
                <span className="text-muted-foreground">Favori à l'extérieur = souvent piégeux</span>
              </div>
              <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
                <span className="text-amber-500 font-bold">•</span>
                <span className="text-muted-foreground">Matchs avec cotes similaires = imprévisibles</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
