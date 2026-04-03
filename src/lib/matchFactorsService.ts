/**
 * Match Factors Service - Facteurs Contextuels de Match
 *
 * Ce service calcule des facteurs subtils qui ajustent les prédictions
 * sans créer de "bruit" excessif. Chaque facteur est:
 * - Plafonné pour éviter les ajustements extrêmes
 * - Pondéré selon sa fiabilité
 * - Documenté pour transparence
 *
 * FACTEURS:
 * 1. Home Advantage Dynamique - Forme domicile vs extérieur
 * 2. Referee Impact - Style de l'arbitre (cartons, penalties)
 * 3. Rest Days Factor - Fatigue et jours de repos
 * 4. Crowd Impact - Affluence et atmosphere
 * 5. Derby/Clásico Factor - Intensité des rivalités
 *
 * PHILOSOPHIE "ANTI-BRUIT":
 * - Ajustements max: ±5% par facteur
 * - Total max: ±10% toutes facteurs combinés
 * - Confiance réduite si données incertaines
 */

// ============================================
// TYPES
// ============================================

export interface MatchFactors {
  homeAdvantage: HomeAdvantageFactor;
  referee: RefereeFactor;
  restDays: RestDaysFactor;
  crowd: CrowdFactor;
  derby: DerbyFactor;

  // Ajustement combiné
  combined: {
    homeAdjustment: number; // -0.10 à +0.10
    awayAdjustment: number;
    confidenceModifier: number; // 0.7 à 1.0
    factorsApplied: string[];
    warnings: string[];
  };
}

export interface HomeAdvantageFactor {
  homeFormAtHome: number; // 0-100, forme à domicile
  awayFormAway: number; // 0-100, forme à l'extérieur
  advantage: 'strong_home' | 'slight_home' | 'neutral' | 'slight_away' | 'strong_away';
  adjustment: number; // -0.05 à +0.05
  explanation: string;
}

export interface RefereeFactor {
  name: string;
  avgCardsPerGame: number;
  avgPenaltiesPerSeason: number;
  homeBias: number; // Tendance à favoriser l'équipe à domicile
  style: 'strict' | 'average' | 'lenient';
  adjustment: number; // -0.02 à +0.02
  explanation: string;
}

export interface RestDaysFactor {
  homeDaysRest: number;
  awayDaysRest: number;
  homeFatigue: 'fresh' | 'normal' | 'tired' | 'exhausted';
  awayFatigue: 'fresh' | 'normal' | 'tired' | 'exhausted';
  advantage: 'home' | 'away' | 'neutral';
  adjustment: number; // -0.03 à +0.03
  explanation: string;
}

export interface CrowdFactor {
  expectedAttendance: number;
  stadiumCapacity: number;
  fillRate: number; // 0-100%
  atmosphere: 'hostile' | 'passionate' | 'neutral' | 'quiet';
  homeBoost: number; // 0-100
  adjustment: number; // -0.02 à +0.02
  explanation: string;
}

export interface DerbyFactor {
  isDerby: boolean;
  intensity: 'extreme' | 'high' | 'moderate' | 'low' | 'none';
  historicalTension: number; // 0-100, basé sur cartons/altercations passés
  unpredictabilityBonus: number; // Augmente l'incertitude
  adjustment: number; // -0.03 à +0.03
  explanation: string;
}

export interface FactorInput {
  homeTeam: string;
  awayTeam: string;
  league: string;
  matchDate: Date;

  // Données optionnelles (si non fournies, estimations)
  homeFormAtHome?: { wins: number; draws: number; losses: number };
  awayFormAway?: { wins: number; draws: number; losses: number };
  homeLastMatchDate?: Date;
  awayLastMatchDate?: Date;
  refereeName?: string;
  expectedAttendance?: number;
}

// ============================================
// CONSTANTES ANTI-BRUIT
// ============================================

