/**
 * Test Pipeline ML Complet
 * Vérifie que le pipeline ML fonctionne sans erreur pour tous les sports
 */

import { getAdaptiveThresholds, calculateMLAdjustment, type FeatureVector } from '../src/lib/adaptiveThresholdsML';
import { scoreWithXGBoost, loadMLModel, getXGBoostStatus } from '../src/lib/unifiedMLService';

const SPORTS = ['football', 'basketball', 'hockey', 'baseball'];

function createTestFeatureVector(sport: string, edge: number): FeatureVector {
  return {
    edge: Math.max(0, edge),
    dataQuality: 65,
    homeInjuries: 1,
    awayInjuries: 2,
    homeFormScore: 55,
    awayFormScore: 45,
    homeXG: 0.3,
    awayXG: -0.1,
    homeNetRating: sport === 'basketball' ? 3.5 : 0,
    awayNetRating: sport === 'basketball' ? -1.2 : 0,
    confidence: 0.6,
    homeWinProbability: 0.6,
    awayWinProbability: 0.35,
    drawProbability: sport === 'football' ? 0.25 : 0,
  };
}

const errors: string[] = [];
const warnings: string[] = [];

async function main() {
  console.log('══════════════════════════════════════════════════');
  console.log('  TEST PIPELINE ML COMPLET');
  console.log('══════════════════════════════════════════════════\n');

  // TEST 1: getAdaptiveThresholds pour chaque sport
  console.log('📝 TEST 1: getAdaptiveThresholds');
  for (const sport of SPORTS) {
    try {
      const thresholds = getAdaptiveThresholds(sport);
      if (thresholds.edgeThreshold <= 0 || thresholds.edgeThreshold > 0.2) {
        warnings.push(`[${sport}] edgeThreshold suspect: ${thresholds.edgeThreshold}`);
      }
      if (!thresholds.confidenceWeights || !thresholds.confidenceWeights.very_high) {
        errors.push(`[${sport}] confidenceWeights manquantes`);
      }
      console.log(`  ✅ ${sport}: edge_threshold=${thresholds.edgeThreshold}, injury_factor=${thresholds.injuryImpactFactor}, form_weight=${thresholds.formWeight}`);
    } catch (e: any) {
      errors.push(`[${sport}] getAdaptiveThresholds ERROR: ${e.message}`);
    }
  }

  // TEST 2: calculateMLAdjustment pour chaque sport (avec edge non-nul)
  console.log('\n📝 TEST 2: calculateMLAdjustment (edge=0.08)');
  for (const sport of SPORTS) {
    try {
      const fv = createTestFeatureVector(sport, 0.08);
      const result = await calculateMLAdjustment(fv, sport);
      if (Math.abs(result.probabilityAdjustment) > 0.2) {
        warnings.push(`[${sport}] probabilityAdjustment trop grand: ${result.probabilityAdjustment}`);
      }
      console.log(`  ✅ ${sport}: prob_adj=${result.probabilityAdjustment.toFixed(4)}, conf_adj=${result.confidenceAdjustment.toFixed(4)}, xgb=${result.xgboostUsed}, score=${result.xgboostScore?.toFixed(3) || 'N/A'}`);
    } catch (e: any) {
      errors.push(`[${sport}] calculateMLAdjustment ERROR: ${e.message}`);
    }
  }

  // TEST 3: calculateMLAdjustment avec edge=0 (Correction 1 - ne doit pas crasher)
  console.log('\n📝 TEST 3: calculateMLAdjustment (edge=0 — Correction 1)');
  for (const sport of SPORTS) {
    try {
      const fv = createTestFeatureVector(sport, 0);
      const result = await calculateMLAdjustment(fv, sport);
      console.log(`  ✅ ${sport}: prob_adj=${result.probabilityAdjustment.toFixed(4)} (edge=0 OK)`);
    } catch (e: any) {
      errors.push(`[${sport}] edge=0 ERROR: ${e.message}`);
    }
  }

  // TEST 4: loadMLModel depuis Supabase
  console.log('\n📝 TEST 4: loadMLModel (Supabase)');
  try {
    const model = await loadMLModel();
    console.log(`  ✅ Modèle v${model.version} chargé: ${model.samples_used} samples, ${model.accuracy}% accuracy`);

    // TEST 5: getXGBoostStatus
    console.log('\n📝 TEST 5: getXGBoostStatus');
    const xgbStatus = getXGBoostStatus(model);
    console.log(`  ✅ XGBoost trained: ${xgbStatus.trained}, samples: ${xgbStatus.totalSamples}, CV accuracy: ${xgbStatus.globalCvAccuracy}`);

    if (xgbStatus.sports.length > 0) {
      console.log(`  📊 Sports entraînés:`);
      for (const s of xgbStatus.sports) {
        console.log(`     - ${s.sport}: CV=${s.cvAccuracy}, samples=${s.samples}, features=[${s.topFeatures.join(', ')}]`);
      }
    } else {
      console.log(`  ⚠️ Aucun sport avec modèle XGBoost entraîné — utilisation heuristiques`);
    }

    // TEST 6: scoreWithXGBoost pour chaque sport
    console.log('\n📝 TEST 6: scoreWithXGBoost');
    for (const sport of SPORTS) {
      try {
        const features: Record<string, number> = {
          prob_home: 0.6,
          prob_away: 0.35,
          prob_draw: sport === 'football' ? 0.25 : 0,
          is_home_favorite: 1,
          confidence_numeric: 0.75,
          pred_matches_favorite: 1,
          favorite_strength: 0.25,
          odds_ratio: 0.6 / 0.35,
          log_odds_ratio: Math.log(0.6 / 0.35),
          odds_confidence: 0.45,
          favorite_confidence: 0.1875,
          [`is_${sport}`]: 1,
          draw_signal: sport === 'football' ? 0.25 : 0,
          edge: 0.08,
        };

        const result = scoreWithXGBoost(sport, features, model);
        console.log(`  ✅ ${sport}: score=${result.score.toFixed(3)}, xgb_trained=${result.isXGBoostTrained}, cv=${result.cvAccuracy}, threshold=${result.confidenceThreshold}`);

        if (result.isXGBoostTrained) {
          console.log(`     💡 ${result.recommendation}`);
          if (result.featureContributions.length > 0) {
            const top3 = result.featureContributions.slice(0, 3);
            console.log(`     🔬 Top features: ${top3.map(f => `${f.feature}=${f.value.toFixed(3)} (${f.weight.toFixed(4)})`).join(', ')}`);
          }
        }
      } catch (e: any) {
        errors.push(`[${sport}] scoreWithXGBoost ERROR: ${e.message}`);
      }
    }

    // TEST 7: Vérifier que le tennis n'est PAS dans les sports XGBoost
    console.log('\n📝 TEST 7: Vérification exclusion tennis');
    const xgbSports = Object.keys(model.xgboost_params?.sports || {});
    const hasTennis = xgbSports.includes('tennis');
    if (hasTennis) {
      warnings.push('⚠️ Tennis trouvé dans les sports XGBoost — devrait être exclu');
    } else {
      console.log('  ✅ Tennis absent des sports XGBoost');
    }

  } catch (e: any) {
    errors.push(`loadMLModel ERROR: ${e.message}`);
    console.log(`  ❌ Erreur chargement modèle: ${e.message}`);
  }

  // BILAN
  console.log('\n══════════════════════════════════════════════════');
  console.log('  BILAN');
  console.log('══════════════════════════════════════════════════');
  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ TOUS LES TESTS PASSÉS — Pipeline ML sans erreur');
  } else {
    if (errors.length > 0) {
      console.log(`❌ ${errors.length} ERREUR(S):`);
      errors.forEach(e => console.log(`   ${e}`));
    }
    if (warnings.length > 0) {
      console.log(`⚠️ ${warnings.length} AVERTISSEMENT(S):`);
      warnings.forEach(w => console.log(`   ${w}`));
    }
  }
  console.log('══════════════════════════════════════════════════');
}

main();
