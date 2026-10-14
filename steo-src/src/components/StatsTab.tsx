'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Target,
  DollarSign,
  Calendar,
  RefreshCw,
  Award,
  AlertTriangle,
  Trophy,
  CheckCircle,
  XCircle,
  Minus,
  Database,
  Zap,
  Filter,
} from 'lucide-react';

// Types
interface PredictionRecord {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  prediction: {
    bet: 'home' | 'draw' | 'away' | 'avoid';
    confidence: 'very_high' | 'high' | 'medium' | 'low';
  };
  result?: {
    isCorrect: boolean;
    profit: number;
  };
  generatedAt: string;
  status: string;
  resultMatch?: boolean;
  goalsMatch?: boolean;
}

interface StatsData {
  overall: {
    total: number;
    wins: number;
    losses: number;
    pending: number;
    winRate: number;
    roi: number;
    profit: number;
  };
  bySport: {
    sport: string;
    total: number;
    wins: number;
    losses: number;
    pending: number;
    winRate: number;
    profit: number;
  }[];
  byConfidence: {
    confidence: string;
    total: number;
    wins: number;
    losses: number;
    winRate: number;
    profit: number;
  }[];
  byBetType: {
    type: string;
    label: string;
    total: number;
    wins: number;
    losses: number;
    pending: number;
    winRate: number;
  }[];
  timeline: {
    date: string;
    total: number;
    wins: number;
    losses: number;
    winRate: number;
  }[];
  streaks: {
    current: number;
    best: number;
    worst: number;
  };
}

const COLORS = {
  green: '#22c55e',
  orange: '#f97316',
  red: '#ef4444',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  yellow: '#eab308',
  pink: '#ec4899',
};

const SPORT_COLORS: Record<string, string> = {
  football: '#22c55e',
  basketball: '#f97316',
  nhl: '#06b6d4',
  nfl: '#ef4444',
  tennis: '#8b5cf6',
  baseball: '#eab308',
};

const SPORT_ICONS: Record<string, string> = {
  football: '⚽',
  basketball: '🏀',
  nhl: '🏒',
  nfl: '🏈',
  tennis: '🎾',
  baseball: '⚾',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  very_high: '#22c55e',
  high: '#3b82f6',
  medium: '#f97316',
  low: '#ef4444',
};

const CONFIDENCE_LABELS: Record<string, string> = {
  very_high: 'Très Haute',
  high: 'Haute',
  medium: 'Moyenne',
  low: 'Basse',
};

