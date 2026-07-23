/**
 * Match Importance Service - Détection de l'Enjeu d'un Match
 * 
 * Ce service analyse l'enjeu stratégique d'une rencontre pour ajuster
 * la confiance des prédictions ML. Un match de pré-saison n'a pas le même
 * poids qu'un match de playoff ou de lutte de relégation.
 * 
 * SIGNAUX UTILISÉS:
 * 1. Phase de saison (pré-saison, début, milieu, fin, playoff)
 * 2. Type de compétition (amical, coupe, championnat, playoff)
 * 3. Intensité de l'enjeu (aucun, faible, moyen, fort, critique)
 * 4. Forme trompeuse (début de saison = données peu fiables)
 * 
 * ARCHITECTURE:
 * - Zero API externe (tout est dérivé des données ESPN/Odds déjà disponibles)
 * - Synchrone et rapide (< 1ms par match)
 * - Intégré dans matchContextService → calculateContextAdjustment
 * 
 * SPORTS COUVERTS:
 * - Football: Ligue 1, PL, Liga, Serie A, Bundesliga, UCL, Coupe nationale...
 * - Basketball: NBA Regular, Summer League, Playoff
 * - Tennis: Grand Slam, Masters, ATP 250/500
 */

// ============================================
// TYPES
// ============================================

export type SeasonPhase = 
  | 'pre_season'      // Préparation / Summer League
  | 'early_season'    // 1er mois (journées 1-4)
  | 'mid_season'      // Saison régulière en cours
  | 'late_season'     // Fin de saison (dernières journées)
  | 'playoffs'        // Phase éliminatoire
  | 'finals'          // Finale / championnat décisif
  | 'off_season'      // Hors saison
  | 'friendly';       // Match amical

export type CompetitionType = 
  | 'friendly'
  | 'domestic_league'
  | 'domestic_cup'
  | 'continental_cup'
  | 'international'
  | 'playoff'
  | 'summer_league'
  | 'exhibition'
  | 'grand_slam'
  | 'masters'
  | 'atp_500'
  | 'atp_250'
  | 'wta_event';

export type StakeLevel = 
  | 'none'       // Amical / hors saison
  | 'very_low'   // Pré-saison, équipes B
  | 'low'        // Match sans enjeu direct (milieu de tableau)
  | 'medium'     // Match standard de championnat
  | 'high'       // Course titre, maintien, qualification
  | 'critical'   // Playoff, finale, barrages, dernière journée;

export interface MatchImportance {
  // Phase de saison
  seasonPhase: SeasonPhase;
  seasonPhaseLabel: string; // ex: "Mi-saison", "Playoff NBA"
  
  // Type de compétition
  competitionType: CompetitionType;
  competitionTypeLabel: string; // ex: "Championnat", "Coupe d'Europe"
  
  // Niveau d'enjeu (0-100)
  stakeLevel: StakeLevel;
  stakeScore: number; // 0-100 (quantitatif)
  stakeLabel: string; // ex: "Course au titre", "Maintien", "Aucun enjeu"
  
  // Ajustements ML
  confidenceMultiplier: number; // 0.5 à 1.15
  edgeThresholdBoost: number;   // 0 à +5% (edge additionnel requis pour low-stake)
  kellyMultiplier: number;       // 0.5 à 1.2
  
  // Warnings pour l'utilisateur
  warnings: string[];
  insights: string[];
  
  // Forme fiable ?
  formReliable: boolean;
  formReliability: 'reliable' | 'uncertain' | 'unreliable';
  formReliabilityReason: string;
}

// ============================================
// CONSTANTES - LIGUES & CALENDRIERS
// ============================================

