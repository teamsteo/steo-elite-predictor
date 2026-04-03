'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  BarChart3,
  TrendingUp,
  Target,
  AlertCircle,
  CheckCircle,
  XCircle,
  Minus,
  RefreshCw,
  Trophy,
  Zap,
  Calendar,
  Database,
  ChevronLeft
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

// Types pour les statistiques détaillées du store
interface DetailedStats {
  total: number;
  correct: number;
  rate: number;
}

interface PeriodStats {
  totalPredictions: number;
  results: DetailedStats;
  goals: DetailedStats;
  cards: DetailedStats;
  overall: number;
  pending: number;
  completed: number;
  wins: number;
  losses: number;
  winRate: number;
}

interface AllStats {
  daily: PeriodStats;
  weekly: PeriodStats;
  monthly: PeriodStats;
  overall: PeriodStats;
}

interface StoreInfo {
  total: number;
  pending: number;
  completed: number;
  lastUpdate: string;
  version: string;
}

interface Prediction {
  id: string;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  predictedResult?: string;
  predictedGoals?: string | null;
  predictedCards?: string | null;
  confidence: string;
  status: string;
  sport: string;
  matchDate: string;
  resultMatch?: boolean;
  goalsMatch?: boolean;
  homeScore?: number;
  awayScore?: number;
  actualResult?: string;
}

// Interface pour les stats par type de pari
interface BetTypeStat {
  type: string;
  label: string;
  icon: React.ReactNode;
  total: number;
  won: number;
  lost: number;
  pending: number;
  winRate: number;
  avgOdds: number;
  profit: number;
  trend: 'up' | 'down' | 'stable';
}

// Vérifier si une date est hier
function isYesterday(dateString: string): boolean {
  const date = new Date(dateString);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  
  return checkDate.getTime() === yesterday.getTime();
}

