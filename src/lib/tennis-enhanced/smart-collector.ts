/**
 * Tennis Smart Collector - SYSTÈME HYBRIDE INTELLIGENT
 * 
 * 🎯 STRATÉGIE:
 * 1. BetExplorer (PRIORITÉ) - Gratuit, données riches, avec anti-ban amélioré
 * 2. The Odds API (BACKUP) - API officielle, bascule automatique si ban
 * 3. Données statiques (FALLBACK) - Si tout échoue
 * 
 * 🛡️ PROTECTION ANTI-BAN:
 * - Rotation User-Agents
 * - Délais aléatoires entre requêtes
 * - Circuit breaker (blocage auto si trop d'erreurs)
 * - Détection automatique de ban
 * - Rebond automatique sur Odds API
 */

// ============================================
// IMPORTS — bouclier anti-ban central (Task 19)
// ============================================

import { stealthFetch } from '../stealthFetch';

// ============================================
// TYPES & INTERFACES
// ============================================

export interface TennisMatch {
  id: string;
  player1: string;
  player2: string;
  player1Id: string;
  player2Id: string;
  tournament: string;
  tournamentId: string;
  tournamentTier: TournamentTier;
  surface: Surface;
  round: string;
  date: Date;
  odds1: number;
  odds2: number;
  bookmaker: string;
  category: Category;
  status: MatchStatus;
  source: 'betexplorer' | 'oddsapi' | 'demo';
}

export interface PlayerData {
  id: string;
  name: string;
  country: string;
  ranking: number;
  rankingPoints: number;
  surfaceStats: SurfaceStats;
  recentForm: RecentForm;
  tournamentHistory: Map<string, TournamentPerformance>;
}

export interface SurfaceStats {
  hard: PerformanceRecord;
  clay: PerformanceRecord;
  grass: PerformanceRecord;
  indoor: PerformanceRecord;
}

export interface PerformanceRecord {
  wins: number;
  losses: number;
  winRate: number;
  recentWins: number;
  recentLosses: number;
}

export interface RecentForm {
  wins: number;
  losses: number;
  winStreak: number;
  last10: ('W' | 'L')[];
  lastMatchDate: Date | null;
}

export interface TournamentPerformance {
  tournamentId: string;
  bestResult: string;
  appearances: number;
  winLoss: { wins: number; losses: number };
}

export type TournamentTier = 
  | 'grand_slam'
  | 'masters_1000'
  | 'atp_500'
  | 'atp_250'
  | 'wta_1000'
  | 'wta_500'
  | 'wta_250'
  | 'challenger_175'
  | 'challenger_125'
  | 'challenger_100'
  | 'challenger_75'
  | 'challenger_50'
  | 'itf'
  | 'unknown';

export type Surface = 'hard' | 'clay' | 'grass' | 'indoor';
export type Category = 'atp' | 'wta' | 'challenger' | 'itf';
export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';

// ============================================
// CONFIGURATION ANTI-BAN
// ============================================

const ANTI_BAN_CONFIG = {
  // Délais entre requêtes (en ms)
  minDelay: 10000,        // 10 secondes minimum
  maxDelay: 25000,        // 25 secondes maximum
  
  // Circuit Breaker
  maxErrors: 3,           // Max 3 erreurs avant blocage
  blockDuration: 30 * 60 * 1000, // 30 minutes de blocage
  
  // Quota journalier
  maxDailyRequests: 10,   // Max 10 requêtes/jour vers BetExplorer
  
  // User-Agents à rotation
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};

// ============================================
// THE ODDS API - CONFIGURATION (BACKUP)
// ============================================

// Clé API avec fallback vers clé existante (même approche que les autres services)
const ODDS_API_KEY = process.env.THE_ODDS_API_KEY || process.env.ODDS_API_KEY;
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

// Quota backup (conservateur)
const ODDS_API_DAILY_BUDGET = 3; // Max 3 requêtes/jour en mode backup

// ============================================
// ÉTAT GLOBAL
// ============================================

// Cache
const CACHE_TTL = {
  matches: 30 * 60 * 1000,      // 30 minutes
  odds: 5 * 60 * 1000,          // 5 minutes
  rankings: 24 * 60 * 60 * 1000, // 24 heures
};

