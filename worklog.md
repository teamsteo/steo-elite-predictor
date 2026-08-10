# Audit Worklog — Cron/Telegram/ML Pipeline

---
Task ID: 1
Agent: Main
Task: Fix 3 issues — bilan multi-sport, dates manquantes, value bet cap

Work Log:
- Issue 1: Créé verifyNHLResults() + fetchNHLResultsFromESPN() dans cron/route.ts
- Issue 1: Separé hockey de verifyMLBResults() (ne filtre plus p.sport==='hockey')
- Issue 1: Ajouté verifyNHLResults() dans verifyAllResults() Promise.all
- Issue 1: Ajouté 'hockey' dans l'union type MatchResult.sport
- Issue 2: Créé computeDateTag() helper — compare date match à aujourd'hui, retourne [DEMAIN] ou [PROCHAIN]
- Issue 2: Remplacé dateTag statique ("aujourd'hui") par computeDateTag(m.date) dans formatMatchBlock
- Issue 2: Ajouté dateTag dynamique dans section value bets et kamikaze
- Issue 2: Ajouté date + heure dans section combo legs
- Issue 3: Supprimé cap Math.min(valueBets.length, 5) → tous les value bets affichés
- Issue 3: Supprimé compteur "X/Y value bets affichés" → affiche maintenant "N opportunités détectées"

Stage Summary:
- Hockey/NHL a maintenant son propre pipeline de vérification ESPN → Supabase
- Tous les sports (football, NBA, MLB, NHL) seront vérifiés et apparaîtront au bilan
- Chaque pronostic affiche la date du match + tag [DEMAIN] si le match est le lendemain
- Section value bets affiche maintenant TOUS les value bets sans plafond
- TypeScript compile sans erreur

---

## Date: $(date -u +%Y-%m-%d)

---

## Priority 1: Security Fixes

### 1.1 telegram/test/route.ts — MISSING AUTH + error.message LEAK
- **Issue**: No auth check on GET /api/telegram/test. Anyone could trigger Telegram messages, wasting API quota.
- **Issue**: `error.message` leaked to user in catch block (line 66).
- **Fix**: Added `timingSafeEqual` import from `@/lib/timingSafeEqual`, added auth check for both query param and Bearer header. Replaced `error.message` with generic `'Erreur interne'`.

### 1.2 cron/route.ts — LOCAL timingSafeEqual WITH LENGTH LEAK
- **Issue**: Defined its own `timingSafeEqual` (lines 41-48) with `if (a.length !== b.length) return false;` which leaks timing information about the secret length.
- **Fix**: Removed local function, imported from `@/lib/timingSafeEqual` (SHA-256 hash-based, constant-time).

### 1.3 cron/route.ts — POST HANDLER HAD NO AUTH
- **Issue**: The POST handler (line 2691) had NO authentication check at all. Anyone could trigger any cron action via POST.
- **Fix**: Added identical auth check to POST handler (query param OR Bearer header, using shared timingSafeEqual).

### 1.4 tennis-auto-publish/route.ts — LOCAL timingSafeEqual
- **Issue**: Same local timingSafeEqual with length leak bug (lines 15-21).
- **Fix**: Replaced with import from `@/lib/timingSafeEqual`.

## Priority 2: Dead Code Removal

### 2.1 cron/route.ts — `insert-july8` one-time hack
- **Issue**: Lines 2581-2653 contained a one-time data insertion for July 8 MLB predictions. This was a manual operation that should not remain in production code. It also referenced `sport: 'other'` (not 'baseball').
- **Fix**: Removed the entire `case 'insert-july8'` block (73 lines).

## Priority 3: Deduplication (CRITICAL)

