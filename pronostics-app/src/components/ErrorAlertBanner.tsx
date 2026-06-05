'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  RefreshCw,
  X,
  WifiOff,
  Shield,
  Database,
  HelpCircle
} from 'lucide-react';
import { useState } from 'react';

// Types d'erreurs possibles
export type ErrorType =
  | 'cloudflare_blocked'
  | 'rate_limited'
  | 'timeout'
  | 'server_error'
  | 'javascript_rendering'
  | 'ip_blocked'
  | 'invalid_response'
  | 'parsing_failed'
  | 'network_error'
  | 'no_data'
  | 'api_not_configured'
  | 'scraping_blocked';

// Configuration détaillée des messages d'erreur
export const ERROR_CONFIG: Record<ErrorType, {
  title: string;
  description: string;
  solution: string;
  severity: 'critical' | 'warning' | 'info';
  icon: React.ReactNode;
}> = {
  cloudflare_blocked: {
    title: 'Accès bloqué par Cloudflare',
    description: 'Le site web a activé une protection anti-bot qui empêche la récupération des données.',
    solution: 'Les prédictions sont basées sur les cotes des bookmakers comme source alternative.',
    severity: 'warning',
    icon: <Shield className="h-4 w-4" />,
  },
  rate_limited: {
    title: 'Limite de requêtes atteinte',
    description: 'Trop de requêtes ont été envoyées au serveur. Veuillez patienter.',
    solution: 'Réessayez dans quelques minutes. Les données de secours sont utilisées.',
    severity: 'warning',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  timeout: {
    title: 'Délai d\'attente dépassé',
    description: 'Le serveur met trop de temps à répondre.',
    solution: 'Les données de secours sont utilisées pour garantir la disponibilité.',
    severity: 'warning',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  server_error: {
    title: 'Erreur du serveur distant',
    description: 'Le serveur de données rencontre des problèmes techniques.',
    solution: 'Réessayez ultérieurement ou utilisez les données de secours.',
    severity: 'warning',
    icon: <AlertCircle className="h-4 w-4" />,
  },
  javascript_rendering: {
    title: 'JavaScript requis',
    description: 'Le site web nécessite JavaScript pour afficher les données.',
    solution: 'Les données sont estimées à partir des cotes disponibles.',
    severity: 'warning',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  ip_blocked: {
    title: 'Adresse IP bloquée',
    description: 'Notre serveur a été identifié et bloqué par le site source.',
    solution: 'Source alternative utilisée. Configurez une API gratuite pour des données réelles.',
    severity: 'warning',
    icon: <WifiOff className="h-4 w-4" />,
  },
  invalid_response: {
    title: 'Réponse invalide',
    description: 'Les données reçues ne sont pas au format attendu.',
    solution: 'Utilisation des données de secours.',
    severity: 'warning',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  parsing_failed: {
    title: 'Extraction impossible',
    description: 'Impossible d\'extraire les données. Le site a peut-être changé de format.',
    solution: 'Les prédictions sont basées sur les cotes.',
    severity: 'warning',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  network_error: {
    title: 'Erreur de connexion',
    description: 'Impossible de se connecter au serveur de données.',
    solution: 'Vérifiez votre connexion internet et réessayez.',
    severity: 'critical',
    icon: <WifiOff className="h-4 w-4" />,
  },
  no_data: {
    title: 'Aucune donnée disponible',
    description: 'Aucune donnée n\'a pu être récupérée pour ce match.',
    solution: 'Les prédictions sont basées sur les cotes des bookmakers.',
    severity: 'info',
    icon: <Database className="h-4 w-4" />,
  },
  api_not_configured: {
    title: 'API non configurée',
    description: 'Aucune clé API n\'est configurée pour récupérer les données réelles.',
    solution: 'Configurez une API gratuite (API-Football, Balldontlie) pour des données réelles.',
    severity: 'info',
    icon: <Info className="h-4 w-4" />,
  },
  scraping_blocked: {
    title: 'Scraping bloqué',
    description: 'L\'extraction automatique des données a été bloquée par le site source.',
    solution: 'Utilisation des cotes comme source alternative pour les prédictions.',
    severity: 'warning',
    icon: <Shield className="h-4 w-4" />,
  },
};

interface ErrorAlertBannerProps {
  type: ErrorType;
  onRetry?: () => void;
  onDismiss?: () => void;
  compact?: boolean;
  showSolution?: boolean;
}

/**
 * ErrorAlertBanner - Bannière d'erreur explicite avec solution
 * 
 * Affiche clairement:
 * - Le type d'erreur
 * - La description du problème
 * - La solution proposée
 * - Actions possibles (réessayer, fermer)
 */
export function ErrorAlertBanner({
  type,
  onRetry,
  onDismiss,
  compact = false,
  showSolution = true,
}: ErrorAlertBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const config = ERROR_CONFIG[type];

  if (dismissed) return null;

  const severityStyles = {
    critical: 'border-red-500/50 bg-red-500/10',
    warning: 'border-yellow-500/50 bg-yellow-500/10',
    info: 'border-blue-500/50 bg-blue-500/10',
  };

  const severityColors = {
    critical: 'text-red-600 dark:text-red-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    info: 'text-blue-600 dark:text-blue-400',
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${severityStyles[config.severity]}`}>
        <span className={severityColors[config.severity]}>{config.icon}</span>
        <span className={`text-sm font-medium ${severityColors[config.severity]}`}>
          {config.title}
        </span>
        {onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            className="h-6 px-2 text-xs ml-auto"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Réessayer
          </Button>
        )}
      </div>
    );
  }

  return (
    <Alert className={`${severityStyles[config.severity]} relative`}>
      <span className={severityColors[config.severity]}>{config.icon}</span>
      <AlertTitle className={severityColors[config.severity]}>
        {config.title}
      </AlertTitle>
      <AlertDescription className="space-y-2">
        <p className="text-sm text-muted-foreground">{config.description}</p>
        {showSolution && (
          <div className="flex items-start gap-2 p-2 rounded bg-muted/50">
            <HelpCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-foreground">Solution:</p>
              <p className="text-xs text-muted-foreground">{config.solution}</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 mt-3">
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="h-8"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Réessayer
            </Button>
          )}
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDismissed(true);
                onDismiss();
              }}
              className="h-8"
            >
              Fermer
            </Button>
          )}
        </div>
      </AlertDescription>
      {onDismiss && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setDismissed(true);
            onDismiss();
          }}
          className="absolute right-2 top-2 h-6 w-6"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </Alert>
  );
}

/**
 * MultiErrorBanner - Affiche plusieurs erreurs groupées
 */
interface MultiErrorBannerProps {
  errors: Array<{
    type: ErrorType;
    affectedData?: string[];
  }>;
  onRetry?: () => void;
}

export function MultiErrorBanner({ errors, onRetry }: MultiErrorBannerProps) {
  if (errors.length === 0) return null;

  // Grouper par type
  const groupedErrors = errors.reduce((acc, error) => {
    if (!acc[error.type]) {
      acc[error.type] = [];
    }
    if (error.affectedData) {
      acc[error.type].push(...error.affectedData);
    }
    return acc;
  }, {} as Record<ErrorType, string[]>);

  const errorTypes = Object.keys(groupedErrors) as ErrorType[];
  const hasCritical = errorTypes.some(t => ERROR_CONFIG[t].severity === 'critical');

  return (
    <div className={`p-4 rounded-lg border ${
      hasCritical 
        ? 'border-red-500/50 bg-red-500/10' 
        : 'border-yellow-500/50 bg-yellow-500/10'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        {hasCritical ? (
          <AlertCircle className="h-5 w-5 text-red-500" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
        )}
        <span className={`font-medium ${
          hasCritical ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'
        }`}>
          {errorTypes.length === 1 
            ? ERROR_CONFIG[errorTypes[0]].title
            : `${errorTypes.length} problèmes détectés`
          }
        </span>
      </div>

      <div className="space-y-2">
        {errorTypes.map((type) => {
          const config = ERROR_CONFIG[type];
          const affectedData = groupedErrors[type];
          
          return (
            <div key={type} className="flex items-start gap-2 text-sm">
              <span className="text-muted-foreground">•</span>
              <div>
                <span className="font-medium">{config.title}</span>
                {affectedData.length > 0 && (
                  <span className="text-muted-foreground ml-1">
                    ({affectedData.slice(0, 3).join(', ')}{affectedData.length > 3 ? '...' : ''})
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 p-2 rounded bg-muted/50 text-xs text-muted-foreground">
        <strong>Solution:</strong> Les données de secours sont utilisées. 
        Configurez une API gratuite pour des données réelles.
      </div>

      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-3"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Réessayer
        </Button>
      )}
    </div>
  );
}

export default ErrorAlertBanner;
