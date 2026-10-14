/**
 * Noise Filter Service - Filtrage des Bruits et Fausses Alertes
 * 
 * Ce service détecte et atténue les signaux faux ou bruités dans:
 * 1. Les actualités équipe (rumeurs non fondées, news obsolètes, clickbait)
 * 2. Les prédictions (signaux inconsistants, sur-réaction à un facteur)
 * 3. Les données de blessures (fausses blessures, retour anticipé)
 * 
 * PRINCIPES:
 * - Cross-validation: un signal confirmé par 2+ sources est plus fiable
 * - Récence: une news de 10 jours a moins de valeur qu'une de 24h
 * - Cohérence: si tous les modèles divergent, le signal est bruité
 * - Prudence: en cas de doute, réduire l'impact plutôt que supprimer
 * 
 * IMPACT SUR LES PRÉDICTIONS:
 * - Réduit le Kelly Stake quand le bruit est détecté
 * - Peut élever le risque à 'high' si trop de bruit
 * - Filtre les news non corroborées avant impact
 */

// ============================================
// TYPES
// ============================================

export interface NoiseAssessment {
  /** Score global de bruit 0 (propre) à 100 (très bruité) */
  noiseScore: number;
  /** Niveau de bruit détecté */
  level: 'clean' | 'low' | 'medium' | 'high';
  /** Détails par catégorie */
  details: NoiseDetails;
  /** Facteurs de bruit détectés */
  noiseFactors: string[];
  /** Multiplicateur de confiance à appliquer (0.5 à 1.0) */
  confidenceMultiplier: number;
  /** Multiplicateur de Kelly à appliquer (0.0 à 1.0) */
  kellyMultiplier: number;
  /** Le prédiction devrait-elle être rejetée? */
  shouldReject: boolean;
  /** Raison du rejet (si applicable) */
  rejectionReason?: string;
}

export interface NoiseDetails {
  /** Bruit dans les actualités équipe */
  news: NewsNoiseAssessment;
  /** Bruit dans les données de prédiction */
  prediction: PredictionNoiseAssessment;
  /** Bruit dans les données de blessures */
  injuries: InjuryNoiseAssessment;
  /** Bruit dans les données de forme */
  formData: FormDataNoiseAssessment;
}

export interface NewsNoiseAssessment {
  score: number; // 0-100
  issues: string[];
  /** News filtrées (considérées comme bruit) */
  filteredCount: number;
  /** News conservées (signal fiable) */
  keptCount: number;
}

export interface PredictionNoiseAssessment {
  score: number; // 0-100
  issues: string[];
  /** Écart entre les modèles (0 = accord parfait, 100 = désaccord total) */
  modelDisagreement: number;
  /** Le edge est-il porté par un seul facteur fragile? */
  fragileEdge: boolean;
  /** Les probas sont-elles trop proches (match imprévisible)? */
  tooClose: boolean;
}

export interface InjuryNoiseAssessment {
  score: number; // 0-100
  issues: string[];
  /** Les blessures sont-elles confirmées par 2+ sources? */
  crossValidated: boolean;
  /** Y a-t-il des incohérences (joueur blessé mais titulaire ailleurs)? */
  inconsistencies: string[];
}

export interface FormDataNoiseAssessment {
  score: number; // 0-100
  issues: string[];
  /** La forme est-elle basée sur trop peu de matchs? */
  smallSampleSize: boolean;
  /** La forme contredit fortement les cotes? */
  contradictsOdds: boolean;
}

// Types pour le filtrage des news
export interface FilteredNewsItem {
  title: string;
  summary: string;
  source: string;
  date?: string;
  url?: string;
  /** Score de fiabilité après filtrage (0-1) */
  reliabilityScore: number;
  /** Raison du filtrage si rejeté */
  filterReason?: string;
  /** Conservé après filtrage? */
  kept: boolean;
}

// ============================================
// SOURCES FIABLES
// ============================================

const TIER1_SOURCES = [ // Très fiables - news officielles
  'bbc', 'espn', 'sky sports', 'reuters', 'associated press', 'the athletic',
  'lequipe', 'marca', 'l\'equipe', 'ff.fr', 'ligue1.com', 'premierleague.com',
  'nba.com', 'nhl.com', 'mlb.com', 'uefa.com', 'fifa.com',
  'lfp.fr', 'legaseriea.it', 'bundesliga.com', 'laliga.com'
];