export function StatsTab() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dataSource, setDataSource] = useState<string>('');
  const [periodFilter, setPeriodFilter] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  const fetchStats = useCallback(async () => {
    try {
      // Récupérer les prédictions
      const predictionsRes = await fetch('/api/predictions');
      const predictionsData = await predictionsRes.json();
      
      // Récupérer l'historique
      const historyRes = await fetch('/api/history?type=predictions');
      const historyData = await historyRes.json();

      const predictions = predictionsData.predictions || [];
      const history = historyData.predictions || [];

      // Combiner les données
      const allPredictions = [...predictions, ...history];
      
      setDataSource(predictionsData.source || 'unknown');

      // Calculer les stats
      const stats = calculateStats(allPredictions, periodFilter);
      setData(stats);
    } catch (error) {
      console.error('Error fetching stats:', error);
      setData(getDemoData());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [periodFilter]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-48 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Statistiques Détaillées
          </h2>
          <p className="text-sm text-muted-foreground">
            Analyse complète des performances du modèle prédictif
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            <Database className="h-3 w-3 mr-1" />
            {dataSource === 'github-store' ? 'Données réelles' : 'Démo'}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-9 w-9"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Filtres de période */}
      <div className="flex flex-wrap gap-2">
        {[
          { value: '7d', label: '7 jours' },
          { value: '30d', label: '30 jours' },
          { value: '90d', label: '90 jours' },
          { value: 'all', label: 'Tout' },
        ].map((filter) => (
          <Button
            key={filter.value}
            variant={periodFilter === filter.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriodFilter(filter.value as typeof periodFilter)}
            className="flex items-center gap-1"
          >
            <Filter className="h-3 w-3" />
            {filter.label}
          </Button>
        ))}
      </div>

      {/* KPIs globaux */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
        <KPICard
          title="Total Prédictions"
          value={data.overall.total.toString()}
          icon={<BarChart3 className="h-4 w-4" />}
          color="blue"
        />
        <KPICard
          title="Gagnés"
          value={data.overall.wins.toString()}
          icon={<CheckCircle className="h-4 w-4" />}
          color="green"
          subtitle={`${data.overall.winRate}% réussite`}
        />
        <KPICard
          title="Perdus"
          value={data.overall.losses.toString()}
          icon={<XCircle className="h-4 w-4" />}
          color="red"
        />
        <KPICard
          title="En attente"
          value={data.overall.pending.toString()}
          icon={<Minus className="h-4 w-4" />}
          color="orange"
        />
        <KPICard
          title="ROI"
          value={`${data.overall.roi > 0 ? '+' : ''}${data.overall.roi.toFixed(1)}%`}
          icon={<DollarSign className="h-4 w-4" />}
          color={data.overall.roi >= 0 ? 'green' : 'red'}
        />
        <KPICard
          title="Série"
          value={`${data.streaks.current > 0 ? '+' : ''}${data.streaks.current}`}
          icon={<Activity className="h-4 w-4" />}
          color={data.streaks.current > 0 ? 'green' : data.streaks.current < 0 ? 'red' : 'orange'}
          subtitle={`Record: ${data.streaks.best}`}
        />
      </div>

      {/* Graphiques */}
      <Tabs defaultValue="sport" className="w-full">
        <TabsList className="w-full justify-start bg-muted/50 p-1 h-auto flex-wrap">
          <TabsTrigger value="sport" className="text-xs sm:text-sm">
            🏆 Par Sport
          </TabsTrigger>
          <TabsTrigger value="confidence" className="text-xs sm:text-sm">
            💪 Par Confiance
          </TabsTrigger>
          <TabsTrigger value="bettype" className="text-xs sm:text-sm">
            🎯 Par Type
          </TabsTrigger>
          <TabsTrigger value="timeline" className="text-xs sm:text-sm">
            📈 Évolution
          </TabsTrigger>
        </TabsList>

        {/* Stats par Sport */}
        <TabsContent value="sport" className="mt-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Pie Chart */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4 text-blue-500" />
                  Répartition par Sport
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={data.bySport.filter(s => s.total > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="total"
                      nameKey="sport"
                      label={({ sport, percent }) => `${sport} ${(percent * 100).toFixed(0)}%`}
                    >
                      {data.bySport.filter(s => s.total > 0).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={SPORT_COLORS[entry.sport] || Object.values(COLORS)[index % 8]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number, name: string) => [value, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Stats détaillées */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-yellow-500" />
                  Performance par Sport
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.bySport.filter(s => s.total > 0).map((sport) => (
                    <div key={sport.sport} className="p-3 rounded-lg bg-muted/30 border border-border/50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{SPORT_ICONS[sport.sport] || '🏟️'}</span>
                          <span className="font-medium capitalize">{sport.sport}</span>
                        </div>
                        <Badge
                          variant="outline"
                          className={sport.winRate >= 55 ? 'border-green-500 text-green-500' : sport.winRate >= 45 ? 'border-orange-500 text-orange-500' : 'border-red-500 text-red-500'}
                        >
                          {sport.winRate}% réussite
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{sport.wins}W / {sport.losses}L / {sport.pending}P</span>
                        <span className="text-xs">Total: {sport.total}</span>
                      </div>
                      <Progress 
                        value={sport.winRate} 
                        className="h-2 mt-2"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Stats par Confiance */}
        <TabsContent value="confidence" className="mt-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Bar Chart */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Award className="h-4 w-4 text-purple-500" />
                  Victoires par Niveau de Confiance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={data.byConfidence}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="confidence" stroke="#888" fontSize={10} tickFormatter={(v) => CONFIDENCE_LABELS[v] || v} />
                    <YAxis stroke="#888" fontSize={10} />
                    <Tooltip
                      contentStyle={{
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: '8px',
                      }}
                      labelFormatter={(label) => CONFIDENCE_LABELS[label] || label}
                    />
                    <Legend />
                    <Bar dataKey="wins" name="Gagnés" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="losses" name="Perdus" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Stats détaillées */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Zap className="h-4 w-4 text-yellow-500" />
                  Détail par Confiance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {data.byConfidence.map((item) => (
                    <div
                      key={item.confidence}
                      className="p-3 rounded-lg bg-muted/30 border border-border/50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className="text-sm font-bold"
                          style={{ color: CONFIDENCE_COLORS[item.confidence] }}
                        >
                          {CONFIDENCE_LABELS[item.confidence]}
                        </span>
                        <Badge
                          variant="outline"
                          className={item.winRate >= 55 ? 'border-green-500 text-green-500' : item.winRate >= 45 ? 'border-orange-500 text-orange-500' : 'border-red-500 text-red-500'}
                        >
                          {item.winRate}%
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.wins}W / {item.losses}L
                      </div>
                      <Progress 
                        value={item.winRate} 
                        className="h-1.5 mt-2"
                      />
                    </div>
                  ))}
                </div>
                
                {/* Insight */}
                <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <p className="text-xs text-blue-200">
                    💡 <strong>Insight:</strong> Les prédictions à confiance très haute ont le meilleur taux de réussite. 
                    {data.byConfidence.find(c => c.confidence === 'very_high')?.winRate || 0}% pour "Très Haute" vs{' '}
                    {data.byConfidence.find(c => c.confidence === 'low')?.winRate || 0}% pour "Basse".
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Stats par Type de Pari */}
        <TabsContent value="bettype" className="mt-4 space-y-4">
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4 text-cyan-500" />
                Performance par Type de Pari
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.byBetType.filter(b => b.total > 0).map((bet) => (
                  <div
                    key={bet.type}
                    className="p-4 rounded-xl bg-gradient-to-br from-muted/50 to-muted/30 border border-border/50 hover:border-border transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold text-foreground">{bet.label}</span>
                      <Badge
                        variant="outline"
                        className={bet.winRate >= 55 ? 'border-green-500 text-green-500' : bet.winRate >= 45 ? 'border-orange-500 text-orange-500' : 'border-red-500 text-red-500'}
                      >
                        {bet.winRate}%
                      </Badge>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Total: {bet.total}</span>
                        <span>{bet.wins}W / {bet.losses}L</span>
                      </div>
                      <Progress value={bet.winRate} className="h-2" />
                      {bet.pending > 0 && (
                        <div className="text-xs text-orange-500 flex items-center gap-1">
                          <Minus className="h-3 w-3" />
                          {bet.pending} en attente
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Évolution Temporelle */}
        <TabsContent value="timeline" className="mt-4 space-y-4">
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                Évolution du Taux de Réussite
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data.timeline}>
                  <defs>
                    <linearGradient id="colorWinRate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" stroke="#888" fontSize={10} />
                  <YAxis stroke="#888" fontSize={10} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      background: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [`${value}%`, 'Taux de réussite']}
                  />
                  <Area
                    type="monotone"
                    dataKey="winRate"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill="url(#colorWinRate)"
                    name="Taux de réussite"
                  />
                </AreaChart>
              </ResponsiveContainer>
              
              {/* Stats par période */}
              <div className="mt-4 grid grid-cols-3 gap-4">
                {data.timeline.slice(-3).map((item, index) => (
                  <div key={item.date} className="text-center p-3 rounded-lg bg-muted/30">
                    <div className="text-xs text-muted-foreground">{item.date}</div>
                    <div className={`text-lg font-bold ${item.winRate >= 50 ? 'text-green-500' : 'text-red-500'}`}>
                      {item.winRate}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.wins}W / {item.losses}L
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Alerte données insuffisantes */}
      {data.overall.total === 0 && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-200">
                Aucune donnée disponible
              </p>
              <p className="text-sm text-amber-200/70 mt-1">
                Les statistiques s'afficheront dès que des pronostics auront été générés et vérifiés.
                Le système de vérification des résultats tourne automatiquement.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// KPI Card Component
function KPICard({
  title,
  value,
  icon,
  color,
  subtitle,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: 'green' | 'orange' | 'red' | 'blue' | 'purple';
  subtitle?: string;
}) {
  const colorClasses = {
    green: 'text-green-500 bg-green-500/10 border-green-500/30',
    orange: 'text-orange-500 bg-orange-500/10 border-orange-500/30',
    red: 'text-red-500 bg-red-500/10 border-red-500/30',
    blue: 'text-blue-500 bg-blue-500/10 border-blue-500/30',
    purple: 'text-purple-500 bg-purple-500/10 border-purple-500/30',
  };

  return (
    <div className={`p-3 rounded-lg border ${colorClasses[color]} bg-background`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{title}</span>
        <span className={colorClasses[color].split(' ')[0]}>{icon}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
      {subtitle && (
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      )}
    </div>
  );
}

// Calculer les statistiques
function calculateStats(predictions: PredictionRecord[], period: string): StatsData {
  const now = new Date();
  let filteredPredictions = predictions;

  // Filtrer par période
  if (period !== 'all') {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    filteredPredictions = predictions.filter((p) => new Date(p.generatedAt) >= cutoff);
  }

  // Stats globales
  const total = filteredPredictions.length;
  const wins = filteredPredictions.filter((p) => p.result?.isCorrect === true || p.resultMatch === true).length;
  const losses = filteredPredictions.filter((p) => p.result?.isCorrect === false || p.resultMatch === false).length;
  const pending = filteredPredictions.filter((p) => !p.result && p.status === 'pending').length;
  const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
  const profit = filteredPredictions.reduce((sum, p) => sum + (p.result?.profit || 0), 0);
  const roi = total > 0 ? (profit / total) * 100 : 0;

  // Stats par sport
  const sportMap: Record<string, { total: number; wins: number; losses: number; pending: number; profit: number }> = {};
  filteredPredictions.forEach((p) => {
    const sport = p.sport || 'unknown';
    if (!sportMap[sport]) sportMap[sport] = { total: 0, wins: 0, losses: 0, pending: 0, profit: 0 };
    sportMap[sport].total++;
    if (p.result?.isCorrect || p.resultMatch) sportMap[sport].wins++;
    else if (p.result?.isCorrect === false || p.resultMatch === false) sportMap[sport].losses++;
    else sportMap[sport].pending++;
    sportMap[sport].profit += p.result?.profit || 0;
  });

  const bySport = Object.entries(sportMap).map(([sport, stats]) => ({
    sport,
    ...stats,
    winRate: stats.wins + stats.losses > 0 ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100) : 0,
  }));

  // Stats par confiance
  const confidenceMap: Record<string, { total: number; wins: number; losses: number; profit: number }> = {
    very_high: { total: 0, wins: 0, losses: 0, profit: 0 },
    high: { total: 0, wins: 0, losses: 0, profit: 0 },
    medium: { total: 0, wins: 0, losses: 0, profit: 0 },
    low: { total: 0, wins: 0, losses: 0, profit: 0 },
  };
  filteredPredictions.forEach((p) => {
    const conf = p.prediction?.confidence || 'medium';
    if (!confidenceMap[conf]) confidenceMap[conf] = { total: 0, wins: 0, losses: 0, profit: 0 };
    confidenceMap[conf].total++;
    if (p.result?.isCorrect) confidenceMap[conf].wins++;
    else if (p.result?.isCorrect === false) confidenceMap[conf].losses++;
    confidenceMap[conf].profit += p.result?.profit || 0;
  });

  const byConfidence = Object.entries(confidenceMap).map(([confidence, stats]) => ({
    confidence,
    ...stats,
    winRate: stats.wins + stats.losses > 0 ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100) : 0,
  }));

  // Stats par type de pari
  const byBetType = [
    {
      type: 'result',
      label: 'Résultat Match (1X2)',
      total: filteredPredictions.filter((p) => p.prediction?.bet && p.prediction.bet !== 'avoid').length,
      wins: filteredPredictions.filter((p) => p.result?.isCorrect === true).length,
      losses: filteredPredictions.filter((p) => p.result?.isCorrect === false).length,
      pending: filteredPredictions.filter((p) => !p.result && p.prediction?.bet).length,
      winRate: 0,
    },
    {
      type: 'goals',
      label: 'Buts (Over/Under)',
      total: filteredPredictions.filter((p) => p.goalsMatch !== undefined).length,
      wins: filteredPredictions.filter((p) => p.goalsMatch === true).length,
      losses: filteredPredictions.filter((p) => p.goalsMatch === false).length,
      pending: 0,
      winRate: 0,
    },
    {
      type: 'btts',
      label: 'Les deux marquent',
      total: 0,
      wins: 0,
      losses: 0,
      pending: 0,
      winRate: 0,
    },
  ].map((b) => ({
    ...b,
    winRate: b.wins + b.losses > 0 ? Math.round((b.wins / (b.wins + b.losses)) * 100) : 0,
  }));

  // Timeline
  const timelineMap: Record<string, { total: number; wins: number; losses: number }> = {};
  filteredPredictions.forEach((p) => {
    const date = new Date(p.generatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    if (!timelineMap[date]) timelineMap[date] = { total: 0, wins: 0, losses: 0 };
    timelineMap[date].total++;
    if (p.result?.isCorrect) timelineMap[date].wins++;
    else if (p.result?.isCorrect === false) timelineMap[date].losses++;
  });

  const timeline = Object.entries(timelineMap)
    .slice(-14) // Derniers 14 jours
    .map(([date, stats]) => ({
      date,
      ...stats,
      winRate: stats.wins + stats.losses > 0 ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100) : 50,
    }));

  // Streaks
  const resolvedPredictions = filteredPredictions.filter((p) => p.result);
  let currentStreak = 0;
  let bestStreak = 0;
  let worstStreak = 0;
  let tempStreak = 0;

  resolvedPredictions.forEach((p) => {
    if (p.result!.isCorrect) {
      tempStreak = tempStreak >= 0 ? tempStreak + 1 : 1;
      if (tempStreak > bestStreak) bestStreak = tempStreak;
    } else {
      tempStreak = tempStreak <= 0 ? tempStreak - 1 : -1;
      if (tempStreak < worstStreak) worstStreak = tempStreak;
    }
  });
  currentStreak = tempStreak;

  return {
    overall: { total, wins, losses, pending, winRate, roi, profit },
    bySport,
    byConfidence,
    byBetType,
    timeline,
    streaks: { current: currentStreak, best: bestStreak, worst: worstStreak },
  };
}

// Demo data
function getDemoData(): StatsData {
  return {
    overall: {
      total: 215,
      wins: 123,
      losses: 92,
      pending: 18,
      winRate: 57,
      roi: 15.2,
      profit: 127,
    },
    bySport: [
      { sport: 'football', total: 77, wins: 45, losses: 32, pending: 8, winRate: 58, profit: 52 },
      { sport: 'basketball', total: 50, wins: 28, losses: 22, pending: 6, winRate: 56, profit: 38 },
      { sport: 'nhl', total: 30, wins: 18, losses: 12, pending: 2, winRate: 60, profit: 24 },
      { sport: 'tennis', total: 28, wins: 17, losses: 11, pending: 1, winRate: 61, profit: 19 },
      { sport: 'nfl', total: 20, wins: 12, losses: 8, pending: 1, winRate: 60, profit: 12 },
    ],
    byConfidence: [
      { confidence: 'very_high', total: 40, wins: 32, losses: 8, winRate: 80, profit: 45 },
      { confidence: 'high', total: 72, wins: 48, losses: 24, winRate: 67, profit: 52 },
      { confidence: 'medium', total: 73, wins: 35, losses: 38, winRate: 48, profit: 25 },
      { confidence: 'low', total: 30, wins: 8, losses: 22, winRate: 27, profit: -15 },
    ],
    byBetType: [
      { type: 'result', label: 'Résultat Match (1X2)', total: 120, wins: 72, losses: 48, pending: 10, winRate: 60 },
      { type: 'goals', label: 'Buts (Over/Under)', total: 65, wins: 39, losses: 26, pending: 5, winRate: 60 },
      { type: 'btts', label: 'Les deux marquent', total: 30, wins: 18, losses: 12, pending: 3, winRate: 60 },
    ],
    timeline: [
      { date: '1 Mar', total: 12, wins: 7, losses: 5, winRate: 58 },
      { date: '5 Mar', total: 8, wins: 5, losses: 3, winRate: 63 },
      { date: '10 Mar', total: 15, wins: 9, losses: 6, winRate: 60 },
      { date: '15 Mar', total: 10, wins: 6, losses: 4, winRate: 60 },
      { date: '20 Mar', total: 14, wins: 8, losses: 6, winRate: 57 },
      { date: '25 Mar', total: 11, wins: 7, losses: 4, winRate: 64 },
      { date: '30 Mar', total: 9, wins: 5, losses: 4, winRate: 56 },
      { date: '2 Avr', total: 6, wins: 4, losses: 2, winRate: 67 },
    ],
    streaks: { current: 4, best: 7, worst: -3 },
  };
}

export default StatsTab;
