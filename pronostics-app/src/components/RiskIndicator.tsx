'use client';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { getRiskLevel } from '@/lib/riskCalculator';
import { TrendingUp, AlertTriangle, Shield, CheckCircle } from 'lucide-react';

interface RiskIndicatorProps {
  percentage: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function RiskIndicator({ percentage, showLabel = true, size = 'md' }: RiskIndicatorProps) {
  const level = getRiskLevel(percentage);

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const iconSize = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  // Couleurs: Vert (sûr) → Orange (modéré) → Rouge (risqué)
  const getColorClass = () => {
    if (percentage <= 35) return 'bg-green-500/15 text-green-600 border-green-500/30 dark:text-green-400 dark:bg-green-500/20';
    if (percentage <= 60) return 'bg-orange-500/15 text-orange-600 border-orange-500/30 dark:text-orange-400 dark:bg-orange-500/20';
    return 'bg-red-500/15 text-red-600 border-red-500/30 dark:text-red-400 dark:bg-red-500/20';
  };

  const Icon = level === 'low' ? CheckCircle : level === 'medium' ? TrendingUp : AlertTriangle;

  return (
    <div className="flex items-center gap-2">
      <Badge 
        variant="outline" 
        className={`${getColorClass()} ${sizeClasses[size]} font-semibold border transition-all hover:scale-105`}
      >
        <Icon className={`${iconSize[size]} mr-1`} />
        {percentage}%
      </Badge>
      {showLabel && (
        <span className={`text-xs font-medium capitalize ${
          level === 'low' ? 'text-green-600 dark:text-green-400' : 
          level === 'medium' ? 'text-orange-600 dark:text-orange-400' : 
          'text-red-600 dark:text-red-400'
        }`}>
          {level === 'low' ? 'Sûr' : level === 'medium' ? 'Modéré' : 'Risqué'}
        </span>
      )}
    </div>
  );
}

interface RiskGaugeProps {
  percentage: number;
  label?: string;
}

export function RiskGauge({ percentage, label }: RiskGaugeProps) {
  const level = getRiskLevel(percentage);
  
  // Couleurs: Vert → Orange → Rouge
  const getColor = () => {
    if (percentage <= 35) return 'bg-green-500';
    if (percentage <= 60) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getGradient = () => {
    if (percentage <= 35) return 'from-green-500/30 to-green-500';
    if (percentage <= 60) return 'from-orange-500/30 to-orange-500';
    return 'from-red-500/30 to-red-500';
  };

  return (
    <Card className="p-5 bg-gradient-to-br from-card to-muted/30 border-border/50">
      <div className="space-y-4">
        {label && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">{label}</span>
            <RiskIndicator percentage={percentage} showLabel={false} size="sm" />
          </div>
        )}
        
        {/* Progress bar */}
        <div className="relative h-4 bg-muted rounded-full overflow-hidden border border-border/50">
          <div 
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 bg-gradient-to-r ${getGradient()}`}
            style={{ width: `${percentage}%` }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>

        {/* Scale labels */}
        <div className="flex justify-between text-xs font-medium">
          <span className="text-green-500">Sûr</span>
          <span className="text-orange-500">Modéré</span>
          <span className="text-red-500">Risqué</span>
        </div>
      </div>
    </Card>
  );
}