let cachedMatches: TennisMatch[] = [];
let lastFetchTime = 0;
let lastFetchDate = ''; // 📅 Nouvelle variable pour tracker le jour du cache

// Anti-ban state
interface AntiBanState {
  errorCount: number;
  blockedUntil: number;
  dailyRequests: number;
  lastRequestDate: string;
  lastRequestTime: number;
  isBanned: boolean;
  banReason: string;
  // Diagnostic Task 24 : quoi a déclenché la détection, et à quoi ressemblait la page
  lastBanIndicator: string;
  lastBanTitle: string;
  lastBanSnippet: string;
  lastBanAt: string;
}

let antiBanState: AntiBanState = {
  errorCount: 0,
  blockedUntil: 0,
  dailyRequests: 0,
  lastRequestDate: '',
  lastRequestTime: 0,
  isBanned: false,
  banReason: '',
  lastBanIndicator: '',
  lastBanTitle: '',
  lastBanSnippet: '',
  lastBanAt: '',
};

// Odds API state
let oddsApiDailyRequests = 0;
let lastOddsApiDate = '';

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

function generatePlayerId(name: string): string {
  return `player_${name.toLowerCase().replace(/[^a-z]/g, '')}`;
}

function getRandomDelay(): number {
  return Math.floor(Math.random() * (ANTI_BAN_CONFIG.maxDelay - ANTI_BAN_CONFIG.minDelay) + ANTI_BAN_CONFIG.minDelay);
}

function getRandomUserAgent(): string {
  return ANTI_BAN_CONFIG.userAgents[Math.floor(Math.random() * ANTI_BAN_CONFIG.userAgents.length)];
}

function getToday(): string {
  // 📅 Utiliser UTC pour éviter les problèmes de timezone
  return new Date().toISOString().split('T')[0];
}

/**
 * Vérifie si on peut faire une requête vers BetExplorer
 */
function canRequestBetExplorer(): { allowed: boolean; reason: string } {
  const now = Date.now();
  const today = getToday();
  
  // Reset quotidien
  if (antiBanState.lastRequestDate !== today) {
    antiBanState.dailyRequests = 0;
    antiBanState.lastRequestDate = today;
    antiBanState.errorCount = 0;
  }
  
  // Vérifier si bloqué (circuit breaker)
  if (antiBanState.blockedUntil > now) {
    const remaining = Math.ceil((antiBanState.blockedUntil - now) / 60000);
    return { allowed: false, reason: `Bloqué encore ${remaining} min (${antiBanState.banReason})` };
  }
  
  // Vérifier si banni
  if (antiBanState.isBanned) {
    return { allowed: false, reason: `Banni: ${antiBanState.banReason}` };
  }
  
  // Vérifier quota journalier
  if (antiBanState.dailyRequests >= ANTI_BAN_CONFIG.maxDailyRequests) {
    return { allowed: false, reason: `Quota journalier atteint (${antiBanState.dailyRequests}/${ANTI_BAN_CONFIG.maxDailyRequests})` };
  }
  
  // Vérifier délai depuis dernière requête
  const timeSinceLastRequest = now - antiBanState.lastRequestTime;
  const minDelay = getRandomDelay();
  if (timeSinceLastRequest < minDelay) {
    const waitSec = Math.ceil((minDelay - timeSinceLastRequest) / 1000);
    return { allowed: false, reason: `Attendre ${waitSec}s (anti-ban)` };
  }
  
  return { allowed: true, reason: 'OK' };
}

/**
 * Enregistre une erreur (pour circuit breaker)
 */
function recordError(error: string): void {
  antiBanState.errorCount++;
  console.log(`[TennisCollector] ⚠️ Erreur ${antiBanState.errorCount}/${ANTI_BAN_CONFIG.maxErrors}: ${error}`);
  
  if (antiBanState.errorCount >= ANTI_BAN_CONFIG.maxErrors) {
    antiBanState.blockedUntil = Date.now() + ANTI_BAN_CONFIG.blockDuration;
    antiBanState.banReason = `Circuit breaker: ${antiBanState.errorCount} erreurs`;
    console.log(`[TennisCollector] 🔒 Circuit breaker activé pour 30 min`);
  }
}

