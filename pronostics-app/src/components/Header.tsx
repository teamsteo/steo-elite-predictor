'use client';

import Link from 'next/link';
import { Crown, Shield, TrendingUp, Trophy, Wallet, Link2, LogOut, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

const navItems = [
  { href: '#safes', label: 'Safes', icon: Shield },
  { href: '#antitrap', label: 'Anti-Trap', icon: TrendingUp },
  { href: '#multisports', label: 'Multisports', icon: Trophy },
  { href: '#bankroll', label: 'Bankroll', icon: Wallet },
  { href: '#analyzer', label: 'Analyseur', icon: Link2 },
];

interface HeaderProps {
  onLogout?: () => void;
}

export function Header({ onLogout }: HeaderProps) {
  const [apiStatus, setApiStatus] = useState<'loading' | 'online' | 'offline'>('loading');

  // Vérifier le statut de l'API
  useEffect(() => {
    const checkApiStatus = async () => {
      try {
        const response = await fetch('/api/real-odds');
        const data = await response.json();
        const hasRealApi = data?.apiStatus?.some((api: any) => api.enabled);
        setApiStatus(hasRealApi ? 'online' : 'offline');
      } catch {
        setApiStatus('offline');
      }
    };
    checkApiStatus();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Ignorer les erreurs
    }
    onLogout?.();
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/95 backdrop-blur-xl shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative shrink-0">
              <div className="absolute inset-0 bg-orange-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative p-2 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg shadow-orange-500/20">
                <Crown className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
            </div>

            <div className="flex flex-col">
              <span className="text-lg sm:text-xl font-bold text-orange-500 tracking-tight">
                Steo Élite
              </span>
              <div className="flex items-center gap-2 -mt-0.5">
                <span className="text-[10px] sm:text-[10px] text-muted-foreground tracking-wider uppercase font-medium">
                  Sports Predictor
                </span>
                {/* Indicateur API compact et ergonomique */}
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all ${
                  apiStatus === 'loading' 
                    ? 'bg-muted text-muted-foreground' 
                    : apiStatus === 'online' 
                      ? 'bg-green-500/15 text-green-500 border border-green-500/20' 
                      : 'bg-red-500/15 text-red-400 border border-red-500/20'
                }`}>
                  {apiStatus === 'loading' ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : apiStatus === 'online' ? (
                    <Wifi className="h-2.5 w-2.5" />
                  ) : (
                    <WifiOff className="h-2.5 w-2.5" />
                  )}
                  <span className="hidden sm:inline">
                    {apiStatus === 'loading' ? '...' : apiStatus === 'online' ? 'API' : 'OFF'}
                  </span>
                </div>
              </div>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg text-muted-foreground hover:text-orange-500 hover:bg-orange-500/5 transition-all"
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Logout Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-muted-foreground hover:text-red-500 hover:bg-red-500/5"
          >
            <LogOut className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Déconnexion</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
