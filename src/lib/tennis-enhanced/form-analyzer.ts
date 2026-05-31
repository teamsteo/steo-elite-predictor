/**
 * Analyse de forme récente des joueurs tennis
 * 
 * Facteurs analysés:
 * - Résultats des 10 derniers matchs
 * - Séries de victoires/défaites
 * - Performance vs joueurs classés
 * - Fatigue (matchs joués récemment)
 * - Performance sur la surface actuelle
 */

export interface FormAnalysis {
  player: string;
  recentMatches: MatchResult[];
  currentStreak: { type: 'win' | 'loss'; count: number };
  winRateLast10: number;
  winRateLast5: number;
  qualityWins: number; // Victoires vs top 50
  badLosses: number;   // Défaites vs 100+
  surfaceForm: number; // -100 à +100
  fatigueScore: number; // 0-100 (100 = reposé)
  confidence: number;   // 0-100
  trend: 'improving' | 'declining' | 'stable';
}

export interface MatchResult {
  opponent: string;
  opponentRanking: number;
  result: 'W' | 'L';
  score: string;
  tournament: string;
  surface: string;
  date: Date;
}

// Données de forme récente simulées pour les top joueurs
// En production, ces données viendraient d'une API
const FORM_DATABASE: Record<string, Partial<FormAnalysis>> = {
  // ATP Top 10
  'jannik sinner': {
    winRateLast10: 85,
    winRateLast5: 100,
    currentStreak: { type: 'win', count: 8 },
    qualityWins: 6,
    badLosses: 0,
    surfaceForm: 80,
    fatigueScore: 75,
    trend: 'stable'
  },
  'carlos alcaraz': {
    winRateLast10: 80,
    winRateLast5: 80,
    currentStreak: { type: 'win', count: 3 },
    qualityWins: 5,
    badLosses: 1,
    surfaceForm: 85,
    fatigueScore: 70,
    trend: 'improving'
  },
  'novak djokovic': {
    winRateLast10: 70,
    winRateLast5: 60,
    currentStreak: { type: 'loss', count: 1 },
    qualityWins: 4,
    badLosses: 1,
    surfaceForm: 75,
    fatigueScore: 85,
    trend: 'declining'
  },
  'alexander zverev': {
    winRateLast10: 75,
    winRateLast5: 80,
    currentStreak: { type: 'win', count: 4 },
    qualityWins: 4,
    badLosses: 0,
    surfaceForm: 70,
    fatigueScore: 65,
    trend: 'improving'
  },
  'daniil medvedev': {
    winRateLast10: 70,
    winRateLast5: 60,
    currentStreak: { type: 'loss', count: 2 },
    qualityWins: 3,
    badLosses: 2,
    surfaceForm: 65,
    fatigueScore: 70,
    trend: 'declining'
  },
  'casper ruud': {
    winRateLast10: 65,
    winRateLast5: 60,
    currentStreak: { type: 'loss', count: 1 },
    qualityWins: 2,
    badLosses: 1,
    surfaceForm: 75, // Bon sur terre
    fatigueScore: 75,
    trend: 'stable'
  },
  'andrey rublev': {
    winRateLast10: 60,
    winRateLast5: 60,
    currentStreak: { type: 'loss', count: 1 },
    qualityWins: 2,
    badLosses: 2,
    surfaceForm: 60,
    fatigueScore: 70,
    trend: 'declining'
  },
  'stefanos tsitsipas': {
    winRateLast10: 55,
    winRateLast5: 40,
    currentStreak: { type: 'loss', count: 2 },
    qualityWins: 2,
    badLosses: 2,
    surfaceForm: 70, // Bon sur terre
    fatigueScore: 75,
    trend: 'declining'
  },
  'holger rune': {
    winRateLast10: 50,
    winRateLast5: 40,
    currentStreak: { type: 'loss', count: 3 },
    qualityWins: 2,
    badLosses: 3,
    surfaceForm: 55,
    fatigueScore: 65,
    trend: 'declining'
  },
  'taylor fritz': {
    winRateLast10: 70,
    winRateLast5: 80,
    currentStreak: { type: 'win', count: 4 },
    qualityWins: 3,
    badLosses: 0,
    surfaceForm: 70,
    fatigueScore: 80,
    trend: 'improving'
  },
  'ben shelton': {
    winRateLast10: 65,
    winRateLast5: 60,
    currentStreak: { type: 'win', count: 2 },
    qualityWins: 3,
    badLosses: 1,
    surfaceForm: 65,
    fatigueScore: 85,
    trend: 'stable'
  },
  'ugo humbert': {
    winRateLast10: 60,
    winRateLast5: 60,
    currentStreak: { type: 'win', count: 1 },
    qualityWins: 2,
    badLosses: 1,
    surfaceForm: 60,
    fatigueScore: 75,
    trend: 'stable'
  },
  
  // WTA Top 10
  'aryna sabalenka': {
    winRateLast10: 80,
    winRateLast5: 80,
    currentStreak: { type: 'win', count: 5 },
    qualityWins: 5,
    badLosses: 0,
    surfaceForm: 80,
    fatigueScore: 70,
    trend: 'improving'
  },
  'iga swiatek': {
    winRateLast10: 85,
    winRateLast5: 100,
    currentStreak: { type: 'win', count: 7 },
    qualityWins: 6,
    badLosses: 0,
    surfaceForm: 90, // Excellente sur terre
    fatigueScore: 75,
    trend: 'stable'
  },
  'coco gauff': {
    winRateLast10: 75,
    winRateLast5: 80,
    currentStreak: { type: 'win', count: 4 },
    qualityWins: 4,
    badLosses: 1,
    surfaceForm: 70,
    fatigueScore: 80,
    trend: 'improving'
  },
  'jessica pegula': {
    winRateLast10: 70,
    winRateLast5: 60,
    currentStreak: { type: 'loss', count: 1 },
    qualityWins: 3,
    badLosses: 1,
    surfaceForm: 65,
    fatigueScore: 75,
    trend: 'stable'
  },
  'elena rybakina': {
    winRateLast10: 75,
    winRateLast5: 80,
    currentStreak: { type: 'win', count: 3 },
    qualityWins: 4,
    badLosses: 0,
    surfaceForm: 75,
    fatigueScore: 70,
    trend: 'stable'
  },
  'qinwen zheng': {
    winRateLast10: 70,
    winRateLast5: 80,
    currentStreak: { type: 'win', count: 4 },
    qualityWins: 3,
    badLosses: 1,
    surfaceForm: 70,
    fatigueScore: 80,
    trend: 'improving'
  },
  'jasmine paolini': {
    winRateLast10: 75,
    winRateLast5: 80,
    currentStreak: { type: 'win', count: 3 },
    qualityWins: 4,
    badLosses: 0,
    surfaceForm: 80, // Excellente sur terre
    fatigueScore: 75,
    trend: 'improving'
  }
};

