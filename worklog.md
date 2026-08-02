---
Task ID: 1
Agent: Main Agent
Task: Phase 4 Pipeline — Isotonic Regression + CLV Market Alignment + Brier Score

Work Log:
- Explored full codebase: unifiedMLService.ts, adaptiveThresholdsML.ts, oddsTrackingService.ts, unifiedPredictionService.ts, train_xgboost.py
- Identified 6 critical gaps: no runtime calibration, CLV not fed back, no calibration table, no isotonic regression, features not stored, ml_model not in schema
- Created `src/lib/calibrationService.ts` (~470 lines): Isotonic Regression with PAVA, Platt scaling, Brier score computation, live calibration reports, Supabase integration with 10-min cache
- Created `src/lib/marketAlignmentService.ts` (~250 lines): CLV-weighted probability adjustment, steam detection, market signal classification (confirming/contradicting/neutral), batch alignment support
- Integrated both services into `unifiedPredictionService.ts`:
  - Step 8.5: Isotonic Calibration after XGBoost scoring
  - Step 11.5: CLV Market Alignment after bestBet determination
  - Added `calibrated`/`calibrationMethod` to mlPrediction output
  - Added `marketAlignment` object to UnifiedPrediction interface
  - CLV reasoning lines added to prediction output
- Updated `train_xgboost.py`: Export Platt A/B coefficients (platt_a, platt_b) from CalibratedClassifierCV for TypeScript runtime use
- Created `scripts/migration_phase4_calibration.sql`: prediction_outcomes table + odds_history DDL + RLS policies
- TypeScript build: 0 errors
- Python syntax: valid

Stage Summary:
- Pipeline complet implémenté: XGBoost → Calibration (Platt/Isotonic) → CLV Market Alignment → Brier Score
- 2 nouveaux services: calibrationService.ts, marketAlignmentService.ts
- 1 fichier modifié: unifiedPredictionService.ts (étapes 8.5 + 11.5)
- 1 fichier modifié: train_xgboost.py (export Platt coefficients)
- 1 migration SQL: prediction_outcomes table
- Build: ✅ 0 erreurs TypeScript, ✅ Python valide

---
Task ID: 2
Agent: Main Agent
Task: Phase 4 — Préparation migration + training deployment

Work Log:
- Tentative d'exécution directe migration SQL: DNS Supabase (aumsrakioetvvqopthbs.supabase.co) retourne NXDOMAIN
- Créé API route /api/migrate-phase4 pour vérifier les tables depuis Vercel (avec vrais env vars)
- API route vérifie existence de prediction_outcomes, odds_history, ml_model via REST
- Si tables manquantes: retourne le SQL à exécuter + instructions
- Si tables existantes: insert test record pour validation
- Créé script run-migration-and-training.sh en 3 étapes:
  1. Vérification via API Vercel
  2. Migration SQL dans Supabase Dashboard (si nécessaire)
  3. Training Python (coefficients Platt)
- Build TypeScript: 0 erreurs

Stage Summary:
- API route: src/app/api/migrate-phase4/route.ts
- Script: scripts/run-migration-and-training.sh
- Migration SQL: scripts/migration_phase4_calibration.sql
- Le DNS Supabase ne résout pas depuis cet env → doit être exécuté depuis un terminal avec accès