// Plafonds maximum par facteur (pour éviter le bruit)
const MAX_ADJUSTMENTS = {
  homeAdvantage: 0.05,
  referee: 0.02,
  restDays: 0.03,
  crowd: 0.02,
  derby: 0.03,
  combined: 0.10, // Total maximum
};

// Poids des facteurs (confiance dans chaque facteur)
const FACTOR_WEIGHTS = {
  homeAdvantage: 0.35,
  restDays: 0.25,
  crowd: 0.15,
  referee: 0.10,
  derby: 0.15,
};

// Derbies et rivalités connues
const DERBY_MATCHES: Record<string, { rival: string; intensity: DerbyFactor['intensity']; tension: number }> = {
  // Premier League
  'Manchester United': { rival: 'Manchester City', intensity: 'extreme', tension: 85 },
  'Manchester City': { rival: 'Manchester United', intensity: 'extreme', tension: 85 },
  'Liverpool': { rival: 'Manchester United', intensity: 'extreme', tension: 90 },
  'Arsenal': { rival: 'Tottenham', intensity: 'extreme', tension: 88 },
  'Tottenham': { rival: 'Arsenal', intensity: 'extreme', tension: 88 },
  'Chelsea': { rival: 'Arsenal', intensity: 'high', tension: 75 },
  'Everton': { rival: 'Liverpool', intensity: 'extreme', tension: 85 },

  // La Liga
  'Real Madrid': { rival: 'Barcelona', intensity: 'extreme', tension: 95 },
  'Barcelona': { rival: 'Real Madrid', intensity: 'extreme', tension: 95 },
  'Atletico Madrid': { rival: 'Real Madrid', intensity: 'extreme', tension: 88 },
  'Athletic Bilbao': { rival: 'Real Sociedad', intensity: 'high', tension: 75 },

  // Bundesliga
  'Bayern Munich': { rival: 'Dortmund', intensity: 'high', tension: 80 },
  'Dortmund': { rival: 'Bayern Munich', intensity: 'high', tension: 80 },
  'Schalke': { rival: 'Dortmund', intensity: 'extreme', tension: 90 },

  // Serie A
  'Inter': { rival: 'AC Milan', intensity: 'extreme', tension: 92 },
  'AC Milan': { rival: 'Inter', intensity: 'extreme', tension: 92 },
  'Juventus': { rival: 'Inter', intensity: 'high', tension: 78 },
  'Roma': { rival: 'Lazio', intensity: 'extreme', tension: 90 },
  'Lazio': { rival: 'Roma', intensity: 'extreme', tension: 90 },

  // Ligue 1
  'Paris Saint-Germain': { rival: 'Marseille', intensity: 'extreme', tension: 88 },
  'Marseille': { rival: 'Paris Saint-Germain', intensity: 'extreme', tension: 88 },
  'Lyon': { rival: 'Saint-Etienne', intensity: 'extreme', tension: 85 },
  'Nice': { rival: 'Marseille', intensity: 'moderate', tension: 60 },

  // Autres
  'Benfica': { rival: 'Porto', intensity: 'high', tension: 80 },
  'Porto': { rival: 'Benfica', intensity: 'high', tension: 80 },
  'Sporting CP': { rival: 'Benfica', intensity: 'high', tension: 78 },
  'Ajax': { rival: 'Feyenoord', intensity: 'extreme', tension: 85 },
  'Feyenoord': { rival: 'Ajax', intensity: 'extreme', tension: 85 },
  'Celtic': { rival: 'Rangers', intensity: 'extreme', tension: 95 },
  'Rangers': { rival: 'Celtic', intensity: 'extreme', tension: 95 },
  'Galatasaray': { rival: 'Fenerbahce', intensity: 'extreme', tension: 95 },
  'Fenerbahce': { rival: 'Galatasaray', intensity: 'extreme', tension: 95 },
};