/** Calendrier approximatif des saisons par ligue (mois de début/fin) */
const LEAGUE_SEASONS: Record<string, { startMonth: number; endMonth: number; hasPlayoff: boolean; playoffStartMonth?: number }> = {
  // Football - Lagues européennes (août-mai)
  'english-premier-league':     { startMonth: 8, endMonth: 5, hasPlayoff: false },
  'laliga':                      { startMonth: 8, endMonth: 5, hasPlayoff: false },
  'serie-a':                     { startMonth: 8, endMonth: 5, hasPlayoff: false },
  'german-bundesliga':           { startMonth: 8, endMonth: 5, hasPlayoff: false },
  'french-ligue-1':              { startMonth: 8, endMonth: 5, hasPlayoff: false },
  'portuguese-liga':             { startMonth: 8, endMonth: 5, hasPlayoff: false },
  'dutch-eredivisie':            { startMonth: 8, endMonth: 5, hasPlayoff: false },
  'belgian-pro-league':          { startMonth: 7, endMonth: 5, hasPlayoff: false },
  'turkish-super-lig':          { startMonth: 8, endMonth: 5, hasPlayoff: false },
  'scottish-premiership':        { startMonth: 8, endMonth: 5, hasPlayoff: false },
  'major-league-soccer':         { startMonth: 2, endMonth: 10, hasPlayoff: true, playoffStartMonth: 10 },
  
  // Football - Coupes continentales
  'uefa-champions-league':       { startMonth: 9, endMonth: 6, hasPlayoff: false },
  'uefa-europa-league':         { startMonth: 9, endMonth: 5, hasPlayoff: false },
  'uefa-conference-league':      { startMonth: 9, endMonth: 5, hasPlayoff: false },
  
  // Basketball - NBA
  'nba':                         { startMonth: 10, endMonth: 4, hasPlayoff: true, playoffStartMonth: 4 },
  'nba-summer-league':           { startMonth: 7, endMonth: 7, hasPlayoff: false }, // Juillet
  'nba-preseason':               { startMonth: 10, endMonth: 10, hasPlayoff: false },
  
  // Hockey - NHL
  'nhl':                         { startMonth: 10, endMonth: 4, hasPlayoff: true, playoffStartMonth: 4 },
  
  // Baseball - MLB
  'mlb':                         { startMonth: 3, endMonth: 9, hasPlayoff: true, playoffStartMonth: 10 },
  
  // Football américain - NFL
  'nfl':                         { startMonth: 9, endMonth: 1, hasPlayoff: true, playoffStartMonth: 1 },
};

