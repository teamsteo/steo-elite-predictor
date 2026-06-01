/**
 * World Cup Friendly Matches Analyzer
 * 
 * Analyse les matchs amicaux de préparation de la Coupe du Monde
 * pour détecter les value bets potentiels.
 * 
 * Facteurs spécifiques:
 * - Motivation des équipes (préparation vs enjeu réel)
 * - Historique des matchs amicaux
 * - Forme récente en qualifications
 * - Effectifs disponibles (blessés, rotations)
 * - Contexte de préparation (domicile/neutre)
 * - Style de jeu en amical vs compétitif
 */

export interface FriendlyMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamCountry: string;
  awayTeamCountry: string;
  date: string;
  venue: string;
  isNeutralVenue: boolean;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  competition: 'friendly' | 'world_cup_prep' | 'continental_prep';
}

export interface TeamProfile {
  name: string;
  country: string;
  fifaRanking: number;
  recentForm: {
    wins: number;
    draws: number;
    losses: number;
    goalsScored: number;
    goalsConceded: number;
  };
  friendlyRecord: {
    wins: number;
    draws: number;
    losses: number;
    avgGoalsScored: number;
    avgGoalsConceded: number;
  };
  worldCupHistory: {
    qualifications: number;
    bestResult: string;
    lastAppearance: number | null;
  };
  keyPlayersAvailable: number;
  keyPlayersInjured: string[];
  styleOfPlay: 'attacking' | 'defensive' | 'balanced';
  motivationLevel: 'high' | 'medium' | 'low';
}

export interface FriendlyAnalysis {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  
  // Analyse
  predictedOutcome: 'home' | 'draw' | 'away';
  predictedScore: { home: number; away: number };
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  
  // Facteurs
  factors: {
    ranking: { score: number; description: string };
    form: { score: number; description: string };
    friendlyHistory: { score: number; description: string };
    motivation: { score: number; description: string };
    squad: { score: number; description: string };
    venue: { score: number; description: string };
    style: { score: number; description: string };
  };
  
  // Value Bet
  valueBet: {
    exists: boolean;
    recommendedBet: string;
    odds: number;
    impliedProbability: number;
    ourProbability: number;
    valueGap: number;
    valueScore: number; // 0-100
  };
  
  insights: string[];
  warnings: string[];
}

// ============================================
// DONNÉES DE RÉFÉRENCE
// ============================================

// Classements FIFA simplifiés (top 50)
const FIFA_RANKINGS: Record<string, number> = {
  'argentina': 1, 'france': 2, 'spain': 3, 'england': 4, 'brazil': 5,
  'belgium': 6, 'netherlands': 7, 'portugal': 8, 'colombia': 9, 'italy': 10,
  'germany': 11, 'uruguay': 12, 'croatia': 13, 'morocco': 14, 'japan': 15,
  'usa': 16, 'mexico': 17, 'senegal': 18, 'switzerland': 19, 'iran': 20,
  'denmark': 21, 'australia': 22, 'austria': 23, 'south korea': 24, 'egypt': 25,
  'nigeria': 26, 'ukraine': 27, 'turkey': 28, 'ecuador': 29, 'cameroon': 30,
  'peru': 31, 'chile': 32, 'tunisia': 33, 'poland': 34, 'serbia': 35,
  'algeria': 36, 'saudi arabia': 37, 'czech republic': 38, 'norway': 39, 'wales': 40,
  'scotland': 41, 'ireland': 42, 'ghana': 43, 'mali': 44, 'ivory coast': 45,
  'greece': 46, 'russia': 47, 'romania': 48, 'sweden': 49, 'hungary': 50,
};