/**
 * Détecte un contenu de ban/challenge. Retourne l'indicateur trouvé (ou null).
 * ⚠️ Les challenges Cloudflare « managed » répondent parfois en HTTP 200 —
 * d'où l'analyse du contenu en plus des codes HTTP.
 */
function findBanIndicator(response: Response, html: string): string | null {
  // Codes HTTP suspects
  if (response.status === 403) return 'HTTP 403';
  if (response.status === 429) return 'HTTP 429';
  
  // Contenu suspect
  const banIndicators = [
    'access denied',
    'blocked',
    'captcha',
    'cloudflare',
    'rate limit',
    'too many requests',
    'security check',
    'please wait',
    'enable javascript',
  ];
  
  const lowerHtml = html.toLowerCase();
  return banIndicators.find(indicator => lowerHtml.includes(indicator)) || null;
}

/** Extrait <title> + un extrait texte de la page reçue (diagnostic). */
function captureBanEvidence(html: string): { title: string; snippet: string } {
  const title = (html.match(/<title[^>]*>([^<]{0,150})<\/title>/i)?.[1] || '').trim();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { title, snippet: text.slice(0, 240) };
}

/**
 * Bloque temporairement BetExplorer (auto-guérison : nouvelles tentatives
 * après blockDuration). Le ban PERMANENT (isBanned) est réservé aux cas
 * manifestes répétés — un challenge HTTP 200 ne doit pas tuer le collecteur
 * pour la vie de l'instance (bug Task 24 : tennis silencieux des jours).
 */
function markAsBanned(reason: string, indicator: string, evidence: { title: string; snippet: string }): void {
  antiBanState.banReason = reason;
  antiBanState.blockedUntil = Date.now() + ANTI_BAN_CONFIG.blockDuration;
  // isBanned volontairement NON positionné : retry après cooldown (auto-guérison)
  antiBanState.lastBanIndicator = indicator;
  antiBanState.lastBanTitle = evidence.title;
  antiBanState.lastBanSnippet = evidence.snippet;
  antiBanState.lastBanAt = new Date().toISOString();
  console.log(`[TennisCollector] 🚫 BetExplorer bloqué 30 min: ${reason} | indicateur="${indicator}" | title="${evidence.title}"`);
  console.log(`[TennisCollector] 📄 Extrait reçu: ${evidence.snippet.slice(0, 120)}`);
}

// ============================================
// BETEXPLORER SCRAPER (PRIORITÉ)
// ============================================

/**
 * Récupère les matchs depuis BetExplorer avec protection anti-ban
 */
