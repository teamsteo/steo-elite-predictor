'use client';

import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, 
  AlertCircle,
  Database,
  Loader2,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Clock,
  Zap,
  RefreshCw
} from 'lucide-react';
import { useState, useEffect } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SourceStatus {
  name: string;
  status: string;
  type: string;
  cost?: string;
  quota?: string;
  matchesCount?: number;
  reliability?: number;
  description?: string;
}

interface ESPNOddsResponse {
  success: boolean;
  message: string;
  source: string;
  status: string;
  statusMessage: string;
  sources: {
    primary: SourceStatus;
    fallback: SourceStatus;
    lastResort: SourceStatus;
  };
  stats?: {
    total: number;
    bySource: {
      espnDraftKings: number;
      theOddsApi: number;
      estimated: number;
    };
    realOddsPercentage: number;
    live: number;
    avgReliability: number;
  };
  lastUpdate?: string;
  fallbackUsed?: boolean;
  issues?: string[];
  warnings?: string[];
}

export function ApiStatus() {
  const [status, setStatus] = useState<ESPNOddsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/espn-status');
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Error fetching API status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const hasData = status?.success && status?.stats && status.stats.total > 0;
  const realOddsPercentage = status?.stats?.realOddsPercentage || 0;
  const espnCount = status?.stats?.bySource?.espnDraftKings || 0;
  const oddsApiCount = status?.stats?.bySource?.theOddsApi || 0;
  const estimatedCount = status?.stats?.bySource?.estimated || 0;

  return (
    <div className="rounded-lg bg-card border border-border/50 overflow-hidden">
      {/* En-tête principal */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Connexion...</span>
              </div>
            ) : hasData ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={`flex items-center gap-3 px-4 py-2 rounded-lg cursor-help ${
                      espnCount > 0 
                        ? 'bg-green-500/15 border border-green-500/30'
                        : oddsApiCount > 0 
                          ? 'bg-yellow-500/15 border border-yellow-500/30'
                          : 'bg-orange-500/15 border border-orange-500/30'
                    }`}>
                      <div className={`p-1.5 rounded ${
                        espnCount > 0 
                          ? 'bg-green-500' 
                          : oddsApiCount > 0 
                            ? 'bg-yellow-500' 
                            : 'bg-orange-500'
                      }`}>
                        <CheckCircle className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <span className={`text-sm font-bold ${
                          espnCount > 0 
                            ? 'text-green-600 dark:text-green-400'
                            : oddsApiCount > 0 
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-orange-600 dark:text-orange-400'
                        }`}>
                          {espnCount > 0 ? 'ESPN (DRAFTKINGS)' : oddsApiCount > 0 ? 'ODDS API' : 'ESTIMATIONS'}
                        </span>
                        <p className={`text-xs ${
                          espnCount > 0 
                            ? 'text-green-600/70 dark:text-green-400/70'
                            : oddsApiCount > 0 
                              ? 'text-yellow-600/70 dark:text-yellow-400/70'
                              : 'text-orange-600/70 dark:text-orange-400/70'
                        }`}>
                          {espnCount > 0 ? 'Gratuit & Illimité' : oddsApiCount > 0 ? 'Fallback actif' : 'Mode dégradé'}
                        </p>
                      </div>
                      <div className="ml-2 text-right">
                        <span className={`text-lg font-bold ${
                          espnCount > 0 
                            ? 'text-green-600 dark:text-green-400'
                            : oddsApiCount > 0 
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-orange-600 dark:text-orange-400'
                        }`}>
                          {status?.stats?.total || 0}
                        </span>
                        <p className="text-[10px] text-muted-foreground">matchs</p>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <div className="space-y-2 text-xs">
                      <p className="font-semibold">📊 Cascade de sources:</p>
                      <div className="space-y-1">
                        <p>🟢 ESPN (DraftKings): {espnCount} matchs</p>
                        <p>🟡 The Odds API: {oddsApiCount} matchs</p>
                        <p>🟠 Estimations: {estimatedCount} matchs</p>
                      </div>
                      <p className="text-muted-foreground pt-1 border-t border-border">
                        Fiabilité moyenne: {status?.stats?.avgReliability}%
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-red-500/15 border border-red-500/30">
                <div className="p-1.5 rounded bg-red-500">
                  <AlertCircle className="h-4 w-4 text-white" />
                </div>
                <div>
                  <span className="text-sm font-bold text-red-600 dark:text-red-400">
                    INDISPONIBLE
                  </span>
                  <p className="text-xs text-red-600/70 dark:text-red-400/70">
                    {status?.message || 'Erreur de connexion'}
                  </p>
                </div>
              </div>
            )}

            {/* Stats rapides */}
            {!loading && hasData && status?.stats && (
              <div className="hidden sm:flex items-center gap-4 text-xs ml-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-help ${
                        espnCount > 0 ? 'bg-green-500/10' : oddsApiCount > 0 ? 'bg-yellow-500/10' : 'bg-orange-500/10'
                      }`}>
                        <Zap className={`h-3.5 w-3.5 ${
                          espnCount > 0 ? 'text-green-500' : oddsApiCount > 0 ? 'text-yellow-500' : 'text-orange-500'
                        }`} />
                        <span>{realOddsPercentage}% réelles</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">
                        {espnCount} ESPN + {oddsApiCount} Odds API = {espnCount + oddsApiCount} cotes réelles
                        {estimatedCount > 0 && ` (${estimatedCount} estimées)`}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                {status.stats.live > 0 && (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/10 border border-red-500/20">
                    <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-red-600">{status.stats.live} live</span>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Refresh button */}
          <button 
            onClick={() => { setLoading(true); fetchStatus(); }}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            title="Rafraîchir"
          >
            <RefreshCw className={`h-4 w-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Toggle détails */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-3 w-full justify-center"
        >
          {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showDetails ? 'Masquer les détails' : 'Voir la cascade de sources'}
        </button>
      </div>

      {/* Détails du statut */}
      {showDetails && status?.sources && (
        <div className="px-4 pb-4 pt-0 border-t border-border/50">
          <div className="mt-3 space-y-3">
            {/* Cascade de sources */}
            <div className="p-3 rounded-lg bg-muted/30">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Cascade de sources</span>
              </div>
              
              <div className="space-y-2">
                {/* ESPN */}
                <div className={`flex items-center justify-between p-2 rounded ${
                  status.sources.primary.status === 'online' ? 'bg-green-500/10' : 'bg-red-500/10'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold">1. ESPN (DraftKings)</span>
                    <Badge variant="outline" className="text-[10px] bg-green-500/20 text-green-600 border-green-500/30">
                      GRATUIT ILLIMITÉ
                    </Badge>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold">{espnCount}</span>
                    <span className="text-[10px] text-muted-foreground ml-1">matchs</span>
                  </div>
                </div>
                
                {/* Odds API */}
                <div className={`flex items-center justify-between p-2 rounded ${
                  status.sources.fallback.status === 'online' ? 'bg-green-500/10' : 
                  status.sources.fallback.status === 'standby' ? 'bg-blue-500/10' : 'bg-red-500/10'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold">2. The Odds API</span>
                    <Badge variant="outline" className="text-[10px] bg-yellow-500/20 text-yellow-600 border-yellow-500/30">
                      FALLBACK
                    </Badge>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold">{oddsApiCount}</span>
                    <span className="text-[10px] text-muted-foreground ml-1">matchs</span>
                  </div>
                </div>
                
                {/* Estimations */}
                <div className="flex items-center justify-between p-2 rounded bg-orange-500/10">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold">3. Estimations</span>
                    <Badge variant="outline" className="text-[10px] bg-orange-500/20 text-orange-600 border-orange-500/30">
                      DERNIER RECURS
                    </Badge>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold">{estimatedCount}</span>
                    <span className="text-[10px] text-muted-foreground ml-1">matchs</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Fiabilité moyenne */}
            {status.stats?.avgReliability && (
              <div className="p-3 rounded-lg bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Fiabilité moyenne</span>
                  </div>
                  <span className="text-sm font-bold">{status.stats.avgReliability}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className={`h-full rounded-full transition-all ${
                      status.stats.avgReliability >= 80 ? 'bg-green-500' :
                      status.stats.avgReliability >= 60 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${status.stats.avgReliability}%` }}
                  />
                </div>
              </div>
            )}

            {/* Dernière mise à jour */}
            {status.lastUpdate && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Dernière mise à jour:</span>
                <span>{new Date(status.lastUpdate).toLocaleString('fr-FR')}</span>
              </div>
            )}

            {/* Alerte si fallback utilisé */}
            {status.fallbackUsed && (
              <div className="p-2 rounded bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-600 dark:text-yellow-400">
                <AlertTriangle className="h-3 w-3 inline mr-1" />
                Mode fallback actif - ESPN indisponible, The Odds API utilisé
              </div>
            )}
            
            {/* Alerte si uniquement estimations */}
            {estimatedCount > 0 && espnCount === 0 && oddsApiCount === 0 && (
              <div className="p-2 rounded bg-orange-500/10 border border-orange-500/20 text-xs text-orange-600 dark:text-orange-400">
                <AlertTriangle className="h-3 w-3 inline mr-1" />
                Attention: Uniquement des estimations - APIs indisponibles
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ApiStatus;
