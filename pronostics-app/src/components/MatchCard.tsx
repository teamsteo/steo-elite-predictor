'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RiskIndicator } from './RiskIndicator';
import { DataQualityBadge, DataSourceLabel } from './DataQualityBadge';
import { DataSourceIndicator, DataQualityComparison, GlobalDataQualityBanner, DataQualityLevel as NewDataQualityLevel } from './DataSourceIndicator';
import { ErrorAlertBanner, MultiErrorBanner, ErrorType } from './ErrorAlertBanner';
import { 
  Clock,
  Sparkles,
  ChevronRight,
  Star,
  Radio,
  Zap,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Info,
  CircleDot,
  AlertCircle,
  Database,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Calendar,
  Sun,
  Moon,
  Sunrise
} from 'lucide-react';
import {
  DataQualityLevel,
  DATA_QUALITY_CONFIG,
  calculateOverallQuality,
  formatQualityForDisplay,
  DataQualityMetadata,
  DataQualityError,
  ERROR_MESSAGES,
} from '@/lib/dataQuality';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useState } from 'react';

// Type pour la qualité des données
type DataQuality = 'real' | 'estimated' | 'partial' | 'none';

interface MatchCardProps {
  match: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    sport: string;
    date: string;
    oddsHome: number;
    oddsDraw: number | null;
    oddsAway: number;
    status: string;
    isLive?: boolean;
    homeScore?: number;
    awayScore?: number;
    period?: number;
    clock?: string;
    league?: string;
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
    // Qualité des données - TRANSPARENCE
    dataQuality?: {
      overall: DataQuality;
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
        form: DataQuality;
        goals: DataQuality;
        injuries: DataQuality;
        h2h: DataQuality;
      };
    };
    // Stats d'équipe (données réelles)
    teamStats?: {
      home: {
        form: string;
        avgGoalsScored: number;
        avgGoalsConceded: number;
        winRate: number;
        dataAvailable: boolean;
      };
      away: {
        form: string;
        avgGoalsScored: number;
        avgGoalsConceded: number;
        winRate: number;
        dataAvailable: boolean;
      };
    };
    goalsPrediction?: {
      total: number;
      over25: number;
      under25: number;
      over15: number;
      bothTeamsScore: number;
      prediction: string;
      basedOn: DataQuality;
    };
  };
  onAnalyze?: (matchId: string) => void;
  compact?: boolean;
}

// Configuration pour l'affichage de la qualité des données
const dataQualityConfig: Record<DataQuality, { 
  label: string; 
  icon: React.ReactNode; 
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
}> = {
  real: {
    label: 'Données réelles',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-500/15',
    borderColor: 'border-green-500/30',
    description: 'Basé sur les stats réelles des équipes',
  },
  estimated: {
    label: 'Estimation',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-500/15',
    borderColor: 'border-yellow-500/30',
    description: 'Calculé à partir des cotes des bookmakers',
  },
  partial: {
    label: 'Partiel',
    icon: <CircleDot className="h-3.5 w-3.5" />,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-500/15',
    borderColor: 'border-blue-500/30',
    description: 'Certaines données réelles, d\'autres estimées',
  },
  none: {
    label: 'Non disponible',
    icon: <HelpCircle className="h-3.5 w-3.5" />,
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-500/15',
    borderColor: 'border-gray-500/30',
    description: 'Aucune donnée disponible',
  },
};

// Configuration pour l'affichage des tags de date
const dateTagConfig: Record<string, { 
  icon: React.ReactNode; 
  color: string;
  bgColor: string;
  borderColor: string;
  pulse?: boolean;
}> = {
  'hier': {
    icon: <Moon className="h-3.5 w-3.5" />,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-500/15',
    borderColor: 'border-purple-500/30',
  },
  "aujourd'hui": {
    icon: <Sun className="h-3.5 w-3.5" />,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-500/15',
    borderColor: 'border-orange-500/30',
  },
  'demain': {
    icon: <Sunrise className="h-3.5 w-3.5" />,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-500/15',
    borderColor: 'border-blue-500/30',
  },
};

/**
 * Composant pour afficher le tag de date (hier, aujourd'hui, demain)
 */
