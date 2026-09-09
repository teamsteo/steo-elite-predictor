/**
 * comboGrouped.ts — P3 : moteur du « COMBO GROUPÉ » journalier (DM Telegram privé)
 *
 * Audit P3 (root cause du « 0 matchs éligibles ») :
 *   L'ancienne logique exigeait cote combinée ≥ 10 avec max 7 legs à risque ≤ 25%.
 *   Mathématiquement : 10^(1/7) = 1.389/leg → proba implicite ≈ 72% → risque ≥ 28% > 25%.
 *   → AUCUN combo ne pouvait jamais être construit depuis les cotes implicites.
 *     Le blocage « 0 matchs éligibles (minimum 3 requis) » était structurel.
 *
 * Nouveau design :
 *   - Multi-sport : Football (⚽) + MLB (⚾), combo groupé quand les 2 sports dispo,
 *     ou combo mono-sport selon disponibilité (demande produit P3).
 *   - Caps de risque PAR SPORT (alignés palier/selectTopDailyPredictions) :
 *     football 25%, MLB 30% (sport 2 issues, favoris plus fréquents).
 *   - Cote 10 = OBJECTIF (rempli gloutonnement jusqu'à 7 legs), plus un prérequis bloquant :
 *     dès 2 legs fiables → « COMBO DU JOUR » publié à sa cote réelle.
 *   - Tier de recours « risque étendu » (≤35%) clairement étiqueté plutôt qu'un message sec.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type ComboSport = 'football' | 'baseball';

export interface ComboCandidate {
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
  sport: ComboSport;
  predictedResult: 'home' | 'draw' | 'away';
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  riskPercentage: number;
  winProbability: number;
  confidence: string;
  valueBetDetected: boolean;
  edge: number;
  reasoning: string[];
  kellyStake: number;
  selectedOdds: number;
  /** Provenance : 'ml' = analyse ML fraîche, 'db' = prédiction pipeline en base, 'implied' = cotes implicites */
  source: 'ml' | 'db' | 'implied';
}

