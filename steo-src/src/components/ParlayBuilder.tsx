'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Minus, Trash2, CheckCircle, Copy } from 'lucide-react';

// Types
interface ParlaySelection {
  id: string;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  date: string;
  betType: 'home' | 'draw' | 'away' | 'over' | 'under' | 'btts_yes' | 'btts_no';
  odds: number;
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  riskPercentage: number;
  prediction: string;
}

interface ParlayBuilderProps {
  matches?: any[];
}

// Bet type labels
const BET_TYPE_LABELS: Record<string, { label: string; icon: string; short: string }> = {
  home: { label: 'Victoire Domicile', icon: '1', short: '1' },
  draw: { label: 'Match Nul', icon: 'X', short: 'X' },
  away: { label: 'Victoire Extérieur', icon: '2', short: '2' },
  over: { label: 'Over 2.5 buts', icon: '+', short: 'O2.5' },
  under: { label: 'Under 2.5 buts', icon: '-', short: 'U2.5' },
  btts_yes: { label: 'Les deux marquent', icon: 'GG', short: 'BTTS' },
  btts_no: { label: 'Pas les deux', icon: 'NG', short: 'NoBTTS' },
};

// Sport icons and colors
const SPORT_CONFIG: Record<string, { icon: string; color: string }> = {
  Foot: { icon: '⚽', color: '#22c55e' },
  Football: { icon: '⚽', color: '#22c55e' },
  Basket: { icon: '🏀', color: '#f97316' },
  Basketball: { icon: '🏀', color: '#f97316' },
  NHL: { icon: '🏒', color: '#06b6d4' },
  NFL: { icon: '🏈', color: '#3b82f6' },
  Tennis: { icon: '🎾', color: '#a855f7' },
};

