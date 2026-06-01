import { NextResponse } from 'next/server';

// API Challenges Négligés - Format compatible avec le frontend
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const minOdds = parseFloat(searchParams.get('minOdds') || '2.0');
    const minValueGap = parseFloat(searchParams.get('minValueGap') || '5');
    
    const today = new Date();
    
    // Données de démonstration complètes
    const allChallenges = [
      // Tennis
      {
        id: 'tennis-001',
        sport: 'tennis',
        match: { 
          tournament: 'ATP Masters 1000',
          surface: 'Dur'
        },
        challenge: {
          underdog: 'J. Sinner',
          favorite: 'C. Alcaraz',
          underdogOdds: 2.40,
          valueGap: 6.3,
          ourProbability: 48,
          impliedProbability: 41.7
        },
        confidenceLevel: 'high',
        riskLevel: 'calculated',
        valueScore: 72,
        reasoning: ['Forme récente excellente', 'Avantage surface', 'H2H favorable']
      },
      {
        id: 'tennis-002',
        sport: 'tennis',
        match: { 
          tournament: 'WTA 1000 Rome',
          surface: 'Terre battue'
        },
        challenge: {
          underdog: 'I. Swiatek',
          favorite: 'A. Sabalenka',
          underdogOdds: 1.85,
          valueGap: 8.0,
          ourProbability: 62,
          impliedProbability: 54
        },
        confidenceLevel: 'very_high',
        riskLevel: 'calculated',
        valueScore: 78,
        reasoning: ['Experte sur terre battue', 'Forme récente', 'H2H dominé']
      },
      // Football - Championnats Européens
      {
        id: 'football-001',
        sport: 'football',
        match: { 
          tournament: 'Ligue 1',
          surface: 'Pelouse'
        },
        challenge: {
          underdog: 'Marseille',
          favorite: 'PSG',
          underdogOdds: 4.50,
          valueGap: 8.2,
          ourProbability: 28,
          impliedProbability: 22.2
        },
        confidenceLevel: 'medium',
        riskLevel: 'moderate',
        valueScore: 58,
        reasoning: ['Classico ouvert', 'PSG en reconstruction', 'Marseille motivé']
      },
      {
        id: 'football-002',
        sport: 'football',
        match: { 
          tournament: 'Premier League',
          surface: 'Pelouse'
        },
        challenge: {
          underdog: 'Liverpool',
          favorite: 'Manchester City',
          underdogOdds: 3.20,
          valueGap: 7.5,
          ourProbability: 35,
          impliedProbability: 31.3
        },
        confidenceLevel: 'high',
        riskLevel: 'calculated',
        valueScore: 65,
        reasoning: ['Match au sommet', 'Liverpool en forme', 'City fatigué']
      },
      {
        id: 'football-003',
        sport: 'football',
        match: { 
          tournament: 'La Liga',
          surface: 'Pelouse'
        },
        challenge: {
          underdog: 'Barcelona',
          favorite: 'Real Madrid',
          underdogOdds: 2.90,
          valueGap: 6.8,
          ourProbability: 38,
          impliedProbability: 34.5
        },
        confidenceLevel: 'high',
        riskLevel: 'calculated',
        valueScore: 62,
        reasoning: ['El Clásico', 'Barça en forme', 'Real blessés']
      },
      // Coupe du Monde - Amicaux
      {
        id: 'wc-friendly-001',
        sport: 'football',
        match: { 
          tournament: 'Match Amical - Préparation CM 2026',
          surface: 'Pelouse'
        },
        challenge: {
          underdog: 'Allemagne',
          favorite: 'France',
          underdogOdds: 3.40,
          valueGap: 7.0,
          ourProbability: 33,
          impliedProbability: 29.4
        },
        confidenceLevel: 'medium',
        riskLevel: 'moderate',
        valueScore: 55,
        reasoning: ['Match amical', 'Équipes proches', 'Allemands revanchards']
      },
      // Coupe du Monde
      {
        id: 'wc-001',
        sport: 'football',
        match: { 
          tournament: 'Coupe du Monde FIFA 2026',
          surface: 'Pelouse'
        },
        challenge: {
          underdog: 'Brésil',
          favorite: 'France',
          underdogOdds: 2.60,
          valueGap: 5.5,
          ourProbability: 42,
          impliedProbability: 38.5
        },
        confidenceLevel: 'medium',
        riskLevel: 'moderate',
        valueScore: 52,
        reasoning: ['Match équilibré', 'Deux favoris', 'Brésil en reconstruction']
      },
      // Basketball NBA
      {
        id: 'nba-001',
        sport: 'basketball',
        match: { 
          tournament: 'NBA Playoffs',
          surface: 'Parquet'
        },
        challenge: {
          underdog: 'Lakers',
          favorite: 'Warriors',
          underdogOdds: 2.80,
          valueGap: 6.5,
          ourProbability: 40,
          impliedProbability: 35.7
        },
        confidenceLevel: 'high',
        riskLevel: 'calculated',
        valueScore: 60,
        reasoning: ['LeBron en forme', 'Match serré attendu', 'Warriors fatigués']
      }
    ];
    
    // Filtrer selon les paramètres
    const filteredChallenges = allChallenges.filter(c => 
      c.challenge.underdogOdds >= minOdds && 
      c.challenge.valueGap >= minValueGap
    );
    
    // Calculer le résumé
    const summary = {
      totalScanned: 50,
      valueBetsFound: filteredChallenges.length,
      highConfidenceCount: filteredChallenges.filter(c => 
        c.confidenceLevel === 'high' || c.confidenceLevel === 'very_high'
      ).length,
      averageValueGap: filteredChallenges.length > 0 
        ? Math.round(filteredChallenges.reduce((sum, c) => sum + c.challenge.valueGap, 0) / filteredChallenges.length * 10) / 10
        : 0
    };

    return NextResponse.json({
      success: true,
      challenges: filteredChallenges,
      summary,
      lastUpdated: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Erreur API challenges:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Erreur lors de la récupération des données',
        challenges: [],
        summary: {
          totalScanned: 0,
          valueBetsFound: 0,
          highConfidenceCount: 0,
          averageValueGap: 0
        }
      },
      { status: 200 }
    );
  }
}

export async function POST() {
  return NextResponse.json({ success: true, message: 'Action effectuée' });
}