async function fetchFromBetExplorer(): Promise<TennisMatch[]> {
  // Vérifier si on peut faire la requête
  const { allowed, reason } = canRequestBetExplorer();
  if (!allowed) {
    console.log(`[TennisCollector] ⏳ BetExplorer non disponible: ${reason}`);
    return [];
  }
  
  console.log(`[TennisCollector] 🎯 Tentative BetExplorer... (${antiBanState.dailyRequests + 1}/${ANTI_BAN_CONFIG.maxDailyRequests})`);
  
  try {
    // URL tennis BetExplorer
    const url = 'https://www.betexplorer.com/next/tennis/';

    // Task 19 : passage par le bouclier central stealthFetch — profils navigateur
    // cohérents (UA ↔ client hints), budget anti-ban (rafale 20/60s, plafond
    // 300/jour), disjoncteur WAF PARTAGÉ inter-instances (Supabase Storage).
    // La logique métier locale (canRequestBetExplorer / detectBan / circuit
    // breaker 30 min + fallback demo) reste la PREMIÈRE couche, inchangée.
    const response = await stealthFetch(url, {
      redirect: 'follow',
      headers: {
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    
    // Mettre à jour le state
    antiBanState.lastRequestTime = Date.now();
    antiBanState.dailyRequests++;
    
    if (!response.ok) {
      recordError(`HTTP ${response.status}`);
      return [];
    }
    
    const html = await response.text();
    
    // Détecter un challenge/ban (HTTP 200 inclus — Cloudflare managed challenge)
    const indicator = findBanIndicator(response, html);
    if (indicator) {
      const evidence = captureBanEvidence(html);
      markAsBanned(`Détection automatique (${indicator}, HTTP ${response.status})`, indicator, evidence);
      return [];
    }
    
    // Parser le HTML
    const matches = parseBetExplorerHTML(html);
    
    // Reset error count si succès
    if (matches.length > 0) {
      antiBanState.errorCount = 0;
      console.log(`[TennisCollector] ✅ BetExplorer: ${matches.length} matchs récupérés`);
    }
    
    return matches;
    
  } catch (error) {
    recordError(String(error));
    return [];
  }
}

/**
 * Convertit l'heure affichée par BetExplorer (fuseau Europe/Paris, CET/CEST)
 * en Date UTC. Deux passes pour gérer proprement la frontière DST.
 */
function parisOffsetMinutes(at: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Paris', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    const p: Record<string, string> = {};
    for (const { type, value } of dtf.formatToParts(at)) p[type] = value;
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute);
    return Math.round((asUTC - at.getTime()) / 60000);
  } catch {
    return 120; // CEST par défaut si Intl indisponible
  }
}

function betexplorerDateToUtc(y: number, mo: number, d: number, h: number, mi: number): Date {
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    guess -= parisOffsetMinutes(new Date(guess)) * 60000;
  }
  return new Date(guess);
}

/**
 * Parse le HTML de BetExplorer
 *
 * ⚠️ Markup 2026-09 : BetExplorer a abandonné l'attribut data-event-name.
 * Nouvelle structure (vérifiée sur la page réelle /tennis/next/) :
 *   - entête tournoi : <tr class="js-tournament"> … href="/tennis/{cat}/{slug}/" …
 *     libellé texte « Challenger Men - Singles: Buenos Aires 3, clay »
 *   - ligne match : <tr data-fro=".." data-dt="D,M,YYYY,H,MM" data-dt-now="..">
 *       joueurs dans <span class="table-main__teamLine--home/--away">
 *       cotes dans <button data-odd="1.85"> (2 premières = 1X2)
 *       statut fini : <span class="table-main__time--fin">FIN</span>
 *   - exhibitions type Laver Cup sous /tennis/teams-men|women/ (hors Elo → ignorées)
 */
