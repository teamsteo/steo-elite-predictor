'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Bell, 
  BellRing, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  AlertTriangle,
  Clock,
  RefreshCw,
  Plus,
  Trash2,
  Check,
  X,
  Zap,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Newspaper,
  Activity
} from 'lucide-react';
import { toast } from 'sonner';

// Types
interface Alert {
  id: string;
  type: 'news' | 'event' | 'price' | 'correlation';
  currency: string;
  condition: string;
  threshold?: number;
  active: boolean;
  triggered: boolean;
  createdAt: string;
  lastTriggered?: string;
}

interface TriggeredAlert {
  alert: Alert;
  data: {
    title?: string;
    summary?: string;
    url?: string;
    source?: string;
  };
  triggeredAt: string;
}

interface CorrelationData {
  currency: string;
  priceAnalysis: {
    current: number;
    change24h: string;
    change4h: string;
    change1h: string;
    trend: string;
  };
  newsCorrelation: {
    overallSentiment: string;
    bullishSignals: number;
    bearishSignals: number;
    neutralSignals: number;
  };
  correlations: Array<{
    event: string;
    priceImpact: {
      direction: string;
      changePercent: number;
    };
    significance: string;
    recommendation: string;
  }>;
  tradingRecommendation: {
    direction: string;
    confidence: number;
    reasoning: string;
  };
  upcomingEvents: Array<{
    event: string;
    time: string;
    impact: string;
  }>;
}

interface AlertsManagerProps {
  currency?: string;
}