// Vérifier si une date est aujourd'hui
function isToday(dateString: string): boolean {
  const date = new Date(dateString);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

// Statistiques basées sur les vraies données avec résultats
const calculateBetTypeStats = (predictions: Prediction[], filterDate: 'yesterday' | 'today' | 'all'): BetTypeStat[] => {
  const stats: BetTypeStat[] = [];
  
  // Filtrer par date
  let filteredPredictions = predictions;
  if (filterDate === 'yesterday') {
    filteredPredictions = predictions.filter(p => isYesterday(p.matchDate));
  } else if (filterDate === 'today') {
    filteredPredictions = predictions.filter(p => isToday(p.matchDate));
  }

  // 1. Résultat Match (1X2)
  const resultPredictions = filteredPredictions.filter(p => p.predictedResult);
  const resultWon = resultPredictions.filter(p => p.status === 'completed' && p.resultMatch === true).length;
  const resultLost = resultPredictions.filter(p => p.status === 'completed' && p.resultMatch === false).length;
  const resultPending = resultPredictions.filter(p => p.status === 'pending').length;
  const resultTotal = resultWon + resultLost;

  stats.push({
    type: 'result',
    label: 'Résultat Match',
    icon: <Trophy className="h-4 w-4" />,
    total: resultPredictions.length,
    won: resultWon,
    lost: resultLost,
    pending: resultPending,
    winRate: resultTotal > 0 ? Math.round((resultWon / resultTotal) * 100) : 0,
    avgOdds: 1.85,
    profit: resultTotal > 0 ? Math.round((resultWon * 0.85 - resultLost) * 10) / 10 : 0,
    trend: resultWon > resultLost ? 'up' : resultWon < resultLost ? 'down' : 'stable'
  });

  // 2. Buts (Over/Under)
  const goalsPredictions = filteredPredictions.filter(p => p.predictedGoals);
  const goalsWon = goalsPredictions.filter(p => p.status === 'completed' && p.goalsMatch === true).length;
  const goalsLost = goalsPredictions.filter(p => p.status === 'completed' && p.goalsMatch === false).length;
  const goalsPending = goalsPredictions.filter(p => p.status === 'pending').length;
  const goalsTotal = goalsWon + goalsLost;

  stats.push({
    type: 'goals',
    label: 'Buts (Over/Under)',
    icon: <Target className="h-4 w-4" />,
    total: goalsPredictions.length,
    won: goalsWon,
    lost: goalsLost,
    pending: goalsPending,
    winRate: goalsTotal > 0 ? Math.round((goalsWon / goalsTotal) * 100) : 0,
    avgOdds: 1.75,
    profit: goalsTotal > 0 ? Math.round((goalsWon * 0.75 - goalsLost) * 10) / 10 : 0,
    trend: goalsWon > goalsLost ? 'up' : goalsWon < goalsLost ? 'down' : 'stable'
  });

  // 3. Les deux marquent (BTTS)
  const bttsPredictions = goalsPredictions.filter(p => p.predictedGoals?.includes('marquent'));
  const bttsWon = bttsPredictions.filter(p => p.status === 'completed' && p.goalsMatch === true).length;
  const bttsLost = bttsPredictions.filter(p => p.status === 'completed' && p.goalsMatch === false).length;
  const bttsPending = bttsPredictions.filter(p => p.status === 'pending').length;
  const bttsTotal = bttsWon + bttsLost;

  stats.push({
    type: 'btts',
    label: 'Les deux marquent',
    icon: <Zap className="h-4 w-4" />,
    total: bttsPredictions.length,
    won: bttsWon,
    lost: bttsLost,
    pending: bttsPending,
    winRate: bttsTotal > 0 ? Math.round((bttsWon / bttsTotal) * 100) : 0,
    avgOdds: 1.70,
    profit: bttsTotal > 0 ? Math.round((bttsWon * 0.70 - bttsLost) * 10) / 10 : 0,
    trend: bttsWon > bttsLost ? 'up' : bttsWon < bttsLost ? 'down' : 'stable'
  });

  // 4. Cartons (pas de source de données réelles)
  stats.push({
    type: 'cards',
    label: 'Cartons (Indispo)',
    icon: <AlertCircle className="h-4 w-4" />,
    total: 0,
    won: 0,
    lost: 0,
    pending: 0,
    winRate: 0,
    avgOdds: 1.80,
    profit: 0,
    trend: 'stable'
  });

  // 5. Confiance Haute
  const highConfPredictions = filteredPredictions.filter(p => p.confidence === 'high');
  const highConfWon = highConfPredictions.filter(p => p.status === 'completed' && p.resultMatch === true).length;
  const highConfLost = highConfPredictions.filter(p => p.status === 'completed' && p.resultMatch === false).length;
  const highConfPending = highConfPredictions.filter(p => p.status === 'pending').length;
  const highConfTotal = highConfWon + highConfLost;

  stats.push({
    type: 'highConf',
    label: 'Confiance Haute',
    icon: <CheckCircle className="h-4 w-4" />,
    total: highConfPredictions.length,
    won: highConfWon,
    lost: highConfLost,
    pending: highConfPending,
    winRate: highConfTotal > 0 ? Math.round((highConfWon / highConfTotal) * 100) : 0,
    avgOdds: 1.65,
    profit: highConfTotal > 0 ? Math.round((highConfWon * 0.65 - highConfLost) * 10) / 10 : 0,
    trend: highConfWon > highConfLost ? 'up' : highConfWon < highConfLost ? 'down' : 'stable'
  });

  return stats;
};

export function BetTypeStats() {
  const [stats, setStats] = useState<BetTypeStat[]>([]);
  const [allStats, setAllStats] = useState<AllStats | null>(null);
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dataSource, setDataSource] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'yesterday' | 'today' | 'all'>('yesterday');

  const fetchStats = useCallback(async () => {
    try {
      // Récupérer les prédictions RÉELLES depuis le store
      const response = await fetch('/api/predictions');
      const data = await response.json();
      
      const preds = data.predictions || [];
      const detailedStats = data.stats as AllStats;
      const info = data.storeInfo as StoreInfo;
      
      setPredictions(preds);
      setAllStats(detailedStats);
      setStoreInfo(info);
      setDataSource(data.source || 'unknown');
      
      // Calculer les statistiques basées sur le filtre de date
      const betStats = calculateBetTypeStats(preds, dateFilter);
      setStats(betStats);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateFilter]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-3 w-3 text-green-500" />;
      case 'down':
        return <TrendingUp className="h-3 w-3 text-red-500 rotate-180" />;
      default:
        return <Minus className="h-3 w-3 text-gray-400" />;
    }
  };

  // Calculer les totaux à partir des stats
  const totalStats = stats.reduce(
    (acc, stat) => ({
      total: acc.total + stat.total,
      won: acc.won + stat.won,
      lost: acc.lost + stat.lost,
      pending: acc.pending + stat.pending,
    }),
    { total: 0, won: 0, lost: 0, pending: 0 }
  );

  const overallWinRate = totalStats.won + totalStats.lost > 0
    ? Math.round((totalStats.won / (totalStats.won + totalStats.lost)) * 100)
    : 0;
  
  // Date formatée selon le filtre
  const getFormattedDate = () => {
    if (dateFilter === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return 'Hier - ' + yesterday.toLocaleDateString('fr-FR', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long' 
      });
    } else if (dateFilter === 'today') {
      return "Aujourd'hui - " + new Date().toLocaleDateString('fr-FR', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long' 
      });
    } else {
      return 'Toutes les prédictions';
    }
  };

  // Compter les prédictions vérifiées
  const verifiedCount = predictions.filter(p => p.status === 'completed').length;
  const pendingCount = predictions.filter(p => p.status === 'pending').length;

  return (
    <section id="stats" className="scroll-mt-20">
      <Card className="overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-blue-500/5">
        <CardHeader className="border-b border-border/50 bg-gradient-to-r from-blue-500/10 to-transparent">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div className="p-1.5 sm:p-2 rounded-xl bg-blue-500 shrink-0 shadow-lg shadow-blue-500/20">
                <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-lg sm:text-xl text-foreground">
                  Statistiques du Modèle
                </CardTitle>
                <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span className="capitalize">{getFormattedDate()}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Indicateur de source de données */}
              <Badge variant="outline" className="text-xs hidden sm:flex">
                <Database className="h-3 w-3 mr-1" />
                {dataSource === 'github-store' ? 'Store' : 'Demo'}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                disabled={refreshing}
                className="h-9 w-9 shrink-0 text-blue-500 hover:bg-blue-500/10"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* Filtres de date */}
              <div className="flex gap-2 mb-6">
                <Button
                  variant={dateFilter === 'yesterday' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDateFilter('yesterday')}
                  className="flex items-center gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Hier
                </Button>
                <Button
                  variant={dateFilter === 'today' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDateFilter('today')}
                >
                  Aujourd'hui
                </Button>
                <Button
                  variant={dateFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDateFilter('all')}
                >
                  Tout
                </Button>
              </div>

              {/* Alerte si données non vérifiées */}
              {verifiedCount === 0 && pendingCount > 0 && (
                <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-200">
                        ⚠️ Données non vérifiées
                      </p>
                      <p className="text-sm text-amber-200/70 mt-1">
                        {pendingCount} pronostics en attente de vérification. 
                        Les résultats réels n'ont pas encore été récupérés.
                      </p>
                      <p className="text-xs text-amber-200/50 mt-2">
                        Le cron de vérification tourne à 00h, 04h et 05h UTC.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {totalStats.total === 0 ? (
                <div className="text-center py-12">
                  <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
                    <BarChart3 className="h-8 w-8 text-blue-500/50" />
                  </div>
                  <p className="text-foreground font-medium">
                    Aucun pronostic pour cette période
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Sélectionnez une autre période ou ajoutez des pronostics
                  </p>
                </div>
              ) : (
                <>
                  {/* Résumé global */}
                  <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20">
                    <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-center">
                      <div>
                        <div className="text-2xl sm:text-3xl font-bold text-foreground">{totalStats.total}</div>
                        <div className="text-xs sm:text-sm text-muted-foreground">Total</div>
                      </div>
                      <div>
                        <div className="text-2xl sm:text-3xl font-bold text-green-500">{totalStats.won}</div>
                        <div className="text-xs sm:text-sm text-muted-foreground">Gagnés</div>
                      </div>
                      <div>
                        <div className="text-2xl sm:text-3xl font-bold text-red-500">{totalStats.lost}</div>
                        <div className="text-xs sm:text-sm text-muted-foreground">Perdus</div>
                      </div>
                      <div>
                        <div className="text-2xl sm:text-3xl font-bold text-orange-500">{totalStats.pending}</div>
                        <div className="text-xs sm:text-sm text-muted-foreground">En attente</div>
                      </div>
                      {totalStats.won + totalStats.lost > 0 && (
                        <div>
                          <div className="text-2xl sm:text-3xl font-bold text-blue-500">{overallWinRate}%</div>
                          <div className="text-xs sm:text-sm text-muted-foreground">Réussite</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stats par type */}
                  {totalStats.won + totalStats.lost > 0 && (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {stats.filter(s => s.total > 0).map((stat) => (
                        <div
                          key={stat.type}
                          className="p-4 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                                {stat.icon}
                              </div>
                              <span className="font-semibold text-sm text-foreground">{stat.label}</span>
                            </div>
                            {getTrendIcon(stat.trend)}
                          </div>

                          <div className="space-y-2">
                            {/* Win Rate Progress */}
                            {stat.won + stat.lost > 0 && (
                              <>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Taux de réussite</span>
                                  <span className={`font-bold ${stat.winRate >= 60 ? 'text-green-500' : stat.winRate >= 40 ? 'text-orange-500' : 'text-red-500'}`}>
                                    {stat.winRate}%
                                  </span>
                                </div>
                                <Progress value={stat.winRate} className="h-2" />
                              </>
                            )}

                            {/* Stats détaillées */}
                            <div className="flex items-center justify-between text-xs pt-2">
                              <div className="flex gap-3">
                                <span className="flex items-center gap-1">
                                  <CheckCircle className="h-3 w-3 text-green-500" />
                                  {stat.won}
                                </span>
                                <span className="flex items-center gap-1">
                                  <XCircle className="h-3 w-3 text-red-500" />
                                  {stat.lost}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Minus className="h-3 w-3 text-orange-500" />
                                  {stat.pending}
                                </span>
                              </div>
                              {stat.profit !== 0 && stat.won + stat.lost > 0 && (
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${stat.profit > 0 ? 'border-green-500 text-green-500' : 'border-red-500 text-red-500'}`}
                                >
                                  {stat.profit > 0 ? '+' : ''}{stat.profit}u
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Stats globales (hebdo/mensuel) */}
                  {allStats && (allStats.weekly?.wins + allStats.weekly?.losses > 0) && (
                    <div className="mt-6 pt-4 border-t border-border/50">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="p-3 rounded-lg bg-muted/30">
                          <div className="text-lg font-bold text-blue-500">{allStats.weekly?.winRate || 0}%</div>
                          <div className="text-xs text-muted-foreground">Cette semaine</div>
                          <div className="text-xs text-muted-foreground/70">
                            {allStats.weekly?.wins || 0}W / {allStats.weekly?.losses || 0}L
                          </div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/30">
                          <div className="text-lg font-bold text-purple-500">{allStats.monthly?.winRate || 0}%</div>
                          <div className="text-xs text-muted-foreground">Ce mois</div>
                          <div className="text-xs text-muted-foreground/70">
                            {allStats.monthly?.wins || 0}W / {allStats.monthly?.losses || 0}L
                          </div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/30">
                          <div className="text-lg font-bold text-green-500">{allStats.overall?.winRate || 0}%</div>
                          <div className="text-xs text-muted-foreground">Global</div>
                          <div className="text-xs text-muted-foreground/70">
                            {allStats.overall?.wins || 0}W / {allStats.overall?.losses || 0}L
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Légende */}
              <div className="mt-6 pt-4 border-t border-border/50">
                <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span>Gagné</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <XCircle className="h-3 w-3 text-red-500" />
                    <span>Perdu</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Minus className="h-3 w-3 text-orange-500" />
                    <span>En attente</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-green-500" />
                    <span>Tendance positive</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
