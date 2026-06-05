'use client';

import { useState, useEffect } from 'react';
import { Match } from '../page';

// Types
interface ExpertAdvice {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  matchDate?: string;
  // Contexte unifié (NOUVEAU)
  unifiedContext?: {
    sourcesUsed: string[];
    dataQuality: number;
    overallAdvantage: 'home' | 'away' | 'neutral';
    keyFactors: string[];
  };
  // Météo (NOUVEAU)
  weather?: {
    temperature: number;
    condition: string;
    windSpeed: number;
    impact: 'ideal' | 'minor' | 'moderate' | 'significant' | 'extreme';
    factors: string[];
  };
  // ML Adaptatif (NOUVEAU)
  mlInfo?: {
    edgeThreshold: number;
    modelAccuracy: number;
    adaptiveWeights: { form: number; xg: number; injuries: number };
  };
  context?: {
    recentNews: string[];
    injuries: { home: string[]; away: string[] };
    form: { home: string; away: string };
  };
  oddsAnalysis: {
    favorite: string;
    favoriteOdds: number;
    edge: number;
    publicPercentage: number;
    isPublicFade: boolean;
  };
  recommendation: {
    bet: 'home' | 'draw' | 'away' | 'avoid';
    confidence: 'very_high' | 'high' | 'medium' | 'low';
    reasoning: string[];
    kellyStake: number;
    maxStake: number;
    expectedValue: number;
  };
  warnings: string[];
  dataQuality: 'high' | 'medium' | 'low';
}

interface ExpertResponse {
  advices: ExpertAdvice[];
  generatedAt: string;
  phase?: string;
  nextReset?: string;
  totalMatches: number;
  analyzedMatches?: number;
  successCount?: number;
  message?: string;
  stats?: {
    football: number;
    basketball: number;
    hockey?: number;
    finished: number;
  };
  error?: string;
  dataAge?: 'fresh' | 'stale';
}

// Générer un résumé expert pour chaque conseil
function generateExpertSummary(advice: ExpertAdvice): { title: string; analysis: string; verdict: string } {
  const { homeTeam, awayTeam, sport, league, oddsAnalysis, recommendation, unifiedContext, weather, context } = advice;
  
  // Déterminer l'équipe recommandée
  const recommendedTeam = recommendation.bet === 'home' ? homeTeam : 
                          recommendation.bet === 'away' ? awayTeam : 
                          recommendation.bet === 'draw' ? 'Match nul' : null;
  
  // Niveau de confiance textuel
  const confidenceText = {
    very_high: 'Très haute confiance',
    high: 'Haute confiance', 
    medium: 'Confiance modérée',
    low: 'Confiance faible'
  }[recommendation.confidence];
  
  // Construire l'analyse
  let analysis = '';
  
  // 1. Contexte du match
  analysis += `📊 **Contexte**: Rencontre de ${league} opposant ${homeTeam} à ${awayTeam}. `;
  
  // 2. Analyse des cotes
  analysis += `Les cotes indiquent ${oddsAnalysis.favorite} comme favori @${oddsAnalysis.favoriteOdds.toFixed(2)}. `;
  
  // 3. Edge détecté
  if (oddsAnalysis.edge > 5) {
    analysis += `⚡ **Edge significatif de +${oddsAnalysis.edge}%** détecté - opportunité de value bet. `;
  } else if (oddsAnalysis.edge > 0) {
    analysis += `Edge positif de +${oddsAnalysis.edge}% - légère valeur. `;
  } else {
    analysis += `Pas d'edge détecté sur ce match. `;
  }
  
  // 4. Facteurs clés
  if (unifiedContext?.keyFactors && unifiedContext.keyFactors.length > 0) {
    analysis += `\n\n🔑 **Facteurs déterminants**: ${unifiedContext.keyFactors.slice(0, 3).join(', ')}. `;
  }
  
  // 5. Forme des équipes
  if (context?.form) {
    analysis += `\n\n📈 **Forme récente**: ${homeTeam} (${context.form.home}) vs ${awayTeam} (${context.form.away}). `;
  }
  
  // 6. Impact météo (football)
  if (weather && weather.impact !== 'ideal') {
    analysis += `\n\n🌤️ **Météo**: ${weather.condition}, ${weather.temperature}°C. Impact: ${weather.impact}. `;
  }
  
  // 7. Blessures
  const totalInjuries = (context?.injuries?.home?.length || 0) + (context?.injuries?.away?.length || 0);
  if (totalInjuries > 0) {
    analysis += `\n\n🏥 **Blessures**: ${totalInjuries} joueur(s) indisponible(s) au total. `;
  }
  
  // Verdict final
  let verdict = '';
  if (recommendation.bet === 'avoid') {
    verdict = `🚫 **ÉVITER** - Les données ne présentent pas d'opportunité claire. Attendez des conditions plus favorables.`;
  } else if (recommendation.confidence === 'very_high' || recommendation.confidence === 'high') {
    verdict = `✅ **CONSEIL FORT**: Parier sur **${recommendedTeam}** avec ${confidenceText.toLowerCase()}. Mise recommandée: ${recommendation.kellyStake}% de votre bankroll.`;
  } else if (recommendation.confidence === 'medium') {
    verdict = `⚡ **CONSEIL MODÉRÉ**: ${recommendedTeam} présente un intérêt. Mise prudente de ${recommendation.kellyStake}% maximum.`;
  } else {
    verdict = `⚠️ **CONSEIL PRUDENT**: Signaux mitigés sur ${recommendedTeam}. Mise minimale ou passage recommandé.`;
  }
  
  // Titre accrocheur
  const title = recommendation.bet === 'avoid' 
    ? `🚫 ${homeTeam} vs ${awayTeam} - À éviter`
    : recommendation.confidence === 'very_high' || recommendation.confidence === 'high'
    ? `⭐ ${recommendedTeam} - ${confidenceText}`
    : `📊 ${recommendedTeam} - ${confidenceText}`;
  
  return { title, analysis, verdict };
}

