/**
 * Tennis Precalc Script - Génère les prédictions tennis pré-calculées
 * Exécuté par GitHub Actions quotidiennement
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// INTERFACES
// ============================================

interface TennisPrediction {
  matchId: string;
  player1: string;
  player2: string;
  tournament: string;
  surface: 'hard' | 'clay' | 'grass' | 'carpet';
  round: string;
  date: string;
  odds1: number;
  odds2: number;
  category: 'atp' | 'wta' | 'challenger' | 'itf';
  prediction: {
    winner: 'player1' | 'player2';
    winProbability: number;
    confidence: 'very_high' | 'high' | 'medium' | 'low';
    riskPercentage: number;
  };
  betting: {
    recommendedBet: boolean;
    kellyStake: number;
    winnerOdds: number;
    expectedValue: number;
  };
  analysis: {
    rankingAdvantage: string;
    surfaceAdvantage: string;
    formAdvantage: string;
    h2hAdvantage: string;
    oddsValue: string;
  };
  keyFactors: string[];
  warnings: string[];
}

interface PrecalcOutput {
  generatedAt: string;
  totalMatches: number;
  byCategory: {
    atp: number;
    wta: number;
    challenger: number;
    itf: number;
  };
  byConfidence: {
    very_high: number;
    high: number;
    medium: number;
    low: number;
  };
  bySurface: {
    hard: number;
    clay: number;
    grass: number;
    carpet: number;
  };
  predictions: TennisPrediction[];
  modelVersion: string;
}

// ============================================
// CONFIGURATION
// ============================================

const DATA_DIR = path.join(process.cwd(), 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'tennis-predictions.json');
const PLAYERS_FILE = path.join(DATA_DIR, 'tennis-players.json');
const RANKINGS_FILE = path.join(DATA_DIR, 'tennis-rankings.json');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

function normalizePlayerName(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function generatePlayerId(name: string): string {
  return `player_${normalizePlayerName(name)}_${name.length}`;
}

function detectSurface(tournamentName: string): 'hard' | 'clay' | 'grass' | 'carpet' {
  const name = tournamentName.toLowerCase();
  
  if (name.includes('wimbledon') || name.includes('halle') || name.includes('queen') || 
      name.includes('eastbourne') || name.includes('s-hertogenbosch') || name.includes('stuttgart')) {
    return 'grass';
  }
  
  if (name.includes('roland') || name.includes('garros') || name.includes('clay') || 
      name.includes('monte carlo') || name.includes('barcelona') || name.includes('rome') ||
      name.includes('hamburg') || name.includes('santiago') || name.includes('buenos aires') ||
      name.includes('rio') || name.includes('cap cana') || name.includes('kigali') ||
      name.includes('estoril') || name.includes('geneva') || name.includes('lyon')) {
    return 'clay';
  }
  
  if (name.includes('indoor') || name.includes('metz') || name.includes('vienna') || 
      name.includes('basel') || name.includes('stockholm') || name.includes('montpellier') ||
      name.includes('rotterdam') || name.includes('marseille') || name.includes('cherbourg') ||
      name.includes('davis cup') || name.includes('finals')) {
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

// Liste des noms de joueurs connus (chargée depuis les classements)
let knownPlayerNames: Set<string> = new Set();
let playerLastNameMap: Map<string, string> = new Map(); // lastname -> fullname

function initializeKnownPlayers(): void {
  // Charger depuis les maps de classements déjà créées
  for (const player of atpRankingsMap.values()) {
    knownPlayerNames.add(normalizePlayerName(player.name));
    // Extraire le nom de famille (dernier mot)
    const parts = player.name.split(' ');
    const lastName = parts[parts.length - 1].toLowerCase();
    playerLastNameMap.set(lastName, player.name);
  }
  for (const player of wtaRankingsMap.values()) {
    knownPlayerNames.add(normalizePlayerName(player.name));
    const parts = player.name.split(' ');
    const lastName = parts[parts.length - 1].toLowerCase();
    playerLastNameMap.set(lastName, player.name);
  }
}

function slugToPlayerNames(slug: string): { player1: string; player2: string } {
  const parts = slug.split('-');
  
  // Stratégie 1: Chercher des noms de famille connus dans le slug
  const matchedNames: string[] = [];
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].toLowerCase();
    if (playerLastNameMap.has(part)) {
      matchedNames.push(playerLastNameMap.get(part)!);
    }
  }
  
  // Si on a trouvé 2 joueurs connus
  if (matchedNames.length >= 2) {
    return { player1: matchedNames[0], player2: matchedNames[1] };
  }
  
  // Stratégie 2: Si 4 parties, c'est souvent "prenom1-nom1-prenom2-nom2"
  if (parts.length === 4) {
    return {
      player1: formatName([parts[0], parts[1]]),
      player2: formatName([parts[2], parts[3]])
    };
  }
  
  // Stratégie 3: Fallback - diviser en 2 parties égales
  const half = Math.floor(parts.length / 2);
  return {
    player1: formatName(parts.slice(0, half)),
    player2: formatName(parts.slice(half))
  };
}

function formatName(nameParts: string[]): string {
  return nameParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

// ============================================
// CHARGEMENT DONNÉES JOUEURS
// ============================================

interface PlayerDatabase {
  players: Record<string, {
    id: string;
    name: string;
    ranking: number;
    rankingPoints: number;
    surfaceStats: {
      hard: { wins: number; losses: number; winRate: number };
      clay: { wins: number; losses: number; winRate: number };
      grass: { wins: number; losses: number; winRate: number };
      carpet: { wins: number; losses: number; winRate: number };
    };
    recentForm: {
      wins: number;
      losses: number;
      winStreak: number;
      last10: string[];
    };
  }>;
  h2h: Record<string, {
    player1Id: string;
    player2Id: string;
    player1Wins: number;
    player2Wins: number;
    totalMatches: number;
    surfaceBreakdown: Record<string, { p1: number; p2: number }>;
  }>;
}

function loadPlayerDatabase(): PlayerDatabase | null {
  try {
    if (fs.existsSync(PLAYERS_FILE)) {
      return JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf-8'));
    }
  } catch (error) {
    console.log('⚠️ Pas de base joueurs disponible');
  }
  return null;
}

// ============================================
// CHARGEMENT CLASSEMENTS RÉELS
// ============================================

interface RealRanking {
  rank: number;
  name: string;
  country: string;
  points: number;
  movement: number;
}

interface RankingsDatabase {
  atp: RealRanking[];
  wta: RealRanking[];
  lastUpdated: string;
}

// Map pour recherche rapide par nom
let atpRankingsMap: Map<string, RealRanking> = new Map();
let wtaRankingsMap: Map<string, RealRanking> = new Map();

function loadRealRankings(): void {
  try {
    if (fs.existsSync(RANKINGS_FILE)) {
      const data: RankingsDatabase = JSON.parse(fs.readFileSync(RANKINGS_FILE, 'utf-8'));
      
      // Créer des maps pour recherche rapide (normaliser les noms)
      for (const player of data.atp || []) {
        const normalizedName = normalizePlayerName(player.name);
        atpRankingsMap.set(normalizedName, player);
        // Aussi ajouter avec des variations
        const parts = player.name.split(' ');
        if (parts.length >= 2) {
          // "Jannik Sinner" -> "sinnerjannik" aussi
          atpRankingsMap.set(parts.reverse().join('').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), player);
        }
      }
      
      for (const player of data.wta || []) {
        const normalizedName = normalizePlayerName(player.name);
        wtaRankingsMap.set(normalizedName, player);
        const parts = player.name.split(' ');
        if (parts.length >= 2) {
          wtaRankingsMap.set(parts.reverse().join('').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), player);
        }
      }
      
      console.log(`📊 Classements chargés: ATP ${atpRankingsMap.size}, WTA ${wtaRankingsMap.size}`);
    }
  } catch (error) {
    console.log('⚠️ Erreur chargement classements:', error);
  }
}

function findPlayerRanking(name: string, category: 'atp' | 'wta' | 'challenger' | 'itf'): RealRanking | null {
  const normalized = normalizePlayerName(name);
  
  // Chercher dans ATP
  if (category === 'atp' || category === 'challenger') {
    if (atpRankingsMap.has(normalized)) {
      return atpRankingsMap.get(normalized)!;
    }
    // Recherche partielle
    for (const [key, player] of atpRankingsMap) {
      if (key.includes(normalized) || normalized.includes(key)) {
        return player;
      }
    }
  }
  
  // Chercher dans WTA
  if (category === 'wta' || category === 'itf') {
    if (wtaRankingsMap.has(normalized)) {
      return wtaRankingsMap.get(normalized)!;
    }
    for (const [key, player] of wtaRankingsMap) {
      if (key.includes(normalized) || normalized.includes(key)) {
        return player;
      }
    }
  }
  
  return null;
}

// ============================================
// RÉCUPÉRATION MATCHS
// ============================================

async function fetchUpcomingMatches(): Promise<{
  matchId: string;
  player1: string;
  player2: string;
  tournament: string;
  surface: 'hard' | 'clay' | 'grass' | 'carpet';
  odds1: number;
  odds2: number;
  category: 'atp' | 'wta' | 'challenger' | 'itf';
}[]> {
  const matches: any[] = [];
  const seenMatches = new Set<string>();
  
  try {
    console.log('📊 Récupération matchs BetExplorer...');
    
    const res = await fetch('https://www.betexplorer.com/tennis/next/', {
      headers: HEADERS
    });
    
    if (!res.ok) {
      console.log(`⚠️ BetExplorer status: ${res.status}`);
      return matches;
    }
    
    const html = await res.text();
    
    const matchLinkRegex = /href="\/tennis\/([a-z-]+)\/([a-z-]+)\/([a-z-]+)\/([a-zA-Z0-9]+)\/"/g;
    const oddsRegex = /data-odd="(\d+\.?\d*)"/g;
    
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
        matchId: `betexp_${matchId}`,
        player1,
        player2,
        tournament,
        surface,
        odds1,
        odds2,
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
// PRÉDICTION ML
// ============================================

function predictMatch(
  match: {
    player1: string;
    player2: string;
    odds1: number;
    odds2: number;
    surface: 'hard' | 'clay' | 'grass' | 'carpet';
    category?: 'atp' | 'wta' | 'challenger' | 'itf';
  },
  playerDb: PlayerDatabase | null
): TennisPrediction['prediction'] & { 
  analysis: TennisPrediction['analysis']; 
  keyFactors: string[];
  warnings: string[];
  recommendedBet: boolean;
  kellyStake: number;
} {
  
  const { player1, player2, odds1, odds2, surface, category } = match;
  
  // Trouver les joueurs dans la base
  const p1Id = generatePlayerId(player1);
  const p2Id = generatePlayerId(player2);
  
  const p1Data = playerDb?.players?.[p1Id];
  const p2Data = playerDb?.players?.[p2Id];
  
  // Chercher les vrais classements ATP/WTA
  const p1Ranking = findPlayerRanking(player1, category || 'atp');
  const p2Ranking = findPlayerRanking(player2, category || 'atp');
  
  // Calculer les features
  let score = 0;
  const keyFactors: string[] = [];
  const warnings: string[] = [];
  
  // 1. Cotes des bookmakers (base)
  const impliedP1 = 1 / odds1;
  const impliedP2 = 1 / odds2;
  score = (impliedP1 - impliedP2) * 100 * 0.3;
  
  // 2. Classement RÉEL ATP/WTA (prioritaire)
  if (p1Ranking && p2Ranking) {
    const rankingDiff = p1Ranking.rank - p2Ranking.rank;
    score += (-rankingDiff / 50) * 25;
    
    if (Math.abs(rankingDiff) >= 5) {
      const better = rankingDiff < 0 ? player1 : player2;
      keyFactors.push(`${better} #${Math.min(p1Ranking.rank, p2Ranking.rank)} mondial vs #${Math.max(p1Ranking.rank, p2Ranking.rank)}`);
    }
  } else if (p1Data && p2Data) {
    // Fallback sur classement estimé
    const rankingDiff = p1Data.ranking - p2Data.ranking;
    score += (-rankingDiff / 50) * 25;
    
    if (Math.abs(rankingDiff) > 20) {
      const better = rankingDiff < 0 ? player1 : player2;
      keyFactors.push(`${better} mieux classé (${Math.abs(rankingDiff)} places)`);
    }
  } else {
    if (!p1Ranking && !p1Data) warnings.push(`${player1}: classement inconnu`);
    if (!p2Ranking && !p2Data) warnings.push(`${player2}: classement inconnu`);
  }
  
  // 3. Performance surface (si données disponibles)
  if (p1Data && p2Data) {
    const p1SurfaceRate = p1Data.surfaceStats[surface]?.winRate || 50;
    const p2SurfaceRate = p2Data.surfaceStats[surface]?.winRate || 50;
    const surfaceDiff = p1SurfaceRate - p2SurfaceRate;
    score += surfaceDiff * 0.2;
    
    if (Math.abs(surfaceDiff) > 15) {
      const better = surfaceDiff > 0 ? player1 : player2;
      keyFactors.push(`${better} plus performant sur ${surface}`);
    }
    
    // 4. Forme récente
    const p1FormRate = p1Data.recentForm.last10?.filter((r: string) => r === 'W').length / 10 || 0.5;
    const p2FormRate = p2Data.recentForm.last10?.filter((r: string) => r === 'W').length / 10 || 0.5;
    const formDiff = (p1FormRate - p2FormRate) * 100;
    score += formDiff * 0.2;
    
    if (Math.abs(formDiff) > 30) {
      const better = formDiff > 0 ? player1 : player2;
      keyFactors.push(`${better} en meilleure forme`);
    }
    
    // 5. Série de victoires
    const streakDiff = (p1Data.recentForm.winStreak || 0) - (p2Data.recentForm.winStreak || 0);
    score += streakDiff * 2;
    
    if (streakDiff >= 3) {
      keyFactors.push(`${player1} sur une série de ${p1Data.recentForm.winStreak} victoires`);
    }
  }
  
  // 6. H2H
  if (playerDb?.h2h) {
    const h2hKey1 = `${p1Id}_vs_${p2Id}`;
    const h2hKey2 = `${p2Id}_vs_${p1Id}`;
    const h2h = playerDb.h2h[h2hKey1] || playerDb.h2h[h2hKey2];
    
    if (h2h && h2h.totalMatches > 0) {
      const isP1First = h2h.player1Id === p1Id;
      const p1H2HWins = isP1First ? h2h.player1Wins : h2h.player2Wins;
      const p2H2HWins = isP1First ? h2h.player2Wins : h2h.player1Wins;
      const h2hDiff = p1H2HWins - p2H2HWins;
      
      score += h2hDiff * 5;
      keyFactors.push(`H2H: ${p1H2HWins}-${p2H2HWins}`);
    }
  }
  
  // Calculer la probabilité finale
  const rawProb = 1 / (1 + Math.exp(-score / 30));
  const finalProb = rawProb * 0.7 + impliedP1 * 0.3;
  
  const winner = finalProb >= 0.5 ? 'player1' : 'player2';
  const winProb = finalProb >= 0.5 ? finalProb : 1 - finalProb;
  
  // Calculer confiance
  let confidence: 'very_high' | 'high' | 'medium' | 'low';
  let risk: number;
  
  if (winProb >= 0.75) {
    confidence = 'very_high';
    risk = 15;
  } else if (winProb >= 0.65) {
    confidence = 'high';
    risk = 25;
  } else if (winProb >= 0.55) {
    confidence = 'medium';
    risk = 40;
  } else {
    confidence = 'low';
    risk = 50;
  }
  
  // Kelly
  const winnerOdds = winner === 'player1' ? odds1 : odds2;
  const b = winnerOdds - 1;
  const kellyRaw = (b * winProb - (1 - winProb)) / b;
  const kellyFractions: Record<string, number> = {
    very_high: 0.25,
    high: 0.20,
    medium: 0.10,
    low: 0.05
  };
  const kellyStake = Math.max(0, Math.min(kellyRaw * kellyFractions[confidence] * 100, 5));
  
  // Analyse
  const analysis = {
    rankingAdvantage: p1Ranking && p2Ranking 
      ? (p1Ranking.rank < p2Ranking.rank 
          ? `${player1} #${p1Ranking.rank} mondial` 
          : p2Ranking.rank < p1Ranking.rank 
            ? `${player2} #${p2Ranking.rank} mondial`
            : 'Égalité')
      : p1Data && p2Data 
        ? (p1Data.ranking < p2Data.ranking ? `${player1} mieux classé` : 
           p2Data.ranking < p1Data.ranking ? `${player2} mieux classé` : 'Équilibré')
        : 'Données insuffisantes',
    surfaceAdvantage: keyFactors.find(f => f.includes('surface') || f.includes('performant')) || 'Équilibré',
    formAdvantage: keyFactors.find(f => f.includes('forme') || f.includes('série')) || 'Équilibré',
    h2hAdvantage: keyFactors.find(f => f.includes('H2H')) || 'Pas d\'historique',
    oddsValue: `Cote ${winner === 'player1' ? player1 : player2}: ${winnerOdds.toFixed(2)}`
  };
  
  return {
    winner,
    winProbability: Math.round(winProb * 100),
    confidence,
    riskPercentage: risk,
    analysis,
    keyFactors,
    warnings,
    recommendedBet: kellyStake >= 0.5 && confidence !== 'low',
    kellyStake: Math.round(kellyStake * 10) / 10
  };
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🎾 Tennis Precalc - Démarrage');
  console.log('==============================');
  
  // 1. Charger les classements réels ATP/WTA
  loadRealRankings();
  
  // 1b. Initialiser les noms connus pour le parsing
  initializeKnownPlayers();
  console.log(`📊 ${playerLastNameMap.size} noms de famille connus`);
  
  // 2. Charger la base de données joueurs (forme, H2H)
  const playerDb = loadPlayerDatabase();
  if (playerDb) {
    console.log(`📊 Base joueurs: ${Object.keys(playerDb.players).length} joueurs, ${Object.keys(playerDb.h2h).length} H2H`);
  }
  
  // 3. Récupérer les matchs à venir
  const matches = await fetchUpcomingMatches();
  
  if (matches.length === 0) {
    console.log('⚠️ Aucun match à prédire');
    return;
  }
  
  // 4. Générer les prédictions
  console.log('\n🎯 Génération des prédictions...');
  
  const predictions: TennisPrediction[] = [];
  const stats = {
    byCategory: { atp: 0, wta: 0, challenger: 0, itf: 0 },
    byConfidence: { very_high: 0, high: 0, medium: 0, low: 0 },
    bySurface: { hard: 0, clay: 0, grass: 0, carpet: 0 }
  };
  
  for (const match of matches) {
    const prediction = predictMatch(match, playerDb);
    
    predictions.push({
      matchId: match.matchId,
      player1: match.player1,
      player2: match.player2,
      tournament: match.tournament,
      surface: match.surface,
      round: 'Match',
      date: new Date().toISOString(),
      odds1: match.odds1,
      odds2: match.odds2,
      category: match.category,
      prediction: {
        winner: prediction.winner,
        winProbability: prediction.winProbability,
        confidence: prediction.confidence,
        riskPercentage: prediction.riskPercentage
      },
      betting: {
        recommendedBet: prediction.recommendedBet,
        kellyStake: prediction.kellyStake,
        winnerOdds: prediction.winner === 'player1' ? match.odds1 : match.odds2,
        expectedValue: Math.round((prediction.winProbability / 100 * 
          (prediction.winner === 'player1' ? match.odds1 : match.odds2) - 1) * 100)
      },
      analysis: prediction.analysis,
      keyFactors: prediction.keyFactors,
      warnings: prediction.warnings
    });
    
    // Stats
    stats.byCategory[match.category]++;
    stats.byConfidence[prediction.confidence]++;
    stats.bySurface[match.surface]++;
  }
  
  // Trier par confiance puis par probabilité
  const confidenceOrder = { very_high: 0, high: 1, medium: 2, low: 3 };
  predictions.sort((a, b) => {
    const confDiff = confidenceOrder[a.prediction.confidence] - confidenceOrder[b.prediction.confidence];
    if (confDiff !== 0) return confDiff;
    return b.prediction.winProbability - a.prediction.winProbability;
  });
  
  // 5. Sauvegarder
  const output: PrecalcOutput = {
    generatedAt: new Date().toISOString(),
    totalMatches: predictions.length,
    ...stats,
    predictions,
    modelVersion: 'tennis-ml-v1.0'
  };
  
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  
  console.log('\n✅ Prédictions générées!');
  console.log(`   Total: ${predictions.length} matchs`);
  console.log(`   ATP: ${stats.byCategory.atp} | WTA: ${stats.byCategory.wta} | Challenger: ${stats.byCategory.challenger}`);
  console.log(`   Très haute confiance: ${stats.byConfidence.very_high}`);
  console.log(`   Haute confiance: ${stats.byConfidence.high}`);
  console.log(`   Paris recommandés: ${predictions.filter(p => p.betting.recommendedBet).length}`);
}

main().catch(console.error);
