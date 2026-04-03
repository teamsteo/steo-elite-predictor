/**
 * Team News Service - Analyse d'Actualité des Équipes
 * 
 * Ce service analyse l'actualité des équipes pour détecter les facteurs
 * pouvant affecter leur performance:
 * 
 * - Changement d'entraîneur / manager
 * - Problèmes financiers du club
 * - Conflits internes / locker room
 * - Rumeurs de transfert importantes
 * - Blessures non listées officiellement
 * - Suspensions disciplinaires
 * - Changement de propriétaire
 * - Pression des supporters
 * 
 * IMPACT SUR LES PRÉDICTIONS:
 * - Coach change: -5% à -15% selon le timing
 * - Problèmes financiers: -5% à -10%
 * - Conflits internes: -3% à -8%
 * - Transferts: Impact variable selon joueur concerné
 */

import ZAI from 'z-ai-web-dev-sdk';

// ============================================
// TYPES
// ============================================

export interface TeamNewsItem {
  type: NewsType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  summary: string;
  source: string;
  url?: string;
  date: string;
  impact: {
    performanceEffect: number; // -15 à +5
    moraleEffect: number; // -20 à +10
    confidence: number; // 0-1 (confiance dans l'analyse)
  };
  explanation: string;
}

export type NewsType = 
  | 'coach_change'
  | 'coach_pressure'
  | 'financial_issues'
  | 'ownership_change'
  | 'player_conflict'
  | 'locker_room_issues'
  | 'transfer_rumor'
  | 'transfer_completed'
  | 'injury_crisis'
  | 'disciplinary_issue'
  | 'supporter_unrest'
  | 'board_issues'
  | 'positive_news'
  | 'other';

export interface TeamNewsAnalysis {
  team: string;
  newsItems: TeamNewsItem[];
  overallImpact: {
    performanceModifier: number; // -20 à +5
    moraleModifier: number; // -25 à +15
    riskLevel: 'very_high' | 'high' | 'medium' | 'low' | 'none';
  };
  summary: string;
  keyFactors: string[];
  recommendation: 'avoid' | 'caution' | 'neutral' | 'slight_advantage';
  analyzedAt: string;
}

export interface MatchNewsContext {
  homeTeam: TeamNewsAnalysis;
  awayTeam: TeamNewsAnalysis;
  comparativeImpact: {
    advantagedTeam: 'home' | 'away' | 'neutral';
    impactDifference: number;
    explanation: string;
  };
}

// ============================================
// CONSTANTES
// ============================================

// Mots-clés pour la détection
const NEWS_KEYWORDS: Record<NewsType, { en: string[]; fr: string[] }> = {
  coach_change: {
    en: ['sacked', 'fired', 'resigned', 'appointed', 'new manager', 'new coach', 'part ways', 'stepped down', 'head coach leaves'],
    fr: ['licencié', 'viré', 'démission', 'nouvel entraîneur', 'nouveau coach', 'remplacé', 'quitte', 'partir', 'séparé']
  },
  coach_pressure: {
    en: ['under pressure', 'on the brink', 'fighting for his job', 'job under threat', 'could be sacked', 'under fire'],
    fr: ['sous pression', 'sur le siège', 'menacé', 'pourrait être licencié', 'critiqué', 'contesté']
  },
  financial_issues: {
    en: ['financial trouble', 'debt', 'bankruptcy', 'wages unpaid', 'financial crisis', 'money problems', 'budget cuts'],
    fr: ['problème financier', 'dette', 'faillite', 'salaires impayés', 'crise financière', 'budget', 'déficit']
  },
  ownership_change: {
    en: ['takeover', 'new owner', 'sold', 'buyout', 'acquisition', 'ownership', 'investment group'],
    fr: ['rachat', 'nouveau propriétaire', 'vendu', 'acquisition', 'investisseur', 'repreneur']
  },
  player_conflict: {
    en: ['fallout', 'argument', 'clash', 'dispute', 'fight', 'confrontation', 'training ground bust-up'],
    fr: ['dispute', 'conflit', 'accrochage', 'altercation', 'bagarre', 'clash', 'entraînement']
  },
  locker_room_issues: {
    en: ['locker room', 'dressing room', 'divided', 'unrest', 'toxic', 'disharmony', 'split', 'faction'],
    fr: ['vestiaire', 'divisé', 'malaise', 'toxique', 'désaccord', 'clan', 'groupe']
  },
  transfer_rumor: {
    en: ['transfer target', 'bid', 'offer', 'want to sign', 'interested in', 'release clause', 'linked with'],
    fr: ['transfert', 'offre', 'souhaite', 'intéressé', 'clause', 'piste', 'vise']
  },
  transfer_completed: {
    en: ['signed', 'completed transfer', 'joins', 'moves to', 'deal done', 'medical passed'],
    fr: ['signé', 'transfert complété', 'rejoint', 'officiel', "s'engage"]
  },
  injury_crisis: {
    en: ['injury crisis', 'injury list', 'sidelined', 'out for season', 'long-term absentees', 'treatment room'],
    fr: ['infirmerie', 'blessés', 'absent', 'forfait', 'indisponible', 'longue durée']
  },
  disciplinary_issue: {
    en: ['suspended', 'ban', 'disciplinary', 'dropped', 'excluded', 'sent home', 'breach'],
    fr: ['suspendu', 'sanction', 'disciplinaire', 'écarté', 'exclu', 'renvoyé']
  },
  supporter_unrest: {
    en: ['protest', 'boycott', 'fans angry', 'supporter unrest', 'demonstration', 'walk out'],
    fr: ['manifestation', ' boycott', 'colère', 'mécontentement', 'protestation']
  },
  board_issues: {
    en: ['boardroom', 'directors', 'resignation', 'internal conflict', 'power struggle', 'management issue'],
    fr: ['conseil', 'directeur', 'démission', 'conflit interne', 'direction', 'lutte']
  },
  positive_news: {
    en: ['new contract', 'extended', 'renewed', 'boost', 'confidence high', 'winning streak', 'unbeaten'],
    fr: ['nouveau contrat', 'prolongation', 'boost', 'confiance', 'série', 'invaincu']
  },
  other: {
    en: [],
    fr: []
  }
};