const TIER2_SOURCES = [ // Fiables - médias sportifs reconnus
  'guardian', 'telegraph', 'independent', 'the times', 'fox sports',
  'cbssports', 'yahoo sports', 'bleacher report', 'sporting news',
  'liverpoolecho', 'manchestereveningnews', 'football.london',
  ' Mundo Deportivo', 'sport', 'as.com', 'corriere dello sport',
  'kicker', 'bild', 'sofoot', 'francefootball'
];

const TIER3_SOURCES = [ // Moins fiables - blogs, rumeurs
  'twitter', 'x.com', 'reddit', 'footballtransfer', 'transfermarkt',
  'goal.com', '90min', 'sportbible', 'caughtoffside', 'footballinsider',
  'fichajes', 'calciomercato', 'tuttomercatoweb'
];

// Mots-clés de clickbait (haute probabilité de bruit)
const CLICKBAIT_PATTERNS = [
  'shock', 'explosive', 'you won\'t believe', 'revealed', 'massive blow',
  'could be done', 'set to', 'poised to', 'on the verge', 'closing in',
  'in a stunning twist', 'world exclusive', 'breaking', 'just in',
  'choc', 'explosif', 'incroyable', 'révélé', 'coup de tonnerre',
  'selon des rumeurs', 'potentiellement', 'pourrait'
];

// Mots-clés indiquant une info confirmée vs rumeur
const CONFIRMATION_PATTERNS = [
  'confirmed', 'announced', 'official', 'signed', 'completed',
  'statement', 'club confirmed', 'medical passed',
  'confirme', 'annonc\u00e9', 'officiel', 'communiqu\u00e9',
  'official statement', 'press release'
];

// ============================================
// FILTRAGE DES NEWS
// ============================================

/**
 * Filtre les news d'équipe pour éliminer le bruit et les fausses alertes
 * 
 * Stratégie:
 * 1. Vérifier la fiabilité de la source
 * 2. Vérifier la récence de la news
 * 3. Détecter le clickbait
 * 4. Cross-valider entre sources
 * 5. Détecter les rumeurs vs faits
 */
