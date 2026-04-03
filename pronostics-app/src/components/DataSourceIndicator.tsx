'use client';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  CheckCircle2,
  AlertTriangle,
  CircleDot,
  HelpCircle,
  Info,
  Database,
  TrendingUp,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Types de qualité des données
export type DataQualityLevel = 'real' | 'estimated' | 'partial' | 'none';

// Configuration pour l'affichage
const QUALITY_CONFIG: Record<DataQualityLevel, {
  label: string;
  shortLabel: string;
  description: string;
  detailedDescription: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
}> = {
  real: {
    label: 'Données réelles',
    shortLabel: 'RÉEL',
    description: 'Données officielles des APIs sportives',
    detailedDescription: 'Ces prédictions sont basées sur des statistiques réelles et actualisées provenant de sources officielles (APIs sportives). Les données incluent la forme récente des équipes, les blessures, les confrontations directes et les performances passées.',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-500/15',
    borderColor: 'border-green-500/30',
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  estimated: {
    label: 'Estimation',
    shortLabel: 'ESTIMATION',
    description: 'Calculé à partir des cotes',
    detailedDescription: 'Ces prédictions sont estimées à partir des cotes des bookmakers. En l\'absence de données réelles, les cotes permettent d\'estimer les probabilités implicites de chaque issue. La précision peut varier selon la qualité des cotes disponibles.',
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-500/15',
    borderColor: 'border-yellow-500/30',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  partial: {
    label: 'Partiel',
    shortLabel: 'PARTIEL',
    description: 'Mélange de données réelles et estimées',
    detailedDescription: 'Certaines données sont réelles (ex: cotes actuelles) mais d\'autres sont estimées (ex: forme des équipes). Les prédictions sont moins fiables que les données entièrement réelles mais plus précises que les estimations pures.',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-500/15',
    borderColor: 'border-blue-500/30',
    icon: <CircleDot className="h-4 w-4" />,
  },
  none: {
    label: 'Non disponible',
    shortLabel: 'N/A',
    description: 'Aucune donnée disponible',
    detailedDescription: 'Aucune donnée n\'a pu être récupérée pour ce match. Les prédictions sont basées sur des valeurs par défaut et ne doivent pas être considérées comme fiables.',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-500/15',
    borderColor: 'border-gray-500/30',
    icon: <HelpCircle className="h-4 w-4" />,
  },
};

interface DataSourceIndicatorProps {
  quality: DataQualityLevel;
  score?: number;
  sources?: string[];
  showDetails?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * DataSourceIndicator - Indicateur principal de la source des données
 * 
 * Affiche clairement si les données sont:
 * - RÉELLES: Données officielles des APIs
 * - ESTIMÉES: Calculées à partir des cotes
 * - PARTIELLES: Mélange des deux
 * - NON DISPONIBLES: Aucune donnée
 */
export function DataSourceIndicator({
  quality,
  score,
  sources = [],
  showDetails = false,
  size = 'md',
  className = '',
}: DataSourceIndicatorProps) {
  const [expanded, setExpanded] = useState(false);
  const config = QUALITY_CONFIG[quality];

  const sizeStyles = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  return (
    <div className={className}>
      {/* Badge principal */}
      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className={`${config.bgColor} ${config.color} ${config.borderColor} ${sizeStyles[size]} font-semibold cursor-help`}
              >
                {config.icon}
                <span className="ml-1.5">{config.shortLabel}</span>
                {score !== undefined && (
                  <span className="ml-1 opacity-70">({score}%)</span>
                )}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-2">
                <p className="font-semibold">{config.label}</p>
                <p className="text-xs text-muted-foreground">{config.description}</p>
                {sources.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {sources.map((source, idx) => (
                      <Badge key={idx} variant="secondary" className="text-[10px]">
                        {source}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {showDetails && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Moins de détails
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                Plus de détails
              </>
            )}
          </button>
        )}
      </div>

      {/* Détails étendus */}
      {showDetails && expanded && (
        <Card className={`mt-3 p-4 ${config.bgColor} ${config.borderColor} border`}>
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${config.bgColor}`}>
              {config.icon}
            </div>
            <div className="flex-1">
              <h4 className={`font-semibold ${config.color}`}>{config.label}</h4>
              <p className="text-sm text-muted-foreground mt-1">
                {config.detailedDescription}
              </p>
              
              {sources.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Sources utilisées:</p>
                  <div className="flex flex-wrap gap-1">
                    {sources.map((source, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        <Database className="h-3 w-3 mr-1" />
                        {source}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * DataQualityComparison - Comparaison visuelle Réel vs Estimé
 */
interface DataQualityComparisonProps {
  realDataAvailable: boolean;
  onConfigureApi?: () => void;
}

export function DataQualityComparison({ 
  realDataAvailable, 
  onConfigureApi 
}: DataQualityComparisonProps) {
  return (
    <div className="p-4 rounded-lg border border-border/50 bg-muted/30">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Qualité des données</span>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        {/* Données Réelles */}
        <div className={`p-3 rounded-lg border ${
          realDataAvailable 
            ? 'border-green-500/30 bg-green-500/10' 
            : 'border-border/50 bg-muted/50 opacity-50'
        }`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`h-4 w-4 ${realDataAvailable ? 'text-green-500' : 'text-muted-foreground'}`} />
            <span className={`text-sm font-medium ${realDataAvailable ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
              Données réelles
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {realDataAvailable 
              ? 'Statistiques officielles disponibles' 
              : 'Non disponibles'}
          </p>
        </div>

        {/* Estimation */}
        <div className={`p-3 rounded-lg border ${
          !realDataAvailable 
            ? 'border-yellow-500/30 bg-yellow-500/10' 
            : 'border-border/50 bg-muted/50 opacity-50'
        }`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className={`h-4 w-4 ${!realDataAvailable ? 'text-yellow-500' : 'text-muted-foreground'}`} />
            <span className={`text-sm font-medium ${!realDataAvailable ? 'text-yellow-600 dark:text-yellow-400' : 'text-muted-foreground'}`}>
              Estimation
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {!realDataAvailable 
              ? 'Basé sur les cotes des bookmakers' 
              : 'Non utilisé'}
          </p>
        </div>
      </div>

      {!realDataAvailable && onConfigureApi && (
        <button
          onClick={onConfigureApi}
          className="mt-3 text-xs text-primary hover:underline flex items-center gap-1"
        >
          <Info className="h-3 w-3" />
          Configurer une API gratuite pour des données réelles
        </button>
      )}
    </div>
  );
}

/**
 * GlobalDataQualityBanner - Bannière globale affichant l'état des données
 */
interface GlobalDataQualityBannerProps {
  overallQuality: DataQualityLevel;
  realDataCount: number;
  estimatedDataCount: number;
  errorCount?: number;
}

export function GlobalDataQualityBanner({
  overallQuality,
  realDataCount,
  estimatedDataCount,
  errorCount = 0,
}: GlobalDataQualityBannerProps) {
  const config = QUALITY_CONFIG[overallQuality];

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${config.bgColor} ${config.borderColor}`}>
      <div className="flex items-center gap-3">
        {config.icon}
        <div>
          <p className={`font-medium ${config.color}`}>
            Données: {config.label}
          </p>
          <p className="text-xs text-muted-foreground">
            {realDataCount} réel{realDataCount > 1 ? 's' : ''} • {estimatedDataCount} estimation{estimatedDataCount > 1 ? 's' : ''}
            {errorCount > 0 && ` • ${errorCount} erreur${errorCount > 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {overallQuality === 'estimated' && (
        <div className="flex items-center gap-2 text-xs text-yellow-600 dark:text-yellow-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          Précision réduite
        </div>
      )}
    </div>
  );
}

export default DataSourceIndicator;
