/**
 * Tennis Player Database - Données enrichies des joueurs
 * 
 * Contient:
 * - Statistiques par surface détaillées
 * - Forme récente
 * - Historique dans les tournois
 * - Spécialités et préférences
 */

// ============================================
// INTERFACES
// ============================================

export interface PlayerProfile {
  name: string;
  normalizedName: string;
  country: string;
  ranking: number;
  
  // Stats par surface (0-100)
  surfaceSkill: {
    hard: number;
    clay: number;
    grass: number;
    indoor: number;
  };
  
  // Meilleure/pire surface
  bestSurface: Surface;
  worstSurface: Surface;
  
  // Style de jeu
  playStyle: 'aggressive' | 'defensive' | 'balanced' | 'serve_volley';
  
  // Performances dans les grands tournois (dernières 3 années)
  grandSlamStats: {
    australianOpen: { bestResult: string; winRate: number };
    rolandGarros: { bestResult: string; winRate: number };
    wimbledon: { bestResult: string; winRate: number };
    usOpen: { bestResult: string; winRate: number };
  };
  
  // Forme récente (sur 10)
  recentForm: number;
  
  // Points forts/faibles
  strengths: string[];
  weaknesses: string[];
  
  // Retour de blessure
  returningFromInjury: boolean;
  injuryType?: string;
  
  // Dernière mise à jour
  lastUpdated: string;
}

type Surface = 'hard' | 'clay' | 'grass' | 'indoor';

// ============================================
// BASE DE DONNÉES ATP (TOP 30)
// ============================================

