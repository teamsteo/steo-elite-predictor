'use client';

/**
 * ═══════════════════════════════════════════════════════════════════
 * 🎰 COMBO LOTO — Combiné "de ouf" tout sport, risque faible
 * ═══════════════════════════════════════════════════════════════════
 * Objectif utilisateur: "faire des combinés de ouf et qui sait un jour
 * la chance peut sourire car tu fais quelque que fois 100%"
 *
 * Rôle:
 *  - Récupère les pronostics DU JOUR de /api/matches (aucun nouveau scraping)
 *  - Filtre les picks à RISQUE FAIBLE (≤50% par défaut, configurable)
 *  - Permet de cocher/décocher pour construire un combiné manuellement
 *  - Auto-sélection: top-N par risque (3, 5, 8, 10, "Tout")
 *  - Calcul cote combinée + proba impliquée + gain potentiel (25 000 F min)
 *  - Bouton COPIER (format Betclic-friendly: une ligne par pick)
 *  - Balises de filtre: ≤30% / 31-50% / par sport / par ligue / cote max
 *
 * RÈGLE BOOKMAKER (alignée Task 46):
 *  - Football home/away + cote draw → pari "Victoire ou Nul" @DC (VN)
 *  - Football home/away SANS cote draw → "Victoire" pure @1X2
 *  - Sports US → "Victoire" pure (pas de nul)
 *  - Chaque pick = UNE option, UNE cote (jamais de mix)
 */
import { useState, useMemo, useCallback } from 'react';
import { Copy, Check, Shuffle, RotateCcw, Filter, Sparkles } from 'lucide-react';

interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  date: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  isEstimated?: boolean;
  riskPercentage?: number;
  riskLabel?: string;
  confidence?: string;
  predictedResult?: 'home' | 'away' | 'draw' | 'avoid' | string;
  recommendation?: string;
  winProbability?: number;
  displayDate?: string;
  isFinished?: boolean;
  isLive?: boolean;
}

interface ComboLotoProps {
  matches: Match[];
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Sport icon + color */
function sportMeta(sport: string): { icon: string; color: string } {
  const s = (sport || '').toLowerCase();
  if (s.includes('foot')) return { icon: '⚽', color: '#22c55e' };
  if (s.includes('basket')) return { icon: '🏀', color: '#f97316' };
  if (s.includes('nhl') || s.includes('hockey')) return { icon: '🏒', color: '#06b6d4' };
  if (s.includes('mlb') || s.includes('base')) return { icon: '⚾', color: '#dc2626' };
  if (s.includes('nfl')) return { icon: '🏈', color: '#3b82f6' };
  if (s.includes('tennis')) return { icon: '🎾', color: '#a855f7' };
  return { icon: '🎮', color: '#888' };
}

/** Cote du côté recommandé. Pour football home/away + cote draw → Double Chance. */
function pickOdds(m: Match): number {
  if (!m.predictedResult || m.predictedResult === 'avoid') return 0;
  const s = (m.sport || '').toLowerCase();
  const isFootball = s.includes('foot');
  const side = m.predictedResult === 'home' ? m.oddsHome : m.predictedResult === 'away' ? m.oddsAway : m.oddsDraw || 0;
  // Football + cote draw → Double Chance "Victoire ou Nul" (règle bookmaker Task 46)
  if (isFootball && (m.predictedResult === 'home' || m.predictedResult === 'away') && m.oddsDraw && m.oddsDraw > 1) {
    const dc = 1 / (1 / side + 1 / m.oddsDraw);
    if (isFinite(dc) && dc > 1) return Math.round(dc * 100) / 100;
  }
  return side;
}

/** Libellé du pari (règle bookmaker). */
function pickLabel(m: Match): string {
  if (!m.predictedResult || m.predictedResult === 'avoid') return 'À éviter';
  const s = (m.sport || '').toLowerCase();
  const isFootball = s.includes('foot');
  if (m.predictedResult === 'home') {
    if (isFootball && m.oddsDraw && m.oddsDraw > 1) return `${m.homeTeam} ou Nul`;
    return `Victoire ${m.homeTeam}`;
  }
  if (m.predictedResult === 'away') {
    if (isFootball && m.oddsDraw && m.oddsDraw > 1) return `Nul ou ${m.awayTeam}`;
    return `Victoire ${m.awayTeam}`;
  }
  if (m.predictedResult === 'draw') return 'Match Nul';
  return m.recommendation || m.homeTeam;
}

/** Sport icon compact pour l'affichage pick */
function pickIcon(sport: string): string {
  return sportMeta(sport).icon;
}

/** Format hh:mm UTC depuis ISO date */
function kickOffTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  } catch {
    return '?';
  }
}