export function parseBetExplorerHTML(html: string): TennisMatch[] {
  const matches: TennisMatch[] = [];

  try {
    const now = Date.now();
    // Découpe par tournoi : chaque entête js-tournament introduit une section
    const sections = html.split(/<tr class="js-tournament">/);

    for (let s = 1; s < sections.length && matches.length < 150; s++) {
      const section = sections[s];
      const headEnd = section.indexOf('</tr>');
      if (headEnd === -1) continue;
      const head = section.slice(0, headEnd);
      const body = section.slice(headEnd);

      const catTour = head.match(/href="\/tennis\/([a-z0-9-]+)\/([a-z0-9-]+)\//);
      if (!catTour) continue;
      const catSlug = catTour[1];
      const tourSlug = catTour[2];

      // Doubles (2 joueurs par camp, non couverts par l'Elo singles) + exhibitions → ignorés
      if (catSlug.includes('doubles') || catSlug.startsWith('teams-')) continue;
      const category: Category | null = catSlug.startsWith('atp') ? 'atp'
        : catSlug.startsWith('wta') ? 'wta'
        : catSlug.includes('challenger') ? 'challenger'
        : catSlug.includes('itf') ? 'itf'
        : null;
      if (!category) continue;

      // Libellé du tournoi (dernier texte de l'entête) : « WTA - Singles: Singapore, hard »
      const labelMatch = head.match(/>([^<>]{5,150})<\/a>/);
      const label = labelMatch ? labelMatch[1].trim() : '';

      // Surface : suffixe du libellé (« , hard ») sinon heuristique sur le slug
      let surface: Surface = detectSurfaceImproved(tourSlug);
      const surfMatch = label.match(/,\s*(hard|clay|grass|indoor|carpet)\s*$/i);
      if (surfMatch) surface = (surfMatch[1].toLowerCase() === 'carpet' ? 'indoor' : surfMatch[1].toLowerCase()) as Surface;

      // Nom affichable : après « : » si présent, sans le suffixe surface
      let tourName = label;
      const colon = label.lastIndexOf(':');
      if (colon !== -1) tourName = label.slice(colon + 1).trim();
      tourName = tourName.replace(/,\s*(hard|clay|grass|indoor|carpet)\s*$/i, '').trim() || 'Tennis';

      // Lignes de match de la section
      const rowRe = /<tr[^>]*\bdata-dt="(\d{1,2}),(\d{1,2}),(\d{4}),(\d{1,2}),(\d{1,2})"[^>]*>([\s\S]*?)<\/tr>/g;
      let row: RegExpExecArray | null;
      while ((row = rowRe.exec(body)) !== null && matches.length < 150) {
        const [, dd, mo, yyyy, hh, mi, inner] = row;
        if (/table-main__time--fin/i.test(inner)) continue; // terminé

        const home = inner.match(/teamLine--home[^>]*>(?:<strong>)?([^<]+)/);
        const away = inner.match(/teamLine--away[^>]*>(?:<strong>)?([^<]+)/);
        if (!home || !away) continue;
        const player1 = home[1].trim();
        const player2 = away[1].trim();
        if (!player1 || !player2) continue;
        if (player1.includes(' / ') || player2.includes(' / ')) continue; // ceinture + bretelles doubles

        // Cotes 1X2 : les 2 premiers data-odd de la ligne
        const oddsArr = Array.from(inner.matchAll(/data-odd="([\d.]+)"/g))
          .map((m) => parseFloat(m[1]))
          .filter((o) => Number.isFinite(o) && o >= 1.01 && o <= 200);
        if (oddsArr.length < 2) continue;

        // ID stable depuis l'URL du match (…/{slug}/{matchId}/)
        const hrefMatch = inner.match(/href="(\/tennis\/[^"]+)"/);
        const mid = hrefMatch ? (hrefMatch[1].match(/\/([A-Za-z0-9]{5,12})\/?$/) || [])[1] : undefined;

        // Vraie date/heure (Europe/Paris → UTC) ; fenêtre glissante [maintenant-10min ; +5 j]
        const date = betexplorerDateToUtc(+yyyy, +mo, +dd, +hh, +mi);
        if (date.getTime() < now - 10 * 60000 || date.getTime() > now + 5 * 86400e3) continue;

        matches.push({
          id: mid ? `be_${mid}` : `betexplorer_${now}_${matches.length}`,
          player1,
          player2,
          player1Id: generatePlayerId(player1),
          player2Id: generatePlayerId(player2),
          tournament: tourName,
          tournamentId: tourSlug,
          tournamentTier: detectTournamentTier(tourSlug, category),
          surface,
          round: 'Match',
          date,
          odds1: oddsArr[0],
          odds2: oddsArr[1],
          bookmaker: 'BetExplorer',
          category,
          status: 'scheduled',
          source: 'betexplorer',
        });
      }
    }

    if (matches.length > 0) {
      const byCat = matches.reduce<Record<string, number>>((acc, m) => {
        acc[m.category] = (acc[m.category] || 0) + 1;
        return acc;
      }, {});
      console.log(`[TennisCollector] 🧩 Parsing markup 2026: ${matches.length} singles (doubles/exhibitions/FIN ignorés) —`, JSON.stringify(byCat));
      return matches;
    }

    // Fallback ancien markup (data-event-name) si BetExplorer revenait en arrière
    const altMatchRegex = /data-event-name="([^"]+)"[\s\S]*?data-odd="([\d.]+)"[\s\S]*?data-odd="([\d.]+)"/gi;

    let match;
    let matchIndex = 0;

    while ((match = altMatchRegex.exec(html)) !== null && matchIndex < 20) {
      const eventName = match[1];
      const odds1 = parseFloat(match[2]);
      const odds2 = parseFloat(match[3]);

      // Séparer les joueurs
      const players = eventName.split(' - ');
      if (players.length === 2) {
        const player1 = players[0].trim();
        const player2 = players[1].trim();

        matches.push({
          id: `betexplorer_${Date.now()}_${matchIndex}`,
          player1,
          player2,
          player1Id: generatePlayerId(player1),
          player2Id: generatePlayerId(player2),
          tournament: 'Tennis Match',
          tournamentId: 'tennis',
          tournamentTier: 'unknown',
          surface: 'hard',
          round: 'Match',
          date: new Date(),
          odds1,
          odds2,
          bookmaker: 'BetExplorer',
          category: 'atp',
          status: 'scheduled',
          source: 'betexplorer',
        });
        matchIndex++;
      }
    }

  } catch (error) {
    console.error('[TennisCollector] Erreur parsing HTML:', error);
  }

  return matches;
}