// Profils d'équipes pour les matchs amicaux
const TEAM_PROFILES: Record<string, TeamProfile> = {
  'france': {
    name: 'France',
    country: 'France',
    fifaRanking: 2,
    recentForm: { wins: 7, draws: 2, losses: 1, goalsScored: 18, goalsConceded: 6 },
    friendlyRecord: { wins: 5, draws: 3, losses: 2, avgGoalsScored: 1.8, avgGoalsConceded: 1.0 },
    worldCupHistory: { qualifications: 16, bestResult: 'Winner (2018)', lastAppearance: 2022 },
    keyPlayersAvailable: 85,
    keyPlayersInjured: [],
    styleOfPlay: 'attacking',
    motivationLevel: 'high',
  },
  'argentina': {
    name: 'Argentina',
    country: 'Argentina',
    fifaRanking: 1,
    recentForm: { wins: 8, draws: 1, losses: 1, goalsScored: 15, goalsConceded: 4 },
    friendlyRecord: { wins: 6, draws: 2, losses: 2, avgGoalsScored: 1.6, avgGoalsConceded: 0.8 },
    worldCupHistory: { qualifications: 18, bestResult: 'Winner (2022)', lastAppearance: 2022 },
    keyPlayersAvailable: 90,
    keyPlayersInjured: [],
    styleOfPlay: 'attacking',
    motivationLevel: 'high',
  },
  'brazil': {
    name: 'Brazil',
    country: 'Brazil',
    fifaRanking: 5,
    recentForm: { wins: 6, draws: 3, losses: 1, goalsScored: 14, goalsConceded: 5 },
    friendlyRecord: { wins: 7, draws: 2, losses: 1, avgGoalsScored: 2.0, avgGoalsConceded: 0.9 },
    worldCupHistory: { qualifications: 22, bestResult: 'Winner (2002)', lastAppearance: 2022 },
    keyPlayersAvailable: 80,
    keyPlayersInjured: [],
    styleOfPlay: 'attacking',
    motivationLevel: 'high',
  },
  'england': {
    name: 'England',
    country: 'England',
    fifaRanking: 4,
    recentForm: { wins: 7, draws: 2, losses: 1, goalsScored: 16, goalsConceded: 5 },
    friendlyRecord: { wins: 4, draws: 4, losses: 2, avgGoalsScored: 1.5, avgGoalsConceded: 1.1 },
    worldCupHistory: { qualifications: 16, bestResult: 'Winner (1966)', lastAppearance: 2022 },
    keyPlayersAvailable: 85,
    keyPlayersInjured: [],
    styleOfPlay: 'balanced',
    motivationLevel: 'high',
  },
  'germany': {
    name: 'Germany',
    country: 'Germany',
    fifaRanking: 11,
    recentForm: { wins: 5, draws: 3, losses: 2, goalsScored: 12, goalsConceded: 7 },
    friendlyRecord: { wins: 5, draws: 3, losses: 2, avgGoalsScored: 1.7, avgGoalsConceded: 1.0 },
    worldCupHistory: { qualifications: 20, bestResult: 'Winner (2014)', lastAppearance: 2022 },
    keyPlayersAvailable: 75,
    keyPlayersInjured: [],
    styleOfPlay: 'balanced',
    motivationLevel: 'medium',
  },
  'spain': {
    name: 'Spain',
    country: 'Spain',
    fifaRanking: 3,
    recentForm: { wins: 6, draws: 3, losses: 1, goalsScored: 14, goalsConceded: 6 },
    friendlyRecord: { wins: 5, draws: 4, losses: 1, avgGoalsScored: 1.6, avgGoalsConceded: 0.9 },
    worldCupHistory: { qualifications: 16, bestResult: 'Winner (2010)', lastAppearance: 2022 },
    keyPlayersAvailable: 80,
    keyPlayersInjured: [],
    styleOfPlay: 'attacking',
    motivationLevel: 'high',
  },
  'portugal': {
    name: 'Portugal',
    country: 'Portugal',
    fifaRanking: 8,
    recentForm: { wins: 6, draws: 2, losses: 2, goalsScored: 13, goalsConceded: 6 },
    friendlyRecord: { wins: 5, draws: 3, losses: 2, avgGoalsScored: 1.5, avgGoalsConceded: 1.0 },
    worldCupHistory: { qualifications: 8, bestResult: 'Semi-finals (2006)', lastAppearance: 2022 },
    keyPlayersAvailable: 85,
    keyPlayersInjured: [],
    styleOfPlay: 'balanced',
    motivationLevel: 'high',
  },
  'netherlands': {
    name: 'Netherlands',
    country: 'Netherlands',
    fifaRanking: 7,
    recentForm: { wins: 6, draws: 2, losses: 2, goalsScored: 14, goalsConceded: 7 },
    friendlyRecord: { wins: 5, draws: 3, losses: 2, avgGoalsScored: 1.6, avgGoalsConceded: 1.1 },
    worldCupHistory: { qualifications: 11, bestResult: 'Final (2010)', lastAppearance: 2022 },
    keyPlayersAvailable: 80,
    keyPlayersInjured: [],
    styleOfPlay: 'attacking',
    motivationLevel: 'high',
  },
};

