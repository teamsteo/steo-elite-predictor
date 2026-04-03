/**
 * Récupération des matchs réels depuis ESPN (gratuit, sans API key)
 * Génère des pronostics basés sur les vrais matchs du jour
 */

import * as fs from 'fs';
import * as path from 'path';

const PREDICTIONS_FILE = path.join(process.cwd(), 'data/predictions.json');

interface ESPNTeam {
  id: string;
  name: string;
  displayName: string;
  abbreviation: string;
}

interface ESPNEvent {
  id: string;
  name: string;
  date: string;
  status: { type: { completed: boolean } };
  competitions: Array<{
    competitors: Array<{
      homeAway: 'home' | 'away';
      team: ESPNTeam;
      score?: string;
      records?: Array<{ summary: string }>;
    }>;
  }>;
}

interface Prediction {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport: string;
  matchDate: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  predictedResult: string;
  predictedGoals: string | null;
  confidence: string;
  riskPercentage: number;
  status: 'pending' | 'completed';
  createdAt: string;
}

// Calculer des cotes simulées basées sur les stats
function calculateOdds(homeRecord?: string, awayRecord?: string): { home: number; draw: number; away: number } {
  // Parse les records (ex: "35-28" -> wins=35, losses=28)
  const parseRecord = (record?: string) => {
    if (!record) return 0.5;
    const parts = record.split('-').map(Number);
    const wins = parts[0] || 0;
    const losses = parts[1] || 0;
    const total = wins + losses;
    return total > 0 ? wins / total : 0.5;
  };

  const homeWinRate = parseRecord(homeRecord);
  const awayWinRate = parseRecord(awayRecord);

  // Calculer les probabilités
  const homeStrength = (homeWinRate + 0.1) * 1.1; // Avantage domicile
  const awayStrength = awayWinRate;

  const totalStrength = homeStrength + awayStrength + 0.25; // 0.25 pour le nul
  const homeProb = homeStrength / totalStrength;
  const drawProb = 0.25 / totalStrength;
  const awayProb = awayStrength / totalStrength;

  // Convertir en cotes
  const homeOdds = Math.max(1.1, Math.min(10, 1 / homeProb));
  const drawOdds = Math.max(2.5, Math.min(6, 1 / drawProb));
  const awayOdds = Math.max(1.1, Math.min(10, 1 / awayProb));

  return { home: homeOdds, draw: drawOdds, away: awayOdds };
}

// Générer un pronostic basé sur les cotes
function generatePrediction(homeTeam: string, awayTeam: string, odds: { home: number; draw: number; away: number }, sport: string): {
  predictedResult: string;
  predictedGoals: string | null;
  confidence: string;
  riskPercentage: number;
} {
  const { home, draw, away } = odds;

  // Déterminer le favori
  let predictedResult: string;
  let confidence: string;
  let riskPercentage: number;

  if (home < away - 0.5) {
    predictedResult = 'home';
    if (home < 1.5) {
      confidence = 'very_high';
      riskPercentage = 15;
    } else if (home < 2.0) {
      confidence = 'high';
      riskPercentage = 25;
    } else {
      confidence = 'medium';
      riskPercentage = 35;
    }
  } else if (away < home - 0.5) {
    predictedResult = 'away';
    if (away < 1.5) {
      confidence = 'very_high';
      riskPercentage = 15;
    } else if (away < 2.0) {
      confidence = 'high';
      riskPercentage = 25;
    } else {
      confidence = 'medium';
      riskPercentage = 35;
    }
  } else {
    // Match serré
    if (draw < 3.0) {
      predictedResult = 'draw';
      confidence = 'medium';
      riskPercentage = 40;
    } else {
      predictedResult = home < away ? 'home' : 'away';
      confidence = 'low';
      riskPercentage = 45;
    }
  }

  // Prédiction de buts (football uniquement)
  let predictedGoals: string | null = null;
  if (sport === 'Foot') {
    const totalOdds = home + away;
    if (totalOdds < 4) {
      predictedGoals = 'Over 2.5 buts';
    } else if (totalOdds > 6) {
      predictedGoals = 'Under 2.5 buts';
    } else {
      predictedGoals = 'Les deux marquent';
    }
  }

  return { predictedResult, predictedGoals, confidence, riskPercentage };
}

