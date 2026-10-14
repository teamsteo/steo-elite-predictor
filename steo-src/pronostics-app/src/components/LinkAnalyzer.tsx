'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Link2, 
  Search, 
  AlertTriangle, 
  CheckCircle, 
  TrendingUp,
  Shield,
  Sparkles,
  Loader2
} from 'lucide-react';
import { useState } from 'react';

interface CouponAnalysis {
  isValid: boolean;
  bookmaker: string;
  totalOdds: number;
  potentialWinnings: number;
  stake: number;
  matches: {
    match: string;
    bet: string;
    odds: number;
    risk: number;
    isValueBet: boolean;
  }[];
  overallRisk: number;
  recommendations: string[];
  warnings: string[];
}

export function LinkAnalyzer() {
  const [link, setLink] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<CouponAnalysis | null>(null);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    if (!link.trim()) {
      setError('Veuillez entrer un lien de coupon');
      return;
    }

    setAnalyzing(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/analyze-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setResult(data);
      } else {
        setError(data.error || 'Erreur lors de l\'analyse');
      }
    } catch (err) {
      setError('Impossible d\'analyser le lien. Vérifiez votre connexion.');
    } finally {
      setAnalyzing(false);
    }
  };

  const getRiskColor = (risk: number) => {
    if (risk <= 35) return 'text-green-500';
    if (risk <= 60) return 'text-orange-500';
    return 'text-red-500';
  };

  return (
    <section id="analyzer" className="scroll-mt-20">
      <Card className="overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-orange-500/5">
        <CardHeader className="border-b border-border/50 bg-gradient-to-r from-orange-500/10 to-transparent">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 rounded-xl bg-orange-500 shrink-0 shadow-lg shadow-orange-500/20">
              <Link2 className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg sm:text-xl text-foreground">Analyseur de Liens</CardTitle>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Auditez vos coupons de paris en un clic
              </p>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-4 sm:p-6">
          {/* Input Section */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Input
                  placeholder="Collez votre lien de coupon ici (Bet365, Betclic, Unibet...)"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  className="pr-10 h-11 border-border/50 focus:border-orange-500 focus:ring-orange-500/20"
                  onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                />
                <Link2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              <Button 
                onClick={handleAnalyze} 
                disabled={analyzing}
                className="h-11 px-6 bg-orange-500 hover:bg-orange-600 text-white font-medium shadow-lg shadow-orange-500/20"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyse...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Analyser
                  </>
                )}
              </Button>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-medium">
                {error}
              </div>
            )}

            {/* Supported bookmakers */}
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground font-medium">Bookmakers:</span>
              {['Bet365', 'Betclic', 'Unibet', 'Bwin', 'Winamax', 'FDJ', 'Zebet'].map((bm) => (
                <Badge key={bm} variant="outline" className="text-[10px] sm:text-xs border-border/50 bg-muted/30">
                  {bm}
                </Badge>
              ))}
            </div>
          </div>

          {/* Results Section */}
          {result && (
            <div className="mt-6 space-y-4">
              {/* Summary Card */}
              <div className="p-4 rounded-xl border border-border/50 bg-gradient-to-br from-muted/30 to-muted/10">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-orange-500 text-white border-0 font-medium">
                      {result.bookmaker}
                    </Badge>
                    <Badge 
                      className={`font-medium border-0 ${
                        result.overallRisk <= 40 
                          ? 'bg-green-500 text-white' 
                          : result.overallRisk <= 60 
                          ? 'bg-orange-500 text-white'
                          : 'bg-red-500 text-white'
                      }`}
                    >
                      Risque: {result.overallRisk}%
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-2 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Mise</p>
                    <p className="text-lg font-bold text-foreground">{result.stake}€</p>
                  </div>
                  <div className="p-2 rounded-lg bg-orange-500/10">
                    <p className="text-xs text-muted-foreground mb-1">Cote totale</p>
                    <p className="text-lg font-bold text-orange-500">{result.totalOdds.toFixed(2)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <p className="text-xs text-muted-foreground mb-1">Gains potentiels</p>
                    <p className="text-lg font-bold text-green-500">{result.potentialWinnings.toFixed(2)}€</p>
                  </div>
                </div>
              </div>

              {/* Matches List */}
              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2 text-foreground">
                  <Shield className="h-4 w-4 text-orange-500" />
                  Sélections analysées
                </h4>
                <ScrollArea className="h-48 rounded-xl border border-border/50 bg-muted/20">
                  <div className="divide-y divide-border/50">
                    {result.matches.map((m, i) => (
                      <div key={i} className="p-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">{m.match}</p>
                          <p className="text-xs text-muted-foreground truncate">{m.bet}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono font-bold text-sm text-foreground">@{m.odds.toFixed(2)}</span>
                          <Badge 
                            variant="outline" 
                            className={`text-xs font-medium ${getRiskColor(m.risk)} border-current/30`}
                          >
                            {m.risk}%
                          </Badge>
                          {m.isValueBet && (
                            <Sparkles className="h-4 w-4 text-green-500" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-red-500">
                    <AlertTriangle className="h-4 w-4" />
                    Alertes
                  </h4>
                  {result.warnings.map((warning, i) => (
                    <div 
                      key={i} 
                      className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-600 dark:text-red-400 font-medium"
                    >
                      {warning}
                    </div>
                  ))}
                </div>
              )}

              {/* Recommendations */}
              {result.recommendations.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-green-500">
                    <CheckCircle className="h-4 w-4" />
                    Recommandations
                  </h4>
                  {result.recommendations.map((rec, i) => (
                    <div 
                      key={i} 
                      className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-700 dark:text-green-400"
                    >
                      {rec}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {!result && !analyzing && (
            <div className="mt-6 text-center py-8 border border-dashed border-border/50 rounded-xl bg-muted/20">
              <div className="mx-auto w-14 h-14 rounded-xl bg-orange-500/10 flex items-center justify-center mb-4">
                <Link2 className="h-7 w-7 text-orange-500/50" />
              </div>
              <p className="text-foreground font-medium mb-1">
                Collez un lien de coupon pour l'analyser
              </p>
              <p className="text-xs text-muted-foreground">
                L'IA détectera les pièges potentiels et vous donnera des conseils
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