export function filterNewsItems(
  newsItems: Array<{
    type: string;
    title: string;
    summary: string;
    source: string;
    date?: string;
    url?: string;
    severity?: string;
  }>,
  teamName: string
): FilteredNewsItem[] {
  const filtered: FilteredNewsItem[] = [];
  const typeCount: Record<string, number> = {};
  
  for (const item of newsItems) {
    let reliabilityScore = 0.5;
    let filterReason: string | undefined;
    let kept = true;
    
    const fullText = `${item.title} ${item.summary}`.toLowerCase();
    const sourceLower = item.source.toLowerCase();
    
    // 1. Vérifier que la news concerne bien l'équipe
    if (!fullText.includes(teamName.toLowerCase().split(' ')[0])) {
      // Vérifier avec le nom complet aussi
      if (!fullText.includes(teamName.toLowerCase())) {
        filtered.push({
          title: item.title,
          summary: item.summary,
          source: item.source,
          date: item.date,
          url: item.url,
          reliabilityScore: 0,
          filterReason: 'Non lié à l\'équipe',
          kept: false,
        });
        continue;
      }
    }
    
    // 2. Source reliability
    if (TIER1_SOURCES.some(s => sourceLower.includes(s))) {
      reliabilityScore += 0.35;
    } else if (TIER2_SOURCES.some(s => sourceLower.includes(s))) {
      reliabilityScore += 0.20;
    } else if (TIER3_SOURCES.some(s => sourceLower.includes(s))) {
      reliabilityScore -= 0.15;
      filterReason = 'Source à faible fiabilité';
    } else {
      reliabilityScore -= 0.05; // Source inconnue
    }
    
    // 3. Récence
    if (item.date) {
      try {
        const newsDate = new Date(item.date);
        const daysOld = (Date.now() - newsDate.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysOld < 1) {
          reliabilityScore += 0.15; // Moins de 24h - très frais
        } else if (daysOld < 3) {
          reliabilityScore += 0.10;
        } else if (daysOld < 7) {
          reliabilityScore += 0.05;
        } else if (daysOld > 14) {
          reliabilityScore -= 0.20;
          filterReason = filterReason || 'News trop ancienne (>14 jours)';
        } else if (daysOld > 10) {
          reliabilityScore -= 0.10;
        }
      } catch {
        // Date invalide
        reliabilityScore -= 0.10;
      }
    } else {
      reliabilityScore -= 0.10; // Pas de date = moins fiable
    }
    
    // 4. Clickbait detection
    const clickbaitMatches = CLICKBAIT_PATTERNS.filter(p => fullText.includes(p)).length;
    if (clickbaitMatches >= 3) {
      reliabilityScore -= 0.25;
      filterReason = filterReason || 'Clickbait détecté (3+ motifs)';
    } else if (clickbaitMatches >= 2) {
      reliabilityScore -= 0.15;
    } else if (clickbaitMatches === 1) {
      reliabilityScore -= 0.05;
    }
    
    // 5. Confirmation vs rumeur
    const hasConfirmation = CONFIRMATION_PATTERNS.some(p => fullText.includes(p));
    const hasRumorWords = ['rumor', 'could', 'might', 'reportedly', 'set to', 'poised', 
      'rumeur', 'pourrait', 'selon', 'potentiellement'].some(p => fullText.includes(p));
    
    if (hasConfirmation) {
      reliabilityScore += 0.15; // Info confirmée
    }
    if (hasRumorWords && !hasConfirmation) {
      reliabilityScore -= 0.10; // Simple rumeur
    }
    
    // 6. Les rumeurs de transfert sont intrinsèquement bruyantes
    if (item.type === 'transfer_rumor') {
      reliabilityScore -= 0.15;
      // Les rumeurs de transfert ne sont pertinentes que si très récentes
      if (item.date) {
        const daysOld = (Date.now() - new Date(item.date).getTime()) / (1000 * 60 * 60 * 24);
        if (daysOld > 3) {
          reliabilityScore -= 0.15;
          filterReason = filterReason || 'Rumeur de transfert >3 jours';
        }
      }
    }
    
    // 7. Positive news sont rarement du bruit (mais impact faible)
    if (item.type === 'positive_news') {
      reliabilityScore += 0.05;
    }
    
    // 8. Cross-validation: même type de news = plus fiable
    typeCount[item.type] = (typeCount[item.type] || 0) + 1;
    if (typeCount[item.type] >= 2) {
      reliabilityScore += 0.10; // Confirmé par une 2ème source
    }
    
    // Clamp reliability
    reliabilityScore = Math.max(0, Math.min(1, reliabilityScore));
    
    // Decision: keep or filter
    if (reliabilityScore < 0.3) {
      kept = false;
      filterReason = filterReason || `Score de fiabilité trop bas (${Math.round(reliabilityScore * 100)}%)`;
    }
    
    filtered.push({
      title: item.title,
      summary: item.summary,
      source: item.source,
      date: item.date,
      url: item.url,
      reliabilityScore: Math.round(reliabilityScore * 100) / 100,
      filterReason: kept ? undefined : filterReason,
      kept,
    });
  }
  
  return filtered;
}

/**
 * Évalue le bruit global des news d'un match
 */
