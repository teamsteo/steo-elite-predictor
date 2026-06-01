'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Trophy, 
  Flame, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  MapPin,
  Users,
  Target,
  Sparkles,
  Loader2,
  RefreshCw,
  Globe,
  CircleDot
} from 'lucide-react';

// ============================================
// INTERFACES
// ============================================

interface ValueBet {
  id: string;
  sport: 'football' | 'tennis' | 'basketball' | 'hockey' | 'baseball';
  match: string;
  league: string;
  date: string;
  betType: string;
  odds: number;
  ourProbability: number;
  bookmakerProbability: number;
  valueGap: number;
  valueScore: number;
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  analysis: string;
  factors: {
    name: string;
    impact: 'positive' | 'neutral' | 'negative';
  }[];
  isWorldCupFriendly?: boolean;
}

interface ChallengeData {
  valueBets: ValueBet[];
  worldCupFriendlies: ValueBet[];
  highOddsChallenges: ValueBet[];
  lastUpdated: string;
}

// ============================================
// COMPOSANT PRINCIPAL
// ============================================

export function ChallengesTab() {
  const [data, setData] = useState<ChallengeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'wc_friendly' | 'high_odds'>('all');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/challenges');
      if (!response.ok) {
        throw new Error('Erreur lors du chargement des données');
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtrer les paris selon le filtre actif
  const getFilteredBets = (): ValueBet[] => {
    if (!data) return [];
    
    switch (activeFilter) {
      case 'wc_friendly':
        return data.worldCupFriendlies;
      case 'high_odds':
        return data.highOddsChallenges;
      default:
        return [...data.valueBets, ...data.worldCupFriendlies, ...data.highOddsChallenges]
          .sort((a, b) => b.valueScore - a.valueScore);
    }
  };

  // Obtenir l'icône du sport
  const getSportIcon = (sport: string) => {
    switch (sport) {
      case 'football':
        return <CircleDot className="h-4 w-4" />;
      case 'tennis':
        return <Target className="h-4 w-4" />;
      default:
        return <Trophy className="h-4 w-4" />;
    }
  };

  // Obtenir la couleur du confidence
  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'very_high':
        return 'bg-green-500';
      case 'high':
        return 'bg-green-400';
      case 'medium':
        return 'bg-yellow-500';
      default:
        return 'bg-red-500';
    }
  };

  // Formater la date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // ============================================
  // RENDU LOADING
  // ============================================

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-orange-500" />
        <p className="text-muted-foreground">Chargement des challenges...</p>
      </div>
    );
  }

  // ============================================
  // RENDU ERROR
  // ============================================

  if (error) {
    return (
      <Card className="border-red-500/50 bg-red-500/5">
        <CardContent className="py-8">
          <div className="flex flex-col items-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-red-500" />
            <p className="text-red-500 font-medium">{error}</p>
            <Button variant="outline" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Réessayer
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const filteredBets = getFilteredBets();

  // ============================================
  // RENDU PRINCIPAL
  // ============================================

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Flame className="h-6 w-6 text-orange-500" />
            Challenges Négligés
          </h2>
          <p className="text-muted-foreground">
            Matchs à fortes cotes susceptibles de rentrer, détectés par notre IA
          </p>
        </div>
        
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualiser
        </Button>
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
          <CardContent className="py-3">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{filteredBets.length}</p>
                <p className="text-xs text-muted-foreground">Value Bets</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="py-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">
                  {filteredBets.filter(b => b.confidence === 'high' || b.confidence === 'very_high').length}
                </p>
                <p className="text-xs text-muted-foreground">Haute confiance</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="py-3">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">
                  {data?.worldCupFriendlies.length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Amicaux CM</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="py-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">
                  {filteredBets.length > 0 
                    ? (filteredBets.reduce((acc, b) => acc + b.odds, 0) / filteredBets.length).toFixed(2)
                    : '0.00'
                  }
                </p>
                <p className="text-xs text-muted-foreground">Cote moyenne</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={activeFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveFilter('all')}
          className={activeFilter === 'all' ? 'bg-orange-500 hover:bg-orange-600' : ''}
        >
          Tous
        </Button>
        <Button
          variant={activeFilter === 'wc_friendly' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveFilter('wc_friendly')}
          className={activeFilter === 'wc_friendly' ? 'bg-orange-500 hover:bg-orange-600' : ''}
        >
          <Globe className="h-4 w-4 mr-1" />
          Amicaux Coupe du Monde
        </Button>
        <Button
          variant={activeFilter === 'high_odds' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveFilter('high_odds')}
          className={activeFilter === 'high_odds' ? 'bg-orange-500 hover:bg-orange-600' : ''}
        >
          <TrendingUp className="h-4 w-4 mr-1" />
          Grosses Cotes
        </Button>
      </div>

      {/* Liste des value bets */}
      {filteredBets.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center space-y-3 text-center">
              <Trophy className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                Aucun challenge disponible pour le moment
              </p>
              <p className="text-sm text-muted-foreground/70">
                Les value bets apparaîtront ici dès qu'ils seront détectés
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredBets.map((bet, index) => (
            <Card 
              key={bet.id} 
              className={`overflow-hidden transition-all hover:shadow-lg ${
                bet.isWorldCupFriendly ? 'border-blue-500/30 bg-blue-500/5' : ''
              }`}
            >
              {/* Badge spécial pour amical CM */}
              {bet.isWorldCupFriendly && (
                <div className="bg-blue-500 text-white text-xs font-medium px-3 py-1 flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  Match Amical - Préparation Coupe du Monde 2026
                </div>
              )}
              
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {getSportIcon(bet.sport)}
                    <CardTitle className="text-lg">{bet.match}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {bet.league}
                    </Badge>
                    <Badge 
                      className={`${getConfidenceColor(bet.confidence)} text-white text-xs`}
                    >
                      {bet.confidence === 'very_high' ? 'Très haute' :
                       bet.confidence === 'high' ? 'Haute' :
                       bet.confidence === 'medium' ? 'Moyenne' : 'Basse'}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Info principale */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Paris</p>
                    <p className="font-semibold">{bet.betType}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cote</p>
                    <p className="font-bold text-orange-500 text-lg">{bet.odds.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Notre proba</p>
                    <p className="font-semibold text-green-500">{(bet.ourProbability * 100).toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Value Gap</p>
                    <p className={`font-bold ${bet.valueGap > 0.1 ? 'text-green-500' : 'text-yellow-500'}`}>
                      +{(bet.valueGap * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Value Score */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Score Value</span>
                    <span className="font-bold">{bet.valueScore}/100</span>
                  </div>
                  <Progress 
                    value={bet.valueScore} 
                    className={`h-2 ${bet.valueScore >= 70 ? 'bg-green-100' : bet.valueScore >= 50 ? 'bg-yellow-100' : 'bg-red-100'}`}
                  />
                </div>

                {/* Analyse */}
                <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
                  {bet.analysis}
                </p>

                {/* Facteurs */}
                <div className="flex flex-wrap gap-2">
                  {bet.factors.map((factor, idx) => (
                    <Badge 
                      key={idx}
                      variant="outline"
                      className={`text-xs ${
                        factor.impact === 'positive' ? 'border-green-500/50 text-green-600' :
                        factor.impact === 'negative' ? 'border-red-500/50 text-red-600' :
                        'border-gray-500/50 text-gray-600'
                      }`}
                    >
                      {factor.impact === 'positive' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                      {factor.impact === 'negative' && <AlertTriangle className="h-3 w-3 mr-1" />}
                      {factor.name}
                    </Badge>
                  ))}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(bet.date)}
                  </div>
                  <div className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    Détecté par IA
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-yellow-600">Avertissement</p>
              <p className="text-muted-foreground">
                Les paris sportifs comportent des risques. Ces analyses sont fournies à titre informatif. 
                Pariez de manière responsable et ne misez jamais plus que ce que vous pouvez vous permettre de perdre.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timestamp */}
      {data?.lastUpdated && (
        <p className="text-xs text-muted-foreground text-center">
          Dernière mise à jour: {new Date(data.lastUpdated).toLocaleString('fr-FR')}
        </p>
      )}
    </div>
  );
}