// Capacités des stades
const STADIUM_CAPACITY: Record<string, number> = {
  // Premier League
  'Manchester United': 74310,
  'Manchester City': 53500,
  'Arsenal': 60700,
  'Tottenham': 62850,
  'Liverpool': 54394,
  'Chelsea': 40341,
  'Newcastle': 52305,
  'West Ham': 60000,

  // La Liga
  'Real Madrid': 83186,
  'Barcelona': 99354,
  'Atletico Madrid': 70460,

  // Bundesliga
  'Bayern Munich': 75024,
  'Dortmund': 81365,

  // Serie A
  'Inter': 80018,
  'AC Milan': 80018,
  'Juventus': 41507,
  'Roma': 70634,
  'Lazio': 70634,
  'Napoli': 54726,

  // Ligue 1
  'Paris Saint-Germain': 47929,
  'Marseille': 67394,
  'Lyon': 59186,
  'Lens': 38223,

  // Autres
  'Benfica': 64642,
  'Porto': 50083,
  'Ajax': 55500,
  'Celtic': 60411,
  'Rangers': 50817,
};

// Arbitres connus et leurs tendances
const REFEREE_PROFILES: Record<string, { avgCards: number; homeBias: number; style: RefereeFactor['style'] }> = {
  // Premier League
  'Michael Oliver': { avgCards: 3.2, homeBias: 0.02, style: 'average' },
  'Anthony Taylor': { avgCards: 3.5, homeBias: 0.03, style: 'average' },
  'Paul Tierney': { avgCards: 3.8, homeBias: 0.01, style: 'strict' },
  'Craig Pawson': { avgCards: 3.4, homeBias: 0.02, style: 'average' },
  'Stuart Attwell': { avgCards: 3.6, homeBias: 0.04, style: 'strict' },

  // La Liga
  'Antonio Mateu Lahoz': { avgCards: 5.2, homeBias: 0.05, style: 'strict' },
  'Jesus Gil Manzano': { avgCards: 4.8, homeBias: 0.03, style: 'strict' },

  // Bundesliga
  'Felix Brych': { avgCards: 3.5, homeBias: 0.02, style: 'average' },
  'Bastian Dankert': { avgCards: 3.8, homeBias: 0.01, style: 'average' },

  // Serie A
  'Daniele Orsato': { avgCards: 4.2, homeBias: 0.03, style: 'strict' },
  'Paolo Mazzoleni': { avgCards: 3.9, homeBias: 0.02, style: 'average' },

  // Ligue 1
  'Clement Turpin': { avgCards: 3.6, homeBias: 0.02, style: 'average' },
  'Benoit Bastien': { avgCards: 3.8, homeBias: 0.01, style: 'average' },
};

// ============================================
// FONCTIONS PRINCIPALES
// ============================================

/**
 * Calcule tous les facteurs de match
 */
