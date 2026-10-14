'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

interface CalibrationResult {
  match_id: string;
  calibration_timestamp: string;
  halftime_fair_odds: {
    home_win: number;
    draw: number;
    away_win: number;
    over_2_5: number;
    under_2_5: number;
    btts_yes: number;
    btts_no: number;
  };
  lambda_remaining: {
    lambda_home_2nd_half: number;
    lambda_away_2nd_half: number;
  };
  confidence_index: number;
  confidence_level: string;
  value_bets_detected: Array<{
    market: string;
    model_prob: number;
    implied_prob_bookmaker: number;
    fair_odds: number;
    bookmaker_odds: number;
    edge_pct: number;
    recommendation: string;
    reasoning: string;
  }>;
  calibration_components: {
    signal_quality_score: number;
    sample_size_score: number;
    game_state_stability: number;
    pre_model_agreement: number;
  };
}

export default function LiveCalibrationPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CalibrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);

  async function runBacktest(publish: boolean = false) {
    setLoading(true);
    setError(null);
    setPublished(false);
    try {
      const url = publish
        ? '/api/live-calibration/backtest?publish=true'
        : '/api/live-calibration/backtest';
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erreur inconnue' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResult(data.output);
      setPublished(publish && data.telegram_sent === true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ color: '#e5e5e5', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: '12px' }}>
        <h2 style={{
          fontSize: '16px', fontWeight: 'bold', color: '#f97316',
          marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          🎯 Réajustement Live — Mi-temps
        </h2>
        <p style={{ color: '#888', fontSize: '11px' }}>
          Recalibrage bayésien des prédictions à la mi-temps. Pipeline : filtrage xG →
          game state bias → Dixon-Coles update → fair odds → value bets.
        </p>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button
          onClick={() => runBacktest(false)}
          disabled={loading}
          style={{
            padding: '8px 14px',
            borderRadius: '6px',
            border: '1px solid #f9731640',
            background: loading ? '#333' : '#f9731615',
            color: '#f97316',
            cursor: loading ? 'wait' : 'pointer',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          {loading ? '⏳ Calcul...' : '🧪 Lancer Backtest (mock)'}
        </button>
        <button
          onClick={() => runBacktest(true)}
          disabled={loading}
          style={{
            padding: '8px 14px',
            borderRadius: '6px',
            border: '1px solid #22c55e40',
            background: loading ? '#333' : '#22c55e15',
            color: '#22c55e',
            cursor: loading ? 'wait' : 'pointer',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          📨 Backtest + Publish Telegram
        </button>
      </div>

      {error && (
        <div style={{
          padding: '10px', background: '#ef444415', border: '1px solid #ef444440',
          borderRadius: '6px', color: '#ef4444', fontSize: '12px', marginBottom: '12px',
        }}>
          ❌ {error}
        </div>
      )}

      {published && (
        <div style={{
          padding: '10px', background: '#22c55e15', border: '1px solid #22c55e40',
          borderRadius: '6px', color: '#22c55e', fontSize: '12px', marginBottom: '12px',
        }}>
          ✅ Message publié sur Telegram DM
        </div>
      )}

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Confidence index */}
          <div style={{
            background: '#1e293b', padding: '14px', borderRadius: '8px',
            marginBottom: '12px', border: '1px solid #333',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', color: '#aaa' }}>Indice de fiabilité</span>
              <span style={{
                fontSize: '20px', fontWeight: 'bold',
                color: result.confidence_index >= 85 ? '#22c55e' :
                       result.confidence_index >= 70 ? '#fbbf24' :
                       result.confidence_index >= 50 ? '#f97316' : '#ef4444',
              }}>
                {result.confidence_index}/100
              </span>
            </div>
            <div style={{
              height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden',
              marginBottom: '10px',
            }}>
              <div style={{
                width: `${result.confidence_index}%`,
                height: '100%',
                background: result.confidence_index >= 85 ? '#22c55e' :
                            result.confidence_index >= 70 ? '#fbbf24' :
                            result.confidence_index >= 50 ? '#f97316' : '#ef4444',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', fontSize: '10px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#888' }}>Sample</div>
                <div style={{ color: '#e5e5e5', fontWeight: 'bold' }}>{result.calibration_components.sample_size_score}/25</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#888' }}>Signal</div>
                <div style={{ color: '#e5e5e5', fontWeight: 'bold' }}>{result.calibration_components.signal_quality_score}/25</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#888' }}>Game state</div>
                <div style={{ color: '#e5e5e5', fontWeight: 'bold' }}>{result.calibration_components.game_state_stability}/25</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#888' }}>Pre-model</div>
                <div style={{ color: '#e5e5e5', fontWeight: 'bold' }}>{result.calibration_components.pre_model_agreement}/25</div>
              </div>
            </div>
          </div>

          {/* Lambda 2nd half */}
          <div style={{
            background: '#1e293b', padding: '14px', borderRadius: '8px',
            marginBottom: '12px', border: '1px solid #333',
          }}>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
              λ (espérance de buts, 2e mi-temps)
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1, textAlign: 'center', padding: '8px', background: '#f9731610', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: '#888' }}>Domicile</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f97316' }}>
                  {result.lambda_remaining.lambda_home_2nd_half.toFixed(2)}
                </div>
              </div>
              <div style={{ flex: 1, textAlign: 'center', padding: '8px', background: '#3b82f610', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: '#888' }}>Extérieur</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#3b82f6' }}>
                  {result.lambda_remaining.lambda_away_2nd_half.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Fair odds table */}
          <div style={{
            background: '#1e293b', padding: '14px', borderRadius: '8px',
            marginBottom: '12px', border: '1px solid #333',
          }}>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>
              📊 Fair odds (2e mi-temps)
            </div>
            <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['1️⃣ Victoire domicile', result.halftime_fair_odds.home_win],
                  ['❌ Match nul', result.halftime_fair_odds.draw],
                  ['2️⃣ Victoire extérieur', result.halftime_fair_odds.away_win],
                  ['📈 Over 2.5', result.halftime_fair_odds.over_2_5],
                  ['📉 Under 2.5', result.halftime_fair_odds.under_2_5],
                  ['🥅 BTTS Oui', result.halftime_fair_odds.btts_yes],
                  ['🚫 BTTS Non', result.halftime_fair_odds.btts_no],
                ].map(([label, odds]) => (
                  <tr key={label as string} style={{ borderBottom: '1px solid #333' }}>
                    <td style={{ padding: '6px 0', color: '#aaa' }}>{label}</td>
                    <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 'bold', color: '#e5e5e5' }}>
                      <code>{(odds as number).toFixed(2)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Value bets */}
          {result.value_bets_detected.length > 0 && (
            <div style={{
              background: '#1e293b', padding: '14px', borderRadius: '8px',
              border: '1px solid #f9731640',
            }}>
              <div style={{ fontSize: '12px', color: '#f97316', marginBottom: '10px', fontWeight: 'bold' }}>
                💎 Value bets détectés ({result.value_bets_detected.length})
              </div>
              {result.value_bets_detected.map((vb, i) => {
                const recColor = vb.recommendation === 'HIGH_CONFIDENCE' ? '#22c55e' :
                                 vb.recommendation === 'LOW_STAKE' ? '#fbbf24' : '#f97316';
                return (
                  <div key={i} style={{
                    padding: '10px', marginBottom: '8px', background: '#0f172a',
                    borderRadius: '6px', border: `1px solid ${recColor}40`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#e5e5e5' }}>
                        {vb.market.replace(/_/g, ' ').toUpperCase()}
                      </span>
                      <span style={{
                        fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                        background: `${recColor}20`, color: recColor, fontWeight: 'bold',
                      }}>
                        {vb.recommendation}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '11px' }}>
                      <div>
                        <div style={{ color: '#888' }}>Bookmaker</div>
                        <div style={{ color: '#e5e5e5', fontWeight: 'bold' }}>{vb.bookmaker_odds.toFixed(2)}</div>
                      </div>
                      <div>
                        <div style={{ color: '#888' }}>Fair odds</div>
                        <div style={{ color: '#f97316', fontWeight: 'bold' }}>{vb.fair_odds.toFixed(2)}</div>
                      </div>
                      <div>
                        <div style={{ color: '#888' }}>Edge</div>
                        <div style={{ color: '#22c55e', fontWeight: 'bold' }}>+{vb.edge_pct.toFixed(1)}%</div>
                      </div>
                    </div>
                    <div style={{ marginTop: '6px', fontSize: '10px', color: '#888', fontStyle: 'italic' }}>
                      💡 {vb.reasoning}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {result.value_bets_detected.length === 0 && (
            <div style={{
              padding: '12px', background: '#1e293b', borderRadius: '8px',
              border: '1px solid #333', fontSize: '12px', color: '#888', textAlign: 'center',
            }}>
              ℹ️ Aucun value bet détecté sur ce match.
            </div>
          )}
        </motion.div>
      )}

      {!result && !loading && !error && (
        <div style={{
          padding: '20px', background: '#1e293b', borderRadius: '8px',
          border: '1px solid #333', fontSize: '12px', color: '#888', textAlign: 'center',
        }}>
          Clique sur « Lancer Backtest » pour voir le pipeline en action sur un match mock
          (Liverpool vs Arsenal, 1-0 à la MT, xG 1.93 vs 0.42).
        </div>
      )}
    </div>
  );
}
