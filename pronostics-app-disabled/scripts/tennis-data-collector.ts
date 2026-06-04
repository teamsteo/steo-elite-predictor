/**
 * Tennis Data Collector - Collecte de données tennis pour prédictions ML
 * 
 * Sources:
 * 1. BetExplorer - Matchs, cotes, résultats historiques
 * 2. ATP/WTA Rankings (via scraping)
 * 3. Données calculées localement (forme, H2H, surface performance)
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// INTERFACES
// ============================================

interface TennisPlayer {
  id: string;
  name: string;
  country: string;
  ranking: number;
  rankingPoints: number;
  // Performance par surface (derniers 12 mois)
  surfaceStats: {
    hard: { wins: number; losses: number; winRate: number };
    clay: { wins: number; losses: number; winRate: number };
    grass: { wins: number; losses: number; winRate: number };
    carpet: { wins: number; losses: number; winRate: number };
  };
  // Forme récente (derniers 10 matchs)
  recentForm: {
    wins: number;
    losses: number;
    winStreak: number;
    last10: ('W' | 'L')[];
  };
  // Stats avancées
  serveStats: {
    acesPerMatch: number;
    doubleFaultsPerMatch: number;
    firstServePct: number;
    breakPointsSaved: number;
  };
  returnStats: {
    breakPointsConverted: number;
    returnGamesWon: number;
  };
  lastUpdated: string;
}

interface H2HRecord {
  player1Id: string;
  player2Id: string;
  player1Wins: number;
  player2Wins: number;
  totalMatches: number;
  lastMeeting?: string;
  surfaceBreakdown: {
    hard: { p1: number; p2: number };
    clay: { p1: number; p2: number };
    grass: { p1: number; p2: number };
  };
}

interface TennisMatch {
  id: string;
  player1: string;
  player2: string;
  player1Id: string;
  player2Id: string;
  tournament: string;
  tournamentId: string;
  surface: 'hard' | 'clay' | 'grass' | 'carpet';
  round: string;
  date: string;
  odds1: number;
  odds2: number;
  status: 'scheduled' | 'live' | 'finished';
  score?: string;
  winner?: string;
  category: 'atp' | 'wta' | 'challenger' | 'itf';
}

interface PlayerDatabase {
  players: Record<string, TennisPlayer>;
  h2h: Record<string, H2HRecord>;
  lastUpdated: string;
}

// ============================================
// CONFIGURATION
// ============================================

const DATA_DIR = path.join(process.cwd(), 'data');
const PLAYERS_FILE = path.join(DATA_DIR, 'tennis-players.json');
const MATCHES_FILE = path.join(DATA_DIR, 'tennis-matches-history.json');
const H2H_FILE = path.join(DATA_DIR, 'tennis-h2h.json');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache'
};

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function generatePlayerId(name: string): string {
  const normalized = normalizePlayerName(name);
  return `player_${normalized}_${name.length}`;
}

function detectSurface(tournamentName: string): 'hard' | 'clay' | 'grass' | 'carpet' {
  const name = tournamentName.toLowerCase();
  
  // Gazon
  if (name.includes('wimbledon') || name.includes('halle') || name.includes('queen') || 
      name.includes('eastbourne') || name.includes('s-hertogenbosch') || name.includes('stuttgart')) {
    return 'grass';
  }
  
  // Terre battue
  if (name.includes('roland') || name.includes('garros') || name.includes('clay') || 
      name.includes('monte carlo') || name.includes('barcelona') || name.includes('rome') ||
      name.includes('hamburg') || name.includes('santiago') || name.includes('buenos aires') ||
      name.includes('rio') || name.includes('casablanca') || name.includes('houston') ||
      name.includes('cap cana') || name.includes('kigali') || name.includes('estoril') ||
      name.includes('geneva') || name.includes('lyon') || name.includes('gstaad') ||
      name.includes('kitzbuhel') || name.includes('umag') || name.includes('bastad')) {
    return 'clay';
  }
  
  // Indoor/Moquette
  if (name.includes('indoor') || name.includes('metz') || name.includes('vienna') || 
      name.includes('basel') || name.includes('stockholm') || name.includes('montpellier') ||
      name.includes('rotterdam') || name.includes('marseille') || name.includes('cherbourg') ||
      name.includes('davis cup') || name.includes('finals') || name.includes('atp finals')) {
    return 'carpet';
  }
  
  return 'hard';
}

function detectCategory(url: string): 'atp' | 'wta' | 'challenger' | 'itf' {
  if (url.includes('atp-singles') || url.includes('atp-doubles')) return 'atp';
  if (url.includes('wta-singles') || url.includes('wta-doubles')) return 'wta';
  if (url.includes('challenger')) return 'challenger';
  if (url.includes('itf')) return 'itf';
  return 'atp';
}

function slugToPlayerNames(slug: string): { player1: string; player2: string } {
  const parts = slug.split('-');
  const half = Math.floor(parts.length / 2);
  
  const formatName = (nameParts: string[]) => {
    return nameParts
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
  };
  
  return {
    player1: formatName(parts.slice(0, half)),
    player2: formatName(parts.slice(half))
  };
}

// ============================================
// COLLECTE BETEXPLORER
// ============================================

async function fetchBetExplorerMatches(): Promise<TennisMatch[]> {
  const matches: TennisMatch[] = [];
  const seenMatches = new Set<string>();
  
  try {
    console.log('📊 Récupération matchs BetExplorer...');
    
    const res = await fetch('https://www.betexplorer.com/tennis/next/', {
      headers: HEADERS,
      next: { revalidate: 60 }
    });
    
    if (!res.ok) {
      console.log(`⚠️ BetExplorer status: ${res.status}`);
      return matches;
    }
    
    const html = await res.text();
    
    // Extraire les liens de matchs
    const matchLinkRegex = /href="\/tennis\/([a-z-]+)\/([a-z-]+)\/([a-z-]+)\/([a-zA-Z0-9]+)\/"/g;
    const oddsRegex = /data-odd="(\d+\.?\d*)"/g;
    
    // Extraire toutes les cotes
    const allOdds: number[] = [];
    let oddsMatch;
    while ((oddsMatch = oddsRegex.exec(html)) !== null) {
      allOdds.push(parseFloat(oddsMatch[1]));
    }
    
    let oddsIndex = 0;
    let matchLink;
    
    while ((matchLink = matchLinkRegex.exec(html)) !== null) {
      const categoryPath = matchLink[1];
      const tournamentSlug = matchLink[2];
      const playersSlug = matchLink[3];
      const matchId = matchLink[4];
      
      const matchKey = `${categoryPath}_${tournamentSlug}_${matchId}`;
      if (seenMatches.has(matchKey)) continue;
      seenMatches.add(matchKey);
      
      const category = detectCategory(categoryPath);
      const tournament = tournamentSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const surface = detectSurface(tournament);
      const { player1, player2 } = slugToPlayerNames(playersSlug);
      
      const odds1 = allOdds[oddsIndex] || 1.85;
      const odds2 = allOdds[oddsIndex + 1] || 1.85;
      oddsIndex += 2;
      
      matches.push({
        id: `betexp_${matchId}`,
        player1,
        player2,
        player1Id: generatePlayerId(player1),
        player2Id: generatePlayerId(player2),
        tournament,
        tournamentId: tournamentSlug,
        surface,
        round: 'Match',
        date: new Date().toISOString(),
        odds1,
        odds2,
        status: 'scheduled',
        category
      });
    }
    
    console.log(`✅ ${matches.length} matchs récupérés`);
    
  } catch (error) {
    console.error('Erreur BetExplorer:', error);
  }
  
  return matches;
}

// ============================================
// COLLECTE RÉSULTATS HISTORIQUES
// ============================================

async function fetchHistoricalResults(tournament: string, category: string): Promise<{
  matches: TennisMatch[];
  playerUpdates: Map<string, Partial<TennisPlayer>>;
}> {
  const matches: TennisMatch[] = [];
  const playerUpdates = new Map<string, Partial<TennisPlayer>>();
  
  try {
    const url = `https://www.betexplorer.com/tennis/${category}/${tournament}/`;
    
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return { matches, playerUpdates };
    
    const html = await res.text();
    
    // Parser les résultats
    const resultRegex = /href="\/tennis\/([a-z-]+)\/([a-z-]+)\/([a-z-]+)\/([a-zA-Z0-9]+)\/">([^<]+)<\/a>/g;
    const oddsRegex = /data-odd="(\d+\.?\d*)"/g;
    
    const allOdds: number[] = [];
    let oddsMatch;
    while ((oddsMatch = oddsRegex.exec(html)) !== null) {
      allOdds.push(parseFloat(oddsMatch[1]));
    }
    
    let oddsIndex = 0;
    let resultMatch;
    
    while ((resultMatch = resultRegex.exec(html)) !== null) {
      const categoryPath = resultMatch[1];
      const tournamentSlug = resultMatch[2];
      const playersSlug = resultMatch[3];
      const matchId = resultMatch[4];
      const score = resultMatch[5].trim();
      
      // Ignorer les liens de navigation
      if (!score.match(/[0-9]:[0-9]/)) continue;
      
      const { player1, player2 } = slugToPlayerNames(playersSlug);
      const p1Id = generatePlayerId(player1);
      const p2Id = generatePlayerId(player2);
      
      const odds1 = allOdds[oddsIndex] || 1.85;
      const odds2 = allOdds[oddsIndex + 1] || 1.85;
      oddsIndex += 2;
      
      // Déterminer le gagnant depuis le score
      const sets = score.match(/(\d):(\d)/);
      let winner = '';
      if (sets) {
        const s1 = parseInt(sets[1]);
        const s2 = parseInt(sets[2]);
        winner = s1 > s2 ? player1 : player2;
      }
      
      matches.push({
        id: `hist_${matchId}`,
        player1,
        player2,
        player1Id: p1Id,
        player2Id: p2Id,
        tournament: tournamentSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        tournamentId: tournamentSlug,
        surface: detectSurface(tournamentSlug),
        round: 'Match',
        date: new Date().toISOString(),
        odds1,
        odds2,
        status: 'finished',
        score,
        winner,
        category: detectCategory(categoryPath)
      });
    }
    
  } catch (error) {
    console.error(`Erreur résultats ${tournament}:`, error);
  }
  
  return { matches, playerUpdates };
}

// ============================================
// CALCUL STATS JOUEURS
// ============================================

async function calculatePlayerStats(
  historicalMatches: TennisMatch[]
): Promise<Map<string, TennisPlayer>> {
  const players = new Map<string, TennisPlayer>();
  
  for (const match of historicalMatches) {
    // Initialiser joueurs si nécessaire
    if (!players.has(match.player1Id)) {
      players.set(match.player1Id, createEmptyPlayer(match.player1Id, match.player1));
    }
    if (!players.has(match.player2Id)) {
      players.set(match.player2Id, createEmptyPlayer(match.player2Id, match.player2));
    }
    
    const p1 = players.get(match.player1Id)!;
    const p2 = players.get(match.player2Id)!;
    
    // Mettre à jour les stats si match terminé
    if (match.status === 'finished' && match.winner) {
      const surface = match.surface;
      
      if (match.winner === match.player1) {
        p1.surfaceStats[surface].wins++;
        p2.surfaceStats[surface].losses++;
        p1.recentForm.wins++;
        p1.recentForm.last10.push('W');
        p2.recentForm.losses++;
        p2.recentForm.last10.push('L');
      } else {
        p1.surfaceStats[surface].losses++;
        p2.surfaceStats[surface].wins++;
        p1.recentForm.losses++;
        p1.recentForm.last10.push('L');
        p2.recentForm.wins++;
        p2.recentForm.last10.push('W');
      }
      
      // Garder seulement les 10 derniers
      if (p1.recentForm.last10.length > 10) p1.recentForm.last10.shift();
      if (p2.recentForm.last10.length > 10) p2.recentForm.last10.shift();
    }
  }
  
  // Calculer les win rates
  for (const player of players.values()) {
    for (const surface of ['hard', 'clay', 'grass', 'carpet'] as const) {
      const stats = player.surfaceStats[surface];
      const total = stats.wins + stats.losses;
      stats.winRate = total > 0 ? (stats.wins / total) * 100 : 0;
    }
    
    // Calculer série de victoires
    let streak = 0;
    for (let i = player.recentForm.last10.length - 1; i >= 0; i--) {
      if (player.recentForm.last10[i] === 'W') streak++;
      else break;
    }
    player.recentForm.winStreak = streak;
  }
  
  return players;
}

function createEmptyPlayer(id: string, name: string): TennisPlayer {
  return {
    id,
    name,
    country: '',
    ranking: 999,
    rankingPoints: 0,
    surfaceStats: {
      hard: { wins: 0, losses: 0, winRate: 0 },
      clay: { wins: 0, losses: 0, winRate: 0 },
      grass: { wins: 0, losses: 0, winRate: 0 },
      carpet: { wins: 0, losses: 0, winRate: 0 }
    },
    recentForm: {
      wins: 0,
      losses: 0,
      winStreak: 0,
      last10: []
    },
    serveStats: {
      acesPerMatch: 0,
      doubleFaultsPerMatch: 0,
      firstServePct: 0,
      breakPointsSaved: 0
    },
    returnStats: {
      breakPointsConverted: 0,
      returnGamesWon: 0
    },
    lastUpdated: new Date().toISOString()
  };
}

// ============================================
// CALCUL H2H
// ============================================

function calculateH2H(historicalMatches: TennisMatch[]): Map<string, H2HRecord> {
  const h2hMap = new Map<string, H2HRecord>();
  
  for (const match of historicalMatches) {
    if (match.status !== 'finished' || !match.winner) continue;
    
    // Créer clé unique pour la paire
    const key = [match.player1Id, match.player2Id].sort().join('_vs_');
    
    if (!h2hMap.has(key)) {
      h2hMap.set(key, {
        player1Id: match.player1Id,
        player2Id: match.player2Id,
        player1Wins: 0,
        player2Wins: 0,
        totalMatches: 0,
        surfaceBreakdown: {
          hard: { p1: 0, p2: 0 },
          clay: { p1: 0, p2: 0 },
          grass: { p1: 0, p2: 0 }
        }
      });
    }
    
    const h2h = h2hMap.get(key)!;
    h2h.totalMatches++;
    h2h.lastMeeting = match.date;
    
    // Déterminer qui est player1 dans le record
    const isP1First = h2h.player1Id === match.player1Id;
    
    if (match.winner === match.player1) {
      if (isP1First) h2h.player1Wins++;
      else h2h.player2Wins++;
      
      // Surface breakdown
      const surface = match.surface as 'hard' | 'clay' | 'grass';
      if (surface in h2h.surfaceBreakdown) {
        if (isP1First) h2h.surfaceBreakdown[surface].p1++;
        else h2h.surfaceBreakdown[surface].p2++;
      }
    } else {
      if (isP1First) h2h.player2Wins++;
      else h2h.player1Wins++;
      
      const surface = match.surface as 'hard' | 'clay' | 'grass';
      if (surface in h2h.surfaceBreakdown) {
        if (isP1First) h2h.surfaceBreakdown[surface].p2++;
        else h2h.surfaceBreakdown[surface].p1++;
      }
    }
  }
  
  return h2hMap;
}

// ============================================
// ESTIMATION CLASSEMENT (basé sur performance)
// ============================================

function estimateRankings(players: Map<string, TennisPlayer>): void {
  // Calculer un score pour chaque joueur
  const playerScores: { id: string; score: number }[] = [];
  
  for (const player of players.values()) {
    let score = 0;
    
    // Performance globale (40%)
    const totalWins = player.recentForm.wins;
    const totalLosses = player.recentForm.losses;
    const totalMatches = totalWins + totalLosses;
    if (totalMatches > 0) {
      score += (totalWins / totalMatches) * 400;
    }
    
    // Forme récente (30%)
    const recentWinRate = player.recentForm.last10.filter(r => r === 'W').length / 10;
    score += recentWinRate * 300;
    
    // Série de victoires (10%)
    score += player.recentForm.winStreak * 10;
    
    // Performance sur surface principale (20%)
    const surfaces = Object.values(player.surfaceStats);
    const bestSurface = surfaces.reduce((a, b) => a.winRate > b.winRate ? a : b);
    score += bestSurface.winRate * 2;
    
    playerScores.push({ id: player.id, score });
  }
  
  // Trier et assigner rangs
  playerScores.sort((a, b) => b.score - a.score);
  
  playerScores.forEach((ps, index) => {
    const player = players.get(ps.id);
    if (player) {
      player.ranking = index + 1;
      player.rankingPoints = Math.round(ps.score);
    }
  });
}

// ============================================
// SAUVEGARDE
// ============================================

function savePlayerDatabase(players: Map<string, TennisPlayer>, h2h: Map<string, H2HRecord>): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  const db: PlayerDatabase = {
    players: Object.fromEntries(players),
    h2h: Object.fromEntries(h2h),
    lastUpdated: new Date().toISOString()
  };
  
  fs.writeFileSync(PLAYERS_FILE, JSON.stringify(db, null, 2));
  console.log(`✅ Données joueurs sauvegardées: ${players.size} joueurs, ${h2h.size} H2H`);
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🎾 Tennis Data Collector - Démarrage');
  console.log('====================================');
  
  // 1. Récupérer les matchs à venir
  const upcomingMatches = await fetchBetExplorerMatches();
  
  // 2. Récupérer les résultats historiques des tournois principaux
  const tournaments = [
    { category: 'atp-singles', tournament: 'indian-wells' },
    { category: 'atp-singles', tournament: 'australian-open' },
    { category: 'atp-singles', tournament: 'rotterdam' },
    { category: 'wta-singles', tournament: 'indian-wells' },
    { category: 'wta-singles', tournament: 'australian-open' },
    { category: 'challenger-men-singles', tournament: 'phoenix' },
    { category: 'challenger-men-singles', tournament: 'cap-cana' }
  ];
  
  const allHistorical: TennisMatch[] = [];
  
  for (const t of tournaments) {
    const { matches } = await fetchHistoricalResults(t.tournament, t.category);
    allHistorical.push(...matches);
    console.log(`  📊 ${t.tournament}: ${matches.length} résultats`);
    
    // Petite pause pour éviter le rate limiting
    await new Promise(r => setTimeout(r, 500));
  }
  
  // 3. Calculer les stats des joueurs
  console.log('\n📊 Calcul des statistiques joueurs...');
  const players = await calculatePlayerStats(allHistorical);
  
  // 4. Estimer les classements
  estimateRankings(players);
  
  // 5. Calculer les H2H
  console.log('📊 Calcul des H2H...');
  const h2h = calculateH2H(allHistorical);
  
  // 6. Sauvegarder
  savePlayerDatabase(players, h2h);
  
  // 7. Sauvegarder les matchs à venir
  const matchesData = {
    upcoming: upcomingMatches,
    historical: allHistorical,
    lastUpdated: new Date().toISOString()
  };
  fs.writeFileSync(MATCHES_FILE, JSON.stringify(matchesData, null, 2));
  
  console.log('\n✅ Collecte terminée!');
  console.log(`   - ${players.size} joueurs analysés`);
  console.log(`   - ${h2h.size} confrontations H2H`);
  console.log(`   - ${upcomingMatches.length} matchs à venir`);
}

main().catch(console.error);
