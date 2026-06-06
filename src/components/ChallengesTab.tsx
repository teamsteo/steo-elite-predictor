'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Flame, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, 
  CheckCircle, Clock, Target, DollarSign, BarChart3, Filter,
  ChevronDown, ChevronUp, Zap, Shield, Activity
} from 'lucide-react';

// Types
interface Challenge {
  id: string;
  sport: 'football' | 'basketball' | 'hockey';
  league: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  displayDate?: string;
  oddsHome: number;
  oddsAway: number;
  oddsDraw: number | null;
  bookmaker: string;
  hasRealOdds: boolean;
  recommendation: 'home' | 'away' | 'draw' | 'avoid';
  recommendedTeam: string;
  winProbability: number;
  edge: number;
  isValueBet: boolean;
  valueBetType: 'home' | 'away' | 'draw' | null;
  expectedValue: number;
  kellyStake: number;
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  riskLevel: 'low' | 'medium' | 'high';
  riskPercentage: number;
  valueScore: number;
  reasoning: string[];
  factors: {
    formAdvantage: 'home' | 'away' | 'neutral';
    oddsValue: 'high' | 'medium' | 'low';
    dataQuality: number;
  };
  status: 'take' | 'consider' | 'rejected';
}

interface ChallengesSummary {
  totalScanned: number;
  valueBetsFound: number;
  highConfidenceCount: number;
  averageEdge: number;
  realOddsCount: number;
  bySport: { football: number; basketball: number; hockey: number };
  byConfidence: { very_high: number; high: number; medium: number; low: number };
}

// Sport emoji mapping
const SPORT_EMOJIS: Record<string, string> = {
  football: '⚽',
  basketball: '🏀',
  hockey: '🏒',
};

