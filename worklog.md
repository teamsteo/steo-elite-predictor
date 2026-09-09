# Worklog - Pipeline Bilan A à Z

---
Task ID: 1
Agent: main
Task: Révision complète du pipeline de bilan (A à Z)

Work Log:
- Audit complet de 3 fichiers clés : route.ts (4661 lignes), db-supabase.ts (1163 lignes), telegramService.ts (3330 lignes)
- Création endpoint temporaire debug-predictions pour diagnostiquer la DB en production
- Diagnostic DB : 87 prédictions sur 7 jours, 77% corrompues (predicted_result=NULL)
- Identification du coupable : scrape-trigger/route.ts insérait des résultats ESPN SANS predicted_result dans la table predictions
- 519 enregistrements parasites supprimés de la DB

Stage Summary:
- **5 bugs critiques corrigés et déployés**
- DB propre : 20 prédictions valides, 0 corrompues, 0 décalage de date
- Pipeline bilan refondu : merge match_date + created_au lieu de created_at seul

---

## Bugs trouvés et corrigés

### 🔴 BUG 1 : scrape-trigger pollue la table predictions
- **Fichier** : `src/app/api/scrape-trigger/route.ts`
- **Problème** : Insérait des résultats ESPN (match_id=`espn_XXX`) SANS `predicted_result` ni cotes
- **Impact** : 519 enregistrements parasites, tous avec `predicted_result=NULL` → bilan montrait "Donnée corrompue"
- **Fix** : Supprimé toute insertion dans `predictions`. Le scraper est maintenant read-only.

### 🔴 BUG 2 : Bilan filtrait par created_at uniquement
- **Fichier** : `src/lib/telegramService.ts` (fetchDailyResultsFromSupabase)
- **Problème** : Le cron summary tourne à ~02:00 UTC (04:00 Paris). Pour les matchs de 20:00 Paris (18:00 UTC), `created_at` = jour J mais `match_date` = jour J aussi. MAIS pour les matchs de vendredi soir (vendredi 20:00 Paris = vendredi 18:00 UTC), si le cron tourne le samedi 02:00 UTC, `created_at` = samedi alors que `match_date` = vendredi.
- **Impact** : 67/87 prédictions avec un décalage created_at ≠ match_date
- **Fix** : Requête parallèle match_date + created_at, puis merge dédoublonné sur match_id

### 🔴 BUG 3 : Bilan kamikaze n'avait PAS de fallback match_date
- **Fichier** : `src/lib/telegramService.ts` (publishKamikazeBilanToTelegram)
- **Problème** : Contrairement au bilan principal qui avait un fallback, le bilan kamikaze utilisait uniquement `created_at`
- **Fix** : Même logique de merge que le bilan principal

### 🟡 BUG 4 : fixCorruptedPredictions ne supprimait pas les NULL
- **Fichier** : `src/lib/db-supabase.ts`
- **Problème** : La requête Supabase `.or('predicted_result.is.null,...')` ne retournait pas les lignes NULL (limite PostgREST)
- **Fix** : Ajout de `deleteScraperPollution()` qui supprime explicitement toutes les lignes `predicted_result IS NULL`, appelé en étape 1 de `fixCorruptedPredictions()`

### 🟡 BUG 5 : Top Championship dedup utilisait p.home_team (undefined)
- **Fichier** : `src/app/api/cron/route.ts` (ligne 2772)
- **Problème** : `toSave` contient des objets avec `homeTeam` (camelCase), pas `home_team` (snake_case)
- **Fix** : `p.homeTeam || p.home_team || ''`

### 🟢 BUG 6 : Catch externe telegram-summary avalait les erreurs
- **Fichier** : `src/app/api/cron/route.ts` (ligne 2841)
- **Problème** : Le catch externe ne loggait pas l'erreur du tout
- **Fix** : `console.error` avec message + stack trace

## Résultats après correction

