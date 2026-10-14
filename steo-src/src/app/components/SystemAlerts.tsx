'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, X, Wifi, WifiOff, RefreshCw, Database, Server, Calendar, Bell } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface SystemAlert {
  id: string;
  type: 'error' | 'warning' | 'info';
  source: string;
  message: string;
  timestamp: string;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  timestamp: string;
  apis: Array<{
    name: string;
    healthy: boolean;
    responseTime: number;
    error?: string;
  }>;
  store: {
    healthy: boolean;
    predictionCount: number;
    lastUpdate: string;
    error?: string;
  };
  alerts: SystemAlert[];
  summary: {
    totalAPIs: number;
    healthyAPIs: number;
    unhealthyAPIs: number;
    alertCount: number;
  };
}

// MLB Season Alert Component
export function MLBSeasonAlert() {
  const [dismissed, setDismissed] = useState(false);
  const [daysUntil, setDaysUntil] = useState(0);

  useEffect(() => {
    // MLB Opening Day 2026: March 27, 2026
    const openingDay = new Date('2026-03-27T00:00:00Z');
    const now = new Date();
    const diffTime = openingDay.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    setDaysUntil(diffDays);

    // Check if already dismissed this session
    const dismissedMLB = sessionStorage.getItem('mlb-alert-dismissed');
    if (dismissedMLB === 'true') {
      setDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('mlb-alert-dismissed', 'true');
  };

  // Ne pas afficher si dismissé ou si la saison a commencé
  if (dismissed || daysUntil <= 0) {
    return null;
  }

  return (
    <Card className="mb-4 border-2 bg-gradient-to-r from-red-500/10 to-orange-500/10 border-red-500/50 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚾</span>
            <Bell className="h-5 w-5 text-red-500 animate-pulse" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-red-400">
                🎰 MLB Opening Day dans {daysUntil} jour{daysUntil > 1 ? 's' : ''} !
              </h3>
              <Badge variant="outline" className="text-xs border-red-500 text-red-400">
                Saisonn Régulière
              </Badge>
            </div>
            
            <p className="text-sm text-muted-foreground mb-2">
              Le modèle Sabermetrics MLB sera pleinement opérationnel dès le <strong>27 mars 2026</strong>.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div className="flex items-center gap-2 px-2 py-1 bg-red-500/10 rounded">
                <span>🎯</span>
                <span>Moneyline + Run Line</span>
              </div>
              <div className="flex items-center gap-2 px-2 py-1 bg-orange-500/10 rounded">
                <span>📊</span>
                <span>Over/Under Runs</span>
              </div>
              <div className="flex items-center gap-2 px-2 py-1 bg-green-500/10 rounded">
                <span>💰</span>
                <span>Value Bets MLB</span>
              </div>
            </div>

            <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>2430 matchs prévus • 30 équipes • Stats ESPN gratuites</span>
            </div>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="h-8 w-8 p-0 shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

export function SystemAlerts() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const checkHealth = async () => {
    try {
      const response = await fetch('/api/system/health');
      const data = await response.json();
      setHealth(data);
      setLastCheck(new Date());
    } catch (error) {
      console.error('Health check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
    // Vérifier toutes les 5 minutes
    const interval = setInterval(checkHealth, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Ne pas afficher si pas de problèmes ou si dismissé
  if (!health || dismissed || (health.status === 'healthy' && health.alerts.length === 0)) {
    return null;
  }

  const getStatusColor = () => {
    switch (health.status) {
      case 'down': return 'bg-red-500/10 border-red-500/50';
      case 'degraded': return 'bg-amber-500/10 border-amber-500/50';
      default: return 'bg-green-500/10 border-green-500/50';
    }
  };

  const getStatusIcon = () => {
    switch (health.status) {
      case 'down': return <WifiOff className="h-5 w-5 text-red-500" />;
      case 'degraded': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      default: return <Wifi className="h-5 w-5 text-green-500" />;
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Card className={`mb-4 border-2 ${getStatusColor()} p-4`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {getStatusIcon()}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-foreground">
                {health.status === 'down' ? 'Service indisponible' : 
                 health.status === 'degraded' ? 'Service dégradé' : 
                 'Système opérationnel'}
              </h3>
              <Badge variant={health.status === 'healthy' ? 'default' : 'destructive'} className="text-xs">
                {health.summary.healthyAPIs}/{health.summary.totalAPIs} APIs OK
              </Badge>
            </div>
            
            {/* Liste des APIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
              {health.apis.map((api) => (
                <div 
                  key={api.name}
                  className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${
                    api.healthy ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-500'
                  }`}
                >
                  <Server className="h-3 w-3" />
                  <span>{api.name}</span>
                  {api.healthy && <span className="opacity-50">({api.responseTime}ms)</span>}
                  {!api.healthy && <span className="opacity-70">✗</span>}
                </div>
              ))}
            </div>

            {/* Store Status */}
            <div className={`flex items-center gap-2 text-xs px-2 py-1 rounded mb-3 ${
              health.store.healthy ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-500'
            }`}>
              <Database className="h-3 w-3" />
              <span>Store: {health.store.predictionCount} prédictions</span>
              <span className="opacity-50">| MAJ: {health.store.lastUpdate !== 'N/A' ? formatTime(health.store.lastUpdate) : 'N/A'}</span>
            </div>

            {/* Alertes détaillées */}
            {health.alerts.length > 0 && (
              <div className="space-y-1">
                {health.alerts.slice(0, 3).map((alert) => (
                  <div key={alert.id} className="text-xs text-muted-foreground flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    <span className="font-medium">{alert.source}:</span>
                    <span>{alert.message}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Temps de dernière vérification */}
            {lastCheck && (
              <div className="text-xs text-muted-foreground mt-2">
                Dernière vérification: {lastCheck.toLocaleTimeString('fr-FR')}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={checkHealth}
            disabled={loading}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(true)}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

// Composant compact pour le header
export function SystemStatusBadge() {
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    fetch('/api/system/health')
      .then(res => res.json())
      .then(data => setHealth(data))
      .catch(() => {});
  }, []);

  if (!health || health.status === 'healthy') {
    return null;
  }

  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
      health.status === 'down' 
        ? 'bg-red-500/20 text-red-500' 
        : 'bg-amber-500/20 text-amber-500'
    }`}>
      <AlertTriangle className="h-3 w-3" />
      <span>{health.summary.unhealthyAPIs} problème{health.summary.unhealthyAPIs > 1 ? 's' : ''}</span>
    </div>
  );
}

export default SystemAlerts;