// ============================================
// THE ODDS API (BACKUP)
// ============================================

interface OddsAPIEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: Array<{
    key: string;
    title: string;
    markets: Array<{
      key: string;
      outcomes: Array<{
        name: string;
        price: number;
        point?: number;
      }>;
    }>;
  }>;
}

/**
 * Récupère les matchs depuis The Odds API via le Live Data Service
 * Utilise le nouveau service unifié avec données enrichies
 */
async function fetchFromOddsAPI(): Promise<TennisMatch[]> {
  if (!ODDS_API_KEY) {
    console.log('[TennisCollector] ⚠️ THE_ODDS_API_KEY non configurée');
    console.log('[TennisCollector] ℹ️ Obtenez une clé gratuite: https://the-odds-api.com/');
    return [];
  }
  
  const today = getToday();
  if (lastOddsApiDate !== today) {
    lastOddsApiDate = today;
  }
  
  if (oddsApiDailyRequests >= ODDS_API_DAILY_BUDGET) {
    console.log(`[TennisCollector] ⚠️ Budget Odds API atteint (${oddsApiDailyRequests}/${ODDS_API_DAILY_BUDGET})`);
    return [];
  }
  
  console.log(`[TennisCollector] 🔄 Utilisation Odds API via Live Data Service...`);
  
  try {
    // Utiliser le nouveau live-data-service
    const { fetchUpcomingMatches } = await import('./live-data-service');
    const upcomingMatches = await fetchUpcomingMatches();
    
    // Convertir au format TennisMatch
    const matches: TennisMatch[] = upcomingMatches.map(m => ({
      id: m.id,
      player1: m.player1,
      player2: m.player2,
      player1Id: m.player1Id,
      player2Id: m.player2Id,
      tournament: m.tournament,
      tournamentId: m.tournament.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      tournamentTier: m.tournamentTier,
      surface: m.surface,
      round: m.round,
      date: m.date,
      odds1: m.odds1 || 1.85,
      odds2: m.odds2 || 1.85,
      bookmaker: 'Odds API',
      category: m.tournament.includes('WTA') ? 'wta' : 'atp',
      status: m.status,
      source: 'oddsapi',
    }));
    
    oddsApiDailyRequests++;
    console.log(`[TennisCollector] ✅ Odds API: ${matches.length} matchs RÉELS récupérés`);
    
    return matches;
    
  } catch (error) {
    console.error('[TennisCollector] ❌ Erreur Odds API:', error);
  }
  
  return [];
}

// ============================================
// DONNÉES STATIQUES (FALLBACK - DÉSACTIVÉ)
// ============================================

// Note: generateSampleMatches() a été supprimé
// Seuls les matchs RÉELS sont maintenant retournés

// ============================================
// DÉTECTION TOURNOI & SURFACE
// ============================================

const GRAND_SLAMS = ['australian-open', 'roland-garros', 'french-open', 'wimbledon', 'us-open'];
const MASTERS_1000 = ['indian-wells', 'miami', 'monte-carlo', 'madrid', 'rome', 'canada', 'cincinnati', 'shanghai', 'paris-masters'];
const ATP_500 = ['rotterdam', 'rio', 'acapulco', 'dubai', 'barcelona', 'hamburg', 'washington', 'beijing', 'tokyo', 'vienna', 'basel'];
const WTA_1000 = ['indian-wells', 'miami', 'madrid', 'beijing', 'doha', 'rome', 'canada', 'cincinnati', 'wuhan'];

