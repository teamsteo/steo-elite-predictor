'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Newspaper, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  AlertTriangle,
  Clock,
  RefreshCw,
  Globe,
  Bell,
  BellRing,
  Zap,
  Target,
  ChevronRight,
  Filter,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  date: string;
  currency?: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  relevance: number;
  isAlert?: boolean;
  alertLevel?: 'high' | 'medium' | 'low';
}

interface EconomicEvent {
  id: string;
  date: string;
  time?: string;
  country: string;
  currency: string;
  event: string;
  eventFr: string;
  impact: 'high' | 'medium' | 'low';
  actual?: string;
  forecast?: string;
  previous?: string;
  category: string;
  isAlert?: boolean;
}

interface NewsAlert {
  id: string;
  type: 'event' | 'news' | 'price_move';
  title: string;
  message: string;
  currency: string;
  impact: 'high' | 'medium' | 'low';
  timestamp: string;
  action?: 'BUY' | 'SELL' | 'WAIT';
  relatedEvent?: EconomicEvent;
}

interface TradingRecommendation {
  currency: string;
  direction: 'BUY' | 'SELL' | 'WAIT';
  reason: string;
  confidence: number;
}

interface NewsData {
  news: NewsItem[];
  calendar: EconomicEvent[];
  alerts: NewsAlert[];
  flags: Record<string, string>;
  summary: {
    totalNews: number;
    highImpactEvents: number;
    positiveNews: number;
    negativeNews: number;
    alertsCount: number;
  };
  recommendations: TradingRecommendation[];
}

interface EconomicNewsPanelProps {
  currency?: string;
}