// Styles de jeu en amical (les équipes jouent différemment)
const FRIENDLY_STYLE_ADJUSTMENTS: Record<string, { attackModifier: number; defenseModifier: number }> = {
  'france': { attackModifier: 0.9, defenseModifier: 1.1 },  // Plus prudent
  'germany': { attackModifier: 1.0, defenseModifier: 0.95 }, // Expérimente plus
  'brazil': { attackModifier: 1.1, defenseModifier: 1.0 },   // Reste offensif
  'argentina': { attackModifier: 0.95, defenseModifier: 1.05 }, // Équilibré
  'england': { attackModifier: 0.95, defenseModifier: 1.0 },
  'spain': { attackModifier: 1.0, defenseModifier: 1.0 },
  'portugal': { attackModifier: 0.9, defenseModifier: 1.1 },
  'netherlands': { attackModifier: 1.05, defenseModifier: 0.95 },
};

// ============================================
// FONCTIONS D'ANALYSE
// ============================================

function getTeamProfile(teamName: string): TeamProfile {
  const normalizedName = teamName.toLowerCase().trim();
  
  // Recherche directe
  if (TEAM_PROFILES[normalizedName]) {
    return TEAM_PROFILES[normalizedName];
  }
  
  // Recherche par nom partiel
  for (const [key, profile] of Object.entries(TEAM_PROFILES)) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return profile;
    }
  }
  
  // Profil par défaut pour équipe inconnue
  const ranking = FIFA_RANKINGS[normalizedName] || 100;
  return {
    name: teamName,
    country: teamName,
    fifaRanking: ranking,
    recentForm: { wins: 3, draws: 3, losses: 4, goalsScored: 8, goalsConceded: 10 },
    friendlyRecord: { wins: 3, draws: 4, losses: 3, avgGoalsScored: 1.2, avgGoalsConceded: 1.3 },
    worldCupHistory: { qualifications: 5, bestResult: 'Group Stage', lastAppearance: null },
    keyPlayersAvailable: 70,
    keyPlayersInjured: [],
    styleOfPlay: 'balanced',
    motivationLevel: 'medium',
  };
}

