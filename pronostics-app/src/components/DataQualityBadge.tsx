'use client';

import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, 
  AlertTriangle, 
  HelpCircle, 
  CircleDot,
  Info
} from 'lucide-react';
import {
  DataQualityLevel,
  DATA_QUALITY_CONFIG,
} from '@/lib/dataQuality';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface DataQualityBadgeProps {
  quality: DataQualityLevel;
  score?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showScore?: boolean;
  className?: string;
}

// Configuration des icônes par niveau de qualité
const QUALITY_ICONS: Record<DataQualityLevel, React.ReactNode> = {
  real: <CheckCircle2 className="h-3.5 w-3.5" />,
  estimated: <AlertTriangle className="h-3.5 w-3.5" />,
  partial: <CircleDot className="h-3.5 w-3.5" />,
  none: <HelpCircle className="h-3.5 w-3.5" />,
};

// Configuration des tailles
const SIZE_CONFIG = {
  sm: {
    badge: 'text-[10px] px-2 py-0.5 h-5',
    gap: 'gap-1',
  },
  md: {
    badge: 'text-xs px-2.5 py-1 h-6',
    gap: 'gap-1.5',
  },
  lg: {
    badge: 'text-sm px-3 py-1.5 h-7',
    gap: 'gap-2',
  },
};

/**
 * DataQualityBadge - Badge indiquant la source des données
 * 
 * Affiche clairement si les données sont:
 * - Réelles (données officielles des APIs)
 * - Estimées (calculées à partir des cotes)
 * - Partielles (mélange réel/estimé)
 * - Non disponibles
 */
export function DataQualityBadge({
  quality,
  score,
  size = 'sm',
  showLabel = true,
  showScore = false,
  className = '',
}: DataQualityBadgeProps) {
  const config = DATA_QUALITY_CONFIG[quality];
  const sizeConfig = SIZE_CONFIG[size];
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`
              ${config.bgColor} 
              ${config.color} 
              ${config.borderColor} 
              ${sizeConfig.badge} 
              ${sizeConfig.gap}
              font-medium 
              inline-flex 
              items-center 
              border
              ${className}
            `}
          >
            {QUALITY_ICONS[quality]}
            {showLabel && (
              <span className="ml-0.5">
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
            {showScore && score !== undefined && (
              <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                <div 
                  className={`h-full rounded-full ${
                    score >= 80 ? 'bg-green-500' :
                    score >= 50 ? 'bg-blue-500' :
                    score >= 20 ? 'bg-yellow-500' : 'bg-gray-500'
                  }`}
                  style={{ width: `${score}%` }}
                />
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * DataSourceLabel - Label compact pour identifier la source
 */
export function DataSourceLabel({ source }: { source: string }) {
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

export default DataQualityBadge;