export interface BuiltCombo {
  combo: ComboCandidate[];
  combinedOdds: number;
  combinedWinProb: number;
  ev: number;
  /** true si cote ≥ 10 atteinte (format « multi-jours »), sinon combo du jour */
  reachedTarget: boolean;
  /** true si au moins 2 sports représentés (combo groupé) */
  isMultiSport: boolean;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Cap de risque par sport — aligné sur selectTopDailyPredictions + palier intelligent */
export const SPORT_RISK_CAP: Record<ComboSport, number> = {
  football: 25,
  baseball: 30,
};

/** Tier de recours : risque étendu, publication clairement étiquetée */
export const EXTENDED_RISK_CAP = 35;

/** Cote combinée cible (objectif multi-jours, remplissage glouton) */
export const TARGET_COMBINED_ODDS = 10;

/** Cote combinée max — au-delà, on n'ajoute plus de legs */
export const HARD_MAX_COMBINED_ODDS = 25;

/** Cote mini par sélection (les ultra-favoris < 1.15 n'apportent rien dans un combo) */
export const MIN_ODDS_LEG = 1.15;

export const MIN_LEGS = 2;
export const MAX_LEGS = 7;

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function normalizeTeamKey(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Clé de déduplication d'un match : équipes normalisées + date ( Jour) */
export function matchKey(homeTeam: string, awayTeam: string, date?: string): string {
  const d = (date || '').split('T')[0];
  return `${normalizeTeamKey(homeTeam)}|${normalizeTeamKey(awayTeam)}|${d}`;
}

export function selectedOddsForResult(
  result: string,
  oddsHome: number,
  oddsDraw: number | null,
  oddsAway: number,
): number {
  if (result === 'home') return oddsHome;
  if (result === 'away') return oddsAway;
  return oddsDraw ?? 3.0;
}

export function betLabelForCandidate(c: ComboCandidate): string {
  if (c.predictedResult === 'draw') return 'Match Nul';
  return `Victoire ${c.predictedResult === 'home' ? c.homeTeam : c.awayTeam}`;
}

export function sportEmoji(sport: ComboSport): string {
  return sport === 'baseball' ? '⚾' : '⚽';
}

/**
 * Candidat de secours depuis les cotes implicites (margin/vig retirée).
 * Fix audit A6 : confiance honnête — 'medium' par défaut avec cotes réelles,
 * 'high' seulement pour les favoris très nets (risque ≤ 15%).
 */
export function impliedCandidate(
  m: {
    homeTeam: string;
    awayTeam: string;
    league?: string;
    date?: string;
    oddsHome: number;
    oddsDraw?: number | null;
    oddsAway: number;
  },
  sport: ComboSport,
): ComboCandidate {
  const impliedHome = 1 / m.oddsHome;
  const impliedAway = 1 / m.oddsAway;
  const impliedDraw = m.oddsDraw && m.oddsDraw > 0 ? 1 / m.oddsDraw : 0;
  const margin = impliedHome + impliedAway + impliedDraw - 1;
  const vigAdj = margin > 0 ? 1 + margin : 1;

  const probHome = impliedHome / vigAdj;
  const probAway = impliedAway / vigAdj;
  const probDraw = impliedDraw / vigAdj;

  let bestResult: 'home' | 'draw' | 'away' = 'home';
  let bestProb = probHome;
  if (probAway > bestProb) { bestResult = 'away'; bestProb = probAway; }
  if (probDraw > bestProb) { bestResult = 'draw'; bestProb = probDraw; }

  // Sport 2 issues (MLB) : jamais de draw
  if (sport === 'baseball' && bestResult === 'draw') {
    bestResult = probHome >= probAway ? 'home' : 'away';
    bestProb = Math.max(probHome, probAway);
  }

  const risk = Math.round(100 - bestProb * 100);
  const oddsDraw = m.oddsDraw ?? null;

  return {
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    league: m.league || 'Unknown',
    date: m.date || '',
    sport,
    predictedResult: bestResult,
    oddsHome: m.oddsHome,
    oddsDraw,
    oddsAway: m.oddsAway,
    riskPercentage: risk,
    winProbability: Math.round(bestProb * 100),
    confidence: risk <= 15 ? 'high' : 'medium',
    valueBetDetected: false,
    edge: 0,
    reasoning: [],
    kellyStake: 0,
    selectedOdds: selectedOddsForResult(bestResult, m.oddsHome, oddsDraw, m.oddsAway),
    source: 'implied',
  };
}

// ─── Éligibilité ─────────────────────────────────────────────────────────────

export function isEligible(c: ComboCandidate, riskCap?: number): boolean {
  const cap = riskCap ?? SPORT_RISK_CAP[c.sport] ?? 25;
  if (c.riskPercentage > cap) return false;
  if (c.selectedOdds < MIN_ODDS_LEG) return false;
  if (c.confidence === 'low') return false;
  if (c.selectedOdds <= 0) return false;
  return true;
}

// ─── Construction du combo ───────────────────────────────────────────────────

/**
 * Construction gloutonne du combo groupé :
 *   Phase 1 — diversification : le meilleur (risque min) de chaque sport disponible.
 *   Phase 2 — remplissage par risque croissant jusqu'à la cote cible (max 7 legs, cote ≤ 25).
 * Retourne null si moins de MIN_LEGS legs.
 */
export function buildGroupedCombo(candidates: ComboCandidate[]): BuiltCombo | null {
  if (candidates.length < MIN_LEGS) return null;

  const sorted = [...candidates].sort(
    (a, b) => a.riskPercentage - b.riskPercentage || b.edge - a.edge,
  );
  const sports = [...new Set(sorted.map((c) => c.sport))];

  const combo: ComboCandidate[] = [];
  const used = new Set<ComboCandidate>();
  let combinedOdds = 1;

  const addLeg = (c: ComboCandidate): boolean => {
    if (combo.length >= MAX_LEGS) return false;
    if (combinedOdds * c.selectedOdds > HARD_MAX_COMBINED_ODDS) return false;
    combo.push(c);
    used.add(c);
    combinedOdds *= c.selectedOdds;
    return true;
  };

  // Phase 1 : un leg par sport disponible (diversification produit « combo groupé »)
  for (const s of sports) {
    if (combo.length >= sports.length) break; // au plus 1 leg de départ par sport
    const best = sorted.find((c) => c.sport === s && !used.has(c));
    if (best) addLeg(best);
  }

  // Phase 2 : remplir jusqu'à la cote cible avec les plus fiables restants
  for (const c of sorted) {
    if (combinedOdds >= TARGET_COMBINED_ODDS) break;
    if (used.has(c)) continue;
    addLeg(c);
  }

  if (combo.length < MIN_LEGS) return null;

  const combinedWinProb = combo.reduce((acc, c) => acc * (c.winProbability / 100), 1);
  const ev = combinedOdds * combinedWinProb - 1;
  const comboSports = new Set(combo.map((c) => c.sport));

  return {
    combo,
    combinedOdds: Math.round(combinedOdds * 100) / 100,
    combinedWinProb,
    ev: Math.round(ev * 10000) / 10000,
    reachedTarget: combinedOdds >= TARGET_COMBINED_ODDS,
    isMultiSport: comboSports.size > 1,
  };
}

// ─── Formatage Telegram (HTML) ───────────────────────────────────────────────

export function formatMatchDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr.split('T')[0];
    const jours = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const mois = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jui', 'aoû', 'sep', 'oct', 'nov', 'déc'];
    return `${jours[d.getDay()]} ${d.getDate()} ${mois[d.getMonth()]}`;
  } catch {
    return dateStr.split('T')[0];
  }
}

