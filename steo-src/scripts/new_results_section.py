#!/usr/bin/env python3
"""
Replace the ResultsSection function in page.tsx with the new modern version.
Reads the file, replaces lines 6730-7624, writes back.
"""

import sys

filepath = '/home/z/my-project/src/app/page.tsx'

# Read the original file
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Lines are 1-indexed, Python is 0-indexed
# Replace lines 6730 to 7624 (inclusive, 1-indexed)
# Python: 6729 to 7623 (inclusive)
start_idx = 6729  # line 6730 in 1-indexed
end_idx = 7623    # line 7624 in 1-indexed

new_section = r'''// ═══════════════════════════════════════════════════════════════
// Section Stats — Refonte complète avec graphiques
// Pipeline ML unifié · Données Supabase · Visualisations pro
// ═══════════════════════════════════════════════════════════════
function ResultsSection() {
  const [activePeriod, setActivePeriod] = useState<'yesterday' | 'week' | 'month'>('yesterday');
  const [activeSport, setActiveSport] = useState<'all' | 'football' | 'basketball' | 'hockey'>('all');
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [chartTab, setChartTab] = useState<'overview' | 'sport' | 'bettype' | 'timeline'>('overview');

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/results?action=stats');
      const data = await response.json();
      if (data.daily || data.weekly || data.monthly || data.overall) {
        setStats({
          daily: data.daily,
          weekly: data.weekly,
          monthly: data.monthly,
          overall: data.overall,
          bySport: data.bySport || { football: { total: 0, wins: 0, losses: 0, winRate: 0 }, basketball: { total: 0, wins: 0, losses: 0, winRate: 0 }, hockey: { total: 0, wins: 0, losses: 0, winRate: 0 } },
          expertAdvisor: data.expertAdvisor || null,
        });
      }
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Erreur chargement stats:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void (async () => { await fetchStats(); })(); }, [fetchStats]);

  const periodKey = activePeriod === 'yesterday' ? 'daily' : activePeriod === 'week' ? 'weekly' : 'monthly';
  const periodLabels: Record<string, { label: string; icon: string; date: string }> = {
    yesterday: { label: 'Hier', icon: '📅', date: 'Pronostics de la veille' },
    week: { label: 'Semaine', icon: '📆', date: '7 derniers jours' },
    month: { label: 'Mois', icon: '🗓️', date: '30 derniers jours' },
  };
  const sportLabels: Record<string, { label: string; icon: string; color: string }> = {
    all: { label: 'Tous', icon: '📊', color: '#8b5cf6' },
    football: { label: 'Foot', icon: '⚽', color: '#22c55e' },
    basketball: { label: 'Basket', icon: '🏀', color: '#f97316' },
    hockey: { label: 'Hockey', icon: '🏒', color: '#3b82f6' },
  };

  const rateColor = (rate: number) => rate >= 60 ? '#22c55e' : rate >= 45 ? '#eab308' : '#ef4444';

  const getFilteredStats = () => {
    if (!stats || !stats[periodKey]) return null;
    if (activeSport === 'all') return stats[periodKey];
    if (stats.bySport && stats.bySport[activeSport]) {
      const s = stats.bySport[activeSport];
      return { totalPredictions: s.total || 0, completed: s.total || 0, wins: s.wins || 0, losses: s.losses || 0, winRate: s.winRate || 0 };
    }
    return stats[periodKey];
  };
  const periodStats = getFilteredStats();
  const expertStats = stats?.expertAdvisor || stats?.overall?.expertAdvisor || null;

  // ── Data for charts ──
  const sportData = [
    { name: 'Football', fullName: '⚽ Football', wins: stats?.bySport?.football?.wins || 0, losses: stats?.bySport?.football?.losses || 0, total: stats?.bySport?.football?.total || 0, rate: stats?.bySport?.football?.winRate || 0 },
    { name: 'Basketball', fullName: '🏀 Basketball', wins: stats?.bySport?.basketball?.wins || 0, losses: stats?.bySport?.basketball?.losses || 0, total: stats?.bySport?.basketball?.total || 0, rate: stats?.bySport?.basketball?.winRate || 0 },
    { name: 'Hockey', fullName: '🏒 Hockey', wins: stats?.bySport?.hockey?.wins || 0, losses: stats?.bySport?.hockey?.losses || 0, total: stats?.bySport?.hockey?.total || 0, rate: stats?.bySport?.hockey?.winRate || 0 },
  ].filter(s => s.total > 0);

  const betTypeData: { name: string; winRate: number; total: number; sport: string }[] = [];
  if (stats?.bySport?.football?.total > 0) {
    const d = stats.bySport.football.details || {};
    if (d.resultats?.total > 0) betTypeData.push({ name: '1N2', winRate: d.resultats.winRate, total: d.resultats.total, sport: 'football' });
    if (d.buts?.total > 0) betTypeData.push({ name: 'Buts O/U', winRate: d.buts.winRate, total: d.buts.total, sport: 'football' });
    if (d.btts?.total > 0) betTypeData.push({ name: 'BTTS', winRate: d.btts.winRate, total: d.btts.total, sport: 'football' });
  }
  if (stats?.bySport?.basketball?.total > 0) {
    const d = stats.bySport.basketball.details || {};
    if (d.resultats?.total > 0) betTypeData.push({ name: 'Vainqueur', winRate: d.resultats.winRate, total: d.resultats.total, sport: 'basketball' });
    if (d.buts?.total > 0) betTypeData.push({ name: 'Points O/U', winRate: d.buts.winRate, total: d.buts.total, sport: 'basketball' });
  }
  if (stats?.bySport?.hockey?.total > 0) {
    const d = stats.bySport.hockey.details || {};
    if (d.resultats?.total > 0) betTypeData.push({ name: 'Vainqueur NHL', winRate: d.resultats.winRate, total: d.resultats.total, sport: 'hockey' });
    if (d.buts?.total > 0) betTypeData.push({ name: 'Buts O/U', winRate: d.buts.winRate, total: d.buts.total, sport: 'hockey' });
  }

  const timelineData = (() => {
    const days: { date: string; shortDate: string; wins: number; losses: number; total: number; rate: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const shortDate = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
      days.push({ date: dateStr, shortDate, wins: 0, losses: 0, total: 0, rate: 0 });
    }
    const preds = periodStats?.predictions || [];
    preds.forEach((p: any) => {
      const matchDate = (p.matchDate || p.date || '').split('T')[0];
      const day = days.find(d => d.date === matchDate);
      if (day) { day.total++; if (p.resultMatch === true) day.wins++; else if (p.resultMatch === false) day.losses++; }
    });
    days.forEach(d => { d.rate = d.total > 0 ? Math.round((d.wins / d.total) * 100) : 0; });
    return days;
  })();

  const totalWins = sportData.reduce((a, s) => a + s.wins, 0);
  const totalLosses = sportData.reduce((a, s) => a + s.losses, 0);
  const totalPredictions = totalWins + totalLosses;
  const globalRate = totalPredictions > 0 ? Math.round((totalWins / totalPredictions) * 100) : 0;

  // ── LOADING ──
  if (loading) {
    return (
      <div style={{ background: '#0d0d0f', borderRadius: '16px', padding: '32px', border: '1px solid #8b5cf620', textAlign: 'center' }}>
        <div style={{ fontSize: '28px', marginBottom: '12px' }}>⏳</div>
        <div style={{ color: '#888', fontSize: '13px' }}>Chargement des statistiques...</div>
      </div>
    );
  }

  // ── EMPTY STATE ──
  if (!periodStats || periodStats.totalPredictions === 0) {
    return (
      <div style={{ background: '#0d0d0f', borderRadius: '16px', padding: '20px', border: '1px solid #8b5cf620' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {Object.entries(sportLabels).map(([key, value]) => (
            <button key={key} onClick={() => setActiveSport(key as any)} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: activeSport === key ? value.color : '#161620', color: activeSport === key ? '#fff' : '#888', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s' }}>
              <span>{value.icon}</span> {value.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {Object.entries(periodLabels).map(([key, value]) => (
            <button key={key} onClick={() => setActivePeriod(key as any)} style={{ padding: '10px 18px', borderRadius: '10px', border: 'none', background: activePeriod === key ? '#8b5cf6' : '#161620', color: activePeriod === key ? '#fff' : '#888', cursor: 'pointer', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}>
              <span>{value.icon}</span> {value.label}
            </button>
          ))}
        </div>
        <div style={{ background: 'linear-gradient(135deg, #12121f 0%, #1a1530 100%)', borderRadius: '14px', padding: '48px 20px', textAlign: 'center', border: '1px solid #8b5cf625' }}>
          <div style={{ fontSize: '52px', marginBottom: '16px' }}>📊</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#8b5cf6', marginBottom: '8px' }}>En attente des résultats</div>
          <div style={{ fontSize: '13px', color: '#888', marginBottom: '16px' }}>Les statistiques seront disponibles après vérification des matchs.</div>
          <div style={{ fontSize: '11px', color: '#555', padding: '8px 14px', background: '#0d0d0f', borderRadius: '8px', display: 'inline-block' }}>🕒 Vérification automatique chaque jour à 7h (Paris)</div>
        </div>
      </div>
    );
  }

  // ── MAIN RENDER ──
  return (
    <div style={{ background: '#0d0d0f', borderRadius: '16px', padding: '20px', border: '1px solid #8b5cf620' }}>
      {/* ── KPI HEADER ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
        {[
          { label: 'Taux Global', value: `${globalRate}%`, icon: '🎯', color: rateColor(globalRate), sub: `${totalPredictions} pronostics` },
          { label: 'Victoires', value: `${totalWins}`, icon: '✅', color: '#22c55e', sub: `${globalRate}% réussite` },
          { label: 'Défaites', value: `${totalLosses}`, icon: '❌', color: '#ef4444', sub: totalPredictions > 0 ? `${Math.round(totalLosses / totalPredictions * 100)}%` : '0%' },
          { label: 'Expert Advisor', value: expertStats ? `${expertStats.winRate}%` : 'N/A', icon: '🧠', color: expertStats ? rateColor(expertStats.winRate) : '#666', sub: expertStats ? `${expertStats.total} conseils` : 'Non dispo' },
        ].map((kpi, i) => (
          <div key={i} style={{ background: '#12121f', borderRadius: '12px', padding: '14px', border: `1px solid ${kpi.color}25`, textAlign: 'center' }}>
            <div style={{ fontSize: '18px', marginBottom: '4px' }}>{kpi.icon}</div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: kpi.color, lineHeight: 1.1 }}>{kpi.value}</div>
            <div style={{ fontSize: '10px', color: '#666', marginTop: '4px', fontWeight: 600 }}>{kpi.label}</div>
            <div style={{ fontSize: '9px', color: '#444', marginTop: '2px' }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* ── WIN RATE GAUGE ── */}
      <div style={{ background: 'linear-gradient(135deg, #12121f 0%, #1a1530 100%)', borderRadius: '14px', padding: '24px', marginBottom: '16px', textAlign: 'center', border: '1px solid #8b5cf625', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '120px', height: '120px', borderRadius: '50%', background: `${rateColor(periodStats.winRate)}08` }} />
        <div style={{ position: 'absolute', bottom: '-30px', left: '-30px', width: '100px', height: '100px', borderRadius: '50%', background: `${rateColor(periodStats.winRate)}06` }} />
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
          Taux de Réussite {sportLabels[activeSport].label !== 'Tous' ? sportLabels[activeSport].label : 'Global'} — {periodLabels[activePeriod].label}
        </div>
        <div style={{ fontSize: '64px', fontWeight: 900, color: rateColor(periodStats.winRate), lineHeight: 1, marginBottom: '4px' }}>
          {periodStats.winRate}%
        </div>
        <div style={{ fontSize: '13px', color: '#666', marginTop: '8px' }}>
          {periodStats.wins}/{periodStats.completed} pronostics vérifiés
        </div>
        {lastUpdate && (
          <div style={{ fontSize: '10px', color: '#444', marginTop: '6px' }}>
            Mis à jour: {lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
        <div style={{ marginTop: '16px', background: '#1a1a2a', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
          <div style={{ width: `${periodStats.winRate}%`, height: '100%', borderRadius: '6px', background: `linear-gradient(90deg, ${rateColor(periodStats.winRate)}, ${rateColor(periodStats.winRate)}aa)`, transition: 'width 0.8s ease' }} />
        </div>
      </div>

      {/* ── FILTRES ── */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginBottom: '10px', flexWrap: 'wrap' }}>
        {Object.entries(sportLabels).map(([key, value]) => (
          <button key={key} onClick={() => setActiveSport(key as any)} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: activeSport === key ? value.color : '#161620', color: activeSport === key ? '#fff' : '#888', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s' }}>
            <span>{value.icon}</span> {value.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {Object.entries(periodLabels).map(([key, value]) => (
          <button key={key} onClick={() => setActivePeriod(key as any)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: activePeriod === key ? '#8b5cf6' : '#161620', color: activePeriod === key ? '#fff' : '#888', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}>
            <span>{value.icon}</span> {value.label}
          </button>
        ))}
      </div>

      {/* ── CHART TABS ── */}
      {sportData.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: '#12121f', borderRadius: '10px', padding: '4px' }}>
          {[
            { key: 'overview', label: '🏆 Vue d\'ensemble' },
            { key: 'sport', label: '📊 Par Sport' },
            { key: 'bettype', label: '🎯 Types de Paris' },
            { key: 'timeline', label: '📅 Évolution' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setChartTab(tab.key as any)} style={{ flex: 1, padding: '10px 8px', borderRadius: '8px', border: 'none', background: chartTab === tab.key ? '#8b5cf6' : 'transparent', color: chartTab === tab.key ? '#fff' : '#888', cursor: 'pointer', fontSize: '11px', fontWeight: 600, transition: 'all 0.2s', whiteSpace: 'nowrap' }}>
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ── CHART: OVERVIEW (W/L par sport) ── */}
      {chartTab === 'overview' && sportData.length > 0 && (
        <div style={{ background: '#12121f', borderRadius: '12px', padding: '16px', marginBottom: '16px', border: '1px solid #1a1a2a' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#8b5cf6', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🏆 Répartition Victoires / Défaites par Sport
          </div>
          {sportData.map((s, i) => {
            const pct = s.total > 0 ? (s.wins / s.total) * 100 : 0;
            const sportColor = sportLabels[s.name.toLowerCase() === 'football' ? 'football' : s.name.toLowerCase() === 'basketball' ? 'basketball' : 'hockey']?.color || '#888';
            return (
              <div key={i} style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#ccc', fontWeight: 600 }}>{s.fullName}</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: rateColor(s.rate) }}>{s.rate}% <span style={{ color: '#666', fontWeight: 400 }}>({s.wins}W / {s.losses}L)</span></span>
                </div>
                <div style={{ background: '#1a1a2a', borderRadius: '6px', height: '24px', overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${sportColor}, ${sportColor}aa)`, borderRadius: '6px 0 0 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'width 0.6s ease', minWidth: pct > 0 ? '24px' : '0' }}>
                    {pct > 15 && <span style={{ fontSize: '9px', fontWeight: 700, color: '#fff' }}>W</span>}
                  </div>
                  <div style={{ flex: 1, height: '100%', background: '#ef444418', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0 6px 6px 0' }}>
                    {(100 - pct) > 15 && <span style={{ fontSize: '9px', fontWeight: 700, color: '#ef4444' }}>L</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── CHART: SPORT ── */}
      {chartTab === 'sport' && sportData.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '16px' }}>
          {sportData.map((s, i) => {
            const sportColor = sportLabels[s.name.toLowerCase() === 'football' ? 'football' : s.name.toLowerCase() === 'basketball' ? 'basketball' : 'hockey']?.color || '#888';
            return (
              <div key={i} style={{ background: '#12121f', borderRadius: '12px', padding: '16px', border: `1px solid ${sportColor}25` }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: sportColor, marginBottom: '10px' }}>{s.name}</div>
                <div style={{ fontSize: '36px', fontWeight: 900, color: rateColor(s.rate), lineHeight: 1 }}>{s.rate}%</div>
                <div style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>{s.wins}W / {s.losses}L / {s.total} total</div>
                <div style={{ marginTop: '10px', background: '#1a1a2a', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                  <div style={{ width: `${s.rate}%`, height: '100%', background: sportColor, borderRadius: '4px', transition: 'width 0.6s ease' }} />
                </div>
                {s.name === 'Football' && stats?.bySport?.football?.details && (
                  <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                    {[['1N2', stats.bySport.football.details.resultats], ['Buts', stats.bySport.football.details.buts], ['BTTS', stats.bySport.football.details.btts]].map(([label, d]: [string, any]) =>
                      d && d.total > 0 ? (
                        <div key={label} style={{ background: '#0d0d0f', borderRadius: '6px', padding: '6px', textAlign: 'center' }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: rateColor(d.winRate) }}>{d.winRate}%</div>
                          <div style={{ fontSize: '8px', color: '#555' }}>{label}</div>
                        </div>
                      ) : null
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── CHART: BET TYPES ── */}
      {chartTab === 'bettype' && betTypeData.length > 0 && (
        <div style={{ background: '#12121f', borderRadius: '12px', padding: '16px', marginBottom: '16px', border: '1px solid #22c55e20' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#22c55e', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🎯 Taux de Réussite par Type de Paris
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {betTypeData.sort((a, b) => b.winRate - a.winRate).map((bt, i) => {
              const sportColor = sportLabels[bt.sport]?.color || '#888';
              return (
                <div key={i} style={{ background: '#0d0d0f', borderRadius: '8px', padding: '10px 12px', border: `1px solid ${sportColor}15` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px' }}>{sportLabels[bt.sport]?.icon}</span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#ccc' }}>{bt.name}</span>
                    </div>
                    <div style={{ background: rateColor(bt.winRate), color: '#fff', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                      {bt.winRate}%
                    </div>
                  </div>
                  <div style={{ background: '#1a1a2a', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                    <div style={{ width: `${bt.winRate}%`, height: '100%', background: `linear-gradient(90deg, ${sportColor}, ${sportColor}88)`, borderRadius: '4px', transition: 'width 0.6s ease' }} />
                  </div>
                  <div style={{ fontSize: '10px', color: '#555', marginTop: '4px' }}>{bt.total} pronostics vérifiés</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── CHART: TIMELINE ── */}
      {chartTab === 'timeline' && (
        <div style={{ background: '#12121f', borderRadius: '12px', padding: '16px', marginBottom: '16px', border: '1px solid #3b82f620' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#3b82f6', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            📅 Évolution sur 7 jours
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '140px', padding: '0 4px' }}>
            {timelineData.map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: d.total > 0 ? rateColor(d.rate) : '#444' }}>{d.total > 0 ? `${d.rate}%` : ''}</span>
                <div style={{ width: '100%', maxWidth: '32px', borderRadius: '6px 6px 2px 2px', background: d.total > 0 ? (d.rate >= 60 ? '#22c55e' : d.rate >= 45 ? '#eab308' : '#ef4444') : '#1a1a2a', height: `${Math.max(8, d.total > 0 ? (d.rate / 100) * 100 : 8)}%`, transition: 'height 0.4s ease', minHeight: '8px' }} />
                <span style={{ fontSize: '9px', color: '#666', fontWeight: 500 }}>{d.shortDate}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '10px', color: '#555' }}>
            <span>✅ Vert = {'>'}60%</span>
            <span>🟡 Jaune = 45-60%</span>
            <span>🔴 Rouge = {'<'}45%</span>
          </div>
        </div>
      )}

      {/* ── STATS RÉSUMÉ ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
        <div style={{ background: '#12121f', borderRadius: '10px', padding: '14px', border: '1px solid #8b5cf620', textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#fff' }}>{periodStats.totalPredictions}</div>
          <div style={{ fontSize: '10px', color: '#666', fontWeight: 600 }}>Total Pronostics</div>
        </div>
        <div style={{ background: '#12121f', borderRadius: '10px', padding: '14px', border: '1px solid #eab30820', textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#eab308' }}>{periodStats.pending || 0}</div>
          <div style={{ fontSize: '10px', color: '#666', fontWeight: 600 }}>En Attente</div>
        </div>
        <div style={{ background: '#12121f', borderRadius: '10px', padding: '14px', border: '1px solid #22c55e20', textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#22c55e' }}>{periodStats.completed}</div>
          <div style={{ fontSize: '10px', color: '#666', fontWeight: 600 }}>Vérifiés</div>
        </div>
      </div>

      {/* ── EXPERT ADVISOR ── */}
      {expertStats && expertStats.total > 0 && (
        <div style={{ background: 'linear-gradient(135deg, #12121f 0%, #0d2020 100%)', borderRadius: '12px', padding: '16px', marginBottom: '16px', border: '1px solid #14b8a630' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '14px', color: '#14b8a6', fontWeight: 700 }}>🧠 Ratio Expert Advisor</span>
            <span style={{ background: rateColor(expertStats.winRate), color: '#fff', padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700 }}>{expertStats.winRate}%</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', textAlign: 'center' }}>
            {[{ v: expertStats.total, l: 'Conseils', c: '#14b8a6' }, { v: expertStats.wins, l: 'Gagnés', c: '#22c55e' }, { v: expertStats.losses, l: 'Perdus', c: '#ef4444' }, { v: `${expertStats.highConfidence?.winRate || 0}%`, l: 'Haute Conf.', c: '#3b82f6' }].map((item, i) => (
              <div key={i} style={{ background: '#0d0d0f', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: item.c }}>{item.v}</div>
                <div style={{ fontSize: '9px', color: '#555', fontWeight: 600 }}>{item.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ANALYTICS DASHBOARD (recharts) ── */}
      <div style={{ marginTop: '16px' }}>
        <AnalyticsDashboard />
      </div>

      {/* ── EXPORT ── */}
      <div style={{ marginTop: '12px' }}>
        <ExportManager stats={stats} />
      </div>
    </div>
  );
}

'''

# Verify the start and end lines match expected content
before_start = lines[start_idx - 1].strip() if start_idx > 0 else ''
after_end = lines[end_idx + 1].strip() if end_idx + 1 < len(lines) else ''

print(f"Before start (line {start_idx}): {before_start[:60]}")
print(f"After end (line {end_idx + 2}): {after_end[:60]}")
print(f"Start content: {lines[start_idx].strip()[:60]}")
print(f"End content: {lines[end_idx].strip()[:60]}")

# Build the new file
new_lines = lines[:start_idx] + [new_section] + lines[end_idx + 1:]

# Write
with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"SUCCESS: Replaced lines {start_idx + 1}-{end_idx + 1} with new ResultsSection")
print(f"New file size: {len(new_lines)} lines")