export function assessNewsNoise(
  homeItems: FilteredNewsItem[],
  awayItems: FilteredNewsItem[]
): NewsNoiseAssessment {
  const allItems = [...homeItems, ...awayItems];
  const filteredItems = allItems.filter(i => !i.kept);
  const keptItems = allItems.filter(i => i.kept);
  
  const issues: string[] = [];
  let score = 0;
  
  // Ratio de news filtrées
  const filterRatio = allItems.length > 0 ? filteredItems.length / allItems.length : 0;
  if (filterRatio > 0.6) {
    score += 40;
    issues.push(`${Math.round(filterRatio * 100)}% des news filtrées comme bruit`);
  } else if (filterRatio > 0.3) {
    score += 20;
    issues.push(`${Math.round(filterRatio * 100)}% des news filtrées`);
  }
  
  // News gardées mais à faible fiabilité
  const lowReliability = keptItems.filter(i => i.reliabilityScore < 0.5).length;
  if (lowReliability > 0) {
    score += lowReliability * 10;
    issues.push(`${lowReliability} news conservées mais à fiabilité douteuse`);
  }
  
  // Si la majorité des news sont des rumeurs
  // (on peut le vérifier via les titres)
  const rumorItems = keptItems.filter(i => {
    const text = `${i.title} ${i.summary}`.toLowerCase();
    return ['rumor', 'could', 'might', 'set to', 'poised', 'rumeur', 'pourrait'].some(p => text.includes(p));
  });
  if (rumorItems.length > keptItems.length * 0.5 && keptItems.length > 0) {
    score += 15;
    issues.push('Majorité des news sont des rumeurs non confirmées');
  }
  
  // Aucune news fiable = score de bruit élevé si des news ont été trouvées
  if (allItems.length > 3 && keptItems.length === 0) {
    score += 30;
    issues.push('Aucune news fiable trouvée parmi les résultats');
  }
  
  return {
    score: Math.min(100, score),
    issues,
    filteredCount: filteredItems.length,
    keptCount: keptItems.length,
  };
}

// ============================================
// FILTRAGE DES PRÉDICTIONS
// ============================================

/**
 * Évalue le bruit dans les signaux de prédiction
 * 
 * Détecte:
 * - Désaccord entre modèles (Market vs Dixon-Coles vs ML)
 * - Edge fragile (porté par un seul facteur)
 * - Match trop imprévisible (probas trop proches)
 * - Sur-réaction aux blessures
 */
export function assessPredictionNoise(params: {
  /** Probabilités implicites du marché */
  impliedHome: number;
  impliedAway: number;
  impliedDraw: number;
  /** Probabilités Dixon-Coles (peut être undefined si non-football) */
  dcHome?: number;
  dcAway?: number;
  dcDraw?: number;
  /** Probabilités finales après combinaison */
  finalHome: number;
  finalAway: number;
  finalDraw: number;
  /** Edge détecté */
  edge: number;
  /** Qualité des données (0-100) */
  dataQuality: number;
  /** Ajustement contexte */
  contextAdjustment: number;
  /** Ajustement ML */
  mlAdjustment: number;
  /** Impact blessures total */
  injuryImpact: number;
  /** Nom de la ligue */
  league: string;
  /** Sport */
  sport: string;
}): PredictionNoiseAssessment {
  const issues: string[] = [];
  let score = 0;
  let modelDisagreement = 0;
  let fragileEdge = false;
  let tooClose = false;
  
  // 1. Désaccord entre modèles
  if (params.dcHome !== undefined && params.dcAway !== undefined) {
    // Écart entre marché et Dixon-Coles
    const homeDiff = Math.abs(params.impliedHome - params.dcHome);
    const awayDiff = Math.abs(params.impliedAway - params.dcAway);
    const maxDiff = Math.max(homeDiff, awayDiff);
    
    modelDisagreement = Math.min(100, maxDiff * 500); // 0.20 diff = 100%
    
    if (maxDiff > 0.15) {
      score += 30;
      issues.push(`Fort désaccord Market vs Dixon-Coles (${(maxDiff * 100).toFixed(0)}%)`);
    } else if (maxDiff > 0.10) {
      score += 15;
      issues.push(`Désaccord modéré Market vs Dixon-Coles`);
    }
    
    // Vérifier si les probas finales sont tirées vers un modèle divergent
    const dcPredictsHome = params.dcHome > params.dcAway;
    const marketPredictsHome = params.impliedHome > params.impliedAway;
    const finalPredictsHome = params.finalHome > params.finalAway;
    
    if (dcPredictsHome !== marketPredictsHome) {
      score += 20;
      issues.push('Les modèles prédisent des résultats opposés');
    }
  }
  
  // 2. Edge fragile: l'edge est-il porté par un seul facteur?
  const contextContribution = Math.abs(params.contextAdjustment);
  const mlContribution = Math.abs(params.mlAdjustment);
  const totalAdjustment = contextContribution + mlContribution;
  
  if (totalAdjustment > 0.08 && params.edge > 0) {
    // L'edge est principalement dû aux ajustements, pas au marché
    const adjustmentRatio = totalAdjustment / (params.edge + 0.001);
    if (adjustmentRatio > 0.7) {
      fragileEdge = true;
      score += 25;
      issues.push('Edge fragile: porté principalement par les ajustements contexte/ML');
    }
  }
  
  // 3. Match trop imprévisible (probas trop rapprochées)
  const probs = [params.finalHome, params.finalAway];
  if (params.finalDraw > 0) probs.push(params.finalDraw);
  
  const sortedProbs = [...probs].sort((a, b) => b - a);
  const probGap = sortedProbs[0] - sortedProbs[1]; // Écart entre 1er et 2ème
  
  if (probGap < 0.05) {
    tooClose = true;
    score += 20;
    issues.push('Match très imprévisible (écart < 5%)');
  } else if (probGap < 0.10) {
    score += 10;
  }
  
  // 4. Qualité des données faible + edge élevé = suspect
  if (params.dataQuality < 30 && params.edge > 0.08) {
    score += 25;
    issues.push('Edge élevé avec données de mauvaise qualité - signal suspect');
    fragileEdge = true;
  }
  
  // 5. Sur-réaction aux blessures
  if (Math.abs(params.injuryImpact) > 8 && params.dataQuality < 50) {
    score += 15;
    issues.push('Impact blessures élevé avec peu de données contextuelles');
  }
  
  // 6. Ligues mineures = plus de bruit inhérent
  const minorLeagueKeywords = ['2.', '3.', 'b', 'reserve', 'youth', 'cup', 'coupe', 'friendl'];
  const leagueLower = params.league.toLowerCase();
  if (minorLeagueKeywords.some(k => leagueLower.includes(k))) {
    score += 10;
    issues.push('Compétition mineure - bruit inhérent plus élevé');
  }
  
  return {
    score: Math.min(100, score),
    issues,
    modelDisagreement: Math.min(100, modelDisagreement),
    fragileEdge,
    tooClose,
  };
}