function DateTagBadge({ 
  dateTag, 
  dateLabel, 
  displayDate,
  isLive 
}: { 
  dateTag?: 'hier' | "aujourd'hui" | 'demain';
  dateLabel?: string;
  displayDate?: string;
  isLive?: boolean;
}) {
  // Si LIVE, afficher un badge spécial
  if (isLive) {
    return (
      <Badge className="bg-red-500 text-white animate-pulse gap-1">
        <Radio className="h-3 w-3" />
        LIVE
      </Badge>
    );
  }
  
  if (!dateTag) return null;
  
  const config = dateTagConfig[dateTag] || dateTagConfig["aujourd'hui"];
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={`${config.bgColor} ${config.color} ${config.borderColor} gap-1 font-medium`}
          >
            {config.icon}
            <span>{displayDate || dateTag}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{dateLabel || dateTag}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Composant pour afficher un message d'erreur explicite - VERSION AMÉLIORÉE
 */
function ErrorMessageBanner({ 
  error, 
  compact = false 
}: { 
  error: { type: string; message: string; severity: 'critical' | 'warning' | 'info' };
  compact?: boolean;
}) {
  const severityConfig = {
    critical: {
      bg: 'bg-red-500/10 border-red-500/30',
      icon: <AlertCircle className="h-4 w-4 text-red-500" />,
      text: 'text-red-600 dark:text-red-400',
    },
    warning: {
      bg: 'bg-yellow-500/10 border-yellow-500/30',
      icon: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
      text: 'text-yellow-600 dark:text-yellow-400',
    },
    info: {
      bg: 'bg-blue-500/10 border-blue-500/30',
      icon: <Info className="h-4 w-4 text-blue-500" />,
      text: 'text-blue-600 dark:text-blue-400',
    },
  };

  const config = severityConfig[error.severity];
  
  // Messages d'erreur PLUS EXPLICITES avec cause et solution
  const errorMessages: Record<string, { 
    title: string; 
    cause: string;
    solution: string;
    impact: string;
  }> = {
    'scraping_blocked': {
      title: 'Accès aux données bloqué',
      cause: 'Le site source a détecté une requête automatisée',
      solution: 'Utilisation des cotes comme source alternative',
      impact: 'Précision réduite (estimation)',
    },
    'api_timeout': {
      title: 'Délai d\'attente dépassé',
      cause: 'Le serveur API ne répond pas dans les temps',
      solution: 'Réessayez dans quelques instants',
      impact: 'Données de secours utilisées',
    },
    'api_error': {
      title: 'Erreur de l\'API',
      cause: 'Le service API rencontre un problème technique',
      solution: 'Données de secours utilisées',
      impact: 'Prédictions basées sur les cotes',
    },
    'rate_limited': {
      title: 'Limite de requêtes atteinte',
      cause: 'Trop de requêtes envoyées au serveur',
      solution: 'Réessayez dans quelques minutes',
      impact: 'Données temporaires de secours',
    },
    'no_data': {
      title: 'Données non disponibles',
      cause: 'Aucune donnée trouvée pour ce match',
      solution: 'Prédiction basée sur les cotes',
      impact: 'Fiabilité à vérifier',
    },
    'cloudflare_blocked': {
      title: 'Protection Cloudflare active',
      cause: 'Cloudflare bloque les requêtes automatisées',
      solution: 'Source alternative utilisée',
      impact: 'Données estimées uniquement',
    },
    'ip_blocked': {
      title: 'IP bloquée',
      cause: 'Notre serveur a été bloqué par le site source',
      solution: 'Configuration d\'une API requise',
      impact: 'Estimation basée sur les cotes',
    },
    'javascript_rendering': {
      title: 'JavaScript requis',
      cause: 'Le site nécessite JavaScript pour afficher les données',
      solution: 'Source alternative utilisée',
      impact: 'Données partielles',
    },
  };

  const errorInfo = errorMessages[error.type] || { 
    title: error.message, 
    cause: 'Cause inconnue',
    solution: 'Réessayez ultérieurement',
    impact: 'Impact variable',
  };

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded ${config.bg} border cursor-help`}>
              {config.icon}
              <span className={`text-xs ${config.text}`}>{errorInfo.title}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="space-y-1.5 text-xs">
              <p className="font-semibold">{errorInfo.title}</p>
              <p className="text-muted-foreground">Cause: {errorInfo.cause}</p>
              <p className="text-green-600">✓ {errorInfo.solution}</p>
              <p className="text-yellow-600">⚠ {errorInfo.impact}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={`flex items-start gap-2.5 p-3 rounded-lg border ${config.bg}`}>
      {config.icon}
      <div className="flex-1 min-w-0 space-y-1">
        <p className={`text-sm font-semibold ${config.text}`}>{errorInfo.title}</p>
        <p className="text-xs text-muted-foreground">Cause: {errorInfo.cause}</p>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 border border-green-500/20">
            ✓ {errorInfo.solution}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600 border border-yellow-500/20">
            ⚠ {errorInfo.impact}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Composant pour afficher l'indicateur de qualité principal - VERSION AMÉLIORÉE
 * avec distinction claire entre Estimation et Données réelles
 */
function DataQualityHeader({ dataQuality }: { dataQuality?: MatchCardProps['match']['dataQuality'] }) {
  const [showDetails, setShowDetails] = useState(false);
  
  if (!dataQuality) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <div className="flex-1">
            <span className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">ESTIMATION</span>
            <p className="text-xs text-muted-foreground">Basé sur les cotes des bookmakers</p>
          </div>
        </div>
        <div className="text-xs text-muted-foreground p-2 bg-muted/30 rounded">
          <strong>Note:</strong> Aucune donnée réelle disponible. Les prédictions sont estimées.
        </div>
      </div>
    );
  }

  const config = dataQualityConfig[dataQuality.overall];
  const isEstimated = dataQuality.overall === 'estimated';
  const isReal = dataQuality.overall === 'real';
  
  return (
    <div className="space-y-3">
      {/* Badge principal avec indicateur RÉEL/ESTIMATION très visible */}
      <div className={`p-3 rounded-lg border-2 ${
        isReal 
          ? 'border-green-500/50 bg-green-500/10' 
          : isEstimated 
            ? 'border-yellow-500/50 bg-yellow-500/10'
            : 'border-border bg-muted/30'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded ${
              isReal ? 'bg-green-500' : isEstimated ? 'bg-yellow-500' : 'bg-muted'
            }`}>
              {config.icon}
            </div>
            <div>
              <span className={`text-sm font-bold ${config.color}`}>
                {isReal ? 'DONNÉES RÉELLES' : isEstimated ? 'ESTIMATION' : config.label.toUpperCase()}
              </span>
              <p className="text-xs text-muted-foreground">{config.description}</p>
            </div>
          </div>
          {dataQuality.overallScore > 0 && (
            <div className="text-right">
              <span className={`text-lg font-bold ${config.color}`}>{dataQuality.overallScore}%</span>
              <p className="text-[10px] text-muted-foreground">confiance</p>
            </div>
          )}
        </div>

        {/* Barre de progression du score */}
        <div className="mt-2">
          <div className="w-full bg-muted rounded-full h-2">
            <div 
              className={`h-full rounded-full transition-all ${
                dataQuality.overallScore >= 80 ? 'bg-green-500' :
                dataQuality.overallScore >= 50 ? 'bg-blue-500' :
                dataQuality.overallScore >= 20 ? 'bg-yellow-500' : 'bg-gray-500'
              }`}
              style={{ width: `${dataQuality.overallScore}%` }}
            />
          </div>
        </div>
      </div>

      {/* Sources de données */}
      {dataQuality.sources.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Database className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Sources:</span>
          {dataQuality.sources.slice(0, 3).map((source, idx) => (
            <DataSourceLabel key={idx} source={source} />
          ))}
          {dataQuality.sources.length > 3 && (
            <span className="text-xs text-muted-foreground">
              +{dataQuality.sources.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Toggle détails */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full justify-center py-1"
      >
        {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {showDetails ? 'Masquer les détails' : 'Voir les détails par catégorie'}
      </button>

      {/* Détails par catégorie */}
      {showDetails && (
        <div className="grid grid-cols-4 gap-1.5 p-2 rounded-lg bg-muted/20">
          {Object.entries(dataQuality.details).map(([key, quality]) => {
            const labels: Record<string, string> = {
              form: 'Forme',
              goals: 'Buts',
              injuries: 'Blessures',
              h2h: 'H2H',
            };
            const qConfig = dataQualityConfig[quality];
            return (
              <TooltipProvider key={key}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={`flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded text-[10px] ${qConfig.bgColor} ${qConfig.color} border ${qConfig.borderColor} cursor-help`}>
                      {quality === 'real' ? <CheckCircle2 className="h-3 w-3" /> :
                       quality === 'estimated' ? <AlertTriangle className="h-3 w-3" /> :
                       quality === 'partial' ? <CircleDot className="h-3 w-3" /> :
                       <HelpCircle className="h-3 w-3" />}
                      <span className="font-medium">{labels[key]}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs space-y-1">
                      <p className="font-semibold">{labels[key]}: {qConfig.label}</p>
                      <p className="text-muted-foreground">{qConfig.description}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      )}

      {/* Erreurs explicites */}
      {dataQuality.errors && dataQuality.errors.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>{dataQuality.errors.length} problème{dataQuality.errors.length > 1 ? 's' : ''} détecté{dataQuality.errors.length > 1 ? 's' : ''}</span>
          </div>
          {dataQuality.errors.slice(0, 3).map((error, idx) => (
            <ErrorMessageBanner key={idx} error={error} compact />
          ))}
          {dataQuality.errors.length > 3 && (
            <span className="text-xs text-muted-foreground pl-2">
              +{dataQuality.errors.length - 3} autre(s) avertissement(s)
            </span>
          )}
        </div>
      )}

      {/* Message explicatif si estimation */}
      {isEstimated && (
        <div className="p-2 rounded bg-yellow-500/10 border border-yellow-500/20 text-xs">
          <strong>💡 Pourquoi des estimations?</strong>
          <p className="text-muted-foreground mt-1">
            Les sources de données réelles sont temporairement indisponibles. 
            Les cotes des bookmakers sont utilisées pour calculer les probabilités.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * MatchCard - Carte de match avec prédictions et indicateurs de qualité
 */
export function MatchCard({ match, onAnalyze, compact = false }: MatchCardProps) {
  const isLive = match.isLive || match.status === 'live';
  const config = match.dataQuality ? dataQualityConfig[match.dataQuality.overall] : null;

  return (
    <Card className={`transition-all hover:shadow-lg ${compact ? 'p-2' : ''}`}>
      <CardHeader className={`pb-2 ${compact ? 'p-3' : ''}`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {match.league && (
              <Badge variant="outline" className="text-xs">
                {match.league}
              </Badge>
            )}
            {/* Tag de date (hier, aujourd'hui, demain) ou LIVE */}
            <DateTagBadge 
              dateTag={match.dateTag}
              dateLabel={match.dateLabel}
              displayDate={match.displayDate}
              isLive={isLive}
            />
          </div>
          
          {/* Indicateur de qualité principal */}
          {match.dataQuality && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge 
                    variant="outline" 
                    className={`${config?.bgColor} ${config?.color} ${config?.borderColor}`}
                  >
                    {config?.icon}
                    <span className="ml-1 text-xs">{config?.label}</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{config?.description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Équipes et score */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex-1">
            <p className="font-semibold">{match.homeTeam}</p>
            {match.teamStats?.home?.dataAvailable && (
              <p className="text-xs text-muted-foreground">
                Form: {match.teamStats.home.form}
              </p>
            )}
          </div>
          
          {isLive && match.homeScore !== undefined && match.awayScore !== undefined && (
            <div className="px-4 py-2 bg-muted rounded-lg">
              <span className="text-2xl font-bold">
                {match.homeScore} - {match.awayScore}
              </span>
              {match.clock && (
                <p className="text-xs text-center text-muted-foreground">
                  <Clock className="h-3 w-3 inline mr-1" />
                  {match.clock}
                </p>
              )}
            </div>
          )}
          
          <div className="flex-1 text-right">
            <p className="font-semibold">{match.awayTeam}</p>
            {match.teamStats?.away?.dataAvailable && (
              <p className="text-xs text-muted-foreground">
                Form: {match.teamStats.away.form}
              </p>
            )}
          </div>
        </div>

        {/* Cotes */}
        <div className="flex items-center justify-center gap-4 mt-2">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">1</p>
            <p className="font-bold">{match.oddsHome.toFixed(2)}</p>
          </div>
          {match.oddsDraw && (
            <div className="text-center">
              <p className="text-xs text-muted-foreground">X</p>
              <p className="font-bold">{match.oddsDraw.toFixed(2)}</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-xs text-muted-foreground">2</p>
            <p className="font-bold">{match.oddsAway.toFixed(2)}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className={compact ? 'p-3 pt-0' : ''}>
        {/* Section Qualité des données */}
        {!compact && (
          <div className="mb-4 p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Source des données</span>
            </div>
            <DataQualityHeader dataQuality={match.dataQuality} />
          </div>
        )}

        {/* Prédiction de buts */}
        {match.goalsPrediction && (
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Prédiction buts</span>
              <DataQualityBadge 
                quality={match.goalsPrediction.basedOn} 
                size="sm" 
                showLabel={false}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="p-2 rounded bg-muted/50">
                <span className="text-muted-foreground">Total attendu:</span>
                <span className="font-bold ml-1">{match.goalsPrediction.total.toFixed(1)}</span>
              </div>
              <div className="p-2 rounded bg-muted/50">
                <span className="text-muted-foreground">+2.5 buts:</span>
                <span className="font-bold ml-1">{match.goalsPrediction.over25}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Insight */}
        {match.insight && (
          <div className="mt-3">
            <RiskIndicator 
              percentage={match.insight.riskPercentage}
              showLabel={true}
            />
            {match.insight.valueBetDetected && (
              <div className="mt-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                    Value Bet détecté: {match.insight.valueBetType}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Avertissements */}
        {match.dataQuality?.warnings && match.dataQuality.warnings.length > 0 && (
          <div className="mt-3 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                {match.dataQuality.warnings.map((warning, idx) => (
                  <p key={idx} className="text-yellow-600 dark:text-yellow-400">{warning}</p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Bouton d'analyse */}
        {onAnalyze && (
          <Button 
            onClick={() => onAnalyze(match.id)}
            className="w-full mt-4"
            variant="outline"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Analyser ce match
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default MatchCard;
// Build v1775784627
