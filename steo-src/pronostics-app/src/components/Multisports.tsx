'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MatchCard } from './MatchCard';
import { Trophy, RefreshCw, TrendingUp, BarChart3 } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  date: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  status: string;
  // Tags de date pour différencier hier/aujourd'hui/demain
  dateTag?: 'hier' | "aujourd'hui" | 'demain';
  dateLabel?: string;
  displayDate?: string;
  insight?: {
    riskPercentage: number;
    valueBetDetected: boolean;
    valueBetType: string | null;
    confidence: string;
  };
}

const sportsConfig: Record<string, { icon: string; label: string; color: string }> = {
  Foot: { icon: '⚽', label: 'Football', color: 'data-[state=active]:bg-green-500 data-[state=active]:text-white' },
  NBA: { icon: '🏀', label: 'NBA', color: 'data-[state=active]:bg-orange-500 data-[state=active]:text-white' },
  NHL: { icon: '🏒', label: 'NHL', color: 'data-[state=active]:bg-blue-500 data-[state=active]:text-white' },
  AHL: { icon: '🏒', label: 'AHL', color: 'data-[state=active]:bg-cyan-500 data-[state=active]:text-white' },
};

export function Multisports() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSport, setActiveSport] = useState('all');

  const fetchMatches = useCallback(async () => {
    try {
      const response = await fetch('/api/matches');
      const data = await response.json();
      // L'API retourne { matches: [...], timing: {...} }
      setMatches(data.matches || data || []);
    } catch (error) {
      console.error('Error fetching matches:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const filteredMatches = activeSport === 'all' 
    ? matches 
    : matches.filter(m => m.sport === activeSport);

  const sportStats = matches.reduce((acc, match) => {
    if (!acc[match.sport]) {
      acc[match.sport] = { count: 0, avgRisk: 0, valueBets: 0 };
    }
    acc[match.sport].count++;
    acc[match.sport].avgRisk += match.insight?.riskPercentage || 50;
    if (match.insight?.valueBetDetected) acc[match.sport].valueBets++;
    return acc;
  }, {} as Record<string, { count: number; avgRisk: number; valueBets: number }>);

  // Calculate averages
  Object.keys(sportStats).forEach(sport => {
    sportStats[sport].avgRisk = Math.round(sportStats[sport].avgRisk / sportStats[sport].count);
  });

  return (
    <section id="multisports" className="scroll-mt-20">
      <Card className="overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-orange-500/5">
        <CardHeader className="border-b border-border/50 bg-gradient-to-r from-orange-500/10 to-transparent">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div className="p-1.5 sm:p-2 rounded-xl bg-orange-500 shrink-0 shadow-lg shadow-orange-500/20">
                <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-lg sm:text-xl text-foreground">Multisports</CardTitle>
                <p className="text-xs sm:text-sm text-muted-foreground truncate">
                  Tous les matchs par sport
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { setLoading(true); fetchMatches(); }}
              disabled={loading}
              className="h-9 w-9 shrink-0 text-orange-500 hover:bg-orange-500/10"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-4 sm:p-6">
          <Tabs defaultValue="all" onValueChange={setActiveSport}>
            {/* Scrollable tabs on mobile */}
            <div className="overflow-x-auto -mx-4 sm:mx-0 mb-6">
              <TabsList className="w-full sm:w-auto justify-start min-w-max bg-muted/50 p-1 h-auto mx-4 sm:mx-0">
                <TabsTrigger 
                  value="all" 
                  className="data-[state=active]:bg-orange-500 data-[state=active]:text-white px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium"
                >
                  Tous ({matches.length})
                </TabsTrigger>
                {Object.entries(sportsConfig).map(([sport, config]) => (
                  <TabsTrigger 
                    key={sport}
                    value={sport}
                    className={`${config.color} px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium`}
                  >
                    {config.icon} {sport} ({matches.filter(m => m.sport === sport).length})
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value={activeSport} className="mt-0">
              {loading ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="h-48 rounded-lg bg-muted animate-pulse" />
                  ))}
                </div>
              ) : filteredMatches.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredMatches.map((match) => (
                    <MatchCard key={match.id} match={match} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="mx-auto w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-4">
                    <Trophy className="h-8 w-8 text-orange-500/50" />
                  </div>
                  <p className="text-foreground font-medium">
                    Aucun match disponible pour ce sport
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Sport Statistics */}
          {Object.keys(sportStats).length > 0 && (
            <div className="mt-6 pt-4 border-t border-border/50">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2 text-foreground">
                <BarChart3 className="h-4 w-4 text-orange-500" />
                Statistiques par sport
              </h4>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                {Object.entries(sportStats).map(([sport, stats]) => {
                  const config = sportsConfig[sport as keyof typeof sportsConfig];
                  return (
                    <div
                      key={sport}
                      className="p-3 sm:p-4 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{config?.icon || '🏟️'}</span>
                        <span className="font-semibold text-sm text-foreground">{sport}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <div className="text-muted-foreground">Matchs</div>
                          <div className="font-bold text-foreground">{stats.count}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Risque</div>
                          <div className={`font-bold ${
                            stats.avgRisk <= 40 ? 'text-green-500' : 
                            stats.avgRisk <= 60 ? 'text-orange-500' : 'text-red-500'
                          }`}>
                            {stats.avgRisk}%
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">VB</div>
                          <div className="font-bold text-orange-500">{stats.valueBets}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