/** Patterns de noms de ligues pour les compétitions spéciales */
const COMPETITION_PATTERNS: Array<{ pattern: RegExp; type: CompetitionType; stake: StakeLevel; label: string }> = [
  // Pré-saison
  { pattern: /summer.?league/i,              type: 'summer_league', stake: 'very_low',  label: 'NBA Summer League' },
  { pattern: /pre.?season|preseason/i,      type: 'exhibition',    stake: 'very_low',  label: 'Pré-saison' },
  { pattern: /friendly|amical/i,            type: 'friendly',       stake: 'none',     label: 'Amical' },
  { pattern: /exhibition/i,                  type: 'exhibition',    stake: 'very_low',  label: 'Exhibition' },
  
  // Coupes nationales
  { pattern: /fa[- ]?cup/i,                 type: 'domestic_cup',  stake: 'medium',   label: 'Coupe nationale' },
  { pattern: /coupe[- ]?de[- ]?france/i,    type: 'domestic_cup',  stake: 'medium',   label: 'Coupe de France' },
  { pattern: /copa[- ]?del[- ]?rey/i,        type: 'domestic_cup',  stake: 'medium',   label: 'Copa del Rey' },
  { pattern: /dfb[- ]?pokal/i,              type: 'domestic_cup',  stake: 'medium',   label: 'DFB-Pokal' },
  { pattern: /coupe[- ]?de[- ]?la[- ]?ligue/i, type: 'domestic_cup', stake: 'medium', label: 'Coupe de la Ligue' },
  { pattern: /copa[- ]?italia/i,             type: 'domestic_cup',  stake: 'medium',   label: 'Coppa Italia' },
  { pattern: /taça[- ]?de[- ]?portugal/i,    type: 'domestic_cup',  stake: 'medium',   label: 'Taça de Portugal' },
  { pattern: /scottish[- ]?cup/i,            type: 'domestic_cup',  stake: 'medium',   label: 'Coupe d\'Écosse' },
  
  // Coupes continentales
  { pattern: /champions[- ]?league|ucl/i,   type: 'continental_cup', stake: 'high', label: 'Ligue des Champions' },
  { pattern: /europa[- ]?league/i,            type: 'continental_cup', stake: 'high', label: 'Ligue Europa' },
  { pattern: /conference[- ]?league/i,        type: 'continental_cup', stake: 'high', label: 'Ligue Conférence' },
  { pattern: /club[- ]?world[- ]?cup/i,      type: 'continental_cup', stake: 'medium', label: 'Coupe du Monde des Clubs' },
  { pattern: /copa[- ]?libertadores/i,       type: 'continental_cup', stake: 'high', label: 'Copa Libertadores' },
  { pattern: /copa[- ]?sudamericana/i,       type: 'continental_cup', stake: 'medium', label: 'Copa Sudamericana' },
  
  // International
  { pattern: /world[- ]?cup\b/i,             type: 'international', stake: 'critical', label: 'Coupe du Monde' },
  { pattern: /coupe[- ]?du[- ]?monde/i,       type: 'international', stake: 'critical', label: 'Coupe du Monde' },
  { pattern: /euro\b|european[- ]?championship/i, type: 'international', stake: 'critical', label: 'Euro' },
  { pattern: /copa[- ]?américa\b/i,          type: 'international', stake: 'critical', label: 'Copa América' },
  { pattern: /africa[- ]?cup[- ]?of[- ]?nations/i, type: 'international', stake: 'critical', label: 'CAN' },
  { pattern: /nations[- ]?league/i,          type: 'international', stake: 'medium',   label: 'Ligue des Nations' },
  { pattern: /wcq|world[- ]?cup[- ]?qualif/i,type: 'international', stake: 'high',     label: 'Qualifications CM' },
  { pattern: /qualif/i,                      type: 'international', stake: 'high',     label: 'Qualifications' },
  
  // Tennis
  { pattern: /wimbledon/i,                   type: 'grand_slam',     stake: 'critical', label: 'Wimbledon' },
  { pattern: /roland[- ]?garros|french[- ]?open/i, type: 'grand_slam', stake: 'critical', label: 'Roland-Garros' },
  { pattern: /australian[- ]?open/i,          type: 'grand_slam',     stake: 'critical', label: 'Open d\'Australie' },
  { pattern: /us[- ]?open/i,                  type: 'grand_slam',     stake: 'critical', label: 'US Open' },
  { pattern: /masters[- ]?1000|atp[- ]?masters/i, type: 'masters',    stake: 'high',     label: 'Masters 1000' },
  { pattern: /atp[- ]?500/i,                  type: 'atp_500',        stake: 'medium',   label: 'ATP 500' },
  { pattern: /atp[- ]?250/i,                  type: 'atp_250',        stake: 'low',      label: 'ATP 250' },
  { pattern: /wta[- ]?(1000|500|250)/i,        type: 'wta_event',      stake: 'medium',   label: 'WTA Tour' },
  { pattern: /davis[- ]?cup/i,                type: 'international',  stake: 'high',     label: 'Davis Cup' },
  { pattern: /billie[- ]?jean[- ]?king/i,     type: 'international', stake: 'high',     label: 'Billie Jean King Cup' },
  
  // Playoff
  { pattern: /play[- ]?off/i,                 type: 'playoff',        stake: 'critical', label: 'Playoff' },
  { pattern: /play[- ]?in/i,                  type: 'playoff',        stake: 'high',     label: 'Play-in' },
  { pattern: /barrage/i,                      type: 'playoff',        stake: 'high',     label: 'Barrage' },
  { pattern: /quarter.?final|quart/i,         type: 'playoff',        stake: 'critical', label: 'Quarts de finale' },
  { pattern: /semi.?final|demi/i,             type: 'playoff',        stake: 'critical', label: 'Demi-finale' },
  { pattern: /final/i,                        type: 'playoff',        stake: 'critical', label: 'Finale' },
  
  // Super Bowl / Finals spéciaux
  { pattern: /super[- ]?bowl/i,              type: 'playoff',        stake: 'critical', label: 'Super Bowl' },
  { pattern: /nba[- ]?finals/i,              type: 'playoff',        stake: 'critical', label: 'Finales NBA' },
  { pattern: /stanley[- ]?cup[- ]?final/i,   type: 'playoff',        stake: 'critical', label: 'Finales NHL' },
  { pattern: /world[- ]?series/i,            type: 'playoff',        stake: 'critical', label: 'World Series' },
];

