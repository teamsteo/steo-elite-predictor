/**
 * Tennis Data Sources 2026 - URLs et configuration pour données tennis
 * 
 * SOURCES PRINCIPALES:
 * 1. Jeff Sackmann GitHub - Classements ATP/WTA GRATUITS (mise à jour hebdomadaire)
 * 2. BetExplorer - Matchs et cotes en temps réel
 * 3. The Odds API - Cotes de multiples bookmakers (API key requise)
 * 
 * NOTE: Nous sommes en 2026 - toutes les URLs utilisent 2026
 */

// ============================================
// JEFF SACKMANN DATA - GRATUIT ET FIABLE
// ============================================

export const JEFF_SACKMANN_URLS = {
  // Classements ATP Singles - 2026
  atpSingles: 'https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_rankings_current.csv',
  
  // Classements WTA Singles - 2026  
  wtaSingles: 'https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master/wta_rankings_current.csv',
  
  // Infos joueurs ATP (noms, pays, date de naissance)
  atpPlayers: 'https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_players.csv',
  
  // Infos joueuses WTA
  wtaPlayers: 'https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master/wta_players.csv',
  
  // Matchs ATP 2026 (tous les tournois)
  atpMatches2026: 'https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_matches_2026.csv',
  
  // Matchs WTA 2026
  wtaMatches2026: 'https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master/wta_matches_2026.csv',
  
  // Matchs ATP 2025 (pour historique récent)
  atpMatches2025: 'https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_matches_2025.csv',
  
  // Matchs WTA 2025
  wtaMatches2025: 'https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master/wta_matches_2025.csv',
  
  // Statistiques de match détaillées (si disponibles)
  atpMatchStats: 'https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_matches_stats_2026.csv',
};

// ============================================
// ALTERNATIVE: LIVE TENNIS EU (fallback)
// ============================================

export const LIVE_TENNIS_URLS = {
  atpRankings: 'https://www.livetennis.eu/en/atp-ranking/',
  wtaRankings: 'https://www.livetennis.eu/en/wta-ranking/',
};

// ============================================
// BETEXPLORER - MATCHS ET COTES
// ============================================

export const BETEXPLORER_URLS = {
  nextMatches: 'https://www.betexplorer.com/tennis/next/',
  atpSingles: 'https://www.betexplorer.com/tennis/atp-singles/',
  wtaSingles: 'https://www.betexplorer.com/tennis/wta-singles/',
  challenger: 'https://www.betexplorer.com/tennis/challenger-men-singles/',
  results: 'https://www.betexplorer.com/results/tennis/',
};

// ============================================
// THE ODDS API (nécessite API key)
// ============================================

export const ODDS_API_CONFIG = {
  baseUrl: 'https://api.the-odds-api.com/v4',
  endpoints: {
    tennisOdds: '/sports/tennis/odds/',
    tennisEvents: '/sports/tennis/events/',
  },
  //apiKey: process.env.ODDS_API_KEY, // Configuré dans .env
};

// ============================================
// ATP TOUR OFFICIEL (données officielles)
// ============================================

export const ATP_TOUR_URLS = {
  rankings: 'https://www.atptour.com/en/rankings/singles',
  rankingsLive: 'https://www.atptour.com/en/rankings/singles?rankDate=2026-06-02&rankRange=1-500',
  players: 'https://www.atptour.com/en/players',
  tournaments: 'https://www.atptour.com/en/tournaments',
};

// ============================================
// CACHE CONFIGURATION
// ============================================

export const CACHE_CONFIG = {
  // Classements: mise à jour quotidienne ( données Jeff Sackmann)
  rankings: {
    ttlHours: 24,
    source: 'jeff_sackmann',
    priority: 1, // Source prioritaire
  },
  
  // Infos joueurs: mise à jour hebdomadaire
  players: {
    ttlHours: 168, // 7 jours
    source: 'jeff_sackmann',
  },
  
  // Matchs historiques: pas de cache (statiques)
  historicalMatches: {
    ttlHours: Infinity,
    source: 'jeff_sackmann',
  },
  
  // Cotes live: mise à jour fréquente
  odds: {
    ttlMinutes: 30,
    source: 'betexplorer',
  },
  
  // Matchs à venir: mise à jour horaire
  upcomingMatches: {
    ttlHours: 1,
    source: 'betexplorer',
  },
  
  // Prédictions: recalculées si cotes changent
  predictions: {
    ttlMinutes: 30,
    recalculateOnOddsChange: true,
  },
};