export function detectTournamentTier(tournamentSlug: string, category: Category): TournamentTier {
  const slug = tournamentSlug.toLowerCase();
  
  if (GRAND_SLAMS.some(gs => slug.includes(gs))) return 'grand_slam';
  
  if (category === 'atp') {
    if (MASTERS_1000.some(m => slug.includes(m))) return 'masters_1000';
    if (ATP_500.some(m => slug.includes(m))) return 'atp_500';
    return 'atp_250';
  }
  
  if (category === 'wta') {
    if (WTA_1000.some(m => slug.includes(m))) return 'wta_1000';
    return 'wta_250';
  }
  
  return 'itf';
}

export function getTournamentImportanceFactor(tier: TournamentTier): number {
  const factors: Record<TournamentTier, number> = {
    'grand_slam': 1.5, 'masters_1000': 1.35, 'wta_1000': 1.35,
    'atp_500': 1.20, 'wta_500': 1.20, 'atp_250': 1.00, 'wta_250': 1.00,
    'challenger_175': 0.85, 'challenger_125': 0.75, 'challenger_100': 0.70,
    'challenger_75': 0.65, 'challenger_50': 0.60, 'itf': 0.50, 'unknown': 0.70,
  };
  return factors[tier] || 1.0;
}

const GRASS_TOURNAMENTS = ['wimbledon', 'halle', 'queens', 'eastbourne', 's-hertogenbosch', 'stuttgart-grass', 'mallorca', 'newport'];
const CLAY_TOURNAMENTS = ['roland-garros', 'french-open', 'monte-carlo', 'barcelona', 'rome', 'madrid', 'hamburg', 'rio', 'buenos-aires'];
const INDOOR_TOURNAMENTS = ['rotterdam', 'marseille', 'montpellier', 'metz', 'vienna', 'basel', 'stockholm', 'antwerp', 'paris-masters'];

export function detectSurfaceImproved(tournamentSlug: string): Surface {
  const slug = tournamentSlug.toLowerCase();
  if (GRASS_TOURNAMENTS.some(t => slug.includes(t))) return 'grass';
  if (CLAY_TOURNAMENTS.some(t => slug.includes(t))) return 'clay';
  if (INDOOR_TOURNAMENTS.some(t => slug.includes(t))) return 'indoor';
  return 'hard';
}

// ============================================
// COLLECTE PRINCIPALE - SYSTÈME HYBRIDE
// ============================================

export interface CollectorStatus {
  source: 'betexplorer' | 'oddsapi' | 'demo' | 'cache';
  betexplorer: {
    available: boolean;
    reason: string;
    dailyRequests: number;
    maxDailyRequests: number;
    isBanned: boolean;
    /** Diagnostic Task 24 : dernier déclencheur de détection de challenge/ban */
    lastBanIndicator: string;
    lastBanTitle: string;
    lastBanSnippet: string;
    lastBanAt: string;
  };
  oddsApi: {
    available: boolean;
    dailyRequests: number;
    maxDailyRequests: number;
  };
  cache: {
    valid: boolean;
    age: number;
  };
}

export function getCollectorStatus(): CollectorStatus {
  const now = Date.now();
  const cacheAge = cachedMatches.length > 0 ? now - lastFetchTime : 0;
  
  return {
    source: cachedMatches.length > 0 && cacheAge < CACHE_TTL.matches ? 'cache' : 
            antiBanState.isBanned ? 'oddsapi' : 'betexplorer',
    betexplorer: {
      available: !antiBanState.isBanned && antiBanState.blockedUntil < now,
      reason: antiBanState.isBanned ? antiBanState.banReason : 
              antiBanState.blockedUntil > now ? `Bloqué ${Math.ceil((antiBanState.blockedUntil - now) / 60000)} min` : 'OK',
      dailyRequests: antiBanState.dailyRequests,
      maxDailyRequests: ANTI_BAN_CONFIG.maxDailyRequests,
      isBanned: antiBanState.isBanned,
      lastBanIndicator: antiBanState.lastBanIndicator,
      lastBanTitle: antiBanState.lastBanTitle,
      lastBanSnippet: antiBanState.lastBanSnippet,
      lastBanAt: antiBanState.lastBanAt,
    },
    oddsApi: {
      available: !!ODDS_API_KEY,
      dailyRequests: oddsApiDailyRequests,
      maxDailyRequests: ODDS_API_DAILY_BUDGET,
    },
    cache: {
      valid: cacheAge < CACHE_TTL.matches && cachedMatches.length > 0,
      age: Math.floor(cacheAge / 1000),
    },
  };
}

