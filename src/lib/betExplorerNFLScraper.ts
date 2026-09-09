/**
 * BetExplorer NFL Odds Scraper — VRAIES cotes via ZAI page_reader
 * ================================================================
 *
 * ⚠️ P2 (2026-09-09) : ce module générait AVANT des cotes 100% SIMULÉES
 * (generateRealisticNFLOdds: DVOA inventés, bookmakers tirés au hasard)
 * étiquetées `source: 'betexplorer'` — une fausse provenance dangereuse :
 * détectValueBets aurait pu produire de faux value bets à partir de rien.
 *
 * Maintenant :
 *   - Scraping RÉEL de https://www.betexplorer.com/next/american-football/
 *     via ZAI page_reader (service distant — les IP Vercel ne touchent
 *     jamais BetExplorer, anti-ban délégué ; même pattern que
 *     betExplorerScraper.ts pour le football, prouvé en production).
 *   - Échec de scraping → [] (dégradation honnête), JAMAIS de données
 *     fabriquées. Les archives retournt [] tant que le scraping des
 *     saisons passées n'est pas implémenté.
 *
 * NFL = moneyline 2 issues (pas de nul en saison régulière) → 2 cotes.
 */

import ZAI from 'z-ai-web-dev-sdk';

// Cache
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// URL BetExplorer NFL (prochains matchs, toutes compétitions US)
const BETEXPLORER_NFL_URL = 'https://www.betexplorer.com/next/american-football/';

/**
 * Structure honnête d'une cote NFL réellement scrapée.
 * (Ancien type BetExplorerNFLOdds : moneyline/spread/total simulés — supprimé.)
 */
export interface BetExplorerNFLMatch {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  /** ISO ou '' — jamais de date inventée si la page ne la donne pas */
  date: string;
  /** Moneyline 2 issues (cotes décimales moyennes BetExplorer) */
  oddsHome: number;
  oddsAway: number;
  bookmaker: string;
  source: 'betexplorer';
  scrapedAt: string;
}

function isCacheValid(key: string): boolean {
  const cached = cache.get(key);
  if (!cached) return false;
  return (Date.now() - cached.timestamp) < CACHE_TTL;
}

/**
 * Parse le HTML BetExplorer « next/american-football ».
 * Patterns miroir du parser football (betExplorerScraper.ts, prouvé en prod) :
 *   - équipes : liens class="match-part..." dans les <tr>
 *   - cotes   : attributs data-odd="1.85" (NFL → 2 valeurs attendues)
 */
function parseNFLOddsFromHTML(html: string): BetExplorerNFLMatch[] {
  const matches: BetExplorerNFLMatch[] = [];
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

  for (const row of rows) {
    try {
      if (!row.includes('data-odd')) continue;

      // Équipes (ordre HTML = domicile puis extérieur sur BetExplorer)
      const teams: string[] = [];
      const teamMatches = row.matchAll(/class="[^"]*match-part[^"]*"[^>]*>([^<]+)</g);
      for (const m of teamMatches) teams.push(m[1].trim());
      if (teams.length < 2) continue;

      // Cotes moneyline
      const oddsValues: number[] = [];
      for (const m of row.matchAll(/data-odd="([0-9.]+)"/g)) {
        const v = parseFloat(m[1]);
        if (Number.isFinite(v) && v > 1.001) oddsValues.push(v);
      }
      // NFL 2 issues : exactement 2 cotes. Si >2 (page générique multi-marché),
      // on ne retient que [première, dernière] = 1 et 2 d'un 1X2 sans nul
      // — sinon on saute la ligne (prudence plutôt qu'invention).
      if (oddsValues.length !== 2) continue;

      // Date optionnelle : <td class="table-main__datetime">13.09. 18:15</td>
      let date = '';
      const dt = row.match(/table-main__datetime[^>]*>\s*(\d{1,2})\.(\d{1,2})\.\s*(\d{1,2}):(\d{2})/);
      if (dt) {
        const day = parseInt(dt[1], 10);
        const month = parseInt(dt[2], 10);
        const hh = parseInt(dt[3], 10);
        const mm = parseInt(dt[4], 10);
        const now = new Date();
        let year = now.getFullYear();
        // BetExplorer n'affiche pas l'année : si la date tombe > 6 mois dans
        // le passé, c'est la saison suivante (janvier → matchs de décembre).
        const candidate = new Date(Date.UTC(year, month - 1, day, hh, mm));
        if (now.getTime() - candidate.getTime() > 180 * 24 * 3600 * 1000) {
          year += 1;
        }
        date = new Date(Date.UTC(year, month - 1, day, hh, mm)).toISOString();
      }

      matches.push({
        matchId: `betexplorer_nfl_${teams[0].slice(0, 12)}_${teams[1].slice(0, 12)}`.replace(/\W+/g, '_').toLowerCase(),
        homeTeam: teams[0],
        awayTeam: teams[1],
        date,
        oddsHome: oddsValues[0],
        oddsAway: oddsValues[1],
        bookmaker: 'BetExplorer (moyenne)',
        source: 'betexplorer',
        scrapedAt: new Date().toISOString(),
      });
    } catch {
      // Ligne malformée → ignorée (le reste du parsing continue)
    }
  }

  return matches;
}

/**
 * Scrape les VRAIES cotes NFL depuis BetExplorer.
 * Retourne [] si le scraping échoue (jamais de données simulées).
 */
