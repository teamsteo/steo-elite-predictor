'use client';

import { Header } from '@/components/Header';
import { SafesDuJour } from '@/components/SafesDuJour';
import { AntiTrap } from '@/components/AntiTrap';
import { Multisports } from '@/components/Multisports';
import { BankrollManager } from '@/components/BankrollManager';
import { LinkAnalyzer } from '@/components/LinkAnalyzer';
import { ApiStatus } from '@/components/ApiStatus';
import { Footer } from '@/components/Footer';
import { BetTypeStats } from '@/components/BetTypeStats';
import { Crown, Shield, Sparkles, Trophy } from 'lucide-react';

interface MainAppProps {
  onLogout?: () => void;
}

export function MainApp({ onLogout }: MainAppProps) {
  return (
    <div className="min-h-screen bg-background">
      <Header onLogout={onLogout} />
      
      <main className="container mx-auto px-4 py-6 space-y-8">
        {/* Hero Section */}
        <section className="text-center py-8 sm:py-12 md:py-16">
          <div className="flex justify-center mb-6">
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
          
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto px-4 mb-8">
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

        {/* Data Source Status */}
        <ApiStatus />

        {/* Main Content */}
        <div className="space-y-8">
          <SafesDuJour />
          <AntiTrap />
          <BetTypeStats />
          <Multisports />
          <BankrollManager />
          <LinkAnalyzer />
        </div>
      </main>

      <Footer />
    </div>
  );
}