// Impact par type de news
const NEWS_IMPACT: Record<NewsType, { 
  performance: number; 
  morale: number; 
  baseSeverity: 'critical' | 'high' | 'medium' | 'low' 
}> = {
  coach_change: { performance: -12, morale: -15, baseSeverity: 'critical' },
  coach_pressure: { performance: -5, morale: -8, baseSeverity: 'medium' },
  financial_issues: { performance: -8, morale: -12, baseSeverity: 'high' },
  ownership_change: { performance: -3, morale: -5, baseSeverity: 'medium' },
  player_conflict: { performance: -6, morale: -10, baseSeverity: 'high' },
  locker_room_issues: { performance: -10, morale: -18, baseSeverity: 'critical' },
  transfer_rumor: { performance: -2, morale: -3, baseSeverity: 'low' },
  transfer_completed: { performance: -3, morale: -2, baseSeverity: 'low' },
  injury_crisis: { performance: -8, morale: -5, baseSeverity: 'high' },
  disciplinary_issue: { performance: -4, morale: -8, baseSeverity: 'medium' },
  supporter_unrest: { performance: -5, morale: -10, baseSeverity: 'high' },
  board_issues: { performance: -4, morale: -6, baseSeverity: 'medium' },
  positive_news: { performance: 3, morale: 5, baseSeverity: 'low' },
  other: { performance: 0, morale: 0, baseSeverity: 'low' }
};

// Cache
const newsCache = new Map<string, { data: TeamNewsAnalysis; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 heure

// ============================================
// FONCTIONS PRINCIPALES
// ============================================

/**
 * Analyse l'actualité d'une équipe
 */
export async function analyzeTeamNews(
  teamName: string,
  options?: { forceRefresh?: boolean; daysBack?: number }
): Promise<TeamNewsAnalysis> {
  const cacheKey = teamName.toLowerCase();
  
  // Vérifier le cache
  if (!options?.forceRefresh) {
    const cached = newsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      return cached.data;
    }
  }
  
  console.log(`🔍 Analyse actualité équipe: ${teamName}`);
  
  try {
    const zai = await ZAI.create();
    const newsItems: TeamNewsItem[] = [];
    
    // Recherche multi-angles pour capturer différents types de news
    const searchQueries = [
      `${teamName} coach manager news latest`,
      `${teamName} financial problems club news`,
      `${teamName} locker room conflict drama`,
      `${teamName} transfer news latest`
    ];
    
    for (const query of searchQueries) {
      try {
        const results = await zai.functions.invoke('web_search', {
          query,
          num: 5
        });
        
        if (Array.isArray(results)) {
          for (const item of results as any[]) {
            const newsItem = analyzeNewsItem(item, teamName);
            if (newsItem && !newsItems.some(n => n.title === newsItem.title)) {
              newsItems.push(newsItem);
            }
          }
        }
      } catch (e) {
        // Continuer si une requête échoue
      }
    }
    
    // Trier par sévérité et date
    newsItems.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
    
    // Calculer l'impact global
    const analysis = calculateOverallImpact(teamName, newsItems);
    
    // Mettre en cache
    newsCache.set(cacheKey, { data: analysis, timestamp: Date.now() });
    
    console.log(`✅ Actualité ${teamName}: ${newsItems.length} éléments, impact ${analysis.overallImpact.performanceModifier}`);
    
    return analysis;
    
  } catch (error) {
    console.error('Erreur analyse actualité:', error);
    return createEmptyAnalysis(teamName);
  }
}

