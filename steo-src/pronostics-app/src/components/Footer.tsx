'use client';

import Link from 'next/link';
import { Crown, Github, Twitter, Mail, Heart } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-border/40 bg-gradient-to-b from-background to-muted/30">
      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <Crown className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold text-gold-gradient">Steo Élite Predictor</span>
            </Link>
            <p className="text-sm text-muted-foreground max-w-md">
              Application de pronostics sportifs intelligents propulsée par l'intelligence artificielle. 
              Analyses statistiques avancées, détection de Value Bets et gestion optimale de bankroll.
              Développée par Steo.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">
              Navigation
            </h4>
            <ul className="space-y-2">
              {[
                { href: '#safes', label: 'Safes du Jour' },
                { href: '#antitrap', label: 'Anti-Trap' },
                { href: '#multisports', label: 'Multisports' },
                { href: '#bankroll', label: 'Bankroll' },
                { href: '#analyzer', label: 'Analyseur' },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Sports */}
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">
              Sports
            </h4>
            <ul className="space-y-2">
              {[
                { icon: '⚽', label: 'Football' },
                { icon: '🏀', label: 'NBA' },
                { icon: '🏒', label: 'NHL' },
                { icon: '🏒', label: 'AHL' },
              ].map((sport) => (
                <li key={sport.label}>
                  <span className="text-sm text-muted-foreground">
                    {sport.icon} {sport.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-8 pt-8 border-t border-border/40 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Steo Élite Predictor. Tous droits réservés.
          </p>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            Fait avec <Heart className="h-4 w-4 text-red-500" /> pour les parieurs stratégiques
          </p>
        </div>

        {/* Disclaimer */}
        <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border/40">
          <p className="text-xs text-muted-foreground text-center">
            ⚠️ <strong>Avertissement:</strong> Les paris sportifs comportent des risques. Jouez de manière responsable. 
            Cette application fournit des analyses basées sur des algorithmes et ne garantit pas les résultats. 
            Ne misez jamais plus que ce que vous pouvez vous permettre de perdre. Interdit aux moins de 18 ans.
          </p>
        </div>
      </div>
    </footer>
  );
}
