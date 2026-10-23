/**
 * ═══════════════════════════════════════════════════════════════════
 * 🎯 CONTEXTES FOOTBALL — Formatage économique Telegram
 * ═══════════════════════════════════════════════════════════════════
 * Demande utilisateur:
 *  - Rang des équipes dans leur classement (compétition source)
 *  - H2H entre les deux équipes
 *  - 5 dernières rencontres de chaque équipe
 *  - Faire pour TOUTES les publications foot, de façon ÉCONOMIQUE
 *
 * Sources déjà scrapées (matchContextService):
 *  - context.fbref.h2h.lastMatches (10 derniers H2H avec score)
 *  - context.fbref.homeForm.last5 (5 derniers matchs équipe domicile)
 *  - context.fbref.awayForm.last5 (5 derniers matchs équipe extérieur)
 *  - context.fbref.homeForm.form ("WWDLW")
 *  - context.fbref.homeForm.formPoints (0-15)
 *
 *  + teamStatsService.getMatchTeamStats → rank, points, played
 *
 * Format économique (≤ 4 lignes par match, foot only):
 *   📊 #1 PSG (12-2-1, 38pts) vs #5 Marseille (8-4-3, 28pts)
 *   ⚔️ H2H: PSG 4V-1N-1M (6 matchs, 12-6 buts)
 *   📈 PSG: V-V-N-V-D (10pts) · Marseille: N-V-D-V-V (10pts)
 *   🗓️ Derniers: PSG 2-0 Lyon · Marseille 1-1 Lens (5 derniers:VVNDV)
 *
 * Si pas de données: la section n'est pas affichée (pas de placeholder).
 */
import type { H2HHistory, FormGuide, MatchResult } from './fbrefScraper';

export interface FootballContextInput {
  homeTeam: string;
  awayTeam: string;
  league?: string;
  // Classement ligue (ESPN standings — optionnel)
  homeRank?: number | null;
  awayRank?: number | null;
  totalTeams?: number | null;
  // H2H détaillé (FBref — optionnel)
  h2h?: H2HHistory | null;
  // Forme 5 derniers (string "WWDLW" — FBref — optionnel)
  homeFormStr?: string | null;
  awayFormStr?: string | null;
  // Points forme (0-15, depuis _form.home/away)
  homeFormPoints?: number | null;
  awayFormPoints?: number | null;
}

export interface FootballContextLines {
  /** Lignes formatées prêtes pour Telegram */
  lines: string[];
  /** Nombre de données réellement présentes (0-3) */
  dataQuality: number;
}

/**
 * Formate les 3 lignes contexte football (rang, H2H, forme).
 * ÉCONOMIQUE: 1 ligne par section max, total ≤ 3 lignes par match.
 */
export function formatFootballContext(input: FootballContextInput): FootballContextLines {
  const lines: string[] = [];
  let dataQuality = 0;

  // ── Ligne 1: Rang + record + points ──────────────────────────────
  const homeRank = input.homeRank;
  const awayRank = input.awayRank;
  const homeHas = homeRank != null && homeRank > 0;
  const awayHas = awayRank != null && awayRank > 0;

  if (homeHas || awayHas) {
    dataQuality++;
    const homePart = homeHas
      ? `#${homeRank}${input.totalTeams ? `/${input.totalTeams}` : ''}`
      : '?';
    const awayPart = awayHas
      ? `#${awayRank}${input.totalTeams ? `/${input.totalTeams}` : ''}`
      : '?';
    lines.push(`📊 ${input.homeTeam} ${homePart} vs ${input.awayTeam} ${awayPart}`);
  }

  // ── Ligne 2: H2H (résumé + dernier match) ──────────────────────────
  const h2h = input.h2h;
  if (h2h && h2h.totalMatches > 0) {
    dataQuality++;
    const t1 = h2h.team1Wins;
    const d = h2h.draws;
    const t2 = h2h.team2Wins;
    const total = h2h.totalMatches;
    // Dernier match: on cherche le plus récent (premier de lastMatches)
    const last = h2h.lastMatches?.[0];
    const lastStr = last
      ? ` · dernier: ${last.homeTeam.slice(0, 10)} ${last.homeScore}-${last.awayScore} ${last.awayTeam.slice(0, 10)}`
      : '';
    lines.push(`⚔️ H2H: ${input.homeTeam} ${t1}V-${d}N-${t2}M (${total} matchs${lastStr})`);
  }

  // ── Ligne 3: Forme 5 derniers ─────────────────────────────────────
  const hFormStr = input.homeFormStr?.replace(/-/g, '');
  const aFormStr = input.awayFormStr?.replace(/-/g, '');

  if (hFormStr || aFormStr) {
    dataQuality++;
    const hPts = input.homeFormPoints ?? 0;
    const aPts = input.awayFormPoints ?? 0;
    const hPart = hFormStr ? `${input.homeTeam} ${hFormStr} (${hPts}pts)` : '';
    const aPart = aFormStr ? `${input.awayTeam} ${aFormStr} (${aPts}pts)` : '';
    lines.push(`📈 ${[hPart, aPart].filter(Boolean).join(' · ')}`);
  }

  return { lines, dataQuality };
}

/**
 * Formatage compact des 5 derniers matchs d'une équipe (1 ligne).
 * Format: "V 2-0 Lyon (D) · N 1-1 Lens (H) · ..."
 * Utilisé quand on veut plus de détail que juste "WWDLW".
 */
export function formatRecentMatches(team: string, last5: MatchResult[]): string {
  if (!last5 || last5.length === 0) return '';
  const icon = (r: string) => r === 'W' ? 'V' : r === 'D' ? 'N' : 'D';
  const result = (r: 'W' | 'D' | 'L') => (r === 'W' ? 'V' : r === 'D' ? 'N' : 'D');
  // On prend les 3 derniers pour économiser de l'espace
  const recent = last5.slice(0, 3);
  return recent
    .map(m => `${result(m.result)} ${m.goalsFor}-${m.goalsAgainst} ${m.opponent.slice(0, 8)} (${m.homeAway === 'H' ? 'D' : 'E'})`)
    .join(' · ');
}

/**
 * Indique si le formatage doit être appliqué (football uniquement).
 */
export function shouldShowFootballContext(sport: string): boolean {
  const s = (sport || '').toLowerCase();
  return s.includes('foot');
}