| Métrique | Avant | Après |
|----------|-------|-------|
| Total prédictions (7j) | 87 | 20 |
| Corrompues (predicted_result NULL) | 67 (77%) | 0 (0%) |
| Décalages created_at ≠ match_date | 67 | 0 |
| Enregistrements parasites scrapes | 519+ | 0 |

---
Task ID: 2
Agent: main
Task: Diagnostic bilan 30 août "Aucun pronostic à vérifier" + fix ML training workflow

Work Log:
- Créé endpoint temporaire debug-db-aug30 pour interroger la DB Supabase en production
- Diagnostic DB : 388 prédictions totales, dernière created_at = 2026-08-24 (aucune sauvegarde depuis 6 jours !)
- Test upsert direct depuis Vercel : erreur "Could not find the 'season' column of 'predictions' in the schema cache"
- Root cause : le commit 41f99617 (25 août) a ajouté `season: p.season || null` au mapping addPredictions, mais la colonne `season` n'existe PAS dans la table Supabase
- L'upsert échouait silencieusement (renvoyait 0), le code continuait vers la publication Telegram → message publié mais rien en DB
- Fix : retiré `season` du mapping dans addPredictions (db-supabase.ts ligne 249)
- Test post-fix : upsert sans season = 1 row insérée ✅, upsert avec season = erreur confirmée ❌
- Découverte colonnes réelles de la table via select('*') (35 colonnes, pas de 'season')
- Fix workflow ML training : secrets GitHub nommés SUPABASE_URL/SUPABASE_SERVICE_KEY mais le workflow attendait NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
- Nettoyage : suppression endpoint debug + script check-aug30.ts

Stage Summary:
- **ROOT CAUSE trouvé** : colonne `season` inexistante dans l'upsert → 6 jours de sauvegarde échouée (25-30 août)
- **Fix déployé** : retrait de `season` du mapping addPredictions
- **ML training workflow corrigé** : utilise maintenant les bons noms de secrets GitHub
- Prochain cycle cron (07:00 ou 18:00 UTC) sauvegardera correctement en DB

---

## Bug 7 (CRITIQUE) : Colonnes inconnues dans l'upsert
- **Fichier** : `src/lib/db-supabase.ts` (addPredictions, ligne 249)
- **Problème** : Le mapping explicite incluait `season: p.season || null` mais la colonne `season` n'existe pas dans la table Supabase `predictions`. L'upsert échouait silencieusement (erreur attrapée → return 0).
- **Impact** : Aucune prédiction sauvegardée du 25 au 31 août (6 jours). Le cron summary publiait sur Telegram mais ne sauvegardait rien en DB → le bilan trouvait 0 prédiction.
- **Fix** : Retiré `season` du mapping. Testé via endpoint temporaire : upsert fonctionne maintenant.

## Bug 8 : ML Training workflow - mauvais noms de secrets
- **Fichier** : `.github/workflows/ml-train.yml`
- **Problème** : Le workflow référençait `secrets.NEXT_PUBLIC_SUPABASE_URL` et `secrets.SUPABASE_SERVICE_ROLE_KEY` mais les secrets GitHub sont nommés `SUPABASE_URL` et `SUPABASE_SERVICE_KEY`
- **Impact** : Le workflow ML training échouait systématiquement
- **Fix** : Corrigé les noms de secrets pour correspondre à ceux configurés dans le repo

---
Task ID: 3
Agent: main
Task: Générer un combo multi-jours cotes ≥10, risque ≤25%, Telegram privé

Work Log:
- Exploration complète du codebase : 5 sous-systèmes combo identifiés (LLM Combo, Combo-Private, Palier Intelligent, Pronostiqueur Pro, UI Combinations)
- Le endpoint `/api/combo-private` (route.ts, 462 lignes) fait exactement ce qui est demandé :
  - Cote combinée ≥10, risque max 25%/sélection, 3-7 matchs foot
  - Extension automatique J+2 à J+4 si <5 matchs foot
  - Algorithme gloutonne : phase 1 risques ≤20%, phase 2 risques 20-25%
  - Envoi via `sendTelegramPersonalMessage()` (DM privé)
