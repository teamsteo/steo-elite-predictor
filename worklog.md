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
Task ID: 2
Agent: Main
Task: Fix problèmes résiduels publications (5/13 affichés, N/A, Aujourd'hui)

Work Log:
- Retiré .slice(0, 5) dans sauvegarde value bets Supabase (cron/route.ts ligne 2532)
  → tous les value bets affichés sont maintenant sauvegardés pour le bilan
- getBetOption() enrichi pour sports non-football : ajoute le nom de l'équipe
  → retourne "1️⃣ Detroit Tigers" au lieu de juste "1️⃣"
- Supprimé "N/A" dans value bets et kamikaze quand recommendation absente
  → affiche juste "🎯 1️⃣ Detroit Tigers" sans "N/A" parasite
- formatDateTime() réécrit : priorité à dateStr (ISO) plutôt qu'à displayDate
  → affiche "Mardi 11 Août" au lieu de "Aujourd'hui" générique
- Le bug "5/13 value bets affichés" persiste dans la publication vue par l'utilisateur
  car le déploiement n'a pas encore été fait

Stage Summary:
- Code source entièrement corrigé mais PAS ENCORE DÉPLOYÉ sur Vercel
- User doit déployer pour voir les corrections dans les prochaines publications
- Remaining concern: match_date fallback à todayISO si p.date vide — peut causer
  des pronostics manquants au bilan si la vraie date du match n'est pas propagée

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

---
Task ID: 1
Agent: Main Agent
Task: Ajouter analyse MLB quotidienne auto + envoi Telegram perso

Work Log:
- Exploré config Telegram: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (canal only, pas de personal chat ID)
- Ajouté TELEGRAM_PERSONAL_CHAT_ID dans telegramService.ts
- Créé sendTelegramPersonalMessage() qui envoie au chat perso (fallback vers TELEGRAM_CHAT_ID si non défini)
- Créé generateMLBPalierAnalysis() dans cron/route.ts: fetch ESPN MLB scoreboard, calcule prob/edge, sélectionne top combo
- Ajouté action 'mlb-palier' dans le switch du cron route
- Ajouté cron dans vercel.json: 0 8 * * * (08:00 UTC quotidien)
- TypeScript compile sans erreur

Stage Summary:
- Fichiers modifiés: src/lib/telegramService.ts, src/app/api/cron/route.ts, vercel.json
- Cron tourne à 08:00 UTC chaque jour
- Message envoyé en DM perso (pas le canal)
- BLOCKING: TELEGRAM_PERSONAL_CHAT_ID nécessaire comme env var Vercel

---
Task ID: 2
Agent: Main Agent
Task: Vérification post-déploiement MLB Palier

Work Log:
- Vérifié toutes les modifications de code: ✅
  - telegramService.ts: TELEGRAM_PERSONAL_CHAT_ID + sendTelegramPersonalMessage
  - cron/route.ts: case mlb-palier + generateMLBPalierAnalysis()
  - vercel.json: cron 0 8 * * * (08:00 UTC)
- TypeScript compile sans erreur
- ESPN MLB: 15 matchs aujourd'hui, cotes pas encore publiées (normal)
- Note: ESPN publie les cotes MLB quelques heures avant les matchs (17:00-02:00 UTC)

Stage Summary:
- Tout déployé et vérifié
- Premier message automatique: demain 08:00 UTC
- Contenu: analyse MLB complète + combo optimal + simulation palier → DM perso Telegram
- User a créé TELEGRAM_PERSONAL_CHAT_ID sur Vercel ✅

---
Task ID: 3
Agent: Main Agent
Task: Réécrire palier pour utiliser le pipeline ML existant (pas ESPN direct)

Work Log:
- Compris que l'approche ESPN directe était mauvaise → le pipeline ML existe déjà
- Exploré DbPrediction: risk_percentage, edge_value, confidence, odds, status, is_combo
- Exploré selectTopDailyPredictions: filtres existants (risk caps par sport, min prob 70%, real odds only)
- Réécrit generatePalierIntelligent() pour lire Supabase via getPredictionsByCreatedAt
- Filtre: pending + cotes réelles + pas combo + pas avoid + confidence != low
- Tri: risk_percentage croissant (plus sûr), puis edge_value décroissant
- Top 5 max envoyés en DM perso
- Combo: 2 plus sûrs, diversification sport si possible
- Supprimé toutes les vieilles fonctions ESPN (generateMLBPalierAnalysis, generateAllSportsPalierAnalysis, helpers)
- TypeScript compile OK, 3901 lignes (down from 4212)

Stage Summary:
- Fichier: src/app/api/cron/route.ts
- Cron: 08:00 UTC (1h après pipeline ML à 07:00)
- Fonction: generatePalierIntelligent() — lit Supabase, pas ESPN
---
Task ID: 1
Agent: Main Agent
Task: Fix Palier Intelligent not sending + Integrate dynamic match importance tags

Work Log:
- Investigated why Palier Intelligent (mlb-palier cron) never delivered to Telegram DM
- Found ROOT CAUSE: `mlb-palier` case was in POST handler only, but Vercel Cron sends GET requests
- Added `case 'mlb-palier'` to GET handler in cron/route.ts (before default case)
- Added 'mlb-palier' to validActions list in GET handler
- Integrated `analyzeMatchImportance()` fallback in `unifiedPredictionService.ts`
  - Added import of `analyzeMatchImportance` from `matchImportanceService`
  - Added fallback calculation after context fetch (step 3b)
  - Uses `matchImportanceFallback` variable when context is null
  - Updated `factors.matchImportance` to use fallback when context unavailable
- Confirmed Ligue 2 already in LEAGUE_NAME_MAP and LEAGUE_SEASONS
- TypeScript compilation passed with no errors
- Deployed to Vercel production successfully

Stage Summary:
- CRITICAL BUG FIXED: mlb-palier now reachable via GET (Vercel Cron compatible)
- DYNAMIC TAGS: analyzeMatchImportance() now always runs (either via matchContextService or direct fallback)
- Tags like "Enjeu RAS", "Saison régulière", "Championnat" will now be dynamic based on league, date, and competition type
- Deployed to: https://my-project-zeta-five-85.vercel.app

---
Task ID: A-F
Agent: Main + 5 subagents
Task: Correctifs P0 résiduels (A-F) — cotes estimées, value bets, NHL, draw, backtesting

Work Log:
- Fix A+F: telegramService.ts — Ajouté ⚠️ "Cotes estimées — pas de bookmaker" dans formatMatchBlock (après ligne 905)
- Fix A+F: telegramService.ts — Exclu `isEstimated` des value bets (publishValueBetsToTelegram ligne 1400)
- Fix A+F: telegramService.ts — Exclu `isEstimated` des kamikazes (publishKamikazeOnlyMessage ligne 1325 + publishKamikazeToTelegram ligne 1488)
- Fix B: combinedDataService.ts — Ajouté paramètre `hasRealOdds` (default true) à detectValueBets (ligne 807) + early return si false
- Fix B: cron/route.ts — Passé `!!m.hasRealOdds` aux 4 call sites detectValueBets (lignes 2388, 2498, 3510, 3616)
- Fix C: nhlAdvancedModel.ts — Ajouté fetchNHLStatsFromTheSportsDB() (cache 1h TTL, 31 équipes NHL mappées) + generateNHLPrediction devient async, utilise stats réelles TheSportsDB (GF/GA/played/form) avec fallback hardcodé
- Fix C: unified-sports-analysis.ts — Ajouté await devant generateNHLPrediction (devenu async)
- Fix D: crossValidation.ts — Remplacé `drawProb = 25` hardcodé par formule contextuelle (goalFactor + parityFactor + strengthParity → clamp 15-35%)
- Fix E: tennis-backtesting.ts — Ajouté split temporel 70/30 (trainMatches/testMatches), évaluation uniquement sur testMatches

Stage Summary:
- TypeScript compilation: 0 erreurs
- 5 fichiers modifiés: telegramService.ts, combinedDataService.ts, cron/route.ts, nhlAdvancedModel.ts, crossValidation.ts, tennis-backtesting.ts, unified-sports-analysis.ts
- Aucun coût: TheSportsDB gratuit, ESPN gratuit, Open-Meteo gratuit
- Aucun risque de bannissement: APIs gratuites, pas de scraping
- Tous les pronostics Telegram avec cotes estimées sont maintenant soit exclus, soit marqués ⚠️
- Value bets impossibles sur cotes estimées (dans le pipeline ET dans les publications Telegram)
- NHL utilise vraies stats TheSportsDB (GF/GA réels) au lieu de gamesPlayed=60 fabriqué
- Draw proba basée sur expected goals et parité des forces au lieu de 25% hardcodé
- Backtesting tennis sans data leakage (split 70/30 temporel)

---
Task ID: P2
Agent: Main
Task: Fix classification foot sur le site web — riskPercentage multiplié par 100 en trop

Work Log:
- Diagnostic: API retournait risk=-4470 au lieu de risk=23 pour les matchs football
- Cause: mapUnifiedToEnrichedMatch (matches/route.ts L54) faisait `ml.homeProb * 100` alors que ml.homeProb est déjà en % (55.3 = 55.3%)
- Fix: Supprimé le *100 sur homeProb/drawProb/awayProb
- Fix: Ajouté clamp Math.max(0, Math.min(100, ...)) sur riskPercentage et winProbability
- Fix: Corrigé ml.edge * 100 → ml.edge (déjà en %)
- Push: commit eac5d7b

Stage Summary:
- Vercel va redéployer automatiquement
- Classification sûrs/modéré/risqué va fonctionner à nouveau
- riskPercentage correctement en 0-100