// ─── Composant principal ────────────────────────────────────────────

const MIN_STAKE = 25000;

export function ComboLotoSection({ matches }: ComboLotoProps) {
  // Filtres
  const [maxRiskFilter, setMaxRiskFilter] = useState<number>(50); // ≤ 50% = risque faible
  const [sportFilter, setSportFilter] = useState<string>('all');
  const [leagueFilter, setLeagueFilter] = useState<string>('all');
  const [maxOddsFilter, setMaxOddsFilter] = useState<number>(0); // 0 = illimité
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [autoN, setAutoN] = useState<number>(0); // 0 = manuel

  // ── Filtrage ──────────────────────────────────────────────────────

  const eligibleMatches = useMemo(() => {
    return matches
      .filter(m => {
        if (m.isFinished || m.isLive) return false;
        if (!m.predictedResult || m.predictedResult === 'avoid') return false;
        if ((m.riskPercentage ?? 100) > maxRiskFilter) return false;
        if (sportFilter !== 'all' && (m.sport || '').toLowerCase() !== sportFilter) return false;
        if (leagueFilter !== 'all' && m.league !== leagueFilter) return false;
        const o = pickOdds(m);
        if (o <= 1) return false;
        if (maxOddsFilter > 0 && o > maxOddsFilter) return false;
        return true;
      })
      .sort((a, b) => (a.riskPercentage ?? 100) - (b.riskPercentage ?? 100));
  }, [matches, maxRiskFilter, sportFilter, leagueFilter, maxOddsFilter]);

  // ── Sports & ligues disponibles (pour les filtres) ───────────────

  const sports = useMemo(() => {
    const set = new Set<string>();
    matches.forEach(m => m.sport && set.add(m.sport));
    return Array.from(set);
  }, [matches]);

  const leagues = useMemo(() => {
    const set = new Set<string>();
    matches
      .filter(m => sportFilter === 'all' || (m.sport || '').toLowerCase() === sportFilter)
      .forEach(m => m.league && set.add(m.league));
    return Array.from(set).sort();
  }, [matches, sportFilter]);

  // ── Auto-sélection ────────────────────────────────────────────────

  const applyAuto = useCallback((n: number) => {
    setAutoN(n);
    const next = new Set<string>();
    const pool = [...eligibleMatches];
    const take = n === 0 ? 0 : Math.min(n, pool.length);
    for (let i = 0; i < take; i++) next.add(pool[i].id);
    setSelected(next);
  }, [eligibleMatches]);

  // ── Toggle manuel ─────────────────────────────────────────────────

  const toggle = useCallback((id: string) => {
    setAutoN(0);
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setAutoN(0);
    setSelected(new Set());
  }, []);

  // ── Picks sélectionnés (préservés dans l'ordre de sélection = ordre tri risque) ──

  const selectedPicks = useMemo(() => {
    return eligibleMatches.filter(m => selected.has(m.id));
  }, [eligibleMatches, selected]);

  // ── Calcul cote combinée + gain potentiel ─────────────────────────

  const { combinedOdds, combinedProb, potentialGain, profit } = useMemo(() => {
    if (selectedPicks.length === 0) {
      return { combinedOdds: 0, combinedProb: 0, potentialGain: 0, profit: 0 };
    }
    let odds = 1;
    let prob = 1;
    for (const p of selectedPicks) {
      const o = pickOdds(p);
      odds *= o;
      // Proba impliquée par le marché (devig approximatif: 1/cote)
      prob *= 1 / o;
    }
    // Mise selon palier (aligné couponTask46): prob combinée ≥0.80 → 75k, ≥0.72 → 50k, sinon 25k
    const stake = prob >= 0.80 ? 75000 : prob >= 0.72 ? 50000 : MIN_STAKE;
    const gain = Math.round(stake * odds);
    return {
      combinedOdds: Math.round(odds * 100) / 100,
      combinedProb: Math.round(prob * 1000) / 1000,
      potentialGain: gain,
      profit: gain - stake,
    };
  }, [selectedPicks]);

  // ── Copie ─────────────────────────────────────────────────────────

  const buildCopyText = useCallback((): string => {
    if (selectedPicks.length === 0) return '';
    const lines: string[] = [];
    lines.push('🎰 COMBO LOTO — Steo Élite');
    lines.push(`📅 ${new Date().toLocaleDateString('fr-FR')}`);
    lines.push(`💰 Mise conseillée: ${combinedProb >= 0.80 ? '75 000' : combinedProb >= 0.72 ? '50 000' : '25 000'} F`);
    lines.push(`🎯 Cote combinée: ${combinedOdds.toFixed(2)}`);
    lines.push(`📊 Proba impliquée: ${(combinedProb * 100).toFixed(1)}%`);
    lines.push(`💸 Gain potentiel: ${potentialGain.toLocaleString('fr-FR')} F`);
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    selectedPicks.forEach((m, i) => {
      const sm = sportMeta(m.sport);
      lines.push(`${i + 1}. ${sm.icon} ${m.homeTeam} vs ${m.awayTeam}`);
      lines.push(`   📍 ${pickLabel(m)} @ ${pickOdds(m).toFixed(2)} (risque ${m.riskPercentage}%)`);
      lines.push(`   🕒 ${kickOffTime(m.date)} UTC · ${m.league || m.sport}`);
    });
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push(`✅ Total: ${selectedPicks.length} picks · Cote ${combinedOdds.toFixed(2)} · Gain ${potentialGain.toLocaleString('fr-FR')} F`);
    return lines.join('\n');
  }, [selectedPicks, combinedOdds, combinedProb, potentialGain]);

  const copyToClipboard = useCallback(async () => {
    const text = buildCopyText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback mobile
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
      document.body.removeChild(ta);
    }
  }, [buildCopyText]);

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div style={{ marginBottom: '12px' }}>
      {/* Header */}
      <div style={{ marginBottom: '12px' }}>
        <h2 style={{
          fontSize: '16px',
          fontWeight: 'bold',
          color: '#a855f7',
          marginBottom: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          🎰 Combo Loto — Le Combiné du Jour
        </h2>
        <p style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>
          Sélection à risque faible • Tout sport confondu • Espoir de jackpot 🍀
        </p>
        <p style={{ color: '#666', fontSize: '10px' }}>
          {eligibleMatches.length} éligibles · {selectedPicks.length} sélectionnés · Cote {combinedOdds.toFixed(2)} · Proba {(combinedProb * 100).toFixed(1)}%
        </p>
      </div>

      {/* Balises de filtre */}
      <div style={{
        background: '#161616',
        borderRadius: '8px',
        padding: '10px',
        marginBottom: '12px',
        border: '1px solid #2a2a2a'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <Filter size={12} color="#a855f7" />
          <span style={{ fontSize: '10px', color: '#888', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Filtres de sélection
          </span>
        </div>

        {/* Risque max */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>Risque maximum</div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {[
              { v: 20, label: '≤20% Très Sûr' },
              { v: 30, label: '≤30% Sûr' },
              { v: 40, label: '≤40% Modéré+' },
              { v: 50, label: '≤50% Modéré', def: true },
              { v: 60, label: '≤60% Risqué-' },
              { v: 100, label: 'Tous' },
            ].map(opt => (
              <button
                key={opt.v}
                onClick={() => setMaxRiskFilter(opt.v)}
                style={{
                  padding: '4px 8px',
                  fontSize: '10px',
                  borderRadius: '4px',
                  border: `1px solid ${maxRiskFilter === opt.v ? '#a855f7' : '#333'}`,
                  background: maxRiskFilter === opt.v ? '#a855f720' : 'transparent',
                  color: maxRiskFilter === opt.v ? '#a855f7' : '#888',
                  cursor: 'pointer',
                  fontWeight: maxRiskFilter === opt.v ? 'bold' : 'normal'
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sport + Ligue */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>Sport</div>
            <select
              value={sportFilter}
              onChange={e => { setSportFilter(e.target.value); setLeagueFilter('all'); }}
              style={{
                padding: '4px 8px',
                fontSize: '10px',
                borderRadius: '4px',
                background: '#0a0a0a',
                color: '#fff',
                border: '1px solid #333'
              }}
            >
              <option value="all">Tous</option>
              {sports.map(s => (
                <option key={s} value={s.toLowerCase()}>{sportMeta(s).icon} {s}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>Ligue</div>
            <select
              value={leagueFilter}
              onChange={e => setLeagueFilter(e.target.value)}
              style={{
                padding: '4px 8px',
                fontSize: '10px',
                borderRadius: '4px',
                background: '#0a0a0a',
                color: '#fff',
                border: '1px solid #333'
              }}
            >
              <option value="all">Toutes</option>
              {leagues.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>Cote max</div>
            <select
              value={maxOddsFilter}
              onChange={e => setMaxOddsFilter(Number(e.target.value))}
              style={{
                padding: '4px 8px',
                fontSize: '10px',
                borderRadius: '4px',
                background: '#0a0a0a',
                color: '#fff',
                border: '1px solid #333'
              }}
            >
              <option value={0}>Illimitée</option>
              <option value={1.5}>≤1.50</option>
              <option value={1.8}>≤1.80</option>
              <option value={2.0}>≤2.00</option>
              <option value={2.5}>≤2.50</option>
              <option value={3.0}>≤3.00</option>
            </select>
          </div>
        </div>

        {/* Auto-sélection */}
        <div>
          <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>
            Auto-sélection (par risque croissant)
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {[
              { n: 0, label: ' Manuel' },
              { n: 3, label: 'Top 3' },
              { n: 5, label: 'Top 5' },
              { n: 8, label: 'Top 8' },
              { n: 10, label: 'Top 10' },
              { n: 99, label: 'Tout' },
            ].map(opt => (
              <button
                key={opt.n}
                onClick={() => applyAuto(opt.n)}
                style={{
                  padding: '4px 8px',
                  fontSize: '10px',
                  borderRadius: '4px',
                  border: `1px solid ${autoN === opt.n ? '#22c55e' : '#333'}`,
                  background: autoN === opt.n ? '#22c55e15' : 'transparent',
                  color: autoN === opt.n ? '#22c55e' : '#888',
                  cursor: 'pointer',
                  fontWeight: autoN === opt.n ? 'bold' : 'normal'
                }}
              >
                {opt.label}
              </button>
            ))}
            {selected.size > 0 && (
              <button
                onClick={clearAll}
                style={{
                  padding: '4px 8px',
                  fontSize: '10px',
                  borderRadius: '4px',
                  border: '1px solid #ef4444',
                  background: 'transparent',
                  color: '#ef4444',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px'
                }}
              >
                <RotateCcw size={10} /> Vider
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Liste des matchs éligibles */}
      {eligibleMatches.length === 0 ? (
        <div style={{
          padding: '24px',
          textAlign: 'center',
          background: '#161616',
          borderRadius: '8px',
          border: '1px solid #2a2a2a'
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>😴</div>
          <p style={{ color: '#888', fontSize: '12px' }}>
            Aucun pronostic éligible avec ces filtres.
          </p>
          <p style={{ color: '#666', fontSize: '10px', marginTop: '4px' }}>
            Essayez d'élargir le filtre risque ou la ligue.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
          {eligibleMatches.map(m => {
            const isSel = selected.has(m.id);
            const sm = sportMeta(m.sport);
            const odds = pickOdds(m);
            const label = pickLabel(m);
            return (
              <button
                key={m.id}
                onClick={() => toggle(m.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  background: isSel ? `${sm.color}15` : '#0f0f0f',
                  border: `1px solid ${isSel ? sm.color : '#222'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s'
                }}
              >
                {/* Checkbox */}
                <div style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '4px',
                  border: `2px solid ${isSel ? sm.color : '#444'}`,
                  background: isSel ? sm.color : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {isSel && <Check size={10} color="#fff" />}
                </div>
                {/* Sport icon */}
                <span style={{ fontSize: '14px', flexShrink: 0 }}>{sm.icon}</span>
                {/* Teams + pick */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '11px', color: '#fff', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.homeTeam} <span style={{ color: '#666' }}>vs</span> {m.awayTeam}
                  </div>
                  <div style={{ fontSize: '10px', color: sm.color, marginTop: '2px' }}>
                    {label} <span style={{ color: '#666' }}>@ {odds.toFixed(2)}</span>
                  </div>
                </div>
                {/* Risk + time */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{
                    fontSize: '10px',
                    fontWeight: 'bold',
                    color: (m.riskPercentage ?? 100) <= 30 ? '#22c55e' : (m.riskPercentage ?? 100) <= 50 ? '#eab308' : '#ef4444'
                  }}>
                    {m.riskPercentage ?? '?'}%
                  </div>
                  <div style={{ fontSize: '9px', color: '#666' }}>
                    {kickOffTime(m.date)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Récap combiné + Copier */}
      {selectedPicks.length > 0 && (
        <div style={{
          position: 'sticky',
          bottom: '0',
          background: '#0a0a0a',
          borderTop: '2px solid #a855f7',
          padding: '12px',
          borderRadius: '8px 8px 0 0',
          zIndex: 10
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#888' }}>
                {selectedPicks.length} picks · Cote combinée
              </div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#a855f7' }}>
                {combinedOdds.toFixed(2)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#888' }}>
                Proba · Gain potentiel
              </div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#22c55e' }}>
                {(combinedProb * 100).toFixed(1)}% · {potentialGain.toLocaleString('fr-FR')} F
              </div>
            </div>
          </div>

          {/* Détail picks sélectionnés (compact) */}
          <div style={{
            background: '#161616',
            borderRadius: '6px',
            padding: '6px 8px',
            marginBottom: '8px',
            maxHeight: '120px',
            overflowY: 'auto'
          }}>
            {selectedPicks.map((m, i) => (
              <div key={m.id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '10px',
                color: '#aaa',
                padding: '2px 0',
                borderBottom: i < selectedPicks.length - 1 ? '1px solid #222' : 'none'
              }}>
                <span>{pickIcon(m.sport)} {pickLabel(m)}</span>
                <span style={{ color: '#888' }}>@ {pickOdds(m).toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Boutons */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={copyToClipboard}
              style={{
                flex: 1,
                padding: '10px',
                background: copied ? '#22c55e' : '#a855f7',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'COPIÉ !' : 'COPIER LE COMBINÉ'}
            </button>
          </div>

          <p style={{ fontSize: '9px', color: '#555', marginTop: '6px', textAlign: 'center' }}>
            ⚠️ Parier reste un jeu de hasard. Aucune garantie de gain.
          </p>
        </div>
      )}
    </div>
  );
}
