'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Challenge {
  id: string;
  sport: 'football' | 'basketball' | 'hockey' | 'tennis';
  league: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  displayDate?: string;
  oddsHome: number;
  oddsAway: number;
  oddsDraw: number | null;
  bookmaker: string;
  hasRealOdds: boolean;
  recommendation: 'home' | 'away' | 'draw' | 'avoid';
  recommendedTeam: string;
  winProbability: number;
  edge: number;
  isValueBet: boolean;
  valueBetType: 'home' | 'away' | 'draw' | null;
  expectedValue: number;
  kellyStake: number;
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  riskLevel: 'low' | 'medium' | 'high';
  riskPercentage: number;
  valueScore: number;
  reasoning: string[];
  factors: {
    formAdvantage: 'home' | 'away' | 'neutral';
    oddsValue: 'high' | 'medium' | 'low';
    dataQuality: number;
  };
  status: 'take' | 'consider' | 'rejected';
}

interface ChallengesData {
  success: boolean;
  lastUpdated: string;
  summary: {
    totalScanned: number;
    valueBetsFound: number;
    highConfidenceCount: number;
    averageEdge: number;
    realOddsCount: number;
  };
  challenges: Challenge[];
}

export default function ChallengesPage() {
  const [data, setData] = useState<ChallengesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    minOdds: '2.0',
    minEdge: '5',
    confidence: 'all',
  });
  const [publishing, setPublishing] = useState(false);

  const fetchChallenges = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams(filters);
      const response = await fetch(`/api/challenges?${params}`);
      const result = await response.json();
      
      if (result.success) {
        setData(result);
      } else {
        setError(result.error || 'Erreur lors du chargement');
      }
    } catch (err) {
      setError('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChallenges();
  }, []);

  const publishToTelegram = async () => {
    setPublishing(true);
    try {
      const top = (data?.challenges || []).slice(0, 5);
      const response = await fetch('/api/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish', challenges: top }),
      });
      const result = await response.json();
      
      if (result.success) {
        alert(`✅ ${result.challengesCount} challenges publiés sur Telegram !`);
      } else {
        alert('❌ Erreur: ' + (result.error || result.message));
      }
    } catch (err) {
      alert('Erreur lors de la publication');
    } finally {
      setPublishing(false);
    }
  };

  const getConfidenceColor = (level: string) => {
    switch (level) {
      case 'very_high': return 'text-green-400 bg-green-400/10 border-green-400/30';
      case 'high': return 'text-green-400 bg-green-400/10 border-green-400/30';
      case 'medium': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30';
      case 'low': return 'text-orange-400 bg-orange-400/10 border-orange-400/30';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  const getRiskIcon = (risk: string) => {
    switch (risk) {
      case 'low': return '✅';
      case 'medium': return '⚠️';
      case 'high': return '🎲';
      default: return '❓';
    }
  };

  const getValueScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-400';
    if (score >= 50) return 'text-yellow-400';
    return 'text-orange-400';
  };

  const getPickOdds = (c: Challenge): number =>
    c.recommendation === 'home' ? c.oddsHome
      : c.recommendation === 'away' ? c.oddsAway
        : (c.oddsDraw || 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/" className="text-gray-400 hover:text-white transition">
              ← Retour
            </Link>
          </div>
          <h1 className="text-3xl font-bold mb-2">
            🔥 Challenges Négligés
          </h1>
          <p className="text-gray-400">
            Matchs à forte cote susceptibles de rentrer - Value bets détectés par notre analyse
          </p>
        </div>

        {/* Filtres */}
        <div className="bg-gray-800/50 rounded-xl p-4 mb-6 border border-gray-700">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Cote minimum</label>
              <input
                type="number"
                step="0.5"
                value={filters.minOdds}
                onChange={(e) => setFilters({ ...filters, minOdds: e.target.value })}
                className="bg-gray-700 rounded px-3 py-2 w-24 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Edge min (%)</label>
              <input
                type="number"
                value={filters.minEdge}
                onChange={(e) => setFilters({ ...filters, minEdge: e.target.value })}
                className="bg-gray-700 rounded px-3 py-2 w-24 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Confiance</label>
              <select
                value={filters.confidence}
                onChange={(e) => setFilters({ ...filters, confidence: e.target.value })}
                className="bg-gray-700 rounded px-3 py-2 text-white"
              >
                <option value="all">Toutes</option>
                <option value="high">Haute 🔥</option>
                <option value="medium">Moyenne ⚡</option>
                <option value="low">Basse 💡</option>
              </select>
            </div>
            <button
              onClick={fetchChallenges}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded transition"
            >
              🔄 Actualiser
            </button>
            <button
              onClick={publishToTelegram}
              disabled={publishing}
              className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded transition disabled:opacity-50"
            >
              {publishing ? '📤 Envoi...' : '📤 Publier sur Telegram'}
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin text-4xl mb-4">🎰</div>
            <p className="text-gray-400">Analyse des matchs en cours...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4 text-red-400">
            ❌ {error}
          </div>
        )}

        {/* Data */}
        {data && !loading && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                <div className="text-2xl font-bold text-blue-400">{data.summary.totalScanned}</div>
                <div className="text-sm text-gray-400">Matchs analysés</div>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                <div className="text-2xl font-bold text-green-400">{data.summary.valueBetsFound}</div>
                <div className="text-sm text-gray-400">Challenges détectés</div>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                <div className="text-2xl font-bold text-yellow-400">{data.summary.highConfidenceCount}</div>
                <div className="text-sm text-gray-400">Haute confiance</div>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                <div className="text-2xl font-bold text-purple-400">+{data.summary.averageEdge}%</div>
                <div className="text-sm text-gray-400">Edge moyen</div>
              </div>
            </div>

            {/* Best Value — premier challenge (trié par valueScore côté API) */}
            {data.challenges.length > 0 && (() => {
              const best = data.challenges[0];
              const bestOdds = getPickOdds(best);
              return (
                <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-xl p-4 mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">👑</span>
                    <span className="font-bold text-green-400">MEILLEUR VALUE BET</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="text-xl font-bold">{best.recommendedTeam}</div>
                    <div className="text-2xl font-bold text-green-400">@{bestOdds.toFixed(2)}</div>
                    <div className="bg-green-500/20 px-3 py-1 rounded-full text-green-400">
                      +{(best.edge || 0).toFixed(1)}% edge
                    </div>
                    <div className={getValueScoreColor(best.valueScore)}>
                      Score: {best.valueScore}/100
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Challenges List */}
            {data.challenges.length === 0 ? (
              <div className="bg-gray-800/30 rounded-xl p-8 text-center">
                <div className="text-4xl mb-4">🔍</div>
                <p className="text-gray-400">Aucun challenge détecté avec ces critères</p>
                <p className="text-sm text-gray-500 mt-2">Essayez de baisser les filtres</p>
              </div>
            ) : (
              <div className="space-y-4">
                {data.challenges.map((challenge, index) => (
                  <div
                    key={challenge.id}
                    className="bg-gray-800/50 rounded-xl p-4 border border-gray-700 hover:border-gray-600 transition"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                      {/* Match info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-lg font-bold">{challenge.recommendedTeam}</span>
                          <span className="text-2xl font-bold text-green-400">
                            @{getPickOdds(challenge).toFixed(2)}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs border ${getConfidenceColor(challenge.confidence)}`}>
                            {challenge.confidence.toUpperCase()}
                          </span>
                          {challenge.status === 'take' && (
                            <span className="px-2 py-0.5 rounded text-xs border bg-green-500/20 text-green-400 border-green-500/30">
                              À PRENDRE
                            </span>
                          )}
                        </div>
                        <div className="text-gray-400 text-sm">
                          vs {challenge.recommendation === 'home' ? challenge.awayTeam : challenge.homeTeam} • {challenge.league}
                        </div>
                      </div>

                      {/* Value Score */}
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${getValueScoreColor(challenge.valueScore)}`}>
                          {challenge.valueScore}
                        </div>
                        <div className="text-xs text-gray-400">Value Score</div>
                      </div>
                    </div>

                    {/* Edge Bar */}
                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-400">Probabilité</span>
                        <span className="text-green-400">+{(challenge.edge || 0).toFixed(1)}% edge</span>
                      </div>
                      <div className="h-4 bg-gray-700 rounded-full overflow-hidden flex">
                        <div
                          className="bg-gray-500"
                          style={{ width: `${Math.min(100, Math.max(0, challenge.winProbability - (challenge.edge || 0)))}%` }}
                        />
                        <div
                          className="bg-green-500"
                          style={{ width: `${Math.min(100, Math.max(0, challenge.edge || 0))}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>Bookmaker: {Math.max(0, Math.round(challenge.winProbability - (challenge.edge || 0)))}%</span>
                        <span>Notre analyse: {Math.round(challenge.winProbability)}%</span>
                      </div>
                    </div>

                    {/* Reasoning */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {challenge.reasoning.slice(0, 3).map((reason, i) => (
                        <span key={i} className="bg-gray-700/50 px-2 py-1 rounded text-xs text-gray-300">
                          {reason}
                        </span>
                      ))}
                    </div>

                    {/* Key Insight + métriques */}
                    <div className="bg-gray-900/50 rounded p-3 text-sm flex flex-wrap gap-x-4 gap-y-1">
                      {challenge.reasoning[0] && (
                        <span className="text-gray-300">💡 {challenge.reasoning[0]}</span>
                      )}
                      <span className="text-gray-400">
                        EV: {challenge.expectedValue > 0 ? '+' : ''}{(challenge.expectedValue || 0).toFixed(1)}%
                      </span>
                      <span className="text-gray-400">
                        Kelly: {((challenge.kellyStake || 0) * 100).toFixed(1)}% bankroll
                      </span>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-700">
                      <div className="flex gap-4 text-sm flex-wrap">
                        <span className="text-gray-400">
                          {getRiskIcon(challenge.riskLevel)} Risque: {challenge.riskPercentage}%
                        </span>
                        <span className="text-gray-400">
                          🏟️ {challenge.sport}{!challenge.hasRealOdds && ' • ⚠️ cotes estimées'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {challenge.bookmaker || 'Pipeline ESPN'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Info */}
        <div className="mt-8 bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4">
          <h3 className="font-bold text-yellow-400 mb-2">ℹ️ Comment ça marche ?</h3>
          <ul className="text-sm text-gray-300 space-y-1">
            <li>• <strong>Value Gap</strong>: Écart entre notre analyse et les cotes des bookmakers</li>
            <li>• <strong>Value Score</strong>: Score composite (écart + facteurs + attractivité de la cote)</li>
            <li>• <strong>Confiance</strong>: Basée sur le nombre de facteurs favorables</li>
            <li>• Un challenge "High" avec edge &gt;15% et plusieurs facteurs = excellente opportunité</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
