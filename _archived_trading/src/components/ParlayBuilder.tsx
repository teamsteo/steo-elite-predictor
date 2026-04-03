'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Calculator,
  Plus,
  Minus,
  Trash2,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Shield,
  Zap,
  Target,
  Info,
  Copy,
  Share2,
} from 'lucide-react';

// Types
interface ParlaySelection {
  id: string;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  date: string;
  betType: 'home' | 'draw' | 'away' | 'over' | 'under' | 'btts_yes' | 'btts_no';
  odds: number;
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  riskPercentage: number;
  prediction: string;
}

interface ParlayBuilderProps {
  matches?: any[];
}

// Bet type labels
const BET_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  home: { label: 'Victoire Domicile', icon: '🏠' },
  draw: { label: 'Match Nul', icon: '🤝' },
  away: { label: 'Victoire Extérieur', icon: '✈️' },
  over: { label: 'Over 2.5', icon: '⬆️' },
  under: { label: 'Under 2.5', icon: '⬇️' },
  btts_yes: { label: 'BTTS Oui', icon: '✅' },
  btts_no: { label: 'BTTS Non', icon: '❌' },
};

// Sport icons
const SPORT_ICONS: Record<string, string> = {
  Foot: '⚽',
  Football: '⚽',
  Basket: '🏀',
  Basketball: '🏀',
  NHL: '🏒',
  NFL: '🏈',
  Tennis: '🎾',
};