export function ExpertAdviceSection({ matches }: { matches: Match[] }) {
  const [expertAdvices, setExpertAdvices] = useState<ExpertAdvice[]>([]);
  const [loadingAdvices, setLoadingAdvices] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<ExpertAdvice | null>(null);
  const [activeSport, setActiveSport] = useState<'all' | 'Football' | 'Basket' | 'Hockey'>('all');
  const [error, setError] = useState<string | null>(null);
  const [phaseInfo, setPhaseInfo] = useState<{ phase: string; nextReset: string } | null>(null);
  const [stats, setStats] = useState<{ football: number; basketball: number; hockey: number; finished: number } | null>(null);
  const [dataAge, setDataAge] = useState<'fresh' | 'stale' | null>(null);

  // Charger les conseils experts
  useEffect(() => {
    const fetchAdvices = async () => {
      setLoadingAdvices(true);
      setError(null);
      try {
        const response = await fetch('/api/expert-advice');
        const data: ExpertResponse = await response.json();
        
        if (response.ok) {
          setExpertAdvices(data.advices || []);
          
          // Stocker l'âge des données
          if (data.dataAge) {
            setDataAge(data.dataAge);
          }
          
          if (data.phase) {
            setPhaseInfo({ phase: data.phase, nextReset: data.nextReset || '' });
          }
          
          if (data.stats) {
            setStats({
              football: data.stats.football || 0,
              basketball: data.stats.basketball || 0,
              hockey: data.stats.hockey || 0,
              finished: data.stats.finished || 0
            });
          }
          
          if ((!data.advices || data.advices.length === 0)) {
            if (data.error) {
              setError(data.error);
            } else if (data.message) {
              setError(data.message);
            }
          }
        } else {
          setError(data.message || data.error || 'Erreur serveur');
        }
      } catch (error) {
        console.error('Erreur chargement conseils expert:', error);
        setError('Impossible de contacter le serveur');
      } finally {
        setLoadingAdvices(false);
      }
    };

    fetchAdvices();
  }, [matches.length]);

  // Grouper par sport
  const groupedAdvices = {
    Football: expertAdvices.filter(a => a.sport === 'Football' || a.sport === 'Foot'),
    Basket: expertAdvices.filter(a => a.sport === 'Basket' || a.sport === 'Basketball'),
    Hockey: expertAdvices.filter(a => a.sport === 'Hockey')
  };

  // Filtrer les conseils affichés
  const displayedAdvices = activeSport === 'all' 
    ? expertAdvices 
    : groupedAdvices[activeSport as keyof typeof groupedAdvices] || [];

  // Compter par sport
  const counts = {
    all: expertAdvices.length,
    Football: groupedAdvices.Football.length,
    Basket: groupedAdvices.Basket.length,
    Hockey: groupedAdvices.Hockey.length
  };

  return (
    <div style={{ marginBottom: '12px' }}>
      {/* Header */}
      <div style={{ marginBottom: '12px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#14b8a6', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          🎯 Conseiller Machine Learning : Expert par apprentissage (Long terme)
        </h2>
        <p style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>
          Analyses détaillées par sport avec explications expertes
        </p>
        {/* Avertissement données anciennes */}
        {dataAge === 'stale' && (
          <div style={{
            background: '#fbbf2420',
            border: '1px solid #fbbf24',
            borderRadius: '6px',
            padding: '8px 12px',
            marginTop: '8px',
            fontSize: '11px',
            color: '#fbbf24'
          }}>
            ⚠️ Données du pré-calcul précédent. Le nouveau pré-calcul s'exécute à 6h30 UTC.
          </div>
        )}
      </div>

      {/* Stats rapides par sport */}
      {stats && (
        <div style={{
          background: 'linear-gradient(135deg, #1a1a1a 0%, #14b8a615 100%)',
          borderRadius: '10px',
          padding: '12px',
          marginBottom: '12px',
          border: '1px solid #14b8a630'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#14b8a6' }}>{counts.all}</div>
              <div style={{ fontSize: '9px', color: '#888' }}>Total</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#22c55e' }}>{counts.Football}</div>
              <div style={{ fontSize: '9px', color: '#888' }}>⚽ Foot</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#f97316' }}>{counts.Basket}</div>
              <div style={{ fontSize: '9px', color: '#888' }}>🏀 Basket</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#3b82f6' }}>{counts.Hockey}</div>
              <div style={{ fontSize: '9px', color: '#888' }}>🏒 Hockey</div>
            </div>
          </div>
          
          {/* Ratio Expert Advisor - NOUVEAU */}
          <div style={{
            marginTop: '10px',
            padding: '10px',
            background: '#0d0d0d',
            borderRadius: '8px',
            borderTop: '1px solid #14b8a630'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>🎯</span>
                <div>
                  <div style={{ fontSize: '11px', color: '#14b8a6', fontWeight: 'bold' }}>Expert Advisor</div>
                  <div style={{ fontSize: '9px', color: '#666' }}>Taux de réussite historique</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ 
                  fontSize: '18px', 
                  fontWeight: 'bold',
                  color: (stats as any).expertWinRate >= 65 ? '#22c55e' : 
                          (stats as any).expertWinRate >= 55 ? '#eab308' : '#ef4444'
                }}>
                  {(stats as any).expertWinRate || '--'}%
                </div>
                <div style={{ fontSize: '9px', color: '#666' }}>
                  {(stats as any).expertWins || 0}/{(stats as any).expertTotal || 0} conseils vérifiés
                </div>
              </div>
            </div>
            
            {/* Barre de progression du ratio */}
            <div style={{ marginTop: '8px' }}>
              <div style={{ 
                height: '4px', 
                background: '#1a1a1a', 
                borderRadius: '2px',
                overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  width: `${(stats as any).expertWinRate || 0}%`,
                  background: (stats as any).expertWinRate >= 65 ? '#22c55e' : 
                              (stats as any).expertWinRate >= 55 ? '#eab308' : '#ef4444',
                  transition: 'width 0.3s ease'
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '8px', color: '#555' }}>
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtres par sport */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveSport('all')}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: activeSport === 'all' ? '2px solid #14b8a6' : '1px solid #333',
            background: activeSport === 'all' ? '#14b8a620' : 'transparent',
            color: activeSport === 'all' ? '#14b8a6' : '#888',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: activeSport === 'all' ? 'bold' : 'normal',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          📊 Tous ({counts.all})
        </button>
        <button
          onClick={() => setActiveSport('Football')}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: activeSport === 'Football' ? '2px solid #22c55e' : '1px solid #333',
            background: activeSport === 'Football' ? '#22c55e20' : 'transparent',
            color: activeSport === 'Football' ? '#22c55e' : '#888',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: activeSport === 'Football' ? 'bold' : 'normal',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          ⚽ Football ({counts.Football})
        </button>
        <button
          onClick={() => setActiveSport('Basket')}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: activeSport === 'Basket' ? '2px solid #f97316' : '1px solid #333',
            background: activeSport === 'Basket' ? '#f9731620' : 'transparent',
            color: activeSport === 'Basket' ? '#f97316' : '#888',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: activeSport === 'Basket' ? 'bold' : 'normal',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          🏀 Basketball ({counts.Basket})
        </button>
        <button
          onClick={() => setActiveSport('Hockey')}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: activeSport === 'Hockey' ? '2px solid #3b82f6' : '1px solid #333',
            background: activeSport === 'Hockey' ? '#3b82f620' : 'transparent',
            color: activeSport === 'Hockey' ? '#3b82f6' : '#888',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: activeSport === 'Hockey' ? 'bold' : 'normal',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          🏒 Hockey ({counts.Hockey})
        </button>
      </div>

      {/* Loading */}
      {loadingAdvices ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
          <span style={{ fontSize: '12px' }}>Chargement des analyses expert...</span>
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
          <span style={{ fontSize: '12px', color: '#ef4444' }}>Erreur: {error}</span>
        </div>
      ) : displayedAdvices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>📭</div>
          <span style={{ fontSize: '12px' }}>Aucun conseil pour {activeSport === 'all' ? 'le moment' : activeSport}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {displayedAdvices.map((advice, index) => {
            const expertSummary = generateExpertSummary(advice);
            const isSelected = selectedMatch?.matchId === advice.matchId;
            const sportColor = advice.sport === 'Football' || advice.sport === 'Foot' ? '#22c55e' :
                              advice.sport === 'Basket' || advice.sport === 'Basketball' ? '#f97316' : '#3b82f6';
            
            return (
              <div
                key={index}
                onClick={() => setSelectedMatch(isSelected ? null : advice)}
                style={{
                  background: isSelected ? `${sportColor}15` : '#1a1a1a',
                  borderRadius: '12px',
                  padding: '14px',
                  cursor: 'pointer',
                  border: isSelected ? `2px solid ${sportColor}` : '1px solid #222',
                  transition: 'all 0.2s'
                }}
              >
                {/* Sport Badge + Match Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{
                        background: `${sportColor}20`,
                        color: sportColor,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '9px',
                        fontWeight: 'bold'
                      }}>
                        {advice.sport === 'Football' || advice.sport === 'Foot' ? '⚽ FOOTBALL' :
                         advice.sport === 'Basket' || advice.sport === 'Basketball' ? '🏀 BASKETBALL' : '🏒 HOCKEY'}
                      </span>
                      <span style={{ fontSize: '9px', color: '#666' }}>{advice.league}</span>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>
                      {advice.homeTeam} vs {advice.awayTeam}
                    </div>
                  </div>
                  
                  {/* Badges */}
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '9px',
                      background: advice.recommendation.confidence === 'very_high' ? '#22c55e' : 
                                  advice.recommendation.confidence === 'high' ? '#3b82f6' : 
                                  advice.recommendation.confidence === 'medium' ? '#f97316' : '#666',
                      color: '#fff',
                      fontWeight: 'bold'
                    }}>
                      {advice.recommendation.confidence === 'very_high' ? '⭐⭐⭐ TOP' :
                       advice.recommendation.confidence === 'high' ? '⭐⭐ FORT' :
                       advice.recommendation.confidence === 'medium' ? '⭐ MODÉRÉ' : '⚠️ FAIBLE'}
                    </span>
                  </div>
                </div>

                {/* Expert Summary Title */}
                <div style={{
                  background: `${sportColor}10`,
                  borderRadius: '8px',
                  padding: '10px',
                  marginBottom: '10px',
                  borderLeft: `3px solid ${sportColor}`
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: sportColor, marginBottom: '4px' }}>
                    {expertSummary.title}
                  </div>
                  <div style={{ fontSize: '11px', color: '#888' }}>
                    {advice.recommendation.bet !== 'avoid' && (
                      <>
                        Cote: {advice.oddsAnalysis.favoriteOdds.toFixed(2)} • 
                        Edge: <span style={{ color: advice.oddsAnalysis.edge > 0 ? '#22c55e' : '#ef4444' }}>
                          {advice.oddsAnalysis.edge > 0 ? '+' : ''}{advice.oddsAnalysis.edge}%
                        </span> •
                        Mise Kelly: <span style={{ color: '#f97316', fontWeight: 'bold' }}>{advice.recommendation.kellyStake}%</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Détails étendus si sélectionné */}
                {isSelected && (
                  <>
                    {/* Analyse Expert Complète */}
                    <div style={{
                      background: '#222',
                      borderRadius: '8px',
                      padding: '12px',
                      marginBottom: '12px'
                    }}>
                      <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#14b8a6', marginBottom: '8px' }}>
                        📝 ANALYSE EXPERT
                      </div>
                      <div style={{ fontSize: '11px', color: '#ccc', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                        {expertSummary.analysis}
                      </div>
                    </div>

                    {/* Facteurs Clés */}
                    {advice.unifiedContext?.keyFactors && advice.unifiedContext.keyFactors.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '10px', color: '#3b82f6', marginBottom: '6px', fontWeight: 'bold' }}>
                          🔑 Facteurs Clés Identifiés
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {advice.unifiedContext.keyFactors.map((factor, i) => (
                            <span key={i} style={{
                              background: '#3b82f620',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              fontSize: '10px',
                              color: '#3b82f6'
                            }}>
                              {factor}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Reasoning */}
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '10px', color: '#14b8a6', marginBottom: '6px', fontWeight: 'bold' }}>
                        💡 Justification Détaillée
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {advice.recommendation.reasoning.map((reason: string, i: number) => (
                          <div key={i} style={{ fontSize: '10px', color: '#888', paddingLeft: '10px', borderLeft: '2px solid #14b8a6' }}>
                            {reason}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Verdict Final */}
                    <div style={{
                      background: advice.recommendation.bet === 'avoid' ? '#ef444415' : '#22c55e15',
                      borderRadius: '8px',
                      padding: '12px',
                      marginBottom: '12px',
                      border: `1px solid ${advice.recommendation.bet === 'avoid' ? '#ef444430' : '#22c55e30'}`
                    }}>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#fff', lineHeight: '1.5' }}>
                        {expertSummary.verdict}
                      </div>
                    </div>

                    {/* Warnings */}
                    {advice.warnings && advice.warnings.length > 0 && (
                      <div style={{
                        background: '#f9731610',
                        borderRadius: '8px',
                        padding: '10px',
                        border: '1px solid #f9731630'
                      }}>
                        <div style={{ fontSize: '10px', color: '#f97316', marginBottom: '6px', fontWeight: 'bold' }}>
                          ⚠️ Points d'Attention
                        </div>
                        {advice.warnings.map((warning: string, i: number) => (
                          <div key={i} style={{ fontSize: '10px', color: '#f97316', marginBottom: '2px' }}>
                            • {warning}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Clic pour fermer */}
                    <div style={{ textAlign: 'center', marginTop: '10px' }}>
                      <span style={{ fontSize: '9px', color: '#666' }}>👆 Cliquez pour réduire</span>
                    </div>
                  </>
                )}

                {/* Indicateur "Cliquez pour détails" si non sélectionné */}
                {!isSelected && (
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '9px', color: '#666' }}>👆 Cliquez pour voir l'analyse détaillée</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer info */}
      {phaseInfo && (
        <div style={{
          marginTop: '12px',
          padding: '10px',
          background: '#1a1a1a',
          borderRadius: '8px',
          fontSize: '10px',
          color: '#666',
          textAlign: 'center'
        }}>
          🕐 Dernière mise à jour: {new Date(phaseInfo.phase || '').toLocaleString('fr-FR')} • 
          Prochain recalcul: {phaseInfo.nextReset}
        </div>
      )}
    </div>
  );
}
