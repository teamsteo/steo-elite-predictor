'use client';

import React, { useState, useEffect, useCallback } from 'react';
import LiveMatchSimulation from './LiveMatchSimulation';
import type { LiveFootballMatch } from '@/lib/footballLiveService';

// ============================================
// PROPS
// ============================================

interface LiveMatchesGridProps {
  refreshInterval?: number; // en secondes
}

// ============================================
// COMPOSANT PRINCIPAL
// ============================================

export default function LiveMatchesGrid({ refreshInterval = 30 }: LiveMatchesGridProps) {
  const [matches, setMatches] = useState<LiveFootballMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<LiveFootballMatch | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [expandedStats, setExpandedStats] = useState<string | null>(null);

  // Récupérer les matchs live
  const fetchMatches = useCallback(async () => {
    try {
      const response = await fetch('/api/football/live');
      const data = await response.json();

      if (data.success) {
        // Prendre les 4 matchs avec la plus haute priorité
        const topMatches = data.matches
          .sort((a: LiveFootballMatch, b: LiveFootballMatch) => b.priority - a.priority)
          .slice(0, 4);

        setMatches(topMatches);
        setLastUpdate(new Date());
        setError(null);
      } else {
        setError(data.error || 'Erreur lors du chargement');
      }
    } catch (err) {
      setError('Impossible de charger les matchs live');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMatches();

    // Rafraîchir automatiquement
    const interval = setInterval(fetchMatches, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [fetchMatches, refreshInterval]);

  // Gérer les buts
  const handleGoal = useCallback((team: 'home' | 'away') => {
    if (soundEnabled) {
      // Le son est déjà joué dans le composant enfant
    }
  }, [soundEnabled]);

  // Render loading
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
        gap: '16px'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '4px solid #333',
          borderTop: '4px solid #22c55e',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <span style={{ color: '#888', fontSize: '14px' }}>Chargement des matchs live...</span>
      </div>
    );
  }

  // Render error
  if (error) {
    return (
      <div style={{
        background: '#2a1a1a',
        border: '1px solid #dc2626',
        borderRadius: '12px',
        padding: '30px',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
        <div style={{ color: '#ef4444', fontSize: '16px', marginBottom: '8px' }}>{error}</div>
        <div style={{ color: '#666', fontSize: '12px', marginBottom: '20px' }}>
          Vérifiez votre connexion ou réessayez plus tard
        </div>
        <button
          onClick={fetchMatches}
          style={{
            background: '#dc2626',
            color: '#fff',
            border: 'none',
            padding: '10px 24px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          🔄 Réessayer
        </button>
      </div>
    );
  }

  // Render no matches
  if (matches.length === 0) {
    return (
      <div style={{
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: '12px',
        padding: '40px',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📺</div>
        <div style={{ color: '#fff', fontSize: '18px', marginBottom: '8px' }}>
          Aucun match en cours
        </div>
        <div style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>
          Les prochains matchs apparaîtront automatiquement ici
        </div>
        <div style={{ color: '#22c55e', fontSize: '12px' }}>
          🔄 Actualisation automatique toutes les {refreshInterval}s
        </div>
      </div>
    );
  }

  // Déterminer la grille selon le nombre de matchs
  const gridStyle = matches.length === 1 
    ? { display: 'flex', justifyContent: 'center' }
    : matches.length === 2
    ? { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }
    : { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' };

  return (
    <div style={{ padding: '0 4px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{
              width: '10px',
              height: '10px',
              background: '#22c55e',
              borderRadius: '50%',
              animation: 'pulse 1s infinite'
            }} />
            <span style={{ color: '#22c55e', fontWeight: 'bold', fontSize: '16px' }}>
              LIVE
            </span>
            <span style={{ color: '#fff', fontSize: '16px' }}>
              {matches.length} match{matches.length > 1 ? 's' : ''} en cours
            </span>
          </div>

          {/* Badge grandes rencontres */}
          {matches.some(m => m.priority >= 80) && (
            <span style={{
              background: 'linear-gradient(135deg, #ffd700 0%, #ff8c00 100%)',
              color: '#000',
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 'bold'
            }}>
              ⭐ GRANDES RENCONTRES
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Toggle son */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{
              background: 'transparent',
              border: `1px solid ${soundEnabled ? '#22c55e' : '#444'}`,
              color: soundEnabled ? '#22c55e' : '#666',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            {soundEnabled ? '🔊' : '🔇'} Son
          </button>

          {/* Bouton refresh */}
          <button
            onClick={fetchMatches}
            style={{
              background: '#333',
              border: 'none',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            🔄 Actualiser
          </button>

          {/* Heure dernière maj */}
          {lastUpdate && (
            <span style={{ color: '#666', fontSize: '11px' }}>
              Mis à jour: {lastUpdate.toLocaleTimeString('fr-FR')}
            </span>
          )}
        </div>
      </div>

      {/* Grille des matchs */}
      <div style={gridStyle}>
        {matches.map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            compact={matches.length > 2}
            isExpanded={expandedStats === match.id}
            onToggleStats={() => setExpandedStats(expandedStats === match.id ? null : match.id)}
            onGoal={handleGoal}
          />
        ))}
      </div>

      {/* Légende */}
      <div style={{
        marginTop: '20px',
        padding: '12px',
        background: '#111',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '12px', background: '#22c55e', borderRadius: '50%' }} />
          <span style={{ color: '#888', fontSize: '11px' }}>Équipe domicile</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '12px', background: '#6B7280', borderRadius: '50%' }} />
          <span style={{ color: '#888', fontSize: '11px' }}>Équipe extérieur</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '12px', background: '#fff', borderRadius: '50%' }} />
          <span style={{ color: '#888', fontSize: '11px' }}>Ballon</span>
        </div>
        <div style={{ color: '#666', fontSize: '10px' }}>
          📊 Données ESPN • Mise à jour auto
        </div>
      </div>
    </div>
  );
}

// ============================================
// COMPOSANT CARTE DE MATCH
// ============================================

interface MatchCardProps {
  match: LiveFootballMatch;
  compact: boolean;
  isExpanded: boolean;
  onToggleStats: () => void;
  onGoal: (team: 'home' | 'away') => void;
}

function MatchCard({ match, compact, isExpanded, onToggleStats, onGoal }: MatchCardProps) {
  const recentGoals = match.events
    .filter(e => e.type === 'goal' || e.type === 'penalty')
    .slice(-3);

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)',
      borderRadius: '12px',
      padding: compact ? '12px' : '16px',
      border: match.priority >= 80 ? '1px solid rgba(255, 215, 0, 0.3)' : '1px solid #333',
      boxShadow: match.priority >= 80 ? '0 0 20px rgba(255, 215, 0, 0.1)' : 'none'
    }}>
      {/* Ligue */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '8px'
      }}>
        <span style={{
          color: '#888',
          fontSize: compact ? '10px' : '11px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          {match.league.logo && (
            <img src={match.league.logo} alt="" style={{ width: '14px', height: '14px' }} />
          )}
          {match.league.name}
        </span>
        
        {/* Indicateur priorité */}
        {match.priority >= 90 && (
          <span style={{ fontSize: '16px' }}>🔥</span>
        )}
        {match.priority >= 80 && match.priority < 90 && (
          <span style={{ fontSize: '14px' }}>⭐</span>
        )}
      </div>

      {/* Score */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '10px'
      }}>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{
            color: '#fff',
            fontSize: compact ? '12px' : '14px',
            fontWeight: 'bold',
            marginBottom: '2px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            {match.homeTeam.logo && (
              <img src={match.homeTeam.logo} alt="" style={{ width: '16px', height: '16px' }} />
            )}
            <span style={{
              maxWidth: '100px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {match.homeTeam.name}
            </span>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: '#222',
          padding: '6px 12px',
          borderRadius: '8px'
        }}>
          <span style={{
            color: '#fff',
            fontSize: compact ? '18px' : '22px',
            fontWeight: 'bold',
            minWidth: '20px',
            textAlign: 'center'
          }}>
            {match.score.home}
          </span>
          <span style={{ color: '#666', fontSize: '14px' }}>-</span>
          <span style={{
            color: '#fff',
            fontSize: compact ? '18px' : '22px',
            fontWeight: 'bold',
            minWidth: '20px',
            textAlign: 'center'
          }}>
            {match.score.away}
          </span>
        </div>

        <div style={{ flex: 1, textAlign: 'right' }}>
          <div style={{
            color: '#fff',
            fontSize: compact ? '12px' : '14px',
            fontWeight: 'bold',
            marginBottom: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '6px'
          }}>
            <span style={{
              maxWidth: '100px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {match.awayTeam.name}
            </span>
            {match.awayTeam.logo && (
              <img src={match.awayTeam.logo} alt="" style={{ width: '16px', height: '16px' }} />
            )}
          </div>
        </div>
      </div>

      {/* Simulation 2D */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
        <LiveMatchSimulation
          match={match}
          compact={compact}
          onGoal={onGoal}
        />
      </div>

      {/* Buts récents */}
      {recentGoals.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          marginBottom: '8px',
          justifyContent: 'center'
        }}>
          {recentGoals.map((goal, i) => (
            <span
              key={i}
              style={{
                background: '#1a1a1a',
                color: '#ffd700',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              ⚽ {goal.minute}' {goal.player.split(' ').pop()}
            </span>
          ))}
        </div>
      )}

      {/* Stats rapides */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '4px',
        marginBottom: '8px'
      }}>
        <StatBar
          label="Poss."
          home={match.stats.possession.home}
          away={match.stats.possession.away}
          unit="%"
        />
        <StatBar
          label="Tirs"
          home={match.stats.shots.home}
          away={match.stats.shots.away}
        />
        <StatBar
          label="Corners"
          home={match.stats.corners.home}
          away={match.stats.corners.away}
        />
      </div>

      {/* Bouton voir plus */}
      <button
        onClick={onToggleStats}
        style={{
          width: '100%',
          background: '#222',
          border: 'none',
          color: '#888',
          padding: '6px',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '11px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px'
        }}
      >
        {isExpanded ? '▲ Moins' : '▼ Plus de stats'}
      </button>

      {/* Stats détaillées */}
      {isExpanded && (
        <div style={{
          marginTop: '10px',
          padding: '10px',
          background: '#111',
          borderRadius: '8px'
        }}>
          <StatRow label="Tirs cadrés" home={match.stats.shotsOnTarget.home} away={match.stats.shotsOnTarget.away} />
          <StatRow label="Fautes" home={match.stats.fouls.home} away={match.stats.fouls.away} />
          <StatRow label="Cartons jaunes" home={match.stats.yellowCards.home} away={match.stats.yellowCards.away} isYellow />
          <StatRow label="Cartons rouges" home={match.stats.redCards.home} away={match.stats.redCards.away} isRed />
        </div>
      )}
    </div>
  );
}

// ============================================
// COMPOSANTS UTILITAIRES
// ============================================

function StatBar({ label, home, away, unit = '' }: { 
  label: string; 
  home: number; 
  away: number; 
  unit?: string;
}) {
  const total = home + away || 1;
  const homePercent = (home / total) * 100;
  const awayPercent = (away / total) * 100;

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ color: '#666', fontSize: '9px', marginBottom: '2px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ color: '#fff', fontSize: '10px', minWidth: '20px' }}>{home}{unit}</span>
        <div style={{ flex: 1, height: '3px', background: '#333', borderRadius: '2px', overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${homePercent}%`, background: '#22c55e' }} />
          <div style={{ width: `${awayPercent}%`, background: '#6B7280' }} />
        </div>
        <span style={{ color: '#fff', fontSize: '10px', minWidth: '20px' }}>{away}{unit}</span>
      </div>
    </div>
  );
}

function StatRow({ label, home, away, isYellow, isRed }: {
  label: string;
  home: number;
  away: number;
  isYellow?: boolean;
  isRed?: boolean;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '4px 0',
      borderBottom: '1px solid #222'
    }}>
      <span style={{ color: isYellow ? '#ffd700' : isRed ? '#ef4444' : '#fff', fontSize: '12px' }}>
        {isYellow && '🟨'} {isRed && '🟥'} {home}
      </span>
      <span style={{ color: '#888', fontSize: '11px' }}>{label}</span>
      <span style={{ color: isYellow ? '#ffd700' : isRed ? '#ef4444' : '#fff', fontSize: '12px' }}>
        {away} {isYellow && '🟨'} {isRed && '🟥'}
      </span>
    </div>
  );
}