export function calculateMatchFactors(input: FactorInput): MatchFactors {
  const warnings: string[] = [];
  const factorsApplied: string[] = [];

  // 1. Home Advantage Dynamique
  const homeAdvantage = calculateHomeAdvantage(input);
  if (Math.abs(homeAdvantage.adjustment) > 0.01) factorsApplied.push('home_advantage');

  // 2. Referee Impact
  const referee = calculateRefereeImpact(input);
  if (Math.abs(referee.adjustment) > 0.005) factorsApplied.push('referee');

  // 3. Rest Days
  const restDays = calculateRestDays(input);
  if (Math.abs(restDays.adjustment) > 0.01) factorsApplied.push('rest_days');

  // 4. Crowd Impact
  const crowd = calculateCrowdImpact(input);
  if (Math.abs(crowd.adjustment) > 0.005) factorsApplied.push('crowd');

  // 5. Derby Factor
  const derby = calculateDerbyFactor(input);
  if (derby.isDerby) factorsApplied.push('derby');
  if (derby.intensity === 'extreme' || derby.intensity === 'high') {
    warnings.push(`Match intense: ${derby.intensity.toUpperCase()} rivalry`);
  }

  // Calculer l'ajustement combiné (pondéré)
  let homeAdjustment = 0;
  homeAdjustment += homeAdvantage.adjustment * FACTOR_WEIGHTS.homeAdvantage;
  homeAdjustment += referee.adjustment * FACTOR_WEIGHTS.referee;
  homeAdjustment += restDays.adjustment * FACTOR_WEIGHTS.restDays;
  homeAdjustment += crowd.adjustment * FACTOR_WEIGHTS.crowd;
  homeAdjustment += derby.adjustment * FACTOR_WEIGHTS.derby;

  // Plafonner l'ajustement total (anti-bruit)
  homeAdjustment = Math.max(-MAX_ADJUSTMENTS.combined, Math.min(MAX_ADJUSTMENTS.combined, homeAdjustment));

  // Calculer le modificateur de confiance
  let confidenceModifier = 1.0;

  // Réduire confiance si données incertaines
  if (!input.homeFormAtHome || !input.awayFormAway) confidenceModifier *= 0.95;
  if (!input.homeLastMatchDate || !input.awayLastMatchDate) confidenceModifier *= 0.95;
  if (!input.refereeName) confidenceModifier *= 0.98;

  // Réduire confiance pour derbies (imprévisibilité)
  if (derby.isDerby) confidenceModifier *= (1 - derby.unpredictabilityBonus / 200);

  // Ajustement away = inverse de home (simplifié)
  const awayAdjustment = -homeAdjustment * 0.7;

  return {
    homeAdvantage,
    referee,
    restDays,
    crowd,
    derby,
    combined: {
      homeAdjustment: Math.round(homeAdjustment * 1000) / 1000,
      awayAdjustment: Math.round(awayAdjustment * 1000) / 1000,
      confidenceModifier: Math.round(confidenceModifier * 100) / 100,
      factorsApplied,
      warnings,
    },
  };
}

// ============================================
// CALCULS PAR FACTEUR
// ============================================

/**
 * 1. Home Advantage Dynamique
 * Compare la forme à domicile vs extérieur des deux équipes
 */
function calculateHomeAdvantage(input: FactorInput): HomeAdvantageFactor {
  let homeFormAtHome = 50; // Valeur neutre par défaut
  let awayFormAway = 50;

  // Calculer forme à domicile
  if (input.homeFormAtHome) {
    const { wins, draws, losses } = input.homeFormAtHome;
    const total = wins + draws + losses;
    if (total > 0) {
      homeFormAtHome = ((wins * 3 + draws) / (total * 3)) * 100;
    }
  }

  // Calculer forme à l'extérieur
  if (input.awayFormAway) {
    const { wins, draws, losses } = input.awayFormAway;
    const total = wins + draws + losses;
    if (total > 0) {
      awayFormAway = ((wins * 3 + draws) / (total * 3)) * 100;
    }
  }

  // Calculer l'avantage
  const diff = homeFormAtHome - awayFormAway;

  let advantage: HomeAdvantageFactor['advantage'];
  let adjustment = 0;

  if (diff > 25) {
    advantage = 'strong_home';
    adjustment = 0.04;
  } else if (diff > 10) {
    advantage = 'slight_home';
    adjustment = 0.02;
  } else if (diff < -25) {
    advantage = 'strong_away';
    adjustment = -0.04;
  } else if (diff < -10) {
    advantage = 'slight_away';
    adjustment = -0.02;
  } else {
    advantage = 'neutral';
    adjustment = 0;
  }

  // Plafonner
  adjustment = Math.max(-MAX_ADJUSTMENTS.homeAdvantage, Math.min(MAX_ADJUSTMENTS.homeAdvantage, adjustment));

  const explanation = advantage === 'neutral'
    ? 'Avantage domicile équilibré'
    : advantage.includes('home')
      ? `${input.homeTeam} en forme à domicile (${Math.round(homeFormAtHome)}%)`
      : `${input.awayTeam} performe à l'extérieur (${Math.round(awayFormAway)}%)`;

  return {
    homeFormAtHome: Math.round(homeFormAtHome),
    awayFormAway: Math.round(awayFormAway),
    advantage,
    adjustment,
    explanation,
  };
}