// ============================================
// FILTRAGE DES BLESSURES
// ============================================

/**
 * Évalue la fiabilité des données de blessures
 */
export function assessInjuryNoise(params: {
  homeInjuries: number;
  awayInjuries: number;
  homeImpact: number;
  awayImpact: number;
  injurySource: string;
  hasKeyAbsentees: boolean;
  keyAbsenteeCount: number;
  /** Les blessures sont-elles corroborées par les news web? */
  newsCorroboration: {
    homeInjuriesFromNews: number;
    awayInjuriesFromNews: number;
  };
}): InjuryNoiseAssessment {
  const issues: string[] = [];
  let score = 0;
  
  // 1. Source des blessures
  if (params.injurySource === 'None') {
    score += 30;
    issues.push('Aucune source de blessures disponible');
  }
  
  // 2. Incohérence: beaucoup de blessures signalées mais aucune par les news
  const totalInjuries = params.homeInjuries + params.awayInjuries;
  const totalNewsInjuries = params.newsCorroboration.homeInjuriesFromNews + params.newsCorroboration.awayInjuriesFromNews;
  
  if (totalInjuries > 3 && totalNewsInjuries === 0) {
    score += 20;
    issues.push(`${totalInjuries} blessures listées mais aucune mention dans les news`);
  }
  
  // 3. Impact très asymétrique = suspect (sauf si confirmé)
  const impactDiff = Math.abs(params.homeImpact - params.awayImpact);
  if (impactDiff > 10 && !params.hasKeyAbsentees) {
    score += 15;
    issues.push('Impact blessures très asymétrique sans joueur clé absent');
  }
  
  // 4. Trop de blessures = possible mauvaise donnée
  if (totalInjuries > 8) {
    score += 10;
    issues.push('Nombre de blessures inhabituellement élevé');
  }
  
  return {
    score: Math.min(100, score),
    issues,
    crossValidated: totalNewsInjuries > 0 && params.injurySource !== 'None',
    inconsistencies: issues,
  };
}

// ============================================
// FILTRAGE DES DONNÉES DE FORME
// ============================================

/**
 * Évalue la fiabilité des données de forme
 */