export function EconomicNewsPanel({ currency }: EconomicNewsPanelProps) {
  const [data, setData] = useState<NewsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('alerts');
  const [impactFilter, setImpactFilter] = useState<string>('all');
  const [showAlertsOnly, setShowAlertsOnly] = useState(false);

  const fetchNews = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (currency) params.append('currency', currency);
      if (impactFilter !== 'all') params.append('impact', impactFilter);
      if (showAlertsOnly) params.append('alerts', 'true');
      
      const res = await fetch(`/api/news?${params.toString()}`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (error) {
      console.error('Error fetching news:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [currency, impactFilter, showAlertsOnly]);

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return <TrendingUp className="w-4 h-4 text-emerald-500" />;
      case 'negative': return <TrendingDown className="w-4 h-4 text-red-500" />;
      default: return <Minus className="w-4 h-4 text-amber-500" />;
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500';
      case 'negative': return 'bg-red-500/10 border-red-500/30 text-red-500';
      default: return 'bg-amber-500/10 border-amber-500/30 text-amber-500';
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-yellow-500';
      default: return 'bg-green-500';
    }
  };

  const getImpactLabel = (impact: string) => {
    switch (impact) {
      case 'high': return 'Élevé';
      case 'medium': return 'Moyen';
      default: return 'Faible';
    }
  };

  const getFlag = (currencyCode: string) => {
    const flags: Record<string, string> = {
      'USD': '🇺🇸', 'EUR': '🇪🇺', 'GBP': '🇬🇧', 'JPY': '🇯🇵',
      'CHF': '🇨🇭', 'CAD': '🇨🇦', 'AUD': '🇦🇺', 'NZD': '🇳🇿',
    };
    return flags[currencyCode] || '🌍';
  };

  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'BUY': return <TrendingUp className="w-4 h-4 text-emerald-500" />;
      case 'SELL': return <TrendingDown className="w-4 h-4 text-red-500" />;
      default: return <Minus className="w-4 h-4 text-amber-500" />;
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 60) return `Il y a ${diffMins} min`;
      if (diffHours < 24) return `Il y a ${diffHours}h`;
      if (diffDays < 7) return `Il y a ${diffDays}j`;
      return date.toLocaleDateString('fr-FR');
    } catch {
      return dateStr;
    }
  };

  const formatEventDate = (dateStr: string, time?: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return `Aujourd'hui ${time || ''}`;
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return `Demain ${time || ''}`;
    } else {
      return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + (time ? ` ${time}` : '');
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <BellRing className="w-5 h-5" />
            Actualités & Alertes
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={impactFilter} onValueChange={setImpactFilter}>
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="high">Élevé</SelectItem>
                <SelectItem value="medium">Moyen</SelectItem>
                <SelectItem value="low">Faible</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchNews}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        
        {data && (
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-500" />
              {data.summary.positiveNews} positifs
            </span>
            <span className="flex items-center gap-1">
              <TrendingDown className="w-3 h-3 text-red-500" />
              {data.summary.negativeNews} négatifs
            </span>
            {data.summary.alertsCount > 0 && (
              <span className="flex items-center gap-1 text-yellow-500">
                <Bell className="w-3 h-3" />
                {data.summary.alertsCount} alertes
              </span>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="alerts" className="gap-1 text-xs">
              <Bell className="w-3 h-3" />
              Alertes
              {data && data.summary.alertsCount > 0 && (
                <Badge className="ml-1 h-4 px-1 text-xs bg-red-500">
                  {data.summary.alertsCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="news" className="gap-1 text-xs">
              <Newspaper className="w-3 h-3" />
              News
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-1 text-xs">
              <Calendar className="w-3 h-3" />
              Calendrier
            </TabsTrigger>
            <TabsTrigger value="signals" className="gap-1 text-xs">
              <Target className="w-3 h-3" />
              Signaux
            </TabsTrigger>
          </TabsList>

          {/* ALERTS TAB */}
          <TabsContent value="alerts">
            <ScrollArea className="h-72">
              {isLoading && !data ? (
                <div className="flex items-center justify-center h-32">
                  <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : data?.alerts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Aucune alerte active</p>
                  <p className="text-xs mt-1">Les alertes apparaissent lors d'événements importants</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data?.alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-3 rounded-lg border ${
                        alert.impact === 'high' 
                          ? 'bg-red-500/10 border-red-500/30' 
                          : alert.impact === 'medium'
                          ? 'bg-yellow-500/10 border-yellow-500/30'
                          : 'bg-muted/30 border'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          {alert.type === 'event' ? (
                            <Zap className="w-4 h-4 text-yellow-500" />
                          ) : (
                            <Newspaper className="w-4 h-4 text-blue-500" />
                          )}
                          <span className="text-sm font-medium line-clamp-1">
                            {alert.title}
                          </span>
                        </div>
                        <span className="text-lg">{getFlag(alert.currency)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        {alert.message}
                      </p>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className={`text-xs ${getImpactColor(alert.impact)} text-white`}>
                          Impact {getImpactLabel(alert.impact)}
                        </Badge>
                        {alert.action && (
                          <Badge className={`text-xs ${
                            alert.action === 'BUY' ? 'bg-emerald-500' : 
                            alert.action === 'SELL' ? 'bg-red-500' : 'bg-amber-500'
                          }`}>
                            {alert.action === 'BUY' ? 'ACHETER' : 
                             alert.action === 'SELL' ? 'VENDRE' : 'ATTENDRE'}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* NEWS TAB */}
          <TabsContent value="news">
            <ScrollArea className="h-72">
              {data?.news.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Newspaper className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Aucune actualité disponible</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data?.news.map((item) => (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className="text-xs font-medium line-clamp-2">
                          {item.title}
                        </h4>
                        {getSentimentIcon(item.sentiment)}
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {item.currency && (
                            <Badge variant="outline" className="text-xs">
                              {getFlag(item.currency)} {item.currency}
                            </Badge>
                          )}
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${getSentimentColor(item.sentiment)}`}
                          >
                            {item.sentiment === 'positive' ? 'Positif' : 
                             item.sentiment === 'negative' ? 'Négatif' : 'Neutre'}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {item.relevance}% pertinent
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* CALENDAR TAB */}
          <TabsContent value="calendar">
            <ScrollArea className="h-72">
              {data?.calendar.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Aucun événement détecté</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data?.calendar.map((event) => (
                    <div
                      key={event.id}
                      className={`p-2 rounded-lg bg-muted/30 border ${
                        event.isAlert ? 'border-red-500/50 bg-red-500/5' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{getFlag(event.currency)}</span>
                          <span className="text-xs font-medium">{event.currency}</span>
                        </div>
                        <span className={`px-1.5 py-0.5 rounded text-xs text-white ${getImpactColor(event.impact)}`}>
                          {getImpactLabel(event.impact)}
                        </span>
                      </div>
                      <p className="text-xs font-medium mb-1">{event.eventFr}</p>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {formatEventDate(event.date, event.time)}
                        </span>
                        {event.forecast && (
                          <span className="text-muted-foreground">
                            Prévu: {event.forecast}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* SIGNALS TAB */}
          <TabsContent value="signals">
            <ScrollArea className="h-72">
              {data?.recommendations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Aucun signal disponible</p>
                  <p className="text-xs mt-1">Basé sur l'analyse des news</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data?.recommendations.map((rec, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg border ${
                        rec.direction === 'BUY' 
                          ? 'bg-emerald-500/10 border-emerald-500/30' 
                          : rec.direction === 'SELL'
                          ? 'bg-red-500/10 border-red-500/30'
                          : 'bg-amber-500/10 border-amber-500/30'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{getFlag(rec.currency)}</span>
                          <span className="font-semibold">{rec.currency}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {getDirectionIcon(rec.direction)}
                          <Badge className={`${
                            rec.direction === 'BUY' ? 'bg-emerald-500' : 
                            rec.direction === 'SELL' ? 'bg-red-500' : 'bg-amber-500'
                          }`}>
                            {rec.direction === 'BUY' ? 'ACHETER' : 
                             rec.direction === 'SELL' ? 'VENDRE' : 'ATTENDRE'}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        {rec.reason}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs">Confiance:</span>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${
                                rec.confidence >= 70 ? 'bg-emerald-500' : 
                                rec.confidence >= 50 ? 'bg-amber-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${rec.confidence}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium">{rec.confidence}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Quick Links */}
        <div className="mt-4 pt-3 border-t">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Sources:</span>
            <div className="flex gap-2">
              <a
                href="https://www.forexfactory.com/calendar"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline flex items-center gap-1"
              >
                <Globe className="w-3 h-3" />
                ForexFactory
              </a>
              <a
                href="https://www.investing.com/economic-calendar/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline flex items-center gap-1"
              >
                <Globe className="w-3 h-3" />
                Investing
              </a>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