export async function scrapeBetExplorerNFL(): Promise<BetExplorerNFLMatch[]> {
  const cacheKey = 'betexplorer_nfl_odds';

  if (isCacheValid(cacheKey)) {
    return cache.get(cacheKey)!.data;
  }

  try {
    console.log('📊 BetExplorer: scraping cotes NFL (page_reader)...');

    const zai = await ZAI.create();
    const result = await zai.functions.invoke('page_reader', {
      url: BETEXPLORER_NFL_URL,
    });

    if (result.code !== 200 || !result.data?.html) {
      console.log('⚠️ BetExplorer NFL: page_reader indisponible — aucune cote (fallback honnête: [])');
      return [];
    }

    const odds = parseNFLOddsFromHTML(result.data.html);

    if (odds.length === 0) {
      console.log('⚠️ BetExplorer NFL: 0 match parsé (structure HTML changée ?) — fallback honnête: []');
      return [];
    }

    cache.set(cacheKey, { data: odds, timestamp: Date.now() });
    console.log(`✅ BetExplorer: ${odds.length} matchs NFL avec cotes réelles`);
    return odds;
  } catch (error) {
    console.error('❌ Erreur BetExplorer NFL (fallback honnête: []):', error);
    return [];
  }
}

/**
 * Archives historiques BetExplorer pour backtesting.
 * ⚠️ NON IMPLÉMENTÉ volontairement : l'ancien générateur aléatoire produisait
 * de fausses archives (scores + cotes inventés) qui alimentaient
 * analyzeOddsTrends — remplacé par un échec honnête tant que le scraping
 * multi-pages des saisons passées n'est pas écrit.
 */
export async function getBetExplorerArchives(season: number): Promise<any[]> {
  console.log(
    `📚 BetExplorer Archives saison ${season}: non implémenté (retour [] — aucune donnée simulée)`
  );
  return [];
}

/**
 * Analyse les tendances de cotes pour une équipe.
 * Ne fonctionne que si getBetExplorerArchives est implémenté — pour l'instant
 * retourne systématiquement « Aucun match trouvé » (honnête).
 */
export async function analyzeOddsTrends(team: string, seasons: number[] = [2023, 2024]): Promise<any> {
  const allArchives: any[] = [];

  for (const season of seasons) {
    const archives = await getBetExplorerArchives(season);
    allArchives.push(...archives);
  }

  const teamGames = allArchives.filter(
    (g: any) => g.homeTeam === team || g.awayTeam === team
  );

  if (teamGames.length === 0) {
    return { team, games: 0, message: 'Aucun match trouvé' };
  }

  let wins = 0;
  let covers = 0;
  let overs = 0;
  const totalGames = teamGames.length;

  for (const game of teamGames) {
    const isHome = game.homeTeam === team;
    const teamScore = isHome ? game.finalScore.home : game.finalScore.away;
    const oppScore = isHome ? game.finalScore.away : game.finalScore.home;

    if (teamScore > oppScore) wins++;

    const spread = game.closingOdds.spread.line;
    const adjustedScore = isHome ? teamScore + spread : teamScore - spread;
    if (adjustedScore > oppScore) covers++;

    if (game.finalScore.home + game.finalScore.away > game.closingOdds.total.line) overs++;
  }

  return {
    team,
    seasons,
    totalGames,
    straightUp: {
      wins,
      losses: totalGames - wins,
      winPct: Math.round((wins / totalGames) * 100),
    },
    againstTheSpread: {
      covers,
      nonCovers: totalGames - covers,
      coverPct: Math.round((covers / totalGames) * 100),
    },
    overUnder: {
      overs,
      unders: totalGames - overs,
      overPct: Math.round((overs / totalGames) * 100),
    },
  };
}

/**
 * Détecte les value bets MONEYLINE en comparant les vraies cotes BetExplorer
 * avec nos prédictions. (Les blocs spread/total de l'ancienne version ont été
 * retirés : ils comparaient nos insights à des lignes simulées.)
 */
export function detectValueBets(
  betExplorerOdds: BetExplorerNFLMatch[],
  ourPredictions: any[]
): any[] {
  const valueBets: any[] = [];

  for (const odds of betExplorerOdds) {
    const prediction = ourPredictions.find(
      (p: any) =>
        p.homeTeam === odds.homeTeam && p.awayTeam === odds.awayTeam
    );

    if (!prediction) continue;

    // Edge sur Moneyline (2 issues NFL)
    const ourHomeProb = prediction.projected?.homeWinProb || 0.5;
    const impliedHomeProb = 1 / odds.oddsHome;
    const homeEdge = (ourHomeProb - impliedHomeProb) * 100;

    const ourAwayProb = prediction.projected?.awayWinProb || 0.5;
    const impliedAwayProb = 1 / odds.oddsAway;
    const awayEdge = (ourAwayProb - impliedAwayProb) * 100;

    if (homeEdge > 3) {
      valueBets.push({
        match: `${odds.homeTeam} vs ${odds.awayTeam}`,
        type: 'moneyline_home',
        ourProb: Math.round(ourHomeProb * 100),
        impliedProb: Math.round(impliedHomeProb * 100),
        edge: Math.round(homeEdge),
        odds: odds.oddsHome,
        bookmaker: odds.bookmaker,
        recommendation: `Parier ${odds.homeTeam} @ ${odds.oddsHome}`,
      });
    }

    if (awayEdge > 3) {
      valueBets.push({
        match: `${odds.homeTeam} vs ${odds.awayTeam}`,
        type: 'moneyline_away',
        ourProb: Math.round(ourAwayProb * 100),
        impliedProb: Math.round(impliedAwayProb * 100),
        edge: Math.round(awayEdge),
        odds: odds.oddsAway,
        bookmaker: odds.bookmaker,
        recommendation: `Parier ${odds.awayTeam} @ ${odds.oddsAway}`,
      });
    }
  }

  return valueBets.sort((a, b) => b.edge - a.edge);
}

export default {
  scrapeBetExplorerNFL,
  getBetExplorerArchives,
  analyzeOddsTrends,
  detectValueBets,
};