export function assessFormNoise(params: {
  homeFormPoints: number | null;
  awayFormPoints: number | null;
  homeXG: number | null;
  awayXG: number | null;
  impliedHome: number;
  impliedAway: number;
  hasForm: boolean;
  formMatchesCount?: number;
}): FormDataNoiseAssessment {
  const issues: string[] = [];
  let score = 0;
  let smallSampleSize = false;
  let contradictsOdds = false;
  
  // 1. Pas de données de forme
  if (!params.hasForm) {
    score += 20;
    issues.push('Aucune donnée de forme disponible');
  }
  
  // 2. Échantillon trop petit
  if (params.formMatchesCount !== undefined && params.formMatchesCount < 5) {
    smallSampleSize = true;
    score += 15;
    issues.push('Forme basée sur < 5 matchs');
  }
  
  // 3. Contradiction forte entre forme et cotes
  if (params.homeFormPoints !== null && params.awayFormPoints !== null) {
    const formAdvantage = params.homeFormPoints - params.awayFormPoints;
    const oddsAdvantage = params.impliedHome - params.impliedAway;
    
    // Si la forme dit l'inverse des cotes fortement
    if (formAdvantage > 20 && oddsAdvantage < -0.05) {
      contradictsOdds = true;
      score += 20;
      issues.push('Forme et cotes fortement contradictoires');
    } else if (formAdvantage < -20 && oddsAdvantage > 0.05) {
      contradictsOdds = true;
      score += 20;
      issues.push('Forme et cotes fortement contradictoires');
    }
  }
  
  // 4. xG vs forme incohérents
  if (params.homeXG !== null && params.homeFormPoints !== null) {
    const xGDirection = params.homeXG > 0 ? 1 : -1;
    const formDirection = params.homeFormPoints > 50 ? 1 : -1;
    if (xGDirection !== formDirection && Math.abs(params.homeXG) > 0.5) {
      score += 10;
      issues.push('xG et forme pointent dans des directions opposées');
    }
  }
  
  return {
    score: Math.min(100, score),
    issues,
    smallSampleSize,
    contradictsOdds,
  };
}

// ============================================
// ÉVALUATION GLOBALE DU BRUIT
// ============================================

/**
 * Évalue le bruit global pour un match et détermine l'impact sur la prédiction
 * 
 * C'est la fonction principale à appeler depuis unifiedPredictionService
 */