// ============================================
// STRUCTURE DES DONNÉES JEFF SACKMANN
// ============================================

export interface JeffSackmannRanking {
  ranking_date: string;   // Date du classement (YYYYMMDD)
  rank: number;           // Position
  player_id: string;      // ID unique du joueur
  points: number;         // Points ATP/WTA
  odd: number;            // Position précédente
  movement: number;       // Mouvement (calculé)
}

export interface JeffSackmannPlayer {
  player_id: string;      // ID unique
  name_first: string;     // Prénom
  name_last: string;      // Nom
  hand: string;           // R/D/A (droitier/gaucher/ambidextre)
  ioc: string;            // Code pays ISO
  birth_date: string;     // Date de naissance (YYYYMMDD)
  height: number;         // Taille en cm
}

export interface JeffSackmannMatch {
  tourney_id: string;     // ID du tournoi
  tourney_name: string;   // Nom du tournoi
  surface: string;        // Hard/Clay/Grass/Carpet
  draw_size: number;      // Taille du tableau
  tourney_level: string;  // G/M/A/D (Grand Chelem/Masters/ATP 250/500)
  tourney_date: string;   // Date (YYYYMMDD)
  match_num: number;      // Numéro du match
  winner_id: string;      // ID du gagnant
  winner_seed: number;    // Tête de série du gagnant
  winner_entry: string;   // Type d'entrée (WC, Q, LL)
  winner_name: string;    // Nom du gagnant
  winner_hand: string;    // R/D/A
  winner_ht: number;      // Taille
  winner_ioc: string;     // Pays
  winner_age: number;     // Âge
  winner_rank: number;    // Classement
  winner_rank_points: number; // Points
  loser_id: string;       // ID du perdant
  loser_seed: number;
  loser_entry: string;
  loser_name: string;
  loser_hand: string;
  loser_ht: number;
  loser_ioc: string;
  loser_age: number;
  loser_rank: number;
  loser_rank_points: number;
  score: string;          // Score du match
  best_of: number;        // 3 ou 5 sets
  round: string;          // R128, R64, R32, R16, QF, SF, F
  minutes: number;        // Durée en minutes
  w_ace: number;          // Aces gagnant
  w_df: number;           // Double fautes gagnant
  w_svPt: number;         // Points de service
  w_1stIn: number;        // premiers services
  w_1stWon: number;       // Points gagnés sur 1er service
  w_2ndWon: number;       // Points gagnés sur 2e service
  w_SvGms: number;        // Jeux de service
  w_bpSaved: number;      // Balles de break sauvées
  w_bpFaced: number;      // Balles de break confrontées
  l_ace: number;          // Même chose pour le perdant
  l_df: number;
  l_svPt: number;
  l_1stIn: number;
  l_1stWon: number;
  l_2ndWon: number;
  l_SvGms: number;
  l_bpSaved: number;
  l_bpFaced: number;
}

// ============================================
// TOURNOIS IMPORTANTS 2026
// ============================================

export const MAJOR_TOURNAMENTS_2026 = {
  grandSlams: [
    { name: 'Australian Open', date: '2026-01-19', surface: 'hard', location: 'Melbourne' },
    { name: 'Roland Garros', date: '2026-05-24', surface: 'clay', location: 'Paris' },
    { name: 'Wimbledon', date: '2026-06-29', surface: 'grass', location: 'London' },
    { name: 'US Open', date: '2026-08-31', surface: 'hard', location: 'New York' },
  ],
  masters1000: [
    { name: 'Indian Wells', date: '2026-03-05', surface: 'hard' },
    { name: 'Miami Open', date: '2026-03-19', surface: 'hard' },
    { name: 'Monte Carlo', date: '2026-04-09', surface: 'clay' },
    { name: 'Madrid Open', date: '2026-04-26', surface: 'clay' },
    { name: 'Italian Open', date: '2026-05-07', surface: 'clay' },
    { name: 'Canadian Open', date: '2026-08-07', surface: 'hard' },
    { name: 'Cincinnati', date: '2026-08-14', surface: 'hard' },
    { name: 'Shanghai', date: '2026-10-09', surface: 'hard' },
    { name: 'Paris Masters', date: '2026-10-30', surface: 'hard' },
  ],
  atpFinals: [
    { name: 'ATP Finals', date: '2026-11-13', surface: 'hard', location: 'Turin' },
  ],
};
