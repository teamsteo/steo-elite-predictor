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