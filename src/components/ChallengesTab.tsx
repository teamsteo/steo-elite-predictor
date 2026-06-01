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
  sport: string;
  match: string;
  league: string;
  date: string;
  betType: string;
  odds: number;
  ourProbability: number;
  bookmakerProbability: number;
  valueGap: number;
  valueScore: number;
  confidence: string;
  analysis: string;
  factors: { name: string; impact: string }[];
  isWorldCupFriendly?: boolean;
  isWorldCup?: boolean;
  isEuropeanLeague?: boolean;
  predictedScore?: { home: number; away: number };
}

// ============================================
// COMPOSANT PRINCIPAL
// ============================================

export function ChallengesTab() {
  const [valueBets, setValueBets] = useState<ValueBet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'european' | 'world_cup' | 'high_odds'>('all');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/challenges', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      // Prendre tous les value bets
      const allBets = [
        ...(result.valueBets || []),
        ...(result.worldCupFriendlies || []),
        ...(result.worldCupMatches || []),
      ];
      
      setValueBets(allBets);
    } catch (err) {
      console.error('Erreur chargement challenges:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtrer les paris
  const getFilteredBets = (): ValueBet[] => {
    switch (activeFilter) {
      case 'european':
        return valueBets.filter(b => b.isEuropeanLeague);
      case 'world_cup':
        return valueBets.filter(b => b.isWorldCup || b.isWorldCupFriendly);
      case 'high_odds':
        return valueBets.filter(b => b.odds >= 2.0);
      default:
        return valueBets;
    }
  };

  // Formater la date
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  // Obtenir la couleur du confidence
  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'very_high': return 'bg-green-500';
      case 'high': return 'bg-green-400';
      case 'medium': return 'bg-yellow-500';
      default: return 'bg-red-500';
    }
  };

  const filteredBets = getFilteredBets();

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
            <p className="text-red-500 font-medium">Erreur de chargement</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Réessayer
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

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
            Matchs à fortes cotes susceptibles de rentrer
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
                <p className="text-2xl font-bold">{valueBets.length}</p>
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
                  {valueBets.filter(b => b.confidence === 'high' || b.confidence === 'very_high').length}
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
                  {valueBets.filter(b => b.isWorldCupFriendly || b.isWorldCup).length}
                </p>
                <p className="text-xs text-muted-foreground">Coupe du Monde</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="py-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">
                  {valueBets.filter(b => b.isEuropeanLeague).length}
                </p>
                <p className="text-xs text-muted-foreground">Champ. Europ.</p>
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
          variant={activeFilter === 'european' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveFilter('european')}
          className={activeFilter === 'european' ? 'bg-purple-500 hover:bg-purple-600' : ''}
        >
          <Trophy className="h-4 w-4 mr-1" />
          Championnats Européens
        </Button>
        <Button
          variant={activeFilter === 'world_cup' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveFilter('world_cup')}
          className={activeFilter === 'world_cup' ? 'bg-amber-500 hover:bg-amber-600' : ''}
        >
          <Globe className="h-4 w-4 mr-1" />
          Coupe du Monde
        </Button>
        <Button
          variant={activeFilter === 'high_odds' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveFilter('high_odds')}
          className={activeFilter === 'high_odds' ? 'bg-rose-500 hover:bg-rose-600' : ''}
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
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredBets.map((bet) => (
            <Card 
              key={bet.id} 
              className={`overflow-hidden transition-all hover:shadow-lg ${
                bet.isWorldCup ? 'border-amber-500/30 bg-amber-500/5' :
                bet.isWorldCupFriendly ? 'border-blue-500/30 bg-blue-500/5' :
                bet.isEuropeanLeague ? 'border-purple-500/30 bg-purple-500/5' : ''
              }`}
            >
              {bet.isWorldCup && (
                <div className="bg-amber-500 text-white text-xs font-medium px-3 py-1 flex items-center gap-1">
                  <Trophy className="h-3 w-3" />
                  Coupe du Monde FIFA
                </div>
              )}
              {bet.isWorldCupFriendly && (
                <div className="bg-blue-500 text-white text-xs font-medium px-3 py-1 flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  Amical - Préparation CM 2026
                </div>
              )}
              
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {bet.sport === 'football' ? (
                      <CircleDot className="h-4 w-4" />
                    ) : (
                      <Target className="h-4 w-4" />
                    )}
                    <CardTitle className="text-lg">{bet.match}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {bet.league}
                    </Badge>
                    <Badge className={`${getConfidenceColor(bet.confidence)} text-white text-xs`}>
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
                    <p className={`font-bold ${bet.valueGap > 0.05 ? 'text-green-500' : 'text-yellow-500'}`}>
                      +{(bet.valueGap * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Score prédit */}
                {bet.predictedScore && (
                  <div className="flex items-center gap-2 text-sm bg-muted/30 px-3 py-2 rounded-lg">
                    <span className="text-muted-foreground">Score prédit:</span>
                    <span className="font-bold">{bet.predictedScore.home} - {bet.predictedScore.away}</span>
                  </div>
                )}

                {/* Value Score */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Score Value</span>
                    <span className="font-bold">{bet.valueScore}/100</span>
                  </div>
                  <Progress value={bet.valueScore} className="h-2" />
                </div>

                {/* Analyse */}
                <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
                  {bet.analysis}
                </p>

                {/* Facteurs */}
                <div className="flex flex-wrap gap-2">
                  {bet.factors && bet.factors.map((factor, idx) => (
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
                Les paris sportifs comportent des risques. Pariez de manière responsable.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
