/**
 * ═══════════════════════════════════════════════════════════════════
 * BADJAN — Section Telegram dédiée (Task 14)
 * ═══════════════════════════════════════════════════════════════════
 * Spécification utilisateur :
 * - Matchs de FOOT uniquement, scrappés par le pipeline du jour
 * - Filtre : niveau de risque ≤ 45 %
 * - Les favoris doivent TOUS jouer à DOMICILE (prédiction home
 *   + cote domicile la plus basse du 1X2)
 * - AUCUNE sauvegarde Supabase, AUCUN bilan (verify) — juste une publication
 *
 * Fichier volontairement ISOLÉ : zéro import depuis le code existant
 * hors helpers Telegram exportés, zéro écriture DB, zéro impact sur
 * les sections summary / valuebets / kamikaze / combo.
 * ═══════════════════════════════════════════════════════════════════
 */

// ── Constantes BADJAN ──
export const BADJAN_MAX_RISK = 45;
export const BADJAN_MIN_FAVORITE_ODDS = 1.10; // garde-fou anti-cote corrompue
const TELEGRAM_MAX_LENGTH = 4096;

// ── Types (loose = compatibles avec le pipeline) ──
export interface BadjanMatchInput {
  homeTeam: string;
  awayTeam: string;
  sport?: string;
  league?: string;
  date?: string;
  displayDate?: string;
  predictedResult?: 'home' | 'away' | 'draw';
  confidence?: string;
  riskPercentage?: number;
  winProbability?: number;
  oddsHome?: number;
  oddsAway?: number;
  oddsDraw?: number | null;
  isEstimated?: boolean;
  recommendation?: string;
  _dixonColes?: any;
  [key: string]: any; // champs extra du pipeline tolérés
}

export interface BadjanPublishResult {
  success: boolean;
  picks: number;
  message?: string;
}

// ── Helpers locaux (répliques minimales, zéro couplage) ──

/** Foot uniquement : 'Football', 'football', 'soccer' (même logique que telegramService). */
function isFootballSport(sport?: string): boolean {
  if (!sport) return false;
  const s = sport.toLowerCase();
  return s.includes('foot') || s === 'soccer';
}

function formatBadjanDateTime(dateStr?: string, displayDate?: string): { date: string; time: string } {
  try {
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                            'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        // UTC : ESPN fournit des dates UTC, le canal Telegram est en UTC+0 (cohérent avec les autres sections)
        const date = `${dayNames[d.getUTCDay()]} ${d.getUTCDate()} ${monthNames[d.getUTCMonth()]}`;
        const time = `${d.getUTCHours().toString().padStart(2, '0')}h${d.getUTCMinutes().toString().padStart(2, '0')}`;
        return { date, time };
      }
    }
    if (displayDate) {
      const parts = displayDate.split(',');
      if (parts.length >= 2) return { date: parts[0].trim(), time: parts[1].trim() };
      return { date: displayDate, time: '' };
    }
    return { date: 'Date inconnue', time: '' };
  } catch {
    return { date: 'Date inconnue', time: '' };
  }
}