/**
 * Normalise un nom de joueur pour la recherche
 */
function normalizePlayerName(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z ]/g, '')
    .trim();
}

/**
 * Récupère l'analyse de forme d'un joueur
 */
export function getFormAnalysis(player: string): FormAnalysis | null {
  const normalized = normalizePlayerName(player);
  
  // Recherche exacte
  if (FORM_DATABASE[normalized]) {
    return {
      player,
      recentMatches: [],
      currentStreak: FORM_DATABASE[normalized].currentStreak || { type: 'win', count: 0 },
      winRateLast10: FORM_DATABASE[normalized].winRateLast10 || 50,
      winRateLast5: FORM_DATABASE[normalized].winRateLast5 || 50,
      qualityWins: FORM_DATABASE[normalized].qualityWins || 0,
      badLosses: FORM_DATABASE[normalized].badLosses || 0,
      surfaceForm: FORM_DATABASE[normalized].surfaceForm || 50,
      fatigueScore: FORM_DATABASE[normalized].fatigueScore || 75,
      confidence: calculateConfidence(FORM_DATABASE[normalized] as Partial<FormAnalysis>),
      trend: FORM_DATABASE[normalized].trend || 'stable'
    };
  }
  
  // Recherche partielle
  for (const [key, data] of Object.entries(FORM_DATABASE)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return {
        player,
        recentMatches: [],
        currentStreak: data.currentStreak || { type: 'win', count: 0 },
        winRateLast10: data.winRateLast10 || 50,
        winRateLast5: data.winRateLast5 || 50,
        qualityWins: data.qualityWins || 0,
        badLosses: data.badLosses || 0,
        surfaceForm: data.surfaceForm || 50,
        fatigueScore: data.fatigueScore || 75,
        confidence: calculateConfidence(data as Partial<FormAnalysis>),
        trend: data.trend || 'stable'
      };
    }
  }
  
  // Joueur non trouvé - données par défaut
  return {
    player,
    recentMatches: [],
    currentStreak: { type: 'win', count: 0 },
    winRateLast10: 50,
    winRateLast5: 50,
    qualityWins: 0,
    badLosses: 0,
    surfaceForm: 50,
    fatigueScore: 75,
    confidence: 30,
    trend: 'stable'
  };
}

/**
 * Calcule le score de confiance basé sur les données de forme
 */
function calculateConfidence(form: Partial<FormAnalysis>): number {
  let confidence = 50;
  
  // Série de victoires/défaites
  if (form.currentStreak) {
    if (form.currentStreak.type === 'win') {
      confidence += Math.min(20, form.currentStreak.count * 3);
    } else {
      confidence -= Math.min(15, form.currentStreak.count * 3);
    }
  }
  
  // Victoires de qualité
  if (form.qualityWins) {
    confidence += Math.min(15, form.qualityWins * 3);
  }
  
  // Mauvaises défaites
  if (form.badLosses) {
    confidence -= Math.min(20, form.badLosses * 5);
  }
  
  // Tendance
  if (form.trend === 'improving') confidence += 10;
  if (form.trend === 'declining') confidence -= 10;
  
  return Math.max(10, Math.min(95, confidence));
}