/**
 * 2. Referee Impact
 * Impact du style de l'arbitre sur le match
 */
function calculateRefereeImpact(input: FactorInput): RefereeFactor {
  const refereeName = input.refereeName;

  // Arbitre par défaut
  let profile: { avgCards: number; homeBias: number; style: RefereeFactor['style'] } = { avgCards: 3.5, homeBias: 0.02, style: 'average' };
  let name = refereeName || 'Unknown';

  if (refereeName && REFEREE_PROFILES[refereeName]) {
    profile = REFEREE_PROFILES[refereeName];
  }

  // L'impact principal est le homeBias (tendance à favoriser l'équipe à domicile)
  // Arbitres stricts peuvent aussi influencer (plus de cartons = jeu haché)
  let adjustment = profile.homeBias * 0.5; // Réduire l'impact pour éviter le bruit

  // Arbitres stricts: léger avantage à l'équipe plus disciplinée (difficile à déterminer)
  // On assume un léger effet neutre
  if (profile.style === 'strict') {
    adjustment += 0.005;
  } else if (profile.style === 'lenient') {
    adjustment -= 0.005;
  }

  // Plafonner
  adjustment = Math.max(-MAX_ADJUSTMENTS.referee, Math.min(MAX_ADJUSTMENTS.referee, adjustment));

  const explanation = profile.style === 'average'
    ? `Arbitre ${name}: style neutre`
    : `Arbitre ${name}: ${profile.style} (${profile.avgCards.toFixed(1)} cartons/match)`;

  return {
    name,
    avgCardsPerGame: profile.avgCards,
    avgPenaltiesPerSeason: 5, // Estimation moyenne
    homeBias: profile.homeBias,
    style: profile.style,
    adjustment,
    explanation,
  };
}

/**
 * 3. Rest Days Factor
 * Impact de la fatigue basé sur les jours de repos
 */
function calculateRestDays(input: FactorInput): RestDaysFactor {
  const now = input.matchDate.getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;

  // Calculer les jours de repos
  let homeDaysRest = 5; // Valeur par défaut (repos normal)
  let awayDaysRest = 5;

  if (input.homeLastMatchDate) {
    homeDaysRest = Math.floor((now - input.homeLastMatchDate.getTime()) / oneDayMs);
  }

  if (input.awayLastMatchDate) {
    awayDaysRest = Math.floor((now - input.awayLastMatchDate.getTime()) / oneDayMs);
  }

  // Déterminer le niveau de fatigue
  const getFatigueLevel = (days: number): RestDaysFactor['homeFatigue'] => {
    if (days >= 6) return 'fresh';
    if (days >= 4) return 'normal';
    if (days >= 2) return 'tired';
    return 'exhausted';
  };

  const homeFatigue = getFatigueLevel(homeDaysRest);
  const awayFatigue = getFatigueLevel(awayDaysRest);

  // Calculer l'avantage
  const fatigueScore = (days: number): number => {
    if (days >= 6) return 1;
    if (days >= 4) return 0;
    if (days >= 2) return -1;
    return -2;
  };

  const homeScore = fatigueScore(homeDaysRest);
  const awayScore = fatigueScore(awayDaysRest);
  const diff = homeScore - awayScore;

  let advantage: 'home' | 'away' | 'neutral' = 'neutral';
  let adjustment = 0;

  if (diff > 0) {
    advantage = 'home';
    adjustment = diff * 0.01;
  } else if (diff < 0) {
    advantage = 'away';
    adjustment = diff * 0.01;
  }

  // Back-to-back = impact majeur
  if (homeDaysRest <= 1) adjustment -= 0.02;
  if (awayDaysRest <= 1) adjustment += 0.02;

  // Plafonner
  adjustment = Math.max(-MAX_ADJUSTMENTS.restDays, Math.min(MAX_ADJUSTMENTS.restDays, adjustment));

  const explanation = homeFatigue === awayFatigue
    ? `Repos équilibré (${homeDaysRest}j vs ${awayDaysRest}j)`
    : homeFatigue === 'exhausted'
      ? `${input.homeTeam} fatigué (${homeDaysRest}j de repos)`
      : awayFatigue === 'exhausted'
        ? `${input.awayTeam} fatigué (${awayDaysRest}j de repos)`
        : `Avantage repos: ${advantage === 'home' ? input.homeTeam : input.awayTeam}`;

  return {
    homeDaysRest,
    awayDaysRest,
    homeFatigue,
    awayFatigue,
    advantage,
    adjustment,
    explanation,
  };
}

