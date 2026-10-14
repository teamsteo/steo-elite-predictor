# Documentation du Système ML Unifié

## 📋 Résumé des corrections apportées

### Problèmes identifiés et résolus

1. **Modèle ML volatile sur Vercel**
   - **Problème**: Le modèle ML était stocké en mémoire uniquement sur Vercel (filesystem read-only)
   - **Solution**: Création d'un service ML unifié (`unifiedMLService.ts`) qui persiste le modèle dans Supabase

2. **Synchronisation async/sync rompue**
   - **Problème**: `loadPredictions()` était synchrone mais les données n'étaient chargées qu'asynchronement
   - **Solution**: Toutes les fonctions ML sont maintenant asynchrones et utilisent Supabase directement

3. **Pas d'entraînement automatique**
   - **Problème**: Le cron n'appelait pas l'entraînement ML
   - **Solution**: Ajout de l'action `train-ml` dans le cron et intégration du nouveau service

---

## 🗄️ Tables Supabase créées

Pour que le système fonctionne, exécutez le script SQL dans Supabase:

```
/home/z/my-project/supabase-ml-tables.sql
```

### Tables nécessaires:

| Table | Description |
|-------|-------------|
| `ml_model` | Stocke le modèle ML persistant (seuils, poids, accuracy) |
| `ml_patterns` | Patterns découverts par sport avec taux de succès |
| `ml_picks` | Pronostics générés par le ML |
| `predictions` | Prédictions principales avec résultats |
| `stats_history` | Historique quotidien des performances |

---

## 🔌 APIs utilisées

### APIs Externes

| API | Usage | Endpoint | Coût |
|-----|-------|----------|------|
| **ESPN** | Données sportives temps réel | `site.api.espn.com` | Gratuit |
| | - NBA | `/apis/site/v2/sports/basketball/nba/scoreboard` | |
| | - Football | `/apis/site/v2/sports/soccer/{league}/scoreboard` | |
| | - NHL | `/apis/site/v2/sports/hockey/nhl/scoreboard` | |
| **Supabase** | Base de données persistante | `*.supabase.co` | Plan gratuit |

### APIs Internes

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/cron?action=train-ml` | GET/POST | Entraîne le modèle ML |
| `/api/cron?action=ml-stats` | GET/POST | Statistiques ML |
| `/api/cron?action=verify` | GET/POST | Vérifie les résultats + entraîne |
| `/api/ml/status` | GET | Statut complet du modèle |
| `/api/ml/train-sports` | GET | Entraînement par sport |
| `/api/ml/update-results` | GET | Mise à jour des résultats |

---

## 🧠 Méthodologies de Prédiction

### Football (Soccer)

#### 1. Analyse xG (Expected Goals)
```typescript
// Pattern: xG Differential
if (Math.abs(homeXg - awayXg) >= 0.5) {
  // Le favori xG gagne dans X% des cas
}