/**
 * Analyse le contexte d'actualité pour un match
 */
export async function analyzeMatchNewsContext(
  homeTeam: string,
  awayTeam: string
): Promise<MatchNewsContext> {
  console.log(`📰 Analyse contexte actualité: ${homeTeam} vs ${awayTeam}`);
  
  // Analyser les deux équipes en parallèle
  const [homeAnalysis, awayAnalysis] = await Promise.all([
    analyzeTeamNews(homeTeam),
    analyzeTeamNews(awayTeam)
  ]);
  
  // Calculer l'impact comparatif
  const homeImpact = homeAnalysis.overallImpact.performanceModifier + 
                     homeAnalysis.overallImpact.moraleModifier * 0.5;
  const awayImpact = awayAnalysis.overallImpact.performanceModifier + 
                     awayAnalysis.overallImpact.moraleModifier * 0.5;
  
  const impactDifference = homeImpact - awayImpact;
  
  let advantagedTeam: 'home' | 'away' | 'neutral' = 'neutral';
  if (impactDifference > 8) advantagedTeam = 'home';
  else if (impactDifference < -8) advantagedTeam = 'away';
  
  const explanation = generateComparativeExplanation(
    homeTeam, awayTeam, homeAnalysis, awayAnalysis, impactDifference
  );
  
  return {
    homeTeam: homeAnalysis,
    awayTeam: awayAnalysis,
    comparativeImpact: {
      advantagedTeam,
      impactDifference,
      explanation
    }
  };
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Analyse un item de news pour détecter son type et impact
 */
function analyzeNewsItem(item: any, teamName: string): TeamNewsItem | null {
  const title = item.name || item.title || '';
  const snippet = item.snippet || '';
  const text = `${title} ${snippet}`.toLowerCase();
  
  // Vérifier que c'est bien lié à l'équipe
  if (!text.includes(teamName.toLowerCase())) {
    return null;
  }
  
  // Détecter le type de news
  let detectedType: NewsType = 'other';
  let maxMatches = 0;
  
  for (const [type, keywords] of Object.entries(NEWS_KEYWORDS)) {
    if (type === 'other') continue;
    
    const allKeywords = [...keywords.en, ...keywords.fr];
    const matches = allKeywords.filter(kw => text.includes(kw.toLowerCase())).length;
    
    if (matches > maxMatches) {
      maxMatches = matches;
      detectedType = type as NewsType;
    }
  }
  
  // Si aucun type détecté, ignorer
  if (detectedType === 'other') {
    return null;
  }
  
  // Récupérer l'impact de base
  const baseImpact = NEWS_IMPACT[detectedType];
  
  // Calculer la confiance basée sur la récence et la source
  const confidence = calculateConfidence(item);
  
  // Ajuster l'impact selon la confiance
  const adjustedPerformance = baseImpact.performance * confidence;
  const adjustedMorale = baseImpact.morale * confidence;
  
  // Générer l'explication
  const explanation = generateExplanation(detectedType, teamName, title);
  
  return {
    type: detectedType,
    severity: baseImpact.baseSeverity,
    title: title.substring(0, 100),
    summary: snippet.substring(0, 200),
    source: item.host_name || 'Web Search',
    url: item.url,
    date: item.date || new Date().toISOString(),
    impact: {
      performanceEffect: Math.round(adjustedPerformance * 10) / 10,
      moraleEffect: Math.round(adjustedMorale * 10) / 10,
      confidence: Math.round(confidence * 100) / 100
    },
    explanation
  };
}

/**
 * Calcule le niveau de confiance dans une news
 */
function calculateConfidence(item: any): number {
  let confidence = 0.5;
  
  // Source fiable
  const reliableSources = [
    'bbc', 'espn', 'sky sports', 'lequipe', 'marca', 'kicker',
    'the athletic', 'reuters', 'guardian', 'l\'equipe'
  ];
  
  const source = (item.host_name || '').toLowerCase();
  if (reliableSources.some(s => source.includes(s))) {
    confidence += 0.3;
  }
  
  // Récence (moins de 7 jours)
  if (item.date) {
    const newsDate = new Date(item.date);
    const daysOld = (Date.now() - newsDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld < 3) confidence += 0.2;
    else if (daysOld < 7) confidence += 0.1;
  }
  
  return Math.min(1, confidence);
}

/**
 * Génère une explication pour une news
 */
function generateExplanation(type: NewsType, team: string, title: string): string {
  const explanations: Record<NewsType, string> = {
    coach_change: `Changement d'entraîneur détecté pour ${team}. Impact négatif significatif attendu.`,
    coach_pressure: `L'entraîneur de ${team} est sous pression. Instabilité possible.`,
    financial_issues: `Problèmes financiers signalés pour ${team}. Peut affecter le recrutement et le moral.`,
    ownership_change: `Changement de propriétaire en cours pour ${team}. Période d'incertitude.`,
    player_conflict: `Conflit détecté impliquant des joueurs de ${team}. Moral potentiellement affecté.`,
    locker_room_issues: `Problèmes de vestiaire signalés pour ${team}. Impact sur la cohésion d'équipe.`,
    transfer_rumor: `Rumeur de transfert concernant ${team}. Distraction possible.`,
    transfer_completed: `Transfert récent pour ${team}. Temps d'adaptation nécessaire.`,
    injury_crisis: `Crise de blessures à ${team}. Effectif réduit.`,
    disciplinary_issue: `Problème disciplinaire à ${team}. Impact sur l'effectif disponible.`,
    supporter_unrest: `Mécontentement des supporters de ${team}. Pression sur l'équipe.`,
    board_issues: `Problèmes internes à la direction de ${team}. Instabilité.`,
    positive_news: `Bonne nouvelle pour ${team}. Potentiel boost de confiance.`,
    other: `Actualité détectée pour ${team}.`
  };
  
  return explanations[type];
}

/**
 * Calcule l'impact global pour une équipe
 */
function calculateOverallImpact(teamName: string, newsItems: TeamNewsItem[]): TeamNewsAnalysis {
  if (newsItems.length === 0) {
    return createEmptyAnalysis(teamName);
  }
  
  // Sommer les impacts
  let totalPerformance = 0;
  let totalMorale = 0;
  const keyFactors: string[] = [];
  
  // Prendre les 5 news les plus importantes
  const topNews = newsItems.slice(0, 5);
  
  for (const item of topNews) {
    totalPerformance += item.impact.performanceEffect;
    totalMorale += item.impact.moraleEffect;
    
    if (item.severity === 'critical' || item.severity === 'high') {
      keyFactors.push(item.explanation);
    }
  }
  
  // Limiter les impacts
  totalPerformance = Math.max(-20, Math.min(5, totalPerformance));
  totalMorale = Math.max(-25, Math.min(15, totalMorale));
  
  // Déterminer le niveau de risque
  let riskLevel: TeamNewsAnalysis['overallImpact']['riskLevel'] = 'none';
  if (totalPerformance < -10 || totalMorale < -15) riskLevel = 'very_high';
  else if (totalPerformance < -5 || totalMorale < -10) riskLevel = 'high';
  else if (totalPerformance < -2 || totalMorale < -5) riskLevel = 'medium';
  else if (totalPerformance < 0 || totalMorale < 0) riskLevel = 'low';
  
  // Déterminer la recommandation
  let recommendation: TeamNewsAnalysis['recommendation'] = 'neutral';
  if (totalPerformance < -8) recommendation = 'avoid';
  else if (totalPerformance < -4) recommendation = 'caution';
  else if (totalPerformance > 2) recommendation = 'slight_advantage';
  
  // Générer le résumé
  const summary = generateSummary(teamName, topNews, totalPerformance);
  
  return {
    team: teamName,
    newsItems: topNews,
    overallImpact: {
      performanceModifier: Math.round(totalPerformance * 10) / 10,
      moraleModifier: Math.round(totalMorale * 10) / 10,
      riskLevel
    },
    summary,
    keyFactors: keyFactors.slice(0, 3),
    recommendation,
    analyzedAt: new Date().toISOString()
  };
}

/**
 * Génère un résumé de l'analyse
 */
function generateSummary(teamName: string, newsItems: TeamNewsItem[], performanceImpact: number): string {
  if (newsItems.length === 0) {
    return `Aucune actualité significative pour ${teamName}`;
  }
  
  const criticalItems = newsItems.filter(n => n.severity === 'critical');
  const highItems = newsItems.filter(n => n.severity === 'high');
  
  if (criticalItems.length > 0) {
    return `⚠️ ${teamName}: ${criticalItems.length} problème(s) critique(s) détecté(s). Impact estimé: ${performanceImpact}%`;
  }
  
  if (highItems.length > 0) {
    return `⚡ ${teamName}: ${highItems.length} problème(s) important(s). Impact: ${performanceImpact}%`;
  }
  
  return `📰 ${teamName}: ${newsItems.length} actualité(s) mineure(s).`;
}

/**
 * Génère l'explication comparative
 */
function generateComparativeExplanation(
  homeTeam: string,
  awayTeam: string,
  homeAnalysis: TeamNewsAnalysis,
  awayAnalysis: TeamNewsAnalysis,
  impactDiff: number
): string {
  if (Math.abs(impactDiff) < 5) {
    return 'Aucun avantage significatif lié à l\'actualité récente';
  }
  
  const advantaged = impactDiff > 0 ? homeTeam : awayTeam;
  const disadvantaged = impactDiff > 0 ? awayTeam : homeTeam;
  const analysis = impactDiff > 0 ? homeAnalysis : awayAnalysis;
  
  const factors = analysis.keyFactors.slice(0, 2).join('. ');
  
  return `${advantaged} bénéficie de l'actualité récente de ${disadvantaged}. ${factors}`;
}

/**
 * Crée une analyse vide
 */
function createEmptyAnalysis(teamName: string): TeamNewsAnalysis {
  return {
    team: teamName,
    newsItems: [],
    overallImpact: {
      performanceModifier: 0,
      moraleModifier: 0,
      riskLevel: 'none'
    },
    summary: `Aucune actualité significative détectée pour ${teamName}`,
    keyFactors: [],
    recommendation: 'neutral',
    analyzedAt: new Date().toISOString()
  };
}

/**
 * Ajuste les probabilités selon l'actualité
 */
export function adjustProbabilitiesByNews(
  homeProb: number,
  drawProb: number,
  awayProb: number,
  newsContext: MatchNewsContext
): { home: number; draw: number; away: number; explanation: string } {
  const homeImpact = newsContext.homeTeam.overallImpact.performanceModifier;
  const awayImpact = newsContext.awayTeam.overallImpact.performanceModifier;
  
  // Convertir l'impact en ajustement de probabilité
  // Impact négatif = équipe désavantagée
  const homeAdj = -homeImpact * 0.3; // 30% de l'impact est reflété dans les probas
  const awayAdj = -awayImpact * 0.3;
  
  let adjustedHome = homeProb + homeAdj - awayAdj * 0.3;
  let adjustedAway = awayProb + awayAdj - homeAdj * 0.3;
  let adjustedDraw = drawProb + (Math.abs(homeAdj) + Math.abs(awayAdj)) * 0.2;
  
  // Normaliser
  const total = adjustedHome + adjustedDraw + adjustedAway;
  adjustedHome = (adjustedHome / total) * 100;
  adjustedDraw = (adjustedDraw / total) * 100;
  adjustedAway = (adjustedAway / total) * 100;
  
  return {
    home: Math.round(adjustedHome * 10) / 10,
    draw: Math.round(adjustedDraw * 10) / 10,
    away: Math.round(adjustedAway * 10) / 10,
    explanation: newsContext.comparativeImpact.explanation
  };
}

/**
 * Vide le cache
 */
export function clearNewsCache(): void {
  newsCache.clear();
  console.log('🗑️ Cache actualités vidé');
}

// ============================================
// EXPORT
// ============================================

const TeamNewsService = {
  analyzeTeamNews,
  analyzeMatchNewsContext,
  adjustProbabilitiesByNews,
  clearCache: clearNewsCache,
};

export default TeamNewsService;