export function ParlayBuilder({ matches: propMatches }: ParlayBuilderProps) {
  const [matches, setMatches] = useState<any[]>([]);
  const [selections, setSelections] = useState<ParlaySelection[]>([]);
  const [stake, setStake] = useState<number>(10);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Fetch matches
  const fetchMatches = useCallback(async () => {
    try {
      const response = await fetch('/api/matches?status=upcoming');
      const data = await response.json();
      setMatches(data.matches || data || []);
    } catch (error) {
      console.error('Error fetching matches:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (propMatches && propMatches.length > 0) {
      setMatches(propMatches);
      setLoading(false);
    } else {
      fetchMatches();
    }
  }, [propMatches, fetchMatches]);

  // Add selection to parlay
  const addSelection = (match: any, betType: ParlaySelection['betType'], odds: number) => {
    // Check if already selected
    const existingIndex = selections.findIndex(
      (s) => s.matchId === match.id && s.betType === betType
    );
    
    if (existingIndex >= 0) {
      // Remove if already exists
      setSelections(selections.filter((_, i) => i !== existingIndex));
      return;
    }

    // Remove other selections from same match (only one bet per match)
    const filtered = selections.filter((s) => s.matchId !== match.id);

    const newSelection: ParlaySelection = {
      id: `sel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      sport: match.sport,
      league: match.league,
      date: match.date,
      betType,
      odds,
      confidence: match.insight?.confidence || 'medium',
      riskPercentage: match.insight?.riskPercentage || 50,
      prediction: `${match.homeTeam} vs ${match.awayTeam} - ${BET_TYPE_LABELS[betType].label}`,
    };

    setSelections([...filtered, newSelection]);
  };

  // Remove selection
  const removeSelection = (id: string) => {
    setSelections(selections.filter((s) => s.id !== id));
  };

  // Clear all selections
  const clearSelections = () => {
    setSelections([]);
  };

  // Calculate combined odds
  const combinedOdds = useMemo(() => {
    if (selections.length === 0) return 1;
    return selections.reduce((acc, sel) => acc * sel.odds, 1);
  }, [selections]);

  // Calculate potential winnings
  const potentialWinnings = useMemo(() => {
    return stake * combinedOdds;
  }, [stake, combinedOdds]);

  // Calculate risk assessment
  const riskAssessment = useMemo(() => {
    if (selections.length === 0) return { level: 'none', score: 0, warnings: [] };

    const avgRisk = selections.reduce((acc, s) => acc + s.riskPercentage, 0) / selections.length;
    const lowConfidenceCount = selections.filter((s) => s.confidence === 'low').length;
    const warnings: string[] = [];

    if (selections.length > 5) {
      warnings.push('⚠️ Plus de 5 sélections - risque élevé');
    }
    if (lowConfidenceCount > 0) {
      warnings.push(`⚠️ ${lowConfidenceCount} sélection(s) avec faible confiance`);
    }
    if (combinedOdds > 10) {
      warnings.push('⚠️ Cote combinée élevée - gains potentiels mais risque important');
    }
    if (avgRisk > 50) {
      warnings.push('⚠️ Risque moyen élevé sur l\'ensemble des sélections');
    }

    let level: 'low' | 'medium' | 'high' | 'very_high' = 'low';
    if (avgRisk > 60 || selections.length > 5 || lowConfidenceCount > 1) {
      level = 'very_high';
    } else if (avgRisk > 45 || selections.length > 3 || lowConfidenceCount > 0) {
      level = 'high';
    } else if (avgRisk > 35 || selections.length > 2) {
      level = 'medium';
    }

    return { level, score: Math.round(avgRisk), warnings };
  }, [selections, combinedOdds]);

  // Kelly Criterion recommendation
  const kellyRecommendation = useMemo(() => {
    if (selections.length === 0 || combinedOdds <= 1) return { stake: 0, percentage: 0 };

    // Simplified Kelly: f = (bp - q) / b
    // where b = odds - 1, p = estimated probability, q = 1 - p
    const avgWinProb = selections.reduce((acc, s) => {
      const prob = s.confidence === 'very_high' ? 0.65 :
                   s.confidence === 'high' ? 0.55 :
                   s.confidence === 'medium' ? 0.45 : 0.35;
      return acc + prob;
    }, 0) / selections.length;

    const b = combinedOdds - 1;
    const kellyFraction = (b * avgWinProb - (1 - avgWinProb)) / b;
    
    // Cap at 10% for safety
    const safeKelly = Math.max(0, Math.min(kellyFraction, 0.10));
    
    return {
      stake: Math.round(safeKelly * 1000) / 10, // percentage
      percentage: safeKelly * 100,
    };
  }, [selections, combinedOdds]);

  // Copy parlay to clipboard
  const copyParlay = () => {
    const text = selections.map((s, i) => 
      `${i + 1}. ${s.prediction} @ ${s.odds.toFixed(2)}`
    ).join('\n');
    
    const fullText = `🎰 COMBINÉ STEO ÉLITE\n\n${text}\n\n📊 Cote combinée: ${combinedOdds.toFixed(2)}\n💰 Mise recommandée: ${kellyRecommendation.stake}% du capital`;
    
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Get available matches for selection (not already fully selected)
  const availableMatches = useMemo(() => {
    const selectedMatchIds = new Set(selections.map((s) => s.matchId));
    return matches.filter((m) => {
      // Show matches that are upcoming and have predictions
      return m.insight && m.oddsHome > 0;
    }).slice(0, 20); // Limit to 20 matches for performance
  }, [matches, selections]);

  // Risk level colors
  const riskColors = {
    low: 'text-green-500 bg-green-500/10 border-green-500/30',
    medium: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30',
    high: 'text-orange-500 bg-orange-500/10 border-orange-500/30',
    very_high: 'text-red-500 bg-red-500/10 border-red-500/30',
    none: 'text-gray-500 bg-gray-500/10 border-gray-500/30',
  };

  return (
    <div className="space-y-4">
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              Parlay Builder
              {selections.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {selections.length} sélection{selections.length > 1 ? 's' : ''}
                </Badge>
              )}
            </CardTitle>
            {selections.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelections}
                className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Effacer
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Two columns on desktop */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Left: Match Selection */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Plus className="h-4 w-4 text-green-500" />
                Sélectionner des matchs
              </h4>
              
              <ScrollArea className="h-64 rounded-lg border border-border/50">
                {loading ? (
                  <div className="p-4 text-center text-muted-foreground">
                    Chargement...
                  </div>
                ) : availableMatches.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    Aucun match disponible
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {availableMatches.map((match) => {
                      const isSelected = selections.some((s) => s.matchId === match.id);
                      const selectedBet = selections.find((s) => s.matchId === match.id);
                      
                      return (
                        <div
                          key={match.id}
                          className={`p-3 transition-colors ${
                            isSelected ? 'bg-primary/5' : 'hover:bg-muted/30'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span>{SPORT_ICONS[match.sport] || '🏟️'}</span>
                              <span className="text-sm font-medium truncate max-w-[150px]">
                                {match.homeTeam} vs {match.awayTeam}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground truncate max-w-[80px]">
                              {match.league}
                            </span>
                          </div>
                          
                          {/* Bet options */}
                          <div className="flex gap-1 flex-wrap">
                            {/* Home win */}
                            <button
                              onClick={() => addSelection(match, 'home', match.oddsHome)}
                              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                                selectedBet?.betType === 'home'
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted hover:bg-muted/80'
                              }`}
                            >
                              1 @ {match.oddsHome.toFixed(2)}
                            </button>
                            
                            {/* Draw */}
                            {match.oddsDraw && (
                              <button
                                onClick={() => addSelection(match, 'draw', match.oddsDraw)}
                                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                                  selectedBet?.betType === 'draw'
                                    ? 'bg-yellow-500 text-white'
                                    : 'bg-muted hover:bg-muted/80'
                                }`}
                              >
                                X @ {match.oddsDraw.toFixed(2)}
                              </button>
                            )}
                            
                            {/* Away win */}
                            <button
                              onClick={() => addSelection(match, 'away', match.oddsAway)}
                              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                                selectedBet?.betType === 'away'
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-muted hover:bg-muted/80'
                              }`}
                            >
                              2 @ {match.oddsAway.toFixed(2)}
                            </button>
                            
                            {/* Over 2.5 */}
                            {match.goalsPrediction?.over25 && (
                              <button
                                onClick={() => addSelection(match, 'over', 1.85)}
                                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                                  selectedBet?.betType === 'over'
                                    ? 'bg-green-500 text-white'
                                    : 'bg-muted hover:bg-muted/80'
                                }`}
                              >
                                O2.5
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Right: Parlay Summary */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Votre combiné
              </h4>

              {selections.length === 0 ? (
                <div className="h-64 flex items-center justify-center border border-dashed border-border/50 rounded-lg">
                  <div className="text-center text-muted-foreground">
                    <Plus className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Sélectionnez des matchs</p>
                    <p className="text-xs mt-1">Cliquez sur les cotes pour ajouter</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Selections list */}
                  <ScrollArea className="h-40 rounded-lg border border-border/50">
                    <div className="divide-y divide-border/50">
                      {selections.map((sel, index) => (
                        <div
                          key={sel.id}
                          className="p-2 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-xs text-muted-foreground w-4">
                              {index + 1}.
                            </span>
                            <span className="text-xs truncate">
                              {SPORT_ICONS[sel.sport] || '🏟️'} {sel.homeTeam} vs {sel.awayTeam}
                            </span>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {BET_TYPE_LABELS[sel.betType].icon} @ {sel.odds.toFixed(2)}
                            </Badge>
                          </div>
                          <button
                            onClick={() => removeSelection(sel.id)}
                            className="p-1 text-red-500 hover:bg-red-500/10 rounded"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>

                  {/* Risk Assessment */}
                  <div className={`p-3 rounded-lg border ${riskColors[riskAssessment.level]}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium">Niveau de risque</span>
                      <span className="text-xs font-bold uppercase">
                        {riskAssessment.level === 'low' ? 'Faible' :
                         riskAssessment.level === 'medium' ? 'Modéré' :
                         riskAssessment.level === 'high' ? 'Élevé' : 'Très élevé'}
                      </span>
                    </div>
                    {riskAssessment.warnings.length > 0 && (
                      <div className="text-xs space-y-1">
                        {riskAssessment.warnings.map((w, i) => (
                          <div key={i}>{w}</div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Combined Odds & Stake */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-muted/30">
                      <div className="text-xs text-muted-foreground mb-1">Cote combinée</div>
                      <div className="text-xl font-bold text-primary">
                        {combinedOdds.toFixed(2)}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30">
                      <div className="text-xs text-muted-foreground mb-1">Mise (€)</div>
                      <Input
                        type="number"
                        value={stake}
                        onChange={(e) => setStake(Number(e.target.value) || 0)}
                        className="h-8 text-lg font-bold"
                        min={1}
                        max={1000}
                      />
                    </div>
                  </div>

                  {/* Potential Winnings */}
                  <div className="p-4 rounded-lg bg-gradient-to-r from-green-500/10 to-primary/10 border border-green-500/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-muted-foreground">Gains potentiels</div>
                        <div className="text-2xl font-bold text-green-500">
                          {potentialWinnings.toFixed(2)} €
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Profit: +{(potentialWinnings - stake).toFixed(2)} €
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Kelly recommandé</div>
                        <div className="text-lg font-bold text-primary">
                          {kellyRecommendation.stake}%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          du capital
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={copyParlay}
                    >
                      {copied ? (
                        <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4 mr-1" />
                      )}
                      {copied ? 'Copié!' : 'Copier'}
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => setShowConfirmDialog(true)}
                      disabled={selections.length < 2}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Valider
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-500">
                <strong>Conseil:</strong> Pour un combiné rentable, limitez-vous à 2-4 sélections 
                avec un taux de confiance élevé. Les combinés à plus de 5 sélections ont 
                statistiquement un taux de réussite très faible.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Confirmer le combiné
            </DialogTitle>
            <DialogDescription>
              Vérifiez votre combiné avant de le valider
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Selections summary */}
            <div className="space-y-2">
              {selections.map((sel, i) => (
                <div key={sel.id} className="flex items-center justify-between text-sm">
                  <span>
                    {i + 1}. {sel.homeTeam} vs {sel.awayTeam}
                  </span>
                  <Badge variant="outline">
                    {BET_TYPE_LABELS[sel.betType].icon} @ {sel.odds.toFixed(2)}
                  </Badge>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Cote combinée:</span>
                <span className="font-bold">{combinedOdds.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Mise:</span>
                <span className="font-bold">{stake.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Gains potentiels:</span>
                <span className="font-bold text-green-500">{potentialWinnings.toFixed(2)} €</span>
              </div>
            </div>

            {/* Warning if high risk */}
            {riskAssessment.level === 'high' || riskAssessment.level === 'very_high' ? (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <div className="flex items-center gap-2 text-red-500">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Risque {riskAssessment.level === 'very_high' ? 'très élevé' : 'élevé'} - Pariez avec prudence
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Annuler
            </Button>
            <Button onClick={() => {
              setShowConfirmDialog(false);
              copyParlay();
            }}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Confirmer & Copier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ParlayBuilder;