/** Mapping normalisé des noms de ligues ESPN → clé interne */
const LEAGUE_NAME_MAP: Record<string, string> = {
  'english-premier-league': 'english-premier-league',
  'english league cup': 'domestic_cup_fa',
  'laliga': 'laliga',
  'serie-a': 'serie-a',
  'german-bundesliga': 'german-bundesliga',
  'french-ligue-1': 'french-ligue-1',
  'liga-portugal': 'portuguese-liga',
  'belgian-pro-league': 'belgian-pro-league',
  'turkish-super-lig': 'turkish-super-lig',
  'scottish-premiership': 'scottish-premiership',
  'major-league-soccer': 'major-league-soccer',
  'uefa-champions-league': 'uefa-champions-league',
  'uefa-europa-league': 'uefa-europa-league',
  'uefa-conference-league': 'uefa-conference-league',
  'nba': 'nba',
  'nba summer league': 'nba-summer-league',
  'nhl': 'nhl',
  'mlb': 'mlb',
  'nfl': 'nfl',
};

// ============================================
// FONCTIONS PRINCIPALES
// ============================================

/**
 * Analyse l'enjeu d'un match — fonction principale
 * Synchrone, rapide (< 1ms)
 */
export function analyzeMatchImportance(
  league: string,
  sport: string,
  matchDate?: Date,
  homeStanding?: number,
  awayStanding?: number,
  totalTeams?: number
): MatchImportance {
  const now = matchDate || new Date();
  const month = now.getUTCMonth() + 1; // 1-12
  
  const warnings: string[] = [];
  const insights: string[] = [];
  
  // 1. Identifier le type de compétition et l'enjeu de base
  const { competitionType, competitionTypeLabel, stakeFromCompetition, stakeFromLabel } = 
    identifyCompetition(league);
  
  // 2. Déterminer la phase de saison
  const { seasonPhase, seasonPhaseLabel } = determineSeasonPhase(league, month, sport, stakeFromCompetition);
  
  // 3. Calculer l'enjeu dynamique (position au classement si disponible)
  const { stakeLevel, stakeScore, stakeLabel } = calculateDynamicStake(
    stakeFromCompetition,
    seasonPhase,
    homeStanding,
    awayStanding,
    totalTeams,
    warnings,
    insights
  );
  
  // 4. Déterminer la fiabilité de la forme
  const { formReliable, formReliability, formReliabilityReason } = 
    assessFormReliability(seasonPhase, competitionType, warnings);
  
  // 5. Calculer les ajustements ML
  const { confidenceMultiplier, edgeThresholdBoost, kellyMultiplier } = 
    calculateMLAdjustments(stakeLevel, seasonPhase, formReliable);
  
  return {
    seasonPhase,
    seasonPhaseLabel,
    competitionType,
    competitionTypeLabel,
    stakeLevel,
    stakeScore,
    stakeLabel,
    confidenceMultiplier,
    edgeThresholdBoost,
    kellyMultiplier,
    warnings,
    insights,
    formReliable,
    formReliability,
    formReliabilityReason,
  };
}

/**
 * Version simplifiée pour Tennis (basée sur le nom de ligue seulement)
 */
export function analyzeTennisImportance(league: string): MatchImportance {
  return analyzeMatchImportance(league, 'tennis');
}

// ============================================
// FONCTIONS INTERNES
// ============================================

/**
 * Identifie le type de compétition à partir du nom de la ligue
 */
function identifyCompetition(league: string): {
  competitionType: CompetitionType;
  competitionTypeLabel: string;
  stakeFromCompetition: StakeLevel;
  stakeFromLabel: string;
} {
  const normalized = league.toLowerCase().trim();
  
  for (const { pattern, type, stake, label } of COMPETITION_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        competitionType: type,
        competitionTypeLabel: label,
        stakeFromCompetition: stake,
        stakeFromLabel: label,
      };
    }
  }
  
  // Par défaut: championnat domestique
  return {
    competitionType: 'domestic_league',
    competitionTypeLabel: 'Championnat',
    stakeFromCompetition: 'medium',
    stakeFromLabel: 'Championnat',
  };
}

/**
 * Détermine la phase de saison à partir du mois et de la ligue
 */