### 3.1 isDuplicate() function was DEAD CODE
- **Issue**: The `isDuplicate()` function in telegramService.ts existed but was NEVER CALLED by any publish function. This meant duplicate Telegram messages could be sent if cron jobs ran multiple times or were triggered manually.
- **Fix**: Activated isDuplicate() in ALL 7 publish functions:
  - `publishDailySummaryToTelegram` — key: `summary-{MATIN|SOIR}` (slot-aware)
  - `publishKamikazeOnlyMessage` — key: `kamikaze-only`
  - `publishValueBetsToTelegram` — key: `valuebets`
  - `publishKamikazeToTelegram` — key: `kamikaze`
  - `publishDailyResultsToTelegram` — key: `results`
  - `publishKamikazeBilanToTelegram` — key: `kamikaze-bilan`
  - `publishComboToTelegram` — key: `combo-{comboId}`

### 3.2 isDuplicate() improved for MATIN/SOIR distinction
- **Issue**: `telegram-summary` runs at 07:00 (MATIN) and 18:00 (SOIR) — the original isDuplicate would treat them as duplicates since they use the same type key.
- **Fix**: Added optional `slotSuffix` parameter. The summary function passes `slotLabel` (MATIN/SOIR) so both publications are allowed.

## Priority 4: ML Pipeline Fixes

### 4.1 unifiedMLService.ts — ANON KEY FALLBACK
- **Issue**: `SUPABASE_KEY` used `NEXT_PUBLIC_SUPABASE_ANON_KEY` as fallback. The anon key is meant for client-side use and lacks admin privileges needed for server-side ML operations (reading/writing ML patterns table).
- **Fix**: Removed anon key fallback. Now requires `SUPABASE_SERVICE_ROLE_KEY`.

### 4.2 ml-memory-service.ts — ANON KEY FALLBACK
- **Issue**: Same anon key fallback issue.
- **Fix**: Same fix — requires `SUPABASE_SERVICE_ROLE_KEY` only.

### 4.3 dailyPredictionService.ts — fs/path ON VERCEL READ-ONLY FS
- **Issue**: Uses `fs.writeFileSync` and `fs.mkdirSync` which will fail silently on Vercel (read-only filesystem after build).
- **Fix**: Added documentation comment explaining the limitation. Note: this service is NOT used by the main cron pipeline (cron/route.ts uses getMatchesWithRealOdds + unifiedPredictionService directly).

## Priority 5: Logic Consistency

### 5.1 POST telegram-summary — DOUBLE SUPABASE SAVE
- **Issue**: Both GET (cron 07:00/18:00) and POST (manual admin) telegram-summary handlers saved predictions to Supabase. If both ran on the same day, duplicate match_ids would be inserted.
- **Fix**: Removed Supabase save from POST handler. The cron GET handler already saves. Added comment explaining why. The Telegram dedup (isDuplicate) prevents duplicate messages.

## Files Modified
- `src/app/api/telegram/test/route.ts` — auth + error leak fix
- `src/app/api/cron/route.ts` — timingSafeEqual import, POST auth, remove insert-july8, remove POST double-save
- `src/app/api/cron/tennis-auto-publish/route.ts` — timingSafeEqual import
- `src/lib/telegramService.ts` — isDuplicate improved, activated in 7 functions
- `src/lib/unifiedMLService.ts` — remove anon key fallback
- `src/lib/ml-memory-service.ts` — remove anon key fallback
- `src/lib/dailyPredictionService.ts` — document fs/path limitation

## Verification
- `npx tsc --noEmit` — passes with 0 errors

---

## Priority 6: Kamikaze Bilan Bug Fix

### 6.1 DIAGNOSTIC — Kamikaze bilan always shows "aucun match"

**Root Cause Analysis:**
The `publishKamikazeBilanToTelegram()` function queries Supabase for predictions with `risk_percentage > 50` from the previous day. Despite daily kamikaze publications on Telegram, the bilan always returned no matches.

