/**
 * betExplorerBaseballScraper.ts — P4 Phase 1 : backfill d'archives MLB labellisées
 *
 * MISSION : donner au training XGBoost des échantillons baseball avec score final +
 * cotes de clôture (moyenne marché). Sans cela, le modèle baseball n'a jamais
 * dépassé 30 échantillons (CV 49,5% = zéro edge, désactivé au P0).
 *
 * Source : betexplorer.com/baseball/usa/mlb/results/ (gratuit, historique complet,
 * cotes moyennes multi-bookmakers). Scraping via ZAI page_reader (anti-ban par
 * design — IP Vercel jamais exposées, pattern prouvé en prod par le scraper football).
 *
 * ANTI-RÉGRESSION : écriture UNIQUEMENT dans la table `matches` (colonne connues du
 * training), status='completed', sport='baseball'. Aucune autre table, aucun flux
 * existant modifié. Upsert par match_id stable → idempotent, appelable à répétition.
 */

import ZAI from 'z-ai-web-dev-sdk';

const MLB_RESULTS_URL = 'https://www.betexplorer.com/baseball/usa/mlb/results/';

export interface MlbArchiveMatch {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport: 'baseball';
  date: string; // ISO
  homeScore: number;
  awayScore: number;
  oddsHome: number; // cote moyenne marché (clôture)
  oddsAway: number;
  source: 'betexplorer-archive';
}

function normalizeTeamKey(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
}

function buildStableMatchId(home: string, away: string, dateISO: string): string {
  const d = dateISO.split('T')[0].replace(/-/g, '');
  return `betexp_mlb_${normalizeTeamKey(home)}-${normalizeTeamKey(away)}-${d}`;
}

/** Parse "9.9.2026" (format betExplorer d.m.Y) → ISO UTC */
export function parseBetExplorerDate(raw: string): string | null {
  const m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`;
}

/**
 * Parse le HTML d'une page de résultats MLB betExplorer.
 * Parser défensif multi-fallbacks (structures connues):
 *   <tr> … <td class="…h-time…">9.9.2026</td> … équipes dans <a> …
 *   score "5:3" … cotes <a data-odd="1.85"> (2 valeurs: 1 / 2)
 */
export function parseMlbResultsHTML(html: string): MlbArchiveMatch[] {
  const out: MlbArchiveMatch[] = [];
  if (!html || html.length < 500) return out;

  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    try {
      // 1. Date
      const timeMatch = row.match(/(\d{1,2}\.\d{1,2}\.\d{4})/);
      if (!timeMatch) continue;
      const dateISO = parseBetExplorerDate(timeMatch[1]);
      if (!dateISO) continue;

      // 2. Équipes: liens internes baseball (noms d'équipes)
      const teamLinks: string[] = [];
      for (const m of row.matchAll(/<a[^>]*href="\/baseball\/[^"]*"[^>]*>([^<]{2,40})<\/a>/gi)) {
        const name = m[1].trim();
        if (name && !teamLinks.includes(name)) teamLinks.push(name);
      }
      if (teamLinks.length < 2) continue;
      const homeTeam = teamLinks[0];
      const awayTeam = teamLinks[1];

      // 3. Score (format "5:3" — entiers sans décimales, exclut les cotes)
      const scoreMatch = row.match(/>\s*(\d{1,3})\s*:\s*(\d{1,3})\s*</);
      if (!scoreMatch) continue;
      const homeScore = parseInt(scoreMatch[1], 10);
      const awayScore = parseInt(scoreMatch[2], 10);
      if (!isFinite(homeScore) || !isFinite(awayScore)) continue;

      // 4. Cotes (2 valeurs data-odd = moneyline 1 / 2)
      const oddsValues: number[] = [];
      for (const m of row.matchAll(/data-odd="([0-9]+\.[0-9]+)"/g)) {
        const v = parseFloat(m[1]);
        if (v >= 1.01 && v <= 50) oddsValues.push(v);
      }
      if (oddsValues.length < 2) continue;
      const [oddsHome, oddsAway] = oddsValues;

      out.push({
        matchId: buildStableMatchId(homeTeam, awayTeam, dateISO),
        homeTeam,
        awayTeam,
        league: 'MLB',
        sport: 'baseball',
        date: dateISO,
        homeScore,
        awayScore,
        oddsHome,
        oddsAway,
        source: 'betexplorer-archive',
      });
    } catch {
      // ligne malformée → skip (jamais bloquant)
    }
  }

  // Déduplication par matchId (le HTML peut répéter des lignes d'en-tête)
  const seen = new Set<string>();
  return out.filter((m) => (seen.has(m.matchId) ? false : (seen.add(m.matchId), true)));
}

/**
 * Scrape UNE page de résultats MLB (1 appel page_reader).
 * Retourne [] honnête en cas d'échec (jamais de throw).
 */
export async function scrapeMlbResultsPage(): Promise<MlbArchiveMatch[]> {
  try {
    const zai = await ZAI.create();
    const result = await zai.functions.invoke('page_reader', {
      url: MLB_RESULTS_URL,
    });

    const rawResult: any = result;
    const html: string =
      typeof rawResult === 'string'
        ? rawResult
        : rawResult?.data?.html || rawResult?.html || rawResult?.content || '';

    if (!html || html.length < 500) {
      console.log('⚠️ [MLB-ARCHIVE] page_reader: contenu vide ou trop court');
      return [];
    }

    const matches = parseMlbResultsHTML(html);
    console.log(`✅ [MLB-ARCHIVE] ${matches.length} matchs MLB labellisés extraits`);
    return matches;
  } catch (err: any) {
    console.log(`⚠️ [MLB-ARCHIVE] scrape échoué (non bloquant): ${err.message}`);
    return [];
  }
}
