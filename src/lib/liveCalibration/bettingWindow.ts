/**
 * Betting Window — Détermine si un match est dans la fenêtre de pari live
 *
 * Le clock ESPN peut avoir plusieurs formats :
 *   - "45:12" (minutes:secondes)
 *   - "45'" (minutes avec apostrophe)
 *   - "45+2" (temps additionnel)
 *   - "HT" / "Halftime" (pause explicite)
 *   - "PT45M" (format ISO)
 *   - "2nd Half" (texte)
 *
 * Règles de la fenêtre de pari :
 *   - La calibration est valable si clock ∈ [42:00, 55:00] et match non fini
 *     (42-45 = fin de 1ère MT avec temps additionnel, 45-55 = début 2e MT)
 *   - clock > 55:00 → TROP TARD : la 2e MT est déjà bien entamée,
 *     les cotes live ont déjà bougé, publier serait inutile voire trompeur
 *   - match fini → JAMAIS de calibration
 */

const WINDOW_MIN_MINUTES = 42;   // début de fenêtre (fin 1ère MT, temps add. inclus)
const WINDOW_MAX_MINUTES = 55;   // fin de fenêtre (2e MT déjà avancée = trop tard)

export interface BettingWindowResult {
  is_betting_window: boolean;
  minutes: number | null;         // minute extraite du clock (null si non parsable)
  reason: string;                  // pourquoi oui/non (pour les logs)
}

/**
 * Parse le clock ESPN en minutes.
 * Retourne null si le format est inconnu.
 */
export function parseClockMinutes(clock: string | null | undefined): number | null {
  if (!clock) return null;
  const c = clock.trim();

  // "HT", "Halftime", "Mi-temps" → on est exactement à la pause → 45 min
  if (/^(ht|halftime|half.?time|mi.?temps)$/i.test(c)) return 45;

  // "2nd Half" / "1st Half" (texte) → début de période : 1er=0, 2e=45
  if (/^(1st|first)\s+half$/i.test(c)) return 0;
  if (/^(2nd|second)\s+half$/i.test(c)) return 45;

  // "PT45M" ou "PT1H10M" (ISO duration)
  const isoMatch = c.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
  if (isoMatch) {
    const h = parseInt(isoMatch[1] || '0', 10);
    const m = parseInt(isoMatch[2] || '0', 10);
    return h * 60 + m;
  }

  // "45+2" ou "45:12" → extraire le premier nombre
  // (uniquement si le reste est bien formé : pas de texte après)
  const numMatch = c.match(/^(\d+)(?::\d{2})?\+?(\d+)?['′]?\s*$/);
  if (numMatch) {
    const mins = parseInt(numMatch[1], 10);
    if (numMatch[2]) {
      // Temps additionnel "45+2" → 45e + 2 = 47e minute effective
      return mins + parseInt(numMatch[2], 10);
    }
    return mins;
  }

  return null;
}

/**
 * Détermine si un match est dans la fenêtre de pari live.
 *
 * @param clock   Clock ESPN brut ("45:12", "HT", "50:00"...)
 * @param period  Période ESPN (1 = 1ère MT, 2 = 2e MT)
 * @param isFinished  Match terminé ?
 */
export function isBettingWindow(
  clock: string | null | undefined,
  period: number | undefined,
  isFinished: boolean | undefined,
): BettingWindowResult {
  if (isFinished) {
    return { is_betting_window: false, minutes: null, reason: 'match terminé' };
  }

  const minutes = parseClockMinutes(clock);

  // Si period === 2 (2e MT démarrée) et clock > WINDOW_MAX → trop tard
  if (period === 2 && minutes !== null && minutes > WINDOW_MAX_MINUTES) {
    return {
      is_betting_window: false,
      minutes,
      reason: `2e MT déjà avancée (${minutes}′ > ${WINDOW_MAX_MINUTES}′) — cotes live déjà bougées`,
    };
  }

  // Si period === 1 et clock < WINDOW_MIN → match pas encore à la pause
  if (period === 1 && minutes !== null && minutes < WINDOW_MIN_MINUTES - 2) {
    return {
      is_betting_window: false,
      minutes,
      reason: `1ère MT pas terminée (${minutes}′ < ${WINDOW_MIN_MINUTES - 2}′)`,
    };
  }

  // Clock non parsable + period 2 → on accepte par prudence (les crons
  // GH Actions ont déjà du retard, on préfère calibrer que rater)
  if (minutes === null && period === 2) {
    return {
      is_betting_window: true,
      minutes: null,
      reason: `clock non parsable ("${clock}") mais period=2 — calibration par prudence`,
    };
  }

  if (minutes === null) {
    return { is_betting_window: false, minutes: null, reason: `clock inconnu ("${clock}") et period≠2` };
  }

  // Dans la fenêtre [42, 55]
  if (minutes >= WINDOW_MIN_MINUTES && minutes <= WINDOW_MAX_MINUTES) {
    return {
      is_betting_window: true,
      minutes,
      reason: `dans la fenêtre de pari (${minutes}′ ∈ [${WINDOW_MIN_MINUTES}′, ${WINDOW_MAX_MINUTES}′])`,
    };
  }

  return {
    is_betting_window: false,
    minutes,
    reason: `hors fenêtre (${minutes}′ ∉ [${WINDOW_MIN_MINUTES}′, ${WINDOW_MAX_MINUTES}′])`,
  };
}

/**
 * Calcule le temps restant approximatif avant la reprise de la 2e MT.
 * Utilisé pour afficher "⏰ valable encore X min" dans le message Telegram.
 *
 * Si on est à 45:30 (mi-temps), la reprise est dans ~12 min (pause de ~15 min).
 * Si on est à 48:00 en 2e MT, le match a déjà repris → fenêtre restante = 55 - 48 = 7 min.
 */
export function bettingWindowRemainingMinutes(minutes: number | null, period: number | undefined): number | null {
  if (minutes === null) return null;

  // En 1ère MT (42-45+) : pause en cours ou imminente, reprise ≈ minute 45 + 15 min de pause
  if (period === 1 || minutes <= 47) {
    return Math.max(0, Math.round(15 - Math.max(0, minutes - 45)));
  }

  // En 2e MT (45-55) : la fenêtre de pari se ferme à 55'
  return Math.max(0, WINDOW_MAX_MINUTES - minutes);
}
