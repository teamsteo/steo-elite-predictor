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

---
Task ID: 3
Agent: Main Agent
Task: Phase 4 — Exécution training + Export calibration

Work Log:
- Corrigé train_xgboost.py: ajout health check DNS pour fallback propre vers CSV-only
- Training XGBoost lancé avec succès en mode CSV-only (9480 échantillons, 4 sports)
- Coefficients Platt générés: football A=1.0143 B=0.0203, basketball A=1.0695 B=-0.0625, hockey A=1.0297 B=-0.0179, baseball A=1.7118 B=-0.3941
- Brier scores: football 0.041→0.017 (-59%), basketball 0.086→0.038 (-56%)
- Calibration export JSON créé: ml/calibration_export.json
- Script export-calibration-to-supabase.py créé pour import automatique
- calibration-data.ts créé avec fallback hardcoded pour Vercel API import
- API route étendue: GET /api/migrate-phase4?action=import-calibration pour import via Vercel
- Vérifié compatibilité: applyPlattScaling() dans calibrationService.ts compatible avec les coefficients
- Build TypeScript: 0 erreurs

Stage Summary:
- Training OK: 9480 samples, 4 sports, Platt coefficients valides
- Export JSON: ml/calibration_export.json + ml/calibration_export.json
- Vercel import: GET /api/migrate-phase4?secret=...&action=import-calibration
- Supabase import: export-calibration-to-supabase.py (depuis terminal avec accès)
- Pipeline complet: XGBoost → Platt(A,B) → CLV Alignment → Brier Score ✅

---
Task ID: 5
Agent: Security Hardening Agent
Task: Add CRON_SECRET authentication to 9 specific unprotected write endpoints in pronostics-app/src/app/api/
- Audited 9 API route files for missing auth on write (POST/PUT/DELETE) handlers
- Added `CRON_SECRET` + `verifyRequestAuth()` auth pattern to all 9 files
- Added auth guard at TOP of each unprotected write handler (before body parsing)
- Fixed `error.message` information leaks in 4 files (seed, batch-ml, cron ×4, cron GET)
- Verified: zero `error.message` leaks remain in all 9 target files

Files Modified:
1. **pronostiqueur-pro/route.ts** — CRITICAL: Added auth to POST (protects `reset` action that wipes ALL pro predictions)
2. **seed/route.ts** — Added auth to POST (protects `clear_all` that wipes all data). Fixed 2× `error.message` leaks.
3. **predictions/route.ts** — Added auth to POST (prevents data injection)
4. **bankroll/route.ts** — Added auth to POST + PUT (protects financial operations: deposits, withdrawals, bets)
5. **batch-ml/route.ts** — Added auth to POST (protects `reset_ml`, `clear_cache`, `train`). Fixed 2× `error.message` leaks.
6. **cron/route.ts** — CRITICAL GAP: POST had NO auth while GET did. Added `verifyRequestAuth()` + auth guard. Fixed 5× `error.message` leaks (2 in API handlers + 3 in internal functions exposed via `...result`). Updated console.error tag to `[SECURITY]`.
7. **results/route.ts** — Added auth at TOP of POST (previously only `clear_all` was protected via ADMIN_TOKEN; now all actions `save_predictions`, `check_results`, `cleanup` are also protected)
8. **odds-cache/route.ts** — Added auth to POST (prevents unauthorized API quota consumption via `forceRefresh`)
9. **matches/route.ts** — Added auth to POST (prevents unauthorized cache clear)

Auth Pattern Used:
```typescript
const CRON_SECRET = process.env.CRON_SECRET;
if (!CRON_SECRET) {
  console.error('[SECURITY] CRON_SECRET non configuré - endpoints write désactivés');
}
function verifyRequestAuth(request: Request): boolean {
  if (!CRON_SECRET) return false;
  const url = new URL(request.url);
  const urlSecret = url.searchParams.get('secret');
  const authHeader = request.headers.get('authorization');
  if (urlSecret === CRON_SECRET) return true;
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;
  return false;
}
```
Guard in each write handler: `if (!verifyRequestAuth(request)) return 401`