export function AlertsManager({ currency: defaultCurrency }: AlertsManagerProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [triggeredAlerts, setTriggeredAlerts] = useState<TriggeredAlert[]>([]);
  const [correlationData, setCorrelationData] = useState<CorrelationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('alerts');
  
  // New alert form
  const [newAlert, setNewAlert] = useState({
    type: 'news',
    currency: defaultCurrency || 'EUR',
    condition: '',
    threshold: 0
  });
  const [showNewAlertForm, setShowNewAlertForm] = useState(false);

  // Fetch alerts
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts');
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
      }
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  }, []);

  // Fetch triggered alerts
  const fetchTriggeredAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts?action=triggered');
      if (res.ok) {
        const data = await res.json();
        setTriggeredAlerts(data.triggeredAlerts || []);
        
        // Show notification for new triggered alerts
        if (data.triggeredAlerts?.length > 0) {
          const latest = data.triggeredAlerts[data.triggeredAlerts.length - 1];
          toast.success('🚨 Alerte déclenchée!', {
            description: latest.alert.condition,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching triggered alerts:', error);
    }
  }, []);

  // Fetch correlation data
  const fetchCorrelation = useCallback(async (curr: string) => {
    try {
      const symbol = curr === 'EUR' ? 'EURUSD=X' : 
                     curr === 'GBP' ? 'GBPUSD=X' :
                     curr === 'JPY' ? 'USDJPY=X' :
                     curr === 'USD' ? 'DXY' : `${curr}USD=X`;
      
      const res = await fetch(`/api/correlation?currency=${curr}&symbol=${symbol}`);
      if (res.ok) {
        const data = await res.json();
        setCorrelationData(data);
      }
    } catch (error) {
      console.error('Error fetching correlation:', error);
    }
  }, []);

  // Check alerts
  const checkAlerts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/alerts?action=check');
      if (res.ok) {
        const data = await res.json();
        if (data.triggered?.length > 0) {
          toast.success(`${data.triggered.length} alertes déclenchées!`);
        }
        fetchTriggeredAlerts();
      }
    } catch (error) {
      console.error('Error checking alerts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Create alert
  const createAlert = async () => {
    if (!newAlert.condition) {
      toast.error('Veuillez entrer une condition');
      return;
    }

    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAlert)
      });
      
      if (res.ok) {
        toast.success('Alerte créée avec succès');
        setNewAlert({ type: 'news', currency: defaultCurrency || 'EUR', condition: '', threshold: 0 });
        setShowNewAlertForm(false);
        fetchAlerts();
      }
    } catch (error) {
      toast.error('Erreur lors de la création');
    }
  };

  // Delete alert
  const deleteAlert = async (id: string) => {
    try {
      const res = await fetch(`/api/alerts?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Alerte supprimée');
        fetchAlerts();
      }
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  // Toggle alert active state
  const toggleAlert = async (id: string, active: boolean) => {
    try {
      const res = await fetch(`/api/alerts?id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !active })
      });
      if (res.ok) {
        fetchAlerts();
      }
    } catch (error) {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  useEffect(() => {
    fetchAlerts();
    fetchTriggeredAlerts();
    if (defaultCurrency) {
      fetchCorrelation(defaultCurrency);
    }
  }, [defaultCurrency, fetchAlerts, fetchTriggeredAlerts, fetchCorrelation]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      checkAlerts();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish': return <TrendingUp className="w-4 h-4 text-emerald-500" />;
      case 'bearish': return <TrendingDown className="w-4 h-4 text-red-500" />;
      default: return <Minus className="w-4 h-4 text-amber-500" />;
    }
  };

  const getFlag = (currencyCode: string) => {
    const flags: Record<string, string> = {
      'USD': '🇺🇸', 'EUR': '🇪🇺', 'GBP': '🇬🇧', 'JPY': '🇯🇵',
      'CHF': '🇨🇭', 'CAD': '🇨🇦', 'AUD': '🇦🇺', 'NZD': '🇳🇿',
    };
    return flags[currencyCode] || '🌍';
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <BellRing className="w-5 h-5 text-purple-500" />
            Alertes & Corrélations
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={checkAlerts}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNewAlertForm(!showNewAlertForm)}
              className="gap-1"
            >
              <Plus className="w-4 h-4" />
              Nouvelle
            </Button>
          </div>
        </div>
        
        {/* Stats */}
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Bell className="w-3 h-3" />
            {alerts.filter(a => a.active).length} actives
          </span>
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-yellow-500" />
            {triggeredAlerts.length} déclenchées
          </span>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* New Alert Form */}
        {showNewAlertForm && (
          <Card className="mb-4 border-purple-500/30 bg-purple-500/5">
            <CardContent className="pt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Select 
                  value={newAlert.type} 
                  onValueChange={(v) => setNewAlert({...newAlert, type: v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="news">📰 News</SelectItem>
                    <SelectItem value="event">📅 Événement</SelectItem>
                    <SelectItem value="price">💰 Prix</SelectItem>
                    <SelectItem value="correlation">📊 Corrélation</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select 
                  value={newAlert.currency} 
                  onValueChange={(v) => setNewAlert({...newAlert, currency: v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Devise" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">🇪🇺 EUR</SelectItem>
                    <SelectItem value="USD">🇺🇸 USD</SelectItem>
                    <SelectItem value="GBP">🇬🇧 GBP</SelectItem>
                    <SelectItem value="JPY">🇯🇵 JPY</SelectItem>
                    <SelectItem value="CHF">🇨🇭 CHF</SelectItem>
                    <SelectItem value="AUD">🇦🇺 AUD</SelectItem>
                    <SelectItem value="CAD">🇨🇦 CAD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Input
                placeholder="Condition (ex: 'rate decision', 'NFP', 'inflation high')"
                value={newAlert.condition}
                onChange={(e) => setNewAlert({...newAlert, condition: e.target.value})}
              />
              
              <div className="flex gap-2">
                <Button onClick={createAlert} className="flex-1 gap-1">
                  <Check className="w-4 h-4" />
                  Créer
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowNewAlertForm(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="alerts" className="gap-1 text-xs">
              <Bell className="w-3 h-3" />
              Alertes
            </TabsTrigger>
            <TabsTrigger value="correlation" className="gap-1 text-xs">
              <Activity className="w-3 h-3" />
              Corrélation
            </TabsTrigger>
            <TabsTrigger value="triggered" className="gap-1 text-xs">
              <AlertTriangle className="w-3 h-3" />
              Déclenchées
            </TabsTrigger>
          </TabsList>

          {/* Alerts Tab */}
          <TabsContent value="alerts">
            <ScrollArea className="h-64">
              {alerts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Aucune alerte configurée</p>
                  <p className="text-xs mt-1">Créez une alerte pour être notifié</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-3 rounded-lg border transition-all ${
                        alert.triggered 
                          ? 'bg-yellow-500/10 border-yellow-500/30' 
                          : alert.active 
                            ? 'bg-muted/30' 
                            : 'bg-muted/10 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{getFlag(alert.currency)}</span>
                          <span className="font-medium text-sm">{alert.condition}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-xs">
                            {alert.type}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => toggleAlert(alert.id, alert.active)}
                          >
                            {alert.active ? (
                              <Bell className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Bell className="w-3 h-3 text-muted-foreground" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-red-500 hover:text-red-600"
                            onClick={() => deleteAlert(alert.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {new Date(alert.createdAt).toLocaleDateString('fr-FR')}
                        {alert.lastTriggered && (
                          <span className="text-yellow-500">
                            • Déclenchée: {new Date(alert.lastTriggered).toLocaleTimeString('fr-FR')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Correlation Tab */}
          <TabsContent value="correlation">
            <ScrollArea className="h-64">
              {correlationData ? (
                <div className="space-y-3">
                  {/* Price Analysis */}
                  <div className="p-3 rounded-lg bg-muted/30 border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        Analyse de Prix
                      </span>
                      <Badge variant={correlationData.priceAnalysis.change24h > '0' ? 'default' : 'destructive'}>
                        {correlationData.priceAnalysis.change24h}%
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div>
                        <p className="text-muted-foreground">1H</p>
                        <p className={`font-semibold ${parseFloat(correlationData.priceAnalysis.change1h) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {correlationData.priceAnalysis.change1h}%
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">4H</p>
                        <p className={`font-semibold ${parseFloat(correlationData.priceAnalysis.change4h) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {correlationData.priceAnalysis.change4h}%
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">24H</p>
                        <p className={`font-semibold ${parseFloat(correlationData.priceAnalysis.change24h) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {correlationData.priceAnalysis.change24h}%
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* News Correlation */}
                  <div className="p-3 rounded-lg bg-muted/30 border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium flex items-center gap-2">
                        <Newspaper className="w-4 h-4" />
                        Corrélation News
                      </span>
                      {getSentimentIcon(correlationData.newsCorrelation.overallSentiment)}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div>
                        <p className="text-muted-foreground">Haussier</p>
                        <p className="font-semibold text-emerald-500">
                          {correlationData.newsCorrelation.bullishSignals}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Neutre</p>
                        <p className="font-semibold text-amber-500">
                          {correlationData.newsCorrelation.neutralSignals}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Baissier</p>
                        <p className="font-semibold text-red-500">
                          {correlationData.newsCorrelation.bearishSignals}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Trading Recommendation */}
                  <div className={`p-3 rounded-lg border ${
                    correlationData.tradingRecommendation.direction === 'BUY' 
                      ? 'bg-emerald-500/10 border-emerald-500/30' 
                      : correlationData.tradingRecommendation.direction === 'SELL'
                        ? 'bg-red-500/10 border-red-500/30'
                        : 'bg-amber-500/10 border-amber-500/30'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        Recommandation
                      </span>
                      <Badge variant={
                        correlationData.tradingRecommendation.direction === 'BUY' ? 'default' :
                        correlationData.tradingRecommendation.direction === 'SELL' ? 'destructive' : 'secondary'
                      }>
                        {correlationData.tradingRecommendation.direction === 'BUY' ? '🟢 ACHAT' :
                         correlationData.tradingRecommendation.direction === 'SELL' ? '🔴 VENTE' : '⚪ ATTENDRE'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Confiance</span>
                      <span className="font-semibold">{correlationData.tradingRecommendation.confidence}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {correlationData.tradingRecommendation.reasoning}
                    </p>
                  </div>

                  {/* Upcoming Events */}
                  {correlationData.upcomingEvents.length > 0 && (
                    <div className="p-3 rounded-lg bg-muted/30 border">
                      <span className="text-sm font-medium flex items-center gap-2 mb-2">
                        <Zap className="w-4 h-4 text-yellow-500" />
                        Événements à venir
                      </span>
                      <div className="space-y-1">
                        {correlationData.upcomingEvents.slice(0, 3).map((event, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="truncate flex-1">{event.event}</span>
                            <Badge variant={event.impact === 'high' ? 'destructive' : 'secondary'} className="text-[10px] ml-2">
                              {event.impact}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Analyse de corrélation en cours...</p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Triggered Tab */}
          <TabsContent value="triggered">
            <ScrollArea className="h-64">
              {triggeredAlerts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Check className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Aucune alerte déclenchée</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {triggeredAlerts.map((triggered, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-yellow-500" />
                          <span className="font-medium text-sm">{triggered.alert.condition}</span>
                        </div>
                        <span className="text-lg">{getFlag(triggered.alert.currency)}</span>
                      </div>
                      {triggered.data?.title && (
                        <p className="text-xs mb-2">{triggered.data.title}</p>
                      )}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{new Date(triggered.triggeredAt).toLocaleString('fr-FR')}</span>
                        {triggered.data?.url && (
                          <a 
                            href={triggered.data.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline flex items-center gap-1"
                          >
                            Voir <ArrowUpRight className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