function determineSeasonPhase(
  league: string,
  month: number,
  sport: string,
  baseStake: StakeLevel
): { seasonPhase: SeasonPhase; seasonPhaseLabel: string } {
  const normalized = league.toLowerCase().trim();
  const leagueKey = LEAGUE_NAME_MAP[normalized];
  const season = leagueKey ? LEAGUE_SEASONS[leagueKey] : undefined;
  
  // Matches amicaux / pré-saison déjà identifiés
  if (baseStake === 'none' || baseStake === 'very_low') {
    if (baseStake === 'none') return { seasonPhase: 'friendly', seasonPhaseLabel: 'Amical' };
    return { seasonPhase: 'pre_season', seasonPhaseLabel: 'Pré-saison' };
  }
  
  // Matches de playoff / finales déjà identifiés
  if (baseStake === 'critical') {
    const isFinal = /final/i.test(normalized);
    if (isFinal) return { seasonPhase: 'finals', seasonPhaseLabel: 'Finale' };
    return { seasonPhase: 'playoffs', seasonPhaseLabel: 'Phase éliminatoire' };
  }
  
  // Pour les ligues avec un calendrier connu
  if (season) {
    const { startMonth, endMonth, hasPlayoff, playoffStartMonth } = season;
    
    // Avant le début de saison = pré-saison ou off-season
    if (month === startMonth - 1 || (startMonth === 8 && month === 7)) {
      return { seasonPhase: 'pre_season', seasonPhaseLabel: 'Pré-saison' };
    }
    
    // Après la fin de saison = off-season
    if (month === endMonth + 1 || (endMonth === 5 && month === 6 && !hasPlayoff)) {
      return { seasonPhase: 'off_season', seasonPhaseLabel: 'Hors saison' };
    }
    
    // Playoff
    if (hasPlayoff && playoffStartMonth) {
      if (month >= playoffStartMonth || (endMonth === 4 && month === 4)) {
        return { seasonPhase: 'playoffs', seasonPhaseLabel: 'Playoff' };
      }
    }
    
    // Début de saison (1er mois)
    if (month === startMonth) {
      return { seasonPhase: 'early_season', seasonPhaseLabel: 'Début de saison' };
    }
    
    // Fin de saison (dernier mois)
    if (month === endMonth) {
      return { seasonPhase: 'late_season', seasonPhaseLabel: 'Fin de saison' };
    }
    
    // Mi-saison
    return { seasonPhase: 'mid_season', seasonPhaseLabel: 'Mi-saison' };
  }
  
  // Tennis: basé sur le type de compétition
  if (sport === 'tennis') {
    return { seasonPhase: 'mid_season', seasonPhaseLabel: 'Tournoi' };
  }
  
  // Par défaut pour les ligues non répertoriées
  return { seasonPhase: 'mid_season', seasonPhaseLabel: 'Saison régulière' };
}

/**
 * Calcule l'enjeu dynamique en fonction de la position au classement
 */
