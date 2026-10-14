/**
 * Script d'Entraînement du Modèle ML
 * 
 * Ce script entraîne le modèle ML avec les prédictions résolues.
 * Doit être exécuté APRÈS check-results.ts
 * 
 * Exécution: bun run scripts/train-ml.ts
 * Cron: Tous les jours à 7h30 GMT (après vérification résultats)
 */

import * as fs from 'fs';
import * as path from 'path';

// Chemins
const ML_MODEL_FILE = path.join(process.cwd(), 'data/ml_model.json');
const PREDICTIONS_FILE = path.join(process.cwd(), 'data/predictions.json');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = 'steohidy/my-project';

// Interfaces
interface Prediction {
  id: string;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  matchDate: string;
  predictedResult: string;
  predictedGoals?: string | null;
  confidence: string;
  riskPercentage: number;
  homeScore?: number;
  awayScore?: number;
  actualResult?: string;
  status: 'pending' | 'completed';
  resultMatch?: boolean;
  goalsMatch?: boolean;
}

interface MLThresholds {
  edgeThreshold: number;
  injuryImpactFactor: number;
  formWeight: number;
  xgWeight: number;
  netRatingWeight: number;
  confidenceWeights: {
    very_high: number;
    high: number;
    medium: number;
    low: number;
  };
  minDataQuality: number;
  version: string;
  lastUpdated: string;
  samplesUsed: number;
  accuracy: number;
}

interface MLModel {
  thresholds: MLThresholds;
  featureWeights: Record<string, number>;
  sportAdjustments: Record<string, Partial<MLThresholds>>;
  confidence: number;
  trainingHistory: Array<{
    date: string;
    samples: number;
    accuracy: number;
  }>;
}

// Seuils par défaut
const DEFAULT_THRESHOLDS: MLThresholds = {
  edgeThreshold: 0.03,
  injuryImpactFactor: 1.0,
  formWeight: 0.05,
  xgWeight: 0.03,
  netRatingWeight: 0.03,
  confidenceWeights: {
    very_high: 0.5,
    high: 0.4,
    medium: 0.25,
    low: 0.1,
  },
  minDataQuality: 50,
  version: '1.0.0',
  lastUpdated: '',
  samplesUsed: 0,
  accuracy: 0,
};

/**
 * Charge le modèle ML existant
 */
function loadModel(): MLModel {
  if (!fs.existsSync(ML_MODEL_FILE)) {
    return {
      thresholds: { ...DEFAULT_THRESHOLDS, lastUpdated: new Date().toISOString() },
      featureWeights: {
        edge: 0.25,
        dataQuality: 0.20,
        injuries: 0.15,
        form: 0.15,
        xG: 0.10,
        netRating: 0.10,
        confidence: 0.05,
      },
      sportAdjustments: {},
      confidence: 0.5,
      trainingHistory: [],
    };
  }
  
  return JSON.parse(fs.readFileSync(ML_MODEL_FILE, 'utf-8'));
}

/**
 * Charge les prédictions
 */
function loadPredictions(): Prediction[] {
  if (!fs.existsSync(PREDICTIONS_FILE)) {
    return [];
  }
  
  const data = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf-8'));
  return data.predictions || [];
}

/**
 * Sauvegarde le modèle
 */
function saveModel(model: MLModel): void {
  fs.writeFileSync(ML_MODEL_FILE, JSON.stringify(model, null, 2));
}

/**
 * Entraîne le modèle avec les prédictions résolues
 */