// Récupérer les matchs NBA
async function fetchNBAMatches(): Promise<Prediction[]> {
  const predictions: Prediction[] = [];

  try {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const response = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${today}`
    );

    if (!response.ok) return predictions;

    const data = await response.json();
    const events: ESPNEvent[] = data.events || [];

    for (const event of events) {
      // Skip les matchs terminés
      if (event.status?.type?.completed) continue;

      const homeCompetitor = event.competitions[0]?.competitors.find(c => c.homeAway === 'home');
      const awayCompetitor = event.competitions[0]?.competitors.find(c => c.homeAway === 'away');

      if (!homeCompetitor || !awayCompetitor) continue;

      const homeTeam = homeCompetitor.team.displayName;
      const awayTeam = awayCompetitor.team.displayName;
      const homeRecord = homeCompetitor.records?.[0]?.summary;
      const awayRecord = awayCompetitor.records?.[0]?.summary;

      const odds = calculateOdds(homeRecord, awayRecord);
      const prediction = generatePrediction(homeTeam, awayTeam, odds, 'Basket');

      predictions.push({
        matchId: `nba_${event.id}`,
        homeTeam,
        awayTeam,
        league: 'NBA',
        sport: 'Basket',
        matchDate: event.date,
        oddsHome: Math.round(odds.home * 100) / 100,
        oddsDraw: null,
        oddsAway: Math.round(odds.away * 100) / 100,
        ...prediction,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    }

    console.log(`🏀 ${predictions.length} matchs NBA`);
  } catch (error) {
    console.error('Erreur NBA:', error);
  }

  return predictions;
}

// Récupérer les matchs Football
async function fetchFootballMatches(): Promise<Prediction[]> {
  const predictions: Prediction[] = [];
  const leagues = [
    { code: 'eng.1', name: 'Premier League' },
    { code: 'esp.1', name: 'La Liga' },
    { code: 'ger.1', name: 'Bundesliga' },
    { code: 'ita.1', name: 'Serie A' },
    { code: 'fra.1', name: 'Ligue 1' },
    { code: 'uefa.champions', name: 'Champions League' },
    { code: 'uefa.europa', name: 'Europa League' },
    { code: 'uefa.europa.conf', name: 'Conference League' },
  ];

  try {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');

    for (const league of leagues) {
      try {
        const response = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.code}/scoreboard?dates=${today}`
        );

        if (!response.ok) continue;

        const data = await response.json();
        const events: ESPNEvent[] = data.events || [];

        for (const event of events) {
          if (event.status?.type?.completed) continue;

          const homeCompetitor = event.competitions[0]?.competitors.find(c => c.homeAway === 'home');
          const awayCompetitor = event.competitions[0]?.competitors.find(c => c.homeAway === 'away');

          if (!homeCompetitor || !awayCompetitor) continue;

          const homeTeam = homeCompetitor.team.displayName;
          const awayTeam = awayCompetitor.team.displayName;

          // Pour le football, on n'a pas les records, on simule des cotes
          const odds = {
            home: 1.8 + Math.random() * 2,
            draw: 3.0 + Math.random() * 1.5,
            away: 1.8 + Math.random() * 2,
          };

          const prediction = generatePrediction(homeTeam, awayTeam, odds, 'Foot');

          predictions.push({
            matchId: `fb_${event.id}`,
            homeTeam,
            awayTeam,
            league: league.name,
            sport: 'Foot',
            matchDate: event.date,
            oddsHome: Math.round(odds.home * 100) / 100,
            oddsDraw: Math.round(odds.draw * 100) / 100,
            oddsAway: Math.round(odds.away * 100) / 100,
            ...prediction,
            status: 'pending',
            createdAt: new Date().toISOString(),
          });
        }
      } catch (e) {
        // Continue avec les autres ligues
      }
    }

    console.log(`⚽ ${predictions.length} matchs Football`);
  } catch (error) {
    console.error('Erreur Football:', error);
  }

  return predictions;
}