function calculateDynamicStake(
  baseStake: StakeLevel,
  seasonPhase: SeasonPhase,
  homeStanding?: number,
  awayStanding?: number,
  totalTeams?: number,
  warnings?: string[],
  insights?: string[]
): { stakeLevel: StakeLevel; stakeScore: number; stakeLabel: string } {
  // Si pas de classement, utiliser l'enjeu de base
  if (!homeStanding || !awayStanding || !totalTeams) {
    return getStakeFromBase(baseStake, seasonPhase, warnings);
  }
  
  const relegationZone = Math.ceil(totalTeams * 0.17); // ~17% relégués (bottom 3 en PL)
  const titleZone = Math.ceil(totalTeams * 0.17); // Top ~17% (top 6 en PL)
  const europeanZone = Math.ceil(totalTeams * 0.25); // Top ~25% (top 5-6 en PL)
  
  // Vérifier les positions critiques
  const homeInRelegation = homeStanding > (totalTeams - relegationZone);
  const awayInRelegation = awayStanding > (totalTeams - relegationZone);
  const homeInTitleRace = homeStanding <= titleZone;
  const awayInTitleRace = awayStanding <= titleZone;
  const homeInEuropeanRace = homeStanding <= europeanZone;
  const awayInEuropeanRace = awayStanding <= europeanZone;
  
  // 6-head battle (1er vs 2e, relégation directe...)
  const isSixPointer = homeInRelegation && awayInRelegation;
  const isTitleMatch = homeInTitleRace && awayInTitleRace;
  const isEuropeanDecider = homeInEuropeanRace && awayInEuropeanRace;
  
  // Déterminer le stake
  let stakeScore = 50; // Base
  let stakeLabel = 'Match standard';
  let stakeLevel: StakeLevel = 'medium';
  
  if (isSixPointer) {
    stakeScore = 95;
    stakeLabel = `Bataille de maintien (${homeStanding}e vs ${awayStanding}e)`;
    stakeLevel = 'critical';
    insights?.push(`🔴 MATCH À 6 POINTS: ${homeStanding}e vs ${awayStanding}e — tous les deux en zone de relégation`);
  } else if (isTitleMatch) {
    stakeScore = 92;
    stakeLabel = `Course au titre (${homeStanding}e vs ${awayStanding}e)`;
    stakeLevel = 'critical';
    insights?.push(`🏆 MATCH DE TITRE: ${homeStanding}e vs ${awayStanding}e — course au championnat`);
  } else if (isEuropeanDecider) {
    stakeScore = 80;
    stakeLabel = `Qualification européenne (${homeStanding}e vs ${awayStanding}e)`;
    stakeLevel = 'high';
    insights?.push(`🇪🇺 ENJEU EUROPÉEN: places qualificatives en jeu`);
  } else if (homeInRelegation || awayInRelegation) {
    stakeScore = 75;
    const team = homeInRelegation ? homeStanding : awayStanding;
    stakeLabel = `Lutte de maintien (${team}e)`;
    stakeLevel = 'high';
    insights?.push(`⚠️ RELÉGATION EN JEU: un des deux clubs est en zone de relégation`);
  } else if (homeInTitleRace || awayInTitleRace) {
    stakeScore = 70;
    stakeLabel = `Course au titre`;
    stakeLevel = 'high';
    insights?.push(`🏆 TITRE EN JEU: un des deux clubs est en course pour le championnat`);
  } else if (homeInEuropeanRace || awayInEuropeanRace) {
    stakeScore = 65;
    stakeLabel = 'Match européen';
    stakeLevel = 'high';
  } else {
    // Milieu de tableau — enjeu modéré
    const avgPosition = (homeStanding + awayStanding) / 2;
    if (avgPosition > totalTeams * 0.6) {
      stakeScore = 55;
      stakeLabel = 'Milieu de tableau (zone dangereuse)';
    } else if (avgPosition < totalTeams * 0.3) {
      stakeScore = 60;
      stakeLabel = 'Haut de tableau';
    } else {
      stakeScore = 50;
      stakeLabel = 'Match sans enjeu direct';
    }
  }
  
  // Ajuster selon la phase de saison
  if (seasonPhase === 'early_season') {
    stakeScore = Math.round(stakeScore * 0.7);
    warnings?.push('📅 Début de saison — les positions au classement ne sont pas encore représentatives');
  } else if (seasonPhase === 'late_season') {
    stakeScore = Math.min(100, Math.round(stakeScore * 1.15));
  }
  
  return { stakeLevel, stakeScore, stakeLabel };
}

/**
 * Enjeu sans classement (basé uniquement sur le type + phase)
 */
function getStakeFromBase(
  baseStake: StakeLevel,
  seasonPhase: SeasonPhase,
  warnings?: string[]
): { stakeLevel: StakeLevel; stakeScore: number; stakeLabel: string } {
  const stakeMap: Record<StakeLevel, { score: number; label: string }> = {
    'none':     { score: 5,  label: 'Aucun enjeu' },
    'very_low': { score: 15, label: 'Enjeu très faible' },
    'low':      { score: 35, label: 'Enjeu faible' },
    'medium':   { score: 55, label: 'Enjeu modéré' },
    'high':     { score: 75, label: 'Enjeu élevé' },
    'critical': { score: 95, label: 'Enjeu critique' },
  };
  
  const base = stakeMap[baseStake] || stakeMap['medium'];
  
  // Ajuster selon la phase
  let adjustedScore = base.score;
  if (seasonPhase === 'early_season') {
    adjustedScore = Math.round(adjustedScore * 0.75);
    if (warnings) warnings.push('📅 Début de saison — enjeu limité');
  } else if (seasonPhase === 'late_season') {
    adjustedScore = Math.min(100, Math.round(adjustedScore * 1.1));
  }
  
  return { stakeLevel: baseStake, stakeScore: adjustedScore, stakeLabel: base.label };
}

/**
 * Évalue la fiabilité de la forme actuelle
 */