function trainModel(): { success: boolean; samplesUsed: number; accuracy: number; message: string } {
  console.log('🧠 Début de l\'entraînement ML...\n');
  
  // Charger les données
  const predictions = loadPredictions();
  const resolved = predictions.filter(p => p.status === 'completed' && p.resultMatch !== undefined);
  
  console.log(`📊 ${predictions.length} prédictions totales`);
  console.log(`✅ ${resolved.length} prédictions résolues\n`);
  
  if (resolved.length < 20) {
    console.log('⚠️ Pas assez de données pour l\'entraînement (minimum 20 requises)');
    return {
      success: false,
      samplesUsed: resolved.length,
      accuracy: 0,
      message: 'Pas assez de données',
    };
  }
  
  // Charger le modèle existant
  const model = loadModel();
  
  // Calculer l'accuracy globale
  const correctPredictions = resolved.filter(p => p.resultMatch === true);
  const accuracy = Math.round((correctPredictions.length / resolved.length) * 100);
  
  console.log(`📈 Accuracy actuelle: ${accuracy}% (${correctPredictions.length}/${resolved.length})\n`);
  
  // Analyser par niveau de confiance
  const byConfidence = {
    very_high: resolved.filter(p => p.confidence === 'very_high'),
    high: resolved.filter(p => p.confidence === 'high'),
    medium: resolved.filter(p => p.confidence === 'medium'),
    low: resolved.filter(p => p.confidence === 'low'),
  };
  
  console.log('📊 Performance par niveau de confiance:');
  for (const [level, preds] of Object.entries(byConfidence)) {
    if (preds.length > 0) {
      const correct = preds.filter(p => p.resultMatch === true).length;
      const levelAccuracy = Math.round((correct / preds.length) * 100);
      console.log(`   ${level}: ${levelAccuracy}% (${correct}/${preds.length})`);
      
      // Ajuster les poids de confiance
      const optimalWeight = 0.3 + (levelAccuracy / 100 - 0.5) * 0.6;
      model.thresholds.confidenceWeights[level as keyof typeof byConfidence] = 
        Math.max(0.1, Math.min(0.7, optimalWeight));
    }
  }
  
  // Analyser par sport
  console.log('\n📊 Performance par sport:');
  const sports = ['Foot', 'Basket'];
  for (const sport of sports) {
    const sportPreds = resolved.filter(p => p.sport === sport);
    if (sportPreds.length > 0) {
      const correct = sportPreds.filter(p => p.resultMatch === true).length;
      const sportAccuracy = Math.round((correct / sportPreds.length) * 100);
      console.log(`   ${sport}: ${sportAccuracy}% (${correct}/${sportPreds.length})`);
      
      // Ajustements par sport
      if (sportAccuracy > 60) {
        model.sportAdjustments[sport.toLowerCase()] = {
          edgeThreshold: Math.max(0.02, model.thresholds.edgeThreshold - 0.005),
        };
      } else if (sportAccuracy < 50) {
        model.sportAdjustments[sport.toLowerCase()] = {
          edgeThreshold: Math.min(0.08, model.thresholds.edgeThreshold + 0.01),
        };
      }
    }
  }
  
  // Analyser les goals predictions
  const withGoals = resolved.filter(p => p.goalsMatch !== undefined);
  if (withGoals.length > 0) {
    const correctGoals = withGoals.filter(p => p.goalsMatch === true).length;
    const goalsAccuracy = Math.round((correctGoals / withGoals.length) * 100);
    console.log(`\n⚽ Prédictions buts: ${goalsAccuracy}% (${correctGoals}/${withGoals.length})`);
  }
  
  // Optimiser le seuil d'edge
  console.log('\n🔧 Optimisation du seuil d\'edge...');
  let bestThreshold = model.thresholds.edgeThreshold;
  let bestAccuracy = accuracy;
  
  for (let threshold = 0.02; threshold <= 0.08; threshold += 0.005) {
    const aboveThreshold = resolved.filter(p => p.riskPercentage <= (1 - threshold) * 100);
    if (aboveThreshold.length >= 10) {
      const correct = aboveThreshold.filter(p => p.resultMatch === true).length;
      const thresholdAccuracy = correct / aboveThreshold.length;
      if (thresholdAccuracy > bestAccuracy / 100) {
        bestAccuracy = Math.round(thresholdAccuracy * 100);
        bestThreshold = threshold;
      }
    }
  }
  
  if (bestThreshold !== model.thresholds.edgeThreshold) {
    console.log(`   Seuil optimisé: ${bestThreshold.toFixed(3)} (was ${model.thresholds.edgeThreshold.toFixed(3)})`);
    model.thresholds.edgeThreshold = bestThreshold;
  }
  
  // Mettre à jour le modèle
  model.thresholds.lastUpdated = new Date().toISOString();
  model.thresholds.samplesUsed = resolved.length;
  model.thresholds.accuracy = bestAccuracy;
  model.thresholds.version = incrementVersion(model.thresholds.version);
  model.confidence = Math.min(0.95, 0.5 + (resolved.length / 500));
  
  // Ajouter à l'historique
  model.trainingHistory.push({
    date: new Date().toISOString(),
    samples: resolved.length,
    accuracy: bestAccuracy,
  });
  
  // Garder seulement les 50 derniers
  if (model.trainingHistory.length > 50) {
    model.trainingHistory = model.trainingHistory.slice(-50);
  }
  
  // Sauvegarder
  saveModel(model);
  
  console.log(`\n✅ Modèle ML entraîné avec succès!`);
  console.log(`   - Version: ${model.thresholds.version}`);
  console.log(`   - Samples: ${resolved.length}`);
  console.log(`   - Accuracy: ${bestAccuracy}%`);
  console.log(`   - Confiance: ${(model.confidence * 100).toFixed(0)}%`);
  
  return {
    success: true,
    samplesUsed: resolved.length,
    accuracy: bestAccuracy,
    message: 'Entraînement réussi',
  };
}

function incrementVersion(version: string): string {
  const parts = version.split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1;
  return parts.join('.');
}

/**
 * Sauvegarde sur GitHub
 */
async function saveToGitHub(): Promise<boolean> {
  if (!GITHUB_TOKEN) {
    console.log('⚠️ GITHUB_TOKEN non configuré - sauvegarde locale uniquement');
    return false;
  }
  
  try {
    const getRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/data/ml_model.json`,
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );
    
    let sha = '';
    if (getRes.ok) {
      const fileInfo = await getRes.json();
      sha = fileInfo.sha;
    }
    
    const model = fs.readFileSync(ML_MODEL_FILE, 'utf-8');
    const content = Buffer.from(model).toString('base64');
    
    const saveRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/data/ml_model.json`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `🧠 ML Training ${new Date().toLocaleDateString('fr-FR')}`,
          content,
          sha: sha || undefined,
          branch: 'master'
        })
      }
    );
    
    if (saveRes.ok) {
      console.log('📤 Modèle ML sauvegardé sur GitHub');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Erreur sauvegarde GitHub:', error);
    return false;
  }
}

// Exécuter
async function main() {
  const result = trainModel();
  
  if (result.success) {
    await saveToGitHub();
  }
}

main().catch(console.error);