/**
 * 4. Crowd Impact
 * Impact du public sur la performance
 */
function calculateCrowdImpact(input: FactorInput): CrowdFactor {
  const stadiumCapacity = STADIUM_CAPACITY[input.homeTeam] || 40000;
  let expectedAttendance = input.expectedAttendance || stadiumCapacity * 0.85; // 85% par défaut

  // Estimer l'affluence pour les derbies
  const derbyInfo = DERBY_MATCHES[input.homeTeam];
  if (derbyInfo && input.awayTeam === derbyInfo.rival) {
    expectedAttendance = stadiumCapacity * 0.98; // Derby = sold out
  }

  const fillRate = (expectedAttendance / stadiumCapacity) * 100;

  // Déterminer l'atmosphere
  let atmosphere: CrowdFactor['atmosphere'];
  let homeBoost = 0;

  if (fillRate >= 95 && expectedAttendance > 60000) {
    atmosphere = 'hostile';
    homeBoost = 15;
  } else if (fillRate >= 90) {
    atmosphere = 'passionate';
    homeBoost = 10;
  } else if (fillRate >= 70) {
    atmosphere = 'neutral';
    homeBoost = 5;
  } else {
    atmosphere = 'quiet';
    homeBoost = 2;
  }

  // Calculer l'ajustement
  let adjustment = (homeBoost - 7.5) / 500; // Normaliser autour de 0

  // Plafonner
  adjustment = Math.max(-MAX_ADJUSTMENTS.crowd, Math.min(MAX_ADJUSTMENTS.crowd, adjustment));

  const explanation = atmosphere === 'neutral'
    ? `Affluence ${Math.round(fillRate)}% - Atmosphère normale`
    : atmosphere === 'hostile' || atmosphere === 'passionate'
      ? `Stade ${atmosphere} (${Math.round(fillRate)}% plein)`
      : `Affluence faible (${Math.round(fillRate)}%)`;

  return {
    expectedAttendance: Math.round(expectedAttendance),
    stadiumCapacity,
    fillRate: Math.round(fillRate),
    atmosphere,
    homeBoost,
    adjustment,
    explanation,
  };
}

/**
 * 5. Derby/Clásico Factor
 * Facteur d'intensité pour les rivalités
 */
