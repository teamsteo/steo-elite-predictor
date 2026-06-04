/**
 * Script de Pré-Calcul Simplifié des Conseils Expert
 * Version rapide sans Web Search - À utiliser pour les tests/initialisation
 */

import * as fs from 'fs';
import * as path from 'path';

// Données de test pour validation du système
const testData = {
  generatedAt: new Date().toISOString(),
  phase: new Date().getUTCHours() >= 10 && new Date().getUTCHours() < 22 ? 'football' : 'basketball',
  nextReset: new Date().getUTCHours() >= 10 && new Date().getUTCHours() < 22 ? '22h00 UTC' : '10h00 UTC',
  totalAdvices: 3,
  stats: {
    football: 5,
    basketball: 3
  },
  advices: [
    {
      matchId: 'test-foot-1',
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      sport: 'Foot',
      league: 'Premier League',
      unifiedContext: {
        sourcesUsed: ['ESPN', 'FBref'],
        dataQuality: 75,
        overallAdvantage: 'home',
        keyFactors: ['Forme domicile Arsenal excellente', 'Chelsea en baisse']
      },
      context: {
        recentNews: ['Arsenal en bonne forme'],
        injuries: { home: [], away: ['Joueur clé blessé'] },
        form: { home: 'WWWDW', away: 'LLDWW' }
      },
      oddsAnalysis: {
        favorite: 'Arsenal',
        favoriteOdds: 1.85,
        edge: 8.5,
        publicPercentage: 65,
        isPublicFade: false
      },
      recommendation: {
        bet: 'home',
        confidence: 'high',
        reasoning: [
          'Arsenal en excellente forme à domicile',
          'Chelsea affaibli par les blessures',
          'Edge positif détecté sur les cotes'
        ],
        kellyStake: 3,
        maxStake: 5,
        expectedValue: 12.5
      },
      warnings: ['Vérifier la composition avant le match'],
      dataQuality: 'high'
    },
    {
      matchId: 'test-foot-2',
      homeTeam: 'Real Madrid',
      awayTeam: 'Barcelona',
      sport: 'Foot',
      league: 'La Liga',
      unifiedContext: {
        sourcesUsed: ['ESPN', 'FBref'],
        dataQuality: 80,
        overallAdvantage: 'neutral',
        keyFactors: ['Classico - match serré attendu']
      },
      context: {
        recentNews: ['Classico intense attendu'],
        injuries: { home: [], away: [] },
        form: { home: 'WWWDW', away: 'WDWWW' }
      },
      oddsAnalysis: {
        favorite: 'Real Madrid',
        favoriteOdds: 2.10,
        edge: 2.5,
        publicPercentage: 55,
        isPublicFade: false
      },
      recommendation: {
        bet: 'avoid',
        confidence: 'low',
        reasoning: [
          'Match trop serré pour un pari价值',
          'Classico imprévisible',
          'Edge insuffisant'
        ],
        kellyStake: 0,
        maxStake: 1,
        expectedValue: -2.0
      },
      warnings: ['Match à risque élevé - éviter'],
      dataQuality: 'high'
    },
    {
      matchId: 'test-foot-3',
      homeTeam: 'Bayern Munich',
      awayTeam: 'Dortmund',
      sport: 'Foot',
      league: 'Bundesliga',
      unifiedContext: {
        sourcesUsed: ['ESPN', 'FBref'],
        dataQuality: 70,
        overallAdvantage: 'home',
        keyFactors: ['Bayern dominateur à domicile', 'Dortmund en confiance']
      },
      context: {
        recentNews: ['Derby allemand'],
        injuries: { home: ['Défenseur absent'], away: [] },
        form: { home: 'WWWWW', away: 'WWDLW' }
      },
      oddsAnalysis: {
        favorite: 'Bayern Munich',
        favoriteOdds: 1.55,
        edge: 5.2,
        publicPercentage: 70,
        isPublicFade: true
      },
      recommendation: {
        bet: 'home',
        confidence: 'medium',
        reasoning: [
          'Bayern très fort à domicile',
          'Mais attention au public fade',
          'Value limitée'
        ],
        kellyStake: 2,
        maxStake: 3,
        expectedValue: 6.8
      },
      warnings: ['Public fade détecté - réduire la mise'],
      dataQuality: 'medium'
    }
  ],
  _note: 'DONNÉES DE TEST - Exécutez bun run scripts/precalc-expert.ts pour générer les vrais conseils'
};

// Créer le dossier data si nécessaire
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Sauvegarder
const outputPath = path.join(dataDir, 'expert-advices.json');
fs.writeFileSync(outputPath, JSON.stringify(testData, null, 2));

console.log('✅ Fichier de test créé: data/expert-advices.json');
console.log('📊 3 conseils de test générés');
console.log('');
console.log('⚠️ IMPORTANT: Ce sont des données de test!');
console.log('Pour générer les vrais conseils, exécutez:');
console.log('  bun run scripts/precalc-expert.ts');
