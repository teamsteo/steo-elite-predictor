'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Flame } from 'lucide-react';

export function ChallengesTab() {
  return (
    <div className="space-y-6">
      {/* Message simple de test */}
      <Card className="border-orange-500/50 bg-gradient-to-br from-orange-500/10 to-orange-600/5">
        <CardContent className="py-8">
          <div className="flex flex-col items-center space-y-4 text-center">
            <Flame className="h-16 w-16 text-orange-500 animate-pulse" />
            <h2 className="text-2xl font-bold text-orange-500">
              Challenges Négligés
            </h2>
            <p className="text-muted-foreground">
              ✅ L'onglet fonctionne correctement !
            </p>
            <p className="text-sm text-green-500 font-medium">
              Module opérationnel
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Cartes de stats simples */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-green-500/10 border-green-500/20">
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-green-500">5</p>
            <p className="text-sm text-muted-foreground">Value Bets</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-500/10 border-blue-500/20">
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-blue-500">3</p>
            <p className="text-sm text-muted-foreground">Championnats</p>
          </CardContent>
        </Card>
      </div>

      {/* Message d'info */}
      <Card>
        <CardContent className="py-4">
          <p className="text-center text-muted-foreground">
            🎯 Tennis • ⚽ Football • 🏀 Basketball
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