function assessFormReliability(
  seasonPhase: SeasonPhase,
  competitionType: CompetitionType,
  warnings?: string[]
): { formReliable: boolean; formReliability: 'reliable' | 'uncertain' | 'unreliable'; formReliabilityReason: string } {
  // Matches amicaux / pré-saison → forme NON fiable
  if (seasonPhase === 'pre_season' || seasonPhase === 'friendly' || seasonPhase === 'off_season') {
    return {
      formReliable: false,
      formReliability: 'unreliable',
      formReliabilityReason: competitionType === 'friendly' 
        ? 'Match amical — les compositions et motivations sont différentes'
        : competitionType === 'summer_league'
          ? 'Summer League — rotations massives, jeunes joueurs, pas représentatif'
          : 'Pré-saison — les équipes testent, pas d\'enjeu réel',
    };
  }
  
  // Début de saison → forme INCERTAINE
  if (seasonPhase === 'early_season') {
    return {
      formReliable: false,
      formReliability: 'uncertain',
      formReliabilityReason: 'Début de saison — peu de données, forme trompeuse possible',
    };
  }
  
  // Coupe nationale avec équipes B
  if (competitionType === 'domestic_cup') {
    return {
      formReliable: false,
      formReliability: 'uncertain',
      formReliabilityReason: 'Coupe nationale — compositions potentiellement remaniées',
    };
  }
  
  // Exhibition
  if (competitionType === 'exhibition') {
    return {
      formReliable: false,
      formReliability: 'unreliable',
      formReliabilityReason: 'Match d\'exhibition — résultats non représentatifs',
    };
  }
  
  // Mi-saison et fin de saison → forme fiable
  return {
    formReliable: true,
    formReliability: 'reliable',
    formReliabilityReason: 'Saison régulière en cours — données de forme fiables',
  };
}

/**
 * Calcule les ajustements ML en fonction de l'enjeu
 */
function calculateMLAdjustments(
  stakeLevel: StakeLevel,
  seasonPhase: SeasonPhase,
  formReliable: boolean
): { confidenceMultiplier: number; edgeThresholdBoost: number; kellyMultiplier: number } {
  // Confidence multiplier (plus l'enjeu est élevé, plus on a confiance)
  let confidenceMultiplier: number;
  switch (stakeLevel) {
    case 'none':
    case 'very_low':
      confidenceMultiplier = formReliable ? 0.75 : 0.60;
      break;
    case 'low':
      confidenceMultiplier = formReliable ? 0.85 : 0.75;
      break;
    case 'medium':
      confidenceMultiplier = formReliable ? 0.95 : 0.85;
      break;
    case 'high':
      confidenceMultiplier = 1.0;
      break;
    case 'critical':
      confidenceMultiplier = 1.05;
      break;
    default:
      confidenceMultiplier = 0.9;
  }
  
  // Edge threshold boost (enjeu faible → exige plus d'edge)
  let edgeThresholdBoost: number;
  switch (stakeLevel) {
    case 'none':
    case 'very_low':
      edgeThresholdBoost = 0.04; // +4% d'edge requis
      break;
    case 'low':
      edgeThresholdBoost = 0.02; // +2%
      break;
    case 'medium':
      edgeThresholdBoost = 0;
      break;
    case 'high':
    case 'critical':
      edgeThresholdBoost = -0.01; // -1% (plus permissif)
      break;
    default:
      edgeThresholdBoost = 0;
  }
  
  // Kelly multiplier
  let kellyMultiplier: number;
  switch (stakeLevel) {
    case 'none':
    case 'very_low':
      kellyMultiplier = formReliable ? 0.6 : 0.4; // Miser beaucoup moins
      break;
    case 'low':
      kellyMultiplier = 0.7;
      break;
    case 'medium':
      kellyMultiplier = 0.9;
      break;
    case 'high':
      kellyMultiplier = 1.0;
      break;
    case 'critical':
      kellyMultiplier = 1.1;
      break;
    default:
      kellyMultiplier = 0.8;
  }
  
  return { confidenceMultiplier, edgeThresholdBoost, kellyMultiplier };
}

// ============================================
// UTILITAIRES D'EXPORT
// ============================================

/**
 * Formate l'enjeu pour l'affichage Telegram (1-2 lignes)
 */