export const ATP_PLAYER_DATABASE: PlayerProfile[] = [
  {
    name: 'Jannik Sinner',
    normalizedName: 'sinner',
    country: 'ITA',
    ranking: 1,
    surfaceSkill: { hard: 95, clay: 75, grass: 70, indoor: 90 },
    bestSurface: 'hard',
    worstSurface: 'grass',
    playStyle: 'aggressive',
    grandSlamStats: {
      australianOpen: { bestResult: 'Winner 2024', winRate: 85 },
      rolandGarros: { bestResult: 'SF 2024', winRate: 70 },
      wimbledon: { bestResult: 'SF 2023', winRate: 65 },
      usOpen: { bestResult: 'Winner 2024', winRate: 80 },
    },
    recentForm: 95,
    strengths: ['Puissance coup droit', 'Régularité', 'Mental solide'],
    weaknesses: ['Moins à l\'aise sur herbe', 'Peut manquer de variété'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Carlos Alcaraz',
    normalizedName: 'alcaraz',
    country: 'ESP',
    ranking: 2,
    surfaceSkill: { hard: 88, clay: 95, grass: 85, indoor: 75 },
    bestSurface: 'clay',
    worstSurface: 'indoor',
    playStyle: 'aggressive',
    grandSlamStats: {
      australianOpen: { bestResult: 'QF 2024', winRate: 75 },
      rolandGarros: { bestResult: 'Winner 2024', winRate: 90 },
      wimbledon: { bestResult: 'Winner 2023-2024', winRate: 88 },
      usOpen: { bestResult: 'Winner 2022', winRate: 82 },
    },
    recentForm: 90,
    strengths: ['Drop shot', 'Vitesse', 'Tous terrains', 'Montée au filet'],
    weaknesses: ['Parfois imprécis', 'Sur-jeu parfois'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Novak Djokovic',
    normalizedName: 'djokovic',
    country: 'SRB',
    ranking: 7,
    surfaceSkill: { hard: 95, clay: 88, grass: 90, indoor: 92 },
    bestSurface: 'hard',
    worstSurface: 'clay',  // Relativement - reste excellent
    playStyle: 'defensive',
    grandSlamStats: {
      australianOpen: { bestResult: 'Winner 10x', winRate: 95 },
      rolandGarros: { bestResult: 'Winner 3x', winRate: 85 },
      wimbledon: { bestResult: 'Winner 7x', winRate: 92 },
      usOpen: { bestResult: 'Winner 4x', winRate: 88 },
    },
    recentForm: 80,  // En baisse
    strengths: ['Retour de service', 'Régularité', 'Expérience', 'Mental'],
    weaknesses: ['Âge', 'Forme récente en baisse'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Alexander Zverev',
    normalizedName: 'zverev',
    country: 'GER',
    ranking: 3,
    surfaceSkill: { hard: 88, clay: 82, grass: 75, indoor: 92 },
    bestSurface: 'indoor',
    worstSurface: 'grass',
    playStyle: 'aggressive',
    grandSlamStats: {
      australianOpen: { bestResult: 'SF 2024', winRate: 78 },
      rolandGarros: { bestResult: 'F 2024', winRate: 80 },
      wimbledon: { bestResult: 'R16', winRate: 55 },
      usOpen: { bestResult: 'F 2020', winRate: 75 },
    },
    recentForm: 88,
    strengths: ['Service puissant', 'Revers à deux mains', 'Indoor'],
    weaknesses: ['Double fautes', 'Mental en GS'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Daniil Medvedev',
    normalizedName: 'medvedev',
    country: 'RUS',
    ranking: 4,
    surfaceSkill: { hard: 92, clay: 60, grass: 70, indoor: 88 },
    bestSurface: 'hard',
    worstSurface: 'clay',
    playStyle: 'defensive',
    grandSlamStats: {
      australianOpen: { bestResult: 'F 2021-2022-2024', winRate: 82 },
      rolandGarros: { bestResult: 'R16', winRate: 40 },
      wimbledon: { bestResult: 'SF 2023', winRate: 65 },
      usOpen: { bestResult: 'Winner 2021', winRate: 85 },
    },
    recentForm: 82,
    strengths: ['Jeux de jambes', 'Retour', 'Variété', 'Imprévisible'],
    weaknesses: ['Très fragile sur terre', 'Émotions'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Taylor Fritz',
    normalizedName: 'fritz',
    country: 'USA',
    ranking: 5,
    surfaceSkill: { hard: 88, clay: 65, grass: 78, indoor: 85 },
    bestSurface: 'hard',
    worstSurface: 'clay',
    playStyle: 'aggressive',
    grandSlamStats: {
      australianOpen: { bestResult: 'QF 2024', winRate: 72 },
      rolandGarros: { bestResult: 'R16', winRate: 45 },
      wimbledon: { bestResult: 'QF 2024', winRate: 75 },
      usOpen: { bestResult: 'QF 2023', winRate: 70 },
    },
    recentForm: 85,
    strengths: ['Service', 'Coup droit puissant', 'Régularité'],
    weaknesses: ['Retour perfectible', 'Clay'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Casper Ruud',
    normalizedName: 'ruud',
    country: 'NOR',
    ranking: 6,
    surfaceSkill: { hard: 75, clay: 92, grass: 55, indoor: 70 },
    bestSurface: 'clay',
    worstSurface: 'grass',
    playStyle: 'defensive',
    grandSlamStats: {
      australianOpen: { bestResult: 'R16', winRate: 55 },
      rolandGarros: { bestResult: 'F 2022-2023', winRate: 85 },
      wimbledon: { bestResult: 'R32', winRate: 40 },
      usOpen: { bestResult: 'F 2022', winRate: 75 },
    },
    recentForm: 78,
    strengths: ['Coup droit lifté', 'Régularité sur clay', 'Montée au filet'],
    weaknesses: ['Service peu puissant', 'Herbe difficile'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Alex de Minaur',
    normalizedName: 'de minaur',
    country: 'AUS',
    ranking: 8,
    surfaceSkill: { hard: 82, clay: 70, grass: 80, indoor: 75 },
    bestSurface: 'hard',
    worstSurface: 'clay',
    playStyle: 'defensive',
    grandSlamStats: {
      australianOpen: { bestResult: 'R16', winRate: 70 },
      rolandGarros: { bestResult: 'R16', winRate: 50 },
      wimbledon: { bestResult: 'QF 2024', winRate: 72 },
      usOpen: { bestResult: 'QF 2024', winRate: 68 },
    },
    recentForm: 82,
    strengths: ['Vitesse', 'Retour', 'Couverture du court'],
    weaknesses: ['Manque de puissance', 'Service moyen'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Andrey Rublev',
    normalizedName: 'rublev',
    country: 'RUS',
    ranking: 9,
    surfaceSkill: { hard: 82, clay: 78, grass: 65, indoor: 85 },
    bestSurface: 'indoor',
    worstSurface: 'grass',
    playStyle: 'aggressive',
    grandSlamStats: {
      australianOpen: { bestResult: 'QF 2021-2024', winRate: 72 },
      rolandGarros: { bestResult: 'QF 2022', winRate: 68 },
      wimbledon: { bestResult: 'R16', winRate: 50 },
      usOpen: { bestResult: 'QF 2022-2023', winRate: 70 },
    },
    recentForm: 75,
    strengths: ['Coup droit destructeur', 'Intensité'],
    weaknesses: ['Mental en grands tournois', 'Émotions'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Stefanos Tsitsipas',
    normalizedName: 'tsitsipas',
    country: 'GRE',
    ranking: 10,
    surfaceSkill: { hard: 80, clay: 90, grass: 75, indoor: 78 },
    bestSurface: 'clay',
    worstSurface: 'indoor',
    playStyle: 'aggressive',
    grandSlamStats: {
      australianOpen: { bestResult: 'F 2023', winRate: 78 },
      rolandGarros: { bestResult: 'F 2021', winRate: 82 },
      wimbledon: { bestResult: 'R16', winRate: 55 },
      usOpen: { bestResult: 'R16', winRate: 52 },
    },
    recentForm: 72,
    strengths: ['Coup droit lifté', 'Service', 'Montée au filet'],
    weaknesses: ['Revers bouton', 'Mental sous pression'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Holger Rune',
    normalizedName: 'rune',
    country: 'DEN',
    ranking: 11,
    surfaceSkill: { hard: 78, clay: 85, grass: 68, indoor: 82 },
    bestSurface: 'clay',
    worstSurface: 'grass',
    playStyle: 'aggressive',
    grandSlamStats: {
      australianOpen: { bestResult: 'R16', winRate: 60 },
      rolandGarros: { bestResult: 'QF 2023-2024', winRate: 75 },
      wimbledon: { bestResult: 'R16', winRate: 55 },
      usOpen: { bestResult: 'R16', winRate: 58 },
    },
    recentForm: 70,
    strengths: ['Aggressivité', 'Variété de jeu'],
    weaknesses: ['Inconstance', 'Émotions'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Ben Shelton',
    normalizedName: 'shelton',
    country: 'USA',
    ranking: 12,
    surfaceSkill: { hard: 85, clay: 55, grass: 70, indoor: 80 },
    bestSurface: 'hard',
    worstSurface: 'clay',
    playStyle: 'aggressive',
    grandSlamStats: {
      australianOpen: { bestResult: 'SF 2025', winRate: 75 },
      rolandGarros: { bestResult: 'R32', winRate: 40 },
      wimbledon: { bestResult: 'R16', winRate: 60 },
      usOpen: { bestResult: 'SF 2023', winRate: 72 },
    },
    recentForm: 80,
    strengths: ['Service gauche puissant', 'Athlétisme', 'Coup droit'],
    weaknesses: ['Retour', 'Expérience', 'Clay'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Tommy Paul',
    normalizedName: 'paul',
    country: 'USA',
    ranking: 13,
    surfaceSkill: { hard: 82, clay: 70, grass: 78, indoor: 75 },
    bestSurface: 'hard',
    worstSurface: 'clay',
    playStyle: 'balanced',
    grandSlamStats: {
      australianOpen: { bestResult: 'SF 2023', winRate: 72 },
      rolandGarros: { bestResult: 'R16', winRate: 50 },
      wimbledon: { bestResult: 'R16', winRate: 65 },
      usOpen: { bestResult: 'R16', winRate: 65 },
    },
    recentForm: 78,
    strengths: ['Régularité', 'Vitesse', 'Retour'],
    weaknesses: ['Manque de arme fatale'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Grigor Dimitrov',
    normalizedName: 'dimitrov',
    country: 'BUL',
    ranking: 15,
    surfaceSkill: { hard: 82, clay: 72, grass: 88, indoor: 80 },
    bestSurface: 'grass',
    worstSurface: 'clay',
    playStyle: 'balanced',
    grandSlamStats: {
      australianOpen: { bestResult: 'SF 2017', winRate: 70 },
      rolandGarros: { bestResult: 'R16', winRate: 52 },
      wimbledon: { bestResult: 'SF 2014', winRate: 75 },
      usOpen: { bestResult: 'SF 2019', winRate: 68 },
    },
    recentForm: 75,
    strengths: ['Variété', 'Revers à une main', 'Toucher'],
    weaknesses: ['Régularité', 'Mental en clé'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Hubert Hurkacz',
    normalizedName: 'hurkacz',
    country: 'POL',
    ranking: 16,
    surfaceSkill: { hard: 82, clay: 68, grass: 85, indoor: 80 },
    bestSurface: 'grass',
    worstSurface: 'clay',
    playStyle: 'serve_volley',
    grandSlamStats: {
      australianOpen: { bestResult: 'R16', winRate: 58 },
      rolandGarros: { bestResult: 'R16', winRate: 45 },
      wimbledon: { bestResult: 'SF 2021', winRate: 72 },
      usOpen: { bestResult: 'R16', winRate: 55 },
    },
    recentForm: 72,
    strengths: ['Service', 'Volley', 'Herbe'],
    weaknesses: ['Retour', 'Fundamentals du fond'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Arthur Fils',
    normalizedName: 'fils',
    country: 'FRA',
    ranking: 18,
    surfaceSkill: { hard: 78, clay: 85, grass: 60, indoor: 75 },
    bestSurface: 'clay',
    worstSurface: 'grass',
    playStyle: 'aggressive',
    grandSlamStats: {
      australianOpen: { bestResult: 'R32', winRate: 55 },
      rolandGarros: { bestResult: 'R16', winRate: 68 },
      wimbledon: { bestResult: 'R64', winRate: 40 },
      usOpen: { bestResult: 'R32', winRate: 50 },
    },
    recentForm: 78,
    strengths: ['Puissance', 'Jeune talent', 'Clay'],
    weaknesses: ['Expérience', 'Inconstance'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Jack Draper',
    normalizedName: 'draper',
    country: 'GBR',
    ranking: 19,
    surfaceSkill: { hard: 80, clay: 65, grass: 82, indoor: 78 },
    bestSurface: 'grass',
    worstSurface: 'clay',
    playStyle: 'aggressive',
    grandSlamStats: {
      australianOpen: { bestResult: 'R32', winRate: 55 },
      rolandGarros: { bestResult: 'R32', winRate: 42 },
      wimbledon: { bestResult: 'R16', winRate: 65 },
      usOpen: { bestResult: 'SF 2024', winRate: 70 },
    },
    recentForm: 82,
    strengths: ['Service gauche', 'Coup droit', 'Herbe'],
    weaknesses: ['Blessures fréquentes', 'Clay'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Ugo Humbert',
    normalizedName: 'humbert',
    country: 'FRA',
    ranking: 14,
    surfaceSkill: { hard: 85, clay: 62, grass: 75, indoor: 82 },
    bestSurface: 'indoor',
    worstSurface: 'clay',
    playStyle: 'aggressive',
    grandSlamStats: {
      australianOpen: { bestResult: 'R32', winRate: 55 },
      rolandGarros: { bestResult: 'R32', winRate: 40 },
      wimbledon: { bestResult: 'R16', winRate: 62 },
      usOpen: { bestResult: 'R16', winRate: 58 },
    },
    recentForm: 76,
    strengths: ['Service', 'Revers', 'Indoor'],
    weaknesses: ['Retour', 'Clay', 'Mental'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
];

// ============================================
// BASE DE DONNÉES WTA (TOP 15)
// ============================================

export const WTA_PLAYER_DATABASE: PlayerProfile[] = [
  {
    name: 'Aryna Sabalenka',
    normalizedName: 'sabalenka',
    country: 'BLR',
    ranking: 1,
    surfaceSkill: { hard: 95, clay: 78, grass: 82, indoor: 88 },
    bestSurface: 'hard',
    worstSurface: 'clay',
    playStyle: 'aggressive',
    grandSlamStats: {
      australianOpen: { bestResult: 'Winner 2023-2024', winRate: 92 },
      rolandGarros: { bestResult: 'SF 2023', winRate: 70 },
      wimbledon: { bestResult: 'SF 2023', winRate: 78 },
      usOpen: { bestResult: 'F 2023', winRate: 85 },
    },
    recentForm: 92,
    strengths: ['Puissance', 'Service', 'Aggressivité'],
    weaknesses: ['Double fautes', 'Parfois imprécise'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Iga Swiatek',
    normalizedName: 'swiatek',
    country: 'POL',
    ranking: 2,
    surfaceSkill: { hard: 85, clay: 98, grass: 65, indoor: 78 },
    bestSurface: 'clay',
    worstSurface: 'grass',
    playStyle: 'aggressive',
    grandSlamStats: {
      australianOpen: { bestResult: 'R16', winRate: 72 },
      rolandGarros: { bestResult: 'Winner 2020-2022-2023-2024', winRate: 95 },
      wimbledon: { bestResult: 'QF 2023', winRate: 58 },
      usOpen: { bestResult: 'Winner 2022', winRate: 82 },
    },
    recentForm: 88,
    strengths: ['Coup droit lifté', 'Variété', 'Clay dominatrice'],
    weaknesses: ['Herbe', 'Service parfois moyen'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Coco Gauff',
    normalizedName: 'gauff',
    country: 'USA',
    ranking: 3,
    surfaceSkill: { hard: 88, clay: 80, grass: 75, indoor: 82 },
    bestSurface: 'hard',
    worstSurface: 'grass',
    playStyle: 'defensive',
    grandSlamStats: {
      australianOpen: { bestResult: 'SF 2024', winRate: 78 },
      rolandGarros: { bestResult: 'F 2022', winRate: 75 },
      wimbledon: { bestResult: 'R16', winRate: 60 },
      usOpen: { bestResult: 'Winner 2023', winRate: 88 },
    },
    recentForm: 85,
    strengths: ['Vitesse', 'Retour', 'Défense'],
    weaknesses: ['Service instable', 'Coup droit parfois court'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Jessica Pegula',
    normalizedName: 'pegula',
    country: 'USA',
    ranking: 4,
    surfaceSkill: { hard: 88, clay: 72, grass: 70, indoor: 80 },
    bestSurface: 'hard',
    worstSurface: 'grass',
    playStyle: 'balanced',
    grandSlamStats: {
      australianOpen: { bestResult: 'QF 2021-2022-2023', winRate: 80 },
      rolandGarros: { bestResult: 'QF 2022', winRate: 65 },
      wimbledon: { bestResult: 'R16', winRate: 52 },
      usOpen: { bestResult: 'QF 2022', winRate: 78 },
    },
    recentForm: 82,
    strengths: ['Régularité', 'Retour', 'Fundamentals solides'],
    weaknesses: ['Pas d\'arme fatale', 'GS breakthrough manquant'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Elena Rybakina',
    normalizedName: 'rybakina',
    country: 'KAZ',
    ranking: 5,
    surfaceSkill: { hard: 82, clay: 70, grass: 92, indoor: 75 },
    bestSurface: 'grass',
    worstSurface: 'clay',
    playStyle: 'aggressive',
    grandSlamStats: {
      australianOpen: { bestResult: 'F 2023', winRate: 80 },
      rolandGarros: { bestResult: 'QF 2024', winRate: 62 },
      wimbledon: { bestResult: 'Winner 2022', winRate: 88 },
      usOpen: { bestResult: 'R16', winRate: 58 },
    },
    recentForm: 80,
    strengths: ['Service', 'Coup droit plat', 'Herbe'],
    weaknesses: ['Inconstance', 'Problèmes physiques'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Qinwen Zheng',
    normalizedName: 'zheng',
    country: 'CHN',
    ranking: 6,
    surfaceSkill: { hard: 85, clay: 72, grass: 65, indoor: 78 },
    bestSurface: 'hard',
    worstSurface: 'grass',
    playStyle: 'aggressive',
    grandSlamStats: {
      australianOpen: { bestResult: 'F 2024', winRate: 82 },
      rolandGarros: { bestResult: 'R16', winRate: 58 },
      wimbledon: { bestResult: 'R32', winRate: 48 },
      usOpen: { bestResult: 'QF 2024', winRate: 72 },
    },
    recentForm: 85,
    strengths: ['Service', 'Puissance', 'Montée rapide'],
    weaknesses: ['Expérience', 'Variété'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Jasmine Paolini',
    normalizedName: 'paolini',
    country: 'ITA',
    ranking: 7,
    surfaceSkill: { hard: 75, clay: 88, grass: 70, indoor: 72 },
    bestSurface: 'clay',
    worstSurface: 'indoor',
    playStyle: 'defensive',
    grandSlamStats: {
      australianOpen: { bestResult: 'R16', winRate: 60 },
      rolandGarros: { bestResult: 'F 2024', winRate: 82 },
      wimbledon: { bestResult: 'F 2024', winRate: 78 },
      usOpen: { bestResult: 'R16', winRate: 55 },
    },
    recentForm: 88,
    strengths: ['Vitesse', 'Régularité', 'Mental'],
    weaknesses: ['Taille (1.63m)', 'Service peu puissant'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Madison Keys',
    normalizedName: 'keys',
    country: 'USA',
    ranking: 13,
    surfaceSkill: { hard: 88, clay: 68, grass: 82, indoor: 80 },
    bestSurface: 'hard',
    worstSurface: 'clay',
    playStyle: 'aggressive',
    grandSlamStats: {
      australianOpen: { bestResult: 'SF 2022', winRate: 72 },
      rolandGarros: { bestResult: 'R16', winRate: 48 },
      wimbledon: { bestResult: 'QF 2023', winRate: 70 },
      usOpen: { bestResult: 'F 2017', winRate: 75 },
    },
    recentForm: 78,
    strengths: ['Puissance', 'Service', 'Coup droit'],
    weaknesses: ['Blessures', 'Inconstance'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Danielle Collins',
    normalizedName: 'collins',
    country: 'USA',
    ranking: 11,
    surfaceSkill: { hard: 85, clay: 72, grass: 65, indoor: 78 },
    bestSurface: 'hard',
    worstSurface: 'grass',
    playStyle: 'aggressive',
    grandSlamStats: {
      australianOpen: { bestResult: 'F 2022', winRate: 78 },
      rolandGarros: { bestResult: 'R16', winRate: 55 },
      wimbledon: { bestResult: 'R16', winRate: 52 },
      usOpen: { bestResult: 'SF 2024', winRate: 72 },
    },
    recentForm: 82,
    strengths: ['Aggressivité', 'Retour', 'Détermination'],
    weaknesses: ['Émotions', 'Parfois trop risquée'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
  {
    name: 'Daria Kasatkina',
    normalizedName: 'kasatkina',
    country: 'RUS',
    ranking: 9,
    surfaceSkill: { hard: 75, clay: 82, grass: 60, indoor: 70 },
    bestSurface: 'clay',
    worstSurface: 'grass',
    playStyle: 'defensive',
    grandSlamStats: {
      australianOpen: { bestResult: 'R16', winRate: 58 },
      rolandGarros: { bestResult: 'SF 2022', winRate: 75 },
      wimbledon: { bestResult: 'R16', winRate: 45 },
      usOpen: { bestResult: 'QF 2024', winRate: 62 },
    },
    recentForm: 75,
    strengths: ['Variété', 'Drop shots', 'Intelligence de jeu'],
    weaknesses: ['Manque de puissance', 'Herbe'],
    returningFromInjury: false,
    lastUpdated: '2025-01-15',
  },
];

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

export function findPlayerProfile(name: string, category: 'atp' | 'wta' = 'atp'): PlayerProfile | null {
  const normalized = name.toLowerCase().replace(/[^a-z ]/g, '').trim();
  const database = category === 'atp' ? ATP_PLAYER_DATABASE : WTA_PLAYER_DATABASE;
  
  // Recherche exacte
  for (const player of database) {
    if (player.normalizedName === normalized) return player;
  }
  
  // Recherche partielle
  for (const player of database) {
    if (player.normalizedName.includes(normalized) || normalized.includes(player.normalizedName)) {
      return player;
    }
  }
  
  return null;
}

export function getSurfaceAdvantage(profile: PlayerProfile, surface: Surface): number {
  const baseScore = profile.surfaceSkill[surface];
  const avgScore = Object.values(profile.surfaceSkill).reduce((a, b) => a + b, 0) / 4;
  
  // Score relatif par rapport à la moyenne du joueur
  const relativeScore = baseScore - avgScore;
  
  // Bonus si c'est sa meilleure surface
  if (profile.bestSurface === surface) return relativeScore + 10;
  
  // Malus si c'est sa pire surface
  if (profile.worstSurface === surface) return relativeScore - 10;
  
  return relativeScore;
}

export function getGrandSlamPerformance(profile: PlayerProfile, tournament: string): number {
  const normalized = tournament.toLowerCase();
  
  if (normalized.includes('australian') || normalized.includes('melbourne')) {
    return profile.grandSlamStats.australianOpen.winRate;
  }
  if (normalized.includes('roland') || normalized.includes('french') || normalized.includes('paris')) {
    return profile.grandSlamStats.rolandGarros.winRate;
  }
  if (normalized.includes('wimbledon') || normalized.includes('london')) {
    return profile.grandSlamStats.wimbledon.winRate;
  }
  if (normalized.includes('us open') || normalized.includes('new york') || normalized.includes('flushing')) {
    return profile.grandSlamStats.usOpen.winRate;
  }
  
  return 70; // Défaut
}

export function calculateFormBoost(profile: PlayerProfile): number {
  // Forme récente sur 100
  const recentForm = profile.recentForm;
  
  // Bonus/malus
  let boost = 0;
  
  if (recentForm >= 90) boost = 10;
  else if (recentForm >= 80) boost = 5;
  else if (recentForm < 60) boost = -10;
  else if (recentForm < 70) boost = -5;
  
  // Malus si retour de blessure
  if (profile.returningFromInjury) {
    boost -= 15;
  }
  
  return boost;
}

export default {
  ATP_PLAYER_DATABASE,
  WTA_PLAYER_DATABASE,
  findPlayerProfile,
  getSurfaceAdvantage,
  getGrandSlamPerformance,
  calculateFormBoost,
};