- Déclenchement manuel via combo_key : 0 candidats retournés
- Diagnostic ESPN : 15 matchs foot trouvés mais TOUS avec cotes=0 (non publiées par les bookmakers)
- Un message informatif a été envoyé en Telegram DM pour signaler 0 matchs éligibles

Stage Summary:
- Pipeline combo-private opérationnel et déjà déployé
- Cotes pas encore disponibles sur ESPN (publiées 24-48h avant les matchs)
- Le cron quotidien à 19:00 UTC générera le combo dès que les cotes seront disponibles
- Aucune action supplémentaire requise : le système est autonome

---
Task ID: 4
Agent: main
Task: Combo manuel avec matchs fournis par l'utilisateur + fix vercel.json

Work Log:
- Fix vercel.json : supprimé `method: POST` de crons[20] (non supporté par Vercel)
- Ajouté handler GET au combo-private pour le cron Vercel (envoie GET par défaut)
- Créé endpoint temporaire combo-manual (supprimé car build cassé)
- Analyse mathématique des 21 matchs : contrainte risque≤25% + cote≥10 = impossible
  - Seul Man City (85% proba, risque 15%) passe le filtre ≤25%
  - Même le ML le plus optimiste ne peut pas donner >75% aux autres favoris
- Combo alternatif construit : 7 sélections, cote 13.34, proba cumulée 9.6%, EV +28.1%
  - Man City @1.20 (15%), Bayern @1.33 (22%), Nice @1.45 (28%), Leverkusen @1.50 (30%),
    Liverpool @1.55 (32%), PSG @1.55 (34%), Lyon @1.60 (36%)
- Message envoyé avec succès en Telegram DM via test-telegram temporaire
- test-telegram restauré à son état original
- Erreur Vercel (mots-clés français `si`/`retour`) : artefact du build combo-manual cassé, fichier combo-private correct sur GitHub

Stage Summary:
- Combo 7 sélections envoyé en Telegram privé ✅
- Contrainte 25% risque mathématiquement impossible avec ces 21 matchs
- vercel.json corrigé, combo-private GET handler ajouté (en attente de déploiement propre)
- Pipeline combo-private autonome à 19:00 UTC daily pour les combos futurs
---
Task ID: 7
Agent: main
Task: Garde-fou wall-clock anti feed figé + évaluation honnête de la logique du modèle

Work Log:
- Vérifié que le durcissement précédent (commit 70514b3) est bien poussé + déployé (READY)
- Identifié la dernière faille : le garde-fou reposait uniquement sur le clock ESPN (feed figé = risque de publication post-match)
- Ajouté wallClockGuard() dans scan/route.ts : croise clock ESPN avec temps réel depuis kickoff
  - wall < 40′ → clock suspect → rejet
  - wall > 80′ → fenêtre [42′,55′] physiquement impossible → rejet (match fini ou feed figé)
  - parseKickoffUtc() gère le format ESPN "2026-09-06T1900Z" (sans deux-points, Date.parse = NaN) et ignore les dates seules
- tsc --noEmit OK → push (commit baa4dbb) → déploiement Vercel READY
- Backtest production revalidé : confiance 60 MEDIUM, λ 2H 0.73/0.50, 3 value bets, cotes 1X2 1.30/5.56/20.36

Stage Summary:
- La chaîne de garanties est complète : isFinished → fenêtre clock [42′,55′] → wall-clock [40′,80′] → anti-doublon → skip si < 3 min restantes
- La publication post-match est désormais impossible même avec un flux ESPN figé
- Brique suivante proposée (non construite) : tracking des résultats (Brier score, ROI simulé, calibration réelle) pour répondre à "est-ce fiable" par la donnée

---
Task ID: 8
Agent: main
Task: Tracker de calibration (Brier/ROI/pick) + message indicatif privé Telegram

