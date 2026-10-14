#!/bin/bash
# Apply fixes #1, #2, #3 to the pipeline
echo "Applying FIX #1 (edge=0), FIX #2 (train all sports), FIX #3 (Supabase persistence)"

cd /home/z/my-project

# FIX #1: unifiedPredictionService.ts - preliminary edge before ML adjustment
# Replace the featureVector construction and calculateMLAdjustment call

echo "  Applying FIX #1 to unifiedPredictionService.ts..."

# First, apply FIX #1: replace edge=0 with preliminary edge calculation
python3 -c "
import re

filepath = 'src/lib/unifiedPredictionService.ts'
with open(filepath, 'r') as f:
    content = f.read()

# Replace edge=0 placeholder with preliminary edge calculation
old = '''  // 7. Build feature vector for ML
  // FIX C2: L'edge initial est un placeholder — recalculé après combinaison (step 10)
  const featureVector: FeatureVector = {
    edge: 0, // sera mis à jour après le calcul des probas finales
    dataQuality: context?.unifiedAnalysis.dataQuality || 30,
    homeInjuries: context?.injuries.home.length || 0,
    awayInjuries: context?.injuries.away.length || 0,
    homeFormScore: context?.fbref?.homeForm?.formPoints || 50,
    awayFormScore: context?.fbref?.awayForm?.formPoints || 50,
    homeXG: context?.fbref?.homeXG?.xGDPer90 || 0,
    awayXG: context?.fbref?.awayXG?.xGDPer90 || 0,
    homeNetRating: context?.nba?.homeStats?.netRating || 0,
    awayNetRating: context?.nba?.awayStats?.netRating || 0,
    confidence: 0.5,
    homeWinProbability: impliedHome,
    awayWinProbability: impliedAway,
    drawProbability: impliedDraw,
  };
  
  // 8. Calculate ML adjustment (async - includes XGBoost if trained)
  const mlAdjustment = await calculateMLAdjustment(featureVector, sportType);'''

new = '''  // 7. Build feature vector for ML
  // FIX #1: Calculer un edge préliminaire AVANT calculateMLAdjustment
  // L'edge préliminaire = désaccord entre Dixon-Coles (ou context) et le marché
  let preliminaryEdge = 0;
  let preliminaryHomeProb = impliedHome;
  let preliminaryAwayProb = impliedAway;
  let preliminaryDrawProb = impliedDraw;
  
  if (match.sport === 'Foot' && dixonColesResult) {
    preliminaryHomeProb = dcHomeProb;
    preliminaryAwayProb = dcAwayProb;
    preliminaryDrawProb = dcDrawProb;
    preliminaryEdge = Math.max(
      Math.abs(dcHomeProb - impliedHome),
      Math.abs(dcAwayProb - impliedAway),
      Math.abs(dcDrawProb - impliedDraw)
    );
  } else {
    preliminaryHomeProb = impliedHome + contextAdjustment.homeAdjustment;
    preliminaryAwayProb = impliedAway + contextAdjustment.awayAdjustment;
    preliminaryEdge = Math.max(
      Math.abs(contextAdjustment.homeAdjustment),
      Math.abs(contextAdjustment.awayAdjustment)
    );
  }
  
  const featureVector: FeatureVector = {
    edge: Math.max(0, preliminaryEdge), // FIX #1: edge réel avant ML adjustment
    dataQuality: context?.unifiedAnalysis.dataQuality || 30,
    homeInjuries: context?.injuries.home.length || 0,
    awayInjuries: context?.injuries.away.length || 0,
    homeFormScore: context?.fbref?.homeForm?.formPoints || 50,
    awayFormScore: context?.fbref?.awayForm?.formPoints || 50,
    homeXG: context?.fbref?.homeXG?.xGDPer90 || 0,
    awayXG: context?.fbref?.awayXG?.xGDPer90 || 0,
    homeNetRating: context?.nba?.homeStats?.netRating || 0,
    awayNetRating: context?.nba?.awayStats?.netRating || 0,
    confidence: 0.5,
    homeWinProbability: preliminaryHomeProb,
    awayWinProbability: preliminaryAwayProb,
    drawProbability: preliminaryDrawProb,
  };
  
  // 8. Calculate ML adjustment (async - includes XGBoost if trained)
  const mlAdjustment = await calculateMLAdjustment(featureVector, sportType);'''

if old in content:
    content = content.replace(old, new)
    with open(filepath, 'w') as f:
        f.write(content)
    print('    FIX #1 applied to unifiedPredictionService.ts')
else:
    print('    WARNING: Could not find old text in unifiedPredictionService.ts')
    print('    Trying alternative...')
    # Check if already applied
    if 'preliminaryEdge' in content:
        print('    FIX #1 already applied!')
"

echo "  Fix #1 done."

echo "All fixes applied."