function calculateDerbyFactor(input: FactorInput): DerbyFactor {
  // Vérifier si c'est un derby
  const homeDerby = DERBY_MATCHES[input.homeTeam];
  const awayDerby = DERBY_MATCHES[input.awayTeam];

  let isDerby = false;
  let intensity: DerbyFactor['intensity'] = 'none';
  let historicalTension = 0;

  if (homeDerby && input.awayTeam === homeDerby.rival) {
    isDerby = true;
    intensity = homeDerby.intensity;
    historicalTension = homeDerby.tension;
  } else if (awayDerby && input.homeTeam === awayDerby.rival) {
    isDerby = true;
    intensity = awayDerby.intensity;
    historicalTension = awayDerby.tension;
  }

  // Déterminer l'imprévisibilité
  let unpredictabilityBonus = 0;
  let adjustment = 0;

  if (isDerby) {
    switch (intensity) {
      case 'extreme':
        unpredictabilityBonus = 20;
        adjustment = -0.01; // Légèrement plus de nuls dans les derbies
        break;
      case 'high':
        unpredictabilityBonus = 12;
        adjustment = -0.005;
        break;
      case 'moderate':
        unpredictabilityBonus = 6;
        adjustment = 0;
        break;
      default:
        unpredictabilityBonus = 0;
    }
  }

  // Plafonner
  adjustment = Math.max(-MAX_ADJUSTMENTS.derby, Math.min(MAX_ADJUSTMENTS.derby, adjustment));

  const explanation = !isDerby
    ? 'Match standard'
    : intensity === 'extreme'
      ? `DERBY INTENSE: ${input.homeTeam} vs ${input.awayTeam}`
      : intensity === 'high'
        ? `Rivalité: ${input.homeTeam} vs ${input.awayTeam}`
        : `Match à enjeu: ${input.homeTeam} vs ${input.awayTeam}`;

  return {
    isDerby,
    intensity,
    historicalTension,
    unpredictabilityBonus,
    adjustment,
    explanation,
  };
}

// ============================================
// UTILITAIRES
// ============================================

/**
 * Génère un résumé des facteurs pour l'affichage
 */
export function formatFactorsSummary(factors: MatchFactors): string {
  const parts: string[] = [];

  if (Math.abs(factors.combined.homeAdjustment) > 0.01) {
    const direction = factors.combined.homeAdjustment > 0 ? 'avantage' : 'désavantage';
    parts.push(`${direction} ${(Math.abs(factors.combined.homeAdjustment) * 100).toFixed(1)}%`);
  }

  if (factors.combined.factorsApplied.length > 0) {
    parts.push(`facteurs: ${factors.combined.factorsApplied.join(', ')}`);
  }

  return parts.join(' | ') || 'Aucun facteur significatif';
}

/**
 * Ajuste les probabilités avec les facteurs
 */
export function adjustProbabilitiesWithFactors(
  homeProb: number,
  drawProb: number,
  awayProb: number,
  factors: MatchFactors
): { home: number; draw: number; away: number; explanation: string[] } {
  const explanations: string[] = [];
  const { combined } = factors;

  // Appliquer l'ajustement home
  let adjustedHome = homeProb + combined.homeAdjustment * 100;
  let adjustedAway = awayProb + combined.awayAdjustment * 100;
  let adjustedDraw = drawProb;

  // Les derbies tendent à avoir plus de nuls
  if (factors.derby.isDerby && factors.derby.intensity === 'extreme') {
    adjustedDraw += 2;
    explanations.push('Derby: +2% probabilité nul');
  }

  // Normaliser
  const total = adjustedHome + adjustedDraw + adjustedAway;
  adjustedHome = (adjustedHome / total) * 100;
  adjustedDraw = (adjustedDraw / total) * 100;
  adjustedAway = (adjustedAway / total) * 100;

  // Ajouter les explications significatives
  if (Math.abs(factors.homeAdvantage.adjustment) > 0.02) {
    explanations.push(factors.homeAdvantage.explanation);
  }
  if (factors.restDays.homeFatigue === 'exhausted' || factors.restDays.awayFatigue === 'exhausted') {
    explanations.push(factors.restDays.explanation);
  }
  if (factors.derby.isDerby) {
    explanations.push(factors.derby.explanation);
  }

  return {
    home: Math.round(adjustedHome * 10) / 10,
    draw: Math.round(adjustedDraw * 10) / 10,
    away: Math.round(adjustedAway * 10) / 10,
    explanation: explanations,
  };
}

// ============================================
// EXPORT
// ============================================

const MatchFactorsService = {
  calculateMatchFactors,
  formatFactorsSummary,
  adjustProbabilitiesWithFactors,
};

export default MatchFactorsService;
