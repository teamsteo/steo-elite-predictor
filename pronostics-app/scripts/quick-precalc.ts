/**
 * Script de Pré-Calcul Rapide des Conseils Expert
 * Version simplifiée sans Web Search pour validation
 */

import { getCrossValidatedMatches } from '../src/lib/crossValidation';
import { generateExpertAdvice, ExpertAdvice } from '../src/lib/expertAdvisor';
import * as fs from 'fs';
import * as path from 'path';

const MAX_MATCHES = 5;
const TIMEOUT_MS = 5000;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🚀 Pré-Calcul Rapide des Conseils Expert');
  console.log('========================================');
  console.log(`📅 ${new Date().toISOString()}\n`);

  try {
    // 1. Récupérer les matchs
    console.log('📊 Récupération des matchs...');
    const { matches } = await getCrossValidatedMatches();
    console.log(`✅ ${matches.length} matchs récupérés\n`);

    if (matches.length === 0) {
      console.log('⚠️ Aucun match disponible');
      return;
    }

    // 2. Sélectionner les matchs
    const now = new Date();
    const hour = now.getUTCHours();
    const isNotFinished = (m: any) => m.status !== 'finished';
    
    const footballMatches = matches.filter(m => 
      (m.sport === 'Foot' || m.sport === 'Football') && isNotFinished(m)
    );
    const basketballMatches = matches.filter(m => 
      (m.sport === 'Basket' || m.sport === 'Basketball') && isNotFinished(m)
    );

    let phase: 'football' | 'basketball';
    let selectedMatches: any[];

    if (hour >= 10 && hour < 22) {
      phase = 'football';
      selectedMatches = footballMatches.slice(0, MAX_MATCHES);
    } else {
      phase = 'basketball';
      selectedMatches = basketballMatches.slice(0, MAX_MATCHES);
    }

    console.log(`📊 Phase: ${phase}`);
    console.log(`📊 ${selectedMatches.length} matchs à analyser\n`);

    if (selectedMatches.length === 0) {
      // Créer des conseils vides mais valides
      const emptyData = {
        generatedAt: new Date().toISOString(),
        phase,
        nextReset: phase === 'football' ? '22h00 UTC' : '10h00 UTC',
        totalAdvices: 0,
        stats: { football: footballMatches.length, basketball: basketballMatches.length },
        advices: []
      };
      
      const outputPath = path.join(process.cwd(), 'data', 'expert-advices.json');
      fs.writeFileSync(outputPath, JSON.stringify(emptyData, null, 2));
      console.log('✅ Fichier créé (aucun match à analyser)');
      return;
    }

    // 3. Analyser avec timeout court
    console.log('🔍 Analyse des matchs...');
    const advices: ExpertAdvice[] = [];

    for (const match of selectedMatches) {
      try {
        process.stdout.write(`  ⏳ ${match.homeTeam} vs ${match.awayTeam}... `);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        
        try {
          const advice = await generateExpertAdvice({
            id: match.id,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            sport: match.sport,
            league: match.league,
            oddsHome: match.oddsHome,
            oddsDraw: match.oddsDraw,
            oddsAway: match.oddsAway,
          }, { trackPrediction: false });
          
          clearTimeout(timeoutId);
          advices.push(advice);
          console.log(`✅ Edge: ${advice.oddsAnalysis.edge}%`);
        } catch (e) {
          clearTimeout(timeoutId);
          console.log(`⏱️ Timeout`);
        }
      } catch (error) {
        console.log(`❌ Erreur`);
      }
    }

    // 4. Trier par edge
    advices.sort((a, b) => b.oddsAnalysis.edge - a.oddsAnalysis.edge);

    // 5. Sauvegarder
    const outputData = {
      generatedAt: new Date().toISOString(),
      phase,
      nextReset: phase === 'football' ? '22h00 UTC' : '10h00 UTC',
      totalAdvices: advices.length,
      stats: { football: footballMatches.length, basketball: basketballMatches.length },
      advices
    };

    const outputPath = path.join(process.cwd(), 'data', 'expert-advices.json');
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));

    console.log(`\n✅ ${advices.length} conseils sauvegardés dans data/expert-advices.json`);
    
    // Résumé
    console.log('\n📋 Résumé:');
    advices.forEach((a, i) => {
      console.log(`${i + 1}. ${a.homeTeam} vs ${a.awayTeam} - Edge: ${a.oddsAnalysis.edge}%`);
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
  }
}

main();
