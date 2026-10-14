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
  Clock
} from 'lucide-react';
import { useState, useEffect } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface QuotaInfo {
  monthlyQuota: number;
  used: number;
  remaining: number;
  dailyUsed: number;
  dailyBudget: number;
}

interface RealOddsResponse {
  success: boolean;
  message: string;
  source: string;
  apiStatus?: Array<{ provider: string; enabled: boolean }>;
  quotaInfo?: QuotaInfo;
  stats?: {
    synced: number;
    active: number;
  };
  matches?: Array<{
    teams: string;
    sport: string;
    odds: string;
  }>;
  lastUpdate?: string;
}

export function ApiStatus() {
  const [status, setStatus] = useState<RealOddsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/real-odds');
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
  }, []);

  const hasApi = status?.success && status?.quotaInfo && status.quotaInfo.remaining > 10;
  const quotaPercentage = status?.quotaInfo 
    ? Math.round((status.quotaInfo.remaining / status.quotaInfo.monthlyQuota) * 100)
    : 0;
  const dailyPercentage = status?.quotaInfo 
    ? Math.round((status.quotaInfo.dailyUsed / status.quotaInfo.dailyBudget) * 100)
    : 0;

  return (
    <div className="rounded-lg bg-card border border-border/50 overflow-hidden">
      {/* En-tête principal */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          {/* Gauche: Statut global */}
          <div className="flex items-center gap-3">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Connexion...</span>
              </div>
            ) : hasApi ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-green-500/15 border border-green-500/30 cursor-help">
                      <div className="p-1.5 rounded bg-green-500">
                        <CheckCircle className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <span className="text-sm font-bold text-green-600 dark:text-green-400">
                          DONNÉES RÉELLES
                        </span>
                        <p className="text-xs text-green-600/70 dark:text-green-400/70">
                          The Odds API connectée
                        </p>
                      </div>
                      <div className="ml-2 text-right">
                        <span className="text-lg font-bold text-green-600 dark:text-green-400">
                          {status?.stats?.active || 0}
                        </span>
                        <p className="text-[10px] text-muted-foreground">matchs</p>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <div className="space-y-2 text-xs">
                      <p className="font-semibold text-green-600">✅ Source: Cotes réelles</p>
                      <p className="text-muted-foreground">
                        Les cotes proviennent directement des bookmakers via The Odds API.
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-yellow-500/15 border border-yellow-500/30 cursor-help">
                      <div className="p-1.5 rounded bg-yellow-500">
                        <AlertTriangle className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <span className="text-sm font-bold text-yellow-600 dark:text-yellow-400">
                          ESTIMATION
                        </span>
                        <p className="text-xs text-yellow-600/70 dark:text-yellow-400/70">
                          {status?.message || 'Quota limit atteint'}
                        </p>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <div className="space-y-2 text-xs">
                      <p className="font-semibold text-yellow-600">⚠️ Source: Estimation</p>
                      <p className="text-muted-foreground">
                        Les cotes sont estimées. Configurez une API pour des données réelles.
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Stats rapides */}
            {!loading && hasApi && status?.quotaInfo && (
              <div className="hidden sm:flex items-center gap-4 text-xs ml-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/50 cursor-help">
                        <Database className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{status.stats?.synced || 0} matchs</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Matchs avec cotes réelles</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
          </div>
        </div>

        {/* Toggle détails */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-3 w-full justify-center"
        >
          {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showDetails ? 'Masquer les détails' : 'Voir le quota API'}
        </button>
      </div>

      {/* Détails du quota */}
      {showDetails && status?.quotaInfo && (
        <div className="px-4 pb-4 pt-0 border-t border-border/50">
          <div className="mt-3 space-y-3">
            {/* Quota mensuel */}
            <div className="p-3 rounded-lg bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Quota mensuel</span>
                </div>
                <span className="text-sm font-bold">
                  {status.quotaInfo.remaining} / {status.quotaInfo.monthlyQuota}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className={`h-full rounded-full transition-all ${
                    quotaPercentage >= 80 ? 'bg-green-500' :
                    quotaPercentage >= 40 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${quotaPercentage}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {status.quotaInfo.used} requêtes utilisées ce mois
              </p>
            </div>

            {/* Budget journalier */}
            <div className="p-3 rounded-lg bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Budget journalier</span>
                </div>
                <span className="text-sm font-bold">
                  {status.quotaInfo.dailyBudget - status.quotaInfo.dailyUsed} / {status.quotaInfo.dailyBudget}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className={`h-full rounded-full transition-all ${
                    dailyPercentage <= 50 ? 'bg-green-500' :
                    dailyPercentage <= 80 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${100 - dailyPercentage}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {status.quotaInfo.dailyUsed} requêtes utilisées aujourd'hui
              </p>
            </div>

            {/* Dernière mise à jour */}
            {status.lastUpdate && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Dernière mise à jour:</span>
                <span>{new Date(status.lastUpdate).toLocaleString('fr-FR')}</span>
              </div>
            )}

            {/* Source des données */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Source:</span>
              <Badge 
                variant="outline" 
                className={hasApi ? 'bg-green-500/10 text-green-600' : 'bg-yellow-500/10 text-yellow-600'}
              >
                {hasApi ? 'The Odds API' : 'Cache / Estimation'}
              </Badge>
            </div>

            {/* Message d'info */}
            {status.source === 'cache' && (
              <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
                <Info className="h-3 w-3 inline mr-1" />
                Données en cache (rafraîchies toutes les 2h pour économiser le quota)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ApiStatus;
