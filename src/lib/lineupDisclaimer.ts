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
 * Format détaillé (avec keyPlayers détaillés):
 *   ⚠️ Vérifie la composition 1h avant le match
 *   Absents PSG: Mbappé (cuisse, out), Hakimi (cuisse, out)
 *   Absents Marseille: Rongier (genou, out)
 *
 * Format simple (noms seulement):
 *   ⚠️ Vérifie la composition 1h avant le match · Joueurs clés absents PSG: Mbappé, Hakimi
 */

export interface DisclaimerKeyPlayer {
  name: string;
  team: 'home' | 'away';
  status: 'out' | 'questionable' | 'monitor';
  reason?: string; // blessure / suspension / repos
}

/** Joueur détaillé avec type de blessure */
export interface DetailedKeyPlayer {
  name: string;
  type: string;
  status: string;
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

export interface LineupDisclaimerInput {
  sport: string;
  homeTeam: string;
  awayTeam: string;
  // Noms simples (ancienne version)
  homeInjuries?: string[];
  awayInjuries?: string[];
  // 🎯 Task: disclaimer détaillé — joueurs avec type de blessure + statut
  homeKeyPlayers?: DetailedKeyPlayer[];
  awayKeyPlayers?: DetailedKeyPlayer[];
  homeImpact?: number;
  awayImpact?: number;
}

/**
 * Génère le disclaimer composition pour un match.
 *
 * Format détaillé (avec keyPlayers détaillés) si dispo:
 *   ⚠️ Vérifie la composition 1h avant le match
 *   Absents PSG: Mbappé (cuisse, out), Hakimi (cuisse, out)
 *   Absents Marseille: Rongier (genou, out)
 *
 * Format simple (noms seulement) sinon:
 *   ⚠️ Vérifie la composition 1h avant le match · Joueurs clés absents PSG: Mbappé
 */
export function buildLineupDisclaimer(opts: LineupDisclaimerInput): LineupDisclaimer {
  const { sport, homeTeam, awayTeam } = opts;
  const s = (sport || '').toLowerCase();
  const isFootball = s.includes('foot') || s === 'foot';
  const isUS = s.includes('basket') || s.includes('nba') || s.includes('nhl') || s.includes('hockey') || s.includes('mlb') || s.includes('base');

  // ── Formatage du texte ──────────────────────────────────────────
  const header = '⚠️ Vérifie la composition 1h avant le match';
  let body = '';

  // Construire la liste détaillée (noms + types) si disponible
  const homeDetailed = opts.homeKeyPlayers || [];
  const awayDetailed = opts.awayKeyPlayers || [];

  // Construire la liste simple (noms only) sinon
  const homeSimple = opts.homeInjuries || [];
  const awaySimple = opts.awayInjuries || [];

  const homeHasDetailed = homeDetailed.length > 0;
  const awayHasDetailed = awayDetailed.length > 0;
  const homeHasSimple = !homeHasDetailed && homeSimple.length > 0;
  const awayHasSimple = !awayHasDetailed && awaySimple.length > 0;

  // Filtre: football = impact ≤ -3 pour afficher ; US = tous affichés
  let filteredHomeDetailed = homeDetailed;
  let filteredAwayDetailed = awayDetailed;
  let filteredHomeSimple = homeSimple;
  let filteredAwaySimple = awaySimple;
  if (isFootball) {
    const hImpact = opts.homeImpact ?? 0;
    const aImpact = opts.awayImpact ?? 0;
    if (hImpact > -3) { filteredHomeDetailed = []; filteredHomeSimple = []; }
    if (aImpact > -3) { filteredAwayDetailed = []; filteredAwaySimple = []; }
  }

  const hasAnyPlayer = filteredHomeDetailed.length > 0 || filteredAwayDetailed.length > 0
    || filteredHomeSimple.length > 0 || filteredAwaySimple.length > 0;

  if (hasAnyPlayer) {
    const parts: string[] = [header];

    // Home: liste détaillée si dispo, sinon simple
    if (filteredHomeDetailed.length > 0) {
      const playerList = filteredHomeDetailed
        .slice(0, 5) // max 5 joueurs par équipe pour économie d'espace
        .map(p => {
          const statusIcon = p.status === 'out' ? '🚫' : p.status === 'doubtful' ? '❓' : '⚠️';
          // Type tronqué pour économie
          const shortType = (p.type || 'blessure')
            .replace(/^(rupture|entorse|fracture|déchirure|lésion)\s+/i, '$1 ')
            .slice(0, 25);
          return `${p.name} (${shortType}, ${statusIcon})`;
        })
        .join(', ');
      const more = filteredHomeDetailed.length > 5 ? ` +${filteredHomeDetailed.length - 5} autres` : '';
      parts.push(`Absents ${homeTeam}: ${playerList}${more}`);
    } else if (filteredHomeSimple.length > 0) {
      parts.push(`Absents ${homeTeam}: ${filteredHomeSimple.slice(0, 5).join(', ')}`);
    }

    // Away
    if (filteredAwayDetailed.length > 0) {
      const playerList = filteredAwayDetailed
        .slice(0, 5)
        .map(p => {
          const statusIcon = p.status === 'out' ? '🚫' : p.status === 'doubtful' ? '❓' : '⚠️';
          const shortType = (p.type || 'blessure')
            .replace(/^(rupture|entorse|fracture|déchirure|lésion)\s+/i, '$1 ')
            .slice(0, 25);
          return `${p.name} (${shortType}, ${statusIcon})`;
        })
        .join(', ');
      const more = filteredAwayDetailed.length > 5 ? ` +${filteredAwayDetailed.length - 5} autres` : '';
      parts.push(`Absents ${awayTeam}: ${playerList}${more}`);
    } else if (filteredAwaySimple.length > 0) {
      parts.push(`Absents ${awayTeam}: ${filteredAwaySimple.slice(0, 5).join(', ')}`);
    }

    body = parts.join(' · ');
  } else if (isFootball) {
    body = `${header} · Composition officielle non prise en compte dans le pronostic`;
  } else if (isUS) {
    body = `${header} · Lineup officiel et DNP à vérifier`;
  } else {
    // Sport non couvert: disclaimer générique court
    body = `${header}`;
  }

  const totalCount = filteredHomeDetailed.length + filteredAwayDetailed.length
    + filteredHomeSimple.length + filteredAwaySimple.length;
  const short = totalCount > 0
    ? `⚠️ Compo 1h avant · ${totalCount} absent(s) clé(s)`
    : '⚠️ Vérifie la compo 1h avant';

  return {
    text: body,
    short,
    keyPlayersCount: totalCount,
    sport,
    shouldShow: true,
  };
}

/**
 * Version Telegram HTML (multi-lignes si joueurs détaillés).
 */
export function buildLineupDisclaimerHTML(opts: LineupDisclaimerInput): string {
  const d = buildLineupDisclaimer(opts);
  // Format détaillé multi-ligne si joueurs présents
  const lines = d.text.split(' · ');
  if (lines.length > 1) {
    let html = `\n    <b>${lines[0]}</b>`;
    for (let i = 1; i < lines.length; i++) {
      html += `\n    <i>${lines[i]}</i>`;
    }
    return html;
  }
  return `\n    <i>${d.text}</i>`;
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