export function ParlayBuilder({ matches: propMatches }: ParlayBuilderProps) {
  const [matches, setMatches] = useState<any[]>([]);
  const [selections, setSelections] = useState<ParlaySelection[]>([]);
  const [stake, setStake] = useState<number>(10);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Fetch matches
  const fetchMatches = useCallback(async () => {
    try {
      const response = await fetch('/api/matches?status=upcoming');
      const data = await response.json();
      setMatches(data.matches || data || []);
    } catch (error) {
      console.error('Error fetching matches:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (propMatches && propMatches.length > 0) {
      setMatches(propMatches);
      setLoading(false);
    } else {
      fetchMatches();
    }
  }, [propMatches, fetchMatches]);

  // Add selection to parlay
  const addSelection = (match: any, betType: ParlaySelection['betType'], odds: number) => {
    const existingIndex = selections.findIndex(
      (s) => s.matchId === match.id && s.betType === betType
    );
    
    if (existingIndex >= 0) {
      setSelections(selections.filter((_, i) => i !== existingIndex));
      return;
    }

    const filtered = selections.filter((s) => s.matchId !== match.id);

    const newSelection: ParlaySelection = {
      id: `sel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      sport: match.sport,
      league: match.league,
      date: match.date,
      betType,
      odds,
      confidence: match.insight?.confidence || 'medium',
      riskPercentage: match.insight?.riskPercentage || 50,
      prediction: `${match.homeTeam} vs ${match.awayTeam} - ${BET_TYPE_LABELS[betType].label}`,
    };

    setSelections([...filtered, newSelection]);
  };

  const removeSelection = (id: string) => {
    setSelections(selections.filter((s) => s.id !== id));
  };

  const clearSelections = () => {
    setSelections([]);
  };

  // Calculate combined odds
  const combinedOdds = useMemo(() => {
    if (selections.length === 0) return 1;
    return selections.reduce((acc, sel) => acc * sel.odds, 1);
  }, [selections]);

  // Calculate potential winnings
  const potentialWinnings = useMemo(() => {
    return stake * combinedOdds;
  }, [stake, combinedOdds]);

  // Calculate risk assessment
  const riskAssessment = useMemo(() => {
    if (selections.length === 0) return { level: 'none', score: 0, warnings: [] };

    const avgRisk = selections.reduce((acc, s) => acc + s.riskPercentage, 0) / selections.length;
    const lowConfidenceCount = selections.filter((s) => s.confidence === 'low').length;
    const warnings: string[] = [];

    if (selections.length > 4) warnings.push('Plus de 4 sélections = risque élevé');
    if (lowConfidenceCount > 0) warnings.push(`${lowConfidenceCount} sélection(s) faible confiance`);
    if (combinedOdds > 10) warnings.push('Cote combinée très élevée');

    let level: 'low' | 'medium' | 'high' | 'very_high' = 'low';
    if (avgRisk > 55 || selections.length > 4) level = 'very_high';
    else if (avgRisk > 45 || selections.length > 3) level = 'high';
    else if (avgRisk > 35 || selections.length > 2) level = 'medium';

    return { level, score: Math.round(avgRisk), warnings };
  }, [selections, combinedOdds]);

  // Kelly Criterion recommendation
  const kellyRecommendation = useMemo(() => {
    if (selections.length === 0 || combinedOdds <= 1) return { stake: 0, percentage: 0 };

    const avgWinProb = selections.reduce((acc, s) => {
      const prob = s.confidence === 'very_high' ? 0.65 :
                   s.confidence === 'high' ? 0.55 :
                   s.confidence === 'medium' ? 0.45 : 0.35;
      return acc + prob;
    }, 0) / selections.length;

    const b = combinedOdds - 1;
    const kellyFraction = (b * avgWinProb - (1 - avgWinProb)) / b;
    const safeKelly = Math.max(0, Math.min(kellyFraction, 0.10));
    
    return {
      stake: Math.round(safeKelly * 1000) / 10,
      percentage: safeKelly * 100,
    };
  }, [selections, combinedOdds]);

  // Copy parlay to clipboard
  const copyParlay = () => {
    const text = selections.map((s, i) => 
      `${i + 1}. ${s.homeTeam} vs ${s.awayTeam} → ${BET_TYPE_LABELS[s.betType].short} @ ${s.odds.toFixed(2)}`
    ).join('\n');
    
    const fullText = `🎰 COMBINÉ STEO ÉLITE\n${text}\n📊 Cote: ${combinedOdds.toFixed(2)}\n💰 Gains: ${potentialWinnings.toFixed(2)}€`;
    
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Get available matches
  const availableMatches = useMemo(() => {
    return matches.filter((m) => {
      if (m.isFinished === true) return false;
      return m.insight && m.oddsHome > 0;
    }).slice(0, 15);
  }, [matches]);

  // Risk level config
  const riskConfig = {
    low: { label: 'Faible', color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.15)', icon: '✅' },
    medium: { label: 'Modéré', color: '#eab308', bgColor: 'rgba(234, 179, 8, 0.15)', icon: '⚠️' },
    high: { label: 'Élevé', color: '#f97316', bgColor: 'rgba(249, 115, 22, 0.15)', icon: '🔶' },
    very_high: { label: 'Très élevé', color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.15)', icon: '🔴' },
    none: { label: '-', color: '#666', bgColor: 'rgba(102, 102, 102, 0.1)', icon: '-' },
  };

  const currentRisk = riskConfig[riskAssessment.level];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      
      {/* INFO COMPACTE */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        padding: '8px 10px', 
        background: 'rgba(168, 85, 247, 0.1)', 
        borderRadius: '8px',
        border: '1px solid rgba(168, 85, 247, 0.2)'
      }}>
        <span style={{ fontSize: '14px' }}>💡</span>
        <span style={{ fontSize: '11px', color: '#ccc' }}>
          Sélectionnez 2-3 matchs maximum. <strong style={{ color: '#a855f7' }}>Les cotes se multiplient</strong> pour des gains plus élevés.
        </span>
      </div>

      {/* MAIN CONTENT - 2 colonnes sur desktop */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        
        {/* LEFT: Match Selection */}
        <div style={{
          background: '#1a1a1a',
          borderRadius: '10px',
          border: '1px solid #333',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '8px 10px',
            borderBottom: '1px solid #333',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus style={{ width: '14px', height: '14px', color: '#22c55e' }} />
              <span style={{ fontWeight: 'bold', color: '#fff', fontSize: '12px' }}>Matchs</span>
            </div>
            <span style={{ fontSize: '10px', color: '#666' }}>{availableMatches.length}</span>
          </div>

          <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '11px' }}>
                ⏳ Chargement...
              </div>
            ) : availableMatches.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '11px' }}>
                📭 Aucun match
              </div>
            ) : (
              <div>
                {availableMatches.map((match) => {
                  const isSelected = selections.some((s) => s.matchId === match.id);
                  const selectedBet = selections.find((s) => s.matchId === match.id);
                  const sportConfig = SPORT_CONFIG[match.sport] || { icon: '🏟️', color: '#888' };
                  
                  return (
                    <div
                      key={match.id}
                      style={{
                        padding: '8px 10px',
                        borderBottom: '1px solid #222',
                        background: isSelected ? 'rgba(168, 85, 247, 0.1)' : 'transparent',
                      }}
                    >
                      {/* Match info */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: '14px' }}>{sportConfig.icon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '11px', fontWeight: '600', color: '#fff', lineHeight: '1.2' }}>
                              {match.homeTeam}
                            </div>
                            <div style={{ fontSize: '10px', color: '#888', lineHeight: '1.2' }}>
                              vs {match.awayTeam}
                            </div>
                          </div>
                          {match.isLive && (
                            <span style={{
                              background: '#ef4444',
                              color: '#fff',
                              fontSize: '8px',
                              fontWeight: 'bold',
                              padding: '2px 4px',
                              borderRadius: '3px',
                            }}>LIVE</span>
                          )}
                        </div>
                        <span style={{ 
                          fontSize: '8px', 
                          color: sportConfig.color,
                          background: `${sportConfig.color}20`,
                          padding: '2px 4px',
                          borderRadius: '3px',
                        }}>
                          {match.league}
                        </span>
                      </div>
                      
                      {/* Bet options */}
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          onClick={() => addSelection(match, 'home', match.oddsHome)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            border: selectedBet?.betType === 'home' ? '2px solid #a855f7' : '1px solid #333',
                            background: selectedBet?.betType === 'home' ? '#a855f7' : 'transparent',
                            color: selectedBet?.betType === 'home' ? '#fff' : '#aaa',
                          }}
                        >
                          1 {match.oddsHome.toFixed(2)}
                        </button>
                        
                        {match.oddsDraw && (
                          <button
                            onClick={() => addSelection(match, 'draw', match.oddsDraw)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              border: selectedBet?.betType === 'draw' ? '2px solid #eab308' : '1px solid #333',
                              background: selectedBet?.betType === 'draw' ? '#eab308' : 'transparent',
                              color: selectedBet?.betType === 'draw' ? '#000' : '#aaa',
                            }}
                          >
                            X {match.oddsDraw.toFixed(2)}
                          </button>
                        )}
                        
                        <button
                          onClick={() => addSelection(match, 'away', match.oddsAway)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            border: selectedBet?.betType === 'away' ? '2px solid #3b82f6' : '1px solid #333',
                            background: selectedBet?.betType === 'away' ? '#3b82f6' : 'transparent',
                            color: selectedBet?.betType === 'away' ? '#fff' : '#aaa',
                          }}
                        >
                          2 {match.oddsAway.toFixed(2)}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Parlay Summary */}
        <div style={{
          background: '#1a1a1a',
          borderRadius: '10px',
          border: '1px solid #333',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '8px 10px',
            borderBottom: '1px solid #333',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '14px' }}>🎯</span>
              <span style={{ fontWeight: 'bold', color: '#fff', fontSize: '12px' }}>Votre combiné</span>
            </div>
            {selections.length > 0 && (
              <button
                onClick={clearSelections}
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  color: '#ef4444',
                  fontSize: '9px',
                  cursor: 'pointer',
                }}
              >
                Effacer
              </button>
            )}
          </div>

          <div style={{ padding: '10px' }}>
            {selections.length === 0 ? (
              <div style={{
                height: '200px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px dashed #333',
                borderRadius: '8px',
              }}>
                <div style={{ fontSize: '32px', marginBottom: '8px', opacity: 0.3 }}>🎰</div>
                <div style={{ color: '#666', fontSize: '11px' }}>Cliquez sur les cotes</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                
                {/* Selections list */}
                <div style={{
                  background: '#0a0a0a',
                  borderRadius: '6px',
                  padding: '8px',
                  maxHeight: '120px',
                  overflowY: 'auto',
                }}>
                  {selections.map((sel, index) => {
                    const sportConfig = SPORT_CONFIG[sel.sport] || { icon: '🏟️' };
                    const betLabel = BET_TYPE_LABELS[sel.betType];
                    
                    return (
                      <div
                        key={sel.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 0',
                          borderBottom: index < selections.length - 1 ? '1px solid #1a1a1a' : 'none',
                        }}
                      >
                        <span style={{ 
                          width: '16px', height: '16px', borderRadius: '50%', 
                          background: '#a855f7', color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '9px', fontWeight: 'bold', flexShrink: 0,
                        }}>{index + 1}</span>
                        <span style={{ fontSize: '12px' }}>{sportConfig.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '10px', color: '#fff', lineHeight: '1.2' }}>
                            <strong>{sel.homeTeam}</strong> <span style={{ color: '#888' }}>vs</span> <strong>{sel.awayTeam}</strong>
                          </div>
                        </div>
                        <div style={{
                          background: '#222',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          color: '#a855f7',
                          flexShrink: 0,
                        }}>
                          {betLabel.short} @{sel.odds.toFixed(2)}
                        </div>
                        <button
                          onClick={() => removeSelection(sel.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            padding: '2px',
                          }}
                        >
                          <Minus style={{ width: '12px', height: '12px' }} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Risk + Odds */}
                <div style={{ 
                  display: 'flex', 
                  gap: '8px',
                  background: currentRisk.bgColor,
                  borderRadius: '6px',
                  padding: '8px',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px' }}>{currentRisk.icon}</span>
                      <span style={{ fontSize: '10px', fontWeight: 'bold', color: currentRisk.color }}>
                        Risque {currentRisk.label}
                      </span>
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#a855f7' }}>
                      {combinedOdds.toFixed(2)}
                    </div>
                    <div style={{ fontSize: '8px', color: '#666' }}>
                      {selections.map(s => s.odds.toFixed(2)).join(' × ')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '9px', color: '#888' }}>Mise (€)</div>
                    <input
                      type="number"
                      value={stake}
                      onChange={(e) => setStake(Number(e.target.value) || 0)}
                      style={{
                        width: '60px',
                        background: 'transparent',
                        border: 'none',
                        fontSize: '18px',
                        fontWeight: 'bold',
                        color: '#fff',
                        textAlign: 'right',
                        outline: 'none',
                      }}
                      min={1}
                      max={1000}
                    />
                  </div>
                </div>

                {/* Gains */}
                <div style={{
                  background: 'rgba(34, 197, 94, 0.15)',
                  borderRadius: '6px',
                  padding: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: '9px', color: '#888' }}>💰 Gains potentiels</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#22c55e' }}>
                      {potentialWinnings.toFixed(2)} €
                    </div>
                    <div style={{ fontSize: '10px', color: '#22c55e' }}>
                      +{(potentialWinnings - stake).toFixed(2)} € profit
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '8px', color: '#888' }}>Kelly: {kellyRecommendation.stake}%</div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={copyParlay}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid #333',
                      background: '#0a0a0a',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    {copied ? <CheckCircle style={{ width: '14px', height: '14px', color: '#22c55e' }} /> : <Copy style={{ width: '14px', height: '14px' }} />}
                    {copied ? 'Copié!' : 'Copier'}
                  </button>
                  <button
                    onClick={() => setShowConfirmDialog(true)}
                    disabled={selections.length < 2}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '6px',
                      border: 'none',
                      background: selections.length < 2 ? '#333' : '#a855f7',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: selections.length < 2 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <CheckCircle style={{ width: '14px', height: '14px' }} />
                    Valider
                  </button>
                </div>

                {selections.length === 1 && (
                  <div style={{ textAlign: 'center', fontSize: '10px', color: '#eab308' }}>
                    💡 Ajoutez au moins 2 sélections
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent style={{ background: '#1a1a1a', border: '1px solid #333' }}>
          <DialogHeader>
            <DialogTitle style={{ color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              <CheckCircle style={{ width: '16px', height: '16px', color: '#22c55e' }} />
              Confirmer le combiné
            </DialogTitle>
          </DialogHeader>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {selections.map((sel, i) => {
                const sportConfig = SPORT_CONFIG[sel.sport] || { icon: '🏟️' };
                return (
                  <div key={sel.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ color: '#fff' }}>
                      {i + 1}. {sportConfig.icon} {sel.homeTeam} vs {sel.awayTeam}
                    </span>
                    <span style={{ background: '#333', padding: '2px 6px', borderRadius: '4px', color: '#a855f7', fontSize: '10px' }}>
                      {BET_TYPE_LABELS[sel.betType].short} @ {sel.odds.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ background: '#0a0a0a', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ color: '#888' }}>Cote combinée:</span>
                <span style={{ fontWeight: 'bold', color: '#a855f7' }}>{combinedOdds.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ color: '#888' }}>Mise:</span>
                <span style={{ fontWeight: 'bold', color: '#fff' }}>{stake.toFixed(2)} €</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ color: '#888' }}>Gains potentiels:</span>
                <span style={{ fontWeight: 'bold', color: '#22c55e' }}>{potentialWinnings.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          <DialogFooter style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setShowConfirmDialog(false)}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #333',
                background: 'transparent',
                color: '#888',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Annuler
            </button>
            <button
              onClick={() => {
                setShowConfirmDialog(false);
                copyParlay();
              }}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '6px',
                border: 'none',
                background: '#22c55e',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <CheckCircle style={{ width: '14px', height: '14px' }} />
              Confirmer & Copier
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ParlayBuilder;