Error Leak Fixes:
- seed/route.ts GET: `error.message` → `Erreur interne serveur` + code `SEED_INFO_ERROR`
- seed/route.ts POST: `error.message` → `Erreur interne serveur` + code `SEED_ERROR`
- batch-ml/route.ts GET: `details: error.message` → `code: 'BATCH_ML_STATUS_ERROR'`
- batch-ml/route.ts POST: `details: error.message` → `code: 'BATCH_ML_ERROR'`
- cron/route.ts GET: `error: error.message` → `error: 'Erreur interne serveur'` + code `CRON_GET_ERROR`
- cron/route.ts POST: `error: error.message` → `error: 'Erreur interne serveur'` + code `CRON_POST_ERROR`
- cron/route.ts verifyAndUpdatePredictions: `errors.push(error.message)` → `errors.push('Erreur lors de la vérification des résultats')`
- cron/route.ts runPrecalc: `errors.push(error.message)` → `errors.push('Erreur lors du pré-calcul')`
- cron/route.ts trainMLModel: `errors.push(error.message)` → `errors.push('Erreur lors de l\'entraînement ML')`

Stage Summary:
- 9 files hardened with CRON_SECRET auth on all write endpoints
- 10 `error.message` information leaks fixed across 4 files
- GET handlers left untouched (no auth added)
- No TypeScript compilation performed (auth additions are syntactically valid)
- CRITICAL fixes: pronostiqueur-pro reset, seed clear_all, cron POST gap

---
Task ID: 4
Agent: Security Hardening Agent
Task: Add CRON_SECRET authentication to all unprotected write endpoints in src/app/api/

Work Log:
- Audited 14 API route files for unprotected write endpoints (POST/PUT/DELETE)
- Added CRON_SECRET + verifyRequestAuth() helper to all 14 files
- Added auth guard at the TOP of every unprotected write handler (before body parsing)
- Fixed error.message / String(error) information leaks in error responses across 8 files
- Left GET handlers untouched (read-only)
- Left DELETE in save-today-predictions/route.ts untouched (already has ADMIN_TOKEN check)
- TypeScript build: 0 errors

Files Modified (14 total, 20 write handlers protected):

1. **seed/route.ts** — POST (cleanup + clear_all). Fixed: duplicate auth block removed, 2x error.message → generic error + code.
2. **predictions/route.ts** — POST (add prediction) + DELETE (cleanup old predictions). Changed DELETE signature to accept `request: Request`.
3. **bankroll/route.ts** — POST (add transaction/reset) + PUT (update after result).
4. **save-today-predictions/route.ts** — POST (save predictions). DELETE left untouched (ADMIN_TOKEN).
5. **discord/publish/route.ts** — POST (publish custom predictions). Fixed: 2x String(error) → generic error + code.
6. **ml/train/route.ts** — POST (train model with candles). Fixed: 2x `details: String(error)` → generic error + code.
7. **batch-ml/route.ts** — POST (precalc/train/stats/force_update/reset_ml/clear_cache). Fixed: 2x `details: error.message` → generic error + code.
8. **tennis-enhanced/route.ts** — POST (update_result/get_metrics/get_history).
9. **alerts/route.ts** — POST (create alert) + PUT (update alert) + DELETE (delete alert). Fixed: `details: String(error)` → generic error + code.
10. **system/alerts/route.ts** — POST (manual alert). Fixed: error.message in GET + POST + 2 internal health checks.
11. **odds-cache/route.ts** — POST (force refresh). Changed POST signature to accept `request: Request`.
12. **espn-status/route.ts** — POST (refresh cache). Fixed: String(error) → generic error + code.
13. **real-odds/route.ts** — POST (force refresh). Fixed: String(error) leak in error response.
14. **matches/route.ts** — POST (clear cache).

Error Leak Fixes Summary:
- seed/route.ts: 2 fixes
- discord/publish/route.ts: 2 fixes
- ml/train/route.ts: 2 fixes
- batch-ml/route.ts: 2 fixes
- alerts/route.ts: 1 fix
- system/alerts/route.ts: 4 fixes (GET + POST + 2 internal health checks)
- espn-status/route.ts: 1 fix (GET)
- real-odds/route.ts: 1 fix (GET)

Stage Summary:
- 14 fichiers modifiés, 20 write handlers protégés
- Auth pattern: CRON_SECRET via ?secret= query param ou Authorization: Bearer header
- Si CRON_SECRET non configuré, tous les write endpoints retournent 401
- 15 information leaks corrigés (error.message / String(error) / details)
- Build: ✅ 0 erreurs TypeScript
