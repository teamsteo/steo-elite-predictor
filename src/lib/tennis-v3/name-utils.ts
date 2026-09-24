/**
 * Tennis V3 — Normalisation des noms de joueurs
 * Deux formats à unifier :
 *   tennis-data : "Alcaraz C." / "Ugo Carabelli C."  (initiale(s) EN FIN, avec point)
 *   BetExplorer : "Carlos Alcaraz" / "Camillo Ugo Carabelli" (prénom d'abord)
 * Clé canonique : "alcaraz-c", "ugo-carabelli-c".
 * L'index surname référence chaque token du surname (multi-mots) pour la résolution.
 */

import { createHash } from 'crypto';

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export interface CanonicalName {
  surname: string; // tokens du nom de famille joints par '-'
  initial: string; // 'a'..'' (peut être vide)
  key: string; // "alcaraz-c" / "ugo-carabelli-c" / "federer"
}

/**
 * "Alcaraz C." → { surname: "alcaraz", initial: "c", key: "alcaraz-c" }
 * "Ugo Carabelli C." → { surname: "ugo-carabelli", initial: "c", key: "ugo-carabelli-c" }
 * "Carlos Alcaraz" → { surname: "alcaraz", initial: "c", key: "alcaraz-c" }
 * "Camillo Ugo Carabelli" → { surname: "carabelli", initial: "c", key: "carabelli-c" }
 */
export function parseCanonical(raw: string): CanonicalName {
  const cleaned = stripAccents(String(raw || ''))
    .toLowerCase()
    .replace(/[^a-z\s.'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return { surname: '', initial: '', key: '' };

  // tokens ; un "initial token" = 1 lettre (le point final a été retiré)
  const tokens = cleaned
    .split(' ')
    .filter(Boolean)
    .map((t) => t.replace(/\.$/, ''))
    .filter(Boolean);

  if (tokens.length === 0) return { surname: '', initial: '', key: '' };
  if (tokens.length === 1) return { surname: tokens[0], initial: '', key: tokens[0] };

  const isSingleLetter = (t: string) => t.length === 1;

  // Style tennis-data : initiale(s) EN FIN ("alcaraz c", "ugo carabelli c")
  const trailingInitials: string[] = [];
  let i = tokens.length - 1;
  while (i >= 1 && isSingleLetter(tokens[i])) {
    trailingInitials.unshift(tokens[i]);
    i--;
  }
  if (trailingInitials.length > 0 && i >= 0) {
    const surname = tokens.slice(0, i + 1).join('-');
    return { surname, initial: trailingInitials[0], key: `${surname}-${trailingInitials[0]}` };
  }

  // Style complet : "Carlos Alcaraz" → surname = dernier token, initial = 1re lettre du 1er token
  const surname = tokens[tokens.length - 1];
  const initial = tokens[0][0] || '';
  return { surname, initial, key: initial ? `${surname}-${initial}` : surname };
}

/**
 * Index surname → clés. Chaque clé est référencée sous CHAQUE token de son
 * surname (ex: "ugo-carabelli-c" indexé sous "ugo" ET "carabelli") pour
 * retrouver les composés depuis les prénoms complets.
 */
export function buildSurnameIndex(keys: string[]): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  const add = (surname: string, key: string) => {
    if (!surname) return;
    const arr = idx.get(surname) || [];
    if (!arr.includes(key)) arr.push(key);
    idx.set(surname, arr);
  };
  for (const key of keys) {
    const { surname } = parseCanonical(key.replace(/-([a-z])$/, ' $1')); // "alcaraz-c" → tokens
    // direct : tokens du key sans l'initiale finale
    const tokens = key.split('-');
    const last = tokens[tokens.length - 1];
    const isTrailingInitial = last.length === 1;
    const surnameTokens = isTrailingInitial ? tokens.slice(0, -1) : tokens;
    for (const t of surnameTokens) add(t, key);
    if (surname && surname !== surnameTokens.join('-')) add(surname, key);
  }
  return idx;
}

/**
 * Résout un nom (n'importe quel format) vers une clé tennis-data connue.
 * Retourne null si introuvable ou ambigu (on ne devine jamais).
 */
export function resolvePlayer(name: string, surnameIndex: Map<string, string[]>): string | null {
  const { surname, initial } = parseCanonical(name);
  if (!surname) return null;
  const surnameTokens = surname.split('-');
  // union des candidats sur tous les tokens du surname
  const candidates = new Set<string>();
  for (const t of surnameTokens) {
    for (const c of surnameIndex.get(t) || []) candidates.add(c);
  }
  if (candidates.size === 0) return null;
  if (initial) {
    // comparaison CANONIQUE : tolère les deux formats de clés ("zverev a." / "zverev-a")
    const expected = `${surname}-${initial}`;
    const exact = [...candidates].filter((c) => parseCanonical(c).key === expected);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return null; // ambigu
  }
  // sans initiale : unique candidat seulement
  if (candidates.size === 1) return [...candidates][0];
  return null;
}

/** Hash stable pour matchId */
export function stableHash(s: string): string {
  return createHash('md5').update(s).digest('hex').slice(0, 10);
}