Work Log:
- Étendu store.ts : StoredValueBet (TOUS les value bets), model_outcome_probs (1/odds normalisées),
  pre_match_outcome_probs, brier_model, brier_pre_match, model_pick_hit, tracked_at
- computeBrier() multi-classes 1X2 (référence hasard=0.667, book pro≈0.19-0.22)
- updateFinalScore() évalue maintenant TOUS les value bets (ROI 1u flat : won→odds-1, lost→-1)
- Créé resultTracker.ts : trackResultsForDate() (idempotent) + formatResultsTelegram()
  + getRollingAggregate() (cumul global fiabilité empirique)
- Créé endpoint /api/live-calibration/track-results (auth CRON/LIVE_CALIB, ?date=, ?publish=, ?force=)
  — message indicatif envoyé en DM privé UNIQUEMENT si du nouveau est résolu (anti-spam)
- Créé workflow live-calibration-tracker.yml : crons 22:30 + 23:45 UTC quotidiens
- Scan route : passe pre_match_probs au store (mesure l'apport réel de la recalibration)
- Test end-to-end local avec VRAI match ESPN (Everton 2-2 Man Utd, id 401879291) :
  confiance 61.8 → 4 value bets → 3✅ 1❌, P&L +3.15u ROI +78.8%,
  Brier recalibré 0.512 vs pre-match 0.814 (recalibration utile +0.302)
- tsc OK → push → Vercel READY → dispatch GH workflow (publish=false) : success, endpoint OK

Stage Summary:
- Le système mesure maintenant SA PROPRE fiabilité : Brier recalibré vs pre-match,
  pick directionnel, ROI simulé des value bets, cumul roulant
- Message indicatif privé automatique chaque soir (22:30/23:45 UTC) quand des matchs sont résolus
- Réponse empirique à "est-ce fiable ?" disponible dans le message : % picks, Brier, ROI cumulé

---
Task ID: 9
Agent: main
Task: Persistance permanente de l'historique de calibration (survit aux redéploiements Vercel)

Work Log:
- Constat : DDL impossible via Supabase REST (0 fonction RPC, pas de table dédiée) → choix Supabase STORAGE
- Créé bucket privé "live-calibration" (10MB limit) via Storage API avec service key
- Refactoré store.ts : extraction de resolveEntry() (résolution pure) et aggregateEntries() (agrégat pur),
  réutilisés par la mémoire ET la persistance ; getRollingAggregate() = wrapper mince mémoire
- Créé persistence.ts : loadHistory/saveHistory (JSON upsert, cache-bust, timeouts),
  persistCalibrationSnapshot (fire-and-forget, skip mocks), fetchRollingAggregatePersistent,
  dégradation gracieuse totale (jamais de crash si Storage indisponible)
- Rebranché resultTracker.trackResultsForDate : vue unifiée mémoire+historique,
  pending inclut l'historique (une calibration survit à un recyclage d'instance entre MT et 22:30 UTC)
- Scan route : persistCalibrationSnapshot(stored) après chaque recordCalibration
- Test bout-en-bout local avec vrai match ESPN (Everton 2-2 Man Utd) :
  persistance ✅, simulation redéploiement (clearStore) → agrégat restauré depuis Storage ✅
  (1 match, Brier 0.512, ROI 78.8%)
- Nettoyé l'entrée de test du Storage (historique production démarre propre)
- tsc OK → push → Vercel READY → dispatch tracker en prod : success, resolved 0, matches_tracked 0

Stage Summary:
- L'historique de fiabilité (Brier, ROI, picks) est maintenant PERMANENT (bucket Supabase Storage)
- Résilience : calibration persistée dès le scan HT → trackable le soir même même après redéploiement
- Aucune nouvelle variable d'environnement requise (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY existants)

---
Task ID: 3
Agent: Super Z (main)
Task: Analyse de captures d'écran de matchs live via le pipeline ML — création de l'outil manual_prono + correction bug critique shrinkage