// Pattern: Under/Over 2.5
if (homeXg + awayXg < 2.2) {
  // Under 2.5 a plus de chances
}
if (homeXg + awayXg >= 2.8) {
  // Over 2.5 a plus de chances
}
```

#### 2. Analyse des Cotes
```typescript
// Pattern: Favori domicile
if (oddsHome < 1.5) {
  // Victoire domicile plus probable
}
```

#### 3. Seuils adaptatifs ML
- **Edge threshold**: Minimum 3% de valeur pour parier
- **Form weight**: 5% d'impact sur l'ajustement
- **Injury factor**: 1.0x (ajusté automatiquement)

### Basketball (NBA)

#### 1. Avantage Domicile
```typescript
// Les équipes domicile gagnent en moyenne ~60% en NBA
const homeAdvantage = historicalHomeWinRate; // ~60%
```

#### 2. Over/Under Points
```typescript
// Pattern: Over 220 points
if (avgLeagueScoring > 220) {
  // Tendance Over
}
```

#### 3. Net Rating
```typescript
// Différence de net rating entre équipes
const netRatingDiff = homeNetRating - awayNetRating;
if (netRatingDiff > 5) {
  // Avantage significatif domicile
}
```

### Hockey (NHL)

#### 1. Avantage Domicile
- Taux de victoire domicile similaire au basketball (~55-60%)

#### 2. Goalie Matchup
- Analyse du SV% (Save Percentage) des gardiens

#### 3. Corsi/PDO
- **Corsi**: Contrôle de la possession
- **PDO**: Régression vers la moyenne attendue

---

## 🔄 Flux d'Apprentissage

```
┌─────────────────────────────────────────────────────────────┐
│                    FLUX D'APPRENTISSAGE                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. CRON QUOTIDIEN (04h-06h UTC)                             │
│     ├── Vérification des résultats (ESPN)                    │
│     ├── Mise à jour des prédictions                          │
│     └── Entraînement ML (trainUnifiedML)                     │
│                                                              │
│  2. DÉCOUVERTE DE PATTERNS                                   │
│     ├── Analyse des matchs terminés                          │
│     ├── Calcul des taux de succès                            │
│     └── Filtrage du bruit (<55% ignoré)                      │
│                                                              │
│  3. PERSISTENCE SUPABASE                                     │
│     ├── ml_model: Modèle + seuils                            │
│     ├── ml_patterns: Patterns découverts                     │
│     └── predictions: Prédictions avec résultats              │
│                                                              │
│  4. APPLICATION                                              │
│     ├── Chargement des patterns au démarrage                 │
│     ├── Application aux nouveaux matchs                      │
│     └── Ajustement des seuils adaptatifs                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Métriques de Performance

### Seuils de Qualité

| Métrique | Seuil Minimum | Objectif |
|----------|---------------|----------|
| Échantillons pour entraînement | 20 | 100+ |
| Taux de succès pattern | 55% | 65%+ |
| Accuracy globale | 50% | 60%+ |
| Edge minimum | 3% | 5%+ |

### Actions Cron Disponibles

```bash
# Vérification + Entraînement
GET /api/cron?action=verify&secret=CRON_SECRET

# Entraînement ML uniquement
GET /api/cron?action=train-ml&secret=CRON_SECRET

# Statistiques ML
GET /api/cron?action=ml-stats&secret=CRON_SECRET

# Test ESPN
GET /api/cron?action=test-espn&secret=CRON_SECRET
```

---

## 🚀 Déploiement

1. **Exécuter le SQL dans Supabase**
   ```sql
   -- Copier le contenu de supabase-ml-tables.sql
   -- Et l'exécuter dans l'éditeur SQL Supabase
   ```

2. **Variables d'environnement requises**
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_url
   SUPABASE_SERVICE_ROLE_KEY=your_key
   CRON_SECRET=your_secret
   ```

3. **Déployer sur Vercel**
   ```bash
   git add .
   git commit -m "fix: ML learning persistence in Supabase"
   git push
   ```

4. **Configurer les Cron Jobs Vercel** (vercel.json)
   ```json
   {
     "crons": [
       { "path": "/api/cron?action=verify&secret=xxx", "schedule": "0 4 * * *" },
       { "path": "/api/cron?action=train-ml&secret=xxx", "schedule": "0 6 * * *" }
     ]
   }
   ```

---

## ✅ Fichiers Modifiés/Créés

| Fichier | Action |
|---------|--------|
| `src/lib/unifiedMLService.ts` | Créé - Service ML unifié |
| `src/app/api/ml/status/route.ts` | Créé - API statut ML |
| `src/app/api/cron/route.ts` | Modifié - Intégration ML |
| `supabase-ml-tables.sql` | Créé - Script SQL |

---

## 🎯 Prochaines Étapes

1. Exécuter le script SQL dans Supabase
2. Déployer sur Vercel
3. Déclencher manuellement `/api/cron?action=train-ml` pour initialiser
4. Vérifier avec `/api/ml/status` que le modèle est actif
