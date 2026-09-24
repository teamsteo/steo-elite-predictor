/**
 * Tennis V3 — Types partagés
 * Nouveau moteur 2026 : données tennis-data.co.uk (résultats+cotes clôture),
 * Elo auto-calculé (Sackmann GitHub SUPPRIMÉ — voir audit 24/09/2026).
 */

export type V3Surface = 'Hard' | 'Clay' | 'Grass';

/** Rating Elo d'un joueur (piste overall + 3 surfaces) */
export interface V3Rating {
  overall: number;
  hard: number;
  clay: number;
  grass: number;
  games: number;
}

/** Match normalisé (seed tennis-data ou xlsx courant) */
export interface V3Match {
  date: string; // YYYY-MM-DD
  w: string; // clé canonique gagnant
  l: string;
  surface: V3Surface;
  court: string; // Outdoor / Indoor
  series: string; // GS / ATP1000 / ATP500 / ATP250 / Challenger / ITF ...
  tourney: string;
  round: string;
  bo5: boolean;
  wsets: number;
  lsets: number;
  walkover: boolean;
  wrank: number;
  lrank: number;
  wpts: number;
  lpts: number;
}

/** Seed précalculé (build_tennis_seed.py, ~130 Ko gz, commité) */
export interface V3PlayerStats {
  hw: number; hl: number; // hard W/L
  cw: number; cl: number; // clay
  gw: number; gl: number; // grass
  iw: number; il: number; // indoor
  bo5: number; // matchs Bo5 joués
  m: number; // total matchs
  rank: number; // dernier rang connu
  pts: number; // derniers points ATP/WTA connus
}

export interface V3Seed {
  generatedAt: string;
  algoVersion: string;
  sources: string[];
  license: string;
  ratings: Record<string, V3Rating>;
  playerStats: Record<string, V3PlayerStats>;
  displayNames: Record<string, string>;
  recentMatches: V3Match[]; // 150 derniers jours
  lastSeen: Record<string, string>;
  counts: { total: number; recent: number };
}

/** Profil facteurs d'un joueur pour un match donné (calculé à la demande) */
export interface V3PlayerProfile {
  key: string;
  display: string;
  rating: V3Rating; // Elo à jour (seed + incrémental)
  lastSeen: string; // YYYY-MM-DD
  daysAbsent: number;
  // Facteur 2 : proxy service/retour = dominance sets/games récents
  dominance: number; // 0..1 (0.5 = neutre)
  dominanceSample: number;
  // Facteur 3 : forme pondérée par qualité d'adversaire
  formScore: number; // 0..1 (0.5 neutre)
  formSample: number;
  // Facteur 4 : spécialisation surface (career, shrinkage)
  surfaceWinRate: number; // 0..1
  surfaceMatches: number;
  overallWinRate: number;
  // Facteur 5 : contexte matchup
  rankPoints: number;
  bo5Experience: number; // nb matchs Bo5 carrière (seed window)
  // Facteur 6 : H2H
  h2h: { wins: number; losses: number; surfaceWins: number; surfaceLosses: number; last: string | null };
  // Facteur 7 : conditions
  indoorWinRate: number | null; // null si sample < 10
  matchesLast7d: number;
  matchesLast21d: number;
  // Veto
  lastMatchWalkover: boolean; // walkover/abandon dans le dernier match connu
}

export type V3VetoReason =
  | 'walkover_recent'
  | 'absence_longue'
  | 'surcharge_matchs'
  | 'flag_manuel'
  | 'donnees_insuffisantes';

export interface V3Factor {
  key: string;
  label: string;
  weight: number;
  score: number; // 0..1, 0.5 = neutre (probabilité joueur1)
  detail: string;
}

export interface V3Decision {
  tier: 'green' | 'yellow' | 'red';
  label: string; // 🟢 CANDIDAT / 🟡 PRUDENCE / 🔴 NO BET
  probPlayer1: number; // 0..1 (calibrée)
  rawProbPlayer1: number; // avant calibration
  consensus: number; // nb facteurs alignés avec le favori (sur 7)
  betRecommended: boolean;
  veto: V3VetoReason | null;
  value: {
    odds: number; // cote du pick
    impliedProb: number; // proba implicite sans marge
    edge: number; // p_model - p_implied
    ev: number; // p_model * odds - 1
    kelly: number; // fraction Kelly (cap 5%)
  } | null;
  reasons: string[];
}

export interface V3Prediction {
  matchId: string;
  player1: string;
  player2: string;
  tournament: string;
  tournamentTier: string;
  surface: string;
  round: string;
  date: string;
  category: string;
  odds1: number;
  odds2: number;
  winner: 'player1' | 'player2';
  winnerName: string;
  factors: V3Factor[];
  decision: V3Decision;
  dataSource: string;
  modelVersion: string;
}