function analyzeFriendlyMatch(match: FriendlyMatch): FriendlyAnalysis {
  const homeProfile = getTeamProfile(match.homeTeam);
  const awayProfile = getTeamProfile(match.awayTeam);
  
  // 1. Facteur Classement FIFA
  const rankingDiff = awayProfile.fifaRanking - homeProfile.fifaRanking;
  const rankingScore = Math.tanh(rankingDiff / 20) * 100;
  const rankingDescription = rankingDiff > 20
    ? `${homeProfile.name} largement mieux classé (#${homeProfile.fifaRanking} vs #${awayProfile.fifaRanking})`
    : rankingDiff > 5
      ? `${homeProfile.name} mieux classé (#${homeProfile.fifaRanking} vs #${awayProfile.fifaRanking})`
      : rankingDiff < -20
        ? `${awayProfile.name} largement mieux classé`
        : rankingDiff < -5
          ? `${awayProfile.name} mieux classé`
          : 'Classements similaires';
  
  // 2. Facteur Forme Récente
  const homeFormScore = (homeProfile.recentForm.wins * 3 + homeProfile.recentForm.draws) / 
                        (homeProfile.recentForm.wins + homeProfile.recentForm.draws + homeProfile.recentForm.losses) * 10;
  const awayFormScore = (awayProfile.recentForm.wins * 3 + awayProfile.recentForm.draws) / 
                        (awayProfile.recentForm.wins + awayProfile.recentForm.draws + awayProfile.recentForm.losses) * 10;
  const formScore = (homeFormScore - awayFormScore) * 10;
  const formDescription = homeFormScore > awayFormScore + 1
    ? `${homeProfile.name} en meilleure forme (${homeProfile.recentForm.wins}V ${homeProfile.recentForm.draws}N ${homeProfile.recentForm.losses}D)`
    : awayFormScore > homeFormScore + 1
      ? `${awayProfile.name} en meilleure forme`
      : 'Forme similaire';
  
  // 3. Historique Matchs Amicaux
  const homeFriendlyWinRate = homeProfile.friendlyRecord.wins / 
    (homeProfile.friendlyRecord.wins + homeProfile.friendlyRecord.draws + homeProfile.friendlyRecord.losses);
  const awayFriendlyWinRate = awayProfile.friendlyRecord.wins / 
    (awayProfile.friendlyRecord.wins + awayProfile.friendlyRecord.draws + awayProfile.friendlyRecord.losses);
  const friendlyScore = (homeFriendlyWinRate - awayFriendlyWinRate) * 100;
  const friendlyDescription = homeFriendlyWinRate > awayFriendlyWinRate + 0.1
    ? `${homeProfile.name} performe mieux en amical`
    : awayFriendlyWinRate > homeFriendlyWinRate + 0.1
      ? `${awayProfile.name} performe mieux en amical`
      : 'Performances amicales similaires';
  
  // 4. Motivation (CRUCIAL pour les amicaux)
  const motivationMap = { high: 10, medium: 5, low: 0 };
  const homeMotivation = motivationMap[homeProfile.motivationLevel];
  const awayMotivation = motivationMap[awayProfile.motivationLevel];
  
  // Ajustement pour préparation Coupe du Monde
  let motivationModifier = 0;
  if (match.competition === 'world_cup_prep') {
    // Les équipes qualifiées pour la Coupe du Monde sont plus motivées
    if (homeProfile.worldCupHistory.lastAppearance === 2026 || homeProfile.worldCupHistory.lastAppearance === 2022) {
      motivationModifier += 5;
    }
    if (awayProfile.worldCupHistory.lastAppearance === 2026 || awayProfile.worldCupHistory.lastAppearance === 2022) {
      motivationModifier -= 5;
    }
  }
  
  const motivationScore = (homeMotivation - awayMotivation) * 5 + motivationModifier;
  const motivationDescription = homeProfile.motivationLevel === 'high' && awayProfile.motivationLevel !== 'high'
    ? `${homeProfile.name} plus motivé (préparation intensive)`
    : awayProfile.motivationLevel === 'high' && homeProfile.motivationLevel !== 'high'
      ? `${awayProfile.name} plus motivé`
      : 'Motivation similaire';
  
  // 5. Effectif / Joueurs clés disponibles
  const squadScore = (homeProfile.keyPlayersAvailable - awayProfile.keyPlayersAvailable) * 0.5;
  const squadDescription = homeProfile.keyPlayersAvailable > awayProfile.keyPlayersAvailable + 10
    ? `${homeProfile.name} avec effectif plus complet (${homeProfile.keyPlayersAvailable}% joueurs clés)`
    : awayProfile.keyPlayersAvailable > homeProfile.keyPlayersAvailable + 10
      ? `${awayProfile.name} avec effectif plus complet`
      : 'Effectifs similaires';
  
  // 6. Facteur Domicile / Terrain Neutre
  let venueScore = 0;
  let venueDescription = 'Terrain neutre';
  
  if (!match.isNeutralVenue) {
    // Vérifier si le match a lieu dans le pays de l'équipe à domicile
    const homeCountryLower = homeProfile.country.toLowerCase();
    if (match.venue.toLowerCase().includes(homeCountryLower) || 
        match.venue.toLowerCase().includes(homeProfile.name.toLowerCase())) {
      venueScore = 15; // Avantage domicile significatif
      venueDescription = `${homeProfile.name} à domicile`;
    } else if (match.venue.toLowerCase().includes(awayProfile.country.toLowerCase())) {
      venueScore = -15; // Avantage extérieur pour l'away
      venueDescription = `${awayProfile.name} à domicile (inversé)`;
    }
  }
  
  // 7. Style de jeu en amical
  const homeStyleAdjust = FRIENDLY_STYLE_ADJUSTMENTS[homeProfile.name.toLowerCase()] || 
                          { attackModifier: 1.0, defenseModifier: 1.0 };
  const awayStyleAdjust = FRIENDLY_STYLE_ADJUSTMENTS[awayProfile.name.toLowerCase()] || 
                          { attackModifier: 1.0, defenseModifier: 1.0 };
  
  // Score de style: attaque vs défense
  const styleScore = ((homeStyleAdjust.attackModifier - awayStyleAdjust.defenseModifier) - 
                      (awayStyleAdjust.attackModifier - homeStyleAdjust.defenseModifier)) * 20;
  const styleDescription = homeStyleAdjust.attackModifier > 1.0
    ? `${homeProfile.name} joue offensivement en amical`
    : homeStyleAdjust.defenseModifier > 1.0
      ? `${homeProfile.name} plus prudent en amical`
      : 'Style de jeu standard';
  
  // ============================================
  // CALCUL SCORE FINAL
  // ============================================
  
  const WEIGHTS = {
    ranking: 0.20,      // Classement FIFA
    form: 0.15,         // Forme récente
    friendlyHistory: 0.15, // Historique amicaux
    motivation: 0.20,   // Motivation (très important en amical)
    squad: 0.10,        // Effectif disponible
    venue: 0.10,        // Domicile/neutre
    style: 0.10,        // Style de jeu
  };
  
  const totalScore = 
    rankingScore * WEIGHTS.ranking +
    formScore * WEIGHTS.form +
    friendlyScore * WEIGHTS.friendlyHistory +
    motivationScore * WEIGHTS.motivation +
    squadScore * WEIGHTS.squad +
    venueScore * WEIGHTS.venue +
    styleScore * WEIGHTS.style;
  
  // Conversion en probabilités (Home / Draw / Away)
  // En amical, le nul est plus fréquent
  const homeProb = 1 / (1 + Math.exp(-totalScore / 25)) * 0.85; // Réduit pour favoriser le nul
  const awayProb = 1 / (1 + Math.exp(totalScore / 25)) * 0.85;
  const drawProb = 1 - homeProb - awayProb;
  
  // Prédiction du résultat
  let predictedOutcome: 'home' | 'draw' | 'away';
  if (homeProb > awayProb && homeProb > drawProb) {
    predictedOutcome = 'home';
  } else if (awayProb > homeProb && awayProb > drawProb) {
    predictedOutcome = 'away';
  } else {
    predictedOutcome = 'draw';
  }
  
  // Score prédit (basé sur les moyennes de buts en amical)
  const homeExpectedGoals = homeProfile.friendlyRecord.avgGoalsScored * homeStyleAdjust.attackModifier;
  const awayExpectedGoals = awayProfile.friendlyRecord.avgGoalsScored * awayStyleAdjust.attackModifier;
  const predictedScore = {
    home: Math.round(homeExpectedGoals),
    away: Math.round(awayExpectedGoals),
  };
  
  // Confiance
  const maxProb = Math.max(homeProb, drawProb, awayProb);
  const confidence: 'very_high' | 'high' | 'medium' | 'low' = 
    maxProb > 0.50 ? 'high' :
    maxProb > 0.40 ? 'medium' : 'low';
  
  // ============================================
  // DÉTECTION VALUE BET
  // ============================================
  
  const ourProbabilities = { home: homeProb, draw: drawProb, away: awayProb };
  const odds = { home: match.homeOdds, draw: match.drawOdds, away: match.awayOdds };
  const impliedProbabilities = {
    home: 1 / match.homeOdds,
    draw: 1 / match.drawOdds,
    away: 1 / match.awayOdds,
  };
  
  // Calculer le value gap pour chaque résultat
  const valueGaps = {
    home: ourProbabilities.home - impliedProbabilities.home,
    draw: ourProbabilities.draw - impliedProbabilities.draw,
    away: ourProbabilities.away - impliedProbabilities.away,
  };
  
  // Trouver le meilleur value bet
  const maxValueGap = Math.max(valueGaps.home, valueGaps.draw, valueGaps.away);
  const bestBet = valueGaps.home === maxValueGap ? 'home' : 
                  valueGaps.draw === maxValueGap ? 'draw' : 'away';
  
  // Value Score (0-100)
  const valueScore = Math.min(100, Math.max(0, maxValueGap * 200 + 50));
  
  const valueBet: FriendlyAnalysis['valueBet'] = {
    exists: maxValueGap > 0.05 && valueScore > 50,
    recommendedBet: bestBet === 'home' ? `Victoire ${homeProfile.name}` :
                    bestBet === 'draw' ? 'Match nul' : `Victoire ${awayProfile.name}`,
    odds: odds[bestBet],
    impliedProbability: impliedProbabilities[bestBet],
    ourProbability: ourProbabilities[bestBet],
    valueGap: maxValueGap,
    valueScore,
  };
  
  // ============================================
  // INSIGHTS ET WARNINGS
  // ============================================
  
  const insights: string[] = [];
  const warnings: string[] = [];
  
  // Insights motivation
  if (match.competition === 'world_cup_prep') {
    insights.push('🏆 Match de préparation Coupe du Monde - motivation variable');
  }
  
  if (homeProfile.motivationLevel === 'high') {
    insights.push(`⚡ ${homeProfile.name} très motivé pour ce match`);
  }
  
  // Insights effectif
  if (homeProfile.keyPlayersInjured.length > 0) {
    warnings.push(`⚠️ ${homeProfile.name} sans: ${homeProfile.keyPlayersInjured.join(', ')}`);
  }
  if (awayProfile.keyPlayersInjured.length > 0) {
    warnings.push(`⚠️ ${awayProfile.name} sans: ${awayProfile.keyPlayersInjured.join(', ')}`);
  }
  
  // Insights historique amical
  if (homeFriendlyWinRate > 0.6) {
    insights.push(`📊 ${homeProfile.name} performe bien en amical (${(homeFriendlyWinRate * 100).toFixed(0)}% victoires)`);
  }
  if (awayFriendlyWinRate > 0.6) {
    insights.push(`📊 ${awayProfile.name} performe bien en amical (${(awayFriendlyWinRate * 100).toFixed(0)}% victoires)`);
  }
  
  // Warning match amical
  warnings.push('ℹ️ Match amical - résultats moins prévisibles');
  
  // Value bet insight
  if (valueBet.exists) {
    insights.push(`💰 Value bet détecté: ${valueBet.recommendedBet} @ ${valueBet.odds}`);
    insights.push(`📈 Notre probabilité: ${(valueBet.ourProbability * 100).toFixed(1)}% vs Bookmaker: ${(valueBet.impliedProbability * 100).toFixed(1)}%`);
  }
  
  return {
    matchId: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    predictedOutcome,
    predictedScore,
    confidence,
    factors: {
      ranking: { score: rankingScore, description: rankingDescription },
      form: { score: formScore, description: formDescription },
      friendlyHistory: { score: friendlyScore, description: friendlyDescription },
      motivation: { score: motivationScore, description: motivationDescription },
      squad: { score: squadScore, description: squadDescription },
      venue: { score: venueScore, description: venueDescription },
      style: { score: styleScore, description: styleDescription },
    },
    valueBet,
    insights,
    warnings,
  };
}