**Investigation findings:**
1. The cron `telegram-summary` at 07:00 UTC saves ONLY safe/moderate predictions (risk ≤ 25-30%). Kamikazes are saved ONLY when `publishedList.length === 0` (fallback mode).
2. The cron `telegram-kamikaze` at 13:00 UTC saves kamikazes. BUT at 13:00 UTC in August, most US matches (MLB, NBA) are already finished, and European football hasn't started yet. ESPN returns very few non-finished matches at this hour.
3. Result: Kamikazes are published on Telegram (the 13:00 cron finds some matches) but NOT saved to Supabase (or saved with wrong match_date).
4. The bilan at 05:30 UTC queries Supabase → finds only safe/moderate predictions → no kamikazes → returns false.
5. Secondary bug: `p.riskPercentage || 50` fallback could incorrectly set risk to 50 (non-kamikaze) when riskPercentage is 0 or NaN.

### 6.2 FIX 1 — Save kamikazes in telegram-summary (cron/route.ts)
- Added kamikaze save logic in the `telegram-summary` GET handler (lines 2039-2078)
- When `publishedList.length > 0` (normal mode with safe/moderate), ALSO save kamikazes separately
- This ensures kamikazes are saved at 07:00 UTC when ESPN data is fresh (MLB night games still available)
- Uses same `isKamikaze()` + `capKamikazePerSport()` + `sortKamikazePicks()` filters

### 6.3 FIX 2 — Replace `|| 50` with `?? 50` (cron/route.ts)
- Changed `risk_percentage: p.riskPercentage || 50` to `risk_percentage: p.riskPercentage ?? 50`
- In 3 locations: summary save, kamikaze GET save, kamikaze POST save
- `??` only triggers on null/undefined, not on 0 or NaN
- Prevents incorrect risk fallback that would mark kamikazes as non-kamikazes

### 6.4 FIX 3 — Add diagnostic logs (telegramService.ts)
- Added detailed logging in `publishKamikazeBilanToTelegram()`:
  - Target date and nextDay
  - Number of predictions found per date
  - Risk breakdown for all non-combo predictions
  - Number of kamikazes after filtering
  - Clear messages when no predictions or no kamikazes found
- Added diagnostic logs in kamikaze save logic (cron/route.ts):
  - Number of kamikazes to save
  - Risk breakdown of first 5 kamikazes
  - Alert when save returns 0 despite having kamikazes

### 6.5 Files Modified
- `src/lib/telegramService.ts` — diagnostic logs in publishKamikazeBilanToTelegram
- `src/app/api/cron/route.ts` — kamikaze save in summary, ?? 50 fix, diagnostic logs

### 6.6 Verification
- `npx tsc --noEmit` — passes with 0 errors
---
Task ID: 10
Agent: main
Task: Implémenter le tracking différencié Value Bets vs Safe bets

Work Log:
- Analysé le système complet: 3 implémentations de detectValueBets (generic 5%, client 3%, tennis 8%)
- Confirmé que la montante n'existe PAS (Kelly est anti-montante: -50% après 3 pertes)
- Ajouté is_value_bet + edge_value dans DbPrediction interface
- Créé getStatsByValueBet(days?) dans db-supabase.ts avec 4 buckets: valueBet, safe, kamikaze, combo
- Modifié 9 blocs de sauvegarde dans cron/route.ts (GET+POST pour summary, valuebets, combo, kamikaze)
- Modifié fetchDailyResultsFromSupabase: accumule vbStats + safeStats pendant le traitement
- Modifié publishDailyResultsToTelegram: section VALUE BET vs SAFE dans le bilan avec ROI comparatif + verdict auto
- Créé endpoint /api/migrate-valuebet pour migration SQL des colonnes
- Combo legs taggués is_value_bet=true automatiquement

Stage Summary:
- TypeScript compilation: 0 erreurs
- Push: commit 6a87989 sur main
- ACTION REQUISE: Exécuter SQL dans Supabase Dashboard pour créer les colonnes:
  ALTER TABLE predictions ADD COLUMN is_value_bet BOOLEAN DEFAULT false;
  ALTER TABLE predictions ADD COLUMN edge_value NUMERIC(8,2) DEFAULT 0;
  CREATE INDEX idx_predictions_is_value_bet ON predictions(is_value_bet);
- Après migration SQL, les prochains crons sauvegarderont is_value_bet + edge_value
- Le bilan affichera la comparaison VB vs Safe avec ROI et verdict
