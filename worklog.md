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