export function formatImportanceForTelegram(importance: MatchImportance): string {
  const lines: string[] = [];
  
  // Enjeu principal
  const stakeEmoji: Record<StakeLevel, string> = {
    'none':     '⚪',
    'very_low': '🟤',
    'low':      '🟡',
    'medium':   '🔵',
    'high':      '🟠',
    'critical':  '🔴',
  };
  
  lines.push(`${stakeEmoji[importance.stakeLevel]} ENJEU: ${importance.stakeLabel}`);
  
  // Phase de saison
  lines.push(`📋 ${importance.seasonPhaseLabel} · ${importance.competitionTypeLabel}`);
  
  // Forme fiable?
  if (!importance.formReliable) {
    lines.push(`⚠️ ${importance.formReliabilityReason}`);
  }
  
  // Warnings
  for (const w of importance.warnings) {
    if (!lines.includes(w)) lines.push(w);
  }
  
  return lines.join('\n');
}

/**
 * Formate le contexte enrichi pour Telegram (blessures, forme, news)
 */
export function formatContextForTelegram(context: {
  injuries?: { home: any[]; away: any[]; homeImpact: number; awayImpact: number; summary: string; keyAbsentees?: { home: string[]; away: string[] } };
  fbref?: { homeForm: any; awayForm: any; analysis: any };
  nba?: { homeFormScore: number; awayFormScore: number; homeStats: any; awayStats: any };
  teamNews?: { homeTeam: any; awayTeam: any };
  weather?: any;
}): string {
  const lines: string[] = [];
  
  // Forme
  if (context.fbref?.homeForm && context.fbref?.awayForm) {
    const homeForm = context.fbref.homeForm;
    const awayForm = context.fbref.awayForm;
    lines.push(`📈 Forme: ${homeForm.form || '?'} vs ${awayForm.form || '?'}`);
  } else if (context.nba) {
    const homeLabel = context.nba.homeFormScore > 60 ? 'En forme' : context.nba.homeFormScore < 40 ? 'En difficulté' : 'Variable';
    const awayLabel = context.nba.awayFormScore > 60 ? 'En forme' : context.nba.awayFormScore < 40 ? 'En difficulté' : 'Variable';
    lines.push(`📈 Forme: ${homeLabel} (${context.nba.homeFormScore}/100) vs ${awayLabel} (${context.nba.awayFormScore}/100)`);
  }
  
  // Blessures
  if (context.injuries) {
    const { homeImpact, awayImpact, summary, keyAbsentees } = context.injuries;
    if (homeImpact < -2 || awayImpact < -2) {
      lines.push(`🏥 Blessures: ${summary}`);
      if (keyAbsentees) {
        const homeAbsent = keyAbsentees.home?.length || 0;
        const awayAbsent = keyAbsentees.away?.length || 0;
        if (homeAbsent > 0 || awayAbsent > 0) {
          const parts: string[] = [];
          if (homeAbsent > 0) parts.push(`${homeAbsent} titulaire${homeAbsent > 1 ? 's' : ''} absent${homeAbsent > 1 ? 's' : ''} (domicile)`);
          if (awayAbsent > 0) parts.push(`${awayAbsent} titulaire${awayAbsent > 1 ? 's' : ''} absent${awayAbsent > 1 ? 's' : ''} (extérieur)`);
          lines.push(`    ${parts.join(' · ')}`);
        }
      }
    } else if (summary && summary !== 'Aucune blessure signalée' && summary !== 'Données non disponibles') {
      lines.push(`🏥 Blessures: ${summary}`);
    }
  }
  
  // News (seulement les alertes significatives)
  if (context.teamNews) {
    const { homeTeam, awayTeam } = context.teamNews;
    const homeRisk = homeTeam.overallImpact.riskLevel;
    const awayRisk = awayTeam.overallImpact.riskLevel;
    
    if (homeRisk === 'very_high' || homeRisk === 'high') {
      lines.push(`📰 Alertes: ${homeTeam.summary}`);
    }
    if (awayRisk === 'very_high' || awayRisk === 'high') {
      lines.push(`📰 Alertes: ${awayTeam.summary}`);
    }
    
    if (homeRisk !== 'very_high' && homeRisk !== 'high' && 
        awayRisk !== 'very_high' && awayRisk !== 'high') {
      lines.push(`📰 Info: Pas d'alerte significative`);
    }
  }
  
  return lines.join('\n');
}