function comboTitle(built: BuiltCombo): string {
  const hasFoot = built.combo.some((c) => c.sport === 'football');
  const hasMlb = built.combo.some((c) => c.sport === 'baseball');
  if (hasFoot && hasMlb) return 'COMBO GROUPÉ ⚽+⚾';
  if (hasMlb) return 'COMBO MULTI-JOURS MLB';
  return 'COMBO MULTI-JOURS FOOT';
}

function sourceLabel(c: ComboCandidate): string {
  if (c.source === 'db') return ' 🔁';
  if (c.source === 'implied') return '';
  return '';
}

export function formatComboMessage(built: BuiltCombo, extended: boolean = false): string {
  const { combo, combinedOdds, combinedWinProb, ev } = built;
  const dateParts = [...new Set(combo.map((c) => formatMatchDate(c.date)).filter(Boolean))];
  const tier = extended
    ? '⚠️ <i>RISQUE ÉTENDU — aucune sélection ≤ cap standard aujourd\'hui.</i>'
    : '⚠️ <i>Combo à risque contrôlé — cap par sport : foot 25%, MLB 30%.</i>';

  let msg = '╔═════════════════════════════════════════╗\n';
  msg += '║                                       ║\n';
  msg += `║   🎯 <b>${comboTitle(built)}</b>\n`;
  msg += '║                                       ║\n';
  msg += '╚═════════════════════════════════════════╝\n\n';

  if (dateParts.length > 0) {
    msg += `📅 <b>Période</b> : ${dateParts.join(' + ')}\n`;
  }
  msg += `📊 <b>Cote combinée</b> : <code>${combinedOdds.toFixed(2)}</code>${built.reachedTarget ? ' ✅ (objectif 10 atteint)' : ''}\n`;
  msg += `🎯 <b>Prob. cumulée</b> : ${(combinedWinProb * 100).toFixed(1)}%\n`;
  msg += `💰 <b>Valeur attendue</b> : ${(ev >= 0 ? '+' : '') + (ev * 100).toFixed(1)}%\n`;
  msg += `📈 <b>${combo.length} sélections</b>${built.isMultiSport ? ' — multi-sports' : ''}\n\n`;
  msg += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  combo.forEach((c, i) => {
    const dateLabel = formatMatchDate(c.date);
    const riskBar = c.riskPercentage <= 15 ? '🟢' : c.riskPercentage <= 20 ? '🟡' : c.riskPercentage <= SPORT_RISK_CAP[c.sport] ? '🟠' : '🔴';
    const confLabel = c.confidence === 'high' ? 'FIABLE' : c.confidence === 'medium' ? 'MOYEN' : 'FAIBLE';
    const vbLabel = c.valueBetDetected ? '💎 VB' : '';

    msg += `<b>${i + 1}.</b> ${sportEmoji(c.sport)} ${c.homeTeam} vs ${c.awayTeam}\n`;
    msg += `   🏆 ${c.league}${sourceLabel(c)}\n`;
    if (dateLabel) msg += `   📅 ${dateLabel}\n`;
    msg += `   ✅ <b>${betLabelForCandidate(c)}</b>\n`;
    msg += `   💰 Cote : <code>${c.selectedOdds.toFixed(2)}</code>  ${riskBar} Risque ${c.riskPercentage}%  🔒 ${confLabel} ${vbLabel}\n`;
    if (c.reasoning && c.reasoning.length > 0) {
      msg += `   💡 ${c.reasoning.slice(0, 2).join(' | ')}\n`;
    }
    msg += '\n';
  });

  msg += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  msg += `🎯 <b>Cote totale : ${combinedOdds.toFixed(2)}</b>\n`;
  msg += `📈 <b>Proba. gain : ${(combinedWinProb * 100).toFixed(1)}%</b>\n`;
  msg += `💰 <b>VE : ${(ev >= 0 ? '+' : '') + (ev * 100).toFixed(1)}%</b>\n\n`;
  msg += tier;
  msg += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  return msg;
}