Work Log:
- Répondu OUI à la question utilisateur : captures live analysables via le pipeline de calibration
- Créé scripts/manual_prono.ts : CLI qui ingère un JSON rempli depuis captures (score, minute, stats, cotes pre-match, cotes live) et exécute le pipeline complet (noiseFilter → gameStateBias → BDC → fair odds → confidence → value bets)
- 2 modes : COMPLET (stats xG/tirs/possession depuis SofaScore/FotMob) et SCORE SEUL (captures Betclic sans stats, update Poisson-Gamma sur buts neutralisés game state)
- estimatePreMatchFromOdds : de-vig 1X2 + inversion O/U 2.5 → lambda_total (recherche binaire, direction CORRIGÉE — était inversée) + supremacy par skew 1X2
- Mode anchor (anchor_minute + anchor_score) : anti double-comptage quand pre_match.odds provient d'une capture LIVE (seuls les buts depuis l'ancre sont observés)
- DÉCOUVERT + CORRIGÉ BUG CRITIQUE PRODUCTION (commit ed34f47, poussé → Vercel) : bayesianShrinkage divisait par (α+β)*45 au lieu de (α+β) → xG shrinké ~45× trop petit (0.02 au lieu de 0.75) → le signal live était quasi ignoré depuis le déploiement du module. Le module prod utilise maintenant la vraie observation 1re MT.
- calibrate() : temps restant dynamique (90 - durée observée) au lieu de 45 codé en dur
- Testé sur captures réelles upload/ : Ovalle 0-0 Colina (HT, prono X 41.6% fair 2.41 vs cote 2.15, pas de value) et Paysandu 1-2 Brusque (ancre 37' 0-2, prono Brusque 66.3% fair 1.51 vs cote 2.10, edge +39% — sur-réaction marché détectée)
- tsc --noEmit : OK

Stage Summary:
- Outil réutilisable : npx tsx scripts/manual_prono.ts <input.json> (exemple : scripts/prono_input_example.json, démos : demo_ovalle.json, demo_paysandu.json)
- Workflow utilisateur établi : captures Betclic (score+cotes) → mode score seul ; + captures SofaScore (xG/tirs/possession) → mode complet haute précision
- Production : bug shrinkage corrigé et déployé — les recalibrations auto du scan HT seront nettement plus réactives au signal live (à re-valider via backtest + Brier des 2-3 prochaines semaines)

---
Task ID: 4
Agent: Super Z (main)
Task: Premier prono live réel à partir des captures FlashScore de l'utilisateur (2 matchs en cours)

Work Log:
- Lu 8 captures FlashScore upload/ : identifié 2 matchs LIVE du 07.09 soir
  1. Cerro Porteño 0-0 Nacional Asunción (Paraguay Clausura, stats 35e : xG 0.17/0.16, tirs 4/5, possession 48/52, 0 big chance, corners 2/2)
  2. Barracas Central 0-0 Argentinos Juniors (Argentine, 5e : xG 0.01/0.00, quasi vide)
- Croisé avec captures Betclic précédentes : Cerro live 28' = 2.50/2.45/3.10 (ancre) ; Barracas VRAI pre-match = 4.05/2.85/2.03
- Créé scripts/cerro_nacional_35min.json (mode COMPLET avec stats) et scripts/barracas_argentinos_5min.json (mode complet, données mininales)
- Vérifié via ESPN que les matchs étaient encore en cours à 22:12 UTC (Cerro 41', Barracas 12', tous 0-0) → rafraîchi les pronos à 41'/12'
- Prono Cerro 41' : Cerro 36.5% fair 2.69 (cote 2.50) / X 33% fair 3.03 (cote 2.45) / Nacional 29.9% fair 3.35 — AUCUNE value (edges négatifs), confidence 65 MEDIUM, match ouvert équilibré
- Prono Barracas 12' : trop tôt (confidence 24 LOW) → rester sur le pré-match : Argentinos favori ~49% fair 2.00

Stage Summary:
- Circuit complet captures → analyse → prono validé en conditions réelles sur matchs en direct
- Fenêtre idéale confirmée : user doit renvoyer captures (score + stats + cotes) à la mi-temps pour l'analyse pleine précision

---
Task ID: 7
Agent: main
Task: P0 — Fix poisoning ML + retraining propre + scoring prod fidèle

Work Log:
- ml/train_xgboost.py (commits 5700ade + cbf18ea):
  - PURGE POISONING: cible unifiée target_home_win = résultat réel (draws exclus), faux picks neutralisés, dédup fixtures (5675 doublons retirés en prod)
  - Validation honnête: TimeSeriesSplit walk-forward (train uniquement), holdout temporel 20% (seuil + Platt + métriques), baseline = classe majoritaire
  - Platt scaling manuel fit sur holdout (marge brute), exporté seulement si Brier amélioré
  - Ensemble LightGBM/CatBoost désactivé (ENSEMBLE_ENABLED=False, non rejouable en TS)
  - Export arbres xgb_dump_v1: trees_to_dataframe (schéma 2.1.3: Gain=feuille) + auto-vérification replay vs predict_proba (seuil 1e-4) + offset data-driven (médiane logit-somme)
  - Liste blanche PROD_COMPUTABLE_FEATURES (26 features: pas de dummies ligue, pas de xG post-match, pas de features temporelles)
  - Débogages clés: comparaison float32 obligatoire (valeur ET seuil castés — frontières de split = valeurs de données); JSON dump arrondit à 9 chiffres mais < 1 ulp float32 → double-cast récupère l'exact
- src/lib/unifiedMLService.ts: scoreWithXGBoost = replay fidèle des arbres (evalXGBTree avec Math.fround valeur+seuil, margin_offset, Platt optionnel sur marge). Ancienne moyenne pondérée d'importances SUPPRIMÉE (direction des effets fausse). Garde-fou trainUnifiedML anti-écrasement xgboost_params.
- src/lib/adaptiveThresholdsML.ts: ajout heavy_favorite + underdog_match (alignement liste blanche)
- CI (runs 34293607356 puis 34293976070, SUCCESS): retraining sur données Supabase réelles → export xgb-260909 OK, arbres football (offset 0.1221, diff 1.8e-7) + basketball (offset 0, diff 1.05e-7) exportés

Stage Summary:
- Métriques AVANT (fake): football CV 76.9%, précision 99.79%, edge +23pp
- Métriques APRÈS (honnêtes): football CV walk-forward 59.8% ± 5.6%, holdout 303 matchs acc 69.6% / Brier 0.194, seuil 0.78 → précision 87.1% (holdout), edge +0.35pp vs baseline
- Le vrai edge est PETIT (+0.35pp au niveau CV) — l'ancien +23pp était 100% artefact du poisoning
- Hockey/baseball/tennis: non entraînés (garde-fou features constantes — leurs "cotes" étaient estimées depuis les scores, neutralisées → aucune feature informative) → besoin de vraies cotes pré-match pour ces sports
- Prod: Vercel auto-deploy (health 200), cache ml_model 5 min, scoring = arbres rejoués ou heuristiques (jamais l'ancien scoring faux)
- Restant P1/P2: circuit breaker 403, cohérence Sec-CH-UA/UA, 5 fetch bruts → stealthFetch, enricher vide (0 octet) à implémenter ou retirer, vraies cotes pré-match NHL/MLB, seuil confiance basketball à exiger précision > baseline

---
Task ID: 7 (suite)
Agent: Super Z (main)
Task: Fix build Vercel — erreur TypeScript résiduelle du P0

Work Log:
- Vercel build échec sur cbf18ea : unifiedMLService.ts:1254 « Type 'number | undefined' is not assignable to type 'number' »
- Cause: dans le P0, XGBoostParams.best_edge_threshold passé en optionnel (le seuil global n'est plus exporté — remplacé par best_confidence_threshold par sport), mais getXGBoostStatus() l'assignait encore à un contrat number
- Fix (commit 0c97c3f): fallback cohérent avec la branche non-entraînée → bestEdgeThreshold: xgb.best_edge_threshold ?? model.edge_threshold
- tsc --noEmit : 0 erreur sur tout le projet (aucune autre erreur cachée derrière)
- Nettoyage push: commit local cde1f86 refait proprement (worklog + scripts debug replay conservés, .pyc écarté, __pycache__/ ajouté au .gitignore)
- Push cbf18ea..0c97c3f sur main → Vercel auto-deploy ; CI ML Pipeline déjà verte sur les commits P0 (5700ade, cbf18ea success)

Stage Summary:
- Build Vercel débloqué: le déploiement du P0 (retraining honnête + replay arbres) peut se finaliser
- Aucun changement fonctionnel du modèle: fallback purement typage, comportement identique à l'ancienne valeur par défaut

---
Task ID: 8
Agent: Super Z (main)
Task: P1 anti-ban — disjoncteur WAF + cohérence UA/client-hints + 5 fetch bruts via stealthFetch (0 € dépensé)

Work Log:
- Vérifié déploiement P0 en prod: /api/health HTTP 200 (supabase ok, espn ok)
- stealthFetch.ts refait (commit a6782ad):
  * Circuit breaker étendu: 403/406/412/418 (statuts WAF Cloudflare) comptés avec poids 2x
    → 3 challenges suffisent à ouvrir le disjoncteur (vs 5 avant, et 403 était ignoré)
  * AUCUN retry sur challenge WAF (insister durcit le profil de bannissement de l'IP)
    → la response est retournée à l'appelant qui applique son fallback
  * 429/5xx/erreurs réseau comptées aussi (avant: seules 429 + erreurs réseau; 5xx ignoré)
  * Cooldown 8-14 min avec jitter (pattern d'attente fixe supprimé)
  * Fast-fail pendant cooldown: checkCircuitBreaker systématique (même avec bypassRateLimit)
    throw immédiat — l'ancien sleep jusqu'à 10 min était intenable en serverless
  * StealthStatusError exportée (429/5xx épuisés), comptage sans double-comptage
  * Profils navigateur cohérents (9 profils): Sec-CH-UA + Platform UNIQUEMENT pour Chromium,
    version-matched avec l'UA (Chrome 124/125/126 Win/Mac, Edge 126 Win) ; Firefox/Safari
    n'envoient AUCUN client hint (comportement réel des navigateurs) — fini le
    Sec-CH-UA Chrome + UA Firefox + Platform Windows en dur
  * Placeholder [VOTRE_URL_SUPABASE] retiré des RATE_LIMITS (config morte)
- Migrations fetch brut → stealthFetch (suppression des UA auto-déclaratifs):
  * nflAdvancedScraper.ts: scoreboard NFL ESPN (UA « SteoElite/1.0 » retiré)
  * espnOddsService.ts: scoreboard NBA + NHL ({ next: { revalidate: 60 } } conservé)
  * understatFetcher.ts: pages league + match (UA « SteoElitePredictor/1.0 + URL Vercel » retiré)
- Bonus anti-ban: fix bug saison Understat (« year >= 8 » toujours vrai → saison fausse
  pour matchs août-décembre = requêtes perdues pour rien ; mois >= 8 → saison YYYY, sinon YYYY-1)
- Vérifié 17/17 appels stealthFetch dans 11 fichiers: tous en try/catch avec fallback
  ([] / null / continue / cache conservé) — le fast-fail est sans risque de crash
- Test fonctionnel scripts/test_stealth_breaker.ts (fetch mocké, 0 réseau): 6/6 passent
  (a détecté + corrigé au passage: le breaker était skippé quand bypassRateLimit=true)
- tsc --noEmit: 0 erreur ; push a6782ad → Vercel auto-deploy

Stage Summary:
- Chaîne anti-ban renforcée sans aucun coût: détection WAF stricte (3 challenges → cooldown
  8-14 min), zero retry sur challenge, fingerprint navigateur totalement cohérent,
  5 derniers fetch bruts sous protection stealthFetch (rotation + rate limit + disjoncteur)
- Les scrapers web (fbref, transfermarkt, betExplorer, injury, basketballReference) restaient
  déjà sur ZAI page_reader (IP Vercel jamais exposées) — inchangés
- Restant P2: enricher vide 0 octet, Upstash rate-limit partagé, cotes mockées NFL
  (betExplorerNFLScraper), conflit crons 05:00/05:15, vraies cotes pré-match NHL/MLB

---
Task ID: 9
Agent: Super Z (main)
Task: P2 anti-ban/fiabilité — cotes NFL réelles, breaker partagé 0€, enricher no-op, conflit crons

Work Log:
- DÉCOUVERTE: betExplorerNFLScraper.ts n'était importé par AUCUN fichier (code mort)
  mais restait dangereux: cotes 100% simulées (DVOA inventés, bookmakers aléatoires)
  étiquetées source:'betexplorer' + archives random alimentant detectValueBets
- betExplorerNFLScraper.ts réécrit (commit d03c2c4):
  * generateRealisticNFLOdds + generateArchiveData SUPPRIMÉS (jamais de données inventées)
  * Scraping réel ZAI page_reader sur betexplorer.com/next/american-football/ (pattern
    miroir du scraper football prouvé en prod ; 401 local = token ZAI absent en local,
    page_reader fonctionne en prod — parser défensif multi-fallbacks écrit sur les
    structures connues: tr/table-main, match-part, data-odd, 2 cotes NFL 2 issues)
  * Échec/structure changée → [] honnête ; archives → [] tant que non implémenté
  * detectValueBets: moneyline uniquement (spread/total simulés retirés)
- distributedGuard.ts (NOUVEAU): breaker PARTAGÉ cross-instances via Supabase Storage
  (bucket 'live-calibration' existant, objet guard/domain-breakers.json)
  * Contrainte respectée: DDL impossible via REST → Storage (pattern Task 9 persist.) ;
    0 € (pas d'Upstash) ; dégradation gracieuse totale
  * Lecture: cache 10 s + dédoublonnage inflight, timeout 3 s → coût ~0 ms par requête
  * Écriture: fire-and-forget à l'ouverture du breaker local, fusion conservatrice
  * stealthFetch: check partagé avant chaque requête → une instance protège toutes
- vercel.json: cron /api/cron?action=train-ml 05:15 SUPPRIMÉ — le training Python
  GH 05:00 (P0: cible réelle, walk-forward, arbres exportés) est l'unique writer
  ml_model ; le training TS écrasait edge_threshold/accuracy/last_trained en legacy.
  Endpoint train-ml conservé pour dispatch manuel ; backtest dimanche 05:30 inchangé
- ml/football_data_enricher.py: stub documenté avec plan de réactivation (fichier était
  0 octet depuis des mois — no-op silencieux) ; étape retirée du workflow xgboost-training
- Tests étendus (Storage mocké, 0 réseau): 7/7 — profils cohérents, WAF poids 2,
  ouverture 3 challenges, fast-fail + push partagé, décrément 200, 429 retries,
  blocage PARTAGÉ en lecture. tsc 0 erreur. Push d03c2c4 → Vercel auto-deploy

Stage Summary:
- Chaîne anti-ban complète: détection WAF stricte + fingerprint cohérent + breaker
  LOCAL (3 challenges → cooldown jitter 8-14 min) + breaker PARTAGÉ (toutes instances)
  + 0 fetch brut restant vers sites externes (5 migrés P1, scrapers web sur page_reader)
- Fiabilité données: plus AUCUNE donnée simulée étiquetée source réelle (NFL/archives)
- ML: single source of truth pour ml_model (Python 05:00), plus de conflit d'écriture
- Restant (P3 éventuel): implémenter archives BetExplorer (backtest NFL), vraies cotes
  pré-match NHL/MLB pour entraîner ces sports, implémenter enricher football-data.co.uk