/** Dedup interne : mêmes équipes + même date = un seul pick. */
function dedupBadjan<T extends { homeTeam?: string; awayTeam?: string; date?: string }>(matches: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const m of matches) {
    const key = `${(m.homeTeam || '').toLowerCase().trim()}__${(m.awayTeam || '').toLowerCase().trim()}__${(m.date || '').split('T')[0]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════
// FILTRE BADJAN (pur, testable, sans réseau ni DB)
// ═══════════════════════════════════════════════════════════════════

/**
 * Filtre BADJAN strict :
 * 1. Football uniquement
 * 2. riskPercentage défini et ≤ 45
 * 3. Favori à domicile : prédiction 'home' ET cote domicile strictement
 *    la plus basse du 1X2 (le marché confirme le favori domicile)
 * 4. Cotes réelles (pas d'estimation) et cote favori plausible
 */
export function filterBadjanMatches(matches: BadjanMatchInput[]): BadjanMatchInput[] {
  const filtered = (matches || []).filter(m => {
    // 1. Football uniquement
    if (!isFootballSport(m.sport)) return false;

    // 2. Risque défini et ≤ 45 %
    if (typeof m.riskPercentage !== 'number' || !isFinite(m.riskPercentage)) return false;
    if (m.riskPercentage > BADJAN_MAX_RISK) return false;

    // 3. Favori à domicile
    if (m.predictedResult !== 'home') return false;
    const oh = m.oddsHome, oa = m.oddsAway, od = m.oddsDraw;
    if (typeof oh !== 'number' || typeof oa !== 'number' || !isFinite(oh) || !isFinite(oa)) return false;
    if (oh < BADJAN_MIN_FAVORITE_ODDS) return false;          // cote corrompue
    if (oh >= oa) return false;                               // marché : away au moins aussi bas → pas favori net
    if (typeof od === 'number' && isFinite(od) && oh >= od) return false; // nul coté plus bas → pas favori

    // 4. Cotes réelles uniquement (le risque doit être fiable)
    if (m.isEstimated) return false;

    return true;
  });

  // Dedup puis tri : risque croissant (le plus sûr d'abord), puis date
  const deduped = dedupBadjan(filtered);
  deduped.sort((a, b) => {
    const r = (a.riskPercentage ?? 100) - (b.riskPercentage ?? 100);
    if (r !== 0) return r;
    return new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime();
  });
  return deduped;
}

// ═══════════════════════════════════════════════════════════════════
// FORMAT BADJAN
// ═══════════════════════════════════════════════════════════════════

export function formatBadjanMessage(picks: BadjanMatchInput[]): string {
  let message = '';
  message += '╔════════════════════════╗\n';
  message += `║ 🏠 <b>BADJAN — Favoris à domicile</b> ║\n`;
  message += '╚════════════════════════╝\n\n';
  message += `✅ <b>${picks.length} match${picks.length > 1 ? 's' : ''}</b> — risque ≤ ${BADJAN_MAX_RISK} % · favoris à domicile\n\n`;

  for (let i = 0; i < picks.length; i++) {
    const m = picks[i];
    const { date, time } = formatBadjanDateTime(m.date, m.displayDate);
    const winProb = m.winProbability ?? (m.riskPercentage !== undefined ? 100 - m.riskPercentage : undefined);

    message += '━━━━━━━━━━━━━━━━━━━━━\n';
    message += `<b>${i + 1}. ${m.homeTeam} vs ${m.awayTeam}</b>\n`;
    if (date) message += `📅 ${date}`;
    if (time) message += `  ·  ⏰ ${time}`;
    if (date || time) message += '\n';
    if (m.league) message += `🏆 ${m.league}\n`;

    if (typeof m.oddsHome === 'number' && typeof m.oddsAway === 'number') {
      message += `📊 Cotes: 1:<b>${m.oddsHome.toFixed(2)}</b>`;
      if (typeof m.oddsDraw === 'number') message += ` X:<b>${m.oddsDraw.toFixed(2)}</b>`;
      message += ` 2:<b>${m.oddsAway.toFixed(2)}</b>\n`;
    }

    message += `🎯 Pari: <b>${m.homeTeam} (domicile)</b>`;
    if (m.recommendation && m.recommendation !== 'N/A') message += ` — <b>${m.recommendation}</b>`;
    message += '\n';

    if (winProb !== undefined) message += `💥 Chance: <b>${Math.round(winProb)}%</b> · Risque: <b>${Math.round(m.riskPercentage ?? 100 - winProb)}%</b>\n`;

    // Bloc Dixon-Coles UNIQUEMENT si déjà calculé par le pipeline (zéro calcul ajouté)
    if (m._dixonColes) {
      try {
        const dc = m._dixonColes;
        if (dc?.expectedHomeGoals !== undefined && dc?.expectedAwayGoals !== undefined) {
          message += `⚽ xG attendu: ${Number(dc.expectedHomeGoals).toFixed(1)} - ${Number(dc.expectedAwayGoals).toFixed(1)}\n`;
        }
      } catch { /* skip */ }
    }

    message += '\n';
  }

  message += '━━━━━━━━━━━━━━━━━━━━━\n';
  message += `🏠 <b>Badjan</b> — sélection uniquement des favoris jouant à domicile.\n`;
  message += `Un favori domicile reste toujours favorite : pariez responsable.\n`;

  return message;
}

// ═══════════════════════════════════════════════════════════════════
// PUBLICATION BADJAN (Telegram uniquement — pas de DB, pas de bilan)
// ═══════════════════════════════════════════════════════════════════

export async function publishBadjanToTelegram(matches: BadjanMatchInput[]): Promise<BadjanPublishResult> {
  const { sendTelegramMessage, isDuplicate } = await import('./telegramService');

  const picks = filterBadjanMatches(matches);

  if (picks.length === 0) {
    console.log('🏈 BADJAN: 0 match éligible (foot + risque ≤45% + favori domicile) — aucune publication');
    return { success: false, picks: 0, message: 'Aucun match éligible' };
  }

  const message = formatBadjanMessage(picks);

  // Dedup : ne jamais publier deux fois la même sélection sur une même instance
  if (isDuplicate('badjan', message)) {
    console.log('🏈 BADJAN: sélection identique déjà publiée — skip');
    return { success: false, picks: picks.length, message: 'Déjà publiée' };
  }

  // Message trop long → découpe propre aux frontières de matchs
  if (message.length <= TELEGRAM_MAX_LENGTH) {
    const ok = await sendTelegramMessage(message);
    return { success: ok, picks: picks.length, message: ok ? 'Publié' : 'Erreur envoi' };
  }

  const header = `🏠 <b>BADJAN — Favoris à domicile</b> (${picks.length} matchs)\n\n`;
  let current = header;
  let part = 1;
  let allOk = true;

  for (let i = 0; i < picks.length; i++) {
    const block = formatBadjanMessage([picks[i]])
      .split('━━━━━━━━━━━━━━━━━━━━━\n')[1] || ''; // bloc individuel sans le footer
    if (current.length + block.length > TELEGRAM_MAX_LENGTH - 200) {
      const ok = await sendTelegramMessage(current + `— partie ${part} —`);
      allOk = allOk && ok;
      part++;
      current = header;
    }
    current += block + '\n';
  }
  if (current.trim() !== header.trim()) {
    const ok = await sendTelegramMessage(current);
    allOk = allOk && ok;
  }

  return { success: allOk, picks: picks.length, message: `Publié en ${part} partie(s)` };
}
