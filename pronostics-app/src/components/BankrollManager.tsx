'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  Minus, 
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  RefreshCw,
  PiggyBank,
  RotateCcw
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  createdAt: string;
}

interface BankrollData {
  balance: number;
  transactions: Transaction[];
  stats: {
    totalDeposits: number;
    totalBets: number;
    totalWinnings: number;
    totalWithdrawals: number;
    profit: number;
    roi: number;
  };
}

const transactionTypes = [
  { value: 'deposit', label: 'Dépôt', icon: Plus, color: 'text-green-500' },
  { value: 'bet', label: 'Pari', icon: Minus, color: 'text-red-500' },
  { value: 'winning', label: 'Gain', icon: TrendingUp, color: 'text-green-500' },
  { value: 'withdrawal', label: 'Retrait', icon: Minus, color: 'text-orange-500' },
];

const USER_ID = 'default-user';

export function BankrollManager() {
  const [data, setData] = useState<BankrollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    amount: '',
    type: 'deposit',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    if (!confirm('Êtes-vous sûr de vouloir réinitialiser votre bankroll à 0€ ?\nCette action supprimera tout l\'historique.')) return;
    
    setResetting(true);
    try {
      await fetch('/api/bankroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      await fetchBankroll();
    } catch (error) {
      console.error('Error resetting bankroll:', error);
    } finally {
      setResetting(false);
    }
  };

  const fetchBankroll = useCallback(async () => {
    try {
      const response = await fetch(`/api/bankroll?userId=${USER_ID}`);
      const bankrollData = await response.json();
      setData(bankrollData);
    } catch (error) {
      console.error('Error fetching bankroll:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBankroll();
  }, [fetchBankroll]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount) return;

    setSubmitting(true);
    try {
      await fetch('/api/bankroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: USER_ID,
          amount: parseFloat(formData.amount),
          type: formData.type,
          description: formData.description || null,
        }),
      });
      
      setFormData({ amount: '', type: 'deposit', description: '' });
      setDialogOpen(false);
      await fetchBankroll();
    } catch (error) {
      console.error('Error adding transaction:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTransactionIcon = (type: string) => {
    const config = transactionTypes.find(t => t.value === type);
    return config?.icon || DollarSign;
  };

  const getTransactionColor = (type: string) => {
    const config = transactionTypes.find(t => t.value === type);
    return config?.color || 'text-muted-foreground';
  };

  return (
    <section id="bankroll" className="scroll-mt-20">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
        <CardHeader className="border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">Bankroll Manager</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Gérez votre capital de paris
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setLoading(true); fetchBankroll(); }}
                disabled={loading}
                className="h-8 w-8"
                title="Actualiser"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleReset}
                disabled={resetting}
                className="h-8 w-8 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10"
                title="Réinitialiser à 0€"
              >
                <RotateCcw className={`h-4 w-4 ${resetting ? 'animate-spin' : ''}`} />
              </Button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-primary hover:bg-primary/90">
                    <Plus className="h-4 w-4 mr-1" />
                    Transaction
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Ajouter une transaction</DialogTitle>
                    <DialogDescription>
                      Enregistrez une nouvelle opération sur votre bankroll
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit}>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="type">Type</Label>
                        <Select
                          value={formData.type}
                          onValueChange={(value) => setFormData({ ...formData, type: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {transactionTypes.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                <span className={type.color}>{type.label}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="amount">Montant (€)</Label>
                        <Input
                          id="amount"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.amount}
                          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="description">Description (optionnel)</Label>
                        <Input
                          id="description"
                          placeholder="Ex: Dépôt initial, Pari PSG vs OM..."
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={submitting || !formData.amount}>
                        {submitting ? 'Enregistrement...' : 'Enregistrer'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          {loading ? (
            <div className="space-y-4">
              <div className="h-24 rounded-lg bg-muted animate-pulse" />
              <div className="grid grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            </div>
          ) : data ? (
            <>
              {/* Balance Card */}
              <div className="p-6 rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Solde actuel</p>
                    <p className="text-4xl font-bold text-primary">
                      {formatCurrency(data.balance)}
                    </p>
                  </div>
                  <div className="p-4 rounded-full bg-primary/10">
                    <PiggyBank className="h-8 w-8 text-primary" />
                  </div>
                </div>
                {data.stats.roi !== 0 && (
                  <div className="mt-4 flex items-center gap-2">
                    {data.stats.roi > 0 ? (
                      <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                        <ArrowUpRight className="h-3 w-3 mr-1" />
                        +{data.stats.roi.toFixed(1)}% ROI
                      </Badge>
                    ) : (
                      <Badge className="bg-red-500/10 text-red-500 border-red-500/20">
                        <ArrowDownRight className="h-3 w-3 mr-1" />
                        {data.stats.roi.toFixed(1)}% ROI
                      </Badge>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {data.stats.profit > 0 ? '+' : ''}{formatCurrency(data.stats.profit)} de profit
                    </span>
                  </div>
                )}
              </div>

              {/* Stats Grid */}
              <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-6">
                <div className="p-4 rounded-lg border border-border/50 bg-muted/30">
                  <div className="flex items-center gap-2 text-green-500 mb-2">
                    <Plus className="h-4 w-4" />
                    <span className="text-xs text-muted-foreground">Dépôts</span>
                  </div>
                  <p className="text-lg font-semibold">{formatCurrency(data.stats.totalDeposits)}</p>
                </div>
                <div className="p-4 rounded-lg border border-border/50 bg-muted/30">
                  <div className="flex items-center gap-2 text-red-500 mb-2">
                    <Minus className="h-4 w-4" />
                    <span className="text-xs text-muted-foreground">Paris</span>
                  </div>
                  <p className="text-lg font-semibold">{formatCurrency(data.stats.totalBets)}</p>
                </div>
                <div className="p-4 rounded-lg border border-border/50 bg-muted/30">
                  <div className="flex items-center gap-2 text-green-500 mb-2">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-xs text-muted-foreground">Gains</span>
                  </div>
                  <p className="text-lg font-semibold">{formatCurrency(data.stats.totalWinnings)}</p>
                </div>
                <div className="p-4 rounded-lg border border-border/50 bg-muted/30">
                  <div className="flex items-center gap-2 text-orange-500 mb-2">
                    <Minus className="h-4 w-4" />
                    <span className="text-xs text-muted-foreground">Retraits</span>
                  </div>
                  <p className="text-lg font-semibold">{formatCurrency(data.stats.totalWithdrawals)}</p>
                </div>
              </div>

              {/* Transaction History */}
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Historique des transactions
                </h4>
                <ScrollArea className="h-64 rounded-lg border border-border/50">
                  {data.transactions.length > 0 ? (
                    <div className="divide-y divide-border/50">
                      {data.transactions.map((tx) => {
                        const Icon = getTransactionIcon(tx.type);
                        const colorClass = getTransactionColor(tx.type);
                        const isNegative = tx.type === 'bet' || tx.type === 'withdrawal';
                        
                        return (
                          <div key={tx.id} className="p-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg bg-muted ${colorClass}`}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="font-medium text-sm capitalize">{tx.type}</p>
                                <p className="text-xs text-muted-foreground">
                                  {tx.description || 'Pas de description'}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-semibold ${colorClass}`}>
                                {isNegative ? '-' : '+'}{formatCurrency(tx.amount)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(tx.createdAt)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <Wallet className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                      <p className="text-muted-foreground">Aucune transaction</p>
                    </div>
                  )}
                </ScrollArea>
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <Wallet className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">Impossible de charger les données</p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
