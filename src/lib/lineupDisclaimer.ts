/**
 * ═══════════════════════════════════════════════════════════════════
 * DISCLAIMER COMPOSITION — Avertissement ligneups et blessures
 * ═══════════════════════════════════════════════════════════════════
 * Contexte (demande utilisateur): les prédictions ne prennent PAS en
 * compte la composition officielle du 11 entrant (publiée ~1h avant
 * kickoff) ni les blessures de dernière minute (< 12h avant le match).
 *
 * Le pipeline actuel:
 *  - scrap les blessures Transfermarkt au cron 05h30/07h00 UTC
 *  - applique un ajustement max ±5 pts de % sur la proba finale
 *  - ne récupère JAMAIS les compos officielles (-60 min)
 *
 * Pour honnêteté envers l'utilisateur, on ajoute un disclaimer:
 *  - ⚠️ "Vérifie la composition 1h avant le match"
 *  - + liste des joueurs clés dont l'absence peut impacter le pronostic
 *    (ceux déjà détectés + ceux à surveiller)
 *
 * Le disclaimer est adaptatif:
 *  - football: liste les joueurs "out" déjà scrapés (impact -3 minimum)
 *    + rappel de vérifier les compos à -1h
 *  - sports US: liste les "out" + "questionable" déjà détectés
 *  - aucun joueur connu: disclaimer générique court
 */

export interface DisclaimerKeyPlayer {
  name: string;
  team: 'home' | 'away';
  status: 'out' | 'questionable' | 'monitor';
  reason?: string; // blessure / suspension / repos
}

export interface LineupDisclaimer {
  /** Message formatté prêt à afficher (Telegram HTML ou texte brut site) */
  text: string;
  /** Version courte (1 ligne) pour lespace limité */
  short: string;
  /** Nombre de joueurs clés à surveiller */
  keyPlayersCount: number;
  /** Sport concerné */
  sport: string;
  /** Est-ce que le disclaimer doit être affiché (toujours true pour football) */
  shouldShow: boolean;
}

/**
 * Génère le disclaimer composition pour un match.
 *
 * @param sport           Sport du match ('football', 'basketball', etc.)
 * @param homeTeam        Nom équipe domicile
 * @param awayTeam        Nom équipe extérieur
 * @param homeInjuries    Liste joueurs blessés/absents domicile (optionnel)
 * @param awayInjuries    Liste joueurs blessés/absents extérieur (optionnel)
 * @param homeImpact      Impact numérique des blessures dom (-10 à 0)
 * @param awayImpact      Impact numérique des blessures ext (-10 à 0)
 * @returns Disclaimer formatté
 */
export function buildLineupDisclaimer(opts: {
  sport: string;
  homeTeam: string;
  awayTeam: string;
  homeInjuries?: string[];
  awayInjuries?: string[];
  homeImpact?: number;
  awayImpact?: number;
}): LineupDisclaimer {
  const { sport, homeTeam, awayTeam } = opts;
  const s = (sport || '').toLowerCase();
  const isFootball = s.includes('foot') || s === 'foot';
  const isUS = s.includes('basket') || s.includes('nba') || s.includes('nhl') || s.includes('hockey') || s.includes('mlb') || s.includes('base');

  // Joueurs clés identifiés (déjà scrapés avec impact significatif)
  const keyPlayers: DisclaimerKeyPlayer[] = [];

  // Football: joueurs avec impact ≤ -3 sont "à surveiller"
  if (isFootball) {
    const hImpact = opts.homeImpact ?? 0;
    const aImpact = opts.awayImpact ?? 0;
    if (hImpact <= -3 && opts.homeInjuries && opts.homeInjuries.length > 0) {
      for (const name of opts.homeInjuries.slice(0, 3)) {
        keyPlayers.push({ name, team: 'home', status: 'out', reason: 'blessure' });
      }
    }
    if (aImpact <= -3 && opts.awayInjuries && opts.awayInjuries.length > 0) {
      for (const name of opts.awayInjuries.slice(0, 3)) {
        keyPlayers.push({ name, team: 'away', status: 'out', reason: 'blessure' });
      }
    }
  } else if (isUS) {
    // Sports US: tous les "out" sont affichés
    if (opts.homeInjuries && opts.homeInjuries.length > 0) {
      for (const name of opts.homeInjuries.slice(0, 3)) {
        keyPlayers.push({ name, team: 'home', status: 'out', reason: 'blessure' });
      }
    }
    if (opts.awayInjuries && opts.awayInjuries.length > 0) {
      for (const name of opts.awayInjuries.slice(0, 3)) {
        keyPlayers.push({ name, team: 'away', status: 'out', reason: 'blessure' });
      }
    }
  }

  // ── Formatage du texte ──────────────────────────────────────────

  const header = '⚠️ Vérifie la composition 1h avant le match';
  let body = '';

  if (keyPlayers.length > 0) {
    // Joueurs clés déjà identifiés → on les liste explicitement
    const homeList = keyPlayers
      .filter(p => p.team === 'home')
      .map(p => p.name)
      .slice(0, 3);
    const awayList = keyPlayers
      .filter(p => p.team === 'away')
      .map(p => p.name)
      .slice(0, 3);

    const parts: string[] = [header];
    if (homeList.length > 0) {
      parts.push(`Joueurs clés absents ${homeTeam}: ${homeList.join(', ')}`);
    }
    if (awayList.length > 0) {
      parts.push(`Joueurs clés absents ${awayTeam}: ${awayList.join(', ')}`);
    }
    body = parts.join(' · ');
  } else if (isFootball) {
    // Football sans blessure connue → disclaimer générique (toujours utile)
    body = `${header} · Composition officielle non prise en compte dans le pronostic`;
  } else {
    // Sports US: lineup non pris en compte + rappel de vérifier
    body = `${header} · Lineup officiel et DNP à vérifier`;
  }

  // Version courte (1 ligne)
  const short = keyPlayers.length > 0
    ? `⚠️ Compo 1h avant · ${keyPlayers.length} absent(s) clé(s)`
    : '⚠️ Vérifie la compo 1h avant';

  return {
    text: body,
    short,
    keyPlayersCount: keyPlayers.length,
    sport,
    shouldShow: true,
  };
}

/**
 * Version Telegram HTML (avec sauts de ligne propres).
 */
export function buildLineupDisclaimerHTML(opts: {
  sport: string;
  homeTeam: string;
  awayTeam: string;
  homeInjuries?: string[];
  awayInjuries?: string[];
  homeImpact?: number;
  awayImpact?: number;
}): string {
  const d = buildLineupDisclaimer(opts);
  // Format Telegram: ligne dédiée avec léger emoji + gras sur l'en-tête
  return `\n    ⚠️ <i>${d.text}</i>`;
}

/**
 * Indique si le disclaimer doit être affiché pour ce sport.
 * Football: TOUJOURS (composition critique).
 * Sports US: TOUJOURS (DNP quotidien).
 * Tennis: non (1v1, pas de composition).
 */
export function shouldShowLineupDisclaimer(sport: string): boolean {
  const s = (sport || '').toLowerCase();
  if (s.includes('foot')) return true;
  if (s.includes('basket') || s.includes('nba')) return true;
  if (s.includes('nhl') || s.includes('hockey')) return true;
  if (s.includes('mlb') || s.includes('base')) return true;
  if (s.includes('nfl')) return true;
  return false; // tennis et autres
}