/**
 * Collecte principale avec système hybride intelligent
 * ⚠️ FALLBACK DÉSACTIVÉ - Seuls les vrais matchs sont retournés
 */
export async function collectMatches(): Promise<TennisMatch[]> {
  console.log('[TennisCollector] 🎾 Début collecte - SYSTÈME HYBRIDE (FALLBACK DÉSACTIVÉ)');
  
  // 📅 Récupérer la date du jour en UTC
  const todayUTC = getToday();
  
  // Vérifier le cache avec invalidation par date
  const now = Date.now();
  const cacheAge = now - lastFetchTime;
  const isCacheValid = cacheAge < CACHE_TTL.matches;
  const isSameDay = lastFetchDate === todayUTC;
  
  // 📅 Si le cache est d'un autre jour, l'invalider
  if (lastFetchDate && lastFetchDate !== todayUTC) {
    console.log(`[TennisCollector] 🔄 NOUVEAU JOUR DÉTECTÉ - Cache invalidé`);
    console.log(`   Cache date: ${lastFetchDate} | Aujourd'hui: ${todayUTC}`);
    cachedMatches = [];
    lastFetchTime = 0;
    lastFetchDate = '';
  }
  
  // Utiliser le cache si valide ET du même jour
  if (cachedMatches.length > 0 && isCacheValid && isSameDay) {
    console.log(`[TennisCollector] 📦 Cache HIT: ${cachedMatches.length} matchs (age: ${Math.round(cacheAge / 1000)}s)`);
    return cachedMatches;
  }
  
  let matches: TennisMatch[] = [];
  let source: 'betexplorer' | 'oddsapi' | 'none' = 'none';
  
  // 1. PRIORITÉ: BetExplorer (avec anti-ban)
  if (!antiBanState.isBanned) {
    const betExplorerMatches = await fetchFromBetExplorer();
    if (betExplorerMatches.length > 0) {
      matches = betExplorerMatches;
      source = 'betexplorer';
    }
  } else {
    console.log(`[TennisCollector] ⚠️ BetExplorer banni - utilisation backup`);
  }
  
  // 2. BACKUP: The Odds API (si BetExplorer échoue ou banni)
  if (matches.length === 0) {
    const oddsApiMatches = await fetchFromOddsAPI();
    if (oddsApiMatches.length > 0) {
      matches = oddsApiMatches;
      source = 'oddsapi';
    }
  }
  
  // 3. PLUS DE FALLBACK - On retourne vide si aucune source n'a de matchs
  if (matches.length === 0) {
    console.log('[TennisCollector] ⚠️ AUCUN MATCH RÉEL DISPONIBLE');
    console.log('[TennisCollector] ℹ️ Sources tentées: BetExplorer, Odds API');
    console.log('[TennisCollector] ℹ️ Vérifiez THE_ODDS_API_KEY dans les variables d\'environnement');
    return [];
  }
  
  // Mettre en cache avec la date du jour
  cachedMatches = matches;
  lastFetchTime = now;
  lastFetchDate = todayUTC; // 📅 Stocker la date du cache
  console.log(`[TennisCollector] ✅ ${matches.length} matchs RÉELS collectés via ${source.toUpperCase()}`);
  console.log(`[TennisCollector] 📅 Cache date: ${lastFetchDate}`);
  
  return matches;
}

// ============================================
// EXPORTS
// ============================================

export { CACHE_TTL, ANTI_BAN_CONFIG };