export function assessOverallNoise(params: {
  // News
  filteredNewsHome: FilteredNewsItem[];
  filteredNewsAway: FilteredNewsItem[];
  // Prédiction
  impliedHome: number;
  impliedAway: number;
  impliedDraw: number;
  dcHome?: number;
  dcAway?: number;
  dcDraw?: number;
  finalHome: number;
  finalAway: number;
  finalDraw: number;
  edge: number;
  dataQuality: number;
  contextAdjustment: number;
  mlAdjustment: number;
  injuryImpact: number;
  league: string;
  sport: string;
  // Blessures
  homeInjuries: number;
  awayInjuries: number;
  homeInjuryImpact: number;
  awayInjuryImpact: number;
  injurySource: string;
  hasKeyAbsentees: boolean;
  keyAbsenteeCount: number;
  newsCorroboratedInjuries: { home: number; away: number };
  // Forme
  homeFormPoints: number | null;
  awayFormPoints: number | null;
  homeXG: number | null;
  awayXG: number | null;
  hasForm: boolean;
  formMatchesCount?: number;
}): NoiseAssessment {
  // Évaluer chaque catégorie
  const newsAssessment = assessNewsNoise(params.filteredNewsHome, params.filteredNewsAway);
  
  const predictionAssessment = assessPredictionNoise({
    impliedHome: params.impliedHome,
    impliedAway: params.impliedAway,
    impliedDraw: params.impliedDraw,
    dcHome: params.dcHome,
    dcAway: params.dcAway,
    dcDraw: params.dcDraw,
    finalHome: params.finalHome,
    finalAway: params.finalAway,
    finalDraw: params.finalDraw,
    edge: params.edge,
    dataQuality: params.dataQuality,
    contextAdjustment: params.contextAdjustment,
    mlAdjustment: params.mlAdjustment,
    injuryImpact: params.injuryImpact,
    league: params.league,
    sport: params.sport,
  });
  
  const injuryAssessment = assessInjuryNoise({
    homeInjuries: params.homeInjuries,
    awayInjuries: params.awayInjuries,
    homeImpact: params.homeInjuryImpact,
    awayImpact: params.awayInjuryImpact,
    injurySource: params.injurySource,
    hasKeyAbsentees: params.hasKeyAbsentees,
    keyAbsenteeCount: params.keyAbsenteeCount,
    newsCorroboration: {
      homeInjuriesFromNews: params.newsCorroboratedInjuries.home,
      awayInjuriesFromNews: params.newsCorroboratedInjuries.away,
    },
  });
  
  const formAssessment = assessFormNoise({
    homeFormPoints: params.homeFormPoints,
    awayFormPoints: params.awayFormPoints,
    homeXG: params.homeXG,
    awayXG: params.awayXG,
    impliedHome: params.impliedHome,
    impliedAway: params.impliedAway,
    hasForm: params.hasForm,
    formMatchesCount: params.formMatchesCount,
  });
  
  // Score global pondéré
  const globalNoiseScore = Math.min(100,
    newsAssessment.score * 0.25 +
    predictionAssessment.score * 0.40 +
    injuryAssessment.score * 0.20 +
    formAssessment.score * 0.15
  );
  
  // Collecter tous les facteurs de bruit
  const allNoiseFactors = [
    ...newsAssessment.issues,
    ...predictionAssessment.issues,
    ...injuryAssessment.issues,
    ...formAssessment.issues,
  ];
  
  // Déterminer le niveau
  let level: NoiseAssessment['level'] = 'clean';
  if (globalNoiseScore >= 50) level = 'high';
  else if (globalNoiseScore >= 30) level = 'medium';
  else if (globalNoiseScore >= 15) level = 'low';
  
  // Calculer les multiplicateurs
  let confidenceMultiplier = 1.0;
  let kellyMultiplier = 1.0;
  let shouldReject = false;
  let rejectionReason: string | undefined;
  
  switch (level) {
    case 'high':
      confidenceMultiplier = 0.6;
      kellyMultiplier = 0.2;
      if (predictionAssessment.fragileEdge || predictionAssessment.modelDisagreement > 60) {
        shouldReject = true;
        rejectionReason = 'Signal trop bruité pour recommander un pari';
      }
      break;
    case 'medium':
      confidenceMultiplier = 0.80;
      kellyMultiplier = 0.5;
      break;
    case 'low':
      confidenceMultiplier = 0.92;
      kellyMultiplier = 0.75;
      break;
    case 'clean':
      confidenceMultiplier = 1.0;
      kellyMultiplier = 1.0;
      break;
  }
  
  // Règles de rejet additionnelles
  // 1. Match trop imprévisible + données mauvaises = reject
  if (predictionAssessment.tooClose && params.dataQuality < 35) {
    shouldReject = true;
    rejectionReason = 'Match imprévisible avec données insuffisantes';
  }
  
  // 2. News filtrées à 100% mais des alertes existaient = reject si impact
  if (newsAssessment.filteredCount > 3 && newsAssessment.keptCount === 0) {
    kellyMultiplier *= 0.5;
  }
  
  // 3. Forme et cotes contradictoires + edge fragile = reject
  if (formAssessment.contradictsOdds && predictionAssessment.fragileEdge) {
    shouldReject = true;
    rejectionReason = 'Données contradictoires avec edge fragile';
  }
  
  return {
    noiseScore: Math.round(globalNoiseScore * 10) / 10,
    level,
    details: {
      news: newsAssessment,
      prediction: predictionAssessment,
      injuries: injuryAssessment,
      formData: formAssessment,
    },
    noiseFactors: allNoiseFactors,
    confidenceMultiplier: Math.round(confidenceMultiplier * 100) / 100,
    kellyMultiplier: Math.round(kellyMultiplier * 100) / 100,
    shouldReject,
    rejectionReason,
  };
}

// ============================================
// EXPORTS
// ============================================

const NoiseFilterService = {
  filterNewsItems,
  assessNewsNoise,
  assessPredictionNoise,
  assessInjuryNoise,
  assessFormNoise,
  assessOverallNoise,
};

export default NoiseFilterService;