// Récupérer les matchs NHL
async function fetchNHLMatches(): Promise<Prediction[]> {
  const predictions: Prediction[] = [];

  try {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const response = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${today}`
    );

    if (!response.ok) return predictions;

    const data = await response.json();
    const events: ESPNEvent[] = data.events || [];

    for (const event of events) {
      // Skip les matchs terminés
      if (event.status?.type?.completed) continue;

      const homeCompetitor = event.competitions[0]?.competitors.find(c => c.homeAway === 'home');
      const awayCompetitor = event.competitions[0]?.competitors.find(c => c.homeAway === 'away');

      if (!homeCompetitor || !awayCompetitor) continue;

      const homeTeam = homeCompetitor.team.displayName;
      const awayTeam = awayCompetitor.team.displayName;
      const homeRecord = homeCompetitor.records?.[0]?.summary;
      const awayRecord = awayCompetitor.records?.[0]?.summary;

      // Calculer les cotes basées sur les records
      const baseOdds = calculateOdds(homeRecord, awayRecord);
      // Pour la NHL, on ajoute une cote pour le match nul (OT)
      const odds = {
        home: baseOdds.home,
        draw: 3.5 + Math.random() * 0.5,
        away: baseOdds.away
      };

      const prediction = generatePrediction(homeTeam, awayTeam, odds, 'Hockey');

      predictions.push({
        matchId: `nhl_${event.id}`,
        homeTeam,
        awayTeam,
        league: 'NHL',
        sport: 'Hockey',
        matchDate: event.date,
        oddsHome: Math.round(odds.home * 100) / 100,
        oddsDraw: Math.round(odds.draw * 100) / 100,
        oddsAway: Math.round(odds.away * 100) / 100,
        ...prediction,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    }

    console.log(`🏒 ${predictions.length} matchs NHL`);
  } catch (error) {
    console.error('Erreur NHL:', error);
  }

  return predictions;
}

// Récupérer les matchs NFL (Football Américain)
async function fetchNFLMatches(): Promise<Prediction[]> {
  const predictions: Prediction[] = [];

  try {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const response = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${today}`
    );

    if (!response.ok) return predictions;

    const data = await response.json();
    const events: ESPNEvent[] = data.events || [];

    for (const event of events) {
      // Skip les matchs terminés
      if (event.status?.type?.completed) continue;

      const homeCompetitor = event.competitions[0]?.competitors.find(c => c.homeAway === 'home');
      const awayCompetitor = event.competitions[0]?.competitors.find(c => c.homeAway === 'away');

      if (!homeCompetitor || !awayCompetitor) continue;

      const homeTeam = homeCompetitor.team.displayName;
      const awayTeam = awayCompetitor.team.displayName;
      const homeRecord = homeCompetitor.records?.[0]?.summary;
      const awayRecord = awayCompetitor.records?.[0]?.summary;

      const odds = calculateOdds(homeRecord, awayRecord);
      const prediction = generatePrediction(homeTeam, awayTeam, odds, 'NFL');

      predictions.push({
        matchId: `nfl_${event.id}`,
        homeTeam,
        awayTeam,
        league: 'NFL',
        sport: 'NFL',
        matchDate: event.date,
        oddsHome: Math.round(odds.home * 100) / 100,
        oddsDraw: null, // NFL n'a pas de match nul (sauf rare)
        oddsAway: Math.round(odds.away * 100) / 100,
        ...prediction,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    }

    console.log(`🏈 ${predictions.length} matchs NFL`);
  } catch (error) {
    console.error('Erreur NFL:', error);
  }

  return predictions;
}

// Fonction principale
async function main() {
  console.log('🔄 Récupération des matchs réels depuis ESPN');
  console.log('===========================================\n');

  // Récupérer les matchs de tous les sports
  const [nbaMatches, footballMatches, nhlMatches, nflMatches] = await Promise.all([
    fetchNBAMatches(),
    fetchFootballMatches(),
    fetchNHLMatches(),
    fetchNFLMatches(),
  ]);

  const allPredictions = [...footballMatches, ...nbaMatches, ...nhlMatches, ...nflMatches];

  if (allPredictions.length === 0) {
    console.log('⚠️ Aucun match à venir trouvé');
    return;
  }

  // Charger les prédictions existantes
  let existingData: { predictions: Prediction[]; lastUpdate: string; version: string } = {
    predictions: [],
    lastUpdate: new Date().toISOString(),
    version: '2.0',
  };

  if (fs.existsSync(PREDICTIONS_FILE)) {
    existingData = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf-8'));
  }

  // Fusionner: garder les prédictions passées (pour stats) + ajouter nouvelles
  const now = new Date();
  const pastPredictions = existingData.predictions.filter(p => {
    const matchDate = new Date(p.matchDate);
    return matchDate < now && p.status === 'completed';
  });

  const allData = {
    predictions: [...pastPredictions, ...allPredictions],
    lastUpdate: new Date().toISOString(),
    version: '2.0',
  };

  // Sauvegarder
  fs.writeFileSync(PREDICTIONS_FILE, JSON.stringify(allData, null, 2));

  console.log(`\n✅ ${allPredictions.length} nouveaux pronostics générés`);
  console.log(`📊 Total: ${allData.predictions.length} pronostics (${pastPredictions.length} passés + ${allPredictions.length} à venir)`);

  // Résumé
  console.log('\n📋 Prochains matchs:');
  allPredictions.slice(0, 5).forEach((p, i) => {
    console.log(`${i + 1}. ${p.homeTeam} vs ${p.awayTeam} (${p.league})`);
    console.log(`   Cotes: ${p.oddsHome} | ${p.oddsDraw || '-'} | ${p.oddsAway}`);
    console.log(`   Pronostic: ${p.predictedResult.toUpperCase()} (${p.confidence})`);
  });
}

main().catch(console.error);
