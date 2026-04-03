'use client';

import { useState } from 'react';
import { Header } from '@/components/Header';
import { SafesDuJour } from '@/components/SafesDuJour';
import { AntiTrap } from '@/components/AntiTrap';
import { Multisports } from '@/components/Multisports';
import { BankrollManager } from '@/components/BankrollManager';
import { LinkAnalyzer } from '@/components/LinkAnalyzer';
import { ApiStatus } from '@/components/ApiStatus';
import { Footer } from '@/components/Footer';
import { BetTypeStats } from '@/components/BetTypeStats';
import { AnalyticsDashboard } from '@/components/AnalyticsDashboard';
import { StatsTab } from '@/components/StatsTab';
import { ExportManager } from '@/components/ExportManager';
import { ParlayBuilder } from '@/components/ParlayBuilder';
import { NotificationManager } from '@/components/NotificationManager';
import { Crown, Shield, Sparkles, Trophy, BarChart3, Calculator, Download, Bell, PieChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface MainAppProps {
  onLogout?: () => void;
}

type TabType = 'pronos' | 'stats' | 'analytics' | 'parlay' | 'tools';

export function MainApp({ onLogout }: MainAppProps) {
  const [activeTab, setActiveTab] = useState<TabType>('pronos');

  return (
    <div className="min-h-screen bg-background">
      <Header onLogout={onLogout} />
      
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Hero Section */}
        <section className="text-center py-6 sm:py-8 md:py-10">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div className="absolute inset-0 bg-orange-500/30 blur-3xl rounded-full" />
              <div className="relative p-4 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-2xl shadow-orange-500/30">
                <Crown className="h-12 w-12 sm:h-14 sm:w-14 text-white" />
              </div>
            </div>
          </div>
          
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 px-4">
            <span className="bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
              Steo Élite Predictor
            </span>
          </h1>
          
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto px-4 mb-6">
            Analyses statistiques intelligentes, détection de{' '}
            <span className="text-green-500 font-semibold">Value Bets</span> et gestion optimale de votre bankroll
          </p>
          
          {/* Quick Stats */}
          <div className="flex flex-wrap justify-center gap-3 sm:gap-4 px-4">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
              <Shield className="h-4 w-4 text-green-500" />
              <span className="text-green-600 dark:text-green-400 font-semibold text-sm">Risque 20-30%</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20">
              <Sparkles className="h-4 w-4 text-orange-500" />
              <span className="text-orange-600 dark:text-orange-400 font-semibold text-sm">IA Intégrée</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <Trophy className="h-4 w-4 text-blue-500" />
              <span className="text-blue-600 dark:text-blue-400 font-semibold text-sm">Multi-sports</span>
            </div>
          </div>
        </section>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap justify-center gap-2 px-4">
          <Button
            variant={activeTab === 'pronos' ? 'default' : 'outline'}
            onClick={() => setActiveTab('pronos')}
            className={`gap-2 ${activeTab === 'pronos' ? 'bg-primary text-primary-foreground' : ''}`}
          >
            <Trophy className="h-4 w-4" />
            Pronostics
          </Button>
          <Button
            variant={activeTab === 'stats' ? 'default' : 'outline'}
            onClick={() => setActiveTab('stats')}
            className={`gap-2 ${activeTab === 'stats' ? 'bg-primary text-primary-foreground' : ''}`}
          >
            <PieChart className="h-4 w-4" />
            Stats
          </Button>
          <Button
            variant={activeTab === 'analytics' ? 'default' : 'outline'}
            onClick={() => setActiveTab('analytics')}
            className={`gap-2 ${activeTab === 'analytics' ? 'bg-primary text-primary-foreground' : ''}`}
          >
            <BarChart3 className="h-4 w-4" />
            Analytics
          </Button>
          <Button
            variant={activeTab === 'parlay' ? 'default' : 'outline'}
            onClick={() => setActiveTab('parlay')}
            className={`gap-2 ${activeTab === 'parlay' ? 'bg-primary text-primary-foreground' : ''}`}
          >
            <Calculator className="h-4 w-4" />
            Combinés
            <Badge variant="secondary" className="ml-1 text-xs">NEW</Badge>
          </Button>
          <Button
            variant={activeTab === 'tools' ? 'default' : 'outline'}
            onClick={() => setActiveTab('tools')}
            className={`gap-2 ${activeTab === 'tools' ? 'bg-primary text-primary-foreground' : ''}`}
          >
            <Download className="h-4 w-4" />
            Outils
            <Badge variant="secondary" className="ml-1 text-xs">NEW</Badge>
          </Button>
        </div>

        {/* Data Source Status */}
        <ApiStatus />

        {/* Tab Content */}
        {activeTab === 'pronos' && (
          <div className="space-y-8">
            <SafesDuJour />
            <AntiTrap />
            <BetTypeStats />
            <Multisports />
            <BankrollManager />
            <LinkAnalyzer />
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="space-y-6">
            <StatsTab />
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <AnalyticsDashboard />
          </div>
        )}

        {activeTab === 'parlay' && (
          <div className="space-y-6">
            <ParlayBuilder />
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="space-y-6 grid md:grid-cols-2 gap-6">
            <ExportManager />
            <NotificationManager />
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
