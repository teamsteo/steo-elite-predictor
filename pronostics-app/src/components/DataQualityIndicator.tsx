'use client';

import { Badge } from '@/components/ui/badge';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  AlertTriangle, 
  CheckCircle2, 
  HelpCircle, 
  CircleDot,
  AlertCircle,
  Info
} from 'lucide-react';
import {
  DataQualityLevel,
  DataQualityMetadata,
  DataQualityError,
  DATA_QUALITY_CONFIG,
  ERROR_MESSAGES,
  formatQualityForDisplay,
} from '@/lib/dataQuality';

interface DataQualityIndicatorProps {
  quality: DataQualityLevel;
  score?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showScore?: boolean;
  className?: string;
}

// Configuration des icônes par niveau
const QUALITY_ICONS: Record<DataQualityLevel, React.ReactNode> = {
  real: <CheckCircle2 className="h-3.5 w-3.5" />,
  estimated: <AlertTriangle className="h-3.5 w-3.5" />,
  partial: <CircleDot className="h-3.5 w-3.5" />,
  none: <HelpCircle className="h-3.5 w-3.5" />,
};

// Tailles
const SIZE_CONFIG = {
  sm: {
    badge: 'text-[10px] px-2 py-0.5 h-5',
    icon: 'h-3 w-3',
  },
  md: {
    badge: 'text-xs px-2.5 py-1 h-6',
    icon: 'h-3.5 w-3.5',
  },
  lg: {
    badge: 'text-sm px-3 py-1.5 h-7',
    icon: 'h-4 w-4',
  },
};

/**
 * Indicateur de qualité des données - Version compacte
 */
export function DataQualityIndicator({
  quality,
  score,
  size = 'sm',
  showLabel = true,
  showScore = false,
  className = '',
}: DataQualityIndicatorProps) {
  const config = DATA_QUALITY_CONFIG[quality];
  const sizeConfig = SIZE_CONFIG[size];
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`${config.bgColor} ${config.color} ${config.borderColor} ${sizeConfig.badge} font-medium ${className}`}
          >
            {QUALITY_ICONS[quality]}
            {showLabel && (
              <span className="ml-1">
                {config.shortLabel}
                {showScore && score !== undefined && ` (${score}%)`}
              </span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold">{config.label}</p>
            <p className="text-xs text-muted-foreground">{config.description}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface DataQualityDetailsProps {
  metadata: DataQualityMetadata;
  compact?: boolean;
}

/**
 * Affichage détaillé de la qualité des données
 */
export function DataQualityDetails({ metadata, compact = false }: DataQualityDetailsProps) {
  const formatted = formatQualityForDisplay(metadata);
  
  const typeNames: Record<string, string> = {
    form: 'Forme',
    goals: 'Buts',
    cards: 'Cartons',
    corners: 'Corners',
    injuries: 'Blessures',
    h2h: 'H2H',
  };
  
  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <DataQualityIndicator 
          quality={metadata.overall} 
          score={metadata.overallScore}
          showScore
        />
        {metadata.errors.length > 0 && (
          <Badge variant="outline" className="text-[10px] bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
            <AlertCircle className="h-3 w-3 mr-1" />
            {metadata.errors.length} alerte(s)
          </Badge>
        )}
      </div>
    );
  }
  
  return (
    <div className="space-y-3 p-3 rounded-lg bg-muted/30 border border-border/50">
      {/* Score global */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DataQualityIndicator 
            quality={metadata.overall} 
            score={metadata.overallScore}
            size="md"
            showScore
          />
          <span className="text-sm text-muted-foreground">
            Score de confiance
          </span>
        </div>
        <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all ${
              metadata.overallScore >= 80 ? 'bg-green-500' :
              metadata.overallScore >= 50 ? 'bg-blue-500' :
              metadata.overallScore >= 20 ? 'bg-yellow-500' : 'bg-gray-500'
            }`}
            style={{ width: `${metadata.overallScore}%` }}
          />
        </div>
      </div>
      
      {/* Détails par type */}
      <div className="grid grid-cols-3 gap-2">
        {Object.entries(metadata.byType).map(([type, quality]) => (
          <div key={type} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{typeNames[type] || type}</span>
            <DataQualityIndicator quality={quality} size="sm" showLabel={false} />
          </div>
        ))}
      </div>
      
      {/* Erreurs */}
      {metadata.errors.length > 0 && (
        <div className="pt-2 border-t border-border/50 space-y-1.5">
          {metadata.errors.map((error, index) => (
            <ErrorBanner key={index} error={error} />
          ))}
        </div>
      )}
      
      {/* Source */}
      <div className="text-xs text-muted-foreground">
        Source: {metadata.sources.join(', ')} • Mis à jour: {new Date(metadata.lastUpdated).toLocaleTimeString('fr-FR')}
      </div>
    </div>
  );
}

interface ErrorBannerProps {
  error: DataQualityError;
}

/**
 * Bannière d'erreur avec solution
 */
export function ErrorBanner({ error }: ErrorBannerProps) {
  const errorConfig = ERROR_MESSAGES[error.type];
  
  if (!errorConfig) {
    return (
      <div className="flex items-start gap-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
        <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
        <div className="text-xs">
          <p className="font-medium text-yellow-600 dark:text-yellow-400">{error.message}</p>
          {error.fallback && (
            <p className="text-yellow-600/70 dark:text-yellow-400/70 mt-0.5">{error.fallback}</p>
          )}
        </div>
      </div>
    );
  }
  
  const severityStyles = {
    critical: 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400',
    warning: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-600 dark:text-yellow-400',
    info: 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400',
  };
  
  const severityIcons = {
    critical: <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />,
    info: <Info className="h-4 w-4 shrink-0 mt-0.5" />,
  };
  
  return (
    <div className={`flex items-start gap-2 p-2 rounded border ${severityStyles[errorConfig.severity]}`}>
      {severityIcons[errorConfig.severity]}
      <div className="text-xs space-y-0.5">
        <p className="font-medium">{errorConfig.title}</p>
        <p className="opacity-80">{errorConfig.description}</p>
        <p className="opacity-60 italic">💡 {errorConfig.solution}</p>
      </div>
    </div>
  );
}

interface DataSourceBadgeProps {
  source: string;
}

/**
 * Badge indiquant la source des données
 */
export function DataSourceBadge({ source }: DataSourceBadgeProps) {
  const sourceConfig: Record<string, { label: string; color: string }> = {
    'api-football': { label: 'API-Football', color: 'bg-green-500/15 text-green-600 border-green-500/30' },
    'balldontlie': { label: 'Balldontlie', color: 'bg-orange-500/15 text-orange-600 border-orange-500/30' },
    'thesportsdb': { label: 'TheSportsDB', color: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
    'espn': { label: 'ESPN', color: 'bg-red-500/15 text-red-600 border-red-500/30' },
    'fbref': { label: 'FBref', color: 'bg-purple-500/15 text-purple-600 border-purple-500/30' },
    'odds-based': { label: 'Cotes', color: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30' },
    'default': { label: 'Défaut', color: 'bg-gray-500/15 text-gray-600 border-gray-500/30' },
  };
  
  const config = sourceConfig[source] || sourceConfig.default;
  
  return (
    <Badge variant="outline" className={`text-[10px] ${config.color}`}>
      {config.label}
    </Badge>
  );
}

// Export par défaut
export default DataQualityIndicator;