// ============================================
// FONCTIONS EXPORTÉES
// ============================================

export function analyzeWorldCupFriendlyMatches(
  matches: FriendlyMatch[]
): FriendlyAnalysis[] {
  return matches.map(analyzeFriendlyMatch);
}

export function getValueBetsFromFriendlies(
  matches: FriendlyMatch[],
  minValueScore: number = 50
): (FriendlyAnalysis & FriendlyMatch)[] {
  const analyses = matches.map(analyzeFriendlyMatch);
  
  return matches
    .map((match, index) => ({
      ...match,
      ...analyses[index],
    }))
    .filter(item => item.valueBet.exists && item.valueBet.valueScore >= minValueScore)
    .sort((a, b) => b.valueBet.valueScore - a.valueBet.valueScore);
}

export function getUpcomingWorldCupFriendlies(): FriendlyMatch[] {
  // En production, ces données viendraient d'une API
  // Pour l'instant, données de démonstration
  const today = new Date();
  
  return [
    {
      id: 'friendly-wc-2026-001',
      homeTeam: 'France',
      awayTeam: 'Germany',
      homeTeamCountry: 'France',
      awayTeamCountry: 'Germany',
      date: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      venue: 'Stade de France, Paris',
      isNeutralVenue: false,
      homeOdds: 2.10,
      drawOdds: 3.40,
      awayOdds: 3.20,
      competition: 'world_cup_prep',
    },
    {
      id: 'friendly-wc-2026-002',
      homeTeam: 'Brazil',
      awayTeam: 'Argentina',
      homeTeamCountry: 'Brazil',
      awayTeamCountry: 'Argentina',
      date: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      venue: 'Maracanã, Rio de Janeiro',
      isNeutralVenue: false,
      homeOdds: 2.50,
      drawOdds: 3.30,
      awayOdds: 2.70,
      competition: 'world_cup_prep',
    },
    {
      id: 'friendly-wc-2026-003',
      homeTeam: 'England',
      awayTeam: 'Netherlands',
      homeTeamCountry: 'England',
      awayTeamCountry: 'Netherlands',
      date: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      venue: 'Wembley, London',
      isNeutralVenue: false,
      homeOdds: 2.20,
      drawOdds: 3.50,
      awayOdds: 3.00,
      competition: 'world_cup_prep',
    },
    {
      id: 'friendly-wc-2026-004',
      homeTeam: 'Spain',
      awayTeam: 'Portugal',
      homeTeamCountry: 'Spain',
      awayTeamCountry: 'Portugal',
      date: new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      venue: 'Santiago Bernabéu, Madrid',
      isNeutralVenue: false,
      homeOdds: 1.90,
      drawOdds: 3.60,
      awayOdds: 3.80,
      competition: 'world_cup_prep',
    },
    {
      id: 'friendly-wc-2026-005',
      homeTeam: 'USA',
      awayTeam: 'Mexico',
      homeTeamCountry: 'USA',
      awayTeamCountry: 'Mexico',
      date: new Date(today.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString(),
      venue: 'Rose Bowl, Pasadena',
      isNeutralVenue: false,
      homeOdds: 2.30,
      drawOdds: 3.30,
      awayOdds: 2.90,
      competition: 'world_cup_prep',
    },
  ];
}

export { analyzeFriendlyMatch, getTeamProfile, FIFA_RANKINGS, TEAM_PROFILES };