/**
 * Compare la forme de deux joueurs et retourne un score
 * @returns Score de -100 à +100 (positif = avantage player1)
 */
export function compareForm(
  player1: string, 
  player2: string
): { score: number; description: string; p1Form: FormAnalysis | null; p2Form: FormAnalysis | null } {
  
  const p1Form = getFormAnalysis(player1);
  const p2Form = getFormAnalysis(player2);
  
  if (!p1Form && !p2Form) {
    return { score: 0, description: 'Données de forme non disponibles', p1Form: null, p2Form: null };
  }
  
  // Calcul du score composite
  let score = 0;
  
  // Win rate (poids 40%)
  if (p1Form && p2Form) {
    const winRateDiff = p1Form.winRateLast10 - p2Form.winRateLast10;
    score += winRateDiff * 0.4;
    
    // Tendance (poids 20%)
    const trendScores = { 'improving': 10, 'stable': 0, 'declining': -10 };
    score += (trendScores[p1Form.trend] - trendScores[p2Form.trend]) * 2;
    
    // Série actuelle (poids 25%)
    const p1StreakValue = p1Form.currentStreak.type === 'win' 
      ? p1Form.currentStreak.count * 3 
      : -p1Form.currentStreak.count * 4;
    const p2StreakValue = p2Form.currentStreak.type === 'win' 
      ? p2Form.currentStreak.count * 3 
      : -p2Form.currentStreak.count * 4;
    score += (p1StreakValue - p2StreakValue) * 0.5;
    
    // Fatigue (poids 15%)
    score += (p1Form.fatigueScore - p2Form.fatigueScore) * 0.15;
  } else if (p1Form) {
    score = 25; // Avantage au joueur avec données
  } else {
    score = -25;
  }
  
  // Description
  let description = '';
  if (score > 20) {
    description = `${player1} en bien meilleure forme (${p1Form?.winRateLast10 || '?'}% vs ${p2Form?.winRateLast10 || '?'}%)`;
  } else if (score > 10) {
    description = `${player1} en meilleure forme récente`;
  } else if (score < -20) {
    description = `${player2} en bien meilleure forme (${p2Form?.winRateLast10 || '?'}% vs ${p1Form?.winRateLast10 || '?'}%)`;
  } else if (score < -10) {
    description = `${player2} en meilleure forme récente`;
  } else {
    description = 'Forme équivalente';
  }
  
  // Ajouter info série
  if (p1Form?.currentStreak.count && p1Form.currentStreak.count >= 3) {
    if (p1Form.currentStreak.type === 'win') {
      description += ` - ${player1} sur une série de ${p1Form.currentStreak.count} victoires`;
    }
  }
  if (p2Form?.currentStreak.count && p2Form.currentStreak.count >= 3) {
    if (p2Form.currentStreak.type === 'win') {
      description += ` - ${player2} sur une série de ${p2Form.currentStreak.count} victoires`;
    }
  }
  
  return { score, description, p1Form, p2Form };
}

/**
 * Détecte les signaux d'alerte dans la forme
 */
export function detectFormWarnings(form: FormAnalysis): string[] {
  const warnings: string[] = [];
  
  if (form.currentStreak.type === 'loss' && form.currentStreak.count >= 3) {
    warnings.push(`Série de ${form.currentStreak.count} défaites consécutives`);
  }
  
  if (form.winRateLast10 < 40) {
    warnings.push('Moins de 40% de victoires sur les 10 derniers matchs');
  }
  
  if (form.badLosses >= 2) {
    warnings.push(`${form.badLosses} défaites contre des joueurs mal classés`);
  }
  
  if (form.fatigueScore < 60) {
    warnings.push('Fatigue importante détectée');
  }
  
  if (form.trend === 'declining') {
    warnings.push('Tendance à la baisse');
  }
  
  return warnings;
}

/**
 * Détecte les signaux positifs dans la forme
 */
export function detectFormStrengths(form: FormAnalysis): string[] {
  const strengths: string[] = [];
  
  if (form.currentStreak.type === 'win' && form.currentStreak.count >= 4) {
    strengths.push(`🔥 Série de ${form.currentStreak.count} victoires`);
  }
  
  if (form.winRateLast10 > 80) {
    strengths.push('Excellente forme (80%+ victoires)');
  }
  
  if (form.qualityWins >= 4) {
    strengths.push(`${form.qualityWins} victoires contre top 50`);
  }
  
  if (form.trend === 'improving') {
    strengths.push('Tendance à la hausse');
  }
  
  if (form.surfaceForm > 75) {
    strengths.push('Très à l\'aise sur cette surface');
  }
  
  return strengths;
}