// Confidence config
const CONFIDENCE_CONFIG = {
  very_high: { color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', label: 'Très haute' },
  high: { color: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-500/50', label: 'Haute' },
  medium: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-500/50', label: 'Moyenne' },
  low: { color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/50', label: 'Basse' },
};

// Risk config
const RISK_CONFIG = {
  low: { color: 'text-green-400', icon: Shield, label: 'Faible' },
  medium: { color: 'text-yellow-400', icon: AlertTriangle, label: 'Modéré' },
  high: { color: 'text-red-400', icon: TrendingDown, label: 'Élevé' },
};

export function ChallengesTab() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [summary, setSummary] = useState<ChallengesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // Filters
  const [sportFilter, setSportFilter] = useState('all');
  const [confidenceFilter, setConfidenceFilter] = useState('all');
  const [minEdgeFilter, setMinEdgeFilter] = useState('3');
  const [modeFilter, setModeFilter] = useState('all'); // 'all', 'valuebets', 'high-odds'
  
  // Fetch challenges
  const fetchChallenges = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        sport: sportFilter,
        confidence: confidenceFilter,
        minEdge: minEdgeFilter,
        mode: modeFilter,
      });
      
      const response = await fetch(`/api/challenges?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setChallenges(data.challenges);
        setSummary(data.summary);
      } else {
        setError(data.error || 'Erreur lors du chargement');
      }
    } catch (err) {
      setError('Erreur de connexion');
      console.error('Erreur fetch challenges:', err);
    } finally {
      setLoading(false);
    }
  }, [sportFilter, confidenceFilter, minEdgeFilter, modeFilter]);
  
  useEffect(() => {
    fetchChallenges();
  }, [fetchChallenges]);
  
  // Toggle expanded card
  const toggleExpanded = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };
  
  // Get bet option display
  const getBetOption = (recommendation: string, sport: string) => {
    if (sport === 'football') {
      if (recommendation === 'home') return '1️⃣';
      if (recommendation === 'draw') return '❌';
      if (recommendation === 'away') return '2️⃣';
    }
    return recommendation === 'home' ? '1️⃣' : '2️⃣';
  };
  
  // Get odds for recommendation
  const getRecommendedOdds = (challenge: Challenge) => {
    if (challenge.recommendation === 'home') return challenge.oddsHome;
    if (challenge.recommendation === 'away') return challenge.oddsAway;
    return challenge.oddsDraw || 0;
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500/20 to-red-500/20">
            <Flame className="h-6 w-6 text-orange-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Challenges Value Bets</h2>
            <p className="text-sm text-muted-foreground">
              opportunités détectées par l'analyse ML
            </p>
          </div>
        </div>
        <Button 
          onClick={fetchChallenges} 
          disabled={loading}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>
      
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-blue-400 mb-1">
                <Target className="h-4 w-4" />
                <span className="text-xs font-medium">Scannés</span>
              </div>
              <p className="text-2xl font-bold">{summary.totalScanned}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-green-400 mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs font-medium">Value Bets</span>
              </div>
              <p className="text-2xl font-bold">{summary.valueBetsFound}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-emerald-400 mb-1">
                <CheckCircle className="h-4 w-4" />
                <span className="text-xs font-medium">Haute Confiance</span>
              </div>
              <p className="text-2xl font-bold">{summary.highConfidenceCount}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-purple-400 mb-1">
                <BarChart3 className="h-4 w-4" />
                <span className="text-xs font-medium">Edge Moyen</span>
              </div>
              <p className="text-2xl font-bold">{summary.averageEdge}%</p>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filtres:</span>
            </div>
            
            <Select value={modeFilter} onValueChange={setModeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">📊 Tous les value bets</SelectItem>
                <SelectItem value="high-odds">🔥 Grosses cotes (30-40%)</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={sportFilter} onValueChange={setSportFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Sport" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous sports</SelectItem>
                <SelectItem value="football">⚽ Football</SelectItem>
                <SelectItem value="basketball">🏀 Basketball</SelectItem>
                <SelectItem value="hockey">🏒 Hockey</SelectItem>
              </SelectContent>
            </Select>
            
            {modeFilter !== 'high-odds' && (
              <>
                <Select value={confidenceFilter} onValueChange={setConfidenceFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Confiance" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    <SelectItem value="very_high">Très haute</SelectItem>
                    <SelectItem value="high">Haute</SelectItem>
                    <SelectItem value="medium">Moyenne</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={minEdgeFilter} onValueChange={setMinEdgeFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Edge min" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Edge ≥ 1%</SelectItem>
                    <SelectItem value="3">Edge ≥ 3%</SelectItem>
                    <SelectItem value="5">Edge ≥ 5%</SelectItem>
                    <SelectItem value="8">Edge ≥ 8%</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4">
              <RefreshCw className="h-8 w-8 animate-spin text-orange-400" />
              <p className="text-muted-foreground">Analyse des matchs en cours...</p>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Error State */}
      {error && !loading && (
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertTriangle className="h-8 w-8 text-red-400" />
              <p className="text-red-400">{error}</p>
              <Button onClick={fetchChallenges} variant="outline" size="sm">
                Réessayer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Empty State */}
      {!loading && !error && challenges.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4 text-center">
              <Target className="h-12 w-12 text-muted-foreground" />
              <div>
                <p className="text-lg font-medium">Aucun value bet détecté</p>
                <p className="text-sm text-muted-foreground">
                  Les critères sont trop stricts ou aucun match ne présente d'opportunité
                </p>
              </div>
              <Button onClick={() => { setMinEdgeFilter('1'); setConfidenceFilter('all'); }} variant="outline" size="sm">
                Élargir les critères
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Challenges List */}
      {!loading && !error && challenges.length > 0 && (
        <div className="space-y-3">
          {challenges.map((challenge, index) => {
            const isExpanded = expandedId === challenge.id;
            const confConfig = CONFIDENCE_CONFIG[challenge.confidence];
            const riskConfig = RISK_CONFIG[challenge.riskLevel];
            const RiskIcon = riskConfig.icon;
            
            return (
              <Card 
                key={challenge.id}
                className={`${confConfig.border} hover:bg-accent/50 transition-colors cursor-pointer`}
                onClick={() => toggleExpanded(challenge.id)}
              >
                <CardContent className="py-4">
                  {/* Main Row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {/* Rank */}
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center">
                        <span className="text-sm font-bold text-orange-400">#{index + 1}</span>
                      </div>
                      
                      {/* Sport & Teams */}
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{SPORT_EMOJIS[challenge.sport]}</span>
                          <span className="font-semibold">
                            {challenge.homeTeam} vs {challenge.awayTeam}
                          </span>
                          {challenge.isValueBet && (
                            <Badge variant="outline" className="bg-purple-500/20 text-purple-400 border-purple-500/50 text-xs">
                              <Zap className="h-3 w-3 mr-1" />
                              VALUE
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span>{challenge.league}</span>
                          {challenge.displayDate && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {challenge.displayDate}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Stats */}
                    <div className="flex items-center gap-6">
                      {/* Recommendation */}
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground mb-1">Pronostic</div>
                        <div className="flex items-center gap-1">
                          <span className="text-lg">{getBetOption(challenge.recommendation, challenge.sport)}</span>
                          <span className="font-semibold">{challenge.recommendedTeam}</span>
                        </div>
                      </div>
                      
                      {/* Odds */}
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground mb-1">Cote</div>
                        <div className="font-bold text-lg">{getRecommendedOdds(challenge).toFixed(2)}</div>
                      </div>
                      
                      {/* Edge */}
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground mb-1">Edge</div>
                        <div className="font-bold text-lg text-green-400">+{challenge.edge}%</div>
                      </div>
                      
                      {/* Confidence */}
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground mb-1">Confiance</div>
                        <Badge className={`${confConfig.bg} ${confConfig.color} ${confConfig.border}`}>
                          {confConfig.label}
                        </Badge>
                      </div>
                      
                      {/* Value Score */}
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground mb-1">Score</div>
                        <div className="font-bold text-xl">{challenge.valueScore}</div>
                      </div>
                      
                      {/* Expand Icon */}
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  
                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Odds Details */}
                        <div>
                          <h4 className="font-medium mb-3 flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-blue-400" />
                            Cotes
                          </h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">1 (Domicile)</span>
                              <span className="font-medium">{challenge.oddsHome.toFixed(2)}</span>
                            </div>
                            {challenge.oddsDraw && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">X (Nul)</span>
                                <span className="font-medium">{challenge.oddsDraw.toFixed(2)}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">2 (Extérieur)</span>
                              <span className="font-medium">{challenge.oddsAway.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-border">
                              <span className="text-muted-foreground">Bookmaker</span>
                              <span className="font-medium">{challenge.bookmaker}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Cotes réelles</span>
                              <span className={challenge.hasRealOdds ? 'text-green-400' : 'text-yellow-400'}>
                                {challenge.hasRealOdds ? '✓ Oui' : '⚠ Estimées'}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Analysis */}
                        <div>
                          <h4 className="font-medium mb-3 flex items-center gap-2">
                            <Activity className="h-4 w-4 text-purple-400" />
                            Analyse
                          </h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Win Probabilité</span>
                              <span className="font-medium">{challenge.winProbability}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Expected Value</span>
                              <span className={challenge.expectedValue > 0 ? 'text-green-400' : 'text-red-400'}>
                                {challenge.expectedValue > 0 ? '+' : ''}{challenge.expectedValue}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Kelly Stake</span>
                              <span className="font-medium">{challenge.kellyStake}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Risque</span>
                              <span className={`flex items-center gap-1 ${riskConfig.color}`}>
                                <RiskIcon className="h-3 w-3" />
                                {riskConfig.label}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Forme</span>
                              <span className={`font-medium ${
                                challenge.factors.formAdvantage === 'home' ? 'text-blue-400' :
                                challenge.factors.formAdvantage === 'away' ? 'text-red-400' : 'text-muted-foreground'
                              }`}>
                                {challenge.factors.formAdvantage === 'home' ? 'Avantage Domicile' :
                                 challenge.factors.formAdvantage === 'away' ? 'Avantage Extérieur' : 'Équilibré'}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Reasoning */}
                        <div>
                          <h4 className="font-medium mb-3 flex items-center gap-2">
                            <Target className="h-4 w-4 text-orange-400" />
                            Raisonnement
                          </h4>
                          <div className="space-y-2">
                            {challenge.reasoning.slice(0, 5).map((reason, i) => (
                              <p key={i} className="text-sm text-muted-foreground">
                                • {reason}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      
      {/* Footer */}
      {!loading && !error && challenges.length > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="py-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground">
                  Affichage de {challenges.length} value bet{challenges.length > 1 ? 's' : ''}
                </span>
                {summary && (
                  <span className="text-muted-foreground">
                    ({summary.realOddsCount} avec cotes réelles)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Mis à jour: {new Date().toLocaleTimeString('fr-FR')}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
